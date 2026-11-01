// Skyline Hustle - the city simulation. Pure data in, pure data out: no DOM,
// so it runs identically in the browser and in headless Node tests.
//
// Time advances one game hour at a time. Every hour each district generates
// customers for every kind of business; they split between the open shops of
// that kind on the block and its neighbours by fit-out, price and distance.
// At midnight rents, fares, utility cuts, apartment rents and interest settle.

import {
  MAP_W, MAP_H, BLOCK_LAYOUT, DISTRICTS, SEG_ELASTICITY, STATION_PRICE, UTILITY_PRICE,
  STATION_NAMES, UTILITY_NAMES, STATION_FARE, UTILITY_CUT, TRANSIT_TOURISTS, PARK_TOURISTS,
  BUSINESSES, BIZ, PRICE_TIERS, FIT_LEVELS, MAX_STAFF, APT_RESIDENTS, APT_RENT, APT_RENT_RATE,
  APT_COST_RATE, MAX_APT, DEMAND_SCALE, OUTSIDE_WEIGHT, NEIGHBOUR_W, DIAGONAL_W, ELASTICITY_BASE,
  RENT_RATE, SET_RENT_MULT, APT_SHOP_RENT, OVERHEAD_BASE, OVERHEAD_RATE, LAND_GROWTH_DAY,
  LAND_GROWTH_BIZ, LAND_GROWTH_APT, SELL_LAND_RATE, SELL_BIZ_RATE, LOAN_RATE, LOAN_STEP, LOAN_LTV,
  START_CASH, RIVALS, HUMAN_COLOR, SCENARIOS, DIFFICULTY, EVENTS,
} from './data.js';

// ------------------------------------------------------------- rng ----
// mulberry32 with its state kept inside the save game.
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];

// ------------------------------------------------------- static map ----
// Built once from BLOCK_LAYOUT; never saved.
export const MAP = (() => {
  const tiles = [];
  for (let y = 0; y < MAP_H; y++) {
    tiles.push([]);
    for (let x = 0; x < MAP_W; x++) {
      const road = x % 3 === 0 || y % 3 === 0;
      tiles[y].push({ x, y, kind: road ? 'road' : 'plaza', block: -1, district: -1, lot: -1 });
    }
  }
  const blocks = [];
  const lotDefs = [];
  let station = 0, utility = 0;
  BLOCK_LAYOUT.forEach((row, br) => row.forEach((slot, bc) => {
    const bx = 1 + bc * 3, by = 1 + br * 3;
    const block = { id: blocks.length, bc, br, bx, by, kind: slot, district: -1 };
    if (slot.startsWith('d:')) { block.kind = 'district'; block.district = +slot.slice(2); }
    blocks.push(block);
    const at = (dx, dy) => tiles[by + dy][bx + dx];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      at(dx, dy).block = block.id;
      at(dx, dy).district = block.district;
      if (block.kind === 'park') at(dx, dy).kind = 'park';
    }
    const addLot = (dx, dy, def) => {
      const t = at(dx, dy);
      t.kind = 'lot';
      t.lot = lotDefs.length;
      lotDefs.push({ id: lotDefs.length, tx: bx + dx, ty: by + dy, block: block.id, ...def });
    };
    if (block.kind === 'district') {
      const D = DISTRICTS[block.district];
      const spots = D.lots === 3 ? [[0, 0], [1, 0], [0, 1]] : [[0, 0], [1, 1]];
      spots.forEach(([dx, dy], i) => addLot(dx, dy, {
        kind: 'prop', district: block.district, index: i,
        name: `${D.short} Lot ${i + 1}`,
        basePrice: Math.round(D.price * (1 + 0.09 * i) / 100) * 100,
      }));
    } else if (block.kind === 'transit') {
      [[0, 0], [1, 1]].forEach(([dx, dy]) => addLot(dx, dy, {
        kind: 'station', district: -1, name: STATION_NAMES[station++], basePrice: STATION_PRICE,
      }));
    } else if (block.kind === 'utility') {
      [[0, 0], [1, 1]].forEach(([dx, dy]) => addLot(dx, dy, {
        kind: 'utility', district: -1, name: UTILITY_NAMES[utility++], basePrice: UTILITY_PRICE,
      }));
    }
  }));

  // District adjacency: who shops where, and where tourists come from.
  const distBlock = DISTRICTS.map((_, d) => blocks.find(b => b.district === d));
  const neighbours = DISTRICTS.map((_, d) => {
    const a = distBlock[d];
    const out = [];
    DISTRICTS.forEach((_, e) => {
      const b = distBlock[e];
      const dx = Math.abs(a.bc - b.bc), dy = Math.abs(a.br - b.br);
      if (d === e) out.push({ d: e, w: 1 });
      else if (dx + dy === 1) out.push({ d: e, w: NEIGHBOUR_W });
      else if (dx === 1 && dy === 1) out.push({ d: e, w: DIAGONAL_W });
    });
    return out;
  });
  const tourists = DISTRICTS.map((_, d) => {
    const a = distBlock[d];
    let t = 0;
    for (const b of blocks) {
      if (Math.max(Math.abs(a.bc - b.bc), Math.abs(a.br - b.br)) !== 1) continue;
      const ortho = a.bc === b.bc || a.br === b.br;
      if (b.kind === 'transit') t += TRANSIT_TOURISTS * (ortho ? 1 : 0.5);
      if (b.kind === 'park') t += PARK_TOURISTS * (ortho ? 1 : 0.5);
    }
    return t;
  });
  const districtLots = DISTRICTS.map((_, d) => lotDefs.filter(l => l.district === d).map(l => l.id));
  return { tiles, blocks, lotDefs, neighbours, tourists, districtLots, distBlock };
})();

