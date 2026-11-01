// Skyline Hustle - static game data and every tuning number.
// Nothing in here touches the DOM, so the simulation can run headless in Node.

// ---------------------------------------------------------------- map ----
// The city is a 4 x 3 grid of blocks. Each block is 2 x 2 tiles with a
// one-tile road between blocks, so the map is 13 x 10 tiles.
export const MAP_W = 13;
export const MAP_H = 10;
export const BLOCK_COLS = 4;
export const BLOCK_ROWS = 3;

// What sits in each block slot, row by row.
//   d:N  colour district N      transit  two metro stations
//   park the central park       utility  power + water works
export const BLOCK_LAYOUT = [
  ['d:0', 'd:1', 'd:2', 'd:3'],
  ['transit', 'park', 'utility', 'transit'],
  ['d:7', 'd:6', 'd:5', 'd:4'],
];

// ---------------------------------------------------------- districts ----
// Each colour district is one block. Own every lot of a colour to complete
// the set: rent doubles and you can build apartments (up to a tower).
// mix = share of [budget, middle, wealthy] residents.
export const DISTRICTS = [
  { name: 'Foundry Row',     short: 'Foundry',  color: '#b8662f', pop: 3600, mix: [0.70, 0.25, 0.05], price: 6000,  lots: 2 },
  { name: 'Canalside',       short: 'Canal',    color: '#19b5a5', pop: 3300, mix: [0.55, 0.35, 0.10], price: 8000,  lots: 3 },
  { name: 'Bazaar Quarter',  short: 'Bazaar',   color: '#ec5fa8', pop: 3100, mix: [0.42, 0.43, 0.15], price: 10500, lots: 3 },
  { name: 'Stagelight',      short: 'Stage',    color: '#f28b2c', pop: 2900, mix: [0.30, 0.50, 0.20], price: 13500, lots: 3 },
  { name: 'Exchange Square', short: 'Exchange', color: '#d93a3a', pop: 2800, mix: [0.20, 0.52, 0.28], price: 17000, lots: 3 },
  { name: 'Greenway',        short: 'Greenway', color: '#7cc22e', pop: 2600, mix: [0.15, 0.48, 0.37], price: 21000, lots: 3 },
  { name: 'Parkview',        short: 'Parkview', color: '#6d5df0', pop: 2400, mix: [0.10, 0.40, 0.50], price: 26000, lots: 3 },
  { name: 'Regent Heights',  short: 'Regent',   color: '#f2c81d', pop: 2100, mix: [0.05, 0.30, 0.65], price: 33000, lots: 2 },
];

export const SEGMENTS = ['Budget', 'Middle', 'Wealthy', 'Tourists'];
// How hard each segment reacts to price (higher = flees expensive shops).
export const SEG_ELASTICITY = [2.8, 1.9, 0.9, 1.4];

// ------------------------------------------------------------ special ----
export const STATION_PRICE = 22000;
export const UTILITY_PRICE = 16000;
export const STATION_NAMES = ['West Gate Station', 'Mill Street Station', 'Harbour Station', 'East Gate Station'];
export const UTILITY_NAMES = ['Volt Works', 'Clearwater Works'];
// Daily fare per station, by how many stations the same owner holds.
export const STATION_FARE = [0, 420, 900, 1500, 2300];
// Utilities collect a cut of every business's daily overhead bill.
export const UTILITY_CUT = [0, 0.30, 0.45];   // per utility, owning 1 / 2

// Tourists a transit block / park sends into neighbouring districts.
export const TRANSIT_TOURISTS = 650;
export const PARK_TOURISTS = 300;

