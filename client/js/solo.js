// Offline practice mode. Runs the exact same Room the LAN server runs, only
// in the browser tab, so the physics, track, bots and items are identical to
// a real race - there is just nobody else on the wire.

import * as C from '/shared/constants.js';
import { Room, STATE, flags } from '/shared/room.js';
import { laneCount } from '/shared/track.js';
import { ITEM_META } from '/shared/items.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
const SUFFIX = ['th', 'st', 'nd', 'rd'];
const ord = (n) => { const v = n % 100; return SUFFIX[(v - 20) % 10] || SUFFIX[v] || SUFFIX[0]; };
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
};

const renderer = new Renderer($('#game'));
const sfx = new Sfx();
const input = new Input(document.body, $('#item-slot'));

const S = {
  room: null,
  me: null,
  bots: parseInt(store.get('ts.solo.bots', '7'), 10),
  distance: store.get('ts.solo.dist', 'sprint'),
  skill: parseFloat(store.get('ts.solo.skill', '0.72')),
  items: store.get('ts.solo.items', '1') === '1',
  views: new Map(),
  lastCount: -1
};

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  input.enabled = (id === 'screen-race');
}

// ------------------------------------------------------------- setup UI ---
function mark(sel, v) { for (const b of $(sel).children) b.classList.toggle('on', b.dataset.v === v); }
function syncSetup() {
  $('#bots-count').textContent = S.bots;
  mark('#seg-distance', S.distance);
  mark('#seg-skill', String(S.skill));
  mark('#seg-items', S.items ? '1' : '0');
}
$('#seg-distance').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.distance = b.dataset.v; store.set('ts.solo.dist', S.distance); syncSetup();
});
$('#seg-skill').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.skill = parseFloat(b.dataset.v); store.set('ts.solo.skill', String(S.skill)); syncSetup();
});
$('#seg-items').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.items = b.dataset.v === '1'; store.set('ts.solo.items', S.items ? '1' : '0'); syncSetup();
});
$('#bots-minus').addEventListener('click', () => { S.bots = Math.max(0, S.bots - 1); store.set('ts.solo.bots', String(S.bots)); syncSetup(); });
$('#bots-plus').addEventListener('click', () => { S.bots = Math.min(C.MAX_PLAYERS - 1, S.bots + 1); store.set('ts.solo.bots', String(S.bots)); syncSetup(); });
$('#btn-start').addEventListener('click', () => { sfx.resume(); startRace(); });
$('#btn-again').addEventListener('click', () => { sfx.resume(); startRace(); });
$('#btn-setup').addEventListener('click', () => show('screen-setup'));
syncSetup();

// ----------------------------------------------------------- race setup ---
function startRace() {
  const room = new Room('SOLO');
  room.settings.distance = S.distance;
  room.settings.items = S.items;
  room.settings.botSkill = S.skill;
  const me = room.addPlayer('you', store.get('ts.name', 'You'), null);
  me.ready = true;
  room.setBots(S.bots);
  room.startRace();

  S.room = room;
  S.me = me;
  S.views.clear();
  for (const p of room.racers) S.views.set(p.id, { rx: p.x });
  S.lastCount = -1;

  buildProgressDots();
  renderer.particles.length = 0;
  $('#countdown').classList.remove('hidden');
  show('screen-race');
  last = performance.now();
}

// -------------------------------------------------------------- controls ---
input.on('left', () => { const m = S.me; if (!m) return; m.input.lane = Math.max(0, m.input.lane - 1); });
input.on('right', () => { const m = S.me; if (!m) return; m.input.lane = Math.min(laneCount(m.path) - 1, m.input.lane + 1); });
input.on('jump', () => { const m = S.me; if (!m) return; m.input.jump = true; sfx.jump(); });
input.on('slide', () => { const m = S.me; if (!m) return; m.input.slide = true; sfx.slide(); });
input.on('item', () => { const m = S.me; if (!m || !m.item) return; m.input.use = true; });

// ------------------------------------------------------------- game loop ---
let last = performance.now();
let acc = 0;
let hudAcc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  const room = S.room;
  if (!room || !room.track) return;

  if (room.state !== STATE.RESULTS) {
    acc += dt;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 6) { acc -= 1 / 60; steps++; room.step(1 / 60); }
    drainEvents(room);
  }

  renderer.draw(buildWorld(dt), dt);
  countdownFx(room);

  hudAcc += dt;
  if (hudAcc > 0.06) { hudAcc = 0; updateHud(); }

  if (room.state === STATE.RESULTS && !room.shown) { room.shown = true; showResults(room); }
}
requestAnimationFrame(frame);

