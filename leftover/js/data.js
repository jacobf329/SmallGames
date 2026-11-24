// Leftover Uprising - every tuning number and table: the kitchen map, the
// tower trees, the food, and how hard the waves get. The host, the phones and
// the balance test all read this one file, so nothing drifts out of sync.
// Art is placeholder (emoji + shapes); `icon` fields are what the renderer draws.

export const TICK = 30;              // simulation steps per second (host)
export const SNAP_RATE = 10;         // snapshots per second to phones
export const MAX_PLAYERS = 8;
export const WAVES = 30;             // the "campaign"; endless after that
export const COLORS = ['#ff5a5f', '#3fa7ff', '#ffd23f', '#3ddc84', '#c77dff', '#ff9f1c', '#2ec4b6', '#f15bb5'];

export const DIFFICULTY = {
  easy:   { label: 'Easy',   hp: 0.75, lives: 40, gold: 1.2 },
  normal: { label: 'Normal', hp: 1.0,  lives: 30, gold: 1.0 },
  hard:   { label: 'Hard',   hp: 1.3,  lives: 20, gold: 0.9 },
};

// ------------------------------------------------------------------ map ----
// The kitchen, in tiles. Food comes in at up to three doors and heads for the
// back door at the bottom. Which doors are open depends on the team size.
export const COLS = 13;
export const ROWS = 21;
export const PATHS = [
  { door: 'Fridge',      minPlayers: 1, pts: [[2, -1], [2, 3], [8, 3], [8, 6], [3, 6], [3, 10], [6, 10], [6, 13], [10, 13], [10, 17], [6, 17], [6, 21]] },
  { door: 'Pantry',      minPlayers: 2, pts: [[10, -1], [10, 9], [8, 9], [8, 13], [10, 13], [10, 17], [6, 17], [6, 21]] },
  { door: 'Side door',   minPlayers: 5, pts: [[-1, 14], [2, 14], [2, 17], [6, 17], [6, 21]] },
];
export const doorsFor = n => PATHS.map((p, i) => (n >= p.minPlayers ? i : -1)).filter(i => i >= 0);

// Path geometry: segment lengths so anything can turn "distance along the
// path" into a point. Tile centres are at +0.5.
export const PATH_GEO = PATHS.map(p => {
  const segs = [];
  let total = 0;
  for (let i = 1; i < p.pts.length; i++) {
    const [ax, ay] = p.pts[i - 1], [bx, by] = p.pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    segs.push({ ax: ax + 0.5, ay: ay + 0.5, bx: bx + 0.5, by: by + 0.5, len, at: total });
    total += len;
  }
  return { segs, total };
});
export function pathPoint(pi, d) {
  const g = PATH_GEO[pi];
  if (d <= 0) { const s = g.segs[0]; return [s.ax, s.ay]; }
  for (const s of g.segs) {
    if (d <= s.at + s.len) { const f = (d - s.at) / s.len; return [s.ax + (s.bx - s.ax) * f, s.ay + (s.by - s.ay) * f]; }
  }
  const s = g.segs[g.segs.length - 1];
  return [s.bx, s.by];
}

// Which tiles are path (for all doors, so the map looks the same whatever the
// team size; closed doors just stay quiet).
export const PATH_TILES = (() => {
  const set = new Set();
  for (const p of PATHS) for (let i = 1; i < p.pts.length; i++) {
    let [x, y] = p.pts[i - 1]; const [bx, by] = p.pts[i];
    const dx = Math.sign(bx - x), dy = Math.sign(by - y);
    for (;;) { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) set.add(x + ',' + y); if (x === bx && y === by) break; x += dx; y += dy; }
  }
  return set;
})();
export const buildable = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !PATH_TILES.has(x + ',' + y);

