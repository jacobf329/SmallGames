// Decision-making for monsters, AI companions and the Coach. aiNext returns
// one intent at a time; it plays by exactly the same rules as a person
// because its intents go through combat.perform like anyone else's.
//
// Styles:  melee       close in and hit the best target in reach
//          skirmisher  (Rogue) set up Sneak Attack, otherwise shoot; step back after
//          archer      keep away, Disengage out of melee, shoot from cover
//          caster      (Wizard) stay back, pick the best spell or cantrip
//          support     (Cleric) heal and bless, then attack with spells
//
// The core idea: score every action from where the creature stands, then
// score the same from every square it could move to (minus the risk of
// getting there), and take whichever is better.

import { cheb, incap, down, hasCond, condOf, reachMap, canEndAt, pathFrom, key, onBoard, lineOfSight, feetBetween } from './grid.js';
import {
  attackOptions, enemiesOf, alliesOf, previewMove, canCast, canAttack, spellAttack, spellDC,
  attackFactors, hitChance, hitBonus, saveChance, spellMod, scaled, areaTargets, pointError, offhandFor, canTarget,
  provokers, speedOf, seenBy, preservePlan, damageMult, acAgainst, reachOf, BREATH_AREAS, spellAim, smitePay, spellDCParts, landsAidDice, metaError, glareTargets,
} from './combat.js';
import { inBounds } from './grid.js';
import { SPELLS } from './data.js';
import { avgDice } from './rng.js';

const hidden = (c) => hasCond(c, 'hidden');
const targetsOf = (b, me) => {
  const all = enemiesOf(b, me).filter((e) => onBoard(e) && !e.dead && !hidden(e));
  const up = all.filter((e) => !down(e));
  return up.length ? up : all;           // only beat on the fallen when nobody else is left
};
const awake = (b, me) => enemiesOf(b, me).filter((e) => onBoard(e) && !incap(e));
const threatenedAt = (b, me, at) => awake(b, me).some((e) => cheb(e, at) * 5 <= reachOf(e) && lineOfSight(b, e, at));
const threatened = (b, me) => threatenedAt(b, me, me);
const finishing = (T, avg) => (T.hp <= avg ? 2 : 0) - (down(T) ? 3 : 0) + (hasCond(T, 'paralyzed') && !down(T) ? 3 : 0);
const slotCost = (can) => (can.pay === 'slot' ? 2 + can.slot * 1.5 : can.pay === 'free' ? 1.5 : 0);
const sees = (b, me, T, range) => feetBetween(me, T) <= range && lineOfSight(b, me, T);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const PFE_TYPES = ['aberration', 'celestial', 'elemental', 'fey', 'fiend', 'undead'];
const flatOf = (atk) => (atk.dmgFlat || []).reduce((s2, x) => s2 + x.value, 0);
const myMark = (b, me) => b.effects.find((e) => e.type === 'mark' && e.by === me.id);
const anyUp = (b, me) => targetsOf(b, me).some((T) => !down(T));
const totalFoeHp = (b, me) => targetsOf(b, me).filter((T) => !down(T)).reduce((s2, T) => s2 + T.hp, 0);
const sleepProof = (c) => c.condImmune?.includes('exhaustion') || c.speciesId === 'elf';
// Spots to center an area on: each foe's square and the squares around it.
function spotsNear(b, me, aim, foes) {
  const spots = new Map();
  const consider = (x, y) => { if (inBounds(x, y) && !pointError(b, me, aim, x, y)) spots.set(`${x},${y}`, { x, y }); };
  if (aim.from === 'self') for (const [dx, dy] of DIRS) consider(me.x + dx, me.y + dy);
  for (const T of foes) {
    consider(T.x, T.y);
    if (aim.from !== 'self') for (const [dx, dy] of DIRS) consider(T.x + dx, T.y + dy);
  }
  return [...spots.values()];
}

// Weapon attacks from where `me` stands.
function weaponOptions(b, me, { kind = null } = {}) {
  const out = [];
  if (!canAttack(b.turn)) return out;
  for (const T of targetsOf(b, me)) {
    for (const o of attackOptions(b, me, T)) {
      if (!o.ok || (kind && o.atk.kind !== kind)) continue;
      if (o.atk.solo && b.turn.attacksLeft > 0) continue;
      // A Ghoul's or Ghast's Claw: worth it for the chance to Paralyze.
      const par = o.atk.rider?.paralyze;
      const bonus = par && T.creature !== 'undead' && !hasCond(T, 'paralyzed') && !(T.condImmune || []).includes('paralyzed') && !(par.notElf && T.speciesId === 'elf')
        ? o.p * (1 - saveChance(b, T, 'con', par.dc)) * 8 : 0;
      out.push({ intent: { a: 'attack', target: T.id, attack: o.atk.id }, score: o.expected + finishing(T, o.avg) + bonus, why: { T, o }, time: 'action', ranged: o.atk.kind === 'ranged' });
    }
    // Life Drain (Wight) in place of one attack: better against heavy armor.
    if (me.drain && !kind && cheb(me, T) <= 1 && !down(T)) {
      const pFail = 1 - saveChance(b, T, 'con', me.drain.dc);
      const avg = (avgDice(me.drain.dice) + me.drain.flat) * damageMult(T, me.drain.type);
      out.push({ intent: { a: 'drain', target: T.id }, score: pFail * avg * 1.5 + finishing(T, avg) * pFail, why: { T, o: { mode: 'normal' } }, time: 'action', ranged: false });
    }
  }
  return out;
}

// The Light property's extra attack, if one is open this turn.
export function offhandOptions(b, me) {
  const out = [];
  const t = b.turn;
  if (!t?.light || t.offhandUsed) return out;
  for (const atk of me.attacks) {
    const off = offhandFor(b, me, atk);
    if (off.error) continue;
    for (const T of targetsOf(b, me)) {
      if (!canTarget(b, me, T, off.atk).ok) continue;
      const f = attackFactors(b, me, T, off.atk);
      const p = hitChance(hitBonus(off.atk), acAgainst(b, me, T, off.atk).value, f.mode, me.luck);
      const avg = (avgDice(off.atk.dice) + off.atk.dmgFlat.reduce((s2, x) => s2 + x.value, 0)) * damageMult(T, off.atk.type);
      out.push({ intent: { a: 'attack', target: T.id, attack: atk.id, offhand: true }, score: p * avg + finishing(T, avg), why: { T, p, nick: off.nick }, time: off.nick ? 'free' : 'bonus' });
    }
  }
  return out.sort((p, q) => q.score - p.score);
}

