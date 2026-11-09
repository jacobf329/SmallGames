// Encounters for the campaign, sized to the party with the 2024 XP budget
// per hero (SRD 5.2.1, "Combat Encounter Difficulty"):
//   level 1: Low 50, Moderate 75, High 100
//   level 2: Low 100, Moderate 150, High 200
//   level 3: Low 150, Moderate 225, High 400
//   level 4: Low 250, Moderate 375, High 500
//   level 5: Low 500, Moderate 750, High 1100
// XP: Goblin Warrior 50, Goblin Boss 200, Wolf 50, Skeleton 50, Zombie 50,
// Cultist 25, Giant Spider 200, Bugbear Warrior 200, Cultist Fanatic 450,
// Ghoul 200, Dire Wolf 200, Animated Armor 200, Ghast 450, Ogre 450, Wight 700.
//
// The board is 8 squares wide and 10 deep, heroes start at the bottom.
// `walls` are solid (Total Cover, no line of sight); `cover` squares are low
// walls, crates and tombs: you can't walk through them, but they only give
// Half Cover (+2 AC and Dexterity saves).

import { buildMonster } from '../rules/character.js';
import {
  GOBLIN_WARRIOR, GOBLIN_BOSS, WOLF, SKELETON, ZOMBIE, GIANT_SPIDER, CULTIST, CULTIST_FANATIC, BUGBEAR_WARRIOR,
  GHOUL, GHAST, DIRE_WOLF, OGRE, ANIMATED_ARMOR, WIGHT,
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
};

export function buildEncounter(id, n, flags = {}) {
  const e = ENCOUNTERS[id];
  const foes = e.foes(n, flags).map((f, i) => buildMonster(f.def, { id: `f${i + 1}`, label: f.label, x: f.x, y: f.y, ai: f.ai }));
  return { walls: e.walls, cover: e.cover || [], heroStarts: e.heroStarts, foes, xp: foes.reduce((s, f) => s + f.xp, 0), level: e.level };
}
