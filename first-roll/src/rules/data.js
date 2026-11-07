// Game data: a subset of the SRD 5.2.1 (CC-BY-4.0). Heroes are built from
// choices (class, background, species, ability scores) by character.js, so
// every derived number can show where it came from.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAMES = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
export const abilityMod = (score) => Math.floor((score - 10) / 2);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

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

// ------------------------------------------------------------- weapons ----
// range in feet: [normal, long]. Melee weapons here all have 5-ft reach.
export const WEAPONS = {
  longsword: { name: 'Longsword', kind: 'melee', dice: '1d8', type: 'Slashing', props: ['Versatile (1d10)'], mastery: 'sap' },
  shortsword: { name: 'Shortsword', kind: 'melee', dice: '1d6', type: 'Piercing', props: ['Finesse', 'Light'], finesse: true, mastery: 'vex' },
  shortbow: { name: 'Shortbow', kind: 'ranged', dice: '1d6', type: 'Piercing', props: ['Ammunition', 'Two-Handed'], range: [80, 320], mastery: 'vex' },
  mace: { name: 'Mace', kind: 'melee', dice: '1d6', type: 'Bludgeoning', props: [], mastery: 'sap' },
  quarterstaff: { name: 'Quarterstaff', kind: 'melee', dice: '1d6', type: 'Bludgeoning', props: ['Versatile (1d8)'], mastery: 'topple' },
  dagger: { name: 'Dagger', kind: 'melee', dice: '1d4', type: 'Piercing', props: ['Finesse', 'Light', 'Thrown (20/60)'], finesse: true, mastery: 'nick' },
};

export const MASTERIES = {
  sap: { name: 'Sap', rule: 'mastery-sap', text: 'On a hit, the target has Disadvantage on its next attack roll before the start of your next turn.' },
  vex: { name: 'Vex', rule: 'mastery-vex', text: 'On a hit, you have Advantage on your next attack roll against that creature before the end of your next turn.' },
  nick: { name: 'Nick', rule: 'weapon-mastery', text: 'Make the extra attack of Two-Weapon Fighting as part of the Attack action. (Comes in a later chapter.)' },
  topple: { name: 'Topple', rule: 'weapon-mastery', text: 'On a hit, the target makes a Constitution save or falls Prone. (Comes in a later chapter.)' },
};

export const ARMOR = {
  none: { name: 'No armor', base: 10, dex: true },
  leather: { name: 'Leather Armor', base: 11, dex: true },
  chainShirt: { name: 'Chain Shirt', base: 13, dex: true, maxDex: 2 },
  chain: { name: 'Chain Mail', base: 16, dex: false },
};

