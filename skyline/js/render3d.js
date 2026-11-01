// Skyline Hustle - 3D city renderer (three.js) with a free camera.
//
//   one finger / left mouse    pan          pinch / wheel     zoom
//   two-finger twist / right   rotate       two-finger drag   tilt
//
// The people on the pavements are the simulation's citizens: each one is a
// real customer walking from home to a real shop and back (see citizens.js).

import * as THREE from '../vendor/three.module.min.js';
import { MAP_W, MAP_H, DISTRICTS, BIZ, MAX_APT, SEGMENTS } from './data.js';
import { MAP, BLOCK_TILES } from './map.js';
import { roadPath } from './map.js';
import { tripPhase } from './citizens.js';
import { ownsSet, bizOpen } from './sim.js';

const OX = MAP_W / 2, OZ = MAP_H / 2;
export const wx = tx => tx + 0.5 - OX;           // tile -> world
export const wz = ty => ty + 0.5 - OZ;
const GROUND = 0.12, FLOOR_H = 0.34, APT_H = 0.3, TOWER_H = 2.7;
const SEG_COLORS = ['#ff9f43', '#2ec4b6', '#a77bff', '#ffd23f'];

export function darkness(h) {
  if (h < 5 || h >= 21) return 1;
  if (h < 7.5) return (7.5 - h) / 2.5;
  if (h >= 18.5) return (h - 18.5) / 2.5;
  return 0;
}
const noise = (x, y, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ------------------------------------------------------------ textures ----
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Window grid: base colour map + a separate "lit windows" emissive map.
function windowTextures(cols, rows, frame, glass, seed) {
  const W = 128, H = 128;
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = frame; g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      g.fillStyle = glass;
      g.fillRect(c * W / cols + W / cols * 0.2, r * H / rows + H / rows * 0.22, W / cols * 0.6, H / rows * 0.56);
    }
  });
  const lit = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (noise(r, c, seed) < 0.45) continue;
      g.fillStyle = noise(c, r, seed + 3) < 0.7 ? '#ffcc66' : '#bfe3ff';
      g.fillRect(c * W / cols + W / cols * 0.2, r * H / rows + H / rows * 0.22, W / cols * 0.6, H / rows * 0.56);
    }
  });
  map.wrapS = map.wrapT = lit.wrapS = lit.wrapT = THREE.RepeatWrapping;
  return { map, lit };
}