// Every spell and special option the creature has right now, scored by
// expected damage (or how much it helps). Leveled spells pay for the slot,
// so cantrips are preferred when they're nearly as good. `light` skips the
// area spells and buffs (used when scoring squares to move to).
export function specialOptions(b, me, { light = false } = {}) {
  const out = [];
  const t = b.turn;
  if (!t) return out;
  const add = (intent, score, why, time = 'action') => out.push({ intent, score, why, time });
  const friends = [me, ...alliesOf(b, me)].filter((c) => !c.dead && onBoard(c));
  const foes = targetsOf(b, me);
  for (const sid of Object.keys(me.casting?.known || {})) {
    const s = SPELLS[sid];
    const can = canCast(b, me, sid);
    if (!can.ok) continue;
    if (light && !['attack', 'save', 'missile', 'rays', 'command', 'hold', 'spiritual'].includes(s.kind)) continue;
    const range = s.touch ? 5 : s.range || 0;
    if (s.conc && me.conc && can.pay !== 'again') continue;      // keep the spell already going
    const cost = slotCost(can);
    const sc = scaled(sid, can.slot, me.level);
    const dc = spellDC(me, sid);
    const immune = (T) => s.notOn?.includes(T.creature) || (s.only && T.creature !== s.only);
    switch (s.kind) {
      case 'attack': case 'rays': {
        const atk = spellAttack(me, sid, { melee: !!s.melee });
        for (const T of foes) {
          if (!sees(b, me, T, range)) continue;
          const f = attackFactors(b, me, T, atk);
          const p = hitChance(hitBonus(atk), acAgainst(b, me, T, atk).value, f.mode, me.luck);
          const giant = me.giant?.uses && s.kind === 'attack' ? (me.giant.kind === 'fire' ? 5.5 : me.giant.kind === 'frost' ? 3.5 : 0) : 0;
          const each = (avgDice(sc.dice) + flatOf(atk)) * damageMult(T, s.type) + giant;
          const n = s.kind === 'rays' ? sc.rays : 1;
          add({ a: 'cast', spell: sid, target: T.id }, n * p * each + finishing(T, each) - cost + (s.rider === 'guided' ? 1.5 : 0) + (s.rider === 'chill' || s.rider === 'shocked' || s.rider === 'sicken' || s.rider === 'pull' || s.rider === 'wisp' ? 0.5 : 0), { T, p, mode: f.mode, n });
        }
        break;
      }
      case 'save': {
        const scored = [];
        for (const T of foes) {
          if (!sees(b, me, T, range) || immune(T) || down(T)) continue;
          const pFail = 1 - saveChance(b, T, s.save, dc);
          const avg = ((sc.dice ? avgDice(sc.dice) : 0) + (sc.flat || 0)) * damageMult(T, s.type);
          const rider = s.rider === 'mocked' ? 1.5 : s.rider === 'flee' ? 1 : s.rider === 'befuddle' && T.casting ? 6 : s.rider === 'befuddle' ? 1 : 0;
          scored.push({ T, pFail, v: (pFail + (s.half ? (1 - pFail) / 2 : 0)) * avg + finishing(T, avg) + pFail * rider });
        }
        if (sc.targets > 1) {
          // Chain Lightning: the best few, one cast.
          const pick = scored.sort((p, q) => q.v - p.v).slice(0, sc.targets);
          if (pick.length) add({ a: 'cast', spell: sid, target: pick[0].T.id, targets: pick.map((x) => x.T.id) }, pick.reduce((acc, x) => acc + x.v, 0) - cost, { T: pick[0].T, pFail: pick[0].pFail, dc, ids: pick.map((x) => x.T.id) });
        } else for (const x of scored) add({ a: 'cast', spell: sid, target: x.T.id }, x.v - cost, { T: x.T, pFail: x.pFail, dc });
        break;
      }
      case 'word': {
        // Divine Word: only worth it on creatures at 50 Hit Points or fewer, best of all at 20 or fewer.
        const pick = foes.filter((T) => !down(T) && T.hp <= 40 && sees(b, me, T, range))
          .map((T) => ({ T, v: (1 - saveChance(b, T, 'cha', dc)) * (T.hp <= 20 ? T.hp + 8 : 10) })).sort((p, q) => q.v - p.v).slice(0, sc.targets);
        if (pick.length) add({ a: 'cast', spell: sid, target: pick[0].T.id, targets: pick.map((x) => x.T.id) }, pick.reduce((acc, x) => acc + x.v, 0) - cost, { T: pick[0].T, ids: pick.map((x) => x.T.id) }, 'bonus');
        break;
      }
      case 'pwstun': {
        for (const T of foes) {
          if (down(T) || incap(T) || T.hp > 150 || (T.condImmune || []).includes('stunned') || !sees(b, me, T, range)) continue;
          add({ a: 'cast', spell: sid, target: T.id }, 10 + 6 * (T.multiattack || 1) * Math.min(1, T.hp / 40) - cost, { T });
        }
        break;
      }
      case 'missile': {
        for (const T of foes) {
          if (!sees(b, me, T, s.range)) continue;
          const avg = sc.darts * (avgDice(s.dice) + s.flat) * damageMult(T, s.type);
          add({ a: 'cast', spell: sid, target: T.id }, avg + finishing(T, avg) * 2 - cost, { T });
        }
        break;
      }
      case 'command': {
        for (const T of foes) {
          if (down(T) || hasCond(T, 'commanded') || !sees(b, me, T, s.range)) continue;
          const pFail = 1 - saveChance(b, T, 'wis', dc);
          add({ a: 'cast', spell: sid, target: T.id }, pFail * 7 - cost, { T, pFail, dc });
        }
        break;
      }
      case 'hold': {
        for (const T of foes) {
          if (down(T) || immune(T) || hasCond(T, 'paralyzed') || !sees(b, me, T, s.range)) continue;
          const pFail = 1 - saveChance(b, T, 'wis', dc);
          add({ a: 'cast', spell: sid, target: T.id }, pFail * (s.level >= 5 ? 22 : 16) - cost, { T, pFail, dc });
        }
        break;
      }
      case 'spiritual': {
        if (b.effects.some((e) => e.type === 'spiritual' && e.by === me.id)) break;
        const atk = spellAttack(me, sid, { melee: true });
        for (const T of foes) {
          if (!sees(b, me, T, s.range)) continue;
          const p = hitChance(hitBonus(atk), acAgainst(b, me, { ...T }, { ...atk, ignoreCover: true }).value, 'normal', me.luck);
          const avg = (avgDice(sc.dice) + spellMod(me, sid)) * damageMult(T, s.type);
          add({ a: 'cast', spell: sid, target: T.id }, p * avg + 5 - cost, { T, p }, 'bonus');
        }
        break;
      }
      case 'area': {
        const aim = spellAim(sid, can.slot, null, me.level);
        const near = threatened(b, me);
        for (const { x, y } of spotsNear(b, me, aim, foes)) {
          const hit = areaTargets(b, me, aim, x, y);
          const fs = hit.filter((c) => c.side !== me.side && !down(c) && !c.dead);
          const pals = hit.filter((c) => c.side === me.side);
          if (!fs.length) continue;
          // Sleep, Entangle, Web: a condition instead of damage. Sleep skips allies.
          if (s.cond) {
            const sleep = s.cond === 'sleep' || !!s.choose;   // Sleep and Slow pick their targets
            if (!sleep && pals.length) continue;
            const fresh = fs.filter((c) => !incap(c) && !hasCond(c, 'restrained') && !hasCond(c, s.cond === 'fear' ? 'frightened' : s.cond) && !(s.cond === 'sleep' && sleepProof(c)));
            if (!fresh.length) continue;
            const worth = { sleep: 8, pattern: 8, slow: 6, fear: 5 }[s.cond] || 6;
            const exp = fresh.reduce((acc, c) => acc + (1 - saveChance(b, c, s.save, dc)) * worth * Math.min(1, c.hp / 8), 0);
            if (s.level >= 3 && fresh.length < 2 && exp < 6) continue;
            add({ a: 'cast', spell: sid, x, y }, exp - cost, { foes: fresh, pals: sleep ? [] : pals });
            continue;
          }
          if (pals.length) continue;
          if (s.effect) {
            const fresh = fs.filter((c) => !b.effects.some((x2) => x2.type === s.effect && x2.target === c.id));
            if (fresh.length < 2) continue;
            const exp = fresh.reduce((acc, c) => acc + (1 - saveChance(b, c, s.save, dc)) * 2.5, 0);
            add({ a: 'cast', spell: sid, x, y }, exp - cost, { foes: fresh, pals });
            continue;
          }
          if (fs.length < 2 && !(near && aim.from === 'self')) continue;
          const mult = (c) => (s.prismatic ? s.prismatic.reduce((acc, ty) => acc + damageMult(c, ty), 0) / s.prismatic.length : damageMult(c, s.type));
          const rider = s.rider === 'blind' || s.rider === 'sunblind' ? 2 : 0;
          const exp = fs.reduce((acc, c) => acc + (avgDice(sc.dice) * mult(c) + rider) * (1 - saveChance(b, c, s.save, dc) / 2), 0);
          add({ a: 'cast', spell: sid, x, y }, exp + (near && aim.from === 'self' ? 2 : 0) - cost, { foes: fs, pals });
        }
        break;
      }
      case 'temp': {
        if ((me.tempHp || 0) > 0 || !foes.some((T) => !down(T))) break;
        add({ a: 'cast', spell: sid }, avgDice(sc.dice) + sc.flat - 5 - cost + (threatened(b, me) ? 2 : 0), { T: me });
        break;
      }
      case 'armor': {
        if (me.armorId !== 'none' || me.mageArmor || threatened(b, me)) break;
        add({ a: 'cast', spell: sid, target: me.id }, 6 - cost, { T: me });
        break;
      }
      case 'heal': {
        for (const F of friends) {
          if (!sees(b, me, F, range) && F !== me) continue;
          if (cantHeal(b, F)) continue;
          const need = F.hp <= 0 ? 20 : F.hp <= F.hpMax / 3 ? 9 : 0;
          const amt = sc.amount || avgDice(sc.dice) + spellMod(me, sid);
          // Heal (70 HP) is wasted on a scratch: only on someone who'd use most of it.
          if (sc.amount && F.hpMax - F.hp < sc.amount * 0.6 && F.hp > 0) continue;
          if (need) add({ a: 'cast', spell: sid, target: F.id }, need + (s.time === 'bonus' ? 2 : 0) + (sc.amount ? 4 : 0) - cost, { T: F, heal: amt }, s.time);
        }
        break;
      }
      case 'stabilize': {
        for (const F of alliesOf(b, me)) {
          if (F.hp <= 0 && !F.stable && !F.dead && sees(b, me, F, s.range)) add({ a: 'cast', spell: sid, target: F.id }, 12, { T: F });
        }
        break;
      }
      case 'cure': {
        for (const F of friends) {
          if (F !== me && cheb(me, F) > 1) continue;
          const c = (F.conds || []).find((x) => s.cures.includes(x.id));
          if (!c) {
            if (s.greater && ((F.drained || 0) >= 5 || (F.exhaustion || 0) >= 1)) add({ a: 'cast', spell: sid, target: F.id }, 3 + (F.drained || 0) * 0.3 + (F.exhaustion || 0) * 3 - cost, { T: F }, s.time);
            continue;
          }
          add({ a: 'cast', spell: sid, target: F.id, cond: c.id }, (c.id === 'paralyzed' ? 16 : 3) - cost, { T: F, cond: c.id }, s.time);
        }
        break;
      }
      case 'buff': {
        const pool = friends.filter((F) => !down(F) && (F === me || sees(b, me, F, s.range)));
        if (s.buff === 'bless') {
          const ids = pool.sort((p, q) => (q.side === me.side) - (p.side === me.side)).slice(0, sc.targets).map((c) => c.id);
          if (ids.length >= 2 && foes.some((T) => !down(T))) add({ a: 'cast', spell: sid, targets: ids }, 2 + ids.length * 2.5 - cost, { ids });
        } else if (s.buff === 'faith') {
          let best = null;
          for (const F of pool) {
            const n = awake(b, F).filter((e) => cheb(e, F) * 5 <= reachOf(e)).length;
            if (n && (!best || n > best.n)) best = { F, n };
          }
          if (best) add({ a: 'cast', spell: sid, target: best.F.id }, 1 + best.n * 2.5 - cost, { T: best.F }, 'bonus');
        } else if (s.buff === 'beacon') {
          const ids = pool.filter((F) => F.side === me.side).slice(0, sc.targets).map((c) => c.id);
          const healers = friends.some((F) => Object.keys(F.casting?.known || {}).some((k) => ['heal', 'massheal'].includes(SPELLS[k].kind)) || F.layOnHands);
          const hurt = friends.filter((F) => F.hp < F.hpMax / 2).length;
          if (ids.length >= 2 && totalFoeHp(b, me) > 25 && (healers || hurt)) add({ a: 'cast', spell: sid, targets: ids }, 1 + ids.length * 1.2 + hurt * 1.5 - cost, { ids });
        } else if (s.buff === 'aid') {
          const dying = friends.filter((F) => F.hp <= 0 && !F.dead && sees(b, me, F, s.range)).slice(0, sc.targets);
          if (dying.length) add({ a: 'cast', spell: sid, targets: dying.map((c) => c.id) }, 14 * dying.length - cost, { ids: dying.map((c) => c.id) });
        }
        break;
      }
      case 'mark': {
        if (myMark(b, me)) break;
        let best = null;
        for (const T of foes) {
          if (down(T) || !sees(b, me, T, s.range)) continue;
          if (!best || T.hp > best.hp) best = T;
        }
        if (best) add({ a: 'cast', spell: sid, target: best.id }, 2 + 3.5 * Math.min(3, best.hp / 7) - cost * 0.5, { T: best }, 'bonus');
        break;
      }
      case 'selfbuff': {
        if (s.buff === 'favor') {
          if (me.favorOn || b.effects.some((e) => e.type === 'favor' && e.by === me.id)) break;
          const close = foes.some((T) => !down(T) && cheb(me, T) <= 3);
          if (close && canAttack(t)) add({ a: 'cast', spell: sid }, 2 + 2.5 * Math.min(3, totalFoeHp(b, me) / 10) - cost, { T: me }, 'bonus');
        } else if (s.buff === 'blur') {
          if (threatened(b, me) || foes.filter((T) => !down(T)).length >= 2) add({ a: 'cast', spell: sid }, 6 - cost, { T: me });
        } else if (s.buff === 'fireshield') {
          if (b.effects.some((e) => e.type === 'fireshield' && e.target === me.id)) break;
          const melee = foes.filter((T) => !down(T) && cheb(me, T) <= 2 && T.attacks?.some((a) => a.kind === 'melee')).length;
          if (melee) add({ a: 'cast', spell: sid }, 3 + melee * 4 - cost, { T: me });
        } else if (s.buff === 'auralife') {
          if (b.effects.some((e) => e.type === 'auralife' && e.by === me.id)) break;
          const near = friends.filter((F) => !F.dead && feetBetween(me, F) <= 30);
          const ups = near.filter((F) => F.hp <= 0).length;
          const hurt = near.filter((F) => F.hp > 0 && F.hp < F.hpMax / 2).length;
          if ((ups || hurt >= 2) && totalFoeHp(b, me) > 20) add({ a: 'cast', spell: sid }, ups * 10 + hurt * 3 + (enemiesOf(b, me).some((e) => !down(e) && (e.attacks || []).some((a) => a.type === 'Necrotic')) ? 4 : 0) - cost, { T: me });
        }
        break;
      }
      case 'massheal': {
        const hurt = friends.filter((F) => !F.dead && F.hp < F.hpMax / 2 && (F === me || sees(b, me, F, range))).slice(0, sc.targets);
        const ups = hurt.filter((F) => F.hp <= 0).length;
        if (hurt.length >= 2 || ups) add({ a: 'cast', spell: sid, targets: hurt.map((c) => c.id) }, hurt.length * 4 + ups * 12 - cost, { ids: hurt.map((c) => c.id) }, 'bonus');
        break;
      }
      case 'revive': {
        for (const F of alliesOf(b, me)) {
          if (F.dead && F.diedRound != null && b.round - F.diedRound <= 10 && cheb(me, F) <= 1) add({ a: 'cast', spell: sid, target: F.id }, 30, { T: F });
        }
        break;
      }
      case 'zone': {
        if (s.area.from === 'self') {
          const n = foes.filter((T) => !down(T) && cheb(me, T) <= Math.round(s.area.size / 5)).length;
          if (n) add({ a: 'cast', spell: sid }, n * avgDice(sc.dice) * 0.6 + 4 - cost, { foes: n });
          break;
        }
        // Guardian of Faith: no Concentration, so it goes up next to the enemies already on someone.
        if (s.zone === 'guardian' && b.effects.some((e) => e.type === 'zone' && e.spell === sid && e.by === me.id)) break;
        const aim = spellAim(sid, can.slot, null, me.level);
        for (const { x, y } of spotsNear(b, me, aim, foes)) {
          const hit = areaTargets(b, me, aim, x, y);
          if (hit.some((c) => c.side === me.side)) continue;
          const fs = hit.filter((c) => !down(c) && !c.dead);
          if (fs.length < (s.zone === 'guardian' ? 1 : 2)) continue;
          const each = (c) => {
            const pFail = 1 - saveChance(b, c, s.save, dc);
            if (s.dice || sc.flat) return (pFail + (s.half ? (1 - pFail) / 2 : 0)) * ((s.dice ? avgDice(sc.dice) : 0) + (sc.flat || 0)) * damageMult(c, s.type) * 1.4;
            return pFail * (s.zone === 'stink' ? 5 : 3);
          };
          add({ a: 'cast', spell: sid, x, y }, fs.reduce((acc, c) => acc + each(c), 0) - cost, { foes: fs });
        }
        break;
      }
      case 'dispel': {
        for (const F of friends) {
          const bad = (F.conds || []).find((x) => SPELLS[x.rule] && !x.lethargy && x.by && b.creatures[x.by]?.side !== me.side);
          if (bad && sees(b, me, F, range)) add({ a: 'cast', spell: sid, target: F.id }, (bad.id === 'paralyzed' ? 16 : 6) - cost, { T: F });
        }
        break;
      }
      case 'bane': {
        const pick = foes.filter((T) => !down(T) && sees(b, me, T, s.range) && !b.effects.some((e) => e.type === 'bane' && e.target === T.id))
          .sort((p, q) => q.hp - p.hp).slice(0, sc.targets);
        if (pick.length < 2) break;
        const exp = pick.reduce((acc, T) => acc + (1 - saveChance(b, T, 'cha', dc)) * 2.5, 0);
        add({ a: 'cast', spell: sid, targets: pick.map((c) => c.id) }, 1 + exp - cost, { ids: pick.map((c) => c.id) });
        break;
      }
      default: break;
    }
    // Buffs added with the new classes (Heroism, Protection from Evil and Good, Barkskin, Dragon's Breath).
    if (s.kind === 'buff' && ['heroism', 'pfe', 'bark', 'dbreath', 'haste', 'magicweapon', 'invis', 'stoneskin', 'deathward'].includes(s.buff)) {
      const pool = friends.filter((F) => !down(F) && (F === me || sees(b, me, F, range)) && !b.effects.some((e) => e.type === s.buff && e.target === F.id));
      let best = null;
      for (const F of pool) {
        const near = awake(b, F).filter((e) => cheb(e, F) * 5 <= reachOf(e) + 10);
        let v = 0;
        if (s.buff === 'heroism') v = hasCond(F, 'frightened') ? 7 : 0;
        else if (s.buff === 'pfe') v = near.filter((e) => PFE_TYPES.includes(e.creature)).length * 3;
        else if (s.buff === 'bark') v = near.length ? Math.max(0, 17 - F.ac) * 1.2 : 0;
        else if (s.buff === 'dbreath') v = foes.filter((T) => !down(T) && cheb(T, F) <= 3).length >= 2 ? 6 : 0;
        else if (s.buff === 'haste') v = totalFoeHp(b, me) > 20 && F.attacks?.some((a) => a.kind === 'melee' || a.kind === 'ranged') ? 4 + (F.multiattack || 1) * 2 : 0;
        else if (s.buff === 'magicweapon') v = F !== me || !me.casting ? 0 : totalFoeHp(b, me) > 15 && F.multiattack > 1 ? 4 : 0;
        else if (s.buff === 'invis') v = totalFoeHp(b, me) > 25 && F.attacks?.some((a) => a.kind === 'melee' || a.kind === 'ranged') ? 4 + (F.multiattack || 1) * 2.5 + (near.length ? 2 : 0) : 0;
        else if (s.buff === 'stoneskin') v = near.length && totalFoeHp(b, me) > 25 && !F.raging ? near.length * 3 + (F.hp < F.hpMax / 2 ? 2 : 0) : 0;
        else if (s.buff === 'deathward') v = near.length && F.hp <= F.hpMax / 3 && F.hp > 0 ? 9 : 0;
        if (v && (!best || v > best.v)) best = { F, v };
      }
      if (best) add({ a: 'cast', spell: sid, targets: [best.F.id] }, best.v - cost, { T: best.F }, s.time);
    }
  }
  if (me.breath?.uses > 0 && canAttack(t) && !light) {
    const dc = me.breath.dc.reduce((s, p) => s + p.value, 0);
    for (const shape of ['cone', 'line']) {
      for (const T of foes) {
        const hit = areaTargets(b, me, BREATH_AREAS[shape], T.x, T.y);
        const fs = hit.filter((c) => c.side !== me.side && !down(c));
        if (!fs.length || hit.some((c) => c.side === me.side)) continue;
        const exp = fs.reduce((acc, c) => acc + avgDice(me.breath.dice) * damageMult(c, me.breath.type) * (1 - saveChance(b, c, 'dex', dc) / 2), 0);
        add({ a: 'breath', shape, x: T.x, y: T.y }, exp + (fs.length > 1 ? 2 : -2), { foes: fs, shape });
      }
    }
  }
  // A monster's recharge breath (Acid Breath): the whole action, so it has to beat its Multiattack.
  if (me.mbreath?.ready && t.action && !t.attacksLeft && !(t.attacked || []).length && !light) {
    const br = me.mbreath;
    const area = { shape: br.shape, size: br.size, from: 'self' };
    for (const T of foes) {
      const hit = areaTargets(b, me, area, T.x, T.y);
      const fs = hit.filter((c) => c.side !== me.side && !down(c));
      if (!fs.length || hit.some((c) => c.side === me.side)) continue;
      const exp = fs.reduce((acc, c) => acc + avgDice(br.dice) * damageMult(c, br.type) * (1 - saveChance(b, c, 'dex', br.dc) / 2), 0);
      add({ a: 'mbreath', x: T.x, y: T.y }, exp - (me.multiattack || 1) * 4, { foes: fs });
    }
  }
  // Dreadful Glare (Mummy Lord): part of its Multiattack, so it always comes first.
  if (me.glare && !t.glared && (t.action > 0 || t.attacksLeft > 0)) {
    for (const T of glareTargets(b, me)) {
      if (hasCond(T, 'paralyzed')) continue;
      const pFail = 1 - saveChance(b, T, me.glare.ability, me.glare.dc);
      add({ a: 'glare', target: T.id }, 40 + pFail * (avgDice(me.glare.dice) + me.glare.flat + 15), { T, pFail });
    }
  }
  if (me.web?.ready && t.action) {
    for (const T of foes) {
      if (down(T) || hasCond(T, 'restrained') || !sees(b, me, T, me.web.range)) continue;
      const pFail = 1 - saveChance(b, T, 'dex', me.web.dc);
      add({ a: 'web', target: T.id }, pFail * 9 + (cheb(me, T) > 1 ? 2 : 0), { T, pFail });
    }
  }
  // Channel Divinity (Cleric).
  if (me.channel?.uses > 0 && t.action && !t.magicUsed && me.cls === 'cleric') {
    if (me.level >= 2) {
      const dc = me.casting ? me.casting.stats.wis.dc.reduce((s, p) => s + p.value, 0) : 10;
      for (const T of foes) {
        if (!sees(b, me, T, 30)) continue;
        const avg = (4.5 * (me.sparkDice || 1) + me.mods.wis) * damageMult(T, 'Radiant');
        add({ a: 'spark', target: T.id }, avg * (1 - saveChance(b, T, 'con', dc) / 2) + finishing(T, avg) - 2, { T, dc });
      }
      for (const F of friends) {
        if (F.hp <= 0 && !F.dead && sees(b, me, F, 30)) add({ a: 'spark', target: F.id }, 17, { T: F, heal: true });
      }
      const undead = enemiesOf(b, me).filter((c) => c.creature === 'undead' && c.hp > 0 && !hasCond(c, 'incapacitated') && feetBetween(me, c) <= 30);
      if (undead.length) add({ a: 'turn' }, undead.length * 6 * (1 - saveChance(b, undead[0], 'wis', dc)) - 1, { undead });
    }
    if (me.preserveLife) {
      const plan = preservePlan(b, me);
      const total = plan.reduce((s, p) => s + p.amount, 0);
      const ups = plan.filter((p) => b.creatures[p.id].hp <= 0).length;
      if (plan.length) add({ a: 'preserve' }, total * 0.7 + ups * 12 - 2, { plan });
    }
  }
  // Spiritual Weapon already out: a free swing with the Bonus Action.
  const w = b.effects.find((e) => e.type === 'spiritual' && e.by === me.id);
  if (w && t.bonus) {
    for (const T of foes) {
      if (cheb(w, T) > 5) continue;
      add({ a: 'spiritual', target: T.id }, 6 + finishing(T, 6), { T }, 'bonus');
    }
  }
  classOptions(b, me, add, { friends, foes, light });
  // Overchannel (Evoker 14): the free use goes on a big damaging spell.
  if (me.overchannel?.uses > 0) {
    for (const o of [...out]) {
      if (o.intent.a !== 'cast' || o.intent.meta || o.score < 12 || metaError(b, me, o.intent.spell, 'overchannel')) continue;
      out.push({ ...o, intent: { ...o.intent, meta: 'overchannel' }, score: o.score * 1.5 });
    }
  }
  out.sort((p, q) => q.score - p.score);
  return out;
}

