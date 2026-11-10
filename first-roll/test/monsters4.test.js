// Chapters 17 to 21 monsters (SRD 5.2.1): Legendary Actions and Resistance,
// Magic Resistance, Dreadful Glare, Hammer Throw, Infernal Sting, Evasion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, buildMonster, buildGoblin } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform } from '../src/rules/combat.js';
import { ADULT_BLACK_DRAGON, MUMMY_LORD, FIRE_GIANT, BONE_DEVIL, ASSASSIN, STONE_GOLEM } from '../src/rules/data.js';
import { aiNext } from '../src/rules/ai.js';
import { setTurn, dice, last } from './helpers.js';

const hero = (cls, lv, at = {}, opts = {}) => Object.assign(buildHero(validateSpec(defaultSpec(cls, opts), { level: lv }), { level: lv, id: at.id || cls, name: at.id || cls }), at);
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
const end = (b) => assert.ok(perform(b, b.turn.who, { a: 'end' }).ok);

test('Legendary Actions: the Adult Black Dragon acts right after a hero turn, and gets them back on its own turn', () => {
  const f = hero('fighter', 14, { x: 3, y: 5, hp: 150 });
  const w = hero('wizard', 14, { x: 1, y: 9, id: 'wizard' }, { species: 'elf' });
  const d = mon(ADULT_BLACK_DRAGON, 'd', 3, 3);
  const b = fight([f, w], [d]);
  end(b);   // the fighter ends; the dragon takes one
  const D = b.creatures.d;
  assert.equal(D.legendary.uses, 2);
  assert.ok(b.log.some((r) => r.rule === 'legendary-actions' && /Cloud of Insects/.test(r.text || '')), 'Cloud of Insects first');
  assert.equal(b.turn.who, 'wizard');
  end(b);   // the wizard ends: Cloud of Insects is spent this round, so Pounce or a Rend
  const acts = b.log.filter((r) => r.rule === 'legendary-actions' && /takes a Legendary Action/.test(r.text || ''));
  assert.equal(acts.length, 2);
  assert.match(acts[1].text, /Pounce/);
  assert.equal(b.turn.who, 'd');
  assert.equal(D.legendary.uses, 3, 'back to 3 at the start of its turn');
});

test('Legendary Resistance turns a failed save into a success, three times a day', () => {
  const w = hero('wizard', 14, { x: 3, y: 9 }, { species: 'elf' });
  const d = mon(ADULT_BLACK_DRAGON, 'd', 3, 3);
  const b = fight([w], [d, spare()]);
  dice(b, 1);
  perform(b, 'wizard', { a: 'cast', spell: 'hold-person', target: 'd', targets: ['d'] });
  assert.equal(b.creatures.d.legRes.uses, 3, 'Hold Person needs a Humanoid: no save made');
  b.creatures.d.hp = 195;
  b.turn.action = 1; b.turn.magicUsed = false; b.creatures.wizard.slotKey = null;
  dice(b, 3, 3, 3, 3, 3, 3, 3, 3, 1);   // the damage dice come first, then its save: a 1
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'fireball', slot: 3, x: 3, y: 3 }).ok);
  assert.equal(b.creatures.d.legRes.uses, 2);
  const r = last(b, 'save-spell');
  assert.ok(r.results[0].success);
});

test('Dreadful Glare: Psychic damage, and Paralyzed until the end of the mummy lord\'s next turn', () => {
  const w = hero('wizard', 15, { x: 3, y: 7, hp: 90 }, { species: 'elf' });
  const m = mon(MUMMY_LORD, 'm', 3, 3);
  const b = fight([w], [m, spare()], 'm');
  dice(b, 6, 6, 6, 6, 6, 6, 1);     // 6d6 + 4 = 40, then a failed save
  assert.ok(perform(b, 'm', { a: 'glare', target: 'wizard' }).ok);
  assert.equal(b.creatures.wizard.hp, 50);
  assert.ok(has(b.creatures.wizard, 'paralyzed'));
  assert.ok(!perform(b, 'm', { a: 'glare', target: 'wizard' }).ok, 'once a turn');
  assert.ok(b.turn.action, 'it still has its attack');
  assert.equal(aiNext(b, 'm').a !== 'glare', true);
});

test('Whirlwind of Sand adds 2 to the mummy lord\'s AC against a ranged attack too', () => {
  const r = hero('ranger', 15, { x: 3, y: 9 }, { species: 'elf' });
  const m = mon(MUMMY_LORD, 'm', 3, 3);
  const b = fight([r], [m, spare()]);
  dice(b, 5, 5);                    // 5 + 12 = 17 against AC 17: a hit, until the sand
  perform(b, 'ranger', { a: 'attack', target: 'm', attack: 'longbow' });
  const a = last(b, 'attack');
  assert.ok(a.notes.some((n) => /Whirlwind of Sand/.test(n.text)), JSON.stringify(a.notes));
  assert.equal(a.outcome, 'miss');
});