// ------------------------------------------------------- damage + trees ----
// Damage types. Food resists or is weak to each.
export const DTYPES = ['basic', 'heat', 'chop', 'cold', 'sticky'];
export const TREES = {
  heat:    { name: 'Heat',    color: '#ff6b35', icon: '🔥', blurb: 'Burns, splash, hits fliers. Stops regrowth.' },
  chop:    { name: 'Chop',    color: '#d0d6e0', icon: '🔪', blurb: 'Big single hits that cut through armour. Ground only.' },
  cold:    { name: 'Cold',    color: '#6fd3ff', icon: '❄️', blurb: 'Slows and freezes. Frozen food shatters under Chop.' },
  sticky:  { name: 'Sticky',  color: '#e0a040', icon: '🍯', blurb: 'Syrup slows the crowd. Heat turns syrup to caramel.' },
  service: { name: 'Service', color: '#7ee081', icon: '💰', blurb: 'Earns gold and boosts nearby towers of OTHER trees.' },
};
export const TREE_IDS = Object.keys(TREES);

// Mastery: gold a player has spent in a tree. Higher mastery = cheaper and
// stronger towers in that tree, and the top tiers need it.
export const MASTERY_STEPS = [0, 150, 650, 1400, 2600];
export const masteryLevel = spent => { let l = 0; for (let i = 1; i < MASTERY_STEPS.length; i++) if (spent >= MASTERY_STEPS[i]) l = i; return l; };
export const MASTERY_DISCOUNT = 0.04;    // per level, on that tree's upgrades
export const MASTERY_POWER = 0.06;       // per level, on that tree's damage

// Tower kinds. `next` lists what it can upgrade into. `req` = mastery level
// needed in the tree. Ranges in tiles, rate in attacks per second.
//   aura: hits everything in range each attack (no projectile)
//   splash: radius around the target
//   burn {dps,t}, slow {f,t}, freeze t, stun t, sticky t, pierce (ignores armour)
//   income: gold per wave cleared; buff: damage bonus to other-tree towers in range
const T = {};
T.prep = { name: 'Prep Station', tree: null, tier: 0, cost: 50, icon: '🍽️', range: 2.3, rate: 1.4, dmg: 7, dtype: 'basic', air: true,
  desc: 'A blank counter. Upgrade it into any tree.', next: ['grill', 'cleaver', 'vent', 'syrup', 'tipjar'] };

T.grill  = { name: 'Grill', tree: 'heat', tier: 1, cost: 70, icon: '🔥', range: 2.4, rate: 1.2, dmg: 11, dtype: 'heat', air: true, burn: { dps: 8, t: 2 }, next: ['grill2'] };
T.grill2 = { name: 'Searing Grill', tree: 'heat', tier: 2, cost: 110, icon: '🔥', range: 2.5, rate: 1.25, dmg: 18, dtype: 'heat', air: true, burn: { dps: 14, t: 2 }, next: ['grill3'] };
T.grill3 = { name: 'Char Grill', tree: 'heat', tier: 3, req: 1, cost: 180, icon: '🔥', range: 2.6, rate: 1.3, dmg: 28, dtype: 'heat', air: true, splash: 0.7, burn: { dps: 22, t: 2 }, next: ['wok', 'oven'] };
T.wok    = { name: 'Flame Wok', tree: 'heat', tier: 4, req: 2, cost: 340, icon: '🥘', range: 1.9, rate: 3, dmg: 14, dtype: 'heat', air: true, splash: 1.0, burn: { dps: 38, t: 2 },
  desc: 'Short range, sprays fire over the whole crowd.', next: [] };
T.oven   = { name: 'Pizza Oven', tree: 'heat', tier: 4, req: 2, cost: 380, icon: '♨️', range: 4.2, rate: 0.4, dmg: 160, dtype: 'heat', air: true, splash: 1.3, burn: { dps: 25, t: 3 },
  desc: 'Long range fireballs with a big splash.', next: [] };

