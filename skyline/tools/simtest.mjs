// Headless balance check: runs a whole game (auctions settle instantly)
// with the human idle, and prints how the rivals did.
//   node skyline/tools/simtest.mjs [days] [seed] [difficulty] [scenario]
import { createGame, netWorth, money, ownsSet, estimate, yearOf, bizLabel } from '../js/sim.js';
import { advanceGame } from '../js/game.js';
import { DISTRICTS } from '../js/data.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const days = +(args[0] || 100), seed = +(args[1] || 7), diff = args[2] || 'normal', scenario = args[3] || 'sandbox';
const s = createGame({ scenario, difficulty: diff, seed });
const t0 = Date.now();
let checks = [];
for (let d = 0; d < days && !s.over; d++) {
  for (let h = 0; h < 24 && !s.over; h++) {
    advanceGame(s, 1);
    // Compare the forecaster with what citizens actually did.
    if (h === 23 && d % 10 === 5) for (const l of s.lots) if (l.business && l.business.yesterday) {
      const e = estimate(s, l.id, l.business.type, l.business.owner, {});
      checks.push([bizLabel(s, l.business.type), Math.round(e.cust), Math.round(l.business.yesterday.cust)]);
    }
  }
  if ((d + 1) % 10 === 0) {
    console.log(`day ${s.day} ${yearOf(s)}`.padEnd(14), s.players.map(p => `${p.company.slice(0, 10).padEnd(10)} ${money(netWorth(s, p.id)).padStart(7)} L${money(p.loan).padStart(6)}${p.bankrupt ? ' BUST' : ''}`).join(' | '),
      ` citizens ${s.cz.list.length} trips ${s.cz.trips.length} queue ${s.auctionQueue.length}`);
  }
}
console.log(`\n${s.day - 1} days in ${Date.now() - t0} ms. over=${s.over} ${s.endReason}`);
for (const l of s.lots) {
  const who = l.owner < 0 ? 'city' : s.players[l.owner].company.split(' ')[0];
  const b = l.business;
  const biz = b ? `${bizLabel(s, b.type)} (${s.players[b.owner].company.split(' ')[0]} p${b.price} s${b.staff} f${b.fit} ${b.from}+${b.len}h rep${(b.rep ?? 1).toFixed(2)} stock${Math.round(b.stock)} ${money(b.hist.at(-1) ?? 0)}/d)` : '-';
  console.log(l.name.padEnd(22), who.padEnd(7), `apt${l.apt}`, biz);
}
for (let d = 0; d < DISTRICTS.length; d++) for (const p of s.players) if (ownsSet(s, p.id, d)) console.log('SET', DISTRICTS[d].name, p.company);
console.log('forecast vs actual customers (sample):');
for (const c of checks.slice(-12)) console.log('  ', c[0].padEnd(16), 'forecast', String(c[1]).padStart(5), 'actual', String(c[2]).padStart(5));
console.log('chatter:', JSON.stringify(s.chatter.map(c => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => k + ':' + Math.round(v)))));
console.log('news sample:', s.news.slice(0, 6).map(n => n.text));
for (const p of s.players.slice(1)) console.log(p.company, 'yesterday', JSON.stringify(Object.fromEntries(Object.entries(p.yesterday).map(([k, v]) => [k, Math.round(v)]))));