// -------------------------------------------------------------- spells ----
// kind: attack (spell attack roll), save (target saves), missile (always hits),
// cone / cube / sphere (area, everyone in it saves), heal, stabilize, buff
// (Bless, Shield of Faith, Aid), cure (Lesser Restoration), shield (a
// Reaction), teleport (Misty Step), rays (several spell attacks), utility
// (no battle use). conc: needs Concentration. up: what a higher slot adds.
export const SPELLS = {
  'fire-bolt': { name: 'Fire Bolt', level: 0, time: 'action', range: 120, kind: 'attack', dice: '1d10', type: 'Fire',
    text: 'Hurl a mote of fire: make a ranged spell attack. On a hit, 1d10 Fire damage.' },
  'ray-of-frost': { name: 'Ray of Frost', level: 0, time: 'action', range: 60, kind: 'attack', dice: '1d8', type: 'Cold', rider: 'chill',
    text: "A frigid beam: ranged spell attack. On a hit, 1d8 Cold damage and the target's Speed drops by 10 feet until the start of your next turn." },
  'sacred-flame': { name: 'Sacred Flame', level: 0, time: 'action', range: 60, kind: 'save', save: 'dex', dice: '1d8', type: 'Radiant',
    text: 'Flame descends on a creature you can see: it makes a Dexterity saving throw or takes 1d8 Radiant damage. Cover gives no bonus to this save.' },
  'spare-the-dying': { name: 'Spare the Dying', level: 0, time: 'action', range: 15, kind: 'stabilize',
    text: 'Choose a creature within 15 feet that has 0 Hit Points and is not dead. It becomes Stable.' },
  'thaumaturgy': { name: 'Thaumaturgy', level: 0, time: 'action', range: 30, kind: 'utility',
    text: 'Minor wonders: a booming voice, flickering flames, tremors. (Useful outside of fights.)' },
  'mage-hand': { name: 'Mage Hand', level: 0, time: 'action', range: 30, kind: 'utility',
    text: 'A spectral hand that can carry or open small things. (Useful outside of fights.)' },
  'healing-word': { name: 'Healing Word', level: 1, time: 'bonus', range: 60, kind: 'heal', dice: '2d4', up: { dice: '2d4' },
    text: 'A creature you can see within 60 feet regains 2d4 + your spellcasting modifier Hit Points. A Bonus Action. Higher slot: +2d4 per level.' },
  'cure-wounds': { name: 'Cure Wounds', level: 1, time: 'action', range: 5, kind: 'heal', dice: '2d8', up: { dice: '2d8' },
    text: 'A creature you touch regains 2d8 + your spellcasting modifier Hit Points. Higher slot: +2d8 per level.' },
  'guiding-bolt': { name: 'Guiding Bolt', level: 1, time: 'action', range: 120, kind: 'attack', dice: '4d6', type: 'Radiant', rider: 'guided', up: { dice: '1d6' },
    text: 'Ranged spell attack. On a hit, 4d6 Radiant damage, and the next attack roll against the target before the end of your next turn has Advantage. Higher slot: +1d6 per level.' },
  'magic-missile': { name: 'Magic Missile', level: 1, time: 'action', range: 120, kind: 'missile', darts: 3, dice: '1d4', flat: 1, type: 'Force', up: { darts: 1 },
    text: 'Three glowing darts that always hit, each dealing 1d4 + 1 Force damage. Higher slot: one more dart per level.' },
  'burning-hands': { name: 'Burning Hands', level: 1, time: 'action', kind: 'cone', size: 15, save: 'dex', dice: '3d6', type: 'Fire', half: true, up: { dice: '1d6' },
    text: 'A 15-foot Cone of flame. Each creature in it makes a Dexterity save: 3d6 Fire damage on a failure, half as much on a success. Careful: allies in the Cone burn too. Higher slot: +1d6 per level.' },
  'bless': { name: 'Bless', level: 1, time: 'action', range: 30, kind: 'buff', buff: 'bless', targets: 3, conc: true, up: { targets: 1 },
    text: 'Concentration, up to 1 minute. Up to three creatures within 30 feet add 1d4 to every attack roll and saving throw they make. Higher slot: one more creature per level.' },
  'shield-of-faith': { name: 'Shield of Faith', level: 1, time: 'bonus', range: 60, kind: 'buff', buff: 'faith', targets: 1, conc: true,
    text: 'Concentration, up to 10 minutes. A Bonus Action: a shimmering field gives one creature within 60 feet +2 to its Armor Class.' },
  'shield': { name: 'Shield', level: 1, time: 'reaction', kind: 'shield',
    text: 'A Reaction when an attack roll hits you: +5 to your Armor Class until the start of your next turn, which can turn that hit into a miss.' },
  'thunderwave': { name: 'Thunderwave', level: 1, time: 'action', kind: 'cube', size: 15, save: 'con', dice: '2d8', type: 'Thunder', half: true, push: 10, up: { dice: '1d8' },
    text: 'A 15-foot Cube of thunder bursts out from you. Each creature in it makes a Constitution save: 2d8 Thunder damage and pushed 10 feet away on a failure, half damage and no push on a success. Higher slot: +1d8 per level.' },
  'detect-magic': { name: 'Detect Magic', level: 1, time: 'action', kind: 'utility', ritual: true, conc: true,
    text: 'Concentration, up to 10 minutes. Sense magic within 30 feet. A Ritual: cast it in 10 extra minutes and it costs no spell slot. (Useful outside of fights.)' },
  'scorching-ray': { name: 'Scorching Ray', level: 2, time: 'action', range: 120, kind: 'rays', rays: 3, dice: '2d6', type: 'Fire', up: { rays: 1 },
    text: 'Three rays of fire. Make a ranged spell attack for each: 2d6 Fire damage on a hit. Aim them at one target or several. Higher slot: one more ray per level.' },
  'misty-step': { name: 'Misty Step', level: 2, time: 'bonus', range: 30, kind: 'teleport',
    text: 'A Bonus Action: you teleport up to 30 feet to an unoccupied space you can see. Teleporting never provokes Opportunity Attacks.' },
  'aid': { name: 'Aid', level: 2, time: 'action', range: 30, kind: 'buff', buff: 'aid', targets: 3, amount: 5, up: { amount: 5 },
    text: 'Up to three creatures within 30 feet: each one\'s Hit Point maximum and current Hit Points go up by 5 for 8 hours. Higher slot: +5 more per level.' },
  // Spells only monsters use here (the Cultist Fanatic's).
  'command': { name: 'Command', level: 1, time: 'action', range: 60, kind: 'command', save: 'wis', up: { targets: 1 },
    text: 'Speak a one-word command to a creature you can see within 60 feet. It makes a Wisdom save or follows it on its next turn. "Grovel!": it falls Prone and its turn ends.' },
  'hold-person': { name: 'Hold Person', level: 2, time: 'action', range: 60, kind: 'hold', save: 'wis', conc: true, only: 'humanoid', up: { targets: 1 },
    text: 'Concentration, up to 1 minute. A Humanoid you can see within 60 feet makes a Wisdom save or is Paralyzed. It repeats the save at the end of each of its turns; a success ends the spell on it.' },
  'spiritual-weapon': { name: 'Spiritual Weapon', level: 2, time: 'bonus', range: 60, kind: 'spiritual', dice: '1d8', type: 'Force', conc: true, up: { dice: '1d8' },
    text: 'Concentration, up to 1 minute. A Bonus Action: a floating spectral weapon appears and makes a melee spell attack (1d8 + spellcasting modifier Force). On later turns, a Bonus Action moves it up to 20 feet and attacks again.' },
  'light': { name: 'Light', level: 0, time: 'action', range: 5, kind: 'utility', text: 'An object glows like a torch. (Useful outside of fights.)' },
  'lesser-restoration': { name: 'Lesser Restoration', level: 2, time: 'bonus', range: 5, kind: 'cure', cures: ['poisoned', 'blinded', 'deafened', 'paralyzed'],
    text: 'A Bonus Action. Touch a creature and end one condition on it: Blinded, Deafened, Paralyzed or Poisoned.' },
};

