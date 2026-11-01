// Skyline Hustle - HTML overlay: HUD, bottom sheet (lot, citizen and tabs),
// the live auction panel, toasts and modals. The city is drawn by render3d.js.

import {
  DISTRICTS, BUSINESSES, BIZ, FIT_LEVELS, MAX_STAFF, APT_NAMES, APT_RESIDENTS, MAX_APT, STATION_FARE,
  UTILITY_CUT, SCENARIOS, RIVALS, LOAN_STEP, LOAN_RATE, OVERHEAD_BASE, OVERHEAD_RATE, NEEDS, SEGMENTS,
  PRICE_STEP, PRICE_MIN, PRICE_MAX, AUTO_STOCK_PREMIUM, TECH, priceLabel, bizName, eraName,
  STAFF_ROLES, PARKS, PROMOS, SURVEY_COST, SURVEY_DAYS, MAX_FLOORS, MAX_STARS,
} from './data.js';
import {
  MAP, money, landValue, rentFor, ownsSet, setCount, estimate, sellLand, build, sellBusiness, setPrice,
  setStaff, setHours, setStock, rushDelivery, autoTarget, upgradeFit, fitCost, aptCheck, buildApt, sellApt,
  aptRentFor, makeOffer, acceptOffer, declineOffer, takeLoan, repayLoan, loanLimit, netWorth, playerAssets,
  capacity, districtPopulation, LEDGER_LABELS, operating, dayName, yearOf, techOf, bizOpen, bizLabel,
  petition, nextAuctionSlot, goalProgress, goalText, setsOwned, buildCost, floorCost, promoCost, buyoutPrice,
  canLandscape, parkSlots, blockStars, parkStars, trainCost, continueGame, BIZ_LEDGER,
} from './sim.js';
import { maxStaff, fairPay, effectiveness, avgMorale, teamWage, manager, clerks, servers } from './staff.js';
import { LENSES, LENS, lensData } from './lens.js';
import { auctionBid, settleRest, minBid, increment, canCall, reservePrice } from './auction.js';
import { citizenName, CHATTER_ICON, thoughtText, SHOP_COMMENTS } from './citizens.js';
import { SEG_COLORS } from './render3d.js';
import { sfx, setSound, soundOn } from './audio.js';

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sign = v => (v >= 0 ? '+' : '') + money(v);
const cls = v => v >= 0 ? 'pos' : 'neg';
const hh = h => String(((h % 24) + 24) % 24).padStart(2, '0') + ':00';
// The company this phone controls (0 in single-player; its seat in LAN games).
export let ME = 0;
export function setMe(id) { ME = id; }
export const getMe = () => ME;

export class UI {
  constructor(app) {
    this.app = app;
    this.view = null;          // { kind: 'lot'|'citizen'|'tab', ... }
    this.lastTouch = 0;
    this.seenNews = 0;
    this.shownOffers = new Set();
    this.offerDraft = {};
    this.counter = {};
    this.tickerQueue = [];
    this.tickerUntil = 0;
    this.auctionSeen = null;

    $('sheet-body').addEventListener('click', e => this.onClick(e));
    $('modal-card').addEventListener('click', e => this.onClick(e));
    $('auction').addEventListener('click', e => this.onClick(e));
    $('vote').addEventListener('click', e => this.onClick(e));
    $('layers').addEventListener('click', e => this.onClick(e));
    $('sheet').addEventListener('pointerdown', () => { this.lastTouch = performance.now(); });
    $('sheet-close').addEventListener('click', () => { sfx.tap(); this.close(); });
    $('hud-cash').addEventListener('click', () => { sfx.tap(); this.openTab('bank'); });
    $('goal').addEventListener('click', () => { sfx.tap(); this.openTab('goals'); });
    document.querySelectorAll('#nav button').forEach(b => b.addEventListener('click', () => {
      sfx.tap();
      const t = b.dataset.tab;
      if (t === 'map') { this.close(); this.app.renderer.fit(); return; }
      if (this.view?.kind === 'tab' && this.view.name === t) this.close();
      else this.openTab(t);
    }));
    document.querySelectorAll('#camctl button').forEach(b => b.addEventListener('click', () => {
      sfx.tap();
      const r = this.app.renderer, a = b.dataset.cam;
      if (a === 'left') r.rotate(-Math.PI / 4);
      else if (a === 'right') r.rotate(Math.PI / 4);
      else if (a === 'tilt') r.tilt();
      else if (a === 'layers') { this.lensOpen = true; $('layers').classList.toggle('hidden'); this.layersUI(); }
      else r.fit();
    }));
  }

  get s() { return this.app.s; }

  // ---------------------------------------------------------- sheet ----
  openLot(id) {
    const fresh = this.view?.kind !== 'lot' || this.view.id !== id;
    if (fresh) this.lotTab = 'manage';
    this.view = { kind: 'lot', id };
    this.app.renderer.sel = id;
    this.app.renderer.selCitizen = -1;
    this.render();
    if (fresh) $('sheet').scrollTop = 0;
    this.app.renderer.focusLot(this.s.lots[id], $('sheet').offsetHeight + 58);
  }
  openCitizen(id) {
    this.view = { kind: 'citizen', id };
    this.app.renderer.sel = -1;
    this.app.renderer.selCitizen = id;
    this.render();
  }
  openTab(name) {
    this.view = { kind: 'tab', name };
    this.app.renderer.sel = -1;
    this.app.renderer.selCitizen = -1;
    this.render();
    $('sheet').scrollTop = 0;
  }
  close() {
    this.view = null;
    this.app.renderer.sel = -1;
    this.app.renderer.selCitizen = -1;
    $('sheet').classList.add('hidden');
    this.navState();
  }
  navState() {
    document.querySelectorAll('#nav button').forEach(b => {
      const t = b.dataset.tab;
      b.classList.toggle('on', this.view ? this.view.kind === 'tab' && this.view.name === t : t === 'map');
    });
  }

  render() {
    const v = this.view;
    if (!v || !this.s) return;
    const scroll = $('sheet').scrollTop;
    let html = '';
    if (v.kind === 'lot') html = this.lotHTML(this.s.lots[v.id]);
    else if (v.kind === 'citizen') html = this.citizenHTML(v.id);
    else html = ({ empire: () => this.empireHTML(), sets: () => this.setsHTML(), goals: () => this.goalsHTML(), lens: () => this.lensHTML(),
      bank: () => this.bankHTML(), menu: () => this.menuHTML() })[v.name]();
    $('sheet-body').innerHTML = html;
    $('sheet').classList.remove('hidden');
    $('sheet').scrollTop = scroll;
    this.navState();
  }

  // Refresh live numbers unless the player is mid-tap; at most ~1.5x a second.
  refresh() {
    const now = performance.now();
    if (!this.view || now - this.lastTouch < 900 || now - (this.lastRefresh || 0) < 650) return;
    this.lastRefresh = now;
    this.render();
  }

  // ------------------------------------------------------------ lot ----
  lotHTML(lot) {
    const s = this.s;
    const owner = lot.owner >= 0 ? s.players[lot.owner] : null;
    const ownerTxt = !owner ? 'City land · sold at auction' : owner.id === ME ? 'Your land' : `Owned by ${esc(owner.company)}`;
    let chip, sub;
    if (lot.kind === 'prop') {
      const D = DISTRICTS[lot.district];
      chip = `<div class="chip" style="background:${D.color}"></div>`;
      sub = `${esc(D.name)} · ${ownerTxt}`;
    } else {
      chip = `<div class="chip" style="background:${lot.kind === 'station' ? '#2f80ed' : '#8c8c80'}">${lot.kind === 'station' ? '🚇' : lot.name.startsWith('Volt') ? '⚡' : '💧'}</div>`;
      sub = `${lot.kind === 'station' ? 'Metro station' : 'Utility'} · ${ownerTxt}`;
    }
    let h = `<div class="sh-head">${chip}<div><div class="sh-title">${esc(lot.name)}</div><div class="sh-sub">${sub}</div></div></div>`;
    if (lot.kind === 'prop') h += this.setBarHTML(lot.district, lot.id);
    else if (lot.kind === 'station') h += this.stationHTML(lot);
    else h += this.utilityHTML(lot);
    h += this.landHTML(lot);
    if (lot.kind === 'prop') {
      h += this.businessHTML(lot);
      h += this.aptHTML(lot);
      h += this.blockHTML(lot.district);
      h += this.chatterHTML(lot.district);
    }
    return h;
  }

  setBarHTML(d, current = -1) {
    const s = this.s;
    const ids = MAP.districtLots[d];
    const dots = ids.map((id, i) => {
      const l = s.lots[id];
      const c = l.owner >= 0 ? s.players[l.owner].color : 'rgba(255,255,255,0.08)';
      return `<span class="setdot ${id === current ? 'me' : ''}" style="background:${c}">${i + 1}</span>`;
    }).join('');
    const mine = setCount(s, ME, d), n = ids.length;
    let txt;
    const full = s.players.find(p => ownsSet(s, p.id, d));
    if (full && full.id === ME) txt = '<b class="pos">Set complete!</b> Ground rent and apartment rents ×2.';
    else if (full) txt = `<b class="neg">${esc(full.company)}</b> owns the whole set: double rents.`;
    else if (mine === n - 1) txt = '<b class="warn">One lot away</b> from the set bonus!';
    else if (mine) txt = `You own <b>${mine} of ${n}</b>. All ${n} = double rents.`;
    else {
      const lead = s.players.map(p => [p, setCount(s, p.id, d)]).sort((a, b) => b[1] - a[1])[0];
      txt = lead[1] ? `${esc(lead[0].company)} owns ${lead[1]} of ${n}.` : `Own all ${n} lots in this colour to double every rent here.`;
    }
    return `<div class="card setbar"><div class="setdots">${dots}</div><div class="note" style="margin:0">${txt}</div></div>`;
  }

