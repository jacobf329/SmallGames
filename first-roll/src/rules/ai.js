// Decision-making for monsters, AI companions and the Coach. aiNext returns
// one intent at a time; it plays by exactly the same rules as a person
// because its intents go through combat.perform like anyone else's.
//
// Styles:  melee       close in and hit the nearest enemy
//          skirmisher  (Rogue) set up Sneak Attack: stab what an ally is
//                      next to, otherwise shoot from where you are
//          archer      keep away, Nimble Escape out of melee, shoot

import { cheb, incap, reachMap, canEndAt, pathFrom, key, onBoard } from './grid.js';
import { attackOptions, enemiesOf, alliesOf, previewMove } from './combat.js';

const targetsOf = (b, me) => {
  const all = enemiesOf(b, me);
  const up = all.filter((e) => !incap(e));
  return up.length ? up : all;           // only beat on the fallen when nobody else is left
};

function bestAttackHere(b, me, { kind = null } = {}) {
  let best = null;
  for (const T of targetsOf(b, me)) {
    for (const o of attackOptions(b, me, T)) {
      if (!o.ok || (kind && o.atk.kind !== kind)) continue;
      const score = o.expected + (T.hp <= o.avg ? 2 : 0) - (incap(T) ? 3 : 0);
      if (!best || score > best.score) best = { T, o, score };
    }
  }
  return best;
}

const threatened = (b, me) => enemiesOf(b, me).some((e) => !incap(e) && cheb(e, me) <= 1);

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

export function aiNext(b, id) {
  const me = b.creatures[id];
  const t = b.turn;
  if (!t || t.who !== id || b.over || b.pending) return null;
  if (incap(me) || t.steps > 8) return { a: 'end' };
  const foes = targetsOf(b, me);
  if (!foes.length) return { a: 'end' };

  // Second Wind when badly hurt.
  if (me.secondWind?.uses > 0 && t.bonus && me.hp <= me.hpMax / 2) return { a: 'second-wind' };

  // Heroes look after a dying friend first if they can reach them.
  if (me.side === 'hero' && t.action) {
    const dying = alliesOf(b, me).find((a) => a.hp <= 0 && !a.dead && !a.stable);
    if (dying) {
      if (cheb(me, dying) <= 1) return { a: 'stabilize', target: dying.id };
      if (!t.moves) {
        const s = approach(b, me, dying, { avoidOA: true });
        if (s && s.d <= 1) return { a: 'move', x: s.x, y: s.y };
      }
    }
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
    if (t.action) {
      const shot = bestAttackHere(b, me, { kind: threatened(b, me) ? 'melee' : 'ranged' }) || bestAttackHere(b, me);
      if (shot) return { a: 'attack', target: shot.T.id, attack: shot.o.atk.id };
    }
    return { a: 'end' };
  }

  if (me.ai === 'skirmisher' && t.action) {
    // Already next to someone: stab them.
    const stab = bestAttackHere(b, me, { kind: 'melee' });
    if (stab) return { a: 'attack', target: stab.T.id, attack: stab.o.atk.id };
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
    const shot = bestAttackHere(b, me, { kind: 'ranged' });
    if (shot) return { a: 'attack', target: shot.T.id, attack: shot.o.atk.id };
    return { a: 'end' };
  }

  // melee
  if (t.action) {
    const hit = bestAttackHere(b, me, { kind: 'melee' });
    if (hit) return { a: 'attack', target: hit.T.id, attack: hit.o.atk.id };
  }
  if (!t.moves && t.moveLeft >= 5 && !threatened(b, me)) {
    const T = nearestTarget(b, me);
    const s = T && approach(b, me, T);
    if (s) return { a: 'move', x: s.x, y: s.y };
  }
  if (t.action) {
    const any = bestAttackHere(b, me);
    if (any) return { a: 'attack', target: any.T.id, attack: any.o.atk.id };
    if (me.side === 'foe' && !t.moves) return { a: 'dash' };
  }
  return { a: 'end' };
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
      text += '.';
      break;
    }
    case 'move': {
      const near = enemiesOf(b, me).filter((e) => !incap(e)).sort((p, q) => cheb(p, intent) - cheb(q, intent))[0];
      const pv = previewMove(b, id, intent.x, intent.y);
      text = near && cheb(near, intent) <= 1 ? `Move next to ${near.name} (${pv?.feet ?? '?'} ft).` : `Move to the marked square (${pv?.feet ?? '?'} ft).`;
      if (me.ai === 'skirmisher' && near) text += ' A friend is next to it, so Sneak Attack will work.';
      break;
    }
    case 'second-wind': text = "You're badly hurt: use Second Wind (Bonus Action) to heal."; break;
    case 'stabilize': text = `${T.name} is dying! Use your action to stabilize them (DC 10 Medicine).`; break;
    case 'nimble': text = 'Disengage, then move away.'; break;
    case 'dash': text = 'Dash to cover more ground.'; break;
    case 'end': text = "You've done what you can: end your turn."; break;
    default: text = '';
  }
  return { intent, text };
}

export { onBoard, key, pathFrom };
