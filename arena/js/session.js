// Blockout Arena - the match host. Runs on the host's phone (or any page that
// hosts): the lobby, spawns, every shot, damage, kills, respawns and the
// score, then sends each phone a snapshot 20 times a second. Phones send
// inputs; nothing a phone says about hits counts. Transport-free: a
// connection is anything with send(text) and an `open` flag.
//
//   const srv = createArenaServer({ code });
//   const h = srv.connect(conn);  h.message(text);  h.close();
//   setInterval(() => srv.tick(seconds), 1000 / 60);

import {
  TICK, SNAP_RATE, MAX_PLAYERS, COLORS, MAX_HP, RESPAWN, SPAWN_SHIELD, REGEN_DELAY, REGEN_RATE,
  FIRE_RATE, DAMAGE, HEAD_MULT, MAG, RELOAD,
} from './consts.js';
import { SPAWNS } from './map.js';
import { createPlayer, placeAt, stepPlayer, traceShot } from './sim.js';
import { thinkBot } from './bots.js';

const BOT_NAMES = ['Rivet', 'Static', 'Gizmo', 'Tango', 'Pixel', 'Nova', 'Bolt', 'Echo', 'Fuse'];
const r1 = v => Math.round(v * 100) / 100;

export function createArenaServer({ code = 'SOLO' } = {}) {
  const players = [];              // humans and bots
  const conns = new Map();         // player id -> conn
  let hostId = null, state = 'lobby', seq = 0, ev = [], scoreVer = 0, sentScore = -1;
  const settings = { bots: 3, score: 20, minutes: 6, skill: 0.6 };
  let timeLeft = 0, resultsT = 0, acc = 0, tickN = 0, winner = null;
  const newId = () => 'p' + (++seq);

  const humans = () => players.filter(p => !p.bot);
  const send = (conn, msg) => { if (conn.open) conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
  const broadcast = msg => { const s = JSON.stringify(msg); for (const c of conns.values()) send(c, s); };
  const usedColors = () => new Set(players.map(p => p.color));
  const freeColor = () => COLORS.find(c => !usedColors().has(c)) || COLORS[players.length % COLORS.length];

  function lobbyMsg() {
    return { t: 'lobby', code, state, host: hostId, settings, max: MAX_PLAYERS,
      players: players.map(p => ({ id: p.id, name: p.name, color: p.color, bot: p.bot })) };
  }
  const sendLobby = () => broadcast(lobbyMsg());
  function scoreRows() {
    return players.map(p => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, k: p.kills, d: p.deaths }))
      .sort((a, b) => b.k - a.k || a.d - b.d);
  }

  function setBots(n) {
    n = Math.max(0, Math.min(MAX_PLAYERS - humans().length, n | 0));
    settings.bots = n;
    while (players.filter(p => p.bot).length > n) players.splice(players.findLastIndex(p => p.bot), 1);
    while (players.filter(p => p.bot).length < n) {
      const name = BOT_NAMES.find(nm => !players.some(p => p.name === nm)) || 'Bot';
      players.push(createPlayer(newId(), name, freeColor(), true));
    }
  }

  // Spawn as far as possible from everyone alive.
  function spawn(p) {
    let best = SPAWNS[0], bd = -1;
    for (const sp of SPAWNS) {
      let near = Infinity;
      for (const q of players) if (q !== p && q.alive) near = Math.min(near, Math.hypot(q.x - sp.x, q.z - sp.z));
      near += Math.random() * 4;
      if (near > bd) { bd = near; best = sp; }
    }
    placeAt(p, best);
    p.spawnN = (p.spawnN || 0) + 1; p.spawnYaw = best.yaw;
    p.alive = true; p.hp = MAX_HP; p.shieldT = SPAWN_SHIELD; p.ammo = MAG; p.reloadT = 0; p.fireT = 0; p.hurtT = 99;
    ev.push({ t: 'spawn', id: p.id });
  }

  function startMatch() {
    state = 'playing';
    timeLeft = settings.minutes * 60;
    winner = null;
    for (const p of players) { p.kills = 0; p.deaths = 0; p.alive = false; p.brain = null; }
    for (const p of players) spawn(p);
    scoreVer++;
    broadcast({ t: 'start' });
    sendLobby();
  }

  function endMatch() {
    state = 'results';
    resultsT = 30;
    const rows = scoreRows();
    winner = rows[0];
    broadcast({ t: 'results', rows });
    sendLobby();
  }

  // ------------------------------------------------------- shooting ----
  function shoot(p) {
    p.ammo--;
    const s = traceShot(p, players, Math.random);
    ev.push({ t: 'shot', id: p.id, x: r1(s.ex), y: r1(s.ey), z: r1(s.ez) });
    const q = s.who;
    if (!q || q.shieldT > 0) return;
    const dmg = DAMAGE * (s.head ? HEAD_MULT : 1);
    q.hp -= dmg;
    q.hurtT = 0;
    ev.push({ t: 'hit', by: p.id, on: q.id, dmg, head: s.head, fx: r1(p.x), fz: r1(p.z) });
    if (q.hp <= 0) {
      q.alive = false; q.hp = 0; q.respawnT = RESPAWN; q.deaths++;
      p.kills++;
      scoreVer++;
      ev.push({ t: 'kill', by: p.id, on: q.id, head: s.head });
      if (p.kills >= settings.score) endMatch();
    }
  }

  function stepMatch(dt) {
    for (const p of players) {
      if (p.bot) thinkBot(p, players, dt, settings.skill);
      const inp = p.input;
      if (!p.alive) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) spawn(p);
        continue;
      }
      stepPlayer(p, dt);
      p.shieldT = Math.max(0, p.shieldT - dt);
      p.hurtT += dt;
      if (p.hurtT > REGEN_DELAY && p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + REGEN_RATE * dt);
      // Blaster: reload, then fire while the trigger is held.
      p.fireT = Math.max(0, p.fireT - dt);
      if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) { p.reloadT = 0; p.ammo = MAG; } }
      else if (inp.reload && p.ammo < MAG) { p.reloadT = RELOAD; inp.reload = false; ev.push({ t: 'reload', id: p.id }); }
      else if (inp.fire && p.fireT <= 0) {
        if (p.ammo > 0) { p.fireT = 1 / FIRE_RATE; p.shieldT = 0; shoot(p); if (state !== 'playing') return; }
        else { p.reloadT = RELOAD; ev.push({ t: 'reload', id: p.id }); }
      }
      inp.reload = false;
    }
    timeLeft -= dt;
    if (timeLeft <= 0) endMatch();
  }

  // What every phone sees, plus a private block for its own player (so it
  // can line up its prediction with the host's).
  function sendSnapshot() {
    const ps = players.map(p => [p.id, r1(p.x), r1(p.y), r1(p.z), r1(p.yaw), r1(p.pitch), p.alive ? 1 : 0, Math.ceil(p.hp), p.shieldT > 0 ? 1 : 0]);
    const base = { t: 'snap', left: Math.max(0, Math.round(timeLeft)), ps, ev };
    if (scoreVer !== sentScore) { base.sc = scoreRows(); sentScore = scoreVer; }
    for (const [id, conn] of conns) {
      const p = players.find(x => x.id === id);
      if (!p) continue;
      base.me = { seq: p.input.seq, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, g: p.grounded ? 1 : 0,
        hp: Math.ceil(p.hp), ammo: p.ammo, rel: r1(p.reloadT), alive: p.alive ? 1 : 0, rs: r1(p.respawnT), sh: p.shieldT > 0 ? 1 : 0, sn: p.spawnN || 0, sy: r1(p.spawnYaw || 0) };
      send(conn, JSON.stringify(base));
    }
    ev = [];
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
            if (players.length >= MAX_PLAYERS) {
              // Make room by dropping a bot if we can.
              if (!players.some(p => p.bot)) { send(conn, { t: 'error', msg: 'This match is full (8 max).' }); return; }
              setBots(settings.bots - 1);
            }
            me = createPlayer(newId(), String(m.name || 'Player').replace(/[^\w .-]/g, '').slice(0, 14) || 'Player', freeColor(), false);
            players.push(me);
            conns.set(me.id, conn);
            if (!hostId) hostId = me.id;
            send(conn, { t: 'joined', id: me.id, code, color: me.color });
            if (state === 'playing') { spawn(me); scoreVer++; send(conn, { t: 'start' }); }
            sendLobby();
            break;
          }
          case 'setup': {
            if (!me || me.id !== hostId || state !== 'lobby') return;
            if (typeof m.bots === 'number') setBots(m.bots);
            if ([10, 20, 30].includes(m.score)) settings.score = m.score;
            if ([4, 6, 10].includes(m.minutes)) settings.minutes = m.minutes;
            if (typeof m.skill === 'number') settings.skill = Math.max(0.2, Math.min(1, m.skill));
            sendLobby();
            break;
          }
          case 'start':
            if (me && me.id === hostId && state !== 'playing') startMatch();
            break;
          case 'again':
            if (me && me.id === hostId && state === 'results') { state = 'lobby'; sendLobby(); }
            break;
          case 'in': {
            if (!me) return;
            const inp = me.input;
            inp.seq = m.s | 0;
            inp.mx = Math.max(-1, Math.min(1, +m.mx || 0));
            inp.mz = Math.max(-1, Math.min(1, +m.mz || 0));
            inp.yaw = +m.yw || 0;
            inp.pitch = +m.pt || 0;
            if (m.j) inp.jump = true;
            inp.fire = !!m.f;
            if (m.r) inp.reload = true;
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
        players.splice(players.indexOf(me), 1);
        if (hostId === me.id) hostId = humans()[0]?.id || null;
        scoreVer++;
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
      if (state === 'playing') {
        stepMatch(DT);
        tickN++;
        if (tickN % SNAP_EVERY === 0 && state === 'playing') sendSnapshot();
      } else if (state === 'results') {
        resultsT -= DT;
      }
    }
  }

  setBots(settings.bots);
  return { connect, tick, players, get state() { return state; }, settings, startMatch, scoreRows };
}
