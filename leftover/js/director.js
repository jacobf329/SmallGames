// Leftover Uprising - the wave director. Builds each wave out of food
// "families", sized for the team, and reacts to what the team has built:
//
//  - more players = more food, more doors, more families at once;
//  - a team leaning on one damage type gets the food that shrugs it off
//    (hard with 5-8 cooks, gentle solo);
//  - solo, the director never sends a family the player can't really hurt,
//    so one strategy can win.

import {
  ENEMIES, TOWERS, FAMILIES, FAMILY_LATE, MEMBER_FROM, COUNTERS, BOSSES, BOSS_INTRO, WAVES,
  teamScale, waveBudget, soloCurve, doorsFor,
} from './data.js';

// Rough damage per second a tower puts out (for judging the team's mix).
export function towerDps(def) {
  if (!def.rate || !def.dmg) return 0;
  let d = def.dmg * def.rate;
  if (def.burn) d += def.burn.dps * 0.8;
  if (def.aura) d *= 2.2; else if (def.splash) d *= 1 + def.splash;
  if (def.slow || def.freeze || def.sticky) d *= 1.3;   // control is worth something
  return d;
}

// How well one tower handles one food type, 0..~2.
function effVs(def, e) {
  if (!def.dmg) return 0;
  if (e.air && !def.air) return 0;
  const res = e.res[def.dtype] ?? 1;
  const arm = def.pierce ? 1 : Math.max(0.2, (def.dmg - e.armour) / def.dmg);
  let v = res * arm;
  if (e.regen && def.dtype === 'heat') v *= 1.4;
  return v;
}
function famMembers(fam, w) {
  const m = {};
  for (const [k, v] of Object.entries(FAMILIES[fam].members)) if (w >= (MEMBER_FROM[k] || 0)) m[k] = v;
  if (!Object.keys(m).length) m[Object.keys(FAMILIES[fam].members)[0]] = 1;
  if (w >= 14 && FAMILY_LATE[fam]) for (const [k, v] of Object.entries(FAMILY_LATE[fam])) m[k] = (m[k] || 0) + v;
  return m;
}

// The team's damage mix and how well it covers each family.
export function assessTeam(towers, w) {
  const byType = {};
  let total = 0;
  const cover = {};
  for (const f of Object.keys(FAMILIES)) cover[f] = 0;
  for (const t of towers) {
    const def = TOWERS[t.kind];
    const dps = towerDps(def);
    if (!dps) continue;
    byType[def.dtype] = (byType[def.dtype] || 0) + dps;
    total += dps;
    for (const f of Object.keys(FAMILIES)) {
      const mem = famMembers(f, w);
      let s = 0, n = 0;
      for (const [id, wt] of Object.entries(mem)) { s += effVs(def, ENEMIES[id]) * wt; n += wt; }
      cover[f] += dps * (s / n);
    }
  }
  const share = {};
  for (const k of Object.keys(byType)) share[k] = byType[k] / (total || 1);
  for (const f of Object.keys(cover)) cover[f] = total ? cover[f] / total : 1;
  return { share, cover, total };
}

function pickWeighted(rng, items) {
  const sum = items.reduce((s, it) => s + it.w, 0);
  let r = rng() * sum;
  for (const it of items) { r -= it.w; if (r <= 0) return it; }
  return items[items.length - 1];
}

// Plan a wave: [{t, type, path}] spawn times in seconds, plus what to tell
// the players.
export function planWave({ w, n, towers, lastFams = [], rng = Math.random }) {
  const sc = teamScale(n);
  const doors = doorsFor(n);
  const team = assessTeam(towers, w);
  const cycleW = w > WAVES ? ((w - 1) % WAVES) + 1 : w;       // endless repeats the boss beats
  const boss = BOSSES[cycleW] || (w > WAVES && w % 10 === 0 ? ['cake', 'turkey', 'pizza'][(w / 10) % 3] : null);

  // Which families are around yet, and how likely each is this wave.
  let unlocked = Object.keys(FAMILIES).filter(f => FAMILIES[f].from <= w);
  if (n === 1 && team.total > 0) {
    // Solo: drop what this player can't realistically hurt.
    const fair = unlocked.filter(f => team.cover[f] >= 0.7);
    if (fair.length) unlocked = fair;
  }
  const weights = Object.fromEntries(unlocked.map(f => [f, lastFams.includes(f) ? 0.6 : 1]));

  // Monoculture? Push the counters, and warn.
  let warn = null, warnPush = 0, warnType = null;
  if (w >= 4 && team.total > 0) {
    for (const [dt, s] of Object.entries(team.share)) {
      if (s <= 0.4 || !COUNTERS[dt]) continue;
      const push = sc.adapt * (s - 0.4) * 10;
      let used = false;
      for (const f of COUNTERS[dt].fams) if (weights[f] != null) { weights[f] += push; used = true; }
      if (used && push > warnPush && sc.adapt >= 1) { warnPush = push; warn = COUNTERS[dt].warn; warnType = dt; }
    }
  }

  let k = sc.families + (w >= 8 ? 1 : 0) + (n > 1 && w >= 16 ? 1 : 0);
  if (boss) k = Math.max(1, k - 1);
  k = Math.min(k, unlocked.length);
  const pool = unlocked.map(f => ({ f, w: weights[f] }));
  const fams = [];
  while (fams.length < k && pool.length) {
    const it = pickWeighted(rng, pool);
    fams.push(it.f);
    pool.splice(pool.indexOf(it), 1);
  }
  // A strong counter push always makes the cut.
  if (warnPush > 2.5) {
    const dt = Object.entries(team.share).sort((a, b) => b[1] - a[1])[0][0];
    const cf = COUNTERS[dt]?.fams.find(f => weights[f] != null);
    if (cf && !fams.includes(cf)) fams[fams.length - 1] = cf;
  }

  // Spend the budget.
  let budget = waveBudget(w) * sc.count * (n === 1 ? soloCurve(w) : 1) * (boss ? 0.5 : 1);
  const groups = [];
  const per = budget / fams.length;
  for (const f of fams) {
    const mem = famMembers(f, w);
    const list = Object.entries(mem).map(([id, wt]) => ({ id, w: wt }));
    let left = per * (0.85 + rng() * 0.3);
    const units = [];
    while (left > 0) {
      const e = pickWeighted(rng, list).id;
      units.push(e);
      left -= ENEMIES[e].cost;
    }
    // Chunk the family into groups of similar food so they march in clumps.
    const sz = f === 'horde' || f === 'frozen' ? 8 : 4;
    for (let i = 0; i < units.length; i += sz) groups.push({ fam: f, units: units.slice(i, i + sz) });
  }
  // Shuffle groups so families interleave.
  for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]]; }

  // Each door has its own timeline; groups go to doors in turn.
  const doorT = Object.fromEntries(doors.map(d => [d, 1.5]));
  const spawns = [];
  if (boss) spawns.push({ t: 4, type: boss, path: doors[0], boss: true });
  groups.forEach((g, gi) => {
    const path = doors[gi % doors.length];
    let t = doorT[path];
    for (const id of g.units) {
      spawns.push({ t, type: id, path });
      const e = ENEMIES[id];
      t += e.hp >= 300 ? 1.4 : e.hp >= 100 ? 0.8 : 0.4;
    }
    doorT[path] = t + 1.8;
  });
  spawns.sort((a, b) => a.t - b.t);
  return { spawns, fams, warn, warnType, boss, bossIntro: boss ? BOSS_INTRO[boss] : null, team };
}
