// Skyline Hustle - the advisor. Every game hour it looks over each human
// company and keeps an inbox of things worth a look: shops that sold out or
// turn people away, losses, unhappy staff, sets one lot from done, rivals
// closing in, money trouble, deadlines. Most alerts track a live condition
// and mark themselves "sorted" once it clears; a few are one-off events.
// DOM-free: the server runs it for LAN games and the inbox travels in state.

import { BIZ, DISTRICTS, SCENARIOS, QUIT_MORALE, MAX_FLOORS } from './data.js';
import { MAP, bizLabel, money, setCount, goalProgress, goalText, netWorth, bizOpen, techOf, raceGoal } from './sim.js';
import { avgMorale, hoursEach, ROTA_HOURS } from './staff.js';
import { SHOP_COMMENTS } from './citizens.js';
import { LM, landmarkSet, landmarkState, reqProgress, rushCost, activeProjects, chainOf } from './civic.js';
import { PROJECTS, CHAIN_MIN, SUPPLY_LINES, LINE_OF } from './data.js';
import { suppliers, capOf, supplierName } from './supply.js';

export const ALERT_CATS = {
  shops:  { name: 'Shops',  icon: '🏪' },
  land:   { name: 'Land',   icon: '🧱' },
  rivals: { name: 'Rivals', icon: '🦈' },
  money:  { name: 'Money',  icon: '💰' },
  goals:  { name: 'Goals',  icon: '🎯' },
  tips:   { name: 'Tips',   icon: '💡' },
};
const MAX_ALERTS = 40;
const KEEP_DONE_HOURS = 36;      // sorted alerts linger this long, then go
const KEEP_EVENT_HOURS = 72;     // one-off events

const nowH = s => s.day * 24 + s.hour;
const pct = v => `${Math.round(v * 100)}%`;

export function inboxOf(p) {
  return (p.inbox ||= { seq: 0, list: [], mute: {}, since: {} });
}
export const unreadCount = p => (p?.inbox?.list || []).filter(a => !a.read && !a.done && !p.inbox.mute[a.cat]).length;

// What a bad customer comment means you should do.
const COMPLAINT_FIX = {
  slow: 'Hire or train servers, or appoint a manager.',
  grumpy: 'Give the team a raise or hire a manager: morale shows.',
  pricey: 'Try a lower price, or a smarter fit-out to justify it.',
  closed: 'Stretch the opening hours to when people want you.',
};

