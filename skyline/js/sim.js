// Skyline Hustle - the city simulation. Pure data in, pure data out: no DOM,
// so it runs identically in the browser and in headless Node tests.
//
// Time advances one game hour at a time. Each hour citizens decide where to
// spend (citizens.js) and shops pay wages; at 06:00 stock is delivered; at
// midnight rents, fares, utility cuts, apartment rents and interest settle,
// food spoils, reputations move, the calendar turns and goals are checked.
// Land is sold by the city at live auctions (auction.js).

import {
  DISTRICTS, SEG_ELASTICITY, stationFare, MAPS, UTILITY_CUT, BUSINESSES, BIZ, FIT_LEVELS, MAX_STAFF,
  APT_RESIDENTS, APT_RENT, APT_RENT_RATE, APT_COST_RATE, APT_SET_MULT, MAX_APT, DEMAND_SCALE,
  OUTSIDE_WEIGHT, ELASTICITY_BASE, RENT_RATE, SET_RENT_MULT, APT_SHOP_RENT, OVERHEAD_BASE, OVERHEAD_RATE,
  LAND_GROWTH_DAY, LAND_GROWTH_BIZ, LAND_GROWTH_APT, SELL_LAND_RATE, SELL_BIZ_RATE, LOAN_RATE, LOAN_STEP,
  LOAN_LTV, START_CASH, RIVALS, HUMAN_COLORS, MAX_COMPANIES, SCENARIOS, DIFFICULTY, EVENTS, PRICE_MIN, PRICE_MAX,
  DELIVERY_HOUR, HOLD_COST, AUTO_STOCK_PREMIUM, TECH, YEAR_DAYS, GOAL_TEXT, bizName, eraName,
  BIZ_UTIL, STAFF_ROLES, MAX_FLOORS, FLOOR_COST, PARKS, PROMOS, SURVEY_COST, SURVEY_DAYS, BUYOUT_MULT, BUYOUT_SET_MULT,
  CHAIN_TIERS, PROJECTS, LINE_OF,
} from './data.js';
import { MAP, rand, setMap } from './map.js';
import { NAT, bizOpen, defaultHours, yearOf, techOf, modFor, capacity, appeal, unitCost, blockStars, starFactor } from './demand.js';
import { makeStaff, refreshCandidates, teamWage, staffNight, syncHeadcount, servers, clerks, manager, maxStaff, fairPay, avgMorale, TRAIN_DAYS } from './staff.js';
import { buildCitizens, syncResidents, syncTourists, touristsIn, citizensHour } from './citizens.js';

export { MAP, rand, yearOf, techOf, capacity, bizOpen, blockStars, setMap };

