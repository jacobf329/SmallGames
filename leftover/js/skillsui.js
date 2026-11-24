// Leftover Uprising - the skill tree panel and mastery chips, as HTML strings,
// shared by the standalone phone page and the Party Pad phone controller.
// Buttons carry data-skill="<tree>"; each page wires the click to send
// { t: 'skill', tree }.

import { TREES, SKILLS, MAX_MASTERY, skillCost } from './data.js';

// Level pips for every tree, e.g. "🔥 ●●●○○".
export function chipsHtml(m = {}, cls = 'mchips') {
  return `<div class="${cls}">${Object.entries(TREES).map(([k, t]) => {
    const l = m[k] || 0;
    return `<span title="${t.name} level ${l}">${t.icon} <b>${'●'.repeat(l)}</b><i>${'○'.repeat(MAX_MASTERY - l)}</i></span>`;
  }).join('')}</div>`;
}

// The full skill tree: one row per tree with its pips, the next level's
// effect and a buy button.
export function skillsHtml(me) {
  const sp = me?.sp || 0, m = me?.m || {};
  return `<div class="sk-head"><b>📖 Skill tree</b><span class="sk-sp">${sp} point${sp === 1 ? '' : 's'} to spend</span></div>
    <p class="sk-note">You earn 1 point per wave cleared, 2 after a boss. Level n costs n points, so you can master about two trees in a game. Split them with your team.</p>
    <div class="sk-rows">${Object.entries(TREES).map(([k, t]) => {
      const l = m[k] || 0, maxed = l >= MAX_MASTERY, cost = skillCost(l);
      return `<div class="sk-row" style="--tc:${t.color}">
        <div class="sk-top"><b>${t.icon} ${t.name}</b><span class="sk-pips">${'●'.repeat(l)}<i>${'○'.repeat(MAX_MASTERY - l)}</i></span></div>
        <small>${maxed ? 'Mastered!' : `Level ${l + 1}: ${SKILLS[k][l]}`}</small>
        ${maxed ? '' : `<button class="sk-buy" data-skill="${k}" ${sp < cost ? 'disabled' : ''}>Learn · ${cost} pt${cost === 1 ? '' : 's'}</button>`}
      </div>`;
    }).join('')}</div>`;
}

export const SKILL_CSS = `
.sk-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px}
.sk-sp{background:#ffd23f;color:#2a1206;border-radius:99px;padding:2px 10px;font-weight:800;font-size:.85rem}
.sk-note{color:#c9b39a;font-size:.78rem;margin:0 0 8px}
.sk-rows{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.sk-row{background:#33241b;border:1px solid rgba(255,240,220,.12);border-left:4px solid var(--tc);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
.sk-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
.sk-pips{color:var(--tc);letter-spacing:1px;font-size:.8rem}.sk-pips i,.mchips i{color:rgba(255,255,255,.25);font-style:normal}
.sk-row small{color:#d8c2a8;font-size:.75rem;line-height:1.25}
.sk-buy{background:var(--tc);color:#1d1410;border:0;border-radius:9px;padding:6px 8px;font-weight:800;cursor:pointer}
.sk-buy[disabled]{opacity:.35}
.mchips{display:flex;gap:6px;flex-wrap:wrap}.mchips span{background:#33241b;border-radius:8px;padding:2px 7px;font-size:.78rem;color:#d8c2a8;white-space:nowrap}.mchips b{color:#fff;font-weight:400;letter-spacing:1px}
.sk-badge{position:relative}.sk-badge[data-n]:not([data-n="0"])::after{content:attr(data-n);position:absolute;top:-6px;right:-6px;background:#ffd23f;color:#2a1206;border-radius:99px;font-size:.7rem;font-weight:900;min-width:18px;height:18px;line-height:18px;text-align:center}
`;
