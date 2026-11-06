// Seeded RNG (mulberry32). The state is a plain object so a battle, rng
// included, can be saved as JSON and resumed exactly.

export function makeRng(seed) {
  return { s: (seed >>> 0) || 1 };
}

export function next(r) {
  let t = (r.s = (r.s + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// r.script, when set, supplies the next die results in order: tests use it to
// force exact rolls (and it is the hook for "use my own dice").
export function die(r, sides) {
  if (r.script?.length) return r.script.shift();
  return 1 + Math.floor(next(r) * sides);
}

export function rollDice(r, n, sides) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(die(r, sides));
  return out;
}

export const sum = (a) => a.reduce((s, v) => s + v, 0);

// "1d8" / "2d6" -> { n, sides }
export function parseDice(expr) {
  const m = /^(\d+)d(\d+)$/.exec(String(expr).trim());
  if (!m) throw new Error(`Bad dice: ${expr}`);
  return { n: +m[1], sides: +m[2] };
}

export const avgDice = (expr) => {
  const { n, sides } = parseDice(expr);
  return n * (sides + 1) / 2;
};