// ------------------------------------------------------------ setup ----
// humans: [{ name, company }] for LAN games; otherwise one player from name/company.
export function createGame({ scenario = 'boomtown', difficulty = 'normal', name = 'You', company = 'Your Company', seed, humans, map = 'town', avatar = 0 } = {}) {
  setMap(map);
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const sc = SCENARIOS[scenario];
  const s = {
    v: 4, mapId: MAP.id,
    rng: (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0,
    day: 1, hour: 7, t: 0,
    scenario, difficulty,
    players: [],
    lots: MAP.lotDefs.map(l => ({ ...l, owner: -1, apt: 0, aptInvested: 0, business: null, unsold: 0 })),
    events: [], news: [], newsSeq: 0, offers: [], offerSeq: 0,
    landMod: 1, mods: {}, touristMult: 1,
    chatter: DISTRICTS.map(() => ({})),
    cityCustomersToday: 0, cityCustomersYesterday: 0,
    auction: null, auctionQueue: [], liveAuctions: false,
    goals: sc.goals || [],
    over: false, winner: -1, endReason: '',
  };
  const companies = MAPS[MAP.id].companies;
  const people = (humans && humans.length ? humans : [{ name, company, avatar }]).slice(0, Math.min(MAX_COMPANIES, companies));
  people.forEach((h, i) => {
    const p = makePlayer(i, h.name || `Player ${i + 1}`, h.company || `Company ${i + 1}`, HUMAN_COLORS[i], true, 'human', START_CASH);
    p.avatar = Number.isInteger(h.avatar) ? h.avatar : i;
    p.goals = s.goals.map(g => ({ done: false, doneDay: 0 }));
    p.failed = false;
    s.players.push(p);
  });
  RIVALS.slice(0, companies - people.length).forEach(r => {
    const p = makePlayer(s.players.length, r.name, r.company, r.color, false, r.style, Math.round(START_CASH * diff.aiCash));
    p.blurb = r.blurb;
    s.players.push(p);
  });
  // The city auctions its land roughly cheapest first, with some shuffle.
  s.auctionQueue = s.lots.map(l => ({ id: l.id, k: l.basePrice * (0.6 + rand(s) * 0.9) }))
    .sort((a, b) => a.k - b.k).map(x => x.id);
  refreshMods(s);
  buildCitizens(s);
  news(s, `Welcome to ${yearOf(s)}, ${people.length > 1 ? people.map(h => h.company).join(', ') : s.players[0].company}. ${sc.blurb}`, 'info');
  news(s, 'City land is sold at auction when someone calls one: tap a city lot to call it and open the bidding.', 'info');
  return s;
}

function makePlayer(id, name, company, color, human, style, cash) {
  return {
    id, name, company, color, human, style, cash, loan: 0,
    bankrupt: false, debtDays: 0,
    today: {}, yesterday: {}, worthHist: [],
  };
}

export function news(s, text, kind = 'info', who = -1) {
  s.news.unshift({ seq: ++s.newsSeq, day: s.day, hour: s.hour, text, kind, who });
  if (s.news.length > 60) s.news.length = 60;
}

export const bizLabel = (s, type) => bizName(BIZ[type], yearOf(s));

// ------------------------------------------------------- money book ----
export function ledger(p, cat, amt) {
  p.cash += amt;
  p.today[cat] = (p.today[cat] || 0) + amt;
}
export const LEDGER_LABELS = {
  sales: 'Sales', goods: 'Stock deliveries', storage: 'Storage', wages: 'Wages', rentPaid: 'Ground rent paid',
  rentIn: 'Ground rent received', overhead: 'Overheads & bills', fares: 'Station fares',
  utility: 'Utility income', aptRent: 'Apartment rents', interest: 'Loan interest',
  landmarks: 'Landmarks', projects: 'City contracts & grants', wholesale: 'Wholesale sales', production: 'Supplier running costs',
  trade: 'Land trades', capex: 'Building & land',
};

// Chains buy stock in bulk: the discount for a chain of n shops.
export function chainBulk(n) {
  let d = 0;
  for (const [min, off] of CHAIN_TIERS) if (n >= min) d = off;
  return d;
}
// Today's wholesale price index for a business type's goods (1 = normal).
export const marketIdx = (s, type) => s.market?.[LINE_OF[type]] ?? 1;
export const goodsUnit = (b, s) => unitCost(BIZ[b.type]) * (1 - (b.bulk || 0)) * (s ? marketIdx(s, b.type) : 1);
// The supply chain (supply.js) plugs in here: buyGoods(s, lot, marketValue) -> what the shop pays.
export const hooks = { buyGoods: null, quote: null };
// A shop type this company may build: invented already, or close enough for
// a Tech Campus owner.
export const canTech = (s, pid, type) => techOf(s).biz.has(type) || (!!s.players[pid]?.perks?.techAhead && BIZ[type].year <= yearOf(s) + s.players[pid].perks.techAhead);
// Locked lots: a landmark stands (or is going up) here.
export const lockedLot = lot => !!(lot.landmark || lot.lmBuild || lot.supplier);
export const operating = led => Object.entries(led).filter(([k]) => k !== 'capex' && k !== 'trade').reduce((a, [, v]) => a + v, 0);

// ------------------------------------------------------ valuations ----
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

// Stars added by parks (on top of a district's natural appeal).
export function parkStars(s, d) {
  let st = 0;
  for (const p of s.parks || []) if (p.d === d) st += PARKS.find(x => x.id === p.type).stars;
  return st;
}

export function landValue(s, lot) {
  if (lot.kind !== 'prop') return Math.round(lot.basePrice * (1 + 0.004 * (s.day - 1)) * s.landMod);
  const { biz, apt } = districtStats(s, lot.district);
  return Math.round(lot.basePrice * (1 + LAND_GROWTH_DAY * (s.day - 1)) *
    (1 + LAND_GROWTH_BIZ * biz + LAND_GROWTH_APT * apt + 0.07 * parkStars(s, lot.district)) * s.landMod);
}

export function setCount(s, pid, d) {
  return MAP.districtLots[d].filter(id => s.lots[id].owner === pid).length;
}
export function ownsSet(s, pid, d) {
  return pid >= 0 && d >= 0 && setCount(s, pid, d) === MAP.districtLots[d].length;
}
export function setsOwned(s, pid) {
  return DISTRICTS.filter((_, d) => ownsSet(s, pid, d)).length;
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
  const set = ownsSet(s, lot.owner, lot.district) ? APT_SET_MULT : 1;
  return Math.round(lot.basePrice * APT_RENT_RATE * APT_RENT[lot.apt] * set * (1 + 0.004 * (s.day - 1)) * (1 + 0.08 * parkStars(s, lot.district)));
}

export function bizValue(b) { return Math.round(b.invested * 0.6 + b.stock * unitCost(BIZ[b.type]) * 0.5); }

export function playerAssets(s, pid) {
  let land = 0, biz = 0, apt = 0;
  for (const l of s.lots) {
    if (l.owner === pid) { land += landValue(s, l) + (l.lmValue || 0) + (l.supplier ? Math.round(l.supplier.invested * 0.5) : 0); apt += Math.round(l.aptInvested * 0.75); }
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
  return Math.max(0, Math.round(cap * (s.players[pid].perks?.credit || 1) / LOAN_STEP) * LOAN_STEP + 20000);   // the bank always fronts a small line
}

// --------------------------------------------------------- demand ----
export function districtPopulation(s, d) {
  let residents = DISTRICTS[d].pop;
  for (const id of MAP.districtLots[d]) residents += APT_RESIDENTS[s.lots[id].apt];
  return { residents, tourists: touristsIn(s, d) };
}
function segments(s, d) {
  const { residents, tourists } = districtPopulation(s, d);
  const m = DISTRICTS[d].mix;
  return [residents * m[0], residents * m[1], residents * m[2], tourists];
}

// Analytic forecaster: the expected split of one hour of demand between
// open businesses. Citizens make the real decisions; this predicts them
// closely enough for the build menu, the price forecast and the AI.
// Returns Map lotId -> customers (before the capacity cap).
export function allocate(s, h, pools = null, onlyType = null) {
  const tech = techOf(s);
  // Only shops within shopping distance of the pools can win their custom.
  let lots = s.lots;
  if (pools) {
    const near = new Set();
    for (const d of pools) for (const n of MAP.neighbours[d]) near.add(n.d);
    lots = [];
    for (const d of near) for (const id of MAP.districtLots[d]) lots.push(s.lots[id]);
  }
  const byType = {};
  for (const l of lots) {
    const b = l.business;
    if (!b || (onlyType && b.type !== onlyType) || !bizOpen(b, h)) continue;
    (byType[b.type] ||= []).push(l);
  }
  const out = new Map();
  const stars = starsCache(s);
  for (let d = 0; d < DISTRICTS.length; d++) {
    if (pools && !pools.has(d)) continue;
    const seg = segments(s, d);
    const nw = MAP.neighW[d];
    for (const type in byType) {
      if (!tech.biz.has(type)) continue;
      const def = BIZ[type];
      const k = DEMAND_SCALE * NAT[type][h] * modFor(s, def) / 1000;
      const list = byType[type];
      // Per-shop pull before price (shared by the four wealth groups).
      const base = list.map(l => (nw.get(l.district) || 0) * appeal(l.business));
      // Each wealth group weighs price differently, so split them.
      for (let g = 0; g < 4; g++) {
        const demand = seg[g] * def.app[g] * k;
        if (demand <= 0) continue;
        const el = ELASTICITY_BASE * SEG_ELASTICITY[g];
        let sum = 0;
        const ws = list.map((l, i) => {
          if (!base[i]) return 0;
          const a = base[i] * starFactor(stars[l.district], g) * Math.pow(1 / l.business.price, el);
          sum += a;
          return a;
        });
        if (sum <= 0) continue;
        const denom = OUTSIDE_WEIGHT + sum;
        list.forEach((l, i) => {
          if (ws[i] > 0) out.set(l.id, (out.get(l.id) || 0) + demand * ws[i] / denom);
        });
      }
    }
  }
  return out;
}

// Block stars only change when parks do: cache them per state.
const STAR_CACHE = new WeakMap();
function starsCache(s) {
  const key = (s.parks || []).length + ':' + MAP.id;
  const c = STAR_CACHE.get(s);
  if (c && c.key === key) return c.stars;
  const stars = DISTRICTS.map((_, d) => blockStars(s, d));
  STAR_CACHE.set(s, { key, stars });
  return stars;
}

function refreshMods(s) {
  const m = {};
  const mul = (k, v) => { m[k] = (m[k] || 1) * v; };
  const dow = (s.day - 1) % 7;
  if (dow >= 5) { mul('club', 1.35); mul('bistro', 1.25); mul('cinema', 1.3); mul('boutique', 1.2); mul('gadget', 1.15); mul('arcade', 1.3); mul('gym', 0.85); mul('cafe', 0.95); }
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

// A new business's default settings.
export function newBizConfig(def) {
  return { price: 1, staff: 3, fit: 1, floors: 1, ...defaultHours(def) };
}

// What would this business make per day, right now? Temporarily installs
// it on the lot, runs 24 hours of the forecaster, restores. cfg overrides
// price / staff / fit / from / len.
export function estimate(s, lotId, type, ownerId, cfg = {}) {
  const lot = s.lots[lotId];
  const saved = lot.business;
  const def = BIZ[type];
  const base = saved && saved.type === type ? saved : newBizConfig(def);
  const same = saved && saved.type === type;
  const b = {
    type, owner: ownerId, rep: same ? saved.rep : 1, promo: same ? saved.promo : null,
    price: cfg.price ?? base.price, staff: cfg.staff ?? base.staff, fit: cfg.fit ?? base.fit,
    from: cfg.from ?? base.from, len: cfg.len ?? base.len, floors: cfg.floors ?? base.floors ?? 1,
    // The real team counts unless the forecast is asking "what if N servers?"
    team: same && cfg.staff === undefined ? saved.team : undefined,
  };
  lot.business = b;
  const pools = new Set(MAP.neighbours[lot.district].map(n => n.d));
  // Real customers arrive in rushes, not a smooth stream: plan for headroom.
  const cap = capacity(b) * 0.8;
  let cust = 0, lost = 0, hours = 0;
  for (let h = 0; h < 24; h++) {
    if (!bizOpen(b, h)) continue;
    hours++;
    const c = allocate(s, h, pools, type).get(lotId) || 0;
    cust += Math.min(c, cap);
    lost += Math.max(0, c - cap);
  }
  lot.business = saved;
  const rev = cust * def.ticket * b.price;
  // Goods sold, plus a little waste on perishables.
  const mates = s.lots.filter(l => l.id !== lotId && l.business && l.business.owner === ownerId && l.business.type === type).length;
  const goods = cust * unitCost(def) * (1 - chainBulk(mates + 1)) * (1 + def.perish * 0.15) * (hooks.quote ? hooks.quote(s, ownerId, type) : marketIdx(s, type));
  const wages = teamWage(b) * hours;
  const rent = lot.owner === ownerId ? 0 : rentFor(s, lot);
  const overhead = billFor(def, b.floors);
  return { cust, lost, rev, goods, wages, rent, overhead, hours, profit: rev - goods - wages - rent - overhead };
}

// Tonight's power and water bills across the city.
export function utilityPools(s) {
  const pools = { power: 0, water: 0 };
  for (const l of s.lots) if (l.business) {
    const o = billFor(BIZ[l.business.type], l.business.floors);
    const w = BIZ_UTIL[l.business.type]?.[1] ?? 0.3;
    pools.water += o * w; pools.power += o * (1 - w);
  }
  return pools;
}
// What one utility lot earns its owner (pid) in a night.
export function utilityIncome(s, lot, pools, pid) {
  const power = lot.name.startsWith('Volt');
  const sameKind = s.lots.filter(l => l.kind === 'utility' && l.name.startsWith('Volt') === power).length || 1;
  const kinds = new Set(s.lots.filter(l => l.kind === 'utility' && l.owner === pid).map(l => l.name.startsWith('Volt')));
  const cut = (power ? UTILITY_CUT.power : UTILITY_CUT.water) * (kinds.size > 1 ? UTILITY_CUT.both : 1);
  return (power ? pools.power : pools.water) * cut / sameKind;
}

// The nightly utilities bill for a business: power + water.
export function billFor(def, floors = 1) {
  return (OVERHEAD_BASE + def.cost * OVERHEAD_RATE) * (BIZ_UTIL[def.id]?.[0] ?? 1) * (1 + 0.4 * ((floors || 1) - 1));
}

// ------------------------------------------------------------ clock ----
// Advances one game hour. hooks.onHour / hooks.onDay let the AI act.
export function stepHour(s, hooks = {}) {
  if (s.over) return;
  runHour(s, s.hour);
  s.hour = (s.hour + 1) % 24;
  if (s.hour === 0) endOfDay(s, hooks);
  checkGoals(s);
  if (!s.over && hooks.onHour) hooks.onHour(s);
}

function freshBizDay() {
  return { cust: 0, turned: 0, rev: 0, cost: 0, peak: 0, rent: 0, waste: 0, delivered: 0, outHours: 0, fb: {}, seg: [0, 0, 0, 0], from: {}, led: {}, stockH: [] };
}

// A business's own books: every money movement it causes, by category.
export function bizBook(b, cat, amt) {
  const led = b.today.led || (b.today.led = {});
  led[cat] = (led[cat] || 0) + amt;
}
export const BIZ_LEDGER = {
  sales: 'Sales', goods: 'Stock deliveries', storage: 'Storage', wages: 'Wages', staffx: 'Training & severance',
  rent: 'Ground rent', bills: 'Power & water bills', marketing: 'Advertising',
};
// Keep this many days of history per business and per company.
export const HISTORY_DAYS = 60;

export function deliver(s, lot) {
  const b = lot.business, def = BIZ[b.type];
  const target = b.autoStock ? autoTarget(b) : b.stockTarget;
  const order = Math.max(0, Math.round(target - b.stock));
  if (!order) return 0;
  const value = order * unitCost(def) * (1 - (b.bulk || 0)) * (b.autoStock ? 1 + AUTO_STOCK_PREMIUM : 1);
  const cost = hooks.buyGoods ? hooks.buyGoods(s, lot, value) : value * marketIdx(s, b.type);
  ledger(s.players[b.owner], 'goods', -cost);
  bizBook(b, 'goods', -cost);
  b.stock += order;
  b.today.cost += cost;
  b.today.delivered += order;
  return cost;
}
export function autoTarget(b) {
  const y = b.yesterday;
  const base = y ? y.cust + y.turned * 0.5 : b.stockTarget;
  return Math.max(16, Math.round(base * 1.15 / 4) * 4);
}

export function runHour(s, h) {
  if (h === DELIVERY_HOUR) for (const l of s.lots) if (l.business) deliver(s, l);
  // Stock clerks top the shelves up again at lunchtime.
  if (h === 13) for (const l of s.lots) if (l.business && clerks(l.business)) deliver(s, l);
  const visits = citizensHour(s, h);
  s.lastHour = {};
  for (const l of s.lots) {
    const b = l.business;
    if (!b || !bizOpen(b, h)) continue;
    const def = BIZ[b.type];
    const p = s.players[b.owner];
    const v = visits.get(l.id) || { cust: 0, turned: 0 };
    const rev = v.cust * def.ticket * b.price;
    const wages = teamWage(b);
    ledger(p, 'sales', rev);
    ledger(p, 'wages', -wages);
    bizBook(b, 'sales', rev);
    bizBook(b, 'wages', -wages);
    const t = b.today;
    t.cust += v.cust; t.turned += v.turned;
    t.rev += rev; t.cost += wages;
    t.peak = Math.max(t.peak, (v.cust + v.turned) / capacity(b));
    if (b.stock < 4) t.outHours++;
    s.cityCustomersToday += v.cust;
    s.lastHour[l.id] = rev - wages;
  }
  // Shelf level at the end of every hour, for the stock chart.
  for (const l of s.lots) if (l.business) (l.business.today.stockH ||= [])[h] = Math.round(l.business.stock);
}

function endOfDay(s, hooks) {
  const P = s.players;
  // Ground rent, overheads, spoilage and storage.
  const pools = { power: 0, water: 0 };
  for (const l of s.lots) {
    const b = l.business;
    if (!b) continue;
    const def = BIZ[b.type];
    const tenant = P[b.owner];
    if (l.owner !== b.owner) {
      const r = rentFor(s, l);
      ledger(tenant, 'rentPaid', -r);
      bizBook(b, 'rent', -r);
      b.today.rent = r;
      b.today.cost += r;
      if (l.owner >= 0) ledger(P[l.owner], 'rentIn', r);
    }
    const o = billFor(def, b.floors);
    ledger(tenant, 'overhead', -o);
    bizBook(b, 'bills', -o);
    b.today.cost += o;
    const water = BIZ_UTIL[def.id]?.[1] ?? 0.3;
    pools.water += o * water;
    pools.power += o * (1 - water);
    if (def.perish > 0 && b.stock > 0) {
      // Stock clerks rotate the shelves: less goes off.
      const lost = Math.floor(b.stock * def.perish * (1 - Math.min(0.6, 0.3 * clerks(b))));
      b.stock -= lost;
      b.today.waste = lost;
      b.today.wasteV = lost * unitCost(def);
    } else if (b.stock > 0) {
      const hold = b.stock * unitCost(def) * HOLD_COST;
      ledger(tenant, 'storage', -hold);
      bizBook(b, 'storage', -hold);
      b.today.cost += hold;
    }
    // Reputation follows service: full shelves and short queues build it.
    const asked = b.today.cust + b.today.turned;
    if (asked > 0) {
      const served = b.today.cust / asked;
      b.rep = Math.max(0.7, Math.min(1.4, (b.rep ?? 1) + 0.1 * (served - 0.85) - (b.price > 1.35 ? 0.008 : 0)));
    }
  }
  // Utilities take a cut of everyone's bills; stations collect fares.
  for (const p of P) {
    if (p.bankrupt) continue;
    // Volt Works takes a cut of every power bill, Clearwater of every water bill.
    const utils = s.lots.filter(l => l.kind === 'utility' && l.owner === p.id);
    for (const u of utils) ledger(p, 'utility', utilityIncome(s, u, pools, p.id));
    const stations = s.lots.filter(l => l.kind === 'station' && l.owner === p.id).length;
    if (stations) ledger(p, 'fares', stationFare(stations) * stations * (p.perks?.fares || 1) * (0.7 + 0.3 * s.touristMult) * (1 + 0.004 * (s.day - 1)));
  }
  for (const l of s.lots) if (l.apt > 0 && l.owner >= 0) ledger(P[l.owner], 'aptRent', aptRentFor(s, l));
  for (const p of P) if (p.loan > 0) ledger(p, 'interest', -p.loan * LOAN_RATE * (p.perks?.loanRate || 1));

  // Close the books on the day.
  for (const l of s.lots) {
    const b = l.business;
    if (!b) continue;
    b.yesterday = b.today;
    // One row of history per day: the shop's books and its vital signs.
    const t = b.today;
    let good = 0, said = 0;
    for (const [k, v] of Object.entries(t.fb || {})) { said += v; if (k === 'great' || k === 'happy') good += v; }
    (b.days ||= []).push({
      d: s.day, cust: Math.round(t.cust), turned: Math.round(t.turned), rev: Math.round(t.rev), cost: Math.round(t.cost),
      profit: Math.round(t.rev - t.cost), led: Object.fromEntries(Object.entries(t.led || {}).map(([k, v]) => [k, Math.round(v)])),
      stock: Math.round(b.stock), deliv: Math.round(t.delivered), waste: Math.round(t.waste || 0), wasteV: Math.round(t.wasteV || 0),
      peak: Math.round(t.peak * 100) / 100, price: b.price, ticket: t.cust ? Math.round(t.rev / t.cust * 100) / 100 : 0,
      staff: b.team ? b.team.length : b.staff, wage: Math.round(teamWage(b)), morale: Math.round(avgMorale(b) * 100) / 100,
      rep: Math.round((b.rep ?? 1) * 100) / 100, happy: said ? Math.round(good / said * 100) / 100 : null, hours: b.len,
    });
    if (b.days.length > HISTORY_DAYS) b.days.shift();
    b.hist.push(Math.round(b.today.rev - b.today.cost));
    if (b.hist.length > 14) b.hist.shift();
    // What customers say about the shop, remembered over a few days.
    b.fb = b.fb || {};
    for (const k in b.fb) { b.fb[k] *= 0.6; if (b.fb[k] < 2) delete b.fb[k]; }
    for (const k in b.today.fb) b.fb[k] = (b.fb[k] || 0) + b.today.fb[k];
    if (b.promo && b.promo.until <= s.day) b.promo = null;
    for (const name of staffNight(s, b)) news(s, `${name} quit your ${bizLabel(s, b.type)} on ${l.name}. Morale was too low.`, 'staff', b.owner);
    b.today = freshBizDay();
  }
  s.cityCustomersYesterday = s.cityCustomersToday;
  s.cityCustomersToday = 0;
  s.cz.visitsToday = 0;
  for (const ch of s.chatter) for (const k in ch) { ch[k] *= 0.5; if (ch[k] < 4) delete ch[k]; }

  if (hooks.onDay) hooks.onDay(s);   // AI reprices, trades, liquidates

  for (const p of P) {
    p.profitHist = p.profitHist || [];
    p.profitHist.push(Math.round(operating(p.today)));
    if (p.profitHist.length > 60) p.profitHist.shift();
    (p.days ||= []).push({
      d: s.day, cash: Math.round(p.cash), loan: p.loan, worth: netWorth(s, p.id), op: Math.round(operating(p.today)),
      led: Object.fromEntries(Object.entries(p.today).map(([k, v]) => [k, Math.round(v)])),
      shops: s.lots.filter(l => l.business && l.business.owner === p.id).length, lots: s.lots.filter(l => l.owner === p.id).length,
    });
    if (p.days.length > HISTORY_DAYS) p.days.shift();
    p.yesterday = p.today;
    p.today = {};
    p.worthHist.push(netWorth(s, p.id));
    if (p.worthHist.length > 150) p.worthHist.shift();
  }

  const yearBefore = yearOf(s);
  s.day++;
  if (yearOf(s) !== yearBefore) newYear(s);
  solvency(s);
  tickEvents(s);
  refreshMods(s);
  syncTourists(s);
  checkEnd(s);
}

function newYear(s) {
  const y = yearOf(s);
  for (const t of TECH) if (t.year === y) news(s, `📅 ${y}: ${t.text}`, 'tech');
  const era = eraName(y);
  if (eraName(y - 1) !== era) news(s, `A new era dawns: the ${era}.`, 'tech');
  // Shops get their era-appropriate names as fashions change.
  for (const def of BUSINESSES) for (const [yr, nm] of def.names) if (yr === y && yr !== def.year) news(s, `${y}: the ${bizName(def, y - 1)} is now the ${nm}.`, 'info');
}

function solvency(s) {
  for (const p of s.players) {
    if (p.bankrupt) continue;
    if (p.cash >= 0) { p.debtDays = 0; continue; }
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
    if (l.owner === p.id) { returnToCity(s, l); }
  }
  s.offers = s.offers.filter(o => o.from !== p.id);
  syncResidents(s);
  news(s, `${p.company} has gone bankrupt! Its land goes back on the auction block.`, 'bad', p.id);
}

function returnToCity(s, lot) {
  lot.owner = -1; lot.apt = 0; lot.aptInvested = 0; lot.supplier = null;
  if (!s.auctionQueue.includes(lot.id)) s.auctionQueue.push(lot.id);
}

function tickEvents(s) {
  for (const e of s.events) e.left--;
  s.events = s.events.filter(e => e.left > 0);
  if (s.events.length < 2 && rand(s) < 0.5) {
    const y = yearOf(s);
    const pool = EVENTS.filter(e => (!e.from || y >= e.from) && (!e.to || y <= e.to));
    const total = pool.reduce((a, e) => a + e.weight, 0);
    let r = rand(s) * total, def = pool[0];
    for (const e of pool) { r -= e.weight; if (r <= 0) { def = e; break; } }
    if (s.events.some(e => e.id === def.id)) return;
    const len = def.days[0] + Math.floor(rand(s) * (def.days[1] - def.days[0] + 1));
    const e = { id: def.id, left: len, district: -1, tourists: def.tourists || 0 };
    if (def.district) e.district = Math.floor(rand(s) * DISTRICTS.length);
    if (def.land) s.landMod = Math.min(1.5, Math.max(0.75, s.landMod * def.land));
    s.events.push(e);
    news(s, def.text(e.district >= 0 ? DISTRICTS[e.district].name : ''), 'event');
  }
}

// ------------------------------------------------------------ goals ----
// Scenario goals are shared templates; each human tracks their own progress.
export function goalProgress(s, g, me = 0) {
  const own = s.lots.filter(l => l.owner === me);
  const v = ({
    biz: () => s.lots.filter(l => l.business && l.business.owner === me).length,
    lots: () => own.length,
    sets: () => setsOwned(s, me),
    apt: () => own.reduce((a, l) => a + l.apt, 0),
    tower: () => own.filter(l => l.apt === MAX_APT).length,
    worth: () => netWorth(s, me),
    profit: () => operating(s.players[me].yesterday),
    customers: () => s.lots.filter(l => l.business && l.business.owner === me)
      .reduce((a, l) => a + (l.business.yesterday ? l.business.yesterday.cust : 0), 0),
    stations: () => own.filter(l => l.kind === 'station').length,
  })[g.type]();
  return Math.round(v);
}
export const goalText = g => GOAL_TEXT[g.type](g.n);
export const humans = s => s.players.filter(p => p.human);

function checkGoals(s) {
  if (s.over || s.freePlay || !s.goals.length) return;
  const people = humans(s);
  for (const p of people) {
    if (p.failed || p.bankrupt) continue;
    s.goals.forEach((g, i) => {
      const st = p.goals[i];
      if (st.done || p.failed) return;
      if (goalProgress(s, g, p.id) >= g.n) {
        st.done = true; st.doneDay = s.day;
        news(s, `🎯 ${people.length > 1 ? p.company + ': ' : 'Goal complete: '}${goalText(g)}!`, 'goal', people.length > 1 ? -1 : p.id);
      } else if (s.day > g.by) {
        p.failed = true;
        if (people.length > 1) news(s, `${p.company} missed "${goalText(g)}" and is out of the running.`, 'bad', p.id);
        else p.failReason = `You missed a goal: "${goalText(g)}" by day ${g.by}.`;
      }
    });
    if (!p.failed && p.goals.every(x => x.done)) {
      return finish(s, p.id, people.length > 1 ? `${p.company} met every milestone first!` : `Every milestone met. ${SCENARIOS[s.scenario].name} complete!`);
    }
  }
  if (people.every(p => p.failed || p.bankrupt)) {
    finish(s, -1, people.length > 1 ? 'Every player missed a milestone.' : people[0].failReason || 'You missed a milestone.');
  }
}

function checkEnd(s) {
  const sc = SCENARIOS[s.scenario];
  const people = humans(s);
  if (people.every(p => p.bankrupt)) return finish(s, -1, people.length > 1 ? 'Every player went bankrupt.' : 'You went bankrupt.');
  if (s.freePlay) return;              // after "keep playing": no more deadlines
  const alive = s.players.filter(p => !p.bankrupt);
  if (alive.length === 1 && sc.mode === 'race') return finish(s, alive[0].id, 'Every rival has gone bust.');
  if (sc.mode !== 'race') return;
  const worth = s.players.map(p => p.bankrupt ? -Infinity : netWorth(s, p.id));
  const best = worth.indexOf(Math.max(...worth));
  if (worth[best] >= raceGoal(s)) return finish(s, best, `${s.players[best].company} reached ${money(raceGoal(s))} first.`);
  if (s.day > sc.days) return finish(s, best, `Time is up after ${sc.days} days. Richest tycoon wins.`);
}
// Carry on after a win or loss: no more goals or deadlines. Bankrupt
// players get a fresh start with half the usual starting cash.
export function continueGame(s) {
  if (!s.over) return fail('The game is still on.');
  s.result = { winner: s.winner, reason: s.endReason, day: s.day };
  s.over = false;
  s.freePlay = true;
  for (const p of s.players) {
    if (!p.human || !p.bankrupt) continue;
    p.bankrupt = false; p.cash = Math.round(START_CASH / 2); p.loan = 0; p.debtDays = 0;
    news(s, `${p.company} is back in business with fresh backing of ${money(p.cash)}.`, 'info', p.id);
  }
  news(s, 'The game goes on in free play. Build whatever you like.', 'info');
  return { ok: true };
}

// Race targets grow with the map: more city, more money to be made.
export const raceGoal = s => Math.round(SCENARIOS[s.scenario].goal * (MAPS[s.mapId || 'town']?.goalMult || 1) / 50000) * 50000;

function finish(s, winner, reason) {
  if (s.over) return;
  s.over = true; s.winner = winner; s.endReason = reason;
}

// ---------------------------------------------------------- actions ----
// Every action returns { ok, msg } so the UI and the AI share the same rules.
const fail = msg => ({ ok: false, msg });

// Hands a lot to its auction winner.
export function grantLand(s, pid, lotId, price) {
  const p = s.players[pid], lot = s.lots[lotId];
  ledger(p, 'capex', -price);
  lot.owner = pid;
  lot.unsold = 0;
  s.auctionQueue = s.auctionQueue.filter(id => id !== lotId);
  const done = lot.kind === 'prop' && ownsSet(s, pid, lot.district);
  news(s, `🔨 ${p.company} won ${lot.name} at auction for ${money(price)}.` +
    (done ? ` That completes the ${DISTRICTS[lot.district].name} set!` : ''), done ? 'set' : 'deal', pid);
  return done;
}

// Ask the city to put a lot up next.
export function petition(s, lotId) {
  const lot = s.lots[lotId];
  if (lot.owner !== -1) return fail('That lot is not the city\'s to sell.');
  s.auctionQueue = [lotId, ...s.auctionQueue.filter(id => id !== lotId)];
  return { ok: true, msg: `${lot.name} goes under the hammer at the next auction.` };
}
export function nextAuctionSlot(s) {
  const slots = [9, 13, 17];
  const h = slots.find(x => x > s.hour) ?? slots[0];
  return { hour: h, tomorrow: h <= s.hour };
}

export function sellLand(s, pid, lotId) {
  const p = s.players[pid], lot = s.lots[lotId];
  if (lot.owner !== pid) return fail('You do not own this.');
  if (lockedLot(lot)) return fail(lot.supplier ? 'Close the supplier first.' : 'A landmark stands here: it cannot be sold.');
  const value = Math.round(landValue(s, lot) * SELL_LAND_RATE + lot.aptInvested * 0.5);
  ledger(p, 'capex', value);
  returnToCity(s, lot);
  syncResidents(s);
  s.offers = s.offers.filter(o => o.lotId !== lotId);
  news(s, `${p.company} sold ${lot.name} back to the city. It will be auctioned again.`, 'deal', pid);
  return { ok: true, msg: `Sold for ${money(value)}.` };
}

export function canBuild(s, lotId) {
  const lot = s.lots[lotId];
  return lot.kind === 'prop' && !lot.business && !lockedLot(lot);
}

export function build(s, pid, lotId, type, cfg = {}) {
  const p = s.players[pid], lot = s.lots[lotId], def = BIZ[type];
  if (!canBuild(s, lotId)) return fail('Lot is not free.');
  if (!canTech(s, pid, type)) return fail(`Not invented yet: arrives in ${def.year}.`);
  const conf = { ...newBizConfig(def), ...cfg };
  conf.floors = Math.max(1, Math.min(MAX_FLOORS, Math.round(conf.floors || 1)));
  const cost = buildCost(def, conf.floors);
  if (p.cash < cost) return fail(`Need ${money(cost)}.`);
  const est = estimate(s, lotId, type, pid, conf);
  ledger(p, 'capex', -cost);
  const b = lot.business = {
    type, owner: pid, ...conf, rep: 1, promo: null, fb: {},
    stock: 0, stockTarget: Math.max(16, Math.round(est.cust * 0.9 / 4) * 4), autoStock: cfg.autoStock ?? true,
    invested: cost, opened: s.day, today: freshBizDay(), yesterday: null, hist: [],
  };
  b.team = Array.from({ length: conf.staff }, () => makeStaff(s, type, 'server', 0.75 + rand(s) * 0.35));
  syncHeadcount(b);
  refreshCandidates(s, b);
  deliver(s, lot);                       // opening stock arrives with the builders
  news(s, `${p.company} opened a ${bizLabel(s, type)} on ${lot.name}.`, 'build', pid);
  return { ok: true, msg: `${bizLabel(s, type)} is open for business!` };
}

export const buildCost = (def, floors = 1) => Math.round(def.cost * (1 + FLOOR_COST * ((floors || 1) - 1)) / 100) * 100;

export function sellBusiness(s, pid, lotId) {
  const p = s.players[pid], lot = s.lots[lotId], b = lot.business;
  if (!b || b.owner !== pid) return fail('Not your business.');
  const v = Math.round(b.invested * SELL_BIZ_RATE + b.stock * unitCost(BIZ[b.type]) * 0.5);
  ledger(p, 'capex', v);
  lot.business = null;
  news(s, `${p.company} closed its ${bizLabel(s, b.type)} on ${lot.name}.`, 'deal', pid);
  return { ok: true, msg: `Sold the fittings and stock for ${money(v)}.` };
}

const mine = (s, pid, lotId) => {
  const b = s.lots[lotId].business;
  return b && b.owner === pid ? b : null;
};
export function setPrice(s, pid, lotId, price) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  b.price = Math.round(Math.max(PRICE_MIN, Math.min(PRICE_MAX, price)) * 100) / 100;
  return { ok: true };
}
// Quick staffing: hire the best-value candidate or let the weakest server go
// until the shop has this many servers.
export function setStaff(s, pid, lotId, count) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  count = Math.max(1, Math.min(maxStaff(b), count));
  let msg = '';
  while (servers(b) < count && b.team.length < maxStaff(b)) {
    b.cands = b.cands && b.cands.length ? b.cands : [];
    let pick = b.cands.sort((x, y) => y.skill / y.pay - x.skill / x.pay)[0];
    if (pick) b.cands = b.cands.filter(c => c !== pick);
    else pick = makeStaff(s, b.type, 'server');
    pick.role = 'server';
    b.team.push(pick);
    msg = `Hired ${pick.name}.`;
  }
  while (servers(b) > count) {
    const worst = b.team.filter(m => m.role === 'server').sort((x, y) => x.skill - y.skill)[0];
    severance(s, b, worst);
    msg = `Let ${worst.name} go.`;
  }
  syncHeadcount(b);
  return { ok: true, msg };
}
function severance(s, b, m) {
  ledger(s.players[b.owner], 'wages', -m.pay * 10);
  bizBook(b, 'staffx', -m.pay * 10);
  b.team = b.team.filter(x => x !== m);
  for (const o of b.team) o.morale = Math.max(0, o.morale - 0.04);
}
const member = (b, sid) => b.team.find(m => m.id === sid);

export function hireStaff(s, pid, lotId, candId, role = 'server') {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  if (!STAFF_ROLES[role]) return fail('No such job.');
  const c = (b.cands || []).find(x => x.id === candId);
  if (!c) return fail('They took another job.');
  if (b.team.length >= maxStaff(b)) return fail(`No room: ${maxStaff(b)} staff max. Add a floor for more.`);
  if (role === 'manager' && manager(b)) return fail('The shop already has a manager.');
  b.cands = b.cands.filter(x => x !== c);
  c.pay = Math.round(c.pay * STAFF_ROLES[role].pay * 10) / 10;
  c.role = role;
  b.team.push(c);
  syncHeadcount(b);
  return { ok: true, msg: `${c.name} joins as ${STAFF_ROLES[role].name.toLowerCase()}.` };
}
export function fireStaff(s, pid, lotId, sid) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  const m = member(b, sid);
  if (!m) return fail('Not on the team.');
  if (b.team.length <= 1) return fail('Someone has to open the shop.');
  severance(s, b, m);
  syncHeadcount(b);
  return { ok: true, msg: `${m.name} has left (paid ${money(m.pay * 10)} severance).` };
}
export function trainStaff(s, pid, lotId, sid) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  const m = member(b, sid);
  if (!m) return fail('Not on the team.');
  if (m.train > 0) return fail('Already training.');
  if (m.skill >= 1.55) return fail('Nothing left to teach them.');
  const cost = Math.round(fairPay(b.type, m.role, m.skill) * 40);
  if (s.players[pid].cash < cost) return fail(`Need ${money(cost)}.`);
  ledger(s.players[pid], 'wages', -cost);
  bizBook(b, 'staffx', -cost);
  m.train = TRAIN_DAYS;
  return { ok: true, msg: `${m.name} is on a course for ${TRAIN_DAYS} days (${money(cost)}).` };
}
export function trainCost(b, m) { return Math.round(fairPay(b.type, m.role, m.skill) * 40); }
export function raiseStaff(s, pid, lotId, sid) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  const m = member(b, sid);
  if (!m) return fail('Not on the team.');
  if (m.pay > fairPay(b.type, m.role, m.skill) * 1.6) return fail('They are already very well paid.');
  m.pay = Math.round(m.pay * 1.1 * 10) / 10;
  m.morale = Math.min(1, m.morale + 0.12);
  return { ok: true, msg: `${m.name} now earns ${money(m.pay)}/hr.` };
}
export function setRole(s, pid, lotId, sid, role) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  const m = member(b, sid);
  if (!m || !STAFF_ROLES[role]) return fail('Not on the team.');
  if (role === 'manager' && manager(b) && manager(b) !== m) return fail('The shop already has a manager.');
  const before = fairPay(b.type, m.role, m.skill);
  m.pay = Math.round(m.pay * fairPay(b.type, role, m.skill) / before * 10) / 10;
  if (role === 'manager') m.morale = Math.min(1, m.morale + 0.15);
  m.role = role;
  syncHeadcount(b);
  return { ok: true, msg: `${m.name} is now ${role === 'manager' ? 'the manager' : 'a ' + STAFF_ROLES[role].name.toLowerCase()}.` };
}