// --------------------------------------------------------- conditions ----
// Each returns the alerts that hold right now, keyed so the same problem is
// never reported twice.
function shopAlerts(s, pid, out) {
  for (const l of s.lots) {
    const b = l.business;
    if (!b || b.owner !== pid) continue;
    const name = `${bizLabel(s, b.type)} on ${l.name}`;
    const y = b.yesterday;
    const age = s.day - b.opened;
    if (b.stock < 4 && b.today.outHours >= 2 && bizOpen(b, s.hour)) {
      out.push({ key: `out:${l.id}`, cat: 'shops', sev: 'bad', icon: '📦', lot: l.id, title: `Sold out: ${name}`,
        text: b.autoStock ? 'Customers are leaving empty-handed until the 6:00 delivery.' : 'Auto-restock is off, so nothing more is coming.',
        fix: { act: 'rush', args: [l.id], label: 'Rush delivery' } });
    }
    if (y && y.outHours >= 3) {
      out.push({ key: `outy:${l.id}`, cat: 'shops', sev: 'warn', icon: '📉', lot: l.id, title: `Ran dry for ${y.outHours}h yesterday`,
        text: `${name} keeps selling out. Raise its stock target or hire a stock clerk.`, tab: 'manage' });
    }
    const asked = y ? y.cust + y.turned : 0;
    if (y && asked >= 20 && y.turned / asked > 0.2) {
      const full = (b.floors || 1) >= MAX_FLOORS;
      out.push({ key: `queue:${l.id}`, cat: 'shops', sev: 'warn', icon: '⏳', lot: l.id, title: `Turned away ${Math.round(y.turned)} customers`,
        text: `${pct(y.turned / asked)} of yesterday's customers at ${name} gave up on the queue. ${full ? 'Hire more servers.' : 'Hire servers or add a floor.'}`, tab: 'staff' });
    }
    const last = (b.days || []).slice(-3);
    if (age >= 4 && last.length === 3 && last.every(d => d.profit < 0)) {
      const avg = last.reduce((a, d) => a + d.profit, 0) / 3;
      out.push({ key: `loss:${l.id}`, cat: 'shops', sev: 'bad', icon: '🩸', lot: l.id, title: `Losing money: ${name}`,
        text: `Three days in the red, about ${money(-avg)} a day. Check its books for the leak.`, tab: 'books' });
    }
    if (b.team?.length) {
      const m = avgMorale(b);
      if (m < QUIT_MORALE + 0.12) {
        out.push({ key: `morale:${l.id}`, cat: 'shops', sev: 'warn', icon: '😤', lot: l.id, title: `Unhappy staff: ${name}`,
          text: `Team morale is ${pct(m)}. Someone may quit tonight. ${hoursEach(b) > ROTA_HOURS ? `They each work ~${Math.round(hoursEach(b))}h a day: hire more staff for the rota.` : 'Pay or a manager help.'}`, tab: 'staff' });
      }
    }
    if (y && y.wasteV > 150 && y.wasteV > 0.12 * y.rev) {
      out.push({ key: `waste:${l.id}`, cat: 'shops', sev: 'info', icon: '🗑️', lot: l.id, title: `Stock going off: ${name}`,
        text: `${y.waste} units (${money(y.wasteV)}) spoiled overnight. Lower the stock target or hire a clerk.`, tab: 'manage' });
    }
    // The loudest complaint, once enough people have said it.
    let total = 0, top = null;
    for (const [k, v] of Object.entries(b.fb || {})) { total += v; if (COMPLAINT_FIX[k] && (!top || v > b.fb[top])) top = k; }
    if (top && total >= 8 && b.fb[top] / total > 0.35) {
      out.push({ key: `fb:${l.id}:${top}`, cat: 'shops', sev: 'info', icon: SHOP_COMMENTS[top]?.icon || '💬', lot: l.id,
        title: `Customers: "${SHOP_COMMENTS[top]?.text(bizLabel(s, b.type)) || top}"`,
        text: `${pct(b.fb[top] / total)} of the talk about ${name}. ${COMPLAINT_FIX[top]}`, tab: 'customers' });
    }
  }
}

function landAlerts(s, pid, out, inbox) {
  const P = s.players;
  DISTRICTS.forEach((D, d) => {
    const ids = MAP.districtLots[d];
    if (!ids?.length) return;
    const n = ids.length;
    if (setCount(s, pid, d) === n - 1) {
      const m = ids.find(id => s.lots[id].owner !== pid), lot = s.lots[m];
      if (lot.owner === -1) {
        out.push({ key: `setfree:${d}`, cat: 'land', sev: 'good', icon: '🧩', lot: m, title: `One lot from the ${D.name} set`,
          text: `${lot.name} is still city land. Win it at auction to complete the set: rents double and apartments open up.`,
          fix: { act: 'call', args: [m], label: 'Call auction' } });
      } else if (!P[lot.owner].bankrupt) {
        out.push({ key: `setrival:${d}:${lot.owner}`, cat: 'land', sev: 'info', icon: '🧩', lot: m, title: `${P[lot.owner].company} holds your last ${D.name} lot`,
          text: `Make them an offer for ${lot.name}, or buy out their shop if they have one there.` });
      }
    }
    for (const r of P) {
      if (r.id === pid || r.bankrupt || n < 3 || setCount(s, r.id, d) !== n - 1) continue;
      const m = ids.find(id => s.lots[id].owner !== r.id), lot = s.lots[m];
      if (lot.owner === pid) {
        out.push({ key: `threat:${d}:${r.id}`, cat: 'rivals', sev: 'warn', icon: '🦈', lot: m, title: `${r.company} needs your ${lot.name}`,
          text: `It's the last lot of their ${D.name} set. Hold on to it, or make them pay a lot for it.` });
      } else if (lot.owner === -1) {
        out.push({ key: `threat:${d}:${r.id}`, cat: 'rivals', sev: 'warn', icon: '🦈', lot: m, title: `${r.company} is one lot from ${D.name}`,
          text: `${lot.name} is the last free lot. Win it yourself to block the set.`,
          fix: { act: 'call', args: [m], label: 'Call auction' } });
      }
    }
  });
  // Land that has sat empty for two days.
  const since = inbox.since;
  for (const l of s.lots) {
    const k = `idle:${l.id}`;
    if (l.kind === 'prop' && l.owner === pid && !l.business && !l.apt && !l.landmark && !l.lmBuild) {
      since[k] ??= s.day;
      if (s.day - since[k] >= 2) {
        out.push({ key: k, cat: 'land', sev: 'info', icon: '🌾', lot: l.id, title: `${l.name} is standing empty`,
          text: 'Idle land earns nothing. Open a shop or build apartments, or lease it to a rival by selling.' });
      }
    } else delete since[k];
  }
}