function buildWorld(dt) {
  const room = S.room;
  const list = [];
  let self = null;
  for (const p of room.racers) {
    let v = S.views.get(p.id);
    if (!v) { v = { rx: p.x }; S.views.set(p.id, v); }
    v.rx += (p.x - v.rx) * Math.min(1, dt * 16);
    const view = {
      id: p.id, name: p.name, color: p.color, place: p.place, self: p === S.me,
      x: p.x, rx: v.rx, y: p.y, z: p.z, path: p.path, scSide: p.scSide,
      speed: p.speed, flags: flags(p)
    };
    list.push(view);
    if (view.self) self = view;
  }
  return {
    track: room.track,
    players: list,
    projectiles: room.projectiles.map(o => ({ k: o.kind === 'shell' ? 1 : 2, z: o.z, x: o.x, y: o.y, pa: o.path })),
    me: self || list[0],
    finishZ: (S.me.startZ || 0) + room.distance,
    taken: S.me.taken
  };
}

function drainEvents(room) {
  for (const ev of room.events) {
    const mine = ev.id === 'you';
    const who = room.byId(ev.id);
    switch (ev.t) {
      case 'coin': if (mine) { sfx.coin(); renderer.burst(S.me.x, 1.1, S.me.z + 1, '#ffd23f', 4, 2.5, 3); } break;
      case 'box': if (mine) { sfx.box(); if (ev.item) toast(`${ITEM_META[ev.item].icon} ${ITEM_META[ev.item].name.toUpperCase()}`, ITEM_META[ev.item].color); } break;
      case 'hit':
        if (mine) { sfx.hit(); renderer.addShake(0.9); flash(); toast(ev.hard ? 'WIPEOUT!' : 'BUMP!', '#ff4d5a'); renderer.burst(S.me.x, 1, S.me.z, '#ff8a3d', 16, 8, 6); }
        else if (who) renderer.burst(who.x, 1 + renderer.yOff(who.path), who.z, '#ff8a3d', 8, 6, 4);
        break;
      case 'shield': if (mine) { sfx.shield(); toast('SHIELD SAVED YOU', '#33b0ff'); } break;
      case 'ramp': if (mine) sfx.jump(); break;
      case 'pad': if (mine) sfx.boost(); break;
      case 'shortcut': if (mine) { sfx.boost(); toast('SHORTCUT!', '#ffd23f'); } break;
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
      case 'bolt': if (!mine && S.me.boltT > 0) { sfx.bolt(); toast('ZAPPED!', '#b06bff'); renderer.addShake(0.4); } break;
      case 'projhit':
        if (mine && !ev.blocked) { sfx.hit(); renderer.addShake(1.1); flash(); toast(ev.kind === 'shell' ? 'HOMER HIT!' : 'GREASED!', '#ff4d5a'); }
        else if (ev.by === 'you') toast('DIRECT HIT!', '#3ddc84');
        break;
      case 'smash': case 'smashproj': if (mine) { sfx.smash(); renderer.addShake(0.3); } break;
      case 'finish':
        if (mine) { sfx.finish(); toast(`${ev.place}${ord(ev.place)} PLACE!`, '#ffd23f'); }
        else if (who) toast(`${who.name} finished ${ev.place}${ord(ev.place)}`, who.color);
        break;
      default: break;
    }
  }
  room.events.length = 0;
}

// -------------------------------------------------------------------- HUD ---
function countdownFx(room) {
  const el = $('#countdown');
  if (room.state === STATE.COUNTDOWN) {
    el.classList.remove('hidden');
    const n = Math.max(1, Math.ceil(room.countdown));
    if (n !== S.lastCount) {
      S.lastCount = n;
      el.textContent = String(n);
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      sfx.count(n);
    }
  } else if (S.lastCount !== 0 && !el.classList.contains('hidden')) {
    S.lastCount = 0;
    el.textContent = 'GO!';
    sfx.count(0);
    setTimeout(() => el.classList.add('hidden'), 700);
  }
}

