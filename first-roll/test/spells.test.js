import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonster } from '../src/rules/character.js';
import { GOBLIN_BOSS } from '../src/rules/data.js';
import { createBattle, rollInitiative, perform, attackOptions, canCast, coneTargets } from '../src/rules/combat.js';
import { buildGoblin } from '../src/rules/character.js';
import { hero, setTurn, dice, last } from './helpers.js';

// A battle with the given creatures; `who` gets the turn.
function fight(creatures, who) {
  const heroes = creatures.filter((c) => c.side === 'hero');
  const foes = creatures.filter((c) => c.side === 'foe');
  const b = createBattle({ heroes, foes, seed: 3 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = creatures.map((c) => c.id);
  setTurn(b, who);
  return b;
}
const gob = (id, x, y, ai = 'melee') => buildGoblin({ id, label: id, x, y, ai });

test('Fire Bolt: a spell attack (INT + PB), a cantrip, no slot, no Sneak Attack or Savage Attacker', () => {
  const w = hero('wizard', { species: 'elf' }, { x: 0, y: 9 });
  const b = fight([w, gob('g1', 0, 3)], 'wizard');
  b.creatures.g1.hp = 99;
  dice(b, 12, 7);
  const r = perform(b, 'wizard', { a: 'cast', spell: 'fire-bolt', target: 'g1' });
  assert.ok(r.ok, r.error);
  const a = last(b, 'attack');
  assert.equal(a.total, 12 + 3 + 2);
  assert.equal(a.damage.total, 7);
  assert.equal(a.rule, 'spell-attack');
  assert.equal(w.casting.slots[1].left, 2);
  assert.equal(last(b, 'cast').pay, null);
});

test('Healing Word is a Bonus Action that gets a dying ally up; only one spell slot per turn', () => {
  const c = hero('cleric', { species: 'dwarf', background: 'soldier' }, { x: 3, y: 5 });
  const f = hero('fighter', {}, { x: 3, y: 7 });
  const b = fight([c, f, gob('g1', 3, 2)], 'cleric');
  f.hp = 0;
  dice(b, 3, 2);
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'healing-word', target: 'fighter' }).ok);
  assert.equal(f.hp, 3 + 2 + 2);                      // 2d4 + WIS 2 (Soldier doesn't raise WIS)
  assert.equal(b.turn.bonus, 0);
  assert.equal(b.turn.action, 1, 'the action is still free');
  assert.equal(c.casting.slots[1].left, 1);
  const r = perform(b, 'cleric', { a: 'cast', spell: 'guiding-bolt', target: 'g1' });
  assert.match(r.error, /one spell slot per turn/);
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'sacred-flame', target: 'g1' }).ok, 'a cantrip is still fine');
});

test('Magic Initiate: the free cast is used before a slot', () => {
  const w = hero('wizard', { background: 'sage' }, { x: 0, y: 9 });
  const b = fight([w, gob('g1', 0, 3)], 'wizard');
  b.creatures.g1.hp = 99;
  assert.equal(canCast(b, w, 'magic-missile').pay, 'free');
  dice(b, 1, 2, 3);
  perform(b, 'wizard', { a: 'cast', spell: 'magic-missile', target: 'g1' });
  assert.equal(last(b, 'missile').total, 1 + 2 + 3 + 3);
  assert.equal(w.casting.slots[1].left, 2);
  assert.equal(w.casting.known['magic-missile'].free, 0);
});

test('Sacred Flame: the target makes a Dexterity save against the spell save DC', () => {
  const c = hero('cleric', { species: 'dwarf' }, { x: 3, y: 8 });
  const b = fight([c, gob('g1', 3, 3)], 'cleric');
  b.creatures.g1.hp = 99;
  dice(b, 6, 5);                         // damage 6 is rolled first; goblin rolls 5 + DEX 2 = 7 vs DC 13: fails
  perform(b, 'cleric', { a: 'cast', spell: 'sacred-flame', target: 'g1' });
  const r = last(b, 'save-spell');
  assert.equal(r.dc, 8 + 3 + 2);
  assert.equal(r.results[0].success, false);
  assert.equal(r.results[0].damage, 6);
});

test('Burning Hands: everyone in the Cone saves, allies too; half damage on a success', () => {
  const w = hero('wizard', {}, { x: 3, y: 6 });
  const f = hero('fighter', {}, { x: 2, y: 4 });
  const b = fight([w, f, gob('g1', 3, 5), gob('g2', 3, 4)], 'wizard');
  for (const g of ['g1', 'g2']) b.creatures[g].hp = 99;
  f.hp = 99;
  const caught = coneTargets(b, w, 3, 5).map((c) => c.id).sort();
  assert.deepEqual(caught, ['fighter', 'g1', 'g2']);
  dice(b, 4, 4, 4, /* saves: */ 20, 2, 2);
  perform(b, 'wizard', { a: 'cast', spell: 'burning-hands', x: 3, y: 5 });
  const r = last(b, 'save-spell');
  const byId = Object.fromEntries(r.results.map((x) => [x.target, x]));
  assert.equal(r.damage.total, 12);
  assert.equal(Object.values(byId).filter((x) => x.success).length, 1);
  assert.equal(Object.values(byId).find((x) => x.success).damage, 6);
});

