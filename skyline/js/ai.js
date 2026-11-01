// Skyline Hustle - rival tycoons. They play by exactly the same rules as
// the human: every move goes through the action functions in sim.js.
//
// Each rival thinks every few game hours. It scores every move it could
// make (open a business, buy land, finish a colour set, build apartments,
// buy a station or utility) as expected daily return on the cash spent,
// tilts the scores by personality and takes the best one it can afford.
// Once a day it re-prices and re-staffs its shops, sells losers, and may
// try to buy the last lot it needs to complete a colour set.

import { BUSINESSES, BIZ, DISTRICTS, DIFFICULTY, PRICE_TIERS, FIT_LEVELS, MAX_STAFF, STATION_FARE, UTILITY_CUT,
  OVERHEAD_BASE, OVERHEAD_RATE, LAND_GROWTH_DAY, APT_RESIDENTS, LOAN_STEP } from './data.js';
import {
  MAP, rand, estimate, landValue, rentFor, ownsSet, setCount, netWorth, buyLand, build, setTier, setStaff,
  sellBusiness, upgradeFit, fitCost, aptCheck, buildApt, aptRentFor, askingPrice, transfer, sellLand,
  loanLimit, takeLoan, repayLoan, stepHour, money, news,
} from './sim.js';

const STYLE = {
  baron:   { build: 0.85, land: 1.6, apt: 1.5, set: 1.6, tiers: [1, 2, 3], fit: 0.5, prefer: [] },
  cutter:  { build: 1.15, land: 0.8, apt: 0.9, set: 1.0, tiers: [0, 1, 2], fit: 0.3, prefer: ['food'] },
  premium: { build: 1.0,  land: 1.0, apt: 1.1, set: 1.1, tiers: [2, 3, 4], fit: 1.6, prefer: ['retail', 'leisure'] },
};

// Advances the whole game, AI included. This is what the UI calls.
export function advanceGame(s, hours) {
  s.t += hours;
  let steps = 0;
  while (s.t >= 1 && !s.over && steps < 48) {
    s.t -= 1; steps++;
    stepHour(s, HOOKS);
  }
  if (steps >= 48) s.t = 0;
  return steps;
}
export const HOOKS = { onHour: aiHour, onDay: aiDay };

export function aiHour(s) {
  const think = DIFFICULTY[s.difficulty].think;
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
  // Offers to the human expire after a day.
  s.offers = s.offers.filter(o => o.expires > s.day);
}

// ------------------------------------------------------------ think ----
function reserveFor(s, p) {
  return 3000 + 0.04 * Math.max(0, netWorth(s, p.id));
}

