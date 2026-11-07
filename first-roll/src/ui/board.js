// The battle board: an SVG grid in square units (viewBox 0 0 8 10). Terrain
// is drawn once; overlays are redrawn on every state; tokens are persistent
// nodes so moves slide with a CSS transition.

import { W, H, onBoard, coneSquares } from '../rules/grid.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

const EFFECT_ICONS = { dodge: '🛡', sap: '💫', vex: '🎯', helped: '🤝', disengage: '💨' };

export function createBoard(svg, onTap) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const terrain = el('g'), over = el('g'), toks = el('g', { class: 'toks' }), fx = el('g');
  svg.append(terrain, over, toks, fx);
  const nodes = new Map();
  let wallsKey = '';

  svg.addEventListener('click', (e) => {
    const r = svg.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * H);
    if (x >= 0 && y >= 0 && x < W && y < H) onTap(x, y);
  });

  function drawTerrain(walls) {
    terrain.innerHTML = '';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        terrain.append(el('rect', { x, y, width: 1, height: 1, class: (x + y) % 2 ? 'c1' : 'c2' }));
      }
    }
    walls.forEach((k, i) => {
      const [x, y] = k.split(',').map(Number);
      terrain.append(el('rect', { x: x + 0.04, y: y + 0.04, width: 0.92, height: 0.92, rx: 0.18, class: 'wall' }));
      terrain.append(el('text', { x: x + 0.5, y: y + 0.68, class: 'wallmoji' }, i % 2 ? '🌲' : '🪨'));
    });
  }

  function tokenNode(c) {
    let n = nodes.get(c.id);
    if (!n) {
      n = el('g', { class: 'tok' });
      n.append(
        el('circle', { cx: 0.5, cy: 0.5, r: 0.44, class: 'ring' }),
        el('circle', { cx: 0.5, cy: 0.5, r: 0.38, class: 'disc' }),
        el('text', { x: 0.5, y: 0.66, class: 'emo' }),
        el('rect', { x: 0.12, y: 0.86, width: 0.76, height: 0.09, rx: 0.04, class: 'hpbg' }),
        el('rect', { x: 0.12, y: 0.86, width: 0.76, height: 0.09, rx: 0.04, class: 'hp' }),
        el('text', { x: 0.88, y: 0.24, class: 'fxi' }),
        el('text', { x: 0.5, y: 0.13, class: 'lbl' }),
      );
      toks.append(n);
      nodes.set(c.id, n);
    }
    return n;
  }

  // view: { b, colors{id:color}, curId, reach[], preview{path,oas}, suggest{x,y}, mine }
  function render(view) {
    const { b } = view;
    const wk = b.walls.join(';');
    if (wk !== wallsKey) { drawTerrain(b.walls); wallsKey = wk; }

    over.innerHTML = '';
    for (const s of view.reach || []) over.append(el('rect', { x: s.x + 0.03, y: s.y + 0.03, width: 0.94, height: 0.94, rx: 0.12, class: 'reach' }));
    if (view.suggest) over.append(el('rect', { x: view.suggest.x + 0.08, y: view.suggest.y + 0.08, width: 0.84, height: 0.84, rx: 0.2, class: 'suggest' }));
    if (view.preview) {
      const me = b.creatures[view.mine];
      const pts = [{ x: me.x, y: me.y }, ...view.preview.path].map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' ');
      over.append(el('polyline', { points: pts, class: 'path' }));
      const end = view.preview.path[view.preview.path.length - 1];
      over.append(el('rect', { x: end.x + 0.06, y: end.y + 0.06, width: 0.88, height: 0.88, rx: 0.16, class: 'dest' }));
      over.append(el('text', { x: end.x + 0.5, y: end.y + 0.62, class: 'feet' }, `${view.preview.feet} ft`));
      for (const id of view.preview.oas) {
        const h = b.creatures[id];
        over.append(el('rect', { x: h.x - 0.97, y: h.y - 0.97, width: 2.94, height: 2.94, rx: 0.3, class: 'threat' }));
      }
    }
    if (view.cone && view.mine) {
      for (const q of coneSquares(b.creatures[view.mine], view.cone)) over.append(el('rect', { x: q.x + 0.05, y: q.y + 0.05, width: 0.9, height: 0.9, rx: 0.1, class: 'cone' }));
    }
    if (view.target) {
      const t = b.creatures[view.target];
      over.append(el('circle', { cx: t.x + 0.5, cy: t.y + 0.5, r: 0.49, class: 'aim' }));
    }

    const fxBy = {};
    for (const e of b.effects) {
      const who = e.type === 'dodge' || e.type === 'disengage' ? e.by : e.target;
      if (who) (fxBy[who] ||= []).push(EFFECT_ICONS[e.type]);
    }
    const seen = new Set();
    for (const c of Object.values(b.creatures)) {
      const n = tokenNode(c);
      seen.add(c.id);
      const gone = !onBoard(c);
      n.style.display = gone ? 'none' : '';
      if (gone) continue;
      n.style.transform = `translate(${c.x}px, ${c.y}px)`;
      const down = c.hp <= 0;
      n.setAttribute('class', `tok ${c.side} ${down ? 'down' : ''} ${c.dead ? 'dead' : ''} ${c.id === view.curId ? 'cur' : ''} ${c.id === view.mine ? 'mine' : ''}`);
      const [ring, disc, emo, , hp, fxi, lbl] = n.children;
      ring.style.stroke = view.colors[c.id] || '';
      disc.style.fill = c.side === 'hero' ? (view.colors[c.id] || '#4fc3f7') + '33' : '';
      emo.textContent = c.dead ? '💀' : down ? '💤' : c.emoji;
      const frac = Math.max(0, c.hp / c.hpMax);
      hp.setAttribute('width', (0.76 * frac).toFixed(3));
      hp.setAttribute('class', `hp ${frac <= 0.5 ? 'low' : ''}`);
      fxi.textContent = (fxBy[c.id] || []).join('');
      lbl.textContent = c.side === 'foe' ? (c.kind === 'goblin-boss' ? 'BOSS' : c.name.replace('Goblin ', 'G')) : '';
    }
    for (const [id, n] of nodes) if (!seen.has(id)) { n.remove(); nodes.delete(id); }
  }

  function ping(x, y, color) {
    const c = el('circle', { cx: x + 0.5, cy: y + 0.5, r: 0.2, class: 'ping' });
    c.style.stroke = color;
    fx.append(c);
    setTimeout(() => c.remove(), 1600);
  }

  return { render, ping };
}