function moneyAlerts(s, pid, out) {
  const p = s.players[pid];
  if (p.cash < 0) {
    out.push({ key: 'overdrawn', cat: 'money', sev: 'bad', icon: '🚨', title: 'You are overdrawn',
      text: p.debtDays ? `Day ${p.debtDays} of 3 with no credit left. Sell a shop or land before the bank closes you down.` : 'The bank will advance a loan at midnight if you have credit left.', tab: 'bank' });
  }
  const op = p.days?.at(-1)?.op;
  if (op < 0 && p.cash >= 0 && p.cash < -op * 3) {
    const days = Math.max(0, Math.floor(p.cash / -op));
    out.push({ key: 'runway', cat: 'money', sev: 'warn', icon: '⏱️', title: `About ${days} day${days === 1 ? '' : 's'} of cash left`,
      text: `Yesterday lost ${money(-op)}. Cut the losers, or borrow before it runs out.`, tab: 'bank' });
  }
  if (p.loan > 0 && p.cash > p.loan + 25000) {
    out.push({ key: 'repay', cat: 'money', sev: 'good', icon: '🏦', title: 'You could clear the loan',
      text: `You have ${money(p.cash)} and owe ${money(p.loan)}. Repaying stops the daily interest.`,
      fix: { act: 'repay', args: [p.loan], label: `Repay ${money(p.loan)}` } });
  }
  for (const o of s.offers || []) {
    if (o.to !== pid) continue;
    out.push({ key: `offer:${o.id}`, cat: 'money', sev: 'info', icon: '✉️', lot: o.lotId, title: `${s.players[o.from].company} offers ${money(o.amount)}`,
      text: `For your ${s.lots[o.lotId].name}. Open the lot to accept or turn it down. Expires day ${o.expires}.` });
  }
}

function goalAlerts(s, pid, out) {
  const p = s.players[pid], sc = SCENARIOS[s.scenario];
  if (!sc || s.over) return;
  if (sc.mode === 'goals' && !p.failed) {
    const gi = (p.goals || []).findIndex(x => !x.done);
    const g = s.goals?.[gi];
    if (g) {
      const left = g.by - s.day + 1, prog = goalProgress(s, g, pid) / g.n;
      if (left <= 3 && prog < 1) {
        out.push({ key: `goal:${gi}`, cat: 'goals', sev: left <= 1 ? 'bad' : 'warn', icon: '🎯', title: `${left} day${left === 1 ? '' : 's'} left: ${goalText(g)}`,
          text: `You're ${pct(Math.min(1, prog))} of the way. Miss it and the scenario is lost.`, tab: 'goals' });
      }
    }
  } else if (sc.mode === 'race') {
    const goal = raceGoal(s), mine = netWorth(s, pid);
    for (const r of s.players) {
      if (r.id === pid || r.bankrupt) continue;
      const w = netWorth(s, r.id);
      if (w >= goal * 0.75 && w > mine) {
        out.push({ key: `race:${r.id}`, cat: 'goals', sev: 'warn', icon: '🏁', title: `${r.company} is closing on the target`,
          text: `They're worth ${money(w)} of the ${money(goal)} needed; you're at ${money(mine)}.`, tab: 'goals' });
      }
    }
  }
}

