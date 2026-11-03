// Blockout Arena - the arena. One quarter is drawn below and mirrored four
// ways, so every spawn is equally fair. Each character is a 2 m cell:
//
//   #  wall (4 m)        H  pillar (3 m)
//   B  crate (1 m)       b  half crate (0.5 m: walk straight up it)
//   P  centre platform (1.5 m, reached by stepping b -> B -> P)
//   S  spawn point       .  floor

import { CELL } from './consts.js';

const QUARTER = [
  '############',
  '#S..........',
  '#.BB....b...',
  '#.B....H....',
  '#...........',
  '#..b..###...',
  '#.....#.....',
  '#.H...#.....',
  '#.......bbbb',
  '##....H.bBBB',
  '#S......bBPP',
  '#.......bBPP',
];
const TOPS = { '#': 4, H: 3, B: 1, b: 0.5, P: 1.5 };

const rows = QUARTER.map(r => r + [...r].reverse().join(''));
const ROWS = rows.concat([...rows].reverse());

export const MAP_W = ROWS[0].length;
export const MAP_H = ROWS.length;
export const WORLD_W = MAP_W * CELL;
export const WORLD_H = MAP_H * CELL;
export const TOP = new Float32Array(MAP_W * MAP_H);
export const SPAWNS = [];

for (let z = 0; z < MAP_H; z++) {
  for (let x = 0; x < MAP_W; x++) {
    const ch = ROWS[z][x];
    TOP[z * MAP_W + x] = TOPS[ch] || 0;
    if (ch === 'S') {
      const wx = (x + 0.5) * CELL, wz = (z + 0.5) * CELL;
      // Face the middle of the arena.
      SPAWNS.push({ x: wx, z: wz, yaw: Math.atan2(-(WORLD_W / 2 - wx), -(WORLD_H / 2 - wz)) });
    }
  }
}

// Height of the top of the cell at world (x, z); outside the map is wall.
export function topAt(x, z) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  if (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H) return 99;
  return TOP[cz * MAP_W + cx];
}
export const cellTop = (cx, cz) => (cx < 0 || cz < 0 || cx >= MAP_W || cz >= MAP_H ? 99 : TOP[cz * MAP_W + cx]);

// Every block to draw: { x, z, top } per cell with height.
export function blocks() {
  const out = [];
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const top = TOP[z * MAP_W + x];
    if (top > 0) out.push({ cx: x, cz: z, top });
  }
  return out;
}

// Open floor cells, for bots to wander between.
export const OPEN = [];
for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) if (TOP[z * MAP_W + x] <= 1.5 && ROWS[z][x] !== '#') OPEN.push({ x: (x + 0.5) * CELL, z: (z + 0.5) * CELL });

// Distance along a ray (from a point, unit direction) to the first wall or
// floor, up to max. Marches in 10 cm steps: plenty for a 2 m grid.
export function rayWall(ox, oy, oz, dx, dy, dz, max) {
  const step = 0.1;
  for (let t = 0; t < max; t += step) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (y <= 0) return t;
    if (y < topAt(x, z)) return t;
  }
  return max;
}
