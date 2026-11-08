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
//   skills (class picks), expertise (rogue), style (fighter), kit, masteries,
//   order (cleric), cantrips, book (wizard spellbook), prepared, scholar (wizard 2+)
// }
// validateSpec fills any missing choice with a sensible default and drops
// choices the rules don't allow, so older saved heroes still load.

import {
  ABILITIES, ABILITY_NAMES, abilityMod, WEAPONS, MASTERIES, ARMOR, SPECIES, BACKGROUNDS, FEATS,
  CLASSES, SKILLS, SKILL_NAMES, SPELLS, STANDARD_ARRAY, DRAGON_ANCESTRY, GOBLIN_WARRIOR,
  SLOTS_BY_LEVEL, SUBCLASSES, MAX_LEVEL, HP_PER_LEVEL, signed, POINT_COST, POINT_BUDGET,
  KITS, FIGHTING_STYLES, SPELL_LISTS, CANTRIPS_KNOWN, PREPARED_BY_LEVEL, SPELLBOOK_SIZE, DOMAIN_SPELLS,
  DEFAULT_LINEAGE, ORIGIN_FEATS, MI_DEFAULT_ABILITY,
} from './data.js';
import { die } from './rng.js';

export const PB_BY_LEVEL = [0, 2, 2, 2, 2, 3];
export { SPELLS };
export const DEFAULT_BACKGROUND = { fighter: 'soldier', rogue: 'criminal', cleric: 'acolyte', wizard: 'sage' };
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
export const maxSpellLevel = (level) => Math.max(...Object.keys(SLOTS_BY_LEVEL[level]).map(Number));

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
    cantrips: (CANTRIPS_KNOWN[cls]?.[level] || 0) + (order === 'thaumaturge' ? 1 : 0),
    prepared: PREPARED_BY_LEVEL[cls]?.[level] || 0,
    book: cls === 'wizard' ? SPELLBOOK_SIZE[level] : 0,
  };
}
export const domainSpells = (cls, level) => (cls === 'cleric' && level >= 3 ? DOMAIN_SPELLS[3] : []);

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
  const order = cls === 'cleric' ? (spec.order === 'thaumaturge' ? 'thaumaturge' : 'protector') : null;
  let kit = C.kits.includes(spec.kit) ? spec.kit : D.kit;
  if (KITS[cls][kit].needs && KITS[cls][kit].needs !== order) kit = D.kit;
  const carried = uniq(KITS[cls][kit].weapons);
  const style = cls === 'fighter' ? (FIGHTING_STYLES[spec.style] ? spec.style : D.style) : null;
  const masteries = pickN(C.masteryCount, spec.masteries, [...(D.masteries || []), ...carried], (w) => carried.includes(w));

  // Skills, in the order the rules hand them out: background, class, species, feats.
  const prof = new Set(B.skills);
  const skills = pickN(C.skillChoices.n, spec.skills, D.skills, (s) => C.skillChoices.from.includes(s) && !prof.has(s));
  for (const s of skills) prof.add(s);
  let speciesSkill = null;
  if (species === 'human' || species === 'elf') {
    const from = SP.skillFrom || Object.keys(SKILLS);
    [speciesSkill] = pickN(1, [spec.speciesSkill], [...HUMAN_SKILL_DEFAULTS.filter((x) => from.includes(x)), ...from], (s) => from.includes(s) && !prof.has(s));
    if (speciesSkill) prof.add(speciesSkill);
  }

  // The class's own spells.
  let cantrips = [], book = [], prepared = [];
  if (C.spellcasting) {
    const n = classSpellCounts(cls, level, order);
    const top = maxSpellLevel(level);
    const list = SPELL_LISTS[cls];
    cantrips = pickN(n.cantrips, spec.cantrips, D.cantrips, (s) => list[0].includes(s));
    const leveled = Object.entries(list).filter(([lv]) => +lv >= 1 && +lv <= top).flatMap(([, xs]) => xs);
    if (cls === 'wizard') {
      book = pickN(n.book, spec.book, D.book, (s) => leveled.includes(s));
      // The first six must be level 1 spells (the starting book).
      const firsts = book.filter((s) => SPELLS[s].level === 1);
      if (firsts.length < 6) book = pickN(n.book, [...firsts, ...D.book.filter((s) => SPELLS[s].level === 1), ...book], [], (s) => leveled.includes(s));
      prepared = pickN(n.prepared, spec.prepared, [...D.prepared, ...book], (s) => book.includes(s));
    } else {
      const dom = domainSpells(cls, level);
      prepared = pickN(n.prepared, spec.prepared, D.prepared, (s) => leveled.includes(s) && !dom.includes(s));
    }
  }

  // Feats: the background's, then the human's Versatile feat.
  const taken = new Set([...cantrips, ...prepared, ...book]);
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

  const expertise = cls === 'rogue' ? pickN(2, spec.expertise, [...D.expertise, ...prof], (s) => prof.has(s)) : [];
  const scholar = cls === 'wizard' && level >= 2
    ? (pickN(1, [spec.scholar], D.scholar, (s) => SCHOLAR_SKILLS.includes(s) && prof.has(s) && !expertise.includes(s))[0] || null) : (SCHOLAR_SKILLS.includes(spec.scholar) ? spec.scholar : null);

  return {
    cls, species, background, method, scores, ...(rolls ? { rolls } : {}), plus, ancestry, name,
    lineage, speciesAbility, speciesSkill, bgFeat, versatile,
    skills, expertise, style, kit, masteries, order, cantrips, book, prepared, scholar,
  };
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

