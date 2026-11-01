// Skyline Hustle - brands, landmarks and City Hall.
//
//   Chains     three or more shops of one type under one company. They buy
//              stock in bulk, share a reputation and win loyal customers.
//   Landmarks  one of each per city. Meet the requirement, build on an empty
//              lot of yours, race the rivals: the first to finish owns it;
//              everyone else gets half their money back.
//   Projects   City Hall posts jobs: tenders (lowest quote builds it and is
//              paid in instalments), sponsorships (highest bid) and grants
//              (paid to anyone who builds the right thing in time).
//
// Every hour refreshPerks() works out each shop's bonuses (b.boost, b.bulk,
// b.crep, b.chain) and each company's perks (p.perks); the sim just reads
// those fields. DOM-free: runs on the server for LAN games.

import {
  BIZ, DISTRICTS, CHAIN_MIN, CHAIN_REP_SHARE, FAMOUS_BOOST, CHAIN_TIERS, LANDMARKS, LANDMARK_SETS, LANDMARK_NEAR,
  LANDMARK_REFUND, LANDMARK_RUSH, PROJECTS, PROJECT_GAP, TENDER_DAYS, PARKS,
} from './data.js';
import {
  MAP, rand, ledger, news, money, yearOf, setsOwned, netWorth, chainBulk, loanLimit, sellBusiness, lockedLot,
  bizLabel, blockStars, dayName,
} from './sim.js';

export const LM = Object.fromEntries(LANDMARKS.map(l => [l.id, l]));
const NIGHT = new Set(['cinema', 'arcade', 'club', 'bistro', 'hotel']);
const fail = msg => ({ ok: false, msg });
const isWeekend = s => ['Sat', 'Sun'].includes(dayName(s));
const inflation = s => 1 + 0.006 * (s.day - 1);
const mapK = () => 1 + 0.25 * (Math.sqrt((MAP.lotDefs?.length || 28) / 28) - 1);

function civic(s) {
  s.landmarks ||= {};
  s.lmBuilds ||= [];
  s.projects ||= [];
  s.tram ||= {};
  s.projSeq ||= 0;
  s.nextProject ??= 3;
  return s;
}

// ---------------------------------------------------------- chains ----
export function chainOf(s, b) {
  return s.lots.filter(l => l.business && l.business.owner === b.owner && l.business.type === b.type);
}
export function chainTier(n) {
  let t = null;
  for (const tier of CHAIN_TIERS) if (n >= tier[0]) t = tier;
  return t;
}
export const brandName = (s, b) => {
  const co = s.players[b.owner].company, first = co.split(/[ &]/)[0];
  return `${/^(your|the|my)$/i.test(first) ? co : first} ${bizLabel(s, b.type)}`;
};

// Copy one branch's price, hours and stock policy to the whole chain.
export function chainSync(s, pid, lotId) {
  const src = s.lots[lotId]?.business;
  if (!src || src.owner !== pid) return fail('Not your business.');
  const all = chainOf(s, src).filter(l => l.id !== lotId);
  if (!all.length) return fail('No other branches.');
  for (const l of all) {
    const b = l.business;
    b.price = src.price; b.from = src.from; b.len = src.len; b.autoStock = src.autoStock;
    if (!src.autoStock) b.stockTarget = src.stockTarget;
  }
  return { ok: true, msg: `Price, hours and stock policy copied to ${all.length} other branch${all.length === 1 ? '' : 'es'}.` };
}

// ------------------------------------------------------------ perks ----
const near = d => [d, ...(MAP.neighbours[d] || []).map(n => n.d)];

