// Decision-making for monsters, AI companions and the Coach. aiNext returns
// one intent at a time; it plays by exactly the same rules as a person
// because its intents go through combat.perform like anyone else's.
//
// Styles:  melee       close in and hit the best target in reach
//          skirmisher  (Rogue) set up Sneak Attack, otherwise shoot; step back after
//          archer      keep away, Disengage out of melee, shoot from cover
//          caster      (Wizard) stay back, pick the best spell or cantrip
//          support     (Cleric) heal and bless, then attack with spells
//
// The core idea: score every action from where the creature stands, then
// score the same from every square it could move to (minus the risk of
// getting there), and take whichever is better.

import { cheb, incap, down, hasCond, condOf, reachMap, canEndAt, pathFrom, key, onBoard, lineOfSight, feetBetween } from './grid.js';
import {
  attackOptions, enemiesOf, alliesOf, previewMove, canCast, canAttack, spellAttack, spellDC,
  attackFactors, hitChance, hitBonus, saveChance, coneTargets, cubeTargets, spellMod, scaled,
  provokers, speedOf, seenBy, preservePlan, damageMult, acAgainst, reachOf,
} from './combat.js';
import { SPELLS } from './data.js';
import { avgDice } from './rng.js';

const hidden = (c) => hasCond(c, 'hidden');
const targetsOf = (b, me) => {
  const all = enemiesOf(b, me).filter((e) => onBoard(e) && !e.dead && !hidden(e));
  const up = all.filter((e) => !down(e));
  return up.length ? up : all;           // only beat on the fallen when nobody else is left
};
const awake = (b, me) => enemiesOf(b, me).filter((e) => onBoard(e) && !incap(e));
const threatenedAt = (b, me, at) => awake(b, me).some((e) => cheb(e, at) * 5 <= reachOf(e) && lineOfSight(b, e, at));
const threatened = (b, me) => threatenedAt(b, me, me);
const finishing = (T, avg) => (T.hp <= avg ? 2 : 0) - (down(T) ? 3 : 0) + (hasCond(T, 'paralyzed') && !down(T) ? 3 : 0);
const slotCost = (can) => (can.pay === 'slot' ? 2 + can.slot * 1.5 : can.pay === 'free' ? 1.5 : 0);
const sees = (b, me, T, range) => feetBetween(me, T) <= range && lineOfSight(b, me, T);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Weapon attacks from where `me` stands.
function weaponOptions(b, me, { kind = null } = {}) {
  const out = [];
  if (!canAttack(b.turn)) return out;
  for (const T of targetsOf(b, me)) {
    for (const o of attackOptions(b, me, T)) {
      if (!o.ok || (kind && o.atk.kind !== kind)) continue;
      out.push({ intent: { a: 'attack', target: T.id, attack: o.atk.id }, score: o.expected + finishing(T, o.avg), why: { T, o }, time: 'action', ranged: o.atk.kind === 'ranged' });
    }
  }
  return out;
}

