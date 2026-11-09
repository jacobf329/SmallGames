// 3rd-level spells (SRD 5.2.1): Fireball, Mass Healing Word, Spirit Guardians,
// Revivify, Haste, Slow, Hypnotic Pattern, Fear, Vampiric Touch, Call
// Lightning, Stinking Cloud, Sleet Storm, Counterspell, Dispel Magic, Magic Weapon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, buildGoblin } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform, resolveReaction, endConc, acAgainst } from '../src/rules/combat.js';
import { setTurn, dice, last } from './helpers.js';

const L5 = (cls, at = {}, opts = {}) => Object.assign(buildHero(validateSpec(defaultSpec(cls, opts), { level: 5 }), { level: 5, id: at.id || cls, name: at.id || cls }), at);
const teach = (h, ...sids) => {
  const ability = Object.keys(h.casting.stats)[0];
  for (const s of sids) h.casting.known[s] = { ability, source: 'test', free: 0, slot: true };
  return h;
};
const gob = (id, x, y, extra = {}) => Object.assign(buildGoblin({ id, label: id, x, y, ai: 'melee' }), { hp: 60, hpMax: 60 }, extra);
function fight(heroes, foes, who) {
  const b = createBattle({ heroes, foes, walls: [], seed: 7 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = [...heroes.map((h) => h.id), ...foes.map((f) => f.id)];
  b.round = 1;
  setTurn(b, who || heroes[0].id);
  return b;
}
const has = (c, id) => c.conds.some((x) => x.id === id);
const endTurn = (b) => assert.ok(perform(b, b.turn.who, { a: 'end' }).ok);

test('Fireball: 8d6 Fire in a 20-foot Sphere, Dexterity save for half', () => {
  const w = teach(L5('wizard', { x: 3, y: 9 }), 'fireball');
  const b = fight([w], [gob('g1', 3, 2), gob('g2', 4, 2)]);
  dice(b, 3, 3, 3, 3, 3, 3, 3, 3, /* saves */ 20, 1);
  const r = perform(b, 'wizard', { a: 'cast', spell: 'fireball', x: 3, y: 2 });
  assert.ok(r.ok, r.error);
  const s = last(b, 'save-spell');
  assert.equal(s.damage.total, 24);
  assert.deepEqual(s.results.map((x) => x.damage).sort((p, q) => p - q), [12, 24]);
  assert.equal(w.casting.slots[3].left ?? w.casting.slots[3].uses, w.casting.slots[3].max - 1);
});

test('Mass Healing Word: one roll heals each chosen creature, as a Bonus Action', () => {
  const c = teach(L5('cleric', { x: 3, y: 9 }), 'mass-healing-word');
  const f = L5('fighter', { x: 2, y: 8, id: 'f', hp: 3 });
  const r = L5('rogue', { x: 4, y: 8, id: 'r', hp: 2 });
  const b = fight([c, f, r], [gob('g1', 3, 1)]);
  dice(b, 2, 3);
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'mass-healing-word', targets: ['f', 'r'] }).ok);
  assert.equal(b.turn.bonus, 0);
  assert.equal(b.turn.action, 1);
  const gain = 5 + c.mods.wis;
  assert.equal(b.creatures.f.hp, 3 + gain + (c.discipleOfLife ? 5 : 0));
  assert.equal(b.creatures.r.hp, 2 + gain + (c.discipleOfLife ? 5 : 0));
});