export function refreshPerks(s) {
  civic(s);
  for (const p of s.players) p.perks = {};
  const groups = new Map();
  const shops = [];
  for (const l of s.lots) {
    const b = l.business;
    if (!b) continue;
    shops.push(l);
    const k = b.owner + ':' + b.type;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  // Chains: bulk buying, a shared reputation, fame.
  for (const list of groups.values()) {
    const n = list.length;
    const avg = list.reduce((a, b) => a + (b.rep ?? 1), 0) / n;
    for (const b of list) {
      b.chain = n >= CHAIN_MIN ? n : 0;
      b.bulk = chainBulk(n);
      if (b.chain) b.crep = (1 - CHAIN_REP_SHARE) * (b.rep ?? 1) + CHAIN_REP_SHARE * avg;
      else delete b.crep;
      b.boost = n >= CHAIN_TIERS.at(-1)[0] ? 1 + FAMOUS_BOOST : 1;
    }
  }
  const boostIf = (test, f) => { for (const l of shops) if (test(l, l.business)) l.business.boost *= f; };
  // Landmarks: crowds for the neighbourhood, a perk for the owner.
  const wkd = isWeekend(s);
  for (const [id, L] of Object.entries(s.landmarks)) {
    const def = LM[id], lot = s.lots[L.lot], d = lot.district;
    L.owner = lot.owner;                 // whoever holds the land holds the landmark
    const o = L.owner, P = o >= 0 && !s.players[o].bankrupt ? s.players[o].perks : null;
    const close = new Set(near(d));
    boostIf(l => l.district === d, 1 + LANDMARK_NEAR[0]);
    boostIf(l => l.district !== d && close.has(l.district), 1 + LANDMARK_NEAR[1]);
    const mine = b => b.owner === o;
    switch (id) {
      case 'clock': boostIf((l, b) => mine(b) && close.has(l.district), 1.12); break;
      case 'terminal': if (P) P.fares = 1.5; break;
      case 'opera': boostIf((l, b) => mine(b) && b.fit >= 2, 1.15); break;
      case 'stadium':
        if (wkd) boostIf((l, b) => close.has(l.district) && (BIZ[b.type].group === 'food' || BIZ[b.type].need === 'fun'), 1.4);
        if (wkd) boostIf((l, b) => mine(b) && close.has(l.district) && (BIZ[b.type].group === 'food' || BIZ[b.type].need === 'fun'), 1.6 / 1.4);
        break;
      case 'tvtower': if (P) { P.promo = 0.5; P.promoDays = 1.5; } break;
      case 'convention': boostIf((l, b) => mine(b) && (b.type === 'hotel' || b.type === 'bistro'), 1.25); break;
      case 'glasshq': if (P) { P.loanRate = 0.5; P.credit = 1.5; } break;
      case 'museum':
        if (wkd) boostIf(l => close.has(l.district), 1.3);
        if (wkd) boostIf((l, b) => mine(b) && close.has(l.district), 1.45 / 1.3);
        break;
      case 'campus': if (P) { P.techAhead = 5; P.freeSurvey = true; } break;
      case 'wheel': boostIf(l => l.district === d, 1.2); break;
    }
  }
  // City projects that last: tram lines and street lights.
  for (const l of shops) if (s.tram[l.district]) l.business.boost *= 1 + 0.08 * s.tram[l.district];
  if (s.nightlife) boostIf((l, b) => NIGHT.has(b.type), 1 + s.nightlife);
  const f = s.festival;
  if (f && s.day <= f.until) {
    boostIf((l, b) => b.owner === f.sponsor, 1.3);
    boostIf(l => l.district === f.d, 1.2);
  }
}

// -------------------------------------------------------- landmarks ----
export const landmarkSet = s => LANDMARK_SETS[s.mapId || 'town'] || LANDMARK_SETS.town;

export function reqProgress(s, pid, def) {
  const [k, n] = Object.entries(def.req)[0];
  const have = k === 'shops' ? s.lots.filter(l => l.business?.owner === pid).length
    : k === 'stations' ? s.lots.filter(l => l.kind === 'station' && l.owner === pid).length
    : k === 'sets' ? setsOwned(s, pid)
    : netWorth(s, pid);
  const label = k === 'shops' ? `Run ${n} shops` : k === 'stations' ? `Own ${n} stations` : k === 'sets' ? `Own ${n} colour set${n > 1 ? 's' : ''}` : `Net worth ${money(n)}`;
  return { have, need: n, ok: have >= n, label, key: k };
}

// Where a landmark stands in the race: 'locked' (not yet invented), 'open',
// 'built' (someone has it).
export function landmarkState(s, id) {
  civic(s);
  const def = LM[id];
  if (s.landmarks[id]) return { state: 'built', ...s.landmarks[id] };
  if (yearOf(s) < def.year) return { state: 'locked' };
  return { state: 'open', builds: s.lmBuilds.filter(b => b.id === id) };
}

export function freeLotsFor(s, pid) {
  return s.lots.filter(l => l.kind === 'prop' && l.owner === pid && !l.business && !l.apt && !lockedLot(l));
}

export function canLandmark(s, pid, id) {
  civic(s);
  const def = LM[id];
  if (!def || !landmarkSet(s).includes(id)) return fail('No such landmark in this city.');
  const st = landmarkState(s, id);
  if (st.state === 'locked') return fail(`Not until ${def.year}.`);
  if (st.state === 'built') return fail(`${s.players[st.owner]?.company || 'Someone'} already built it.`);
  if (s.lmBuilds.some(b => b.pid === pid)) return fail('You are already building a landmark.');
  const r = reqProgress(s, pid, def);
  if (!r.ok) return fail(`Needs: ${r.label} (you have ${r.key === 'worth' ? money(r.have) : r.have}).`);
  return { ok: true, cost: Math.round(def.cost * inflation(s) / 1000) * 1000 };
}

export function startLandmark(s, pid, lotId, id) {
  const chk = canLandmark(s, pid, id);
  if (!chk.ok) return chk;
  const lot = s.lots[lotId], p = s.players[pid], def = LM[id];
  if (!lot || lot.kind !== 'prop' || lot.owner !== pid) return fail('Build it on a lot of your own.');
  if (lot.business || lot.apt || lockedLot(lot)) return fail('The lot must be empty: no shop, no apartments.');
  if (p.cash < chk.cost) return fail(`Need ${money(chk.cost)}.`);
  ledger(p, 'capex', -chk.cost);
  s.lmBuilds.push({ id, pid, lot: lotId, left: def.days, days: def.days, paid: chk.cost, rushed: false, start: s.day });
  lot.lmBuild = id;
  lot.lmValue = Math.round(chk.cost * LANDMARK_REFUND);
  const rivals = s.lmBuilds.filter(b => b.id === id && b.pid !== pid).length;
  news(s, `🏗️ ${p.company} started building the ${def.name} on ${lot.name}.${rivals ? ' The race is on!' : ''}`, 'build', pid);
  return { ok: true, msg: `${def.icon} The ${def.name} is going up: ${def.days} days to finish. Beat the rivals to it!` };
}

export function rushCost(s, b) { return Math.round(b.paid * LANDMARK_RUSH / 1000) * 1000; }
export function rushLandmark(s, pid) {
  civic(s);
  const b = s.lmBuilds.find(x => x.pid === pid);
  if (!b) return fail('Nothing under construction.');
  if (b.rushed) return fail('The crews are already working round the clock.');
  if (b.left <= 1) return fail('It opens tomorrow anyway.');
  const c = rushCost(s, b), p = s.players[pid];
  if (p.cash < c) return fail(`Need ${money(c)}.`);
  ledger(p, 'capex', -c);
  b.paid += c;
  b.rushed = true;
  b.left = Math.ceil(b.left / 2);
  s.lots[b.lot].lmValue = Math.round(b.paid * LANDMARK_REFUND);
  news(s, `⏩ ${p.company} put night shifts on the ${LM[b.id].name}.`, 'build', pid);
  return { ok: true, msg: `Night shifts: ${b.left} day${b.left === 1 ? '' : 's'} to go.` };
}

function clearBuild(s, b, refund) {
  const lot = s.lots[b.lot];
  delete lot.lmBuild;
  lot.lmValue = 0;
  if (refund) ledger(s.players[b.pid], 'capex', Math.round(b.paid * LANDMARK_REFUND));
}

function landmarkDay(s) {
  // Builders who lost their land lose the build.
  for (const b of s.lmBuilds) if (s.lots[b.lot].owner !== b.pid || s.players[b.pid].bankrupt) { clearBuild(s, b, false); b.dead = true; }
  s.lmBuilds = s.lmBuilds.filter(b => !b.dead);
  for (const b of s.lmBuilds) b.left--;
  const order = [...s.lmBuilds].sort((a, b) => a.left - b.left || a.start - b.start);
  for (const b of order) {
    if (b.left > 0 || s.landmarks[b.id] || b.done) continue;
    const def = LM[b.id], lot = s.lots[b.lot], p = s.players[b.pid];
    s.landmarks[b.id] = { owner: b.pid, lot: b.lot, day: s.day };
    delete lot.lmBuild;
    lot.landmark = b.id;
    lot.lmValue = Math.round(b.paid * LANDMARK_REFUND);
    b.done = true;
    news(s, `${def.icon} ${p.company} opened the ${def.name}! ${def.perk}`, 'set', b.pid);
    for (const o of s.lmBuilds) {
      if (o === b || o.id !== b.id) continue;
      clearBuild(s, o, true);
      o.done = true;
      news(s, `${s.players[o.pid].company} lost the race for the ${def.name} and got ${money(o.paid * LANDMARK_REFUND)} back.`, 'bad', o.pid);
    }
  }
  s.lmBuilds = s.lmBuilds.filter(b => !b.done);
  // Upkeep and ticket sales.
  const weekend = ['Sat', 'Sun'].includes(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(s.day - 2 + 7) % 7]);
  for (const [id, L] of Object.entries(s.landmarks)) {
    if (L.owner < 0 || s.players[L.owner].bankrupt) continue;
    const def = LM[id];
    const take = (def.tickets + (weekend ? def.weekend || 0 : 0)) * (0.7 + 0.3 * (s.touristMult || 1)) * inflation(s);
    ledger(s.players[L.owner], 'landmarks', take - def.upkeep * inflation(s));
  }
}

