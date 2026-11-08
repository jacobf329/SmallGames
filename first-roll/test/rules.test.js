import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec } from '../src/rules/character.js';
import { SKIRMISH } from '../src/rules/data.js';
import { buildGoblin } from '../src/rules/character.js';
import {
  createBattle, rollInitiative, perform, current, resolveReaction, hitChance, modeFrom, attackOptions, previewMove,
} from '../src/rules/combat.js';
import { aiNext } from '../src/rules/ai.js';
import { setup, setTurn, dice, last } from './helpers.js';

test('Human Soldier Fighter: AC 19 (Defense), 12 HP, Longsword +5 for 1d8+3', () => {
  const f = buildHero(defaultSpec('fighter'));
  assert.equal(f.scores.str, 17);
  assert.equal(f.ac, 19);                     // Chain Mail 16 + Shield 2 + Defense 1
  assert.equal(f.hpMax, 12);                  // d10 max + CON 2
  const ls = f.attacks[0];
  assert.equal(ls.hit.reduce((s, h) => s + h.value, 0), 5);   // STR 3 + PB 2
  assert.equal(ls.dmgFlat.reduce((s, h) => s + h.value, 0), 3); // STR 3
  assert.equal(ls.dice, '1d8');               // one hand: the Shield is in the other
  assert.equal(ls.mastery, 'sap');
});

test('Halfling Criminal Rogue: AC 14, 10 HP, Alert initiative +5, Expertise in Stealth', () => {
  const r = buildHero(defaultSpec('rogue', { species: 'halfling' }));
  assert.equal(r.ac, 14);                     // Leather 11 + DEX 3
  assert.equal(r.hpMax, 10);
  assert.equal(r.initParts.reduce((s, p) => s + p.value, 0), 5);
  assert.equal(r.skills.stealth, 3 + 4);
  assert.equal(r.skills.perception, 1 + 4);
  assert.ok(r.luck);
});

test('hit chance: +5 vs AC 15 is 55%, Advantage and Disadvantage', () => {
  assert.equal(hitChance(5, 15), 0.55);
  assert.ok(Math.abs(hitChance(5, 15, 'advantage') - (1 - 0.45 ** 2)) < 1e-9);
  assert.ok(Math.abs(hitChance(5, 15, 'disadvantage') - 0.55 ** 2) < 1e-9);
  assert.equal(hitChance(20, 5), 0.95);       // a natural 1 still misses
  assert.equal(hitChance(0, 30), 0.05);       // a natural 20 still hits
});

test('Advantage and Disadvantage cancel out', () => {
  assert.equal(modeFrom([1], [1, 2]), 'normal');
  assert.equal(modeFrom([1], []), 'advantage');
});

test('attack: d20 + mods vs AC, damage applied, record explains it', () => {
  const b = setup();
  dice(b, 12, 8, 2);            // d20 12, longsword 8, Savage Attacker reroll 2
  const r = perform(b, 'fighter', { a: 'attack', target: 'g1', attack: 'longsword' });
  assert.ok(r.ok);
  const a = last(b, 'attack');
  assert.equal(a.total, 17);
  assert.equal(a.outcome, 'hit');
  assert.equal(a.damage.total, 8 + 3);      // kept the higher Savage Attacker roll
  assert.match(a.damage.parts[0].savage, /Savage Attacker/);
  assert.equal(b.creatures.g1.hp, 0);
  assert.ok(b.creatures.g1.dead);
  assert.equal(b.turn.action, 0);
  assert.ok(!perform(b, 'fighter', { a: 'attack', target: 'g1', attack: 'longsword' }).ok, 'only one action');
});

test('natural 20 doubles the damage dice; natural 1 always misses', () => {
  const b = setup({ goblins: [{ x: 3, y: 4 }, { x: 4, y: 4 }] });
  b.creatures.g1.hp = 99;
  dice(b, 20, 3, 4, 1, 1);      // crit: 2d8 = 3+4, savage reroll 1+1
  perform(b, 'fighter', { a: 'attack', target: 'g1', attack: 'longsword' });
  const a = last(b, 'attack');
  assert.equal(a.outcome, 'crit');
  assert.equal(a.damage.total, 7 + 3);
  setTurn(b, 'fighter');
  b.creatures.fighter.savage = false;
  dice(b, 1);
  perform(b, 'fighter', { a: 'attack', target: 'g2', attack: 'longsword' });
  assert.equal(last(b, 'attack').outcome, 'fumble');
});

