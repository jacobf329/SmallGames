import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, TAKEOVER_MS, REACTION_MS } from '../src/game/room.js';
import { current, perform } from '../src/rules/combat.js';
import { defaultSpec } from '../src/rules/character.js';
import { SCENES } from '../src/game/campaign.js';
import { aiNext } from '../src/rules/ai.js';

// A fake phone: records what the room sends it.
function phone(room) {
  const got = [];
  const conn = { send: (s) => got.push(JSON.parse(s)), close() {} };
  const h = room.connect(conn);
  const p = {
    got, h,
    say: (m) => h.message(JSON.stringify(m)),
    last: (t) => [...got].reverse().find((m) => m.t === t),
    state: () => p.last('state'),
    pid: () => p.last('welcome').pid,
  };
  return p;
}

function party({ store = null, heroes = ['fighter', 'rogue'], companions = 0 } = {}) {
  let t = 1000;
  const clock = { now: () => t, add: (ms) => { t += ms; } };
  const room = createRoom({ store, now: clock.now, seed: 7 });
  const ana = phone(room); ana.say({ t: 'hello', name: 'Ana' });
  const ben = phone(room); ben.say({ t: 'hello', name: 'Ben' });
  if (heroes[0]) ana.say({ t: 'hero', spec: defaultSpec(heroes[0], { species: 'human' }) });
  if (heroes[1]) ben.say({ t: 'hero', spec: defaultSpec(heroes[1], { species: 'halfling' }) });
  ana.say({ t: 'companions', n: companions });
  return { room, ana, ben, clock };
}

// Play the fight to the end: the phones follow the Coach on their own turns,
// the room's clock runs everything else (AI turns, unanswered prompts).
function finishFight({ room, clock, ana, ben }) {
  for (let i = 0; i < 5000 && room.battle && !room.battle.over; i++) {
    const b = room.battle;
    const c = current(b);
    const ph = [ana, ben].find((x) => x.pid() === c.id);
    if (ph && !b.pending) ph.say({ t: 'act', intent: aiNext(b, c.id) || { a: 'end' } });
    else { clock.add(1000); room.tick(); }
  }
}

test('hello gives each phone a seat and a token; the first is host', () => {
  const { ana, ben } = party();
  assert.ok(ana.last('welcome').token !== ben.last('welcome').token);
  const s = ben.state();
  assert.equal(s.seats.length, 2);
  assert.ok(s.seats[0].host && !s.seats[1].host);
});

test('heroes are validated on the host; the party fills with companions', () => {
  const p = party({ heroes: ['fighter'], companions: 'auto' });
  p.ben.say({ t: 'hero', spec: { ...defaultSpec('wizard'), scores: { str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 } } });
  assert.match(p.ben.last('error').text, /standard array/);
  assert.equal(p.room.party.length, 3, 'auto fills to three heroes');
  assert.ok(!p.room.party.slice(1).some((h) => h.spec.cls === 'fighter'), 'companions cover other classes first');
  p.ana.say({ t: 'companions', n: 0 });
  assert.equal(p.room.party.length, 1);
  p.ben.say({ t: 'companions', n: 3 });
  assert.match(p.ben.last('error').text, /Only the host/);
});

test('story votes: majority wins, a tie goes to the host', () => {
  const p = party();
  p.ana.say({ t: 'start' });
  assert.equal(p.room.story.scene, 'c2-mill');
  p.ana.say({ t: 'vote', choice: 'river' });
  assert.equal(p.room.story.scene, 'c2-mill', 'waits for Ben');
  p.ben.say({ t: 'vote', choice: 'woods' });
  assert.equal(p.room.story.scene, 'c2-river', "tie: the host's pick");
});

