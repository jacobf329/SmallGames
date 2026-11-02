// Skyline Hustle - the stock market.
//
// Every company starts with 1,000 shares, all held by its founder. Issuing
// new shares raises cash; they go to the open market, where anyone can buy
// them (your stake shrinks, the cash makes up for it). Buying them back
// retires them. Prices follow each company's
// value and recent profits, plus a little market mood, and big trades move
// them. A slice of each day's profit is paid out as dividends. Hold more
// than half of a company and you take it over: its land, shops, suppliers,
// cash and debts become yours, and other shareholders are bought out.
// DOM-free: runs on the server in LAN games.

import { rand, ledger, news, money, SHARES, companyValue, operating, checkEnd } from './sim.js';

const fail = msg => ({ ok: false, msg });
const MARKET = -1;
const IMPACT = 0.0002;           // price moves 0.02% per share traded
const DIVIDEND = 0.12;           // share of a day's operating profit paid out
export const totalOf = (s, t) => market(s)[t].total || SHARES;
export const pctOf = (s, owner, t) => holding(s, owner, t) / totalOf(s, t);
export const LOTS = [10, 50, 100];

export function market(s) {
  s.shares ||= {};
  for (const p of s.players) {
    if (!s.shares[p.id]) {
      const price = Math.max(1, fundamental(s, p.id));
      s.shares[p.id] = { holders: { [p.id]: SHARES }, total: SHARES, price, hist: [price], mood: 1, open: price };
    }
  }
  return s.shares;
}
export const holding = (s, owner, target) => market(s)[target].holders[owner] || 0;
export const float = (s, target) => market(s)[target].holders[MARKET] || 0;
export const stakeOf = (s, target) => Object.entries(market(s)[target].holders).filter(([k, n]) => n > 0).map(([k, n]) => [+k, n]).sort((a, b) => b[1] - a[1]);

// What a share "should" be worth: book value plus a few weeks of profit.
export function fundamental(s, pid) {
  const p = s.players[pid];
  if (p.bankrupt) return 0;
  const recent = (p.profitHist || []).slice(-7);
  const earn = recent.length ? recent.reduce((a, v) => a + v, 0) / recent.length : 0;
  return Math.max(1, (companyValue(s, pid) + 14 * earn) / (s.shares?.[pid]?.total || SHARES));
}

// Before a trade, the price catches up with the company's value today, so
// nobody trades on yesterday's numbers.
function refresh(s, t) {
  const st = s.shares[t];
  st.price = Math.max(0.5, (st.price + fundamental(s, t) * (st.mood || 1)) / 2);
}
// Average price of a block of n shares, given the impact of the trade.
const fill = (price, n, dir) => price * (1 + dir * IMPACT * n / 2);

// ------------------------------------------------------------- trading ----
export function buyShares(s, pid, target, n) {
  market(s);
  const p = s.players[pid], t = s.players[target], st = s.shares[target];
  n = Math.floor(n);
  if (!t || t.bankrupt || n <= 0) return fail('Nothing to buy.');
  refresh(s, target);
  const avail = st.holders[MARKET] || 0;
  if (!avail) return fail(target === pid ? 'None of your shares are on the market.' : `${t.company} has no shares on the market. They have to sell some first.`);
  n = Math.min(n, avail);
  const cost = Math.round(fill(st.price, n, 1) * n);
  if (p.cash < cost) return fail(`Need ${money(cost)}.`);
  ledger(p, 'trade', -cost);
  st.holders[MARKET] -= n;
  st.holders[pid] = (st.holders[pid] || 0) + n;
  st.price = st.price * (1 + IMPACT * n);
  if (pid === target) {
    // A buy-back retires the shares.
    st.holders[pid] -= n; st.total = (st.total || SHARES) - n;
    return { ok: true, msg: `Bought back and retired ${n} shares for ${money(cost)}. You own ${Math.round(st.holders[pid] / st.total * 100)}% of your company.` };
  }
  const pct = st.holders[pid] / (st.total || SHARES);
  if (pct > 0.5) return takeover(s, pid, target);
  if (t.human && pct >= 0.25 && (st.holders[pid] - n) / (st.total || SHARES) < 0.25) news(s, `${p.company} now owns ${Math.round(pct * 100)}% of ${t.company}.`, 'warn', target);
  return { ok: true, msg: `Bought ${n} ${t.company} shares for ${money(cost)} (${Math.round(pct * 100)}%).` };
}

