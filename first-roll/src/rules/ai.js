// Decision-making for monsters and AI companions. aiNext returns
// one intent at a time; it plays by exactly the same rules as a person
// because its intents go through combat.perform like anyone else's.
//
// Styles:  melee       close in and hit the nearest enemy
//          skirmisher  (Rogue) set up Sneak Attack, otherwise shoot from where you are
//          archer      keep away, Nimble Escape out of melee, shoot
//          caster      (Wizard) stay back, pick the best spell or cantrip
//          support     (Cleric) heal whoever is in trouble, then attack with spells

import { cheb, incap, reachMap, canEndAt, pathFrom, key, onBoard } from './grid.js';
import {
  attackOptions, enemiesOf, alliesOf, previewMove, canCast, canAttack, spellAttack, spellDC,
  attackFactors, hitChance, hitBonus, saveChance, coneTargets, spellMod,
} from './combat.js';
import { SPELLS } from './data.js';
import { avgDice } from './rng.js';

const targetsOf = (b, me) => {
  const all = enemiesOf(b, me);
  const up = all.filter((e) => !incap(e));
  return up.length ? up : all;           // only beat on the fallen when nobody else is left
};
const threatened = (b, me) => enemiesOf(b, me).some((e) => !incap(e) && cheb(e, me) <= 1);
const finishing = (T, avg) => (T.hp <= avg ? 2 : 0) - (incap(T) ? 3 : 0);

function bestAttackHere(b, me, { kind = null } = {}) {
  if (!canAttack(b.turn)) return null;
  let best = null;
  for (const T of targetsOf(b, me)) {
    for (const o of attackOptions(b, me, T)) {
      if (!o.ok || (kind && o.atk.kind !== kind)) continue;
      const score = o.expected + finishing(T, o.avg);
      if (!best || score > best.score) best = { intent: { a: 'attack', target: T.id, attack: o.atk.id }, T, o, score };
    }
  }
  return best;
}