test('Sneak Attack needs an ally next to the target, once per turn', () => {
  // Rogue shoots a goblin the Fighter is standing next to.
  const b = setup({ fighter: { x: 3, y: 5 }, rogue: { x: 3, y: 9 }, goblins: [{ x: 3, y: 4 }], who: 'rogue' });
  b.creatures.g1.hp = 99;
  dice(b, 15, 4, 5);            // d20, shortbow 1d6, sneak 1d6
  perform(b, 'rogue', { a: 'attack', target: 'g1', attack: 'shortbow' });
  const a = last(b, 'attack');
  assert.ok(a.damage.parts.some((p) => p.rule === 'sneak-attack'));
  assert.equal(a.damage.total, 4 + 3 + 5);

  // No ally next to the target: no Sneak Attack.
  const c = setup({ fighter: { x: 0, y: 0 }, rogue: { x: 3, y: 9 }, goblins: [{ x: 3, y: 4 }], who: 'rogue' });
  c.creatures.g1.hp = 99;
  dice(c, 15, 4);
  perform(c, 'rogue', { a: 'attack', target: 'g1', attack: 'shortbow' });
  assert.ok(!last(c, 'attack').damage.parts.some((p) => p.rule === 'sneak-attack'));
});

test('Vex: a hit gives Advantage on the next attack against that target', () => {
  const b = setup({ fighter: { x: 0, y: 0 }, rogue: { x: 3, y: 9 }, goblins: [{ x: 3, y: 4 }], who: 'rogue' });
  b.creatures.g1.hp = 99;
  dice(b, 15, 2);
  perform(b, 'rogue', { a: 'attack', target: 'g1', attack: 'shortbow' });
  assert.equal(last(b, 'attack').mastery.name, 'Vex');
  // Next turn the Rogue has Advantage (and so Sneak Attack).
  setTurn(b, 'rogue');
  const opt = attackOptions(b, b.creatures.rogue, b.creatures.g1).find((o) => o.atk.id === 'shortbow');
  assert.equal(opt.mode, 'advantage');
  assert.ok(opt.sneak);
});

test('Sap: the target has Disadvantage on its next attack', () => {
  const b = setup();
  b.creatures.g1.hp = 99;
  dice(b, 15, 5, 1);
  perform(b, 'fighter', { a: 'attack', target: 'g1', attack: 'longsword' });
  assert.equal(last(b, 'attack').mastery.name, 'Sap');
  setTurn(b, 'g1');
  const opt = attackOptions(b, b.creatures.g1, b.creatures.fighter).find((o) => o.atk.id === 'scimitar');
  assert.equal(opt.mode, 'disadvantage');
});

test('leaving reach provokes an Opportunity Attack; Disengage prevents it', () => {
  const b = setup({ fighter: { x: 3, y: 5 }, goblins: [{ x: 3, y: 4 }] });
  const pv = previewMove(b, 'fighter', 3, 8);
  assert.deepEqual(pv.oas, ['g1']);
  perform(b, 'fighter', { a: 'move', x: 3, y: 8 });
  assert.equal(b.pending?.reactor, 'g1');
  assert.ok(!perform(b, 'fighter', { a: 'end' }).ok, 'nothing happens until the reaction is answered');
  dice(b, 2);                    // goblin misses
  resolveReaction(b, true);
  assert.equal(b.creatures.fighter.y, 8, 'movement carries on after the reaction');
  assert.equal(b.creatures.g1.reaction, false);

  const c = setup({ fighter: { x: 3, y: 5 }, goblins: [{ x: 3, y: 4 }] });
  perform(c, 'fighter', { a: 'disengage' });
  assert.deepEqual(previewMove(c, 'fighter', 3, 8).oas, []);
  perform(c, 'fighter', { a: 'move', x: 3, y: 8 });
  assert.equal(c.pending, null);
});

