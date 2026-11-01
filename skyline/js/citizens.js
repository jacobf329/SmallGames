// Skyline Hustle - individual citizens.
//
// Every citizen is a small group of people (PEOPLE_PER_CITIZEN) with a
// home tile, a wealth segment, personal price sensitivity and seven needs
// (food, groceries, health, fitness, fun, shopping, a bed). Needs fill up
// over the day following each business type's natural rhythm. When one
// passes the citizen's own threshold they decide where to go: they pick the
// kind of place they fancy, then weigh every open shop they can walk to by
// distance, price, fit-out, reputation, their favourite and any grudge.
// Shops serve them while they have staff capacity and stock; anyone turned
// away holds a grudge for two days and tries again later.
//
// Sales in the city come from these visits. Each visit also produces a
// trip that the renderer animates: the people walking the streets are the
// real customers going to real shops.

import {
  DISTRICTS, NEEDS, BUSINESSES, BIZ, SEG_ELASTICITY, PEOPLE_PER_CITIZEN, WALK_RANGE, DISTANCE_FALLOFF,
  OUTSIDE_WEIGHT, DEMAND_SCALE, APT_RESIDENTS, FIRST_NAMES, LAST_NAMES, bizName,
} from './data.js';
import { MAP, rand, tileDist, BLOCK_TILES, STATION_TILES } from './map.js';
import { NAT, bizOpen, modFor, capacity, appeal, techOf, yearOf } from './demand.js';

const K = PEOPLE_PER_CITIZEN;
const NEED_IDX = Object.fromEntries(NEEDS.map((n, i) => [n.id, i]));
const TYPES_BY_NEED = NEEDS.map(n => BUSINESSES.filter(b => b.need === n.id).map(b => b.id));

export function citizenName(c) {
  return `${FIRST_NAMES[(c.id * 7) % FIRST_NAMES.length]} ${LAST_NAMES[(c.id * 13 + 5) % LAST_NAMES.length]}`;
}

// ------------------------------------------------------- population ----
export function buildCitizens(s) {
  s.cz = { list: [], trips: [], seq: 0, ratesKey: '', rates: null, visitsToday: 0 };
  syncResidents(s);
  syncTourists(s);
}

function makeCitizen(s, seg, d, hx, hy, lot, tourist) {
  return {
    id: ++s.cz.seq, seg, d, hx, hy, lot, tourist,
    needs: NEEDS.map(() => rand(s) * 0.9),
    th: 0.75 + rand(s) * 0.5,
    sens: 0.7 + rand(s) * 0.6,
    fav: -1, grudge: {}, thought: '', busyUntil: 0, visits: 0,
  };
}

function pickSeg(s, mix) {
  const r = rand(s);
  return r < mix[0] ? 0 : r < mix[0] + mix[1] ? 1 : 2;
}

// Keep one citizen per K residents: base population spread over each
// district's block, apartment residents living on their lot.
export function syncResidents(s) {
  const cz = s.cz;
  const groups = new Map();
  for (const c of cz.list) if (!c.tourist) {
    const key = c.lot >= 0 ? 'l' + c.lot : 'd' + c.d;
    (groups.get(key) || groups.set(key, []).get(key)).push(c);
  }
  const want = new Map();
  DISTRICTS.forEach((D, d) => {
    want.set('d' + d, { n: Math.round(D.pop / K), d, lot: -1 });
    for (const id of MAP.districtLots[d]) {
      const l = s.lots[id];
      if (l.apt) want.set('l' + id, { n: Math.round(APT_RESIDENTS[l.apt] / K), d, lot: id });
    }
  });
  const keep = [];
  for (const [key, w] of want) {
    const have = groups.get(key) || [];
    keep.push(...have.slice(0, w.n));
    const blk = MAP.distBlock[w.d];
    for (let i = have.length; i < w.n; i++) {
      let hx, hy;
      if (w.lot >= 0) { hx = s.lots[w.lot].tx; hy = s.lots[w.lot].ty; }
      else { [hx, hy] = BLOCK_TILES[blk.id][Math.floor(rand(s) * 4)]; }
      keep.push(makeCitizen(s, pickSeg(s, DISTRICTS[w.d].mix), w.d, hx, hy, w.lot, false));
    }
  }
  cz.list = keep.concat(cz.list.filter(c => c.tourist));
}

export function touristsIn(s, d) {
  let t = MAP.tourists[d] * s.touristMult;
  for (const e of s.events) if (e.district === d && e.tourists) t += e.tourists;
  return t;
}

