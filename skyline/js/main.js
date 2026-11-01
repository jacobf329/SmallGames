// Skyline Hustle - entry point: title screen, game loop, touch input, saves.

import { SPEEDS, SECONDS_PER_HOUR, SCENARIOS, BIZ } from './data.js';
import { createGame, serialize, deserialize, money, netWorth, dayName, PROFILE } from './sim.js';
import { advanceGame } from './ai.js';
import { Renderer, darkness } from './render.js';
import { UI } from './ui.js';
import { sfx, setSound } from './audio.js';

const SAVE_KEY = 'skyline-hustle-save-v1';
const $ = id => document.getElementById(id);

const app = {
  s: null,
  speed: 1,
  holds: new Set(),            // reasons the clock is held (offer modal...)
  renderer: new Renderer($('city')),
  ui: null,
  lastDay: 0,

  setSpeed(i) {
    this.speed = i;
    document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.speed === i));
  },
  pauseFor(why) { this.holds.add(why); },
  resume(why) { this.holds.delete(why); },
  running() { return this.s && !this.s.over && this.speed > 0 && !this.holds.size && !this.ui.modalOpen(); },

  save() {
    if (!this.s) return;
    try { localStorage.setItem(SAVE_KEY, serialize(this.s)); } catch (e) { /* storage full or blocked */ }
  },

  start(s) {
    this.s = s;
    this.lastDay = s.day;
    this.ui.seenNews = 0;
    this.ui.shownOffers.clear();
    this.ui.tickerQueue = [];
    $('title').classList.add('hidden');
    ['hud', 'nav'].forEach(id => $(id).classList.remove('hidden'));
    this.renderer.walkers = [];
    this.renderer.cars = [];
    this.renderer.fit();
    this.ui.close();
    this.setSpeed(1);
    this.ui.onHour();
    this.hud();
  },

  toTitle() {
    this.s = null;
    this.ui.close();
    ['hud', 'nav', 'sheet'].forEach(id => $(id).classList.add('hidden'));
    $('modal').classList.add('hidden');
    $('btn-continue').classList.toggle('hidden', !localStorage.getItem(SAVE_KEY));
    $('title').classList.remove('hidden');
  },

  hud() {
    const s = this.s;
    if (!s) return;
    const me = s.players[0];
    $('cash').textContent = money(me.cash);
    $('cash').className = me.cash < 0 ? 'neg' : '';
    const today = Object.entries(me.today).filter(([k]) => k !== 'capex' && k !== 'trade').reduce((a, [, v]) => a + v, 0);
    $('cash-delta').innerHTML = `today <span class="${today >= 0 ? 'pos' : 'neg'}">${today >= 0 ? '+' : ''}${money(today)}</span>${me.loan ? ` · loan ${money(me.loan)}` : ''}`;
    const mins = Math.floor(s.t * 60 / 15) * 15;
    $('clock-time').textContent = `${String(s.hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    $('clock-day').textContent = `Day ${s.day} · ${dayName(s)}`;
    const sc = SCENARIOS[s.scenario];
    const w = netWorth(s, 0);
    if (sc.goal) {
      $('goal-fill').style.width = Math.max(0, Math.min(100, w / sc.goal * 100)) + '%';
      $('goal-text').textContent = `Net worth ${money(w)} / ${money(sc.goal)} · ${Math.max(0, sc.days - s.day + 1)} days left`;
    } else {
      $('goal-fill').style.width = '0%';
      $('goal-text').textContent = `Net worth ${money(w)}`;
    }
  },

  // Called once per simulated hour.
  afterHour(steps) {
    const s = this.s;
    const r = this.renderer;
    // Money pops over your shops that just earned.
    if (steps <= 2 && s.lastHour) {
      for (const id in s.lastHour) {
        const lot = s.lots[id];
        const v = s.lastHour[id];
        if (!lot.business || lot.business.owner !== 0) continue;
        if (v > 4) r.floater(lot, '+' + money(v), '#5dff9e');
        else if (v < -4) r.floater(lot, money(v), '#ff8a8a');
      }
      if (Object.keys(s.lastHour).some(id => s.lots[id].business?.owner === 0 && s.lastHour[id] > 4)) sfx.coin();
    }
    if (s.day !== this.lastDay) {
      this.lastDay = s.day;
      const y = s.players[0].yesterday;
      const op = Object.entries(y).filter(([k]) => k !== 'capex' && k !== 'trade').reduce((a, [, v]) => a + v, 0);
      if (Object.keys(y).length) this.ui.toast(`Day ${s.day - 1} closed: ${op >= 0 ? '+' : ''}${money(op)} operating profit.`, op >= 0 ? 'good' : 'bad');
      this.save();
    }
    this.ui.onHour();
    if (s.over) {
      localStorage.removeItem(SAVE_KEY);
      this.ui.gameOver();
    }
  },
};
app.ui = new UI(app);

// --------------------------------------------------------------- loop ----
let last = performance.now();
let hudAt = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const s = app.s;
  if (s) {
    let steps = 0;
    if (app.running()) steps = advanceGame(s, dt * SPEEDS[app.speed] / SECONDS_PER_HOUR);
    if (steps) app.afterHour(steps);
    if (now > hudAt) { app.hud(); hudAt = now + 150; }
    app.ui.tickTicker(now);
    // Crowd size follows the time of day and how busy the city is.
    const hf = s.hour + s.t;
    const dk = darkness(hf);
    const open = s.lots.filter(l => l.business && PROFILE[l.business.type][s.hour]).length;
    app.renderer.syncCrowd(Math.round(18 + (1 - dk * 0.7) * (25 + open * 4)), Math.round(6 + (1 - dk * 0.6) * 10));
    app.renderer.draw(s, hf, dt, app.running() ? SPEEDS[app.speed] : 0);
  } else {
    // Title screen: a gently turning empty city behind the menu.
    if (!app.demo) app.demo = createGame({ seed: 4 });
    app.demo.t += dt * 0.25;
    if (app.demo.t >= 1) { app.demo.t -= 1; app.demo.hour = (app.demo.hour + 1) % 24; }
    app.renderer.syncCrowd(40, 10);
    app.renderer.draw(app.demo, app.demo.hour + app.demo.t, dt, 1);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// -------------------------------------------------------------- input ----
// One finger pans, two fingers pinch-zoom, a tap selects a lot.
const canvas = $('city');
const pointers = new Map();
let gesture = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) gesture = { sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() };
  else gesture = { pinch: true, moved: true };
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const r = app.renderer;
  if (pointers.size === 1 && gesture && !gesture.pinch) {
    if (!gesture.moved && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 8) gesture.moved = true;
    if (gesture.moved) r.pan(e.clientX - p.x, e.clientY - p.y);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    const midB = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    p.x = e.clientX; p.y = e.clientY;
    const [c, d] = [...pointers.values()];
    const after = Math.hypot(c.x - d.x, c.y - d.y);
    const midA = [(c.x + d.x) / 2, (c.y + d.y) / 2];
    if (before > 10) r.zoomAt(midA[0], midA[1], after / before);
    r.pan(midA[0] - midB[0], midA[1] - midB[1]);
    return;
  }
  p.x = e.clientX; p.y = e.clientY;
});
const endPointer = e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0 && gesture && !gesture.moved && !gesture.pinch && app.s) {
    const id = app.renderer.pick(e.clientX, e.clientY);
    if (id >= 0) { sfx.tap(); app.ui.openLot(id); }
    else if (app.ui.view) app.ui.close();
  }
  if (pointers.size === 0) gesture = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); gesture = null; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  app.renderer.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

window.addEventListener('resize', () => { app.renderer.resize(); app.renderer.fit(); });
window.addEventListener('keydown', e => {
  if (!app.s || e.target.tagName === 'INPUT') return;
  if (e.key === ' ') { e.preventDefault(); app.setSpeed(app.speed ? 0 : 1); }
  else if (e.key >= '0' && e.key <= '3') app.setSpeed(+e.key);
  else if (e.key === 'Escape') app.ui.view ? app.ui.close() : null;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) app.save(); });

// --------------------------------------------------------------- title ----
let scenario = 'standard', difficulty = 'normal';
const segPick = (id, cb) => document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === b));
  cb(b.dataset.v);
  sfx.tap();
}));
const blurb = () => { $('scenario-blurb').textContent = SCENARIOS[scenario].blurb; };
segPick('seg-scenario', v => { scenario = v; blurb(); });
segPick('seg-difficulty', v => { difficulty = v; });
blurb();
$('in-company').value = localStorage.getItem('skyline-company') || '';
$('btn-new').addEventListener('click', () => {
  const company = $('in-company').value.trim() || 'Your Company';
  localStorage.setItem('skyline-company', company);
  sfx.build();
  app.start(createGame({ scenario, difficulty, company, name: 'You' }));
  setTimeout(() => app.ui.toast('Tap a lot to get started. Cheap colours are top-left.', 'good'), 600);
});
$('btn-continue').addEventListener('click', () => {
  try { app.start(deserialize(localStorage.getItem(SAVE_KEY))); sfx.tap(); }
  catch (e) { localStorage.removeItem(SAVE_KEY); app.toTitle(); }
});
setSound(localStorage.getItem('skyline-sound') !== '0');
app.toTitle();

// Handy for debugging from the console.
window.__SH = app;
