// Leftover Uprising - the host. Runs on the host's phone (or the practice
// page): the lobby, AI cooks, the game, and a snapshot to every phone ten
// times a second. Phones only send requests ("build here", "upgrade that");
// the host decides. Transport-free: a connection is anything with
// send(text) and an `open` flag.
//
//   const srv = createServer({ code });
//   const h = srv.connect(conn);  h.message(text);  h.close();
//   setInterval(() => srv.tick(seconds), 1000 / 30);

import { TICK, SNAP_RATE, MAX_PLAYERS, COLORS, DIFFICULTY } from './data.js';
import { createGame } from './game.js';
import { createCook } from './ai.js';

const COOK_NAMES = ['Basil', 'Ginger', 'Pepper', 'Saffron', 'Clove', 'Nutmeg', 'Sage', 'Paprika'];
const r2 = v => Math.round(v * 100) / 100;

export function createServer({ code = 'SOLO' } = {}) {
  const seats = [];                // { id, name, color, ai }
  const conns = new Map();         // seat id -> conn
  let hostId = null, state = 'lobby', seq = 0, game = null, cooks = [], acc = 0, tickN = 0;
  let sentTowers = 0, sentPlayers = 0, playersT = 0;
  const settings = { diff: 'normal', cooks: 0 };
  const newId = () => 'p' + (++seq);

  const humans = () => seats.filter(s => !s.ai);
  const send = (conn, msg) => { if (conn.open) conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
  const broadcast = msg => { const s = JSON.stringify(msg); for (const c of conns.values()) send(c, s); };
  const freeColor = () => COLORS.find(c => !seats.some(s => s.color === c)) || COLORS[seats.length % COLORS.length];

  function lobbyMsg() {
    return { t: 'lobby', code, state, host: hostId, settings, max: MAX_PLAYERS,
      seats: seats.map(s => ({ id: s.id, name: s.name, color: s.color, ai: s.ai })) };
  }
  const sendLobby = () => broadcast(lobbyMsg());

  function setCooks(n) {
    n = Math.max(0, Math.min(MAX_PLAYERS - humans().length, n | 0));
    settings.cooks = n;
    while (seats.filter(s => s.ai).length > n) seats.splice(seats.findLastIndex(s => s.ai), 1);
    while (seats.filter(s => s.ai).length < n) {
      const name = COOK_NAMES.find(nm => !seats.some(s => s.name === nm)) || 'Cook';
      seats.push({ id: newId(), name, color: freeColor(), ai: true });
    }
  }

  function startGame() {
    state = 'playing';
    game = createGame({ players: seats, diff: settings.diff });
    cooks = seats.filter(s => s.ai).map((s, i) => createCook(game, s.id, { seed: i / Math.max(1, seats.length) }));
    sentTowers = 0; sentPlayers = 0;
    broadcast({ t: 'start', diff: settings.diff, n: seats.length });
    sendLobby();
    sendFull();
  }

  // ------------------------------------------------------- snapshots ----
  function towersMsg() {
    return { t: 'towers', v: game.towersVer,
      list: [...game.towers.values()].map(t => [t.id, t.x, t.y, t.kind, t.owner, t.mode, Math.round(t.dmg), r2(t.buff || 0), t.spent]) };
  }
  function playersMsg() {
    return { t: 'players', list: [...game.players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, ai: p.ai, gold: Math.floor(p.gold), sp: p.sp, ready: p.ready, fast: !!p.fast,
      m: p.mastery, st: { dmg: Math.round(p.stats.dmg), kills: p.stats.kills, combos: p.stats.combos },
    })) };
  }
  function snapMsg() {
    return { t: 'snap', w: game.wave, ph: game.phase, bt: Math.max(0, Math.ceil(game.buildT)), lv: game.lives, ml: game.maxLives,
      fams: game.fams, endless: game.endless, spd: game.speed,
      en: game.enemies.map(e => {
        const fl = (e.burnT > 0 ? 1 : 0) | (e.slowT > 0 ? 2 : 0) | (e.freezeT > 0 ? 4 : 0) | (e.stickyT > 0 ? 8 : 0) | (e.stunT > 0 ? 16 : 0);
        return [e.id, e.type, e.path, r2(e.d), Math.max(1, Math.round(100 * e.hp / e.maxHp)), fl, r2(e.lat)];
      }),
      ev: game.events };
  }
  function sendFull(conn) {
    if (!game) return;
    const msgs = [towersMsg(), playersMsg(), { ...snapMsg(), ev: [] }];
    for (const m of msgs) conn ? send(conn, m) : broadcast(m);
  }
  function sendSnapshot() {
    if (game.towersVer !== sentTowers) { broadcast(towersMsg()); sentTowers = game.towersVer; }
    playersT++;
    if (game.playersVer !== sentPlayers && (playersT >= 3 || game.phase === 'build')) { broadcast(playersMsg()); sentPlayers = game.playersVer; playersT = 0; }
    broadcast(snapMsg());
    game.events.length = 0;
  }

  // -------------------------------------------------------- messages ----
  function connect(conn) {
    let me = null;
    return {
      message(raw) {
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        if (!m || typeof m.t !== 'string') return;
        switch (m.t) {
          case 'join': {
            if (me) return;
            if (seats.length >= MAX_PLAYERS) {
              if (!seats.some(s => s.ai) || state === 'playing') { send(conn, { t: 'error', msg: 'This kitchen is full (8 cooks max).' }); return; }
              setCooks(settings.cooks - 1);
            }
            me = { id: newId(), name: String(m.name || 'Cook').replace(/[^\w .'-]/g, '').slice(0, 14) || 'Cook', color: freeColor(), ai: false };
            seats.push(me);
            conns.set(me.id, conn);
            if (!hostId) hostId = me.id;
            send(conn, { t: 'joined', id: me.id, code, color: me.color });
            if (state === 'playing') { game.addPlayer(me); send(conn, { t: 'start', diff: settings.diff, n: seats.length }); sendFull(conn); }
            sendLobby();
            break;
          }
          case 'setup': {
            if (!me || me.id !== hostId || state !== 'lobby') return;
            if (typeof m.cooks === 'number') setCooks(m.cooks);
            if (DIFFICULTY[m.diff]) settings.diff = m.diff;
            sendLobby();
            break;
          }
          case 'start':
            if (me && me.id === hostId && state === 'lobby') startGame();
            break;
          case 'endless':
            if (me && me.id === hostId && game?.phase === 'won') game.continueEndless();
            break;
          case 'again':
            if (me && me.id === hostId && (game?.phase === 'won' || game?.phase === 'lost')) { state = 'lobby'; game = null; sendLobby(); }
            break;
          case 'go':          // host: start the next wave now
            if (me && me.id === hostId && game) game.startNow();
            break;
          case 'build': case 'up': case 'sell': case 'mode': case 'gift': case 'ready': case 'skill': case 'fast': {
            if (!me || !game) return;
            const err = game.act(me.id, m);
            if (err) send(conn, { t: 'nope', msg: err });
            else if (m.t !== 'ready' && m.t !== 'mode' && m.t !== 'fast') { broadcast(towersMsg()); sentTowers = game.towersVer; broadcast(playersMsg()); sentPlayers = game.playersVer; }
            break;
          }
          case 'ping':
            send(conn, { t: 'pong', c: m.c, now: Date.now() });
            break;
        }
      },
      close() {
        if (!me) return;
        conns.delete(me.id);
        seats.splice(seats.indexOf(me), 1);
        if (game) game.removePlayer(me.id);
        if (hostId === me.id) hostId = humans()[0]?.id || null;
        sendLobby();
        me = null;
      },
    };
  }

  // -------------------------------------------------------------- loop ----
  const DT = 1 / TICK, SNAP_EVERY = Math.round(TICK / SNAP_RATE);
  function tick(seconds) {
    acc += Math.min(0.25, seconds);
    let steps = 0;
    while (acc >= DT && steps < 8) {
      acc -= DT; steps++;
      if (state !== 'playing' || !game) continue;
      for (let k = 0; k < game.speed; k++) { for (const c of cooks) c.step(DT); game.step(DT); }
      tickN++;
      if (tickN % SNAP_EVERY === 0) sendSnapshot();
    }
  }

  return { connect, tick, get state() { return state; }, get game() { return game; }, settings, seats };
}
