// Blockout Arena - the phone client: screens, lobby, your own movement
// (predicted so it reacts instantly), everyone else (smoothed between the
// host's snapshots), effects and the HUD.

import { TICK, INPUT_RATE, MAG, MAX_HP, FIRE_RATE, RELOAD } from './consts.js';
import { createPlayer, stepPlayer, traceShot, moving, eye } from './sim.js';
import { createArenaServer } from './session.js';
import { Host, LocalTransport, RtcTransport, normCode, onlineSupported } from './rtc.js';
import { Net } from './net.js';
import { Controls } from './controls.js';
import { Renderer } from './render.js';
import { sfx } from './audio.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INTERP = 110;                  // ms behind the host for other players
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

const G = window.BA = {
  id: null, code: '', hosting: false, practice: false, name: '',
  lobby: null, inGame: false, me: null, others: new Map(), scores: [], left: 0,
  hist: [], seq: 0, autoFire: store.get('ba.auto', '1') === '1',
  localFireT: 0, killfeed: [], deadBy: null, lastHurt: 0,
};

const net = new Net();
const renderer = new Renderer($('#view'));
const ui = {
  stick(on, x, y, dx, dy) {
    const b = $('#stick');
    b.classList.toggle('hidden', !on);
    if (!on) return;
    b.style.left = x + 'px'; b.style.top = y + 'px';
    $('#stick i').style.transform = `translate(${dx}px, ${dy}px)`;
  },
};
const controls = new Controls(document.body, ui);
controls.sens = +store.get('ba.sens', '1');

// ================================ screens ================================
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  const game = id === 'game';
  $('#hud').classList.toggle('hidden', !game);
  controls.enabled = game;
  if (!game) { controls.reset(); document.exitPointerLock?.(); }
}

$('#in-name').value = store.get('ba.name', '');
const myName = () => { const n = $('#in-name').value.trim() || 'Player'; store.set('ba.name', n); return n; };

// ================================= hosting ===============================
let hostSession = null, loop = null;
async function hostMatch(practice) {
  sfx.unlock();
  const name = myName();
  $('#status').textContent = practice ? 'starting practice…' : 'getting a match code…';
  let code = 'SOLO', server = null;
  if (!practice) {
    hostSession = new Host({ connect: (c) => server.connect(c) }, { name });
    try { code = await hostSession.start(); }
    catch { $('#status').textContent = "Couldn't create a match: check your internet connection."; hostSession = null; return; }
  }
  server = createArenaServer({ code });
  let last = performance.now();
  loop = setInterval(() => { const now = performance.now(); server.tick((now - last) / 1000); last = now; }, 1000 / TICK);
  Object.assign(G, { name, code, hosting: !practice, practice, autoJoin: true });
  net.close();
  net.useTransport(new LocalTransport(server));
  net.connect();
  try { G.wake = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
}

const STAGES = { finding: 'finding the match…', gathering: 'working out how to reach the host…', waiting: "waiting for the host's phone to answer…",
  linking: 'connecting to the host…', online: 'connected!', retrying: 'trying again…' };
function joinOnline() {
  sfx.unlock();
  const code = normCode($('#in-code').value);
  if (code.length !== 4) { $('#status').textContent = 'Match codes have 4 letters.'; return; }
  const name = myName();
  Object.assign(G, { name, code, autoJoin: true });
  $('#btn-retry').classList.add('hidden');
  const t = new RtcTransport(code, name, (stage, diag) => {
    const st = $('#status');
    if (stage === 'noroom') { st.textContent = `No match with the code ${code}. Check it with the host.`; return; }
    if (stage === 'blocked') {
      st.innerHTML = "Couldn't reach the host's phone. Make sure the host still has the game open on screen, then try again. Same wifi as the host always works." +
        (diag ? `<br><small>you: ${(diag.mine || []).join(', ') || 'none'}${diag.host ? ` · host: ${diag.host.join(', ')}` : ''}</small>` : '');
      $('#btn-retry').classList.remove('hidden');
      return;
    }
    st.textContent = STAGES[stage] || 'connecting…';
  });
  net.close();
  net.useTransport(t);
  net.connect();
}
// On phones: ask for the gyro, go full screen and hold landscape. These need
// a tap, so they run from the HOST / JOIN / PRACTICE buttons.
const isPhone = matchMedia('(pointer: coarse)').matches;
function prepPhone() {
  if (!isPhone) return;
  startGyro();
  try {
    const el = document.documentElement;
    const fs = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    Promise.resolve(fs).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } catch { /* not allowed here (iPhone): the rotate prompt covers it */ }
}
$('#btn-host').addEventListener('click', () => { prepPhone(); hostMatch(false); });
$('#btn-practice').addEventListener('click', () => { prepPhone(); hostMatch(true); });
$('#btn-join').addEventListener('click', () => { prepPhone(); joinOnline(); });
$('#btn-retry').addEventListener('click', () => { $('#btn-retry').classList.add('hidden'); joinOnline(); });
$('#in-code').addEventListener('input', (e) => { e.target.value = normCode(e.target.value); });
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) $('#in-code').value = normCode(joinParam);
if (!onlineSupported()) $('#online').classList.add('hidden');

