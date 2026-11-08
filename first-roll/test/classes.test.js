import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, buildGoblin, defaultSpec, validateSpec } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform, resolveReaction, acAgainst, attackOptions, spellDC, canCast } from '../src/rules/combat.js';
import { setTurn, dice, last } from './helpers.js';

const H = (cls, level = 1, opts = {}, at = {}) => Object.assign(buildHero(defaultSpec(cls, opts), { id: opts.id || cls, name: opts.name || cls, level }), at);
const gob = (id, x, y) => { const g = buildGoblin({ id, label: id, x, y }); g.hp = g.hpMax = 99; return g; };
function fight(creatures, who) {
  const b = createBattle({ heroes: creatures.filter((c) => c.side === 'hero'), foes: creatures.filter((c) => c.side === 'foe'), seed: 5 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = creatures.map((c) => c.id);
  b.log = [];
  setTurn(b, who);
  return b;
}
const ok = (r) => assert.ok(r.ok, r.error);

test('every class builds at levels 1 to 3 and its spec survives a second check', () => {
  for (const cls of ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']) {
    for (const level of [1, 2, 3]) {
      const spec = validateSpec(defaultSpec(cls), { level });
      assert.deepEqual(validateSpec(spec, { level }), spec, `${cls} ${level}`);
      const h = buildHero(spec, { level });
      assert.ok(h.hp > 0 && h.ac >= 10, `${cls} ${level}`);
    }
  }
});

test('Rage: a Bonus Action; Resistance to Slashing, +2 on Strength hits, no spells; ends if not kept going', () => {
  const B = H('barbarian', 1, {}, { x: 3, y: 5 });
  const b = fight([B, gob('g1', 3, 4)], 'barbarian');
  ok(perform(b, 'barbarian', { a: 'rage' }));
  assert.equal(b.turn.bonus, 0);
  dice(b, 15, 6, 1);                        // the 1: Savage Attacker's second roll (Soldier)
  ok(perform(b, 'barbarian', { a: 'attack', target: 'g1', attack: 'greataxe' }));
  const a = last(b, 'attack');
  assert.equal(a.damage.total, 6 + 3 + 2);
  assert.ok(a.damage.parts.some((p) => p.rule === 'rage'));
  ok(perform(b, 'barbarian', { a: 'end' }));
  assert.ok(B.raging, 'kept going by the attack');
  // The goblin's scimitar does Slashing damage: halved.
  assert.equal(b.turn.who, 'g1');
  const hp = B.hp;
  dice(b, 18, 4);
  ok(perform(b, 'g1', { a: 'attack', target: 'barbarian', attack: 'scimitar' }));
  assert.equal(hp - B.hp, Math.floor((4 + 2) / 2));
  ok(perform(b, 'g1', { a: 'end' }));
  // The barbarian's next turn: no attack, no save, no Bonus Action: Rage ends at its end.
  assert.equal(b.turn.who, 'barbarian');
  assert.ok(B.raging);
  ok(perform(b, 'barbarian', { a: 'end' }));
  assert.equal(B.raging, null);
  assert.match(b.log.map((r) => r.text).join(' '), /Rage ends/);
});

test('Reckless Attack and Frenzy (Berserker 3): Advantage both ways, +2d6 on the first hit', () => {
  const B = H('barbarian', 3, {}, { x: 3, y: 5 });
  const b = fight([B, gob('g1', 3, 4)], 'barbarian');
  ok(perform(b, 'barbarian', { a: 'rage' }));
  ok(perform(b, 'barbarian', { a: 'reckless' }));
  dice(b, 4, 15, 6, 1, 3, 2);
  ok(perform(b, 'barbarian', { a: 'attack', target: 'g1', attack: 'greataxe' }));
  const a = last(b, 'attack');
  assert.equal(a.d20.mode, 'advantage');
  assert.equal(a.outcome, 'hit');
  const fr = a.damage.parts.find((p) => p.rule === 'frenzy');
  assert.equal(fr.value, 5);
  assert.equal(a.damage.total, 6 + 3 + 2 + 5);
  assert.match(perform(b, 'barbarian', { a: 'reckless' }).error, /already|first attack/);
  const opt = attackOptions(b, b.creatures.g1, B).find((o) => o.atk.id === 'scimitar');
  assert.equal(opt.mode, 'advantage');
});

test('Bardic Inspiration turns a near miss into a hit; Cutting Words turns a near hit into a miss', () => {
  const bard = H('bard', 3, {}, { x: 0, y: 5 });
  const f = H('fighter', 1, {}, { x: 3, y: 5 });
  const b = fight([bard, f, gob('g1', 3, 4)], 'bard');
  ok(perform(b, 'bard', { a: 'inspire', target: 'fighter' }));
  assert.equal(f.bardicDie.die, 6);
  setTurn(b, 'fighter');
  f.inspiration = false;
  const atk = f.attacks[0];
  const bonus = atk.hit.reduce((s, p) => s + p.value, 0);
  dice(b, 15 - bonus - 2, 5, 4, 1);         // 2 short of AC 15, the d6 rolls a 5, then damage (twice: Savage Attacker)
  ok(perform(b, 'fighter', { a: 'attack', target: 'g1', attack: atk.id }));
  const a = last(b, 'attack');
  assert.equal(a.outcome, 'hit');
  assert.ok(a.mods.some((m) => m.rule === 'bardic-inspiration'));
  assert.equal(f.bardicDie, null);
  // The goblin hits the fighter by exactly its AC: the bard's d6 makes it miss.
  setTurn(b, 'g1');
  const uses = bard.bardic.uses;
  b.rng.script = [];
  dice(b, f.ac - 4, f.ac - 4, 3);          // two d20s: the fighter's Sap gave the goblin Disadvantage
  ok(perform(b, 'g1', { a: 'attack', target: 'fighter', attack: 'scimitar' }));
  const g = last(b, 'attack');
  assert.equal(g.outcome, 'miss');
  assert.equal(bard.bardic.uses, uses - 1);
  assert.equal(bard.reaction, false);
});

test('Wild Shape: a Wolf with Temporary HP and no spells; back to druid form at 0 HP', () => {
  const d = H('druid', 2, {}, { x: 3, y: 5 });
  const b = fight([d, gob('g1', 3, 4)], 'druid');
  ok(perform(b, 'druid', { a: 'shape' }));
  assert.equal(d.speed, 40);
  assert.equal(d.tempHp, 2);
  assert.equal(acAgainst(b, b.creatures.g1, d, b.creatures.g1.attacks[0]).value, 12);
  assert.match(canCast(b, d, 'produce-flame').error || '', /Wild Shape/);
  dice(b, 15, 3);
  ok(perform(b, 'druid', { a: 'attack', target: 'g1', attack: 'bite' }));
  assert.equal(last(b, 'attack').damage.total, 5);
  setTurn(b, 'g1');
  d.hp = 1; d.tempHp = 0;
  dice(b, 18, 18, 5);                      // the Bite left the goblin Prone: Disadvantage
  ok(perform(b, 'g1', { a: 'attack', target: 'druid', attack: 'scimitar' }));
  assert.equal(d.shape, null);
  assert.ok(d.attacks.some((a) => a.id === 'sickle'));
});

test("Land's Aid: a Wild Shape use for Necrotic damage on enemies and healing on an ally", () => {
  const d = H('druid', 3, {}, { x: 1, y: 5 });
  const f = H('fighter', 1, {}, { x: 4, y: 6 });
  f.hp = 3;
  const b = fight([d, f, gob('g1', 4, 4)], 'druid');
  ok(perform(b, 'druid', { a: 'landsaid', x: 4, y: 5 }));
  assert.equal(d.wildShape.uses, 1);
  assert.ok(last(b, 'save-spell').results.some((r) => r.target === 'g1'));
  assert.ok(f.hp > 3);
});

test('Monk: Martial Arts bonus strike, Flurry of Blows with Open Hand Topple, Deflect Attacks', () => {
  const m = H('monk', 3, {}, { x: 3, y: 5 });
  const b = fight([m, gob('g1', 3, 4)], 'monk');
  const g = b.creatures.g1;
  dice(b, 15, 4, 1, 15, 4, 1);           // a hit and the goblin's Dexterity save (a 1), twice
  ok(perform(b, 'monk', { a: 'flurry', target: 'g1', tech: 'topple' }));
  assert.equal(m.focus.uses, 2);
  assert.equal(b.log.filter((r) => r.kind === 'attack').length, 2);
  assert.ok(g.conds.some((c) => c.id === 'prone'));
  assert.match(perform(b, 'monk', { a: 'martial', target: 'g1' }).error, /Bonus Action/);
  setTurn(b, 'g1');
  dice(b, 19, 19, 5, 10);                 // Prone goblin: Disadvantage
  const hp = m.hp;
  ok(perform(b, 'g1', { a: 'attack', target: 'monk', attack: 'scimitar' }));
  assert.equal(m.hp, hp, 'Deflect Attacks takes all of it');
  assert.equal(m.reaction, false);
});

test('Divine Smite: asked after a melee hit; the free cast first; Lay on Hands heals by touch', () => {
  const p = H('paladin', 2, {}, { x: 3, y: 5 });
  const f = H('fighter', 1, {}, { x: 3, y: 6 });
  f.hp = 4;
  const b = fight([p, f, gob('g1', 3, 4)], 'paladin');
  dice(b, 15, 5);
  ok(perform(b, 'paladin', { a: 'attack', target: 'g1', attack: 'longsword' }));
  assert.equal(b.pending?.kind, 'smite');
  const hp = b.creatures.g1.hp;
  dice(b, 7, 8);
  resolveReaction(b, true);
  assert.equal(hp - b.creatures.g1.hp, 15);
  assert.equal(p.casting.known['divine-smite'].free, 0);
  assert.equal(p.casting.slots[1].left, 2, 'the free cast used no slot');
  assert.equal(b.turn.bonus, 0);
  setTurn(b, 'paladin');
  ok(perform(b, 'paladin', { a: 'lay', target: 'fighter', amount: 5 }));
  assert.equal(f.hp, 9);
  assert.equal(p.layOnHands.uses, 5);
});

test("Hunter's Mark adds 1d6 Force; Colossus Slayer adds 1d8 to a hurt target once per turn", () => {
  const r = H('ranger', 3, { }, { x: 3, y: 9 });
  const b = fight([r, gob('g1', 3, 4)], 'ranger');
  ok(perform(b, 'ranger', { a: 'cast', spell: 'hunters-mark', target: 'g1' }));
  assert.equal(r.casting.known['hunters-mark'].free, 1);
  b.creatures.g1.hp = 90;
  dice(b, 15, 4, 2, 6);
  ok(perform(b, 'ranger', { a: 'attack', target: 'g1', attack: 'longbow' }));
  const a = last(b, 'attack');
  assert.ok(a.damage.parts.some((p) => p.rule === 'hunters-mark' && p.type === 'Force'));
  assert.ok(a.damage.parts.some((p) => p.rule === 'colossus-slayer'));
});

test('Sorcerer: Innate Sorcery raises the DC; Quickened Spell; Font of Magic makes a slot', () => {
  const s = H('sorcerer', 3, {}, { x: 3, y: 9 });
  const b = fight([s, gob('g1', 3, 4)], 'sorcerer');
  const dc = spellDC(s, 'web');
  ok(perform(b, 'sorcerer', { a: 'innate' }));
  assert.equal(spellDC(s, 'web'), dc + 1);
  setTurn(b, 'sorcerer');
  assert.ok(s.metamagic.includes('quickened'));
  ok(perform(b, 'sorcerer', { a: 'cast', spell: 'fire-bolt', target: 'g1', meta: 'quickened' }));
  assert.equal(b.turn.bonus, 0);
  assert.equal(b.turn.action, 1);
  assert.equal(s.sorcery.uses, 1);
  assert.match(perform(b, 'sorcerer', { a: 'cast', spell: 'magic-missile', target: 'g1' }).error, /Quickened/);
  setTurn(b, 'sorcerer');
  s.sorcery.uses = 3;
  ok(perform(b, 'sorcerer', { a: 'font', level: 2 }));
  assert.equal(s.casting.slots[2].left, 3);
  assert.equal(s.sorcery.uses, 0);
});

test('Warlock: Agonizing and Repelling Blast; Hex; Dark One\'s Blessing; Hellish Rebuke asks first', () => {
  const w = H('warlock', 3, {}, { x: 3, y: 9 });
  const g = gob('g1', 3, 6);
  const b = fight([w, g], 'warlock');
  ok(perform(b, 'warlock', { a: 'cast', spell: 'hex', target: 'g1' }));
  dice(b, 15, 5, 3);
  ok(perform(b, 'warlock', { a: 'cast', spell: 'eldritch-blast', target: 'g1' }));
  const a = last(b, 'attack');
  assert.ok(a.damage.parts.some((p) => p.rule === 'eldritch-invocations'));
  assert.ok(a.damage.parts.some((p) => p.rule === 'hex' && p.type === 'Necrotic'));
  assert.equal(g.y, 4, 'pushed 10 feet');
  // The goblin damages the warlock: Hellish Rebuke is offered.
  setTurn(b, 'g1');
  w.tempHp = 0;
  dice(b, 19, 3);
  ok(perform(b, 'g1', { a: 'attack', target: 'warlock', attack: 'shortbow' }));
  assert.equal(b.pending?.kind, 'rebuke');
  dice(b, 1, 10, 10);
  resolveReaction(b, true);
  assert.equal(w.casting.slots[2].left, 0, 'Hex took one slot, the Rebuke the other');
  assert.equal(last(b, 'save-spell').what, 'Hellish Rebuke');
  g.hp = 1;
  setTurn(b, 'warlock');
  dice(b, 15, 5, 3);
  ok(perform(b, 'warlock', { a: 'cast', spell: 'eldritch-blast', target: 'g1' }));
  assert.ok(g.dead);
  assert.equal(w.tempHp, Math.max(1, w.mods.cha + 3));
});

test('Entangle restrains until a Strength (Athletics) check; Sleep; Bane; Barkskin; Vicious Mockery', () => {
  const d = H('druid', 3, {}, { x: 0, y: 9 });
  const g1 = gob('g1', 4, 3), g2 = gob('g2', 5, 3);
  const b = fight([d, g1, g2], 'druid');
  dice(b, 1, 1);
  ok(perform(b, 'druid', { a: 'cast', spell: 'entangle', x: 4, y: 2 }));
  assert.ok(g1.conds.some((c) => c.id === 'restrained' && c.escape));
  setTurn(b, 'g1');
  dice(b, 1);
  ok(perform(b, 'g1', { a: 'escape' }));
  assert.ok(g1.conds.some((c) => c.id === 'restrained'));
  // Barkskin: AC at least 17 (on a later turn: one spell slot per turn).
  b.round++;
  setTurn(b, 'druid');
  ok(perform(b, 'druid', { a: 'cast', spell: 'barkskin', target: 'druid' }));
  assert.equal(acAgainst(b, g1, d, g1.attacks[0]).value, 17);

  const bard = H('bard', 1, {}, { x: 0, y: 9 });
  const g3 = gob('g3', 3, 5);
  const b2 = fight([bard, g3], 'bard');
  dice(b2, 1, 3);
  ok(perform(b2, 'bard', { a: 'cast', spell: 'vicious-mockery', target: 'g3' }));
  assert.ok(b2.effects.some((e) => e.type === 'mocked'));
  b2.round++;
  setTurn(b2, 'bard');
  dice(b2, 1);
  ok(perform(b2, 'bard', { a: 'cast', spell: 'sleep', x: 3, y: 5 }));
  assert.ok(g3.conds.some((c) => c.id === 'incapacitated' && c.sleep));
});
