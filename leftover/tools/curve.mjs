// Difficulty curve: average lives lost per wave by a strong player (the
// expert AI), so a steady climb shows up as a smooth rise with no cliffs.
//   node leftover/tools/curve.mjs [games] [diff] [cooks] [tree|eco]
import { createGame } from '../js/game.js';
import { createCook } from '../js/ai.js';
import { COLORS, PATH_GEO } from '../js/data.js';
const N = +process.argv[2] || 8, DIFF = process.argv[3] || 'normal', COOKS = +process.argv[4] || 1, TREE = process.argv[5] || null;
const lost = Array(41).fill(0), alive = Array(41).fill(0), reach = Array(41).fill(0), deaths = [];
for (let k = 0; k < N; k++) {
  const players = Array.from({ length: COOKS }, (_, i) => ({ id: 'p' + i, name: 'c' + i, color: COLORS[i], ai: true }));
  const g = createGame({ players, diff: DIFF });
  const cooks = players.map((p, i) => createCook(g, p.id, { expert: true, tree: TREE, seed: (k * 0.37 + i * 0.21) % 1 }));
  let before = g.lives, far = 0;
  while (g.phase !== 'won' && g.phase !== 'lost' && g.time < 9000) {
    for (const c of cooks) c.step(1 / 30); g.step(1 / 30);
    for (const e of g.enemies) far = Math.max(far, e.d / PATH_GEO[e.path].total);
    for (const e of g.events) if (e.t === 'cleared' || e.t === 'lost' || e.t === 'leak') { if (e.t === 'leak') { far = 1; continue; } lost[e.n] += before - g.lives; reach[e.n] += far; alive[e.n]++; before = g.lives; far = 0; }
    g.events.length = 0;
  }
  deaths.push(g.phase === 'won' ? 'WIN' : g.wave);
}
console.log(`${DIFF}, ${COOKS} cook(s), expert${TREE ? ' ' + TREE : ''}: ends ${deaths.join(' ')}`);
let line = '';
for (let w = 1; w <= 30; w++) line += alive[w] ? `${w}:${(lost[w] / alive[w]).toFixed(1)} ` : '';
console.log('avg lives lost per wave  ' + line);
line = '';
for (let w = 1; w <= 30; w++) line += alive[w] ? `${w}:${Math.round(100 * reach[w] / alive[w])} ` : '';
console.log('closest call (% of path) ' + line);
