// Skyline Hustle - demand curves and shop attributes shared by the citizen
// simulation (citizens.js), the analytic forecaster (sim.js) and the AI.

import { BUSINESSES, BIZ, FIT_LEVELS, YEAR_DAYS, SCENARIOS, DISTRICTS, PARKS, MAX_STARS, techAt, eraDemand } from './data.js';
import { teamPower, serviceFactor, floorCap } from './staff.js';

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

// Customers an hour the shop can serve: its team, its floors, its fit-out.
export function capacity(b) {
  return teamPower(b) * BIZ[b.type].cap * FIT_LEVELS[b.fit].cap * floorCap(b.floors);
}
// How attractive the shop is before price and distance.
export function appeal(b) {
  return FIT_LEVELS[b.fit].appeal * (b.rep ?? 1) * serviceFactor(b) * (b.promo ? b.promo.boost : 1);
}

// Block appeal in stars: wealthier districts start higher, parks add more.
export function blockStars(s, d) {
  if (d < 0) return 0;
  const mix = DISTRICTS[d].mix;
  let st = 0.4 + 2.2 * mix[2] + 0.8 * mix[1];
  for (const p of s.parks || []) if (p.d === d) st += PARKS.find(x => x.id === p.type).stars;
  return Math.min(MAX_STARS, Math.round(st * 4) / 4);
}
// How much each wealth group cares about a block's stars.
export const STAR_TASTE = [0.02, 0.06, 0.13, 0.1];
export const starFactor = (stars, seg) => 1 + STAR_TASTE[seg] * stars;
export const unitCost = def => def.ticket * def.stock;
