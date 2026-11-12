// Turns a hero's choices (a "spec") into a combat-ready creature. Every
// derived number keeps its parts ({ label, value, rule }) so the UI can show
// where it came from.
//
// spec = {
//   cls, species, background, name,
//   method: 'array' | 'pointbuy' | 'roll', scores: { str..cha }, rolls (for 'roll'),
//   plus: the background's increases ({ a: 2, b: 1 } or three +1s),
//   ancestry (dragonborn), lineage (elf, gnome, goliath, tiefling),
//   speciesAbility (int | wis | cha, for species spells), speciesSkill (human, elf),
//   bgFeat: { cantrips, spell, ability } (a background's Magic Initiate),
//   versatile: { feat, list, cantrips, spell, ability, skills } (human Origin feat),
//   skills (class picks), expertise (rogue, bard 2+, ranger 2+), style
//   (fighter; paladin and ranger 2+), warriorCantrips (Blessed or Druidic
//   Warrior), kit, masteries, order (cleric, druid), cantrips, book (wizard
//   spellbook), prepared, scholar (wizard 2+), invocations and pactWeapon
//   (warlock), metamagic (sorcerer 2+), land (druid 3), prey (ranger 3),
//   discoveries (bard 6), affinity (sorcerer 6), strikes (cleric and druid 7),
//   style2 (fighter 7), tactics (ranger 7), resilience (warlock 10),
//   arcanum (warlock 11+: { 6: spell, 7: spell, 8: spell, 9: spell }),
//   mastery (wizard 18: { 1: spell, 2: spell }), signature (wizard 20: two level 3 spells)
// }
// validateSpec fills any missing choice with a sensible default and drops
// choices the rules don't allow, so older saved heroes still load.

import {
  ABILITIES, ABILITY_NAMES, abilityMod, WEAPONS, MASTERIES, ARMOR, SPECIES, BACKGROUNDS, FEATS,
  CLASSES, SKILLS, SKILL_NAMES, SPELLS, STANDARD_ARRAY, DRAGON_ANCESTRY, GOBLIN_WARRIOR,
  SLOTS_BY_LEVEL, SUBCLASSES, MAX_LEVEL, HP_PER_LEVEL, signed, POINT_COST, POINT_BUDGET,
  KITS, FIGHTING_STYLES, SPELL_LISTS, CANTRIPS_KNOWN, PREPARED_BY_LEVEL, SPELLBOOK_SIZE, DOMAIN_SPELLS,
  DEFAULT_LINEAGE, ORIGIN_FEATS, MI_DEFAULT_ABILITY, SLOT_TABLES, ALWAYS_PREPARED, LAND_SPELLS, landSpells, DRUID_ORDERS,
  HUNTER_PREY, INVOCATIONS, INVOCATIONS_KNOWN, METAMAGIC, STYLE_LEVEL, stylesFor, LIST_NAMES, isMonkWeapon, PACT_WEAPONS,
  ASI_FEATS, STYLE_FEATS, asiLevels, PROGRESSION as P, masteryCount, attacksPerAction, SLOT_COST, SLOT_MIN_LEVEL,
  STRIKES, DEFENSIVE_TACTICS, RESILIENCE_TYPES, arcanumLevels, EPIC_FEATS, EPIC_DEFAULT, EPIC_LEVEL,
} from './data.js';
import { die } from './rng.js';

export const PB_BY_LEVEL = [0, ...Array.from({ length: 20 }, (_, i) => 2 + Math.floor(i / 4))];
export { SPELLS };
export const DEFAULT_BACKGROUND = {
  fighter: 'soldier', rogue: 'criminal', cleric: 'acolyte', wizard: 'sage', barbarian: 'soldier', bard: 'acolyte',
  druid: 'sage', monk: 'criminal', paladin: 'soldier', ranger: 'soldier', sorcerer: 'acolyte', warlock: 'acolyte',
};
// How a companion of each class plays (see ai.js).
export const AI_ROLE = {
  fighter: 'melee', rogue: 'skirmisher', cleric: 'support', wizard: 'caster', barbarian: 'melee', bard: 'support',
  druid: 'support', monk: 'melee', paladin: 'melee', ranger: 'archer', sorcerer: 'caster', warlock: 'caster',
};
const sumParts = (parts) => parts.reduce((s, p) => s + p.value, 0);
const uniq = (xs) => [...new Set(xs)];
const CAST_ABILITIES = ['int', 'wis', 'cha'];
export const SCHOLAR_SKILLS = ['arcana', 'history', 'investigation', 'medicine', 'nature', 'religion'];
export const HUMAN_SKILL_DEFAULTS = ['perception', 'insight', 'athletics', 'medicine', 'stealth', 'persuasion'];

// ---------------------------------------------------------------- specs ----

// The background's ability increases that suit a class: +2 to the class's
// main ability if the background offers it, else the highest score; +1 next.
export function suggestPlus(cls, background, scores) {
  const opts = [...BACKGROUNDS[background].abilities];
  const main = CLASSES[cls].primary;
  opts.sort((a, b) => (b === main) - (a === main) || scores[b] - scores[a]);
  return { [opts[0]]: 2, [opts[1]]: 1 };
}

export function defaultSpec(cls, { species = 'human', background = DEFAULT_BACKGROUND[cls], name = '', ancestry = 'red' } = {}) {
  const scores = { ...CLASSES[cls].suggested };
  return validateSpec({ cls, species, background, method: 'array', scores, plus: suggestPlus(cls, background, scores), ancestry, name });
}

export const pointCost = (scores) => ABILITIES.reduce((s, a) => s + (POINT_COST[scores[a]] ?? 99), 0);
export const rollTotal = (r) => [...r].sort((x, y) => y - x).slice(0, 3).reduce((s, v) => s + v, 0);
// A class's spell slot table (full, half or pact), and the highest spell level it can cast.
export const slotTable = (cls) => SLOT_TABLES[CLASSES[cls]?.spellcasting?.slots || 'full'];
export function maxSpellLevel(level, cls = 'wizard') { return Math.max(...Object.keys(slotTable(cls)[level]).map(Number)); }
// Extra skills a class gains later: Primal Knowledge (Barbarian 3), Bonus Proficiencies (College of Lore).
export const extraSkills = (cls, level) => (level >= 3 ? { barbarian: 1, bard: 3 }[cls] || 0 : 0);
// How many Expertise skills a class has at this level.
export const expertiseCount = (cls, level) => ({ rogue: level >= 6 ? 4 : 2, bard: level >= 9 ? 4 : level >= 2 ? 2 : 0, ranger: level >= 9 ? 3 : level >= 2 ? 1 : 0 }[cls] || 0);
export const styleAt = (cls, level) => STYLE_LEVEL[cls] != null && level >= STYLE_LEVEL[cls];
export const metamagicCount = (cls, level) => (cls === 'sorcerer' && level >= 2 ? (level >= 17 ? 6 : level >= 10 ? 4 : 2) : 0);
// Magical Secrets (Bard 10): a Bard's prepared spells can come from the Cleric, Druid and Wizard lists too.
const SECRET_LISTS = ['bard', 'cleric', 'druid', 'wizard'];
export function classSpellList(cls, level) {
  if (cls !== 'bard' || level < 10) return SPELL_LISTS[cls];
  const out = {};
  for (const l of SECRET_LISTS) for (const [lv, xs] of Object.entries(SPELL_LISTS[l])) out[lv] = uniq([...(out[lv] || []), ...xs]);
  return out;
}
// Magical Discoveries (College of Lore 6): two spells from the Cleric, Druid or Wizard lists, always prepared.
export function discoveryOptions(level) {
  const top = maxSpellLevel(level, 'bard');
  const bard = new Set(Object.values(SPELL_LISTS.bard).flat());
  return uniq(['cleric', 'druid', 'wizard'].flatMap((l) => Object.entries(SPELL_LISTS[l]).filter(([lv]) => +lv <= top).flatMap(([, xs]) => xs)))
    .filter((x) => !bard.has(x)).sort((p, q) => SPELLS[p].level - SPELLS[q].level);
}
// Mystic Arcanum choices: Warlock spells of that level, the ones that work in a fight first.
export const arcanumOptions = (sl) => [...(SPELL_LISTS.warlock[sl] || [])].sort((p, q) => (SPELLS[p].kind === 'utility') - (SPELLS[q].kind === 'utility'));
export const DISCOVERY_DEFAULTS = ['spirit-guardians', 'fireball', 'guiding-bolt', 'magic-missile'];
// Spell Mastery choices: spells of that level in the book that take an action to cast, the ones that work in a fight first.
const MASTERY_FIRST = ['magic-missile', 'scorching-ray', 'shatter', 'chromatic-orb', 'hold-person'];
export const masteryOptions = (book, sl) => (book || []).filter((x) => SPELLS[x].level === sl && SPELLS[x].time === 'action')
  .sort((p, q) => (SPELLS[p].kind === 'utility') - (SPELLS[q].kind === 'utility') || (MASTERY_FIRST.indexOf(q) >= 0) - (MASTERY_FIRST.indexOf(p) >= 0));
export const SIGNATURE_DEFAULTS = ['fireball', 'haste', 'lightning-bolt', 'counterspell', 'slow', 'hypnotic-pattern', 'fear', 'stinking-cloud', 'sleet-storm', 'vampiric-touch', 'dispel-magic', 'fly'];
export const AFFINITY_TYPES = ['Fire', 'Cold', 'Lightning', 'Acid', 'Poison'];

// What a hero picks on reaching this level, beyond spells: more skills or
// Expertise, a Fighting Style, a land or prey, invocations and Metamagic.
export function levelChoices(cls, level) {
  const out = [];
  if (extraSkills(cls, level) > extraSkills(cls, level - 1)) out.push('skills');
  if (expertiseCount(cls, level) > expertiseCount(cls, level - 1)) out.push('expertise');
  if (styleAt(cls, level) && !styleAt(cls, level - 1)) out.push('style');
  if (cls === 'druid' && level === 3) out.push('land');
  if (cls === 'ranger' && level === 3) out.push('prey');
  if (cls === 'warlock' && level >= 2) out.push('invocations');
  if (metamagicCount(cls, level)) out.push('metamagic');
  if (asiLevels(cls, level).includes(level)) out.push('feat');
  if (cls === 'bard' && level === 6) out.push('discoveries');
  if (cls === 'sorcerer' && level === 6) out.push('affinity');
  if ((cls === 'cleric' || cls === 'druid') && level === 7) out.push('strikes');
  if (cls === 'fighter' && level === 7) out.push('style2');
  if (cls === 'ranger' && level === 7) out.push('tactics');
  if (cls === 'warlock' && level === 10) out.push('resilience');
  if (cls === 'warlock' && arcanumLevels(level).length > arcanumLevels(level - 1).length) out.push('arcanum');
  if (cls === 'wizard' && level === 18) out.push('mastery');
  if (cls === 'wizard' && level === 20) out.push('signature');
  return out;
}
// How many earlier picks in a list can be swapped out at a level-up ('level')
// or after a Long Rest ('rest'). Cantrips, invocations and Metamagic: one per
// level. Prepared spells: any (Cleric, Druid, Wizard), one after a Long Rest
// (Paladin, Ranger) or one per level (Bard, Sorcerer, Warlock).
export function swapLimit(cls, when, path) {
  const ch = CLASSES[cls].spellcasting?.change;
  if (when === 'level') {
    if (path === 'prepared') return ch === 'any' ? Infinity : ch === 'level' ? 1 : 0;
    return { cantrips: 1, invocations: 1, metamagic: 1, discoveries: 1, skills: 0, expertise: 0, book: 0 }[path] ?? Infinity;
  }
  if (path === 'prepared') return ch === 'any' ? Infinity : ch === 'one' ? 1 : 0;
  return 0;
}
// Earlier picks a list no longer has (spells that are now always prepared don't count).
export function droppedPicks(cls, level, land, was = [], now = []) {
  const always = new Set(alwaysPrepared(cls, level, land));
  return was.filter((x) => !now.includes(x) && !always.has(x));
}
// The fields a level-up or Long Rest screen can change.
export const PICK_FIELDS = ['cantrips', 'book', 'prepared', 'scholar', 'skills', 'expertise', 'style', 'warriorCantrips', 'land', 'prey', 'invocations', 'pactWeapon', 'metamagic', 'feats',
  'discoveries', 'affinity', 'strikes', 'style2', 'tactics', 'resilience', 'arcanum', 'mastery', 'signature'];

// Pick n from `want` (in order) that pass ok(), then fill from `fill`.
function pickN(n, want, fill, ok) {
  const out = [];
  for (const x of [...(Array.isArray(want) ? want : []), ...fill]) {
    if (out.length >= n) break;
    if (typeof x === 'string' && ok(x) && !out.includes(x)) out.push(x);
  }
  return out;
}

// The order the builder fills spell picks the player left open: the class's
// suggested spells and then the rest of its list, taken a spell level at a
// time from the highest down, so a high-level hero gets some of each level.
// Spells used in fights come before the ones that aren't.
function spreadFill(first, rest) {
  const pool = [...first, ...rest.filter((s) => SPELLS[s]?.kind !== 'utility'), ...rest.filter((s) => SPELLS[s]?.kind === 'utility')];
  const by = {};
  for (const s of pool) if (SPELLS[s]) (by[SPELLS[s].level] ||= []).includes(s) || by[SPELLS[s].level].push(s);
  const levels = Object.keys(by).map(Number).sort((p, q) => q - p);
  const out = [];
  for (let i = 0; levels.some((l) => by[l][i]); i++) for (const l of levels) if (by[l][i]) out.push(by[l][i]);
  return out;
}

// Which spells a Magic Initiate list offers.
export const miCantrips = (list) => SPELL_LISTS[list][0];
export const miSpells = (list) => SPELL_LISTS[list][1];

function cleanMI(raw, list, taken) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const cantrips = pickN(2, raw.cantrips, miCantrips(list), (s) => miCantrips(list).includes(s) && !taken.has(s));
  const spells = miSpells(list);
  const spell = spells.includes(raw.spell) ? raw.spell : spells.find((s) => !taken.has(s) && SPELLS[s].kind !== 'utility') || spells[0];
  const ability = CAST_ABILITIES.includes(raw.ability) ? raw.ability : MI_DEFAULT_ABILITY[list];
  return { list, cantrips, spell, ability };
}

// The cleric's and wizard's own spells, at this level.
export function classSpellCounts(cls, level, order) {
  return {
    cantrips: (CANTRIPS_KNOWN[cls]?.[level] || 0) + (order === 'thaumaturge' || order === 'magician' ? 1 : 0),
    prepared: PREPARED_BY_LEVEL[cls]?.[level] || 0,
    book: cls === 'wizard' ? SPELLBOOK_SIZE[level] : 0,
  };
}
// Spells a class always has prepared at this level, not counted against its
// number (Life Domain, Circle of the Land, oath and patron spells, Paladin's
// Smite, Favored Enemy). Cantrips among them are known, not prepared.
export function alwaysPrepared(cls, level, land) {
  const out = [];
  if (cls === 'cleric') for (const [lv, xs] of Object.entries(DOMAIN_SPELLS)) if (level >= +lv) out.push(...xs);
  if (cls === 'druid' && level >= 3) out.push(...landSpells(land || 'arid', level));
  for (const [lv, xs] of Object.entries(ALWAYS_PREPARED[cls] || {})) if (level >= +lv) out.push(...xs);
  return out;
}
export const domainSpells = (cls, level, land) => alwaysPrepared(cls, level, land).filter((s) => SPELLS[s].level > 0);
export const alwaysCantrips = (cls, level, land) => alwaysPrepared(cls, level, land).filter((s) => SPELLS[s].level === 0);

// Cantrips a species gives (they don't count toward a class's cantrips).
export function speciesCantrips(species, lineage) {
  const SP = SPECIES[species];
  const lin = SP?.lineages?.[lineage || DEFAULT_LINEAGE[species]];
  return [lin?.cantrip, lin?.cantrip2, species === 'tiefling' ? 'thaumaturgy' : null].filter(Boolean);
}
// How many spells of each level a wizard's book can hold: the first six are
// level 1, then two a level, of a level the wizard can cast at that level.
export function bookLimit(spellLevel, level) {
  if (spellLevel === 1) return SPELLBOOK_SIZE[level];
  let n = 0;
  for (let j = 2; j <= level; j++) if (maxSpellLevel(j) >= spellLevel) n += 2;
  return n;
}