// Landmarks, City Hall jobs and chains.
function civicAlerts(s, pid, out) {
  const P = s.players, mine = (s.lmBuilds || []).find(b => b.pid === pid);
  for (const id of landmarkSet(s)) {
    const st = landmarkState(s, id), def = LM[id];
    if (st.state !== 'open') continue;
    if (mine?.id === id) {
      const ahead = st.builds.filter(b => b.pid !== pid && b.left <= mine.left);
      if (ahead.length) {
        const r = P[ahead[0].pid];
        out.push({ key: `lmrace:${id}`, cat: 'rivals', sev: 'warn', icon: '🏁', lot: mine.lot, title: `${r.company} is ahead in the ${def.name} race`,
          text: `They finish in ${ahead[0].left} day${ahead[0].left === 1 ? '' : 's'}, you in ${mine.left}. Night shifts halve your time.`,
          fix: !mine.rushed && mine.left > 1 ? { act: 'lmRush', args: [], label: `Night shifts · ${money(rushCost(s, mine))}` } : undefined });
      }
      continue;
    }
    if (!mine && reqProgress(s, pid, def).ok) {
      const others = st.builds.map(b => P[b.pid].company);
      out.push({ key: `lmready:${id}`, cat: 'tips', sev: others.length ? 'warn' : 'good', icon: def.icon, title: `You can build the ${def.name}`,
        text: `${others.length ? `${others.join(' and ')} already started. ` : ''}${def.perk}`, tab: 'civic' });
    }
  }
  for (const pr of activeProjects(s)) {
    const def = PROJECTS[pr.type], left = Math.max(0, pr.closes - s.day);
    if (pr.state === 'tender' && pr.bids[pid] == null) {
      out.push({ key: `proj:${pr.id}`, cat: 'money', sev: 'good', icon: '🏛️', title: `City Hall: ${def.name} ${def.kind === 'tender' ? 'tender' : 'sponsorship'}`,
        text: `${def.kind === 'tender' ? `Budget ${money(pr.budget)}, lowest quote wins.` : `Highest bid wins, from ${money(pr.budget)}.`} Closes ${left ? `in ${left} day${left === 1 ? '' : 's'}` : 'tonight'}.`, tab: 'civic' });
    } else if (pr.state === 'open') {
      out.push({ key: `grant:${pr.id}`, cat: 'money', sev: 'info', icon: def.icon, title: `${def.name}: city money on offer`,
        text: `${pr.cap - pr.claimed} grant${pr.cap - pr.claimed === 1 ? '' : 's'} left, ${left} day${left === 1 ? '' : 's'} to go.`, tab: 'civic' });
    }
  }
  const byType = {};
  for (const l of s.lots) if (l.business?.owner === pid) (byType[l.business.type] ||= []).push(l);
  for (const [type, ls] of Object.entries(byType)) {
    if (ls.length === CHAIN_MIN - 1) {
      out.push({ key: `chain2:${type}`, cat: 'tips', sev: 'info', icon: '🔗', lot: ls[0].id, title: `One more ${bizLabel(s, type)} makes a chain`,
        text: 'Chains buy stock cheaper, share one reputation and keep fans loyal across branches.' });
    } else if (ls.length >= CHAIN_MIN) {
      const avg = ls.reduce((a, l) => a + (l.business.rep ?? 1), 0) / ls.length;
      const weak = ls.filter(l => (l.business.rep ?? 1) < avg - 0.12).sort((a, b) => a.business.rep - b.business.rep)[0];
      if (weak) out.push({ key: `chainrep:${weak.id}`, cat: 'shops', sev: 'warn', icon: '🔗', lot: weak.id, title: `${weak.name} is hurting your brand`,
        text: `Its reputation drags the whole ${bizLabel(s, type)} chain down. Fix its service: staff, stock, prices.`, tab: 'staff' });
    }
  }
}

