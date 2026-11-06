import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, TAKEOVER_MS, REACTION_MS } from '../src/game/room.js';
import { current } from '../src/rules/combat.js';

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
  };
  return p;
}

function party({ store = null } = {}) {
  let t = 1000;
  const clock = { now: () => t, add: (ms) => { t += ms; } };
  const room = createRoom({ store, now: clock.now, seed: 7 });
  const ana = phone(room); ana.say({ t: 'hello', name: 'Ana' });
  const ben = phone(room); ben.say({ t: 'hello', name: 'Ben' });
  return { room, ana, ben, clock };
}

test('hello gives each phone a seat and a token; the first is host', () => {
  const { ana, ben } = party();
  const wa = ana.last('welcome'), wb = ben.last('welcome');
  assert.ok(wa.token && wb.token && wa.token !== wb.token);
  const s = ben.state();
  assert.equal(s.seats.length, 2);
  assert.ok(s.seats[0].host && !s.seats[1].host);
  assert.ok(s.seats.every((x) => x.online));
});

test('picking heroes, and only the host can start', () => {
  const { ana, ben } = party();
  ana.say({ t: 'pick', hero: 'fighter' });
  ben.say({ t: 'pick', hero: 'fighter' });
  assert.match(ben.last('error').text, /already picked/);
  ben.say({ t: 'pick', hero: 'rogue' });
  ben.say({ t: 'start' });
  assert.match(ben.last('error').text, /Only the host/);
  ana.say({ t: 'start' });
  const s = ben.state();
  assert.equal(s.phase, 'battle');
  assert.equal(s.battle.creatures.fighter.name, 'Ana');
  assert.equal(s.battle.creatures.rogue.name, 'Ben');
  assert.equal(s.battle.rng, undefined, 'dice state stays on the host');
});

function toHeroTurn({ room, clock }) {
  for (let i = 0; i < 200 && current(room.battle).side !== 'hero'; i++) { clock.add(1000); room.tick(); }
  return current(room.battle);
}

test("only the hero's player can act on their turn", () => {
  const p = party();
  p.ana.say({ t: 'pick', hero: 'fighter' });
  p.ben.say({ t: 'pick', hero: 'rogue' });
  p.ana.say({ t: 'start' });
  const c = toHeroTurn(p);
  const [mine, other] = c.cls === 'fighter' ? [p.ana, p.ben] : [p.ben, p.ana];
  other.say({ t: 'act', intent: { a: 'end' } });
  assert.match(other.last('error').text, /isn't your turn/);
  assert.equal(mine.state().control, mine.last('welcome').pid);
  mine.say({ t: 'act', intent: { a: 'dodge' } });
  assert.equal(p.room.battle.turn.action, 0);
});

test('a player who drops is handed to the AI after a grace period, and gets the seat back with their token', () => {
  const p = party();
  p.ana.say({ t: 'pick', hero: 'fighter' });
  p.ben.say({ t: 'pick', hero: 'rogue' });
  p.ana.say({ t: 'start' });
  // Make sure it's the Rogue's turn.
  for (let i = 0; i < 300 && current(p.room.battle).id !== 'rogue'; i++) {
    const c = current(p.room.battle);
    if (c.id === 'fighter') p.ana.say({ t: 'act', intent: { a: 'end' } });
    else { p.clock.add(1000); p.room.tick(); }
  }
  assert.equal(current(p.room.battle).id, 'rogue');
  const token = p.ben.last('welcome').token;
  p.ben.h.close();
  assert.equal(p.ana.state().seats[1].online, false);
  p.clock.add(TAKEOVER_MS - 100); p.room.tick();
  assert.equal(current(p.room.battle).id, 'rogue', 'still waiting for Ben');
  p.clock.add(200); p.room.tick();
  assert.equal(p.ana.state().control, 'ai');
  // Ben comes back on a new connection.
  const ben2 = phone(p.room);
  ben2.say({ t: 'hello', name: 'Ben', token });
  assert.equal(ben2.last('welcome').pid, p.ben.last('welcome').pid);
  assert.equal(p.room.seats.length, 2);
});

test('Opportunity Attack prompts go to the player; no answer in time means attack', () => {
  const p = party();
  p.ana.say({ t: 'pick', hero: 'fighter' });
  p.ben.say({ t: 'pick', hero: 'rogue' });
  p.ana.say({ t: 'start' });
  const b = p.room.battle;
  // Put goblin 1 next to the Fighter and give the goblin the turn, moving away.
  const F = b.creatures.fighter, G = b.creatures.g1;
  G.x = F.x; G.y = F.y - 1;
  b.idx = b.order.indexOf('g1');
  b.turn = { who: 'g1', action: 0, bonus: 0, moveLeft: 30, moves: 0, steps: 0 };
  p.ana.say({ t: 'act', intent: { a: 'end' } });   // not Ana's turn: ignored
  // Move the goblin directly with the rules engine, as the AI would.
  return import('../src/rules/combat.js').then(({ perform: act }) => {
    act(b, 'g1', { a: 'move', x: G.x, y: G.y - 3 });
    assert.equal(b.pending.reactor, 'fighter');
    p.room.tick();                                  // starts the clock on the prompt
    p.ben.say({ t: 'react', yes: false });          // Ben can't answer for Ana
    assert.ok(b.pending);
    p.clock.add(REACTION_MS + 1); p.room.tick();
    assert.equal(b.pending, null);
    assert.ok(b.log.some((r) => r.kind === 'attack' && r.reaction && r.by === 'fighter'));
  });
});

test('the host saves after every change and can resume the fight', () => {
  let saved = null;
  const store = { load: () => saved, save: (s) => { saved = s; }, remove: () => { saved = null; } };
  const p = party({ store });
  p.ana.say({ t: 'pick', hero: 'fighter' });
  p.ana.say({ t: 'start' });
  const seq = p.room.battle.seq;
  const again = createRoom({ store, now: p.clock.now });
  assert.equal(again.phase, 'battle');
  assert.equal(again.battle.seq, seq);
  assert.equal(again.seats.length, 2);
});

test('unpicked heroes are played by the AI; a whole AI fight finishes', () => {
  const p = party();
  p.ana.say({ t: 'start' });
  for (let i = 0; i < 2000 && !p.room.battle.over; i++) { p.clock.add(1000); p.room.tick(); }
  assert.ok(p.room.battle.over);
  assert.equal(p.ben.state().battle.over, p.room.battle.over);
});
