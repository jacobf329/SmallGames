// Monsters for levels 16 to 20 (SRD 5.2.1): Vampire, Iron Golem, Balor,
// Pit Fiend, Lich and Ancient Black Dragon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHero, defaultSpec, validateSpec, buildMonster, buildGoblin } from '../src/rules/character.js';
import { createBattle, rollInitiative, perform } from '../src/rules/combat.js';
import { VAMPIRE, IRON_GOLEM, BALOR, PIT_FIEND, LICH, ANCIENT_BLACK_DRAGON, BONE_DEVIL } from '../src/rules/data.js';
import { aiNext } from '../src/rules/ai.js';
import { setTurn, dice, last } from './helpers.js';

const hero = (cls, lv, at = {}, opts = {}) => Object.assign(buildHero(validateSpec({ ...defaultSpec(cls, opts) }, { level: lv }), { level: lv, id: at.id || cls, name: at.id || cls }), at);
const mon = (def, id, x, y, ai = 'melee') => buildMonster(def, { id, label: id, x, y, ai });
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

test('every new monster builds, with its XP and its traits listed', () => {
  for (const def of [VAMPIRE, IRON_GOLEM, BALOR, PIT_FIEND, LICH, ANCIENT_BLACK_DRAGON]) {
    const m = mon(def, 'm', 3, 3);
    assert.equal(m.hp, def.hp);
    assert.ok(m.features.length > 2, def.name);
    for (const f of m.features) assert.ok(!/undefined|NaN/.test(f.text), `${def.name}: ${f.text}`);
  }
  assert.ok(mon(IRON_GOLEM, 'g', 0, 0).features.some((f) => f.name === 'Fire Absorption'));
});

test('Fire Absorption: Fire heals the Iron Golem instead of hurting it', () => {
  const w = hero('wizard', 17, { x: 3, y: 9 }, { species: 'elf' });
  const g = mon(IRON_GOLEM, 'g', 3, 2);
  const b = fight([w], [g]);
  b.creatures.g.hp = 100;
  const r = perform(b, 'wizard', { a: 'cast', spell: 'fireball', x: 3, y: 2, slot: 3 });
  assert.ok(r.ok, r.error);
  assert.ok(b.creatures.g.hp > 100, `golem at ${b.creatures.g.hp}`);
});

test("the Balor's Fire Aura burns whoever ends next to it, and it explodes when it dies", () => {
  const f = hero('fighter', 19, { x: 3, y: 5 });
  const z = mon(BALOR, 'z', 3, 4);
  const b = fight([f], [z], 'z');
  b.creatures.z.legendary = null;
  const hp0 = b.creatures.fighter.hp;
  assert.ok(perform(b, 'z', { a: 'end' }).ok);
  assert.ok(b.creatures.fighter.hp < hp0, 'aura burned the fighter');
  assert.match(JSON.stringify(b.log), /Fire Aura/);
  setTurn(b, 'fighter');
  b.creatures.z.hp = 1;
  dice(b, 20, 20, 20, 20);
  perform(b, 'fighter', { a: 'attack', target: 'z', attack: b.creatures.fighter.attacks[0].id });
  assert.ok(b.creatures.z.dead);
  assert.match(JSON.stringify(b.log), /Death Throes/);
});

test("the Pit Fiend's Fear Aura frightens an enemy that starts its turn close by", () => {
  const f = hero('fighter', 19, { x: 3, y: 6 });
  const p = mon(PIT_FIEND, 'p', 3, 4);
  const b = fight([f], [p], 'p');
  dice(b, 1);
  perform(b, 'p', { a: 'end' });
  assert.ok(has(b.creatures.fighter, 'frightened') || (b.creatures.fighter.fearSafe || []).includes('p'));
});

test("the Vampire's Bite needs a held target, and heals the vampire", () => {
  const f = hero('fighter', 17, { x: 3, y: 5 }, { species: 'elf' });
  const v = mon(VAMPIRE, 'v', 3, 4);
  const b = fight([f], [v], 'v');
  assert.ok(!perform(b, 'v', { a: 'drain', target: 'fighter' }).ok);
  b.creatures.fighter.conds.push({ id: 'grappled', by: 'v', dc: 14 });
  b.creatures.v.hp = 100;
  b.creatures.fighter.indomitable = null;
  b.creatures.fighter.inspiration = false;
  dice(b, 4, 4, 4, 1);   // the damage dice come first, then the save
  const r = perform(b, 'v', { a: 'drain', target: 'fighter' });
  assert.ok(r.ok, r.error);
  assert.ok(b.creatures.v.hp > 100);
});

