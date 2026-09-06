// Turbo Surfers - LAN server. Serves the mobile client over HTTP and runs the
// authoritative race simulation over a hand-rolled WebSocket.
//
//   node server/index.js [--port 8080]
//
// Then everyone on the same wifi opens the URL printed below on their phone.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { attachWebSocket } from './ws.js';
import { Room, STATE, DISTANCES, sanitizeName } from '../shared/room.js';
import * as C from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CLIENT = path.join(ROOT, 'client');
const SHARED = path.join(ROOT, 'shared');

const argPort = (() => {
  const i = process.argv.indexOf('--port');
  return i > -1 ? parseInt(process.argv[i + 1], 10) : null;
})();
const PORT = argPort || parseInt(process.env.PORT || '', 10) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

// ---------------------------------------------------------------- http ----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/rooms') {
    return json(res, {
      rooms: [...rooms.values()].map(r => ({
        code: r.code, players: r.players.length, humans: r.humans.length, state: r.state, max: C.MAX_PLAYERS
      }))
    });
  }
  if (pathname === '/api/health') return json(res, { ok: true, rooms: rooms.size, uptime: process.uptime() });

  if (pathname === '/') pathname = '/index.html';
  const base = pathname.startsWith('/shared/') ? ROOT : CLIENT;
  const file = path.normalize(path.join(base, pathname.startsWith('/shared/') ? pathname : pathname));
  if (!file.startsWith(CLIENT) && !file.startsWith(SHARED)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(data);
  });
});

const json = (res, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
};

// --------------------------------------------------------------- rooms ----
const rooms = new Map();

function getRoom(code) {
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

// ------------------------------------------------------------ websocket ----
attachWebSocket(server, (conn) => {
  const ctx = { id: crypto.randomBytes(6).toString('hex'), room: null, player: null, msgs: 0, window: Date.now() };

  conn.send(JSON.stringify({ t: 'hello', id: ctx.id, protocol: C.PROTOCOL_VERSION, max: C.MAX_PLAYERS, distances: DISTANCES, urls: joinUrls() }));

  conn.on('message', (raw) => {
    // Cheap flood guard - a phone sends ~30 msgs/s at most.
    const now = Date.now();
    if (now - ctx.window > 1000) { ctx.window = now; ctx.msgs = 0; }
    if (++ctx.msgs > 300) return;

    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    handle(ctx, conn, m);
  });

  conn.on('close', () => {
    if (ctx.room && ctx.player) {
      ctx.room.removePlayer(ctx.player.id);
      sendLobby(ctx.room);
      if (ctx.room.humans.filter(p => p.connected).length === 0 && ctx.room.code !== 'MAIN') {
        rooms.delete(ctx.room.code);
      }
    }
  });
});

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
          players: room.players.map(x => room.pubPlayer(x))
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

// ---------------------------------------------------------------- loop ----
const DT = 1 / C.TICK_RATE;
const SNAP_EVERY = Math.max(1, Math.round(C.TICK_RATE / C.SNAPSHOT_RATE));
let acc = 0;
let last = process.hrtime.bigint();

setInterval(() => {
  const now = process.hrtime.bigint();
  let dt = Number(now - last) / 1e9;
  last = now;
  if (dt > 0.25) dt = 0.25;             // a stalled process should not teleport anyone
  acc += dt;

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
}, 1000 / C.TICK_RATE);

// Sweep out rooms nobody is using.
setInterval(() => {
  for (const [code, room] of rooms) {
    if (code === 'MAIN') continue;
    const live = room.players.some(p => !p.isBot && p.connected);
    if (!live && Date.now() - room.lastActivity > 5 * 60_000) rooms.delete(code);
  }
}, 60_000);

// ---------------------------------------------------------------- boot ----
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

function joinUrls() {
  return lanAddresses().map(n => `${n.address}:${PORT}`);
}

server.listen(PORT, '0.0.0.0', () => {
  const nets = lanAddresses();
  const line = '='.repeat(52);
  console.log('\n' + line);
  console.log('  TURBO SURFERS  -  LAN race server is up');
  console.log(line);
  console.log(`  Players (max ${C.MAX_PLAYERS}) open one of these on their phone:\n`);
  if (nets.length === 0) console.log(`    http://localhost:${PORT}   (no LAN interface found)`);
  for (const n of nets) console.log(`    http://${n.address}:${PORT}      [${n.name}]`);
  console.log(`\n  Host screen / same machine:  http://localhost:${PORT}`);
  console.log(`${line}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { console.log('\nShutting down.'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500); });
}