// Selling another company's shares, or issuing new shares of your own.
export function sellShares(s, pid, target, n) {
  market(s);
  const p = s.players[pid], t = s.players[target], st = s.shares[target];
  if (!t || t.bankrupt) return fail('No shares to sell.');
  n = Math.floor(n);
  refresh(s, target);
  if (pid === target) {
    // Issue: never let your own stake fall below 10%.
    n = Math.min(n, st.holders[pid] * 10 - (st.total || SHARES));
    if (n <= 0) return fail('Keep at least 10% of your own company.');
    const got = Math.round(fill(st.price, n, -1) * n);
    ledger(p, 'trade', got);
    st.total = (st.total || SHARES) + n;
    st.holders[MARKET] = (st.holders[MARKET] || 0) + n;
    st.price = Math.max(0.5, st.price * (1 - IMPACT * n));
    const own = st.holders[pid] / st.total;
    news(s, `${p.company} issued ${n} new shares and raised ${money(got)}.`, 'deal', pid);
    return { ok: true, msg: `Raised ${money(got)}. You now own ${Math.round(own * 100)}% of your company${own <= 0.55 ? ': careful, above 50% someone can take you over' : ''}.` };
  }
  n = Math.min(n, st.holders[pid] || 0);
  if (n <= 0) return fail('No shares to sell.');
  const got = Math.round(fill(st.price, n, -1) * n);
  ledger(p, 'trade', got);
  st.holders[pid] -= n;
  st.holders[MARKET] = (st.holders[MARKET] || 0) + n;
  st.price = Math.max(0.5, st.price * (1 - IMPACT * n));
  return { ok: true, msg: `Sold ${n} shares for ${money(got)}.` };
}

// ------------------------------------------------------------ takeover ----
function takeover(s, pid, target) {
  const A = s.players[pid], B = s.players[target], st = s.shares[target];
  const price = st.price;
  // Everyone else holding B is bought out at the market price.
  for (const [k, n] of Object.entries(st.holders)) {
    const h = +k;
    if (h === pid || h === MARKET || h === target || n <= 0) continue;
    const pay = Math.round(n * price);
    ledger(A, 'trade', -pay);
    ledger(s.players[h], 'trade', pay);
  }
  // B's empire becomes A's.
  for (const l of s.lots) {
    if (l.owner === target) l.owner = pid;
    if (l.business?.owner === target) l.business.owner = pid;
    if (l.supplier?.owner === target) l.supplier.owner = pid;
  }
  for (const b of s.lmBuilds || []) if (b.pid === target) b.pid = pid;
  for (const L of Object.values(s.landmarks || {})) if (L.owner === target) L.owner = pid;
  A.cash += B.cash; A.loan += B.loan;
  B.cash = 0; B.loan = 0;
  // Shares B held in other companies pass to A.
  for (const [tid, os] of Object.entries(s.shares)) {
    if (+tid === target || !os.holders[target]) continue;
    os.holders[pid] = (os.holders[pid] || 0) + os.holders[target];
    delete os.holders[target];
  }
  st.holders = { [pid]: st.total || SHARES };
  s.offers = s.offers.filter(o => o.from !== target && o.to !== target);
  B.bankrupt = true; B.takenBy = pid;
  news(s, `🏦 TAKEOVER! ${A.company} bought control of ${B.company} and absorbed its whole empire.`, 'set', pid);
  if (B.human) { news(s, `${A.company} took over your company. Your empire is theirs now.`, 'bad', target); checkEnd(s); }
  return { ok: true, takeover: true, msg: `Takeover! ${B.company} and everything it owns are yours.` };
}

