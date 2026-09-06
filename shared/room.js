// A race room: lobby, countdown, authoritative simulation, results.
// The server owns the truth; phones send intent and render predictions.

import * as C from './constants.js';
import { Track, laneX } from './track.js';
import { createPlayer, resetForRace, stepPlayer, wipeout } from './physics.js';
import { ITEM, rollItem } from './items.js';
import { mulberry32 } from './rng.js';
import { initBot, driveBot, botName } from './bots.js';

export const STATE = { LOBBY: 'lobby', COUNTDOWN: 'countdown', RACING: 'racing', RESULTS: 'results' };

const DISTANCES = { sprint: 1100, classic: 1800, marathon: 2800 };

let projSeq = 1;

export class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.players = [];
    this.hostId = null;
    this.state = STATE.LOBBY;
    this.settings = {
      distance: 'classic',
      bots: 0,
      botSkill: 0.72,
      items: true
    };
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.track = null;
    this.raceTime = 0;
    this.countdown = 0;
    this.tick = 0;
    this.events = [];
    this.projectiles = [];
    this.finishOrder = [];
    this.graceLeft = 0;
    this.resultsLeft = 0;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.onBroadcast = opts.onBroadcast || (() => {});
    this.lastActivity = Date.now();
  }

  get distance() { return DISTANCES[this.settings.distance] ?? DISTANCES.classic; }
  get humans() { return this.players.filter(p => !p.isBot); }
  // Anyone who joined after the lights went out watches this one out.
  get racers() { return this.players.filter(p => !p.spectator); }
  get isFull() { return this.players.length >= C.MAX_PLAYERS; }

  // ---- membership ---------------------------------------------------------
  addPlayer(id, name, conn) {
    if (this.isFull) return null;
    const used = new Set(this.players.map(p => C.COLORS.indexOf(p.color)));
    let ci = 0;
    while (used.has(ci) && ci < C.COLORS.length) ci++;
    const p = createPlayer(id, sanitizeName(name), ci, false);
    p.spectator = this.state !== STATE.LOBBY;
    p.conn = conn;
    p.joinedAt = Date.now();
    this.players.push(p);
    if (!this.hostId || !this.players.some(x => x.id === this.hostId && !x.isBot)) this.hostId = id;
    this.lastActivity = Date.now();
    return p;
  }

  removePlayer(id) {
    const p = this.players.find(x => x.id === id);
    if (!p) return;
    if (this.state === STATE.RACING || this.state === STATE.COUNTDOWN) {
      // Hand the runner to the AI so the race keeps its shape.
      p.connected = false;
      p.conn = null;
      if (!p.isBot) { p.isBot = true; p.wasHuman = true; p.name = p.name + ' (afk)'; initBot(p, 0.6); }
    } else {
      this.players = this.players.filter(x => x.id !== id);
    }
    if (this.hostId === id) {
      const next = this.players.find(x => !x.isBot && x.connected);
      this.hostId = next ? next.id : null;
    }
    this.lastActivity = Date.now();
  }

  setBots(n) {
    const target = Math.max(0, Math.min(C.MAX_PLAYERS - this.humans.length, n | 0));
    this.settings.bots = target;
    const bots = this.players.filter(p => p.isBot && !p.wasHuman);
    while (bots.length > target) { const b = bots.pop(); this.players = this.players.filter(p => p !== b); }
    let i = bots.length;
    while (bots.length < target && this.players.length < C.MAX_PLAYERS) {
      const used = new Set(this.players.map(p => C.COLORS.indexOf(p.color)));
      let ci = 0;
      while (used.has(ci) && ci < C.COLORS.length) ci++;
      const b = createPlayer('bot' + (i + 1) + '-' + Math.floor(Math.random() * 1e6).toString(36), botName(i), ci, true);
      b.ready = true;
      const spread = (Math.random() - 0.5) * 0.34;
      initBot(b, Math.max(0.25, Math.min(0.98, this.settings.botSkill + spread)));
      this.players.push(b);
      bots.push(b);
      i++;
    }
  }

  // ---- race lifecycle -----------------------------------------------------
  canStart() {
    const humans = this.humans.filter(p => p.connected);
    if (humans.length === 0) return false;
    return humans.every(p => p.ready) || humans.length === 1;
  }

  startRace() {
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.track = new Track(this.seed, this.distance + 200);
    this.state = STATE.COUNTDOWN;
    this.countdown = C.COUNTDOWN;
    this.raceTime = 0;
    this.tick = 0;
    this.projectiles = [];
    this.finishOrder = [];
    this.graceLeft = 0;
    this.events = [];

    // Starting grid: five across, rows staggered backwards.
    for (const p of this.players) p.spectator = false;
    const order = shuffled(this.players.slice(), this.rng);
    order.forEach((p, i) => {
      const lane = i % C.MAIN_LANES;
      const row = Math.floor(i / C.MAIN_LANES);
      p.startLane = lane;
      resetForRace(p);
      p.startZ = -row * 4.5;
      p.z = p.startZ;
      p.x = laneX(0, lane, 0);
      p.place = i + 1;
      if (p.isBot) initBot(p, p.ai ? p.ai.skill : this.settings.botSkill);
    });
    return {
      seed: this.seed,
      distance: this.distance,
      players: this.players.map(p => this.pubPlayer(p))
    };
  }

  toLobby() {
    this.state = STATE.LOBBY;
    this.projectiles = [];
    this.events = [];
    for (const p of this.players) { if (!p.isBot) p.ready = false; p.spectator = false; }
    // Runners abandoned mid-race by their humans go away between races.
    this.players = this.players.filter(p => !(p.wasHuman && !p.connected));
    this.lastActivity = Date.now();
  }

  progress(p) { return p.z - (p.startZ || 0); }

  // ---- the simulation -----------------------------------------------------
  step(dt) {
    if (this.state === STATE.COUNTDOWN) {
      this.countdown -= dt;
      // Runners roll forward on the grid but obstacles do not bite yet.
      for (const p of this.racers) stepPlayer(p, dt, this.track, this.events, { racing: false });
      if (this.countdown <= 0) { this.state = STATE.RACING; this.countdown = 0; }
      this.tick++;
      return;
    }
    if (this.state === STATE.RESULTS) {
      this.resultsLeft -= dt;
      return;
    }
    if (this.state !== STATE.RACING) return;

    this.raceTime += dt;
    this.tick++;

    const racers = this.racers;
    const world = { players: racers, room: this };
    for (const p of racers) {
      if (p.finished) { p.input.use = false; continue; }
      if (p.isBot) driveBot(p, this.track, world, dt);
      p.drafting = this.isDrafting(p);
      if (p.input.use) { p.input.use = false; this.useItem(p); }
      stepPlayer(p, dt, this.track, this.events);
    }

    this.consumeEvents();
    this.stepProjectiles(dt);
    this.playerContacts();
    this.updatePlaces();
    this.checkFinish(dt);
  }

  isDrafting(p) {
    for (const o of this.racers) {
      if (o === p || o.finished || o.path !== p.path) continue;
      const dz = o.z - p.z;
      if (dz > 2.5 && dz < C.DRAFT_RANGE && Math.abs(o.x - p.x) < 2.0) return true;
    }
    return false;
  }

  // Turn physics events that need authority (item boxes) into game state.
  consumeEvents() {
    for (const ev of this.events) {
      if (ev.t !== 'box') continue;
      const p = this.byId(ev.id);
      if (!p || p.item) continue;
      const rank = this.players.length > 1 ? (p.place - 1) / (this.players.length - 1) : 0.5;
      p.item = this.settings.items ? rollItem(this.rng, rank) : ITEM.BOOST;
      ev.item = p.item;
    }
  }

  useItem(p) {
    if (!p.item || p.finished) return;
    const item = p.item;
    p.item = null;
    switch (item) {
      case ITEM.BOOST:
        p.boostT = Math.max(p.boostT, C.BOOST_TIME);
        break;
      case ITEM.SHIELD:
        p.shieldT = C.SHIELD_TIME;
        break;
      case ITEM.MAGNET:
        p.magnetT = C.MAGNET_TIME;
        break;
      case ITEM.COINS:
        p.coins += 10;
        p.boostT = Math.max(p.boostT, 0.5);
        break;
      case ITEM.STAR:
        p.starT = C.STAR_TIME;
        p.invulnT = Math.max(p.invulnT, C.STAR_TIME);
        break;
      case ITEM.ROCKET:
        p.rocketT = C.ROCKET_TIME;
        p.invulnT = Math.max(p.invulnT, C.ROCKET_TIME);
        p.stunT = 0;
        break;
      case ITEM.BOLT: {
        let zapped = 0;
        for (const o of this.racers) {
          if (o === p || o.finished) continue;
          if (this.progress(o) > this.progress(p)) {
            o.boltT = C.BOLT_TIME;
            o.boostT = 0;
            zapped++;
          }
        }
        this.events.push({ t: 'bolt', id: p.id, n: zapped });
        break;
      }
      case ITEM.BANANA:
        this.projectiles.push({
          id: projSeq++, kind: 'banana', owner: p.id,
          z: p.z - 2.5, x: p.x, y: 0.25, path: p.path, life: C.BANANA_LIFE, arm: 0.4
        });
        break;
      case ITEM.SHELL:
        this.projectiles.push({
          id: projSeq++, kind: 'shell', owner: p.id,
          z: p.z + 2.5, x: p.x, y: 0.6, path: p.path, life: C.SHELL_LIFE, arm: 0.15, target: null
        });
        break;
      default:
        break;
    }
    this.events.push({ t: 'use', id: p.id, item });
  }

  stepProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.arm = Math.max(0, pr.arm - dt);
      if (pr.kind === 'shell') {
        pr.z += C.SHELL_SPEED * dt;
        // Home on the nearest runner still in front of it.
        let best = null;
        for (const o of this.racers) {
          if (o.id === pr.owner && pr.arm > 0) continue;
          if (o.finished) continue;
          const dz = o.z - pr.z;
          if (dz < 0 || dz > 70) continue;
          if (!best || dz < best.z - pr.z) best = o;
        }
        pr.target = best ? best.id : null;
        if (best) {
          const dx = best.x - pr.x;
          const step = C.SHELL_HOME * dt;
          pr.x += Math.abs(dx) <= step ? dx : Math.sign(dx) * step;
          pr.path = best.path;
          pr.y = 0.6 + (best.path === 1 ? 0 : 0);
        }
      }
      // Contact check.
      for (const o of this.racers) {
        if (o.finished) continue;
        if (o.id === pr.owner && pr.arm > 0) continue;
        if (Math.abs(o.z - pr.z) > 1.6) continue;
        if (Math.abs(o.x - pr.x) > 1.5) continue;
        if (o.y > 1.6 && pr.kind === 'banana') continue;    // jump the grease
        if (o.starT > 0 || o.rocketT > 0) { pr.life = 0; this.events.push({ t: 'smashproj', id: o.id }); continue; }
        const hit = wipeout(o, this.events, pr.kind, true);
        this.events.push({ t: 'projhit', id: o.id, by: pr.owner, kind: pr.kind, blocked: !hit });
        pr.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter(pr => pr.life > 0);
  }

  playerContacts() {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        if (a.finished || b.finished || a.path !== b.path) continue;
        if (Math.abs(a.z - b.z) > 1.5) continue;
        if (Math.abs(a.x - b.x) > 1.35) continue;
        if (Math.abs(a.y - b.y) > 1.4) continue;
        const aStrong = a.starT > 0 || a.rocketT > 0;
        const bStrong = b.starT > 0 || b.rocketT > 0;
        if (aStrong && !bStrong) { wipeout(b, this.events, 'body', true); continue; }
        if (bStrong && !aStrong) { wipeout(a, this.events, 'body', true); continue; }
        if (aStrong && bStrong) continue;
        // Ordinary shoulder barge: shove apart, the faster one wins the line.
        const dir = Math.sign(a.x - b.x) || (a.id < b.id ? 1 : -1);
        a.x += dir * 0.28;
        b.x -= dir * 0.28;
        const slow = a.speed > b.speed ? b : a;
        slow.speed = Math.max(C.MIN_SPEED, slow.speed - 3.2);
        this.events.push({ t: 'bump', id: slow.id });
      }
    }
  }

  updatePlaces() {
    const order = this.racers.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return this.progress(b) - this.progress(a);
    });
    order.forEach((p, i) => { p.place = i + 1; });
  }

  checkFinish(dt) {
    const dist = this.distance;
    const racers = this.racers;
    for (const p of racers) {
      if (p.finished) continue;
      if (this.progress(p) >= dist) {
        p.finished = true;
        p.finishTime = this.raceTime;
        this.finishOrder.push(p.id);
        this.events.push({ t: 'finish', id: p.id, place: this.finishOrder.length, time: p.finishTime });
        if (this.finishOrder.length === 1) this.graceLeft = C.FINISH_GRACE;
      }
    }
    if (this.graceLeft > 0) {
      this.graceLeft -= dt;
      if (this.graceLeft <= 0) {
        for (const p of racers) {
          if (p.finished) continue;
          p.finished = true;
          p.dnf = true;
          p.finishTime = this.raceTime + (dist - this.progress(p)) / 12;
          this.finishOrder.push(p.id);
        }
      }
    }
    if (racers.length && racers.every(p => p.finished)) this.endRace();
  }

  endRace() {
    this.state = STATE.RESULTS;
    this.resultsLeft = C.RESULTS_TIME;
    this.updatePlaces();
  }

  results() {
    return this.racers.sort((a, b) => a.place - b.place).map(p => ({
      id: p.id, name: p.name, color: p.color, bot: p.isBot, place: p.place,
      time: +(p.finishTime || 0).toFixed(2), dnf: !!p.dnf,
      coins: p.coins, hits: p.hits, shortcuts: p.shortcuts, top: +p.topSpeed.toFixed(1)
    }));
  }

  byId(id) { return this.players.find(p => p.id === id); }

  pubPlayer(p) {
    return {
      id: p.id, name: p.name, color: p.color, bot: p.isBot, ready: p.ready,
      host: p.id === this.hostId, startLane: p.startLane ?? 2, startZ: p.startZ ?? 0,
      connected: p.connected, spectator: !!p.spectator
    };
  }

  lobbyState() {
    return {
      code: this.code,
      state: this.state,
      host: this.hostId,
      settings: this.settings,
      max: C.MAX_PLAYERS,
      players: this.players.map(p => this.pubPlayer(p))
    };
  }

  // Extra authoritative detail sent only to the player it belongs to, so the
  // phone can predict its own runner accurately.
  meBlock(p) {
    return {
      z: r2(p.z), x: r2(p.x), y: r2(p.y), vy: r2(p.vy), sp: r2(p.speed),
      tl: p.targetLane, pa: p.path, sd: p.scSide, sc: p.scId,
      stun: r2(p.stunT), inv: r2(p.invulnT), bst: r2(p.boostT), star: r2(p.starT),
      rkt: r2(p.rocketT), blt: r2(p.boltT), shd: r2(p.shieldT), mag: r2(p.magnetT),
      spn: r2(p.spinT), sld: p.sliding ? 1 : 0, sldT: r2(p.slideT),
      drf: p.drafting ? 1 : 0, c: p.coins, it: p.item || 0, pl: p.place, fin: p.finished ? 1 : 0
    };
  }

  snapshot() {
    const ps = this.racers.map(p => ({
      i: p.id,
      z: r2(p.z), x: r2(p.x), y: r2(p.y), s: r1(p.speed),
      l: p.lane, pa: p.path, sd: p.scSide,
      f: flags(p), it: p.item || 0, c: p.coins, pl: p.place
    }));
    const pr = this.projectiles.map(o => ({ i: o.id, k: o.kind === 'shell' ? 1 : 2, z: r2(o.z), x: r2(o.x), y: r2(o.y) }));
    const snap = {
      t: 'snap', tk: this.tick, tm: r2(this.raceTime), st: this.state,
      cd: this.state === STATE.COUNTDOWN ? r2(this.countdown) : 0,
      gr: r1(this.graceLeft), ps, pr, ev: this.events
    };
    this.events = [];
    return snap;
  }
}

export function flags(p) {
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
  if (p.drafting) f |= 4096;
  return f;
}

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export function sanitizeName(name) {
  const s = String(name || '').replace(/[^\w \-!?.']/g, '').trim().slice(0, 14);
  return s || 'Runner';
}

function shuffled(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export { DISTANCES };
