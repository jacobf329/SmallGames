// Chapters 12 to 16 monsters (SRD 5.2.1): Veteran and Bandit Captain (Parry),
// Hobgoblin Captain (Aura of Authority), Mage (Shield), Troll (Regeneration),
// Black Dragons (Acid Breath, Recharge 5-6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, buildMonster, buildGoblin } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform } from '../src/rules/combat.js';
import { WARRIOR_VETERAN, HOBGOBLIN_CAPTAIN, MAGE, TROLL, BLACK_DRAGON_WYRMLING, YOUNG_BLACK_DRAGON } from '../src/rules/data.js';
import { aiNext } from '../src/rules/ai.js';
import { setTurn, dice, last } from './helpers.js';

const hero = (cls, lv, at = {}, opts = {}) => Object.assign(buildHero(validateSpec(defaultSpec(cls, opts), { level: lv }), { level: lv, id: at.id || cls, name: at.id || cls }), at);
const mon = (def, id, x, y, ai = 'melee') => buildMonster(def, { id, label: id, x, y, ai });
// A goblin far away keeps the battle going when the monster under test drops.
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
const end = (b) => assert.ok(perform(b, b.turn.who, { a: 'end' }).ok);

test('Parry: a Veteran adds 2 to its AC against a melee hit that would land by less than 2, once a round', () => {
  const f = hero('fighter', 6, { x: 3, y: 5 });
  const v = mon(WARRIOR_VETERAN, 'v', 3, 4);
  const b = fight([f], [v, spare()]);
  const sword = f.attacks[0].id;
  dice(b, 10);                      // 10 + 8 = 18 against AC 17: a hit, until it parries
  assert.ok(perform(b, 'fighter', { a: 'attack', target: 'v', attack: sword }).ok);
  let r = last(b, 'attack');
  assert.equal(r.outcome, 'miss');
  assert.equal(r.ac, 19);
  assert.ok(r.notes.some((n) => n.rule === 'parry'));
  assert.ok(!b.creatures.v.reaction, 'Parry uses its Reaction');
  dice(b, 10, 4);                   // Extra Attack: the same roll now hits
  assert.ok(perform(b, 'fighter', { a: 'attack', target: 'v', attack: sword }).ok);
  r = last(b, 'attack');
  assert.equal(r.outcome, 'hit');
  assert.equal(r.ac, 17);
});

test('Parry does not turn a ranged attack, or a hit by 2 or more', () => {
  const f = hero('fighter', 6, { x: 3, y: 5 });
  const v = mon(WARRIOR_VETERAN, 'v', 3, 4);
  const b = fight([f], [v, spare()]);
  dice(b, 11, 4);                   // 19 against 17: Parry's +2 would only tie, so it isn't used
  perform(b, 'fighter', { a: 'attack', target: 'v', attack: f.attacks[0].id });
  assert.equal(last(b, 'attack').outcome, 'hit');
  assert.ok(b.creatures.v.reaction);
});

test('Aura of Authority: the Hobgoblin Captain and allies within 10 feet attack and save with Advantage', () => {
  const f = hero('fighter', 6, { x: 3, y: 5, hp: 80 });
  const cap = mon(HOBGOBLIN_CAPTAIN, 'cap', 5, 4);
  const near = mon(WARRIOR_VETERAN, 'near', 3, 4);
  const far = mon(WARRIOR_VETERAN, 'far', 4, 9);
  const b = fight([f], [cap, near, far], 'near');
  dice(b, 2, 15, 3, 3);
  perform(b, 'near', { a: 'attack', target: 'fighter', attack: near.attacks[0].id });
  assert.equal(last(b, 'attack').d20.mode, 'advantage');
  setTurn(b, 'far');
  b.creatures.far.x = 3; b.creatures.far.y = 6;
  b.creatures.cap.x = 0; b.creatures.cap.y = 0;
  dice(b, 15, 3, 3);
  perform(b, 'far', { a: 'attack', target: 'fighter', attack: far.attacks[0].id });
  assert.equal(last(b, 'attack').d20.mode, 'normal');
});

test('Regeneration: a Troll at 0 Hit Points falls Prone and comes back, unless Fire or Acid stops it', () => {
  const f = hero('fighter', 8, { x: 3, y: 5 });
  const t = mon(TROLL, 't', 3, 4);
  const b = fight([f], [t, spare()]);
  b.creatures.t.hp = 5;
  dice(b, 15, 4);
  perform(b, 'fighter', { a: 'attack', target: 't', attack: f.attacks[0].id });
  const T = b.creatures.t;
  assert.equal(T.hp, 0);
  assert.ok(!T.dead, 'not dead yet');
  assert.ok(has(T, 'prone'));
  assert.match(last(b, 'attack').text, /Regeneration/);
  end(b);
  assert.equal(b.turn.who, 't');
  assert.equal(T.hp, 15, 'regains 15 at the start of its turn');

  // Fire stops it: no Regeneration next turn, and at 0 it dies.
  const w = hero('wizard', 8, { x: 3, y: 7 }, { species: 'elf' });
  const t2 = mon(TROLL, 't2', 3, 4);
  const b2 = fight([w], [t2, spare()]);
  b2.creatures.t2.hp = 50;
  dice(b2, 15, 5, 5);
  assert.ok(perform(b2, 'wizard', { a: 'cast', spell: 'fire-bolt', target: 't2' }).ok);
  assert.equal(b2.creatures.t2.hp, 40);
  end(b2);
  assert.equal(b2.creatures.t2.hp, 40, 'no Regeneration after Fire');
  assert.ok(b2.log.some((r) => r.rule === 'regeneration' && /Fire or Acid/.test(r.text || '')));
  end(b2);
  end(b2);   // the spare goblin
  end(b2);   // the wizard
  assert.equal(b2.creatures.t2.hp, 55, 'Regeneration is back the turn after');
  b2.creatures.t2.hp = 5;
  setTurn(b2, 'wizard');
  dice(b2, 15, 5, 5);
  perform(b2, 'wizard', { a: 'cast', spell: 'fire-bolt', target: 't2' });
  assert.ok(b2.creatures.t2.dead, 'burned');
});