async function leave() {
  net.close();
  if (loop) clearInterval(loop);
  try { await hostSession?.stop(); } catch { /* offline */ }
  G.wake?.release?.();
  location.href = location.pathname;
}
window.addEventListener('pagehide', () => hostSession?.stopNow());
document.querySelectorAll('[data-leave]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); leave(); }));

// ================================== lobby ================================
function renderLobby() {
  const L = G.lobby;
  if (!L) return;
  const host = L.host === G.id;
  $('#lobby-title').textContent = G.practice ? 'PRACTICE' : `MATCH ${L.code}`;
  $('#lobby-share').classList.toggle('hidden', !G.hosting);
  $('#lobby-players').innerHTML = L.players.map(p => `<div class="pl"><i style="background:${p.color}"></i><b>${esc(p.name)}</b><small>${p.bot ? 'BOT' : p.id === L.host ? 'HOST' : ''}${p.id === G.id ? ' · YOU' : ''}</small></div>`).join('');
  $('#lobby-count').textContent = `${L.players.length} / ${L.max}`;
  $('#host-ctl').classList.toggle('hidden', !host);
  $('#btn-start').classList.toggle('hidden', !host);
  $('#lobby-wait').classList.toggle('hidden', host);
  $('#bots-n').textContent = L.settings.bots;
  for (const [sel, v] of [['#seg-score', L.settings.score], ['#seg-time', L.settings.minutes], ['#seg-skill', L.settings.skill]])
    for (const b of document.querySelectorAll(`${sel} button`)) b.classList.toggle('on', +b.dataset.v === +v);
}
const seg = (sel, fn) => document.querySelectorAll(`${sel} button`).forEach(b => b.addEventListener('click', () => fn(+b.dataset.v)));
seg('#seg-score', v => net.send({ t: 'setup', score: v }));
seg('#seg-time', v => net.send({ t: 'setup', minutes: v }));
seg('#seg-skill', v => net.send({ t: 'setup', skill: v }));
$('#bots-minus').addEventListener('click', () => net.send({ t: 'setup', bots: (G.lobby?.settings.bots || 0) - 1 }));
$('#bots-plus').addEventListener('click', () => net.send({ t: 'setup', bots: (G.lobby?.settings.bots || 0) + 1 }));
$('#btn-start').addEventListener('click', () => { sfx.unlock(); net.send({ t: 'start' }); });
$('#btn-again').addEventListener('click', () => net.send({ t: 'again' }));
$('#btn-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?join=${G.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Blockout Arena', text: `Join my Blockout Arena match: code ${G.code}`, url });
    else { await navigator.clipboard.writeText(url); $('#btn-share').textContent = 'LINK COPIED'; }
  } catch { /* cancelled */ }
});
// Gyro aim. The box stays as the player set it; the note under it says
// whether motion is actually coming through, and if not, why.
const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function gyroNote(text, ok) {
  const n = $('#gyro-note');
  n.textContent = text; n.classList.toggle('ok', !!ok);
}
// Ask (this must run straight from a tap), then watch for motion data.
function startGyro() {
  if (!controls.gyro) return;
  if (!window.isSecureContext) {
    gyroNote('Gyro only works when the game is opened from jteef.com/play/arena (phones only share motion with secure web pages).');
    return;
  }
  if (!window.DeviceMotionEvent) { gyroNote("This browser doesn't support motion sensors, so aim with your thumb."); return; }
  gyroNote('Checking the gyro…');
  Controls.askGyro().then((granted) => {
    const seenBefore = controls.gyroSeen;
    setTimeout(() => {
      if (!controls.gyro) return;
      if (controls.gyroSeen || seenBefore) gyroNote('Gyro is working: turn and tilt the phone to aim.', true);
      else if (!granted) gyroNote(IOS
        ? 'Safari said no to motion for this page. Close this tab, open jteef.com/play/arena again and tap Allow when it asks about motion.'
        : 'The browser blocked motion sensors. Tap the icon next to the web address, allow Motion sensors, then reload.');
      else gyroNote("Your phone isn't sending gyro data to the browser, so aim with your thumb.");
    }, 1200);
  });
}
function setGyro(on) {
  controls.gyro = on; store.set('ba.gyro', on ? '1' : '0');
  $('#gyro').checked = on;
  $('#gyro-sens-row').classList.toggle('hidden', !on);
  if (!on) gyroNote('');
}
setGyro(isPhone && store.get('ba.gyro', '1') === '1');
controls.gyroSens = +store.get('ba.gsens', '1.6');
$('#gyro-sens').value = controls.gyroSens;
$('#gyro-sens').addEventListener('input', (e) => { controls.gyroSens = +e.target.value; store.set('ba.gsens', e.target.value); });
// 'click' rather than 'change' so the permission ask counts as part of the tap.
$('#gyro').addEventListener('click', (e) => { setGyro(e.target.checked); startGyro(); });
for (const r of document.querySelectorAll('.phone-only')) r.classList.toggle('hidden', !isPhone);
setGyro(controls.gyro);
$('#sens').value = controls.sens;
$('#sens').addEventListener('input', (e) => { controls.sens = +e.target.value; store.set('ba.sens', e.target.value); });
$('#auto').checked = G.autoFire;
$('#auto').addEventListener('change', (e) => { G.autoFire = e.target.checked; store.set('ba.auto', G.autoFire ? '1' : '0'); });

