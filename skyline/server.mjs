// Skyline Hustle - LAN server. Serves the game to every phone on the wifi
// and, for multiplayer, runs the one authoritative city: the simulation,
// the rivals and the auctions all live here. Phones send actions and get
// the city back.
//
//   node skyline/server.mjs [port]        (zero dependencies, Node 18+)
//
// Game speed is shared. Anyone can propose a new speed (pausing included);
// every other connected player has VOTE_SECONDS to agree, and one "no"
// cancels it. A player who proposes must then wait SPEED_COOLDOWN seconds
// before proposing again.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { attachWebSocket } from '../server/ws.js';
import { SPEEDS, SECONDS_PER_HOUR, SCENARIOS, DIFFICULTY, MAX_COMPANIES } from './js/data.js';
import { createGame, serialize, deserialize, news, continueGame } from './js/sim.js';
import { advanceGame } from './js/game.js';
import { auctionTick, maybeSettle } from './js/auction.js';
import { perform } from './js/actions.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] || process.env.PORT || 8090);
const SAVE_FILE = path.join(ROOT, 'saves', 'lan-game.json');
export const VOTE_SECONDS = 20;
export const SPEED_COOLDOWN = 60;
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
    return res.end(JSON.stringify({ lan: true, addresses: addresses(), started: !!game, canResume: fs.existsSync(SAVE_FILE) }));
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

// -------------------------------------------------------------- state ----
let game = null;                 // the sim state while a game runs
let seats = [];                  // [{ pid, token, name, company }]
let settings = { scenario: 'boomtown', difficulty: 'normal' };
let speed = 1;
let vote = null;                 // { id, from, speed, need: [pid], yes: [pid], expires }
let voteSeq = 0;
const cooldown = {};             // pid -> ms timestamp
const clients = new Set();       // { conn, token, name, company, pid, joined }
let hostToken = null;

const connectedPids = () => new Set([...clients].filter(c => c.pid >= 0).map(c => c.pid));
const nameOf = pid => game?.players[pid]?.company ?? 'Someone';
const isHost = c => c.token === hostToken;

function pickHost() {
  if ([...clients].some(c => c.token === hostToken)) return;
  const first = [...clients].sort((a, b) => a.joined - b.joined)[0];
  hostToken = first ? first.token : null;
}

