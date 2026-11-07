// Turns a hero's choices (a "spec") into a combat-ready creature. Every
// derived number keeps its parts ({ label, value, rule }) so the UI can show
// where it came from.
//
// spec = { cls, species, background, scores: { str..cha } (the standard array
//          assigned to abilities), plus: { ability: 2, ability: 1 } or three
//          +1s among the background's abilities, ancestry (dragonborn only), name }

import {
  ABILITIES, ABILITY_NAMES, abilityMod, WEAPONS, MASTERIES, ARMOR, SPECIES, BACKGROUNDS, FEATS,
  CLASSES, SKILLS, SKILL_NAMES, SPELLS, STANDARD_ARRAY, DRAGON_ANCESTRY, GOBLIN_WARRIOR,
  SLOTS_BY_LEVEL, SUBCLASSES, MAX_LEVEL, HP_PER_LEVEL, signed,
} from './data.js';
import { die } from './rng.js';

export const PB_BY_LEVEL = [0, 2, 2, 2, 2, 3];
export { SPELLS };
export const DEFAULT_BACKGROUND = { fighter: 'soldier', rogue: 'criminal', cleric: 'acolyte', wizard: 'sage' };
const sumParts = (parts) => parts.reduce((s, p) => s + p.value, 0);

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
  return { cls, species, background, scores, plus: suggestPlus(cls, background, scores), ancestry, name };
}

// Check a spec sent by a phone. Returns a clean copy or throws a readable Error.
export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('No hero.');
  const cls = String(spec.cls), species = String(spec.species), background = String(spec.background);
  if (!CLASSES[cls]) throw new Error('Pick a class.');
  if (!SPECIES[species]) throw new Error('Pick a species.');
  if (!BACKGROUNDS[background]) throw new Error('Pick a background.');
  const scores = {};
  for (const a of ABILITIES) scores[a] = Number(spec.scores?.[a]);
  const used = ABILITIES.map((a) => scores[a]).sort((x, y) => y - x);
  if (used.join() !== STANDARD_ARRAY.join()) throw new Error('Use each number of the standard array (15, 14, 13, 12, 10, 8) once.');
  const plus = {};
  for (const [a, v] of Object.entries(spec.plus || {})) {
    if (!BACKGROUNDS[background].abilities.includes(a)) throw new Error(`${BACKGROUNDS[background].name} can't raise ${ABILITY_NAMES[a] || a}.`);
    if (+v) plus[a] = +v;
  }
  const pattern = Object.values(plus).sort().join();
  if (pattern !== '1,2' && pattern !== '1,1,1') throw new Error('Background increases are +2 and +1, or +1 to all three.');
  const ancestry = DRAGON_ANCESTRY[spec.ancestry] ? spec.ancestry : 'red';
  const name = String(spec.name || '').trim().slice(0, 20);
  return { cls, species, background, scores, plus, ancestry, name };
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

const SPECIES_RESIST = { dwarf: ['Poison'], tiefling: ['Fire'] };