T.cleaver  = { name: 'Cleaver', tree: 'chop', tier: 1, cost: 70, icon: '🔪', range: 1.8, rate: 0.9, dmg: 24, dtype: 'chop', air: false, next: ['cleaver2'] };
T.cleaver2 = { name: "Chef's Knife", tree: 'chop', tier: 2, cost: 110, icon: '🔪', range: 1.9, rate: 0.95, dmg: 42, dtype: 'chop', air: false, next: ['cleaver3'] };
T.cleaver3 = { name: 'Santoku', tree: 'chop', tier: 3, req: 1, cost: 180, icon: '🔪', range: 2.0, rate: 1.0, dmg: 68, dtype: 'chop', air: false, next: ['blender', 'mallet'] };
T.blender  = { name: 'Blender', tree: 'chop', tier: 4, req: 2, cost: 340, icon: '🌀', range: 1.4, rate: 2, dmg: 38, dtype: 'chop', air: false, aura: true,
  desc: 'Shreds every ground food in reach, all at once.', next: [] };
T.mallet   = { name: 'Meat Tenderizer', tree: 'chop', tier: 4, req: 2, cost: 380, icon: '🔨', range: 2.1, rate: 0.5, dmg: 280, dtype: 'chop', air: false, pierce: true, stun: 0.4, splash: 0.6,
  desc: 'Huge hits that ignore armour and stun.', next: [] };

T.vent  = { name: 'Freezer Vent', tree: 'cold', tier: 1, cost: 70, icon: '❄️', range: 2.3, rate: 1.0, dmg: 4, dtype: 'cold', air: true, slow: { f: 0.6, t: 1.5 }, next: ['vent2'] };
T.vent2 = { name: 'Chill Blaster', tree: 'cold', tier: 2, cost: 110, icon: '❄️', range: 2.4, rate: 1.0, dmg: 7, dtype: 'cold', air: true, slow: { f: 0.5, t: 1.8 }, splash: 0.6, next: ['vent3'] };
T.vent3 = { name: 'Deep Freezer', tree: 'cold', tier: 3, req: 1, cost: 180, icon: '❄️', range: 2.5, rate: 0.9, dmg: 12, dtype: 'cold', air: true, slow: { f: 0.45, t: 2 }, splash: 0.9, freeze: 0.5, next: ['icecream', 'nitro'] };
T.icecream = { name: 'Soft-Serve Machine', tree: 'cold', tier: 4, req: 2, cost: 340, icon: '🍦', range: 1.8, rate: 0.5, dmg: 16, dtype: 'cold', air: true, aura: true, freeze: 0.9, slow: { f: 0.5, t: 2.5 },
  desc: 'Pulses a freeze over everything nearby.', next: [] };
T.nitro    = { name: 'Liquid Nitrogen', tree: 'cold', tier: 4, req: 2, cost: 380, icon: '🧪', range: 3.6, rate: 0.6, dmg: 45, dtype: 'cold', air: true, freeze: 2.2,
  desc: 'Freezes one target solid. Chop shatters it.', next: [] };

T.syrup  = { name: 'Syrup Pump', tree: 'sticky', tier: 1, cost: 60, icon: '🍯', range: 2.4, rate: 0.8, dmg: 3, dtype: 'sticky', air: false, splash: 0.8, sticky: 2.5, next: ['syrup2'] };
T.syrup2 = { name: 'Maple Mortar', tree: 'sticky', tier: 2, cost: 100, icon: '🍯', range: 2.6, rate: 0.85, dmg: 6, dtype: 'sticky', air: false, splash: 1.0, sticky: 3, next: ['syrup3'] };
T.syrup3 = { name: 'Molasses Cannon', tree: 'sticky', tier: 3, req: 1, cost: 160, icon: '🍯', range: 2.8, rate: 0.9, dmg: 10, dtype: 'sticky', air: false, splash: 1.2, sticky: 3.5, next: ['gum', 'grater'] };
T.gum    = { name: 'Gum Trap', tree: 'sticky', tier: 4, req: 2, cost: 300, icon: '🫧', range: 2.8, rate: 0.6, dmg: 14, dtype: 'sticky', air: false, splash: 1.3, sticky: 4, stun: 1.0,
  desc: 'Glues a whole group in place for a moment.', next: [] };
T.grater = { name: 'Cheese Grater', tree: 'sticky', tier: 4, req: 2, cost: 320, icon: '🧀', range: 1.6, rate: 2, dmg: 22, dtype: 'chop', air: false, aura: true, sticky: 2,
  desc: 'Grinds and gums up all ground food in reach.', next: [] };

