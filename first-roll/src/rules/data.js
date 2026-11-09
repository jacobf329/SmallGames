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
  greataxe: { name: 'Greataxe', kind: 'melee', dice: '1d12', type: 'Slashing', props: ['Heavy', 'Two-Handed'], heavy: true, twoHanded: true, mastery: 'cleave', martial: true },
  handaxe: { name: 'Handaxe', kind: 'melee', dice: '1d6', type: 'Slashing', props: ['Light', 'Thrown (20/60)'], light: true, thrown: [20, 60], mastery: 'vex' },
  spear: { name: 'Spear', kind: 'melee', dice: '1d6', type: 'Piercing', props: ['Thrown (20/60)', 'Versatile (1d8)'], thrown: [20, 60], versatile: '1d8', mastery: 'sap' },
  sickle: { name: 'Sickle', kind: 'melee', dice: '1d4', type: 'Slashing', props: ['Light'], light: true, mastery: 'nick' },
};
// A Monk's weapons: Simple Melee weapons, and Martial Melee weapons with the Light property.
export const isMonkWeapon = (wid) => WEAPONS[wid]?.kind === 'melee' && (!WEAPONS[wid].martial || !!WEAPONS[wid].light);
// What a Warlock's Pact of the Blade can conjure (any Simple or Martial Melee weapon here).
export const PACT_WEAPONS = ['longsword', 'greatsword', 'flail', 'scimitar', 'shortsword', 'greataxe', 'mace', 'quarterstaff', 'spear'];

