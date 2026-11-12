// Encounters for the campaign, sized to the party with the 2024 XP budget
// per hero (SRD 5.2.1, "Combat Encounter Difficulty"):
//   level 1: Low 50, Moderate 75, High 100
//   level 2: Low 100, Moderate 150, High 200
//   level 3: Low 150, Moderate 225, High 400
//   level 4: Low 250, Moderate 375, High 500
//   level 5: Low 500, Moderate 750, High 1100
//   level 6: Low 600, Moderate 1000, High 1400
//   level 7: Low 750, Moderate 1300, High 1700
//   level 8: Low 1000, Moderate 1700, High 2100
//   level 9: Low 1300, Moderate 2000, High 2600
//   level 10: Low 1600, Moderate 2300, High 3100
//   level 11: Low 1900, Moderate 2900, High 4100
//   level 12: Low 2200, Moderate 3700, High 4700
//   level 13: Low 2600, Moderate 4200, High 5400
//   level 14: Low 2900, Moderate 4900, High 6200
//   level 15: Low 3300, Moderate 5400, High 7800
//   level 16: Low 3800, Moderate 6100, High 9800
//   level 17: Low 4500, Moderate 7200, High 11700
//   level 18: Low 5000, Moderate 8700, High 14200
//   level 19: Low 5500, Moderate 10700, High 17200
//   level 20: Low 6400, Moderate 13200, High 22000
// XP: Goblin Warrior 50, Goblin Boss 200, Wolf 50, Skeleton 50, Zombie 50,
// Cultist 25, Giant Spider 200, Bugbear Warrior 200, Cultist Fanatic 450,
// Ghoul 200, Dire Wolf 200, Animated Armor 200, Ghast 450, Ogre 450, Wight 700,
// Bandit Captain 450, Black Dragon Wyrmling 450, Warrior Veteran 700, Hobgoblin
// Captain 700, Knight 700, Owlbear 700, Troll 1800, Hill Giant 1800, Mage 2300,
// Young Black Dragon 2900, Assassin 3900, Frost Giant 3900, Fire Giant 5000,
// Bone Devil 5000, Stone Golem 5900, Archmage 8000, Vampire 10000, Mummy Lord 13000,
// Iron Golem 15000, Balor 22000, Pit Fiend 25000, Lich 33000, Adult Black Dragon 11500.
//
// The board is 8 squares wide and 10 deep, heroes start at the bottom.
// `walls` are solid (Total Cover, no line of sight); `cover` squares are low
// walls, crates and tombs: you can't walk through them, but they only give
// Half Cover (+2 AC and Dexterity saves).

import { buildMonster } from '../rules/character.js';
import {
  GOBLIN_WARRIOR, GOBLIN_BOSS, WOLF, SKELETON, ZOMBIE, GIANT_SPIDER, CULTIST, CULTIST_FANATIC, BUGBEAR_WARRIOR,
  GHOUL, GHAST, DIRE_WOLF, OGRE, ANIMATED_ARMOR, WIGHT,
  BANDIT_CAPTAIN, WARRIOR_VETERAN, HOBGOBLIN_CAPTAIN, KNIGHT, MAGE, OWLBEAR, TROLL, HILL_GIANT, BLACK_DRAGON_WYRMLING, YOUNG_BLACK_DRAGON,
  ASSASSIN, FROST_GIANT, FIRE_GIANT, BONE_DEVIL, STONE_GOLEM, ARCHMAGE, MUMMY_LORD,
  VAMPIRE, IRON_GOLEM, BALOR, LICH, ADULT_BLACK_DRAGON,
} from '../rules/data.js';

const W = GOBLIN_WARRIOR, BOSS = GOBLIN_BOSS;
const BOTTOM = [{ x: 3, y: 8 }, { x: 4, y: 8 }, { x: 2, y: 9 }, { x: 5, y: 9 }];

// Number the foes of each kind: "Wolf 1", "Wolf 2", "Skeleton 1"...
function label(list) {
  const seen = {}, total = {};
  for (const f of list) total[f.def.name] = (total[f.def.name] || 0) + 1;
  return list.map((f) => {
    seen[f.def.name] = (seen[f.def.name] || 0) + 1;
    return { label: f.label || (total[f.def.name] > 1 ? `${f.def.name} ${seen[f.def.name]}` : f.def.name), ...f };
  });
}
const at = (def, x, y, ai = 'melee') => ({ def, x, y, ai });