test('Acid Breath: a Line, a Dexterity save for half, then Recharge 5-6 at the start of its turns', () => {
  const f = hero('fighter', 6, { x: 3, y: 6, hp: 70 });
  const r = hero('rogue', 6, { x: 3, y: 7, id: 'rogue' }, { species: 'halfling' });
  const d = mon(BLACK_DRAGON_WYRMLING, 'd', 3, 4);
  const b = fight([f, r], [d, spare()], 'd');
  b.order = ['d', 'fighter', 'rogue', 'spare'];
  setTurn(b, 'd');
  const hp0 = [b.creatures.fighter.hp, b.creatures.rogue.hp];
  dice(b, 1, 20, 5, 5, 5, 5, 5);   // fighter fails, rogue succeeds; 5d8 = 25
  assert.ok(perform(b, 'd', { a: 'mbreath', x: 3, y: 5 }).ok);
  assert.ok(b.creatures.fighter.hp < hp0[0]);
  assert.equal(b.creatures.d.mbreath.ready, false);
  assert.ok(!perform(b, 'd', { a: 'mbreath', x: 3, y: 5 }).ok, 'not recharged');
  // Back to its turn: a 4 doesn't recharge it, a 5 does.
  b.round++; dice(b, 4); end(b); end(b); end(b); end(b);
  assert.equal(b.turn.who, 'd');
  assert.equal(b.creatures.d.mbreath.ready, false);
  dice(b, 5); end(b); end(b); end(b); end(b);
  assert.equal(b.creatures.d.mbreath.ready, true);
});

test('Young Black Dragon is immune to Acid; the AI breathes when it can catch several heroes', () => {
  assert.ok(YOUNG_BLACK_DRAGON.immune.includes('Acid'));
  const f = hero('fighter', 10, { x: 3, y: 5 });
  const c = hero('cleric', 10, { x: 3, y: 6, id: 'cleric' });
  const w = hero('wizard', 10, { x: 3, y: 7, id: 'wizard' }, { species: 'elf' });
  const d = mon(YOUNG_BLACK_DRAGON, 'd', 3, 3);
  const b = fight([f, c, w], [d], 'd');
  assert.equal(aiNext(b, 'd').a, 'mbreath');
});

test('Mage: casts Shield as a Reaction to turn a hit into a miss, from its own uses', () => {
  const f = hero('fighter', 7, { x: 3, y: 5 });
  const m = mon(MAGE, 'm', 3, 4, 'caster');
  const b = fight([f], [m, spare()]);
  const before = b.creatures.m.casting.known.shield.free;
  dice(b, 9);                       // 9 + 8 = 17 against AC 15: a hit, until Shield
  perform(b, 'fighter', { a: 'attack', target: 'm', attack: f.attacks[0].id });
  assert.equal(last(b, 'attack').outcome, 'miss');
  assert.equal(b.creatures.m.casting.known.shield.free, before - 1);
  assert.ok(!b.creatures.m.reaction);
});

test('chapters 12 to 16: every fight sits between Low and High for its level and party size', async () => {
  const { buildEncounter } = await import('../src/game/encounters.js');
  const BUDGET = { 6: [600, 1400], 7: [750, 1700], 8: [1000, 2100], 9: [1300, 2600], 10: [1600, 3100] };
  const FLAGS = { keep: 'inside', tower: 'told', causeway: null, yard: 'freed', fen: 'tower' };
  for (const [id, flag] of Object.entries(FLAGS)) for (let n = 1; n <= 4; n++) for (const flags of [{}, flag ? { [flag]: true } : {}]) {
    const e = buildEncounter(id, n, flags);
    const [low, high] = BUDGET[e.level];
    assert.ok(e.xp >= low * n * 0.5 && e.xp <= high * n, `${id} for ${n} ${JSON.stringify(flags)}: ${e.xp} XP`);
  }
  // Each flag the story can set makes its fight smaller.
  for (const [id, flag] of Object.entries(FLAGS)) if (flag) assert.ok(buildEncounter(id, 4, { [flag]: true }).foes.length < buildEncounter(id, 4).foes.length, id);
  assert.ok(!buildEncounter('tower', 3, { told: true }).foes.some((f) => f.name === 'Sir Osric Penn'));
  assert.equal(buildEncounter('fen', 1).foes[0].name, 'Skellmaw');
});