test('Magic Resistance gives Advantage on saves against spells; Evasion halves to nothing', () => {
  const w = hero('wizard', 12, { x: 3, y: 9 }, { species: 'elf' });
  const g = mon(STONE_GOLEM, 'g', 3, 3);
  const a = mon(ASSASSIN, 'a', 4, 3);
  const b = fight([w], [g, a, spare()]);
  dice(b, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 15);   // 8d6 = 24, then the golem's two d20s and the assassin's
  assert.ok(perform(b, 'wizard', { a: 'cast', spell: 'fireball', slot: 3, x: 3, y: 3 }).ok);
  const r = last(b, 'save-spell');
  const gs = r.results.find((x) => x.target === 'g');
  assert.equal(gs.d20.mode, 'advantage');
  const as = r.results.find((x) => x.target === 'a');
  assert.ok(as.success);
  assert.equal(as.damage, 0, 'Evasion');
});

test('Hammer Throw knocks a hero back and puts them off their next attack; Infernal Sting stops healing', () => {
  const f = hero('fighter', 12, { x: 3, y: 6, hp: 140 });
  const g = mon(FIRE_GIANT, 'g', 3, 2);
  const b = fight([f], [g, spare()], 'g');
  dice(b, 15, 5, 5, 5, 5);
  assert.ok(perform(b, 'g', { a: 'attack', target: 'fighter', attack: 'hammer' }).ok);
  assert.equal(b.creatures.fighter.y, 9);
  assert.ok(b.effects.some((e) => e.type === 'mocked' && e.target === 'fighter'));

  const c = hero('cleric', 12, { x: 3, y: 6, hp: 40 });
  const dv = mon(BONE_DEVIL, 'dv', 3, 4);
  const b2 = fight([c], [dv, spare()], 'dv');
  dice(b2, 15, 1, 1, 1, 1, 1, 1);
  assert.ok(perform(b2, 'dv', { a: 'attack', target: 'cleric', attack: 'sting' }).ok);
  assert.ok(b2.effects.some((e) => e.type === 'grave' && e.target === 'cleric'));
  assert.ok(has(b2.creatures.cleric, 'poisoned') || b2.creatures.cleric.condImmune?.includes('poisoned'));
});

test('chapters 17 to 21: every fight sits between Low and High for its level and party size', async () => {
  const { buildEncounter } = await import('../src/game/encounters.js');
  const BUDGET = { 11: [1900, 4100], 12: [2200, 4700], 13: [2600, 5400], 14: [2900, 6200], 15: [3300, 7800] };
  const FLAGS = { gaol: 'barred', pass: 'track', mine: 'sluice', abbey: 'circle', undercroft: 'bricked' };
  for (const [id, flag] of Object.entries(FLAGS)) for (let n = 1; n <= 4; n++) for (const flags of [{}, { [flag]: true }]) {
    const e = buildEncounter(id, n, flags);
    const [low, high] = BUDGET[e.level];
    assert.ok(e.xp >= low * n * 0.5 && e.xp <= high * n, `${id} for ${n} ${JSON.stringify(flags)}: ${e.xp} XP`);
  }
  // Each flag the story can set makes its fight smaller.
  for (const [id, flag] of Object.entries(FLAGS)) assert.ok(buildEncounter(id, 4, { [flag]: true }).foes.length < buildEncounter(id, 4).foes.length, id);
  assert.equal(buildEncounter('undercroft', 3).foes[0].name, 'Abbot Godric');
  assert.ok(!buildEncounter('abbey', 4, { circle: true }).foes.some((f) => f.name === 'Bone Devil'));
});

test('a Legendary Action attack between turns waits for the hero\'s Shield, then play goes on', async () => {
  const { resolveReaction } = await import('../src/rules/combat.js');
  const w = hero('wizard', 14, { x: 3, y: 4, hp: 90 }, { species: 'elf' });
  const d = mon(ADULT_BLACK_DRAGON, 'd', 3, 2);
  const b = fight([w], [d, spare()]);
  assert.ok(b.creatures.wizard.casting.known.shield, 'the default wizard has Shield');
  b.creatures.d.legendary.spent.push('insects');   // Cloud of Insects already used this round
  dice(b, 4);                       // 4 + 11 = 15: a hit, unless Shield adds 5
  end(b);
  assert.equal(b.pending?.kind, 'shield');
  assert.equal(b.turn.who, 'wizard', 'the next turn waits for the answer');
  resolveReaction(b, true);
  assert.ok(!b.pending);
  assert.equal(b.turn.who, 'd');
  assert.equal(last(b, 'attack').outcome, 'miss');
});