// Visitor numbers follow events each morning: extra visitors arrive or
// some go home; the rest stay (their needs carry over).
export function syncTourists(s) {
  const cz = s.cz;
  const byD = DISTRICTS.map(() => []);
  for (const c of cz.list) if (c.tourist) byD[c.d].push(c);
  const keep = cz.list.filter(c => !c.tourist);
  DISTRICTS.forEach((_, d) => {
    const n = Math.round(touristsIn(s, d) / K);
    const have = byD[d];
    // A few visitors leave every day and new ones arrive.
    for (let i = have.length - 1; i >= 0; i--) if (rand(s) < 0.15) have.splice(i, 1);
    keep.push(...have.slice(0, n));
    const blk = MAP.distBlock[d];
    const near = STATION_TILES.filter(([x, y]) => Math.abs(x - blk.bx) <= 4 && Math.abs(y - blk.by) <= 4);
    for (let i = have.length; i < n; i++) {
      const [hx, hy] = near.length ? near[Math.floor(rand(s) * near.length)] : BLOCK_TILES[blk.id][Math.floor(rand(s) * 4)];
      keep.push(makeCitizen(s, 3, d, hx, hy, -1, true));
    }
  });
  cz.list = keep;
}

// --------------------------------------------------------- rates ----
// rate[h][seg][type] = visits per citizen per hour if every shop existed.
function rates(s) {
  const key = `${s.day}`;
  const cz = s.cz;
  if (cz.ratesKey === key) return cz.rates;
  const tech = techOf(s);
  const type = [], need = [];
  for (let h = 0; h < 24; h++) {
    type.push([]); need.push([]);
    for (let seg = 0; seg < 4; seg++) {
      const tr = {}, nr = new Float64Array(NEEDS.length);
      for (const def of BUSINESSES) {
        const r = tech.biz.has(def.id) ? def.app[seg] / 1000 * DEMAND_SCALE * NAT[def.id][h] * modFor(s, def) : 0;
        tr[def.id] = r;
        nr[NEED_IDX[def.need]] += r;
      }
      type[h].push(tr); need[h].push(nr);
    }
  }
  cz.rates = { type, need };
  cz.ratesKey = key;
  return cz.rates;
}

// ------------------------------------------------------------ chatter ----
// What locals grumble about, per district: reason|type -> people.
function grumble(s, d, reason, type, c) {
  const ch = s.chatter[d];
  const k = `${reason}|${type}`;
  ch[k] = (ch[k] || 0) + K;
  c.thought = thoughtText(s, reason, type);
}
export function thoughtText(s, reason, type) {
  const n = bizName(BIZ[type], yearOf(s));
  return ({
    none: `I wish there was a ${n} near here.`,
    closed: `Every ${n} round here is shut right now.`,
    pricey: `The ${n} prices here are a rip-off.`,
    queue: `Queue out the door at the ${n}. Gave up.`,
    stockout: `The ${n} had sold out!`,
    happy: `Lovely ${n}. I'll be back.`,
  })[reason];
}
export const CHATTER_ICON = { none: '🤷', closed: '🔒', pricey: '💸', queue: '⏳', stockout: '📦', happy: '😊' };

