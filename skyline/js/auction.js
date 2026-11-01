// Skyline Hustle - live land auctions. The city sells its land only when a
// player calls an auction on a lot: the caller opens the bidding at the
// reserve price, so every auction has a bid. Rivals call auctions for lots
// they want. Auctions are at least AUCTION_GAP game hours apart and each
// player may call one every CALL_COOLDOWN hours. The clock stops while an
// auction runs; bidding happens in real seconds, and every bid resets the
// countdown to at least a few seconds. Rivals bid up to what the lot is
// worth to them.
//
// With liveAuctions off (headless tests) auctions settle instantly.

import { AUCTION_SECONDS, AUCTION_EXTEND, AUCTION_RESERVE, AUCTION_GAP, CALL_COOLDOWN, LOAN_STEP } from './data.js';
import { rand, landValue, grantLand, news, money, loanLimit, takeLoan, MAP } from './sim.js';
import { aiAuctionMax, sample } from './ai.js';

export const increment = price => Math.max(500, Math.round(price * 0.06 / 500) * 500);

export function reservePrice(s, lot) {
  return Math.max(1000, Math.round(landValue(s, lot) * AUCTION_RESERVE * Math.pow(0.88, lot.unsold || 0) / 500) * 500);
}
export function minBid(a) {
  return a.leader < 0 ? a.price : a.price + increment(a.price);
}

const nowH = s => s.day * 24 + s.hour;
// Bigger cities hold auctions more often (6h apart on the Town, 3h on the largest).
export const auctionGap = () => Math.max(3, Math.round(AUCTION_GAP * Math.sqrt(28 / (MAP.lotDefs?.length || 28))));

// Can this player call an auction on this lot right now?
export function canCall(s, pid, lotId) {
  const lot = s.lots[lotId], p = s.players[pid];
  if (!lot || lot.owner !== -1) return { ok: false, msg: 'Only city land is auctioned.' };
  if (s.auction) return { ok: false, msg: 'An auction is already running.' };
  const gap = (s.lastAuctionAt ?? -99) + auctionGap() - nowH(s);
  if (gap > 0) return { ok: false, msg: `The auction house reopens in ${gap}h.`, wait: gap };
  const cd = (p.lastCall ?? -99) + CALL_COOLDOWN - nowH(s);
  if (cd > 0) return { ok: false, msg: `You can call another auction in ${cd}h.`, wait: cd };
  const reserve = reservePrice(s, lot);
  const room = p.human ? loanLimit(s, pid) - p.loan : 0;
  if (p.cash + room < reserve) return { ok: false, msg: `You'd need ${money(reserve)} to open the bidding.` };
  return { ok: true, reserve };
}

// Put a city lot under the hammer, with the caller's opening bid.
export function callAuction(s, pid, lotId) {
  const chk = canCall(s, pid, lotId);
  if (!chk.ok) return chk;
  const p = s.players[pid];
  p.lastCall = nowH(s);
  openAuction(s, lotId, pid);
  if (!s.liveAuctions) { settleRest(s); closeAuction(s); }
  return { ok: true, msg: `Auction called: you open at ${money(chk.reserve)}.` };
}

// Rivals call auctions for lots they really want, mostly in office hours.
export function aiCallAuctions(s) {
  if (s.auction || s.over || s.hour < 8 || s.hour > 20) return;
  if ((s.lastAuctionAt ?? -99) + auctionGap() > nowH(s)) return;
  const rivals = s.players.filter(p => !p.human && !p.bankrupt);
  for (let i = rivals.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [rivals[i], rivals[j]] = [rivals[j], rivals[i]]; }
  for (const p of rivals) {
    if (rand(s) > 0.25) continue;
    let best = null;
    for (const lot of sample(s, s.lots.filter(l => l.owner === -1), 12)) {
      if (!canCall(s, p.id, lot.id).ok) continue;
      const reserve = reservePrice(s, lot);
      const keen = aiAuctionMax(s, p, lot) / reserve;
      if (keen >= 1.15 && (!best || keen > best.keen)) best = { lot, keen };
    }
    if (best) { callAuction(s, p.id, best.lot.id); return; }
  }
}

export function openAuction(s, lotId, caller = -1) {
  const lot = s.lots[lotId];
  const reserve = reservePrice(s, lot);
  const bidders = {};
  for (const p of s.players) {
    if (p.human || p.bankrupt) continue;
    bidders[p.id] = { max: aiAuctionMax(s, p, lot), wait: 1.2 + rand(s) * 2.4 };
  }
  s.auction = { lotId, price: reserve, reserve, leader: caller, caller, timer: AUCTION_SECONDS,
    bids: caller >= 0 ? [{ pid: caller, amount: reserve }] : [], bidders, out: {} };
  s.lastAuctionAt = nowH(s);
  news(s, `🔨 ${caller >= 0 ? s.players[caller].company + ' called an auction' : 'Auction'}: ${lot.name}, opening at ${money(reserve)}.`, 'auction', caller);
}

