// Blockout Arena - bots. They drive the same input a phone sends: a stick,
// a view direction, jump and fire. Skill sets how fast and how well they aim.

import { OPEN } from './map.js';
import { canSee, eye } from './sim.js';
import { BODY_Y, RANGE } from './consts.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function thinkBot(bot, players, dt, skill) {
  const inp = bot.input;
  const b = bot.brain ||= { goal: null, strafe: 1, strafeT: 0, stuckT: 0, lastX: bot.x, lastZ: bot.z, seeT: 0, target: null, retargetT: 0 };
  inp.fire = false;
  if (!bot.alive) { b.goal = null; return; }

  // Pick the nearest enemy in sight now and then.
  b.retargetT -= dt;
  if (b.retargetT <= 0) {
    b.retargetT = 0.35;
    let best = null, bd = Infinity;
    for (const q of players) {
      if (q === bot || !q.alive || q.shieldT > 0) continue;
      const d = Math.hypot(q.x - bot.x, q.z - bot.z);
      if (d < bd && d < RANGE * 0.8 && canSee(bot, q)) { bd = d; best = q; }
    }
    if (best !== b.target) b.seeT = 0;
    b.target = best;
  }
  const t = b.target && b.target.alive ? b.target : null;

  // Wander between open cells when nobody is around; strafe in a fight.
  if (!b.goal || Math.hypot(b.goal.x - bot.x, b.goal.z - bot.z) < 1.5) b.goal = OPEN[Math.floor(Math.random() * OPEN.length)];
  let mx = 0, mz = 0, lookYaw = inp.yaw, lookPitch = 0;
  const toGoal = Math.atan2(-(b.goal.x - bot.x), -(b.goal.z - bot.z));
  if (t) {
    b.seeT += dt;
    const e = eye(bot), dx = t.x - e.x, dy = t.y + BODY_Y - e.y, dz = t.z - e.z, dist = Math.hypot(dx, dz);
    lookYaw = Math.atan2(-dx, -dz);
    lookPitch = Math.atan2(dy, dist);
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.6 + Math.random() * 1.2; }
    mx = b.strafe;
    mz = dist > 16 ? 1 : dist < 6 ? -0.6 : 0;
  } else {
    lookYaw = toGoal;
    mz = 1;
  }

  // Turn toward where they want to look, at a rate set by skill, with a
  // little wobble so they miss sometimes.
  const turn = (2.5 + 5 * skill) * dt;
  const dyaw = wrap(lookYaw - inp.yaw);
  inp.yaw = wrap(inp.yaw + Math.max(-turn, Math.min(turn, dyaw)));
  inp.pitch += Math.max(-turn, Math.min(turn, lookPitch - inp.pitch));
  const wobble = (1 - skill) * 0.05;
  inp.yaw += (Math.random() - 0.5) * wobble;
  inp.pitch += (Math.random() - 0.5) * wobble;

  // Move relative to where they face (the stick is local, like a phone).
  if (!t) {
    const rel = wrap(toGoal - inp.yaw);
    mx = -Math.sin(rel); mz = Math.cos(rel);
  }
  inp.mx = mx; inp.mz = mz;

  // Fire once on target for a moment (reaction time).
  if (t && Math.abs(wrap(lookYaw - inp.yaw)) < 0.05 + 0.04 * (1 - skill) && b.seeT > 0.45 - 0.25 * skill) inp.fire = true;
  if (bot.ammo <= 0) inp.reload = true;

  // Stuck against something: hop and pick somewhere else.
  const moved = Math.hypot(bot.x - b.lastX, bot.z - b.lastZ);
  b.lastX = bot.x; b.lastZ = bot.z;
  b.stuckT = moved < 0.6 * dt && (mx || mz) ? b.stuckT + dt : 0;
  if (b.stuckT > 0.5) { inp.jump = true; b.goal = null; b.stuckT = 0; }
}
