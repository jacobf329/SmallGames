// Deterministic procedural track. The server sends only a seed; every client
// rebuilds exactly the same obstacle course from it.

import {
  LANE_W, MAIN_LANES, SHORTCUT_LANES, CHUNK, RACE_DISTANCE, START_PAD,
  SHORTCUT_OFFSET, OB, PICK
} from './constants.js';
import { mulberry32, hash2, irange, range } from './rng.js';

export const laneX = (path, lane, side) =>
  path === 0
    ? (lane - (MAIN_LANES - 1) / 2) * LANE_W
    : side * SHORTCUT_OFFSET + (lane - (SHORTCUT_LANES - 1) / 2) * LANE_W;

export const laneCount = (path) => (path === 0 ? MAIN_LANES : SHORTCUT_LANES);

const OB_SPEC = {
  [OB.BARRIER]: { w: 2.1, len: 0.9, lo: 0.0, hi: 1.15, solid: true },
  [OB.HIGHBAR]: { w: 2.3, len: 0.8, lo: 1.25, hi: 3.4, solid: true },
  [OB.BLOCK]:   { w: 2.2, len: 14,  lo: 0.0, hi: 4.0, solid: true },
  [OB.CONE]:    { w: 1.0, len: 0.8, lo: 0.0, hi: 0.8, solid: true },
  [OB.RAMP]:    { w: 2.2, len: 4.0, lo: 0.0, hi: 0.6, solid: false },
  [OB.PAD]:     { w: 2.2, len: 5.0, lo: 0.0, hi: 0.05, solid: false }
};

export const obSpec = (type) => OB_SPEC[type];

export class Track {
  constructor(seed, length = RACE_DISTANCE) {
    this.seed = seed >>> 0;
    this.length = length;
    this.shortcuts = [];
    this.entities = [];
    this.chunks = [new Map(), new Map()];
    this._generate();
  }

  _add(e) {
    e.id = this.entities.length;
    const spec = e.kind === 'obstacle' ? OB_SPEC[e.type] : null;
    if (spec) {
      e.w = spec.w; e.len = spec.len ?? 1; e.lo = spec.lo; e.hi = spec.hi; e.solid = spec.solid;
      if (e.type === OB.BLOCK && e.blockLen) e.len = e.blockLen;
    } else {
      e.w = e.kind === PICK.COIN ? 1.0 : 1.6;
      e.len = e.kind === PICK.COIN ? 1.0 : 1.6;
      e.lo = 0.4; e.hi = e.kind === PICK.COIN ? 1.6 : 2.2;
    }
    e.x = laneX(e.path, e.lane, e.side || 0);
    this.entities.push(e);
    const c0 = Math.floor(e.z / CHUNK);
    const c1 = Math.floor((e.z + e.len) / CHUNK);
    for (let c = c0; c <= c1; c++) {
      const m = this.chunks[e.path];
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(e);
    }
    return e;
  }

  // Everything (both paths) inside a z window - used by the renderer.
  near(z0, z1, path = 0) {
    const out = [];
    const m = this.chunks[path];
    for (let c = Math.floor(z0 / CHUNK) - 1; c <= Math.floor(z1 / CHUNK); c++) {
      const list = m.get(c);
      if (!list) continue;
      for (const e of list) {
        if (e.z + e.len >= z0 && e.z <= z1 && !out.includes(e)) out.push(e);
      }
    }
    return out;
  }

  shortcutAt(z) {
    for (const s of this.shortcuts) if (z >= s.entryZ && z <= s.exitZ) return s;
    return null;
  }

  _generate() {
    const chunks = Math.ceil((this.length + 200) / CHUNK);
    let scEnd = -1;
    for (let i = 0; i < chunks; i++) {
      const z0 = i * CHUNK;
      const rng = mulberry32(hash2(this.seed, i * 2654435761));

      if (z0 < START_PAD) { this._coinRun(rng, z0 + 14, 0, irange(rng, 0, MAIN_LANES - 1), 0); continue; }
      if (z0 > this.length - 30) continue;   // clean approach to the finish line

      // Start a shortcut branch every few chunks, never overlapping another.
      if (i > 2 && i % 7 === 3 && z0 > scEnd && z0 < this.length - 220) {
        const side = rng() < 0.5 ? -1 : 1;
        const sc = {
          id: this.shortcuts.length,
          side,
          entryLane: side < 0 ? 0 : MAIN_LANES - 1,
          entryZ: z0 + 6,
          exitZ: z0 + CHUNK * 3 - 6
        };
        this.shortcuts.push(sc);
        scEnd = sc.exitZ + CHUNK;
        this._add({ kind: 'obstacle', type: OB.RAMP, path: 0, lane: sc.entryLane, z: sc.entryZ - 5, gate: sc.id });
        this._buildShortcut(sc);
      }

      this._mainChunk(rng, i, z0);
    }
    this.entities.sort((a, b) => a.z - b.z);
  }

