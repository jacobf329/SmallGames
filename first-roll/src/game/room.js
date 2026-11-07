// First Roll - the party room. It runs on the host's phone (or in a test) and
// is the single authority: seats, heroes, the campaign (story votes, skill
// checks), battles, turn control, AI turns, reactions and saves.
// Transport-free, like Skyline Hustle's room: a connection is anything with
// send(string) and close().
//
//   const room = createRoom({ store, now });
//   const h = room.connect(conn);  h.message(text);  h.close();
//   setInterval(room.tick, 100);
//
// Protocol (JSON), phone -> host:
//   hello {name, token}      hero {spec}  /  hero {spec: null}     companions {n}
//   start                    vote {choice}    decide (host)
//   claim {hero}             help {hero}      roll {hero}          continue (host)
//   act {intent}             react {yes}      retry (host)         again (host)
//   ping {x, y}
// host -> phone:  welcome {pid, token}   state {...}   ping {pid, x, y}   error {text}

import { buildHero, validateSpec } from '../rules/character.js';
import { SKILLS, SKILL_NAMES } from '../rules/data.js';
import { createBattle, rollInitiative, perform, current, resolveReaction, rollD20 } from '../rules/combat.js';
import { makeRng } from '../rules/rng.js';
import { aiNext } from '../rules/ai.js';
import { SCENES, FIRST_SCENE, COMPANIONS } from './campaign.js';
import { buildEncounter } from './encounters.js';

export const MAX_HEROES = 4;
export const MAX_SEATS = 8;            // extra people watch
export const COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#ba68c8', '#f06292', '#90a4ae', '#ffd54f', '#4db6ac'];
export const REACTION_MS = 15000;      // time to answer an Opportunity Attack prompt
export const TAKEOVER_MS = 8000;       // an absent player's hero waits this long before the AI plays it
const AI_STEP_MS = 900;

const makeToken = () => {
  const a = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
};

// Skill modifier with its parts, for checks outside of battle.
export function skillParts(h, skill) {
  const ab = SKILLS[skill];
  const parts = [{ label: `${ab.toUpperCase()} modifier`, value: h.mods[ab], rule: 'ability-modifier' }];
  if (h.profSkills.includes(skill)) {
    const exp = h.expertise.includes(skill);
    parts.push({ label: exp ? 'Expertise (double Proficiency Bonus)' : 'Proficiency Bonus', value: exp ? 2 * h.pb : h.pb, rule: exp ? 'expertise' : 'proficiency' });
  }
  return parts;
}

