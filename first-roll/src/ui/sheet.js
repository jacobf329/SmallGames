// A character sheet laid out like a real one: abilities, saves, AC, HP,
// attacks, spells, skills and features, every number linked to its rule.

import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, SPELLS, MASTERIES, signed } from '../rules/data.js';
import { GLOSSARY } from '../rules/glossary.js';
import { esc } from './explain.js';

export const ruleLink = (rule, label) => (rule && GLOSSARY[rule] ? `<a class="rl" data-rule="${rule}">${esc(label)}</a>` : esc(label));
const total = (parts) => parts.reduce((s, p) => s + p.value, 0);
const pips = (left, max) => `${'●'.repeat(Math.max(0, left))}${'○'.repeat(Math.max(0, max - left))}`;
const COND = { prone: 'Prone', restrained: 'Restrained', grappled: 'Grappled', frightened: 'Frightened', poisoned: 'Poisoned',
  paralyzed: 'Paralyzed', incapacitated: 'Incapacitated', hidden: 'Hidden', commanded: 'Commanded' };
const COND_RULE = { hidden: 'hide', commanded: 'command' };

// Uses left of limited features, conditions and Concentration.
function nowHtml(c) {
  const R = ruleLink;
  const L = [];
  const use = (u, name, rule) => { if (c[u]) L.push(`<div class="ln"><span>${R(rule, name)}</span><b>${pips(c[u].uses, c[u].max)}</b></div>`); };
  use('secondWind', 'Second Wind', 'second-wind');
  use('actionSurge', 'Action Surge', 'action-surge');
  use('channel', 'Channel Divinity', 'channel-divinity');
  use('adrenaline', 'Adrenaline Rush', 'adrenaline-rush');
  if (c.breath) L.push(`<div class="ln"><span>${R('breath-weapon', 'Breath Weapon')}</span><b>${c.breath.uses} left</b></div>`);
  if (c.hitDice) L.push(`<div class="ln"><span>${R('hit-point-dice', `Hit Point Dice (d${c.hitDice.die})`)}</span><b>${pips(c.hitDice.left, c.hitDice.max)}</b></div>`);
  if (c.inspiration) L.push(`<div class="ln"><span>${R('heroic-inspiration', 'Heroic Inspiration')}</span><b>ready</b></div>`);
  if (c.exhaustion) L.push(`<div class="ln bad"><span>${R('exhaustion', 'Exhaustion')}</span><b>level ${c.exhaustion}</b></div>`);
  for (const x of c.conds || []) if (COND[x.id]) L.push(`<div class="ln bad"><span>${R(COND_RULE[x.id] || x.id, COND[x.id])}</span><b>${x.lasting ? 'until a Long Rest' : ''}</b></div>`);
  if (c.conc) L.push(`<div class="ln"><span>${R('concentration', 'Concentrating on')}</span><b>${esc(SPELLS[c.conc.spell]?.name || c.conc.spell)}</b></div>`);
  return L.length ? `<h4>Right now</h4>${L.join('')}` : '';
}

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
    const slots = Object.entries(c.casting.slots || {}).map(([lv, x]) =>
      `<div class="ln"><span>${R('spell-slots', `Level ${lv} spell slots`)}</span><b>${pips(x.left, x.max)}</b></div>`).join('');
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
    ${nowHtml(c)}
    <h4>Attacks</h4>${atks}
    ${spells}
    ${c.side === 'hero' ? saves + skills : ''}
    <h4>Features</h4>${feats}`;
}