// Extra shop floors: more capacity, more staff, more stock room.
export function floorCost(b) { return Math.round(BIZ[b.type].cost * FLOOR_COST / 100) * 100; }
export function addFloor(s, pid, lotId) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  if ((b.floors || 1) >= MAX_FLOORS) return fail(`${MAX_FLOORS} shop floors is the most a shop can have.`);
  const c = floorCost(b);
  if (s.players[pid].cash < c) return fail(`Need ${money(c)}.`);
  ledger(s.players[pid], 'capex', -c);
  b.floors = (b.floors || 1) + 1;
  b.invested += c;
  return { ok: true, msg: `Floor ${b.floors} open: more room for customers and staff.` };
}

// Marketing campaigns.
export function promoCost(b, promo) { return Math.round(BIZ[b.type].cost * promo.cost / 50) * 50; }
export function startPromo(s, pid, lotId, id) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  const pr = PROMOS.find(x => x.id === id);
  if (!pr) return fail('No such campaign.');
  if (yearOf(s) < pr.year) return fail(`${pr.name} arrives in ${pr.year}.`);
  if (b.promo) return fail('A campaign is already running.');
  const perks = s.players[pid].perks || {};
  const c = Math.round(promoCost(b, pr) * (perks.promo || 1));
  if (s.players[pid].cash < c) return fail(`Need ${money(c)}.`);
  ledger(s.players[pid], 'overhead', -c);
  bizBook(b, 'marketing', -c);
  b.today.cost += c;
  const days = Math.round(pr.days * (perks.promoDays || 1));
  b.promo = { id, boost: pr.boost, until: s.day + days - 1 };
  return { ok: true, msg: `${pr.icon} ${pr.name} running for ${days} days.` };
}

