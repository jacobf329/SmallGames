// Leftover Uprising - the game itself, with no networking: the kitchen, the
// food marching through it, every tower shot, combo, gold and life. The host
// runs one of these (session.js); the balance test runs thousands.
//
//   const g = createGame({ players, diff });
//   g.act(playerId, { t: 'build', x, y });   // -> null or an error string
//   g.step(dt);  g.events  (drain after each snapshot)

import {
  TOWERS, ENEMIES, DIFFICULTY, PATH_GEO, WAVES, START_GOLD, WAVE_BONUS, BUILD_TIME, EARLY_BONUS,
  MAX_TOWERS, SELL_BACK, TREE_IDS, MASTERY_DISCOUNT, MAX_MASTERY, SP_START, SP_PER_WAVE, SP_BOSS_BONUS, skillCost, masteryLevel, buildable,
  pathPoint, teamScale, waveHpMult, doorsFor,
} from './data.js';
import { planWave } from './director.js';

const SHATTER = 2.2, BRITTLE = 1.35, CARAMEL_BONUS = 45, CARAMEL_STUN = 1.3, CARAMEL_CD = 3;

export function createGame({ players, diff = 'normal', rng = Math.random }) {
  const D = DIFFICULTY[diff] || DIFFICULTY.normal;
  const P = new Map();
  for (const p of players) {
    P.set(p.id, {
      id: p.id, name: p.name, color: p.color, ai: !!p.ai, gold: START_GOLD * D.gold, sp: SP_START,
      mastery: Object.fromEntries(TREE_IDS.map(t => [t, 0])),
      stats: { dmg: 0, kills: 0, combos: 0, built: 0 }, ready: false,
    });
  }
  const g = {
    diff, wave: 0, phase: 'build', buildT: BUILD_TIME(1), lives: D.lives, maxLives: D.lives,
    endless: false, speed: 1, enemies: [], towers: new Map(), players: P, events: [],
    plan: null, waveT: 0, spawnI: 0, lastFams: [], towersVer: 1, playersVer: 1, nextId: 1,
    warn: null, fams: [], time: 0, seen: new Set(), next: null, preview: null,
  };
  const n = () => P.size;
  const ev = e => g.events.push(e);
  const towerAt = (x, y) => { for (const t of g.towers.values()) if (t.x === x && t.y === y) return t; return null; };
  const owned = pid => [...g.towers.values()].filter(t => t.owner === pid).length;

  // ----------------------------------------------------- service auras ----
  // Each tower's boost from Service towers of a DIFFERENT tree in range.
  function recomputeBuffs() {
    for (const t of g.towers.values()) {
      const tree = TOWERS[t.kind].tree;
      t.lvl = tree ? (P.get(t.owner)?.mastery[tree] || 0) : 0;
      t.rangeB = t.lvl >= 5 ? 0.3 : 0;
    }
    const svc = [...g.towers.values()].filter(t => TOWERS[t.kind].buff);
    for (const t of g.towers.values()) {
      const def = TOWERS[t.kind];
      let buff = 0, haste = 0;
      if (def.dmg) for (const s of svc) {
        const sd = TOWERS[s.kind];
        if (def.tree === 'service') continue;
        if (Math.hypot(s.x - t.x, s.y - t.y) > sd.range + s.rangeB + 0.01) continue;
        buff += sd.buff + (s.lvl >= 4 ? 0.05 : 0) + (s.lvl >= 5 ? 0.10 : 0); haste += sd.haste || 0;
      }
      t.buff = Math.min(0.75, buff); t.haste = Math.min(0.35, haste);
    }
    g.towersVer++;
  }

  // ------------------------------------------------------------ actions ----
  function costFor(p, kind) {
    const def = TOWERS[kind];
    const lvl = def.tree ? masteryLevel(p.mastery[def.tree]) : 0;
    return Math.round(def.cost * (lvl >= 2 ? 1 - MASTERY_DISCOUNT : 1));
  }
  g.costFor = (pid, kind) => costFor(P.get(pid), kind);

  function spend(p, amount) {
    p.gold -= amount;
    g.playersVer++;
  }

  g.act = (pid, m) => {
    const p = P.get(pid);
    if (!p || !m || g.phase === 'lost' || g.phase === 'won') return 'not now';
    switch (m.t) {
      case 'build': {
        const x = m.x | 0, y = m.y | 0;
        if (!buildable(x, y) || towerAt(x, y)) return 'can’t build there';
        if (owned(pid) >= MAX_TOWERS(n())) return `tower limit (${MAX_TOWERS(n())}) reached`;
        const c = costFor(p, 'prep');
        if (p.gold < c) return 'not enough gold';
        spend(p, c, null);
        const t = { id: g.nextId++, x, y, kind: 'prep', owner: pid, spent: c, cd: 0, mode: 'first', dmg: 0 };
        g.towers.set(t.id, t);
        p.stats.built++;
        recomputeBuffs();
        ev({ t: 'built', id: t.id, by: pid });
        return null;
      }
      case 'up': {
        const t = g.towers.get(m.id);
        if (!t || t.owner !== pid) return 'not your tower';
        const def = TOWERS[t.kind];
        if (!def.next.includes(m.to)) return 'can’t upgrade to that';
        const nd = TOWERS[m.to];
        if (nd.req && masteryLevel(p.mastery[nd.tree]) < nd.req) return `needs ${nd.tree} mastery ${nd.req}`;
        const c = costFor(p, m.to);
        if (p.gold < c) return 'not enough gold';
        spend(p, c, nd.tree);
        t.kind = m.to; t.spent += c;
        recomputeBuffs();
        ev({ t: 'upgraded', id: t.id, by: pid, kind: m.to });
        return null;
      }
      case 'sell': {
        const t = g.towers.get(m.id);
        if (!t || t.owner !== pid) return 'not your tower';
        p.gold += Math.round(t.spent * SELL_BACK);
        g.towers.delete(t.id);
        recomputeBuffs();
        g.playersVer++;
        ev({ t: 'sold', id: t.id, by: pid });
        return null;
      }
      case 'mode': {
        const t = g.towers.get(m.id);
        if (!t || t.owner !== pid || !['first', 'last', 'strong'].includes(m.mode)) return 'no';
        t.mode = m.mode; g.towersVer++;
        return null;
      }
      case 'gift': {
        const to = P.get(m.to);
        const amt = Math.min(Math.floor(p.gold), Math.max(0, m.amt | 0));
        if (!to || to === p || !amt) return 'can’t send that';
        p.gold -= amt; to.gold += amt; g.playersVer++;
        ev({ t: 'gift', from: pid, to: to.id, amt });
        return null;
      }
      case 'skill': {
        if (!TREE_IDS.includes(m.tree)) return 'no such tree';
        const lvl = p.mastery[m.tree];
        if (lvl >= MAX_MASTERY) return 'already mastered';
        const c = skillCost(lvl);
        if (p.sp < c) return `needs ${c} skill points`;
        p.sp -= c; p.mastery[m.tree] = lvl + 1;
        recomputeBuffs();
        g.playersVer++;
        ev({ t: 'skill', by: pid, tree: m.tree, lvl: lvl + 1 });
        return null;
      }
      case 'fast': {
        // Double speed only while every human cook wants it.
        p.fast = !p.fast; g.playersVer++;
        const before = g.speed;
        g.speed = speedNow();
        if (g.speed !== before) ev({ t: 'speed', speed: g.speed, by: pid });
        return null;
      }
      case 'ready': {
        if (g.phase !== 'build') return 'wave already running';
        p.ready = !p.ready; g.playersVer++;
        return null;
      }
    }
    return 'unknown';
  };

  function speedNow() {
    const humans = [...P.values()].filter(p => !p.ai);
    return humans.length && humans.every(p => p.fast) ? 2 : 1;
  }
  // Cooks leave mid-game: their towers keep cooking and their gold is shared out.
  g.removePlayer = pid => {
    const p = P.get(pid);
    if (!p) return;
    P.delete(pid);
    const rest = [...P.values()];
    if (rest.length) for (const q of rest) q.gold += p.gold / rest.length;
    const heir = rest[0];
    for (const t of g.towers.values()) if (t.owner === pid) { if (heir) t.owner = heir.id; else g.towers.delete(t.id); }
    recomputeBuffs();
    g.speed = speedNow();
    g.playersVer++;
  };
  g.addPlayer = p => {
    if (P.has(p.id)) return;
    P.set(p.id, { id: p.id, name: p.name, color: p.color, ai: !!p.ai, gold: START_GOLD * D.gold * (1 + g.wave * 0.25), sp: SP_START + g.wave,
      mastery: Object.fromEntries(TREE_IDS.map(t => [t, 0])), stats: { dmg: 0, kills: 0, combos: 0, built: 0 }, ready: false });
    g.playersVer++;
  };

  // -------------------------------------------------------------- waves ----
  function startWave() {
    if (g.buildT > 1 && g.wave > 0) {
      const bonus = Math.floor(g.buildT) * EARLY_BONUS;
      for (const p of P.values()) p.gold += bonus;
      ev({ t: 'early', gold: bonus });
    }
    g.wave++;
    g.phase = 'wave';
    g.waveT = 0; g.spawnI = 0;
    for (const p of P.values()) p.ready = false;
    g.plan = g.next && g.next.n === g.wave ? g.next.plan : planWave({ w: g.wave, n: n(), towers: [...g.towers.values()], lastFams: g.lastFams, rng });
    g.next = null;
    g.lastFams = g.plan.fams;
    g.fams = g.plan.fams;
    g.warn = g.plan.warn;
    g.playersVer++;
    ev({ t: 'wave', n: g.wave, fams: g.plan.fams, warn: g.plan.warn, boss: g.plan.boss, bossIntro: g.plan.bossIntro, doors: doorsFor(n()) });
  }

  // The next wave is decided as the build break starts, so everyone can see
  // what's coming (and meet any food they haven't fought yet) before it lands.
  function planNext() {
    const w = g.wave + 1;
    const plan = planWave({ w, n: n(), towers: [...g.towers.values()], lastFams: g.lastFams, rng });
    g.next = { n: w, plan };
    const types = new Set();
    const add = id => { if (types.has(id)) return; types.add(id); const sp = ENEMIES[id].split; if (sp) add(sp.into); };
    for (const s of plan.spawns) add(s.type);
    // Cards for food nobody has met yet (split-off pieces are covered by their parent's card).
    const parents = [...types].filter(id => !g.seen.has(id) && ![...types].some(o => ENEMIES[o].split?.into === id));
    for (const id of types) g.seen.add(id);
    g.preview = { n: w, fams: plan.fams, warn: plan.warn, boss: plan.boss, bossIntro: plan.bossIntro, newFoods: parents };
    ev({ t: 'preview', ...g.preview });
  }

  function waveCleared() {
    const w = g.wave;
    const bonus = WAVE_BONUS(w) * D.gold;
    const incomeOf = t => (TOWERS[t.kind].income || 0) * (t.lvl >= 1 ? 1.1 : 1) * (t.lvl >= 4 ? 1.5 : 1);
    let team = 0;
    for (const t of g.towers.values()) team += TOWERS[t.kind].teamIncome || 0;
    const sp = SP_PER_WAVE + (g.plan?.boss ? SP_BOSS_BONUS : 0);
    for (const p of P.values()) {
      let inc = 0;
      for (const t of g.towers.values()) if (t.owner === p.id) inc += incomeOf(t);
      p.gold += bonus + inc + team;
      p.sp += sp;
    }
    g.playersVer++;
    ev({ t: 'cleared', n: w, bonus: Math.round(bonus), team, sp });
    if (w === WAVES && !g.endless) { g.phase = 'won'; ev({ t: 'won', n: w }); return; }
    g.phase = 'build';
    g.buildT = BUILD_TIME(w + 1);
    planNext();
  }
  g.continueEndless = () => {
    if (g.phase !== 'won') return;
    g.endless = true; g.phase = 'build'; g.buildT = BUILD_TIME(g.wave + 1);
    planNext();
  };

  // ------------------------------------------------------------ enemies ----
  function spawn(type, path, d = 0) {
    const def = ENEMIES[type];
    const sc = teamScale(n());
    // Bosses climb on a gentler ramp: they're already built to be a team's big test.
    let hp = def.hp * D.hp * (def.fam === 'boss' ? waveHpMult(g.wave, D.ramp * 0.5, D.late * 0.5) : waveHpMult(g.wave, D.ramp, D.late));
    if (def.boss || def.fam === 'boss') hp *= sc.bossHp;
    const e = {
      id: g.nextId++, type, path, d, hp, maxHp: hp,
      slowT: 0, slowF: 1, freezeT: 0, stunT: 0, stickyT: 0, burnT: 0, burnDps: 0, burnBy: null,
      caramelCd: 0, chilled: 0, ccImm: 0, lat: ((g.nextId * 7919) % 100) / 100 - 0.5,
    };
    g.enemies.push(e);
    if (def.boss) ev({ t: 'boss', type });
    return e;
  }

  function kill(e, by) {
    const def = ENEMIES[e.type];
    e.dead = true;
    const sc = teamScale(n());
    const pay = def.bounty * sc.pay * D.gold;
    for (const p of P.values()) p.gold += pay;
    g.playersVer++;
    const bp = P.get(by);
    if (bp) bp.stats.kills++;
    const [x, y] = pathPoint(e.path, e.d);
    ev({ t: 'pop', x: +x.toFixed(2), y: +y.toFixed(2), type: e.type, gold: Math.round(pay) });
    if (def.split) for (let i = 0; i < def.split.n; i++) {
      const c = spawn(def.split.into, e.path, Math.max(0, e.d - i * 0.22));
      c.lat = (i / Math.max(1, def.split.n - 1) - 0.5) * 0.8;
    }
  }

  // ------------------------------------------------------------- damage ----
  function hit(e, t, def, base, owner) {
    if (e.dead) return;
    const ed = ENEMIES[e.type];
    const p = P.get(owner);
    const lvl = t.lvl || 0;
    const power = (1 + (lvl >= 1 ? 0.1 : 0) + (lvl >= 5 ? 0.2 : 0)) * (1 + (t.buff || 0));
    let res = ed.res[def.dtype] ?? 1, armour = ed.armour;
    // Solo, bosses don't hard-counter your one strategy.
    if (P.size === 1 && ed.fam === 'boss') { res = 1 - (1 - res) * 0.4; armour *= 0.5; }
    let dmg = base * res * power;
    // Combos: they only happen when two different trees work on the same food.
    if (def.dtype === 'chop' && def.tree === 'chop' && lvl >= 4 && rng() < 0.2) dmg *= 2;   // Razor Edge
    if (def.dtype === 'chop' && e.freezeT > 0) {
      dmg *= SHATTER; e.freezeT = 0;
      combo(e, 'Shatter!', owner);
    } else if (def.dtype === 'chop' && e.chilled > 0) {
      dmg *= BRITTLE;
    }
    if (def.dtype === 'heat' && e.stickyT > 0 && e.caramelCd <= 0) {
      dmg += CARAMEL_BONUS * power;
      if (e.ccImm <= 0) { e.stunT = Math.max(e.stunT, ed.boss ? CARAMEL_STUN * 0.3 : CARAMEL_STUN); e.ccImm = CARAMEL_STUN + (ed.boss ? 3 : 0.7); }
      e.stickyT = 0; e.caramelCd = CARAMEL_CD;
      combo(e, 'Caramelized!', owner);
    }
    if (!def.pierce) dmg = Math.max(dmg * 0.2, dmg - armour);
    e.hp -= dmg;
    t.dmg += dmg;
    if (p) p.stats.dmg += dmg;
    // Effects
    const bossK = ed.boss ? 0.3 : 1;
    const heatL4 = def.tree === 'heat' && lvl >= 4, coldK = def.tree === 'cold' && lvl >= 4 ? 1.4 : 1, gooey = def.tree === 'sticky' && lvl >= 4 ? 1 : 0;
    if (def.burn && (ed.res.heat ?? 1) > 0.15) {
      const dps = def.burn.dps * power * (ed.res.heat ?? 1) * (heatL4 ? 1.5 : 1);
      if (dps >= e.burnDps || e.burnT <= 0) { e.burnDps = dps; e.burnBy = owner; }
      e.burnT = Math.max(e.burnT, def.burn.t + (heatL4 ? 1 : 0));
    }
    if (def.slow && !ed.frozen) { e.slowT = Math.max(e.slowT, def.slow.t * coldK); e.slowF = Math.min(e.slowF, def.slow.f); e.chilled = def.slow.t; }
    // Freezes and stuns can't be chained forever: a short immunity follows each.
    if (e.ccImm <= 0 && ((def.freeze && !ed.frozen) || def.stun)) {
      const dur = Math.max(def.freeze && !ed.frozen ? def.freeze * coldK : 0, def.stun || 0) * bossK;
      if (def.freeze && !ed.frozen) e.freezeT = Math.max(e.freezeT, dur); else e.stunT = Math.max(e.stunT, dur);
      e.ccImm = dur + (ed.boss ? 3 : 0.7);
    }
    if (def.sticky && !ed.greasy && !ed.air) e.stickyT = Math.max(e.stickyT, def.sticky + gooey);
    if (e.hp <= 0) kill(e, owner);
  }
  function combo(e, name, by) {
    const p = P.get(by);
    if (p) p.stats.combos++;
    const [x, y] = pathPoint(e.path, e.d);
    ev({ t: 'combo', name, x: +x.toFixed(2), y: +y.toFixed(2), by });
  }

  const posOf = e => pathPoint(e.path, e.d);
  function inRange(t, def, e) {
    if (e.dead) return false;
    if (ENEMIES[e.type].air && !def.air) return false;
    const [x, y] = posOf(e);
    return Math.hypot(x - (t.x + 0.5), y - (t.y + 0.5)) <= def.range + (t.rangeB || 0);
  }
  function pickTarget(t, def, list) {
    let best = null, bv = -Infinity;
    for (const e of list) {
      if (!inRange(t, def, e)) continue;
      const left = PATH_GEO[e.path].total - e.d;
      const v = t.mode === 'strong' ? e.hp : t.mode === 'last' ? left : -left;
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }

  function towersFire(dt) {
    for (const t of g.towers.values()) {
      const def = TOWERS[t.kind];
      if (!def.rate) continue;
      t.cd -= dt * (1 + (t.haste || 0));
      if (t.cd > 0) continue;
      if (def.aura) {
        const hits = g.enemies.filter(e => inRange(t, def, e));
        if (!hits.length) { t.cd = 0; continue; }
        t.cd = 1 / def.rate;
        for (const e of hits) hit(e, t, def, def.dmg, t.owner);
        ev({ t: 'aura', id: t.id });
        continue;
      }
      const target = pickTarget(t, def, g.enemies);
      if (!target) { t.cd = 0; continue; }
      t.cd = 1 / def.rate;
      const [tx, ty] = posOf(target);
      ev({ t: 'shot', id: t.id, x: +tx.toFixed(2), y: +ty.toFixed(2) });
      if (def.splash) {
        for (const e of g.enemies) {
          if (e.dead || (ENEMIES[e.type].air && !def.air)) continue;
          const [x, y] = posOf(e);
          const dd = Math.hypot(x - tx, y - ty);
          if (e === target || dd <= def.splash * (def.tree === 'sticky' && t.lvl >= 4 ? 1.3 : 1)) hit(e, t, def, e === target ? def.dmg : def.dmg * 0.6, t.owner);
        }
      } else hit(target, t, def, def.dmg, t.owner);
    }
  }

  function moveEnemies(dt) {
    for (const e of g.enemies) {
      if (e.dead) continue;
      const def = ENEMIES[e.type];
      // Status timers
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burnDps * dt;
        const bp = P.get(e.burnBy); if (bp) bp.stats.dmg += e.burnDps * dt;
        if (e.hp <= 0) { kill(e, e.burnBy); continue; }
      } else if (def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + def.regen * D.hp * dt);
      e.caramelCd -= dt; e.chilled -= dt; e.ccImm -= dt;
      let f = 1;
      if (e.slowT > 0) { e.slowT -= dt; f = Math.min(f, e.slowF); } else e.slowF = 1;
      if (e.stickyT > 0) { e.stickyT -= dt; f = Math.min(f, 0.5); }
      if (e.freezeT > 0) { e.freezeT -= dt; f = 0; }
      if (e.stunT > 0) { e.stunT -= dt; f = 0; }
      e.d += def.speed * f * dt;
      if (e.d >= PATH_GEO[e.path].total) {
        e.dead = true; e.leaked = true;
        g.lives -= def.leak;
        ev({ t: 'leak', type: e.type, lives: def.leak });
        if (g.lives <= 0) { g.lives = 0; g.phase = 'lost'; ev({ t: 'lost', n: g.wave }); }
      }
    }
    g.enemies = g.enemies.filter(e => !e.dead);
  }

  // --------------------------------------------------------------- step ----
  g.step = dt => {
    g.time += dt;
    if (g.phase === 'build') {
      g.buildT -= dt;
      const allReady = P.size > 0 && [...P.values()].every(p => p.ready || p.ai);
      const anyHuman = [...P.values()].some(p => !p.ai);
      if (g.buildT <= 0 || (allReady && anyHuman)) startWave();
      return;
    }
    if (g.phase !== 'wave') return;
    g.waveT += dt;
    const sp = g.plan.spawns;
    while (g.spawnI < sp.length && sp[g.spawnI].t <= g.waveT) { const s = sp[g.spawnI++]; spawn(s.type, s.path); }
    moveEnemies(dt);
    if (g.phase !== 'wave') return;
    towersFire(dt);
    g.enemies = g.enemies.filter(e => !e.dead);
    if (g.spawnI >= sp.length && g.enemies.length === 0) waveCleared();
  };
  g.startNow = () => { if (g.phase === 'build') startWave(); };
  planNext();

  return g;
}