// ---------------------------------------------------------- businesses ----
// cost      build price             ticket  average spend per customer
// stock     cost of goods / ticket  wage    per staff per open hour
// cap       customers / staff / hr  open    [from, to) hours, may wrap
// peaks     busiest hours           app     customers per 1000 people per
//                                           peak hour: [budget, middle, wealthy, tourist]
export const BUSINESSES = [
  { id: 'cafe',     name: 'Coffee House',    icon: '☕', cost: 9000,  ticket: 6,   stock: 0.30, wage: 19, cap: 20, open: [6, 20],  peaks: [8, 13, 16], app: [9, 13, 15, 16],  wall: '#8b5e3c', group: 'food' },
  { id: 'burger',   name: 'Burger Bar',      icon: '🍔', cost: 12000, ticket: 11,  stock: 0.36, wage: 19, cap: 16, open: [10, 24], peaks: [12, 19],    app: [15, 10, 4, 12],  wall: '#e0533d', group: 'food' },
  { id: 'grocer',   name: 'Corner Grocer',   icon: '🛒', cost: 14000, ticket: 19,  stock: 0.60, wage: 18, cap: 18, open: [7, 22],  peaks: [9, 18],     app: [11, 10, 6, 3],   wall: '#3f9a4a', group: 'retail' },
  { id: 'pharmacy', name: 'Pharmacy',        icon: '💊', cost: 16000, ticket: 24,  stock: 0.52, wage: 24, cap: 12, open: [8, 21],  peaks: [11, 17],    app: [4.5, 4.5, 4.5, 2], wall: '#2f9bd6', group: 'retail' },
  { id: 'gym',      name: 'Fitness Club',    icon: '🏋️', cost: 24000, ticket: 14,  stock: 0.08, wage: 22, cap: 24, open: [6, 23],  peaks: [7, 18],     app: [3, 6.5, 8, 1.5], wall: '#5b6475', group: 'leisure' },
  { id: 'boutique', name: 'Fashion Boutique', icon: '👗', cost: 22000, ticket: 58, stock: 0.48, wage: 24, cap: 6,  open: [10, 20], peaks: [14, 17],    app: [1, 3, 6.5, 5],   wall: '#c2418f', group: 'retail' },
  { id: 'gadget',   name: 'Gadget Store',    icon: '📱', cost: 30000, ticket: 115, stock: 0.66, wage: 27, cap: 4,  open: [10, 20], peaks: [15, 18],    app: [0.8, 1.7, 2.6, 1.6], wall: '#334a7d', group: 'retail' },
  { id: 'cinema',   name: 'Cinema',          icon: '🎬', cost: 38000, ticket: 14,  stock: 0.22, wage: 19, cap: 32, open: [12, 24], peaks: [19, 21],    app: [5, 6.5, 5, 6.5], wall: '#7a2b2b', group: 'leisure' },
  { id: 'bistro',   name: 'Bistro',          icon: '🍷', cost: 32000, ticket: 46,  stock: 0.40, wage: 27, cap: 8,  open: [17, 24], peaks: [20],        app: [1, 4.5, 10, 8],  wall: '#5a2e4f', group: 'food' },
  { id: 'club',     name: 'Night Club',      icon: '🪩', cost: 36000, ticket: 28,  stock: 0.30, wage: 24, cap: 28, open: [21, 4],  peaks: [0],         app: [5, 6, 4, 11],    wall: '#2a1d4f', group: 'leisure' },
  { id: 'hotel',    name: 'Boutique Hotel',  icon: '🏨', cost: 58000, ticket: 150, stock: 0.22, wage: 24, cap: 3,  open: [0, 24],  peaks: [15, 21],    app: [0, 0.1, 0.4, 3.2], wall: '#a88a52', group: 'leisure' },
];
export const BIZ = Object.fromEntries(BUSINESSES.map(b => [b.id, b]));

// Price tiers the owner can pick. mult scales the ticket.
export const PRICE_TIERS = [
  { name: 'Bargain', mult: 0.72 },
  { name: 'Cheap',   mult: 0.86 },
  { name: 'Fair',    mult: 1.00 },
  { name: 'Premium', mult: 1.20 },
  { name: 'Luxury',  mult: 1.45 },
];
// Fit-out level: nicer shops draw more customers and serve them faster.
export const FIT_LEVELS = [
  null,
  { name: 'Basic',    appeal: 1.00, cap: 1.00, costMult: 0 },
  { name: 'Smart',    appeal: 1.28, cap: 1.15, costMult: 0.35 },
  { name: 'Flagship', appeal: 1.60, cap: 1.30, costMult: 0.70 },
];
export const MAX_STAFF = 8;

// -------------------------------------------------------- apartments ----
// Only on a lot whose owner holds the whole colour set, built evenly.
export const APT_NAMES = ['Ground only', '2 floors', '4 floors', '6 floors', '8 floors', 'Skyline Tower'];
export const APT_RESIDENTS = [0, 150, 300, 450, 600, 1000];
export const APT_RENT = [0, 1, 2, 3.2, 4.5, 8];       // x lot base price x APT_RENT_RATE per day
export const APT_RENT_RATE = 0.007;
export const APT_COST_RATE = 0.55;                    // per level, x lot base price
export const MAX_APT = 5;

