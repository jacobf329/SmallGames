// Turns battle records into words: a one-line summary for the roll toast and
// log, and the full "Why?" breakdown with links to the glossary.

import { GLOSSARY } from '../rules/glossary.js';
import { signed, ABILITY_NAMES } from '../rules/data.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const R = (rule, label) => (rule && GLOSSARY[rule] ? `<a class="rl" data-rule="${rule}">${esc(label || GLOSSARY[rule].title)}</a>` : esc(label || ''));
const sumv = (a) => a.reduce((s, x) => s + x.value, 0);

const name = (b, id, r) => esc(b?.creatures?.[id]?.name || r?.name || id);

// Records worth a pop-up dice card.
export const ROLLED = new Set(['attack', 'save', 'check', 'heal', 'initiative', 'save-spell', 'missile']);

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
    case 'save': {
      if (r.save && r.save !== 'death') {
        const what = { concentration: 'Concentration save', condition: 'Save to break free', story: `${ABILITY_NAMES[r.ability] || ''} save` }[r.save] || 'Save';
        if (!r.d20) return `🎲 ${what}: <b>automatic failure</b>`;
        return `🎲 ${what}: ${r.d20.kept} ${signed(sumv(r.mods || []))} = <b>${r.total}</b> vs DC ${r.dc} · <b class="${r.outcome === 'success' ? 'good' : 'bad'}">${r.outcome === 'success' ? 'Success' : 'Failure'}</b>`;
      }
      return `🎲 Death save: ${r.d20.kept} vs 10 · <b>${{ success: 'Success', fail: 'Failure', fail2: 'Two failures', revive: 'Back up!' }[r.outcome]}</b>`;
    }
    case 'check': return `🎲 ${r.skill}: ${r.d20.kept} ${signed(sumv(r.mods))} = <b>${r.total}</b> vs DC ${r.dc} · <b>${r.outcome === 'success' ? 'Success' : 'Failure'}</b>`;
    case 'heal': return `💚 ${esc(r.what)}${r.target && r.target !== r.by ? ` on ${name(b, r.target)}` : ''}: ${r.roll?.rolls?.length ? `${r.roll.rolls.join(' + ')} ${signed(sumv(r.mods || []))} = ` : ''}<b class="good">${r.total} HP</b>`;
    case 'save-spell': {
      const fails = r.results.filter((x) => !x.success).length;
      return `💥 ${esc(r.what)}: DC ${r.dc} ${r.ability.toUpperCase()} save · ${r.results.length ? `${fails} failed, ${r.results.length - fails} saved${r.damage ? ` · ${r.damage.total} dmg` : ''}` : 'nobody caught'}`;
    }
    case 'missile': return `✨ ${r.darts.map((d) => d.value).join(' + ')} = <b class="good">${r.total} Force</b> · never misses`;
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
  } else if (r.kind === 'save-spell') {
    L.push(`<h4>${R(r.rule, r.what)}</h4>`);
    line(R('spell-save-dc', 'Save DC'), '');
    for (const m of r.dcParts) line(R(m.rule, m.label), m.label === 'Base' ? m.value : signed(m.value));
    line('DC', r.dc, 'sum');
    if (r.damage) {
      L.push(`<h4>${R('damage', 'Damage')}</h4>`);
      for (const p of r.damage.parts) line(`${esc(p.label)}${p.rolls ? ` <span class="dim">🎲 ${p.rolls.join(' + ')}</span>` : ''}`, p.rolls ? p.value : signed(p.value));
      line(`${r.damage.type} damage${r.half ? ' (half on a successful save)' : ' (none on a successful save)'}`, r.damage.total, 'sum');
    }
    L.push(`<h4>${R('saving-throws', `${ABILITY_NAMES[r.ability]} saving throws`)}</h4>`);
    if (!r.results.length) line('Nobody was in the area.');
    for (const x of r.results) {
      const how = x.auto ? esc(x.note) : `🎲 ${x.d20.kept}${x.d20.rolls.length > 1 ? ` (${x.d20.mode})` : ''} ${x.mods.map((m) => signed(m.value)).join(' ')} = ${x.total}`;
      line(`${name(b, x.target)}: ${how}`, `${x.success ? 'saved' : 'failed'}${r.damage ? ` · ${x.damage}` : ''}`, x.success ? 'good' : 'bad');
      if (!r.damage && x.text) line(`<span class="dim">${esc(x.text)}</span>`);
      if (x.after?.downed || x.after?.dead) line(`<span class="dim">${esc(x.text)}</span>`);
    }
  } else if (r.kind === 'missile') {
    L.push(`<h4>${R('magic-missile', 'Magic Missile')}</h4>`);
    r.darts.forEach((d, i) => line(`Dart ${i + 1}: 🎲 1d4 = ${d.rolls[0]}, +1`, d.value));
    line('Force damage (every dart hits)', r.total, 'sum');
    if (r.after) line(`${name(b, r.target)}: ${r.after.before} → ${r.after.after} HP`);
  } else if (r.kind === 'save' && r.save && r.save !== 'death') {
    const what = { concentration: 'Concentration save', condition: 'Saving throw to end a condition', story: `${ABILITY_NAMES[r.ability] || ''} saving throw` }[r.save] || 'Saving throw';
    L.push(`<h4>${R(r.rule || 'saving-throw', what)}</h4>`);
    if (!r.d20) line(esc(r.note || 'Automatic failure'), '', 'bad');
    else {
      for (const a of r.d20.adv || []) line(`Advantage: ${R(a.rule, a.text)}`);
      for (const a of r.d20.dis || []) line(`Disadvantage: ${R(a.rule, a.text)}`);
      line(`🎲 d20${r.inspired ? ' (' + R('heroic-inspiration', 'Heroic Inspiration') + ': rerolled)' : ''}`, d20Text(r.d20));
      for (const m of r.mods || []) line(R(m.rule, m.label), signed(m.value));
      line('Total', r.total, 'sum');
    }
    line('Difficulty Class', r.dc);
    line(r.outcome === 'success' ? 'Success: the total meets or beats the DC' : 'Failure: the total is below the DC', '', r.outcome === 'success' ? 'good' : 'bad');
  } else if (r.kind === 'save') {
    L.push(`<h4>${R('death-saves', 'Death Saving Throw')}</h4>`);
    line(`🎲 d20${r.d20.luck ? ' (' + R('luck', 'Luck') + ' rerolled a 1)' : ''}`, r.d20.kept);
    line('Needs 10 or higher', '');
    line('Tally', `${r.tally.s} ✔ · ${r.tally.f} ✖`);
  } else if (r.kind === 'check') {
    L.push(`<h4>${R(r.rule, `${r.skill} check`)}</h4>`);
    for (const a of r.d20.adv || []) line(`Advantage: ${R(a.rule, a.text)}`);
    line(`🎲 d20${r.d20.luck ? ' (' + R('luck', 'Luck') + ' rerolled a 1)' : ''}`, d20Text(r.d20));
    for (const m of r.mods) line(R(m.rule, m.label), signed(m.value));
    line('Total', r.total, 'sum');
    line('Difficulty Class', r.dc);
  } else if (r.kind === 'heal') {
    L.push(`<h4>${R(r.rule, r.what)}</h4>`);
    if (r.roll?.rolls?.length) line(`🎲 ${r.roll.label}`, r.roll.rolls.join(' + '));
    for (const m of r.mods) line(esc(m.label), signed(m.value));
    line('Healing', r.total, 'sum');
    line(`${r.target ? name(b, r.target) : 'HP'}: ${r.before} → ${r.after} HP`, '');
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
    for (const p of r.dcParts || []) if (p.rule) seen.add(p.rule);
    if (r.kind === 'save-spell') seen.add('saving-throws');
    if (r.mastery) seen.add(r.mastery.rule);
  }
  return [...seen].filter((k) => GLOSSARY[k]);
}