// Every spell and special option the creature has right now, scored by
// expected damage (or how much it helps). Leveled spells pay for the slot,
// so cantrips are preferred when they're nearly as good. `light` skips the
// area spells and buffs (used when scoring squares to move to).
export function specialOptions(b, me, { light = false } = {}) {
  const out = [];
  const t = b.turn;
  if (!t) return out;
  const add = (intent, score, why, time = 'action') => out.push({ intent, score, why, time });
  const friends = [me, ...alliesOf(b, me)].filter((c) => !c.dead && onBoard(c));
  const foes = targetsOf(b, me);
  for (const sid of Object.keys(me.casting?.known || {})) {
    const s = SPELLS[sid];
    const can = canCast(b, me, sid);
    if (!can.ok) continue;
    if (light && !['attack', 'save', 'missile', 'rays', 'command', 'hold', 'spiritual'].includes(s.kind)) continue;
    if (s.conc && me.conc) continue;      // keep the spell already going
    const cost = slotCost(can);
    const sc = scaled(sid, can.slot);
    const dc = spellDC(me, sid);
    switch (s.kind) {
      case 'attack': case 'rays': {
        const atk = spellAttack(me, sid);
        for (const T of foes) {
          if (!sees(b, me, T, s.range)) continue;
          const f = attackFactors(b, me, T, atk);
          const p = hitChance(hitBonus(atk), acAgainst(b, me, T, atk).value, f.mode, me.luck);
          const each = avgDice(sc.dice) * damageMult(T, s.type) + (me.firesBurn?.uses && s.kind === 'attack' ? 5.5 : 0);
          const n = s.kind === 'rays' ? sc.rays : 1;
          add({ a: 'cast', spell: sid, target: T.id }, n * p * each + finishing(T, each) - cost + (s.rider === 'guided' ? 1.5 : 0) + (s.rider === 'chill' ? 0.5 : 0), { T, p, mode: f.mode, n });
        }
        break;
      }
      case 'save': {
        for (const T of foes) {
          if (!sees(b, me, T, s.range)) continue;
          const pFail = 1 - saveChance(b, T, s.save, dc);
          const avg = avgDice(sc.dice) * damageMult(T, s.type);
          add({ a: 'cast', spell: sid, target: T.id }, (pFail + (s.half ? (1 - pFail) / 2 : 0)) * avg + finishing(T, avg) - cost, { T, pFail, dc });
        }
        break;
      }
      case 'missile': {
        for (const T of foes) {
          if (!sees(b, me, T, s.range)) continue;
          const avg = sc.darts * (avgDice(s.dice) + s.flat) * damageMult(T, s.type);
          add({ a: 'cast', spell: sid, target: T.id }, avg + finishing(T, avg) * 2 - cost, { T });
        }
        break;
      }
      case 'command': {
        for (const T of foes) {
          if (down(T) || hasCond(T, 'commanded') || !sees(b, me, T, s.range)) continue;
          const pFail = 1 - saveChance(b, T, 'wis', dc);
          add({ a: 'cast', spell: sid, target: T.id }, pFail * 7 - cost, { T, pFail, dc });
        }
        break;
      }
      case 'hold': {
        for (const T of foes) {
          if (down(T) || T.creature !== s.only || hasCond(T, 'paralyzed') || !sees(b, me, T, s.range)) continue;
          const pFail = 1 - saveChance(b, T, 'wis', dc);
          add({ a: 'cast', spell: sid, target: T.id }, pFail * 16 - cost, { T, pFail, dc });
        }
        break;
      }
      case 'spiritual': {
        if (b.effects.some((e) => e.type === 'spiritual' && e.by === me.id)) break;
        const atk = spellAttack(me, sid, { melee: true });
        for (const T of foes) {
          if (!sees(b, me, T, s.range)) continue;
          const p = hitChance(hitBonus(atk), acAgainst(b, me, { ...T }, { ...atk, ignoreCover: true }).value, 'normal', me.luck);
          const avg = (avgDice(sc.dice) + spellMod(me, sid)) * damageMult(T, s.type);
          add({ a: 'cast', spell: sid, target: T.id }, p * avg + 5 - cost, { T, p }, 'bonus');
        }
        break;
      }
      case 'cone': {
        for (const T of foes) {
          const hit = coneTargets(b, me, T.x, T.y);
          const fs = hit.filter((c) => c.side !== me.side && !down(c));
          const pals = hit.filter((c) => c.side === me.side);
          if (fs.length < 2 || pals.length) continue;
          const exp = fs.reduce((acc, c) => acc + avgDice(sc.dice) * damageMult(c, s.type) * (1 - saveChance(b, c, s.save, dc) / 2), 0);
          add({ a: 'cast', spell: sid, x: T.x, y: T.y }, exp - cost, { foes: fs, pals });
        }
        break;
      }
      case 'cube': {
        const near = threatened(b, me);
        for (const [dx, dy] of DIRS) {
          const x = me.x + dx, y = me.y + dy;
          const hit = cubeTargets(b, me, x, y);
          const fs = hit.filter((c) => c.side !== me.side && !down(c));
          const pals = hit.filter((c) => c.side === me.side);
          if (!fs.length || pals.length || (fs.length < 2 && !near)) continue;
          const exp = fs.reduce((acc, c) => acc + avgDice(sc.dice) * damageMult(c, s.type) * (1 - saveChance(b, c, s.save, dc) / 2), 0);
          add({ a: 'cast', spell: sid, x, y }, exp + (near ? 2 : 0) - cost, { foes: fs, pals });
        }
        break;
      }
      case 'heal': {
        for (const F of friends) {
          if (!sees(b, me, F, Math.max(5, s.range)) && F !== me) continue;
          if (s.range === 5 && F !== me && cheb(me, F) > 1) continue;
          const need = F.hp <= 0 ? 20 : F.hp <= F.hpMax / 3 ? 9 : 0;
          if (need) add({ a: 'cast', spell: sid, target: F.id }, need + (s.time === 'bonus' ? 2 : 0) - cost, { T: F, heal: avgDice(sc.dice) + spellMod(me, sid) }, s.time);
        }
        break;
      }
      case 'stabilize': {
        for (const F of alliesOf(b, me)) {
          if (F.hp <= 0 && !F.stable && !F.dead && sees(b, me, F, s.range)) add({ a: 'cast', spell: sid, target: F.id }, 12, { T: F });
        }
        break;
      }
      case 'cure': {
        for (const F of friends) {
          if (F !== me && cheb(me, F) > 1) continue;
          const c = (F.conds || []).find((x) => s.cures.includes(x.id));
          if (!c) continue;
          add({ a: 'cast', spell: sid, target: F.id, cond: c.id }, (c.id === 'paralyzed' ? 16 : 3) - cost, { T: F, cond: c.id }, s.time);
        }
        break;
      }
      case 'buff': {
        const pool = friends.filter((F) => !down(F) && (F === me || sees(b, me, F, s.range)));
        if (s.buff === 'bless') {
          const ids = pool.sort((p, q) => (q.side === me.side) - (p.side === me.side)).slice(0, sc.targets).map((c) => c.id);
          if (ids.length >= 2 && foes.some((T) => !down(T))) add({ a: 'cast', spell: sid, targets: ids }, 2 + ids.length * 2.5 - cost, { ids });
        } else if (s.buff === 'faith') {
          let best = null;
          for (const F of pool) {
            const n = awake(b, F).filter((e) => cheb(e, F) * 5 <= reachOf(e)).length;
            if (n && (!best || n > best.n)) best = { F, n };
          }
          if (best) add({ a: 'cast', spell: sid, target: best.F.id }, 1 + best.n * 2.5 - cost, { T: best.F }, 'bonus');
        } else if (s.buff === 'aid') {
          const dying = friends.filter((F) => F.hp <= 0 && !F.dead && sees(b, me, F, s.range)).slice(0, sc.targets);
          if (dying.length) add({ a: 'cast', spell: sid, targets: dying.map((c) => c.id) }, 14 * dying.length - cost, { ids: dying.map((c) => c.id) });
        }
        break;
      }
      default: break;
    }
  }
  if (me.breath?.uses > 0 && canAttack(t) && !light) {
    for (const T of foes) {
      const hit = coneTargets(b, me, T.x, T.y);
      const fs = hit.filter((c) => c.side !== me.side && !down(c));
      if (!fs.length || hit.some((c) => c.side === me.side)) continue;
      const dc = me.breath.dc.reduce((s, p) => s + p.value, 0);
      const exp = fs.reduce((acc, c) => acc + avgDice(me.breath.dice) * damageMult(c, me.breath.type) * (1 - saveChance(b, c, 'dex', dc) / 2), 0);
      add({ a: 'breath', x: T.x, y: T.y }, exp + (fs.length > 1 ? 2 : -2), { foes: fs });
    }
  }
  if (me.web?.ready && t.action) {
    for (const T of foes) {
      if (down(T) || hasCond(T, 'restrained') || !sees(b, me, T, me.web.range)) continue;
      const pFail = 1 - saveChance(b, T, 'dex', me.web.dc);
      add({ a: 'web', target: T.id }, pFail * 9 + (cheb(me, T) > 1 ? 2 : 0), { T, pFail });
    }
  }
  // Channel Divinity (Cleric).
  if (me.channel?.uses > 0 && t.action && !t.magicUsed) {
    if (me.level >= 2) {
      const dc = me.casting ? me.casting.stats.wis.dc.reduce((s, p) => s + p.value, 0) : 10;
      for (const T of foes) {
        if (!sees(b, me, T, 30)) continue;
        const avg = (4.5 + me.mods.wis) * damageMult(T, 'Radiant');
        add({ a: 'spark', target: T.id }, avg * (1 - saveChance(b, T, 'con', dc) / 2) + finishing(T, avg) - 2, { T, dc });
      }
      for (const F of friends) {
        if (F.hp <= 0 && !F.dead && sees(b, me, F, 30)) add({ a: 'spark', target: F.id }, 17, { T: F, heal: true });
      }
      const undead = enemiesOf(b, me).filter((c) => c.creature === 'undead' && c.hp > 0 && !hasCond(c, 'incapacitated') && feetBetween(me, c) <= 30);
      if (undead.length) add({ a: 'turn' }, undead.length * 6 * (1 - saveChance(b, undead[0], 'wis', dc)) - 1, { undead });
    }
    if (me.preserveLife) {
      const plan = preservePlan(b, me);
      const total = plan.reduce((s, p) => s + p.amount, 0);
      const ups = plan.filter((p) => b.creatures[p.id].hp <= 0).length;
      if (plan.length) add({ a: 'preserve' }, total * 0.7 + ups * 12 - 2, { plan });
    }
  }
  // Spiritual Weapon already out: a free swing with the Bonus Action.
  const w = b.effects.find((e) => e.type === 'spiritual' && e.by === me.id);
  if (w && t.bonus) {
    for (const T of foes) {
      if (cheb(w, T) > 5) continue;
      add({ a: 'spiritual', target: T.id }, 6 + finishing(T, 6), { T }, 'bonus');
    }
  }
  out.sort((p, q) => q.score - p.score);
  return out;
}

