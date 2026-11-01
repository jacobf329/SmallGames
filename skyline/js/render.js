// Skyline Hustle - isometric canvas renderer. No image assets: every tile,
// building, tree, pedestrian and car is drawn from primitives.

import { MAP_W, MAP_H, DISTRICTS, BIZ, MAX_APT } from './data.js';
import { MAP, PROFILE, ownsSet } from './sim.js';

const HW = 32, HH = 16;                     // half tile width / height
export const iso = (x, y) => [(x - y) * HW, (x + y) * HH];

// ---------------------------------------------------------- colours ----
function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const shade = (c, f) => f >= 0 ? mix(c, '#ffffff', f) : mix(c, '#000000', -f);
const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };

const ROAD_TILES = [];
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (MAP.tiles[y][x].kind === 'road') ROAD_TILES.push([x, y]);
const isRoad = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && MAP.tiles[y][x].kind === 'road';

// Deterministic per-tile noise for decoration.
const noise = (x, y, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function darkness(h) {
  if (h < 5 || h >= 21) return 1;
  if (h < 7.5) return (7.5 - h) / 2.5;
  if (h >= 18.5) return (h - 18.5) / 2.5;
  return 0;
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 48, y: 190, z: 1 };
    this.target = null;                    // smooth camera glide
    this.walkers = [];
    this.cars = [];
    this.floaters = [];
    this.sel = -1;
    this.hits = [];
    this.lights = [];
    this.tops = {};
    this.clock = 0;
    this.insetTop = 125;
    this.insetBottom = 62;
    this.resize();
    this.fit();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.c.width = Math.round(this.w * this.dpr);
    this.c.height = Math.round(this.h * this.dpr);
    this.c.style.width = this.w + 'px';
    this.c.style.height = this.h + 'px';
  }

  // Frame the whole city between the HUD and the nav bar.
  fit() {
    const short = this.h <= 500;
    this.insetTop = short ? 90 : 125;
    this.insetBottom = short ? 0 : 62;
    const availH = this.h - this.insetTop - this.insetBottom;
    const z = Math.min(this.w / 760, availH / 430);
    this.cam.z = Math.max(0.45, Math.min(2.6, z * (this.w < this.h ? 1.6 : 1.05)));
    this.cam.x = 48;
    this.cam.y = 165 - (this.insetTop - this.insetBottom) / 2 / this.cam.z;
  }

  // ------------------------------------------------------- camera ----
  toWorld(sx, sy) {
    return [(sx - this.w / 2) / this.cam.z + this.cam.x, (sy - this.h / 2) / this.cam.z + this.cam.y];
  }
  pan(dx, dy) {
    this.target = null;
    this.cam.x -= dx / this.cam.z;
    this.cam.y -= dy / this.cam.z;
    this.clampCam();
  }
  zoomAt(sx, sy, f) {
    this.target = null;
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.z = Math.max(0.45, Math.min(3.2, this.cam.z * f));
    this.cam.x = wx - (sx - this.w / 2) / this.cam.z;
    this.cam.y = wy - (sy - this.h / 2) / this.cam.z;
    this.clampCam();
  }
  clampCam() {
    this.cam.x = Math.max(-340, Math.min(440, this.cam.x));
    this.cam.y = Math.max(-40, Math.min(420, this.cam.y));
  }
  // Glide so a lot sits in the visible strip above the bottom sheet.
  focusLot(lot, sheetH = 0) {
    const [wx, wy] = iso(lot.tx + 0.5, lot.ty + 0.5);
    const z = Math.max(this.cam.z, 1.1);
    if (this.h <= 500) {
      // Side sheet: keep the lot in the strip left of it.
      const visibleMidX = (this.w - Math.min(350, this.w * 0.46) - 56) / 2;
      this.target = { x: wx - (visibleMidX - this.w / 2) / z, y: wy - 20 - (this.insetTop / 2) / z, z };
      return;
    }
    const visibleMid = (this.insetTop + (this.h - sheetH)) / 2;
    this.target = { x: wx, y: wy - 20 - (visibleMid - this.h / 2) / z, z };
  }

  // Which lot is under a screen point? Tall buildings win over ground.
  pick(sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    const hit = this.hits.filter(h => wx >= h.x0 && wx <= h.x1 && wy >= h.y0 && wy <= h.y1)
      .sort((a, b) => b.depth - a.depth);
    if (hit.length) return hit[0].id;
    const tx = Math.floor((wx / HW + wy / HH) / 2), ty = Math.floor((wy / HH - wx / HW) / 2);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return -1;
    return MAP.tiles[ty][tx].lot;
  }

  // ---------------------------------------------------- particles ----
  floater(lot, text, color, force = false) {
    // One pop per shop at a time, so fast-forward doesn't stack them up.
    if (!force && this.floaters.some(f => f.lot === lot.id && f.t < 0.9)) return;
    const [wx, wy] = iso(lot.tx + 0.5, lot.ty + 0.5);
    this.floaters.push({ lot: lot.id, x: wx + (Math.random() - 0.5) * 10, y: wy - 20 - (this.tops[lot.id] || 20), text, color, t: 0 });
    if (this.floaters.length > 40) this.floaters.shift();
  }

  syncCrowd(target, cars) {
    while (this.walkers.length < target) this.walkers.push(this.spawnMover(0.55 + Math.random() * 0.35, true));
    if (this.walkers.length > target) this.walkers.length = Math.max(0, target);
    while (this.cars.length < cars) this.cars.push(this.spawnMover(1.7 + Math.random() * 0.6, false));
    if (this.cars.length > cars) this.cars.length = Math.max(0, cars);
  }
  spawnMover(speed, walker) {
    const [x, y] = ROAD_TILES[Math.floor(Math.random() * ROAD_TILES.length)];
    const palette = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff', '#ffffff', '#ff9f1c'];
    return {
      x, y, px: x, py: y, nx: x, ny: y, t: 1, speed,
      off: walker ? (Math.random() < 0.5 ? -0.36 : 0.36) + (Math.random() - 0.5) * 0.08 : (Math.random() < 0.5 ? -0.14 : 0.14),
      color: palette[Math.floor(Math.random() * palette.length)], walker,
    };
  }
  moveMover(m, dt) {
    m.t += dt * m.speed;
    while (m.t >= 1) {
      m.t -= 1;
      m.px = m.nx; m.py = m.ny;
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isRoad(m.px + dx, m.py + dy));
      // Prefer going straight; avoid U-turns.
      const dirx = m.px - m.x, diry = m.py - m.y;
      let choice = opts.filter(([dx, dy]) => !(dx === -dirx && dy === -diry && (dirx || diry)));
      if (!choice.length) choice = opts;
      const straight = choice.find(([dx, dy]) => dx === dirx && dy === diry);
      const [dx, dy] = straight && Math.random() < 0.7 ? straight : choice[Math.floor(Math.random() * choice.length)];
      m.x = m.px; m.y = m.py;
      m.nx = m.px + dx; m.ny = m.py + dy;
    }
  }
  moverPos(m) {
    const fx = m.px + (m.nx - m.px) * m.t + 0.5, fy = m.py + (m.ny - m.py) * m.t + 0.5;
    const dx = m.nx - m.px, dy = m.ny - m.py;
    // Lateral offset keeps walkers on the pavements and cars in lanes.
    return [fx - dy * m.off, fy + dx * m.off, dx, dy];
  }

  // ---------------------------------------------------------- draw ----
  draw(s, hourF, dt, simSpeed) {
    const ctx = this.ctx;
    this.clock += dt;
    if (this.target) {
      const k = Math.min(1, dt * 6);
      this.cam.x += (this.target.x - this.cam.x) * k;
      this.cam.y += (this.target.y - this.cam.y) * k;
      this.cam.z += (this.target.z - this.cam.z) * k;
      if (Math.abs(this.target.x - this.cam.x) < 0.5 && Math.abs(this.target.y - this.cam.y) < 0.5) this.target = null;
    }
    const dark = darkness(hourF);
    this.dark = dark;
    this.lights.length = 0;

    // Sky.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    const dusk = dark > 0 && dark < 1 ? 1 - Math.abs(dark - 0.5) * 2 : 0;
    const top = mix(mix('#7cc6f2', '#0a0f2a', dark), '#ff8a5c', dusk * 0.35);
    const bottom = mix(mix('#cfeefc', '#151a3a', dark), '#ffc09a', dusk * 0.45);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);

    const z = this.cam.z * this.dpr;
    ctx.setTransform(z, 0, 0, z, (this.w / 2 - this.cam.x * this.cam.z) * this.dpr, (this.h / 2 - this.cam.y * this.cam.z) * this.dpr);

    this.drawIsland(ctx);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) this.drawTile(ctx, s, x, y);
    this.drawSetBorders(ctx, s);
    if (this.sel >= 0) this.drawSelection(ctx, s);

    // Depth-sorted scene objects.
    const items = [];
    this.hits.length = 0;
    for (const l of s.lots) items.push({ d: l.tx + l.ty + 0.6, f: () => this.drawLot(ctx, s, l) });
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const t = MAP.tiles[y][x];
      if (t.kind === 'plaza' || t.kind === 'park') {
        const n = t.kind === 'park' ? 3 : 1 + (noise(x, y) < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const ox = 0.25 + noise(x, y, i + 1) * 0.5, oy = 0.25 + noise(x, y, i + 9) * 0.5;
          items.push({ d: x + y + ox + oy, f: () => this.drawTree(ctx, x + ox, y + oy, noise(x, y, i + 3)) });
        }
      }
    }
    const sp = simSpeed > 0 ? Math.min(simSpeed, 3) : 0;
    for (const m of this.cars) {
      if (sp) this.moveMover(m, dt * sp);
      const [fx, fy, dx, dy] = this.moverPos(m);
      items.push({ d: fx + fy, f: () => this.drawCar(ctx, fx, fy, dx, dy, m.color, dark) });
    }
    for (const m of this.walkers) {
      if (sp) this.moveMover(m, dt * sp);
      const [fx, fy] = this.moverPos(m);
      items.push({ d: fx + fy, f: () => this.drawWalker(ctx, fx, fy, m) });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.f();

    // Night: darken the scene, then add the lights back on top.
    if (dark > 0.01) {
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = `rgba(8, 12, 40, ${0.52 * dark})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const L of this.lights) L(ctx, dark);
      this.drawStreetLamps(ctx, dark);
      ctx.restore();
    }

    // Icons and money floaters stay readable at any zoom.
    for (const l of s.lots) this.drawBadge(ctx, s, l);
    this.drawFloaters(ctx, dt);
  }

  drawIsland(ctx) {
    const a = iso(0, 0), b = iso(MAP_W, 0), c = iso(MAP_W, MAP_H), d = iso(0, MAP_H);
    const depth = 22;
    ctx.fillStyle = '#5b4a3a';
    ctx.beginPath();
    ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + depth); ctx.lineTo(d[0], d[1] + depth);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#463729';
    ctx.beginPath();
    ctx.moveTo(c[0], c[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0], b[1] + depth); ctx.lineTo(c[0], c[1] + depth);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6aa84f';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    ctx.closePath(); ctx.fill();
  }

  diamond(ctx, x, y, inset = 0) {
    const p = [iso(x + inset, y + inset), iso(x + 1 - inset, y + inset), iso(x + 1 - inset, y + 1 - inset), iso(x + inset, y + 1 - inset)];
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
  }

  drawTile(ctx, s, x, y) {
    const t = MAP.tiles[y][x];
    if (t.kind === 'road') {
      this.diamond(ctx, x, y);
      ctx.fillStyle = '#4a505c';
      ctx.fill();
      // Pavement edges.
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const h = y % 3 === 0, v = x % 3 === 0;
      ctx.strokeStyle = 'rgba(255, 230, 140, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (h && !v) { const a = iso(x, y + 0.5), b = iso(x + 1, y + 0.5); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      if (v && !h) { const a = iso(x + 0.5, y), b = iso(x + 0.5, y + 1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
      ctx.setLineDash([]);
      if (h && v) {                           // crossing
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        this.diamond(ctx, x, y, 0.3);
        ctx.fill();
      }
      return;
    }
    const block = MAP.blocks[t.block];
    let base = '#a9b0b8';
    if (t.kind === 'park') base = '#5fa846';
    else if (block.kind === 'district') base = mix(DISTRICTS[block.district].color, '#e9e4da', 0.72);
    else if (block.kind === 'transit') base = '#b4bccb';
    else if (block.kind === 'utility') base = '#a3a39a';
    this.diamond(ctx, x, y);
    ctx.fillStyle = base;
    ctx.fill();
    if (t.kind === 'park') {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      this.diamond(ctx, x, y, 0.15); ctx.fill();
      if ((x + y) % 2 === 0) {                 // pond
        const [cx, cy] = iso(x + 0.5, y + 0.5);
        ctx.fillStyle = '#5ab3e0';
        ctx.beginPath(); ctx.ellipse(cx, cy, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.ellipse(cx - 3, cy - 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    if (t.kind === 'lot') {
      const lot = s.lots[t.lot];
      if (lot.kind === 'prop') {
        // The colour plate: this is what sets are made of.
        this.diamond(ctx, x, y, 0.05);
        ctx.fillStyle = DISTRICTS[lot.district].color;
        ctx.fill();
        if (!lot.business && !lot.apt) {
          this.diamond(ctx, x, y, 0.16);
          ctx.fillStyle = lot.owner >= 0 ? '#8a6f52' : mix(DISTRICTS[lot.district].color, '#7dbb5b', 0.6);
          ctx.fill();
        }
      } else {
        this.diamond(ctx, x, y, 0.06);
        ctx.fillStyle = lot.kind === 'station' ? '#8792a8' : '#8c8c80';
        ctx.fill();
      }
      if (lot.owner >= 0) {
        this.diamond(ctx, x, y, 0.06);
        ctx.strokeStyle = s.players[lot.owner].color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    } else {
      // Plaza paving.
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 0.6;
      for (let i = 1; i < 4; i++) {
        const a = iso(x + i / 4, y), b = iso(x + i / 4, y + 1);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
  }

  // A whole colour set owned by one tycoon gets a thick border in their colour.
  drawSetBorders(ctx, s) {
    for (let d = 0; d < DISTRICTS.length; d++) {
      const owner = s.players.find(p => ownsSet(s, p.id, d));
      if (!owner) continue;
      const b = MAP.distBlock[d];
      const p = [iso(b.bx, b.by), iso(b.bx + 2, b.by), iso(b.bx + 2, b.by + 2), iso(b.bx, b.by + 2)];
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.strokeStyle = owner.color;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = owner.color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  drawSelection(ctx, s) {
    const lot = s.lots[this.sel];
    const pulse = 0.55 + 0.45 * Math.sin(this.clock * 5);
    if (lot.kind === 'prop') {
      const b = MAP.distBlock[lot.district];
      const p = [iso(b.bx - 0.08, b.by - 0.08), iso(b.bx + 2.08, b.by - 0.08), iso(b.bx + 2.08, b.by + 2.08), iso(b.bx - 0.08, b.by + 2.08)];
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = DISTRICTS[lot.district].color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.diamond(ctx, lot.tx, lot.ty, -0.02);
    ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // ------------------------------------------------------ buildings ----
  // Box on tile (tx,ty) with footprint inset m, from height z0 to z1.
  box(ctx, tx, ty, m, z0, z1, top, left, right) {
    const A = iso(tx + m, ty + m), B = iso(tx + 1 - m, ty + m), C = iso(tx + 1 - m, ty + 1 - m), D = iso(tx + m, ty + 1 - m);
    const poly = (pts, col) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    };
    poly([[D[0], D[1] - z0], [C[0], C[1] - z0], [C[0], C[1] - z1], [D[0], D[1] - z1]], left);
    poly([[B[0], B[1] - z0], [C[0], C[1] - z0], [C[0], C[1] - z1], [B[0], B[1] - z1]], right);
    if (top) poly([[A[0], A[1] - z1], [B[0], B[1] - z1], [C[0], C[1] - z1], [D[0], D[1] - z1]], top);
    return { A, B, C, D };
  }

  // Rows of windows on both visible faces between heights z0..z1.
  windows(ctx, tx, ty, m, z0, z1, rowH, cols, color, litSeed) {
    const C = iso(tx + 1 - m, ty + 1 - m), D = iso(tx + m, ty + 1 - m), B = iso(tx + 1 - m, ty + m);
    const faces = [[D, C], [C, B]];
    const rows = Math.floor((z1 - z0) / rowH);
    const lit = [];
    for (const [P, Q] of faces) {
      for (let r = 0; r < rows; r++) {
        const zb = z0 + r * rowH + rowH * 0.3, zt = z0 + r * rowH + rowH * 0.8;
        for (let c = 0; c < cols; c++) {
          const u0 = (c + 0.25) / cols, u1 = (c + 0.75) / cols;
          const x0 = P[0] + (Q[0] - P[0]) * u0, y0 = P[1] + (Q[1] - P[1]) * u0;
          const x1 = P[0] + (Q[0] - P[0]) * u1, y1 = P[1] + (Q[1] - P[1]) * u1;
          const pts = [[x0, y0 - zb], [x1, y1 - zb], [x1, y1 - zt], [x0, y0 - zt]];
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
          if (noise(r, c, litSeed + (P === D ? 0 : 7)) < 0.62) lit.push(pts);
        }
      }
    }
    if (this.dark > 0.05 && lit.length) this.lights.push((cx, dk) => {
      cx.fillStyle = `rgba(255, 196, 92, ${0.75 * dk})`;
      for (const pts of lit) {
        cx.beginPath();
        cx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < 4; i++) cx.lineTo(pts[i][0], pts[i][1]);
        cx.closePath();
        cx.fill();
      }
    });
  }

  drawLot(ctx, s, lot) {
    const { tx, ty } = lot;
    let height = 0;
    if (lot.kind === 'station') height = this.drawStation(ctx, lot);
    else if (lot.kind === 'utility') height = this.drawUtility(ctx, lot);
    else if (lot.business || lot.apt) height = this.drawBuilding(ctx, s, lot);
    else height = this.drawEmptyLot(ctx, s, lot);
    const [cx, cy] = iso(tx + 0.5, ty + 0.5);
    this.tops[lot.id] = height;
    this.hits.push({ id: lot.id, x0: cx - 28, x1: cx + 28, y0: cy - 16 - height - 14, y1: cy + 16, depth: tx + ty });
  }

  drawBuilding(ctx, s, lot) {
    const { tx, ty } = lot;
    const b = lot.business;
    const def = b ? BIZ[b.type] : null;
    const m = 0.13;
    const groundH = 20;
    const wall = def ? def.wall : '#8d8f99';
    // Shopfront.
    this.box(ctx, tx, ty, m, 0, groundH, null, shade(wall, -0.05), shade(wall, -0.28));
    // Glass shop window on the front faces.
    this.windows(ctx, tx, ty, m, 0, groundH, groundH, 2, 'rgba(190, 230, 255, 0.85)', lot.id * 13);
    // Awning in the business owner's colour.
    if (b) {
      const ac = s.players[b.owner].color;
      this.box(ctx, tx, ty, m - 0.04, groundH - 2, groundH + 3, shade(ac, 0.15), ac, shade(ac, -0.2));
    }
    let h = groundH + 3;
    const apt = lot.apt;
    if (apt > 0 && apt < MAX_APT) {
      const floorsH = apt * 2 * 9;
      const tint = mix(DISTRICTS[lot.district].color, '#f3efe6', 0.7);
      this.box(ctx, tx, ty, m + 0.03, h, h + floorsH, shade(tint, 0.1), tint, shade(tint, -0.2));
      this.windows(ctx, tx, ty, m + 0.03, h, h + floorsH, 9, 3, '#3d5a80', lot.id * 31);
      h += floorsH;
      // Roof top with a little water tank.
      const [cx, cy] = iso(tx + 0.5, ty + 0.5);
      ctx.fillStyle = '#6b6f7a';
      ctx.fillRect(cx - 4, cy - h - 7, 8, 7);
    } else if (apt === MAX_APT) {
      // Skyline Tower: slim glass tower with a spire.
      const tH = 150;
      const glass = mix(DISTRICTS[lot.district].color, '#9fd3ff', 0.55);
      this.box(ctx, tx, ty, m + 0.06, h, h + tH, shade(glass, 0.3), shade(glass, -0.05), shade(glass, -0.3));
      this.windows(ctx, tx, ty, m + 0.06, h, h + tH, 7.5, 4, 'rgba(255,255,255,0.28)', lot.id * 17);
      h += tH;
      const [cx, cy] = iso(tx + 0.5, ty + 0.5);
      ctx.strokeStyle = '#d9e2ec';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx, cy - h - 26); ctx.stroke();
      const blink = Math.sin(this.clock * 4 + lot.id) > 0;
      if (blink) { ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(cx, cy - h - 27, 2.4, 0, Math.PI * 2); ctx.fill(); }
      h += 26;
    } else {
      // Flat roof.
      const roof = '#cfd3da';
      this.box(ctx, tx, ty, m, h - 0.1, h, roof, roof, roof);
    }
    return h;
  }

  drawEmptyLot(ctx, s, lot) {
    const [cx, cy] = iso(lot.tx + 0.5, lot.ty + 0.5);
    if (lot.owner >= 0) {
      // Staked flag in the owner's colour.
      ctx.strokeStyle = '#3a2d22';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy + 2); ctx.lineTo(cx, cy - 22); ctx.stroke();
      ctx.fillStyle = s.players[lot.owner].color;
      ctx.beginPath(); ctx.moveTo(cx, cy - 22); ctx.lineTo(cx + 12, cy - 18); ctx.lineTo(cx, cy - 14); ctx.closePath(); ctx.fill();
      return 22;
    }
    // City "for sale" sign.
    ctx.strokeStyle = '#5b4636';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 5, cy + 3); ctx.lineTo(cx - 5, cy - 12); ctx.moveTo(cx + 5, cy + 3); ctx.lineTo(cx + 5, cy - 12); ctx.stroke();
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(cx - 10, cy - 20, 20, 11);
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SALE', cx, cy - 14.5);
    return 20;
  }

  drawStation(ctx, lot) {
    const { tx, ty } = lot;
    this.box(ctx, tx, ty, 0.1, 0, 16, null, '#6c7a96', '#56627a');
    this.windows(ctx, tx, ty, 0.1, 0, 16, 16, 3, 'rgba(200,230,255,0.8)', lot.id * 5);
    this.box(ctx, tx, ty, 0.06, 16, 22, '#2f80ed', '#2a6fcf', '#2259a8');
    const [cx, cy] = iso(tx + 0.5, ty + 0.5);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, cy - 22, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f80ed';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('M', cx, cy - 21.5);
    return 30;
  }

  drawUtility(ctx, lot) {
    const { tx, ty } = lot;
    const power = lot.name.startsWith('Volt');
    this.box(ctx, tx, ty, 0.12, 0, 18, '#b8b8ae', '#8e8e84', '#74746b');
    const [cx, cy] = iso(tx + 0.5, ty + 0.5);
    if (power) {
      for (const dx of [-8, 6]) {
        ctx.fillStyle = '#9a9a92';
        ctx.fillRect(cx + dx - 3, cy - 44, 6, 28);
        ctx.fillStyle = '#d9534f';
        ctx.fillRect(cx + dx - 3, cy - 44, 6, 4);
        // Smoke puffs drift up.
        for (let i = 0; i < 3; i++) {
          const ph = (((this.clock * 0.35 + i / 3 + dx * 0.1) % 1) + 1) % 1;
          ctx.fillStyle = `rgba(230,230,230,${0.5 * (1 - ph)})`;
          ctx.beginPath(); ctx.arc(cx + dx + ph * 6, cy - 48 - ph * 22, 3 + ph * 5, 0, Math.PI * 2); ctx.fill();
        }
      }
      return 50;
    }
    ctx.fillStyle = '#4ea8de';
    ctx.beginPath(); ctx.ellipse(cx, cy - 30, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3c8dbc';
    ctx.fillRect(cx - 12, cy - 30, 24, 12);
    ctx.fillStyle = '#6cc3f0';
    ctx.beginPath(); ctx.ellipse(cx, cy - 30, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    return 38;
  }

  drawTree(ctx, x, y, r) {
    const [cx, cy] = iso(x, y);
    const s = 0.8 + r * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(cx, cy, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(cx - 1.2, cy - 8 * s, 2.4, 8 * s);
    const g = r < 0.33 ? '#3f8f3a' : r < 0.66 ? '#4fa646' : '#2f7a3a';
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy - 12 * s, 6.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(g, 0.18);
    ctx.beginPath(); ctx.arc(cx - 2 * s, cy - 14 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill();
  }

  drawWalker(ctx, x, y, m) {
    const [cx, cy] = iso(x, y);
    const bob = Math.abs(Math.sin((m.t + m.px * 0.3) * Math.PI * 4)) * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(cx - 1.5, cy - 0.5, 3, 1.5);
    ctx.fillStyle = m.color;
    ctx.fillRect(cx - 1.4, cy - 6 - bob, 2.8, 4.5);
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(cx, cy - 7.5 - bob, 1.4, 0, Math.PI * 2); ctx.fill();
  }

  drawCar(ctx, x, y, dx, dy, color, dark) {
    const L = 0.2, W = 0.11;
    const ax = dx || 0.0001, ay = dy;
    const n = Math.hypot(ax, ay);
    const ux = ax / n, uy = ay / n, vx = -uy, vy = ux;
    const corner = (a, b) => iso(x + ux * a + vx * b, y + uy * a + vy * b);
    const pts = [corner(-L, -W), corner(L, -W), corner(L, W), corner(-L, W)];
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1] + 1) : ctx.moveTo(p[0], p[1] + 1)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1] - 3) : ctx.moveTo(p[0], p[1] - 3)); ctx.closePath(); ctx.fill();
    const roof = [corner(-L * 0.4, -W * 0.8), corner(L * 0.45, -W * 0.8), corner(L * 0.45, W * 0.8), corner(-L * 0.4, W * 0.8)];
    ctx.fillStyle = shade(color, -0.25);
    ctx.beginPath(); roof.forEach((p, i) => i ? ctx.lineTo(p[0], p[1] - 5.5) : ctx.moveTo(p[0], p[1] - 5.5)); ctx.closePath(); ctx.fill();
    if (dark > 0.2) {
      const [hx, hy] = corner(L + 0.05, 0);
      this.lights.push((cx, dk) => {
        const g = cx.createRadialGradient(hx, hy - 3, 0, hx, hy - 3, 9);
        g.addColorStop(0, `rgba(255,240,190,${0.6 * dk})`);
        g.addColorStop(1, 'rgba(255,240,190,0)');
        cx.fillStyle = g;
        cx.fillRect(hx - 9, hy - 12, 18, 18);
      });
    }
  }

  drawStreetLamps(ctx, dark) {
    for (let y = 0; y < MAP_H; y += 3) for (let x = 0; x < MAP_W; x += 3) {
      const [cx, cy] = iso(x + 0.5, y + 0.5);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
      g.addColorStop(0, `rgba(255, 200, 120, ${0.22 * dark})`);
      g.addColorStop(1, 'rgba(255, 200, 120, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 26, cy - 26, 52, 52);
    }
  }

  // Floating icon above each business / special building.
  drawBadge(ctx, s, lot) {
    let icon = null, ring = '#ffffff';
    if (lot.business) {
      icon = BIZ[lot.business.type].icon;
      ring = s.players[lot.business.owner].color;
    } else if (lot.kind === 'station') icon = '🚇';
    else if (lot.kind === 'utility') icon = lot.name.startsWith('Volt') ? '⚡' : '💧';
    if (!icon) return;
    const [cx, cy] = iso(lot.tx + 0.5, lot.ty + 0.5);
    const k = Math.max(0.75, Math.min(1.3, 1 / this.cam.z));
    const y = cy - (this.tops[lot.id] || 20) - 13 * k;
    const r = 9.5 * k;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.arc(cx, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2.2 * k;
    ctx.stroke();
    ctx.font = `${Math.round(11 * k)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#222';
    ctx.fillText(icon, cx, y + 0.5);
    if (lot.business) {
      // Closed overnight: a small moon.
      const def = BIZ[lot.business.type];
      const h = s.hour;
      if (!PROFILE[def.id][h]) {
        ctx.fillStyle = 'rgba(20,24,48,0.85)';
        ctx.beginPath(); ctx.arc(cx + r * 0.8, y - r * 0.7, 4.5 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe9a3';
        ctx.font = `${Math.round(6 * k)}px system-ui`;
        ctx.fillText('z', cx + r * 0.8, y - r * 0.7);
      }
    }
  }

  drawFloaters(ctx, dt) {
    const k = Math.max(0.8, Math.min(1.4, 1 / this.cam.z));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(11 * k)}px system-ui, sans-serif`;
    for (const f of this.floaters) {
      f.t += dt;
      const a = Math.max(0, 1 - f.t / 1.6);
      ctx.fillStyle = rgba(f.color, a);
      ctx.strokeStyle = `rgba(0,0,0,${0.5 * a})`;
      ctx.lineWidth = 3;
      const y = f.y - f.t * 26;
      ctx.strokeText(f.text, f.x, y);
      ctx.fillText(f.text, f.x, y);
    }
    this.floaters = this.floaters.filter(f => f.t < 1.6);
  }
}
