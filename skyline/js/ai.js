// Skyline Hustle - rival tycoons. They play by exactly the same rules as
// the human: every move goes through the action functions in sim.js.
//
// Each rival thinks every few game hours. It scores every move it could
// make (open a business, build apartments, refit a busy shop) as expected
// daily return on the cash spent, tilts the scores by personality and takes
// the best one it can afford. Once a day it re-prices, re-staffs and
// re-times its shops, sells losers, and may try to buy the last lot it needs
// to complete a colour set. At auctions it bids up to what the lot is worth
// to it: more if it completes a set or blocks a rival's.

import { BUSINESSES, BIZ, DISTRICTS, DIFFICULTY, stationFare, UTILITY_CUT,
  OVERHEAD_BASE, OVERHEAD_RATE, APT_RESIDENTS, LOAN_STEP, PRICE_MIN, PRICE_MAX, PARKS, PROMOS } from './data.js';
import {
  MAP, rand, techOf, estimate, landValue, rentFor, ownsSet, setCount, netWorth, build, setPrice, setStaff,
  setHours, sellBusiness, upgradeFit, fitCost, aptCheck, buildApt, aptRentFor, askingPrice, transfer, sellLand,
  loanLimit, takeLoan, repayLoan, money, news, newBizConfig, yearOf, aptRentFor as aptRent, canLandscape, parkSlots,
  buildPark, buyoutPrice, buyout, startPromo, promoCost, hireStaff, setRole, raiseStaff, trainStaff, trainCost,
  utilityIncome, utilityPools,
} from './sim.js';
import { maxStaff, clerks, manager, avgMorale } from './staff.js';

const STYLE = {
  baron:   { build: 1.05, land: 1.2,  apt: 1.3, set: 1.5, price: [0.8, 1.35],  start: 1.0,  fit: 0.5, prefer: [] },
  cutter:  { build: 1.15, land: 1.0,  apt: 1.0, set: 1.1, price: [0.75, 1.2],  start: 0.9,  fit: 0.5, prefer: ['food'] },
  premium: { build: 1.0,  land: 0.8,  apt: 1.0, set: 1.0, price: [0.9, 1.45],  start: 1.1,  fit: 1.2, prefer: ['retail', 'leisure'] },
};

export function aiHour(s) {
  // Big maps: rivals plan half as often (there's more of them, and more to scan).
  const think = DIFFICULTY[s.difficulty].think * (MAP.lotDefs.length > 60 ? 2 : 1);
  for (const p of s.players) {
    if (p.human || p.bankrupt) continue;
    if ((s.hour + p.id * 3) % think === 0) think1(s, p);
  }
}

export function aiDay(s) {
  for (const p of s.players) {
    if (p.human || p.bankrupt) continue;
    if (rand(s) < DIFFICULTY[s.difficulty].tune) tune(s, p);
    liquidity(s, p);
    if (rand(s) < 0.45) tradeForSets(s, p);
  }
  s.offers = s.offers.filter(o => o.expires > s.day);
}

export function reserveFor(s, p) {
  return 3000 + 0.04 * Math.max(0, netWorth(s, p.id));
}

