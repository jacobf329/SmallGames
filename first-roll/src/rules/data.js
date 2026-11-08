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
// Point buy: every score starts at 8; 27 points; nothing above 15 before increases.
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUDGET = 27;

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
// versatile: the damage die used two-handed (no shield). thrown: a melee
// weapon you can also throw, [normal, long]. light: can make the Light
// property's extra attack. heavy / twoHanded: for Great Weapon Fighting.
export const WEAPONS = {
  longsword: { name: 'Longsword', kind: 'melee', dice: '1d8', type: 'Slashing', props: ['Versatile (1d10)'], versatile: '1d10', mastery: 'sap', martial: true },
  shortsword: { name: 'Shortsword', kind: 'melee', dice: '1d6', type: 'Piercing', props: ['Finesse', 'Light'], finesse: true, light: true, mastery: 'vex', martial: true },
  scimitar: { name: 'Scimitar', kind: 'melee', dice: '1d6', type: 'Slashing', props: ['Finesse', 'Light'], finesse: true, light: true, mastery: 'nick', martial: true },
  greatsword: { name: 'Greatsword', kind: 'melee', dice: '2d6', type: 'Slashing', props: ['Heavy', 'Two-Handed'], heavy: true, twoHanded: true, mastery: 'graze', martial: true },
  flail: { name: 'Flail', kind: 'melee', dice: '1d8', type: 'Bludgeoning', props: [], mastery: 'sap', martial: true },
  javelin: { name: 'Javelin', kind: 'melee', dice: '1d6', type: 'Piercing', props: ['Thrown (30/120)'], thrown: [30, 120], mastery: 'slow' },
  shortbow: { name: 'Shortbow', kind: 'ranged', dice: '1d6', type: 'Piercing', props: ['Ammunition', 'Two-Handed'], range: [80, 320], twoHanded: true, mastery: 'vex' },
  longbow: { name: 'Longbow', kind: 'ranged', dice: '1d8', type: 'Piercing', props: ['Ammunition', 'Heavy', 'Two-Handed'], range: [150, 600], heavy: true, twoHanded: true, mastery: 'slow', martial: true },
  mace: { name: 'Mace', kind: 'melee', dice: '1d6', type: 'Bludgeoning', props: [], mastery: 'sap' },
  quarterstaff: { name: 'Quarterstaff', kind: 'melee', dice: '1d6', type: 'Bludgeoning', props: ['Versatile (1d8)'], versatile: '1d8', mastery: 'topple' },
  dagger: { name: 'Dagger', kind: 'melee', dice: '1d4', type: 'Piercing', props: ['Finesse', 'Light', 'Thrown (20/60)'], finesse: true, light: true, thrown: [20, 60], mastery: 'nick' },
};

export const MASTERIES = {
  sap: { name: 'Sap', rule: 'mastery-sap', text: 'On a hit, the target has Disadvantage on its next attack roll before the start of your next turn.' },
  vex: { name: 'Vex', rule: 'mastery-vex', text: 'On a hit, you have Advantage on your next attack roll against that creature before the end of your next turn.' },
  nick: { name: 'Nick', rule: 'mastery-nick', text: "The Light property's extra attack can be made as part of the Attack action instead of as a Bonus Action, once per turn." },
  graze: { name: 'Graze', rule: 'mastery-graze', text: 'On a miss, the target still takes damage equal to the ability modifier you used for the attack roll.' },
  slow: { name: 'Slow', rule: 'mastery-slow', text: "On a hit that deals damage, the target's Speed drops by 10 feet until the start of your next turn." },
  topple: { name: 'Topple', rule: 'mastery-topple', text: 'On a hit, the target makes a Constitution save (DC 8 + the ability modifier you attacked with + your Proficiency Bonus) or falls Prone.' },
};

// type: light / medium / heavy (none for no armor). str: Strength needed, or Speed -10 ft.
export const ARMOR = {
  none: { name: 'No armor', base: 10, dex: true },
  leather: { name: 'Leather Armor', base: 11, dex: true, type: 'light' },
  studded: { name: 'Studded Leather Armor', base: 12, dex: true, type: 'light' },
  chainShirt: { name: 'Chain Shirt', base: 13, dex: true, maxDex: 2, type: 'medium' },
  chain: { name: 'Chain Mail', base: 16, dex: false, type: 'heavy', str: 13 },
};

// The SRD's Fighting Style feats.
export const FIGHTING_STYLES = {
  archery: { name: 'Archery', rule: 'archery', text: '+2 bonus to attack rolls you make with Ranged weapons.' },
  defense: { name: 'Defense', rule: 'defense', text: 'While you wear Light, Medium or Heavy armor, you gain a +1 bonus to Armor Class.' },
  'great-weapon': { name: 'Great Weapon Fighting', rule: 'great-weapon-fighting', text: 'When you roll damage for a Melee weapon you hold in two hands (Two-Handed or Versatile), treat any 1 or 2 on a damage die as a 3.' },
  'two-weapon': { name: 'Two-Weapon Fighting', rule: 'two-weapon-fighting', text: "When you make the Light property's extra attack, add your ability modifier to its damage." },
};

