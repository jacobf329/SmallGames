// Rules added in Phase 2: cover and line of sight, Concentration, casting
// with a higher slot, conditions, the Shield reaction, rests, levels 2 and 3,
// and carrying a hero's state from one fight to the next.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, buildGoblin, spendHitDie, finishShortRest, longRest, heroState, applyState } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform, acAgainst, attackFactors, addCond, resolveReaction, canCast } from '../src/rules/combat.js';
import { lineOfSight } from '../src/rules/grid.js';
import { makeRng } from '../src/rules/rng.js';
import { setTurn, dice, last } from './helpers.js';

const H = (cls, level = 1, at = {}, opts = {}) => Object.assign(buildHero(defaultSpec(cls, { species: 'dwarf', ...opts }), { id: cls, name: cls, level }), at);
const gob = (id, x, y, ai = 'melee') => buildGoblin({ id, label: id, x, y, ai });
function fight(creatures, who, { walls = [], cover = [] } = {}) {
  const b = createBattle({ heroes: creatures.filter((c) => c.side === 'hero'), foes: creatures.filter((c) => c.side === 'foe'), walls, cover, seed: 5 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = creatures.map((c) => c.id);
  setTurn(b, who);
  return b;
}

test('a low wall gives Half Cover: +2 AC; a solid wall blocks line of sight', () => {
  const r = H('rogue', 1, { x: 3, y: 9 });
  const g = gob('g1', 3, 5);
  let b = fight([r, g], 'rogue', { cover: ['3,7'] });
  const bow = r.attacks.find((a) => a.kind === 'ranged');
  const ac = acAgainst(b, r, b.creatures.g1, bow);
  assert.equal(ac.value, g.ac + 2);
  assert.equal(ac.cover.what, 'a low wall');
  b = fight([H('rogue', 1, { x: 3, y: 9 }), gob('g1', 3, 5)], 'rogue', { walls: ['3,7'] });
  assert.equal(lineOfSight(b, b.creatures.rogue, b.creatures.g1), false);
  const res = perform(b, 'rogue', { a: 'attack', target: 'g1', attack: bow.id });
  assert.equal(res.ok, false);
});

test('Concentration: a second Concentration spell ends the first; failing the save after damage ends it', () => {
  const c = H('cleric', 2, { x: 3, y: 7 });
  const f = H('fighter', 2, { x: 4, y: 7 });
  const g = gob('g1', 3, 6);
  const b = fight([c, f, g], 'cleric');
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'bless', targets: ['cleric', 'fighter'] }).ok);
  assert.equal(c.conc.spell, 'bless');
  assert.equal(b.effects.filter((e) => e.type === 'bless').length, 2);
  b.round++; setTurn(b, 'cleric');
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'shield-of-faith', target: 'fighter' }).ok);
  assert.equal(c.conc.spell, 'shield-of-faith');
  assert.equal(b.effects.filter((e) => e.type === 'bless').length, 0, 'Bless ended');
  setTurn(b, 'g1');
  c.hp = 99; c.hpMax = 99;
  dice(b, 19, 3, 1);                      // hit, 3 + 2 damage, then a 1 on the Constitution save
  assert.ok(perform(b, 'g1', { a: 'attack', target: 'cleric', attack: g.attacks[0].id }).ok);
  const sv = b.log.find((x) => x.kind === 'save' && x.save === 'concentration');
  assert.ok(sv, 'a Concentration save was made');
  assert.equal(sv.dc, 10);
  assert.equal(c.conc, null);
  assert.equal(b.effects.filter((e) => e.type === 'faith').length, 0);
});

test('casting with a higher slot: Cure Wounds at level 2 rolls 4d8 and spends a level 2 slot', () => {
  const c = H('cleric', 3, { x: 3, y: 7 });
  const f = H('fighter', 3, { x: 3, y: 6 });
  f.hp = 1;
  const b = fight([c, f, gob('g1', 0, 0)], 'cleric');
  assert.equal(canCast(b, c, 'cure-wounds', 2).slot, 2);
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'cure-wounds', target: 'fighter', slot: 2 }).ok);
  assert.equal(c.casting.slots[2].left, 1);
  assert.equal(c.casting.slots[1].left, 4);
  const h = last(b, 'heal');
  assert.equal(h.roll.rolls.length, 4);
});

