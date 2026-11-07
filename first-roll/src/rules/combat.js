// The combat rules engine. Pure: no DOM, no network, no clock. All state is
// one JSON-able battle object; every resolution is appended to battle.log as
// a record that says what was rolled, what was added and which rule applied.
// Those records are what the UI explains and what the room broadcasts.

import { makeRng, die, rollDice, sum, parseDice, avgDice } from './rng.js';
import {
  key, cheb, feetBetween, incap, hostile, onBoard, reachMap, canEndAt, pathFrom, coneSquares, FT,
} from './grid.js';
import { MASTERIES, SPELLS, ABILITY_NAMES, ITEMS, signed } from './data.js';

// ------------------------------------------------------------- set-up ----

export function createBattle({ heroes, foes, walls = [], seed = 1, potions = 0 }) {
  const creatures = {};
  for (const c of [...heroes, ...foes]) creatures[c.id] = c;
  return {
    creatures, walls: [...walls], rng: makeRng(seed),
    order: [], idx: -1, round: 0, turn: null,
    effects: [], log: [], seq: 0,
    pending: null, moveCtx: null, over: null, potions,
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
const sumParts = (parts) => sum(parts.map((p) => p.value));

// ----------------------------------------------------------- D20 Tests ----

export function modeFrom(adv, dis) {
  if (adv.length && dis.length) return 'normal';
  if (adv.length) return 'advantage';
  if (dis.length) return 'disadvantage';
  return 'normal';
}

// Roll the d20 for a D20 Test. Halfling Luck rerolls a 1.
export function rollD20(b, who, mode) {
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

// A saving throw: d20 + ability modifier (+ PB if proficient) vs a DC.
export function saveFactors(b, T, ability) {
  const adv = [], dis = [];
  if (ability === 'dex' && b.effects.some((e) => e.type === 'dodge' && e.by === T.id) && !incap(T)) adv.push({ text: `${T.name} is Dodging`, rule: 'dodge' });
  if (T.mentalSaveAdv && ['int', 'wis', 'cha'].includes(ability)) adv.push({ text: 'Gnomish Cunning', rule: 'saving-throws' });
  return { adv, dis, mode: modeFrom(adv, dis) };
}

export function saveChance(b, T, ability, dc) {
  const mod = T.saves?.[ability] ?? T.mods[ability];
  const f = saveFactors(b, T, ability);
  let p = Math.min(20, Math.max(0, 21 - (dc - mod))) / 20;   // saves have no automatic 1/20
  if (f.mode === 'advantage') p = 1 - (1 - p) ** 2;
  if (f.mode === 'disadvantage') p = p * p;
  return p;
}

function savingThrow(b, T, ability, dc) {
  const f = saveFactors(b, T, ability);
  // An Unconscious creature automatically fails Strength and Dexterity saves.
  if (incap(T) && (ability === 'str' || ability === 'dex')) {
    return { target: T.id, auto: 'fail', success: false, mods: [], total: 0, d20: null, note: 'Unconscious: automatically fails' };
  }
  const d20 = rollD20(b, T, f.mode);
  const mods = [{ label: `${ability.toUpperCase()} modifier`, value: T.mods[ability], rule: 'ability-modifier' }];
  if (T.saveProfs?.includes(ability)) mods.push({ label: 'Proficiency Bonus (proficient save)', value: T.pb, rule: 'proficiency' });
  if (T.gear?.cloak) mods.push({ label: 'Cloak of Protection', value: 1, rule: 'magic-item' });
  const total = d20.kept + sumParts(mods);
  return { target: T.id, d20: { ...d20, adv: f.adv, dis: f.dis }, mods, total, success: total >= dc };
}

// ------------------------------------------------------------- attacks ----

export function attackRangeFeet(atk) {
  return atk.kind === 'ranged' ? atk.range : [5, 5];
}

export function inRange(A, T, atk) {
  return feetBetween(A, T) <= attackRangeFeet(atk)[1];
}

// Which effects give Advantage or Disadvantage on A attacking T with atk.
// Returns reasons and which one-shot effects the roll would use up.
export function attackFactors(b, A, T, atk) {
  const adv = [], dis = [], uses = [];
  let helpUsed = false, guideUsed = false;
  for (const e of b.effects) {
    if (e.type === 'vex' && e.by === A.id && e.target === T.id) {
      adv.push({ text: `Vex: ${A.name} hit ${T.name} with a Vex weapon`, rule: 'mastery-vex' });
      uses.push(e);
    } else if (e.type === 'helped' && e.target === T.id && !helpUsed && e.by !== A.id && C(b, e.by)?.side === A.side) {
      adv.push({ text: `${C(b, e.by).name} took the Help action`, rule: 'help' });
      uses.push(e);
      helpUsed = true;
    } else if (e.type === 'guided' && e.target === T.id && !guideUsed) {
      adv.push({ text: `Guiding Bolt's light on ${T.name}`, rule: 'guiding-bolt' });
      uses.push(e);
      guideUsed = true;
    } else if (e.type === 'steady' && e.by === A.id) {
      adv.push({ text: 'Steady Aim', rule: 'steady-aim' });
      uses.push(e);
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

export const hitBonus = (atk) => sumParts(atk.hit);

function sneakAllowed(b, A, T, atk, mode) {
  if (!A.sneak || A.sneakKey === turnKey(b) || atk.spell) return null;
  if (!(atk.finesse || atk.kind === 'ranged')) return null;
  if (mode === 'advantage') return 'You had Advantage';
  if (mode === 'disadvantage') return null;
  const buddy = alliesOf(b, A).find((o) => !incap(o) && cheb(o, T) <= 1);
  return buddy ? `${buddy.name} is next to ${T.name}` : null;
}

// Options for the UI and the AI: every weapon attack A could make against T now.
export function attackOptions(b, A, T) {
  return A.attacks.map((atk) => optionFor(b, A, T, atk));
}

function optionFor(b, A, T, atk) {
  const f = attackFactors(b, A, T, atk);
  const ok = inRange(A, T, atk);
  const bonus = hitBonus(atk);
  const p = hitChance(bonus, T.ac, f.mode, A.luck);
  const sneak = sneakAllowed(b, A, T, atk, f.mode);
  let avg = avgDice(atk.dice) + sumParts(atk.dmgFlat);
  if (sneak) avg += avgDice(A.sneak);
  if (atk.advDice && f.mode === 'advantage') avg += avgDice(atk.advDice);
  return { atk, ok, bonus, p, mode: f.mode, adv: f.adv, dis: f.dis, sneak, avg, expected: ok ? p * avg : 0 };
}

function rollDamage(b, A, T, atk, crit, mode, miss = false) {
  const { n, sides } = parseDice(atk.dice);
  const nd = crit ? n * 2 : n;
  const parts = [];
  let rolls = rollDice(b.rng, nd, sides);
  let savage = null;
  if (A.savage && !atk.spell && A.savageKey !== turnKey(b)) {
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
  const extra = (label, dice, rule) => {
    const s = parseDice(dice);
    const k = crit ? s.n * 2 : s.n;
    const r = rollDice(b.rng, k, s.sides);
    parts.push({ label: `${label} ${k}d${s.sides}`, rolls: r, value: sum(r), rule });
  };
  const sneakWhy = sneakAllowed(b, A, T, atk, mode);
  if (sneakWhy) { extra(`Sneak Attack (${sneakWhy})`, A.sneak, 'sneak-attack'); A.sneakKey = turnKey(b); }
  if (atk.advDice && mode === 'advantage') extra('Extra (attacked with Advantage)', atk.advDice, 'stat-block');
  if (!miss && A.firesBurn?.uses > 0 && A.burnKey !== turnKey(b)) {
    extra("Fire's Burn (Fire)", '1d10', 'fires-burn');
    A.firesBurn.uses--;
    A.burnKey = turnKey(b);
  }
  return { parts, total: Math.max(0, sum(parts.map((p) => p.value))), type: atk.type };
}

// Apply damage, handling Temporary HP, 0 HP, death saves and instant death.
function applyDamage(b, T, amount, crit) {
  const before = T.hp;
  const out = { before, after: before, downed: false, dead: false, deathFail: 0 };
  if (amount <= 0) return out;
  if (T.tempHp > 0) {
    const soak = Math.min(T.tempHp, amount);
    T.tempHp -= soak;
    amount -= soak;
    out.temp = soak;
    if (amount <= 0) return out;
  }
  if (T.hp > 0) {
    const left = T.hp - amount;
    if (left > 0) { T.hp = left; out.after = left; return out; }
    T.hp = 0;
    out.after = 0;
    if (T.side === 'foe') { T.dead = true; out.dead = true; return out; }
    if (-left >= T.hpMax) { T.dead = true; out.dead = true; out.massive = true; return out; }
    if (T.relentless && !T.relentless.used) {
      T.relentless.used = true;
      T.hp = 1;
      out.after = 1;
      out.relentless = true;
      return out;
    }
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

function afterText(T, after) {
  if (!after) return '';
  if (after.dead) return T.side === 'foe' ? ` ${T.name} is defeated.` : ` ${T.name} dies.`;
  if (after.relentless) return ` ${T.name} drops to 1 HP instead of 0 (Relentless Endurance).`;
  if (after.downed) return ` ${T.name} drops to 0 HP and falls Unconscious.`;
  if (after.deathFail) return ` ${T.name} suffers ${after.deathFail} failed death save${after.deathFail > 1 ? 's' : ''}.`;
  return '';
}

// Goblin Boss's Redirect Attack: a goblin ally next to it takes its place.
function redirect(b, A, T) {
  if (!T.redirect || !T.reaction || incap(T)) return T;
  const ally = alliesOf(b, T).find((o) => !incap(o) && cheb(o, T) <= 1);
  if (!ally) return T;
  const tx = T.x, ty = T.y;
  T.x = ally.x; T.y = ally.y;
  ally.x = tx; ally.y = ty;
  T.reaction = false;
  emit(b, { kind: 'note', by: T.id, target: ally.id,
    text: `${T.name} uses its Reaction, Redirect Attack: it swaps places with ${ally.name}, who becomes the target.`, rule: 'redirect-attack' });
  return ally;
}

function attack(b, A, T0, atk, { reaction = false } = {}) {
  const T = redirect(b, A, T0);
  if (T !== T0 && !inRange(A, T, atk)) {
    emit(b, { kind: 'note', by: A.id, text: `${T.name} is out of reach: the attack is lost.`, rule: 'redirect-attack' });
    return;
  }
  const f = attackFactors(b, A, T, atk);
  b.effects = b.effects.filter((e) => !f.uses.includes(e));
  const d20 = rollD20(b, A, f.mode);
  const total = d20.kept + hitBonus(atk);
  let outcome;
  const critOn = atk.spell ? 20 : (A.critOn || 20);
  if (d20.kept >= critOn) outcome = 'crit';
  else if (d20.kept === 1) outcome = 'fumble';
  else outcome = total >= T.ac ? 'hit' : 'miss';
  const notes = [];
  if (outcome === 'hit' && incap(T) && cheb(A, T) <= 1) {
    outcome = 'crit';
    notes.push({ text: 'Any hit from within 5 feet on an Unconscious creature is a Critical Hit', rule: 'unconscious' });
  }
  if (outcome === 'crit' && d20.kept < 20) notes.push({ text: `Improved Critical: ${critOn} or higher is a Critical Hit`, rule: 'improved-critical' });
  const hit = outcome === 'hit' || outcome === 'crit';
  let damage = null, after = null, mastery = null, rider = null;
  if (hit) {
    damage = rollDamage(b, A, T, atk, outcome === 'crit', f.mode);
    after = applyDamage(b, T, damage.total, outcome === 'crit');
    const alive = !T.dead && T.hp > 0;
    if (atk.mastery && alive) {
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
    if (atk.rider === 'guided' && alive) {
      b.effects.push({ type: 'guided', by: A.id, target: T.id, expires: { when: 'end', who: A.id, skip: current(b)?.id === A.id ? 1 : 0 } });
      rider = { text: `The next attack roll against ${T.name} before the end of ${A.name}'s next turn has Advantage.`, rule: 'guiding-bolt' };
    }
    if (atk.rider === 'chill' && alive) {
      b.effects = b.effects.filter((e) => !(e.type === 'chill' && e.target === T.id));
      b.effects.push({ type: 'chill', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
      rider = { text: `${T.name}'s Speed drops by 10 feet until the start of ${A.name}'s next turn.`, rule: 'ray-of-frost' };
    }
  }
  if (!hit && atk.spell && SPELLS[atk.spell]?.level === 0 && A.potentCantrip) {
    const full = rollDamage(b, A, T, atk, false, f.mode, true);
    const half = Math.floor(full.total / 2);
    damage = { parts: [...full.parts, { label: 'Potent Cantrip: half damage on a miss', value: half - full.total, rule: 'potent-cantrip' }], total: half, type: full.type };
    after = applyDamage(b, T, half, false);
  }
  const verb = { crit: 'lands a Critical Hit on', hit: 'hits', miss: 'misses', fumble: 'misses' }[outcome];
  let text = `${A.name} ${verb} ${T.name} with ${atk.name}`;
  if (damage) text += ` for ${damage.total} ${damage.type} damage`;
  text += reaction ? ' (Opportunity Attack).' : '.';
  text += afterText(T, after);
  emit(b, {
    kind: 'attack', by: A.id, target: T.id, weapon: atk.name, attackKind: atk.kind, spell: atk.spell || null, reaction,
    d20: { ...d20, adv: f.adv, dis: f.dis }, mods: atk.hit, total, ac: T.ac, acParts: T.acParts,
    outcome, notes, damage, after, mastery, rider, text,
    rule: reaction ? 'opportunity-attack' : atk.spell ? 'spell-attack' : 'attack-roll',
  });
  checkOver(b);
}

// ---------------------------------------------------------------- spells ----

export function spellAttack(A, sid) {
  const s = SPELLS[sid];
  const k = A.casting.known[sid];
  return {
    id: sid, name: s.name, kind: 'ranged', dice: s.dice, type: s.type, range: [s.range, s.range],
    hit: A.casting.stats[k.ability].attack, dmgFlat: [], spell: sid, rider: s.rider || null, finesse: false,
  };
}

export const spellDC = (A, sid) => sumParts(A.casting.stats[A.casting.known[sid].ability].dc);
export const spellMod = (A, sid) => A.mods[A.casting.known[sid].ability];

// Can A cast this spell right now? Returns { ok, error, pay: 'free'|'slot'|null }.
export function canCast(b, A, sid) {
  const k = A.casting?.known?.[sid];
  const s = SPELLS[sid];
  if (!k || !s) return { ok: false, error: "You don't know that spell." };
  if (s.kind === 'utility') return { ok: false, error: `${s.name} is for outside of fights.` };
  const t = b.turn;
  if (s.time === 'bonus' ? !t.bonus : !t.action) return { ok: false, error: `You have already used your ${s.time === 'bonus' ? 'Bonus Action' : 'action'}.` };
  if (s.level === 0) return { ok: true, pay: null };
  if (k.free > 0) return { ok: true, pay: 'free' };
  if (t.slotSpent) return { ok: false, error: 'You can expend only one spell slot per turn.' };
  const sl = k.slot ? slotLevelFor(A, s.level) : null;
  if (!sl) return { ok: false, error: `No level ${s.level}+ spell slots left.` };
  return { ok: true, pay: 'slot', slotLevel: sl };
}

// The lowest spell slot of at least this level that's still available.
export function slotLevelFor(A, level) {
  const slots = A.casting?.slots || {};
  for (const l of Object.keys(slots).map(Number).sort((a, b) => a - b)) if (l >= level && slots[l].left > 0) return l;
  return null;
}
export const slotsLeft = (A) => Object.values(A.casting?.slots || {}).reduce((n, s) => n + s.left, 0);

// Creatures in a 15-ft Cone from A aimed at (x, y).
export function coneTargets(b, A, x, y, size = 3) {
  const sq = coneSquares(A, { x, y }, size);
  return Object.values(b.creatures).filter((c) => c !== A && onBoard(c) && !c.dead && sq.some((s) => s.x === c.x && s.y === c.y));
}

// Area damage with a saving throw (Burning Hands, Sacred Flame, Breath Weapon).
function areaSave(b, A, targets, { name, ability, dcParts, dice, flat = 0, type, half, rule }) {
  const dc = sumParts(dcParts);
  const { n, sides } = parseDice(dice);
  const rolls = rollDice(b.rng, n, sides);
  const full = sum(rolls) + flat;
  const results = [];
  for (const T of targets) {
    const sv = savingThrow(b, T, ability, dc);
    const dmg = sv.success ? (half ? Math.floor(full / 2) : 0) : full;
    const after = applyDamage(b, T, dmg, false);
    results.push({ ...sv, damage: dmg, after, text: `${T.name} ${sv.success ? 'succeeds' : 'fails'}${sv.auto ? ' automatically' : ` (${sv.total})`}: ${dmg} damage.${afterText(T, after)}` });
  }
  const hits = results.map((r) => `${C(b, r.target).name} ${r.damage}`).join(', ');
  emit(b, {
    kind: 'save-spell', by: A.id, what: name, ability, dc, dcParts,
    damage: { parts: [{ label: `${name} ${dice}`, rolls, value: sum(rolls), rule }, ...(flat ? [{ label: 'Modifier', value: flat }] : [])], total: full, type },
    half, results, rule,
    text: targets.length ? `${A.name} uses ${name}: DC ${dc} ${ABILITY_NAMES[ability]} save. ${hits ? `Damage: ${hits}.` : ''}` : `${A.name} uses ${name}, but nobody is caught in it.`,
  });
  checkOver(b);
}

function castSpell(b, A, intent) {
  const sid = intent.spell;
  const s = SPELLS[sid];
  const can = canCast(b, A, sid);
  if (!can.ok) return can.error;
  const T = intent.target ? C(b, intent.target) : null;
  const inReach = (X) => X && feetBetween(A, X) <= (s.range || 0);
  // Target checks first, so a bad tap never costs a slot.
  if (['attack', 'save', 'missile', 'rays'].includes(s.kind)) {
    if (!T || !hostile(A, T) || !onBoard(T) || T.dead) return 'Pick an enemy.';
    if (!inReach(T)) return `${T.name} is out of range (${s.range} ft).`;
  } else if (s.kind === 'heal') {
    if (!T || T.side !== A.side || T.dead) return 'Pick an ally (or yourself).';
    if (!inReach(T) && T !== A) return `${T.name} is out of range (${s.range === 5 ? 'touch' : `${s.range} ft`}).`;
  } else if (s.kind === 'stabilize') {
    if (!T || T.side !== A.side || T.hp > 0 || T.dead || T.stable) return 'Pick a dying ally.';
    if (!inReach(T)) return `${T.name} is out of range (${s.range} ft).`;
  } else if (s.kind === 'cone') {
    if (!Number.isInteger(intent.x) || !Number.isInteger(intent.y) || (intent.x === A.x && intent.y === A.y)) return 'Pick a direction.';
  } else if (s.kind === 'teleport') {
    if (!canEndAt(b, A, intent.x, intent.y) || (intent.x === A.x && intent.y === A.y)) return 'Pick an empty square.';
    if (feetBetween(A, intent) > s.range) return `That's more than ${s.range} feet away.`;
  }
  // Pay.
  const t = b.turn;
  if (s.time === 'bonus') t.bonus = 0; else t.action = 0;
  let paid = '';
  if (can.pay === 'free') { A.casting.known[sid].free--; paid = ' (free cast: Magic Initiate)'; }
  if (can.pay === 'slot') {
    A.casting.slots[can.slotLevel].left--;
    t.slotSpent = true;
    paid = ` (level ${can.slotLevel} slot${can.slotLevel > s.level ? ', cast at a higher level' : ''}, ${slotsLeft(A)} slot${slotsLeft(A) === 1 ? '' : 's'} left)`;
  }
  emit(b, { kind: 'cast', by: A.id, spell: sid, level: s.level, pay: can.pay, rule: s.level ? 'spell-slots' : 'cantrips',
    text: `${A.name} casts ${s.name}${s.level === 0 ? ' (a cantrip: no slot needed)' : paid}.` });

  if (s.kind === 'attack') attack(b, A, T, spellAttack(A, sid));
  else if (s.kind === 'save') {
    areaSave(b, A, [T], { name: s.name, ability: s.save, dcParts: A.casting.stats[A.casting.known[sid].ability].dc, dice: s.dice, type: s.type, half: !!s.half, rule: sid });
  } else if (s.kind === 'cone') {
    areaSave(b, A, coneTargets(b, A, intent.x, intent.y), { name: s.name, ability: s.save, dcParts: A.casting.stats[A.casting.known[sid].ability].dc, dice: s.dice, type: s.type, half: !!s.half, rule: sid });
  } else if (s.kind === 'missile') {
    const darts = [];
    for (let i = 0; i < s.darts; i++) {
      const r = rollDice(b.rng, 1, parseDice(s.dice).sides);
      darts.push({ rolls: r, value: r[0] + s.flat });
    }
    const total = sum(darts.map((d) => d.value));
    const after = applyDamage(b, T, total, false);
    emit(b, { kind: 'missile', by: A.id, target: T.id, darts, total, type: s.type, after, rule: 'magic-missile',
      text: `${s.darts} darts hit ${T.name} for ${total} Force damage.${afterText(T, after)}` });
    checkOver(b);
  } else if (s.kind === 'heal') {
    const { n, sides } = parseDice(s.dice);
    const rolls = rollDice(b.rng, n, sides);
    const mod = spellMod(A, sid);
    const mods = [{ label: 'Spellcasting modifier', value: mod }];
    if (A.discipleOfLife) mods.push({ label: 'Disciple of Life', value: 2 + s.level, rule: 'disciple-of-life' });
    const amount = Math.max(0, sum(rolls) + sumParts(mods));
    const before = T.hp;
    T.hp = Math.min(T.hpMax, T.hp + amount);
    if (before === 0 && T.hp > 0) { T.deathSaves = { s: 0, f: 0 }; T.stable = false; }
    emit(b, { kind: 'heal', by: A.id, target: T.id, what: s.name,
      roll: { label: s.dice, rolls }, mods, total: amount, before, after: T.hp,
      text: `${T.name} regains ${T.hp - before} HP${before === 0 ? ' and is back on their feet' : ''}.`, rule: sid });
  } else if (s.kind === 'rays') {
    for (let i = 0; i < s.rays && !b.over; i++) {
      let tgt = T;
      if (tgt.dead || tgt.hp <= 0) tgt = enemiesOf(b, A).filter((e) => !incap(e) && feetBetween(A, e) <= s.range).sort((p, q) => cheb(A, p) - cheb(A, q))[0];
      if (!tgt) break;
      attack(b, A, tgt, { ...spellAttack(A, sid), name: `${s.name} (ray ${i + 1})` });
    }
  } else if (s.kind === 'aid') {
    const pick = [A, ...alliesOf(b, A).filter((c) => !c.dead && feetBetween(A, c) <= s.range)]
      .sort((p, q) => (p.hp > 0) - (q.hp > 0) || p.hp / p.hpMax - q.hp / q.hpMax).slice(0, 3);
    const want = (intent.targets || []).map((id) => C(b, id)).filter((c) => c && pick.includes(c));
    const chosen = want.length ? want : pick;
    for (const c of chosen) {
      c.hpMax += s.amount;
      c.hp += s.amount;
      c.aidBonus = (c.aidBonus || 0) + s.amount;
      if (c.hp > 0 && c.deathSaves) { c.deathSaves = { s: 0, f: 0 }; c.stable = false; }
    }
    emit(b, { kind: 'note', by: A.id, rule: 'aid', text: `${chosen.map((c) => c.name).join(', ')} gain${chosen.length === 1 ? 's' : ''} 5 Hit Points and 5 to their maximum.` });
  } else if (s.kind === 'teleport') {
    const from = { x: A.x, y: A.y };
    A.x = intent.x; A.y = intent.y;
    emit(b, { kind: 'move', by: A.id, path: [{ x: A.x, y: A.y }], feet: feetBetween(from, A), left: t.moveLeft, teleport: true, rule: 'misty-step',
      text: `${A.name} vanishes in silver mist and reappears ${feetBetween(from, A)} ft away.` });
  } else if (s.kind === 'stabilize') {
    T.stable = true;
    T.deathSaves = { s: 0, f: 0 };
    emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name} is Stable.`, rule: 'spare-the-dying' });
  }
  return null;
}

// ---------------------------------------------------------- the turn ----

function expire(b, when, who) {
  b.effects = b.effects.filter((e) => {
    if (e.expires.when !== when || e.expires.who !== who) return true;
    if (e.expires.skip > 0) { e.expires.skip--; return true; }
    return false;
  });
}

// opts.surprised: ids of creatures that roll Initiative with Disadvantage.
export function rollInitiative(b, { surprised = [] } = {}) {
  const entries = Object.values(b.creatures).map((c) => {
    const mode = modeFrom(c.initAdv ? [1] : [], surprised.includes(c.id) ? [1] : []);
    const d20 = rollD20(b, c, mode);
    const mod = sumParts(c.initParts);
    return { id: c.id, d20, parts: c.initParts, total: d20.kept + mod, dex: c.mods.dex, surprised: mode === 'disadvantage' };
  });
  entries.sort((p, q) => q.total - p.total || q.dex - p.dex
    || (C(b, p.id).side === 'hero' ? -1 : 1) - (C(b, q.id).side === 'hero' ? -1 : 1) || (p.id < q.id ? -1 : 1));
  b.order = entries.map((e) => e.id);
  b.round = 1;
  emit(b, { kind: 'initiative', entries, text: surprised.length ? 'Everyone rolls Initiative. The surprised roll with Disadvantage.' : 'Everyone rolls Initiative.', rule: surprised.length ? 'surprise' : 'initiative' });
  b.idx = -1;
  nextTurn(b);
}

function startTurn(b, c) {
  expire(b, 'start', c.id);
  c.reaction = true;
  const chilled = b.effects.some((e) => e.type === 'chill' && e.target === c.id);
  b.turn = { who: c.id, action: 1, bonus: 1, moveLeft: Math.max(0, c.speed - (chilled ? 10 : 0)), moves: 0, steps: 0, attacksLeft: 0, slotSpent: false };
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
  for (let guard = 0; guard < 60 && !b.over; guard++) {
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
      text: b.over === 'victory' ? 'Victory! Every foe is defeated.' : 'Defeat. Every hero is down.',
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

export function bestMelee(b, A, T) {
  const opts = attackOptions(b, A, T).filter((o) => o.atk.kind === 'melee');
  opts.sort((p, q) => q.expected - p.expected);
  return opts[0].atk;
}

// The Attack action: one attack, or several with Multiattack. Returns an
// error string, or null after using up one attack.
function useAttack(t, A) {
  if (t.attacksLeft > 0) { t.attacksLeft--; return null; }
  if (!t.action) return 'You have already used your action.';
  t.action = 0;
  t.attacksLeft = (A.multiattack || 1) - 1;
  return null;
}
export const canAttack = (t) => !!t && (t.action > 0 || t.attacksLeft > 0);

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
      if (!canAttack(t)) return fail('You have already used your action.');
      if (!T || !onBoard(T) || T.dead || !hostile(A, T)) return fail('Pick an enemy to attack.');
      const atk = A.attacks.find((a) => a.id === intent.attack);
      if (!atk) return fail('Unknown attack.');
      if (!inRange(A, T, atk)) return fail(`${T.name} is out of range.`);
      useAttack(t, A);
      attack(b, A, T, atk);
      break;
    }
    case 'breath': {
      if (!A.breath || A.breath.uses < 1) return fail('No Breath Weapon uses left.');
      if (!canAttack(t)) return fail('Breath Weapon replaces an attack of your Attack action, which you have used.');
      if (!Number.isInteger(intent.x) || !Number.isInteger(intent.y) || (intent.x === A.x && intent.y === A.y)) return fail('Pick a direction.');
      useAttack(t, A);
      A.breath.uses--;
      areaSave(b, A, coneTargets(b, A, intent.x, intent.y), { name: `Breath Weapon (${A.breath.type})`, ability: 'dex', dcParts: A.breath.dc, dice: A.breath.dice, type: A.breath.type, half: true, rule: 'breath-weapon' });
      break;
    }
    case 'cast': {
      const err = castSpell(b, A, intent);
      if (err) return fail(err);
      break;
    }
    case 'dash': {
      if (!t.action) return fail('You have already used your action.');
      t.action = 0;
      t.moveLeft += A.speed;
      emit(b, { kind: 'action', by: id, what: 'Dash', text: `${A.name} takes the Dash action: +${A.speed} ft of movement this turn.`, rule: 'dash' });
      break;
    }
    case 'action-surge': {
      if (!A.actionSurge || A.actionSurge.uses < 1) return fail('No Action Surge left.');
      if (t.surged) return fail('Only one Action Surge per turn.');
      A.actionSurge.uses--;
      t.surged = true;
      t.action += 1;
      emit(b, { kind: 'action', by: id, what: 'Action Surge', text: `${A.name} uses Action Surge: one extra action this turn.`, rule: 'action-surge' });
      break;
    }
    case 'cunning': {
      if (!A.cunning) return fail('No Cunning Action.');
      if (!t.bonus) return fail('You have already used your Bonus Action.');
      t.bonus = 0;
      if (intent.what === 'disengage') {
        b.effects.push({ type: 'disengage', by: id, expires: { when: 'end', who: id, skip: 0 } });
        emit(b, { kind: 'action', by: id, what: 'Disengage', text: `${A.name} Disengages as a Bonus Action (Cunning Action).`, rule: 'cunning-action' });
      } else {
        t.moveLeft += A.speed;
        emit(b, { kind: 'action', by: id, what: 'Dash', text: `${A.name} Dashes as a Bonus Action (Cunning Action): +${A.speed} ft.`, rule: 'cunning-action' });
      }
      break;
    }
    case 'steady-aim': {
      if (!A.steadyAim) return fail('No Steady Aim.');
      if (!t.bonus) return fail('You have already used your Bonus Action.');
      if (t.moves || t.moveLeft < A.speed) return fail("Steady Aim only works if you haven't moved this turn.");
      t.bonus = 0;
      t.moveLeft = 0;
      b.effects.push({ type: 'steady', by: id, expires: { when: 'end', who: id, skip: 0 } });
      emit(b, { kind: 'action', by: id, what: 'Steady Aim', text: `${A.name} takes Steady Aim: Advantage on the next attack this turn.`, rule: 'steady-aim' });
      break;
    }
    case 'divine-spark': {
      if (!A.channel || A.channel.uses < 1) return fail('No Channel Divinity left.');
      if (!t.action) return fail('You have already used your action.');
      if (!T || T.dead || feetBetween(A, T) > 30) return fail('Pick a creature within 30 feet.');
      t.action = 0;
      A.channel.uses--;
      const wis = A.mods.wis;
      if (T.side === A.side) {
        const r = die(b.rng, 8);
        const before = T.hp;
        T.hp = Math.min(T.hpMax, T.hp + r + wis);
        if (before === 0 && T.hp > 0) { T.deathSaves = { s: 0, f: 0 }; T.stable = false; }
        emit(b, { kind: 'heal', by: id, target: T.id, what: 'Divine Spark', roll: { label: '1d8', rolls: [r] }, mods: [{ label: 'WIS modifier', value: wis }],
          total: r + wis, before, after: T.hp, text: `${A.name} channels Divine Spark: ${T.name} regains ${T.hp - before} HP.`, rule: 'divine-spark' });
      } else {
        const dcParts = A.casting.stats.wis.dc;
        areaSave(b, A, [T], { name: 'Divine Spark', ability: 'con', dcParts, dice: '1d8', flat: wis, type: 'Radiant', half: true, rule: 'divine-spark' });
      }
      break;
    }
    case 'potion': {
      if (!(b.potions > 0)) return fail('The party has no Potions of Healing.');
      if (!t.bonus) return fail('You have already used your Bonus Action.');
      const tgt = T || A;
      if (tgt.side !== A.side || tgt.dead || cheb(A, tgt) > 1) return fail('Drink it yourself or give it to an ally next to you.');
      t.bonus = 0;
      b.potions--;
      const it = ITEMS['potion-healing'];
      const rolls = rollDice(b.rng, 2, 4);
      const amount = sum(rolls) + it.flat;
      const before = tgt.hp;
      tgt.hp = Math.min(tgt.hpMax, tgt.hp + amount);
      if (before === 0 && tgt.hp > 0) { tgt.deathSaves = { s: 0, f: 0 }; tgt.stable = false; }
      emit(b, { kind: 'heal', by: id, target: tgt.id, what: 'Potion of Healing', roll: { label: '2d4', rolls }, mods: [{ label: 'Potion', value: it.flat }],
        total: amount, before, after: tgt.hp, rule: 'potion',
        text: `${tgt === A ? `${A.name} drinks` : `${A.name} gives ${tgt.name}`} a Potion of Healing: +${tgt.hp - before} HP (${b.potions} left).` });
      break;
    }
    case 'adrenaline': {
      if (!A.adrenaline || A.adrenaline.uses < 1) return fail('No Adrenaline Rush uses left.');
      if (!t.bonus) return fail('You have already used your Bonus Action.');
      t.bonus = 0;
      A.adrenaline.uses--;
      t.moveLeft += A.speed;
      A.tempHp = Math.max(A.tempHp || 0, A.pb);
      emit(b, { kind: 'action', by: id, what: 'Adrenaline Rush', text: `${A.name} uses Adrenaline Rush: Dash as a Bonus Action and ${A.pb} Temporary Hit Points.`, rule: 'adrenaline-rush' });
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
      const hpBefore = A.hp;
      A.hp = Math.min(A.hpMax, A.hp + heal);
      emit(b, { kind: 'heal', by: id, target: id, what: 'Second Wind',
        roll: { label: '1d10', rolls: [r] }, mods: [{ label: 'Fighter level', value: A.level }], total: heal, before: hpBefore, after: A.hp,
        text: `${A.name} uses Second Wind and regains ${A.hp - hpBefore} HP (${A.secondWind.uses} use${A.secondWind.uses === 1 ? '' : 's'} left).`, rule: 'second-wind' });
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