function buildProgressDots() {
  const wrap = $('#progress-dots');
  wrap.innerHTML = '';
  for (const p of S.room.racers) {
    const i = document.createElement('i');
    i.style.color = p.color;
    i.style.background = p.color;
    if (p === S.me) i.classList.add('self');
    i.dataset.id = p.id;
    wrap.appendChild(i);
  }
}

function updateHud() {
  const room = S.room, me = S.me;
  if (!room || !me) return;
  const racers = room.racers;
  $('#hud-place').textContent = me.place;
  $('#hud-place-sfx').textContent = ord(me.place);
  $('#hud-total').textContent = '/ ' + racers.length;
  $('#hud-coins').textContent = me.coins;
  $('#hud-speed').textContent = Math.round(me.speed * 3.6);
  $('#hud-dist').textContent = Math.max(0, Math.round(room.distance - room.progress(me)));

  for (const dot of $('#progress-dots').children) {
    const p = room.byId(dot.dataset.id);
    if (!p) continue;
    dot.style.left = (Math.max(0, Math.min(1, room.progress(p) / room.distance)) * 100).toFixed(2) + '%';
  }

  const rows = racers.slice().sort((a, b) => a.place - b.place);
  const shown = rows.slice(0, 4);
  if (!shown.includes(me)) shown.push(me);
  const leadProg = rows.length ? room.progress(rows[0]) : 0;
  const lb = $('#leaderboard');
  lb.innerHTML = '';
  for (const p of shown) {
    const gap = Math.round(leadProg - room.progress(p));
    const d = document.createElement('div');
    d.className = 'lb-row' + (p === me ? ' self' : '');
    d.innerHTML = `<span class="n">${p.place}</span>
      <span class="dot" style="width:7px;height:7px;border-radius:50%;background:${p.color}"></span>
      <span class="nm"></span><span class="gap">${gap > 0 ? '-' + gap + 'm' : '—'}</span>`;
    d.querySelector('.nm').textContent = p.name;
    lb.appendChild(d);
  }

  const slot = $('#item-slot');
  const meta = me.item ? ITEM_META[me.item] : null;
  slot.classList.toggle('empty', !me.item);
  slot.classList.toggle('armed', !!me.item);
  slot.style.color = meta ? meta.color : '';
  $('#item-icon').textContent = meta ? meta.icon : '·';
  $('#item-name').textContent = meta ? meta.name : 'no item';
}

function toast(text, color) {
  const host = $('#toasts');
  if ([...host.children].some(c => c.textContent === text)) return;
  while (host.children.length >= 3) host.firstChild.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  if (color) { t.style.color = color; t.style.borderColor = color; }
  host.appendChild(t);
  setTimeout(() => t.remove(), 1700);
}
function flash() {
  const f = $('#fx-flash');
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}

function showResults(room) {
  const wrap = $('#results-rows');
  wrap.innerHTML = '';
  for (const r of room.results()) {
    const d = document.createElement('div');
    d.className = `rrow p${r.place}` + (r.id === 'you' ? ' self' : '');
    d.innerHTML = `<span class="pl">${r.place}</span>
      <span class="dot" style="color:${r.color};background:${r.color}"></span>
      <span class="who"><div class="nm"></div>
        <div class="sub">${r.coins}c · ${r.hits} wipeouts · ${r.shortcuts} cuts · ${Math.round(r.top * 3.6)} km/h</div></span>
      <span class="tm">${r.dnf ? 'DNF' : r.time.toFixed(2) + 's'}<em>${r.bot ? 'bot' : ''}</em></span>`;
    d.querySelector('.nm').textContent = r.name;
    wrap.appendChild(d);
  }
  show('screen-results');
  wrap.querySelector('.rrow.self')?.scrollIntoView({ block: 'center' });
  sfx.finish();
}

// --------------------------------------------------------------- startup ---
// The standalone single-file build has no server to link back to.
$('#lan-note').innerHTML = window.TS_STANDALONE
  ? 'Solo build. For 12-player races on your wifi, run <b>node server/index.js</b> from the repo.'
  : 'Racing friends on your wifi? <a href="/" style="color:var(--neon)">Go to multiplayer →</a>';
window.__TS = { S, renderer, sfx };
show('screen-setup');
document.addEventListener('visibilitychange', () => { if (!document.hidden) sfx.resume(); });
window.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
