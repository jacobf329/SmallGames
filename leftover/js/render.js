// Leftover Uprising - the kitchen on a 2D canvas. All art is placeholder:
// floor tiles, emoji food and coloured counters, ready to swap for real
// sprites later (each draw goes through one function per thing).

import { COLS, ROWS, PATHS, PATH_TILES, TOWERS, TREES, ENEMIES, pathPoint, doorsFor } from './data.js';

export class Renderer {
  // rotate: on a wide screen (a TV), turn the kitchen on its side so it fills
  // the width: food then marches left to right instead of top to bottom.
  constructor(canvas, { rotate = false } = {}) {
    this.c = canvas;
    this.allowRotate = rotate;
    this.x = canvas.getContext('2d');
    this.fx = [];
    this.resize();
    addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(canvas);
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.c.width = Math.max(1, r.width * this.dpr);
    this.c.height = Math.max(1, r.height * this.dpr);
    this.w = r.width; this.h = r.height;
    this.rot = this.allowRotate && this.w > this.h * 1.15;
    const gw = this.rot ? ROWS : COLS, gh = this.rot ? COLS : ROWS;
    this.s = Math.floor(Math.min(this.w / gw, this.h / gh) * 100) / 100;
    this.ox = (this.w - this.s * gw) / 2;
    this.oy = (this.h - this.s * gh) / 2;
    this.bg = null;
  }
  // Screen point -> tile.
  tileAt(px, py) {
    const a = Math.floor((px - this.ox) / this.s), b = Math.floor((py - this.oy) / this.s);
    const x = this.rot ? COLS - 1 - b : a, y = this.rot ? a : b;
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? { x, y } : null;
  }
  // Kitchen point (in tiles) -> screen.
  P(tx, ty) { return this.rot ? [this.ox + ty * this.s, this.oy + (COLS - tx) * this.s] : [this.ox + tx * this.s, this.oy + ty * this.s]; }
  // Top-left corner on screen of tile (tx, ty).
  T(tx, ty) { return this.rot ? this.P(tx + 1, ty) : this.P(tx, ty); }

