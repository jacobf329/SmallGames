// Leftover Uprising - "new food!" cards. Everything on a card is worked out
// from the food's numbers in data.js, so a balance change can never leave a
// card saying something false. Shared by the solo page, the TV and the phones.

import { ENEMIES } from './data.js';

const DT = { heat: ['🔥', 'Heat'], chop: ['🔪', 'Chop'], cold: ['❄️', 'Cold'], sticky: ['🍯', 'Sticky'], basic: ['🍽️', 'Prep Stations'] };
const pct = v => `${Math.round(v * 100)}%`;

export function foodInfo(id) {
  const e = ENEMIES[id];
  const traits = [], weak = [], resist = [];
  if (e.boss) traits.push(`Boss: costs ${e.leak} lives if it escapes. Freezes and stuns barely hold it`);
  if (e.air) traits.push('Flies: Chop and Sticky towers can’t reach it. Heat, Cold and Prep Stations can');
  if (e.armour) traits.push(`Armour ${e.armour}: knocks ${e.armour} off every hit, so big hits work best. The Meat Tenderizer ignores it`);
  if (e.regen) traits.push(`Regrows ${e.regen} health a second, but not while it’s burning (Heat)`);
  if (e.frozen) traits.push('Frozen solid: it can’t be slowed or frozen');
  if (e.greasy) traits.push('Greasy: syrup slides right off');
  if (e.split) traits.push(`Splits into ${e.split.n} ${ENEMIES[e.split.into].name.toLowerCase()}${e.split.n > 1 ? 's' : ''} when it pops`);
  if (e.speed >= 1.6) traits.push('Fast: it’s through the kitchen before slow towers get a second shot');
  else if (e.speed <= 0.65 && !e.boss) traits.push('Slow and tough');
  if (!e.boss && e.leak > 1) traits.push(`Costs ${e.leak} lives if it escapes`);
  for (const [dt, v] of Object.entries(e.res)) {
    const [icon, name] = DT[dt] || ['', dt];
    if (v === 0) resist.push(`${icon} ${name}: immune`);
    else if (v < 1) resist.push(`${icon} ${name} (takes only ${pct(v)})`);
    else if (v > 1) weak.push(`${icon} ${name} (takes ${pct(v)})`);
  }
  if (e.armour >= 15) weak.push('🔨 Meat Tenderizer (ignores armour)');
  if (e.regen && !(e.res.heat < 1)) weak.push('🔥 Burning stops it regrowing');
  return { id, icon: e.icon, name: e.name, hp: e.hp, traits, weak, resist };
}

export function foodCardHtml(id) {
  const f = foodInfo(id);
  const list = (title, items, cls) => items.length ? `<div class="fc-list ${cls}"><b>${title}</b>${items.map(t => `<span>${t}</span>`).join('')}</div>` : '';
  return `<div class="fc">
    <div class="fc-top"><span class="fc-icon">${f.icon === '🟢' ? '<i class="fc-pea"></i>' : f.icon}</span><div><b class="fc-name">${f.name}</b><small>${f.hp} health</small></div></div>
    ${list('Traits', f.traits, 'tr')}${list('Weak to', f.weak, 'wk')}${list('Resists', f.resist, 'rs')}
    ${!f.traits.length && !f.weak.length && !f.resist.length ? '<div class="fc-list"><span>No tricks: anything hurts it.</span></div>' : ''}
  </div>`;
}

// A popup body for one or more new foods.
export function newFoodHtml(ids, wave) {
  return `<div class="fc-head"><span class="fc-kicker">New food${ids.length > 1 ? 's' : ''} coming${wave ? ` in wave ${wave}` : ''}</span></div>
    <div class="fc-grid">${ids.map(foodCardHtml).join('')}</div>`;
}

export const FOOD_CSS = `
.fc-head{text-align:center;margin-bottom:10px}.fc-kicker{display:inline-block;background:#ffd23f;color:#2a1206;border-radius:99px;padding:4px 14px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;font-size:.8rem}
.fc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}
.fc{background:#33241b;border:1px solid rgba(255,240,220,.14);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px;color:#fff4e6;text-align:left}
.fc-top{display:flex;align-items:center;gap:12px}.fc-icon{font-size:2.6rem;line-height:1}.fc-name{display:block;font-size:1.2rem}.fc-top small{color:#c9b39a}
.fc-pea{display:inline-block;width:1.6rem;height:1.6rem;border-radius:50%;background:#6cc04a;border:2px solid #3d7a25}
.fc-list{display:flex;flex-direction:column;gap:3px;font-size:.86rem;line-height:1.3}.fc-list b{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:#a08870}
.fc-list.wk span{color:#9fe6a8}.fc-list.rs span{color:#ffb0a8}.fc-list.tr span{color:#f3e2cc}
`;