// ------------------------------------------------------------- classes ----
export const CLASSES = {
  fighter: {
    name: 'Fighter', emoji: '🛡️', hitDie: 10, primary: 'str', role: 'Front line',
    saves: ['str', 'con'],
    skillChoices: { n: 2, from: ['athletics', 'perception', 'survival', 'intimidation', 'acrobatics', 'animalHandling', 'history', 'insight', 'persuasion'] },
    armor: 'chain', shield: true, weapons: ['longsword', 'dagger'], masteries: ['longsword', 'dagger', 'shortbow'],
    style: 'dueling', suggested: { str: 15, con: 14, dex: 13, wis: 12, cha: 10, int: 8 },
    blurb: 'Armored and tough. Stands between the monsters and everyone else.',
    plays: 'Walk up, hit hard, take the hits. Second Wind heals you in a pinch.',
  },
  rogue: {
    name: 'Rogue', emoji: '🗡️', hitDie: 8, primary: 'dex', role: 'Striker',
    saves: ['dex', 'int'],
    skillChoices: { n: 4, from: ['stealth', 'perception', 'acrobatics', 'investigation', 'insight', 'sleightOfHand', 'deception', 'athletics', 'intimidation', 'persuasion'] },
    expertise: ['stealth', 'perception'],
    armor: 'leather', shield: false, weapons: ['shortsword', 'shortbow', 'dagger'], masteries: ['shortsword', 'shortbow'],
    suggested: { dex: 15, con: 14, wis: 13, int: 12, cha: 10, str: 8 },
    blurb: 'Quick and precise. Hits hardest when a friend is next to the target.',
    plays: 'Find an enemy your friend is fighting and add Sneak Attack, or shoot from safety.',
  },
  cleric: {
    name: 'Cleric', emoji: '✨', hitDie: 8, primary: 'wis', role: 'Healer',
    saves: ['wis', 'cha'],
    skillChoices: { n: 2, from: ['medicine', 'insight', 'religion', 'history', 'persuasion'] },
    armor: 'chainShirt', shield: true, weapons: ['mace'], masteries: [],
    suggested: { wis: 15, con: 14, str: 13, dex: 12, cha: 10, int: 8 },
    spellcasting: { ability: 'wis', cantrips: ['sacred-flame', 'spare-the-dying', 'thaumaturgy'],
      prepared: { 1: ['healing-word', 'cure-wounds', 'guiding-bolt'], 2: ['bless', 'shield-of-faith'], 3: ['aid', 'lesser-restoration'] } },
    blurb: 'Divine magic. Keeps the party standing and burns foes with radiant light.',
    plays: 'Heal whoever is in trouble (Healing Word is a Bonus Action), then Sacred Flame or Guiding Bolt.',
  },
  wizard: {
    name: 'Wizard', emoji: '🔮', hitDie: 6, primary: 'int', role: 'Blaster',
    saves: ['int', 'wis'],
    skillChoices: { n: 2, from: ['arcana', 'investigation', 'history', 'insight', 'medicine', 'nature', 'religion'] },
    armor: 'none', shield: false, weapons: ['quarterstaff', 'dagger'], masteries: [],
    suggested: { int: 15, con: 14, dex: 13, wis: 12, cha: 10, str: 8 },
    spellcasting: { ability: 'int', cantrips: ['fire-bolt', 'ray-of-frost', 'mage-hand'],
      prepared: { 1: ['magic-missile', 'burning-hands'], 2: ['shield', 'thunderwave', 'detect-magic'], 3: ['scorching-ray', 'misty-step'] } },
    blurb: 'Fragile but powerful. Attacks from a distance with spells.',
    plays: 'Stay back and cast Fire Bolt. Save your spell slots for Magic Missile or Burning Hands on a crowd.',
  },
};

