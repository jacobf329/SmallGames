// First Roll - the app: home, lobby and battle screens, wired to a room.
// The host's phone runs the room itself (LocalNet) and opens it to friends
// over WebRTC (Host); a friend's phone talks to it through RtcNet. Either way
// this file only sends intents and renders the state it is sent.

import { createRoom } from '../game/room.js';
import { Host, LocalNet, RtcNet, onlineSupported, normCode } from '../net/online.js';
import { buildHero } from '../rules/character.js';
import { PREMADES, ABILITIES, signed, MASTERIES } from '../rules/data.js';
import { previewMove, reachableSquares, attackOptions } from '../rules/combat.js';
import { occupantAt, cheb } from '../rules/grid.js';
import { coach } from '../rules/ai.js';
import { createBoard } from './board.js';
import { short, detail, glossaryHtml, rulesSeen, esc, ROLLED } from './explain.js';
import { GLOSSARY } from '../rules/glossary.js';

const $ = (id) => document.getElementById(id);
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const K = { name: 'fr.name', save: 'fr.save', solo: 'fr.save.solo', hostToken: 'fr.token.host', guestToken: 'fr.token.guest' };

const app = {
  mode: null, room: null, host: null, net: null, code: null, timer: null,
  me: null, S: null, lastSeq: 0, preview: null, target: null,
  toasts: [], toastBusy: false, wake: null, status: '', reactUntil: 0,
};
window.__FR = app;   // for the console and tools/e2e.mjs

// ------------------------------------------------------------ helpers ----
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === `scr-${id}`);
}
let errTimer = null;
function showErr(text) {
  const e = $('err');
  e.textContent = text;
  e.classList.remove('hidden');
  clearTimeout(errTimer);
  errTimer = setTimeout(() => e.classList.add('hidden'), 3200);
}
function openSheet(html) {
  $('sheet-body').innerHTML = html;
  $('sheet').classList.remove('hidden');
}
const closeSheet = () => $('sheet').classList.add('hidden');
const send = (m) => app.net?.send(m);
const myName = () => ($('in-name').value.trim() || ls.get(K.name) || '').slice(0, 20);
const seatMe = () => app.S?.seats.find((s) => s.pid === app.me);
const isHost = () => app.S?.seats[0]?.pid === app.me;
const heroColors = (S) => Object.fromEntries(S.seats.filter((s) => s.hero).map((s) => [s.hero, s.color]));

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
      setStatus('This browser can\'t host online games. Playing solo.');
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
  finding: 'Finding the party…', gathering: 'Getting ready…', waiting: 'Knocking on the host\'s door…',
  linking: 'Connecting…', online: 'Connected', offline: 'Reconnecting…',
};
function onGuestStatus(s) {
  if (s === 'noroom') { leave(); $('home-msg').textContent = `No party with the code ${app.code || ''}. Check it with your host.`; return; }
  if (s === 'blocked') {
    setStatus('Can\'t reach the host\'s phone from this network. Try another wifi or mobile data.');
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
  Object.assign(app, { mode: null, room: null, host: null, net: null, code: null, timer: null, me: null, S: null, lastSeq: 0, preview: null, target: null, wake: null });
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
    const s = app.S?.seats.find((x) => x.pid === m.pid);
    board.ping(m.x, m.y, s?.color || '#fff');
  } else if (m.t === 'error') {
    showErr(m.text);
  }
}

function takeRecords(prev, S) {
  const b = S.battle;
  if (!b) { app.lastSeq = 0; return; }
  if (b.seq < app.lastSeq) app.lastSeq = 0;                // a new fight
  const fresh = app.lastSeq === 0 && b.seq > 8;          // joined mid-fight: no replay
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
  const who = b?.creatures[r.by]?.name || '';
  t.innerHTML = `<span class="t"><span class="who">${esc(who)}${r.weapon ? ` · ${esc(r.weapon)}` : ''}${r.target && b ? ` → ${esc(b.creatures[r.target]?.name)}` : ''}</span>${short(r, b)}</span><button class="btn">Why?</button>`;
  t.querySelector('.btn').onclick = () => openSheet(detail(r, app.S?.battle));
  t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  setTimeout(nextToast, app.toasts.length ? 1800 : 3200);
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
  if (!S) return;
  if (S.phase === 'lobby') {
    $('over').classList.add('hidden');
    $('react').classList.add('hidden');
    show('lobby');
    renderLobby(S);
  } else {
    show('battle');
    renderBattle(S);
  }
}