// Best thing to do with the action from where `me` stands.
function bestHere(b, me, { kind = null, light = false } = {}) {
  const t = b.turn;
  let best = null;
  for (const o of weaponOptions(b, me, { kind })) if (!best || o.score > best.score) best = o;
  if (t.action) {
    for (const o of specialOptions(b, me, { light })) {
      if (o.time !== 'action') continue;
      if (kind === 'melee' && o.intent.a === 'cast') continue;
      if (!best || o.score > best.score) best = o;
    }
  }
  return best;
}

// Every square `me` could move to now, with its path and the Opportunity
// Attacks on the way. (Prone creatures stand up first.)
function squaresWithin(b, me) {
  const t = b.turn;
  if (speedOf(b, me) === 0) return [];
  const budget = t.moveLeft - (hasCond(me, 'prone') ? Math.floor(Math.max(0, me.speed - 5 * (me.exhaustion || 0)) / 2) : 0);
  if (budget < 5) return [];
  const map = reachMap(b, me, budget);
  const out = [];
  for (const [k, feet] of map.dist) {
    const [x, y] = k.split(',').map(Number);
    if (feet <= 0 || !canEndAt(b, me, x, y)) continue;
    const path = pathFrom(map, me, x, y);
    if (!path) continue;
    let from = { x: me.x, y: me.y };
    const oas = new Set();
    for (const to of path) { for (const h of provokers(b, me, from, to)) oas.add(h.id); from = to; }
    out.push({ x, y, feet, oas: oas.size });
  }
  return out;
}