// The features of the newer classes: Rage, Bardic Inspiration, Wild Shape,
// Martial Arts, Lay on Hands, Innate Sorcery and the rest.
function classOptions(b, me, add, { friends, foes, light }) {
  const t = b.turn;
  const up = foes.filter((T) => !down(T));
  if (!up.length) return;
  // Rage: as soon as a fight is close enough to matter.
  if (me.rage && !me.raging && me.rage.uses > 0 && t.bonus && !me.conc) {
    const soon = up.some((T) => cheb(me, T) * 5 <= speedOf(b, me) + 10);
    if (soon) add({ a: 'rage' }, 8, { T: me }, 'bonus');
  }
  // Bardic Inspiration: to the friend most likely to roll soon. Lore bards keep one for Cutting Words.
  if (me.bardic && t.bonus && me.bardic.uses > (me.cuttingWords ? 1 : 0)) {
    let best = null;
    for (const F of friends) {
      if (F === me || down(F) || F.bardicDie || !sees(b, me, F, 60)) continue;
      const v = (awake(b, F).some((e) => cheb(e, F) <= 2) ? 2 : 0) + (F.attacks?.length ? 1 : 0);
      if (!best || v > best.v) best = { F, v };
    }
    if (best) add({ a: 'inspire', target: best.F.id }, 4 + best.v * 0.5, { T: best.F }, 'bonus');
  }
  // Wild Shape: once the druid has no spell slots left to spend.
  if (me.wildShape && !me.shape && t.bonus && me.wildShape.uses > (me.landsAid ? 1 : 0)) {
    const slots = Object.values(me.casting?.slots || {}).reduce((s2, x) => s2 + x.left, 0);
    if (!slots && !me.conc) add({ a: 'shape' }, 5.5, { T: me }, 'bonus');
  }
  // Land's Aid: a 10-foot Sphere of thorns that also heals a friend inside.
  if (me.landsAid && me.wildShape?.uses > 0 && t.action && !t.magicUsed && !light && !me.shape) {
    const area = { mode: 'area', shape: 'sphere', size: 10, from: 'point', range: 60 };
    const dc = me.casting.stats.wis.dc.reduce((s2, p) => s2 + p.value, 0);
    for (const { x, y } of spotsNear(b, me, area, up)) {
      const inside = areaTargets(b, me, area, x, y);
      const fs = inside.filter((c) => c.side !== me.side && !down(c) && !c.dead);
      if (!fs.length) continue;
      const hurt = inside.some((c) => c.side === me.side && c.hp < c.hpMax / 2);
      const exp = fs.reduce((acc, c) => acc + 3.5 * landsAidDice(me) * damageMult(c, 'Necrotic') * (1 - saveChance(b, c, 'con', dc) / 2), 0);
      add({ a: 'landsaid', x, y }, exp + (hurt ? 5 : 0) - 3, { foes: fs });
    }
  }
  // Martial Arts and Flurry of Blows (Bonus Action Unarmed Strikes).
  const fist = me.martialDie && me.attacks.find((a) => a.id === 'unarmed');
  if (fist && t.bonus) {
    for (const T of up) {
      const o = attackOptions(b, me, T).find((x) => x.atk.id === 'unarmed');
      if (!o?.ok) continue;
      add({ a: 'martial', target: T.id }, o.expected + finishing(T, o.avg), { T, o }, 'bonus');
      if (me.focus?.uses > 0) add({ a: 'flurry', target: T.id, tech: 'topple' }, (me.level >= 10 ? 3 : 2) * o.expected + finishing(T, o.avg) + (me.openHand ? 1 : 0) - 2, { T, o }, 'bonus');
    }
  }
  // Lay on Hands: bring a fallen friend back up, or top up a badly hurt one.
  if (me.layOnHands && t.bonus) {
    for (const F of friends) {
      if (F.dead || (F !== me && cheb(me, F) > 1)) continue;
      const pool = me.layOnHands.uses;
      const bad = (F.conds || []).filter((c) => (me.restoringTouch ? ['poisoned', 'blinded', 'charmed', 'frightened', 'paralyzed', 'stunned'] : ['poisoned']).includes(c.id) && !c.pattern);
      if (bad.length && pool >= 5) add({ a: 'lay', target: F.id, cure: true }, bad.some((c) => c.id === 'paralyzed' || c.id === 'stunned') ? 14 : 4, { T: F, cure: true }, 'bonus');
      if (pool < 1 || F.hp >= F.hpMax || cantHeal(b, F)) continue;
      if (F.hp <= 0) add({ a: 'lay', target: F.id, amount: Math.min(pool, Math.max(1, Math.ceil(F.hpMax / 2))) }, 20, { T: F }, 'bonus');
      else if (F.hp <= F.hpMax / 3) add({ a: 'lay', target: F.id, amount: Math.min(pool, F.hpMax - F.hp) }, 6, { T: F }, 'bonus');
    }
  }
  // Hunter's Mark or Hex: move it once its creature drops.
  const mk = myMark(b, me);
  if (mk && t.bonus) {
    const old = b.creatures[mk.target];
    if (!old || old.dead || old.hp <= 0) {
      const T = up.filter((X) => sees(b, me, X, 90)).sort((p, q) => q.hp - p.hp)[0];
      if (T) add({ a: 'remark', target: T.id }, 7, { T }, 'bonus');
    }
  }
  // Innate Sorcery: early in a fight worth it.
  if (me.innate && !me.innateOn && (me.innate.uses > 0 || (me.incarnate && me.sorcery?.uses >= 4)) && t.bonus && totalFoeHp(b, me) > 15) add({ a: 'innate' }, me.innate.uses > 0 ? 5 : 3, { T: me }, 'bonus');
  // Wholeness of Body (Open Hand monk): a Bonus Action heal when hurt.
  if (me.wholeness?.uses > 0 && t.bonus && me.hp > 0 && me.hp <= me.hpMax * 0.6) add({ a: 'wholeness' }, 4 + (me.hp <= me.hpMax / 3 ? 4 : 0), { T: me }, 'bonus');
  // Tireless (Ranger 10): Temporary Hit Points as a Magic action.
  if (me.tireless?.uses > 0 && t.action && !t.magicUsed && !(me.tempHp > 0) && !light) add({ a: 'tireless' }, threatened(b, me) ? 3.5 : 1.5, { T: me });
  // Abjure Foes (Paladin 9): frighten the worst threats.
  if (me.abjure && me.channel?.uses > 0 && t.action && !t.magicUsed && !light) {
    const dc = me.casting ? me.casting.stats.cha.dc.reduce((s2, p) => s2 + p.value, 0) : 10;
    const pick = up.filter((T) => !hasCond(T, 'frightened') && feetBetween(me, T) <= 60 && lineOfSight(b, me, T))
      .sort((p, q) => (q.hp + 10 * (q.multiattack || 1)) - (p.hp + 10 * (p.multiattack || 1))).slice(0, Math.max(1, me.mods.cha));
    const exp = pick.reduce((acc, T) => acc + (1 - saveChance(b, T, 'wis', dc)) * (3 + 2 * (T.multiattack || 1)) * Math.min(1, T.hp / 20), 0);
    if (pick.length && exp > 3) add({ a: 'abjure', targets: pick.map((T) => T.id) }, exp, { ids: pick.map((T) => T.id) });
  }
  // Intimidating Presence (Berserker 14): frighten what's close, once per Long Rest.
  if (me.intimidating?.uses > 0 && t.bonus) {
    const dc = 8 + me.mods.str + me.pb;
    const near = up.filter((T) => feetBetween(me, T) <= 30 && !hasCond(T, 'frightened') && !(T.condImmune || []).includes('frightened'));
    const exp = near.reduce((acc, T) => acc + (1 - saveChance(b, T, 'wis', dc)) * (1.5 + (T.multiattack || 1)) * Math.min(1, T.hp / 20), 0);
    if (near.length >= 2 && exp > 3) add({ a: 'intimidate' }, exp + (me.raging ? 1 : -3), { foes: near }, 'bonus');
  }
  // Nature's Veil (Ranger 14): Invisible for the attacks to come.
  if (me.veil?.uses > 0 && t.bonus && canAttack(t) && !b.effects.some((e) => e.type === 'veil' && e.target === me.id) && totalFoeHp(b, me) > 30) {
    add({ a: 'veil' }, 3 + (me.multiattack || 1) * 1.2 + (threatened(b, me) ? 1.5 : 0), { T: me }, 'bonus');
  }
  // Nature's Sanctuary (Land Druid 14): cover for friends who are being hit.
  if (me.sanctuary && me.wildShape?.uses > 0 && t.action && !t.magicUsed && !light && !me.shape && !b.effects.some((e) => e.type === 'sanctuary' && e.by === me.id)) {
    let best = null;
    for (const F of friends) {
      if (down(F) || cheb(me, F) * 5 > 120) continue;
      const inside = friends.filter((o) => !down(o) && cheb(o, F) <= 1);
      const pressed = inside.filter((o) => awake(b, o).some((e) => cheb(e, o) * 5 <= reachOf(e) + 30)).length;
      if (pressed >= 2 && (!best || pressed > best.n)) best = { F, n: pressed };
    }
    if (best && totalFoeHp(b, me) > 40) add({ a: 'sanctuary', x: best.F.x, y: best.F.y }, 2 + best.n * 2.5, { T: best.F });
  }
  // Fleet Step (Open Hand 11): out of a crowd after the Flurry.
  if (me.fleetStep && t.flurried && !t.fleeted && me.focus?.uses > 1 && me.hp < me.hpMax / 2 && threatened(b, me)) add({ a: 'fleet' }, 6, { T: me }, 'bonus');
  // Dragon's Breath: exhale a 15-foot Cone.
  const db = b.effects.find((e) => e.type === 'dbreath' && e.target === me.id);
  if (db && t.action && !t.magicUsed && !light) {
    const dc = db.dcParts.reduce((s2, p) => s2 + p.value, 0);
    for (const T of up) {
      const hit = areaTargets(b, me, BREATH_AREAS.cone, T.x, T.y);
      const fs = hit.filter((c) => c.side !== me.side && !down(c));
      if (!fs.length || hit.some((c) => c.side === me.side)) continue;
      const exp = fs.reduce((acc, c) => acc + avgDice(db.dice) * damageMult(c, db.dmgType) * (1 - saveChance(b, c, 'dex', dc) / 2), 0);
      add({ a: 'exhale', x: T.x, y: T.y }, exp, { foes: fs });
    }
  }
}

