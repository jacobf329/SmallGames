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
  'magic-weapon': { name: 'Magic Weapon', level: 2, time: 'bonus', range: 5, touch: true, kind: 'buff', buff: 'magicweapon', targets: 1,
    text: "A Bonus Action. Touch a nonmagical weapon: for 1 hour it is a magic weapon with +1 to attack rolls and damage rolls. No Concentration. (Here: the weapons of the creature you touch.) Cast with a level 4 slot: +2; level 6 or higher: +3." },
  'prayer-of-healing': { name: 'Prayer of Healing', level: 2, time: 'action', range: 30, kind: 'utility',
    text: "Takes 10 minutes. Up to five creatures who stay within 30 feet the whole time each regain 2d8 + your spellcasting modifier Hit Points. Higher slot: +1d8 per level. (Used outside of fights here: too slow for a fight.)" },
  'zone-of-truth': { name: 'Zone of Truth', level: 2, time: 'action', range: 60, kind: 'utility',
    text: "For 10 minutes, creatures in a 15-foot-radius Sphere make a Charisma save or can't speak a deliberate lie. (Useful outside of fights.)" },
  'find-steed': { name: 'Find Steed', level: 2, time: 'action', range: 30, kind: 'utility',
    text: 'An otherworldly steed appears to serve you: a mount that fights beside you. (Not used in fights here yet.)' },
  'pass-without-trace': { name: 'Pass without Trace', level: 2, time: 'action', kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. You and your companions within 30 feet get +10 to Dexterity (Stealth) checks and leave no tracks. (Useful outside of fights.)' },
  // ---- level 3
  'fireball': { name: 'Fireball', level: 3, time: 'action', range: 150, kind: 'area', area: { shape: 'sphere', size: 20, from: 'point' }, save: 'dex', dice: '8d6', type: 'Fire', half: true, up: { dice: '1d6' },
    text: 'A bright streak flashes to a point within 150 feet and explodes. Each creature in a 20-foot-radius Sphere makes a Dexterity save: 8d6 Fire damage on a failure, half as much on a success. Careful: on this board a 20-foot radius covers most of the fight, allies included. Higher slot: +1d6 per level.' },
  'lightning-bolt': { name: 'Lightning Bolt', level: 3, time: 'action', kind: 'area', area: { shape: 'line', size: 100, from: 'self' }, save: 'dex', dice: '8d6', type: 'Lightning', half: true, up: { dice: '1d6' },
    text: 'A bolt of lightning 100 feet long and 5 feet wide blasts out from you in the direction you pick. Each creature in the Line makes a Dexterity save: 8d6 Lightning damage on a failure, half as much on a success. Higher slot: +1d6 per level.' },
  'mass-healing-word': { name: 'Mass Healing Word', level: 3, time: 'bonus', range: 60, kind: 'massheal', dice: '2d4', targets: 6, up: { dice: '1d4' },
    text: 'A Bonus Action. Up to six creatures you can see within 60 feet each regain 2d4 + your spellcasting modifier Hit Points. Higher slot: +1d4 per level.' },
  'spirit-guardians': { name: 'Spirit Guardians', level: 3, time: 'action', kind: 'zone', zone: 'guardians', save: 'wis', dice: '3d8', type: 'Radiant', half: true, conc: true, area: { shape: 'emanation', size: 15, from: 'self' }, up: { dice: '1d8' },
    text: "Concentration, up to 10 minutes. Protective spirits fill a 15-foot Emanation around you; your allies are spared. An enemy's Speed is halved in it (here: each square of it costs double, like Difficult Terrain). Whenever the Emanation enters an enemy's space, and whenever an enemy enters it or ends its turn there, that enemy makes a Wisdom save: 3d8 Radiant damage on a failure, half as much on a success, no more than once a turn. Higher slot: +1d8 per level." },
  'revivify': { name: 'Revivify', level: 3, time: 'action', range: 5, touch: true, kind: 'revive',
    text: "Touch a creature that has died within the last minute: it returns to life with 1 Hit Point. It uses up a diamond worth 300 GP. (First Roll doesn't track money, so the diamond is assumed.)" },
  'haste': { name: 'Haste', level: 3, time: 'action', range: 30, kind: 'buff', buff: 'haste', targets: 1, conc: true,
    text: "Concentration, up to 1 minute. A willing creature within 30 feet has its Speed doubled, +2 to its Armor Class, Advantage on Dexterity saves, and one extra action on each of its turns. That action can only be one weapon attack, Dash, Disengage or Hide. When the spell ends, the creature can't move or take actions until after its next turn." },
  'slow': { name: 'Slow', level: 3, time: 'action', range: 120, kind: 'area', area: { shape: 'cube', size: 40, from: 'point' }, save: 'wis', cond: 'slow', choose: 6, conc: true,
    text: "Concentration, up to 1 minute. Up to six creatures of your choice in a 40-foot Cube within 120 feet (here: the enemies in it) make a Wisdom save. On a failure: half Speed, −2 to AC and Dexterity saves, no Reactions, an action or a Bonus Action on its turn but not both, and only one attack with the Attack action. It saves again at the end of each of its turns. (The full rules also give its spells a chance to fail; that part is left out here.)" },
  'hypnotic-pattern': { name: 'Hypnotic Pattern', level: 3, time: 'action', range: 120, kind: 'area', area: { shape: 'cube', size: 30, from: 'point' }, save: 'wis', cond: 'pattern', conc: true,
    text: 'Concentration, up to 1 minute. A twisting pattern of colors in a 30-foot Cube within 120 feet. Each creature in it that can see it makes a Wisdom save or is Charmed: Incapacitated with a Speed of 0. It ends for a creature that takes damage, or that an ally shakes awake with an action. Careful: allies in the Cube can be caught too.' },
  'fear': { name: 'Fear', level: 3, time: 'action', kind: 'area', area: { shape: 'cone', size: 30, from: 'self' }, save: 'wis', cond: 'fear', conc: true,
    text: "Concentration, up to 1 minute. A 30-foot Cone of terror from you. Each creature in it makes a Wisdom save or drops what it's holding and is Frightened of you. On each of its turns it must Dash away from you by the safest route. It saves again only at the end of a turn on which it can't see you. Careful: allies in the Cone can be caught too." },
  'vampiric-touch': { name: 'Vampiric Touch', level: 3, time: 'action', range: 5, touch: true, melee: true, kind: 'attack', dice: '3d6', type: 'Necrotic', rider: 'drain', conc: true, again: true, up: { dice: '1d6' },
    text: 'Concentration, up to 1 minute. Make a melee spell attack against a creature next to you: 3d6 Necrotic damage on a hit, and you regain Hit Points equal to half the damage dealt. On each of your later turns, a Magic action makes the attack again, with no new slot. Higher slot: +1d6 per level.' },
  'call-lightning': { name: 'Call Lightning', level: 3, time: 'action', range: 120, kind: 'area', area: { shape: 'sphere', size: 5, from: 'point' }, save: 'dex', dice: '3d10', type: 'Lightning', half: true, conc: true, again: true, up: { dice: '1d10' },
    text: 'Concentration, up to 10 minutes. A storm cloud gathers overhead and a bolt strikes a point you choose within 120 feet: each creature within 5 feet of it makes a Dexterity save, 3d10 Lightning damage on a failure, half as much on a success. On each of your later turns, a Magic action calls another bolt, with no new slot. Higher slot: +1d10 per level.' },
  'stinking-cloud': { name: 'Stinking Cloud', level: 3, time: 'action', range: 90, kind: 'zone', zone: 'stink', save: 'con', conc: true, area: { shape: 'sphere', size: 20, from: 'point' },
    text: "Concentration, up to 1 minute. A 20-foot-radius Sphere of yellow, nauseating gas at a point within 90 feet. Each creature that starts its turn in it makes a Constitution save or is Poisoned until the end of that turn, and can't take an action or a Bonus Action. (The gas also blocks sight; that part is left out here.) Careful: on this board it covers most of the fight." },
  'sleet-storm': { name: 'Sleet Storm', level: 3, time: 'action', range: 150, kind: 'zone', zone: 'sleet', save: 'dex', conc: true, area: { shape: 'sphere', size: 20, from: 'point' },
    text: "Concentration, up to 1 minute. Freezing rain and sleet fill a 20-foot-radius Cylinder at a point within 150 feet. Its ground is Difficult Terrain. A creature that enters it for the first time on a turn or starts its turn there makes a Dexterity save or falls Prone. (The storm also blocks sight and can break Concentration; those parts are left out here.)" },
  'counterspell': { name: 'Counterspell', level: 3, time: 'reaction', range: 60, kind: 'counter', save: 'con',
    text: "A Reaction when you see a creature within 60 feet cast a spell: it makes a Constitution save against your spell save DC. On a failure, the spell fails and its action is wasted, but a slot it used isn't spent. (You are asked when an enemy casts.)" },
  'dispel-magic': { name: 'Dispel Magic', level: 3, time: 'action', range: 120, kind: 'dispel',
    text: "Pick a creature within 120 feet: every spell of level 3 or lower on it ends. For a higher-level spell, make an ability check with your spellcasting ability (DC 10 + the spell's level). Higher slot: it automatically ends spells up to the slot's level." },
  'fly': { name: 'Fly', level: 3, time: 'action', range: 5, touch: true, kind: 'utility', conc: true,
    text: 'Concentration, up to 10 minutes. A willing creature you touch gains a Fly Speed of 60 feet. Higher slot: one more creature per level. (The board here is flat, so it is used outside of fights.)' },
  'beacon-of-hope': { name: 'Beacon of Hope', level: 3, time: 'action', range: 30, kind: 'buff', buff: 'beacon', targets: 6, conc: true,
    text: 'Concentration, up to 1 minute. Any number of creatures within 30 feet (here: up to six) have Advantage on Wisdom saves and Death Saving Throws, and regain the most Hit Points possible from any healing.' },
  // ---- level 4
  'ice-storm': { name: 'Ice Storm', level: 4, time: 'action', range: 300, kind: 'area', area: { shape: 'sphere', size: 20, from: 'point' }, save: 'dex', dice: '2d10', type: 'Bludgeoning', also: { dice: '4d6', type: 'Cold' }, half: true, up: { dice: '1d10' },
    text: 'Hail pounds a 20-foot-radius Cylinder at a point within 300 feet. Each creature in it makes a Dexterity save: 2d10 Bludgeoning and 4d6 Cold damage on a failure, half as much on a success. (The hail also makes the ground Difficult Terrain for a turn; that part is left out here.) Careful: allies in it are hit too. Higher slot: +1d10 Bludgeoning per level.' },
  'blight': { name: 'Blight', level: 4, time: 'action', range: 30, kind: 'save', save: 'con', dice: '8d8', type: 'Necrotic', half: true, notOn: ['undead', 'construct'], up: { dice: '1d8' },
    text: "A creature you can see within 30 feet makes a Constitution save: 8d8 Necrotic damage on a failure, half as much on a success. It has no effect on Constructs or Undead. Higher slot: +1d8 per level." },
  'greater-invisibility': { name: 'Greater Invisibility', level: 4, time: 'action', range: 5, touch: true, kind: 'buff', buff: 'invis', targets: 1, conc: true,
    text: "Concentration, up to 1 minute. A creature you touch is Invisible, even while it attacks or casts spells: its attack rolls have Advantage, and attack rolls against it have Disadvantage." },
  'stoneskin': { name: 'Stoneskin', level: 4, time: 'action', range: 5, touch: true, kind: 'buff', buff: 'stoneskin', targets: 1, conc: true,
    text: 'Concentration, up to 1 hour. A willing creature you touch has Resistance to Bludgeoning, Piercing and Slashing damage. It uses up diamond dust worth 100 GP (assumed here).' },
  'death-ward': { name: 'Death Ward', level: 4, time: 'action', range: 5, touch: true, kind: 'buff', buff: 'deathward', targets: 1,
    text: 'For 8 hours, no Concentration. The first time the creature you touch would drop to 0 Hit Points, it drops to 1 Hit Point instead, and the spell ends.' },
  'fire-shield': { name: 'Fire Shield', level: 4, time: 'action', kind: 'selfbuff', buff: 'fireshield',
    text: "For 10 minutes, no Concentration. Wispy flames wreathe you (here: the warm shield). You have Resistance to Cold damage, and whenever a creature within 5 feet hits you with a melee attack, the flames lash it for 2d8 Fire damage." },
  'aura-of-life': { name: 'Aura of Life', level: 4, time: 'action', kind: 'selfbuff', buff: 'auralife', conc: true, area: { shape: 'emanation', size: 30, from: 'self' },
    text: "Concentration, up to 10 minutes. A 30-foot Emanation around you. You and your allies in it have Resistance to Necrotic damage, and their Hit Point maximum can't be reduced. An ally at 0 Hit Points who starts its turn in it regains 1 Hit Point." },
  'dimension-door': { name: 'Dimension Door', level: 4, time: 'action', range: 500, kind: 'teleport',
    text: "You teleport to a spot you can see or describe within 500 feet. (A willing creature next to you can come too; that part is left out here.) Teleporting never provokes Opportunity Attacks." },
  'polymorph': { name: 'Polymorph', level: 4, time: 'action', range: 60, kind: 'utility', conc: true,
    text: "Concentration, up to 1 hour. A creature you can see turns into a Beast (a Wisdom save if it is unwilling). Its new form's Hit Points are Temporary Hit Points, and it changes back when they run out. (Not used in fights here yet.)" },
  'freedom-of-movement': { name: 'Freedom of Movement', level: 4, time: 'action', range: 5, touch: true, kind: 'utility',
    text: "For 1 hour, a willing creature you touch isn't slowed by Difficult Terrain, and spells can't reduce its Speed or make it Paralyzed or Restrained. (Useful outside of fights here.)" },
  'arcane-eye': { name: 'Arcane Eye', level: 4, time: 'action', range: 30, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. An invisible, floating eye you can see through and move up to 30 feet a turn. (Useful outside of fights.)' },
  'charm-monster': { name: 'Charm Monster', level: 4, time: 'action', range: 30, kind: 'utility',
    text: 'A creature you can see makes a Wisdom save (with Advantage if you are fighting it) or is Charmed by you for 1 hour. (Useful outside of fights.)' },
  'wall-of-fire': { name: 'Wall of Fire', level: 4, time: 'action', range: 120, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. A wall of fire up to 60 feet long. Creatures in it when it appears make a Dexterity save: 5d8 Fire damage, half on a success; one side of it burns creatures that end a turn nearby. (Not used in fights here yet: the board has no way to draw a wall.)' },
  // ---- level 5
  'cone-of-cold': { name: 'Cone of Cold', level: 5, time: 'action', kind: 'area', area: { shape: 'cone', size: 60, from: 'self' }, save: 'con', dice: '8d8', type: 'Cold', half: true, up: { dice: '1d8' },
    text: 'A blast of cold air in a 60-foot Cone from you. Each creature in it makes a Constitution save: 8d8 Cold damage on a failure, half as much on a success. Higher slot: +1d8 per level.' },
  'flame-strike': { name: 'Flame Strike', level: 5, time: 'action', range: 60, kind: 'area', area: { shape: 'sphere', size: 10, from: 'point' }, save: 'dex', dice: '5d6', type: 'Fire', also: { dice: '5d6', type: 'Radiant' }, half: true, up: { dice: '1d6', also: '1d6' },
    text: 'A column of divine fire, a 10-foot-radius Cylinder at a point within 60 feet. Each creature in it makes a Dexterity save: 5d6 Fire and 5d6 Radiant damage on a failure, half as much on a success. Higher slot: +1d6 Fire and +1d6 Radiant per level.' },
  'mass-cure-wounds': { name: 'Mass Cure Wounds', level: 5, time: 'action', range: 60, kind: 'massheal', dice: '5d8', targets: 6, up: { dice: '1d8' },
    text: 'A wave of healing. Up to six creatures in a 30-foot-radius Sphere within 60 feet (here: any six you can see) each regain 5d8 + your spellcasting modifier Hit Points. Higher slot: +1d8 per level.' },
  'hold-monster': { name: 'Hold Monster', level: 5, time: 'action', range: 90, kind: 'hold', save: 'wis', conc: true, notOn: ['undead'], up: { targets: 1 },
    text: 'Concentration, up to 1 minute. A creature you can see within 90 feet makes a Wisdom save or is Paralyzed. It repeats the save at the end of each of its turns; a success ends the spell on it. It has no effect on Undead. Higher slot: one more creature per level.' },
  'insect-plague': { name: 'Insect Plague', level: 5, time: 'action', range: 300, kind: 'zone', zone: 'plague', save: 'con', dice: '4d10', type: 'Piercing', half: true, conc: true, area: { shape: 'sphere', size: 20, from: 'point' }, up: { dice: '1d10' },
    text: "Concentration, up to 10 minutes. Biting locusts fill a 20-foot-radius Sphere at a point within 300 feet; its ground is Difficult Terrain. Each creature in it when it appears, that enters it for the first time on a turn or ends its turn there makes a Constitution save: 4d10 Piercing damage on a failure, half as much on a success. Careful: on this board it covers most of the fight. Higher slot: +1d10 per level." },
  'cloudkill': { name: 'Cloudkill', level: 5, time: 'action', range: 120, kind: 'zone', zone: 'kill', save: 'con', dice: '5d8', type: 'Poison', half: true, conc: true, area: { shape: 'sphere', size: 20, from: 'point' }, up: { dice: '1d8' },
    text: "Concentration, up to 10 minutes. A 20-foot-radius Sphere of poisonous yellow-green fog at a point within 120 feet. Each creature in it when it appears, that enters it for the first time on a turn or ends its turn there makes a Constitution save: 5d8 Poison damage on a failure, half as much on a success. (The fog also blocks sight and drifts 10 feet a turn; those parts are left out here.) Careful: it covers most of the board. Higher slot: +1d8 per level." },
  'greater-restoration': { name: 'Greater Restoration', level: 5, time: 'action', range: 5, touch: true, kind: 'cure', cures: ['charmed', 'pattern', 'petrified'], greater: true,
    text: "Touch a creature and undo one thing: one level of Exhaustion, the Charmed or Petrified condition, a curse, or a reduction to its Hit Point maximum (like a Wight's Life Drain). It uses up diamond dust worth 100 GP (assumed here)." },
  'legend-lore': { name: 'Legend Lore', level: 5, time: 'action', kind: 'utility',
    text: 'Name or describe a famous person, place or object: you learn the lore about it. (Useful outside of fights.)' },
  'geas': { name: 'Geas', level: 5, time: 'action', range: 60, kind: 'utility',
    text: 'A creature makes a Wisdom save or is Charmed and bound to carry out a command for 30 days, taking 5d10 Psychic damage when it acts against it. (Useful outside of fights.)' },
  'summon-dragon': { name: 'Summon Dragon', level: 5, time: 'action', range: 60, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. A Draconic Spirit appears and fights for you. (Not used in fights here yet.)' },
  'tree-stride': { name: 'Tree Stride', level: 5, time: 'action', kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. Step into one living tree and out of another within 500 feet. (Useful outside of fights.)' },
  'wall-of-stone': { name: 'Wall of Stone', level: 5, time: 'action', range: 120, kind: 'utility', conc: true,
    text: 'Concentration, up to 10 minutes. A wall of stone springs up: ten 10-by-10-foot panels, or a bridge, ramp or shelter. (Not used in fights here yet.)' },
  // ---- level 4 (Oath of Devotion 13)
  'guardian-of-faith': { name: 'Guardian of Faith', level: 4, time: 'action', range: 30, kind: 'zone', zone: 'guardian', save: 'dex', flat: 20, type: 'Radiant', half: true, area: { shape: 'sphere', size: 10, from: 'point' },
    text: "For 8 hours, no Concentration. A Large spectral guardian stands in a space within 30 feet. Any enemy that moves to a space within 10 feet of it for the first time on a turn, or starts its turn there, makes a Dexterity save: 20 Radiant damage on a failure, half as much on a success. The guardian vanishes once it has dealt 60 damage in all." },
  // ---- level 6
  'chain-lightning': { name: 'Chain Lightning', level: 6, time: 'action', range: 150, kind: 'save', save: 'dex', dice: '10d8', type: 'Lightning', half: true, targets: 4, up: { targets: 1 },
    text: 'A bolt of lightning leaps to a creature within 150 feet, then to up to three others within 30 feet of it (here: up to four creatures you can see in range). Each makes a Dexterity save: 10d8 Lightning damage on a failure, half as much on a success. Higher slot: one more bolt per level.' },
  'heal': { name: 'Heal', level: 6, time: 'action', range: 60, kind: 'heal', amount: 70, up: { amount: 10 }, cures: ['blinded', 'poisoned'],
    text: 'A creature you can see within 60 feet regains 70 Hit Points, and the Blinded, Deafened and Poisoned conditions end on it. No dice to roll. Higher slot: +10 Hit Points per level.' },
  'harm': { name: 'Harm', level: 6, time: 'action', range: 60, kind: 'save', save: 'con', dice: '14d6', type: 'Necrotic', half: true, drain: true,
    text: "A creature you can see within 60 feet makes a Constitution save: 14d6 Necrotic damage on a failure, half as much on a success. Its Hit Point maximum drops by the Necrotic damage it took, until it finishes a Long Rest." },
  'disintegrate': { name: 'Disintegrate', level: 6, time: 'action', range: 60, kind: 'save', save: 'dex', dice: '10d6', flat: 40, type: 'Force', dust: true, up: { dice: '3d6' },
    text: 'A thin green ray at a creature you can see within 60 feet. It makes a Dexterity save: 10d6 + 40 Force damage on a failure, nothing on a success. A creature it drops to 0 Hit Points is turned to dust (a hero included: only a Wish brings them back). Higher slot: +3d6 per level.' },
  'circle-of-death': { name: 'Circle of Death', level: 6, time: 'action', range: 150, kind: 'area', area: { shape: 'sphere', size: 60, from: 'point' }, save: 'con', dice: '8d8', type: 'Necrotic', half: true, up: { dice: '2d8' },
    text: 'Negative energy in a 60-foot-radius Sphere at a point within 150 feet. Each creature in it makes a Constitution save: 8d8 Necrotic damage on a failure, half as much on a success. Careful: on this board it reaches nearly everyone, allies too. Higher slot: +2d8 per level.' },
  'sunbeam': { name: 'Sunbeam', level: 6, time: 'action', kind: 'area', area: { shape: 'line', size: 60, from: 'self' }, save: 'con', dice: '6d8', type: 'Radiant', half: true, rider: 'blind',
    text: "A beam of sunlight in a 60-foot-long, 5-foot-wide Line from you. Each creature in it makes a Constitution save: 6d8 Radiant damage and Blinded until the start of your next turn on a failure, half the damage on a success. (It is a Concentration spell that lets you make a new line on later turns; here it is one line, with no Concentration.)" },
  'freezing-sphere': { name: 'Freezing Sphere', level: 6, time: 'action', range: 300, kind: 'area', area: { shape: 'sphere', size: 60, from: 'point' }, save: 'con', dice: '10d6', type: 'Cold', half: true, up: { dice: '1d6' },
    text: 'A frigid globe bursts in a 60-foot-radius Sphere at a point within 300 feet. Each creature in it makes a Constitution save: 10d6 Cold damage on a failure, half as much on a success. Careful: on this board it reaches nearly everyone. Higher slot: +1d6 per level.' },
  'blade-barrier': { name: 'Blade Barrier', level: 6, time: 'action', range: 90, kind: 'utility', conc: true,
    text: 'Concentration, up to 10 minutes. A wall of whirling blades: 6d10 Force damage to creatures that enter it or end their turns in it (Dexterity save for half). (Not used in fights here yet: the board has no way to draw a wall.)' },
  'eyebite': { name: 'Eyebite', level: 6, time: 'action', range: 60, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. Each turn, one creature within 60 feet makes a Wisdom save or falls Asleep, panics (Frightened) or sickens (Poisoned). (Not used in fights here yet.)' },
  'flesh-to-stone': { name: 'Flesh to Stone', level: 6, time: 'action', range: 60, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. A creature makes a Constitution save or is Restrained, and slowly turns to stone over three failed saves. (Not used in fights here yet.)' },
  'irresistible-dance': { name: 'Irresistible Dance', level: 6, time: 'action', range: 30, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. A creature makes a Wisdom save or dances helplessly: attack rolls against it have Advantage. (Not used in fights here yet.)' },
  'globe-of-invulnerability': { name: 'Globe of Invulnerability', level: 6, time: 'action', kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. Spells of level 5 or lower cast from outside a 10-foot Emanation around you can\'t affect anything inside it. (Not used in fights here yet.)' },
  // ---- level 7
  'finger-of-death': { name: 'Finger of Death', level: 7, time: 'action', range: 60, kind: 'save', save: 'con', dice: '7d8', flat: 30, type: 'Necrotic', half: true,
    text: 'Negative energy at a creature you can see within 60 feet. It makes a Constitution save: 7d8 + 30 Necrotic damage on a failure, half as much on a success. (A Humanoid it kills rises as your Zombie; that part is left out here.)' },
  'fire-storm': { name: 'Fire Storm', level: 7, time: 'action', range: 150, kind: 'area', area: { shape: 'cube', size: 30, from: 'point' }, save: 'dex', dice: '7d10', type: 'Fire', half: true,
    text: 'A storm of flame in up to ten 10-foot Cubes within 150 feet (here: one 30-foot block of them). Each creature in it makes a Dexterity save: 7d10 Fire damage on a failure, half as much on a success.' },
  'delayed-blast-fireball': { name: 'Delayed Blast Fireball', level: 7, time: 'action', range: 150, kind: 'area', area: { shape: 'sphere', size: 20, from: 'point' }, save: 'dex', dice: '12d6', type: 'Fire', half: true, up: { dice: '1d6' },
    text: 'A bead of fire bursts in a 20-foot-radius Sphere at a point within 150 feet. Each creature in it makes a Dexterity save: 12d6 Fire damage on a failure, half as much on a success. (You can hold the bead with Concentration so it grows by 1d6 a turn; here it goes off at once.) Higher slot: +1d6 per level.' },
  'prismatic-spray': { name: 'Prismatic Spray', level: 7, time: 'action', kind: 'area', area: { shape: 'cone', size: 60, from: 'self' }, save: 'dex', dice: '12d6', type: 'Fire', half: true, prismatic: ['Fire', 'Acid', 'Lightning', 'Poison', 'Cold'],
    text: 'Rays of light flash in a 60-foot Cone from you. Each creature in it is struck by one ray, picked at random, and makes a Dexterity save: 12d6 damage of the ray\'s type on a failure, half as much on a success. (Here the ray is rolled from the five damage rays: Fire, Acid, Lightning, Poison or Cold. The rarer rays that petrify or banish are left out.)' },
  'divine-word': { name: 'Divine Word', level: 7, time: 'bonus', range: 30, kind: 'word', save: 'cha', targets: 6,
    text: 'You speak a word of power. Any creatures you choose within 30 feet (here: up to six you can see) make a Charisma save. On a failure, what happens depends on its Hit Points right now: 0 to 20, it dies; 21 to 30, Blinded, Deafened and Stunned for 1 hour; 31 to 40, Blinded and Deafened for 10 minutes; 41 to 50, Deafened for 1 minute. (Deafened changes nothing on this board.)' },
  'regenerate': { name: 'Regenerate', level: 7, time: 'action', range: 5, touch: true, kind: 'utility',
    text: 'Takes 1 minute to cast. A creature you touch regains 4d8 + 15 Hit Points, then 1 Hit Point at the start of each of its turns for an hour, and regrows lost limbs. (Useful outside of fights.)' },
  'conjure-celestial': { name: 'Conjure Celestial', level: 7, time: 'action', range: 90, kind: 'utility', conc: true,
    text: 'Concentration, up to 10 minutes. A column of celestial light that heals your allies in it or burns your enemies. (Not used in fights here yet.)' },
  'reverse-gravity': { name: 'Reverse Gravity', level: 7, time: 'action', range: 100, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. Gravity flips in a 50-foot-radius Cylinder, and everything in it falls upward. (Not used in fights here yet: the board is flat.)' },
  'forcecage': { name: 'Forcecage', level: 7, time: 'action', range: 100, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. An invisible cage of force traps creatures inside it. (Not used in fights here yet.)' },
  'arcane-sword': { name: 'Arcane Sword', level: 7, time: 'action', range: 90, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. A spectral sword hovers and strikes for 4d12 + your spellcasting modifier Force damage each turn. (Not used in fights here yet.)' },
  // ---- level 8
  'sunburst': { name: 'Sunburst', level: 8, time: 'action', range: 150, kind: 'area', area: { shape: 'sphere', size: 60, from: 'point' }, save: 'con', dice: '12d6', type: 'Radiant', half: true, rider: 'sunblind',
    text: 'Brilliant sunlight in a 60-foot-radius Sphere at a point within 150 feet. Each creature in it makes a Constitution save: 12d6 Radiant damage and Blinded for 1 minute on a failure (a new save at the end of each of its turns ends it), half the damage on a success. Careful: on this board it reaches nearly everyone.' },
  'power-word-stun': { name: 'Power Word Stun', level: 8, time: 'action', range: 60, kind: 'pwstun',
    text: "A word of power at a creature you can see within 60 feet. With 150 Hit Points or fewer, it is Stunned, with no save to stop it; at the end of each of its turns it makes a Constitution save, and a success ends it. With more than 150, its Speed is 0 until the start of your next turn." },
  'incendiary-cloud': { name: 'Incendiary Cloud', level: 8, time: 'action', range: 150, kind: 'zone', zone: 'incendiary', save: 'dex', dice: '10d8', type: 'Fire', half: true, conc: true, area: { shape: 'sphere', size: 20, from: 'point' },
    text: "Concentration, up to 1 minute. A 20-foot-radius Sphere of burning smoke at a point within 150 feet. Each creature in it when it appears, that enters it for the first time on a turn or ends its turn there makes a Dexterity save: 10d8 Fire damage on a failure, half as much on a success. (The smoke also blocks sight and drifts 10 feet a turn; those parts are left out here.)" },
  'befuddlement': { name: 'Befuddlement', level: 8, time: 'action', range: 150, kind: 'save', save: 'int', dice: '10d12', type: 'Psychic', half: true, rider: 'befuddle',
    text: "A creature you can see within 150 feet makes an Intelligence save: 10d12 Psychic damage on a failure, half as much on a success. On a failure it also can't cast spells or take the Magic action (here: for the rest of the fight)." },
  'holy-aura': { name: 'Holy Aura', level: 8, time: 'action', range: 30, kind: 'buff', buff: 'holyaura', targets: 6, conc: true,
    text: 'Concentration, up to 1 minute. Divine light around you and creatures you choose within 30 feet (here: up to six). They have Advantage on saving throws, and attack rolls against them have Disadvantage. A Fiend or Undead that hits one of them with a melee attack makes a Constitution save or is Blinded until the spell ends.' },
  'dominate-monster': { name: 'Dominate Monster', level: 8, time: 'action', range: 60, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. A creature makes a Wisdom save or is Charmed and follows your commands. (Not used in fights here yet.)' },
  'earthquake': { name: 'Earthquake', level: 8, time: 'action', range: 500, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. The ground shakes in a 100-foot-radius circle, knocking creatures Prone and opening fissures. (Not used in fights here yet.)' },
  'maze': { name: 'Maze', level: 8, time: 'action', range: 60, kind: 'utility', conc: true,
    text: 'Concentration, up to 10 minutes. A creature is banished into a labyrinth on another plane until it finds its way out. (Not used in fights here yet.)' },
  // ---- level 9
  'meteor-swarm': { name: 'Meteor Swarm', level: 9, time: 'action', range: 300, kind: 'area', area: { shape: 'sphere', size: 20, from: 'point' }, save: 'dex', dice: '20d6', type: 'Fire', also: { dice: '20d6', type: 'Bludgeoning' }, half: true,
    text: 'Blazing orbs crash down. Each creature in the blast makes a Dexterity save: 20d6 Fire damage and 20d6 Bludgeoning damage on a failure, half as much on a success. (The real spell drops four Spheres, each 40 feet in radius, which is wider than this whole board, so here the meteors fall as one 20-foot-radius Sphere at a point you pick.)' },
  'power-word-kill': { name: 'Power Word Kill', level: 9, time: 'action', range: 60, kind: 'pwkill',
    text: 'A word of power at a creature you can see within 60 feet. With 100 Hit Points or fewer, it dies, with no save. Otherwise it takes 12d12 Psychic damage.' },
  'mass-heal': { name: 'Mass Heal', level: 9, time: 'action', range: 60, kind: 'massheal', pool: 700, targets: 6, cures: ['blinded', 'poisoned'],
    text: 'Healing energy flows into the creatures you choose within 60 feet (here: up to six). Share out 700 Hit Points among them as you like (here: each in turn gets what it needs, the most hurt first). It also ends the Blinded, Deafened and Poisoned conditions on them.' },
  'power-word-heal': { name: 'Power Word Heal', level: 9, time: 'action', range: 60, kind: 'heal', full: true, cures: ['charmed', 'frightened', 'paralyzed', 'poisoned', 'stunned'],
    text: "A wave of healing washes over a creature you can see within 60 feet. It regains all its Hit Points, and the Charmed, Frightened, Paralyzed, Poisoned and Stunned conditions end on it. If it is Prone, it can use its Reaction to stand up." },
  'weird': { name: 'Weird', level: 9, time: 'action', range: 120, kind: 'area', area: { shape: 'sphere', size: 30, from: 'point' }, save: 'wis', dice: '10d10', type: 'Psychic', half: true, choose: true, conc: true, rider: 'weird',
    text: 'Concentration, up to 1 minute. Illusory terrors in the minds of the creatures you choose in a 30-foot-radius Sphere within 120 feet. Each makes a Wisdom save: 10d10 Psychic damage and Frightened on a failure, half the damage on a success. At the end of each of its turns, a Frightened target takes 5d10 Psychic damage and saves again; a success ends it.' },
  'time-stop': { name: 'Time Stop', level: 9, time: 'action', kind: 'utility',
    text: 'You briefly stop the flow of time for everyone but yourself, and take 1d4 + 1 turns in a row. It ends if anything you do affects another creature or something it is carrying. (Not used in fights here yet.)' },
  'foresight': { name: 'Foresight', level: 9, time: 'action', range: 5, touch: true, kind: 'utility',
    text: 'Takes 1 minute to cast. For 8 hours a willing creature you touch has Advantage on D20 Tests, and attack rolls against it have Disadvantage. (Cast before a fight; not used in fights here yet.)' },
  'true-polymorph': { name: 'True Polymorph', level: 9, time: 'action', range: 30, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. Turn a creature into another creature or an object, or an object into a creature (a Wisdom save resists). Held for the full hour, it lasts until dispelled. (Not used in fights here yet.)' },
  'shapechange': { name: 'Shapechange', level: 9, time: 'action', kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. You take the form of a creature whose Challenge Rating is no higher than your level, and can change form again as a Magic action. (Not used in fights here yet.)' },
  'storm-of-vengeance': { name: 'Storm of Vengeance', level: 9, time: 'action', kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. A churning storm cloud 300 feet in radius: thunder, acid rain, lightning bolts and hail, worse each round. (Not used in fights here yet: the cloud is far bigger than the board.)' },
  'wish': { name: 'Wish', level: 9, time: 'action', kind: 'utility',
    text: 'The mightiest spell a mortal can cast. Copy any spell of level 8 or lower without its materials, or ask for something greater, at a risk of never casting Wish again. (Not used in fights here yet.)' },
  // ---- level 5 spells of the Paladin and Ranger lists
  'destructive-wave': { name: 'Destructive Wave', level: 5, time: 'action', kind: 'area', area: { shape: 'emanation', size: 30, from: 'self' }, save: 'con', dice: '5d6', type: 'Thunder', also: { dice: '5d6', type: 'Radiant' }, half: true, choose: true, rider: 'prone',
    text: 'You strike the ground. Each creature you choose within 30 feet of you makes a Constitution save: 5d6 Thunder damage and 5d6 Radiant damage and it falls Prone on a failure, half the damage on a success. (You can pick Necrotic instead of Radiant; here it is Radiant.)' },
  'conjure-volley': { name: 'Conjure Volley', level: 5, time: 'action', range: 150, kind: 'area', area: { shape: 'sphere', size: 40, from: 'point' }, save: 'dex', dice: '8d8', type: 'Force', half: true, choose: true,
    text: 'Spectral arrows fall in a 40-foot-radius, 20-foot-high Cylinder at a point within 150 feet. Each creature you choose in it makes a Dexterity save: 8d8 Force damage on a failure, half as much on a success.' },
  'steel-wind-strike': { name: 'Steel Wind Strike', level: 5, time: 'action', range: 30, kind: 'attack', melee: true, dice: '6d10', type: 'Force', targets: 5, wind: true,
    text: 'You flourish your weapon and vanish. Make a melee spell attack against each of up to five creatures you can see within 30 feet: 6d10 Force damage on a hit. Then you teleport to an empty space within 5 feet of one of them.' },
  'banishing-smite': { name: 'Banishing Smite', level: 5, time: 'bonus', kind: 'utility', conc: true,
    text: 'Right after you hit with a melee weapon: an extra 5d10 Force damage, and a target left with 50 Hit Points or fewer makes a Charisma save or is banished while you keep Concentration. (Not offered in fights here yet: Divine Smite with a level 5 slot is.)' },
  'circle-of-power': { name: 'Circle of Power', level: 5, time: 'action', kind: 'utility', conc: true,
    text: 'Concentration, up to 10 minutes. You and your allies within 30 feet have Advantage on saves against spells and magical effects, and take no damage when such a save would halve it. (Not used in fights here yet.)' },
  'raise-dead': { name: 'Raise Dead', level: 5, time: 'action', range: 5, touch: true, kind: 'utility',
    text: 'Takes 1 hour to cast. A creature dead no longer than 10 days returns to life with 1 Hit Point. (Useful outside of fights.)' },
  'summon-celestial': { name: 'Summon Celestial', level: 5, time: 'action', range: 90, kind: 'utility', conc: true,
    text: 'Concentration, up to 1 hour. A celestial spirit, an Avenger or a Defender, fights at your side. (Not used in fights here yet.)' },
  'swift-quiver': { name: 'Swift Quiver', level: 5, time: 'bonus', kind: 'utility', conc: true,
    text: 'Concentration, up to 1 minute. Your quiver never runs out, and each turn you can make two extra attacks with a bow or crossbow as a Bonus Action. (Not used in fights here yet.)' },
  'commune-with-nature': { name: 'Commune with Nature', level: 5, time: 'action', kind: 'utility',
    text: 'Takes 1 minute to cast. You learn the lie of the land for 3 miles around: water, settlements, strong creatures, plants and minerals. (Useful outside of fights.)' },
  'commune': { name: 'Commune', level: 5, time: 'action', kind: 'utility',
    text: 'Takes 1 minute to cast. You ask your god up to three questions that can be answered yes or no. (Useful outside of fights.)' },
};

// Each class's spell list (the spells of the SRD this game has).
export const SPELL_LISTS = {
  cleric: {
    0: ['sacred-flame', 'spare-the-dying', 'guidance', 'resistance-cantrip', 'thaumaturgy', 'light', 'mending'],
    1: ['bless', 'command', 'cure-wounds', 'detect-magic', 'guiding-bolt', 'healing-word', 'inflict-wounds', 'shield-of-faith', 'bane', 'protection-from-evil-and-good'],
    2: ['aid', 'hold-person', 'lesser-restoration', 'spiritual-weapon'],
    3: ['spirit-guardians', 'mass-healing-word', 'revivify', 'dispel-magic', 'beacon-of-hope'],
    4: ['death-ward', 'aura-of-life', 'freedom-of-movement', 'guardian-of-faith'],
    5: ['flame-strike', 'mass-cure-wounds', 'greater-restoration', 'insect-plague', 'legend-lore', 'geas', 'commune', 'raise-dead'],
    6: ['heal', 'harm', 'sunbeam', 'blade-barrier'],
    7: ['fire-storm', 'divine-word', 'regenerate', 'conjure-celestial'],
    8: ['sunburst', 'holy-aura', 'earthquake'],
    9: ['mass-heal', 'power-word-heal'],
  },
  wizard: {
    0: ['fire-bolt', 'ray-of-frost', 'chill-touch', 'shocking-grasp', 'poison-spray', 'acid-splash', 'mage-hand', 'light', 'mending', 'dancing-lights', 'minor-illusion', 'prestidigitation'],
    1: ['magic-missile', 'burning-hands', 'shield', 'thunderwave', 'mage-armor', 'false-life', 'ray-of-sickness', 'chromatic-orb', 'sleep', 'fog-cloud', 'charm-person', 'detect-magic', 'comprehend-languages', 'feather-fall', 'identify', 'alarm', 'unseen-servant', 'find-familiar'],
    2: ['scorching-ray', 'misty-step', 'hold-person', 'shatter', 'web', 'blur', 'dragons-breath', 'alter-self', 'suggestion', 'magic-weapon'],
    3: ['fireball', 'lightning-bolt', 'haste', 'slow', 'hypnotic-pattern', 'fear', 'vampiric-touch', 'stinking-cloud', 'sleet-storm', 'counterspell', 'dispel-magic', 'fly'],
    4: ['ice-storm', 'blight', 'greater-invisibility', 'stoneskin', 'fire-shield', 'dimension-door', 'polymorph', 'arcane-eye'],
    5: ['cone-of-cold', 'hold-monster', 'cloudkill', 'legend-lore', 'wall-of-stone', 'geas', 'steel-wind-strike'],
    6: ['chain-lightning', 'disintegrate', 'circle-of-death', 'sunbeam', 'freezing-sphere', 'eyebite', 'flesh-to-stone', 'irresistible-dance', 'globe-of-invulnerability'],
    7: ['finger-of-death', 'delayed-blast-fireball', 'prismatic-spray', 'reverse-gravity', 'forcecage', 'arcane-sword'],
    8: ['sunburst', 'power-word-stun', 'incendiary-cloud', 'befuddlement', 'dominate-monster', 'maze'],
    9: ['meteor-swarm', 'power-word-kill', 'weird', 'time-stop', 'foresight', 'true-polymorph', 'shapechange', 'wish'],
  },
  bard: {
    0: ['vicious-mockery', 'starry-wisp', 'dancing-lights', 'light', 'mage-hand', 'mending', 'minor-illusion', 'prestidigitation'],
    1: ['healing-word', 'dissonant-whispers', 'heroism', 'sleep', 'faerie-fire', 'bane', 'command', 'cure-wounds', 'thunderwave', 'charm-person', 'comprehend-languages', 'detect-magic', 'feather-fall', 'identify', 'longstrider', 'speak-with-animals', 'unseen-servant'],
    2: ['shatter', 'hold-person', 'aid', 'lesser-restoration', 'suggestion', 'zone-of-truth'],
    3: ['mass-healing-word', 'hypnotic-pattern', 'fear', 'slow', 'stinking-cloud', 'dispel-magic'],
    4: ['greater-invisibility', 'polymorph', 'dimension-door', 'freedom-of-movement', 'charm-monster'],
    5: ['mass-cure-wounds', 'hold-monster', 'greater-restoration', 'legend-lore', 'geas', 'raise-dead'],
    6: ['eyebite', 'irresistible-dance'],
    7: ['prismatic-spray', 'regenerate', 'forcecage', 'arcane-sword'],
    8: ['power-word-stun', 'befuddlement', 'dominate-monster'],
    9: ['power-word-kill', 'power-word-heal', 'foresight', 'true-polymorph'],
  },
  druid: {
    0: ['produce-flame', 'thorn-whip', 'starry-wisp', 'poison-spray', 'guidance', 'spare-the-dying', 'resistance-cantrip', 'druidcraft', 'mending'],
    1: ['entangle', 'healing-word', 'cure-wounds', 'faerie-fire', 'thunderwave', 'longstrider', 'fog-cloud', 'detect-magic', 'speak-with-animals'],
    2: ['barkskin', 'hold-person', 'lesser-restoration', 'pass-without-trace'],
    3: ['call-lightning', 'sleet-storm', 'revivify', 'dispel-magic'],
    4: ['ice-storm', 'blight', 'stoneskin', 'fire-shield', 'polymorph', 'freedom-of-movement', 'charm-monster'],
    5: ['cone-of-cold', 'mass-cure-wounds', 'greater-restoration', 'insect-plague', 'tree-stride', 'wall-of-stone', 'geas', 'commune-with-nature'],
    6: ['heal', 'sunbeam', 'flesh-to-stone'],
    7: ['fire-storm', 'regenerate', 'reverse-gravity'],
    8: ['sunburst', 'incendiary-cloud', 'befuddlement', 'earthquake'],
    9: ['foresight', 'shapechange', 'storm-of-vengeance'],
  },
  paladin: {
    1: ['divine-favor', 'bless', 'cure-wounds', 'heroism', 'shield-of-faith', 'command', 'protection-from-evil-and-good', 'divine-smite', 'detect-magic'],
    2: ['aid', 'lesser-restoration', 'magic-weapon', 'prayer-of-healing', 'zone-of-truth', 'find-steed'],
    3: ['revivify', 'dispel-magic'],
    4: ['death-ward', 'aura-of-life', 'freedom-of-movement'],
    5: ['destructive-wave', 'banishing-smite', 'circle-of-power', 'raise-dead', 'summon-celestial'],
  },
  ranger: {
    1: ['hunters-mark', 'cure-wounds', 'entangle', 'longstrider', 'fog-cloud', 'alarm', 'detect-magic', 'speak-with-animals'],
    2: ['aid', 'barkskin', 'lesser-restoration', 'magic-weapon', 'pass-without-trace'],
    3: ['revivify', 'dispel-magic'],
    4: ['freedom-of-movement', 'stoneskin'],
    5: ['conjure-volley', 'steel-wind-strike', 'greater-restoration', 'tree-stride', 'swift-quiver', 'commune-with-nature'],
  },
  sorcerer: {
    0: ['fire-bolt', 'sorcerous-burst', 'ray-of-frost', 'shocking-grasp', 'chill-touch', 'acid-splash', 'poison-spray', 'dancing-lights', 'light', 'mage-hand', 'mending', 'minor-illusion', 'prestidigitation'],
    1: ['magic-missile', 'chromatic-orb', 'shield', 'burning-hands', 'sleep', 'thunderwave', 'false-life', 'ray-of-sickness', 'charm-person', 'comprehend-languages', 'detect-magic', 'feather-fall', 'fog-cloud'],
    2: ['scorching-ray', 'shatter', 'web', 'misty-step', 'hold-person', 'blur', 'dragons-breath', 'alter-self', 'suggestion'],
    3: ['fireball', 'lightning-bolt', 'haste', 'slow', 'hypnotic-pattern', 'fear', 'vampiric-touch', 'stinking-cloud', 'sleet-storm', 'counterspell', 'dispel-magic', 'fly'],
    4: ['ice-storm', 'blight', 'greater-invisibility', 'stoneskin', 'fire-shield', 'dimension-door', 'polymorph', 'charm-monster'],
    5: ['cone-of-cold', 'hold-monster', 'cloudkill', 'insect-plague', 'wall-of-stone'],
    6: ['chain-lightning', 'disintegrate', 'circle-of-death', 'sunbeam', 'freezing-sphere', 'eyebite', 'flesh-to-stone', 'globe-of-invulnerability'],
    7: ['finger-of-death', 'fire-storm', 'delayed-blast-fireball', 'prismatic-spray', 'reverse-gravity'],
    8: ['sunburst', 'power-word-stun', 'incendiary-cloud', 'dominate-monster', 'earthquake'],
    9: ['meteor-swarm', 'power-word-kill', 'time-stop', 'wish'],
  },
  warlock: {
    0: ['eldritch-blast', 'chill-touch', 'poison-spray', 'mage-hand', 'minor-illusion', 'prestidigitation'],
    1: ['hex', 'hellish-rebuke', 'protection-from-evil-and-good', 'charm-person', 'comprehend-languages', 'unseen-servant'],
    2: ['misty-step', 'hold-person', 'shatter', 'suggestion'],
    3: ['hypnotic-pattern', 'fear', 'vampiric-touch', 'counterspell', 'dispel-magic', 'fly'],
    4: ['blight', 'dimension-door', 'charm-monster'],
    5: ['hold-monster'],
    6: ['circle-of-death', 'eyebite'],
    7: ['finger-of-death', 'forcecage'],
    8: ['power-word-stun', 'befuddlement', 'dominate-monster'],
    9: ['power-word-kill', 'weird', 'foresight', 'true-polymorph'],
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
export const DOMAIN_SPELLS = { 3: ['aid', 'bless', 'cure-wounds', 'lesser-restoration'], 5: ['mass-healing-word', 'revivify'], 7: ['aura-of-life', 'death-ward'], 9: ['greater-restoration', 'mass-cure-wounds'] };

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
  paladin: { 2: ['divine-smite'], 3: ['protection-from-evil-and-good', 'shield-of-faith'], 5: ['aid', 'zone-of-truth', 'find-steed'], 9: ['beacon-of-hope', 'dispel-magic'], 13: ['freedom-of-movement', 'guardian-of-faith'], 17: ['commune', 'flame-strike'] },
  ranger: { 1: ['hunters-mark'] },
  bard: { 20: ['power-word-heal', 'power-word-kill'] },
  sorcerer: { 3: ['alter-self', 'chromatic-orb', 'command', 'dragons-breath'], 5: ['fear', 'fly'], 7: ['arcane-eye', 'charm-monster'], 9: ['legend-lore', 'summon-dragon'] },
  warlock: { 3: ['burning-hands', 'command', 'scorching-ray', 'suggestion'], 5: ['fireball', 'stinking-cloud'], 7: ['fire-shield', 'wall-of-fire'], 9: ['geas', 'insect-plague'] },
};
// Circle of the Land: pick a land at level 3; its spells are always prepared.
export const LAND_SPELLS = {
  arid: { name: 'Arid Land', spells: ['blur', 'burning-hands', 'fire-bolt'], more: { 5: ['fireball'], 7: ['blight'], 9: ['wall-of-stone'] }, ward: 'Fire' },
  polar: { name: 'Polar Land', spells: ['fog-cloud', 'hold-person', 'ray-of-frost'], more: { 5: ['sleet-storm'], 7: ['ice-storm'], 9: ['cone-of-cold'] }, ward: 'Cold' },
  temperate: { name: 'Temperate Land', spells: ['misty-step', 'shocking-grasp', 'sleep'], more: { 5: ['lightning-bolt'], 7: ['freedom-of-movement'], 9: ['tree-stride'] }, ward: 'Lightning' },
  tropical: { name: 'Tropical Land', spells: ['acid-splash', 'ray-of-sickness', 'web'], more: { 5: ['stinking-cloud'], 7: ['polymorph'], 9: ['insect-plague'] }, ward: 'Poison' },
};
// A land's spells at a Druid level: the level 3 ones, then more at 5, 7 and 9.
export const landSpells = (land, level) => {
  const L = LAND_SPELLS[land] || LAND_SPELLS.arid;
  return [...L.spells, ...Object.entries(L.more || {}).filter(([lv]) => level >= +lv).flatMap(([, xs]) => xs)];
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
  'otherworldly-leap': { name: 'Otherworldly Leap', min: 2, text: 'Cast Jump on yourself at will without a spell slot. (Useful outside of fights.)' },
  'ascendant-step': { name: 'Ascendant Step', min: 5, text: 'Cast Levitate on yourself at will without a spell slot. (Useful outside of fights.)' },
  'gift-of-the-depths': { name: 'Gift of the Depths', min: 5, text: 'Breathe underwater and swim at your Speed, and cast Water Breathing once per Long Rest without a slot. (Useful outside of fights.)' },
  'one-with-shadows': { name: 'One with Shadows', min: 5, text: 'In Dim Light or Darkness, cast Invisibility on yourself without a spell slot. (Every fight here is lit, so it is used outside of fights.)' },
  'lifedrinker': { name: 'Lifedrinker', min: 9, needs: 'pact-of-the-blade', text: 'Once per turn, when you hit with your pact weapon, it deals an extra 1d6 Necrotic damage. (You can also spend a Hit Point Die to heal; that part is left out here.)' },
  'devouring-blade': { name: 'Devouring Blade', min: 12, needs: 'thirsting-blade', text: 'Your Thirsting Blade grows hungrier: you attack three times with your pact weapon, instead of twice, whenever you take the Attack action on your turn.' },
  'witch-sight': { name: 'Witch Sight', min: 15, text: 'Truesight out to 30 feet: you see invisible creatures and through illusions. (Here: Invisible creatures within 30 feet get no Advantage or Disadvantage against you.)' },
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
// Level 7 choices: a Cleric's Blessed Strikes, a Druid's Elemental Fury, a Hunter's Defensive Tactics.
export const STRIKES = {
  cleric: {
    divine: { name: 'Divine Strike', rule: 'divine-strike', text: 'Once on each of your turns, when you hit a creature with a weapon attack, it takes an extra 1d8 Radiant damage.' },
    potent: { name: 'Potent Spellcasting', rule: 'potent-spellcasting', text: 'Add your Wisdom modifier to the damage you deal with any Cleric cantrip.' },
  },
  druid: {
    primal: { name: 'Primal Strike', rule: 'primal-strike', text: 'Once on each of your turns, when you hit a creature with a weapon attack or a Beast form\'s attack, it takes an extra 1d8 Cold, Fire, Lightning or Thunder damage (here: the type it is weakest to).' },
    potent: { name: 'Potent Spellcasting', rule: 'potent-spellcasting', text: 'Add your Wisdom modifier to the damage you deal with any Druid cantrip.' },
  },
};
export const DEFENSIVE_TACTICS = {
  horde: { name: 'Escape the Horde', rule: 'escape-the-horde', text: 'Opportunity Attacks against you have Disadvantage.' },
  multi: { name: 'Multiattack Defense', rule: 'multiattack-defense', text: 'When a creature hits you with an attack roll, it has Disadvantage on its other attack rolls against you this turn.' },
};
// Fiendish Resilience (Fiend Patron 10): Resistance to one damage type (not Force), chosen after a rest.
export const RESILIENCE_TYPES = ['Slashing', 'Piercing', 'Bludgeoning', 'Necrotic', 'Fire', 'Cold', 'Poison', 'Lightning', 'Acid', 'Psychic', 'Radiant', 'Thunder'];
// Wizard spells of the Evocation school (Sculpt Spells, Empowered Evocation).
export const EVOCATION = ['fire-bolt', 'ray-of-frost', 'shocking-grasp', 'light', 'dancing-lights', 'magic-missile', 'burning-hands', 'thunderwave', 'chromatic-orb',
  'scorching-ray', 'shatter', 'fireball', 'lightning-bolt', 'ice-storm', 'fire-shield', 'cone-of-cold', 'wall-of-stone', 'flame-strike'];
// Mystic Arcanum (Warlock 11, 13, 15, 17): one Warlock spell of each of these levels, cast once per Long Rest without a slot.
export const ARCANUM_LEVELS = { 11: 6, 13: 7, 15: 8, 17: 9 };
export const arcanumLevels = (level) => Object.entries(ARCANUM_LEVELS).filter(([l]) => level >= +l).map(([, sl]) => sl);
// Font of Magic: Sorcery Points it costs to make a spell slot of each level.
export const SLOT_COST = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };
// Font of Magic can make a slot of a level up to this, by Sorcerer level.
export const SLOT_MIN_LEVEL = { 1: 2, 2: 3, 3: 5, 4: 7, 5: 9 };
// The highest level a hero can reach (the class tables run to 20).
export const MAX_LEVEL = 20;
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
  sparkDice: (lv) => stepAt(lv, [[1, 1], [7, 2], [13, 3], [18, 4]]),
  landsAidDice: (lv) => stepAt(lv, [[1, 2], [10, 3], [14, 4]]),
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
// Epic Boons (level 19): each also gives +1 to one ability score, which can go up to 30.
Object.assign(FEATS, {
  'boon-of-combat-prowess': { name: 'Boon of Combat Prowess', rule: 'boon-of-combat-prowess', epic: true, plusFrom: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    text: 'Peerless Aim: when you miss with an attack roll, you can hit instead. Then you can\'t do it again until the start of your next turn. (Used for you automatically.)' },
  'boon-of-dimensional-travel': { name: 'Boon of Dimensional Travel', rule: 'boon-of-dimensional-travel', epic: true, plusFrom: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    text: 'Blink Steps: right after you take the Attack action or the Magic action, you can teleport up to 30 feet to an empty space you can see. Teleporting doesn\'t provoke Opportunity Attacks.' },
  'boon-of-fate': { name: 'Boon of Fate', rule: 'boon-of-fate', epic: true, plusFrom: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    text: 'Improve Fate: when you or another creature within 60 feet succeeds or fails a D20 Test, you can roll 2d4 and add it to the roll or subtract it. Once until you roll Initiative or finish a Short or Long Rest. (Here: used for you on a saving throw it would change, an ally\'s failure or an enemy\'s success.)' },
  'boon-of-irresistible-offense': { name: 'Boon of Irresistible Offense', rule: 'boon-of-irresistible-offense', epic: true, plusFrom: ['str', 'dex'],
    text: 'Overcome Defenses: your Bludgeoning, Piercing and Slashing damage ignores Resistance. Overwhelming Strike: when you roll a 20 on the d20 of an attack roll, the target takes extra damage of the attack\'s type equal to the ability score this feat raised.' },
  'boon-of-spell-recall': { name: 'Boon of Spell Recall', rule: 'boon-of-spell-recall', epic: true, caster: true, plusFrom: ['int', 'wis', 'cha'],
    text: 'Free Casting: when you cast a spell with a level 1 to 4 spell slot, roll 1d4. If the number is the slot\'s level, the slot isn\'t spent. (Needs the Spellcasting or Pact Magic feature.)' },
  'boon-of-the-night-spirit': { name: 'Boon of the Night Spirit', rule: 'boon-of-the-night-spirit', epic: true, plusFrom: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    text: 'Merge with Shadows: in Dim Light or Darkness, a Bonus Action makes you Invisible until you take an action, a Bonus Action or a Reaction. Shadowy Form: in Dim Light or Darkness, Resistance to all damage but Psychic and Radiant. (Every fight here is in Bright Light, so it is used outside of fights.)' },
  'boon-of-truesight': { name: 'Boon of Truesight', rule: 'boon-of-truesight', epic: true, plusFrom: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    text: 'Truesight out to 60 feet: you see Invisible creatures and through illusions. (Here: Invisible creatures within 60 feet get no Advantage or Disadvantage against you.)' },
});
export const EPIC_FEATS = ['boon-of-combat-prowess', 'boon-of-dimensional-travel', 'boon-of-fate', 'boon-of-irresistible-offense', 'boon-of-spell-recall', 'boon-of-the-night-spirit', 'boon-of-truesight'];
// The Epic Boon each class's table suggests. (The Rogue's, the Night Spirit, does nothing in these brightly lit fights, so its companions take Combat Prowess.)
export const EPIC_DEFAULT = {
  barbarian: 'boon-of-irresistible-offense', bard: 'boon-of-spell-recall', cleric: 'boon-of-fate', druid: 'boon-of-dimensional-travel', fighter: 'boon-of-combat-prowess',
  monk: 'boon-of-irresistible-offense', paladin: 'boon-of-truesight', ranger: 'boon-of-dimensional-travel', rogue: 'boon-of-combat-prowess', sorcerer: 'boon-of-dimensional-travel',
  warlock: 'boon-of-fate', wizard: 'boon-of-spell-recall',
};
// The level of the Epic Boon feature.
export const EPIC_LEVEL = 19;
// Feats a hero can take at an Ability Score Improvement level.
export const ASI_FEATS = ['ability-score-improvement', 'grappler', 'fighting-style', ...ORIGIN_FEATS];
// The Fighting Styles that are feats (a Paladin's and a Ranger's own cantrip styles aren't).
export const STYLE_FEATS = ['archery', 'defense', 'great-weapon', 'two-weapon'];
// Ability Score Improvement levels (SRD 5.2.1 class tables).
// Level 19 is the Epic Boon: an Epic Boon feat, or any other feat the hero qualifies for.
export const ASI_LEVELS = { fighter: [4, 6, 8, 12, 14, 16, 19], rogue: [4, 8, 10, 12, 16, 19] };
export const asiLevels = (cls, level) => (ASI_LEVELS[cls] || [4, 8, 12, 16, 19]).filter((l) => l <= level);
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

// --- Chapters 9 to 11 (levels 4 and 5), SRD 5.2.1. Proficiency Bonus +2 (CR 0-4).
// solo: an attack that is its own action (it can't be one of a Multiattack's
// attacks). rider.paralyze: a Constitution save on a hit or Paralyzed until
// the end of the target's next turn. drain: Life Drain, a save instead of an
// attack roll that also lowers the target's Hit Point maximum.
export const GHOUL = {
  kind: 'ghoul', name: 'Ghoul', emoji: '🧟', type: 'Medium Undead', size: 'medium', creature: 'undead',
  ac: 12, hp: 22, hpFormula: '5d8', speed: 30,
  abilities: { str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6 },
  immune: ['Poison'], condImmune: ['charmed', 'exhaustion', 'poisoned'],
  attacks: [
    { id: 'bite', name: 'Bite', kind: 'melee', bonus: 4, dice: '1d6', flat: 2, type: 'Piercing', extra: [{ dice: '1d6', type: 'Necrotic' }] },
    { id: 'claw', name: 'Claw', kind: 'melee', bonus: 4, dice: '1d4', flat: 2, type: 'Slashing', solo: true, rider: { paralyze: { dc: 10, notElf: true } } },
  ],
  multiattack: 2, multiName: 'two Bite attacks', xp: 200, cr: '1',
};
export const GHAST = {
  kind: 'ghast', name: 'Ghast', emoji: '🧟', type: 'Medium Undead', size: 'medium', creature: 'undead',
  ac: 13, hp: 36, hpFormula: '8d8', speed: 30,
  abilities: { str: 16, dex: 17, con: 10, int: 11, wis: 10, cha: 8 }, saves: { wis: 2 },
  resist: ['Necrotic'], immune: ['Poison'], condImmune: ['charmed', 'exhaustion', 'poisoned'],
  attacks: [
    { id: 'bite', name: 'Bite', kind: 'melee', bonus: 5, dice: '1d8', flat: 3, type: 'Piercing', extra: [{ dice: '2d8', type: 'Necrotic' }] },
    { id: 'claw', name: 'Claw', kind: 'melee', bonus: 5, dice: '2d6', flat: 3, type: 'Slashing', rider: { paralyze: { dc: 10 } } },
  ],
  traits: { stench: true }, stench: { dc: 10 }, xp: 450, cr: '2',
};
export const DIRE_WOLF = {
  kind: 'dire-wolf', name: 'Dire Wolf', emoji: '🐺', type: 'Large Beast', size: 'large', creature: 'beast',
  ac: 14, hp: 22, hpFormula: '3d10+6', speed: 50,
  abilities: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 }, skills: { perception: 5, stealth: 4 },
  attacks: [{ id: 'bite', name: 'Bite', kind: 'melee', bonus: 5, dice: '1d10', flat: 3, type: 'Piercing', rider: { prone: 'large' } }],
  traits: { packTactics: true }, xp: 200, cr: '1',
};
export const OGRE = {
  kind: 'ogre', name: 'Ogre', emoji: '👹', type: 'Large Giant', size: 'large', creature: 'giant',
  ac: 11, hp: 68, hpFormula: '8d10+24', speed: 40,
  abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
  attacks: [
    { id: 'greatclub', name: 'Greatclub', kind: 'melee', bonus: 6, dice: '2d8', flat: 4, type: 'Bludgeoning' },
    { id: 'javelin', name: 'Javelin', kind: 'melee', bonus: 6, dice: '2d6', flat: 4, type: 'Piercing' },
    { id: 'javelin-thrown', name: 'Javelin (thrown)', kind: 'ranged', bonus: 6, dice: '2d6', flat: 4, type: 'Piercing', range: [30, 120] },
  ],
  xp: 450, cr: '2',
};
export const ANIMATED_ARMOR = {
  kind: 'armor', name: 'Animated Armor', emoji: '🛡️', type: 'Medium Construct', size: 'medium', creature: 'construct',
  ac: 18, hp: 33, hpFormula: '6d8+6', speed: 25,
  abilities: { str: 14, dex: 11, con: 13, int: 1, wis: 3, cha: 1 },
  immune: ['Poison', 'Psychic'], condImmune: ['charmed', 'deafened', 'exhaustion', 'frightened', 'paralyzed', 'petrified', 'poisoned'],
  attacks: [{ id: 'slam', name: 'Slam', kind: 'melee', bonus: 4, dice: '1d6', flat: 2, type: 'Bludgeoning' }],
  multiattack: 2, xp: 200, cr: '1',
};
export const WIGHT = {
  kind: 'wight', name: 'Wight', emoji: '💀', type: 'Medium Undead', size: 'medium', creature: 'undead',
  ac: 14, hp: 82, hpFormula: '11d8+33', speed: 30,
  abilities: { str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15 }, skills: { perception: 3, stealth: 4 },
  resist: ['Necrotic'], immune: ['Poison'], condImmune: ['exhaustion', 'poisoned'],
  attacks: [
    { id: 'sword', name: 'Necrotic Sword', kind: 'melee', bonus: 4, dice: '1d8', flat: 2, type: 'Slashing', extra: [{ dice: '1d8', type: 'Necrotic' }] },
    { id: 'bow', name: 'Necrotic Bow', kind: 'ranged', bonus: 4, dice: '1d8', flat: 2, type: 'Piercing', extra: [{ dice: '1d8', type: 'Necrotic' }], range: [150, 600] },
  ],
  drain: { dc: 13, dice: '1d8', flat: 2, type: 'Necrotic' },
  multiattack: 2, xp: 700, cr: '3',
};

// Levels 6 to 10: the toll keep on the east road, the fen and what lives in it.
export const BANDIT_CAPTAIN = {
  kind: 'bandit-captain', name: 'Bandit Captain', emoji: '🗡️', type: 'Medium Humanoid', size: 'medium', creature: 'humanoid',
  ac: 15, hp: 52, hpFormula: '8d8+16', speed: 30,
  abilities: { str: 15, dex: 16, con: 14, int: 14, wis: 11, cha: 14 }, saves: { str: 4, dex: 5, wis: 2 }, skills: { athletics: 4, deception: 4 },
  attacks: [
    { id: 'scimitar', name: 'Scimitar', kind: 'melee', bonus: 5, dice: '1d6', flat: 3, type: 'Slashing' },
    { id: 'pistol', name: 'Pistol', kind: 'ranged', bonus: 5, dice: '1d10', flat: 3, type: 'Piercing', range: [30, 90] },
  ],
  parry: 2, multiattack: 2, xp: 450, cr: '2',
};
export const WARRIOR_VETERAN = {
  kind: 'veteran', name: 'Warrior Veteran', emoji: '⚔️', type: 'Medium Humanoid', size: 'medium', creature: 'humanoid',
  ac: 17, hp: 65, hpFormula: '10d8+20', speed: 30,
  abilities: { str: 16, dex: 13, con: 14, int: 10, wis: 11, cha: 10 }, skills: { athletics: 5, perception: 2 },
  attacks: [
    { id: 'greatsword', name: 'Greatsword', kind: 'melee', bonus: 5, dice: '2d6', flat: 3, type: 'Slashing' },
    { id: 'crossbow', name: 'Heavy Crossbow', kind: 'ranged', bonus: 3, dice: '2d10', flat: 1, type: 'Piercing', range: [100, 400] },
  ],
  parry: 2, multiattack: 2, xp: 700, cr: '3',
};
export const HOBGOBLIN_CAPTAIN = {
  kind: 'hobgoblin-captain', name: 'Hobgoblin Captain', emoji: '👺', type: 'Medium Fey (Goblinoid)', size: 'medium', creature: 'fey',
  ac: 17, hp: 58, hpFormula: '9d8+18', speed: 30,
  abilities: { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 13 },
  traits: { authority: true },
  attacks: [
    { id: 'greatsword', name: 'Greatsword', kind: 'melee', bonus: 4, dice: '2d6', flat: 2, type: 'Slashing', extra: [{ dice: '1d6', type: 'Poison' }] },
    { id: 'longbow', name: 'Longbow', kind: 'ranged', bonus: 4, dice: '1d8', flat: 2, type: 'Piercing', extra: [{ dice: '2d4', type: 'Poison' }], range: [150, 600] },
  ],
  multiattack: 2, xp: 700, cr: '3',
};
export const KNIGHT = {
  kind: 'knight', name: 'Knight', emoji: '🛡️', type: 'Medium Humanoid', size: 'medium', creature: 'humanoid',
  ac: 18, hp: 52, hpFormula: '8d8+16', speed: 30,
  abilities: { str: 16, dex: 11, con: 14, int: 11, wis: 11, cha: 15 }, saves: { con: 4, wis: 2 },
  condImmune: ['frightened'],
  attacks: [
    { id: 'greatsword', name: 'Greatsword', kind: 'melee', bonus: 5, dice: '2d6', flat: 3, type: 'Slashing', extra: [{ dice: '1d8', type: 'Radiant' }] },
    { id: 'crossbow', name: 'Heavy Crossbow', kind: 'ranged', bonus: 2, dice: '2d10', flat: 0, type: 'Piercing', extra: [{ dice: '1d8', type: 'Radiant' }], range: [100, 400] },
  ],
  parry: 2, multiattack: 2, xp: 700, cr: '3',
};
export const MAGE = {
  kind: 'mage', name: 'Mage', emoji: '🧙', type: 'Medium Humanoid (Wizard)', size: 'medium', creature: 'humanoid',
  ac: 15, hp: 81, hpFormula: '18d8', speed: 30,
  abilities: { str: 9, dex: 14, con: 11, int: 17, wis: 12, cha: 11 }, saves: { int: 6, wis: 4 }, skills: { arcana: 6, history: 6, perception: 4 },
  attacks: [
    { id: 'burst-ranged', name: 'Arcane Burst', kind: 'ranged', bonus: 6, dice: '3d8', flat: 3, type: 'Force', range: [120, 120] },
    { id: 'burst', name: 'Arcane Burst (melee)', kind: 'melee', bonus: 6, dice: '3d8', flat: 3, type: 'Force' },
  ],
  casting: { ability: 'int', dc: 14, attack: 6, spells: { fireball: { n: 2, level: 4 }, 'cone-of-cold': 1, 'misty-step': 3, shield: 3 } },
  multiattack: 3, xp: 2300, cr: '6',
};
export const OWLBEAR = {
  kind: 'owlbear', name: 'Owlbear', emoji: '🦉', type: 'Large Monstrosity', size: 'large', creature: 'monstrosity',
  ac: 13, hp: 59, hpFormula: '7d10+21', speed: 40,
  abilities: { str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7 }, skills: { perception: 5 },
  attacks: [{ id: 'rend', name: 'Rend', kind: 'melee', bonus: 7, dice: '2d8', flat: 5, type: 'Slashing' }],
  multiattack: 2, xp: 700, cr: '3',
};
export const TROLL = {
  kind: 'troll', name: 'Troll', emoji: '🧌', type: 'Large Giant', size: 'large', creature: 'giant',
  ac: 15, hp: 94, hpFormula: '9d10+45', speed: 30,
  abilities: { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 }, skills: { perception: 5 },
  attacks: [{ id: 'rend', name: 'Rend', kind: 'melee', bonus: 7, dice: '2d6', flat: 4, type: 'Slashing', reach: 10 }],
  regen: 15, multiattack: 3, xp: 1800, cr: '5',
};
export const HILL_GIANT = {
  kind: 'hill-giant', name: 'Hill Giant', emoji: '🗿', type: 'Huge Giant', size: 'huge', creature: 'giant',
  ac: 13, hp: 105, hpFormula: '10d12+40', speed: 40,
  abilities: { str: 21, dex: 8, con: 19, int: 5, wis: 9, cha: 6 }, skills: { perception: 2 },
  attacks: [
    { id: 'club', name: 'Tree Club', kind: 'melee', bonus: 8, dice: '3d8', flat: 5, type: 'Bludgeoning', reach: 10, rider: { prone: 'large' } },
    { id: 'lob', name: 'Trash Lob', kind: 'ranged', bonus: 8, dice: '2d10', flat: 5, type: 'Bludgeoning', range: [60, 240], rider: { poison: true } },
  ],
  multiattack: 2, xp: 1800, cr: '5',
};
export const BLACK_DRAGON_WYRMLING = {
  kind: 'wyrmling', name: 'Black Dragon Wyrmling', emoji: '🐊', type: 'Medium Dragon (Chromatic)', size: 'medium', creature: 'dragon',
  ac: 17, hp: 33, hpFormula: '6d8+6', speed: 30,
  abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 11, cha: 13 }, saves: { dex: 4, wis: 2 }, skills: { perception: 4, stealth: 4 },
  immune: ['Acid'], traits: { amphibious: true },
  attacks: [{ id: 'rend', name: 'Rend', kind: 'melee', bonus: 4, dice: '1d6', flat: 2, type: 'Slashing', extra: [{ dice: '1d4', type: 'Acid' }] }],
  mbreath: { name: 'Acid Breath', recharge: 5, dc: 11, dice: '5d8', type: 'Acid', shape: 'line', size: 15 },
  multiattack: 2, xp: 450, cr: '2',
};
export const YOUNG_BLACK_DRAGON = {
  kind: 'young-dragon', name: 'Young Black Dragon', emoji: '🐉', type: 'Large Dragon (Chromatic)', size: 'large', creature: 'dragon',
  ac: 18, hp: 127, hpFormula: '15d10+45', speed: 40,
  abilities: { str: 19, dex: 14, con: 17, int: 12, wis: 11, cha: 15 }, saves: { dex: 5, wis: 3 }, skills: { perception: 6, stealth: 5 },
  immune: ['Acid'], traits: { amphibious: true },
  attacks: [{ id: 'rend', name: 'Rend', kind: 'melee', bonus: 7, dice: '2d4', flat: 4, type: 'Slashing', reach: 10, extra: [{ dice: '1d6', type: 'Acid' }] }],
  mbreath: { name: 'Acid Breath', recharge: 5, dc: 14, dice: '14d6', type: 'Acid', shape: 'line', size: 30 },
  multiattack: 3, xp: 2900, cr: '7',
};

// Levels 11 to 15 (SRD 5.2.1, CR 8 to 15).
export const ASSASSIN = {
  kind: 'assassin', name: 'Assassin', emoji: '🗡️', type: 'Medium Humanoid', size: 'medium', creature: 'humanoid',
  ac: 16, hp: 97, hpFormula: '15d8+30', speed: 30,
  abilities: { str: 11, dex: 18, con: 14, int: 16, wis: 11, cha: 10 }, saves: { dex: 7, int: 6 }, skills: { acrobatics: 7, perception: 6, stealth: 10 },
  resist: ['Poison'], traits: { evasion: true, nimble: true },
  attacks: [
    { id: 'shortsword', name: 'Shortsword', kind: 'melee', bonus: 7, dice: '1d6', flat: 4, type: 'Piercing', extra: [{ dice: '5d6', type: 'Poison' }], rider: { poison: true } },
    { id: 'crossbow', name: 'Light Crossbow', kind: 'ranged', bonus: 7, dice: '1d8', flat: 4, type: 'Piercing', range: [80, 320], extra: [{ dice: '6d6', type: 'Poison' }] },
  ],
  multiattack: 3, xp: 3900, cr: '8',
};
export const FROST_GIANT = {
  kind: 'frost-giant', name: 'Frost Giant', emoji: '🧊', type: 'Huge Giant', size: 'huge', creature: 'giant',
  ac: 15, hp: 149, hpFormula: '13d12+65', speed: 40,
  abilities: { str: 23, dex: 9, con: 21, int: 9, wis: 10, cha: 12 }, saves: { con: 8, wis: 3, cha: 4 }, skills: { athletics: 9, perception: 3 },
  immune: ['Cold'],
  attacks: [
    { id: 'axe', name: 'Frost Axe', kind: 'melee', bonus: 9, dice: '2d12', flat: 6, type: 'Slashing', reach: 10, extra: [{ dice: '2d8', type: 'Cold' }] },
    { id: 'bow', name: 'Great Bow', kind: 'ranged', bonus: 9, dice: '2d10', flat: 6, type: 'Piercing', range: [150, 600], extra: [{ dice: '2d6', type: 'Cold' }], rider: 'chill' },
  ],
  multiattack: 2, xp: 3900, cr: '8',
};
export const FIRE_GIANT = {
  kind: 'fire-giant', name: 'Fire Giant', emoji: '🔥', type: 'Huge Giant', size: 'huge', creature: 'giant',
  ac: 18, hp: 162, hpFormula: '13d12+78', speed: 30,
  abilities: { str: 25, dex: 9, con: 23, int: 10, wis: 14, cha: 13 }, saves: { dex: 3, con: 10, cha: 5 }, skills: { athletics: 11, perception: 6 },
  immune: ['Fire'],
  attacks: [
    { id: 'sword', name: 'Flame Sword', kind: 'melee', bonus: 11, dice: '4d6', flat: 7, type: 'Slashing', reach: 10, extra: [{ dice: '3d6', type: 'Fire' }] },
    { id: 'hammer', name: 'Hammer Throw', kind: 'ranged', bonus: 11, dice: '3d10', flat: 7, type: 'Bludgeoning', range: [60, 240], extra: [{ dice: '1d8', type: 'Fire' }], rider: { push: 15, shaken: 'Hammer Throw' } },
  ],
  multiattack: 2, xp: 5000, cr: '9',
};
export const BONE_DEVIL = {
  kind: 'bone-devil', name: 'Bone Devil', emoji: '🦂', type: 'Large Fiend (Devil)', size: 'large', creature: 'fiend',
  ac: 16, hp: 161, hpFormula: '17d10+68', speed: 40,
  abilities: { str: 18, dex: 16, con: 18, int: 13, wis: 14, cha: 16 }, saves: { str: 8, int: 5, wis: 6, cha: 7 }, skills: { deception: 7, insight: 6 },
  resist: ['Cold'], immune: ['Fire', 'Poison'], condImmune: ['poisoned'], traits: { magicRes: true },
  attacks: [
    { id: 'claw', name: 'Claw', kind: 'melee', bonus: 8, dice: '2d8', flat: 4, type: 'Slashing', reach: 10 },
    { id: 'sting', perTurn: 1, name: 'Infernal Sting', kind: 'melee', bonus: 8, dice: '2d10', flat: 4, type: 'Piercing', reach: 10, extra: [{ dice: '4d8', type: 'Poison' }], rider: { poison: true, noHeal: true } },
  ],
  multiattack: 3, multiName: 'two Claw attacks and one Infernal Sting', xp: 5000, cr: '9',
};
export const STONE_GOLEM = {
  kind: 'stone-golem', name: 'Stone Golem', emoji: '🗿', type: 'Large Construct', size: 'large', creature: 'construct',
  ac: 18, hp: 220, hpFormula: '21d10+105', speed: 30,
  abilities: { str: 22, dex: 9, con: 20, int: 3, wis: 11, cha: 1 },
  immune: ['Poison', 'Psychic'], condImmune: ['charmed', 'frightened', 'paralyzed', 'petrified', 'poisoned'], traits: { magicRes: true },
  attacks: [
    { id: 'slam', name: 'Slam', kind: 'melee', bonus: 10, dice: '2d8', flat: 6, type: 'Bludgeoning', extra: [{ dice: '2d8', type: 'Force' }] },
    { id: 'bolt', name: 'Force Bolt', kind: 'ranged', bonus: 9, dice: '4d10', flat: 0, type: 'Force', range: [120, 120] },
  ],
  multiattack: 2, xp: 5900, cr: '10',
};
export const ARCHMAGE = {
  kind: 'archmage', name: 'Archmage', emoji: '🧙', type: 'Medium Humanoid (Wizard)', size: 'medium', creature: 'humanoid',
  ac: 17, hp: 170, hpFormula: '31d8+31', speed: 30,
  abilities: { str: 10, dex: 14, con: 12, int: 20, wis: 15, cha: 16 }, saves: { int: 9, wis: 6 }, skills: { arcana: 13, history: 9, perception: 6 },
  traits: { magicRes: true },
  attacks: [
    { id: 'burst-ranged', name: 'Arcane Burst', kind: 'ranged', bonus: 9, dice: '4d10', flat: 5, type: 'Force', range: [150, 150] },
    { id: 'burst', name: 'Arcane Burst (melee)', kind: 'melee', bonus: 9, dice: '4d10', flat: 5, type: 'Force' },
  ],
  casting: { ability: 'int', dc: 17, attack: 9, spells: { 'lightning-bolt': { n: 2, level: 7 }, 'cone-of-cold': { n: 1, level: 9 }, 'misty-step': 3, shield: 3 } },
  multiattack: 4, xp: 8000, cr: '12',
};
export const ADULT_BLACK_DRAGON = {
  kind: 'adult-dragon', name: 'Adult Black Dragon', emoji: '🐉', type: 'Huge Dragon (Chromatic)', size: 'huge', creature: 'dragon',
  ac: 19, hp: 195, hpFormula: '17d12+85', speed: 40,
  abilities: { str: 23, dex: 14, con: 21, int: 14, wis: 13, cha: 19 }, saves: { dex: 7, wis: 6 }, skills: { perception: 11, stealth: 7 },
  immune: ['Acid'], traits: { amphibious: true },
  attacks: [{ id: 'rend', name: 'Rend', kind: 'melee', bonus: 11, dice: '2d6', flat: 6, type: 'Slashing', reach: 10, extra: [{ dice: '1d8', type: 'Acid' }] }],
  mbreath: { name: 'Acid Breath', recharge: 5, dc: 18, dice: '12d8', type: 'Acid', shape: 'line', size: 60 },
  legRes: 3,
  legendary: { uses: 3, options: [
    { id: 'insects', name: 'Cloud of Insects', kind: 'save', ability: 'dex', dc: 17, dice: '4d10', type: 'Poison', range: 120, once: true,
      text: 'Dexterity save DC 17, one creature within 120 feet: 4d10 Poison damage on a failure. Not again until the start of its next turn.' },
    { id: 'pounce', name: 'Pounce', kind: 'strike', move: true, text: 'It moves up to half its Speed and makes one Rend attack.' },
  ] },
  multiattack: 3, xp: 11500, cr: '14',
};
export const MUMMY_LORD = {
  kind: 'mummy-lord', name: 'Mummy Lord', emoji: '🧟', type: 'Medium Undead (Cleric)', size: 'medium', creature: 'undead',
  ac: 17, hp: 187, hpFormula: '25d8+75', speed: 30,
  abilities: { str: 18, dex: 10, con: 17, int: 11, wis: 19, cha: 16 }, saves: { int: 5, wis: 9 }, skills: { history: 5, perception: 9, religion: 5 },
  vuln: ['Fire'], immune: ['Necrotic', 'Poison'], condImmune: ['charmed', 'frightened', 'paralyzed', 'poisoned'], traits: { magicRes: true },
  attacks: [
    { id: 'fist', name: 'Rotting Fist', kind: 'melee', bonus: 9, dice: '2d10', flat: 4, type: 'Bludgeoning', extra: [{ dice: '3d6', type: 'Necrotic' }], rider: { noHeal: 'curse' } },
    { id: 'channel', name: 'Channel Negative Energy', kind: 'ranged', bonus: 9, dice: '6d6', flat: 4, type: 'Necrotic', range: [60, 60] },
  ],
  glare: { name: 'Dreadful Glare', ability: 'wis', dc: 17, dice: '6d6', flat: 4, type: 'Psychic', range: 60 },
  parry: 2, parryName: 'Whirlwind of Sand', parryAny: true,
  legRes: 3,
  legendary: { uses: 3, options: [
    { id: 'glare', name: 'Glare', kind: 'glare', once: true, text: 'It uses Dreadful Glare. Not again until the start of its next turn.' },
    { id: 'strike', name: 'Necrotic Strike', kind: 'strike', text: 'It makes one Rotting Fist or Channel Negative Energy attack.' },
  ] },
  multiattack: 1, multiName: 'one Rotting Fist or Channel Negative Energy attack, and uses Dreadful Glare', xp: 13000, cr: '15',
};

export const VAMPIRE = {
  kind: 'vampire', name: 'Vampire', emoji: '🧛', type: 'Medium Undead', size: 'medium', creature: 'undead',
  ac: 16, hp: 195, hpFormula: '23d8+92', speed: 40,
  abilities: { str: 18, dex: 18, con: 18, int: 17, wis: 15, cha: 18 }, saves: { dex: 9, wis: 7, cha: 9 }, skills: { perception: 7, stealth: 9 },
  resist: ['Necrotic'], traits: { spiderClimb: true },
  attacks: [
    { id: 'grave', name: 'Grave Strike', kind: 'melee', bonus: 9, dice: '1d8', flat: 4, type: 'Bludgeoning', extra: [{ dice: '2d6', type: 'Necrotic' }], rider: { grapple: 14, size: 'large' } },
  ],
  drain: { name: 'Bite', dc: 17, dice: '3d8', flat: 0, type: 'Necrotic', needsHeld: true, heal: true },
  legRes: 3,
  legendary: { uses: 3, options: [
    { id: 'deathless', name: 'Deathless Strike', kind: 'strike', move: true, text: 'It moves up to half its Speed and makes one Grave Strike attack.' },
  ] },
  multiattack: 3, multiName: 'two Grave Strike attacks and uses Bite (here: Bite replaces one of the three)', xp: 10000, cr: '13',
};
export const IRON_GOLEM = {
  kind: 'iron-golem', name: 'Iron Golem', emoji: '⚙️', type: 'Large Construct', size: 'large', creature: 'construct',
  ac: 20, hp: 252, hpFormula: '24d10+120', speed: 30,
  abilities: { str: 24, dex: 9, con: 20, int: 3, wis: 11, cha: 1 },
  immune: ['Fire', 'Poison', 'Psychic'], condImmune: ['charmed', 'frightened', 'paralyzed', 'petrified', 'poisoned'], traits: { magicRes: true },
  absorb: ['Fire'], absorbName: 'Fire Absorption',
  attacks: [
    { id: 'arm', name: 'Bladed Arm', kind: 'melee', bonus: 12, dice: '3d8', flat: 7, type: 'Slashing', reach: 10, extra: [{ dice: '3d6', type: 'Fire' }] },
    { id: 'bolt', name: 'Fiery Bolt', kind: 'ranged', bonus: 10, dice: '8d8', flat: 0, type: 'Fire', range: [120, 120] },
  ],
  mbreath: { name: 'Poison Breath', recharge: 6, ability: 'con', dc: 18, dice: '10d10', type: 'Poison', shape: 'cone', size: 60 },
  multiattack: 2, multiName: 'two attacks, using Bladed Arm or Fiery Bolt in any mix', xp: 15000, cr: '16',
};
export const BALOR = {
  kind: 'balor', name: 'Balor', emoji: '👹', type: 'Huge Fiend (Demon)', size: 'huge', creature: 'fiend',
  ac: 19, hp: 287, hpFormula: '23d12+138', speed: 40,
  abilities: { str: 26, dex: 15, con: 22, int: 20, wis: 16, cha: 22 }, saves: { con: 12, wis: 9 }, skills: { perception: 9 },
  resist: ['Cold', 'Lightning'], immune: ['Fire', 'Poison'], condImmune: ['charmed', 'frightened', 'poisoned'], traits: { magicRes: true },
  sight: 120,
  attacks: [
    { id: 'whip', perTurn: 1, name: 'Flame Whip', kind: 'melee', bonus: 14, dice: '3d6', flat: 8, type: 'Force', reach: 30, extra: [{ dice: '5d6', type: 'Fire' }], rider: { pull: 25 } },
    { id: 'blade', perTurn: 1, name: 'Lightning Blade', kind: 'melee', bonus: 14, dice: '3d8', flat: 8, type: 'Force', reach: 10, extra: [{ dice: '4d10', type: 'Lightning' }], rider: { noReact: true } },
  ],
  aura: { name: 'Fire Aura', dice: '3d8', type: 'Fire' },
  throes: { dc: 20, size: 30, dice: '9d6', type: 'Fire', also: { dice: '9d6', type: 'Force' } },
  legRes: 3,
  multiattack: 2, multiName: 'one Flame Whip and one Lightning Blade attack', xp: 22000, cr: '19',
};
export const PIT_FIEND = {
  kind: 'pit-fiend', name: 'Pit Fiend', emoji: '😈', type: 'Large Fiend (Devil)', size: 'large', creature: 'fiend',
  ac: 21, hp: 337, hpFormula: '27d10+189', speed: 30,
  abilities: { str: 26, dex: 14, con: 24, int: 22, wis: 18, cha: 24 }, saves: { dex: 8, wis: 10 }, skills: { perception: 10, persuasion: 19 },
  resist: ['Cold'], immune: ['Fire', 'Poison'], condImmune: ['poisoned'], traits: { magicRes: true },
  sight: 120,
  attacks: [
    { id: 'bite', perTurn: 1, name: 'Bite', kind: 'melee', bonus: 14, dice: '3d6', flat: 8, type: 'Piercing', reach: 10, rider: { poison: true, noHeal: true } },
    { id: 'claw', perTurn: 2, name: 'Devilish Claw', kind: 'melee', bonus: 14, dice: '4d8', flat: 8, type: 'Necrotic', reach: 10 },
    { id: 'mace', perTurn: 1, name: 'Fiery Mace', kind: 'melee', bonus: 14, dice: '4d6', flat: 8, type: 'Force', reach: 10, extra: [{ dice: '6d6', type: 'Fire' }] },
  ],
  fearAura: { size: 20, dc: 21 },
  casting: { ability: 'cha', dc: 21, attack: 13, spells: { fireball: { n: 2, level: 5 } }, note: '(Here: its Hellfire Spellcasting is played as two Fireballs a day.)' },
  legRes: 4,
  multiattack: 4, multiName: 'one Bite, two Devilish Claw and one Fiery Mace attack', xp: 25000, cr: '20',
};
export const LICH = {
  kind: 'lich', name: 'Lich', emoji: '💀', type: 'Medium Undead (Wizard)', size: 'medium', creature: 'undead',
  ac: 20, hp: 315, hpFormula: '42d8+126', speed: 30,
  abilities: { str: 11, dex: 16, con: 16, int: 21, wis: 14, cha: 16 }, saves: { dex: 10, con: 10, int: 12, wis: 9 }, skills: { arcana: 19, history: 12, insight: 9, perception: 9 },
  resist: ['Cold', 'Lightning'], immune: ['Necrotic', 'Poison'], condImmune: ['charmed', 'frightened', 'paralyzed', 'poisoned'],
  sight: 120,
  attacks: [
    { id: 'burst-ranged', name: 'Eldritch Burst', kind: 'ranged', bonus: 12, dice: '4d12', flat: 5, type: 'Force', range: [120, 120] },
    { id: 'burst', name: 'Eldritch Burst (melee)', kind: 'melee', bonus: 12, dice: '4d12', flat: 5, type: 'Force' },
    { id: 'touch', name: 'Paralyzing Touch', kind: 'melee', bonus: 12, dice: '3d6', flat: 5, type: 'Cold', rider: { paralyze: { auto: true } } },
  ],
  casting: { ability: 'int', dc: 20, attack: 12, spells: { fireball: { n: 99, level: 5 }, 'chain-lightning': 1, 'finger-of-death': 1, shield: 99 } },
  legRes: 4,
  legendary: { uses: 3, options: [
    { id: 'disrupt', name: 'Disrupt Life', kind: 'emanation', ability: 'con', dc: 20, dice: '9d6', type: 'Necrotic', size: 20, once: true,
      text: 'Constitution save DC 20, each creature that isn\'t Undead within 20 feet: 9d6 Necrotic damage on a failure, half on a success. Not again until the start of its next turn.' },
    { id: 'deathly', name: 'Deathly Teleport', kind: 'deathly', range: 60, burst: 10, dice: '2d10', type: 'Necrotic',
      text: 'It teleports up to 60 feet to a space it can see, and each creature within 10 feet of the space it left takes 2d10 Necrotic damage.' },
  ] },
  multiattack: 3, multiName: 'three attacks, using Eldritch Burst or Paralyzing Touch in any mix', xp: 33000, cr: '21',
};
export const ANCIENT_BLACK_DRAGON = {
  kind: 'ancient-dragon', name: 'Ancient Black Dragon', emoji: '🐲', type: 'Gargantuan Dragon (Chromatic)', size: 'gargantuan', creature: 'dragon',
  ac: 22, hp: 367, hpFormula: '21d20+147', speed: 40,
  abilities: { str: 27, dex: 14, con: 25, int: 16, wis: 15, cha: 22 }, saves: { dex: 9, wis: 9 }, skills: { perception: 16, stealth: 9 },
  immune: ['Acid'], traits: { amphibious: true },
  attacks: [{ id: 'rend', name: 'Rend', kind: 'melee', bonus: 15, dice: '2d8', flat: 8, type: 'Slashing', reach: 15, extra: [{ dice: '2d8', type: 'Acid' }] }],
  mbreath: { name: 'Acid Breath', recharge: 5, dc: 22, dice: '15d8', type: 'Acid', shape: 'line', size: 90 },
  legRes: 4,
  legendary: { uses: 3, options: [
    { id: 'insects', name: 'Cloud of Insects', kind: 'save', ability: 'dex', dc: 21, dice: '6d10', type: 'Poison', range: 120, once: true,
      text: 'Dexterity save DC 21, one creature within 120 feet: 6d10 Poison damage on a failure. Not again until the start of its next turn.' },
    { id: 'pounce', name: 'Pounce', kind: 'strike', move: true, text: 'It moves up to half its Speed and makes one Rend attack.' },
  ] },
  multiattack: 3, xp: 33000, cr: '21',
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
