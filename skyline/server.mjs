// Skyline Hustle - LAN server. Serves the game to every phone on the wifi
// and, for multiplayer, runs the one authoritative city: the simulation,
// the rivals and the auctions all live here. Phones send actions and get
// the city back.
//
//   node skyline/server.mjs [port]        (zero dependencies, Node 18+)
//
// Game speed is shared without any voting. Every player picks the speed
// they'd like and the city runs at the slowest choice. Anyone can pause at
// once; the game resumes when they unpause, or by itself after PAUSE_SECONDS.
// Optionally (lobby setting) the clock stops at the end of every week or day
// for a short summary, and carries on when everyone taps Ready.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { attachWebSocket } from '../server/ws.js';
import { createRoom } from './js/room.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] || process.env.PORT || 8090);
const SAVE_FILE = path.join(ROOT, 'saves', 'lan-game.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

// ------------------------------------------------------------- static ----
function addresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || [])
    if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/lan') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ lan: true, addresses: addresses(), ...room.info() }));
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}saves${path.sep}`)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// The room: lobby, game, speed and saves (shared with online play).
const room = createRoom({
  store: {
    load: () => fs.readFileSync(SAVE_FILE, 'utf8'),
    save: data => { fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true }); fs.writeFileSync(SAVE_FILE, data); },
    exists: () => fs.existsSync(SAVE_FILE),
    remove: () => { try { fs.unlinkSync(SAVE_FILE); } catch {} },
  },
  log: msg => console.log(msg),
});

// ------------------------------------------------------------ sockets ----
attachWebSocket(server, conn => {
  const h = room.connect({ send: str => conn.send(str), close: () => conn.destroy?.() });
  conn.on('message', raw => h.message(raw));
  conn.on('close', () => h.close());
});
setInterval(room.tick, 50);

server.listen(PORT, () => {
  console.log('==================================================');
  console.log('  SKYLINE HUSTLE  -  LAN server is up');
  console.log('==================================================');
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const a of addresses()) console.log(`  On phones (same wifi):  ${a}`);
  console.log('  Single-player works too; tap "LAN multiplayer" to play together.');
});
