// Skyline Hustle - the city map and its road network. Rebuilt by setMap()
// for each game (Town is hand-made, the bigger maps are generated); never
// saved: a save stores only the map id. Also home to the seeded RNG.
//
// MAP, ROADS, BLOCK_TILES, STATION_TILES and data.js's DISTRICTS are
// updated in place, so every module that imported them sees the new city.

import {
  BLOCK_LAYOUT, DISTRICTS, MAPS, DISTRICT_PREFIX, DISTRICT_SUFFIX, STATION_PRICE, UTILITY_PRICE,
  TRANSIT_TOURISTS, PARK_TOURISTS, NEIGHBOUR_W, DIAGONAL_W,
} from './data.js';

// mulberry32 with its state kept inside the save game.
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const MAP = {};
export const ROADS = {};
export const BLOCK_TILES = [];
export const STATION_TILES = [];
const TOWN_DISTRICTS = DISTRICTS.map(d => ({ ...d, mix: [...d.mix] }));
const STATIONS = ['West Gate', 'Mill Street', 'Harbour', 'East Gate', 'North Cross', 'South Pier', 'Union', 'Central', 'Riverside', 'Airport'];

// ------------------------------------------------------- generation ----
// Lay out a bigger city: metro stations around the outside, parks spread
// through the middle, utilities on the quiet edges, colour blocks
// everywhere else. Blocks near parks and downtown are the wealthy ones.
function generate(cfg) {
  const { cols, rows } = cfg;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const ring = [];
  for (let c = 0; c < cols; c++) ring.push([0, c]);
  for (let r = 1; r < rows; r++) ring.push([r, cols - 1]);
  for (let c = cols - 2; c >= 0; c--) ring.push([rows - 1, c]);
  for (let r = rows - 2; r > 0; r--) ring.push([r, 0]);
  for (let i = 0; i < cfg.transit; i++) {
    const [r, c] = ring[Math.floor((i + 0.5) * ring.length / cfg.transit)];
    grid[r][c] = 'transit';
  }
  // Parks: farthest-point sampling over interior cells, starting downtown.
  const cr = (rows - 1) / 2, cc = (cols - 1) / 2;
  const interior = [];
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) interior.push([r, c]);
  const parks = [];
  for (let i = 0; i < cfg.parks; i++) {
    let best = null, bestD = -1;
    for (const [r, c] of interior) {
      if (grid[r][c]) continue;
      const d = parks.length ? Math.min(...parks.map(([pr, pc]) => Math.abs(pr - r) + Math.abs(pc - c))) : -Math.hypot(r - cr, c - cc);
      if (d > bestD) { bestD = d; best = [r, c]; }
    }
    grid[best[0]][best[1]] = 'park';
    parks.push(best);
  }
  // Utilities: free ring cells farthest from the parks.
  for (let i = 0; i < cfg.utility; i++) {
    let best = null, bestD = -1;
    for (const [r, c] of ring) {
      if (grid[r][c]) continue;
      const d = Math.min(...parks.map(([pr, pc]) => Math.abs(pr - r) + Math.abs(pc - c))) + (i ? 0 : 0.01 * c);
      if (d > bestD) { bestD = d; best = [r, c]; }
    }
    grid[best[0]][best[1]] = 'utility';
  }
  // Rank the remaining blocks by desirability.
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!grid[r][c]) {
    const nearPark = Math.min(...parks.map(([pr, pc]) => Math.abs(pr - r) + Math.abs(pc - c)));
    const jitter = (((r * 73856093) ^ (c * 19349663)) >>> 0) % 1000 / 1000;
    cells.push({ r, c, score: -nearPark - 0.5 * Math.hypot(r - cr, c - cc) + jitter * 0.8 });
  }
  cells.sort((a, b) => a.score - b.score);
  const n = cells.length;
  const maxPrice = 42000;
  const districts = cells.map((cell, rank) => {
    const t = n > 1 ? rank / (n - 1) : 0;
    const wealthy = 0.05 + 0.6 * Math.pow(t, 1.3);
    const budget = 0.05 + 0.65 * Math.pow(1 - t, 1.2);
    const middle = Math.max(0.2, 1 - wealthy - budget);
    const tot = wealthy + budget + middle;
    return { cell, t, mix: [budget / tot, middle / tot, wealthy / tot], price: Math.round((6000 + Math.pow(t, 1.15) * (maxPrice - 6000)) / 500) * 500,
      pop: Math.round(3600 - t * 1500), lots: t < 0.08 || t > 0.93 ? 2 : 3 };
  });
  // Give each district a name and a colour; neighbours get distinct hues.
  const ordered = [...districts].sort((a, b) => a.cell.r - b.cell.r || a.cell.c - b.cell.c);
  ordered.forEach((d, i) => {
    const prefix = DISTRICT_PREFIX[(i * 17) % DISTRICT_PREFIX.length];
    const suffix = DISTRICT_SUFFIX[(i * 7 + 3) % DISTRICT_SUFFIX.length];
    d.short = prefix;
    d.name = `${prefix} ${suffix}`;
    const hue = Math.round((i * 137.508) % 360);
    d.color = hsl(hue, 0.66, 0.5 + 0.06 * ((i % 3) - 1));
  });
  const layout = grid.map(row => row.slice());
  districts.forEach((d, i) => { layout[d.cell.r][d.cell.c] = 'd:' + i; });
  return { layout, districts: districts.map(({ cell, t, ...rest }) => rest) };
}
function hsl(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------- build ----
export function setMap(id = 'town') {
  const cfg = MAPS[id] || MAPS.town;
  let layout, districts;
  if (id === 'town' || !MAPS[id]) { layout = BLOCK_LAYOUT; districts = TOWN_DISTRICTS.map(d => ({ ...d, mix: [...d.mix] })); }
  else ({ layout, districts } = generate(cfg));
  DISTRICTS.length = 0;
  DISTRICTS.push(...districts);

  const W = layout[0].length * 3 + 1, H = layout.length * 3 + 1;
  const tiles = [];
  for (let y = 0; y < H; y++) {
    tiles.push([]);
    for (let x = 0; x < W; x++) {
      const road = x % 3 === 0 || y % 3 === 0;
      tiles[y].push({ x, y, kind: road ? 'road' : 'plaza', block: -1, district: -1, lot: -1 });
    }
  }
  const blocks = [];
  const lotDefs = [];
  let station = 0, utility = 0;
  layout.forEach((row, br) => row.forEach((slot, bc) => {
    const bx = 1 + bc * 3, by = 1 + br * 3;
    const block = { id: blocks.length, bc, br, bx, by, kind: slot, district: -1 };
    if (slot.startsWith('d:')) { block.kind = 'district'; block.district = +slot.slice(2); }
    blocks.push(block);
    const at = (dx, dy) => tiles[by + dy][bx + dx];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      at(dx, dy).block = block.id;
      at(dx, dy).district = block.district;
      if (block.kind === 'park') at(dx, dy).kind = 'park';
    }
    const addLot = (dx, dy, def) => {
      const t = at(dx, dy);
      t.kind = 'lot';
      t.lot = lotDefs.length;
      lotDefs.push({ id: lotDefs.length, tx: bx + dx, ty: by + dy, block: block.id, ...def });
    };
    if (block.kind === 'district') {
      const D = DISTRICTS[block.district];
      const spots = D.lots === 3 ? [[0, 0], [1, 0], [0, 1]] : [[0, 0], [1, 1]];
      spots.forEach(([dx, dy], i) => addLot(dx, dy, {
        kind: 'prop', district: block.district, index: i,
        name: `${D.short} Lot ${i + 1}`,
        basePrice: Math.round(D.price * (1 + 0.09 * i) / 100) * 100,
      }));
    } else if (block.kind === 'transit') {
      [[0, 0], [1, 1]].forEach(([dx, dy]) => addLot(dx, dy, {
        kind: 'station', district: -1, name: `${STATIONS[station++ % STATIONS.length]} Station${station > STATIONS.length ? ' ' + Math.ceil(station / STATIONS.length) : ''}`, basePrice: STATION_PRICE,
      }));
    } else if (block.kind === 'utility') {
      const tag = utility ? ` ${['North', 'South', 'East', 'West'][(utility - 1) % 4]}` : '';
      addLot(0, 0, { kind: 'utility', district: -1, name: `Volt Works${tag}`, basePrice: UTILITY_PRICE });
      addLot(1, 1, { kind: 'utility', district: -1, name: `Clearwater Works${tag}`, basePrice: UTILITY_PRICE });
      utility++;
    }
  }));

  // District adjacency: who shops where, and where tourists come from.
  const distBlock = DISTRICTS.map((_, d) => blocks.find(b => b.district === d));
  const neighbours = DISTRICTS.map((_, d) => {
    const a = distBlock[d];
    const out = [];
    DISTRICTS.forEach((_, e) => {
      const b = distBlock[e];
      const dx = Math.abs(a.bc - b.bc), dy = Math.abs(a.br - b.br);
      if (d === e) out.push({ d: e, w: 1 });
      else if (dx + dy === 1) out.push({ d: e, w: NEIGHBOUR_W });
      else if (dx === 1 && dy === 1) out.push({ d: e, w: DIAGONAL_W });
    });
    return out;
  });
  const tourists = DISTRICTS.map((_, d) => {
    const a = distBlock[d];
    let t = 0;
    for (const b of blocks) {
      if (Math.max(Math.abs(a.bc - b.bc), Math.abs(a.br - b.br)) !== 1) continue;
      const ortho = a.bc === b.bc || a.br === b.br;
      if (b.kind === 'transit') t += TRANSIT_TOURISTS * (ortho ? 1 : 0.5);
      if (b.kind === 'park') t += PARK_TOURISTS * (ortho ? 1 : 0.5);
    }
    return t;
  });
  const districtLots = DISTRICTS.map((_, d) => lotDefs.filter(l => l.district === d).map(l => l.id));
  for (const k of Object.keys(MAP)) delete MAP[k];
  const neighW = neighbours.map(list => new Map(list.map(n => [n.d, n.w])));
  Object.assign(MAP, { id: MAPS[id] ? id : 'town', w: W, h: H, tiles, blocks, lotDefs, neighbours, neighW, tourists, districtLots, distBlock });
  buildRoads();
  BLOCK_TILES.length = 0;
  BLOCK_TILES.push(...MAP.blocks.map(b => [[b.bx, b.by], [b.bx + 1, b.by], [b.bx, b.by + 1], [b.bx + 1, b.by + 1]]));
  STATION_TILES.length = 0;
  STATION_TILES.push(...MAP.lotDefs.filter(l => l.kind === 'station').map(l => [l.tx, l.ty]));
  return MAP;
}