function renderLobbyShell() {
  $('lobby-code').textContent = app.mode === 'solo' ? 'SOLO' : (app.code || '····');
  $('btn-share').classList.toggle('hidden', !app.code);
  $('net-status').textContent = app.status;
}

function heroCard(cls, S) {
  const p = PREMADES[cls];
  const h = buildHero(cls);
  const owner = S.seats.find((s) => s.hero === cls);
  const mine = owner?.pid === app.me;
  const atk = h.attacks.map((a) => `${a.name} ${signed(a.hit.reduce((s, x) => s + x.value, 0))}`).join(' · ');
  const btn = mine ? '<button class="btn wide" data-unpick>✓ Yours (tap to drop)</button>'
    : owner ? `<button class="btn wide" disabled>Taken by ${esc(owner.name)}</button>`
      : `<button class="btn primary wide" data-pick="${cls}">Play the ${p.className}</button>`;
  return `<div class="hero ${mine ? 'mine' : ''}">
    <div class="em">${p.emoji}</div>
    <h3>${p.className}</h3>
    <div class="sub">${h.species} · ${h.background} · level 1</div>
    <div class="stats"><div><b>${h.ac}</b>AC</div><div><b>${h.hpMax}</b>HP</div><div><b>${h.speed}</b>ft</div></div>
    <p>${esc(p.blurb)}</p>
    <p class="sub">${esc(atk)}</p>
    <button class="btn small ghost" data-sheet="${cls}">Character sheet</button>
    ${btn}
  </div>`;
}

