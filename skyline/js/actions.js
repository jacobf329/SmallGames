// Skyline Hustle - every player action by name. Single-player calls these
// directly; in LAN games the phone sends { name, args } and the server runs
// the same function for the sender's own company. Arguments are validated
// here so a client can never act for someone else or pass junk.

import {
  build, sellBusiness, setPrice, setStaff, setHours, setStock, rushDelivery, upgradeFit, buildApt, sellApt,
  sellLand, petition, makeOffer, acceptOffer, declineOffer, takeLoan, repayLoan,
  hireStaff, fireStaff, trainStaff, raiseStaff, setRole, addFloor, startPromo, buildPark, buyout, survey,
} from './sim.js';
import { auctionBid, auctionPass, callAuction } from './auction.js';
import { chainSync, startLandmark, rushLandmark, bidProject } from './civic.js';
import { inboxRead, inboxDismiss, inboxClear, inboxMute } from './advisor.js';

// Bad arguments throw; perform() turns that into a failed action.
const num = v => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('bad number'); return v; };
const opt = v => (v === undefined || v === null ? undefined : num(v));
const lot = (s, v) => { if (!Number.isInteger(v) || v < 0 || v >= s.lots.length) throw new Error('bad lot'); return v; };

const ACTIONS = {
  build:     (s, p, [l, type, floors]) => build(s, p, lot(s, l), String(type), floors === undefined ? {} : { floors: Math.round(num(floors)) }),
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
  call:      (s, p, [l]) => callAuction(s, p, lot(s, l)),
  offer:     (s, p, [l, amt]) => makeOffer(s, p, lot(s, l), num(amt)),
  accept:    (s, p, [id]) => (s.offers.find(o => o.id === id)?.to === p ? acceptOffer(s, id) : { ok: false, msg: 'Not your offer.' }),
  decline:   (s, p, [id]) => (s.offers.find(o => o.id === id)?.to === p ? declineOffer(s, id) : { ok: false, msg: 'Not your offer.' }),
  loan:      (s, p, [amt]) => takeLoan(s, p, opt(amt)),
  repay:     (s, p, [amt]) => repayLoan(s, p, opt(amt)),
  bid:       (s, p, [amt]) => auctionBid(s, p, num(amt)),
  hire:      (s, p, [l, cand, role]) => hireStaff(s, p, lot(s, l), num(cand), String(role || 'server')),
  fire:      (s, p, [l, sid]) => fireStaff(s, p, lot(s, l), num(sid)),
  train:     (s, p, [l, sid]) => trainStaff(s, p, lot(s, l), num(sid)),
  raise:     (s, p, [l, sid]) => raiseStaff(s, p, lot(s, l), num(sid)),
  role:      (s, p, [l, sid, role]) => setRole(s, p, lot(s, l), num(sid), String(role)),
  floor:     (s, p, [l]) => addFloor(s, p, lot(s, l)),
  promo:     (s, p, [l, id]) => startPromo(s, p, lot(s, l), String(id)),
  park:      (s, p, [d, type]) => buildPark(s, p, Math.round(num(d)), String(type)),
  buyout:    (s, p, [l]) => buyout(s, p, lot(s, l)),
  survey:    (s, p, [d]) => survey(s, p, Math.round(num(d))),
  pass:      (s, p) => auctionPass(s, p),
  chainSync: (s, p, [l]) => chainSync(s, p, lot(s, l)),
  landmark:  (s, p, [l, id]) => startLandmark(s, p, lot(s, l), String(id)),
  lmRush:    (s, p) => rushLandmark(s, p),
  project:   (s, p, [id, amt]) => bidProject(s, p, num(id), num(amt)),
  inboxRead: (s, p, [ids]) => inboxRead(s, p, ids === 'all' ? 'all' : (Array.isArray(ids) ? ids.slice(0, 60).map(num) : [])),
  inboxDismiss: (s, p, [id]) => inboxDismiss(s, p, num(id)),
  inboxClear: (s, p) => inboxClear(s, p),
  inboxMute: (s, p, [cat, on]) => inboxMute(s, p, String(cat), !!on),
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