// ------------------------------------------------------------- hour ----
// Runs one hour of citizen decisions. Returns Map lotId -> { cust, turned }.
export function citizensHour(s, h) {
  const cz = s.cz;
  const R = rates(s);
  const day = s.day;
  const now = day * 24 + h;
  const shops = NEEDS.map(() => []);
  const allShops = NEEDS.map(() => []);
  for (const l of s.lots) {
    const b = l.business;
    if (!b) continue;
    const def = BIZ[b.type];
    const ni = NEED_IDX[def.need];
    const entry = { l, b, def, a: appeal(b), queue: [] };
    allShops[ni].push(entry);
    if (bizOpen(b, h)) shops[ni].push(entry);
  }

  for (const c of cz.list) {
    const nr = R.need[h][c.seg];
    let bi = -1, bv = 0;
    for (let i = 0; i < nr.length; i++) {
      c.needs[i] += nr[i];
      const v = c.needs[i] / c.th;
      if (v > bv) { bv = v; bi = i; }
    }
    if (bv < 1 || c.busyUntil > now) continue;

    // Which kind of place do they fancy?
    const types = TYPES_BY_NEED[bi];
    const tr = R.type[h][c.seg];
    let tot = 0;
    for (const t of types) tot += tr[t];
    if (tot <= 0) { c.needs[bi] = 0; continue; }
    let r = rand(s) * tot, want = types[0];
    for (const t of types) { r -= tr[t]; if (r <= 0) { want = t; break; } }

    const el = SEG_ELASTICITY[c.seg] * c.sens;
    let sum = 0, best = null, bestW = 0;
    const cand = [];
    for (const sh of shops[bi]) {
      const dist = tileDist(c.hx, c.hy, sh.l.tx, sh.l.ty);
      if (dist > WALK_RANGE) continue;
      let w = (sh.def.id === want ? 1 : 0.35) * sh.a * Math.pow(1 / sh.b.price, el) * Math.min(1, Math.exp(-(dist - 2) / DISTANCE_FALLOFF));
      if (c.fav === sh.l.id) w *= 1.5;
      if ((c.grudge[sh.l.id] || 0) > day) w *= 0.4;
      cand.push([sh, w, dist]);
      sum += w;
      if (w > bestW) { bestW = w; best = sh; }
    }
    const out = OUTSIDE_WEIGHT * (bv > 2.2 ? 0.3 : 1);
    r = rand(s) * (out + sum);
    if (r < out || !cand.length) {
      // Stayed home. Why?
      if (!cand.length) {
        const shut = allShops[bi].some(sh => sh.def.id === want && tileDist(c.hx, c.hy, sh.l.tx, sh.l.ty) <= WALK_RANGE);
        grumble(s, c.d, shut ? 'closed' : 'none', want, c);
        if (shut && bv < 3) continue;           // wait for opening time
      } else if (best && best.b.price > 1.15) grumble(s, c.d, 'pricey', best.def.id, c);
      c.needs[bi] = 0;
      continue;
    }
    r -= out;
    let pickd = cand[0];
    for (const x of cand) { r -= x[1]; if (r <= 0) { pickd = x; break; } }
    pickd[0].queue.push({ c, ni: bi, dist: pickd[2] });
  }

  // Serve the queues: staff capacity and stock decide who gets in.
  const res = new Map();
  for (const list of shops) for (const sh of list) {
    if (!sh.queue.length) continue;
    const q = sh.queue;
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    let capLeft = capacity(sh.b);
    let cust = 0, turned = 0;
    for (const { c, ni, dist } of q) {
      const n = Math.min(K, capLeft, sh.b.stock);
      let ok = n >= K * 0.5;
      if (ok) {
        cust += n; capLeft -= n; sh.b.stock -= n;
        c.needs[ni] = 0;
        c.visits++;
        if (rand(s) < 0.25) c.fav = sh.l.id;
        if (c.fav === sh.l.id && rand(s) < 0.3) c.thought = thoughtText(s, 'happy', sh.def.id);
      } else {
        turned += K;
        const queue = capLeft < K * 0.5;
        // A sold-out shop is remembered for two days; a queue only today.
        c.grudge[sh.l.id] = queue ? day + 1 : day + 2;
        grumble(s, c.d, queue ? 'queue' : 'stockout', sh.def.id, c);
      }
      c.busyUntil = now + 1;
      // Animate the trip during the next hour of play.
      const walk = 0.04 * (dist + 1);
      cz.trips.push({ cid: c.id, seg: c.seg, hx: c.hx, hy: c.hy, tx: sh.l.tx, ty: sh.l.ty,
        t0: now + 1 + rand(s) * 0.6, walk, stay: 0.15 + rand(s) * 0.2, ok });
    }
    res.set(sh.l.id, { cust, turned });
    cz.visitsToday += q.length;
  }
  // Some people just go for a walk: to a plaza on their block, or the park.
  const daylight = h >= 8 && h < 20 ? 1 : h >= 6 && h < 23 ? 0.4 : 0.05;
  const strolls = Math.round(cz.list.length * 0.012 * daylight);
  for (let i = 0; i < strolls; i++) {
    const c = cz.list[Math.floor(rand(s) * cz.list.length)];
    if (c.busyUntil > now) continue;
    const blk = rand(s) < 0.35 ? MAP.blocks.find(b => b.kind === 'park') : MAP.distBlock[c.d];
    const [tx, ty] = BLOCK_TILES[blk.id][Math.floor(rand(s) * 4)];
    const dist = tileDist(c.hx, c.hy, tx, ty);
    if (dist > WALK_RANGE) continue;
    c.busyUntil = now + 1;
    cz.trips.push({ cid: c.id, seg: c.seg, hx: c.hx, hy: c.hy, tx, ty, t0: now + 1 + rand(s) * 0.6, walk: 0.05 * (dist + 1), stay: 0.2 + rand(s) * 0.3, ok: true, stroll: true });
  }

  // Drop finished trips.
  const cut = now - 0.5;
  if (cz.trips.length > 2500 || h % 3 === 0) cz.trips = cz.trips.filter(t => t.t0 + 2 * t.walk + t.stay > cut).slice(-2500);
  return res;
}

// Where a trip's walker is at absolute game time T (hours), in tile
// coordinates along its path, or null if indoors. path is cached on the trip.
export function tripPhase(t, T) {
  const a = T - t.t0;
  if (a < 0) return null;
  if (a < t.walk) return { leg: 0, f: a / t.walk };
  if (a < t.walk + t.stay) return null;
  if (a < 2 * t.walk + t.stay) return { leg: 1, f: (a - t.walk - t.stay) / t.walk };
  return null;
}
