// Shared tuning constants. Imported by both the Node server and the browser
// client so that prediction and authority agree on the numbers.

export const PROTOCOL_VERSION = 1;

export const TICK_RATE = 60;              // server simulation steps per second
export const SNAPSHOT_RATE = 20;          // state broadcasts per second
export const MAX_PLAYERS = 12;
export const MIN_PLAYERS_TO_START = 1;

// ---- track geometry -------------------------------------------------------
export const LANE_W = 2.4;                // metres between lane centres
export const MAIN_LANES = 5;
export const SHORTCUT_LANES = 3;
export const CHUNK = 40;                  // metres of track generated per chunk
export const RACE_DISTANCE = 1800;        // metres from start line to finish
export const START_PAD = 60;              // clear run-up before obstacles start
export const SHORTCUT_OFFSET = 11.5;      // lateral offset of a shortcut branch
export const SHORTCUT_HEIGHT = 3.2;       // shortcut rails sit above the main road

// ---- runner physics -------------------------------------------------------
export const BASE_SPEED = 18;             // speed you settle at with no help
export const MIN_SPEED = 6;
export const MAX_SPEED = 31;
export const ACCEL = 6.0;                 // m/s^2 toward the target speed
export const BRAKE = 14.0;                // m/s^2 when above the target speed
export const KNOCK_SPEED = 7.5;           // speed you drop to after a wipeout
export const KNOCK_BACK = 4.5;            // metres shoved backwards on a wipeout
export const STUN_TIME = 0.5;             // no steering while stunned
export const INVULN_TIME = 1.2;           // grace period after a wipeout
export const SPIN_TIME = 0.9;             // shell / banana spinout is worse
export const JUMP_V = 10.4;
export const GRAVITY = 30;
export const RAMP_V = 13.5;
export const SLIDE_TIME = 0.62;
export const STRAFE_SPEED = 13.0;         // lateral m/s while changing lanes
export const PLAYER_W = 1.25;
export const PLAYER_LEN = 1.1;

// ---- economy / boosts -----------------------------------------------------
export const COIN_TOP_SPEED = 0.055;      // extra top speed per coin
export const COIN_CAP = 40;               // coins beyond this stop helping
export const BOOST_SPEED = 40;
export const BOOST_TIME = 1.9;
export const PAD_BOOST_TIME = 1.1;
export const STAR_SPEED = 36;
export const STAR_TIME = 6.5;
export const ROCKET_SPEED = 46;
export const ROCKET_TIME = 4.0;
export const BOLT_TIME = 3.2;
export const BOLT_FACTOR = 0.55;          // speed multiplier while zapped
export const SHIELD_TIME = 14;
export const MAGNET_TIME = 7;
export const MAGNET_RANGE = 6.5;
export const DRAFT_RANGE = 14;            // slipstream distance behind a rival
export const DRAFT_BONUS = 2.6;
export const SHORTCUT_FACTOR = 1.34;      // shortcuts cover ground faster

// ---- projectiles ----------------------------------------------------------
export const SHELL_SPEED = 46;
export const SHELL_LIFE = 6.0;
export const SHELL_HOME = 6.5;            // lateral homing m/s
export const BANANA_LIFE = 45;

// ---- misc -----------------------------------------------------------------
export const COUNTDOWN = 4.0;             // seconds of 3..2..1..GO
export const FINISH_GRACE = 20;           // seconds others get after 1st place
export const RESULTS_TIME = 14;

export const COLORS = [
  '#ff4d5a', '#ffb020', '#3ddc84', '#33b0ff', '#b06bff', '#ff6fd8',
  '#00e5c9', '#ffe14d', '#ff8a3d', '#7dff5a', '#5a7bff', '#ff5ab0'
];

export const OB = {
  BARRIER: 'barrier',   // low wall - jump it
  HIGHBAR: 'highbar',   // overhead bar - slide under it
  BLOCK: 'block',       // train / container - steer around it
  CONE: 'cone',         // small - clips you
  RAMP: 'ramp',         // launches you
  PAD: 'pad'            // boost strip
};

export const PICK = { COIN: 'coin', BOX: 'box' };
