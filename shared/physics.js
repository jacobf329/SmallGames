// The one true movement model. Runs on the server (authoritative) and on each
// client (prediction) so both agree without arguing.

import * as C from './constants.js';
import { OB, PICK } from './constants.js';
import { laneX, laneCount } from './track.js';

export function createPlayer(id, name, colorIndex, isBot = false) {
  return {
    id, name, isBot,
    color: C.COLORS[colorIndex % C.COLORS.length],
    ready: false, connected: true,
    // motion
    z: 0, x: 0, y: 0, vy: 0, speed: 0,
    lane: 2, targetLane: 2, path: 0, scSide: 0, scId: -1,
    grounded: true, sliding: false, slideT: 0,
    // status timers
    stunT: 0, invulnT: 0, boostT: 0, starT: 0, rocketT: 0, boltT: 0,
    shieldT: 0, magnetT: 0, spinT: 0, drafting: false,
    // race
    coins: 0, item: null, place: 0, finished: false, finishTime: 0,
    hits: 0, shortcuts: 0, topSpeed: 0, speedBias: 0,
    taken: new Set(),
    input: { lane: 2, jump: false, slide: false, use: false }
  };
}

export function resetForRace(p) {
  Object.assign(p, {
    z: 0, x: laneX(0, p.startLane ?? 2, 0), y: 0, vy: 0, speed: 0,
    lane: p.startLane ?? 2, targetLane: p.startLane ?? 2, path: 0, scSide: 0, scId: -1,
    grounded: true, sliding: false, slideT: 0,
    stunT: 0, invulnT: 0, boostT: 0, starT: 0, rocketT: 0, boltT: 0,
    shieldT: 0, magnetT: 0, spinT: 0, drafting: false,
    coins: 0, item: null, place: 0, finished: false, finishTime: 0,
    hits: 0, shortcuts: 0, topSpeed: 0
  });
  p.taken = new Set();
  p.input = { lane: p.startLane ?? 2, jump: false, slide: false, use: false };
}

const dec = (v, dt) => (v > 0 ? Math.max(0, v - dt) : 0);

export function coinTopSpeed(p) {
  return Math.min(p.coins, C.COIN_CAP) * C.COIN_TOP_SPEED;
}

export function targetSpeed(p) {
  let t = C.BASE_SPEED + coinTopSpeed(p) + (p.speedBias || 0);
  if (p.drafting) t += C.DRAFT_BONUS;
  if (p.boostT > 0) t = Math.max(t, C.BOOST_SPEED);
  if (p.starT > 0) t = Math.max(t, C.STAR_SPEED);
  if (p.rocketT > 0) t = C.ROCKET_SPEED;
  if (p.boltT > 0 && p.rocketT <= 0 && p.starT <= 0) t *= C.BOLT_FACTOR;
  if (p.stunT > 0) t = Math.min(t, C.KNOCK_SPEED);
  return Math.max(C.MIN_SPEED, Math.min(C.MAX_SPEED + coinTopSpeed(p) + 16, t));
}

export function wipeout(p, ev, cause, hard = false) {
  if (p.invulnT > 0 || p.starT > 0 || p.rocketT > 0) return false;
  if (p.shieldT > 0) {
    p.shieldT = 0;
    p.invulnT = 0.5;
    ev && ev.push({ t: 'shield', id: p.id });
    return false;
  }
  p.speed = C.KNOCK_SPEED;
  p.z -= C.KNOCK_BACK;
  p.stunT = hard ? C.SPIN_TIME : C.STUN_TIME;
  p.spinT = hard ? C.SPIN_TIME : 0.35;
  p.invulnT = C.INVULN_TIME;
  p.boostT = 0;
  p.sliding = false;
  p.slideT = 0;
  p.vy = 0;
  p.y = 0;
  p.grounded = true;
  p.hits++;
  const lost = Math.min(p.coins, hard ? 5 : 3);
  p.coins -= lost;
  ev && ev.push({ t: 'hit', id: p.id, cause, hard, coins: lost });
  return true;
}

