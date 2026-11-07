// Chapter 1: Making your hero. A six-step builder that teaches the 2024
// character-creation order: class, background, species, ability scores,
// the background's increases, then a name and the finished sheet. Every
// step starts on a sensible recommendation, so "Next" all the way works.

import {
  CLASSES, BACKGROUNDS, SPECIES, FEATS, SKILL_NAMES, ABILITIES, ABILITY_NAMES, STANDARD_ARRAY,
  DRAGON_ANCESTRY, abilityMod, signed,
} from '../rules/data.js';
import { buildHero, defaultSpec, suggestPlus, validateSpec, DEFAULT_BACKGROUND } from '../rules/character.js';
import { GLOSSARY } from '../rules/glossary.js';
import { $, show } from './dom.js';
import { esc } from './explain.js';
import { sheetHtml, ruleLink as R } from './sheet.js';

const ABILITY_USES = {
  str: 'Melee attacks, Athletics', dex: 'AC, ranged and Finesse attacks, Stealth, Initiative',
  con: 'Hit Points, staying alive', int: 'Wizard spells, Investigation, Arcana',
  wis: 'Cleric spells, Perception, Insight, Medicine', cha: 'Persuasion, Intimidation, Deception',
};

const STEPS = [
  { id: 'class', title: 'Choose a class', rule: 'class' },
  { id: 'background', title: 'Choose a background', rule: 'background' },
  { id: 'species', title: 'Choose a species', rule: 'species' },
  { id: 'scores', title: 'Place your ability scores', rule: 'ability-scores' },
  { id: 'plus', title: 'Background increases', rule: 'background' },
  { id: 'review', title: 'Name your hero', rule: null },
];

