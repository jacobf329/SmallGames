// Character choices (2024 rules) and aiming spells at any square: the
// rules behind the builder, the level-up spell picks, and the spell aim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, bookLimit, pointCost } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform, checkAim, spellAim, areaTargets } from '../src/rules/combat.js';
import { buildGoblin } from '../src/rules/character.js';
import { SPELLS } from '../src/rules/data.js';
import { createRoom } from '../src/game/room.js';
import { setTurn, dice } from './helpers.js';

const spec = (cls, extra = {}, opts = {}) => validateSpec({ ...defaultSpec(cls, opts), ...extra }, { level: opts.level || 1 });

test('ability scores: point buy within 27 points, or six rolls of 4d6 drop the lowest', () => {
  const pb = { str: 8, dex: 14, con: 15, int: 15, wis: 10, cha: 8 };
  assert.equal(pointCost(pb), 27);
  assert.equal(spec('wizard', { method: 'pointbuy', scores: pb }).scores.int, 15);
  assert.throws(() => spec('wizard', { method: 'pointbuy', scores: { ...pb, cha: 10 } }), /costs 29 points/);
  assert.throws(() => spec('wizard', { method: 'pointbuy', scores: { ...pb, str: 16 } }), /8 to 15/);
  const rolls = [[6, 6, 5, 1], [5, 4, 4, 2], [3, 3, 3, 3], [6, 2, 2, 2], [4, 4, 1, 1], [5, 5, 6, 6]];
  const totals = { str: 17, dex: 13, con: 9, int: 17, wis: 10, cha: 9 };
  const r = spec('wizard', { method: 'roll', rolls, scores: { str: 9, dex: 13, con: 17, int: 17, wis: 10, cha: 9 } });
  assert.equal(r.scores.con, 17);
  assert.throws(() => spec('wizard', { method: 'roll', rolls, scores: { ...totals, str: 18 } }), /rolled total/);
});

test('a human picks the Versatile Origin feat: Magic Initiate from the other list, or Skilled', () => {
  const mi = spec('wizard', { versatile: { feat: 'magic-initiate', list: 'cleric', cantrips: ['guidance', 'sacred-flame'], spell: 'healing-word', ability: 'wis' } });
  assert.equal(mi.background, 'sage');
  assert.equal(mi.bgFeat.list, 'wizard');
  assert.deepEqual(mi.versatile, { feat: 'magic-initiate', list: 'cleric', cantrips: ['guidance', 'sacred-flame'], spell: 'healing-word', ability: 'wis' });
  const h = buildHero(mi);
  assert.equal(h.casting.known['healing-word'].ability, 'wis');
  // The same list twice isn't allowed: it switches to the other one.
  assert.equal(spec('wizard', { versatile: { feat: 'magic-initiate', list: 'wizard' } }).versatile.list, 'cleric');
  const sk = spec('fighter', { versatile: { feat: 'skilled', skills: ['stealth', 'arcana', 'history'] } });
  assert.deepEqual(sk.versatile.skills, ['stealth', 'arcana', 'history']);
  for (const s of ['stealth', 'arcana', 'history']) assert.ok(buildHero(sk).profSkills.includes(s));
});

test('each skill pick stays where the player put it', () => {
  // Perception is in the fighter's default class skills; picked for Skillful, it stays there.
  const s = spec('fighter', { speciesSkill: 'perception', skills: ['athletics'] });
  assert.equal(s.speciesSkill, 'perception');
  assert.ok(!s.skills.includes('perception'));
  assert.equal(s.skills.length, 2);
});

test("cantrips from a species don't count as class cantrips; Magic Initiate cantrips don't repeat them", () => {
  const t = spec('cleric', { order: 'thaumaturge' }, { species: 'tiefling' });
  assert.ok(!t.cantrips.includes('thaumaturgy'));
  assert.equal(t.cantrips.length, 4);
  assert.equal(t.bgFeat.cantrips.length, 2);
  for (const c of t.bgFeat.cantrips) assert.ok(!t.cantrips.includes(c) && c !== 'thaumaturgy');
});

test("a wizard's book: six level 1 spells, then two a level; level 2 spells only from level 3", () => {
  assert.equal(bookLimit(1, 3), 10);
  assert.equal(bookLimit(2, 2), 0);
  assert.equal(bookLimit(2, 3), 2);
  const w = validateSpec({ ...defaultSpec('wizard'), book: ['scorching-ray', 'misty-step', 'hold-person', 'magic-missile'] }, { level: 3 });
  assert.equal(w.book.length, 10);
  assert.equal(w.book.filter((s) => SPELLS[s].level === 2).length, 2);
  assert.ok(!w.book.includes('hold-person'), 'a third level 2 spell does not fit');
  const w2 = validateSpec({ ...defaultSpec('wizard'), book: ['scorching-ray'] }, { level: 2 });
  assert.ok(!w2.book.includes('scorching-ray'));
});

