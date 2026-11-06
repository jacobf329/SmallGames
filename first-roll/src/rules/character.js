// Turns choices into a combat-ready creature. Every derived number keeps its
// parts ({ label, value, rule }) so the UI can show where it came from.

import {
  ABILITIES, ABILITY_NAMES, abilityMod, WEAPONS, MASTERIES, ARMOR, SPECIES,
  BACKGROUNDS, FEATS, PREMADES, GOBLIN_WARRIOR, SKILLS,
} from './data.js';

export const PB_BY_LEVEL = [0, 2, 2, 2, 2, 3];

export function buildHero(cls, { id = cls, name, level = 1 } = {}) {
  const p = PREMADES[cls];
  if (!p) throw new Error(`Unknown class ${cls}`);
  const pb = PB_BY_LEVEL[level];
  const scores = {};
  for (const a of ABILITIES) scores[a] = p.base[a] + (p.boosts[a] || 0);
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(scores[a])]));
  const bg = BACKGROUNDS[p.background];
  const feat = FEATS[bg.feat];

  // Armor Class
  const armor = ARMOR[p.armor];
  const acParts = [{ label: armor.name, value: armor.base, rule: 'armor-class' }];
  if (armor.dex) acParts.push({ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' });
  if (p.shield) acParts.push({ label: 'Shield', value: 2, rule: 'armor-class' });
  const ac = acParts.reduce((s, x) => s + x.value, 0);

  // Hit Points at level 1: hit die maximum + CON modifier.
  const hpMax = p.hitDie + m.con;

  // Initiative: a Dexterity check, plus PB with the Alert feat.
  const initParts = [{ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' }];
  if (bg.feat === 'alert') initParts.push({ label: 'Alert feat (PB)', value: pb, rule: 'alert' });

  const attacks = p.weapons.map((wid) => {
    const w = WEAPONS[wid];
    const ability = w.kind === 'ranged' ? 'dex' : (w.finesse && m.dex > m.str ? 'dex' : 'str');
    const hit = [
      { label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'ability-modifier' },
      { label: 'Proficiency Bonus', value: pb, rule: 'proficiency' },
    ];
    const dmgFlat = [{ label: `${ability.toUpperCase()} modifier`, value: m[ability], rule: 'damage' }];
    if (p.style === 'dueling' && w.kind === 'melee') dmgFlat.push({ label: 'Dueling fighting style', value: 2, rule: 'dueling' });
    const mastery = p.masteries.includes(wid) ? w.mastery : null;
    return {
      id: wid, name: w.name, kind: w.kind, dice: w.dice, type: w.type,
      finesse: !!w.finesse, range: w.range || null, props: w.props,
      hit, dmgFlat, mastery,
    };
  });

  const skills = {};
  for (const [s, ab] of Object.entries(SKILLS)) {
    const prof = p.skills.includes(s) ? (p.expertise?.includes(s) ? 2 : 1) : 0;
    skills[s] = m[ab] + prof * pb;
  }

  const features = [];
  for (const t of SPECIES[p.species].traits) features.push({ ...t, source: SPECIES[p.species].name });
  features.push({ ...feat, source: `${bg.name} background` });
  if (cls === 'fighter') {
    features.push({ name: 'Fighting Style: Dueling', rule: 'dueling', text: '+2 damage with a melee weapon held in one hand, with no other weapon.', source: 'Fighter 1' });
    features.push({ name: 'Second Wind', rule: 'second-wind', text: 'Bonus Action: regain 1d10 + Fighter level Hit Points. 2 uses, back on a Long Rest (one on a Short Rest).', source: 'Fighter 1' });
    features.push({ name: 'Weapon Mastery', rule: 'weapon-mastery', text: 'Use the mastery property of 3 kinds of weapons. Longsword: Sap.', source: 'Fighter 1' });
  }
  if (cls === 'rogue') {
    features.push({ name: 'Sneak Attack', rule: 'sneak-attack', text: 'Once per turn, +1d6 damage with a Finesse or Ranged weapon if you have Advantage, or an ally is next to the target.', source: 'Rogue 1' });
    features.push({ name: 'Expertise', rule: 'expertise', text: 'Double Proficiency Bonus in Stealth and Perception.', source: 'Rogue 1' });
    features.push({ name: 'Weapon Mastery', rule: 'weapon-mastery', text: 'Use the mastery property of 2 kinds of weapons. Shortsword and Shortbow: Vex.', source: 'Rogue 1' });
  }
  for (const a of attacks) {
    if (a.mastery) a.masteryText = MASTERIES[a.mastery].text;
  }

  return {
    id, side: 'hero', cls, kind: cls, className: p.className, emoji: p.emoji,
    name: name || p.className, level, pb,
    species: SPECIES[p.species].name, background: bg.name,
    scores, mods: m, saves: p.saves,
    ac, acParts, hp: hpMax, hpMax,
    hpParts: [{ label: `d${p.hitDie} maximum`, value: p.hitDie }, { label: 'CON modifier', value: m.con }],
    speed: 30, initParts, attacks, skills, features,
    luck: p.species === 'halfling',
    savage: bg.feat === 'savage-attacker',
    sneak: cls === 'rogue' ? '1d6' : null,
    secondWind: cls === 'fighter' ? { uses: 2, max: 2 } : null,
    reaction: true, deathSaves: { s: 0, f: 0 }, stable: false, dead: false,
    x: 0, y: 0, ai: cls === 'rogue' ? 'skirmisher' : 'melee',
  };
}

export function buildGoblin({ id, label, x, y, ai }) {
  const g = GOBLIN_WARRIOR;
  const m = Object.fromEntries(ABILITIES.map((a) => [a, abilityMod(g.abilities[a])]));
  return {
    id, side: 'foe', kind: g.kind, name: label, statName: g.name, emoji: g.emoji,
    scores: { ...g.abilities }, mods: m, pb: 2,
    ac: g.ac, acParts: [{ label: 'Leather Armor, Shield, DEX', value: g.ac, rule: 'stat-block' }],
    hp: g.hp, hpMax: g.hp, speed: g.speed,
    initParts: [{ label: 'DEX modifier', value: m.dex, rule: 'ability-modifier' }],
    attacks: g.attacks.map((a) => ({
      id: a.id, name: a.name, kind: a.kind, dice: a.dice, type: a.type, range: a.range || null,
      finesse: false, mastery: null, advDice: a.advDice,
      hit: [{ label: 'Stat block attack bonus', value: a.bonus, rule: 'stat-block' }],
      dmgFlat: [{ label: 'Stat block damage bonus', value: a.flat, rule: 'stat-block' }],
    })),
    features: [
      { name: 'Nimble Escape', rule: 'nimble-escape', text: 'The goblin can take the Disengage or Hide action as a Bonus Action.' },
    ],
    nimble: true,
    reaction: true, dead: false, x, y, ai, xp: g.xp,
  };
}

export const abilityName = (a) => ABILITY_NAMES[a];