// --------------------------------------------------------- projects ----
function pickRoute(s, len) {
  const n = DISTRICTS.length;
  let d = Math.floor(rand(s) * n);
  const route = [d];
  for (let i = 1; i < len; i++) {
    const next = (MAP.neighbours[d] || []).map(x => x.d).filter(x => !route.includes(x));
    if (!next.length) break;
    d = next[Math.floor(rand(s) * next.length)];
    route.push(d);
  }
  return route;
}
const dName = d => DISTRICTS[d]?.name || '?';
export function projectText(pr) {
  const def = PROJECTS[pr.type];
  return def.text.replace('{route}', (pr.route || []).map(dName).join(', ')).replaceAll('{d}', dName(pr.d))
    .replace('{amt}', money(pr.amount)).replace('{days}', def.days).replace('{cap}', pr.cap);
}

function postProject(s) {
  const types = Object.keys(PROJECTS).filter(t => t !== s.lastProjectType && !(t === 'lights' && (s.nightlife || 0) >= 0.24));
  const type = types[Math.floor(rand(s) * types.length)];
  const def = PROJECTS[type], k = inflation(s) * mapK();
  const pr = { id: ++s.projSeq, type, posted: s.day, state: def.kind === 'grant' ? 'open' : 'tender', bids: {} };
  if (def.kind === 'tender') {
    pr.budget = Math.round(def.budget * k / 500) * 500;
    pr.cost = Math.round(pr.budget * def.costShare / 500) * 500;
    pr.work = def.work;
    pr.closes = s.day + TENDER_DAYS;
    if (type === 'tram') pr.route = pickRoute(s, 3 + (DISTRICTS.length > 20 ? 1 : 0));
  } else if (def.kind === 'sponsor') {
    pr.budget = Math.round(def.budget * k / 500) * 500;
    pr.closes = s.day + TENDER_DAYS;
    pr.d = Math.floor(rand(s) * DISTRICTS.length);
  } else {
    pr.closes = s.day + def.days;
    pr.cap = def.cap;
    pr.claimed = 0;
    if (type === 'housing') pr.amount = Math.round(def.budget * k / 100) * 100;
    else {
      pr.amount = def.budget;
      pr.route = DISTRICTS.map((_, d) => d).sort((a, b) => blockStars(s, a) - blockStars(s, b) || a - b).slice(0, 3);
    }
  }
  s.projects.push(pr);
  s.lastProjectType = type;
  news(s, `🏛️ City Hall: ${def.icon} ${def.name}. ${projectText(pr)}`, 'event');
  aiProjectBids(s, pr);
}

