// First Roll - the app: home, lobby (hero creation), story and battle
// screens, wired to a room. The host's phone runs the room itself (LocalNet)
// and opens it to friends over WebRTC (Host); a friend's phone talks to it
// through RtcNet. Either way this file only sends intents and renders the
// state it is sent.

import { createRoom } from '../game/room.js';
import { Host, LocalNet, RtcNet, onlineSupported, normCode } from '../net/online.js';
import { buildHero, spellList } from '../rules/character.js';
import { CLASSES, SPELLS, MASTERIES, signed } from '../rules/data.js';
import {
  previewMove, reachableSquares, attackOptions, canAttack, canCast, coneTargets, attackFactors,
  hitChance, hitBonus, saveChance, spellAttack, spellDC,
} from '../rules/combat.js';
import { occupantAt, cheb } from '../rules/grid.js';
import { aiNext } from '../rules/ai.js';
import { SCENES } from '../game/campaign.js';
import { createBoard } from './board.js';
import { short, detail, glossaryHtml, esc, ROLLED } from './explain.js';
import { $, ls, showErr, openSheet, closeSheet, show } from './dom.js';
import { sheetHtml } from './sheet.js';
import { openBuilder } from './builder.js';
import { renderStory } from './story.js';

const K = { name: 'fr.name', save: 'fr.save2', solo: 'fr.save2.solo', hostToken: 'fr.token.host', guestToken: 'fr.token.guest', spec: 'fr.lastSpec' };

const app = {
  mode: null, room: null, host: null, net: null, code: null, timer: null,
  me: null, S: null, lastSeq: 0, preview: null, target: null,
  toasts: [], toastBusy: false, wake: null, status: '', reactUntil: 0,
  overlay: null,            // 'build' while the hero builder is open
};
window.__FR = app;   // for the console and tools/e2e.mjs

// Links to glossary entries anywhere on the page.
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-rule]');
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  openSheet(glossaryHtml(a.dataset.rule));
});
$('sheet-x').onclick = closeSheet;
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

const send = (m) => app.net?.send(m);
const myName = () => ($('in-name').value.trim() || ls.get(K.name) || '').slice(0, 20);
const seatMe = () => app.S?.seats.find((s) => s.pid === app.me);
const isHost = () => app.S?.seats[0]?.pid === app.me;
const colorOf = (pid) => app.S?.seats.find((s) => s.pid === pid)?.color;
const heroColors = (S) => Object.fromEntries(S.party.filter((p) => p.controller).map((p) => [p.id, colorOf(p.controller)]));

// --------------------------------------------------------------- home ----
const params = new URLSearchParams(location.search);
$('in-name').value = ls.get(K.name) || '';
const joinParam = normCode(params.get('join'));
if (joinParam.length === 4) {
  $('join-box').classList.remove('hidden');
  $('join-code-show').textContent = joinParam;
  $('in-code').value = joinParam;
}
if (ls.get(K.save)) $('btn-continue').classList.remove('hidden');

function needName() {
  const n = myName();
  if (!n) { $('home-msg').textContent = 'Type your name first.'; $('in-name').focus(); return null; }
  ls.set(K.name, n);
  $('home-msg').textContent = '';
  return n;
}

$('btn-host').onclick = () => { const n = needName(); if (n) startHosting({ name: n, online: true, fresh: true }); };
$('btn-continue').onclick = () => { const n = needName(); if (n) startHosting({ name: n, online: true, fresh: false }); };
$('btn-solo').onclick = () => { const n = needName(); if (n) startHosting({ name: n, online: false, fresh: true }); };
$('btn-join').onclick = () => {
  const n = needName();
  const code = normCode($('in-code').value);
  if (!n) return;
  if (code.length !== 4) { $('home-msg').textContent = 'Party codes are 4 letters.'; return; }
  joinParty(n, code);
};
$('btn-join-link').onclick = () => { const n = needName(); if (n) joinParty(n, joinParam); };
$('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('lnk-credits').onclick = (e) => {
  e.preventDefault();
  openSheet(`<h3>Credits</h3><p>First Roll is an original game. Its rules and monster statistics come from the System Reference Document.</p>
    <p class="rulebox">This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
    available at <a href="https://www.dndbeyond.com/srd" target="_blank" rel="noopener">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the
    Creative Commons Attribution 4.0 International License, available at
    <a href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noopener">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</p>`);
};

