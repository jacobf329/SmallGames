// Turns a hero's choices (a "spec") into a combat-ready creature. Every
// derived number keeps its parts ({ label, value, rule }) so the UI can show
// where it came from.
//
// spec = { cls, species, background, scores: { str..cha } (the standard array
//          assigned to abilities), plus: { ability: 2, ability: 1 } or three
//          +1s among the background's abilities, ancestry (dragonborn only), name }

import {
  ABILITIES, ABILITY_NAMES, abilityMod, WEAPONS, MASTERIES, ARMOR, SPECIES, BACKGROUNDS, FEATS,
  CLASSES, SKILLS, SPELLS, STANDARD_ARRAY, DRAGON_ANCESTRY, GOBLIN_WARRIOR,
  SPELL_SLOTS, CLASS_FEATURES, MAX_LEVEL,
} from './data.js';

export const PB_BY_LEVEL = [0, 2, 2, 2, 2, 3];
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

// gear: { armor: 'studded' | 'chain' | 'splint' | null, weapon: 0 | 1, cloak: bool }
export const canWear = (cls, armor) => {
  if (!armor) return true;
  if (cls === 'wizard') return false;
  if (armor === 'chain' || armor === 'splint') return cls === 'fighter' || cls === 'cleric';   // Protector Clerics train in heavy armor
  return true;
};