// ----------------------------------------------------------- economy ----
export const DEMAND_SCALE = 0.62;
export const OUTSIDE_WEIGHT = 0.30;     // customers who just go home instead
export const NEIGHBOUR_W = 0.32;        // pull of a shop on a neighbouring block
export const DIAGONAL_W = 0.14;
export const ELASTICITY_BASE = 1.0;
export const RENT_RATE = 0.022;         // ground rent per day as a share of land value
export const SET_RENT_MULT = 2;
export const APT_SHOP_RENT = 0.20;      // + per apartment level to ground rent
export const OVERHEAD_BASE = 35;        // per business per day
export const OVERHEAD_RATE = 0.006;     // x build cost per day
export const LAND_GROWTH_DAY = 0.006;
export const LAND_GROWTH_BIZ = 0.035;   // per business on the block
export const LAND_GROWTH_APT = 0.025;   // per apartment level on the block
export const SELL_LAND_RATE = 0.70;
export const SELL_BIZ_RATE = 0.50;
export const LOAN_RATE = 0.008;         // interest per day
export const LOAN_STEP = 10000;
export const LOAN_LTV = 0.5;            // borrow up to this share of assets

// ------------------------------------------------------------- time ----
export const SECONDS_PER_HOUR = 1.6;    // at 1x
export const SPEEDS = [0, 1, 2.5, 6];
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------- players ----
export const START_CASH = 60000;
export const RIVALS = [
  { name: 'Margo Vance', company: 'Vance Estates',  color: '#ff4f7b', style: 'baron',
    blurb: 'Hoards land and finishes colour sets. Towers follow.' },
  { name: 'Rex Dupree',  company: 'Dupree & Sons',  color: '#ffae1f', style: 'cutter',
    blurb: 'Cheap food everywhere. Will undercut you on principle.' },
  { name: 'Ines Kato',   company: 'Kato Collective', color: '#a77bff', style: 'premium',
    blurb: 'Smart fit-outs, premium prices, wealthy streets.' },
];
export const HUMAN_COLOR = '#2ee6ff';

export const SCENARIOS = {
  quick:    { name: 'Quick Deal',   goal: 500000,  days: 40,  blurb: 'First to a $500K net worth within 40 days.' },
  standard: { name: 'City Mogul',   goal: 2000000, days: 100, blurb: 'First to a $2M net worth within 100 days.' },
  sandbox:  { name: 'Free Play',    goal: 0,       days: 0,   blurb: 'No deadline. Build the skyline you want.' },
};
export const DIFFICULTY = {
  easy:   { aiCash: 0.7,  think: 8, margin: 1.3,  minRoi: 0.045, tune: 0.35, borrow: false },
  normal: { aiCash: 1.0,  think: 4, margin: 1.0,  minRoi: 0.03,  tune: 0.75, borrow: true },
  hard:   { aiCash: 1.3,  think: 2, margin: 0.85, minRoi: 0.02,  tune: 1.0,  borrow: true },
};

// ------------------------------------------------------------ events ----
// Rolled each morning. type mods multiply demand for business ids / groups.
export const EVENTS = [
  { id: 'festival',  days: [1, 2], weight: 3, district: true,  text: d => `Street festival in ${d}! Crowds pour in.`, tourists: 1800 },
  { id: 'heat',      days: [2, 3], weight: 2, text: () => 'Heatwave: cafés and grocers are mobbed, gyms empty.', mods: { cafe: 1.4, grocer: 1.25, gym: 0.75 } },
  { id: 'rain',      days: [1, 2], weight: 3, text: () => 'Rainstorm: people head for cinemas and stay off the high street.', mods: { cinema: 1.5, boutique: 0.7, gadget: 0.85, all: 0.9 } },
  { id: 'convention',days: [2, 3], weight: 2, text: () => 'Trade convention in town: tourist numbers jump citywide.', touristMult: 1.8 },
  { id: 'fitness',   days: [3, 4], weight: 2, text: () => 'A fitness craze sweeps the city. Burgers suffer.', mods: { gym: 1.6, burger: 0.8 } },
  { id: 'gadget',    days: [2, 3], weight: 1, text: () => 'New phone launch! Gadget stores have queues round the block.', mods: { gadget: 1.9 } },
  { id: 'fashion',   days: [2, 2], weight: 1, text: () => 'Fashion week: boutiques and bistros boom.', mods: { boutique: 1.7, bistro: 1.25 } },
  { id: 'boom',      days: [1, 1], weight: 1, text: () => 'Property boom: land values up 8%.', land: 1.08 },
  { id: 'slump',     days: [1, 1], weight: 1, text: () => 'Market jitters: land values down 6%.', land: 0.94 },
  { id: 'concert',   days: [1, 1], weight: 2, district: true, text: d => `Open-air concert near ${d}: late-night crowds expected.`, tourists: 1200, mods: { club: 1.5, bistro: 1.2, burger: 1.2 } },
];
