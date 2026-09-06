// Touch gestures + keyboard. Emits discrete actions; the game loop turns
// those into the lane / jump / slide / item intents sent to the server.

const SWIPE = 26;           // px before a drag counts as a swipe
const TAP_MS = 260;
const TAP_SLOP = 14;

export class Input extends EventTarget {
  constructor(target, itemButton) {
    super();
    this.enabled = false;
    this.keys = new Set();
    this._touches = new Map();

    const emit = (a) => { if (this.enabled) this.dispatchEvent(new CustomEvent(a)); };
    this.emitAction = emit;

    // ---- touch ----
    const start = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        this._touches.set(t.identifier, { x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY, t: performance.now(), moved: false });
      }
    };
    const move = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const s = this._touches.get(t.identifier);
        if (!s) continue;
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) continue;
        if (Math.abs(dx) > Math.abs(dy)) emit(dx > 0 ? 'right' : 'left');
        else emit(dy > 0 ? 'slide' : 'jump');
        // Re-anchor so a long drag can chain several swipes.
        s.x = t.clientX; s.y = t.clientY; s.moved = true;
      }
      e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        const s = this._touches.get(t.identifier);
        this._touches.delete(t.identifier);
        if (!s || s.moved) continue;
        const dt = performance.now() - s.t;
        const dist = Math.hypot(t.clientX - s.ox, t.clientY - s.oy);
        if (dt < TAP_MS && dist < TAP_SLOP) emit('item');
      }
    };

    target.addEventListener('touchstart', start, { passive: true });
    target.addEventListener('touchmove', move, { passive: false });
    target.addEventListener('touchend', end, { passive: true });
    target.addEventListener('touchcancel', end, { passive: true });

    // Mouse drag mirrors touch, so the game is testable on a laptop.
    let mouse = null;
    target.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      mouse = { x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY, t: performance.now(), moved: false };
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouse) return;
      const dx = e.clientX - mouse.x, dy = e.clientY - mouse.y;
      if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
      if (Math.abs(dx) > Math.abs(dy)) emit(dx > 0 ? 'right' : 'left');
      else emit(dy > 0 ? 'slide' : 'jump');
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (mouse && !mouse.moved && performance.now() - mouse.t < TAP_MS) emit('item');
      mouse = null;
    });

    if (itemButton) {
      const fire = (e) => { e.preventDefault(); e.stopPropagation(); emit('item'); };
      itemButton.addEventListener('touchstart', fire, { passive: false });
      itemButton.addEventListener('mousedown', fire);
    }

    // ---- keyboard ----
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (['arrowleft', 'a'].includes(k)) emit('left');
      else if (['arrowright', 'd'].includes(k)) emit('right');
      else if (['arrowup', 'w', ' '].includes(k)) emit('jump');
      else if (['arrowdown', 's'].includes(k)) emit('slide');
      else if (['e', 'shift', 'enter', 'f'].includes(k)) emit('item');
      else return;
      e.preventDefault();
    });
  }

  on(type, fn) { this.addEventListener(type, fn); return this; }
}
