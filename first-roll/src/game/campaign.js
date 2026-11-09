// The campaign: scenes for chapters 2 to 16 (chapter 0, the dice lesson, and
// chapter 1, making your hero, happen in the lobby). Scene kinds:
//   story  text + choices the party votes on. A choice can need a flag
//          (`requires`) and can set flags (`flags`).
//   check  text + a skill check; success and failure lead on with flags
//   save   text + a saving throw every hero makes; a failure has an effect
//          that lasts (`effect`: 'poisoned' until a Long Rest, or 'exhaustion')
//   fight  an encounter from encounters.js; victory goes to `next`
//   rest   a Short Rest (spend Hit Point Dice) or a Long Rest
//   level  everyone goes up to `level`
//   end    the end of the campaign
// `lesson` lines are the rules the scene teaches, shown beside the story.

import { defaultSpec } from '../rules/character.js';

export const CHAPTERS = {
  2: { title: 'Your First Fight', teaches: ['initiative', 'your-turn', 'attack-roll', 'damage'] },
  3: { title: 'Weapon Mastery and Teamwork', teaches: ['weapon-mastery', 'help', 'multiattack', 'group-check', 'long-rest'] },
  4: { title: 'High Ground', teaches: ['cover', 'line-of-sight', 'opportunity-attack', 'prone'] },
  5: { title: 'Asking Around', teaches: ['skills', 'level-up'] },
  6: { title: 'Magic in the Cellar', teaches: ['spell-slots', 'concentration', 'saving-throw'] },
  7: { title: 'Bad Air and Worse Company', teaches: ['poisoned', 'restrained', 'grappled', 'short-rest'] },
  8: { title: 'The Barrow', teaches: ['subclass', 'level-up', 'concentration'] },
  9: { title: 'The Lacey Vault', teaches: ['ability-score-improvement', 'paralyzed', 'immunity', 'surprise'] },
  10: { title: 'The North Road', teaches: ['extra-attack', 'spell-slots', 'pack-tactics', 'prone'] },
  11: { title: 'Thursby Hall', teaches: ['life-drain', 'resistance', 'immunity', 'group-check'] },
  12: { title: 'The Toll Keep', teaches: ['aura-of-authority', 'parry', 'advantage', 'skills'] },
  13: { title: 'Coldharbour', teaches: ['monster-spells', 'areas', 'cover', 'evasion'] },
  14: { title: 'Gallow Causeway', teaches: ['regeneration', 'surprise', 'reach', 'ability-score-improvement'] },
  15: { title: "The Giant's Yard", teaches: ['reach', 'prone', 'poisoned', 'group-check'] },
  16: { title: 'The Black Water', teaches: ['recharge', 'immunity', 'divine-intervention', 'areas'] },
};

// AI companions fill empty seats. Each has a fixed build.
export const COMPANIONS = [
  { id: 'c1', name: 'Tomas', spec: defaultSpec('cleric', { species: 'dwarf', background: 'acolyte' }) },
  { id: 'c2', name: 'Dagny', spec: defaultSpec('fighter', { species: 'human', background: 'soldier' }) },
  { id: 'c3', name: 'Ilse', spec: defaultSpec('wizard', { species: 'gnome', background: 'sage' }) },
  { id: 'c4', name: 'Pip', spec: defaultSpec('rogue', { species: 'halfling', background: 'criminal' }) },
];

export const FIRST_SCENE = 'c2-mill';