// ================================== network ==============================
net.on('open', () => {
  if (G.autoJoin || G.id) net.send({ t: 'join', name: G.name });
  G.autoJoin = false;
});
net.on('close', () => { if (G.id) $('#net').classList.remove('hidden'); });
net.on('joined', (m) => {
  G.id = m.id; G.color = m.color;
  $('#net').classList.add('hidden');
  renderer.setMyColor(m.color);
  show('lobby');
  if (G.practice && !G.setupDone) { G.setupDone = true; net.send({ t: 'setup', bots: 5 }); }
});
net.on('error', (m) => { $('#status').textContent = m.msg; });
net.on('lobby', (m) => {
  G.lobby = m;
  if (m.state === 'lobby' && !document.querySelector('#lobby.active')) { G.inGame = false; show('lobby'); }
  renderLobby();
});
net.on('start', () => { G.spawnN = -1; enterGame(); });
net.on('snap', (m) => onSnap(m));
net.on('results', (m) => showResults(m.rows));

function enterGame() {
  G.inGame = true;
  G.me = createPlayer(G.id, G.name, G.color);
  G.me.alive = false;
  G.others.clear();
  G.hist = []; G.killfeed = []; G.deadBy = null;
  show('game');
}

const nameOf = (id) => G.lobby?.players.find(p => p.id === id)?.name || (id === G.id ? G.name : '?');
const colorOf = (id) => G.lobby?.players.find(p => p.id === id)?.color || '#fff';