  // The floor never changes, so draw it once per size.
  drawFloor(nPlayers) {
    const key = `${this.c.width}x${this.c.height}:${nPlayers}`;
    if (this.bg && this.bgKey === key) return this.bg;
    const cv = document.createElement('canvas');
    cv.width = this.c.width; cv.height = this.c.height;
    const x = cv.getContext('2d');
    x.scale(this.dpr, this.dpr);
    const s = this.s;
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const [px, py] = this.T(tx, ty);
      const path = PATH_TILES.has(tx + ',' + ty);
      x.fillStyle = path ? ((tx + ty) % 2 ? '#5b4636' : '#634c3b') : ((tx + ty) % 2 ? '#e9dcc6' : '#f3e8d5');
      x.fillRect(px, py, s + 0.5, s + 0.5);
    }
    // Path edging so the route reads at a glance.
    x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1;
    for (const k of PATH_TILES) {
      const [tx, ty] = k.split(',').map(Number);
      const [px, py] = this.T(tx, ty);
      x.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
    }
    // Doors. Labels are kept inside the kitchen even when they sit on its edge.
    const gw = (this.rot ? ROWS : COLS) * s, gh = (this.rot ? COLS : ROWS) * s;
    const label = (text, px, py) => {
      const w = x.measureText(text).width / 2 + 4;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, Math.min(this.ox + gw - w, Math.max(this.ox + w, px)), Math.min(this.oy + gh - 8, Math.max(this.oy + 8, py)));
    };
    const open = new Set(doorsFor(nPlayers));
    PATHS.forEach((p, i) => {
      const [sx, sy] = p.pts[0];
      const ax = Math.max(0, sx), ay = Math.max(0, sy);
      const [px, py] = this.P(ax + 0.5, ay + 0.5);
      x.font = `800 ${Math.max(9, s * 0.3)}px system-ui`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = open.has(i) ? '#ffd23f' : 'rgba(255,255,255,.35)';
      label(open.has(i) ? p.door.toUpperCase() : '🔒', px, py);
    });
    const [ex, ey] = this.P(6.5, ROWS - 0.5);
    x.fillStyle = '#ff5a5f';
    x.font = `900 ${Math.max(9, s * 0.3)}px system-ui`;
    label('BACK DOOR', ex, ey);
    this.bg = cv; this.bgKey = key;
    return cv;
  }

  addFx(f) { f.t0 = performance.now(); this.fx.push(f); if (this.fx.length > 300) this.fx.shift(); }

  draw(G, now) {
    const x = this.x, s = this.s;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#1d1410';
    x.fillRect(0, 0, this.c.width, this.c.height);
    x.drawImage(this.drawFloor(G.players.length || 1), 0, 0);
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Selected tile
    if (G.sel?.tile) {
      const [px, py] = this.T(G.sel.tile.x, G.sel.tile.y);
      x.strokeStyle = '#ffd23f'; x.lineWidth = 3;
      x.strokeRect(px + 2, py + 2, s - 4, s - 4);
      const prep = TOWERS.prep;
      this.ring(G.sel.tile.x + 0.5, G.sel.tile.y + 0.5, prep.range, 'rgba(255,210,63,.6)');
    }

    // Towers
    const owners = new Map(G.players.map(p => [p.id, p]));
    for (const t of G.towers.values()) this.tower(t, owners.get(t.owner), G.sel?.tower === t.id, G.showRanges);

    // Food, smoothed between snapshots
    for (const e of G.view) this.food(e);

    // Effects
    const keep = [];
    for (const f of this.fx) {
      const age = (now - f.t0) / 1000;
      if (age > (f.life || 0.25)) continue;
      keep.push(f);
      this.effect(f, age);
    }
    this.fx = keep;
  }

  ring(cx, cy, r, color) {
    const x = this.x, [px, py] = this.P(cx, cy);
    x.beginPath(); x.arc(px, py, r * this.s, 0, Math.PI * 2);
    x.fillStyle = color.replace(/[\d.]+\)$/, '0.08)'); x.fill();
    x.strokeStyle = color; x.lineWidth = 1.5; x.stroke();
  }

  tower(t, owner, selected, showRange) {
    const x = this.x, s = this.s, def = TOWERS[t.kind];
    const [px, py] = this.T(t.x, t.y);
    const pad = s * 0.08;
    if (selected || showRange) this.ring(t.x + 0.5, t.y + 0.5, def.range, selected ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.18)');
    x.fillStyle = def.tree ? TREES[def.tree].color : '#b9a58c';
    roundRect(x, px + pad, py + pad, s - pad * 2, s - pad * 2, s * 0.18);
    x.fill();
    x.lineWidth = Math.max(2, s * 0.09);
    x.strokeStyle = owner?.color || '#888';
    x.stroke();
    x.font = `${s * 0.5}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(def.icon, px + s / 2, py + s / 2 + s * 0.02);
    // Tier pips
    for (let i = 0; i < def.tier; i++) {
      x.fillStyle = '#1d1410';
      x.beginPath(); x.arc(px + s * 0.22 + i * s * 0.15, py + s * 0.84, s * 0.055, 0, Math.PI * 2); x.fill();
    }
    if (t.buff > 0) { x.fillStyle = '#7ee081'; x.font = `${s * 0.28}px system-ui`; x.fillText('✦', px + s * 0.82, py + s * 0.2); }
  }

  food(e) {
    const x = this.x, s = this.s, def = ENEMIES[e.type];
    const [cx, cy] = pathPoint(e.path, e.d);
    // Spread side by side within the lane so crowds don't stack.
    const [nx, ny] = pathPoint(e.path, e.d + 0.05);
    const ang = Math.atan2(ny - cy, nx - cx);
    const off = e.lat * 0.45;
    const fx = cx - Math.sin(ang) * off, fy = cy + Math.cos(ang) * off;
    const [px, py] = this.P(fx, fy);
    const r = def.size * s * 0.5;
    if (def.air) { x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(px, py + r * 0.9, r * 0.7, r * 0.25, 0, 0, Math.PI * 2); x.fill(); }
    const lift = def.air ? -r * 0.5 : 0;
    // Status rings: burn, cold, frozen, sticky
    const fl = e.fl;
    if (fl & 4) { x.fillStyle = 'rgba(140,220,255,.55)'; x.beginPath(); x.arc(px, py + lift, r * 1.15, 0, Math.PI * 2); x.fill(); }
    if (fl & 8) { x.fillStyle = 'rgba(224,160,64,.5)'; x.beginPath(); x.ellipse(px, py + r * 0.6, r * 1.1, r * 0.4, 0, 0, Math.PI * 2); x.fill(); }
    if (fl & 1) { x.strokeStyle = 'rgba(255,107,53,.9)'; x.lineWidth = 2; x.beginPath(); x.arc(px, py + lift, r * 1.05, 0, Math.PI * 2); x.stroke(); }
    if (fl & 2 && !(fl & 4)) { x.strokeStyle = 'rgba(111,211,255,.9)'; x.lineWidth = 2; x.beginPath(); x.arc(px, py + lift, r * 0.95, 0, Math.PI * 2); x.stroke(); }
    if (def.icon === '🟢') {
      x.fillStyle = '#6cc04a'; x.beginPath(); x.arc(px, py + lift, r * 0.8, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#3d7a25'; x.lineWidth = 1.5; x.stroke();
    } else {
      x.font = `${r * 1.9}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(def.icon, px, py + lift);
    }
    if (fl & 16) { x.font = `${r}px system-ui`; x.fillText('💫', px, py + lift - r); }
    // HP bar (only once hurt, always for bosses)
    if (e.hp < 100 || def.boss) {
      const w = Math.max(s * 0.5, r * 2), h = Math.max(3, s * 0.07);
      const bx = px - w / 2, by = py + lift - r - h - 3;
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(bx, by, w, h);
      x.fillStyle = e.hp > 50 ? '#6fdc8c' : e.hp > 25 ? '#ffd23f' : '#ff5a5f';
      x.fillRect(bx, by, w * e.hp / 100, h);
    }
  }

  effect(f, age) {
    const x = this.x, s = this.s;
    if (f.k === 'shot') {
      const [ax, ay] = this.P(f.fx + 0.5, f.fy + 0.5), [bx, by] = this.P(f.x, f.y);
      const k = age / 0.12;
      if (k > 1) return;
      x.strokeStyle = f.color; x.lineWidth = Math.max(2, s * 0.08); x.lineCap = 'round';
      x.globalAlpha = 1 - k;
      x.beginPath(); x.moveTo(ax + (bx - ax) * k * 0.6, ay + (by - ay) * k * 0.6); x.lineTo(bx, by); x.stroke();
      x.globalAlpha = 1;
    } else if (f.k === 'aura') {
      const [px, py] = this.P(f.x + 0.5, f.y + 0.5);
      x.strokeStyle = f.color; x.lineWidth = 3; x.globalAlpha = 1 - age / f.life;
      x.beginPath(); x.arc(px, py, f.r * s * (0.4 + 0.6 * age / f.life), 0, Math.PI * 2); x.stroke();
      x.globalAlpha = 1;
    } else if (f.k === 'text') {
      const [px, py] = this.P(f.x, f.y);
      x.globalAlpha = Math.max(0, 1 - age / f.life);
      x.font = `900 ${f.size * s}px system-ui`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.6)';
      x.strokeText(f.text, px, py - age * s * 0.8);
      x.fillStyle = f.color; x.fillText(f.text, px, py - age * s * 0.8);
      x.globalAlpha = 1;
    }
  }
}

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
