// Skyline Hustle - the static city map and its road network. Built once at
// load from BLOCK_LAYOUT; never saved. Also home to the seeded RNG.

import {
  MAP_W, MAP_H, BLOCK_LAYOUT, DISTRICTS, STATION_PRICE, UTILITY_PRICE, STATION_NAMES, UTILITY_NAMES,
  TRANSIT_TOURISTS, PARK_TOURISTS, NEIGHBOUR_W, DIAGONAL_W,
} from './data.js';

// mulberry32 with its state kept inside the save game.
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ------------------------------------------------------- static map ----
// Built once from BLOCK_LAYOUT; never saved.
export const MAP = (() => {
  const tiles = [];
  for (let y = 0; y < MAP_H; y++) {
    tiles.push([]);
    for (let x = 0; x < MAP_W; x++) {
      const road = x % 3 === 0 || y % 3 === 0;
      tiles[y].push({ x, y, kind: road ? 'road' : 'plaza', block: -1, district: -1, lot: -1 });
    }
  }
  const blocks = [];
  const lotDefs = [];
  let station = 0, utility = 0;
  BLOCK_LAYOUT.forEach((row, br) => row.forEach((slot, bc) => {
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
        kind: 'station', district: -1, name: STATION_NAMES[station++], basePrice: STATION_PRICE,
      }));
    } else if (block.kind === 'utility') {
      [[0, 0], [1, 1]].forEach(([dx, dy]) => addLot(dx, dy, {
        kind: 'utility', district: -1, name: UTILITY_NAMES[utility++], basePrice: UTILITY_PRICE,
      }));
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
  return { tiles, blocks, lotDefs, neighbours, tourists, districtLots, distBlock };
})();


// ------------------------------------------------------ road network ----
// Every road tile gets an index; all-pairs distances and next hops are
// precomputed by BFS (about 100 road tiles, so the tables are tiny).
export const ROADS = (() => {
  const list = [];
  const id = MAP.tiles.map(row => row.map(t => (t.kind === 'road' ? list.push([t.x, t.y]) - 1 : -1)));
  const R = list.length;
  const dist = new Int16Array(R * R).fill(-1);
  const next = new Int16Array(R * R).fill(-1);
  const nbrs = list.map(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => id[y + dy]?.[x + dx] ?? -1).filter(n => n >= 0));
  for (let t = 0; t < R; t++) {
    // BFS outward from the target; each node's parent is its next hop toward it.
    const q = [t];
    dist[t * R + t] = 0;
    next[t * R + t] = t;
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      for (const v of nbrs[u]) {
        if (dist[v * R + t] >= 0) continue;
        dist[v * R + t] = dist[u * R + t] + 1;
        next[v * R + t] = u;
        q.push(v);
      }
    }
  }
  // The road tile in front of each non-road tile (prefer the camera-facing side).
  const access = MAP.tiles.map(row => row.map(t => {
    if (t.kind === 'road') return id[t.y][t.x];
    const opts = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => id[t.y + dy]?.[t.x + dx] ?? -1).filter(n => n >= 0);
    return opts.length ? opts[0] : -1;
  }));
  return { list, id, R, dist, next, access };
})();

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

// Tiles belonging to a district's block, and the metro station tiles.
export const BLOCK_TILES = MAP.blocks.map(b => [[b.bx, b.by], [b.bx + 1, b.by], [b.bx, b.by + 1], [b.bx + 1, b.by + 1]]);
export const STATION_TILES = MAP.lotDefs.filter(l => l.kind === 'station').map(l => [l.tx, l.ty]);
