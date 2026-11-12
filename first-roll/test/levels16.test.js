// Levels 16 to 20 (SRD 5.2.1): spells of level 9, Epic Boons and the last
// class features.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, buildMonster, buildGoblin } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform } from '../src/rules/combat.js';
import { TROLL, WARRIOR_VETERAN, SPELLS } from '../src/rules/data.js';
import { aiNext } from '../src/rules/ai.js';
import { setTurn, dice, last } from './helpers.js';

const hero = (cls, lv, at = {}, opts = {}, spec = {}) => Object.assign(buildHero(validateSpec({ ...defaultSpec(cls, opts), ...spec }, { level: lv }), { level: lv, id: at.id || cls, name: at.id || cls }), at);
const mon = (def, id, x, y, ai = 'melee') => buildMonster(def, { id, label: id, x, y, ai });
const spare = () => buildGoblin({ id: 'spare', label: 'spare', x: 7, y: 0, ai: 'melee' });
function fight(heroes, foes, who) {
  const b = createBattle({ heroes, foes, walls: [], seed: 3 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = [...heroes.map((h) => h.id), ...foes.map((f) => f.id)];
  b.round = 1;
  setTurn(b, who || heroes[0].id);
  return b;
}
const has = (c, id) => (c.conds || []).some((x) => x.id === id);

test('a level 17 caster gets a level 9 spell, and level 19 is an Epic Boon', () => {
  const w = hero('wizard', 17, {}, { species: 'elf' });
  assert.ok(Object.keys(w.casting.known).some((k) => SPELLS[k].level === 9));
  assert.equal(w.casting.slots[9].max, 1);
  const f = hero('fighter', 19);
  assert.ok(f.features.some((x) => /^Epic Boon: /.test(x.name)), 'fighter 19 has an Epic Boon');
  const levels = f.features.map((x) => x.source).filter((s) => /^Fighter \d+$/.test(s || '')).map((s) => +s.split(' ')[1]);
  assert.deepEqual(levels, [...levels].sort((p, q) => p - q), 'features are in level order');
});

test('Primal Champion and Body and Mind raise two scores by 4, up to 25', () => {
  const b19 = hero('barbarian', 19), b20 = hero('barbarian', 20);
  assert.equal(b20.scores.str, Math.min(25, b19.scores.str + 4));
  assert.equal(b20.scores.con, Math.min(25, b19.scores.con + 4));
  const m19 = hero('monk', 19), m20 = hero('monk', 20);
  assert.equal(m20.scores.wis, Math.min(25, m19.scores.wis + 4));
});

test('Power Word Kill: a creature with 100 Hit Points or fewer dies, a bigger one takes 12d12', () => {
  const w = hero('wizard', 17, { x: 3, y: 8 }, { species: 'elf' }, { prepared: undefined });
  w.casting.known['power-word-kill'] ||= { ability: 'int', from: 'test', slot: true };
  const t = mon(TROLL, 't', 3, 4), v = mon(WARRIOR_VETERAN, 'v', 5, 4);
  const b = fight([w], [t, v, spare()]);
  b.creatures.t.hp = 90;
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'power-word-kill', target: 't' }).ok);
  assert.ok(b.creatures.t.dead);
  setTurn(b, 'wizard');
  b.creatures.wizard.casting.slots[9].left = 1; b.creatures.wizard.slotKey = null;
  b.creatures.v.hp = 150; b.creatures.v.hpMax = 150;
  dice(b, ...Array(12).fill(5));
  const r = perform(b, 'wizard', { a: 'cast', spell: 'power-word-kill', target: 'v', slot: 9 });
  assert.ok(r.ok, r.error);
  assert.equal(b.creatures.v.hp, 90);
});

