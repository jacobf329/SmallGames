// Turbo Surfers client: lobby, local prediction, interpolation, HUD.

import * as C from '/shared/constants.js';
import { Track, laneX, laneCount } from '/shared/track.js';
import { createPlayer, resetForRace, stepPlayer } from '/shared/physics.js';
import { ITEM_META } from '/shared/items.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { Sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
const RENDER_DELAY = 95;      // ms of interpolation buffer for remote runners
const SUFFIX = ['th', 'st', 'nd', 'rd'];
const ord = (n) => { const v = n % 100; return SUFFIX[(v - 20) % 10] || SUFFIX[v] || SUFFIX[0]; };

const G = {
  id: null, name: '', room: 'MAIN',
  lobby: null, isHost: false,
  state: 'lobby',
  track: null, distance: C.RACE_DISTANCE,
  me: null, self: null,
  players: new Map(),          // id -> remote view + interpolation buffer
  projectiles: [],
  countdown: 0, raceTime: 0,
  spectate: false,
  results: null,
  urls: []
};

const net = new Net();
const sfx = new Sfx();
const renderer = new Renderer($('#game'));
const input = new Input(document.body, $('#item-slot'));

// ============================== screens ==================================
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  input.enabled = (id === 'screen-race');
}

// ============================== connect ==================================
$('#in-name').value = localStorage.getItem('ts.name') || '';
const hashRoom = location.hash.replace('#', '').toUpperCase().replace(/[^A-Z0-9]/g, '');
$('#in-room').value = hashRoom || localStorage.getItem('ts.room') || '';

$('#btn-join').addEventListener('click', () => {
  sfx.resume();
  const name = $('#in-name').value.trim() || 'Runner';
  const room = ($('#in-room').value.trim() || 'MAIN').toUpperCase();
  localStorage.setItem('ts.name', name);
  localStorage.setItem('ts.room', room);
  G.name = name; G.room = room;
  if (!net.ready) { $('#connect-status').textContent = 'still connecting to the server…'; return; }
  net.send({ t: 'join', name, room });
  $('#btn-join').disabled = true;
});
$('#in-room').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('#btn-retry').addEventListener('click', () => net.connect());

// =============================== lobby ===================================
$('#btn-ready').addEventListener('click', () => {
  sfx.resume();
  const meRow = G.lobby?.players.find(p => p.id === G.id);
  net.send({ t: 'ready', v: !meRow?.ready });
});
$('#btn-start').addEventListener('click', () => { sfx.resume(); net.send({ t: 'start' }); });
$('#btn-again').addEventListener('click', () => net.send({ t: 'again' }));

segment('#seg-distance', (v) => net.send({ t: 'setup', distance: v }));
segment('#seg-skill', (v) => net.send({ t: 'setup', botSkill: parseFloat(v) }));
segment('#seg-items', (v) => net.send({ t: 'setup', items: v === '1' }));
$('#bots-minus').addEventListener('click', () => net.send({ t: 'setup', bots: (G.lobby?.settings.bots || 0) - 1 }));
$('#bots-plus').addEventListener('click', () => net.send({ t: 'setup', bots: (G.lobby?.settings.bots || 0) + 1 }));

function segment(sel, fn) {
  const el = $(sel);
  if (!el) return;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    fn(b.dataset.v);
  });
}