// Score acting from square s (moving there first), without moving.
function scoreFrom(b, me, s, opts) {
  const ox = me.x, oy = me.y;
  me.x = s.x; me.y = s.y;
  try { return bestHere(b, me, { ...opts, light: true }); } finally { me.x = ox; me.y = oy; }
}

const RANGED_STYLES = ['archer', 'caster', 'support', 'skirmisher'];

// Where to go before acting, if anywhere beats staying put.
function bestMove(b, me, style, here) {
  const t = b.turn;
  const free = b.effects.some((e) => e.type === 'disengage' && e.by === me.id);
  const ranged = RANGED_STYLES.includes(style);
  const kind = style === 'melee' ? null : style === 'archer' ? 'ranged' : null;
  const foes = targetsOf(b, me);
  if (!foes.length) return null;
  const hereScore = here ? here.score : 0;
  const cands = [];
  for (const s of squaresWithin(b, me)) {
    const risk = free ? 0 : s.oas * 6;
    const act = canAttack(t) ? scoreFrom(b, me, s, { kind }) : null;
    let score = (act ? act.score : 0) - risk;
    const near = Math.min(...foes.map((e) => cheb(e, s)));
    if (ranged && threatenedAt(b, me, s)) score -= style === 'skirmisher' && act && !act.ranged ? 0 : 3;
    if (ranged && act?.why?.o?.cover === null) score += 0;
    if (!act || act.score <= 0.3) score += style === 'melee' || !ranged ? -near * 0.3 : -Math.max(0, near - 4) * 0.3;
    cands.push({ ...s, score, act });
  }
  cands.sort((p, q) => q.score - p.score || p.feet - q.feet);
  const stayNear = Math.min(...foes.map((e) => cheb(e, me)));
  const stay = hereScore > 0.3 ? hereScore : (style === 'melee' || !ranged ? -stayNear * 0.3 : -Math.max(0, stayNear - 4) * 0.3) - (ranged && threatened(b, me) ? 3 : 0);
  for (const c of cands.slice(0, 12)) {
    if (c.score <= stay + 0.5) break;
    if (previewMove(b, me.id, c.x, c.y)) return c;
  }
  return null;
}