// Check a spec sent by a phone. Returns a clean copy or throws a readable Error.
export function validateSpec(spec, { level = 1 } = {}) {
  if (!spec || typeof spec !== 'object') throw new Error('No hero.');
  level = Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1));
  const cls = String(spec.cls), species = String(spec.species), background = String(spec.background);
  if (!CLASSES[cls]) throw new Error('Pick a class.');
  if (!SPECIES[species]) throw new Error('Pick a species.');
  if (!BACKGROUNDS[background]) throw new Error('Pick a background.');
  const C = CLASSES[cls], SP = SPECIES[species], B = BACKGROUNDS[background], D = C.defaults;

  // Ability scores, by the method the player used.
  const method = ['array', 'pointbuy', 'roll'].includes(spec.method) ? spec.method : 'array';
  const scores = {};
  for (const a of ABILITIES) scores[a] = Number(spec.scores?.[a]);
  if (!ABILITIES.every((a) => Number.isInteger(scores[a]))) throw new Error('Give every ability a score.');
  let rolls = null;
  if (method === 'array') {
    const used = ABILITIES.map((a) => scores[a]).sort((x, y) => y - x);
    if (used.join() !== STANDARD_ARRAY.join()) throw new Error('Use each number of the standard array (15, 14, 13, 12, 10, 8) once.');
  } else if (method === 'pointbuy') {
    if (ABILITIES.some((a) => scores[a] < 8 || scores[a] > 15)) throw new Error('With point buy, each score is 8 to 15.');
    if (pointCost(scores) > POINT_BUDGET) throw new Error(`That costs ${pointCost(scores)} points; you have ${POINT_BUDGET}.`);
  } else {
    rolls = Array.isArray(spec.rolls) ? spec.rolls.slice(0, 6).map((r) => (Array.isArray(r) ? r.slice(0, 4).map((v) => v | 0) : [])) : [];
    if (rolls.length !== 6 || rolls.some((r) => r.length !== 4 || r.some((v) => v < 1 || v > 6))) throw new Error('Roll 4d6 six times first.');
    const want = rolls.map(rollTotal).sort((x, y) => y - x).join();
    if (ABILITIES.map((a) => scores[a]).sort((x, y) => y - x).join() !== want) throw new Error('Put each rolled total on one ability.');
  }
  const plus = {};
  for (const [a, v] of Object.entries(spec.plus || {})) {
    if (!B.abilities.includes(a)) throw new Error(`${B.name} can't raise ${ABILITY_NAMES[a] || a}.`);
    if (+v) plus[a] = +v;
  }
  const pattern = Object.values(plus).sort().join();
  if (pattern !== '1,2' && pattern !== '1,1,1') throw new Error('Background increases are +2 and +1, or +1 to all three.');
  for (const a of ABILITIES) if (scores[a] + (plus[a] || 0) > 20) throw new Error(`${ABILITY_NAMES[a]} can't go above 20.`);
  const final = Object.fromEntries(ABILITIES.map((a) => [a, scores[a] + (plus[a] || 0)]));

  const ancestry = DRAGON_ANCESTRY[spec.ancestry] ? spec.ancestry : 'red';
  const name = String(spec.name || '').trim().slice(0, 20);
  const lineage = SP.lineages ? (SP.lineages[spec.lineage] ? spec.lineage : DEFAULT_LINEAGE[species]) : null;
  const castMain = C.spellcasting?.ability;
  const bestCast = CAST_ABILITIES.includes(castMain) ? castMain : [...CAST_ABILITIES].sort((x, y) => final[y] - final[x])[0];
  const speciesAbility = SP.castAbility ? (CAST_ABILITIES.includes(spec.speciesAbility) ? spec.speciesAbility : bestCast) : null;

  // Equipment and class options.
  const order = cls === 'cleric' ? (spec.order === 'thaumaturge' ? 'thaumaturge' : 'protector')
    : cls === 'druid' ? (DRUID_ORDERS[spec.order] ? spec.order : D.order) : null;
  let kit = C.kits.includes(spec.kit) ? spec.kit : D.kit;
  if (KITS[cls][kit].needs && KITS[cls][kit].needs !== order) kit = D.kit;
  const carried = uniq(KITS[cls][kit].weapons);
  const style = styleAt(cls, level) ? (stylesFor(cls).includes(spec.style) ? spec.style : D.style) : null;
  const masteries = pickN(masteryCount(cls, level), spec.masteries, [...(D.masteries || []), ...carried], (w) => carried.includes(w));

  // Skills, in the order the rules hand them out: background, class, species, feats.
  const prof = new Set(B.skills);
  // Skills the player picked for a species trait or a feat aren't used to fill
  // the class's picks, so each choice stays where the player put it.
  const held = new Set([spec.speciesSkill, ...(Array.isArray(spec.versatile?.skills) ? spec.versatile.skills : [])]);
  const skillFill = [...D.skills, ...C.skillChoices.from];
  const skills = pickN(C.skillChoices.n + extraSkills(cls, level), spec.skills, [...skillFill.filter((s) => !held.has(s)), ...skillFill], (s) => C.skillChoices.from.includes(s) && !prof.has(s));
  for (const s of skills) prof.add(s);
  let speciesSkill = null;
  if (species === 'human' || species === 'elf') {
    const from = SP.skillFrom || Object.keys(SKILLS);
    [speciesSkill] = pickN(1, [spec.speciesSkill], [...HUMAN_SKILL_DEFAULTS.filter((x) => from.includes(x)), ...from], (s) => from.includes(s) && !prof.has(s));
    if (speciesSkill) prof.add(speciesSkill);
  }

  // The class's own spells.
  let cantrips = [], book = [], prepared = [];
  const fromSpecies = speciesCantrips(species, lineage);
  const land = cls === 'druid' && level >= 3 ? (LAND_SPELLS[spec.land] ? spec.land : 'arid') : null;
  const fromClass = alwaysCantrips(cls, level, land);
  const miWant = [spec.bgFeat?.cantrips, spec.versatile?.cantrips].flatMap((x) => (Array.isArray(x) ? x : []));
  if (C.spellcasting) {
    const n = classSpellCounts(cls, level, order);
    const top = maxSpellLevel(level, cls);
    const list = classSpellList(cls, level);
    const cFill = [...(D.cantrips || []), ...(list[0] || [])];
    cantrips = pickN(n.cantrips, spec.cantrips, [...cFill.filter((s) => !miWant.includes(s)), ...cFill], (s) => (list[0] || []).includes(s) && !fromSpecies.includes(s) && !fromClass.includes(s));
    const leveled = Object.entries(list).filter(([lv]) => +lv >= 1 && +lv <= top).flatMap(([, xs]) => xs);
    if (cls === 'wizard') {
      // Each spell level has its own room in the book (see bookLimit).
      book = [];
      const room = (s) => book.filter((x) => SPELLS[x].level === SPELLS[s].level).length < bookLimit(SPELLS[s].level, level);
      for (const s of [...(Array.isArray(spec.book) ? spec.book : []), ...spreadFill(D.book, leveled)]) {
        if (book.length >= n.book) break;
        if (typeof s === 'string' && leveled.includes(s) && !book.includes(s) && room(s)) book.push(s);
      }
      prepared = pickN(n.prepared, spec.prepared, spreadFill(D.prepared, book), (s) => book.includes(s));
    } else {
      const dom = domainSpells(cls, level, land);
      prepared = pickN(n.prepared, spec.prepared, spreadFill(D.prepared, leveled), (s) => leveled.includes(s) && !dom.includes(s));
    }
  }
  // Blessed Warrior / Druidic Warrior: two cantrips from another list.
  let warriorCantrips = [];
  const ws = FIGHTING_STYLES[style];
  if (ws?.list) {
    const wl = SPELL_LISTS[ws.list][0];
    warriorCantrips = pickN(2, spec.warriorCantrips, [...(D.warriorCantrips || []), ...wl], (s) => wl.includes(s) && !fromSpecies.includes(s) && !miWant.includes(s));
  }

  // Feats: the background's, then the human's Versatile feat.
  const taken = new Set([...cantrips, ...prepared, ...book, ...fromSpecies, ...warriorCantrips, ...fromClass]);
  let bgFeat = null;
  if (B.feat === 'magic-initiate') {
    bgFeat = cleanMI(spec.bgFeat, B.featList, taken);
    for (const x of [...bgFeat.cantrips, bgFeat.spell]) taken.add(x);
  }
  let versatile = null;
  if (species === 'human') {
    const v = spec.versatile && typeof spec.versatile === 'object' ? spec.versatile : {};
    let feat = ORIGIN_FEATS.includes(v.feat) ? v.feat : 'skilled';
    // A feat you already have can be taken again only if it says so.
    if (feat === B.feat && !FEATS[feat].repeatable) feat = 'skilled';
    if (feat === 'magic-initiate') {
      let list = FEATS[feat].lists.includes(v.list) ? v.list : (B.featList === 'cleric' ? 'wizard' : 'cleric');
      if (B.feat === 'magic-initiate' && list === B.featList) list = FEATS[feat].lists.find((l) => l !== B.featList);
      versatile = { feat, ...cleanMI(v, list, taken) };
    } else if (feat === 'skilled') {
      const sk = pickN(3, v.skills, [...HUMAN_SKILL_DEFAULTS, ...Object.keys(SKILLS)], (s) => !!SKILLS[s] && !prof.has(s));
      for (const s of sk) prof.add(s);
      versatile = { feat, skills: sk };
    } else versatile = { feat };
  }

  // Feats at Ability Score Improvement levels (one entry per level reached).
  const feats = cleanFeats(spec.feats, { cls, level, final, B, versatile, style, prof, taken });
  const expertise = pickN(expertiseCount(cls, level), spec.expertise, [...(D.expertise || []), ...prof], (s) => prof.has(s));
  // Warlock: Eldritch Invocations (the Eldritch Blast ones need that cantrip).
  let invocations = [], pactWeapon = null;
  if (cls === 'warlock') {
    const eb = cantrips.includes('eldritch-blast');
    const okInv = (x) => INVOCATIONS[x] && INVOCATIONS[x].min <= level && (eb || !['agonizing-blast', 'repelling-blast', 'eldritch-spear'].includes(x));
    const fill = [...D.invocations, ...Object.keys(INVOCATIONS)];
    invocations = pickN(INVOCATIONS_KNOWN[level], spec.invocations, fill, okInv);
    // One that needs another (Thirsting Blade needs Pact of the Blade) goes if that one isn't taken.
    const needsMet = (x) => okInv(x) && (!INVOCATIONS[x].needs || invocations.includes(INVOCATIONS[x].needs));
    if (!invocations.every(needsMet)) invocations = pickN(INVOCATIONS_KNOWN[level], invocations.filter(needsMet), fill, (x) => okInv(x) && !INVOCATIONS[x].needs);
    if (invocations.includes('pact-of-the-blade')) pactWeapon = PACT_WEAPONS.includes(spec.pactWeapon) ? spec.pactWeapon : D.pactWeapon;
  }
  const metamagic = pickN(metamagicCount(cls, level), spec.metamagic, [...(D.metamagic || []), ...Object.keys(METAMAGIC)], (x) => !!METAMAGIC[x]);
  const prey = cls === 'ranger' && level >= 3 ? (HUNTER_PREY[spec.prey] ? spec.prey : D.prey) : null;
  const scholar = cls === 'wizard' && level >= 2
    ? (pickN(1, [spec.scholar], D.scholar, (s) => SCHOLAR_SKILLS.includes(s) && prof.has(s) && !expertise.includes(s))[0] || null) : (SCHOLAR_SKILLS.includes(spec.scholar) ? spec.scholar : null);

  // Choices of levels 6 to 10.
  const taken2 = new Set([...cantrips, ...prepared, ...book, ...fromClass, ...domainSpells(cls, level, land)]);
  const disc = discoveryOptions(level);
  const discoveries = cls === 'bard' && level >= 6 ? pickN(2, spec.discoveries, DISCOVERY_DEFAULTS.filter((x) => disc.includes(x)).concat(disc), (x) => disc.includes(x) && !taken2.has(x)) : [];
  const affinity = cls === 'sorcerer' && level >= 6 ? (AFFINITY_TYPES.includes(spec.affinity) ? spec.affinity : 'Fire') : null;
  const strikes = (cls === 'cleric' || cls === 'druid') && level >= 7 ? (STRIKES[cls][spec.strikes] ? spec.strikes : cls === 'cleric' ? 'divine' : 'primal') : null;
  const featStyles = new Set([style, ...feats.filter((f) => f.style).map((f) => f.style)]);
  const style2 = cls === 'fighter' && level >= 7
    ? (stylesFor(cls).includes(spec.style2) && !featStyles.has(spec.style2) ? spec.style2 : ['defense', 'great-weapon', 'archery', ...stylesFor(cls)].find((x) => stylesFor(cls).includes(x) && !featStyles.has(x))) : null;
  const tactics = cls === 'ranger' && level >= 7 ? (DEFENSIVE_TACTICS[spec.tactics] ? spec.tactics : 'multi') : null;
  const resilience = cls === 'warlock' && level >= 10 ? (RESILIENCE_TYPES.includes(spec.resilience) ? spec.resilience : 'Slashing') : null;
  // Mystic Arcanum (Warlock 11+): one Warlock spell of level 6, 7, 8 (and 9), each cast once per Long Rest.
  const arcanum = {};
  if (cls === 'warlock') for (const sl of arcanumLevels(level)) {
    const opts = arcanumOptions(sl);
    arcanum[sl] = opts.includes(spec.arcanum?.[sl]) ? spec.arcanum[sl] : opts[0];
  }
  // Spell Mastery (Wizard 18): a level 1 and a level 2 spell from the book, cast at will.
  // Signature Spells (Wizard 20): two level 3 spells from the book, always prepared, one free cast each per rest.
  let mastery = null, signature = [];
  if (cls === 'wizard' && level >= 18) {
    mastery = {};
    for (const sl of [1, 2]) {
      const opts = masteryOptions(book, sl);
      mastery[sl] = opts.includes(spec.mastery?.[sl]) ? spec.mastery[sl] : opts[0] || null;
    }
  }
  if (cls === 'wizard' && level >= 20) signature = pickN(2, spec.signature, SIGNATURE_DEFAULTS, (x) => book.includes(x) && SPELLS[x].level === 3);

  return {
    cls, species, background, method, scores, ...(rolls ? { rolls } : {}), plus, ancestry, name,
    lineage, speciesAbility, speciesSkill, bgFeat, versatile,
    skills, expertise, style, warriorCantrips, kit, masteries, order, cantrips, book, prepared, scholar,
    invocations, pactWeapon, metamagic, land, prey, feats,
    discoveries, affinity, strikes, style2, tactics, resilience, arcanum, mastery, signature,
  };
}

// Ability scores after the background's increases and every feat's.
export function finalScores(spec) {
  const out = {};
  for (const a of ABILITIES) out[a] = spec.scores[a] + (spec.plus?.[a] || 0);
  for (const f of spec.feats || []) for (const [a, v] of Object.entries(f.plus || {})) out[a] += v;
  return out;
}

// The default Ability Score Improvement: +2 to the class's main ability, or
// +1 to it and +1 to Constitution when +2 would pass 20, and so on.
function defaultIncrease(cls, now) {
  const order = [CLASSES[cls].primary, 'con', ...Object.keys(CLASSES[cls].suggested)];
  const room = order.filter((a, i) => order.indexOf(a) === i && now[a] < 20);
  if (!room.length) return {};
  if (now[room[0]] <= 18) return { [room[0]]: 2 };
  return room[1] ? { [room[0]]: 1, [room[1]]: 1 } : { [room[0]]: 1 };
}

// Clean a hero's feats from Ability Score Improvement levels. Each feat is
// { level, feat, plus?, skills?, style?, list/cantrips/spell/ability (Magic Initiate) }.
// Anything the rules don't allow falls back to Ability Score Improvement.
function cleanFeats(raw, { cls, level, final, B, versatile, style, prof, taken }) {
  const want = Array.isArray(raw) ? raw : [];
  const now = { ...final };
  const out = [];
  const has = new Set([B.feat, versatile?.feat].filter(Boolean));
  const miLists = new Set([B.feat === 'magic-initiate' ? B.featList : null, versatile?.feat === 'magic-initiate' ? versatile.list : null].filter(Boolean));
  const styles = new Set([style].filter(Boolean));
  const plusOk = (plus, from, total) => {
    const ks = Object.keys(plus);
    const vs = Object.values(plus);
    if (!ks.every((a) => from.includes(a)) || vs.some((v) => !Number.isInteger(v) || v < 1)) return false;
    if (vs.reduce((x, y) => x + y, 0) !== total) return false;
    return ks.every((a) => now[a] + plus[a] <= 20);
  };
  for (const lv of asiLevels(cls, level)) {
    const w = want.find((x) => x && x.level === lv) || {};
    const epicLv = lv === EPIC_LEVEL;
    const casterOk = (x) => !FEATS[x].caster || !!CLASSES[cls].spellcasting;
    let f = ASI_FEATS.includes(w.feat) || (epicLv && EPIC_FEATS.includes(w.feat) && casterOk(w.feat)) ? w.feat
      : epicLv && !w.feat ? EPIC_DEFAULT[cls] : 'ability-score-improvement';
    const F = FEATS[f];
    if (has.has(f) && !F.repeatable && f !== 'magic-initiate') f = 'ability-score-improvement';
    if (f === 'grappler' && !(now.str >= 13 || now.dex >= 13)) f = 'ability-score-improvement';
    if (f === 'fighting-style' && !(STYLE_LEVEL[cls] != null && STYLE_FEATS.some((x) => !styles.has(x)))) f = 'ability-score-improvement';
    if (f === 'magic-initiate' && FEATS[f].lists.every((l) => miLists.has(l))) f = 'ability-score-improvement';
    const e = { level: lv, feat: f };
    const plus = w.plus && typeof w.plus === 'object' ? Object.fromEntries(Object.entries(w.plus).map(([a, v]) => [a, +v]).filter(([, v]) => v)) : {};
    if (FEATS[f].epic) {
      // An Epic Boon: +1 to one of its abilities, up to 30.
      const from = FEATS[f].plusFrom.filter((a) => now[a] < 30);
      const main = CLASSES[cls].primary;
      const best = from.includes(main) ? main : [...from].sort((x, y) => now[y] - now[x])[0];
      const ks = Object.keys(plus);
      e.plus = ks.length === 1 && plus[ks[0]] === 1 && from.includes(ks[0]) ? plus : best ? { [best]: 1 } : {};
    } else if (f === 'ability-score-improvement') {
      e.plus = plusOk(plus, ABILITIES, 2) && Object.values(plus).every((v) => v <= 2) ? plus : defaultIncrease(cls, now);
    } else if (f === 'grappler') {
      const okA = ['str', 'dex'].filter((a) => now[a] < 20);
      e.plus = plusOk(plus, okA, 1) ? plus : okA.length ? { [now.str >= now.dex ? (okA.includes('str') ? 'str' : 'dex') : (okA.includes('dex') ? 'dex' : 'str')]: 1 } : {};
    } else if (f === 'fighting-style') {
      e.style = STYLE_FEATS.includes(w.style) && !styles.has(w.style) ? w.style : STYLE_FEATS.find((x) => !styles.has(x));
      styles.add(e.style);
    } else if (f === 'skilled') {
      e.skills = pickN(3, w.skills, [...HUMAN_SKILL_DEFAULTS, ...Object.keys(SKILLS)], (x) => !!SKILLS[x] && !prof.has(x));
      for (const x of e.skills) prof.add(x);
    } else if (f === 'magic-initiate') {
      const list = FEATS[f].lists.includes(w.list) && !miLists.has(w.list) ? w.list : FEATS[f].lists.find((l) => !miLists.has(l));
      Object.assign(e, cleanMI(w, list, taken));
      miLists.add(list);
      for (const x of [...e.cantrips, e.spell]) taken.add(x);
    }
    for (const [a, v] of Object.entries(e.plus || {})) now[a] += v;
    has.add(f);
    out.push(e);
  }
  return out;
}