// One fixed simulation step for a single runner.
export function stepPlayer(p, dt, track, ev, opts = {}) {
  const inp = p.input;
  const racing = opts.racing !== false;

  p.stunT = dec(p.stunT, dt);
  p.invulnT = dec(p.invulnT, dt);
  p.boostT = dec(p.boostT, dt);
  p.starT = dec(p.starT, dt);
  p.rocketT = dec(p.rocketT, dt);
  p.boltT = dec(p.boltT, dt);
  p.shieldT = dec(p.shieldT, dt);
  p.magnetT = dec(p.magnetT, dt);
  p.spinT = dec(p.spinT, dt);

  const lanes = laneCount(p.path);
  const frozen = p.stunT > 0 || p.finished;

  // --- steering ------------------------------------------------------------
  if (!frozen) {
    let want = Math.max(0, Math.min(lanes - 1, inp.lane | 0));
    if (p.rocketT > 0) want = Math.round((lanes - 1) / 2);   // rocket drives itself
    p.targetLane = want;
  }
  const tx = laneX(p.path, p.targetLane, p.scSide);
  const dx = tx - p.x;
  const strafe = C.STRAFE_SPEED * (p.grounded ? 1 : 0.82) * dt;
  p.x += Math.abs(dx) <= strafe ? dx : Math.sign(dx) * strafe;
  p.lane = p.targetLane;

  // --- jump / slide --------------------------------------------------------
  if (inp.jump) {
    inp.jump = false;
    if (!frozen && p.grounded) {
      p.vy = C.JUMP_V;
      p.grounded = false;
      p.sliding = false;
      p.slideT = 0;
      ev && ev.push({ t: 'jump', id: p.id });
    }
  }
  if (inp.slide) {
    inp.slide = false;
    if (!frozen) {
      if (p.grounded) { p.sliding = true; p.slideT = C.SLIDE_TIME; ev && ev.push({ t: 'slide', id: p.id }); }
      else { p.vy = Math.min(p.vy - 9, -8); }                              // fast-fall / dive
    }
  }
  if (p.sliding) {
    p.slideT -= dt;
    if (p.slideT <= 0) { p.sliding = false; p.slideT = 0; }
  }

  // --- vertical ------------------------------------------------------------
  p.y += p.vy * dt;
  p.vy -= C.GRAVITY * dt;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.grounded = true; } else { p.grounded = false; }

  // --- speed ---------------------------------------------------------------
  const want = racing ? targetSpeed(p) : 0;
  const rate = p.speed > want ? C.BRAKE : C.ACCEL;
  const ds = want - p.speed;
  p.speed += Math.abs(ds) <= rate * dt ? ds : Math.sign(ds) * rate * dt;
  if (p.speed > p.topSpeed) p.topSpeed = p.speed;

  const gain = p.path === 1 ? C.SHORTCUT_FACTOR : 1;
  p.z += p.speed * gain * dt;

  // --- shortcut branch handling -------------------------------------------
  if (racing) handleShortcut(p, track, ev);

  // --- world collisions ----------------------------------------------------
  if (racing && !p.finished) collide(p, track, ev);

  return p;
}

function handleShortcut(p, track, ev) {
  if (p.path === 0) {
    const sc = track.shortcutAt(p.z);
    if (sc && p.z >= sc.entryZ && p.z <= sc.entryZ + 10 && p.y > 0.9 &&
        p.targetLane === sc.entryLane && p.stunT <= 0) {
      p.path = 1;
      p.scSide = sc.side;
      p.scId = sc.id;
      p.targetLane = 1;
      p.lane = 1;
      p.x = laneX(1, 1, sc.side);
      p.shortcuts++;
      ev && ev.push({ t: 'shortcut', id: p.id, sc: sc.id });
    }
  } else {
    const sc = track.shortcuts[p.scId];
    if (!sc || p.z >= sc.exitZ) {
      const lane = sc ? sc.entryLane : 2;
      p.path = 0;
      p.scSide = 0;
      p.scId = -1;
      p.targetLane = lane;
      p.lane = lane;
      p.x = laneX(0, lane, 0);
      p.y = Math.max(p.y, 0.2);
      p.boostT = Math.max(p.boostT, 0.5);
      ev && ev.push({ t: 'merge', id: p.id });
    }
  }
}

function collide(p, track, ev) {
  const lo = p.y;
  const hi = p.y + (p.sliding ? 0.78 : 1.9);
  const list = track.near(p.z - 3, p.z + 3, p.path);
  for (const e of list) {
    if (p.taken.has(e.id)) continue;
    const zHit = p.z + C.PLAYER_LEN / 2 > e.z && p.z - C.PLAYER_LEN / 2 < e.z + e.len;

    if (e.kind === PICK.COIN) {
      const pull = p.magnetT > 0 ? C.MAGNET_RANGE : (e.w + C.PLAYER_W) / 2;
      const zPull = p.magnetT > 0 ? C.MAGNET_RANGE : C.PLAYER_LEN;
      if (Math.abs(p.x - e.x) < pull && Math.abs(p.z - e.z) < zPull && Math.abs(p.y - 0.9) < (p.magnetT > 0 ? 6 : 1.6)) {
        p.taken.add(e.id);
        p.coins++;
        ev && ev.push({ t: 'coin', id: p.id, e: e.id });
      }
      continue;
    }
    if (!zHit) continue;
    const xHit = Math.abs(p.x - e.x) < (e.w + C.PLAYER_W) / 2;
    if (!xHit) continue;

    if (e.kind === PICK.BOX) {
      p.taken.add(e.id);
      ev && ev.push({ t: 'box', id: p.id, e: e.id });
      continue;
    }
    // obstacles
    if (e.type === OB.RAMP) {
      if (p.grounded) { p.vy = C.RAMP_V; p.grounded = false; p.sliding = false; ev && ev.push({ t: 'ramp', id: p.id }); }
      continue;
    }
    if (e.type === OB.PAD) {
      if (p.grounded) { p.boostT = Math.max(p.boostT, C.PAD_BOOST_TIME); ev && ev.push({ t: 'pad', id: p.id }); }
      continue;
    }
    const vHit = hi > e.lo && lo < e.hi;
    if (!vHit) continue;
    p.taken.add(e.id);
    if (p.starT > 0 || p.rocketT > 0) {
      ev && ev.push({ t: 'smash', id: p.id, e: e.id });
      continue;
    }
    wipeout(p, ev, e.type, e.type === OB.BLOCK);
  }
}