function onSnap(m) {
  if (!G.inGame) enterGame();
  const now = performance.now();
  G.left = m.left;
  if (m.sc) G.scores = m.sc;
  for (const [id, x, y, z, yaw, pitch, alive, hp, shield] of m.ps) {
    if (id === G.id) continue;
    let o = G.others.get(id);
    if (!o) { o = { id, buf: [] }; G.others.set(id, o); }
    o.buf.push({ t: now, x, y, z, yaw, pitch, alive: !!alive, hp, shield: !!shield });
    if (o.buf.length > 30) o.buf.shift();
    o.seen = now;
  }
  for (const [id, o] of G.others) if (now - o.seen > 1000) G.others.delete(id);
  if (m.me) reconcile(m.me);
  for (const e of m.ev || []) onEvent(e);
}

// Line the predicted you up with the host. The host tells us which of our
// inputs it had applied (seq); we compare with where we were at that input
// and shift by the difference, so nothing you did since is undone.
function reconcile(s) {
  const me = G.me;
  const wasAlive = me.alive;
  me.alive = !!s.alive; me.hp = s.hp; me.ammo = s.ammo; me.reloadT = s.rel; me.shieldT = s.sh ? 1 : 0; me.respawnT = s.rs;
  if (!me.alive) { G.hist = []; return; }
  if (!wasAlive || s.sn !== G.spawnN) {
    // A fresh spawn: take the host's position and face the way the spawn faces.
    if (s.sn !== G.spawnN) { G.spawnN = s.sn; me.input.yaw = s.sy; me.input.pitch = 0; }
    Object.assign(me, { x: s.x, y: s.y, z: s.z, vx: 0, vy: 0, vz: 0, grounded: true });
    G.hist = []; G.deadBy = null;
    return;
  }
  const h = G.hist.find(e => e.seq === s.seq);
  if (!h) return;
  const ex = s.x - h.x, ey = s.y - h.y, ez = s.z - h.z, err = Math.hypot(ex, ey, ez);
  G.hist = G.hist.filter(e => e.seq > s.seq);
  if (err > 3) { me.x = s.x; me.y = s.y; me.z = s.z; me.vx = s.vx; me.vy = s.vy; me.vz = s.vz; G.hist = []; return; }
  if (err < 0.04) return;
  const k = err > 0.5 ? 1 : 0.35;
  me.x += ex * k; me.y += ey * k; me.z += ez * k;
  for (const e of G.hist) { e.x += ex * k; e.y += ey * k; e.z += ez * k; }
}

function onEvent(e) {
  const mine = e.id === G.id;
  switch (e.t) {
    case 'shot': {
      if (mine) break;               // your own shots were drawn when you fired
      const o = G.others.get(e.id), p = o?.buf.at(-1);
      if (!p) break;
      renderer.shot(false, { x: p.x, y: p.y + 1.35, z: p.z }, { x: e.x, y: e.y, z: e.z });
      const d = G.me ? Math.hypot(p.x - G.me.x, p.z - G.me.z) : 20;
      sfx.shot(Math.max(0.08, 1 - d / 40) * 0.6);
      break;
    }
    case 'hit':
      if (e.by === G.id) { hitMarker(e.head); sfx.hit(e.head); }
      if (e.on === G.id) {
        G.lastHurt = performance.now();
        renderer.hurt(); sfx.hurt();
        damageFrom(e.fx, e.fz);
      }
      break;
    case 'kill':
      G.killfeed.push({ by: e.by, on: e.on, head: e.head, t: performance.now() });
      if (G.killfeed.length > 4) G.killfeed.shift();
      renderFeed();
      if (e.by === G.id) { sfx.kill(); banner(`ELIMINATED ${nameOf(e.on).toUpperCase()}${e.head ? ' · HEADSHOT' : ''}`); }
      if (e.on === G.id) { sfx.died(); G.deadBy = e.by; }
      break;
    case 'spawn': if (mine) sfx.spawn(); break;
    case 'reload': if (mine) sfx.reload(); break;
  }
}

