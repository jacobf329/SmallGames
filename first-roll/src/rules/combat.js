// The combat rules engine. Pure: no DOM, no network, no clock. All state is
// one JSON-able battle object; every resolution is appended to battle.log as
// a record that says what was rolled, what was added and which rule applied.
// Those records are what the UI explains and what the room broadcasts.

import { makeRng, die, rollDice, sum, parseDice, avgDice } from './rng.js';
import {
  key, cheb, feetBetween, incap, down, helpless, hasCond, condOf, hostile, onBoard, reachMap, canEndAt,
  pathFrom, coneSquares, cubeSquares, lineOfSight, coverBetween, occupantAt, inBounds, blocked, FT,
  lineSquares, squaresWithin, cubeAt, isWall, spellTerrain, W, H
} from './grid.js';
import { setMageArmor } from './character.js';
import { MASTERIES, SPELLS, ABILITY_NAMES, signed, METAMAGIC, SLOT_COST, SLOT_MIN_LEVEL, cantripTier, EVOCATION } from './data.js';

// The battle being resolved right now, for rules that need it but are asked
// about one creature (Resistance from Stoneskin or Aura of Life).
let CUR = null;

// ------------------------------------------------------------- set-up ----

export function createBattle({ heroes, foes, walls = [], cover = [], seed = 1 }) {
  const creatures = {};
  for (const c of [...heroes, ...foes]) {
    c.conds ||= [];
    creatures[c.id] = c;
  }
  CUR = {
    creatures, walls: [...walls], cover: [...cover], rng: makeRng(seed),
    order: [], idx: -1, round: 0, turn: null,
    effects: [], log: [], seq: 0, post: [],
    pending: null, moveCtx: null, over: null,
  };
  return CUR;
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
const SIZE = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4, gargantuan: 5 };
const s1 = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const BPS = ['Bludgeoning', 'Piercing', 'Slashing'];
const PFE_TYPES = ['aberration', 'celestial', 'elemental', 'fey', 'fiend', 'undead'];
const effectOn = (b, type, id) => b.effects.find((e) => e.type === type && e.target === id) || null;
export const COND_NAMES = {
  prone: 'Prone', restrained: 'Restrained', grappled: 'Grappled', frightened: 'Frightened', poisoned: 'Poisoned',
  paralyzed: 'Paralyzed', incapacitated: 'Incapacitated', unconscious: 'Unconscious', hidden: 'Hidden (Invisible)',
  commanded: 'Commanded', stunned: 'Stunned', slow: 'Slowed', charmed: 'Charmed', blinded: 'Blinded', befuddled: 'Befuddled', dazed: 'Dazed',
};

// --------------------------------------------------------- conditions ----

export function addCond(b, T, cond) {
  if (T.condImmune?.includes(cond.id)) return false;
  if (cond.id === 'frightened' && effectOn(b, 'heroism', T.id)) return false;
  if (condGuard(b, T, cond.id)) return false;
  T.conds = (T.conds || []).filter((x) => !(x.id === cond.id && x.by === cond.by));
  T.conds.push(cond);
  if (incap(T) && T.conc) endConc(b, T, `${T.name} is ${COND_NAMES[cond.id]}`);
  if (incap(T)) b.effects = b.effects.filter((e) => !(e.type === 'superdef' && e.target === T.id));
  if (incap(T) && hasCond(T, 'hidden')) dropCond(T, 'hidden');
  if (incap(T)) { endRage(b, T, `${T.name} is ${COND_NAMES[cond.id]}`); revertShape(b, T, `${T.name} is ${COND_NAMES[cond.id]}`); }
  return true;
}

// What keeps T from being Charmed or Frightened right now: Mindless Rage, and a
// paladin's Aura of Devotion (Charmed) or Aura of Courage (Frightened).
function condGuard(b, T, id) {
  if (id !== 'charmed' && id !== 'frightened') return null;
  if (T.raging && T.mindlessRage) return { name: 'Mindless Rage', rule: 'mindless-rage' };
  const P = auraPaladin(b, T, id === 'charmed' ? 'auraDevotion' : 'auraCourage');
  if (P) return id === 'charmed' ? { name: `Aura of Devotion (${P.name})`, rule: 'aura-of-devotion' } : { name: `Aura of Courage (${P.name})`, rule: 'aura-of-courage' };
  return null;
}
// A paladin on T's side whose 10-foot aura (with this feature) covers T.
function auraPaladin(b, T, feature) {
  let best = null;
  for (const P of Object.values(b.creatures)) {
    if (!P[feature] || P.side !== T.side || P.dead || P.hp <= 0 || incap(P) || !onBoard(P) || !onBoard(T)) continue;
    if (P !== T && feetBetween(P, T) > (P.auraRange || 10)) continue;
    if (feature !== 'auraProt' || !best || P.auraProt > best.auraProt) best = P;
  }
  return best;
}

// Rage (Barbarian): ends early when the barbarian is Incapacitated, and at the
// end of a turn in which it wasn't kept going.
function endRage(b, A, why) {
  if (!A.raging) return;
  A.raging = null;
  emit(b, { kind: 'note', by: A.id, text: `${A.name}'s Rage ends: ${why}.`, rule: 'rage' });
}

// Wild Shape (Druid): a Wolf's body over the druid's own Hit Points.
const WOLF = {
  speed: 40, size: 'medium', mods: { str: 2, dex: 2, con: 1 },
  bite: { id: 'bite', base: 'bite', name: 'Bite (Wolf)', kind: 'melee', thrown: false, dice: '1d6', type: 'Piercing', reach: 5, range: null,
    finesse: false, light: false, mastery: null, ability: 'str', abilityMod: 2, props: [], gwf: false,
    hit: [{ label: 'Wolf Bite (stat block)', value: 4, rule: 'wild-shape' }], dmgFlat: [{ label: 'Wolf STR modifier', value: 2, rule: 'damage' }], rider: { prone: 'medium' } },
};
function becomeWolf(b, A) {
  A.shape = { attacks: A.attacks, acParts: A.acParts, ac: A.ac, speed: A.speed, mods: A.mods, packTactics: A.packTactics, size: A.size };
  const before = A.speed;
  A.attacks = [{ ...WOLF.bite }];
  A.acParts = [{ label: 'Wolf (natural armor)', value: 12, rule: 'wild-shape' }];
  A.ac = 12;
  A.speed = WOLF.speed;
  A.mods = { ...A.mods, ...WOLF.mods };
  A.packTactics = true;
  A.size = WOLF.size;
  if (b.turn?.who === A.id) b.turn.moveLeft = Math.max(0, b.turn.moveLeft + WOLF.speed - before);
  const temp = A.level;
  const had = A.tempHp || 0;
  A.tempHp = Math.max(had, temp);
  return { temp, had };
}
function revertShape(b, A, why, quiet = false) {
  const s = A.shape;
  if (!s) return;
  if (b.turn?.who === A.id) b.turn.moveLeft = Math.max(0, b.turn.moveLeft + s.speed - A.speed);
  Object.assign(A, { attacks: s.attacks, acParts: s.acParts, ac: s.ac, speed: s.speed, mods: s.mods, packTactics: s.packTactics, size: s.size });
  A.shape = null;
  if (!quiet) emit(b, { kind: 'note', by: A.id, text: `${A.name} returns to their own form${why ? `: ${why}` : ''}.`, rule: 'wild-shape' });
}
export function dropCond(T, id, pred = () => true) {
  const before = T.conds?.length || 0;
  T.conds = (T.conds || []).filter((x) => !(x.id === id && pred(x)));
  return before - T.conds.length;
}

export function speedOf(b, c) {
  if (hasCond(c, 'grappled') || hasCond(c, 'restrained') || helpless(c)) return 0;
  let s = c.speed - 5 * (c.exhaustion || 0);
  if (b.effects.some((e) => e.type === 'chill' && e.target === c.id)) s -= 10;
  if (b.effects.some((e) => e.type === 'slowed' && e.target === c.id)) s -= 10;
  if (b.effects.some((e) => e.type === 'hamstrung' && e.target === c.id)) s -= 15;
  if (b.effects.some((e) => e.type === 'stride' && e.target === c.id)) s += 10;
  if (b.effects.some((e) => e.type === 'staggered' && e.target === c.id)) s = Math.floor(s / 2 / 5) * 5;
  if (hasCond(c, 'slow')) s = Math.floor(s / 2 / 5) * 5;
  if (b.effects.some((e) => e.type === 'haste' && e.target === c.id)) s *= 2;
  if (c.conds?.some((x) => x.pattern || x.lethargy)) return 0;
  if (b.effects.some((e) => e.type === 'rooted' && e.target === c.id)) return 0;
  return Math.max(0, s);
}

// Concentration: one spell at a time; ends on a failed save after damage,
// when Incapacitated, or when you start another Concentration spell.
function startConc(b, A, sid) {
  if (A.conc) endConc(b, A, `${A.name} starts concentrating on ${SPELLS[sid].name} instead`);
  A.conc = { spell: sid };
}
export function endConc(b, A, why) {
  if (!A.conc) return;
  const sp = SPELLS[A.conc.spell];
  A.conc = null;
  // Haste: when it ends, the creature can't move or act until after its next turn.
  const lethargic = b.over ? [] : b.effects.filter((e) => e.type === 'haste' && e.conc === A.id).map((e) => C(b, e.target)).filter((X) => X && !X.dead);
  b.effects = b.effects.filter((e) => e.conc !== A.id);
  for (const X of lethargic) {
    X.conds = X.conds.filter((x) => !x.lethargy);
    X.conds.push({ id: 'incapacitated', by: A.id, lethargy: true, endsOn: { when: 'end', who: X.id, skip: b.turn?.who === X.id ? 1 : 0 }, rule: 'haste' });
    if (b.turn?.who === X.id) { b.turn.moveLeft = 0; b.turn.action = 0; b.turn.bonus = 0; b.turn.attacksLeft = 0; b.turn.hasteAct = 0; }
  }
  for (const c of Object.values(b.creatures)) {
    if (c.conds?.some((x) => x.conc === A.id)) c.conds = c.conds.filter((x) => x.conc !== A.id);
    if (c.aidFrom === A.id) c.aidFrom = null;
  }
  emit(b, { kind: 'note', by: A.id, text: `${A.name}'s ${sp.name} ends: ${why}.`, rule: 'concentration' });
  for (const X of lethargic) emit(b, { kind: 'note', by: X.id, text: `A wave of lethargy: ${X.name} can't move or take actions until after their next turn (Haste ended).`, rule: 'haste' });
}

// After a hit: Concentration saves, effects that end on damage. Queued in
// b.post during the hit so they come after the hit in the log.
// Death Throes (Balor): it explodes as it dies.
function deathThroes(b, T) {
  const d = T.throes;
  const hit = Object.values(b.creatures).filter((X) => X !== T && !X.dead && onBoard(X) && feetBetween(T, X) <= d.size);
  emit(b, { kind: 'note', by: T.id, rule: 'stat-block', text: `${T.name} explodes as it dies (Death Throes): each creature within ${d.size} feet makes a DC ${d.dc} Dexterity save.` });
  if (hit.length) areaSave(b, T, hit, { name: 'Death Throes', ability: 'dex', dcParts: [{ label: 'Stat block', value: d.dc, rule: 'stat-block' }], dice: d.dice, type: d.type, also: d.also, half: true, rule: 'stat-block', ignoreCover: true });
}
function flushPost(b) {
  const jobs = b.post;
  b.post = [];
  for (const j of jobs) {
    const T = C(b, j.id);
    if (j.kind === 'blessing' && T) { blessing(b, T, j.by); continue; }
    if (j.kind === 'throes' && T) { deathThroes(b, T); continue; }
    if (!T || T.dead) { if (T?.conc) endConc(b, T, `${T.name} is defeated`); continue; }
    if (j.kind === 'retaliate') { retaliate(b, T, C(b, j.by)); continue; }
    if (j.kind === 'hurt' && incap(T)) { endRage(b, T, `${T.name} is down`); revertShape(b, T, `${T.name} drops to 0 Hit Points`); }
    if (j.kind === 'hurt') {
      const gone = T.conds.filter((x) => x.endsOnDamage);
      if (gone.length) {
        T.conds = T.conds.filter((x) => !x.endsOnDamage);
        emit(b, { kind: 'note', by: T.id, text: `Taking damage ends ${T.name}'s ${[...new Set(gone.map((x) => COND_NAMES[x.id]))].join(' and ')}.`, rule: gone[0].rule || 'turn-undead' });
      }
      if (T.conc && incap(T)) endConc(b, T, `${T.name} is Incapacitated`);
      else if (T.conc && T.relentlessHunter && T.conc.spell === 'hunters-mark') {
        emit(b, { kind: 'note', by: T.id, rule: 'relentless-hunter', text: `Relentless Hunter: taking damage can't break ${T.name}'s Concentration on Hunter's Mark.` });
      } else if (T.conc) {
        const dc = Math.min(30, Math.max(10, Math.floor(j.dmg / 2)));
        const sv = savingThrow(b, T, 'con', dc, { cond: 'concentration' });
        emit(b, { kind: 'save', save: 'concentration', by: T.id, ...sv, dc, outcome: sv.success ? 'success' : 'fail', rule: 'concentration',
          text: `${T.name} makes a Concentration save (DC ${dc}: 10 or half the damage, whichever is higher): ${sv.total}, ${sv.success ? 'keeps concentrating' : 'loses it'}.` });
        if (!sv.success) endConc(b, T, 'failed the Concentration save');
      }
    }
  }
  tidy(b);
}

