// Skyline Hustle - live land auctions. The city puts one lot under the
// hammer at 9:00, 13:00 and 17:00 while it still owns land. The clock
// stops while the auction runs; bidding happens in real seconds. Every
// bid resets the countdown to at least a few seconds, so there is always
// time to answer. Rivals bid up to what the lot is worth to them.
//
// With liveAuctions off (headless tests) auctions settle instantly.

import { AUCTION_SECONDS, AUCTION_EXTEND, AUCTION_RESERVE, AUCTION_HOURS, LOAN_STEP } from './data.js';
import { rand, landValue, grantLand, news, money, loanLimit, takeLoan } from './sim.js';
import { aiAuctionMax } from './ai.js';

export const increment = price => Math.max(500, Math.round(price * 0.06 / 500) * 500);

export function reservePrice(s, lot) {
  return Math.max(1000, Math.round(landValue(s, lot) * AUCTION_RESERVE * Math.pow(0.88, lot.unsold || 0) / 500) * 500);
}
export function minBid(a) {
  return a.leader < 0 ? a.price : a.price + increment(a.price);
}

export function maybeOpenAuction(s) {
  if (s.auction || s.over || !AUCTION_HOURS.includes(s.hour)) return;
  const id = s.auctionQueue.find(i => s.lots[i].owner === -1);
  if (id === undefined) return;
  s.auctionQueue = s.auctionQueue.filter(i => i !== id);
  openAuction(s, id);
  if (!s.liveAuctions) { settleRest(s); closeAuction(s); }
}

export function openAuction(s, lotId) {
  const lot = s.lots[lotId];
  const reserve = reservePrice(s, lot);
  const bidders = {};
  for (const p of s.players) {
    if (p.human || p.bankrupt) continue;
    bidders[p.id] = { max: aiAuctionMax(s, p, lot), wait: 1.2 + rand(s) * 2.4 };
  }
  s.auction = { lotId, price: reserve, reserve, leader: -1, timer: AUCTION_SECONDS, bids: [], bidders, out: {} };
  news(s, `🔨 Auction: ${lot.name}, opening at ${money(reserve)}.`, 'auction');
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