T.tipjar  = { name: 'Tip Jar', tree: 'service', tier: 1, cost: 70, icon: '💰', range: 2.0, rate: 0, dmg: 0, income: 20, buff: 0.10, next: ['tipjar2'] };
T.tipjar2 = { name: 'Bus Station', tree: 'service', tier: 2, cost: 110, icon: '💰', range: 2.2, rate: 0, dmg: 0, income: 35, buff: 0.15, next: ['tipjar3'] };
T.tipjar3 = { name: 'Head Waiter', tree: 'service', tier: 3, req: 1, cost: 170, icon: '🛎️', range: 2.4, rate: 0, dmg: 0, income: 50, buff: 0.22, haste: 0.08, next: ['waiter', 'register'] };
T.waiter   = { name: 'Waiter Station', tree: 'service', tier: 4, req: 2, cost: 320, icon: '🛎️', range: 2.8, rate: 0, dmg: 0, income: 55, buff: 0.38, haste: 0.18,
  desc: 'Big damage and speed boost for other trees nearby.', next: [] };
T.register = { name: 'Cash Register', tree: 'service', tier: 4, req: 2, cost: 340, icon: '💵', range: 2.0, rate: 0, dmg: 0, income: 70, teamIncome: 45, buff: 0.15,
  desc: 'Pays you, and every teammate, each wave.', next: [] };

for (const [id, t] of Object.entries(T)) { t.id = id; t.ground = true; }
export const TOWERS = T;
export const TOWER_IDS = Object.keys(T);
export const SELL_BACK = 0.7;