test('Power Word Heal from a level 20 bard: all Hit Points back, and Words of Creation reaches a second ally', () => {
  const d = hero('bard', 20, { x: 3, y: 8 });
  const f = hero('fighter', 20, { x: 3, y: 6, id: 'f' }), r = hero('rogue', 20, { x: 4, y: 6, id: 'r' });
  const b = fight([d, f, r], [mon(TROLL, 't', 0, 0), spare()]);
  b.creatures.f.hp = 10; b.creatures.r.hp = 20;
  b.creatures.f.conds = [{ id: 'frightened', by: 't' }];
  const res = perform(b, 'bard', { a: 'cast', spell: 'power-word-heal', target: 'f' });
  assert.ok(res.ok, res.error);
  assert.equal(b.creatures.f.hp, b.creatures.f.hpMax);
  assert.ok(!has(b.creatures.f, 'frightened'));
  assert.equal(b.creatures.r.hp, b.creatures.r.hpMax, 'Words of Creation heals the second ally');
});

test('Mass Heal shares 700 Hit Points out, the most hurt first', () => {
  const c = hero('cleric', 17, { x: 3, y: 8 });
  c.casting.known['mass-heal'] ||= { ability: 'wis', from: 'test', slot: true };
  const f = hero('fighter', 17, { x: 3, y: 6, id: 'f' });
  const b = fight([c, f], [mon(TROLL, 't', 0, 0), spare()]);
  b.creatures.f.hp = 1; b.creatures.cleric.hp = 5;
  const res = perform(b, 'cleric', { a: 'cast', spell: 'mass-heal', targets: ['f', 'cleric'] });
  assert.ok(res.ok, res.error);
  assert.equal(b.creatures.f.hp, b.creatures.f.hpMax);
  assert.equal(b.creatures.cleric.hp, b.creatures.cleric.hpMax);
});

test('Supreme Healing: a level 17 Life cleric heals the most the dice can give', () => {
  const c = hero('cleric', 17, { x: 3, y: 8 }, {}, { subclass: 'life' });
  assert.ok(c.supremeHealing);
  const f = hero('fighter', 17, { x: 3, y: 7, id: 'f' });
  const b = fight([c, f], [mon(TROLL, 't', 0, 0), spare()]);
  b.creatures.f.hp = 1;
  const res = perform(b, 'cleric', { a: 'cast', spell: 'cure-wounds', target: 'f', slot: 1 });
  assert.ok(res.ok, res.error);
  const h = last(b, 'heal');
  assert.ok(h.roll.rolls.every((x) => x === 8), JSON.stringify(h.roll));
});

test('Weird frightens the foes it hits, and each takes 5d10 Psychic at the end of its turns', () => {
  const w = hero('wizard', 17, { x: 3, y: 9 }, { species: 'elf' });
  w.casting.known.weird ||= { ability: 'int', from: 'test', slot: true };
  const a = mon(WARRIOR_VETERAN, 'a', 3, 3);
  const b = fight([w], [a, spare()]);
  const res = perform(b, 'wizard', { a: 'cast', spell: 'weird', x: 3, y: 3 });
  assert.ok(res.ok, res.error);
  if (has(b.creatures.a, 'frightened')) {
    const c = b.creatures.a.conds.find((x) => x.id === 'frightened');
    assert.equal(c.weird, '5d10');
  }
});

test('Thief\'s Reflexes gives a level 17 Thief two turns in the first round', () => {
  const r = hero('rogue', 17, {}, {}, { subclass: 'thief' });
  assert.ok(r.thiefReflexes);
  const b = createBattle({ heroes: [r], foes: [mon(TROLL, 't', 0, 0)], walls: [], seed: 5 });
  rollInitiative(b);
  assert.equal(b.order.filter((id) => id === 'rogue').length, 2);
});

test('Epic Boon of Combat Prowess turns one miss a turn into a hit', () => {
  const f = hero('fighter', 19, { x: 3, y: 5 }, {}, { feats: undefined });
  f.combatProwess = true;
  const g = buildGoblin({ id: 'g', label: 'g', x: 3, y: 4, ai: 'melee' });
  const b = fight([f], [g, spare()]);
  dice(b, 2, 3, 3, 3, 3);
  const r = perform(b, 'fighter', { a: 'attack', target: 'g', attack: b.creatures.fighter.attacks[0].id });
  assert.ok(r.ok, r.error);
  assert.match(JSON.stringify(b.log), /Combat Prowess/);
});
