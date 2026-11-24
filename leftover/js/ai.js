// Leftover Uprising - AI cooks. They fill empty seats so you can try a
// 4- or 8-cook kitchen alone, and the balance test uses them to play
// thousands of games. They act through game.act() exactly like a phone does.
//
// Each cook settles on a main tree (the one the team has least of) and
// a backup, builds Prep Stations on the best free spots, and upgrades.

import { TOWERS, TREE_IDS, PATH_GEO, PATHS, COLS, ROWS, buildable, doorsFor, MAX_TOWERS, MAX_MASTERY, skillCost } from './data.js';

const FIRST = { heat: 'grill', chop: 'cleaver', cold: 'vent', sticky: 'syrup', service: 'tipjar' };
const FORK = { heat: ['oven', 'wok'], chop: ['mallet', 'blender'], cold: ['nitro', 'icecream'], sticky: ['gum', 'grater'], service: ['waiter', 'register'] };

// How much open path each free tile can see (sampled along each path).
function spotScores(n) {
  const doors = doorsFor(n);
  const pts = [];
  for (const pi of doors) { const g = PATH_GEO[pi]; for (let d = 0; d < g.total; d += 0.5) { pts.push({ pi, d, total: g.total }); } }
  const out = [];
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
    if (!buildable(x, y)) continue;
    let s = 0;
    for (const p of pts) {
      const seg = PATH_GEO[p.pi].segs.find(sg => p.d <= sg.at + sg.len) || PATH_GEO[p.pi].segs.at(-1);
      const f = Math.min(1, (p.d - seg.at) / seg.len);
      const px = seg.ax + (seg.bx - seg.ax) * f, py = seg.ay + (seg.by - seg.ay) * f;
      if (Math.hypot(px - x - 0.5, py - y - 0.5) <= 2.3) s += 1 + 0.15 * p.d / p.total;   // path in reach; a little extra near the end
    }
    out.push({ x, y, s });
  }
  return out.sort((a, b) => b.s - a.s);
}

// expert: plays the way a good human does (a complementary pair of trees,
// best spots first, saves for big upgrades). The balance test uses it to
// stand in for a skilled player; lobby AI cooks use the plain version.
const PAIRS = [['heat', 'chop'], ['chop', 'cold'], ['heat', 'sticky'], ['cold', 'chop'], ['heat', 'cold']];
export function createCook(game, pid, { tree = null, seed = Math.random(), expert = false } = {}) {
  if (expert) return createExpert(game, pid, { tree, seed });
  let main = tree, backup = null, think = seed * 1.5, spots = null, spotsN = 0, forkPick = seed < 0.5 ? 0 : 1;
  const me = () => game.players.get(pid);

  function chooseTrees() {
    if (main) return;
    const counts = Object.fromEntries(TREE_IDS.map(t => [t, 0]));
    for (const c of game.cooksTrees || []) counts[c]++;
    // Small kitchens need raw damage; support trees are for bigger teams.
    const n = game.players.size;
    const opts = TREE_IDS.filter(t => n <= 2 ? ['heat', 'chop'].includes(t) : n === 3 ? t !== 'service' : true);
    opts.sort((a, b) => counts[a] - counts[b] || Math.random() - 0.5);
    main = opts[0];
    (game.cooksTrees = game.cooksTrees || []).push(main);
  }

  function myTowers() { return [...game.towers.values()].filter(t => t.owner === pid); }

  function tryUpgrade(t, wanted) {
    const def = TOWERS[t.kind];
    for (const to of wanted) if (def.next.includes(to)) {
      if (!game.act(pid, { t: 'up', id: t.id, to })) return true;
    }
    return false;
  }

  function step(dt) {
    if (game.phase !== 'build' && game.phase !== 'wave') return;
    think -= dt;
    if (think > 0) return;
    think = 0.8 + Math.random() * 0.6;
    chooseTrees();
    const p = me(); if (!p) return;
    if (spotsN !== game.players.size) { spots = spotScores(game.players.size); spotsN = game.players.size; }
    // Skill points: the main tree first, then a second one.
    for (let guard = 0; guard < 5; guard++) {
      let t = p.mastery[main] < MAX_MASTERY ? main : null;
      if (!t) {
        backup ||= TREE_IDS.filter(x => x !== main && x !== 'service').sort(() => Math.random() - 0.5)[0];
        t = p.mastery[backup] < MAX_MASTERY ? backup : null;
      }
      if (!t || p.sp < skillCost(p.mastery[t]) || game.act(pid, { t: 'skill', tree: t })) break;
    }
    const mine = myTowers();
    const tree = main === 'service' && mine.filter(t => TOWERS[t.kind].tree === 'service').length >= 4 ? (backup ||= 'heat') : main;

    const taken = new Set([...game.towers.values()].map(t => t.x + ',' + t.y));
    const build = () => {
      if (mine.length >= MAX_TOWERS(game.players.size)) return false;
      let pick = null;
      if (tree === 'service') {
        // Service cooks set up beside other people's towers.
        let best = -1;
        for (const s of spots.slice(0, 60)) {
          if (taken.has(s.x + ',' + s.y)) continue;
          let near = 0;
          for (const t of game.towers.values()) if (TOWERS[t.kind].tree !== 'service' && Math.hypot(t.x - s.x, t.y - s.y) <= 2) near++;
          if (near > best) { best = near; pick = s; }
        }
      } else pick = spots.find(s => !taken.has(s.x + ',' + s.y));
      return pick && !game.act(pid, { t: 'build', x: pick.x, y: pick.y });
    };

    // 1) Turn fresh Prep Stations into our tree.
    const fresh = mine.filter(t => t.kind === 'prep');
    for (const t of fresh) if (tryUpgrade(t, [FIRST[tree]])) return;
    if (fresh.length && game.wave > 0) return;          // save for it
    // 2) Enough towers on the board first.
    if (mine.length < 3 + game.wave * 0.6 && build()) return;
    // 3) Push the lowest towers up the tree (fork when mastery allows).
    const order = mine.filter(t => TOWERS[t.kind].tree && TOWERS[t.kind].next.length).sort((a, b) => TOWERS[a.kind].tier - TOWERS[b.kind].tier);
    for (const t of order) {
      const def = TOWERS[t.kind];
      const want = def.tier === 3 ? [FORK[def.tree][forkPick], FORK[def.tree][1 - forkPick]] : def.next;
      if (tryUpgrade(t, want)) { forkPick = 1 - forkPick; return; }
      if (def.tier < 3) break;     // save up for the cheapest step rather than skipping ahead
    }
    // 4) Rich, or blocked on mastery: more towers.
    if (p.gold > 400 || p.mastery[tree] < 3) build();
  }
  return { step, get tree() { return main; } };
}

