// Encounters for the campaign, sized to the party with the 2024 XP budget
// per level 1 hero: Low 50, Moderate 75, High 100. Goblin Warrior = 50 XP,
// Goblin Boss = 200 XP.

import { buildMonster } from '../rules/character.js';
import { GOBLIN_WARRIOR, GOBLIN_BOSS } from '../rules/data.js';

const W = GOBLIN_WARRIOR, BOSS = GOBLIN_BOSS;

export const ENCOUNTERS = {
  // Chapter 2, "Your First Fight": Low difficulty, one goblin per hero.
  road: {
    name: 'The road',
    walls: ['1,5', '2,5', '5,4', '6,4', '6,5', '3,1'],
    heroStarts: [{ x: 3, y: 8 }, { x: 4, y: 9 }, { x: 2, y: 9 }, { x: 5, y: 8 }],
    foes(n) {
      const spots = [
        { x: 2, y: 2, ai: 'melee' }, { x: 5, y: 2, ai: 'melee' }, { x: 4, y: 0, ai: 'archer' }, { x: 1, y: 1, ai: 'archer' },
      ];
      return spots.slice(0, Math.max(1, n)).map((s, i) => ({ def: W, label: `Goblin ${i + 1}`, ...s }));
    },
  },
  // Chapter 3, "Weapon Mastery and Teamwork": the boss and its guards.
  camp: {
    name: 'The goblin camp',
    walls: ['0,3', '1,3', '6,2', '7,2', '3,5', '4,5', '1,7', '6,7'],
    heroStarts: [{ x: 3, y: 8 }, { x: 4, y: 8 }, { x: 2, y: 9 }, { x: 5, y: 9 }],
    foes(n) {
      const boss = { def: BOSS, label: 'Goblin Boss', x: 4, y: 1, ai: 'melee' };
      const g = (i, x, y, ai) => ({ def: W, label: `Goblin ${i}`, x, y, ai });
      if (n <= 1) return [g(1, 3, 2, 'melee'), g(2, 5, 1, 'archer')];            // 100 XP: High for one
      if (n === 2) return [boss];                                               // 200 XP: High for two
      if (n === 3) return [boss, g(1, 3, 1, 'melee')];                          // 250 XP: between Moderate and High
      return [boss, g(1, 3, 1, 'melee'), g(2, 6, 0, 'archer')];                 // 300 XP: Moderate for four
    },
  },
};

export function buildEncounter(id, n) {
  const e = ENCOUNTERS[id];
  const foes = e.foes(n).map((f, i) => buildMonster(f.def, { id: `f${i + 1}`, label: f.label, x: f.x, y: f.y, ai: f.ai }));
  return { walls: e.walls, heroStarts: e.heroStarts, foes, xp: foes.reduce((s, f) => s + f.xp, 0) };
}