function think1(s, p) {
  const st = STYLE[p.style];
  const reserve = reserveFor(s, p);
  const moves = [];

  // Open a business: every free lot x every business type.
  const free = s.lots.filter(l => l.kind === 'prop' && !l.business);
  for (const lot of free) {
    for (const def of BUSINESSES) {
      const tier = st.tiers[1];
      const e = estimate(s, lot.id, def.id, p.id, { tier, staff: 3 });
      if (e.profit <= 0) continue;
      let roi = e.profit / def.cost * st.build;
      if (st.prefer.includes(def.group)) roi *= 1.2;
      // Building on your own land is worth a little extra (it lifts its value).
      if (lot.owner === p.id) roi *= 1.1;
      moves.push({ roi, cost: def.cost, run: () => build(s, p.id, lot.id, def.id, { tier, staff: 3 }) });
    }
  }

  // Buy land from the city.
  for (const lot of s.lots) {
    if (lot.owner !== -1) continue;
    const price = landValue(s, lot);
    let gain = price * LAND_GROWTH_DAY;          // appreciation
    if (lot.kind === 'prop') {
      const n = MAP.districtLots[lot.district].length;
      const mine = setCount(s, p.id, lot.district);
      const others = MAP.districtLots[lot.district].some(id => s.lots[id].owner >= 0 && s.lots[id].owner !== p.id);
      if (lot.business) gain += rentFor(s, lot);
      if (mine === n - 1) gain += price * 0.05 * st.set;               // completes a set
      else if (!others) gain += price * 0.012 * (mine + 1) * st.set;     // still collectable
      // Block a rival who is one lot away from a set.
      for (const q of s.players) if (q.id !== p.id && !q.bankrupt && setCount(s, q.id, lot.district) === n - 1) gain += price * 0.02;
      gain *= st.land;
    } else if (lot.kind === 'station') {
      const k = s.lots.filter(l => l.kind === 'station' && l.owner === p.id).length;
      gain += STATION_FARE[k + 1] * (k + 1) - STATION_FARE[k] * k;
    } else {
      const k = s.lots.filter(l => l.kind === 'utility' && l.owner === p.id).length;
      const pool = s.lots.reduce((a, l) => a + (l.business ? OVERHEAD_BASE + BIZ[l.business.type].cost * OVERHEAD_RATE : 0), 0);
      gain += pool * (UTILITY_CUT[k + 1] * (k + 1) - UTILITY_CUT[k] * k);
    }
    moves.push({ roi: gain / price, cost: price, run: () => buyLand(s, p.id, lot.id) });
  }

  // Apartments on completed sets.
  for (const lot of s.lots) {
    if (lot.owner !== p.id || lot.kind !== 'prop') continue;
    const chk = aptCheck(s, p.id, lot.id);
    if (!chk.ok) continue;
    const before = aptRentFor(s, lot);
    lot.apt++; const after = aptRentFor(s, lot); lot.apt--;
    const residents = APT_RESIDENTS[lot.apt + 1] - APT_RESIDENTS[lot.apt];
    const gain = (after - before) + residents * 0.25 + rentFor(s, lot) * 0.3 * (lot.business && lot.business.owner !== p.id ? 1 : 0);
    moves.push({ roi: gain / chk.cost * st.apt, cost: chk.cost, run: () => buildApt(s, p.id, lot.id) });
  }

  // Refit a busy shop.
  for (const lot of s.lots) {
    const b = lot.business;
    if (!b || b.owner !== p.id || !b.yesterday) continue;
    const c = fitCost(b);
    if (!c) continue;
    const e0 = estimate(s, lot.id, b.type, p.id, {});
    const e1 = estimate(s, lot.id, b.type, p.id, { fit: b.fit + 1 });
    const gain = (e1.profit - e0.profit) * st.fit;
    if (gain > 0) moves.push({ roi: gain / c, cost: c, run: () => upgradeFit(s, p.id, lot.id) });
  }

  const diff = DIFFICULTY[s.difficulty];
  moves.sort((a, b) => b.roi - a.roi);
  for (const m of moves.slice(0, 6)) {
    if (m.roi < diff.minRoi) break;
    if (p.cash - m.cost >= reserve) { m.run(); return; }
    // Borrow for a really good move.
    const short = m.cost + reserve - p.cash;
    const room = loanLimit(s, p.id) - p.loan;
    if (diff.borrow && m.roi > 0.06 && short <= room && p.loan < 0.35 * Math.max(1, netWorth(s, p.id))) {
      takeLoan(s, p.id, Math.ceil(short / LOAN_STEP) * LOAN_STEP);
      m.run();
      return;
    }
  }
  // Nothing worth doing: pay down debt with spare cash.
  if (p.loan > 0 && p.cash > reserve * 2 + LOAN_STEP) repayLoan(s, p.id, LOAN_STEP);
}

// ------------------------------------------------------------- tune ----
function tune(s, p) {
  const st = STYLE[p.style];
  for (const lot of s.lots) {
    const b = lot.business;
    if (!b || b.owner !== p.id || !b.yesterday) continue;
    // Staffing: try one more / one fewer and keep the best.
    let best = { staff: b.staff, tier: b.tier, profit: estimate(s, lot.id, b.type, p.id, {}).profit };
    for (const ds of [-1, 1]) {
      const staff = b.staff + ds;
      if (staff < 1 || staff > MAX_STAFF) continue;
      const e = estimate(s, lot.id, b.type, p.id, { staff });
      if (e.profit > best.profit + 5) best = { staff, tier: b.tier, profit: e.profit };
    }
    for (const tier of st.tiers) {
      if (tier === b.tier) continue;
      const e = estimate(s, lot.id, b.type, p.id, { staff: best.staff, tier });
      if (e.profit > best.profit + 5) best = { staff: best.staff, tier, profit: e.profit };
    }
    setStaff(s, p.id, lot.id, best.staff);
    setTier(s, p.id, lot.id, best.tier);
    // Close a shop that keeps losing money and is expected to keep doing so.
    const h = b.hist;
    if (h.length >= 4 && h.slice(-4).every(v => v < 0) && best.profit < 0) sellBusiness(s, p.id, lot.id);
  }
}

// Raise cash if overdrawn: borrow, then sell the worst assets.
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

// Try to buy the one lot standing between this rival and a full colour set.
function tradeForSets(s, p) {
  for (let d = 0; d < DISTRICTS.length; d++) {
    const ids = MAP.districtLots[d];
    if (setCount(s, p.id, d) !== ids.length - 1) continue;
    const id = ids.find(i => s.lots[i].owner !== p.id);
    const lot = s.lots[id];
    if (lot.owner < 0) continue;            // city lot: think1 will just buy it
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