// Precomputed demand curve per business per hour (0 when closed).
export function isOpen(def, h) {
  const [a, z] = def.open;
  return a < z ? h >= a && h < z : h >= a || h < z;
}
export const PROFILE = Object.fromEntries(BUSINESSES.map(def => {
  const arr = [];
  for (let h = 0; h < 24; h++) {
    if (!isOpen(def, h)) { arr.push(0); continue; }
    let v = 0.22;
    for (const p of def.peaks) {
      const d = Math.min(Math.abs(h - p), 24 - Math.abs(h - p));
      v += 0.8 * Math.exp(-(d * d) / (2 * 2.2 * 2.2));
    }
    arr.push(Math.min(v, 1.15));
  }
  return [def.id, arr];
}));
export const openHours = def => PROFILE[def.id].filter(v => v > 0).length;

// ------------------------------------------------------------ setup ----
export function createGame({ scenario = 'standard', difficulty = 'normal', name = 'You', company = 'Your Company', seed } = {}) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const s = {
    v: 1,
    rng: (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0,
    day: 1, hour: 7, t: 0,
    scenario, difficulty,
    players: [],
    lots: MAP.lotDefs.map(l => ({ ...l, owner: -1, apt: 0, aptInvested: 0, business: null })),
    events: [], news: [], newsSeq: 0, offers: [], offerSeq: 0,
    landMod: 1, mods: {}, touristMult: 1,
    cityCustomersToday: 0, cityCustomersYesterday: 0,
    over: false, winner: -1, endReason: '',
  };
  s.players.push(makePlayer(0, name || 'You', company || 'Your Company', HUMAN_COLOR, true, 'human', START_CASH));
  RIVALS.forEach((r, i) => s.players.push(makePlayer(i + 1, r.name, r.company, r.color, false, r.style,
    Math.round(START_CASH * diff.aiCash))));
  refreshMods(s);
  news(s, `Welcome to the city, ${s.players[0].company}. ${SCENARIOS[scenario].blurb}`, 'info');
  news(s, 'Tip: own every lot of one colour to double its rents and unlock apartment towers.', 'info');
  return s;
}

function makePlayer(id, name, company, color, human, style, cash) {
  return {
    id, name, company, color, human, style, cash, loan: 0,
    bankrupt: false, debtDays: 0,
    today: {}, yesterday: {}, hist: [], worthHist: [],
  };
}

export function news(s, text, kind = 'info', who = -1) {
  s.news.unshift({ seq: ++s.newsSeq, day: s.day, hour: s.hour, text, kind, who });
  if (s.news.length > 60) s.news.length = 60;
}

// ------------------------------------------------------- money book ----
function ledger(p, cat, amt) {
  p.cash += amt;
  p.today[cat] = (p.today[cat] || 0) + amt;
}
export const LEDGER_LABELS = {
  sales: 'Sales', goods: 'Stock & goods', wages: 'Wages', rentPaid: 'Ground rent paid',
  rentIn: 'Ground rent received', overhead: 'Overheads & bills', fares: 'Station fares',
  utility: 'Utility income', aptRent: 'Apartment rents', interest: 'Loan interest',
  trade: 'Land trades', capex: 'Building & land',
};