test('a single check: claim your own hero, Help needs proficiency, the result moves the story on', () => {
  const p = party({ heroes: ['fighter', 'rogue'] });
  p.ana.say({ t: 'start' });
  p.ana.say({ t: 'vote', choice: 'woods' });
  p.ben.say({ t: 'vote', choice: 'woods' });
  assert.equal(p.room.story.scene, 'c2-woods');
  p.ana.say({ t: 'claim', hero: p.ben.pid() });
  assert.match(p.ana.last('error').text, /isn't your hero/);
  p.ben.say({ t: 'claim', hero: p.ben.pid() });         // the Rogue has Expertise in Perception
  p.ana.say({ t: 'help', hero: p.ana.pid() });          // the Human Fighter is proficient (Skillful)
  assert.deepEqual(p.room.story.check.helpers, [p.ana.pid()]);
  p.ben.say({ t: 'roll' });
  const r = p.room.story.check.rolls[p.ben.pid()];
  assert.equal(r.d20.rolls.length, 2, 'Help gives Advantage');
  assert.equal(r.mods.reduce((s, m) => s + m.value, 0), 1 + 4);
  const res = p.room.story.result;
  assert.ok(res);
  p.ana.say({ t: 'continue' });
  assert.equal(p.room.phase, 'battle');
  const init = p.room.battle.log.find((x) => x.kind === 'initiative');
  assert.equal(init.entries.some((e) => e.surprised), true, 'someone was surprised');
  assert.equal(init.entries.filter((e) => e.surprised)[0].id.startsWith('f'), res.success);
});

test('a group check: everyone rolls; companions roll once the players have', () => {
  const p = party({ companions: 1 });
  p.ana.say({ t: 'start' });
  const b = p.room;
  // Skip ahead to the camp.
  for (const v of ['river']) { p.ana.say({ t: 'vote', choice: v }); p.ben.say({ t: 'vote', choice: v }); }
  p.ana.say({ t: 'vote', choice: 'fight' });
  p.ben.say({ t: 'vote', choice: 'fight' });
  finishFight(p);
  if (b.battle.over === 'defeat') { p.ana.say({ t: 'retry' }); finishFight(p); }
  p.ana.say({ t: 'continue' });
  assert.equal(b.story.scene, 'c2-after');
  p.ana.say({ t: 'vote', choice: 'follow' }); p.ben.say({ t: 'vote', choice: 'follow' });
  p.ana.say({ t: 'vote', choice: 'sneak' }); p.ben.say({ t: 'vote', choice: 'sneak' });
  assert.equal(b.story.scene, 'c3-sneak');
  p.ana.say({ t: 'roll' });
  assert.equal(Object.keys(b.story.check.rolls).length, 1);
  p.ben.say({ t: 'roll' });
  assert.equal(Object.keys(b.story.check.rolls).length, 3, 'the companion rolled too');
  const rolls = Object.values(b.story.check.rolls);
  assert.equal(b.story.result.success, rolls.filter((r) => r.outcome === 'success').length >= 2);
});

test("only a hero's player can act on their turn, and a dropped player is covered by the AI", () => {
  const p = party();
  p.ana.say({ t: 'start' });
  p.ana.say({ t: 'vote', choice: 'river' }); p.ben.say({ t: 'vote', choice: 'river' });
  p.ana.say({ t: 'vote', choice: 'fight' }); p.ben.say({ t: 'vote', choice: 'fight' });
  const b = p.room.battle;
  for (let i = 0; i < 300 && current(b).id !== p.ben.pid() && !b.over; i++) {
    if (current(b).id === p.ana.pid()) p.ana.say({ t: 'act', intent: { a: 'end' } });
    else { p.clock.add(1000); p.room.tick(); }
  }
  if (b.over) return;
  p.ana.say({ t: 'act', intent: { a: 'end' } });
  assert.match(p.ana.last('error').text, /isn't your turn/);
  const token = p.ben.last('welcome').token;
  p.ben.h.close();
  p.clock.add(TAKEOVER_MS - 100); p.room.tick();
  assert.equal(current(b).id, p.ben.pid(), 'still waiting for Ben');
  p.clock.add(200); p.room.tick();
  assert.equal(p.ana.state().control, 'ai');
  const ben2 = phone(p.room);
  ben2.say({ t: 'hello', name: 'Ben', token });
  assert.equal(ben2.pid(), p.ben.pid());
  assert.equal(p.room.seats.length, 2);
});

test('Opportunity Attack prompts go to the player; no answer in time means attack', () => {
  const p = party();
  p.ana.say({ t: 'start' });
  p.ana.say({ t: 'vote', choice: 'river' }); p.ben.say({ t: 'vote', choice: 'river' });
  p.ana.say({ t: 'vote', choice: 'fight' }); p.ben.say({ t: 'vote', choice: 'fight' });
  const b = p.room.battle;
  const F = b.creatures[p.ana.pid()], G = b.creatures.f1;
  G.x = F.x; G.y = F.y - 1;
  b.idx = b.order.indexOf('f1');
  b.turn = { who: 'f1', action: 0, bonus: 0, moveLeft: 30, moves: 0, steps: 0, attacksLeft: 0 };
  perform(b, 'f1', { a: 'move', x: G.x, y: G.y - 3 });
  assert.equal(b.pending.reactor, F.id);
  p.room.tick();
  p.ben.say({ t: 'react', yes: false });           // Ben can't answer for Ana
  assert.ok(b.pending);
  p.clock.add(REACTION_MS + 1); p.room.tick();
  assert.equal(b.pending, null);
  assert.ok(b.log.some((r) => r.kind === 'attack' && r.reaction && r.by === F.id));
});

test('the host saves after every change and resumes mid-story', () => {
  let saved = null;
  const store = { load: () => saved, save: (s) => { saved = s; }, remove: () => { saved = null; } };
  const p = party({ store });
  p.ana.say({ t: 'start' });
  p.ana.say({ t: 'vote', choice: 'woods' }); p.ben.say({ t: 'vote', choice: 'woods' });
  const again = createRoom({ store, now: p.clock.now });
  assert.equal(again.phase, 'story');
  assert.equal(again.story.scene, 'c2-woods');
  assert.equal(again.seats.length, 2);
});

test('the whole campaign plays through to the end (AI fights, rests, level-ups, retry on defeat)', () => {
  const p = party({ companions: 1 });
  p.ana.say({ t: 'start' });
  const seen = new Set();
  let retries = 0;
  for (let step = 0; step < 2000 && SCENES[p.room.story?.scene]?.kind !== 'end'; step++) {
    const r = p.room;
    if (r.phase === 'battle') {
      finishFight(p);
      if (r.battle.over !== 'victory') retries++;
      p.ana.say({ t: r.battle.over === 'victory' ? 'continue' : 'retry' });
      continue;
    }
    const sc = SCENES[r.story.scene];
    seen.add(sc.chapter);
    if (sc.kind === 'story') {
      const ch = sc.choices.find((c) => !c.requires || r.story && p.ana.state().flags[c.requires]);
      p.ana.say({ t: 'vote', choice: ch.id }); p.ben.say({ t: 'vote', choice: ch.id });
    } else if (sc.kind === 'check' && !r.story.result) {
      if (sc.check.mode === 'single') { p.ana.say({ t: 'claim', hero: p.ana.pid() }); p.ana.say({ t: 'roll' }); }
      else { p.ana.say({ t: 'roll' }); p.ben.say({ t: 'roll' }); }
    } else if (sc.kind === 'save' && !r.story.result) {
      p.ana.say({ t: 'roll' }); p.ben.say({ t: 'roll' });
      assert.ok(r.story.result, 'companions roll once the players have');
    } else if (sc.kind === 'rest' && sc.rest === 'short' && !r.story.rest.results) {
      p.ana.say({ t: 'hitdie' });
      p.ana.say({ t: 'continue' });
    } else p.ana.say({ t: 'continue' });
  }
  assert.equal(p.room.story.scene, 'c21-end');
  assert.deepEqual([...seen].sort((x, y) => x - y), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  assert.equal(p.ana.state().level, 15);
  assert.equal(p.room.aiForPlayers, 0, 'the AI never played for a connected player');
  assert.ok(retries < 60, `retries: ${retries}`);
});
