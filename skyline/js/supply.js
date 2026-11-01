// Skyline Hustle - the supply chain.
//
// Every shop restocks at 06:00 (and 13:00 with a stock clerk). It buys from
// the cheapest source with goods left today:
//   - its owner's own supplier for that line, at production cost
//   - another company's supplier, at the price that company sets
//   - the open market, at today's wholesale price (which moves every day,
//     with strikes, gluts and harvests)
// A supplier has a daily capacity (market value of goods it can ship). Its
// owner earns the wholesale margin on everything sold to other companies.
// DOM-free: runs on the server in LAN games.

import {
  BIZ, SUPPLY_LINES, LINE_OF, SUPPLIER_LEVELS, PRODUCTION_COST, SUPPLY_PRICE_MIN, SUPPLY_PRICE_MAX, MARKET_SHOCKS,
} from './data.js';
import { rand, ledger, news, money, hooks, lockedLot, sellBusiness } from './sim.js';

const fail = msg => ({ ok: false, msg });
const inflation = s => 1 + 0.006 * (s.day - 1);
const MAX_RUNS = 60;

function supply(s) {
  if (!s.market) s.market = Object.fromEntries(Object.keys(SUPPLY_LINES).map(k => [k, 1]));
  s.marketHist ||= Object.fromEntries(Object.keys(SUPPLY_LINES).map(k => [k, []]));
  s.shocks ||= [];
  s.supplyRuns ||= [];
  return s;
}

export const suppliers = (s, line = null) => s.lots.filter(l => l.supplier && (!line || l.supplier.line === line));
export const capOf = sup => Math.round(SUPPLIER_LEVELS[sup.level].cap * (sup.capMult || 1));
export const spare = sup => Math.max(0, capOf(sup) - (sup.used || 0));
export const supplierName = (s, lot) => `${s.players[lot.supplier.owner]?.company.split(/[ &]/)[0] || 'City'} ${SUPPLY_LINES[lot.supplier.line].name}`;

// --------------------------------------------------------- purchasing ----
// The shop on `lot` wants goods worth `value` at base market prices. Returns
// what it pays; settles every supplier involved.
export function buyGoods(s, lot, value) {
  supply(s);
  const b = lot.business, line = LINE_OF[b.type], buyer = s.players[b.owner];
  const idx = s.market[line] ?? 1;
  const offers = suppliers(s, line).filter(l => spare(l.supplier) > 0 && !s.players[l.supplier.owner].bankrupt)
    .map(l => ({ l, price: l.supplier.owner === b.owner ? PRODUCTION_COST : l.supplier.price }))
    .filter(o => o.l.supplier.owner === b.owner || (buyer.buyRival !== false && o.price < idx))
    .sort((a, c) => a.price - c.price);
  let left = value, paid = 0;
  const src = (b.today.src ||= {});
  for (const { l, price } of offers) {
    if (left <= 0.5 || price >= idx) break;
    const sup = l.supplier, take = Math.min(left, spare(sup));
    const cost = take * PRODUCTION_COST, pay = take * price;
    sup.used = (sup.used || 0) + take;
    if (sup.owner !== b.owner) {
      const seller = s.players[sup.owner];
      ledger(seller, 'wholesale', pay);
      ledger(seller, 'production', -cost);
      sup.rev = (sup.rev || 0) + pay;
      sup.cost = (sup.cost || 0) + cost;
    } else sup.own = (sup.own || 0) + take;
    (sup.clients ||= {})[b.owner] = (sup.clients[b.owner] || 0) + pay;
    sup.shipped = (sup.shipped || 0) + take;
    paid += pay; left -= take;
    src[l.id] = (src[l.id] || 0) + take;
    if (s.supplyRuns.length < MAX_RUNS) s.supplyRuns.push({ a: l.id, b: lot.id, h: s.hour + 1 });
  }
  if (left > 0.5) { paid += left * idx; src.market = (src.market || 0) + left; }
  return paid;
}

// The best price a company would get for a line right now (for forecasts).
export function quote(s, pid, type) {
  supply(s);
  const line = LINE_OF[type], idx = s.market[line] ?? 1;
  let best = idx;
  for (const l of suppliers(s, line)) {
    const sup = l.supplier;
    if (spare(sup) < capOf(sup) * 0.15 && (sup.usedY || 0) > capOf(sup) * 0.85) continue;   // usually sold out
    if (sup.owner === pid) best = Math.min(best, PRODUCTION_COST);
    else if (s.players[pid]?.buyRival !== false) best = Math.min(best, sup.price);
  }
  return best;
}
hooks.buyGoods = buyGoods;
hooks.quote = quote;