// ------------------------------------------------------ valuations ----
export const isWeekend = s => (s.day - 1) % 7 >= 5;
export const dayName = s => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(s.day - 1) % 7];

export function districtStats(s, d) {
  let biz = 0, apt = 0;
  for (const id of MAP.districtLots[d]) {
    const l = s.lots[id];
    if (l.business) biz++;
    apt += l.apt;
  }
  return { biz, apt };
}

export function landValue(s, lot) {
  if (lot.kind !== 'prop') return Math.round(lot.basePrice * (1 + 0.004 * (s.day - 1)) * s.landMod);
  const { biz, apt } = districtStats(s, lot.district);
  return Math.round(lot.basePrice * (1 + LAND_GROWTH_DAY * (s.day - 1)) *
    (1 + LAND_GROWTH_BIZ * biz + LAND_GROWTH_APT * apt) * s.landMod);
}

export function setCount(s, pid, d) {
  return MAP.districtLots[d].filter(id => s.lots[id].owner === pid).length;
}
export function ownsSet(s, pid, d) {
  return pid >= 0 && d >= 0 && setCount(s, pid, d) === MAP.districtLots[d].length;
}

export function rentFor(s, lot) {
  if (lot.kind !== 'prop') return 0;
  const set = ownsSet(s, lot.owner, lot.district) ? SET_RENT_MULT : 1;
  return Math.round(landValue(s, lot) * RENT_RATE * set * (1 + APT_SHOP_RENT * lot.apt));
}

export function aptCost(lot, level) {
  return Math.round(lot.basePrice * APT_COST_RATE * (level === MAX_APT ? 2.4 : 1) / 100) * 100;
}
export function aptRentFor(s, lot) {
  return Math.round(lot.basePrice * APT_RENT_RATE * APT_RENT[lot.apt] * (1 + 0.004 * (s.day - 1)));
}

export function bizValue(b) { return Math.round(b.invested * 0.6); }

export function playerAssets(s, pid) {
  let land = 0, biz = 0, apt = 0;
  for (const l of s.lots) {
    if (l.owner === pid) { land += landValue(s, l); apt += Math.round(l.aptInvested * 0.75); }
    if (l.business && l.business.owner === pid) biz += bizValue(l.business);
  }
  return { land, biz, apt, total: land + biz + apt };
}
export function netWorth(s, pid) {
  const p = s.players[pid];
  return Math.round(p.cash - p.loan + playerAssets(s, pid).total);
}
export function loanLimit(s, pid) {
  const cap = Math.floor(playerAssets(s, pid).total * LOAN_LTV / LOAN_STEP) * LOAN_STEP;
  return Math.max(0, cap + 20000);      // the bank always fronts a small line
}

// --------------------------------------------------------- demand ----
export function districtPopulation(s, d) {
  let residents = DISTRICTS[d].pop;
  for (const id of MAP.districtLots[d]) residents += APT_RESIDENTS[s.lots[id].apt];
  let tourists = MAP.tourists[d] * s.touristMult;
  for (const e of s.events) if (e.district === d && e.tourists) tourists += e.tourists;
  return { residents, tourists };
}

function segments(s, d) {
  const { residents, tourists } = districtPopulation(s, d);
  const m = DISTRICTS[d].mix;
  return [residents * m[0], residents * m[1], residents * m[2], tourists];
}

export function capacity(b) {
  return b.staff * BIZ[b.type].cap * FIT_LEVELS[b.fit].cap;
}