// After acting: get out of reach if you're a ranged type standing in it.
function retreat(b, me) {
  const free = b.effects.some((e) => e.type === 'disengage' && e.by === me.id);
  let best = null;
  for (const s of squaresWithin(b, me)) {
    if (!free && s.oas) continue;
    const ups = awake(b, me);
    if (!ups.length) return null;
    const near = Math.min(...ups.map((e) => cheb(e, s)));
    const score = Math.min(near, 5) * 10 - s.feet / 5 - (threatenedAt(b, me, s) ? 30 : 0);
    if (!best || score > best.score) best = { ...s, score };
  }
  if (!best || threatenedAt(b, me, best)) return null;
  return previewMove(b, me.id, best.x, best.y) ? best : null;
}

function fleeFrom(b, me, src) {
  let best = null;
  for (const s of squaresWithin(b, me)) {
    const d = cheb(s, src);
    if (d <= cheb(me, src)) continue;
    if (!best || d > best.d || (d === best.d && s.feet < best.feet)) best = { ...s, d };
  }
  return best && previewMove(b, me.id, best.x, best.y) ? best : null;
}

// A spot for Misty Step: out of reach, with a shot at someone.
function mistySpot(b, me) {
  let best = null;
  for (let y = me.y - 6; y <= me.y + 6; y++) {
    for (let x = me.x - 6; x <= me.x + 6; x++) {
      const s = { x, y };
      if (!canEndAt(b, me, x, y) || cheb(me, s) * 5 > 30 || !lineOfSight(b, me, s)) continue;
      if (threatenedAt(b, me, s)) continue;
      const act = scoreFrom(b, me, s, {});
      const score = (act ? act.score : 0) + Math.min(5, Math.min(...awake(b, me).map((e) => cheb(e, s))));
      if (!best || score > best.score) best = { ...s, score };
    }
  }
  return best;
}

function nearestTarget(b, me) {
  let best = null;
  for (const T of targetsOf(b, me)) {
    const d = cheb(me, T) * 10 + T.hp;
    if (!best || d < best.d) best = { T, d };
  }
  return best?.T || null;
}