test('Spirit Guardians: an enemy that enters or ends its turn in the Emanation saves; the area is hard going for enemies', () => {
  const c = teach(L5('cleric', { x: 3, y: 7 }), 'spirit-guardians');
  const b = fight([c], [gob('g1', 3, 1)]);
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'spirit-guardians' }).ok);
  const z = b.effects.find((e) => e.type === 'zone');
  assert.equal(z.follow, 'cleric');
  assert.equal(z.r, 3);
  endTurn(b);
  assert.equal(b.turn.who, 'g1');
  dice(b, 4, 4, 4, /* save */ 1);
  // Walking into the Emanation triggers the save on entry.
  assert.ok(perform(b, 'g1', { a: 'move', x: 3, y: 4 }).ok);
  assert.equal(b.creatures.g1.hp, 60 - 12);
  // Only once per turn: ending the same turn there does nothing more.
  const n = b.log.filter((x) => x.kind === 'save-spell').length;
  endTurn(b);
  assert.equal(b.log.filter((x) => x.kind === 'save-spell').length, n);
  // Next round it ends its turn there and saves again.
  endTurn(b);
  dice(b, 2, 2, 2, 20);
  endTurn(b);
  assert.equal(b.creatures.g1.hp, 60 - 12 - 3);
});

test('Revivify brings back a creature that died this minute with 1 Hit Point', () => {
  const c = teach(L5('cleric', { x: 3, y: 7 }), 'revivify');
  const f = L5('fighter', { x: 3, y: 6, id: 'f' });
  const b = fight([c, f], [gob('g1', 0, 0)]);
  Object.assign(b.creatures.f, { hp: 0, dead: true, diedRound: 1 });
  assert.ok(perform(b, 'cleric', { a: 'cast', spell: 'revivify', target: 'f' }).ok);
  assert.equal(b.creatures.f.dead, false);
  assert.equal(b.creatures.f.hp, 1);
  // A living creature can't be the target.
  setTurn(b, 'cleric');
  assert.ok(!perform(b, 'cleric', { a: 'cast', spell: 'revivify', target: 'f' }).ok);
});

test('Haste: doubled Speed, +2 AC, and one extra limited action; lethargy when it ends', () => {
  const w = teach(L5('wizard', { x: 3, y: 9 }), 'haste');
  const f = L5('fighter', { x: 3, y: 5, id: 'f' });
  const b = fight([w, f], [gob('g1', 3, 4)]);
  const ac = f.ac;
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'haste', target: 'f' }).ok);
  setTurn(b, 'f');
  b.turn.hasteAct = 1;
  assert.equal(b.turn.moveLeft, f.speed);
  const atk = f.attacks[0].id;
  dice(b, 15, 4, 15, 4, 15, 4);
  perform(b, 'f', { a: 'attack', target: 'g1', attack: atk });
  perform(b, 'f', { a: 'attack', target: 'g1', attack: atk });
  // The Haste action: one more weapon attack, not two.
  assert.ok(perform(b, 'f', { a: 'haste' }).ok);
  assert.ok(perform(b, 'f', { a: 'attack', target: 'g1', attack: atk }).ok);
  assert.ok(!perform(b, 'f', { a: 'attack', target: 'g1', attack: atk }).ok);
  assert.equal(acAgainst(b, b.creatures.g1, b.creatures.f, b.creatures.g1.attacks[0]).value, ac + 2);
  // Concentration ends: the hasted creature is Incapacitated through its next turn.
  endConc(b, b.creatures.wizard, 'test');
  assert.ok(b.creatures.f.conds.some((x) => x.lethargy));
  assert.equal(b.turn.action, 0);
});

test('Slow: chosen enemies only; Slowed creatures lose AC and Reactions', () => {
  const w = teach(L5('wizard', { x: 3, y: 9 }), 'slow');
  const f = L5('fighter', { x: 4, y: 3, id: 'f' });
  const b = fight([w, f], [gob('g1', 3, 2), gob('g2', 2, 2)]);
  dice(b, 1, 20);
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'slow', x: 3, y: 2 }).ok);
  const s = last(b, 'save-spell');
  assert.equal(s.results.length, 2, 'the fighter is not a target');
  const slowed = ['g1', 'g2'].filter((id) => has(b.creatures[id], 'slow'));
  assert.equal(slowed.length, 1);
  assert.equal(b.creatures[slowed[0]].reaction, false);
});