// ---------------------------------------------------------- sessions ----
async function startHosting({ name, online, fresh }) {
  const key = online ? K.save : K.solo;
  if (fresh) ls.del(key);
  const store = { load: () => ls.get(key), save: (s) => ls.set(key, s), remove: () => ls.del(key) };
  app.room = createRoom({ store });
  app.timer = setInterval(() => app.room.tick(), 100);
  app.mode = online ? 'host' : 'solo';
  app.code = null;
  app.net = new LocalNet(app.room, onMessage, () => {});
  app.net.connect({ name, token: ls.get(K.hostToken) });
  show('lobby');
  if (online) {
    if (!onlineSupported()) {
      setStatus("This browser can't host online games. Playing solo.");
      app.mode = 'solo';
    } else {
      setStatus('Opening your party…');
      app.host = new Host(app.room, { name, onStatus: (s) => setStatus(s === 'online' ? 'Open: friends can join' : 'Reconnecting to the mailbox…') });
      try {
        app.code = await app.host.start();
        render();
      } catch (e) {
        app.host = null;
        app.mode = 'solo';
        setStatus(`Couldn't open an online party (${e.message}). You can still play solo.`);
      }
    }
  }
  wakeLock();
  render();
}

function joinParty(name, code) {
  app.mode = 'guest';
  app.code = code;
  app.net = new RtcNet(code, onMessage, onGuestStatus);
  app.net.connect({ name, token: ls.get(K.guestToken) });
  show('lobby');
  renderLobbyShell();
}

const GUEST_STATUS = {
  finding: 'Finding the party…', gathering: 'Getting ready…', waiting: "Knocking on the host's door…",
  linking: 'Connecting…', online: 'Connected', offline: 'Reconnecting…',
};
function onGuestStatus(s) {
  if (s === 'noroom') { leave(); $('home-msg').textContent = `No party with the code ${app.code || ''}. Check it with your host.`; return; }
  if (s === 'blocked') {
    setStatus("Can't reach the host's phone from this network. Try another wifi or mobile data.");
    $('net-status').insertAdjacentHTML('beforeend', ' <button class="btn small" id="btn-retry">Retry</button>');
    $('btn-retry').onclick = () => app.net?.retry();
    return;
  }
  setStatus(GUEST_STATUS[s] || s);
}
function setStatus(t) {
  app.status = t;
  const el = $('net-status');
  if (el) el.textContent = t;
}

function leave() {
  clearInterval(app.timer);
  app.host?.stop();
  app.net?.close();
  app.wake?.release?.().catch(() => {});
  Object.assign(app, { mode: null, room: null, host: null, net: null, code: null, timer: null, me: null, S: null, lastSeq: 0, preview: null, target: null, wake: null, overlay: null });
  $('over').classList.add('hidden');
  $('react').classList.add('hidden');
  if (ls.get(K.save)) $('btn-continue').classList.remove('hidden');
  show('home');
}
$('btn-leave').onclick = leave;
window.addEventListener('pagehide', () => app.host?.stopNow());

async function wakeLock() {
  try { app.wake = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.mode && app.mode !== 'guest') wakeLock();
});

// ----------------------------------------------------------- messages ----
function onMessage(m) {
  if (m.t === 'welcome') {
    app.me = m.pid;
    ls.set(app.mode === 'guest' ? K.guestToken : K.hostToken, m.token);
  } else if (m.t === 'state') {
    const prev = app.S;
    app.S = m;
    takeRecords(prev, m);
    if (prev?.control !== m.control && m.control === app.me && m.battle && !m.battle.over) {
      banner('Your turn!');
      navigator.vibrate?.(40);
    }
    render();
  } else if (m.t === 'ping') {
    board.ping(m.x, m.y, colorOf(m.pid) || '#fff');
  } else if (m.t === 'error') {
    showErr(m.text);
  }
}

function takeRecords(prev, S) {
  const b = S.battle;
  if (!b) { app.lastSeq = 0; return; }
  if (b.seq < app.lastSeq || (prev?.battle && prev.battleScene !== S.battleScene) || !prev?.battle) app.lastSeq = 0;
  const fresh = app.lastSeq === 0 && b.seq > 12;          // joined mid-fight: no replay
  const news = b.log.filter((r) => r.seq > app.lastSeq);
  app.lastSeq = b.seq;
  if (fresh) return;
  for (const r of news) {
    if (ROLLED.has(r.kind)) queueToast(r);
    if (r.kind === 'move' || r.kind === 'turn') { app.preview = null; app.target = null; }
    if (r.kind === 'attack' && r.after?.dead) app.target = null;
  }
}

