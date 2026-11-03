// Blockout Arena - every tuning number in one place.

export const TICK = 60;                 // simulation steps per second
export const SNAP_RATE = 20;            // snapshots per second from the host
export const INPUT_RATE = 30;           // inputs per second from each phone
export const MAX_PLAYERS = 8;

export const CELL = 2;                  // metres per map cell
export const GRAVITY = 22;
export const JUMP_V = 7.2;              // reaches about 1.2 m: onto crates
export const RUN_SPEED = 7.0;
export const ACCEL = 60;
export const AIR_ACCEL = 18;
export const FRICTION = 12;
export const STEP_UP = 0.55;            // stairs and half-crates climb by themselves
export const RADIUS = 0.38;
export const HEIGHT = 1.75;
export const EYE = 1.55;

export const MAX_HP = 100;
export const RESPAWN = 3.0;             // seconds dead
export const SPAWN_SHIELD = 1.5;        // seconds of protection after spawning
export const REGEN_DELAY = 4.0;         // health creeps back after this long unhurt
export const REGEN_RATE = 12;           // hp a second

// The blaster: hitscan, automatic.
export const FIRE_RATE = 7.5;           // shots a second
export const DAMAGE = 20;
export const HEAD_MULT = 2;             // headshots
export const RANGE = 70;
export const SPREAD = 0.012;            // radians, standing still
export const MOVE_SPREAD = 0.03;        // radians, running or in the air
export const MAG = 24;
export const RELOAD = 1.5;

export const BODY_R = 0.42;             // hit spheres
export const BODY_Y = 0.95;
export const HEAD_R = 0.24;
export const HEAD_Y = 1.58;

export const COLORS = ['#2ee6ff', '#ff4f7b', '#ffd23f', '#7dff6a', '#b07bff', '#ff8a3d', '#ffffff', '#3d8bff'];