// Starting equipment. A fighter picks a pack (or gold spent as listed); the
// others' packs are fixed here. gold: what's left over.
export const KITS = {
  fighter: {
    a: { name: 'Option A', armor: 'chain', shield: false, weapons: ['greatsword', 'flail', 'javelin'], gold: 4,
      text: 'Chain Mail, Greatsword, Flail, 8 Javelins, Dungeoneer\'s Pack and 4 GP.' },
    b: { name: 'Option B', armor: 'studded', shield: false, weapons: ['scimitar', 'shortsword', 'longbow'], gold: 11,
      text: 'Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Dungeoneer\'s Pack and 11 GP.' },
    c: { name: 'Option C: 155 GP, spent', armor: 'chain', shield: true, weapons: ['longsword', 'dagger', 'shortbow'], twins: ['dagger'], gold: 24,
      text: 'The 155 GP option, spent on Chain Mail (75), a Shield (10), a Longsword (15), 2 Daggers (4), a Shortbow (25), 20 Arrows and a Quiver (2). 24 GP left.' },
  },
  rogue: {
    a: { name: 'Option A', armor: 'leather', shield: false, weapons: ['shortsword', 'dagger', 'shortbow'], twins: ['dagger'], gold: 8,
      text: "Leather Armor, 2 Daggers, Shortsword, Shortbow, 20 Arrows, Quiver, Thieves' Tools, Burglar's Pack and 8 GP." },
  },
  cleric: {
    a: { name: 'Option A', armor: 'chainShirt', shield: true, weapons: ['mace'], gold: 7,
      text: "Chain Shirt, Shield, Mace, Holy Symbol, Priest's Pack and 7 GP." },
    b: { name: 'Option B: 110 GP, spent', armor: 'chain', shield: true, weapons: ['mace'], gold: 15, needs: 'protector',
      text: 'The 110 GP option, spent on Chain Mail (75), a Shield (10), a Mace (5) and a Holy Symbol (5). 15 GP left. Needs the Protector order (Heavy armor training).' },
  },
  wizard: {
    a: { name: 'Option A', armor: 'none', shield: false, weapons: ['quarterstaff', 'dagger'], gold: 5,
      text: "2 Daggers, a Quarterstaff (your Arcane Focus), Robe, Spellbook, Scholar's Pack and 5 GP." },
  },
};

