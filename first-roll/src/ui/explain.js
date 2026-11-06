// Turns battle records into words: a one-line summary for the roll toast and
// log, and the full "Why?" breakdown with links to the glossary.

import { GLOSSARY } from '../rules/glossary.js';
import { signed } from '../rules/data.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const R = (rule, label) => (rule && GLOSSARY[rule] ? `<a class="rl" data-rule="${rule}">${esc(label || GLOSSARY[rule].title)}</a>` : esc(label || ''));
const sumv = (a) => a.reduce((s, x) => s + x.value, 0);

const name = (b, id) => esc(b?.creatures?.[id]?.name || id);

// Records worth a pop-up dice card.
export const ROLLED = new Set(['attack', 'save', 'check', 'heal', 'initiative']);

function d20Text(d) {
  if (d.rolls.length === 1) return `${d.kept}`;
  return `${d.kept} <span class="dim">(rolled ${d.rolls.join(' and ')}, kept the ${d.mode === 'advantage' ? 'higher' : 'lower'})</span>`;
}

export function short(r, b) {
  switch (r.kind) {
    case 'attack': {
      const res = { crit: 'CRIT!', hit: 'HIT', miss: 'MISS', fumble: 'MISS (nat 1)' }[r.outcome];
      const dmg = r.damage ? ` · ${r.damage.total} dmg` : '';
      const mode = r.d20.mode === 'normal' ? '' : r.d20.mode === 'advantage' ? ' · Adv' : ' · Dis';
      return `🎲 ${r.d20.kept} ${signed(sumv(r.mods))} = <b>${r.total}</b> vs AC ${r.ac} · <b class="${r.damage ? 'good' : 'bad'}">${res}</b>${dmg}${mode}`;
    }
    case 'save': return `🎲 Death save: ${r.d20.kept} vs 10 · <b>${{ success: 'Success', fail: 'Failure', fail2: 'Two failures', revive: 'Back up!' }[r.outcome]}</b>`;
    case 'check': return `🎲 ${r.skill}: ${r.d20.kept} ${signed(sumv(r.mods))} = <b>${r.total}</b> vs DC ${r.dc} · <b>${r.outcome === 'success' ? 'Success' : 'Failure'}</b>`;
    case 'heal': return `🎲 ${r.what}: ${r.roll.rolls[0]} + ${sumv(r.mods)} = <b class="good">${r.total} HP</b>`;
    case 'initiative': return `🎲 Initiative: ${r.entries.map((e) => `${name(b, e.id)} ${e.total}`).join(', ')}`;
    default: return esc(r.text);
  }
}