// Best thing to do with the action from where `me` stands.
function bestHere(b, me, { kind = null, light = false } = {}) {
  const t = b.turn;
  let best = null;
  for (const o of weaponOptions(b, me, { kind })) if (!best || o.score > best.score) best = o;
  if (t.action) {
    for (const o of specialOptions(b, me, { light })) {
      if (o.time !== 'action') continue;
      if (kind === 'melee' && o.intent.a === 'cast') continue;
      if (!best || o.score > best.score) best = o;
    }
  }
  return best;
}

// Every square `me` could move to now, with its path and the Opportunity
// Attacks on the way. (Prone creatures stand up first.)
function squaresWithin(b, me) {
  const t = b.turn;
  if (speedOf(b, me) === 0) return [];
  const budget = t.moveLeft - (hasCond(me, 'prone') ? Math.floor(Math.max(0, me.speed - 5 * (me.exhaustion || 0)) / 2) : 0);
  if (budget < 5) return [];
  const map = reachMap(b, me, budget);
  const out = [];
  for (const [k, feet] of map.dist) {
    const [x, y] = k.split(',').map(Number);
    if (feet <= 0 || !canEndAt(b, me, x, y)) continue;
    const path = pathFrom(map, me, x, y);
    if (!path) continue;
    let from = { x: me.x, y: me.y };
    const oas = new Set();
    let used = 0;
    for (const to of path) { for (const h of provokers(b, me, from, to, used)) oas.add(h.id); from = to; used += 5; }
    out.push({ x, y, feet, oas: oas.size });
  }
  return out;
}

