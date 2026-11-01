// Skyline Hustle - entry point: title screen, LAN lobby, game loop, saves.
//
// Single-player runs the simulation right here. In a LAN game the server
// (server.mjs) owns the city: this phone shows the state it receives, sends
// actions, and proposes speed changes that the other players vote on.

import { SPEEDS, SECONDS_PER_HOUR, SCENARIOS, eraName } from './data.js';
import { createGame, serialize, deserialize, money, netWorth, dayName, yearOf, operating, goalProgress, goalText } from './sim.js';
import { advanceGame } from './game.js';
import { auctionTick } from './auction.js';
import { perform } from './actions.js';
import { Renderer3D } from './render3d.js';
import { UI, getMe, setMe } from './ui.js';
import { Net, lanAvailable } from './net.js';
import { sfx, setSound } from './audio.js';

const SAVE_KEY = 'skyline-hustle-save-v3';
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
  mp: null,                 // LAN session: { net, pid, host, vote, cooldowns, pending, ... }
  citizenCache: new Map(),

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

  // Speed buttons: instant in single-player, a proposal in LAN games.
  requestSpeed(i) {
    if (!this.mp) return this.setSpeed(i);
    this.mp.net.send({ t: 'speed', speed: i });
  },
  setSpeed(i) {
    this.speed = i;
    this.speedButtons();
  },
  speedButtons() {
    const cd = this.mp ? (this.mp.cooldowns[getMe()] || 0) : 0;
    const voting = this.mp?.vote;
    document.querySelectorAll('#speeds button').forEach(b => {
      b.classList.toggle('on', +b.dataset.speed === this.speed);
      b.classList.toggle('wait', !!(cd || voting) && +b.dataset.speed !== this.speed);
    });
    $('speed-cd').textContent = cd ? `${cd}s` : '';
    $('speed-cd').classList.toggle('hidden', !cd);
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
    this.ui.tickerQueue = [];
    ['title', 'lobby'].forEach(id => $(id).classList.add('hidden'));
    ['hud', 'nav', 'camctl'].forEach(id => $(id).classList.remove('hidden'));
    this.renderer.fit();
    this.ui.close();
    this.ui.hideModal();
    if (!this.mp) { setMe(0); this.setSpeed(1); }
    this.ui.onHour();
    this.hud();
  },

  toTitle() {
    if (this.mp) { this.mp.net.close(); this.mp = null; }
    this.s = null;
    this.ui.close();
    ['hud', 'nav', 'sheet', 'auction', 'camctl', 'vote', 'lobby'].forEach(id => $(id).classList.add('hidden'));
    $('modal').classList.add('hidden');
    $('btn-continue').classList.toggle('hidden', !localStorage.getItem(SAVE_KEY));
    $('title').classList.remove('hidden');
    $('net-status').classList.add('hidden');
  },

  hud() {
    const s = this.s;
    if (!s || getMe() < 0) return;
    const me = s.players[getMe()];
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
      pct = w / sc.goal * 100;
      text = `Net worth ${money(w)} / ${money(sc.goal)} · ${Math.max(0, sc.days - s.day + 1)} days left`;
    } else text = `Net worth ${money(w)} · ${eraName(yearOf(s))}`;
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
    if (this.s.over && !this.overShown) {
      this.overShown = true;
      if (!this.mp) localStorage.removeItem(SAVE_KEY);
      this.ui.gameOver();
    }
  },
};
app.renderer = new Renderer3D($('city'));
app.ui = new UI(app);
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
function joinLan() {
  const company = $('in-company').value.trim() || 'Your Company';
  const name = $('in-name').value.trim() || 'Player';
  localStorage.setItem('skyline-company', company);
  localStorage.setItem('skyline-name', name);
  const mp = {
    net: null, pid: -1, host: false, vote: null, cooldowns: {}, pending: new Map(), seq: 0,
    lobby: null, seats: [], addresses: app.lan?.addresses || [], lastState: 0,
  };
  app.mp = mp;
  mp.net = new Net(onNet, status => {
    $('net-status').textContent = status === 'online' ? '' : '📶 Reconnecting…';
    $('net-status').classList.toggle('hidden', status === 'online');
  });
  mp.net.connect({ token, name, company });
  $('title').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  $('lobby-body').innerHTML = '<p class="note">Connecting…</p>';
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
      mp.vote = m.vote;
      app.ui.voteFrame(mp);
      break;
    case 'result': {
      const r = mp.pending.get(m.id);
      if (r) { mp.pending.delete(m.id); r(m.res || { ok: false }); }
      break;
    }
    case 'notice': app.ui.toast(m.text, m.kind || ''); break;
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
  mp.vote = m.vote;
  mp.cooldowns = m.cooldowns || {};
  mp.seatInfo = m.seats;
  app.s = s;
  if (!prev) {
    $('lobby').classList.add('hidden');
    app.start(s);
    app.ui.toast(mp.pid >= 0 ? `You are ${s.players[mp.pid].company}. Speed changes need everyone's agreement.` : 'Watching.', 'good');
  }
  if (m.speed !== app.speed) app.setSpeed(m.speed);
  app.speedButtons();
  app.ui.voteFrame(mp);
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
    <p class="note">${mp.addresses.length ? `Friends on the same wifi open <b>${esc(mp.addresses[0])}</b> and tap <b>LAN multiplayer</b>.` : 'Friends on the same wifi open this same address.'}</p>
    <h3>Players <em>${Math.min(L.players.length, L.max)} / ${L.max}${L.players.length < L.max ? ' · rivals fill the rest' : ''}</em></h3>
    ${L.players.map((p, i) => `<div class="list-item"><span class="rank">${i + 1}</span><span class="grow"><b>${esc(p.company)}</b><small>${esc(p.name)}${p.host ? ' · host' : ''}${p.token === L.you ? ' · you' : ''}${i >= L.max ? ' · no seat (game full)' : ''}</small></span></div>`).join('')}
    ${full ? '<p class="note warn">Only the first 4 players get a company.</p>' : ''}
    <h3>Game</h3>
    ${mp.host ? `
      <div class="seg wrap" id="lob-scenario">${Object.entries(SCENARIOS).map(([k, v]) => `<button data-v="${k}" class="${k === L.settings.scenario ? 'on' : ''}">${v.name}<small>${v.year}</small></button>`).join('')}</div>
      <p class="note">${esc(sc.blurb)}</p>
      <div class="seg" id="lob-diff">${[['easy', 'Relaxed'], ['normal', 'Sharp'], ['hard', 'Ruthless']].map(([k, n]) => `<button data-v="${k}" class="${k === L.settings.difficulty ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="row"><button class="btn go wide" id="lob-start">Start game for everyone</button></div>
      ${L.canResume ? '<div class="row"><button class="btn wide" id="lob-resume">Resume the saved LAN game</button></div>' : ''}`
    : `<p class="note"><b>${esc(sc.name)}</b> (${sc.year}) · ${esc(sc.blurb)}<br>Waiting for the host to start…</p>`}
    <div class="row"><button class="btn small" id="lob-leave">Back to title</button></div>`;
  const bind = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => { sfx.tap(); fn(b); }));
  bind('#lob-scenario button', b => mp.net.send({ t: 'setup', scenario: b.dataset.v }));
  bind('#lob-diff button', b => mp.net.send({ t: 'setup', difficulty: b.dataset.v }));
  bind('#lob-start', () => mp.net.send({ t: 'start' }));
  bind('#lob-resume', () => mp.net.send({ t: 'start', resume: true }));
  bind('#lob-leave', () => app.toTitle());
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
        for (const k in app.mp.cooldowns) if (--app.mp.cooldowns[k] <= 0) delete app.mp.cooldowns[k];
        if (app.mp.vote) { app.mp.vote.left--; app.ui.voteFrame(app.mp); }
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
  } else {
    // Title screen: a slowly turning city behind the menu.
    if (!app.demo) { app.demo = createGame({ scenario: 'sandbox', seed: 4 }); app.demo.hour = 17; }
    app.demo.t += dt * 0.05;
    if (app.demo.t >= 1) { app.demo.t -= 1; app.demo.hour = (app.demo.hour + 1) % 24; }
    app.renderer.want.yaw += dt * 0.08;
    app.renderer.draw(app.demo, app.demo.hour + app.demo.t, dt, 1);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => { app.renderer.resize(); });
