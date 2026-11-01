// Skyline Hustle - HTML overlay: HUD, bottom sheet (lot details and tabs),
// toasts, offer and game-over modals. The canvas is drawn by render.js.

import { DISTRICTS, BUSINESSES, BIZ, PRICE_TIERS, FIT_LEVELS, MAX_STAFF, APT_NAMES, APT_RESIDENTS,
  MAX_APT, STATION_FARE, UTILITY_CUT, SCENARIOS, RIVALS, LOAN_STEP, LOAN_RATE, OVERHEAD_BASE, OVERHEAD_RATE } from './data.js';
import {
  MAP, money, landValue, rentFor, ownsSet, setCount, estimate, buyLand, sellLand, build, sellBusiness,
  setTier, setStaff, upgradeFit, fitCost, aptCheck, buildApt, sellApt, aptRentFor, makeOffer, acceptOffer,
  declineOffer, takeLoan, repayLoan, loanLimit, netWorth, playerAssets, capacity, districtPopulation,
  LEDGER_LABELS, dayName, PROFILE, askingPrice,
} from './sim.js';
import { sfx, setSound, soundOn } from './audio.js';

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sign = v => (v >= 0 ? '+' : '') + money(v);
const cls = v => v >= 0 ? 'pos' : 'neg';
const ME = 0;

export class UI {
  constructor(app) {
    this.app = app;
    this.view = null;          // { kind: 'lot', id } | { kind: 'tab', name }
    this.lastTouch = 0;
    this.seenNews = 0;
    this.shownOffers = new Set();
    this.offerDraft = {};      // lotId -> amount
    this.counter = {};         // lotId -> rival's asking price
    this.tickerQueue = [];
    this.tickerUntil = 0;

    $('sheet-body').addEventListener('click', e => this.onClick(e));
    $('modal-card').addEventListener('click', e => this.onClick(e));
    $('sheet').addEventListener('pointerdown', () => { this.lastTouch = performance.now(); });
    $('sheet-close').addEventListener('click', () => { sfx.tap(); this.close(); });
    $('hud-cash').addEventListener('click', () => { sfx.tap(); this.openTab('bank'); });
    $('goal').addEventListener('click', () => { sfx.tap(); this.openTab('rivals'); });
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
  }

  get s() { return this.app.s; }

  // ---------------------------------------------------------- sheet ----
  openLot(id) {
    this.view = { kind: 'lot', id };
    this.app.renderer.sel = id;
    this.render();
    const sheetH = $('sheet').offsetHeight + 58;
    this.app.renderer.focusLot(this.s.lots[id], sheetH);
  }
  openTab(name) {
    this.view = { kind: 'tab', name };
    this.app.renderer.sel = -1;
    this.render();
    $('sheet').scrollTop = 0;
  }
  close() {
    this.view = null;
    this.app.renderer.sel = -1;
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
    const body = $('sheet-body');
    const scroll = $('sheet').scrollTop;
    let html = '';
    if (v.kind === 'lot') html = this.lotHTML(this.s.lots[v.id]);
    else html = ({ empire: () => this.empireHTML(), sets: () => this.setsHTML(), rivals: () => this.rivalsHTML(),
      bank: () => this.bankHTML(), menu: () => this.menuHTML() })[v.name]();
    body.innerHTML = html;
    $('sheet').classList.remove('hidden');
    $('sheet').scrollTop = scroll;
    this.navState();
  }

  // Refresh live numbers unless the player is mid-tap.
  refresh() {
    if (this.view && performance.now() - this.lastTouch > 900) this.render();
  }