// Splits one hour of demand between open businesses.
// pools: optional Set of districts to evaluate; onlyType: optional business id.
// Returns Map lotId -> customers (before the capacity cap).
export function allocate(s, h, pools = null, onlyType = null) {
  const byType = {};
  for (const l of s.lots) {
    const b = l.business;
    if (!b || (onlyType && b.type !== onlyType)) continue;
    if (!PROFILE[b.type][h]) continue;
    (byType[b.type] ||= []).push(l);
  }
  const out = new Map();
  for (let d = 0; d < DISTRICTS.length; d++) {
    if (pools && !pools.has(d)) continue;
    const seg = segments(s, d);
    const total = seg[0] + seg[1] + seg[2] + seg[3];
    const el = ELASTICITY_BASE * (seg[0] * SEG_ELASTICITY[0] + seg[1] * SEG_ELASTICITY[1] +
      seg[2] * SEG_ELASTICITY[2] + seg[3] * SEG_ELASTICITY[3]) / total;
    const neigh = MAP.neighbours[d];
    for (const type in byType) {
      const def = BIZ[type];
      const demand = (seg[0] * def.app[0] + seg[1] * def.app[1] + seg[2] * def.app[2] + seg[3] * def.app[3]) /
        1000 * DEMAND_SCALE * PROFILE[type][h] * modFor(s, def);
      if (demand <= 0) continue;
      let sum = 0;
      const ws = [];
      for (const l of byType[type]) {
        const n = neigh.find(x => x.d === l.district);
        if (!n) { ws.push(0); continue; }
        const b = l.business;
        const a = n.w * FIT_LEVELS[b.fit].appeal * Math.pow(1 / PRICE_TIERS[b.tier].mult, el);
        ws.push(a);
        sum += a;
      }
      if (sum <= 0) continue;
      const denom = OUTSIDE_WEIGHT + sum;
      byType[type].forEach((l, i) => {
        if (ws[i] > 0) out.set(l.id, (out.get(l.id) || 0) + demand * ws[i] / denom);
      });
    }
  }
  return out;
}

function modFor(s, def) {
  const m = s.mods;
  return (m.all || 1) * (m[def.id] || 1) * (m[def.group] || 1);
}

function refreshMods(s) {
  const m = {};
  const mul = (k, v) => { m[k] = (m[k] || 1) * v; };
  const dow = (s.day - 1) % 7;
  if (dow >= 5) { mul('club', 1.35); mul('bistro', 1.25); mul('cinema', 1.3); mul('boutique', 1.2); mul('gadget', 1.15); mul('gym', 0.85); mul('cafe', 0.95); }
  if (dow === 4) { mul('club', 1.2); mul('bistro', 1.12); }
  let tm = 1;
  for (const e of s.events) {
    const def = EVENTS.find(x => x.id === e.id);
    if (def.mods) for (const k in def.mods) mul(k, def.mods[k]);
    if (def.touristMult) tm *= def.touristMult;
  }
  s.mods = m;
  s.touristMult = tm;
}

// What would this business make per day, right now?
// Temporarily installs it on the lot, runs 24 hours of allocation, restores.
export function estimate(s, lotId, type, ownerId, cfg = {}) {
  const lot = s.lots[lotId];
  const saved = lot.business;
  const def = BIZ[type];
  const b = {
    type, owner: ownerId,
    tier: cfg.tier ?? saved?.tier ?? 2,
    staff: cfg.staff ?? saved?.staff ?? 3,
    fit: cfg.fit ?? saved?.fit ?? 1,
  };
  lot.business = b;
  const pools = new Set(MAP.neighbours[lot.district].map(n => n.d));
  const cap = capacity(b);
  let cust = 0, lost = 0, hours = 0;
  for (let h = 0; h < 24; h++) {
    if (!PROFILE[type][h]) continue;
    hours++;
    const c = allocate(s, h, pools, type).get(lotId) || 0;
    cust += Math.min(c, cap);
    lost += Math.max(0, c - cap);
  }
  lot.business = saved;
  const rev = cust * def.ticket * PRICE_TIERS[b.tier].mult;
  const goods = cust * def.ticket * def.stock;
  const wages = b.staff * def.wage * hours;
  const rent = lot.owner === ownerId ? 0 : rentFor(s, lot);
  const overhead = OVERHEAD_BASE + def.cost * OVERHEAD_RATE;
  return { cust, lost, rev, goods, wages, rent, overhead, profit: rev - goods - wages - rent - overhead };
}

// ------------------------------------------------------------ clock ----
// Advances one game hour. hooks.onHour / hooks.onDay let the AI act.
export function stepHour(s, hooks = {}) {
  if (s.over) return;
  runHour(s, s.hour);
  s.hour = (s.hour + 1) % 24;
  if (s.hour === 0) endOfDay(s, hooks);
  if (!s.over && hooks.onHour) hooks.onHour(s);
}