// Wholesale prices and suppliers.
function supplyAlerts(s, pid, out) {
  const count = {};
  for (const l of s.lots) if (l.business?.owner === pid) count[LINE_OF[l.business.type]] = (count[LINE_OF[l.business.type]] || 0) + 1;
  for (const [line, L] of Object.entries(SUPPLY_LINES)) {
    const idx = s.market?.[line] ?? 1, n = count[line] || 0;
    const own = suppliers(s, line).filter(l => l.supplier.owner === pid);
    if (idx >= 1.18 && n >= 2 && !own.length) {
      out.push({ key: `mkt:${line}`, cat: 'money', sev: 'warn', icon: '📈', title: `${L.label} stock costs ${Math.round(idx * 100)}% of normal`,
        text: `Your ${n} shops in this trade pay the higher price. A ${L.name} of your own locks in stock at cost.`, tab: 'civic' });
    } else if (n >= 3 && !own.length) {
      out.push({ key: `supidea:${line}`, cat: 'tips', sev: 'info', icon: L.icon, title: `Make your own stock: a ${L.name}`,
        text: `You run ${n} shops it could supply at ${Math.round(0.62 * 100)}% of market prices, and you can sell to rivals too. Build it on an empty lot of yours.` });
    }
    for (const l of own) {
      const sup = l.supplier, cap = capOf(sup);
      if ((sup.usedY || 0) >= cap * 0.98) out.push({ key: `supfull:${l.id}`, cat: 'shops', sev: 'info', icon: L.icon, lot: l.id, title: `${supplierName(s, l)} sold out yesterday`,
        text: 'It shipped everything it could make. Expand it, or raise your price to rivals.' });
      if (sup.price >= idx && sup.y && sup.y.rivals === 0) out.push({ key: `suphigh:${l.id}`, cat: 'money', sev: 'info', icon: L.icon, lot: l.id, title: `${supplierName(s, l)} is priced above the market`,
        text: `You charge ${Math.round(sup.price * 100)}%, the market is at ${Math.round(idx * 100)}%: no rival will buy. Lower the price to earn wholesale income.` });
    }
  }
}

// ------------------------------------------------------------ events ----
// One-off things: new shop types, a rival muscling in, staff walking out.
function eventAlerts(s, pid, inbox, add) {
  const tech = techOf(s);
  if (!inbox.tech) inbox.tech = [...tech.biz];
  else for (const t of tech.biz) {
    if (inbox.tech.includes(t)) continue;
    inbox.tech.push(t);
    add({ key: `tech:${t}`, cat: 'tips', sev: 'good', icon: BIZ[t].icon, title: `New: the ${bizLabel(s, t)}`,
      text: `Customers have a new way to spend on ${BIZ[t].need}. It costs ${money(BIZ[t].cost)} to open on a free lot.`, ev: true });
  }
  for (const n of s.news) {
    if (n.seq <= (inbox.news ?? s.newsSeq - 1)) break;
    if (n.who === pid && /lost the race|won the .* contract|opened the /.test(n.text))
      add({ key: `ev:${n.seq}`, cat: n.kind === 'bad' ? 'rivals' : 'money', sev: n.kind === 'bad' ? 'bad' : 'good', icon: n.kind === 'bad' ? '🏁' : '🏆', title: n.text.split(/[.!] /)[0].replace(/^\S+ /, ''), text: n.text, tab: 'civic', ev: true });
    if (n.kind === 'staff' && n.who === pid) add({ key: `ev:${n.seq}`, cat: 'shops', sev: 'bad', icon: '🚪', title: 'Staff walked out', text: n.text, tab: 'staff', ev: true });
  }
  inbox.news = s.newsSeq;
}

// A rival opened the same kind of shop next to one of yours.
function competition(s) {
  const seen = (s.advSeen ||= {});
  const fresh = [];
  for (const l of s.lots) {
    const b = l.business, sig = b ? `${b.owner}:${b.type}` : '';
    if ((seen[l.id] || '') !== sig) { if (b && seen[l.id] !== undefined) fresh.push(l); seen[l.id] = sig; }
  }
  return fresh;
}