// The full breakdown, as HTML.
export function detail(r, b) {
  const L = [];
  const line = (left, right = '', cls = '') => L.push(`<div class="ln ${cls}"><span>${left}</span><b>${right}</b></div>`);
  L.push(`<p class="lead">${esc(r.text)}</p>`);
  if (r.kind === 'attack') {
    L.push(`<h4>${R(r.rule, r.reaction ? 'Opportunity Attack' : 'Attack roll')}</h4>`);
    for (const a of r.d20.adv) line(`Advantage: ${R(a.rule, a.text)}`);
    for (const a of r.d20.dis) line(`Disadvantage: ${R(a.rule, a.text)}`);
    if (r.d20.adv.length && r.d20.dis.length) line(R('advantage', 'Advantage and Disadvantage cancel out'));
    line(`🎲 d20${r.d20.luck ? ' (a 1 was rerolled: ' + R('luck', 'Luck') + ')' : ''}`, d20Text(r.d20));
    for (const m of r.mods) line(R(m.rule, m.label), signed(m.value));
    line('Total', r.total, 'sum');
    line(`${name(b, r.target)}'s ${R('armor-class', 'Armor Class')}`, r.ac);
    for (const n of r.notes || []) line(R(n.rule, n.text));
    const verdict = { crit: `Natural 20: ${R('critical-hit', 'Critical Hit')}!`, hit: 'Hit: the total meets or beats the AC', miss: 'Miss: the total is below the AC', fumble: `Natural 1: ${R('critical-hit', 'always misses')}` }[r.outcome];
    line(verdict, '', r.damage ? 'good' : 'bad');
    if (r.damage) {
      L.push(`<h4>${R('damage', 'Damage')}</h4>`);
      for (const p of r.damage.parts) {
        line(R(p.rule, p.label) + (p.rolls ? ` <span class="dim">🎲 ${p.rolls.join(' + ')}</span>` : ''), p.rolls ? p.value : signed(p.value));
        if (p.savage) line(`<span class="dim">${R('savage-attacker', p.savage)}</span>`);
      }
      line(`${r.damage.type} damage`, r.damage.total, 'sum');
      if (r.after) line(`${name(b, r.target)}: ${r.after.before} → ${r.after.after} HP`);
      if (r.after?.downed) line(R('unconscious', 'Drops to 0 HP: Unconscious'), '', 'bad');
      if (r.after?.deathFail) line(R('death-saves', `${r.after.deathFail} failed death save${r.after.deathFail > 1 ? 's' : ''} (hit at 0 HP)`), '', 'bad');
    }
    if (r.mastery) L.push(`<h4>${R('weapon-mastery', 'Weapon Mastery')}: ${R(r.mastery.rule, r.mastery.name)}</h4><p>${esc(r.mastery.text)}</p>`);
  } else if (r.kind === 'save') {
    L.push(`<h4>${R('death-saves', 'Death Saving Throw')}</h4>`);
    line(`🎲 d20${r.d20.luck ? ' (' + R('luck', 'Luck') + ' rerolled a 1)' : ''}`, r.d20.kept);
    line('Needs 10 or higher', '');
    line('Tally', `${r.tally.s} ✔ · ${r.tally.f} ✖`);
  } else if (r.kind === 'check') {
    L.push(`<h4>${R(r.rule, 'Ability check')}</h4>`);
    line('🎲 d20', r.d20.kept);
    for (const m of r.mods) line(R(m.rule, m.label), signed(m.value));
    line('Total', r.total, 'sum');
    line('Difficulty Class', r.dc);
  } else if (r.kind === 'heal') {
    L.push(`<h4>${R(r.rule, r.what)}</h4>`);
    line(`🎲 ${r.roll.label}`, r.roll.rolls[0]);
    for (const m of r.mods) line(esc(m.label), signed(m.value));
    line('Healing', r.total, 'sum');
    line(`HP ${r.before} → ${r.after}`, '');
  } else if (r.kind === 'initiative') {
    L.push(`<h4>${R('initiative', 'Initiative')}</h4>`);
    for (const e of r.entries) {
      const parts = e.parts.map((p) => `${R(p.rule, p.label)} ${signed(p.value)}`).join(', ');
      line(`${name(b, e.id)}: 🎲 ${e.d20.kept}${e.d20.luck ? ' (Luck reroll)' : ''}, ${parts}`, e.total);
    }
    line('Highest goes first', '');
  }
  if (r.rule && GLOSSARY[r.rule]) {
    L.push(`<p class="rulebox"><b>${esc(GLOSSARY[r.rule].title)}.</b> ${esc(GLOSSARY[r.rule].text)}</p>`);
  }
  return L.join('');
}

export function glossaryHtml(key) {
  const g = GLOSSARY[key];
  if (!g) return '';
  return `<h3>${esc(g.title)}</h3><p>${esc(g.text)}</p>`;
}

// Rule keys seen in a fight, for the end-of-fight recap.
export function rulesSeen(log) {
  const seen = new Set();
  for (const r of log) {
    if (r.rule) seen.add(r.rule);
    for (const m of r.mods || []) if (m.rule) seen.add(m.rule);
    for (const a of r.d20?.adv || []) seen.add(a.rule);
    for (const a of r.d20?.dis || []) seen.add(a.rule);
    for (const p of r.damage?.parts || []) if (p.rule) seen.add(p.rule);
    if (r.mastery) seen.add(r.mastery.rule);
  }
  return [...seen].filter((k) => GLOSSARY[k]);
}