export const MASTERIES = {
  sap: { name: 'Sap', rule: 'mastery-sap', text: 'On a hit, the target has Disadvantage on its next attack roll before the start of your next turn.' },
  vex: { name: 'Vex', rule: 'mastery-vex', text: 'On a hit, you have Advantage on your next attack roll against that creature before the end of your next turn.' },
  nick: { name: 'Nick', rule: 'mastery-nick', text: "The Light property's extra attack can be made as part of the Attack action instead of as a Bonus Action, once per turn." },
  graze: { name: 'Graze', rule: 'mastery-graze', text: 'On a miss, the target still takes damage equal to the ability modifier you used for the attack roll.' },
  slow: { name: 'Slow', rule: 'mastery-slow', text: "On a hit that deals damage, the target's Speed drops by 10 feet until the start of your next turn." },
  topple: { name: 'Topple', rule: 'mastery-topple', text: 'On a hit, the target makes a Constitution save (DC 8 + the ability modifier you attacked with + your Proficiency Bonus) or falls Prone.' },
  cleave: { name: 'Cleave', rule: 'mastery-cleave', text: "Once per turn, when you hit a creature with a melee attack, you can attack a second creature within 5 feet of the first and within your reach. On a hit it takes the weapon's damage, without your ability modifier. (Used for you automatically.)" },
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
  'blessed-warrior': { name: 'Blessed Warrior', rule: 'blessed-warrior', only: ['paladin'], list: 'cleric', ability: 'cha', text: 'You learn two Cleric cantrips. Charisma is your spellcasting ability for them.' },
  'druidic-warrior': { name: 'Druidic Warrior', rule: 'druidic-warrior', only: ['ranger'], list: 'druid', ability: 'wis', text: 'You learn two Druid cantrips. Wisdom is your spellcasting ability for them.' },
};
// Which classes get a Fighting Style, and at what level.
export const STYLE_LEVEL = { fighter: 1, paladin: 2, ranger: 2 };
export const stylesFor = (cls) => Object.keys(FIGHTING_STYLES).filter((k) => !FIGHTING_STYLES[k].only || FIGHTING_STYLES[k].only.includes(cls));

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
  barbarian: {
    a: { name: 'Option A', armor: 'none', shield: false, weapons: ['greataxe', 'handaxe'], twins: ['handaxe'], gold: 15,
      text: "Greataxe, 4 Handaxes, Explorer's Pack and 15 GP." },
  },
  bard: {
    a: { name: 'Option A', armor: 'leather', shield: false, weapons: ['dagger'], twins: ['dagger'], gold: 19,
      text: "Leather Armor, 2 Daggers, a Musical Instrument, Entertainer's Pack and 19 GP." },
  },
  druid: {
    a: { name: 'Option A', armor: 'leather', shield: true, weapons: ['sickle', 'quarterstaff'], gold: 9,
      text: "Leather Armor, Shield, Sickle, Druidic Focus (Quarterstaff), Explorer's Pack, Herbalism Kit and 9 GP." },
  },
  monk: {
    a: { name: 'Option A', armor: 'none', shield: false, weapons: ['spear', 'dagger'], twins: ['dagger'], gold: 11,
      text: "Spear, 5 Daggers, a set of Artisan's Tools or a Musical Instrument, Explorer's Pack and 11 GP." },
  },
  paladin: {
    a: { name: 'Option A', armor: 'chain', shield: true, weapons: ['longsword', 'javelin'], gold: 9,
      text: "Chain Mail, Shield, Longsword, 6 Javelins, Holy Symbol, Priest's Pack and 9 GP." },
  },
  ranger: {
    a: { name: 'Option A', armor: 'studded', shield: false, weapons: ['scimitar', 'shortsword', 'longbow'], gold: 7,
      text: "Studded Leather Armor, Scimitar, Shortsword, Longbow, 20 Arrows, Quiver, Druidic Focus (sprig of mistletoe), Explorer's Pack and 7 GP." },
  },
  sorcerer: {
    a: { name: 'Option A', armor: 'none', shield: false, weapons: ['spear', 'dagger'], twins: ['dagger'], gold: 28,
      text: "Spear, 2 Daggers, Arcane Focus (crystal), Dungeoneer's Pack and 28 GP." },
  },
  warlock: {
    a: { name: 'Option A', armor: 'leather', shield: false, weapons: ['sickle', 'dagger'], twins: ['dagger'], gold: 15,
      text: "Leather Armor, Sickle, 2 Daggers, Arcane Focus (orb), Book (occult lore), Scholar's Pack and 15 GP." },
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
//   battle use), mark (Hex, Hunter's Mark: extra damage on your hits),
//   smite (Divine Smite, asked after a melee hit), selfbuff (an effect on
//   yourself), bane (creatures save or take -1d4).
// An area spell with cond puts that condition on whoever fails (escape: the
// check a creature can make as an action to break free). pickType: you pick
// the damage type from types (the game picks the one that hurts most).
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
  'eldritch-blast': { name: 'Eldritch Blast', level: 0, time: 'action', range: 120, kind: 'attack', dice: '1d10', type: 'Force',
    text: 'A beam of crackling energy: make a ranged spell attack. On a hit, 1d10 Force damage. More beams at higher levels: two at level 5, three at 11, four at 17, each with its own attack roll, at one target or several.' },
  'vicious-mockery': { name: 'Vicious Mockery', level: 0, time: 'action', range: 60, kind: 'save', save: 'wis', dice: '1d6', type: 'Psychic', rider: 'mocked',
    text: 'Insults laced with magic: a creature you can see within 60 feet makes a Wisdom save. On a failure, 1d6 Psychic damage and Disadvantage on its next attack roll before the end of its next turn.' },
  'produce-flame': { name: 'Produce Flame', level: 0, time: 'action', range: 60, kind: 'attack', dice: '1d8', type: 'Fire',
    text: 'A flame appears in your hand (a Bonus Action), and you hurl it as a Magic action: ranged spell attack, 1d8 Fire damage on a hit. Here, conjuring and hurling it are one action.' },
  'thorn-whip': { name: 'Thorn Whip', level: 0, time: 'action', range: 30, reach: 30, melee: true, kind: 'attack', dice: '1d6', type: 'Piercing', rider: 'pull',
    text: 'A vine whip: make a melee spell attack against a creature within 30 feet. On a hit, 1d6 Piercing damage, and if it is Large or smaller you pull it up to 10 feet straight toward you.' },
  'starry-wisp': { name: 'Starry Wisp', level: 0, time: 'action', range: 60, kind: 'attack', dice: '1d8', type: 'Radiant', rider: 'wisp',
    text: "A mote of light: ranged spell attack. On a hit, 1d8 Radiant damage, and until the end of your next turn the target sheds light and can't benefit from being Invisible (here: it can't stay Hidden)." },
  'sorcerous-burst': { name: 'Sorcerous Burst', level: 0, time: 'action', range: 120, kind: 'attack', dice: '1d8', pickType: true, types: ['Acid', 'Cold', 'Fire', 'Lightning', 'Poison', 'Psychic', 'Thunder'], explode: true,
    text: 'Sorcerous energy of a type you pick (Acid, Cold, Fire, Lightning, Poison, Psychic or Thunder): ranged spell attack, 1d8 damage on a hit. Each 8 you roll adds another d8, up to your spellcasting modifier in extra dice.' },
  'acid-splash': { name: 'Acid Splash', level: 0, time: 'action', range: 60, kind: 'area', area: { shape: 'sphere', size: 5, from: 'point' }, save: 'dex', dice: '1d6', type: 'Acid',
    text: 'An acid bubble bursts in a 5-foot Sphere at a point within 60 feet. Each creature in it makes a Dexterity save or takes 1d6 Acid damage.' },
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
  'hex': { name: 'Hex', level: 1, time: 'bonus', range: 90, kind: 'mark', mark: 'hex', dice: '1d6', type: 'Necrotic', conc: true,
    text: "Concentration, up to 1 hour. A Bonus Action: curse a creature within 90 feet. Your attacks that hit it deal an extra 1d6 Necrotic damage, and it has Disadvantage on checks with one ability you pick. If it drops to 0 HP, a Bonus Action on a later turn moves the curse to another creature." },
  'hunters-mark': { name: "Hunter's Mark", level: 1, time: 'bonus', range: 90, kind: 'mark', mark: 'hunters-mark', dice: '1d6', type: 'Force', conc: true,
    text: "Concentration, up to 1 hour. A Bonus Action: mark a creature within 90 feet as your quarry. Your attacks that hit it deal an extra 1d6 Force damage, and you have Advantage on checks to find it. If it drops to 0 HP, a Bonus Action on a later turn moves the mark." },
  'divine-smite': { name: 'Divine Smite', level: 1, time: 'bonus', kind: 'smite', dice: '2d8', type: 'Radiant', up: { dice: '1d8' },
    text: 'A Bonus Action right after you hit with a melee weapon or an Unarmed Strike: the target takes an extra 2d8 Radiant damage, +1d8 if it is a Fiend or Undead. Higher slot: +1d8 per level. (You are asked after a hit.)' },
  'divine-favor': { name: 'Divine Favor', level: 1, time: 'bonus', kind: 'selfbuff', buff: 'favor',
    text: 'A Bonus Action. For 1 minute, your weapon attacks deal an extra 1d4 Radiant damage on a hit.' },
  'heroism': { name: 'Heroism', level: 1, time: 'action', range: 5, touch: true, kind: 'buff', buff: 'heroism', targets: 1, conc: true, up: { targets: 1 },
    text: "Concentration, up to 1 minute. A willing creature you touch is immune to the Frightened condition and gains Temporary Hit Points equal to your spellcasting modifier at the start of each of its turns. Higher slot: one more creature per level." },
  'bane': { name: 'Bane', level: 1, time: 'action', range: 30, kind: 'bane', save: 'cha', targets: 3, conc: true, up: { targets: 1 },
    text: 'Concentration, up to 1 minute. Up to three creatures within 30 feet make a Charisma save. Each that fails subtracts 1d4 from its attack rolls and saving throws. Higher slot: one more creature per level.' },
  'dissonant-whispers': { name: 'Dissonant Whispers', level: 1, time: 'action', range: 60, kind: 'save', save: 'wis', dice: '3d6', type: 'Psychic', half: true, rider: 'flee', up: { dice: '1d6' },
    text: 'A creature you can see within 60 feet makes a Wisdom save. On a failure, 3d6 Psychic damage, and it must use its Reaction, if it can, to move as far as its Speed allows away from you. On a success, half damage only. Higher slot: +1d6 per level.' },
  'entangle': { name: 'Entangle', level: 1, time: 'action', range: 90, kind: 'area', area: { shape: 'cube', size: 20, from: 'point' }, save: 'str', cond: 'restrained', escape: 'str', conc: true,
    text: 'Concentration, up to 1 minute. Grasping plants fill a 20-foot square within 90 feet. Each creature in it makes a Strength save or is Restrained until the spell ends. A Restrained creature can take an action to make a Strength (Athletics) check against your spell save DC to break free. Careful: allies in the square can be caught too.' },
  'sleep': { name: 'Sleep', level: 1, time: 'action', range: 60, kind: 'area', area: { shape: 'sphere', size: 5, from: 'point' }, save: 'wis', cond: 'sleep', choose: true, conc: true,
    text: "Concentration, up to 1 minute. Pick creatures in a 5-foot Sphere within 60 feet (here: every enemy in it). Each makes a Wisdom save or is Incapacitated until the end of its next turn; then it saves again, and on a second failure it is Unconscious until the spell ends, it takes damage, or someone shakes it awake. Creatures that don't sleep (elves, and anything immune to Exhaustion) succeed automatically." },
  'chromatic-orb': { name: 'Chromatic Orb', level: 1, time: 'action', range: 90, kind: 'attack', dice: '3d8', pickType: true, types: ['Acid', 'Cold', 'Fire', 'Lightning', 'Poison', 'Thunder'], up: { dice: '1d8' },
    text: 'An orb of energy of a type you pick (Acid, Cold, Fire, Lightning, Poison or Thunder): ranged spell attack, 3d8 damage on a hit. (In the full rules, rolling a pair can make it leap to a second target; not used here yet.) Higher slot: +1d8 per level.' },
  'protection-from-evil-and-good': { name: 'Protection from Evil and Good', level: 1, time: 'action', range: 5, touch: true, kind: 'buff', buff: 'pfe', targets: 1, conc: true,
    text: "Concentration, up to 10 minutes. A willing creature you touch is warded against Aberrations, Celestials, Elementals, Fey, Fiends and Undead: they have Disadvantage on attack rolls against it, and can't Charm, Frighten or possess it. (Goblins and Bugbears are Fey.)" },
  'fog-cloud': { name: 'Fog Cloud', level: 1, time: 'action', range: 120, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. A 20-foot Sphere of thick fog that hides everything inside it. (Not used in fights here yet.)' },
  'charm-person': { name: 'Charm Person', level: 1, time: 'action', range: 30, kind: 'utility',
    text: 'A Humanoid makes a Wisdom save (with Advantage if you are fighting it) or is Charmed by you for 1 hour, treating you as a friendly acquaintance. (Useful outside of fights.)' },
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
  'shatter': { name: 'Shatter', level: 2, time: 'action', range: 60, kind: 'area', area: { shape: 'sphere', size: 10, from: 'point' }, save: 'con', dice: '3d8', type: 'Thunder', half: true, up: { dice: '1d8' },
    text: 'A ringing blast in a 10-foot Sphere at a point within 60 feet. Each creature in it makes a Constitution save: 3d8 Thunder damage on a failure, half as much on a success. Careful: allies in it are hit too. Higher slot: +1d8 per level.' },
  'barkskin': { name: 'Barkskin', level: 2, time: 'bonus', range: 5, touch: true, kind: 'buff', buff: 'bark', targets: 1, up: { targets: 1 },
    text: "A Bonus Action. For 1 hour, a willing creature you touch has bark-hard skin: its Armor Class can't be lower than 17. No Concentration. Higher slot: one more creature per level." },
  'blur': { name: 'Blur', level: 2, time: 'action', kind: 'selfbuff', buff: 'blur', conc: true,
    text: 'Concentration, up to 1 minute. Your body blurs: attack rolls against you have Disadvantage.' },
  'web': { name: 'Web', level: 2, time: 'action', range: 60, kind: 'area', area: { shape: 'cube', size: 20, from: 'point' }, save: 'dex', cond: 'restrained', escape: 'str', conc: true,
    text: 'Concentration, up to 1 hour. Sticky webbing fills a 20-foot Cube within 60 feet. Each creature in it makes a Dexterity save or is Restrained while in the web. A Restrained creature can take an action to make a Strength (Athletics) check against your spell save DC to break free.' },
  'dragons-breath': { name: "Dragon's Breath", level: 2, time: 'bonus', range: 5, touch: true, kind: 'buff', buff: 'dbreath', targets: 1, conc: true, dice: '3d6', types: ['Acid', 'Cold', 'Fire', 'Lightning', 'Poison'], up: { dice: '1d6' },
    text: 'Concentration, up to 1 minute. A Bonus Action: a willing creature you touch can take a Magic action to exhale a 15-foot Cone of Acid, Cold, Fire, Lightning or Poison (picked when you cast). Each creature in it makes a Dexterity save against your spell save DC: 3d6 damage, half on a success. Higher slot: +1d6 per level.' },
  'alter-self': { name: 'Alter Self', level: 2, time: 'action', kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. Change your appearance, breathe underwater, or grow natural weapons. (Useful outside of fights here.)' },
  'suggestion': { name: 'Suggestion', level: 2, time: 'action', range: 30, kind: 'utility', conc: true,
    text: 'Concentration, up to 8 hours. Suggest a reasonable course of action to a creature that can hear you; it makes a Wisdom save or follows it. (Useful outside of fights.)' },
};

// Each class's spell list (the spells of the SRD this game has).
export const SPELL_LISTS = {
  cleric: {
    0: ['sacred-flame', 'spare-the-dying', 'guidance', 'resistance-cantrip', 'thaumaturgy', 'light', 'mending'],
    1: ['bless', 'command', 'cure-wounds', 'detect-magic', 'guiding-bolt', 'healing-word', 'inflict-wounds', 'shield-of-faith', 'bane', 'protection-from-evil-and-good'],
    2: ['aid', 'hold-person', 'lesser-restoration', 'spiritual-weapon'],
  },
  wizard: {
    0: ['fire-bolt', 'ray-of-frost', 'chill-touch', 'shocking-grasp', 'poison-spray', 'acid-splash', 'mage-hand', 'light', 'mending', 'dancing-lights', 'minor-illusion', 'prestidigitation'],
    1: ['magic-missile', 'burning-hands', 'shield', 'thunderwave', 'mage-armor', 'false-life', 'ray-of-sickness', 'chromatic-orb', 'sleep', 'fog-cloud', 'charm-person', 'detect-magic', 'comprehend-languages', 'feather-fall', 'identify', 'alarm', 'unseen-servant', 'find-familiar'],
    2: ['scorching-ray', 'misty-step', 'hold-person', 'shatter', 'web', 'blur', 'dragons-breath', 'alter-self', 'suggestion'],
  },
  bard: {
    0: ['vicious-mockery', 'starry-wisp', 'dancing-lights', 'light', 'mage-hand', 'mending', 'minor-illusion', 'prestidigitation'],
    1: ['healing-word', 'dissonant-whispers', 'heroism', 'sleep', 'faerie-fire', 'bane', 'command', 'cure-wounds', 'thunderwave', 'charm-person', 'comprehend-languages', 'detect-magic', 'feather-fall', 'identify', 'longstrider', 'speak-with-animals', 'unseen-servant'],
    2: ['shatter', 'hold-person', 'aid', 'lesser-restoration', 'suggestion'],
  },
  druid: {
    0: ['produce-flame', 'thorn-whip', 'starry-wisp', 'poison-spray', 'guidance', 'spare-the-dying', 'resistance-cantrip', 'druidcraft', 'mending'],
    1: ['entangle', 'healing-word', 'cure-wounds', 'faerie-fire', 'thunderwave', 'longstrider', 'fog-cloud', 'detect-magic', 'speak-with-animals'],
    2: ['barkskin', 'hold-person', 'lesser-restoration'],
  },
  paladin: {
    1: ['divine-favor', 'bless', 'cure-wounds', 'heroism', 'shield-of-faith', 'command', 'protection-from-evil-and-good', 'divine-smite', 'detect-magic'],
  },
  ranger: {
    1: ['hunters-mark', 'cure-wounds', 'entangle', 'longstrider', 'fog-cloud', 'alarm', 'detect-magic', 'speak-with-animals'],
  },
  sorcerer: {
    0: ['fire-bolt', 'sorcerous-burst', 'ray-of-frost', 'shocking-grasp', 'chill-touch', 'acid-splash', 'poison-spray', 'dancing-lights', 'light', 'mage-hand', 'mending', 'minor-illusion', 'prestidigitation'],
    1: ['magic-missile', 'chromatic-orb', 'shield', 'burning-hands', 'sleep', 'thunderwave', 'false-life', 'ray-of-sickness', 'charm-person', 'comprehend-languages', 'detect-magic', 'feather-fall', 'fog-cloud'],
    2: ['scorching-ray', 'shatter', 'web', 'misty-step', 'hold-person', 'blur', 'dragons-breath', 'alter-self', 'suggestion'],
  },
  warlock: {
    0: ['eldritch-blast', 'chill-touch', 'poison-spray', 'mage-hand', 'minor-illusion', 'prestidigitation'],
    1: ['hex', 'hellish-rebuke', 'protection-from-evil-and-good', 'charm-person', 'comprehend-languages', 'unseen-servant'],
    2: ['misty-step', 'hold-person', 'shatter', 'suggestion'],
  },
};
// Cantrips known, and spells you can prepare, by class level (2024 tables).
// Paladins and Rangers know no cantrips unless a Fighting Style gives them.
// byLevel([a, b, ...]) -> { 1: a, 2: b, ... } (levels 1-20).
export const byLevel = (xs) => Object.fromEntries(xs.map((v, i) => [i + 1, v]));
// Cantrips known: base at level 1, one more at 4 and at 10.
const cantripsFrom = (n) => byLevel(Array.from({ length: 20 }, (_, i) => n + (i + 1 >= 4) + (i + 1 >= 10)));
export const CANTRIPS_KNOWN = {
  cleric: cantripsFrom(3), wizard: cantripsFrom(3), bard: cantripsFrom(2), druid: cantripsFrom(2),
  sorcerer: cantripsFrom(4), warlock: cantripsFrom(2),
};
const FULL_PREP = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22];
const HALF_PREP = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15];
export const PREPARED_BY_LEVEL = {
  cleric: byLevel(FULL_PREP), bard: byLevel(FULL_PREP), druid: byLevel(FULL_PREP),
  wizard: byLevel([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25]),
  paladin: byLevel(HALF_PREP), ranger: byLevel(HALF_PREP),
  sorcerer: byLevel([2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]),
  warlock: byLevel([2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]),
};
// A wizard's spellbook starts with 6 level 1 spells and gains 2 a level.
export const SPELLBOOK_SIZE = byLevel(Array.from({ length: 20 }, (_, i) => 6 + 2 * i));
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
    spellcasting: { ability: 'wis', prepares: 'list', change: 'any', slots: 'full' },
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
    spellcasting: { ability: 'int', prepares: 'book', change: 'any', slots: 'full' },
    blurb: 'Fragile but powerful. Attacks from a distance with spells.',
    plays: 'Stay back and cast Fire Bolt. Save your spell slots for Magic Missile or Burning Hands on a crowd.',
  },
  barbarian: {
    name: 'Barbarian', emoji: '🪓', hitDie: 12, primary: 'str', role: 'Front line',
    saves: ['str', 'con'],
    skillChoices: { n: 2, from: ['athletics', 'perception', 'survival', 'intimidation', 'animalHandling', 'nature'] },
    masteryCount: 2, kits: ['a'],
    defaults: { kit: 'a', masteries: ['greataxe', 'handaxe'], skills: ['athletics', 'perception', 'survival', 'intimidation', 'animalHandling', 'nature'] },
    suggested: { str: 15, con: 14, dex: 13, wis: 12, cha: 10, int: 8 },
    blurb: 'The most Hit Points of anyone, and a Rage that shrugs off blows.',
    plays: 'Rage on your first turn (a Bonus Action), then swing the Greataxe. While raging you take half damage from weapons.',
  },
  bard: {
    name: 'Bard', emoji: '🎻', hitDie: 8, primary: 'cha', role: 'Support',
    saves: ['dex', 'cha'],
    skillChoices: { n: 3, from: ['persuasion', 'performance', 'deception', 'insight', 'perception', 'history', 'acrobatics', 'arcana', 'athletics', 'animalHandling', 'intimidation', 'investigation', 'medicine', 'nature', 'religion', 'sleightOfHand', 'stealth', 'survival'] },
    masteryCount: 0, kits: ['a'],
    defaults: { kit: 'a', skills: ['persuasion', 'performance', 'insight', 'perception', 'deception', 'history', 'arcana', 'medicine'], expertise: ['persuasion', 'perception'],
      cantrips: ['vicious-mockery', 'starry-wisp', 'minor-illusion'],
      prepared: ['healing-word', 'dissonant-whispers', 'heroism', 'sleep', 'shatter', 'hold-person', 'faerie-fire', 'bane', 'cure-wounds', 'thunderwave'] },
    suggested: { cha: 15, dex: 14, con: 13, wis: 12, int: 10, str: 8 },
    spellcasting: { ability: 'cha', prepares: 'list', change: 'level', slots: 'full' },
    blurb: 'Magic in words and music. Lifts friends up and talks enemies down.',
    plays: 'Give a friend Bardic Inspiration (a Bonus Action), then Vicious Mockery or Healing Word whoever needs it.',
  },
  druid: {
    name: 'Druid', emoji: '🌳', hitDie: 8, primary: 'wis', role: 'Support',
    saves: ['int', 'wis'],
    skillChoices: { n: 2, from: ['nature', 'perception', 'medicine', 'survival', 'animalHandling', 'insight', 'arcana', 'religion'] },
    masteryCount: 0, kits: ['a'],
    defaults: { kit: 'a', order: 'magician', skills: ['nature', 'perception', 'medicine', 'survival'],
      cantrips: ['produce-flame', 'thorn-whip', 'starry-wisp', 'guidance'],
      prepared: ['entangle', 'healing-word', 'cure-wounds', 'faerie-fire', 'barkskin', 'thunderwave', 'hold-person', 'lesser-restoration', 'longstrider'] },
    suggested: { wis: 15, con: 14, dex: 13, int: 12, cha: 10, str: 8 },
    spellcasting: { ability: 'wis', prepares: 'list', change: 'any', slots: 'full' },
    blurb: 'Nature magic. Tangles foes in vines, heals, and later turns into a wolf.',
    plays: 'Entangle a group of enemies, then Produce Flame. From level 2, Wild Shape into a wolf as a Bonus Action.',
  },
  monk: {
    name: 'Monk', emoji: '👊', hitDie: 8, primary: 'dex', role: 'Striker',
    saves: ['str', 'dex'],
    skillChoices: { n: 2, from: ['acrobatics', 'stealth', 'insight', 'athletics', 'history', 'religion'] },
    masteryCount: 0, kits: ['a'],
    defaults: { kit: 'a', skills: ['acrobatics', 'stealth', 'insight', 'athletics'] },
    suggested: { dex: 15, wis: 14, con: 13, str: 12, int: 10, cha: 8 },
    blurb: 'Fast hands and feet. Strikes two or three times a turn without armor.',
    plays: 'Attack, then use your Bonus Action for an Unarmed Strike. From level 2, Flurry of Blows hits twice.',
  },
  paladin: {
    name: 'Paladin', emoji: '⚜️', hitDie: 10, primary: 'str', role: 'Front line',
    saves: ['wis', 'cha'],
    skillChoices: { n: 2, from: ['athletics', 'persuasion', 'insight', 'intimidation', 'medicine', 'religion'] },
    masteryCount: 2, kits: ['a'],
    defaults: { kit: 'a', style: 'defense', masteries: ['longsword', 'javelin'], skills: ['athletics', 'persuasion', 'insight', 'intimidation'],
      warriorCantrips: ['sacred-flame', 'guidance'],
      prepared: ['divine-favor', 'bless', 'cure-wounds', 'heroism', 'shield-of-faith', 'command'] },
    suggested: { str: 15, cha: 14, con: 13, wis: 12, dex: 10, int: 8 },
    spellcasting: { ability: 'cha', prepares: 'list', change: 'one', slots: 'half' },
    blurb: 'A holy knight in heavy armor. Heals with a touch and smites with radiant light.',
    plays: 'Walk up and hit. Lay on Hands (a Bonus Action) heals a friend; from level 2, Divine Smite after a hit.',
  },
  ranger: {
    name: 'Ranger', emoji: '🏹', hitDie: 10, primary: 'dex', role: 'Archer',
    saves: ['str', 'dex'],
    skillChoices: { n: 3, from: ['perception', 'stealth', 'survival', 'nature', 'athletics', 'insight', 'investigation', 'animalHandling'] },
    masteryCount: 2, kits: ['a'],
    defaults: { kit: 'a', style: 'archery', masteries: ['longbow', 'scimitar'], skills: ['perception', 'stealth', 'survival', 'nature', 'athletics', 'insight'], expertise: ['perception'],
      warriorCantrips: ['thorn-whip', 'guidance'], prey: 'colossus',
      prepared: ['cure-wounds', 'entangle', 'longstrider', 'fog-cloud'] },
    suggested: { dex: 15, wis: 14, con: 13, str: 12, int: 10, cha: 8 },
    spellcasting: { ability: 'wis', prepares: 'list', change: 'one', slots: 'half' },
    blurb: "A hunter with a longbow and a little nature magic. Marks a quarry and doesn't miss it.",
    plays: "Hunter's Mark the toughest enemy (a Bonus Action), then shoot it with the Longbow every turn.",
  },
  sorcerer: {
    name: 'Sorcerer', emoji: '🔥', hitDie: 6, primary: 'cha', role: 'Blaster',
    saves: ['con', 'cha'],
    skillChoices: { n: 2, from: ['arcana', 'persuasion', 'insight', 'deception', 'intimidation', 'religion'] },
    masteryCount: 0, kits: ['a'],
    defaults: { kit: 'a', skills: ['arcana', 'persuasion', 'insight', 'deception'], metamagic: ['quickened', 'twinned'],
      cantrips: ['fire-bolt', 'sorcerous-burst', 'ray-of-frost', 'shocking-grasp', 'acid-splash'],
      prepared: ['magic-missile', 'shield', 'chromatic-orb', 'burning-hands', 'scorching-ray', 'shatter', 'web', 'misty-step', 'sleep', 'hold-person'] },
    suggested: { cha: 15, con: 14, dex: 13, wis: 12, int: 10, str: 8 },
    spellcasting: { ability: 'cha', prepares: 'list', change: 'level', slots: 'full' },
    blurb: 'Magic in the blood. Fewer spells than a wizard, but bends them with Metamagic.',
    plays: 'Stay back and cast Fire Bolt or Sorcerous Burst. Innate Sorcery (a Bonus Action) makes your spells harder to avoid.',
  },
  warlock: {
    name: 'Warlock', emoji: '👁️', hitDie: 8, primary: 'cha', role: 'Blaster',
    saves: ['wis', 'cha'],
    skillChoices: { n: 2, from: ['deception', 'intimidation', 'arcana', 'investigation', 'history', 'nature', 'religion'] },
    masteryCount: 0, kits: ['a'],
    defaults: { kit: 'a', skills: ['deception', 'intimidation', 'arcana', 'investigation'], invocations: ['armor-of-shadows', 'agonizing-blast', 'repelling-blast'], pactWeapon: 'longsword',
      cantrips: ['eldritch-blast', 'chill-touch', 'mage-hand'],
      prepared: ['hex', 'hellish-rebuke', 'protection-from-evil-and-good', 'misty-step', 'hold-person', 'shatter', 'charm-person'] },
    suggested: { cha: 15, con: 14, dex: 13, wis: 12, int: 10, str: 8 },
    spellcasting: { ability: 'cha', prepares: 'list', change: 'level', slots: 'pact' },
    blurb: 'Power from a pact. Few spell slots that come back on a Short Rest, and Eldritch Blast.',
    plays: 'Hex the toughest enemy (a Bonus Action), then Eldritch Blast it every turn.',
  },
};