// -------------------------------------------------------------- scan ----
export function advise(s) {
  if (!s.players.some(p => p.human)) return;
  const fresh = competition(s);
  for (const p of s.players) {
    if (!p.human || p.bankrupt) continue;
    const inbox = inboxOf(p), pid = p.id, h = nowH(s);
    const add = a => {
      const old = inbox.list.find(x => x.key === a.key);
      if (old) {
        // Same problem, maybe new numbers. Getting worse makes it unread again.
        if (!old.ev) {
          const worse = old.done || (a.sev === 'bad' && old.sev !== 'bad');
          Object.assign(old, a, { done: false });
          if (worse) { old.read = false; old.snooze = false; old.day = s.day; old.hour = s.hour; old.at = h; }
        }
        return;
      }
      inbox.list.unshift({ ...a, id: ++inbox.seq, day: s.day, hour: s.hour, at: h, read: false, done: false });
    };
    const out = [];
    shopAlerts(s, pid, out);
    landAlerts(s, pid, out, inbox);
    moneyAlerts(s, pid, out);
    goalAlerts(s, pid, out);
    civicAlerts(s, pid, out);
    supplyAlerts(s, pid, out);
    for (const a of out) if (!inbox.mute[a.cat] || a.sev === 'bad') add(a);
    const live = new Set(out.map(a => a.key));
    for (const a of inbox.list) {
      if (!a.ev && !a.done && !live.has(a.key)) { a.done = true; a.doneAt = h; if (a.snooze) a.gone = true; }
    }
    eventAlerts(s, pid, inbox, add);
    for (const l of fresh) {
      const b = l.business;
      if (b.owner === pid) continue;
      const near = s.lots.find(x => x.business?.owner === pid && x.business.type === b.type &&
        (x.district === l.district || MAP.neighW[x.district]?.has(l.district)));
      if (near) add({ key: `comp:${l.id}:${b.owner}`, cat: 'rivals', sev: 'warn', icon: '⚔️', lot: l.id,
        title: `${s.players[b.owner].company} opened a rival ${bizLabel(s, b.type)}`,
        text: `On ${l.name}, close to your ${near.name}. Watch your prices and service.`, ev: true });
    }
    // Tidy up: sorted and old events fade, and the list stays short.
    inbox.list = inbox.list.filter(a => !(a.done && h - a.doneAt > KEEP_DONE_HOURS) && !(a.ev && h - a.at > KEEP_EVENT_HOURS) && !a.gone);
    if (inbox.list.length > MAX_ALERTS) {
      const keep = inbox.list.filter(a => !a.done);
      inbox.list = keep.concat(inbox.list.filter(a => a.done)).slice(0, MAX_ALERTS);
      inbox.list.sort((a, b) => b.id - a.id);
    }
  }
}

// ----------------------------------------------------------- actions ----
export function inboxRead(s, pid, ids) {
  const inbox = inboxOf(s.players[pid]);
  for (const a of inbox.list) if (ids === 'all' || ids.includes(a.id)) a.read = true;
  return { ok: true };
}
export function inboxDismiss(s, pid, id) {
  const inbox = inboxOf(s.players[pid]);
  const a = inbox.list.find(x => x.id === id);
  if (!a) return { ok: false };
  if (a.done || a.ev) a.gone = true;
  else { a.read = true; a.snooze = true; }
  inbox.list = inbox.list.filter(x => !x.gone);
  return { ok: true };
}
export function inboxClear(s, pid) {
  const inbox = inboxOf(s.players[pid]);
  inbox.list = inbox.list.filter(a => !a.done && !a.ev);
  for (const a of inbox.list) a.read = true;
  return { ok: true };
}
export function inboxMute(s, pid, cat, on) {
  if (!ALERT_CATS[cat]) return { ok: false };
  const inbox = inboxOf(s.players[pid]);
  if (on) inbox.mute[cat] = true; else delete inbox.mute[cat];
  return { ok: true, msg: on ? `${ALERT_CATS[cat].name} alerts muted (urgent ones still come through).` : `${ALERT_CATS[cat].name} alerts on.` };
}
