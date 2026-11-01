// Skyline Hustle - city lenses. Each lens turns every colour block into one
// number (plus a short label) so the map can be painted as a heat map, and
// the blocks ranked. Pure data: used by the 3D overlay and the UI.
//
// ctx = { me, mine, type }  mine: only count my shops   type: business id
//                           for the Opportunity lens

import { DISTRICTS, BIZ } from './data.js';
import { MAP, money, landValue, rentFor, estimate, districtPopulation, blockStars, techOf, bizLabel } from './sim.js';
import { SHOP_COMMENTS } from './citizens.js';

const shops = (s, d, ctx) => MAP.districtLots[d].map(id => s.lots[id])
  .filter(l => l.business && (!ctx.mine || l.business.owner === ctx.me));
const day = b => b.yesterday || b.today;
const starsText = v => '★'.repeat(Math.floor(v)) + (v % 1 >= 0.5 ? '½' : '');
const pct = v => `${Math.round(v * 100)}%`;

export const LENSES = [
  { id: 'off', icon: '🏙️', name: 'City' },
  { id: 'demand', icon: '🔥', name: 'Unmet', kind: 'heat',
    desc: 'People who couldn\'t get what they wanted (nothing nearby, shut, sold out, queues). The icon is what they want most.',
    of: (s, d) => {
      const tally = {};
      for (const [k, v] of Object.entries(s.chatter[d] || {})) {
        const [why, type] = k.split('|');
        if (why !== 'pricey') tally[type] = (tally[type] || 0) + v;
      }
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      const total = Object.values(tally).reduce((a, b) => a + b, 0);
      return { v: total, label: top ? `${BIZ[top[0]].icon} ${Math.round(total)}` : '😊 0', note: top ? `most want a ${bizLabel(s, top[0])}` : 'locals are content' };
    } },
  { id: 'interest', icon: '🙋', name: 'Interest', kind: 'heat', mine: false,
    desc: 'Everyone who went shopping from this block yesterday, served or not: the size of the market.',
    of: (s, d) => {
      let served = 0;
      for (const l of s.lots) if (l.business) { const f = day(l.business).from; if (f && f[d]) served += f[d]; }
      const unmet = Object.values(s.chatter[d] || {}).reduce((a, b) => a + b, 0);
      return { v: served + unmet, label: `🙋 ${Math.round(served + unmet)}`, note: `${Math.round(served)} served · ${Math.round(unmet)} let down` };
    } },
  { id: 'traffic', icon: '👣', name: 'Customers', kind: 'heat', mine: true,
    desc: 'Customers the block\'s shops served yesterday.',
    of: (s, d, ctx) => { const c = shops(s, d, ctx).reduce((a, l) => a + day(l.business).cust, 0); return { v: c, label: `👣 ${Math.round(c)}` }; } },
  { id: 'revenue', icon: '💵', name: 'Revenue', kind: 'heat', mine: true,
    desc: 'Total sales of the block\'s shops yesterday.',
    of: (s, d, ctx) => { const r = shops(s, d, ctx).reduce((a, l) => a + day(l.business).rev, 0); return { v: r, label: money(r) }; } },
  { id: 'profit', icon: '📈', name: 'Profit', kind: 'diverge', mine: true,
    desc: 'Shop profit after stock, wages, rent and bills yesterday. Green makes money, red loses it.',
    of: (s, d, ctx) => {
      const list = shops(s, d, ctx);
      if (!list.length) return { v: null, label: '–' };
      const p = list.reduce((a, l) => a + day(l.business).rev - day(l.business).cost, 0);
      return { v: p, label: (p >= 0 ? '+' : '') + money(p) };
    } },
  { id: 'quality', icon: '⭐', name: 'Quality', kind: 'heat', mine: true,
    desc: 'Average shop quality: reputation and fit-out, out of five stars.',
    of: (s, d, ctx) => {
      const list = shops(s, d, ctx);
      if (!list.length) return { v: null, label: '–' };
      const q = list.reduce((a, l) => a + Math.max(0, Math.min(5, ((l.business.rep ?? 1) - 0.7) / 0.7 * 2.5 + (l.business.fit - 1) * 1.25)), 0) / list.length;
      return { v: q, label: q < 0.5 ? '☆' : starsText(q) };
    } },
  { id: 'satisfaction', icon: '😊', name: 'Happiness', kind: 'heat', mine: true,
    desc: 'Share of customer comments that were positive, across the block\'s shops.',
    of: (s, d, ctx) => {
      let good = 0, total = 0;
      for (const l of shops(s, d, ctx)) {
        const fb = { ...(l.business.fb || {}) };
        for (const k in l.business.today.fb || {}) fb[k] = (fb[k] || 0) + l.business.today.fb[k];
        for (const [k, v] of Object.entries(fb)) if (SHOP_COMMENTS[k]) { total += v; if (SHOP_COMMENTS[k].good) good += v; }
      }
      if (!total) return { v: null, label: '–' };
      return { v: good / total, label: `${good / total >= 0.6 ? '😊' : good / total >= 0.4 ? '😐' : '😠'} ${pct(good / total)}` };
    } },
  { id: 'opportunity', icon: '🎯', name: 'Opportunity', kind: 'diverge', needsType: true, slow: true,
    desc: 'Expected daily profit of opening the chosen business on the best free lot in each block (fair prices, usual hours).',
    of: (s, d, ctx) => {
      if (!ctx.type || !techOf(s).biz.has(ctx.type)) return { v: null, label: '–' };
      let best = null;
      for (const id of MAP.districtLots[d]) {
        if (s.lots[id].business) continue;
        const e = estimate(s, id, ctx.type, ctx.me, {});
        if (!best || e.profit > best) best = e.profit;
      }
      if (best === null) return { v: null, label: 'full' };
      return { v: best, label: `${BIZ[ctx.type].icon} ${(best >= 0 ? '+' : '') + money(best)}` };
    } },
  { id: 'appeal', icon: '💎', name: 'Appeal', kind: 'heat',
    desc: 'Block stars (parks raise them) and the share of wealthy residents.',
    of: (s, d) => { const st = blockStars(s, d); return { v: st, label: `${starsText(st)} ${pct(DISTRICTS[d].mix[2])}💎` }; } },
  { id: 'population', icon: '👪', name: 'People', kind: 'heat',
    desc: 'Residents plus visitors. Apartments and metro stations bring more.',
    of: (s, d) => { const p = districtPopulation(s, d); return { v: p.residents + p.tourists, label: `👪 ${Math.round((p.residents + p.tourists) / 100) / 10}K`, note: `${Math.round(p.tourists)} visitors` }; } },
  { id: 'rent', icon: '🧾', name: 'Rent', kind: 'heat',
    desc: 'Average daily ground rent a shop pays on this block (doubled for a full colour set).',
    of: (s, d) => { const ids = MAP.districtLots[d]; const r = ids.reduce((a, id) => a + rentFor(s, s.lots[id]), 0) / ids.length; return { v: r, label: `${money(r)}/d` }; } },
  { id: 'land', icon: '💰', name: 'Land', kind: 'heat',
    desc: 'Average land value per lot.',
    of: (s, d) => { const ids = MAP.districtLots[d]; const v = ids.reduce((a, id) => a + landValue(s, s.lots[id]), 0) / ids.length; return { v, label: money(v) }; } },
  { id: 'owner', icon: '🏳️', name: 'Owners', kind: 'owner',
    desc: 'Who controls each block: the company holding the most lots. A full set is marked ✓.',
    of: (s, d) => {
      const ids = MAP.districtLots[d];
      const counts = {};
      for (const id of ids) { const o = s.lots[id].owner; counts[o] = (counts[o] || 0) + 1; }
      const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const pid = +top;
      if (pid < 0) return { v: 0, owner: -1, label: n === ids.length ? 'City' : `City ${n}/${ids.length}` };
      const p = s.players[pid];
      return { v: n / ids.length, owner: pid, label: `${p.company.split(' ')[0]} ${n}/${ids.length}${n === ids.length ? ' ✓' : ''}` };
    } },
];
export const LENS = Object.fromEntries(LENSES.map(l => [l.id, l]));

// Values for every colour block, plus the scale.
export function lensData(s, id, ctx) {
  const lens = LENS[id];
  if (!lens || !lens.of) return null;
  const rows = DISTRICTS.map((D, d) => ({ d, ...lens.of(s, d, ctx) }));
  const vals = rows.map(r => r.v).filter(v => v !== null && v !== undefined);
  const max = Math.max(1e-6, ...vals.map(Math.abs));
  const min = vals.length ? Math.min(...vals) : 0;
  return { lens, rows, max, min };
}

// Colour for a block: heat runs blue -> yellow -> red; diverging runs red
// (losing) -> grey -> green (earning); null is grey.
export function lensColor(data, row) {
  if (row.v === null || row.v === undefined) return { hsl: [0, 0, 0.45], k: 0.05 };
  if (data.lens.kind === 'diverge') {
    const k = row.v / data.max;
    return { hsl: k >= 0 ? [0.33, 0.75, 0.45] : [0.0, 0.8, 0.5], k: Math.abs(k) };
  }
  const k = row.v / data.max;
  return { hsl: [0.62 - 0.62 * k, 0.85, 0.5], k };
}
