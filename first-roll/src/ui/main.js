// First Roll - the app: home, lobby (chapters 0 and 1), story and battle
// screens, wired to a room. The host's phone runs the room itself (LocalNet)
// and opens it to friends over WebRTC (Host); a friend's phone talks to it
// through RtcNet. Either way this file only sends intents and renders the
// state it is sent.

import { createRoom } from '../game/room.js';
import { Host, LocalNet, RtcNet, onlineSupported, normCode } from '../net/online.js';
import { buildHero, spellList, PICK_FIELDS } from '../rules/character.js';
import { CLASSES, SPELLS, MASTERIES, METAMAGIC, signed } from '../rules/data.js';
import {
  previewMove, reachableSquares, attackOptions, canAttack, canCast, attackFactors,
  hitChance, hitBonus, saveChance, spellAttack, spellDC, scaled, speedOf, acAgainst,
  spellAim, targetError, pointError, areaSquares, areaTargets, areaLabel, BREATH_AREAS, offhandFor, canTarget,
  smitePay, metaError, spellDCParts,
} from '../rules/combat.js';
import { occupantAt, cheb, lineOfSight, onBoard, W, H } from '../rules/grid.js';
import { coach } from '../rules/ai.js';
import { SCENES } from '../game/campaign.js';
import { createBoard } from './board.js';
import { short, detail, glossaryHtml, rulesSeen, esc, ROLLED } from './explain.js';
import { GLOSSARY } from '../rules/glossary.js';
import { $, ls, showErr, openSheet, closeSheet, show } from './dom.js';
import { sheetHtml } from './sheet.js';
import { openBuilder } from './builder.js';
import { openLesson, LESSON_DONE } from './lesson.js';
import { renderStory } from './story.js';

const K = { name: 'fr.name', save: 'fr.save2', solo: 'fr.save2.solo', hostToken: 'fr.token.host', guestToken: 'fr.token.guest', spec: 'fr.lastSpec', coach: 'fr.coach' };
const coachOn = () => ls.get(K.coach) !== 'off';

