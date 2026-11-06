// Game data: a small subset of the SRD 5.2.1 (CC-BY-4.0), enough for Phase 0.
// Heroes are built from their choices (class, species, background, ability
// scores) so the derived numbers can show where they came from.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAMES = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
export const abilityMod = (score) => Math.floor((score - 10) / 2);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

export const SKILLS = {
  athletics: 'str', acrobatics: 'dex', sleightOfHand: 'dex', stealth: 'dex',
  arcana: 'int', history: 'int', investigation: 'int', nature: 'int', religion: 'int',
  animalHandling: 'wis', insight: 'wis', medicine: 'wis', perception: 'wis', survival: 'wis',
  deception: 'cha', intimidation: 'cha', performance: 'cha', persuasion: 'cha',
};
export const SKILL_NAMES = {
  athletics: 'Athletics', acrobatics: 'Acrobatics', sleightOfHand: 'Sleight of Hand', stealth: 'Stealth',
  arcana: 'Arcana', history: 'History', investigation: 'Investigation', nature: 'Nature', religion: 'Religion',
  animalHandling: 'Animal Handling', insight: 'Insight', medicine: 'Medicine', perception: 'Perception',
  survival: 'Survival', deception: 'Deception', intimidation: 'Intimidation', performance: 'Performance',
  persuasion: 'Persuasion',
};

// range is in feet: [normal, long]. reach is 5 ft for every weapon here.
export const WEAPONS = {
  longsword: { name: 'Longsword', kind: 'melee', dice: '1d8', type: 'Slashing', props: ['Versatile (1d10)'], mastery: 'sap' },
  shortsword: { name: 'Shortsword', kind: 'melee', dice: '1d6', type: 'Piercing', props: ['Finesse', 'Light'], finesse: true, mastery: 'vex' },
  shortbow: { name: 'Shortbow', kind: 'ranged', dice: '1d6', type: 'Piercing', props: ['Ammunition', 'Two-Handed'], range: [80, 320], mastery: 'vex' },
};

export const MASTERIES = {
  sap: { name: 'Sap', rule: 'mastery-sap', text: 'On a hit, the target has Disadvantage on its next attack roll before the start of your next turn.' },
  vex: { name: 'Vex', rule: 'mastery-vex', text: 'On a hit, you have Advantage on your next attack roll against that creature before the end of your next turn.' },
};

export const ARMOR = {
  chain: { name: 'Chain Mail', base: 16, dex: false },
  leather: { name: 'Leather Armor', base: 11, dex: true },
};

export const SPECIES = {
  human: { name: 'Human', traits: [
    { name: 'Resourceful', rule: 'heroic-inspiration', text: 'You gain Heroic Inspiration whenever you finish a Long Rest.' },
    { name: 'Skillful', text: 'Proficiency in one extra skill.' },
    { name: 'Versatile', text: 'An extra Origin feat.' },
  ] },
  halfling: { name: 'Halfling', traits: [
    { name: 'Luck', rule: 'luck', text: 'When you roll a 1 on the d20 of a D20 Test, you can reroll it and must use the new roll.' },
    { name: 'Brave', text: 'Advantage on saving throws to avoid or end the Frightened condition.' },
    { name: 'Naturally Stealthy', text: 'You can take the Hide action while behind a creature larger than you.' },
  ] },
};

export const BACKGROUNDS = {
  soldier: { name: 'Soldier', abilities: ['str', 'dex', 'con'], feat: 'savage-attacker', skills: ['athletics', 'intimidation'] },
  criminal: { name: 'Criminal', abilities: ['dex', 'con', 'int'], feat: 'alert', skills: ['sleightOfHand', 'stealth'] },
};

export const FEATS = {
  'savage-attacker': { name: 'Savage Attacker', rule: 'savage-attacker', text: 'Once per turn when you hit with a weapon, roll its damage dice twice and use either roll.' },
  'alert': { name: 'Alert', rule: 'alert', text: 'Add your Proficiency Bonus to your Initiative.' },
};

// Pre-made heroes for Phase 0. Standard array: 15, 14, 13, 12, 10, 8.
export const PREMADES = {
  fighter: {
    cls: 'fighter', className: 'Fighter', emoji: '🛡️', hitDie: 10,
    species: 'human', background: 'soldier',
    base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
    boosts: { str: 2, con: 1 },
    saves: ['str', 'con'],
    skills: ['athletics', 'intimidation', 'perception', 'survival'],
    armor: 'chain', shield: true,
    weapons: ['longsword'],
    masteries: ['longsword'],
    style: 'dueling',
    blurb: 'Armored front-liner. Stands between the goblins and everyone else.',
  },
  rogue: {
    cls: 'rogue', className: 'Rogue', emoji: '🗡️', hitDie: 8,
    species: 'halfling', background: 'criminal',
    base: { str: 8, dex: 15, con: 14, int: 12, wis: 13, cha: 10 },
    boosts: { dex: 2, int: 1 },
    saves: ['dex', 'int'],
    skills: ['sleightOfHand', 'stealth', 'acrobatics', 'perception', 'investigation', 'insight'],
    expertise: ['stealth', 'perception'],
    armor: 'leather', shield: false,
    weapons: ['shortsword', 'shortbow'],
    masteries: ['shortsword', 'shortbow'],
    blurb: 'Quick and precise. Hits hardest when a friend is next to the target.',
  },
};

// SRD 5.2.1 Goblin Warrior (CR 1/4, 50 XP).
export const GOBLIN_WARRIOR = {
  kind: 'goblin', name: 'Goblin Warrior', emoji: '👺',
  ac: 15, hp: 10, hpFormula: '3d6', speed: 30,
  abilities: { str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 },
  attacks: [
    { id: 'scimitar', name: 'Scimitar', kind: 'melee', bonus: 4, dice: '1d6', flat: 2, type: 'Slashing', advDice: '1d4' },
    { id: 'shortbow', name: 'Shortbow', kind: 'ranged', bonus: 4, dice: '1d6', flat: 2, type: 'Piercing', advDice: '1d4', range: [80, 320] },
  ],
  xp: 50,
};

// Phase 0 battlefield: 8 x 10 squares. Walls are rocks and trees.
export const SKIRMISH = {
  walls: ['1,5', '2,5', '5,4', '6,4', '6,5', '3,1'],
  heroStarts: { fighter: { x: 3, y: 8 }, rogue: { x: 4, y: 9 } },
  foes: [
    { id: 'g1', label: 'Goblin 1', x: 2, y: 2, ai: 'melee' },
    { id: 'g2', label: 'Goblin 2', x: 5, y: 2, ai: 'melee' },
    { id: 'g3', label: 'Goblin 3', x: 4, y: 0, ai: 'archer' },
  ],
};