export function quoteRange(pr) {
  return PROJECTS[pr.type].kind === 'tender' ? [Math.round(pr.budget * 0.5), pr.budget] : [pr.budget, pr.budget * 10];
}
export function bidProject(s, pid, projId, amount) {
  civic(s);
  const pr = s.projects.find(x => x.id === projId);
  if (!pr || pr.state !== 'tender') return fail('Bidding is closed.');
  const def = PROJECTS[pr.type], p = s.players[pid];
  const [lo, hi] = quoteRange(pr);
  amount = Math.round(amount / 500) * 500;
  if (amount < lo || amount > hi) return fail(def.kind === 'tender' ? `Quote between ${money(lo)} and ${money(hi)}.` : `Bid at least ${money(lo)}.`);
  const need = def.kind === 'tender' ? pr.cost : amount;
  if (p.cash + Math.max(0, loanLimit(s, pid) - p.loan) < need) return fail(`You'd need ${money(need)} to take this on.`);
  pr.bids[pid] = amount;
  return { ok: true, msg: def.kind === 'tender' ? `Quote of ${money(amount)} submitted. Lowest quote wins on day ${pr.closes}.` : `Bid of ${money(amount)} sealed. Highest bid wins on day ${pr.closes}.` };
}

function aiProjectBids(s, pr) {
  const def = PROJECTS[pr.type];
  if (def.kind === 'grant') return;
  for (const p of s.players) {
    if (p.human || p.bankrupt) continue;
    if (def.kind === 'tender') {
      if (p.cash < pr.cost * 1.3 || rand(s) > 0.7) continue;
      const [lo, hi] = { cutter: [0.68, 0.8], baron: [0.78, 0.9], premium: [0.85, 0.97] }[p.style] || [0.75, 0.92];
      pr.bids[p.id] = Math.round(pr.budget * (lo + rand(s) * (hi - lo)) / 500) * 500;
    } else {
      if (p.cash < pr.budget * 4 || rand(s) > 0.6) continue;
      pr.bids[p.id] = Math.round(pr.budget * (1 + rand(s) * 1.5) * (p.style === 'premium' ? 1.3 : 1) / 500) * 500;
    }
  }
}

