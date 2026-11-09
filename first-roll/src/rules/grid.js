// The battle grid: 5-foot squares, every square (diagonals too) costs 5 feet,
// and another creature's space counts as Difficult Terrain (double cost).

export const W = 8;
export const H = 10;
export const FT = 5;

export const key = (x, y) => `${x},${y}`;
export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const feetBetween = (a, b) => cheb(a, b) * FT;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

// Conditions live on the creature: c.conds = [{ id, by, ... }].
export const hasCond = (c, id) => !!c.conds?.some((x) => x.id === id);
export const condOf = (c, id) => c.conds?.find((x) => x.id === id) || null;
// At 0 Hit Points (Unconscious, dying or dead).
export const down = (c) => c.hp <= 0;
// Can't take actions or reactions: at 0 HP, or Paralyzed, Incapacitated, Unconscious.
export const incap = (c) => c.hp <= 0 || !!c.conds?.some((x) => x.id === 'paralyzed' || x.id === 'incapacitated' || x.id === 'unconscious' || x.id === 'stunned');
// Automatically fails Strength and Dexterity saves; hits from within 5 ft are Critical Hits.
export const helpless = (c) => c.hp <= 0 || hasCond(c, 'paralyzed') || hasCond(c, 'unconscious');
export const hostile = (a, b) => a.side !== b.side;
// Dead monsters leave the board; fallen heroes stay where they dropped.
export const onBoard = (c) => !(c.side === 'foe' && c.hp <= 0);

export function isWall(b, x, y) {
  return b.walls.includes(key(x, y));
}
// Low walls, crates, rubble: block movement, not sight. Give Half Cover.
export function isCover(b, x, y) {
  return !!b.cover?.includes(key(x, y));
}
export const blocked = (b, x, y) => isWall(b, x, y) || isCover(b, x, y);

export function occupantAt(b, x, y) {
  for (const id in b.creatures) {
    const c = b.creatures[id];
    if (onBoard(c) && c.x === x && c.y === y) return c;
  }
  return null;
}

const SIZES = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4 };
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
      if (!inBounds(nx, ny) || blocked(b, nx, ny)) continue;
      const occ = occupantAt(b, nx, ny);
      // Hostile creatures block, unless Incapacitated; a halfling (Halfling
      // Nimbleness) can move through a creature a size larger.
      if (occ && occ !== mover && hostile(occ, mover) && !incap(occ) && !(mover.nimbleness && SIZES[occ.size || 'medium'] > SIZES[mover.size || 'medium'])) continue;
      const nd = d + ((occ && occ !== mover) || spellTerrain(b, mover, nx, ny) ? 2 * FT : FT);
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

// Difficult Terrain from a spell zone (Spirit Guardians for the caster's
// enemies, Sleet Storm for everyone): each square of it costs double.
export function spellTerrain(b, mover, x, y) {
  for (const e of b.effects || []) {
    if (e.type !== 'zone' || !e.difficult) continue;
    const c = e.follow ? b.creatures[e.follow] : e;
    if (!c || c === mover || (e.follow && (c.dead || (c.x === x && c.y === y)))) continue;
    if (e.foesOnly && !hostile(b.creatures[e.by], mover)) continue;
    if (cheb(c, { x, y }) <= e.r) return true;
  }
  return false;
}