// Spell slots by class level. Full casters (Bard, Cleric, Druid, Sorcerer,
// Wizard), half casters (Paladin, Ranger) and a Warlock's Pact Magic, whose
// slots are all of one level and come back on a Short Rest.
// Written as one row per class level: the number of slots of spell level 1, 2, 3...
const slotRows = (rows) => byLevel(rows.map((r) => Object.fromEntries(r.map((n, i) => [i + 1, n]).filter(([, n]) => n))));
export const SLOTS_BY_LEVEL = slotRows([
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
]);
// Pact Magic: every slot is of the same level.
const pactRow = ([n, lv]) => ({ [lv]: n });
export const SLOT_TABLES = {
  full: SLOTS_BY_LEVEL,
  half: slotRows([
    [2], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
    [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2],
  ]),
  pact: byLevel([[1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
    [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]].map(pactRow)),
};
// Subclasses (one per class in the SRD), chosen at level 3.
export const SUBCLASSES = {
  fighter: 'Champion', rogue: 'Thief', cleric: 'Life Domain', wizard: 'Evoker',
  barbarian: 'Path of the Berserker', bard: 'College of Lore', druid: 'Circle of the Land', monk: 'Warrior of the Open Hand',
  paladin: 'Oath of Devotion', ranger: 'Hunter', sorcerer: 'Draconic Sorcery', warlock: 'Fiend Patron',
};
// Spells a subclass or class feature always has prepared (they don't count).
export const ALWAYS_PREPARED = {
  paladin: { 2: ['divine-smite'], 3: ['protection-from-evil-and-good', 'shield-of-faith'] },
  ranger: { 1: ['hunters-mark'] },
  sorcerer: { 3: ['alter-self', 'chromatic-orb', 'command', 'dragons-breath'] },
  warlock: { 3: ['burning-hands', 'command', 'scorching-ray', 'suggestion'] },
};
// Circle of the Land: pick a land at level 3; its spells are always prepared.
export const LAND_SPELLS = {
  arid: { name: 'Arid Land', spells: ['blur', 'burning-hands', 'fire-bolt'] },
  polar: { name: 'Polar Land', spells: ['fog-cloud', 'hold-person', 'ray-of-frost'] },
  temperate: { name: 'Temperate Land', spells: ['misty-step', 'shocking-grasp', 'sleep'] },
  tropical: { name: 'Tropical Land', spells: ['acid-splash', 'ray-of-sickness', 'web'] },
};
// A Druid's Primal Order and a Hunter's Prey.
export const DRUID_ORDERS = {
  magician: { name: 'Magician', text: 'One extra Druid cantrip, and add your Wisdom modifier (at least +1) to Intelligence (Arcana and Nature) checks.' },
  warden: { name: 'Warden', text: 'Training with Martial weapons and Medium armor.' },
};
export const HUNTER_PREY = {
  colossus: { name: 'Colossus Slayer', rule: 'colossus-slayer', text: "Once per turn, when you hit a creature that is missing any of its Hit Points with a weapon, it takes an extra 1d8 damage." },
  horde: { name: 'Horde Breaker', rule: 'horde-breaker', text: "Once on each of your turns, when you attack with a weapon, you can make another attack with it against a different creature within 5 feet of the first that you haven't attacked this turn. (Used for you automatically.)" },
};
// A Warlock's Eldritch Invocations. min: Warlock level needed.
export const INVOCATIONS = {
  'armor-of-shadows': { name: 'Armor of Shadows', min: 1, text: 'Cast Mage Armor on yourself at will, without a spell slot. Here: you go without armor, and your base Armor Class is 13 + your Dexterity modifier.' },
  'eldritch-mind': { name: 'Eldritch Mind', min: 1, text: 'Advantage on Constitution saving throws to keep Concentration.' },
  'pact-of-the-blade': { name: 'Pact of the Blade', min: 1, text: 'A pact weapon in your hand (here: from the start of each fight). You are proficient with it, and use Charisma for its attack and damage rolls if that is better.' },
  'pact-of-the-chain': { name: 'Pact of the Chain', min: 1, text: 'You learn Find Familiar and can cast it without a spell slot. (Useful outside of fights here.)' },
  'agonizing-blast': { name: 'Agonizing Blast', min: 2, text: 'Add your Charisma modifier to the damage of Eldritch Blast.' },
  'repelling-blast': { name: 'Repelling Blast', min: 2, text: 'When Eldritch Blast hits a Large or smaller creature, you push it up to 10 feet straight away from you. (Used for you automatically.)' },
  'eldritch-spear': { name: 'Eldritch Spear', min: 2, text: "Eldritch Blast's range goes up by 30 feet times your Warlock level." },
  'fiendish-vigor': { name: 'Fiendish Vigor', min: 2, text: "Cast False Life on yourself at will without a spell slot, and don't roll: you get the most it gives (12 Temporary Hit Points)." },
  'devils-sight': { name: "Devil's Sight", min: 2, text: 'See normally in darkness, magical or not, within 120 feet. (Every fight here is lit.)' },
  'mask-of-many-faces': { name: 'Mask of Many Faces', min: 2, text: 'Cast Disguise Self at will without a spell slot. (Useful outside of fights.)' },
  'misty-visions': { name: 'Misty Visions', min: 2, text: 'Cast Silent Image at will without a spell slot. (Useful outside of fights.)' },
  'thirsting-blade': { name: 'Thirsting Blade', min: 5, needs: 'pact-of-the-blade', text: 'Extra Attack with your pact weapon: you attack twice with it, instead of once, whenever you take the Attack action on your turn.' },
};
export const INVOCATIONS_KNOWN = byLevel([1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10]);
// A Sorcerer's Metamagic (two at level 2). cost: Sorcery Points.
export const METAMAGIC = {
  careful: { name: 'Careful Spell', cost: 1, text: 'When your spell makes creatures save, up to your Charisma modifier (at least 1) of your allies in it succeed automatically and take no damage on a success.' },
  distant: { name: 'Distant Spell', cost: 1, text: 'Double the range of a spell with a range of 5 feet or more, or give a touch spell a range of 30 feet.' },
  empowered: { name: 'Empowered Spell', cost: 1, text: 'Reroll up to your Charisma modifier (at least 1) of the damage dice and use the new rolls. (Here: the lowest dice.)' },
  extended: { name: 'Extended Spell', cost: 1, text: "Double a spell's duration, and you have Advantage on saves to keep Concentration on it." },
  heightened: { name: 'Heightened Spell', cost: 2, text: 'One creature has Disadvantage on its saves against the spell.' },
  quickened: { name: 'Quickened Spell', cost: 2, text: "Cast a spell that takes an action as a Bonus Action instead. Not if you've already cast a level 1+ spell this turn, and no other level 1+ spell this turn after it." },
  seeking: { name: 'Seeking Spell', cost: 1, text: 'When your spell attack misses, reroll the d20 and use the new roll. (Used for you automatically when it could hit.)' },
  subtle: { name: 'Subtle Spell', cost: 1, text: 'Cast without words, gestures or materials. (Useful outside of fights.)' },
  transmuted: { name: 'Transmuted Spell', cost: 1, text: 'Change a spell\'s Acid, Cold, Fire, Lightning, Poison or Thunder damage to another of those types. (Here: the one it is weakest to.)' },
  twinned: { name: 'Twinned Spell', cost: 1, text: 'A spell that can target one more creature when cast with a higher slot targets one more creature, as if cast one level higher.' },
};
// Font of Magic: Sorcery Points it costs to make a spell slot of each level.
export const SLOT_COST = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };
// Font of Magic can make a slot of a level up to this, by Sorcerer level.
export const SLOT_MIN_LEVEL = { 1: 2, 2: 3, 3: 5, 4: 7, 5: 9 };
// The highest level the campaign reaches so far (the tables above run to 20).
export const MAX_LEVEL = 5;
// Class tables (SRD 5.2.1): a value that changes at set levels.
const stepAt = (lv, steps) => { let v = steps[0][1]; for (const [l, x] of steps) if (lv >= l) v = x; return v; };
export const PROGRESSION = {
  rages: (lv) => stepAt(lv, [[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]]),
  rageDamage: (lv) => stepAt(lv, [[1, 2], [9, 3], [16, 4]]),
  martialDie: (lv) => stepAt(lv, [[1, 6], [5, 8], [11, 10], [17, 12]]),
  unarmoredMovement: (lv) => stepAt(lv, [[1, 0], [2, 10], [6, 15], [10, 20], [14, 25], [18, 30]]),
  sneakDice: (lv) => Math.ceil(lv / 2),
  secondWind: (lv) => stepAt(lv, [[1, 2], [4, 3], [10, 4]]),
  bardicDie: (lv) => stepAt(lv, [[1, 6], [5, 8], [10, 10], [15, 12]]),
  channelCleric: (lv) => stepAt(lv, [[1, 0], [2, 2], [6, 3], [18, 4]]),
  channelPaladin: (lv) => stepAt(lv, [[1, 0], [3, 2], [11, 3]]),
  wildShape: (lv) => stepAt(lv, [[1, 0], [2, 2], [6, 3], [17, 4]]),
  favoredEnemy: (lv) => stepAt(lv, [[1, 2], [5, 3], [9, 4], [13, 5], [17, 6]]),
};
// Kinds of weapons a class can use the mastery property of.
export const masteryCount = (cls, lv) => cls === 'fighter' ? stepAt(lv, [[1, 3], [4, 4], [10, 5], [16, 6]])
  : cls === 'barbarian' ? stepAt(lv, [[1, 2], [4, 3], [10, 4]]) : CLASSES[cls].masteryCount || 0;