test('Guiding Bolt gives the next attacker Advantage; Ray of Frost slows', () => {
  const c = hero('cleric', {}, { x: 3, y: 9 });
  const f = hero('fighter', {}, { x: 3, y: 4 });
  const b = fight([c, f, gob('g1', 3, 3)], 'cleric');
  b.creatures.g1.hp = 99;
  dice(b, 15, 1, 1, 1, 1);
  perform(b, 'cleric', { a: 'cast', spell: 'guiding-bolt', target: 'g1' });
  setTurn(b, 'fighter');
  assert.equal(attackOptions(b, f, b.creatures.g1)[0].mode, 'advantage');

  const w = hero('wizard', {}, { x: 0, y: 9 });
  const b2 = fight([w, gob('g1', 0, 4)], 'wizard');
  b2.creatures.g1.hp = 99;
  dice(b2, 15, 3);
  perform(b2, 'wizard', { a: 'cast', spell: 'ray-of-frost', target: 'g1' });
  perform(b2, 'wizard', { a: 'end' });
  assert.equal(b2.turn.who, 'g1');
  assert.equal(b2.turn.moveLeft, 20);
});

test('Goblin Boss: Multiattack makes two attacks; Redirect Attack swaps in a goblin', () => {
  const f = hero('fighter', {}, { x: 3, y: 5 });
  const boss = buildMonster(GOBLIN_BOSS, { id: 'boss', label: 'Boss', x: 3, y: 4 });
  const g = gob('g1', 4, 4);
  const b = fight([f, boss, g], 'boss');
  f.hp = 99;
  dice(b, 2, 2);
  assert.ok(perform(b, 'boss', { a: 'attack', target: 'fighter', attack: 'scimitar' }).ok);
  assert.ok(perform(b, 'boss', { a: 'attack', target: 'fighter', attack: 'scimitar' }).ok, 'second attack of Multiattack');
  assert.ok(!perform(b, 'boss', { a: 'attack', target: 'fighter', attack: 'scimitar' }).ok, 'no third');

  setTurn(b, 'fighter');
  boss.reaction = true;
  dice(b, 2);
  perform(b, 'fighter', { a: 'attack', target: 'boss', attack: 'longsword' });
  assert.equal(last(b, 'attack').target, 'g1');
  assert.deepEqual([boss.x, boss.y, g.x, g.y], [4, 4, 3, 4]);
  assert.equal(boss.reaction, false);
});

test('Orc: Relentless Endurance keeps you at 1 HP once; Adrenaline Rush gives Temporary HP', () => {
  const o = hero('fighter', { species: 'orc' }, { x: 3, y: 5 });
  const b = fight([o, gob('g1', 3, 4)], 'fighter');
  assert.ok(perform(b, 'fighter', { a: 'adrenaline' }).ok);
  assert.equal(o.tempHp, 2);
  assert.equal(b.turn.moveLeft, 60);
  setTurn(b, 'g1');
  o.hp = 3;
  dice(b, 15, 6);                         // 6 + 2 = 8: 2 to Temporary HP, then 6 to HP
  perform(b, 'g1', { a: 'attack', target: 'fighter', attack: 'scimitar' });
  const a = last(b, 'attack');
  assert.equal(a.after.temp, 2);
  assert.ok(a.after.relentless);
  assert.equal(o.hp, 1);
});

test('Dragonborn Breath Weapon replaces an attack; Goliath Fire\'s Burn adds 1d10 once per turn', () => {
  const d = hero('fighter', { species: 'dragonborn' }, { x: 3, y: 5 });
  const b = fight([d, gob('g1', 3, 4), gob('g2', 3, 3)], 'fighter');
  dice(b, 8, 1, 1);                       // 1d10 = 8; both goblins roll 1 + 2 = 3 vs DC 12
  assert.ok(perform(b, 'fighter', { a: 'breath', x: 3, y: 4 }).ok);
  const r = last(b, 'save-spell');
  assert.equal(r.dc, 8 + 2 + 2);
  assert.equal(r.results.length, 2);
  assert.equal(b.creatures.g1.hp, 2);
  assert.equal(b.creatures.g2.hp, 2);
  assert.equal(d.breath.uses, 1);

  const g = hero('fighter', { species: 'goliath' }, { x: 3, y: 5 });
  const b2 = fight([g, gob('g1', 3, 4)], 'fighter');
  b2.creatures.g1.hp = 99;
  dice(b2, 15, 4, 1, 7);
  perform(b2, 'fighter', { a: 'attack', target: 'g1', attack: 'longsword' });
  const a = last(b2, 'attack');
  assert.ok(a.damage.parts.some((p) => p.rule === 'fires-burn' && p.value === 7));
  assert.equal(g.firesBurn.uses, 1);
});
