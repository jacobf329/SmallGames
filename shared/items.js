// Mario-Kart-style item roulette. What you get depends on where you are in
// the pack: leaders get defensive junk, stragglers get the good stuff.

export const ITEM = {
  BOOST: 'boost',
  SHELL: 'shell',
  BANANA: 'banana',
  SHIELD: 'shield',
  BOLT: 'bolt',
  STAR: 'star',
  ROCKET: 'rocket',
  MAGNET: 'magnet',
  COINS: 'coins'
};

export const ITEM_META = {
  [ITEM.BOOST]:  { name: 'Turbo',   icon: '»', color: '#ffd23f', desc: 'Instant speed burst' },
  [ITEM.SHELL]:  { name: 'Homer',   icon: '◎', color: '#3ddc84', desc: 'Homes on the runner ahead' },
  [ITEM.BANANA]: { name: 'Grease',  icon: '~', color: '#ffe14d', desc: 'Drops behind you' },
  [ITEM.SHIELD]: { name: 'Bubble',  icon: '◯', color: '#33b0ff', desc: 'Soaks one wipeout' },
  [ITEM.BOLT]:   { name: 'Zap',     icon: '⚡', color: '#b06bff', desc: 'Slows everyone ahead' },
  [ITEM.STAR]:   { name: 'Blaze',   icon: '★', color: '#ff8a3d', desc: 'Invincible, smash everything' },
  [ITEM.ROCKET]: { name: 'Rocket',  icon: '▲', color: '#ff4d5a', desc: 'Auto-pilot rocket ride' },
  [ITEM.MAGNET]: { name: 'Magnet',  icon: '∪', color: '#00e5c9', desc: 'Vacuums up coins' },
  [ITEM.COINS]:  { name: 'Coins',   icon: '●', color: '#ffe14d', desc: 'Ten coins, more top speed' }
};

// weights for [leading, midfield, trailing]
const TABLE = [
  [ITEM.BANANA, [34, 20, 8]],
  [ITEM.COINS,  [26, 16, 8]],
  [ITEM.SHIELD, [18, 16, 10]],
  [ITEM.MAGNET, [10, 12, 8]],
  [ITEM.BOOST,  [10, 20, 22]],
  [ITEM.SHELL,  [2,  14, 18]],
  [ITEM.BOLT,   [0,  2,  12]],
  [ITEM.STAR,   [0,  0,  10]],
  [ITEM.ROCKET, [0,  0,  4]]
];

// rank 0 = leader, 1 = last place.
export function rollItem(rng, rank) {
  const t = Math.max(0, Math.min(1, rank));
  const seg = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const a = t < 0.5 ? 0 : 1;
  const b = a + 1;
  let total = 0;
  const w = TABLE.map(([item, ws]) => {
    const v = ws[a] + (ws[b] - ws[a]) * seg;
    total += v;
    return v;
  });
  let r = rng() * total;
  for (let i = 0; i < TABLE.length; i++) {
    r -= w[i];
    if (r <= 0) return TABLE[i][0];
  }
  return ITEM.BOOST;
}