// What the city's shops in a line spent on goods yesterday (base value).
export function lineDemand(s, line) {
  let v = 0;
  for (const l of s.lots) {
    const b = l.business;
    if (!b || LINE_OF[b.type] !== line) continue;
    const y = b.yesterday || b.today;
    v += (y.delivered || 0) * BIZ[b.type].ticket * BIZ[b.type].stock;
  }
  return Math.round(v);
}

// ------------------------------------------------------------ actions ----
export const supplierCost = (s, level) => Math.round(SUPPLIER_LEVELS[level].cost * inflation(s) / 500) * 500;

export function buildSupplier(s, pid, lotId, line) {
  supply(s);
  const lot = s.lots[lotId], p = s.players[pid];
  if (!SUPPLY_LINES[line]) return fail('No such supplier.');
  if (!lot || lot.kind !== 'prop' || lot.owner !== pid) return fail('Build it on a lot of your own.');
  if (lot.business || lot.apt || lockedLot(lot)) return fail('The lot must be empty: no shop, no apartments.');
  const cost = supplierCost(s, 0);
  if (p.cash < cost) return fail(`Need ${money(cost)}.`);
  ledger(p, 'capex', -cost);
  const def = SUPPLY_LINES[line];
  const price = p.human ? 0.85 : ({ cutter: 0.8, baron: 0.88, premium: 0.95 }[p.style] ?? 0.88);
  lot.supplier = { line, owner: pid, level: 0, price, invested: cost, built: s.day, used: 0, hist: [] };
  news(s, `${def.icon} ${p.company} opened a ${def.name} on ${lot.name}.`, 'build', pid);
  return { ok: true, msg: `${def.icon} ${def.name} open: your ${def.types.map(t => BIZ[t].icon).join('')} shops now restock at cost.` };
}

export function upgradeSupplier(s, pid, lotId) {
  const lot = s.lots[lotId], sup = lot?.supplier, p = s.players[pid];
  if (!sup || sup.owner !== pid) return fail('Not your supplier.');
  if (sup.level >= SUPPLIER_LEVELS.length - 1) return fail('Already the biggest it gets.');
  const cost = supplierCost(s, sup.level + 1);
  if (p.cash < cost) return fail(`Need ${money(cost)}.`);
  ledger(p, 'capex', -cost);
  sup.level++; sup.invested += cost;
  return { ok: true, msg: `Expanded to a ${SUPPLIER_LEVELS[sup.level].name}: ${money(capOf(sup))} of goods a day.` };
}

export function priceSupplier(s, pid, lotId, price) {
  const sup = s.lots[lotId]?.supplier;
  if (!sup || sup.owner !== pid) return fail('Not your supplier.');
  sup.price = Math.round(Math.max(SUPPLY_PRICE_MIN, Math.min(SUPPLY_PRICE_MAX, price)) * 100) / 100;
  return { ok: true };
}

export function closeSupplier(s, pid, lotId) {
  const lot = s.lots[lotId], sup = lot?.supplier;
  if (!sup || sup.owner !== pid) return fail('Not your supplier.');
  const back = Math.round(sup.invested * 0.5);
  ledger(s.players[pid], 'capex', back);
  lot.supplier = null;
  news(s, `${s.players[pid].company} closed its ${SUPPLY_LINES[sup.line].name} on ${lot.name}.`, 'deal', pid);
  return { ok: true, msg: `Closed. Equipment sold for ${money(back)}.` };
}

export function setBuyRival(s, pid, on) {
  s.players[pid].buyRival = !!on;
  return { ok: true, msg: on ? 'Your shops buy from whoever is cheapest, rivals included.' : 'Your shops will only use your own suppliers and the market.' };
}