const app = {
  mode: null, room: null, host: null, net: null, code: null, timer: null,
  me: null, S: null, lastSeq: 0, preview: null, target: null, aim: null, spells: false, turnEndsAt: 0,
  toasts: [], toastBusy: false, wake: null, status: '', reactUntil: 0,
  overlay: null,            // 'build' | 'lesson' while one of those screens is open
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
$('btn-lesson-home').onclick = () => { app.overlay = 'lesson'; openLesson(() => { app.overlay = null; app.S ? render() : show('home'); }); };

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
    if (r.kind === 'turn') { app.preview = null; app.target = null; app.aim = null; app.spells = false; }
    else if (r.kind === 'move') { app.preview = null; app.target = null; }
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

// Mid-campaign, a new hero is built at the party's level.
const partyLevel = () => (app.S && app.S.phase !== 'lobby' ? app.S.level || 1 : 1);
function buildMine(spec) {
  app.overlay = 'build';
  openBuilder({
    spec: spec || ls.json(K.spec), playerName: myName(), level: partyLevel(),
    onDone: (clean) => { send({ t: 'hero', spec: clean }); ls.set(K.spec, JSON.stringify(clean)); app.overlay = null; render(); },
    onCancel: () => { app.overlay = null; render(); },
  });
}

// A caster's spell picks when gaining a level ('levelup') or after a Long Rest ('rest').
function openSpells(mode) {
  const p = app.S?.party.find((x) => x.id === app.me);
  if (!p) return;
  app.overlay = 'build';
  openBuilder({
    spec: p.spec, playerName: myName(), level: partyLevel(), mode,
    before: mode === 'levelup' ? app.S.story?.levelUp?.find((x) => x.id === app.me)?.was : null,
    onDone: (clean) => { send({ t: 'levelpick', pick: Object.fromEntries(PICK_FIELDS.map((k) => [k, clean[k]])) }); app.overlay = null; render(); },
    onCancel: () => { app.overlay = null; render(); },
  });
}

function renderStoryScreen(S) {
  const mine = S.party.some((p) => p.id === app.me);
  const full = S.party.filter((p) => p.controller).length >= 4;
  $('story-join').innerHTML = !mine && !full
    ? '<div class="joinbar">You\'re watching. <button class="btn small primary" id="btn-join-hero">Build a hero and join in</button></div>' : '';
  if ($('btn-join-hero')) $('btn-join-hero').onclick = () => buildMine(null);
  renderStory({ S, me: app.me, isHost: isHost(), send, openSheet, openRulesBook, openSpells });
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
    <span class="sub">AC ${h.ac} · HP ${h.hpMax} · Speed ${h.speed} ft${h.casting?.slots?.[1] ? ` · ${h.casting.slots[1].max} spell slots` : ''}</span></span></div>`;
}

function renderLobby(S) {
  renderLobbyShell();
  const me = seatMe();
  $('seat-list').innerHTML = S.seats.map((s) => {
    const hero = s.spec ? `${CLASSES[s.spec.cls].emoji} ${esc(s.spec.name || s.name)} <span class="dim">${CLASSES[s.spec.cls].name}</span>` : '<span class="dim">no hero yet</span>';
    return `<li class="${s.online ? '' : 'off'}"><span class="dot" style="background:${s.color}"></span>
      <span class="who">${esc(s.name)}${s.pid === app.me ? ' <span class="dim">(you)</span>' : ''}${s.host ? ' 👑' : ''}</span>${hero}</li>`;
  }).join('');

  const lessonDone = ls.get(LESSON_DONE);
  const full = S.party.filter((p) => p.controller).length >= 4 && !me?.spec;
  $('lobby-chapters').innerHTML = `
    <div class="chcard ${lessonDone ? 'done' : ''}"><div><span class="kicker">Chapter 0</span><b>Rolling the d20</b><span class="sub">Two minutes, on your own phone, while friends join.</span></div>
      <button class="btn small ${lessonDone ? '' : 'primary'}" id="btn-lesson">${lessonDone ? 'Again' : 'Start'}</button></div>
    <div class="chcard ${me?.spec ? 'done' : ''}"><div><span class="kicker">Chapter 1</span><b>Making your hero</b>
      ${me?.spec ? heroSummary(me.spec, me.spec.name || me.name) : `<span class="sub">${full ? 'The party already has four heroes. You can watch, or step in later.' : 'Class, background, species and ability scores, one step at a time.'}</span>`}</div>
      <div class="col">${me?.spec ? '<button class="btn small" id="btn-edit">Edit</button><button class="btn small ghost" id="btn-mysheet">Sheet</button>' : full ? '' : '<button class="btn small primary" id="btn-build">Build</button>'}</div></div>`;
  if ($('btn-lesson')) $('btn-lesson').onclick = () => { app.overlay = 'lesson'; openLesson(() => { app.overlay = null; render(); }); };
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
  if (isHost()) {
    $('companions-row').insertAdjacentHTML('beforeend', `<span class="host-label">Turn timer</span><div class="seg">${[0, 30, 60, 90].map((n) =>
      `<button data-timer="${n}" class="${(S.timer || 0) === n ? 'on' : ''}">${n ? `${n}s` : 'Off'}</button>`).join('')}</div>`);
    for (const el of document.querySelectorAll('[data-timer]')) el.onclick = () => send({ t: 'timer', s: +el.dataset.timer });
  }

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
  if (app.aim) { aimTap(b, me, x, y); return; }
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
const act = (intent) => { send({ t: 'act', intent }); app.target = null; app.preview = null; app.aim = null; app.spells = false; };

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
  app.turnEndsAt = S.turnEndsIn ? Date.now() + S.turnEndsIn : 0;
  turnEl.dataset.base = turnEl.textContent;
  tickClock();
  document.body.dataset.myturn = mt ? '1' : '';

  $('b-order').innerHTML = b.order.map((id) => {
    const c = b.creatures[id];
    const out = c.dead || (c.side === 'foe' && c.hp <= 0);
    return `<span class="${id === cur?.id ? 'cur' : ''} ${out ? 'out' : ''}" style="${colors[id] ? `border-color:${colors[id]}` : ''}">${c.emoji} ${esc(c.name)}</span>`;
  }).join('');

  const tip = mt && coachOn() ? coach(b, mine) : null;
  board.render({
    b, colors, curId: cur?.id, mine,
    picks: mt && app.aim ? aimSquares(b, b.creatures[mine], app.aim) : [],
    area: mt && app.aim ? aimArea(b, b.creatures[mine], app.aim) : [],
    chosen: mt && app.aim ? app.aim.picks : [],
    reach: mt && !app.target && !app.aim && !app.spells ? reachableSquares(b, mine) : [],
    preview: mt ? app.preview : null,
    target: mt ? app.target : null,
    suggest: tip?.intent.a === 'move' && !app.preview && !app.aim ? tip.intent : null,
  });

  renderPanel(S, b, mine, mt, tip);
  renderLog(b);
  renderReact(S, b);
  renderOver(S, b);
}

// The host's turn timer: seconds left on the turn, beside whose turn it is.
function tickClock() {
  const el = $('b-turn');
  if (!el) return;
  const left = app.turnEndsAt ? Math.ceil((app.turnEndsAt - Date.now()) / 1000) : 0;
  el.textContent = left > 0 ? `${el.dataset.base} · ${left}s` : el.dataset.base || el.textContent;
  el.classList.toggle('hurry', left > 0 && left <= 10);
}
setInterval(tickClock, 500);

// Every rule in the game, A to Z (spells separately).
function openRulesBook() {
  const all = Object.entries(GLOSSARY);
  const spells = all.filter(([k]) => SPELLS[k]).sort((p, q) => p[1].title.localeCompare(q[1].title));
  const rules = all.filter(([k]) => !SPELLS[k]).sort((p, q) => p[1].title.localeCompare(q[1].title));
  const chips = (list) => list.map(([k, g]) => `<a class="chip rl" data-rule="${k}">${esc(g.title)}</a>`).join('');
  openSheet(`<h3>📖 Rules book</h3><p class="dim">Every rule the game uses, in plain words. Tap one to read it.</p>
    <h4>Rules</h4><div class="chips">${chips(rules)}</div><h4>Spells</h4><div class="chips">${chips(spells)}</div>`);
}
app.openRulesBook = openRulesBook;
app.tap = (x, y) => onTap(x, y);
app.aimAt = (a) => startAim(app.S.battle, app.S.battle.creatures[myHeroId()], a);
app.openSpells = (mode) => openSpells(mode);
app.buildMine = (spec) => buildMine(spec);

function renderPanel(S, b, mine, mt, tip) {
  const P = $('panel');
  if (b.over) { P.innerHTML = ''; return; }
  if (!mt) {
    let text;
    if (b.pending && S.reactor === app.me) text = 'Your Reaction: decide below.';
    else if (b.pending?.kind === 'shield') text = `${esc(b.creatures[b.pending.reactor].name)} is deciding whether to cast <a class="rl" data-rule="shield">Shield</a>…`;
    else if (b.pending?.kind === 'smite') text = `${esc(b.creatures[b.pending.reactor].name)} is deciding whether to use <a class="rl" data-rule="divine-smite">Divine Smite</a>…`;
    else if (b.pending?.kind === 'rebuke') text = `${esc(b.creatures[b.pending.reactor].name)} is deciding whether to cast <a class="rl" data-rule="hellish-rebuke">Hellish Rebuke</a>…`;
    else if (b.pending) text = `${esc(b.creatures[b.pending.reactor].name)} is deciding on an <a class="rl" data-rule="opportunity-attack">Opportunity Attack</a>…`;
    else if (!mine) text = "You're watching. Tap a token to see its sheet.";
    else text = `Waiting for ${esc(b.creatures[b.order[b.idx]]?.name)}… Tap a square to ping it for your party.`;
    P.innerHTML = `<div class="waiting">${text}</div>`;
    return;
  }
  const me = b.creatures[mine];
  const t = b.turn;
  const chip = (on, label, rule) => `<span class="chip ${on ? '' : 'used'}"><a data-rule="${rule}">${label}</a></span>`;
  const slots = Object.entries(me.casting?.slots || {}).map(([lv, x]) => `L${lv} ${'●'.repeat(x.left)}${'○'.repeat(x.max - x.left)}`).join(' ');
  let html = `<div class="budget">
    ${chip(canAttack(t), 'Action', 'your-turn')}${chip(t.bonus, 'Bonus Action', 'your-turn')}
    ${chip(me.reaction, 'Reaction', 'opportunity-attack')}${chip(t.moveLeft >= 5, `Move ${t.moveLeft} ft`, 'movement')}
    ${slots ? `<span class="chip"><a data-rule="spell-slots">Slots ${slots}</a></span>` : ''}
    ${me.conc ? `<span class="chip"><a data-rule="concentration">🔮 ${esc(SPELLS[me.conc.spell]?.name || '')}</a></span>` : ''}
    ${(me.conds || []).filter((x) => CONDS[x.id]).map((x) => `<span class="chip bad"><a data-rule="${x.id === 'hidden' ? 'hide' : x.id === 'commanded' ? 'command' : x.id}">${CONDS[x.id]}</a></span>`).join('')}
    ${me.tempHp ? `<span class="chip"><a data-rule="temp-hp">+${me.tempHp} temp HP</a></span>` : ''}${resourceChips(b, me)}</div>`;
  if (tip?.text && !app.target && !app.preview && !app.aim && !app.spells) {
    html += `<div class="coachline">💡 <span>${esc(tip.text)}</span><button class="btn" id="btn-coach">Do it</button></div>`;
  }
  if (app.aim) html += aimCard(b, me, app.aim);
  else if (app.spells) html += spellsCard(b, me);
  else if (app.target) html += targetCard(b, me, b.creatures[app.target]);
  else if (app.preview) {
    const oa = app.preview.oas.map((id) => esc(b.creatures[id].name)).join(' and ');
    html += `<div class="preview"><span>Move ${app.preview.feet} ft here?${oa ? ` <b class="bad">⚡ ${oa} gets an <a class="rl" data-rule="opportunity-attack">Opportunity Attack</a>.</b>` : ''} Tap the square again or</span>
      <button class="btn primary" id="btn-move">Move</button><button class="btn ghost" id="btn-cancel">✕</button></div>`;
  } else if (me.casting) {
    html += '<div class="hint">Tap ✨ Spells to cast anything you know, or tap a creature for attacks and quick spells.</div>';
  }
  const extra = [];
  const btn = (label, intent, ok, rule) => `<button class="btn" ${intentAttr(intent)} ${ok ? '' : 'disabled'} title="${esc(GLOSSARY[rule]?.title || '')}">${esc(label)}</button>`;
  const prone = (me.conds || []).some((x) => x.id === 'prone');
  if (prone) extra.push(btn(`Stand up (${Math.floor(speedOf(b, me) / 2)} ft)`, { a: 'stand' }, speedOf(b, me) > 0 && t.moveLeft >= Math.floor(speedOf(b, me) / 2), 'prone'));
  if ((me.conds || []).some((x) => x.id === 'grappled')) extra.push(btn('Escape the grapple', { a: 'escape' }, t.action, 'grappled'));
  if ((me.conds || []).some((x) => x.id === 'restrained' && x.escape)) extra.push(btn('Break free (Athletics)', { a: 'escape' }, t.action, 'restrained'));
  if (me.secondWind) extra.push(btn(`Second Wind (${me.secondWind.uses})`, { a: 'second-wind' }, t.bonus && me.secondWind.uses, 'second-wind'));
  if (me.actionSurge) extra.push(btn(`Action Surge (${me.actionSurge.uses})`, { a: 'surge' }, me.actionSurge.uses && !t.surged, 'action-surge'));
  if (me.adrenaline) extra.push(btn(`Adrenaline Rush (${me.adrenaline.uses})`, { a: 'adrenaline' }, t.bonus && me.adrenaline.uses, 'adrenaline-rush'));
  if (me.steadyAim) extra.push(btn('Steady Aim', { a: 'aim' }, t.bonus && !t.moves && t.moveLeft >= speedOf(b, me), 'steady-aim'));
  if (me.cunning) {
    extra.push(btn('Dash (bonus)', { a: 'dash', bonus: true }, t.bonus, 'cunning-action'));
    extra.push(btn('Disengage (bonus)', { a: 'disengage', bonus: true }, t.bonus, 'cunning-action'));
    extra.push(btn('Hide (bonus)', { a: 'hide', bonus: true }, t.bonus, 'cunning-action'));
  }
  if (me.channel && me.level >= 2 && me.cls === 'cleric') {
    const undead = Object.values(b.creatures).some((c) => c.side !== me.side && c.creature === 'undead' && c.hp > 0 && cheb(me, c) * 5 <= 30);
    extra.push(btn(`Turn Undead (${me.channel.uses})`, { a: 'turn' }, t.action && !t.magicUsed && me.channel.uses && undead, 'turn-undead'));
    if (me.preserveLife) extra.push(btn(`Preserve Life (${me.channel.uses})`, { a: 'preserve' }, t.action && !t.magicUsed && me.channel.uses, 'preserve-life'));
  }
  if (me.breath) {
    const ok = me.breath.uses > 0 && canAttack(t);
    extra.push(`<button class="btn" data-aim='${esc(JSON.stringify({ kind: 'breath', shape: 'cone' }))}' ${ok ? '' : 'disabled'} title="Breath Weapon">Breath: Cone (${me.breath.uses})</button>`);
    extra.push(`<button class="btn" data-aim='${esc(JSON.stringify({ kind: 'breath', shape: 'line' }))}' ${ok ? '' : 'disabled'} title="Breath Weapon">Breath: Line (${me.breath.uses})</button>`);
  }
  if (me.giant?.kind === 'cloud') {
    extra.push(`<button class="btn" data-aim='${esc(JSON.stringify({ kind: 'jaunt' }))}' ${me.giant.uses > 0 && t.bonus ? '' : 'disabled'} title="Cloud's Jaunt">Cloud's Jaunt (${me.giant.uses})</button>`);
  }
  classButtons(b, me, extra, btn);
  html += `${me.casting ? `<div class="btns one"><button class="btn spellsbtn ${app.spells ? 'on' : ''}" id="btn-spells">✨ Spells</button></div>` : ''}<div class="btns">
    <button class="btn" data-act="dash" ${t.action ? '' : 'disabled'}>Dash</button>
    <button class="btn" data-act="disengage" ${t.action ? '' : 'disabled'}>Disengage</button>
    <button class="btn" data-act="dodge" ${t.action ? '' : 'disabled'}>Dodge</button>
    <button class="btn" data-act="hide" ${t.action ? '' : 'disabled'}>Hide</button>
    <button class="btn end" data-act="end">End turn</button>
  </div>${extra.length ? `<div class="btns two">${extra.join('')}</div>` : ''}
  <div class="panel-foot"><button class="btn small ghost" id="btn-coach-toggle">💡 Tips ${coachOn() ? 'on' : 'off'}</button><button class="btn small ghost" id="btn-rules">📖 Rules</button></div>`;
  P.innerHTML = html;
  for (const el of P.querySelectorAll('[data-act]')) el.onclick = () => act({ a: el.dataset.act });
  for (const el of P.querySelectorAll('[data-intent]')) el.onclick = () => act(JSON.parse(el.dataset.intent));
  for (const el of P.querySelectorAll('[data-aim]')) el.onclick = () => startAim(b, me, JSON.parse(el.dataset.aim));
  if ($('btn-spells')) $('btn-spells').onclick = () => { app.spells = !app.spells; app.aim = null; app.target = null; app.preview = null; renderBattle(app.S); };
  if ($('btn-aim-x')) $('btn-aim-x').onclick = () => { app.aim = null; renderBattle(app.S); };
  if ($('btn-aim-undo')) $('btn-aim-undo').onclick = () => { app.aim.picks.pop(); renderBattle(app.S); };
  if ($('btn-aim-go')) $('btn-aim-go').onclick = () => castAim(b, me);
  for (const el of P.querySelectorAll('[data-aimslot]')) el.onclick = () => { app.aim.slot = +el.dataset.aimslot; trimPicks(b, me); renderBattle(app.S); };
  for (const el of P.querySelectorAll('[data-aimmeta]')) el.onclick = () => { app.aim.meta = app.aim.meta === el.dataset.aimmeta ? null : el.dataset.aimmeta; trimPicks(b, me); renderBattle(app.S); };
  for (const el of P.querySelectorAll('[data-aimtype]')) el.onclick = () => { app.aim.toType = el.dataset.aimtype; renderBattle(app.S); };
  if ($('btn-coach')) $('btn-coach').onclick = () => act(tip.intent);
  if ($('btn-move')) $('btn-move').onclick = () => { const e = app.preview.path[app.preview.path.length - 1]; doMove(e.x, e.y); };
  if ($('btn-cancel')) $('btn-cancel').onclick = () => { app.preview = null; renderBattle(app.S); };
  if ($('btn-tx')) $('btn-tx').onclick = () => { app.target = null; renderBattle(app.S); };
  if ($('btn-tinfo')) $('btn-tinfo').onclick = () => openSheet(sheetHtml(b.creatures[app.target]));
  $('btn-coach-toggle').onclick = () => { ls.set(K.coach, coachOn() ? 'off' : 'on'); renderBattle(app.S); };
  $('btn-rules').onclick = openRulesBook;
}

