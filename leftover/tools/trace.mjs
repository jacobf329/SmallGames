// One game, wave by wave: what came, what leaked, what the team had.
//   node leftover/tools/trace.mjs <cooks> [tree-for-everyone] [diff]
import { createGame } from '../js/game.js';
import { createCook } from '../js/ai.js';
import { COLORS, TOWERS } from '../js/data.js';
const n = +process.argv[2] || 1, mono = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : null, diff = process.argv[4] || 'normal';
const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Cook' + i, color: COLORS[i], ai: true }));
const g = createGame({ players, diff });
const cooks = players.map(p => createCook(g, p.id, { tree: mono, expert: process.env.EXPERT === '1' }));
let leaks = {}, combos = {};
while (g.phase !== 'won' && g.phase !== 'lost' && g.time < 5000) {
  for (const c of cooks) c.step(1 / 30);
  g.step(1 / 30);
  for (const e of g.events) {
    if (e.t === 'leak') leaks[e.type] = (leaks[e.type] || 0) + 1;
    if (e.t === 'combo') combos[e.name] = (combos[e.name] || 0) + 1;
    if (e.t === 'wave') { leaks = {}; combos = {}; process.stdout.write(`w${e.n} [${e.fams}]${e.boss ? ' BOSS ' + e.boss : ''}${e.warn ? ' WARN' : ''} spawns=${g.plan.spawns.length} `); }
    if (e.t === 'cleared' || e.t === 'lost') {
      const kinds = {};
      for (const t of g.towers.values()) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
      const gold = [...g.players.values()].map(p => Math.round(p.gold)).join('/');
      console.log(`lives=${g.lives} leaks=${JSON.stringify(leaks)} combos=${JSON.stringify(combos)} gold=${gold} towers=${JSON.stringify(kinds)}`);
    }
  }
  g.events.length = 0;
}
console.log('end', g.phase, 'wave', g.wave);
