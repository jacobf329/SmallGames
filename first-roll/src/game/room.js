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
//   hitdie {hero}  (Short Rest)                 timer {s} (host: 0 = no turn timer)
//   ping {x, y}
// host -> phone:  welcome {pid, token}   state {...}   ping {pid, x, y}   error {text}

import { buildHero, validateSpec, heroState, applyState, spendHitDie, finishShortRest, longRest, levelChoices, swapLimit, droppedPicks, PICK_FIELDS } from '../rules/character.js';
import { SKILLS, SKILL_NAMES } from '../rules/data.js';
import { createBattle, rollInitiative, perform, current, resolveReaction, rollD20 } from '../rules/combat.js';
import { makeRng } from '../rules/rng.js';
import { aiNext, aiReact } from '../rules/ai.js';
import { SCENES, FIRST_SCENE, COMPANIONS } from './campaign.js';
import { buildEncounter } from './encounters.js';

export const MAX_HEROES = 4;
export const MAX_SEATS = 8;            // extra people watch
export const COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#ba68c8', '#f06292', '#90a4ae', '#ffd54f', '#4db6ac'];
export const REACTION_MS = 15000;      // time to answer a reaction prompt (Opportunity Attack, Shield)
export const TIMER_CHOICES = [0, 30, 60, 90];   // turn timer settings, in seconds
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
    level: 1,                  // the party's level (the campaign raises it)
    heroes: {},                // hero id -> saved state between scenes (HP, dice, slots, uses)
    preFight: null,            // what to put back if the party retries a fight
    timer: 0,                  // seconds per player turn, 0 = no limit
    phase: 'lobby',            // lobby | story | battle
    story: null,               // { scene, votes, check, result }
    flags: {},
    battle: null, battleScene: null,
    rng: makeRng(seed ?? (now() >>> 0)),
    seq: 0,                    // story record counter
  };
  let deadline = 0, aiAt = 0, takeoverAt = 0, lastTurnKey = '', turnStart = 0;
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
        else if (s.v === 2) S = { ...s, v: 3, level: 1, heroes: {}, preFight: null, timer: 0 };
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
  // A hero as they are now: built at the party's level, with what they've
  // spent and taken since the last Long Rest put back on.
  const heroOf = (p) => applyState(buildHero(p.spec, { id: p.id, name: p.name, level: S.level }), S.heroes[p.id]);
  const keep = (h) => { S.heroes[h.id] = heroState(h); };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // Choices this party can pick, given what it has found out so far.
  const choicesOf = (sc) => (sc.choices || []).filter((c) => !c.requires || S.flags[c.requires]);

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
      story: S.story, flags: S.flags, battleScene: S.battleScene, level: S.level, timer: S.timer,
      heroes: Object.fromEntries(party().map((p) => [p.id, S.heroes[p.id] || null])),
      turnEndsIn: S.timer && cur && !S.battle.over && actorFor(cur, t) !== 'ai' ? Math.max(0, turnStart + S.timer * 1000 - t) : 0,
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
    if (sc.kind === 'check' || sc.kind === 'save') S.story.check = { roller: null, helpers: [], rolls: {}, done: false };
    if (sc.kind === 'rest' && sc.rest === 'long') {
      S.story.rest = { kind: 'long', results: party().map((p) => {
        const h = heroOf(p);
        const got = longRest(h);
        keep(h);
        return { id: p.id, name: p.name, got };
      }) };
    }
    if (sc.kind === 'rest' && sc.rest === 'short') S.story.rest = { kind: 'short', log: [], results: null };
    if (sc.kind === 'level') levelUp(sc.level);
  }

  // Everyone goes up to `level`: new Hit Points and features, nothing spent comes back.
  function levelUp(level) {
    const from = S.level;
    if (level <= from) { S.story.levelUp = []; return; }
    const before = Object.fromEntries(party().map((p) => [p.id, heroOf(p)]));
    // What each caster had before: a new level swaps one cantrip at most, and
    // the book keeps every spell already written in it.
    const prior = Object.fromEntries(party().map((p) => {
      const v = validateSpec(p.spec, { level: from });
      return [p.id, { cantrips: v.cantrips, book: v.book, prepared: v.prepared, skills: v.skills, expertise: v.expertise, invocations: v.invocations, metamagic: v.metamagic }];
    }));
    S.level = level;
    S.story.levelUp = party().map((p) => {
      const old = before[p.id];
      const h = heroOf(p);
      keep(h);
      const had = new Set(old.features.map((f) => f.name));
      return {
        id: p.id, name: p.name, from, to: level, was: prior[p.id], hpMaxBefore: old.hpMax, hpMax: h.hpMax, hp: h.hp, subclass: h.subclass || null,
        features: h.features.filter((f) => !had.has(f.name)).map((f) => ({ name: f.name, text: f.text, rule: f.rule })),
        slots: h.casting?.slots ? Object.fromEntries(Object.entries(h.casting.slots).map(([lv, x]) => [lv, x.max])) : null,
      };
    });
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
    const tied = choicesOf(sc).filter((c) => tally[c.id] === top);
    if (!tied.length) return;
    const pick = tied.length > 1 && tied.some((c) => c.id === S.story.votes[hostPid()]) ? S.story.votes[hostPid()] : tied[0].id;
    const ch = sc.choices.find((c) => c.id === pick);
    S.flags = { ...S.flags, ...(ch.flags || {}) };
    goto(ch.next);
  }

  // One hero's check: d20 (Advantage if Helped) + skill modifier vs DC.
  function rollCheck(p, skill, dc, helpers = []) {
    const h = heroOf(p);
    const adv = helpers.map((id) => ({ text: `${party().find((x) => x.id === id)?.name} is Helping`, rule: 'help' }));
    const dis = h.conds?.some((c) => c.id === 'poisoned') ? [{ text: `${p.name} is Poisoned`, rule: 'poisoned' }] : [];
    const d20 = rollD20({ rng: S.rng }, h, adv.length && !dis.length ? 'advantage' : dis.length && !adv.length ? 'disadvantage' : 'normal');
    const mods = skillParts(h, skill);
    if (h.exhaustion) mods.push({ label: `Exhaustion ${h.exhaustion}`, value: -2 * h.exhaustion, rule: 'exhaustion' });
    const total = d20.kept + mods.reduce((s, m) => s + m.value, 0);
    return {
      kind: 'check', seq: ++S.seq, by: p.id, name: p.name, skill: `${SKILL_NAMES[skill]} (${SKILLS[skill].toUpperCase()})`,
      d20: { ...d20, adv, dis }, mods, total, dc, outcome: total >= dc ? 'success' : 'fail', rule: 'skills',
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

  // A saving throw outside of battle: d20 + ability modifier (+ Proficiency
  // Bonus if proficient) vs DC. A failure leaves the scene's effect on the hero.
  const ABN = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
  function rollSave(p, { ability, dc, effect }) {
    const h = heroOf(p);
    const adv = effect === 'poisoned' && h.poisonSaveAdv ? [{ text: 'Dwarven Resilience', rule: 'poisoned' }] : [];
    const d20 = rollD20({ rng: S.rng }, h, adv.length ? 'advantage' : 'normal');
    const mods = [{ label: `${ability.toUpperCase()} modifier`, value: h.mods[ability], rule: 'ability-modifier' }];
    if (h.saveProfs.includes(ability)) mods.push({ label: 'Proficiency Bonus (proficient save)', value: h.pb, rule: 'proficiency' });
    if (h.exhaustion) mods.push({ label: `Exhaustion ${h.exhaustion}`, value: -2 * h.exhaustion, rule: 'exhaustion' });
    let total = d20.kept + mods.reduce((s, m) => s + m.value, 0);
    let inspired = false;
    if (total < dc && h.inspiration && d20.kept < 20) {
      const again = rollD20({ rng: S.rng }, h, 'normal');
      d20.rolls.push(again.rolls[0]); d20.kept = again.kept;
      h.inspiration = false; inspired = true;
      total = d20.kept + mods.reduce((s, m) => s + m.value, 0);
    }
    const ok = total >= dc;
    if (!ok && effect === 'poisoned' && !h.condImmune?.includes('poisoned')) h.conds = [...(h.conds || []).filter((c) => c.id !== 'poisoned'), { id: 'poisoned', lasting: true, rule: 'poisoned' }];
    if (!ok && effect === 'exhaustion') h.exhaustion = Math.min(6, (h.exhaustion || 0) + 1);
    keep(h);
    return {
      kind: 'save', save: 'story', seq: ++S.seq, by: p.id, name: p.name, ability, d20: { ...d20, adv, dis: [] }, mods, total, dc,
      outcome: ok ? 'success' : 'fail', rule: 'saving-throw', inspired,
      text: `${p.name} rolls a ${ABN[ability]} save: ${total} vs DC ${dc}, ${ok ? 'success' : `failure${effect === 'poisoned' ? ': Poisoned' : effect === 'exhaustion' ? ': one level of Exhaustion' : ''}`}.${inspired ? ' (Heroic Inspiration: rerolled.)' : ''}`,
    };
  }
  function saveRoll(heroId) {
    const sc = SCENES[S.story.scene];
    const ck = S.story.check;
    const p = party().find((x) => x.id === heroId);
    if (!p || ck.rolls[heroId] || ck.done) return;
    ck.rolls[heroId] = rollSave(p, sc.save);
    const players = party().filter((x) => x.controller);
    if (players.every((x) => ck.rolls[x.id])) finishSave();
  }
  function finishSave() {
    const sc = SCENES[S.story.scene];
    const ck = S.story.check;
    for (const p of party()) if (!ck.rolls[p.id]) ck.rolls[p.id] = rollSave(p, sc.save);
    ck.done = true;
    const failed = Object.values(ck.rolls).filter((r) => r.outcome === 'fail').map((r) => r.by);
    S.story.result = { failed, text: failed.length ? sc.fail : sc.pass, next: sc.next };
  }

  // Short Rest: companions spend Hit Point Dice until they're mostly healed;
  // then everyone gets back what a Short Rest gives.
  function finishShortRest_() {
    const r = S.story.rest;
    for (const p of party()) {
      const h = heroOf(p);
      if (!p.controller) {
        while (h.hitDice.left > 0 && h.hp < h.hpMax - Math.ceil(h.hitDice.die / 2)) {
          const rec = spendHitDie(h, S.rng);
          if (!rec) break;
          r.log.push({ ...rec, seq: ++S.seq });
        }
      }
      keep(h);
    }
    r.results = party().map((p) => {
      const h = heroOf(p);
      const got = finishShortRest(h);
      keep(h);
      return { id: p.id, name: p.name, got };
    });
  }

  // ---------------------------------------------------------- battle ----
  function startFight(sceneId) {
    const sc = SCENES[sceneId];
    const members = party();
    if (!S.preFight || S.preFight.scene !== sceneId) S.preFight = { scene: sceneId, heroes: clone(S.heroes), flags: clone(S.flags) };
    const enc = buildEncounter(sc.encounter, members.length, S.flags);
    const heroes = members.map((p, i) => Object.assign(heroOf(p), enc.heroStarts[i]));
    S.battle = createBattle({ heroes, foes: enc.foes, walls: enc.walls, cover: enc.cover, seed: Math.floor(Math.random() * 2 ** 31) ^ (now() >>> 0) });
    S.fights = (S.fights || 0) + 1;
    if (seed != null) S.battle.rng = makeRng(seed + S.seq + S.fights);
    S.battleScene = sceneId;
    S.phase = 'battle';
    const surprised = S.flags.surprise === 'foes' ? enc.foes.map((f) => f.id) : S.flags.surprise === 'heroes' ? heroes.map((h) => h.id) : [];
    rollInitiative(S.battle, { surprised });
    delete S.flags.surprise;
    onTurnChange(true);
  }

  function onTurnChange(force = false) {
    if (!S.battle) return;
    const k = `${S.battle.round}:${S.battle.idx}`;
    if (force || k !== lastTurnKey) {
      lastTurnKey = k;
      turnStart = now();
      aiAt = now() + AI_STEP_MS;
      takeoverAt = now() + TAKEOVER_MS;
    }
    if (S.battle.pending && !deadline) deadline = now() + REACTION_MS;
  }

  // After a win: what the fight cost each hero carries into the next scene.
  // Anyone left at 0 Hit Points is patched up to 1 by the others.
  function keepAfterFight() {
    for (const p of party()) {
      const h = S.battle.creatures[p.id];
      if (!h) continue;
      h.conds = (h.conds || []).filter((c) => c.lasting);
      const st = heroState(h);
      if (st.hp < 1) st.hp = 1;
      S.heroes[p.id] = st;
    }
    S.preFight = null;
  }

  function act(intent) {
    const c = current(S.battle);
    const r = perform(S.battle, c.id, intent);
    if (r.ok) onTurnChange();
    return r;
  }

  function react(yes, opts = {}) {
    resolveReaction(S.battle, yes, opts);
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
        try { spec = validateSpec(m.spec, { level: S.phase === 'lobby' ? 1 : S.level || 1 }); } catch (e) { return err(e.message); }
        if (!s.spec && playerHeroes().length >= MAX_HEROES) return err('The party already has 4 heroes. You can watch.');
        if (JSON.stringify(s.spec) !== JSON.stringify(spec)) delete S.heroes[s.pid];
        s.spec = spec;
        return changed();
      }
      // A caster's spells: new picks when the party gains a level, or a new
      // set of prepared spells after a Long Rest. The hero keeps its state.
      case 'levelpick': {
        if (S.phase !== 'story' || !s.spec) return err('Only a hero can change spells, between scenes.');
        const when = sc?.kind === 'level' ? 'level' : sc?.kind === 'rest' && sc.rest === 'long' ? 'rest' : null;
        if (!when) return err('You can make these choices when you gain a level or after a Long Rest.');
        const pick = m.pick && typeof m.pick === 'object' ? m.pick : {};
        let was, next;
        try {
          was = validateSpec(s.spec, { level: S.level });
          const cls = was.cls;
          // A level-up can change its spells and the choices this level brings; a Long Rest, prepared spells only.
          const open = when === 'level' ? new Set(['cantrips', 'book', 'prepared', 'scholar', ...levelChoices(cls, S.level)]) : new Set(['prepared']);
          if (open.has('style')) open.add('warriorCantrips');
          if (open.has('invocations')) open.add('pactWeapon');
          const take = {};
          for (const k of PICK_FIELDS) take[k] = open.has(k) && k in pick ? pick[k] : was[k];
          // A feat: only the one this level brings; earlier levels' feats stay.
          if (open.has('feat') && Array.isArray(pick.feats)) {
            const mine = pick.feats.find((f) => f && f.level === S.level);
            take.feats = [...(was.feats || []).filter((f) => f.level !== S.level), ...(mine ? [mine] : [])];
          }
          next = validateSpec({ ...s.spec, ...take }, { level: S.level });
        } catch (e) { return err(e.message); }
        const base = (when === 'level' && S.story.levelUp?.find((x) => x.id === s.pid)?.was) || was;
        const NAMES = { cantrips: 'cantrip', prepared: 'prepared spell', invocations: 'invocation', metamagic: 'Metamagic option', skills: 'skill', expertise: 'Expertise skill', book: 'spellbook spell' };
        for (const [k, label] of Object.entries(NAMES)) {
          const n = droppedPicks(next.cls, S.level, next.land, base[k] || [], next[k] || []).length;
          const lim = swapLimit(next.cls, when, k);
          if (n > lim && k === 'book') return err("Spells stay in a wizard's spellbook once they're written in.");
          if (n > lim) return err(lim === 0 ? `You keep every ${label} you already have${when === 'rest' && k === 'prepared' ? ' after a Long Rest; you can swap one when you gain a level' : ''}.` : `You can swap one ${label}, not more.`);
        }
        s.spec = next;
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
        S.flags = {}; S.level = 1; S.heroes = {}; S.preFight = null;
        goto(FIRST_SCENE);
        return changed();
      }
      case 'vote': {
        if (S.phase !== 'story' || sc?.kind !== 'story') return;
        if (!s.spec && !isHost) return err('Only players with a hero vote.');
        if (!choicesOf(sc).some((c) => c.id === m.choice)) return;
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
        if (sc?.kind === 'save') {
          if (ck.done) return;
          const id = m.hero || s.pid;
          if (!mayControl(s.pid, id)) return err("That isn't your hero.");
          saveRoll(id);
          return changed();
        }
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
        if (S.phase === 'story' && sc?.kind === 'save' && !S.story.check.done) {
          finishSave();
        } else if (S.phase === 'story' && S.story?.result) {
          S.flags = { ...S.flags, ...(S.story.result.flags || {}) };
          goto(S.story.result.next);
        } else if (S.phase === 'story' && sc?.kind === 'rest' && sc.rest === 'short' && !S.story.rest.results) {
          finishShortRest_();
        } else if (S.phase === 'story' && (sc?.kind === 'rest' || sc?.kind === 'level')) {
          goto(sc.next);
        } else if (S.phase === 'story' && sc?.kind === 'check' && sc.check.mode === 'group' && !S.story.check.done) {
          for (const p of party()) if (!S.story.check.rolls[p.id]) S.story.check.rolls[p.id] = rollCheck(p, sc.check.skill, sc.check.dc);
          finishCheck();
        } else if (S.phase === 'battle' && S.battle?.over === 'victory') {
          keepAfterFight();
          goto(SCENES[S.battleScene].next);
        }
        return changed();
      }
      case 'retry': {
        if (!isHost || S.phase !== 'battle' || !S.battle?.over) return;
        if (S.preFight) { S.heroes = clone(S.preFight.heroes); S.flags = clone(S.preFight.flags); }
        startFight(S.battleScene);
        return changed();
      }
      case 'again': {
        if (!isHost) return;
        S.battle = null; S.story = null; S.phase = 'lobby'; S.flags = {}; S.level = 1; S.heroes = {}; S.preFight = null;
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
        react(!!m.yes, { slot: m.slot | 0 });
        return changed();
      }
      case 'hitdie': {
        const r = S.story?.rest;
        if (sc?.kind !== 'rest' || r?.kind !== 'short' || r.results) return;
        const id = m.hero || s.pid;
        const p = party().find((x) => x.id === id);
        if (!p || !mayControl(s.pid, id)) return err("That isn't your hero.");
        const h = heroOf(p);
        if (!h.hitDice.left) return err('No Hit Point Dice left. They come back on a Long Rest.');
        if (h.hp >= h.hpMax) return err(`${p.name} is already at full Hit Points.`);
        const rec = spendHitDie(h, S.rng);
        keep(h);
        r.log.push({ ...rec, seq: ++S.seq });
        return changed();
      }
      case 'timer': {
        if (!isHost) return err('Only the host sets the turn timer.');
        S.timer = TIMER_CHOICES.includes(m.s | 0) ? m.s | 0 : 0;
        turnStart = now();
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
      // The AI decides for its own creatures. A person who doesn't answer in
      // time takes an Opportunity Attack but doesn't spend a slot on Shield.
      if (actorFor(R, t) === 'ai') { react(aiReact(b)); changed(); }
      else if (t >= deadline) { react(b.pending.kind === 'oa'); changed(); }
      return;
    }
    const c = current(b);
    // Turn timer: a player who runs out of time ends their turn.
    if (S.timer && actorFor(c, t) !== 'ai' && t >= turnStart + S.timer * 1000) {
      const who = c.name;
      const r = act({ a: 'end' });
      if (r.ok && r.records[0]) r.records[0].text = `${who} runs out of time and the turn ends (turn timer: ${S.timer} seconds).`;
      changed();
      return;
    }
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