const CONDS = { prone: 'Prone', restrained: 'Restrained', grappled: 'Grappled', frightened: 'Frightened', poisoned: 'Poisoned',
  paralyzed: 'Paralyzed', incapacitated: 'Incapacitated', hidden: 'Hidden', commanded: 'Commanded', unconscious: 'Unconscious' };

// Uses left of each class resource, as chips beside the Action and slots.
function resourceChips(b, me) {
  const out = [];
  const c = (label, rule, bad = false) => out.push(`<span class="chip ${bad ? 'used' : ''}"><a data-rule="${rule}">${label}</a></span>`);
  if (me.raging) c('🔥 Raging', 'rage');
  else if (me.rage) c(`Rage ${me.rage.uses}`, 'rage', !me.rage.uses);
  if (me.bardic) c(`Inspiration ${me.bardic.uses}`, 'bardic-inspiration', !me.bardic.uses);
  if (me.bardicDie) c(`🎵 d${me.bardicDie.die}`, 'bardic-inspiration');
  if (me.shape) c('🐺 Wolf form', 'wild-shape');
  else if (me.wildShape) c(`Wild Shape ${me.wildShape.uses}`, 'wild-shape', !me.wildShape.uses);
  if (me.focus) c(`Focus ${me.focus.uses}/${me.focus.max}`, 'monks-focus', !me.focus.uses);
  if (me.layOnHands) c(`Lay on Hands ${me.layOnHands.uses}`, 'lay-on-hands', !me.layOnHands.uses);
  if (me.sorcery) c(`Sorcery ${me.sorcery.uses}/${me.sorcery.max}`, 'font-of-magic', !me.sorcery.uses);
  if (me.innateOn) c('✨ Innate Sorcery', 'innate-sorcery');
  if (me.sacredOn) c('✨ Sacred Weapon', 'sacred-weapon');
  const mk = b.effects.find((e) => e.type === 'mark' && e.by === me.id);
  if (mk) c(`🎯 ${esc(mk.name)}: ${esc(b.creatures[mk.target]?.name || '')}`, mk.spell);
  return out.join('');
}

// The buttons for class features that need no target.
function classButtons(b, me, extra, btn) {
  const t = b.turn;
  const aimBtn = (label, a, ok, title) => extra.push(`<button class="btn" data-aim='${esc(JSON.stringify(a))}' ${ok ? '' : 'disabled'} title="${esc(title)}">${esc(label)}</button>`);
  if (me.rage) extra.push(btn(me.raging ? 'Keep raging' : `Rage (${me.rage.uses})`, { a: 'rage' }, t.bonus && (me.raging || me.rage.uses > 0), 'rage'));
  if (me.reckless) {
    const on = b.effects.some((e) => e.type === 'reckless' && e.by === me.id);
    extra.push(btn(on ? 'Reckless (on)' : 'Reckless Attack', { a: 'reckless' }, !on && !t.rolled && canAttack(t), 'reckless-attack'));
  }
  if (me.wildShape) {
    if (me.shape) extra.push(btn('Leave Wolf form', { a: 'unshape' }, t.bonus, 'wild-shape'));
    else extra.push(btn(`Wild Shape: Wolf (${me.wildShape.uses})`, { a: 'shape' }, t.bonus && me.wildShape.uses > 0, 'wild-shape'));
  }
  if (me.landsAid) aimBtn("Land's Aid", { kind: 'landsaid' }, t.action && !t.magicUsed && me.wildShape?.uses > 0 && !me.shape, "Land's Aid");
  if (me.focus) {
    const fp = me.focus.uses > 0;
    extra.push(btn('Patient Defense', { a: 'patient' }, t.bonus, 'monks-focus'));
    extra.push(btn('Patient Defense + Dodge (1 Focus)', { a: 'patient', focus: true }, t.bonus && fp, 'monks-focus'));
    extra.push(btn('Step of the Wind', { a: 'stepwind' }, t.bonus, 'monks-focus'));
    extra.push(btn('Step of the Wind + Disengage (1 Focus)', { a: 'stepwind', focus: true }, t.bonus && fp, 'monks-focus'));
  }
  if (me.sacredWeapon) extra.push(btn(me.sacredOn ? 'Sacred Weapon (on)' : `Sacred Weapon (${me.channel?.uses || 0})`, { a: 'sacred' }, !me.sacredOn && canAttack(t) && me.channel?.uses > 0, 'sacred-weapon'));
  if (me.innate) extra.push(btn(me.innateOn ? 'Innate Sorcery (on)' : `Innate Sorcery (${me.innate.uses})`, { a: 'innate' }, !me.innateOn && t.bonus && me.innate.uses > 0, 'innate-sorcery'));
  if (me.sorcery) {
    const sp = me.sorcery;
    for (const [lv, sl] of Object.entries(me.casting?.slots || {})) {
      if (sl.left > 0) extra.push(btn(`Level ${lv} slot → ${lv} Sorcery`, { a: 'font', mode: 'burn', level: +lv }, sp.uses < sp.max, 'font-of-magic'));
    }
    extra.push(btn('2 Sorcery → level 1 slot', { a: 'font', level: 1 }, t.bonus && sp.uses >= 2, 'font-of-magic'));
    if (me.level >= 3) extra.push(btn('3 Sorcery → level 2 slot', { a: 'font', level: 2 }, t.bonus && sp.uses >= 3, 'font-of-magic'));
  }
  if (b.effects.some((e) => e.type === 'dbreath' && e.target === me.id)) aimBtn("Dragon's Breath: exhale", { kind: 'exhale' }, t.action && !t.magicUsed, "Dragon's Breath");
}

// ------------------------------------------------------------ aiming ----
// Casting works like the 2024 rules: pick a spell, then aim it the way its
// text says. app.aim = { kind: 'spell'|'breath'|'jaunt', spell, slot, picks, point, err }.
function aimOf(a) {
  if (a.kind === 'breath') return { mode: 'area', ...BREATH_AREAS[a.shape], range: 0 };
  if (a.kind === 'jaunt') return { mode: 'point', range: 30 };
  if (a.kind === 'landsaid') return { mode: 'area', shape: 'sphere', size: 10, from: 'point', range: 60 };
  if (a.kind === 'exhale') return { mode: 'area', shape: 'cone', size: 15, from: 'self', range: 0 };
  return spellAim(a.spell, a.slot, a.meta || null);
}
const OTHER_AIMS = { landsaid: { name: "Land's Aid", rule: 'lands-aid', go: 'Use' }, exhale: { name: "Dragon's Breath", rule: 'dragons-breath', go: 'Exhale' } };
const aimName = (me, a) => (a.kind === 'breath' ? `Breath Weapon (${a.shape === 'line' ? '30-ft Line' : '15-ft Cone'})` : a.kind === 'jaunt' ? "Cloud's Jaunt" : OTHER_AIMS[a.kind]?.name || SPELLS[a.spell].name);