  _mainChunk(rng, i, z0) {
    const difficulty = Math.min(1, z0 / (this.length * 0.75));
    const rows = irange(rng, 2, 3 + Math.round(difficulty));
    let z = z0 + range(rng, 3, 8);
    for (let r = 0; r < rows && z < z0 + CHUNK - 6; r++) {
      this._row(rng, z, 0, 0, MAIN_LANES, difficulty, false);
      z += range(rng, 11 - difficulty * 2.5, 17 - difficulty * 3);
    }
    // Coins and item boxes fill the gaps.
    if (rng() < 0.85) this._coinRun(rng, z0 + range(rng, 6, 24), 0, irange(rng, 0, MAIN_LANES - 1), 0);
    if (i % 2 === 0) this._boxRow(rng, z0 + range(rng, 10, 30), 0, 0, MAIN_LANES);
    if (rng() < 0.28) {
      this._add({ kind: 'obstacle', type: OB.PAD, path: 0, lane: irange(rng, 0, MAIN_LANES - 1), z: z0 + range(rng, 5, 32) });
    }
  }

  _buildShortcut(sc) {
    const span = sc.exitZ - sc.entryZ;
    const rows = Math.round(span / 7);
    for (let r = 0; r < rows; r++) {
      const z = sc.entryZ + 10 + r * (span - 16) / Math.max(1, rows - 1);
      const rng = mulberry32(hash2(this.seed ^ 0x5bf03635, sc.id * 977 + r));
      this._row(rng, z, 1, sc.side, SHORTCUT_LANES, 1, true);
      if (rng() < 0.5) this._coinRun(rng, z + 3, 1, irange(rng, 0, SHORTCUT_LANES - 1), sc.side, 4);
    }
    // Reward for surviving it.
    this._boxRow(mulberry32(hash2(this.seed, sc.id * 31)), sc.exitZ - 14, 1, sc.side, SHORTCUT_LANES);
    this._add({ kind: 'obstacle', type: OB.PAD, path: 1, lane: 1, z: sc.exitZ - 8, side: sc.side });
  }

  // One row of obstacles. Always leaves at least one clear lane.
  _row(rng, z, path, side, lanes, difficulty, dense) {
    const maxBlocked = Math.min(lanes - 1, dense ? lanes - 1 : 1 + Math.round(difficulty * 2));
    const blocked = irange(rng, dense ? Math.max(1, lanes - 2) : 1, maxBlocked);
    const order = [];
    for (let l = 0; l < lanes; l++) order.push(l);
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    for (let b = 0; b < blocked; b++) {
      const lane = order[b];
      const roll = rng();
      let type = OB.BARRIER;
      if (roll < 0.3) type = OB.BARRIER;
      else if (roll < 0.55) type = OB.HIGHBAR;
      else if (roll < 0.8) type = OB.CONE;
      else type = OB.BLOCK;
      const e = { kind: 'obstacle', type, path, lane, z, side };
      if (type === OB.BLOCK) e.blockLen = range(rng, 9, 20);
      this._add(e);
    }
  }

  _coinRun(rng, z, path, lane, side, count = irange(rng, 5, 9)) {
    for (let c = 0; c < count; c++) {
      this._add({ kind: PICK.COIN, path, lane, z: z + c * 2.2, side });
    }
  }

  _boxRow(rng, z, path, side, lanes) {
    const wide = rng() < 0.45;
    if (wide) {
      for (let l = 0; l < lanes; l += lanes > 3 ? 2 : 1) {
        this._add({ kind: PICK.BOX, path, lane: l, z, side });
      }
    } else {
      this._add({ kind: PICK.BOX, path, lane: irange(rng, 0, lanes - 1), z, side });
    }
  }
}
