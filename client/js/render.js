// Pseudo-3D track renderer on a 2D canvas. Everything is projected from the
// runner's chase camera; objects are painted far-to-near.

import * as C from '/shared/constants.js';
import { OB, PICK } from '/shared/constants.js';
import { laneX } from '/shared/track.js';

const DRAW_DIST = 190;
const HORIZON = 0.42;
const FADE_NEAR = 5.2;     // runners closer than this to the camera fade out
const CLIP_NEAR = 2.6;
const PICKUP_CLIP = 3.0;   // coins level with the camera just smear the screen
const pickupFade = (dz) => Math.min(1, (dz - PICKUP_CLIP) / 1.8);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cam = { x: 0, y: 5.0, z: -12, yBase: 0 };
    this.shake = 0;
    this.particles = [];
    this.time = 0;
    this.dpr = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.W = Math.floor(window.innerWidth);
    this.H = Math.floor(window.innerHeight);
    this.canvas.width = Math.floor(this.W * dpr);
    this.canvas.height = Math.floor(this.H * dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.W / 2;
    this.cy = this.H * HORIZON;
    // Scale to the screen: portrait keys off width, landscape off height so a
    // short viewport does not fill up with two giant runners.
    this.pscale = Math.min(Math.max(this.W, this.H * 0.62), this.H * 1.15) * 0.5;
    this.depth = 1.7;
  }

  project(x, y, z) {
    const dz = z - this.cam.z;
    if (dz <= 0.5) return null;
    const s = this.depth / dz;
    return {
      x: this.cx + s * (x - this.cam.x) * this.pscale,
      y: this.cy - s * (y - this.cam.y) * this.pscale,
      s: s * this.pscale,
      dz
    };
  }

  addShake(v) { this.shake = Math.min(1.4, this.shake + v); }

  burst(x, y, z, color, n = 12, spread = 6, up = 5) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y, z, color,
        vx: (Math.random() - 0.5) * spread,
        vy: Math.random() * up,
        vz: (Math.random() - 0.5) * spread,
        life: 0.5 + Math.random() * 0.5,
        max: 1, size: 0.12 + Math.random() * 0.22
      });
    }
  }

  trail(x, y, z, color) {
    this.particles.push({
      x: x + (Math.random() - 0.5), y: y + Math.random() * 0.5, z,
      color, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 1.4, vz: -6 - Math.random() * 5,
      life: 0.35, max: 0.35, size: 0.2 + Math.random() * 0.3
    });
  }

  // ------------------------------------------------------------------ draw --
  draw(world, dt) {
    const ctx = this.ctx;
    this.time += dt;
    const me = world.me;

    // --- camera -------------------------------------------------------------
    const yBase = me.path === 1 ? C.SHORTCUT_HEIGHT : 0;
    this.cam.yBase += (yBase - this.cam.yBase) * Math.min(1, dt * 5);
    const back = 6.0 + Math.min(2.8, me.speed * 0.095);
    const camXTarget = me.rx * 0.82;
    this.cam.x += (camXTarget - this.cam.x) * Math.min(1, dt * 7);
    this.cam.y += ((3.15 + this.cam.yBase + me.y * 0.45) - this.cam.y) * Math.min(1, dt * 6);
    this.cam.z = me.z - back;

    this.shake = Math.max(0, this.shake - dt * 2.6);
    let shx = 0, shy = 0;
    if (this.shake > 0) {
      shx = (Math.random() - 0.5) * this.shake * 22;
      shy = (Math.random() - 0.5) * this.shake * 18;
    }
    ctx.save();
    ctx.translate(shx, shy);

    this.drawSky(world);
    this.drawGround(world);
    this.drawObjects(world, dt);
    this.drawSpeedFx(world);

    ctx.restore();
  }

  drawSky(world) {
    const ctx = this.ctx, W = this.W, H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, this.cy + 40);
    g.addColorStop(0, '#060a16');
    g.addColorStop(0.45, '#141d3d');
    g.addColorStop(0.8, '#3a2a5c');
    g.addColorStop(1, '#ff6b5a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, this.cy + 60);

    // sun
    const sunX = this.cx - this.cam.x * 3;
    ctx.globalAlpha = 0.85;
    const sg = ctx.createRadialGradient(sunX, this.cy - 6, 4, sunX, this.cy - 6, 120);
    sg.addColorStop(0, 'rgba(255,220,120,0.95)');
    sg.addColorStop(0.5, 'rgba(255,110,90,0.35)');
    sg.addColorStop(1, 'rgba(255,110,90,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - 130, this.cy - 130, 260, 200);
    ctx.globalAlpha = 1;

    // parallax skyline
    for (let layer = 0; layer < 2; layer++) {
      const depth = layer === 0 ? 0.055 : 0.13;
      const h = layer === 0 ? 46 : 82;
      ctx.fillStyle = layer === 0 ? 'rgba(12,16,34,0.85)' : 'rgba(8,11,24,0.95)';
      const off = -(this.cam.x * depth * 30) - (this.cam.z * depth * 1.6);
      const step = layer === 0 ? 46 : 66;
      const start = Math.floor((off - W) / step);
      for (let i = start; i < start + Math.ceil((W * 2) / step) + 2; i++) {
        const hh = h * (0.45 + 0.55 * fract(Math.sin(i * 12.9898 + layer * 4.1) * 43758.5453));
        const x = i * step - off;
        ctx.fillRect(x, this.cy - hh, step - 6, hh + 8);
      }
    }

    // ground haze below the horizon
    const gg = ctx.createLinearGradient(0, this.cy, 0, H);
    gg.addColorStop(0, '#1a1230');
    gg.addColorStop(1, '#080a14');
    ctx.fillStyle = gg;
    ctx.fillRect(0, this.cy, W, H - this.cy);
  }

  // Road surface for the main track and any shortcut rails in view.
  drawGround(world) {
    const ctx = this.ctx;
    const track = world.track;
    const z0 = this.cam.z + 1;
    const z1 = this.cam.z + DRAW_DIST;

    // Main road, drawn far to near in variable-size slabs.
    const half = (C.MAIN_LANES * C.LANE_W) / 2;
    const slabs = [];
    let z = z1;
    while (z > z0) {
      const d = z - this.cam.z;
      const step = d > 110 ? 12 : d > 60 ? 7 : d > 25 ? 4 : 2.5;
      slabs.push([Math.max(z0, z - step), z]);
      z -= step;
    }
    for (const [a, b] of slabs) {
      this.roadSlab(a, b, half, 0, 0, Math.floor(a / 7) % 2 === 0 ? '#22283e' : '#1d2337');
    }

    // Lane divider dashes.
    ctx.strokeStyle = 'rgba(220,235,255,0.35)';
    for (let l = 1; l < C.MAIN_LANES; l++) {
      const x = (l - C.MAIN_LANES / 2) * C.LANE_W;
      let zz = Math.floor(z0 / 6) * 6;
      while (zz < z1) {
        this.groundLine(x, zz + 1, zz + 3.4, 0, 0.16, 'rgba(220,235,255,0.32)');
        zz += 6;
      }
    }
    // Edge rails (started a few metres out so they do not smear across the screen).
    const railZ = this.cam.z + 7;
    this.groundLine(-half - 0.3, railZ, z1, 0, 0.4, 'rgba(46,230,255,0.55)');
    this.groundLine(half + 0.3, railZ, z1, 0, 0.4, 'rgba(255,61,104,0.55)');
    this.sideWalls(z0, z1, half);

    // Shortcut rails.
    for (const sc of track.shortcuts) {
      if (sc.exitZ < z0 - 20 || sc.entryZ > z1) continue;
      this.drawShortcut(sc, Math.max(z0, sc.entryZ - 6), Math.min(z1, sc.exitZ + 8));
    }

    // Finish line.
    const fz = world.finishZ;
    if (fz > z0 - 10 && fz < z1) this.finishLine(fz, half);
  }

  roadSlab(zNear, zFar, half, offX, y, color) {
    const ctx = this.ctx;
    const a = this.project(offX - half, y, zNear);
    const b = this.project(offX + half, y, zNear);
    const c = this.project(offX + half, y, zFar);
    const d = this.project(offX - half, y, zFar);
    if (!a || !b || !c || !d) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  groundLine(x, zA, zB, y, w, color) {
    const ctx = this.ctx;
    const a = this.project(x - w / 2, y + 0.02, zA);
    const b = this.project(x + w / 2, y + 0.02, zA);
    const c = this.project(x + w / 2, y + 0.02, zB);
    const d = this.project(x - w / 2, y + 0.02, zB);
    if (!a || !b || !c || !d) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  sideWalls(z0, z1, half) {
    const ctx = this.ctx;
    for (const side of [-1, 1]) {
      const x = side * (half + 0.4);
      let zz = Math.floor(z0 / 14) * 14;
      while (zz < z1) {
        const p0 = this.project(x, 0, zz);
        const p1 = this.project(x, 2.6, zz);
        if (p0 && p1 && p0.dz > 2) {
          ctx.strokeStyle = side < 0 ? 'rgba(46,230,255,0.30)' : 'rgba(255,61,104,0.30)';
          ctx.lineWidth = Math.max(1, p0.s * 0.05);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        zz += 14;
      }
    }
  }

  drawShortcut(sc, z0, z1) {
    const ctx = this.ctx;
    const half = (C.SHORTCUT_LANES * C.LANE_W) / 2;
    const ox = sc.side * C.SHORTCUT_OFFSET;
    const y = C.SHORTCUT_HEIGHT;

    let z = Math.min(z1, this.cam.z + DRAW_DIST);
    while (z > z0) {
      const step = (z - this.cam.z) > 60 ? 10 : 4;
      const a = Math.max(z0, z - step);
      this.roadSlab(a, z, half, ox, y, Math.floor(a / 7) % 2 === 0 ? '#2a1f42' : '#241a3a');
      z -= step;
    }
    // glowing edges
    this.railEdge(ox - half, ox - half, y, z0, z1, 'rgba(255,210,63,0.55)');
    this.railEdge(ox + half, ox + half, y, z0, z1, 'rgba(255,210,63,0.55)');

    // support pillars
    ctx.fillStyle = 'rgba(18,22,40,0.9)';
    for (let pz = Math.ceil(z0 / 16) * 16; pz < z1; pz += 16) {
      const top = this.project(ox, y, pz);
      const bot = this.project(ox, 0, pz);
      if (!top || !bot) continue;
      const w = Math.max(1.5, top.s * 0.5);
      ctx.fillRect(top.x - w / 2, top.y, w, bot.y - top.y);
    }

    // entry arch so players can see where the shortcut starts
    const arch = this.project(laneX(0, sc.entryLane, 0), 0, sc.entryZ - 4);
    if (arch && sc.entryZ - 4 > this.cam.z + 2) {
      const s = arch.s;
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = Math.max(1.5, s * 0.09);
      ctx.beginPath();
      ctx.moveTo(arch.x - s * 1.4, arch.y);
      ctx.lineTo(arch.x - s * 1.4, arch.y - s * 3.4);
      ctx.lineTo(arch.x + s * 1.4, arch.y - s * 3.4);
      ctx.lineTo(arch.x + s * 1.4, arch.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,210,63,0.95)';
      const fs = Math.min(22, Math.max(8, s * 0.9));
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const tw = ctx.measureText('SHORTCUT').width;
      const tx = Math.max(tw / 2 + 6, Math.min(this.W - tw / 2 - 6, arch.x));
      ctx.fillText('SHORTCUT', tx, Math.max(fs + 4, arch.y - s * 3.75));
      ctx.textAlign = 'left';
    }
  }

  railEdge(x0, x1, y, z0, z1, color) {
    const ctx = this.ctx;
    const a = this.project(x0, y, z0);
    const b = this.project(x1, y, z1);
    const c = this.project(x1, y + 0.9, z1);
    const d = this.project(x0, y + 0.9, z0);
    if (!a || !b || !c || !d) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath(); ctx.fill();
  }

  finishLine(fz, half) {
    const ctx = this.ctx;
    for (let i = 0; i < 10; i++) {
      const x = -half + (i * (half * 2)) / 10;
      this.groundLine(x + half / 10, fz, fz + 3, 0, half / 5, i % 2 ? '#ffffff' : '#101422');
    }
    const p = this.project(0, 7, fz);
    const l = this.project(-half - 1, 0, fz);
    const r = this.project(half + 1, 0, fz);
    if (p && l && r) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(2, p.s * 0.14);
      ctx.beginPath();
      ctx.moveTo(l.x, l.y); ctx.lineTo(l.x, p.y); ctx.lineTo(r.x, p.y); ctx.lineTo(r.x, r.y);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `900 ${Math.max(9, p.s * 1.1)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('FINISH', p.x, p.y - p.s * 0.5);
      ctx.textAlign = 'left';
    }
  }

  // Everything that sits on the road, sorted back to front.
  drawObjects(world, dt) {
    const z0 = this.cam.z - 6;
    const z1 = this.cam.z + DRAW_DIST;
    const items = [];

    for (const path of [0, 1]) {
      for (const e of world.track.near(z0, z1, path)) {
        if (world.taken && world.taken.has(e.id) && e.kind !== 'obstacle') continue;
        items.push({ z: e.z, kind: 'e', e });
      }
    }
    for (const p of world.players) items.push({ z: p.z, kind: 'p', p });
    for (const pr of world.projectiles) items.push({ z: pr.z, kind: 'r', pr });

    // particles
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.z += pt.vz * dt;
      pt.vy -= 14 * dt;
      if (pt.y < 0) { pt.y = 0; pt.vy *= -0.35; pt.vx *= 0.7; pt.vz *= 0.7; }
    }
    this.particles = this.particles.filter(p => p.life > 0 && p.z > z0 - 10);
    for (const pt of this.particles) items.push({ z: pt.z, kind: 't', pt });

    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      if (it.kind === 'e') this.drawEntity(it.e);
      else if (it.kind === 'p') this.drawRunner(it.p, world);
      else if (it.kind === 'r') this.drawProjectile(it.pr);
      else this.drawParticle(it.pt);
    }
  }

  yOff(path) { return path === 1 ? C.SHORTCUT_HEIGHT : 0; }

  drawEntity(e) {
    const ctx = this.ctx;
    const yb = this.yOff(e.path);
    if (e.kind === PICK.COIN) {
      const bob = Math.sin(this.time * 4 + e.z) * 0.18;
      const p = this.project(e.x, yb + 1.0 + bob, e.z);
      if (!p || p.dz < PICKUP_CLIP) return;
      const r = Math.max(1, p.s * 0.42);
      ctx.save();
      ctx.globalAlpha = pickupFade(p.dz);
      ctx.translate(p.x, p.y);
      ctx.scale(Math.abs(Math.cos(this.time * 3 + e.z * 0.4)) * 0.75 + 0.25, 1);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.25, r * 0.42, 0, 7); ctx.fill();
      ctx.restore();
      return;
    }
    if (e.kind === PICK.BOX) {
      const probe = this.project(e.x, yb + 1.1, e.z);
      if (!probe || probe.dz < PICKUP_CLIP) return;
      ctx.globalAlpha = pickupFade(probe.dz);
      const bob = Math.sin(this.time * 3 + e.z * 0.3) * 0.2;
      const y = yb + 1.1 + bob;
      const s = 0.85;
      const spin = this.time * 1.6 + e.z;
      this.box3d(e.x, y - s / 2, y + s / 2, e.z, e.z + s, s * (0.7 + Math.abs(Math.cos(spin)) * 0.5),
        '#3ddc84', '#2bb96b', '#69f7a8');
      const p = this.project(e.x, y, e.z);
      if (p && p.s > 6) {
        ctx.fillStyle = '#04240f';
        ctx.font = `900 ${p.s * 0.7}px system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', p.x, p.y);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      ctx.globalAlpha = 1;
      return;
    }

    switch (e.type) {
      case OB.BLOCK:
        this.box3d(e.x, yb, yb + 3.6, e.z, e.z + e.len, e.w, '#4a5270', '#333a52', '#5d6688');
        this.stripes(e.x, yb + 0.1, e.z, e.w);
        break;
      case OB.BARRIER:
        this.box3d(e.x, yb, yb + 1.1, e.z, e.z + 0.9, e.w, '#ff8a3d', '#c9601f', '#ffb070');
        this.stripes(e.x, yb + 1.12, e.z, e.w);
        break;
      case OB.CONE: {
        const b = this.project(e.x, yb, e.z);
        const t = this.project(e.x, yb + 0.8, e.z);
        if (!b || !t) break;
        const w = b.s * 0.45;
        ctx.fillStyle = '#ff6a2b';
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(b.x + w, b.y); ctx.lineTo(b.x - w, b.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(b.x - w * 0.6, b.y - (b.y - t.y) * 0.45, w * 1.2, Math.max(1, b.s * 0.08));
        break;
      }
      case OB.HIGHBAR: {
        this.box3d(e.x, yb + 1.25, yb + 1.95, e.z, e.z + 0.8, e.w, '#ff4d5a', '#b8323d', '#ff8890');
        for (const sgn of [-1, 1]) {
          const a = this.project(e.x + sgn * e.w / 2, yb, e.z + 0.4);
          const b2 = this.project(e.x + sgn * e.w / 2, yb + 3.4, e.z + 0.4);
          if (!a || !b2) continue;
          ctx.strokeStyle = '#8d97b5';
          ctx.lineWidth = Math.max(1, a.s * 0.09);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
        }
        break;
      }
      case OB.RAMP: {
        const bl = this.project(e.x - e.w / 2, yb, e.z);
        const br = this.project(e.x + e.w / 2, yb, e.z);
        const tl = this.project(e.x - e.w / 2, yb + 1.5, e.z + e.len);
        const tr = this.project(e.x + e.w / 2, yb + 1.5, e.z + e.len);
        const fl = this.project(e.x - e.w / 2, yb, e.z + e.len);
        const fr = this.project(e.x + e.w / 2, yb, e.z + e.len);
        if (!bl || !br || !tl || !tr || !fl || !fr) break;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(br.x, br.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(tl.x, tl.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c79c14';
        ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.lineTo(fr.x, fr.y); ctx.lineTo(fl.x, fl.y); ctx.closePath(); ctx.fill();
        break;
      }
      case OB.PAD: {
        const glow = 0.45 + Math.sin(this.time * 8 + e.z) * 0.25;
        this.groundLine(e.x, e.z, e.z + e.len, yb, e.w, `rgba(46,230,255,${glow.toFixed(2)})`);
        for (let i = 0; i < 3; i++) {
          const cz = e.z + 0.6 + i * 1.4;
          this.groundLine(e.x, cz, cz + 0.6, yb, e.w * 0.55, 'rgba(255,255,255,0.75)');
        }
        break;
      }
      default: break;
    }
  }

  stripes(x, y, z, w) {
    for (let i = 0; i < 4; i++) {
      this.groundLine(x - w / 2 + w * (i + 0.5) / 4, z - 0.05, z + 0.05, y, w / 8, i % 2 ? '#ffe14d' : '#1b1b1b');
    }
  }

  box3d(x, yLo, yHi, zNear, zFar, w, front, side, top) {
    const ctx = this.ctx;
    const P = (dx, y, z) => this.project(x + dx, y, z);
    const hw = w / 2;
    const nTL = P(-hw, yHi, zNear), nTR = P(hw, yHi, zNear), nBL = P(-hw, yLo, zNear), nBR = P(hw, yLo, zNear);
    const fTL = P(-hw, yHi, zFar), fTR = P(hw, yHi, zFar), fBL = P(-hw, yLo, zFar), fBR = P(hw, yLo, zFar);
    if (!nTL || !nTR || !nBL || !nBR) return;
    const poly = (pts, fill) => {
      if (pts.some(p => !p)) return;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath(); ctx.fill();
    };
    // top face, then whichever side we can see, then the face toward the camera
    poly([nTL, nTR, fTR, fTL], top);
    if (x - hw > this.cam.x) poly([nTL, fTL, fBL, nBL], side);
    else if (x + hw < this.cam.x) poly([nTR, fTR, fBR, nBR], side);
    poly([nTL, nTR, nBR, nBL], front);
  }

  drawRunner(p, world) {
    const ctx = this.ctx;
    const yb = this.yOff(p.path);
    const x = p.rx !== undefined ? p.rx : p.x;
    const y = yb + p.y;
    const ground = this.project(x, yb + 0.02, p.z);
    const base = this.project(x, y, p.z);
    if (!base || base.dz < 0.8) return;
    const s = base.s;
    if (s < 0.6) return;
    if (base.dz < CLIP_NEAR) return;
    const nearFade = base.dz < FADE_NEAR ? (base.dz - CLIP_NEAR) / (FADE_NEAR - CLIP_NEAR) : 1;

    const sliding = !!(p.flags & 2);
    const spin = !!(p.flags & 2048);
    const star = !!(p.flags & 32);
    const shield = !!(p.flags & 16);
    const boost = !!(p.flags & 64);
    const rocket = !!(p.flags & 128);
    const bolt = !!(p.flags & 256);
    const invuln = !!(p.flags & 8);

    // shadow
    if (ground) {
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.12, 0.42 - p.y * 0.08)})`;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, s * 0.55, s * 0.2, 0, 0, 7);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(base.x, base.y);
    if (spin) ctx.rotate(Math.sin(this.time * 26) * 0.5);
    ctx.globalAlpha = nearFade;
    if (invuln && !star && Math.floor(this.time * 14) % 2 === 0) ctx.globalAlpha = nearFade * 0.45;

    const h = sliding ? 1.05 : 1.85;
    const w = sliding ? 1.25 : 0.92;
    const bodyH = s * h;
    const bodyW = s * w;
    const bob = sliding ? 0 : Math.sin(this.time * 16 + p.z) * s * 0.06;

    // board
    ctx.fillStyle = '#20263c';
    roundRect(ctx, -bodyW * 0.62, -s * 0.12, bodyW * 1.24, s * 0.22, s * 0.1);
    ctx.fill();

    // body
    const grad = ctx.createLinearGradient(0, -bodyH, 0, 0);
    grad.addColorStop(0, lighten(p.color, 0.35));
    grad.addColorStop(1, p.color);
    ctx.fillStyle = grad;
    roundRect(ctx, -bodyW / 2, -bodyH + bob, bodyW, bodyH - s * 0.1, s * 0.28);
    ctx.fill();

    // head
    ctx.fillStyle = '#f2d7bd';
    ctx.beginPath();
    ctx.arc(0, -bodyH - s * 0.22 + bob, s * 0.33, 0, 7);
    ctx.fill();
    ctx.fillStyle = darken(p.color, 0.3);
    ctx.beginPath();
    ctx.arc(0, -bodyH - s * 0.3 + bob, s * 0.35, Math.PI, 0);
    ctx.fill();

    // arms / motion streaks
    ctx.strokeStyle = `rgba(255,255,255,0.25)`;
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.6, -bodyH * 0.55);
    ctx.lineTo(-bodyW * 1.0 - (boost ? s * 0.4 : 0), -bodyH * 0.35);
    ctx.moveTo(bodyW * 0.6, -bodyH * 0.55);
    ctx.lineTo(bodyW * 1.0 + (boost ? s * 0.4 : 0), -bodyH * 0.35);
    ctx.stroke();

    if (shield) {
      ctx.strokeStyle = 'rgba(51,176,255,0.85)';
      ctx.fillStyle = 'rgba(51,176,255,0.15)';
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath(); ctx.arc(0, -bodyH * 0.55, s * 1.25, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (star) {
      ctx.globalCompositeOperation = 'lighter';
      const hue = (this.time * 420) % 360;
      ctx.fillStyle = `hsla(${hue},100%,60%,0.4)`;
      ctx.beginPath(); ctx.arc(0, -bodyH * 0.55, s * 1.45, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (bolt) {
      ctx.strokeStyle = 'rgba(176,107,255,0.9)';
      ctx.lineWidth = Math.max(1, s * 0.08);
      for (let i = 0; i < 3; i++) {
        const yy = -bodyH * (0.25 + i * 0.3);
        ctx.beginPath();
        ctx.moveTo(-bodyW, yy);
        ctx.lineTo(-bodyW * 0.2, yy + s * 0.18);
        ctx.lineTo(bodyW * 0.3, yy - s * 0.16);
        ctx.lineTo(bodyW, yy + s * 0.06);
        ctx.stroke();
      }
    }
    if (rocket) {
      ctx.fillStyle = 'rgba(255,138,61,0.9)';
      ctx.beginPath();
      ctx.moveTo(-bodyW * 0.4, 0);
      ctx.lineTo(bodyW * 0.4, 0);
      ctx.lineTo(0, s * (1.2 + Math.random() * 0.8));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // Name tag, kept just above the head in screen space so close runners do
    // not fling their labels off the top of the phone.
    if (!p.self && s > 3 && nearFade > 0.5) {
      const fs = Math.min(15, Math.max(8, s * 0.5));
      const ty = Math.max(fs + 6, base.y - Math.min(s * (h + 0.7), this.H * 0.22));
      const label = `${p.place ? p.place + '· ' : ''}${p.name}`;
      ctx.font = `800 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const wpx = ctx.measureText(label).width;
      const tx = Math.max(wpx / 2 + 8, Math.min(this.W - wpx / 2 - 8, base.x));
      ctx.globalAlpha = nearFade;
      ctx.fillStyle = 'rgba(6,9,18,0.7)';
      roundRect(ctx, tx - wpx / 2 - 5, ty - fs, wpx + 10, fs + 5, 6);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.fillText(label, tx, ty);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    // A marker over your own runner so you never lose yourself in a pack.
    if (p.self && s > 2) {
      const ms = Math.min(s, 46);
      const cy2 = base.y - s * (h + 0.55) - Math.abs(Math.sin(this.time * 4)) * ms * 0.18;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(base.x, cy2 + ms * 0.34);
      ctx.lineTo(base.x - ms * 0.26, cy2);
      ctx.lineTo(base.x + ms * 0.26, cy2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawProjectile(pr) {
    const ctx = this.ctx;
    const p = this.project(pr.x, pr.y + (pr.pa === 1 ? C.SHORTCUT_HEIGHT : 0), pr.z);
    if (!p || p.dz < 1) return;
    const s = p.s;
    if (pr.k === 1) {   // homing shell
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(61,220,132,0.35)';
      ctx.beginPath(); ctx.arc(p.x, p.y, s * 1.1, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#eafff2';
      ctx.lineWidth = Math.max(1, s * 0.12);
      ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.5, this.time * 9, this.time * 9 + 2.2); ctx.stroke();
    } else {            // grease slick
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, s * 0.62, s * 0.26, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(120,90,0,0.6)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, s * 0.32, s * 0.13, 0, 0, 7); ctx.fill();
    }
  }

  drawParticle(pt) {
    const p = this.project(pt.x, pt.y, pt.z);
    if (!p || p.dz < 0.8) return;
    const ctx = this.ctx;
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    const r = Math.max(0.6, p.s * pt.size);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawSpeedFx(world) {
    const me = world.me;
    const over = me.speed - C.BASE_SPEED - 4;
    if (over <= 0) return;
    const ctx = this.ctx;
    const a = Math.min(0.4, over / 40);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(160,220,255,${a.toFixed(3)})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + this.time * 0.6;
      const r0 = this.W * 0.28;
      const r1 = r0 + this.W * (0.16 + a);
      ctx.beginPath();
      ctx.moveTo(this.cx + Math.cos(ang) * r0, this.cy + this.H * 0.16 + Math.sin(ang) * r0);
      ctx.lineTo(this.cx + Math.cos(ang) * r1, this.cy + this.H * 0.16 + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------- helpers ----
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const fract = (v) => v - Math.floor(v);

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lighten(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r + 255 * amt) | 0},${Math.min(255, g + 255 * amt) | 0},${Math.min(255, b + 255 * amt) | 0})`;
}
function darken(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${(r * (1 - amt)) | 0},${(g * (1 - amt)) | 0},${(b * (1 - amt)) | 0})`;
}