  // ------------------------------------------------------------ lot ----
  lotHTML(lot) {
    const s = this.s, me = s.players[ME];
    const owner = lot.owner >= 0 ? s.players[lot.owner] : null;
    const ownerTxt = !owner ? 'City-owned · for sale' : owner.id === ME ? 'Your land' : `Owned by ${esc(owner.company)}`;
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
      const pop = districtPopulation(s, lot.district);
      h += `<p class="note">Block population: <b>${Math.round(pop.residents).toLocaleString()}</b> residents · <b>${Math.round(pop.tourists).toLocaleString()}</b> visitors.
        Mix: ${DISTRICTS[lot.district].mix.map((m, i) => `${Math.round(m * 100)}% ${['budget', 'middle', 'wealthy'][i]}`).join(', ')}.</p>`;
    }
    return h;
  }

  setBarHTML(d, current = -1) {
    const s = this.s;
    const ids = MAP.districtLots[d];
    const dots = ids.map((id, i) => {
      const l = s.lots[id];
      const c = l.owner >= 0 ? s.players[l.owner].color : 'rgba(255,255,255,0.08)';
      return `<span class="setdot ${id === current ? 'me' : ''}" style="background:${c}" title="${esc(l.name)}">${i + 1}</span>`;
    }).join('');
    const mine = setCount(s, ME, d), n = ids.length;
    let txt;
    const full = s.players.find(p => ownsSet(s, p.id, d));
    if (full && full.id === ME) txt = '<b class="pos">Set complete!</b> Rent ×2, apartments unlocked.';
    else if (full) txt = `<b class="neg">${esc(full.company)}</b> owns the whole set.`;
    else if (mine === n - 1) txt = '<b class="warn">One lot away</b> from completing this set!';
    else if (mine) txt = `You own <b>${mine} of ${n}</b>. Collect them all to double rent and build up.`;
    else {
      const lead = s.players.map(p => [p, setCount(s, p.id, d)]).sort((a, b) => b[1] - a[1])[0];
      txt = lead[1] ? `${esc(lead[0].company)} owns ${lead[1]} of ${n}.` : `${n} lots in this colour. Own them all for double rent + apartments.`;
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
      h += `<div class="row"><button class="btn buy" data-act="buy" ${me.cash < value ? 'disabled' : ''}>Buy land · ${money(value)}</button></div>`;
      if (me.cash < value) h += `<p class="note">You need ${money(value - me.cash)} more. The bank may lend it to you.</p>`;
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
    if (!b) {
      const rentNote = lot.owner === ME ? 'Your land: no ground rent.' :
        lot.owner === -1 ? `You'd lease from the city: ${money(rentFor(s, lot))}/day rent.` :
        `You'd pay ${esc(s.players[lot.owner].company)} ${money(rentFor(s, lot))}/day rent.`;
      const opts = BUSINESSES.map(def => ({ def, e: estimate(s, lot.id, def.id, ME, { tier: 2, staff: 3 }) }))
        .sort((a, b) => b.e.profit - a.e.profit);
      const best = opts[0]?.def.id;
      return `<h3>Open a business</h3><p class="note">${rentNote} Forecasts assume fair prices and 3 staff.</p>
        <div class="biz-list">${opts.map(({ def, e }) => `
          <button class="biz-opt ${def.id === best && e.profit > 0 ? 'best' : ''}" data-act="build" data-type="${def.id}" ${me.cash < def.cost ? 'disabled' : ''}>
            <i>${def.icon}</i>
            <span><b>${def.name}</b><small>${money(def.cost)} · ${def.open[0]}:00–${def.open[1] % 24}:00 · ~${Math.round(e.cust)} cust/day</small></span>
            <span class="est ${cls(e.profit)}">${sign(e.profit)}<small>per day</small></span>
          </button>`).join('')}</div>`;
    }
    const def = BIZ[b.type];
    const owner = s.players[b.owner];
    const y = b.yesterday;
    if (b.owner !== ME) {
      const e = estimate(s, lot.id, b.type, b.owner, {});
      return `<h3>Business</h3><div class="card">
        <div class="row" style="margin:0"><span style="font-size:26px">${def.icon}</span>
        <div><b>${def.name}</b><div class="note" style="margin:0">Run by <b style="color:${owner.color}">${esc(owner.company)}</b> · ${PRICE_TIERS[b.tier].name} prices · ${FIT_LEVELS[b.fit].name} fit-out · ${b.staff} staff</div></div></div>
        <p class="note">Est. ~${Math.round(e.cust)} customers a day. ${lot.owner === ME ? `They pay you <b class="pos">${money(rentFor(s, lot))}</b> a day in rent.` : ''}</p></div>`;
    }
    const cap = capacity(b);
    const peak = y ? Math.min(1, y.peak) : 0;
    const e = estimate(s, lot.id, b.type, ME, {});
    const profitY = y ? y.rev - y.cost : null;
    const fc = fitCost(b);
    let h = `<h3>${def.icon} ${def.name} <em>${FIT_LEVELS[b.fit].name}</em></h3>`;
    h += `<div class="stats">
      <div class="stat"><small>${y ? 'Yesterday' : 'Today so far'}</small><b class="${cls(profitY ?? (b.today.rev - b.today.cost))}">${sign(profitY ?? (b.today.rev - b.today.cost))}</b></div>
      <div class="stat"><small>Customers</small><b>${Math.round(y ? y.cust : b.today.cust)}</b></div>
      <div class="stat"><small>Turned away</small><b class="${(y ? y.lost : b.today.lost) > 5 ? 'warn' : ''}">${Math.round(y ? y.lost : b.today.lost)}</b></div>
    </div>
    <div class="note" style="margin-bottom:0">Peak busyness ${Math.round((y ? y.peak : b.today.peak) * 100)}% of ${Math.round(cap)}/hr capacity</div>
    <div class="meter"><i class="${peak >= 1 ? 'hot' : ''}" style="width:${Math.round(peak * 100)}%"></i></div>`;
    h += `<div class="ctl"><span>Prices</span></div>
      <div class="seg">${PRICE_TIERS.map((t, i) => `<button data-act="tier" data-v="${i}" class="${b.tier === i ? 'on' : ''}">${t.name}</button>`).join('')}</div>
      <div class="ctl"><span>Staff <small class="dim">(${money(def.wage)}/hr each)</small></span>
        <div class="stepper"><button data-act="staff" data-v="-1">−</button><b>${b.staff}</b><button data-act="staff" data-v="1">+</button></div></div>
      <p class="note">Forecast at these settings: <b class="${cls(e.profit)}">${sign(e.profit)}/day</b> from ~${Math.round(e.cust)} customers${e.lost > 3 ? `, <span class="warn">${Math.round(e.lost)} turned away (hire!)</span>` : ''}.</p>
      <div class="row">
        ${fc ? `<button class="btn small" data-act="refit" ${me.cash < fc ? 'disabled' : ''}>Refit: ${FIT_LEVELS[b.fit + 1].name} · ${money(fc)}</button>` : ''}
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
      if (!lot.apt) h += '<p class="note">The landowner can build apartments here once they own the whole colour set.</p>';
      return h;
    }
    const chk = aptCheck(s, ME, lot.id);
    if (chk.ok) {
      const next = lot.apt + 1;
      h += `<div class="row"><button class="btn gold" data-act="apt" ${me.cash < chk.cost ? 'disabled' : ''}>
        ${next === MAX_APT ? '🏙️ Build Skyline Tower' : `🏢 Add ${APT_NAMES[next].replace('floors', 'floors total')}`} · ${money(chk.cost)}</button></div>
        <p class="note">+${APT_RESIDENTS[next] - APT_RESIDENTS[lot.apt]} residents (more customers for the whole block) and higher rents.</p>`;
    } else if (lot.apt < MAX_APT) h += `<p class="note">🔒 ${esc(chk.msg)}</p>`;
    if (lot.apt) h += `<div class="row"><button class="btn small danger" data-act="sell-apt">Demolish one level</button></div>`;
    return h;
  }

  stationHTML(lot) {
    const s = this.s;
    const k = lot.owner >= 0 ? s.lots.filter(l => l.kind === 'station' && l.owner === lot.owner).length : 0;
    const rows = [1, 2, 3, 4].map(n => `<div class="stat"><small>Own ${n}</small><b>${money(STATION_FARE[n])}</b></div>`).join('');
    return `<p class="note">Stations collect fares every night, and each pays more the more stations the same company owns.
      They also bring visitors to the blocks around them.${lot.owner >= 0 ? ` Owner holds <b>${k}</b> of 4.` : ''}</p>
      <div class="stats" style="grid-template-columns:repeat(4,1fr)">${rows}</div><p class="note">Fare per station per day.</p>`;
  }
  utilityHTML(lot) {
    const s = this.s;
    const pool = s.lots.reduce((a, l) => a + (l.business ? OVERHEAD_BASE + BIZ[l.business.type].cost * OVERHEAD_RATE : 0), 0);
    return `<p class="note">Every business in the city pays a nightly bill. Each utility you own takes
      <b>${Math.round(UTILITY_CUT[1] * 100)}%</b> of it, or <b>${Math.round(UTILITY_CUT[2] * 100)}%</b> each if you own both.
      The city's bills are now <b>${money(pool)}</b> a night, and they grow with every shop that opens.</p>`;
  }

  // --------------------------------------------------------- empire ----
  empireHTML() {
    const s = this.s, me = s.players[ME];
    const y = me.yesterday;
    const op = Object.entries(y).filter(([k]) => k !== 'capex' && k !== 'trade').reduce((a, [, v]) => a + v, 0);
    const mine = s.lots.filter(l => (l.business && l.business.owner === ME) || l.owner === ME);
    let h = `<div class="sh-head"><div class="chip" style="background:var(--you)">💼</div><div><div class="sh-title">${esc(me.company)}</div>
      <div class="sh-sub">Net worth ${money(netWorth(s, ME))} · yesterday <span class="${cls(op)}">${sign(op)}</span></div></div></div>`;
    if (!mine.length) return h + `<p class="note">You don't own anything yet. Tap any lot on the map to buy land or open a business.
      Cheap blocks (Foundry, Canal) are a good place to start. Coffee and burgers are quick earners.</p>`;
    const biz = mine.filter(l => l.business && l.business.owner === ME);
    if (biz.length) {
      h += `<h3>Businesses <em>${biz.length}</em></h3>`;
      for (const l of biz) {
        const b = l.business, def = BIZ[b.type];
        const p = b.yesterday ? b.yesterday.rev - b.yesterday.cost : b.today.rev - b.today.cost;
        const busy = b.yesterday && b.yesterday.lost > 5 ? ' · <span class="warn">turning people away</span>' : '';
        h += `<button class="list-item" data-act="goto" data-id="${l.id}"><span style="font-size:22px">${def.icon}</span>
          <span class="grow"><b>${def.name}</b><small><span style="color:${DISTRICTS[l.district].color}">■</span> ${esc(l.name)} · ${PRICE_TIERS[b.tier].name} · ${b.staff} staff${busy}</small></span>
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
      <div class="sh-sub">Own every lot of a colour: double rent + apartments</div></div></div>`;
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
        <span class="grow"><b>${esc(D.name)}</b><small>from ${money(landValue(s, s.lots[ids[0]]))} · ${D.mix[2] >= 0.35 ? 'wealthy' : D.mix[0] >= 0.5 ? 'budget' : 'mixed'} crowd</small></span>
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

  // --------------------------------------------------------- rivals ----
  rivalsHTML() {
    const s = this.s;
    const sc = SCENARIOS[s.scenario];
    const rows = s.players.map(p => ({ p, w: p.bankrupt ? 0 : netWorth(s, p.id) })).sort((a, b) => b.w - a.w);
    let h = `<div class="sh-head"><div class="chip" style="background:#ffd23f">🏆</div><div><div class="sh-title">Standings</div>
      <div class="sh-sub">${sc.goal ? `First to ${money(sc.goal)} · day ${Math.min(s.day, sc.days)} of ${sc.days}` : 'Free play'}</div></div></div>`;
    rows.forEach(({ p, w }, i) => {
      const lots = s.lots.filter(l => l.owner === p.id).length;
      const shops = s.lots.filter(l => l.business && l.business.owner === p.id).length;
      const sets = DISTRICTS.filter((_, d) => ownsSet(s, p.id, d)).length;
      const blurb = p.human ? 'You' : RIVALS[p.id - 1].blurb;
      h += `<div class="card rival"><span class="bar" style="background:${p.color}"></span>
        <div><b>${i + 1}. ${esc(p.company)}</b> ${p.bankrupt ? '<span class="neg">BANKRUPT</span>' : ''}
          <div class="note" style="margin:2px 0">${p.human ? '' : esc(p.name) + ' · '}${esc(blurb)}</div>
          <div class="note" style="margin:0">${lots} lots · ${shops} shops · ${sets} set${sets === 1 ? '' : 's'} · cash ${money(p.cash)}${p.loan ? ` · owes ${money(p.loan)}` : ''}</div>
          ${this.spark(p)}</div>
        <div class="amt" style="text-align:right;font-weight:900">${money(w)}<div class="note" style="margin:0">${sc.goal ? Math.min(100, Math.round(w / sc.goal * 100)) + '%' : ''}</div></div></div>`;
    });
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
    const op = keys.filter(k => k !== 'capex' && k !== 'trade').reduce((a, k) => a + y[k], 0);
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
    return `<div class="sh-head"><div class="chip" style="background:#5b6475">☰</div><div><div class="sh-title">Menu</div>
      <div class="sh-sub">Saved automatically every midnight</div></div></div>
      <div class="row"><button class="btn" data-act="sound">${soundOn() ? '🔊 Sound on' : '🔇 Sound off'}</button><button class="btn" data-act="save">💾 Save now</button></div>
      <div class="row"><button class="btn" data-act="help">❓ How to play</button><button class="btn danger" data-act="quit">🚪 Quit to title</button></div>`;
  }

  // -------------------------------------------------------- actions ----
  onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    this.lastTouch = 0;
    const s = this.s;
    const lotId = this.view?.kind === 'lot' ? this.view.id : -1;
    const act = el.dataset.act;
    const res = r => {
      if (!r) return;
      if (r.ok) { if (r.msg) this.toast(r.msg, r.setComplete ? 'set' : 'good'); }
      else if (r.msg) { this.toast(r.msg, 'bad'); sfx.error(); }
      return r.ok;
    };
    switch (act) {
      case 'buy': if (res(buyLand(s, ME, lotId))) { this.celebrate(lotId); } break;
      case 'sell-land': this.confirm('Sell this land back to the city?', 'You get 70% of its value plus half of what you spent on apartments. Any apartments are demolished.', () => { res(sellLand(s, ME, lotId)); sfx.buy(); }); return;
      case 'build': {
        const def = BIZ[el.dataset.type];
        if (res(build(s, ME, lotId, def.id))) { sfx.build(); this.app.renderer.floater(s.lots[lotId], `−${money(def.cost)}`, '#ff8a8a', true); }
        break;
      }
      case 'tier': setTier(s, ME, lotId, +el.dataset.v); sfx.tap(); break;
      case 'staff': setStaff(s, ME, lotId, s.lots[lotId].business.staff + +el.dataset.v); sfx.tap(); break;
      case 'refit': if (res(upgradeFit(s, ME, lotId))) sfx.build(); break;
      case 'sell-biz': this.confirm('Close this business?', `You recover half of what you invested (${money(s.lots[lotId].business.invested * 0.5)}).`, () => { res(sellBusiness(s, ME, lotId)); sfx.buy(); }); return;
      case 'apt': if (res(buildApt(s, ME, lotId))) { sfx.build(); if (s.lots[lotId].apt === MAX_APT) sfx.set(); } break;
      case 'sell-apt': res(sellApt(s, ME, lotId)); break;
      case 'offer-adj': {
        const v = Math.max(1000, (this.offerDraft[lotId] || 0) + +el.dataset.v);
        this.offerDraft[lotId] = v; sfx.tap(); break;
      }
      case 'offer': case 'offer-ask': {
        const amt = act === 'offer' ? this.offerDraft[lotId] : this.counter[lotId];
        const r = makeOffer(s, ME, lotId, amt);
        if (r.ok) { this.toast(r.msg, 'set'); delete this.counter[lotId]; this.celebrate(lotId); }
        else { if (r.counter) this.counter[lotId] = r.counter; this.toast(r.msg, 'bad'); sfx.error(); }
        break;
      }
      case 'goto': this.openLot(+el.dataset.id); sfx.tap(); return;
      case 'loan': res(takeLoan(s, ME)); sfx.buy(); break;
      case 'repay': res(repayLoan(s, ME)); sfx.tap(); break;
      case 'repay-all': res(repayLoan(s, ME, s.players[ME].loan)); sfx.tap(); break;
      case 'sound': setSound(!soundOn()); localStorage.setItem('skyline-sound', soundOn() ? '1' : '0'); break;
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

  celebrate(lotId) {
    const lot = this.s.lots[lotId];
    if (lot.kind === 'prop' && ownsSet(this.s, ME, lot.district)) {
      sfx.set();
      this.modal(`<h2>🎨 ${esc(DISTRICTS[lot.district].name)} is yours!</h2>
        <p>You own the whole colour set. Ground rent on every lot here is now <b>doubled</b>, and you can build
        <b>apartments</b>, two floors at a time, all the way up to a <b>Skyline Tower</b>.</p>
        <p class="note">Build evenly: each lot has to reach the same height before any lot goes higher.</p>
        <div class="row"><button class="btn gold wide" data-act="modal-cancel">Let's build</button></div>`);
    } else sfx.buy();
  }

  // ---------------------------------------------------------- hours ----
  onHour() {
    const s = this.s;
    // News -> toasts / ticker.
    const fresh = s.news.filter(n => n.seq > this.seenNews).reverse();
    for (const n of fresh) {
      this.seenNews = Math.max(this.seenNews, n.seq);
      if (n.who === ME && n.kind !== 'set') continue;
      if (n.kind === 'set' || n.kind === 'event' || n.kind === 'bad' || n.kind === 'warn') {
        this.toast(n.text, n.kind === 'warn' ? 'bad' : n.kind);
        if (n.kind === 'bad') sfx.bad();
      } else this.tickerQueue.push(n);
    }
    // Offers from rivals.
    const offer = s.offers.find(o => o.to === ME && !this.shownOffers.has(o.id));
    if (offer && $('modal').classList.contains('hidden')) this.showOffer(offer);
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
      <p class="note" style="text-align:center">Land value ${money(landValue(s, lot))}${lot.aptInvested ? ` + apartments` : ''}</p>
      ${completes ? `<p class="warn">⚠ Selling would hand them the complete ${esc(DISTRICTS[lot.district].name)} set: double rent and apartments.</p>` : ''}
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
    else { this.shownOffers.delete(id); this.openLot(o.lotId); this.toast('The offer stands until tomorrow. It will pop up again.'); }
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
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, kind === 'set' ? 4200 : 2800);
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
