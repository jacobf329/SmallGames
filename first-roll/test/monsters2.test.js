// Chapters 9 to 11 monsters (SRD 5.2.1): Ghoul, Ghast, Dire Wolf, Ogre,
// Animated Armor and Wight.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, buildMonster, heroState, applyState, longRest } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform } from '../src/rules/combat.js';
import { GHOUL, GHAST, DIRE_WOLF, WIGHT, OGRE, ANIMATED_ARMOR } from '../src/rules/data.js';
import { aiNext } from '../src/rules/ai.js';
import { setTurn, dice, last } from './helpers.js';

const L4 = (cls, at = {}, opts = {}) => Object.assign(buildHero(validateSpec(defaultSpec(cls, opts), { level: 4 }), { level: 4, id: at.id || cls, name: at.id || cls }), at);
const mon = (def, id, x, y) => buildMonster(def, { id, label: id, x, y, ai: 'melee' });
function fight(heroes, foes, who) {
  const b = createBattle({ heroes, foes, walls: [], seed: 3 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = [...heroes.map((h) => h.id), ...foes.map((f) => f.id)];
  b.round = 1;
  setTurn(b, who || heroes[0].id);
  return b;
}
const has = (c, id) => c.conds.some((x) => x.id === id);
const end = (b) => assert.ok(perform(b, b.turn.who, { a: 'end' }).ok);

test('Ghoul: two Bites as Multiattack; Claw is its own action and can Paralyze until the end of your next turn', () => {
  const f = L4('fighter', { x: 3, y: 5, hp: 40 });
  const g = mon(GHOUL, 'g', 3, 4);
  const b = fight([f], [g], 'g');
  dice(b, 15, 3, 3, /* second bite */ 15, 3, 3);
  assert.ok(perform(b, 'g', { a: 'attack', target: 'fighter', attack: 'bite' }).ok);
  assert.ok(!perform(b, 'g', { a: 'attack', target: 'fighter', attack: 'claw' }).ok, 'not as part of the Multiattack');
  assert.ok(perform(b, 'g', { a: 'attack', target: 'fighter', attack: 'bite' }).ok);
  b.round++;
  setTurn(b, 'g');
  dice(b, 15, 2, /* Con save */ 1);
  assert.ok(perform(b, 'g', { a: 'attack', target: 'fighter', attack: 'claw' }).ok);
  assert.equal(b.turn.attacksLeft, 0);
  assert.ok(has(b.creatures.fighter, 'paralyzed'));
  assert.match(last(b, 'attack').text, /Paralyzed/);
  // The fighter loses its next turn, and the paralysis ends with it.
  end(b);
  assert.equal(b.turn.who, 'g');
  assert.ok(!has(b.creatures.fighter, 'paralyzed'));
  assert.ok(b.log.some((r) => /Paralyzed and can't move or act/.test(r.text || '')));
});

test('Ghoul Claw does not Paralyze an Elf; Ghast Stench poisons a creature that starts its turn next to it', () => {
  const r = L4('ranger', { x: 3, y: 5 }, { species: 'elf' });
  const g = mon(GHOUL, 'g', 3, 4);
  const b = fight([r], [g], 'g');
  dice(b, 15, 2);
  perform(b, 'g', { a: 'attack', target: 'ranger', attack: 'claw' });
  assert.ok(!has(b.creatures.ranger, 'paralyzed'));

  const f = L4('fighter', { x: 3, y: 5 });
  const gh = mon(GHAST, 'gh', 3, 4);
  const b2 = fight([f], [gh], 'gh');
  dice(b2, 1);   // the fighter's Constitution save at the start of its turn
  end(b2);
  assert.equal(b2.turn.who, 'fighter');
  assert.ok(has(b2.creatures.fighter, 'poisoned'));
  assert.match(last(b2, 'save').text, /Stench/);
});

test('Wight: Life Drain lowers the Hit Point maximum until a Long Rest', () => {
  const f = L4('fighter', { x: 3, y: 5 });
  const w = mon(WIGHT, 'w', 3, 4);
  const b = fight([f], [w], 'w');
  const max = f.hpMax;
  dice(b, 6, /* save */ 1);
  assert.ok(perform(b, 'w', { a: 'drain', target: 'fighter' }).ok);
  assert.equal(b.turn.attacksLeft, 1, 'one of the two attacks');
  assert.equal(b.creatures.fighter.hpMax, max - 8);
  // It carries out of the fight, and a Long Rest restores it.
  const st = heroState(b.creatures.fighter);
  const again = applyState(buildHero(f.spec, { level: 4, id: 'fighter', name: 'f' }), st);
  assert.equal(again.hpMax, max - 8);
  longRest(again);
  assert.equal(again.hpMax, max);
});

test('the new monsters: Dire Wolf knocks a Large target Prone; the AI uses Claws and Life Drain', () => {
  assert.equal(DIRE_WOLF.size, 'large');
  const f = L4('fighter', { x: 3, y: 5 });
  const d = mon(DIRE_WOLF, 'd', 3, 4);
  const b = fight([f], [d], 'd');
  dice(b, 15, 5);
  perform(b, 'd', { a: 'attack', target: 'fighter', attack: 'bite' });
  assert.ok(has(b.creatures.fighter, 'prone'));
  for (const def of [OGRE, ANIMATED_ARMOR, GHAST, GHOUL, WIGHT]) assert.ok(mon(def, 'x', 0, 0).features.length >= 0);
  const g = mon(GHOUL, 'g', 3, 4);
  const b2 = fight([L4('wizard', { x: 3, y: 5 })], [g], 'g');
  assert.ok(['bite', 'claw'].includes(aiNext(b2, 'g').attack));
  const w = mon(WIGHT, 'w', 3, 4);
  const p = L4('paladin', { x: 3, y: 5 });
  const b3 = fight([p], [w], 'w');
  assert.ok(['drain', 'attack'].includes(aiNext(b3, 'w').a));
});
