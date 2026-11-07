// The campaign: scenes for chapters 1 and 2. Scene kinds:
//   story  text + choices the party votes on
//   check  text + a skill check; success and failure lead on with flags
//   fight  an encounter from encounters.js; victory goes to `next`
//   camp   a town stop: rewards, a Long Rest, the merchant, level-ups;
//          the host moves on to `next` (or it's the end, with `final`)
// Choices may carry `rest: 'short'` (a Short Rest before moving on).
// `reward` ({ xp, gold }, per hero) is paid once, when the scene is reached.

import { defaultSpec } from '../rules/character.js';

export const CHAPTERS = {
  1: { title: 'The Flour Road' },
  2: { title: 'The Goblin Camp' },
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
    chapter: 1, kind: 'story', title: 'The Mill at Dunmarket',
    text: [
      "Agnes Pell runs the mill on the edge of Dunmarket, and she is two flour carts short. Goblins took them on the road to market, one last week and one three days ago, mules and all.",
      'She drops a purse on a barrel. "Twenty-five gold each if tomorrow\'s cart reaches the market square before the noon bell. The bakers buy from whoever gets there first. If it isn\'t me again, I\'m finished."',
      "The cart is loaded. Its mule, a grey named Biscuit, is chewing the corner of a flour sack. There are two ways to market.",
    ],
    choices: [
      { id: 'woods', label: "Cut through Hagger Woods. It's faster, but it's where both carts were taken.", next: 'c2-woods' },
      { id: 'river', label: 'Take the river road. It adds an hour, but it runs through open country.', next: 'c2-river' },
    ],
  },
  'c2-woods': {
    chapter: 1, kind: 'check', title: 'Hagger Woods',
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
  },
  'c2-river': {
    chapter: 1, kind: 'story', title: 'The River Road',
    text: [
      'The river road is wide and muddy, and the extra hour feels like three. Near the old ford, the reeds part and small figures with rusty blades step onto the road between you and Dunmarket.',
      "They want the flour. The biggest one points at Biscuit and licks its lips, and you're fairly sure it means the mule too.",
    ],
    choices: [{ id: 'fight', label: 'Draw your weapons.', next: 'c2-fight' }],
  },
  'c2-fight': {
    chapter: 1, kind: 'fight', title: 'Goblin Ambush', encounter: 'road', next: 'c2-after',
  },
  'c2-after': {
    chapter: 1, kind: 'story', title: 'Spilled Flour',
    text: [
      'When the last goblin falls, Biscuit goes back to eating his sack. In the mud where the fight was, you find an empty flour bag stamped AGNES PELL in blue ink, and a line of spilled flour running off the road toward the hills. That is where her stolen carts went.',
      "The noon bell is still hours off. The trail will keep; Agnes's bakers won't.",
    ],
    choices: [
      { id: 'rest', label: 'Catch your breath first. (Short Rest)', next: 'c2-town', rest: 'short' },
      { id: 'go', label: 'Roll on to Dunmarket.', next: 'c2-town' },
    ],
  },
  'c2-town': {
    chapter: 1, kind: 'camp', title: 'Market Day in Dunmarket', reward: { xp: 250, gold: 25 }, rest: 'long', next: 'c3-camp',
    text: [
      "Dunmarket's square is loud with bakers haggling over prices. Agnes Pell sells every sack before the noon bell stops ringing and pays you on the spot.",
      'When you show her the stamped bag and tell her about the trail, she counts out a second purse and keeps her hand on it. "Bring my other two carts home and this is yours as well."',
      'You take rooms at the Copper Kettle for the night. Across the square, a smith named Hobb sells armor out of the front of his forge, and potions from a shelf behind the counter.',
    ],
    continueLabel: 'Set out after the stolen carts',
  },
  'c3-camp': {
    chapter: 2, kind: 'story', title: 'The Goblin Camp',
    text: [
      "At first light you pick up the flour trail. It climbs into a ravine and ends at a goblin camp: a ring of hide tents, a smoky cookfire, and both of Agnes's stolen carts with the sacks still piled in the back.",
      "A goblin in a dented helmet two sizes too big is shouting at the others to hurry up and eat. That's the boss. It has a scimitar on its belt and a bow across its back.",
    ],
    choices: [
      { id: 'sneak', label: 'Creep up together. (Everyone makes a Stealth check.)', next: 'c3-sneak' },
      { id: 'demand', label: 'Walk straight in and order them to hand it back. (One hero makes an Intimidation check.)', next: 'c3-demand' },
    ],
  },
  'c3-sneak': {
    chapter: 2, kind: 'check', title: 'Creeping Up',
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
  },
  'c3-demand': {
    chapter: 2, kind: 'check', title: 'Making Demands',
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
  },
  'c3-fight': {
    chapter: 2, kind: 'fight', title: 'The Goblin Boss', encounter: 'camp', next: 'c3-end',
  },
  'c3-end': {
    chapter: 2, kind: 'camp', final: true, title: 'Two Carts Home', reward: { xp: 600, gold: 25 }, rest: 'long',
    text: [
      "The Goblin Boss's helmet rolls into the cookfire, and the rest of the day is hauling. By sunset both stolen carts are back in Agnes Pell's yard, a few sacks lighter than they left.",
      'She pays the second purse in full and pours everyone a mug of something brown from a jug she keeps under the counter. Biscuit gets a whole sack to himself.',
    ],
  },
};