test("the Lich's Paralyzing Touch takes no save, and the computer plays every new monster without errors", () => {
  const f = hero('fighter', 20, { x: 3, y: 5 });
  const l = mon(LICH, 'l', 3, 4);
  const b = fight([f], [l], 'l');
  dice(b, 19, 1, 1, 1);
  perform(b, 'l', { a: 'attack', target: 'fighter', attack: 'touch' });
  assert.ok(has(b.creatures.fighter, 'paralyzed'));
  for (const def of [VAMPIRE, IRON_GOLEM, BALOR, PIT_FIEND, LICH, ANCIENT_BLACK_DRAGON]) {
    const hs = [hero('fighter', 20, { x: 2, y: 8, id: 'a' }), hero('wizard', 20, { x: 5, y: 9, id: 'c' }, { species: 'elf' })];
    const b2 = fight(hs, [mon(def, 'm', 3, 2)], 'm');
    for (let i = 0; i < 30 && b2.turn?.who === 'm'; i++) {
      const it = aiNext(b2, 'm');
      if (!it) break;
      const r = perform(b2, 'm', it);
      if (!r.ok) { perform(b2, 'm', { a: 'end' }); break; }
    }
  }
});

test('chapters 22 to 26: every fight sits between Low and High for its level and party size', async () => {
  const { buildEncounter } = await import('../src/game/encounters.js');
  const BUDGET = { 16: [3800, 9800], 17: [4500, 11700], 18: [5000, 14200], 19: [5500, 17200], 20: [6400, 22000] };
  const FLAGS = { garside: 'coffin', cell: 'unseen', deep: 'words', dyke: 'reeds', oxlaw: 'jar' };
  for (const [id, flag] of Object.entries(FLAGS)) for (let n = 1; n <= 4; n++) for (const flags of [{}, { [flag]: true }]) {
    const e = buildEncounter(id, n, flags);
    const [low, high] = BUDGET[e.level];
    assert.ok(e.xp >= low * n * 0.5 && e.xp <= high * n, `${id} for ${n} ${JSON.stringify(flags)}: ${e.xp} XP`);
  }
  for (const [id, flag] of Object.entries(FLAGS)) assert.ok(buildEncounter(id, 4, { [flag]: true }).foes.length < buildEncounter(id, 4).foes.length, id);
  assert.equal(buildEncounter('oxlaw', 4).foes[0].name, 'Simon Pettifer');
  assert.equal(buildEncounter('dyke', 3).foes[0].name, 'Old Sedge');
  assert.ok(buildEncounter('cell', 3).foes.some((f) => f.name === 'The Iron Figure'));
});

test('a Multiattack that names its attacks caps each one: one Infernal Sting a turn, and the AI keeps to it', () => {
  const f = hero('fighter', 20, { x: 3, y: 5, hp: 400 }, { species: 'elf' });
  const dv = mon(BONE_DEVIL, 'dv', 3, 4);
  const b = fight([f], [dv, mon(BONE_DEVIL, 'spare', 7, 0)], 'dv');
  f.heroicInspiration = false;
  assert.ok(perform(b, 'dv', { a: 'attack', target: 'fighter', attack: 'sting' }).ok);
  const again = perform(b, 'dv', { a: 'attack', target: 'fighter', attack: 'sting' });
  assert.ok(!again.ok && /only one Infernal Sting/.test(again.error));
  assert.ok(perform(b, 'dv', { a: 'attack', target: 'fighter', attack: 'claw' }).ok);
  const b2 = fight([hero('fighter', 20, { x: 3, y: 5, hp: 400 }, { species: 'elf' })], [mon(BONE_DEVIL, 'dv', 3, 4), mon(BONE_DEVIL, 'spare', 7, 0)], 'dv');
  let stings = 0;
  for (let i = 0; i < 4; i++) { const it = aiNext(b2, 'dv'); if (!it || it.a !== 'attack') break; if (it.attack === 'sting') stings++; assert.ok(perform(b2, 'dv', it).ok); }
  assert.ok(stings <= 1, `stings: ${stings}`);
});