// ------------------------------------------------------------ think ----
function think1(s, p) {
  const st = STYLE[p.style];
  const reserve = reserveFor(s, p);
  const tech = techOf(s);
  const moves = [];

  // Open a business: every free lot x every invented business type.
  // On big maps look at a random handful of free lots each time.
  const free = sample(s, s.lots.filter(l => l.kind === 'prop' && !l.business), 14);
  for (const lot of free) {
    for (const def of shortlist(s, lot, tech)) {
      const cfg = { price: st.start, staff: 3 };
      const e = estimate(s, lot.id, def.id, p.id, cfg);
      if (e.profit <= 0) continue;
      let roi = e.profit / def.cost * st.build;
      if (st.prefer.includes(def.group)) roi *= 1.2;
      if (lot.owner === p.id) roi *= 1.1;
      moves.push({ roi, cost: def.cost, run: () => build(s, p.id, lot.id, def.id, cfg) });
    }
  }

  // Apartments on land it owns (a full set doubles the rent).
  for (const lot of s.lots) {
    if (lot.owner !== p.id || lot.kind !== 'prop') continue;
    const chk = aptCheck(s, p.id, lot.id);
    if (!chk.ok) continue;
    const before = aptRentFor(s, lot);
    lot.apt++; const after = aptRentFor(s, lot); lot.apt--;
    const residents = APT_RESIDENTS[lot.apt + 1] - APT_RESIDENTS[lot.apt];
    const gain = (after - before) + residents * 0.2 + (lot.business && lot.business.owner !== p.id ? rentFor(s, lot) * 0.2 : 0);
    const setBonus = ownsSet(s, p.id, lot.district) ? 1.2 : 0.8;
    moves.push({ roi: gain / chk.cost * st.apt * setBonus, cost: chk.cost, run: () => buildApt(s, p.id, lot.id) });
  }

  // Refit a busy shop (a few of its shops each time on big empires).
  const mineShops = sample(s, s.lots.filter(l => l.business && l.business.owner === p.id), 5);
  for (const lot of mineShops) {
    const b = lot.business;
    if (!b || b.owner !== p.id || !b.yesterday || b.fit >= tech.fit) continue;
    const c = fitCost(b);
    if (!c) continue;
    const e0 = estimate(s, lot.id, b.type, p.id, {});
    const e1 = estimate(s, lot.id, b.type, p.id, { fit: b.fit + 1 });
    const gain = (e1.profit - e0.profit) * st.fit;
    if (gain > 0) moves.push({ roi: gain / c, cost: c, run: () => upgradeFit(s, p.id, lot.id) });
  }

  // Landscape a block it controls: lifts rents, land values and custom.
  for (let d = 0; d < DISTRICTS.length; d++) {
    if (!canLandscape(s, p.id, d)) continue;
    const used = (s.parks || []).filter(x => x.d === d).length;
    if (used >= parkSlots(s, d).length) continue;
    const pk = [...PARKS].reverse().find(x => yearOf(s) >= x.year && x.cost < p.cash * 0.3);
    if (!pk) continue;
    let income = 0;
    for (const id of MAP.districtLots[d]) { const l = s.lots[id]; if (l.owner === p.id) income += aptRent(s, l) + (l.business && l.business.owner !== p.id ? rentFor(s, l) : 0) + landValue(s, l) * 0.004; }
    moves.push({ roi: pk.stars * income * 0.09 / pk.cost * st.land, cost: pk.cost, run: () => buildPark(s, p.id, d, pk.id) });
  }
  // Buy out a rival's shop on its own land.
  for (const lot of s.lots) {
    const b = lot.business;
    if (!b || lot.owner !== p.id || b.owner === p.id || s.players[b.owner].bankrupt) continue;
    const price = buyoutPrice(s, lot);
    const e = estimate(s, lot.id, b.type, p.id, {});
    const lostRent = rentFor(s, lot);
    if (e.profit - lostRent > 0) moves.push({ roi: (e.profit - lostRent) / price * (st.set > 1.2 ? 1.2 : 1), cost: price, run: () => buyout(s, p.id, lot.id) });
  }
  // Advertise a shop that has room for more customers.
  for (const lot of mineShops) {
    const b = lot.business;
    if (!b || b.owner !== p.id || b.promo || !b.yesterday || b.yesterday.peak > 0.85) continue;
    const pr = [...PROMOS].reverse().find(x => yearOf(s) >= x.year);
    const cost = promoCost(b, pr);
    const e0 = estimate(s, lot.id, b.type, p.id, {});
    b.promo = { boost: pr.boost };
    const e1 = estimate(s, lot.id, b.type, p.id, {});
    b.promo = null;
    const gain = (e1.profit - e0.profit) * pr.days;
    if (gain > cost * 1.2) moves.push({ roi: (gain / cost - 1) / pr.days * (p.style === 'premium' ? 1.3 : 1), cost, run: () => startPromo(s, p.id, lot.id, pr.id) });
  }

  const diff = DIFFICULTY[s.difficulty];
  moves.sort((a, b) => b.roi - a.roi);
  for (const m of moves.slice(0, 6)) {
    if (m.roi < diff.minRoi) break;
    if (p.cash - m.cost >= reserve) { m.run(); return; }
    const short = m.cost + reserve - p.cash;
    const room = loanLimit(s, p.id) - p.loan;
    if (diff.borrow && m.roi > 0.06 && short <= room && p.loan < 0.35 * Math.max(1, netWorth(s, p.id))) {
      takeLoan(s, p.id, Math.ceil(short / LOAN_STEP) * LOAN_STEP);
      m.run();
      return;
    }
  }
  if (p.loan > 0 && p.cash > reserve * 2 + LOAN_STEP) repayLoan(s, p.id, LOAN_STEP);
}

