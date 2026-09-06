// Deterministic RNG so every device generates a byte-identical track.

export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(a, b) {
  let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x9E3779B1);
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
  return (h ^ (h >>> 16)) >>> 0;
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const range = (rng, lo, hi) => lo + rng() * (hi - lo);
export const irange = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