// Parks: whoever holds at least half a block can landscape its open tiles.
export function parkSlots(s, d) {
  const blk = MAP.distBlock[d];
  const out = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const t = MAP.tiles[blk.by + dy][blk.bx + dx];
    if (t.kind === 'plaza') out.push([t.x, t.y]);
  }
  return out;
}
export function canLandscape(s, pid, d) {
  return setCount(s, pid, d) * 2 >= MAP.districtLots[d].length;
}
export function buildPark(s, pid, d, type) {
  const pk = PARKS.find(x => x.id === type);
  if (!pk || d < 0 || d >= DISTRICTS.length) return fail('No such park.');
  if (yearOf(s) < pk.year) return fail(`${pk.name}s arrive in ${pk.year}.`);
  if (!canLandscape(s, pid, d)) return fail('You must own at least half the block to landscape it.');
  s.parks = s.parks || [];
  const used = new Set(s.parks.filter(p => p.d === d).map(p => p.x + ',' + p.y));
  const slot = parkSlots(s, d).find(([x, y]) => !used.has(x + ',' + y));
  if (!slot) {
    // Replace the block's weakest park if this one is better.
    const weakest = s.parks.filter(p => p.d === d).sort((a, b) => PARKS.findIndex(x => x.id === a.type) - PARKS.findIndex(x => x.id === b.type))[0];
    if (!weakest || PARKS.findIndex(x => x.id === weakest.type) >= PARKS.indexOf(pk)) return fail('No open space left on this block.');
    s.parks = s.parks.filter(p => p !== weakest);
    return buildPark(s, pid, d, type);
  }
  if (s.players[pid].cash < pk.cost) return fail(`Need ${money(pk.cost)}.`);
  ledger(s.players[pid], 'capex', -pk.cost);
  s.parks.push({ d, x: slot[0], y: slot[1], type, owner: pid, day: s.day });
  const g = claimGrant(s, pid, 'parks', d, pk.cost);
  news(s, `${s.players[pid].company} built a ${pk.name.toLowerCase()} in ${DISTRICTS[d].name}. ${pk.icon}`, 'build', pid);
  return { ok: true, msg: `${pk.icon} ${pk.name} built: ${DISTRICTS[d].name} now has ${blockStars(s, d)} stars.${g ? ` The city paid ${money(g)} of it.` : ''}` };
}