function renderLobby() {
  const L = G.lobby;
  if (!L) return;
  $('#lobby-code').textContent = L.code;
  $('#lobby-count').textContent = `${L.players.length} / ${L.max}`;
  G.isHost = L.host === G.id;

  const grid = $('#player-grid');
  grid.innerHTML = '';
  for (const p of L.players) {
    const d = document.createElement('div');
    d.className = 'pcard' + (p.ready ? ' ready' : '') + (p.id === G.id ? ' me' : '');
    d.innerHTML = `<span class="dot" style="color:${p.color};background:${p.color}"></span>
      <span class="nm"></span>
      <span class="tag">${p.bot ? 'BOT' : p.host ? 'HOST' : p.ready ? 'READY' : '…'}</span>`;
    d.querySelector('.nm').textContent = p.name;
    grid.appendChild(d);
  }

  $('#host-controls').classList.toggle('hidden', !G.isHost);
  $('#btn-start').classList.toggle('hidden', !G.isHost);
  $('#bots-count').textContent = L.settings.bots;
  mark('#seg-distance', L.settings.distance);
  mark('#seg-skill', String(L.settings.botSkill));
  mark('#seg-items', L.settings.items ? '1' : '0');

  const meRow = L.players.find(p => p.id === G.id);
  $('#btn-ready').textContent = meRow?.ready ? 'READY ✓' : 'TAP WHEN READY';
  $('#btn-ready').classList.toggle('on', !!meRow?.ready);

  const humans = L.players.filter(p => !p.bot);
  const waiting = humans.filter(p => !p.ready).length;
  $('#lobby-hint').textContent = G.isHost
    ? (waiting ? `${waiting} player${waiting > 1 ? 's' : ''} not ready yet — you can still start.` : 'Everyone is ready. Send it.')
    : 'Waiting for the host to start…';

  $('#lobby-urls').innerHTML = G.urls.length
    ? 'Others join at ' + G.urls.map(u => `<b>${u}</b>`).join(' or ') + (L.code !== 'MAIN' ? ` &nbsp;code <b>${L.code}</b>` : '')
    : '';
}

function mark(sel, v) {
  const el = $(sel);
  if (!el) return;
  for (const b of el.children) b.classList.toggle('on', b.dataset.v === v);
}

// =============================== net =====================================
net.on('open', () => {
  $('#connect-status').textContent = 'connected';
  $('#disconnected').classList.add('hidden');
  $('#btn-join').disabled = false;
  if (G.id && G.name) net.send({ t: 'join', name: G.name, room: G.room });   // re-join after a drop
});
net.on('close', () => {
  $('#connect-status').textContent = 'server not reachable — retrying…';
  if (G.state !== 'lobby' || G.id) $('#disconnected').classList.remove('hidden');
});
net.on('hello', (m) => {
  G.urls = m.urls || [];
  $('#join-urls').innerHTML = G.urls.length ? 'Others on this wifi: ' + G.urls.map(u => `<b>${u}</b>`).join(' · ') : '';
});
net.on('joined', (m) => {
  G.id = m.id; G.room = m.room; G.name = m.name;
  location.hash = m.room;
  show('screen-lobby');
});
net.on('error', (m) => {
  $('#connect-status').textContent = m.msg;
  $('#btn-join').disabled = false;
});
net.on('lobby', (m) => {
  G.lobby = m.room;
  G.state = m.room.state;
  if (m.room.state === 'lobby' && document.querySelector('#screen-race.active, #screen-results.active')) {
    show('screen-lobby');
    G.results = null;
  }
  renderLobby();
});
net.on('race', (m) => startRace(m));
net.on('snap', (m) => onSnapshot(m));
net.on('results', (m) => showResults(m));

// ============================ race start =================================
function startRace(m) {
  G.track = new Track(m.seed, m.distance + 200);
  G.distance = m.distance;
  G.spectate = !!m.spectate;
  G.players.clear();
  G.projectiles = [];
  G.results = null;
  G.raceTime = 0;

  for (const p of m.players) {
    if (p.spectator) continue;
    G.players.set(p.id, {
      id: p.id, name: p.name, color: p.color, bot: p.bot,
      z: p.startZ || 0, x: laneX(0, p.startLane, 0), y: 0, rx: laneX(0, p.startLane, 0),
      path: 0, scSide: 0, flags: 1, place: 1, coins: 0, speed: 0,
      startZ: p.startZ || 0, buf: [], self: p.id === G.id
    });
  }

  const mine = m.players.find(p => p.id === G.id);
  if (mine && !G.spectate) {
    const me = createPlayer(G.id, mine.name, 0);
    me.color = mine.color;
    me.startLane = mine.startLane;
    resetForRace(me);
    me.startZ = mine.startZ || 0;
    me.z = me.startZ;
    me.x = laneX(0, mine.startLane, 0);
    me.rx = me.x;
    me.taken = new Set();
    G.me = me;
  } else {
    G.me = null;
  }

  buildProgressDots();
  $('#spectating').classList.toggle('hidden', !G.spectate);
  show('screen-race');
  sfx.resume();
  renderer.particles.length = 0;
  lastFrame = performance.now();
}