// ------------------------------------------------------------- tune ----
function tune(s, p) {
  const st = STYLE[p.style];
  for (const lot of s.lots) {
    const b = lot.business;
    if (!b || b.owner !== p.id || !b.yesterday) continue;
    // Compare like with like: head-count forecasts on both sides.
    let best = { staff: b.staff, price: b.price, len: b.len, profit: estimate(s, lot.id, b.type, p.id, { staff: b.staff }).profit };
    const tryCfg = cfg => {
      const e = estimate(s, lot.id, b.type, p.id, { staff: best.staff, price: best.price, len: best.len, ...cfg });
      if (e.profit > best.profit + 5) best = { staff: best.staff, price: best.price, len: best.len, ...cfg, profit: e.profit };
    };
    for (const ds of [-1, 1]) if (b.staff + ds >= 1 && b.staff + ds <= maxStaff(b)) tryCfg({ staff: b.staff + ds });
    for (const dp of [-0.1, 0.1]) {
      const price = Math.round((b.price + dp) * 100) / 100;
      if (price >= st.price[0] && price <= st.price[1] && price >= PRICE_MIN && price <= PRICE_MAX) tryCfg({ price });
    }
    for (const dl of [-2, 2]) if (b.len + dl >= 4 && b.len + dl <= 24) tryCfg({ len: b.len + dl });
    // Queues out of the door trump the spreadsheet: hire.
    const y = b.yesterday;
    if (y.turned > 0.1 * (y.cust + y.turned) && best.staff <= b.staff && b.team.length < maxStaff(b)) best.staff = b.staff + 1;
    setStaff(s, p.id, lot.id, best.staff);
    // People: a clerk when shelves run dry, a manager for bigger teams,
    // raises when morale sags, training for the best (premium style).
    if (y.outHours > 2 && !clerks(b) && b.team.length < maxStaff(b) && b.cands?.length) hireStaff(s, p.id, lot.id, b.cands[0].id, 'clerk');
    if (!manager(b) && b.team.length >= 4 && (b.hist.at(-1) || 0) > 300) {
      const star = [...b.team].sort((x, z) => z.skill - x.skill)[0];
      setRole(s, p.id, lot.id, star.id, 'manager');
    }
    if (avgMorale(b) < 0.45) for (const m of b.team) if (m.morale < 0.45) raiseStaff(s, p.id, lot.id, m.id);
    if (p.style === 'premium' && p.cash > 20000) {
      const pupil = b.team.find(m => !m.train && m.skill < 1.1);
      if (pupil && trainCost(b, pupil) < p.cash * 0.02) trainStaff(s, p.id, lot.id, pupil.id);
    }
    setPrice(s, p.id, lot.id, best.price);
    setHours(s, p.id, lot.id, b.from, best.len);
    const h = b.hist;
    if (h.length >= 4 && h.slice(-4).every(v => v < 0) && best.profit < 0) sellBusiness(s, p.id, lot.id);
  }
}

function liquidity(s, p) {
  if (p.cash >= 0) return;
  const room = loanLimit(s, p.id) - p.loan;
  const need = Math.ceil(-p.cash / LOAN_STEP) * LOAN_STEP;
  if (room >= need) { takeLoan(s, p.id, need); return; }
  const shops = s.lots.filter(l => l.business && l.business.owner === p.id)
    .sort((a, b) => sum(a.business.hist) - sum(b.business.hist));
  while (p.cash < 0 && shops.length) sellBusiness(s, p.id, shops.shift().id);
  const land = s.lots.filter(l => l.owner === p.id && !(l.kind === 'prop' && ownsSet(s, p.id, l.district)));
  while (p.cash < 0 && land.length) sellLand(s, p.id, land.shift().id);
}
const sum = a => a.reduce((x, y) => x + y, 0);
// Cheap first pass: the business types with the most local demand per
// existing competitor; only these get a full forecast.
function shortlist(s, lot, tech, n = 6) {
  const d = lot.district;
  const pools = MAP.neighbours[d];
  const rivals = {};
  for (const nb of pools) for (const id of MAP.districtLots[nb.d]) { const b = s.lots[id].business; if (b) rivals[b.type] = (rivals[b.type] || 0) + nb.w; }
  const mix = DISTRICTS[d].mix;
  return BUSINESSES.filter(def => tech.biz.has(def.id))
    .map(def => ({ def, score: (mix[0] * def.app[0] + mix[1] * def.app[1] + mix[2] * def.app[2] + 0.3 * def.app[3]) * def.ticket * (1 - def.stock) / (1 + (rivals[def.id] || 0)) / Math.sqrt(def.cost) }))
    .sort((a, b) => b.score - a.score).slice(0, n).map(x => x.def);
}