test('Dodge gives attackers Disadvantage; ranged attacks next to an enemy have Disadvantage', () => {
  const b = setup();
  perform(b, 'fighter', { a: 'dodge' });
  setTurn(b, 'g1');
  assert.equal(attackOptions(b, b.creatures.g1, b.creatures.fighter)[0].mode, 'disadvantage');
  const bow = attackOptions(b, b.creatures.g1, b.creatures.rogue).find((o) => o.atk.id === 'shortbow');
  assert.equal(bow.mode, 'disadvantage');
  assert.ok(bow.dis.some((d) => d.rule === 'ranged-in-melee'));
});

test('dropping to 0 HP, death saves, and hits on the Unconscious are Critical Hits', () => {
  const b = setup({ rogue: { x: 3, y: 5 }, fighter: { x: 0, y: 9 }, goblins: [{ x: 3, y: 4 }], who: 'g1' });
  const R = b.creatures.rogue;
  R.hp = 3;
  dice(b, 15, 4);                // hit for 4 + 2
  perform(b, 'g1', { a: 'attack', target: 'rogue', attack: 'scimitar' });
  assert.equal(R.hp, 0);
  assert.ok(last(b, 'attack').after.downed);
  setTurn(b, 'g1');
  const opt = attackOptions(b, b.creatures.g1, R)[0];
  assert.equal(opt.mode, 'advantage');
  dice(b, 12, 9, 1, 1);          // advantage 12/9 -> hit -> crit (2d6 = 1+1) + 2d4 adv bonus... see below
  perform(b, 'g1', { a: 'attack', target: 'rogue', attack: 'scimitar' });
  const a = last(b, 'attack');
  assert.equal(a.outcome, 'crit');
  assert.equal(R.deathSaves.f, 2, 'a Critical Hit at 0 HP is two failures');
});

test('a natural 20 on a death save brings you back with 1 HP', () => {
  const b = setup();
  const R = b.creatures.rogue;
  R.hp = 0;
  b.order = ['fighter', 'rogue', 'g1'];
  dice(b, 20);
  perform(b, 'fighter', { a: 'end' });
  assert.equal(current(b).id, 'rogue');
  assert.equal(R.hp, 1);
});

test('same seed, same fight', () => {
  const run = () => {
    const heroes = ['fighter', 'rogue'].map((c, i) => Object.assign(buildHero(defaultSpec(c, { species: c === 'rogue' ? 'halfling' : 'human' }), { id: c }), SKIRMISH.heroStarts[i]));
    const b = createBattle({ heroes, foes: SKIRMISH.foes.map(buildGoblin), walls: SKIRMISH.walls, seed: 99 });
    rollInitiative(b);
    for (let i = 0; i < 400 && !b.over; i++) {
      if (b.pending) { resolveReaction(b, true); continue; }
      const c = current(b);
      const r = perform(b, c.id, aiNext(b, c.id) || { a: 'end' });
      if (!r.ok) perform(b, c.id, { a: 'end' });
    }
    return b;
  };
  const one = run(), two = run();
  assert.ok(one.over, 'the AI finishes the fight');
  assert.deepEqual(one.log.map((r) => r.text), two.log.map((r) => r.text));
});

test('AI fights always finish (100 seeds)', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const heroes = ['fighter', 'rogue'].map((c, i) => Object.assign(buildHero(defaultSpec(c, { species: c === 'rogue' ? 'halfling' : 'human' }), { id: c }), SKIRMISH.heroStarts[i]));
    const b = createBattle({ heroes, foes: SKIRMISH.foes.map(buildGoblin), walls: SKIRMISH.walls, seed });
    rollInitiative(b);
    let n = 0;
    while (!b.over && n++ < 1000) {
      if (b.pending) { resolveReaction(b, true); continue; }
      const c = current(b);
      const r = perform(b, c.id, aiNext(b, c.id) || { a: 'end' });
      if (!r.ok) assert.ok(perform(b, c.id, { a: 'end' }).ok);
    }
    assert.ok(b.over, `seed ${seed} finished`);
  }
});