// ============================ snapshots ==================================
function onSnapshot(m) {
  const now = performance.now();
  G.state = m.st;
  G.countdown = m.cd;
  G.raceTime = m.tm;

  for (const s of m.ps) {
    const p = G.players.get(s.i);
    if (!p) continue;
    p.buf.push({ t: now, z: s.z, x: s.x, y: s.y, path: s.pa, scSide: s.sd, flags: s.f, place: s.pl, speed: s.s });
    if (p.buf.length > 24) p.buf.shift();
    p.place = s.pl;
    p.coins = s.c;
    p.item = s.it || null;
    p.flagsLatest = s.f;
  }

  G.projectiles = m.pr.map(o => ({ id: o.i, k: o.k, z: o.z, x: o.x, y: o.y, pa: 0 }));

  if (m.me && G.me) reconcile(m.me);
  for (const ev of m.ev || []) handleEvent(ev);
}

function reconcile(s) {
  const me = G.me;
  // Server owns status, coins, items and path transitions.
  me.coins = s.c; me.item = s.it || null; me.place = s.pl;
  me.finished = !!s.fin;
  me.stunT = s.stun; me.invulnT = s.inv; me.boostT = s.bst; me.starT = s.star;
  me.rocketT = s.rkt; me.boltT = s.blt; me.shieldT = s.shd; me.magnetT = s.mag;
  me.spinT = s.spn; me.drafting = !!s.drf; me.sliding = !!s.sld; me.slideT = s.sldT;

  if (me.path !== s.pa || me.scId !== s.sc) {
    me.path = s.pa; me.scSide = s.sd; me.scId = s.sc;
    me.x = s.x; me.targetLane = s.tl; me.lane = s.tl;
  }
  const dz = s.z - me.z;
  if (Math.abs(dz) > 4) { me.z = s.z; me.x = s.x; me.y = s.y; me.vy = s.vy; me.speed = s.sp; }
  else if (Math.abs(dz) > 1.2) { me.z += dz * 0.5; me.speed = s.sp; }
  else { me.z += dz * 0.08; me.speed += (s.sp - me.speed) * 0.25; }

  const dx = s.x - me.x;
  if (Math.abs(dx) > 1.6) me.x = s.x; else me.x += dx * 0.18;
  if (Math.abs(s.y - me.y) > 1.2) { me.y = s.y; me.vy = s.vy; }
}

// ============================== events ===================================
function handleEvent(ev) {
  const mine = ev.id === G.id;
  const who = G.players.get(ev.id);
  const at = who ? who : null;

  switch (ev.t) {
    case 'box':
      if (mine) { sfx.box(); if (ev.item) toast(`${ITEM_META[ev.item].icon} ${ITEM_META[ev.item].name.toUpperCase()}`, ITEM_META[ev.item].color); }
      break;
    case 'hit':
      if (mine) {
        sfx.hit(); renderer.addShake(0.9); flash();
        toast(ev.hard ? 'WIPEOUT!' : 'BUMP!', '#ff4d5a');
        if (G.me) renderer.burst(G.me.x, 1, G.me.z, '#ff8a3d', 16, 8, 6);
      } else if (at) {
        renderer.burst(at.rx ?? at.x, 1 + renderer.yOff(at.path), at.z, '#ff8a3d', 8, 6, 4);
      }
      break;
    case 'shield':
      if (mine) { sfx.shield(); toast('SHIELD SAVED YOU', '#33b0ff'); }
      break;
    case 'use': {
      const meta = ITEM_META[ev.item];
      if (mine) {
        if (ev.item === 'star' || ev.item === 'rocket') sfx.star();
        else if (ev.item === 'boost' || ev.item === 'coins') sfx.boost();
        else if (ev.item === 'shell') sfx.shell();
        else if (ev.item === 'bolt') sfx.bolt();
        else sfx.box();
      } else if (who && meta && (ev.item === 'bolt' || ev.item === 'star' || ev.item === 'rocket')) {
        toast(`${who.name} used ${meta.name}`, meta.color);
      }
      break;
    }
    case 'bolt':
      if (!mine && G.me && !G.me.finished) { sfx.bolt(); toast('ZAPPED!', '#b06bff'); renderer.addShake(0.4); }
      break;
    case 'projhit':
      if (mine && !ev.blocked) { sfx.hit(); renderer.addShake(1.1); flash(); toast(ev.kind === 'shell' ? 'HOMER HIT!' : 'GREASED!', '#ff4d5a'); }
      else if (ev.by === G.id) toast('DIRECT HIT!', '#3ddc84');
      break;
    case 'shortcut':
      if (mine) { sfx.boost(); toast('SHORTCUT!', '#ffd23f'); }
      break;
    case 'pad':
      if (mine) sfx.boost();
      break;
    case 'smash':
    case 'smashproj':
      if (mine) { sfx.smash(); renderer.addShake(0.3); }
      break;
    case 'finish':
      if (mine) { sfx.finish(); toast(`${ev.place}${ord(ev.place)} PLACE!`, '#ffd23f'); }
      else if (who) toast(`${who.name} finished ${ev.place}${ord(ev.place)}`, who.color);
      break;
    default: break;
  }
}

