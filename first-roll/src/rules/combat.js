// The combat rules engine. Pure: no DOM, no network, no clock. All state is
// one JSON-able battle object; every resolution is appended to battle.log as
// a record that says what was rolled, what was added and which rule applied.
// Those records are what the UI explains and what the room broadcasts.

import { makeRng, die, rollDice, sum, parseDice, avgDice } from './rng.js';
import {
  key, cheb, feetBetween, incap, hostile, onBoard, reachMap, canEndAt, pathFrom, FT,
} from './grid.js';
import { MASTERIES, signed } from './data.js';

// ------------------------------------------------------------- set-up ----

export function createBattle({ heroes, foes, walls = [], seed = 1 }) {
  const creatures = {};
  for (const c of [...heroes, ...foes]) creatures[c.id] = c;
  return {
    creatures, walls: [...walls], rng: makeRng(seed),
    order: [], idx: -1, round: 0, turn: null,
    effects: [], log: [], seq: 0,
    pending: null, moveCtx: null, over: null,
  };
}

function emit(b, r) {
  r.seq = ++b.seq;
  r.round = b.round;
  b.log.push(r);
  if (b.log.length > 400) b.log.splice(0, b.log.length - 400);
  return r;
}

const C = (b, id) => b.creatures[id];
export const current = (b) => (b.idx >= 0 ? b.creatures[b.order[b.idx]] : null);
const turnKey = (b) => `${b.round}:${b.idx}`;
const living = (b, side) => Object.values(b.creatures).filter((c) => c.side === side && c.hp > 0);
const enemiesOf = (b, c) => Object.values(b.creatures).filter((o) => hostile(o, c) && onBoard(o) && !o.dead);
const alliesOf = (b, c) => Object.values(b.creatures).filter((o) => o !== c && o.side === c.side && onBoard(o) && !o.dead);

// ----------------------------------------------------------- D20 Tests ----

export function modeFrom(adv, dis) {
  if (adv.length && dis.length) return 'normal';
  if (adv.length) return 'advantage';
  if (dis.length) return 'disadvantage';
  return 'normal';
}

// Roll the d20 for a D20 Test. Halfling Luck rerolls a 1.
function rollD20(b, who, mode) {
  const one = () => {
    const first = die(b.rng, 20);
    if (first === 1 && who.luck) return { v: die(b.rng, 20), luck: true };
    return { v: first, luck: false };
  };
  const a = one();
  const rolls = [a.v];
  const luck = a.luck ? 1 : 0;
  if (mode === 'normal') return { rolls, kept: a.v, mode, luck };
  const c = one();
  rolls.push(c.v);
  const kept = mode === 'advantage' ? Math.max(a.v, c.v) : Math.min(a.v, c.v);
  return { rolls, kept, mode, luck: luck + (c.luck ? 1 : 0) };
}

// ------------------------------------------------------------- attacks ----

export function attackRangeFeet(atk) {
  return atk.kind === 'ranged' ? atk.range : [5, 5];
}

export function inRange(A, T, atk) {
  const d = feetBetween(A, T);
  return d <= attackRangeFeet(atk)[1];
}

// Which effects give Advantage or Disadvantage on A attacking T with atk.
// Returns reasons and which one-shot effects the roll would use up.
export function attackFactors(b, A, T, atk) {
  const adv = [], dis = [], uses = [];
  let helpUsed = false;
  for (const e of b.effects) {
    if (e.type === 'vex' && e.by === A.id && e.target === T.id) {
      adv.push({ text: `Vex: ${A.name} hit ${T.name} with a Vex weapon`, rule: 'mastery-vex' });
      uses.push(e);
    } else if (e.type === 'helped' && e.target === T.id && !helpUsed && e.by !== A.id && C(b, e.by)?.side === A.side) {
      adv.push({ text: `${C(b, e.by).name} took the Help action`, rule: 'help' });
      uses.push(e);
      helpUsed = true;
    } else if (e.type === 'sap' && e.target === A.id) {
      dis.push({ text: `Sap: ${C(b, e.by).name} hit ${A.name} with a Sap weapon`, rule: 'mastery-sap' });
      uses.push(e);
    } else if (e.type === 'dodge' && e.by === T.id && !incap(T)) {
      dis.push({ text: `${T.name} is Dodging`, rule: 'dodge' });
    }
  }
  if (incap(T)) adv.push({ text: `${T.name} is Unconscious`, rule: 'unconscious' });
  if (atk.kind === 'ranged') {
    const near = enemiesOf(b, A).filter((e) => !incap(e) && cheb(e, A) <= 1);
    if (near.length) dis.push({ text: `Ranged attack with ${near[0].name} next to ${A.name}`, rule: 'ranged-in-melee' });
    if (feetBetween(A, T) > atk.range[0]) dis.push({ text: 'Target is beyond normal range', rule: 'long-range' });
  }
  return { adv, dis, uses, mode: modeFrom(adv, dis) };
}

