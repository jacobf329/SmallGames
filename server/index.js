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
import { createRaceServer } from '../shared/session.js';
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

// ------------------------------------------------------------- races ----
// Rooms, messages and the race loop live in shared/session.js (the online
// host's phone runs the same code).
const races = createRaceServer({ urls: () => joinUrls(), newId: () => crypto.randomBytes(6).toString('hex') });
const rooms = races.rooms;

attachWebSocket(server, (conn) => {
  const h = races.connect(conn);
  conn.on('message', (raw) => h.message(raw));
  conn.on('close', () => h.close());
});

let last = process.hrtime.bigint();
setInterval(() => {
  const now = process.hrtime.bigint();
  races.tick(Number(now - last) / 1e9);
  last = now;
}, 1000 / C.TICK_RATE);
setInterval(() => races.sweep(), 60_000);

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