// ------------------------------------------------------------------ food ----
// hp, speed (tiles/s), bounty (gold), leak (lives lost if it escapes),
// armour (flat damage off each hit), res {dtype: multiplier}, regen (hp/s,
// stopped while burning), air, frozen (immune to slow/freeze), greasy (immune
// to sticky), split {into, n}, fam (family the director thinks in), cost
// (director budget points).
const E = {};
E.pea        = { name: 'Pea',            icon: '🟢', size: 0.32, hp: 22,  speed: 1.3,  bounty: 2,  leak: 1, fam: 'horde', cost: 2 };
E.grape      = { name: 'Grape',          icon: '🍇', size: 0.38, hp: 34,  speed: 1.45, bounty: 2,  leak: 1, fam: 'horde', cost: 3 };
E.meatball   = { name: 'Meatball',       icon: '🧆', size: 0.48, hp: 95,  speed: 0.95, bounty: 5,  leak: 1, fam: 'tank', cost: 6 };
E.drumstick  = { name: 'Drumstick',      icon: '🍗', size: 0.6,  hp: 420, speed: 0.65, bounty: 16, leak: 2, fam: 'tank', cost: 22 };
E.broccoli   = { name: 'Broccoli',       icon: '🥦', size: 0.55, hp: 120, speed: 0.85, bounty: 5,  leak: 2, fam: 'splitter', split: { into: 'floret', n: 3 }, cost: 12 };
E.floret     = { name: 'Floret',         icon: '🥦', size: 0.3,  hp: 30,  speed: 1.35, bounty: 1,  leak: 1, fam: 'splitter', cost: 2 };
E.celery     = { name: 'Celery',         icon: '🥬', size: 0.5,  hp: 150, speed: 0.9,  bounty: 7,  leak: 1, fam: 'armoured', armour: 8, cost: 12 };
E.coconut    = { name: 'Coconut',        icon: '🥥', size: 0.58, hp: 280, speed: 0.6,  bounty: 14, leak: 2, fam: 'armoured', armour: 18, res: { chop: 1.2 }, cost: 24 };
E.popcorn    = { name: 'Popcorn',        icon: '🍿', size: 0.38, hp: 36,  speed: 1.6,  bounty: 3,  leak: 1, fam: 'flying', air: true, res: { heat: 1.4 }, cost: 4 };
E.cottoncandy= { name: 'Cotton Candy',   icon: '🍭', size: 0.5,  hp: 130, speed: 1.0,  bounty: 7,  leak: 1, fam: 'flying', air: true, res: { cold: 0.5, heat: 1.3 }, cost: 12 };
E.icecream   = { name: 'Ice Cream',      icon: '🍨', size: 0.5,  hp: 160, speed: 0.9,  bounty: 7,  leak: 1, fam: 'frozen', frozen: true, res: { cold: 0, heat: 2, chop: 0.8 }, cost: 12 };
E.frozenpeas = { name: 'Frozen Peas',    icon: '🧊', size: 0.36, hp: 34,  speed: 1.3,  bounty: 2,  leak: 1, fam: 'frozen', frozen: true, res: { cold: 0, heat: 1.6 }, cost: 3 };
E.jelly      = { name: 'Jelly',          icon: '🍮', size: 0.5,  hp: 170, speed: 0.85, bounty: 7,  leak: 1, fam: 'regen', regen: 20, res: { chop: 0.55, basic: 0.7 }, cost: 13 };
E.sourdough  = { name: 'Sourdough',      icon: '🍞', size: 0.6,  hp: 400, speed: 0.6,  bounty: 15, leak: 2, fam: 'regen', regen: 32, res: { chop: 0.7 }, cost: 24 };
E.chili      = { name: 'Chili',          icon: '🌶️', size: 0.42, hp: 75,  speed: 2.2,  bounty: 5,  leak: 1, fam: 'heatproof', res: { heat: 0.1, cold: 1.4 }, cost: 8 };
E.watermelon = { name: 'Watermelon',     icon: '🍉', size: 0.62, hp: 380, speed: 0.6,  bounty: 12, leak: 2, fam: 'heatproof', armour: 10, res: { heat: 0.35 }, split: { into: 'melonslice', n: 3 }, cost: 30 };
E.melonslice = { name: 'Melon Slice',    icon: '🍉', size: 0.36, hp: 60,  speed: 1.2,  bounty: 2,  leak: 1, fam: 'heatproof', res: { heat: 0.5 }, cost: 4 };
E.bacon      = { name: 'Bacon',          icon: '🥓', size: 0.48, hp: 115, speed: 1.4,  bounty: 6,  leak: 1, fam: 'greasy', greasy: true, res: { heat: 1.3, sticky: 0 }, cost: 10 };
// Bosses
E.cake       = { name: 'Wedding Cake',   icon: '🎂', size: 0.95, hp: 5200, speed: 0.38, bounty: 120, leak: 8, fam: 'boss', boss: true, armour: 6, split: { into: 'cake2', n: 2 }, cost: 0 };
E.cake2      = { name: 'Cake Tier',      icon: '🍰', size: 0.7,  hp: 1300, speed: 0.5, bounty: 30, leak: 4, fam: 'boss', armour: 4, split: { into: 'cupcake', n: 3 }, cost: 0 };
E.cupcake    = { name: 'Cupcake',        icon: '🧁', size: 0.42, hp: 160,  speed: 1.1, bounty: 4,  leak: 1, fam: 'boss', cost: 0 };
E.turkey     = { name: 'Roast Turkey',   icon: '🦃', size: 1.0,  hp: 14000, speed: 0.32, bounty: 250, leak: 12, fam: 'boss', boss: true, armour: 22, regen: 45, res: { heat: 0.2 }, cost: 0 };
E.pizza      = { name: 'Giant Pizza',    icon: '🍕', size: 1.1,  hp: 16000, speed: 0.3, bounty: 400, leak: 20, fam: 'boss', boss: true, armour: 12, split: { into: 'slice', n: 8 }, cost: 0 };
E.slice      = { name: 'Pizza Slice',    icon: '🍕', size: 0.55, hp: 700, speed: 0.75, bounty: 20, leak: 3, fam: 'boss', armour: 6, split: { into: 'crust', n: 2 }, cost: 0 };
E.crust      = { name: 'Crust',          icon: '🥖', size: 0.4,  hp: 220,  speed: 1.1, bounty: 4,  leak: 1, fam: 'boss', cost: 0 };
for (const [id, e] of Object.entries(E)) { e.id = id; e.res = e.res || {}; e.armour = e.armour || 0; }
export const ENEMIES = E;
export const ENEMY_IDS = Object.keys(E);

