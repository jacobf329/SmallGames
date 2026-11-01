// Skyline Hustle - the game clock: advances the simulation, lets the rivals
// think and opens auctions on schedule. This is what the UI and the
// headless tests call.

import { stepHour } from './sim.js';
import { aiHour, aiDay } from './ai.js';
import { aiCallAuctions } from './auction.js';

export const HOOKS = {
  onHour(s) { aiHour(s); aiCallAuctions(s); },
  onDay: aiDay,
};

// Advances by a (fractional) number of game hours. Stops early when a live
// auction opens: the clock waits for the hammer. Returns whole hours run.
export function advanceGame(s, hours) {
  if (s.auction || s.over) return 0;
  s.t += hours;
  let steps = 0;
  while (s.t >= 1 && !s.over && !s.auction && steps < 48) {
    s.t -= 1; steps++;
    stepHour(s, HOOKS);
  }
  if (s.auction || steps >= 48) s.t = Math.min(s.t, 0.95);
  return steps;
}