// -------------------------------------------------------------- toasts ----
function queueToast(r) {
  app.toasts.push(r);
  if (app.toasts.length > 4) app.toasts.splice(0, app.toasts.length - 4);
  if (!app.toastBusy) nextToast();
}
function nextToast() {
  const r = app.toasts.shift();
  const t = $('toast');
  if (!r) { app.toastBusy = false; t.classList.add('hidden'); return; }
  app.toastBusy = true;
  const b = app.S?.battle;
  const who = b?.creatures[r.by]?.name || r.name || '';
  const tgt = r.target && b ? b.creatures[r.target]?.name : null;
  t.innerHTML = `<span class="t"><span class="who">${esc(who)}${r.weapon ? ` · ${esc(r.weapon)}` : ''}${tgt && r.target !== r.by ? ` → ${esc(tgt)}` : ''}</span>${short(r, b)}</span><button class="btn">Why?</button>`;
  t.querySelector('.btn').onclick = () => openSheet(detail(r, app.S?.battle));
  t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  setTimeout(nextToast, app.toasts.length ? 1800 : 3400);
}
function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(banner.t);
  banner.t = setTimeout(() => el.classList.add('hidden'), 1700);
}

// -------------------------------------------------------------- render ----
app.render = () => render();
function render() {
  const S = app.S;
  if (!S || app.overlay) return;
  if (S.phase !== 'battle') { $('over').classList.add('hidden'); $('react').classList.add('hidden'); }
  if (S.phase === 'lobby') { show('lobby'); renderLobby(S); }
  else if (S.phase === 'story') {
    show('story');
    renderStoryScreen(S);
  } else { show('battle'); renderBattle(S); }
}

function buildMine(spec) {
  app.overlay = 'build';
  openBuilder({
    spec: spec || ls.json(K.spec), playerName: myName(),
    onDone: (clean) => { send({ t: 'hero', spec: clean }); ls.set(K.spec, JSON.stringify(clean)); app.overlay = null; render(); },
    onCancel: () => { app.overlay = null; render(); },
  });
}

function renderStoryScreen(S) {
  const mine = S.party.some((p) => p.id === app.me);
  const full = S.party.filter((p) => p.controller).length >= 4;
  $('story-join').innerHTML = !mine && !full
    ? '<div class="joinbar">You\'re watching. <button class="btn small primary" id="btn-join-hero">Build a hero and join in</button></div>' : '';
  if ($('btn-join-hero')) $('btn-join-hero').onclick = () => buildMine(null);
  renderStory({ S, me: app.me, isHost: isHost(), send, openSheet });
}

// --------------------------------------------------------------- lobby ----
function renderLobbyShell() {
  $('lobby-code').textContent = app.mode === 'solo' ? 'SOLO' : (app.code || '····');
  $('btn-share').classList.toggle('hidden', !app.code);
  $('net-status').textContent = app.status;
}

function heroSummary(spec, name) {
  const h = buildHero(spec, { name });
  return `<div class="herosum"><span class="em">${h.emoji}</span><span><b>${esc(h.name)}</b><span class="sub">${esc(h.species)} ${esc(h.className)} · ${esc(h.background)}</span>
    <span class="sub">AC ${h.ac} · HP ${h.hpMax} · Speed ${h.speed} ft${h.casting?.slots ? ` · ${h.casting.slots.max} spell slots` : ''}</span></span></div>`;
}