// ---------------------------------------------------------------- daily ----
function marketDay(s) {
  for (const p of s.players) {
    const st = s.shares[p.id];
    if (p.bankrupt) {
      if (st.price) { st.price = 0; st.holders = {}; }
      // A bust company's holdings go back on the market.
      for (const os of Object.values(s.shares)) if (os.holders[p.id]) { os.holders[MARKET] = (os.holders[MARKET] || 0) + os.holders[p.id]; delete os.holders[p.id]; }
      st.hist.push(0); if (st.hist.length > 60) st.hist.shift();
      continue;
    }
    st.mood = Math.max(0.8, Math.min(1.2, st.mood + (rand(s) - 0.5) * 0.06 + (1 - st.mood) * 0.1));
    const target = fundamental(s, p.id) * st.mood;
    st.open = st.price;
    st.price = Math.max(0.5, st.price + (target - st.price) * 0.35);
    st.hist.push(Math.round(st.price * 100) / 100);
    if (st.hist.length > 60) st.hist.shift();
    // Dividends from yesterday's profit, to everyone but the company itself.
    const op = operating(p.yesterday || {});
    if (op > 0) {
      const perShare = op * DIVIDEND / SHARES;
      for (const [k, n] of Object.entries(st.holders)) {
        const h = +k;
        if (h === p.id || h === MARKET || n <= 0 || s.players[h].bankrupt) continue;
        const amt = perShare * n;
        ledger(p, 'dividends', -amt);
        ledger(s.players[h], 'dividends', amt);
      }
    }
  }
}

// ------------------------------------------------------------------- AI ----
function aiMarket(s) {
  for (const p of s.players) {
    if (p.human || p.bankrupt) continue;
    const mine = s.shares[p.id];
    // Short of cash: sell some of itself (never below 55%).
    const own = mine.holders[p.id] / (mine.total || SHARES);
    if (p.cash < 8000 && p.debtDays > 0 && own > 0.6) sellShares(s, p.id, p.id, 150);
    else if (p.cash < 15000 && p.style === 'baron' && rand(s) < 0.15 && own > 0.7) sellShares(s, p.id, p.id, 100);
    // Someone circling? Buy back the float.
    const threat = stakeOf(s, p.id).find(([h, n]) => h !== p.id && h >= 0 && n / (mine.total || SHARES) >= 0.3);
    if (threat && float(s, p.id) && p.cash > 30000) buyShares(s, p.id, p.id, Math.min(float(s, p.id), Math.floor((p.cash - 20000) / mine.price)));
    // Invest spare cash in undervalued companies with shares on the market.
    if (p.cash < 120000 || rand(s) > 0.35) continue;
    const picks = s.players.filter(t => t.id !== p.id && !t.bankrupt && float(s, t.id) > 0 && (!t.human || s.difficulty !== 'easy'))
      .map(t => ({ t, st: s.shares[t.id], val: fundamental(s, t.id) / s.shares[t.id].price }))
      .sort((a, b) => b.val - a.val);
    const best = picks[0];
    if (!best || best.val < 0.95) continue;
    const have = holding(s, p.id, best.t.id);
    const budget = (p.cash - 80000) * (p.style === 'baron' ? 0.6 : 0.4);
    let n = Math.min(float(s, best.t.id), Math.floor(budget / best.st.price), 120);
    // A takeover in reach and affordable? Go for it.
    const tot = best.st.total || SHARES;
    const need = Math.floor(tot / 2) + 1 - have;
    const others = tot - have - float(s, best.t.id);
    if (need <= float(s, best.t.id) && need * best.st.price * 1.3 + others * best.st.price < p.cash - 40000) n = need;
    if (n > 0) buyShares(s, p.id, best.t.id, n);
  }
}

export function stocksHour(s) {
  market(s);
  if (s.hour === 0) { marketDay(s); aiMarket(s); }
}
