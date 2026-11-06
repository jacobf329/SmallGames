// First Roll - the party room. It runs on the host's phone (or in a test) and
// is the single authority: seats, lobby, the battle, turn control, AI turns,
// reactions and saves. Transport-free, like Skyline Hustle's room: a
// connection is anything with send(string) and close().
//
//   const room = createRoom({ store, now });
//   const h = room.connect(conn);  h.message(text);  h.close();
//   setInterval(room.tick, 100);
//
// Protocol (JSON):
//   in   hello {name, token}   pick {hero}   start   act {intent}
//        react {yes}           ping {x, y}   again
//   out  welcome {pid, token}  state {...}   ping {pid, x, y}   error {text}

import { buildHero, buildGoblin } from '../rules/character.js';
import { SKIRMISH, PREMADES } from '../rules/data.js';
import { createBattle, rollInitiative, perform, current, resolveReaction } from '../rules/combat.js';
import { aiNext } from '../rules/ai.js';

export const HERO_CLASSES = ['fighter', 'rogue'];
export const MAX_SEATS = 6;            // 2 heroes in Phase 0; extra people watch
export const COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#ba68c8', '#f06292', '#90a4ae'];
export const REACTION_MS = 15000;      // time to answer an Opportunity Attack prompt
export const TAKEOVER_MS = 8000;       // an absent player's hero waits this long before the AI plays it
const AI_STEP_MS = 900;

const makeToken = () => {
  const a = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
};