// Attacks per Attack action: Extra Attack at 5 (Fighters: 3 at 11, 4 at 20).
export const attacksPerAction = (cls, lv) => cls === 'fighter' ? stepAt(lv, [[1, 1], [5, 2], [11, 3], [20, 4]])
  : ['barbarian', 'monk', 'paladin', 'ranger'].includes(cls) && lv >= 5 ? 2 : 1;
// Cantrip Upgrade: damage cantrips roll one more die at character levels 5, 11 and 17
// (Eldritch Blast gets one more beam instead).
export const cantripTier = (lv) => 1 + (lv >= 5) + (lv >= 11) + (lv >= 17);
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
  'magic-initiate': { name: 'Magic Initiate', rule: 'magic-initiate', text: 'Two cantrips and one level 1 spell from the Cleric, Druid or Wizard list. Cast the level 1 spell once per Long Rest without a spell slot, or with your slots. Pick Intelligence, Wisdom or Charisma to cast them.',
    lists: ['cleric', 'druid', 'wizard'], repeatable: 'list' },
  'savage-attacker': { name: 'Savage Attacker', rule: 'savage-attacker', text: 'Once per turn when you hit with a weapon, roll its damage dice twice and use either roll.' },
  'skilled': { name: 'Skilled', rule: 'skilled', text: 'Proficiency in any three skills.', repeatable: true },
};
export const ORIGIN_FEATS = ['alert', 'magic-initiate', 'savage-attacker', 'skilled'];

