// Balance test: AI kitchens of 1-8 cooks play full games, headless.
//   node leftover/tools/simtest.mjs [games-per-setup] [diff]
// Reports how far each setup gets. "mono" = every cook picks the same tree,
// which the director should punish in bigger teams.
import { createGame } from '../js/game.js';
import { createCook } from '../js/ai.js';
import { COLORS, TREE_IDS } from '../js/data.js';

const GAMES = +process.argv[2] || 6, DIFF = process.argv[3] || 'normal';
function play(n, mono) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Cook' + i, color: COLORS[i], ai: true }));
  const g = createGame({ players, diff: DIFF });
  const monoTree = mono ? ['heat', 'chop'][Math.floor(Math.random() * 2)] : null;
  const cooks = players.map(p => createCook(g, p.id, { tree: process.env.TREE || monoTree, expert: process.env.EXPERT === '1' }));
  const dt = 1 / 30;
  let warns = 0, combos = 0;
  while (g.phase !== 'won' && g.phase !== 'lost' && g.time < 9000) {
    for (const c of cooks) c.step(dt);
    g.step(dt);
    for (const e of g.events) { if (e.t === 'wave' && e.warn) warns++; if (e.t === 'combo') combos++; }
    g.events.length = 0;
  }
  if (g.time >= 9000) console.log('  STALL at wave', g.wave, g.enemies.map(e => e.type).join(','));
  return { wave: g.wave, won: g.phase === 'won', lives: g.lives, warns, combos, trees: cooks.map(c => c.tree).join(',') };
}
for (const mono of [false, true]) for (const n of (process.argv[4] || '1,2,4,6,8').split(',').map(Number)) {
  if (mono && n === 1) continue;
  const rs = Array.from({ length: GAMES }, () => play(n, mono));
  const avg = k => (rs.reduce((s, r) => s + r[k], 0) / rs.length).toFixed(1);
  console.log(`${mono ? 'mono   ' : 'diverse'} ${n} cooks: wins ${rs.filter(r => r.won).length}/${GAMES}  avg wave ${avg('wave')}  lives ${avg('lives')}  warnings ${avg('warns')}  combos ${avg('combos')}   e.g. ${rs[0].trees}`);
}
