// Skyline Hustle - entry point: title screen, LAN lobby, game loop, saves.
//
// Single-player runs the simulation right here. In a LAN game the server
// (server.mjs) owns the city: this phone shows the state it receives, sends
// actions, and sets the speed it would like (the city runs at the slowest).

import { SPEEDS, SECONDS_PER_HOUR, SCENARIOS, MAPS, eraName } from './data.js';
import { createGame, serialize, deserialize, money, netWorth, dayName, yearOf, operating, goalProgress, goalText, raceGoal, setMap, MAP } from './sim.js';
import { advanceGame } from './game.js';
import { unreadCount } from './advisor.js';
import { AVATARS, faceHTML } from './faces.js';
import { createRoom } from './room.js';
import { Host, LocalNet, RtcNet, onlineSupported, normCode } from './online.js';
import { auctionTick } from './auction.js';
import { perform } from './actions.js';
import { Renderer3D } from './render3d.js';
import { UI, getMe, setMe } from './ui.js';
import { Net, lanAvailable } from './net.js';
import { sfx, setSound } from './audio.js';
import { musicUpdate, unlockMusic, pauseMusic, setMusic, setMusicVolume } from './music.js';

const SAVE_KEY = 'skyline-hustle-save-v4';
const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const token = localStorage.getItem('skyline-token') || (() => {
  const t = Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem('skyline-token', t);
  return t;
})();