export function runHour(s, h) {
  const alloc = allocate(s, h);
  s.lastHour = {};
  for (const l of s.lots) {
    const b = l.business;
    if (!b || !PROFILE[b.type][h]) continue;
    const def = BIZ[b.type];
    const p = s.players[b.owner];
    const cap = capacity(b);
    const want = alloc.get(l.id) || 0;
    const c = Math.min(want, cap);
    const rev = c * def.ticket * PRICE_TIERS[b.tier].mult;
    const goods = c * def.ticket * def.stock;
    const wages = b.staff * def.wage;
    ledger(p, 'sales', rev);
    ledger(p, 'goods', -goods);
    ledger(p, 'wages', -wages);
    const t = b.today;
    t.cust += c; t.lost += Math.max(0, want - c);
    t.rev += rev; t.cost += goods + wages;
    t.peak = Math.max(t.peak, want / cap);
    s.cityCustomersToday += c;
    s.lastHour[l.id] = rev - goods - wages;
  }
}

function freshBizDay() { return { cust: 0, lost: 0, rev: 0, cost: 0, peak: 0, rent: 0 }; }

function endOfDay(s, hooks) {
  const P = s.players;
  // Ground rent, overheads.
  let overheadPool = 0;
  for (const l of s.lots) {
    const b = l.business;
    if (!b) continue;
    const tenant = P[b.owner];
    if (l.owner !== b.owner) {
      const r = rentFor(s, l);
      ledger(tenant, 'rentPaid', -r);
      b.today.rent = r;
      b.today.cost += r;
      if (l.owner >= 0) ledger(P[l.owner], 'rentIn', r);
    }
    const o = OVERHEAD_BASE + BIZ[b.type].cost * OVERHEAD_RATE;
    ledger(tenant, 'overhead', -o);
    b.today.cost += o;
    overheadPool += o;
  }
  // Utilities take a cut of everyone's bills; stations collect fares.
  for (const p of P) {
    if (p.bankrupt) continue;
    const utils = s.lots.filter(l => l.kind === 'utility' && l.owner === p.id).length;
    if (utils) ledger(p, 'utility', overheadPool * UTILITY_CUT[utils] * utils);
    const stations = s.lots.filter(l => l.kind === 'station' && l.owner === p.id).length;
    if (stations) ledger(p, 'fares', STATION_FARE[stations] * stations * (0.7 + 0.3 * s.touristMult) * (1 + 0.004 * (s.day - 1)));
  }
  // Apartment rents.
  for (const l of s.lots) if (l.apt > 0 && l.owner >= 0) ledger(P[l.owner], 'aptRent', aptRentFor(s, l));
  // Interest.
  for (const p of P) if (p.loan > 0) ledger(p, 'interest', -p.loan * LOAN_RATE);

  // Close the books on the day.
  for (const l of s.lots) {
    const b = l.business;
    if (!b) continue;
    b.yesterday = b.today;
    b.hist.push(Math.round(b.today.rev - b.today.cost));
    if (b.hist.length > 10) b.hist.shift();
    b.today = freshBizDay();
  }
  s.cityCustomersYesterday = s.cityCustomersToday;
  s.cityCustomersToday = 0;

  if (hooks.onDay) hooks.onDay(s);   // AI reprices, trades, liquidates

  for (const p of P) {
    p.yesterday = p.today;
    p.today = {};
    const nw = netWorth(s, p.id);
    p.worthHist.push(nw);
    if (p.worthHist.length > 120) p.worthHist.shift();
  }

  s.day++;
  solvency(s);
  tickEvents(s);
  refreshMods(s);
  checkEnd(s);
}

function solvency(s) {
  for (const p of s.players) {
    if (p.bankrupt) continue;
    if (p.cash >= 0) { p.debtDays = 0; continue; }
    // The bank covers the gap if it can.
    const room = loanLimit(s, p.id) - p.loan;
    const need = Math.ceil(-p.cash / LOAN_STEP) * LOAN_STEP;
    if (room >= need) {
      p.loan += need; p.cash += need;
      if (p.human) news(s, `Your account went negative: the bank advanced ${money(need)}.`, 'warn');
      continue;
    }
    p.debtDays++;
    if (p.human) news(s, `You are overdrawn with no credit left (day ${p.debtDays} of 3). Sell something!`, 'bad');
    if (p.debtDays >= 3) bankrupt(s, p);
  }
}

export function bankrupt(s, p) {
  p.bankrupt = true;
  for (const l of s.lots) {
    if (l.business && l.business.owner === p.id) l.business = null;
    if (l.owner === p.id) { l.owner = -1; l.apt = 0; l.aptInvested = 0; }
  }
  s.offers = s.offers.filter(o => o.from !== p.id);
  news(s, `${p.company} has gone bankrupt! Its land returns to the city.`, 'bad', p.id);
}