function startAim(b, me, a) {
  const aim = { picks: [], point: null, err: null, ...a };
  if (aim.kind === 'spell') {
    const c = canCast(b, me, aim.spell, aim.slot || 0);
    aim.slot = c.ok ? c.slot : aim.slot || SPELLS[aim.spell].level;
    if (aimOf(aim).mode === 'self') { act({ a: 'cast', spell: aim.spell, slot: aim.slot }); return; }
  }
  app.target = null; app.preview = null; app.spells = false;
  app.aim = aim;
  if (aim.point && pointError(b, me, aimOf(aim), aim.point.x, aim.point.y)) aim.point = null;
  renderBattle(app.S);
}

// Squares to highlight: the creatures it can target, or the squares it can go.
function aimSquares(b, me, a) {
  const aim = aimOf(a);
  const out = [];
  if (['creature', 'split', 'group'].includes(aim.mode)) {
    for (const c of Object.values(b.creatures)) if (!targetError(b, me, c, a.spell, aim)) out.push({ x: c.x, y: c.y });
    return out;
  }
  if (aim.mode === 'area' && aim.from === 'self') return [];     // any square gives a direction
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!pointError(b, me, aim, x, y)) out.push({ x, y });
  return out;
}
function aimArea(b, me, a) {
  const aim = aimOf(a);
  if (aim.mode !== 'area' || !a.point) return [];
  return areaSquares(b, me, aim, a.point.x, a.point.y);
}
function trimPicks(b, me) {
  const aim = aimOf(app.aim);
  if (aim.n) app.aim.picks = app.aim.picks.slice(0, aim.n);
}

function aimTap(b, me, x, y) {
  const a = app.aim;
  const aim = aimOf(a);
  a.err = null;
  if (['creature', 'split', 'group'].includes(aim.mode)) {
    const occ = occupantAt(b, x, y);
    const e = occ ? targetError(b, me, occ, a.spell, aim) : 'Tap a creature.';
    if (e) { a.err = e; renderBattle(app.S); return; }
    if (aim.mode === 'creature') {
      if (a.picks[0] === occ.id) { castAim(b, me); return; }
      a.picks = [occ.id];
    } else if (aim.mode === 'split') {
      if (a.picks.length < aim.n) a.picks.push(occ.id);
      else a.err = `All ${aim.n} ${aim.what}s are aimed. Tap Cast, or Undo one.`;
    } else {
      const i = a.picks.indexOf(occ.id);
      if (i >= 0) a.picks.splice(i, 1);
      else if (a.picks.length < aim.n) a.picks.push(occ.id);
      else a.err = `${SPELLS[a.spell].name} takes up to ${aim.n} creatures here. Tap one again to drop it.`;
    }
  } else {
    const e = pointError(b, me, aim, x, y);
    if (e) { a.err = e; renderBattle(app.S); return; }
    if (a.point && a.point.x === x && a.point.y === y) { castAim(b, me); return; }
    a.point = { x, y };
  }
  renderBattle(app.S);
}

function aimIntent(a) {
  if (a.kind === 'breath') return a.point ? { a: 'breath', shape: a.shape, x: a.point.x, y: a.point.y } : null;
  if (a.kind === 'jaunt') return a.point ? { a: 'jaunt', x: a.point.x, y: a.point.y } : null;
  if (OTHER_AIMS[a.kind]) return a.point ? { a: a.kind, x: a.point.x, y: a.point.y } : null;
  const mode = aimOf(a).mode;
  const extra = { ...(a.meta ? { meta: a.meta } : {}), ...(a.toType ? { toType: a.toType } : {}) };
  if (mode === 'point' || mode === 'area') return a.point ? { a: 'cast', spell: a.spell, slot: a.slot, x: a.point.x, y: a.point.y, ...extra } : null;
  if (!a.picks.length) return null;
  return { a: 'cast', spell: a.spell, slot: a.slot, target: a.picks[0], targets: [...a.picks], ...extra };
}
function castAim() {
  const i = aimIntent(app.aim);
  if (i) act(i);
}

// What a spell will do to one creature, in a line (hit or save chances).
function spellOdds(b, me, sid, T, slot) {
  const sp = SPELLS[sid];
  const sc = scaled(sid, slot);
  if (sp.kind === 'attack' || sp.kind === 'rays' || sp.kind === 'spiritual') {
    const atk = spellAttack(me, sid, { melee: sp.kind === 'spiritual' || !!sp.melee });
    const f = attackFactors(b, me, T, atk);
    const pct = Math.round(hitChance(hitBonus(atk), acAgainst(b, me, T, atk).value, f.mode, me.luck) * 100);
    return [`${pct}% to hit ${esc(T.name)}`, `${sc.dice} ${sp.type}`, ...reasons(f)].join(' · ');
  }
  const ab = sp.save || (sp.kind === 'command' || sp.kind === 'hold' ? 'wis' : null);
  if (ab && hostile(me, T)) {
    const dc = spellDC(me, sid);
    return `${Math.round((1 - saveChance(b, T, ab, dc)) * 100)}% ${esc(T.name)} fails a DC ${dc} ${ab.toUpperCase()} save`;
  }
  return '';
}
const hostile = (p, q) => p.side !== q.side;

// One short line on how a spell aims and what it does.
function aimSummary(sid, slot) {
  const sp = SPELLS[sid];
  const aim = spellAim(sid, slot);
  const sc = scaled(sid, slot);
  const rng = aim.range <= 5 ? 'touch' : `${aim.range} ft`;
  switch (aim.mode) {
    case 'self': return 'Self';
    case 'creature': return `${aim.who === 'dying' ? 'A dying creature' : 'One creature'}, ${rng}`;
    case 'split': return `${aim.n} ${aim.what}s, aim each at any creature, ${rng}`;
    case 'group': return `Up to ${aim.n} creature${aim.n === 1 ? '' : 's'}, ${rng}`;
    case 'point': return `A square you can see, ${rng}`;
    case 'area': return aim.from === 'self' ? `${areaLabel(aim)} from you` : `${areaLabel(aim)} anywhere within ${rng}`;
    default:
      if (sp.time === 'reaction') return 'Reaction: offered when it applies';
      return sc && sp.kind === 'utility' ? 'Outside of fights' : '';
  }
}

// The ✨ Spells list: every spell you know, castable or not, and why.
function spellsCard(b, me) {
  const list = spellList(me).sort((p, q) => p.level - q.level || p.name.localeCompare(q.name));
  const fight = list.filter((sp) => sp.kind !== 'utility');
  const other = list.filter((sp) => sp.kind === 'utility');
  let rows = '';
  for (const sp of fight) {
    const { c, tag } = spellCost(b, me, sp.id);
    const slot = c.ok ? c.slot : sp.level;
    const react = sp.time === 'reaction';
    const why = react ? `${esc(aimSummary(sp.id, slot))} · ${tag}` : c.ok ? `${esc(aimSummary(sp.id, slot))} · ${tag}` : esc(c.error);
    rows += `<div class="opt"><span class="ob"><button class="btn ${react ? '' : 'primary'}" data-aim='${esc(JSON.stringify({ kind: 'spell', spell: sp.id }))}' ${c.ok && !react ? '' : 'disabled'}>${esc(sp.name)}</button></span>
      <span class="why"><a class="rl" data-rule="${sp.id}">${sp.level ? `Level ${sp.level}` : 'Cantrip'}</a> · ${why}</span></div>`;
  }
  if (other.length) rows += `<div class="why dim">Outside of fights: ${other.map((sp) => `<a class="rl" data-rule="${sp.id}">${esc(sp.name)}</a>`).join(', ')}.</div>`;
  return `<div class="target ally spells"><div class="th"><b>✨ Your spells</b><span><button class="btn small ghost" id="btn-spells-x">✕</button></span></div>${rows}</div>`;
}
document.addEventListener('click', (e) => { if (e.target.id === 'btn-spells-x') { app.spells = false; renderBattle(app.S); } });

