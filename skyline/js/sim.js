// Skyline Hustle - the city simulation. Pure data in, pure data out: no DOM,
// so it runs identically in the browser and in headless Node tests.
//
// Time advances one game hour at a time. Each hour citizens decide where to
// spend (citizens.js) and shops pay wages; at 06:00 stock is delivered; at
// midnight rents, fares, utility cuts, apartment rents and interest settle,
// food spoils, reputations move, the calendar turns and goals are checked.
// Land is sold by the city at live auctions (auction.js).

import {
  DISTRICTS, SEG_ELASTICITY, STATION_FARE, UTILITY_CUT, BUSINESSES, BIZ, FIT_LEVELS, MAX_STAFF,
  APT_RESIDENTS, APT_RENT, APT_RENT_RATE, APT_COST_RATE, APT_SET_MULT, MAX_APT, DEMAND_SCALE,
  OUTSIDE_WEIGHT, ELASTICITY_BASE, RENT_RATE, SET_RENT_MULT, APT_SHOP_RENT, OVERHEAD_BASE, OVERHEAD_RATE,
  LAND_GROWTH_DAY, LAND_GROWTH_BIZ, LAND_GROWTH_APT, SELL_LAND_RATE, SELL_BIZ_RATE, LOAN_RATE, LOAN_STEP,
  LOAN_LTV, START_CASH, RIVALS, HUMAN_COLOR, SCENARIOS, DIFFICULTY, EVENTS, PRICE_MIN, PRICE_MAX,
  DELIVERY_HOUR, HOLD_COST, AUTO_STOCK_PREMIUM, TECH, YEAR_DAYS, GOAL_TEXT, bizName, eraName,
} from './data.js';
import { MAP, rand } from './map.js';
import { NAT, bizOpen, defaultHours, yearOf, techOf, modFor, capacity, appeal, unitCost } from './demand.js';
import { buildCitizens, syncResidents, syncTourists, touristsIn, citizensHour } from './citizens.js';

export { MAP, rand, yearOf, techOf, capacity, bizOpen };

// ------------------------------------------------------------ setup ----
export function createGame({ scenario = 'boomtown', difficulty = 'normal', name = 'You', company = 'Your Company', seed } = {}) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  const sc = SCENARIOS[scenario];
  const s = {
    v: 2,
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
    goals: (sc.goals || []).map(g => ({ ...g, done: false, doneDay: 0 })),
    over: false, winner: -1, endReason: '',
  };
  s.players.push(makePlayer(0, name || 'You', company || 'Your Company', HUMAN_COLOR, true, 'human', START_CASH));
  RIVALS.forEach((r, i) => s.players.push(makePlayer(i + 1, r.name, r.company, r.color, false, r.style,
    Math.round(START_CASH * diff.aiCash))));
  // The city auctions its land roughly cheapest first, with some shuffle.
  s.auctionQueue = s.lots.map(l => ({ id: l.id, k: l.basePrice * (0.6 + rand(s) * 0.9) }))
    .sort((a, b) => a.k - b.k).map(x => x.id);
  refreshMods(s);
  buildCitizens(s);
  news(s, `Welcome to ${yearOf(s)}, ${s.players[0].company}. ${sc.blurb}`, 'info');
  news(s, 'The city sells its land at live auctions at 9:00, 13:00 and 17:00. Open shops anywhere meanwhile.', 'info');
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
  trade: 'Land trades', capex: 'Building & land',
};
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
  return Math.round(lot.basePrice * APT_RENT_RATE * APT_RENT[lot.apt] * set * (1 + 0.004 * (s.day - 1)));
}

