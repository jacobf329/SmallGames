// Levels 11 to 15 (SRD 5.2.1): spells of level 6 to 8 and the class features
// that come with them.

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

test('a hero built at a high level gets spells of each level it can cast', () => {
  const w = hero('wizard', 14, {}, { species: 'elf' });
  const levels = new Set(Object.keys(w.casting.known).map((k) => SPELLS[k].level));
  for (let l = 1; l <= 7; l++) assert.ok(levels.has(l), `wizard 14 has a level ${l} spell`);
  const c = hero('cleric', 13);
  assert.ok(Object.keys(c.casting.known).some((k) => SPELLS[k].level === 7));
});

test('Mystic Arcanum: a Warlock gets a level 6, 7 and 8 spell, each once per Long Rest', () => {
  const k = hero('warlock', 15, {}, {}, { arcanum: { 6: 'eyebite', 7: 'finger-of-death', 8: 'power-word-stun' } });
  for (const s of ['eyebite', 'finger-of-death', 'power-word-stun']) {
    assert.equal(k.casting.known[s].free, 1, s);
    assert.equal(k.casting.known[s].slot, false, s);
  }
  assert.ok(!k.casting.slots[6], 'no slot of level 6');
  const k11 = hero('warlock', 11);
  assert.deepEqual(Object.keys(validateSpec(defaultSpec('warlock'), { level: 11 }).arcanum), ['6']);
  assert.ok(Object.values(k11.casting.known).some((x) => x.source === 'Mystic Arcanum'));
});

test('Power Word Stun: no save at 150 Hit Points or fewer, and it slows a bigger creature instead', () => {
  const k = hero('warlock', 15, { x: 3, y: 7 }, {}, { arcanum: { 8: 'power-word-stun' } });
  const t = mon(TROLL, 't', 3, 4);
  const b = fight([k], [t, spare()]);
  assert.ok(perform(b, 'warlock', { a: 'cast', spell: 'power-word-stun', target: 't' }).ok);
  assert.ok(has(b.creatures.t, 'stunned'));
  assert.equal(b.creatures.warlock.casting.known['power-word-stun'].free, 0);
});

test('Divine Word: what happens depends on how many Hit Points each foe has left', () => {
  const c = hero('cleric', 13, { x: 3, y: 8 });
  const a = mon(WARRIOR_VETERAN, 'a', 2, 4), m = mon(WARRIOR_VETERAN, 'm', 3, 4), z = mon(WARRIOR_VETERAN, 'z', 4, 4);
  const b = fight([c], [a, m, z, spare()]);
  b.creatures.a.hp = 15; b.creatures.m.hp = 35; b.creatures.z.hp = 60;
  dice(b, 1, 1, 1);
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'divine-word', target: 'a', targets: ['a', 'm', 'z'] }).ok);
  assert.ok(b.creatures.a.dead, '15 HP: dies');
  assert.ok(has(b.creatures.m, 'blinded') && !has(b.creatures.m, 'stunned'), '35 HP: Blinded');
  assert.ok(!has(b.creatures.z, 'blinded'), 'over 50: nothing');
  assert.ok(b.turn.action, 'a Bonus Action spell');
});

test('Overchannel: the first time is free and every die counts as its highest; the next costs Necrotic damage', () => {
  const w = hero('wizard', 14, { x: 3, y: 6, hp: 90 }, { species: 'elf' });
  const t = mon(TROLL, 't', 3, 4);
  const b = fight([w], [t, spare()]);
  b.creatures.t.hp = 84;
  dice(b, 20);
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'magic-missile', slot: 1, target: 't', targets: ['t', 't', 't'], meta: 'overchannel' }).ok);
  assert.equal(b.creatures.t.hp, 84 - 15 - 5, 'three darts of 4 + 1, and Empowered Evocation adds 5 once');
  assert.equal(b.creatures.wizard.hp, 90);
  b.turn.action = 1; b.turn.magicUsed = false; b.creatures.wizard.slotKey = null;   // as if on a later turn
  dice(b, 3, 3, 3, 3, 3);
  const before = b.creatures.wizard.hp;
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'magic-missile', slot: 1, target: 't', targets: ['t', 't', 't'], meta: 'overchannel' }).ok);
  assert.ok(b.creatures.wizard.hp < before, 'the second Overchannel hurts');
  assert.ok(b.log.some((r) => r.rule === 'overchannel' && /Necrotic/.test(r.text || '')));
});