// While aiming: what's picked, who's caught, and the Cast button.
function aimCard(b, me, a) {
  const aim = aimOf(a);
  const name = aimName(me, a);
  let tag = '';
  let slotBtns = '';
  const sp = a.kind === 'spell' ? SPELLS[a.spell] : null;
  if (sp) {
    tag = spellCost(b, me, a.spell).tag;
    if (sp.level && me.casting?.slots && Object.keys(sp.up || {}).length) {
      for (const lv of Object.keys(me.casting.slots).map(Number).sort((p, q) => p - q)) {
        if (lv < sp.level) continue;
        const c = canCast(b, me, a.spell, lv);
        if (!c.ok || (c.slot !== lv && !(c.pay === 'free' && lv === sp.level))) continue;
        slotBtns += `<button class="btn small up ${a.slot === lv ? 'on' : ''}" data-aimslot="${lv}" title="Cast with a level ${lv} slot">Lv ${lv}${lv > sp.level ? `: ${esc(upText(a.spell, lv))}` : ''}</button>`;
      }
      if (slotBtns) slotBtns = `<div class="opt slots">${slotBtns}</div>`;
    }
    // Metamagic options that change this spell, and the damage type where it's a choice.
    let mm = '';
    for (const m of me.metamagic || []) {
      const e = metaError(b, me, a.spell, m);
      if (e && METAMAGIC[m] && /doesn't change/.test(e)) continue;
      mm += `<button class="btn small up ${a.meta === m ? 'on' : ''}" data-aimmeta="${m}" ${e ? 'disabled' : ''} title="${esc(e || METAMAGIC[m].text)}">${esc(METAMAGIC[m].name)} (${METAMAGIC[m].cost})</button>`;
    }
    if (mm) slotBtns += `<div class="opt slots"><a class="rl" data-rule="metamagic">Metamagic</a> ${mm}</div>`;
    const types = sp.pickType || sp.buff === 'dbreath' ? sp.types : a.meta === 'transmuted' ? ['Acid', 'Cold', 'Fire', 'Lightning', 'Poison', 'Thunder'] : null;
    if (types) slotBtns += `<div class="opt slots">${types.map((ty) => `<button class="btn small up ${(a.toType || (sp.buff === 'dbreath' ? 'Fire' : '')) === ty ? 'on' : ''}" data-aimtype="${ty}">${ty}</button>`).join('')}</div>`;
  }
  const how = {
    creature: aim.who === 'dying' ? 'Tap a dying creature in range.' : 'Tap a creature in range (highlighted). Tap it again, or Cast.',
    split: `Tap a creature for each ${aim.what} (${a.picks.length}/${aim.n}). Tap the same one again to stack them. Any left over follow the last one.`,
    group: `Tap up to ${aim.n} creature${aim.n === 1 ? '' : 's'} (${a.picks.length}/${aim.n}). Tap one again to drop it.`,
    point: 'Tap a highlighted square. Tap it again, or Cast.',
    area: aim.from === 'self' ? `Tap any square to point the ${areaLabel(aim)} that way. Tap it again, or Cast.` : `Tap a highlighted square to place the ${areaLabel(aim)}. Tap it again, or Cast.`,
  }[aim.mode] || '';
  let body = `<div class="why">${esc(how)}</div>`;
  if (a.err) body += `<div class="why bad">${esc(a.err)}</div>`;
  if (['creature', 'split', 'group'].includes(aim.mode) && a.picks.length) {
    const counts = new Map();
    for (const id of a.picks) counts.set(id, (counts.get(id) || 0) + 1);
    const bits = [...counts].map(([id, n]) => {
      const T = b.creatures[id];
      const pal = !hostile(me, T) && ['attack', 'save', 'missile', 'rays', 'command', 'hold', 'spiritual'].includes(sp?.kind);
      return `${esc(T.name)}${n > 1 ? ` ×${n}` : ''}${pal ? ' <b class="bad">(your ally!)</b>' : ''}`;
    });
    body += `<div class="why">On: ${bits.join(', ')}</div>`;
    const T = b.creatures[a.picks[a.picks.length - 1]];
    const odds = sp ? spellOdds(b, me, a.spell, T, a.slot) : '';
    if (odds) body += `<div class="why">${odds}</div>`;
  }
  if (aim.mode === 'area' && a.point) {
    const hit = areaTargets(b, me, aim, a.point.x, a.point.y);
    const pals = hit.filter((c) => !hostile(me, c));
    const db = a.kind === 'exhale' ? b.effects.find((e) => e.type === 'dbreath' && e.target === me.id) : null;
    const sum = (parts) => parts.reduce((s2, p) => s2 + p.value, 0);
    const dc = a.kind === 'breath' ? sum(me.breath.dc) : a.kind === 'landsaid' ? sum(me.casting.stats.wis.dc) : db ? sum(db.dcParts) : spellDC(me, a.spell);
    const ab = a.kind === 'breath' || db ? 'dex' : a.kind === 'landsaid' ? 'con' : sp.save;
    const dmg = a.kind === 'breath' ? `${me.breath.dice} ${me.breath.type}, half on a save` : a.kind === 'landsaid' ? '2d6 Necrotic to enemies, half on a save; one friend inside heals 2d6'
      : db ? `${db.dice} ${db.dmgType}, half on a save`
      : sp.cond === 'sleep' ? 'enemies only: Incapacitated, then Unconscious after a second failed save' : sp.cond ? `${R0('restrained', 'Restrained')} on a failure` : sp.effect ? 'outlined in light: attacks against it have Advantage' : `${scaled(a.spell, a.slot).dice} ${sp.type || 'damage'}${sp.half ? ', half on a save' : ''}${sp.push ? `, pushed ${sp.push} ft on a failure` : ''}`;
    body += `<div class="why">${hit.length ? `Catches ${hit.map((c) => esc(c.name)).join(', ')}` : 'Catches nobody there yet'}${pals.length ? ` <b class="bad">(including ${pals.map((c) => (c === me ? 'you' : esc(c.name))).join(' and ')}!)</b>` : ''} · DC ${dc} ${ab.toUpperCase()} save, ${dmg}</div>`;
  }
  const ready = !!aimIntent(a);
  const undo = aim.mode === 'split' && a.picks.length ? '<button class="btn small ghost" id="btn-aim-undo">Undo</button>' : '';
  const rule = a.kind === 'breath' ? 'breath-weapon' : a.kind === 'jaunt' ? 'giant-ancestry' : OTHER_AIMS[a.kind]?.rule || a.spell;
  return `<div class="target aiming"><div class="th"><b><a class="rl" data-rule="${rule}">${esc(name)}</a></b><span>${tag} <button class="btn small ghost" id="btn-aim-x">✕</button></span></div>
    ${slotBtns}${body}<div class="opt"><button class="btn primary" id="btn-aim-go" ${ready ? '' : 'disabled'}>${a.kind === 'breath' ? 'Breathe' : a.kind === 'jaunt' ? 'Teleport' : OTHER_AIMS[a.kind]?.go || 'Cast'}</button>${undo}</div></div>`;
}

const reasons = (o) => {
  const bits = [];
  if (o.mode === 'advantage') bits.push(`<b class="good">Advantage</b>: ${o.adv.map((a) => `<a class="rl" data-rule="${a.rule}">${esc(a.text)}</a>`).join(', ')}`);
  if (o.mode === 'disadvantage') bits.push(`<b class="bad">Disadvantage</b>: ${o.dis.map((a) => `<a class="rl" data-rule="${a.rule}">${esc(a.text)}</a>`).join(', ')}`);
  if (o.adv.length && o.dis.length) bits.push('<a class="rl" data-rule="advantage">Advantage and Disadvantage cancel</a>');
  return bits;
};
const intentAttr = (i) => `data-intent='${esc(JSON.stringify(i))}'`;
const row = (label, intent, ok, why, primary = true, more = '') =>
  `<div class="opt"><span class="ob"><button class="btn ${primary ? 'primary' : ''}" ${intentAttr(intent)} ${ok ? '' : 'disabled'}>${esc(label)}</button>${more}</span><span class="why">${why}</span></div>`;

function spellCost(b, me, sid) {
  const s = SPELLS[sid];
  const c = canCast(b, me, sid);
  const bonus = s.time === 'bonus' ? ', <b>Bonus Action</b>' : '';
  const conc = s.conc ? `, <a class="rl" data-rule="concentration">Concentration</a>${me.conc ? ` <b class="bad">(ends ${esc(SPELLS[me.conc.spell]?.name || '')})</b>` : ''}` : '';
  if (s.level === 0) return { c, tag: `<a class="rl" data-rule="cantrips">cantrip</a>${bonus}` };
  if (c.pay === 'free') return { c, tag: `<a class="rl" data-rule="magic-initiate">free cast</a>${bonus}${conc}` };
  return { c, tag: `<a class="rl" data-rule="spell-slots">level ${c.slot || s.level} slot</a>${bonus}${conc}` };
}

// What a higher slot adds, for the small "Level 2" buttons.
function upText(sid, lv) {
  const s = SPELLS[sid];
  const sc = scaled(sid, lv);
  if (s.up?.dice) return sc.dice;
  if (s.up?.darts) return `${sc.darts} darts`;
  if (s.up?.rays) return `${sc.rays} rays`;
  if (s.up?.amount) return `+${sc.amount} HP`;
  if (s.up?.targets) return `${sc.targets} targets`;
  return '';
}
function upButtons(b, me, sp, intent, ok) {
  if (!ok || !sp.level || !me.casting?.slots || ['command', 'hold'].includes(sp.kind) || !Object.keys(sp.up || {}).length) return '';
  const base = canCast(b, me, sp.id);
  if (!base.ok) return '';
  let out = '';
  for (const lv of Object.keys(me.casting.slots).map(Number).sort((p, q) => p - q)) {
    if (lv <= (base.slot || sp.level)) continue;
    const c = canCast(b, me, sp.id, lv);
    if (!c.ok || c.slot !== lv) continue;
    const extra = sp.kind === 'buff' && intent.targets ? { targets: buffTargets(b, me, b.creatures[intent.targets[0]], sp, lv) } : {};
    out += `<button class="btn small up" ${intentAttr({ ...intent, ...extra, slot: lv })} title="Cast with a level ${lv} slot">Lv ${lv}: ${esc(upText(sp.id, lv))}</button>`;
  }
  return out;
}

// Bless and Aid: the tapped ally first, then the nearest others in range.
function buffTargets(b, me, T, sp, lv) {
  const n = scaled(sp.id, lv || canCast(b, me, sp.id).slot || sp.level).targets;
  const pals = [me, ...Object.values(b.creatures).filter((c) => c.side === me.side && c !== me)]
    .filter((c) => !c.dead && c.hp > 0 && onBoard(c) && (c === me || (cheb(me, c) * 5 <= sp.range && lineOfSight(b, me, c))));
  pals.sort((p, q) => (p === T ? -1 : q === T ? 1 : cheb(me, p) - cheb(me, q)));
  return pals.slice(0, n).map((c) => c.id);
}

function targetCard(b, me, T) {
  const t = b.turn;
  let rows = '';
  const self = T.id === me.id;
  const near = cheb(me, T) <= 1;
  const sees = self || lineOfSight(b, me, T);
  const inRange = (ft) => self || (cheb(me, T) * 5 <= ft && sees);
  if (T.side === me.side) {
    // Healing, help and buffs for friends (or yourself).
    for (const sp of spellList(me)) {
      const { c, tag } = spellCost(b, me, sp.id);
      const intent = { a: 'cast', spell: sp.id, target: T.id };
      if (sp.kind === 'heal' || (sp.kind === 'stabilize' && T.hp <= 0 && !T.dead && !T.stable)) {
        const ok = sp.range === 5 ? self || near : inRange(sp.range);
        const why = !ok ? `Out of range (${sp.range === 5 ? 'touch' : `${sp.range} ft`}).` : c.ok ? `${sp.kind === 'heal' ? `Heals ${sp.dice} + your modifier${me.discipleOfLife && c.pay === 'slot' ? ` + ${R0('disciple-of-life', 'Disciple of Life')}` : ''}` : 'Makes them Stable'} · ${tag}` : esc(c.error);
        rows += row(sp.name, intent, ok && c.ok, why, true, upButtons(b, me, sp, intent, ok && c.ok));
      } else if (sp.kind === 'cure') {
        const cond = (T.conds || []).find((x) => sp.cures.includes(x.id));
        if (!cond) continue;
        const ok = self || near;
        rows += row(sp.name, { ...intent, cond: cond.id }, ok && c.ok, !ok ? 'Touch: move next to them first.' : c.ok ? `Ends ${esc(CONDS[cond.id] || cond.id)} · ${tag}` : esc(c.error));
      } else if (sp.kind === 'armor' || sp.kind === 'stride' || (sp.kind === 'temp' && self)) {
        const aim = spellAim(sp.id, c.slot);
        const e = sp.kind === 'temp' ? null : targetError(b, me, T, sp.id, aim);
        const what = sp.kind === 'armor' ? `AC 13 + DEX for ${esc(T.name)}` : sp.kind === 'stride' ? `+10 ft Speed for ${esc(T.name)}` : `${sp.dice} + ${scaled(sp.id, c.slot).flat} Temporary Hit Points`;
        if (sp.kind === 'armor' && T.armorId !== 'none') continue;
        rows += row(sp.name, sp.kind === 'temp' ? { a: 'cast', spell: sp.id } : { a: 'cast', spell: sp.id, target: T.id, targets: [T.id] }, !e && c.ok, e ? esc(e) : c.ok ? `${what} · ${tag}` : esc(c.error));
      } else if (sp.kind === 'buff' && T.hp > 0 && NEW_BUFFS[sp.buff]) {
        const aim = spellAim(sp.id, c.slot);
        const e = targetError(b, me, T, sp.id, aim);
        rows += `<div class="opt"><span class="ob"><button class="btn primary" data-aim='${esc(JSON.stringify({ kind: 'spell', spell: sp.id, picks: [T.id] }))}' ${!e && c.ok ? '' : 'disabled'}>${esc(sp.name)}</button></span>
          <span class="why">${e ? esc(e) : c.ok ? `${NEW_BUFFS[sp.buff]} · ${tag}` : esc(c.error)}</span></div>`;
      } else if (sp.kind === 'buff' && T.hp > 0) {
        const ok = inRange(sp.range);
        if (sp.buff === 'faith') {
          rows += row(sp.name, intent, ok && c.ok, !ok ? `Out of range (${sp.range} ft).` : c.ok ? `+2 AC for ${esc(T.name)} · ${tag}` : esc(c.error));
        } else {
          const ids = ok ? buffTargets(b, me, T, sp) : [];
          const who = ids.map((id) => esc(b.creatures[id].name)).join(', ');
          const what = sp.buff === 'bless' ? '+1d4 to attack rolls and saves' : `+${sp.amount} Hit Points and maximum`;
          const bi = { a: 'cast', spell: sp.id, targets: ids };
          rows += row(sp.name, bi, ok && c.ok && ids.length, !ok ? `Out of range (${sp.range} ft).` : c.ok ? `${what} for ${who} · ${tag}` : esc(c.error), true, upButtons(b, me, sp, bi, ok && c.ok));
        }
      }
    }
    rows += friendFeatures(b, me, T, { self, near, inRange });
    if (me.channel && me.level >= 2 && me.cls === 'cleric' && T.hp < T.hpMax && !T.dead) {
      const ok = inRange(30) && t.action && !t.magicUsed && me.channel.uses > 0;
      rows += row(`Divine Spark (${me.channel.uses})`, { a: 'spark', target: T.id }, ok,
        `${R0('divine-spark', 'Channel Divinity')}: heals 1d8 ${signed(me.mods.wis)}${inRange(30) ? '' : ' (out of range: 30 ft)'}`, false);
    }
    const web = (T.conds || []).find((x) => x.id === 'restrained' && x.web);
    if (web) {
      const ok = canAttack(t) && (self || near || me.attacks.some((a) => a.kind === 'ranged'));
      rows += row('Cut the web', { a: 'cut', target: T.id }, ok, `Attack the web (AC ${web.web.ac}, ${web.web.hp} HP left) to free ${self ? 'yourself' : esc(T.name)} · ${R0('restrained', 'Restrained')}`, false);
    }
    if (!self && T.hp <= 0 && !T.dead && !T.stable) {
      rows += row('Stabilize', { a: 'stabilize', target: T.id }, t.action && near,
        near ? `<a class="rl" data-rule="stabilize">Help action</a>: DC 10 Wisdom (Medicine) check, you have ${signed(me.skills.medicine)}.` : 'Move next to them first.');
    }
    if (!rows) rows = `<div class="why dim">${self ? 'Nothing to do on yourself right now. Your other options are below.' : `${esc(T.name)} is fine.`}</div>`;
    rows += `<div class="opt"><button class="btn small ghost" id="btn-tinfo">${self ? 'My character sheet' : 'Character sheet'}</button></div>`;
  } else {
    for (const o of attackOptions(b, me, T)) {
      const flat = o.atk.dmgFlat.reduce((s, x) => s + x.value, 0);
      const bits = [`${Math.round(o.p * 100)}% to hit`, `${o.atk.dice}${signed(flat)} ${o.atk.type}`, ...reasons(o)];
      if (o.cover) bits.push(`<b class="bad">${R0('cover', `Half Cover (${esc(o.cover.what)})`)}: +2 AC</b>`);
      if (o.sneak) bits.push(`<b class="good">+${me.sneak} <a class="rl" data-rule="sneak-attack">Sneak Attack</a></b>`);
      if (o.atk.mastery) bits.push(`<a class="rl" data-rule="${MASTERIES[o.atk.mastery].rule}">${MASTERIES[o.atk.mastery].name}</a>`);
      const why = o.ok ? bits.join(' · ') : esc(o.why || `Out of ${o.atk.kind === 'melee' ? 'reach: move next to it first' : 'range'}.`);
      rows += row(o.atk.name, { a: 'attack', target: T.id, attack: o.atk.id }, o.ok && canAttack(t), why);
    }
    for (const atk of me.attacks) {
      const off = offhandFor(b, me, atk);
      if (off.error) continue;
      const can = canTarget(b, me, T, off.atk);
      const flat = off.atk.dmgFlat.reduce((s2, x) => s2 + x.value, 0);
      rows += row(`${atk.name}: extra attack`, { a: 'attack', target: T.id, attack: atk.id, offhand: true }, can.ok,
        can.ok ? `${R0('light', 'Light')} weapon extra attack${off.nick ? ` (${R0('mastery-nick', 'Nick')}: part of the Attack action)` : ', a <b>Bonus Action</b>'} · ${off.atk.dice}${flat ? signed(flat) : ''} ${off.atk.type}${me.twf ? ` (${R0('two-weapon-fighting', 'Two-Weapon Fighting')})` : ', no ability modifier to damage'}` : esc(can.why), false);
    }
    for (const sp of spellList(me)) {
      if (sp.kind === 'mark' || sp.kind === 'bane') {
        const { c, tag } = spellCost(b, me, sp.id);
        const e = targetError(b, me, T, sp.id, spellAim(sp.id, c.slot));
        const what = sp.kind === 'mark' ? `+${sp.dice} ${sp.type} each time you hit it` : `DC ${spellDC(me, sp.id)} CHA save or −1d4 on its attack rolls and saves (tap to add more targets)`;
        const a = sp.kind === 'mark' ? null : { kind: 'spell', spell: sp.id, picks: [T.id] };
        rows += a ? `<div class="opt"><span class="ob"><button class="btn primary" data-aim='${esc(JSON.stringify(a))}' ${!e && c.ok ? '' : 'disabled'}>${esc(sp.name)}</button></span><span class="why">${e ? esc(e) : c.ok ? `${what} · ${tag}` : esc(c.error)}</span></div>`
          : row(sp.name, { a: 'cast', spell: sp.id, target: T.id }, !e && c.ok, e ? esc(e) : c.ok ? `${what} · ${tag}` : esc(c.error));
        continue;
      }
      if (!['attack', 'save', 'missile', 'rays', 'area', 'command', 'hold', 'spiritual'].includes(sp.kind)) continue;
      const { c, tag } = spellCost(b, me, sp.id);
      if (sp.kind === 'area') {
        if (sp.effect && !sp.area) continue;
        const aim = spellAim(sp.id, c.slot);
        const at = aim.from === 'self' && aim.shape === 'cube' ? { x: me.x + Math.sign(T.x - me.x), y: me.y + Math.sign(T.y - me.y) } : { x: T.x, y: T.y };
        const okAt = !pointError(b, me, aim, at.x, at.y);
        const hit = okAt ? areaTargets(b, me, aim, at.x, at.y) : [];
        const why = !c.ok ? esc(c.error) : !hit.includes(T) ? `${areaLabel(aim)}${aim.from === 'self' ? ' from you' : ` within ${aim.range} ft`}: aimed at ${esc(T.name)} it wouldn't reach. Tap Aim to place it anywhere.`
          : `${areaLabel(aim)}: aimed here it catches ${hit.map((h) => esc(h.name)).join(', ')}${hit.some((h) => h.side === me.side) ? ' <b class="bad">(including your side!)</b>' : ''}. Aim to adjust · ${tag}`;
        rows += `<div class="opt"><span class="ob"><button class="btn primary" data-aim='${esc(JSON.stringify({ kind: 'spell', spell: sp.id, point: okAt ? at : null }))}' ${c.ok ? '' : 'disabled'}>Aim ${esc(sp.name)}</button></span><span class="why">${why}</span></div>`;
        continue;
      }
      const intent = { a: 'cast', spell: sp.id, target: T.id };
      if (sp.kind === 'spiritual' && b.effects.some((e) => e.type === 'spiritual' && e.by === me.id)) {
        rows += row(`${sp.name}: strike`, { a: 'spiritual', target: T.id }, !!t.bonus, `<b>Bonus Action</b>: the weapon moves up to 20 ft and attacks, ${scaledDice(b, me)} + your modifier Force`);
        continue;
      }
      const ok = inRange(sp.range) && !(T.conds || []).some((x) => x.id === 'hidden');
      let why;
      if (!sees) why = `You can't see ${esc(T.name)}: a wall is in the way (${R0('line-of-sight', 'line of sight')}).`;
      else if (!ok) why = `Out of range (${sp.range} ft).`;
      else if (!c.ok) why = esc(c.error);
      else if (sp.kind === 'attack' || sp.kind === 'rays' || sp.kind === 'spiritual') {
        const atk = spellAttack(me, sp.id, sp.kind === 'spiritual' ? { melee: true } : undefined);
        const f = attackFactors(b, me, T, atk);
        const n = sp.kind === 'rays' ? scaled(sp.id, c.slot).rays : 1;
        why = [`${Math.round(hitChance(hitBonus(atk), acAgainst(b, me, T, atk).value, f.mode, me.luck) * 100)}% to hit${n > 1 ? `, ${n} rays` : ''}`, `${sp.dice}${n > 1 ? ' each' : ''} ${sp.type}`, ...reasons({ ...f, adv: f.adv, dis: f.dis }), tag].join(' · ');
      } else if (sp.kind === 'save' || sp.kind === 'command' || sp.kind === 'hold') {
        if (sp.only && T.creature !== sp.only) { rows += row(sp.name, intent, false, `Only works on a ${esc(sp.only)}.`); continue; }
        const dc = spellDC(me, sp.id);
        const eff = sp.kind === 'save' ? `${sp.dice} ${sp.type}` : sp.kind === 'command' ? `"Grovel!": it falls ${R0('prone', 'Prone')} and loses its turn` : `${R0('paralyzed', 'Paralyzed')}, saves at the end of each of its turns`;
        why = `${Math.round((1 - saveChance(b, T, sp.save || 'wis', dc)) * 100)}% it fails a DC ${dc} ${(sp.save || 'wis').toUpperCase()} save · ${eff} · ${tag}`;
      } else why = `Never misses · ${scaled(sp.id, c.slot).darts} × (1d4 + 1) Force · ${tag}`;
      rows += row(sp.name, intent, ok && c.ok, why, true, upButtons(b, me, sp, intent, ok && c.ok));
    }
    if (me.breath) {
      const ok = me.breath.uses > 0 && canAttack(t);
      for (const shape of ['cone', 'line']) {
        const hit = areaTargets(b, me, BREATH_AREAS[shape], T.x, T.y);
        const pals = hit.filter((x) => x.side === me.side);
        rows += `<div class="opt"><span class="ob"><button class="btn" data-aim='${esc(JSON.stringify({ kind: 'breath', shape, point: { x: T.x, y: T.y } }))}' ${ok ? '' : 'disabled'}>Breath: ${shape === 'line' ? 'Line' : 'Cone'} (${me.breath.uses})</button></span>
          <span class="why"><a class="rl" data-rule="breath-weapon">Replaces an attack</a>: ${shape === 'line' ? '30-ft Line' : '15-ft Cone'} toward ${esc(T.name)} catches ${hit.map((x) => esc(x.name)).join(', ') || 'nobody yet'}${pals.length ? ' <b class="bad">(including your ally!)</b>' : ''}</span></div>`;
      }
    }
    rows += foeFeatures(b, me, T, { inRange });
    if (me.channel && me.level >= 2 && me.cls === 'cleric') {
      const ok = inRange(30) && t.action && !t.magicUsed && me.channel.uses > 0;
      const dc = spellDC(me, Object.keys(me.casting?.known || {})[0]);
      rows += row(`Divine Spark (${me.channel.uses})`, { a: 'spark', target: T.id }, ok,
        `${R0('divine-spark', 'Channel Divinity')}: DC ${dc} CON save, 1d8 ${signed(me.mods.wis)} Radiant, half on a save${inRange(30) ? '' : ' (out of range: 30 ft)'}`, false);
    }
    if (near) {
      const shoveOk = canAttack(t) && T.hp > 0;
      const dc = 8 + me.mods.str + me.pb;
      rows += row('Shove: Prone', { a: 'shove', target: T.id, mode: 'prone' }, shoveOk,
        `${R0('unarmed-strike', 'Replaces an attack')}: DC ${dc} STR or DEX save, or it falls ${R0('prone', 'Prone')}`, false,
        `<button class="btn small" ${intentAttr({ a: 'shove', target: T.id, mode: 'push' })} ${shoveOk ? '' : 'disabled'}>Push 5 ft</button>`);
      rows += row('Help', { a: 'help', target: T.id }, t.action, `<a class="rl" data-rule="help">Help action</a>: your ally's next attack on ${esc(T.name)} gets Advantage.`, false);
    }
    if (!canAttack(t)) rows += '<div class="why dim">You have already used your action this turn.</div>';
  }
  const tc = (T.conds || []).filter((x) => CONDS[x.id]).map((x) => CONDS[x.id]).join(', ');
  return `<div class="target ${T.side === me.side ? 'ally' : ''}"><div class="th"><b>${T.emoji} ${esc(T.name)}</b>
    <span>AC ${T.ac} · HP ${T.hp}/${T.hpMax}${tc ? ` · <span class="bad">${esc(tc)}</span>` : ''}${T.side !== me.side || !self ? ' <button class="btn small ghost" id="btn-tinfo2">ⓘ</button>' : ''}<button class="btn small ghost" id="btn-tx">✕</button></span></div>${rows}</div>`;
}
const NEW_BUFFS = {
  heroism: "Immune to Frightened, and Temporary Hit Points equal to your modifier each turn",
  pfe: 'Aberrations, Celestials, Elementals, Fey, Fiends and Undead have Disadvantage to hit them',
  bark: 'Their AC can\'t be lower than 17',
  dbreath: 'They can exhale a 15-ft Cone as a Magic action (pick the type)',
};

// Class features aimed at a friend (or yourself).
function friendFeatures(b, me, T, { self, near, inRange }) {
  const t = b.turn;
  let rows = '';
  if (me.layOnHands && !T.dead) {
    const pool = me.layOnHands.uses;
    const reach = self || near;
    const need = T.hpMax - T.hp;
    if (need > 0) {
      const amt = Math.min(pool, need);
      const more = amt > 5 && T.hp > 0 ? `<button class="btn small" ${intentAttr({ a: 'lay', target: T.id, amount: 5 })} ${reach && t.bonus ? '' : 'disabled'}>Just 5</button>` : T.hp <= 0 && amt > 1 ? `<button class="btn small" ${intentAttr({ a: 'lay', target: T.id, amount: 1 })} ${reach && t.bonus ? '' : 'disabled'}>Just 1</button>` : '';
      rows += row(`Lay on Hands: ${amt} HP`, { a: 'lay', target: T.id, amount: amt }, reach && t.bonus && pool > 0,
        !reach ? 'Touch: move next to them first.' : `${R0('lay-on-hands', 'Bonus Action')}: from your pool of ${pool}`, true, more);
    }
    if ((T.conds || []).some((x) => x.id === 'poisoned')) rows += row('Lay on Hands: end Poisoned', { a: 'lay', target: T.id, cure: true }, reach && t.bonus && pool >= 5, `${R0('lay-on-hands', 'Bonus Action')}: costs 5 from your pool`, false);
  }
  if (me.bardic && !self && T.hp > 0) {
    const ok = t.bonus && me.bardic.uses > 0 && inRange(60) && !T.bardicDie;
    rows += row(`Bardic Inspiration (${me.bardic.uses})`, { a: 'inspire', target: T.id }, ok,
      T.bardicDie ? `${esc(T.name)} already has a die.` : `${R0('bardic-inspiration', 'Bonus Action')}: ${esc(T.name)} gets a d${me.bardic.die} to add when a D20 Test falls short${inRange(60) ? '' : ' (out of range: 60 ft)'}`, false);
  }
  return rows;
}

// Class features aimed at an enemy.
function foeFeatures(b, me, T, { inRange }) {
  const t = b.turn;
  let rows = '';
  const fist = me.martialDie && me.attacks.find((a) => a.id === 'unarmed');
  if (fist) {
    const o = attackOptions(b, me, T).find((x) => x.atk.id === 'unarmed');
    const why = o?.ok ? `${Math.round(o.p * 100)}% to hit · ${o.atk.dice}${signed(o.atk.dmgFlat.reduce((s2, x) => s2 + x.value, 0))} ${o.atk.type}` : esc(o?.why || 'Move next to it first.');
    rows += row('Unarmed Strike (Bonus Action)', { a: 'martial', target: T.id }, !!o?.ok && t.bonus, `${R0('martial-arts', 'Martial Arts')}: ${why}`, false);
    if (me.focus) {
      const ok = !!o?.ok && t.bonus && me.focus.uses > 0;
      const techs = me.openHand ? ['push', 'addle'].map((k) => `<button class="btn small" ${intentAttr({ a: 'flurry', target: T.id, tech: k })} ${ok ? '' : 'disabled'}>${k === 'push' ? 'Push' : 'Addle'}</button>`).join('') : '';
      rows += row(me.openHand ? 'Flurry: Topple' : 'Flurry of Blows', { a: 'flurry', target: T.id, ...(me.openHand ? { tech: 'topple' } : {}) }, ok,
        `${R0('monks-focus', '1 Focus Point')}: two Unarmed Strikes as a Bonus Action${me.openHand ? `, each hit with ${R0('open-hand-technique', 'Open Hand Technique')}` : ''}`, false, techs);
    }
  }
  const mk = b.effects.find((e) => e.type === 'mark' && e.by === me.id);
  if (mk && mk.target !== T.id) {
    const old = b.creatures[mk.target];
    const free = !old || old.dead || old.hp <= 0;
    rows += row(`Move ${mk.name} here`, { a: 'remark', target: T.id }, free && t.bonus && inRange(90), free ? `${R0(mk.spell, 'Bonus Action')}: its creature is down` : `Only after ${esc(old.name)} drops to 0 HP.`, false);
  }
  return rows;
}

const R0 = (rule, label) => (GLOSSARY[rule] ? `<a class="rl" data-rule="${rule}">${label}</a>` : label);
const scaledDice = (b, me) => b.effects.find((e) => e.type === 'spiritual' && e.by === me.id)?.dice || '1d8';
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
  const R = b.creatures[b.pending.reactor];
  const k = `${b.seq}`;
  if (el.dataset.k === k) return;
  el.dataset.k = k;
  app.reactUntil = Date.now() + S.reactIn;
  if (b.pending.kind === 'shield') {
    const A = b.creatures[b.pending.attacker];
    const p = b.pending;
    const saves = p.total < p.ac + 5;
    el.innerHTML = `<h3>⚡ Reaction!</h3>
      <p>${esc(A.name)}'s attack rolled <b>${p.total}</b> against your AC ${p.ac}: a hit. Cast <a class="rl" data-rule="shield">Shield</a>
      for +5 AC until your next turn? It uses a spell slot, and ${saves ? '<b class="good">this attack would miss</b>' : '<b class="bad">this attack still hits</b> (but later ones are harder)'}.</p>
      <div class="row"><button class="btn primary" id="btn-react-yes">Cast Shield</button><button class="btn" id="btn-react-no">Take the hit</button></div>
      <div class="timer" id="react-timer"></div>`;
  } else if (b.pending.kind === 'smite') {
    const T = b.creatures[b.pending.target];
    const k = R.casting.known['divine-smite'];
    const opts = [];
    if (k.free > 0) opts.push({ label: 'Smite (free use)', slot: 0, dice: 2 });
    for (const lv of Object.keys(R.casting.slots || {}).map(Number).sort((p, q) => p - q)) {
      const pay = smitePay(b, R, lv);
      if (pay?.pay === 'slot' && pay.slot === lv && !(lv === 1 && k.free > 0)) opts.push({ label: `Level ${lv} slot`, slot: lv, dice: 1 + lv });
    }
    const extra = ['fiend', 'undead'].includes(T.creature) ? ` +1d8 because ${esc(T.name)} is ${T.creature === 'fiend' ? 'a Fiend' : 'Undead'}` : '';
    el.innerHTML = `<h3>⚡ Divine Smite?</h3>
      <p>You hit ${esc(T.name)}${b.pending.crit ? ' with a <b class="good">Critical Hit</b> (the smite dice are doubled)' : ''}. <a class="rl" data-rule="divine-smite">Divine Smite</a> adds Radiant damage: 2d8, +1d8 for each slot level above 1${extra}. It uses your Bonus Action.</p>
      <div class="row">${opts.map((o, i) => `<button class="btn ${i ? '' : 'primary'}" data-smite="${o.slot}">${esc(o.label)}: ${o.dice}d8</button>`).join('')}<button class="btn" id="btn-react-no">No smite</button></div>
      <div class="timer" id="react-timer"></div>`;
    for (const x of el.querySelectorAll('[data-smite]')) x.onclick = () => { send({ t: 'react', yes: true, slot: +x.dataset.smite }); el.classList.add('hidden'); };
  } else if (b.pending.kind === 'rebuke') {
    const A = b.creatures[b.pending.attacker];
    el.innerHTML = `<h3>⚡ Reaction!</h3>
      <p>${esc(A.name)} just hurt you. Cast <a class="rl" data-rule="hellish-rebuke">Hellish Rebuke</a> at it? DC ${spellDC(R, 'hellish-rebuke')} Dexterity save, 2d10 Fire (half on a save). It uses your Reaction and a spell slot.</p>
      <div class="row"><button class="btn primary" id="btn-react-yes">Cast Hellish Rebuke</button><button class="btn" id="btn-react-no">Let it go</button></div>
      <div class="timer" id="react-timer"></div>`;
  } else {
    const M = b.creatures[b.pending.mover];
    const opt = attackOptions(b, R, M).filter((o) => o.atk.kind === 'melee').sort((p, q) => q.expected - p.expected)[0];
    el.innerHTML = `<h3>⚡ Reaction!</h3>
      <p>${esc(M.name)} is leaving your reach. Use your Reaction for an <a class="rl" data-rule="opportunity-attack">Opportunity Attack</a>
      ${opt ? `with your ${esc(opt.atk.name)} (${Math.round(opt.p * 100)}% to hit)` : ''}?</p>
      <div class="row"><button class="btn primary" id="btn-react-yes">Attack!</button><button class="btn" id="btn-react-no">Let it go</button></div>
      <div class="timer" id="react-timer"></div>`;
  }
  el.classList.remove('hidden');
  navigator.vibrate?.([30, 40, 30]);
  if ($('btn-react-yes')) $('btn-react-yes').onclick = () => { send({ t: 'react', yes: true }); el.classList.add('hidden'); };
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
  const rules = rulesSeen(b.log).map((k) => `<a class="chip rl" data-rule="${k}">${esc(GLOSSARY[k].title)}</a>`).join('');
  const win = b.over === 'victory';
  const sc = SCENES[S.battleScene];
  const hostBtns = win ? '<button class="btn primary wide" id="btn-cont">Continue the story</button>'
    : '<button class="btn primary wide" id="btn-retry">Try the fight again</button><button class="btn wide" id="btn-lobby">Back to the lobby</button>';
  el.innerHTML = `<div class="card"><div class="logo">${win ? '🏆' : '💀'}</div><h2>${win ? 'Victory!' : 'Defeat'}</h2>
    <p class="dim">${esc(sc?.title || 'The fight')}: ${win ? 'won' : 'lost'} after ${b.round} round${b.round === 1 ? '' : 's'}.${win ? '' : ' Everyone gets back up for another try.'}</p>
    <h4 class="kicker">Rules you used: tap one to read it again</h4>
    <div class="chips">${rules}</div>
    ${isHost() ? hostBtns : '<p class="dim">Waiting for the host…</p>'}
    <button class="btn ghost wide" id="btn-over-log">See the combat log</button></div>`;
  el.classList.remove('hidden');
  if ($('btn-cont')) $('btn-cont').onclick = () => send({ t: 'continue' });
  if ($('btn-retry')) $('btn-retry').onclick = () => send({ t: 'retry' });
  if ($('btn-lobby')) $('btn-lobby').onclick = () => send({ t: 'again' });
  $('btn-over-log').onclick = () => { el.classList.add('hidden'); el.dataset.dismissed = String(b.seq); };
}