window.addEventListener('keydown', e => {
  if (!app.s || e.target.tagName === 'INPUT') return;
  if (e.key === ' ') { e.preventDefault(); app.requestSpeed(app.speed ? 0 : 1); }
  else if (e.key >= '0' && e.key <= '3') app.requestSpeed(+e.key);
  else if (e.key === 'q') app.renderer.rotate(Math.PI / 4);
  else if (e.key === 'e') app.renderer.rotate(-Math.PI / 4);
  else if (e.key === 'Escape' && app.ui.view) app.ui.close();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) app.save(); });

// --------------------------------------------------------------- title ----
let scenario = 'boomtown', difficulty = 'normal';
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
blurb();
$('in-company').value = localStorage.getItem('skyline-company') || '';
$('in-name').value = localStorage.getItem('skyline-name') || '';
$('btn-new').addEventListener('click', () => {
  const company = $('in-company').value.trim() || 'Your Company';
  localStorage.setItem('skyline-company', company);
  sfx.build();
  app.start(createGame({ scenario, difficulty, company, name: 'You' }));
  setTimeout(() => app.ui.toast('Tap any empty lot to open a shop. Land goes on sale at 9:00.', 'good'), 600);
});
$('btn-continue').addEventListener('click', () => {
  try { app.start(deserialize(localStorage.getItem(SAVE_KEY))); sfx.tap(); }
  catch (e) { localStorage.removeItem(SAVE_KEY); app.toTitle(); }
});
$('btn-lan').addEventListener('click', () => { sfx.tap(); joinLan(); });
setSound(localStorage.getItem('skyline-sound') !== '0');
app.toTitle();
// The LAN button only appears when the page comes from server.mjs.
lanAvailable().then(info => {
  app.lan = info;
  if (info) $('lan-box').classList.remove('hidden');
});

window.__SH = app;