function tickEvents(s) {
  for (const e of s.events) e.left--;
  s.events = s.events.filter(e => e.left > 0);
  if (s.events.length < 2 && rand(s) < 0.5) {
    const total = EVENTS.reduce((a, e) => a + e.weight, 0);
    let r = rand(s) * total, def = EVENTS[0];
    for (const e of EVENTS) { r -= e.weight; if (r <= 0) { def = e; break; } }
    if (s.events.some(e => e.id === def.id)) return;
    const len = def.days[0] + Math.floor(rand(s) * (def.days[1] - def.days[0] + 1));
    const e = { id: def.id, left: len, district: -1, tourists: def.tourists || 0 };
    if (def.district) e.district = Math.floor(rand(s) * DISTRICTS.length);
    if (def.land) s.landMod = Math.min(1.5, Math.max(0.75, s.landMod * def.land));
    s.events.push(e);
    news(s, def.text(e.district >= 0 ? DISTRICTS[e.district].name : ''), 'event');
  }
}

function checkEnd(s) {
  const sc = SCENARIOS[s.scenario];
  const me = s.players[0];
  if (me.bankrupt) return finish(s, -1, 'You went bankrupt.');
  const alive = s.players.filter(p => !p.bankrupt);
  if (alive.length === 1) return finish(s, alive[0].id, 'Every rival has gone bust.');
  if (!sc.goal) return;
  const worth = s.players.map(p => p.bankrupt ? -Infinity : netWorth(s, p.id));
  const best = worth.indexOf(Math.max(...worth));
  if (worth[best] >= sc.goal) return finish(s, best, `${s.players[best].company} reached ${money(sc.goal)} first.`);
  if (s.day > sc.days) return finish(s, best, `Time is up after ${sc.days} days. Richest tycoon wins.`);
}
function finish(s, winner, reason) {
  s.over = true; s.winner = winner; s.endReason = reason;
}

// ---------------------------------------------------------- actions ----
// Every action returns { ok, msg } so the UI and the AI share the same rules.
const fail = msg => ({ ok: false, msg });

export function buyLand(s, pid, lotId) {
  const p = s.players[pid], lot = s.lots[lotId];
  if (lot.owner !== -1) return fail('Not for sale by the city.');
  const price = landValue(s, lot);
  if (p.cash < price) return fail(`Need ${money(price)}.`);
  ledger(p, 'capex', -price);
  lot.owner = pid;
  const done = lot.kind === 'prop' && ownsSet(s, pid, lot.district);
  news(s, `${p.company} bought ${lot.name} for ${money(price)}.` +
    (done ? ` That completes the ${DISTRICTS[lot.district].name} set!` : ''), done ? 'set' : 'deal', pid);
  return { ok: true, msg: done ? `Set complete: ${DISTRICTS[lot.district].name}!` : `Bought ${lot.name}.`, setComplete: done };
}

export function sellLand(s, pid, lotId) {
  const p = s.players[pid], lot = s.lots[lotId];
  if (lot.owner !== pid) return fail('You do not own this.');
  const value = Math.round(landValue(s, lot) * SELL_LAND_RATE + lot.aptInvested * 0.5);
  ledger(p, 'capex', value);
  lot.owner = -1; lot.apt = 0; lot.aptInvested = 0;
  s.offers = s.offers.filter(o => o.lotId !== lotId);
  news(s, `${p.company} sold ${lot.name} back to the city.`, 'deal', pid);
  return { ok: true, msg: `Sold for ${money(value)}.` };
}

export function canBuild(s, lotId) {
  const lot = s.lots[lotId];
  return lot.kind === 'prop' && !lot.business;
}

export function build(s, pid, lotId, type, cfg = {}) {
  const p = s.players[pid], lot = s.lots[lotId], def = BIZ[type];
  if (!canBuild(s, lotId)) return fail('Lot is not free.');
  if (p.cash < def.cost) return fail(`Need ${money(def.cost)}.`);
  ledger(p, 'capex', -def.cost);
  lot.business = {
    type, owner: pid, tier: cfg.tier ?? 2, staff: cfg.staff ?? 3, fit: 1,
    invested: def.cost, opened: s.day, today: freshBizDay(), yesterday: null, hist: [],
  };
  news(s, `${p.company} opened a ${def.name} on ${lot.name}.`, 'build', pid);
  return { ok: true, msg: `${def.name} is open for business!` };
}