// Armor Class parts for what the hero wears (Mage Armor replaces "no armor").
export function armorParts(h) {
  const m = h.mods;
  const armor = h.mageArmor && h.armorId === 'none' ? { name: 'Mage Armor', base: 13, dex: true, rule: 'mage-armor' } : ARMOR[h.armorId];
  const parts = [{ label: armor.name, value: armor.base, rule: armor.rule || 'armor-class' }];
  if (armor.dex) {
    const d = armor.maxDex != null ? Math.min(m.dex, armor.maxDex) : m.dex;
    parts.push({ label: `DEX modifier${armor.maxDex != null && m.dex > armor.maxDex ? ` (max ${armor.maxDex})` : ''}`, value: d, rule: 'ability-modifier' });
  }
  if (h.hasShield) parts.push({ label: 'Shield', value: 2, rule: 'armor-class' });
  if (h.style === 'defense' && ARMOR[h.armorId].type) parts.push({ label: 'Defense fighting style', value: 1, rule: 'defense' });
  return parts;
}

export function buildHero(rawSpec, { id = 'hero', name, level = 1 } = {}) {
  level = Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1));
  const spec = validateSpec(rawSpec, { level });
  const C = CLASSES[spec.cls], S = SPECIES[spec.species], B = BACKGROUNDS[spec.background];
  const lin = S.lineages ? S.lineages[spec.lineage] : null;
  const kit = KITS[spec.cls][spec.kit];
  const pb = PB_BY_LEVEL[level];
  const scores = {};
  for (const a of ABILITIES) scores[a] = spec.scores[a] + (spec.plus[a] || 0);
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(scores[a])]));
  const L = (n) => level >= n;
  const sub = L(3) ? SUBCLASSES[spec.cls] : null;
  const feats = [B.feat, spec.versatile?.feat].filter(Boolean);
  const has = (f) => feats.includes(f);

  // Armor Class
  const armor = ARMOR[kit.armor];
  const acParts = armorParts({ mods: m, armorId: kit.armor, hasShield: kit.shield, style: spec.style });

  // Speed: the species', and heavy armor without the Strength for it costs 10 ft.
  const speedParts = [{ label: `${S.name}${lin?.speed ? ` (${lin.name})` : ''}`, value: lin?.speed || S.speed, rule: 'speed' }];
  if (armor.str && scores.str < armor.str) speedParts.push({ label: `${armor.name} needs Strength ${armor.str}`, value: -10, rule: 'armor-class' });

  // Hit Points: the Hit Die's maximum + CON at level 1, then its fixed value
  // + CON for each level after (plus species, per level).
  const hpParts = [{ label: `d${C.hitDie} maximum`, value: C.hitDie, rule: 'hit-points' }, { label: 'CON modifier', value: m.con, rule: 'ability-modifier' }];
  if (level > 1) hpParts.push({ label: `Levels 2${level > 2 ? `-${level}` : ''}: ${level - 1} × (${HP_PER_LEVEL[C.hitDie]} + CON)`, value: (level - 1) * (HP_PER_LEVEL[C.hitDie] + m.con), rule: 'level-up' });
  if (spec.species === 'dwarf') hpParts.push({ label: 'Dwarven Toughness', value: level, rule: 'dwarven-toughness' });
  const hpMax = Math.max(1, sumParts(hpParts));

  // Initiative: a Dexterity check, plus PB with the Alert feat.
  const initParts = [{ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' }];
  if (has('alert')) initParts.push({ label: 'Alert feat (PB)', value: pb, rule: 'alert' });

  // Skills
  const prof = new Set([...B.skills, ...spec.skills, ...(spec.speciesSkill ? [spec.speciesSkill] : []), ...(spec.versatile?.skills || [])]);
  const expertise = [...spec.expertise];
  const scholar = spec.cls === 'wizard' && L(2) ? spec.scholar : null;
  if (scholar) expertise.push(scholar);
  const skills = {};
  for (const [s, ab] of Object.entries(SKILLS)) {
    skills[s] = m[ab] + (prof.has(s) ? (expertise.includes(s) ? 2 : 1) * pb : 0);
    if (spec.order === 'thaumaturge' && (s === 'arcana' || s === 'religion')) skills[s] += Math.max(1, m.wis);
  }

  // Saving throws
  const saves = {};
  for (const a of ABILITIES) saves[a] = m[a] + (C.saves.includes(a) ? pb : 0);

  // Weapons: each carried weapon, and a thrown version of the throwable ones.
  const attacks = [];
  for (const wid of kit.weapons) {
    const w = WEAPONS[wid];
    const ability = w.kind === 'ranged' ? 'dex' : (w.finesse && m.dex > m.str ? 'dex' : 'str');
    const two = !kit.shield && !!w.versatile;
    const mastery = spec.masteries.includes(wid) && MASTERIES[w.mastery] ? w.mastery : null;
    const mk = (variant) => {
      const ranged = variant === 'thrown' || w.kind === 'ranged';
      const hit = [
        { label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'ability-modifier' },
        { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' },
      ];
      if (spec.style === 'archery' && w.kind === 'ranged') hit.push({ label: 'Archery fighting style', value: 2, rule: 'archery' });
      const dmgFlat = [{ label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'damage' }];
      const dice = variant === 'melee' && two ? w.versatile : w.dice;
      return {
        id: variant === 'thrown' ? `${wid}-thrown` : wid, base: wid,
        name: variant === 'thrown' ? `${w.name} (thrown)` : `${w.name}${variant === 'melee' && two ? ' (two hands)' : ''}`,
        kind: ranged ? 'ranged' : 'melee', thrown: variant === 'thrown', dice, type: w.type,
        finesse: !!w.finesse, light: !!w.light, range: variant === 'thrown' ? w.thrown : w.range || null, props: w.props, hit, dmgFlat, mastery,
        ability, abilityMod: m[ability],
        gwf: spec.style === 'great-weapon' && variant === 'melee' && (w.twoHanded || two),
        masteryText: mastery ? MASTERIES[mastery].text : null,
      };
    };
    attacks.push(mk(w.kind === 'ranged' ? 'ranged' : 'melee'));
    if (w.thrown) attacks.push(mk('thrown'));
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
    for (const s of spec.cantrips) learn(s, sc.ability, C.name);
    for (const s of spec.prepared) learn(s, sc.ability, C.name, { slot: true });
    for (const s of domainSpells(spec.cls, level)) learn(s, sc.ability, 'Life Domain', { slot: true });
    slots = {};
    for (const [lv, k] of Object.entries(SLOTS_BY_LEVEL[level])) slots[lv] = { max: k, left: k };
  }
  const featFeature = [];
  const miLearn = (mi, label) => {
    for (const s of mi.cantrips) learn(s, mi.ability, label);
    learn(mi.spell, mi.ability, label, { free: 1, slot: true });
    featFeature.push({ name: label, rule: 'magic-initiate',
      text: `${mi.cantrips.map((x) => SPELLS[x].name).join(' and ')}; ${SPELLS[mi.spell].name} once per Long Rest free (or with a slot). Ability: ${ABILITY_NAMES[mi.ability]}.` });
  };
  if (spec.bgFeat) miLearn(spec.bgFeat, `Magic Initiate (${spec.bgFeat.list === 'cleric' ? 'Cleric' : 'Wizard'})`);
  if (spec.versatile?.feat === 'magic-initiate') miLearn(spec.versatile, `Magic Initiate (${spec.versatile.list === 'cleric' ? 'Cleric' : 'Wizard'})`);
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
  for (const f of feats) {
    if (f === 'magic-initiate') continue;
    const F0 = FEATS[f];
    const extra = f === 'skilled' ? `: ${spec.versatile.skills.map((x) => SKILL_NAMES[x]).join(', ')}` : '';
    features.push({ name: F0.name + extra, rule: F0.rule, text: F0.text, source: f === B.feat ? `${B.name} background` : 'Versatile (Human)' });
  }
  for (const f of featFeature) features.push({ ...f, source: f === featFeature[0] && spec.bgFeat ? `${B.name} background` : 'Versatile (Human)' });
  const F = (lv, name, rule, text) => { if (L(lv)) features.push({ name, rule, text, source: `${C.name} ${lv}` }); };
  const mastText = () => spec.masteries.map((w) => `${WEAPONS[w].name}: ${MASTERIES[WEAPONS[w].mastery].name}`).join(', ');
  if (spec.cls === 'fighter') {
    const st = FIGHTING_STYLES[spec.style];
    F(1, `Fighting Style: ${st.name}`, st.rule, st.text);
    F(1, 'Second Wind', 'second-wind', 'Bonus Action: regain 1d10 + Fighter level Hit Points. 2 uses, one back on a Short Rest, all on a Long Rest.');
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of 3 kinds of weapons. ${mastText()}.`);
    F(2, 'Action Surge', 'action-surge', 'Once per Short or Long Rest, take one extra action on your turn (not the Magic action).');
    F(2, 'Tactical Mind', 'tactical-mind', 'When you fail an ability check, you can spend a use of Second Wind to add 1d10 to it.');
    F(3, 'Champion: Improved Critical', 'improved-critical', 'Your weapon attack rolls score a Critical Hit on a roll of 19 or 20.');
    F(3, 'Champion: Remarkable Athlete', 'remarkable-athlete', 'Advantage on Initiative rolls and Strength (Athletics) checks.');
  } else if (spec.cls === 'rogue') {
    F(1, 'Sneak Attack', 'sneak-attack', `Once per turn, +${L(3) ? '2d6' : '1d6'} damage with a Finesse or Ranged weapon if you have Advantage, or an ally is next to the target.`);
    F(1, 'Expertise', 'expertise', `Double Proficiency Bonus in ${spec.expertise.map((x) => SKILL_NAMES[x]).join(' and ')}.`);
    F(1, "Thieves' Cant", null, 'You know the secret mix of slang and signs rogues use, and one more language.');
    F(1, 'Weapon Mastery', 'weapon-mastery', `Use the mastery property of 2 kinds of weapons. ${mastText()}.`);
    F(2, 'Cunning Action', 'cunning-action', 'Take the Dash, Disengage or Hide action as a Bonus Action.');
    F(3, 'Steady Aim', 'steady-aim', "Bonus Action, if you haven't moved this turn: Advantage on your next attack roll this turn, but your Speed is 0 until the end of the turn.");
    F(3, 'Thief: Fast Hands', 'fast-hands', 'Bonus Action: a Sleight of Hand check, or the Utilize action (pick a lock, use an object).');
    F(3, 'Thief: Second-Story Work', 'second-story-work', 'You climb at your full Speed.');
  } else if (spec.cls === 'cleric') {
    F(1, 'Spellcasting', 'spellcasting', `Cantrips at will; prepared spells use spell slots. Wisdom is your spellcasting ability. You prepare ${PREPARED_BY_LEVEL.cleric[level]} spells from the Cleric list and can change them after a Long Rest.`);
    if (spec.order === 'thaumaturge') F(1, 'Divine Order: Thaumaturge', 'divine-order', `One extra cantrip, and +${Math.max(1, m.wis)} (your Wisdom modifier, at least 1) to Intelligence (Arcana and Religion) checks.`);
    else F(1, 'Divine Order: Protector', 'divine-order', 'Training with Heavy armor and Martial weapons.');
    F(2, 'Channel Divinity', 'channel-divinity', 'Two uses (one back on a Short Rest, all on a Long Rest): Divine Spark (heal or harm, 1d8 + WIS) or Turn Undead.');
    F(3, 'Life Domain: Disciple of Life', 'disciple-of-life', 'Healing spells cast with a spell slot restore 2 + the slot\'s level extra Hit Points.');
    F(3, 'Life Domain: Preserve Life', 'preserve-life', 'Channel Divinity: share out 5 × your Cleric level Hit Points among Bloodied allies within 30 feet (up to half their maximum).');
    F(3, 'Life Domain Spells', 'spellcasting', 'Always prepared, not counted: Aid, Bless, Cure Wounds, Lesser Restoration.');
  } else if (spec.cls === 'wizard') {
    F(1, 'Spellcasting', 'spellcasting', `Cantrips at will; prepared spells use spell slots. Intelligence is your spellcasting ability. Your spellbook holds ${spec.book.length} spells; you prepare ${PREPARED_BY_LEVEL.wizard[level]} of them and can change them after a Long Rest.`);
    F(1, 'Ritual Adept', 'rituals', 'Cast Ritual spells from your spellbook without preparing them.');
    F(1, 'Arcane Recovery', 'arcane-recovery', 'Once a day, when you finish a Short Rest, regain spent spell slots whose levels add up to half your Wizard level (rounded up).');
    if (scholar) F(2, `Scholar: ${SKILL_NAMES[scholar]}`, 'expertise', `Expertise in ${SKILL_NAMES[scholar]}.`);
    F(3, 'Evoker: Potent Cantrip', 'potent-cantrip', 'When a creature succeeds on a save against your damaging cantrip, or your cantrip attack misses, it still takes half the damage.');
    F(3, 'Evoker: Evocation Savant', null, 'Copying Evocation spells into your spellbook takes half the time and gold.');
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
    armorId: kit.armor, hasShield: kit.shield, style: spec.style, mageArmor: false,
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
    twf: spec.style === 'two-weapon',
    sneak: spec.cls === 'rogue' ? (L(3) ? '2d6' : '1d6') : null,
    secondWind: spec.cls === 'fighter' ? { uses: 2, max: 2 } : null,
    actionSurge: spec.cls === 'fighter' && L(2) ? { uses: 1, max: 1 } : null,
    critOn: spec.cls === 'fighter' && L(3) ? 19 : 20,
    initAdv: spec.cls === 'fighter' && L(3),
    cunning: spec.cls === 'rogue' && L(2),
    steadyAim: spec.cls === 'rogue' && L(3),
    channel: spec.cls === 'cleric' && L(2) ? { uses: 2, max: 2 } : null,
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
    multiattack: 1,
    reaction: true, deathSaves: { s: 0, f: 0 }, stable: false, dead: false,
    x: 0, y: 0, ai: { fighter: kit.weapons.includes('longbow') ? 'archer' : 'melee', rogue: 'skirmisher', cleric: 'support', wizard: 'caster' }[spec.cls],
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

const USES = ['secondWind', 'actionSurge', 'channel', 'giant', 'adrenaline', 'breath'];

export function heroState(h) {
  const st = {
    level: h.level, hp: Math.max(0, h.hp), hpMax: h.hpMax - (h.aid || 0), aid: h.aid || 0,
    hd: { ...h.hitDice }, slots: {}, free: {}, uses: {},
    relentless: !!h.relentless?.used, arcane: !!h.arcaneRecovery?.used,
    exhaustion: h.exhaustion || 0, poisoned: !!h.conds?.some((c) => c.id === 'poisoned' && c.lasting), inspiration: !!h.inspiration,
    tempHp: h.tempHp || 0, mageArmor: !!h.mageArmor,
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
  h.hp = Math.max(0, Math.min(h.hpMax, carry(st.hp, st.hpMax + (st.aid || 0), h.hpMax)));
  if (st.hd) h.hitDice.left = carry(st.hd.left, st.hd.max, h.hitDice.max);
  for (const [lv, s] of Object.entries(h.casting?.slots || {})) {
    const o = st.slots?.[lv];
    if (o) s.left = carry(o.left, o.max, s.max);
  }
  for (const [sid, k] of Object.entries(h.casting?.known || {})) if (st.free?.[sid] != null) k.free = Math.min(k.free, st.free[sid]);
  for (const u of USES) {
    const o = st.uses?.[u];
    if (h[u] && o) h[u].uses = carry(o.uses, o.max, h[u].max);
  }
  if (h.relentless) h.relentless.used = !!st.relentless;
  if (h.arcaneRecovery) h.arcaneRecovery.used = !!st.arcane;
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
};

export function buildMonster(def, { id, label, x, y, ai = 'melee' }) {
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(def.abilities[a])]));
  const saves = { ...m, ...(def.saves || {}) };
  const saveProfs = Object.keys(def.saves || {});
  const traits = def.traits || {};
  const features = [];
  if (def.multiattack > 1) features.push({ name: 'Multiattack', rule: 'multiattack', text: `The ${def.name.toLowerCase()} makes ${def.multiattack} attacks with its Attack action.` });
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
      finesse: false, mastery: null, advDice: a.advDice, extra: a.extra || [], rider: a.rider || null, advIfGrappled: !!a.advIfGrappled,
      hit: [{ label: 'Stat block attack bonus', value: a.bonus, rule: 'stat-block' }],
      dmgFlat: [{ label: 'Stat block damage bonus', value: a.flat, rule: 'stat-block' }],
    })),
    features, casting,
    resist: [...(def.resist || [])], vuln: [...(def.vuln || [])], immune: [...(def.immune || [])], condImmune: [...(def.condImmune || [])],
    multiattack: def.multiattack || 1, nimble: !!traits.nimble, redirect: !!def.redirect,
    packTactics: !!traits.packTactics, undeadFortitude: !!traits.undeadFortitude,
    web: def.web ? { ...def.web, ready: true } : null,
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
