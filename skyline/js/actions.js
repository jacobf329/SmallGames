// Skyline Hustle - every player action by name. Single-player calls these
// directly; in LAN games the phone sends { name, args } and the server runs
// the same function for the sender's own company. Arguments are validated
// here so a client can never act for someone else or pass junk.

import {
  build, sellBusiness, setPrice, setStaff, setHours, setStock, rushDelivery, upgradeFit, buildApt, sellApt,
  sellLand, petition, makeOffer, acceptOffer, declineOffer, takeLoan, repayLoan,
} from './sim.js';
import { auctionBid, auctionPass } from './auction.js';

// Bad arguments throw; perform() turns that into a failed action.
const num = v => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('bad number'); return v; };
const opt = v => (v === undefined || v === null ? undefined : num(v));
const lot = (s, v) => { if (!Number.isInteger(v) || v < 0 || v >= s.lots.length) throw new Error('bad lot'); return v; };

const ACTIONS = {
  build:     (s, p, [l, type]) => build(s, p, lot(s, l), String(type)),
  sellBiz:   (s, p, [l]) => sellBusiness(s, p, lot(s, l)),
  price:     (s, p, [l, v]) => setPrice(s, p, lot(s, l), num(v)),
  staff:     (s, p, [l, v]) => setStaff(s, p, lot(s, l), Math.round(num(v))),
  hours:     (s, p, [l, from, len]) => setHours(s, p, lot(s, l), Math.round(num(from)), Math.round(num(len))),
  stock:     (s, p, [l, target, auto]) => setStock(s, p, lot(s, l), opt(target), typeof auto === 'boolean' ? auto : undefined),
  rush:      (s, p, [l]) => rushDelivery(s, p, lot(s, l)),
  refit:     (s, p, [l]) => upgradeFit(s, p, lot(s, l)),
  apt:       (s, p, [l]) => buildApt(s, p, lot(s, l)),
  sellApt:   (s, p, [l]) => sellApt(s, p, lot(s, l)),
  sellLand:  (s, p, [l]) => sellLand(s, p, lot(s, l)),
  petition:  (s, p, [l]) => petition(s, lot(s, l)),
  offer:     (s, p, [l, amt]) => makeOffer(s, p, lot(s, l), num(amt)),
  accept:    (s, p, [id]) => (s.offers.find(o => o.id === id)?.to === p ? acceptOffer(s, id) : { ok: false, msg: 'Not your offer.' }),
  decline:   (s, p, [id]) => (s.offers.find(o => o.id === id)?.to === p ? declineOffer(s, id) : { ok: false, msg: 'Not your offer.' }),
  loan:      (s, p, [amt]) => takeLoan(s, p, opt(amt)),
  repay:     (s, p, [amt]) => repayLoan(s, p, opt(amt)),
  bid:       (s, p, [amt]) => auctionBid(s, p, num(amt)),
  pass:      (s, p) => auctionPass(s, p),
};

export function perform(s, pid, name, args = []) {
  const fn = ACTIONS[name];
  if (!fn) return { ok: false, msg: 'Unknown action.' };
  if (!s || s.over) return { ok: false, msg: 'The game is over.' };
  const p = s.players[pid];
  if (!p || !p.human || p.bankrupt) return { ok: false, msg: 'You have no company in this game.' };
  if (!Array.isArray(args)) args = [];
  try {
    return fn(s, pid, args) || { ok: true };
  } catch (e) {
    return { ok: false, msg: 'That did not work.' };
  }
}
