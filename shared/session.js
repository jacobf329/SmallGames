// Turbo Surfers - the race server logic, without any networking: rooms, the
// join / lobby / start / input messages and the fixed-step race loop with
// snapshots. The LAN server (server/index.js) plugs WebSockets into it; in
// online play the host's own phone runs it and plugs in WebRTC data channels
// and its own screen. A connection is anything with send(string) and an
// `open` flag.
//
//   const srv = createRaceServer({ fixedRoom: 'KXPF' });
//   const h = srv.connect(conn);  h.message(text);  h.close();
//   setInterval(() => srv.tick(seconds), 1000 / 60);

import { Room, STATE, DISTANCES, sanitizeName } from './room.js';
import * as C from './constants.js';

const randomId = () => Array.from({ length: 12 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

// fixedRoom: every player lands in this one room whatever code they send
// (online hosting). Without it, rooms are made on demand by race code (LAN).
export function createRaceServer({ fixedRoom = null, urls = () => [], newId = randomId } = {}) {
  const rooms = new Map();

  function getRoom(code) {
    if (fixedRoom) code = fixedRoom;
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'MAIN';
    if (!rooms.has(code)) rooms.set(code, new Room(code));
    return rooms.get(code);
  }

  function broadcast(room, msg) {
    const text = JSON.stringify(msg);
    for (const p of room.players) if (p.conn && p.conn.open) p.conn.send(text);
  }
  function sendLobby(room) {
    broadcast(room, { t: 'lobby', room: room.lobbyState() });
  }
  // Each player gets the shared snapshot plus a private block for their own
  // runner, which is what makes client-side prediction accurate.
  function sendSnapshot(room) {
    const base = room.snapshot();
    for (const p of room.players) {
      if (!p.conn || !p.conn.open) continue;
      base.me = room.meBlock(p);
      p.conn.send(JSON.stringify(base));
    }
    base.me = undefined;
  }

  function connect(conn) {
    const ctx = { id: newId(), room: null, player: null, msgs: 0, window: Date.now() };
    conn.send(JSON.stringify({ t: 'hello', id: ctx.id, protocol: C.PROTOCOL_VERSION, max: C.MAX_PLAYERS, distances: DISTANCES, urls: urls() }));
    return {
      message(raw) {
        // Cheap flood guard - a phone sends ~30 msgs/s at most.
        const now = Date.now();
        if (now - ctx.window > 1000) { ctx.window = now; ctx.msgs = 0; }
        if (++ctx.msgs > 300) return;
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        if (!m || typeof m.t !== 'string') return;
        handle(ctx, conn, m);
      },
      close() {
        if (ctx.room && ctx.player) {
          ctx.room.removePlayer(ctx.player.id);
          sendLobby(ctx.room);
          if (!fixedRoom && ctx.room.humans.filter(p => p.connected).length === 0 && ctx.room.code !== 'MAIN') rooms.delete(ctx.room.code);
        }
      },
    };
  }

  function handle(ctx, conn, m) {
    switch (m.t) {
      case 'join': {
        if (ctx.player) return;
        const room = getRoom(m.room);
        if (room.isFull) { conn.send(JSON.stringify({ t: 'error', msg: 'That race is full (12 max).' })); return; }
        const p = room.addPlayer(ctx.id, m.name, conn);
        if (!p) { conn.send(JSON.stringify({ t: 'error', msg: 'Could not join.' })); return; }
        ctx.room = room;
        ctx.player = p;
        conn.send(JSON.stringify({ t: 'joined', id: p.id, room: room.code, color: p.color, name: p.name }));
        sendLobby(room);
        if (room.state === STATE.RACING || room.state === STATE.COUNTDOWN) {
          // Late arrival: watch the current race from the leader's shoulder.
          conn.send(JSON.stringify({
            t: 'race', seed: room.seed, distance: room.distance, spectate: true,
            players: room.players.map(x => room.pubPlayer(x)),
          }));
        }
        break;
      }
      case 'name': {
        if (!ctx.player) return;
        ctx.player.name = sanitizeName(m.name);
        sendLobby(ctx.room);
        break;
      }
      case 'ready': {
        if (!ctx.player) return;
        ctx.player.ready = !!m.v;
        sendLobby(ctx.room);
        break;
      }
      case 'setup': {
        if (!ctx.room || ctx.room.hostId !== ctx.player?.id) return;
        if (ctx.room.state !== STATE.LOBBY) return;
        const s = ctx.room.settings;
        if (typeof m.distance === 'string' && DISTANCES[m.distance]) s.distance = m.distance;
        if (typeof m.items === 'boolean') s.items = m.items;
        if (typeof m.botSkill === 'number') s.botSkill = Math.max(0.2, Math.min(1, m.botSkill));
        if (typeof m.bots === 'number') ctx.room.setBots(m.bots);
        sendLobby(ctx.room);
        break;
      }
      case 'start': {
        const room = ctx.room;
        if (!room || room.hostId !== ctx.player?.id) return;
        if (room.state !== STATE.LOBBY) return;
        if (!room.canStart()) { conn.send(JSON.stringify({ t: 'error', msg: 'Everyone needs to tap Ready first.' })); return; }
        const info = room.startRace();
        broadcast(room, { t: 'race', ...info, countdown: C.COUNTDOWN, spectate: false });
        sendLobby(room);
        break;
      }
      case 'in': {
        const p = ctx.player;
        if (!p || p.isBot) return;
        if (typeof m.l === 'number') p.input.lane = m.l | 0;
        if (m.j) p.input.jump = true;
        if (m.s) p.input.slide = true;
        if (m.u) p.input.use = true;
        break;
      }
      case 'again': {
        const room = ctx.room;
        if (!room || room.hostId !== ctx.player?.id) return;
        if (room.state !== STATE.RESULTS) return;
        room.toLobby();
        sendLobby(room);
        break;
      }
      case 'ping':
        conn.send(JSON.stringify({ t: 'pong', c: m.c, now: Date.now() }));
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------- loop ----
  const DT = 1 / C.TICK_RATE;
  const SNAP_EVERY = Math.max(1, Math.round(C.TICK_RATE / C.SNAPSHOT_RATE));
  let acc = 0;

  // Advance every room by `seconds` of real time in fixed steps.
  function tick(seconds) {
    acc += Math.min(0.25, seconds);       // a stalled tab should not teleport anyone
    let steps = 0;
    while (acc >= DT && steps < 8) {
      acc -= DT;
      steps++;
      for (const room of rooms.values()) {
        if (room.state === STATE.LOBBY) continue;
        room.step(DT);
      }
    }
    if (!steps) return;
    for (const room of rooms.values()) {
      if (room.state === STATE.COUNTDOWN || room.state === STATE.RACING) {
        if (room.tick % SNAP_EVERY === 0) sendSnapshot(room);
        continue;
      }
      if (room.state === STATE.RESULTS) {
        if (!room.sentResults) {
          room.sentResults = true;
          broadcast(room, { t: 'results', rows: room.results(), time: room.raceTime });
        }
        if (room.resultsLeft <= 0) {
          room.sentResults = false;
          room.toLobby();
          sendLobby(room);
        }
      } else {
        room.sentResults = false;
      }
    }
  }

  // Drop rooms nobody has used for a while (LAN server).
  function sweep() {
    for (const [code, room] of rooms) {
      if (code === 'MAIN' || code === fixedRoom) continue;
      const live = room.players.some(p => !p.isBot && p.connected);
      if (!live && Date.now() - room.lastActivity > 5 * 60_000) rooms.delete(code);
    }
  }

  return { connect, tick, sweep, rooms, getRoom };
}