export function openBuilder({ spec = null, playerName = '', onDone, onCancel }) {
  const d = spec ? JSON.parse(JSON.stringify(spec)) : defaultSpec('fighter', { name: playerName });
  if (!d.name) d.name = playerName;
  const touched = { background: !!spec, scores: !!spec, plus: !!spec };
  let step = 0;
  show('build');

  function setClass(cls) {
    d.cls = cls;
    if (!touched.background) d.background = DEFAULT_BACKGROUND[cls];
    if (!touched.scores) d.scores = { ...CLASSES[cls].suggested };
    if (!touched.plus) d.plus = suggestPlus(cls, d.background, d.scores);
  }
  function setBackground(bg) {
    d.background = bg;
    touched.background = true;
    d.plus = suggestPlus(d.cls, bg, d.scores);
    touched.plus = false;
  }

  function card({ on, emoji = '', title, sub = '', body = '', attr }) {
    return `<button class="pick ${on ? 'on' : ''}" ${attr}>${emoji ? `<span class="em">${emoji}</span>` : ''}
      <span class="pt"><b>${esc(title)}</b>${sub ? `<span class="sub">${sub}</span>` : ''}${body}</span></button>`;
  }

  const views = {
    class: () => `<p class="lead">Your class is what you do in a fight. You can change anything later.</p>
      ${Object.entries(CLASSES).map(([id, c]) => card({
        on: d.cls === id, emoji: c.emoji, title: `${c.name} · ${c.role}`,
        sub: `d${c.hitDie} Hit Die · main ability ${ABILITY_NAMES[c.primary]}${c.spellcasting ? ' · casts spells' : ''}`,
        body: `<span>${esc(c.blurb)}</span><span class="dim">${esc(c.plays)}</span>`, attr: `data-cls="${id}"`,
      })).join('')}`,
    background: () => `<p class="lead">What did your hero do before adventuring? In the 2024 rules your background gives your ability increases, an ${R('alert', 'Origin feat')} and two skills.</p>
      ${Object.entries(BACKGROUNDS).map(([id, b]) => {
        const f = FEATS[b.feat];
        return card({
          on: d.background === id, title: b.name, sub: esc(b.blurb),
          body: `<span>Raises: ${b.abilities.map((a) => ABILITY_NAMES[a]).join(', ')}${b.abilities.includes(CLASSES[d.cls].primary) ? ` <b class="good">(includes your ${ABILITY_NAMES[CLASSES[d.cls].primary]})</b>` : ''}</span>
            <span>Feat: <b>${esc(f.name)}</b>. ${esc(f.text)}</span>
            <span class="dim">Skills: ${b.skills.map((s) => SKILL_NAMES[s]).join(', ')}</span>`,
          attr: `data-bg="${id}"`,
        });
      }).join('')}`,
    species: () => `<p class="lead">Your species gives you traits. In the 2024 rules it doesn't change your ability scores, so pick whatever you like the sound of.</p>
      ${Object.entries(SPECIES).map(([id, s]) => card({
        on: d.species === id, emoji: s.emoji, title: s.name, sub: `Speed ${s.speed} ft`,
        body: `<span>${s.traits.slice(0, 3).map((t) => `<b>${esc(t.name)}</b>: ${esc(t.text)}`).join('<br>')}</span>`,
        attr: `data-sp="${id}"`,
      })).join('')}
      ${d.species === 'dragonborn' ? `<label class="fld">Dragon ancestry (your breath's damage type)
        <select id="b-anc">${Object.entries(DRAGON_ANCESTRY).map(([k, a]) => `<option value="${k}" ${d.ancestry === k ? 'selected' : ''}>${a.name} (${a.type})</option>`).join('')}</select></label>` : ''}`,
    scores: () => {
      const c = CLASSES[d.cls];
      return `<p class="lead">The standard array is ${STANDARD_ARRAY.join(', ')}. Put each number on one ability. Your ${c.name}'s most important ability is <b>${ABILITY_NAMES[c.primary]}</b>, and Constitution keeps you alive.</p>
        <button class="btn small" id="b-suggest">Use the suggested scores for a ${c.name}</button>
        <div class="scores">${ABILITIES.map((a) => `<div class="srow"><span><b>${ABILITY_NAMES[a]}</b><span class="dim">${ABILITY_USES[a]}</span></span>
          <select data-ab="${a}">${STANDARD_ARRAY.map((v) => `<option ${d.scores[a] === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <b class="mod">${signed(abilityMod(d.scores[a]))}</b></div>`).join('')}</div>
        <p class="note">Picking a number another ability already has swaps the two. The modifier on the right is what you add to rolls: ${R('ability-modifier', 'score − 10, halved, rounded down')}.</p>`;
    },
    plus: () => {
      const b = BACKGROUNDS[d.background];
      const three = Object.keys(d.plus).length === 3;
      return `<p class="lead">${esc(b.name)} raises ${b.abilities.map((a) => ABILITY_NAMES[a]).join(', ')}. Give one +2 and another +1, or +1 to all three.</p>
        <div class="seg wide"><button id="b-p21" class="${three ? '' : 'on'}">+2 and +1</button><button id="b-p111" class="${three ? 'on' : ''}">+1, +1, +1</button></div>
        <div class="scores">${b.abilities.map((a) => {
          const v = d.plus[a] || 0;
          return `<div class="srow"><span><b>${ABILITY_NAMES[a]}</b><span class="dim">${d.scores[a]} → ${d.scores[a] + v} (${signed(abilityMod(d.scores[a] + v))})</span></span>
            ${three ? '<b>+1</b>' : `<span class="seg">${[2, 1, 0].map((n) => `<button data-plus="${a}:${n}" class="${v === n ? 'on' : ''}">+${n}</button>`).join('')}</span>`}</div>`;
        }).join('')}</div>
        <p class="note">Tip: raising an odd score to an even one bumps its modifier. 15 → 17 gives +3.</p>`;
    },
    review: () => {
      let h;
      try { h = buildHero(d, { id: 'preview', name: d.name }); } catch (e) { return `<p class="bad">${esc(e.message)}</p>`; }
      return `<label class="fld">Hero name<input id="b-name" maxlength="20" value="${esc(d.name)}" placeholder="${esc(playerName || 'Name')}"></label>
        <div class="sheet-inline">${sheetHtml(h)}</div>`;
    },
  };

  function render() {
    const st = STEPS[step];
    const g = st.rule && GLOSSARY[st.rule];
    $('build-body').innerHTML = `
      <div class="build-head"><span class="kicker">Chapter 1 · Making your hero · step ${step + 1} of ${STEPS.length}</span>
        <h2 class="bt">${st.title}</h2>
        <div class="dots">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div></div>
      ${views[st.id]()}
      ${g ? `<p class="rulebox"><b>${esc(g.title)}.</b> ${esc(g.text)}</p>` : ''}`;
    $('build-back').textContent = step ? 'Back' : 'Cancel';
    $('build-next').textContent = step === STEPS.length - 1 ? 'Done: this is my hero' : 'Next';
    bind();
  }

  function bind() {
    const B = $('build-body');
    for (const el of B.querySelectorAll('[data-cls]')) el.onclick = () => { setClass(el.dataset.cls); render(); };
    for (const el of B.querySelectorAll('[data-bg]')) el.onclick = () => { setBackground(el.dataset.bg); render(); };
    for (const el of B.querySelectorAll('[data-sp]')) el.onclick = () => { d.species = el.dataset.sp; render(); };
    if ($('b-anc')) $('b-anc').onchange = (e) => { d.ancestry = e.target.value; };
    if ($('b-suggest')) $('b-suggest').onclick = () => { d.scores = { ...CLASSES[d.cls].suggested }; touched.scores = true; d.plus = suggestPlus(d.cls, d.background, d.scores); render(); };
    for (const el of B.querySelectorAll('select[data-ab]')) {
      el.onchange = () => {
        const a = el.dataset.ab, v = +el.value;
        const other = ABILITIES.find((x) => x !== a && d.scores[x] === v);
        if (other) d.scores[other] = d.scores[a];
        d.scores[a] = v;
        touched.scores = true;
        if (!touched.plus) d.plus = suggestPlus(d.cls, d.background, d.scores);
        render();
      };
    }
    if ($('b-p21')) $('b-p21').onclick = () => { d.plus = suggestPlus(d.cls, d.background, d.scores); touched.plus = true; render(); };
    if ($('b-p111')) $('b-p111').onclick = () => { d.plus = Object.fromEntries(BACKGROUNDS[d.background].abilities.map((a) => [a, 1])); touched.plus = true; render(); };
    for (const el of B.querySelectorAll('[data-plus]')) {
      el.onclick = () => {
        const [a, n] = el.dataset.plus.split(':');
        const v = +n;
        const abs = BACKGROUNDS[d.background].abilities;
        if (v === 0) { delete d.plus[a]; }
        else {
          // Keep exactly one +2 and one +1: whoever had this value gives it up.
          for (const x of abs) if (x !== a && d.plus[x] === v) delete d.plus[x];
          d.plus[a] = v;
          const need = v === 2 ? 1 : 2;
          if (!abs.some((x) => d.plus[x] === need)) {
            const spare = abs.find((x) => x !== a && !d.plus[x]);
            if (spare) d.plus[spare] = need;
          }
        }
        touched.plus = true;
        render();
      };
    }
    if ($('b-name')) $('b-name').oninput = (e) => { d.name = e.target.value.slice(0, 20); };
  }

  $('build-back').onclick = () => { if (step) { step--; render(); } else onCancel?.(); };
  $('build-next').onclick = () => {
    if (step < STEPS.length - 1) { step++; render(); return; }
    try {
      const clean = validateSpec({ ...d, name: d.name || playerName });
      onDone(clean);
    } catch (e) {
      $('build-body').insertAdjacentHTML('beforeend', `<p class="bad">${esc(e.message)}</p>`);
    }
  };
  render();
}
