// Leftover Uprising - the kitchen on a 2D canvas. All art is placeholder:
// floor tiles, emoji food and coloured counters, ready to swap for real
// sprites later (each draw goes through one function per thing).

import { COLS, ROWS, PATHS, PATH_TILES, TOWERS, TREES, ENEMIES, pathPoint, doorsFor } from './data.js';

// ── Sprites (art/<name>.webp). Until one loads, or if it can't, the emoji
// placeholder is drawn instead, so the game never waits on art.
// The page sets globalThis.LU_ART_BASE when the art lives elsewhere.
const SPR = new Map(), spriteListeners = new Set();
export function sprite(name) {
  if (typeof Image === 'undefined') return null;
  let im = SPR.get(name);
  if (!im) {
    im = new Image();
    im.onload = () => { im.ok = true; for (const f of spriteListeners) f(name); };
    im.onerror = () => { im.bad = true; };
    im.src = (globalThis.LU_ART_BASE ?? 'art/') + name + '.webp';
    SPR.set(name, im);
  }
  return im.ok ? im : null;
}
// A pattern of a texture, scaled so one copy covers `px` pixels.
function scaledPattern(ctx, im, px) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(8, Math.round(px));
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return ctx.createPattern(c, 'repeat');
}

export class Renderer {
  // rotate: on a wide screen (a TV), turn the kitchen on its side so it fills
  // the width: food then marches left to right instead of top to bottom.
  constructor(canvas, { rotate = false } = {}) {
    this.c = canvas;
    this.allowRotate = rotate;
    this.x = canvas.getContext('2d');
    this.fx = [];
    // Floor art arriving late: redraw the background once it's in.
    spriteListeners.add(name => { if (name.startsWith('tex_') || name.startsWith('door_')) this.bg = null; });
    for (const n of ['tex_floor', 'tex_path', 'door_fridge', 'door_pantry', 'door_side', 'door_back']) sprite(n);
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
    const floorTex = sprite('tex_floor'), pathTex = sprite('tex_path');
    const floorPat = floorTex && scaledPattern(x, floorTex, s * 7), pathPat = pathTex && scaledPattern(x, pathTex, s * 3);
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const [px, py] = this.T(tx, ty);
      const path = PATH_TILES.has(tx + ',' + ty);
      const pat = path ? pathPat : floorPat;
      if (pat) {
        x.save(); x.translate(this.ox, this.oy); x.fillStyle = pat; x.fillRect(px - this.ox, py - this.oy, s + 0.5, s + 0.5); x.restore();
        // Soften the floor so the food and towers stand out from it.
        if (!path) { x.fillStyle = 'rgba(246,236,218,.45)'; x.fillRect(px, py, s + 0.5, s + 0.5); }
      }
      else { x.fillStyle = path ? ((tx + ty) % 2 ? '#5b4636' : '#634c3b') : ((tx + ty) % 2 ? '#e9dcc6' : '#f3e8d5'); x.fillRect(px, py, s + 0.5, s + 0.5); }
      // A faint grid on the floor, so it's clear where a tower would go.
      if (!path && pat) { x.strokeStyle = 'rgba(80,50,20,.10)'; x.lineWidth = 1; x.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1); }
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
    const DOOR_ART = ['door_fridge', 'door_pantry', 'door_side'];
    const doorArt = (name, cx, cy, on) => {
      const im = sprite(name); if (!im) return false;
      const [px, py] = this.P(cx, cy), w = s * 1.45;
      x.globalAlpha = on ? 1 : 0.35;
      x.drawImage(im, px - w / 2, py - w / 2, w, w);
      x.globalAlpha = 1;
      return true;
    };
    PATHS.forEach((p, i) => {
      const [sx, sy] = p.pts[0];
      const ax = Math.max(0, sx), ay = Math.max(0, sy);
      const [px, py] = this.P(ax + 0.5, ay + 0.5);
      if (doorArt(DOOR_ART[i], ax + 0.5, ay + 0.5, open.has(i))) {
        x.font = `800 ${Math.max(9, s * 0.26)}px system-ui`;
        x.lineWidth = 3; x.strokeStyle = 'rgba(29,20,16,.85)';
        x.fillStyle = open.has(i) ? '#ffd23f' : 'rgba(255,255,255,.7)';
        const t = open.has(i) ? p.door.toUpperCase() : '🔒';
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.strokeText(t, px, py + s * 0.55); x.fillText(t, px, py + s * 0.55);
        return;
      }
      x.font = `800 ${Math.max(9, s * 0.3)}px system-ui`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = open.has(i) ? '#ffd23f' : 'rgba(255,255,255,.35)';
      label(open.has(i) ? p.door.toUpperCase() : '🔒', px, py);
    });
    const [ex, ey] = this.P(6.5, ROWS - 0.5);
    const backArt = doorArt('door_back', 6.5, ROWS - 0.5, true);
    x.fillStyle = '#ff5a5f';
    x.font = `900 ${Math.max(9, s * 0.3)}px system-ui`;
    if (backArt) {
      // Over the door art, a label with an outline, set just above it.
      x.lineWidth = 3; x.strokeStyle = 'rgba(29,20,16,.85)'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const [lx, ly] = this.P(this.rot ? 6.5 : 6.5, ROWS - 1.25);
      x.strokeText('BACK DOOR', lx, ly); x.fillText('BACK DOOR', lx, ly);
    } else label('BACK DOOR', ex, ey);
    this.bg = cv; this.bgKey = key;
    return cv;
  }

  shake(amp = 6, ms = 500) { this.shakeAmp = amp; this.shakeDur = ms; this.shakeUntil = performance.now() + ms; }
  kick(id) { (this.kicks ||= new Map()).set(id, performance.now()); }
  addFx(f) {
    f.t0 = performance.now();
    // At most three bubbles on screen: the oldest makes way.
    if (f.k === 'bubble') { const b = this.fx.filter(q => q.k === 'bubble'); if (b.length >= 3) this.fx.splice(this.fx.indexOf(b[0]), 1); }
    this.fx.push(f); if (this.fx.length > 300) this.fx.shift();
  }

  draw(G, now) {
    const x = this.x, s = this.s;
    this.now = now;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#1d1410';
    x.fillRect(0, 0, this.c.width, this.c.height);
    // Screen shake (bosses arriving, big escapes): a few pixels, quickly fading.
    let sx = 0, sy = 0;
    if (this.shakeUntil > now) { const a = this.shakeAmp * (this.shakeUntil - now) / this.shakeDur; sx = (Math.random() * 2 - 1) * a; sy = (Math.random() * 2 - 1) * a; }
    x.drawImage(this.drawFloor(G.players.length || 1), sx * this.dpr, sy * this.dpr);
    x.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);

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
    this.viewById = new Map();
    for (const e of G.view) { this.food(e); this.viewById.set(e.id, e); }

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
    const im = sprite('tower_' + t.kind);
    if (im) {
      // Owner's colour as a disc under the station, then the station itself.
      x.beginPath(); x.ellipse(px + s / 2, py + s * 0.7, s * 0.52, s * 0.3, 0, 0, Math.PI * 2);
      x.fillStyle = owner?.color || '#888'; x.fill();
      x.lineWidth = Math.max(2, s * 0.09); x.strokeStyle = owner?.color || '#888'; x.stroke();
      x.lineWidth = 1.2; x.strokeStyle = 'rgba(29,20,16,.8)'; x.stroke();
      // Recoil when it fires: a quick squash towards its base.
      const k = Math.max(0, 1 - ((this.now || 0) - (this.kicks?.get(t.id) ?? -1e9)) / 130);
      const sw = s * 1.2 * (1 + 0.06 * k), sh = s * 1.2 * (1 - 0.12 * k);
      x.drawImage(im, px + s / 2 - sw / 2, py - s * 0.18 + (s * 1.2 - sh), sw, sh);
      for (let i = 0; i < def.tier; i++) {
        x.fillStyle = '#ffd23f'; x.strokeStyle = '#1d1410'; x.lineWidth = 1.2;
        x.beginPath(); x.arc(px + s * 0.2 + i * s * 0.17, py + s * 0.9, s * 0.07, 0, Math.PI * 2); x.fill(); x.stroke();
      }
      if (t.buff > 0) { x.fillStyle = '#7ee081'; x.font = `${s * 0.3}px system-ui`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('✦', px + s * 0.88, py + s * 0.12); }
      return;
    }
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
    const im = sprite(e.type);
    if (im) {
      // Waddle while walking (fliers float), squash when hit; frozen or
      // stunned food stands still.
      const now = this.now || 0, t = now / 1000, ph = (e.id % 97) * 0.7;
      const still = fl & (4 | 16);
      let bob = 0, rot = 0;
      if (!still) {
        if (def.air) bob = Math.sin(t * 3 + ph) * r * 0.18;
        else { const w8 = t * (def.speed > 1.5 ? 13 : 9) + ph; bob = -Math.abs(Math.sin(w8)) * r * 0.22; rot = Math.sin(w8) * 0.09; }
      }
      const hits = (this.hitT ||= new Map()), prev = (this.prevHp ||= new Map());
      if (prev.has(e.id) && e.hp < prev.get(e.id)) hits.set(e.id, now);
      prev.set(e.id, e.hp);
      const k = Math.max(0, 1 - (now - (hits.get(e.id) || -1e9)) / 140);
      const w = r * 2.7;
      x.save();
      x.translate(px, py + lift + bob);
      x.rotate(rot);
      x.scale(1 + 0.2 * k, 1 - 0.18 * k);
      x.drawImage(im, -w / 2, -w / 2, w, w);
      x.restore();
    } else if (def.icon === '🟢') {
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
    if (f.k === 'bubble') return this.bubble(f, age);
    if (f.k === 'shot') {
      // Each tree throws its own thing: fireballs, knives, snowflakes, syrup.
      const [ax, ay] = this.P(f.fx + 0.5, f.fy + 0.3), [bx, by] = this.P(f.x, f.y);
      const k = Math.min(1, age / (f.life * 0.85));
      const arc = f.tree === 'sticky' ? Math.sin(k * Math.PI) * s * 0.8 : 0;
      const qx = ax + (bx - ax) * k, qy = ay + (by - ay) * k - arc;
      x.strokeStyle = f.color; x.globalAlpha = 0.35 * (1 - k); x.lineWidth = Math.max(2, s * 0.06); x.lineCap = 'round';
      x.beginPath(); x.moveTo(ax + (bx - ax) * Math.max(0, k - 0.35), ay + (by - ay) * Math.max(0, k - 0.35)); x.lineTo(qx, qy); x.stroke();
      x.globalAlpha = 1;
      const glyph = SHOT_GLYPH[f.tree];
      if (glyph) {
        x.save(); x.translate(qx, qy);
        if (f.tree === 'chop') x.rotate(k * 12); else if (f.tree === 'cold') x.rotate(k * 4);
        x.font = `${s * 0.38}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(glyph, 0, 0); x.restore();
      } else { x.fillStyle = f.color; x.beginPath(); x.arc(qx, qy, s * 0.1, 0, Math.PI * 2); x.fill(); }
    } else if (f.k === 'crumbs') {
      // A burst of bits in the food's colours.
      const [px, py] = this.P(f.x, f.y);
      f.parts ||= Array.from({ length: f.big ? 18 : 10 }, () => ({ a: Math.random() * Math.PI * 2, v: 0.6 + Math.random() * 1.2, r: 0.04 + Math.random() * 0.06, c: f.colors[Math.floor(Math.random() * f.colors.length)] }));
      x.globalAlpha = Math.max(0, 1 - age / f.life);
      for (const q of f.parts) {
        const d = q.v * age * s * 2.2;
        x.fillStyle = q.c;
        x.beginPath(); x.arc(px + Math.cos(q.a) * d, py + Math.sin(q.a) * d + 3 * s * age * age, q.r * s * (f.big ? 1.6 : 1), 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
    } else if (f.k === 'escape') {
      // The escapee's victory hop out of the back door.
      const im = sprite(f.type); if (!im) return;
      const [px, py] = this.P(f.x, f.y), w = s * 0.9;
      x.globalAlpha = Math.max(0, 1 - age / f.life);
      x.drawImage(im, px - w / 2, py - w / 2 - Math.abs(Math.sin(age * 9)) * s * 0.5 - age * s * 0.6, w, w);
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

const SHOT_GLYPH = { heat: '🔥', chop: '🔪', cold: '❄️' };
// Crumb colours for each food's pop.
export const CRUMBS = {
  pea: ['#6cc04a', '#3d7a25'], grape: ['#7b3fa0', '#b07ad0'], meatball: ['#7a4a2a', '#c0392b'], drumstick: ['#c06a2a', '#f0c070'],
  broccoli: ['#3f8f2f', '#8fcf5a'], floret: ['#3f8f2f', '#8fcf5a'], celery: ['#8fcf5a', '#d8f0a0'], coconut: ['#6b4a2b', '#f5f0e0'],
  popcorn: ['#fff2b0', '#ffd23f'], cottoncandy: ['#ff9ad5', '#ffd0ea'], icecream: ['#ffe0f0', '#9fe6ff', '#ff8fc0'], frozenpeas: ['#9fe0d0', '#e0fff8'],
  jelly: ['#e0303a', '#ff7a80'], sourdough: ['#d49a5a', '#f0d8a8'], chili: ['#e02a1a', '#ff8a3d'], watermelon: ['#e8404f', '#3f8f2f', '#1d1410'],
  melonslice: ['#e8404f', '#1d1410'], bacon: ['#c0503a', '#f0c0a0'], cake: ['#ffffff', '#ffd0ea', '#ffd23f'], cake2: ['#ffffff', '#ffd0ea'],
  cupcake: ['#ff8fc0', '#ffd23f', '#7ee0ff'], turkey: ['#c8782a', '#f0c070'], pizza: ['#f0b040', '#c0392b', '#fff2b0'], slice: ['#f0b040', '#c0392b'], crust: ['#d8a050', '#f0d090'],
};

// A speech bubble that follows its food (and stays put once the food is gone).
Renderer.prototype.bubble = function (f, age) {
  const x = this.x, s = this.s;
  const e = this.viewById?.get(f.id);
  if (e) { const [cx, cy] = pathPoint(e.path, e.d); f.x = cx; f.y = cy; }
  const [px, py0] = this.P(f.x, f.y);
  const size = Math.max(11, s * (f.boss ? 0.42 : 0.34));
  x.font = `800 ${size}px system-ui, sans-serif`;
  // Wrap to a few words per line.
  const maxW = s * (f.boss ? 7 : 5.2);
  const lines = [];
  for (const word of f.text.split(' ')) {
    const cur = lines[lines.length - 1];
    if (cur && x.measureText(cur + ' ' + word).width <= maxW) lines[lines.length - 1] = cur + ' ' + word;
    else lines.push(word);
  }
  const w = Math.max(...lines.map(l => x.measureText(l).width)) + size * 1.1;
  const lh = size * 1.18, h = lines.length * lh + size * 0.7;
  const pop = Math.min(1, age / 0.12), fade = Math.min(1, (f.life - age) / 0.4);
  x.globalAlpha = Math.max(0, fade);
  const bx = Math.min(this.ox + (this.rot ? ROWS : COLS) * s - w - 2, Math.max(this.ox + 2, px - w / 2));
  const by = Math.max(this.oy + 2, py0 - s * 0.75 - h - 10);
  x.save();
  x.translate(px, py0 - s * 0.6); x.scale(pop, pop); x.translate(-px, -(py0 - s * 0.6));
  x.fillStyle = f.boss ? '#fff3c4' : '#ffffff';
  x.strokeStyle = f.boss ? '#e2552b' : 'rgba(29,20,16,.85)';
  x.lineWidth = f.boss ? 3 : 2;
  roundRect(x, bx, by, w, h, size * 0.6);
  x.fill(); x.stroke();
  // tail
  const tx = Math.min(bx + w - 12, Math.max(bx + 12, px));
  x.beginPath(); x.moveTo(tx - 7, by + h - 1); x.lineTo(px, py0 - s * 0.45); x.lineTo(tx + 7, by + h - 1); x.closePath();
  x.fill(); x.stroke();
  x.fillRect(tx - 6, by + h - 3, 12, 3);
  x.fillStyle = '#1d1410'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, bx + w / 2, by + size * 0.35 + lh * (i + 0.5)));
  x.restore();
  x.globalAlpha = 1;
};

function roundRect(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