const standCost = (me) => Math.floor(Math.max(0, me.speed - 5 * (me.exhaustion || 0)) / 2);

export function aiNext(b, id) {
  const me = b.creatures[id];
  const t = b.turn;
  if (!t || t.who !== id || b.over || b.pending) return null;
  if (t.steps > 12) return { a: 'end' };

  // Turned Undead flee from the cleric, then do nothing else.
  const turned = (me.conds || []).find((x) => x.turned);
  if (turned) {
    if (!t.moves && me.hp > 0) {
      const src = b.creatures[turned.by];
      const s = src && fleeFrom(b, me, src);
      if (s) return { a: 'move', x: s.x, y: s.y };
    }
    return { a: 'end' };
  }
  if (incap(me)) return { a: 'end' };
  const style = me.ai || 'melee';
  const foes = targetsOf(b, me);
  if (!foes.length) return { a: 'end' };

  // Get up first (half your Speed), unless you can't.
  if (hasCond(me, 'prone') && speedOf(b, me) > 0 && t.moveLeft >= standCost(me)) return { a: 'stand' };

  // Bonus actions that are worth it whatever else happens.
  if (t.bonus) {
    if (me.secondWind?.uses > 0 && me.hp <= me.hpMax / 2) return { a: 'second-wind' };
    const bonus = specialOptions(b, me).filter((o) => o.time === 'bonus');
    const top = bonus[0];
    if (top && top.score >= 5) return top.intent;
  }

  // Heroes look after a dying friend if they can.
  if (me.side === 'hero' && t.action) {
    const dying = alliesOf(b, me).find((a) => a.hp <= 0 && !a.dead && !a.stable);
    if (dying) {
      const help = specialOptions(b, me).find((o) => (o.intent.target === dying.id || o.intent.targets?.includes(dying.id) || o.intent.a === 'preserve') && o.score >= 12 && o.time === 'action');
      if (help) return help.intent;
      if (cheb(me, dying) <= 1) return { a: 'stabilize', target: dying.id };
      if (!t.moves) {
        let best = null;
        for (const s of squaresWithin(b, me)) {
          if (cheb(s, dying) > 1 || s.oas) continue;
          if (!best || s.feet < best.feet) best = s;
        }
        if (best && previewMove(b, id, best.x, best.y)) return { a: 'move', x: best.x, y: best.y };
      }
    }
  }

  // Held fast: break free if there's nothing better to do from here.
  const web = condOf(me, 'restrained');
  const grab = condOf(me, 'grappled');
  if ((web?.web || grab) && t.action) {
    const here = bestHere(b, me);
    if (!here || here.score < 3) return web?.web ? { a: 'cut', target: id } : { a: 'escape' };
  }

  // Casters in someone's reach: Misty Step away first.
  if ((style === 'caster' || style === 'support') && t.bonus && threatened(b, me) && canCast(b, me, 'misty-step').ok) {
    const s = mistySpot(b, me);
    if (s) return { a: 'cast', spell: 'misty-step', x: s.x, y: s.y };
  }

  // Archers next to an enemy: Disengage (goblins' Nimble Escape), then step away.
  if (style === 'archer' && threatened(b, me) && !t.moves && t.moveLeft >= 5) {
    const free = b.effects.some((e) => e.type === 'disengage' && e.by === id);
    if (!free && me.nimble && t.bonus) return { a: 'nimble' };
    if (free) { const s = retreat(b, me); if (s) return { a: 'move', x: s.x, y: s.y }; }
  }

  const kind = style === 'archer' ? (threatened(b, me) ? null : 'ranged') : null;
  let here = canAttack(t) || t.action ? bestHere(b, me, { kind }) : null;

  // Move first if a better spot is in reach (only while there's still something to do there).
  if (t.moves < 2 && t.moveLeft >= 5 && (canAttack(t) || t.action)) {
    const mv = bestMove(b, me, style, here);
    if (mv) return { a: 'move', x: mv.x, y: mv.y };
  }

  if (here && here.score > 0.3) {
    // Steady Aim before a shot taken from where you stand.
    if (here.intent.a === 'attack' && here.ranged && me.steadyAim && t.bonus && !t.moves && t.moveLeft >= speedOf(b, me) && here.why.o.mode !== 'advantage' && !threatened(b, me)) return { a: 'aim' };
    return here.intent;
  }

  // Action used: Action Surge for another go.
  if (!t.action && !t.attacksLeft && me.actionSurge?.uses > 0 && !t.surged) {
    const w = weaponOptions(b, me);
    if (w.length && (foes.filter((f) => !down(f)).length > 1 || w.some((o) => o.why.T.hp > 6))) return { a: 'surge' };
  }

  // Done attacking and still in reach: step back (Cunning Action Disengage first).
  if (RANGED_STYLES.includes(style) && threatened(b, me) && t.moveLeft >= 5) {
    const free = b.effects.some((e) => e.type === 'disengage' && e.by === id);
    if (!free && t.bonus && (me.cunning || me.nimble)) return { a: 'disengage', bonus: true };
    const s = retreat(b, me);
    if (s && t.moves < 3) return { a: 'move', x: s.x, y: s.y };
  }

  // Couldn't reach anyone: Dash (monsters) and keep coming.
  if (t.action && !canAttackSomeone(b, me) && me.side === 'foe') return { a: 'dash' };
  if (t.moveLeft >= 5 && t.moves < 3 && !threatened(b, me) && (style === 'melee' || !t.action)) {
    const T = nearestTarget(b, me);
    if (T && cheb(me, T) > 1) {
      let best = null;
      for (const s of squaresWithin(b, me)) {
        const score = cheb(s, T) * 100 + s.feet + s.oas * 1000;
        if (!best || score < best.score) best = { ...s, score };
      }
      if (best && cheb(best, T) < cheb(me, T) && previewMove(b, id, best.x, best.y)) return { a: 'move', x: best.x, y: best.y };
    }
  }
  return { a: 'end' };
}