// Landlords may buy out a rival's shop standing on their land.
export function buyoutPrice(s, lot) {
  const b = lot.business;
  if (!b) return 0;
  const mult = ownsSet(s, lot.owner, lot.district) ? BUYOUT_SET_MULT : BUYOUT_MULT;
  return Math.round((b.invested * 0.6 * mult + b.stock * unitCost(BIZ[b.type])) / 100) * 100;
}
export function buyout(s, pid, lotId) {
  const lot = s.lots[lotId], b = lot.business;
  if (!b || b.owner === pid) return fail('Nothing to buy out.');
  if (lot.owner !== pid) return fail('You can only buy out shops on your own land.');
  const price = buyoutPrice(s, lot);
  if (s.players[pid].cash < price) return fail(`Need ${money(price)}.`);
  const seller = s.players[b.owner];
  ledger(s.players[pid], 'trade', -price);
  ledger(seller, 'trade', price);
  b.owner = pid;
  b.invested = Math.round(price * 0.8);
  for (const m of b.team) m.morale = Math.max(0, m.morale - 0.1);
  news(s, `${s.players[pid].company} bought out ${seller.company}'s ${bizLabel(s, b.type)} on ${lot.name} for ${money(price)}.`, 'deal', pid);
  if (seller.human) news(s, `${s.players[pid].company} bought out your ${bizLabel(s, b.type)} on ${lot.name}. You received ${money(price)}.`, 'staff', seller.id);
  return { ok: true, msg: `It's yours: ${bizLabel(s, b.type)} bought for ${money(price)}.` };
}