test('Hypnotic Pattern: Charmed and Incapacitated until damage or a shake awake', () => {
  const w = teach(L5('wizard', { x: 3, y: 9 }), 'hypnotic-pattern', 'fire-bolt');
  const f = L5('fighter', { x: 7, y: 9, id: 'f' });
  const b = fight([w, f], [gob('g1', 3, 2), gob('g2', 4, 2)]);
  dice(b, 1, 1);
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'hypnotic-pattern', x: 3, y: 2 }).ok);
  assert.equal(last(b, 'save-spell').results.length, 2, 'the fighter is outside the Cube');
  for (const g of ['g1', 'g2']) assert.ok(has(b.creatures[g], 'charmed') && has(b.creatures[g], 'incapacitated'), g);
  // Damage ends it.
  b.round++;
  setTurn(b, 'wizard');
  dice(b, 18, 3);
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'fire-bolt', target: 'g1' }).ok);
  assert.ok(!has(b.creatures.g1, 'incapacitated'), 'damage ends it');
  assert.ok(has(b.creatures.g2, 'incapacitated'));
  // An ally can use an action to shake the other awake.
  setTurn(b, 'g1');
  assert.ok(perform(b, 'g1', { a: 'wake', target: 'g2' }).ok);
  assert.ok(!has(b.creatures.g2, 'incapacitated'));
  assert.ok(!has(b.creatures.g2, 'charmed'));
  assert.equal(b.turn.action, 0);
});

test('Fear: Frightened creatures flee; the save to end it needs the caster out of sight', () => {
  const w = teach(L5('wizard', { x: 3, y: 6 }), 'fear');
  const b = fight([w], [gob('g1', 3, 5), gob('g2', 3, 4)]);
  dice(b, 1, 1);
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'fear', x: 3, y: 5 }).ok);
  const x = b.creatures.g1.conds.find((c) => c.id === 'frightened');
  assert.ok(x && x.flee);
  setTurn(b, 'g1');
  const saves = b.log.filter((r) => r.kind === 'save').length;
  endTurn(b);
  assert.ok(has(b.creatures.g1, 'frightened'), 'no save while the wizard is in sight');
  assert.equal(b.log.filter((r) => r.kind === 'save').length, saves);
});

test('Vampiric Touch heals for half the damage, and is used again on a later turn with no slot', () => {
  const w = teach(L5('warlock', { x: 3, y: 5, hp: 10 }), 'vampiric-touch');
  const b = fight([w], [gob('g1', 3, 4)]);
  const slots = w.casting.slots[3].max;
  dice(b, 15, 4, 4, 4);
  assert.ok(perform(b, 'warlock', { a: 'cast', spell: 'vampiric-touch', target: 'g1' }).ok);
  assert.equal(b.creatures.warlock.hp, 10 + 6);
  assert.ok(!perform(b, 'warlock', { a: 'cast', spell: 'vampiric-touch', target: 'g1' }).ok, 'not twice on one turn');
  const left = JSON.stringify(b.creatures.warlock.casting.slots);
  b.round++;
  setTurn(b, 'warlock');
  dice(b, 15, 2, 2, 2);
  const r = perform(b, 'warlock', { a: 'cast', spell: 'vampiric-touch', target: 'g1' });
  assert.ok(r.ok, r.error);
  assert.equal(JSON.stringify(b.creatures.warlock.casting.slots), left, 'no slot spent');
  assert.ok(slots >= 1);
});

test('Stinking Cloud poisons a creature that starts its turn inside and takes its action', () => {
  const w = teach(L5('wizard', { x: 3, y: 9 }), 'stinking-cloud');
  const b = fight([w], [gob('g1', 3, 2)]);
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'stinking-cloud', x: 3, y: 2 }).ok);
  dice(b, 1);
  endTurn(b);
  assert.equal(b.turn.who, 'g1');
  assert.ok(has(b.creatures.g1, 'poisoned'));
  assert.equal(b.turn.action, 0);
  assert.equal(b.turn.bonus, 0);
});

