// A browser-free smoke test of the screens: a stand-in DOM (no layout, no
// clicks on generated buttons), a solo party with AI companions, and the
// whole campaign played through the real room. Every state is rendered, and
// on each of the player's turns every target card, the Misty Step picker and
// the character sheets are drawn too. Any exception fails the run.
//
//   node tools/ui-smoke.mjs [class] [species] [--bundle]
//
// --bundle runs the app from dist/first-roll.html (run tools/bundle.mjs first).
//
// It catches broken templates and missing fields; it can't see layout. Use
// tools/e2e.mjs (Playwright) for that.

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const cls = args[0] || 'cleric';
const species = args[1] || 'human';
const fromBundle = process.argv.includes('--bundle');

// ------------------------------------------------------------ fake DOM ----
class El {
  constructor(id = '', tag = 'div') {
    Object.assign(this, { id, tag, value: '', textContent: '', dataset: {}, style: {}, children: [], disabled: false, scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
    this._html = '';
    const cls = new Set();
    this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), toggle: (c, on) => ((on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  insertAdjacentHTML(_, h) { this._html += h; }
  append(...n) { this.children.push(...n); }
  remove() {}
  setAttribute(k, v) { this[`@${k}`] = v; }
  getAttribute(k) { return this[`@${k}`]; }
  addEventListener() {}
  querySelector() { return new El(); }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 400 }; }
  get offsetWidth() { return 0; }
}
const byId = new Map();
globalThis.document = {
  getElementById: (id) => { if (!byId.has(id)) byId.set(id, new El(id)); return byId.get(id); },
  createElementNS: (_, tag) => new El('', tag),
  createElement: (tag) => new El('', tag),
  querySelectorAll: () => [],
  addEventListener() {},
  body: new El('body'),
  visibilityState: 'visible',
};
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.scrollTo = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {}, wakeLock: null }, configurable: true });
globalThis.location = { search: '', origin: 'http://x', pathname: '/' };
globalThis.requestAnimationFrame = () => 0;
let T = 1_000_000;
Date.now = () => T;

const errors = [];
process.on('uncaughtException', (e) => { errors.push(e.stack || String(e)); });

const { defaultSpec } = await import('../src/rules/character.js');
const { SCENES } = await import('../src/game/campaign.js');
const { CLASSES } = await import('../src/rules/data.js');
const { levelChoices } = await import('../src/rules/character.js');
const { sheetHtml } = await import('../src/ui/sheet.js');
const { detail } = await import('../src/ui/explain.js');
if (fromBundle) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const html = fs.readFileSync(new URL('../dist/first-roll.html', import.meta.url), 'utf8');
  const code = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].pop()[1];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-smoke-'));
  const file = path.join(dir, 'app.mjs');
  fs.writeFileSync(file, code);
  await import(file);
} else await import('../src/ui/main.js');
const app = globalThis.__FR;
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((r) => setTimeout(r, 0));
const say = async (m) => { app.net.send(m); await flush(); await flush(); };
const guard = (what, fn) => { try { fn(); } catch (e) { errors.push(`${what}: ${e.stack || e}`); } };

$('in-name').value = 'Ana';
$('btn-solo').onclick();
await flush(); await flush();
await say({ t: 'hero', spec: { ...defaultSpec(cls, { species }), name: 'Ana' } });
await say({ t: 'companions', n: 3 });
await say({ t: 'timer', s: 60 });
guard('lobby', () => app.render());
await say({ t: 'start' });