let lastCount = -1;
function countdownFx(cd) {
  const el = $('#countdown');
  if (G.state !== 'countdown') {
    if (lastCount !== -1 && lastCount !== 0) { lastCount = -1; }
    if (!el.classList.contains('hidden') && G.state !== 'countdown') {
      if (el.dataset.go !== '1') {
        el.dataset.go = '1';
        el.textContent = 'GO!';
        sfx.count(0);
        setTimeout(() => { el.classList.add('hidden'); el.dataset.go = '0'; }, 700);
      }
    }
    return;
  }
  el.classList.remove('hidden');
  el.dataset.go = '0';
  const n = Math.max(1, Math.ceil(cd));
  if (n !== lastCount) {
    lastCount = n;
    el.textContent = String(n);
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    sfx.count(n);
  }
}

function toast(text, color) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  if (color) { t.style.color = color; t.style.borderColor = color; }
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 1700);
}
function flash() {
  const f = $('#fx-flash');
  f.classList.remove('on');
  void f.offsetWidth;
  f.classList.add('on');
}

// ============================== controls =================================
function sendInput(extra = {}) {
  if (!G.me) return;
  net.send({ t: 'in', l: G.me.input.lane, ...extra });
}
input.on('left', () => {
  if (!G.me) return;
  G.me.input.lane = Math.max(0, (G.me.input.lane ?? G.me.lane) - 1);
  sendInput();
});
input.on('right', () => {
  if (!G.me) return;
  G.me.input.lane = Math.min(laneCount(G.me.path) - 1, (G.me.input.lane ?? G.me.lane) + 1);
  sendInput();
});
input.on('jump', () => { if (!G.me) return; G.me.input.jump = true; sendInput({ j: 1 }); sfx.jump(); });
input.on('slide', () => { if (!G.me) return; G.me.input.slide = true; sendInput({ s: 1 }); sfx.slide(); });
input.on('item', () => {
  if (!G.me || !G.me.item) return;
  G.me.input.use = true;
  sendInput({ u: 1 });
});

// ============================== game loop ================================
let lastFrame = performance.now();
let acc = 0;
let hudAcc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 0.25) dt = 0.25;

  const racing = document.querySelector('#screen-race.active');
  if (!G.track) return;

  // local prediction at a fixed step
  if (G.me) {
    acc += dt;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 6) {
      acc -= 1 / 60;
      steps++;
      G.me.input.use = false;      // the server decides when an item actually fires
      stepPlayer(G.me, 1 / 60, G.track, localEvents, { racing: G.state === 'racing' });
    }
    drainLocalEvents();
  }

  interpolate(now);
  const world = buildWorld(dt);
  if (world) renderer.draw(world, dt);

  if (racing) {
    countdownFx(G.countdown);
    hudAcc += dt;
    if (hudAcc > 0.06) { hudAcc = 0; updateHud(); }
  }
}
requestAnimationFrame(frame);