export function sellBusiness(s, pid, lotId) {
  const p = s.players[pid], lot = s.lots[lotId], b = lot.business;
  if (!b || b.owner !== pid) return fail('Not your business.');
  const v = Math.round(b.invested * SELL_BIZ_RATE);
  ledger(p, 'capex', v);
  lot.business = null;
  news(s, `${p.company} closed its ${BIZ[b.type].name} on ${lot.name}.`, 'deal', pid);
  return { ok: true, msg: `Sold the fittings for ${money(v)}.` };
}

export function setTier(s, pid, lotId, tier) {
  const b = s.lots[lotId].business;
  if (!b || b.owner !== pid) return fail('Not your business.');
  b.tier = Math.max(0, Math.min(PRICE_TIERS.length - 1, tier));
  return { ok: true };
}
export function setStaff(s, pid, lotId, staff) {
  const b = s.lots[lotId].business;
  if (!b || b.owner !== pid) return fail('Not your business.');
  b.staff = Math.max(1, Math.min(MAX_STAFF, staff));
  return { ok: true };
}
export function fitCost(b) {
  if (b.fit >= FIT_LEVELS.length - 1) return 0;
  const def = BIZ[b.type];
  return Math.round(def.cost * (FIT_LEVELS[b.fit + 1].costMult - FIT_LEVELS[b.fit].costMult) / 100) * 100;
}
export function upgradeFit(s, pid, lotId) {
  const p = s.players[pid], b = s.lots[lotId].business;
  if (!b || b.owner !== pid) return fail('Not your business.');
  const c = fitCost(b);
  if (!c) return fail('Already a flagship.');
  if (p.cash < c) return fail(`Need ${money(c)}.`);
  ledger(p, 'capex', -c);
  b.fit++; b.invested += c;
  return { ok: true, msg: `Refitted to ${FIT_LEVELS[b.fit].name}.` };
}

// Apartments: whole colour set required, built evenly across the set.
export function aptCheck(s, pid, lotId) {
  const lot = s.lots[lotId];
  if (lot.kind !== 'prop') return fail('Only district lots take apartments.');
  if (lot.owner !== pid) return fail('You must own the land.');
  if (!ownsSet(s, pid, lot.district)) return fail(`Own all of ${DISTRICTS[lot.district].name} first.`);
  if (lot.apt >= MAX_APT) return fail('Already a Skyline Tower.');
  const min = Math.min(...MAP.districtLots[lot.district].map(id => s.lots[id].apt));
  if (lot.apt > min) return fail('Build evenly: raise the other lots in this colour first.');
  return { ok: true, cost: aptCost(lot, lot.apt + 1) };
}
export function buildApt(s, pid, lotId) {
  const chk = aptCheck(s, pid, lotId);
  if (!chk.ok) return chk;
  const p = s.players[pid], lot = s.lots[lotId];
  if (p.cash < chk.cost) return fail(`Need ${money(chk.cost)}.`);
  ledger(p, 'capex', -chk.cost);
  lot.apt++; lot.aptInvested += chk.cost;
  if (lot.apt === MAX_APT) news(s, `${p.company} topped out a Skyline Tower on ${lot.name}!`, 'set', pid);
  else if (!p.human) news(s, `${p.company} added apartments on ${lot.name}.`, 'build', pid);
  return { ok: true, msg: lot.apt === MAX_APT ? 'Skyline Tower complete!' : `Now ${lot.apt * 2} floors of apartments.` };
}
export function sellApt(s, pid, lotId) {
  const p = s.players[pid], lot = s.lots[lotId];
  if (lot.owner !== pid || lot.apt <= 0) return fail('Nothing to demolish.');
  const max = Math.max(...MAP.districtLots[lot.district].map(id => s.lots[id].apt));
  if (lot.apt < max) return fail('Demolish evenly: take the tallest lot down first.');
  const c = aptCost(lot, lot.apt);
  ledger(p, 'capex', Math.round(c * 0.5));
  lot.apt--; lot.aptInvested = Math.max(0, lot.aptInvested - c);
  return { ok: true, msg: `Sold one level for ${money(c * 0.5)}.` };
}