export function buildHero(rawSpec, { id = 'hero', name, level = 1 } = {}) {
  const spec = validateSpec(rawSpec);
  level = Math.max(1, Math.min(MAX_LEVEL, level | 0 || 1));
  const C = CLASSES[spec.cls], S = SPECIES[spec.species], B = BACKGROUNDS[spec.background];
  const feat = FEATS[B.feat];
  const pb = PB_BY_LEVEL[level];
  const scores = {};
  for (const a of ABILITIES) scores[a] = spec.scores[a] + (spec.plus[a] || 0);
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(scores[a])]));
  const L = (n) => level >= n;
  const sub = L(3) ? SUBCLASSES[spec.cls] : null;

  // Armor Class
  const armor = ARMOR[C.armor];
  const acParts = [{ label: armor.name, value: armor.base, rule: 'armor-class' }];
  if (armor.dex) {
    const d = armor.maxDex != null ? Math.min(m.dex, armor.maxDex) : m.dex;
    acParts.push({ label: `DEX modifier${armor.maxDex != null && m.dex > armor.maxDex ? ` (max ${armor.maxDex})` : ''}`, value: d, rule: 'ability-modifier' });
  }
  if (C.shield) acParts.push({ label: 'Shield', value: 2, rule: 'armor-class' });

  // Hit Points: the Hit Die's maximum + CON at level 1, then its fixed value
  // + CON for each level after (plus species and feats, per level).
  const hpParts = [{ label: `d${C.hitDie} maximum`, value: C.hitDie, rule: 'hit-points' }, { label: 'CON modifier', value: m.con, rule: 'ability-modifier' }];
  if (level > 1) hpParts.push({ label: `Levels 2${level > 2 ? `-${level}` : ''}: ${level - 1} × (${HP_PER_LEVEL[C.hitDie]} + CON)`, value: (level - 1) * (HP_PER_LEVEL[C.hitDie] + m.con), rule: 'level-up' });
  if (spec.species === 'dwarf') hpParts.push({ label: 'Dwarven Toughness', value: level, rule: 'dwarven-toughness' });
  if (spec.species === 'human') hpParts.push({ label: 'Tough feat (Versatile)', value: 2 * level, rule: 'tough' });
  const hpMax = Math.max(1, sumParts(hpParts));

  // Initiative: a Dexterity check, plus PB with the Alert feat.
  const initParts = [{ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' }];
  if (B.feat === 'alert') initParts.push({ label: 'Alert feat (PB)', value: pb, rule: 'alert' });

  // Skills: background, then the class's choices, then species extras.
  const prof = new Set(B.skills);
  let n = C.skillChoices.n;
  for (const s of C.skillChoices.from) { if (n && !prof.has(s)) { prof.add(s); n--; } }
  if (spec.species === 'human') { const s = ['perception', 'insight', 'athletics', 'medicine'].find((x) => !prof.has(x)); if (s) prof.add(s); }
  if (spec.species === 'elf') { const s = ['perception', 'insight', 'survival'].find((x) => !prof.has(x)); if (s) prof.add(s); }
  const expertise = C.expertise ? C.expertise.filter((s) => prof.has(s)) : [];
  let scholar = null;
  if (spec.cls === 'wizard' && L(2)) {
    scholar = ['investigation', 'arcana', 'history', 'nature', 'religion', 'medicine'].find((s) => prof.has(s));
    if (scholar) expertise.push(scholar);
  }
  const skills = {};
  for (const [s, ab] of Object.entries(SKILLS)) {
    skills[s] = m[ab] + (prof.has(s) ? (expertise.includes(s) ? 2 : 1) * pb : 0);
  }

  // Saving throws
  const saves = {};
  for (const a of ABILITIES) saves[a] = m[a] + (C.saves.includes(a) ? pb : 0);

  // Weapons
  const attacks = C.weapons.map((wid) => {
    const w = WEAPONS[wid];
    const ability = w.kind === 'ranged' ? 'dex' : (w.finesse && m.dex > m.str ? 'dex' : 'str');
    const hit = [
      { label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'ability-modifier' },
      { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' },
    ];
    const dmgFlat = [{ label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'damage' }];
    if (C.style === 'dueling' && w.kind === 'melee') dmgFlat.push({ label: 'Dueling fighting style', value: 2, rule: 'dueling' });
    const mastery = C.masteries.includes(wid) && ['sap', 'vex'].includes(w.mastery) ? w.mastery : null;
    return {
      id: wid, name: w.name, kind: w.kind, dice: w.dice, type: w.type,
      finesse: !!w.finesse, range: w.range || null, props: w.props, hit, dmgFlat, mastery,
      masteryText: mastery ? MASTERIES[mastery].text : null,
    };
  });

  // Spells: the class's own, Magic Initiate from the background, species extras.
  const known = {};
  const statsBy = {};
  const learn = (sid, ability, source, { free = 0, slot = false } = {}) => {
    const k = known[sid];
    if (k) { k.free += free; k.slot = k.slot || slot; return; }
    known[sid] = { ability, source, free, slot };
    statsBy[ability] ||= spellStats(m, pb, ability);
  };
  let slots = null;
  if (C.spellcasting) {
    const sc = C.spellcasting;
    for (const s of sc.cantrips) learn(s, sc.ability, C.name);
    for (let lv = 1; lv <= level; lv++) {
      for (const s of sc.prepared[lv] || []) learn(s, sc.ability, lv === 3 && spec.cls === 'cleric' ? 'Life Domain' : C.name, { slot: true });
    }
    slots = {};
    for (const [lv, k] of Object.entries(SLOTS_BY_LEVEL[level])) slots[lv] = { max: k, left: k };
  }
  if (feat.list) {
    const extra = feat.cantrips.filter((s) => !known[s]).slice(0, 2);
    for (const s of extra) learn(s, feat.ability, feat.name);
    const spell = feat.spells.find((s) => !known[s]) || feat.spells[0];
    learn(spell, feat.ability, feat.name, { free: 1 });
  }
  if (spec.species === 'tiefling') {
    const best = ['int', 'wis', 'cha'].sort((a, b) => m[b] - m[a])[0];
    learn('fire-bolt', best, 'Infernal Legacy');
    learn('thaumaturgy', best, 'Otherworldly Presence');
  }
  const casting = Object.keys(known).length ? { known, stats: statsBy, slots } : null;

  // Features for the character sheet
  const features = [];
  for (const t of S.traits) features.push({ ...t, source: S.name });
  features.push({ name: feat.name, rule: feat.rule, text: feat.text, source: `${B.name} background` });
  const F = (lv, name, rule, text) => { if (L(lv)) features.push({ name, rule, text, source: `${C.name} ${lv}` }); };
  if (spec.cls === 'fighter') {
    F(1, 'Fighting Style: Dueling', 'dueling', '+2 damage with a melee weapon held in one hand, with no other weapon.');
    F(1, 'Second Wind', 'second-wind', 'Bonus Action: regain 1d10 + Fighter level Hit Points. 2 uses, one back on a Short Rest, all on a Long Rest.');
    F(1, 'Weapon Mastery', 'weapon-mastery', 'Use the mastery property of 3 kinds of weapons. Longsword: Sap.');
    F(2, 'Action Surge', 'action-surge', 'Once per Short or Long Rest, take one extra action on your turn (not the Magic action).');
    F(2, 'Tactical Mind', 'tactical-mind', 'When you fail an ability check, you can spend a use of Second Wind to add 1d10 to it.');
    F(3, 'Champion: Improved Critical', 'improved-critical', 'Your weapon attack rolls score a Critical Hit on a roll of 19 or 20.');
    F(3, 'Champion: Remarkable Athlete', 'remarkable-athlete', 'Advantage on Initiative rolls and Strength (Athletics) checks.');
  } else if (spec.cls === 'rogue') {
    F(1, 'Sneak Attack', 'sneak-attack', `Once per turn, +${L(3) ? '2d6' : '1d6'} damage with a Finesse or Ranged weapon if you have Advantage, or an ally is next to the target.`);
    F(1, 'Expertise', 'expertise', 'Double Proficiency Bonus in Stealth and Perception.');
    F(1, 'Weapon Mastery', 'weapon-mastery', 'Use the mastery property of 2 kinds of weapons. Shortsword and Shortbow: Vex.');
    F(2, 'Cunning Action', 'cunning-action', 'Take the Dash, Disengage or Hide action as a Bonus Action.');
    F(3, 'Steady Aim', 'steady-aim', "Bonus Action, if you haven't moved this turn: Advantage on your next attack roll this turn, but your Speed is 0 until the end of the turn.");
    F(3, 'Thief: Fast Hands', 'fast-hands', 'Bonus Action: a Sleight of Hand check, or the Utilize action (pick a lock, use an object).');
    F(3, 'Thief: Second-Story Work', 'second-story-work', 'You climb at your full Speed.');
  } else if (spec.cls === 'cleric') {
    F(1, 'Spellcasting', 'spellcasting', 'Cantrips at will; leveled spells use spell slots. Wisdom is your spellcasting ability.');
    F(1, 'Divine Order: Protector', null, 'Training with heavy armor and martial weapons.');
    F(2, 'Channel Divinity', 'channel-divinity', 'Two uses (one back on a Short Rest, all on a Long Rest): Divine Spark (heal or harm, 1d8 + WIS) or Turn Undead.');
    F(3, 'Life Domain: Disciple of Life', 'disciple-of-life', 'Healing spells cast with a spell slot restore 2 + the slot\'s level extra Hit Points.');
    F(3, 'Life Domain: Preserve Life', 'preserve-life', 'Channel Divinity: share out 5 × your Cleric level Hit Points among Bloodied allies within 30 feet (up to half their maximum).');
    F(3, 'Life Domain Spells', 'spellcasting', 'Always prepared: Aid, Bless, Cure Wounds, Lesser Restoration.');
  } else if (spec.cls === 'wizard') {
    F(1, 'Spellcasting', 'spellcasting', 'Cantrips at will; leveled spells use spell slots. Intelligence is your spellcasting ability.');
    F(1, 'Ritual Adept', 'rituals', 'Cast Ritual spells from your spellbook without preparing them.');
    F(1, 'Arcane Recovery', 'arcane-recovery', 'Once a day, when you finish a Short Rest, regain spent spell slots whose levels add up to half your Wizard level (rounded up).');
    if (scholar) F(2, `Scholar: ${SKILL_NAMES[scholar]}`, 'expertise', `Expertise in ${SKILL_NAMES[scholar]}.`);
    F(3, 'Evoker: Potent Cantrip', 'potent-cantrip', 'When a creature succeeds on a save against your damaging cantrip, or your cantrip attack misses, it still takes half the damage.');
    F(3, 'Evoker: Evocation Savant', null, 'Copying Evocation spells into your spellbook takes half the time and gold.');
  }

  const ancestry = DRAGON_ANCESTRY[spec.ancestry];
  const resist = [...(SPECIES_RESIST[spec.species] || [])];
  if (spec.species === 'dragonborn') resist.push(ancestry.type);
  return {
    id, side: 'hero', cls: spec.cls, kind: spec.cls, className: C.name, emoji: C.emoji, subclass: sub,
    name: (name || spec.name || C.name).slice(0, 20), level, pb, spec,
    species: S.name, speciesId: spec.species, background: B.name, size: spec.species === 'halfling' || spec.species === 'gnome' ? 'small' : 'medium',
    scores, mods: m, saves, saveProfs: [...C.saves],
    ac: sumParts(acParts), acParts, hp: hpMax, hpMax, hpParts, tempHp: 0,
    hitDice: { die: C.hitDie, max: level, left: level },
    speed: S.speed, initParts, attacks, skills, profSkills: [...prof], expertise, features, casting,
    resist, vuln: [], immune: [], condImmune: [],
    luck: spec.species === 'halfling',
    mentalSaveAdv: spec.species === 'gnome',
    poisonSaveAdv: spec.species === 'dwarf',
    braveSaveAdv: spec.species === 'halfling',
    savage: B.feat === 'savage-attacker',
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
    firesBurn: spec.species === 'goliath' ? { uses: pb, max: pb } : null,
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
    x: 0, y: 0, ai: { fighter: 'melee', rogue: 'skirmisher', cleric: 'support', wizard: 'caster' }[spec.cls],
  };
}

// ------------------------------------------------- the party between fights ----
// A hero's spent resources, as plain JSON: what carries from one scene to the
// next (Hit Points, Hit Point Dice, spell slots, feature uses, conditions that
// last until a rest). Each count keeps its max so a level-up can add the
// difference to what's left.

const USES = ['secondWind', 'actionSurge', 'channel', 'firesBurn', 'adrenaline', 'breath'];

export function heroState(h) {
  const st = {
    level: h.level, hp: Math.max(0, h.hp), hpMax: h.hpMax - (h.aid || 0), aid: h.aid || 0,
    hd: { ...h.hitDice }, slots: {}, free: {}, uses: {},
    relentless: !!h.relentless?.used, arcane: !!h.arcaneRecovery?.used,
    exhaustion: h.exhaustion || 0, poisoned: !!h.conds?.some((c) => c.id === 'poisoned' && c.lasting), inspiration: !!h.inspiration,
  };
  for (const [lv, s] of Object.entries(h.casting?.slots || {})) st.slots[lv] = { ...s };
  for (const [sid, k] of Object.entries(h.casting?.known || {})) if (k.free || FEATS_FREE(h, sid)) st.free[sid] = k.free;
  for (const u of USES) if (h[u]) st.uses[u] = { uses: h[u].uses, max: h[u].max };
  return st;
}
const FEATS_FREE = (h, sid) => h.casting?.known?.[sid]?.source?.startsWith('Magic Initiate');

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
  h.dead = false; h.stable = false; h.deathSaves = { s: 0, f: 0 };
  if (h.hitDice.left < h.hitDice.max) got.push('all Hit Point Dice');
  h.hitDice.left = h.hitDice.max;
  let slots = false;
  for (const s of Object.values(h.casting?.slots || {})) { if (s.left < s.max) slots = true; s.left = s.max; }
  if (slots) got.push('all spell slots');
  const fresh = buildHero(h.spec, { id: h.id, name: h.name, level: h.level });
  for (const [sid, k] of Object.entries(h.casting?.known || {})) k.free = fresh.casting.known[sid].free;
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