test('Relentless Rage: a raging Barbarian at 0 saves to come back at twice their level', () => {
  const r = hero('barbarian', 11, { x: 3, y: 5 });
  const g = buildGoblin({ id: 'g', label: 'g', x: 3, y: 4, ai: 'melee' });
  const b = fight([r], [g, spare()]);
  assert.ok(perform(b, 'barbarian', { a: 'rage' }).ok);
  b.creatures.barbarian.hp = 1;
  setTurn(b, 'g');
  dice(b, 18, 6, 15);
  perform(b, 'g', { a: 'attack', target: 'barbarian', attack: g.attacks[0].id });
  assert.equal(b.creatures.barbarian.hp, 22);
  assert.equal(b.creatures.barbarian.relentlessRage.dc, 15);
});

test('Intimidating Presence frightens foes within 30 feet that fail a Wisdom save', () => {
  const r = hero('barbarian', 14, { x: 3, y: 9 });
  const v = mon(WARRIOR_VETERAN, 'v', 3, 4);
  const b = fight([r], [v, spare()]);
  dice(b, 2, 2);
  assert.ok(perform(b, 'barbarian', { a: 'intimidate' }).ok);
  assert.ok(has(b.creatures.v, 'frightened'));
  assert.ok(!has(b.creatures.spare, 'frightened'), 'the far goblin is out of range');
  assert.equal(b.creatures.barbarian.intimidating.uses, 0);
});

test("Nature's Veil makes a Ranger Invisible until the end of their next turn", () => {
  const r = hero('ranger', 14, { x: 3, y: 7 });
  const v = mon(WARRIOR_VETERAN, 'v', 3, 4);
  const b = fight([r], [v, spare()]);
  const n = b.creatures.ranger.veil.uses;
  assert.ok(perform(b, 'ranger', { a: 'veil' }).ok);
  assert.equal(b.creatures.ranger.veil.uses, n - 1);
  assert.ok(!b.turn.bonus);
  dice(b, 10, 10, 4);
  assert.ok(perform(b, 'ranger', { a: 'attack', target: 'v', attack: 'longbow' }).ok);
  assert.equal(last(b, 'attack').d20.mode, 'advantage');
});

test('Studied Attacks: after a miss, the next attack on that foe has Advantage', () => {
  const f = hero('fighter', 13, { x: 3, y: 5 });
  const v = mon(WARRIOR_VETERAN, 'v', 3, 4);
  const b = fight([f], [v, spare()]);
  dice(b, 2, 2);                    // a miss, and the Heroic Inspiration reroll misses too
  perform(b, 'fighter', { a: 'attack', target: 'v', attack: f.attacks[0].id });
  assert.equal(last(b, 'attack').outcome, 'miss');
  dice(b, 15, 15, 4, 4);
  perform(b, 'fighter', { a: 'attack', target: 'v', attack: f.attacks[0].id });
  assert.equal(last(b, 'attack').d20.mode, 'advantage');
});

test('the computer cleric uses Divine Word on several weakened foes', () => {
  const c = hero('cleric', 13, { x: 3, y: 8 });
  const foes = ['a', 'm', 'z'].map((id, i) => mon(WARRIOR_VETERAN, id, 2 + i, 5));
  const b = fight([c], foes);
  for (const f of foes) b.creatures[f.id].hp = 18;
  const n = aiNext(b, 'cleric');
  assert.equal(n.spell, 'divine-word');
});