// -------------------------------------------------------------- market ----
function marketDay(s) {
  for (const sh of s.shocks) sh.left--;
  s.shocks = s.shocks.filter(sh => sh.left > 0);
  if (rand(s) < 0.12) {
    const pool = MARKET_SHOCKS.filter(m => !s.shocks.some(sh => sh.line === m.line));
    if (pool.length) {
      const m = pool[Math.floor(rand(s) * pool.length)];
      const mult = m.up ? 1.25 + rand(s) * 0.2 : 0.75 + rand(s) * 0.1;
      s.shocks.push({ line: m.line, mult, left: 3 + Math.floor(rand(s) * 4) });
      news(s, `📈 ${m.text} (${m.up ? '+' : ''}${Math.round((mult - 1) * 100)}%)`, 'event');
    }
  }
  for (const line of Object.keys(SUPPLY_LINES)) {
    const target = s.shocks.filter(sh => sh.line === line).reduce((a, sh) => a * sh.mult, 1);
    const v = s.market[line] + (target - s.market[line]) * 0.4 + (rand(s) - 0.5) * 0.05;
    s.market[line] = Math.round(Math.max(0.7, Math.min(1.6, v)) * 1000) / 1000;
    const h = s.marketHist[line];
    h.push(s.market[line]);
    if (h.length > 30) h.shift();
  }
}

function supplierDay(s) {
  for (const l of suppliers(s)) {
    const sup = l.supplier, p = s.players[sup.owner];
    if (l.owner !== sup.owner || p.bankrupt) { l.supplier = null; continue; }
    const upkeep = SUPPLIER_LEVELS[sup.level].upkeep * inflation(s);
    ledger(p, 'production', -upkeep);
    // Profit: margin on sales to rivals, plus what its own shops saved
    // against today's market price, minus upkeep.
    const margin = (sup.rev || 0) - (sup.cost || 0);
    const saved = (sup.own || 0) * ((s.market[sup.line] ?? 1) - PRODUCTION_COST);
    sup.y = { shipped: Math.round(sup.shipped || 0), rev: Math.round(sup.rev || 0), margin: Math.round(margin), saved: Math.round(saved), upkeep: Math.round(upkeep),
      rivals: Object.keys(sup.clients || {}).filter(k => +k !== sup.owner).length, own: !!sup.own };
    sup.hist.push(Math.round(margin + saved - upkeep));
    if (sup.hist.length > 14) sup.hist.shift();
    sup.usedY = sup.used || 0;
    sup.used = 0; sup.rev = 0; sup.cost = 0; sup.own = 0; sup.shipped = 0; sup.clients = {};
  }
}

// ----------------------------------------------------------------- AI ----
function aiSupply(s) {
  for (const p of s.players) {
    if (p.human || p.bankrupt) continue;
    // Tune prices on what they already run.
    for (const l of suppliers(s).filter(l => l.supplier.owner === p.id)) {
      const sup = l.supplier, use = (sup.usedY || 0) / capOf(sup);
      if (use > 0.95) {
        if (sup.level < SUPPLIER_LEVELS.length - 1 && p.cash > supplierCost(s, sup.level + 1) * 2) upgradeSupplier(s, p.id, l.id);
        else sup.price = Math.min(0.97, Math.round((sup.price + 0.03) * 100) / 100);
      } else if (use < 0.4) sup.price = Math.max(0.72, Math.round((sup.price - 0.03) * 100) / 100);
    }
    if (rand(s) > 0.25) continue;
    const count = {};
    for (const l of s.lots) if (l.business?.owner === p.id) count[LINE_OF[l.business.type]] = (count[LINE_OF[l.business.type]] || 0) + 1;
    const line = Object.entries(count).filter(([ln, n]) => n >= 3 && !suppliers(s, ln).some(l => l.supplier.owner === p.id)).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!line || p.cash < supplierCost(s, 0) * 1.6 + 20000) continue;
    let lot = s.lots.find(l => l.kind === 'prop' && l.owner === p.id && !l.business && !l.apt && !lockedLot(l));
    if (!lot) {
      // No empty land: close a shop that has been losing money.
      const weakest = s.lots.filter(l => l.business?.owner === p.id && l.owner === p.id && !l.apt && !lockedLot(l))
        .map(l => [l, (l.business.hist || []).reduce((a, v) => a + v, 0)]).sort((a, b) => a[1] - b[1])[0];
      if (!weakest || weakest[1] > 0) continue;
      sellBusiness(s, p.id, weakest[0].id);
      lot = weakest[0];
    }
    buildSupplier(s, p.id, lot.id, line);
  }
}

// ---------------------------------------------------------------- clock ----
export function supplyHour(s) {
  supply(s);
  if (s.hour === 0) {
    marketDay(s);
    supplierDay(s);
    aiSupply(s);
    s.supplyRuns = [];
  }
}