test('Prone and Restrained: Advantage and Disadvantage from conditions', () => {
  const f = H('fighter', 1, { x: 3, y: 6 });
  const r = H('rogue', 1, { x: 3, y: 9 });
  const g = gob('g1', 3, 5);
  const b = fight([f, r, g], 'fighter');
  dice(b, 1);                              // the goblin's save against the Shove
  assert.ok(perform(b, 'fighter', { a: 'shove', target: 'g1', mode: 'prone' }).ok);
  assert.ok(b.creatures.g1.conds.some((x) => x.id === 'prone'));
  assert.equal(attackFactors(b, f, b.creatures.g1, f.attacks[0]).mode, 'advantage');
  const bow = r.attacks.find((a) => a.kind === 'ranged');
  assert.equal(attackFactors(b, r, b.creatures.g1, bow).mode, 'disadvantage');
  b.creatures.g1.conds = [];
  addCond(b, b.creatures.g1, { id: 'restrained' });
  assert.equal(attackFactors(b, f, b.creatures.g1, f.attacks[0]).mode, 'advantage');
  assert.equal(attackFactors(b, b.creatures.g1, f, g.attacks[0]).mode, 'disadvantage');
});

test('Shield: a Reaction when an attack would hit; +5 AC turns this hit into a miss', () => {
  const w = H('wizard', 2, { x: 3, y: 6 });
  const g = gob('g1', 3, 5);
  const b = fight([w, g], 'g1');
  w.hp = 50;
  dice(b, w.ac + 1 - 4);                   // total = AC + 1: a hit, but not with Shield up
  assert.ok(perform(b, 'g1', { a: 'attack', target: 'wizard', attack: g.attacks[0].id }).ok);
  assert.equal(b.pending?.kind, 'shield');
  resolveReaction(b, true);
  assert.equal(w.casting.slots[1].left, 2);
  assert.equal(w.reaction, false);
  assert.equal(last(b, 'attack').outcome, 'miss');
  assert.equal(w.hp, 50);
});

test('Short Rest: Hit Point Dice heal d10 + CON; Second Wind comes back. Long Rest restores everything', () => {
  const f = H('fighter', 3);
  f.hp = 5; f.secondWind.uses = 0;
  const rng = makeRng(1);
  rng.script = [7];
  const rec = spendHitDie(f, rng);
  assert.ok(rec);
  assert.equal(f.hitDice.left, 2);
  assert.equal(rec.total, 7 + f.mods.con);
  assert.equal(f.hp, 5 + rec.total);
  assert.deepEqual(finishShortRest(f).includes('a use of Second Wind'), true);
  f.actionSurge.uses = 0;
  longRest(f);
  assert.equal(f.hp, f.hpMax);
  assert.equal(f.hitDice.left, 3);
  assert.equal(f.actionSurge.uses, 1);
});

test('levels 2 and 3: Hit Points, slots, features and subclasses', () => {
  const f1 = H('fighter', 1), f2 = H('fighter', 2), f3 = H('fighter', 3);
  assert.equal(f2.hpMax - f1.hpMax, 6 + f1.mods.con + 1);     // fixed d10 value + CON + Dwarven Toughness
  assert.ok(f2.features.some((x) => x.name === 'Action Surge'));
  assert.equal(f3.subclass, 'Champion');
  assert.ok(f3.features.some((x) => x.rule === 'improved-critical'));
  const w2 = H('wizard', 2), c3 = H('cleric', 3);
  assert.deepEqual(Object.fromEntries(Object.entries(w2.casting.slots).map(([k, v]) => [k, v.max])), { 1: 3 });
  assert.deepEqual(Object.fromEntries(Object.entries(c3.casting.slots).map(([k, v]) => [k, v.max])), { 1: 4, 2: 2 });
  assert.ok(c3.casting.known.aid);
});

test('a hero keeps wounds, spent slots and uses between fights, and Poisoned until a Long Rest', () => {
  const c = H('cleric', 3);
  c.hp = 9; c.casting.slots[1].left = 1; c.channel.uses = 0;
  c.conds = [{ id: 'poisoned', lasting: true, rule: 'poisoned' }];
  const st = heroState(c);
  const again = applyState(H('cleric', 3), JSON.parse(JSON.stringify(st)));
  assert.equal(again.hp, 9);
  assert.equal(again.casting.slots[1].left, 1);
  assert.equal(again.channel.uses, 0);
  assert.ok(again.conds.some((x) => x.id === 'poisoned'));
  longRest(again);
  assert.ok(!again.conds.some((x) => x.id === 'poisoned'));
});

test('every rule a chapter teaches, and every feature links to, has a Rules book entry', async () => {
  const { GLOSSARY } = await import('../src/rules/glossary.js');
  const { CHAPTERS } = await import('../src/game/campaign.js');
  for (const ch of Object.values(CHAPTERS)) for (const k of ch.teaches || []) assert.ok(GLOSSARY[k], `chapter rule ${k}`);
  for (const cls of ['fighter', 'rogue', 'cleric', 'wizard']) {
    for (const f of H(cls, 3).features) if (f.rule) assert.ok(GLOSSARY[f.rule], `${cls} feature ${f.name}: ${f.rule}`);
  }
});
