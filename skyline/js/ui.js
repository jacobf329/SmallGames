// Skyline Hustle - HTML overlay: HUD, bottom sheet (lot, citizen and tabs),
// the live auction panel, toasts and modals. The city is drawn by render3d.js.

import {
  DISTRICTS, BUSINESSES, BIZ, FIT_LEVELS, MAX_STAFF, APT_NAMES, APT_RESIDENTS, MAX_APT, STATION_FARE,
  UTILITY_CUT, SCENARIOS, RIVALS, LOAN_STEP, LOAN_RATE, OVERHEAD_BASE, OVERHEAD_RATE, NEEDS, SEGMENTS,
  PRICE_STEP, PRICE_MIN, PRICE_MAX, AUTO_STOCK_PREMIUM, TECH, priceLabel, bizName, eraName,
} from './data.js';
import {
  MAP, money, landValue, rentFor, ownsSet, setCount, estimate, sellLand, build, sellBusiness, setPrice,
  setStaff, setHours, setStock, rushDelivery, autoTarget, upgradeFit, fitCost, aptCheck, buildApt, sellApt,
  aptRentFor, makeOffer, acceptOffer, declineOffer, takeLoan, repayLoan, loanLimit, netWorth, playerAssets,
  capacity, districtPopulation, LEDGER_LABELS, operating, dayName, yearOf, techOf, bizOpen, bizLabel,
  petition, nextAuctionSlot, goalProgress, goalText, setsOwned,
} from './sim.js';
import { auctionBid, settleRest, minBid, increment } from './auction.js';
import { citizenName, CHATTER_ICON, thoughtText } from './citizens.js';
import { SEG_COLORS } from './render3d.js';
import { sfx, setSound, soundOn } from './audio.js';

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sign = v => (v >= 0 ? '+' : '') + money(v);
const cls = v => v >= 0 ? 'pos' : 'neg';
const hh = h => String(((h % 24) + 24) % 24).padStart(2, '0') + ':00';
const ME = 0;

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
    document.querySelectorAll('#speeds button').forEach(b => b.addEventListener('click', () => {
      sfx.tap();
      this.app.setSpeed(+b.dataset.speed);
    }));
    document.querySelectorAll('#camctl button').forEach(b => b.addEventListener('click', () => {
      sfx.tap();
      const r = this.app.renderer, a = b.dataset.cam;
      if (a === 'left') r.rotate(Math.PI / 4);
      else if (a === 'right') r.rotate(-Math.PI / 4);
      else if (a === 'tilt') r.tilt();
      else r.fit();
    }));
  }

  get s() { return this.app.s; }

  // ---------------------------------------------------------- sheet ----
  openLot(id) {
    this.view = { kind: 'lot', id };
    this.app.renderer.sel = id;
    this.app.renderer.selCitizen = -1;
    this.render();
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
    else html = ({ empire: () => this.empireHTML(), sets: () => this.setsHTML(), goals: () => this.goalsHTML(),
      bank: () => this.bankHTML(), menu: () => this.menuHTML() })[v.name]();
    $('sheet-body').innerHTML = html;
    $('sheet').classList.remove('hidden');
    $('sheet').scrollTop = scroll;
    this.navState();
  }

  refresh() {
    if (this.view && performance.now() - this.lastTouch > 900) this.render();
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
        const pos = s.auctionQueue.indexOf(lot.id);
        const slot = nextAuctionSlot(s);
        h += `<p class="note">The city sells land only at live auctions (9:00, 13:00, 17:00).
          ${pos === 0 ? `<b>This lot is next</b>, ${slot.tomorrow ? 'tomorrow' : 'today'} at ${hh(slot.hour)}.` : pos > 0 ? `It is <b>#${pos + 1}</b> in the queue.` : ''}</p>
          ${pos !== 0 ? '<div class="row"><button class="btn go" data-act="petition">📜 Petition: auction this next</button></div>' : ''}`;
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
      const open = BUSINESSES.filter(d => tech.biz.has(d.id));
      const locked = BUSINESSES.filter(d => !tech.biz.has(d.id)).sort((a, b) => a.year - b.year);
      const opts = open.map(def => ({ def, e: estimate(s, lot.id, def.id, ME, {}) })).sort((a, b) => b.e.profit - a.e.profit);
      const best = opts[0]?.def.id;
      return `<h3>Open a business</h3><p class="note">${rentNote} Forecasts assume fair prices, 3 staff, usual hours.</p>
        <div class="biz-list">${opts.map(({ def, e }) => `
          <button class="biz-opt ${def.id === best && e.profit > 0 ? 'best' : ''}" data-act="build" data-type="${def.id}" ${me.cash < def.cost ? 'disabled' : ''}>
            <i>${def.icon}</i>
            <span><b>${esc(bizName(def, year))}</b><small>${money(def.cost)} · ${hh(def.open[0])}–${hh(def.open[1])} · ~${Math.round(e.cust)} cust/day</small></span>
            <span class="est ${cls(e.profit)}">${sign(e.profit)}<small>per day</small></span>
          </button>`).join('')}
          ${locked.map(def => `<div class="biz-opt locked"><i>${def.icon}</i><span><b>${esc(bizName(def, def.year))}</b><small>Invented in ${def.year}</small></span><span class="est dim">🔒</span></div>`).join('')}
        </div>`;
    }
    const def = BIZ[b.type];
    const owner = s.players[b.owner];
    const y = b.yesterday;
    const name = bizName(def, year);
    const stars = '★'.repeat(Math.round((b.rep ?? 1) * 2.5)) + '☆'.repeat(Math.max(0, 3.5 - Math.round((b.rep ?? 1) * 2.5)));
    if (b.owner !== ME) {
      const e = estimate(s, lot.id, b.type, b.owner, {});
      return `<h3>Business</h3><div class="card">
        <div class="row" style="margin:0"><span style="font-size:26px">${def.icon}</span>
        <div><b>${esc(name)}</b> <span class="stars">${stars}</span><div class="note" style="margin:0">Run by <b style="color:${owner.color}">${esc(owner.company)}</b> · ${Math.round(b.price * 100)}% prices · ${FIT_LEVELS[b.fit].name} · ${b.staff} staff · ${hh(b.from)}–${hh(b.from + b.len)}</div></div></div>
        <p class="note">Est. ~${Math.round(e.cust)} customers a day. ${lot.owner === ME ? `They pay you <b class="pos">${money(rentFor(s, lot))}</b> a day in rent.` : ''}</p></div>`;
    }
    const cap = capacity(b);
    const e = estimate(s, lot.id, b.type, ME, {});
    const t = y || b.today;
    const profitY = t.rev - t.cost;
    const fc = fitCost(b);
    const openNow = bizOpen(b, s.hour);
    const target = b.autoStock ? autoTarget(b) : b.stockTarget;
    const nextFit = FIT_LEVELS[b.fit + 1];
    let h = `<h3>${def.icon} ${esc(name)} <em>${FIT_LEVELS[b.fit].name} · <span class="stars">${stars}</span></em></h3>`;
    h += `<div class="stats">
      <div class="stat"><small>${y ? 'Yesterday' : 'Today so far'}</small><b class="${cls(profitY)}">${sign(profitY)}</b></div>
      <div class="stat"><small>Customers</small><b>${Math.round(t.cust)}</b></div>
      <div class="stat"><small>Turned away</small><b class="${t.turned > 5 ? 'warn' : ''}">${Math.round(t.turned)}</b></div>
    </div>
    <div class="note" style="margin-bottom:0">Busiest hour used ${Math.round(Math.min(1.5, t.peak) * 100)}% of ${Math.round(cap)}/hr capacity · ${openNow ? '<span class="pos">open now</span>' : '<span class="dim">closed now</span>'}</div>
    <div class="meter"><i class="${t.peak >= 1 ? 'hot' : ''}" style="width:${Math.round(Math.min(1, t.peak) * 100)}%"></i></div>`;
    // Price.
    h += `<div class="ctl"><span>Price <small class="dim">avg ticket</small></span>
      <div class="stepper"><button data-act="price" data-v="-1">−</button><b style="min-width:96px">$${(def.ticket * b.price).toFixed(2)}<small class="sub">${Math.round(b.price * 100)}% · ${priceLabel(b.price)}</small></b><button data-act="price" data-v="1">+</button></div></div>`;
    // Staff.
    h += `<div class="ctl"><span>Staff <small class="dim">${money(def.wage)}/hr each</small></span>
      <div class="stepper"><button data-act="staff" data-v="-1">−</button><b>${b.staff}</b><button data-act="staff" data-v="1">+</button></div></div>`;
    // Opening hours.
    h += `<div class="ctl"><span>Opens at</span>
      <div class="stepper"><button data-act="open" data-v="-1">−</button><b style="min-width:64px">${hh(b.from)}</b><button data-act="open" data-v="1">+</button></div></div>
      <div class="ctl"><span>Open for <small class="dim">closes ${hh(b.from + b.len)}</small></span>
      <div class="stepper"><button data-act="len" data-v="-1">−</button><b style="min-width:64px">${b.len === 24 ? '24h' : b.len + 'h'}</b><button data-act="len" data-v="1">+</button></div></div>`;
    // Stock.
    h += `<div class="card">
      <div class="ctl" style="margin-top:0"><span>📦 Stock <small class="dim">delivered 06:00</small></span>
        <div class="seg small" style="min-width:150px"><button data-act="auto" data-v="1" class="${b.autoStock ? 'on' : ''}">Auto</button><button data-act="auto" data-v="0" class="${!b.autoStock ? 'on' : ''}">Manual</button></div></div>
      <div class="stats">
        <div class="stat"><small>On shelves</small><b class="${b.stock < 8 ? 'neg' : ''}">${Math.round(b.stock)}</b></div>
        <div class="stat"><small>Sold ${y ? 'yest.' : 'today'}</small><b>${Math.round(t.cust)}</b></div>
        <div class="stat"><small>${def.perish ? 'Spoiled' : 'Storage'}</small><b>${def.perish ? Math.round(t.waste || 0) : '1%/day'}</b></div>
      </div>
      ${b.autoStock ? `<p class="note">Auto-restock orders ~${target} a day from a wholesaler at +${Math.round(AUTO_STOCK_PREMIUM * 100)}%.</p>` :
        `<div class="ctl"><span>Daily delivery up to</span><div class="stepper"><button data-act="stock" data-v="-1">−</button><b style="min-width:64px">${b.stockTarget}</b><button data-act="stock" data-v="1">+</button></div></div>`}
      ${def.perish ? `<p class="note">${Math.round(def.perish * 100)}% of unsold stock spoils overnight. Order too much and you waste money. Too little and you sell out.</p>` : ''}
      <div class="row"><button class="btn small" data-act="rush">🚚 Rush delivery now (+25%)</button></div>
    </div>`;
    h += `<p class="note">Forecast at these settings: <b class="${cls(e.profit)}">${sign(e.profit)}/day</b> from ~${Math.round(e.cust)} customers${e.lost > 3 ? `, <span class="warn">${Math.round(e.lost)} turned away (hire!)</span>` : ''}.</p>
      <div class="row">
        ${fc ? (b.fit + 1 <= techOf(s).fit ? `<button class="btn small" data-act="refit" ${me.cash < fc ? 'disabled' : ''}>Refit: ${nextFit.name} · ${money(fc)}</button>`
          : `<button class="btn small" disabled>${nextFit.name} fit-outs arrive ${nextFit.year}</button>`) : ''}
        <button class="btn small danger" data-act="sell-biz">Close · +${money(b.invested * 0.5)}</button>
      </div>`;
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
    const c = s.cz.list.find(x => x.id === id);
    if (!c) return '<p class="note">They have left town.</p>';
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
    if (s.goals.length) {
      h += '<h3>Milestones</h3>';
      for (const g of s.goals) {
        const v = goalProgress(s, g);
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
          <div class="note" style="margin:2px 0">${p.human ? 'You' : esc(p.name) + ' · ' + esc(RIVALS[p.id - 1].blurb)}</div>
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
      <div class="row"><button class="btn" data-act="sound">${soundOn() ? '🔊 Sound on' : '🔇 Sound off'}</button><button class="btn" data-act="quality">${q === 'high' ? '✨ Graphics: high' : '🔋 Graphics: battery'}</button></div>
      <div class="row"><button class="btn" data-act="save">💾 Save now</button><button class="btn" data-act="help">❓ How to play</button></div>
      <div class="row"><button class="btn danger" data-act="quit">🚪 Quit to title</button></div>
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
      this.aucKey = null;
      return;
    }
    const lot = s.lots[a.lotId];
    const me = s.players[ME];
    if (this.auctionSeen !== a) {
      this.auctionSeen = a;
      this.auctionLeader = -2;
      el.classList.remove('hidden');
      this.close();
      sfx.offer();
      this.app.renderer.focusLot(lot, 300);
    }
    // Only rebuild the panel when the bidding changes; animate the timer.
    const key = `${a.price}|${a.leader}|${a.humanOut}|${Math.round(me.cash)}`;
    const total = 9;
    if (key === this.aucKey) {
      const bar = el.querySelector('.auc-timer i');
      if (bar) { bar.style.width = Math.max(0, Math.min(100, a.timer / total * 100)) + '%'; bar.classList.toggle('hot', a.timer < 3); }
      return;
    }
    this.aucKey = key;
    const leader = a.leader >= 0 ? s.players[a.leader] : null;
    const next = minBid(a);
    const inc = increment(a.price);
    const room = loanLimit(s, ME) - me.loan;
    let setNote = '';
    if (lot.kind === 'prop') {
      const n = MAP.districtLots[lot.district].length;
      for (const p of s.players) if (setCount(s, p.id, lot.district) === n - 1)
        setNote += `<div class="warn">${p.id === ME ? '⭐ Winning this completes <b>your</b> set!' : `⚠ This completes <b style="color:${p.color}">${esc(p.company)}</b>'s set!`}</div>`;
    }
    if (this.auctionLeader !== a.leader) {
      this.auctionLeader = a.leader;
      if (a.leader > 0) sfx.tap();
    }
    const D = lot.kind === 'prop' ? DISTRICTS[lot.district] : null;
    el.innerHTML = `<div class="auc-head"><span class="pill">🔨 LIVE AUCTION</span><span class="dim">clock paused</span></div>
      <div class="sh-head" style="margin:6px 0"><div class="chip" style="background:${D ? D.color : lot.kind === 'station' ? '#2f80ed' : '#8c8c80'}">${D ? '' : lot.kind === 'station' ? '🚇' : '⚡'}</div>
        <div><div class="sh-title">${esc(lot.name)}</div><div class="sh-sub">${D ? esc(D.name) + ' · ' : ''}land value ${money(landValue(s, lot))}</div></div></div>
      ${lot.kind === 'prop' ? this.setBarHTML(lot.district, lot.id) : ''}${setNote}
      <div class="auc-bid"><div><small>${leader ? 'Top bid' : 'Opening bid'}</small><b>${money(a.price)}</b></div>
        <div style="text-align:right"><small>Leader</small><b style="color:${leader ? leader.color : 'var(--dim)'}">${leader ? (leader.human ? 'You!' : esc(leader.name)) : 'no bids'}</b></div></div>
      <div class="meter auc-timer"><i class="${a.timer < 3 ? 'hot' : ''}" style="width:${Math.max(0, Math.min(100, a.timer / total * 100))}%"></i></div>
      <div class="auc-log">${a.bids.slice(0, 4).map(b => `<span style="color:${s.players[b.pid].color}">${esc(s.players[b.pid].human ? 'You' : s.players[b.pid].name.split(' ')[0])} ${money(b.amount)}</span>`).join(' · ') || '<span class="dim">Waiting for an opening bid…</span>'}</div>
      ${a.humanOut ? '<div class="row"><button class="btn wide" disabled>You stepped out. Going, going…</button></div>' :
      `<div class="row">
        <button class="btn buy" data-act="bid" data-v="0" ${a.leader === ME || me.cash + room < next ? 'disabled' : ''}>${a.leader === ME ? 'You lead' : `Bid ${money(next)}`}</button>
        <button class="btn go" data-act="bid" data-v="2" ${a.leader === ME || me.cash + room < next + inc * 2 ? 'disabled' : ''}>Jump ${money(next + inc * 2)}</button>
      </div>
      <div class="row"><button class="btn small wide" data-act="pass" ${a.leader === ME ? 'disabled' : ''}>Pass, let them fight it out</button></div>
      ${me.cash < next ? `<p class="note">Bids above your cash (${money(me.cash)}) are covered by a bank loan.</p>` : ''}`}`;
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
    const res = r => {
      if (!r) return;
      if (r.ok) { if (r.msg) this.toast(r.msg, r.setComplete ? 'set' : 'good'); }
      else if (r.msg) { this.toast(r.msg, 'bad'); sfx.error(); }
      return r.ok;
    };
    switch (act) {
      case 'petition': if (res(petition(s, lotId))) sfx.buy(); break;
      case 'sell-land': this.confirm('Sell this land back to the city?', 'You get 70% of its value plus half of what you spent on apartments. Apartments are demolished and the lot goes back up for auction.', () => { res(sellLand(s, ME, lotId)); sfx.buy(); }); return;
      case 'build': {
        const type = el.dataset.type;
        if (res(build(s, ME, lotId, type))) { sfx.build(); this.app.renderer.floater(s.lots[lotId], `−${money(BIZ[type].cost)}`, '#ff8a8a'); }
        break;
      }
      case 'price': setPrice(s, ME, lotId, b.price + PRICE_STEP * +el.dataset.v); sfx.tap(); break;
      case 'staff': setStaff(s, ME, lotId, b.staff + +el.dataset.v); sfx.tap(); break;
      case 'open': setHours(s, ME, lotId, b.from + +el.dataset.v, b.len); sfx.tap(); break;
      case 'len': setHours(s, ME, lotId, b.from, b.len + +el.dataset.v); sfx.tap(); break;
      case 'auto': setStock(s, ME, lotId, b.autoStock ? autoTarget(b) : b.stockTarget, el.dataset.v === '1'); sfx.tap(); break;
      case 'stock': setStock(s, ME, lotId, b.stockTarget + Math.max(4, Math.round(b.stockTarget * 0.1 / 4) * 4) * +el.dataset.v); sfx.tap(); break;
      case 'rush': if (res(rushDelivery(s, ME, lotId))) sfx.buy(); break;
      case 'refit': if (res(upgradeFit(s, ME, lotId))) sfx.build(); break;
      case 'sell-biz': this.confirm('Close this business?', `You recover half of what you invested, plus half the value of the stock.`, () => { res(sellBusiness(s, ME, lotId)); sfx.buy(); }); return;
      case 'apt': if (res(buildApt(s, ME, lotId))) { sfx.build(); if (s.lots[lotId].apt === MAX_APT) sfx.set(); } break;
      case 'sell-apt': res(sellApt(s, ME, lotId)); break;
      case 'offer-adj': this.offerDraft[lotId] = Math.max(1000, (this.offerDraft[lotId] || 0) + +el.dataset.v); sfx.tap(); break;
      case 'offer': case 'offer-ask': {
        const amt = act === 'offer' ? this.offerDraft[lotId] : this.counter[lotId];
        const r = makeOffer(s, ME, lotId, amt);
        if (r.ok) { this.toast(r.msg, 'set'); delete this.counter[lotId]; this.celebrate(lotId); }
        else { if (r.counter) this.counter[lotId] = r.counter; this.toast(r.msg, 'bad'); sfx.error(); }
        break;
      }
      case 'bid': {
        const a = s.auction;
        if (!a) return;
        const amt = minBid(a) + increment(a.price) * +el.dataset.v;
        const r = auctionBid(s, ME, amt);
        if (r.ok) sfx.coin(); else { this.toast(r.msg, 'bad'); sfx.error(); }
        return;
      }
      case 'pass': if (s.auction) { settleRest(s); s.auction.timer = Math.min(s.auction.timer, 1.5); sfx.tap(); } return;
      case 'goto': this.openLot(+el.dataset.id); sfx.tap(); return;
      case 'loan': res(takeLoan(s, ME)); sfx.buy(); break;
      case 'repay': res(repayLoan(s, ME)); sfx.tap(); break;
      case 'repay-all': res(repayLoan(s, ME, s.players[ME].loan)); sfx.tap(); break;
      case 'sound': setSound(!soundOn()); localStorage.setItem('skyline-sound', soundOn() ? '1' : '0'); break;
      case 'quality': this.app.renderer.setQuality(this.app.renderer.quality === 'high' ? 'low' : 'high'); break;
      case 'save': this.app.save(); this.toast('Game saved.', 'good'); break;
      case 'help': this.help(); return;
      case 'quit': this.app.save(); this.app.toTitle(); return;
      case 'accept-offer': case 'decline-offer': case 'view-offer': this.resolveOffer(act, +el.dataset.id); return;
      case 'modal-ok': this.hideModal(); this._ok && this._ok(); return;
      case 'modal-cancel': this.hideModal(); return;
      case 'new-game': this.hideModal(); this.app.toTitle(); return;
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
    } else if (r.winner > 0) {
      this.toast(`🔨 ${s.players[r.winner].name} won ${lot.name} for ${money(r.price)}.`, r.setComplete ? 'bad' : '');
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
    this.app.pauseFor('offer');
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
    if (act === 'accept-offer') { const r = acceptOffer(s, id); this.toast(r.msg, r.ok ? 'good' : 'bad'); r.ok ? sfx.buy() : sfx.error(); }
    else if (act === 'decline-offer') { declineOffer(s, id); this.toast('Offer declined.'); }
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
      <div class="row"><button class="btn" data-act="modal-cancel">Look around</button><button class="btn go" data-act="new-game">New game</button></div>`);
  }
}