function renderLobby(S) {
  renderLobbyShell();
  const me = seatMe();
  $('seat-list').innerHTML = S.seats.map((s) => {
    const hero = s.spec ? `${CLASSES[s.spec.cls].emoji} ${esc(s.spec.name || s.name)} <span class="dim">${CLASSES[s.spec.cls].name}</span>` : '<span class="dim">no hero yet</span>';
    return `<li class="${s.online ? '' : 'off'}"><span class="dot" style="background:${s.color}"></span>
      <span class="who">${esc(s.name)}${s.pid === app.me ? ' <span class="dim">(you)</span>' : ''}${s.host ? ' 👑' : ''}</span>${hero}</li>`;
  }).join('');

  const full = S.party.filter((p) => p.controller).length >= 4 && !me?.spec;
  $('lobby-chapters').innerHTML = `
    <div class="chcard ${me?.spec ? 'done' : ''}"><div>
      ${me?.spec ? heroSummary(me.spec, me.spec.name || me.name) : `<b>No hero yet</b><span class="sub">${full ? 'The party already has four heroes. You can watch.' : 'Pick a class, background and species, and place your ability scores.'}</span>`}</div>
      <div class="col">${me?.spec ? '<button class="btn small" id="btn-edit">Edit</button><button class="btn small ghost" id="btn-mysheet">Sheet</button>' : full ? '' : '<button class="btn small primary" id="btn-build">Create hero</button>'}</div></div>`;
  if ($('btn-build')) $('btn-build').onclick = () => buildMine(null);
  if ($('btn-edit')) $('btn-edit').onclick = () => buildMine(me.spec);
  if ($('btn-mysheet')) $('btn-mysheet').onclick = () => openSheet(sheetHtml(buildHero(me.spec, { name: me.spec.name || me.name })));

  const comp = S.companions;
  $('party-list').innerHTML = S.party.length ? S.party.map((p) => {
    const c = CLASSES[p.spec.cls];
    return `<button class="pchip" data-psheet="${p.id}" style="border-color:${p.controller ? colorOf(p.controller) : 'var(--line)'}">${c.emoji} ${esc(p.name)} <span class="dim">${c.name}${p.controller ? '' : ' · AI'}</span></button>`;
  }).join('') : '<span class="dim">Nobody yet: build a hero, or add AI companions.</span>';
  for (const el of document.querySelectorAll('[data-psheet]')) {
    el.onclick = () => { const p = S.party.find((x) => x.id === el.dataset.psheet); openSheet(sheetHtml(buildHero(p.spec, { id: p.id, name: p.name }))); };
  }
  $('companions-row').innerHTML = isHost() ? `<span class="host-label">AI companions</span><div class="seg">${['auto', 0, 1, 2, 3].map((n) =>
    `<button data-comp="${n}" class="${String(comp) === String(n) ? 'on' : ''}">${n === 'auto' ? 'Auto' : n}</button>`).join('')}</div>` : '';
  for (const el of document.querySelectorAll('[data-comp]')) el.onclick = () => send({ t: 'companions', n: el.dataset.comp === 'auto' ? 'auto' : +el.dataset.comp });

  $('btn-start').classList.toggle('hidden', !isHost());
  $('btn-start').disabled = !S.party.length;
  $('lobby-wait').classList.toggle('hidden', isHost());
}

$('btn-share').onclick = async () => {
  const url = `${location.origin}${location.pathname}?join=${app.code}${params.get('signal') ? `&signal=${encodeURIComponent(params.get('signal'))}` : ''}`;
  try {
    if (navigator.share) await navigator.share({ title: 'First Roll', text: `Join my First Roll party: ${app.code}`, url });
    else { await navigator.clipboard.writeText(url); showErr('Link copied.'); }
  } catch { /* cancelled */ }
};
$('btn-start').onclick = () => send({ t: 'start' });

// ------------------------------------------------------------- battle ----
const board = createBoard($('board'), onTap);
// After closing the end screen, tapping "Victory!" / "Defeat" brings it back.
$('b-turn').onclick = () => { if (app.S?.battle?.over) { $('over').dataset.dismissed = ''; render(); } };

const myHeroId = () => (app.S?.battle?.creatures[app.me] ? app.me : null);
function myTurn() {
  const S = app.S;
  return !!S?.battle && !S.battle.over && !S.battle.pending && S.control === app.me;
}

function onTap(x, y) {
  const S = app.S;
  const b = S?.battle;
  if (!b) return;
  const occ = occupantAt(b, x, y);
  if (!myTurn()) {
    if (occ) openSheet(sheetHtml(occ));
    else send({ t: 'ping', x, y });
    return;
  }
  const me = b.creatures[myHeroId()];
  if (occ) {
    app.preview = null;
    app.target = app.target === occ.id ? null : occ.id;
    renderBattle(S);
    return;
  }
  const end = app.preview?.path[app.preview.path.length - 1];
  if (end && end.x === x && end.y === y) { doMove(x, y); return; }
  app.target = null;
  app.preview = previewMove(b, me.id, x, y);
  if (!app.preview) send({ t: 'ping', x, y });
  renderBattle(S);
}

function doMove(x, y) {
  send({ t: 'act', intent: { a: 'move', x, y } });
  app.preview = null;
}
const act = (intent) => { send({ t: 'act', intent }); app.target = null; app.preview = null; };
// Test hook: play one step of my turn the way an AI companion would.
app.auto = () => { if (myTurn()) act(aiNext(app.S.battle, myHeroId()) || { a: 'end' }); };

