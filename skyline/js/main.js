// Skyline Hustle - entry point: title screen, game loop, auctions, saves.

import { SPEEDS, SECONDS_PER_HOUR, SCENARIOS, eraName } from './data.js';
import { createGame, serialize, deserialize, money, netWorth, dayName, yearOf, operating, goalProgress, goalText } from './sim.js';
import { advanceGame } from './game.js';
import { auctionTick } from './auction.js';
import { Renderer3D } from './render3d.js';
import { UI } from './ui.js';
import { sfx, setSound } from './audio.js';

const SAVE_KEY = 'skyline-hustle-save-v2';
const $ = id => document.getElementById(id);

const app = {
  s: null,
  speed: 1,
  holds: new Set(),
  renderer: null,
  ui: null,
  lastDay: 0,

  setSpeed(i) {
    this.speed = i;
    document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.speed === i));
  },
  pauseFor(why) { this.holds.add(why); },
  resume(why) { this.holds.delete(why); },
  running() { return this.s && !this.s.over && this.speed > 0 && !this.holds.size && !this.ui.modalOpen() && !this.s.auction; },

  save() {
    if (!this.s || this.s.over) return;
    try { localStorage.setItem(SAVE_KEY, serialize(this.s)); } catch (e) { /* storage full or blocked */ }
  },

  start(s) {
    this.s = s;
    s.liveAuctions = true;
    this.lastDay = s.day;
    this.ui.seenNews = 0;
    this.ui.shownOffers.clear();
    this.ui.tickerQueue = [];
    $('title').classList.add('hidden');
    ['hud', 'nav', 'camctl'].forEach(id => $(id).classList.remove('hidden'));
    this.renderer.fit();
    this.ui.close();
    this.setSpeed(1);
    this.ui.onHour();
    this.hud();
  },

  toTitle() {
    this.s = null;
    this.ui.close();
    ['hud', 'nav', 'sheet', 'auction', 'camctl'].forEach(id => $(id).classList.add('hidden'));
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
    const today = operating(me.today);
    $('cash-delta').innerHTML = `today <span class="${today >= 0 ? 'pos' : 'neg'}">${today >= 0 ? '+' : ''}${money(today)}</span>${me.loan ? ` · loan ${money(me.loan)}` : ''}`;
    const mins = Math.floor(s.t * 60 / 15) * 15;
    $('clock-time').textContent = `${String(s.hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    $('clock-day').textContent = `${dayName(s)} · Day ${s.day} · ${yearOf(s)}`;
    const sc = SCENARIOS[s.scenario];
    const w = netWorth(s, 0);
    let pct = 0, text;
    if (sc.mode === 'goals') {
      const g = s.goals.find(x => !x.done);
      if (g) {
        const v = goalProgress(s, g);
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

  afterHour(steps) {
    const s = this.s;
    const r = this.renderer;
    if (steps <= 2 && s.lastHour) {
      let earned = false;
      for (const id in s.lastHour) {
        const lot = s.lots[id];
        const v = s.lastHour[id];
        if (!lot.business || lot.business.owner !== 0) continue;
        if (v > 4) { r.floater(lot, '+' + money(v), '#5dff9e'); earned = true; }
        else if (v < -4) r.floater(lot, money(v), '#ff8a8a');
      }
      if (earned) sfx.coin();
    }
    if (s.day !== this.lastDay) {
      this.lastDay = s.day;
      const y = s.players[0].yesterday;
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
      localStorage.removeItem(SAVE_KEY);
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
  if (hit.kind === 'citizen') app.ui.openCitizen(hit.id);
  else app.ui.openLot(hit.id);
};

// --------------------------------------------------------------- loop ----
let last = performance.now();
let hudAt = 0, citAt = 0;
function frame(now) {
  const real = Math.min(1, (now - last) / 1000);
  const dt = Math.min(0.1, real);
  last = now;
  app.fps = app.fps ? app.fps * 0.95 + (1 / Math.max(real, 0.001)) * 0.05 : 30;
  const s = app.s;
  if (s) {
    let steps = 0;
    if (s.auction) {
      // Auctions run in real time while the city clock waits.
      auctionTick(s, real);       // real seconds, even on a slow device
      app.ui.auctionFrame();
      if (!s.auction && s.lastAuction) {
        app.ui.auctionResult(s.lastAuction, s.lastAuction.lotId);
        app.ui.auctionFrame();
        app.ui.onHour();
      }
    } else if (app.running()) steps = advanceGame(s, dt * SPEEDS[app.speed] / SECONDS_PER_HOUR);
    if (steps) app.afterHour(steps);
    if (s.auction) app.ui.auctionFrame();
    if (now > hudAt) { app.hud(); hudAt = now + 150; }
    if (app.ui.view?.kind === 'citizen' && now > citAt) { app.ui.refresh(); citAt = now + 500; }
    app.ui.tickTicker(now);
    const flowing = app.running() ? SPEEDS[app.speed] : 0;
    app.renderer.draw(s, s.hour + s.t, dt, flowing);
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
  if (e.key === ' ') { e.preventDefault(); app.setSpeed(app.speed ? 0 : 1); }
  else if (e.key >= '0' && e.key <= '3') app.setSpeed(+e.key);
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
$('btn-new').addEventListener('click', () => {
  const company = $('in-company').value.trim() || 'Your Company';
  localStorage.setItem('skyline-company', company);
  sfx.build();
  app.overShown = false;
  app.start(createGame({ scenario, difficulty, company, name: 'You' }));
  setTimeout(() => app.ui.toast('Tap any empty lot to open a shop. Land goes on sale at 9:00.', 'good'), 600);
});
$('btn-continue').addEventListener('click', () => {
  try { app.overShown = false; app.start(deserialize(localStorage.getItem(SAVE_KEY))); sfx.tap(); }
  catch (e) { localStorage.removeItem(SAVE_KEY); app.toTitle(); }
});
setSound(localStorage.getItem('skyline-sound') !== '0');
app.toTitle();

window.__SH = app;