// Dark One's Blessing (Fiend Warlock): an enemy drops to 0 Hit Points at the
// warlock's hand, or within 10 feet of the warlock.
function blessing(b, T, byId) {
  for (const D of Object.values(b.creatures)) {
    if (!D.darkOne || D.dead || D.hp <= 0 || !hostile(D, T)) continue;
    if (D.id !== byId && feetBetween(D, T) > 10) continue;
    const amount = Math.max(1, D.mods.cha + D.level);
    const before = D.tempHp || 0;
    D.tempHp = Math.max(before, amount);
    emit(b, { kind: 'note', by: D.id, target: D.id, rule: 'dark-ones-blessing',
      text: `Dark One's Blessing: ${T.name} drops${D.id === byId ? '' : ` within 10 feet of ${D.name}`}, so ${D.name} gains ${amount} Temporary Hit Points${before >= amount ? `, but already has ${before}, and they don't stack` : ''}.` });
  }
}

// Reactions to being damaged: Storm's Thunder (Goliath) and Hellish Rebuke
// (a Tiefling's free cast). Used automatically when they can be.
function retaliate(b, T, X) {
  if (!X || X.dead || !onBoard(X) || T.dead || T.hp <= 0 || incap(T) || !T.reaction || b.over) return;
  if (feetBetween(T, X) > 60 || !lineOfSight(b, T, X)) return;
  // Retaliation (Berserker 10): a melee attack back at a creature within 5 feet.
  if (T.retaliation && !b.pending && feetBetween(T, X) <= 5 && T.attacks.some((a) => a.kind === 'melee')) {
    T.reaction = false;
    emit(b, { kind: 'note', by: T.id, target: X.id, rule: 'retaliation', text: `${X.name} hurt ${T.name} from 5 feet away: Retaliation (Reaction), one melee attack back.` });
    attack(b, T, X, bestMelee(b, T, X), { reaction: true, why: 'Retaliation' });
    return;
  }
  if (T.giant?.kind === 'storm' && T.giant.uses > 0) {
    T.giant.uses--;
    T.reaction = false;
    const r = rollDice(b.rng, 1, 8);
    const dmg = finishDamage(X, [{ label: "Storm's Thunder 1d8", rolls: r, value: r[0], rule: 'giant-ancestry', type: 'Thunder' }]);
    const after = applyDamage(b, X, dmg.total, { types: ['Thunder'] });
    emit(b, { kind: 'note', by: T.id, target: X.id, rule: 'giant-ancestry',
      text: `${T.name} uses Storm's Thunder (Reaction): ${X.name} takes ${dmg.total} Thunder damage${adjustText(dmg)}.${afterText(X, after)}` });
    flushPost(b);
    checkOver(b);
    return;
  }
  const k = T.casting?.known?.['hellish-rebuke'];
  if (k && k.free > 0) {
    k.free--;
    T.reaction = false;
    const s = SPELLS['hellish-rebuke'];
    emit(b, { kind: 'cast', by: T.id, spell: 'hellish-rebuke', level: 1, slot: 1, pay: 'free', reaction: true, rule: 'hellish-rebuke',
      text: `${T.name} casts Hellish Rebuke as a Reaction (free cast, ${k.source}).` });
    areaSave(b, T, [X], { name: s.name, ability: 'dex', dcParts: T.casting.stats[k.ability].dc, dice: s.dice, type: s.type, half: true, rule: 'hellish-rebuke' });
    return;
  }
  // A Warlock's Hellish Rebuke uses a spell slot, so the player decides.
  if (k && k.slot && T.side === 'hero' && !b.pending && slotFor(b, T, 'hellish-rebuke')) {
    b.pending = { kind: 'rebuke', reactor: T.id, attacker: X.id };
    emit(b, { kind: 'prompt', by: T.id, target: X.id, text: `${X.name} damaged ${T.name}.`, rule: 'hellish-rebuke' });
  }
}


// Conditions that end because their source can't hold them any more.
function tidy(b) {
  for (const T of Object.values(b.creatures)) {
    if (!T.conds?.length) continue;
    for (const x of [...T.conds]) {
      const src = x.by ? C(b, x.by) : null;
      if (x.id === 'grappled' && (!src || src.dead || incap(src) || feetBetween(src, T) > (x.reach || 5))) {
        dropCond(T, 'grappled', (y) => y === x);
        emit(b, { kind: 'note', by: T.id, text: `${T.name} is no longer Grappled${src && !src.dead && !incap(src) ? ` (out of ${src.name}'s reach)` : ''}.`, rule: 'grappled' });
      } else if (x.turned && src && incap(src)) {
        T.conds = T.conds.filter((y) => !y.turned);
        emit(b, { kind: 'note', by: T.id, text: `${src.name} is Incapacitated, so ${T.name} is no longer turned.`, rule: 'turn-undead' });
      }
    }
    if (down(T) && T.conds.some((x) => x.id === 'hidden')) dropCond(T, 'hidden');
  }
}

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

// Heroic Inspiration: reroll one d20 of a D20 Test and use the new roll.
function inspire(b, who, d20) {
  if (!who.inspiration || who.autoInspire === false) return null;
  who.inspiration = false;
  const i = d20.rolls.indexOf(d20.kept);
  const fresh = die(b.rng, 20);
  const rolls = [...d20.rolls];
  rolls[i] = fresh;
  const kept = d20.mode === 'advantage' ? Math.max(...rolls) : d20.mode === 'disadvantage' ? Math.min(...rolls) : fresh;
  const out = { from: d20.kept, to: fresh };
  Object.assign(d20, { rolls, kept, inspired: out });
  return out;
}

// Penalties and bonuses on every D20 Test the creature makes (not the dice).
function testParts(c) {
  const p = [];
  if (c.exhaustion > 0) p.push({ label: `Exhaustion level ${c.exhaustion} (−2 per level)`, value: -2 * c.exhaustion, rule: 'exhaustion' });
  return p;
}
// Bless: roll a d4 and add it to attack rolls and saving throws.
function blessPart(b, c) {
  if (!b.effects.some((e) => e.type === 'bless' && e.target === c.id)) return null;
  const r = die(b.rng, 4);
  return { label: 'Bless (d4)', value: r, rolls: [r], rule: 'bless' };
}
const blessAvg = (b, c) => (b.effects.some((e) => e.type === 'bless' && e.target === c.id) ? 2.5 : 0) - (effectOn(b, 'bane', c.id) ? 2.5 : 0);
// Bane: subtract a d4 from attack rolls and saving throws.
function banePart(b, c) {
  if (!effectOn(b, 'bane', c.id)) return null;
  const r = die(b.rng, 4);
  return { label: 'Bane (−d4)', value: -r, rolls: [r], rule: 'bane' };
}
// Bardic Inspiration: a hero who fails a D20 Test by no more than the die
// rolls it (used for them only when it could turn the failure into a success).
function bardicTry(b, c, need) {
  const bd = c.bardicDie;
  if (!bd || need < 1 || need > bd.die) return null;
  c.bardicDie = null;
  const r = die(b.rng, bd.die);
  return { label: `Bardic Inspiration (d${bd.die} from ${C(b, bd.from)?.name || 'a bard'})`, value: r, rolls: [r], rule: 'bardic-inspiration' };
}

// A saving throw: d20 + ability modifier (+ PB if proficient) vs a DC.
// Aura of Authority (Hobgoblin Captain): it and its allies within 10 feet have Advantage on attack rolls and saves.
function authorityOver(b, X) {
  return Object.values(b.creatures).find((L) => L.authority && L.side === X.side && !L.dead && L.hp > 0 && !incap(L) && onBoard(L) && (L === X || feetBetween(L, X) <= 10)) || null;
}
export function saveFactors(b, T, ability, { cond = null, extraDis = [] } = {}) {
  const adv = [], dis = [...extraDis];
  const au = authorityOver(b, T);
  if (au) adv.push({ text: `Aura of Authority (${au.name})`, rule: 'aura-of-authority' });
  if (ability === 'str' && T.raging) adv.push({ text: `${T.name} is raging`, rule: 'rage' });
  if (ability === 'dex' && T.dangerSense && !incap(T)) adv.push({ text: 'Danger Sense', rule: 'danger-sense' });
  if (cond === 'concentration' && T.conc?.extended) adv.push({ text: 'Extended Spell', rule: 'metamagic' });
  else if (cond === 'concentration' && (T.invocations || []).includes('eldritch-mind')) adv.push({ text: 'Eldritch Mind', rule: 'eldritch-invocations' });
  if (ability === 'dex' && b.effects.some((e) => e.type === 'dodge' && e.by === T.id) && !incap(T)) adv.push({ text: `${T.name} is Dodging`, rule: 'dodge' });
  if (T.mentalSaveAdv && ['int', 'wis', 'cha'].includes(ability)) adv.push({ text: 'Gnomish Cunning', rule: 'saving-throws' });
  if (ability === 'dex' && hasCond(T, 'restrained')) dis.push({ text: `${T.name} is Restrained`, rule: 'restrained' });
  if (cond === 'poisoned' && T.poisonSaveAdv) adv.push({ text: 'Dwarven Resilience', rule: 'poisoned' });
  if (cond === 'frightened' && T.braveSaveAdv) adv.push({ text: 'Brave', rule: 'frightened' });
  if (ability === 'dex' && b.effects.some((e) => e.type === 'haste' && e.target === T.id)) adv.push({ text: `${T.name} is hasted`, rule: 'haste' });
  if (ability === 'wis' && effectOn(b, 'beacon', T.id)) adv.push({ text: 'Beacon of Hope', rule: 'beacon-of-hope' });
  if (effectOn(b, 'holyaura', T.id)) adv.push({ text: 'Holy Aura', rule: 'holy-aura' });
  // Magic Resistance: Advantage on saves against spells.
  if (T.magicRes && b.spellNow) adv.push({ text: 'Magic Resistance (against a spell)', rule: 'magic-resistance' });
  // Staggering Blow (Barbarian 13): Disadvantage on its next save.
  if (b.effects.some((e) => e.type === 'staggerblow' && e.target === T.id && !e.used)) dis.push({ text: 'Staggering Blow', rule: 'brutal-strike' });
  // Holy Nimbus (Devotion 20): Advantage on saves a Fiend or Undead forces (here: the one whose turn it is).
  const src = b.turn ? C(b, b.turn.who) : null;
  if (T.nimbusOn && src && src !== T && (src.creature === 'fiend' || src.creature === 'undead')) adv.push({ text: `Holy Nimbus (against ${src.creature === 'fiend' ? 'a Fiend' : 'an Undead'})`, rule: 'holy-nimbus' });
  return { adv, dis, mode: modeFrom(adv, dis) };
}

export function saveChance(b, T, ability, dc, extra = 0) {
  if (helpless(T) && (ability === 'str' || ability === 'dex')) return 0;
  const mod = (T.saves?.[ability] ?? T.mods[ability]) + sumParts(testParts(T)) + blessAvg(b, T) + (auraPaladin(b, T, 'auraProt')?.auraProt || 0) + extra;
  const f = saveFactors(b, T, ability);
  let p = Math.min(20, Math.max(0, 21 - (dc - mod))) / 20;   // saves have no automatic 1/20
  if (f.mode === 'advantage') p = 1 - (1 - p) ** 2;
  if (f.mode === 'disadvantage') p = p * p;
  return p;
}

// opts.cover: Half Cover from where the effect starts (+2 to Dexterity saves).
function savingThrow(b, T, ability, dc, { cover = null, cond = null, extraDis = [], careful = false } = {}) {
  if (careful) return { target: T.id, auto: 'success', success: true, mods: [], total: dc, d20: null, careful: true, note: 'Careful Spell: succeeds automatically' };
  const f = saveFactors(b, T, ability, { cond, extraDis });
  // Paralyzed and Unconscious creatures automatically fail STR and DEX saves.
  if ((helpless(T) || hasCond(T, 'stunned')) && (ability === 'str' || ability === 'dex')) {
    const why = down(T) ? 'Unconscious' : hasCond(T, 'paralyzed') ? 'Paralyzed' : hasCond(T, 'stunned') ? 'Stunned' : 'Unconscious';
    return { target: T.id, auto: 'fail', success: false, mods: [], total: 0, d20: null, note: `${why}: automatically fails` };
  }
  const d20 = rollD20(b, T, f.mode);
  const mods = [{ label: `${ability.toUpperCase()} modifier`, value: T.mods[ability], rule: 'ability-modifier' }];
  if (T.saveProfs?.includes(ability)) mods.push({ label: 'Proficiency Bonus (proficient save)', value: T.pb, rule: 'proficiency' });
  if (cover && ability === 'dex') mods.push({ label: `Half Cover (${cover.what})`, value: 2, rule: 'cover' });
  if (ability === 'dex' && hasCond(T, 'slow')) mods.push({ label: 'Slow', value: -2, rule: 'slow' });
  mods.push(...testParts(T));
  const ap = auraPaladin(b, T, 'auraProt');
  if (ap) mods.push({ label: `Aura of Protection (${ap.name}, CHA modifier)`, value: ap.auraProt, rule: 'aura-of-protection' });
  const bl = blessPart(b, T);
  if (bl) mods.push(bl);
  const bn = banePart(b, T);
  if (bn) mods.push(bn);
  let total = d20.kept + sumParts(mods);
  const notes = [];
  // Countercharm (Bard 7): a bard's Reaction rerolls a failed save against Charmed or Frightened, with Advantage.
  if (total < dc && (cond === 'charmed' || cond === 'frightened')) {
    const B = Object.values(b.creatures).find((H) => H.countercharm && H.side === T.side && H.reaction && !incap(H) && !H.dead && H.hp > 0 && (H === T || feetBetween(H, T) <= 30));
    if (B) {
      B.reaction = false;
      const again = rollD20(b, T, 'advantage');
      d20.rolls = [...d20.rolls, ...again.rolls];
      d20.kept = again.kept;
      total = d20.kept + sumParts(mods);
      notes.push(`Countercharm (${B.name}'s Reaction): rerolled with Advantage, got ${again.kept}`);
    }
  }
  if (total < dc && T.side === 'hero') {
    if (inspire(b, T, d20)) total = d20.kept + sumParts(mods);
  }
  if (total < dc) {
    const bi = bardicTry(b, T, dc - total);
    if (bi) { mods.push(bi); total += bi.value; }
  }
  // Dark One's Own Luck (Fiend Warlock 6): add a d10 when it could turn the failure around.
  if (total < dc && T.ownLuck?.uses > 0 && dc - total <= 10) {
    T.ownLuck.uses--;
    const r = die(b.rng, 10);
    mods.push({ label: `Dark One's Own Luck (d10; ${T.ownLuck.uses} left)`, value: r, rolls: [r], rule: 'dark-ones-own-luck' });
    total += r;
  }
  // Indomitable (Fighter 9): reroll a failed save with a bonus equal to the Fighter level.
  if (total < dc && T.indomitable?.uses > 0 && dc - (sumParts(mods) + T.level) <= 20) {
    T.indomitable.uses--;
    const was = d20.kept;
    const fresh = die(b.rng, 20);
    d20.rolls = [...d20.rolls, fresh];
    d20.kept = fresh;
    mods.push({ label: `Indomitable (+${T.level}, Fighter level)`, value: T.level, rule: 'indomitable' });
    total = fresh + sumParts(mods);
    notes.push(`Indomitable: rerolled the ${was}, got ${fresh}`);
  }
  // Disciplined Survivor (Monk 14): 1 Focus Point rerolls a failed save.
  if (total < dc && T.survivor && T.focus?.uses > 0 && !incap(T) && dc - sumParts(mods) <= 20) {
    T.focus.uses--;
    const was = d20.kept;
    const fresh = die(b.rng, 20);
    d20.rolls = [...d20.rolls, fresh];
    d20.kept = fresh;
    total = fresh + sumParts(mods);
    notes.push(`Disciplined Survivor (1 Focus Point, ${T.focus.uses} left): rerolled the ${was}, got ${fresh}`);
  }
  // Indomitable Might (Barbarian 18): a Strength save total below the Strength score uses the score.
  if (ability === 'str' && T.indomitableMight && total < T.indomitableMight) {
    notes.push(`Indomitable Might: ${T.name} uses their Strength score (${T.indomitableMight}) instead of ${total}`);
    total = T.indomitableMight;
  }
  // Boon of Fate: a hero within 60 feet adds 2d4 to an ally's failed save, or takes it from a foe's success.
  {
    const ally = total < dc && dc - total <= 6;
    const foe = total >= dc && total - dc <= 2;
    const F = (ally || foe) && Object.values(b.creatures).find((H) => H.fate?.uses > 0 && !H.dead && H.hp > 0 && !incap(H) && onBoard(H) && onBoard(T)
      && (ally ? H.side === T.side : hostile(H, T)) && (H === T || (feetBetween(H, T) <= 60 && lineOfSight(b, H, T))));
    if (F) {
      F.fate.uses--;
      const rs = rollDice(b.rng, 2, 4);
      const v = ally ? sum(rs) : -sum(rs);
      mods.push({ label: `Improve Fate (${F.name}, 2d4)`, value: v, rolls: rs, rule: 'boon-of-fate' });
      total += v;
      notes.push(`Improve Fate: ${F.name} ${ally ? 'adds' : 'takes away'} 2d4 (${rs.join(' + ')})`);
    }
  }
  // Stroke of Luck (Rogue 20): a failed save's d20 becomes a 20, once per Short or Long Rest.
  if (total < dc && T.strokeOfLuck?.uses > 0 && dc - (sumParts(mods) + 20) <= 0) {
    T.strokeOfLuck.uses--;
    const was = d20.kept;
    d20.kept = 20;
    total = 20 + sumParts(mods);
    notes.push(`Stroke of Luck: ${T.name} turns the ${was} into a 20`);
  }
  for (const e of b.effects) if (e.type === 'staggerblow' && e.target === T.id) e.used = true;
  // Legendary Resistance: a failed save becomes a success, a few times a day.
  if (total < dc && T.legRes?.uses > 0 && !T.dead) {
    T.legRes.uses--;
    notes.push(`Legendary Resistance: it chooses to succeed instead (${T.legRes.uses} left today)`);
    return { target: T.id, d20: { ...d20, adv: f.adv, dis: f.dis }, mods, total, success: true, legendary: true, note: notes.join('; ') };
  }
  return { target: T.id, d20: { ...d20, adv: f.adv, dis: f.dis }, mods, total, success: total >= dc, note: notes.join('; ') || undefined };
}

// An ability check (escaping a grapple, hiding): d20 + skill vs DC.
function abilityCheck(b, A, skills, dc, { adv = [], dis = [] } = {}) {
  const best = skills.map((s) => ({ s, v: A.skills?.[s.id] ?? A.mods[s.ab] })).sort((p, q) => q.v - p.v)[0];
  if (best.s.ab === 'str' && A.raging) adv.push({ text: `${A.name} is raging`, rule: 'rage' });
  if (hasCond(A, 'poisoned')) dis.push({ text: `${A.name} is Poisoned`, rule: 'poisoned' });
  const fr = frightBy(b, A);
  if (fr) dis.push({ text: `${A.name} is Frightened of ${fr.name}`, rule: 'frightened' });
  const mode = modeFrom(adv, dis);
  const d20 = rollD20(b, A, mode);
  // Reliable Talent (Rogue 7): a 9 or lower counts as a 10 on a proficient skill.
  if (A.reliable && (A.profSkills || []).includes(best.s.id) && d20.kept < 10) { d20.reliable = d20.kept; d20.kept = 10; }
  const mods = [{ label: `${best.s.name}`, value: best.v, rule: 'skills' }, ...testParts(A)];
  let total = d20.kept + sumParts(mods);
  if (total < dc) {
    const bi = bardicTry(b, A, dc - total);
    if (bi) { mods.push(bi); total += bi.value; }
  }
  return { d20: { ...d20, adv, dis }, mods, total, dc, skill: best.s.name, success: total >= dc };
}

// Frightened: only while the source of fear is in sight.
function frightBy(b, A) {
  for (const x of A.conds || []) {
    if (x.id !== 'frightened') continue;
    const src = C(b, x.by);
    if (src && !src.dead && lineOfSight(b, A, src)) return src;
  }
  return null;
}

// ------------------------------------------------------------- attacks ----

export function attackRangeFeet(atk) {
  return atk.kind === 'ranged' ? atk.range : [atk.reach || 5, atk.reach || 5];
}
export const reachOf = (c) => Math.max(5, ...c.attacks.filter((a) => a.kind === 'melee').map((a) => a.reach || 5));

export function inRange(A, T, atk) {
  return feetBetween(A, T) <= attackRangeFeet(atk)[1];
}

// Can A attack T with atk right now? { ok, why }
export function canTarget(b, A, T, atk) {
  if (!T || T.dead || !onBoard(T)) return { ok: false, why: 'Pick a target.' };
  if (!inRange(A, T, atk)) return { ok: false, why: atk.kind === 'melee' ? 'Out of reach: move next to it first.' : 'Out of range.' };
  if (!lineOfSight(b, A, T)) return { ok: false, why: `No line of sight: a wall gives ${T.name} Total Cover.` };
  if (hasCond(T, 'hidden') && hostile(A, T)) return { ok: false, why: `${A.name} doesn't know where ${T.name} is (Hidden).` };
  return { ok: true };
}

// Armor Class against this attack, with every bonus spelled out.
export function acAgainst(b, A, T, atk) {
  const parts = [...T.acParts];
  if (b.effects.some((e) => e.type === 'faith' && e.target === T.id)) parts.push({ label: 'Shield of Faith', value: 2, rule: 'shield-of-faith' });
  if (b.effects.some((e) => e.type === 'shield' && e.target === T.id)) parts.push({ label: 'Shield spell', value: 5, rule: 'shield' });
  if (b.effects.some((e) => e.type === 'haste' && e.target === T.id)) parts.push({ label: 'Haste', value: 2, rule: 'haste' });
  if (hasCond(T, 'slow')) parts.push({ label: 'Slow', value: -2, rule: 'slow' });
  if (b.effects.some((e) => e.type === 'madef' && e.by === T.id && e.target === A.id)) parts.push({ label: `Multiattack Defense (${A.name} already hit this turn)`, value: 4, rule: 'multiattack-defense' });
  const floor = 17 - sumParts(parts);
  if (effectOn(b, 'bark', T.id) && floor > 0) parts.push({ label: "Barkskin (AC can't be less than 17)", value: floor, rule: 'barkskin' });
  const cov = atk.ignoreCover ? null : coverFor(b, A, T);
  if (cov) parts.push({ label: cov.magic ? `Half Cover (${cov.what})` : `Half Cover (${cov.what} in the way)`, value: 2, rule: cov.rule || 'cover' });
  return { value: sumParts(parts), parts, cover: cov };
}

// Which effects give Advantage or Disadvantage on A attacking T with atk.
// Returns reasons and which one-shot effects the roll would use up.
// Witch Sight (30 ft), Truesight and Blindsight (a sight range): seeing the Invisible.
const seesUnseen = (A, T) => (A.witchSight && feetBetween(A, T) <= 30) || (A.sight > 0 && feetBetween(A, T) <= A.sight);
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
    } else if (e.type === 'sap' && e.target === A.id) {
      dis.push({ text: `Sap: ${C(b, e.by).name} hit ${A.name} with a Sap weapon`, rule: 'mastery-sap' });
      uses.push(e);
    } else if (e.type === 'aim' && e.by === A.id) {
      adv.push({ text: 'Steady Aim', rule: 'steady-aim' });
      uses.push(e);
    } else if (e.type === 'staggered' && e.target === T.id) {
      adv.push({ text: `Stunning Strike: ${T.name} reeled from ${C(b, e.by).name}'s blow`, rule: 'stunning-strike' });
      uses.push(e);
    } else if (e.type === 'outlined' && e.target === T.id) {
      if (!adv.some((x) => x.rule === 'faerie-fire')) adv.push({ text: `${T.name} is outlined by Faerie Fire`, rule: 'faerie-fire' });
    } else if (e.type === 'dodge' && e.by === T.id && !incap(T)) {
      dis.push({ text: `${T.name} is Dodging`, rule: 'dodge' });
    } else if (e.type === 'reckless' && e.by === A.id && atk.ability === 'str' && !atk.spell) {
      adv.push({ text: `${A.name} attacks recklessly`, rule: 'reckless-attack' });
    } else if (e.type === 'reckless' && e.by === T.id) {
      adv.push({ text: `${T.name} is attacking recklessly`, rule: 'reckless-attack' });
    } else if (e.type === 'mocked' && e.target === A.id) {
      dis.push({ text: `${e.what || 'Vicious Mockery'}: ${A.name}'s next attack roll`, rule: e.rule || 'vicious-mockery' });
      uses.push(e);
    } else if (e.type === 'blur' && e.target === T.id) {
      dis.push({ text: `${T.name} is blurred`, rule: 'blur' });
    } else if (e.type === 'invis' && e.target === T.id && !seesUnseen(A, T)) {
      dis.push({ text: `${T.name} is Invisible (Greater Invisibility)`, rule: 'greater-invisibility' });
    } else if (e.type === 'invis' && e.target === A.id && !seesUnseen(T, A)) {
      adv.push({ text: `${A.name} is Invisible (Greater Invisibility)`, rule: 'greater-invisibility' });
    } else if (e.type === 'veil' && e.target === T.id && !seesUnseen(A, T)) {
      dis.push({ text: `${T.name} is Invisible (Nature's Veil)`, rule: 'natures-veil' });
    } else if (e.type === 'veil' && e.target === A.id && !seesUnseen(T, A)) {
      adv.push({ text: `${A.name} is Invisible (Nature's Veil)`, rule: 'natures-veil' });

    } else if (e.type === 'pfe' && e.target === T.id && PFE_TYPES.includes(A.creature)) {
      dis.push({ text: `Protection from Evil and Good on ${T.name}`, rule: 'protection-from-evil-and-good' });
    }
  }
  if (atk.spell && innateFor(A, atk.spell)) adv.push({ text: 'Innate Sorcery', rule: 'innate-sorcery' });
  const near = cheb(A, T) <= 1;
  if (down(T) || hasCond(T, 'unconscious')) adv.push({ text: `${T.name} is Unconscious`, rule: 'unconscious' });

  else if (hasCond(T, 'paralyzed')) adv.push({ text: `${T.name} is Paralyzed`, rule: 'paralyzed' });
  else if (hasCond(T, 'stunned')) adv.push({ text: `${T.name} is Stunned`, rule: 'stunned' });
  if (hasCond(T, 'restrained')) adv.push({ text: `${T.name} is Restrained`, rule: 'restrained' });
  if (hasCond(T, 'prone') && !down(T)) {
    if (near) adv.push({ text: `${T.name} is Prone and ${A.name} is within 5 feet`, rule: 'prone' });
    else dis.push({ text: `${T.name} is Prone and ${A.name} is farther than 5 feet`, rule: 'prone' });
  }
  if (hasCond(A, 'prone')) dis.push({ text: `${A.name} is Prone`, rule: 'prone' });
  if (hasCond(A, 'restrained')) dis.push({ text: `${A.name} is Restrained`, rule: 'restrained' });
  if (hasCond(A, 'poisoned')) dis.push({ text: `${A.name} is Poisoned`, rule: 'poisoned' });
  if (hasCond(A, 'blinded')) dis.push({ text: `${A.name} is Blinded`, rule: 'blinded' });
  if (hasCond(T, 'blinded')) adv.push({ text: `${T.name} is Blinded`, rule: 'blinded' });
  if (effectOn(b, 'holyaura', T.id)) dis.push({ text: `Holy Aura on ${T.name}`, rule: 'holy-aura' });
  // Studied Attacks (Fighter 13): Advantage on the next attack after a miss against the same creature.
  if (b.effects.some((e) => e.type === 'studied' && e.by === A.id && e.target === T.id)) adv.push({ text: `Studied Attacks: ${A.name} missed ${T.name}`, rule: 'studied-attacks' });
  const fr = frightBy(b, A);
  if (fr) dis.push({ text: `${A.name} is Frightened of ${fr.name}`, rule: 'frightened' });
  const gr = condOf(A, 'grappled');
  if (gr && gr.by !== T.id) dis.push({ text: `${A.name} is Grappled and ${T.name} isn't the grappler`, rule: 'grappled' });
  if (hasCond(A, 'hidden')) adv.push({ text: `${A.name} is Hidden`, rule: 'hide' });
  const au = authorityOver(b, A);
  if (au) adv.push({ text: `Aura of Authority (${au.name})`, rule: 'aura-of-authority' });
  if (A.packTactics && alliesOf(b, A).some((o) => !incap(o) && cheb(o, T) <= 1)) adv.push({ text: `Pack Tactics: an ally of ${A.name} is next to ${T.name}`, rule: 'pack-tactics' });
  if ((atk.advIfGrappled || A.grappler) && T.conds?.some((x) => x.id === 'grappled' && x.by === A.id)) adv.push({ text: `${T.name} is Grappled by ${A.name}`, rule: A.grappler ? 'grappler' : 'grappled' });
  if (atk.kind === 'ranged') {
    const close = enemiesOf(b, A).filter((e) => !incap(e) && cheb(e, A) <= 1);
    if (close.length) dis.push({ text: `Ranged attack with ${close[0].name} next to ${A.name}`, rule: 'ranged-in-melee' });
    if (feetBetween(A, T) > atk.range[0]) dis.push({ text: 'Target is beyond normal range', rule: 'long-range' });
  }
  // Precise Hunter (Ranger 17): Advantage against the creature you marked with Hunter's Mark.
  if (A.preciseHunter && b.effects.some((e) => e.type === 'mark' && e.spell === 'hunters-mark' && e.by === A.id && e.target === T.id)) adv.push({ text: `Precise Hunter: ${T.name} carries ${A.name}'s Hunter's Mark`, rule: 'precise-hunter' });
  // Elusive (Rogue 18): no attack roll has Advantage against them while they can act.
  if (T.elusive && !incap(T) && adv.length) {
    adv.length = 0;
    return { adv, dis, uses, mode: modeFrom(adv, dis), elusive: true };
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
const critOn = (A, atk) => (atk.spell ? 20 : A.critOn || 20);

function sneakAllowed(b, A, T, atk, mode) {
  if (!A.sneak || A.sneakKey === turnKey(b) || atk.spell) return null;
  if (!(atk.finesse || atk.kind === 'ranged')) return null;
  if (mode === 'advantage') return 'You had Advantage';
  if (mode === 'disadvantage') return null;
  const buddy = alliesOf(b, A).find((o) => !incap(o) && cheb(o, T) <= 1);
  return buddy ? `${buddy.name} is next to ${T.name}` : null;
}

// What damage would do to T after Resistance, Vulnerability and Immunity.
export function damageMult(T, type, b = CUR, pierce = false) {
  if (T.immune?.includes(type)) return 0;
  let m = 1;
  const resists = T.resist?.includes(type) || (T.raging && BPS.includes(type)) || (b && spellResist(b, T).includes(type))
    || (b && type !== 'Force' && effectOn(b, 'superdef', T.id));
  // Boon of Irresistible Offense: Bludgeoning, Piercing and Slashing damage ignores Resistance.
  if (resists && !(pierce && BPS.includes(type))) m /= 2;
  if (T.vuln?.includes(type)) m *= 2;
  return m;
}

// Half Cover from walls and creatures in the way, or from magic: Smite of
// Protection (Paladin 15) and Nature's Sanctuary (Circle of the Land 14).
function coverFor(b, from, T) {
  const c = coverBetween(b, from, T);
  if (c) return c;
  for (const e of b.effects || []) {
    if (e.type === 'smiteprot') {
      const P = b.creatures[e.by];
      if (P && !P.dead && P.side === T.side && (P === T || feetBetween(P, T) <= 10)) return { what: `Smite of Protection, ${P.name}`, magic: true, rule: 'smite-of-protection' };
    } else if (e.type === 'sanctuary' && T.side === b.creatures[e.by]?.side && cheb(e, T) <= 1) return { what: "Nature's Sanctuary", magic: true, rule: 'natures-sanctuary' };
  }
  return null;
}

// Resistances from spells: Stoneskin, Fire Shield (warm: Cold), Aura of Life.
function spellResist(b, T) {
  const out = [];
  if (!b?.effects?.length || !T) return out;
  for (const e of b.effects) {
    if (e.type === 'stoneskin' && e.target === T.id) out.push(...BPS);
    else if (e.type === 'fireshield' && e.target === T.id) out.push('Cold');
    else if (e.type === 'hdef' && e.target === T.id) out.push(...e.types);
    else if (e.type === 'sanctuary' && e.by !== T.id && b.creatures[e.by]?.side === T.side && cheb(e, T) <= 1) out.push(e.ward);
    else if (e.type === 'auralife') {
      const P = b.creatures[e.by];
      if (P && !P.dead && P.side === T.side && (P === T || feetBetween(P, T) <= 30)) out.push('Necrotic');
    }
  }
  return out;
}

// Options for the UI and the AI: every weapon attack A could make against T now.
export function attackOptions(b, A, T) {
  CUR = b;
  return A.attacks.map((atk) => optionFor(b, A, T, atk));
}

// Extra damage on a hit from features and spells: Rage, Hunter's Mark, Hex,
// Divine Favor, Colossus Slayer and Frenzy. `key` marks a once-per-turn one.
function hitExtras(b, A, T, atk) {
  const out = [];
  const weapon = !atk.spell;
  if (A.raging && weapon && atk.ability === 'str') out.push({ label: 'Rage Damage', flat: A.rageDmg, type: atk.type, rule: 'rage' });
  for (const e of b.effects) {
    if (e.type === 'mark' && e.by === A.id && e.target === T.id) {
      // Foe Slayer (Ranger 20): Hunter's Mark rolls a d10.
      const slayer = A.foeSlayer && e.spell === 'hunters-mark';
      out.push({ label: slayer ? `${e.name} (Foe Slayer)` : e.name, dice: slayer ? e.dice.replace(/d\d+$/, 'd10') : e.dice, type: e.dmgType, rule: slayer ? 'foe-slayer' : e.spell });
    }
    if (e.type === 'favor' && e.target === A.id && weapon) out.push({ label: 'Divine Favor', dice: '1d4', type: 'Radiant', rule: 'divine-favor' });
    if (e.type === 'magicweapon' && e.target === A.id && weapon && !atk.unarmed) out.push({ label: `Magic Weapon (+${e.amount})`, flat: e.amount, type: atk.type, rule: 'magic-weapon' });
  }
  if (A.prey === 'colossus' && weapon && T.hp < T.hpMax && A.colossusKey !== turnKey(b)) out.push({ label: 'Colossus Slayer', dice: '1d8', type: atk.type, rule: 'colossus-slayer', key: 'colossusKey' });
  const sd = A.improvedStrikes ? '2d8' : '1d8';
  if (A.divineStrike && weapon && A.strikeKey !== turnKey(b)) out.push({ label: 'Divine Strike', dice: sd, type: 'Radiant', rule: 'divine-strike', key: 'strikeKey' });
  if (A.primalStrike && weapon && A.strikeKey !== turnKey(b)) {
    const type = ['Cold', 'Fire', 'Lightning', 'Thunder'].sort((p, q) => damageMult(T, q, b) - damageMult(T, p, b))[0];
    out.push({ label: `Primal Strike (${type})`, dice: sd, type, rule: 'primal-strike', key: 'strikeKey' });
  }
  if (A.radiantStrikes && weapon && atk.kind === 'melee') out.push({ label: 'Radiant Strikes', dice: '1d8', type: 'Radiant', rule: 'radiant-strikes' });
  if (A.lifedrinker && weapon && atk.base === 'pact' && A.drinkKey !== turnKey(b)) out.push({ label: 'Lifedrinker', dice: '1d6', type: 'Necrotic', rule: 'lifedrinker', key: 'drinkKey' });
  if (atk.spell && A.potentSpell && SPELLS[atk.spell]?.level === 0) out.push({ label: 'Potent Spellcasting (WIS modifier)', flat: A.mods.wis, type: atk.type, rule: 'potent-spellcasting' });
  if (A.frenzy && A.raging && weapon && atk.ability === 'str' && b.turn?.who === A.id && A.frenzyKey !== turnKey(b)
    && b.effects.some((e) => e.type === 'reckless' && e.by === A.id)) out.push({ label: 'Frenzy', dice: `${A.rageDmg}d6`, type: atk.type, rule: 'frenzy', key: 'frenzyKey' });
  return out;
}
// Flat bonuses to an attack roll: Sacred Weapon.
function hitExtraParts(A, atk, b = null) {
  const out = [];
  if (A.sacredOn && atk.kind === 'melee' && !atk.spell) out.push({ label: 'Sacred Weapon (CHA modifier)', value: Math.max(1, A.mods.cha), rule: 'sacred-weapon' });
  const mw = b && !atk.spell && !atk.unarmed && b.effects.find((e) => e.type === 'magicweapon' && e.target === A.id);
  if (mw) out.push({ label: 'Magic Weapon', value: mw.amount, rule: 'magic-weapon' });
  return out;
}

function optionFor(b, A, T, atk) {
  const f = attackFactors(b, A, T, atk);
  const can = canTarget(b, A, T, atk);
  const bonus = hitBonus(atk) + sumParts(hitExtraParts(A, atk, b)) + sumParts(testParts(A)) + blessAvg(b, A);
  const ac = acAgainst(b, A, T, atk);
  const p = hitChance(bonus, ac.value, f.mode, A.luck);
  const sneak = sneakAllowed(b, A, T, atk, f.mode);
  let avg = (avgDice(atk.dice) + sumParts(atk.dmgFlat)) * damageMult(T, atk.type);
  for (const x of atk.extra || []) avg += (x.dice ? avgDice(x.dice) : x.flat) * damageMult(T, x.type);
  if (sneak) avg += avgDice(A.sneak) * damageMult(T, atk.type);
  if (atk.advDice && f.mode === 'advantage') avg += avgDice(atk.advDice);
  for (const x of hitExtras(b, A, T, atk)) avg += (x.dice ? avgDice(x.dice) : x.flat) * damageMult(T, x.type);
  return {
    atk, ok: can.ok, why: can.why || null, bonus, ac: ac.value, cover: ac.cover, p, mode: f.mode, adv: f.adv, dis: f.dis, sneak, avg,
    expected: can.ok ? p * avg : 0,
  };
}

function rollDamage(b, A, T, atk, crit, mode, nat20 = false) {
  const { n, sides } = parseDice(atk.dice);
  const nd = crit ? n * 2 : n;
  const parts = [];
  let rolls = b.maxDice && atk.spell ? Array(nd).fill(sides) : rollDice(b.rng, nd, sides);
  let gwf = null;
  const raise = (rs) => (atk.gwf ? rs.map((v) => (v < 3 ? 3 : v)) : rs);
  if (atk.gwf && rolls.some((v) => v < 3)) gwf = `Great Weapon Fighting: ${rolls.join('+')}, 1s and 2s count as 3`;
  rolls = raise(rolls);
  // Sorcerous Burst: each 8 on a d8 adds another d8, up to the spellcasting modifier.
  let burst = null;
  if (atk.explode > 0 && sides === 8) {
    const extra = [];
    let eights = rolls.filter((v) => v === 8).length;
    while (eights > 0 && extra.length < atk.explode) { const r = die(b.rng, 8); extra.push(r); eights += (r === 8 ? 1 : 0) - 1; }
    if (extra.length) { burst = `Sorcerous Burst: rolled ${extra.length === 1 ? 'an 8' : '8s'}, so +${extra.join('+')}`; rolls = [...rolls, ...extra]; }
  }
  // Empowered Spell: reroll the lowest dice (up to the CHA modifier) that came up below average.
  let empowered = null;
  if (atk.empowered > 0) {
    const idx = rolls.map((v, i) => [v, i]).filter(([v]) => v < (sides + 1) / 2).sort((p, q) => p[0] - q[0]).slice(0, atk.empowered).map(([, i]) => i);
    if (idx.length) {
      const was = [...rolls];
      for (const i of idx) rolls[i] = die(b.rng, sides);
      empowered = `Empowered Spell: rerolled ${idx.map((i) => was[i]).join(', ')} and got ${idx.map((i) => rolls[i]).join(', ')}`;
    }
  }
  let savage = null;
  if (A.savage && !atk.spell && A.savageKey !== turnKey(b)) {
    const again = raise(rollDice(b.rng, nd, sides));
    savage = { first: rolls, second: again };
    if (sum(again) > sum(rolls)) rolls = again;
    A.savageKey = turnKey(b);
  }
  parts.push({
    label: `${atk.name} ${nd}d${sides}${crit ? ' (dice doubled: Critical Hit)' : ''}`,
    rolls, value: sum(rolls), rule: crit ? 'critical-hit' : 'damage', type: atk.type,
    savage: savage ? `Savage Attacker: rolled ${savage.first.join('+')} and ${savage.second.join('+')}, kept the higher` : null,
    gwf: [gwf, burst, empowered].filter(Boolean).join('; ') || null,
  });
  for (const f of atk.dmgFlat) parts.push({ label: f.label, value: f.value, rule: f.rule, type: atk.type });
  const extra = (label, dice, rule, type) => {
    const s = parseDice(dice);
    const k = crit ? s.n * 2 : s.n;
    const r = rollDice(b.rng, k, s.sides);
    parts.push({ label: `${label} ${k}d${s.sides}`, rolls: r, value: sum(r), rule, type });
  };
  for (const x of atk.extra || []) {
    if (x.dice) extra(`Extra ${x.type}`, x.dice, 'stat-block', x.type);
    else parts.push({ label: `Extra ${x.type}`, value: x.flat, rule: 'stat-block', type: x.type });
  }
  const sneakWhy = sneakAllowed(b, A, T, atk, mode);
  let trip = false;
  const cunning = [];
  if (sneakWhy) {
    // Cunning Strike (Rogue 5): effects paid for with Sneak Attack dice. Trip (1 die) when the target is up and
    // someone is next to it to make use of it. Improved Cunning Strike (11): two effects; the second is Poison
    // (1 die), or Daze (2 dice) once Devious Strikes (14) comes; Knock Out (6 dice) goes on a foe with Hit Points to spare.
    const sd = parseDice(A.sneak);
    let left = sd.n;
    const room = !A.cunningStrike ? 0 : A.improvedCunning ? 2 : 1;
    const immune = (c) => (T.condImmune || []).includes(c);
    const pay = (id, cost) => { if (cunning.length < room && left - cost >= 1) { cunning.push(id); left -= cost; return true; } return false; };
    if (A.devious && T.hp >= 45 && !immune('unconscious')) pay('knockout', 6);
    trip = !hasCond(T, 'prone') && SIZE[T.size || 'medium'] <= SIZE.large && !immune('prone')
      && [A, ...alliesOf(b, A)].some((o) => !incap(o) && !o.dead && cheb(o, T) <= 1) && pay('trip', 1);
    if (A.devious && !immune('incapacitated')) pay('daze', 2);
    else if (A.improvedCunning && !immune('poisoned') && !(T.immune || []).includes('Poison')) pay('poison', 1);
    const NAMES = { knockout: 'Knock Out', trip: 'Trip', daze: 'Daze', poison: 'Poison' };
    const spent = sd.n - left;
    extra(`Sneak Attack (${sneakWhy}${spent ? `; ${spent}d6 spent on Cunning Strike: ${cunning.map((c) => NAMES[c]).join(' and ')}` : ''})`, `${left}d6`, 'sneak-attack', atk.type);
    A.sneakKey = turnKey(b);
  }
  if (atk.advDice && mode === 'advantage') extra('Extra (attacked with Advantage)', atk.advDice, 'stat-block', atk.type);
  if (atk.brutal) extra('Brutal Strike', A.brutal, 'brutal-strike', atk.type);
  for (const x of hitExtras(b, A, T, atk)) {
    if (x.dice) extra(x.label, x.dice, x.rule, x.type);
    else parts.push({ label: x.label, value: x.flat, rule: x.rule, type: x.type });
    if (x.key) A[x.key] = turnKey(b);
  }

  if (A.giant?.uses > 0 && A.giantKey !== turnKey(b) && (A.giant.kind === 'fire' || A.giant.kind === 'frost')) {
    if (A.giant.kind === 'fire') extra("Fire's Burn", '1d10', 'giant-ancestry', 'Fire');
    else extra("Frost's Chill", '1d6', 'giant-ancestry', 'Cold');
    A.giant.uses--;
    A.giantKey = turnKey(b);
    parts.frost = A.giant.kind === 'frost';
  }
  // Overwhelming Strike (Boon of Irresistible Offense): a 20 on the d20 adds damage equal to the raised score.
  if (nat20 && A.irresistible && !atk.spell) parts.push({ label: 'Overwhelming Strike (Boon of Irresistible Offense)', value: A.irresistible, rule: 'boon-of-irresistible-offense', type: atk.type });
  const out = finishDamage(T, parts, !!A.irresistible);
  out.frost = !!parts.frost;
  out.trip = trip;
  out.cunning = cunning;
  return out;
}

// Total the parts per damage type, applying T's Resistances, Vulnerabilities
// and Immunities to each type once.
function finishDamage(T, parts, pierce = false) {
  const byType = {};
  for (const p of parts) byType[p.type] = (byType[p.type] || 0) + p.value;
  const adjust = [];
  let total = 0;
  for (const [type, raw] of Object.entries(byType)) {
    const v = Math.max(0, raw);
    // Fire Absorption (Iron Golem): instead of taking the damage, it regains that many Hit Points.
    if ((T.absorb || []).includes(type)) {
      const gain = Math.min(v, Math.max(0, T.hpMax - T.hp));
      if (T.hp > 0 && !T.dead) T.hp += gain;
      adjust.push({ type, from: v, to: 0, why: `${T.absorbName || 'Absorption'}: it regains ${gain} Hit Points instead`, rule: 'stat-block' });
      continue;
    }
    const m = damageMult(T, type, CUR, pierce);
    const got = Math.floor(v * m);
    if (m !== 1) adjust.push({ type, from: v, to: got, why: m === 0 ? 'Immunity' : m < 1 ? 'Resistance (half)' : 'Vulnerability (double)', rule: m === 0 ? 'immunity' : m < 1 ? 'resistance' : 'vulnerability' });
    else if (pierce && BPS.includes(type) && damageMult(T, type) < 1) adjust.push({ type, from: v, to: got, why: 'Resistance ignored (Boon of Irresistible Offense)', rule: 'boon-of-irresistible-offense' });
    total += got;
  }
  const types = Object.keys(byType);
  return { parts, total, type: types.join(' and '), types, adjust };
}
const adjustText = (d) => (d?.adjust?.length ? ` (${d.adjust.map((a) => `${a.type} ${a.from}→${a.to}, ${a.why}`).join('; ')})` : '');

// Apply damage, handling Temporary HP, 0 HP, death saves and instant death.
// meta: { crit, types } for Undead Fortitude; queues Concentration checks.
function applyDamage(b, T, amount, meta = {}) {
  const crit = !!meta.crit;
  const before = T.hp;
  const out = { before, after: before, downed: false, dead: false, deathFail: 0 };
  if (amount <= 0) return out;
  // Stone's Endurance (Goliath): a Reaction that soaks a big hit.
  if (T.giant?.kind === 'stone' && T.giant.uses > 0 && T.reaction && !incap(T) && T.hp > 0 && (amount >= 6 || amount >= T.hp)) {
    const r = die(b.rng, 12);
    const cut = Math.max(0, r + T.mods.con);
    T.giant.uses--;
    T.reaction = false;
    out.stone = { roll: r, cut, from: amount };
    amount = Math.max(0, amount - cut);
    if (amount <= 0) return out;
  }
  const A = meta.by ? C(b, meta.by) : null;
  if (A && A !== T && hostile(A, T)) b.post.push({ kind: 'retaliate', id: T.id, by: A.id });
  if (T.tempHp > 0) {
    const soak = Math.min(T.tempHp, amount);
    T.tempHp -= soak;
    amount -= soak;
    out.temp = soak;
    if (amount <= 0) { b.post.push({ kind: 'hurt', id: T.id, dmg: soak }); return out; }
  }
  b.post.push({ kind: 'hurt', id: T.id, dmg: amount + (out.temp || 0) });
  const burned = !!T.regen && (meta.types || []).some((ty) => ty === 'Fire' || ty === 'Acid');
  if (burned) T.regen.blocked = true;
  if (T.hp > 0) {
    const left = T.hp - amount;
    if (left > 0) { T.hp = left; out.after = left; return out; }
    T.hp = 0;
    out.after = 0;
    const ward = effectOn(b, 'deathward', T.id);
    if (ward) {
      b.effects = b.effects.filter((e) => e !== ward);
      T.hp = 1; out.after = 1; out.deathward = true;
      return out;
    }
    if (T.undeadFortitude && !crit && !(meta.types || []).includes('Radiant')) {
      const dc = 5 + amount;
      const sv = savingThrow(b, T, 'con', dc);
      out.fortitude = { dc, total: sv.total, success: sv.success, d20: sv.d20, mods: sv.mods };
      if (sv.success) { T.hp = 1; out.after = 1; return out; }
    }
    // Regeneration (Troll): at 0 Hit Points it isn't dead yet, unless Fire or Acid has stopped it regenerating.
    if (T.side === 'foe' && T.regen && !T.regen.blocked) {
      out.downed = true; out.regenDown = true;
      if (!hasCond(T, 'prone')) T.conds.push({ id: 'prone', why: 'dropped' });
      return out;
    }
    if (T.side === 'foe') { T.dead = true; out.dead = true; out.burned = !!T.regen; b.post.push({ kind: 'blessing', id: T.id, by: meta.by || null }); if (T.throes) b.post.push({ kind: 'throes', id: T.id }); return out; }
    if (-left >= T.hpMax) { T.dead = true; T.diedRound = b.round; out.dead = true; out.massive = true; return out; }
    // Relentless Rage (Barbarian 11): a raging barbarian at 0 makes a Constitution save to stay up.
    if (T.raging && T.relentlessRage) {
      const dc = T.relentlessRage.dc;
      const sv = savingThrow(b, T, 'con', dc);
      T.relentlessRage.dc += 5;
      out.rage = { dc, total: sv.total, success: sv.success };
      if (sv.success) { T.hp = 2 * T.level; out.after = T.hp; return out; }
    }
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
    dropCond(T, 'hidden');
    if (!hasCond(T, 'prone')) T.conds.push({ id: 'prone', why: 'fell Unconscious' });
    return out;
  }
  // A Troll at 0 HP that takes Fire or Acid won't regenerate on its turn, so it dies.
  if (T.side === 'foe' && T.regen && !T.dead && burned) {
    T.dead = true; out.dead = true; out.burned = true;
    b.post.push({ kind: 'blessing', id: T.id, by: meta.by || null });
    return out;
  }
  // Already at 0 HP: damage is a failed death save (two on a Critical Hit).
  if (T.side === 'hero' && !T.dead) {
    if (amount >= T.hpMax) { T.dead = true; T.diedRound = b.round; out.dead = true; out.massive = true; return out; }
    T.stable = false;
    out.deathFail = crit ? 2 : 1;
    T.deathSaves.f += out.deathFail;
    if (T.deathSaves.f >= 3) { T.dead = true; T.diedRound = b.round; out.dead = true; }
  }
  return out;
}

function afterText(T, after) {
  if (!after) return '';
  if (after.stone) return ` ${T.name} uses Stone's Endurance (Reaction): 1d12 (${after.stone.roll}) ${signed(T.mods.con)} = ${after.stone.cut} less damage, so ${Math.max(0, after.stone.from - after.stone.cut)} gets through.${afterText(T, { ...after, stone: null })}`;
  if (after.fortitude?.success) return ` ${T.name} should drop, but Undead Fortitude holds it up: CON save ${after.fortitude.total} vs DC ${after.fortitude.dc}, 1 HP left.`;
  let pre = '';
  if (after.fortitude) pre = ` Undead Fortitude fails (CON save ${after.fortitude.total} vs DC ${after.fortitude.dc}).`;
  if (after.burned) return `${pre} The Fire or Acid stops its Regeneration: ${T.name} is destroyed.`;
  if (after.dead) return `${pre}${T.side === 'foe' ? ` ${T.name} is defeated.` : ` ${T.name} dies.`}`;
  if (after.regenDown) return ` ${T.name} drops to 0 HP but isn't dead: Regeneration brings it back on its turn, unless it takes Fire or Acid damage first.`;
  if (after.rage?.success) return ` ${T.name} should drop, but Relentless Rage holds: DC ${after.rage.dc} Constitution save ${after.rage.total}, back up to ${after.after} HP. The next one is DC ${after.rage.dc + 5}.`;
  if (after.rage) pre += ` Relentless Rage fails (DC ${after.rage.dc} Constitution save, ${after.rage.total}).`;
  if (after.relentless) return `${pre} ${T.name} drops to 1 HP instead of 0 (Relentless Endurance).`;
  if (after.deathward) return ` ${T.name} drops to 1 HP instead of 0, and Death Ward ends.`;
  if (after.downed) return `${pre} ${T.name} drops to 0 HP and falls Unconscious.`;
  if (after.deathFail) return ` ${T.name} suffers ${after.deathFail} failed death save${after.deathFail > 1 ? 's' : ''}.`;
  return pre;
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

// Would the Shield spell turn this hit into a miss, and can T cast it now?
function shieldWorks(b, T, total, ac, natural) {
  if (natural >= 20 || T.side !== 'hero') return false;
  if (!T.casting?.known?.shield || !T.reaction || incap(T)) return false;
  if (total >= ac + 5) return false;
  return !!slotFor(b, T, 'shield');
}

function attack(b, A, T0, atk, { reaction = false, why = null, oa = false } = {}) {
  const T = redirect(b, A, T0);
  // Empowered Strikes (Monk 6): an Unarmed Strike can deal Force damage instead.
  if (A.empoweredStrikes && atk.unarmed && damageMult(T, 'Force', b) > damageMult(T, atk.type, b)) atk = { ...atk, type: 'Force', name: `${atk.name} (Force: Empowered Strikes)` };
  if (T !== T0 && !inRange(A, T, atk)) {
    emit(b, { kind: 'note', by: A.id, text: `${T.name} is out of reach: the attack is lost.`, rule: 'redirect-attack' });
    return;
  }
  if (hasCond(A, 'hidden')) { dropCond(A, 'hidden'); A.revealed = true; }
  if (b.turn?.who === A.id && !reaction) { b.turn.rolled = true; (b.turn.attacked ||= []).push(T.id); }
  if (A.raging && hostile(A, T)) A.raging.kept = true;
  const f = attackFactors(b, A, T, atk);
  if (A.revealed) { f.adv.push({ text: `${A.name} attacked from hiding`, rule: 'hide' }); f.mode = modeFrom(f.adv, f.dis); A.revealed = false; }
  if (oa && T.tactics === 'horde') { f.dis.push({ text: `Escape the Horde: Opportunity Attacks against ${T.name} have Disadvantage`, rule: 'escape-the-horde' }); f.mode = modeFrom(f.adv, f.dis); }
  b.effects = b.effects.filter((e) => !f.uses.includes(e));
  // Brutal Strike (Barbarian 9): give up the Advantage of a Reckless Strength attack for +1d10 and a blow.
  let brutal = false;
  if (A.brutal && !reaction && b.turn?.who === A.id && A.brutalKey !== turnKey(b) && atk.ability === 'str' && !atk.spell && f.mode === 'advantage' && !f.dis.length
    && b.effects.some((e) => e.type === 'reckless' && e.by === A.id)
    && hitChance(hitBonus(atk) + sumParts(hitExtraParts(A, atk, b)) + sumParts(testParts(A)), acAgainst(b, A, T, atk).value, 'normal', A.luck) >= 0.55) {
    brutal = true;
    A.brutalKey = turnKey(b);
    f.mode = 'normal';
    atk = { ...atk, brutal: true };
  }
  const d20 = rollD20(b, A, f.mode);
  const mods = [...atk.hit, ...hitExtraParts(A, atk, b), ...testParts(A)];
  const bl = blessPart(b, A);
  if (bl) mods.push(bl);
  const bn = banePart(b, A);
  if (bn) mods.push(bn);
  // Sundering Blow (Barbarian 13): the next attack roll by someone else against the target gets +5.
  const sund = b.effects.find((e) => e.type === 'sundered' && e.target === T.id && e.by !== A.id);
  if (sund) { mods.push({ label: `Sundering Blow (${C(b, sund.by)?.name || 'a barbarian'})`, value: 5, rule: 'brutal-strike' }); b.effects = b.effects.filter((e) => e !== sund); }
  const ctx = { a: A.id, t: T.id, atk, d20: { ...d20, adv: brutal ? [] : f.adv, dis: f.dis }, mode: f.mode, mods, reaction, why, notes: brutal ? [{ text: `Brutal Strike: gives up the Advantage from Reckless Attack for +${A.brutal} damage and ${A.brutalTwo ? 'two blows' : 'a blow'}`, rule: 'brutal-strike' }] : [] };
  if (f.elusive) ctx.notes.push({ text: `Elusive: no attack roll has Advantage against ${T.name}`, rule: 'elusive' });
  const ac = acAgainst(b, A, T, atk);
  let total = d20.kept + sumParts(mods);
  if (A.side === 'hero' && d20.kept < critOn(A, atk) && (d20.kept === 1 || total < ac.value)) {
    if (inspire(b, A, ctx.d20)) total = ctx.d20.kept + sumParts(mods);
  }
  // Seeking Spell: a missed spell attack rerolls its d20.
  if (atk.seeking && ctx.d20.kept < critOn(A, atk) && (ctx.d20.kept === 1 || total < ac.value)) {
    const was = ctx.d20.kept;
    const fresh = die(b.rng, 20);
    ctx.d20.rolls = [...ctx.d20.rolls, fresh];
    ctx.d20.kept = fresh;
    total = fresh + sumParts(mods);
    ctx.notes.push({ text: `Seeking Spell: rerolled the ${was}, got ${fresh}`, rule: 'metamagic' });
  }
  if (A.side === 'hero' && ctx.d20.kept !== 1 && ctx.d20.kept < critOn(A, atk) && total < ac.value) {
    const bi = bardicTry(b, A, ac.value - total);
    if (bi) { mods.push(bi); total += bi.value; }
  }
  // Peerless Skill (Lore Bard 14): a failed attack roll can add a Bardic Inspiration die; it's spent only if it works.
  if (A.peerless && A.bardic?.uses > 0 && ctx.d20.kept !== 1 && ctx.d20.kept < critOn(A, atk) && total < ac.value && ac.value - total <= A.bardic.die) {
    const r = die(b.rng, A.bardic.die);
    if (total + r >= ac.value) {
      A.bardic.uses--;
      mods.push({ label: `Peerless Skill (d${A.bardic.die})`, value: r, rolls: [r], rule: 'peerless-skill' });
      total += r;
      ctx.notes.push({ text: `Peerless Skill: ${A.name} adds a Bardic Inspiration die (${r}) to turn the miss into a hit (${s1(A.bardic.uses, 'use')} left)`, rule: 'peerless-skill' });
    } else ctx.notes.push({ text: `Peerless Skill: the Bardic Inspiration die (${r}) isn't enough, so it isn't spent`, rule: 'peerless-skill' });
  }
  // Cutting Words: a bard's Reaction takes a die off an enemy's hit, when it could make it miss.
  if (A.side === 'foe' && ctx.d20.kept !== 1 && ctx.d20.kept < critOn(A, atk) && total >= ac.value) {
    const need = total - ac.value + 1;
    const bard = Object.values(b.creatures).find((H) => H.cuttingWords && H.side !== A.side && H.bardic?.uses > 0 && H.reaction && !incap(H) && !H.dead
      && feetBetween(H, A) <= 60 && lineOfSight(b, H, A) && need <= H.bardic.die);
    if (bard) {
      bard.bardic.uses--;
      bard.reaction = false;
      const r = die(b.rng, bard.bardic.die);
      mods.push({ label: `Cutting Words (${bard.name}, d${bard.bardic.die})`, value: -r, rolls: [r], rule: 'cutting-words' });
      total -= r;
      ctx.notes.push({ text: `${bard.name} uses Cutting Words (Reaction, ${s1(bard.bardic.uses, 'Bardic Inspiration')} left): −${r}`, rule: 'cutting-words' });
    }
  }
  // Parry (Knight, Warrior Veteran, Bandit Captain): a Reaction that adds to AC against one melee hit, used when it turns the hit into a miss.
  if (T.parry && T.reaction && !incap(T) && T.hp > 0 && (atk.kind === 'melee' || T.parryAny) && ctx.d20.kept !== 1 && ctx.d20.kept < critOn(A, atk) && total >= ac.value && total < ac.value + T.parry) {
    T.reaction = false;
    ctx.parry = T.parry;
    ctx.notes.push({ text: T.parryName ? `${T.name} uses ${T.parryName} (Reaction): +${T.parry} AC against this attack` : `${T.name} parries (Reaction): +${T.parry} AC against this attack`, rule: 'parry' });
  }
  // Protective Magic (Mage): a stat-block Shield, cast without a prompt when +5 AC turns the hit into a miss.
  const ks = T.side === 'foe' ? T.casting?.known?.shield : null;
  if ((ks?.free > 0 || ks?.atWill) && T.reaction && !incap(T) && T.hp > 0 && !ctx.parry && ctx.d20.kept !== 1 && ctx.d20.kept < critOn(A, atk) && total >= ac.value && total < ac.value + 5) {
    T.reaction = false;
    if (!ks.atWill) ks.free--;
    b.effects.push({ type: 'shield', by: T.id, target: T.id, expires: { when: 'start', who: T.id } });
    emit(b, { kind: 'cast', by: T.id, spell: 'shield', level: 1, slot: 1, pay: 'free', reaction: true, rule: 'shield',
      text: `${T.name} casts Shield as a Reaction (${ks.atWill ? 'at will' : `${ks.free} left today`}): +5 AC until the start of its next turn.` });
  }
  ctx.total = total;
  if (d20.kept < critOn(A, atk) && ctx.d20.kept !== 1 && total >= ac.value + (ctx.parry || 0) && shieldWorks(b, T, total, ac.value, ctx.d20.kept)) {
    flushMove(b);
    b.pending = { kind: 'shield', reactor: T.id, attacker: A.id, ctx, total, ac: ac.value };
    emit(b, { kind: 'prompt', by: T.id, target: A.id, text: `${A.name}'s attack (${total}) would hit ${T.name} (AC ${ac.value}).`, rule: 'shield' });
    return;
  }
  finishAttack(b, ctx);
}

function finishAttack(b, ctx) {
  const A = C(b, ctx.a), T = C(b, ctx.t), atk = ctx.atk;
  const d20 = ctx.d20, total = ctx.total;
  const ac0 = acAgainst(b, A, T, atk);
  const ac = ctx.parry ? { value: ac0.value + ctx.parry, parts: [...ac0.parts, { label: T.parryName || 'Parry', value: ctx.parry, rule: 'parry' }] } : ac0;
  let outcome;
  if (d20.kept >= critOn(A, atk)) outcome = 'crit';
  else if (d20.kept === 1) outcome = 'fumble';
  else outcome = total >= ac.value ? 'hit' : 'miss';
  const notes = [...(ctx.notes || [])];
  if (outcome === 'miss' || outcome === 'fumble') {
    // Stroke of Luck (Rogue 20): the d20 becomes a 20, once per Short or Long Rest (here: against a foe with 100+ Hit Points).
    if (A.strokeOfLuck?.uses > 0 && T.hp >= 100 && !atk.spell) {
      A.strokeOfLuck.uses--;
      notes.push({ text: `Stroke of Luck: ${A.name} turns the ${d20.kept} into a 20 (back on a Short or Long Rest)`, rule: 'stroke-of-luck' });
      d20.kept = 20;
      outcome = 'crit';
    } else if (A.combatProwess && !A.prowessUsed) {
      // Boon of Combat Prowess: a miss becomes a hit, once until the start of their next turn.
      A.prowessUsed = true;
      notes.push({ text: `Peerless Aim (Boon of Combat Prowess): ${A.name} hits instead of missing`, rule: 'boon-of-combat-prowess' });
      outcome = 'hit';
    }
  }
  if (d20.kept < 20 && outcome === 'crit') notes.push({ text: critOn(A, atk) <= 18 ? `Superior Critical: an 18 or 19 is a Critical Hit too` : 'Improved Critical: a 19 is a Critical Hit too', rule: 'improved-critical' });
  // Studied Attacks (Fighter 13): a miss gives Advantage on the next attack roll against that creature.
  if (A.studied) {
    b.effects = b.effects.filter((e) => !(e.type === 'studied' && e.by === A.id && e.target === T.id));
    if (outcome === 'miss' || outcome === 'fumble') b.effects.push({ type: 'studied', by: A.id, target: T.id, expires: { when: 'end', who: A.id, skip: b.turn?.who === A.id ? 1 : 0 } });
  }
  if (outcome === 'hit' && helpless(T) && cheb(A, T) <= 1) {
    outcome = 'crit';
    notes.push({ text: `Any hit from within 5 feet on a${hasCond(T, 'paralyzed') && !down(T) ? ' Paralyzed' : 'n Unconscious'} creature is a Critical Hit`, rule: hasCond(T, 'paralyzed') && !down(T) ? 'paralyzed' : 'unconscious' });
  }
  if (d20.inspired) notes.push({ text: `Heroic Inspiration: rerolled the ${d20.inspired.from}, got ${d20.inspired.to}`, rule: 'heroic-inspiration' });
  const hit = outcome === 'hit' || outcome === 'crit';
  let damage = null, after = null, mastery = null, rider = null, deflect = null;
  const later = [];   // notes that follow the attack: Superior Hunter's Prey, Hurl Through Hell
  if (hit) {
    damage = rollDamage(b, A, T, atk, outcome === 'crit', ctx.mode, d20.kept === 20);
    // Deflect Attacks (Monk 3): a Reaction that takes damage off a weapon-like hit, and can send it back.
    if (T.deflect && T.reaction && !incap(T) && T.hp > 0 && (BPS.includes(atk.type) || T.deflectEnergy) && damage.total > 0) {
      T.reaction = false;
      const r = die(b.rng, 10);
      const cut = Math.max(0, r + T.mods.dex + T.level);
      deflect = { roll: r, cut, from: damage.total };
      damage.total = Math.max(0, damage.total - cut);
      const near = atk.kind === 'ranged' ? feetBetween(T, A) <= 60 : feetBetween(T, A) <= 5;
      if (damage.total === 0 && T.focus?.uses > 0 && near && !A.dead) { T.focus.uses--; deflect.back = true; }
      notes.push({ text: `${T.name} uses Deflect ${BPS.includes(atk.type) ? 'Attacks' : 'Energy'} (Reaction): 1d10 (${r}) + DEX + Monk level = ${cut} less damage${deflect.back ? `, all of it, and spends 1 Focus Point to send it back (${T.focus.uses} left)` : ''}`, rule: 'deflect-attacks' });
    }
    // Uncanny Dodge (Rogue 5): a Reaction that halves an attack's damage.
    if (T.uncannyDodge && T.reaction && !incap(T) && T.hp > 0 && damage.total >= 4 && lineOfSight(b, T, A)) {
      T.reaction = false;
      const was = damage.total;
      damage.total = Math.floor(was / 2);
      notes.push({ text: `${T.name} uses Uncanny Dodge (Reaction): ${was} damage halved to ${damage.total}`, rule: 'uncanny-dodge' });
    }
    // Superior Hunter's Defense (Hunter 15): a Reaction that gives Resistance to this damage's types for the turn.
    if (T.superiorDefense && T.reaction && !incap(T) && T.hp > 0 && damage.total >= Math.max(10, Math.floor(T.hp / 3)) && damage.types.some((ty) => damageMult(T, ty, b) === 1)) {
      T.reaction = false;
      b.effects.push({ type: 'hdef', by: T.id, target: T.id, types: [...damage.types], expires: { when: 'end', who: b.turn?.who || A.id } });
      const was = damage.total;
      damage = { ...finishDamage(T, damage.parts), cunning: damage.cunning, trip: damage.trip, frost: damage.frost };
      notes.push({ text: `${T.name} uses Superior Hunter's Defense (Reaction): Resistance to ${damage.types.join(' and ')} for the rest of the turn, ${was} damage down to ${damage.total}`, rule: 'superior-hunters-defense' });
    }
    after = applyDamage(b, T, damage.total, { crit: outcome === 'crit', types: damage.types, by: A.id });
    let alive = !T.dead && T.hp > 0;
    // Superior Hunter's Prey (Hunter 11): Hunter's Mark damage spills onto a second creature within 30 feet.
    const markPart = A.superiorPrey && A.spillKey !== turnKey(b) ? damage.parts.find((x) => x.rule === 'hunters-mark') : null;
    if (markPart && markPart.value > 0) {
      const X = enemiesOf(b, A).find((o) => o !== T && !o.dead && o.hp > 0 && onBoard(o) && feetBetween(T, o) <= 30 && lineOfSight(b, A, o));
      if (X) {
        A.spillKey = turnKey(b);
        const d2 = finishDamage(X, [{ label: "Superior Hunter's Prey", value: markPart.value, rule: 'superior-hunters-prey', type: markPart.type }]);
        const a2 = applyDamage(b, X, d2.total, { types: d2.types, by: A.id });
        later.push({ kind: 'note', by: A.id, target: X.id, rule: 'superior-hunters-prey', text: `Superior Hunter's Prey: the mark's ${markPart.value} ${markPart.type} damage also hits ${X.name} for ${d2.total}${adjustText(d2)}.${afterText(X, a2)}` });
      }
    }
    // Hurl Through Hell (Fiend Warlock 14): once per turn on a hit, a tough foe saves or is hurled away.
    if (A.hurl?.uses > 0 && alive && A.hurlKey !== turnKey(b) && T.hp >= 40 && A.casting?.stats?.cha && !hasCond(T, 'incapacitated')) {
      A.hurl.uses--;
      A.hurlKey = turnKey(b);
      const dcp = A.casting.stats.cha.dc;
      const sv = savingThrow(b, T, 'cha', sumParts(dcp));
      let what;
      if (sv.success) what = `Hurl Through Hell: ${T.name} makes its DC ${sumParts(dcp)} Charisma save (${sv.total}) and stays put.`;
      else {
        addCond(b, T, { id: 'incapacitated', by: A.id, endsOn: { when: 'end', who: A.id, skip: b.turn?.who === A.id ? 1 : 0 }, rule: 'hurl-through-hell' });
        const fiend = T.creature === 'fiend';
        const rs = fiend ? [] : rollDice(b.rng, 8, 10);
        const d3 = fiend ? { total: 0, types: [] } : finishDamage(T, [{ label: 'Hurl Through Hell 8d10', rolls: rs, value: sum(rs), rule: 'hurl-through-hell', type: 'Psychic' }]);
        const a3 = d3.total ? applyDamage(b, T, d3.total, { types: d3.types, by: A.id }) : null;
        what = `Hurl Through Hell: ${T.name} fails its DC ${sumParts(dcp)} Charisma save (${sv.total}) and drops through the lower planes, Incapacitated until the end of ${A.name}'s next turn${fiend ? '. A Fiend takes no damage from the trip' : `, taking 8d10 (${rs.join(' + ')}) = ${d3.total} Psychic damage${adjustText(d3)}`}.${a3 ? afterText(T, a3) : ''} (${A.hurl.uses} use${A.hurl.uses === 1 ? '' : 's'} left today.)`;
      }
      later.push({ kind: 'note', by: A.id, target: T.id, rule: 'hurl-through-hell', text: what });
      alive = !T.dead && T.hp > 0;
    }
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
      } else if (atk.mastery === 'slow' && damage.total > 0) {
        b.effects = b.effects.filter((e) => !(e.type === 'slowed' && e.target === T.id));
        b.effects.push({ type: 'slowed', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
        mastery.text = `${T.name}'s Speed drops by 10 feet until the start of ${A.name}'s next turn.`;
      } else if (atk.mastery === 'topple') {
        const dc = 8 + (atk.abilityMod || 0) + (A.pb || 2);
        const sv = savingThrow(b, T, 'con', dc);
        if (!sv.success) addCond(b, T, { id: 'prone', by: A.id });
        mastery.text = `${T.name} makes a DC ${dc} Constitution save: ${sv.total}, ${sv.success ? 'stays standing' : 'falls Prone'}.`;
      } else if (atk.mastery === 'nick' || atk.mastery === 'graze') mastery = null;
    }
    // Cunning Strike: Trip. A Large or smaller target makes a Dexterity save or falls Prone.
    if (damage.trip && alive) {
      const dc = 8 + A.mods.dex + A.pb;
      const sv = savingThrow(b, T, 'dex', dc);
      if (!sv.success) addCond(b, T, { id: 'prone', by: A.id });
      rider = { text: `Cunning Strike (Trip): ${T.name} makes a DC ${dc} Dexterity save: ${sv.total}, ${sv.success ? 'keeps its feet' : 'falls Prone'}.`, rule: 'cunning-strike' };
    }
    for (const c of (damage.cunning || []).filter((x) => x !== 'trip')) {
      if (T.dead || T.hp <= 0) break;
      const dc = 8 + A.mods.dex + A.pb;
      const sv = savingThrow(b, T, 'con', dc);
      let what;
      if (c === 'poison') {
        const got = !sv.success && addCond(b, T, { id: 'poisoned', by: A.id, saveEnds: { ability: 'con', dc }, rule: 'cunning-strike' });
        what = `Cunning Strike (Poison): DC ${dc} Constitution save, ${sv.total}: ${got ? 'Poisoned for 1 minute, saving again at the end of each of its turns' : 'it shrugs it off'}.`;
      } else if (c === 'daze') {
        const got = !sv.success && addCond(b, T, { id: 'dazed', by: A.id, endsOn: { when: 'end', who: T.id, skip: b.turn?.who === T.id ? 1 : 0 }, rule: 'devious-strikes' });
        what = `Devious Strikes (Daze): DC ${dc} Constitution save, ${sv.total}: ${got ? 'on its next turn it can only move or act, not both, and gets no Bonus Action' : 'it keeps its wits'}.`;
      } else {
        const got = !sv.success && addCond(b, T, { id: 'unconscious', by: A.id, saveEnds: { ability: 'con', dc }, endsOnDamage: true, rule: 'devious-strikes' });
        if (got && !hasCond(T, 'prone')) T.conds.push({ id: 'prone', why: 'knocked out' });
        what = `Devious Strikes (Knock Out): DC ${dc} Constitution save, ${sv.total}: ${got ? 'Unconscious for 1 minute, until it takes damage or saves at the end of a turn' : 'it stays awake'}.`;
      }
      rider = rider ? { text: `${rider.text} ${what}`, rule: rider.rule } : { text: what, rule: c === 'poison' ? 'cunning-strike' : 'devious-strikes' };
    }
    if (damage.frost && alive) {
      b.effects = b.effects.filter((e) => !(e.type === 'chill' && e.target === T.id));
      b.effects.push({ type: 'chill', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
      rider = { text: `Frost's Chill: ${T.name}'s Speed drops by 10 feet until the start of ${A.name}'s next turn.`, rule: 'giant-ancestry' };
    }
    if (A.giant?.kind === 'hill' && A.giant.uses > 0 && A.giantKey !== turnKey(b) && alive && damage.total > 0 && SIZE[T.size || 'medium'] <= SIZE.large && !hasCond(T, 'prone')) {
      A.giant.uses--;
      A.giantKey = turnKey(b);
      if (addCond(b, T, { id: 'prone', by: A.id })) rider = { text: `Hill's Tumble: ${T.name} is knocked Prone.`, rule: 'giant-ancestry' };
    }
    const skipMine = current(b)?.id === A.id ? 1 : 0;
    if (atk.rider === 'grave' && alive) {
      b.effects.push({ type: 'grave', by: A.id, target: T.id, expires: { when: 'end', who: A.id, skip: skipMine } });
      rider = { text: `${T.name} can't regain Hit Points until the end of ${A.name}'s next turn.`, rule: 'chill-touch' };
    }
    if (atk.rider === 'shocked' && alive) {
      b.effects.push({ type: 'shocked', by: A.id, target: T.id, expires: { when: 'start', who: T.id } });
      rider = { text: `${T.name} can't make Opportunity Attacks until the start of its next turn.`, rule: 'shocking-grasp' };
    }
    if (atk.rider === 'drain' && damage.total > 0) {
      const gain = Math.floor(damage.total / 2);
      const was = A.hp;
      if (!b.effects.some((e) => e.type === 'grave' && e.target === A.id) && A.hp > 0) A.hp = Math.min(A.hpMax, A.hp + gain);
      rider = { text: `Vampiric Touch: ${A.name} regains ${A.hp - was} Hit Points (half the damage${A.hp - was < gain ? ', up to their maximum' : ''}).`, rule: 'vampiric-touch' };
    }
    if (atk.rider === 'sicken' && alive) {
      if (addCond(b, T, { id: 'poisoned', by: A.id, endsOn: { when: 'end', who: A.id, skip: skipMine }, rule: 'ray-of-sickness' })) {
        rider = { text: `${T.name} is Poisoned until the end of ${A.name}'s next turn.`, rule: 'ray-of-sickness' };
      }
    }
    if (atk.rider === 'guided' && alive) {
      b.effects.push({ type: 'guided', by: A.id, target: T.id, expires: { when: 'end', who: A.id, skip: current(b)?.id === A.id ? 1 : 0 } });
      rider = { text: `The next attack roll against ${T.name} before the end of ${A.name}'s next turn has Advantage.`, rule: 'guiding-bolt' };
    }
    if (atk.rider === 'chill' && alive) {
      b.effects = b.effects.filter((e) => !(e.type === 'chill' && e.target === T.id));
      b.effects.push({ type: 'chill', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
      rider = { text: `${T.name}'s Speed drops by 10 feet until the start of ${A.name}'s next turn.`, rule: atk.spell ? 'ray-of-frost' : 'stat-block' };
    }
    if (atk.rider === 'pull' && alive && SIZE[T.size || 'medium'] <= SIZE.large) {
      const ft = pull(b, A, T, 10);
      rider = { text: ft ? `${T.name} is pulled ${ft} feet toward ${A.name}.` : `${T.name} can't be pulled any closer.`, rule: 'thorn-whip' };
      tidy(b);
    }
    if (atk.rider === 'repel' && alive && SIZE[T.size || 'medium'] <= SIZE.large) {
      const ft = push(b, A, T, 10);
      rider = { text: ft ? `Repelling Blast: ${T.name} is pushed ${ft} feet away.` : `Repelling Blast: ${T.name} has nowhere to go.`, rule: 'eldritch-invocations' };
      tidy(b);
    }
    if (atk.rider === 'wisp' && alive) {
      b.effects.push({ type: 'wisp', by: A.id, target: T.id, expires: { when: 'end', who: A.id, skip: skipMine } });
      rider = { text: `${T.name} glows: it can't be Hidden (Invisible) until the end of ${A.name}'s next turn.`, rule: 'starry-wisp' };
    }
    if (atk.flurry && A.openHand && alive) {
      const dcParts = A.focusDc, dc = sumParts(dcParts);
      if (atk.flurry === 'addle') {
        b.effects.push({ type: 'addled', by: A.id, target: T.id, expires: { when: 'start', who: T.id } });
        rider = { text: `Open Hand (Addle): ${T.name} can't make Opportunity Attacks until the start of its next turn.`, rule: 'open-hand-technique' };
      } else if (atk.flurry === 'push') {
        const sv = savingThrow(b, T, 'str', dc);
        const ft = sv.success ? 0 : push(b, A, T, 15);
        rider = { text: `Open Hand (Push): ${T.name} makes a DC ${dc} Strength save: ${sv.total}, ${sv.success ? 'holds its ground' : ft ? `pushed ${ft} feet` : 'nowhere to go'}.`, rule: 'open-hand-technique' };
        tidy(b);
      } else if (atk.flurry === 'topple') {
        const sv = savingThrow(b, T, 'dex', dc);
        if (!sv.success) addCond(b, T, { id: 'prone', by: A.id });
        rider = { text: `Open Hand (Topple): ${T.name} makes a DC ${dc} Dexterity save: ${sv.total}, ${sv.success ? 'stays up' : 'falls Prone'}.`, rule: 'open-hand-technique' };
      }
    }
    if (atk.rider?.pull && alive && SIZE[T.size || 'medium'] <= SIZE.huge) {
      // Flame Whip (Balor): pulled straight toward it, then Prone.
      const ft = pull(b, A, T, atk.rider.pull);
      const down2 = !hasCond(T, 'prone') && addCond(b, T, { id: 'prone', by: A.id });
      rider = { text: `${ft ? `${T.name} is pulled ${ft} feet toward ${A.name}` : `${T.name} is already as close as it can get`}${down2 ? ' and falls Prone' : ''}.`, rule: 'stat-block' };
      tidy(b);
    }
    if (atk.rider?.noReact && alive) {
      T.reaction = false;
      b.effects = b.effects.filter((e) => !(e.type === 'noreact' && e.target === T.id));
      b.effects.push({ type: 'noreact', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
      rider = { text: `${rider?.text ? `${rider.text} ` : ''}${T.name} can't take Reactions until the start of ${A.name}'s next turn.`, rule: rider?.rule || 'stat-block' };
    }
    if (atk.rider?.prone && alive && SIZE[T.size || 'medium'] <= SIZE[atk.rider.prone] && !hasCond(T, 'prone')) {
      if (addCond(b, T, { id: 'prone', by: A.id })) rider = { text: `${T.name} is knocked Prone.`, rule: 'prone' };
    }
    if (atk.rider?.poison && alive && !hasCond(T, 'poisoned')) {
      if (addCond(b, T, { id: 'poisoned', by: A.id, endsOn: { when: 'end', who: T.id, skip: b.turn?.who === T.id ? 1 : 0 }, rule: 'poisoned' })) rider = { text: `${T.name} is Poisoned until the end of its next turn.`, rule: 'poisoned' };
    }
    if (atk.rider?.noHeal && alive) {
      b.effects = b.effects.filter((e) => !(e.type === 'grave' && e.target === T.id && e.by === A.id));
      b.effects.push({ type: 'grave', by: A.id, target: T.id, what: atk.name, expires: { when: 'start', who: A.id } });
      const t0 = rider?.text ? `${rider.text} ` : '';
      rider = { text: `${t0}${atk.rider.noHeal === 'curse' ? `Cursed: ${T.name}` : T.name} can't regain Hit Points until the start of ${A.name}'s next turn.`, rule: rider?.rule || 'stat-block' };
    }
    if (atk.rider?.push && alive && SIZE[T.size || 'medium'] <= SIZE.large) {
      const ft = push(b, A, T, atk.rider.push);
      b.effects = b.effects.filter((e) => !(e.type === 'mocked' && e.target === T.id));
      b.effects.push({ type: 'mocked', by: A.id, target: T.id, what: atk.rider.shaken, rule: 'stat-block', expires: { when: 'end', who: T.id, skip: b.turn?.who === T.id ? 1 : 0 } });
      rider = { text: `${ft ? `${T.name} is knocked ${ft} feet back` : `${T.name} stands firm`}, and has Disadvantage on their next attack roll before the end of their next turn.`, rule: 'stat-block' };
      tidy(b);
    }
    if (atk.rider?.paralyze?.auto && alive && !hasCond(T, 'paralyzed')) {
      // Paralyzing Touch (Lich): no save.
      const held = addCond(b, T, { id: 'paralyzed', by: A.id, endsOn: { when: 'start', who: A.id }, rule: 'paralyzed' });
      rider = { text: held ? `${T.name} is Paralyzed until the start of ${A.name}'s next turn.` : `${T.name} can't be Paralyzed.`, rule: 'paralyzed' };
    } else if (atk.rider?.paralyze && alive && T.creature !== 'undead' && !(atk.rider.paralyze.notElf && T.speciesId === 'elf') && !hasCond(T, 'paralyzed')) {
      const dc = atk.rider.paralyze.dc;
      const sv = savingThrow(b, T, 'con', dc, { cond: 'paralyzed' });
      const held = !sv.success && addCond(b, T, { id: 'paralyzed', by: A.id, endsOn: { when: 'end', who: T.id, skip: b.turn?.who === T.id ? 1 : 0 }, rule: 'paralyzed' });
      rider = { text: `${T.name} makes a DC ${dc} Constitution save: ${sv.auto ? 'automatic' : sv.total}, ${sv.success ? 'shakes it off' : held ? 'Paralyzed until the end of its next turn' : "but it can't be Paralyzed"}.`, rule: 'paralyzed' };
    }
    if (atk.rider?.grapple && alive && SIZE[T.size || 'medium'] <= SIZE[atk.rider.size || 'medium'] && !T.conds.some((x) => x.id === 'grappled' && x.by === A.id)) {
      if (addCond(b, T, { id: 'grappled', by: A.id, dc: atk.rider.grapple, reach: atk.reach || 5 })) {
        rider = { text: `${T.name} is Grappled (escape DC ${atk.rider.grapple}): Speed 0, and Disadvantage on attacks against anyone but ${A.name}.`, rule: 'grappled' };
      }
    }
    if (atk.brutal && alive) {
      // Improved Brutal Strike (Barbarian 17): two different effects on one hit.
      const want = A.brutalTwo ? 2 : 1;
      const blows = [];
      const more = b.turn?.who === A.id && b.turn.attacksLeft > 0;
      const pal = A.improvedBrutal && alliesOf(b, A).some((o) => !incap(o) && !o.dead && cheb(o, T) <= 1);
      const ft = more ? 0 : push(b, A, T, 15);
      if (ft) { blows.push(`Forceful Blow: ${T.name} is pushed ${ft} feet away.`); tidy(b); }
      if (blows.length < want && pal && !ft) {
        b.effects = b.effects.filter((e) => !(e.type === 'sundered' && e.target === T.id));
        b.effects.push({ type: 'sundered', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
        blows.push(`Sundering Blow: the next attack roll someone else makes against ${T.name} before ${A.name}'s next turn gets +5.`);
      }
      if (blows.length < want && A.improvedBrutal) {
        b.effects = b.effects.filter((e) => !(e.type === 'staggerblow' && e.target === T.id));
        b.effects.push({ type: 'staggerblow', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
        blows.push(`Staggering Blow: ${T.name} has Disadvantage on its next saving throw and can't make Opportunity Attacks until the start of ${A.name}'s next turn.`);
      }
      if (blows.length < want) {
        b.effects = b.effects.filter((e) => !(e.type === 'hamstrung' && e.target === T.id));
        b.effects.push({ type: 'hamstrung', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
        blows.push(`Hamstring Blow: ${T.name}'s Speed drops by 15 feet until the start of ${A.name}'s next turn.`);
      }
      const blow = `Brutal Strike (${blows.map((x) => x.split(':')[0]).join(' and ')}): ${blows.map((x) => x.slice(x.indexOf(':') + 2)).join(' ')}`;
      rider = rider ? { text: `${rider.text} ${blow}`, rule: rider.rule } : { text: blow, rule: 'brutal-strike' };
    }
    // Stunning Strike (Monk 5): once per turn, 1 Focus Point, on a Monk weapon or Unarmed Strike hit.
    if (A.stunningStrike && alive && atk.monk && A.focus?.uses > 0 && A.stunKey !== turnKey(b) && !hasCond(T, 'stunned') && !(T.condImmune || []).includes('stunned')) {
      A.focus.uses--;
      A.stunKey = turnKey(b);
      const dc = sumParts(A.focusDc);
      const sv = savingThrow(b, T, 'con', dc);
      if (!sv.success) addCond(b, T, { id: 'stunned', by: A.id, endsOn: { when: 'start', who: A.id }, rule: 'stunning-strike' });
      else b.effects.push({ type: 'staggered', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
      const stun = { text: `Stunning Strike (1 Focus Point, ${A.focus.uses} left): ${T.name} makes a DC ${dc} Constitution save: ${sv.total}, ${sv.success ? `holds on, but its Speed is halved and the next attack roll against it has Advantage, until the start of ${A.name}'s next turn` : `is Stunned until the start of ${A.name}'s next turn`}.`, rule: 'stunning-strike' };
      rider = rider ? { text: `${rider.text} ${stun.text}`, rule: rider.rule } : stun;
    }
    // Quivering Palm (Open Hand 17): 4 Focus Points to set vibrations going (here: on a foe with 60 or more Hit Points).
    if (A.quiveringPalm && alive && atk.unarmed && A.focus?.uses >= 4 && T.hp >= 60 && !b.effects.some((e) => e.type === 'quiver' && e.by === A.id)) {
      A.focus.uses -= 4;
      b.effects.push({ type: 'quiver', by: A.id, target: T.id, expires: { when: 'never' } });
      const q = { text: `Quivering Palm (4 Focus Points, ${A.focus.uses} left): vibrations start in ${T.name}'s body. ${A.name} can end them by giving up one attack of an Attack action.`, rule: 'quivering-palm' };
      rider = rider ? { text: `${rider.text} ${q.text}`, rule: rider.rule } : q;
    }
  } else if (atk.mastery === 'graze' && (atk.abilityMod || 0) > 0 && !T.dead && onBoard(T)) {
    const g = atk.abilityMod;
    damage = { ...finishDamage(T, [{ label: 'Graze (ability modifier)', value: g, rule: 'mastery-graze', type: atk.type }]), graze: true };
    after = applyDamage(b, T, damage.total, { types: damage.types, by: A.id });
    notes.push({ text: `Graze: a miss still deals ${g} damage (the ability modifier)`, rule: 'mastery-graze' });
  } else if (atk.spell && SPELLS[atk.spell].level === 0 && A.potentCantrip) {
    const full = rollDamage(b, A, T, { ...atk, rider: null }, false, ctx.mode);
    const half = Math.floor(full.total / 2);
    damage = { ...full, total: half, potent: true };
    after = applyDamage(b, T, half, { types: full.types, by: A.id });
    notes.push({ text: `Potent Cantrip: a miss still deals half damage (${full.total} halved to ${half})`, rule: 'potent-cantrip' });
  }
  const verb = { crit: 'lands a Critical Hit on', hit: 'hits', miss: 'misses', fumble: 'misses' }[outcome];
  let text = `${A.name} ${verb} ${T.name} with ${atk.name}`;
  if (damage) text += `${damage.potent ? ', but Potent Cantrip deals' : damage.graze ? ', but Graze deals' : ' for'} ${damage.total} ${damage.type} damage${adjustText(damage)}`;
  if (deflect) text += ` (${deflect.from} before Deflect Attacks)`;
  text += ctx.reaction ? ` (${ctx.why || 'Opportunity Attack'}).` : '.';
  text += afterText(T, after);
  if (rider && hit) text += ` ${rider.text}`;
  emit(b, {
    kind: 'attack', by: A.id, target: T.id, weapon: atk.name, attackKind: atk.kind, spell: atk.spell || null, reaction: ctx.reaction,
    d20, mods: ctx.mods, total, ac: ac.value, acParts: ac.parts,
    outcome, notes, damage, after, mastery, rider, text,
    rule: ctx.reaction ? 'opportunity-attack' : atk.spell ? 'spell-attack' : 'attack-roll',
  });
  for (const x of later) emit(b, x);
  // Multiattack Defense (Hunter 7): +4 AC against this attacker for the rest of the turn.
  if (hit && T.tactics === 'multi' && !T.dead && !b.effects.some((e) => e.type === 'madef' && e.by === T.id && e.target === A.id)) {
    b.effects.push({ type: 'madef', by: T.id, target: A.id, expires: { when: 'end', who: b.turn?.who || A.id } });
  }
  // Fire Shield (warm): a creature within 5 feet that hits with a melee attack takes 2d8 Fire.
  if (hit && atk.kind === 'melee' && effectOn(b, 'fireshield', T.id) && cheb(A, T) <= 1 && !A.dead && !b.over) {
    const r = rollDice(b.rng, 2, 8);
    const dmg = finishDamage(A, [{ label: 'Fire Shield 2d8', rolls: r, value: sum(r), rule: 'fire-shield', type: 'Fire' }]);
    const after = applyDamage(b, A, dmg.total, { types: ['Fire'], by: T.id });
    emit(b, { kind: 'note', by: T.id, target: A.id, rule: 'fire-shield', damage: dmg, after,
      text: `Fire Shield: flames lash ${A.name} for 2d8 (${r.join(' + ')}) = ${dmg.total} Fire damage${adjustText(dmg)}.${afterText(A, after)}` });
  }
  // Holy Aura: a Fiend or Undead that hits in melee makes a Constitution save or is Blinded while the spell lasts.
  const holy = hit && atk.kind === 'melee' && !b.over && !A.dead && ['fiend', 'undead'].includes(A.creature) ? effectOn(b, 'holyaura', T.id) : null;
  if (holy && !hasCond(A, 'blinded')) {
    const P = C(b, holy.by);
    const dcp = P ? spellDCParts(P, 'holy-aura') : [{ label: 'DC', value: 15 }];
    b.spellNow = true;
    const sv = savingThrow(b, A, 'con', sumParts(dcp));
    b.spellNow = false;
    const blind = !sv.success && addCond(b, A, { id: 'blinded', by: holy.by, conc: holy.by, rule: 'holy-aura' });
    emit(b, { kind: 'note', by: holy.by, target: A.id, rule: 'holy-aura', text: `Holy Aura flares at ${A.name}: DC ${sumParts(dcp)} Constitution save, ${sv.total}${blind ? `: Blinded while ${P?.name || 'the caster'} keeps Concentration` : ', resisted'}.` });
  }
  if (deflect?.back && !b.over) {
    areaSave(b, T, [A], { name: 'Deflect Attacks (sent back)', ability: 'dex', dcParts: T.focusDc, dice: `2d${parseDice(T.martialDie).sides}`, flat: T.mods.dex, type: atk.type, half: false, rule: 'deflect-attacks' });
  }
  flushPost(b);
  checkOver(b);
  // Divine Smite: the paladin decides right after a melee hit on their own turn.
  if (hit && !b.over && !b.pending && smitePay(b, A, 0) && !ctx.reaction && atk.kind === 'melee' && !atk.spell && !T.dead && T.hp > 0 && onBoard(T)) {
    b.pending = { kind: 'smite', reactor: A.id, target: T.id, crit: outcome === 'crit' };
    emit(b, { kind: 'prompt', by: A.id, target: T.id, text: `${A.name} hit ${T.name} with a melee attack.`, rule: 'divine-smite' });
  }
}

// How A could pay for Divine Smite now ({ pay, slot } or null): a Bonus Action
// on their own turn, and the free cast or a spell slot.
export function smitePay(b, A, want = 0) {
  const k = A.casting?.known?.['divine-smite'];
  const t = b.turn;
  if (!k || !t || t.who !== A.id || !t.bonus || incap(A) || t.quick) return null;
  if (k.free > 0 && !(want > 1 && slotFor(b, A, 'divine-smite', want))) return { pay: 'free', slot: 1 };
  const lv = slotFor(b, A, 'divine-smite', want);
  return lv ? { pay: 'slot', slot: lv } : null;
}

// Pull T up to `feet` straight toward the source, stopping next to it.
function pull(b, to, T, feet) {
  let moved = 0;
  for (let i = 0; i < feet / FT; i++) {
    if (cheb(T, to) <= 1) break;
    const nx = T.x + Math.sign(to.x - T.x), ny = T.y + Math.sign(to.y - T.y);
    if (!inBounds(nx, ny) || blocked(b, nx, ny) || occupantAt(b, nx, ny)) break;
    T.x = nx; T.y = ny; moved += FT;
  }
  return moved;
}


// ---------------------------------------------------------------- spells ----

export function spellAttack(A, sid, opts = {}) {
  const s = SPELLS[sid];
  const k = A.casting.known[sid];
  const inv = A.invocations || [];
  const eb = sid === 'eldritch-blast';
  let range = s.range + (eb && inv.includes('eldritch-spear') ? 30 * A.level : 0);
  if (opts.distant) range *= 2;
  const melee = opts.melee ?? !!s.melee;
  const flat = [...(opts.flat || [])];
  if (eb && inv.includes('agonizing-blast')) flat.push({ label: 'Agonizing Blast (CHA modifier)', value: A.mods.cha, rule: 'eldritch-invocations' });
  return {
    id: sid, name: s.name, kind: melee ? 'melee' : 'ranged', dice: opts.dice || s.dice, type: opts.type || s.type, range: [range, range],
    reach: melee ? (s.reach || 5) * (opts.distant && s.reach ? 2 : 1) : undefined, hit: A.casting.stats[k.ability].attack, dmgFlat: flat, spell: sid,
    rider: eb && inv.includes('repelling-blast') ? 'repel' : s.rider || null, finesse: false,
    explode: s.explode ? Math.max(1, spellMod(A, sid)) : 0, seeking: !!opts.seeking, empowered: opts.empowered || 0,
  };
}

// Innate Sorcery: +1 to the save DC and Advantage on attack rolls of Sorcerer spells.
const innateFor = (A, sid) => !!A.innateOn && ['Sorcerer', 'Draconic Sorcery'].includes(A.casting?.known?.[sid]?.source);
export function spellDCParts(A, sid) {
  const parts = A.casting.stats[A.casting.known[sid].ability].dc;
  return innateFor(A, sid) ? [...parts, { label: 'Innate Sorcery', value: 1, rule: 'innate-sorcery' }] : parts;
}
export const spellDC = (A, sid) => sumParts(spellDCParts(A, sid));
export const spellMod = (A, sid) => A.mods[A.casting.known[sid].ability];

// What a spell does when cast with a slot of this level (2024 "Using a Higher-Level Spell Slot").
// A cantrip grows with the caster's character level instead (lvl).
export function scaled(sid, slot, lvl = 1) {
  const s = SPELLS[sid];
  const k = Math.max(0, (slot || s.level) - s.level);
  const up = s.up || {};
  let dice = s.dice;
  if (dice && up.dice && k) {
    const a = parseDice(dice), u = parseDice(up.dice);
    dice = `${a.n + u.n * k}d${a.sides}`;
  }
  const tier = s.level === 0 ? cantripTier(lvl || 1) : 1;
  const beams = sid === 'eldritch-blast' ? tier : 0;
  if (dice && s.level === 0 && !beams && tier > 1) {
    const a = parseDice(dice);
    dice = `${a.n * tier}d${a.sides}`;
  }
  let also = s.also ? { ...s.also } : null;
  if (also && up.also && k) {
    const a = parseDice(also.dice), u = parseDice(up.also);
    also.dice = `${a.n + u.n * k}d${a.sides}`;
  }
  return {
    dice, also, beams, darts: (s.darts || 0) + (up.darts || 0) * k, rays: (s.rays || 0) + (up.rays || 0) * k,
    targets: (s.targets || 1) + (up.targets || 0) * k, amount: (s.amount || 0) + (up.amount || 0) * k,
    flat: (s.flat || 0) + (up.flat || 0) * k,
  };
}

// The lowest spell slot A could use for sid (at least `want`), or null.
function slotFor(b, A, sid, want = 0) {
  const s = SPELLS[sid];
  const k = A.casting?.known?.[sid];
  if (!k || !k.slot || !A.casting.slots) return null;
  if (A.slotKey === turnKey(b)) return null;
  const lvls = Object.keys(A.casting.slots).map(Number).sort((p, q) => p - q);
  return lvls.find((lv) => lv >= Math.max(s.level, want) && A.casting.slots[lv].left > 0) || null;
}

// Can A cast this spell right now? Returns { ok, error, pay: 'free'|'slot'|'atwill'|null, slot, time }.
export function canCast(b, A, sid, want = 0, meta = null) {
  const k = A.casting?.known?.[sid];
  const s = SPELLS[sid];
  if (!k || !s) return { ok: false, error: "You don't know that spell." };
  if (s.kind === 'utility') return { ok: false, error: `${s.name} is for outside of fights.` };
  if (s.time === 'reaction') return { ok: false, error: `${s.name} is a Reaction: you're asked when ${sid === 'hellish-rebuke' ? 'an enemy damages you' : 'an attack would hit you'}.` };
  if (s.kind === 'smite') return { ok: false, error: `${s.name} is cast right after you hit with a melee attack: you're asked then.` };
  const t = b.turn;
  if (!t || t.who !== A.id) return { ok: false, error: "It isn't your turn." };
  if (incap(A)) return { ok: false, error: `${A.name} can't act.` };
  if (A.raging) return { ok: false, error: `${A.name} can't cast spells while raging.` };
  if (A.shape && !A.beastSpells) return { ok: false, error: `${A.name} can't cast spells in Wild Shape.` };
  if (hasCond(A, 'befuddled')) return { ok: false, error: `${A.name} is befuddled and can't cast spells.` };
  const quick = meta === 'quickened' && s.time === 'action';
  const time = quick ? 'bonus' : s.time;
  if (time === 'bonus' ? !t.bonus : !t.action) return { ok: false, error: `You have already used your ${time === 'bonus' ? 'Bonus Action' : 'action'}.` };
  if (time === 'action' && t.magicUsed) return { ok: false, error: "Action Surge's extra action can't be used to cast a spell (the Magic action)." };
  if (s.level > 0 && t.quick) return { ok: false, error: 'After a Quickened Spell you can\'t cast another level 1+ spell this turn.' };
  if (quick && t.leveled) return { ok: false, error: "Quickened Spell can't be used after you've cast a level 1+ spell this turn." };
  if (s.level === 0) return { ok: true, pay: null, slot: 0, time };
  // Vampiric Touch, Call Lightning: while the spell lasts, a Magic action on a later turn uses it again.
  if (s.again && A.conc?.spell === sid && A.conc.key !== turnKey(b)) return { ok: true, pay: 'again', slot: A.conc.slot || s.level, time: 'action' };
  if (s.again && A.conc?.spell === sid) return { ok: false, error: `${s.name} is going: use it again on a later turn.` };
  if (k.atWill && !(want > s.level)) return { ok: true, pay: 'atwill', slot: s.level, time };
  if (k.free > 0 && !(want > s.level && slotFor(b, A, sid, want))) return { ok: true, pay: 'free', slot: k.atLevel || s.level, time };
  if (k.perDay) return { ok: false, error: `No uses of ${s.name} left today.` };
  // Divine Intervention (Cleric 10): once per Long Rest, a Cleric spell of level 5 or lower with no slot.
  const di = A.intervention?.uses > 0 && A.cls === 'cleric' && s.level <= 5;
  if (di && meta === 'intervene' && !quick) return { ok: true, pay: 'intervene', slot: s.level, time };
  if (A.slotKey === turnKey(b)) return di ? { ok: true, pay: 'intervene', slot: s.level, time } : { ok: false, error: 'You can expend only one spell slot per turn.' };
  const lv = slotFor(b, A, sid, want);
  if (!lv && di && !quick) return { ok: true, pay: 'intervene', slot: s.level, time };
  if (!lv) return { ok: false, error: want > s.level ? `No level ${want}+ spell slots left.` : 'No spell slots left.' };
  return { ok: true, pay: 'slot', slot: lv, time };
}

// Metamagic (Sorcerer 2): which options fit this spell. Returns an error or null.
const TRANSMUTE = ['Acid', 'Cold', 'Fire', 'Lightning', 'Poison', 'Thunder'];
// Arcane Apotheosis (Sorcerer 20): one free Metamagic option each turn while Innate Sorcery is active.
export const apotheosisFree = (b, A) => !!A.apotheosis && !!A.innateOn && A.apoKey !== turnKey(b);
export function metaError(b, A, sid, meta) {
  if (!meta || meta === 'intervene') return null;
  const s = SPELLS[sid], M = METAMAGIC[meta];
  // Overchannel (Evoker 14): a Wizard spell of level 1 to 5 that deals damage does the most it could.
  if (meta === 'overchannel') {
    if (!A.overchannel) return "You don't have Overchannel.";
    if (!(s.level >= 1 && s.level <= 5) || !s.dice || !['attack', 'save', 'area', 'missile', 'rays'].includes(s.kind)) return `Overchannel works on a damaging spell of level 1 to 5; ${s.name} isn't one.`;
    return null;
  }
  if (!M || !(A.metamagic || []).includes(meta)) return "You don't know that Metamagic option.";
  if (!apotheosisFree(b, A) && (!A.sorcery || A.sorcery.uses < M.cost)) return `${M.name} costs ${s1(M.cost, 'Sorcery Point')}; you have ${A.sorcery?.uses || 0}.`;
  const saves = ['save', 'area', 'bane', 'command', 'hold'].includes(s.kind) || (s.kind === 'buff' && s.buff === 'dbreath');
  const ok = {
    careful: saves && !!s.area,
    distant: (s.range || 0) >= 5 || !!s.touch,
    empowered: !!s.dice && ['attack', 'save', 'area', 'rays'].includes(s.kind),
    extended: !!s.conc,
    heightened: saves,
    quickened: s.time === 'action',
    seeking: ['attack', 'rays'].includes(s.kind),
    subtle: false,
    transmuted: TRANSMUTE.includes(s.type) || !!s.pickType,
    twinned: !!s.up?.targets,
  }[meta];
  if (!ok) return `${M.name} doesn't change ${s.name}${meta === 'subtle' ? ' in a fight' : ''}.`;
  return null;
}

// ------------------------------------------------------------ aiming ----
// Every spell aims the way its 2024 text says: at yourself, at creatures
// (one, several, or darts and rays split however you like), at a point you
// can see, or as an area template placed anywhere it may go.
const sqOf = (ft) => Math.max(1, Math.round(ft / FT));
const AREA_NAMES = { cone: 'Cone', cube: 'Cube', line: 'Line', sphere: 'Sphere', emanation: 'Emanation' };
export const areaLabel = (area) => `${area.size}-ft ${AREA_NAMES[area.shape] || area.shape}`;

// The squares an area covers when aimed at (x, y). Self shapes (Cone, Line, a
// Cube on your side) point from the caster toward (x, y); point shapes sit on
// (x, y). Walls block it, and so does anything out of sight of its origin.
export function areaSquares(b, A, area, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) return [];
  const n = sqOf(area.size);
  const at = { x, y };
  let sq = [];
  if (area.from === 'self') {
    if (area.shape === 'emanation') sq = squaresWithin(A, n).filter((q) => q.x !== A.x || q.y !== A.y);
    else if (x === A.x && y === A.y) return [];
    else if (area.shape === 'cone') sq = coneSquares(A, at, n);
    else if (area.shape === 'cube') sq = cubeSquares(A, at, n);
    else if (area.shape === 'line') sq = lineSquares(A, at, n);
  } else if (area.shape === 'cube') sq = cubeAt(at, n);
  else sq = squaresWithin(at, n);
  const origin = area.from === 'self' ? A : at;
  return sq.filter((q) => !isWall(b, q.x, q.y) && lineOfSight(b, origin, q));
}
// The creatures caught in it (a self shape never includes the caster).
export function areaTargets(b, A, area, x, y) {
  const sq = new Set(areaSquares(b, A, area, x, y).map((q) => key(q.x, q.y)));
  return Object.values(b.creatures).filter((c) => onBoard(c) && !c.dead && sq.has(key(c.x, c.y)) && !(area.from === 'self' && c === A));
}
export function coneTargets(b, A, x, y, size = 3) { return areaTargets(b, A, { shape: 'cone', size: size * FT, from: 'self' }, x, y); }
export const cubeTargets = (b, A, x, y) => areaTargets(b, A, { shape: 'cube', size: 15, from: 'self' }, x, y);
export const BREATH_AREAS = { cone: { shape: 'cone', size: 15, from: 'self' }, line: { shape: 'line', size: 30, from: 'self' } };

// How a spell is aimed. mode: self | creature | split | group | point | area | none.
// who: 'other' (any creature but you), 'any' (you too), 'dying'.
export function spellAim(sid, slot, meta = null, lvl = 1) {
  const s = SPELLS[sid];
  if (!s) return { mode: 'none', range: 0 };
  const sc = scaled(sid, slot || s.level, lvl);
  if (meta === 'twinned' && s.up?.targets) sc.targets += s.up.targets;
  let range = s.touch ? 5 : s.range || 0;
  if (meta === 'distant') range = s.touch ? 30 : range * 2;
  if (sc.beams > 1) return { mode: 'split', who: 'other', n: sc.beams, range, what: 'beam' };
  switch (s.kind) {
    case 'temp': case 'selfbuff': return { mode: 'self', range: 0 };
    case 'save': return sc.targets > 1 ? { mode: 'group', who: 'other', n: sc.targets, range } : { mode: 'creature', who: 'other', range };
    case 'attack': if (s.wind) return { mode: 'group', who: 'other', n: sc.targets, range }; return { mode: 'creature', who: 'other', range };
    case 'spiritual': case 'mark': case 'pwstun': case 'pwkill': return { mode: 'creature', who: 'other', range };
    case 'word': return { mode: 'group', who: 'other', n: sc.targets, range };
    case 'bane': return { mode: 'group', who: 'other', n: sc.targets, range };
    case 'heal': case 'cure': case 'armor': case 'dispel': return { mode: 'creature', who: 'any', range };
    case 'massheal': return { mode: 'group', who: 'any', n: sc.targets, range };
    case 'revive': return { mode: 'creature', who: 'dead', range };
    case 'zone': return s.area.from === 'self' ? { mode: 'self', range: 0, ...s.area } : { mode: 'area', ...s.area, range };
    case 'stabilize': return { mode: 'creature', who: 'dying', range };
    case 'missile': return { mode: 'split', who: 'other', n: sc.darts, range, what: 'dart' };
    case 'rays': return { mode: 'split', who: 'other', n: sc.rays, range, what: 'ray' };
    case 'buff': case 'stride': return { mode: 'group', who: 'any', n: sc.targets, range };
    case 'command': case 'hold': return { mode: 'group', who: 'other', n: sc.targets, range };
    case 'teleport': return { mode: 'point', range };
    case 'area': return { mode: 'area', ...s.area, range: s.area.from === 'self' ? 0 : range };
    default: return { mode: 'none', range };
  }
}

const rangeText = (r) => (r <= 5 ? 'touch' : `${r} ft`);
// Why X can't be a target of this spell, or null.
export function targetError(b, A, X, sid, aim = spellAim(sid)) {
  const s = SPELLS[sid];
  if (aim.who === 'dead') {
    if (!X || !X.dead || X.side !== A.side) return 'Pick an ally who has died.';
    if (X.dust) return `${X.name} was turned to dust: only a Wish could bring them back.`;
    if (b.round - (X.diedRound ?? b.round) > 10) return `${X.name} died more than a minute ago.`;
    if (feetBetween(A, X) > aim.range) return `${X.name} is out of range (touch).`;
    return null;
  }
  if (!X || X.dead || !onBoard(X)) return 'Pick a creature.';
  if (aim.who === 'other' && X === A) return `${s.name} can't target yourself.`;
  if (aim.who === 'dying' && (X.hp > 0 || X.stable)) return 'Pick a creature at 0 Hit Points that is not yet Stable.';
  if (X !== A) {
    if (hostile(A, X) && hasCond(X, 'hidden')) return `You don't know where ${X.name} is.`;
    if (feetBetween(A, X) > aim.range) return `${X.name} is out of range (${rangeText(aim.range)}).`;
    if (!lineOfSight(b, A, X)) return `You can't see ${X.name}: a wall is in the way.`;
  }
  if (s.only && X.creature !== s.only) return `${s.name} only works on a ${s.only[0].toUpperCase()}${s.only.slice(1)}.`;
  if (s.notOn?.includes(X.creature)) return `${s.name} has no effect on ${X.creature === 'undead' ? 'Undead' : `a ${X.creature[0].toUpperCase()}${X.creature.slice(1)}`}.`;
  if (s.kind === 'armor') {
    if (hostile(A, X)) return 'Mage Armor needs a willing creature.';
    if (X.armorId !== 'none') return `${X.name} is wearing armor, so Mage Armor does nothing.`;
    if (X.mageArmor) return `${X.name} already has Mage Armor.`;
  }
  if (s.kind === 'cure' && !(X.conds || []).some((c) => s.cures.includes(c.id)) && !(s.greater && (X.exhaustion > 0 || X.drained > 0))) return `${X.name} has nothing ${s.name} can end.`;
  if ((s.kind === 'buff' || s.kind === 'stride') && hostile(A, X)) return `${s.name} needs a willing creature.`;
  return null;
}
// Why a point can't be picked for this aim, or null.
export function pointError(b, A, aim, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) return 'Pick a square.';
  if (aim.mode === 'point') {
    if ((x === A.x && y === A.y) || !canEndAt(b, A, x, y)) return 'Pick an empty square.';
  } else if (aim.from === 'self') {
    if (aim.shape !== 'emanation' && x === A.x && y === A.y) return 'Pick a direction: tap any other square.';
    return null;
  } else if (isWall(b, x, y)) return 'That square is solid rock.';
  if (cheb(A, { x, y }) * FT > aim.range || !lineOfSight(b, A, { x, y })) return `Pick a square you can see within ${aim.range} feet.`;
  return null;
}

// Check an intent's aim. Returns { error } or { targets: [ids], point }.
export function checkAim(b, A, sid, intent = {}, slot) {
  const s = SPELLS[sid];
  const aim = spellAim(sid, slot, intent.meta || null, A.level);

  const T = intent.target ? C(b, intent.target) : null;
  const list = Array.isArray(intent.targets) && intent.targets.length ? intent.targets : T ? [T.id] : [];
  const each = (ids) => {
    for (const id of ids) { const e = targetError(b, A, C(b, id), sid, aim); if (e) return { error: e }; }
    return { targets: ids };
  };
  switch (aim.mode) {
    case 'self': return { targets: [A.id] };
    case 'creature': { const e = targetError(b, A, T, sid, aim); return e ? { error: e } : { targets: [T.id] }; }
    case 'split': {
      const ids = list.slice(0, aim.n);
      if (!ids.length) return { error: `Pick a target for each ${aim.what}.` };
      while (ids.length < aim.n) ids.push(ids[ids.length - 1]);
      return each(ids);
    }
    case 'group': {
      const ids = [...new Set(list.length ? list : aim.who === 'any' ? [A.id] : [])].slice(0, aim.n);
      if (!ids.length) return { error: 'Pick a target.' };
      return each(ids);
    }
    case 'point': case 'area': {
      const e = pointError(b, A, aim, intent.x, intent.y);
      if (e) return { error: e };
      const point = { x: intent.x, y: intent.y };
      return { point, targets: aim.mode === 'area' ? areaTargets(b, A, aim, point.x, point.y).map((c) => c.id) : [] };
    }
    default: return { error: `${s.name} can't be cast here.` };
  }
}

// Push T up to `feet` straight away from the source, stopping at anything solid.
function push(b, from, T, feet) {
  const dx = Math.sign(T.x - from.x), dy = Math.sign(T.y - from.y);
  let moved = 0;
  for (let i = 0; i < feet / FT; i++) {
    const nx = T.x + dx, ny = T.y + dy;
    if (!inBounds(nx, ny) || blocked(b, nx, ny) || occupantAt(b, nx, ny)) break;
    T.x = nx; T.y = ny; moved += FT;
  }
  return moved;
}

// Area damage with a saving throw (Burning Hands, Sacred Flame, Breath Weapon, Thunderwave).
// Empowered Spell on a pool of dice: reroll the lowest ones below average.
function empowerRolls(b, rolls, sides, count) {
  const idx = rolls.map((v, i) => [v, i]).filter(([v]) => v < (sides + 1) / 2).sort((p, q) => p[0] - q[0]).slice(0, count).map(([, i]) => i);
  if (!idx.length) return null;
  const was = idx.map((i) => rolls[i]);
  for (const i of idx) rolls[i] = die(b.rng, sides);
  return `Empowered Spell: rerolled ${was.join(', ')} and got ${idx.map((i) => rolls[i]).join(', ')}`;
}

// After a failed save: the rider some spells add.
function saveRider(b, A, T, rider, dc = 10) {
  if (!rider || T.dead || T.hp <= 0 || !onBoard(T)) return '';
  if (rider === 'mocked') {
    b.effects = b.effects.filter((e) => !(e.type === 'mocked' && e.target === T.id));
    b.effects.push({ type: 'mocked', by: A.id, target: T.id, expires: { when: 'end', who: T.id } });
    return ` Disadvantage on its next attack roll before the end of its next turn.`;
  }
  if (rider === 'glare') {
    const mine = b.turn?.who === A.id;
    if (addCond(b, T, { id: 'paralyzed', by: A.id, endsOn: { when: 'end', who: A.id, skip: mine ? 0 : 1 }, rule: 'paralyzed' })) return ` Paralyzed until the end of ${A.name}'s ${mine ? '' : 'next '}turn.`;
    return '';
  }
  if (rider === 'blind') {
    if (addCond(b, T, { id: 'blinded', by: A.id, endsOn: { when: 'start', who: A.id }, rule: 'blinded' })) return ` Blinded until the start of ${A.name}'s next turn.`;
    return '';
  }
  if (rider === 'sunblind') {
    if (addCond(b, T, { id: 'blinded', by: A.id, saveEnds: { ability: 'con', dc }, rule: 'blinded' })) return ' Blinded for 1 minute, saving again at the end of each of its turns.';
    return '';
  }
  if (rider === 'befuddle') {
    if (addCond(b, T, { id: 'befuddled', by: A.id, rule: 'befuddlement' })) return " It can't cast spells for the rest of the fight.";
    return '';
  }
  if (rider === 'prone') {
    if (SIZE[T.size || 'medium'] > SIZE.large || hasCond(T, 'prone')) return '';
    if (addCond(b, T, { id: 'prone', by: A.id, why: 'knocked down' })) return ' It falls Prone.';
    return '';
  }
  if (rider === 'weird') {
    if (addCond(b, T, { id: 'frightened', by: A.id, conc: A.id, saveEnds: { ability: 'wis', dc }, weird: '5d10', rule: 'weird' })) return ` Frightened of ${A.name}. At the end of each of its turns it takes 5d10 Psychic damage and saves again.`;
    return '';
  }
  if (rider === 'flee') {
    if (!T.reaction || incap(T)) return '';
    T.reaction = false;
    const ft = push(b, A, T, speedOf(b, T));
    tidy(b);
    return ft ? ` It uses its Reaction to flee ${ft} feet.` : ' It has nowhere to run.';
  }
  return '';
}

function areaSave(b, A, targets, { name, ability, dcParts, dice, flat = 0, flatLabel = 'DEX modifier', flatRule = null, type, half, rule, cantrip = false, ignoreCover = false, push: pushFt = 0, from = null,
  rider = null, careful = [], heighten = null, empower = 0, also = null, bonus = [], bonus2 = [], sculpt = [], cond = null, prismatic = null, drain = false, dust = false }) {
  const dc = sumParts(dcParts);
  const { n, sides } = dice ? parseDice(dice) : { n: 0, sides: 0 };
  const rolls = b.maxDice ? Array(n).fill(sides) : rollDice(b.rng, n, sides);
  const emp = empower && !b.maxDice ? empowerRolls(b, rolls, sides, empower) : null;
  const full = sum(rolls) + flat + sumParts(bonus);
  // A second damage type rolled alongside (Ice Storm, Flame Strike).
  const rolls2 = also ? (b.maxDice ? Array(parseDice(also.dice).n).fill(parseDice(also.dice).sides) : rollDice(b.rng, parseDice(also.dice).n, parseDice(also.dice).sides)) : null;
  const full2 = also ? sum(rolls2) + sumParts(bonus2) : 0;
  const results = [];
  for (const T of targets) {
    const sculpted = sculpt.includes(T.id);
    const cover = ignoreCover ? null : coverFor(b, from || A, T);
    const sv = sculpted ? { target: T.id, auto: 'success', success: true, mods: [], total: dc, d20: null, sculpt: true, note: 'Sculpt Spells: succeeds automatically' }
      : savingThrow(b, T, ability, dc, { cover, cond, careful: careful.includes(T.id),
        extraDis: heighten === T.id ? [{ text: 'Heightened Spell', rule: 'metamagic' }] : [] });
    // Evasion (Monk, Rogue 7): no damage on a success, half on a failure.
    const evade = !sculpted && !sv.careful && T.evasion && ability === 'dex' && half && !incap(T);
    const portion = (v) => {
      if (sculpted || sv.careful) return 0;
      if (sv.success) return half && !evade ? Math.floor(v / 2) : 0;
      return evade ? Math.floor(v / 2) : v;
    };
    let raw = portion(full);
    let potent = false;
    if (sv.success && cantrip && A.potentCantrip && !half && !sv.careful && !sculpted) { raw = Math.floor(full / 2); potent = true; }
    // Prismatic Spray: each creature is struck by a ray of its own, rolled at random.
    const ray = prismatic ? prismatic[die(b.rng, prismatic.length) - 1] : null;
    const parts = [{ label: ray ? `${name} (${ray} ray)` : name, value: raw, type: ray || type }];
    if (also) parts.push({ label: `${name} (${also.type})`, value: portion(full2), type: also.type });
    const dmg = finishDamage(T, parts);
    const hpBefore = T.hpMax;
    const after = applyDamage(b, T, dmg.total, { types: dmg.types, by: A.id });
    let pushed = 0;
    if (!sv.success && pushFt && !T.dead && T.hp > 0) pushed = push(b, A, T, pushFt);
    let extra = !sv.success ? saveRider(b, A, T, rider, dc) : '';
    // Harm: the Hit Point maximum drops by the Necrotic damage taken, until a Long Rest.
    if (drain && dmg.total > 0 && !T.dead && T.hp > 0) {
      T.hpMax = Math.max(1, T.hpMax - dmg.total);
      T.drained = (T.drained || 0) + (hpBefore - T.hpMax);
      T.hp = Math.min(T.hp, T.hpMax);
      extra += ` Its Hit Point maximum drops to ${T.hpMax} until a Long Rest.`;
    }
    // Disintegrate: a creature it drops to 0 Hit Points turns to dust.
    if (dust && dmg.total > 0 && T.hp <= 0) {
      if (!T.dead) { T.dead = true; T.diedRound = b.round; }
      T.dust = true;
      extra += ` ${T.name} is turned to dust.`;
    }
    const how = sculpted ? ' automatically (Sculpt Spells)' : sv.careful ? ' automatically (Careful Spell)' : sv.auto ? ' automatically' : ` (${sv.total}${sv.note ? `; ${sv.note}` : ''})`;
    results.push({
      ...sv, damage: dmg.total, adjust: dmg.adjust, after, pushed, potent, ray,
      text: `${T.name} ${sv.success ? 'succeeds' : 'fails'}${how}: ${dmg.total}${ray ? ` ${ray}` : ''} damage${adjustText(dmg)}${evade ? ' (Evasion)' : ''}${potent ? ' (Potent Cantrip: half on a success)' : ''}${pushed ? `, pushed ${pushed} ft` : ''}.${afterText(T, after)}${extra}`,
    });
  }
  const hits = results.map((r) => `${C(b, r.target).name} ${r.damage}`).join(', ');
  const parts = dice ? [{ label: `${name} ${dice}`, rolls, value: sum(rolls), rule, gwf: emp, type }] : [];
  if (flat) parts.push({ label: flatLabel, value: flat, rule: flatLabel === 'DEX modifier' ? 'ability-modifier' : flatRule || 'stat-block' });
  parts.push(...bonus);
  if (also) parts.push({ label: `${name} ${also.dice} (${also.type})`, rolls: rolls2, value: sum(rolls2), rule, type: also.type }, ...bonus2);
  emit(b, {
    kind: 'save-spell', by: A.id, what: name, ability, dc, dcParts, damage: { parts, total: full + full2, type: also ? `${type} and ${also.type}` : type },

    half, results, rule,
    text: targets.length ? `${A.name} uses ${name}: DC ${dc} ${ABILITY_NAMES[ability]} save. ${hits ? `Damage: ${hits}.` : ''}` : `${A.name} uses ${name}, but nobody is caught in it.`,
  });
  flushPost(b);
  checkOver(b);
  return results;
}

// Flat bonuses to one damage roll of a spell: Empowered Evocation (Wizard 10),
// Elemental Affinity (Draconic Sorcerer 6) and Potent Spellcasting (Cleric, Druid 7).
function spellBonus(A, sid, type) {
  const s = SPELLS[sid];
  const out = [];
  if (!s) return out;
  if (A.empEvocation && A.cls === 'wizard' && EVOCATION.includes(sid)) out.push({ label: 'Empowered Evocation (INT modifier)', value: A.empEvocation, rule: 'empowered-evocation', type });
  if (A.affinity && A.affinity === type) out.push({ label: 'Elemental Affinity (CHA modifier)', value: A.mods.cha, rule: 'elemental-affinity', type });
  if (A.potentSpell && s.level === 0) out.push({ label: 'Potent Spellcasting (WIS modifier)', value: A.mods.wis, rule: 'potent-spellcasting', type });
  return out;
}

// A save against a condition (Command, Hold Person, Web, Turn Undead).
function condSave(b, A, T, ability, dc, rule, cond = null, heighten = null) {
  const cover = ability === 'dex' ? coverFor(b, A, T) : null;
  return savingThrow(b, T, ability, dc, { cover, cond, extraDis: heighten === T.id ? [{ text: 'Heightened Spell', rule: 'metamagic' }] : [] });
}

// most: the largest amount the dice could give (Beacon of Hope heals that much).
function heal(b, A, T, amount, what, rule, roll, mods, most = null) {
  const before = T.hp;
  const grave = b.effects.find((e) => e.type === 'grave' && e.target === T.id);
  if (grave) {
    emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name} can't regain Hit Points right now (${grave.what || 'Chill Touch'}).`, rule: grave.what ? 'stat-block' : 'chill-touch' });
    return 0;
  }
  const beacon = most != null && most > amount && effectOn(b, 'beacon', T.id);
  if (beacon) amount = most;
  T.hp = Math.min(T.hpMax, T.hp + amount);
  if (before === 0 && T.hp > 0) { T.deathSaves = { s: 0, f: 0 }; T.stable = false; }
  emit(b, { kind: 'heal', by: A.id, target: T.id, what, roll, mods, total: amount, before, after: T.hp,
    text: `${T.name} regains ${T.hp - before} HP${beacon ? ' (Beacon of Hope: the most the dice could give)' : ''}${before === 0 && T.hp > 0 ? ' and is conscious again (still Prone)' : ''}.`, rule: beacon ? 'beacon-of-hope' : rule });
  return T.hp - before;
}
// Blessed Healer (Life Cleric 6): healing someone else with a slot heals the cleric 2 + the slot level.
function blessedHealer(b, A, targets, can) {
  if (!A.blessedHealer || can.pay !== 'slot' || !targets.some((X) => X !== A) || A.dead || A.hp <= 0) return;
  heal(b, A, A, 2 + can.slot, 'Blessed Healer', 'blessed-healer', { label: `2 + slot level ${can.slot}`, rolls: [] }, []);
}

// The damage type a spell deals: its own, or the one the target is weakest to
// when the caster can choose (Chromatic Orb, Sorcerous Burst, Transmuted Spell).
function pickType(s, want, T, meta) {
  const choices = s.pickType ? s.types : meta === 'transmuted' && TRANSMUTE.includes(s.type) ? TRANSMUTE : null;
  if (!choices) return s.type;
  if (choices.includes(want)) return want;
  if (!T) return choices[0];
  return [...choices].sort((p, q) => damageMult(T, q) - damageMult(T, p))[0];
}

function castSpell(b, A, intent) {
  const sid = intent.spell;
  const s = SPELLS[sid];
  const meta = intent.meta || null;
  const can = canCast(b, A, sid, intent.slot | 0, meta);
  if (!can.ok) return can.error;
  const me = metaError(b, A, sid, meta);
  if (me) return me;
  const sc = scaled(sid, can.slot, A.level);
  if (meta === 'twinned') sc.targets += s.up.targets;
  // Targets first, so a bad tap never costs a slot.
  const aim = checkAim(b, A, sid, intent, can.slot);
  if (aim.error) return aim.error;
  const targets = aim.targets.map((id) => C(b, id));
  const T = targets[0] || null;
  // Counterspell: a hero who can see an enemy cast a leveled spell is asked first.
  if (s.level > 0 && !intent.uncountered && can.pay !== 'again') {
    const R = counterspeller(b, A);
    if (R) {
      b.pending = { kind: 'counter', reactor: R.id, caster: A.id, spell: sid, intent: { ...intent, uncountered: true } };
      emit(b, { kind: 'prompt', by: R.id, target: A.id, text: `${A.name} starts to cast ${s.name}.`, rule: 'counterspell' });
      return null;
    }
  }

  // Pay.
  const t = b.turn;
  if (can.time === 'bonus') t.bonus = 0; else { t.action--; t.magicUsed = true; }
  if (s.level > 0) t.leveled = true;
  if (meta === 'quickened') t.quick = true;
  let paid = '';
  if (can.pay === 'atwill') paid = ` (at will: ${A.casting.known[sid].atWill})`;
  if (can.pay === 'again') paid = ' again (no new slot: the spell is still going)';
  if (can.pay === 'free') {
    A.casting.known[sid].free--;
    const k = A.casting.known[sid];
    paid = k.perDay ? ` (${k.free} use${k.free === 1 ? '' : 's'} left today)` : ` (free cast${k.freeWhy ? `: ${k.freeWhy}` : ''})`;
  }
  if (can.pay === 'slot') {
    // Boon of Spell Recall: with a level 1 to 4 slot, a d4 that matches the slot's level keeps it.
    const recall = A.spellRecall && can.slot <= 4 ? die(b.rng, 4) : 0;
    if (recall !== can.slot) A.casting.slots[can.slot].left--;
    A.slotKey = turnKey(b);
    paid = recall === can.slot ? ` (level ${can.slot} spell slot, but Free Casting rolls a ${recall} on the d4, so the slot isn't spent; ${A.casting.slots[can.slot].left} left)`
      : ` (level ${can.slot} spell slot${can.slot > s.level ? `, cast at a higher level` : ''}; ${A.casting.slots[can.slot].left} left${recall ? `; Free Casting rolled a ${recall}` : ''})`;
  }
  if (can.pay === 'intervene') {
    A.intervention.uses--;
    paid = ' through Divine Intervention (no spell slot; once per Long Rest)';
  }
  if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
  let metaText = '';
  if (meta === 'overchannel') metaText = ' Overchannel: every damage die counts as its highest number.';
  if (meta && METAMAGIC[meta]) {
    const M = METAMAGIC[meta];
    if (apotheosisFree(b, A)) {
      A.apoKey = turnKey(b);
      metaText = ` ${M.name}: free this turn (Arcane Apotheosis).`;
    } else {
      A.sorcery.uses -= M.cost;
      metaText = ` ${M.name}: ${s1(M.cost, 'Sorcery Point')} (${A.sorcery.uses} left).`;
    }
  }
  emit(b, { kind: 'cast', by: A.id, spell: sid, level: s.level, slot: can.slot, pay: can.pay, rule: can.pay === 'intervene' ? 'divine-intervention' : s.level ? 'spell-slots' : 'cantrips', meta,
    targets: aim.targets, point: aim.point || null,
    text: `${A.name} casts ${s.name}${s.level === 0 ? ' (a cantrip: no slot needed)' : paid}${can.time !== s.time ? ' as a Bonus Action' : ''}.${metaText}` });
  if (s.conc && can.pay !== 'again') {
    startConc(b, A, sid);
    if (meta === 'extended') A.conc.extended = true;
    A.conc.slot = can.slot;
    A.conc.key = turnKey(b);
  }
  const dcParts = spellDCParts(A, sid);
  const dc = sumParts(dcParts);
  const names = (list) => list.map((X) => X.name).join(', ');
  const dmgType = pickType(s, intent.toType, T, meta);
  const empower = meta === 'empowered' ? Math.max(1, A.mods.cha) : 0;
  const heighten = meta === 'heightened' ? (intent.heighten && aim.targets.includes(intent.heighten) ? intent.heighten : targets.find((X) => hostile(A, X))?.id || null) : null;
  // Careful Spell: up to CHA modifier allies (you too) in the area are spared.
  const careful = meta === 'careful' ? targets.filter((X) => !hostile(A, X)).slice(0, Math.max(1, A.mods.cha)).map((X) => X.id) : [];
  const sopts = { distant: meta === 'distant', seeking: meta === 'seeking', empowered: empower, type: dmgType };
  const bonus = spellBonus(A, sid, dmgType);
  const bonus2 = sc.also ? spellBonus(A, sid, sc.also.type).filter((x) => x.rule === 'elemental-affinity' && !bonus.some((y) => y.rule === x.rule)) : [];
  // Sculpt Spells (Evoker 6): up to 1 + the spell's level of allies in an Evocation spell save and take nothing.
  const sculpt = A.sculpt && EVOCATION.includes(sid) && s.area ? targets.filter((X) => !hostile(A, X)).slice(0, 1 + s.level).map((X) => X.id) : [];
  const firstFlat = { ...sopts, flat: bonus };

  const seq0 = b.seq;
  b.spellNow = true;
  if (meta === 'overchannel') b.maxDice = true;
  try { castKind(); } finally { b.spellNow = false; b.maxDice = false; }
  if (meta === 'overchannel') overchannelCost(b, A, s);
  // Improved Blessed Strikes, Potent Spellcasting (Cleric 14): a damaging Cleric cantrip gives Temporary Hit Points to whoever needs them most.
  if (A.potentTemp && s.level === 0 && !A.dead && b.log.some((r) => r.seq > seq0 && r.by === A.id && ((r.kind === 'attack' && r.damage?.total > 0) || (r.kind === 'save-spell' && r.results?.some((x) => x.damage > 0))))) {
    const X = [A, ...alliesOf(b, A)].filter((o) => !o.dead && o.hp > 0 && onBoard(o) && (o === A || feetBetween(A, o) <= 60) && (o.tempHp || 0) < A.potentTemp)
      .sort((p, q) => p.hp / p.hpMax - q.hp / q.hpMax)[0];
    if (X) {
      X.tempHp = A.potentTemp;
      emit(b, { kind: 'note', by: A.id, target: X.id, rule: 'potent-spellcasting', text: `Improved Blessed Strikes: ${X.name} gains ${A.potentTemp} Temporary Hit Points.` });
    }
  }
  return null;

  function castKind() {
  switch (s.kind) {
    case 'attack':
      if (s.wind) {
        // Steel Wind Strike: a melee spell attack against each target, then a teleport next to one of them.
        for (const X of targets) {
          if (b.over || !X || X.dead || !onBoard(X)) continue;
          attack(b, A, X, { ...spellAttack(A, sid, { ...sopts, melee: true }), reach: s.range, dice: sc.dice });
          if (b.pending) break;
        }
        const to = targets.find((X) => !X.dead && onBoard(X)) || null;
        if (to && !b.pending && !b.over && !A.dead) {
          const spot = openNextTo(b, to, A);
          if (spot) {
            const from = { x: A.x, y: A.y };
            A.x = spot.x; A.y = spot.y;
            emit(b, { kind: 'move', by: A.id, path: [{ x: A.x, y: A.y }], feet: 0, left: b.turn.moveLeft, teleport: true, from, rule: sid, text: `${A.name} teleports next to ${to.name}.` });
            tidy(b);
          }
        }
        break;
      }
      if (sc.beams > 1) {
        emit(b, { kind: 'note', by: A.id, text: `${sc.beams} beams: one spell attack roll each.`, rule: 'cantrips' });
        let first = true;
        for (const X of targets) {
          if (b.over || !X || X.dead || !onBoard(X)) continue;
          attack(b, A, X, { ...spellAttack(A, sid, first ? firstFlat : sopts), dice: sc.dice });
          first = false;
          if (b.pending) break;
        }
      } else attack(b, A, T, { ...spellAttack(A, sid, firstFlat), dice: sc.dice });
      break;
    case 'save': areaSave(b, A, targets, { name: s.name, ability: s.save, dcParts, dice: sc.dice, flat: sc.flat, flatLabel: `${s.name} (flat)`, flatRule: sid, type: dmgType, half: !!s.half, rule: sid, cantrip: s.level === 0,
      ignoreCover: !!s.noCover, rider: s.rider || null, heighten, empower, bonus, drain: !!s.drain, dust: !!s.dust }); break;
    case 'word': divineWord(b, A, targets, dc, dcParts, heighten); break;
    case 'pwkill': {
      // Power Word Kill. Words of Creation (Bard 20): a second creature within 10 feet of the first.
      const second = A.wordsOfCreation ? enemiesOf(b, A).filter((X) => X !== T && !X.dead && X.hp > 0 && feetBetween(T, X) <= 10).sort((p, q) => (p.hp <= 100 ? 0 : 1) - (q.hp <= 100 ? 0 : 1) || q.hp - p.hp)[0] : null;
      for (const X of [T, second].filter(Boolean)) {
        if (X === second) emit(b, { kind: 'note', by: A.id, target: X.id, rule: 'words-of-creation', text: `Words of Creation: the word also reaches ${X.name}, within 10 feet of ${T.name}.` });
        if (X.hp <= 100) {
          const was = X.hp;
          X.hp = 0;
          if (X.side === 'foe' || !X.dead) { X.dead = true; X.diedRound = b.round; }
          emit(b, { kind: 'note', by: A.id, target: X.id, rule: sid, text: `${X.name} has ${was} Hit Points (100 or fewer), so it dies. There is no save.` });
        } else {
          const rs = b.maxDice ? Array(12).fill(12) : rollDice(b.rng, 12, 12);
          const d = finishDamage(X, [{ label: 'Power Word Kill 12d12', rolls: rs, value: sum(rs), rule: sid, type: 'Psychic' }]);
          const af = applyDamage(b, X, d.total, { types: d.types, by: A.id });
          emit(b, { kind: 'note', by: A.id, target: X.id, rule: sid, text: `${X.name} has more than 100 Hit Points, so it takes 12d12 (${rs.join(' + ')}) = ${d.total} Psychic damage instead${adjustText(d)}.${afterText(X, af)}` });
        }
        flushPost(b);
      }
      checkOver(b);
      break;
    }
    case 'pwstun': {
      if (T.hp <= 150) {
        addCond(b, T, { id: 'stunned', by: A.id, saveEnds: { ability: 'con', dc }, rule: sid });
        emit(b, { kind: 'note', by: A.id, target: T.id, rule: sid, text: `${T.name} has ${T.hp} Hit Points (150 or fewer), so it is Stunned, no save to stop it. At the end of each of its turns it makes a DC ${dc} Constitution save to end it.` });
      } else {
        b.effects.push({ type: 'rooted', by: A.id, target: T.id, expires: { when: 'start', who: A.id } });
        emit(b, { kind: 'note', by: A.id, target: T.id, rule: sid, text: `${T.name} has more than 150 Hit Points, so the word only holds it in place: Speed 0 until the start of ${A.name}'s next turn.` });
      }
      break;
    }
    case 'area': {
      const from = s.area.from === 'self' ? A : aim.point;
      if (s.cond) { condArea(b, A, sid, targets, { dc, dcParts, from, careful, heighten }); break; }
      if (s.effect) {
        const results = [];
        let caught = 0;
        for (const X of targets) {
          const cover = coverFor(b, from, X);
          const sv = savingThrow(b, X, s.save, dc, { cover });
          if (!sv.success) {
            caught++;
            b.effects = b.effects.filter((e) => !(e.type === s.effect && e.target === X.id));
            b.effects.push({ type: s.effect, by: A.id, target: X.id, conc: A.id, expires: { when: 'never' } });
            if (hasCond(X, 'hidden')) dropCond(X, 'hidden');
          }
          results.push({ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'}${sv.auto ? ' automatically' : ` (${sv.total})`}${sv.success ? '' : ': outlined in light, so attack rolls against it have Advantage'}.` });
        }
        emit(b, { kind: 'save-spell', by: A.id, what: s.name, ability: s.save, dc, dcParts, damage: null, half: false, rule: sid, results,
          text: targets.length ? `${A.name} casts ${s.name} (${areaLabel(s.area)}): DC ${dc} ${ABILITY_NAMES[s.save]} save for ${names(targets)}.` : `${A.name} casts ${s.name}, but nobody is caught in it.` });
        if (!caught) endConc(b, A, 'nobody is affected');
      } else {
        // Destructive Wave, Conjure Volley, Weird: only the creatures the caster chooses (here: every enemy in it).
        const hit = s.choose ? targets.filter((X) => hostile(A, X)) : targets;
        if (s.conc && !hit.length) endConc(b, A, 'nobody is affected');
        areaSave(b, A, hit, { name: s.name, ability: s.save, dcParts, dice: sc.dice, type: dmgType, half: !!s.half, rule: sid, push: s.push || 0, ignoreCover: !!s.noCover, from,
          careful, heighten, empower, cantrip: s.level === 0, also: sc.also, bonus, bonus2, sculpt, rider: s.rider || null, prismatic: s.prismatic || null });
      }
      break;
    }
    case 'missile': {
      const sides = parseDice(s.dice).sides;
      const per = new Map();
      for (const X of targets) {
        const r = b.maxDice ? [sides] : rollDice(b.rng, 1, sides);
        if (!per.has(X.id)) per.set(X.id, []);
        per.get(X.id).push({ rolls: r, value: r[0] + sc.flat });
      }
      let extraB = sumParts(bonus);
      for (const [id, darts] of per) {
        const X = C(b, id);
        if (X.dead || !onBoard(X)) continue;
        const raw = sum(darts.map((d) => d.value)) + extraB;
        if (extraB) { darts.push({ rolls: [], value: extraB, label: bonus.map((x) => x.label).join(', ') }); extraB = 0; }
        const dmg = finishDamage(X, [{ label: s.name, value: raw, type: s.type }]);
        const after = applyDamage(b, X, dmg.total, { types: [s.type], by: A.id });
        emit(b, { kind: 'missile', by: A.id, target: X.id, darts, total: dmg.total, type: s.type, after, rule: 'magic-missile',
          text: `${s1(darts.length, 'dart')} hit${darts.length === 1 ? 's' : ''} ${X.name} for ${dmg.total} Force damage${adjustText(dmg)}.${afterText(X, after)}` });
      }
      flushPost(b);
      checkOver(b);
      break;
    }
    case 'rays': {
      emit(b, { kind: 'note', by: A.id, text: `${sc.rays} rays of fire: one spell attack roll each.`, rule: 'scorching-ray' });
      let seeking = meta === 'seeking';
      let first = true;
      for (const X of targets) {
        if (b.over || !X || X.dead || !onBoard(X)) continue;
        const before = b.seq;
        attack(b, A, X, spellAttack(A, sid, { ...(first ? firstFlat : sopts), seeking }));
        first = false;
        if (seeking && b.log.some((r) => r.seq > before && r.notes?.some((x) => x.rule === 'metamagic'))) seeking = false;
        if (b.pending) break;
      }
      break;
    }
    case 'heal': {
      if (s.full) {
        // Power Word Heal: every Hit Point back, and some conditions end. Words of Creation (Bard 20): a second creature within 10 feet.
        const second = A.wordsOfCreation ? [A, ...alliesOf(b, A)].filter((X) => X !== T && !X.dead && onBoard(X) && feetBetween(T, X) <= 10 && !effectOn(b, 'grave', X.id) && (X.hp < X.hpMax || (X.conds || []).some((c) => s.cures.includes(c.id))))
          .sort((p, q) => p.hp / p.hpMax - q.hp / q.hpMax)[0] : null;
        for (const X of [T, second].filter(Boolean)) {
          if (X === second) emit(b, { kind: 'note', by: A.id, target: X.id, rule: 'words-of-creation', text: `Words of Creation: the word also reaches ${X.name}, within 10 feet of ${T.name}.` });
          heal(b, A, X, Math.max(0, X.hpMax - X.hp), s.name, sid, { label: 'all its Hit Points', rolls: [] }, []);
          const gone = (X.conds || []).filter((c) => s.cures.includes(c.id));
          if (gone.length) {
            X.conds = X.conds.filter((c) => !gone.includes(c));
            emit(b, { kind: 'note', by: A.id, target: X.id, rule: sid, text: `${X.name} is no longer ${[...new Set(gone.map((c) => COND_NAMES[c.id]))].join(' or ')}.` });
          }
          if (hasCond(X, 'prone') && X.hp > 0 && X.reaction && X !== A) {
            X.reaction = false;
            dropCond(X, 'prone');
            emit(b, { kind: 'note', by: X.id, rule: sid, text: `${X.name} uses their Reaction to stand up.` });
          }
        }
        blessedHealer(b, A, [T], can);
        break;
      }
      if (sc.amount) {
        // Heal: a set number of Hit Points, no dice, and some conditions end.
        const mods = A.discipleOfLife && can.pay === 'slot' ? [{ label: `Disciple of Life (2 + slot level ${can.slot})`, value: 2 + can.slot, rule: 'disciple-of-life' }] : [];
        heal(b, A, T, sc.amount + sumParts(mods), s.name, sid, { label: `${sc.amount} (no dice)`, rolls: [] }, mods);
        const gone = (T.conds || []).filter((c) => (s.cures || []).includes(c.id));
        if (gone.length) {
          T.conds = T.conds.filter((c) => !gone.includes(c));
          emit(b, { kind: 'note', by: A.id, target: T.id, rule: sid, text: `${T.name} is no longer ${[...new Set(gone.map((c) => COND_NAMES[c.id]))].join(' or ')}.` });
        }
        blessedHealer(b, A, [T], can);
        break;
      }
      const { n, sides } = parseDice(sc.dice);
      const rolls = A.supremeHealing ? Array(n).fill(sides) : rollDice(b.rng, n, sides);
      const mods = [{ label: 'Spellcasting modifier', value: spellMod(A, sid) }];
      if (A.discipleOfLife && can.pay === 'slot') mods.push({ label: `Disciple of Life (2 + slot level ${can.slot})`, value: 2 + can.slot, rule: 'disciple-of-life' });
      const amount = Math.max(0, sum(rolls) + sumParts(mods));
      heal(b, A, T, amount, s.name, sid, { label: `${sc.dice}${A.supremeHealing ? ' (Supreme Healing: highest on each die)' : ''}`, rolls }, mods, n * sides + sumParts(mods));
      blessedHealer(b, A, [T], can);
      break;
    }
    case 'stabilize':
      T.stable = true;
      T.deathSaves = { s: 0, f: 0 };
      emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name} is Stable.`, rule: 'spare-the-dying' });
      break;
    case 'temp': {
      const { n, sides } = parseDice(sc.dice);
      const maxed = !!A.casting.known[sid].maxed && can.pay === 'atwill';
      const rolls = maxed ? Array(n).fill(sides) : rollDice(b.rng, n, sides);
      const amount = sum(rolls) + sc.flat;
      const before = A.tempHp || 0;
      A.tempHp = Math.max(before, amount);
      emit(b, { kind: 'note', by: A.id, target: A.id, rule: 'temp-hp',
        text: `${s.name}: ${sc.dice} (${maxed ? 'Fiendish Vigor: the highest number on each die, ' : ''}${rolls.join(' + ')}) + ${sc.flat} = ${amount} Temporary Hit Points${before >= amount ? `, but ${A.name} already has ${before}, and they don't stack` : ''}.` });
      break;
    }
    case 'armor':
      setMageArmor(T, true);
      emit(b, { kind: 'note', by: A.id, target: T.id, rule: 'mage-armor', text: `${T.name}'s Armor Class becomes 13 + Dexterity modifier: AC ${T.ac}, until the next Long Rest.` });
      break;
    case 'stride':
      for (const X of targets) {
        b.effects = b.effects.filter((e) => !(e.type === 'stride' && e.target === X.id));
        b.effects.push({ type: 'stride', by: A.id, target: X.id, expires: { when: 'never' } });
        if (X.id === t.who) t.moveLeft += 10;
      }
      emit(b, { kind: 'note', by: A.id, text: `${names(targets)}: Speed +10 feet until the fight ends.`, rule: sid });
      break;
    case 'buff': {
      if (s.buff === 'aid') {
        for (const X of targets) {
          const extra = Math.max(0, sc.amount - (X.aid || 0));
          X.aid = Math.max(X.aid || 0, sc.amount);
          X.hpMax += extra;
          X.hp += extra;
          if (X.hp > 0 && extra) { X.stable = false; X.deathSaves = { s: 0, f: 0 }; }
        }
        emit(b, { kind: 'note', by: A.id, text: `${names(targets)}: Hit Point maximum and current Hit Points +${sc.amount} (Aid lasts 8 hours, no Concentration).`, rule: 'aid' });
      } else {
        const breathType = s.buff === 'dbreath' ? (s.types.includes(intent.toType) ? intent.toType : 'Fire') : null;
        for (const X of targets) {
          b.effects = b.effects.filter((x) => !(x.type === s.buff && x.target === X.id));
          const e = { type: s.buff, by: A.id, target: X.id, expires: { when: 'never' } };
          if (s.conc) e.conc = A.id;
          if (s.buff === 'heroism') { e.amount = Math.max(0, spellMod(A, sid)); dropCond(X, 'frightened'); }
          if (s.buff === 'dbreath') Object.assign(e, { dice: sc.dice, dmgType: breathType, dcParts });
          if (s.buff === 'magicweapon') e.amount = can.slot >= 6 ? 3 : can.slot >= 4 ? 2 : 1;
          if (s.buff === 'haste' && X.id === t.who) t.moveLeft += speedOf(b, X) / 2;
          b.effects.push(e);
        }
        const keep = `while ${A.name} keeps Concentration`;
        const text = {
          bless: `+1d4 to attack rolls and saving throws ${keep}.`,
          faith: `+2 Armor Class ${keep}.`,
          heroism: `can't be Frightened, and gain ${Math.max(0, spellMod(A, sid))} Temporary Hit Points at the start of each of their turns, ${keep}.`,
          pfe: `Aberrations, Celestials, Elementals, Fey, Fiends and Undead have Disadvantage on attack rolls against them, ${keep}.`,
          bark: "Armor Class can't be less than 17 for the next hour (no Concentration).",
          dbreath: `can exhale ${breathType} as a Magic action: a 15-foot Cone, DC ${dc} Dexterity save, ${sc.dice} damage (half on a success), ${keep}.`,
          haste: `Speed doubled, +2 Armor Class, Advantage on Dexterity saves, and one extra action each turn (one weapon attack, Dash, Disengage or Hide), ${keep}. When it ends: a turn of lethargy.`,
          magicweapon: `weapons are magic for 1 hour: +${can.slot >= 6 ? 3 : can.slot >= 4 ? 2 : 1} to attack and damage rolls (no Concentration).`,
          beacon: `Advantage on Wisdom saves and death saves, and any healing gives them the most Hit Points it could, ${keep}.`,
          invis: `Invisible: attack rolls against them have Disadvantage and theirs have Advantage, ${keep}.`,
          stoneskin: `Resistance to Bludgeoning, Piercing and Slashing damage, ${keep}.`,
          holyaura: `Advantage on saving throws, and attack rolls against them have Disadvantage. A Fiend or Undead that hits one of them in melee makes a Constitution save or is Blinded, ${keep}.`,
          deathward: 'the first time they would drop to 0 Hit Points in the next 8 hours, they drop to 1 instead and the spell ends (no Concentration).',
        }[s.buff] || 'blessed.';
        emit(b, { kind: 'note', by: A.id, text: `${names(targets)}: ${text}`, rule: sid });
      }
      break;
    }
    case 'selfbuff': {
      b.effects = b.effects.filter((x) => !(x.type === s.buff && x.target === A.id));
      const e = { type: s.buff, by: A.id, target: A.id, expires: { when: 'never' } };
      if (s.conc) e.conc = A.id;
      b.effects.push(e);
      emit(b, { kind: 'note', by: A.id, rule: sid, text: {
        favor: `${A.name}'s weapon attacks deal an extra 1d4 Radiant damage on a hit for 1 minute.`,
        blur: `${A.name}'s body blurs: attack rolls against them have Disadvantage while they keep Concentration.`,
        fireshield: `Warm flames wrap ${A.name} for 10 minutes: Resistance to Cold damage, and a creature within 5 feet that hits them with a melee attack takes 2d8 Fire damage.`,
        auralife: `A 30-foot aura of life around ${A.name}: allies in it have Resistance to Necrotic damage, and an ally at 0 Hit Points who starts a turn in it regains 1 Hit Point, while ${A.name} keeps Concentration.`,
      }[s.buff] || `${A.name} is protected.` });
      break;
    }
    case 'mark': {
      b.effects = b.effects.filter((x) => !(x.type === 'mark' && x.by === A.id));
      b.effects.push({ type: 'mark', spell: sid, name: s.name, by: A.id, target: T.id, dice: s.dice, dmgType: s.type, conc: A.id, expires: { when: 'never' } });
      emit(b, { kind: 'note', by: A.id, target: T.id, rule: sid,
        text: `${s.name}: +${s.dice} ${s.type} damage whenever ${A.name} hits ${T.name} with an attack roll, while ${A.name} keeps Concentration. If ${T.name} drops to 0 Hit Points, ${A.name} can move it to another creature as a Bonus Action.` });
      break;
    }
    case 'bane': {
      const results = [];
      let hit = 0;
      for (const X of targets) {
        const sv = savingThrow(b, X, 'cha', dc, { extraDis: heighten === X.id ? [{ text: 'Heightened Spell', rule: 'metamagic' }] : [] });
        if (!sv.success) { hit++; b.effects.push({ type: 'bane', by: A.id, target: X.id, conc: A.id, expires: { when: 'never' } }); }
        results.push({ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'} (${sv.total})${sv.success ? '' : ': −1d4 on its attack rolls and saving throws'}.` });
      }
      emit(b, { kind: 'save-spell', by: A.id, what: s.name, ability: 'cha', dc, dcParts, damage: null, half: false, rule: sid, results,
        text: `${A.name} casts ${s.name} on ${names(targets)}: DC ${dc} Charisma save.` });
      if (!hit) endConc(b, A, 'nobody is affected');
      break;
    }

    case 'cure': {
      const x = T.conds.find((y) => s.cures.includes(y.id) && (!intent.cond || y.id === intent.cond)) || T.conds.find((y) => s.cures.includes(y.id));
      if (x) {
        T.conds = T.conds.filter((y) => y !== x);
        emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name} is no longer ${COND_NAMES[x.id]}.`, rule: sid });
      } else if (T.drained > 0) {
        T.hpMax += T.drained;
        emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name}'s Hit Point maximum comes back by ${T.drained} to ${T.hpMax}.`, rule: sid });
        T.drained = 0;
      } else {
        T.exhaustion = Math.max(0, (T.exhaustion || 0) - 1);
        emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name}'s Exhaustion drops by 1 (now ${T.exhaustion}).`, rule: sid });
      }
      break;
    }
    case 'teleport': {
      const from = { x: A.x, y: A.y };
      A.x = aim.point.x; A.y = aim.point.y;
      emit(b, { kind: 'move', by: A.id, path: [{ x: A.x, y: A.y }], feet: 0, left: t.moveLeft, teleport: true, from,
        text: `${A.name} teleports ${cheb(from, A) * FT} ft. Teleporting doesn't provoke Opportunity Attacks.`, rule: 'misty-step' });
      tidy(b);
      break;
    }
    case 'command': {
      const results = [];
      for (const X of targets) {
        const sv = condSave(b, A, X, 'wis', dc, sid, null, heighten);
        if (!sv.success) addCond(b, X, { id: 'commanded', by: A.id, word: 'grovel', rule: 'command' });
        results.push({ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'} (${sv.total})${sv.success ? '' : ': on its next turn it falls Prone and the turn ends'}.` });
      }
      emit(b, { kind: 'save-spell', by: A.id, what: `${s.name}: "Grovel!"`, ability: 'wis', dc, dcParts, damage: null, half: false, rule: sid, results,
        text: `${A.name} commands ${names(targets)}: "Grovel!" DC ${dc} Wisdom save.` });
      break;
    }
    case 'hold': {
      const results = [];
      let held = 0;
      for (const X of targets) {
        const sv = condSave(b, A, X, 'wis', dc, sid, null, heighten);
        if (!sv.success) { held++; addCond(b, X, { id: 'paralyzed', by: A.id, conc: A.id, saveEnds: { ability: 'wis', dc }, rule: sid }); }
        results.push({ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'} (${sv.total})${sv.success ? '' : ': Paralyzed, saving again at the end of each of its turns'}.` });
      }
      emit(b, { kind: 'save-spell', by: A.id, what: s.name, ability: 'wis', dc, dcParts, damage: null, half: false, rule: sid, results,
        text: `${A.name} casts ${s.name} on ${names(targets)}: DC ${dc} Wisdom save.` });
      if (!held) endConc(b, A, 'nobody is held');
      break;
    }
    case 'spiritual': {
      b.effects = b.effects.filter((x) => !(x.type === 'spiritual' && x.by === A.id));
      const spot = nextTo(b, T, A);
      b.effects.push({ type: 'spiritual', by: A.id, conc: A.id, x: spot.x, y: spot.y, dice: sc.dice, expires: { when: 'never' } });
      spiritualStrike(b, A, T);
      break;
    }
    case 'massheal': {
      if (s.pool) {
        // Mass Heal: a pool of Hit Points shared out, the most hurt first; some conditions end.
        let pool = s.pool;
        const order = [...targets].sort((p, q) => p.hp / p.hpMax - q.hp / q.hpMax);
        for (const X of order) {
          const want = Math.min(pool, Math.max(0, X.hpMax - X.hp));
          if (want > 0) { pool -= heal(b, A, X, want, s.name, sid, { label: `from the pool (${s.pool})`, rolls: [] }, []); }
          const gone = (X.conds || []).filter((c) => s.cures.includes(c.id));
          if (gone.length) {
            X.conds = X.conds.filter((c) => !gone.includes(c));
            emit(b, { kind: 'note', by: A.id, target: X.id, rule: sid, text: `${X.name} is no longer ${[...new Set(gone.map((c) => COND_NAMES[c.id]))].join(' or ')}.` });
          }
        }
        emit(b, { kind: 'note', by: A.id, rule: sid, text: `${s.name}: ${s.pool - pool} of the ${s.pool} Hit Points shared out among ${names(targets)}.` });
        blessedHealer(b, A, targets, can);
        break;
      }
      const { n, sides } = parseDice(sc.dice);
      const rolls = A.supremeHealing ? Array(n).fill(sides) : rollDice(b.rng, n, sides);
      const mods = [{ label: 'Spellcasting modifier', value: spellMod(A, sid) }];
      if (A.discipleOfLife && can.pay === 'slot') mods.push({ label: `Disciple of Life (2 + slot level ${can.slot})`, value: 2 + can.slot, rule: 'disciple-of-life' });
      const amount = Math.max(0, sum(rolls) + sumParts(mods));
      emit(b, { kind: 'note', by: A.id, rule: sid, text: `${s.name}: ${sc.dice} (${rolls.join(' + ')}) + ${sumParts(mods)} = ${amount} Hit Points for each of ${names(targets)}.` });
      for (const X of targets) heal(b, A, X, amount, s.name, sid, { label: sc.dice, rolls }, mods, n * sides + sumParts(mods));
      blessedHealer(b, A, targets, can);
      break;
    }
    case 'revive': {
      T.dead = false;
      T.hp = 1;
      T.stable = false;
      T.deathSaves = { s: 0, f: 0 };
      T.diedRound = null;
      emit(b, { kind: 'heal', by: A.id, target: T.id, what: s.name, total: 1, before: 0, after: 1, rule: sid,
        text: `${T.name} returns to life with 1 Hit Point (still Prone). The diamond crumbles to dust.` });
      break;
    }
    case 'zone': startZone(b, A, sid, aim, sc, dcParts); break;
    case 'dispel': {
      const ended = dispelOn(b, A, T, can.slot, sid);
      emit(b, { kind: 'note', by: A.id, target: T.id, rule: sid,
        text: ended.length ? `${s.name} ends ${ended.join(', ')} on ${T.name}.` : `${s.name}: no spell on ${T.name} to end.` });
      break;
    }
    default:
  }
  }
}

// Overchannel: free the first time; after that, 2d12 Necrotic per spell level, 1d12 more each time, through any Resistance.
function overchannelCost(b, A, s) {
  const o = A.overchannel;
  if (o.uses > 0) {
    o.uses--;
    emit(b, { kind: 'note', by: A.id, rule: 'overchannel', text: `Overchannel: the first time since a Long Rest costs ${A.name} nothing.` });
    return;
  }
  const n = (2 + o.extra) * s.level;
  o.extra++;
  const rs = rollDice(b.rng, n, 12);
  const after = applyDamage(b, A, sum(rs), { types: ['Necrotic'], by: null });
  emit(b, { kind: 'note', by: A.id, target: A.id, rule: 'overchannel',
    text: `Overchannel again: ${A.name} takes ${n}d12 (${rs.join(' + ')}) = ${sum(rs)} Necrotic damage, which ignores Resistance and Immunity.${afterText(A, after)}` });
  flushPost(b);
  checkOver(b);
}

// Divine Word: on a failed Charisma save, what happens depends on the Hit Points it has now.
function divineWord(b, A, targets, dc, dcParts, heighten) {
  const results = [];
  for (const X of targets) {
    const sv = condSave(b, A, X, 'cha', dc, 'divine-word', null, heighten);
    let what = '';
    if (!sv.success) {
      const hp = X.hp;
      if (hp <= 20) {
        X.hp = 0;
        X.dead = true;
        if (X.side === 'hero') X.diedRound = b.round;
        else b.post.push({ kind: 'blessing', id: X.id, by: A.id });
        what = `: with ${hp} Hit Points, it dies`;
      } else if (hp <= 30) {
        addCond(b, X, { id: 'blinded', by: A.id, rule: 'divine-word' });
        addCond(b, X, { id: 'stunned', by: A.id, rule: 'divine-word' });
        what = `: with ${hp} Hit Points, it is Blinded and Stunned for an hour`;
      } else if (hp <= 40) {
        addCond(b, X, { id: 'blinded', by: A.id, rule: 'divine-word' });
        what = `: with ${hp} Hit Points, it is Blinded for 10 minutes`;
      } else if (hp <= 50) what = `, but with ${hp} Hit Points it is only Deafened, which changes nothing here`;
      else what = `, but with ${hp} Hit Points (over 50) the word does nothing to it`;
    }
    results.push({ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'} (${sv.total})${what}.` });
  }
  emit(b, { kind: 'save-spell', by: A.id, what: 'Divine Word', ability: 'cha', dc, dcParts, damage: null, half: false, rule: 'divine-word', results,
    text: `${A.name} speaks a Divine Word: DC ${dc} Charisma save for ${targets.map((X) => X.name).join(', ')}.` });
  tidy(b);
  flushPost(b);
  checkOver(b);
}

// --------------------------------------------------------------- zones ----
// Spells that stay on the board: Spirit Guardians (an Emanation that moves
// with its caster), Stinking Cloud and Sleet Storm (a Sphere at a point).
// on: when a creature makes the save: entering, starting or ending a turn.
const ZONES = {
  guardians: { on: ['enter', 'end'], foesOnly: true, difficult: true },
  stink: { on: ['start'] },
  sleet: { on: ['enter', 'start'], difficult: true },
  plague: { on: ['enter', 'end'], difficult: true, onCast: true },
  kill: { on: ['enter', 'end'], onCast: true },
  guardian: { on: ['enter', 'start'], foesOnly: true, cap: 60 },
  incendiary: { on: ['enter', 'end'], onCast: true },
};
function startZone(b, A, sid, aim, sc, dcParts) {
  const s = SPELLS[sid];
  const Z = ZONES[s.zone];
  const at = s.area.from === 'self' ? null : aim.point;
  // A Concentration zone replaces the caster's last one; Guardian of Faith (no Concentration) replaces only an earlier guardian.
  b.effects = b.effects.filter((e) => !(e.type === 'zone' && e.by === A.id && (s.conc ? e.conc : e.spell === sid)));
  b.effects.push({ type: 'zone', spell: sid, zone: s.zone, by: A.id, conc: s.conc ? A.id : null, follow: at ? null : A.id, x: at ? at.x : A.x, y: at ? at.y : A.y,
    r: sqOf(s.area.size), dice: sc.dice || null, flat: sc.flat || 0, dcParts, dc: sumParts(dcParts), save: s.save, dmgType: s.type || null, half: !!s.half,
    foesOnly: !!Z.foesOnly, difficult: !!Z.difficult, on: Z.on, hits: {}, cap: Z.cap || 0, dealt: 0, expires: { when: 'never' } });
  const where = s.zone === 'guardian' ? `a spectral guardian; it watches the squares within ${s.area.size} feet of it` : at ? `a ${s.area.size}-foot-radius Sphere` : `a ${s.area.size}-foot Emanation around ${A.name}`;
  const when = { guardians: 'enters it or ends its turn there', stink: 'starts its turn in it', sleet: 'enters it or starts its turn there',
    plague: 'is in it now, enters it or ends its turn there', kill: 'is in it now, enters it or ends its turn there',
    guardian: 'moves within reach of it or starts its turn there', incendiary: 'is in it now, enters it or ends its turn there' }[s.zone];
  emit(b, { kind: 'note', by: A.id, rule: sid, text: `${s.name} ${s.zone === 'guardian' ? 'calls up' : 'fills'} ${where}. Each ${Z.foesOnly ? 'enemy' : 'creature'} that ${when} makes a DC ${sumParts(dcParts)} ${ABILITY_NAMES[s.save]} save${Z.cap ? `. It vanishes once it has dealt ${Z.cap} damage` : ''}.` });
  // Insect Plague and Cloudkill: everyone inside saves as the spell appears.
  if (Z.onCast) {
    const e = b.effects[b.effects.length - 1];
    const inside = Object.values(b.creatures).filter((X) => zoneAffects(b, e, X) && inZone(b, e, X));
    for (const X of inside) e.hits[X.id] = turnKey(b);
    if (inside.length) { b.spellNow = true; try { areaSave(b, A, inside, { name: s.name, ability: e.save, dcParts, dice: e.dice, type: e.dmgType, half: e.half, rule: sid, ignoreCover: true }); } finally { b.spellNow = false; } }
  }
}
const zoneCenter = (b, e) => (e.follow ? C(b, e.follow) : e);
function inZoneAt(b, e, c, p) {
  if (!c || (e.follow && c.x === p.x && c.y === p.y)) return false;
  return cheb(c, p) <= e.r && lineOfSight(b, c, p);
}
const inZone = (b, e, p) => inZoneAt(b, e, zoneCenter(b, e), p);
function zoneAffects(b, e, X) {
  if (!X || X.dead || !onBoard(X) || X.hp <= 0) return false;
  if (e.follow === X.id) return false;
  const A = C(b, e.by);
  return !e.foesOnly || (A && hostile(A, X));
}
function zoneHit(b, e, X) {
  const A = C(b, e.by);
  const k = turnKey(b);
  if (!A || e.hits[X.id] === k) return;   // no more than once a turn
  e.hits[X.id] = k;
  const s = SPELLS[e.spell];
  if (e.dice || e.flat) {
    let res;
    b.spellNow = true;
    try {
      res = areaSave(b, A, [X], { name: s.name, ability: e.save, dcParts: e.dcParts, dice: e.dice, flat: e.flat, flatLabel: `${s.name} (flat)`, flatRule: e.spell, type: e.dmgType, half: e.half, rule: e.spell, ignoreCover: true });
    } finally { b.spellNow = false; }
    // Guardian of Faith: gone once it has dealt its total.
    if (e.cap) {
      e.dealt += sum((res || []).map((r) => r.damage));
      if (e.dealt >= e.cap && b.effects.includes(e)) {
        b.effects = b.effects.filter((z) => z !== e);
        emit(b, { kind: 'note', by: A.id, rule: e.spell, text: `${s.name} has dealt ${e.cap} damage in all, so the guardian vanishes.` });
      }
    }
    return;
  }
  b.spellNow = true;
  const sv = savingThrow(b, X, e.save, e.dc, { cond: e.zone === 'stink' ? 'poisoned' : null });
  b.spellNow = false;
  let what = '';
  if (!sv.success && e.zone === 'sleet' && addCond(b, X, { id: 'prone', by: A.id, why: 'Sleet Storm' })) what = ': it slips and falls Prone';
  if (!sv.success && e.zone === 'stink' && addCond(b, X, { id: 'poisoned', by: A.id, endsOn: { when: 'end', who: X.id }, rule: 'stinking-cloud' })) {
    if (b.turn?.who === X.id) { b.turn.action = 0; b.turn.bonus = 0; b.turn.attacksLeft = 0; }
    what = ': Poisoned, retching, with no action or Bonus Action this turn';
  }
  emit(b, { kind: 'save-spell', by: A.id, what: s.name, ability: e.save, dc: e.dc, dcParts: e.dcParts, damage: null, half: false, rule: e.spell,
    results: [{ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'}${sv.auto ? ' automatically' : ` (${sv.total})`}${sv.success ? '' : what}.` }],
    text: `${s.name}: ${X.name} makes a DC ${e.dc} ${ABILITY_NAMES[e.save]} save.` });
}
// A creature starts or ends its turn: the zones it is in.
function zoneTick(b, X, when) {
  for (const e of b.effects.filter((z) => z.type === 'zone' && z.on.includes(when))) {
    if (b.over || !b.effects.includes(e)) continue;
    if (zoneAffects(b, e, X) && inZone(b, e, X)) zoneHit(b, e, X);
  }
}
// A creature takes a step: zones it walks into, and, if it carries an
// Emanation, the creatures that Emanation now reaches.
function zoneStep(b, M, from, to, pre = () => {}) {
  let first = true;
  const hit = (e, X) => { if (first) { pre(); first = false; } zoneHit(b, e, X); };
  for (const e of b.effects.filter((z) => z.type === 'zone' && z.on.includes('enter'))) {
    if (b.over || !b.effects.includes(e)) continue;
    if (e.follow === M.id) {
      for (const X of Object.values(b.creatures)) {
        if (X === M || !zoneAffects(b, e, X)) continue;
        if (!inZoneAt(b, e, from, X) && inZoneAt(b, e, to, X)) hit(e, X);
      }
    } else if (zoneAffects(b, e, M) && !inZone(b, e, from) && inZone(b, e, to)) hit(e, M);
  }
}

// Dispel Magic: the spells it can end on a creature. Effects map to spells.
const EFFECT_SPELL = {
  bless: 'bless', faith: 'shield-of-faith', heroism: 'heroism', pfe: 'protection-from-evil-and-good', bark: 'barkskin', dbreath: 'dragons-breath',
  haste: 'haste', magicweapon: 'magic-weapon', bane: 'bane', outlined: 'faerie-fire', favor: 'divine-favor', blur: 'blur', stride: 'longstrider',
  shield: 'shield', guided: 'guiding-bolt', mocked: 'vicious-mockery', grave: 'chill-touch', chill: 'ray-of-frost', shocked: 'shocking-grasp', wisp: 'starry-wisp',
  beacon: 'beacon-of-hope', invis: 'greater-invisibility', stoneskin: 'stoneskin', deathward: 'death-ward', fireshield: 'fire-shield', auralife: 'aura-of-life',
};
function dispelOn(b, A, T, slot) {
  const ended = new Set();
  const can = (sid) => {
    const lv = SPELLS[sid].level;
    if (lv <= slot) return true;
    const r = die(b.rng, 20), mod = spellMod(A, 'dispel-magic');
    const ok = r + mod >= 10 + lv;
    emit(b, { kind: 'note', by: A.id, rule: 'dispel-magic', text: `${SPELLS[sid].name} is level ${lv}: ${A.name} rolls ${r} + ${mod} = ${r + mod} against DC ${10 + lv}, ${ok ? 'and ends it' : 'not enough'}.` });
    return ok;
  };
  for (const e of [...b.effects]) {
    const sid = e.type === 'mark' ? e.spell : EFFECT_SPELL[e.type];
    if (!sid || e.target !== T.id || !SPELLS[sid]) continue;
    if (can(sid)) { b.effects = b.effects.filter((x) => x !== e); ended.add(SPELLS[sid].name); }
  }
  for (const x of [...(T.conds || [])]) {
    if (x.lethargy || !SPELLS[x.rule]) continue;
    if (can(x.rule)) { T.conds = T.conds.filter((y) => y !== x); ended.add(SPELLS[x.rule].name); }
  }
  return [...ended];
}

// Who could Counterspell A's spell right now (an enemy with the spell, a
// Reaction and a level 3+ slot, within 60 feet and in sight).
function counterspeller(b, A) {
  return enemiesOf(b, A).find((R) => R.casting?.known?.counterspell && R.reaction && !incap(R) && !R.dead && R.hp > 0 && !R.raging && !R.shape
    && feetBetween(R, A) <= 60 && lineOfSight(b, R, A) && R.slotKey !== turnKey(b) && slotFor(b, R, 'counterspell')) || null;
}

// Area spells that impose a condition instead of damage: Entangle and Web
// (Restrained, escape with Strength (Athletics)) and Sleep.
function condArea(b, A, sid, targets, { dc, dcParts, from, careful = [], heighten = null }) {
  const s = SPELLS[sid];
  const sleep = s.cond === 'sleep';
  // Sleep and Slow: only creatures of the caster's choice, so only enemies here.
  let list = sleep || s.choose ? targets.filter((X) => hostile(A, X)) : targets;
  if (s.choose > 1) list = list.slice(0, s.choose);
  const results = [];
  let caught = 0;
  for (const X of list) {
    if (sleep && (X.condImmune?.includes('exhaustion') || X.speciesId === 'elf')) {
      results.push({ target: X.id, auto: 'success', success: true, mods: [], total: dc, d20: null, damage: 0,
        text: `${X.name} succeeds automatically: ${X.speciesId === 'elf' ? "elves can't be put to sleep by magic" : "it doesn't sleep"}.` });
      continue;
    }
    const cover = s.save === 'dex' ? coverFor(b, from, X) : null;
    const sv = savingThrow(b, X, s.save, dc, { cover, cond: s.cond === 'fear' ? 'frightened' : s.cond === 'pattern' ? 'charmed' : null, careful: careful.includes(X.id), extraDis: heighten === X.id ? [{ text: 'Heightened Spell', rule: 'metamagic' }] : [] });
    let immune = false;
    if (!sv.success) {
      caught++;
      if (sleep) addCond(b, X, { id: 'incapacitated', by: A.id, conc: A.id, endsOnDamage: true, sleep: { dc, ability: 'wis' }, rule: 'sleep' });
      else if (s.cond === 'slow') { addCond(b, X, { id: 'slow', by: A.id, conc: A.id, saveEnds: { ability: 'wis', dc }, rule: 'slow' }); X.reaction = false; }
      else if (s.cond === 'pattern') {
        if (addCond(b, X, { id: 'charmed', by: A.id, conc: A.id, endsOnDamage: true, pattern: true, rule: 'hypnotic-pattern' })) {
          addCond(b, X, { id: 'incapacitated', by: A.id, conc: A.id, endsOnDamage: true, pattern: true, rule: 'hypnotic-pattern' });
        } else immune = true;
      } else if (s.cond === 'fear') immune = !addCond(b, X, { id: 'frightened', by: A.id, conc: A.id, flee: true, saveEnds: { ability: 'wis', dc, unseen: A.id }, rule: 'fear' });
      else addCond(b, X, { id: 'restrained', by: A.id, conc: A.id, escape: { dc, ability: 'str' }, rule: sid });
    }
    const what = sleep ? 'Incapacitated until the end of its next turn, then a second save or it falls Unconscious'
      : s.cond === 'slow' ? 'Slowed: half Speed, −2 AC and Dexterity saves, no Reactions, an action or a Bonus Action but not both'
      : s.cond === 'pattern' ? 'Charmed: Incapacitated, Speed 0, until it takes damage or someone shakes it awake'
      : s.cond === 'fear' ? `Frightened of ${A.name}: it drops what it holds and runs`
      : `Restrained (an action and a DC ${dc} Strength (Athletics) check to break free)`;
    if (immune) caught--;
    results.push({ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'}${sv.careful ? ' automatically (Careful Spell)' : sv.auto ? ' automatically' : ` (${sv.total})`}${sv.success ? '' : immune ? `, but it can't be ${s.cond === 'fear' ? 'Frightened' : 'Charmed'}` : `: ${what}`}.` });
  }
  emit(b, { kind: 'save-spell', by: A.id, what: s.name, ability: s.save, dc, dcParts, damage: null, half: false, rule: sid, results,
    text: list.length ? `${A.name} casts ${s.name} (${areaLabel(s.area)}): DC ${dc} ${ABILITY_NAMES[s.save]} save for ${list.map((X) => X.name).join(', ')}.` : `${A.name} casts ${s.name}, but nobody is caught in it.` });
  if (!caught) endConc(b, A, 'nobody is affected');
}

// A square next to T for a summoned weapon (it doesn't block anyone).
// An empty square next to T that A could stand in, nearest to A first.
function openNextTo(b, T, A) {
  const opts = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const x = T.x + dx, y = T.y + dy;
    if ((dx || dy) && inBounds(x, y) && ((x === A.x && y === A.y) || canEndAt(b, A, x, y))) opts.push({ x, y, d: cheb(A, { x, y }) });
  }
  return opts.sort((p, q) => p.d - q.d)[0] || null;
}
function nextTo(b, T, prefer) {
  const opts = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    const x = T.x + dx, y = T.y + dy;
    if (inBounds(x, y)) opts.push({ x, y, d: Math.abs(x - prefer.x) + Math.abs(y - prefer.y) });
  }
  opts.sort((p, q) => p.d - q.d);
  return opts[0] || { x: T.x, y: T.y };
}

function spiritualStrike(b, A, T) {
  const w = b.effects.find((x) => x.type === 'spiritual' && x.by === A.id);
  const spot = nextTo(b, T, w);
  w.x = spot.x; w.y = spot.y;
  const atk = spellAttack(A, 'spiritual-weapon', { melee: true, dice: w.dice, flat: [{ label: 'Spellcasting modifier', value: spellMod(A, 'spiritual-weapon'), rule: 'spellcasting' }] });
  atk.name = 'Spiritual Weapon';
  atk.ignoreCover = true;
  attack(b, A, T, atk);
}

// Ghast's Stench: a creature that starts its turn within 5 feet saves or is
// Poisoned until the start of its next turn. A success makes it immune to
// that ghast's Stench for 24 hours (here: the rest of the fight).
// Fear Aura (Pit Fiend): an enemy that starts its turn close by saves or is Frightened.
function fearAuraTick(b, X) {
  if (X.dead || X.hp <= 0 || b.over) return;
  for (const G of Object.values(b.creatures)) {
    if (!G.fearAura || G.dead || G.hp <= 0 || incap(G) || !hostile(G, X) || feetBetween(G, X) > G.fearAura.size || (X.fearSafe || []).includes(G.id)) continue;
    const sv = savingThrow(b, X, 'wis', G.fearAura.dc, { cond: 'frightened' });
    if (sv.success) X.fearSafe = [...(X.fearSafe || []), G.id];
    else addCond(b, X, { id: 'frightened', by: G.id, endsOn: { when: 'start', who: X.id }, rule: 'frightened' });
    emit(b, { kind: 'save', save: 'condition', by: X.id, ...sv, dc: G.fearAura.dc, outcome: sv.success ? 'success' : 'fail', rule: 'frightened',
      text: `${X.name} starts its turn in ${G.name}'s Fear Aura: Wisdom save DC ${G.fearAura.dc}, ${sv.auto ? 'automatic' : sv.total}. ${sv.success ? 'A success: immune to this aura for 24 hours.' : `Frightened of ${G.name} until the start of its next turn.`}` });
  }
}
function stenchTick(b, X) {
  if (X.dead || X.hp <= 0 || !onBoard(X)) return;
  for (const G of Object.values(b.creatures)) {
    if (!G.stench || G === X || G.dead || G.hp <= 0 || cheb(G, X) > 1 || (X.stenchSafe || []).includes(G.id)) continue;
    const dc = G.stench.dc;
    const sv = savingThrow(b, X, 'con', dc, { cond: 'poisoned' });
    if (sv.success) X.stenchSafe = [...(X.stenchSafe || []), G.id];
    else addCond(b, X, { id: 'poisoned', by: G.id, endsOn: { when: 'start', who: X.id }, rule: 'stench' });
    emit(b, { kind: 'save', save: 'condition', by: X.id, ...sv, dc, outcome: sv.success ? 'success' : 'fail', rule: 'stench',
      text: `${G.name}'s Stench: ${X.name} makes a DC ${dc} Constitution save, ${sv.auto ? 'automatically succeeding' : sv.total}: ${sv.success ? 'immune to it for the rest of the fight' : 'Poisoned until the start of its next turn'}.` });
  }
}

// ---------------------------------------------------------- the turn ----

function expire(b, when, who) {
  const keep = (x) => {
    if (x.when !== when || x.who !== who) return true;
    if (x.skip > 0) { x.skip--; return true; }
    return false;
  };
  b.effects = b.effects.filter((e) => keep(e.expires));
  for (const c of Object.values(b.creatures)) {
    if (!c.conds?.some((x) => x.endsOn)) continue;
    const gone = c.conds.filter((x) => x.endsOn && !keep(x.endsOn));
    if (!gone.length) continue;
    c.conds = c.conds.filter((x) => !gone.includes(x));
    for (const g of gone) emit(b, { kind: 'note', target: c.id, text: `${c.name} is no longer ${COND_NAMES[g.id]}.`, rule: g.rule || 'conditions' });
  }
}

// opts.surprised: ids of creatures that roll Initiative with Disadvantage.
export function rollInitiative(b, { surprised = [] } = {}) {
  CUR = b;
  // Everyone can take a Reaction before their first turn.
  for (const c of Object.values(b.creatures)) c.reaction = !incap(c);
  const entries = Object.values(b.creatures).map((c) => {
    const adv = c.initAdv ? [c.cls === 'barbarian' ? { text: 'Feral Instinct', rule: 'feral-instinct' } : { text: 'Remarkable Athlete', rule: 'remarkable-athlete' }] : [];
    const dis = surprised.includes(c.id) ? [{ text: 'Surprised', rule: 'surprise' }] : [];
    const mode = modeFrom(adv, dis);
    const d20 = rollD20(b, c, mode);
    const parts = [...c.initParts, ...testParts(c)];
    const mod = sumParts(parts);
    return { id: c.id, d20: { ...d20, adv, dis }, parts, total: d20.kept + mod, dex: c.mods.dex, surprised: dis.length > 0 };
  });
  entries.sort((p, q) => q.total - p.total || q.dex - p.dex
    || (C(b, p.id).side === 'hero' ? -1 : 1) - (C(b, q.id).side === 'hero' ? -1 : 1) || (p.id < q.id ? -1 : 1));
  b.order = entries.map((e) => e.id);
  // Thief's Reflexes (Thief 17): a second turn in the first round, at Initiative minus 10.
  const extra = entries.filter((e) => C(b, e.id).thiefReflexes && !e.surprised);
  for (const e of extra) {
    const at = entries.filter((x) => x.total >= e.total - 10).length;
    b.order.splice(Math.min(b.order.length, at + extra.indexOf(e)), 0, e.id);
  }
  b.extraTurns = extra.length ? b.order.map((id, i) => (b.order.indexOf(id) !== i ? i : -1)).filter((i) => i >= 0) : null;
  b.round = 1;
  emit(b, { kind: 'initiative', entries, text: surprised.length ? 'Everyone rolls Initiative. The surprised roll with Disadvantage.' : 'Everyone rolls Initiative.', rule: surprised.length ? 'surprise' : 'initiative' });
  for (const e of extra) emit(b, { kind: 'note', by: e.id, rule: 'thiefs-reflexes', text: `Thief's Reflexes: ${C(b, e.id).name} also takes a second turn this round, at Initiative ${e.total - 10}.` });
  // Uncanny Metabolism (Monk 2): used as Initiative is rolled, when it helps.
  for (const c of Object.values(b.creatures)) {
    if (!(c.metabolism?.uses > 0) || !c.focus || c.dead || c.hp <= 0) continue;
    if (c.focus.uses >= c.focus.max && c.hp >= c.hpMax) continue;
    c.metabolism.uses--;
    c.focus.uses = c.focus.max;
    const md = +String(c.martialDie || '1d6').split('d')[1] || 6;
    const r = die(b.rng, md);
    heal(b, c, c, r + c.level, 'Uncanny Metabolism', 'uncanny-metabolism', { label: `1d${md} (Martial Arts die)`, rolls: [r] }, [{ label: 'Monk level', value: c.level }]);
    emit(b, { kind: 'note', by: c.id, text: `Uncanny Metabolism: ${c.name} regains all ${c.focus.max} Focus Points (once per Long Rest).`, rule: 'uncanny-metabolism' });
    c.metabolized = true;
  }
  for (const c of Object.values(b.creatures)) {
    if (c.dead) continue;
    // Perfect Focus (Monk 15): back up to 4 Focus Points when Uncanny Metabolism wasn't used.
    if (c.perfectFocus && c.focus && !c.metabolized && c.focus.uses < 4) {
      const was = c.focus.uses;
      c.focus.uses = Math.min(c.focus.max, 4);
      emit(b, { kind: 'note', by: c.id, rule: 'perfect-focus', text: `Perfect Focus: ${c.name} goes from ${was} to ${c.focus.uses} Focus Points.` });
    }
    delete c.metabolized;
    // Superior Inspiration (Bard 18): back up to two Bardic Inspiration.
    if (c.superiorInspiration && c.bardic && c.bardic.uses < 2) {
      const was = c.bardic.uses;
      c.bardic.uses = Math.min(Math.max(2, c.bardic.max), 2);
      emit(b, { kind: 'note', by: c.id, rule: 'superior-inspiration', text: `Superior Inspiration: ${c.name} goes from ${was} to ${c.bardic.uses} Bardic Inspiration.` });
    }
    // Evergreen Wild Shape (Archdruid 20): with none left, one use of Wild Shape comes back.
    if (c.archdruid && c.wildShape && c.wildShape.uses < 1) {
      c.wildShape.uses = 1;
      emit(b, { kind: 'note', by: c.id, rule: 'archdruid', text: `Evergreen Wild Shape: ${c.name} regains a use of Wild Shape.` });
    }
    // Boon of Fate: ready again when Initiative is rolled.
    if (c.fate) c.fate.uses = c.fate.max;
    // Persistent Rage (Barbarian 15): once per Long Rest, all uses of Rage come back.
    if (c.persistent?.uses > 0 && c.rage && c.rage.uses < c.rage.max) {
      c.persistent.uses--;
      c.rage.uses = c.rage.max;
      emit(b, { kind: 'note', by: c.id, rule: 'persistent-rage', text: `Persistent Rage: ${c.name} regains every use of Rage (${c.rage.max}), once per Long Rest.` });
    }
  }
  b.idx = -1;
  nextTurn(b);
}

// Returns false if the creature loses this turn.
function startTurn(b, c) {
  expire(b, 'start', c.id);
  c.reaction = !incap(c);
  if (hasCond(c, 'slow')) c.reaction = false;
  if (c.legendary) { c.legendary.uses = c.legendary.max; c.legendary.spent = []; }
  b.turn = { who: c.id, action: 1, bonus: 1, moveLeft: speedOf(b, c), moves: 0, steps: 0, attacksLeft: 0, magicUsed: false, surged: false, attacked: [], rolled: false };
  if (effectOn(b, 'haste', c.id)) b.turn.hasteAct = 1;
  emit(b, { kind: 'turn', who: c.id, text: `${c.name}'s turn.`, rule: 'your-turn' });
  zoneTick(b, c, 'start');
  stenchTick(b, c);
  fearAuraTick(b, c);
  if (c.regen && !c.dead && !b.over) {
    if (c.regen.blocked) {
      c.regen.blocked = false;
      if (c.hp <= 0) {
        c.dead = true;
        emit(b, { kind: 'note', by: c.id, text: `${c.name} starts its turn at 0 Hit Points and can't regenerate (Fire or Acid): it dies.`, rule: 'regeneration' });
        checkOver(b);
        return false;
      }
      emit(b, { kind: 'note', by: c.id, text: `${c.name} took Fire or Acid damage: no Regeneration this turn.`, rule: 'regeneration' });
    } else if (c.hp < c.hpMax) {
      const was = c.hp;
      c.hp = Math.min(c.hpMax, c.hp + c.regen.hp);
      emit(b, { kind: 'heal', by: c.id, target: c.id, what: 'Regeneration', roll: { label: String(c.regen.hp), rolls: [] }, mods: [{ label: 'Stat block', value: c.regen.hp }], total: c.hp - was, before: was, after: c.hp, rule: 'regeneration',
        text: `Regeneration: ${c.name} regains ${c.hp - was} Hit Points (${c.hp}/${c.hpMax})${was <= 0 ? ' and gets back up' : ''}.` });
    }
  }
  if (c.mbreath && !c.mbreath.ready && c.hp > 0) {
    const r = die(b.rng, 6);
    c.mbreath.ready = r >= c.mbreath.recharge;
    emit(b, { kind: 'note', by: c.id, text: `${c.name} rolls a d6 to recharge ${c.mbreath.name}: ${r}${c.mbreath.ready ? ', ready again' : `, not yet (needs ${c.mbreath.recharge}${c.mbreath.recharge < 6 ? '-6' : ''})`}.`, rule: 'recharge' });
  }
  if (b.over || c.dead || (c.side === 'foe' && c.hp <= 0)) return false;
  // Aura of Life: an ally at 0 Hit Points starting a turn in it regains 1 Hit Point.
  if (c.side === 'hero' && c.hp === 0 && !c.dead) {
    const e = b.effects.find((z) => z.type === 'auralife' && C(b, z.by)?.side === c.side && !C(b, z.by).dead && (z.by === c.id || feetBetween(C(b, z.by), c) <= 30));
    if (e) heal(b, C(b, e.by), c, 1, 'Aura of Life', 'aura-of-life', { label: '1', rolls: [] }, []);
  }
  c.prowessUsed = false;
  // Holy Nimbus (Devotion 20): an enemy starting its turn in the shining aura takes Radiant damage.
  for (const P of Object.values(b.creatures)) {
    if (!P.nimbusOn || !hostile(P, c) || P.dead || P.hp <= 0 || incap(P) || !onBoard(P) || feetBetween(P, c) > (P.auraRange || 10) || c.hp <= 0) continue;
    const d = finishDamage(c, [{ label: 'Holy Nimbus (CHA modifier + Proficiency Bonus)', value: P.nimbus.dmg, rule: 'holy-nimbus', type: 'Radiant' }]);
    const af = applyDamage(b, c, d.total, { types: d.types, by: P.id });
    emit(b, { kind: 'note', by: P.id, target: c.id, rule: 'holy-nimbus', text: `Holy Nimbus: ${c.name} starts its turn in ${P.name}'s aura and takes ${d.total} Radiant damage${adjustText(d)}.${afterText(c, af)}` });
    flushPost(b);
    checkOver(b);
    if (b.over || c.dead || c.hp <= 0) return false;
  }
  // Heroic Rally (Champion 18): Bloodied with at least 1 Hit Point, regain 5 + CON at the start of the turn.
  if (c.survivor18 && c.hp > 0 && c.hp <= c.hpMax / 2) heal(b, c, c, 5 + c.mods.con, 'Heroic Rally', 'survivor', { label: '5', rolls: [] }, [{ label: 'CON modifier', value: c.mods.con }]);
  // Superior Defense (Monk 18): 3 Focus Points for Resistance to all but Force (here: used when a foe is within 30 feet and 6+ points are left).
  if (c.monkDefense && c.focus?.uses >= 6 && !effectOn(b, 'superdef', c.id) && !incap(c) && c.hp > 0 && enemiesOf(b, c).some((o) => !o.dead && o.hp > 0 && feetBetween(o, c) <= 30)) {
    c.focus.uses -= 3;
    b.effects.push({ type: 'superdef', by: c.id, target: c.id, expires: { when: 'never' } });
    emit(b, { kind: 'note', by: c.id, rule: 'superior-defense', text: `Superior Defense (3 Focus Points, ${c.focus.uses} left): ${c.name} has Resistance to every damage type but Force for 1 minute.` });
  }
  // Heroic Warrior (Fighter 10): start a turn without Heroic Inspiration, gain it.
  if (c.heroicWarrior && !c.inspiration && c.hp > 0) {
    c.inspiration = true;
    emit(b, { kind: 'note', by: c.id, text: `Heroic Warrior: ${c.name} gains Heroic Inspiration.`, rule: 'heroic-inspiration' });
  }
  const hero = effectOn(b, 'heroism', c.id);
  if (hero && c.hp > 0 && hero.amount > (c.tempHp || 0)) {
    c.tempHp = hero.amount;
    emit(b, { kind: 'note', by: hero.by, target: c.id, text: `Heroism: ${c.name} has ${hero.amount} Temporary Hit Points.`, rule: 'heroism' });
  }
  if (c.web && !c.web.ready && c.hp > 0) {
    const r = die(b.rng, 6);
    c.web.ready = r >= c.web.recharge;
    emit(b, { kind: 'note', by: c.id, text: `${c.name} rolls a d6 to recharge Web: ${r}${c.web.ready ? ', ready again' : ', not yet (needs 5 or 6)'}.`, rule: 'recharge' });
  }
  if (c.hp > 0 && hasCond(c, 'commanded')) {
    dropCond(c, 'commanded');
    addCond(b, c, { id: 'prone', by: null, why: 'Command' });
    emit(b, { kind: 'note', by: c.id, text: `${c.name} obeys the Command: it falls Prone and its turn ends.`, rule: 'command' });
    return false;
  }
  // Daze (Devious Strikes): this turn, it can move or act, not both, and has no Bonus Action.
  if (c.hp > 0 && hasCond(c, 'dazed') && !helpless(c)) {
    b.turn.bonus = 0;
    const act = enemiesOf(b, c).some((o) => !o.dead && onBoard(o) && cheb(o, c) <= 1) || (c.attacks || []).some((a) => a.kind === 'ranged') || !!c.casting;
    if (act) b.turn.moveLeft = 0; else b.turn.action = 0;
    emit(b, { kind: 'note', by: c.id, rule: 'devious-strikes', text: `${c.name} is Dazed: this turn it ${act ? 'acts but can\'t move' : 'can move but takes no action'}, and has no Bonus Action.` });
  }
  if (c.hp > 0 && helpless(c)) {
    const asleep = hasCond(c, 'unconscious');
    emit(b, { kind: 'note', by: c.id, text: `${c.name} is ${asleep ? 'Unconscious' : 'Paralyzed'} and can't move or act this turn.`, rule: asleep ? 'unconscious' : 'paralyzed' });
    return false;
  }
  return true;
}

// End of a creature's turn: repeat saves against conditions, then effects
// that end, then enemies get a look at anyone Hidden from them.
function endTurn(b, who) {
  const c = C(b, who);
  if (c && !c.dead) zoneTick(b, c, 'end');
  // Fire Aura (Balor): each creature within 5 feet takes damage at the end of its turns.
  if (c && c.aura && !c.dead && c.hp > 0 && !b.over) {
    for (const X of Object.values(b.creatures).filter((o) => o !== c && !o.dead && onBoard(o) && cheb(o, c) <= 1)) {
      const { n, sides } = parseDice(c.aura.dice);
      const rs = rollDice(b.rng, n, sides);
      const d = finishDamage(X, [{ label: `${c.aura.name} ${c.aura.dice}`, rolls: rs, value: sum(rs), rule: 'stat-block', type: c.aura.type }]);
      const af = applyDamage(b, X, d.total, { types: d.types, by: c.id });
      emit(b, { kind: 'note', by: c.id, target: X.id, rule: 'stat-block', text: `${c.aura.name}: ${X.name} is within 5 feet of ${c.name} and takes ${c.aura.dice} (${rs.join(' + ')}) = ${d.total} ${c.aura.type} damage${adjustText(d)}.${afterText(X, af)}` });
    }
    flushPost(b);
    checkOver(b);
  }
  if (c && !c.dead && !b.over) {
    for (const x of [...(c.conds || [])]) {
      if (!x.saveEnds) continue;
      // Weird: 5d10 Psychic damage before each repeated save.
      if (x.weird && c.hp > 0) {
        const { n, sides } = parseDice(x.weird);
        const rs = rollDice(b.rng, n, sides);
        const d = finishDamage(c, [{ label: `Weird ${x.weird}`, rolls: rs, value: sum(rs), rule: 'weird', type: 'Psychic' }]);
        const af = applyDamage(b, c, d.total, { types: d.types, by: x.by });
        emit(b, { kind: 'note', by: x.by, target: c.id, rule: 'weird', text: `Weird: ${c.name}'s terrors deal ${x.weird} (${rs.join(' + ')}) = ${d.total} Psychic damage${adjustText(d)}.${afterText(c, af)}` });
        flushPost(b);
        checkOver(b);
        if (b.over || c.dead || c.hp <= 0) break;
      }
      // Fear: the save comes only at the end of a turn out of the caster's sight.
      const src = x.saveEnds.unseen ? C(b, x.saveEnds.unseen) : null;
      if (src && !src.dead && onBoard(src) && lineOfSight(b, c, src)) continue;
      const sv = savingThrow(b, c, x.saveEnds.ability, x.saveEnds.dc, { cond: x.id });
      const name = COND_NAMES[x.id];
      emit(b, { kind: 'save', save: 'condition', by: c.id, ...sv, dc: x.saveEnds.dc, outcome: sv.success ? 'success' : 'fail', rule: x.rule || x.id,
        text: `${c.name} repeats the ${ABILITY_NAMES[x.saveEnds.ability]} save against being ${name}: ${sv.total} vs DC ${x.saveEnds.dc}, ${sv.success ? `no longer ${name}` : `still ${name}`}.` });
      if (sv.success) c.conds = c.conds.filter((y) => y !== x);
    }
    // Sleep: at the end of its next turn, a second save or it falls Unconscious.
    for (const x of [...(c.conds || [])]) {
      if (!x.sleep) continue;
      const sv = savingThrow(b, c, 'wis', x.sleep.dc);
      c.conds = c.conds.filter((y) => y !== x);
      if (!sv.success) {
        c.conds.push({ id: 'unconscious', by: x.by, conc: x.conc, endsOnDamage: true, rule: 'sleep' });
        if (!hasCond(c, 'prone')) c.conds.push({ id: 'prone', by: x.by, why: 'fell asleep' });
      }
      emit(b, { kind: 'save', save: 'condition', by: c.id, ...sv, dc: x.sleep.dc, outcome: sv.success ? 'success' : 'fail', rule: 'sleep',
        text: `${c.name} repeats the Wisdom save against Sleep: ${sv.total} vs DC ${x.sleep.dc}, ${sv.success ? 'shakes it off' : 'falls Unconscious (and Prone) until it takes damage or the spell ends'}.` });
    }
    // Self-Restoration (Monk 10): end Charmed, Frightened or Poisoned on yourself.
    if (c.selfRestore && c.hp > 0) {
      const x = (c.conds || []).find((y) => ['charmed', 'frightened', 'poisoned'].includes(y.id) && !y.pattern);
      if (x) {
        c.conds = c.conds.filter((y) => y !== x);
        emit(b, { kind: 'note', by: c.id, text: `Self-Restoration: ${c.name} is no longer ${COND_NAMES[x.id]}.`, rule: 'self-restoration' });
      }
    }
    // Rage goes on only if it started this turn or was kept going.
    if (c.raging) {
      if (c.raging.since === turnKey(b) || c.raging.kept || c.persistent) { c.raging.kept = false; c.raging.since = null; }
      else endRage(b, c, `${c.name} didn't attack, force a save or use a Bonus Action to keep it going`);
    }
  }
  expire(b, 'end', who);
  if (c && !incap(c)) {
    for (const H of enemiesOf(b, c)) {
      const hid = condOf(H, 'hidden');
      if (!hid || !lineOfSight(b, c, H)) continue;
      const pp = 10 + (c.skills?.perception ?? c.mods.wis);
      if (pp >= hid.stealth) {
        dropCond(H, 'hidden');
        emit(b, { kind: 'note', by: c.id, target: H.id, text: `${c.name} spots ${H.name} (Passive Perception ${pp} vs Stealth ${hid.stealth}).`, rule: 'hide' });
      }
    }
  }
}

function deathSave(b, c) {
  // Defy Death (Champion 18): Advantage, and 18 to 20 counts as a 20.
  const d20 = rollD20(b, c, effectOn(b, 'beacon', c.id) || c.survivor18 ? 'advantage' : 'normal');
  const v = c.survivor18 && d20.kept >= 18 ? 20 : d20.kept;
  let outcome, text;
  if (v === 20) {
    c.hp = 1; c.deathSaves = { s: 0, f: 0 };
    outcome = 'revive'; text = `${c.name} rolls a ${d20.kept === 20 ? '20' : `${d20.kept} (Defy Death: 18 or more counts as a 20)`} on a death save, regains 1 HP and is conscious again.`;
  } else if (v === 1) {
    c.deathSaves.f += 2; outcome = 'fail2'; text = `${c.name} rolls a 1 on a death save: two failures.`;
  } else if (v >= 10) {
    c.deathSaves.s += 1; outcome = 'success'; text = `${c.name} succeeds on a death save.`;
  } else {
    c.deathSaves.f += 1; outcome = 'fail'; text = `${c.name} fails a death save.`;
  }
  if (c.deathSaves.f >= 3) { c.dead = true; c.diedRound = b.round; text += ` That's three failures: ${c.name} dies.`; }
  else if (c.deathSaves.s >= 3) { c.stable = true; c.deathSaves = { s: 0, f: 0 }; text += ` Three successes: ${c.name} is Stable.`; }
  emit(b, { kind: 'save', save: 'death', by: c.id, d20, dc: 10, outcome, tally: { ...c.deathSaves }, text, rule: 'death-saves' });
  checkOver(b);
}

// Dreadful Glare (Mummy Lord): a save against psychic damage and Paralysis.
function glareAt(b, A, T) {
  const g = A.glare;
  return areaSave(b, A, [T], { name: g.name, ability: g.ability, dcParts: [{ label: 'Stat block', value: g.dc, rule: 'stat-block' }], dice: g.dice, flat: g.flat, flatLabel: 'Stat block', flatRule: 'stat-block',
    type: g.type, half: false, rule: 'paralyzed', rider: 'glare' });
}
export const glareTargets = (b, A) => enemiesOf(b, A).filter((T) => !T.dead && T.hp > 0 && onBoard(T) && feetBetween(A, T) <= A.glare.range && lineOfSight(b, A, T));

// Legendary Actions: right after another creature's turn, a legendary
// creature takes one, if it has any left. The engine picks it, like the
// stat-block reactions: a once-a-round power when it has a good target, else
// an attack on whoever is in reach, else Pounce over to someone.
function legendaryAfter(b, who) {
  for (const L of living(b, 'foe')) {
    if (b.over || b.pending) return;
    const lg = L.legendary;
    if (!lg || lg.uses < 1 || L.id === who || L.hp <= 0 || incap(L) || !onBoard(L)) continue;
    const foes = enemiesOf(b, L).filter((T) => !T.dead && T.hp > 0 && onBoard(T));
    if (!foes.length) continue;
    const pickWeak = (xs) => [...xs].sort((p, q) => (q.concentration ? 1 : 0) - (p.concentration ? 1 : 0) || p.hp - q.hp)[0];
    let done = null;
    for (const o of lg.options) {
      if (done) break;
      if (o.once && lg.spent.includes(o.id)) continue;
      if (o.kind === 'glare' && L.glare) {
        const ts = glareTargets(b, L).filter((T) => !hasCond(T, 'paralyzed'));
        if (!ts.length) continue;
        const T = [...ts].sort((p, q) => (p.saves?.wis ?? p.mods.wis) - (q.saves?.wis ?? q.mods.wis))[0];
        emit(b, { kind: 'note', by: L.id, rule: 'legendary-actions', text: `${L.name} takes a Legendary Action: ${o.name} (${lg.uses - 1} left).` });
        glareAt(b, L, T);
        done = o;
      } else if (o.kind === 'emanation') {
        // Disrupt Life (Lich): each creature that isn't Undead, close by.
        const ts = Object.values(b.creatures).filter((T) => T !== L && !T.dead && T.hp > 0 && onBoard(T) && T.creature !== 'undead' && feetBetween(L, T) <= o.size);
        if (!ts.some((T) => hostile(L, T)) || ts.some((T) => !hostile(L, T))) continue;
        emit(b, { kind: 'note', by: L.id, rule: 'legendary-actions', text: `${L.name} takes a Legendary Action: ${o.name} (${lg.uses - 1} left).` });
        areaSave(b, L, ts, { name: o.name, ability: o.ability, dcParts: [{ label: 'Stat block', value: o.dc, rule: 'stat-block' }], dice: o.dice, type: o.type, half: true, rule: 'legendary-actions', ignoreCover: true });
        done = o;
      } else if (o.kind === 'deathly') {
        // Deathly Teleport (Lich): away from whoever is next to it, with a burst where it stood.
        if (!foes.some((T) => cheb(L, T) <= 1)) continue;
        let best = null;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!canEndAt(b, L, x, y) || cheb(L, { x, y }) * FT > o.range || !lineOfSight(b, L, { x, y })) continue;
          const near = Math.min(...foes.map((T) => cheb(T, { x, y })));
          if (near <= 1) continue;
          const sc = near * 10 - cheb(L, { x, y });
          if (!best || sc > best.sc) best = { x, y, sc };
        }
        if (!best) continue;
        const from = { x: L.x, y: L.y };
        const hit = Object.values(b.creatures).filter((T) => T !== L && !T.dead && onBoard(T) && cheb(T, from) * FT <= o.burst);
        L.x = best.x; L.y = best.y;
        emit(b, { kind: 'move', by: L.id, path: [{ x: L.x, y: L.y }], feet: 0, left: 0, teleport: true, from, rule: 'legendary-actions',
          text: `${L.name} takes a Legendary Action: ${o.name} (${lg.uses - 1} left), teleporting ${cheb(from, L) * FT} feet.` });
        for (const T of hit) {
          const { n, sides } = parseDice(o.dice);
          const rs = rollDice(b.rng, n, sides);
          const d = finishDamage(T, [{ label: `${o.name} ${o.dice}`, rolls: rs, value: sum(rs), rule: 'legendary-actions', type: o.type }]);
          const af = applyDamage(b, T, d.total, { types: d.types, by: L.id });
          emit(b, { kind: 'note', by: L.id, target: T.id, rule: 'legendary-actions', text: `${T.name} was within ${o.burst} feet of where ${L.name} stood: ${o.dice} (${rs.join(' + ')}) = ${d.total} ${o.type} damage${adjustText(d)}.${afterText(T, af)}` });
        }
        flushPost(b);
        tidy(b);
        checkOver(b);
        done = o;
      } else if (o.kind === 'save') {
        const ts = foes.filter((T) => feetBetween(L, T) <= o.range && lineOfSight(b, L, T));
        if (!ts.length) continue;
        const T = pickWeak(ts);
        emit(b, { kind: 'note', by: L.id, rule: 'legendary-actions', text: `${L.name} takes a Legendary Action: ${o.name} (${lg.uses - 1} left).` });
        areaSave(b, L, [T], { name: o.name, ability: o.ability, dcParts: [{ label: 'Stat block', value: o.dc, rule: 'stat-block' }], dice: o.dice, type: o.type, half: false, rule: 'legendary-actions' });
        done = o;
      } else if (o.kind === 'strike') {
        const reachable = (at) => foes.map((T) => ({ T, atk: L.attacks.filter((a) => a.kind === 'melee' && !a.solo && cheb(at, T) * FT <= (a.reach || 5))[0] })).filter((x) => x.atk);
        let opts = reachable(L);
        if (!opts.length && !o.move) {
          opts = foes.filter((T) => lineOfSight(b, L, T)).map((T) => ({ T, atk: L.attacks.find((a) => a.kind === 'ranged' && !a.solo && feetBetween(L, T) <= (a.range?.[0] || 0)) })).filter((x) => x.atk);
        }
        let moved = null;
        if (!opts.length && o.move) {
          // Pounce: up to half its Speed, along a path that provokes no Opportunity Attack.
          const map = reachMap(b, L, Math.floor(speedOf(b, L) / 2 / FT) * FT);
          let best = null;
          for (const [k, d] of map.dist) {
            const [x, y] = k.split(',').map(Number);
            if (!d || !canEndAt(b, L, x, y)) continue;
            const r = reachable({ x, y });
            if (!r.length) continue;
            const path = pathFrom(map, L, x, y);
            let from = { x: L.x, y: L.y }, safe = true;
            for (const to of path) { if (provokers(b, L, from, to).length) { safe = false; break; } from = to; }
            if (!safe) continue;
            const T = pickWeak(r.map((z) => z.T));
            if (!best || T.hp < best.T.hp || (T === best.T && d < best.d)) best = { x, y, d, T, path };
          }
          if (!best) continue;
          moved = { path: best.path, feet: best.d };
          L.x = best.x; L.y = best.y;
          opts = reachable(L);
        }
        if (!opts.length) continue;
        const T = pickWeak(opts.map((z) => z.T));
        const atk = opts.find((z) => z.T === T).atk;
        emit(b, { kind: moved ? 'move' : 'note', by: L.id, rule: 'legendary-actions', ...(moved ? { path: moved.path, feet: moved.feet, left: 0 } : {}),
          text: `${L.name} takes a Legendary Action: ${o.name} (${lg.uses - 1} left)${moved ? `, moving ${moved.feet} feet` : ''}.` });
        attack(b, L, T, atk, { reaction: true, why: o.name });
        done = o;
      }
    }
    if (done) {
      lg.uses--;
      if (done.once) lg.spent.push(done.id);
      flushPost(b);
      checkOver(b);
    }
  }
}

// `resumed`: carrying on after a hero answered a prompt (Shield, Hellish
// Rebuke) that a Legendary Action's attack raised between two turns.
function nextTurn(b, resumed = false) {
  for (let guard = 0; guard < 80 && !b.over; guard++) {
    if (b.turn) {
      const was = b.turn.who;
      if (!resumed) { endTurn(b, was); if (!b.over) legendaryAfter(b, was); }
      resumed = false;
      if (b.pending) { b.pending.thenNext = true; return; }
    }
    if (b.over) return;
    b.idx = (b.idx + 1) % b.order.length;
    if (b.idx === 0) {
      if (b.begun) b.round++;
      b.begun = true;
      // Thief's Reflexes: the second turn is for the first round only.
      if (b.round > 1 && b.extraTurns) { b.order = b.order.filter((_, i) => !b.extraTurns.includes(i)); b.extraTurns = null; }
    }
    const c = current(b);
    b.turn = null;
    if (c.dead || !onBoard(c)) continue;
    const acts = startTurn(b, c);
    if (!acts) continue;
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
    for (const c of Object.values(b.creatures)) {
      if (c.conc) c.conc = null;
      if (c.shape) revertShape(b, c, null, true);
      c.raging = null; c.innateOn = false; c.sacredOn = false; c.nimbusOn = false;
    }
    emit(b, {
      kind: 'end', outcome: b.over, rule: 'combat',
      text: b.over === 'victory' ? 'Victory! Every foe is defeated.' : 'Defeat. Every hero is down.',
    });
  }
}

// ----------------------------------------------------------- movement ----

// Hostile creatures whose reach the mover leaves by stepping from -> to.
// used: feet already walked on this path (Tactical Shift covers the first few).
export function provokers(b, M, from, to, used = 0) {
  if (b.effects.some((e) => e.type === 'disengage' && e.by === M.id)) return [];
  if (b.turn?.who === M.id && (b.turn.shift || 0) - used > 0) return [];
  return enemiesOf(b, M).filter((h) => !incap(h) && h.reaction
    && !b.effects.some((e) => (e.type === 'shocked' || e.type === 'addled' || e.type === 'staggerblow') && e.target === h.id)

    && h.attacks.some((a) => a.kind === 'melee')
    && lineOfSight(b, h, from)
    && feetBetween(h, from) <= reachOf(h) && feetBetween(h, to) > reachOf(h));
}

// Frightened: can't willingly move closer to the source of its fear.
function fearBlocks(b, M, path) {
  for (const x of M.conds || []) {
    if (x.id !== 'frightened') continue;
    const src = C(b, x.by);
    if (!src || src.dead) continue;
    const d0 = cheb(M, src);
    if (path.some((p) => cheb(p, src) < d0)) return src;
  }
  return null;
}

// Path preview for the UI: route, cost and who would get an Opportunity Attack.
export function previewMove(b, id, x, y) {
  const M = C(b, id);
  if (!b.turn || b.turn.who !== id) return null;
  if (!canEndAt(b, M, x, y)) return null;
  let budget = b.turn.moveLeft;
  const stand = hasCond(M, 'prone') ? standCost(b, M) : 0;
  if (stand) budget -= stand;
  if (budget < FT) return null;
  const map = reachMap(b, M, budget);
  const path = pathFrom(map, M, x, y);
  if (!path) return null;
  if (fearBlocks(b, M, path)) return null;
  const oas = [];
  let from = { x: M.x, y: M.y };
  let used = 0;
  for (const to of path) {
    for (const h of provokers(b, M, from, to, used)) if (!oas.includes(h.id)) oas.push(h.id);
    from = to;
    used += FT;
  }
  return { path, feet: map.dist.get(key(x, y)), oas, stand };
}

const standCost = (b, M) => Math.floor(Math.max(0, M.speed - 5 * (M.exhaustion || 0)) / 2);

export function reachableSquares(b, id) {
  const M = C(b, id);
  if (!b.turn || b.turn.who !== id) return [];
  let budget = b.turn.moveLeft;
  if (hasCond(M, 'prone')) budget -= standCost(b, M);
  if (budget < FT) return [];
  const map = reachMap(b, M, budget);
  const out = [];
  for (const [k, d] of map.dist) {
    const [x, y] = k.split(',').map(Number);
    if (d > 0 && canEndAt(b, M, x, y)) out.push({ x, y, feet: d });
  }
  return out.filter((s) => previewMove(b, id, s.x, s.y));
}

function standUp(b, M) {
  const cost = standCost(b, M);
  if (b.turn.moveLeft < cost || cost === 0) return `Standing up costs half your Speed (${cost} ft).`;
  b.turn.moveLeft -= cost;
  dropCond(M, 'prone');
  emit(b, { kind: 'action', by: M.id, what: 'Stand up', text: `${M.name} stands up, using half their Speed (${cost} ft; ${b.turn.moveLeft} ft left).`, rule: 'prone' });
  return null;
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
    const cost = occ || spellTerrain(b, M, to.x, to.y) ? 2 * FT : FT;
    const proneBefore = hasCond(M, 'prone');
    M.x = to.x; M.y = to.y;
    b.turn.moveLeft -= cost;
    if (b.turn.shift) b.turn.shift = Math.max(0, b.turn.shift - cost);
    ctx.walked.push({ x: to.x, y: to.y });
    ctx.feet += cost;
    ctx.i++;
    if (b.effects.some((e) => e.type === 'zone')) {
      zoneStep(b, M, from, to, () => flushMove(b));
      // A zone can stop the walk: knocked Prone, dropped, or the fight is over.
      if (b.over || M.dead || M.hp <= 0 || incap(M) || (!proneBefore && hasCond(M, 'prone'))) { ctx.i = ctx.path.length; break; }
    }
  }
  flushMove(b);
  b.moveCtx = null;
  tidy(b);
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

// The reactor's answer to a pending prompt: an Opportunity Attack, Shield,
// Divine Smite (opts.slot picks a higher slot) or Hellish Rebuke.
export function resolveReaction(b, accept, opts = {}) {
  CUR = b;
  const p = b.pending;
  if (!p) return [];
  const before = b.seq;
  b.pending = null;
  const R = C(b, p.reactor);
  if (p.kind === 'counter') {
    const X = C(b, p.caster);
    const lv = slotFor(b, R, 'counterspell');
    let stopped = false;
    if (accept && lv && R.reaction && !incap(R) && X && !X.dead && onBoard(X)) {
      R.reaction = false;
      R.casting.slots[lv].left--;
      R.slotKey = turnKey(b);
      emit(b, { kind: 'cast', by: R.id, spell: 'counterspell', level: 3, slot: lv, pay: 'slot', reaction: true, rule: 'counterspell', targets: [X.id],
        text: `${R.name} casts Counterspell as a Reaction (level ${lv} spell slot; ${R.casting.slots[lv].left} left).` });
      const dcParts = spellDCParts(R, 'counterspell');
      const dc = sumParts(dcParts);
      const sv = savingThrow(b, X, 'con', dc);
      stopped = !sv.success;
      const sp = SPELLS[p.spell];
      emit(b, { kind: 'save-spell', by: R.id, what: 'Counterspell', ability: 'con', dc, dcParts, damage: null, half: false, rule: 'counterspell',
        results: [{ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'} (${sv.total})${sv.success ? `: ${sp.name} goes off anyway` : `: ${sp.name} fails, and its ${sp.time === 'bonus' ? 'Bonus Action' : 'action'} is wasted (no slot spent)`}.` }],
        text: `${R.name} tries to unravel ${X.name}'s ${sp.name}: DC ${dc} Constitution save.` });
      if (stopped && b.turn?.who === X.id) {
        if (sp.time === 'bonus') b.turn.bonus = 0;
        else { b.turn.action = Math.max(0, b.turn.action - 1); b.turn.magicUsed = true; }
      }
    } else emit(b, { kind: 'note', by: R.id, text: `${R.name} doesn't cast Counterspell.`, rule: 'counterspell' });
    if (!stopped && X && !X.dead && b.turn?.who === X.id) castSpell(b, X, p.intent);
  } else if (p.kind === 'smite') {
    const T = C(b, p.target);
    const pay = smitePay(b, R, opts.slot | 0);
    if (accept && pay && T && !T.dead && T.hp > 0) divineSmite(b, R, T, pay, p.crit);
    else emit(b, { kind: 'note', by: R.id, text: `${R.name} doesn't smite.`, rule: 'divine-smite' });
  } else if (p.kind === 'rebuke') {
    const X = C(b, p.attacker);
    const lv = slotFor(b, R, 'hellish-rebuke');
    if (accept && lv && R.reaction && !incap(R) && X && !X.dead && onBoard(X) && feetBetween(R, X) <= 60 && lineOfSight(b, R, X)) {
      R.reaction = false;
      R.casting.slots[lv].left--;
      R.slotKey = turnKey(b);
      const s = SPELLS['hellish-rebuke'];
      emit(b, { kind: 'cast', by: R.id, spell: 'hellish-rebuke', level: 1, slot: lv, pay: 'slot', reaction: true, rule: 'hellish-rebuke',
        text: `${R.name} casts Hellish Rebuke as a Reaction (level ${lv} spell slot; ${R.casting.slots[lv].left} left).` });
      areaSave(b, R, [X], { name: s.name, ability: 'dex', dcParts: spellDCParts(R, 'hellish-rebuke'), dice: scaled('hellish-rebuke', lv).dice, type: s.type, half: true, rule: 'hellish-rebuke' });
    } else emit(b, { kind: 'note', by: R.id, text: `${R.name} doesn't cast Hellish Rebuke.`, rule: 'hellish-rebuke' });
  } else if (p.kind === 'shield') {
    const lv = slotFor(b, R, 'shield');
    if (accept && lv && R.reaction && !incap(R)) {
      R.reaction = false;
      R.casting.slots[lv].left--;
      R.slotKey = turnKey(b);
      b.effects.push({ type: 'shield', by: R.id, target: R.id, expires: { when: 'start', who: R.id } });
      emit(b, { kind: 'cast', by: R.id, spell: 'shield', level: 1, slot: lv, pay: 'slot', reaction: true, rule: 'shield',
        text: `${R.name} casts Shield as a Reaction (level ${lv} slot; ${R.casting.slots[lv].left} left): +5 AC until the start of their next turn.` });
    } else {
      emit(b, { kind: 'note', by: R.id, text: `${R.name} doesn't cast Shield.`, rule: 'shield' });
    }
    finishAttack(b, p.ctx);
  } else {
    const M = C(b, p.mover);
    if (accept && !incap(R) && R.reaction) {
      const atk = bestMelee(b, R, M);
      R.reaction = false;
      attack(b, R, M, atk, { reaction: true, oa: true });
    } else if (b.moveCtx) {
      b.moveCtx.skip.push(R.id);
      emit(b, { kind: 'note', by: R.id, text: `${R.name} lets ${M.name} go.`, rule: 'opportunity-attack' });
    }
  }
  if (b.moveCtx && !b.over && !b.pending) {
    const M = C(b, b.moveCtx.who);
    if (incap(M) || speedOf(b, M) === 0) { flushMove(b); b.moveCtx = null; }
    else continueMove(b);
  }
  if (p.thenNext && !b.over) {
    if (b.pending) b.pending.thenNext = true;
    else { flushPost(b); checkOver(b); if (!b.over) nextTurn(b, true); }
  }
  return b.log.filter((r) => r.seq > before);
}

// Divine Smite: 2d8 Radiant, +1d8 per slot level above 1, +1d8 against a Fiend
// or an Undead; the dice double on a Critical Hit.
function divineSmite(b, A, T, pay, crit) {
  const s = SPELLS['divine-smite'];
  b.turn.bonus = 0;
  const k = A.casting.known['divine-smite'];
  let paid;
  if (pay.pay === 'free') { k.free--; paid = `free cast: ${k.freeWhy}`; }
  else { A.casting.slots[pay.slot].left--; A.slotKey = turnKey(b); paid = `level ${pay.slot} spell slot; ${A.casting.slots[pay.slot].left} left`; }
  b.turn.leveled = true;
  emit(b, { kind: 'cast', by: A.id, spell: 'divine-smite', level: 1, slot: pay.slot, pay: pay.pay, rule: 'divine-smite', targets: [T.id],
    text: `${A.name} casts Divine Smite as a Bonus Action (${paid}).` });
  if (A.smiteProtection) {
    b.effects = b.effects.filter((e) => !(e.type === 'smiteprot' && e.by === A.id));
    b.effects.push({ type: 'smiteprot', by: A.id, expires: { when: 'start', who: A.id } });
    emit(b, { kind: 'note', by: A.id, rule: 'smite-of-protection', text: `Smite of Protection: ${A.name} and allies within 10 feet have Half Cover until the start of ${A.name}'s next turn.` });
  }
  let n = 2 + (pay.slot - 1) + (['fiend', 'undead'].includes(T.creature) ? 1 : 0);
  const why = [];
  if (pay.slot > 1) why.push(`+${pay.slot - 1}d8 for the level ${pay.slot} slot`);
  if (['fiend', 'undead'].includes(T.creature)) why.push(`+1d8 against a${T.creature === 'undead' ? 'n Undead' : ' Fiend'}`);
  if (crit) { n *= 2; why.push('dice doubled: Critical Hit'); }
  const rolls = rollDice(b.rng, n, 8);
  const dmg = finishDamage(T, [{ label: `Divine Smite ${n}d8`, rolls, value: sum(rolls), rule: 'divine-smite', type: s.type }]);
  const after = applyDamage(b, T, dmg.total, { crit, types: dmg.types, by: A.id });
  emit(b, { kind: 'note', by: A.id, target: T.id, rule: 'divine-smite', damage: dmg, after,
    text: `Divine Smite: ${n}d8 (${rolls.join(' + ')})${why.length ? ` (${why.join('; ')})` : ''} = ${dmg.total} Radiant damage to ${T.name}${adjustText(dmg)}.${afterText(T, after)}` });
  flushPost(b);
  checkOver(b);
}

export function bestMelee(b, A, T) {

  const opts = attackOptions(b, A, T).filter((o) => o.atk.kind === 'melee' && o.ok);
  opts.sort((p, q) => q.expected - p.expected);
  return (opts[0] || attackOptions(b, A, T).filter((o) => o.atk.kind === 'melee')[0]).atk;
}

// The Attack action: one attack, or several with Multiattack. Returns an
// error string, or null after using up one attack.
// Can A make the Light property's extra attack with atk now? { error } or { atk, nick }.
export function offhandFor(b, A, atk) {
  const t = b.turn;
  if (!t || t.who !== A.id) return { error: "It isn't your turn." };
  if (!atk?.light) return { error: 'The extra attack needs a Light weapon.' };
  if (!t.light) return { error: 'First attack with a Light weapon as part of the Attack action.' };
  if (t.light === atk.base && !(A.twins || []).includes(atk.base)) return { error: 'The extra attack has to use a different Light weapon.' };
  if (t.offhandUsed) return { error: 'You have already made the extra Light-weapon attack this turn.' };
  const first = A.attacks.find((a) => a.base === t.light);
  const nick = atk.mastery === 'nick' || first?.mastery === 'nick';
  if (!nick && !t.bonus) return { error: 'The extra attack takes your Bonus Action, which you have used.' };
  const keep = A.twf || atk.abilityMod < 0;
  return {
    nick,
    atk: { ...atk, offhand: true, name: `${atk.name} (extra Light attack${nick ? ', Nick' : ''})`,
      dmgFlat: keep ? atk.dmgFlat.map((f) => (f.rule === 'damage' && A.twf ? { ...f, label: `${f.label} (Two-Weapon Fighting)`, rule: 'two-weapon-fighting' } : f)) : atk.dmgFlat.filter((f) => f.rule !== 'damage') },
  };
}

function useAttack(t, A, atk = null) {
  if (t.attacksLeft > 0) { t.attacksLeft--; return null; }
  if (!t.action) return 'You have already used your action.';
  t.action--;
  t.attackAction = true;
  // Thirsting Blade: the Extra Attack is for the pact weapon only. Slow and
  // Haste's extra action: one attack only.
  t.attacksLeft = atk?.solo || (A.extraAttackPact && atk?.base !== 'pact') || t.hasteOnly || hasCond(A, 'slow') ? 0 : (A.multiattack || 1) - 1;
  return null;
}
export const canAttack = (t) => !!t && (t.action > 0 || t.attacksLeft > 0);

// The Hide action needs every enemy unable to see you. Who can?
export function seenBy(b, A) {
  return enemiesOf(b, A).filter((e) => !incap(e) && lineOfSight(b, e, A));
}

// Land's Aid grows: 2d6, 3d6 at Druid 10, 4d6 at 14.
export const landsAidDice = (A) => (A.level >= 14 ? 4 : A.level >= 10 ? 3 : 2);

// What Channel Divinity / Preserve Life could heal, for the UI and the AI.
export function preservePlan(b, A) {
  let budget = 5 * A.level;
  const out = [];
  const pool = [A, ...alliesOf(b, A)].filter((c) => !c.dead && c.hp <= c.hpMax / 2 && feetBetween(A, c) <= 30)
    .sort((p, q) => p.hp / p.hpMax - q.hp / q.hpMax);
  for (const c of pool) {
    const room = Math.floor(c.hpMax / 2) - c.hp;
    const give = Math.min(room, budget);
    if (give > 0) { out.push({ id: c.id, amount: give }); budget -= give; }
  }
  return out;
}

// -------------------------------------------------------------- intents ----

const fail = (error) => ({ ok: false, error });

// What Haste's extra action can be (and the moves around it).
const HASTE_OK = ['attack', 'dash', 'disengage', 'hide', 'move', 'stand', 'end', 'haste'];
export function perform(b, id, intent) {
  CUR = b;
  const t = b.turn;
  const A = t && C(b, t.who);
  // Haste's action can't be used for anything else: hide it from other intents.
  const hold = !!(t?.hasteOnly && t.action > 0 && !HASTE_OK.includes(intent.a));
  if (hold) t.action = 0;
  const a0 = t?.action, b0 = t?.bonus;
  const r = performStep(b, id, intent);
  if (hold && b.turn === t) {
    t.action = Math.max(t.action, 1);
    if (!r.ok && /action/.test(r.error || '') && !/Bonus Action/.test(r.error || '')) return fail("Haste's extra action can only be one weapon attack, Dash, Disengage or Hide.");
  }
  // Slow: an action or a Bonus Action on its turn, not both.
  if (r.ok && A && b.turn === t && (hasCond(A, 'slow') || A.conds?.some((x) => x.abjured))) {
    if (t.action < a0) t.bonus = 0;
    else if (t.bonus < b0) { t.action = 0; t.attacksLeft = 0; }
  }
  return r;
}

function performStep(b, id, intent) {
  if (b.over) return fail('The fight is over.');
  if (b.pending) return fail('Waiting for a reaction.');
  const A = current(b);
  if (!A || A.id !== id) return fail("It isn't your turn.");
  const t = b.turn;
  const before = b.seq;
  const T = intent.target ? C(b, intent.target) : null;
  const acting = intent.a !== 'end' && intent.a !== 'move';
  if (acting && incap(A) && intent.a !== 'end') return fail(`${A.name} is Incapacitated and can't act.`);
  const needAction = () => (!t.action ? 'You have already used your action.' : null);
  const needBonus = () => (!t.bonus ? 'You have already used your Bonus Action.' : null);
  const magic = () => (t.magicUsed ? "Action Surge's extra action can't be a Magic action." : needAction());
  let err = null;
  switch (intent.a) {
    case 'move': {
      if (hasCond(A, 'commanded')) return fail('Commanded.');
      if (speedOf(b, A) === 0) return fail(`${A.name}'s Speed is 0 right now.`);
      const pv = previewMove(b, id, intent.x, intent.y);
      if (!pv) return fail("You can't move there.");
      if (pv.stand) { err = standUp(b, A); if (err) return fail(err); }
      t.moves++;
      b.moveCtx = { who: id, path: pv.path, i: 0, skip: [], walked: [], feet: 0 };
      continueMove(b);
      break;
    }
    case 'stand': {
      if (!hasCond(A, 'prone')) return fail("You aren't Prone.");
      if (speedOf(b, A) === 0) return fail("You can't stand up while your Speed is 0.");
      err = standUp(b, A);
      if (err) return fail(err);
      break;
    }
    case 'attack': {
      if (!canAttack(t) && !intent.offhand) return fail('You have already used your action.');
      if (!T || !hostile(A, T)) return fail('Pick an enemy to attack.');
      const atk = A.attacks.find((a) => a.id === intent.attack);
      if (!atk) return fail('Unknown attack.');
      const can = canTarget(b, A, T, atk);
      if (!can.ok) return fail(can.why);
      if (intent.offhand) {
        // Light property: one extra attack with a different Light weapon after
        // attacking with a Light weapon in the Attack action. Nick makes it part
        // of the action instead of a Bonus Action.
        const off = offhandFor(b, A, atk);
        if (off.error) return fail(off.error);
        if (!off.nick) t.bonus = 0;
        t.offhandUsed = true;
        if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
        attack(b, A, T, off.atk);
        break;
      }
      if (!t.action && !t.attacksLeft) return fail('You have already used your action.');
      if (t.hasteOnly && !t.attacksLeft && (atk.unarmed || atk.spell)) return fail("Haste's extra action allows one weapon attack, not an Unarmed Strike.");
      if (t.attacksLeft > 0 && A.extraAttackPact && atk.base !== 'pact') return fail("Thirsting Blade's second attack has to be with your pact weapon.");
      if (t.attacksLeft > 0 && atk.solo) return fail(`${atk.name} takes a whole action: it can't be one of the Multiattack's attacks.`);
      useAttack(t, A, atk);
      if (atk.light && !t.light) t.light = atk.base;
      attack(b, A, T, atk);
      break;
    }
    case 'shove': {
      if (!canAttack(t)) return fail('You have already used your action.');
      if (!T || !hostile(A, T) || !onBoard(T) || T.dead || cheb(A, T) > 1) return fail('Shove needs an enemy within 5 feet of you.');
      if (SIZE[T.size || 'medium'] > SIZE[A.size || 'medium'] + 1) return fail(`${T.name} is too big to shove (more than one size larger).`);
      useAttack(t, A);
      if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
      const dcParts = [{ label: 'Base', value: 8, rule: 'unarmed-strike' }, { label: 'STR modifier', value: A.mods.str, rule: 'ability-modifier' }, { label: 'Proficiency Bonus', value: A.pb, rule: 'proficiency' }];
      const dc = sumParts(dcParts);
      const ab = (T.saves?.str ?? T.mods.str) >= (T.saves?.dex ?? T.mods.dex) ? 'str' : 'dex';
      const sv = savingThrow(b, T, ab, dc);
      const mode = intent.mode === 'push' ? 'push' : 'prone';
      let res = '';
      if (!sv.success) {
        if (mode === 'prone') { addCond(b, T, { id: 'prone', by: A.id }); res = `${T.name} is knocked Prone.`; }
        else { const ft = push(b, A, T, 5); res = ft ? `${T.name} is pushed 5 feet.` : `${T.name} has nowhere to go.`; tidy(b); }
      }
      emit(b, { kind: 'save-spell', by: A.id, what: `Shove (${mode === 'prone' ? 'knock Prone' : 'push 5 ft'})`, ability: ab, dc, dcParts, damage: null, half: false, rule: 'unarmed-strike',
        results: [{ ...sv, damage: 0, text: `${T.name} ${sv.success ? 'resists' : 'fails'} (${sv.total}). ${res}` }],
        text: `${A.name} tries to Shove ${T.name}: DC ${dc} ${ABILITY_NAMES[ab]} save (it picks the better of Strength or Dexterity). ${sv.success ? 'It holds its ground.' : res}` });
      break;
    }
    case 'grapple': {
      // Unarmed Strike, Grapple option: the target saves (Strength or
      // Dexterity, its choice) against 8 + STR + PB or is Grappled.
      if (!canAttack(t)) return fail('You have already used your action.');
      if (!T || !hostile(A, T) || !onBoard(T) || T.dead || cheb(A, T) > 1) return fail('Grapple needs an enemy within 5 feet of you.');
      if (SIZE[T.size || 'medium'] > SIZE[A.size || 'medium'] + 1) return fail(`${T.name} is too big to grapple (more than one size larger).`);
      if (T.conds?.some((x) => x.id === 'grappled' && x.by === A.id)) return fail(`You are already grappling ${T.name}.`);
      if ((T.condImmune || []).includes('grappled')) return fail(`${T.name} can't be Grappled.`);
      useAttack(t, A);
      if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
      const dcParts = [{ label: 'Base', value: 8, rule: 'unarmed-strike' }, { label: 'STR modifier', value: A.mods.str, rule: 'ability-modifier' }, { label: 'Proficiency Bonus', value: A.pb, rule: 'proficiency' }];
      const dc = sumParts(dcParts);
      const ab = (T.saves?.str ?? T.mods.str) >= (T.saves?.dex ?? T.mods.dex) ? 'str' : 'dex';
      const sv = savingThrow(b, T, ab, dc);
      let res = '';
      if (!sv.success && addCond(b, T, { id: 'grappled', by: A.id, dc, reach: 5 })) res = `${T.name} is Grappled (escape DC ${dc}): Speed 0, and Disadvantage on attacks against anyone but ${A.name}.`;
      emit(b, { kind: 'save-spell', by: A.id, what: 'Grapple', ability: ab, dc, dcParts, damage: null, half: false, rule: 'grappled',
        results: [{ ...sv, damage: 0, text: `${T.name} ${sv.success ? 'slips free' : 'fails'} (${sv.total}). ${res}` }],
        text: `${A.name} tries to Grapple ${T.name}: DC ${dc} ${ABILITY_NAMES[ab]} save (it picks the better of Strength or Dexterity). ${sv.success ? 'It twists away.' : res}` });
      break;
    }
    case 'cut': {
      // Attack the web holding a Restrained creature (AC 10, 5 HP).
      if (!canAttack(t)) return fail('You have already used your action.');
      const web = T && condOf(T, 'restrained');
      if (!web?.web) return fail('Pick a creature caught in a web.');
      const atk = A.attacks.find((a) => a.id === intent.attack) || A.attacks.find((a) => a.kind === 'melee') || A.attacks[0];
      if (T !== A && !(atk.kind === 'ranged' ? feetBetween(A, T) <= atk.range[1] && lineOfSight(b, A, T) : feetBetween(A, T) <= (atk.reach || 5))) return fail('Get close enough to reach the web.');
      useAttack(t, A);
      const f = { adv: [], dis: [] };
      if (hasCond(A, 'restrained')) f.dis.push({ text: `${A.name} is Restrained`, rule: 'restrained' });
      if (hasCond(A, 'poisoned')) f.dis.push({ text: `${A.name} is Poisoned`, rule: 'poisoned' });
      const mode = modeFrom(f.adv, f.dis);
      const d20 = rollD20(b, A, mode);
      const mods = [...atk.hit, ...testParts(A)];
      const total = d20.kept + sumParts(mods);
      const hit = d20.kept === 20 || (d20.kept !== 1 && total >= web.web.ac);
      let dmg = null;
      if (hit) {
        const { n, sides } = parseDice(atk.dice);
        const rolls = rollDice(b.rng, n, sides);
        const raw = Math.max(0, sum(rolls) + sumParts(atk.dmgFlat));
        const m = atk.type === 'Fire' ? 2 : ['Poison', 'Psychic'].includes(atk.type) ? 0 : 1;
        dmg = { parts: [{ label: `${atk.name} ${atk.dice}`, rolls, value: sum(rolls), rule: 'damage' }, ...atk.dmgFlat], total: raw * m, type: atk.type };
        web.web.hp -= dmg.total;
      }
      const freed = web.web.hp <= 0;
      if (freed) dropCond(T, 'restrained', (x) => x === web);
      emit(b, { kind: 'attack', by: A.id, target: T.id, weapon: atk.name, attackKind: atk.kind, d20: { ...d20, ...f }, mods, total, ac: web.web.ac,
        acParts: [{ label: 'Web', value: web.web.ac, rule: 'restrained' }], outcome: hit ? 'hit' : 'miss', notes: [], damage: dmg, after: null,
        text: `${A.name} ${hit ? 'slashes' : 'misses'} the web holding ${T.name}${hit ? ` (${dmg.total} damage)` : ''}. ${freed ? `The web tears: ${T.name} is free.` : `The web holds (${Math.max(0, web.web.hp)} HP left).`}`,
        rule: 'restrained' });
      break;
    }
    case 'escape': {
      err = needAction(); if (err) return fail(err);
      // A grapple (Athletics or Acrobatics), or a spell's Restrained (Entangle, Web: Athletics).
      const g = condOf(A, 'grappled') || (A.conds || []).find((x) => x.id === 'restrained' && x.escape);
      if (!g) return fail("You aren't Grappled or caught by a spell you can break free of.");
      t.action--;
      const spell = !!g.escape;
      const dc = spell ? g.escape.dc : g.dc;
      const skills = [{ id: 'athletics', ab: 'str', name: 'Strength (Athletics)' }];
      if (!spell) skills.push({ id: 'acrobatics', ab: 'dex', name: 'Dexterity (Acrobatics)' });
      const ck = abilityCheck(b, A, skills, dc);
      if (ck.success) dropCond(A, g.id, (x) => x === g);
      emit(b, { kind: 'check', by: id, skill: ck.skill, d20: ck.d20, mods: ck.mods, total: ck.total, dc, outcome: ck.success ? 'success' : 'fail', rule: spell ? g.rule : 'grappled',
        text: `${A.name} tries to break free${spell ? ` of ${SPELLS[g.rule]?.name || 'the spell'}` : ' of the grapple'}: ${ck.skill} ${ck.total} vs DC ${dc}, ${ck.success ? 'free!' : 'still held'}.` });
      break;
    }
    case 'hide': {
      const bonus = !!intent.bonus;
      if (bonus && !(A.cunning || A.nimble)) return fail('Hiding takes your action.');
      err = bonus ? needBonus() : needAction(); if (err) return fail(err);
      const eyes = seenBy(b, A);
      if (eyes.length) return fail(`${eyes[0].name} can see you. To Hide you need to be out of every enemy's line of sight (behind a wall).`);
      if (effectOn(b, 'wisp', id)) return fail("Starry Wisp's light is on you: you can't hide until it fades.");
      if (bonus) t.bonus = 0; else t.action--;
      const ck = abilityCheck(b, A, [{ id: 'stealth', ab: 'dex', name: 'Dexterity (Stealth)' }], 15);
      if (ck.success) addCond(b, A, { id: 'hidden', stealth: ck.total, rule: 'hide' });
      emit(b, { kind: 'check', by: id, skill: ck.skill, d20: ck.d20, mods: ck.mods, total: ck.total, dc: 15, outcome: ck.success ? 'success' : 'fail', rule: 'hide',
        text: ck.success ? `${A.name} hides (Stealth ${ck.total}): Invisible to enemies until found, or until they attack or cast.` : `${A.name} fails to hide (Stealth ${ck.total} vs DC 15).` });
      break;
    }
    case 'breath': {
      if (!A.breath || A.breath.uses < 1) return fail('No Breath Weapon uses left.');
      if (!canAttack(t)) return fail('Breath Weapon replaces an attack of your Attack action, which you have used.');
      if (!Number.isInteger(intent.x) || !Number.isInteger(intent.y) || (intent.x === A.x && intent.y === A.y)) return fail('Pick a direction.');
      const shape = intent.shape === 'line' ? 'line' : 'cone';
      useAttack(t, A);
      A.breath.uses--;
      areaSave(b, A, areaTargets(b, A, BREATH_AREAS[shape], intent.x, intent.y), { name: `Breath Weapon (${A.breath.type}, ${shape === 'line' ? '30-ft Line' : '15-ft Cone'})`, ability: 'dex', dcParts: A.breath.dc, dice: A.breath.dice, type: A.breath.type, half: true, rule: 'breath-weapon' });
      break;
    }
    case 'drain': {
      // Life Drain (Wight): replaces one of its Multiattack's attacks.
      if (!A.drain) return fail('No Life Drain.');
      if (!canAttack(t)) return fail('You have already used your action.');
      if (!T || !hostile(A, T) || T.dead || T.hp <= 0 || cheb(A, T) > 1) return fail('Pick an enemy next to it.');
      if (A.drain.needsHeld && !(incap(T) || hasCond(T, 'restrained') || T.conds.some((x) => x.id === 'grappled' && x.by === A.id))) return fail(`${A.drain.name || 'Life Drain'} needs a target that is Grappled by it, Incapacitated or Restrained.`);
      useAttack(t, A, null);
      const d = A.drain;
      const before = T.hpMax;
      areaSave(b, A, [T], { name: d.name || 'Life Drain', ability: 'con', dcParts: [{ label: 'Stat block', value: d.dc, rule: 'stat-block' }], dice: d.dice, flat: d.flat, flatLabel: 'Stat block damage bonus', type: d.type, half: false, rule: 'life-drain', ignoreCover: true });
      const r = [...b.log].reverse().find((x) => x.kind === 'save-spell' && x.rule === 'life-drain')?.results?.[0];
      if (r && !r.success && r.damage > 0 && !T.dead) {
        T.hpMax = Math.max(1, T.hpMax - r.damage);
        T.drained = (T.drained || 0) + (before - T.hpMax);
        T.hp = Math.min(T.hp, T.hpMax);
        emit(b, { kind: 'note', by: A.id, target: T.id, rule: 'life-drain', text: `${T.name}'s Hit Point maximum drops by ${before - T.hpMax} to ${T.hpMax} until a Long Rest.` });
        if (d.heal && A.hp > 0) {
          const got = Math.min(r.damage, A.hpMax - A.hp);
          A.hp += got;
          emit(b, { kind: 'note', by: A.id, rule: 'life-drain', text: `${A.name} regains ${got} Hit Points.` });
        }
      }
      break;
    }
    case 'glare': {
      // Dreadful Glare (Mummy Lord): part of its Multiattack, once a turn.
      if (!A.glare) return fail('No Dreadful Glare.');
      if (t.glared) return fail('It has already used Dreadful Glare this turn.');
      if (!(t.action > 0 || t.attacksLeft > 0 || (t.attacked || []).length)) return fail('Dreadful Glare is part of its Attack action.');
      if (!T || !hostile(A, T) || T.dead || T.hp <= 0 || !glareTargets(b, A).includes(T)) return fail(`Pick an enemy it can see within ${A.glare.range} feet.`);
      t.glared = true;
      glareAt(b, A, T);
      break;
    }
    case 'mbreath': {
      const br = A.mbreath;
      if (!br?.ready) return fail('Its breath is not recharged.');
      err = needAction(); if (err) return fail(err);
      if (t.attacked?.length || t.attacksLeft) return fail('The breath takes the whole action.');
      if (!Number.isInteger(intent.x) || !Number.isInteger(intent.y) || (intent.x === A.x && intent.y === A.y)) return fail('Pick a direction.');
      t.action--;
      br.ready = false;
      const area = { shape: br.shape, size: br.size, from: 'self' };
      areaSave(b, A, areaTargets(b, A, area, intent.x, intent.y), { name: `${br.name} (${br.size}-ft ${br.shape === 'line' ? 'Line' : 'Cone'})`, ability: br.ability || 'dex',
        dcParts: [{ label: 'Stat block', value: br.dc, rule: 'stat-block' }], dice: br.dice, type: br.type, half: true, rule: 'recharge' });
      break;
    }
    case 'web': {
      if (!A.web?.ready) return fail('Web is not recharged.');
      err = needAction(); if (err) return fail(err);
      if (!T || !hostile(A, T) || T.dead || feetBetween(A, T) > A.web.range || !lineOfSight(b, A, T)) return fail('Pick an enemy it can see within 60 feet.');
      t.action--;
      A.web.ready = false;
      const sv = condSave(b, A, T, 'dex', A.web.dc, 'restrained');
      if (!sv.success) addCond(b, T, { id: 'restrained', by: A.id, web: { ac: A.web.webAc, hp: A.web.webHp }, rule: 'restrained' });
      emit(b, { kind: 'save-spell', by: A.id, what: 'Web', ability: 'dex', dc: A.web.dc, dcParts: [{ label: 'Stat block', value: A.web.dc, rule: 'stat-block' }], damage: null, half: false, rule: 'restrained',
        results: [{ ...sv, damage: 0, text: `${T.name} ${sv.success ? 'dodges' : 'is caught'} (${sv.total}).` }],
        text: `${A.name} shoots a web at ${T.name}: DC ${A.web.dc} Dexterity save. ${sv.success ? 'Missed.' : `${T.name} is Restrained until the web is destroyed (AC ${A.web.webAc}, ${A.web.webHp} HP).`}` });
      break;
    }
    case 'jaunt': {
      if (A.giant?.kind !== 'cloud' || A.giant.uses < 1) return fail("No Cloud's Jaunt uses left.");
      err = needBonus(); if (err) return fail(err);
      const e = pointError(b, A, { mode: 'point', range: 30 }, intent.x, intent.y);
      if (e) return fail(e);
      t.bonus = 0;
      A.giant.uses--;
      const from = { x: A.x, y: A.y };
      A.x = intent.x; A.y = intent.y;
      if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
      emit(b, { kind: 'move', by: A.id, path: [{ x: A.x, y: A.y }], feet: 0, left: t.moveLeft, teleport: true, from, rule: 'giant-ancestry',
        text: `${A.name} uses Cloud's Jaunt and teleports ${cheb(from, A) * FT} ft (${A.giant.uses} left). Teleporting doesn't provoke Opportunity Attacks.` });
      tidy(b);
      break;
    }
    case 'cast': {
      err = castSpell(b, A, intent);
      if (err) return fail(err);
      break;
    }
    case 'spiritual': {
      const w = b.effects.find((x) => x.type === 'spiritual' && x.by === id);
      if (!w) return fail('No Spiritual Weapon.');
      err = needBonus(); if (err) return fail(err);
      if (!T || !hostile(A, T) || T.dead || !onBoard(T) || cheb(w, T) > 5) return fail('The weapon moves 20 feet, then attacks a creature within 5 feet of it.');
      t.bonus = 0;
      emit(b, { kind: 'action', by: id, what: 'Spiritual Weapon', text: `${A.name}'s Spiritual Weapon flies at ${T.name} (Bonus Action).`, rule: 'spiritual-weapon' });
      spiritualStrike(b, A, T);
      break;
    }
    case 'haste': {
      if (!t.hasteAct) return fail("No extra action from Haste this turn.");
      if (t.action > 0 || t.attacksLeft > 0) return fail('Use your own action first: Haste gives you one more after it.');
      t.hasteAct = 0;
      t.action = 1;
      t.hasteOnly = true;
      t.magicUsed = true;
      emit(b, { kind: 'action', by: id, what: 'Haste', text: `${A.name} takes the extra action from Haste: one weapon attack, Dash, Disengage or Hide.`, rule: 'haste' });
      break;
    }
    case 'wake': {
      err = needAction(); if (err) return fail(err);
      if (!T || T.side !== A.side || T === A || cheb(A, T) > 1 || !(T.conds || []).some((x) => x.pattern || x.rule === 'sleep')) return fail('Pick a charmed or sleeping ally next to you.');
      t.action--;
      T.conds = T.conds.filter((x) => !(x.pattern || x.rule === 'sleep'));
      emit(b, { kind: 'action', by: id, what: 'Shake awake', target: T.id, text: `${A.name} shakes ${T.name} out of it.`, rule: 'incapacitated' });
      break;
    }
    case 'dash': {
      const bonus = !!intent.bonus;
      if (bonus && !A.cunning) return fail('Only a Rogue (Cunning Action) can Dash as a Bonus Action.');
      err = bonus ? needBonus() : needAction(); if (err) return fail(err);
      if (bonus) t.bonus = 0; else t.action--;
      const gain = Math.max(0, A.speed - 5 * (A.exhaustion || 0));
      t.moveLeft += speedOf(b, A) ? gain : 0;
      emit(b, { kind: 'action', by: id, what: 'Dash', text: `${A.name} takes the Dash action${bonus ? ' as a Bonus Action (Cunning Action)' : ''}: +${speedOf(b, A) ? gain : 0} ft of movement this turn.`, rule: bonus ? 'cunning-action' : 'dash' });
      break;
    }
    case 'adrenaline': {
      if (!A.adrenaline || A.adrenaline.uses < 1) return fail('No Adrenaline Rush uses left.');
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      A.adrenaline.uses--;
      t.moveLeft += speedOf(b, A) ? A.speed : 0;
      A.tempHp = Math.max(A.tempHp || 0, A.pb);
      emit(b, { kind: 'action', by: id, what: 'Adrenaline Rush', text: `${A.name} uses Adrenaline Rush: Dash as a Bonus Action and ${A.pb} Temporary Hit Points.`, rule: 'adrenaline-rush' });
      break;
    }
    case 'disengage':
    case 'nimble': {
      const bonus = intent.a === 'nimble' || !!intent.bonus;
      if (bonus && !(A.nimble || A.cunning)) return fail('No bonus action for that.');
      err = bonus ? needBonus() : needAction(); if (err) return fail(err);
      if (bonus) t.bonus = 0; else t.action--;
      b.effects.push({ type: 'disengage', by: id, expires: { when: 'end', who: id, skip: 0 } });
      emit(b, { kind: 'action', by: id, what: 'Disengage',
        text: `${A.name} takes the Disengage action${bonus ? ` as a Bonus Action (${A.cunning ? 'Cunning Action' : 'Nimble Escape'})` : ''}: moving won't provoke Opportunity Attacks this turn.`,
        rule: bonus ? (A.cunning ? 'cunning-action' : 'nimble-escape') : 'disengage' });
      break;
    }
    case 'dodge': {
      err = needAction(); if (err) return fail(err);
      t.action--;
      b.effects = b.effects.filter((e) => !(e.type === 'dodge' && e.by === id));
      b.effects.push({ type: 'dodge', by: id, expires: { when: 'start', who: id } });
      emit(b, { kind: 'action', by: id, what: 'Dodge', text: `${A.name} takes the Dodge action: attacks against them have Disadvantage, and they have Advantage on Dexterity saves, until their next turn.`, rule: 'dodge' });
      break;
    }
    case 'help': {
      err = needAction(); if (err) return fail(err);
      if (!T || !hostile(A, T) || incap(T) || cheb(A, T) > 1) return fail('Help needs an enemy within 5 feet of you.');
      t.action--;
      b.effects.push({ type: 'helped', by: id, target: T.id, expires: { when: 'start', who: id } });
      emit(b, { kind: 'action', by: id, what: 'Help', target: T.id,
        text: `${A.name} takes the Help action: the next ally to attack ${T.name} has Advantage.`, rule: 'help' });
      break;
    }
    case 'stabilize': {
      err = needAction(); if (err) return fail(err);
      if (!T || T.side !== A.side || T.hp > 0 || T.dead || T.stable || cheb(A, T) > 1) return fail('Pick a dying ally next to you.');
      t.action--;
      const d20 = rollD20(b, A, hasCond(A, 'poisoned') ? 'disadvantage' : 'normal');
      const mods = [{ label: 'Medicine (WIS)', value: A.skills.medicine, rule: 'skills' }, ...testParts(A)];
      const total = d20.kept + sumParts(mods);
      const ok = total >= 10;
      if (ok) { T.stable = true; T.deathSaves = { s: 0, f: 0 }; }
      emit(b, { kind: 'check', by: id, target: T.id, skill: 'Medicine', d20, mods, total, dc: 10, outcome: ok ? 'success' : 'fail',
        text: ok ? `${A.name} stabilizes ${T.name}.` : `${A.name} fails to stabilize ${T.name}.`, rule: 'stabilize' });
      break;
    }
    case 'second-wind': {
      if (!A.secondWind || A.secondWind.uses < 1) return fail('No uses of Second Wind left.');
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      A.secondWind.uses--;
      const r = die(b.rng, 10);
      const amount = r + A.level;
      const hpBefore = A.hp;
      A.hp = Math.min(A.hpMax, A.hp + amount);
      emit(b, { kind: 'heal', by: id, target: id, what: 'Second Wind',
        roll: { label: '1d10', rolls: [r] }, mods: [{ label: 'Fighter level', value: A.level }], total: amount, before: hpBefore, after: A.hp,
        text: `${A.name} uses Second Wind and regains ${A.hp - hpBefore} HP (${s1(A.secondWind.uses, 'use')} left).`, rule: 'second-wind' });
      if (A.tacticalShift) {
        const ft = Math.floor(speedOf(b, A) / 2 / FT) * FT;
        t.moveLeft += ft;
        t.shift = (t.shift || 0) + ft;
        emit(b, { kind: 'note', by: id, rule: 'tactical-shift', text: `Tactical Shift: ${A.name} can move ${ft} more feet this turn without provoking Opportunity Attacks.` });
      }
      break;
    }
    case 'surge': {
      if (!A.actionSurge || A.actionSurge.uses < 1) return fail('No Action Surge left. It comes back on a Short or Long Rest.');
      if (t.surged) return fail('Only one Action Surge per turn.');
      A.actionSurge.uses--;
      t.surged = true;
      t.action++;
      emit(b, { kind: 'action', by: id, what: 'Action Surge', text: `${A.name} uses Action Surge: one extra action this turn (not for casting a spell).`, rule: 'action-surge' });
      break;
    }
    case 'aim': {
      if (!A.steadyAim) return fail('Only a level 3 Rogue has Steady Aim.');
      err = needBonus(); if (err) return fail(err);
      if (t.moves > 0 || t.moveLeft < speedOf(b, A)) return fail("Steady Aim only works if you haven't moved this turn.");
      t.bonus = 0;
      t.moveLeft = 0;
      b.effects.push({ type: 'aim', by: id, expires: { when: 'end', who: id, skip: 0 } });
      emit(b, { kind: 'action', by: id, what: 'Steady Aim', text: `${A.name} takes Steady Aim: Advantage on their next attack roll this turn, but no more moving.`, rule: 'steady-aim' });
      break;
    }
    case 'spark': {
      if (A.cls !== 'cleric') return fail('Divine Spark is a Cleric Channel Divinity.');
      if (!A.channel || A.channel.uses < 1) return fail('No Channel Divinity uses left.');
      err = magic(); if (err) return fail(err);
      if (!T || T.dead || !onBoard(T) || feetBetween(A, T) > 30 || !lineOfSight(b, A, T)) return fail('Pick a creature you can see within 30 feet.');
      const harm = hostile(A, T);
      t.action--; t.magicUsed = true;
      A.channel.uses--;
      const nd = A.sparkDice || 1;
      // Supreme Healing (Life 17): healing dice show their highest number.
      const rs = !harm && A.supremeHealing ? Array(nd).fill(8) : rollDice(b.rng, nd, 8);
      const r = sum(rs);
      const mods = [{ label: 'WIS modifier', value: A.mods.wis, rule: 'ability-modifier' }];
      const amount = Math.max(0, r + A.mods.wis);
      emit(b, { kind: 'action', by: id, what: 'Divine Spark', text: `${A.name} uses Channel Divinity: Divine Spark (${s1(A.channel.uses, 'use')} left).`, rule: 'channel-divinity' });
      if (!harm) heal(b, A, T, amount, 'Divine Spark', 'channel-divinity', { label: `${nd}d8`, rolls: rs }, mods, nd * 8 + A.mods.wis);
      else {
        const dcParts = A.casting.stats.wis.dc;
        const dc = sumParts(dcParts);
        const sv = savingThrow(b, T, 'con', dc);
        const raw = sv.success ? Math.floor(amount / 2) : amount;
        const dmg = finishDamage(T, [{ label: 'Divine Spark', value: raw, type: 'Radiant' }]);
        const after = applyDamage(b, T, dmg.total, { types: ['Radiant'], by: id });
        emit(b, { kind: 'save-spell', by: id, what: 'Divine Spark', ability: 'con', dc, dcParts, rule: 'channel-divinity', half: true,
          damage: { parts: [{ label: `Divine Spark ${nd}d8`, rolls: rs, value: r }, ...mods], total: amount, type: 'Radiant' },
          results: [{ ...sv, damage: dmg.total, adjust: dmg.adjust, after, text: `${T.name} ${sv.success ? 'succeeds' : 'fails'} (${sv.total}): ${dmg.total} Radiant damage${adjustText(dmg)}.${afterText(T, after)}` }],
          text: `Divine Spark: DC ${dc} Constitution save. ${T.name} takes ${dmg.total} Radiant damage.` });
        flushPost(b);
        checkOver(b);
      }
      break;
    }
    case 'turn': {
      if (A.cls !== 'cleric') return fail('Turn Undead is a Cleric Channel Divinity.');
      if (!A.channel || A.channel.uses < 1) return fail('No Channel Divinity uses left.');
      err = magic(); if (err) return fail(err);
      const undead = enemiesOf(b, A).filter((c) => c.creature === 'undead' && c.hp > 0 && feetBetween(A, c) <= 30);
      if (!undead.length) return fail('No Undead within 30 feet.');
      t.action--; t.magicUsed = true;
      A.channel.uses--;
      const dcParts = A.casting.stats.wis.dc;
      const dc = sumParts(dcParts);
      const results = [];
      // Sear Undead (Cleric 5): WIS-modifier d8s of Radiant to each one that fails; it doesn't end the turning.
      const sear = A.searUndead ? rollDice(b.rng, A.searUndead, 8) : null;
      for (const U of undead) {
        const sv = savingThrow(b, U, 'wis', dc, { cond: 'frightened' });
        let dmg = 0, burn = '';
        if (!sv.success && sear) {
          const d = finishDamage(U, [{ label: `Sear Undead ${A.searUndead}d8`, rolls: sear, value: sum(sear), rule: 'sear-undead', type: 'Radiant' }]);
          const after = applyDamage(b, U, d.total, { types: ['Radiant'], by: id });
          dmg = d.total;
          burn = ` Sear Undead burns it for ${d.total} Radiant damage${adjustText(d)}.${afterText(U, after)}`;
        }
        if (!sv.success && !U.dead && U.hp > 0) {
          addCond(b, U, { id: 'frightened', by: id, turned: true, endsOnDamage: true, rule: 'turn-undead' });
          addCond(b, U, { id: 'incapacitated', by: id, turned: true, endsOnDamage: true, rule: 'turn-undead' });
        }
        results.push({ ...sv, damage: dmg, text: `${U.name} ${sv.success ? 'resists' : 'is turned: Frightened and Incapacitated, it flees'} (${sv.total}).${burn}` });
      }
      emit(b, { kind: 'save-spell', by: id, what: 'Turn Undead', ability: 'wis', dc, dcParts, damage: null, half: false, results, rule: 'turn-undead',
        text: `${A.name} presents a holy symbol: Turn Undead (${s1(A.channel.uses, 'use')} left). Each Undead within 30 feet makes a DC ${dc} Wisdom save.` });
      break;
    }
    case 'preserve': {
      if (!A.preserveLife || !A.channel || A.channel.uses < 1) return fail('No Channel Divinity uses left.');
      err = magic(); if (err) return fail(err);
      const plan = preservePlan(b, A);
      if (!plan.length) return fail('Nobody within 30 feet is Bloodied (at half Hit Points or less).');
      t.action--; t.magicUsed = true;
      A.channel.uses--;
      emit(b, { kind: 'action', by: id, what: 'Preserve Life', text: `${A.name} uses Channel Divinity: Preserve Life. ${5 * A.level} Hit Points to share among Bloodied allies, none past half their maximum.`, rule: 'preserve-life' });
      for (const p of plan) heal(b, A, C(b, p.id), p.amount, 'Preserve Life', 'preserve-life', { label: 'shared', rolls: [] }, []);
      break;
    }
    case 'rage': {
      if (!A.rage) return fail('Only a Barbarian can Rage.');
      err = needBonus(); if (err) return fail(err);
      if (A.raging) {
        t.bonus = 0;
        A.raging.kept = true;
        emit(b, { kind: 'action', by: id, what: 'Rage', text: `${A.name} uses a Bonus Action to keep raging.`, rule: 'rage' });
        break;
      }
      if (A.rage.uses < 1) return fail('No Rage uses left. One comes back on a Short Rest, all on a Long Rest.');
      t.bonus = 0;
      A.rage.uses--;
      A.raging = { since: turnKey(b), kept: false };
      if (A.conc) endConc(b, A, `${A.name} flies into a Rage`);
      emit(b, { kind: 'action', by: id, what: 'Rage', rule: 'rage',
        text: `${A.name} flies into a Rage (${s1(A.rage.uses, 'use')} left): Resistance to Bludgeoning, Piercing and Slashing damage, +${A.rageDmg} damage on Strength attacks, Advantage on Strength checks and saves. No spells.` });
      if (A.mindlessRage) {
        const gone = (A.conds || []).filter((x) => (x.id === 'charmed' || x.id === 'frightened') && !x.pattern);
        if (gone.length) {
          A.conds = A.conds.filter((x) => !gone.includes(x));
          emit(b, { kind: 'note', by: id, rule: 'mindless-rage', text: `Mindless Rage: ${A.name} is no longer ${[...new Set(gone.map((x) => COND_NAMES[x.id]))].join(' or ')}.` });
        }
      }
      if (A.pounce && speedOf(b, A) > 0) {
        const ft = Math.floor(speedOf(b, A) / 2 / FT) * FT;
        t.moveLeft += ft;
        emit(b, { kind: 'note', by: id, rule: 'instinctive-pounce', text: `Instinctive Pounce: ${A.name} can move ${ft} more feet this turn.` });
      }
      break;
    }
    case 'reckless': {
      if (!A.reckless) return fail('Only a level 2 Barbarian can attack recklessly.');
      if (t.rolled) return fail('You decide on Reckless Attack with your first attack roll of the turn.');
      if (!canAttack(t)) return fail('You have no attacks left this turn.');
      if (b.effects.some((e) => e.type === 'reckless' && e.by === id)) return fail("You're already attacking recklessly.");
      b.effects.push({ type: 'reckless', by: id, expires: { when: 'start', who: id } });
      emit(b, { kind: 'action', by: id, what: 'Reckless Attack', rule: 'reckless-attack',
        text: `${A.name} attacks recklessly: Advantage on Strength attack rolls, but attack rolls against them have Advantage too, until their next turn.` });
      break;
    }
    case 'inspire': {
      if (!A.bardic) return fail('Only a Bard has Bardic Inspiration.');
      if (A.bardic.uses < 1) return fail('No Bardic Inspiration left. It comes back on a Long Rest.');
      err = needBonus(); if (err) return fail(err);
      if (!T || T === A || hostile(A, T) || T.dead || !onBoard(T) || feetBetween(A, T) > 60 || !lineOfSight(b, A, T)) return fail('Pick an ally you can see within 60 feet (not yourself).');
      if (T.bardicDie) return fail(`${T.name} already has a Bardic Inspiration die.`);
      t.bonus = 0;
      A.bardic.uses--;
      T.bardicDie = { die: A.bardic.die, from: id };
      emit(b, { kind: 'action', by: id, target: T.id, what: 'Bardic Inspiration', rule: 'bardic-inspiration',
        text: `${A.name} inspires ${T.name} (${s1(A.bardic.uses, 'use')} left): a d${A.bardic.die} to add the next time a D20 Test fails by little enough.` });
      break;
    }
    case 'shape': {
      if (!A.wildShape) return fail('Wild Shape comes at Druid level 2.');
      if (A.shape) return fail("You're already in Wild Shape.");
      // Wild Resurgence (Druid 5): with no uses left, spend a spell slot for one (once per turn).
      if (A.wildShape.uses < 1 && A.wildResurgence && A.resurgeKey !== turnKey(b) && t.bonus > 0) {
        const lv = Object.keys(A.casting?.slots || {}).map(Number).sort((p, q) => p - q).find((l) => A.casting.slots[l].left > 0 && !A.casting.slots[l].pact);
        if (lv) {
          A.casting.slots[lv].left--;
          A.wildShape.uses++;
          A.resurgeKey = turnKey(b);
          emit(b, { kind: 'note', by: id, rule: 'wild-resurgence', text: `Wild Resurgence: ${A.name} spends a level ${lv} spell slot to regain a use of Wild Shape.` });
        }
      }
      if (A.wildShape.uses < 1) return fail('No Wild Shape uses left. One comes back on a Short Rest, all on a Long Rest.');
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      A.wildShape.uses--;
      const got = becomeWolf(b, A);
      emit(b, { kind: 'action', by: id, what: 'Wild Shape', rule: 'wild-shape',
        text: `${A.name} uses Wild Shape (${s1(A.wildShape.uses, 'use')} left) and becomes a Wolf: AC 12, Speed 40, Bite +4 for 1d6 + 2. ${got.had >= got.temp ? `Keeps ${got.had} Temporary Hit Points` : `${got.temp} Temporary Hit Points`}. No spells in this form.` });
      break;
    }
    case 'unshape': {
      if (!A.shape) return fail("You aren't in Wild Shape.");
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      revertShape(b, A, 'Bonus Action');
      break;
    }
    case 'landsaid': {
      if (!A.landsAid) return fail("Land's Aid comes at Druid level 3 (Circle of the Land).");
      if (!A.wildShape || A.wildShape.uses < 1) return fail("Land's Aid uses a Wild Shape use, and you have none left.");
      err = magic(); if (err) return fail(err);
      const area = { mode: 'area', shape: 'sphere', size: 10, from: 'point', range: 60 };
      const e = pointError(b, A, area, intent.x, intent.y);
      if (e) return fail(e);
      t.action--; t.magicUsed = true;
      A.wildShape.uses--;
      if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
      const inside = areaTargets(b, A, area, intent.x, intent.y);
      const foes = inside.filter((X) => hostile(A, X));
      const ally = inside.filter((X) => !hostile(A, X) && X.hp < X.hpMax && !X.dead).sort((p, q) => p.hp / p.hpMax - q.hp / q.hpMax)[0];
      emit(b, { kind: 'action', by: id, what: "Land's Aid", rule: 'lands-aid', text: `${A.name} uses Land's Aid (a Wild Shape use; ${A.wildShape.uses} left): thorny flowers in a 10-foot Sphere.` });
      const nd = landsAidDice(A);
      areaSave(b, A, foes, { name: "Land's Aid", ability: 'con', dcParts: A.casting.stats.wis.dc, dice: `${nd}d6`, type: 'Necrotic', half: true, rule: 'lands-aid', from: { x: intent.x, y: intent.y } });
      if (ally && !b.over) {
        const r = rollDice(b.rng, nd, 6);
        heal(b, A, ally, sum(r), "Land's Aid", 'lands-aid', { label: `${nd}d6`, rolls: r }, [], nd * 6);
      }
      break;
    }
    case 'martial': {
      const atk = A.attacks.find((a) => a.id === 'unarmed');
      if (!A.martialDie || !atk) return fail('Only a Monk gets a Bonus Action Unarmed Strike.');
      err = needBonus(); if (err) return fail(err);
      if (!T || !hostile(A, T)) return fail('Pick an enemy to strike.');
      const can = canTarget(b, A, T, atk);
      if (!can.ok) return fail(can.why);
      t.bonus = 0;
      attack(b, A, T, { ...atk, name: 'Unarmed Strike (Martial Arts, Bonus Action)' });
      break;
    }
    case 'flurry': {
      const atk = A.attacks.find((a) => a.id === 'unarmed');
      if (!A.focus || !atk) return fail("Flurry of Blows comes at Monk level 2 (Monk's Focus).");
      if (A.focus.uses < 1) return fail('No Focus Points left. They come back on a Short or Long Rest.');
      err = needBonus(); if (err) return fail(err);
      if (!T || !hostile(A, T)) return fail('Pick an enemy to strike.');
      const can = canTarget(b, A, T, atk);
      if (!can.ok) return fail(can.why);
      t.bonus = 0;
      A.focus.uses--;
      t.flurried = true;
      const tech = A.openHand ? (['addle', 'push', 'topple'].includes(intent.tech) ? intent.tech : 'topple') : null;
      const strikes = A.heightened ? 3 : 2;
      emit(b, { kind: 'action', by: id, what: 'Flurry of Blows', rule: A.heightened ? 'heightened-focus' : 'monks-focus',
        text: `${A.name} uses Flurry of Blows (1 Focus Point; ${A.focus.uses} left): ${strikes === 3 ? 'three Unarmed Strikes (Heightened Focus)' : 'two Unarmed Strikes'}${tech ? `, each hit with Open Hand Technique (${tech[0].toUpperCase()}${tech.slice(1)})` : ''}.` });
      const strike = (X) => attack(b, A, X, { ...atk, name: 'Unarmed Strike (Flurry of Blows)', flurry: tech });
      strike(T);
      for (let i = 1; i < strikes && !b.over && !b.pending; i++) {
        const want = (i === 1 ? intent.target2 : intent.target3) ? C(b, i === 1 ? intent.target2 : intent.target3) : T;
        const ok = (X) => X && hostile(A, X) && !X.dead && X.hp > 0 && canTarget(b, A, X, atk).ok;
        const T2 = ok(want) ? want : ok(T) ? T : enemiesOf(b, A).find(ok);
        if (T2) strike(T2);
        else { emit(b, { kind: 'note', by: id, text: 'Nobody is in reach for another strike.', rule: 'monks-focus' }); break; }
      }
      break;
    }
    case 'patient':
    case 'stepwind': {
      if (!A.focus) return fail("Patient Defense and Step of the Wind come at Monk level 2 (Monk's Focus).");
      err = needBonus(); if (err) return fail(err);
      const spend = !!intent.focus;
      if (spend && A.focus.uses < 1) return fail('No Focus Points left.');
      t.bonus = 0;
      if (spend) A.focus.uses--;
      const parts = [];
      if (intent.a === 'patient' || spend) {
        b.effects.push({ type: 'disengage', by: id, expires: { when: 'end', who: id, skip: 0 } });
        parts.push('Disengage');
      }
      if (intent.a === 'patient' && spend) {
        b.effects = b.effects.filter((e) => !(e.type === 'dodge' && e.by === id));
        b.effects.push({ type: 'dodge', by: id, expires: { when: 'start', who: id } });
        parts.push('Dodge');
        if (A.heightened) {
          const md = parseDice(A.martialDie || '1d6').sides;
          const rs = rollDice(b.rng, 2, md);
          A.tempHp = Math.max(A.tempHp || 0, sum(rs));
          parts.push(`${sum(rs)} Temporary Hit Points (Heightened Focus: 2d${md}, ${rs.join(' + ')})`);
        }
      }
      if (intent.a === 'stepwind') {
        const gain = speedOf(b, A) ? Math.max(0, A.speed - 5 * (A.exhaustion || 0)) : 0;
        t.moveLeft += gain;
        parts.push(`Dash (+${gain} ft)`);
      }
      emit(b, { kind: 'action', by: id, what: intent.a === 'patient' ? 'Patient Defense' : 'Step of the Wind', rule: 'monks-focus',
        text: `${A.name} uses ${intent.a === 'patient' ? 'Patient Defense' : 'Step of the Wind'}${spend ? ` (1 Focus Point; ${A.focus.uses} left)` : ''}: ${parts.join(' and ')} as a Bonus Action.` });
      break;
    }
    case 'lay': {
      if (!A.layOnHands) return fail('Only a Paladin has Lay on Hands.');
      err = needBonus(); if (err) return fail(err);
      if (!T || hostile(A, T) || T.dead || !onBoard(T) || (T !== A && cheb(A, T) > 1)) return fail('Touch yourself or an ally within 5 feet.');
      const pool = A.layOnHands;
      if (intent.cure) {
        // Restoring Touch (Paladin 14): 5 points each also end Blinded, Charmed, Frightened, Paralyzed or Stunned.
        const can = A.restoringTouch ? ['poisoned', 'blinded', 'charmed', 'frightened', 'paralyzed', 'stunned'] : ['poisoned'];
        const ids = [...new Set((T.conds || []).filter((c) => can.includes(c.id) && !c.pattern).map((c) => c.id))];
        if (!ids.length) return fail(`${T.name} has nothing Lay on Hands can end${A.restoringTouch ? '' : ' (it ends Poisoned)'}.`);
        if (pool.uses < 5) return fail('Ending a condition costs 5 Hit Points from the pool.');
        const ended = ids.slice(0, Math.floor(pool.uses / 5));
        t.bonus = 0;
        pool.uses -= 5 * ended.length;
        for (const c of ended) dropCond(T, c);
        emit(b, { kind: 'action', by: id, target: T.id, what: 'Lay on Hands', rule: ended.some((c) => c !== 'poisoned') ? 'restoring-touch' : 'lay-on-hands',
          text: `${A.name} uses Lay on Hands (${5 * ended.length} from the pool, ${pool.uses} left): ${T.name} is no longer ${ended.map((c) => COND_NAMES[c]).join(' or ')}.` });
        break;
      }
      if (pool.uses < 1) return fail('Your Lay on Hands pool is empty until a Long Rest.');
      const need = T.hpMax - T.hp;
      if (need <= 0) return fail(`${T.name} is at full Hit Points.`);
      if (effectOn(b, 'grave', T.id)) return fail(`${T.name} can't regain Hit Points right now (${effectOn(b, 'grave', T.id).what || 'Chill Touch'}).`);
      const amount = Math.min(pool.uses, need, intent.amount > 0 ? intent.amount | 0 : need);
      t.bonus = 0;
      pool.uses -= amount;
      heal(b, A, T, amount, 'Lay on Hands', 'lay-on-hands', { label: `from the pool (${pool.uses} left)`, rolls: [] }, []);
      break;
    }
    case 'fleet': {
      // Fleet Step (Open Hand 11): right after Flurry of Blows, Step of the Wind for 1 Focus Point, with no Bonus Action of its own.
      if (!A.fleetStep) return fail('Fleet Step comes at Monk level 11 (Warrior of the Open Hand).');
      if (!t.flurried || t.fleeted) return fail('Fleet Step follows Flurry of Blows, once a turn.');
      if (A.focus.uses < 1) return fail('No Focus Points left.');
      A.focus.uses--;
      t.fleeted = true;
      b.effects.push({ type: 'disengage', by: id, expires: { when: 'end', who: id, skip: 0 } });
      const gain = speedOf(b, A) ? Math.max(0, A.speed - 5 * (A.exhaustion || 0)) : 0;
      t.moveLeft += gain;
      emit(b, { kind: 'action', by: id, what: 'Fleet Step', rule: 'fleet-step',
        text: `${A.name} uses Fleet Step: Step of the Wind right after the Flurry (1 Focus Point; ${A.focus.uses} left): Disengage and Dash (+${gain} ft).` });
      break;
    }
    case 'intimidate': {
      // Intimidating Presence (Berserker 14).
      if (!A.intimidating) return fail('Intimidating Presence comes at Barbarian level 14 (Path of the Berserker).');
      const rage = A.intimidating.uses < 1;
      if (rage && !(A.rage?.uses > 0)) return fail('Intimidating Presence is used up until a Long Rest, and you have no Rage left to spend on it.');
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      if (rage) A.rage.uses--; else A.intimidating.uses--;
      const dc = 8 + A.mods.str + A.pb;
      const dcParts = [{ label: '8', value: 8 }, { label: 'STR modifier', value: A.mods.str, rule: 'ability-modifier' }, { label: 'Proficiency Bonus', value: A.pb, rule: 'proficiency' }];
      const foes = enemiesOf(b, A).filter((X) => !X.dead && X.hp > 0 && onBoard(X) && feetBetween(A, X) <= 30);
      const results = foes.map((X) => {
        const sv = savingThrow(b, X, 'wis', dc, { cond: 'frightened' });
        const got = !sv.success && addCond(b, X, { id: 'frightened', by: A.id, saveEnds: { ability: 'wis', dc }, rule: 'intimidating-presence' });
        return { ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'}${sv.auto ? ' automatically' : ` (${sv.total})`}${got ? ': Frightened of ' + A.name + ', saving again at the end of each of its turns' : ''}.` };
      });
      emit(b, { kind: 'save-spell', by: id, what: 'Intimidating Presence', ability: 'wis', dc, dcParts, damage: null, half: false, rule: 'intimidating-presence', results,
        text: `${A.name} uses Intimidating Presence (${rage ? `a use of Rage; ${A.rage.uses} left` : 'once per Long Rest'}): DC ${dc} Wisdom save for every enemy within 30 feet${foes.length ? '' : ', but none are that close'}.` });
      break;
    }
    case 'veil': {
      // Nature's Veil (Ranger 14).
      if (!A.veil) return fail("Nature's Veil comes at Ranger level 14.");
      if (A.veil.uses < 1) return fail("No uses of Nature's Veil left until a Long Rest.");
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      A.veil.uses--;
      b.effects = b.effects.filter((e) => !(e.type === 'veil' && e.target === id));
      b.effects.push({ type: 'veil', by: id, target: id, expires: { when: 'end', who: id, skip: 1 } });
      emit(b, { kind: 'action', by: id, what: "Nature's Veil", rule: 'natures-veil',
        text: `${A.name} uses Nature's Veil (${A.veil.uses} left): Invisible until the end of their next turn. Attack rolls against them have Disadvantage, and theirs have Advantage.` });
      break;
    }
    case 'sanctuary': {
      // Nature's Sanctuary (Circle of the Land 14): a Magic action and a use of Wild Shape.
      if (!A.sanctuary) return fail("Nature's Sanctuary comes at Druid level 14 (Circle of the Land).");
      if (!(A.wildShape?.uses > 0)) return fail("Nature's Sanctuary costs a use of Wild Shape, and you have none left.");
      if (!t.action) return fail('You have already used your action.');
      const at = { x: intent.x, y: intent.y };
      if (!Number.isInteger(at.x) || !Number.isInteger(at.y) || !inBounds(at.x, at.y) || isWall(b, at.x, at.y) || cheb(A, at) * FT > 120 || !lineOfSight(b, A, at)) return fail('Pick a square you can see within 120 feet.');
      t.action--;
      t.magicUsed = true;
      A.wildShape.uses--;
      b.effects = b.effects.filter((e) => !(e.type === 'sanctuary' && e.by === id));
      b.effects.push({ type: 'sanctuary', by: id, x: at.x, y: at.y, ward: A.sanctuary, expires: { when: 'never' } });
      emit(b, { kind: 'action', by: id, what: "Nature's Sanctuary", rule: 'natures-sanctuary',
        text: `${A.name} uses Nature's Sanctuary (a use of Wild Shape; ${A.wildShape.uses} left): spectral trees fill a 15-foot Cube. ${A.name} and allies in it have Half Cover, and allies in it have Resistance to ${A.sanctuary} damage.` });
      break;
    }
    case 'sacred': {
      if (!A.sacredWeapon) return fail('Sacred Weapon comes at Paladin level 3 (Oath of Devotion).');
      if (!A.channel || A.channel.uses < 1) return fail('No Channel Divinity uses left.');
      if (A.sacredOn) return fail('Your weapon already glows.');
      if (!canAttack(t)) return fail('Sacred Weapon is used as you take the Attack action, and you have no attacks left.');
      A.channel.uses--;
      A.sacredOn = true;
      emit(b, { kind: 'action', by: id, what: 'Sacred Weapon', rule: 'sacred-weapon',
        text: `${A.name} uses Channel Divinity: Sacred Weapon (${s1(A.channel.uses, 'use')} left). +${Math.max(1, A.mods.cha)} to melee weapon attack rolls for 10 minutes, and the weapon sheds light.` });
      break;
    }
    case 'remark': {
      const mk = b.effects.find((e) => e.type === 'mark' && e.by === id);
      if (!mk) return fail("You have no Hunter's Mark or Hex to move.");
      const old = C(b, mk.target);
      if (old && !old.dead && old.hp > 0) return fail(`${mk.name} moves only after ${old.name} drops to 0 Hit Points.`);
      err = needBonus(); if (err) return fail(err);
      if (!T || T === A || T.dead || !onBoard(T) || feetBetween(A, T) > 90 || !lineOfSight(b, A, T) || (hostile(A, T) && hasCond(T, 'hidden'))) return fail('Pick a creature you can see within 90 feet.');
      t.bonus = 0;
      mk.target = T.id;
      emit(b, { kind: 'action', by: id, target: T.id, what: mk.name, rule: mk.spell, text: `${A.name} moves ${mk.name} to ${T.name} (Bonus Action).` });
      break;
    }
    case 'nimbus': {
      // Holy Nimbus (Paladin 20).
      if (!A.nimbus) return fail('Holy Nimbus comes at Paladin level 20.');
      if (A.nimbusOn) return fail('Holy Nimbus is already shining.');
      if (A.nimbus.uses < 1) return fail('Holy Nimbus is used. It comes back on a Long Rest.');
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      A.nimbus.uses--;
      A.nimbusOn = true;
      emit(b, { kind: 'action', by: id, what: 'Holy Nimbus', rule: 'holy-nimbus',
        text: `${A.name} calls up Holy Nimbus (Bonus Action) for 10 minutes: an enemy that starts its turn within ${A.auraRange || 10} feet takes ${A.nimbus.dmg} Radiant damage, and ${A.name} has Advantage on saves forced by Fiends and Undead.` });
      break;
    }
    case 'quiver': {
      // Quivering Palm (Open Hand 17): end the vibrations in place of one attack.
      const q = b.effects.find((e) => e.type === 'quiver' && e.by === id);
      if (!q) return fail('No Quivering Palm vibrations are going.');
      const Q = C(b, q.target);
      if (!Q || Q.dead || Q.hp <= 0) { b.effects = b.effects.filter((e) => e !== q); return fail('The creature with the vibrations is down.'); }
      if (!canAttack(t)) return fail('Quivering Palm takes one attack of the Attack action, and you have none left.');
      useAttack(t, A);
      b.effects = b.effects.filter((e) => e !== q);
      const dc = sumParts(A.focusDc);
      const sv = savingThrow(b, Q, 'con', dc);
      const rs = rollDice(b.rng, 10, 12);
      const full = sum(rs);
      const d = finishDamage(Q, [{ label: 'Quivering Palm 10d12', rolls: rs, value: sv.success ? Math.floor(full / 2) : full, rule: 'quivering-palm', type: 'Force' }]);
      const af = applyDamage(b, Q, d.total, { types: d.types, by: id });
      emit(b, { kind: 'action', by: id, target: Q.id, what: 'Quivering Palm', rule: 'quivering-palm',
        text: `${A.name} ends the vibrations (one attack). ${Q.name} makes a DC ${dc} Constitution save: ${sv.total}, ${sv.success ? 'a success, half of' : 'a failure:'} 10d12 (${rs.join(' + ')}) = ${d.total} Force damage${adjustText(d)}.${afterText(Q, af)}` });
      flushPost(b);
      checkOver(b);
      break;
    }
    case 'blink': {
      // Boon of Dimensional Travel: a 30-foot teleport after the Attack or Magic action.
      if (!A.blinkSteps) return fail('Blink Steps come from the Boon of Dimensional Travel.');
      if (!t.attackAction && !t.magicUsed) return fail('Blink Steps come right after you take the Attack action or the Magic action.');
      if (t.blinked) return fail('You have already used Blink Steps this turn.');
      const e = pointError(b, A, { mode: 'point', range: 30 }, intent.x, intent.y);
      if (e) return fail(e);
      t.blinked = true;
      const from = { x: A.x, y: A.y };
      A.x = intent.x; A.y = intent.y;
      if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
      emit(b, { kind: 'move', by: A.id, path: [{ x: A.x, y: A.y }], feet: 0, left: t.moveLeft, teleport: true, from, rule: 'boon-of-dimensional-travel',
        text: `${A.name} uses Blink Steps and teleports ${cheb(from, A) * FT} ft. Teleporting doesn't provoke Opportunity Attacks.` });
      tidy(b);
      break;
    }
    case 'innate': {
      if (!A.innate) return fail('Only a Sorcerer has Innate Sorcery.');
      if (A.innateOn) return fail('Innate Sorcery is already active.');
      const incarnate = A.innate.uses < 1 && A.incarnate && A.sorcery?.uses >= 2;
      if (A.innate.uses < 1 && !incarnate) return fail(A.incarnate ? 'No Innate Sorcery uses left, and Sorcery Incarnate needs 2 Sorcery Points.' : 'No Innate Sorcery uses left. They come back on a Long Rest.');
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      if (incarnate) A.sorcery.uses -= 2; else A.innate.uses--;
      A.innateOn = true;
      emit(b, { kind: 'action', by: id, what: 'Innate Sorcery', rule: incarnate ? 'sorcery-incarnate' : 'innate-sorcery',
        text: `${A.name} unleashes Innate Sorcery (${incarnate ? `Sorcery Incarnate: 2 Sorcery Points, ${A.sorcery.uses} left` : s1(A.innate.uses, 'use') + ' left'}): +1 to Sorcerer spell save DCs and Advantage on Sorcerer spell attack rolls for 1 minute.` });
      break;
    }
    case 'font': {
      if (!A.sorcery) return fail('Font of Magic comes at Sorcerer level 2.');
      const lv = intent.level | 0 || 1;
      if (intent.mode === 'burn') {
        const sl = A.casting?.slots?.[lv];
        if (!sl || sl.left < 1) return fail(`No level ${lv} spell slot to turn into Sorcery Points.`);
        if (A.sorcery.uses >= A.sorcery.max) return fail('Your Sorcery Points are already full.');
        sl.left--;
        const got = Math.min(lv, A.sorcery.max - A.sorcery.uses);
        A.sorcery.uses += got;
        emit(b, { kind: 'action', by: id, what: 'Font of Magic', rule: 'font-of-magic',
          text: `${A.name} turns a level ${lv} spell slot into ${s1(got, 'Sorcery Point')} (no action; ${A.sorcery.uses} now).` });
        break;
      }
      const cost = SLOT_COST[lv];
      if (!cost || A.level < SLOT_MIN_LEVEL[lv]) return fail(`You can make a spell slot of level 1 to ${Math.max(...Object.keys(SLOT_MIN_LEVEL).filter((k) => A.level >= SLOT_MIN_LEVEL[k]))} (level 3 at Sorcerer level 5, 4 at 7, 5 at 9).`);
      if (A.sorcery.uses < cost) return fail(`A level ${lv} slot costs ${cost} Sorcery Points; you have ${A.sorcery.uses}.`);
      err = needBonus(); if (err) return fail(err);
      t.bonus = 0;
      A.sorcery.uses -= cost;
      A.casting.slots[lv] ||= { max: 0, left: 0 };
      A.casting.slots[lv].left++;
      emit(b, { kind: 'action', by: id, what: 'Font of Magic', rule: 'font-of-magic',
        text: `${A.name} turns ${cost} Sorcery Points into a level ${lv} spell slot (Bonus Action; ${A.sorcery.uses} points left).` });
      break;
    }
    case 'exhale': {
      const e = effectOn(b, 'dbreath', id);
      if (!e) return fail("Only a creature with Dragon's Breath can exhale.");
      err = magic(); if (err) return fail(err);
      if (!Number.isInteger(intent.x) || !Number.isInteger(intent.y) || (intent.x === A.x && intent.y === A.y)) return fail('Pick a direction.');
      t.action--; t.magicUsed = true;
      const area = { shape: 'cone', size: 15, from: 'self' };
      areaSave(b, A, areaTargets(b, A, area, intent.x, intent.y), { name: `Dragon's Breath (${e.dmgType}, 15-ft Cone)`, ability: 'dex', dcParts: e.dcParts, dice: e.dice, type: e.dmgType, half: true, rule: 'dragons-breath' });
      break;
    }
    case 'wholeness': {
      if (!A.wholeness) return fail('Wholeness of Body comes at Monk level 6 (Warrior of the Open Hand).');
      if (A.wholeness.uses < 1) return fail('No Wholeness of Body uses left. They come back on a Long Rest.');
      err = needBonus(); if (err) return fail(err);
      if (A.hp >= A.hpMax) return fail("You're at full Hit Points.");
      t.bonus = 0;
      A.wholeness.uses--;
      const md = parseDice(A.martialDie || '1d6').sides;
      const r = die(b.rng, md);
      const w = Math.max(1, A.mods.wis);
      emit(b, { kind: 'action', by: id, what: 'Wholeness of Body', rule: 'wholeness-of-body', text: `${A.name} uses Wholeness of Body (Bonus Action; ${s1(A.wholeness.uses, 'use')} left).` });
      heal(b, A, A, Math.max(1, r + w), 'Wholeness of Body', 'wholeness-of-body', { label: `1d${md}`, rolls: [r] }, [{ label: 'WIS modifier', value: w }], md + w);
      break;
    }
    case 'tireless': {
      if (!A.tireless) return fail('Tireless comes at Ranger level 10.');
      if (A.tireless.uses < 1) return fail('No Tireless uses left. They come back on a Long Rest.');
      err = magic(); if (err) return fail(err);
      t.action--; t.magicUsed = true;
      A.tireless.uses--;
      const r = die(b.rng, 8);
      const amount = r + Math.max(1, A.mods.wis);
      const had = A.tempHp || 0;
      A.tempHp = Math.max(had, amount);
      emit(b, { kind: 'action', by: id, what: 'Tireless', rule: 'tireless',
        text: `${A.name} uses Tireless (${s1(A.tireless.uses, 'use')} left): 1d8 (${r}) + ${Math.max(1, A.mods.wis)} = ${amount} Temporary Hit Points${had >= amount ? `, but already has ${had}, and they don't stack` : ''}.` });
      break;
    }
    case 'abjure': {
      if (!A.abjure) return fail('Abjure Foes comes at Paladin level 9.');
      if (!A.channel || A.channel.uses < 1) return fail('No Channel Divinity uses left.');
      err = magic(); if (err) return fail(err);
      const n = Math.max(1, A.mods.cha);
      const ok = (X) => X && hostile(A, X) && !X.dead && X.hp > 0 && onBoard(X) && feetBetween(A, X) <= 60 && lineOfSight(b, A, X) && !hasCond(X, 'hidden');
      let list = (intent.targets || []).map((x) => C(b, x)).filter(ok);
      if (!list.length) list = enemiesOf(b, A).filter(ok).filter((X) => !hasCond(X, 'frightened')).sort((p, q) => (q.hp + 10 * (q.multiattack || 1)) - (p.hp + 10 * (p.multiattack || 1)));
      list = [...new Set(list)].slice(0, n);
      if (!list.length) return fail('No enemy you can see within 60 feet.');
      t.action--; t.magicUsed = true;
      A.channel.uses--;
      if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
      const dcParts = A.casting.stats.cha.dc;
      const dc = sumParts(dcParts);
      const results = [];
      for (const X of list) {
        const sv = savingThrow(b, X, 'wis', dc, { cond: 'frightened' });
        const got = !sv.success && addCond(b, X, { id: 'frightened', by: id, endsOnDamage: true, abjured: true, rule: 'abjure-foes' });
        results.push({ ...sv, damage: 0, text: `${X.name} ${sv.success ? 'succeeds' : 'fails'} (${sv.total})${sv.success ? '' : got ? ': Frightened until it takes damage, and on its turns it can move, act or take a Bonus Action, only one' : ", but it can't be Frightened"}.` });
      }
      emit(b, { kind: 'save-spell', by: id, what: 'Abjure Foes', ability: 'wis', dc, dcParts, damage: null, half: false, results, rule: 'abjure-foes',
        text: `${A.name} uses Channel Divinity: Abjure Foes (${s1(A.channel.uses, 'use')} left). DC ${dc} Wisdom save for ${list.map((X) => X.name).join(', ')}.` });
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
  if (A.raging && (intent.a === 'shove' || intent.a === 'breath')) A.raging.kept = true;
  // Horde Breaker (Hunter 3): once per turn, a second attack with the same
  // weapon at another creature within 5 feet of the first target.
  if (intent.a === 'attack' && A.prey === 'horde' && A.hordeKey !== turnKey(b) && !b.over && !b.pending && b.turn === t && T) {
    const atk = A.attacks.find((a) => a.id === intent.attack);
    const next = enemiesOf(b, A).find((X) => X !== T && cheb(X, T) <= 1 && !(t.attacked || []).includes(X.id) && canTarget(b, A, X, atk).ok);
    if (next) {
      A.hordeKey = turnKey(b);
      emit(b, { kind: 'note', by: id, text: `Horde Breaker: ${A.name} attacks ${next.name}, next to ${T.name}, with the same weapon.`, rule: 'horde-breaker' });
      attack(b, A, next, atk);
    }
  }
  // Cleave (weapon mastery): once per turn, a hit with a melee attack lets you
  // attack a second creature within 5 feet of the first and within your reach,
  // without your ability modifier on its damage.
  if (intent.a === 'attack' && !intent.offhand && A.cleaveKey !== turnKey(b) && !b.over && !b.pending && b.turn === t && T) {
    const atk = A.attacks.find((a) => a.id === intent.attack);
    const hit = b.log.some((r) => r.seq > before && r.kind === 'attack' && r.by === id && r.target === T.id && (r.outcome === 'hit' || r.outcome === 'crit'));
    if (atk?.mastery === 'cleave' && atk.kind === 'melee' && hit) {
      const next = enemiesOf(b, A).find((X) => X !== T && cheb(X, T) <= 1 && canTarget(b, A, X, atk).ok);
      if (next) {
        A.cleaveKey = turnKey(b);
        emit(b, { kind: 'note', by: id, text: `Cleave: ${A.name} swings on into ${next.name}, next to ${T.name}.`, rule: 'mastery-cleave' });
        attack(b, A, next, { ...atk, name: `${atk.name} (Cleave)`, dmgFlat: atk.dmgFlat.filter((p) => p.rule !== 'damage' || p.value < 0) });
      }
    }
  }
  t.steps++;

  return { ok: true, records: b.log.filter((r) => r.seq > before) };
}

export { signed, enemiesOf, alliesOf };