function renderLobby(S) {
  renderLobbyShell();
  $('seat-list').innerHTML = S.seats.map((s) => {
    const hero = s.hero ? `${PREMADES[s.hero].emoji} ${PREMADES[s.hero].className}` : '<span class="dim">watching</span>';
    return `<li class="${s.online ? '' : 'off'}"><span class="dot" style="background:${s.color}"></span>
      <span class="who">${esc(s.name)}${s.pid === app.me ? ' <span class="dim">(you)</span>' : ''}${s.host ? ' 👑' : ''}</span>${hero}</li>`;
  }).join('');
  $('hero-cards').innerHTML = ['fighter', 'rogue'].map((c) => heroCard(c, S)).join('');
  for (const b of document.querySelectorAll('[data-pick]')) b.onclick = () => send({ t: 'pick', hero: b.dataset.pick });
  for (const b of document.querySelectorAll('[data-unpick]')) b.onclick = () => send({ t: 'pick', hero: null });
  for (const b of document.querySelectorAll('[data-sheet]')) b.onclick = () => openSheet(sheetHtml(buildHero(b.dataset.sheet)));
  $('btn-start').classList.toggle('hidden', !isHost());
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

// A character sheet laid out like a real one: abilities, AC, HP, attacks, features.
function sheetHtml(c) {
  const R = (rule, label) => (rule && GLOSSARY[rule] ? `<a class="rl" data-rule="${rule}">${esc(label)}</a>` : esc(label));
  const abil = ABILITIES.map((a) => `<div>${a.toUpperCase()}<b>${signed(c.mods[a])}</b>${c.scores[a]}</div>`).join('');
  const ac = c.acParts.map((p) => `${esc(p.label)} ${p.value}`).join(' + ');
  const atks = c.attacks.map((a) => {
    const hit = a.hit.reduce((s, x) => s + x.value, 0);
    const flat = a.dmgFlat.reduce((s, x) => s + x.value, 0);
    const rng = a.range ? ` · range ${a.range[0]}/${a.range[1]} ft` : ' · reach 5 ft';
    const m = a.mastery ? ` · Mastery: ${R(MASTERIES[a.mastery].rule, MASTERIES[a.mastery].name)}` : '';
    const extra = a.advDice ? ` (+${a.advDice} with Advantage)` : '';
    return `<div class="ln"><span><b>${esc(a.name)}</b> ${R('attack-roll', signed(hit))} to hit${rng}${m}</span><b>${a.dice}${signed(flat)}${extra} ${a.type}</b></div>`;
  }).join('');
  const feats = (c.features || []).map((f) => `<p class="feat"><b>${R(f.rule, f.name)}</b>${f.source ? ` <span class="dim">(${esc(f.source)})</span>` : ''}: ${esc(f.text)}</p>`).join('');
  const subtitle = c.side === 'foe' ? `${esc(c.statName)} · Small Fey (Goblinoid)` : `${esc(c.species)} ${esc(c.className)} · ${esc(c.background)} background · level ${c.level}`;
  return `<h3>${c.emoji} ${esc(c.name)}</h3><p class="dim">${subtitle}</p>
    <div class="grid6">${abil}</div>
    <h4>Defense</h4>
    <div class="ln"><span>${R('armor-class', 'Armor Class')}: ${ac}</span><b>${c.ac}</b></div>
    <div class="ln"><span>Hit Points${c.hpParts ? ': ' + c.hpParts.map((p) => `${esc(p.label)} ${p.value}`).join(' + ') : ''}</span><b>${c.hp} / ${c.hpMax}</b></div>
    <div class="ln"><span>Speed</span><b>${c.speed} ft</b></div>
    <div class="ln"><span>${R('initiative', 'Initiative')}</span><b>${signed(c.initParts.reduce((s, p) => s + p.value, 0))}</b></div>
    ${c.pb ? `<div class="ln"><span>${R('proficiency', 'Proficiency Bonus')}</span><b>${signed(c.pb)}</b></div>` : ''}
    <h4>Attacks</h4>${atks}
    <h4>Features</h4>${feats}`;
}

// ------------------------------------------------------------- battle ----
const board = createBoard($('board'), onTap);
// After closing the end screen, tapping "Victory!" / "Defeat" brings it back.
$('b-turn').onclick = () => { if (app.S?.battle?.over) { $('over').dataset.dismissed = ''; render(); } };

function myHeroId() {
  return seatMe()?.hero || null;
}
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
    if (occ.id === me.id) { app.target = null; openSheet(sheetHtml(me)); }
    else if (occ.side !== me.side) app.target = app.target === occ.id ? null : occ.id;
    else if (occ.hp <= 0 && !occ.dead && !occ.stable && cheb(me, occ) <= 1) app.target = occ.id;
    else openSheet(sheetHtml(occ));
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
    : mt ? 'Your turn' : `${cur?.name}'s turn${cur?.side === 'hero' && S.control === 'ai' && !/\(AI\)$/.test(cur.name) ? ' (AI)' : ''}`;
  document.body.dataset.myturn = mt ? '1' : '';

  $('b-order').innerHTML = b.order.map((id) => {
    const c = b.creatures[id];
    const out = c.dead || (c.side === 'foe' && c.hp <= 0);
    return `<span class="${id === cur?.id ? 'cur' : ''} ${out ? 'out' : ''}" style="${colors[id] ? `border-color:${colors[id]}` : ''}">${c.emoji} ${esc(c.name)}</span>`;
  }).join('');

  const tip = mt ? coach(b, mine) : null;
  board.render({
    b, colors, curId: cur?.id, mine,
    reach: mt && !app.target ? reachableSquares(b, mine) : [],
    preview: mt ? app.preview : null,
    target: mt ? app.target : null,
    suggest: tip?.intent.a === 'move' && !app.preview ? tip.intent : null,
  });

  renderPanel(S, b, mine, mt, tip);
  renderLog(b);
  renderReact(S, b);
  renderOver(S, b);
}

