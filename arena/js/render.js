// Blockout Arena - the 3D view (three.js): the arena, other players, your
// blaster in first person, tracers, flashes and sparks.

import * as THREE from '../../skyline/vendor/three.module.min.js';
import { blocks, WORLD_W, WORLD_H } from './map.js';
import { CELL, EYE, HEAD_Y, BODY_Y } from './consts.js';

const BLOCK_STYLE = {
  4: { color: '#1d2440', edge: '#2ee6ff' },
  3: { color: '#2a1f45', edge: '#ff4fd8' },
  1.5: { color: '#14343a', edge: '#3dffc2' },
  1: { color: '#3a2c1c', edge: '#ffae1f' },
  0.5: { color: '#33281a', edge: '#ffd23f' },
};

function gridTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0c1020'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(46,230,255,0.35)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.strokeStyle = 'rgba(46,230,255,0.08)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(WORLD_W / CELL, WORLD_H / CELL);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function nameSprite(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(name, 128, 32);
  g.fillStyle = color; g.fillText(name, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}
function glow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,220,140,0.8)'); gr.addColorStop(1, 'rgba(255,160,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Renderer {
  constructor(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(dpr, 1.75));
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070a16');
    this.scene.fog = new THREE.Fog('#070a16', 25, 80);
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight('#9fb8ff', '#141020', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 1.3);
    sun.position.set(20, 40, 10);
    this.scene.add(sun);
    this.buildArena();
    this.buildGun();
    this.players = new Map();
    this.fx = [];
    this.glowTex = glow();
    this.shake = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the horizontal view about the same in portrait and landscape.
    this.camera.fov = w < h ? 92 : 74;
    this.camera.updateProjectionMatrix();
  }

  buildArena() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.85, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WORLD_W / 2, 0, WORLD_H / 2);
    this.scene.add(floor);
    const groups = {};
    for (const b of blocks()) (groups[b.top] ||= []).push(b);
    const m = new THREE.Matrix4();
    for (const [top, list] of Object.entries(groups)) {
      const st = BLOCK_STYLE[top] || BLOCK_STYLE[4];
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, +top, CELL),
        new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.6, metalness: 0.2 }), list.length);
      list.forEach((b, i) => { m.makeTranslation((b.cx + 0.5) * CELL, +top / 2, (b.cz + 0.5) * CELL); mesh.setMatrixAt(i, m); });
      this.scene.add(mesh);
      // Neon edges along the top of every block.
      const pts = [];
      for (const b of list) {
        const x0 = b.cx * CELL, x1 = x0 + CELL, z0 = b.cz * CELL, z1 = z0 + CELL, y = +top + 0.01;
        pts.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: st.edge })));
    }
  }

  buildGun() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: '#5a6684', roughness: 0.45, metalness: 0.5 });
    this.gunAccent = new THREE.MeshStandardMaterial({ color: '#2ee6ff', emissive: '#2ee6ff', emissiveIntensity: 0.45 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.42), dark);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 10), dark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.3);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.012, 0.16), this.gunAccent);
    stripe.position.set(0, 0.058, 0.0);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), dark);
    grip.position.set(0, -0.1, 0.1); grip.rotation.x = 0.3;
    g.add(body, barrel, stripe, grip);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.02, -0.45); g.add(this.muzzle);
    g.position.set(0.17, -0.19, -0.46);
    g.scale.setScalar(0.8);
    this.gun = g; this.gunRest = g.position.clone();
    this.camera.add(g);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.set(0.35, 0.35, 1); this.flash.position.copy(this.muzzle.position); this.flash.visible = false;
    g.add(this.flash);
    this.kick = 0; this.bob = 0;
  }
  setMyColor(c) { this.gunAccent.color.set(c); this.gunAccent.emissive.set(c); }

  // Other players: a body, a head with a glowing visor, a name tag.
  playerObj(p) {
    let o = this.players.get(p.id);
    if (o) return o;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.5, metalness: 0.2, transparent: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.75, 4, 10), mat);
    body.position.y = BODY_Y;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mat);
    head.position.y = HEAD_Y;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.12), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    visor.position.set(0, HEAD_Y + 0.03, -0.19);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: '#20242e' }));
    gun.position.set(0.28, 1.15, -0.3);
    const tag = nameSprite(p.name, p.color);
    tag.position.y = 2.25;
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.18, depthWrite: false }));
    shield.position.y = 1.0;
    g.add(body, head, visor, gun, tag, shield);
    this.scene.add(g);
    o = { g, mat, head, visor, shield, deadT: 0 };
    this.players.set(p.id, o);
    return o;
  }

  // list: [{ id, x, y, z, yaw, pitch, alive, color, name, shield }] for everyone but you
  syncPlayers(list, dt) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      const o = this.playerObj(p);
      o.g.position.set(p.x, p.y, p.z);
      o.g.rotation.y = p.yaw;
      o.shield.visible = !!p.shield && p.alive;
      if (p.alive) { o.deadT = 0; o.g.visible = true; o.g.rotation.z = 0; o.mat.opacity = 1; }
      else {
        o.deadT += dt;
        o.g.rotation.z = Math.min(1.4, o.deadT * 5);
        o.mat.opacity = Math.max(0, 1 - o.deadT * 0.8);
        o.g.visible = o.deadT < 1.3;
      }
    }
    for (const [id, o] of this.players) if (!seen.has(id)) { this.scene.remove(o.g); this.players.delete(id); }
  }

  setCamera(x, y, z, yaw, pitch, moving, dt) {
    this.bob += dt * (moving ? 11 : 2);
    const by = moving ? Math.sin(this.bob) * 0.025 : 0;
    this.camera.position.set(x, y + EYE + by * 0.5, z);
    const sh = this.shake;
    this.camera.rotation.set(pitch + (Math.random() - 0.5) * sh * 0.03, yaw + (Math.random() - 0.5) * sh * 0.03, 0);
    this.shake = Math.max(0, sh - dt * 4);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.gun.position.set(this.gunRest.x + Math.cos(this.bob * 0.5) * (moving ? 0.012 : 0), this.gunRest.y + by + this.kick * 0.02, this.gunRest.z + this.kick * 0.06);
    this.gun.rotation.x = this.kick * 0.12;
  }

  // A shot: from your blaster (mine) or from another player's position.
  shot(mine, from, to) {
    let a;
    if (mine) {
      this.kick = 1;
      this.flash.visible = true; this.flash.material.rotation = Math.random() * 6;
      clearTimeout(this.flashT); this.flashT = setTimeout(() => { this.flash.visible = false; }, 45);
      a = new THREE.Vector3(); this.muzzle.getWorldPosition(a);
    } else a = new THREE.Vector3(from.x, from.y, from.z);
    const b = new THREE.Vector3(to.x, to.y, to.z);
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: mine ? '#fff6c0' : '#ffd27a', transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.fx.push({ obj: line, t: 0, life: 0.09, kind: 'line' });
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    spark.position.copy(b); spark.scale.set(0.3, 0.3, 1);
    this.scene.add(spark);
    this.fx.push({ obj: spark, t: 0, life: 0.15, kind: 'spark' });
  }
  hurt() { this.shake = 1; }

  draw(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = 1 - f.t / f.life;
      if (k <= 0) { this.scene.remove(f.obj); f.obj.geometry?.dispose(); f.obj.material.dispose(); this.fx.splice(i, 1); continue; }
      f.obj.material.opacity = k;
      if (f.kind === 'spark') f.obj.scale.setScalar(0.3 + (1 - k) * 0.4);
    }
    this.gl.render(this.scene, this.camera);
  }
}
