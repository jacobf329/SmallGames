// Blockout Arena - movement and shooting, shared by the host (which decides
// everything) and each phone (which predicts its own runner so moving and
// looking feel instant). No DOM.
//
// Facing: yaw 0 looks toward -z (like a three.js camera); yaw grows turning
// left. Pitch is up/down, positive looks up.

import {
  GRAVITY, JUMP_V, RUN_SPEED, ACCEL, AIR_ACCEL, FRICTION, STEP_UP, RADIUS, EYE, MAX_HP,
  SPREAD, MOVE_SPREAD, RANGE, BODY_R, BODY_Y, HEAD_R, HEAD_Y, MAG,
} from './consts.js';
import { topAt, cellTop, rayWall, WORLD_W, WORLD_H } from './map.js';
import { CELL } from './consts.js';

export function createPlayer(id, name, color, bot = false) {
  return {
    id, name, color, bot,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, grounded: true,
    hp: MAX_HP, alive: false, respawnT: 0, shieldT: 0, hurtT: 0,
    ammo: MAG, reloadT: 0, fireT: 0,
    kills: 0, deaths: 0,
    input: { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, fire: false, reload: false, seq: 0 },
  };
}

export function placeAt(p, sp) {
  p.x = sp.x; p.z = sp.z; p.y = groundUnder(sp.x, sp.z, 10);
  p.vx = p.vy = p.vz = 0;
  p.yaw = sp.yaw; p.pitch = 0;
  p.input.yaw = sp.yaw; p.input.pitch = 0;
  p.grounded = true;
}

// Highest floor under the player's footprint that they can stand on from y.
function groundUnder(x, z, y) {
  const r = RADIUS * 0.7;
  let g = 0;
  for (const [ox, oz] of [[0, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
    const t = topAt(x + ox, z + oz);
    if (t <= y + STEP_UP + 1e-3 && t > g) g = t;
  }
  return g;
}

// Push the player's circle out of any block taller than a step.
function collide(p) {
  const minX = Math.floor((p.x - RADIUS) / CELL), maxX = Math.floor((p.x + RADIUS) / CELL);
  const minZ = Math.floor((p.z - RADIUS) / CELL), maxZ = Math.floor((p.z + RADIUS) / CELL);
  for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (cellTop(cx, cz) <= p.y + STEP_UP) continue;
      const x0 = cx * CELL, x1 = x0 + CELL, z0 = cz * CELL, z1 = z0 + CELL;
      const nx = Math.max(x0, Math.min(p.x, x1)), nz = Math.max(z0, Math.min(p.z, z1));
      let dx = p.x - nx, dz = p.z - nz;
      const d = Math.hypot(dx, dz);
      if (d >= RADIUS) continue;
      if (d > 1e-6) {
        const push = RADIUS - d;
        p.x += (dx / d) * push; p.z += (dz / d) * push;
        // Stop moving into the wall.
        const vn = (p.vx * dx + p.vz * dz) / d;
        if (vn < 0) { p.vx -= vn * dx / d; p.vz -= vn * dz / d; }
      } else {
        // Centre inside the block: leave by the nearest side.
        const out = [[x0 - RADIUS - p.x, 0], [x1 + RADIUS - p.x, 0], [0, z0 - RADIUS - p.z], [0, z1 + RADIUS - p.z]]
          .sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
        p.x += out[0]; p.z += out[1];
      }
    }
  }
  p.x = Math.max(RADIUS, Math.min(WORLD_W - RADIUS, p.x));
  p.z = Math.max(RADIUS, Math.min(WORLD_H - RADIUS, p.z));
}

// One fixed step of movement from the player's current input.
export function stepPlayer(p, dt) {
  const inp = p.input;
  p.yaw = inp.yaw;
  p.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
  if (!p.alive) { p.vx = p.vz = 0; return; }

  // Wanted direction on the ground, from the stick and where you face.
  const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
  let mx = inp.mx, mz = inp.mz;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const wx = -s * mz + c * mx, wz = -c * mz - s * mx;      // forward + right
  const want = Math.min(1, Math.hypot(mx, mz)) * RUN_SPEED;
  const tx = wx * RUN_SPEED, tz = wz * RUN_SPEED;
  const acc = (p.grounded ? ACCEL : AIR_ACCEL) * dt;
  if (want > 0.01 || !p.grounded) {
    const dvx = tx - p.vx, dvz = tz - p.vz, dv = Math.hypot(dvx, dvz);
    if (want > 0.01 && dv > 0) { const k = Math.min(1, acc / dv); p.vx += dvx * k; p.vz += dvz * k; }
  }
  if (p.grounded && want <= 0.01) {
    const sp = Math.hypot(p.vx, p.vz), drop = FRICTION * dt * Math.max(sp, 2);
    const k = sp > 0 ? Math.max(0, sp - drop) / sp : 0;
    p.vx *= k; p.vz *= k;
  }

  if (inp.jump) {
    inp.jump = false;
    if (p.grounded) { p.vy = JUMP_V; p.grounded = false; }
  }

  p.x += p.vx * dt; collide(p);
  p.z += p.vz * dt; collide(p);

  p.vy -= GRAVITY * dt;
  p.y += p.vy * dt;
  const g = groundUnder(p.x, p.z, p.y);
  if (p.y <= g) {
    p.y = g; p.vy = 0; p.grounded = true;
  } else if (p.grounded && p.y - g < STEP_UP && p.vy <= 0) {
    p.y = g; p.vy = 0;                                  // walk down steps without hopping
  } else {
    p.grounded = false;
  }
}

export const eye = p => ({ x: p.x, y: p.y + EYE, z: p.z });
export function aimDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}
export const moving = p => Math.hypot(p.vx, p.vz) > 1.5 || !p.grounded;

// Ray against a sphere: distance along the ray, or Infinity.
function raySphere(o, d, cx, cy, cz, r) {
  const lx = cx - o.x, ly = cy - o.y, lz = cz - o.z;
  const tca = lx * d.x + ly * d.y + lz * d.z;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

// One shot from p: spread, walls, then the nearest body or head in the way.
// rand() supplies the spread. Returns where it ended and who it hit.
export function traceShot(p, players, rand) {
  const o = eye(p);
  const sp = moving(p) ? MOVE_SPREAD : SPREAD;
  const yaw = p.yaw + (rand() - 0.5) * 2 * sp, pitch = p.pitch + (rand() - 0.5) * 2 * sp;
  const d = aimDir(yaw, pitch);
  let best = rayWall(o.x, o.y, o.z, d.x, d.y, d.z, RANGE), who = null, head = false;
  for (const q of players) {
    if (q === p || !q.alive) continue;
    const th = raySphere(o, d, q.x, q.y + HEAD_Y, q.z, HEAD_R);
    if (th < best) { best = th; who = q; head = true; }
    const tb = raySphere(o, d, q.x, q.y + BODY_Y, q.z, BODY_R);
    if (tb < best) { best = tb; who = q; head = false; }
  }
  return { who, head, ex: o.x + d.x * best, ey: o.y + d.y * best, ez: o.z + d.z * best, dist: best };
}

// Can a see b (eye to body)?
export function canSee(a, b) {
  const o = eye(a), tx = b.x - o.x, ty = b.y + BODY_Y - o.y, tz = b.z - o.z;
  const dist = Math.hypot(tx, ty, tz);
  return rayWall(o.x, o.y, o.z, tx / dist, ty / dist, tz / dist, dist) >= dist - 0.3;
}