// ------------------------------------------------------------- director ----
// Families, which wave they first turn up, and who they're made of
// (weights). The director builds each wave from a handful of families.
export const FAMILIES = {
  horde:     { from: 1,  members: { pea: 3, grape: 2 } },
  tank:      { from: 2,  members: { meatball: 3, drumstick: 1 } },
  splitter:  { from: 4,  members: { broccoli: 1 } },
  fast:      { from: 5,  members: { chili: 1, grape: 1 } },
  armoured:  { from: 6,  members: { celery: 3, coconut: 1 } },
  flying:    { from: 7,  members: { popcorn: 3, cottoncandy: 1 } },
  regen:     { from: 9,  members: { jelly: 3, sourdough: 1 } },
  frozen:    { from: 11, members: { icecream: 2, frozenpeas: 3 } },
  heatproof: { from: 13, members: { chili: 2, watermelon: 1 } },
  greasy:    { from: 15, members: { bacon: 1 } },
};
// The beefy members hold off until the team has had time to grow.
export const MEMBER_FROM = { drumstick: 6, coconut: 9, cottoncandy: 10, sourdough: 12, watermelon: 15 };
// Late waves upgrade members to the beefier version.
export const FAMILY_LATE = { horde: { meatball: 1 }, armoured: { coconut: 2 }, flying: { cottoncandy: 2 }, regen: { sourdough: 2 } };

// When the team leans on one damage type, the food sends what shrugs it off.
// Each entry: families that counter it, and the warning the phones show.
export const COUNTERS = {
  heat:   { fams: ['heatproof'], warn: 'The spice rack is restless. Heat-proof food incoming!' },
  chop:   { fams: ['flying', 'regen'], warn: 'Popcorn is popping. Knives can’t reach what flies!' },
  cold:   { fams: ['frozen'], warn: 'The freezer door creaks open. Frozen food shrugs off the cold!' },
  sticky: { fams: ['greasy', 'flying'], warn: 'Something greasy is sizzling. Syrup won’t stick to it!' },
  basic:  { fams: ['armoured'], warn: 'Coconuts are rolling in. Plain prep work won’t crack them!' },
};

export const BOSSES = { 10: 'cake', 20: 'turkey', 30: 'pizza' };
export const BOSS_INTRO = {
  cake: 'The Wedding Cake has left the reception. Three tiers, zero manners.',
  turkey: 'The Roast Turkey is up. It’s already cooked, so heat barely tickles it.',
  pizza: 'The Giant Pizza is here. Every slice you cut off keeps coming.',
};

// How the team size changes things.
export function teamScale(n) {
  n = Math.max(1, n);
  return {
    count: n === 1 ? 0.8 : 0.25 + 0.75 * n,     // enemy numbers (and boss hp)
    bossHp: n === 1 ? 0.55 : 0.4 + 0.6 * n,  // boss (and boss-spawn) toughness
    families: n === 1 ? 1 : n <= 4 ? 2 : 3,     // distinct families per wave, before wave bonuses
    adapt: n === 1 ? 0.25 : n <= 4 ? 1 : 1.6,   // how hard the food reacts to a monoculture
    pay: n === 1 ? 1.3 : 1.05 / (0.25 + 0.75 * n), // per-player share of each bounty
  };
}
export const waveBudget = w => (26 + 9 * w) * Math.pow(1.085, w) * (w <= 3 ? 0.8 : 1);
export const waveHpMult = w => 1 + Math.max(0, w - 12) * 0.045 + Math.max(0, w - WAVES) * 0.08;

export const START_GOLD = 220;
export const WAVE_BONUS = w => 40 + 4 * w;
export const BUILD_TIME = w => (w === 1 ? 40 : 22);   // seconds between waves
export const EARLY_BONUS = 2;                         // gold per second skipped, per player
export const MAX_TOWERS = n => Math.max(8, Math.min(40, Math.floor(180 / n)));