function renderBattle(S) {
  const b = S.battle;
  const cur = b.idx >= 0 ? b.creatures[b.order[b.idx]] : null;
  const mine = myHeroId();
  const mt = myTurn();
  const colors = heroColors(S);

  $('b-round').textContent = `Round ${b.round}`;
  $('b-code').textContent = app.mode === 'solo' ? 'Solo' : (app.code || '');
  const turnEl = $('b-turn');
  turnEl.classList.toggle('me', mt);
  turnEl.textContent = b.over ? (b.over === 'victory' ? 'Victory!' : 'Defeat')
    : mt ? 'Your turn' : `${cur?.name}'s turn${cur?.side === 'hero' && S.control === 'ai' ? ' (AI)' : ''}`;
  document.body.dataset.myturn = mt ? '1' : '';

  $('b-order').innerHTML = b.order.map((id) => {
    const c = b.creatures[id];
    const out = c.dead || (c.side === 'foe' && c.hp <= 0);
    return `<span class="${id === cur?.id ? 'cur' : ''} ${out ? 'out' : ''}" style="${colors[id] ? `border-color:${colors[id]}` : ''}">${c.emoji} ${esc(c.name)}</span>`;
  }).join('');

  board.render({
    b, colors, curId: cur?.id, mine,
    reach: mt && !app.target ? reachableSquares(b, mine) : [],
    preview: mt ? app.preview : null,
    target: mt ? app.target : null,
    cone: mt && app.target ? coneFor(b, b.creatures[mine], b.creatures[app.target]) : null,
  });

  renderPanel(S, b, mine, mt);
  renderLog(b);
  renderReact(S, b);
  renderOver(S, b);
}

// If the hero has a cone (Burning Hands, Breath Weapon), the squares it would cover aimed at T.
function coneFor(b, me, T) {
  if (!me || !T || T === me) return null;
  const hasCone = me.breath?.uses > 0 || spellList(me).some((s) => s.kind === 'cone');
  if (!hasCone) return null;
  return { x: T.x, y: T.y };
}

function renderPanel(S, b, mine, mt) {
  const P = $('panel');
  if (b.over) { P.innerHTML = ''; return; }
  if (!mt) {
    let text;
    if (b.pending && S.reactor === app.me) text = 'Your Reaction: decide below.';
    else if (b.pending) text = `${esc(b.creatures[b.pending.reactor].name)} is deciding on an Opportunity Attack…`;
    else if (!mine) text = "You're watching. Tap a token to see its sheet.";
    else text = `Waiting for ${esc(b.creatures[b.order[b.idx]]?.name)}… Tap a square to ping it for your party.`;
    P.innerHTML = `<div class="waiting">${text}</div>`;
    return;
  }
  const me = b.creatures[mine];
  const t = b.turn;
  const chip = (on, label, rule) => `<span class="chip ${on ? '' : 'used'}">${label}</span>`;
  let html = `<div class="budget">
    ${chip(canAttack(t), 'Action', 'your-turn')}${chip(t.bonus, 'Bonus Action', 'your-turn')}
    ${chip(me.reaction, 'Reaction', 'opportunity-attack')}${chip(t.moveLeft >= 5, `Move ${t.moveLeft} ft`, 'movement')}
    ${me.casting?.slots ? `<span class="chip">Slots ${'●'.repeat(me.casting.slots.left)}${'○'.repeat(me.casting.slots.max - me.casting.slots.left)}</span>` : ''}
    ${me.tempHp ? `<span class="chip">+${me.tempHp} temp HP</span>` : ''}</div>`;
  if (app.target) html += targetCard(b, me, b.creatures[app.target]);
  else if (app.preview) {
    const oa = app.preview.oas.map((id) => esc(b.creatures[id].name)).join(' and ');
    html += `<div class="preview"><span>Move ${app.preview.feet} ft here?${oa ? ` <b class="bad">⚡ ${oa} gets an Opportunity Attack.</b>` : ''} Tap the square again or</span>
      <button class="btn primary" id="btn-move">Move</button><button class="btn ghost" id="btn-cancel">✕</button></div>`;
  }
  const extra = [];
  if (me.secondWind) extra.push(`<button class="btn" data-act="second-wind" ${t.bonus && me.secondWind.uses ? '' : 'disabled'}>Second Wind (${me.secondWind.uses})</button>`);
  if (me.adrenaline) extra.push(`<button class="btn" data-act="adrenaline" ${t.bonus && me.adrenaline.uses ? '' : 'disabled'}>Adrenaline Rush (${me.adrenaline.uses})</button>`);
  html += `<div class="btns">
    <button class="btn" data-act="dash" ${t.action ? '' : 'disabled'}>Dash</button>
    <button class="btn" data-act="disengage" ${t.action ? '' : 'disabled'}>Disengage</button>
    <button class="btn" data-act="dodge" ${t.action ? '' : 'disabled'}>Dodge</button>
    <button class="btn end" data-act="end">End turn</button>
  </div>${extra.length ? `<div class="btns two">${extra.join('')}</div>` : ''}`;
  P.innerHTML = html;
  for (const btn of P.querySelectorAll('[data-act]')) btn.onclick = () => act({ a: btn.dataset.act });
  for (const btn of P.querySelectorAll('[data-intent]')) btn.onclick = () => act(JSON.parse(btn.dataset.intent));
  if ($('btn-move')) $('btn-move').onclick = () => { const e = app.preview.path[app.preview.path.length - 1]; doMove(e.x, e.y); };
  if ($('btn-cancel')) $('btn-cancel').onclick = () => { app.preview = null; renderBattle(app.S); };
  if ($('btn-tx')) $('btn-tx').onclick = () => { app.target = null; renderBattle(app.S); };
  if ($('btn-tinfo')) $('btn-tinfo').onclick = () => openSheet(sheetHtml(b.creatures[app.target]));
}

