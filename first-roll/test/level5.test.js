// Level 5 class features (SRD 5.2.1): Extra Attack, Sneak Attack 3d6 with
// Cunning Strike, Uncanny Dodge, Stunning Strike, Sear Undead, cantrips that
// grow, Tactical Shift, Font of Inspiration, Sorcerous Restoration, Thirsting Blade.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, buildGoblin, buildMonster, finishShortRest, longRest } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform, spellAim, scaled } from '../src/rules/combat.js';
import { ZOMBIE } from '../src/rules/data.js';
import { setTurn, dice, last } from './helpers.js';

const L5 = (cls, at, extra = {}, opts = {}) => Object.assign(buildHero(validateSpec({ ...defaultSpec(cls, opts), ...extra }, { level: 5 }), { level: 5, id: cls, name: cls }), at);

function fight(heroes, foes, who) {
  const b = createBattle({ heroes, foes, walls: [], seed: 5 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = [...heroes.map((h) => h.id), ...foes.map((f) => f.id)];
  setTurn(b, who || heroes[0].id);
  return b;
}
const gob = (id, x, y, extra = {}) => Object.assign(buildGoblin({ id, label: id, x, y, ai: 'melee' }), extra);

test('Extra Attack: a level 5 Fighter attacks twice with one Attack action', () => {
  const f = L5('fighter', { x: 3, y: 5 });
  assert.equal(f.multiattack, 2);
  assert.equal(f.pb, 3);
  const b = fight([f], [gob('g1', 3, 4, { hp: 50, hpMax: 50 })]);
  dice(b, 15, 4, 15, 4);
  assert.ok(perform(b, 'fighter', { a: 'attack', target: 'g1', attack: f.attacks[0].id }).ok);
  assert.equal(b.turn.action, 0);
  assert.ok(perform(b, 'fighter', { a: 'attack', target: 'g1', attack: f.attacks[0].id }).ok);
  assert.ok(!perform(b, 'fighter', { a: 'attack', target: 'g1', attack: f.attacks[0].id }).ok);
  for (const c of ['barbarian', 'monk', 'paladin', 'ranger']) assert.equal(L5(c, {}).multiattack, 2, c);
  for (const c of ['rogue', 'wizard', 'cleric']) assert.equal(L5(c, {}).multiattack, 1, c);
});

test('Sneak Attack is 3d6 at level 5; Cunning Strike spends 1d6 to Trip', () => {
  const r = L5('rogue', { x: 3, y: 5 });
  assert.equal(r.sneak, '3d6');
  const ally = L5('fighter', { x: 4, y: 4, id: 'pal' });
  ally.id = 'pal';
  const b = fight([r, ally], [gob('g1', 3, 4, { hp: 60, hpMax: 60 })], 'rogue');
  const melee = r.attacks.find((a) => a.kind === 'melee' && a.finesse);
  dice(b, 15, 3, 1, 1, 1, 2);  // attack, weapon die, two Sneak Attack dice, the goblin's Dexterity save
  perform(b, 'rogue', { a: 'attack', target: 'g1', attack: melee.id });
  const atk = last(b, 'attack');
  const sneak = atk.damage.parts.find((p) => p.rule === 'sneak-attack');
  assert.match(sneak.label, /2d6/);
  assert.match(sneak.label, /Trip/);
  assert.ok(b.creatures.g1.conds.some((c) => c.id === 'prone'));
});

test('Uncanny Dodge halves the damage of a hit, as a Reaction', () => {
  const r = L5('rogue', { x: 3, y: 5 });
  const g = gob('g1', 3, 4);
  const b = fight([r], [g], 'g1');
  dice(b, 18, 6);
  perform(b, 'g1', { a: 'attack', target: 'rogue', attack: g.attacks[0].id });
  const atk = last(b, 'attack');
  assert.ok(atk.notes.some((n) => n.rule === 'uncanny-dodge'));
  assert.equal(atk.damage.total, Math.floor((6 + 2) / 2));
  assert.equal(b.creatures.rogue.reaction, false);
});

test('Stunning Strike: 1 Focus Point; a failed Constitution save Stuns until the Monk\'s next turn', () => {
  const m = L5('monk', { x: 3, y: 5 });
  assert.equal(m.martialDie, '1d8');
  const b = fight([m], [gob('g1', 3, 4, { hp: 60, hpMax: 60 })]);
  const fist = m.attacks.find((a) => a.unarmed);
  const before = b.creatures.monk.focus.uses;
  dice(b, 15, 3, 2);           // attack, damage, the goblin's save
  perform(b, 'monk', { a: 'attack', target: 'g1', attack: fist.id });
  assert.equal(b.creatures.monk.focus.uses, before - 1);
  assert.ok(b.creatures.g1.conds.some((c) => c.id === 'stunned'));
  assert.match(last(b, 'attack').text, /Stunned/);
  // Once per turn: the second hit doesn't try again.
  dice(b, 15, 3);
  perform(b, 'monk', { a: 'attack', target: 'g1', attack: fist.id });
  assert.equal(b.creatures.monk.focus.uses, before - 1);
  // A Stunned creature fails Strength and Dexterity saves, and attacks against it have Advantage.
  assert.equal(last(b, 'attack').d20.mode, 'advantage');
});

test('Sear Undead: Turn Undead also burns each Undead that fails with Radiant damage', () => {
  const c = L5('cleric', { x: 3, y: 5 });
  assert.ok(c.searUndead >= 1);
  const z = Object.assign(buildMonster(ZOMBIE, { id: 'z1', label: 'Zombie', x: 3, y: 3 }), { hp: 40, hpMax: 40 });
  const b = fight([c], [z]);
  dice(b, ...Array(c.searUndead).fill(4), 2);   // the Radiant dice are rolled once, then the Zombie's save
  assert.ok(perform(b, 'cleric', { a: 'turn' }).ok);
  assert.equal(b.creatures.z1.hp, 40 - 4 * c.searUndead);
  assert.ok(b.creatures.z1.conds.some((x) => x.id === 'frightened'), 'the burn does not end the turning');
});

test('cantrips grow at level 5: two dice for Fire Bolt, two beams of Eldritch Blast', () => {
  assert.equal(scaled('fire-bolt', 0, 4).dice, '1d10');
  assert.equal(scaled('fire-bolt', 0, 5).dice, '2d10');
  assert.equal(scaled('fire-bolt', 0, 17).dice, '4d10');
  assert.equal(scaled('eldritch-blast', 0, 5).dice, '1d10');
  assert.equal(spellAim('eldritch-blast', 0, null, 5).n, 2);
  assert.equal(spellAim('eldritch-blast', 0, null, 4).mode, 'creature');
  const w = L5('warlock', { x: 3, y: 9 });
  const b = fight([w], [gob('g1', 3, 4, { hp: 60, hpMax: 60 }), gob('g2', 5, 4, { hp: 60, hpMax: 60 })]);
  dice(b, 15, 5, 15, 5);
  assert.ok(perform(b, 'warlock', { a: 'cast', spell: 'eldritch-blast', targets: ['g1', 'g2'] }).ok);
  assert.equal(b.log.filter((r) => r.kind === 'attack' && r.spell === 'eldritch-blast').length, 2);
});

test('Tactical Shift: Second Wind also gives half your Speed of movement with no Opportunity Attacks', () => {
  const f = L5('fighter', { x: 3, y: 5, hp: 10 });
  const b = fight([f], [gob('g1', 3, 4)]);
  const was = b.turn.moveLeft;
  dice(b, 5);
  assert.ok(perform(b, 'fighter', { a: 'second-wind' }).ok);
  assert.equal(b.turn.moveLeft, was + Math.floor(f.speed / 2 / 5) * 5);
  assert.ok(b.turn.shift > 0);
  assert.ok(perform(b, 'fighter', { a: 'move', x: 3, y: 7 }).ok);
  assert.ok(!b.pending, 'no Opportunity Attack');
});

test('Short Rest at level 5: Font of Inspiration and Sorcerous Restoration', () => {
  const bard = L5('bard', {});
  assert.equal(bard.bardic.die, 8);
  bard.bardic.uses = 0;
  assert.ok(finishShortRest(bard).some((x) => /Font of Inspiration/.test(x)));
  assert.equal(bard.bardic.uses, bard.bardic.max);
  const s = L5('sorcerer', {});
  s.sorcery.uses = 0;
  finishShortRest(s);
  assert.equal(s.sorcery.uses, 2);
  finishShortRest(s);
  assert.equal(s.sorcery.uses, 2, 'once per Long Rest');
  longRest(s);
  assert.equal(s.sorcRestore.used, false);
});

test('level 5 tables: Rage, Martial Arts, Speed, Draconic Resilience, Pact slots, Hunter\'s Mark', () => {
  const bb = L5('barbarian', {});
  assert.equal(bb.rage.max, 3);
  assert.ok(bb.speedParts.some((p) => p.rule === 'fast-movement'));
  const sor = L5('sorcerer', {});
  assert.equal(sor.hpParts.find((p) => p.rule === 'draconic-resilience').value, 5);
  const w = L5('warlock', {});
  assert.deepEqual(Object.keys(w.casting.slots), ['3']);
  assert.equal(w.casting.slots[3].max, 2);
  const rg = L5('ranger', {});
  assert.equal(rg.casting.known['hunters-mark'].free, 3);
  const wiz = L5('wizard', {});
  assert.equal(wiz.casting.slots[3].max, 2);
});

test('Thirsting Blade: Extra Attack with the pact weapon only', () => {
  const spec = validateSpec({ ...defaultSpec('warlock'), invocations: ['pact-of-the-blade', 'thirsting-blade', 'agonizing-blast', 'eldritch-mind', 'fiendish-vigor'] }, { level: 5 });
  assert.ok(spec.invocations.includes('thirsting-blade'));
  const w = Object.assign(buildHero(spec, { level: 5, id: 'warlock', name: 'W' }), { x: 3, y: 5 });
  assert.equal(w.multiattack, 2);
  // Without Pact of the Blade, Thirsting Blade can't be taken.
  const no = validateSpec({ ...defaultSpec('warlock'), invocations: ['thirsting-blade', 'agonizing-blast', 'eldritch-mind', 'fiendish-vigor', 'devils-sight'] }, { level: 5 });
  assert.ok(!no.invocations.includes('thirsting-blade'));
  const pact = w.attacks.find((a) => a.base === 'pact');
  const b = fight([w], [gob('g1', 3, 4, { hp: 60, hpMax: 60 })]);
  dice(b, 15, 4, 15, 4);
  assert.ok(perform(b, 'warlock', { a: 'attack', target: 'g1', attack: pact.id }).ok);
  assert.ok(perform(b, 'warlock', { a: 'attack', target: 'g1', attack: pact.id }).ok);
});