  landHTML(lot) {
    const s = this.s, me = s.players[ME];
    const value = landValue(s, lot);
    let h = `<h3>Land <em>${money(value)}</em></h3>`;
    if (lot.kind === 'prop') {
      const rent = rentFor(s, lot);
      const tenant = lot.business && lot.business.owner !== lot.owner ? s.players[lot.business.owner] : null;
      h += `<div class="stats">
        <div class="stat"><small>Ground rent / day</small><b>${money(rent)}</b></div>
        <div class="stat"><small>Paid by</small><b style="font-size:13px">${tenant ? esc(tenant.company.split(' ')[0]) : lot.business ? 'nobody' : 'no tenant'}</b></div>
        <div class="stat"><small>Rent rate</small><b>${ownsSet(s, lot.owner, lot.district) ? '×2 set' : '×1'}</b></div>
      </div>`;
    }
    if (lot.owner === -1) {
      if (s.auction && s.auction.lotId === lot.id) h += '<p class="note warn"><b>🔨 Under the hammer right now!</b></p>';
      else {
        const chk = canCall(s, ME, lot.id);
        h += `<p class="note">The city sells land only at auction, when a tycoon calls one. Auctions are at least 6 game hours apart.
          </p><div class="row"><button class="btn go" data-act="call" ${chk.ok ? '' : 'disabled'}>🔨 Call an auction · open at ${money(reservePrice(s, lot))}</button></div>
          <p class="note">${chk.ok ? 'You place the opening bid; rivals can outbid you.' : esc(chk.msg)}</p>`;
      }
    } else if (lot.owner === ME) {
      const back = Math.round(value * 0.7 + lot.aptInvested * 0.5);
      h += `<div class="row"><button class="btn danger small" data-act="sell-land">Sell to city · +${money(back)}</button></div>`;
    } else {
      const ask = this.counter[lot.id];
      const draft = this.offerDraft[lot.id] ?? Math.round(value * 1.3 / 1000) * 1000;
      this.offerDraft[lot.id] = draft;
      h += `<div class="card">
        <div class="ctl"><span>Your offer</span>
          <div class="stepper"><button data-act="offer-adj" data-v="-5000">−</button><b style="min-width:90px">${money(draft)}</b><button data-act="offer-adj" data-v="5000">+</button></div></div>
        <div class="row"><button class="btn go" data-act="offer" ${me.cash < draft ? 'disabled' : ''}>Make offer to ${esc(s.players[lot.owner].name.split(' ')[0])}</button></div>
        ${ask ? `<p class="note">They said they'd take <b>${money(ask)}</b>. <button class="btn small gold" data-act="offer-ask">Pay ${money(ask)}</button></p>` : '<p class="note">Rivals ask far more for a lot that breaks their set or completes yours.</p>'}
      </div>`;
    }
    return h;
  }

  businessHTML(lot) {
    const s = this.s, me = s.players[ME];
    const b = lot.business;
    const year = yearOf(s);
    const tech = techOf(s);
    if (!b) {
      const rentNote = lot.owner === ME ? 'Your land: no ground rent.' :
        lot.owner === -1 ? `You'd lease from the city: ${money(rentFor(s, lot))}/day rent.` :
        `You'd pay ${esc(s.players[lot.owner].company)} ${money(rentFor(s, lot))}/day rent.`;
      const floors = this.buildFloors || 1;
      const open = BUSINESSES.filter(d => tech.biz.has(d.id));
      const locked = BUSINESSES.filter(d => !tech.biz.has(d.id)).sort((a, b) => a.year - b.year);
      const opts = open.map(def => ({ def, e: estimate(s, lot.id, def.id, ME, { floors, staff: 2 + floors }) })).sort((a, b) => b.e.profit - a.e.profit);
      const best = opts[0]?.def.id;
      return `<h3>Open a business</h3><p class="note">${rentNote} Forecasts assume fair prices and usual hours.</p>
        <div class="ctl"><span>Shop floors <small class="dim">more room, staff and stock</small></span>
          <div class="stepper"><button data-act="bfloors" data-v="-1">−</button><b>${floors}</b><button data-act="bfloors" data-v="1">+</button></div></div>
        <div class="biz-list">${opts.map(({ def, e }) => `
          <button class="biz-opt ${def.id === best && e.profit > 0 ? 'best' : ''}" data-act="build" data-type="${def.id}" ${me.cash < buildCost(def, floors) ? 'disabled' : ''}>
            <i>${def.icon}</i>
            <span><b>${esc(bizName(def, year))}</b><small>${money(buildCost(def, floors))} · ${hh(def.open[0])}–${hh(def.open[1])} · ~${Math.round(e.cust)} cust/day</small></span>
            <span class="est ${cls(e.profit)}">${sign(e.profit)}<small>per day</small></span>
          </button>`).join('')}
          ${locked.map(def => `<div class="biz-opt locked"><i>${def.icon}</i><span><b>${esc(bizName(def, def.year))}</b><small>Invented in ${def.year}</small></span><span class="est dim">🔒</span></div>`).join('')}
        </div>`;
    }
    const def = BIZ[b.type];
    const owner = s.players[b.owner];
    const name = bizName(def, year);
    const stars = '★'.repeat(Math.round((b.rep ?? 1) * 2.5)) + '☆'.repeat(Math.max(0, 3.5 - Math.round((b.rep ?? 1) * 2.5)));
    if (b.owner !== ME) {
      const e = estimate(s, lot.id, b.type, b.owner, {});
      const bo = lot.owner === ME ? buyoutPrice(s, lot) : 0;
      return `<h3>Business</h3><div class="card">
        <div class="row" style="margin:0"><span style="font-size:26px">${def.icon}</span>
        <div><b>${esc(name)}</b> <span class="stars">${stars}</span><div class="note" style="margin:0">Run by <b style="color:${owner.color}">${esc(owner.company)}</b> · ${Math.round(b.price * 100)}% prices · ${FIT_LEVELS[b.fit].name} · ${b.team ? b.team.length : b.staff} staff · ${b.floors || 1} floor${(b.floors || 1) > 1 ? 's' : ''} · ${hh(b.from)}–${hh(b.from + b.len)}${b.promo ? ' · 📣 advertising' : ''}</div></div></div>
        <p class="note">Est. ~${Math.round(e.cust)} customers a day. ${lot.owner === ME ? `They pay you <b class="pos">${money(rentFor(s, lot))}</b> a day in rent.` : ''}</p>
        ${bo ? `<div class="row"><button class="btn gold" data-act="buyout" ${me.cash < bo ? 'disabled' : ''}>💼 Buy them out · ${money(bo)}</button></div>
          <p class="note">It's your land, so they must sell. ${ownsSet(s, ME, lot.district) ? '<b class="pos">Full colour set: buyout at a discount.</b>' : 'Own the whole colour set and buyouts get much cheaper.'}</p>` : ''}</div>`;
    }
    const tab = this.lotTab || 'manage';
    const y = b.yesterday;
    const t = y || b.today;
    const profitY = t.rev - t.cost;
    let h = `<h3>${def.icon} ${esc(name)} <em>${FIT_LEVELS[b.fit].name} · ${b.floors || 1}F · <span class="stars">${stars}</span></em></h3>
      <div class="stats">
        <div class="stat"><small>${y ? 'Yesterday' : 'Today so far'}</small><b class="${cls(profitY)}">${sign(profitY)}</b></div>
        <div class="stat"><small>Customers</small><b>${Math.round(t.cust)}</b></div>
        <div class="stat"><small>Turned away</small><b class="${t.turned > 5 ? 'warn' : ''}">${Math.round(t.turned)}</b></div>
      </div>
      <div class="seg tabs">${[['manage', '⚙️<small>Manage</small>'], ['staff', '👥<small>Staff</small>'], ['customers', '💬<small>Reviews</small>'], ['promote', '📣<small>Promote</small>'], ['books', '📒<small>Books</small>']]
        .map(([k, n]) => `<button data-act="ltab" data-v="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    if (tab === 'staff') return h + this.staffTabHTML(lot, b);
    if (tab === 'customers') return h + this.customersTabHTML(lot, b);
    if (tab === 'promote') return h + this.promoTabHTML(lot, b);
    if (tab === 'books') return h + this.booksTabHTML(lot, b);
    const cap = capacity(b);
    const e = estimate(s, lot.id, b.type, ME, {});
    const fc = fitCost(b);
    const openNow = bizOpen(b, s.hour);
    const target = b.autoStock ? autoTarget(b) : b.stockTarget;
    const nextFit = FIT_LEVELS[b.fit + 1];
    h += `<div class="note" style="margin-bottom:0">Busiest hour used ${Math.round(Math.min(1.5, t.peak) * 100)}% of ${Math.round(cap)}/hr capacity · ${openNow ? '<span class="pos">open now</span>' : '<span class="dim">closed now</span>'}</div>
    <div class="meter"><i class="${t.peak >= 1 ? 'hot' : ''}" style="width:${Math.round(Math.min(1, t.peak) * 100)}%"></i></div>
    ${this.barsHTML(b.hist, 'Daily profit, last two weeks')}`;
    h += `<div class="ctl"><span>Price <small class="dim">avg ticket</small></span>
      <div class="stepper"><button data-act="price" data-v="-1">−</button><b style="min-width:96px">$${(def.ticket * b.price).toFixed(2)}<small class="sub">${Math.round(b.price * 100)}% · ${priceLabel(b.price)}</small></b><button data-act="price" data-v="1">+</button></div></div>
      <div class="ctl"><span>Servers <small class="dim">quick hire / let go · see Staff</small></span>
      <div class="stepper"><button data-act="staff" data-v="-1">−</button><b>${servers(b)}</b><button data-act="staff" data-v="1">+</button></div></div>
      <div class="ctl"><span>Opens at</span>
      <div class="stepper"><button data-act="open" data-v="-1">−</button><b style="min-width:64px">${hh(b.from)}</b><button data-act="open" data-v="1">+</button></div></div>
      <div class="ctl"><span>Open for <small class="dim">closes ${hh(b.from + b.len)}${b.len > 12 ? ' · long shifts hurt morale' : ''}</small></span>
      <div class="stepper"><button data-act="len" data-v="-1">−</button><b style="min-width:64px">${b.len === 24 ? '24h' : b.len + 'h'}</b><button data-act="len" data-v="1">+</button></div></div>`;
    h += `<div class="card">
      <div class="ctl" style="margin-top:0"><span>📦 Stock <small class="dim">06:00${clerks(b) ? ' + 13:00 (clerks)' : ''}</small></span>
        <div class="seg small" style="min-width:150px"><button data-act="auto" data-v="1" class="${b.autoStock ? 'on' : ''}">Auto</button><button data-act="auto" data-v="0" class="${!b.autoStock ? 'on' : ''}">Manual</button></div></div>
      <div class="stats">
        <div class="stat"><small>On shelves</small><b class="${b.stock < 8 ? 'neg' : ''}">${Math.round(b.stock)}</b></div>
        <div class="stat"><small>Sold ${y ? 'yest.' : 'today'}</small><b>${Math.round(t.cust)}</b></div>
        <div class="stat"><small>${def.perish ? 'Spoiled' : 'Storage'}</small><b>${def.perish ? Math.round(t.waste || 0) : '1%/day'}</b></div>
      </div>
      ${b.autoStock ? `<p class="note">Auto-restock orders ~${target} a day from a wholesaler at +${Math.round(AUTO_STOCK_PREMIUM * 100)}%.</p>` :
        `<div class="ctl"><span>Delivery up to</span><div class="stepper"><button data-act="stock" data-v="-1">−</button><b style="min-width:64px">${b.stockTarget}</b><button data-act="stock" data-v="1">+</button></div></div>`}
      ${def.perish ? `<p class="note">${Math.round(def.perish * 100)}% of unsold stock spoils overnight${clerks(b) ? ', less with clerks rotating the shelves' : ''}.</p>` : ''}
      <div class="row"><button class="btn small" data-act="rush">🚚 Rush delivery now (+25%)</button></div>
    </div>`;
    h += `<p class="note">Forecast at these settings: <b class="${cls(e.profit)}">${sign(e.profit)}/day</b> from ~${Math.round(e.cust)} customers${e.lost > 3 ? `, <span class="warn">${Math.round(e.lost)} turned away (hire!)</span>` : ''}.</p>
      <div class="row">
        ${fc ? (b.fit + 1 <= techOf(s).fit ? `<button class="btn small" data-act="refit" ${me.cash < fc ? 'disabled' : ''}>Refit: ${nextFit.name} · ${money(fc)}</button>`
          : `<button class="btn small" disabled>${nextFit.name} fit-outs arrive ${nextFit.year}</button>`) : ''}
        ${(b.floors || 1) < MAX_FLOORS ? `<button class="btn small" data-act="floor" ${me.cash < floorCost(b) ? 'disabled' : ''}>Add floor · ${money(floorCost(b))}</button>` : ''}
      </div>
      <div class="row"><button class="btn small danger" data-act="sell-biz">Close · +${money(b.invested * 0.5)}</button></div>`;
    return h;
  }