// ------------------------------------------------------- level-up picks ----
function atLevelScene(cls = 'wizard', { rest = false, scene = 'c5-rest', level = 1 } = {}) {
  let saved = null;
  const store = { load: () => saved, save: (s) => { saved = s; }, remove: () => { saved = null; } };
  let room = createRoom({ store, seed: 3 });
  const got = [];
  let h = room.connect({ send: (s) => got.push(JSON.parse(s)), close() {} });
  h.message(JSON.stringify({ t: 'hello', name: 'Ana' }));
  const token = got.find((m) => m.t === 'welcome').token;
  h.message(JSON.stringify({ t: 'hero', spec: defaultSpec(cls) }));
  h.message(JSON.stringify({ t: 'companions', n: 0 }));
  h.message(JSON.stringify({ t: 'start' }));
  const S = JSON.parse(saved);
  Object.assign(S, { phase: 'story', level, story: { scene, votes: {}, check: null, result: null } });
  saved = JSON.stringify(S);
  room = createRoom({ store, seed: 3 });
  got.length = 0;
  h = room.connect({ send: (s) => got.push(JSON.parse(s)), close() {} });
  const say = (m) => h.message(JSON.stringify(m));
  say({ t: 'hello', name: 'Ana', token });
  if (!rest) say({ t: 'continue' });     // the Long Rest ends; everyone reaches level 2
  const last = (t) => [...got].reverse().find((m) => m.t === t);
  return { room, say, last, saved: () => JSON.parse(saved) };
}

