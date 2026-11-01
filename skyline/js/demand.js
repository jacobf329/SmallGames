// Skyline Hustle - demand curves and shop attributes shared by the citizen
// simulation (citizens.js), the analytic forecaster (sim.js) and the AI.

import { BUSINESSES, BIZ, FIT_LEVELS, YEAR_DAYS, SCENARIOS, techAt, eraDemand } from './data.js';

const inRange = (from, len, h) => ((h - from + 24) % 24) < len;
export function defaultHours(def) {
  const [a, z] = def.open;
  return { from: a, len: ((z - a + 24) % 24) || 24 };
}

// Natural demand per business type per hour. Strong inside the type's
// usual trading hours, a thin tail outside them (late-night coffee, early
// gym) so extending opening hours brings a few extra customers.
export const NAT = Object.fromEntries(BUSINESSES.map(def => {
  const { from, len } = defaultHours(def);
  const arr = [];
  for (let h = 0; h < 24; h++) {
    let v = 0.22;
    for (const p of def.peaks) {
      const d = Math.min(Math.abs(h - p), 24 - Math.abs(h - p));
      v += 0.8 * Math.exp(-(d * d) / (2 * 2.2 * 2.2));
    }
    v = Math.min(v, 1.15);
    if (!inRange(from, len, h)) v *= 0.16;
    arr.push(v);
  }
  return [def.id, arr];
}));

export const bizOpen = (b, h) => inRange(b.from, b.len, h);

export function yearOf(s) {
  return SCENARIOS[s.scenario].year + Math.floor((s.day - 1) / YEAR_DAYS);
}
const techCache = new Map();
export function techOf(s) {
  const y = yearOf(s);
  if (!techCache.has(y)) techCache.set(y, techAt(y));
  return techCache.get(y);
}

// Today's demand multiplier for a business type (weekday, events, era).
export function modFor(s, def) {
  const m = s.mods;
  return (m.all || 1) * (m[def.id] || 1) * (m[def.group] || 1) * eraDemand(def.id, yearOf(s));
}

export function capacity(b) {
  return b.staff * BIZ[b.type].cap * FIT_LEVELS[b.fit].cap;
}
export function appeal(b) {
  return FIT_LEVELS[b.fit].appeal * (b.rep ?? 1);
}
export const unitCost = def => def.ticket * def.stock;
