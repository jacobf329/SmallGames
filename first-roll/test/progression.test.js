import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, buildGoblin, freshProgress, applyProgress, harvestProgress } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform } from '../src/rules/combat.js';
import { setTurn, dice, last } from './helpers.js';

const lvl = (cls, level, at, opts = {}) => Object.assign(buildHero(defaultSpec(cls, opts), { id: opts.id || cls, level, gear: opts.gear }), at);
const gob = (id, x, y) => buildGoblin({ id, label: id, x, y, ai: 'melee' });
function fight(creatures, who, potions = 0) {
  const b = createBattle({ heroes: creatures.filter((c) => c.side === 'hero'), foes: creatures.filter((c) => c.side === 'foe'), seed: 5, potions });
  b.rng.script = [];
  rollInitiative(b);
  b.order = creatures.map((c) => c.id);
  setTurn(b, who);
  return b;
}

test('levels: HP, slots, Sneak Attack and features grow', () => {
  assert.equal(lvl('fighter', 3).hpMax, 14 + 2 * (6 + 2 + 2));      // Human: +2 Tough per level
  assert.equal(lvl('rogue', 3).sneak, '2d6');
  assert.deepEqual(Object.keys(lvl('wizard', 3).casting.slots), ['1', '2']);
  assert.ok(lvl('wizard', 3).casting.known['scorching-ray']);
  assert.ok(lvl('cleric', 3).casting.known.aid);
  assert.equal(lvl('fighter', 3).critOn, 19);
});

test('gear: armor, +1 weapon and Cloak of Protection', () => {
  const f = lvl('fighter', 1, {}, { gear: { armor: 'splint', weapon: 1, cloak: true } });
  assert.equal(f.ac, 17 + 2 + 1);
  assert.equal(f.attacks[0].hit.reduce((s, h) => s + h.value, 0), 6);
  const w = lvl('wizard', 1, {}, { gear: { armor: 'splint' } });
  assert.equal(w.ac, 10 + w.mods.dex, "wizards can't wear armor");
});

test('progress carries HP and spent resources into the next fight', () => {
  const c = lvl('cleric', 2);
  const pr = freshProgress(c);
  c.hp = 4; c.casting.slots[1].left = 1; c.channel.uses = 0;
  const after = harvestProgress(c, pr);
  const again = applyProgress(lvl('cleric', 2), after);
  assert.equal(again.hp, 4);
  assert.equal(again.casting.slots[1].left, 1);
  assert.equal(again.channel.uses, 0);
});

test('Action Surge gives a second action; Improved Critical crits on a 19', () => {
  const f = lvl('fighter', 3, { x: 3, y: 5 });
  const b = fight([f, gob('g1', 3, 4)], 'fighter');
  b.creatures.g1.hp = 99;
  dice(b, 19, 4, 4, 1, 1, 1, 1);
  perform(b, 'fighter', { a: 'attack', target: 'g1', attack: 'longsword' });
  assert.equal(last(b, 'attack').outcome, 'crit');
  assert.ok(perform(b, 'fighter', { a: 'action-surge' }).ok);
  dice(b, 2);
  assert.ok(perform(b, 'fighter', { a: 'attack', target: 'g1', attack: 'longsword' }).ok);
  assert.ok(!perform(b, 'fighter', { a: 'action-surge' }).ok);
});

test('Cunning Action and Steady Aim (Rogue)', () => {
  const r = lvl('rogue', 3, { x: 3, y: 9 }, { species: 'halfling' });
  const b = fight([r, gob('g1', 3, 2)], 'rogue');
  assert.ok(perform(b, 'rogue', { a: 'steady-aim' }).ok);
  assert.equal(b.turn.moveLeft, 0);
  b.creatures.g1.hp = 99;
  dice(b, 4, 18, 3, 3, 3);
  perform(b, 'rogue', { a: 'attack', target: 'g1', attack: 'shortbow' });
  const a = last(b, 'attack');
  assert.equal(a.d20.mode, 'advantage');
  assert.ok(a.damage.parts.some((p) => p.rule === 'sneak-attack' && p.rolls.length === 2), '2d6 Sneak Attack');
  setTurn(b, 'rogue');
  assert.ok(perform(b, 'rogue', { a: 'cunning', what: 'dash' }).ok);
  assert.equal(b.turn.moveLeft, 60);
});

test('Divine Spark heals a friend or burns a foe; Disciple of Life boosts healing spells', () => {
  const c = lvl('cleric', 3, { x: 3, y: 9 }, { species: 'dwarf' });
  const f = lvl('fighter', 1, { x: 3, y: 5 });
  const b = fight([c, f, gob('g1', 3, 2)], 'cleric');
  f.hp = 1;
  dice(b, 5);
  assert.ok(perform(b, 'cleric', { a: 'divine-spark', target: 'fighter' }).ok);
  assert.equal(f.hp, 1 + 5 + 3);
  setTurn(b, 'cleric');
  f.hp = 1;
  dice(b, 2, 2);
  perform(b, 'cleric', { a: 'cast', spell: 'healing-word', target: 'fighter' });
  assert.equal(f.hp, 1 + 4 + 3 + 3, '2d4 + WIS + (2 + spell level)');
});

test('Potions: a Bonus Action, from the party supply, for you or an ally next to you', () => {
  const f = lvl('fighter', 1, { x: 3, y: 5 });
  const r = lvl('rogue', 1, { x: 3, y: 6 }, { species: 'halfling' });
  const b = fight([f, r, gob('g1', 0, 0)], 'fighter', 1);
  r.hp = 0;
  dice(b, 1, 1);
  assert.ok(perform(b, 'fighter', { a: 'potion', target: 'rogue' }).ok);
  assert.equal(r.hp, 4);
  assert.equal(b.potions, 0);
  setTurn(b, 'fighter');
  assert.match(perform(b, 'fighter', { a: 'potion' }).error, /no Potions/);
});

test('Aid, Scorching Ray, Misty Step and Potent Cantrip', () => {
  const c = lvl('cleric', 3, { x: 3, y: 9 });
  const f = lvl('fighter', 1, { x: 3, y: 8 });
  const b = fight([c, f, gob('g1', 0, 0)], 'cleric');
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'aid' }).ok);
  assert.equal(f.hpMax, 19);
  assert.equal(c.casting.slots[2].left, 1);

  const w = lvl('wizard', 3, { x: 3, y: 9 });
  const b2 = fight([w, gob('g1', 3, 3), gob('g2', 7, 0)], 'wizard');
  b2.creatures.g1.hp = 99;
  dice(b2, 15, 3, 3, 15, 3, 3, 15, 3, 3);
  perform(b2, 'wizard', { a: 'cast', spell: 'scorching-ray', target: 'g1' });
  assert.equal(b2.log.filter((r) => r.kind === 'attack' && r.spell === 'scorching-ray').length, 3);
  assert.equal(b2.creatures.g1.hp, 99 - 18);
  setTurn(b2, 'wizard');                    // one spell slot per turn: Misty Step waits a turn
  assert.ok(perform(b2, 'wizard', { a: 'cast', spell: 'misty-step', x: 5, y: 6 }).ok);
  assert.deepEqual([w.x, w.y], [5, 6]);
  setTurn(b2, 'wizard');
  dice(b2, 2, 8);
  perform(b2, 'wizard', { a: 'cast', spell: 'fire-bolt', target: 'g1' });
  const a = last(b2, 'attack');
  assert.equal(a.outcome, 'miss');
  assert.equal(a.damage.total, 4, 'Potent Cantrip: half damage on a miss');
});