export function auctionBid(s, pid, amount) {
  const a = s.auction;
  if (!a) return { ok: false, msg: 'The auction is over.' };
  if (a.leader === pid) return { ok: false, msg: 'You are already the top bidder.' };
  amount = Math.max(amount, minBid(a));
  const p = s.players[pid];
  const room = p.human ? loanLimit(s, pid) - p.loan : 0;
  if (p.cash + room < amount) return { ok: false, msg: `You can't cover ${money(amount)}, even with a loan.` };
  a.price = amount;
  a.leader = pid;
  a.bids.unshift({ pid, amount });
  if (a.bids.length > 12) a.bids.length = 12;
  a.timer = Math.max(a.timer, AUCTION_EXTEND);
  return { ok: true };
}

// Real-time tick, dt in real seconds.
export function auctionTick(s, dt) {
  const a = s.auction;
  if (!a) return;
  a.timer -= dt;
  for (const key in a.bidders) {
    const pid = +key, b = a.bidders[key];
    if (a.leader === pid) continue;
    const next = minBid(a);
    if (next > b.max) continue;
    b.wait -= dt;
    if (b.wait > 0) continue;
    // Sometimes jump the bidding to unsettle the others.
    let amt = next;
    if (rand(s) < 0.25 && next + increment(next) <= b.max) amt = next + increment(next);
    auctionBid(s, pid, amt);
    b.wait = Math.min(0.6 + rand(s) * 1.9, Math.max(0.35, a.timer * 0.7));
  }
  if (a.timer <= 0) closeAuction(s);
}

// Finish the bidding instantly among the rivals (the human has stepped out,
// or nobody is watching). English auction: the strongest bidder wins at one
// increment over the runner-up.
// A human steps out. When every human who isn't leading has stepped out
// (or isn't connected), the rivals finish it among themselves.
export function auctionPass(s, pid, connected = null) {
  const a = s.auction;
  if (!a) return { ok: false, msg: 'The auction is over.' };
  if (a.leader === pid) return { ok: false, msg: 'You are the top bidder.' };
  a.out[pid] = true;
  maybeSettle(s, connected);
  return { ok: true };
}
export function maybeSettle(s, connected = null) {
  const a = s.auction;
  if (!a) return;
  const waiting = s.players.filter(p => p.human && !p.bankrupt && !a.out[p.id] && a.leader !== p.id &&
    (!connected || connected.has(p.id)));
  if (waiting.length) return;
  settleRest(s);
  a.timer = Math.min(a.timer, 1.5);
}

export function settleRest(s) {
  const a = s.auction;
  if (!a) return;
  a.allOut = true;
  const live = Object.entries(a.bidders).map(([k, b]) => ({ pid: +k, max: b.max }))
    .filter(x => x.max >= minBid(a) || x.pid === a.leader)
    .sort((x, y) => y.max - x.max);
  if (!live.length) return;
  const top = live[0];
  const rival = Math.max(live[1]?.max ?? 0, a.leader >= 0 && a.leader !== top.pid ? a.price : 0);
  if (top.pid === a.leader && rival <= a.price) return;
  const price = Math.max(minBid(a), Math.min(top.max, rival + increment(rival)));
  if (price > top.max) return;
  a.price = price;
  a.leader = top.pid;
  a.bids.unshift({ pid: top.pid, amount: price });
}

export function closeAuction(s) {
  const a = s.auction;
  if (!a) return;
  const lot = s.lots[a.lotId];
  s.auction = null;
  if (a.leader >= 0) {
    const p = s.players[a.leader];
    if (p.cash < a.price) {
      const need = Math.ceil((a.price - p.cash) / LOAN_STEP) * LOAN_STEP;
      takeLoan(s, p.id, need);
    }
    const done = grantLand(s, a.leader, a.lotId, a.price);
    return (s.lastAuction = { lotId: a.lotId, winner: a.leader, price: a.price, setComplete: done });
  }
  lot.unsold = (lot.unsold || 0) + 1;
  s.auctionQueue.push(lot.id);
  news(s, `No bids for ${lot.name}. The city will try again for less.`, 'auction');
  return (s.lastAuction = { lotId: a.lotId, winner: -1 });
}