// Spell slots for a full caster (Cleric, Wizard) by character level.
export const SLOTS_BY_LEVEL = { 1: { 1: 2 }, 2: { 1: 3 }, 3: { 1: 4, 2: 2 } };
// Subclasses (one per class in the SRD), chosen at level 3.
export const SUBCLASSES = { fighter: 'Champion', rogue: 'Thief', cleric: 'Life Domain', wizard: 'Evoker' };
export const MAX_LEVEL = 3;
// Hit Points gained per level after the first: the Hit Die's fixed value.
export const HP_PER_LEVEL = { 6: 4, 8: 5, 10: 6, 12: 7 };

// ------------------------------------------------------------- species ----
export const DRAGON_ANCESTRY = {
  black: { name: 'Black', type: 'Acid' }, blue: { name: 'Blue', type: 'Lightning' }, brass: { name: 'Brass', type: 'Fire' },
  bronze: { name: 'Bronze', type: 'Lightning' }, copper: { name: 'Copper', type: 'Acid' }, gold: { name: 'Gold', type: 'Fire' },
  green: { name: 'Green', type: 'Poison' }, red: { name: 'Red', type: 'Fire' }, silver: { name: 'Silver', type: 'Cold' },
  white: { name: 'White', type: 'Cold' },
};

export const SPECIES = {
  human: { name: 'Human', speed: 30, emoji: '🧑', traits: [
    { name: 'Resourceful', rule: 'heroic-inspiration', text: 'You gain Heroic Inspiration whenever you finish a Long Rest.' },
    { name: 'Skillful', rule: 'skills', text: 'Proficiency in one extra skill.' },
    { name: 'Versatile', rule: 'tough', text: 'An extra Origin feat. Here: Tough, +2 Hit Points per level.' },
  ] },
  dwarf: { name: 'Dwarf', speed: 30, emoji: '⛏️', traits: [
    { name: 'Dwarven Toughness', rule: 'dwarven-toughness', text: '+1 Hit Point per level.' },
    { name: 'Dwarven Resilience', text: 'Resistance to Poison damage; Advantage on saves to avoid or end the Poisoned condition.' },
    { name: 'Darkvision', text: 'See in the dark out to 120 feet.' },
    { name: 'Stonecunning', text: 'Tremorsense while touching stone, a few times a day.' },
  ] },
  elf: { name: 'Elf (Wood)', speed: 35, emoji: '🌿', traits: [
    { name: 'Wood Elf Lineage', rule: 'speed', text: 'Your Speed is 35 feet.' },
    { name: 'Keen Senses', rule: 'skills', text: 'Proficiency in Perception (or Insight or Survival).' },
    { name: 'Fey Ancestry', text: 'Advantage on saves to avoid or end the Charmed condition.' },
    { name: 'Darkvision', text: 'See in the dark out to 60 feet.' },
  ] },
  gnome: { name: 'Gnome', speed: 30, emoji: '🔧', traits: [
    { name: 'Gnomish Cunning', rule: 'saving-throws', text: 'Advantage on Intelligence, Wisdom and Charisma saving throws.' },
    { name: 'Darkvision', text: 'See in the dark out to 60 feet.' },
    { name: 'Gnomish Lineage', text: 'A touch of innate magic (Prestidigitation or Speak with Animals).' },
  ] },
  goliath: { name: 'Goliath (Fire Giant)', speed: 35, emoji: '🗿', traits: [
    { name: "Fire's Burn", rule: 'fires-burn', text: 'When you hit with an attack roll, deal an extra 1d10 Fire damage. Uses equal to your Proficiency Bonus per Long Rest (here: once per turn, used automatically).' },
    { name: 'Powerful Build', text: 'You count as one size larger for carrying.' },
    { name: 'Speed', rule: 'speed', text: 'Your Speed is 35 feet.' },
  ] },
  halfling: { name: 'Halfling', speed: 30, emoji: '🍀', traits: [
    { name: 'Luck', rule: 'luck', text: 'When you roll a 1 on the d20 of a D20 Test, you reroll it and must use the new roll.' },
    { name: 'Brave', text: 'Advantage on saves to avoid or end the Frightened condition.' },
    { name: 'Naturally Stealthy', text: 'You can Hide behind a creature larger than you.' },
  ] },
  orc: { name: 'Orc', speed: 30, emoji: '💪', traits: [
    { name: 'Adrenaline Rush', rule: 'adrenaline-rush', text: 'Dash as a Bonus Action and gain Temporary Hit Points equal to your Proficiency Bonus. Uses equal to your Proficiency Bonus per Short or Long Rest.' },
    { name: 'Relentless Endurance', rule: 'relentless-endurance', text: "When you drop to 0 Hit Points but aren't killed outright, you drop to 1 instead. Once per Long Rest." },
    { name: 'Darkvision', text: 'See in the dark out to 120 feet.' },
  ] },
  tiefling: { name: 'Tiefling (Infernal)', speed: 30, emoji: '😈', traits: [
    { name: 'Infernal Legacy', rule: 'spellcasting', text: 'Resistance to Fire damage, and you know the Fire Bolt cantrip.' },
    { name: 'Otherworldly Presence', text: 'You know the Thaumaturgy cantrip.' },
    { name: 'Darkvision', text: 'See in the dark out to 60 feet.' },
  ] },
  dragonborn: { name: 'Dragonborn', speed: 30, emoji: '🐉', traits: [
    { name: 'Breath Weapon', rule: 'breath-weapon', text: 'Replace one attack of your Attack action with a 15-foot Cone of breath: Dexterity save (DC 8 + CON + PB), 1d10 damage, half on a success. Uses equal to your Proficiency Bonus per Long Rest.' },
    { name: 'Draconic Ancestry', text: 'Your dragon ancestor sets your breath and resistance damage type.' },
    { name: 'Damage Resistance', text: 'Resistance to the damage type of your ancestry.' },
    { name: 'Darkvision', text: 'See in the dark out to 60 feet.' },
  ] },
};