function closeProject(s, pr) {
  const def = PROJECTS[pr.type];
  const bids = Object.entries(pr.bids).map(([pid, amt]) => [+pid, amt]).filter(([pid]) => !s.players[pid].bankrupt);
  if (!bids.length) { pr.state = 'lapsed'; news(s, `🏛️ Nobody bid for the ${def.name.toLowerCase()}. City Hall shelved it.`, 'info'); return; }
  bids.sort((a, b) => def.kind === 'tender' ? a[1] - b[1] : b[1] - a[1]);
  const [pid, amt] = bids[0];
  const p = s.players[pid];
  pr.winner = pid; pr.price = amt;
  if (def.kind === 'tender') {
    ledger(p, 'projects', -pr.cost);
    pr.state = 'work'; pr.left = pr.work; pr.perDay = Math.round(amt / pr.work);
    news(s, `🏛️ ${p.company} won the ${def.name.toLowerCase()} contract at ${money(amt)}. Work starts today.`, 'deal', pid);
  } else {
    ledger(p, 'projects', -amt);
    pr.state = 'festival';
    s.festival = { d: pr.d, sponsor: pid, until: s.day + def.days - 1, id: pr.id };
    news(s, `🎪 The ${dName(pr.d)} festival opens today, sponsored by ${p.company}!`, 'event', pid);
  }
}

