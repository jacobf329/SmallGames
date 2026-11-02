// Skyline Hustle - a multiplayer room: the lobby, the one authoritative city,
// shared speed (slowest wish wins, instant pause, reviews), actions and
// saves. Transport-free: the LAN server (server.mjs) plugs WebSockets into
// it, and in online games the host's own phone runs it and plugs in WebRTC
// data channels. A connection is anything with send(string) and close().
//
//   const room = createRoom({ store, log });
//   const h = room.connect(conn);  h.message(text);  h.close();
//   setInterval(room.tick, 50);

import { SPEEDS, SECONDS_PER_HOUR, SCENARIOS, DIFFICULTY, MAX_COMPANIES, MAPS } from './data.js';
import { createGame, serialize, deserialize, news, continueGame } from './sim.js';
import { advanceGame } from './game.js';
import { auctionTick, maybeSettle } from './auction.js';
import { perform } from './actions.js';

export const PAUSE_SECONDS = 60;

// store: { load() -> string, save(string), exists() -> bool, remove() }
export function createRoom({ store, log = () => {} }) {
// -------------------------------------------------------------- state ----
let game = null;                 // the sim state while a game runs
let seats = [];                  // [{ pid, token, name, company }]
let settings = { scenario: 'boomtown', difficulty: 'normal', map: 'town', checkpoint: 'weekly' };
let speed = 1;                   // effective speed, worked out by flow()
const wants = {};                // pid -> wanted speed 1..3
let pause = null;                // { by: pid, until: ms }
let check = null;                // { day, need: [pid], ready: [pid] } end-of-week check-in
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
  const list = [...clients].sort((a, b) => a.joined - b.joined).map(c => ({ name: c.name, company: c.company, avatar: c.avatar || 0, host: isHost(c), token: c.token.slice(0, 6) }));
  return { t: 'lobby', players: list, settings, canResume: store.exists(), max: Math.min(MAX_COMPANIES, MAPS[settings.map || 'town'].companies) };
}
function sendLobby() {
  const msg = lobbyMsg();
  for (const c of clients) send(c, { ...msg, host: isHost(c), you: c.token.slice(0, 6) });
}

// The city as clients see it: no citizens list (too big; fetched on demand),
// no secret rival auction limits, plus the trips currently on the streets.
let stateDirty = false;
function stateMsg() {
  // Daily histories ('days') are large: phones fetch them on demand ('hist').
  const json = JSON.stringify(game, (k, v) => (k === 'cz' || k === 'bidders' || k === 'days' ? undefined : v));
  const T = game.day * 24 + game.hour + game.t;
  const trips = game.cz.trips.filter(t => t.t0 + 2 * t.walk + t.stay > T - 0.1 && t.t0 < T + 1.7);
  const seatInfo = seats.map(st => ({ pid: st.pid, name: st.name, company: st.company, connected: connectedPids().has(st.pid) }));
  return `{"t":"state","s":${json},"trips":${JSON.stringify(trips)},"speed":${speed},"flow":${JSON.stringify(flowInfo())},"seats":${JSON.stringify(seatInfo)},"host":"${(hostToken || '').slice(0, 6)}"}`;
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
    store.save(JSON.stringify({ seats, settings, game: serialize(game) }));
  } catch (e) { log('could not save: ' + e.message); }
}

function startGame(fromSave) {
  if (fromSave) {
    const data = JSON.parse(store.load());
    game = deserialize(data.game);
    seats = data.seats;
    settings = data.settings;
  } else {
    const people = [...clients].sort((a, b) => a.joined - b.joined).slice(0, MAX_COMPANIES);
    game = createGame({ scenario: settings.scenario, difficulty: settings.difficulty, map: settings.map || 'town', humans: people.map(c => ({ name: c.name, company: c.company, avatar: c.avatar || 0 })) });
    seats = people.map((c, i) => ({ pid: i, token: c.token, name: c.name, company: c.company }));
  }
  game.liveAuctions = true;
  pause = null; check = null;
  for (const k in wants) delete wants[k];
  flow();
  for (const c of clients) {
    const seat = seats.find(st => st.token === c.token);
    c.pid = seat ? seat.pid : -1;
    you(c);
  }
  log(`game started: ${SCENARIOS[settings.scenario].name} on ${MAPS[settings.map || 'town'].name}, ${seats.length} player(s)`);
  sendState();
}

function endGame() {
  save();
  game = null; seats = []; pause = null; check = null;
  for (const c of clients) c.pid = -1;
  sendLobby();
}