const app = {
  s: null,
  speed: 1,
  holds: new Set(),
  renderer: null,
  ui: null,
  lastDay: 0,
  mp: null,                 // LAN session: { net, pid, host, flow, pending, ... }
  citizenCache: new Map(),
  histCache: new Map(),
  histAsked: new Map(),
  // LAN: ask the server for a business's (or the company's) daily history.
  fetchHistory(lot) {
    if (!this.mp) return;
    const now = performance.now();
    if (now - (this.histAsked.get(lot) || 0) < 2500) return;
    this.histAsked.set(lot, now);
    this.mp.net.send({ t: 'hist', lot });
  },

  // ---------------------------------------------------------- actions ----
  act(name, ...args) {
    if (!this.mp) return Promise.resolve(perform(this.s, getMe(), name, args));
    const id = ++this.mp.seq;
    return new Promise(resolve => {
      this.mp.pending.set(id, resolve);
      this.mp.net.send({ t: 'act', id, name, args });
      setTimeout(() => { if (this.mp?.pending.delete(id)) resolve({ ok: false, msg: 'No answer from the server.' }); }, 6000);
    });
  },

  // Speed buttons: instant in single-player. In LAN games ⏸ pauses for
  // everyone at once, and the others set the speed you'd like: the city runs
  // at the slowest player's choice.
  requestSpeed(i) {
    if (!this.mp) return this.setSpeed(i);
    if (i === 0 || (this.mp.flow?.pause && this.mp.flow.pause.by === getMe())) this.mp.net.send({ t: 'pause' });
    if (i > 0) { this.mp.net.send({ t: 'want', speed: i }); (this.mp.flow ||= { wants: {} }).wants[getMe()] = i; this.speedButtons(); }
  },
  setSpeed(i) {
    this.speed = i;
    this.speedButtons();
  },
  speedButtons() {
    const want = this.mp ? this.mp.flow?.wants?.[getMe()] || 1 : this.speed;
    const pause = this.mp?.flow?.pause;
    document.querySelectorAll('#speeds button').forEach(b => {
      const v = +b.dataset.speed;
      b.classList.toggle('on', v === this.speed);
      b.classList.toggle('mine', !!this.mp && v === want && v !== this.speed);
    });
    $('speed-cd').textContent = pause ? `${pause.left}s` : '';
    $('speed-cd').classList.toggle('hidden', !pause);
  },
  pauseFor(why) { this.holds.add(why); },
  resume(why) { this.holds.delete(why); },
  running() {
    if (!this.s || this.s.over || this.s.auction || this.speed === 0) return false;
    return this.mp ? true : !this.holds.size && !this.ui.modalOpen();
  },

  save() {
    if (this.mp || !this.s || this.s.over) return;
    try { localStorage.setItem(SAVE_KEY, serialize(this.s)); } catch (e) { /* storage full or blocked */ }
  },

  start(s) {
    this.s = s;
    s.liveAuctions = true;
    this.lastDay = s.day;
    this.overShown = false;
    this.ui.seenNews = 0;
    this.ui.shownOffers.clear();
    this.ui.alertSeen = undefined;
    this.ui.inboxFilter = 'all';
    this.ui.tickerQueue = [];
    ['title', 'lobby'].forEach(id => $(id).classList.add('hidden'));
    ['hud', 'nav', 'camctl'].forEach(id => $(id).classList.remove('hidden'));
    if (MAP.id !== (s.mapId || 'town')) setMap(s.mapId || 'town');
    if (this.renderer.mapId !== MAP.id) this.renderer.setCity();
    this.renderer.fit();
    this.ui.close();
    this.ui.hideModal();
    if (!this.mp) { setMe(0); this.setSpeed(1); }
    this.ui.onHour();
    this.hud();
  },

  // Download the current game (or, from the title, the last save) as a file.
  exportSave() {
    const data = this.s ? serialize(this.s) : localStorage.getItem(SAVE_KEY);
    if (!data) { this.ui.toast('No saved game yet.', 'bad'); return; }
    const s = this.s || JSON.parse(data);
    const name = `skyline-${String(s.players?.[getMe() >= 0 ? getMe() : 0]?.company || 'save').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-day${s.day}.json`;
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.ui.toast(`Saved ${name}`, 'good');
  },
  importSave() {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const s = deserialize(await f.text());
        if (this.mp) return;
        this.ui.hideModal();
        this.start(s);
        this.ui.toast(`Loaded day ${s.day}.`, 'good');
      } catch (e) { this.ui.toast('That file is not a Skyline Hustle save.', 'bad'); }
    });
    inp.click();
  },

  toTitle() {
    if (this.mp) {
      this.mp.net.close();
      if (this.mp.tickTimer) clearInterval(this.mp.tickTimer);
      this.mp.hostSession?.stop();
      this.mp.wake?.release?.();
      this.mp = null;
    }
    this.s = null;
    if (MAP.id !== 'town' || !this.demo) {
      this.demo = createGame({ scenario: 'sandbox', seed: 4 });
      this.demo.hour = 17;
    }
    if (this.renderer.mapId !== MAP.id) this.renderer.setCity();
    this.ui.close();
    ['hud', 'nav', 'sheet', 'auction', 'camctl', 'vote', 'lobby'].forEach(id => $(id).classList.add('hidden'));
    $('modal').classList.add('hidden');
    $('btn-continue').classList.toggle('hidden', !localStorage.getItem(SAVE_KEY));
    $('btn-export').classList.toggle('hidden', !localStorage.getItem(SAVE_KEY));
    $('title').classList.remove('hidden');
    $('net-status').classList.add('hidden');
  },

  hud() {
    const s = this.s;
    if (!s || getMe() < 0) return;
    const me = s.players[getMe()];
    const unread = unreadCount(me), bell = $('bell-n');
    if (bell.textContent !== String(unread)) bell.textContent = unread;
    bell.classList.toggle('hidden', !unread);
    $('bell').classList.toggle('urgent', (me.inbox?.list || []).some(a => !a.read && !a.done && a.sev === 'bad'));
    $('cash').textContent = money(me.cash);
    $('cash').className = me.cash < 0 ? 'neg' : '';
    const today = operating(me.today);
    $('cash-delta').innerHTML = `today <span class="${today >= 0 ? 'pos' : 'neg'}">${today >= 0 ? '+' : ''}${money(today)}</span>${me.loan ? ` · loan ${money(me.loan)}` : ''}`;
    const mins = Math.floor(s.t * 60 / 15) * 15;
    $('clock-time').textContent = `${String(s.hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    $('clock-day').textContent = `${dayName(s)} · Day ${s.day} · ${yearOf(s)}`;
    const sc = SCENARIOS[s.scenario];
    const w = netWorth(s, getMe());
    let pct = 0, text;
    if (sc.mode === 'goals') {
      const gi = (me.goals || []).findIndex(x => !x.done);
      const g = s.goals[gi];
      if (me.failed) text = 'You missed a milestone: out of the running';
      else if (g) {
        const v = goalProgress(s, g, getMe());
        pct = v / g.n * 100;
        const left = g.by - s.day + 1;
        text = `🎯 ${goalText(g)} · ${left} day${left === 1 ? '' : 's'} left`;
      } else text = 'All milestones complete!';
    } else if (sc.mode === 'race') {
      pct = w / raceGoal(s) * 100;
      text = `Net worth ${money(w)} / ${money(raceGoal(s))} · ${Math.max(0, sc.days - s.day + 1)} days left`;
    } else text = `Net worth ${money(w)} · ${eraName(yearOf(s))}`;
    if (s.freePlay) {
      const r = s.result;
      pct = 0;
      text = `Free play · net worth ${money(w)}${r ? ` · ${r.winner === getMe() ? 'you won' : r.winner >= 0 ? s.players[r.winner].company.split(' ')[0] + ' won' : 'game lost'} on day ${r.day}` : ''}`;
    }
    $('goal-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
    $('goal-text').textContent = text;
  },

  // Called whenever the clock has moved on by whole hours.
  afterHour(steps) {
    const s = this.s;
    const r = this.renderer;
    if (steps <= 2 && s.lastHour) {
      let earned = false;
      for (const id in s.lastHour) {
        const lot = s.lots[id];
        const v = s.lastHour[id];
        if (!lot.business || lot.business.owner !== getMe()) continue;
        if (v > 4) { r.floater(lot, '+' + money(v), '#5dff9e'); earned = true; }
        else if (v < -4) r.floater(lot, money(v), '#ff8a8a');
      }
      if (earned) sfx.coin();
    }
    if (s.day !== this.lastDay) {
      this.lastDay = s.day;
      const y = s.players[getMe()].yesterday;
      const op = operating(y);
      if (Object.keys(y).length) this.ui.toast(`Day ${s.day - 1} closed: ${op >= 0 ? '+' : ''}${money(op)} operating profit.`, op >= 0 ? 'good' : 'bad');
      this.save();
    }
    this.ui.onHour();
    this.checkOver();
  },
  checkOver() {
    if (!this.s.over) { if (this.overShown) { this.overShown = false; this.ui.hideModal(); } return; }
    if (!this.overShown) {
      this.overShown = true;
      // Keep the finished game: Continue reopens it to keep playing or export.
      if (!this.mp) try { localStorage.setItem(SAVE_KEY, serialize(this.s)); } catch (e) { /* storage full */ }
      this.ui.gameOver();
    }
  },
};
app.renderer = new Renderer3D($('city'));
app.ui = new UI(app);
app.renderer.onLost = () => app.ui.toast('Graphics hiccup: restarting the 3D view…', 'bad');
app.renderer.onRestored = () => app.ui.toast('3D view restored (graphics turned down a notch; change it in Menu).', 'good');
app.renderer.onTap = (x, y) => {
  if (!app.s) return;
  const hit = app.renderer.pick(x, y);
  if (!hit) { if (app.ui.view) app.ui.close(); return; }
  sfx.tap();
  if (hit.kind === 'citizen') { app.ui.openCitizen(hit.id); app.fetchCitizen(hit.id); }
  else app.ui.openLot(hit.id);
};
app.fetchCitizen = id => { if (app.mp) app.mp.net.send({ t: 'citizen', id }); };
document.querySelectorAll('#speeds button').forEach(b => b.addEventListener('click', () => app.requestSpeed(+b.dataset.speed)));

// ---------------------------------------------------------------- LAN ----
function newSession(extra = {}) {
  const company = $('in-company').value.trim() || 'Your Company';
  const name = $('in-name').value.trim() || 'Player';
  localStorage.setItem('skyline-company', company);
  localStorage.setItem('skyline-name', name);
  const mp = {
    net: null, pid: -1, host: false, flow: null, pending: new Map(), seq: 0,
    lobby: null, seats: [], addresses: app.lan?.addresses || [], lastState: 0, ...extra,
  };
  app.mp = mp;
  $('title').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  $('lobby-body').innerHTML = '<p class="note">Connecting…</p>';
  return { mp, hello: { token, name, company, avatar: avatarPick } };
}
const netStatus = status => {
  const msg = { online: '', connecting: '📶 Connecting…', offline: '📶 Reconnecting…', blocked: '📶 Can\'t reach the host from this network. Try wifi, or the same wifi as the host.', noroom: '' }[status] ?? '📶 Reconnecting…';
  $('net-status').textContent = msg;
  $('net-status').classList.toggle('hidden', !msg);
};

function joinLan() {
  const { mp, hello } = newSession();
  mp.net = new Net(onNet, netStatus);
  mp.net.connect(hello);
}

// Online, hosting: this phone runs the room; friends connect with the code.
async function hostOnline() {
  const { mp, hello } = newSession({ online: true });
  const room = createRoom({
    store: {
      load: () => localStorage.getItem('skyline-online-save'),
      save: d => { try { localStorage.setItem('skyline-online-save', d); } catch (e) { /* full */ } },
      exists: () => !!localStorage.getItem('skyline-online-save'),
      remove: () => localStorage.removeItem('skyline-online-save'),
    },
  });
  mp.room = room;
  mp.tickTimer = setInterval(room.tick, 50);
  mp.net = new LocalNet(room, onNet, netStatus);
  mp.net.connect(hello);
  mp.hostSession = new Host(room, { name: hello.name, onStatus: s => { mp.signal = s; } });
  try {
    mp.code = await mp.hostSession.start();
    renderLobby();
  } catch (e) {
    mp.code = null;
    mp.codeError = true;
    renderLobby();
  }
  // Keep the host's screen awake: the city runs here.
  try { mp.wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* not supported */ }
}

// Online, joining a friend's room by its code.
function joinOnline(code) {
  code = normCode(code);
  if (code.length !== 4) { app.ui.toast('Room codes have 4 letters.', 'bad'); return; }
  const { mp, hello } = newSession({ online: true, code });
  mp.net = new RtcNet(code, onNet, status => {
    if (status === 'noroom') {
      app.toTitle();
      app.ui.toast(`No game with the code ${code}. Check it with the host.`, 'bad');
      return;
    }
    mp.joinStatus = status;
    if (!mp.lobby && !app.s) showJoining(mp);
    else netStatus(status);
  });
  mp.net.connect(hello);
}

// What a joining phone shows until it's in the lobby: each step, and if the
// link can't be made, why and what to try.
function showJoining(mp) {
  const st = mp.joinStatus;
  const steps = { finding: 'Finding the room…', gathering: 'Working out how to reach the host…', waiting: "Waiting for the host's phone to answer…",
    linking: 'Connecting to the host…', online: 'Connected! Loading the lobby…', offline: 'Trying again…' };
  const d = mp.net?.diag;
  const types = d ? `<p class="note dim" style="font-size:11px">Your phone: ${(d.mine || []).join(', ') || 'no addresses'}${d.host ? ` · host: ${d.host.join(', ') || 'none'}` : ''}</p>` : '';
  const html = st === 'blocked'
    ? `<div class="room-code"><small>Room ${esc(mp.code)}</small><b style="font-size:26px;letter-spacing:0">Couldn't connect</b>
        <small>Your phone and the host's phone can't reach each other directly.</small></div>
       <p class="note">Things to try: make sure the host still has the game open on screen (if they switched apps, their phone pauses the game). Join from the same wifi as the host, or switch one phone between wifi and mobile data.</p>
       ${types}
       <div class="row"><button class="btn go wide" id="join-retry">Try again</button></div>
       <div class="row"><button class="btn small wide" id="join-cancel">Back to title</button></div>`
    : `<div class="room-code"><small>Joining room</small><b>${esc(mp.code)}</b><small>${steps[st] || 'Connecting…'}</small></div>${types}
       <div class="row"><button class="btn small wide" id="join-cancel">Cancel</button></div>`;
  $('lobby-body').innerHTML = html;
  $('lobby-kind').textContent = 'GAME';
  $('join-retry')?.addEventListener('click', () => { sfx.tap(); mp.joinStatus = 'finding'; showJoining(mp); mp.net.retry(); });
  $('join-cancel')?.addEventListener('click', () => { sfx.tap(); app.toTitle(); });
}

function onNet(m) {
  const mp = app.mp;
  if (!mp) return;
  switch (m.t) {
    case 'lobby':
      mp.lobby = m;
      mp.host = m.host;
      if (app.s) {                               // the host ended the game
        app.s = null;
        app.ui.close();
        ['hud', 'nav', 'sheet', 'auction', 'camctl', 'vote'].forEach(id => $(id).classList.add('hidden'));
        app.ui.hideModal();
      }
      $('lobby').classList.remove('hidden');
      renderLobby();
      break;
    case 'you':
      mp.pid = m.pid;
      mp.host = m.host;
      mp.seats = m.seats;
      setMe(Math.max(0, m.pid));
      if (m.pid < 0) showClaim();
      break;
    case 'state': applyState(m); break;
    case 'clock':
      if (app.s && app.s.day === m.day && app.s.hour === m.hour) app.s.t = Math.max(app.s.t, m.tt);
      if (m.speed !== app.speed) app.setSpeed(m.speed);
      mp.flow = m.flow;
      app.ui.flowFrame(mp);
      app.speedButtons();
      break;
    case 'result': {
      const r = mp.pending.get(m.id);
      if (r) { mp.pending.delete(m.id); r(m.res || { ok: false }); }
      break;
    }
    case 'notice': app.ui.toast(m.text, m.kind || ''); break;
    case 'hist':
      app.histCache.set(m.lot, m.days);
      if (app.ui.view) app.ui.refresh();
      break;
    case 'citizen':
      if (m.c) app.citizenCache.set(m.id, m.c);
      if (app.ui.view?.kind === 'citizen' && app.ui.view.id === m.id) app.ui.render();
      break;
  }
}

function applyState(m) {
  const mp = app.mp;
  const prev = app.s;
  const s = m.s;
  s.cz = { list: [], trips: m.trips, visitsToday: 0 };
  mp.flow = m.flow;
  mp.seatInfo = m.seats;
  if (s.mapId && s.mapId !== MAP.id) { setMap(s.mapId); app.renderer.setCity(); }
  app.s = s;
  if (!prev) {
    $('lobby').classList.add('hidden');
    app.start(s);
    app.ui.toast(mp.pid >= 0 ? `You are ${s.players[mp.pid].company}. Speed changes need everyone's agreement.` : 'Watching.', 'good');
  }
  if (m.speed !== app.speed) app.setSpeed(m.speed);
  app.speedButtons();
  app.ui.flowFrame(mp);
  // Did the clock move?
  const steps = prev ? (s.day - prev.day) * 24 + (s.hour - prev.hour) : 0;
  if (steps > 0) app.afterHour(steps);
  else { app.ui.onHour(); app.checkOver(); }
  if (s.auction) app.ui.auctionFrame();
  else if (prev?.auction && s.lastAuction) { app.ui.auctionFrame(); app.ui.auctionResult(s.lastAuction, s.lastAuction.lotId); }
}