const counts = { picked: new Set(), renders: 0, cards: 0, aims: 0, turns: 0, fights: 0, retries: 0, scenes: new Set(), records: new Set() };
for (let step = 0; step < 60000 && SCENES[app.S?.story?.scene]?.kind !== 'end'; step++) {
  T += 1000;
  guard('tick', () => app.room.tick());
  await flush(); await flush();
  const S = app.S;
  counts.renders++;
  if (S.phase === 'story') {
    const sc = SCENES[S.story.scene];
    counts.scenes.add(S.story.scene);
    guard(`story ${S.story.scene}`, () => app.render());
    if (sc.kind === 'story') {
      const ch = sc.choices.find((c) => !c.requires || S.flags[c.requires]);
      await say({ t: 'vote', choice: ch.id });
    } else if (sc.kind === 'check' && !S.story.result) {
      if (sc.check.mode === 'single') { await say({ t: 'claim', hero: app.me }); await say({ t: 'roll' }); } else await say({ t: 'roll' });
    } else if (sc.kind === 'save' && !S.story.result) await say({ t: 'roll' });
    else if (sc.kind === 'rest' && sc.rest === 'short' && !S.story.rest.results) { await say({ t: 'hitdie' }); guard('rest', () => app.render()); await say({ t: 'continue' }); }
    else if ((sc.kind === 'level' ? CLASSES[cls].spellcasting || levelChoices(cls, sc.level).length : sc.kind === 'rest' && sc.rest === 'long' && ['any', 'one'].includes(CLASSES[cls].spellcasting?.change)) && !counts.picked.has(S.story.scene)) {
      // The spell screen for a level-up or a Long Rest: open it, take the picks, save.
      counts.picked.add(S.story.scene);
      guard(`spells ${S.story.scene}`, () => app.openSpells(sc.kind === 'level' ? 'levelup' : 'rest'));
      $('err').textContent = '';
      for (let i = 0; i < 4 && app.overlay; i++) guard(`save spells ${S.story.scene}`, () => $('build-next').onclick());
      await flush(); await flush();
      if ($('err').textContent) errors.push(`spell screen at ${S.story.scene}: ${$('err').textContent}`);
      if (app.overlay) errors.push(`spell screen did not close at ${S.story.scene}`);
      await say({ t: 'continue' });
    }
    else await say({ t: 'continue' });
    guard(`story after ${S.story?.scene}`, () => app.render());
    for (const r of Object.values(app.S.story?.check?.rolls || {})) guard('check detail', () => detail(r, null));
    continue;
  }
  const b = S.battle;
  if (!b) continue;
  if (b.over) {
    guard('over', () => app.render());
    for (const r of b.log) { counts.records.add(r.kind + (r.save ? `:${r.save}` : '')); guard(`detail ${r.kind}`, () => detail(r, b)); }
    if (b.over === 'victory') counts.fights++; else counts.retries++;
    if (process.env.SMOKE_DEBUG) console.log('over', S.battleScene, b.over, 'round', b.round, Object.values(b.creatures).filter((c) => c.side === 'hero').map((c) => `${c.name}:${c.hp}`).join(' '), b.log.slice(-4).map((r) => r.text).join(' | '));
    await say({ t: b.over === 'victory' ? 'continue' : 'retry' });
    continue;
  }
  if (b.pending && S.reactor === app.me) { guard('react', () => app.render()); await say({ t: 'react', yes: true }); continue; }
  if (S.control === app.me) {
    counts.turns++;
    for (const c of Object.values(b.creatures)) {
      if (c.side === 'foe' && c.hp <= 0) continue;
      app.target = c.id; counts.cards++;
      guard(`target card ${c.name}`, () => app.render());
      guard(`sheet ${c.name}`, () => sheetHtml(c));
    }
    app.target = null;
    const me = b.creatures[app.me];
    // The spell list, then aiming every spell: tap each creature and a spread
    // of squares once (a second tap on the same one would cast, so none repeat).
    if (me.casting) {
      const net = app.net;
      app.net = { send() {} };
      app.spells = true; guard('spells list', () => app.render()); app.spells = false;
      const { spellAim } = await import('../src/rules/combat.js');
      const aims = Object.keys(me.casting.known).filter((sid) => !['self', 'none'].includes(spellAim(sid).mode)).map((spell) => ({ kind: 'spell', spell }));
      if (me.breath) aims.push({ kind: 'breath', shape: 'cone' }, { kind: 'breath', shape: 'line' });
      if (me.giant?.kind === 'cloud') aims.push({ kind: 'jaunt' });
      if (me.landsAid) aims.push({ kind: 'landsaid' });
      if (b.effects.some((e) => e.type === 'dbreath' && e.target === me.id)) aims.push({ kind: 'exhale' });
      const { metaError } = await import('../src/rules/combat.js');
      for (const a of aims) {
        guard(`aim ${a.spell || a.kind}`, () => app.aimAt(a));
        // A Sorcerer aims with the first Metamagic option that fits, to draw those buttons too.
        const m = a.spell && (me.metamagic || []).find((x) => !metaError(b, me, a.spell, x));
        if (m && app.aim) { app.aim.meta = m; guard(`aim ${a.spell} ${m}`, () => app.render()); }
        const done = new Set();
        const tap = (x, y) => { const k = `${x},${y}`; if (done.has(k) || !app.aim) return; done.add(k); counts.aims++; guard(`aim tap ${a.spell || a.kind} ${k}`, () => app.tap(x, y)); };
        for (const c of Object.values(b.creatures)) if (!(c.side === 'foe' && c.hp <= 0)) tap(c.x, c.y);
        for (let y = 0; y < 10; y += 2) for (let x = 1; x < 8; x += 3) tap(x, y);
        app.aim = null;
      }
      app.net = net;
    }
    guard('panel', () => app.render());
    const { coach } = await import('../src/rules/ai.js');
    const tip = coach(b, app.me);
    $('err').textContent = '';
    await say({ t: 'act', intent: tip?.intent || { a: 'end' } });
    // The Coach must only suggest moves the rules allow.
    if ($('err').textContent) { errors.push(`coach suggested ${JSON.stringify(tip?.intent)}: ${$('err').textContent}`); await say({ t: 'act', intent: { a: 'end' } }); }
  }
}
const end = app.S?.story?.scene;
console.log(`${cls}: reached ${end} at level ${app.S?.level}; ${counts.fights} fights won, ${counts.retries} lost; ${counts.turns} player turns, ${counts.cards} target cards, ${counts.aims} aim taps, ${counts.renders} renders`);
console.log(`spell screens: ${[...counts.picked].join(', ') || 'none'}`);
console.log(`records seen: ${[...counts.records].sort().join(', ')}`);
if (errors.length) { console.error(`FAIL: ${errors.length} errors\n${[...new Set(errors)].slice(0, 8).join('\n---\n')}`); process.exit(1); }
if (SCENES[end]?.kind !== 'end') { console.error('FAIL: did not reach the end'); process.exit(1); }
console.log('PASS');
process.exit(0);