// store: { load() -> string|null, save(string), remove() }
export function createRoom({ store = null, now = () => Date.now(), seed = null, log = () => {} } = {}) {
  let seats = [];          // [{ pid, token, name, hero, color }]
  let phase = 'lobby';     // lobby | battle
  let battle = null;
  let deadline = 0;        // pending reaction deadline
  let aiAt = 0;            // next AI step
  let takeoverAt = 0;      // when an absent player's turn passes to the AI
  let lastTurnKey = '';
  let nextPid = 1;
  let aiForPlayers = 0;      // AI steps taken for a hero that has a player (diagnostics)
  const online = new Map();  // pid -> set of handles
  const handles = new Set();

  // ------------------------------------------------------------ saves ----
  if (store) {
    try {
      const raw = store.load();
      if (raw) {
        const s = JSON.parse(raw);
        if (s.v === 1) ({ seats, phase, battle, nextPid } = s);
        if (phase === 'battle' && !battle) phase = 'lobby';
      }
    } catch (e) { log('bad save', e); }
  }
  const save = () => {
    if (!store) return;
    try { store.save(JSON.stringify({ v: 1, seats, phase, battle, nextPid })); } catch (e) { log('save failed', e); }
  };

  // --------------------------------------------------------- helpers ----
  const seatOf = (pid) => seats.find((s) => s.pid === pid);
  const isOnline = (pid) => (online.get(pid)?.size || 0) > 0;
  const hostPid = () => seats[0]?.pid;
  const controllerOf = (c) => (c?.side === 'hero' ? seats.find((s) => s.hero === c.cls) : null);

  // Who acts for this creature right now: a pid, or 'ai'.
  function actorFor(c, t) {
    if (!c || c.side === 'foe') return 'ai';
    const s = controllerOf(c);
    if (!s) return 'ai';
    if (isOnline(s.pid)) return s.pid;
    return t >= takeoverAt ? 'ai' : s.pid;
  }

  function publicState() {
    const t = now();
    let b = null;
    if (battle) {
      const { rng, ...rest } = battle;          // nobody needs to see future dice
      b = { ...rest, log: battle.log.slice(-60) };
    }
    const cur = battle && current(battle);
    return {
      t: 'state', phase,
      seats: seats.map((s) => ({ pid: s.pid, name: s.name, hero: s.hero, color: s.color, online: isOnline(s.pid), host: s.pid === hostPid() })),
      battle: b,
      control: cur ? actorFor(cur, t) : null,
      reactor: battle?.pending ? actorFor(battle.creatures[battle.pending.reactor], t) : null,
      reactIn: battle?.pending ? Math.max(0, deadline - t) : 0,
    };
  }

  function broadcast() {
    const s = JSON.stringify(publicState());
    for (const h of handles) h.conn.send(s);
  }
  const changed = () => { save(); broadcast(); };

  const sendTo = (h, msg) => h.conn.send(JSON.stringify(msg));

  // ---------------------------------------------------------- battle ----
  function startBattle() {
    const heroes = HERO_CLASSES.map((cls) => {
      const s = seats.find((x) => x.hero === cls);
      const h = buildHero(cls, { id: cls, name: s ? s.name : `${PREMADES[cls].className} (AI)` });
      Object.assign(h, SKIRMISH.heroStarts[cls]);
      return h;
    });
    const foes = SKIRMISH.foes.map(buildGoblin);
    battle = createBattle({ heroes, foes, walls: SKIRMISH.walls, seed: seed ?? (now() >>> 0) });
    phase = 'battle';
    rollInitiative(battle);
    onTurnChange(true);
  }

  // Called after anything that might have moved the turn on.
  function onTurnChange(force = false) {
    if (!battle) return;
    const c = current(battle);
    const k = `${battle.round}:${battle.idx}`;
    if (force || k !== lastTurnKey) {
      lastTurnKey = k;
      aiAt = now() + AI_STEP_MS;
      takeoverAt = now() + TAKEOVER_MS;
    }
    if (battle.pending && !deadline) deadline = now() + REACTION_MS;
    void c;
  }

  function act(pid, intent) {
    const c = current(battle);
    const r = perform(battle, c.id, intent);
    if (r.ok) onTurnChange();
    return r;
  }

  function react(yes) {
    resolveReaction(battle, yes);
    deadline = 0;
    onTurnChange();
  }

  // ---------------------------------------------------------- messages ----
  function handle(h, m) {
    if (m.t === 'hello') {
      let s = m.token && seats.find((x) => x.token === m.token);
      if (!s) {
        if (seats.length >= MAX_SEATS) return sendTo(h, { t: 'error', text: 'This party is full.' });
        s = { pid: `p${nextPid++}`, token: makeToken(), name: '', hero: null, color: COLORS[seats.length % COLORS.length] };
        seats.push(s);
      }
      const nm = String(m.name || '').trim().slice(0, 20);
      if (nm) s.name = nm;
      if (!s.name) s.name = `Player ${s.pid.slice(1)}`;
      if (h.pid) online.get(h.pid)?.delete(h);
      h.pid = s.pid;
      if (!online.has(s.pid)) online.set(s.pid, new Set());
      online.get(s.pid).add(h);
      sendTo(h, { t: 'welcome', pid: s.pid, token: s.token });
      // A returning player gets their hero back on their next turn.
      if (battle) {
        const c = current(battle);
        if (controllerOf(c)?.pid === s.pid) takeoverAt = now() + TAKEOVER_MS;
        const hero = battle.creatures[s.hero];
        if (hero) hero.name = s.name;
      }
      return changed();
    }
    const s = seatOf(h.pid);
    if (!s) return sendTo(h, { t: 'error', text: 'Say hello first.' });
    const isHost = s.pid === hostPid();

    switch (m.t) {
      case 'pick': {
        if (phase !== 'lobby') return;
        const hero = m.hero == null ? null : String(m.hero);
        if (hero && !HERO_CLASSES.includes(hero)) return;
        if (hero && seats.some((x) => x !== s && x.hero === hero)) return sendTo(h, { t: 'error', text: 'Someone already picked that hero.' });
        s.hero = hero;
        return changed();
      }
      case 'start': {
        if (!isHost) return sendTo(h, { t: 'error', text: 'Only the host can start.' });
        if (phase !== 'lobby') return;
        startBattle();
        return changed();
      }
      case 'again': {
        if (!isHost) return;
        battle = null;
        phase = 'lobby';
        return changed();
      }
      case 'act': {
        if (phase !== 'battle' || !battle) return;
        const c = current(battle);
        if (actorFor(c, now()) !== s.pid) return sendTo(h, { t: 'error', text: "It isn't your turn." });
        const r = act(s.pid, m.intent || {});
        if (!r.ok) return sendTo(h, { t: 'error', text: r.error });
        return changed();
      }
      case 'react': {
        if (!battle?.pending) return;
        const R = battle.creatures[battle.pending.reactor];
        if (actorFor(R, now()) !== s.pid) return;
        react(!!m.yes);
        return changed();
      }
      case 'ping': {
        const msg = JSON.stringify({ t: 'ping', pid: s.pid, x: m.x | 0, y: m.y | 0 });
        for (const o of handles) o.conn.send(msg);
        return;
      }
      default:
    }
  }

  function connect(conn) {
    const h = { conn, pid: null };
    handles.add(h);
    return {
      message(text) {
        let m;
        try { m = JSON.parse(text); } catch { return; }
        if (m && typeof m === 'object') handle(h, m);
      },
      close() {
        handles.delete(h);
        if (h.pid) online.get(h.pid)?.delete(h);
        if (battle && h.pid) {
          const c = current(battle);
          if (controllerOf(c)?.pid === h.pid && !isOnline(h.pid)) takeoverAt = now() + TAKEOVER_MS;
        }
        broadcast();
      },
    };
  }

  // ---------------------------------------------------------- the clock ----
  function tick() {
    if (phase !== 'battle' || !battle || battle.over) return;
    const t = now();
    if (battle.pending) {
      if (!deadline) deadline = t + REACTION_MS;
      const R = battle.creatures[battle.pending.reactor];
      const who = actorFor(R, t);
      // AI always takes the attack; a person who doesn't answer in time takes it too.
      if (who === 'ai' || t >= deadline) { react(true); changed(); }
      return;
    }
    const c = current(battle);
    if (actorFor(c, t) !== 'ai' || t < aiAt) return;
    if (controllerOf(c)) aiForPlayers++;
    const intent = aiNext(battle, c.id) || { a: 'end' };
    let r = act('ai', intent);
    if (!r.ok) r = act('ai', { a: 'end' });
    aiAt = t + (intent.a === 'end' ? AI_STEP_MS / 2 : AI_STEP_MS);
    changed();
  }

  return {
    connect, tick,
    get phase() { return phase; },
    get battle() { return battle; },
    get seats() { return seats; },
    get aiForPlayers() { return aiForPlayers; },
    hasSave: () => phase === 'battle',
    reset() { seats = []; phase = 'lobby'; battle = null; nextPid = 1; store?.remove?.(); },
  };
}