function renderPanel(S, b, mine, mt, tip) {
  const P = $('panel');
  if (b.over) { P.innerHTML = ''; return; }
  if (!mt) {
    let text;
    if (b.pending && S.reactor === app.me) text = 'Your Reaction: decide below.';
    else if (b.pending) text = `${esc(b.creatures[b.pending.reactor].name)} is deciding on an ${'<a class="rl" data-rule="opportunity-attack">Opportunity Attack</a>'}…`;
    else if (!mine) text = 'You\'re watching. Tap a token to see its sheet.';
    else text = `Waiting for ${esc(b.creatures[b.order[b.idx]]?.name)}… Tap a square to ping it for your party.`;
    P.innerHTML = `<div class="waiting">${text}</div>`;
    return;
  }
  const me = b.creatures[mine];
  const t = b.turn;
  const chip = (on, label, rule) => `<span class="chip ${on ? '' : 'used'}"><a data-rule="${rule}">${label}</a></span>`;
  let html = `<div class="budget">
    ${chip(t.action, 'Action', 'your-turn')}${chip(t.bonus && me.secondWind?.uses, 'Bonus Action', 'your-turn')}
    ${chip(me.reaction, 'Reaction', 'opportunity-attack')}${chip(t.moveLeft >= 5, `Move ${t.moveLeft} ft`, 'movement')}</div>`;
  if (tip?.text && !app.target && !app.preview) {
    html += `<div class="coachline">💡 <span>${esc(tip.text)}</span><button class="btn" id="btn-coach">Do it</button></div>`;
  }
  if (app.target) html += targetCard(b, me, b.creatures[app.target]);
  else if (app.preview) {
    const oa = app.preview.oas.map((id) => esc(b.creatures[id].name)).join(' and ');
    html += `<div class="preview"><span>Move ${app.preview.feet} ft here?${oa ? ` <b class="bad">⚡ ${oa} gets an <a class="rl" data-rule="opportunity-attack">Opportunity Attack</a>.</b>` : ''} Tap the square again or</span>
      <button class="btn primary" id="btn-move">Move</button><button class="btn ghost" id="btn-cancel">✕</button></div>`;
  }
  html += `<div class="btns">
    <button class="btn" data-act="dash" ${t.action ? '' : 'disabled'}>Dash</button>
    <button class="btn" data-act="disengage" ${t.action ? '' : 'disabled'}>Disengage</button>
    <button class="btn" data-act="dodge" ${t.action ? '' : 'disabled'}>Dodge</button>
    ${me.secondWind ? `<button class="btn" data-act="second-wind" ${t.bonus && me.secondWind.uses ? '' : 'disabled'}>Second Wind (${me.secondWind.uses})</button>`
    : '<button class="btn end" data-act="end">End turn</button>'}
  </div>`;
  if (me.secondWind) html += '<button class="btn end wide" data-act="end">End turn</button>';
  P.innerHTML = html;
  for (const btn of P.querySelectorAll('[data-act]')) btn.onclick = () => act({ a: btn.dataset.act });
  for (const btn of P.querySelectorAll('[data-attack]')) btn.onclick = () => act({ a: 'attack', target: app.target, attack: btn.dataset.attack });
  for (const btn of P.querySelectorAll('[data-help]')) btn.onclick = () => act({ a: btn.dataset.help, target: app.target });
  if ($('btn-coach')) $('btn-coach').onclick = () => act(tip.intent);
  if ($('btn-move')) $('btn-move').onclick = () => { const e = app.preview.path[app.preview.path.length - 1]; doMove(e.x, e.y); };
  if ($('btn-cancel')) $('btn-cancel').onclick = () => { app.preview = null; renderBattle(app.S); };
  if ($('btn-tx')) $('btn-tx').onclick = () => { app.target = null; renderBattle(app.S); };
  if ($('btn-tinfo')) $('btn-tinfo').onclick = () => openSheet(sheetHtml(b.creatures[app.target]));
}