const localEvents = [];
function drainLocalEvents() {
  for (const ev of localEvents) {
    switch (ev.t) {
      case 'coin':
        sfx.coin();
        if (G.me) renderer.burst(G.me.x, 1.1, G.me.z + 1, '#ffd23f', 4, 2.5, 3);
        break;
      case 'jump': break;
      case 'ramp': sfx.jump(); break;
      case 'pad': sfx.boost(); break;
      default: break;
    }
  }
  localEvents.length = 0;
}

function interpolate(now) {
  const target = now - RENDER_DELAY;
  for (const p of G.players.values()) {
    if (p.self && G.me) continue;
    const buf = p.buf;
    if (!buf.length) continue;
    let a = buf[0], b = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= target && buf[i + 1].t >= target) { a = buf[i]; b = buf[i + 1]; break; }
    }
    let f = b.t === a.t ? 1 : (target - a.t) / (b.t - a.t);
    f = Math.max(0, Math.min(1, f));
    // Extrapolate a touch when the newest sample is already behind us.
    if (target > b.t) {
      const ahead = Math.min(0.12, (target - b.t) / 1000);
      p.z = b.z + b.speed * ahead;
      p.x = b.x; p.y = b.y;
    } else {
      p.z = a.z + (b.z - a.z) * f;
      p.x = a.x + (b.x - a.x) * f;
      p.y = a.y + (b.y - a.y) * f;
    }
    p.path = b.path; p.scSide = b.scSide; p.flags = b.flags; p.speed = b.speed;
    while (buf.length > 2 && buf[1].t < target - 600) buf.shift();
  }
}

function buildWorld(dt) {
  const list = [];
  let camTarget = null;

  for (const p of G.players.values()) {
    const src = (p.self && G.me) ? G.me : p;
    const x = src.x;
    p.rx = p.rx === undefined ? x : p.rx + (x - p.rx) * Math.min(1, dt * 16);
    const view = {
      id: p.id, name: p.name, color: p.color, place: p.place, self: p.self,
      x, rx: p.rx, y: src.y, z: src.z, path: src.path, scSide: src.scSide,
      speed: src.speed || 0,
      flags: p.self && G.me ? localFlags(G.me) : p.flags
    };
    list.push(view);
    if (p.self) camTarget = view;
  }

  if (!camTarget) {
    // Spectator: ride with whoever is winning.
    let best = null;
    for (const v of list) if (!best || v.z > best.z) best = v;
    camTarget = best;
  }
  if (!camTarget) return null;

  return {
    track: G.track,
    players: list,
    projectiles: G.projectiles,
    me: camTarget,
    finishZ: (G.me ? G.me.startZ : 0) + G.distance,
    taken: G.me ? G.me.taken : null
  };
}

function localFlags(p) {
  let f = 0;
  if (p.grounded) f |= 1;
  if (p.sliding) f |= 2;
  if (p.stunT > 0) f |= 4;
  if (p.invulnT > 0) f |= 8;
  if (p.shieldT > 0) f |= 16;
  if (p.starT > 0) f |= 32;
  if (p.boostT > 0) f |= 64;
  if (p.rocketT > 0) f |= 128;
  if (p.boltT > 0) f |= 256;
  if (p.magnetT > 0) f |= 512;
  if (p.finished) f |= 1024;
  if (p.spinT > 0) f |= 2048;
  return f;
}

// ================================ HUD ====================================
function buildProgressDots() {
  const wrap = $('#progress-dots');
  wrap.innerHTML = '';
  for (const p of G.players.values()) {
    const i = document.createElement('i');
    i.style.color = p.color;
    i.style.background = p.color;
    if (p.self) i.classList.add('self');
    i.dataset.id = p.id;
    wrap.appendChild(i);
  }
}