// Chance an attack roll hits (nat 1 always misses, nat 20 always hits).
export function hitChance(bonus, ac, mode = 'normal', luck = false) {
  let p = Math.min(19, Math.max(1, 21 - (ac - bonus))) / 20;
  if (luck) p = p + p / 20;               // a 1 is rerolled
  if (mode === 'advantage') return 1 - (1 - p) ** 2;
  if (mode === 'disadvantage') return p * p;
  return p;
}

export const hitBonus = (atk) => sum(atk.hit.map((h) => h.value));

function sneakAllowed(b, A, T, atk, mode) {
  if (!A.sneak || A.sneakKey === turnKey(b)) return null;
  if (!(atk.finesse || atk.kind === 'ranged')) return null;
  if (mode === 'advantage') return 'You had Advantage';
  if (mode === 'disadvantage') return null;
  const buddy = alliesOf(b, A).find((o) => !incap(o) && cheb(o, T) <= 1);
  return buddy ? `${buddy.name} is next to ${T.name}` : null;
}

// Options for the UI and the AI: every attack A could make against T now.
export function attackOptions(b, A, T) {
  return A.attacks.map((atk) => {
    const f = attackFactors(b, A, T, atk);
    const ok = inRange(A, T, atk);
    const bonus = hitBonus(atk);
    const p = hitChance(bonus, T.ac, f.mode, A.luck);
    const sneak = sneakAllowed(b, A, T, atk, f.mode);
    let avg = avgDice(atk.dice) + sum(atk.dmgFlat.map((d) => d.value));
    if (sneak) avg += avgDice(A.sneak);
    if (atk.advDice && f.mode === 'advantage') avg += avgDice(atk.advDice);
    return { atk, ok, bonus, p, mode: f.mode, adv: f.adv, dis: f.dis, sneak, avg, expected: ok ? p * avg : 0 };
  });
}

function rollDamage(b, A, T, atk, crit, mode) {
  const { n, sides } = parseDice(atk.dice);
  const nd = crit ? n * 2 : n;
  const parts = [];
  let rolls = rollDice(b.rng, nd, sides);
  let savage = null;
  if (A.savage && A.savageKey !== turnKey(b)) {
    const again = rollDice(b.rng, nd, sides);
    savage = { first: rolls, second: again };
    if (sum(again) > sum(rolls)) rolls = again;
    A.savageKey = turnKey(b);
  }
  parts.push({
    label: `${atk.name} ${nd}d${sides}${crit ? ' (dice doubled: Critical Hit)' : ''}`,
    rolls, value: sum(rolls), rule: crit ? 'critical-hit' : 'damage',
    savage: savage ? `Savage Attacker: rolled ${savage.first.join('+')} and ${savage.second.join('+')}, kept the higher` : null,
  });
  for (const f of atk.dmgFlat) parts.push({ label: f.label, value: f.value, rule: f.rule });
  const sneakWhy = sneakAllowed(b, A, T, atk, mode);
  if (sneakWhy) {
    const s = parseDice(A.sneak);
    const sr = rollDice(b.rng, crit ? s.n * 2 : s.n, s.sides);
    parts.push({ label: `Sneak Attack ${crit ? s.n * 2 : s.n}d${s.sides} (${sneakWhy})`, rolls: sr, value: sum(sr), rule: 'sneak-attack' });
    A.sneakKey = turnKey(b);
  }
  if (atk.advDice && mode === 'advantage') {
    const s = parseDice(atk.advDice);
    const sr = rollDice(b.rng, crit ? s.n * 2 : s.n, s.sides);
    parts.push({ label: `Extra ${crit ? s.n * 2 : s.n}d${s.sides} (attacked with Advantage)`, rolls: sr, value: sum(sr), rule: 'stat-block' });
  }
  return { parts, total: Math.max(0, sum(parts.map((p) => p.value))), type: atk.type };
}