function projectDay(s) {
  for (const pr of s.projects) {
    const def = PROJECTS[pr.type];
    if (pr.state === 'tender' && s.day >= pr.closes) closeProject(s, pr);
    else if (pr.state === 'work') {
      const p = s.players[pr.winner];
      if (p.bankrupt) { pr.state = 'lapsed'; continue; }
      ledger(p, 'projects', pr.perDay);
      if (--pr.left <= 0) {
        pr.state = 'done'; pr.doneDay = s.day;
        if (pr.type === 'tram') for (const d of pr.route) s.tram[d] = (s.tram[d] || 0) + 1;
        if (pr.type === 'lights') s.nightlife = Math.min(0.24, (s.nightlife || 0) + 0.08);
        news(s, `${def.icon} ${p.company} finished the ${def.name.toLowerCase()}. ${pr.type === 'tram' ? `Trams now run through ${pr.route.map(dName).join(', ')}.` : 'The city glows after dark.'}`, 'event', pr.winner);
      }
    } else if (pr.state === 'festival' && s.day > s.festival?.until) { pr.state = 'done'; pr.doneDay = s.day; s.festival = null; }
    else if (pr.state === 'open' && s.day >= pr.closes) { pr.state = 'done'; pr.doneDay = s.day; }
    if (['done', 'lapsed'].includes(pr.state) && pr.doneDay == null) pr.doneDay = s.day;
  }
  s.projects = s.projects.filter(pr => !(['done', 'lapsed'].includes(pr.state) && s.day - pr.doneDay > 3));
}

export const activeProjects = s => (s.projects || []).filter(pr => ['tender', 'open', 'work', 'festival'].includes(pr.state));

// ---------------------------------------------------------------- AI ----
function aiLandmarks(s) {
  for (const p of s.players) {
    if (p.human || p.bankrupt) continue;
    const mine = s.lmBuilds.find(b => b.pid === p.id);
    if (mine) {
      // Rush if a rival is ahead in the same race.
      const rival = s.lmBuilds.find(b => b.id === mine.id && b.pid !== p.id && b.left <= mine.left);
      if (rival && !mine.rushed && p.cash > rushCost(s, mine) * 2) rushLandmark(s, p.id);
      continue;
    }
    if (rand(s) > (p.style === 'baron' ? 0.4 : 0.25)) continue;
    for (const id of landmarkSet(s)) {
      const chk = canLandmark(s, p.id, id);
      if (!chk.ok || p.cash < chk.cost * 1.35 + 15000) continue;
      let lot = freeLotsFor(s, p.id)[0];
      if (!lot) {
        // No empty land: close the weakest shop to make room.
        const weakest = s.lots.filter(l => l.business?.owner === p.id && !l.apt && !lockedLot(l))
          .map(l => [l, (l.business.hist || []).reduce((a, v) => a + v, 0)]).sort((a, b) => a[1] - b[1])[0];
        if (!weakest || weakest[1] > 0) continue;
        sellBusiness(s, p.id, weakest[0].id);
        lot = weakest[0];
      }
      startLandmark(s, p.id, lot.id, id);
      break;
    }
  }
}

// ------------------------------------------------------------ clock ----
// Called after every game hour (see game.js).
export function civicHour(s) {
  civic(s);
  if (s.hour === 0) {
    landmarkDay(s);
    projectDay(s);
    aiLandmarks(s);
  }
  if (s.hour === 9 && s.day >= s.nextProject && activeProjects(s).length < 2 && !s.over) {
    postProject(s);
    const gap = Math.max(4, Math.round(PROJECT_GAP * Math.sqrt(28 / (MAP.lotDefs?.length || 28))));
    s.nextProject = s.day + gap;
  }
  refreshPerks(s);
}