// -------------------------------------------------------------- speed ----
// Works out the speed: paused or checking in -> 0, else the slowest wish.
function flow() {
  const live = [...connectedPids()];
  if (pause && Date.now() > pause.until) { notice(`${nameOf(pause.by)}'s pause ran out: back to it.`); pause = null; }
  if (pause && !live.includes(pause.by)) pause = null;
  if (check) {
    check.need = check.need.filter(pid => live.includes(pid));
    if (check.need.every(pid => check.ready.includes(pid))) { check = null; notice('Everyone is ready. On with the week!', 'good'); }
  }
  const sp = pause || check ? 0 : live.length ? Math.min(...live.map(pid => wants[pid] || 1)) : 1;
  if (sp !== speed) { speed = sp; stateDirty = true; }
}
function flowInfo() {
  return {
    wants: Object.fromEntries([...connectedPids()].map(pid => [pid, wants[pid] || 1])),
    pause: pause ? { by: pause.by, left: Math.max(0, Math.ceil((pause.until - Date.now()) / 1000)) } : null,
    check: check ? { day: check.day, need: check.need, ready: check.ready } : null,
  };
}
function setWant(c, sp) {
  if (!game || c.pid < 0 || !Number.isInteger(sp) || sp < 1 || sp >= SPEEDS.length) return;
  wants[c.pid] = sp;
  flow(); stateDirty = true;
}
function togglePause(c) {
  if (!game || c.pid < 0) return;
  if (pause && pause.by === c.pid) { pause = null; notice(`${nameOf(c.pid)} unpaused.`); }
  else { pause = { by: c.pid, until: Date.now() + PAUSE_SECONDS * 1000 }; notice(`${nameOf(c.pid)} paused the game.`, 'event'); }
  flow(); stateDirty = true;
}
function setReady(c) {
  if (!check || c.pid < 0 || check.ready.includes(c.pid)) return;
  check.ready.push(c.pid);
  flow(); stateDirty = true;
}
// End of the week (or day): stop for a summary until everyone is ready.
function maybeCheckIn(prevDay) {
  const mode = settings.checkpoint || 'weekly';
  if (!game || game.over || mode === 'off' || game.day === prevDay) return;
  if (mode === 'weekly' && (game.day - 1) % 7 !== 0) return;
  const need = [...connectedPids()];
  if (need.length < 2) return;           // nobody to wait for
  check = { day: game.day, need, ready: [] };
  flow(); stateDirty = true;
}

// ------------------------------------------------------------ sockets ----
function connect(conn) {
  const c = { conn, token: '', name: 'Player', company: 'Company', pid: -1, joined: Date.now() };
  const onMessage = raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello': {
        c.token = String(m.token || Math.random()).slice(0, 40);
        c.name = String(m.name || 'Player').slice(0, 20);
        c.company = String(m.company || 'Company').slice(0, 22);
        c.avatar = Math.max(0, Math.min(7, Math.floor(+m.avatar || 0)));
        // A reconnecting phone kicks out its own stale connection.
        for (const o of clients) if (o.token === c.token && o !== c) { clients.delete(o); o.conn.close?.(); }
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
        if (m.avatar != null) c.avatar = Math.max(0, Math.min(7, Math.floor(+m.avatar || 0)));
        sendLobby();
        break;
      case 'setup':
        if (game || !isHost(c)) break;
        if (SCENARIOS[m.scenario]) settings.scenario = m.scenario;
        if (DIFFICULTY[m.difficulty]) settings.difficulty = m.difficulty;
        if (MAPS[m.map]) settings.map = m.map;
        if (['off', 'weekly', 'daily'].includes(m.checkpoint)) settings.checkpoint = m.checkpoint;
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
      case 'want': setWant(c, m.speed); break;
      case 'pause': togglePause(c); break;
      case 'ready': setReady(c); break;
      case 'hist': {
        // Books history for one of your businesses (lot >= 0) or your company (-1).
        if (!game || c.pid < 0) break;
        const lot = game.lots[m.lot];
        const days = m.lot === -1 ? game.players[c.pid].days : lot && lot.business && lot.business.owner === c.pid ? lot.business.days : null;
        send(c, { t: 'hist', lot: m.lot, days: days || [] });
        break;
      }
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
  };
  const onClose = () => {
    clients.delete(c);
    pickHost();
    if (game) {
      if (c.pid >= 0) notice(`${nameOf(c.pid)} disconnected. Their company keeps trading.`);
      flow();
      stateDirty = true;
    } else sendLobby();
  };
  return { message: onMessage, close: onClose };
}


// --------------------------------------------------------------- loop ----
let last = Date.now(), lastAuctionSend = 0, lastClock = 0;
function tick() {
  const now = Date.now();
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  if (!game) return;
  flow();
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
      if (game.day !== day) { save(); maybeCheckIn(day); }
      if (game.auction) stateDirty = true;
    }
  }
  if (game.over && !game.overSaved) { game.overSaved = true; store.remove(); stateDirty = true; }
  // Light clock sync so phones stay in step between hours.
  if (now - lastClock > 1000) { lastClock = now; if (!stateDirty) broadcast({ t: 'clock', day: game.day, hour: game.hour, tt: game.t, speed, flow: flowInfo() }); }
  if (stateDirty) sendState();
}


return {
  connect,
  tick,
  info: () => ({ started: !!game, canResume: store.exists(), players: clients.size }),
  hasGame: () => !!game,
};
}