// Every spell and special option the creature has right now, scored by
// expected damage (or how badly a friend needs help). Leveled spells pay a
// small penalty so cantrips are preferred when they're nearly as good.
export function specialOptions(b, me) {
  const out = [];
  const t = b.turn;
  const add = (intent, score, why) => out.push({ intent, score, why });
  const friends = [me, ...alliesOf(b, me)];
  for (const [sid, k] of Object.entries(me.casting?.known || {})) {
    const s = SPELLS[sid];
    const can = canCast(b, me, sid);
    if (!can.ok) continue;
    const cost = can.pay === 'slot' ? 3 : can.pay === 'free' ? 1.5 : 0;
    if (s.kind === 'attack') {
      const atk = spellAttack(me, sid);
      for (const T of targetsOf(b, me)) {
        if (cheb(me, T) * 5 > s.range) continue;
        const f = attackFactors(b, me, T, atk);
        const avg = avgDice(s.dice) + (me.firesBurn?.uses ? 5.5 : 0);
        const exp = hitChance(hitBonus(atk), T.ac, f.mode, me.luck) * avg;
        add({ a: 'cast', spell: sid, target: T.id }, exp + finishing(T, avg) - cost + (s.rider === 'guided' ? 1.5 : 0), { T, p: hitChance(hitBonus(atk), T.ac, f.mode, me.luck), mode: f.mode });
      }
    } else if (s.kind === 'save') {
      const dc = spellDC(me, sid);
      for (const T of targetsOf(b, me)) {
        if (cheb(me, T) * 5 > s.range) continue;
        const pFail = 1 - saveChance(b, T, s.save, dc);
        add({ a: 'cast', spell: sid, target: T.id }, pFail * avgDice(s.dice) + finishing(T, avgDice(s.dice)) - cost, { T, pFail, dc });
      }
    } else if (s.kind === 'missile') {
      const avg = s.darts * (avgDice(s.dice) + s.flat);
      for (const T of targetsOf(b, me)) {
        if (cheb(me, T) * 5 > s.range) continue;
        add({ a: 'cast', spell: sid, target: T.id }, avg + finishing(T, avg) * 2 - cost, { T });
      }
    } else if (s.kind === 'cone') {
      for (const T of targetsOf(b, me)) {
        const hit = coneTargets(b, me, T.x, T.y);
        const foes = hit.filter((c) => c.side !== me.side && !incap(c));
        const pals = hit.filter((c) => c.side === me.side);
        if (foes.length < 2 || pals.length) continue;
        const dc = spellDC(me, sid);
        const exp = foes.reduce((acc, c) => acc + avgDice(s.dice) * (1 - saveChance(b, c, s.save, dc) / 2), 0);
        add({ a: 'cast', spell: sid, x: T.x, y: T.y }, exp - cost, { foes, pals });
      }
    } else if (s.kind === 'heal') {
      for (const F of friends) {
        if (F.dead || cheb(me, F) * 5 > s.range) continue;
        const need = F.hp <= 0 ? 20 : F.hp <= F.hpMax / 3 ? 9 : 0;
        if (need) add({ a: 'cast', spell: sid, target: F.id }, need + (s.time === 'bonus' ? 2 : 0) - cost, { T: F, heal: avgDice(s.dice) + spellMod(me, sid) });
      }
    } else if (s.kind === 'stabilize') {
      for (const F of alliesOf(b, me)) {
        if (F.hp <= 0 && !F.stable && !F.dead && cheb(me, F) * 5 <= s.range) add({ a: 'cast', spell: sid, target: F.id }, 12, { T: F });
      }
    }
  }
  if (me.breath?.uses > 0 && canAttack(t)) {
    for (const T of targetsOf(b, me)) {
      const hit = coneTargets(b, me, T.x, T.y);
      const foes = hit.filter((c) => c.side !== me.side && !incap(c));
      if (!foes.length || hit.some((c) => c.side === me.side)) continue;
      const dc = me.breath.dc.reduce((s, p) => s + p.value, 0);
      const exp = foes.reduce((acc, c) => acc + avgDice(me.breath.dice) * (1 - saveChance(b, c, 'dex', dc) / 2), 0);
      add({ a: 'breath', x: T.x, y: T.y }, exp + (foes.length > 1 ? 2 : -2), { foes });
    }
  }
  out.sort((p, q) => q.score - p.score);
  return out;
}

function squaresWithin(b, me) {
  const map = reachMap(b, me, b.turn.moveLeft);
  const out = [];
  for (const [k, feet] of map.dist) {
    const [x, y] = k.split(',').map(Number);
    if (feet > 0 && canEndAt(b, me, x, y)) out.push({ x, y, feet });
  }
  return out;
}