// --------------------------------------------------------- backgrounds ----
export const BACKGROUNDS = {
  acolyte: { name: 'Acolyte', abilities: ['int', 'wis', 'cha'], feat: 'magic-initiate-cleric', skills: ['insight', 'religion'],
    blurb: 'You served in a temple.' },
  criminal: { name: 'Criminal', abilities: ['dex', 'con', 'int'], feat: 'alert', skills: ['sleightOfHand', 'stealth'],
    blurb: 'You made a living outside the law.' },
  sage: { name: 'Sage', abilities: ['con', 'int', 'wis'], feat: 'magic-initiate-wizard', skills: ['arcana', 'history'],
    blurb: 'You spent years studying in libraries.' },
  soldier: { name: 'Soldier', abilities: ['str', 'dex', 'con'], feat: 'savage-attacker', skills: ['athletics', 'intimidation'],
    blurb: 'You trained for war.' },
};

export const FEATS = {
  'savage-attacker': { name: 'Savage Attacker', rule: 'savage-attacker', text: 'Once per turn when you hit with a weapon, roll its damage dice twice and use either roll.' },
  'alert': { name: 'Alert', rule: 'alert', text: 'Add your Proficiency Bonus to your Initiative.' },
  'magic-initiate-cleric': { name: 'Magic Initiate (Cleric)', rule: 'magic-initiate', text: 'Two Cleric cantrips, and one level 1 Cleric spell you can cast once per Long Rest without a spell slot. Spellcasting ability: Wisdom.',
    list: 'cleric', ability: 'wis', cantrips: ['sacred-flame', 'spare-the-dying', 'thaumaturgy'], spells: ['healing-word', 'guiding-bolt', 'cure-wounds'] },
  'magic-initiate-wizard': { name: 'Magic Initiate (Wizard)', rule: 'magic-initiate', text: 'Two Wizard cantrips, and one level 1 Wizard spell you can cast once per Long Rest without a spell slot. Spellcasting ability: Intelligence.',
    list: 'wizard', ability: 'int', cantrips: ['fire-bolt', 'ray-of-frost', 'mage-hand'], spells: ['magic-missile', 'burning-hands'] },
};