// Apply damage, handling 0 HP, death saves and instant death.
function applyDamage(b, T, amount, crit) {
  const before = T.hp;
  const out = { before, after: before, downed: false, dead: false, deathFail: 0 };
  if (amount <= 0) return out;
  if (T.hp > 0) {
    const left = T.hp - amount;
    if (left > 0) { T.hp = left; out.after = left; return out; }
    T.hp = 0;
    out.after = 0;
    if (T.side === 'foe') { T.dead = true; out.dead = true; return out; }
    if (-left >= T.hpMax) { T.dead = true; out.dead = true; out.massive = true; return out; }
    out.downed = true;
    T.deathSaves = { s: 0, f: 0 };
    T.stable = false;
    return out;
  }
  // Already at 0 HP: damage is a failed death save (two on a Critical Hit).
  if (T.side === 'hero' && !T.dead) {
    if (amount >= T.hpMax) { T.dead = true; out.dead = true; out.massive = true; return out; }
    T.stable = false;
    out.deathFail = crit ? 2 : 1;
    T.deathSaves.f += out.deathFail;
    if (T.deathSaves.f >= 3) { T.dead = true; out.dead = true; }
  }
  return out;
}

function attack(b, A, T, atk, { reaction = false } = {}) {
  const f = attackFactors(b, A, T, atk);
  b.effects = b.effects.filter((e) => !f.uses.includes(e));
  const d20 = rollD20(b, A, f.mode);
  const total = d20.kept + hitBonus(atk);
  let outcome;
  if (d20.kept === 20) outcome = 'crit';
  else if (d20.kept === 1) outcome = 'fumble';
  else outcome = total >= T.ac ? 'hit' : 'miss';
  const notes = [];
  if (outcome === 'hit' && incap(T) && cheb(A, T) <= 1) {
    outcome = 'crit';
    notes.push({ text: 'Any hit from within 5 feet on an Unconscious creature is a Critical Hit', rule: 'unconscious' });
  }
  const hit = outcome === 'hit' || outcome === 'crit';
  let damage = null, after = null, mastery = null;
  if (hit) {
    damage = rollDamage(b, A, T, atk, outcome === 'crit', f.mode);
    after = applyDamage(b, T, damage.total, outcome === 'crit');
    if (atk.mastery && !T.dead && T.hp > 0) {
      const ms = MASTERIES[atk.mastery];
      mastery = { name: ms.name, text: ms.text, rule: ms.rule };
      if (atk.mastery === 'vex') {
        b.effects = b.effects.filter((e) => !(e.type === 'vex' && e.by === A.id && e.target === T.id));
        const skip = current(b)?.id === A.id ? 1 : 0;
        b.effects.push({ type: 'vex', by: A.id, target: T.id, expires: { when: 'end', who: A.id, skip } });
      } else if (atk.mastery === 'sap') {
        b.effects = b.effects.filter((e) => !(e.type === 'sap' && e.target === T.id));
        b.effects.push({ type: 'sap', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
      }
    }
  }
  const verb = { crit: 'lands a Critical Hit on', hit: 'hits', miss: 'misses', fumble: 'misses' }[outcome];
  let text = `${A.name} ${verb} ${T.name} with ${atk.name}`;
  if (damage) text += ` for ${damage.total} ${damage.type} damage`;
  text += reaction ? ' (Opportunity Attack).' : '.';
  if (after?.dead) text += T.side === 'foe' ? ` ${T.name} is defeated.` : ` ${T.name} dies.`;
  else if (after?.downed) text += ` ${T.name} drops to 0 HP and falls Unconscious.`;
  else if (after?.deathFail) text += ` ${T.name} suffers ${after.deathFail} failed death save${after.deathFail > 1 ? 's' : ''}.`;
  emit(b, {
    kind: 'attack', by: A.id, target: T.id, weapon: atk.name, attackKind: atk.kind, reaction,
    d20: { ...d20, adv: f.adv, dis: f.dis }, mods: atk.hit, total, ac: T.ac, acParts: T.acParts,
    outcome, notes, damage, after, mastery, text,
    rule: reaction ? 'opportunity-attack' : 'attack-roll',
  });
  checkOver(b);
}

// ---------------------------------------------------------- the turn ----

function expire(b, when, who) {
  b.effects = b.effects.filter((e) => {
    if (e.expires.when !== when || e.expires.who !== who) return true;
    if (e.expires.skip > 0) { e.expires.skip--; return true; }
    return false;
  });
}

export function rollInitiative(b) {
  const entries = Object.values(b.creatures).map((c) => {
    const d20 = rollD20(b, c, 'normal');
    const mod = sum(c.initParts.map((p) => p.value));
    return { id: c.id, d20, parts: c.initParts, total: d20.kept + mod, dex: c.mods.dex };
  });
  entries.sort((p, q) => q.total - p.total || q.dex - p.dex
    || (C(b, p.id).side === 'hero' ? -1 : 1) - (C(b, q.id).side === 'hero' ? -1 : 1) || (p.id < q.id ? -1 : 1));
  b.order = entries.map((e) => e.id);
  b.round = 1;
  emit(b, { kind: 'initiative', entries, text: 'Everyone rolls Initiative.', rule: 'initiative' });
  b.idx = -1;
  nextTurn(b);
}

function startTurn(b, c) {
  expire(b, 'start', c.id);
  c.reaction = true;
  b.turn = { who: c.id, action: 1, bonus: 1, moveLeft: c.speed, moves: 0, steps: 0 };
  emit(b, { kind: 'turn', who: c.id, text: `${c.name}'s turn.`, rule: 'your-turn' });
}

function deathSave(b, c) {
  const d20 = rollD20(b, c, 'normal');
  const v = d20.kept;
  let outcome, text;
  if (v === 20) {
    c.hp = 1; c.deathSaves = { s: 0, f: 0 };
    outcome = 'revive'; text = `${c.name} rolls a 20 on a death save, regains 1 HP and gets back up.`;
  } else if (v === 1) {
    c.deathSaves.f += 2; outcome = 'fail2'; text = `${c.name} rolls a 1 on a death save: two failures.`;
  } else if (v >= 10) {
    c.deathSaves.s += 1; outcome = 'success'; text = `${c.name} succeeds on a death save.`;
  } else {
    c.deathSaves.f += 1; outcome = 'fail'; text = `${c.name} fails a death save.`;
  }
  if (c.deathSaves.f >= 3) { c.dead = true; text += ` That's three failures: ${c.name} dies.`; }
  else if (c.deathSaves.s >= 3) { c.stable = true; c.deathSaves = { s: 0, f: 0 }; text += ` Three successes: ${c.name} is Stable.`; }
  emit(b, { kind: 'save', save: 'death', by: c.id, d20, dc: 10, outcome, tally: { ...c.deathSaves }, text, rule: 'death-saves' });
  checkOver(b);
}

function nextTurn(b) {
  for (let guard = 0; guard < 50 && !b.over; guard++) {
    if (b.turn) expire(b, 'end', b.turn.who);
    b.idx = (b.idx + 1) % b.order.length;
    if (b.idx === 0) { if (b.begun) b.round++; b.begun = true; }
    const c = current(b);
    b.turn = null;
    if (c.dead) continue;
    startTurn(b, c);
    if (c.side === 'hero' && c.hp <= 0) {
      if (c.stable) {
        emit(b, { kind: 'note', by: c.id, text: `${c.name} is Stable but still Unconscious.`, rule: 'stable' });
        continue;
      }
      deathSave(b, c);
      if (c.hp > 0 || b.over) return;  // a 20 gets them back up, mid-turn
      continue;
    }
    return;
  }
}

function checkOver(b) {
  if (b.over) return;
  if (!living(b, 'foe').length) b.over = 'victory';
  else if (!living(b, 'hero').length) b.over = 'defeat';
  if (b.over) {
    b.pending = null;
    b.moveCtx = null;
    emit(b, {
      kind: 'end', outcome: b.over, rule: 'combat',
      text: b.over === 'victory' ? 'Victory! The goblins are defeated.' : 'Defeat. Every hero is down.',
    });
  }
}

// ----------------------------------------------------------- movement ----

// Hostile creatures whose reach the mover leaves by stepping from -> to.
export function provokers(b, M, from, to) {
  if (b.effects.some((e) => e.type === 'disengage' && e.by === M.id)) return [];
  return enemiesOf(b, M).filter((h) => !incap(h) && h.reaction
    && h.attacks.some((a) => a.kind === 'melee')
    && cheb(h, from) <= 1 && cheb(h, to) > 1);
}

// Path preview for the UI: route, cost and who would get an Opportunity Attack.
export function previewMove(b, id, x, y) {
  const M = C(b, id);
  if (!b.turn || b.turn.who !== id) return null;
  if (!canEndAt(b, M, x, y)) return null;
  const map = reachMap(b, M, b.turn.moveLeft);
  const path = pathFrom(map, M, x, y);
  if (!path) return null;
  const oas = [];
  let from = { x: M.x, y: M.y };
  for (const to of path) {
    for (const h of provokers(b, M, from, to)) if (!oas.includes(h.id)) oas.push(h.id);
    from = to;
  }
  return { path, feet: map.dist.get(key(x, y)), oas };
}

export function reachableSquares(b, id) {
  const M = C(b, id);
  if (!b.turn || b.turn.who !== id || b.turn.moveLeft < FT) return [];
  const map = reachMap(b, M, b.turn.moveLeft);
  const out = [];
  for (const [k, d] of map.dist) {
    const [x, y] = k.split(',').map(Number);
    if (d > 0 && canEndAt(b, M, x, y)) out.push({ x, y, feet: d });
  }
  return out;
}

function continueMove(b) {
  const ctx = b.moveCtx;
  const M = C(b, ctx.who);
  while (ctx.i < ctx.path.length && !b.over) {
    const to = ctx.path[ctx.i];
    const from = { x: M.x, y: M.y };
    const trig = provokers(b, M, from, to).filter((h) => !ctx.skip.includes(h.id));
    if (trig.length) {
      flushMove(b);
      b.pending = { kind: 'oa', reactor: trig[0].id, mover: M.id };
      emit(b, { kind: 'prompt', by: trig[0].id, target: M.id, text: `${M.name} is leaving ${trig[0].name}'s reach.`, rule: 'opportunity-attack' });
      return;
    }
    const occ = Object.values(b.creatures).some((o) => o !== M && onBoard(o) && o.x === to.x && o.y === to.y);
    const cost = occ ? 2 * FT : FT;
    M.x = to.x; M.y = to.y;
    b.turn.moveLeft -= cost;
    ctx.walked.push({ x: to.x, y: to.y });
    ctx.feet += cost;
    ctx.i++;
  }
  flushMove(b);
  b.moveCtx = null;
}

function flushMove(b) {
  const ctx = b.moveCtx;
  if (!ctx || !ctx.walked.length) return;
  const M = C(b, ctx.who);
  emit(b, { kind: 'move', by: M.id, path: ctx.walked, feet: ctx.feet, left: b.turn.moveLeft,
    text: `${M.name} moves ${ctx.feet} ft (${b.turn.moveLeft} ft left).`, rule: 'movement' });
  ctx.walked = [];
  ctx.feet = 0;
}

// The reactor's answer to a pending Opportunity Attack.
export function resolveReaction(b, accept) {
  const p = b.pending;
  if (!p) return [];
  const before = b.seq;
  b.pending = null;
  const R = C(b, p.reactor), M = C(b, p.mover);
  if (accept && !incap(R) && R.reaction) {
    const atk = bestMelee(b, R, M);
    R.reaction = false;
    attack(b, R, M, atk, { reaction: true });
  } else if (b.moveCtx) {
    b.moveCtx.skip.push(R.id);
    emit(b, { kind: 'note', by: R.id, text: `${R.name} lets ${M.name} go.`, rule: 'opportunity-attack' });
  }
  if (b.moveCtx && !b.over) {
    if (incap(M)) b.moveCtx = null;
    else continueMove(b);
  }
  return b.log.filter((r) => r.seq > before);
}

function bestMelee(b, A, T) {
  const opts = attackOptions(b, A, T).filter((o) => o.atk.kind === 'melee');
  opts.sort((p, q) => q.expected - p.expected);
  return opts[0].atk;
}

// -------------------------------------------------------------- intents ----

const fail = (error) => ({ ok: false, error });

export function perform(b, id, intent) {
  if (b.over) return fail('The fight is over.');
  if (b.pending) return fail('Waiting for a reaction.');
  const A = current(b);
  if (!A || A.id !== id) return fail("It isn't your turn.");
  const t = b.turn;
  const before = b.seq;
  const T = intent.target ? C(b, intent.target) : null;
  switch (intent.a) {
    case 'move': {
      const pv = previewMove(b, id, intent.x, intent.y);
      if (!pv) return fail("You can't move there.");
      t.moves++;
      b.moveCtx = { who: id, path: pv.path, i: 0, skip: [], walked: [], feet: 0 };
      continueMove(b);
      break;
    }
    case 'attack': {
      if (!t.action) return fail('You have already used your action.');
      if (!T || !onBoard(T) || T.dead || !hostile(A, T)) return fail('Pick an enemy to attack.');
      const atk = A.attacks.find((a) => a.id === intent.attack);
      if (!atk) return fail('Unknown attack.');
      if (!inRange(A, T, atk)) return fail(`${T.name} is out of range.`);
      t.action = 0;
      attack(b, A, T, atk);
      break;
    }
    case 'dash': {
      if (!t.action) return fail('You have already used your action.');
      t.action = 0;
      t.moveLeft += A.speed;
      emit(b, { kind: 'action', by: id, what: 'Dash', text: `${A.name} takes the Dash action: +${A.speed} ft of movement this turn.`, rule: 'dash' });
      break;
    }
    case 'disengage':
    case 'nimble': {
      const bonus = intent.a === 'nimble';
      if (bonus && (!A.nimble || !t.bonus)) return fail('No bonus action for that.');
      if (!bonus && !t.action) return fail('You have already used your action.');
      if (bonus) t.bonus = 0; else t.action = 0;
      b.effects.push({ type: 'disengage', by: id, expires: { when: 'end', who: id, skip: 0 } });
      emit(b, { kind: 'action', by: id, what: 'Disengage',
        text: `${A.name} takes the Disengage action${bonus ? ' as a Bonus Action (Nimble Escape)' : ''}: moving won't provoke Opportunity Attacks this turn.`,
        rule: bonus ? 'nimble-escape' : 'disengage' });
      break;
    }
    case 'dodge': {
      if (!t.action) return fail('You have already used your action.');
      t.action = 0;
      b.effects = b.effects.filter((e) => !(e.type === 'dodge' && e.by === id));
      b.effects.push({ type: 'dodge', by: id, expires: { when: 'start', who: id } });
      emit(b, { kind: 'action', by: id, what: 'Dodge', text: `${A.name} takes the Dodge action: attacks against them have Disadvantage until their next turn.`, rule: 'dodge' });
      break;
    }
    case 'help': {
      if (!t.action) return fail('You have already used your action.');
      if (!T || !hostile(A, T) || incap(T) || cheb(A, T) > 1) return fail('Help needs an enemy within 5 feet of you.');
      t.action = 0;
      b.effects.push({ type: 'helped', by: id, target: T.id, expires: { when: 'start', who: id } });
      emit(b, { kind: 'action', by: id, what: 'Help', target: T.id,
        text: `${A.name} takes the Help action: the next ally to attack ${T.name} has Advantage.`, rule: 'help' });
      break;
    }
    case 'stabilize': {
      if (!t.action) return fail('You have already used your action.');
      if (!T || T.side !== A.side || T.hp > 0 || T.dead || T.stable || cheb(A, T) > 1) return fail('Pick a dying ally next to you.');
      t.action = 0;
      const d20 = rollD20(b, A, 'normal');
      const mods = [{ label: 'Medicine (WIS)', value: A.skills.medicine, rule: 'skills' }];
      const total = d20.kept + A.skills.medicine;
      const ok = total >= 10;
      if (ok) { T.stable = true; T.deathSaves = { s: 0, f: 0 }; }
      emit(b, { kind: 'check', by: id, target: T.id, skill: 'Medicine', d20, mods, total, dc: 10, outcome: ok ? 'success' : 'fail',
        text: ok ? `${A.name} stabilizes ${T.name}.` : `${A.name} fails to stabilize ${T.name}.`, rule: 'stabilize' });
      break;
    }
    case 'second-wind': {
      if (!A.secondWind || A.secondWind.uses < 1) return fail('No uses of Second Wind left.');
      if (!t.bonus) return fail('You have already used your bonus action.');
      t.bonus = 0;
      A.secondWind.uses--;
      const r = die(b.rng, 10);
      const heal = r + A.level;
      const before = A.hp;
      A.hp = Math.min(A.hpMax, A.hp + heal);
      emit(b, { kind: 'heal', by: id, what: 'Second Wind',
        roll: { label: '1d10', rolls: [r] }, mods: [{ label: 'Fighter level', value: A.level }], total: heal, before, after: A.hp,
        text: `${A.name} uses Second Wind and regains ${A.hp - before} HP (${A.secondWind.uses} use${A.secondWind.uses === 1 ? '' : 's'} left).`, rule: 'second-wind' });
      break;
    }
    case 'end': {
      emit(b, { kind: 'end-turn', by: id, text: `${A.name} ends their turn.`, rule: 'your-turn' });
      nextTurn(b);
      break;
    }
    default:
      return fail('Unknown action.');
  }
  t.steps++;
  return { ok: true, records: b.log.filter((r) => r.seq > before) };
}

export { signed, enemiesOf, alliesOf };