const emojiCache = new Map();
function emojiTexture(emoji, ring = '#ffffff') {
  const key = emoji + ring;
  if (emojiCache.has(key)) return emojiCache.get(key);
  const t = canvasTex(96, 96, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.96)';
    g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = ring; g.stroke();
    g.font = '50px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, 48, 52);
  });
  emojiCache.set(key, t);
  return t;
}
function textTexture(text, bg, fg, w = 128, h = 48) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `bold ${Math.round(h * 0.55)}px system-ui,sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 1);
  });
}
function glowTexture() {
  return canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,220,150,1)');
    r.addColorStop(0.35, 'rgba(255,190,110,0.5)');
    r.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
}

// ----------------------------------------------------------- renderer ----
export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.cam = { x: 0, z: 0.5, dist: 15, yaw: Math.PI / 4, pitch: 0.95 };
    this.want = { ...this.cam };
    this.sel = -1;
    this.selCitizen = -1;
    this.lotObjs = new Map();       // lot id -> { sig, group, pick, badge }
    this.floaters = [];
    this.clock = 0;
    this.insets = { top: 120, bottom: 62, right: 0 };
    this.onTap = null;
    this.quality = localStorage.getItem('skyline-quality') || 'high';

    this.buildStatic();
    this.buildPeople();
    this.buildCars();
    this.buildOverlays();
    this.resize();
    this.setQuality(this.quality);
    this.fit();
    this.bindInput();
  }

  setQuality(q) {
    this.quality = q;
    localStorage.setItem('skyline-quality', q);
    this.gl.shadowMap.enabled = q === 'high';
    this.sun.castShadow = q === 'high';
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : 1.25));
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.gl.setSize(this.w, this.h, false);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  // Frame the whole city.
  fit() {
    const portrait = this.h > this.w;
    this.want = { x: 0, z: 0.4, dist: portrait ? 21 : 12, yaw: Math.PI / 4, pitch: portrait ? 1.0 : 0.85 };
  }
  rotate(d) { this.want.yaw += d; }
  tilt() { this.want.pitch = this.want.pitch > 0.95 ? 0.55 : this.want.pitch > 0.7 ? 1.25 : 0.95; }

  // ------------------------------------------------------- static ----
  buildStatic() {
    const S = this.scene;
    S.background = new THREE.Color('#8fd0f5');
    S.fog = new THREE.Fog('#8fd0f5', 28, 70);
    this.hemi = new THREE.HemisphereLight('#dff3ff', '#5d7a4a', 0.9);
    S.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4dd', 1.8);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    S.add(this.sun, this.sun.target);

    // Water and the island slab.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: '#3d8fc4', roughness: 0.35, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.6;
    S.add(water);
    this.water = water;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(MAP_W + 0.8, 0.7, MAP_H + 0.8),
      [ '#6b5440', '#6b5440', '#79b55a', '#4d3b2c', '#6b5440', '#5a4634' ].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })));
    slab.position.y = -0.35;
    slab.receiveShadow = true;
    S.add(slab);

    // Ground tiles as one instanced mesh.
    const tiles = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) tiles.push(MAP.tiles[y][x]);
    const tileGeo = new THREE.BoxGeometry(1, 0.1, 1);
    const tileMesh = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), tiles.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    tiles.forEach((t, i) => {
      const block = MAP.blocks[t.block];
      let col = '#4a505c', y = 0.0;
      if (t.kind !== 'road') {
        y = 0.04;
        col = t.kind === 'park' ? '#5fa846' : block?.kind === 'district' ? mixHex(DISTRICTS[block.district].color, '#e9e4da', 0.72)
          : block?.kind === 'transit' ? '#b4bccb' : '#a3a39a';
      }
      m.makeTranslation(wx(t.x), y, wz(t.y));
      tileMesh.setMatrixAt(i, m);
      tileMesh.setColorAt(i, c.set(col));
    });
    tileMesh.receiveShadow = true;
    S.add(tileMesh);

    // Lane dashes and crossings.
    const dash = [];
    for (const t of tiles) {
      if (t.kind !== 'road') continue;
      const h = t.y % 3 === 0, v = t.x % 3 === 0;
      if (h && !v) dash.push([wx(t.x), wz(t.y), 0]);
      if (v && !h) dash.push([wx(t.x), wz(t.y), Math.PI / 2]);
    }
    const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.01, 0.05), new THREE.MeshBasicMaterial({ color: '#f5d76e' }), dash.length);
    dash.forEach(([x, z, r], i) => { m.makeRotationY(r).setPosition(x, 0.055, z); dashMesh.setMatrixAt(i, m); });
    S.add(dashMesh);

    // Trees on plazas and in the park.
    const trees = [];
    for (const t of tiles) {
      if (t.kind !== 'plaza' && t.kind !== 'park') continue;
      const n = t.kind === 'park' ? 3 : 1 + (noise(t.x, t.y) < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) trees.push([wx(t.x) - 0.3 + noise(t.x, t.y, i + 1) * 0.6, wz(t.y) - 0.3 + noise(t.x, t.y, i + 9) * 0.6, 0.8 + noise(t.x, t.y, i + 3) * 0.5]);
    }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2b' }), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 0), new THREE.MeshStandardMaterial({ color: '#3f8f3a', flatShading: true }), trees.length);
    trees.forEach(([x, z, sc2], i) => {
      m.makeScale(sc2, sc2, sc2).setPosition(x, 0.09 + 0.11 * sc2, z); trunk.setMatrixAt(i, m);
      m.makeScale(sc2, sc2 * 1.15, sc2).setPosition(x, 0.09 + 0.33 * sc2, z); crown.setMatrixAt(i, m);
      crown.setColorAt(i, c.set(['#3f8f3a', '#4fa646', '#2f7a3a'][i % 3]));
    });
    trunk.castShadow = crown.castShadow = true;
    S.add(trunk, crown);

    // Park pond and fountain.
    const park = MAP.blocks.find(b => b.kind === 'park');
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 24), new THREE.MeshStandardMaterial({ color: '#5ab3e0', roughness: 0.2 }));
    pond.position.set(wx(park.bx) + 0.5, 0.1, wz(park.by) + 0.5);
    S.add(pond);

    // Street lamps: glowing sprites at the crossings, lit at night.
    const glow = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    this.lampMat = glow;
    for (let y = 0; y < MAP_H; y += 3) for (let x = 0; x < MAP_W; x += 3) {
      const sp = new THREE.Sprite(glow);
      sp.position.set(wx(x), 0.35, wz(y));
      sp.scale.set(1.3, 1.3, 1);
      S.add(sp);
    }

    // Shared building materials.
    const apt = windowTextures(3, 2, '#efe7d8', '#3d5a80', 1);
    const tower = windowTextures(4, 6, '#9fc6e6', '#24486e', 2);
    const shop = windowTextures(2, 1, '#ffffff', '#bfe6ff', 3);
    this.tex = { apt, tower, shop };
    this.litMats = [];
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.62, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, side: THREE.DoubleSide }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    S.add(this.selRing);
    this.districtLine = new THREE.Group();
    S.add(this.districtLine);
    this.setBorders = new THREE.Group();
    S.add(this.setBorders);
    this.setSig = '';
  }

  // Box border around a 2x2 block.
  blockBorder(b, color, w = 0.06, y = 0.11) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color });
    const cx = wx(b.bx) + 0.5, cz = wz(b.by) + 0.5;
    for (const [dx, dz, sx, sz] of [[0, -1.02, 2.1, w], [0, 1.02, 2.1, w], [-1.02, 0, w, 2.1], [1.02, 0, w, 2.1]]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.04, sz), mat);
      mesh.position.set(cx + dx, y, cz + dz);
      g.add(mesh);
    }
    return g;
  }

  // --------------------------------------------------------- lots ----
  litMaterial(texSet, color, repeatX, repeatY) {
    const map = texSet.map.clone(); map.repeat.set(repeatX, repeatY); map.needsUpdate = true;
    const lit = texSet.lit.clone(); lit.repeat.set(repeatX, repeatY); lit.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map, emissiveMap: lit, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, color, roughness: 0.75 });
    this.litMats.push(mat);
    return mat;
  }

  lotSig(s, lot) {
    const b = lot.business;
    const auction = s.auction && s.auction.lotId === lot.id ? 'A' : '';
    return `${lot.owner}|${lot.apt}|${b ? b.type + b.owner + b.fit : ''}|${auction}`;
  }

  syncLot(s, lot) {
    const sig = this.lotSig(s, lot);
    const cur = this.lotObjs.get(lot.id);
    if (cur && cur.sig === sig) return cur;
    if (cur) {
      this.scene.remove(cur.group);
      cur.group.traverse(o => {
        if (o.material) {
          const i = this.litMats.indexOf(o.material);
          if (i >= 0) this.litMats.splice(i, 1);
        }
      });
    }
    const g = new THREE.Group();
    g.position.set(wx(lot.tx), 0, wz(lot.ty));
    let height = 0.3;
    const add = (geo, mat, x, y, z, shadow = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

    if (lot.kind === 'prop') {
      // The colour plate: the thing sets are made of.
      add(new THREE.BoxGeometry(0.94, 0.04, 0.94), std(DISTRICTS[lot.district].color), 0, 0.1, 0, false);
      if (lot.owner >= 0) {
        const oc = s.players[lot.owner].color;
        for (const [x, z, sx, sz] of [[0, -0.45, 0.94, 0.05], [0, 0.45, 0.94, 0.05], [-0.45, 0, 0.05, 0.94], [0.45, 0, 0.05, 0.94]])
          add(new THREE.BoxGeometry(sx, 0.05, sz), new THREE.MeshBasicMaterial({ color: oc }), x, 0.125, z, false);
      }
    }
    const b = lot.business;
    if (lot.kind === 'station') {
      add(new THREE.BoxGeometry(0.8, 0.32, 0.8), this.litMaterial(this.tex.shop, '#6c7a96', 3, 1), 0, GROUND + 0.16, 0);
      add(new THREE.BoxGeometry(0.88, 0.08, 0.88), std('#2f80ed'), 0, GROUND + 0.36, 0);
      height = 0.5;
    } else if (lot.kind === 'utility') {
      const power = lot.name.startsWith('Volt');
      add(new THREE.BoxGeometry(0.76, 0.34, 0.76), std('#8e8e84'), 0, GROUND + 0.17, 0);
      if (power) {
        for (const dx of [-0.18, 0.18]) {
          add(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 10), std('#a5a59c'), dx, GROUND + 0.6, 0.1);
          add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10), std('#d9534f'), dx, GROUND + 0.93, 0.1);
        }
        g.userData.smoke = true;
        height = 1.0;
      } else {
        add(new THREE.CylinderGeometry(0.26, 0.26, 0.36, 20), std('#4ea8de', { roughness: 0.4 }), 0, GROUND + 0.52, 0);
        height = 0.75;
      }
    } else if (b || lot.apt) {
      const def = b ? BIZ[b.type] : null;
      const wall = def ? def.wall : '#8d8f99';
      add(new THREE.BoxGeometry(0.76, FLOOR_H, 0.76), std(wall), 0, GROUND + FLOOR_H / 2, 0);
      // Glass shopfront.
      add(new THREE.BoxGeometry(0.78, FLOOR_H * 0.55, 0.78), this.litMaterial(this.tex.shop, '#ffffff', 2, 1), 0, GROUND + FLOOR_H * 0.38, 0, false);
      height = GROUND + FLOOR_H;
      if (b) {
        const ac = s.players[b.owner].color;
        add(new THREE.BoxGeometry(0.86, 0.05, 0.86), std(ac), 0, height - 0.02, 0);
        if (b.fit >= 2) add(new THREE.BoxGeometry(0.5, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: ac }), 0, height - 0.1, 0.4, false);
      }
      if (lot.apt > 0 && lot.apt < MAX_APT) {
        const tint = mixHex(DISTRICTS[lot.district].color, '#f3efe6', 0.65);
        const hgt = lot.apt * APT_H;
        add(new THREE.BoxGeometry(0.7, hgt, 0.7), this.litMaterial(this.tex.apt, tint, 1, lot.apt), 0, height + hgt / 2, 0);
        height += hgt;
        add(new THREE.BoxGeometry(0.74, 0.03, 0.74), std('#7d808a'), 0, height + 0.015, 0);
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), std('#6b6f7a'), 0.15, height + 0.08, -0.15);
      } else if (lot.apt === MAX_APT) {
        const glass = mixHex(DISTRICTS[lot.district].color, '#9fd3ff', 0.6);
        add(new THREE.BoxGeometry(0.62, TOWER_H, 0.62), this.litMaterial(this.tex.tower, glass, 1, 4), 0, height + TOWER_H / 2, 0);
        height += TOWER_H;
        add(new THREE.BoxGeometry(0.4, 0.2, 0.4), std('#d9e2ec', { metalness: 0.4 }), 0, height + 0.1, 0);
        add(new THREE.CylinderGeometry(0.012, 0.02, 0.5, 6), std('#d9e2ec'), 0, height + 0.45, 0);
        const beacon = add(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b3b' }), 0, height + 0.72, 0, false);
        g.userData.beacon = beacon;
        height += 0.75;
      } else {
        add(new THREE.BoxGeometry(0.78, 0.03, 0.78), std('#cfd3da'), 0, height + 0.015, 0);
      }
    } else if (lot.owner >= 0) {
      // Bought but empty: a flag in the owner's colour.
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), std('#3a2d22'), 0, GROUND + 0.25, 0);
      add(new THREE.BoxGeometry(0.22, 0.13, 0.01), std(s.players[lot.owner].color, { side: THREE.DoubleSide }), 0.11, GROUND + 0.43, 0);
      height = 0.6;
    } else {
      // City land awaiting auction.
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), std('#5b4636'), -0.12, GROUND + 0.15, 0);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), std('#5b4636'), 0.12, GROUND + 0.15, 0);
      const sign = add(new THREE.BoxGeometry(0.36, 0.16, 0.02), new THREE.MeshStandardMaterial({ map: textTexture('AUCTION', '#fffaf0', '#c0392b') }), 0, GROUND + 0.3, 0);
      sign.rotation.y = Math.PI / 4;
      height = 0.45;
    }

    // Floating icon.
    let icon = null, ring = '#ffffff';
    if (b) { icon = BIZ[b.type].icon; ring = s.players[b.owner].color; }
    else if (lot.kind === 'station') icon = '🚇';
    else if (lot.kind === 'utility') icon = lot.name.startsWith('Volt') ? '⚡' : '💧';
    if (s.auction && s.auction.lotId === lot.id) { icon = '🔨'; ring = '#ffd23f'; }
    let badge = null;
    if (icon) {
      badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(icon, ring), depthTest: false, sizeAttenuation: false }));
      badge.position.set(0, height + 0.22, 0);
      badge.scale.set(0.036, 0.036, 1);
      badge.renderOrder = 10;
      g.add(badge);
      // A small moon when the shop is shut.
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🌙', '#1d2340'), depthTest: false, sizeAttenuation: false }));
      moon.position.set(0, height + 0.22, 0);
      moon.center.set(-0.25, -0.35);
      moon.scale.set(0.02, 0.02, 1);
      moon.renderOrder = 11;
      moon.visible = false;
      g.add(moon);
      g.userData.moon = moon;
    }
    // Invisible pick volume for taps.
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.95, Math.max(0.3, height + 0.35), 0.95), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = Math.max(0.3, height + 0.35) / 2;
    pick.userData.lot = lot.id;
    g.add(pick);
    this.scene.add(g);
    const obj = { sig, group: g, pick, height };
    this.lotObjs.set(lot.id, obj);
    return obj;
  }

  // ------------------------------------------------------- people ----
  buildPeople() {
    this.maxPeople = 1600;
    const body = new THREE.CylinderGeometry(0.035, 0.045, 0.13, 6);
    body.translate(0, 0.065, 0);
    const head = new THREE.SphereGeometry(0.032, 6, 5);
    head.translate(0, 0.165, 0);
    this.peopleBody = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.8 }), this.maxPeople);
    this.peopleHead = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: '#f1c27d', roughness: 0.8 }), this.maxPeople);
    this.peopleBody.castShadow = true;
    const c = new THREE.Color();
    for (let i = 0; i < this.maxPeople; i++) this.peopleBody.setColorAt(i, c.set('#ffffff'));
    this.peopleBody.count = this.peopleHead.count = 0;
    this.peopleBody.frustumCulled = this.peopleHead.frustumCulled = false;
    this.scene.add(this.peopleBody, this.peopleHead);
    this.peopleIndex = [];         // instance -> citizen id
    this.pathCache = new Map();
    // Thought bubbles over a few unhappy walkers.
    this.moods = [];
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('😠', '#ff5a6e'), depthTest: false, sizeAttenuation: false }));
      sp.scale.set(0.03, 0.03, 1);
      sp.visible = false;
      sp.renderOrder = 12;
      this.scene.add(sp);
      this.moods.push(sp);
    }
    this.citizenMarker = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.12, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    this.citizenMarker.rotation.x = -Math.PI / 2;
    this.citizenMarker.visible = false;
    this.scene.add(this.citizenMarker);
  }

  pathFor(t) {
    const key = `${t.hx},${t.hy}>${t.tx},${t.ty}`;
    let p = this.pathCache.get(key);
    if (!p) {
      const tiles = roadPath(t.hx, t.hy, t.tx, t.ty);
      // Walk on the pavement: offset sideways from the road centre.
      p = tiles.map(([x, y], i) => {
        const [nx, ny] = tiles[Math.min(i + 1, tiles.length - 1)];
        const [px, py] = tiles[Math.max(i - 1, 0)];
        const dx = nx - px, dy = ny - py;
        const n = Math.hypot(dx, dy) || 1;
        return [wx(x) + (-dy / n) * 0.33, wz(y) + (dx / n) * 0.33];
      });
      let len = 0;
      const cum = [0];
      for (let i = 1; i < p.length; i++) { len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); cum.push(len); }
      p = { pts: p, cum, len };
      if (this.pathCache.size > 4000) this.pathCache.clear();
      this.pathCache.set(key, p);
    }
    return p;
  }

  updatePeople(s, T) {
    const trips = s.cz ? s.cz.trips : [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color();
    let n = 0, moodN = 0;
    this.peopleIndex.length = 0;
    let selPos = null;
    for (const t of trips) {
      if (n >= this.maxPeople) break;
      const ph = tripPhase(t, T);
      if (!ph) continue;
      const path = this.pathFor(t);
      const f = ph.leg === 0 ? ph.f : 1 - ph.f;
      const d = f * path.len;
      let i = 1;
      while (i < path.cum.length - 1 && path.cum[i] < d) i++;
      const a = path.pts[i - 1], b = path.pts[i];
      const seg = path.cum[i] - path.cum[i - 1] || 1;
      const k = (d - path.cum[i - 1]) / seg;
      const x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
      const dir = ph.leg === 0 ? Math.atan2(b[0] - a[0], b[1] - a[1]) : Math.atan2(a[0] - b[0], a[1] - b[1]);
      const bob = Math.abs(Math.sin(T * 220 + t.cid)) * 0.012;
      q.setFromAxisAngle(up, dir);
      pos.set(x, 0.05 + bob, z);
      m.compose(pos, q, one);
      this.peopleBody.setMatrixAt(n, m);
      this.peopleHead.setMatrixAt(n, m);
      this.peopleBody.setColorAt(n, c.set(SEG_COLORS[t.seg]));
      this.peopleIndex.push(t.cid);
      if (t.cid === this.selCitizen) selPos = [x, z];
      if (!t.ok && ph.leg === 1 && moodN < this.moods.length) {
        const sp = this.moods[moodN++];
        sp.visible = true;
        sp.position.set(x, 0.38, z);
      }
      n++;
    }
    for (let i = moodN; i < this.moods.length; i++) this.moods[i].visible = false;
    this.peopleBody.count = this.peopleHead.count = n;
    this.peopleBody.instanceMatrix.needsUpdate = this.peopleHead.instanceMatrix.needsUpdate = true;
    if (this.peopleBody.instanceColor) this.peopleBody.instanceColor.needsUpdate = true;
    this.citizenMarker.visible = !!selPos;
    if (selPos) this.citizenMarker.position.set(selPos[0], 0.12, selPos[1]);
  }

  // --------------------------------------------------------- cars ----
  buildCars() {
    this.maxCars = 24;
    const geo = new THREE.BoxGeometry(0.16, 0.07, 0.3);
    geo.translate(0, 0.08, 0);
    const top = new THREE.BoxGeometry(0.13, 0.06, 0.15);
    top.translate(0, 0.145, -0.02);
    this.carBody = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }), this.maxCars);
    this.carTop = new THREE.InstancedMesh(top, new THREE.MeshStandardMaterial({ color: '#2b3340', roughness: 0.3 }), this.maxCars);
    this.carBody.castShadow = true;
    const palette = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#ffffff', '#c77dff', '#e63946'];
    const c = new THREE.Color();
    for (let i = 0; i < this.maxCars; i++) this.carBody.setColorAt(i, c.set(palette[i % palette.length]));
    this.scene.add(this.carBody, this.carTop);
    const roads = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (MAP.tiles[y][x].kind === 'road') roads.push([x, y]);
    this.roadTiles = roads;
    this.cars = Array.from({ length: this.maxCars }, () => this.spawnCar());
  }
  spawnCar() {
    const [x, y] = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)];
    return { px: x, py: y, nx: x, ny: y, dx: 0, dy: 0, t: 1, speed: 1.4 + Math.random() * 0.8 };
  }
  moveCar(car, dt) {
    car.t += dt * car.speed;
    const isRoad = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && MAP.tiles[y][x].kind === 'road';
    while (car.t >= 1) {
      car.t -= 1;
      car.px = car.nx; car.py = car.ny;
      let opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isRoad(car.px + dx, car.py + dy) && !(dx === -car.dx && dy === -car.dy));
      if (!opts.length) opts = [[-car.dx, -car.dy]];
      const straight = opts.find(([dx, dy]) => dx === car.dx && dy === car.dy);
      const [dx, dy] = straight && Math.random() < 0.7 ? straight : opts[Math.floor(Math.random() * opts.length)];
      car.dx = dx; car.dy = dy;
      car.nx = car.px + dx; car.ny = car.py + dy;
    }
  }
  updateCars(dt, active) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (const car of this.cars) {
      if (n >= active) break;
      this.moveCar(car, dt);
      const fx = car.px + (car.nx - car.px) * car.t, fy = car.py + (car.ny - car.py) * car.t;
      // Drive on the right.
      const ox = -car.dy * 0.14, oy = car.dx * 0.14;
      pos.set(wx(fx) + ox, 0.05, wz(fy) + oy);
      q.setFromAxisAngle(up, Math.atan2(car.dx, car.dy));
      m.compose(pos, q, one);
      this.carBody.setMatrixAt(n, m);
      this.carTop.setMatrixAt(n, m);
      n++;
    }
    this.carBody.count = this.carTop.count = n;
    this.carBody.instanceMatrix.needsUpdate = this.carTop.instanceMatrix.needsUpdate = true;
  }

  // ----------------------------------------------------- overlays ----
  buildOverlays() {
    this.floatLayer = document.getElementById('floaters');
  }
  floater(lot, text, color) {
    if (!this.floatLayer) return;
    if (this.floaters.some(f => f.lot === lot.id && f.t < 0.9)) return;
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    this.floatLayer.appendChild(el);
    const h = this.lotObjs.get(lot.id)?.height ?? 0.4;
    this.floaters.push({ lot: lot.id, el, t: 0, p: new THREE.Vector3(wx(lot.tx), h + 0.45, wz(lot.ty)) });
    if (this.floaters.length > 30) { this.floaters[0].el.remove(); this.floaters.shift(); }
  }
  updateFloaters(dt) {
    const v = new THREE.Vector3();
    for (const f of this.floaters) {
      f.t += dt;
      v.copy(f.p); v.y += f.t * 0.5;
      v.project(this.camera);
      const x = (v.x * 0.5 + 0.5) * this.w, y = (-v.y * 0.5 + 0.5) * this.h;
      f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.6));
    }
    for (const f of this.floaters) if (f.t >= 1.6) f.el.remove();
    this.floaters = this.floaters.filter(f => f.t < 1.6);
  }

  // ------------------------------------------------------- camera ----
  updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 10);
    const c = this.cam, w = this.want;
    w.pitch = Math.max(0.35, Math.min(1.42, w.pitch));
    w.dist = Math.max(2.5, Math.min(30, w.dist));
    w.x = Math.max(-8, Math.min(8, w.x));
    w.z = Math.max(-6.5, Math.min(6.5, w.z));
    for (const key of ['x', 'z', 'dist', 'yaw', 'pitch']) c[key] += (w[key] - c[key]) * k;
    const horiz = Math.cos(c.pitch) * c.dist;
    this.camera.position.set(c.x + Math.sin(c.yaw) * horiz, Math.sin(c.pitch) * c.dist, c.z + Math.cos(c.yaw) * horiz);
    this.camera.lookAt(c.x, 0, c.z);
  }

  // Ground-plane directions relative to the view.
  axes() {
    const yaw = this.cam.yaw;
    return { right: [Math.cos(yaw), -Math.sin(yaw)], fwd: [-Math.sin(yaw), -Math.cos(yaw)] };
  }

  // Bring a lot into the clear area above the bottom sheet.
  focusLot(lot, sheetH = 0) {
    const { fwd } = this.axes();
    const dist = Math.min(this.want.dist, 9.5);
    const frac = (sheetH - this.insets.top) / this.h * 0.5;
    const shift = Math.max(0, frac) * dist * 0.9;
    this.want.x = wx(lot.tx) - fwd[0] * shift;
    this.want.z = wz(lot.ty) - fwd[1] * shift;
    this.want.dist = dist;
    if (this.insets.right) {
      const { right } = this.axes();
      const side = this.insets.right / this.w * dist * 0.55;
      this.want.x += right[0] * side;
      this.want.z += right[1] * side;
    }
  }

  bindInput() {
    const el = this.canvas;
    const pts = new Map();
    let g = null;
    const panBy = (dx, dy) => {
      const { right, fwd } = this.axes();
      const scale = this.cam.dist / this.h * 1.1;
      this.want.x -= (right[0] * dx - fwd[0] * dy) * scale;
      this.want.z -= (right[1] * dx - fwd[1] * dy) * scale;
    };
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) g = { sx: e.clientX, sy: e.clientY, moved: false, button: e.button, shift: e.shiftKey };
      else g = { two: true, moved: true };
    });
    el.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p || !g) return;
      if (pts.size === 1 && !g.two) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) g.moved = true;
        if (g.moved) {
          if (g.button === 2 || g.shift) { this.want.yaw -= dx * 0.006; this.want.pitch += dy * 0.005; }
          else panBy(dx, dy);
        }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y), ang0 = Math.atan2(b.y - a.y, b.x - a.x), my0 = (a.y + b.y) / 2, mx0 = (a.x + b.x) / 2;
        p.x = e.clientX; p.y = e.clientY;
        const [c2, d2] = [...pts.values()];
        const d1 = Math.hypot(c2.x - d2.x, c2.y - d2.y), ang1 = Math.atan2(d2.y - c2.y, d2.x - c2.x), my1 = (c2.y + d2.y) / 2, mx1 = (c2.x + d2.x) / 2;
        if (d0 > 10) this.want.dist *= d0 / d1;
        let da = ang1 - ang0;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.want.yaw -= da;
        // Both fingers dragging vertically together tilts; sideways pans.
        this.want.pitch += (my1 - my0) * 0.006;
        panBy(mx1 - mx0, 0);
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0 && g && !g.moved && !g.two && this.onTap) this.onTap(e.clientX, e.clientY);
      if (pts.size === 0) g = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', e => { pts.delete(e.pointerId); g = null; });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) { this.want.dist *= Math.exp(e.deltaY * 0.01); return; }
      this.want.dist *= Math.exp(e.deltaY * 0.0012);
    }, { passive: false });
  }

  // What's under a screen point: a citizen or a lot.
  pick(sx, sy) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1), this.camera);
    // People are tiny: test them with a generous radius first.
    const v = new THREE.Vector3(), m = new THREE.Matrix4();
    let best = null, bestD = 0.12;
    for (let i = 0; i < this.peopleBody.count; i++) {
      this.peopleBody.getMatrixAt(i, m);
      v.setFromMatrixPosition(m); v.y += 0.1;
      const d = ray.ray.distanceToPoint(v);
      if (d < bestD) { bestD = d; best = this.peopleIndex[i]; }
    }
    if (best != null) return { kind: 'citizen', id: best };
    const picks = [...this.lotObjs.values()].map(o => o.pick);
    const hit = ray.intersectObjects(picks, false)[0];
    if (hit) return { kind: 'lot', id: hit.object.userData.lot };
    // Fall back to the ground tile.
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1), p)) {
      const tx = Math.floor(p.x + OX), ty = Math.floor(p.z + OZ);
      if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && MAP.tiles[ty][tx].lot >= 0) return { kind: 'lot', id: MAP.tiles[ty][tx].lot };
    }
    return null;
  }

  // --------------------------------------------------------- draw ----
  draw(s, hourF, dt, simSpeed) {
    this.clock += dt;
    this.updateCamera(dt);
    const dark = darkness(hourF);
    // Sun arcs over the city through the day.
    const sunAng = ((hourF - 6) / 12) * Math.PI;
    const elev = Math.sin(sunAng);
    this.sun.position.set(Math.cos(sunAng) * 14 + this.cam.x, Math.max(2, elev * 16), 6 + this.cam.z);
    this.sun.target.position.set(this.cam.x, 0, this.cam.z);
    this.sun.intensity = 1.9 * (1 - dark) + 0.05;
    this.sun.color.set(elev < 0.35 ? '#ffb27a' : '#fff4dd');
    this.hemi.intensity = 0.95 - 0.62 * dark;
    const sky = new THREE.Color('#8fd0f5').lerp(new THREE.Color('#0b1030'), dark);
    if (dark > 0 && dark < 1) sky.lerp(new THREE.Color('#ff9a6b'), (1 - Math.abs(dark - 0.5) * 2) * 0.35);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.water.material.color.set(dark > 0.5 ? '#1c3550' : '#3d8fc4');
    for (const mat of this.litMats) mat.emissiveIntensity = dark * 0.95;
    this.lampMat.opacity = dark * 0.8;

    // Lots.
    for (const lot of s.lots) {
      const o = this.syncLot(s, lot);
      if (o.group.userData.beacon) o.group.userData.beacon.visible = Math.sin(this.clock * 4 + lot.id) > 0;
      if (o.group.userData.moon) o.group.userData.moon.visible = !!lot.business && !bizOpen(lot.business, s.hour);
    }
    // Set borders and the selection.
    const setSig = s.players.map(p => DISTRICTS.map((_, d) => ownsSet(s, p.id, d) ? 1 : 0).join('')).join('|');
    if (setSig !== this.setSig) {
      this.setSig = setSig;
      this.setBorders.clear();
      DISTRICTS.forEach((_, d) => {
        const owner = s.players.find(p => ownsSet(s, p.id, d));
        if (owner) this.setBorders.add(this.blockBorder(MAP.distBlock[d], owner.color, 0.09, 0.115));
      });
    }
    this.districtLine.clear();
    if (this.sel >= 0) {
      const lot = s.lots[this.sel];
      const h = this.lotObjs.get(this.sel)?.height ?? 0.2;
      this.selRing.visible = true;
      this.selRing.position.set(wx(lot.tx), 0.14, wz(lot.ty));
      this.selRing.material.opacity = 0.55 + 0.45 * Math.sin(this.clock * 5);
      if (lot.kind === 'prop') this.districtLine.add(this.blockBorder(MAP.distBlock[lot.district], DISTRICTS[lot.district].color, 0.04, 0.13));
    } else this.selRing.visible = false;

    const T = s.day * 24 + hourF;
    this.updatePeople(s, T);
    const carsActive = Math.round(6 + (1 - dark * 0.6) * 14);
    this.updateCars(simSpeed > 0 ? dt * Math.min(simSpeed, 3) : 0, carsActive);
    this.updateFloaters(dt);
    this.gl.render(this.scene, this.camera);
  }
}

function mixHex(a, b, t) {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return '#' + A.lerp(B, t).getHexString();
}
export { SEG_COLORS, SEGMENTS };
