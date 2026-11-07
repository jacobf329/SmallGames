// A character sheet laid out like a real one: abilities, saves, AC, HP,
// attacks, spells, skills and features, every number linked to its rule.

import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, SPELLS, MASTERIES, signed } from '../rules/data.js';
import { GLOSSARY } from '../rules/glossary.js';
import { esc } from './explain.js';

export const ruleLink = (rule, label) => (rule && GLOSSARY[rule] ? `<a class="rl" data-rule="${rule}">${esc(label)}</a>` : esc(label));
const total = (parts) => parts.reduce((s, p) => s + p.value, 0);

export function sheetHtml(c) {
  const R = ruleLink;
  const abil = ABILITIES.map((a) => `<div>${a.toUpperCase()}<b>${signed(c.mods[a])}</b>${c.scores[a]}</div>`).join('');
  const ac = c.acParts.map((p) => `${esc(p.label)} ${p.value}`).join(' + ');
  const atks = c.attacks.map((a) => {
    const hit = total(a.hit);
    const flat = total(a.dmgFlat);
    const rng = a.range ? ` · range ${a.range[0]}/${a.range[1]} ft` : ' · reach 5 ft';
    const m = a.mastery ? ` · Mastery: ${R(MASTERIES[a.mastery].rule, MASTERIES[a.mastery].name)}` : '';
    const extra = a.advDice ? ` (+${a.advDice} with Advantage)` : '';
    return `<div class="ln"><span><b>${esc(a.name)}</b> ${R('attack-roll', signed(hit))} to hit${rng}${m}</span><b>${a.dice}${signed(flat)}${extra} ${a.type}</b></div>`;
  }).join('');

  let spells = '';
  if (c.casting) {
    const stats = Object.entries(c.casting.stats).map(([ab, s]) =>
      `<div class="ln"><span>${ABILITY_NAMES[ab]} spells: ${R('spell-attack', 'spell attack')} ${signed(total(s.attack))}, ${R('spell-save-dc', 'save DC')}</span><b>${total(s.dc)}</b></div>`).join('');
    const slots = c.casting.slots ? `<div class="ln"><span>${R('spell-slots', 'Level 1 spell slots')}</span><b>${'●'.repeat(c.casting.slots.left)}${'○'.repeat(c.casting.slots.max - c.casting.slots.left)}</b></div>` : '';
    const list = Object.entries(c.casting.known).map(([sid, k]) => {
      const s = SPELLS[sid];
      const lvl = s.level === 0 ? R('cantrips', 'Cantrip') : `Level ${s.level}`;
      const how = [k.slot ? 'slot' : '', k.free ? `${k.free} free cast` : ''].filter(Boolean).join(', ');
      return `<p class="feat"><b>${R(sid, s.name)}</b> <span class="dim">(${lvl}${how ? `, ${how}` : ''} · ${esc(k.source)})</span>: ${esc(s.text)}</p>`;
    }).join('');
    spells = `<h4>${R('spellcasting', 'Spells')}</h4>${stats}${slots}${list}`;
  }

  let skills = '';
  if (c.profSkills) {
    skills = `<h4>${R('skills', 'Skills')} <span class="dim">(★ proficient, ★★ Expertise)</span></h4><div class="skills">${Object.keys(SKILLS).map((s) => {
      const star = c.expertise.includes(s) ? '★★' : c.profSkills.includes(s) ? '★' : '';
      return `<span class="${star ? 'prof' : ''}">${SKILL_NAMES[s]} <b>${signed(c.skills[s])}</b> ${star}</span>`;
    }).join('')}</div>`;
  }
  const saves = `<h4>${R('saving-throws', 'Saving throws')}</h4><div class="skills">${ABILITIES.map((a) =>
    `<span class="${c.saveProfs?.includes(a) ? 'prof' : ''}">${ABILITY_NAMES[a]} <b>${signed(c.saves?.[a] ?? c.mods[a])}</b>${c.saveProfs?.includes(a) ? ' ★' : ''}</span>`).join('')}</div>`;

  const feats = (c.features || []).map((f) => `<p class="feat"><b>${R(f.rule, f.name)}</b>${f.source ? ` <span class="dim">(${esc(f.source)})</span>` : ''}: ${esc(f.text)}</p>`).join('');
  const subtitle = c.side === 'foe' ? `${esc(c.statName)} · ${esc(c.statType || '')}` : `${esc(c.species)} ${esc(c.className)} · ${esc(c.background)} background · level ${c.level}`;
  const hp = c.hpParts ? `: ${c.hpParts.map((p) => `${esc(p.label)} ${p.value}`).join(' + ')}` : '';
  return `<h3>${c.emoji} ${esc(c.name)}</h3><p class="dim">${subtitle}</p>
    <div class="grid6">${abil}</div>
    <h4>Defense</h4>
    <div class="ln"><span>${R('armor-class', 'Armor Class')}: ${ac}</span><b>${c.ac}</b></div>
    <div class="ln"><span>${R('hit-points', 'Hit Points')}${hp}</span><b>${c.hp} / ${c.hpMax}${c.tempHp ? ` (+${c.tempHp} temp)` : ''}</b></div>
    <div class="ln"><span>${R('movement', 'Speed')}</span><b>${c.speed} ft</b></div>
    <div class="ln"><span>${R('initiative', 'Initiative')}</span><b>${signed(total(c.initParts))}</b></div>
    ${c.pb ? `<div class="ln"><span>${R('proficiency', 'Proficiency Bonus')}</span><b>${signed(c.pb)}</b></div>` : ''}
    <h4>Attacks</h4>${atks}
    ${spells}
    ${c.side === 'hero' ? saves + skills : ''}
    <h4>Features</h4>${feats}`;
}