export const ENCOUNTERS = {
  // Chapter 2, "Your First Fight": Low difficulty, one goblin per hero.
  road: {
    name: 'The road', level: 1,
    walls: ['1,5', '2,5', '5,4', '6,4', '6,5', '3,1'],
    heroStarts: BOTTOM,
    foes(n) {
      const spots = [
        { x: 2, y: 2, ai: 'melee' }, { x: 5, y: 2, ai: 'melee' }, { x: 4, y: 0, ai: 'archer' }, { x: 1, y: 1, ai: 'archer' },
      ];
      return spots.slice(0, Math.max(1, n)).map((s, i) => ({ def: W, label: `Goblin ${i + 1}`, ...s }));
    },
  },
  // Chapter 3, "Weapon Mastery and Teamwork": the boss and its guards.
  camp: {
    name: 'The goblin camp', level: 1,
    walls: ['0,3', '1,3', '6,2', '7,2', '3,5', '4,5', '1,7', '6,7'],
    heroStarts: BOTTOM,
    foes(n) {
      const boss = { def: BOSS, label: 'Goblin Boss', x: 4, y: 1, ai: 'melee' };
      const g = (i, x, y, ai) => ({ def: W, label: `Goblin ${i}`, x, y, ai });
      if (n <= 1) return [g(1, 3, 2, 'melee'), g(2, 5, 1, 'archer')];            // 100 XP: High for one
      if (n === 2) return [boss];                                               // 200 XP: High for two
      if (n === 3) return [boss, g(1, 3, 1, 'melee')];                          // 250 XP: between Moderate and High
      return [boss, g(1, 3, 1, 'melee'), g(2, 6, 0, 'archer')];                 // 300 XP: Moderate for four
    },
  },
  // Chapter 4, "High Ground": goblin archers behind a field wall, wolves
  // coming through the gap. Cover, line of sight, Prone.
  wall: {
    name: 'The field wall', level: 1,
    walls: ['0,7', '7,6'],
    cover: ['0,4', '1,4', '2,4', '5,4', '6,4', '7,4', '4,6'],
    heroStarts: BOTTOM,
    foes(n) {
      const wolves = [at(WOLF, 3, 2), at(WOLF, 4, 2), at(WOLF, 4, 1)];
      const archers = [at(W, 1, 3, 'archer'), at(W, 6, 3, 'archer'), at(W, 2, 3, 'archer')];
      if (n <= 1) return label([wolves[0]]);                                    // 50 XP: Low for one
      if (n === 2) return label([wolves[0], archers[0]]);                       // 100 XP: Low for two
      if (n === 3) return label([wolves[0], wolves[1], archers[0]]);            // 150 XP: Low for three
      return label([wolves[0], wolves[1], archers[0], archers[1]]);             // 200 XP: Low for four
    },
  },
  // Chapter 6, "Magic in the Cellar" (level 2): cultists and the skeletons
  // they dug up, among open tombs.
  crypt: {
    name: 'The cellar', level: 2,
    walls: ['2,7', '5,7'],
    cover: ['1,3', '1,5', '6,3', '6,5', '3,4', '4,4'],
    heroStarts: BOTTOM,
    foes(n) {
      const cult = [at(CULTIST, 2, 2), at(CULTIST, 5, 2), at(CULTIST, 3, 1), at(CULTIST, 4, 1)];
      const skel = [at(SKELETON, 0, 1, 'archer'), at(SKELETON, 7, 1, 'archer'), at(SKELETON, 1, 0, 'archer'), at(SKELETON, 6, 0, 'archer')];
      const zom = [at(ZOMBIE, 2, 0), at(ZOMBIE, 5, 0)];
      if (n <= 1) return label([cult[0], cult[1], skel[0]]);                    // 100 XP: Low for one
      if (n === 2) return label([cult[0], cult[1], skel[0], skel[1]]);          // 150 XP: under Low for two
      if (n === 3) return label([...cult, ...skel]);                            // 300 XP: Low for three
      return label([...cult, ...skel, ...zom]);                                 // 400 XP: Low for four
    },
  },
  // Chapter 7, "Bad Air and Worse Company" (level 2): a Giant Spider's nest,
  // a Bugbear and the dead. Restrained, Grappled, Undead Fortitude.
  nest: {
    name: 'The nest', level: 2,
    walls: ['0,4', '7,4', '3,2'],
    cover: ['2,5', '5,5'],
    heroStarts: BOTTOM,
    foes(n) {
      const spider = at(GIANT_SPIDER, 4, 2);
      const bug = at(BUGBEAR_WARRIOR, 2, 1);
      const zom = [at(ZOMBIE, 1, 2), at(ZOMBIE, 6, 2), at(ZOMBIE, 5, 1), at(ZOMBIE, 6, 1)];
      if (n <= 1) return label([spider]);                                       // 200 XP: High for one
      if (n === 2) return label([spider, zom[0]]);                              // 250 XP: Low to Moderate for two
      if (n === 3) return label([spider, bug]);                                 // 400 XP: Low to Moderate for three
      return label([spider, bug, zom[0], zom[1]]);                              // 500 XP: Low to Moderate for four
    },
  },
  // Chapter 8, "The Barrow" (level 3): Corva Lund (a Cultist Fanatic), the
  // dead she has raised and her followers. If the party talked some of them
  // out of it (flag `swayed`), half the cultists have gone home.
  barrow: {
    name: 'The barrow', level: 3,
    walls: ['1,3', '6,3', '1,6', '6,6'],
    cover: ['3,2', '4,2'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const corva = { ...at(CULTIST_FANATIC, 4, 1, 'caster'), label: 'Corva Lund' };
      const skel = [at(SKELETON, 0, 1, 'archer'), at(SKELETON, 7, 1, 'archer'), at(SKELETON, 2, 0, 'archer')];
      let cult = [at(CULTIST, 3, 4), at(CULTIST, 4, 4), at(CULTIST, 2, 5), at(CULTIST, 5, 5)];
      let list;
      if (n <= 1) { list = [corva]; cult = []; }                                // 450 XP: High for one
      else if (n === 2) list = [corva];                                         // 500 XP with cultists: Moderate for two
      else if (n === 3) list = [corva, skel[0]];                                // 550 XP with cultists: Low to Moderate for three
      else list = [corva, skel[0], skel[1]];                                    // 650 XP with cultists: Low for four
      const keep = n <= 1 ? 0 : n === 2 ? 2 : n === 3 ? 2 : 4;
      cult = cult.slice(0, flags.swayed ? Math.floor(keep / 2) : keep);
      return label([...list, ...cult]);
    },
  },
  // Chapter 9, "The Lacey Vault" (level 4): the churchyard vault in Dunmarket.
  // Paralysis, and an elf's immunity to it; the Ghast's Stench.
  vault: {
    name: 'The vault', level: 4,
    walls: ['0,3', '7,3', '0,6', '7,6'],
    cover: ['2,2', '5,2', '3,5', '4,5'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const ghast = at(GHAST, 4, 0);
      const gh = [at(GHOUL, 2, 1), at(GHOUL, 5, 1), at(GHOUL, 3, 0), at(GHOUL, 6, 0)];
      const zom = [at(ZOMBIE, 1, 0), at(ZOMBIE, 6, 2)];
      if (n <= 1) return label([ghast]);                                        // 450 XP: Moderate to High for one
      if (n === 2) return label([ghast, gh[0]]);                                // 650 XP: Low to Moderate for two
      if (n === 3) return label([ghast, gh[0], gh[1], zom[0]]);                 // 900 XP: Low to Moderate for three
      return label([ghast, gh[0], gh[1], gh[2], zom[0], zom[1]]);               // 1150 XP: Low to Moderate for four
    },
  },
  // Chapter 10, "The North Road" (level 5): an Ogre and its dire wolves at a
  // broken bridge. Extra Attack and level 3 spells. If the party bought the
  // Ogre off (flag `paid`), it walks away and only the wolves are left.
  bridge: {
    name: 'The bridge', level: 5,
    walls: ['0,4', '1,4', '6,4', '7,4'],
    cover: ['3,2', '2,6', '5,6'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const ogre = { ...at(OGRE, 4, 1), label: 'Ogre' };
      const dw = [at(DIRE_WOLF, 2, 1), at(DIRE_WOLF, 5, 2), at(DIRE_WOLF, 3, 0), at(DIRE_WOLF, 6, 1), at(DIRE_WOLF, 1, 2)];
      const wolves = n <= 1 ? 1 : n === 2 ? 3 : n === 3 ? 4 : 5;
      const list = [...(flags.paid ? [] : [ogre]), ...dw.slice(0, wolves + (flags.paid ? 1 : 0))];
      return label(list);                       // 650 / 1050 / 1250 / 1450 XP: Low to Moderate
    },
  },
  // Chapter 11, "Garrow Hall" (level 5): the Wight in its hall, with the dead
  // it keeps and the armor that guards the stairs. Life Drain.
  hall: {
    name: 'The hall', level: 5,
    walls: ['0,2', '1,2', '6,2', '7,2', '0,7', '7,7'],
    cover: ['2,4', '5,4', '3,1', '4,1'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const wight = { ...at(WIGHT, 4, 0), label: 'Sir Hugh Thursby' };
      const armor = [at(ANIMATED_ARMOR, 2, 3), at(ANIMATED_ARMOR, 5, 3)];
      const gh = [at(GHOUL, 1, 3), at(GHOUL, 6, 3)];
      const ghast = at(GHAST, 3, 3);
      const zom = [at(ZOMBIE, 2, 1), at(ZOMBIE, 5, 1)];
      let list;
      if (n <= 1) list = [wight];                                               // 700 XP: Moderate for one
      else if (n === 2) list = [wight, armor[0], gh[0], zom[0]];                // 1150 XP: Low to Moderate for two
      else if (n === 3) list = [wight, armor[0], armor[1], gh[0], gh[1], zom[0]]; // 1550 XP: Low for three
      else list = [wight, ghast, armor[0], armor[1], gh[0], gh[1], zom[0]];      // 2050 XP: Low for four
      // A quiet way in (flag `quiet`) leaves the Zombies in the cellar.
      if (flags.quiet) list = list.filter((f) => f.def !== ZOMBIE);
      return label(list);
    },
  },
  // Chapter 12, "The Toll Keep" (level 6): mercenaries holding the Baron's
  // keep on the east road, led by a Hobgoblin Captain. Aura of Authority and
  // Parry. Talking your way in (flag `inside`) leaves the archers on the wall.
  keep: {
    name: 'The toll keep', level: 6,
    walls: ['0,3', '1,3', '2,3', '5,3', '6,3', '7,3'],
    cover: ['3,5', '4,5', '1,7', '6,7'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const cap = { ...at(HOBGOBLIN_CAPTAIN, 4, 2), label: 'Captain Hesk' };
      const vet = [at(WARRIOR_VETERAN, 3, 2), at(WARRIOR_VETERAN, 5, 2)];
      const bc = [at(BANDIT_CAPTAIN, 1, 1, 'archer'), at(BANDIT_CAPTAIN, 6, 1, 'archer')];
      let list;
      if (n <= 1) list = [vet[0]];                                              // 700 XP: Moderate for one
      else if (n === 2) list = [cap, vet[0]];                                   // 1400 XP: Moderate for two
      else if (n === 3) list = [cap, vet[0], bc[0]];                            // 1850 XP: Low for three
      else list = [cap, vet[0], bc[0], bc[1]];                                  // 2300 XP: Low for four
      if (flags.inside) list = list.filter((f) => f.def !== BANDIT_CAPTAIN);
      return label(list);
    },
  },
  // Chapter 13, "The Tower Room" (level 7): the Mage who hired them, with her
  // Knight. Fireball, Shield and Misty Step on the other side for once.
  tower: {
    name: 'The tower room', level: 7,
    walls: ['0,1', '7,1', '0,6', '7,6'],
    cover: ['2,2', '5,2', '3,4', '4,4'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const mage = { ...at(MAGE, 4, 0, 'caster'), label: 'Hester Marr' };
      const knight = { ...at(KNIGHT, 3, 2), label: 'Sir Osric Penn' };
      const vet = [at(WARRIOR_VETERAN, 2, 3), at(WARRIOR_VETERAN, 5, 3)];
      let list;
      if (n <= 1) list = [knight, at(BANDIT_CAPTAIN, 5, 2)];                   // 1150 XP: Low to Moderate for one
      else if (n === 2) list = [mage];                                          // 2300 XP: Moderate for two
      else if (n === 3) list = [mage, knight];                                  // 3000 XP: Low to Moderate for three
      else list = [mage, knight, vet[0]];                                       // 3700 XP: Low to Moderate for four
      // Sir Osric, told the truth (flag `told`), stands aside. Alone, you
      // meet a Veteran on the stairs in his place.
      if (flags.told) list = n > 1 ? list.filter((f) => f.def !== KNIGHT) : [vet[0], list[1]];      // 1150 XP either way for one
      return label(list);
    },
  },
  // Chapter 14, "Gallow Causeway" (level 8): trolls on the causeway into the
  // fen, and an owlbear in the alders. Regeneration: only Fire or Acid keeps
  // a troll down.
  causeway: {
    name: 'The causeway', level: 8,
    walls: ['0,2', '0,3', '0,4', '0,5', '0,6', '7,2', '7,3', '7,4', '7,5', '7,6'],
    cover: ['2,4', '5,5'],
    heroStarts: BOTTOM,
    foes(n) {
      const tr = [at(TROLL, 3, 1), at(TROLL, 5, 1)];
      const ow = [at(OWLBEAR, 2, 0), at(OWLBEAR, 6, 0)];
      if (n <= 1) return label([tr[0]]);                                        // 1800 XP: Moderate to High for one
      if (n === 2) return label([tr[0], ow[0]]);                                // 2500 XP: Low to Moderate for two
      if (n === 3) return label([tr[0], ow[0]]);                                // 2500 XP: Low for three
      return label([tr[0], tr[1]]);                                             // 3600 XP: Low for four
    },
  },
  // Chapter 15, "The Giant's Yard" (level 9): hill giants and their ogres at
  // the Rudds' peat farm. Reach 10 feet, Prone, Poisoned.
  yard: {
    name: "The giant's yard", level: 9,
    walls: ['2,3', '3,3', '6,5'],
    cover: ['1,5', '5,2', '4,6'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const hg = [{ ...at(HILL_GIANT, 4, 1), label: 'Mudge' }, { ...at(HILL_GIANT, 1, 1), label: 'Big Ada' }];
      const og = [at(OGRE, 6, 2), at(OGRE, 0, 2), at(OGRE, 5, 0)];
      let list;
      if (n <= 1) list = [hg[0]];                                               // 1800 XP: Moderate for one
      else if (n === 2) list = [hg[0], og[0], og[1]];                           // 2700 XP: Moderate for two
      else if (n === 3) list = [hg[0], hg[1], og[0]];                           // 4050 XP: Low to Moderate for three
      else list = [hg[0], hg[1], og[0], og[1]];                                 // 4500 XP: Low for four
      // Getting the Rudds out first (flag `freed`) draws one Ogre off.
      if (flags.freed) list = list.filter((f) => f !== og[0]);
      return label(list);
    },
  },
  // Chapter 16, "The Black Water" (level 10): the Young Black Dragon in its
  // drowned church, with its wyrmlings and the troll that guards the way in.
  // Acid Breath (Recharge 5-6) in a 30-foot Line. Coming in by the bell tower
  // (flag `tower`) leaves the trolls at the door.
  fen: {
    name: 'The black water', level: 10,
    walls: ['1,2', '6,2', '1,5', '6,5'],
    cover: ['3,3', '4,6'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const drake = { ...at(YOUNG_BLACK_DRAGON, 4, 0), label: 'Skellmaw' };
      const wy = [at(BLACK_DRAGON_WYRMLING, 2, 1), at(BLACK_DRAGON_WYRMLING, 5, 1), at(BLACK_DRAGON_WYRMLING, 4, 2)];
      const tr = [at(TROLL, 3, 3), at(TROLL, 5, 3)];
      let list;
      if (n <= 2) list = [drake];                                               // 2900 XP: Moderate to High for one, Low for two
      else if (n === 3) list = [drake, wy[0], wy[1], tr[0]];                    // 5600 XP: Moderate for three
      else list = [drake, wy[0], wy[1], wy[2], tr[0]];                          // 6050 XP: Low for four
      if (flags.tower) list = list.filter((f) => f.def !== TROLL);
      return label(list);
    },
  },

  // Chapter 17, "Haverton Gaol" (level 11): assassins come over the wall for
  // Hester Marr, with hired swords. Evasion, poison, three attacks a turn.
  // Barring the yard gate first (flag `barred`) shuts one Veteran out.
  gaol: {
    name: 'The gaol yard', level: 11,
    walls: ['0,3', '1,3', '6,3', '7,3'],
    cover: ['3,2', '2,5', '5,5'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const as = [at(ASSASSIN, 2, 1), at(ASSASSIN, 5, 1)];
      const vet = [at(WARRIOR_VETERAN, 3, 0), at(WARRIOR_VETERAN, 4, 0)];
      const mage = at(MAGE, 6, 0, 'caster');
      let list;
      if (n <= 1) list = [as[0]];                                               // 3900 XP: High for one
      else if (n === 2) list = [as[0], vet[1]];                                 // 4600 XP: Low to Moderate for two
      else if (n === 3) list = [as[0], as[1], vet[0]];                          // 8500 XP: Moderate to High for three
      else list = [as[0], as[1], vet[1], mage];                                 // 10800 XP: Moderate for four
      if (flags.barred) list = list.filter((f) => f !== vet[1]);
      return label(list);
    },
  },
  // Chapter 18, "Kell Pass" (level 12): frost giants paid to hold the pass.
  // Reach 10 feet, Cold damage, and a Great Bow whose arrows slow you.
  // Taking the drovers' track (flag `track`) leaves one giant at the cairn.
  pass: {
    name: 'Kell Pass', level: 12,
    walls: ['0,0', '0,1', '0,2', '7,0', '7,1', '7,2', '2,5', '6,6'],
    cover: ['3,3', '5,2', '1,6'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const fg = [{ ...at(FROST_GIANT, 3, 0), label: 'Grimma' }, at(FROST_GIANT, 5, 0), at(FROST_GIANT, 1, 1, 'archer')];
      const vet = [at(WARRIOR_VETERAN, 2, 2), at(WARRIOR_VETERAN, 4, 2)];
      let list;
      if (n <= 1) list = [fg[0]];                                               // 3900 XP: Moderate to High for one
      else if (n === 2) list = [fg[0], vet[0]];                                 // 4600 XP: Low to Moderate for two
      else if (n === 3) list = [fg[0], fg[2], vet[0]];                          // 8500 XP: Moderate for three
      else list = [fg[0], fg[1], fg[2]];                                        // 11700 XP: Moderate to High for four
      if (flags.track) list = list.filter((f) => f !== fg[2]);
      return label(list);
    },
  },
  // Chapter 19, "Shepherd's Level" (level 13): fire giants at a forge in an
  // old lead mine, with ogres working the bellows. Fire Resistance helps;
  // Hammer Throw knocks you back. Opening the sluice (flag `sluice`) floods
  // the lower level and the ogres with it.
  mine: {
    name: 'The forge', level: 13,
    walls: ['0,4', '1,4', '6,4', '7,4', '3,1'],
    cover: ['2,2', '5,2', '4,6'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const fg = [{ ...at(FIRE_GIANT, 4, 0), label: 'Burr' }, at(FIRE_GIANT, 1, 0)];
      const og = [at(OGRE, 2, 3), at(OGRE, 5, 3), at(OGRE, 6, 1)];
      let list;
      if (n <= 1) list = [fg[0]];                                               // 5000 XP: High for one
      else if (n === 2) list = [fg[0], og[0]];                                  // 5450 XP: Moderate for two
      else if (n === 3) list = [fg[0], fg[1]];                                  // 10000 XP: Moderate to High for three
      else list = [fg[0], fg[1], og[0], og[1], og[2]];                          // 11350 XP: Moderate for four
      if (flags.sluice) list = list.filter((f) => f.def !== OGRE);
      return label(list);
    },
  },
  // Chapter 20, "Saint Botolph's" (level 14): the archmage Simon Pettifer in
  // the ruined abbey church, with a stone golem and a bound bone devil.
  // Magic Resistance: Advantage on saves against spells. Breaking the chalk
  // circle (flag `circle`) sends the devil home before the fight.
  abbey: {
    name: 'The abbey church', level: 14,
    walls: ['1,2', '6,2', '1,5', '6,5', '3,4', '4,6'],
    cover: ['3,1', '4,1', '2,6'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const mage = { ...at(ARCHMAGE, 4, 0, 'caster'), label: 'Simon Pettifer' };
      const devil = at(BONE_DEVIL, 2, 1);
      const golem = at(STONE_GOLEM, 5, 2);
      const vet = [at(WARRIOR_VETERAN, 3, 3), at(WARRIOR_VETERAN, 4, 3)];
      let list;
      if (n <= 1) list = [golem];                                               // 5900 XP: Moderate to High for one
      else if (n === 2) list = [golem, vet[0], vet[1]];                         // 7300 XP: Moderate for two
      else if (n === 3) list = [mage, vet[0]];                                  // 8700 XP: Moderate for three
      else list = [mage, devil];                                                // 13000 XP: Moderate for four
      if (flags.circle) list = list.filter((f) => f !== devil);
      return label(list);
    },
  },
  // Chapter 21, "The Undercroft" (level 15): Abbot Godric, three hundred years
  // dead, and the brothers who were buried with him. Dreadful Glare, Legendary
  // Actions, and a curse that stops healing. Bricking up the charnel passage
  // (flag `bricked`) keeps two Wights out.
  undercroft: {
    name: 'The undercroft', level: 15,
    walls: ['0,2', '2,2', '5,2', '7,2', '0,6', '7,6'],
    cover: ['3,4', '4,4'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const abbot = { ...at(MUMMY_LORD, 4, 0, 'caster'), label: 'Abbot Godric' };
      const wi = [at(WIGHT, 1, 1), at(WIGHT, 6, 1), at(WIGHT, 3, 1), at(WIGHT, 5, 0), at(WIGHT, 2, 0), at(WIGHT, 4, 2)];
      const gh = [at(GHAST, 3, 3), at(GHAST, 4, 3)];
      let list;
      // One or two heroes meet the brothers without the abbot, who stays on his tomb.
      if (n <= 1) list = [...wi.slice(0, 5), gh[0]];                            // 3950 XP: Moderate for one
      else if (n === 2) list = [...wi, gh[0], gh[1]];                           // 5100 XP: Low for two
      else if (n === 3) list = [abbot];                                         // 13000 XP: Moderate for three
      else list = [abbot, wi[0], wi[1], wi[2], wi[3], gh[0], gh[1]];            // 16700 XP: Moderate for four
      if (flags.bricked) list = list.filter((f) => f !== wi[0] && f !== wi[1]);
      return label(list);
    },
  },
  // Chapter 22, "Garside Hall" (level 16): Lady Cecily Garside, a Vampire, with
  // her household knights and the dead of her family. Bite and Life Drain heal
  // her. Catching her in the chapel at sunset (flag `coffin`) leaves the
  // knights up at the house.
  garside: {
    name: 'Garside chapel', level: 16,
    walls: ['0,2', '1,2', '6,2', '7,2', '3,5'],
    cover: ['2,4', '5,4', '4,1'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const vamp = { ...at(VAMPIRE, 3, 0), label: 'Lady Cecily Garside' };
      const kn = [at(KNIGHT, 2, 1), at(KNIGHT, 5, 1), at(KNIGHT, 6, 3)];
      const wi = [at(WIGHT, 1, 0), at(WIGHT, 6, 0), at(WIGHT, 1, 3), at(WIGHT, 5, 3)];
      const as = at(ASSASSIN, 6, 1);
      let list;
      // One or two heroes meet her household without her: she stays in the gallery.
      if (n <= 1) list = [kn[0], kn[1], wi[0], wi[1], wi[2]];                   // 3500 XP: Low to Moderate for one
      else if (n === 2) list = [kn[0], kn[1], wi[0], wi[1], as];                // 6700 XP: Low for two
      else if (n === 3) list = [vamp, kn[0], kn[1], wi[0], wi[1]];              // 12800 XP: Low to Moderate for three
      else list = [vamp, kn[0], kn[1], kn[2], wi[0], wi[1], wi[2], wi[3]];      // 14900 XP: Low for four
      if (flags.coffin) list = list.filter((f) => f.def !== KNIGHT);
      return label(list);
    },
  },
  // Chapter 23, "Saint Hild's Cell" (level 17): the iron figure from the
  // mine, battering at the door of a chapel on the moor, with Pettifer's two
  // pupils, their hired swords and the stone monk from Saint Botolph's. Fire heals it; its breath is poison.
  // Coming up unseen through the peat (flag `unseen`) catches a pupil and the
  // swords away from it.
  cell: {
    name: "Saint Hild's Cell", level: 17,
    walls: ['2,0', '5,0', '1,1', '6,1', '0,6', '7,5'],
    cover: ['2,4', '5,3', '3,6'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const golem = { ...at(IRON_GOLEM, 3, 1), label: 'The Iron Figure' };
      const mg = [at(MAGE, 1, 0, 'caster'), at(MAGE, 6, 0, 'caster')];
      const kn = [at(KNIGHT, 2, 2), at(KNIGHT, 5, 2)];
      const monk = { ...at(STONE_GOLEM, 4, 2), label: 'The Stone Monk' };
      let list;
      // One hero catches the pupils with the figure still inside the door.
      if (n <= 1) list = [mg[0], mg[1], kn[0], kn[1]];                          // 6000 XP: Moderate for one
      else if (n === 2) list = [golem];                                         // 15000 XP: Moderate to High for two
      else if (n === 3) list = [golem, mg[0], mg[1]];                           // 19600 XP: Moderate for three
      else list = [golem, monk, mg[0], mg[1], kn[0], kn[1]];                    // 26900 XP: Moderate for four
      if (flags.unseen) list = list.filter((f) => f !== mg[1] && f.def !== KNIGHT);
      return label(list);
    },
  },
  // Chapter 24, "The Pit Under the Cell" (level 18): a Balor, half held by
  // the brothers' old binding, and the brothers who stayed down with it.
  // Fire Aura, a whip that pulls you in, and Death Throes when it dies.
  // Saying the brothers' words over their bones (flag `words`) lays the
  // Wights to rest.
  deep: {
    name: 'The pit', level: 18,
    walls: ['0,0', '7,0', '0,1', '7,1', '2,5', '5,5'],
    cover: ['1,3', '6,3'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const balor = at(BALOR, 4, 0);
      const wi = [at(WIGHT, 2, 1), at(WIGHT, 5, 1), at(WIGHT, 1, 2), at(WIGHT, 6, 2), at(WIGHT, 3, 2), at(WIGHT, 4, 3)];
      const fg = at(FIRE_GIANT, 3, 0);
      let list;
      // One or two heroes meet the brothers on the stair; the Balor is still held.
      if (n <= 1) list = [wi[0], wi[1], wi[2], fg];                             // 7100 XP: Moderate for one
      else if (n === 2) list = [...wi.slice(0, 4), fg];                         // 7800 XP: Low to Moderate for two
      else if (n === 3) list = [balor, wi[0]];                                  // 22700 XP: Moderate for three
      else list = [balor, ...wi];                                               // 26200 XP: Low to Moderate for four
      if (flags.words) list = list.filter((f) => f.def !== WIGHT);
      return label(list);
    },
  },
  // Chapter 25, "Old Sedge" (level 19): Skellmaw's mother, an Adult Black
  // Dragon, comes up out of Gallow Fen for the people who killed her child.
  // Legendary Actions and a 60-foot Acid Breath. Firing the reed beds along
  // the dyke (flag `reeds`) keeps her young ones back.
  dyke: {
    name: 'The long dyke', level: 19,
    walls: ['0,3', '1,3', '6,4', '7,4'],
    cover: ['3,2', '4,5', '2,6'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const sedge = { ...at(ADULT_BLACK_DRAGON, 4, 0), label: 'Old Sedge' };
      const yg = [at(YOUNG_BLACK_DRAGON, 1, 1), at(YOUNG_BLACK_DRAGON, 6, 1)];
      const tr = [at(TROLL, 2, 2), at(TROLL, 5, 2)];
      let list;
      // One or two heroes meet her young ones in the reeds; she stays out on the water.
      if (n <= 1) list = [yg[0], tr[0], tr[1]];                                 // 6500 XP: Moderate for one
      else if (n === 2) list = [yg[0], yg[1], tr[0]];                           // 7600 XP: Low to Moderate for two
      else if (n === 3) list = [sedge, yg[0], yg[1]];                           // 17300 XP: Low to Moderate for three
      else list = [sedge, yg[0], yg[1], tr[0], tr[1]];                          // 20900 XP: Low to Moderate for four
      if (flags.reeds && n >= 3) list = list.filter((f) => f.def !== YOUNG_BLACK_DRAGON);
      return label(list);
    },
  },
  // Chapter 26, "Oxlaw" (level 20): Simon Pettifer, a Lich now, in his own
  // house, with the Bone Devils he borrowed. The Pit Fiend who made him a
  // lich watches, and takes whichever side is left. Breaking his spirit jar
  // first (flag `jar`) sends the devils guarding it home.
  oxlaw: {
    name: 'Oxlaw', level: 20,
    walls: ['0,2', '7,2', '2,4', '5,4', '0,7', '7,7'],
    cover: ['3,1', '4,1', '1,5', '6,5'],
    heroStarts: BOTTOM,
    foes(n, flags = {}) {
      const lich = { ...at(LICH, 4, 0, 'caster'), label: 'Simon Pettifer' };
      const bd = [at(BONE_DEVIL, 2, 1), at(BONE_DEVIL, 5, 1), at(BONE_DEVIL, 6, 3)];
      let list;
      // One or two heroes meet the devils on the stair; Pettifer waits upstairs.
      if (n <= 1) list = [bd[2]];                                               // 5000 XP: Low for one
      else if (n === 2) list = [bd[1], bd[2]];                                  // 10000 XP: Low to Moderate for two
      else if (n === 3) list = [lich];                                          // 33000 XP: Moderate to High for three
      else list = [lich, bd[0]];                                                // 38000 XP: Moderate for four
      if (flags.jar && n >= 3) list = list.filter((f) => f !== bd[0] && f !== bd[1]);
      return label(list);
    },
  },
};

export function buildEncounter(id, n, flags = {}) {
  const e = ENCOUNTERS[id];
  const foes = e.foes(n, flags).map((f, i) => buildMonster(f.def, { id: `f${i + 1}`, label: f.label, x: f.x, y: f.y, ai: f.ai }));
  return { walls: e.walls, cover: e.cover || [], heroStarts: e.heroStarts, foes, xp: foes.reduce((s, f) => s + f.xp, 0), level: e.level };
}