function createExpert(game, pid, { tree = null, seed = Math.random() } = {}) {
  const pair = tree === 'eco' ? ['heat', 'service'] : tree ? [tree, tree] : PAIRS[Math.floor(seed * PAIRS.length) % PAIRS.length];
  const skillPlan = [0, 0, 0, 1, 1, 1, 0, 0, 1, 1];      // which of the pair gets each level
  let think = seed, spots = null, spotsN = 0, built = 0;
  const me = () => game.players.get(pid);
  const score = new Map();                                // "x,y" -> spot score
  return { step, get tree() { return pair[0]; } };

  function step(dt) {
    if (game.phase !== 'build' && game.phase !== 'wave') return;
    think -= dt;
    if (think > 0) return;
    think = 0.5;
    const p = me(); if (!p) return;
    if (spotsN !== game.players.size) { spots = spotScores(game.players.size); spotsN = game.players.size; for (const s of spots) score.set(s.x + ',' + s.y, s.s); }
    // Skills, following the plan.
    for (let i = 0; i < 4; i++) {
      const lv = pair.map(t => p.mastery[t]);
      const k = skillPlan.findIndex((which, j) => lv[which] < skillPlan.slice(0, j + 1).filter(x => x === which).length);
      if (k < 0) break;
      const t = pair[skillPlan[k]];
      if (p.sp < skillCost(p.mastery[t]) || game.act(pid, { t: 'skill', tree: t })) break;
    }
    const mine = [...game.towers.values()].filter(t => t.owner === pid);
    const taken = new Set([...game.towers.values()].map(t => t.x + ',' + t.y));
    const build = () => {
      if (mine.length >= MAX_TOWERS(game.players.size)) return false;
      const pick = spots.find(s => !taken.has(s.x + ',' + s.y));
      if (pick && !game.act(pid, { t: 'build', x: pick.x, y: pick.y })) { built++; return true; }
      return false;
    };
    // Cover the path first (plain stations are cheap damage), then specialise.
    if (mine.length < 4 + game.wave * 0.35 && build()) return;
    // Fresh stations: two of every three go to the main tree, best spots first.
    const fresh = mine.filter(t => t.kind === 'prep').sort((a, b) => (score.get(b.x + ',' + b.y) || 0) - (score.get(a.x + ',' + a.y) || 0));
    for (const t of fresh) {
      const tr = pair[(t.id % 3 === 2) ? 1 : 0];
      if (!game.act(pid, { t: 'up', id: t.id, to: FIRST[tr] })) return;
      return;                                             // save for it
    }
    // Upgrade the best-placed tower that can still grow; save up for it.
    const ups = mine.filter(t => TOWERS[t.kind].next.length && TOWERS[t.kind].tree)
      .sort((a, b) => (score.get(b.x + ',' + b.y) || 0) - (score.get(a.x + ',' + a.y) || 0));
    for (const t of ups) {
      const def = TOWERS[t.kind];
      const opts = def.tier === 3 ? [FORK[def.tree][(t.x + t.y) % 2], FORK[def.tree][1 - (t.x + t.y) % 2]] : def.next;
      const can = opts.filter(o => !TOWERS[o].req || p.mastery[TOWERS[o].tree] >= TOWERS[o].req);
      if (!can.length) continue;                          // blocked on skills: look further down
      if (!game.act(pid, { t: 'up', id: t.id, to: can[0] })) return;
      if (p.gold < 320) return;                           // saving for this one
    }
    if (p.gold > 160) build();
  }
}