// Market research: what would do best on this block, and what people miss.
export function survey(s, pid, d) {
  if (d < 0 || d >= DISTRICTS.length) return fail('No such block.');
  const fee = s.players[pid].perks?.freeSurvey ? 0 : SURVEY_COST;
  if (s.players[pid].cash < fee) return fail(`Need ${money(fee)}.`);
  if (fee) ledger(s.players[pid], 'overhead', -fee);
  const tech = techOf(s);
  const ids = MAP.districtLots[d];
  const probe = ids.find(id => !s.lots[id].business) ?? ids[0];
  const items = BUSINESSES.filter(def => tech.biz.has(def.id)).map(def => {
    let e;
    const saved = s.lots[probe].business;
    s.lots[probe].business = null;
    try { e = estimate(s, probe, def.id, pid, {}); } finally { s.lots[probe].business = saved; }
    let wanted = 0;
    for (const [k, v] of Object.entries(s.chatter[d] || {})) if (k.endsWith('|' + def.id)) wanted += v;
    const rivals = s.lots.filter(l => l.business && l.business.type === def.id && MAP.neighbours[d].some(n => n.d === l.district && n.w >= 0.3)).length;
    return { type: def.id, cust: Math.round(e.cust), profit: Math.round(e.profit), wanted: Math.round(wanted), rivals };
  }).sort((a, b) => b.profit - a.profit);
  s.surveys = s.surveys || {};
  (s.surveys[pid] ||= {})[d] = { day: s.day, until: s.day + SURVEY_DAYS, items };
  return { ok: true, msg: `Survey of ${DISTRICTS[d].name} is in.` };
}
export function setHours(s, pid, lotId, from, len) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  b.from = ((from % 24) + 24) % 24;
  b.len = Math.max(2, Math.min(24, len));
  return { ok: true };
}
export function setStock(s, pid, lotId, target, auto) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  if (auto !== undefined) b.autoStock = auto;
  if (target !== undefined) b.stockTarget = Math.max(0, Math.min(5000, Math.round(target)));
  return { ok: true };
}
// Emergency delivery right now, at a 25% rush premium.
export function rushDelivery(s, pid, lotId) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  const def = BIZ[b.type];
  const target = b.autoStock ? autoTarget(b) : b.stockTarget;
  const order = Math.max(0, Math.round(target - b.stock));
  if (!order) return fail('Shelves are already full.');
  const cost = order * goodsUnit(b, s) * 1.25;
  if (s.players[pid].cash < cost) return fail(`Need ${money(cost)}.`);
  ledger(s.players[pid], 'goods', -cost);
  bizBook(b, 'goods', -cost);
  b.stock += order;
  b.today.cost += cost;
  b.today.delivered += order;
  return { ok: true, msg: `Rush delivery: ${order} units for ${money(cost)}.` };
}