// ------------------------------------------------------------ monsters ----
// SRD 5.2.1 Goblin Warrior (CR 1/4, 50 XP) and Goblin Boss (CR 1, 200 XP).
export const GOBLIN_WARRIOR = {
  kind: 'goblin', name: 'Goblin Warrior', emoji: '👺', type: 'Small Fey (Goblinoid)', size: 'small', creature: 'fey', skills: { stealth: 6 }, traits: { nimble: true },
  ac: 15, hp: 10, hpFormula: '3d6', speed: 30,
  abilities: { str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 },
  attacks: [
    { id: 'scimitar', name: 'Scimitar', kind: 'melee', bonus: 4, dice: '1d6', flat: 2, type: 'Slashing', advDice: '1d4' },
    { id: 'shortbow', name: 'Shortbow', kind: 'ranged', bonus: 4, dice: '1d6', flat: 2, type: 'Piercing', advDice: '1d4', range: [80, 320] },
  ],
  multiattack: 1, xp: 50,
};

export const GOBLIN_BOSS = {
  kind: 'goblin-boss', name: 'Goblin Boss', emoji: '👹', type: 'Small Fey (Goblinoid)', size: 'small', creature: 'fey', skills: { stealth: 6 }, traits: { nimble: true },
  ac: 17, hp: 21, hpFormula: '6d6', speed: 30,
  abilities: { str: 10, dex: 15, con: 10, int: 10, wis: 8, cha: 10 },
  attacks: [
    { id: 'scimitar', name: 'Scimitar', kind: 'melee', bonus: 4, dice: '1d6', flat: 2, type: 'Slashing', advDice: '1d4' },
    { id: 'shortbow', name: 'Shortbow', kind: 'ranged', bonus: 4, dice: '1d6', flat: 2, type: 'Piercing', advDice: '1d4', range: [80, 320] },
  ],
  multiattack: 2, redirect: true, xp: 200,
};