// Move toward a target: adjacent if reachable this turn, else as close as possible.
function approach(b, me, T, { avoidOA = false } = {}) {
  let best = null;
  for (const s of squaresWithin(b, me)) {
    const d = cheb(s, T);
    const pv = avoidOA ? previewMove(b, me.id, s.x, s.y) : null;
    const risk = pv ? pv.oas.length : 0;
    const score = d * 100 + s.feet + risk * 1000;
    if (!best || score < best.score) best = { ...s, score, d };
  }
  if (!best || best.d >= cheb(me, T)) return null;
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

// Best thing to do with the action from here: weapon or special.
function bestAction(b, me, { kind = null } = {}) {
  const w = bestAttackHere(b, me, { kind });
  const s = specialOptions(b, me).filter((o) => o.intent.a !== 'cast' || SPELLS[o.intent.spell].time === 'action' || o.intent.a === 'breath')[0];
  if (s && (!w || s.score > w.score)) return s;
  return w;
}

export function aiNext(b, id) {
  const me = b.creatures[id];
  const t = b.turn;
  if (!t || t.who !== id || b.over || b.pending) return null;
  if (incap(me) || t.steps > 10) return { a: 'end' };
  const foes = targetsOf(b, me);
  if (!foes.length) return { a: 'end' };

  // Bonus actions first: Second Wind when badly hurt, Healing Word when a friend needs it.
  if (me.secondWind?.uses > 0 && t.bonus && me.hp <= me.hpMax / 2) return { a: 'second-wind' };
  if (t.bonus) {
    const heal = specialOptions(b, me).find((o) => o.intent.a === 'cast' && SPELLS[o.intent.spell].time === 'bonus' && o.score >= 8);
    if (heal) return heal.intent;
  }

  // Heroes look after a dying friend if they can.
  if (me.side === 'hero' && t.action) {
    const dying = alliesOf(b, me).find((a) => a.hp <= 0 && !a.dead && !a.stable);
    if (dying) {
      const spell = specialOptions(b, me).find((o) => o.intent.target === dying.id && o.score >= 12);
      if (spell) return spell.intent;
      if (cheb(me, dying) <= 1) return { a: 'stabilize', target: dying.id };
      if (!t.moves) {
        const s = approach(b, me, dying, { avoidOA: true });
        if (s && s.d <= 1) return { a: 'move', x: s.x, y: s.y };
      }
    }
  }

  if (me.ai === 'caster' || me.ai === 'support') {
    if (canAttack(t)) {
      const best = bestAction(b, me);
      if (best && best.score > 0.5) return best.intent;
    }
    // Nothing worth doing from here: close in (casters) to get in range.
    if (!t.moves && t.moveLeft >= 5 && !threatened(b, me)) {
      const T = nearestTarget(b, me);
      const s = T && cheb(me, T) > 2 && approach(b, me, T, { avoidOA: true });
      if (s) return { a: 'move', x: s.x, y: s.y };
    }
    return { a: 'end' };
  }

  if (me.ai === 'archer') {
    if (threatened(b, me) && t.moveLeft >= 5 && !t.moves) {
      const free = b.effects.some((e) => e.type === 'disengage' && e.by === id);
      if (!free && me.nimble && t.bonus) return { a: 'nimble' };
      if (free) {
        let best = null;
        for (const s of squaresWithin(b, me)) {
          const near = Math.min(...enemiesOf(b, me).filter((e) => !incap(e)).map((e) => cheb(e, s)));
          const score = Math.min(near, 4) * 100 - s.feet;
          if (!best || score > best.score) best = { ...s, score };
        }
        if (best) return { a: 'move', x: best.x, y: best.y };
      }
    }
    if (canAttack(t)) {
      const shot = bestAttackHere(b, me, { kind: threatened(b, me) ? 'melee' : 'ranged' }) || bestAttackHere(b, me);
      if (shot) return shot.intent;
    }
    return { a: 'end' };
  }

  if (me.ai === 'skirmisher' && canAttack(t)) {
    // Already next to someone: stab them.
    const stab = bestAttackHere(b, me, { kind: 'melee' });
    if (stab) return stab.intent;
    // An enemy a friend is next to: get in for Sneak Attack, if it's safe.
    if (!t.moves) {
      for (const T of foes) {
        if (incap(T)) continue;
        if (!alliesOf(b, me).some((a) => !incap(a) && cheb(a, T) <= 1)) continue;
        const s = approach(b, me, T, { avoidOA: true });
        if (s && s.d <= 1) {
          const pv = previewMove(b, id, s.x, s.y);
          if (pv && !pv.oas.length) return { a: 'move', x: s.x, y: s.y };
        }
      }
    }
    const shot = bestAction(b, me, { kind: 'ranged' });
    if (shot) return shot.intent;
    return { a: 'end' };
  }

  // melee
  if (canAttack(t)) {
    const special = specialOptions(b, me).find((o) => o.intent.a === 'breath' && o.score > 6);
    if (special) return special.intent;
    const hit = bestAttackHere(b, me, { kind: 'melee' });
    if (hit) return hit.intent;
  }
  if (!t.moves && t.moveLeft >= 5 && !threatened(b, me)) {
    const T = nearestTarget(b, me);
    const s = T && approach(b, me, T);
    if (s) return { a: 'move', x: s.x, y: s.y };
  }
  if (canAttack(t)) {
    const any = bestAction(b, me);
    if (any && any.score > 0.5) return any.intent;
    if (me.side === 'foe' && !t.moves && t.action) return { a: 'dash' };
  }
  return { a: 'end' };
}

export { onBoard, key, pathFrom };