test('gaining a level: a wizard writes two new spells in the book, swaps one cantrip at most, and keeps the old book', () => {
  const r = atLevelScene();
  const was = validateSpec(defaultSpec('wizard'), { level: 2 });
  const book = [...defaultSpec('wizard').book, 'alarm', 'identify'];
  r.say({ t: 'levelpick', pick: { cantrips: ['fire-bolt', 'ray-of-frost', 'chill-touch'], book, prepared: ['magic-missile', 'shield', 'alarm', 'identify', 'mage-armor'], scholar: 'arcana' } });
  const me = r.last('state').party[0];
  assert.deepEqual(me.spec.book, book);
  assert.ok(me.spec.prepared.includes('identify'));
  assert.equal(me.spec.scholar, 'arcana');
  assert.notDeepEqual(was.cantrips, me.spec.cantrips);
  r.say({ t: 'levelpick', pick: { cantrips: ['fire-bolt', 'poison-spray', 'mending'], book, prepared: me.spec.prepared } });
  assert.match(r.last('error').text, /swap one cantrip/);
  // Changing your mind about this level's picks is fine; dropping an older spell isn't.
  r.say({ t: 'levelpick', pick: { cantrips: me.spec.cantrips, book: [...defaultSpec('wizard').book, 'alarm', 'feather-fall'], prepared: me.spec.prepared } });
  assert.ok(r.last('state').party[0].spec.book.includes('feather-fall'));
  r.say({ t: 'levelpick', pick: { cantrips: ['fire-bolt', 'ray-of-frost', 'poison-spray'], book: [...book.slice(1), 'feather-fall'], prepared: me.spec.prepared } });
  assert.match(r.last('error').text, /stay in a wizard's spellbook/);
});

test('gaining a level brings each class its own choices: invocations, a Fighting Style, Expertise', () => {
  // Warlock 2: three invocations; the earlier one can be swapped (one per level).
  let r = atLevelScene('warlock');
  const before = r.last('state').party[0].spec.invocations;
  r.say({ t: 'levelpick', pick: { invocations: ['agonizing-blast', 'eldritch-mind', 'fiendish-vigor'], prepared: r.last('state').party[0].spec.prepared } });
  assert.deepEqual(r.last('state').party[0].spec.invocations, ['agonizing-blast', 'eldritch-mind', 'fiendish-vigor']);
  assert.equal(before.length, 1);
  // Paladin 2: a Fighting Style (Blessed Warrior brings two Cleric cantrips), and the level 1 spells stay.
  r = atLevelScene('paladin');
  const pal = validateSpec(defaultSpec('paladin'), { level: 1 });
  r.say({ t: 'levelpick', pick: { style: 'blessed-warrior', warriorCantrips: ['guidance', 'sacred-flame'], prepared: pal.prepared } });
  const ps = r.last('state').party[0].spec;
  assert.equal(ps.style, 'blessed-warrior');
  assert.deepEqual(ps.warriorCantrips, ['guidance', 'sacred-flame']);
  assert.deepEqual(pal.prepared, ['divine-favor', 'bless']);
  r.say({ t: 'levelpick', pick: { style: 'defense', prepared: ['bless', 'heroism', 'command'] } });
  assert.match(r.last('error').text, /keep every prepared spell/);
  // Bard 2: two Expertise skills from the ones the bard knows; a Long Rest can't touch them.
  r = atLevelScene('bard');
  const bs = r.last('state').party[0].spec;
  const prof = validateSpec(bs, { level: 2 });
  r.say({ t: 'levelpick', pick: { expertise: prof.skills.slice(0, 2), prepared: prof.prepared } });
  assert.deepEqual(r.last('state').party[0].spec.expertise, prof.skills.slice(0, 2));
});

test('after a Long Rest: a Paladin swaps one prepared spell, a Sorcerer keeps theirs until a level-up', () => {
  let r = atLevelScene('paladin', { rest: true });
  const pal = validateSpec(defaultSpec('paladin'), { level: 1 });
  const list = ['bless', 'cure-wounds', 'divine-favor', 'heroism', 'shield-of-faith', 'command', 'protection-from-evil-and-good'];
  const fresh = list.filter((x) => !pal.prepared.includes(x));
  r.say({ t: 'levelpick', pick: { prepared: [pal.prepared[0], fresh[0]] } });
  assert.deepEqual(r.last('state').party[0].spec.prepared, [pal.prepared[0], fresh[0]]);
  r.say({ t: 'levelpick', pick: { prepared: [fresh[1], fresh[2]] } });
  assert.match(r.last('error').text, /swap one prepared spell/);
  r = atLevelScene('sorcerer', { rest: true });
  const sor = validateSpec(defaultSpec('sorcerer'), { level: 1 });
  assert.deepEqual(sor.prepared, ['magic-missile', 'shield']);
  r.say({ t: 'levelpick', pick: { prepared: ['magic-missile', 'sleep'] } });
  assert.match(r.last('error').text, /keep every prepared spell/);
});

test('changing spells only happens at a level-up or after a Long Rest', () => {
  const r = atLevelScene();
  const S = r.saved();
  assert.equal(S.story.scene, 'c5-level');
  r.say({ t: 'continue' });
  r.say({ t: 'levelpick', pick: { prepared: ['magic-missile'] } });
  assert.match(r.last('error').text, /level or after a Long Rest/);
});

// ------------------------------------------------------------- aiming ----
function fight(heroes, foes, who) {
  const b = createBattle({ heroes, foes, seed: 9 });
  b.rng.script = [];
  rollInitiative(b);
  b.order = [...heroes, ...foes].map((c) => c.id);
  setTurn(b, who);
  return b;
}
const gob = (id, x, y) => buildGoblin({ id, label: id, x, y, ai: 'melee' });
const wiz = (level = 1, extra = {}, at = { x: 3, y: 8 }) => Object.assign(buildHero(validateSpec({ ...defaultSpec('wizard'), ...extra }, { level }), { id: 'wiz', name: 'Wiz', level }), at);

test('area spells aim at any square: a Cone can point at an empty square, a Cube can land beside the enemies', () => {
  const w = wiz(1);
  const b = fight([w], [gob('g1', 3, 5), gob('g2', 4, 5)], 'wiz');
  // Burning Hands pointed away from everyone still casts, and catches nobody.
  assert.deepEqual(checkAim(b, w, 'burning-hands', { x: 3, y: 9 }).targets, []);
  assert.ok(perform(b, 'wiz', { a: 'cast', spell: 'burning-hands', x: 3, y: 9 }).ok);
  assert.equal(w.casting.slots[1].left, 1);
  // Faerie Fire (a Drow's level 3 spell): a 20-foot Cube on an empty square still covers both goblins.
  const d = wiz(3, { species: 'elf', lineage: 'drow' });
  const b2 = fight([d], [gob('g1', 3, 4), gob('g2', 4, 4)], 'wiz');
  const aim = spellAim('faerie-fire');
  assert.equal(aim.mode, 'area');
  const caught = areaTargets(b2, d, aim, 3, 3).map((c) => c.id).sort();
  assert.deepEqual(caught, ['g1', 'g2']);
  dice(b2, 1, 1);
  assert.ok(perform(b2, 'wiz', { a: 'cast', spell: 'faerie-fire', x: 3, y: 3 }).ok);
  assert.ok(b2.effects.some((e) => e.type === 'outlined'));
});

test('spells that target yourself or a friend: Mage Armor, False Life, Healing Word on yourself', () => {
  const w = wiz(1, { prepared: ['mage-armor', 'false-life', 'magic-missile', 'shield'] });
  const b = fight([w], [gob('g1', 0, 0)], 'wiz');
  const ac = w.ac;
  assert.ok(perform(b, 'wiz', { a: 'cast', spell: 'mage-armor', target: 'wiz' }).ok);
  assert.equal(w.ac, ac + 3);
  assert.match(checkAim(b, w, 'mage-armor', { target: 'wiz' }).error, /already has Mage Armor/);
  assert.equal(spellAim('false-life').mode, 'self');
  const c = Object.assign(buildHero(defaultSpec('cleric'), { id: 'cle', name: 'Cle' }), { x: 4, y: 8 });
  c.hp = 2;
  const b2 = fight([c], [gob('g1', 0, 0)], 'cle');
  assert.ok(perform(b2, 'cle', { a: 'cast', spell: 'healing-word', target: 'cle' }).ok);
  assert.ok(c.hp > 2);
});

test('Magic Missile darts split between creatures; Misty Step picks a square', () => {
  const w = wiz(1);
  const b = fight([w], [gob('g1', 3, 4), gob('g2', 5, 4)], 'wiz');
  dice(b, 2, 3, 4);
  const hp1 = b.creatures.g1.hp, hp2 = b.creatures.g2.hp;
  assert.ok(perform(b, 'wiz', { a: 'cast', spell: 'magic-missile', targets: ['g1', 'g1', 'g2'] }).ok);
  assert.ok(b.creatures.g1.hp < hp1 && b.creatures.g2.hp < hp2);
  const w3 = wiz(3, { prepared: ['misty-step', 'magic-missile', 'shield', 'mage-armor', 'scorching-ray', 'burning-hands'] });
  const b2 = fight([w3], [gob('g1', 0, 0)], 'wiz');
  assert.match(checkAim(b2, w3, 'misty-step', { x: 3, y: 8 }).error, /empty square/);
  assert.ok(perform(b2, 'wiz', { a: 'cast', spell: 'misty-step', x: 5, y: 5 }).ok);
  assert.deepEqual([w3.x, w3.y], [5, 5]);
});

test('level 4 in the campaign: each hero picks a feat', () => {
  const r = atLevelScene('fighter', { scene: 'c9-rest', level: 3 });
  let st = r.last('state');
  assert.equal(st.level, 4);
  assert.equal(st.story.scene, 'c9-level');
  // Left alone, a hero takes Ability Score Improvement in their main score.
  const auto = buildHero(validateSpec(st.party[0].spec, { level: 4 }), { level: 4 });
  assert.equal(auto.scores.str, 19);
  // Ana picks Constitution instead.
  r.say({ t: 'levelpick', pick: { feats: [{ level: 4, feat: 'ability-score-improvement', plus: { con: 2 } }] } });
  st = r.last('state');
  const spec4 = validateSpec(st.party[0].spec, { level: 4 });
  assert.deepEqual(spec4.feats, [{ level: 4, feat: 'ability-score-improvement', plus: { con: 2 } }]);
  const h4 = buildHero(spec4, { level: 4 });
  assert.equal(h4.scores.str, 17);
  assert.equal(h4.scores.con, 17);
  assert.ok(h4.hpMax > auto.hpMax, 'more Constitution, more Hit Points');
  // A feat from another level can't be slipped in.
  r.say({ t: 'levelpick', pick: { feats: [{ level: 4, feat: 'grappler', plus: { str: 1 } }, { level: 2, feat: 'alert' }] } });
  assert.deepEqual(validateSpec(r.last('state').party[0].spec, { level: 4 }).feats.map((f) => f.feat), ['grappler']);
});

test('level 5 in the campaign: everyone gets there with Extra Attack or level 3 spells', () => {
  const f = atLevelScene('fighter', { scene: 'c10-rest', level: 4 });
  assert.equal(f.last('state').level, 5);
  assert.equal(f.last('state').story.scene, 'c10-level');
  const up = f.last('state').story.levelUp.find((x) => x.name === 'Ana');
  assert.ok(up.features.some((x) => x.name === 'Extra Attack'));
  const w = atLevelScene('wizard', { scene: 'c10-rest', level: 4 });
  assert.equal(w.last('state').story.levelUp.find((x) => x.name === 'Ana').slots[3], 2);
});