// ------------------------------------------------------ road network ----
// Every road tile gets an index; all-pairs distances and next hops are
// precomputed by BFS.
function buildRoads() {
  const list = [];
  const id = MAP.tiles.map(row => row.map(t => (t.kind === 'road' ? list.push([t.x, t.y]) - 1 : -1)));
  const R = list.length;
  const dist = new Int16Array(R * R).fill(-1);
  const next = new Int16Array(R * R).fill(-1);
  const nbrs = list.map(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => id[y + dy]?.[x + dx] ?? -1).filter(n => n >= 0));
  const q = new Int32Array(R);
  for (let t = 0; t < R; t++) {
    // BFS outward from the target; each node's parent is its next hop toward it.
    let qh = 0, qt = 0;
    q[qt++] = t;
    dist[t * R + t] = 0;
    next[t * R + t] = t;
    while (qh < qt) {
      const u = q[qh++];
      for (const v of nbrs[u]) {
        if (dist[v * R + t] >= 0) continue;
        dist[v * R + t] = dist[u * R + t] + 1;
        next[v * R + t] = u;
        q[qt++] = v;
      }
    }
  }
  // The road tile in front of each non-road tile (prefer the camera-facing side).
  const access = MAP.tiles.map(row => row.map(t => {
    if (t.kind === 'road') return id[t.y][t.x];
    const opts = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => id[t.y + dy]?.[t.x + dx] ?? -1).filter(n => n >= 0);
    return opts.length ? opts[0] : -1;
  }));
  for (const k of Object.keys(ROADS)) delete ROADS[k];
  Object.assign(ROADS, { list, id, R, dist, next, access });
}

// Walking distance in tiles between two tiles, via the roads.
export function tileDist(ax, ay, bx, by) {
  const a = ROADS.access[ay][ax], b = ROADS.access[by][bx];
  return ROADS.dist[a * ROADS.R + b] + (MAP.tiles[ay][ax].kind === 'road' ? 0 : 1) + (MAP.tiles[by][bx].kind === 'road' ? 0 : 1);
}

// Tile-by-tile route (tile centres) from one tile to another along roads.
export function roadPath(ax, ay, bx, by) {
  const out = [[ax, ay]];
  let u = ROADS.access[ay][ax];
  const t = ROADS.access[by][bx];
  let guard = 0;
  while (u >= 0 && guard++ < 200) {
    const [x, y] = ROADS.list[u];
    if (x !== out[out.length - 1][0] || y !== out[out.length - 1][1]) out.push([x, y]);
    if (u === t) break;
    u = ROADS.next[u * ROADS.R + t];
  }
  if (bx !== out[out.length - 1][0] || by !== out[out.length - 1][1]) out.push([bx, by]);
  return out;
}

// Start on the hand-made Town.
setMap('town');