export const SCENES = {
  'c2-mill': {
    chapter: 2, kind: 'story', title: 'The Mill at Dunmarket',
    text: [
      "Agnes Pell runs the mill on the edge of Dunmarket, and she is two flour carts short. Goblins took them on the road to market, one last week and one three days ago, mules and all.",
      'She drops a purse of silver on a barrel. "Twelve silver each if tomorrow\'s cart reaches the market square before the noon bell. The bakers buy from whoever gets there first. If it isn\'t me again, I\'m finished."',
      "The cart is loaded. Its mule, a grey named Biscuit, is chewing the corner of a flour sack. There are two ways to market.",
    ],
    choices: [
      { id: 'woods', label: "Cut through Hagger Woods. It's faster, but it's where both carts were taken.", next: 'c2-woods' },
      { id: 'river', label: 'Take the river road. It adds an hour, but it runs through open country.', next: 'c2-river' },
    ],
    lesson: "The party decides together. Everyone with a hero votes; if it's a tie, the host's vote wins.",
  },
  'c2-woods': {
    chapter: 2, kind: 'check', title: 'Hagger Woods',
    text: [
      'The road through Hagger Woods narrows until the cart scrapes bark on both sides. Biscuit keeps stopping with his ears up. Ahead of you a branch cracks, louder than any bird could make it.',
      'Somebody needs to look hard at those trees before you roll the cart past them.',
    ],
    check: { skill: 'perception', dc: 12, mode: 'single', prompt: 'Who keeps watch?' },
    success: {
      text: 'There, behind a holly bush: a scrap of red cloth and the edge of a rusty blade. Goblins, crouched and waiting. You spot them first, and now they are the ones about to be surprised.',
      next: 'c2-fight', flags: { surprise: 'foes' },
    },
    fail: {
      text: 'You see leaves and more leaves until an arrow thunks into the cart a hand\'s width from your fingers. Goblins come shrieking out of the brambles.',
      next: 'c2-fight', flags: { surprise: 'heroes' },
    },
    lesson: 'An ability check: roll a d20 and add the skill modifier. Meet the Difficulty Class (DC) to succeed. A friend who is proficient in the skill can Help, which gives Advantage.',
  },
  'c2-river': {
    chapter: 2, kind: 'story', title: 'The River Road',
    text: [
      'The river road is wide and muddy, and the extra hour feels like three. Near the old ford, the reeds part and small figures with rusty blades step onto the road between you and Dunmarket.',
      "They want the flour. The biggest one points at Biscuit and licks its lips, and you're fairly sure it means the mule too.",
    ],
    choices: [{ id: 'fight', label: 'Draw your weapons.', next: 'c2-fight' }],
  },
  'c2-fight': {
    chapter: 2, kind: 'fight', title: 'Goblin Ambush', encounter: 'road', next: 'c2-after',
    lesson: 'Your first fight. On your turn you can move and take one action, usually an attack. Tap a goblin to see your chance to hit, and tap any roll to see why it came out that way.',
  },
  'c2-after': {
    chapter: 2, kind: 'story', title: 'Spilled Flour',
    text: [
      'When the last goblin falls, Biscuit goes back to eating his sack. In the mud where the fight was, you find an empty flour bag stamped AGNES PELL in blue ink. It came off one of the stolen carts.',
      'A line of spilled flour runs off the road and up into the hills, white on the dark ground and easy to follow. If her flour is up there, Agnes could have three carts at market tomorrow instead of one.',
    ],
    choices: [{ id: 'follow', label: 'Follow the flour into the hills.', next: 'c3-camp' }],
    lesson: 'Chapter 2 done: you rolled Initiative, took turns, and made attack rolls. Next: teamwork.',
  },
  'c3-camp': {
    chapter: 3, kind: 'story', title: 'The Goblin Camp',
    text: [
      "The flour trail climbs into a ravine and ends at a goblin camp: a ring of hide tents, a smoky cookfire, and both of Agnes's stolen carts with the sacks still piled in the back.",
      "A goblin in a dented helmet two sizes too big is shouting at the others to hurry up and eat. That's the boss. It has a scimitar on its belt and a bow across its back.",
    ],
    choices: [
      { id: 'sneak', label: 'Creep up together. (Everyone makes a Stealth check.)', next: 'c3-sneak' },
      { id: 'demand', label: 'Walk straight in and order them to hand it back. (One hero makes an Intimidation check.)', next: 'c3-demand' },
    ],
    lesson: 'Different plans need different skills. Check who in the party is good at what: tap a hero to see their sheet.',
  },
  'c3-sneak': {
    chapter: 3, kind: 'check', title: 'Creeping Up',
    text: ['You spread out and pick your way down the ravine, one careful step at a time, toward the edge of the firelight.'],
    check: { skill: 'stealth', dc: 12, mode: 'group', prompt: 'Everyone rolls Stealth.' },
    success: {
      text: "You're crouched behind the carts before any goblin looks up from its bowl. The boss is still mid-shout when you move.",
      next: 'c3-fight', flags: { surprise: 'foes' },
    },
    fail: {
      text: 'Somebody kicks a loose stone. It clatters all the way down to the cookfire, and every goblin in camp grabs a weapon.',
      next: 'c3-fight', flags: {},
    },
    lesson: 'A group check: everyone rolls, and the group succeeds if at least half of you do. The sneaky can carry the clumsy.',
  },
  'c3-demand': {
    chapter: 3, kind: 'check', title: 'Making Demands',
    text: ['You stride into the firelight. Every goblin freezes with its spoon halfway to its mouth. One of you steps forward to do the talking.'],
    check: { skill: 'intimidation', dc: 13, mode: 'single', prompt: 'Who does the talking?' },
    success: {
      text: "The boss's jaw drops. For two whole seconds nobody in camp moves, and two seconds is plenty.",
      next: 'c3-fight', flags: { surprise: 'foes' },
    },
    fail: {
      text: 'The boss bangs its helmet with a ladle and laughs. Goblins pour out of every tent, and the first arrows are already in the air.',
      next: 'c3-fight', flags: { surprise: 'heroes' },
    },
    lesson: 'Intimidation is a Charisma check. Proficiency makes a big difference: compare your party\'s modifiers before you pick.',
  },
  'c3-fight': {
    chapter: 3, kind: 'fight', title: 'The Goblin Boss', encounter: 'camp', next: 'c3-end',
    lesson: 'Teamwork. Weapon Mastery adds an effect to each hit, Help gives a friend Advantage, and healing keeps people standing. Watch the Boss: it attacks twice, and it can pull a goblin in front of itself.',
  },
  'c3-end': {
    chapter: 3, kind: 'story', title: 'Market Day',
    text: [
      `The Goblin Boss's helmet rolls into the cookfire, and the rest of the morning is hauling. You hitch the stolen carts behind Biscuit's and get down the hill as the noon bell starts to ring.`,
      `Agnes Pell is standing in the market square with her arms folded. When she counts three carts instead of one, she unfolds them. She pays the twelve silver each, then adds a second purse for the flour you brought back.`,
      `The reeve of Dunmarket, Martin Ebbs, has been waiting for her to finish. He is a thin, worried man with ink on his cuffs. "Forty sacks gone from three mills since harvest," he says. "That's more than any goblin band could eat. And the Kipps girl swears there are lights in the old watchtower on Crowsfoot Hill, where nobody has lived for sixty years."`,
      `He offers fifty silver to whoever finds out who is up there, and what they want with all that flour.`,
    ],
    choices: [{ id: 'job', label: "Take the reeve's job, and set out in the morning.", next: 'c3-rest' }],
    lesson: 'Chapter 3 done: Weapon Mastery, Help, Multiattack and group checks. Next: where you stand matters as much as how hard you hit.',
  },
  'c3-rest': {
    chapter: 3, kind: 'rest', rest: 'long', title: 'A Night at the Mill', next: 'c4-hill',
    text: [
      `Agnes Pell won't hear of you paying for a room at the inn. She puts you in the loft over her mill, where the floorboards hum every time the wheel turns, and sends her son up the ladder with bread, a pot of mutton stew and a lantern. He stays to ask how big the Goblin Boss was. You tell him, and he goes back down grinning.`,
      `Whoever was knocked flat in the goblin camp gets the softest pile of sacks. In the morning Agnes hands each of you a heel of bread for the walk and points north, past the millpond, to Crowsfoot Hill.`,
    ],
    lesson: 'A Long Rest: 8 hours, most of them asleep. You wake with all your Hit Points, all your spent Hit Point Dice and all your spell slots, and features that last until a Long Rest come back too. Anyone who dropped to 0 in the last fight is properly back on their feet.',
  },

  // ------------------------------------------------ chapter 4: High Ground
  'c4-hill': {
    chapter: 4, kind: 'story', title: 'Crowsfoot Hill',
    text: [
      `Crowsfoot Hill is sheep country: short grass, grey rocks and a tumbledown field wall that zigzags up toward the tower on top. The tower is square and roofless at one corner, but a window near the top has new shutters.`,
      `Halfway up you pass a dead ewe, torn open, with big paw prints in the mud around it. Then a goblin pops up from behind the field wall ahead, sees you, yelps and ducks down again. Uphill a wolf starts howling, and a second one joins in.`,
      `The wall stands between you and them, waist high. Whoever is behind it is harder to hit, and the wolves are coming through the gap in the middle.`,
    ],
    choices: [{ id: 'up', label: 'Spread out and go up the hill.', next: 'c4-fight' }],
    lesson: 'Cover: a low wall, or another creature, between an attacker and the target gives Half Cover: +2 to AC and to Dexterity saves. A solid wall blocks line of sight, and you can only target what you can see.',
  },
  'c4-fight': {
    chapter: 4, kind: 'fight', title: 'The Field Wall', encounter: 'wall', next: 'c4-after',
    lesson: 'Low walls give Half Cover but block movement; solid walls block sight. Shooting from next to an enemy gives you Disadvantage, and leaving an enemy\'s reach provokes an Opportunity Attack. A wolf\'s bite can knock you Prone: standing up costs half your Speed.',
  },
  'c4-after': {
    chapter: 4, kind: 'story', title: 'Brass Lanterns',
    text: [
      `Each wolf wore a leather collar with a little brass lantern hanging from it. Somebody has been keeping these wolves and feeding them, and from the state of that ewe, they've been feeding them on other people's sheep.`,
      `One of the goblins had a half-empty sack on its back, stamped AGNES PELL in blue ink. While you're looking at it, a girl with a shepherd's crook comes running up the slope from a hut on the far side of the hill, shouting at you to wait.`,
    ],
    choices: [{ id: 'hut', label: 'Wait for her.', next: 'c5-hut' }],
    lesson: 'Chapter 4 done: cover, line of sight, Opportunity Attacks and Prone. Next: the skills you use when nobody is swinging at you.',
  },

  // ---------------------------------------------- chapter 5: Asking Around
  'c5-hut': {
    chapter: 5, kind: 'story', title: 'Nell Kipps',
    text: [
      `Nell Kipps is fourteen, and she has been minding her family's flock alone since her father broke his leg at harvest. She has lost six ewes to those wolves, and she wants you to know every one of their names.`,
      `"They come down from the tower at night," she says. "Grey cloaks, four or five of them, and a woman in front with a lantern. They go round the back of the hill with sacks and come back without them. Last night they had shovels." She points. "Round the back's all gorse. I've never found where they go."`,
    ],
    choices: [
      { id: 'search', label: 'Search the back of the hill for where the sacks go. (One hero makes an Investigation check.)', next: 'c5-search' },
      { id: 'talk', label: 'Wait at the tower door and talk to whoever comes out. (One hero makes a Persuasion check.)', next: 'c5-talk' },
    ],
    lesson: 'Out of a fight, the story moves on skills. Investigation is Intelligence: working out where something must be. Persuasion is Charisma: getting someone to want to help you.',
  },
  'c5-search': {
    chapter: 5, kind: 'check', title: 'Round the Back',
    text: [`The back of Crowsfoot Hill is gorse, loose stones and sheep droppings. People carrying heavy sacks every night must have left a path, if you can work out where to look.`],
    check: { skill: 'investigation', dc: 13, mode: 'single', prompt: 'Who searches?' },
    success: {
      text: `The gorse at the foot of one slope has been cut down and propped back up with sticks. Behind it is a wooden door set into the hillside, with oiled hinges and flour dust ground into the step. You can go in this way tonight without anyone in the tower seeing you.`,
      next: 'c5-rest', flags: { door: true },
    },
    fail: {
      text: `By dusk you have found a broken shovel handle, a lot of thorns and no door. Wherever the sacks go, you'll have to go in through the front of the tower to find it.`,
      next: 'c5-rest', flags: {},
    },
    lesson: 'Investigation is an Intelligence check. A failure still moves the story on; it just moves it somewhere harder.',
  },
  'c5-talk': {
    chapter: 5, kind: 'check', title: 'The Boy with the Buckets',
    text: [`At dusk the tower door opens and a young man in a grey cloak comes out with two empty buckets, heading for the spring. He's about seventeen, and he nearly drops both buckets when he sees you waiting.`],
    check: { skill: 'persuasion', dc: 12, mode: 'single', prompt: 'Who does the talking?' },
    success: {
      text: `He's Wat Hobb, the cooper's son from Dunmarket, and once he starts talking he can't stop. "Corva says the soldiers from the old war are buried under this hill, a hundred of them, and if she wakes them they'll guard the town and the Baron can't tax us for soldiers any more. The flour's for us, there's thirty of us up there now. She finishes the rite tomorrow night." He swallows. "You should hear what comes out of that cellar at night, though. There's a back door, under the gorse. I'm going home."`,
      next: 'c5-rest', flags: { door: true },
    },
    fail: {
      text: `He drops the buckets and runs back inside yelling "Corva! There's people outside!" Shutters bang open all the way up the tower. They know someone is coming now.`,
      next: 'c5-rest', flags: {},
    },
    lesson: 'Persuasion is a Charisma check. The DC depends on what you ask: getting a frightened boy to tell you what he knows is DC 12.',
  },
  'c5-rest': {
    chapter: 5, kind: 'rest', rest: 'long', title: 'A Night at the Hut', next: 'c5-level',
    text: [
      `Nell's father, his leg strapped between two planks, insists you take the beds and sleeps in his chair by the fire. In the morning Nell makes porridge, refuses your money, and tells you the names of the six ewes again.`,
    ],
    lesson: 'Another Long Rest: Hit Points, Hit Point Dice, spell slots and features all come back. You get the benefit of only one Long Rest in 24 hours, so it takes a day on the road to earn the next one.',
  },
  'c5-level': {
    chapter: 5, kind: 'level', level: 2, title: 'Level 2', next: 'c6-night',
    text: [`You've fought goblins and wolves and tracked them home. Everyone in the party reaches level 2.`],
    lesson: 'Leveling up: your Hit Point maximum goes up by your Hit Die\'s fixed value (half the die, plus one) plus your Constitution modifier, and you gain your class\'s level 2 features. Tap your hero to see what\'s new.',
  },

  // ------------------------------------------ chapter 6: Magic in the Cellar
  'c6-night': {
    chapter: 6, kind: 'story', title: 'After Dark',
    text: [
      `You go back up Crowsfoot Hill after dark. The shutters on the top floor of the tower glow orange, and somebody up there is singing, badly.`,
    ],
    choices: [
      { id: 'back', label: 'Go in by the door under the gorse.', requires: 'door', next: 'c6-crypt', flags: { surprise: 'foes' } },
      { id: 'front', label: 'Go in the front of the tower and find the way down. (Everyone makes a Stealth check.)', next: 'c6-front' },
    ],
    lesson: 'Choices can depend on what you found out earlier.',
  },
  'c6-front': {
    chapter: 6, kind: 'check', title: 'Past the Sleepers',
    text: [`The ground floor is a storeroom full of flour sacks and bedrolls, and most of the bedrolls have someone snoring in them. A ladder goes down through a trapdoor in the far corner.`],
    check: { skill: 'stealth', dc: 12, mode: 'group', prompt: 'Everyone rolls Stealth.' },
    success: {
      text: `You step between the sleepers one at a time and climb down the ladder without waking anyone.`,
      next: 'c6-crypt', flags: {},
    },
    fail: {
      text: `Somebody treads on a hand. Its owner shrieks, and by the time you're down the ladder, someone in the cellar is shouting orders.`,
      next: 'c6-crypt', flags: { surprise: 'heroes' },
    },
    lesson: 'A group check again: if at least half of you succeed, the group does.',
  },
  'c6-crypt': {
    chapter: 6, kind: 'story', title: 'The Cellar',
    text: [
      `Under the tower is a long vaulted cellar dug into the hill. Graves have been opened along both walls, and the dirt from them is heaped between stone tombs. Three people in grey are digging by lantern light.`,
      `In a corner stand the skeletons they have already dug up, in rusted helmets, holding short swords and bows. When one of the diggers sees you and shouts, the skeletons turn their heads toward you all at once.`,
    ],
    choices: [{ id: 'fight', label: 'Fight.', next: 'c6-fight' }],
    lesson: 'Spells that need Concentration last until you stop, cast another Concentration spell, or fail a Constitution save after taking damage (DC 10, or half the damage if that is higher).',
  },
  'c6-fight': {
    chapter: 6, kind: 'fight', title: 'Diggers and Bones', encounter: 'crypt', next: 'c6-after',
    lesson: 'Magic. Each spell slot is spent when you cast, and you can cast a spell with a higher slot for a stronger effect. You can spend only one spell slot per turn. Skeletons take double damage from Bludgeoning weapons.',
  },
  'c6-after': {
    chapter: 6, kind: 'story', title: 'The Tunnel',
    text: [
      `The last skeleton falls apart into a heap of bones and rusty mail. Up through the ceiling you can hear people running, and a door being barred.`,
      `At the far end of the cellar, the newest grave goes deeper than the others. It's a tunnel, sloping down into the hill, and the air coming up it smells of mold and rotten meat. A trodden path of flour dust and boot prints leads down into it. Whoever the woman with the lantern is, the rest of the old soldiers are down there with her.`,
    ],
    choices: [{ id: 'down', label: 'Go down the tunnel.', next: 'c7-tunnel' }],
    lesson: 'Chapter 6 done: spell slots, upcasting, Concentration and saving throws.',
  },

  // ----------------------------------- chapter 7: Bad Air and Worse Company
  'c7-tunnel': {
    chapter: 7, kind: 'save', title: 'Yellow Mold', next: 'c7-rest',
    text: [`The tunnel drops steeply, and soon you're walking bent double between walls furred with yellow mold. Somebody's shoulder brushes it. A cloud of yellow spores puffs up, and everyone breathes it in.`],
    save: { ability: 'con', dc: 11, effect: 'poisoned', prompt: 'Everyone rolls a Constitution saving throw.' },
    pass: `Your eyes stream and you cough until it hurts, but it passes.`,
    fail: `Your stomach turns over and your hands won't stop shaking. You're Poisoned until you get a Long Rest.`,
    lesson: 'A saving throw: roll a d20 and add the ability modifier, plus your Proficiency Bonus if your class is proficient in that save. Poisoned: Disadvantage on attack rolls and ability checks.',
  },
  'c7-rest': {
    chapter: 7, kind: 'rest', rest: 'short', title: 'Catching Your Breath', next: 'c7-nest',
    text: [`Past the mold, the tunnel widens into a dry side cave with a trickle of clean water running down one wall. Further on, the tunnel is hung with old cobwebs, and something has dragged a sheep along the floor. There's time to catch your breath first.`],
    lesson: 'A Short Rest is an hour. Spend Hit Point Dice to heal: roll each one and add your Constitution modifier. Some features come back, like Second Wind and Channel Divinity, and a Wizard can use Arcane Recovery.',
  },
  'c7-nest': {
    chapter: 7, kind: 'story', title: 'The Nest',
    text: [
      `The tunnel opens into a cave strung with webs as thick as rope. Bundles wrapped in silk hang from them, most of them sheep-shaped. On the ceiling, something the size of a pony shifts its legs.`,
      `Between you and the far tunnel, dead soldiers stand in their rotten armor, the ones Corva's diggers have already woken. Behind the webs, something heavy gets up off a crate.`,
    ],
    choices: [{ id: 'fight', label: 'Fight your way through.', next: 'c7-fight' }],
  },
  'c7-fight': {
    chapter: 7, kind: 'fight', title: 'Webs and Worse', encounter: 'nest', next: 'c8-level',
    lesson: 'Conditions. A web Restrains you: Speed 0, Disadvantage on your attacks and Dexterity saves, and attacks against you have Advantage. Attack the web (AC 10, 5 HP) or burn it. A Bugbear can Grapple you: Speed 0 until you escape with an Athletics or Acrobatics check against its DC. Zombies try to stay standing at 1 HP (Undead Fortitude).',
  },
  // -------------------------------------------------- chapter 8: The Barrow
  'c8-level': {
    chapter: 8, kind: 'level', level: 3, title: 'Level 3', next: 'c8-rest',
    text: [`You've come deeper under Crowsfoot Hill than anyone from Dunmarket in sixty years. Everyone in the party reaches level 3, and each class picks up its subclass.`],
    lesson: 'At level 3 every class gains a subclass: Champion (Fighter), Thief (Rogue), Life Domain (Cleric), Evoker (Wizard), Path of the Berserker (Barbarian), College of Lore (Bard), Circle of the Land (Druid), Warrior of the Open Hand (Monk), Oath of Devotion (Paladin), Hunter (Ranger), Draconic Sorcery (Sorcerer) and Fiend Patron (Warlock). Tap your hero to see the new features.',
  },
  'c8-rest': {
    chapter: 8, kind: 'rest', rest: 'short', title: 'Before the Barrow', next: 'c8-barrow',
    text: [`Beyond the nest the tunnel levels out. Somewhere ahead you can hear shovels, and a woman's voice reading aloud. You stop to bind your wounds before you go on.`],
    lesson: 'Another Short Rest. Hit Point Dice you have already spent stay spent until a Long Rest.',
  },
  'c8-barrow': {
    chapter: 8, kind: 'story', title: 'The Barrow',
    text: [
      `The tunnel ends in a long burial chamber with a stone roof on square pillars. The soldiers of the old war lie along both sides in rows, in their armor, more than you can count.`,
      `In the middle, a woman in a grey cloak stands on an upturned cart with a lantern held high, reading from a book. Her followers chant "Corva!" between the lines, and each time they do, another dead soldier sits up.`,
      `Corva Lund stops reading when she sees you. "Did Ebbs send you? Good. You can go back and tell him the town will never need the Baron's men again."`,
    ],
    choices: [
      { id: 'sway', label: 'Talk to her followers, not to her. (One hero makes a Persuasion check.)', next: 'c8-sway' },
      { id: 'charge', label: 'Go for the book before she can finish.', next: 'c8-fight' },
    ],
    lesson: 'The last fight. Corva can cast Hold Person, which Paralyzes a Humanoid while she keeps Concentration: hurt her and she has to save to keep it.',
  },
  'c8-sway': {
    chapter: 8, kind: 'check', title: 'Farmers with Shovels',
    text: [`Her followers are farmers and apprentices from Dunmarket, and most of them look more frightened of what they have dug up than of you. One of you speaks to them over Corva's reading.`],
    check: { skill: 'persuasion', dc: 14, mode: 'single', prompt: 'Who does the talking?' },
    success: {
      text: `You tell them about the dead ewes, the stolen carts and Agnes Pell nearly losing her mill. A man drops his shovel and walks out the way you came in, and two more go after him. Corva screams at their backs, then turns on you with fewer friends than she had.`,
      next: 'c8-fight', flags: { swayed: true },
    },
    fail: {
      text: `Corva reads louder, right over the top of you, and her followers raise their shovels and sickles.`,
      next: 'c8-fight', flags: {},
    },
    lesson: 'A hard Persuasion check, DC 14: these people have already made up their minds once.',
  },
  'c8-fight': {
    chapter: 8, kind: 'fight', title: 'Corva Lund', encounter: 'barrow', next: 'c8-end',
    lesson: 'Corva Lund is a Cultist Fanatic: she attacks twice, and casts Command, Hold Person and Spiritual Weapon. Break her Concentration and anyone she has Held goes free. Turn Undead makes the dead flee.',
  },
  'c8-end': {
    chapter: 8, kind: 'story', title: 'Back to Dunmarket',
    text: [
      `When Corva Lund falls, her lantern goes out, and every soldier she raised drops where it stands. The ones still lying in their rows stay down.`,
      `You walk her followers out through the cellar in the grey morning. Martin Ebbs pays the fifty silver and writes everything down twice. Nell Kipps gets the wolves' brass collars and sells them in the market, and Agnes Pell gets her forty sacks of flour back. She counts every one.`,
      `Corva's book goes to Ebbs. It is bound in black calfskin with a boar stamped on the cover, and it's written in a cramped brown hand that none of her followers could read past the first page. Ebbs locks it in the iron strongbox in his front room until Mother Ide, the priest, gets back from the cathedral and can tell him whether it's safe to burn. Until then he'd like you to stay in town, and he's paying for your rooms at the Bell.`,
    ],
    choices: [{ id: 'stay', label: 'Take the rooms at the Bell.', next: 'c9-rest' }],
    lesson: 'Chapter 8 done: subclasses, and Concentration in a big fight. Next: level 4, and your first general feat.',
  },

  // ---------------------------------------------- chapter 9: The Lacey Vault
  'c9-rest': {
    chapter: 9, kind: 'rest', rest: 'long', title: 'A Night at the Bell', next: 'c9-level',
    text: [
      `The Bell is the only inn in Dunmarket, and on market night it's full of drovers. Joan Tullock, who runs it, gives you the two rooms over the kitchen, where it's warm, and charges Martin Ebbs double for them. Half the drovers have heard about the barrow by supper, and they all want to buy you a drink and hear it again.`,
      `You sleep late. It's Joan who wakes you, banging on the doors, because Abel Fenn the sexton has been found lying in the churchyard and he can't move.`,
    ],
    lesson: 'Another Long Rest: Hit Points, Hit Point Dice, spell slots and features all come back. A Long Rest takes at least 8 hours, and you get the benefit of only one every 24 hours.',
  },
  'c9-level': {
    chapter: 9, kind: 'level', level: 4, title: 'Level 4', next: 'c9-fenn',
    text: [`You stopped Corva Lund and walked her followers home. Everyone in the party reaches level 4.`],
    lesson: "Level 4 brings your first general feat. Most heroes take Ability Score Improvement: +2 to one score, or +1 to two, up to a maximum of 20, and every roll that uses that ability gets better. You can take another feat instead, such as Grappler or an Origin feat you don't have yet. Tap your hero to choose.",
  },
  'c9-fenn': {
    chapter: 9, kind: 'story', title: 'Abel Fenn',
    text: [
      `Abel Fenn has dug graves in Dunmarket for thirty years, and this is the first time anyone has carried him out of the churchyard on a door. The men who found him have set him down by the pump in the square. By the time you get there he can turn his head and swear, and he's doing both.`,
      `"They came up out of the Lacey vault," he says. "Grey, thin as rakes, with teeth on them like a dog's. One caught me on the arm with its nails and I went stiff as a plank. I lay there all night watching them go past me, back and forth."`,
      `Martin Ebbs pushes through the crowd in his nightshirt. His front window is smashed in, and the strongbox has gone from his front room. There are muddy prints all down the lane from his house to the churchyard gate.`,
    ],
    choices: [
      { id: 'track', label: 'Follow the prints. (One hero makes a Survival check.)', next: 'c9-track' },
      { id: 'vault', label: 'Go straight to the Lacey vault.', next: 'c9-vault' },
    ],
    lesson: "These are Ghouls. A Ghoul's claws can Paralyze you: make a DC 10 Constitution save or you can't move or act until the end of your next turn. Elves are immune to it, and so are Undead.",
  },
  'c9-track': {
    chapter: 9, kind: 'check', title: 'Bare Feet',
    text: [`The churchyard is soft from last week's rain. If you can pick out the right prints among a whole town's boots, you'll know where they went and whether they're still there.`],
    check: { skill: 'survival', dc: 13, mode: 'single', prompt: 'Who follows the tracks?' },
    success: {
      text: `They're bare feet with long toes, and they go in and out of the Lacey vault over and over. The last ones go in dragging something heavy. The gate at the top of the vault steps has been pulled shut from the inside, and down below you can hear them grunting at each other over something. You get the gate open without a sound.`,
      next: 'c9-vault', flags: { surprise: 'foes' },
    },
    fail: {
      text: `You lose the prints in the long grass between the graves and end up trying every vault in the churchyard. The Lacey vault is the last one, and its gate shrieks on its hinges when you open it.`,
      next: 'c9-vault', flags: {},
    },
    lesson: "Survival is a Wisdom check: tracking, finding your way, reading the weather. Get it right and you catch them by Surprise: they roll Initiative with Disadvantage.",
  },
  'c9-vault': {
    chapter: 9, kind: 'story', title: 'The Lacey Vault',
    text: [
      `The Laceys were the richest family in Dunmarket two hundred years ago, and they built their vault to prove it: a stone stair going down under the churchyard to a room lined with shelves of coffins. Most of the coffins have been pulled down and broken open.`,
      `Ebbs's strongbox sits on the floor with its lid wrenched off. The grey things Abel saw are crouched round it, pulling the book to and fro between them. The biggest wears what's left of a yellow coat, and the smell coming off it makes your eyes water from the bottom of the stairs.`,
    ],
    choices: [{ id: 'fight', label: 'Fight.', next: 'c9-fight' }],
    lesson: "The one in the coat is a Ghast. Its Stench Poisons anyone who starts a turn within 5 feet of it and fails a DC 10 Constitution save. Pass the save once, and you're used to it for a day.",
  },
  'c9-fight': {
    chapter: 9, kind: 'fight', title: 'Ghouls', encounter: 'vault', next: 'c9-after',
    lesson: "Paralyzed: you can't move or act, you fail Strength and Dexterity saves, attacks against you have Advantage, and a hit from within 5 feet is a Critical Hit. Ghouls bite twice, or claw once to Paralyze. A Ghoul or Ghast can't be Poisoned and takes no Poison damage: that's Immunity.",
  },
  'c9-after': {
    chapter: 9, kind: 'story', title: 'The Black Boar',
    text: [
      `There's a badge sewn on the shoulder of the ghast's yellow coat: a black boar, the same one stamped on the cover of Corva's book. Martin Ebbs goes white when he sees it.`,
      `"Thursby," he says. "They had the big house on the north road, three days from here. Sir Hugh Thursby raised a company in this valley for the old war, and the war came to Crowsfoot Hill and finished them. Those are his men you put back in the ground. They carried Sir Hugh home to bury him in his own chapel." Corva, he remembers, told her followers she'd bought the book from a tinker.`,
      `Abel Fenn has hobbled down the steps after you on a stick. "They came for that book," he says, "and they'll keep coming till they get it." Ebbs agrees with him. The Baron's clerk is due in Dunmarket on the twelfth, and if she finds the dead walking in the churchyard, there'll be soldiers in the town by spring and the town paying for their keep. He offers a hundred silver to whoever goes to Thursby Hall and puts an end to it, and pays half of it now. The book goes with you. Nobody in Dunmarket will have it in the house.`,
    ],
    choices: [{ id: 'north', label: 'Take the book and go north to Thursby Hall.', next: 'c10-rest' }],
    lesson: 'Chapter 9 done: feats, Paralysis, Immunity and Surprise. Next: level 5, the biggest step up a hero takes.',
  },

  // ---------------------------------------------- chapter 10: The North Road
  'c10-rest': {
    chapter: 10, kind: 'rest', rest: 'long', title: 'The Drovers\' Shelter', next: 'c10-level',
    text: [
      `The north road follows the river Skell up out of the farmland and onto the moor, and the drovers who use it have built a stone shelter a day's walk apart all the way along. The first night you share one with a shepherd and his two dogs. He has heard of Thursby Hall and he doesn't like it. His father used to say there were lights going round the windows at night, years after the last Thursby was buried.`,
      `The book rides at the bottom of a pack, wrapped in a sack. Twice in the night the dogs get up and growl at the door. In the morning there are long-toed footprints in the mud outside, heading back the way you came.`,
    ],
    lesson: "A Long Rest in a stone hut works the same as one in an inn: 8 hours, most of it asleep, and something to lie on helps. If a fight breaks out, the rest is interrupted.",
  },
  'c10-level': {
    chapter: 10, kind: 'level', level: 5, title: 'Level 5', next: 'c10-bridge',
    text: [`Everyone in the party reaches level 5.`],
    lesson: 'Level 5 is the biggest step up. Your Proficiency Bonus rises to +3. Barbarians, Fighters, Monks, Paladins and Rangers gain Extra Attack: two attacks with each Attack action. Full casters learn level 3 spells such as Fireball, Spirit Guardians and Revivify, and cantrips like Fire Bolt and Eldritch Blast get stronger. A Rogue\'s Sneak Attack is 3d6. Tap your hero to see everything new.',
  },
  'c10-bridge': {
    chapter: 10, kind: 'story', title: 'Skell Bridge',
    text: [
      `On the third morning the road comes down to a stone bridge over the Skell, and somebody has dragged a dead tree across the far end of it. An Ogre is sitting on the tree with a sack of somebody's turnips in its lap, eating them one at a time. Standing up, it would be half again as tall as the tallest of you.`,
      `When it sees you it does stand up. It holds out one enormous hand and points at your purses. Dire wolves come out of the heather behind it and sit on the road, and they are much bigger than the wolves on Crowsfoot Hill, and thinner. From under the bridge, a man is shouting for help.`,
    ],
    choices: [
      { id: 'pay', label: "Hold out Martin Ebbs's silver and make the Ogre understand: the purse for the road. (One hero makes a Persuasion check.)", next: 'c10-pay' },
      { id: 'fight', label: 'Fight your way across.', next: 'c10-fight' },
    ],
    lesson: "Ogres speak Giant, and you probably don't, so this has to be done with your hands and a purse. Getting your meaning across without a shared language makes a check harder.",
  },
  'c10-pay': {
    chapter: 10, kind: 'check', title: 'The Toll',
    text: [`You shake the purse so it clinks, point at the Ogre, and then point up the road behind it. The Ogre scratches its neck and thinks about it.`],
    check: { skill: 'persuasion', dc: 15, mode: 'single', prompt: 'Who does the bargaining?' },
    success: {
      text: `It snatches the purse and bites a coin. Then it picks up its club and the rest of the turnips and stamps off down the riverbank. The dire wolves stay where they are, and as soon as it has gone, they get up and come for you instead.`,
      next: 'c10-fight', flags: { paid: true },
    },
    fail: {
      text: `The Ogre takes the purse, tucks it into its belt and picks up its club.`,
      next: 'c10-fight', flags: {},
    },
    lesson: "Persuasion again, DC 15 this time. Even when a check goes your way, it may only make the fight smaller.",
  },
  'c10-fight': {
    chapter: 10, kind: 'fight', title: 'Skell Bridge', encounter: 'bridge', next: 'c10-after',
    lesson: "With Extra Attack you can attack, step away, and attack again. Dire wolves have Pack Tactics (Advantage when one of their friends is next to you) and their bite can knock you Prone. The Ogre hits hard but has AC 11. One well-placed level 3 spell can turn this fight.",
  },
  'c10-after': {
    chapter: 10, kind: 'story', title: 'Lem Odey',
    text: [
      `The man under the bridge is a tinker called Lem Odey. He has been sitting on a ledge above the water since yesterday afternoon, when the Ogre tipped his cart over, and he climbs up soaked and shivering and very pleased to see you.`,
      `He stops being pleased when you tell him where you're going. Last spring, he says, he sheltered from a storm in the chapel at Thursby Hall. The tomb was open and empty, and a black book was lying on the altar. "So I took it," he says, "and sold it in Dunmarket to a woman in a grey cloak, for four silver. I've dreamed about that chapel every night since."`,
      `He won't go back there with you, but he scratches a map of the hall in the mud with a stick: the gatehouse, the great hall, and the chapel at the back, with a side door into it from the kitchen garden.`,
    ],
    choices: [{ id: 'on', label: 'Thank Lem and walk on to Thursby Hall.', next: 'c11-camp' }],
    lesson: 'Chapter 10 done: level 5, Extra Attack, level 3 spells, Pack Tactics and Prone.',
  },

  // ---------------------------------------------- chapter 11: Thursby Hall
  'c11-camp': {
    chapter: 11, kind: 'rest', rest: 'long', title: 'The Sheepfold', next: 'c11-hall',
    text: [`You sight Thursby Hall in the evening of the fourth day: a grey house on a rise, with a gatehouse in front and most of its roof still on. Nobody wants to walk up to it in the dark. You camp in a sheepfold out of sight of the windows, take turns on watch, and go up in the morning.`],
    lesson: 'Your last Long Rest before the hall. Go in with everything you have.',
  },
  'c11-hall': {
    chapter: 11, kind: 'story', title: 'Thursby Hall',
    text: [
      `The gatehouse doors are off their hinges and the courtyard is waist deep in nettles. Inside, the great hall still has its long table laid with plates, thick with dust. A suit of armor stands at the foot of the stairs, and when you cross the floor, its helmet turns to follow you.`,
      `Lem's map was right. A passage behind the kitchen leads out into the kitchen garden, and from there to the chapel's side door. From somewhere under the kitchen you can hear feet shuffling.`,
    ],
    choices: [
      { id: 'sneak', label: 'Go round through the kitchen garden, quietly. (Everyone makes a Stealth check.)', next: 'c11-sneak' },
      { id: 'hall', label: 'Walk straight through the hall to the chapel.', next: 'c11-chapel' },
    ],
    lesson: "Whatever is in the cellar will come if it hears you. If the group's Stealth check succeeds, fewer of them join the last fight.",
  },
  'c11-sneak': {
    chapter: 11, kind: 'check', title: 'The Kitchen Garden',
    text: [`The kitchen garden has gone to brambles, and the path to the chapel runs right past the top of the cellar steps.`],
    check: { skill: 'stealth', dc: 13, mode: 'group', prompt: 'Everyone rolls Stealth.' },
    success: {
      text: `You get past the cellar steps one at a time, and the shuffling below carries on as before.`,
      next: 'c11-chapel', flags: { quiet: true },
    },
    fail: {
      text: `A bramble catches a cloak and drags a cracked pot off the wall. Down in the cellar the shuffling stops, then starts again, coming up the steps.`,
      next: 'c11-chapel', flags: {},
    },
    lesson: 'A group check: if at least half of you succeed, the whole group does.',
  },
  'c11-chapel': {
    chapter: 11, kind: 'story', title: 'Sir Hugh',
    text: [
      `The chapel is small and very cold. The candles on the altar are lit. In their light a man in old armor sits on the edge of the open tomb, with a sword across his knees and a longbow leaning beside him. His skin is grey and dried tight to the bone, and his eyes shine green when he lifts his head.`,
      `"You've brought my book," says Sir Hugh Thursby. His voice is hoarse and very polite. "Thank you. My men are lying in a hill in the south, and I mean to have them back. Then I'll take back what the Baron's family took from mine." He holds out his hand. "Put it on the altar, and you can walk home."`,
    ],
    choices: [{ id: 'fight', label: 'Keep the book, and fight.', next: 'c11-fight' }],
    lesson: 'Sir Hugh is a Wight. He attacks twice with sword or bow, and can swap an attack for Life Drain: a DC 13 Constitution save, or you take Necrotic damage and lose that much of your Hit Point maximum until a Long Rest. He has Resistance to Necrotic damage (he takes half) and Immunity to Poison.',
  },
  'c11-fight': {
    chapter: 11, kind: 'fight', title: 'Sir Hugh Thursby', encounter: 'hall', next: 'c11-end',
    lesson: "The last fight of this chapter. Animated Armor has AC 18 and can't be Frightened or Paralyzed, so spells that need a failed save do better against the dead. Radiant damage and Turn Undead work on Sir Hugh, the Ghouls and the Zombies.",
  },
  'c11-end': {
    chapter: 11, kind: 'story', title: 'Home Again',
    text: [
      `When Sir Hugh falls, what's left inside his armor is dust and a few teeth. You burn the book on the altar candles a page at a time. It takes most of an hour, and it smells terrible.`,
      `Back in Dunmarket, Martin Ebbs pays the rest of the hundred silver and Abel Fenn puts the Lacey coffins back on their shelves. On the twelfth the Baron's clerk rides in. Her name is Ursula Dent, and she has ink up both cuffs. She looks over the raked churchyard and the reeve's new front window, writes "nothing to report" in her ledger, and asks which inn does the best supper.`,
      `She's halfway through Joan Tullock's mutton at the Bell when Joan's son Davey comes in off the east road. His two wool carts are still loaded in the yard. Strangers have taken the toll keep at Brede ford. Davey had four silver ready for the toll, a silver a wheel, the same as every year, and the man on the gate laughed and told him it was two silver a wheel now. The wool fair at Haverton opens in four days.`,
      `Ursula Dent puts her fork down. "That keep is the Baron's," she says, "and it hasn't sent him a penny since the spring. I wrote to the keeper twice." She wants the ford open and she wants to know where the money went. She'll pay a hundred and fifty silver for both, here in Dunmarket, once Davey's carts are across.`,
    ],
    choices: [{ id: 'east', label: "Take the clerk's job and go east with Davey's carts.", next: 'c12-rest' }],
    lesson: `Chapter 11 done: Life Drain, Resistance and Immunity, and a hard last fight. Next: levels 6 to 10, and the east road.`,
  },

  // ---------------------------------------------- chapter 12: The Toll Keep
  'c12-rest': {
    chapter: 12, kind: 'rest', rest: 'long', title: 'The East Road', next: 'c12-level',
    text: [
      `The east road runs flat along the river Brede, through water meadows and pollard willows. Davey drives the first cart and you take turns with the second, whose mule stops to eat the verge every few hundred yards and can't be talked out of it. You sleep the first night in a hay barn, on a note from Ursula Dent that the farmer reads twice before he lets you in.`,
      `Davey talks most of the evening. He's twenty, and it's the first year his mother has trusted him to take the wool to Haverton on his own. The Bell's winter money is in those two carts.`,
    ],
    lesson: `From here on, every chapter opens with a Long Rest and a new level. The fights are built for a party that starts them at full strength, with its best spells ready.`,
  },
  'c12-level': {
    chapter: 12, kind: 'level', level: 6, title: 'Level 6', next: 'c12-keep',
    text: [`You put Sir Hugh Thursby back in his tomb. Everyone in the party reaches level 6.`],
    lesson: `Level 6 is a subclass level for most classes. A Life Cleric heals themselves whenever they heal someone else with a spell, an Evoker can shape their spells around their friends, and a Monk's strikes deal Force damage. A Paladin's Aura of Protection adds their Charisma modifier to the saving throws of allies within 10 feet. Fighters get another feat. Tap your hero to see what's new.`,
  },
  'c12-keep': {
    chapter: 12, kind: 'story', title: 'Brede Ford',
    text: [
      `Brede keep is a square stone tower with a walled yard, built where the road comes down to the ford. A chain is strung across the road from the gatehouse to a post on the bank, and a dozen carts are drawn up in the meadow on this side, waiting. Their drivers have been there two days. One of them has started selling the others his cheeses.`,
      `The men on the gate wear good mail under blue surcoats. The two on the wall carry pistols, which nobody from Dunmarket has seen outside a picture. Their captain is a hobgoblin in a red cloak, walking the wall with a ledger under one arm, and the drovers call her Captain Hesk. A notice is pinned to the gatehouse door with a dagger: the keep is held for the Baron by warrant, and the toll is two silver a wheel.`,
    ],
    choices: [
      { id: 'bluff', label: 'Walk up to the gate as sellswords looking for work. (One hero makes a Deception check.)', next: 'c12-bluff' },
      { id: 'storm', label: 'Cut the chain and fight your way in.', next: 'c12-fight' },
    ],
    lesson: `Captain Hesk is a Hobgoblin Captain. While she's on her feet, her Aura of Authority gives her and her allies within 10 feet Advantage on attack rolls and saving throws. The men in mail are Veterans: they attack twice, and they can Parry, adding 2 to their AC against one melee attack each round.`,
  },
  'c12-bluff': {
    chapter: 12, kind: 'check', title: 'Looking for Work',
    text: [`You leave Davey with the carts and walk up to the gate on your own. The story is that you heard in Dunmarket the keep was hiring.`],
    check: { skill: 'deception', dc: 14, mode: 'single', prompt: 'Who does the lying?' },
    success: {
      text: `The man on the gate sends for the captain. She comes down with her ledger, writes your names in it, and takes you into the yard to show you where you'll sleep, while the two on the wall go back to watching the meadow. She's still explaining the pay when you draw your weapons.`,
      next: 'c12-fight', flags: { inside: true },
    },
    fail: {
      text: `The man on the gate asks which inn you heard it at. You say the Bell. He says he drank at the Bell all through June and doesn't remember any of your faces, and he shouts up to the wall.`,
      next: 'c12-fight', flags: {},
    },
    lesson: `Deception is a Charisma check: telling a lie well enough to be believed. DC 14. Get it right and the fight starts in the yard, where the two on the wall can't join in.`,
  },
  'c12-fight': {
    chapter: 12, kind: 'fight', title: 'Brede Keep', encounter: 'keep', next: 'c12-after',
    lesson: `Anyone within 10 feet of Captain Hesk has Advantage on attacks and saves. Bring her down early, or fight her men somewhere she isn't. A Veteran can only Parry once a round, so when two of you go after the same one, the second attack has the better chance.`,
  },
  'c12-after': {
    chapter: 12, kind: 'story', title: 'Walter Gisby',
    text: [
      `Captain Hesk throws down her sword when she's the last one standing, and hands over the ledger with it. Everything is written in it in a small neat hand: every cart, every wheel, and every week's takings, with a line ruled under each week and the same name written beside it. H. Marr, Coldharbour.`,
      `The keep's real keeper is in the cellar under the tower, where he has been since April. Walter Gisby is a small bald man in a shirt he has worn for months, and the first thing he asks for is a razor. The mercenaries turned up with a warrant under the Baron's seal, naming a Sir Osric Penn as warden of the east road, and locked him up the same day.`,
      `"Coldharbour's the old signal tower," Walter says, "a day upriver, where the Brede comes out of the fen. A wizard's been living there these three years, Hester Marr. She buys her candles from my wife." He wants to know what a wizard needs with forty silver a week. Davey's carts go over the ford that afternoon, with a letter for Ursula Dent in his coat.`,
    ],
    choices: [{ id: 'upriver', label: 'Go upriver to Coldharbour.', next: 'c13-rest' }],
    lesson: `Chapter 12 done: level 6, Aura of Authority, Parry and Deception. Next: level 7, and a wizard on the other side of the fight.`,
  },

  // ---------------------------------------------- chapter 13: Coldharbour
  'c13-rest': {
    chapter: 13, kind: 'rest', rest: 'long', title: "The Keeper's Roll", next: 'c13-level',
    text: [
      `Walter Gisby gives you the mercenaries' beds in the tower, airs the blankets, and shaves twice. In the morning he brings up a tin box from the cellar. Inside is the keep's copy of the roll of wardens, the Baron's own list of who holds what on his roads, and Sir Osric Penn isn't on it.`,
      `The roll is sealed at the bottom in green wax, with a heron looking back over its left shoulder. Walter lays the mercenaries' warrant beside it and puts his finger on that seal, where the heron looks over its right shoulder instead. The Baron's seal-cutter, he says, would never have made that mistake. He gives you both, and lends you his lantern for the alder woods.`,
    ],
    lesson: `Another Long Rest. Level 7 comes next.`,
  },
  'c13-level': {
    chapter: 13, kind: 'level', level: 7, title: 'Level 7', next: 'c13-tower',
    text: [`You opened Brede ford and let its keeper out. Everyone in the party reaches level 7.`],
    lesson: `Level 7: full casters learn level 4 spells, among them Ice Storm, Wall of Fire, Polymorph and Greater Invisibility. Rogues and Monks get Evasion, so a Dexterity save for half damage does no damage at all when they pass it. A Paladin gets a second aura, and a Cleric gets Blessed Strikes. Tap your hero to see what's new.`,
  },
  'c13-tower': {
    chapter: 13, kind: 'story', title: 'Coldharbour',
    text: [
      `Coldharbour is a round tower of black flint on a knoll where the river path gives out into reed beds. Behind it the fen goes on as far as you can see: brown water, reeds, and a causeway of old stones running out across it toward a grey smudge on the far side. Smoke is coming from the top window.`,
      `A knight is sitting on the mounting block by the tower door, scraping mud off his boots with a stick. He stands up when he sees you and puts his helmet on. "Sir Osric Penn," he says, "warden of the east road, by the Baron's warrant. If you've come from the keep, I'll want to know what you did to Captain Hesk."`,
    ],
    choices: [
      { id: 'show', label: "Show Sir Osric the keeper's roll and the two seals. (One hero makes a Persuasion check.)", next: 'c13-osric' },
      { id: 'past', label: 'Go past him to the door.', next: 'c13-fight' },
    ],
    lesson: `Sir Osric is a Knight: heavy armor, two greatsword attacks that add Radiant damage, Parry, and he can't be Frightened. Talk him round and he stays out of the fight.`,
  },
  'c13-osric': {
    chapter: 13, kind: 'check', title: 'Two Herons',
    text: [`Sir Osric takes his gauntlets off to hold the roll. He reads it through slowly, moving his lips, and then holds the two seals side by side in the light.`],
    check: { skill: 'persuasion', dc: 15, mode: 'single', prompt: 'Who does the talking?' },
    success: {
      text: `"I bought that warrant from her," he says. "Forty silver. I thought it cheap for a wardenship." He gives you back the roll, sits down on the mounting block again, and says he'll wait there for whatever the Baron decides to do with him. He doesn't stop you at the door.`,
      next: 'c13-fight', flags: { told: true },
    },
    fail: {
      text: `"Anyone can cut a seal," he says, "and anyone can tell a story about one. Take it to the Baron, not to me." He draws his sword and stands in the doorway.`,
      next: 'c13-fight', flags: {},
    },
    lesson: `Persuasion, DC 15: you're asking a proud man to believe he has been made a fool of. Evidence helps you argue, but the check still decides it.`,
  },
  'c13-fight': {
    chapter: 13, kind: 'fight', title: 'Hester Marr', encounter: 'tower', next: 'c13-after',
    lesson: `Hester Marr is a Mage. She casts Fireball and Cone of Cold, gets out of reach with Misty Step, and casts Shield as a Reaction when a hit would land, which adds 5 to her AC until her next turn. Spread out so one Fireball can't catch all of you. She has to see you to target you, so walls and Cover help.`,
  },
  'c13-after': {
    chapter: 13, kind: 'story', title: 'The New Moon',
    text: [
      `Hester Marr yields when she can't stand any more, and asks for water. Once she can talk, she tells it straight, sitting on her own floor with her back against a bookcase.`,
      `Three years ago a black dragon came up out of Gallow Fen and ate half the Rudds' cows in their field. She wrote to the Baron, and wrote four more times, and when nobody came she went across the causeway herself and bargained with it. It wanted a chest of silver at every new moon, left on the roof of the drowned church at Ebbing. The tolls at Brede were how she paid for it. "The warrant was mine," she says, "and so was the captain. I'd do it again."`,
      `The next chest is due tomorrow night. It's under her table, half full. If it isn't on the church roof, she says, the dragon will come looking, and it will start with the farms along the edge of the fen. You can carry the chest across for her, or you can go across and kill the dragon, which is what she asked the Baron to do in the first place.`,
    ],
    choices: [{ id: 'fen', label: 'Leave the chest where it is and go after the dragon.', next: 'c14-rest' }],
    lesson: `Chapter 13 done: level 7, and a spellcaster on the other side for once, with Fireball and Shield of her own. Next: level 8, and Gallow Fen.`,
  },

  // ---------------------------------------------- chapter 14: Gallow Causeway
  'c14-rest': {
    chapter: 14, kind: 'rest', rest: 'long', title: "Hester's Map", next: 'c14-level',
    text: [
      `You spend the night in Hester Marr's tower and take turns watching her. She doesn't try anything. She draws you a map of the fen on the back of the forged warrant instead: the causeway, the Rudd farm on the only dry ground halfway across, and the church tower at Ebbing standing up out of open water beyond it.`,
      `Trolls sleep under the far end of the causeway, she says. She has always crossed at noon, while they're asleep, and fast.`,
    ],
    lesson: `Keeping watch over a prisoner is light activity, so it doesn't spoil a Long Rest. Fighting, or walking for an hour or more, would.`,
  },
  'c14-level': {
    chapter: 14, kind: 'level', level: 8, title: 'Level 8', next: 'c14-causeway',
    text: [`You beat Hester Marr in her own tower. Everyone in the party reaches level 8.`],
    lesson: `Level 8 brings another feat for every class, most often an Ability Score Improvement. If you've been raising one score, this is often where it reaches 18 or 20. Tap your hero to choose.`,
  },
  'c14-causeway': {
    chapter: 14, kind: 'story', title: 'Gallow Causeway',
    text: [
      `The causeway is a road of flat stones on a bank of earth, wide enough for one cart, with black water and reeds on both sides. It's noon when you start across. A mile out, the stones are littered with gnawed bones, and something large has trampled the reeds flat on either side.`,
      `From under the next span comes snoring. A clump of alders grows on a hump of mud off to the left, and from inside it comes a sound like a cow being sick, which is the noise an owlbear makes when it's eating.`,
    ],
    choices: [
      { id: 'wade', label: 'Climb down and wade round through the reeds to come at them from behind. (One hero makes a Survival check.)', next: 'c14-reeds' },
      { id: 'cross', label: 'Keep to the causeway and go straight on.', next: 'c14-fight' },
    ],
    lesson: `Trolls have Regeneration: they regain 15 Hit Points at the start of every turn. Knock one down and it gets back up, unless it took Fire or Acid damage since its last turn. Fire Bolt, Produce Flame, Burning Hands, Fireball and a fire-breathing Dragonborn all count.`,
  },
  'c14-reeds': {
    chapter: 14, kind: 'check', title: 'Fence Posts',
    text: [`Off the causeway the water is waist deep in places and knee deep in others, and the soft mud at the bottom pulls boots off.`],
    check: { skill: 'survival', dc: 14, mode: 'single', prompt: 'Who finds the way?' },
    success: {
      text: `You find a line of old fence posts sunk in the mud and follow them round on firm ground, and come up out of the reeds on the far side of the span. The snoring is coming from a heap of bones under it, and it carries on until you're close enough to smell what's making it.`,
      next: 'c14-fight', flags: { surprise: 'foes' },
    },
    fail: {
      text: `Halfway round, somebody steps off a sunken post and goes in up to the chest. By the time you've hauled them out, the snoring has stopped, and long grey hands are reaching up over the edge of the causeway.`,
      next: 'c14-fight', flags: {},
    },
    lesson: `Survival, DC 14, to find a way through the fen. Succeed and the foes are Surprised: they roll Initiative with Disadvantage.`,
  },
  'c14-fight': {
    chapter: 14, kind: 'fight', title: 'Gallow Causeway', encounter: 'causeway', next: 'c14-after',
    lesson: `A troll attacks three times and reaches 10 feet. At 0 Hit Points it falls Prone and starts to regenerate; hit it with Fire or Acid while it's down and it dies. An owlbear attacks twice and hits very hard. The water on both sides is too deep to fight in, so everyone stays on the causeway.`,
  },
  'c14-after': {
    chapter: 14, kind: 'story', title: 'Nat Rudd',
    text: [
      `When the fighting stops, the last troll is still twitching, and its wounds are closing while you watch. You pour the oil from Walter Gisby's lantern over it and set it alight, and you push what's left off the causeway into the water. The smell stays in your clothes for days.`,
      `A boy is sitting on the causeway a little further on, with his knees pulled up, wet through. He's about ten, and he watched the whole fight from the reeds. His name is Nat Rudd. Two giants came to his family's farm four days ago, he says. They ate the pigs, and they shut his mother and father and his sisters in the cow barn, and every evening they bang on the barn door and shout for supper. He got out through the muck hole.`,
      `The Rudd farm is the only dry ground between here and Ebbing, and the causeway goes straight through its yard.`,
    ],
    choices: [{ id: 'farm', label: 'Go with Nat to the farm.', next: 'c15-rest' }],
    lesson: `Chapter 14 done: level 8, Regeneration, Surprise and fighting on narrow ground. Next: level 9, and giants.`,
  },

  // ---------------------------------------------- chapter 15: The Giant's Yard
  'c15-rest': {
    chapter: 15, kind: 'rest', rest: 'long', title: 'The Turf Hut', next: 'c15-level',
    text: [
      `Nat takes you to a turf hut at the edge of the peat cuttings, a mile short of the farm, where his father keeps his spades. The giants stay up all night, he says, roaring and throwing things, and sleep all morning in the yard. So you sleep first, through the dark, with their noise coming over the water, and Nat sleeps across the doorway so nobody can go without him.`,
    ],
    lesson: `A Long Rest needs 8 hours, but not at night. Resting while your enemies are awake, and going in while they sleep, is good planning.`,
  },
  'c15-level': {
    chapter: 15, kind: 'level', level: 9, title: 'Level 9', next: 'c15-yard',
    text: [`You got across Gallow Causeway. Everyone in the party reaches level 9.`],
    lesson: `Level 9: your Proficiency Bonus rises to +4, so attack rolls, save DCs and trained skills all get better. Full casters learn level 5 spells such as Cone of Cold, Flame Strike, Hold Monster and Mass Cure Wounds. Fighters get Indomitable, a reroll for a failed save. Tap your hero to see what's new.`,
  },
  'c15-yard': {
    chapter: 15, kind: 'story', title: "The Giant's Yard",
    text: [
      `The Rudd farm is a long low house, a cow barn and a peat stack on a hump of dry ground, with the causeway running through the middle of the yard. Two hill giants are asleep on their backs by the ashes of a fire. Lying down, they come up to your chest. Nat has names for them: the bigger one, with a cart wheel hung round her neck on a chain, is Big Ada, and the other is Mudge, because of the state of him.`,
      `An ogre sits against the barn door, awake, eating out of a bucket. Another is asleep in the cart shed. Round the back of the barn, behind the peat stack, Nat shows you the muck hole. It's small, and it smells exactly the way you'd expect.`,
    ],
    choices: [
      { id: 'barn', label: 'Creep round to the muck hole and get the Rudds out first. (Everyone makes a Stealth check.)', next: 'c15-barn' },
      { id: 'yard', label: 'Walk into the yard and fight.', next: 'c15-fight' },
    ],
    lesson: `Hill Giants are Huge. Their tree-trunk clubs reach 10 feet and can knock you Prone, and the rubbish they throw can leave you Poisoned. Their AC is only 13, but they have over 100 Hit Points each.`,
  },
  'c15-barn': {
    chapter: 15, kind: 'check', title: 'The Muck Hole',
    text: [`It's a long way round the yard in the open, and the ogre at the barn door looks up every time a crow lands.`],
    check: { skill: 'stealth', dc: 14, mode: 'group', prompt: 'Everyone rolls Stealth.' },
    success: {
      text: `You reach the peat stack unseen and pull the boards off the muck hole. Hob Rudd comes through first, then his wife Martha and their three daughters, all of them filthy and very quiet. The eldest has a pitchfork she kept hidden in the straw for four days. When they run for the reeds, the ogre at the door hears them and lumbers after them into the peat cuttings, where it sinks to the waist in the first wet cutting and stays there, bellowing.`,
      next: 'c15-fight', flags: { freed: true },
    },
    fail: {
      text: `The ogre puts its bucket down, gets up, and walks right round the peat stack. It finds you, and roars, and over in the yard the giants sit up.`,
      next: 'c15-fight', flags: {},
    },
    lesson: `A group Stealth check, DC 14: if at least half of you succeed, the whole group does. Get the Rudds out first and one ogre leaves the fight.`,
  },
  'c15-fight': {
    chapter: 15, kind: 'fight', title: "The Giant's Yard", encounter: 'yard', next: 'c15-after',
    lesson: `Stay out of a giant's reach, or get right in close; its club hits as hard at 10 feet as at 5. If you're knocked Prone, standing up costs half your movement. Poisoned means Disadvantage on attack rolls and ability checks.`,
  },
  'c15-after': {
    chapter: 15, kind: 'story', title: 'Hob Rudd',
    text: [
      `Hob Rudd comes back up out of the reeds when the yard goes quiet, with his family behind him. He walks twice round the giants, kicks Mudge in the ear, and then sits on the step of his house with his hands over his face until Martha brings him some water.`,
      `When you tell him where you're going, he takes you down to the end of the yard, where the causeway runs out into open water, and drags a flat-bottomed peat boat out of the reeds. Ebbing was his grandmother's village. The fen came up over it in a wet year before he was born, and all that's left above the water now is the church roof and its bell tower.`,
      `"It'll be going in and out through the hole in the roof," he says. "But there's a window at the top of the bell tower, and stairs down inside to the gallery, if they haven't rotted. My grandmother rang that bell when she was a girl." He gives you the boat and the oars, and asks you to bring them back.`,
    ],
    choices: [{ id: 'row', label: 'Take the boat to Ebbing.', next: 'c16-rest' }],
    lesson: `Chapter 15 done: level 9, Huge creatures, Reach and Prone. Next: level 10, and the dragon.`,
  },

  // ---------------------------------------------- chapter 16: The Black Water
  'c16-rest': {
    chapter: 16, kind: 'rest', rest: 'long', title: "The Rudds' Kitchen", next: 'c16-level',
    text: [
      `The Rudds feed you everything the giants didn't eat, which is mostly oatcakes and eggs, and give you their beds. In the morning Martha Rudd sews up a cloak where a troll got hold of it. Nat wants to come in the boat, and isn't allowed, and argues about it all through breakfast.`,
    ],
    lesson: `The last Long Rest before the last fight in this part of the story. Go in with every slot and every use you have.`,
  },
  'c16-level': {
    chapter: 16, kind: 'level', level: 10, title: 'Level 10', next: 'c16-water',
    text: [`You saved the Rudds' farm. Everyone in the party reaches level 10.`],
    lesson: `Level 10: a Cleric can call on Divine Intervention and cast any Cleric spell of level 5 or lower without a slot, once per Long Rest. A Bard learns spells from other classes with Magical Secrets. A Paladin's Aura of Courage means allies within 10 feet can't be Frightened. Tap your hero to see what's new.`,
  },
  'c16-water': {
    chapter: 16, kind: 'story', title: 'Ebbing',
    text: [
      `It takes most of the morning to row to Ebbing. The fen gets deeper and the reeds thin out, until there's nothing but flat black water with dead trees standing in it, and the roofs of houses just under the surface, where you can see them if you look straight down.`,
      `The church is the only building in the village still above water: a long slate roof, broken open in the middle, and a square bell tower at the west end with a window at the top. There are bones caught in the slates round the hole. A troll sits beside it, picking at its feet, and on a ledge by the hole are Hester Marr's chests, three years of them, with the lids off.`,
      `From inside comes the slop of water against the walls as something big turns over. Hester called the dragon Skellmaw. It sleeps through the afternoons, she said, and hates being woken.`,
    ],
    choices: [
      { id: 'tower', label: 'Row round to the bell tower and climb in at the top. (Everyone makes an Athletics check.)', next: 'c16-tower' },
      { id: 'roof', label: 'Row straight for the hole in the roof.', next: 'c16-fight' },
    ],
    lesson: `Skellmaw is a Young Black Dragon: AC 18, 127 Hit Points, three claw attacks a turn that add Acid damage, and Acid Breath, a 30-foot Line that does 14d6 Acid damage on a failed DC 14 Dexterity save and half on a success. The breath has Recharge 5-6.`,
  },
  'c16-tower': {
    chapter: 16, kind: 'check', title: 'The Bell Tower',
    text: [`The tower's stones are slimy with weed up to the old high-water line, and dry above it. It's a long climb from the boat to the window.`],
    check: { skill: 'athletics', dc: 13, mode: 'group', prompt: 'Everyone rolls Athletics.' },
    success: {
      text: `You go up one at a time, with a rope from the top for the last of you, and climb in beside the bell. The stairs down are wet but whole, and they bring you out onto the gallery at the back of the church, above the water. The troll is still out on the roof by the hole, with its back to you, and the dragon is between you and it.`,
      next: 'c16-fight', flags: { tower: true },
    },
    fail: {
      text: `Halfway up, a stone comes away under somebody's foot and drops into the water with a splash like a dropped anvil. The troll on the roof gets up and climbs down inside through the hole, shouting, and the water inside the church starts to heave.`,
      next: 'c16-fight', flags: {},
    },
    lesson: `A group Athletics check, DC 13, for climbing. Succeed and the troll on the roof stays out of the fight.`,
  },
  'c16-fight': {
    chapter: 16, kind: 'fight', title: 'Skellmaw', encounter: 'fen', next: 'c16-end',
    lesson: `The last fight. Skellmaw and its wyrmlings are immune to Acid. Spread out so the breath can only catch one or two of you, and after it breathes, press in: it rolls a d6 at the start of each turn and only gets the breath back on a 5 or 6.`,
  },
  'c16-end': {
    chapter: 16, kind: 'end', title: "Hester's Silver",
    text: [
      `Skellmaw dies half in and half out of the water, and the wave it makes going under slaps the boat against the gallery. When the water settles you can see down to the floor of the church: the pews, the font, and a carpet of coins and bones.`,
      `It takes two days and the Rudds' second boat to bring the silver back to Coldharbour. Hester Marr counts it with you. Most of it is the Baron's, from the tolls, and some of it came from the Rudds and the other fen farms, who paid her a share every month. She asks you to see that they get theirs back first, and you do.`,
      `Ursula Dent is waiting at Brede keep when you bring the chests down the river, with Walter Gisby, six of the Baron's soldiers and a fresh ledger. Davey Tullock got the best price in years at Haverton, and he has left you a cheese. The clerk pays you your hundred and fifty silver and writes for the rest of the afternoon, and when she's finished she asks whether you'll be free in the spring.`,
    ],
    lesson: `That's the campaign so far: from your first d20 to level 10. Levels 11 to 20 are on the way. Thanks for playtesting First Roll.`,
  },
};
