import { buildHero, buildGoblin } from '../src/rules/character.js';
import { createBattle, rollInitiative } from '../src/rules/combat.js';

// A small battle with creatures placed by hand and the turn set to `who`.
export function setup({ fighter = { x: 3, y: 5 }, rogue = { x: 0, y: 9 }, goblins = [{ x: 3, y: 4 }], who = 'fighter', walls = [] } = {}) {
  const f = Object.assign(buildHero('fighter', { name: 'Ana' }), fighter);
  const r = Object.assign(buildHero('rogue', { name: 'Ben' }), rogue);
  const gs = goblins.map((g, i) => buildGoblin({ id: `g${i + 1}`, label: `Goblin ${i + 1}`, x: g.x, y: g.y, ai: g.ai || 'melee' }));
  const b = createBattle({ heroes: [f, r], foes: gs, walls, seed: 42 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = ['fighter', 'rogue', ...gs.map((g) => g.id)];
  setTurn(b, who);
  return b;
}

export function setTurn(b, who) {
  b.idx = b.order.indexOf(who);
  b.turn = { who, action: 1, bonus: 1, moveLeft: b.creatures[who].speed, moves: 0, steps: 0 };
}

export const dice = (b, ...vals) => { b.rng.script.push(...vals); };
export const last = (b, kind) => [...b.log].reverse().find((r) => r.kind === kind);
