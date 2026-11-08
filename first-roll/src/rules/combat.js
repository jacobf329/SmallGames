// The combat rules engine. Pure: no DOM, no network, no clock. All state is
// one JSON-able battle object; every resolution is appended to battle.log as
// a record that says what was rolled, what was added and which rule applied.
// Those records are what the UI explains and what the room broadcasts.

import { makeRng, die, rollDice, sum, parseDice, avgDice } from './rng.js';
import {
  key, cheb, feetBetween, incap, down, helpless, hasCond, condOf, hostile, onBoard, reachMap, canEndAt,
  pathFrom, coneSquares, cubeSquares, lineOfSight, coverBetween, occupantAt, inBounds, blocked, FT,
  lineSquares, squaresWithin, cubeAt, isWall,
} from './grid.js';
import { setMageArmor } from './character.js';
import { MASTERIES, SPELLS, ABILITY_NAMES, signed } from './data.js';

// ------------------------------------------------------------- set-up ----

export function createBattle({ heroes, foes, walls = [], cover = [], seed = 1 }) {
  const creatures = {};
  for (const c of [...heroes, ...foes]) {
    c.conds ||= [];
    creatures[c.id] = c;
  }
  return {
    creatures, walls: [...walls], cover: [...cover], rng: makeRng(seed),
    order: [], idx: -1, round: 0, turn: null,
    effects: [], log: [], seq: 0, post: [],
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
const sumParts = (parts) => sum(parts.map((p) => p.value));
const SIZE = { tiny: 0, small: 1, medium: 2, large: 3, huge: 4 };
const s1 = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const COND_NAMES = {
  prone: 'Prone', restrained: 'Restrained', grappled: 'Grappled', frightened: 'Frightened', poisoned: 'Poisoned',
  paralyzed: 'Paralyzed', incapacitated: 'Incapacitated', unconscious: 'Unconscious', hidden: 'Hidden (Invisible)',
  commanded: 'Commanded',
};

// --------------------------------------------------------- conditions ----

export function addCond(b, T, cond) {
  if (T.condImmune?.includes(cond.id)) return false;
  T.conds = (T.conds || []).filter((x) => !(x.id === cond.id && x.by === cond.by));
  T.conds.push(cond);
  if (incap(T) && T.conc) endConc(b, T, `${T.name} is ${COND_NAMES[cond.id]}`);
  if (incap(T) && hasCond(T, 'hidden')) dropCond(T, 'hidden');
  return true;
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
  if (b.effects.some((e) => e.type === 'stride' && e.target === c.id)) s += 10;
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
  b.effects = b.effects.filter((e) => e.conc !== A.id);
  for (const c of Object.values(b.creatures)) {
    if (c.conds?.some((x) => x.conc === A.id)) c.conds = c.conds.filter((x) => x.conc !== A.id);
    if (c.aidFrom === A.id) c.aidFrom = null;
  }
  emit(b, { kind: 'note', by: A.id, text: `${A.name}'s ${sp.name} ends: ${why}.`, rule: 'concentration' });
}

// After a hit: Concentration saves, effects that end on damage. Queued in
// b.post during the hit so they come after the hit in the log.
function flushPost(b) {
  const jobs = b.post;
  b.post = [];
  for (const j of jobs) {
    const T = C(b, j.id);
    if (!T || T.dead) { if (T?.conc) endConc(b, T, `${T.name} is defeated`); continue; }
    if (j.kind === 'retaliate') { retaliate(b, T, C(b, j.by)); continue; }
    if (j.kind === 'hurt') {
      const gone = T.conds.filter((x) => x.endsOnDamage);
      if (gone.length) {
        T.conds = T.conds.filter((x) => !x.endsOnDamage);
        emit(b, { kind: 'note', by: T.id, text: `Taking damage ends ${T.name}'s ${[...new Set(gone.map((x) => COND_NAMES[x.id]))].join(' and ')}.`, rule: gone[0].rule || 'turn-undead' });
      }
      if (T.conc && incap(T)) endConc(b, T, `${T.name} is Incapacitated`);
      else if (T.conc) {
        const dc = Math.min(30, Math.max(10, Math.floor(j.dmg / 2)));
        const sv = savingThrow(b, T, 'con', dc);
        emit(b, { kind: 'save', save: 'concentration', by: T.id, ...sv, dc, outcome: sv.success ? 'success' : 'fail', rule: 'concentration',
          text: `${T.name} makes a Concentration save (DC ${dc}: 10 or half the damage, whichever is higher): ${sv.total}, ${sv.success ? 'keeps concentrating' : 'loses it'}.` });
        if (!sv.success) endConc(b, T, 'failed the Concentration save');
      }
    }
  }
  tidy(b);
}

// Reactions to being damaged: Storm's Thunder (Goliath) and Hellish Rebuke
// (a Tiefling's free cast). Used automatically when they can be.
function retaliate(b, T, X) {
  if (!X || X.dead || !onBoard(X) || T.dead || T.hp <= 0 || incap(T) || !T.reaction || b.over) return;
  if (feetBetween(T, X) > 60 || !lineOfSight(b, T, X)) return;
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
const blessAvg = (b, c) => (b.effects.some((e) => e.type === 'bless' && e.target === c.id) ? 2.5 : 0);

// A saving throw: d20 + ability modifier (+ PB if proficient) vs a DC.
export function saveFactors(b, T, ability, { cond = null } = {}) {
  const adv = [], dis = [];
  if (ability === 'dex' && b.effects.some((e) => e.type === 'dodge' && e.by === T.id) && !incap(T)) adv.push({ text: `${T.name} is Dodging`, rule: 'dodge' });
  if (T.mentalSaveAdv && ['int', 'wis', 'cha'].includes(ability)) adv.push({ text: 'Gnomish Cunning', rule: 'saving-throws' });
  if (ability === 'dex' && hasCond(T, 'restrained')) dis.push({ text: `${T.name} is Restrained`, rule: 'restrained' });
  if (cond === 'poisoned' && T.poisonSaveAdv) adv.push({ text: 'Dwarven Resilience', rule: 'poisoned' });
  if (cond === 'frightened' && T.braveSaveAdv) adv.push({ text: 'Brave', rule: 'frightened' });
  return { adv, dis, mode: modeFrom(adv, dis) };
}

export function saveChance(b, T, ability, dc, extra = 0) {
  if (helpless(T) && (ability === 'str' || ability === 'dex')) return 0;
  const mod = (T.saves?.[ability] ?? T.mods[ability]) + sumParts(testParts(T)) + blessAvg(b, T) + extra;
  const f = saveFactors(b, T, ability);
  let p = Math.min(20, Math.max(0, 21 - (dc - mod))) / 20;   // saves have no automatic 1/20
  if (f.mode === 'advantage') p = 1 - (1 - p) ** 2;
  if (f.mode === 'disadvantage') p = p * p;
  return p;
}

// opts.cover: Half Cover from where the effect starts (+2 to Dexterity saves).
function savingThrow(b, T, ability, dc, { cover = null, cond = null } = {}) {
  const f = saveFactors(b, T, ability, { cond });
  // Paralyzed and Unconscious creatures automatically fail STR and DEX saves.
  if (helpless(T) && (ability === 'str' || ability === 'dex')) {
    const why = down(T) ? 'Unconscious' : hasCond(T, 'paralyzed') ? 'Paralyzed' : 'Unconscious';
    return { target: T.id, auto: 'fail', success: false, mods: [], total: 0, d20: null, note: `${why}: automatically fails` };
  }
  const d20 = rollD20(b, T, f.mode);
  const mods = [{ label: `${ability.toUpperCase()} modifier`, value: T.mods[ability], rule: 'ability-modifier' }];
  if (T.saveProfs?.includes(ability)) mods.push({ label: 'Proficiency Bonus (proficient save)', value: T.pb, rule: 'proficiency' });
  if (cover && ability === 'dex') mods.push({ label: `Half Cover (${cover.what})`, value: 2, rule: 'cover' });
  mods.push(...testParts(T));
  const bl = blessPart(b, T);
  if (bl) mods.push(bl);
  let total = d20.kept + sumParts(mods);
  if (total < dc && T.side === 'hero') {
    if (inspire(b, T, d20)) total = d20.kept + sumParts(mods);
  }
  return { target: T.id, d20: { ...d20, adv: f.adv, dis: f.dis }, mods, total, success: total >= dc };
}

// An ability check (escaping a grapple, hiding): d20 + skill vs DC.
function abilityCheck(b, A, skills, dc, { adv = [], dis = [] } = {}) {
  const best = skills.map((s) => ({ s, v: A.skills?.[s.id] ?? A.mods[s.ab] })).sort((p, q) => q.v - p.v)[0];
  if (hasCond(A, 'poisoned')) dis.push({ text: `${A.name} is Poisoned`, rule: 'poisoned' });
  const fr = frightBy(b, A);
  if (fr) dis.push({ text: `${A.name} is Frightened of ${fr.name}`, rule: 'frightened' });
  const mode = modeFrom(adv, dis);
  const d20 = rollD20(b, A, mode);
  const mods = [{ label: `${best.s.name}`, value: best.v, rule: 'skills' }, ...testParts(A)];
  const total = d20.kept + sumParts(mods);
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
  const cov = atk.ignoreCover ? null : coverBetween(b, A, T);
  if (cov) parts.push({ label: `Half Cover (${cov.what} in the way)`, value: 2, rule: 'cover' });
  return { value: sumParts(parts), parts, cover: cov };
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
    } else if (e.type === 'sap' && e.target === A.id) {
      dis.push({ text: `Sap: ${C(b, e.by).name} hit ${A.name} with a Sap weapon`, rule: 'mastery-sap' });
      uses.push(e);
    } else if (e.type === 'aim' && e.by === A.id) {
      adv.push({ text: 'Steady Aim', rule: 'steady-aim' });
      uses.push(e);
    } else if (e.type === 'outlined' && e.target === T.id) {
      if (!adv.some((x) => x.rule === 'faerie-fire')) adv.push({ text: `${T.name} is outlined by Faerie Fire`, rule: 'faerie-fire' });
    } else if (e.type === 'dodge' && e.by === T.id && !incap(T)) {
      dis.push({ text: `${T.name} is Dodging`, rule: 'dodge' });
    }
  }
  const near = cheb(A, T) <= 1;
  if (down(T)) adv.push({ text: `${T.name} is Unconscious`, rule: 'unconscious' });
  else if (hasCond(T, 'paralyzed')) adv.push({ text: `${T.name} is Paralyzed`, rule: 'paralyzed' });
  if (hasCond(T, 'restrained')) adv.push({ text: `${T.name} is Restrained`, rule: 'restrained' });
  if (hasCond(T, 'prone') && !down(T)) {
    if (near) adv.push({ text: `${T.name} is Prone and ${A.name} is within 5 feet`, rule: 'prone' });
    else dis.push({ text: `${T.name} is Prone and ${A.name} is farther than 5 feet`, rule: 'prone' });
  }
  if (hasCond(A, 'prone')) dis.push({ text: `${A.name} is Prone`, rule: 'prone' });
  if (hasCond(A, 'restrained')) dis.push({ text: `${A.name} is Restrained`, rule: 'restrained' });
  if (hasCond(A, 'poisoned')) dis.push({ text: `${A.name} is Poisoned`, rule: 'poisoned' });
  const fr = frightBy(b, A);
  if (fr) dis.push({ text: `${A.name} is Frightened of ${fr.name}`, rule: 'frightened' });
  const gr = condOf(A, 'grappled');
  if (gr && gr.by !== T.id) dis.push({ text: `${A.name} is Grappled and ${T.name} isn't the grappler`, rule: 'grappled' });
  if (hasCond(A, 'hidden')) adv.push({ text: `${A.name} is Hidden`, rule: 'hide' });
  if (A.packTactics && alliesOf(b, A).some((o) => !incap(o) && cheb(o, T) <= 1)) adv.push({ text: `Pack Tactics: an ally of ${A.name} is next to ${T.name}`, rule: 'pack-tactics' });
  if (atk.advIfGrappled && T.conds?.some((x) => x.id === 'grappled' && x.by === A.id)) adv.push({ text: `${T.name} is Grappled by ${A.name}`, rule: 'grappled' });
  if (atk.kind === 'ranged') {
    const close = enemiesOf(b, A).filter((e) => !incap(e) && cheb(e, A) <= 1);
    if (close.length) dis.push({ text: `Ranged attack with ${close[0].name} next to ${A.name}`, rule: 'ranged-in-melee' });
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
export function damageMult(T, type) {
  if (T.immune?.includes(type)) return 0;
  let m = 1;
  if (T.resist?.includes(type)) m /= 2;
  if (T.vuln?.includes(type)) m *= 2;
  return m;
}

// Options for the UI and the AI: every weapon attack A could make against T now.
export function attackOptions(b, A, T) {
  return A.attacks.map((atk) => optionFor(b, A, T, atk));
}

function optionFor(b, A, T, atk) {
  const f = attackFactors(b, A, T, atk);
  const can = canTarget(b, A, T, atk);
  const bonus = hitBonus(atk) + sumParts(testParts(A)) + blessAvg(b, A);
  const ac = acAgainst(b, A, T, atk);
  const p = hitChance(bonus, ac.value, f.mode, A.luck);
  const sneak = sneakAllowed(b, A, T, atk, f.mode);
  let avg = (avgDice(atk.dice) + sumParts(atk.dmgFlat)) * damageMult(T, atk.type);
  for (const x of atk.extra || []) avg += (x.dice ? avgDice(x.dice) : x.flat) * damageMult(T, x.type);
  if (sneak) avg += avgDice(A.sneak) * damageMult(T, atk.type);
  if (atk.advDice && f.mode === 'advantage') avg += avgDice(atk.advDice);
  return {
    atk, ok: can.ok, why: can.why || null, bonus, ac: ac.value, cover: ac.cover, p, mode: f.mode, adv: f.adv, dis: f.dis, sneak, avg,
    expected: can.ok ? p * avg : 0,
  };
}

function rollDamage(b, A, T, atk, crit, mode) {
  const { n, sides } = parseDice(atk.dice);
  const nd = crit ? n * 2 : n;
  const parts = [];
  let rolls = rollDice(b.rng, nd, sides);
  let gwf = null;
  const raise = (rs) => (atk.gwf ? rs.map((v) => (v < 3 ? 3 : v)) : rs);
  if (atk.gwf && rolls.some((v) => v < 3)) gwf = `Great Weapon Fighting: ${rolls.join('+')}, 1s and 2s count as 3`;
  rolls = raise(rolls);
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
    gwf,
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
  if (sneakWhy) { extra(`Sneak Attack (${sneakWhy})`, A.sneak, 'sneak-attack', atk.type); A.sneakKey = turnKey(b); }
  if (atk.advDice && mode === 'advantage') extra('Extra (attacked with Advantage)', atk.advDice, 'stat-block', atk.type);
  if (A.giant?.uses > 0 && A.giantKey !== turnKey(b) && (A.giant.kind === 'fire' || A.giant.kind === 'frost')) {
    if (A.giant.kind === 'fire') extra("Fire's Burn", '1d10', 'giant-ancestry', 'Fire');
    else extra("Frost's Chill", '1d6', 'giant-ancestry', 'Cold');
    A.giant.uses--;
    A.giantKey = turnKey(b);
    parts.frost = A.giant.kind === 'frost';
  }
  const out = finishDamage(T, parts);
  out.frost = !!parts.frost;
  return out;
}

// Total the parts per damage type, applying T's Resistances, Vulnerabilities
// and Immunities to each type once.
function finishDamage(T, parts) {
  const byType = {};
  for (const p of parts) byType[p.type] = (byType[p.type] || 0) + p.value;
  const adjust = [];
  let total = 0;
  for (const [type, raw] of Object.entries(byType)) {
    const v = Math.max(0, raw);
    const m = damageMult(T, type);
    const got = Math.floor(v * m);
    if (m !== 1) adjust.push({ type, from: v, to: got, why: m === 0 ? 'Immunity' : m < 1 ? 'Resistance (half)' : 'Vulnerability (double)', rule: m === 0 ? 'immunity' : m < 1 ? 'resistance' : 'vulnerability' });
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
  if (T.hp > 0) {
    const left = T.hp - amount;
    if (left > 0) { T.hp = left; out.after = left; return out; }
    T.hp = 0;
    out.after = 0;
    if (T.undeadFortitude && !crit && !(meta.types || []).includes('Radiant')) {
      const dc = 5 + amount;
      const sv = savingThrow(b, T, 'con', dc);
      out.fortitude = { dc, total: sv.total, success: sv.success, d20: sv.d20, mods: sv.mods };
      if (sv.success) { T.hp = 1; out.after = 1; return out; }
    }
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
    dropCond(T, 'hidden');
    if (!hasCond(T, 'prone')) T.conds.push({ id: 'prone', why: 'fell Unconscious' });
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
  if (after.stone) return ` ${T.name} uses Stone's Endurance (Reaction): 1d12 (${after.stone.roll}) ${signed(T.mods.con)} = ${after.stone.cut} less damage, so ${Math.max(0, after.stone.from - after.stone.cut)} gets through.${afterText(T, { ...after, stone: null })}`;
  if (after.fortitude?.success) return ` ${T.name} should drop, but Undead Fortitude holds it up: CON save ${after.fortitude.total} vs DC ${after.fortitude.dc}, 1 HP left.`;
  let pre = '';
  if (after.fortitude) pre = ` Undead Fortitude fails (CON save ${after.fortitude.total} vs DC ${after.fortitude.dc}).`;
  if (after.dead) return `${pre}${T.side === 'foe' ? ` ${T.name} is defeated.` : ` ${T.name} dies.`}`;
  if (after.relentless) return ` ${T.name} drops to 1 HP instead of 0 (Relentless Endurance).`;
  if (after.downed) return ` ${T.name} drops to 0 HP and falls Unconscious.`;
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

function attack(b, A, T0, atk, { reaction = false } = {}) {
  const T = redirect(b, A, T0);
  if (T !== T0 && !inRange(A, T, atk)) {
    emit(b, { kind: 'note', by: A.id, text: `${T.name} is out of reach: the attack is lost.`, rule: 'redirect-attack' });
    return;
  }
  if (hasCond(A, 'hidden')) { dropCond(A, 'hidden'); A.revealed = true; }
  const f = attackFactors(b, A, T, atk);
  if (A.revealed) { f.adv.push({ text: `${A.name} attacked from hiding`, rule: 'hide' }); f.mode = modeFrom(f.adv, f.dis); A.revealed = false; }
  b.effects = b.effects.filter((e) => !f.uses.includes(e));
  const d20 = rollD20(b, A, f.mode);
  const mods = [...atk.hit, ...testParts(A)];
  const bl = blessPart(b, A);
  if (bl) mods.push(bl);
  const ctx = { a: A.id, t: T.id, atk, d20: { ...d20, adv: f.adv, dis: f.dis }, mode: f.mode, mods, reaction };
  const ac = acAgainst(b, A, T, atk);
  let total = d20.kept + sumParts(mods);
  if (A.side === 'hero' && d20.kept < critOn(A, atk) && (d20.kept === 1 || total < ac.value)) {
    if (inspire(b, A, ctx.d20)) total = ctx.d20.kept + sumParts(mods);
  }
  ctx.total = total;
  if (d20.kept < critOn(A, atk) && ctx.d20.kept !== 1 && total >= ac.value && shieldWorks(b, T, total, ac.value, ctx.d20.kept)) {
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
  const ac = acAgainst(b, A, T, atk);
  let outcome;
  if (d20.kept >= critOn(A, atk)) outcome = 'crit';
  else if (d20.kept === 1) outcome = 'fumble';
  else outcome = total >= ac.value ? 'hit' : 'miss';
  const notes = [];
  if (d20.kept >= 19 && d20.kept < 20 && outcome === 'crit') notes.push({ text: 'Improved Critical: a 19 is a Critical Hit too', rule: 'improved-critical' });
  if (outcome === 'hit' && helpless(T) && cheb(A, T) <= 1) {
    outcome = 'crit';
    notes.push({ text: `Any hit from within 5 feet on a${hasCond(T, 'paralyzed') && !down(T) ? ' Paralyzed' : 'n Unconscious'} creature is a Critical Hit`, rule: hasCond(T, 'paralyzed') && !down(T) ? 'paralyzed' : 'unconscious' });
  }
  if (d20.inspired) notes.push({ text: `Heroic Inspiration: rerolled the ${d20.inspired.from}, got ${d20.inspired.to}`, rule: 'heroic-inspiration' });
  const hit = outcome === 'hit' || outcome === 'crit';
  let damage = null, after = null, mastery = null, rider = null;
  if (hit) {
    damage = rollDamage(b, A, T, atk, outcome === 'crit', ctx.mode);
    after = applyDamage(b, T, damage.total, { crit: outcome === 'crit', types: damage.types, by: A.id });
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
      rider = { text: `${T.name}'s Speed drops by 10 feet until the start of ${A.name}'s next turn.`, rule: 'ray-of-frost' };
    }
    if (atk.rider?.prone && alive && SIZE[T.size || 'medium'] <= SIZE[atk.rider.prone] && !hasCond(T, 'prone')) {
      if (addCond(b, T, { id: 'prone', by: A.id })) rider = { text: `${T.name} is knocked Prone.`, rule: 'prone' };
    }
    if (atk.rider?.grapple && alive && SIZE[T.size || 'medium'] <= SIZE[atk.rider.size || 'medium'] && !T.conds.some((x) => x.id === 'grappled' && x.by === A.id)) {
      if (addCond(b, T, { id: 'grappled', by: A.id, dc: atk.rider.grapple, reach: atk.reach || 5 })) {
        rider = { text: `${T.name} is Grappled (escape DC ${atk.rider.grapple}): Speed 0, and Disadvantage on attacks against anyone but ${A.name}.`, rule: 'grappled' };
      }
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
  text += ctx.reaction ? ' (Opportunity Attack).' : '.';
  text += afterText(T, after);
  if (rider && hit) text += ` ${rider.text}`;
  emit(b, {
    kind: 'attack', by: A.id, target: T.id, weapon: atk.name, attackKind: atk.kind, spell: atk.spell || null, reaction: ctx.reaction,
    d20, mods: ctx.mods, total, ac: ac.value, acParts: ac.parts,
    outcome, notes, damage, after, mastery, rider, text,
    rule: ctx.reaction ? 'opportunity-attack' : atk.spell ? 'spell-attack' : 'attack-roll',
  });
  flushPost(b);
  checkOver(b);
}

// ---------------------------------------------------------------- spells ----

export function spellAttack(A, sid, opts = {}) {
  const s = SPELLS[sid];
  const k = A.casting.known[sid];
  return {
    id: sid, name: s.name, kind: opts.melee ? 'melee' : 'ranged', dice: opts.dice || s.dice, type: s.type, range: [s.range, s.range],
    reach: opts.melee ? 5 : undefined, hit: A.casting.stats[k.ability].attack, dmgFlat: opts.flat || [], spell: sid, rider: s.rider || null, finesse: false,
  };
}

export const spellDC = (A, sid) => sumParts(A.casting.stats[A.casting.known[sid].ability].dc);
export const spellMod = (A, sid) => A.mods[A.casting.known[sid].ability];

// What a spell does when cast with a slot of this level (2024 "Using a Higher-Level Spell Slot").
export function scaled(sid, slot) {
  const s = SPELLS[sid];
  const k = Math.max(0, (slot || s.level) - s.level);
  const up = s.up || {};
  let dice = s.dice;
  if (dice && up.dice && k) {
    const a = parseDice(dice), u = parseDice(up.dice);
    dice = `${a.n + u.n * k}d${a.sides}`;
  }
  return {
    dice, darts: (s.darts || 0) + (up.darts || 0) * k, rays: (s.rays || 0) + (up.rays || 0) * k,
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

// Can A cast this spell right now? Returns { ok, error, pay: 'free'|'slot'|null, slot }.
export function canCast(b, A, sid, want = 0) {
  const k = A.casting?.known?.[sid];
  const s = SPELLS[sid];
  if (!k || !s) return { ok: false, error: "You don't know that spell." };
  if (s.kind === 'utility') return { ok: false, error: `${s.name} is for outside of fights.` };
  if (s.time === 'reaction') return { ok: false, error: `${s.name} is a Reaction: you're asked when an attack would hit you.` };
  const t = b.turn;
  if (!t || t.who !== A.id) return { ok: false, error: "It isn't your turn." };
  if (incap(A)) return { ok: false, error: `${A.name} can't act.` };
  if (s.time === 'bonus' ? !t.bonus : !t.action) return { ok: false, error: `You have already used your ${s.time === 'bonus' ? 'Bonus Action' : 'action'}.` };
  if (s.time === 'action' && t.magicUsed) return { ok: false, error: "Action Surge's extra action can't be used to cast a spell (the Magic action)." };
  if (s.level === 0) return { ok: true, pay: null, slot: 0 };
  if (k.free > 0 && !(want > s.level && slotFor(b, A, sid, want))) return { ok: true, pay: 'free', slot: s.level };
  if (k.perDay) return { ok: false, error: `No uses of ${s.name} left today.` };
  if (A.slotKey === turnKey(b)) return { ok: false, error: 'You can expend only one spell slot per turn.' };
  const lv = slotFor(b, A, sid, want);
  if (!lv) return { ok: false, error: want > s.level ? `No level ${want}+ spell slots left.` : 'No spell slots left.' };
  return { ok: true, pay: 'slot', slot: lv };
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
export const coneTargets = (b, A, x, y, size = 3) => areaTargets(b, A, { shape: 'cone', size: size * FT, from: 'self' }, x, y);
export const cubeTargets = (b, A, x, y) => areaTargets(b, A, { shape: 'cube', size: 15, from: 'self' }, x, y);
export const BREATH_AREAS = { cone: { shape: 'cone', size: 15, from: 'self' }, line: { shape: 'line', size: 30, from: 'self' } };

// How a spell is aimed. mode: self | creature | split | group | point | area | none.
// who: 'other' (any creature but you), 'any' (you too), 'dying'.
export function spellAim(sid, slot) {
  const s = SPELLS[sid];
  if (!s) return { mode: 'none', range: 0 };
  const sc = scaled(sid, slot || s.level);
  const range = s.touch ? 5 : s.range || 0;
  switch (s.kind) {
    case 'temp': return { mode: 'self', range: 0 };
    case 'attack': case 'save': case 'spiritual': return { mode: 'creature', who: 'other', range };
    case 'heal': case 'cure': case 'armor': return { mode: 'creature', who: 'any', range };
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
  if (!X || X.dead || !onBoard(X)) return 'Pick a creature.';
  if (aim.who === 'other' && X === A) return `${s.name} can't target yourself.`;
  if (aim.who === 'dying' && (X.hp > 0 || X.stable)) return 'Pick a creature at 0 Hit Points that is not yet Stable.';
  if (X !== A) {
    if (hostile(A, X) && hasCond(X, 'hidden')) return `You don't know where ${X.name} is.`;
    if (feetBetween(A, X) > aim.range) return `${X.name} is out of range (${rangeText(aim.range)}).`;
    if (!lineOfSight(b, A, X)) return `You can't see ${X.name}: a wall is in the way.`;
  }
  if (s.only && X.creature !== s.only) return `${s.name} only works on a ${s.only[0].toUpperCase()}${s.only.slice(1)}.`;
  if (s.kind === 'armor') {
    if (hostile(A, X)) return 'Mage Armor needs a willing creature.';
    if (X.armorId !== 'none') return `${X.name} is wearing armor, so Mage Armor does nothing.`;
    if (X.mageArmor) return `${X.name} already has Mage Armor.`;
  }
  if (s.kind === 'cure' && !(X.conds || []).some((c) => s.cures.includes(c.id))) return `${X.name} has nothing ${s.name} can end.`;
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
  const aim = spellAim(sid, slot);
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
function areaSave(b, A, targets, { name, ability, dcParts, dice, type, half, rule, cantrip = false, ignoreCover = false, push: pushFt = 0, from = null }) {
  const dc = sumParts(dcParts);
  const { n, sides } = parseDice(dice);
  const rolls = rollDice(b.rng, n, sides);
  const full = sum(rolls);
  const results = [];
  for (const T of targets) {
    const cover = ignoreCover ? null : coverBetween(b, from || A, T);
    const sv = savingThrow(b, T, ability, dc, { cover });
    let raw = sv.success ? (half ? Math.floor(full / 2) : 0) : full;
    let potent = false;
    if (sv.success && cantrip && A.potentCantrip && !half) { raw = Math.floor(full / 2); potent = true; }
    const dmg = finishDamage(T, [{ label: name, value: raw, type }]);
    const after = applyDamage(b, T, dmg.total, { types: [type], by: A.id });
    let pushed = 0;
    if (!sv.success && pushFt && !T.dead && T.hp > 0) pushed = push(b, A, T, pushFt);
    results.push({
      ...sv, damage: dmg.total, adjust: dmg.adjust, after, pushed, potent,
      text: `${T.name} ${sv.success ? 'succeeds' : 'fails'}${sv.auto ? ' automatically' : ` (${sv.total})`}: ${dmg.total} damage${adjustText(dmg)}${potent ? ' (Potent Cantrip: half on a success)' : ''}${pushed ? `, pushed ${pushed} ft` : ''}.${afterText(T, after)}`,
    });
  }
  const hits = results.map((r) => `${C(b, r.target).name} ${r.damage}`).join(', ');
  emit(b, {
    kind: 'save-spell', by: A.id, what: name, ability, dc, dcParts, damage: { parts: [{ label: `${name} ${dice}`, rolls, value: full, rule }], total: full, type },
    half, results, rule,
    text: targets.length ? `${A.name} uses ${name}: DC ${dc} ${ABILITY_NAMES[ability]} save. ${hits ? `Damage: ${hits}.` : ''}` : `${A.name} uses ${name}, but nobody is caught in it.`,
  });
  flushPost(b);
  checkOver(b);
}

// A save against a condition (Command, Hold Person, Web, Turn Undead).
function condSave(b, A, T, ability, dc, rule, cond = null) {
  const cover = ability === 'dex' ? coverBetween(b, A, T) : null;
  return savingThrow(b, T, ability, dc, { cover, cond });
}

function heal(b, A, T, amount, what, rule, roll, mods) {
  const before = T.hp;
  if (b.effects.some((e) => e.type === 'grave' && e.target === T.id)) {
    emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name} can't regain Hit Points right now (Chill Touch).`, rule: 'chill-touch' });
    return;
  }
  T.hp = Math.min(T.hpMax, T.hp + amount);
  if (before === 0 && T.hp > 0) { T.deathSaves = { s: 0, f: 0 }; T.stable = false; }
  emit(b, { kind: 'heal', by: A.id, target: T.id, what, roll, mods, total: amount, before, after: T.hp,
    text: `${T.name} regains ${T.hp - before} HP${before === 0 && T.hp > 0 ? ' and is conscious again (still Prone)' : ''}.`, rule });
}

function castSpell(b, A, intent) {
  const sid = intent.spell;
  const s = SPELLS[sid];
  const can = canCast(b, A, sid, intent.slot | 0);
  if (!can.ok) return can.error;
  const sc = scaled(sid, can.slot);
  // Targets first, so a bad tap never costs a slot.
  const aim = checkAim(b, A, sid, intent, can.slot);
  if (aim.error) return aim.error;
  const targets = aim.targets.map((id) => C(b, id));
  const T = targets[0] || null;

  // Pay.
  const t = b.turn;
  if (s.time === 'bonus') t.bonus = 0; else { t.action--; t.magicUsed = true; }
  let paid = '';
  if (can.pay === 'free') {
    A.casting.known[sid].free--;
    const k = A.casting.known[sid];
    paid = k.perDay ? ` (${k.free} use${k.free === 1 ? '' : 's'} left today)` : ` (free cast${k.freeWhy ? `: ${k.freeWhy}` : ''})`;
  }
  if (can.pay === 'slot') {
    A.casting.slots[can.slot].left--;
    A.slotKey = turnKey(b);
    paid = ` (level ${can.slot} spell slot${can.slot > s.level ? `, cast at a higher level` : ''}; ${A.casting.slots[can.slot].left} left)`;
  }
  if (hasCond(A, 'hidden')) dropCond(A, 'hidden');
  emit(b, { kind: 'cast', by: A.id, spell: sid, level: s.level, slot: can.slot, pay: can.pay, rule: s.level ? 'spell-slots' : 'cantrips',
    targets: aim.targets, point: aim.point || null,
    text: `${A.name} casts ${s.name}${s.level === 0 ? ' (a cantrip: no slot needed)' : paid}.` });
  if (s.conc) startConc(b, A, sid);
  const dcParts = A.casting.stats[A.casting.known[sid].ability].dc;
  const dc = sumParts(dcParts);
  const names = (list) => list.map((X) => X.name).join(', ');

  switch (s.kind) {
    case 'attack': attack(b, A, T, { ...spellAttack(A, sid, { melee: !!s.melee }), dice: sc.dice }); break;
    case 'save': areaSave(b, A, [T], { name: s.name, ability: s.save, dcParts, dice: sc.dice, type: s.type, half: !!s.half, rule: sid, cantrip: s.level === 0, ignoreCover: !!s.noCover }); break;
    case 'area': {
      const from = s.area.from === 'self' ? A : aim.point;
      if (s.effect) {
        const results = [];
        let caught = 0;
        for (const X of targets) {
          const cover = coverBetween(b, from, X);
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
        areaSave(b, A, targets, { name: s.name, ability: s.save, dcParts, dice: sc.dice, type: s.type, half: !!s.half, rule: sid, push: s.push || 0, ignoreCover: !!s.noCover, from });
      }
      break;
    }
    case 'missile': {
      const sides = parseDice(s.dice).sides;
      const per = new Map();
      for (const X of targets) {
        const r = rollDice(b.rng, 1, sides);
        if (!per.has(X.id)) per.set(X.id, []);
        per.get(X.id).push({ rolls: r, value: r[0] + sc.flat });
      }
      for (const [id, darts] of per) {
        const X = C(b, id);
        if (X.dead || !onBoard(X)) continue;
        const raw = sum(darts.map((d) => d.value));
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
      for (const X of targets) {
        if (b.over || !X || X.dead || !onBoard(X)) continue;
        attack(b, A, X, spellAttack(A, sid));
        if (b.pending) break;
      }
      break;
    }
    case 'heal': {
      const { n, sides } = parseDice(sc.dice);
      const rolls = rollDice(b.rng, n, sides);
      const mods = [{ label: 'Spellcasting modifier', value: spellMod(A, sid) }];
      if (A.discipleOfLife && can.pay === 'slot') mods.push({ label: `Disciple of Life (2 + slot level ${can.slot})`, value: 2 + can.slot, rule: 'disciple-of-life' });
      const amount = Math.max(0, sum(rolls) + sumParts(mods));
      heal(b, A, T, amount, s.name, sid, { label: sc.dice, rolls }, mods);
      break;
    }
    case 'stabilize':
      T.stable = true;
      T.deathSaves = { s: 0, f: 0 };
      emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name} is Stable.`, rule: 'spare-the-dying' });
      break;
    case 'temp': {
      const { n, sides } = parseDice(sc.dice);
      const rolls = rollDice(b.rng, n, sides);
      const amount = sum(rolls) + sc.flat;
      const before = A.tempHp || 0;
      A.tempHp = Math.max(before, amount);
      emit(b, { kind: 'note', by: A.id, target: A.id, rule: 'temp-hp',
        text: `${s.name}: ${sc.dice} (${rolls.join(' + ')}) + ${sc.flat} = ${amount} Temporary Hit Points${before >= amount ? `, but ${A.name} already has ${before}, and they don't stack` : ''}.` });
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
        for (const X of targets) {
          b.effects = b.effects.filter((x) => !(x.type === s.buff && x.target === X.id));
          b.effects.push({ type: s.buff, by: A.id, target: X.id, conc: A.id, expires: { when: 'never' } });
        }
        emit(b, { kind: 'note', by: A.id, text: s.buff === 'bless'
          ? `${names(targets)}: +1d4 to attack rolls and saving throws while ${A.name} keeps Concentration.`
          : `${names(targets)}: +2 Armor Class while ${A.name} keeps Concentration.`, rule: sid });
      }
      break;
    }
    case 'cure': {
      const x = T.conds.find((y) => s.cures.includes(y.id) && (!intent.cond || y.id === intent.cond)) || T.conds.find((y) => s.cures.includes(y.id));
      T.conds = T.conds.filter((y) => y !== x);
      emit(b, { kind: 'note', by: A.id, target: T.id, text: `${T.name} is no longer ${COND_NAMES[x.id]}.`, rule: sid });
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
        const sv = condSave(b, A, X, 'wis', dc, sid);
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
        const sv = condSave(b, A, X, 'wis', dc, sid);
        if (!sv.success) { held++; addCond(b, X, { id: 'paralyzed', by: A.id, conc: A.id, saveEnds: { ability: 'wis', dc }, rule: 'hold-person' }); }
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
    default:
  }
  return null;
}

// A square next to T for a summoned weapon (it doesn't block anyone).
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
  const entries = Object.values(b.creatures).map((c) => {
    const adv = c.initAdv ? [{ text: 'Remarkable Athlete', rule: 'remarkable-athlete' }] : [];
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
  b.round = 1;
  emit(b, { kind: 'initiative', entries, text: surprised.length ? 'Everyone rolls Initiative. The surprised roll with Disadvantage.' : 'Everyone rolls Initiative.', rule: surprised.length ? 'surprise' : 'initiative' });
  b.idx = -1;
  nextTurn(b);
}

// Returns false if the creature loses this turn.
function startTurn(b, c) {
  expire(b, 'start', c.id);
  c.reaction = !incap(c);
  b.turn = { who: c.id, action: 1, bonus: 1, moveLeft: speedOf(b, c), moves: 0, steps: 0, attacksLeft: 0, magicUsed: false, surged: false };
  emit(b, { kind: 'turn', who: c.id, text: `${c.name}'s turn.`, rule: 'your-turn' });
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
  if (c.hp > 0 && helpless(c)) {
    emit(b, { kind: 'note', by: c.id, text: `${c.name} is Paralyzed and can't move or act this turn.`, rule: 'paralyzed' });
    return false;
  }
  return true;
}

// End of a creature's turn: repeat saves against conditions, then effects
// that end, then enemies get a look at anyone Hidden from them.
function endTurn(b, who) {
  const c = C(b, who);
  if (c && !c.dead) {
    for (const x of [...(c.conds || [])]) {
      if (!x.saveEnds) continue;
      const sv = savingThrow(b, c, x.saveEnds.ability, x.saveEnds.dc);
      const name = COND_NAMES[x.id];
      emit(b, { kind: 'save', save: 'condition', by: c.id, ...sv, dc: x.saveEnds.dc, outcome: sv.success ? 'success' : 'fail', rule: x.rule || x.id,
        text: `${c.name} repeats the ${ABILITY_NAMES[x.saveEnds.ability]} save against being ${name}: ${sv.total} vs DC ${x.saveEnds.dc}, ${sv.success ? `no longer ${name}` : `still ${name}`}.` });
      if (sv.success) c.conds = c.conds.filter((y) => y !== x);
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
  const d20 = rollD20(b, c, 'normal');
  const v = d20.kept;
  let outcome, text;
  if (v === 20) {
    c.hp = 1; c.deathSaves = { s: 0, f: 0 };
    outcome = 'revive'; text = `${c.name} rolls a 20 on a death save, regains 1 HP and is conscious again.`;
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
  for (let guard = 0; guard < 80 && !b.over; guard++) {
    if (b.turn) endTurn(b, b.turn.who);
    if (b.over) return;
    b.idx = (b.idx + 1) % b.order.length;
    if (b.idx === 0) { if (b.begun) b.round++; b.begun = true; }
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
    for (const c of Object.values(b.creatures)) if (c.conc) c.conc = null;
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
    && !b.effects.some((e) => e.type === 'shocked' && e.target === h.id)
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
  for (const to of path) {
    for (const h of provokers(b, M, from, to)) if (!oas.includes(h.id)) oas.push(h.id);
    from = to;
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
    const cost = occ ? 2 * FT : FT;
    M.x = to.x; M.y = to.y;
    b.turn.moveLeft -= cost;
    ctx.walked.push({ x: to.x, y: to.y });
    ctx.feet += cost;
    ctx.i++;
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

// The reactor's answer to a pending prompt: an Opportunity Attack, or Shield.
export function resolveReaction(b, accept) {
  const p = b.pending;
  if (!p) return [];
  const before = b.seq;
  b.pending = null;
  const R = C(b, p.reactor);
  if (p.kind === 'shield') {
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
      attack(b, R, M, atk, { reaction: true });
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
  return b.log.filter((r) => r.seq > before);
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

function useAttack(t, A) {
  if (t.attacksLeft > 0) { t.attacksLeft--; return null; }
  if (!t.action) return 'You have already used your action.';
  t.action--;
  t.attacksLeft = (A.multiattack || 1) - 1;
  return null;
}
export const canAttack = (t) => !!t && (t.action > 0 || t.attacksLeft > 0);

// The Hide action needs every enemy unable to see you. Who can?
export function seenBy(b, A) {
  return enemiesOf(b, A).filter((e) => !incap(e) && lineOfSight(b, e, A));
}

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

export function perform(b, id, intent) {
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
      useAttack(t, A);
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
      const g = condOf(A, 'grappled');
      if (!g) return fail("You aren't Grappled.");
      t.action--;
      const ck = abilityCheck(b, A, [{ id: 'athletics', ab: 'str', name: 'Strength (Athletics)' }, { id: 'acrobatics', ab: 'dex', name: 'Dexterity (Acrobatics)' }], g.dc);
      if (ck.success) dropCond(A, 'grappled', (x) => x === g);
      emit(b, { kind: 'check', by: id, skill: ck.skill, d20: ck.d20, mods: ck.mods, total: ck.total, dc: g.dc, outcome: ck.success ? 'success' : 'fail', rule: 'grappled',
        text: `${A.name} tries to escape the grapple: ${ck.skill} ${ck.total} vs DC ${g.dc}, ${ck.success ? 'free!' : 'still held'}.` });
      break;
    }
    case 'hide': {
      const bonus = !!intent.bonus;
      if (bonus && !(A.cunning || A.nimble)) return fail('Hiding takes your action.');
      err = bonus ? needBonus() : needAction(); if (err) return fail(err);
      const eyes = seenBy(b, A);
      if (eyes.length) return fail(`${eyes[0].name} can see you. To Hide you need to be out of every enemy's line of sight (behind a wall).`);
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
      if (!A.channel || A.channel.uses < 1) return fail('No Channel Divinity uses left.');
      err = magic(); if (err) return fail(err);
      if (!T || T.dead || !onBoard(T) || feetBetween(A, T) > 30 || !lineOfSight(b, A, T)) return fail('Pick a creature you can see within 30 feet.');
      const harm = hostile(A, T);
      t.action--; t.magicUsed = true;
      A.channel.uses--;
      const r = die(b.rng, 8);
      const mods = [{ label: 'WIS modifier', value: A.mods.wis, rule: 'ability-modifier' }];
      const amount = Math.max(0, r + A.mods.wis);
      emit(b, { kind: 'action', by: id, what: 'Divine Spark', text: `${A.name} uses Channel Divinity: Divine Spark (${s1(A.channel.uses, 'use')} left).`, rule: 'channel-divinity' });
      if (!harm) heal(b, A, T, amount, 'Divine Spark', 'channel-divinity', { label: '1d8', rolls: [r] }, mods);
      else {
        const dcParts = A.casting.stats.wis.dc;
        const dc = sumParts(dcParts);
        const sv = savingThrow(b, T, 'con', dc);
        const raw = sv.success ? Math.floor(amount / 2) : amount;
        const dmg = finishDamage(T, [{ label: 'Divine Spark', value: raw, type: 'Radiant' }]);
        const after = applyDamage(b, T, dmg.total, { types: ['Radiant'] });
        emit(b, { kind: 'save-spell', by: id, what: 'Divine Spark', ability: 'con', dc, dcParts, rule: 'channel-divinity', half: true,
          damage: { parts: [{ label: 'Divine Spark 1d8', rolls: [r], value: r }, ...mods], total: amount, type: 'Radiant' },
          results: [{ ...sv, damage: dmg.total, adjust: dmg.adjust, after, text: `${T.name} ${sv.success ? 'succeeds' : 'fails'} (${sv.total}): ${dmg.total} Radiant damage${adjustText(dmg)}.${afterText(T, after)}` }],
          text: `Divine Spark: DC ${dc} Constitution save. ${T.name} takes ${dmg.total} Radiant damage.` });
        flushPost(b);
        checkOver(b);
      }
      break;
    }
    case 'turn': {
      if (!A.channel || A.channel.uses < 1) return fail('No Channel Divinity uses left.');
      err = magic(); if (err) return fail(err);
      const undead = enemiesOf(b, A).filter((c) => c.creature === 'undead' && c.hp > 0 && feetBetween(A, c) <= 30);
      if (!undead.length) return fail('No Undead within 30 feet.');
      t.action--; t.magicUsed = true;
      A.channel.uses--;
      const dcParts = A.casting.stats.wis.dc;
      const dc = sumParts(dcParts);
      const results = [];
      for (const U of undead) {
        const sv = savingThrow(b, U, 'wis', dc, { cond: 'frightened' });
        if (!sv.success) {
          addCond(b, U, { id: 'frightened', by: id, turned: true, endsOnDamage: true, rule: 'turn-undead' });
          addCond(b, U, { id: 'incapacitated', by: id, turned: true, endsOnDamage: true, rule: 'turn-undead' });
        }
        results.push({ ...sv, damage: 0, text: `${U.name} ${sv.success ? 'resists' : 'is turned: Frightened and Incapacitated, it flees'} (${sv.total}).` });
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