export function canEndAt(b, mover, x, y) {
  if (!inBounds(x, y) || blocked(b, x, y)) return false;
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

// A Cone from `origin` toward `toward`, `size` squares long (15 ft = 3). Its
// width at any distance equals that distance, so a square is in the Cone if
// it is within reach and less than ~26.6 degrees off the aim line.
export function coneSquares(origin, toward, size = 3) {
  const dx = toward.x - origin.x, dy = toward.y - origin.y;
  const dl = Math.hypot(dx, dy);
  if (!dl) return [];
  const out = [];
  for (let y = origin.y - size; y <= origin.y + size; y++) {
    for (let x = origin.x - size; x <= origin.x + size; x++) {
      if (!inBounds(x, y) || (x === origin.x && y === origin.y)) continue;
      const vx = x - origin.x, vy = y - origin.y;
      const vl = Math.hypot(vx, vy);
      if (vl > size + 0.25) continue;
      if ((vx * dx + vy * dy) / (vl * dl) >= 0.89) out.push({ x, y });
    }
  }
  return out;
}

// The squares a straight line from the centre of a to the centre of b passes
// through, not counting a and b. Where it passes exactly through a corner,
// the two squares beside the corner come as one { pair } entry.
export function lineCells(a, b) {
  const out = [];
  const dx = b.x - a.x, dy = b.y - a.y;
  const nx = Math.abs(dx), ny = Math.abs(dy);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  let x = a.x, y = a.y, ix = 0, iy = 0;
  while (ix < nx || iy < ny) {
    const tx = nx ? (0.5 + ix) / nx : Infinity;
    const ty = ny ? (0.5 + iy) / ny : Infinity;
    if (Math.abs(tx - ty) < 1e-9) {
      out.push({ pair: [{ x: x + sx, y }, { x, y: y + sy }] });
      x += sx; y += sy; ix++; iy++;
    } else if (tx < ty) { x += sx; ix++; } else { y += sy; iy++; }
    out.push({ x, y });
  }
  out.pop();
  return out.filter((c) => c.pair || !(c.x === a.x && c.y === a.y));
}

// Can a see b? Walls give Total Cover: no line of sight at all.
export function lineOfSight(b, from, to) {
  for (const c of lineCells(from, to)) {
    if (c.pair) { if (c.pair.every((p) => isWall(b, p.x, p.y))) return false; }
    else if (isWall(b, c.x, c.y)) return false;
  }
  return true;
}

// Half Cover between from and to: a low wall or another creature in the way.
// Returns what gives it, or null.
export function coverBetween(b, from, to, ignore = []) {
  const skip = new Set([from.id, to.id, ...ignore]);
  for (const c of lineCells(from, to)) {
    const cells = c.pair ? c.pair : [c];
    const all = c.pair ? 'every' : 'some';
    if (cells[all]((p) => isCover(b, p.x, p.y))) return { what: 'a low wall' };
    if (c.pair) continue;
    for (const p of cells) {
      const o = occupantAt(b, p.x, p.y);
      if (o && !skip.has(o.id) && !(o.side === 'foe' && o.hp <= 0)) return { what: o.name, id: o.id };
    }
  }
  return null;
}

// A 15-foot Cube that starts at the caster's square and goes one way: the
// 3 x 3 block of squares beside the caster in direction (dx, dy).
export function cubeSquares(origin, dir, size = 3) {
  const dx = Math.sign(dir.x - origin.x), dy = Math.sign(dir.y - origin.y);
  if (!dx && !dy) return [];
  const out = [];
  const half = Math.floor(size / 2);
  for (let i = 1; i <= size; i++) {
    for (let j = -half; j <= half; j++) {
      let x, y;
      if (dx && dy) { x = origin.x + dx * i; y = origin.y + dy * (j + half + 1); }
      else if (dx) { x = origin.x + dx * i; y = origin.y + j; }
      else { x = origin.x + j; y = origin.y + dy * i; }
      if (inBounds(x, y)) out.push({ x, y });
    }
  }
  return out;
}

// A Line from origin toward a square, `len` squares long and one square
// wide: every square the line's centre passes through.
export function lineSquares(origin, toward, len) {
  const dx = toward.x - origin.x, dy = toward.y - origin.y;
  const dl = Math.hypot(dx, dy);
  if (!dl) return [];
  const out = [];
  const seen = new Set([key(origin.x, origin.y)]);
  for (let t = 0.5; t <= len + 0.01; t += 0.05) {
    const x = Math.floor(origin.x + 0.5 + (dx / dl) * t), y = Math.floor(origin.y + 0.5 + (dy / dl) * t);
    const k = key(x, y);
    if (!seen.has(k) && inBounds(x, y)) { seen.add(k); out.push({ x, y }); }
  }
  return out;
}

// Squares within r squares of p (a Sphere around a point, or an Emanation).
export function squaresWithin(p, r) {
  const out = [];
  for (let y = p.y - r; y <= p.y + r; y++) for (let x = p.x - r; x <= p.x + r; x++) if (inBounds(x, y)) out.push({ x, y });
  return out;
}

// An n-square Cube placed on a point: the point is its centre square (or the
// square just up-left of centre when n is even).
export function cubeAt(p, n) {
  const lo = Math.floor((n - 1) / 2);
  const out = [];
  for (let y = p.y - lo; y < p.y - lo + n; y++) for (let x = p.x - lo; x < p.x - lo + n; x++) if (inBounds(x, y)) out.push({ x, y });
  return out;
}