// --- Phase 2 bestiary (SRD 5.2.1). All Proficiency Bonus +2.
// size: tiny|small|medium|large. On this grid every creature fills one square.
// creature: the creature type, for rules like Turn Undead and Hold Person.
// extra: more damage of another type on a hit. rider: what a hit also does.
export const WOLF = {
  kind: 'wolf', name: 'Wolf', emoji: '🐺', type: 'Medium Beast', size: 'medium', creature: 'beast',
  ac: 12, hp: 11, hpFormula: '2d8+2', speed: 40,
  abilities: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, skills: { perception: 5, stealth: 4 },
  attacks: [{ id: 'bite', name: 'Bite', kind: 'melee', bonus: 4, dice: '1d6', flat: 2, type: 'Piercing', rider: { prone: 'medium' } }],
  traits: { packTactics: true }, xp: 50, cr: '1/4',
};
export const SKELETON = {
  kind: 'skeleton', name: 'Skeleton', emoji: '💀', type: 'Medium Undead', size: 'medium', creature: 'undead',
  ac: 14, hp: 13, hpFormula: '2d8+4', speed: 30,
  abilities: { str: 10, dex: 16, con: 15, int: 6, wis: 8, cha: 5 },
  vuln: ['Bludgeoning'], immune: ['Poison'], condImmune: ['exhaustion', 'poisoned'],
  attacks: [
    { id: 'shortsword', name: 'Shortsword', kind: 'melee', bonus: 5, dice: '1d6', flat: 3, type: 'Piercing' },
    { id: 'shortbow', name: 'Shortbow', kind: 'ranged', bonus: 5, dice: '1d6', flat: 3, type: 'Piercing', range: [80, 320] },
  ],
  xp: 50, cr: '1/4',
};
export const ZOMBIE = {
  kind: 'zombie', name: 'Zombie', emoji: '🧟', type: 'Medium Undead', size: 'medium', creature: 'undead',
  ac: 8, hp: 15, hpFormula: '2d8+6', speed: 20,
  abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 }, saves: { wis: 0 },
  immune: ['Poison'], condImmune: ['exhaustion', 'poisoned'],
  attacks: [{ id: 'slam', name: 'Slam', kind: 'melee', bonus: 3, dice: '1d8', flat: 1, type: 'Bludgeoning' }],
  traits: { undeadFortitude: true }, xp: 50, cr: '1/4',
};
export const GIANT_SPIDER = {
  kind: 'spider', name: 'Giant Spider', emoji: '🕷️', type: 'Large Beast', size: 'large', creature: 'beast',
  ac: 14, hp: 26, hpFormula: '4d10+4', speed: 30,
  abilities: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 }, skills: { perception: 4, stealth: 7 },
  attacks: [{ id: 'bite', name: 'Bite', kind: 'melee', bonus: 5, dice: '1d8', flat: 3, type: 'Piercing', extra: [{ dice: '2d6', type: 'Poison' }] }],
  web: { dc: 13, range: 60, recharge: 5, webAc: 10, webHp: 5 },
  traits: { spiderClimb: true }, xp: 200, cr: '1',
};
export const CULTIST = {
  kind: 'cultist', name: 'Cultist', emoji: '🧎', type: 'Medium Humanoid', size: 'medium', creature: 'humanoid',
  ac: 12, hp: 9, hpFormula: '2d8', speed: 30,
  abilities: { str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10 }, saves: { wis: 2 },
  attacks: [{ id: 'sickle', name: 'Ritual Sickle', kind: 'melee', bonus: 3, dice: '1d4', flat: 1, type: 'Slashing', extra: [{ flat: 1, type: 'Necrotic' }] }],
  xp: 25, cr: '1/8',
};
export const CULTIST_FANATIC = {
  kind: 'fanatic', name: 'Cultist Fanatic', emoji: '🧙', type: 'Medium Humanoid', size: 'medium', creature: 'humanoid',
  ac: 13, hp: 44, hpFormula: '8d8+8', speed: 30,
  abilities: { str: 11, dex: 14, con: 12, int: 10, wis: 14, cha: 13 }, saves: { wis: 4 },
  attacks: [{ id: 'blade', name: 'Pact Blade', kind: 'melee', bonus: 4, dice: '1d8', flat: 2, type: 'Slashing', extra: [{ dice: '2d6', type: 'Necrotic' }] }],
  casting: { ability: 'wis', dc: 12, attack: 4, spells: { 'command': 2, 'hold-person': 1, 'spiritual-weapon': 2, 'light': 0, 'thaumaturgy': 0 } },
  xp: 450, cr: '2',
};
export const BUGBEAR_WARRIOR = {
  kind: 'bugbear', name: 'Bugbear Warrior', emoji: '🐻', type: 'Medium Fey (Goblinoid)', size: 'medium', creature: 'fey',
  ac: 14, hp: 33, hpFormula: '6d8+6', speed: 30,
  abilities: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 }, skills: { stealth: 6, survival: 2 },
  attacks: [
    { id: 'grab', name: 'Grab', kind: 'melee', bonus: 4, dice: '2d6', flat: 2, type: 'Bludgeoning', reach: 10, rider: { grapple: 12, size: 'medium' } },
    { id: 'hammer', name: 'Light Hammer', kind: 'melee', bonus: 4, dice: '3d4', flat: 2, type: 'Bludgeoning', reach: 10, advIfGrappled: true },
    { id: 'throw', name: 'Light Hammer (thrown)', kind: 'ranged', bonus: 4, dice: '3d4', flat: 2, type: 'Bludgeoning', range: [20, 60], advIfGrappled: true },
  ],
  traits: { abduct: true }, xp: 200, cr: '1',
};

// Phase 0's one-off skirmish, kept for the quick-fight mode and the tests.
export const SKIRMISH = {
  walls: ['1,5', '2,5', '5,4', '6,4', '6,5', '3,1'],
  heroStarts: [{ x: 3, y: 8 }, { x: 4, y: 9 }, { x: 2, y: 9 }, { x: 5, y: 8 }],
  foes: [
    { id: 'g1', label: 'Goblin 1', x: 2, y: 2, ai: 'melee' },
    { id: 'g2', label: 'Goblin 2', x: 5, y: 2, ai: 'melee' },
    { id: 'g3', label: 'Goblin 3', x: 4, y: 0, ai: 'archer' },
  ],
};
