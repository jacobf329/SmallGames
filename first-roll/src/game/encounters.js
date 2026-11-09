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
// XP: Goblin Warrior 50, Goblin Boss 200, Wolf 50, Skeleton 50, Zombie 50,
// Cultist 25, Giant Spider 200, Bugbear Warrior 200, Cultist Fanatic 450,
// Ghoul 200, Dire Wolf 200, Animated Armor 200, Ghast 450, Ogre 450, Wight 700,
// Bandit Captain 450, Black Dragon Wyrmling 450, Warrior Veteran 700, Hobgoblin
// Captain 700, Knight 700, Owlbear 700, Troll 1800, Hill Giant 1800, Mage 2300,
// Young Black Dragon 2900.
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
};

export function buildEncounter(id, n, flags = {}) {
  const e = ENCOUNTERS[id];
  const foes = e.foes(n, flags).map((f, i) => buildMonster(f.def, { id: `f${i + 1}`, label: f.label, x: f.x, y: f.y, ai: f.ai }));
  return { walls: e.walls, cover: e.cover || [], heroStarts: e.heroStarts, foes, xp: foes.reduce((s, f) => s + f.xp, 0), level: e.level };
}