// Score acting from square s (moving there first), without moving.
function scoreFrom(b, me, s, opts) {
  const ox = me.x, oy = me.y;
  me.x = s.x; me.y = s.y;
  try { return bestHere(b, me, { ...opts, light: true }); } finally { me.x = ox; me.y = oy; }
}

const RANGED_STYLES = ['archer', 'caster', 'support', 'skirmisher'];

// Where to go before acting, if anywhere beats staying put.
function bestMove(b, me, style, here) {
  const t = b.turn;
  const free = b.effects.some((e) => e.type === 'disengage' && e.by === me.id);
  const ranged = RANGED_STYLES.includes(style);
  const kind = style === 'melee' ? null : style === 'archer' ? 'ranged' : null;
  const foes = targetsOf(b, me);
  if (!foes.length) return null;
  const hereScore = here ? here.score : 0;
  const cands = [];
  for (const s of squaresWithin(b, me)) {
    const risk = free ? 0 : s.oas * 6;
    const act = canAttack(t) ? scoreFrom(b, me, s, { kind }) : null;
    let score = (act ? act.score : 0) - risk;
    const near = Math.min(...foes.map((e) => cheb(e, s)));
    if (ranged && threatenedAt(b, me, s)) score -= style === 'skirmisher' && act && !act.ranged ? 0 : 3;
    if (ranged && act?.why?.o?.cover === null) score += 0;
    if (!act || act.score <= 0.3) score += style === 'melee' || !ranged ? -near * 0.3 : -Math.max(0, near - 4) * 0.3;
    cands.push({ ...s, score, act });
  }
  cands.sort((p, q) => q.score - p.score || p.feet - q.feet);
  const stayNear = Math.min(...foes.map((e) => cheb(e, me)));
  const stay = hereScore > 0.3 ? hereScore : (style === 'melee' || !ranged ? -stayNear * 0.3 : -Math.max(0, stayNear - 4) * 0.3) - (ranged && threatened(b, me) ? 3 : 0);
  for (const c of cands.slice(0, 12)) {
    if (c.score <= stay + 0.5) break;
    if (previewMove(b, me.id, c.x, c.y)) return c;
  }
  return null;
}

