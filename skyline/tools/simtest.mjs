// Headless balance check: runs a whole game with the human idle (or playing
// a simple greedy bot) and prints how the rivals did.
//   node skyline/tools/simtest.mjs [days] [seed] [difficulty] [--greedy]
import { createGame, netWorth, money, MAP, estimate, build, buyLand, landValue, ownsSet, aptCheck, buildApt } from '../js/sim.js';
import { advanceGame } from '../js/ai.js';
import { BUSINESSES, DISTRICTS } from '../js/data.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const days = +(args[0] || 100), seed = +(args[1] || 7), diff = args[2] || 'normal';
const greedy = process.argv.includes('--greedy');
const s = createGame({ scenario: 'sandbox', difficulty: diff, seed });
const t0 = Date.now();
for (let d = 0; d < days; d++) {
  for (let h = 0; h < 24; h++) {
    advanceGame(s, 1);
    if (greedy && h % 6 === 0) {
      // greedy human: best build, else buy land in an uncontested district
      let best = null;
      for (const l of s.lots) if (l.kind === 'prop' && !l.business) for (const b of BUSINESSES) {
        const e = estimate(s, l.id, b.id, 0, {});
        if (e.profit > 0 && (!best || e.profit / b.cost > best.r)) best = { r: e.profit / b.cost, l: l.id, b: b.id, c: b.cost };
      }
      const p = s.players[0];
      if (best && best.r > 0.04 && p.cash > best.c + 5000) build(s, 0, best.l, best.b);
      for (const l of s.lots) if (l.kind === 'prop' && l.owner === 0) { const c = aptCheck(s, 0, l.id); if (c.ok && p.cash > c.cost + 10000) buildApt(s, 0, l.id); }
      const lot = s.lots.find(l => l.kind === 'prop' && l.owner === -1 && MAP.districtLots[l.district].every(i => s.lots[i].owner <= 0));
      if (lot && p.cash > landValue(s, lot) + 15000) buyLand(s, 0, lot.id);
    }
  }
  if ((d + 1) % 10 === 0) {
    console.log(`day ${s.day}`.padEnd(8), s.players.map(p => `${p.company.slice(0, 12).padEnd(12)} ${money(netWorth(s, p.id)).padStart(8)} c${money(p.cash).padStart(7)} L${money(p.loan).padStart(6)} ${p.bankrupt ? 'BUST' : ''}`).join(' | '));
  }
}
console.log(`\n${days} days in ${Date.now() - t0} ms`);
const own = {};
for (const l of s.lots) {
  const who = l.owner < 0 ? 'city' : s.players[l.owner].company.split(' ')[0];
  const biz = l.business ? `${l.business.type}(${s.players[l.business.owner].company.split(' ')[0]} t${l.business.tier} s${l.business.staff} f${l.business.fit} ${money(l.business.hist.at(-1) ?? 0)}/d)` : '-';
  console.log(l.name.padEnd(22), who.padEnd(7), `apt${l.apt}`, biz);
}
for (let d = 0; d < DISTRICTS.length; d++) for (const p of s.players) if (ownsSet(s, p.id, d)) console.log('SET', DISTRICTS[d].name, p.company);
console.log('events:', s.news.filter(n => n.kind === 'event').length, 'news total seq', s.newsSeq);
console.log('yesterday ledger rival1:', s.players[1].yesterday);