function send(c, msg) { c.conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(msg) {
  const str = JSON.stringify(msg);
  for (const c of clients) c.conn.send(str);
}
function notice(text, kind = '') { broadcast({ t: 'notice', text, kind }); }

function lobbyMsg() {
  const list = [...clients].sort((a, b) => a.joined - b.joined).map(c => ({ name: c.name, company: c.company, host: isHost(c), token: c.token.slice(0, 6) }));
  return { t: 'lobby', players: list, settings, canResume: fs.existsSync(SAVE_FILE), max: MAX_COMPANIES };
}
function sendLobby() {
  const msg = lobbyMsg();
  for (const c of clients) send(c, { ...msg, host: isHost(c), you: c.token.slice(0, 6) });
}

// The city as clients see it: no citizens list (too big; fetched on demand),
// no secret rival auction limits, plus the trips currently on the streets.
let stateDirty = false;
function stateMsg() {
  const json = JSON.stringify(game, (k, v) => (k === 'cz' || k === 'bidders' ? undefined : v));
  const T = game.day * 24 + game.hour + game.t;
  const trips = game.cz.trips.filter(t => t.t0 + 2 * t.walk + t.stay > T - 0.1 && t.t0 < T + 1.7);
  const now = Date.now();
  const cd = {};
  for (const pid in cooldown) if (cooldown[pid] > now) cd[pid] = Math.ceil((cooldown[pid] - now) / 1000);
  const seatInfo = seats.map(st => ({ pid: st.pid, name: st.name, company: st.company, connected: connectedPids().has(st.pid) }));
  return `{"t":"state","s":${json},"trips":${JSON.stringify(trips)},"speed":${speed},"vote":${JSON.stringify(vote ? { ...vote, left: Math.ceil((vote.expires - now) / 1000) } : null)},"cooldowns":${JSON.stringify(cd)},"seats":${JSON.stringify(seatInfo)},"host":"${(hostToken || '').slice(0, 6)}"}`;
}
function sendState() {
  if (!game) return;
  const str = stateMsg();
  for (const c of clients) c.conn.send(str);
  stateDirty = false;
}
function you(c) { send(c, { t: 'you', pid: c.pid, host: isHost(c), seats: seats.map(st => ({ pid: st.pid, company: st.company, taken: connectedPids().has(st.pid) })) }); }

// -------------------------------------------------------------- saves ----
function save() {
  if (!game || game.over) return;
  try {
    fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
    fs.writeFileSync(SAVE_FILE, JSON.stringify({ seats, settings, game: serialize(game) }));
  } catch (e) { console.warn('could not save:', e.message); }
}

function startGame(fromSave) {
  if (fromSave) {
    const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    game = deserialize(data.game);
    seats = data.seats;
    settings = data.settings;
  } else {
    const people = [...clients].sort((a, b) => a.joined - b.joined).slice(0, MAX_COMPANIES);
    game = createGame({ scenario: settings.scenario, difficulty: settings.difficulty, humans: people.map(c => ({ name: c.name, company: c.company })) });
    seats = people.map((c, i) => ({ pid: i, token: c.token, name: c.name, company: c.company }));
  }
  game.liveAuctions = true;
  speed = 1; vote = null;
  for (const k in cooldown) delete cooldown[k];
  for (const c of clients) {
    const seat = seats.find(st => st.token === c.token);
    c.pid = seat ? seat.pid : -1;
    you(c);
  }
  console.log(`game started: ${SCENARIOS[settings.scenario].name}, ${seats.length} player(s)`);
  sendState();
}

function endGame() {
  save();
  game = null; seats = []; vote = null;
  for (const c of clients) c.pid = -1;
  sendLobby();
}

// -------------------------------------------------------------- speed ----
function applySpeed(sp, why) {
  speed = sp;
  vote = null;
  notice(why, 'good');
  stateDirty = true;
}
function requestSpeed(c, sp) {
  if (!game || c.pid < 0 || !Number.isInteger(sp) || sp < 0 || sp >= SPEEDS.length) return;
  const label = ['pause', '1×', '2.5×', '6×'][sp];
  if (sp === speed) return send(c, { t: 'notice', text: 'The game is already at that speed.' });
  const others = [...connectedPids()].filter(pid => pid !== c.pid);
  if (!others.length) return applySpeed(sp, `${nameOf(c.pid)} set the speed to ${label}.`);
  if (vote) return send(c, { t: 'notice', text: 'A speed vote is already running.', kind: 'bad' });
  const wait = Math.ceil(((cooldown[c.pid] || 0) - Date.now()) / 1000);
  if (wait > 0) return send(c, { t: 'notice', text: `You can propose again in ${wait}s.`, kind: 'bad' });
  cooldown[c.pid] = Date.now() + SPEED_COOLDOWN * 1000;
  vote = { id: ++voteSeq, from: c.pid, speed: sp, need: others, yes: [], expires: Date.now() + VOTE_SECONDS * 1000 };
  notice(`${nameOf(c.pid)} proposes ${sp ? 'speed ' + label : 'a pause'}. Everyone else must agree.`, 'event');
  stateDirty = true;
}
function castVote(c, id, yes) {
  if (!vote || vote.id !== id || !vote.need.includes(c.pid) || vote.yes.includes(c.pid)) return;
  if (!yes) {
    notice(`${nameOf(c.pid)} said no to ${vote.speed ? 'the speed change' : 'pausing'}.`, 'bad');
    vote = null;
    stateDirty = true;
    return;
  }
  vote.yes.push(c.pid);
  checkVote();
  stateDirty = true;
}
function checkVote() {
  if (!vote) return;
  const live = connectedPids();
  vote.need = vote.need.filter(pid => live.has(pid));
  if (vote.need.every(pid => vote.yes.includes(pid))) {
    const label = ['paused', '1×', '2.5×', '6×'][vote.speed];
    applySpeed(vote.speed, vote.speed ? `Everyone agreed: speed ${label}.` : 'Everyone agreed: game paused.');
  } else if (Date.now() > vote.expires) {
    notice('Not everyone answered in time: the speed stays as it is.', 'bad');
    vote = null;
    stateDirty = true;
  }
}

// ------------------------------------------------------------ sockets ----
attachWebSocket(server, conn => {
  const c = { conn, token: '', name: 'Player', company: 'Company', pid: -1, joined: Date.now() };
  conn.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello': {
        c.token = String(m.token || Math.random()).slice(0, 40);
        c.name = String(m.name || 'Player').slice(0, 20);
        c.company = String(m.company || 'Company').slice(0, 22);
        // A reconnecting phone kicks out its own stale connection.
        for (const o of clients) if (o.token === c.token && o !== c) { clients.delete(o); o.conn.destroy?.(); }
        clients.add(c);
        pickHost();
        if (game) {
          const seat = seats.find(st => st.token === c.token);
          c.pid = seat ? seat.pid : -1;
          you(c);
          send(c, stateMsg());
          if (seat) notice(`${seat.company} is back.`);
        } else sendLobby();
        break;
      }
      case 'profile':
        if (game) break;
        c.name = String(m.name || c.name).slice(0, 20);
        c.company = String(m.company || c.company).slice(0, 22);
        sendLobby();
        break;
      case 'setup':
        if (game || !isHost(c)) break;
        if (SCENARIOS[m.scenario]) settings.scenario = m.scenario;
        if (DIFFICULTY[m.difficulty]) settings.difficulty = m.difficulty;
        sendLobby();
        break;
      case 'start':
        if (game || !isHost(c)) break;
        try { startGame(!!m.resume); } catch (e) { send(c, { t: 'notice', text: 'Could not load the saved game.', kind: 'bad' }); }
        break;
      case 'claim': {
        // Late joiner takes an empty seat.
        if (!game || c.pid >= 0) break;
        const seat = seats.find(st => st.pid === m.pid);
        if (!seat || connectedPids().has(seat.pid)) break;
        seat.token = c.token;
        c.pid = seat.pid;
        you(c);
        notice(`${c.name} took over ${seat.company}.`);
        stateDirty = true;
        break;
      }
      case 'act': {
        if (!game || c.pid < 0) break;
        const res = perform(game, c.pid, String(m.name), m.args);
        if (game.auction) maybeSettle(game, connectedPids());
        send(c, { t: 'result', id: m.id, res });
        stateDirty = true;
        break;
      }
      case 'speed': requestSpeed(c, m.speed); break;
      case 'vote': castVote(c, m.id, !!m.yes); break;
      case 'citizen': {
        if (!game) break;
        const ct = game.cz.list.find(x => x.id === m.id);
        send(c, { t: 'citizen', c: ct || null, id: m.id });
        break;
      }
      case 'end':
        if (game && isHost(c)) { notice('The host ended the game.'); endGame(); }
        break;
      case 'continue':
        // The host chooses to carry on after a win or loss.
        if (game && game.over && isHost(c)) {
          continueGame(game);
          game.overSaved = false;
          notice('The host kept the game going: free play, no more deadlines.', 'good');
          stateDirty = true;
        }
        break;
    }
  });
  conn.on('close', () => {
    clients.delete(c);
    pickHost();
    if (game) {
      if (c.pid >= 0) notice(`${nameOf(c.pid)} disconnected. Their company keeps trading.`);
      checkVote();
      stateDirty = true;
    } else sendLobby();
  });
});