// ================================= the HUD ===============================
function hitMarker(head) {
  const h = $('#hitmark');
  h.classList.toggle('head', !!head);
  h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
}
function damageFrom(fx, fz) {
  const me = G.me;
  // Angle of the attacker relative to where you look.
  const a = Math.atan2(-(fx - me.x), -(fz - me.z)) - me.yaw;
  const d = $('#dmgdir');
  d.style.transform = `translate(-50%, -50%) rotate(${-a}rad)`;
  d.classList.remove('on'); void d.offsetWidth; d.classList.add('on');
  const v = $('#vignette'); v.classList.remove('on'); void v.offsetWidth; v.classList.add('on');
}
function banner(text) {
  const b = $('#banner'); b.textContent = text;
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
}
function renderFeed() {
  $('#feed').innerHTML = G.killfeed.map(k => `<div><b style="color:${colorOf(k.by)}">${esc(nameOf(k.by))}</b> ${k.head ? '◎' : '›'} <b style="color:${colorOf(k.on)}">${esc(nameOf(k.on))}</b></div>`).join('');
}
function updateHud() {
  const me = G.me;
  if (!me) return;
  $('#hp i').style.width = `${Math.max(0, me.hp) / MAX_HP * 100}%`;
  $('#hp b').textContent = Math.ceil(Math.max(0, me.hp));
  $('#ammo').textContent = me.reloadT > 0 ? 'RELOADING' : `${me.ammo} / ${MAG}`;
  $('#ammo').classList.toggle('low', me.ammo <= 5 && me.reloadT <= 0);
  const m = Math.floor(G.left / 60), s = G.left % 60;
  $('#timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
  const mine = G.scores.find(r => r.id === G.id);
  const top = G.scores.slice(0, 3).map((r, i) => `<div class="${r.id === G.id ? 'me' : ''}"><span>${i + 1}</span><b style="color:${r.color}">${esc(r.name)}</b><em>${r.k}</em></div>`).join('');
  $('#mini').innerHTML = top + (mine && G.scores.indexOf(mine) > 2 ? `<div class="me"><span>${G.scores.indexOf(mine) + 1}</span><b style="color:${mine.color}">${esc(mine.name)}</b><em>${mine.k}</em></div>` : '');
  $('#kd').textContent = mine ? `${mine.k} K · ${mine.d} D` : '';
  const dead = !me.alive;
  $('#dead').classList.toggle('hidden', !dead);
  if (dead) $('#dead-text').innerHTML = `${G.deadBy ? `Eliminated by <b style="color:${colorOf(G.deadBy)}">${esc(nameOf(G.deadBy))}</b>` : 'Eliminated'}<br><small>back in ${Math.max(0, Math.ceil(me.respawnT || 0))}</small>`;
  $('#shieldnote').classList.toggle('hidden', !(me.alive && me.shieldT > 0));
  const now = performance.now();
  if (G.killfeed.length && now - G.killfeed[0].t > 6000) { G.killfeed.shift(); renderFeed(); }
}

function showResults(rows) {
  G.inGame = false;
  show('results');
  const host = G.lobby?.host === G.id;
  $('#results-title').textContent = rows[0]?.id === G.id ? 'YOU WIN!' : `${rows[0]?.name || '?'} WINS`;
  $('#results-rows').innerHTML = rows.map((r, i) => `<div class="pl ${r.id === G.id ? 'me' : ''}"><span>${i + 1}</span><i style="background:${r.color}"></i><b>${esc(r.name)}</b><small>${r.k} K · ${r.d} D</small></div>`).join('');
  $('#btn-again').classList.toggle('hidden', !host);
  $('#results-wait').classList.toggle('hidden', host);
}

// ================================ game loop ==============================
// Others are drawn INTERP ms in the past, between two snapshots.
function sample(o, t) {
  const b = o.buf;
  if (!b.length) return null;
  let i = b.length - 1;
  while (i > 0 && b[i - 1].t > t) i--;
  const a = b[Math.max(0, i - 1)], c = b[i];
  if (a === c || c.t <= a.t) return c;
  const k = Math.max(0, Math.min(1, (t - a.t) / (c.t - a.t)));
  const dy = Math.atan2(Math.sin(c.yaw - a.yaw), Math.cos(c.yaw - a.yaw));
  return { ...c, x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, z: a.z + (c.z - a.z) * k, yaw: a.yaw + dy * k };
}

let last = performance.now(), acc = 0, sendAcc = 0, hudT = 0;
const DT = 1 / TICK;
let pendJump = false, pendReload = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const me = G.me;
  const view = [];
  if (G.inGame && me) {
    // Aim and move from the controls.
    const look = controls.takeLook();
    me.input.yaw += look.yaw;
    me.input.pitch = Math.max(-1.45, Math.min(1.45, me.input.pitch + look.pitch));
    const st = controls.stick();
    me.input.mx = st.x; me.input.mz = st.z;
    if (controls.takeJump()) { me.input.jump = true; pendJump = true; if (me.grounded && me.alive) sfx.jump(); }
    if (controls.takeReload()) pendReload = true;

    // Who's where right now (for drawing and auto-fire).
    const t = now - INTERP;
    const others = [];
    for (const o of G.others.values()) {
      const s = sample(o, t);
      if (!s) continue;
      const lp = G.lobby?.players.find(p => p.id === o.id);
      view.push({ id: o.id, ...s, color: lp?.color || '#fff', name: lp?.name || '?' });
      others.push({ id: o.id, x: s.x, y: s.y, z: s.z, alive: s.alive, shieldT: s.shield ? 1 : 0 });
    }

    // Fire: held trigger, or auto-fire when an enemy is under the crosshair.
    let fire = controls.firing();
    if (!fire && G.autoFire && me.alive && matchMedia('(pointer: coarse)').matches) {
      const tr = traceShot({ ...me, yaw: me.input.yaw, pitch: me.input.pitch, vx: 0, vz: 0, grounded: true }, others, () => 0.5);
      fire = !!tr.who && !tr.who.shieldT;
    }
    me.input.fire = fire;

    // Predict yourself at the simulation rate; send inputs at INPUT_RATE.
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      if (me.alive) stepPlayer(me, DT);
      G.seq++;
      me.input.seq = G.seq;
      G.hist.push({ seq: G.seq, x: me.x, y: me.y, z: me.z });
      if (G.hist.length > 120) G.hist.shift();
    }
    sendAcc += dt;
    if (sendAcc >= 1 / INPUT_RATE) {
      sendAcc = 0;
      net.send({ t: 'in', s: G.seq, mx: +me.input.mx.toFixed(2), mz: +me.input.mz.toFixed(2), yw: +me.input.yaw.toFixed(3), pt: +me.input.pitch.toFixed(3), j: pendJump ? 1 : 0, f: fire ? 1 : 0, r: pendReload ? 1 : 0 });
      pendJump = false; pendReload = false;
    }

    // Your shots appear the moment you fire; the host decides what they hit.
    G.localFireT -= dt;
    if (fire && me.alive && me.ammo > 0 && !(me.reloadT > 0) && G.localFireT <= 0) {
      G.localFireT = 1 / FIRE_RATE;
      me.ammo--;
      const tr = traceShot({ ...me, yaw: me.input.yaw, pitch: me.input.pitch }, others, Math.random);
      renderer.shot(true, null, { x: tr.ex, y: tr.ey, z: tr.ez });
      sfx.shot(1);
    }

    renderer.syncPlayers(view, dt);
    renderer.gun.visible = !!me.alive;
    renderer.setCamera(me.x, me.y, me.z, me.input.yaw, me.input.pitch, me.alive && moving(me) && me.grounded, dt);
    hudT += dt;
    if (hudT > 0.08) { hudT = 0; updateHud(); }
  } else {
    // Menus: a slow fly-around behind them.
    const a = now / 9000;
    renderer.syncPlayers([], dt);
    renderer.camera.position.set(24 + Math.sin(a) * 20, 9, 24 + Math.cos(a) * 20);
    renderer.camera.rotation.set(-0.35, a + Math.PI, 0);
  }
  renderer.draw(dt);
}
requestAnimationFrame(frame);

show('connect');
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
window.BA_debug = { net, renderer, controls };