export function fitCost(b) {
  if (b.fit >= FIT_LEVELS.length - 1) return 0;
  const def = BIZ[b.type];
  return Math.round(def.cost * (FIT_LEVELS[b.fit + 1].costMult - FIT_LEVELS[b.fit].costMult) / 100) * 100;
}
export function upgradeFit(s, pid, lotId) {
  const p = s.players[pid], b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  const c = fitCost(b);
  if (!c) return fail('Already a flagship.');
  if (b.fit + 1 > techOf(s).fit) return fail(`${FIT_LEVELS[b.fit + 1].name} fit-outs arrive in ${FIT_LEVELS[b.fit + 1].year}.`);
  if (p.cash < c) return fail(`Need ${money(c)}.`);
  ledger(p, 'capex', -c);
  b.fit++; b.invested += c;
  return { ok: true, msg: `Refitted to ${FIT_LEVELS[b.fit].name}.` };
}

// Apartments: any lot you own. Completing the colour set doubles their rent.
export function aptCheck(s, pid, lotId) {
  const lot = s.lots[lotId];
  if (lot.kind !== 'prop') return fail('Only district lots take apartments.');
  if (lot.owner !== pid) return fail('You must own the land.');
  if (lockedLot(lot)) return fail('A landmark stands here.');
  if (lot.apt >= MAX_APT) return fail('Already a Skyline Tower.');
  const maxNow = techOf(s).apt;
  if (lot.apt >= maxNow) {
    const next = TECH.find(t => t.apt === lot.apt + 1);
    return fail(`Building any higher needs new technology${next ? ` (${next.year})` : ''}.`);
  }
  return { ok: true, cost: aptCost(lot, lot.apt + 1) };
}
export function buildApt(s, pid, lotId) {
  const chk = aptCheck(s, pid, lotId);
  if (!chk.ok) return chk;
  const p = s.players[pid], lot = s.lots[lotId];
  if (p.cash < chk.cost) return fail(`Need ${money(chk.cost)}.`);
  ledger(p, 'capex', -chk.cost);
  lot.apt++; lot.aptInvested += chk.cost;
  syncResidents(s);
  const g = claimGrant(s, pid, 'housing', lot.district, 0);
  if (lot.apt === MAX_APT) news(s, `${p.company} topped out a Skyline Tower on ${lot.name}!`, 'set', pid);
  else if (!p.human) news(s, `${p.company} added apartments on ${lot.name}.`, 'build', pid);
  return { ok: true, msg: (lot.apt === MAX_APT ? 'Skyline Tower complete!' : `Now ${lot.apt * 2} floors of apartments.`) + (g ? ` Housing grant: +${money(g)}.` : '') };
}
export function sellApt(s, pid, lotId) {
  const p = s.players[pid], lot = s.lots[lotId];
  if (lot.owner !== pid || lot.apt <= 0) return fail('Nothing to demolish.');
  const c = aptCost(lot, lot.apt);
  ledger(p, 'capex', Math.round(c * 0.5));
  lot.apt--; lot.aptInvested = Math.max(0, lot.aptInvested - c);
  syncResidents(s);
  return { ok: true, msg: `Sold one level for ${money(c * 0.5)}.` };
}