test('Sleet Storm: Difficult Terrain, and entering makes you save or fall Prone', () => {
  const d = teach(L5('druid', { x: 7, y: 9 }), 'sleet-storm');
  const b = fight([d], [gob('g1', 0, 0)]);
  assert.ok(perform(b, 'druid', { a: 'cast', spell: 'sleet-storm', x: 6, y: 6 }).ok);
  setTurn(b, 'g1');
  assert.ok(perform(b, 'g1', { a: 'move', x: 1, y: 1 }).ok);
  assert.equal(b.log.filter((r) => r.kind === 'save-spell').length, 0, 'still outside');
  dice(b, 1);
  assert.ok(perform(b, 'g1', { a: 'move', x: 2, y: 2 }).ok);
  assert.ok(has(b.creatures.g1, 'prone'));
  assert.equal(b.turn.moveLeft, 30 - 5 - 10, 'the storm is Difficult Terrain');
});

test('Counterspell: an enemy caster with a slot can stop a spell; the caster saves', () => {
  const w = teach(L5('wizard', { x: 3, y: 9 }), 'fireball');
  const foe = teach(L5('wizard', { x: 3, y: 2, id: 'mage' }), 'counterspell');
  foe.side = 'foe';
  const b = fight([w], [foe, gob('g1', 4, 2)]);
  const r = perform(b, 'wizard', { a: 'cast', spell: 'fireball', x: 3, y: 2 });
  assert.ok(r.ok, r.error);
  assert.equal(b.pending?.kind, 'counter');
  dice(b, 1);     // the wizard's Constitution save fails
  resolveReaction(b, true);
  assert.ok(!b.log.some((x) => x.kind === 'save-spell' && x.what === 'Fireball'));
  assert.equal(b.turn.action, 0, 'the action is wasted');
  assert.equal(b.creatures.mage.reaction, false);
});

test('Dispel Magic ends a spell on a creature; Magic Weapon adds to hit and damage', () => {
  const p = teach(L5('paladin', { x: 3, y: 6 }), 'magic-weapon');
  const w = teach(L5('wizard', { x: 3, y: 8, id: 'w' }), 'dispel-magic');
  const b = fight([p, w], [gob('g1', 3, 5)]);
  assert.ok(perform(b, 'paladin', { a: 'cast', spell: 'magic-weapon', target: 'paladin' }).ok);
  assert.ok(b.effects.some((e) => e.type === 'magicweapon' && e.amount === 1));
  setTurn(b, 'w');
  assert.ok(perform(b, 'w', { a: 'cast', spell: 'dispel-magic', target: 'paladin' }).ok);
  assert.ok(!b.effects.some((e) => e.type === 'magicweapon'));
  assert.match(last(b, 'note').text, /Magic Weapon/);
});

test('subclass spells arrive at level 5', () => {
  const life = L5('cleric', {});
  assert.ok(['mass-healing-word', 'revivify'].some((s) => life.casting.known[s]), Object.keys(life.casting.known).join());
});

test('Call Lightning: the storm stays, and a Magic action on a later turn calls another bolt with no slot', () => {
  const d = teach(L5('druid', { x: 3, y: 9 }), 'call-lightning');
  const b = fight([d], [gob('g1', 3, 2)]);
  dice(b, 5, 5, 5, 1);
  assert.ok(perform(b, 'druid', { a: 'cast', spell: 'call-lightning', x: 3, y: 2 }).ok);
  assert.equal(b.creatures.g1.hp, 45);
  const slots = JSON.stringify(b.creatures.druid.casting.slots);
  b.round++;
  setTurn(b, 'druid');
  dice(b, 2, 2, 2, 20);
  assert.ok(perform(b, 'druid', { a: 'cast', spell: 'call-lightning', x: 3, y: 2 }).ok);
  assert.equal(b.creatures.g1.hp, 45 - 3);
  assert.equal(JSON.stringify(b.creatures.druid.casting.slots), slots);
});
