// Chapter 1: Making your hero. The builder follows the 2024 creation order:
// class, background, species, Origin feats, ability scores (standard array,
// point buy or rolled), the background's increases, the class's own choices
// (skills, gear, Fighting Style, Weapon Mastery, Divine Order), spells for a
// caster, then a name and the finished sheet. Every step starts on a
// sensible recommendation, so "Next" all the way works.
//
// The same screen, in mode 'levelup', lets a caster pick the spells a new
// level brings; in mode 'rest' it changes prepared spells after a Long Rest.

import {
  CLASSES, BACKGROUNDS, SPECIES, FEATS, ORIGIN_FEATS, SKILLS, SKILL_NAMES, ABILITIES, ABILITY_NAMES, STANDARD_ARRAY,
  DRAGON_ANCESTRY, KITS, FIGHTING_STYLES, WEAPONS, MASTERIES, SPELLS, SPELL_LISTS, POINT_COST, POINT_BUDGET,
  abilityMod, signed,
} from '../rules/data.js';
import {
  buildHero, defaultSpec, suggestPlus, validateSpec, DEFAULT_BACKGROUND, classSpellCounts, domainSpells,
  maxSpellLevel, miCantrips, miSpells, pointCost, rollTotal, speciesCantrips, bookLimit, SCHOLAR_SKILLS,
} from '../rules/character.js';
import { GLOSSARY } from '../rules/glossary.js';
import { $, show } from './dom.js';
import { esc } from './explain.js';
import { sheetHtml, ruleLink as R } from './sheet.js';

const ABILITY_USES = {
  str: 'Melee attacks, Athletics', dex: 'AC, ranged and Finesse attacks, Stealth, Initiative',
  con: 'Hit Points, staying alive', int: 'Wizard spells, Investigation, Arcana',
  wis: 'Cleric spells, Perception, Insight, Medicine', cha: 'Persuasion, Intimidation, Deception',
};
const CAST = ['int', 'wis', 'cha'];
const TIME = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction' };
const LIST_NAME = { cleric: 'Cleric', wizard: 'Wizard' };
const ORDERS = {
  protector: { name: 'Protector', text: 'Trained for battle: you can use Martial weapons and wear Heavy armor.' },
  thaumaturge: { name: 'Thaumaturge', text: 'One extra cantrip, and your Wisdom modifier (at least +1) added to Intelligence (Arcana and Religion) checks.' },
};

const ALL_STEPS = [
  { id: 'class', title: 'Choose a class', rule: 'class' },
  { id: 'background', title: 'Choose a background', rule: 'background' },
  { id: 'species', title: 'Choose a species', rule: 'species' },
  { id: 'feats', title: 'Your Origin feats', rule: 'origin-feat' },
  { id: 'scores', title: 'Your ability scores', rule: 'ability-scores' },
  { id: 'plus', title: 'Background increases', rule: 'background' },
  { id: 'options', title: 'Class choices', rule: 'skills' },
  { id: 'spells', title: 'Choose your spells', rule: 'spellcasting' },
  { id: 'review', title: 'Name your hero', rule: null },
];

const clone = (x) => JSON.parse(JSON.stringify(x));
const d6 = () => 1 + Math.floor(Math.random() * 6);