export function bizValue(b) { return Math.round(b.invested * 0.6 + b.stock * unitCost(BIZ[b.type]) * 0.5); }

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
  const byType = {};
  for (const l of s.lots) {
    const b = l.business;
    if (!b || (onlyType && b.type !== onlyType) || !bizOpen(b, h)) continue;
    (byType[b.type] ||= []).push(l);
  }
  const out = new Map();
  for (let d = 0; d < DISTRICTS.length; d++) {
    if (pools && !pools.has(d)) continue;
    const seg = segments(s, d);
    const neigh = MAP.neighbours[d];
    for (const type in byType) {
      if (!tech.biz.has(type)) continue;
      const def = BIZ[type];
      const k = DEMAND_SCALE * NAT[type][h] * modFor(s, def) / 1000;
      // Each wealth group weighs price differently, so split them.
      for (let g = 0; g < 4; g++) {
        const demand = seg[g] * def.app[g] * k;
        if (demand <= 0) continue;
        const el = ELASTICITY_BASE * SEG_ELASTICITY[g];
        let sum = 0;
        const ws = [];
        for (const l of byType[type]) {
          const n = neigh.find(x => x.d === l.district);
          if (!n) { ws.push(0); continue; }
          const a = n.w * appeal(l.business) * Math.pow(1 / l.business.price, el);
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
  }
  return out;
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
  return { price: 1, staff: 3, fit: 1, ...defaultHours(def) };
}

// What would this business make per day, right now? Temporarily installs
// it on the lot, runs 24 hours of the forecaster, restores. cfg overrides
// price / staff / fit / from / len.
export function estimate(s, lotId, type, ownerId, cfg = {}) {
  const lot = s.lots[lotId];
  const saved = lot.business;
  const def = BIZ[type];
  const base = saved && saved.type === type ? saved : newBizConfig(def);
  const b = {
    type, owner: ownerId, rep: saved?.type === type ? saved.rep : 1,
    price: cfg.price ?? base.price, staff: cfg.staff ?? base.staff, fit: cfg.fit ?? base.fit,
    from: cfg.from ?? base.from, len: cfg.len ?? base.len,
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
  const goods = cust * unitCost(def) * (1 + def.perish * 0.15);
  const wages = b.staff * def.wage * hours;
  const rent = lot.owner === ownerId ? 0 : rentFor(s, lot);
  const overhead = OVERHEAD_BASE + def.cost * OVERHEAD_RATE;
  return { cust, lost, rev, goods, wages, rent, overhead, hours, profit: rev - goods - wages - rent - overhead };
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

function freshBizDay() { return { cust: 0, turned: 0, rev: 0, cost: 0, peak: 0, rent: 0, waste: 0, delivered: 0, outHours: 0 }; }

export function deliver(s, lot) {
  const b = lot.business, def = BIZ[b.type];
  const target = b.autoStock ? autoTarget(b) : b.stockTarget;
  const order = Math.max(0, Math.round(target - b.stock));
  if (!order) return 0;
  const cost = order * unitCost(def) * (b.autoStock ? 1 + AUTO_STOCK_PREMIUM : 1);
  ledger(s.players[b.owner], 'goods', -cost);
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
  const visits = citizensHour(s, h);
  s.lastHour = {};
  for (const l of s.lots) {
    const b = l.business;
    if (!b || !bizOpen(b, h)) continue;
    const def = BIZ[b.type];
    const p = s.players[b.owner];
    const v = visits.get(l.id) || { cust: 0, turned: 0 };
    const rev = v.cust * def.ticket * b.price;
    const wages = b.staff * def.wage;
    ledger(p, 'sales', rev);
    ledger(p, 'wages', -wages);
    const t = b.today;
    t.cust += v.cust; t.turned += v.turned;
    t.rev += rev; t.cost += wages;
    t.peak = Math.max(t.peak, (v.cust + v.turned) / capacity(b));
    if (b.stock < 4) t.outHours++;
    s.cityCustomersToday += v.cust;
    s.lastHour[l.id] = rev - wages;
  }
}

function endOfDay(s, hooks) {
  const P = s.players;
  // Ground rent, overheads, spoilage and storage.
  let overheadPool = 0;
  for (const l of s.lots) {
    const b = l.business;
    if (!b) continue;
    const def = BIZ[b.type];
    const tenant = P[b.owner];
    if (l.owner !== b.owner) {
      const r = rentFor(s, l);
      ledger(tenant, 'rentPaid', -r);
      b.today.rent = r;
      b.today.cost += r;
      if (l.owner >= 0) ledger(P[l.owner], 'rentIn', r);
    }
    const o = OVERHEAD_BASE + def.cost * OVERHEAD_RATE;
    ledger(tenant, 'overhead', -o);
    b.today.cost += o;
    overheadPool += o;
    if (def.perish > 0 && b.stock > 0) {
      const lost = Math.floor(b.stock * def.perish);
      b.stock -= lost;
      b.today.waste = lost;
    } else if (b.stock > 0) {
      const hold = b.stock * unitCost(def) * HOLD_COST;
      ledger(tenant, 'storage', -hold);
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
    const utils = s.lots.filter(l => l.kind === 'utility' && l.owner === p.id).length;
    if (utils) ledger(p, 'utility', overheadPool * UTILITY_CUT[utils] * utils);
    const stations = s.lots.filter(l => l.kind === 'station' && l.owner === p.id).length;
    if (stations) ledger(p, 'fares', STATION_FARE[stations] * stations * (0.7 + 0.3 * s.touristMult) * (1 + 0.004 * (s.day - 1)));
  }
  for (const l of s.lots) if (l.apt > 0 && l.owner >= 0) ledger(P[l.owner], 'aptRent', aptRentFor(s, l));
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
  s.cz.visitsToday = 0;
  for (const ch of s.chatter) for (const k in ch) { ch[k] *= 0.5; if (ch[k] < 4) delete ch[k]; }

  if (hooks.onDay) hooks.onDay(s);   // AI reprices, trades, liquidates

  for (const p of P) {
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
  lot.owner = -1; lot.apt = 0; lot.aptInvested = 0;
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
export function goalProgress(s, g) {
  const me = 0;
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

function checkGoals(s) {
  if (s.over || !s.goals.length) return;
  for (const g of s.goals) {
    if (g.done) continue;
    if (goalProgress(s, g) >= g.n) {
      g.done = true; g.doneDay = s.day;
      news(s, `🎯 Goal complete: ${goalText(g)}!`, 'goal');
    } else if (s.day > g.by) {
      return finish(s, -1, `You missed a goal: "${goalText(g)}" by day ${g.by}.`);
    }
  }
  if (s.goals.every(g => g.done)) finish(s, 0, `Every milestone met. ${SCENARIOS[s.scenario].name} complete!`);
}

function checkEnd(s) {
  const sc = SCENARIOS[s.scenario];
  const me = s.players[0];
  if (me.bankrupt) return finish(s, -1, 'You went bankrupt.');
  const alive = s.players.filter(p => !p.bankrupt);
  if (alive.length === 1 && sc.mode === 'race') return finish(s, alive[0].id, 'Every rival has gone bust.');
  if (sc.mode !== 'race') return;
  const worth = s.players.map(p => p.bankrupt ? -Infinity : netWorth(s, p.id));
  const best = worth.indexOf(Math.max(...worth));
  if (worth[best] >= sc.goal) return finish(s, best, `${s.players[best].company} reached ${money(sc.goal)} first.`);
  if (s.day > sc.days) return finish(s, best, `Time is up after ${sc.days} days. Richest tycoon wins.`);
}
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
  return lot.kind === 'prop' && !lot.business;
}

export function build(s, pid, lotId, type, cfg = {}) {
  const p = s.players[pid], lot = s.lots[lotId], def = BIZ[type];
  if (!canBuild(s, lotId)) return fail('Lot is not free.');
  if (!techOf(s).biz.has(type)) return fail(`Not invented yet: arrives in ${def.year}.`);
  if (p.cash < def.cost) return fail(`Need ${money(def.cost)}.`);
  const conf = { ...newBizConfig(def), ...cfg };
  const est = estimate(s, lotId, type, pid, conf);
  ledger(p, 'capex', -def.cost);
  lot.business = {
    type, owner: pid, ...conf, rep: 1,
    stock: 0, stockTarget: Math.max(16, Math.round(est.cust * 0.9 / 4) * 4), autoStock: cfg.autoStock ?? true,
    invested: def.cost, opened: s.day, today: freshBizDay(), yesterday: null, hist: [],
  };
  deliver(s, lot);                       // opening stock arrives with the builders
  news(s, `${p.company} opened a ${bizLabel(s, type)} on ${lot.name}.`, 'build', pid);
  return { ok: true, msg: `${bizLabel(s, type)} is open for business!` };
}

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
export function setStaff(s, pid, lotId, staff) {
  const b = mine(s, pid, lotId);
  if (!b) return fail('Not your business.');
  b.staff = Math.max(1, Math.min(MAX_STAFF, staff));
  return { ok: true };
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
  const cost = order * unitCost(def) * 1.25;
  if (s.players[pid].cash < cost) return fail(`Need ${money(cost)}.`);
  ledger(s.players[pid], 'goods', -cost);
  b.stock += order;
  b.today.cost += cost;
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
  if (lot.apt === MAX_APT) news(s, `${p.company} topped out a Skyline Tower on ${lot.name}!`, 'set', pid);
  else if (!p.human) news(s, `${p.company} added apartments on ${lot.name}.`, 'build', pid);
  return { ok: true, msg: lot.apt === MAX_APT ? 'Skyline Tower complete!' : `Now ${lot.apt * 2} floors of apartments.` };
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
  if (!s || s.v !== 2 || !Array.isArray(s.lots)) throw new Error('bad save');
  buildCitizens(s);
  return s;
}
