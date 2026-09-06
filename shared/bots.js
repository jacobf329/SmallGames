// Bot runners. They fill empty slots so a race always feels like a race, and
// they drive with the exact same inputs a phone sends.

import * as C from './constants.js';
import { OB, PICK } from './constants.js';
import { laneX, laneCount } from './track.js';
import { ITEM } from './items.js';

const BOT_NAMES = [
  'Rusty', 'Blip', 'Nova', 'Zigzag', 'Turbo Ted', 'Mika', 'Cinder', 'Pip',
  'Gravel', 'Wisp', 'Bolty', 'Dash', 'Juno', 'Kip', 'Ember', 'Static'
];

export function botName(i) {
  return BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? ' ' + (1 + Math.floor(i / BOT_NAMES.length)) : '');
}

export function initBot(p, skill = 0.75) {
  p.ai = {
    skill,
    react: 0.55 + skill * 0.45,          // fraction of the ideal reaction window
    laneCooldown: 0,
    itemDelay: 0.4 + Math.random() * 1.6,
    daring: skill * 0.9 + Math.random() * 0.2,   // willingness to take shortcuts
    jitter: (1 - skill) * 0.5
  };
  p.speedBias = (skill - 0.72) * 4.0;
}

export function driveBot(p, track, world, dt) {
  const ai = p.ai;
  if (!ai || p.finished) return;
  ai.laneCooldown = Math.max(0, ai.laneCooldown - dt);
  ai.itemDelay = Math.max(0, ai.itemDelay - dt);

  const lanes = laneCount(p.path);
  const look = 9 + p.speed * 1.15;
  const ents = track.near(p.z - 1, p.z + look, p.path);

  // --- pick the safest lane ------------------------------------------------
  const score = new Array(lanes).fill(0);
  for (let l = 0; l < lanes; l++) {
    score[l] = Math.abs(l - p.lane) * 0.9;                 // moving costs something
    if (l === p.lane) score[l] -= 0.6;
  }
  for (const e of ents) {
    if (e.lane < 0 || e.lane >= lanes) continue;
    const dz = e.z - p.z;
    if (dz < -e.len) continue;
    const near = 1 - Math.min(1, dz / look);
    if (e.kind === PICK.COIN) { if (!p.taken.has(e.id)) score[e.lane] -= 0.30 * near; continue; }
    if (e.kind === PICK.BOX) { if (!p.taken.has(e.id) && !p.item) score[e.lane] -= 2.4 * near; continue; }
    if (e.type === OB.PAD) { score[e.lane] -= 1.6 * near; continue; }
    if (e.type === OB.RAMP) continue;
    if (e.type === OB.BLOCK) score[e.lane] += 14 * near;
    else if (e.type === OB.HIGHBAR) score[e.lane] += 4.5 * near;
    else score[e.lane] += 3.5 * near;                       // barrier / cone: jumpable
  }
  // Neighbouring blocked lanes are risky to squeeze past.
  let best = p.lane;
  for (let l = 0; l < lanes; l++) {
    const s = score[l] + (Math.random() - 0.5) * ai.jitter * 2;
    if (s < score[best] - 0.15) best = l;
  }
  if (ai.laneCooldown <= 0 && best !== p.targetLane) {
    p.input.lane = best;
    ai.laneCooldown = 0.12 + (1 - ai.skill) * 0.3;
  }

  // --- shortcut temptation -------------------------------------------------
  const sc = track.shortcutAt(p.z + 30);
  if (p.path === 0 && sc && ai.daring > 0.55 && p.z > sc.entryZ - 34 && p.z < sc.entryZ + 8) {
    p.input.lane = sc.entryLane;
  }

  // --- jump / slide --------------------------------------------------------
  const lane = p.input.lane ?? p.targetLane;
  let threat = null;
  for (const e of ents) {
    if (e.kind !== 'obstacle' || e.lane !== lane) continue;
    if (e.type === OB.PAD) continue;
    const dz = e.z - p.z;
    if (dz < 0) continue;
    if (!threat || dz < threat.dz) threat = { e, dz };
  }
  if (threat) {
    const ttc = threat.dz / Math.max(6, p.speed * (p.path === 1 ? C.SHORTCUT_FACTOR : 1));
    const t = threat.e.type;
    if (t === OB.RAMP && p.path === 0 && sc && p.targetLane === sc.entryLane && ai.daring > 0.55) {
      // let the ramp do the work
    } else if ((t === OB.BARRIER || t === OB.CONE) && p.grounded && ttc < 0.33 * ai.react + 0.12 && ttc > 0.05) {
      p.input.jump = true;
    } else if (t === OB.HIGHBAR && p.grounded && ttc < 0.35 * ai.react + 0.1) {
      p.input.slide = true;
    }
  }

  // --- items ---------------------------------------------------------------
  if (p.item && ai.itemDelay <= 0) {
    const ahead = world.players.filter(o => o !== p && !o.finished && o.z > p.z);
    const behind = world.players.filter(o => o !== p && !o.finished && o.z < p.z && p.z - o.z < 30);
    let fire = false;
    switch (p.item) {
      case ITEM.SHELL: fire = ahead.some(o => o.z - p.z < 90); break;
      case ITEM.BANANA: fire = behind.length > 0 || Math.random() < 0.02; break;
      case ITEM.BOLT: fire = ahead.length > 0; break;
      case ITEM.SHIELD: fire = true; break;
      default: fire = true;
    }
    if (fire) {
      p.input.use = true;
      ai.itemDelay = 0.6 + Math.random() * 1.4;
    }
  }
}