// How much an owner wants for a lot (rival sellers use this).
export function askingPrice(s, sellerId, lotId, buyerId) {
  const lot = s.lots[lotId];
  let v = landValue(s, lot) + lot.aptInvested * 0.9;
  if (lot.kind === 'prop') {
    const n = MAP.districtLots[lot.district].length;
    const have = setCount(s, sellerId, lot.district);
    if (have === n) v *= 3.0;
    else if (have >= 2) v *= 1.6;
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

export function makeOffer(s, buyerId, lotId, amount) {
  const lot = s.lots[lotId], buyer = s.players[buyerId];
  if (lot.owner < 0 || lot.owner === buyerId) return fail('Nobody to buy from.');
  if (lockedLot(lot)) return fail('Landmarks are not for sale.');
  if (buyer.cash < amount) return fail(`You only have ${money(buyer.cash)}.`);
  const ask = askingPrice(s, lot.owner, lotId, buyerId);
  const seller = s.players[lot.owner];
  if (amount >= ask) {
    const done = transfer(s, buyerId, lot.owner, lotId, amount);
    return { ok: true, setComplete: done, msg: done ? `Deal! ${DISTRICTS[lot.district].name} set complete!` : `${seller.name} accepts. ${lot.name} is yours.` };
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

// Citizens are rebuilt on load rather than saved: it keeps saves small.
export function serialize(s) {
  return JSON.stringify(s, (k, v) => (k === 'cz' ? undefined : v));
}
export function deserialize(json) {
  const s = JSON.parse(json);
  if (!s || s.v !== 4 || !Array.isArray(s.lots)) throw new Error('bad save');
  setMap(s.mapId || 'town');
  buildCitizens(s);
  return s;
}

// City grants (housing drive, green spaces): pay whoever builds in time.
export function claimGrant(s, pid, type, d, cost) {
  const pr = (s.projects || []).find(x => x.type === type && x.state === 'open' && x.claimed < x.cap && (!x.route || x.route.includes(d)));
  if (!pr) return 0;
  const amt = Math.round(type === 'parks' ? cost * pr.amount : pr.amount);
  pr.claimed++;
  (pr.claims ||= {})[pid] = (pr.claims[pid] || 0) + amt;
  ledger(s.players[pid], 'projects', amt);
  if (pr.claimed >= pr.cap) { pr.state = 'done'; news(s, `${PROJECTS[type].icon} ${PROJECTS[type].name}: the city's budget is used up.`, 'info'); }
  return amt;
}