export function sample(s, arr, n) {
  if (arr.length <= n) return arr;
  const a = [...arr];
  for (let i = 0; i < n; i++) { const j = i + Math.floor(rand(s) * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// Try to buy the one lot standing between this rival and a full colour set.
function tradeForSets(s, p) {
  for (let d = 0; d < DISTRICTS.length; d++) {
    const ids = MAP.districtLots[d];
    if (setCount(s, p.id, d) !== ids.length - 1) continue;
    const id = ids.find(i => s.lots[i].owner !== p.id);
    const lot = s.lots[id];
    if (lot.owner < 0) continue;             // the city's: wait for the auction
    const seller = s.players[lot.owner];
    const value = landValue(s, lot) + lot.aptInvested;
    const budget = Math.min(p.cash - reserveFor(s, p), value * 3.2);
    if (seller.human) {
      if (s.offers.some(o => o.lotId === id)) continue;
      const amount = Math.round(Math.min(budget, value * (1.5 + rand(s) * 0.9)) / 500) * 500;
      if (amount < value * 1.3) continue;
      s.offers.push({ id: ++s.offerSeq, from: p.id, to: seller.id, lotId: id, amount, expires: s.day + 2 });
      news(s, `${p.name} wants to buy your ${lot.name} for ${money(amount)}.`, 'offer', p.id);
    } else {
      const ask = askingPrice(s, seller.id, id, p.id);
      if (ask <= budget) transfer(s, p.id, seller.id, id, ask);
    }
    return;
  }
}

// ---------------------------------------------------------- auctions ----
// The most this rival will pay for a lot right now.
export function aiAuctionMax(s, p, lot) {
  const st = STYLE[p.style];
  const diff = DIFFICULTY[s.difficulty];
  const v = landValue(s, lot);
  let f = 0.95;
  if (lot.kind === 'prop') {
    const ids = MAP.districtLots[lot.district];
    const n = ids.length;
    const have = setCount(s, p.id, lot.district);
    const others = ids.some(id => s.lots[id].owner >= 0 && s.lots[id].owner !== p.id);
    if (have === n - 1) f += 0.9 * st.set;
    else if (!others) f += 0.12 * (have + 1) * st.set;
    for (const q of s.players) if (q.id !== p.id && !q.bankrupt && setCount(s, q.id, lot.district) === n - 1) f += 0.35;
    // What could it earn with a shop on it?
    let best = 0;
    const tech = techOf(s);
    if (!lot.business) for (const def of BUSINESSES) {
      if (!tech.biz.has(def.id)) continue;
      // Value land at fair prices so pricing style doesn't inflate bids.
      best = Math.max(best, estimate(s, lot.id, def.id, p.id, { price: 1 }).profit);
    } else if (lot.business.owner !== p.id) best = rentFor(s, lot);
    f += Math.max(0, Math.min(0.8, best * 10 / v));
    f *= st.land;
  } else if (lot.kind === 'station') {
    const k = s.lots.filter(l => l.kind === 'station' && l.owner === p.id).length;
    f = 0.7 + (stationFare(k + 1) * (k + 1) - stationFare(k) * k) * 25 / v;
  } else {
    // What it would earn as ours (plus the pairing bonus on one we already own).
    const was = lot.owner; lot.owner = p.id;
    const inc = utilityIncome(s, lot, utilityPools(s), p.id);
    lot.owner = was;
    f = 0.7 + inc * 25 / v;
  }
  f *= (0.9 + rand(s) * 0.25) * (2 - diff.margin);
  // Keep a building fund until the first few shops are open: land with no
  // shop on it earns little.
  const shops = s.lots.filter(l => l.business && l.business.owner === p.id).length;
  const fund = shops < 3 ? 18000 - shops * 5000 : 0;
  const budget = p.cash - reserveFor(s, p) - fund + (diff.borrow ? (loanLimit(s, p.id) - p.loan) * 0.3 : 0);
  return Math.max(0, Math.round(Math.min(v * f, budget) / 500) * 500);
}
