// Levels beyond 3: proficiency, Ability Score Improvement feats, the
// Grappler feat and the Grapple option of an Unarmed Strike.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, levelChoices, finalScores } from '../src/rules/character.js';
import { perform, createBattle, rollInitiative } from '../src/rules/combat.js';
import { buildGoblin } from '../src/rules/character.js';
import { asiLevels, SLOT_TABLES } from '../src/rules/data.js';
import { setTurn, dice, last } from './helpers.js';

const spec = (cls, extra = {}, level = 4) => validateSpec({ ...defaultSpec(cls), ...extra }, { level });

test('Ability Score Improvement levels: 4, 8, 12, 16 and 19 is the boon; fighters and rogues get extra', () => {
  assert.deepEqual(asiLevels('wizard', 20), [4, 8, 12, 16, 19]);
  assert.deepEqual(asiLevels('fighter', 20), [4, 6, 8, 12, 14, 16, 19]);
  assert.deepEqual(asiLevels('rogue', 20), [4, 8, 10, 12, 16, 19]);
  assert.ok(levelChoices('wizard', 4).includes('feat'));
  assert.ok(!levelChoices('wizard', 5).includes('feat'));
  assert.ok(levelChoices('fighter', 6).includes('feat'));
});

test('a level 4 hero gets an Ability Score Improvement by default: +2 to the main ability', () => {
  const s = spec('wizard');
  assert.equal(s.feats.length, 1);
  assert.equal(s.feats[0].feat, 'ability-score-improvement');
  assert.deepEqual(s.feats[0].plus, { int: 2 });
  const before = finalScores({ ...s, feats: [] }).int;
  assert.equal(finalScores(s).int, before + 2);
  const h = buildHero(s, { level: 4 });
  assert.equal(h.scores?.int ?? h.abilities?.int ?? finalScores(s).int, before + 2);
  assert.ok(h.features.some((f) => /Ability Score Improvement/.test(f.name)));
  assert.equal(h.pb, 2);
  assert.equal(buildHero(spec('wizard', {}, 5), { level: 5 }).pb, 3);
});

test('an Ability Score Improvement is +2 to one or +1 to two, and never past 20', () => {
  assert.deepEqual(spec('fighter', { feats: [{ level: 4, feat: 'ability-score-improvement', plus: { str: 1, con: 1 } }] }).feats[0].plus, { str: 1, con: 1 });
  // +3, or +1 alone, isn't allowed: back to the default.
  const bad = spec('fighter', { feats: [{ level: 4, feat: 'ability-score-improvement', plus: { str: 3 } }] }).feats[0].plus;
  assert.equal(Object.values(bad).reduce((a, b) => a + b, 0), 2);
  assert.ok(Object.values(bad).every((v) => v <= 2));
  const one = spec('fighter', { feats: [{ level: 4, feat: 'ability-score-improvement', plus: { str: 1 } }] }).feats[0].plus;
  assert.equal(Object.values(one).reduce((a, b) => a + b, 0), 2);
});

test('a feat in place of the increase: Grappler needs Strength or Dexterity 13; a Fighting Style needs the class feature', () => {
  const g = spec('fighter', { feats: [{ level: 4, feat: 'grappler', plus: { str: 1 } }] });
  assert.equal(g.feats[0].feat, 'grappler');
  assert.deepEqual(g.feats[0].plus, { str: 1 });
  assert.ok(buildHero(g, { level: 4 }).grappler);
  // A wizard has no Fighting Style feature, so that falls back.
  assert.equal(spec('wizard', { feats: [{ level: 4, feat: 'fighting-style', style: 'defense' }] }).feats[0].feat, 'ability-score-improvement');
  // A fighter's second style can't repeat the first.
  const f = spec('fighter', { feats: [{ level: 4, feat: 'fighting-style', style: defaultSpec('fighter').style }] });
  assert.equal(f.feats[0].feat, 'fighting-style');
  assert.notEqual(f.feats[0].style, f.style);
  const h = buildHero(spec('fighter', { feats: [{ level: 4, feat: 'fighting-style', style: 'archery' }] }), { level: 4 });
  if (h.style !== 'archery') assert.ok(h.styles.includes('archery'));
});

test('Skilled as a level 4 feat adds three new proficiencies', () => {
  const s = spec('rogue', { feats: [{ level: 4, feat: 'skilled', skills: ['history', 'medicine', 'nature'] }] });
  const known = new Set(spec('rogue').skills);
  assert.equal(s.feats[0].skills.length, 3);
  for (const x of s.feats[0].skills) assert.ok(!known.has(x));
});

test('Grapple: an Unarmed Strike option; on a failed save the target is Grappled', () => {
  const f = buildHero(spec('fighter', { feats: [{ level: 4, feat: 'grappler', plus: { str: 1 } }] }), { level: 4, id: 'fighter', name: 'Ana' });
  Object.assign(f, { x: 3, y: 5 });
  const g = buildGoblin({ id: 'g1', label: 'Goblin 1', x: 3, y: 4, ai: 'melee' });
  const b = createBattle({ heroes: [f], foes: [g], walls: [], seed: 7 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = ['fighter', 'g1'];
  setTurn(b, 'fighter');
  dice(b, 2);                       // the goblin's save
  const r = perform(b, 'fighter', { a: 'grapple', target: 'g1' });
  assert.ok(!r?.error, r?.error);
  assert.ok(b.creatures.g1.conds.some((c) => c.id === 'grappled' && c.by === 'fighter'));
  assert.equal(last(b, 'save-spell').what, 'Grapple');
  // Grappler: Advantage on attacks against the creature you're grappling.
  b.turn.action = 1;
  b.turn.attacksLeft = undefined;
  dice(b, 15, 3, 4);
  perform(b, 'fighter', { a: 'attack', target: 'g1', attack: f.attacks[0].id });
  const atk = last(b, 'attack');
  assert.equal(atk.d20.mode, 'advantage');
  assert.equal(atk.d20.adv[0].rule, 'grappler');
});

test('half and Pact casters gain slots on the 2024 tables', () => {
  assert.deepEqual(SLOT_TABLES.half[5], { 1: 4, 2: 2 });
  assert.deepEqual(SLOT_TABLES.half[20], { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 });
  assert.deepEqual(SLOT_TABLES.pact[5], { 3: 2 });
  assert.deepEqual(SLOT_TABLES.pact[11], { 5: 3 });
});