// --------------------------------------------------------------- loop ----
let last = Date.now(), lastAuctionSend = 0, lastClock = 0;
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  if (!game) return;
  checkVote();
  const live = connectedPids();
  if (!game.over && live.size) {
    if (game.auction) {
      const before = game.auction;
      auctionTick(game, dt);
      maybeSettle(game, live);
      if (game.auction !== before || now - lastAuctionSend > 120) { stateDirty = true; lastAuctionSend = now; }
    } else if (speed > 0) {
      const day = game.day;
      const steps = advanceGame(game, dt * SPEEDS[speed] / SECONDS_PER_HOUR);
      if (steps) stateDirty = true;
      if (game.day !== day) save();
      if (game.auction) stateDirty = true;
    }
  }
  if (game.over && !game.overSaved) { game.overSaved = true; try { fs.unlinkSync(SAVE_FILE); } catch {} stateDirty = true; }
  // Light clock sync so phones stay in step between hours.
  if (now - lastClock > 1000) { lastClock = now; if (!stateDirty) broadcast({ t: 'clock', day: game.day, hour: game.hour, tt: game.t, speed, vote: vote ? { ...vote, left: Math.ceil((vote.expires - now) / 1000) } : null }); }
  if (stateDirty) sendState();
}, 50);

server.listen(PORT, () => {
  console.log('==================================================');
  console.log('  SKYLINE HUSTLE  -  LAN server is up');
  console.log('==================================================');
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const a of addresses()) console.log(`  On phones (same wifi):  ${a}`);
  console.log('  Single-player works too; tap "LAN multiplayer" to play together.');
});