const reasons = (o) => {
  const bits = [];
  if (o.mode === 'advantage') bits.push(`<b class="good">Advantage</b>: ${o.adv.map((a) => `${esc(a.text)}`).join(', ')}`);
  if (o.mode === 'disadvantage') bits.push(`<b class="bad">Disadvantage</b>: ${o.dis.map((a) => `${esc(a.text)}`).join(', ')}`);
  if (o.adv.length && o.dis.length) bits.push('Advantage and Disadvantage cancel');
  return bits;
};
const intentAttr = (i) => `data-intent='${esc(JSON.stringify(i))}'`;
const row = (label, intent, ok, why, primary = true) =>
  `<div class="opt"><button class="btn ${primary ? 'primary' : ''}" ${intentAttr(intent)} ${ok ? '' : 'disabled'}>${esc(label)}</button><span class="why">${why}</span></div>`;

function spellCost(b, me, sid) {
  const s = SPELLS[sid];
  const c = canCast(b, me, sid);
  if (s.level === 0) return { c, tag: 'cantrip' };
  if (c.pay === 'free') return { c, tag: 'free cast' };
  return { c, tag: `spell slot${s.time === 'bonus' ? ', <b>Bonus Action</b>' : ''}` };
}

function targetCard(b, me, T) {
  const t = b.turn;
  let rows = '';
  const self = T.id === me.id;
  if (T.side === me.side) {
    // Healing and saving friends (or yourself).
    for (const sp of spellList(me)) {
      if (sp.kind !== 'heal' && sp.kind !== 'stabilize') continue;
      if (sp.kind === 'stabilize' && (T.hp > 0 || T.dead || T.stable)) continue;
      const { c, tag } = spellCost(b, me, sp.id);
      const inR = self || cheb(me, T) * 5 <= sp.range;
      const why = !inR ? `Out of range (${sp.range === 5 ? 'touch' : `${sp.range} ft`}).` : c.ok ? `${sp.kind === 'heal' ? `Heals ${sp.dice} + your modifier` : 'Makes them Stable'} · ${tag}` : esc(c.error);
      rows += row(sp.name, { a: 'cast', spell: sp.id, target: T.id }, inR && c.ok, why);
    }
    if (!self && T.hp <= 0 && !T.dead && !T.stable) {
      rows += row('Stabilize', { a: 'stabilize', target: T.id }, t.action && cheb(me, T) <= 1,
        cheb(me, T) <= 1 ? `Help action: DC 10 Wisdom (Medicine) check, you have ${signed(me.skills.medicine)}.` : 'Move next to them first.');
    }
    if (!rows) rows = `<div class="why dim">${self ? 'Nothing to do on yourself right now.' : `${esc(T.name)} is fine.`}</div>`;
    rows += `<div class="opt"><button class="btn small ghost" id="btn-tinfo">${self ? 'My character sheet' : 'Character sheet'}</button></div>`;
  } else {
    for (const o of attackOptions(b, me, T)) {
      const flat = o.atk.dmgFlat.reduce((s, x) => s + x.value, 0);
      const bits = [`${Math.round(o.p * 100)}% to hit`, `${o.atk.dice}${signed(flat)} ${o.atk.type}`, ...reasons(o)];
      if (o.sneak) bits.push(`<b class="good">+${me.sneak} Sneak Attack</b>`);
      if (o.atk.mastery) bits.push(`${MASTERIES[o.atk.mastery].name}`);
      const why = o.ok ? bits.join(' · ') : `Out of ${o.atk.kind === 'melee' ? 'reach: move next to it first' : 'range'}.`;
      rows += row(o.atk.name, { a: 'attack', target: T.id, attack: o.atk.id }, o.ok && canAttack(t), why);
    }
    for (const sp of spellList(me)) {
      if (!['attack', 'save', 'missile', 'cone'].includes(sp.kind)) continue;
      const { c, tag } = spellCost(b, me, sp.id);
      if (sp.kind === 'cone') {
        const hit = coneTargets(b, me, T.x, T.y);
        const pals = hit.filter((x) => x.side === me.side);
        const foes = hit.filter((x) => x.side !== me.side);
        const why = !foes.length ? `Too far: a 15-ft Cone toward ${esc(T.name)} wouldn't reach it. Get within 15 feet.`
          : `15-ft Cone toward ${esc(T.name)}: catches ${hit.map((x) => esc(x.name)).join(', ')}${pals.length ? ` <b class="bad">(including your ally!)</b>` : ''} · DC ${spellDC(me, sp.id)} DEX save, ${sp.dice} ${sp.type}, half on a save · ${tag}`;
        rows += row(sp.name, { a: 'cast', spell: sp.id, x: T.x, y: T.y }, c.ok && foes.length > 0, c.ok ? why : esc(c.error));
        continue;
      }
      const inR = cheb(me, T) * 5 <= sp.range;
      let why;
      if (!inR) why = `Out of range (${sp.range} ft).`;
      else if (!c.ok) why = esc(c.error);
      else if (sp.kind === 'attack') {
        const atk = spellAttack(me, sp.id);
        const f = attackFactors(b, me, T, atk);
        why = [`${Math.round(hitChance(hitBonus(atk), T.ac, f.mode, me.luck) * 100)}% to hit`, `${sp.dice} ${sp.type}`, ...reasons({ ...f, adv: f.adv, dis: f.dis }), tag].join(' · ');
      } else if (sp.kind === 'save') {
        const dc = spellDC(me, sp.id);
        why = `${Math.round((1 - saveChance(b, T, sp.save, dc)) * 100)}% it fails a DC ${dc} ${sp.save.toUpperCase()} save · ${sp.dice} ${sp.type} · ${tag}`;
      } else why = `Never misses · 3 × (1d4 + 1) Force · ${tag}`;
      rows += row(sp.name, { a: 'cast', spell: sp.id, target: T.id }, inR && c.ok, why);
    }
    if (me.breath) {
      const hit = coneTargets(b, me, T.x, T.y);
      const pals = hit.filter((x) => x.side === me.side);
      const ok = me.breath.uses > 0 && canAttack(t) && hit.some((x) => x.side !== me.side);
      const dc = me.breath.dc.reduce((s, p) => s + p.value, 0);
      rows += row(`Breath Weapon (${me.breath.uses})`, { a: 'breath', x: T.x, y: T.y }, ok,
        `Replaces an attack: 15-ft Cone, catches ${hit.map((x) => esc(x.name)).join(', ') || 'nobody (get within 15 feet)'}${pals.length ? ' <b class="bad">(including your ally!)</b>' : ''} · DC ${dc} DEX save, ${me.breath.dice} ${me.breath.type}`);
    }
    if (cheb(me, T) <= 1) {
      rows += row('Help', { a: 'help', target: T.id }, t.action, `Help action: your ally's next attack on ${esc(T.name)} gets Advantage.`, false);
    }
    if (!canAttack(t)) rows += '<div class="why dim">You have already used your action this turn.</div>';
  }
  return `<div class="target ${T.side === me.side ? 'ally' : ''}"><div class="th"><b>${T.emoji} ${esc(T.name)}</b>
    <span>AC ${T.ac} · HP ${T.hp}/${T.hpMax}${T.side !== me.side || !self ? ' <button class="btn small ghost" id="btn-tinfo2">ⓘ</button>' : ''}<button class="btn small ghost" id="btn-tx">✕</button></span></div>${rows}</div>`;
}
document.addEventListener('click', (e) => { if (e.target.id === 'btn-tinfo2' && app.target) openSheet(sheetHtml(app.S.battle.creatures[app.target])); });