// How much an owner wants for a lot. AI sellers use this; it is also what
// the UI shows as "they'd take about...".
export function askingPrice(s, sellerId, lotId, buyerId) {
  const lot = s.lots[lotId];
  let v = landValue(s, lot) + lot.aptInvested * 0.9;
  if (lot.kind === 'prop') {
    const n = MAP.districtLots[lot.district].length;
    const mine = setCount(s, sellerId, lot.district);
    if (mine === n) v *= 3.0;
    else if (mine >= 2) v *= 1.6;
    if (setCount(s, buyerId, lot.district) === n - 1) v *= 1.75;
  } else if (lot.kind === 'station') {
    v *= 1 + 0.3 * s.lots.filter(l => l.kind === 'station' && l.owner === sellerId).length;
  }
  if (lot.business && lot.business.owner === sellerId) v *= 1.15;
  const margin = DIFFICULTY[s.difficulty].margin;
  return Math.round(v * 1.2 * margin / 500) * 500;
}

export function transfer(s, buyerId, sellerId, lotId, amount) {
  const b = s.players[buyerId], se = s.players[sellerId], lot = s.lots[lotId];
  ledger(b, 'trade', -amount);
  ledger(se, 'trade', amount);
  lot.owner = buyerId;
  s.offers = s.offers.filter(o => o.lotId !== lotId);
  const done = lot.kind === 'prop' && ownsSet(s, buyerId, lot.district);
  news(s, `${b.company} bought ${lot.name} from ${se.company} for ${money(amount)}.` +
    (done ? ` ${DISTRICTS[lot.district].name} set complete!` : ''), done ? 'set' : 'deal', buyerId);
  return done;
}

// The human bids on a rival's lot.
export function makeOffer(s, buyerId, lotId, amount) {
  const lot = s.lots[lotId], buyer = s.players[buyerId];
  if (lot.owner < 0 || lot.owner === buyerId) return fail('Nobody to buy from.');
  if (buyer.cash < amount) return fail(`You only have ${money(buyer.cash)}.`);
  const ask = askingPrice(s, lot.owner, lotId, buyerId);
  const seller = s.players[lot.owner];
  if (amount >= ask) {
    const done = transfer(s, buyerId, lot.owner, lotId, amount);
    return { ok: true, msg: done ? `Deal! ${DISTRICTS[lot.district].name} set complete!` : `${seller.name} accepts. ${lot.name} is yours.` };
  }
  return { ok: false, counter: ask, msg: `${seller.name} declines. "I'd want ${money(ask)} for that."` };
}

export function acceptOffer(s, offerId) {
  const o = s.offers.find(x => x.id === offerId);
  if (!o) return fail('Offer expired.');
  const lot = s.lots[o.lotId];
  if (lot.owner !== o.to || s.players[o.from].cash < o.amount) {
    s.offers = s.offers.filter(x => x !== o);
    return fail('The offer fell through.');
  }
  transfer(s, o.from, o.to, o.lotId, o.amount);
  return { ok: true, msg: `Sold ${lot.name} for ${money(o.amount)}.` };
}
export function declineOffer(s, offerId) {
  s.offers = s.offers.filter(x => x.id !== offerId);
  return { ok: true };
}

export function takeLoan(s, pid, amount = LOAN_STEP) {
  const p = s.players[pid];
  if (p.loan + amount > loanLimit(s, pid)) return fail('The bank says no: not enough collateral.');
  p.loan += amount; p.cash += amount;
  return { ok: true, msg: `Borrowed ${money(amount)}.` };
}
export function repayLoan(s, pid, amount = LOAN_STEP) {
  const p = s.players[pid];
  amount = Math.min(amount, p.loan);
  if (amount <= 0) return fail('No loan to repay.');
  if (p.cash < amount) return fail('Not enough cash.');
  p.loan -= amount; p.cash -= amount;
  return { ok: true, msg: `Repaid ${money(amount)}.` };
}

// ------------------------------------------------------------ misc ----
export function money(v) {
  const neg = v < 0; v = Math.abs(v);
  let str;
  if (v >= 1e6) str = '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M';
  else if (v >= 1e4) str = '$' + (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + 'K';
  else str = '$' + Math.round(v).toLocaleString('en-US');
  return (neg ? '−' : '') + str;
}

export function serialize(s) {
  return JSON.stringify(s);
}
export function deserialize(json) {
  const s = JSON.parse(json);
  if (!s || s.v !== 1 || !Array.isArray(s.lots)) throw new Error('bad save');
  return s;
}