// --------------------------------------------------------------- heroes ----

function spellStats(m, pb, ability) {
  const mod = { label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'ability-modifier' };
  const prof = { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' };
  return {
    attack: [mod, prof],
    dc: [{ label: 'Base', value: 8, rule: 'spell-save-dc' }, mod, prof],
  };
}

const SPECIES_RESIST = { dwarf: ['Poison'] };

// Armor Class parts for what the hero wears. With no armor on, the best of the
// ways to work out a base AC counts (they never stack): 10 + DEX, Mage Armor
// (13 + DEX), or a class's Unarmored Defense (10 + DEX + another modifier).
export function armorParts(h) {
  const m = h.mods;
  const mk = (armor) => {
    const parts = [{ label: armor.name, value: armor.base, rule: armor.rule || 'armor-class' }];
    if (armor.dex) {
      const d = armor.maxDex != null ? Math.min(m.dex, armor.maxDex) : m.dex;
      parts.push({ label: `DEX modifier${armor.maxDex != null && m.dex > armor.maxDex ? ` (max ${armor.maxDex})` : ''}`, value: d, rule: 'ability-modifier' });
    }
    if (armor.plus) parts.push({ label: `${armor.plus.toUpperCase()} modifier`, value: m[armor.plus], rule: 'ability-modifier' });
    return parts;
  };
  const opts = [mk(ARMOR[h.armorId])];
  if (h.armorId === 'none') {
    if (h.mageArmor || h.shadows) opts.push(mk({ name: h.shadows ? 'Mage Armor (Armor of Shadows)' : 'Mage Armor', base: 13, dex: true, rule: 'mage-armor' }));
    const u = h.unarmored;
    if (u && !(u.noShield && h.hasShield)) opts.push(mk({ name: u.name, base: 10, dex: true, plus: u.ab, rule: u.rule }));
  }
  const parts = opts.reduce((best, o) => (sumParts(o) > sumParts(best) ? o : best));
  if (h.hasShield) parts.push({ label: 'Shield', value: 2, rule: 'armor-class' });
  if ((h.styles || [h.style]).includes('defense') && ARMOR[h.armorId].type) parts.push({ label: 'Defense fighting style', value: 1, rule: 'defense' });
  return parts;
}

export function buildHero(rawSpec, { id = 'hero', name, level = 1 } = {}) {
  level = Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1));
  const spec = validateSpec(rawSpec, { level });
  const C = CLASSES[spec.cls], S = SPECIES[spec.species], B = BACKGROUNDS[spec.background];
  const lin = S.lineages ? S.lineages[spec.lineage] : null;
  const kit = KITS[spec.cls][spec.kit];
  const pb = PB_BY_LEVEL[level];
  const scores = finalScores(spec);
  // Primal Champion (Barbarian 20) and Body and Mind (Monk 20): +4 to two scores, up to 25.
  const capstone = level >= 20 ? { barbarian: ['str', 'con'], monk: ['dex', 'wis'] }[spec.cls] : null;
  for (const a of capstone || []) scores[a] = Math.max(scores[a], Math.min(25, scores[a] + 4));
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(scores[a])]));
  const L = (n) => level >= n;
  const sub = L(3) ? SUBCLASSES[spec.cls] : null;
  const feats = [B.feat, spec.versatile?.feat, ...spec.feats.map((f) => f.feat)].filter(Boolean);
  const has = (f) => feats.includes(f);
  // Fighting Styles: the class's own, and any taken as feats.
  const styles = [spec.style, spec.style2, ...spec.feats.filter((f) => f.style).map((f) => f.style)].filter(Boolean);
  const cls = spec.cls;
  const inv = (x) => (spec.invocations || []).includes(x);

  // Armor Class. Armor of Shadows: the Warlock goes without the Leather Armor.
  const armorId = inv('armor-of-shadows') ? 'none' : kit.armor;
  const armor = ARMOR[armorId];
  const unarmored = cls === 'barbarian' ? { name: 'Unarmored Defense (10)', ab: 'con', rule: 'unarmored-defense' }
    : cls === 'monk' ? { name: 'Unarmored Defense (10)', ab: 'wis', noShield: true, rule: 'unarmored-defense' }
    : cls === 'sorcerer' && L(3) ? { name: 'Draconic Resilience (10)', ab: 'cha', rule: 'draconic-resilience' } : null;
  const shadows = inv('armor-of-shadows');
  const acParts = armorParts({ mods: m, armorId, hasShield: kit.shield, style: spec.style, styles, unarmored, shadows });

  // Speed: the species', and heavy armor without the Strength for it costs 10 ft.
  const speedParts = [{ label: `${S.name}${lin?.speed ? ` (${lin.name})` : ''}`, value: lin?.speed || S.speed, rule: 'speed' }];
  if (armor.str && scores.str < armor.str) speedParts.push({ label: `${armor.name} needs Strength ${armor.str}`, value: -10, rule: 'armor-class' });
  if (cls === 'monk' && L(2) && armorId === 'none' && !kit.shield) speedParts.push({ label: 'Unarmored Movement', value: P.unarmoredMovement(level), rule: 'unarmored-movement' });
  if (cls === 'barbarian' && L(5) && armor.type !== 'heavy') speedParts.push({ label: 'Fast Movement', value: 10, rule: 'fast-movement' });
  if (cls === 'ranger' && L(6) && armor.type !== 'heavy') speedParts.push({ label: 'Roving', value: 10, rule: 'roving' });

  // Hit Points: the Hit Die's maximum + CON at level 1, then its fixed value
  // + CON for each level after (plus species, per level).
  const hpParts = [{ label: `d${C.hitDie} maximum`, value: C.hitDie, rule: 'hit-points' }, { label: 'CON modifier', value: m.con, rule: 'ability-modifier' }];
  if (level > 1) hpParts.push({ label: `Levels 2${level > 2 ? `-${level}` : ''}: ${level - 1} × (${HP_PER_LEVEL[C.hitDie]} + CON)`, value: (level - 1) * (HP_PER_LEVEL[C.hitDie] + m.con), rule: 'level-up' });
  if (spec.species === 'dwarf') hpParts.push({ label: 'Dwarven Toughness', value: level, rule: 'dwarven-toughness' });
  if (cls === 'sorcerer' && L(3)) hpParts.push({ label: 'Draconic Resilience (1 per Sorcerer level)', value: level, rule: 'draconic-resilience' });
  const hpMax = Math.max(1, sumParts(hpParts));

  // Initiative: a Dexterity check, plus PB with the Alert feat.
  const initParts = [{ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' }];
  if (has('alert')) initParts.push({ label: 'Alert feat (PB)', value: pb, rule: 'alert' });
  // Reliable Talent (Rogue 7): a proficient check's d20 of 9 or lower counts as 10.
  const reliable = cls === 'rogue' && L(7);

  // Skills
  const prof = new Set([...B.skills, ...spec.skills, ...(spec.speciesSkill ? [spec.speciesSkill] : []), ...(spec.versatile?.skills || []), ...spec.feats.flatMap((f) => f.skills || [])]);
  const expertise = [...spec.expertise];
  const scholar = spec.cls === 'wizard' && L(2) ? spec.scholar : null;
  if (scholar) expertise.push(scholar);
  const skills = {};
  const jack = cls === 'bard' && L(2);
  for (const [s, ab] of Object.entries(SKILLS)) {
    skills[s] = m[ab] + (prof.has(s) ? (expertise.includes(s) ? 2 : 1) * pb : 0);
    if (spec.order === 'thaumaturge' && (s === 'arcana' || s === 'religion')) skills[s] += Math.max(1, m.wis);
    if (spec.order === 'magician' && (s === 'arcana' || s === 'nature')) skills[s] += Math.max(1, m.wis);
    if (jack && !prof.has(s)) skills[s] += Math.floor(pb / 2);
  }

  // Saving throws
  const saves = {};
  // Disciplined Survivor (Monk 14): every save. Slippery Mind (Rogue 15): Wisdom and Charisma too.
  const saveProfs = uniq([...C.saves, ...(cls === 'monk' && L(14) ? ABILITIES : []), ...(cls === 'rogue' && L(15) ? ['wis', 'cha'] : [])]);
  for (const a of ABILITIES) saves[a] = m[a] + (saveProfs.includes(a) ? pb : 0);

  // Weapons: each carried weapon, and a thrown version of the throwable ones.
  // A Monk's weapons use DEX if it's better, and at least the Martial Arts
  // die. A Warlock's pact weapon can use CHA.
  const attacks = [];
  const martialDie = cls === 'monk' ? `1d${P.martialDie(level)}` : null;
  const dieSize = (d) => +d.split('d')[1];
  const weaponList = [...kit.weapons, ...(spec.pactWeapon ? [spec.pactWeapon] : [])];
  for (const [wi, wid] of weaponList.entries()) {
    const w = WEAPONS[wid];
    const pact = !!spec.pactWeapon && wi === weaponList.length - 1;
    const monkW = martialDie && isMonkWeapon(wid);
    let ability = w.kind === 'ranged' ? 'dex' : ((w.finesse || monkW) && m.dex > m.str ? 'dex' : 'str');
    if (pact && m.cha > m[ability]) ability = 'cha';
    const two = !kit.shield && !!w.versatile;
    const mastery = !pact && spec.masteries.includes(wid) && MASTERIES[w.mastery] ? w.mastery : null;
    const mk = (variant) => {
      const ranged = variant === 'thrown' || w.kind === 'ranged';
      const hit = [
        { label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'ability-modifier' },
        { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' },
      ];
      if (styles.includes('archery') && w.kind === 'ranged') hit.push({ label: 'Archery fighting style', value: 2, rule: 'archery' });
      const dmgFlat = [{ label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'damage' }];
      let dice = variant === 'melee' && two ? w.versatile : w.dice;
      if (monkW && dieSize(martialDie) > dieSize(dice)) dice = martialDie;
      return {
        id: pact ? 'pact' : variant === 'thrown' ? `${wid}-thrown` : wid, base: pact ? 'pact' : wid,
        name: pact ? `${w.name} (pact weapon)` : variant === 'thrown' ? `${w.name} (thrown)` : `${w.name}${variant === 'melee' && two ? ' (two hands)' : ''}`,
        kind: ranged ? 'ranged' : 'melee', thrown: variant === 'thrown', dice, type: w.type,
        finesse: !!w.finesse, light: !!w.light, range: variant === 'thrown' ? w.thrown : w.range || null, props: w.props, hit, dmgFlat, mastery,
        ability, abilityMod: m[ability], monk: !!monkW, pact,
        gwf: styles.includes('great-weapon') && variant === 'melee' && (w.twoHanded || two),
        masteryText: mastery ? MASTERIES[mastery].text : null,
      };
    };
    attacks.push(mk(w.kind === 'ranged' ? 'ranged' : 'melee'));
    if (w.thrown && !pact) attacks.push(mk('thrown'));
  }
  // A Monk's Unarmed Strike: the Martial Arts die + DEX or STR.
  if (martialDie) {
    const ab = m.dex > m.str ? 'dex' : 'str';
    attacks.push({
      id: 'unarmed', base: 'unarmed', name: 'Unarmed Strike', kind: 'melee', thrown: false, dice: martialDie, type: 'Bludgeoning',
      finesse: false, light: false, range: null, props: ['Martial Arts'], mastery: null, ability: ab, abilityMod: m[ab], unarmed: true, monk: true,
      hit: [{ label: `${ab.toUpperCase()} modifier`, value: m[ab], rule: 'ability-modifier' }, { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' }],
      dmgFlat: [{ label: `${ab.toUpperCase()} modifier`, value: m[ab], rule: 'damage' }], gwf: false, masteryText: null,
    });
  }

  // Spells: the class's own, Origin feats, species extras.
  const known = {};
  const statsBy = {};
  const learn = (sid, ability, source, { free = 0, slot = false, perDay = false } = {}) => {
    const k = known[sid];
    if (k) {
      k.free += free; k.freeMax = (k.freeMax || 0) + free; k.slot = k.slot || slot;
      if (free && !k.freeWhy) k.freeWhy = source;
      if (perDay) k.perDay = k.perDay || perDay;
      return;
    }
    known[sid] = { ability, source, free, slot, freeMax: free, ...(free ? { freeWhy: source } : {}) };
    statsBy[ability] ||= spellStats(m, pb, ability);
  };
  let slots = null;
  if (C.spellcasting) {
    const sc = C.spellcasting;
    const pact = sc.slots === 'pact';
    const alwaysFrom = { cleric: 'Life Domain', druid: 'Circle of the Land', paladin: 'Oath of Devotion', sorcerer: 'Draconic Sorcery', warlock: 'Fiend Patron', ranger: 'Favored Enemy' }[cls];
    // Natural Recovery (Circle of the Land 6): one Circle spell cast free each day (here: the highest-level one).
    const recovery = cls === 'druid' && L(6) ? [...landSpells(spec.land, level)].filter((x) => SPELLS[x].kind !== 'utility').sort((p, q) => SPELLS[q].level - SPELLS[p].level)[0] : null;
    for (const s of spec.cantrips) learn(s, sc.ability, C.name);
    for (const s of spec.prepared) learn(s, sc.ability, C.name, { slot: true });
    for (const s of alwaysPrepared(cls, level, spec.land)) {
      if (s === 'divine-smite') learn(s, sc.ability, "Paladin's Smite", { slot: true, free: 1 });
      else if (s === 'hunters-mark') learn(s, sc.ability, 'Favored Enemy', { slot: true, free: P.favoredEnemy(level) });
      else learn(s, sc.ability, alwaysFrom, { slot: SPELLS[s].level > 0, free: s === recovery ? 1 : 0 });
    }
    slots = {};
    for (const [lv, k] of Object.entries(slotTable(cls)[level])) slots[lv] = { max: k, left: k, ...(pact ? { pact: true } : {}) };
    // Spell Mastery (Wizard 18): a level 1 and a level 2 spell, always prepared and cast at will at their lowest level.
    for (const sid of Object.values(spec.mastery || {}).filter(Boolean)) {
      learn(sid, sc.ability, 'Spell Mastery', { slot: true });
      known[sid].atWill = 'Spell Mastery';
    }
    // Signature Spells (Wizard 20): two level 3 spells, always prepared, each cast once at level 3 with no slot, back on a Short or Long Rest.
    for (const sid of spec.signature || []) {
      learn(sid, sc.ability, 'Signature Spells', { slot: true, free: 1 });
      known[sid].signature = true;
    }
    // Dragon Companion (Draconic Sorcery 18): Summon Dragon once per Long Rest with no slot.
    if (cls === 'sorcerer' && L(18)) learn('summon-dragon', sc.ability, 'Dragon Companion', { slot: true, free: 1 });
  }
  for (const s of spec.discoveries || []) learn(s, 'cha', 'Magical Discoveries', { slot: SPELLS[s].level > 0 });
  if (spec.warriorCantrips?.length) {
    const st = FIGHTING_STYLES[spec.style];
    for (const s of spec.warriorCantrips) learn(s, st.ability, st.name);
  }
  for (const sid of Object.values(spec.arcanum || {})) learn(sid, 'cha', 'Mystic Arcanum', { free: 1, perDay: true });
  if (inv('fiendish-vigor')) { learn('false-life', 'cha', 'Fiendish Vigor'); known['false-life'].atWill = 'Fiendish Vigor'; known['false-life'].maxed = true; }
  if (inv('pact-of-the-chain')) learn('find-familiar', 'cha', 'Pact of the Chain');
  const featFeature = [];
  const miLearn = (mi, label) => {
    for (const s of mi.cantrips) learn(s, mi.ability, label);
    learn(mi.spell, mi.ability, label, { free: 1, slot: true });
    featFeature.push({ name: label, rule: 'magic-initiate',
      text: `${mi.cantrips.map((x) => SPELLS[x].name).join(' and ')}; ${SPELLS[mi.spell].name} once per Long Rest free (or with a slot). Ability: ${ABILITY_NAMES[mi.ability]}.` });
  };
  if (spec.bgFeat) miLearn(spec.bgFeat, `Magic Initiate (${LIST_NAMES[spec.bgFeat.list]})`);
  if (spec.versatile?.feat === 'magic-initiate') miLearn(spec.versatile, `Magic Initiate (${LIST_NAMES[spec.versatile.list]})`);
  for (const f of spec.feats) if (f.feat === 'magic-initiate') miLearn(f, `Magic Initiate (${LIST_NAMES[f.list]})`);
  const sa = spec.speciesAbility;
  if (lin?.cantrip) learn(lin.cantrip, sa, lin.name);
  if (lin?.cantrip2) learn(lin.cantrip2, sa, lin.name);
  if (lin?.spell3 && L(3)) learn(lin.spell3, sa, lin.name, { free: 1, slot: true });
  if (lin?.always) learn(lin.always, sa, lin.name, { free: pb, slot: true });
  if (spec.species === 'tiefling') learn('thaumaturgy', sa, 'Otherworldly Presence');
  const casting = Object.keys(known).length ? { known, stats: statsBy, slots } : null;

  // Features for the character sheet
  const features = [];
  for (const t of S.traits) features.push({ ...t, source: S.name });
  if (lin) features.push({ name: lin.name, rule: spec.species === 'goliath' ? 'giant-ancestry' : 'species', text: lin.text, source: S.name });
  if (spec.speciesSkill) features.push({ name: `${spec.species === 'human' ? 'Skillful' : 'Keen Senses'}: ${SKILL_NAMES[spec.speciesSkill]}`, rule: 'skills', text: `Proficiency in ${SKILL_NAMES[spec.speciesSkill]}.`, source: S.name });
  for (const f of [B.feat, spec.versatile?.feat].filter(Boolean)) {
    if (f === 'magic-initiate') continue;
    const F0 = FEATS[f];
    const extra = f === 'skilled' ? `: ${spec.versatile.skills.map((x) => SKILL_NAMES[x]).join(', ')}` : '';
    features.push({ name: F0.name + extra, rule: F0.rule, text: F0.text, source: f === B.feat ? `${B.name} background` : 'Versatile (Human)' });
  }
  const miSources = [spec.bgFeat ? `${B.name} background` : null, spec.versatile?.feat === 'magic-initiate' ? 'Versatile (Human)' : null,
    ...spec.feats.filter((f) => f.feat === 'magic-initiate').map((f) => `${C.name} ${f.level}`)].filter(Boolean);
  for (const [i, f] of featFeature.entries()) features.push({ ...f, source: miSources[i] });
  for (const f of spec.feats) {
    if (f.feat === 'magic-initiate') continue;
    const F0 = FEATS[f.feat];
    const plus = Object.entries(f.plus || {}).map(([a, v]) => `${ABILITY_NAMES[a]} +${v}`).join(', ');
    const name = f.feat === 'ability-score-improvement' ? `Ability Score Improvement: ${plus}`
      : f.feat === 'fighting-style' ? `Fighting Style feat: ${FIGHTING_STYLES[f.style].name}`
      : f.feat === 'skilled' ? `Skilled: ${f.skills.map((x) => SKILL_NAMES[x]).join(', ')}`
      : `${F0.epic ? 'Epic Boon: ' : ''}${F0.name}${plus ? ` (${plus})` : ''}`;
    const text = f.feat === 'fighting-style' ? FIGHTING_STYLES[f.style].text : F0.text;
    features.push({ name, rule: f.feat === 'fighting-style' ? FIGHTING_STYLES[f.style].rule : F0.rule, text, source: `${C.name} ${f.level}` });
  }
  const F = (lv, name, rule, text) => { if (L(lv)) features.push({ name, rule, text, source: `${C.name} ${lv}` }); };
  const mastText = () => spec.masteries.map((w) => `${WEAPONS[w].name}: ${MASTERIES[WEAPONS[w].mastery].name}`).join(', ');
  if (spec.cls === 'fighter') {
    const st = FIGHTING_STYLES[spec.style];
    F(1, `Fighting Style: ${st.name}`, st.rule, st.text);
    F(1, 'Second Wind', 'second-wind', `Bonus Action: regain 1d10 + Fighter level Hit Points. ${P.secondWind(level)} uses, one back on a Short Rest, all on a Long Rest.`);
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of ${masteryCount(cls, level)} kinds of weapons. ${mastText()}.`);
    F(2, 'Action Surge', 'action-surge', 'Once per Short or Long Rest, take one extra action on your turn (not the Magic action).');
    F(2, 'Tactical Mind', 'tactical-mind', 'When you fail an ability check, you can spend a use of Second Wind to add 1d10 to it.');
    F(3, 'Champion: Improved Critical', 'improved-critical', 'Your weapon attack rolls score a Critical Hit on a roll of 19 or 20.');
    F(3, 'Champion: Remarkable Athlete', 'remarkable-athlete', 'Advantage on Initiative rolls and Strength (Athletics) checks.');
    F(5, 'Extra Attack', 'extra-attack', 'You attack twice, instead of once, whenever you take the Attack action on your turn.');
    F(5, 'Tactical Shift', 'tactical-shift', 'When you use Second Wind, you can move up to half your Speed without provoking Opportunity Attacks.');
    if (spec.style2) F(7, `Champion: Additional Fighting Style: ${FIGHTING_STYLES[spec.style2].name}`, FIGHTING_STYLES[spec.style2].rule, FIGHTING_STYLES[spec.style2].text);
    F(9, 'Indomitable', 'indomitable', `When you fail a saving throw, you can reroll it with a bonus of +${level} (your Fighter level), and you must use the new roll. Once per Long Rest. (Used for you automatically.)`);
    F(9, 'Tactical Master', 'tactical-master', 'When you attack with a weapon whose mastery property you can use, you can swap that property for Push, Sap or Slow for that attack. (Not offered in fights here yet.)');
    F(10, 'Champion: Heroic Warrior', 'heroic-inspiration', 'During a fight, you gain Heroic Inspiration at the start of your turn if you don\'t already have it.');
    F(11, 'Two Extra Attacks', 'extra-attack', 'You attack three times, instead of once, whenever you take the Attack action on your turn.');
    F(13, 'Studied Attacks', 'studied-attacks', 'When you make an attack roll against a creature and miss, you have Advantage on your next attack roll against it before the end of your next turn.');
    F(15, 'Champion: Superior Critical', 'improved-critical', 'Your weapon attack rolls score a Critical Hit on a roll of 18, 19 or 20.');
    F(17, 'Action Surge (two uses)', 'action-surge', 'You can use Action Surge twice before a rest, but only once on a turn.');
    F(17, 'Indomitable (three uses)', 'indomitable', 'You can use Indomitable three times between Long Rests.');
    F(18, 'Champion: Survivor', 'survivor', `Defy Death: Advantage on Death Saving Throws, and a roll of 18 to 20 on one counts as a 20. Heroic Rally: at the start of each of your turns, if you are Bloodied and have at least 1 Hit Point, you regain ${5 + m.con} Hit Points (5 + CON modifier).`);
    F(20, 'Three Extra Attacks', 'extra-attack', 'You attack four times, instead of once, whenever you take the Attack action on your turn.');
  } else if (spec.cls === 'rogue') {
    F(1, 'Sneak Attack', 'sneak-attack', `Once per turn, +${P.sneakDice(level)}d6 damage with a Finesse or Ranged weapon if you have Advantage, or an ally is next to the target.`);
    F(1, 'Expertise', 'expertise', `Double Proficiency Bonus in ${spec.expertise.map((x) => SKILL_NAMES[x]).join(' and ')}.`);
    F(1, "Thieves' Cant", null, 'You know the secret mix of slang and signs rogues use, and one more language.');
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of 2 kinds of weapons. ${mastText()}.`);
    F(2, 'Cunning Action', 'cunning-action', 'Take the Dash, Disengage or Hide action as a Bonus Action.');
    F(3, 'Steady Aim', 'steady-aim', "Bonus Action, if you haven't moved this turn: Advantage on your next attack roll this turn, but your Speed is 0 until the end of the turn.");
    F(3, 'Thief: Fast Hands', 'fast-hands', 'Bonus Action: a Sleight of Hand check, or the Utilize action (pick a lock, use an object).');
    F(3, 'Thief: Second-Story Work', 'second-story-work', 'You climb at your full Speed.');
    F(5, 'Cunning Strike', 'cunning-strike', `When you deal Sneak Attack damage, you can give up some of its dice for an effect (save DC ${8 + m.dex + pb}, 8 + DEX + Proficiency Bonus). Trip (1d6): a Large or smaller target makes a Dexterity save or falls Prone. Withdraw (1d6): right after the attack, move up to half your Speed without provoking Opportunity Attacks. Poison (1d6) needs a Poisoner's Kit you don't carry. (Here: Trip is used for you when the target is still up and on its feet.)`);
    F(5, 'Uncanny Dodge', 'uncanny-dodge', 'Reaction when an attacker you can see hits you with an attack roll: halve the damage. (Used for you automatically on a hit worth halving.)');
    F(7, 'Evasion', 'evasion', "When an effect lets you make a Dexterity save to take only half damage, you take no damage on a success and half on a failure. Not while you're Incapacitated.");
    F(7, 'Reliable Talent', 'reliable-talent', 'When you make an ability check with a skill or tool you are proficient in, a d20 roll of 9 or lower counts as a 10.');
    F(9, 'Thief: Supreme Sneak', null, "A new Cunning Strike, Stealth Attack (1d6): if you're Hidden, this attack doesn't end it as long as you end the turn behind Three-Quarters or Total Cover. (The board here has only Half Cover, so it isn't offered.)");
    F(11, 'Improved Cunning Strike', 'cunning-strike', 'You can use up to two Cunning Strike effects when you deal Sneak Attack damage, paying the die cost of each. (Here: Trip and Daze together when you can pay for both.)');
    F(13, 'Thief: Use Magic Device', null, 'You can attune to four magic items, may not spend a charge when you use one, and can use any Spell Scroll. (The heroes here carry no magic items yet.)');
    F(14, 'Devious Strikes', 'devious-strikes', `New Cunning Strike effects. Daze (2d6): the target makes a Constitution save or, on its next turn, can only move or take an action or a Bonus Action. Knock Out (6d6): Constitution save or Unconscious for 1 minute, or until it takes damage (a save at the end of each of its turns ends it). Obscure (3d6): Dexterity save or Blinded until the end of its next turn. (Here: Knock Out is used for you on a foe that would stay standing, Daze otherwise.)`);
    F(15, 'Slippery Mind', 'proficiency', 'Proficiency in Wisdom and Charisma saving throws.');
    F(17, "Thief: Thief's Reflexes", 'thiefs-reflexes', 'You take two turns in the first round of a fight: the first at your Initiative, the second at your Initiative minus 10. You can\'t use this if you are Surprised.');
    F(18, 'Elusive', 'elusive', "No attack roll can have Advantage against you unless you have the Incapacitated condition.");
    F(20, 'Stroke of Luck', 'stroke-of-luck', 'When you fail a D20 Test, you can turn the roll into a 20. Once per Short or Long Rest. (Used for you automatically on a failed save, or on a miss against a foe with 100 or more Hit Points.)');
  } else if (spec.cls === 'cleric') {
    F(1, 'Spellcasting', 'spellcasting', `Cantrips at will; prepared spells use spell slots. Wisdom is your spellcasting ability. You prepare ${PREPARED_BY_LEVEL.cleric[level]} spells from the Cleric list and can change them after a Long Rest.`);
    if (spec.order === 'thaumaturge') F(1, 'Divine Order: Thaumaturge', 'divine-order', `One extra cantrip, and +${Math.max(1, m.wis)} (your Wisdom modifier, at least 1) to Intelligence (Arcana and Religion) checks.`);
    else F(1, 'Divine Order: Protector', 'divine-order', 'Training with Heavy armor and Martial weapons.');
    F(2, 'Channel Divinity', 'channel-divinity', `${P.channelCleric(level)} uses (one back on a Short Rest, all on a Long Rest): Divine Spark (heal or harm, 1d8 + WIS) or Turn Undead.`);
    F(3, 'Life Domain: Disciple of Life', 'disciple-of-life', 'Healing spells cast with a spell slot restore 2 + the slot\'s level extra Hit Points.');
    F(3, 'Life Domain: Preserve Life', 'preserve-life', 'Channel Divinity: share out 5 × your Cleric level Hit Points among Bloodied allies within 30 feet (up to half their maximum).');
    F(3, 'Life Domain Spells', 'spellcasting', `Always prepared, not counted: ${alwaysPrepared(cls, level).map((x) => SPELLS[x].name).join(', ')}.`);
    F(5, 'Sear Undead', 'sear-undead', `When you use Turn Undead, roll ${Math.max(1, m.wis)}d8 (your Wisdom modifier in d8s): each Undead that fails the save takes that much Radiant damage.`);
    F(6, 'Life Domain: Blessed Healer', 'blessed-healer', 'When a spell you cast with a spell slot restores Hit Points to another creature, you regain 2 + the slot\'s level Hit Points.');
    if (spec.strikes) F(7, `Blessed Strikes: ${STRIKES.cleric[spec.strikes].name}`, STRIKES.cleric[spec.strikes].rule, STRIKES.cleric[spec.strikes].text);
    F(7, 'Divine Spark 2d8', 'channel-divinity', 'Divine Spark now rolls 2d8 instead of 1d8.');
    F(10, 'Divine Intervention', 'divine-intervention', 'Once per Long Rest, as a Magic action, cast any Cleric spell of level 5 or lower that doesn\'t take a Reaction, without a spell slot. (Here: any Cleric spell you have prepared.)');
    F(13, 'Divine Spark 3d8', 'channel-divinity', 'Divine Spark now rolls 3d8.');
    F(17, 'Life Domain: Supreme Healing', 'supreme-healing', 'When you would roll dice to restore Hit Points with a spell or Channel Divinity, use the highest number on each die instead.');
    F(20, 'Greater Divine Intervention', 'divine-intervention', 'When you use Divine Intervention, you can choose Wish. If you do, you can\'t use Divine Intervention again for 2d4 Long Rests. (Wish is a spell for outside of fights here.)');
    if (spec.strikes) F(14, 'Improved Blessed Strikes', spec.strikes === 'divine' ? 'divine-strike' : 'potent-spellcasting', spec.strikes === 'divine' ? 'Divine Strike deals 2d8 instead of 1d8.' : `When a Cleric cantrip of yours deals damage, you or a creature within 60 feet gains ${2 * Math.max(1, m.wis)} Temporary Hit Points (twice your Wisdom modifier). (Here: the ally who needs them most.)`);
  } else if (spec.cls === 'wizard') {
    F(1, 'Spellcasting', 'spellcasting', `Cantrips at will; prepared spells use spell slots. Intelligence is your spellcasting ability. Your spellbook holds ${spec.book.length} spells; you prepare ${PREPARED_BY_LEVEL.wizard[level]} of them and can change them after a Long Rest.`);
    F(1, 'Ritual Adept', 'rituals', 'Cast Ritual spells from your spellbook without preparing them.');
    F(1, 'Arcane Recovery', 'arcane-recovery', 'Once a day, when you finish a Short Rest, regain spent spell slots whose levels add up to half your Wizard level (rounded up).');
    if (scholar) F(2, `Scholar: ${SKILL_NAMES[scholar]}`, 'expertise', `Expertise in ${SKILL_NAMES[scholar]}.`);
    F(3, 'Evoker: Potent Cantrip', 'potent-cantrip', 'When a creature succeeds on a save against your damaging cantrip, or your cantrip attack misses, it still takes half the damage.');
    F(3, 'Evoker: Evocation Savant', null, 'Copying Evocation spells into your spellbook takes half the time and gold.');
    F(5, 'Memorize Spell', null, 'When you finish a Short Rest, you can swap one prepared spell for another in your spellbook. (Useful outside of fights.)');
    F(6, 'Evoker: Sculpt Spells', 'sculpt-spells', 'When you cast an Evocation spell that makes others save, up to 1 + the spell\'s level of your allies in it succeed automatically and take no damage from it. (Used for you automatically.)');
    F(10, 'Evoker: Empowered Evocation', 'empowered-evocation', `Add your Intelligence modifier (+${m.int}) to one damage roll of any Wizard Evocation spell you cast.`);
    if (spec.mastery) F(18, 'Spell Mastery', 'spell-mastery', `Always prepared, and cast at will at their lowest level with no spell slot: ${Object.values(spec.mastery).filter(Boolean).map((x) => SPELLS[x].name).join(' and ')}. You can swap them after a Long Rest.`);
    if (spec.signature?.length) F(20, 'Signature Spells', 'signature-spells', `Always prepared: ${spec.signature.map((x) => SPELLS[x].name).join(' and ')}. You can cast each once at level 3 with no spell slot, and get the casts back on a Short or Long Rest.`);
    F(14, 'Evoker: Overchannel', 'overchannel', 'When you cast a Wizard spell of level 1 to 5 that deals damage, you can deal the most damage it could. The first time is free; each later time before a Long Rest you take 2d12 Necrotic damage per spell level (1d12 more each time after that), which ignores Resistance and Immunity.');
  }
  const names = (xs) => xs.map((x) => SPELLS[x].name).join(', ');
  const prepText = (ab, how) => `Cantrips at will; prepared spells use spell slots. ${ab} is your spellcasting ability. You prepare ${PREPARED_BY_LEVEL[cls][level]} ${C.name} spells${how}`;
  const styleF = (lv) => {
    if (!spec.style) return;
    const st = FIGHTING_STYLES[spec.style];
    F(lv, `Fighting Style: ${st.name}`, st.rule, `${st.text}${spec.warriorCantrips?.length ? ` Yours: ${names(spec.warriorCantrips)}.` : ''}`);
  };
  const rageUses = P.rages(level);
  if (cls === 'barbarian') {
    F(1, 'Rage', 'rage', `Bonus Action, without Heavy armor: Resistance to Bludgeoning, Piercing and Slashing damage, +${P.rageDamage(level)} damage on Strength weapon attacks, and Advantage on Strength checks and saves. No spells or Concentration while raging. It lasts until the end of your next turn, and goes on each turn you attack an enemy, make one save or use a Bonus Action to keep it up. ${rageUses} uses; one back on a Short Rest, all on a Long Rest.`);
    F(1, 'Unarmored Defense', 'unarmored-defense', 'Without armor, your AC is 10 + DEX + CON. A Shield still adds +2.');
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of ${masteryCount(cls, level)} kinds of weapons. ${mastText()}.`);
    F(2, 'Danger Sense', 'danger-sense', "Advantage on Dexterity saving throws, unless you're Incapacitated.");
    F(2, 'Reckless Attack', 'reckless-attack', 'When you make your first attack roll on your turn, you can attack recklessly: Advantage on attack rolls using Strength until the start of your next turn, but attack rolls against you have Advantage too.');
    F(3, 'Primal Knowledge', 'skills', 'Proficiency in one more skill from the Barbarian list.');
    F(3, 'Berserker: Frenzy', 'frenzy', `If you use Reckless Attack while raging, the first creature you hit on your turn with a Strength attack takes an extra ${P.rageDamage(level)}d6 damage (one d6 per point of your Rage Damage).`);
    F(5, 'Extra Attack', 'extra-attack', 'You attack twice, instead of once, whenever you take the Attack action on your turn.');
    F(5, 'Fast Movement', 'fast-movement', '+10 feet of Speed while you aren\'t wearing Heavy armor.');
    F(6, 'Berserker: Mindless Rage', 'mindless-rage', "While raging, you can't be Charmed or Frightened, and entering a Rage ends those conditions on you.");
    F(7, 'Feral Instinct', 'feral-instinct', 'Advantage on Initiative rolls.');
    F(7, 'Instinctive Pounce', 'instinctive-pounce', 'As part of the Bonus Action you take to enter a Rage, you can move up to half your Speed.');
    F(9, 'Brutal Strike', 'brutal-strike', "When you use Reckless Attack, you can give up the Advantage on one Strength attack on your turn. If it hits, it deals an extra 1d10 damage and one of: Forceful Blow (the target is pushed 15 feet straight away from you) or Hamstring Blow (its Speed drops by 15 feet until the start of your next turn). (Here: used on your first Reckless attack each turn when you'd still be likely to hit. It's Hamstring Blow while you have attacks left, so the target stays in reach, and Forceful Blow on your last attack, or Hamstring when there's no room to push.)");
    F(10, 'Berserker: Retaliation', 'retaliation', 'Reaction when a creature within 5 feet of you damages you: make one melee attack against it. (Used for you automatically.)');
    F(11, 'Relentless Rage', 'relentless-rage', `If you drop to 0 Hit Points while raging and don't die outright, make a DC 10 Constitution save. On a success your Hit Points become ${2 * level} instead (twice your Barbarian level). Each use adds 5 to the DC; it goes back to 10 after a Short or Long Rest.`);
    F(13, 'Improved Brutal Strike', 'brutal-strike', 'Brutal Strike gains two more effects. Staggering Blow: the target has Disadvantage on its next saving throw and can\'t make Opportunity Attacks until the start of your next turn. Sundering Blow: the next attack roll by another creature against the target, before the start of your next turn, gets +5. (Here: Sundering Blow when an ally is next to the target.)');
    F(14, 'Berserker: Intimidating Presence', 'intimidating-presence', `Bonus Action: each creature you choose in a 30-foot Emanation makes a Wisdom save (DC ${8 + m.str + pb}, 8 + STR + Proficiency Bonus) or is Frightened of you for 1 minute, saving again at the end of each of its turns. Once per Long Rest, or spend a use of Rage to use it again.`);
    F(17, 'Improved Brutal Strike', 'brutal-strike', 'Brutal Strike now deals 2d10 extra damage, and you can use two different Brutal Strike effects on the hit. (Here: picked for you, as for one.)');
    F(18, 'Indomitable Might', 'indomitable-might', `If your total for a Strength check or Strength saving throw is less than your Strength score (${scores.str}), you can use the score instead.`);
    F(20, 'Primal Champion', 'primal-champion', 'Your Strength and Constitution scores rise by 4, to a maximum of 25.');
    F(15, 'Persistent Rage', 'persistent-rage', 'Once per Long Rest, when you roll Initiative, you regain all your uses of Rage. Your Rage lasts 10 minutes without needing to be kept up, and ends early only if you fall Unconscious or put on Heavy armor.');
  } else if (cls === 'bard') {
    F(1, 'Bardic Inspiration', 'bardic-inspiration', `Bonus Action: give a creature within 60 feet a d${P.bardicDie(level)}. Once in the next hour, when it fails a D20 Test, it can roll the die and add it, maybe turning the failure into a success (here: used for it automatically when that would work). ${Math.max(1, m.cha)} uses (your Charisma modifier, at least 1); all back on a ${L(5) ? 'Short or ' : ''}Long Rest.`);
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Charisma', '. When you gain a Bard level you can swap one of them for another, and one cantrip.')}`);
    F(2, 'Expertise', 'expertise', `Double Proficiency Bonus in ${spec.expertise.map((x) => SKILL_NAMES[x]).join(' and ')}.`);
    F(2, 'Jack of All Trades', 'jack-of-all-trades', `Add half your Proficiency Bonus (+${Math.floor(pb / 2)}) to skill checks with skills you aren't proficient in.`);
    F(3, 'College of Lore: Bonus Proficiencies', 'skills', 'Proficiency in three more skills of your choice.');
    F(3, 'College of Lore: Cutting Words', 'cutting-words', 'Reaction when a creature you can see within 60 feet succeeds on an attack roll or ability check, or rolls damage: spend a Bardic Inspiration and subtract the die from its roll. (Here: used for you automatically against an attack roll it could turn into a miss.)');
    F(5, 'Font of Inspiration', 'font-of-inspiration', 'You regain all your Bardic Inspiration on a Short Rest as well as a Long Rest. You can also spend a spell slot (no action) to regain one use.');
    if (spec.discoveries?.length) F(6, `College of Lore: Magical Discoveries`, 'spellcasting', `Always prepared, not counted: ${names(spec.discoveries)} (from the Cleric, Druid and Wizard lists). You can swap one when you gain a Bard level.`);
    F(7, 'Countercharm', 'countercharm', 'Reaction when you or a creature within 30 feet fails a save against being Charmed or Frightened: it rerolls the save with Advantage. (Used for you automatically.)');
    F(10, 'Magical Secrets', 'magical-secrets', 'The spells you prepare can come from the Bard, Cleric, Druid and Wizard lists, and they count as Bard spells for you.');
    F(18, 'Superior Inspiration', 'superior-inspiration', 'When you roll Initiative, you regain uses of Bardic Inspiration until you have two, if you have fewer than that.');
    F(20, 'Words of Creation', 'words-of-creation', 'Power Word Heal and Power Word Kill are always prepared. When you cast either one, it can also target a second creature within 10 feet of the first.');
    F(14, 'College of Lore: Peerless Skill', 'peerless-skill', 'When you make an ability check or attack roll and fail, you can spend a Bardic Inspiration, roll it and add it, maybe turning the failure into a success. If it still fails, the use isn\'t spent. (Used for you automatically when it would work.)');
  } else if (cls === 'druid') {
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Wisdom', ' and can change them after a Long Rest.')}`);
    F(1, 'Druidic', null, 'You know Druidic, the secret language of druids.');
    F(1, `Primal Order: ${DRUID_ORDERS[spec.order].name}`, 'primal-order', DRUID_ORDERS[spec.order].text);
    F(2, 'Wild Shape', 'wild-shape', `Bonus Action: turn into a Beast you know (here: a Wolf, AC 12, Speed 40, Bite +4 for 1d6 + 2 that knocks a Medium or smaller creature Prone). You keep your own Hit Points and gain ${level} Temporary Hit Points (your Druid level). No spellcasting in beast form. It ends as a Bonus Action, or if you're Incapacitated or drop to 0 HP. ${P.wildShape(level)} uses; one back on a Short Rest, all on a Long Rest.`);
    F(2, 'Wild Companion', null, 'Spend a spell slot or a use of Wild Shape to cast Find Familiar. (Useful outside of fights here.)');
    if (spec.land) F(3, `Circle of the Land: ${LAND_SPELLS[spec.land].name}`, 'spellcasting', `Always prepared, not counted: ${names(landSpells(spec.land, level))}. You can pick another land after a Long Rest.`);
    F(3, "Circle of the Land: Land's Aid", 'lands-aid', 'Magic action, one use of Wild Shape: pick a point within 60 feet. Each enemy in a 10-foot Sphere there makes a Constitution save against your spell save DC: 2d6 Necrotic damage, half on a success. One ally in it regains 2d6 Hit Points.');
    F(5, 'Wild Resurgence', 'wild-resurgence', 'Once per turn, with no uses of Wild Shape left, you can spend a spell slot to regain one. Once per Long Rest, you can spend a use of Wild Shape to regain a level 1 spell slot. (The first is offered when your Wild Shape uses run out; the second is useful outside of fights here.)');
    F(6, 'Circle of the Land: Natural Recovery', 'natural-recovery', 'Once per Long Rest, cast one of your Circle spells of level 1 or higher without a spell slot. (Here: the highest-level one has that free cast.) Once per Long Rest on a Short Rest, regain slots adding up to half your Druid level (useful outside of fights).');
    if (spec.strikes) F(7, `Elemental Fury: ${STRIKES.druid[spec.strikes].name}`, STRIKES.druid[spec.strikes].rule, STRIKES.druid[spec.strikes].text);
    if (spec.land) F(10, "Circle of the Land: Nature's Ward", 'natures-ward', `You can't be Poisoned, and you have Resistance to ${LAND_SPELLS[spec.land].ward} damage (from your land).`);
    if (spec.land) F(14, "Circle of the Land: Nature's Sanctuary", 'natures-sanctuary', `Magic action, one use of Wild Shape: spectral trees fill a 15-foot Cube within 120 feet for 1 minute. You and your allies in it have Half Cover, and your allies in it gain your Resistance to ${LAND_SPELLS[spec.land].ward} damage. (Here: the Cube stays where you put it.)`);
    F(18, 'Beast Spells', 'beast-spells', 'You can cast spells in Wild Shape, except a spell that needs a Material component with a cost or one that is used up.');
    F(20, 'Archdruid', 'archdruid', 'Evergreen Wild Shape: when you roll Initiative with no uses of Wild Shape left, you regain one. Nature Magician: you can turn uses of Wild Shape into a spell slot, two levels per use, once per Long Rest (useful outside of fights). Longevity: you age only one year for every ten that pass.');
    if (spec.strikes) F(15, 'Improved Elemental Fury', spec.strikes === 'primal' ? 'primal-strike' : 'potent-spellcasting', spec.strikes === 'primal' ? 'Primal Strike deals 2d8 instead of 1d8.' : 'Your Druid cantrips with a range of 10 feet or more reach 300 feet farther.');
  } else if (cls === 'monk') {
    F(1, 'Martial Arts', 'martial-arts', 'With no armor and no Shield: your Unarmed Strikes and Monk weapons (Simple melee weapons, and Martial melee weapons with the Light property) deal at least ${martialDie}, your Martial Arts die, and can use Dexterity. Bonus Action: one Unarmed Strike.');
    F(1, 'Unarmored Defense', 'unarmored-defense', 'Without armor or a Shield, your AC is 10 + DEX + WIS.');
    F(2, "Monk's Focus", 'monks-focus', `${level} Focus Points, all back on a Short or Long Rest. Flurry of Blows: 1 point, two Unarmed Strikes as a Bonus Action. Patient Defense: Disengage as a Bonus Action, or 1 point to Disengage and Dodge. Step of the Wind: Dash as a Bonus Action, or 1 point to Disengage and Dash.`);
    F(2, 'Unarmored Movement', 'unarmored-movement', `+${P.unarmoredMovement(level)} feet of Speed without armor or a Shield.`);
    F(2, 'Uncanny Metabolism', 'uncanny-metabolism', `Once per Long Rest, when you roll Initiative: regain all Focus Points and ${martialDie} + ${level} Hit Points (your Martial Arts die + Monk level) (used for you automatically when it helps).`);
    F(3, 'Deflect Attacks', 'deflect-attacks', "Reaction when an attack roll hits you for Bludgeoning, Piercing or Slashing damage: take 1d10 + DEX + your Monk level less. If that brings it to 0, spend 1 Focus Point to send it back: a creature within 5 feet (60 for a ranged attack) makes a Dexterity save against your Focus DC or takes 2d6 + DEX of the attack's type. (Used for you automatically.)");
    F(3, 'Open Hand Technique', 'open-hand-technique', `When a Flurry of Blows strike hits, you can also Addle it (no Opportunity Attacks until its next turn), Push it (Strength save or pushed 15 feet away) or Topple it (Dexterity save or Prone). Focus save DC ${8 + m.wis + pb} (8 + WIS + Proficiency Bonus).`);
    F(4, 'Slow Fall', null, `Reaction when you fall: take ${5 * level} less falling damage (5 × Monk level). (Useful outside of fights here.)`);
    F(5, 'Extra Attack', 'extra-attack', 'You attack twice, instead of once, whenever you take the Attack action on your turn.');
    F(5, 'Stunning Strike', 'stunning-strike', `Once per turn, when you hit with a Monk weapon or an Unarmed Strike, spend 1 Focus Point: the target makes a Constitution save (DC ${8 + m.wis + pb}). On a failure it is Stunned until the start of your next turn. On a success its Speed is halved and the next attack roll against it has Advantage. (Used for you automatically while you have Focus Points.)`);
    F(6, 'Empowered Strikes', 'empowered-strikes', 'Your Unarmed Strikes can deal Force damage instead of their normal type. (Used for you when the target resists Bludgeoning.)');
    F(6, 'Open Hand: Wholeness of Body', 'wholeness-of-body', `Bonus Action: regain ${martialDie} + ${Math.max(1, m.wis)} Hit Points (your Martial Arts die + WIS modifier). ${Math.max(1, m.wis)} uses (your Wisdom modifier, at least 1), all back on a Long Rest.`);
    F(7, 'Evasion', 'evasion', "When an effect lets you make a Dexterity save to take only half damage, you take no damage on a success and half on a failure. Not while you're Incapacitated.");
    F(9, 'Acrobatic Movement', null, 'Without armor or a Shield, you can move along vertical surfaces and across liquids on your turn. (The board here is flat.)');
    F(10, 'Heightened Focus', 'heightened-focus', 'Flurry of Blows makes three Unarmed Strikes instead of two. Patient Defense with a Focus Point also gives you Temporary Hit Points equal to two rolls of your Martial Arts die.');
    F(10, 'Self-Restoration', 'self-restoration', 'At the end of each of your turns, you can end one of these conditions on yourself: Charmed, Frightened or Poisoned.');
    F(11, 'Open Hand: Fleet Step', 'fleet-step', 'When you take a Bonus Action other than Step of the Wind, you can also use Step of the Wind right after it. (Here: after Flurry of Blows, you can spend 1 Focus Point to Disengage and Dash.)');
    F(13, 'Deflect Energy', 'deflect-attacks', 'Deflect Attacks now works against attacks of any damage type, not only Bludgeoning, Piercing and Slashing.');
    F(14, 'Disciplined Survivor', 'disciplined-survivor', 'Proficiency in every saving throw. When you fail a save, you can spend 1 Focus Point to reroll it, and you must use the new roll. (Used for you automatically.)');
    F(17, 'Open Hand: Quivering Palm', 'quivering-palm', `When you hit a creature with an Unarmed Strike, you can spend 4 Focus Points to start deadly vibrations in its body. Later, when you take the Attack action, you can give up one of the attacks to end them: the creature makes a Constitution save (DC ${8 + m.wis + pb}), taking 10d12 Force damage on a failure, half on a success. (Here: started for you on a foe with 60 or more Hit Points.)`);
    F(18, 'Superior Defense', 'superior-defense', 'At the start of your turn, you can spend 3 Focus Points: for 1 minute, or until you are Incapacitated, you have Resistance to all damage except Force.');
    F(20, 'Body and Mind', 'body-and-mind', 'Your Dexterity and Wisdom scores rise by 4, to a maximum of 25.');
    F(15, 'Perfect Focus', 'perfect-focus', 'When you roll Initiative and don\'t use Uncanny Metabolism, you regain Focus Points until you have 4, if you have 3 or fewer.');
  } else if (cls === 'paladin') {
    F(1, 'Lay on Hands', 'lay-on-hands', `A pool of ${5 * level} Hit Points (5 × Paladin level), refilled on a Long Rest. Bonus Action: touch a creature and restore Hit Points from the pool, or spend 5 to end the Poisoned condition on it.`);
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Charisma', '. After a Long Rest you can swap one of them for another.')}`);
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of 2 kinds of weapons. ${mastText()}.`);
    styleF(2);
    F(2, "Paladin's Smite", 'divine-smite', 'Divine Smite is always prepared, and you can cast it once per Long Rest without a spell slot.');
    F(3, 'Channel Divinity', 'channel-divinity', `${P.channelPaladin(level)} uses (one back on a Short Rest, all on a Long Rest). Divine Sense: sense Celestials, Fiends and Undead nearby (useful outside of fights). Your oath adds Sacred Weapon.`);
    F(3, 'Oath of Devotion: Sacred Weapon', 'sacred-weapon', `When you take the Attack action, spend a Channel Divinity: for 10 minutes, add your Charisma modifier (+${Math.max(1, m.cha)}) to attack rolls with melee weapons, which shed light and can deal Radiant damage.`);
    F(3, 'Oath of Devotion Spells', 'spellcasting', `Always prepared, not counted: ${alwaysPrepared(cls, level).filter((x) => !['divine-smite', 'find-steed'].includes(x)).map((x) => SPELLS[x].name).join(', ')}.`);
    F(5, 'Extra Attack', 'extra-attack', 'You attack twice, instead of once, whenever you take the Attack action on your turn.');
    F(5, 'Faithful Steed', null, 'Find Steed is always prepared, and you can cast it once per Long Rest without a spell slot. (Useful outside of fights here.)');
    F(6, 'Aura of Protection', 'aura-of-protection', `A 10-foot Emanation around you, while you aren't Incapacitated: you and your allies in it add +${Math.max(1, m.cha)} (your Charisma modifier, at least +1) to saving throws.`);
    F(7, 'Oath of Devotion: Aura of Devotion', 'aura-of-devotion', "You and your allies in your Aura of Protection can't be Charmed.");
    F(9, 'Abjure Foes', 'abjure-foes', `Magic action, one Channel Divinity: up to ${Math.max(1, m.cha)} creatures you can see within 60 feet make a Wisdom save or are Frightened of you for 1 minute or until they take damage. While Frightened this way, each can move, take an action or take a Bonus Action on its turn, only one of them.`);
    F(10, 'Aura of Courage', 'aura-of-courage', "You and your allies in your Aura of Protection can't be Frightened.");
    F(11, 'Radiant Strikes', 'radiant-strikes', 'When you hit a target with a melee weapon or an Unarmed Strike, it takes an extra 1d8 Radiant damage.');
    F(14, 'Restoring Touch', 'lay-on-hands', 'When you use Lay on Hands, you can also spend 5 points from the pool per condition to end Blinded, Charmed, Frightened, Paralyzed or Stunned on the creature (Deafened too).');
    F(18, 'Aura Expansion', 'aura-of-protection', 'Your Aura of Protection is now a 30-foot Emanation.');
    F(20, 'Oath of Devotion: Holy Nimbus', 'holy-nimbus', `Bonus Action, once per Long Rest (or spend a level 5 spell slot): for 10 minutes your aura shines. An enemy that starts its turn in the aura takes ${Math.max(1, m.cha) + pb} Radiant damage (CHA modifier + Proficiency Bonus), and you have Advantage on saving throws forced by Fiends and Undead. (Here: a save counts as forced by the creature whose turn it is.)`);
    F(15, 'Oath of Devotion: Smite of Protection', 'smite-of-protection', 'When you cast Divine Smite, you and your allies in your Aura of Protection have Half Cover until the start of your next turn.');
  } else if (cls === 'ranger') {
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Wisdom', '. After a Long Rest you can swap one of them for another.')}`);
    F(1, 'Favored Enemy', 'favored-enemy', `Hunter's Mark is always prepared, and you can cast it ${P.favoredEnemy(level)} times per Long Rest without a spell slot.`);
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of 2 kinds of weapons. ${mastText()}.`);
    F(2, 'Deft Explorer', 'expertise', `Expertise in ${spec.expertise.map((x) => SKILL_NAMES[x]).join(' and ')}, and two more languages.`);
    styleF(2);
    F(3, "Hunter: Hunter's Lore", null, "While a creature is marked by your Hunter's Mark, you know its Immunities, Resistances and Vulnerabilities.");
    if (spec.prey) F(3, `Hunter: ${HUNTER_PREY[spec.prey].name}`, HUNTER_PREY[spec.prey].rule, `${HUNTER_PREY[spec.prey].text} You can switch Hunter's Prey after a Short or Long Rest.`);
    F(5, 'Extra Attack', 'extra-attack', 'You attack twice, instead of once, whenever you take the Attack action on your turn.');
    F(6, 'Roving', 'roving', '+10 feet of Speed while you aren\'t wearing Heavy armor, and a Climb Speed and Swim Speed equal to your Speed.');
    if (spec.tactics) F(7, `Hunter: ${DEFENSIVE_TACTICS[spec.tactics].name}`, DEFENSIVE_TACTICS[spec.tactics].rule, `${DEFENSIVE_TACTICS[spec.tactics].text} You can switch Defensive Tactics after a Short or Long Rest.`);
    F(10, 'Tireless', 'tireless', `Magic action: gain 1d8 + ${Math.max(1, m.wis)} Temporary Hit Points (WIS modifier). ${Math.max(1, m.wis)} uses, all back on a Long Rest. Each Short Rest also lowers your Exhaustion by 1.`);
    F(11, "Hunter: Superior Hunter's Prey", 'superior-hunters-prey', "Once per turn, when you deal Hunter's Mark damage to a creature, you also deal that damage to another creature you can see within 30 feet of it. (Used for you automatically.)");
    F(13, 'Relentless Hunter', 'relentless-hunter', "Taking damage can't break your Concentration on Hunter's Mark.");
    F(14, "Nature's Veil", 'natures-veil', `Bonus Action: you are Invisible until the end of your next turn. ${Math.max(1, m.wis)} uses (your Wisdom modifier, at least 1), all back on a Long Rest.`);
    F(17, 'Precise Hunter', 'precise-hunter', "You have Advantage on attack rolls against the creature marked by your Hunter's Mark.");
    F(18, 'Feral Senses', 'feral-senses', 'Blindsight 30 feet: you can see things within 30 feet of you that you can\'t otherwise see, Invisible creatures included.');
    F(20, 'Foe Slayer', 'foe-slayer', "The damage die of your Hunter's Mark is a d10 instead of a d6.");
    F(15, "Hunter: Superior Hunter's Defense", 'superior-hunters-defense', 'Reaction when you take damage: you have Resistance to that damage, and more of the same type, until the end of the turn. (Used for you automatically on a big hit.)');
  } else if (cls === 'sorcerer') {
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Charisma', '. When you gain a Sorcerer level you can swap one of them for another, and one cantrip.')}`);
    F(1, 'Innate Sorcery', 'innate-sorcery', 'Bonus Action, twice per Long Rest: for 1 minute, your Sorcerer spells get +1 to their save DC, and you have Advantage on their attack rolls.');
    F(2, 'Font of Magic', 'font-of-magic', `${level} Sorcery Points, all back on a Long Rest. Bonus Action: turn Sorcery Points into a spell slot: ${Object.entries(SLOT_COST).filter(([lv]) => level >= SLOT_MIN_LEVEL[lv]).map(([lv, c]) => `${c} for level ${lv}`).join(', ')}. With no action, turn a spell slot into points equal to its level. Slots you make vanish on a Long Rest.`);
    if (spec.metamagic.length) F(2, `Metamagic: ${spec.metamagic.map((x) => METAMAGIC[x].name).join(', ')}`, 'metamagic', spec.metamagic.map((x) => `${METAMAGIC[x].name} (${METAMAGIC[x].cost} point${METAMAGIC[x].cost > 1 ? 's' : ''}): ${METAMAGIC[x].text}`).join(' '));
    F(3, 'Draconic Sorcery: Draconic Resilience', 'draconic-resilience', `+${level} Hit Points (3, and one more per later Sorcerer level), and without armor your AC is 10 + DEX + CHA.`);
    F(3, 'Draconic Spells', 'spellcasting', `Always prepared, not counted: ${names(alwaysPrepared(cls, level))}.`);
    F(5, 'Sorcerous Restoration', 'sorcerous-restoration', `Once per Long Rest, when you finish a Short Rest, regain up to ${Math.floor(level / 2)} spent Sorcery Points (half your Sorcerer level).`);
    if (spec.affinity) F(6, `Draconic Sorcery: Elemental Affinity (${spec.affinity})`, 'elemental-affinity', `Resistance to ${spec.affinity} damage, and when you cast a spell that deals ${spec.affinity} damage, add your Charisma modifier (+${m.cha}) to one damage roll of it.`);
    F(7, 'Sorcery Incarnate', 'sorcery-incarnate', 'With no Innate Sorcery uses left, you can spend 2 Sorcery Points to use it anyway. While it is active, you can use up to two Metamagic options on each spell. (Here: one at a time.)');
    F(18, 'Draconic Sorcery: Dragon Companion', null, 'Summon Dragon is always prepared, and once per Long Rest you can cast it without a spell slot, and without Concentration, for 1 minute. (Summon Dragon is a spell for outside of fights here.)');
    F(20, 'Arcane Apotheosis', 'arcane-apotheosis', 'While your Innate Sorcery is active, you can use one Metamagic option on each of your turns without spending Sorcery Points on it.');
    F(14, 'Draconic Sorcery: Dragon Wings', null, 'Bonus Action: dragon wings give you a Fly Speed of 60 feet for 1 hour, once per Long Rest (or for 3 Sorcery Points). (The board here is flat, so it is used outside of fights.)');
  } else if (cls === 'warlock') {
    const sl = Object.entries(slotTable(cls)[level])[0];
    F(1, 'Pact Magic', 'pact-magic', `${sl[1]} spell slot${sl[1] > 1 ? 's' : ''} of level ${sl[0]}, all back on a Short or Long Rest. Charisma is your spellcasting ability. You prepare ${PREPARED_BY_LEVEL.warlock[level]} Warlock spells and can swap one, and one cantrip, when you gain a level.`);
    for (const x of spec.invocations) F(1, `Invocation: ${INVOCATIONS[x].name}`, 'eldritch-invocations', `${INVOCATIONS[x].text}${x === 'pact-of-the-blade' ? ` Yours: ${WEAPONS[spec.pactWeapon].name}.` : ''}`);
    F(2, 'Magical Cunning', null, 'Once per Long Rest, a 1-minute rite regains up to half your Pact Magic slots. (Not used here: a Short Rest gives them all back anyway.)');
    F(3, "Fiend Patron: Dark One's Blessing", 'dark-ones-blessing', `When you drop an enemy to 0 Hit Points, or one within 10 feet of you drops to 0, you gain ${Math.max(1, m.cha + level)} Temporary Hit Points (CHA modifier + Warlock level).`);
    F(3, 'Fiend Patron Spells', 'spellcasting', `Always prepared, not counted: ${names(alwaysPrepared(cls, level))}.`);
    F(6, "Fiend Patron: Dark One's Own Luck", 'dark-ones-own-luck', `When you make an ability check or a saving throw, you can add 1d10 to it after seeing the roll. ${Math.max(1, m.cha)} uses (your Charisma modifier, at least 1), all back on a Long Rest. (Used for you automatically when it could turn a failed save into a success.)`);
    F(9, 'Contact Patron', null, 'Contact Other Plane is always prepared, and once per Long Rest you can cast it without a slot and succeed on its save. (Useful outside of fights.)');
    if (spec.resilience) F(10, `Fiend Patron: Fiendish Resilience (${spec.resilience})`, 'fiendish-resilience', `Resistance to ${spec.resilience} damage. After a Short or Long Rest you can pick another type (not Force).`);
    for (const [sl, sid] of Object.entries(spec.arcanum || {})) F({ 6: 11, 7: 13, 8: 15, 9: 17 }[sl], `Mystic Arcanum: ${SPELLS[sid].name}`, 'mystic-arcanum', `Once per Long Rest, cast ${SPELLS[sid].name} (a level ${sl} Warlock spell) without a spell slot.`);
    F(20, 'Eldritch Master', null, 'When you use Magical Cunning, you regain all your spent Pact Magic slots. (Not used here: a Short Rest gives them all back anyway.)');
    F(14, 'Fiend Patron: Hurl Through Hell', 'hurl-through-hell', `Once per turn, when you hit a creature with an attack roll, you can make it a Charisma save against your spell save DC. On a failure it vanishes through the lower planes until the end of your next turn, then comes back: it takes 8d10 Psychic damage (unless it is a Fiend) and is Incapacitated until then. Once per Long Rest, or spend a Pact Magic slot to use it again. (Used for you automatically on a tough foe.)`);
  }
  features.push({ name: `Equipment: ${kit.name}`, rule: null, text: kit.text, source: C.name });
  // Class features and feats in level order (species and background first, equipment last).
  const fkey = (f) => (f.source === C.name ? 99 : f.source?.startsWith(`${C.name} `) ? +f.source.slice(C.name.length + 1) : -1);
  features.sort((p, q) => fkey(p) - fkey(q));

  const ancestry = DRAGON_ANCESTRY[spec.ancestry];
  const resist = [...(SPECIES_RESIST[spec.species] || [])];
  if (spec.species === 'dragonborn') resist.push(ancestry.type);
  if (lin?.resist) resist.push(lin.resist);
  if (cls === 'druid' && L(10) && spec.land) resist.push(LAND_SPELLS[spec.land].ward);
  if (spec.affinity) resist.push(spec.affinity);
  if (spec.resilience) resist.push(spec.resilience);
  const condImmune = cls === 'druid' && L(10) ? ['poisoned'] : [];
  const giant = spec.species === 'goliath' ? { kind: spec.lineage, uses: pb, max: pb } : null;
  return {
    id, side: 'hero', cls: spec.cls, kind: spec.cls, className: C.name, emoji: C.emoji, subclass: sub,
    name: (name || spec.name || C.name).slice(0, 20), level, pb, spec,
    species: lin && spec.species !== 'goliath' ? `${lin.name}${spec.species === 'tiefling' ? ' Tiefling' : ''}` : S.name, speciesId: spec.species, lineage: spec.lineage,
    background: B.name, size: spec.species === 'halfling' || spec.species === 'gnome' ? 'small' : 'medium',
    scores, mods: m, saves, saveProfs,
    armorId, hasShield: kit.shield, style: spec.style, styles, mageArmor: false, unarmored, shadows,
    ac: sumParts(acParts), acParts, hp: hpMax, hpMax, hpParts, tempHp: 0,
    hitDice: { die: C.hitDie, max: level, left: level },
    speed: sumParts(speedParts), speedParts, initParts, attacks, skills, profSkills: [...prof], expertise, features, casting,
    spellbook: spec.cls === 'wizard' ? [...spec.book] : null,
    resist: uniq(resist), vuln: [], immune: [], condImmune,
    luck: spec.species === 'halfling',
    nimbleness: spec.species === 'halfling',
    mentalSaveAdv: spec.species === 'gnome',
    poisonSaveAdv: spec.species === 'dwarf',
    braveSaveAdv: spec.species === 'halfling',
    savage: has('savage-attacker'),
    twf: styles.includes('two-weapon'),
    grappler: has('grappler'),
    sneak: spec.cls === 'rogue' ? `${P.sneakDice(level)}d6` : null,
    cunningStrike: spec.cls === 'rogue' && L(5), uncannyDodge: spec.cls === 'rogue' && L(5),
    secondWind: spec.cls === 'fighter' ? { uses: P.secondWind(level), max: P.secondWind(level) } : null,
    tacticalShift: spec.cls === 'fighter' && L(5),
    actionSurge: spec.cls === 'fighter' && L(2) ? { uses: L(17) ? 2 : 1, max: L(17) ? 2 : 1 } : null,
    critOn: spec.cls === 'fighter' && L(15) ? 18 : spec.cls === 'fighter' && L(3) ? 19 : 20,
    initAdv: (spec.cls === 'fighter' && L(3)) || (cls === 'barbarian' && L(7)),
    cunning: spec.cls === 'rogue' && L(2),
    steadyAim: spec.cls === 'rogue' && L(3),
    channel: (cls === 'cleric' && L(2)) || (cls === 'paladin' && L(3)) ? { uses: cls === 'cleric' ? P.channelCleric(level) : P.channelPaladin(level), max: cls === 'cleric' ? P.channelCleric(level) : P.channelPaladin(level) } : null,
    searUndead: cls === 'cleric' && L(5) ? Math.max(1, m.wis) : 0,
    discipleOfLife: spec.cls === 'cleric' && L(3),
    preserveLife: spec.cls === 'cleric' && L(3),
    potentCantrip: spec.cls === 'wizard' && L(3),
    arcaneRecovery: spec.cls === 'wizard' ? { used: false } : null,
    giant,
    twins: kit.twins || [],
    adrenaline: spec.species === 'orc' ? { uses: pb, max: pb } : null,
    relentless: spec.species === 'orc' ? { used: false } : null,
    breath: spec.species === 'dragonborn' ? {
      uses: pb, max: pb, dice: '1d10', type: ancestry.type, ancestry: ancestry.name,
      dc: [{ label: 'Base', value: 8, rule: 'spell-save-dc' }, { label: 'CON modifier', value: m.con, rule: 'ability-modifier' }, { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' }],
    } : null,
    inspiration: false, exhaustion: 0, aid: 0,
    creature: 'humanoid', conds: [], autoInspire: true,
    multiattack: attacksPerAction(cls, level) > 1 ? attacksPerAction(cls, level) : inv('devouring-blade') ? 3 : inv('thirsting-blade') ? 2 : 1,
    extraAttackPact: attacksPerAction(cls, level) === 1 && inv('thirsting-blade'),
    reaction: true, deathSaves: { s: 0, f: 0 }, stable: false, dead: false,
    // The other classes (see combat.js for how each works in a fight).
    rage: cls === 'barbarian' ? { uses: rageUses, max: rageUses } : null,
    rageDmg: cls === 'barbarian' ? P.rageDamage(level) : 0,
    dangerSense: cls === 'barbarian' && L(2), reckless: cls === 'barbarian' && L(2), frenzy: cls === 'barbarian' && L(3),
    bardic: cls === 'bard' ? { uses: Math.max(1, m.cha), max: Math.max(1, m.cha), die: P.bardicDie(level) } : null,
    fontOfInspiration: cls === 'bard' && L(5),
    cuttingWords: cls === 'bard' && L(3),
    wildShape: cls === 'druid' && L(2) ? { uses: P.wildShape(level), max: P.wildShape(level) } : null,
    wildResurgence: cls === 'druid' && L(5),
    landsAid: cls === 'druid' && L(3),
    martialDie, monk: cls === 'monk',
    focus: cls === 'monk' && L(2) ? { uses: level, max: level } : null,
    focusDc: cls === 'monk' ? [{ label: 'Base', value: 8, rule: 'monks-focus' }, { label: 'WIS modifier', value: m.wis, rule: 'ability-modifier' }, { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' }] : null,
    metabolism: cls === 'monk' && L(2) ? { uses: 1, max: 1 } : null,
    deflect: cls === 'monk' && L(3), openHand: cls === 'monk' && L(3), stunningStrike: cls === 'monk' && L(5),
    layOnHands: cls === 'paladin' ? { uses: 5 * level, max: 5 * level } : null,
    sacredWeapon: cls === 'paladin' && L(3),
    prey: spec.prey || null,
    innate: cls === 'sorcerer' ? { uses: 2, max: 2 } : null,
    sorcery: cls === 'sorcerer' && L(2) ? { uses: level, max: level } : null,
    sorcRestore: cls === 'sorcerer' && L(5) ? { used: false } : null,
    metamagic: [...(spec.metamagic || [])],
    invocations: [...(spec.invocations || [])],
    darkOne: cls === 'warlock' && L(3),
    // Levels 6 to 10 (see combat.js).
    mindlessRage: cls === 'barbarian' && L(6), pounce: cls === 'barbarian' && L(7), brutal: cls === 'barbarian' && L(9) ? (L(17) ? '2d10' : '1d10') : null, retaliation: cls === 'barbarian' && L(10),
    countercharm: cls === 'bard' && L(7),
    blessedHealer: cls === 'cleric' && L(6), divineStrike: spec.strikes === 'divine', primalStrike: spec.strikes === 'primal', potentSpell: spec.strikes === 'potent',
    sparkDice: P.sparkDice ? P.sparkDice(level) : 1,
    intervention: cls === 'cleric' && L(10) ? { uses: 1, max: 1 } : null,
    indomitable: cls === 'fighter' && L(9) ? { uses: level >= 17 ? 3 : level >= 13 ? 2 : 1, max: level >= 17 ? 3 : level >= 13 ? 2 : 1 } : null,
    heroicWarrior: cls === 'fighter' && L(10),
    evasion: (cls === 'rogue' || cls === 'monk') && L(7), reliable,
    empoweredStrikes: cls === 'monk' && L(6), heightened: cls === 'monk' && L(10), selfRestore: cls === 'monk' && L(10),
    wholeness: cls === 'monk' && L(6) ? { uses: Math.max(1, m.wis), max: Math.max(1, m.wis) } : null,
    auraProt: cls === 'paladin' && L(6) ? Math.max(1, m.cha) : 0, auraDevotion: cls === 'paladin' && L(7), auraCourage: cls === 'paladin' && L(10),
    abjure: cls === 'paladin' && L(9),
    tactics: spec.tactics || null,
    tireless: cls === 'ranger' && L(10) ? { uses: Math.max(1, m.wis), max: Math.max(1, m.wis) } : null,
    affinity: spec.affinity || null, incarnate: cls === 'sorcerer' && L(7),
    ownLuck: cls === 'warlock' && L(6) ? { uses: Math.max(1, m.cha), max: Math.max(1, m.cha) } : null,
    sculpt: cls === 'wizard' && L(6), empEvocation: cls === 'wizard' && L(10) ? m.int : 0,
    lifedrinker: inv('lifedrinker'),
    // Levels 11 to 15 (see combat.js).
    studied: cls === 'fighter' && L(13),
    relentlessRage: cls === 'barbarian' && L(11) ? { dc: 10 } : null, improvedBrutal: cls === 'barbarian' && L(13),
    intimidating: cls === 'barbarian' && L(14) ? { uses: 1, max: 1 } : null, persistent: cls === 'barbarian' && L(15) ? { uses: 1, max: 1 } : null,
    peerless: cls === 'bard' && L(14),
    improvedStrikes: (cls === 'cleric' && L(14)) || (cls === 'druid' && L(15)), potentTemp: cls === 'cleric' && L(14) && spec.strikes === 'potent' ? 2 * Math.max(1, m.wis) : 0,
    sanctuary: cls === 'druid' && L(14) && spec.land ? LAND_SPELLS[spec.land].ward : null,
    fleetStep: cls === 'monk' && L(11), deflectEnergy: cls === 'monk' && L(13), survivor: cls === 'monk' && L(14), perfectFocus: cls === 'monk' && L(15),
    radiantStrikes: cls === 'paladin' && L(11), restoringTouch: cls === 'paladin' && L(14), smiteProtection: cls === 'paladin' && L(15),
    superiorPrey: cls === 'ranger' && L(11), relentlessHunter: cls === 'ranger' && L(13), superiorDefense: cls === 'ranger' && L(15),
    veil: cls === 'ranger' && L(14) ? { uses: Math.max(1, m.wis), max: Math.max(1, m.wis) } : null,
    improvedCunning: cls === 'rogue' && L(11), devious: cls === 'rogue' && L(14),
    overchannel: cls === 'wizard' && L(14) ? { uses: 1, max: 1, extra: 0 } : null,
    hurl: cls === 'warlock' && L(14) ? { uses: 1, max: 1 } : null,
    witchSight: inv('witch-sight'),
    // Levels 16 to 20 (see combat.js).
    brutalTwo: cls === 'barbarian' && L(17), indomitableMight: cls === 'barbarian' && L(18) ? scores.str : 0,
    superiorInspiration: cls === 'bard' && L(18), wordsOfCreation: cls === 'bard' && L(20),
    supremeHealing: cls === 'cleric' && L(17),
    beastSpells: cls === 'druid' && L(18), archdruid: cls === 'druid' && L(20),
    survivor18: cls === 'fighter' && L(18),
    quiveringPalm: cls === 'monk' && L(17), monkDefense: cls === 'monk' && L(18),
    auraRange: cls === 'paladin' && L(18) ? 30 : 10,
    nimbus: cls === 'paladin' && L(20) ? { uses: 1, max: 1, dmg: Math.max(1, m.cha) + pb } : null,
    preciseHunter: cls === 'ranger' && L(17), foeSlayer: cls === 'ranger' && L(20),
    thiefReflexes: cls === 'rogue' && L(17), elusive: cls === 'rogue' && L(18),
    strokeOfLuck: cls === 'rogue' && L(20) ? { uses: 1, max: 1 } : null,
    apotheosis: cls === 'sorcerer' && L(20),
    // Epic Boons (level 19).
    combatProwess: has('boon-of-combat-prowess'),
    blinkSteps: has('boon-of-dimensional-travel'),
    fate: has('boon-of-fate') ? { uses: 1, max: 1 } : null,
    irresistible: has('boon-of-irresistible-offense') ? Math.max(...(spec.feats.find((f) => f.feat === 'boon-of-irresistible-offense')?.plus ? Object.keys(spec.feats.find((f) => f.feat === 'boon-of-irresistible-offense').plus).map((a) => scores[a]) : [scores.str])) : 0,
    spellRecall: has('boon-of-spell-recall'),
    // Seeing the unseen: Truesight 60 feet (Boon of Truesight), Blindsight 30 feet (Feral Senses).
    sight: has('boon-of-truesight') ? 60 : cls === 'ranger' && L(18) ? 30 : 0,
    x: 0, y: 0, ai: cls === 'fighter' ? (kit.weapons.includes('longbow') ? 'archer' : 'melee') : AI_ROLE[cls],
  };
}

// Put on or take off Mage Armor (it only works with no armor on).
export function setMageArmor(h, on) {
  if (h.armorId !== 'none') return false;
  h.mageArmor = !!on;
  h.acParts = armorParts(h);
  h.ac = sumParts(h.acParts);
  return true;
}

// ------------------------------------------------- the party between fights ----
// A hero's spent resources, as plain JSON: what carries from one scene to the
// next (Hit Points, Hit Point Dice, spell slots, feature uses, conditions that
// last until a rest). Each count keeps its max so a level-up can add the
// difference to what's left.

const USES = ['secondWind', 'actionSurge', 'channel', 'giant', 'adrenaline', 'breath', 'rage', 'bardic', 'wildShape', 'focus', 'layOnHands', 'innate', 'sorcery', 'metabolism',
  'intervention', 'indomitable', 'wholeness', 'tireless', 'ownLuck', 'intimidating', 'persistent', 'veil', 'overchannel', 'hurl',
  'nimbus', 'strokeOfLuck', 'fate'];

export function heroState(h) {
  const st = {
    level: h.level, hp: Math.max(0, h.hp), hpMax: h.hpMax - (h.aid || 0), aid: h.aid || 0,
    hd: { ...h.hitDice }, slots: {}, free: {}, uses: {},
    relentless: !!h.relentless?.used, arcane: !!h.arcaneRecovery?.used, sorcRestore: !!h.sorcRestore?.used,
    exhaustion: h.exhaustion || 0, poisoned: !!h.conds?.some((c) => c.id === 'poisoned' && c.lasting), inspiration: !!h.inspiration,
    tempHp: h.tempHp || 0, mageArmor: !!h.mageArmor, drained: h.drained || 0,
    rageDc: h.relentlessRage?.dc || 10, overExtra: h.overchannel?.extra || 0,
  };
  for (const [lv, s] of Object.entries(h.casting?.slots || {})) st.slots[lv] = { ...s };
  for (const [sid, k] of Object.entries(h.casting?.known || {})) if (k.freeMax) st.free[sid] = k.free;
  for (const u of USES) if (h[u]) st.uses[u] = { uses: h[u].uses, max: h[u].max };
  return st;
}

const carry = (left, oldMax, newMax) => Math.max(0, Math.min(newMax, left + (newMax - oldMax)));

// Put a saved state onto a freshly built hero (which may be a level higher).
export function applyState(h, st) {
  if (!st) return h;
  h.aid = st.aid || 0;
  h.hpMax += h.aid;
  // Life Drain: the maximum stays lower until a Long Rest.
  h.drained = Math.min(st.drained || 0, h.hpMax - 1);
  h.hpMax -= h.drained;
  h.hp = Math.max(0, Math.min(h.hpMax, carry(st.hp, st.hpMax + (st.aid || 0), h.hpMax)));
  if (st.hd) h.hitDice.left = carry(st.hd.left, st.hd.max, h.hitDice.max);
  for (const [lv, s] of Object.entries(h.casting?.slots || {})) {
    const o = st.slots?.[lv];
    // Font of Magic can make slots past the maximum; they last until a Long Rest.
    if (o) s.left = Math.max(0, Math.min(s.max + Math.max(0, o.left - o.max), o.left + (s.max - o.max)));
  }
  for (const [sid, k] of Object.entries(h.casting?.known || {})) if (st.free?.[sid] != null) k.free = Math.min(k.free, st.free[sid]);
  for (const u of USES) {
    const o = st.uses?.[u];
    if (h[u] && o) h[u].uses = carry(o.uses, o.max, h[u].max);
  }
  if (h.relentless) h.relentless.used = !!st.relentless;
  if (h.relentlessRage) h.relentlessRage.dc = st.rageDc || 10;
  if (h.overchannel) h.overchannel.extra = st.overExtra || 0;
  if (h.arcaneRecovery) h.arcaneRecovery.used = !!st.arcane;
  if (h.sorcRestore) h.sorcRestore.used = !!st.sorcRestore;
  h.exhaustion = st.exhaustion || 0;
  h.conds = st.poisoned ? [{ id: 'poisoned', lasting: true, rule: 'poisoned' }] : [];
  h.inspiration = !!st.inspiration;
  h.tempHp = st.tempHp || 0;
  if (st.mageArmor) setMageArmor(h, true);
  return h;
}

// ----------------------------------------------------------------- rests ----

// Spend one Hit Point Die during a Short Rest: roll it + CON modifier.
export function spendHitDie(h, rng) {
  if (!h.hitDice.left || h.hp >= h.hpMax || h.dead) return null;
  h.hitDice.left--;
  const roll = die(rng, h.hitDice.die);
  const gain = Math.max(0, roll + h.mods.con);
  const before = h.hp;
  h.hp = Math.min(h.hpMax, h.hp + gain);
  return {
    kind: 'heal', by: h.id, target: h.id, name: h.name, what: 'Hit Point Die',
    roll: { label: `1d${h.hitDice.die}`, rolls: [roll] }, mods: [{ label: 'CON modifier', value: h.mods.con }],
    total: gain, before, after: h.hp, rule: 'hit-point-dice',
    text: `${h.name} spends a Hit Point Die (d${h.hitDice.die}): ${roll} ${signed(h.mods.con)} = ${gain}, now ${h.hp}/${h.hpMax} HP (${h.hitDice.left} left).`,
  };
}

// What finishing a Short Rest gives back, besides Hit Point Dice spent.
export function finishShortRest(h) {
  const got = [];
  if (h.secondWind && h.secondWind.uses < h.secondWind.max) { h.secondWind.uses++; got.push('a use of Second Wind'); }
  if (h.actionSurge && h.actionSurge.uses < h.actionSurge.max) { h.actionSurge.uses = h.actionSurge.max; got.push('Action Surge'); }
  if (h.channel && h.channel.uses < h.channel.max) { h.channel.uses++; got.push('a use of Channel Divinity'); }
  if (h.rage && h.rage.uses < h.rage.max) { h.rage.uses++; got.push('a use of Rage'); }
  if (h.wildShape && h.wildShape.uses < h.wildShape.max) { h.wildShape.uses++; got.push('a use of Wild Shape'); }
  if (h.focus && h.focus.uses < h.focus.max) { h.focus.uses = h.focus.max; got.push('all Focus Points'); }
  // Font of Inspiration (Bard 5): Bardic Inspiration comes back on a Short Rest too.
  if (h.fontOfInspiration && h.bardic && h.bardic.uses < h.bardic.max) { h.bardic.uses = h.bardic.max; got.push('all Bardic Inspiration (Font of Inspiration)'); }
  // Sorcerous Restoration (Sorcerer 5): up to half the Sorcerer level in Sorcery Points, once per Long Rest.
  if (h.sorcRestore && !h.sorcRestore.used && h.sorcery && h.sorcery.uses < h.sorcery.max) {
    const n = Math.min(Math.floor(h.level / 2), h.sorcery.max - h.sorcery.uses);
    h.sorcery.uses += n;
    h.sorcRestore.used = true;
    got.push(`${n} Sorcery Point${n === 1 ? '' : 's'} (Sorcerous Restoration)`);
  }
  // Stroke of Luck (Rogue 20) and Boon of Fate come back on a Short Rest.
  if (h.strokeOfLuck && h.strokeOfLuck.uses < h.strokeOfLuck.max) { h.strokeOfLuck.uses = h.strokeOfLuck.max; got.push('Stroke of Luck'); }
  if (h.fate && h.fate.uses < h.fate.max) { h.fate.uses = h.fate.max; got.push('Boon of Fate'); }
  // Signature Spells (Wizard 20): their free casts come back on a Short Rest.
  const sig = Object.entries(h.casting?.known || {}).filter(([, k]) => k.signature && k.free < k.freeMax);
  for (const [, k] of sig) k.free = k.freeMax;
  if (sig.length) got.push(`free casts of ${sig.map(([sid]) => SPELLS[sid].name).join(' and ')} (Signature Spells)`);
  let pact = false;
  for (const s of Object.values(h.casting?.slots || {})) if (s.pact && s.left < s.max) { s.left = s.max; pact = true; }
  if (pact) got.push('all Pact Magic spell slots');
  if (h.adrenaline && h.adrenaline.uses < h.adrenaline.max) { h.adrenaline.uses = h.adrenaline.max; got.push('Adrenaline Rush'); }
  // Tireless (Ranger 10): each Short Rest lowers Exhaustion by 1.
  if (h.tireless && h.exhaustion > 0) { h.exhaustion--; got.push('one level of Exhaustion gone (Tireless)'); }
  // Relentless Rage (Barbarian 11): its DC goes back to 10.
  if (h.relentlessRage && h.relentlessRage.dc > 10) { h.relentlessRage.dc = 10; got.push('Relentless Rage back to DC 10'); }
  if (h.arcaneRecovery && !h.arcaneRecovery.used && h.casting?.slots) {
    let budget = Math.ceil(h.level / 2);
    const back = [];
    for (const lv of Object.keys(h.casting.slots).map(Number).sort((a, b) => b - a)) {
      const s = h.casting.slots[lv];
      while (s.left < s.max && lv <= budget) { s.left++; budget -= lv; back.push(lv); }
    }
    if (back.length) { h.arcaneRecovery.used = true; got.push(`Arcane Recovery: ${back.length} spell slot${back.length > 1 ? 's' : ''}`); }
  }
  return got;
}

export function longRest(h) {
  const got = [];
  h.aid = 0;
  if (h.drained) got.push('a Hit Point maximum lowered by Life Drain');
  h.drained = 0;
  h.hpMax = buildHero(h.spec, { id: h.id, name: h.name, level: h.level }).hpMax;
  if (h.hp < h.hpMax) got.push('all Hit Points');
  h.hp = h.hpMax;
  h.tempHp = 0;
  if (h.mageArmor) { setMageArmor(h, false); got.push('Mage Armor has worn off'); }
  h.dead = false; h.stable = false; h.deathSaves = { s: 0, f: 0 };
  if (h.hitDice.left < h.hitDice.max) got.push('all Hit Point Dice');
  h.hitDice.left = h.hitDice.max;
  let slots = false;
  for (const s of Object.values(h.casting?.slots || {})) { if (s.left < s.max) slots = true; s.left = s.max; }
  if (slots) got.push('all spell slots');
  const fresh = buildHero(h.spec, { id: h.id, name: h.name, level: h.level });
  for (const [sid, k] of Object.entries(h.casting?.known || {})) k.free = fresh.casting.known[sid]?.free ?? k.free;
  for (const u of USES) if (h[u]) h[u].uses = h[u].max;
  if (h.relentless) h.relentless.used = false;
  if (h.relentlessRage) h.relentlessRage.dc = 10;
  if (h.overchannel) h.overchannel.extra = 0;
  if (h.arcaneRecovery) h.arcaneRecovery.used = false;
  if (h.sorcRestore) h.sorcRestore.used = false;
  if (h.exhaustion > 0) { h.exhaustion--; got.push('one level of Exhaustion gone'); }
  if (h.conds?.some((c) => c.id === 'poisoned')) { h.conds = h.conds.filter((c) => c.id !== 'poisoned'); got.push('no longer Poisoned'); }
  if (h.speciesId === 'human' && !h.inspiration) { h.inspiration = true; got.push('Heroic Inspiration (Resourceful)'); }
  return got;
}

// ------------------------------------------------------------- monsters ----

const MONSTER_TRAITS = {
  nimble: { name: 'Nimble Escape', rule: 'nimble-escape', text: 'Takes the Disengage or Hide action as a Bonus Action.' },
  packTactics: { name: 'Pack Tactics', rule: 'pack-tactics', text: "Advantage on an attack roll against a creature if at least one of its allies is within 5 feet of that creature and isn't Incapacitated." },
  undeadFortitude: { name: 'Undead Fortitude', rule: 'undead-fortitude', text: "If damage drops it to 0 Hit Points, it makes a Constitution save (DC 5 + the damage taken), unless the damage is Radiant or from a Critical Hit. On a success it drops to 1 Hit Point instead." },
  spiderClimb: { name: 'Spider Climb', rule: null, text: 'Climbs difficult surfaces, even ceilings, without an ability check.' },
  abduct: { name: 'Abduct', rule: 'grappled', text: "Doesn't spend extra movement to move a creature it is grappling." },
  authority: { name: 'Aura of Authority', rule: 'aura-of-authority', text: "While it isn't Incapacitated, it and its allies within 10 feet have Advantage on attack rolls and saving throws." },
  amphibious: { name: 'Amphibious', rule: null, text: 'Breathes air and water.' },
  magicRes: { name: 'Magic Resistance', rule: 'magic-resistance', text: 'Advantage on saving throws against spells and other magical effects.' },
  evasion: { name: 'Evasion', rule: 'evasion', text: 'When a Dexterity save would halve damage, it takes none on a success and half on a failure.' },
  stench: { name: 'Stench', rule: 'stench', text: 'A creature that starts its turn within 5 feet of it makes a DC 10 Constitution save or is Poisoned until the start of its next turn. On a success it is immune to this Stench for 24 hours.' },
};

// Proficiency Bonus by Challenge Rating.
function monsterPb(cr) {
  const v = cr == null ? 0 : String(cr).includes('/') ? 0 : +cr;
  return v >= 21 ? 7 : v >= 17 ? 6 : v >= 13 ? 5 : v >= 9 ? 4 : v >= 5 ? 3 : 2;
}
export function buildMonster(def, { id, label, x, y, ai = 'melee' }) {
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(def.abilities[a])]));
  const saves = { ...m, ...(def.saves || {}) };
  const saveProfs = Object.keys(def.saves || {});
  const traits = def.traits || {};
  const features = [];
  if (def.multiattack > 1) features.push({ name: 'Multiattack', rule: 'multiattack', text: `The ${def.name.toLowerCase()} makes ${def.multiName || `${def.multiattack} attacks`} with its Attack action${def.drain ? ', and can replace one of them with Life Drain' : ''}.` });
  for (const a of def.attacks) {
    if (a.solo) features.push({ name: a.name, rule: 'multiattack', text: `${a.name} is an action of its own: it isn't one of the Multiattack's attacks.` });
    if (a.rider?.paralyze?.auto) features.push({ name: `${a.name}: Paralysis`, rule: 'paralyzed', text: 'On a hit, the target is Paralyzed until the start of its next turn. There is no save.' });
    else if (a.rider?.paralyze) features.push({ name: `${a.name}: Paralysis`, rule: 'paralyzed', text: `On a hit, a target that isn't Undead${a.rider.paralyze.notElf ? ' or an Elf' : ''} makes a DC ${a.rider.paralyze.dc} Constitution save or is Paralyzed until the end of its next turn.` });
  }
  if (def.drain) features.push({ name: def.drain.name || 'Life Drain', rule: 'life-drain', text: `Constitution save DC ${def.drain.dc}, one creature within 5 feet${def.drain.needsHeld ? ' that is Grappled by it, Incapacitated or Restrained' : ''}: on a failure ${def.drain.dice} + ${def.drain.flat} ${def.drain.type} damage, and its Hit Point maximum drops by the damage taken (until a Long Rest)${def.drain.heal ? `. The ${def.name.toLowerCase()} regains that many Hit Points` : ''}.` });
  if (def.absorb) features.push({ name: def.absorbName, rule: 'stat-block', text: `Instead of taking ${def.absorb.join(' or ')} damage, it regains that many Hit Points.` });
  if (def.aura) features.push({ name: def.aura.name, rule: 'stat-block', text: `At the end of each of its turns, each creature within 5 feet of it takes ${def.aura.dice} ${def.aura.type} damage.` });
  if (def.throes) features.push({ name: 'Death Throes', rule: 'stat-block', text: `When it dies, it explodes: Dexterity save DC ${def.throes.dc}, each creature within ${def.throes.size} feet takes ${def.throes.dice} ${def.throes.type} and ${def.throes.also.dice} ${def.throes.also.type} damage on a failure, half on a success.` });
  if (def.fearAura) features.push({ name: 'Fear Aura', rule: 'frightened', text: `While it isn't Incapacitated, an enemy that starts its turn within ${def.fearAura.size} feet of it makes a DC ${def.fearAura.dc} Wisdom save. On a failure it is Frightened until the start of its next turn; on a success it is immune to this aura for 24 hours.` });
  if (def.sight) features.push({ name: `Truesight ${def.sight} ft.`, rule: 'truesight', text: `It sees Invisible creatures within ${def.sight} feet.` });
  if (def.resist?.length) features.push({ name: 'Resistant', rule: 'resistance', text: `Takes half ${def.resist.join(', ')} damage.` });
  for (const t of Object.keys(traits)) if (traits[t] && MONSTER_TRAITS[t]) features.push(MONSTER_TRAITS[t]);
  if (def.redirect) features.push({ name: 'Redirect Attack', rule: 'redirect-attack', text: 'Reaction: when a creature makes an attack roll against the boss, a goblin ally within 5 feet swaps places with it and becomes the target.' });
  if (def.web) features.push({ name: `Web (Recharge ${def.web.recharge}-6)`, rule: 'restrained', text: `Dexterity save DC ${def.web.dc}, one creature within ${def.web.range} feet: on a failure it is Restrained until the web is destroyed (AC ${def.web.webAc}, ${def.web.webHp} HP, Fire does double).` });
  if (def.parry && !def.parryAny) features.push({ name: 'Parry', rule: 'parry', text: `Reaction: when hit by a melee attack roll while holding a weapon, it adds ${def.parry} to its AC against that attack, possibly causing a miss.` });
  if (def.parry && def.parryAny) features.push({ name: def.parryName, rule: 'parry', text: `Reaction: when hit by an attack roll, it adds ${def.parry} to its AC against that attack, possibly causing a miss. (It also slips away in a swirl of sand; that part isn't played here.)` });
  if (def.glare) features.push({ name: def.glare.name, rule: 'paralyzed', text: `Part of its Multiattack: ${ABILITY_NAMES[def.glare.ability]} save DC ${def.glare.dc}, one creature it can see within ${def.glare.range} feet: on a failure ${def.glare.dice} + ${def.glare.flat} ${def.glare.type} damage, and Paralyzed until the end of its next turn.` });
  if (def.legRes) features.push({ name: `Legendary Resistance (${def.legRes}/Day)`, rule: 'legendary-resistance', text: 'If it fails a saving throw, it can choose to succeed instead.' });
  if (def.legendary) features.push({ name: `Legendary Actions (${def.legendary.uses})`, rule: 'legendary-actions', text: `Right after another creature's turn, it can take one of these, and it gets them all back at the start of its turn. ${def.legendary.options.map((o) => `${o.name}: ${o.text}`).join(' ')}` });
  if (def.regen) features.push({ name: 'Regeneration', rule: 'regeneration', text: `Regains ${def.regen} Hit Points at the start of each of its turns. If it takes Acid or Fire damage, this doesn't work on its next turn. It dies only if it starts its turn with 0 Hit Points and doesn't regenerate.` });
  if (def.mbreath) features.push({ name: `${def.mbreath.name} (Recharge ${def.mbreath.recharge}${def.mbreath.recharge < 6 ? '-6' : ''})`, rule: 'recharge', text: `${ABILITY_NAMES[def.mbreath.ability || 'dex']} save DC ${def.mbreath.dc}, each creature in a ${def.mbreath.size}-foot ${def.mbreath.shape === 'line' ? 'Line 5 feet wide' : 'Cone'}: ${def.mbreath.dice} ${def.mbreath.type} damage on a failure, half on a success. It takes the whole action.` });
  if (def.vuln?.length) features.push({ name: 'Vulnerable', rule: 'vulnerability', text: `Takes double ${def.vuln.join(', ')} damage.` });
  if (def.immune?.length) features.push({ name: 'Immune', rule: 'immunity', text: `Takes no ${def.immune.join(', ')} damage${def.condImmune?.length ? `; can't be ${def.condImmune.join(' or ')}` : ''}.` });
  let casting = null;
  if (def.casting) {
    const dc = [{ label: 'Stat block spell save DC', value: def.casting.dc, rule: 'stat-block' }];
    const attack = [{ label: 'Stat block spell attack bonus', value: def.casting.attack, rule: 'stat-block' }];
    const known = {};
    for (const [sid, v] of Object.entries(def.casting.spells)) {
      const n = typeof v === 'number' ? v : v.n, lv = typeof v === 'number' ? null : v.level;
      known[sid] = n >= 99 ? { ability: def.casting.ability, source: 'Spellcasting', atWill: true, slot: false, ...(lv ? { atLevel: lv } : {}) }
        : { ability: def.casting.ability, source: 'Spellcasting', free: n, perDay: n > 0, slot: false, ...(lv ? { atLevel: lv } : {}) };
    }
    casting = { known, stats: { [def.casting.ability]: { dc, attack } }, slots: null };
    features.push({ name: 'Spellcasting', rule: 'spellcasting', text: `Spell save DC ${def.casting.dc}, ${signed(def.casting.attack)} to hit. ${Object.entries(def.casting.spells).filter(([, v]) => (typeof v === 'number' ? v : v.n)).map(([sid, v]) => `${SPELLS[sid].name}${v.level ? ` (level ${v.level})` : ''} ${(typeof v === 'number' ? v : v.n) >= 99 ? 'at will' : `${typeof v === 'number' ? v : v.n}/day`}`).join(', ')}.${def.casting.note ? ` ${def.casting.note}` : ''}` });
  }
  return {
    id, side: 'foe', kind: def.kind, name: label, statName: def.name, statType: def.type, emoji: def.emoji,
    size: def.size || 'medium', creature: def.creature || 'humanoid',
    scores: { ...def.abilities }, mods: m, saves, saveProfs, pb: monsterPb(def.cr),
    skills: { ...(def.skills || {}) },
    ac: def.ac, acParts: [{ label: 'Stat block', value: def.ac, rule: 'stat-block' }],
    hp: def.hp, hpMax: def.hp, tempHp: 0, speed: def.speed,
    initParts: [{ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' }],
    attacks: def.attacks.map((a) => ({
      id: a.id, name: a.name, kind: a.kind, dice: a.dice, type: a.type, range: a.range || null, reach: a.reach || 5,
      finesse: false, mastery: null, advDice: a.advDice, extra: a.extra || [], rider: a.rider || null, advIfGrappled: !!a.advIfGrappled, solo: !!a.solo, perTurn: a.perTurn || 0,
      hit: [{ label: 'Stat block attack bonus', value: a.bonus, rule: 'stat-block' }],
      dmgFlat: [{ label: 'Stat block damage bonus', value: a.flat, rule: 'stat-block' }],
    })),
    features, casting,
    resist: [...(def.resist || [])], vuln: [...(def.vuln || [])], immune: [...(def.immune || [])], condImmune: [...(def.condImmune || [])],
    multiattack: def.multiattack || 1, nimble: !!traits.nimble, redirect: !!def.redirect,
    packTactics: !!traits.packTactics, undeadFortitude: !!traits.undeadFortitude,
    web: def.web ? { ...def.web, ready: true } : null,
    stench: def.stench ? { ...def.stench } : null, drain: def.drain ? { ...def.drain } : null,
    parry: def.parry || 0, authority: !!traits.authority, regen: def.regen ? { hp: def.regen, blocked: false } : null,
    mbreath: def.mbreath ? { ...def.mbreath, ready: true } : null,
    absorb: [...(def.absorb || [])], absorbName: def.absorbName || null, aura: def.aura ? { ...def.aura } : null, throes: def.throes ? { ...def.throes } : null,
    fearAura: def.fearAura ? { ...def.fearAura } : null, sight: def.sight || 0,
    parryName: def.parryName || null, parryAny: !!def.parryAny, glare: def.glare ? { ...def.glare } : null,
    magicRes: !!traits.magicRes, evasion: !!traits.evasion,
    legRes: def.legRes ? { uses: def.legRes, max: def.legRes } : null,
    legendary: def.legendary ? { uses: def.legendary.uses, max: def.legendary.uses, options: def.legendary.options.map((o) => ({ ...o })), spent: [] } : null,
    conds: [], exhaustion: 0,
    reaction: true, dead: false, x, y, ai, xp: def.xp, cr: def.cr || null,
  };
}

export const buildGoblin = (opts) => buildMonster(GOBLIN_WARRIOR, opts);

// Quick spell lookups for the UI and AI.
export function spellList(c) {
  if (!c.casting) return [];
  return Object.entries(c.casting.known).map(([sid, k]) => ({ id: sid, ...SPELLS[sid], ...k }));
}