  // Small SVG bar chart of daily values.
  // ---------------------------------------------------------- books ----
  // History rows for a business (or the company, lotId -1). LAN games fetch
  // them from the server on demand instead of shipping them every update.
  history(lotId) {
    const s = this.s;
    const local = lotId >= 0 ? s.lots[lotId].business?.days : s.players[ME].days;
    if (local) return local;
    this.app.fetchHistory?.(lotId);
    return this.app.histCache?.get(lotId) || [];
  }

  // Line or bar chart of one metric over days, with axis labels.
  chartHTML(rows, key, fmt, kind = 'line') {
    const pts = rows.map(r => (typeof key === 'function' ? key(r) : r[key])).map(v => (v == null ? null : +v));
    const vals = pts.filter(v => v != null);
    if (vals.length < 2) return '<p class="note">Not enough history yet: check back after a couple of days.</p>';
    let max = Math.max(...vals), min = Math.min(...vals);
    if (kind === 'bar') { max = Math.max(max, 0); min = Math.min(min, 0); }
    if (max === min) { max += 1; min -= kind === 'bar' ? 0 : 1; }
    const W = 100, H = 60, n = pts.length;
    const y = v => H - 4 - (v - min) / (max - min) * (H - 8);
    let body;
    if (kind === 'bar') {
      const w = W / n, zero = y(0);
      body = pts.map((v, i) => v == null ? '' : `<rect x="${(i * w + w * 0.15).toFixed(2)}" y="${Math.min(y(v), zero).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" height="${Math.max(0.6, Math.abs(zero - y(v))).toFixed(2)}" fill="${v >= 0 ? '#3ddc84' : '#ff5a6e'}"/>`).join('')
        + `<line x1="0" x2="100" y1="${zero.toFixed(2)}" y2="${zero.toFixed(2)}" stroke="rgba(255,255,255,0.3)" stroke-width="0.4"/>`;
    } else {
      const xy = pts.map((v, i) => v == null ? null : `${(i / (n - 1) * W).toFixed(2)},${y(v).toFixed(2)}`).filter(Boolean);
      body = `<polyline points="0,${H} ${xy.join(' ')} ${W},${H}" fill="rgba(46,230,255,0.12)" stroke="none"/>
        <polyline points="${xy.join(' ')}" fill="none" stroke="#2ee6ff" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
    }
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
    const first = rows[0]?.d, last = rows[rows.length - 1]?.d;
    return `<div class="chart big"><div class="axis"><span>${fmt(max)}</span><span>${fmt(min)}</span></div>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none">${body}</svg></div>
      <div class="chart-foot"><span>${first !== undefined ? 'day ' + first : ''}</span><span>avg ${fmt(avg)} · latest ${fmt(vals[vals.length - 1])}</span><span>${last !== undefined ? 'day ' + last : ''}</span></div>`;
  }

  booksTabHTML(lot, b) {
    const s = this.s;
    const rows = this.history(lot.id);
    const period = this.booksPeriod || '7';
    const def = BIZ[b.type];
    const fm = v => money(v), int = v => Math.round(v).toLocaleString(), pc = v => Math.round(v * 100) + '%';
    // Ledger for the chosen period.
    let led = {}, label;
    const add = l => { for (const [k, v] of Object.entries(l || {})) led[k] = (led[k] || 0) + v; };
    if (period === 'today') { add(b.today.led); label = 'today so far'; }
    else if (period === 'yesterday') { add(rows[rows.length - 1]?.led); label = 'yesterday'; }
    else {
      const n = period === 'all' ? rows.length : +period;
      rows.slice(-n).forEach(r => add(r.led));
      label = period === 'all' ? `all ${rows.length} days on record` : `last ${Math.min(n, rows.length)} days`;
    }
    const keys = Object.keys(BIZ_LEDGER).filter(k => led[k]);
    const op = keys.reduce((a, k) => a + led[k], 0);
    const lifetime = rows.reduce((a, r) => a + r.profit, 0) + (b.today.rev - b.today.cost);
    let h = `<div class="seg small periods">${[['today', 'Today'], ['yesterday', 'Yest.'], ['7', '7 days'], ['30', '30 days'], ['all', 'All']]
      .map(([k, n]) => `<button data-act="bperiod" data-v="${k}" class="${period === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <h3>Books <em>${label}</em></h3>`;
    h += keys.length ? `<table class="ledger">${keys.map(k => `<tr><td>${BIZ_LEDGER[k]}</td><td class="${cls(led[k])}">${sign(led[k])}</td></tr>`).join('')}
      <tr class="total"><td>Operating profit</td><td class="${cls(op)}">${sign(op)}</td></tr></table>` : '<p class="note">Nothing booked yet for this period.</p>';
    const spoiled = period === 'today' ? 0 : rows.slice(period === 'yesterday' ? -1 : period === 'all' ? 0 : -(+period)).reduce((a, r) => a + (r.wasteV || 0), 0);
    if (spoiled) h += `<p class="note">Included in deliveries: <b>${money(spoiled)}</b> of stock spoiled unsold.</p>`;
    h += `<div class="stats">
      <div class="stat"><small>Invested</small><b>${money(b.invested)}</b></div>
      <div class="stat"><small>Earned since day ${b.opened}</small><b class="${cls(lifetime)}">${sign(lifetime)}</b></div>
      <div class="stat"><small>Paid back</small><b>${Math.max(0, Math.round(lifetime / b.invested * 100))}%</b></div></div>`;
    // Metric over time.
    const METRICS = [
      ['profit', 'Profit', fm, 'bar'], ['rev', 'Revenue', fm], ['cost', 'Costs', fm], ['cust', 'Customers', int], ['turned', 'Turned away', int],
      ['ticket', 'Avg ticket', v => '$' + v.toFixed(2)], ['price', 'Price', pc], ['stock', 'Stock at close', int], ['deliv', 'Delivered', int],
      ['waste', 'Spoiled', int], ['staff', 'Staff', int], ['wage', 'Wage bill / hr', fm], ['morale', 'Morale', pc], ['rep', 'Reputation', v => v.toFixed(2)],
      ['happy', 'Happiness', pc], ['peak', 'Busiest hour', pc], ['hours', 'Hours open', int],
    ];
    const mk = this.booksMetric || 'profit';
    const m = METRICS.find(x => x[0] === mk) || METRICS[0];
    const span = period === 'all' ? rows.length : period === '30' ? 30 : 14;
    h += `<h3>Over time <em>${m[1]}</em></h3>
      <div class="metric-pick">${METRICS.map(([k, n]) => `<button data-act="bmetric" data-v="${k}" class="${mk === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${this.chartHTML(rows.slice(-span), m[0], m[2], m[3] || 'line')}`;
    // Today's shelves hour by hour.
    const sh = (b.today.stockH || []).map((v, i) => ({ d: i, v }));
    const yh = (b.yesterday?.stockH || []).map((v, i) => ({ d: i, v }));
    const use = sh.filter(x => x.v != null).length >= 2 ? sh : yh;
    if (use.length >= 2) h += `<h3>Shelves hour by hour <em>${use === sh ? 'today' : 'yesterday'}</em></h3>
      ${this.chartHTML(use, 'v', int).replace(/day (\d+)/g, (_, x) => hh(+x))}
      <p class="note">Deliveries arrive at 06:00${clerks(b) ? ' and 13:00' : ''}. ${def.perish ? `${Math.round(def.perish * 100)}% of what's left spoils at midnight.` : 'Unsold stock costs 1% a day to store.'}</p>`;
    return h;
  }

  companyChartHTML() {
    const rows = this.history(-1);
    const fm = v => money(v);
    const METRICS = [
      ['worth', 'Net worth', r => r.worth], ['cash', 'Cash', r => r.cash], ['loan', 'Loan', r => r.loan], ['op', 'Operating profit', r => r.op, 'bar'],
      ['sales', 'Sales', r => r.led.sales || 0], ['goods', 'Stock', r => -(r.led.goods || 0)], ['wages', 'Wages', r => -(r.led.wages || 0)],
      ['rentPaid', 'Rent paid', r => -(r.led.rentPaid || 0)], ['rentIn', 'Rent received', r => r.led.rentIn || 0], ['aptRent', 'Apartment rent', r => r.led.aptRent || 0],
      ['shops', 'Shops', r => r.shops],
    ];
    const mk = this.bankMetric || 'worth';
    const m = METRICS.find(x => x[0] === mk) || METRICS[0];
    return `<h3>Company over time <em>${m[1]}</em></h3>
      <div class="metric-pick">${METRICS.map(([k, n]) => `<button data-act="cmetric" data-v="${k}" class="${mk === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${this.chartHTML(rows.slice(-30), m[2], mk === 'shops' ? v => Math.round(v) : fm, m[3] || 'line')}`;
  }

  barsHTML(vals, label) {
    if (!vals || vals.length < 2) return '';
    const max = Math.max(1, ...vals.map(Math.abs));
    const w = 100 / vals.length;
    const bars = vals.map((v, i) => {
      const hgt = Math.abs(v) / max * 28;
      return `<rect x="${(i * w + w * 0.15).toFixed(2)}" y="${(v >= 0 ? 30 - hgt : 30).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" height="${Math.max(0.5, hgt).toFixed(2)}" fill="${v >= 0 ? '#3ddc84' : '#ff5a6e'}"/>`;
    }).join('');
    return `<div class="chart"><small>${label} · best ${money(Math.max(...vals))}</small><svg viewBox="0 0 100 60" preserveAspectRatio="none">${bars}<line x1="0" x2="100" y1="30" y2="30" stroke="rgba(255,255,255,0.25)" stroke-width="0.4"/></svg></div>`;
  }

  staffTabHTML(lot, b) {
    const s = this.s, me = s.players[ME];
    const mood = m => (m.morale > 0.7 ? '😄' : m.morale > 0.45 ? '🙂' : m.morale > 0.3 ? '😕' : '😠');
    const room = maxStaff(b) - b.team.length;
    let h = `<div class="stats">
      <div class="stat"><small>Serves / hour</small><b>${Math.round(capacity(b))}</b></div>
      <div class="stat"><small>Wage bill / hr</small><b>${money(teamWage(b))}</b></div>
      <div class="stat"><small>Morale</small><b>${mood({ morale: avgMorale(b) })} ${Math.round(avgMorale(b) * 100)}%</b></div></div>
      <p class="note">${manager(b) ? `Managed by <b>${esc(manager(b).name)}</b>.` : 'No manager: promote someone to lift morale and service.'}
      ${clerks(b) ? ` ${clerks(b)} stock clerk${clerks(b) > 1 ? 's' : ''}: a 13:00 restock and less spoilage.` : ' A stock clerk adds a 13:00 restock.'}
      ${b.len > 12 ? ' <span class="warn">Long opening hours are wearing the team down.</span>' : ''}</p>`;
    h += b.team.map(m => {
      const fair = fairPay(b.type, m.role, m.skill);
      const role = STAFF_ROLES[m.role];
      return `<div class="card staff">
        <div class="row" style="margin:0"><span style="font-size:20px">${role.icon}</span>
          <span class="grow"><b>${esc(m.name)}</b><small>${role.name}${m.train ? ' · 🎓 training' : ''} · ${m.days}d · ${money(m.pay)}/hr${m.pay < fair * 0.95 ? ' <span class="warn">(underpaid)</span>' : ''}</small></span>
          <span class="skill">${'★'.repeat(Math.round(m.skill * 3))}</span></div>
        <div class="row" style="margin:4px 0 0"><span style="font-size:16px">${mood(m)}</span><div class="meter grow"><i class="${m.morale < 0.35 ? 'hot' : ''}" style="width:${Math.round(m.morale * 100)}%"></i></div></div>
        <div class="row" style="margin:6px 0 0;flex-wrap:wrap">
          <button class="btn small" data-act="sraise" data-id="${m.id}">💵 +10%</button>
          <button class="btn small" data-act="strain" data-id="${m.id}" ${m.train || m.skill >= 1.55 || me.cash < trainCost(b, m) ? 'disabled' : ''}>🎓 ${money(trainCost(b, m))}</button>
          ${m.role !== 'manager' ? `<button class="btn small" data-act="srole" data-id="${m.id}" data-v="manager" ${manager(b) ? 'disabled' : ''}>👔 Boss</button>` : `<button class="btn small" data-act="srole" data-id="${m.id}" data-v="server">Demote</button>`}
          ${m.role === 'server' ? `<button class="btn small" data-act="srole" data-id="${m.id}" data-v="clerk">📦 Clerk</button>` : m.role === 'clerk' ? `<button class="btn small" data-act="srole" data-id="${m.id}" data-v="server">🧑‍🍳 Server</button>` : ''}
          <button class="btn small danger" data-act="sfire" data-id="${m.id}" ${b.team.length <= 1 ? 'disabled' : ''}>Fire</button>
        </div></div>`;
    }).join('');
    h += `<h3>Looking for work <em>${room > 0 ? `${room} place${room > 1 ? 's' : ''} free` : 'team full: add a floor'}</em></h3>`;
    h += (b.cands || []).map(c => `<div class="card staff"><div class="row" style="margin:0">
        <span class="grow"><b>${esc(c.name)}</b><small>asks ${money(c.pay)}/hr as a server</small></span><span class="skill">${'★'.repeat(Math.round(c.skill * 3))}</span></div>
        <div class="row" style="margin:6px 0 0">
          <button class="btn small buy" data-act="hire" data-id="${c.id}" data-v="server" ${room <= 0 ? 'disabled' : ''}>Hire as server</button>
          <button class="btn small" data-act="hire" data-id="${c.id}" data-v="clerk" ${room <= 0 ? 'disabled' : ''}>As clerk</button>
          ${manager(b) ? '' : `<button class="btn small" data-act="hire" data-id="${c.id}" data-v="manager" ${room <= 0 ? 'disabled' : ''}>As manager</button>`}
        </div></div>`).join('') || '<p class="note">Nobody new today. Check back tomorrow.</p>';
    return h + '<p class="note">Skill grows with experience and training. Morale follows pay, hours, stress and management. Below a quarter, people quit.</p>';
  }

  customersTabHTML(lot, b) {
    const fb = { ...(b.fb || {}) };
    for (const k in b.today.fb || {}) fb[k] = (fb[k] || 0) + b.today.fb[k];
    const items = Object.entries(fb).filter(([k]) => SHOP_COMMENTS[k]).sort((a, c) => c[1] - a[1]);
    const good = items.filter(([k]) => SHOP_COMMENTS[k].good).reduce((a, [, v]) => a + v, 0);
    const total = items.reduce((a, [, v]) => a + v, 0);
    const score = total ? Math.round(good / total * 100) : null;
    const name = bizLabel(this.s, b.type);
    const t = b.yesterday || b.today;
    const segTotal = (t.seg || []).reduce((a, v) => a + v, 0);
    const part = (keys) => { const bad = keys.reduce((a, k) => a + (fb[k] || 0), 0); return total ? Math.max(0, 100 - Math.round(bad / total * 300)) : 100; };
    let h = `<div class="card"><div class="row" style="margin:0"><b class="grow">Customer satisfaction</b><b class="${score == null ? '' : score >= 60 ? 'pos' : 'neg'}">${score == null ? '–' : score + '%'}</b></div>
      ${[['Service', ['slow', 'grumpy']], ['Prices', ['pricey']], ['Stock', ['stockout']], ['Waiting', ['queue']], ['Hours', ['closed']]].map(([n, k]) => {
        const v = part(k);
        return `<div class="need"><span class="grow">${n}</span><div class="meter" style="width:55%"><i class="${v < 50 ? 'hot' : ''}" style="width:${v}%"></i></div></div>`;
      }).join('')}</div>`;
    h += '<h3>What customers say</h3>' + (items.length ? items.map(([k, v]) => `<div class="chat"><span>${SHOP_COMMENTS[k].icon}</span><span class="grow">“${esc(SHOP_COMMENTS[k].text(name))}”</span><b>${Math.round(v)}</b></div>`).join('')
      : '<p class="note">No comments yet. Give it a day.</p>');
    if (segTotal) {
      h += `<h3>Who shops here <em>${b.yesterday ? 'yesterday' : 'today'}</em></h3>` + SEGMENTS.map((n, i) => {
        const v = t.seg[i] / segTotal;
        return `<div class="need"><span style="color:${SEG_COLORS[i]}">●</span><span class="grow">${n}</span><div class="meter" style="width:50%"><i style="width:${Math.round(v * 100)}%;background:${SEG_COLORS[i]}"></i></div><b style="min-width:36px;text-align:right">${Math.round(v * 100)}%</b></div>`;
      }).join('');
      const from = Object.entries(t.from || {}).sort((a, c) => c[1] - a[1]).slice(0, 4);
      h += `<p class="note">Coming from: ${from.map(([d, v]) => `<span style="color:${DISTRICTS[d].color}">■</span> ${esc(DISTRICTS[d].short)} ${Math.round(v / segTotal * 100)}%`).join(' · ')}</p>`;
    }
    return h;
  }

  promoTabHTML(lot, b) {
    const s = this.s, me = s.players[ME];
    const year = yearOf(s);
    let h = b.promo ? `<div class="card"><b>📣 ${esc(PROMOS.find(p => p.id === b.promo.id)?.name || 'Campaign')} running</b>
      <div class="note">+${Math.round((b.promo.boost - 1) * 100)}% pull on customers until the end of day ${b.promo.until}.</div></div>` :
      '<p class="note">Advertising makes the shop more attractive to everyone in walking range. Best when you have spare capacity.</p>';
    h += PROMOS.map(pr => {
      const locked = year < pr.year;
      const cost = promoCost(b, pr);
      return `<button class="biz-opt" data-act="promo" data-id="${pr.id}" ${locked || b.promo || me.cash < cost ? 'disabled' : ''}>
        <i>${pr.icon}</i><span><b>${pr.name}</b><small>${locked ? `Arrives ${pr.year}` : `+${Math.round((pr.boost - 1) * 100)}% for ${pr.days} days`}</small></span>
        <span class="est">${locked ? '🔒' : money(cost)}</span></button>`;
    }).join('');
    return h;
  }

  // Block appeal (stars), parks and market research.
  blockHTML(d) {
    const s = this.s, me = s.players[ME];
    const year = yearOf(s);
    const st = blockStars(s, d);
    const full = Math.floor(st), half = st % 1 >= 0.5;
    const parks = (s.parks || []).filter(p => p.d === d);
    const slots = parkSlots(s, d).length;
    const can = canLandscape(s, ME, d);
    let h = `<h3>Block appeal <em><span class="stars">${'★'.repeat(full)}${half ? '½' : ''}${'☆'.repeat(Math.max(0, MAX_STARS - full - (half ? 1 : 0)))}</span></em></h3>
      <p class="note">Stars draw wealthy shoppers and visitors, and lift land values and apartment rents.
      ${parks.length ? 'Here: ' + parks.map(p => { const pk = PARKS.find(x => x.id === p.type); return `${pk.icon} ${pk.name} (${esc(s.players[p.owner].company.split(' ')[0])})`; }).join(', ') + '.' : ''}</p>`;
    if (can) {
      h += `<div class="biz-list">${PARKS.map(pk => `<button class="biz-opt" data-act="park" data-id="${pk.id}" ${year < pk.year || me.cash < pk.cost || (parks.length >= slots && !parks.some(p => PARKS.findIndex(x => x.id === p.type) < PARKS.indexOf(pk))) ? 'disabled' : ''}>
        <i>${pk.icon}</i><span><b>${pk.name}</b><small>${year < pk.year ? `Arrives ${pk.year}` : `+${pk.stars} stars`}</small></span><span class="est">${year < pk.year ? '🔒' : money(pk.cost)}</span></button>`).join('')}</div>
        <p class="note">${slots} open space${slots > 1 ? 's' : ''} on this block. A better park replaces the weakest one when it's full.</p>`;
    } else h += '<p class="note">Own at least half this block to landscape it.</p>';
    const sv = s.surveys?.[ME]?.[d];
    if (sv && sv.until >= s.day) {
      h += `<h3>Market survey <em>day ${sv.day}</em></h3>` + sv.items.slice(0, 6).map(it => `<div class="chat"><span>${BIZ[it.type].icon}</span>
        <span class="grow">${esc(bizLabel(s, it.type))}<small class="dim"> · ~${it.cust}/day${it.rivals ? ` · ${it.rivals} rival${it.rivals > 1 ? 's' : ''} nearby` : ' · no competition'}${it.wanted ? ` · ${it.wanted} asking` : ''}</small></span>
        <b class="${cls(it.profit)}">${sign(it.profit)}</b></div>`).join('');
    } else h += `<div class="row"><button class="btn small" data-act="survey" ${me.cash < SURVEY_COST ? 'disabled' : ''}>📋 Commission a market survey · ${money(SURVEY_COST)}</button></div>
      <p class="note">Ranks every kind of business for this block: expected customers, profit and local competition. Valid ${SURVEY_DAYS} days.</p>`;
    return h;
  }

  aptHTML(lot) {
    const s = this.s, me = s.players[ME];
    let h = `<h3>Apartments <em>${APT_NAMES[lot.apt]}</em></h3>`;
    if (lot.apt) h += `<div class="stats">
      <div class="stat"><small>Residents</small><b>+${APT_RESIDENTS[lot.apt]}</b></div>
      <div class="stat"><small>Rent / day</small><b class="pos">${money(aptRentFor(s, lot))}</b></div>
      <div class="stat"><small>Collected by</small><b style="font-size:13px">${lot.owner === ME ? 'You' : lot.owner >= 0 ? esc(s.players[lot.owner].company.split(' ')[0]) : '-'}</b></div></div>`;
    if (lot.owner !== ME) {
      if (!lot.apt) h += '<p class="note">The landowner can build apartments above the shop.</p>';
      return h;
    }
    const chk = aptCheck(s, ME, lot.id);
    const set = ownsSet(s, ME, lot.district);
    if (chk.ok) {
      const next = lot.apt + 1;
      h += `<div class="row"><button class="btn gold" data-act="apt" ${me.cash < chk.cost ? 'disabled' : ''}>
        ${next === MAX_APT ? '🏙️ Build Skyline Tower' : `🏢 Build up to ${APT_NAMES[next]}`} · ${money(chk.cost)}</button></div>
        <p class="note">+${APT_RESIDENTS[next] - APT_RESIDENTS[lot.apt]} residents: more customers for every shop nearby.
        ${set ? '<b class="pos">Full set: rents doubled.</b>' : 'Own the whole colour set to double the rent.'}</p>`;
    } else if (lot.apt < MAX_APT) h += `<p class="note">🔒 ${esc(chk.msg)}</p>`;
    if (lot.apt) h += `<div class="row"><button class="btn small danger" data-act="sell-apt">Demolish one level</button></div>`;
    return h;
  }

  chatterHTML(d) {
    const s = this.s;
    const year = yearOf(s);
    const items = Object.entries(s.chatter[d]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const pop = districtPopulation(s, d);
    let h = `<h3>Word on the street <em>${Math.round(pop.residents).toLocaleString()} residents · ${Math.round(pop.tourists).toLocaleString()} visitors</em></h3>`;
    if (!items.length) return h + '<p class="note">Locals seem content. For now.</p>';
    h += items.map(([k, v]) => {
      const [reason, type] = k.split('|');
      return `<div class="chat"><span>${CHATTER_ICON[reason]}</span><span class="grow">“${esc(thoughtText(s, reason, type))}”</span><b>${Math.round(v)}</b></div>`;
    }).join('');
    return h + '<p class="note">People per day grumbling. Unmet demand is opportunity.</p>';
  }

  stationHTML(lot) {
    const s = this.s;
    const k = lot.owner >= 0 ? s.lots.filter(l => l.kind === 'station' && l.owner === lot.owner).length : 0;
    const rows = [1, 2, 3, 4].map(n => `<div class="stat"><small>Own ${n}</small><b>${money(STATION_FARE[n])}</b></div>`).join('');
    return `<p class="note">Stations collect fares every night, paying more per station the more one company owns.
      Visitors arriving here shop on the nearby blocks.${lot.owner >= 0 ? ` Owner holds <b>${k}</b> of 4.` : ''}</p>
      <div class="stats" style="grid-template-columns:repeat(4,1fr)">${rows}</div><p class="note">Fare per station per day.</p>`;
  }
  utilityHTML() {
    const s = this.s;
    const pool = s.lots.reduce((a, l) => a + (l.business ? OVERHEAD_BASE + BIZ[l.business.type].cost * OVERHEAD_RATE : 0), 0);
    return `<p class="note">Every business pays a nightly bill. Each utility you own takes
      <b>${Math.round(UTILITY_CUT[1] * 100)}%</b> of it, or <b>${Math.round(UTILITY_CUT[2] * 100)}%</b> each if you own both.
      The city's bills are now <b>${money(pool)}</b> a night.</p>`;
  }

  // -------------------------------------------------------- citizen ----
  citizenHTML(id) {
    const s = this.s;
    const c = s.cz.list.find(x => x.id === id) || this.app.citizenCache?.get(id);
    if (!c) return this.app.mp ? '<p class="note">Looking them up…</p>' : '<p class="note">They have left town.</p>';
    const D = DISTRICTS[c.d];
    const fav = c.fav >= 0 && s.lots[c.fav].business ? s.lots[c.fav] : null;
    const bars = NEEDS.map((n, i) => {
      const v = Math.min(1.5, c.needs[i] / c.th);
      return `<div class="need"><span>${n.icon}</span><span class="grow">${n.label}</span><div class="meter" style="width:45%"><i class="${v >= 1 ? 'hot' : ''}" style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div></div>`;
    }).join('');
    return `<div class="sh-head"><div class="chip" style="background:${SEG_COLORS[c.seg]}">${c.tourist ? '📷' : '🙂'}</div><div>
      <div class="sh-title">${esc(citizenName(c))}</div>
      <div class="sh-sub">${c.tourist ? 'Visitor' : SEGMENTS[c.seg] + ' household'} · ${c.tourist ? 'exploring' : 'lives in'} ${esc(D.name)}${c.lot >= 0 ? ' (apartments)' : ''}</div></div></div>
      ${c.thought ? `<div class="card thought">💭 “${esc(c.thought)}”</div>` : ''}
      <h3>Needs <em>${c.visits} shop visits</em></h3>${bars}
      <p class="note">Price sensitivity: <b>${c.sens < 0.85 ? 'relaxed' : c.sens > 1.15 ? 'tight-fisted' : 'average'}</b>${fav ? ` · Favourite: <b>${esc(bizLabel(s, fav.business.type))}</b> on ${esc(fav.name)}` : ''}.
      Each figure on the street is a group of ${8} people.</p>`;
  }

  // --------------------------------------------------------- empire ----
  empireHTML() {
    const s = this.s, me = s.players[ME];
    const op = operating(me.yesterday);
    const mine = s.lots.filter(l => (l.business && l.business.owner === ME) || l.owner === ME);
    let h = `<div class="sh-head"><div class="chip" style="background:var(--you)">💼</div><div><div class="sh-title">${esc(me.company)}</div>
      <div class="sh-sub">Net worth ${money(netWorth(s, ME))} · yesterday <span class="${cls(op)}">${sign(op)}</span></div></div></div>`;
    if (!mine.length) return h + `<p class="note">You don't own anything yet. Tap any empty lot to open a business on leased land,
      and bid at the land auctions to buy plots outright. Tea rooms and grocers are quick earners.</p>`;
    const biz = mine.filter(l => l.business && l.business.owner === ME);
    if (biz.length) {
      h += `<h3>Businesses <em>${biz.length}</em></h3>`;
      for (const l of biz) {
        const b = l.business, def = BIZ[b.type];
        const t = b.yesterday || b.today;
        const p = t.rev - t.cost;
        const warn = b.stock < 8 ? ' · <span class="neg">out of stock</span>' : t.turned > 5 ? ' · <span class="warn">turning people away</span>' : '';
        h += `<button class="list-item" data-act="goto" data-id="${l.id}"><span style="font-size:22px">${def.icon}</span>
          <span class="grow"><b>${esc(bizLabel(s, b.type))}</b><small><span style="color:${DISTRICTS[l.district].color}">■</span> ${esc(l.name)} · ${Math.round(b.price * 100)}% · ${b.staff} staff · ${hh(b.from)}–${hh(b.from + b.len)}${warn}</small></span>
          <span class="amt ${cls(p)}">${sign(p)}<small>${b.yesterday ? 'yesterday' : 'today'}</small></span></button>`;
      }
    }
    const land = mine.filter(l => l.owner === ME);
    if (land.length) {
      h += `<h3>Land <em>${land.length} lots · ${money(land.reduce((a, l) => a + landValue(s, l), 0))}</em></h3>`;
      for (const l of land) {
        const icon = l.kind === 'station' ? '🚇' : l.kind === 'utility' ? (l.name.startsWith('Volt') ? '⚡' : '💧') :
          l.apt === MAX_APT ? '🏙️' : l.apt ? '🏢' : l.business ? BIZ[l.business.type].icon : '🚩';
        const col = l.kind === 'prop' ? DISTRICTS[l.district].color : '#8c8c80';
        let inc = 0;
        if (l.kind === 'prop') { inc = aptRentFor(s, l); if (l.business && l.business.owner !== ME) inc += rentFor(s, l); }
        h += `<button class="list-item" data-act="goto" data-id="${l.id}"><span style="font-size:20px">${icon}</span>
          <span class="grow"><b><span style="color:${col}">■</span> ${esc(l.name)}</b><small>${l.kind === 'prop' ? (ownsSet(s, ME, l.district) ? 'Full set ✓' : `${setCount(s, ME, l.district)}/${MAP.districtLots[l.district].length} of set`) : l.kind}${l.apt ? ' · ' + APT_NAMES[l.apt] : ''}</small></span>
          <span class="amt">${money(landValue(s, l))}${inc ? `<small class="pos">+${money(inc)}/day rent</small>` : ''}</span></button>`;
      }
    }
    return h;
  }

  // ----------------------------------------------------------- sets ----
  setsHTML() {
    const s = this.s;
    let h = `<div class="sh-head"><div class="chip" style="background:conic-gradient(${DISTRICTS.map(d => d.color).join(',')})"></div><div><div class="sh-title">Colour sets</div>
      <div class="sh-sub">Own every lot of a colour: ground rent and apartment rent ×2</div></div></div>`;
    DISTRICTS.forEach((D, d) => {
      const ids = MAP.districtLots[d];
      const dots = ids.map(id => {
        const l = s.lots[id];
        return `<span class="setdot" style="background:${l.owner >= 0 ? s.players[l.owner].color : 'rgba(255,255,255,0.08)'}">${l.apt ? (l.apt === MAX_APT ? '★' : l.apt) : ''}</span>`;
      }).join('');
      const full = s.players.find(p => ownsSet(s, p.id, d));
      const mine = setCount(s, ME, d);
      const status = full ? (full.id === ME ? '<span class="pos">Yours ✓</span>' : `<span style="color:${full.color}">${esc(full.company.split(' ')[0])} ✓</span>`) :
        mine === ids.length - 1 ? '<span class="warn">1 to go!</span>' : `${mine}/${ids.length}`;
      h += `<button class="list-item" data-act="goto" data-id="${ids[0]}">
        <span class="chip" style="background:${D.color};width:24px;height:24px"></span>
        <span class="grow"><b>${esc(D.name)}</b><small>~${money(landValue(s, s.lots[ids[0]]))} · ${D.mix[2] >= 0.35 ? 'wealthy' : D.mix[0] >= 0.5 ? 'budget' : 'mixed'} crowd</small></span>
        <span class="setdots">${dots}</span><span class="amt" style="min-width:58px">${status}</span></button>`;
    });
    for (const kind of ['station', 'utility']) {
      const lots = s.lots.filter(l => l.kind === kind);
      const dots = lots.map(l => `<span class="setdot" style="background:${l.owner >= 0 ? s.players[l.owner].color : 'rgba(255,255,255,0.08)'}"></span>`).join('');
      h += `<button class="list-item" data-act="goto" data-id="${lots[0].id}"><span style="font-size:20px;width:24px;text-align:center">${kind === 'station' ? '🚇' : '⚡'}</span>
        <span class="grow"><b>${kind === 'station' ? 'Metro stations' : 'Utilities'}</b><small>${kind === 'station' ? 'Fares climb with each one you own' : 'A cut of every business bill'}</small></span>
        <span class="setdots">${dots}</span></button>`;
    }
    return h;
  }

  // ---------------------------------------------------------- goals ----
  goalsHTML() {
    const s = this.s;
    const sc = SCENARIOS[s.scenario];
    const year = yearOf(s);
    let h = `<div class="sh-head"><div class="chip" style="background:#ffd23f">🏆</div><div><div class="sh-title">${esc(sc.name)}</div>
      <div class="sh-sub">${esc(sc.blurb)}</div></div></div>`;
    const mine = s.players[ME].goals || [];
    if (s.goals.length) {
      h += `<h3>Milestones ${s.players[ME].failed ? '<em class="neg">missed one: out of the running</em>' : ''}</h3>`;
      for (const [gi, tmpl] of s.goals.entries()) {
        const g = { ...tmpl, ...(mine[gi] || {}) };
        const v = goalProgress(s, g, ME);
        const left = g.by - s.day + 1;
        const pct = Math.min(100, Math.round(v / g.n * 100));
        h += `<div class="card goalrow ${g.done ? 'done' : left <= 3 ? 'urgent' : ''}">
          <div class="row" style="margin:0"><b class="grow">${g.done ? '✅' : '🎯'} ${esc(goalText(g))}</b>
          <span class="dim">${g.done ? `day ${g.doneDay}` : `by day ${g.by}${left <= 5 ? ` · <span class="warn">${left}d left</span>` : ''}`}</span></div>
          ${g.done ? '' : `<div class="meter"><i style="width:${pct}%"></i></div><div class="note" style="margin:2px 0 0">${g.type === 'worth' || g.type === 'profit' ? money(v) : v} / ${g.type === 'worth' || g.type === 'profit' ? money(g.n) : g.n}</div>`}</div>`;
      }
    }
    // Standings.
    const rows = s.players.map(p => ({ p, w: p.bankrupt ? 0 : netWorth(s, p.id) })).sort((a, b) => b.w - a.w);
    h += `<h3>Standings ${sc.mode === 'race' ? `<em>first to ${money(sc.goal)} · day ${Math.min(s.day, sc.days)}/${sc.days}</em>` : ''}</h3>`;
    rows.forEach(({ p, w }, i) => {
      const lots = s.lots.filter(l => l.owner === p.id).length;
      const shops = s.lots.filter(l => l.business && l.business.owner === p.id).length;
      const sets = setsOwned(s, p.id);
      h += `<div class="card rival"><span class="bar" style="background:${p.color}"></span>
        <div><b>${i + 1}. ${esc(p.company)}</b> ${p.bankrupt ? '<span class="neg">BANKRUPT</span>' : ''}
          <div class="note" style="margin:2px 0">${p.id === ME ? 'You' : p.human ? esc(p.name) + ' · human player' : esc(p.name) + ' · ' + esc(p.blurb || '')}</div>
          <div class="note" style="margin:0">${lots} lots · ${shops} shops · ${sets} set${sets === 1 ? '' : 's'} · cash ${money(p.cash)}${p.loan ? ` · owes ${money(p.loan)}` : ''}</div>
          ${this.spark(p)}</div>
        <div class="amt" style="text-align:right;font-weight:900">${money(w)}</div></div>`;
    });
    // Tech timeline.
    h += `<h3>Progress through the eras <em>${year} · ${eraName(year)}</em></h3>`;
    const items = [...TECH.filter(t => t.year > 1930 || year === 1930)];
    h += items.map(t => `<div class="tech ${t.year <= year ? 'have' : ''}"><b>${t.year}</b><span>${esc(t.text)}</span></div>`).join('');
    return h;
  }
  spark(p) {
    const pts = p.worthHist.slice(-40);
    if (pts.length < 2) return '';
    const max = Math.max(...pts, 1), min = Math.min(...pts, 0);
    const d = pts.map((v, i) => `${(i / (pts.length - 1) * 100).toFixed(1)},${(30 - (v - min) / (max - min || 1) * 28).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${d}" fill="none" stroke="${p.color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  // ----------------------------------------------------------- bank ----
  bankHTML() {
    const s = this.s, me = s.players[ME];
    const lim = loanLimit(s, ME);
    const assets = playerAssets(s, ME);
    const y = me.yesterday;
    const keys = Object.keys(LEDGER_LABELS).filter(k => y[k]);
    const op = operating(y);
    let h = `<div class="sh-head"><div class="chip" style="background:#3ddc84">🏦</div><div><div class="sh-title">City Savings Bank</div>
      <div class="sh-sub">Interest ${(LOAN_RATE * 100).toFixed(1)}% a day · credit line ${money(lim)}</div></div></div>
      <div class="stats">
        <div class="stat"><small>Cash</small><b>${money(me.cash)}</b></div>
        <div class="stat"><small>Loan</small><b class="${me.loan ? 'neg' : ''}">${money(me.loan)}</b></div>
        <div class="stat"><small>Net worth</small><b>${money(netWorth(s, ME))}</b></div>
      </div>
      <div class="row">
        <button class="btn small" data-act="loan" ${me.loan + LOAN_STEP > lim ? 'disabled' : ''}>Borrow ${money(LOAN_STEP)}</button>
        <button class="btn small" data-act="repay" ${!me.loan || me.cash < Math.min(LOAN_STEP, me.loan) ? 'disabled' : ''}>Repay ${money(Math.min(LOAN_STEP, me.loan || LOAN_STEP))}</button>
        <button class="btn small" data-act="repay-all" ${!me.loan || me.cash < me.loan ? 'disabled' : ''}>Repay all</button>
      </div>
      ${this.companyChartHTML()}
      <h3>Yesterday's books <em class="${cls(op)}">${sign(op)}</em></h3>`;
    if (!keys.length) h += '<p class="note">Nothing to report yet. Come back after midnight.</p>';
    else h += `<table class="ledger">${keys.map(k => `<tr><td>${LEDGER_LABELS[k]}</td><td class="${cls(y[k])}">${sign(y[k])}</td></tr>`).join('')}
      <tr class="total"><td>Operating profit</td><td class="${cls(op)}">${sign(op)}</td></tr></table>`;
    h += `<h3>Assets</h3><div class="stats">
      <div class="stat"><small>Land</small><b>${money(assets.land)}</b></div>
      <div class="stat"><small>Businesses</small><b>${money(assets.biz)}</b></div>
      <div class="stat"><small>Apartments</small><b>${money(assets.apt)}</b></div></div>
      <p class="note">Go overdrawn and the bank tops you up from your credit line. With no credit left you have three days to raise cash before you are declared bankrupt.</p>`;
    return h;
  }

  menuHTML() {
    const q = this.app.renderer.quality;
    return `<div class="sh-head"><div class="chip" style="background:#5b6475">☰</div><div><div class="sh-title">Menu</div>
      <div class="sh-sub">Saved automatically every midnight</div></div></div>
      <div class="row"><button class="btn" data-act="sound">${soundOn() ? '🔊 Sound on' : '🔇 Sound off'}</button><button class="btn" data-act="quality">${q === 'high' ? '✨ Graphics: high' : q === 'medium' ? '⚖️ Graphics: medium' : '🔋 Graphics: battery'}</button></div>
      <div class="row"><button class="btn" data-act="save">💾 Save now</button><button class="btn" data-act="help">❓ How to play</button></div>
      ${this.app.mp ? `<div class="card"><b>📶 LAN game</b><div class="note">${this.app.mp.addresses?.length ? `Friends join at <b>${esc(this.app.mp.addresses[0])}</b>` : 'Friends open this same address on the same wifi.'}<br>
        Speed changes need everyone's agreement. You can propose once every 60 seconds.</div>
        ${this.app.mp.host ? '<div class="row"><button class="btn danger small" data-act="end-lan">End the game for everyone</button></div>' : ''}</div>` : ''}
      <div class="row"><button class="btn danger" data-act="quit">🚪 ${this.app.mp ? 'Leave (your company keeps trading)' : 'Quit to title'}</button></div>
      <p class="note"><b>Camera:</b> drag to pan · pinch to zoom · twist two fingers to rotate · drag two fingers up/down to tilt.
      On a computer: drag to pan, right-drag to rotate and tilt, wheel to zoom. The ⟲ ⟳ ⛰ ⌂ buttons do the same.</p>`;
  }

  // -------------------------------------------------------- auction ----
  // Live panel, redrawn every frame while an auction runs.
  auctionFrame() {
    const s = this.s;
    const a = s?.auction;
    const el = $('auction');
    if (!a) {
      if (!el.classList.contains('hidden')) el.classList.add('hidden');
      this.auctionSeen = null;
      return;
    }
    const lot = s.lots[a.lotId];
    const me = s.players[ME];
    const total = 9;
    // Build the panel once per auction (LAN updates arrive as new objects,
    // so identify it by lot + reserve), then update it in place: the bid
    // buttons never get replaced under a finger.
    const id = `${a.lotId}:${a.reserve}`;
    if (this.auctionSeen !== id) {
      this.auctionSeen = id;
      this.auctionLeader = -2;
      el.classList.remove('hidden');
      this.close();
      sfx.offer();
      this.app.renderer.focusLot(lot, 300);
      let setNote = '';
      if (lot.kind === 'prop') {
        const n = MAP.districtLots[lot.district].length;
        for (const p of s.players) if (setCount(s, p.id, lot.district) === n - 1)
          setNote += `<div class="warn">${p.id === ME ? '⭐ Winning this completes <b>your</b> set!' : `⚠ This completes <b style="color:${p.color}">${esc(p.company)}</b>'s set!`}</div>`;
      }
      const D = lot.kind === 'prop' ? DISTRICTS[lot.district] : null;
      el.innerHTML = `<div class="auc-head"><span class="pill">🔨 LIVE AUCTION</span><span class="dim">${a.caller >= 0 ? `called by ${a.caller === ME ? 'you' : esc(s.players[a.caller].company)} · ` : ''}clock paused</span></div>
        <div class="sh-head" style="margin:6px 0"><div class="chip" style="background:${D ? D.color : lot.kind === 'station' ? '#2f80ed' : '#8c8c80'}">${D ? '' : lot.kind === 'station' ? '🚇' : '⚡'}</div>
          <div><div class="sh-title">${esc(lot.name)}</div><div class="sh-sub">${D ? esc(D.name) + ' · ' : ''}land value ${money(landValue(s, lot))}</div></div></div>
        ${lot.kind === 'prop' ? this.setBarHTML(lot.district, lot.id) : ''}${setNote}
        <div class="auc-bid"><div><small data-r="label"></small><b data-r="price"></b></div>
          <div style="text-align:right"><small>Leader</small><b data-r="leader"></b></div></div>
        <div class="meter auc-timer"><i></i></div>
        <div class="auc-log" data-r="log"></div>
        <div data-r="live">
          <div class="row">
            <button class="btn buy" data-act="bid" data-v="0"></button>
            <button class="btn go" data-act="bid" data-v="2"></button>
          </div>
          <div class="row"><button class="btn small wide" data-act="pass">Pass, let them fight it out</button></div>
          <p class="note" data-r="loan"></p>
        </div>
        <div class="row" data-r="out"><button class="btn wide" disabled>You stepped out. Going, going…</button></div>`;
    }
    const q = r => el.querySelector(`[data-r="${r}"]`);
    const bar = el.querySelector('.auc-timer i');
    bar.style.width = Math.max(0, Math.min(100, a.timer / total * 100)) + '%';
    bar.classList.toggle('hot', a.timer < 3);
    const key = `${a.price}|${a.leader}|${a.allOut}|${a.out && a.out[ME]}|${Math.round(me.cash)}`;
    if (key === this.aucKey) return;
    this.aucKey = key;
    const out = a.allOut || (a.out && a.out[ME]);
    const leader = a.leader >= 0 ? s.players[a.leader] : null;
    const next = minBid(a);
    const inc = increment(a.price);
    const room = loanLimit(s, ME) - me.loan;
    const who = p => (p.id === ME ? 'You' : p.human ? p.company : p.name.split(' ')[0]);
    if (this.auctionLeader !== a.leader) {
      this.auctionLeader = a.leader;
      if (a.leader >= 0 && a.leader !== ME) sfx.tap();
    }
    q('label').textContent = leader ? 'Top bid' : 'Opening bid';
    q('price').textContent = money(a.price);
    q('leader').textContent = leader ? (leader.id === ME ? 'You!' : who(leader)) : 'no bids';
    q('leader').style.color = leader ? leader.color : 'var(--dim)';
    q('log').innerHTML = a.bids.slice(0, 4).map(b => `<span style="color:${s.players[b.pid].color}">${esc(who(s.players[b.pid]))} ${money(b.amount)}</span>`).join(' · ') || '<span class="dim">Waiting for an opening bid…</span>';
    q('live').classList.toggle('hidden', !!out);
    q('out').classList.toggle('hidden', !out);
    const [b0, b2] = el.querySelectorAll('[data-act=bid]');
    const leading = a.leader === ME;
    b0.textContent = leading ? 'You lead' : `Bid ${money(next)}`;
    b0.disabled = leading || me.cash + room < next;
    b2.textContent = `Jump ${money(next + inc * 2)}`;
    b2.disabled = leading || me.cash + room < next + inc * 2;
    el.querySelector('[data-act=pass]').disabled = leading;
    q('loan').textContent = me.cash < next ? `Bids above your cash (${money(me.cash)}) are covered by a bank loan.` : '';
  }


  // ------------------------------------------------------- layers ----
  // ------------------------------------------------------- lenses ----
  // City-wide views: paint every block by one statistic and rank them.
  lensCtx() {
    const tech = this.s ? techOf(this.s) : null;
    if (!this.lensType || (tech && !tech.biz.has(this.lensType))) this.lensType = tech ? [...tech.biz][0] : 'cafe';
    return { me: ME, mine: !!this.lensMine, type: this.lensType };
  }
  setLens(id) {
    this.app.renderer.setOverlay(id, this.lensCtx());
    this.layersUI();
    if (this.view?.kind === 'tab' && this.view.name === 'lens') this.render();
  }
  layersUI() {
    const r = this.app.renderer;
    const cur = r.overlay;
    const lens = LENS[cur];
    r.lensCtx = this.lensCtx();
    // Picking a lens folds the grid away so the map stays visible.
    const open = this.lensOpen || !(lens && lens.of);
    let h = open ? `<div class="lens-grid">${LENSES.map(l => `<button data-act="layer" data-v="${l.id}" class="${cur === l.id ? 'on' : ''}">${l.icon}<small>${l.name}</small></button>`).join('')}</div>`
      : `<div class="lens-now"><b>${lens.icon} ${esc(lens.name)}</b><button class="btn small" data-act="lens-open">Change</button><button class="btn small" data-act="layer" data-v="off">✕</button></div>`;
    if (lens && lens.of) {
      if (open) h += `<div class="note" style="margin:6px 2px 4px">${esc(lens.desc)}</div>`;
      if (lens.needsType && this.s) {
        const tech = techOf(this.s);
        h += `<div class="type-row">${BUSINESSES.filter(d => tech.biz.has(d.id)).map(d => `<button data-act="lens-type" data-v="${d.id}" class="${this.lensType === d.id ? 'on' : ''}" title="${esc(bizLabel(this.s, d.id))}">${d.icon}</button>`).join('')}</div>`;
      }
      if (this.s) {
        const data = lensData(this.s, cur, r.lensCtx);
        const fmt = v => (['revenue', 'profit', 'land', 'rent', 'opportunity'].includes(cur) ? money(v) : cur === 'satisfaction' ? Math.round(v * 100) + '%' : cur === 'quality' || cur === 'appeal' ? v.toFixed(1) + '★' : Math.round(v).toLocaleString());
        const legend = lens.kind === 'owner' ? '<span>Coloured by the company holding most of the block</span>'
          : lens.kind === 'diverge' ? `<span class="neg">losing</span><i class="bar div"></i><span class="pos">up to ${fmt(data.max)}</span>`
          : `<span>low</span><i class="bar heat"></i><span>${fmt(data.max)}</span>`;
        h += `<div class="legend">${legend}</div>`;
      }
      h += `<div class="row" style="margin:4px 0 0">
        ${lens.mine ? `<button class="btn small" data-act="lens-mine">${this.lensMine ? '👤 My shops only' : '🏙️ All shops'}</button>` : ''}
        <button class="btn small" data-act="lens-rank">📋 Rank blocks</button></div>`;
    }
    $('layers').innerHTML = h;
    $('camctl').querySelector('[data-cam=layers]').classList.toggle('on', cur !== 'off');
  }
  lensHTML() {
    const s = this.s, r = this.app.renderer;
    const id = r.overlay !== 'off' ? r.overlay : 'revenue';
    const data = lensData(s, id, this.lensCtx());
    const rows = [...data.rows].sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
    let h = `<div class="sh-head"><div class="chip" style="background:#2b3a5c">${data.lens.icon}</div><div><div class="sh-title">${esc(data.lens.name)} by block</div>
      <div class="sh-sub">${esc(data.lens.desc)}${data.lens.mine && this.lensMine ? ' (your shops only)' : ''}${data.lens.needsType ? ` · ${esc(bizLabel(s, this.lensType))}` : ''}</div></div></div>`;
    h += rows.map((row, i) => {
      const D = DISTRICTS[row.d];
      const w = row.v == null ? 0 : Math.max(2, Math.abs(row.v) / data.max * 100);
      const col = data.lens.kind === 'owner' ? (row.owner >= 0 ? s.players[row.owner].color : '#8a8f99') : data.lens.kind === 'diverge' ? (row.v >= 0 ? 'var(--good)' : 'var(--bad)') : 'var(--you)';
      return `<button class="list-item" data-act="goto" data-id="${MAP.districtLots[row.d][0]}"><span class="rank">${i + 1}</span>
        <span class="chip" style="background:${D.color};width:22px;height:22px"></span>
        <span class="grow"><b>${esc(D.name)}</b><small>${esc(row.note || '')}</small><div class="meter"><i style="width:${w}%;background:${col}"></i></div></span>
        <span class="amt">${esc(row.label)}</span></button>`;
    }).join('');
    return h + '<p class="note">Tap a block to open it. Pick other lenses with the 🗺️ button.</p>';
  }

  // ----------------------------------------------------- speed vote ----
  // LAN games: one player proposes a speed, everyone else must agree.
  voteFrame(mp) {
    const el = $('vote');
    const v = mp && mp.vote;
    if (!v || !this.s) { el.classList.add('hidden'); document.body.classList.remove('voting'); this.voteKey = null; return; }
    // Rebuild only when the vote itself changes; tick the countdown in place
    // so the buttons never move under a finger.
    const key = `${v.id}|${v.yes.length}`;
    const info = `${v.yes.length}/${v.need.length} agreed · ${Math.max(0, v.left)}s`;
    if (key === this.voteKey) { const sm = el.querySelector('small'); if (sm) sm.textContent = info; return; }
    this.voteKey = key;
    document.body.classList.add('voting');
    el.classList.remove('hidden');
    const who = this.s.players[v.from];
    const label = v.speed === 0 ? 'pause the game' : `play at ${['', '1×', '2.5×', '6×'][v.speed]}`;
    const mine = v.from === ME;
    const asked = v.need.includes(ME) && !v.yes.includes(ME);
    el.innerHTML = `<div class="vote-row"><span><b style="color:${who.color}">${esc(mine ? 'You' : who.company)}</b> ${mine ? 'proposed' : 'want'} to <b>${label}</b>.
      <small>${info}</small></span>
      ${asked ? `<span class="vote-btns"><button class="btn small buy" data-act="vote-yes" data-id="${v.id}">Agree</button><button class="btn small danger" data-act="vote-no" data-id="${v.id}">No</button></span>` : ''}</div>`;
    if (asked && this.voteBuzz !== v.id) { this.voteBuzz = v.id; sfx.offer(); }
  }

  // -------------------------------------------------------- actions ----
  onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    this.lastTouch = 0;
    const s = this.s;
    const lotId = this.view?.kind === 'lot' ? this.view.id : -1;
    const b = lotId >= 0 ? s.lots[lotId].business : null;
    const act = el.dataset.act;
    // Every game action goes through app.act: run locally in single-player,
    // sent to the server in LAN games. Results come back as a promise.
    const done = () => { this.render(); this.app.hud(); };
    const res = r => {
      if (!r) return false;
      if (r.ok) { if (r.msg) this.toast(r.msg, r.setComplete ? 'set' : 'good'); }
      else if (r.msg) { this.toast(r.msg, 'bad'); sfx.error(); }
      done();
      return r.ok;
    };
    const act$ = (name, ...args) => this.app.act(name, ...args);
    switch (act) {
      case 'call': act$('call', lotId).then(r => { if (!r.ok) res(r); }); return;
      case 'sell-land': this.confirm('Sell this land back to the city?', 'You get 70% of its value plus half of what you spent on apartments. Apartments are demolished and the lot goes back up for auction.', () => act$('sellLand', lotId).then(r => res(r) && sfx.buy())); return;
      case 'build': {
        const type = el.dataset.type, floors = this.buildFloors || 1;
        act$('build', lotId, type, floors).then(r => { if (res(r)) { sfx.build(); this.lotTab = 'manage'; this.app.renderer.floater(this.s.lots[lotId], `−${money(buildCost(BIZ[type], floors))}`, '#ff8a8a'); } });
        return;
      }
      case 'bfloors': this.buildFloors = Math.max(1, Math.min(MAX_FLOORS, (this.buildFloors || 1) + +el.dataset.v)); sfx.tap(); break;
      case 'ltab': this.lotTab = el.dataset.v; sfx.tap(); break;
      case 'bperiod': this.booksPeriod = el.dataset.v; sfx.tap(); break;
      case 'bmetric': this.booksMetric = el.dataset.v; sfx.tap(); break;
      case 'cmetric': this.bankMetric = el.dataset.v; sfx.tap(); break;
      case 'hire': act$('hire', lotId, +el.dataset.id, el.dataset.v).then(r => res(r) && sfx.buy()); return;
      case 'sfire': this.confirm('Let them go?', 'They get ten hours of pay as severance, and the rest of the team gets a little nervous.', () => act$('fire', lotId, +el.dataset.id).then(res)); return;
      case 'strain': act$('train', lotId, +el.dataset.id).then(r => res(r) && sfx.buy()); return;
      case 'sraise': act$('raise', lotId, +el.dataset.id).then(r => res(r) && sfx.coin()); return;
      case 'srole': act$('role', lotId, +el.dataset.id, el.dataset.v).then(res); return;
      case 'floor': act$('floor', lotId).then(r => res(r) && sfx.build()); return;
      case 'promo': act$('promo', lotId, el.dataset.id).then(r => res(r) && sfx.buy()); return;
      case 'park': act$('park', s.lots[lotId].district, el.dataset.id).then(r => res(r) && sfx.build()); return;
      case 'survey': act$('survey', s.lots[lotId].district).then(r => res(r) && sfx.buy()); return;
      case 'buyout': this.confirm('Buy out this shop?', `It stands on your land, so the owner must sell. You take over the shop, its staff and its stock for ${money(buyoutPrice(s, s.lots[lotId]))}.`, () => act$('buyout', lotId).then(r => res(r) && sfx.set())); return;
      case 'layer': this.lensOpen = el.dataset.v === 'off'; this.setLens(el.dataset.v); if (el.dataset.v === 'off') $('layers').classList.add('hidden'); sfx.tap(); return;
      case 'lens-open': this.lensOpen = true; this.layersUI(); sfx.tap(); return;
      case 'lens-type': this.lensType = el.dataset.v; this.setLens(this.app.renderer.overlay); sfx.tap(); return;
      case 'lens-mine': this.lensMine = !this.lensMine; this.setLens(this.app.renderer.overlay); sfx.tap(); return;
      case 'lens-rank': $('layers').classList.add('hidden'); this.openTab('lens'); sfx.tap(); return;
      case 'price': act$('price', lotId, Math.round((b.price + PRICE_STEP * +el.dataset.v) * 100) / 100).then(res); sfx.tap(); return;
      case 'staff': act$('staff', lotId, b.staff + +el.dataset.v).then(res); sfx.tap(); return;
      case 'open': act$('hours', lotId, b.from + +el.dataset.v, b.len).then(res); sfx.tap(); return;
      case 'len': act$('hours', lotId, b.from, b.len + +el.dataset.v).then(res); sfx.tap(); return;
      case 'auto': act$('stock', lotId, b.autoStock ? autoTarget(b) : b.stockTarget, el.dataset.v === '1').then(res); sfx.tap(); return;
      case 'stock': act$('stock', lotId, b.stockTarget + Math.max(4, Math.round(b.stockTarget * 0.1 / 4) * 4) * +el.dataset.v).then(res); sfx.tap(); return;
      case 'rush': act$('rush', lotId).then(r => res(r) && sfx.buy()); return;
      case 'refit': act$('refit', lotId).then(r => res(r) && sfx.build()); return;
      case 'sell-biz': this.confirm('Close this business?', 'You recover half of what you invested, plus half the value of the stock.', () => act$('sellBiz', lotId).then(r => res(r) && sfx.buy())); return;
      case 'apt': act$('apt', lotId).then(r => { if (res(r)) { sfx.build(); if (this.s.lots[lotId].apt === MAX_APT) sfx.set(); } }); return;
      case 'sell-apt': act$('sellApt', lotId).then(res); return;
      case 'offer-adj': this.offerDraft[lotId] = Math.max(1000, (this.offerDraft[lotId] || 0) + +el.dataset.v); sfx.tap(); break;
      case 'offer': case 'offer-ask': {
        const amt = act === 'offer' ? this.offerDraft[lotId] : this.counter[lotId];
        act$('offer', lotId, amt).then(r => {
          if (r.ok) { this.toast(r.msg, 'set'); delete this.counter[lotId]; this.celebrate(lotId); }
          else { if (r.counter) this.counter[lotId] = r.counter; this.toast(r.msg, 'bad'); sfx.error(); }
          done();
        });
        return;
      }
      case 'bid': {
        const a = s.auction;
        if (!a) return;
        const amt = minBid(a) + increment(a.price) * +el.dataset.v;
        act$('bid', amt).then(r => { if (r.ok) sfx.coin(); else { this.toast(r.msg, 'bad'); sfx.error(); } });
        return;
      }
      case 'pass': act$('pass').then(r => { if (!r.ok && r.msg) this.toast(r.msg, 'bad'); }); sfx.tap(); return;
      case 'goto': this.openLot(+el.dataset.id); sfx.tap(); return;
      case 'loan': act$('loan').then(r => res(r) && sfx.buy()); return;
      case 'repay': act$('repay').then(res); sfx.tap(); return;
      case 'repay-all': act$('repay', s.players[ME].loan).then(res); sfx.tap(); return;
      case 'sound': setSound(!soundOn()); localStorage.setItem('skyline-sound', soundOn() ? '1' : '0'); break;
      case 'quality': { const q = this.app.renderer.quality; this.app.renderer.setQuality(q === 'high' ? 'medium' : q === 'medium' ? 'low' : 'high'); break; }
      case 'save': this.app.save(); this.toast(this.app.mp ? 'The server saves the LAN game every midnight.' : 'Game saved.', 'good'); break;
      case 'help': this.help(); return;
      case 'quit': this.app.save(); this.app.toTitle(); return;
      case 'end-lan': this.confirm('End the game for everyone?', 'Everyone goes back to the lobby. The game is saved and can be resumed.', () => this.app.mp?.net.send({ t: 'end' })); return;
      case 'claim': this.app.mp?.net.send({ t: 'claim', pid: +el.dataset.pid }); return;
      case 'accept-offer': case 'decline-offer': case 'view-offer': this.resolveOffer(act, +el.dataset.id); return;
      case 'vote-yes': case 'vote-no': this.app.mp?.net.send({ t: 'vote', id: +el.dataset.id, yes: act === 'vote-yes' }); sfx.tap(); return;
      case 'modal-ok': this.hideModal(); this._ok && this._ok(); return;
      case 'modal-cancel': this.hideModal(); return;
      case 'keep-playing':
        this.hideModal();
        if (this.app.mp) this.app.mp.net.send({ t: 'continue' });
        else { continueGame(s); this.app.overShown = false; this.app.save(); this.toast('Free play: the city carries on.', 'good'); this.onHour(); }
        return;
      case 'new-game': this.hideModal(); this.app.mp?.host ? this.app.mp.net.send({ t: 'end' }) : this.app.toTitle(); return;
    }
    this.render();
    this.app.hud();
  }

  // Called when an auction closes.
  auctionResult(r, lotId) {
    const s = this.s, lot = s.lots[lotId];
    if (r.winner === ME) {
      this.toast(`🔨 Sold to you! ${lot.name} for ${money(r.price)}.`, 'set');
      this.celebrate(lotId);
    } else if (r.winner >= 0) {
      this.toast(`🔨 ${s.players[r.winner].company} won ${lot.name} for ${money(r.price)}.`, r.setComplete ? 'bad' : '');
      sfx.tap();
    } else this.toast(`No buyer for ${lot.name}. It will return cheaper.`);
  }

  celebrate(lotId) {
    const lot = this.s.lots[lotId];
    if (lot.kind === 'prop' && ownsSet(this.s, ME, lot.district)) {
      sfx.set();
      this.modal(`<h2>🎨 ${esc(DISTRICTS[lot.district].name)} is yours!</h2>
        <p>You own the whole colour set. Ground rent on every lot here is now <b>doubled</b>, and so is the rent from
        any <b>apartments</b> you build on them, all the way up to a <b>Skyline Tower</b> once the technology arrives.</p>
        <div class="row"><button class="btn gold wide" data-act="modal-cancel">Let's build</button></div>`);
    } else sfx.buy();
  }

  // ---------------------------------------------------------- hours ----
  onHour() {
    const s = this.s;
    const fresh = s.news.filter(n => n.seq > this.seenNews).reverse();
    for (const n of fresh) {
      this.seenNews = Math.max(this.seenNews, n.seq);
      if (n.kind === 'staff') { if (n.who === ME) { this.toast(n.text, 'bad'); sfx.bad(); } continue; }
      if (n.who === ME && n.kind !== 'set') continue;
      if (['set', 'event', 'bad', 'warn', 'tech', 'goal'].includes(n.kind)) {
        this.toast(n.text, n.kind === 'warn' ? 'bad' : n.kind);
        if (n.kind === 'bad') sfx.bad();
        if (n.kind === 'goal') sfx.set();
      } else if (n.kind !== 'auction') this.tickerQueue.push(n);
    }
    const offer = s.offers.find(o => o.to === ME && !this.shownOffers.has(o.id));
    if (offer && $('modal').classList.contains('hidden') && !s.auction) this.showOffer(offer);
    this.refresh();
  }

  tickTicker(now) {
    if (now < this.tickerUntil) return;
    const n = this.tickerQueue.shift();
    const t = $('ticker');
    if (!n) { if (t.textContent) t.textContent = ''; return; }
    const p = n.who >= 0 ? this.s.players[n.who] : null;
    t.innerHTML = (p ? `<b style="color:${p.color}">●</b> ` : '📰 ') + esc(n.text);
    this.tickerUntil = now + (this.tickerQueue.length > 3 ? 2200 : 4200);
  }

  showOffer(o) {
    const s = this.s;
    this.shownOffers.add(o.id);
    const lot = s.lots[o.lotId], p = s.players[o.from];
    const completes = lot.kind === 'prop' && setCount(s, o.from, lot.district) === MAP.districtLots[lot.district].length - 1;
    if (!this.app.mp) this.app.pauseFor('offer');       // LAN games keep running
    sfx.offer();
    this.modal(`<h2><span style="color:${p.color}">●</span> Offer from ${esc(p.name)}</h2>
      <p>${esc(p.company)} wants to buy <b>${esc(lot.name)}</b>${lot.kind === 'prop' ? ` (${esc(DISTRICTS[lot.district].name)})` : ''}.</p>
      <div class="big-amt pos">${money(o.amount)}</div>
      <p class="note" style="text-align:center">Land value ${money(landValue(s, lot))}${lot.aptInvested ? ' + apartments' : ''}</p>
      ${completes ? `<p class="warn">⚠ Selling would hand them the complete ${esc(DISTRICTS[lot.district].name)} set: double rents.</p>` : ''}
      ${lot.business && lot.business.owner === ME ? '<p class="note">Your business there keeps trading, but you will pay them ground rent.</p>' : ''}
      <div class="row"><button class="btn danger" data-act="decline-offer" data-id="${o.id}">Decline</button>
      <button class="btn buy" data-act="accept-offer" data-id="${o.id}">Accept</button></div>
      <div class="row"><button class="btn small wide" data-act="view-offer" data-id="${o.id}">Show me the lot first</button></div>`);
  }
  resolveOffer(act, id) {
    const s = this.s;
    const o = s.offers.find(x => x.id === id);
    this.hideModal();
    this.app.resume('offer');
    if (!o) return;
    if (act === 'accept-offer') this.app.act('accept', id).then(r => { this.toast(r.msg, r.ok ? 'good' : 'bad'); r.ok ? sfx.buy() : sfx.error(); this.render(); });
    else if (act === 'decline-offer') { this.app.act('decline', id); this.toast('Offer declined.'); }
    else { this.shownOffers.delete(id); this.openLot(o.lotId); this.toast('The offer stands until it expires. It will pop up again.'); }
    this.render();
  }

  // ---------------------------------------------------------- misc ----
  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    const wrap = $('toasts');
    wrap.appendChild(el);
    while (wrap.children.length > 2) wrap.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, kind === 'set' || kind === 'tech' || kind === 'goal' ? 4200 : 2800);
  }
  modal(html) {
    $('modal-card').innerHTML = html;
    $('modal').classList.remove('hidden');
  }
  hideModal() { $('modal').classList.add('hidden'); }
  modalOpen() { return !$('modal').classList.contains('hidden'); }
  confirm(title, text, ok) {
    this._ok = ok;
    this.modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn" data-act="modal-cancel">Cancel</button><button class="btn danger" data-act="modal-ok">Do it</button></div>`);
  }
  help() {
    this.modal(`<h2>How to play</h2>${document.querySelector('.howto ul').outerHTML}
      <div class="row"><button class="btn go wide" data-act="modal-cancel">Got it</button></div>`);
  }

  gameOver() {
    const s = this.s;
    const rows = s.players.map(p => ({ p, w: p.bankrupt ? 0 : netWorth(s, p.id) })).sort((a, b) => b.w - a.w);
    const won = s.winner === ME;
    won ? sfx.win() : sfx.bad();
    this.modal(`<h2>${won ? '🏆 You win!' : s.winner < 0 ? '💸 Game over' : `${esc(s.players[s.winner].company)} wins`}</h2>
      <p>${esc(s.endReason)}</p>
      ${rows.map(({ p, w }, i) => `<div class="list-item"><span class="rank">${i + 1}</span><span class="grow"><b style="color:${p.color}">${esc(p.company)}</b><small>${p.bankrupt ? 'bankrupt' : esc(p.name)}</small></span><span class="amt">${money(w)}</span></div>`).join('')}
      ${this.app.mp && !this.app.mp.host ? '<p class="note">The host decides whether to keep playing or go back to the lobby.</p>' : ''}
      <div class="row"><button class="btn buy wide" data-act="keep-playing" ${this.app.mp && !this.app.mp.host ? 'disabled' : ''}>▶ Keep playing</button></div>
      <p class="note" style="text-align:center">${s.players[ME].bankrupt ? 'You get a fresh start with half the usual cash. ' : ''}No more goals or deadlines: the city and the rivals carry on.</p>
      <div class="row"><button class="btn" data-act="modal-cancel">Look around</button><button class="btn go" data-act="new-game">New game</button></div>`);
  }
}