// store: { load() -> string|null, save(string), remove() }
export function createRoom({ store = null, now = () => Date.now(), seed = null, log = () => {} } = {}) {
  let S = {
    v: 2, seats: [], nextPid: 1, companions: 'auto',
    phase: 'lobby',            // lobby | story | battle
    story: null,               // { scene, votes, check, result }
    flags: {},
    battle: null, battleScene: null,
    rng: makeRng(seed ?? (now() >>> 0)),
    seq: 0,                    // story record counter
  };
  let deadline = 0, aiAt = 0, takeoverAt = 0, lastTurnKey = '';
  let aiForPlayers = 0;
  const online = new Map();    // pid -> set of handles
  const handles = new Set();

  // ------------------------------------------------------------ saves ----
  if (store) {
    try {
      const raw = store.load();
      if (raw) {
        const s = JSON.parse(raw);
        if (s.v === 2) S = s;
        if (S.phase === 'battle' && !S.battle) S.phase = S.story ? 'story' : 'lobby';
      }
    } catch (e) { log('bad save', e); }
  }
  const save = () => {
    if (!store) return;
    try { store.save(JSON.stringify(S)); } catch (e) { log('save failed', e); }
  };

  // --------------------------------------------------------- helpers ----
  const seatOf = (pid) => S.seats.find((s) => s.pid === pid);
  const isOnline = (pid) => (online.get(pid)?.size || 0) > 0;
  const hostPid = () => S.seats[0]?.pid;
  const playerHeroes = () => S.seats.filter((s) => s.spec).slice(0, MAX_HEROES);

  // The party: players' heroes, then AI companions to fill the wanted size.
  function party() {
    const players = playerHeroes().map((s) => ({ id: s.pid, controller: s.pid, spec: s.spec, name: s.spec.name || s.name }));
    const want = S.companions === 'auto' ? Math.max(0, 3 - players.length) : Math.max(0, Math.min(3, S.companions | 0));
    const room = Math.max(0, MAX_HEROES - players.length);
    const taken = new Set(players.map((p) => p.spec.cls));
    const picks = [...COMPANIONS.filter((c) => !taken.has(c.spec.cls)), ...COMPANIONS.filter((c) => taken.has(c.spec.cls))];
    const comps = picks.slice(0, Math.min(want, room)).map((c) => ({ id: c.id, controller: null, spec: c.spec, name: c.name }));
    return [...players, ...comps];
  }
  const heroOf = (p) => buildHero(p.spec, { id: p.id, name: p.name });

  // Who acts for this creature right now: a pid, or 'ai'.
  function actorFor(c, t) {
    if (!c || c.side === 'foe') return 'ai';
    const s = seatOf(c.id);
    if (!s || !s.spec) return 'ai';
    if (isOnline(s.pid)) return s.pid;
    return t >= takeoverAt ? 'ai' : s.pid;
  }
  // Who may act for a hero outside battle: its player, or the host for companions.
  const mayControl = (pid, heroId) => heroId === pid || (pid === hostPid() && !seatOf(heroId)?.spec);

  function publicState() {
    const t = now();
    let b = null;
    if (S.battle) {
      const { rng, ...rest } = S.battle;          // nobody needs to see future dice
      b = { ...rest, log: S.battle.log.slice(-60) };
    }
    const cur = S.battle && current(S.battle);
    return {
      t: 'state', phase: S.phase,
      seats: S.seats.map((s) => ({ pid: s.pid, name: s.name, color: s.color, online: isOnline(s.pid), host: s.pid === hostPid(), spec: s.spec || null })),
      companions: S.companions,
      party: party().map((p) => ({ id: p.id, name: p.name, controller: p.controller, spec: p.spec })),
      story: S.story, flags: S.flags, battleScene: S.battleScene,
      battle: b,
      control: cur && !S.battle.over ? actorFor(cur, t) : null,
      reactor: S.battle?.pending ? actorFor(S.battle.creatures[S.battle.pending.reactor], t) : null,
      reactIn: S.battle?.pending ? Math.max(0, deadline - t) : 0,
    };
  }

  function broadcast() {
    const s = JSON.stringify(publicState());
    for (const h of handles) h.conn.send(s);
  }
  const changed = () => { save(); broadcast(); };
  const sendTo = (h, msg) => h.conn.send(JSON.stringify(msg));

  // ----------------------------------------------------------- story ----
  function goto(id) {
    const sc = SCENES[id];
    if (!sc) throw new Error(`No scene ${id}`);
    S.battle = null;
    if (sc.kind === 'fight') return startFight(id);
    S.phase = 'story';
    S.story = { scene: id, votes: {}, check: null, result: null };
    if (sc.kind === 'check') S.story.check = { roller: null, helpers: [], rolls: {}, done: false };
  }

  function resolveVote(force = false) {
    const sc = SCENES[S.story.scene];
    const voters = playerHeroes().filter((s) => isOnline(s.pid) || s.pid === hostPid()).map((s) => s.pid);
    if (!voters.length) voters.push(hostPid());
    const cast = voters.filter((p) => S.story.votes[p]);
    if (!force && cast.length < voters.length) return;
    if (!Object.keys(S.story.votes).length) return;
    const tally = {};
    for (const p of Object.keys(S.story.votes)) tally[S.story.votes[p]] = (tally[S.story.votes[p]] || 0) + 1;
    const top = Math.max(...Object.values(tally));
    const tied = sc.choices.filter((c) => tally[c.id] === top);
    const pick = tied.length > 1 && tied.some((c) => c.id === S.story.votes[hostPid()]) ? S.story.votes[hostPid()] : tied[0].id;
    goto(sc.choices.find((c) => c.id === pick).next);
  }

  // One hero's check: d20 (Advantage if Helped) + skill modifier vs DC.
  function rollCheck(p, skill, dc, helpers = []) {
    const h = heroOf(p);
    const adv = helpers.map((id) => ({ text: `${party().find((x) => x.id === id)?.name} is Helping`, rule: 'help' }));
    const d20 = rollD20({ rng: S.rng }, h, adv.length ? 'advantage' : 'normal');
    const mods = skillParts(h, skill);
    const total = d20.kept + mods.reduce((s, m) => s + m.value, 0);
    return {
      kind: 'check', seq: ++S.seq, by: p.id, name: p.name, skill: `${SKILL_NAMES[skill]} (${SKILLS[skill].toUpperCase()})`,
      d20: { ...d20, adv, dis: [] }, mods, total, dc, outcome: total >= dc ? 'success' : 'fail', rule: 'skills',
      text: `${p.name} rolls ${SKILL_NAMES[skill]}: ${total} vs DC ${dc}, ${total >= dc ? 'success' : 'failure'}.`,
    };
  }

  function finishCheck() {
    const sc = SCENES[S.story.scene];
    const ck = S.story.check;
    const rolls = Object.values(ck.rolls);
    let success;
    if (sc.check.mode === 'group') success = rolls.filter((r) => r.outcome === 'success').length * 2 >= rolls.length;
    else success = rolls[0]?.outcome === 'success';
    ck.done = true;
    S.story.result = { success, ...(success ? sc.success : sc.fail) };
  }

  function groupRoll(heroId) {
    const sc = SCENES[S.story.scene];
    const ck = S.story.check;
    const p = party().find((x) => x.id === heroId);
    if (!p || ck.rolls[heroId]) return;
    ck.rolls[heroId] = rollCheck(p, sc.check.skill, sc.check.dc);
    // Companions roll once every player has.
    const players = party().filter((x) => x.controller);
    if (players.every((x) => ck.rolls[x.id])) {
      for (const c of party()) if (!ck.rolls[c.id]) ck.rolls[c.id] = rollCheck(c, sc.check.skill, sc.check.dc);
      finishCheck();
    }
  }

  // ---------------------------------------------------------- battle ----
  function startFight(sceneId) {
    const sc = SCENES[sceneId];
    const members = party();
    const enc = buildEncounter(sc.encounter, members.length);
    const heroes = members.map((p, i) => Object.assign(heroOf(p), enc.heroStarts[i]));
    S.battle = createBattle({ heroes, foes: enc.foes, walls: enc.walls, seed: Math.floor(Math.random() * 2 ** 31) ^ (now() >>> 0) });
    if (seed != null) S.battle.rng = makeRng(seed + S.seq + 1);
    S.battleScene = sceneId;
    S.phase = 'battle';
    const surprised = S.flags.surprise === 'foes' ? enc.foes.map((f) => f.id) : S.flags.surprise === 'heroes' ? heroes.map((h) => h.id) : [];
    rollInitiative(S.battle, { surprised });
    S.flags = {};
    onTurnChange(true);
  }

  function onTurnChange(force = false) {
    if (!S.battle) return;
    const k = `${S.battle.round}:${S.battle.idx}`;
    if (force || k !== lastTurnKey) {
      lastTurnKey = k;
      aiAt = now() + AI_STEP_MS;
      takeoverAt = now() + TAKEOVER_MS;
    }
    if (S.battle.pending && !deadline) deadline = now() + REACTION_MS;
  }

  function act(intent) {
    const c = current(S.battle);
    const r = perform(S.battle, c.id, intent);
    if (r.ok) onTurnChange();
    return r;
  }

  function react(yes) {
    resolveReaction(S.battle, yes);
    deadline = 0;
    onTurnChange();
  }

  // ---------------------------------------------------------- messages ----
  function handle(h, m) {
    if (m.t === 'hello') {
      let s = m.token && S.seats.find((x) => x.token === m.token);
      if (!s) {
        if (S.seats.length >= MAX_SEATS) return sendTo(h, { t: 'error', text: 'This party is full.' });
        s = { pid: `p${S.nextPid++}`, token: makeToken(), name: '', spec: null, color: COLORS[S.seats.length % COLORS.length] };
        S.seats.push(s);
      }
      const nm = String(m.name || '').trim().slice(0, 20);
      if (nm) s.name = nm;
      if (!s.name) s.name = `Player ${s.pid.slice(1)}`;
      if (h.pid) online.get(h.pid)?.delete(h);
      h.pid = s.pid;
      if (!online.has(s.pid)) online.set(s.pid, new Set());
      online.get(s.pid).add(h);
      sendTo(h, { t: 'welcome', pid: s.pid, token: s.token });
      if (S.battle && current(S.battle)?.id === s.pid) takeoverAt = now() + TAKEOVER_MS;
      return changed();
    }
    const s = seatOf(h.pid);
    if (!s) return sendTo(h, { t: 'error', text: 'Say hello first.' });
    const isHost = s.pid === hostPid();
    const err = (text) => sendTo(h, { t: 'error', text });
    const sc = S.story && SCENES[S.story.scene];

    switch (m.t) {
      case 'hero': {
        if (S.phase === 'battle') return err('Finish the fight first. Your hero changes from the next scene.');
        if (m.spec == null) { s.spec = null; return changed(); }
        let spec;
        try { spec = validateSpec(m.spec); } catch (e) { return err(e.message); }
        if (!s.spec && playerHeroes().length >= MAX_HEROES) return err('The party already has 4 heroes. You can watch.');
        s.spec = spec;
        return changed();
      }
      case 'companions': {
        if (!isHost) return err('Only the host sets companions.');
        S.companions = m.n === 'auto' ? 'auto' : Math.max(0, Math.min(3, m.n | 0));
        return changed();
      }
      case 'start': {
        if (!isHost) return err('Only the host can start.');
        if (S.phase !== 'lobby') return;
        if (!party().length) return err('The party needs at least one hero.');
        S.flags = {};
        goto(FIRST_SCENE);
        return changed();
      }
      case 'vote': {
        if (S.phase !== 'story' || sc?.kind !== 'story') return;
        if (!s.spec && !isHost) return err('Only players with a hero vote.');
        if (!sc.choices.some((c) => c.id === m.choice)) return;
        S.story.votes[s.pid] = m.choice;
        resolveVote();
        return changed();
      }
      case 'decide': {
        if (!isHost || S.phase !== 'story' || sc?.kind !== 'story') return;
        if (!Object.keys(S.story.votes).length) return err('Nobody has voted yet.');
        resolveVote(true);
        return changed();
      }
      case 'claim': {
        const ck = S.story?.check;
        if (sc?.kind !== 'check' || sc.check.mode !== 'single' || ck.done) return;
        if (!party().some((p) => p.id === m.hero) || !mayControl(s.pid, m.hero)) return err("That isn't your hero.");
        ck.roller = m.hero;
        ck.helpers = ck.helpers.filter((x) => x !== m.hero);
        return changed();
      }
      case 'help': {
        const ck = S.story?.check;
        if (sc?.kind !== 'check' || sc.check.mode !== 'single' || ck.done) return;
        const p = party().find((x) => x.id === m.hero);
        if (!p || !mayControl(s.pid, m.hero) || m.hero === ck.roller) return;
        if (!heroOf(p).profSkills.includes(sc.check.skill)) return err(`To Help with ${SKILL_NAMES[sc.check.skill]} you must be proficient in it.`);
        ck.helpers = ck.helpers.includes(m.hero) ? ck.helpers.filter((x) => x !== m.hero) : [...ck.helpers, m.hero];
        return changed();
      }
      case 'roll': {
        const ck = S.story?.check;
        if (sc?.kind !== 'check' || ck.done) return;
        if (sc.check.mode === 'single') {
          if (!ck.roller) return err('Pick who makes the check first.');
          if (!mayControl(s.pid, ck.roller) && !isHost) return err('The hero making the check rolls.');
          const p = party().find((x) => x.id === ck.roller);
          ck.rolls = { [p.id]: rollCheck(p, sc.check.skill, sc.check.dc, ck.helpers) };
          finishCheck();
        } else {
          const id = m.hero || s.pid;
          if (!mayControl(s.pid, id)) return err("That isn't your hero.");
          groupRoll(id);
        }
        return changed();
      }
      case 'continue': {
        if (!isHost) return err('The host moves the story on.');
        if (S.phase === 'story' && S.story?.result) {
          S.flags = { ...(S.story.result.flags || {}) };
          goto(S.story.result.next);
        } else if (S.phase === 'story' && sc?.kind === 'check' && sc.check.mode === 'group' && !S.story.check.done) {
          for (const p of party()) if (!S.story.check.rolls[p.id]) S.story.check.rolls[p.id] = rollCheck(p, sc.check.skill, sc.check.dc);
          finishCheck();
        } else if (S.phase === 'battle' && S.battle?.over === 'victory') {
          goto(SCENES[S.battleScene].next);
        }
        return changed();
      }
      case 'retry': {
        if (!isHost || S.phase !== 'battle' || !S.battle?.over) return;
        startFight(S.battleScene);
        return changed();
      }
      case 'again': {
        if (!isHost) return;
        S.battle = null; S.story = null; S.phase = 'lobby'; S.flags = {};
        return changed();
      }
      case 'act': {
        if (S.phase !== 'battle' || !S.battle) return;
        const c = current(S.battle);
        if (actorFor(c, now()) !== s.pid) return err("It isn't your turn.");
        const r = act(m.intent || {});
        if (!r.ok) return err(r.error);
        return changed();
      }
      case 'react': {
        if (!S.battle?.pending) return;
        const R = S.battle.creatures[S.battle.pending.reactor];
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
        if (m && typeof m === 'object') {
          try { handle(h, m); } catch (e) { log('message failed', e); sendTo(h, { t: 'error', text: 'Something went wrong with that.' }); }
        }
      },
      close() {
        handles.delete(h);
        if (h.pid) online.get(h.pid)?.delete(h);
        if (S.battle && h.pid && current(S.battle)?.id === h.pid && !isOnline(h.pid)) takeoverAt = now() + TAKEOVER_MS;
        broadcast();
      },
    };
  }

  // ---------------------------------------------------------- the clock ----
  function tick() {
    const b = S.battle;
    if (S.phase !== 'battle' || !b || b.over) return;
    const t = now();
    if (b.pending) {
      if (!deadline) deadline = t + REACTION_MS;
      const R = b.creatures[b.pending.reactor];
      // AI always takes the attack; a person who doesn't answer in time takes it too.
      if (actorFor(R, t) === 'ai' || t >= deadline) { react(true); changed(); }
      return;
    }
    const c = current(b);
    if (actorFor(c, t) !== 'ai' || t < aiAt) return;
    if (seatOf(c.id)?.spec) aiForPlayers++;
    const intent = aiNext(b, c.id) || { a: 'end' };
    let r = act(intent);
    if (!r.ok) r = act({ a: 'end' });
    aiAt = t + (intent.a === 'end' ? AI_STEP_MS / 2 : AI_STEP_MS);
    changed();
  }

  return {
    connect, tick,
    get phase() { return S.phase; },
    get battle() { return S.battle; },
    get seats() { return S.seats; },
    get story() { return S.story; },
    get party() { return party(); },
    get aiForPlayers() { return aiForPlayers; },
  };
}