function updateHud() {
  const me = G.me;
  const total = G.players.size;
  const self = me || [...G.players.values()].sort((a, b) => b.z - a.z)[0];
  if (!self) return;

  const place = me ? me.place : 1;
  $('#hud-place').textContent = place;
  $('#hud-place-sfx').textContent = ord(place);
  $('#hud-total').textContent = '/ ' + total;
  $('#hud-coins').textContent = me ? me.coins : 0;
  $('#hud-speed').textContent = Math.round((self.speed || 0) * 3.6);

  const prog = Math.max(0, (self.z - (self.startZ || 0)));
  $('#hud-dist').textContent = Math.max(0, Math.round(G.distance - prog));

  for (const dot of $('#progress-dots').children) {
    const p = G.players.get(dot.dataset.id);
    if (!p) continue;
    const src = (p.self && G.me) ? G.me : p;
    const f = Math.max(0, Math.min(1, (src.z - (p.startZ || 0)) / G.distance));
    dot.style.left = (f * 100).toFixed(2) + '%';
  }

  // leaderboard: top four plus you
  const rows = [...G.players.values()].map(p => {
    const src = (p.self && G.me) ? G.me : p;
    return { p, prog: src.z - (p.startZ || 0), place: p.place };
  }).sort((a, b) => a.place - b.place);
  const meRow = rows.find(r => r.p.self);
  const shown = rows.slice(0, 4);
  if (meRow && !shown.includes(meRow)) shown.push(meRow);

  const lead = rows[0];
  const lb = $('#leaderboard');
  lb.innerHTML = '';
  for (const r of shown) {
    const gap = lead ? Math.round(lead.prog - r.prog) : 0;
    const d = document.createElement('div');
    d.className = 'lb-row' + (r.p.self ? ' self' : '');
    d.innerHTML = `<span class="n">${r.place}</span>
      <span class="dot" style="width:7px;height:7px;border-radius:50%;background:${r.p.color}"></span>
      <span class="nm"></span><span class="gap">${gap > 0 ? '-' + gap + 'm' : '—'}</span>`;
    d.querySelector('.nm').textContent = r.p.name;
    lb.appendChild(d);
  }

  // item slot
  const slot = $('#item-slot');
  const item = me ? me.item : null;
  const meta = item ? ITEM_META[item] : null;
  slot.classList.toggle('empty', !item);
  slot.classList.toggle('armed', !!item);
  slot.style.color = meta ? meta.color : '';
  $('#item-icon').textContent = meta ? meta.icon : '·';
  $('#item-name').textContent = meta ? meta.name : 'no item';
}

// ============================== results ==================================
function showResults(m) {
  G.results = m;
  const wrap = $('#results-rows');
  wrap.innerHTML = '';
  for (const r of m.rows) {
    const d = document.createElement('div');
    d.className = `rrow p${r.place}` + (r.id === G.id ? ' self' : '');
    d.innerHTML = `<span class="pl">${r.place}</span>
      <span class="dot" style="color:${r.color};background:${r.color}"></span>
      <span class="who"><div class="nm"></div>
        <div class="sub">${r.coins}c · ${r.hits} wipeouts · ${r.shortcuts} cuts · ${Math.round(r.top * 3.6)} km/h</div></span>
      <span class="tm">${r.dnf ? 'DNF' : r.time.toFixed(2) + 's'}<em>${r.bot ? 'bot' : ''}</em></span>`;
    d.querySelector('.nm').textContent = r.name;
    wrap.appendChild(d);
  }
  $('#btn-again').classList.toggle('hidden', !G.isHost);
  show('screen-results');
  wrap.querySelector('.rrow.self')?.scrollIntoView({ block: 'center' });
  sfx.finish();

  let left = C.RESULTS_TIME;
  clearInterval(showResults._t);
  showResults._t = setInterval(() => {
    left -= 1;
    $('#results-timer').textContent = left > 0 ? `back to lobby in ${left}s` : '';
    if (left <= 0) clearInterval(showResults._t);
  }, 1000);
}

// ================================ boot ===================================
window.__TS = { G, net, renderer, sfx };     // handy for debugging from the console
show('screen-connect');
net.connect();
document.addEventListener('visibilitychange', () => { if (!document.hidden) sfx.resume(); });
window.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
