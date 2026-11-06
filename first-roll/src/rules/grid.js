// The battle grid: 5-foot squares, every square (diagonals too) costs 5 feet,
// and another creature's space counts as Difficult Terrain (double cost).

export const W = 8;
export const H = 10;
export const FT = 5;

export const key = (x, y) => `${x},${y}`;
export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const feetBetween = (a, b) => cheb(a, b) * FT;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

export const incap = (c) => c.hp <= 0;                 // Unconscious or dead
export const hostile = (a, b) => a.side !== b.side;
// Dead monsters leave the board; fallen heroes stay where they dropped.
export const onBoard = (c) => !(c.side === 'foe' && c.hp <= 0);

export function isWall(b, x, y) {
  return b.walls.includes(key(x, y));
}

export function occupantAt(b, x, y) {
  for (const id in b.creatures) {
    const c = b.creatures[id];
    if (onBoard(c) && c.x === x && c.y === y) return c;
  }
  return null;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Cheapest cost (in feet) to every square the mover can reach within budget.
// Hostile creatures block, unless they are Incapacitated; any other
// creature's space is Difficult Terrain.
export function reachMap(b, mover, budget) {
  const dist = new Map(), prev = new Map();
  const start = key(mover.x, mover.y);
  dist.set(start, 0);
  const open = [[0, mover.x, mover.y]];
  while (open.length) {
    open.sort((p, q) => p[0] - q[0]);
    const [d, x, y] = open.shift();
    if (d > dist.get(key(x, y))) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || isWall(b, nx, ny)) continue;
      const occ = occupantAt(b, nx, ny);
      if (occ && occ !== mover && hostile(occ, mover) && !incap(occ)) continue;
      const nd = d + (occ && occ !== mover ? 2 * FT : FT);
      if (nd > budget) continue;
      const k = key(nx, ny);
      if (!dist.has(k) || nd < dist.get(k)) {
        dist.set(k, nd);
        prev.set(k, key(x, y));
        open.push([nd, nx, ny]);
      }
    }
  }
  return { dist, prev };
}

export function canEndAt(b, mover, x, y) {
  if (!inBounds(x, y) || isWall(b, x, y)) return false;
  const o = occupantAt(b, x, y);
  return !o || o === mover;
}

export function pathFrom(map, mover, x, y) {
  const k0 = key(mover.x, mover.y);
  let k = key(x, y);
  if (!map.dist.has(k) || k === k0) return null;
  const path = [];
  while (k !== k0) {
    const [px, py] = k.split(',').map(Number);
    path.unshift({ x: px, y: py });
    k = map.prev.get(k);
  }
  return path;
}

export function neighbours(x, y) {
  return DIRS.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter((p) => inBounds(p.x, p.y));
}
