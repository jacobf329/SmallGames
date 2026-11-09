// Drives the character builder with random taps through a stand-in DOM that
// reads the buttons and selects out of the rendered HTML. Every tap is
// followed by a render; any exception, or a finished hero that the rules
// reject, fails the run. Also runs the level-up and Long Rest spell screens.
//
//   node tools/builder-fuzz.mjs [runs]

const RUNS = +(process.argv[2] || 300);

// ------------------------------------------------------------ fake DOM ----
const handlers = new Map();         // element key -> element (so onclick sticks)
class El {
  constructor(id = '', attrs = {}, options = []) {
    this.id = id; this.attrs = attrs; this.options = options;
    this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase()), v]));
    this._html = ''; this.textContent = ''; this.value = options.find((o) => o.selected)?.value ?? options[0]?.value ?? '';
    const cls = new Set();
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => ((on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); parse(this); }
  insertAdjacentHTML(_, h) { this._html += h; parse(this); }
  querySelectorAll(sel) {
    const m = sel.match(/^(\w+)?\[([\w-]+)\]$/);
    if (!m) return [];
    return (this.kids || []).filter((k) => (!m[1] || k.tag === m[1]) && k.attrs[m[2]] !== undefined);
  }
}
const attrsOf = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((x) => [x[1], (x[2] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')]));
function parse(el) {
  el.kids = [];
  for (const m of el._html.matchAll(/<(button|select|input)\b([^>]*)>([\s\S]*?)(?=<\/select>|<\/button>|$)/g)) {
    const attrs = attrsOf(m[2]);
    if ('disabled' in attrs) continue;
    let options = [];
    if (m[1] === 'select') options = [...m[3].matchAll(/<option([^>]*)>([^<]*)/g)].map((o) => { const a = attrsOf(o[1]); return { value: a.value ?? o[2], selected: 'selected' in a, disabled: 'disabled' in a }; }).filter((o) => !o.disabled);
    const k = new El(attrs.id || '', attrs, options);
    k.tag = m[1];
    el.kids.push(k);
    if (attrs.id) handlers.set(attrs.id, k);
  }
}
const fixed = new Map();
globalThis.document = {
  getElementById(id) {
    if (['build-body', 'build-back', 'build-next', 'err', 'sheet', 'sheet-body'].includes(id)) { if (!fixed.has(id)) fixed.set(id, new El(id)); return fixed.get(id); }
    return fixed.get('build-body')?._html.includes(`id="${id}"`) ? handlers.get(id) || null : null;
  },
  querySelectorAll: () => [],
};
globalThis.window = globalThis;
globalThis.scrollTo = () => {};

const { openBuilder } = await import('../src/ui/builder.js');
const { validateSpec, buildHero, defaultSpec, levelChoices, swapLimit, droppedPicks } = await import('../src/rules/character.js');
const { MAX_LEVEL } = await import('../src/rules/data.js');
const { SPECIES, CLASSES, SPELLS } = await import('../src/rules/data.js');

let seed = 1;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
Math.random = rand;
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const body = () => document.getElementById('build-body');
const fails = [];
const stats = { done: 0, taps: 0, methods: new Set(), feats: new Set(), lists: new Set(), paths: new Set() };

function tapSomething() {
  const kids = body().kids.filter((k) => k.tag !== 'input');
  if (!kids.length) return;
  const k = pick(kids);
  stats.taps++;
  if (k.tag === 'select') {
    if (!k.options.length) return;
    k.value = pick(k.options).value;
    k.onchange?.({ target: k });
  } else k.onclick?.();
}

function drive(opts, maxTaps) {
  let out = null, cancelled = false;
  openBuilder({ ...opts, onDone: (s) => { out = s; }, onCancel: () => { cancelled = true; } });
  const next = document.getElementById('build-next'), back = document.getElementById('build-back');
  for (let i = 0; i < maxTaps && !out; i++) {
    const r = rand();
    if (r < 0.12) next.onclick();
    else if (r < 0.15) { back.onclick(); if (cancelled) return { cancelled }; }
    else tapSomething();
    for (const m of body()._html.matchAll(/data-(?:tog|set|sel)="([\w.]+)[:="]/g)) stats.paths.add(m[1]);
    const odd = body()._html.match(/.{0,60}(?:undefined|NaN|\[object).{0,30}/);
    if (odd) throw new Error(`bad text: ${odd[0]}`);
  }
  // Then finish: Next until done, filling a list if a step asks for more.
  for (let i = 0; i < 400 && !out; i++) {
    next.onclick();
    if (out) break;
    const want = body()._html.match(/Pick \d+ more ([a-zA-Z ]+?)s?\./);
    if (want) {
      const togs = body().kids.filter((k) => k.attrs['data-tog'] !== undefined && !/\bon\b/.test(k.attrs.class || ''));
      // Tap the list the message names, where it can be told apart.
      const path = { 'prepared spell': 'prepared', 'spellbook spell': 'book' }[want[1]];
      const mine = path ? togs.filter((k) => k.attrs['data-tog'].startsWith(path + ':')) : [];
      if (mine.length || togs.length) pick(mine.length ? mine : togs).onclick();
    }
  }
  return { out };
}

for (let run = 0; run < RUNS; run++) {
  if (process.env.ONLY && +process.env.ONLY !== run) continue;
  seed = run * 7919 + 13;
  const level = 1 + (run % MAX_LEVEL);
  const cls = Object.keys(CLASSES)[run % Object.keys(CLASSES).length];
  const sp = Object.keys(SPECIES)[Math.floor(run / Object.keys(CLASSES).length) % Object.keys(SPECIES).length];
  try {
    const start = run % 2 ? defaultSpec(cls, { species: sp }) : null;
    const { out, cancelled } = drive({ spec: start, playerName: 'Ana', level }, 60 + (run % 5) * 30);
    if (cancelled) continue;
    if (!out) throw new Error('never finished: ' + (body()._html.match(/Pick[^<]*/)?.[0] || '') + ' ' + (body()._html.match(/class="bad">([^<]*)/)?.[1] || body()._html.match(/class="bt">([^<]*)/)?.[1]));
    const again = validateSpec(out, { level });
    if (JSON.stringify(again) !== JSON.stringify(out)) throw new Error('finished spec changes when checked again');
    const h = buildHero(out, { level });
    stats.done++;
    stats.methods.add(out.method);
    if (out.versatile) stats.feats.add(out.versatile.feat + (out.versatile.list ? `:${out.versatile.list}` : ''));
    for (const f of out.feats || []) stats.feats.add('asi:' + f.feat);
    // The level-up and Long Rest screens.
    const C = CLASSES[out.cls];
    if ((C.spellcasting || levelChoices(out.cls, level + 1).length) && level < MAX_LEVEL) {
      const prior = validateSpec(out, { level });
      const keys = ['cantrips', 'book', 'prepared', 'skills', 'expertise', 'invocations', 'metamagic'];
      const before = Object.fromEntries(keys.map((k) => [k, prior[k]]));
      const check = (what, from, to, when) => {
        for (const k of keys) {
          const n = droppedPicks(to.cls, level + 1, to.land, from[k] || [], to[k] || []).length;
          if (n > swapLimit(to.cls, when, k)) throw new Error(`${what} dropped ${n} ${k}`);
        }
      };
      const up = drive({ spec: out, playerName: 'Ana', level: level + 1, mode: 'levelup', before }, 40);
      if (!up.cancelled) {
        if (!up.out) throw new Error('level-up never finished: ' + (body()._html.match(/class="bad">([^<]*)/)?.[1] || ''));
        check('level-up', before, up.out, 'level');
        stats.lists.add('levelup');
        if (['any', 'one'].includes(C.spellcasting?.change)) {
          const rest = drive({ spec: up.out, playerName: 'Ana', level: level + 1, mode: 'rest' }, 30);
          if (rest.out) {
            if (rest.out.cantrips.join() !== up.out.cantrips.join()) throw new Error('rest changed cantrips');
            if (rest.out.book.join() !== up.out.book.join()) throw new Error('rest changed the book');
            check('rest', up.out, rest.out, 'rest');
            stats.lists.add('rest');
          }
        }
      }
    }
    if (h.casting) for (const sid of Object.keys(h.casting.known)) if (!SPELLS[sid]) throw new Error(`unknown spell ${sid}`);
  } catch (e) {
    fails.push(`run ${run} (${cls} ${sp} L${level}): ${e.stack || e}`);
  }
}
console.log(`${stats.done} heroes built in ${RUNS} runs, ${stats.taps} taps; methods ${[...stats.methods].join(', ')}; human feats ${[...stats.feats].join(', ')}; ${[...stats.lists].join(', ')}; picked ${[...stats.paths].sort().join(' ')}`);
if (fails.length) { console.error(`FAIL: ${fails.length}\n${fails.slice(0, 6).join('\n---\n')}`); process.exit(1); }
console.log('PASS');