// After acting: get out of reach if you're a ranged type standing in it.
function retreat(b, me) {
  const free = b.effects.some((e) => e.type === 'disengage' && e.by === me.id);
  let best = null;
  for (const s of squaresWithin(b, me)) {
    if (!free && s.oas) continue;
    const ups = awake(b, me);
    if (!ups.length) return null;
    const near = Math.min(...ups.map((e) => cheb(e, s)));
    const score = Math.min(near, 5) * 10 - s.feet / 5 - (threatenedAt(b, me, s) ? 30 : 0);
    if (!best || score > best.score) best = { ...s, score };
  }
  if (!best || threatenedAt(b, me, best)) return null;
  return previewMove(b, me.id, best.x, best.y) ? best : null;
}

function fleeFrom(b, me, src) {
  let best = null;
  for (const s of squaresWithin(b, me)) {
    const d = cheb(s, src);
    if (d <= cheb(me, src)) continue;
    if (!best || d > best.d || (d === best.d && s.feet < best.feet)) best = { ...s, d };
  }
  return best && previewMove(b, me.id, best.x, best.y) ? best : null;
}

// A spot for Misty Step: out of reach, with a shot at someone.
function mistySpot(b, me) {
  let best = null;
  for (let y = me.y - 6; y <= me.y + 6; y++) {
    for (let x = me.x - 6; x <= me.x + 6; x++) {
      const s = { x, y };
      if (!canEndAt(b, me, x, y) || cheb(me, s) * 5 > 30 || !lineOfSight(b, me, s)) continue;
      if (threatenedAt(b, me, s)) continue;
      const act = scoreFrom(b, me, s, {});
      const score = (act ? act.score : 0) + Math.min(5, Math.min(...awake(b, me).map((e) => cheb(e, s))));
      if (!best || score > best.score) best = { ...s, score };
    }
  }
  return best;
}

function nearestTarget(b, me) {
  let best = null;
  for (const T of targetsOf(b, me)) {
    const d = cheb(me, T) * 10 + T.hp;
    if (!best || d < best.d) best = { T, d };
  }
  return best?.T || null;
}

const standCost = (me) => Math.floor(Math.max(0, me.speed - 5 * (me.exhaustion || 0)) / 2);

export function aiNext(b, id) {
  const me = b.creatures[id];
  const t = b.turn;
  if (!t || t.who !== id || b.over || b.pending) return null;
  if (t.steps > 12) return { a: 'end' };

  // Turned Undead flee from the cleric, then do nothing else.
  const turned = (me.conds || []).find((x) => x.turned);
  if (turned) {
    if (!t.moves && me.hp > 0) {
      const src = b.creatures[turned.by];
      const s = src && fleeFrom(b, me, src);
      if (s) return { a: 'move', x: s.x, y: s.y };
    }
    return { a: 'end' };
  }
  if (incap(me)) return { a: 'end' };
  // Fear: Dash and run from the caster by the safest route.
  const scared = (me.conds || []).find((x) => x.flee);
  if (scared) {
    const src = b.creatures[scared.by];
    if (src && t.action) return { a: 'dash' };
    const s = src && t.moveLeft >= 5 && t.moves < 3 && fleeFrom(b, me, src);
    if (s) return { a: 'move', x: s.x, y: s.y };
    return { a: 'end' };
  }
  const style = me.shape ? 'melee' : me.ai || 'melee';
  const foes = targetsOf(b, me);
  if (!foes.length) return { a: 'end' };

  // Get up first (half your Speed), unless you can't.
  if (hasCond(me, 'prone') && speedOf(b, me) > 0 && t.moveLeft >= standCost(me)) return { a: 'stand' };

  // Bonus actions that are worth it whatever else happens.
  if (t.bonus) {
    if (me.secondWind?.uses > 0 && me.hp <= me.hpMax / 2) return { a: 'second-wind' };
    const bonus = specialOptions(b, me).filter((o) => o.time === 'bonus');
    const top = bonus[0];
    if (top && top.score >= 5) return top.intent;
  }

  // Heroes look after a dying friend if they can.
  if (me.side === 'hero' && t.action) {
    const dying = alliesOf(b, me).find((a) => a.hp <= 0 && !a.dead && !a.stable);
    if (dying) {
      const help = specialOptions(b, me).find((o) => (o.intent.target === dying.id || o.intent.targets?.includes(dying.id) || o.intent.a === 'preserve') && o.score >= 12 && o.time === 'action');
      if (help) return help.intent;
      if (cheb(me, dying) <= 1) return { a: 'stabilize', target: dying.id };
      if (!t.moves) {
        let best = null;
        for (const s of squaresWithin(b, me)) {
          if (cheb(s, dying) > 1 || s.oas) continue;
          if (!best || s.feet < best.feet) best = s;
        }
        if (best && previewMove(b, id, best.x, best.y)) return { a: 'move', x: best.x, y: best.y };
      }
    }
  }

  // Held fast: break free if there's nothing better to do from here.
  const web = condOf(me, 'restrained');
  const grab = condOf(me, 'grappled');
  if ((web?.web || grab) && t.action) {
    const here = bestHere(b, me);
    if (!here || here.score < 3) return web?.web ? { a: 'cut', target: id } : { a: 'escape' };
  }
  if (web?.escape && t.action) {
    const here = bestHere(b, me);
    if (!here || here.score < 3) return { a: 'escape' };
  }

  // Casters in someone's reach: Misty Step away first.
  if ((style === 'caster' || style === 'support') && t.bonus && threatened(b, me) && canCast(b, me, 'misty-step').ok) {
    const s = mistySpot(b, me);
    if (s) return { a: 'cast', spell: 'misty-step', x: s.x, y: s.y };
  }

  // Archers next to an enemy: Disengage (goblins' Nimble Escape), then step away.
  if (style === 'archer' && threatened(b, me) && !t.moves && t.moveLeft >= 5) {
    const free = b.effects.some((e) => e.type === 'disengage' && e.by === id);
    if (!free && me.nimble && t.bonus) return { a: 'nimble' };
    if (free) { const s = retreat(b, me); if (s) return { a: 'move', x: s.x, y: s.y }; }
  }

  const kind = style === 'archer' ? (threatened(b, me) ? null : 'ranged') : null;
  let here = canAttack(t) || t.action ? bestHere(b, me, { kind }) : null;

  // Move first if a better spot is in reach (only while there's still something to do there).
  if (t.moves < 2 && t.moveLeft >= 5 && (canAttack(t) || t.action)) {
    const mv = bestMove(b, me, style, here);
    if (mv) return { a: 'move', x: mv.x, y: mv.y };
  }

  if (here && here.score > 0.3) {
    const atk = here.intent.a === 'attack' && me.attacks.find((a) => a.id === here.intent.attack);
    const melee = atk && atk.kind === 'melee' && !here.intent.offhand;
    // Reckless Attack: with a Strength melee attack, while not badly hurt.
    if (melee && me.reckless && !t.rolled && (atk.ability || 'str') === 'str' && me.hp > me.hpMax / 2 && !b.effects.some((e) => e.type === 'reckless' && e.by === id)) return { a: 'reckless' };
    // Sacred Weapon: as the Attack action starts, against a fight that's worth it.
    if (melee && me.sacredWeapon && !me.sacredOn && me.channel?.uses > 0 && totalFoeHp(b, me) > 12) return { a: 'sacred' };
    // Steady Aim before a shot taken from where you stand.
    if (here.intent.a === 'attack' && here.ranged && me.steadyAim && t.bonus && !t.moves && t.moveLeft >= speedOf(b, me) && here.why.o.mode !== 'advantage' && !threatened(b, me)) return { a: 'aim' };
    return here.intent;
  }

  // The Light property's extra attack (part of the action with Nick, else the Bonus Action).
  if (!canAttack(t)) {
    const off = offhandOptions(b, me)[0];
    if (off && off.score > 1) return off.intent;
  }

  // Leftover Bonus Action (Martial Arts, Bardic Inspiration, Hunter's Mark...).
  if (t.bonus && !canAttack(t)) {
    const top = specialOptions(b, me).filter((o) => o.time === 'bonus')[0];
    if (top && top.score > 1.5) return top.intent;
  }

  // Hasted: the extra action, for one more weapon attack.
  if (!t.action && !t.attacksLeft && t.hasteAct && !t.hasteOnly && weaponOptions(b, me).length) return { a: 'haste' };

  // Action used: Action Surge for another go.
  if (!t.action && !t.attacksLeft && me.actionSurge?.uses > 0 && !t.surged) {
    const w = weaponOptions(b, me);
    if (w.length && (foes.filter((f) => !down(f)).length > 1 || w.some((o) => o.why.T.hp > 6))) return { a: 'surge' };
  }

  // Done attacking and still in reach: step back (Cunning Action Disengage first).
  if (RANGED_STYLES.includes(style) && threatened(b, me) && t.moveLeft >= 5) {
    const free = b.effects.some((e) => e.type === 'disengage' && e.by === id);
    if (!free && t.bonus && (me.cunning || me.nimble)) return { a: 'disengage', bonus: true };
    const s = retreat(b, me);
    if (s && t.moves < 3) return { a: 'move', x: s.x, y: s.y };
  }

  // Couldn't reach anyone: Dash (monsters) and keep coming.
  if (t.action && !canAttackSomeone(b, me) && me.side === 'foe') return { a: 'dash' };
  if (t.moveLeft >= 5 && t.moves < 3 && !threatened(b, me) && (style === 'melee' || !t.action)) {
    const T = nearestTarget(b, me);
    if (T && cheb(me, T) > 1) {
      let best = null;
      for (const s of squaresWithin(b, me)) {
        const score = cheb(s, T) * 100 + s.feet + s.oas * 1000;
        if (!best || score < best.score) best = { ...s, score };
      }
      if (best && cheb(best, T) < cheb(me, T) && previewMove(b, id, best.x, best.y)) return { a: 'move', x: best.x, y: best.y };
    }
  }
  // Rage ends unless you attacked or took damage: spend the Bonus Action to keep it.
  if (me.raging && !me.raging.kept && t.bonus && anyUp(b, me)) return { a: 'rage' };
  return { a: 'end' };
}