function targetCard(b, me, T) {
  const t = b.turn;
  let rows = '';
  if (T.side === me.side) {
    rows = `<div class="opt"><button class="btn primary" data-help="stabilize" ${t.action ? '' : 'disabled'}>Stabilize</button>
      <span class="why"><a class="rl" data-rule="stabilize">Help action</a>: DC 10 Wisdom (Medicine) check, you have ${signed(me.skills.medicine)}.</span></div>`;
  } else {
    for (const o of attackOptions(b, me, T)) {
      const flat = o.atk.dmgFlat.reduce((s, x) => s + x.value, 0);
      const bits = [`${Math.round(o.p * 100)}% to hit`, `${o.atk.dice}${signed(flat)} ${o.atk.type}`];
      if (o.mode === 'advantage') bits.push(`<b class="good">Advantage</b>: ${o.adv.map((a) => `<a class="rl" data-rule="${a.rule}">${esc(a.text)}</a>`).join(', ')}`);
      if (o.mode === 'disadvantage') bits.push(`<b class="bad">Disadvantage</b>: ${o.dis.map((a) => `<a class="rl" data-rule="${a.rule}">${esc(a.text)}</a>`).join(', ')}`);
      if (o.adv.length && o.dis.length) bits.push('<a class="rl" data-rule="advantage">Advantage and Disadvantage cancel</a>');
      if (o.sneak) bits.push(`<b class="good">+${me.sneak} <a class="rl" data-rule="sneak-attack">Sneak Attack</a></b>`);
      if (o.atk.mastery) bits.push(`<a class="rl" data-rule="${MASTERIES[o.atk.mastery].rule}">${MASTERIES[o.atk.mastery].name}</a>`);
      const why = o.ok ? bits.join(' · ') : `Out of ${o.atk.kind === 'melee' ? 'reach: move next to it first' : 'range'}.`;
      rows += `<div class="opt"><button class="btn primary" data-attack="${o.atk.id}" ${o.ok && t.action ? '' : 'disabled'}>${esc(o.atk.name)}</button><span class="why">${why}</span></div>`;
    }
    if (cheb(me, T) <= 1) {
      rows += `<div class="opt"><button class="btn" data-help="help" ${t.action ? '' : 'disabled'}>Help</button>
        <span class="why"><a class="rl" data-rule="help">Help action</a>: your ally's next attack on ${esc(T.name)} gets Advantage.</span></div>`;
    }
    if (!t.action) rows += '<div class="why dim">You have already used your action this turn.</div>';
  }
  return `<div class="target"><div class="th"><b>${T.emoji} ${esc(T.name)}</b>
    <span>AC ${T.ac} · HP ${T.hp}/${T.hpMax} <button class="btn small ghost" id="btn-tinfo">ⓘ</button><button class="btn small ghost" id="btn-tx">✕</button></span></div>${rows}</div>`;
}

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
    <p>${esc(M.name)} is leaving your reach. Use your Reaction for an <a class="rl" data-rule="opportunity-attack">Opportunity Attack</a>
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
  const rules = rulesSeen(b.log).map((k) => `<a class="chip rl" data-rule="${k}">${esc(GLOSSARY[k].title)}</a>`).join('');
  const win = b.over === 'victory';
  el.innerHTML = `<div class="card"><div class="logo">${win ? '🏆' : '💀'}</div><h2>${win ? 'Victory!' : 'Defeat'}</h2>
    <p class="dim">${win ? 'The goblins are beaten' : 'The goblins win this time'} after ${b.round} round${b.round === 1 ? '' : 's'}.</p>
    <h4 class="kicker">Rules you used: tap one to read it again</h4>
    <div class="chips">${rules}</div>
    ${isHost() ? '<button class="btn primary wide" id="btn-again">Back to the lobby</button>' : '<p class="dim">Waiting for the host…</p>'}
    <button class="btn ghost wide" id="btn-over-log">See the combat log</button></div>`;
  el.classList.remove('hidden');
  if ($('btn-again')) $('btn-again').onclick = () => send({ t: 'again' });
  $('btn-over-log').onclick = () => { el.classList.add('hidden'); el.dataset.dismissed = String(b.seq); };
}