// General feats (level 4+) and the Fighting Style feats. At each Ability
// Score Improvement level a hero takes Ability Score Improvement, or another
// feat they qualify for: a General feat, an Origin feat, or a Fighting Style
// feat if their class has the Fighting Style feature.
Object.assign(FEATS, {
  'ability-score-improvement': { name: 'Ability Score Improvement', rule: 'ability-score-improvement', general: true, repeatable: true,
    text: 'Increase one ability score by 2, or two ability scores by 1 each. A score can\'t go above 20.' },
  'grappler': { name: 'Grappler', rule: 'grappler', general: true, needs: ['str', 'dex'], plusFrom: ['str', 'dex'],
    text: '+1 to Strength or Dexterity (needs 13 in one of them). Advantage on attack rolls against a creature you are grappling. Your Unarmed Strike can damage and Grapple in the same hit, once per turn, and dragging a creature you grapple costs no extra movement (those two aren\'t used here yet).' },
  'fighting-style': { name: 'Fighting Style', rule: 'fighting-style', style: true, repeatable: true,
    text: 'Learn a Fighting Style you don\'t already have (needs the Fighting Style feature).' },
});
// Feats a hero can take at an Ability Score Improvement level.
export const ASI_FEATS = ['ability-score-improvement', 'grappler', 'fighting-style', ...ORIGIN_FEATS];
// The Fighting Styles that are feats (a Paladin's and a Ranger's own cantrip styles aren't).
export const STYLE_FEATS = ['archery', 'defense', 'great-weapon', 'two-weapon'];
// Ability Score Improvement levels (SRD 5.2.1 class tables; level 19 is an Epic Boon).
export const ASI_LEVELS = { fighter: [4, 6, 8, 12, 14, 16], rogue: [4, 8, 10, 12, 16] };
export const asiLevels = (cls, level) => (ASI_LEVELS[cls] || [4, 8, 12, 16]).filter((l) => l <= level);
export const MI_DEFAULT_ABILITY = { cleric: 'wis', druid: 'wis', wizard: 'int' };
export const LIST_NAMES = { cleric: 'Cleric', druid: 'Druid', wizard: 'Wizard', bard: 'Bard', paladin: 'Paladin', ranger: 'Ranger', sorcerer: 'Sorcerer', warlock: 'Warlock' };

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
