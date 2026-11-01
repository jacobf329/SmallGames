// Skyline Hustle - shop staff. Every shop has a team of named people:
//
//   servers   serve customers (they set how many the shop handles an hour)
//   clerks    re-stock the shelves at 13:00 and cut spoilage
//   manager   one per shop: lifts everyone's morale and the service
//
// Each person has a skill (grows with experience and training), an hourly
// wage and a morale. Morale follows pay, hours, stress and management; a
// fed-up employee quits. Pure helpers only: the actions live in sim.js.

import { BIZ, STAFF_ROLES, MAX_STAFF, MAX_FLOORS, FIRST_NAMES, LAST_NAMES, QUIT_MORALE, TRAIN_DAYS } from './data.js';
import { rand } from './map.js';

const ROLE_WEIGHT = { server: 1, manager: 0.5, clerk: 0.25 };   // share of a server's throughput

export function fairPay(type, role, skill) {
  return BIZ[type].wage * STAFF_ROLES[role].pay * (0.6 + 0.45 * skill);
}

export function maxStaff(b) {
  return MAX_STAFF + 3 * ((b.floors || 1) - 1);
}
export const floorCap = floors => 1 + 0.6 * ((floors || 1) - 1);
export const clamp01 = v => Math.max(0, Math.min(1, v));

function personName(s) {
  return `${FIRST_NAMES[Math.floor(rand(s) * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand(s) * LAST_NAMES.length)]}`;
}

export function makeStaff(s, type, role = 'server', skill = null) {
  const sk = skill ?? 0.55 + rand(s) * 0.75 + (rand(s) < 0.12 ? 0.3 : 0);
  return {
    id: (s.staffSeq = (s.staffSeq || 0) + 1),
    name: personName(s), role, skill: Math.round(Math.min(1.6, sk) * 100) / 100,
    pay: Math.round(fairPay(type, role, sk) * (0.95 + rand(s) * 0.15) * 10) / 10,
    morale: 0.72, train: 0, days: 0,
  };
}

// Three people looking for work at this shop; refreshed every night.
export function refreshCandidates(s, b) {
  b.cands = [0, 1, 2].map(() => {
    const c = makeStaff(s, b.type, 'server');
    c.pay = Math.round(fairPay(b.type, 'server', c.skill) * (0.88 + rand(s) * 0.3) * 10) / 10;
    return c;
  });
}

export function effectiveness(m) {
  return m.skill * (0.7 + 0.3 * m.morale) * (m.train > 0 ? 0.5 : 1);
}

// Throughput in "server equivalents". Hypothetical shops (forecasts) have
// only a head count.
export function teamPower(b) {
  if (!b.team) return b.staff;
  let p = 0;
  for (const m of b.team) p += ROLE_WEIGHT[m.role] * effectiveness(m);
  return p;
}
export function teamWage(b) {
  if (!b.team) return b.staff * BIZ[b.type].wage;
  let w = 0;
  for (const m of b.team) w += m.pay;
  return w;
}
export const servers = b => (b.team ? b.team.filter(m => m.role === 'server').length : b.staff);
export const clerks = b => (b.team ? b.team.filter(m => m.role === 'clerk').length : 0);
export const manager = b => (b.team ? b.team.find(m => m.role === 'manager') : null);
export function avgMorale(b) {
  if (!b.team || !b.team.length) return 0.7;
  return b.team.reduce((a, m) => a + m.morale, 0) / b.team.length;
}
export function avgSkill(b) {
  if (!b.team || !b.team.length) return 1;
  return b.team.reduce((a, m) => a + m.skill, 0) / b.team.length;
}
// Service multiplier on how attractive the shop is.
export function serviceFactor(b) {
  if (!b.team) return 1;
  const mg = manager(b);
  const mood = 0.85 + 0.3 * avgMorale(b);          // grumpy staff put people off
  return mood * (mg ? 1 + 0.1 * effectiveness(mg) : 1);
}

export function syncHeadcount(b) {
  b.staff = servers(b);
}

// Nightly: experience, training, morale, quitting. Returns names who quit.
export function staffNight(s, b) {
  if (!b.team) return [];
  const t = b.yesterday || b.today;
  const asked = t.cust + t.turned;
  const stress = (t.peak >= 1 ? 0.1 : 0) + (asked && t.turned / asked > 0.1 ? 0.05 : 0);
  const longHours = 0.025 * Math.max(0, (b.len || 12) - 12);
  const mg = manager(b);
  const quit = [];
  for (const m of b.team) {
    m.days++;
    m.skill = Math.min(1.6, m.skill + 0.003);
    if (m.train > 0 && --m.train === 0) { m.skill = Math.min(1.6, m.skill + 0.2); m.morale = clamp01(m.morale + 0.1); }
    const payGap = Math.max(-0.25, Math.min(0.25, 0.5 * (m.pay / fairPay(b.type, m.role, m.skill) - 1)));
    const target = 0.62 + payGap + (mg && mg !== m ? 0.1 : 0) - longHours - stress;
    m.morale = clamp01(m.morale + 0.3 * (target - m.morale) + (rand(s) - 0.5) * 0.04);
    if (m.morale < QUIT_MORALE && rand(s) < 0.3) quit.push(m);
  }
  if (quit.length) {
    b.team = b.team.filter(m => !quit.includes(m));
    syncHeadcount(b);
  }
  refreshCandidates(s, b);
  return quit.map(m => m.name);
}

export { TRAIN_DAYS, MAX_FLOORS };