// -------------------------------------------------------------- spells ----
// kind says what a spell does in a fight:
//   attack   spell attack roll (melee: true for touch attacks)
//   save     one creature saves (half: half damage on a success)
//   missile  darts that always hit; rays: several spell attacks. Both split
//            among creatures you pick.
//   area     everyone in a shape saves. area: { shape, size (ft), from }
//            shape cone | cube | sphere | line | emanation; from 'self' (the
//            shape starts at the caster, aimed at any square) or 'point'
//            (centred on a square within range).
//   heal, stabilize, buff (Bless, Shield of Faith, Aid), cure (Lesser
//   Restoration), temp (Temporary Hit Points on yourself), armor (Mage
//   Armor), stride (Longstrider), teleport (a square you can see),
//   command, hold, spiritual, shield and rebuke (Reactions), utility (no
//   battle use).
// touch: range is a creature next to you. conc: needs Concentration.
// up: what each slot level above the spell's adds. ritual: can be a Ritual.
export const SPELLS = {
  // ---- cantrips
  'fire-bolt': { name: 'Fire Bolt', level: 0, time: 'action', range: 120, kind: 'attack', dice: '1d10', type: 'Fire',
    text: 'Hurl a mote of fire: make a ranged spell attack. On a hit, 1d10 Fire damage.' },
  'ray-of-frost': { name: 'Ray of Frost', level: 0, time: 'action', range: 60, kind: 'attack', dice: '1d8', type: 'Cold', rider: 'chill',
    text: "A frigid beam: ranged spell attack. On a hit, 1d8 Cold damage and the target's Speed drops by 10 feet until the start of your next turn." },
  'chill-touch': { name: 'Chill Touch', level: 0, time: 'action', range: 5, touch: true, melee: true, kind: 'attack', dice: '1d10', type: 'Necrotic', rider: 'grave',
    text: "Make a melee spell attack against a creature next to you. On a hit, 1d10 Necrotic damage, and it can't regain Hit Points until the end of your next turn." },
  'shocking-grasp': { name: 'Shocking Grasp', level: 0, time: 'action', range: 5, touch: true, melee: true, kind: 'attack', dice: '1d8', type: 'Lightning', rider: 'shocked',
    text: "Make a melee spell attack against a creature next to you. On a hit, 1d8 Lightning damage, and it can't make Opportunity Attacks until the start of its next turn." },
  'poison-spray': { name: 'Poison Spray', level: 0, time: 'action', range: 30, kind: 'attack', dice: '1d12', type: 'Poison',
    text: 'Spray toxic mist: make a ranged spell attack against a creature within 30 feet. On a hit, 1d12 Poison damage.' },
  'sacred-flame': { name: 'Sacred Flame', level: 0, time: 'action', range: 60, kind: 'save', save: 'dex', dice: '1d8', type: 'Radiant', noCover: true,
    text: 'Flame descends on a creature you can see: it makes a Dexterity saving throw or takes 1d8 Radiant damage. Cover gives no bonus to this save.' },
  'spare-the-dying': { name: 'Spare the Dying', level: 0, time: 'action', range: 15, kind: 'stabilize',
    text: 'Choose a creature within 15 feet that has 0 Hit Points and is not dead. It becomes Stable.' },
  'guidance': { name: 'Guidance', level: 0, time: 'action', range: 5, touch: true, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. Touch a willing creature and pick a skill: it adds 1d4 to one ability check it makes with that skill before the spell ends. (Useful outside of fights.)' },
  'resistance-cantrip': { name: 'Resistance', level: 0, time: 'action', range: 5, touch: true, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. Touch a willing creature and pick a damage type: once a turn, it takes 1d4 less damage of that type. (Not used in fights here yet.)' },
  'thaumaturgy': { name: 'Thaumaturgy', level: 0, time: 'action', range: 30, kind: 'utility',
    text: 'Minor wonders: a booming voice, flickering flames, tremors. (Useful outside of fights.)' },
  'mage-hand': { name: 'Mage Hand', level: 0, time: 'action', range: 30, kind: 'utility',
    text: 'A spectral hand that can carry or open small things. (Useful outside of fights.)' },
  'light': { name: 'Light', level: 0, time: 'action', range: 5, kind: 'utility', text: 'An object glows like a torch. (Useful outside of fights.)' },
  'mending': { name: 'Mending', level: 0, time: 'action', range: 5, kind: 'utility', text: 'Repair a single break or tear in an object, like a broken chain link or a torn cloak. (Useful outside of fights.)' },
  'dancing-lights': { name: 'Dancing Lights', level: 0, time: 'action', range: 120, kind: 'utility', conc: true, text: 'Up to four floating, torch-like lights that you move around. (Useful outside of fights.)' },
  'minor-illusion': { name: 'Minor Illusion', level: 0, time: 'action', range: 30, kind: 'utility', text: 'A sound or a small still image of an object, for 1 minute. (Useful outside of fights.)' },
  'prestidigitation': { name: 'Prestidigitation', level: 0, time: 'action', range: 10, kind: 'utility', text: 'Small magic tricks: a spark, a smell, cleaning or soiling an object, warming food. (Useful outside of fights.)' },
  'druidcraft': { name: 'Druidcraft', level: 0, time: 'action', range: 30, kind: 'utility', text: 'Small nature magic: predict the weather, make a flower bloom, a puff of wind. (Useful outside of fights.)' },
  // ---- level 1
  'healing-word': { name: 'Healing Word', level: 1, time: 'bonus', range: 60, kind: 'heal', dice: '2d4', up: { dice: '2d4' },
    text: 'A creature you can see within 60 feet regains 2d4 + your spellcasting modifier Hit Points. A Bonus Action. Higher slot: +2d4 per level.' },
  'cure-wounds': { name: 'Cure Wounds', level: 1, time: 'action', range: 5, touch: true, kind: 'heal', dice: '2d8', up: { dice: '2d8' },
    text: 'A creature you touch regains 2d8 + your spellcasting modifier Hit Points. Higher slot: +2d8 per level.' },
  'guiding-bolt': { name: 'Guiding Bolt', level: 1, time: 'action', range: 120, kind: 'attack', dice: '4d6', type: 'Radiant', rider: 'guided', up: { dice: '1d6' },
    text: 'Ranged spell attack. On a hit, 4d6 Radiant damage, and the next attack roll against the target before the end of your next turn has Advantage. Higher slot: +1d6 per level.' },
  'inflict-wounds': { name: 'Inflict Wounds', level: 1, time: 'action', range: 5, touch: true, kind: 'save', save: 'con', dice: '2d10', type: 'Necrotic', half: true, up: { dice: '1d10' },
    text: 'A creature you touch makes a Constitution save: 2d10 Necrotic damage on a failure, half as much on a success. Higher slot: +1d10 per level.' },
  'magic-missile': { name: 'Magic Missile', level: 1, time: 'action', range: 120, kind: 'missile', darts: 3, dice: '1d4', flat: 1, type: 'Force', up: { darts: 1 },
    text: 'Three glowing darts that always hit, each dealing 1d4 + 1 Force damage to a creature of your choice you can see within range (aim them at one or several). Higher slot: one more dart per level.' },
  'ray-of-sickness': { name: 'Ray of Sickness', level: 1, time: 'action', range: 60, kind: 'attack', dice: '2d8', type: 'Poison', rider: 'sicken', up: { dice: '1d8' },
    text: 'A greenish ray: ranged spell attack. On a hit, 2d8 Poison damage and the target is Poisoned until the end of your next turn. Higher slot: +1d8 per level.' },
  'burning-hands': { name: 'Burning Hands', level: 1, time: 'action', kind: 'area', area: { shape: 'cone', size: 15, from: 'self' }, save: 'dex', dice: '3d6', type: 'Fire', half: true, up: { dice: '1d6' },
    text: 'A 15-foot Cone of flame from you, aimed any way you like. Each creature in it makes a Dexterity save: 3d6 Fire damage on a failure, half as much on a success. Careful: allies in the Cone burn too. Higher slot: +1d6 per level.' },
  'thunderwave': { name: 'Thunderwave', level: 1, time: 'action', kind: 'area', area: { shape: 'cube', size: 15, from: 'self' }, save: 'con', dice: '2d8', type: 'Thunder', half: true, push: 10, noCover: true, up: { dice: '1d8' },
    text: 'A 15-foot Cube of thunder bursts out from you on the side you pick. Each creature in it makes a Constitution save: 2d8 Thunder damage and pushed 10 feet away on a failure, half damage and no push on a success. Higher slot: +1d8 per level.' },
  'faerie-fire': { name: 'Faerie Fire', level: 1, time: 'action', range: 60, kind: 'area', area: { shape: 'cube', size: 20, from: 'point' }, save: 'dex', effect: 'outlined', conc: true,
    text: 'Concentration, up to 1 minute. Pick a 20-foot Cube within 60 feet. Each creature in it makes a Dexterity save or is outlined in light: attack rolls against it have Advantage, and it can\'t benefit from being Invisible.' },
  'bless': { name: 'Bless', level: 1, time: 'action', range: 30, kind: 'buff', buff: 'bless', targets: 3, conc: true, up: { targets: 1 },
    text: 'Concentration, up to 1 minute. Up to three creatures within 30 feet add 1d4 to every attack roll and saving throw they make. Higher slot: one more creature per level.' },
  'shield-of-faith': { name: 'Shield of Faith', level: 1, time: 'bonus', range: 60, kind: 'buff', buff: 'faith', targets: 1, conc: true,
    text: 'Concentration, up to 10 minutes. A Bonus Action: a shimmering field gives one creature within 60 feet +2 to its Armor Class.' },
  'command': { name: 'Command', level: 1, time: 'action', range: 60, kind: 'command', save: 'wis', up: { targets: 1 },
    text: 'Speak a one-word command to a creature you can see within 60 feet. It makes a Wisdom save or follows it on its next turn. "Grovel!": it falls Prone and its turn ends.' },
  'false-life': { name: 'False Life', level: 1, time: 'action', kind: 'temp', dice: '2d4', flat: 4, up: { flat: 5 },
    text: 'You gain 2d4 + 4 Temporary Hit Points. Higher slot: 5 more per level.' },
  'mage-armor': { name: 'Mage Armor', level: 1, time: 'action', range: 5, touch: true, kind: 'armor',
    text: "Touch a willing creature who isn't wearing armor: its base Armor Class becomes 13 + its Dexterity modifier for 8 hours (here: until your next Long Rest)." },
  'longstrider': { name: 'Longstrider', level: 1, time: 'action', range: 5, touch: true, kind: 'stride', targets: 1, up: { targets: 1 },
    text: 'Touch a creature: its Speed goes up by 10 feet for 1 hour (here: until the fight ends). Higher slot: one more creature per level.' },
  'shield': { name: 'Shield', level: 1, time: 'reaction', kind: 'shield',
    text: 'A Reaction when an attack roll hits you: +5 to your Armor Class until the start of your next turn, which can turn that hit into a miss.' },
  'hellish-rebuke': { name: 'Hellish Rebuke', level: 1, time: 'reaction', range: 60, kind: 'rebuke', save: 'dex', dice: '2d10', type: 'Fire', half: true, up: { dice: '1d10' },
    text: 'A Reaction when a creature you can see within 60 feet damages you: it makes a Dexterity save, 2d10 Fire damage on a failure, half on a success. (Used for you automatically.)' },
  'detect-magic': { name: 'Detect Magic', level: 1, time: 'action', kind: 'utility', ritual: true, conc: true,
    text: 'Concentration, up to 10 minutes. Sense magic within 30 feet. A Ritual: cast it in 10 extra minutes and it costs no spell slot. (Useful outside of fights.)' },
  'comprehend-languages': { name: 'Comprehend Languages', level: 1, time: 'action', kind: 'utility', ritual: true,
    text: 'For 1 hour you understand any language you hear or read. A Ritual. (Useful outside of fights.)' },
  'feather-fall': { name: 'Feather Fall', level: 1, time: 'reaction', kind: 'utility', range: 60,
    text: 'A Reaction when you or creatures near you fall: up to five of them drift down slowly and take no falling damage. (Useful outside of fights here.)' },
  'identify': { name: 'Identify', level: 1, time: 'action', kind: 'utility', ritual: true, touch: true,
    text: "Learn a magic item's properties, or the spells on a creature or object you touch. A Ritual. (Useful outside of fights.)" },
  'alarm': { name: 'Alarm', level: 1, time: 'action', kind: 'utility', ritual: true,
    text: 'Ward a door or an area for 8 hours: you are alerted when a creature enters it. A Ritual. (Useful outside of fights.)' },
  'unseen-servant': { name: 'Unseen Servant', level: 1, time: 'action', kind: 'utility', ritual: true,
    text: 'An invisible, mindless force that does simple chores for 1 hour. A Ritual. (Useful outside of fights.)' },
  'find-familiar': { name: 'Find Familiar', level: 1, time: 'action', kind: 'utility', ritual: true,
    text: 'Gain the service of a small spirit animal, like an owl or a cat, that scouts for you. A Ritual. (Useful outside of fights here.)' },
  'speak-with-animals': { name: 'Speak with Animals', level: 1, time: 'action', kind: 'utility', ritual: true,
    text: 'For 10 minutes you can understand and talk with Beasts. A Ritual. (Useful outside of fights.)' },
  // ---- level 2
  'scorching-ray': { name: 'Scorching Ray', level: 2, time: 'action', range: 120, kind: 'rays', rays: 3, dice: '2d6', type: 'Fire', up: { rays: 1 },
    text: 'Three rays of fire. Make a ranged spell attack for each: 2d6 Fire damage on a hit. Aim them at one target or several. Higher slot: one more ray per level.' },
  'misty-step': { name: 'Misty Step', level: 2, time: 'bonus', range: 30, kind: 'teleport',
    text: 'A Bonus Action: you teleport up to 30 feet to an unoccupied space you can see. Teleporting never provokes Opportunity Attacks.' },
  'aid': { name: 'Aid', level: 2, time: 'action', range: 30, kind: 'buff', buff: 'aid', targets: 3, amount: 5, up: { amount: 5 },
    text: 'Up to three creatures within 30 feet: each one\'s Hit Point maximum and current Hit Points go up by 5 for 8 hours. Higher slot: +5 more per level.' },
  'hold-person': { name: 'Hold Person', level: 2, time: 'action', range: 60, kind: 'hold', save: 'wis', conc: true, only: 'humanoid', up: { targets: 1 },
    text: 'Concentration, up to 1 minute. A Humanoid you can see within 60 feet makes a Wisdom save or is Paralyzed. It repeats the save at the end of each of its turns; a success ends the spell on it.' },
  'spiritual-weapon': { name: 'Spiritual Weapon', level: 2, time: 'bonus', range: 60, kind: 'spiritual', dice: '1d8', type: 'Force', conc: true, up: { dice: '1d8' },
    text: 'Concentration, up to 1 minute. A Bonus Action: a floating spectral weapon appears and makes a melee spell attack (1d8 + spellcasting modifier Force). On later turns, a Bonus Action moves it up to 20 feet and attacks again.' },
  'lesser-restoration': { name: 'Lesser Restoration', level: 2, time: 'bonus', range: 5, touch: true, kind: 'cure', cures: ['poisoned', 'blinded', 'deafened', 'paralyzed'],
    text: 'A Bonus Action. Touch a creature and end one condition on it: Blinded, Deafened, Paralyzed or Poisoned.' },
};

// Each class's spell list (the spells of the SRD this game has).
export const SPELL_LISTS = {
  cleric: {
    0: ['sacred-flame', 'spare-the-dying', 'guidance', 'resistance-cantrip', 'thaumaturgy', 'light', 'mending'],
    1: ['bless', 'command', 'cure-wounds', 'detect-magic', 'guiding-bolt', 'healing-word', 'inflict-wounds', 'shield-of-faith'],
    2: ['aid', 'hold-person', 'lesser-restoration', 'spiritual-weapon'],
  },
  wizard: {
    0: ['fire-bolt', 'ray-of-frost', 'chill-touch', 'shocking-grasp', 'poison-spray', 'mage-hand', 'light', 'mending', 'dancing-lights', 'minor-illusion', 'prestidigitation'],
    1: ['magic-missile', 'burning-hands', 'shield', 'thunderwave', 'mage-armor', 'false-life', 'ray-of-sickness', 'detect-magic', 'comprehend-languages', 'feather-fall', 'identify', 'alarm', 'unseen-servant', 'find-familiar'],
    2: ['scorching-ray', 'misty-step', 'hold-person'],
  },
};
// Cantrips known, and spells you can prepare, by class level (2024 tables).
export const CANTRIPS_KNOWN = { cleric: { 1: 3, 2: 3, 3: 3 }, wizard: { 1: 3, 2: 3, 3: 3 } };
export const PREPARED_BY_LEVEL = { cleric: { 1: 4, 2: 5, 3: 6 }, wizard: { 1: 4, 2: 5, 3: 6 } };
// A wizard's spellbook starts with 6 level 1 spells and gains 2 a level.
export const SPELLBOOK_SIZE = { 1: 6, 2: 8, 3: 10 };
// Life Domain spells: always prepared from Cleric level 3, not counted.
export const DOMAIN_SPELLS = { 3: ['aid', 'bless', 'cure-wounds', 'lesser-restoration'] };

// ------------------------------------------------------------- classes ----
export const CLASSES = {
  fighter: {
    name: 'Fighter', emoji: '🛡️', hitDie: 10, primary: 'str', role: 'Front line',
    saves: ['str', 'con'],
    skillChoices: { n: 2, from: ['athletics', 'perception', 'survival', 'intimidation', 'acrobatics', 'animalHandling', 'history', 'insight', 'persuasion'] },
    masteryCount: 3, kits: ['a', 'b', 'c'],
    defaults: { kit: 'c', style: 'defense', masteries: ['longsword', 'dagger', 'shortbow'], skills: ['athletics', 'perception', 'survival', 'intimidation'] },
    suggested: { str: 15, con: 14, dex: 13, wis: 12, cha: 10, int: 8 },
    blurb: 'Armored and tough. Stands between the monsters and everyone else.',
    plays: 'Walk up, hit hard, take the hits. Second Wind heals you in a pinch.',
  },
  rogue: {
    name: 'Rogue', emoji: '🗡️', hitDie: 8, primary: 'dex', role: 'Striker',
    saves: ['dex', 'int'],
    skillChoices: { n: 4, from: ['stealth', 'perception', 'acrobatics', 'investigation', 'insight', 'sleightOfHand', 'deception', 'athletics', 'intimidation', 'persuasion'] },
    masteryCount: 2, kits: ['a'],
    defaults: { kit: 'a', masteries: ['shortsword', 'shortbow'], expertise: ['stealth', 'perception'],
      skills: ['stealth', 'perception', 'acrobatics', 'investigation', 'insight', 'deception', 'sleightOfHand', 'athletics'] },
    suggested: { dex: 15, con: 14, wis: 13, int: 12, cha: 10, str: 8 },
    blurb: 'Quick and precise. Hits hardest when a friend is next to the target.',
    plays: 'Find an enemy your friend is fighting and add Sneak Attack, or shoot from safety.',
  },
  cleric: {
    name: 'Cleric', emoji: '✨', hitDie: 8, primary: 'wis', role: 'Healer',
    saves: ['wis', 'cha'],
    skillChoices: { n: 2, from: ['medicine', 'insight', 'religion', 'history', 'persuasion'] },
    masteryCount: 0, kits: ['a', 'b'],
    defaults: { kit: 'a', order: 'protector', skills: ['medicine', 'insight', 'religion', 'persuasion'],
      cantrips: ['sacred-flame', 'spare-the-dying', 'thaumaturgy', 'light'],
      prepared: ['healing-word', 'cure-wounds', 'guiding-bolt', 'bless', 'shield-of-faith', 'spiritual-weapon', 'command', 'hold-person', 'inflict-wounds', 'aid', 'lesser-restoration'] },
    suggested: { wis: 15, con: 14, str: 13, dex: 12, cha: 10, int: 8 },
    spellcasting: { ability: 'wis', prepares: 'list' },
    blurb: 'Divine magic. Keeps the party standing and burns foes with radiant light.',
    plays: 'Heal whoever is in trouble (Healing Word is a Bonus Action), then Sacred Flame or Guiding Bolt.',
  },
  wizard: {
    name: 'Wizard', emoji: '🔮', hitDie: 6, primary: 'int', role: 'Blaster',
    saves: ['int', 'wis'],
    skillChoices: { n: 2, from: ['arcana', 'investigation', 'history', 'insight', 'medicine', 'nature', 'religion'] },
    masteryCount: 0, kits: ['a'],
    defaults: { kit: 'a', skills: ['arcana', 'investigation', 'history', 'insight'], scholar: ['arcana', 'investigation', 'history', 'religion', 'nature', 'medicine'],
      cantrips: ['fire-bolt', 'ray-of-frost', 'mage-hand', 'shocking-grasp'],
      book: ['magic-missile', 'burning-hands', 'shield', 'mage-armor', 'thunderwave', 'detect-magic', 'false-life', 'ray-of-sickness', 'scorching-ray', 'misty-step', 'hold-person', 'find-familiar'],
      prepared: ['magic-missile', 'shield', 'burning-hands', 'mage-armor', 'scorching-ray', 'misty-step', 'thunderwave', 'false-life', 'ray-of-sickness', 'hold-person'] },
    suggested: { int: 15, con: 14, dex: 13, wis: 12, cha: 10, str: 8 },
    spellcasting: { ability: 'int', prepares: 'book' },
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

// Species choices. lineages: pick one (elf, gnome, goliath, tiefling).
// Each lineage's spells: cantrip at level 1, a level 1 spell at level 3
// (once per Long Rest without a slot, or with a slot). castAbility: the
// species spells' spellcasting ability is your pick of Int, Wis or Cha.
export const SPECIES = {
  human: { name: 'Human', speed: 30, emoji: '🧑', traits: [
    { name: 'Resourceful', rule: 'heroic-inspiration', text: 'You gain Heroic Inspiration whenever you finish a Long Rest.' },
    { name: 'Skillful', rule: 'skills', text: 'Proficiency in one skill of your choice.' },
    { name: 'Versatile', rule: 'origin-feat', text: 'An Origin feat of your choice.' },
  ] },
  dwarf: { name: 'Dwarf', speed: 30, emoji: '⛏️', traits: [
    { name: 'Dwarven Toughness', rule: 'dwarven-toughness', text: '+1 Hit Point per level.' },
    { name: 'Dwarven Resilience', text: 'Resistance to Poison damage; Advantage on saves to avoid or end the Poisoned condition.' },
    { name: 'Darkvision', text: 'See in the dark out to 120 feet.' },
    { name: 'Stonecunning', text: 'Tremorsense while touching stone, a few times a day.' },
  ] },
  elf: { name: 'Elf', speed: 30, emoji: '🌿', castAbility: true, skillFrom: ['insight', 'perception', 'survival'], traits: [
    { name: 'Elven Lineage', rule: 'species', text: 'Drow, High Elf or Wood Elf: a cantrip now, a spell at level 3.' },
    { name: 'Keen Senses', rule: 'skills', text: 'Proficiency in Insight, Perception or Survival.' },
    { name: 'Fey Ancestry', text: 'Advantage on saves to avoid or end the Charmed condition.' },
    { name: 'Trance', text: "You don't need to sleep; a Long Rest takes you 4 hours of meditation." },
    { name: 'Darkvision', text: 'See in the dark out to 60 feet.' },
  ], lineages: {
    drow: { name: 'Drow', cantrip: 'dancing-lights', spell3: 'faerie-fire', darkvision: 120, text: 'Darkvision 120 feet. Dancing Lights; Faerie Fire at level 3.' },
    high: { name: 'High Elf', cantrip: 'prestidigitation', spell3: 'detect-magic', text: 'Prestidigitation; Detect Magic at level 3.' },
    wood: { name: 'Wood Elf', cantrip: 'druidcraft', spell3: 'longstrider', speed: 35, text: 'Speed 35 feet. Druidcraft; Longstrider at level 3.' },
  } },
  gnome: { name: 'Gnome', speed: 30, emoji: '🔧', castAbility: true, traits: [
    { name: 'Gnomish Cunning', rule: 'saving-throws', text: 'Advantage on Intelligence, Wisdom and Charisma saving throws.' },
    { name: 'Gnomish Lineage', rule: 'species', text: 'Forest Gnome or Rock Gnome: a touch of innate magic.' },
    { name: 'Darkvision', text: 'See in the dark out to 60 feet.' },
  ], lineages: {
    forest: { name: 'Forest Gnome', cantrip: 'minor-illusion', always: 'speak-with-animals', text: 'Minor Illusion, and Speak with Animals always prepared (free casts equal to your Proficiency Bonus per Long Rest).' },
    rock: { name: 'Rock Gnome', cantrip: 'mending', cantrip2: 'prestidigitation', text: 'Mending and Prestidigitation (and you can build tiny clockwork toys).' },
  } },
  goliath: { name: 'Goliath', speed: 35, emoji: '🗿', traits: [
    { name: 'Giant Ancestry', rule: 'giant-ancestry', text: 'A boon from your giant ancestors, usable a number of times equal to your Proficiency Bonus per Long Rest.' },
    { name: 'Powerful Build', text: 'Advantage on checks to end the Grappled condition; you count as one size larger for carrying.' },
    { name: 'Speed', rule: 'speed', text: 'Your Speed is 35 feet.' },
  ], lineages: {
    cloud: { name: "Cloud's Jaunt", text: 'Bonus Action: teleport up to 30 feet to an unoccupied space you can see.' },
    fire: { name: "Fire's Burn", text: 'When you hit with an attack roll and deal damage, deal an extra 1d10 Fire damage (here: used automatically, once per turn).' },
    frost: { name: "Frost's Chill", text: 'When you hit with an attack roll and deal damage, deal an extra 1d6 Cold damage and reduce the target\'s Speed by 10 feet until the start of your next turn (used automatically, once per turn).' },
    hill: { name: "Hill's Tumble", text: 'When you hit a Large or smaller creature with an attack roll and deal damage, it falls Prone (used automatically, once per turn).' },
    stone: { name: "Stone's Endurance", text: 'Reaction when you take damage: roll 1d12 + your Constitution modifier and reduce the damage by that much (used automatically on a big hit).' },
    storm: { name: "Storm's Thunder", text: 'Reaction when a creature within 60 feet damages you: it takes 1d8 Thunder damage (used automatically).' },
  } },
  halfling: { name: 'Halfling', speed: 30, emoji: '🍀', traits: [
    { name: 'Luck', rule: 'luck', text: 'When you roll a 1 on the d20 of a D20 Test, you reroll it and must use the new roll.' },
    { name: 'Brave', text: 'Advantage on saves to avoid or end the Frightened condition.' },
    { name: 'Halfling Nimbleness', text: "You can move through the space of any creature that's a size larger than you." },
    { name: 'Naturally Stealthy', text: 'You can Hide behind a creature larger than you.' },
  ] },
  orc: { name: 'Orc', speed: 30, emoji: '💪', traits: [
    { name: 'Adrenaline Rush', rule: 'adrenaline-rush', text: 'Dash as a Bonus Action and gain Temporary Hit Points equal to your Proficiency Bonus. Uses equal to your Proficiency Bonus per Short or Long Rest.' },
    { name: 'Relentless Endurance', rule: 'relentless-endurance', text: "When you drop to 0 Hit Points but aren't killed outright, you drop to 1 instead. Once per Long Rest." },
    { name: 'Darkvision', text: 'See in the dark out to 120 feet.' },
  ] },
  tiefling: { name: 'Tiefling', speed: 30, emoji: '😈', castAbility: true, traits: [
    { name: 'Fiendish Legacy', rule: 'species', text: 'Abyssal, Chthonic or Infernal: a resistance and a cantrip now, a spell at level 3.' },
    { name: 'Otherworldly Presence', text: 'You know the Thaumaturgy cantrip.' },
    { name: 'Darkvision', text: 'See in the dark out to 60 feet.' },
  ], lineages: {
    abyssal: { name: 'Abyssal', resist: 'Poison', cantrip: 'poison-spray', spell3: 'ray-of-sickness', text: 'Resistance to Poison damage. Poison Spray; Ray of Sickness at level 3.' },
    chthonic: { name: 'Chthonic', resist: 'Necrotic', cantrip: 'chill-touch', spell3: 'false-life', text: 'Resistance to Necrotic damage. Chill Touch; False Life at level 3.' },
    infernal: { name: 'Infernal', resist: 'Fire', cantrip: 'fire-bolt', spell3: 'hellish-rebuke', text: 'Resistance to Fire damage. Fire Bolt; Hellish Rebuke at level 3.' },
  } },
  dragonborn: { name: 'Dragonborn', speed: 30, emoji: '🐉', traits: [
    { name: 'Breath Weapon', rule: 'breath-weapon', text: 'Replace one attack of your Attack action with a 15-foot Cone or a 30-foot Line (5 feet wide) of breath: Dexterity save (DC 8 + CON + PB), 1d10 damage, half on a success. Uses equal to your Proficiency Bonus per Long Rest.' },
    { name: 'Draconic Ancestry', text: 'Your dragon ancestor sets your breath and resistance damage type.' },
    { name: 'Damage Resistance', text: 'Resistance to the damage type of your ancestry.' },
    { name: 'Darkvision', text: 'See in the dark out to 60 feet.' },
  ] },
};
export const DEFAULT_LINEAGE = { elf: 'wood', gnome: 'rock', goliath: 'fire', tiefling: 'infernal' };

// --------------------------------------------------------- backgrounds ----
export const BACKGROUNDS = {
  acolyte: { name: 'Acolyte', abilities: ['int', 'wis', 'cha'], feat: 'magic-initiate', featList: 'cleric', skills: ['insight', 'religion'],
    blurb: 'You served in a temple.' },
  criminal: { name: 'Criminal', abilities: ['dex', 'con', 'int'], feat: 'alert', skills: ['sleightOfHand', 'stealth'],
    blurb: 'You made a living outside the law.' },
  sage: { name: 'Sage', abilities: ['con', 'int', 'wis'], feat: 'magic-initiate', featList: 'wizard', skills: ['arcana', 'history'],
    blurb: 'You spent years studying in libraries.' },
  soldier: { name: 'Soldier', abilities: ['str', 'dex', 'con'], feat: 'savage-attacker', skills: ['athletics', 'intimidation'],
    blurb: 'You trained for war.' },
};

// The SRD's Origin feats. Magic Initiate: pick a spell list, two of its
// cantrips, one level 1 spell (always prepared; one free cast per Long
// Rest, or with a slot) and the spellcasting ability. A background's Magic
// Initiate comes with its list. Skilled: three skills.
export const FEATS = {
  'alert': { name: 'Alert', rule: 'alert', text: 'Add your Proficiency Bonus to your Initiative rolls.' },
  'magic-initiate': { name: 'Magic Initiate', rule: 'magic-initiate', text: 'Two cantrips and one level 1 spell from the Cleric or Wizard list. Cast the level 1 spell once per Long Rest without a spell slot, or with your slots. Pick Intelligence, Wisdom or Charisma to cast them.',
    lists: ['cleric', 'wizard'], repeatable: 'list' },
  'savage-attacker': { name: 'Savage Attacker', rule: 'savage-attacker', text: 'Once per turn when you hit with a weapon, roll its damage dice twice and use either roll.' },
  'skilled': { name: 'Skilled', rule: 'skilled', text: 'Proficiency in any three skills.', repeatable: true },
};
export const ORIGIN_FEATS = ['alert', 'magic-initiate', 'savage-attacker', 'skilled'];
export const MI_DEFAULT_ABILITY = { cleric: 'wis', wizard: 'int' };

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