function renderLobby() {
  const mp = app.mp, L = mp.lobby;
  const sc = SCENARIOS[L.settings.scenario];
  const full = L.players.length > L.max;
  $('lobby-body').innerHTML = `
    ${mp.online ? `<div class="room-code">${mp.code ? `<small>Room code</small><b>${esc(mp.code)}</b><small>Friends open ${esc(location.host || 'the game')} and enter it under <em>Play with friends</em>.</small>${location.protocol.startsWith('http') ? '<div class="row" style="justify-content:center;margin:8px 0 0"><button class="btn small" id="lob-share">🔗 Share invite link</button></div>' : ''}` : mp.codeError ? '<small class="neg">Couldn\'t create a room code: check your internet connection and try again.</small>' : '<small>Getting a room code…</small>'}</div>
      ${mp.room ? '<p class="note">📱 Your phone runs this game. Keep this screen open while you play; if it sleeps, the city pauses for everyone.</p>' : ''}`
    : `<p class="note">${mp.addresses.length ? `Friends on the same wifi open <b>${esc(mp.addresses[0])}</b> and tap <b>LAN</b>.` : 'Friends on the same wifi open this same address.'}</p>`}
    <h3>Players <em>${Math.min(L.players.length, L.max)} / ${L.max}${L.players.length < L.max ? ' · rivals fill the rest' : ''}</em></h3>
    ${L.players.map((p, i) => `<div class="list-item">${faceHTML({ human: true, avatar: p.avatar, name: p.name, color: '#2ee6ff' }, 36)}<span class="grow"><b>${esc(p.company)}</b><small>${esc(p.name)}${p.host ? ' · host' : ''}${p.token === L.you ? ' · you' : ''}${i >= L.max ? ' · no seat (game full)' : ''}</small></span></div>`).join('')}
    ${full ? '<p class="note warn">Only the first 4 players get a company.</p>' : ''}
    <h3>Your face</h3><div class="avatars small" id="lob-avatar"></div>
    <h3>Game</h3>
    ${mp.host ? `
      <div class="seg wrap" id="lob-scenario">${Object.entries(SCENARIOS).map(([k, v]) => `<button data-v="${k}" class="${k === L.settings.scenario ? 'on' : ''}">${v.name}<small>${v.year}</small></button>`).join('')}</div>
      <p class="note">${esc(sc.blurb)}</p>
      <div class="seg wrap" id="lob-map">${Object.entries(MAPS).map(([k, v]) => `<button data-v="${k}" class="${k === (L.settings.map || 'town') ? 'on' : ''}">${v.name}<small>${v.cols * v.rows - v.parks - v.transit - v.utility} blocks</small></button>`).join('')}</div>
      <p class="note">${esc(MAPS[L.settings.map || 'town'].blurb)}</p>
      <div class="seg" id="lob-check">${[['off', 'No check-ins'], ['weekly', 'Weekly review'], ['daily', 'Daily review']].map(([k, n]) => `<button data-v="${k}" class="${k === (L.settings.checkpoint || 'weekly') ? 'on' : ''}">${n}</button>`).join('')}</div>
      <p class="note">Speed: everyone picks the speed they'd like and the city runs at the slowest. Anyone can pause (up to ${60}s at a time). Reviews stop the clock for a summary until everyone taps Ready.</p>
      <div class="seg" id="lob-diff">${[['easy', 'Relaxed'], ['normal', 'Sharp'], ['hard', 'Ruthless']].map(([k, n]) => `<button data-v="${k}" class="${k === L.settings.difficulty ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="row"><button class="btn go wide" id="lob-start">Start game for everyone</button></div>
      ${L.canResume ? '<div class="row"><button class="btn wide" id="lob-resume">Resume the saved LAN game</button></div>' : ''}`
    : `<p class="note"><b>${esc(sc.name)}</b> (${sc.year}) · ${esc(sc.blurb)}<br>Map: <b>${esc(MAPS[L.settings.map || 'town'].name)}</b> · ${esc(MAPS[L.settings.map || 'town'].blurb)}<br>Waiting for the host to start…</p>`}
    <div class="row"><button class="btn small" id="lob-leave">Back to title</button></div>`;
  const bind = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => { sfx.tap(); fn(b); }));
  bind('#lob-scenario button', b => mp.net.send({ t: 'setup', scenario: b.dataset.v }));
  bind('#lob-check button', b => mp.net.send({ t: 'setup', checkpoint: b.dataset.v }));
  bind('#lob-map button', b => mp.net.send({ t: 'setup', map: b.dataset.v }));
  bind('#lob-diff button', b => mp.net.send({ t: 'setup', difficulty: b.dataset.v }));
  bind('#lob-start', () => mp.net.send({ t: 'start' }));
  bind('#lob-resume', () => mp.net.send({ t: 'start', resume: true }));
  bind('#lob-leave', () => app.toTitle());
  avatarRow($('lob-avatar'), () => mp.net.send({ t: 'profile', avatar: avatarPick }));
  $('lobby-kind').textContent = mp.online ? 'GAME' : 'LAN';
  $('lob-share')?.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?join=${mp.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Skyline Hustle', text: `Join my Skyline Hustle game: code ${mp.code}`, url });
      else { await navigator.clipboard.writeText(url); app.ui.toast('Invite link copied.', 'good'); }
    } catch (e) { /* cancelled */ }
  });
}

// Joined a game already under way without a seat: take over a free one.
function showClaim() {
  const seats = app.mp.seats.filter(st => !st.taken);
  app.ui.modal(`<h2>Game in progress</h2>
    ${seats.length ? `<p>Take over a company whose player isn't here:</p>${seats.map(st => `<div class="row"><button class="btn go wide" data-act="claim" data-pid="${st.pid}">${esc(st.company)}</button></div>`).join('')}`
      : '<p>Every seat is taken. You can watch the city; ask the host to start a new game to join in.</p>'}
    <div class="row"><button class="btn small wide" data-act="modal-cancel">Just watch</button></div>`);
}

// --------------------------------------------------------------- loop ----
let last = performance.now();
let hudAt = 0, citAt = 0, cdAt = 0;
function frame(now) {
  const real = Math.min(1, (now - last) / 1000);
  const dt = Math.min(0.1, real);
  last = now;
  app.fps = app.fps ? app.fps * 0.95 + (1 / Math.max(real, 0.001)) * 0.05 : 30;
  const s = app.s;
  if (s) {
    let steps = 0;
    if (app.mp) {
      // The server runs the city; glide the clock between its updates.
      if (app.running()) s.t = Math.min(0.97, s.t + dt * SPEEDS[app.speed] / SECONDS_PER_HOUR);
      if (s.auction) app.ui.auctionFrame();
      if (now > cdAt) {
        cdAt = now + 1000;
        if (app.mp.flow?.pause) { app.mp.flow.pause.left = Math.max(0, app.mp.flow.pause.left - 1); app.ui.flowFrame(app.mp); }
        app.speedButtons();
      }
    } else if (s.auction) {
      auctionTick(s, real);       // real seconds, even on a slow device
      app.ui.auctionFrame();
      if (!s.auction && s.lastAuction) {
        app.ui.auctionResult(s.lastAuction, s.lastAuction.lotId);
        app.ui.auctionFrame();
        app.ui.onHour();
      }
    } else if (app.running()) steps = advanceGame(s, dt * SPEEDS[app.speed] / SECONDS_PER_HOUR);
    if (steps) app.afterHour(steps);
    if (!app.mp && s.auction) app.ui.auctionFrame();
    if (now > hudAt) { app.hud(); hudAt = now + 150; }
    if (app.ui.view?.kind === 'citizen' && now > citAt) {
      citAt = now + (app.mp ? 1000 : 500);
      if (app.mp) app.fetchCitizen(app.ui.view.id); else app.ui.refresh();
    }
    app.ui.tickTicker(now);
    app.renderer.draw(s, s.hour + s.t, dt, app.running() ? SPEEDS[app.speed] : 0);
    musicUpdate(eraName(yearOf(s)), { night: s.hour >= 21 || s.hour < 6, auction: !!s.auction });
  } else {
    // Title screen: a slowly turning city behind the menu.
    if (!app.demo) { app.demo = createGame({ scenario: 'sandbox', seed: 4 }); app.demo.hour = 17; }
    app.demo.t += dt * 0.05;
    if (app.demo.t >= 1) { app.demo.t -= 1; app.demo.hour = (app.demo.hour + 1) % 24; }
    app.renderer.want.yaw += dt * 0.08;
    app.renderer.draw(app.demo, app.demo.hour + app.demo.t, dt, 1);
    musicUpdate('Jazz Age', { title: true });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => { app.renderer.resize(); });
window.addEventListener('keydown', e => {
  if (!app.s || e.target.tagName === 'INPUT') return;
  if (e.key === ' ') { e.preventDefault(); app.requestSpeed(app.speed ? 0 : 1); }
  else if (e.key >= '0' && e.key <= '3') app.requestSpeed(+e.key);
  else if (e.key === 'q') app.renderer.rotate(-Math.PI / 4);
  else if (e.key === 'e') app.renderer.rotate(Math.PI / 4);
  else if (e.key === 'Escape' && app.ui.view) app.ui.close();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) app.save(); pauseMusic(document.hidden); });
// Closing the tab while hosting online: take the room code down.
window.addEventListener('pagehide', () => { app.mp?.hostSession?.stopNow(); });
// Browsers only start audio after the first tap.
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => unlockMusic(), { passive: true });

// --------------------------------------------------------------- title ----
let scenario = 'boomtown', difficulty = 'normal', mapPick = 'town';
let avatarPick = Math.max(0, Math.min(AVATARS.length - 1, +(localStorage.getItem('skyline-avatar') || 0)));
function avatarRow(el, onPick) {
  el.innerHTML = AVATARS.map((src, i) => `<button data-v="${i}" class="${i === avatarPick ? 'on' : ''}" aria-label="Face ${i + 1}"><img src="${src}" alt=""></button>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    avatarPick = +b.dataset.v;
    localStorage.setItem('skyline-avatar', avatarPick);
    el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    sfx.tap();
    onPick?.();
  }));
}
avatarRow($('seg-avatar'));
const segPick = (id, cb) => document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === b));
  cb(b.dataset.v);
  sfx.tap();
}));
const blurb = () => {
  const sc = SCENARIOS[scenario];
  $('scenario-blurb').innerHTML = `<b>${sc.name}</b> · ${sc.blurb}` +
    (sc.goals ? `<br>${sc.goals.map(g => `${goalText(g)} by day ${g.by}`).join(' · ')}` : '');
};
segPick('seg-scenario', v => { scenario = v; blurb(); });
segPick('seg-difficulty', v => { difficulty = v; });
$('seg-map').innerHTML = Object.entries(MAPS).map(([k, v]) => `<button data-v="${k}" class="${k === mapPick ? 'on' : ''}">${v.name}<small>${v.cols * v.rows - v.parks - v.transit - v.utility} blocks</small></button>`).join('');
const mapBlurb = () => { const m = MAPS[mapPick]; $('map-blurb').innerHTML = `<b>${m.name}</b> · ${m.blurb}${m.goalMult > 1 ? ` · race goals ×${m.goalMult}` : ''}`; };
segPick('seg-map', v => { mapPick = v; mapBlurb(); });
mapBlurb();
blurb();
$('in-company').value = localStorage.getItem('skyline-company') || '';
$('in-name').value = localStorage.getItem('skyline-name') || '';
$('btn-new').addEventListener('click', () => {
  const company = $('in-company').value.trim() || 'Your Company';
  localStorage.setItem('skyline-company', company);
  sfx.build();
  app.start(createGame({ scenario, difficulty, company, name: 'You', map: mapPick, avatar: avatarPick }));
  setTimeout(() => app.ui.toast('Tap any empty lot to open a shop, or call an auction to buy city land.', 'good'), 600);
});
$('btn-continue').addEventListener('click', () => {
  try { app.start(deserialize(localStorage.getItem(SAVE_KEY))); sfx.tap(); }
  catch (e) { localStorage.removeItem(SAVE_KEY); app.toTitle(); }
});
$('btn-lan').addEventListener('click', () => { sfx.tap(); joinLan(); });
$('btn-host').addEventListener('click', () => { sfx.tap(); hostOnline(); });
$('btn-join').addEventListener('click', () => { sfx.tap(); joinOnline($('in-code').value); });
$('in-code').addEventListener('input', e => { e.target.value = normCode(e.target.value); });
if (!onlineSupported()) $('online-row').classList.add('hidden');
// A shared link like play.jteef.com/?join=KXPF fills in the code.
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) $('in-code').value = normCode(joinParam);
$('btn-export').addEventListener('click', () => { sfx.tap(); app.exportSave(); });
$('btn-import').addEventListener('click', () => { sfx.tap(); app.importSave(); });
setSound(localStorage.getItem('skyline-sound') !== '0');
setMusic(localStorage.getItem('skyline-music') !== '0');
setMusicVolume(+(localStorage.getItem('skyline-music-vol') || 0.6));
app.toTitle();
// The LAN button only appears when the page comes from server.mjs.
lanAvailable().then(info => {
  app.lan = info;
  if (info) $('lan-box').classList.remove('hidden');
});

window.__SH = app;