export function buildHero(rawSpec, { id = 'hero', name, level = 1, gear = {} } = {}) {
  level = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  const spec = validateSpec(rawSpec);
  const C = CLASSES[spec.cls], S = SPECIES[spec.species], B = BACKGROUNDS[spec.background];
  const feat = FEATS[B.feat];
  const pb = PB_BY_LEVEL[level];
  const scores = {};
  for (const a of ABILITIES) scores[a] = spec.scores[a] + (spec.plus[a] || 0);
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(scores[a])]));

  // Armor Class
  const armorId = gear.armor && ARMOR[gear.armor] && canWear(spec.cls, gear.armor) ? gear.armor : C.armor;
  const armor = ARMOR[armorId];
  const acParts = [{ label: armor.name, value: armor.base, rule: 'armor-class' }];
  if (armor.dex) {
    const d = armor.maxDex != null ? Math.min(m.dex, armor.maxDex) : m.dex;
    acParts.push({ label: `DEX modifier${armor.maxDex != null && m.dex > armor.maxDex ? ` (max ${armor.maxDex})` : ''}`, value: d, rule: 'ability-modifier' });
  }
  if (C.shield) acParts.push({ label: 'Shield', value: 2, rule: 'armor-class' });
  if (gear.cloak) acParts.push({ label: 'Cloak of Protection', value: 1, rule: 'armor-class' });

  // Hit Points at level 1: hit die maximum + CON modifier (+ species and feats).
  const hpParts = [{ label: `d${C.hitDie} maximum`, value: C.hitDie }, { label: 'CON modifier', value: m.con }];
  if (level > 1) hpParts.push({ label: `Levels 2-${level}: ${C.hitDie / 2 + 1} + CON each`, value: (level - 1) * (C.hitDie / 2 + 1 + m.con) });
  if (spec.species === 'dwarf') hpParts.push({ label: 'Dwarven Toughness', value: level });
  if (spec.species === 'human') hpParts.push({ label: 'Tough feat (Versatile)', value: 2 * level });
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
  if (spec.cls === 'wizard' && level >= 2) { const s = ['arcana', 'investigation', 'history'].find((x) => prof.has(x)); if (s) expertise.push(s); }
  const skills = {};
  for (const [s, ab] of Object.entries(SKILLS)) {
    skills[s] = m[ab] + (prof.has(s) ? (expertise.includes(s) ? 2 : 1) * pb : 0);
  }

  // Saving throws
  const saves = {};
  for (const a of ABILITIES) saves[a] = m[a] + (C.saves.includes(a) ? pb : 0) + (gear.cloak ? 1 : 0);

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
    if (gear.weapon) { hit.push({ label: '+1 magic weapon', value: 1, rule: 'magic-weapon' }); dmgFlat.push({ label: '+1 magic weapon', value: 1, rule: 'magic-weapon' }); }
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
    const prepared = [...sc.prepared, ...Object.entries(sc.byLevel || {}).filter(([l]) => +l <= level).flatMap(([, l]) => l)];
    for (const s of prepared) learn(s, sc.ability, C.name, { slot: true });
    slots = {};
    for (const [sl, n] of Object.entries(SPELL_SLOTS[level])) slots[sl] = { max: n, left: n };
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
  if (spec.cls === 'fighter') {
    features.push({ name: 'Fighting Style: Dueling', rule: 'dueling', text: '+2 damage with a melee weapon held in one hand, with no other weapon.', source: 'Fighter 1' });
    features.push({ name: 'Second Wind', rule: 'second-wind', text: 'Bonus Action: regain 1d10 + Fighter level Hit Points. 2 uses, one back on a Short Rest, all on a Long Rest.', source: 'Fighter 1' });
    features.push({ name: 'Weapon Mastery', rule: 'weapon-mastery', text: 'Use the mastery property of 3 kinds of weapons. Longsword: Sap.', source: 'Fighter 1' });
  } else if (spec.cls === 'rogue') {
    features.push({ name: 'Sneak Attack', rule: 'sneak-attack', text: 'Once per turn, +1d6 damage with a Finesse or Ranged weapon if you have Advantage, or an ally is next to the target.', source: 'Rogue 1' });
    features.push({ name: 'Expertise', rule: 'expertise', text: 'Double Proficiency Bonus in Stealth and Perception.', source: 'Rogue 1' });
    features.push({ name: 'Weapon Mastery', rule: 'weapon-mastery', text: 'Use the mastery property of 2 kinds of weapons. Shortsword and Shortbow: Vex.', source: 'Rogue 1' });
  } else if (spec.cls === 'cleric') {
    features.push({ name: 'Spellcasting', rule: 'spellcasting', text: 'Cantrips at will; leveled spells use spell slots. Wisdom is your spellcasting ability.', source: 'Cleric 1' });
    features.push({ name: 'Divine Order: Protector', text: 'Training with heavy armor and martial weapons.', source: 'Cleric 1' });
  } else if (spec.cls === 'wizard') {
    features.push({ name: 'Spellcasting', rule: 'spellcasting', text: 'Cantrips at will; leveled spells use spell slots. Intelligence is your spellcasting ability.', source: 'Wizard 1' });
    features.push({ name: 'Ritual Adept', text: 'Cast Ritual spells from your spellbook without preparing them.', source: 'Wizard 1' });
    features.push({ name: 'Arcane Recovery', text: 'Regain some spell slots on a Short Rest, once a day.', source: 'Wizard 1' });
  }

  for (let l = 2; l <= level; l++) for (const f of CLASS_FEATURES[spec.cls][l] || []) features.push({ ...f, source: `${C.name} ${l}` });

  const ancestry = DRAGON_ANCESTRY[spec.ancestry];
  return {
    id, side: 'hero', cls: spec.cls, kind: spec.cls, className: C.name, emoji: C.emoji,
    name: (name || spec.name || C.name).slice(0, 20), level, pb, spec,
    species: S.name, speciesId: spec.species, background: B.name,
    scores, mods: m, saves, saveProfs: [...C.saves],
    ac: sumParts(acParts), acParts, hp: hpMax, hpMax, hpParts, tempHp: 0,
    speed: S.speed, initParts, attacks, skills, profSkills: [...prof], expertise, features, casting,
    luck: spec.species === 'halfling',
    mentalSaveAdv: spec.species === 'gnome',
    savage: B.feat === 'savage-attacker',
    sneak: spec.cls === 'rogue' ? (level >= 3 ? '2d6' : '1d6') : null,
    secondWind: spec.cls === 'fighter' ? { uses: 2, max: 2 } : null,
    actionSurge: spec.cls === 'fighter' && level >= 2 ? { uses: 1, max: 1 } : null,
    critOn: spec.cls === 'fighter' && level >= 3 ? 19 : 20,
    initAdv: spec.cls === 'fighter' && level >= 3,
    cunning: spec.cls === 'rogue' && level >= 2,
    steadyAim: spec.cls === 'rogue' && level >= 3,
    channel: spec.cls === 'cleric' && level >= 2 ? { uses: 2, max: 2 } : null,
    discipleOfLife: spec.cls === 'cleric' && level >= 3,
    potentCantrip: spec.cls === 'wizard' && level >= 3,
    hitDie: C.hitDie, hitDice: { max: level, left: level },
    gear: { armor: armorId === C.armor ? null : armorId, weapon: gear.weapon ? 1 : 0, cloak: !!gear.cloak },
    firesBurn: spec.species === 'goliath' ? { uses: pb, max: pb } : null,
    adrenaline: spec.species === 'orc' ? { uses: pb, max: pb } : null,
    relentless: spec.species === 'orc' ? { used: false } : null,
    breath: spec.species === 'dragonborn' ? {
      uses: pb, max: pb, dice: '1d10', type: ancestry.type, ancestry: ancestry.name,
      dc: [{ label: 'Base', value: 8, rule: 'spell-save-dc' }, { label: 'CON modifier', value: m.con, rule: 'ability-modifier' }, { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' }],
    } : null,
    multiattack: 1,
    reaction: true, deathSaves: { s: 0, f: 0 }, stable: false, dead: false,
    x: 0, y: 0, ai: { fighter: 'melee', rogue: 'skirmisher', cleric: 'support', wizard: 'caster' }[spec.cls],
  };
}

// ------------------------------------------------------------- monsters ----

export function buildMonster(def, { id, label, x, y, ai = 'melee' }) {
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(def.abilities[a])]));
  return {
    id, side: 'foe', kind: def.kind, name: label, statName: def.name, statType: def.type, emoji: def.emoji,
    scores: { ...def.abilities }, mods: m, saves: { ...m }, saveProfs: [], pb: 2,
    ac: def.ac, acParts: [{ label: 'Stat block', value: def.ac, rule: 'stat-block' }],
    hp: def.hp, hpMax: def.hp, tempHp: 0, speed: def.speed,
    initParts: [{ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' }],
    attacks: def.attacks.map((a) => ({
      id: a.id, name: a.name, kind: a.kind, dice: a.dice, type: a.type, range: a.range || null,
      finesse: false, mastery: null, advDice: a.advDice,
      hit: [{ label: 'Stat block attack bonus', value: a.bonus, rule: 'stat-block' }],
      dmgFlat: [{ label: 'Stat block damage bonus', value: a.flat, rule: 'stat-block' }],
    })),
    features: [
      ...(def.multiattack > 1 ? [{ name: 'Multiattack', rule: 'multiattack', text: `The ${def.name.toLowerCase()} makes ${def.multiattack} attacks with its Attack action.` }] : []),
      { name: 'Nimble Escape', rule: 'nimble-escape', text: 'Takes the Disengage or Hide action as a Bonus Action.' },
      ...(def.redirect ? [{ name: 'Redirect Attack', rule: 'redirect-attack', text: 'Reaction: when a creature makes an attack roll against the boss, a goblin ally within 5 feet swaps places with it and becomes the target.' }] : []),
    ],
    multiattack: def.multiattack || 1, nimble: true, redirect: !!def.redirect,
    reaction: true, dead: false, x, y, ai, xp: def.xp,
  };
}

export const buildGoblin = (opts) => buildMonster(GOBLIN_WARRIOR, opts);

// Quick spell lookups for the UI and AI.
export function spellList(c) {
  if (!c.casting) return [];
  return Object.entries(c.casting.known).map(([sid, k]) => ({ id: sid, ...SPELLS[sid], ...k }));
}

// ------------------------------------------------------------- progress ----
// A hero's state between fights. The creature is rebuilt from spec + level +
// gear at each fight; progress carries what was spent.
export function freshProgress(h, { xp = 0 } = {}) {
  const pr = { level: h.level, xp, hp: h.hpMax, hd: h.hitDice.max, aid: 0, gear: { ...h.gear }, uses: {} };
  harvestUses(h, pr);
  return pr;
}

function harvestUses(c, pr) {
  const u = pr.uses;
  u.secondWind = c.secondWind?.uses;
  u.actionSurge = c.actionSurge?.uses;
  u.channel = c.channel?.uses;
  u.breath = c.breath?.uses;
  u.firesBurn = c.firesBurn?.uses;
  u.adrenaline = c.adrenaline?.uses;
  u.relentlessUsed = !!c.relentless?.used;
  u.arcaneRecovery = !!u.arcaneRecovery;
  u.slots = c.casting?.slots ? Object.fromEntries(Object.entries(c.casting.slots).map(([l, s]) => [l, s.left])) : null;
  u.free = c.casting ? Object.fromEntries(Object.entries(c.casting.known).filter(([, k]) => k.free != null).map(([sid, k]) => [sid, k.free])) : null;
}

// Put a saved state onto a freshly built creature.
export function applyProgress(c, pr) {
  if (!pr) return c;
  if (pr.aid) { c.hpMax += pr.aid; c.hpParts.push({ label: 'Aid', value: pr.aid }); }
  c.hp = Math.max(0, Math.min(c.hpMax, pr.hp ?? c.hpMax));
  c.hitDice.left = Math.max(0, Math.min(c.hitDice.max, pr.hd ?? c.hitDice.max));
  const u = pr.uses || {};
  const set = (obj, v) => { if (obj && v != null) obj.uses = Math.max(0, Math.min(obj.max, v)); };
  set(c.secondWind, u.secondWind); set(c.actionSurge, u.actionSurge); set(c.channel, u.channel);
  set(c.breath, u.breath); set(c.firesBurn, u.firesBurn); set(c.adrenaline, u.adrenaline);
  if (c.relentless) c.relentless.used = !!u.relentlessUsed;
  if (c.casting?.slots && u.slots) for (const [l, s] of Object.entries(c.casting.slots)) if (u.slots[l] != null) s.left = Math.max(0, Math.min(s.max, u.slots[l]));
  if (c.casting && u.free) for (const [sid, n] of Object.entries(u.free)) if (c.casting.known[sid]?.free != null && n != null) c.casting.known[sid].free = Math.max(0, Math.min(c.casting.known[sid].free, n));
  return c;
}

// Read what a creature has left after a fight back into its progress.
export function harvestProgress(c, pr) {
  const out = { ...pr, uses: { ...pr.uses }, gear: { ...pr.gear } };
  out.hp = Math.min(c.hp, c.hpMax);
  out.hd = c.hitDice.left;
  harvestUses(c, out);
  return out;
}