export function openBuilder({ spec = null, playerName = '', level = 1, mode = 'new', before = null, onDone, onCancel }) {
  level = Math.max(1, Math.min(3, level | 0 || 1));
  let d = spec ? clone(spec) : defaultSpec('fighter', { name: playerName });
  if (!d.name) d.name = playerName;
  // In 'levelup' and 'rest', what the hero has now: spells already in the
  // book stay there, and a new level swaps at most one cantrip.
  const stored = spec ? clone(spec) : {};
  let was = null;
  const touched = { background: !!spec, scores: !!spec, plus: !!spec };
  let step = 0, err = '', shown = [];
  norm();
  // before: what the hero had ahead of this level ({ cantrips, book }), from the room.
  if (mode !== 'new') was = before ? { ...clone(d), ...clone(before) } : clone(d);
  const locked = { book: mode === 'rest' ? [...(d.book || [])] : mode === 'levelup' ? (before?.book || stored.book || []).filter((s) => d.book.includes(s)) : [] };
  show('build');

  const C = () => CLASSES[d.cls];
  const counts = () => classSpellCounts(d.cls, level, d.order);
  const steps = () => (mode === 'new'
    ? ALL_STEPS.filter((s) => s.id !== 'spells' || C().spellcasting)
    : [{ id: 'spells', title: mode === 'rest' ? 'Change your prepared spells' : `Level ${level}: your spells`, rule: 'spellcasting' }]);

  // ------------------------------------------------------------ state ----
  function norm() {
    try {
      const name = d.name;
      d = { ...d, ...validateSpec(d, { level }) };
      d.name = name;
      err = '';
    } catch (e) { err = e.message; }
  }
  const get = (path) => path.split('.').reduce((o, k) => o?.[k], d);
  function put(path, v) {
    const ks = path.split('.');
    let o = d;
    for (const k of ks.slice(0, -1)) o = (o[k] && typeof o[k] === 'object') ? o[k] : (o[k] = {});
    o[ks[ks.length - 1]] = v;
  }
  // Lists the player picks a set number from.
  const LISTS = {
    skills: { cap: () => C().skillChoices.n, label: 'class skill' },
    expertise: { cap: () => 2, label: 'Expertise skill' },
    masteries: { cap: () => C().masteryCount, label: 'weapon for Weapon Mastery' },
    cantrips: { cap: () => counts().cantrips, label: 'cantrip' },
    book: { cap: () => counts().book, label: 'spellbook spell' },
    prepared: { cap: () => counts().prepared, label: 'prepared spell' },
    'bgFeat.cantrips': { cap: () => 2, label: 'Magic Initiate cantrip' },
    'versatile.cantrips': { cap: () => 2, label: 'Magic Initiate cantrip' },
    'versatile.skills': { cap: () => 3, label: 'Skilled skill' },
  };
  const SKILL_PATHS = ['skills', 'versatile.skills'];
  const CANTRIP_PATHS = ['cantrips', 'bgFeat.cantrips', 'versatile.cantrips'];

  // A skill or cantrip comes from one place. Taking it in one list frees it
  // from the others, which then pick something else.
  function freeSkill(s, except) {
    if (except !== 'skills' && d.skills?.includes(s)) d.skills = d.skills.filter((x) => x !== s);
    if (except !== 'speciesSkill' && d.speciesSkill === s) d.speciesSkill = null;
    if (except !== 'versatile.skills' && d.versatile?.skills?.includes(s)) d.versatile.skills = d.versatile.skills.filter((x) => x !== s);
  }
  function freeCantrip(s, except) {
    for (const p of CANTRIP_PATHS) if (p !== except && get(p)?.includes(s)) put(p, get(p).filter((x) => x !== s));
  }
  const proficient = () => new Set([...BACKGROUNDS[d.background].skills, ...(d.skills || []), d.speciesSkill, ...(d.versatile?.skills || [])].filter(Boolean));

  function toggle(path, v) {
    let arr = [...(get(path) || [])];
    const cap = LISTS[path].cap();
    const fixed = (x) => path === 'book' && locked.book.includes(x);
    if (arr.includes(v)) {
      if (fixed(v)) return;
      arr = arr.filter((x) => x !== v);
      if (SKILL_PATHS.includes(path)) d.expertise = (d.expertise || []).filter((x) => x !== v);
    } else {
      if (path === 'book') {
        const lv = SPELLS[v].level;
        const same = arr.filter((x) => SPELLS[x].level === lv);
        if (same.length >= bookLimit(lv, level)) {
          const out = same.find((x) => !fixed(x));
          if (!out) { err = `Your book has no more room for level ${lv} spells yet.`; return; }
          arr = arr.filter((x) => x !== out);
        }
      }
      // A new level swaps one cantrip at most: a second new pick replaces the first.
      const swap = path === 'cantrips' && mode === 'levelup' && was;
      const fresh = swap ? arr.filter((x) => !was.cantrips.includes(x)) : [];
      if (swap && fresh.length && !was.cantrips.includes(v)) arr = arr.filter((x) => x !== fresh[0]);
      if (arr.length >= cap) {
        const out = (swap && arr.find((x) => !was.cantrips.includes(x))) || arr.find((x) => !fixed(x));
        if (!out) return;
        arr = arr.filter((x) => x !== out);
      }
      arr.push(v);
      if (SKILL_PATHS.includes(path)) freeSkill(v, path);
      if (CANTRIP_PATHS.includes(path)) freeCantrip(v, path);
    }
    put(path, arr);
    if (path === 'book') d.prepared = (d.prepared || []).filter((x) => arr.includes(x));
    err = '';
  }

  function setOne(path, v) {
    if (path === 'cls') return setClass(v);
    if (path === 'background') return setBackground(v);
    if (path === 'species') { d.species = v; delete d.lineage; }
    else if (path === 'versatile.feat') d.versatile = { feat: v };
    else if (path === 'versatile.list') d.versatile = { feat: 'magic-initiate', list: v };
    else {
      if (path === 'speciesSkill') freeSkill(v, 'speciesSkill');
      put(path, v);
    }
    norm();
  }
  function setClass(cls) {
    d.cls = cls;
    for (const k of ['skills', 'expertise', 'masteries', 'kit', 'style', 'order', 'cantrips', 'book', 'prepared', 'scholar']) delete d[k];
    if (!touched.background) { d.background = DEFAULT_BACKGROUND[cls]; delete d.bgFeat; }
    if (!touched.scores) { d.method = 'array'; d.scores = { ...CLASSES[cls].suggested }; }
    if (!touched.plus) d.plus = suggestPlus(cls, d.background, d.scores);
    norm();
  }
  function setBackground(bg) {
    d.background = bg;
    delete d.bgFeat;
    touched.background = true;
    d.plus = suggestPlus(d.cls, bg, d.scores);
    touched.plus = false;
    norm();
  }
  // Scores in the class's order of importance (its suggested array).
  const priority = () => [...ABILITIES].sort((a, b) => C().suggested[b] - C().suggested[a]);
  function setMethod(m) {
    d.method = m;
    if (m === 'array') d.scores = { ...C().suggested };
    if (m === 'pointbuy' && (ABILITIES.some((a) => !(d.scores[a] >= 8 && d.scores[a] <= 15)) || pointCost(d.scores) > POINT_BUDGET)) d.scores = { ...C().suggested };
    if (m === 'roll' && !(d.rolls?.length === 6)) rollScores();
    if (m === 'roll') assignRolls();
    touched.scores = true;
    if (!touched.plus) d.plus = suggestPlus(d.cls, d.background, d.scores);
    norm();
  }
  function rollScores() { d.rolls = Array.from({ length: 6 }, () => Array.from({ length: 4 }, d6)); }
  function assignRolls() {
    const totals = d.rolls.map(rollTotal).sort((x, y) => y - x);
    priority().forEach((a, i) => { d.scores[a] = totals[i]; });
  }
  function setScore(a, v) {
    // Picking a value another ability has swaps the two, so the set stays the same.
    const other = ABILITIES.find((x) => x !== a && d.scores[x] === v);
    if (other) d.scores[other] = d.scores[a];
    d.scores[a] = v;
    touched.scores = true;
    if (!touched.plus) d.plus = suggestPlus(d.cls, d.background, d.scores);
    norm();
  }

  // ---------------------------------------------------------- widgets ----
  function card({ on, emoji = '', title, sub = '', body = '', attr, off = false }) {
    return `<button class="pick ${on ? 'on' : ''} ${off ? 'off' : ''}" ${off ? 'disabled' : attr}>${emoji ? `<span class="em">${emoji}</span>` : ''}
      <span class="pt"><b>${esc(title)}</b>${sub ? `<span class="sub">${sub}</span>` : ''}${body}</span></button>`;
  }
  // A small toggle chip in a list the player picks n from.
  function chip(path, v, label, { note = '', off = false, lock = false } = {}) {
    const on = (get(path) || []).includes(v) || lock;
    return `<button class="tog ${on ? 'on' : ''} ${off ? 'off' : ''}" ${off || lock ? 'disabled' : `data-tog="${path}:${v}"`}>${esc(label)}${note ? `<span class="dim"> ${esc(note)}</span>` : ''}</button>`;
  }
  function pickList(path, items, head) {
    shown.push(path);
    const n = (get(path) || []).length, cap = LISTS[path].cap();
    return `<div class="picklist"><div class="ph"><b>${head}</b><span class="count ${n === cap ? 'good' : ''}">${n} of ${cap}</span></div><div class="togs">${items.join('')}</div></div>`;
  }
  function spellRow(sid, { path = null, on = false, note = '', off = false, set = null } = {}) {
    const s = SPELLS[sid];
    const tags = [s.level ? `Level ${s.level}` : 'Cantrip', TIME[s.time], s.conc && 'Concentration', s.ritual && 'Ritual', s.kind === 'utility' && 'Outside of fights'].filter(Boolean);
    const isOn = on || (path && (get(path) || []).includes(sid)) || (set && get(set) === sid);
    const attr = off ? 'disabled' : path ? `data-tog="${path}:${sid}"` : set ? `data-set="${set}=${sid}"` : 'disabled';
    return `<button class="pick spell ${isOn ? 'on' : ''} ${off ? 'off' : ''}" ${attr}><span class="pt"><b>${esc(s.name)}${note ? ` <span class="tag">${esc(note)}</span>` : ''}</b>
      <span class="sub">${tags.join(' · ')}</span><span class="dim">${esc(s.text)}</span></span></button>`;
  }
  function spellList(path, sids, head, noteOf = () => ({})) {
    shown.push(path);
    const n = (get(path) || []).length, cap = LISTS[path].cap();
    let lv = -1, rows = '';
    for (const sid of sids) {
      if (SPELLS[sid].level !== lv) { lv = SPELLS[sid].level; rows += `<div class="lvh">${lv ? `Level ${lv}` : 'Cantrips'}</div>`; }
      rows += spellRow(sid, { path, ...noteOf(sid) });
    }
    return `<div class="picklist"><div class="ph"><b>${head}</b><span class="count ${n === cap ? 'good' : ''}">${n} of ${cap}</span></div>${rows}</div>`;
  }
  const seg = (path, opts, cur) => `<div class="seg wide">${opts.map(([v, label]) => `<button data-set="${path}=${v}" class="${cur === v ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;

  // Magic Initiate's picks: two cantrips, a level 1 spell, an ability.
  function miBlock(path, list) {
    const mine = get(path) || {};
    const known = new Set([...speciesCantrips(d.species, d.lineage)]);
    const other = path === 'bgFeat' ? 'versatile' : 'bgFeat';
    const ownCls = new Set(d.cantrips || []);
    return `<p class="note">${LIST_NAME[list]} list. You always have the level 1 spell prepared, and you can cast it once per Long Rest without a spell slot (or with a slot, if you have them).</p>
      ${pickList(`${path}.cantrips`, miCantrips(list).map((sid) => chip(`${path}.cantrips`, sid, SPELLS[sid].name, {
        off: known.has(sid) || (get(`${other}.cantrips`) || []).includes(sid),
        note: known.has(sid) ? '(from your species)' : ownCls.has(sid) ? `(a ${C().name} cantrip now)` : SPELLS[sid].kind === 'utility' ? '(outside of fights)' : '',
      })), 'Two cantrips')}
      <div class="picklist"><div class="ph"><b>One level 1 spell</b></div>${miSpells(list).map((sid) => spellRow(sid, { set: `${path}.spell` })).join('')}</div>
      <div class="ph"><b>Spellcasting ability for these spells</b></div>${seg(`${path}.ability`, CAST.map((a) => [a, `${ABILITY_NAMES[a]}`]), mine.ability)}`;
  }

  // ------------------------------------------------------------ views ----
  const views = {
    class: () => `<p class="lead">Your class is what you do in a fight. You can change anything later.</p>
      ${Object.entries(CLASSES).map(([id, c]) => card({
        on: d.cls === id, emoji: c.emoji, title: `${c.name} · ${c.role}`,
        sub: `d${c.hitDie} Hit Die · main ability ${ABILITY_NAMES[c.primary]}${c.spellcasting ? ' · casts spells' : ''}`,
        body: `<span>${esc(c.blurb)}</span><span class="dim">${esc(c.plays)}</span>`, attr: `data-set="cls=${id}"`,
      })).join('')}`,

    background: () => `<p class="lead">What did your hero do before adventuring? In the 2024 rules your background gives your ability increases, an ${R('origin-feat', 'Origin feat')} and two skills.</p>
      ${Object.entries(BACKGROUNDS).map(([id, b]) => {
        const f = FEATS[b.feat];
        return card({
          on: d.background === id, title: b.name, sub: esc(b.blurb),
          body: `<span>Raises: ${b.abilities.map((a) => ABILITY_NAMES[a]).join(', ')}${b.abilities.includes(C().primary) ? ` <b class="good">(includes your ${ABILITY_NAMES[C().primary]})</b>` : ''}</span>
            <span>Feat: <b>${esc(f.name)}${b.featList ? ` (${LIST_NAME[b.featList]})` : ''}</b>. ${esc(f.text)}</span>
            <span class="dim">Skills: ${b.skills.map((s) => SKILL_NAMES[s]).join(', ')}</span>`,
          attr: `data-set="background=${id}"`,
        });
      }).join('')}`,

    species: () => {
      const SP = SPECIES[d.species];
      const bgSkills = BACKGROUNDS[d.background].skills;
      let extra = '';
      if (SP.lineages) {
        extra += `<div class="ph"><b>${SP.name} lineage</b> ${R('species-lineage', 'what is this?')}</div>${Object.entries(SP.lineages).map(([k, l]) => card({
          on: d.lineage === k, title: l.name, body: `<span>${esc(l.text)}</span>`, attr: `data-set="lineage=${k}"`,
        })).join('')}`;
      }
      if (SP.castAbility) extra += `<div class="ph"><b>Spellcasting ability for your ${SP.name} spells</b></div>${seg('speciesAbility', CAST.map((a) => [a, ABILITY_NAMES[a]]), d.speciesAbility)}`;
      if (d.species === 'dragonborn') {
        extra += `<label class="fld">Dragon ancestry (your breath's damage type)
          <select data-sel="ancestry">${Object.entries(DRAGON_ANCESTRY).map(([k, a]) => `<option value="${k}" ${d.ancestry === k ? 'selected' : ''}>${a.name} (${a.type})</option>`).join('')}</select></label>`;
      }
      if (d.species === 'human' || d.species === 'elf') {
        const from = SP.skillFrom || Object.keys(SKILLS);
        extra += `<label class="fld">${d.species === 'human' ? 'Skillful: one skill of your choice' : 'Keen Senses: one of these skills'}
          <select data-sel="speciesSkill">${from.map((s) => `<option value="${s}" ${d.speciesSkill === s ? 'selected' : ''} ${bgSkills.includes(s) ? 'disabled' : ''}>${SKILL_NAMES[s]}${bgSkills.includes(s) ? ' (from your background)' : ''}</option>`).join('')}</select></label>`;
      }
      return `<p class="lead">Your species gives you traits. In the 2024 rules it doesn't change your ability scores, so pick whatever you like the sound of.</p>
        ${Object.entries(SPECIES).map(([id, s]) => card({
          on: d.species === id, emoji: s.emoji, title: s.name, sub: `Speed ${s.speed} ft`,
          body: `<span>${s.traits.slice(0, 3).map((t) => `<b>${esc(t.name)}</b>: ${esc(t.text)}`).join('<br>')}</span>`,
          attr: `data-set="species=${id}"`,
        })).join('')}
        ${extra ? `<div class="subpick">${extra}</div>` : ''}`;
    },

    feats: () => {
      const B = BACKGROUNDS[d.background];
      const bf = FEATS[B.feat];
      let h = `<p class="lead">A feat is a special ability. Your background gives you one ${R('origin-feat', 'Origin feat')}${d.species === 'human' ? ', and a Human picks a second one (Versatile)' : ''}.</p>
        <div class="ph"><b>From your background (${esc(B.name)}): ${esc(bf.name)}</b> ${R(bf.rule, 'rule')}</div><p class="note">${esc(bf.text)}</p>`;
      if (B.feat === 'magic-initiate') h += miBlock('bgFeat', B.featList);
      if (d.species === 'human') {
        const v = d.versatile || {};
        h += `<div class="ph sep"><b>Versatile: a Human's Origin feat</b></div>
          ${ORIGIN_FEATS.map((id) => {
            const f = FEATS[id];
            const dup = id === B.feat && !f.repeatable;
            return card({ on: v.feat === id, title: f.name, body: `<span>${esc(f.text)}</span>${dup ? '<span class="dim">You already have it from your background.</span>' : ''}`, attr: `data-set="versatile.feat=${id}"`, off: dup });
          }).join('')}`;
        if (v.feat === 'magic-initiate') {
          if (B.feat === 'magic-initiate') h += `<p class="note">You can take Magic Initiate twice with a different list each time, so this one uses the ${LIST_NAME[v.list]} list.</p>`;
          else h += `<div class="ph"><b>Which spell list?</b></div>${seg('versatile.list', FEATS['magic-initiate'].lists.map((l) => [l, LIST_NAME[l]]), v.list)}`;
          h += miBlock('versatile', v.list);
        }
        if (v.feat === 'skilled') {
          const bg = B.skills;
          const from = { skills: 'class', speciesSkill: 'Skillful' };
          h += pickList('versatile.skills', Object.keys(SKILLS).map((s) => chip('versatile.skills', s, SKILL_NAMES[s], {
            off: bg.includes(s),
            note: bg.includes(s) ? '(background)' : d.skills?.includes(s) ? `(${from.skills})` : d.speciesSkill === s ? `(${from.speciesSkill})` : '',
          })), 'Skilled: any three skills');
          h += '<p class="note">Taking a skill you already have from your class or Skillful moves it here; that choice then picks another.</p>';
        }
      }
      return h;
    },

    scores: () => {
      const c = C();
      const m = d.method || 'array';
      let h = `<p class="lead">Your ${c.name}'s most important ability is <b>${ABILITY_NAMES[c.primary]}</b>, and Constitution keeps you alive. Pick how you get your six scores:</p>
        <div class="seg wide"><button data-method="array" class="${m === 'array' ? 'on' : ''}">Standard array</button><button data-method="pointbuy" class="${m === 'pointbuy' ? 'on' : ''}">Point buy</button><button data-method="roll" class="${m === 'roll' ? 'on' : ''}">Roll 4d6</button></div>`;
      const mod = (a) => `<b class="mod">${signed(abilityMod(d.scores[a]))}</b>`;
      const label = (a) => `<span><b>${ABILITY_NAMES[a]}</b><span class="dim">${ABILITY_USES[a]}</span></span>`;
      if (m === 'array') {
        h += `<p class="note">${R('standard-array', 'Standard array')}: ${STANDARD_ARRAY.join(', ')}. Put each number on one ability.</p>
          <button class="btn small" data-method="array">Use the suggested scores for a ${c.name}</button>
          <div class="scores">${ABILITIES.map((a) => `<div class="srow">${label(a)}
            <select data-ab="${a}">${STANDARD_ARRAY.map((v) => `<option ${d.scores[a] === v ? 'selected' : ''}>${v}</option>`).join('')}</select>${mod(a)}</div>`).join('')}</div>
          <p class="note">Picking a number another ability already has swaps the two.</p>`;
      } else if (m === 'pointbuy') {
        const left = POINT_BUDGET - pointCost(d.scores);
        h += `<p class="note">${R('point-buy', 'Point buy')}: every score starts at 8 and you have ${POINT_BUDGET} points. A 9 to 13 costs 1 point a step; 14 and 15 cost 2 each. 15 is the highest you can buy.</p>
          <p class="pbleft"><b class="${left ? '' : 'good'}">${left}</b> of ${POINT_BUDGET} points left</p>
          <div class="scores">${ABILITIES.map((a) => {
            const v = d.scores[a];
            const up = v < 15 && POINT_COST[v + 1] - POINT_COST[v] <= left;
            return `<div class="srow">${label(a)}<span class="pb"><button class="btn small" data-pb="${a}:-1" ${v > 8 ? '' : 'disabled'}>−</button><b>${v}</b><button class="btn small" data-pb="${a}:1" ${up ? '' : 'disabled'}>+</button></span>${mod(a)}</div>`;
          }).join('')}</div>`;
      } else {
        const pool = [...new Set(d.rolls.map(rollTotal))].sort((x, y) => y - x);
        h += `<p class="note">${R('ability-rolls', 'Rolling')}: roll four d6 six times and drop the lowest die each time. Then put each total on one ability. At a real table, ask the DM first: some groups keep the first roll.</p>
          <div class="rolls">${d.rolls.map((r) => {
            const low = r.indexOf(Math.min(...r));
            return `<span class="roll">${r.map((v, i) => `<i class="${i === low ? 'drop' : ''}">${v}</i>`).join('')}<b>= ${rollTotal(r)}</b></span>`;
          }).join('')}</div>
          <button class="btn small" id="b-reroll">🎲 Roll again</button>
          <div class="scores">${ABILITIES.map((a) => `<div class="srow">${label(a)}
            <select data-ab="${a}">${pool.map((v) => `<option ${d.scores[a] === v ? 'selected' : ''}>${v}</option>`).join('')}</select>${mod(a)}</div>`).join('')}</div>
          <p class="note">Picking a total another ability has swaps the two.</p>`;
      }
      return h + `<p class="note">The modifier on the right is what you add to rolls: ${R('ability-modifier', 'score − 10, halved, rounded down')}.</p>`;
    },

    plus: () => {
      const b = BACKGROUNDS[d.background];
      const three = Object.keys(d.plus).length === 3;
      return `<p class="lead">${esc(b.name)} raises ${b.abilities.map((a) => ABILITY_NAMES[a]).join(', ')}. Give one +2 and another +1, or +1 to all three. No score can go above 20.</p>
        <div class="seg wide"><button id="b-p21" class="${three ? '' : 'on'}">+2 and +1</button><button id="b-p111" class="${three ? 'on' : ''}">+1, +1, +1</button></div>
        <div class="scores">${b.abilities.map((a) => {
          const v = d.plus[a] || 0;
          return `<div class="srow"><span><b>${ABILITY_NAMES[a]}</b><span class="dim">${d.scores[a]} → ${d.scores[a] + v} (${signed(abilityMod(d.scores[a] + v))})</span></span>
            ${three ? '<b>+1</b>' : `<span class="seg">${[2, 1, 0].map((n) => `<button data-plus="${a}:${n}" class="${v === n ? 'on' : ''}">+${n}</button>`).join('')}</span>`}</div>`;
        }).join('')}</div>
        <p class="note">Tip: raising an odd score to an even one bumps its modifier. 15 → 17 gives +3.</p>`;
    },

    options: () => {
      const c = C();
      const bg = BACKGROUNDS[d.background].skills;
      const fromName = d.species === 'human' ? 'Human' : 'Elf';
      let h = `<p class="lead">A ${c.name} picks ${c.skillChoices.n} skills from the class list${d.cls === 'fighter' ? ', a Fighting Style and starting gear' : d.cls === 'rogue' ? ', two Expertise skills and two weapons to master' : d.cls === 'cleric' ? ', a Divine Order and starting gear' : ''}.</p>`;
      h += pickList('skills', c.skillChoices.from.map((s) => chip('skills', s, SKILL_NAMES[s], {
        off: bg.includes(s),
        note: bg.includes(s) ? '(background)' : d.speciesSkill === s ? `(${fromName})` : d.versatile?.skills?.includes(s) ? '(Skilled)' : '',
      })), `${R('skills', 'Skills')}: pick ${c.skillChoices.n}`);
      if (d.cls === 'rogue') {
        const prof = [...proficient()];
        h += pickList('expertise', prof.map((s) => chip('expertise', s, SKILL_NAMES[s])), `${R('expertise', 'Expertise')}: double your Proficiency Bonus for two skills`);
      }
      if (d.cls === 'cleric') {
        h += `<div class="ph sep"><b>${R('divine-order', 'Divine Order')}</b></div>${Object.entries(ORDERS).map(([k, o]) => card({ on: d.order === k, title: o.name, body: `<span>${esc(o.text)}</span>`, attr: `data-set="order=${k}"` })).join('')}`;
      }
      if (d.cls === 'fighter') {
        h += `<div class="ph sep"><b>${R('fighting-style', 'Fighting Style')}</b></div>${Object.entries(FIGHTING_STYLES).map(([k, f]) => card({ on: d.style === k, title: f.name, body: `<span>${esc(f.text)}</span>`, attr: `data-set="style=${k}"` })).join('')}`;
      }
      if (c.kits.length > 1 || d.cls === 'wizard' || d.cls === 'rogue') {
        h += `<div class="ph sep"><b>Starting equipment</b></div>${c.kits.map((k) => {
          const K = KITS[d.cls][k];
          const off = K.needs && K.needs !== d.order;
          return card({ on: d.kit === k, title: K.name, body: `<span>${esc(K.text)}</span>`, attr: `data-set="kit=${k}"`, off });
        }).join('')}`;
      }
      if (c.masteryCount) {
        const carried = [...new Set(KITS[d.cls][d.kit].weapons)];
        if (carried.length > c.masteryCount) {
          h += pickList('masteries', carried.map((w) => chip('masteries', w, WEAPONS[w].name, { note: `(${MASTERIES[WEAPONS[w].mastery].name})` })), `${R('weapon-mastery', 'Weapon Mastery')}: pick ${c.masteryCount}`);
        } else {
          h += `<p class="note">${R('weapon-mastery', 'Weapon Mastery')}: you can use the mastery of all ${carried.length} of your weapons (${carried.map((w) => `${WEAPONS[w].name}: ${MASTERIES[WEAPONS[w].mastery].name}`).join(', ')}).</p>`;
        }
      }
      if (d.cls === 'wizard' && level >= 2) h += scholarPick();
      return h;
    },

    spells: () => {
      const c = C();
      const n = counts();
      const list = SPELL_LISTS[d.cls];
      const top = maxSpellLevel(level);
      const leveled = Object.entries(list).filter(([lv]) => +lv >= 1 && +lv <= top).flatMap(([, xs]) => xs);
      const fromSpecies = speciesCantrips(d.species, d.lineage);
      const miC = [...(d.bgFeat?.cantrips || []), ...(d.versatile?.cantrips || [])];
      let h = d.cls === 'wizard'
        ? `<p class="lead">At level ${level} a Wizard knows ${n.cantrips} ${R('cantrips', 'cantrips')}, has ${n.book} spells in a spellbook, and prepares ${n.prepared} of them. Prepared spells are the ones you can cast with your ${R('spell-slots', 'spell slots')}.</p>`
        : `<p class="lead">At level ${level} a Cleric knows ${n.cantrips} ${R('cantrips', 'cantrips')} and prepares ${n.prepared} spells from the whole Cleric list. Prepared spells are the ones you can cast with your ${R('spell-slots', 'spell slots')}.</p>`;
      if (mode === 'levelup' && d.cls === 'wizard' && level >= 2) h += scholarPick();
      // Spells from the species and feats, for reference.
      let hero = null;
      try { hero = buildHero(d, { level }); } catch { /* shown on Next */ }
      const extra = hero ? Object.entries(hero.casting?.known || {}).filter(([, k]) => k.source !== c.name && k.source !== 'Life Domain') : [];
      if (extra.length) h += `<p class="note">You also know ${extra.map(([sid, k]) => `${esc(SPELLS[sid].name)} (${esc(k.source)})`).join(', ')}. Those don't count toward the numbers here.</p>`;

      if (mode !== 'rest') {
        h += spellList('cantrips', list[0], `Cantrips: pick ${n.cantrips}`, (sid) => (fromSpecies.includes(sid)
          ? { off: true, note: 'from your species' } : miC.includes(sid) ? { note: 'Magic Initiate now' } : {}));
        if (mode === 'levelup') h += '<p class="note">When you gain a level, you can swap one cantrip for another.</p>';
      }
      if (d.cls === 'wizard') {
        if (mode !== 'rest') {
          const room = top >= 2 ? ` Up to ${bookLimit(2, level)} can be level 2.` : '';
          h += spellList('book', leveled, `Spellbook: ${n.book} spells.${room}`, (sid) => (locked.book.includes(sid) ? { on: true, off: true, note: 'in your book' } : {}));
          if (mode === 'levelup') h += '<p class="note">Each level, a Wizard writes two new spells into the book. Spells already in it stay.</p>';
        }
        h += spellList('prepared', leveled.filter((s) => (d.book || []).includes(s)), `Prepared: pick ${n.prepared} from your book`);
      } else {
        const dom = domainSpells(d.cls, level);
        h += spellList('prepared', leveled.filter((s) => !dom.includes(s)), `Prepared: pick ${n.prepared}`);
        if (dom.length) h += `<p class="note">Life Domain: ${dom.map((s) => esc(SPELLS[s].name)).join(', ')} are always prepared and don't count.</p>`;
      }
      if (mode === 'new') h += '<p class="note">After every Long Rest you can change which spells are prepared.</p>';
      return h;
    },

    review: () => {
      let h;
      try { h = buildHero(d, { id: 'preview', name: d.name, level }); } catch (e) { return `<p class="bad">${esc(e.message)}</p>`; }
      return `<label class="fld">Hero name<input id="b-name" maxlength="20" value="${esc(d.name)}" placeholder="${esc(playerName || 'Name')}"></label>
        <div class="sheet-inline">${sheetHtml(h)}</div>`;
    },
  };

  function scholarPick() {
    const prof = proficient();
    const opts = SCHOLAR_SKILLS.filter((s) => prof.has(s) && !(d.expertise || []).includes(s));
    if (!opts.length) return '';
    return `<label class="fld">Scholar (level 2): ${R('expertise', 'Expertise')} in one of these skills you know
      <select data-sel="scholar">${opts.map((s) => `<option value="${s}" ${d.scholar === s ? 'selected' : ''}>${SKILL_NAMES[s]}</option>`).join('')}</select></label>`;
  }

  // ---------------------------------------------------------- drawing ----
  function render() {
    const all = steps();
    if (step >= all.length) step = all.length - 1;
    const st = all[step];
    const g = st.rule && GLOSSARY[st.rule];
    shown = [];
    const body = views[st.id]();
    const kicker = mode === 'levelup' ? `Level ${level}` : mode === 'rest' ? 'After a Long Rest'
      : `${level > 1 ? `Making a level ${level} hero` : 'Chapter 1 · Making your hero'} · step ${step + 1} of ${all.length}`;
    $('build-body').innerHTML = `
      <div class="build-head"><span class="kicker">${kicker}</span>
        <h2 class="bt">${st.title}</h2>
        ${all.length > 1 ? `<div class="dots">${all.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>` : ''}</div>
      ${err ? `<p class="bad">${esc(err)}</p>` : ''}
      ${body}
      ${g ? `<p class="rulebox"><b>${esc(g.title)}.</b> ${esc(g.text)}</p>` : ''}`;
    $('build-back').textContent = step ? 'Back' : 'Cancel';
    $('build-next').textContent = step < all.length - 1 ? 'Next' : mode === 'new' ? 'Done: this is my hero' : 'Save my spells';
    bind();
  }

  function bind() {
    const B = $('build-body');
    const redraw = () => render();
    for (const el of B.querySelectorAll('[data-set]')) {
      el.onclick = () => { const [p, v] = el.dataset.set.split('='); setOne(p, v); redraw(); };
    }
    for (const el of B.querySelectorAll('[data-tog]')) {
      el.onclick = () => { const i = el.dataset.tog.indexOf(':'); toggle(el.dataset.tog.slice(0, i), el.dataset.tog.slice(i + 1)); redraw(); };
    }
    for (const el of B.querySelectorAll('select[data-sel]')) el.onchange = () => { setOne(el.dataset.sel, el.value); redraw(); };
    for (const el of B.querySelectorAll('[data-method]')) el.onclick = () => { setMethod(el.dataset.method); redraw(); };
    for (const el of B.querySelectorAll('select[data-ab]')) el.onchange = () => { setScore(el.dataset.ab, +el.value); redraw(); };
    for (const el of B.querySelectorAll('[data-pb]')) {
      el.onclick = () => {
        const [a, n] = el.dataset.pb.split(':');
        const v = d.scores[a] + +n;
        if (v < 8 || v > 15) return;
        const next = { ...d.scores, [a]: v };
        if (pointCost(next) > POINT_BUDGET) return;
        d.scores = next;
        touched.scores = true;
        if (!touched.plus) d.plus = suggestPlus(d.cls, d.background, d.scores);
        norm(); redraw();
      };
    }
    if ($('b-reroll')) $('b-reroll').onclick = () => { rollScores(); assignRolls(); touched.scores = true; if (!touched.plus) d.plus = suggestPlus(d.cls, d.background, d.scores); norm(); redraw(); };
    if ($('b-p21')) $('b-p21').onclick = () => { d.plus = suggestPlus(d.cls, d.background, d.scores); touched.plus = true; norm(); redraw(); };
    if ($('b-p111')) $('b-p111').onclick = () => { d.plus = Object.fromEntries(BACKGROUNDS[d.background].abilities.map((a) => [a, 1])); touched.plus = true; norm(); redraw(); };
    for (const el of B.querySelectorAll('[data-plus]')) {
      el.onclick = () => {
        const [a, n] = el.dataset.plus.split(':');
        const v = +n;
        const abs = BACKGROUNDS[d.background].abilities;
        if (v === 0) {
          // The +2 or +1 this ability gives up goes to the one that had nothing.
          const had = d.plus[a];
          delete d.plus[a];
          const spare = abs.find((x) => x !== a && !d.plus[x]);
          if (had && spare && Object.keys(d.plus).length < 3) d.plus[spare] = had;
        } else {
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
        norm(); redraw();
      };
    }
    if ($('b-name')) $('b-name').oninput = (e) => { d.name = e.target.value.slice(0, 20); };
  }

  // Lists on this screen must be full before moving on.
  function stepError() {
    for (const p of shown) {
      const n = (get(p) || []).length, cap = LISTS[p].cap();
      if (n < cap) return `Pick ${cap - n} more ${LISTS[p].label}${cap - n === 1 ? '' : 's'}.`;
    }
    if (mode === 'levelup' && was && (d.cantrips || []).filter((s) => !was.cantrips.includes(s)).length > 1) return 'When you gain a level you can swap one cantrip, not more.';
    return '';
  }

  $('build-back').onclick = () => { err = ''; if (step) { step--; render(); } else onCancel?.(); };
  $('build-next').onclick = () => {
    err = stepError();
    if (!err) norm();
    if (err) { render(); return; }
    if (step < steps().length - 1) { step++; render(); globalThis.scrollTo?.(0, 0); return; }
    try {
      const clean = validateSpec({ ...d, name: d.name || playerName }, { level });
      onDone(clean);
    } catch (e) { err = e.message; render(); }
  };
  render();
}
