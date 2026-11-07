// First Roll - the party room. It runs on the host's phone (or in a test) and
// is the single authority: seats, heroes and their progress (XP, levels, HP
// and resources between fights), the party's gold, potions and items, the
// campaign (votes, skill checks, rests, town stops), battles, turn control,
// AI turns, reactions and saves.
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
//   buy {item, hero}         equip {item, hero}                    ping {x, y}
//   hero {spec, xp, gear}    (bringing a saved hero: only xp and gear carry over)
// host -> phone:  welcome {pid, token}   state {...}   ping {pid, x, y}   error {text}

import { buildHero, validateSpec, freshProgress, applyProgress, harvestProgress, canWear } from '../rules/character.js';
import { SKILLS, SKILL_NAMES, ITEMS, SHOP, XP_LEVELS, MAX_LEVEL, CLASS_FEATURES, levelForXp } from '../rules/data.js';
import { createBattle, rollInitiative, perform, current, resolveReaction, rollD20 } from '../rules/combat.js';
import { makeRng, die } from '../rules/rng.js';
import { aiNext } from '../rules/ai.js';
import { SCENES, FIRST_SCENE, COMPANIONS } from './campaign.js';
import { buildEncounter, ENCOUNTERS } from './encounters.js';

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
    v: 3, seats: [], nextPid: 1, companions: 'auto',
    progress: {},              // hero id -> { level, xp, hp, hd, aid, gear, uses }
    inventory: { gold: 0, potions: 0, items: [] },
    claimed: {},               // scene rewards already paid
    rewards: null,             // what the last fight paid out
    notice: null,              // { title, lines } shown on the next scene (rests, rewards)
    fightStart: null, settled: false,
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
        if (s.v === 3) S = s;
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
  // XP a newcomer starts with: the lowest in the party, so drop-ins keep up.
  const partyXp = () => {
    const xs = party().map((p) => S.progress[p.id]?.xp).filter((x) => x != null);
    return xs.length ? Math.min(...xs) : 0;
  };
  function progressOf(p) {
    if (!S.progress[p.id]) {
      const xp = partyXp();
      S.progress[p.id] = freshProgress(buildHero(p.spec, { id: p.id, level: levelForXp(xp) }), { xp });
    }
    return S.progress[p.id];
  }
  const heroOf = (p) => {
    const pr = progressOf(p);
    return applyProgress(buildHero(p.spec, { id: p.id, name: p.name, level: pr.level, gear: pr.gear }), pr);
  };

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
      progress: Object.fromEntries(party().map((p) => [p.id, progressOf(p)])),
      inventory: S.inventory, rewards: S.rewards, notice: S.notice,
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
  function goto(id, notice = null) {
    const sc = SCENES[id];
    if (!sc) throw new Error(`No scene ${id}`);
    S.battle = null;
    S.rewards = null;
    S.notice = notice;
    if (sc.kind === 'fight') return startFight(id);
    S.phase = 'story';
    S.story = { scene: id, votes: {}, check: null, result: null };
    if (sc.kind === 'check') S.story.check = { roller: null, helpers: [], rolls: {}, done: false };
    if (sc.kind === 'camp') {
      const lines = [];
      if (sc.reward && !S.claimed[id]) { S.claimed[id] = true; lines.push(...payReward(sc.reward)); }
      if (sc.rest === 'long') lines.push(...longRest());
      S.notice = { title: sc.final ? 'The end of the chapter' : 'In town', lines };
    }
  }

  // ------------------------------------------------- XP, levels, rests ----
  function levelUp(p, to) {
    const pr = progressOf(p);
    const from = pr.level;
    const before = buildHero(p.spec, { id: p.id, level: from, gear: pr.gear });
    const after = buildHero(p.spec, { id: p.id, level: to, gear: pr.gear });
    const fresh = freshProgress(after).uses;
    pr.hp += after.hpMax - before.hpMax;
    pr.hd += to - from;
    for (const [k, v] of Object.entries(fresh)) if (pr.uses[k] == null && v != null) pr.uses[k] = v;
    if (after.casting?.slots) {
      pr.uses.slots ||= {};
      for (const [l, sl] of Object.entries(after.casting.slots)) pr.uses.slots[l] = (pr.uses.slots[l] ?? 0) + sl.max - (before.casting?.slots?.[l]?.max || 0);
    }
    pr.level = to;
    const feats = [];
    for (let l = from + 1; l <= to; l++) feats.push(...(CLASS_FEATURES[p.spec.cls][l] || []).map((f) => f.name));
    return `${p.name} reaches level ${to}: +${after.hpMax - before.hpMax} max HP${feats.length ? `, ${feats.join(', ')}` : ''}.`;
  }

  function grantXp(amount) {
    const lines = [];
    for (const p of party()) {
      const pr = progressOf(p);
      pr.xp += amount;
      const to = levelForXp(pr.xp);
      if (to > pr.level) lines.push(levelUp(p, to));
    }
    return lines;
  }

  function payReward(r) {
    const n = party().length;
    const lines = [];
    if (r.gold) { S.inventory.gold += r.gold * n; lines.push(`The party is paid ${r.gold * n} gold.`); }
    if (r.xp) { lines.push(`Everyone gains ${r.xp} XP.`); lines.push(...grantXp(r.xp)); }
    return lines;
  }

  const d = (sides) => die(S.rng, sides);

  function shortRest() {
    const lines = [];
    for (const p of party()) {
      const pr = progressOf(p);
      const h = heroOf(p);
      let healed = 0, spent = 0;
      while (pr.hd > 0 && h.hpMax - pr.hp >= Math.ceil(h.hitDie / 4)) {
        const gain = Math.max(1, d(h.hitDie) + h.mods.con);
        pr.hp = Math.min(h.hpMax, pr.hp + gain);
        pr.hd--; spent++; healed += gain;
      }
      const u = pr.uses;
      const back = [];
      if (h.secondWind && u.secondWind < h.secondWind.max) { u.secondWind++; back.push('a Second Wind'); }
      if (h.actionSurge && u.actionSurge < h.actionSurge.max) { u.actionSurge = h.actionSurge.max; back.push('Action Surge'); }
      if (h.channel && u.channel < h.channel.max) { u.channel++; back.push('a Channel Divinity'); }
      if (h.adrenaline && u.adrenaline < h.adrenaline.max) { u.adrenaline = h.adrenaline.max; back.push('Adrenaline Rush'); }
      if (p.spec.cls === 'wizard' && !u.arcaneRecovery && h.casting?.slots) {
        let budget = Math.ceil(pr.level / 2);
        for (const l of Object.keys(h.casting.slots).map(Number).sort((a, b) => b - a)) {
          while (l <= budget && (u.slots[l] ?? 0) < h.casting.slots[l].max) { u.slots[l] = (u.slots[l] ?? 0) + 1; budget -= l; back.push(`a level ${l} slot (Arcane Recovery)`); u.arcaneRecovery = true; }
        }
      }
      const bits = [];
      if (spent) bits.push(`spends ${spent} Hit ${spent === 1 ? 'Die' : 'Dice'} and regains ${healed} HP`);
      if (back.length) bits.push(`gets back ${back.join(', ')}`);
      lines.push(`${p.name} ${bits.length ? bits.join(' and ') : 'rests'}.`);
    }
    return lines;
  }

  function longRest() {
    for (const p of party()) {
      const pr = progressOf(p);
      const h = buildHero(p.spec, { id: p.id, level: pr.level, gear: pr.gear });
      S.progress[p.id] = { ...freshProgress(h, { xp: pr.xp }), gear: { ...pr.gear } };
    }
    return ['A Long Rest: everyone is back to full Hit Points, Hit Dice, spell slots and abilities.'];
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
    const choice = sc.choices.find((c) => c.id === pick);
    goto(choice.next, choice.rest === 'short' ? { title: 'Short Rest', lines: shortRest() } : null);
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
    S.fightStart = JSON.parse(JSON.stringify({ progress: S.progress, inventory: S.inventory }));
    S.settled = false;
    S.rewards = null;
    const heroes = members.map((p, i) => Object.assign(heroOf(p), enc.heroStarts[i]));
    S.battle = createBattle({ heroes, foes: enc.foes, walls: enc.walls, seed: Math.floor(Math.random() * 2 ** 31) ^ (now() >>> 0), potions: S.inventory.potions });
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
    if (r.ok) { onTurnChange(); settle(); }
    return r;
  }

  function react(yes) {
    resolveReaction(S.battle, yes);
    deadline = 0;
    onTurnChange();
    settle();
  }

  // When a fight is won: carry HP and resources forward, pay XP and loot.
  function settle() {
    const b = S.battle;
    if (!b?.over || S.settled) return;
    S.settled = true;
    if (b.over !== 'victory') return;
    const members = party();
    const lines = [];
    const revived = [];
    for (const p of members) {
      const c = b.creatures[p.id];
      if (!c) continue;
      const pr = harvestProgress(c, progressOf(p));
      pr.aid = (pr.aid || 0) + (c.aidBonus || 0);
      if (c.hp <= 0) { pr.hp = 1; revived.push(p.name); }
      S.progress[p.id] = pr;
    }
    S.inventory.potions = b.potions;
    const foes = Object.values(b.creatures).filter((c) => c.side === 'foe');
    const xp = Math.floor(foes.reduce((s, f) => s + f.xp, 0) / members.length);
    const loot = ENCOUNTERS[SCENES[S.battleScene].encounter].loot(foes, d);
    S.inventory.gold += loot.gold;
    S.inventory.potions += loot.potions;
    S.inventory.items.push(...loot.items);
    lines.push(...grantXp(xp));
    S.rewards = { xp, gold: loot.gold, potions: loot.potions, items: loot.items, revived, levelUps: lines };
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
        const old = S.progress[s.pid];
        const carried = Math.max(0, Math.min(XP_LEVELS[MAX_LEVEL] * 2, Number(m.xp) || 0));
        const xp = Math.max(old?.xp ?? 0, carried, old ? 0 : partyXp());
        const g = m.gear || old?.gear || {};
        const gear = {
          armor: ['studded', 'chain', 'splint'].includes(g.armor) && canWear(spec.cls, g.armor) ? g.armor : null,
          weapon: g.weapon ? 1 : 0, cloak: !!g.cloak,
        };
        s.spec = spec;
        S.progress[s.pid] = { ...freshProgress(buildHero(spec, { id: s.pid, level: levelForXp(xp), gear }), { xp }), gear };
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
        } else if (S.phase === 'story' && sc?.kind === 'camp' && !sc.final) {
          goto(sc.next);
        }
        return changed();
      }
      case 'retry': {
        if (!isHost || S.phase !== 'battle' || !S.battle?.over) return;
        if (S.fightStart) { S.progress = S.fightStart.progress; S.inventory = S.fightStart.inventory; }
        startFight(S.battleScene);
        return changed();
      }
      case 'again': {
        if (!isHost) return;
        S.battle = null; S.story = null; S.phase = 'lobby'; S.flags = {}; S.claimed = {}; S.rewards = null; S.notice = null;
        return changed();
      }
      case 'buy': {
        if (S.phase !== 'story' || sc?.kind !== 'camp') return err('You can only shop in town.');
        const it = ITEMS[m.item];
        if (!it || !SHOP.includes(m.item)) return err('Not for sale.');
        if (S.inventory.gold < it.price) return err(`That costs ${it.price} gold; the party has ${S.inventory.gold}.`);
        if (it.kind === 'potion') { S.inventory.potions++; }
        else if (it.kind === 'armor') {
          const p = party().find((x) => x.id === m.hero);
          if (!p || !mayControl(s.pid, p.id)) return err('Buy armor for your own hero.');
          if (!canWear(p.spec.cls, it.armor)) return err(`A ${p.spec.cls} can't wear ${it.name}.`);
          progressOf(p).gear.armor = it.armor;
        }
        S.inventory.gold -= it.price;
        return changed();
      }
      case 'equip': {
        if (S.phase === 'battle') return err('Not in the middle of a fight.');
        const i = S.inventory.items.indexOf(m.item);
        const p = party().find((x) => x.id === m.hero);
        if (i < 0 || !p) return;
        if (!mayControl(s.pid, p.id) && !isHost) return err('Hand items to your own hero.');
        const it = ITEMS[m.item];
        const gear = progressOf(p).gear;
        const slot = it.kind === 'weapon' ? 'weapon' : 'cloak';
        if (gear[slot]) return err(`${p.name} already has one.`);
        gear[slot] = it.kind === 'weapon' ? 1 : true;
        S.inventory.items.splice(i, 1);
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
    get progress() { return S.progress; },
    get inventory() { return S.inventory; },
    get rewards() { return S.rewards; },
  };
}