function canAttackSomeone(b, me) {
  return weaponOptions(b, me).length > 0;
}

// For a creature the AI plays: answer a pending prompt (Opportunity Attack or Shield).
export function aiReact(b) {
  const p = b.pending;
  if (!p) return null;
  if (p.kind === 'shield') return true;     // only asked when +5 AC would turn the hit into a miss
  return true;
}

// The Coach: the same choice, explained in plain words for a player.
export function coach(b, id) {
  const intent = aiNext(b, id);
  if (!intent) return null;
  const me = b.creatures[id];
  const T = intent.target ? b.creatures[intent.target] : null;
  let text;
  switch (intent.a) {
    case 'attack': {
      const o = attackOptions(b, me, T).find((x) => x.atk.id === intent.attack);
      const pct = Math.round(o.p * 100);
      text = `Attack ${T.name} with your ${o.atk.name}: ${pct}% to hit`;
      if (o.mode === 'advantage') text += ', with Advantage';
      if (o.mode === 'disadvantage') text += ', but with Disadvantage';
      if (o.sneak) text += ', and Sneak Attack applies';
      if (o.cover) text += ` (${T.name} has Half Cover: +2 AC)`;
      text += '.';
      break;
    }
    case 'cast': {
      const s = SPELLS[intent.spell];
      const o = specialOptions(b, me).find((x) => x.intent.spell === intent.spell && x.intent.target === intent.target && x.intent.x === intent.x);
      const can = canCast(b, me, intent.spell);
      const lvl = s.level === 0 ? 'a cantrip, free to cast' : can.pay === 'free' ? (me.casting.known[intent.spell].perDay ? 'a daily use' : 'your free Magic Initiate cast') : `uses a level ${can.slot} spell slot`;
      const conc = s.conc ? ' It needs Concentration.' : '';
      if (s.kind === 'heal') text = `${T.name} needs help: cast ${s.name} (${lvl}${s.time === 'bonus' ? ', a Bonus Action' : ''}).`;
      else if (s.kind === 'stabilize') text = `${T.name} is dying! Cast ${s.name} to make them Stable (${lvl}).`;
      else if (s.kind === 'cone' || s.kind === 'cube') text = `Cast ${s.name}: it catches ${o?.why.foes.map((c) => c.name).join(' and ')} (${lvl}).`;
      else if (s.kind === 'save') text = `Cast ${s.name} on ${T.name}: it must beat DC ${o?.why.dc} on a ${s.save.toUpperCase()} save, so ${Math.round((o?.why.pFail || 0) * 100)}% it fails (${lvl}).`;
      else if (s.kind === 'missile') text = `Cast ${s.name} at ${T.name}: it never misses (${lvl}).`;
      else if (s.kind === 'buff') text = `Cast ${s.name} on your allies (${lvl}).${conc}`;
      else if (s.kind === 'cure') text = `Cast ${s.name} to end ${T.name}'s ${intent.cond} condition (${lvl}).`;
      else if (s.kind === 'teleport') text = `You're in an enemy's reach: Misty Step away (${lvl}). Teleporting doesn't provoke Opportunity Attacks.`;
      else if (s.kind === 'spiritual') text = `Cast ${s.name} next to ${T.name} (${lvl}, a Bonus Action). It keeps attacking on later turns.${conc}`;
      else if (s.kind === 'rays') text = `Cast ${s.name}: ${o?.why.n || 3} rays at ${T.name}, ${Math.round((o?.why.p || 0) * 100)}% each to hit (${lvl}).`;
      else text = `Cast ${s.name} at ${T.name}: ${Math.round((o?.why.p || 0) * 100)}% to hit (${lvl}).`;
      break;
    }
    case 'breath': text = 'Use your Breath Weapon: it replaces one attack and catches everything in the cone.'; break;
    case 'move': {
      const near = enemiesOf(b, me).filter((e) => !incap(e)).sort((p, q) => cheb(p, intent) - cheb(q, intent))[0];
      const pv = previewMove(b, id, intent.x, intent.y);
      text = near && cheb(near, intent) <= 1 ? `Move next to ${near.name} (${pv?.feet ?? '?'} ft).` : `Move to the marked square (${pv?.feet ?? '?'} ft).`;
      if (me.ai === 'skirmisher' && near && cheb(near, intent) <= 1) text += ' A friend is next to it, so Sneak Attack will work.';
      break;
    }
    case 'stand': text = "You're Prone: stand up first (it costs half your Speed)."; break;
    case 'second-wind': text = "You're badly hurt: use Second Wind (Bonus Action) to heal."; break;
    case 'stabilize': text = `${T.name} is dying! Use your action to stabilize them (DC 10 Medicine).`; break;
    case 'nimble': case 'disengage': text = 'Disengage, then move away without provoking Opportunity Attacks.'; break;
    case 'dash': text = 'Dash to cover more ground.'; break;
    case 'surge': text = 'Use Action Surge: one more action this turn.'; break;
    case 'aim': text = "Use Steady Aim (Bonus Action): Advantage on your next attack, but you can't move this turn."; break;
    case 'cut': text = "You're caught in a web: attack it to break free (AC 10, 5 HP)."; break;
    case 'escape': text = "You're Grappled: use your action to escape (Athletics or Acrobatics)."; break;
    case 'spark': text = T.side === me.side ? `Use Divine Spark to heal ${T.name}.` : `Use Divine Spark on ${T.name}: Radiant damage, half on a Constitution save.`; break;
    case 'turn': text = 'Turn Undead: the Undead near you must flee.'; break;
    case 'preserve': text = 'Use Preserve Life to heal your Bloodied allies.'; break;
    case 'spiritual': text = `Your Spiritual Weapon attacks ${T.name} (Bonus Action).`; break;
    case 'web': text = `Web ${T.name}.`; break;
    case 'end': text = "You've done what you can: end your turn."; break;
    default: text = '';
  }
  return { intent, text };
}

export { onBoard, key, pathFrom, seenBy };
