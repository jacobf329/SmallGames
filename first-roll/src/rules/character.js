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
//   (warlock), metamagic (sorcerer 2+), land (druid 3), prey (ranger 3)
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
export const expertiseCount = (cls, level) => ({ rogue: 2, bard: level >= 2 ? 2 : 0, ranger: level >= 2 ? 1 : 0 }[cls] || 0);
export const styleAt = (cls, level) => STYLE_LEVEL[cls] != null && level >= STYLE_LEVEL[cls];
export const metamagicCount = (cls, level) => (cls === 'sorcerer' && level >= 2 ? 2 : 0);

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
    return { cantrips: 1, invocations: 1, metamagic: 1, skills: 0, expertise: 0, book: 0 }[path] ?? Infinity;
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
export const PICK_FIELDS = ['cantrips', 'book', 'prepared', 'scholar', 'skills', 'expertise', 'style', 'warriorCantrips', 'land', 'prey', 'invocations', 'pactWeapon', 'metamagic', 'feats'];

// Pick n from `want` (in order) that pass ok(), then fill from `fill`.
function pickN(n, want, fill, ok) {
  const out = [];
  for (const x of [...(Array.isArray(want) ? want : []), ...fill]) {
    if (out.length >= n) break;
    if (typeof x === 'string' && ok(x) && !out.includes(x)) out.push(x);
  }
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
    const list = SPELL_LISTS[cls];
    const cFill = [...(D.cantrips || []), ...(list[0] || [])];
    cantrips = pickN(n.cantrips, spec.cantrips, [...cFill.filter((s) => !miWant.includes(s)), ...cFill], (s) => (list[0] || []).includes(s) && !fromSpecies.includes(s) && !fromClass.includes(s));
    const leveled = Object.entries(list).filter(([lv]) => +lv >= 1 && +lv <= top).flatMap(([, xs]) => xs);
    if (cls === 'wizard') {
      // Each spell level has its own room in the book (see bookLimit).
      book = [];
      const room = (s) => book.filter((x) => SPELLS[x].level === SPELLS[s].level).length < bookLimit(SPELLS[s].level, level);
      for (const s of [...(Array.isArray(spec.book) ? spec.book : []), ...D.book, ...leveled]) {
        if (book.length >= n.book) break;
        if (typeof s === 'string' && leveled.includes(s) && !book.includes(s) && room(s)) book.push(s);
      }
      prepared = pickN(n.prepared, spec.prepared, [...D.prepared, ...book], (s) => book.includes(s));
    } else {
      const dom = domainSpells(cls, level, land);
      prepared = pickN(n.prepared, spec.prepared, [...D.prepared, ...leveled], (s) => leveled.includes(s) && !dom.includes(s));
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

  return {
    cls, species, background, method, scores, ...(rolls ? { rolls } : {}), plus, ancestry, name,
    lineage, speciesAbility, speciesSkill, bgFeat, versatile,
    skills, expertise, style, warriorCantrips, kit, masteries, order, cantrips, book, prepared, scholar,
    invocations, pactWeapon, metamagic, land, prey, feats,
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
    let f = ASI_FEATS.includes(w.feat) ? w.feat : 'ability-score-improvement';
    const F = FEATS[f];
    if (has.has(f) && !F.repeatable && f !== 'magic-initiate') f = 'ability-score-improvement';
    if (f === 'grappler' && !(now.str >= 13 || now.dex >= 13)) f = 'ability-score-improvement';
    if (f === 'fighting-style' && !(STYLE_LEVEL[cls] != null && STYLE_FEATS.some((x) => !styles.has(x)))) f = 'ability-score-improvement';
    if (f === 'magic-initiate' && FEATS[f].lists.every((l) => miLists.has(l))) f = 'ability-score-improvement';
    const e = { level: lv, feat: f };
    const plus = w.plus && typeof w.plus === 'object' ? Object.fromEntries(Object.entries(w.plus).map(([a, v]) => [a, +v]).filter(([, v]) => v)) : {};
    if (f === 'ability-score-improvement') {
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
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(scores[a])]));
  const L = (n) => level >= n;
  const sub = L(3) ? SUBCLASSES[spec.cls] : null;
  const feats = [B.feat, spec.versatile?.feat, ...spec.feats.map((f) => f.feat)].filter(Boolean);
  const has = (f) => feats.includes(f);
  // Fighting Styles: the class's own, and any taken as feats.
  const styles = [spec.style, ...spec.feats.filter((f) => f.style).map((f) => f.style)].filter(Boolean);
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
  for (const a of ABILITIES) saves[a] = m[a] + (C.saves.includes(a) ? pb : 0);

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
    for (const s of spec.cantrips) learn(s, sc.ability, C.name);
    for (const s of spec.prepared) learn(s, sc.ability, C.name, { slot: true });
    for (const s of alwaysPrepared(cls, level, spec.land)) {
      if (s === 'divine-smite') learn(s, sc.ability, "Paladin's Smite", { slot: true, free: 1 });
      else if (s === 'hunters-mark') learn(s, sc.ability, 'Favored Enemy', { slot: true, free: P.favoredEnemy(level) });
      else learn(s, sc.ability, alwaysFrom, { slot: SPELLS[s].level > 0 });
    }
    slots = {};
    for (const [lv, k] of Object.entries(slotTable(cls)[level])) slots[lv] = { max: k, left: k, ...(pact ? { pact: true } : {}) };
  }
  if (spec.warriorCantrips?.length) {
    const st = FIGHTING_STYLES[spec.style];
    for (const s of spec.warriorCantrips) learn(s, st.ability, st.name);
  }
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
      : `${F0.name}${plus ? ` (${plus})` : ''}`;
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
  } else if (spec.cls === 'cleric') {
    F(1, 'Spellcasting', 'spellcasting', `Cantrips at will; prepared spells use spell slots. Wisdom is your spellcasting ability. You prepare ${PREPARED_BY_LEVEL.cleric[level]} spells from the Cleric list and can change them after a Long Rest.`);
    if (spec.order === 'thaumaturge') F(1, 'Divine Order: Thaumaturge', 'divine-order', `One extra cantrip, and +${Math.max(1, m.wis)} (your Wisdom modifier, at least 1) to Intelligence (Arcana and Religion) checks.`);
    else F(1, 'Divine Order: Protector', 'divine-order', 'Training with Heavy armor and Martial weapons.');
    F(2, 'Channel Divinity', 'channel-divinity', `${P.channelCleric(level)} uses (one back on a Short Rest, all on a Long Rest): Divine Spark (heal or harm, 1d8 + WIS) or Turn Undead.`);
    F(3, 'Life Domain: Disciple of Life', 'disciple-of-life', 'Healing spells cast with a spell slot restore 2 + the slot\'s level extra Hit Points.');
    F(3, 'Life Domain: Preserve Life', 'preserve-life', 'Channel Divinity: share out 5 × your Cleric level Hit Points among Bloodied allies within 30 feet (up to half their maximum).');
    F(3, 'Life Domain Spells', 'spellcasting', `Always prepared, not counted: Aid, Bless, Cure Wounds, Lesser Restoration${L(5) ? ', Mass Healing Word, Revivify' : ''}.`);
    F(5, 'Sear Undead', 'sear-undead', `When you use Turn Undead, roll ${Math.max(1, m.wis)}d8 (your Wisdom modifier in d8s): each Undead that fails the save takes that much Radiant damage.`);
  } else if (spec.cls === 'wizard') {
    F(1, 'Spellcasting', 'spellcasting', `Cantrips at will; prepared spells use spell slots. Intelligence is your spellcasting ability. Your spellbook holds ${spec.book.length} spells; you prepare ${PREPARED_BY_LEVEL.wizard[level]} of them and can change them after a Long Rest.`);
    F(1, 'Ritual Adept', 'rituals', 'Cast Ritual spells from your spellbook without preparing them.');
    F(1, 'Arcane Recovery', 'arcane-recovery', 'Once a day, when you finish a Short Rest, regain spent spell slots whose levels add up to half your Wizard level (rounded up).');
    if (scholar) F(2, `Scholar: ${SKILL_NAMES[scholar]}`, 'expertise', `Expertise in ${SKILL_NAMES[scholar]}.`);
    F(3, 'Evoker: Potent Cantrip', 'potent-cantrip', 'When a creature succeeds on a save against your damaging cantrip, or your cantrip attack misses, it still takes half the damage.');
    F(3, 'Evoker: Evocation Savant', null, 'Copying Evocation spells into your spellbook takes half the time and gold.');
    F(5, 'Memorize Spell', null, 'When you finish a Short Rest, you can swap one prepared spell for another in your spellbook. (Useful outside of fights.)');
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
  } else if (cls === 'bard') {
    F(1, 'Bardic Inspiration', 'bardic-inspiration', `Bonus Action: give a creature within 60 feet a d${P.bardicDie(level)}. Once in the next hour, when it fails a D20 Test, it can roll the die and add it, maybe turning the failure into a success (here: used for it automatically when that would work). ${Math.max(1, m.cha)} uses (your Charisma modifier, at least 1); all back on a ${L(5) ? 'Short or ' : ''}Long Rest.`);
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Charisma', '. When you gain a Bard level you can swap one of them for another, and one cantrip.')}`);
    F(2, 'Expertise', 'expertise', `Double Proficiency Bonus in ${spec.expertise.map((x) => SKILL_NAMES[x]).join(' and ')}.`);
    F(2, 'Jack of All Trades', 'jack-of-all-trades', `Add half your Proficiency Bonus (+${Math.floor(pb / 2)}) to skill checks with skills you aren't proficient in.`);
    F(3, 'College of Lore: Bonus Proficiencies', 'skills', 'Proficiency in three more skills of your choice.');
    F(3, 'College of Lore: Cutting Words', 'cutting-words', 'Reaction when a creature you can see within 60 feet succeeds on an attack roll or ability check, or rolls damage: spend a Bardic Inspiration and subtract the die from its roll. (Here: used for you automatically against an attack roll it could turn into a miss.)');
    F(5, 'Font of Inspiration', 'font-of-inspiration', 'You regain all your Bardic Inspiration on a Short Rest as well as a Long Rest. You can also spend a spell slot (no action) to regain one use.');
  } else if (cls === 'druid') {
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Wisdom', ' and can change them after a Long Rest.')}`);
    F(1, 'Druidic', null, 'You know Druidic, the secret language of druids.');
    F(1, `Primal Order: ${DRUID_ORDERS[spec.order].name}`, 'primal-order', DRUID_ORDERS[spec.order].text);
    F(2, 'Wild Shape', 'wild-shape', `Bonus Action: turn into a Beast you know (here: a Wolf, AC 12, Speed 40, Bite +4 for 1d6 + 2 that knocks a Medium or smaller creature Prone). You keep your own Hit Points and gain ${level} Temporary Hit Points (your Druid level). No spellcasting in beast form. It ends as a Bonus Action, or if you're Incapacitated or drop to 0 HP. ${P.wildShape(level)} uses; one back on a Short Rest, all on a Long Rest.`);
    F(2, 'Wild Companion', null, 'Spend a spell slot or a use of Wild Shape to cast Find Familiar. (Useful outside of fights here.)');
    if (spec.land) F(3, `Circle of the Land: ${LAND_SPELLS[spec.land].name}`, 'spellcasting', `Always prepared, not counted: ${names(landSpells(spec.land, level))}. You can pick another land after a Long Rest.`);
    F(3, "Circle of the Land: Land's Aid", 'lands-aid', 'Magic action, one use of Wild Shape: pick a point within 60 feet. Each enemy in a 10-foot Sphere there makes a Constitution save against your spell save DC: 2d6 Necrotic damage, half on a success. One ally in it regains 2d6 Hit Points.');
    F(5, 'Wild Resurgence', 'wild-resurgence', 'Once per turn, with no uses of Wild Shape left, you can spend a spell slot to regain one. Once per Long Rest, you can spend a use of Wild Shape to regain a level 1 spell slot. (The first is offered when your Wild Shape uses run out; the second is useful outside of fights here.)');
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
  } else if (cls === 'paladin') {
    F(1, 'Lay on Hands', 'lay-on-hands', `A pool of ${5 * level} Hit Points (5 × Paladin level), refilled on a Long Rest. Bonus Action: touch a creature and restore Hit Points from the pool, or spend 5 to end the Poisoned condition on it.`);
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Charisma', '. After a Long Rest you can swap one of them for another.')}`);
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of 2 kinds of weapons. ${mastText()}.`);
    styleF(2);
    F(2, "Paladin's Smite", 'divine-smite', 'Divine Smite is always prepared, and you can cast it once per Long Rest without a spell slot.');
    F(3, 'Channel Divinity', 'channel-divinity', `${P.channelPaladin(level)} uses (one back on a Short Rest, all on a Long Rest). Divine Sense: sense Celestials, Fiends and Undead nearby (useful outside of fights). Your oath adds Sacred Weapon.`);
    F(3, 'Oath of Devotion: Sacred Weapon', 'sacred-weapon', `When you take the Attack action, spend a Channel Divinity: for 10 minutes, add your Charisma modifier (+${Math.max(1, m.cha)}) to attack rolls with melee weapons, which shed light and can deal Radiant damage.`);
    F(3, 'Oath of Devotion Spells', 'spellcasting', `Always prepared, not counted: Protection from Evil and Good, Shield of Faith${L(5) ? ', Aid, Zone of Truth' : ''}.`);
    F(5, 'Extra Attack', 'extra-attack', 'You attack twice, instead of once, whenever you take the Attack action on your turn.');
    F(5, 'Faithful Steed', null, 'Find Steed is always prepared, and you can cast it once per Long Rest without a spell slot. (Useful outside of fights here.)');
  } else if (cls === 'ranger') {
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Wisdom', '. After a Long Rest you can swap one of them for another.')}`);
    F(1, 'Favored Enemy', 'favored-enemy', `Hunter's Mark is always prepared, and you can cast it ${P.favoredEnemy(level)} times per Long Rest without a spell slot.`);
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of 2 kinds of weapons. ${mastText()}.`);
    F(2, 'Deft Explorer', 'expertise', `Expertise in ${spec.expertise.map((x) => SKILL_NAMES[x]).join(' and ')}, and two more languages.`);
    styleF(2);
    F(3, "Hunter: Hunter's Lore", null, "While a creature is marked by your Hunter's Mark, you know its Immunities, Resistances and Vulnerabilities.");
    if (spec.prey) F(3, `Hunter: ${HUNTER_PREY[spec.prey].name}`, HUNTER_PREY[spec.prey].rule, `${HUNTER_PREY[spec.prey].text} You can switch Hunter's Prey after a Short or Long Rest.`);
    F(5, 'Extra Attack', 'extra-attack', 'You attack twice, instead of once, whenever you take the Attack action on your turn.');
  } else if (cls === 'sorcerer') {
    F(1, 'Spellcasting', 'spellcasting', `${prepText('Charisma', '. When you gain a Sorcerer level you can swap one of them for another, and one cantrip.')}`);
    F(1, 'Innate Sorcery', 'innate-sorcery', 'Bonus Action, twice per Long Rest: for 1 minute, your Sorcerer spells get +1 to their save DC, and you have Advantage on their attack rolls.');
    F(2, 'Font of Magic', 'font-of-magic', `${level} Sorcery Points, all back on a Long Rest. Bonus Action: turn Sorcery Points into a spell slot: ${Object.entries(SLOT_COST).filter(([lv]) => level >= SLOT_MIN_LEVEL[lv]).map(([lv, c]) => `${c} for level ${lv}`).join(', ')}. With no action, turn a spell slot into points equal to its level. Slots you make vanish on a Long Rest.`);
    if (spec.metamagic.length) F(2, `Metamagic: ${spec.metamagic.map((x) => METAMAGIC[x].name).join(', ')}`, 'metamagic', spec.metamagic.map((x) => `${METAMAGIC[x].name} (${METAMAGIC[x].cost} point${METAMAGIC[x].cost > 1 ? 's' : ''}): ${METAMAGIC[x].text}`).join(' '));
    F(3, 'Draconic Sorcery: Draconic Resilience', 'draconic-resilience', `+${level} Hit Points (3, and one more per later Sorcerer level), and without armor your AC is 10 + DEX + CHA.`);
    F(3, 'Draconic Spells', 'spellcasting', `Always prepared, not counted: Alter Self, Chromatic Orb, Command, Dragon's Breath${L(5) ? ', Fear, Fly' : ''}.`);
    F(5, 'Sorcerous Restoration', 'sorcerous-restoration', `Once per Long Rest, when you finish a Short Rest, regain up to ${Math.floor(level / 2)} spent Sorcery Points (half your Sorcerer level).`);
  } else if (cls === 'warlock') {
    const sl = Object.entries(slotTable(cls)[level])[0];
    F(1, 'Pact Magic', 'pact-magic', `${sl[1]} spell slot${sl[1] > 1 ? 's' : ''} of level ${sl[0]}, all back on a Short or Long Rest. Charisma is your spellcasting ability. You prepare ${PREPARED_BY_LEVEL.warlock[level]} Warlock spells and can swap one, and one cantrip, when you gain a level.`);
    for (const x of spec.invocations) F(1, `Invocation: ${INVOCATIONS[x].name}`, 'eldritch-invocations', `${INVOCATIONS[x].text}${x === 'pact-of-the-blade' ? ` Yours: ${WEAPONS[spec.pactWeapon].name}.` : ''}`);
    F(2, 'Magical Cunning', null, 'Once per Long Rest, a 1-minute rite regains up to half your Pact Magic slots. (Not used here: a Short Rest gives them all back anyway.)');
    F(3, "Fiend Patron: Dark One's Blessing", 'dark-ones-blessing', `When you drop an enemy to 0 Hit Points, or one within 10 feet of you drops to 0, you gain ${Math.max(1, m.cha + level)} Temporary Hit Points (CHA modifier + Warlock level).`);
    F(3, 'Fiend Patron Spells', 'spellcasting', `Always prepared, not counted: Burning Hands, Command, Scorching Ray, Suggestion${L(5) ? ', Fireball, Stinking Cloud' : ''}.`);
  }
  features.push({ name: `Equipment: ${kit.name}`, rule: null, text: kit.text, source: C.name });

  const ancestry = DRAGON_ANCESTRY[spec.ancestry];
  const resist = [...(SPECIES_RESIST[spec.species] || [])];
  if (spec.species === 'dragonborn') resist.push(ancestry.type);
  if (lin?.resist) resist.push(lin.resist);
  const giant = spec.species === 'goliath' ? { kind: spec.lineage, uses: pb, max: pb } : null;
  return {
    id, side: 'hero', cls: spec.cls, kind: spec.cls, className: C.name, emoji: C.emoji, subclass: sub,
    name: (name || spec.name || C.name).slice(0, 20), level, pb, spec,
    species: lin && spec.species !== 'goliath' ? `${lin.name}${spec.species === 'tiefling' ? ' Tiefling' : ''}` : S.name, speciesId: spec.species, lineage: spec.lineage,
    background: B.name, size: spec.species === 'halfling' || spec.species === 'gnome' ? 'small' : 'medium',
    scores, mods: m, saves, saveProfs: [...C.saves],
    armorId, hasShield: kit.shield, style: spec.style, styles, mageArmor: false, unarmored, shadows,
    ac: sumParts(acParts), acParts, hp: hpMax, hpMax, hpParts, tempHp: 0,
    hitDice: { die: C.hitDie, max: level, left: level },
    speed: sumParts(speedParts), speedParts, initParts, attacks, skills, profSkills: [...prof], expertise, features, casting,
    spellbook: spec.cls === 'wizard' ? [...spec.book] : null,
    resist, vuln: [], immune: [], condImmune: [],
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
    actionSurge: spec.cls === 'fighter' && L(2) ? { uses: 1, max: 1 } : null,
    critOn: spec.cls === 'fighter' && L(3) ? 19 : 20,
    initAdv: spec.cls === 'fighter' && L(3),
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
    multiattack: attacksPerAction(cls, level) > 1 ? attacksPerAction(cls, level) : inv('thirsting-blade') ? 2 : 1,
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

const USES = ['secondWind', 'actionSurge', 'channel', 'giant', 'adrenaline', 'breath', 'rage', 'bardic', 'wildShape', 'focus', 'layOnHands', 'innate', 'sorcery', 'metabolism'];

export function heroState(h) {
  const st = {
    level: h.level, hp: Math.max(0, h.hp), hpMax: h.hpMax - (h.aid || 0), aid: h.aid || 0,
    hd: { ...h.hitDice }, slots: {}, free: {}, uses: {},
    relentless: !!h.relentless?.used, arcane: !!h.arcaneRecovery?.used, sorcRestore: !!h.sorcRestore?.used,
    exhaustion: h.exhaustion || 0, poisoned: !!h.conds?.some((c) => c.id === 'poisoned' && c.lasting), inspiration: !!h.inspiration,
    tempHp: h.tempHp || 0, mageArmor: !!h.mageArmor, drained: h.drained || 0,
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
  let pact = false;
  for (const s of Object.values(h.casting?.slots || {})) if (s.pact && s.left < s.max) { s.left = s.max; pact = true; }
  if (pact) got.push('all Pact Magic spell slots');
  if (h.adrenaline && h.adrenaline.uses < h.adrenaline.max) { h.adrenaline.uses = h.adrenaline.max; got.push('Adrenaline Rush'); }
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
  stench: { name: 'Stench', rule: 'stench', text: 'A creature that starts its turn within 5 feet of it makes a DC 10 Constitution save or is Poisoned until the start of its next turn. On a success it is immune to this Stench for 24 hours.' },
};

export function buildMonster(def, { id, label, x, y, ai = 'melee' }) {
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(def.abilities[a])]));
  const saves = { ...m, ...(def.saves || {}) };
  const saveProfs = Object.keys(def.saves || {});
  const traits = def.traits || {};
  const features = [];
  if (def.multiattack > 1) features.push({ name: 'Multiattack', rule: 'multiattack', text: `The ${def.name.toLowerCase()} makes ${def.multiName || `${def.multiattack} attacks`} with its Attack action${def.drain ? ', and can replace one of them with Life Drain' : ''}.` });
  for (const a of def.attacks) {
    if (a.solo) features.push({ name: a.name, rule: 'multiattack', text: `${a.name} is an action of its own: it isn't one of the Multiattack's attacks.` });
    if (a.rider?.paralyze) features.push({ name: `${a.name}: Paralysis`, rule: 'paralyzed', text: `On a hit, a target that isn't Undead${a.rider.paralyze.notElf ? ' or an Elf' : ''} makes a DC ${a.rider.paralyze.dc} Constitution save or is Paralyzed until the end of its next turn.` });
  }
  if (def.drain) features.push({ name: 'Life Drain', rule: 'life-drain', text: `Constitution save DC ${def.drain.dc}, one creature within 5 feet: on a failure ${def.drain.dice} + ${def.drain.flat} ${def.drain.type} damage, and its Hit Point maximum drops by the damage taken (until a Long Rest).` });
  if (def.resist?.length) features.push({ name: 'Resistant', rule: 'resistance', text: `Takes half ${def.resist.join(', ')} damage.` });
  for (const t of Object.keys(traits)) if (traits[t] && MONSTER_TRAITS[t]) features.push(MONSTER_TRAITS[t]);
  if (def.redirect) features.push({ name: 'Redirect Attack', rule: 'redirect-attack', text: 'Reaction: when a creature makes an attack roll against the boss, a goblin ally within 5 feet swaps places with it and becomes the target.' });
  if (def.web) features.push({ name: `Web (Recharge ${def.web.recharge}-6)`, rule: 'restrained', text: `Dexterity save DC ${def.web.dc}, one creature within ${def.web.range} feet: on a failure it is Restrained until the web is destroyed (AC ${def.web.webAc}, ${def.web.webHp} HP, Fire does double).` });
  if (def.vuln?.length) features.push({ name: 'Vulnerable', rule: 'vulnerability', text: `Takes double ${def.vuln.join(', ')} damage.` });
  if (def.immune?.length) features.push({ name: 'Immune', rule: 'immunity', text: `Takes no ${def.immune.join(', ')} damage${def.condImmune?.length ? `; can't be ${def.condImmune.join(' or ')}` : ''}.` });
  let casting = null;
  if (def.casting) {
    const dc = [{ label: 'Stat block spell save DC', value: def.casting.dc, rule: 'stat-block' }];
    const attack = [{ label: 'Stat block spell attack bonus', value: def.casting.attack, rule: 'stat-block' }];
    const known = {};
    for (const [sid, n] of Object.entries(def.casting.spells)) known[sid] = { ability: def.casting.ability, source: 'Spellcasting', free: n, perDay: n > 0, slot: false };
    casting = { known, stats: { [def.casting.ability]: { dc, attack } }, slots: null };
    features.push({ name: 'Spellcasting', rule: 'spellcasting', text: `Spell save DC ${def.casting.dc}, ${signed(def.casting.attack)} to hit. ${Object.entries(def.casting.spells).filter(([, n]) => n).map(([sid, n]) => `${SPELLS[sid].name} ${n}/day`).join(', ')}.` });
  }
  return {
    id, side: 'foe', kind: def.kind, name: label, statName: def.name, statType: def.type, emoji: def.emoji,
    size: def.size || 'medium', creature: def.creature || 'humanoid',
    scores: { ...def.abilities }, mods: m, saves, saveProfs, pb: 2,
    skills: { ...(def.skills || {}) },
    ac: def.ac, acParts: [{ label: 'Stat block', value: def.ac, rule: 'stat-block' }],
    hp: def.hp, hpMax: def.hp, tempHp: 0, speed: def.speed,
    initParts: [{ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' }],
    attacks: def.attacks.map((a) => ({
      id: a.id, name: a.name, kind: a.kind, dice: a.dice, type: a.type, range: a.range || null, reach: a.reach || 5,
      finesse: false, mastery: null, advDice: a.advDice, extra: a.extra || [], rider: a.rider || null, advIfGrappled: !!a.advIfGrappled, solo: !!a.solo,
      hit: [{ label: 'Stat block attack bonus', value: a.bonus, rule: 'stat-block' }],
      dmgFlat: [{ label: 'Stat block damage bonus', value: a.flat, rule: 'stat-block' }],
    })),
    features, casting,
    resist: [...(def.resist || [])], vuln: [...(def.vuln || [])], immune: [...(def.immune || [])], condImmune: [...(def.condImmune || [])],
    multiattack: def.multiattack || 1, nimble: !!traits.nimble, redirect: !!def.redirect,
    packTactics: !!traits.packTactics, undeadFortitude: !!traits.undeadFortitude,
    web: def.web ? { ...def.web, ready: true } : null,
    stench: def.stench ? { ...def.stench } : null, drain: def.drain ? { ...def.drain } : null,
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