function renderLog(b) {
  const L = $('log');
  const nearBottom = L.scrollHeight - L.scrollTop - L.clientHeight < 40;
  const shown = b.log.filter((r) => r.kind !== 'prompt' && r.kind !== 'end-turn');
  L.innerHTML = shown.map((r) => `<li class="k-${r.kind}" data-seq="${r.seq}">${r.kind === 'turn' ? `— ${esc(r.text)}` : esc(r.text)}</li>`).join('');
  for (const li of L.children) {
    li.onclick = () => {
      const r = b.log.find((x) => x.seq === +li.dataset.seq);
      if (r) openSheet(detail(r, b));
    };
  }
  if (nearBottom || L.dataset.n !== String(shown.length)) L.scrollTop = L.scrollHeight;
  L.dataset.n = String(shown.length);
}

function renderReact(S, b) {
  const el = $('react');
  if (!b.pending || S.reactor !== app.me || b.over) { el.classList.add('hidden'); el.dataset.k = ''; return; }
  const R = b.creatures[b.pending.reactor], M = b.creatures[b.pending.mover];
  const k = `${b.seq}`;
  if (el.dataset.k === k) return;
  el.dataset.k = k;
  app.reactUntil = Date.now() + S.reactIn;
  const opt = attackOptions(b, R, M).filter((o) => o.atk.kind === 'melee').sort((p, q) => q.expected - p.expected)[0];
  el.innerHTML = `<h3>⚡ Reaction!</h3>
    <p>${esc(M.name)} is leaving your reach. Use your Reaction for an Opportunity Attack
    with your ${esc(opt.atk.name)} (${Math.round(opt.p * 100)}% to hit)?</p>
    <div class="row"><button class="btn primary" id="btn-react-yes">Attack!</button><button class="btn" id="btn-react-no">Let it go</button></div>
    <div class="timer" id="react-timer"></div>`;
  el.classList.remove('hidden');
  navigator.vibrate?.([30, 40, 30]);
  $('btn-react-yes').onclick = () => { send({ t: 'react', yes: true }); el.classList.add('hidden'); };
  $('btn-react-no').onclick = () => { send({ t: 'react', yes: false }); el.classList.add('hidden'); };
  const total = S.reactIn || 1;
  const tick = () => {
    const left = app.reactUntil - Date.now();
    const bar = $('react-timer');
    if (!bar || el.classList.contains('hidden')) return;
    bar.style.transform = `scaleX(${Math.max(0, left / total)})`;
    if (left > 0) requestAnimationFrame(tick);
  };
  tick();
}