function canAttackSomeone(b, me) {
  return weaponOptions(b, me).length > 0;
}

// Chill Touch, Infernal Sting and the mummy's curse stop all healing for a while.
function cantHeal(b, F) { return b.effects.some((e) => e.type === 'grave' && e.target === F.id); }

// For a creature the AI plays: answer a pending prompt (Opportunity Attack or Shield).
export function aiReact(b) {
  const p = b.pending;
  if (!p) return null;
  if (p.kind === 'shield') return true;     // only asked when +5 AC would turn the hit into a miss
  if (p.kind === 'counter') return (SPELLS[p.spell]?.level || 0) >= 2;   // a 3rd-level slot isn't worth a 1st-level spell
  if (p.kind === 'smite') {
    // Smite on a Critical Hit, or when the target has enough Hit Points left to be worth a slot.
    const R = b.creatures[p.reactor], T = b.creatures[p.target];
    const pay = smitePay(b, R);
    return !!pay && !!T && (p.crit || pay.pay === 'free' || T.hp >= 6);
  }
  return true;
}

// The Coach: the same choice, explained in plain words for a player.
export function coach(b, id) {
  const intent = aiNext(b, id);
  if (!intent) return null;
  const me = b.creatures[id];
  const T = intent.target ? b.creatures[intent.target] : null;
  let text;
  switch (intent.a) {
    case 'attack': {
      const o = attackOptions(b, me, T).find((x) => x.atk.id === intent.attack);
      const pct = Math.round(o.p * 100);
      text = intent.offhand ? `Make the extra Light-weapon attack at ${T.name} with your ${o.atk.name}${me.twf ? '' : ' (no ability modifier to its damage)'}: ${pct}% to hit` : `Attack ${T.name} with your ${o.atk.name}: ${pct}% to hit`;
      if (o.mode === 'advantage') text += ', with Advantage';
      if (o.mode === 'disadvantage') text += ', but with Disadvantage';
      if (o.sneak) text += ', and Sneak Attack applies';
      if (o.cover) text += ` (${T.name} has Half Cover: +2 AC)`;
      text += '.';
      break;
    }
    case 'cast': {
      const s = SPELLS[intent.spell];
      const o = specialOptions(b, me).find((x) => x.intent.spell === intent.spell && x.intent.target === intent.target && x.intent.x === intent.x && x.intent.y === intent.y);
      const can = canCast(b, me, intent.spell);
      const lvl = s.level === 0 ? 'a cantrip, free to cast' : can.pay === 'free' ? (me.casting.known[intent.spell].perDay ? 'a daily use' : 'your free Magic Initiate cast') : `uses a level ${can.slot} spell slot`;
      const conc = s.conc ? ' It needs Concentration.' : '';
      if (s.kind === 'heal') text = `${T.name} needs help: cast ${s.name} (${lvl}${s.time === 'bonus' ? ', a Bonus Action' : ''}).`;
      else if (s.kind === 'stabilize') text = `${T.name} is dying! Cast ${s.name} to make them Stable (${lvl}).`;
      else if (s.kind === 'area') text = `Cast ${s.name} on the marked square: it catches ${(o?.why.foes || []).map((c) => c.name).join(' and ')} and none of your allies (${lvl}).${conc}`;
      else if (s.kind === 'temp') text = `Cast ${s.name} for Temporary Hit Points (${lvl}).`;
      else if (s.kind === 'armor') text = `Cast ${s.name} while nobody is next to you: AC 13 + DEX until your next Long Rest (${lvl}).`;
      else if (s.kind === 'save' && intent.targets?.length > 1) text = `Cast ${s.name} on ${intent.targets.map((x) => b.creatures[x]?.name).join(', ')}: each makes a DC ${o?.why.dc} ${s.save.toUpperCase()} save (${lvl}).`;
      else if (s.kind === 'save') text = `Cast ${s.name} on ${T.name}: it must beat DC ${o?.why.dc} on a ${s.save.toUpperCase()} save, so ${Math.round((o?.why.pFail || 0) * 100)}% it fails (${lvl}).`;
      else if (s.kind === 'word') text = `Speak ${s.name} at ${(intent.targets || []).map((x) => b.creatures[x]?.name).join(', ')} (${lvl}, a Bonus Action): on a failed Charisma save, the weakest die and the rest are Blinded or Stunned.`;
      else if (s.kind === 'pwstun') text = `Cast ${s.name} on ${T.name}: with ${T.hp} Hit Points it is Stunned, no save to stop it (${lvl}).`;
      else if (s.kind === 'missile') text = `Cast ${s.name} at ${T.name}: it never misses (${lvl}).`;
      else if (s.kind === 'buff') text = `Cast ${s.name} on your allies (${lvl}).${conc}`;
      else if (s.kind === 'cure' && intent.cond) text = `Cast ${s.name} to end ${T.name}'s ${intent.cond} condition (${lvl}).`;
      else if (s.kind === 'teleport') text = `You're in an enemy's reach: Misty Step away (${lvl}). Teleporting doesn't provoke Opportunity Attacks.`;
      else if (s.kind === 'spiritual') text = `Cast ${s.name} next to ${T.name} (${lvl}, a Bonus Action). It keeps attacking on later turns.${conc}`;
      else if (s.kind === 'area' && s.cond) text = `Cast ${s.name} on the marked square: ${(o?.why.foes || []).map((c) => c.name).join(' and ')} must save or be ${s.cond === 'sleep' ? 'Incapacitated, then Unconscious' : 'Restrained'} (${lvl}).${conc}`;
      else if (s.kind === 'mark') text = `Cast ${s.name} on ${T.name} (${lvl}, a Bonus Action): an extra ${s.dice} ${s.type} damage each time you hit it.${conc}`;
      else if (s.kind === 'selfbuff' && s.buff === 'fireshield') text = `Cast ${s.name} (${lvl}): Resistance to Cold, and 2d8 Fire damage to anything that hits you in melee.`;
      else if (s.kind === 'selfbuff' && s.buff === 'auralife') text = `Cast ${s.name} (${lvl}): you and your allies within 30 feet resist Necrotic damage, and a fallen ally there gets back up with 1 Hit Point on your turns.${conc}`;
      else if (s.kind === 'zone') text = intent.x == null ? `Cast ${s.name} around you (${lvl}).${conc}` : `Cast ${s.name} on the marked square: it catches ${(o?.why.foes || []).map((c) => c.name).join(' and ')} and none of your allies (${lvl}).${conc}`;
      else if (s.kind === 'hold') text = `Cast ${s.name} on ${T?.name}: ${Math.round((o?.why.pFail || 0) * 100)}% it fails its Wisdom save and is Paralyzed (${lvl}).${conc}`;
      else if (s.kind === 'cure' && !intent.cond) text = `Cast ${s.name} on ${T.name} to undo what's been drained from them (${lvl}).`;
      else if (s.kind === 'selfbuff') text = s.buff === 'favor' ? `Cast ${s.name} (${lvl}, a Bonus Action): +1d4 Radiant damage on your weapon hits for 1 minute.` : `Cast ${s.name} (${lvl}): attackers have Disadvantage against you.${conc}`;
      else if (s.kind === 'bane') text = `Cast ${s.name} on ${(intent.targets || []).map((x) => b.creatures[x]?.name).join(', ')}: on a failed Charisma save, they subtract 1d4 from attack rolls and saves (${lvl}).${conc}`;
      else if (s.kind === 'buff' && intent.targets?.length === 1 && s.buff !== 'bless') text = `Cast ${s.name} on ${b.creatures[intent.targets[0]]?.name} (${lvl}${s.time === 'bonus' ? ', a Bonus Action' : ''}).${conc}`;
      else if (s.kind === 'rays') text = `Cast ${s.name}: ${o?.why.n || 3} rays at ${T.name}, ${Math.round((o?.why.p || 0) * 100)}% each to hit (${lvl}).`;
      else if (!T) text = `Cast ${s.name} (${lvl}).${conc}`;
      else text = `Cast ${s.name} at ${T.name}: ${Math.round((o?.why.p || 0) * 100)}% to hit (${lvl}).`;
      break;
    }
    case 'breath': text = `Use your Breath Weapon as a ${intent.shape === 'line' ? '30-ft Line' : '15-ft Cone'}: it replaces one attack and catches everything in it.`; break;
    case 'move': {
      const near = enemiesOf(b, me).filter((e) => !incap(e)).sort((p, q) => cheb(p, intent) - cheb(q, intent))[0];
      const pv = previewMove(b, id, intent.x, intent.y);
      text = near && cheb(near, intent) <= 1 ? `Move next to ${near.name} (${pv?.feet ?? '?'} ft).` : `Move to the marked square (${pv?.feet ?? '?'} ft).`;
      if (me.ai === 'skirmisher' && near && cheb(near, intent) <= 1) text += ' A friend is next to it, so Sneak Attack will work.';
      break;
    }
    case 'stand': text = "You're Prone: stand up first (it costs half your Speed)."; break;
    case 'second-wind': text = "You're badly hurt: use Second Wind (Bonus Action) to heal."; break;
    case 'stabilize': text = `${T.name} is dying! Use your action to stabilize them (DC 10 Medicine).`; break;
    case 'nimble': case 'disengage': text = 'Disengage, then move away without provoking Opportunity Attacks.'; break;
    case 'dash': text = 'Dash to cover more ground.'; break;
    case 'surge': text = 'Use Action Surge: one more action this turn.'; break;
    case 'aim': text = "Use Steady Aim (Bonus Action): Advantage on your next attack, but you can't move this turn."; break;
    case 'cut': text = "You're caught in a web: attack it to break free (AC 10, 5 HP)."; break;
    case 'escape': text = "You're Grappled: use your action to escape (Athletics or Acrobatics)."; break;
    case 'spark': text = T.side === me.side ? `Use Divine Spark to heal ${T.name}.` : `Use Divine Spark on ${T.name}: Radiant damage, half on a Constitution save.`; break;
    case 'turn': text = 'Turn Undead: the Undead near you must flee.'; break;
    case 'preserve': text = 'Use Preserve Life to heal your Bloodied allies.'; break;
    case 'spiritual': text = `Your Spiritual Weapon attacks ${T.name} (Bonus Action).`; break;
    case 'web': text = `Web ${T.name}.`; break;
    case 'rage': text = me.raging ? 'Use your Bonus Action to keep raging: otherwise your Rage ends this turn, since you neither attacked nor took damage.' : 'Rage (Bonus Action): Resistance to Bludgeoning, Piercing and Slashing damage, and extra damage on Strength attacks.'; break;
    case 'reckless': text = 'Attack recklessly: Advantage on your Strength attacks this turn, but enemies get Advantage against you until your next turn.'; break;
    case 'inspire': text = `Give ${T.name} Bardic Inspiration (Bonus Action): a d${me.bardic.die} to add when one of their D20 Tests falls short.`; break;
    case 'shape': text = 'You have no spell slots left: use Wild Shape (Bonus Action) to become a Wolf and fight with its Bite.'; break;
    case 'unshape': text = 'Return to your normal form (Bonus Action).'; break;
    case 'landsaid': text = `Use Land's Aid on the marked square: Necrotic damage to enemies in it (half on a Constitution save), and a friend in it heals ${landsAidDice(me)}d6.`; break;
    case 'martial': text = `Make a Bonus Action Unarmed Strike at ${T.name} (Martial Arts).`; break;
    case 'flurry': text = `Spend 1 Focus Point on Flurry of Blows: ${me.level >= 10 ? 'three' : 'two'} Unarmed Strikes at ${T.name} as a Bonus Action.`; break;
    case 'patient': case 'stepwind': text = intent.a === 'patient' ? 'Use Patient Defense (Bonus Action).' : 'Use Step of the Wind (Bonus Action).'; break;
    case 'intimidate': text = 'Use Intimidating Presence (Bonus Action): enemies within 30 feet make a Wisdom save or are Frightened of you.'; break;
    case 'veil': text = "Use Nature's Veil (Bonus Action): Invisible until the end of your next turn, so your attacks have Advantage."; break;
    case 'sanctuary': text = `Use Nature's Sanctuary (a Magic action and a use of Wild Shape) around ${T?.name || 'your friends'}: Half Cover for everyone of yours inside.`; break;
    case 'fleet': text = 'Use Fleet Step (1 Focus Point): Disengage and Dash right after the Flurry, and get out of reach.'; break;
    case 'lay': text = intent.cure ? `Use Lay on Hands to end ${T.name}'s condition (5 from the pool each).` : `${T.name} needs help: use Lay on Hands (Bonus Action) to restore ${intent.amount} Hit Points.`; break;
    case 'sacred': text = 'Use Channel Divinity: Sacred Weapon as you attack: your Charisma modifier is added to your melee attack rolls.'; break;
    case 'remark': text = `Your mark's creature is down: move it to ${T.name} (Bonus Action).`; break;
    case 'innate': text = 'Use Innate Sorcery (Bonus Action): +1 to your spell save DC and Advantage on your Sorcerer spell attacks for 1 minute.'; break;
    case 'wholeness': text = `Use Wholeness of Body (Bonus Action): heal 1d${String(me.martialDie || '1d6').split('d')[1]} + your Wisdom modifier.`; break;
    case 'tireless': text = 'Use Tireless (Magic action): 1d8 + your Wisdom modifier in Temporary Hit Points.'; break;
    case 'abjure': text = `Use Channel Divinity: Abjure Foes on ${(intent.targets || []).map((x) => b.creatures[x]?.name).join(', ')}. On a failed Wisdom save, each is Frightened until it takes damage.`; break;
    case 'font': text = 'Use Font of Magic to trade Sorcery Points and spell slots.'; break;
    case 'exhale': text = "Exhale your Dragon's Breath at the marked square: a 15-foot Cone, half damage on a Dexterity save."; break;
    case 'end': text = "You've done what you can: end your turn."; break;
    default: text = '';
  }
  return { intent, text };
}

export { onBoard, key, pathFrom, seenBy };
