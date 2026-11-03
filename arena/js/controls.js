// Blockout Arena - controls.
//
// Phone: left thumb anywhere on the left side is a joystick that appears
// where you touch; right thumb drags to aim. FIRE can be held and dragged to
// aim at the same time; JUMP and RELOAD are taps.
// Computer: click to grab the mouse, WASD to move, mouse to aim, click to
// fire, Space to jump, R to reload.

const STICK_R = 56;               // px of thumb travel for full speed

export class Controls {
  constructor(root, ui) {
    this.enabled = false;
    this.sens = 1;                // look speed multiplier (lobby slider)
    this.move = { x: 0, z: 0 };   // x right, z forward, each -1..1
    this.look = { yaw: 0, pitch: 0 };   // accumulated since last read
    this.fire = false;
    this.jump = false;
    this.reload = false;
    this.ui = ui;
    this.roles = new Map();       // touch id -> { role, x, y, ox, oy }
    this.keys = new Set();
    this.mouseFire = false;

    root.addEventListener('touchstart', (e) => {
      if (!this.enabled || e.target.closest?.('a, .menu')) return;
      for (const t of e.changedTouches) {
        const el = t.target.closest?.('[data-ctl]');
        const ctl = el?.dataset.ctl;
        if (ctl === 'fire') { this.roles.set(t.identifier, { role: 'fire', x: t.clientX, y: t.clientY }); this.fire = true; el.classList.add('on'); }
        else if (ctl === 'jump') { this.jump = true; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 120); }
        else if (ctl === 'reload') { this.reload = true; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 120); }
        else if (t.clientX < innerWidth * 0.45 && ![...this.roles.values()].some(r => r.role === 'stick')) {
          this.roles.set(t.identifier, { role: 'stick', x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY });
          this.ui.stick(true, t.clientX, t.clientY, 0, 0);
        } else {
          this.roles.set(t.identifier, { role: 'look', x: t.clientX, y: t.clientY });
        }
      }
      e.preventDefault();
    }, { passive: false });
    root.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const r = this.roles.get(t.identifier);
        if (!r) continue;
        if (r.role === 'stick') {
          let dx = t.clientX - r.ox, dy = t.clientY - r.oy;
          const d = Math.hypot(dx, dy);
          if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
          this.move.x = dx / STICK_R; this.move.z = -dy / STICK_R;
          this.ui.stick(true, r.ox, r.oy, dx, dy);
        } else {
          // Look: drag distance turns the view; a faster flick turns a bit more.
          const dx = t.clientX - r.x, dy = t.clientY - r.y;
          const k = 0.0055 * this.sens * (1 + Math.min(1.5, Math.hypot(dx, dy) / 40) * 0.35);
          this.look.yaw -= dx * k;
          this.look.pitch -= dy * k;
        }
        r.x = t.clientX; r.y = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        const r = this.roles.get(t.identifier);
        this.roles.delete(t.identifier);
        if (!r) continue;
        if (r.role === 'stick') { this.move.x = 0; this.move.z = 0; this.ui.stick(false); }
        if (r.role === 'fire') { this.fire = [...this.roles.values()].some(x => x.role === 'fire'); if (!this.fire) document.querySelector('[data-ctl=fire]')?.classList.remove('on'); }
      }
    };
    root.addEventListener('touchend', end);
    root.addEventListener('touchcancel', end);

    // ---- computer ----
    const canvas = document.getElementById('view');
    canvas.addEventListener('click', () => { if (this.enabled && !('ontouchstart' in window)) canvas.requestPointerLock?.(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== canvas) return;
      this.look.yaw -= e.movementX * 0.0022 * this.sens;
      this.look.pitch -= e.movementY * 0.0022 * this.sens;
    });
    document.addEventListener('mousedown', (e) => { if (document.pointerLockElement === canvas && e.button === 0) this.mouseFire = true; });
    document.addEventListener('mouseup', () => { this.mouseFire = false; });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ') { this.jump = true; e.preventDefault(); }
      if (k === 'r') this.reload = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseFire = false; });
  }

  // The move stick, folded together with the keyboard.
  stick() {
    let { x, z } = this.move;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) z += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z -= 1;
    return { x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)) };
  }
  firing() { return this.fire || this.mouseFire; }
  takeLook() { const l = this.look; this.look = { yaw: 0, pitch: 0 }; return l; }
  takeJump() { const j = this.jump; this.jump = false; return j; }
  takeReload() { const r = this.reload; this.reload = false; return r; }
  reset() { this.roles.clear(); this.move = { x: 0, z: 0 }; this.fire = false; this.mouseFire = false; this.ui.stick(false); }
}