function renderOver(S, b) {
  const el = $('over');
  if (!b.over) { el.classList.add('hidden'); el.dataset.dismissed = ''; return; }
  if (el.dataset.dismissed === String(b.seq)) return;
  if (!el.classList.contains('hidden') && el.dataset.seq === String(b.seq)) return;
  el.dataset.seq = String(b.seq);
  const foes = Object.values(b.creatures).filter((c) => c.side === 'foe');
  const fallen = Object.values(b.creatures).filter((c) => c.side === 'hero' && c.hp <= 0);
  const win = b.over === 'victory';
  const sc = SCENES[S.battleScene];
  const hostBtns = win ? '<button class="btn primary wide" id="btn-cont">Continue the story</button>'
    : '<button class="btn primary wide" id="btn-retry">Try the fight again</button><button class="btn wide" id="btn-lobby">Back to the lobby</button>';
  el.innerHTML = `<div class="card"><div class="logo">${win ? '🏆' : '💀'}</div><h2>${win ? 'Victory!' : 'Defeat'}</h2>
    <p class="dim">${esc(sc?.title || 'The fight')}: ${win ? 'won' : 'lost'} after ${b.round} round${b.round === 1 ? '' : 's'}.${win ? '' : ' Everyone gets back up for another try.'}</p>
    <p>${foes.filter((c) => c.dead).length} of ${foes.length} foes defeated${fallen.length ? ` · ${fallen.map((c) => esc(c.name)).join(', ')} down` : ''}.</p>
    ${isHost() ? hostBtns : '<p class="dim">Waiting for the host…</p>'}
    <button class="btn ghost wide" id="btn-over-log">See the combat log</button></div>`;
  el.classList.remove('hidden');
  if ($('btn-cont')) $('btn-cont').onclick = () => send({ t: 'continue' });
  if ($('btn-retry')) $('btn-retry').onclick = () => send({ t: 'retry' });
  if ($('btn-lobby')) $('btn-lobby').onclick = () => send({ t: 'again' });
  $('btn-over-log').onclick = () => { el.classList.add('hidden'); el.dataset.dismissed = String(b.seq); };
}

