// Chapter 0: Rolling the d20. A short hands-on lesson each phone runs on its
// own while the party gathers. Nothing here touches the room.

import { $, show, ls } from './dom.js';
import { GLOSSARY } from '../rules/glossary.js';
import { esc } from './explain.js';

const d20 = () => 1 + Math.floor(Math.random() * 20);
export const LESSON_DONE = 'fr.lesson0';

const STEPS = [
  {
    title: 'The d20',
    text: 'Most things that can go wrong in this game come down to one roll of a twenty-sided die: the d20. High is good. Give it a go.',
    rule: 'd20-test',
    play: (st) => ({
      button: 'Roll the d20',
      roll() { st.r = d20(); },
      show: () => st.r ? `<div class="bigroll">🎲 <b>${st.r}</b></div><p>${st.r === 20 ? 'A natural 20, the best roll there is!' : st.r === 1 ? 'A natural 1. Ouch.' : st.r >= 11 ? 'That would beat most simple tasks.' : 'Low, but modifiers can help.'}</p>` : '',
    }),
  },
  {
    title: 'Add your modifier, beat the DC',
    text: "You're climbing a slippery wall. That's a Strength (Athletics) check against a Difficulty Class (DC) of 12. Your hero is strong and trained, so you add +5. Meet or beat 12 and you're up.",
    rule: 'ability-checks',
    play: (st) => ({
      button: 'Roll Athletics',
      roll() { st.r = d20(); },
      show: () => st.r ? `<div class="bigroll">🎲 ${st.r} + 5 = <b>${st.r + 5}</b> vs DC 12</div><p class="${st.r + 5 >= 12 ? 'good' : 'bad'}"><b>${st.r + 5 >= 12 ? 'Success: you haul yourself over the top.' : 'Failure: you slide back down. Maybe a friend can Help.'}</b></p>` : '',
    }),
  },
  {
    title: 'Advantage and Disadvantage',
    text: 'When things are on your side you have Advantage: roll two d20s and keep the higher. When they are against you, Disadvantage: keep the lower. Try both.',
    rule: 'advantage',
    play: (st) => ({
      button: 'Roll with Advantage',
      button2: 'Roll with Disadvantage',
      roll(which) { st.a = d20(); st.b = d20(); st.mode = which; },
      show: () => st.a ? `<div class="bigroll">🎲 ${st.a} and ${st.b} → <b>${st.mode === 2 ? Math.min(st.a, st.b) : Math.max(st.a, st.b)}</b></div><p>${st.mode === 2 ? 'Disadvantage keeps the lower die.' : 'Advantage keeps the higher die.'} If you have both at once, they cancel out and you roll just one.</p>` : '',
    }),
  },
  {
    title: 'Three kinds of d20 roll',
    text: "Every d20 roll is one of three things. An attack roll tries to beat a target's Armor Class (AC). An ability check tries to beat a DC, like the wall. A saving throw is your defense: you roll to shrug off a spell or a trap. Attack a goblin (AC 15) with a +5 sword.",
    rule: 'attack-roll',
    play: (st) => ({
      button: 'Attack the goblin',
      roll() { st.r = d20(); },
      show: () => {
        if (!st.r) return '';
        const t = st.r + 5;
        const res = st.r === 20 ? 'A natural 20 always hits, and it is a Critical Hit: double damage dice!' : st.r === 1 ? 'A natural 1 always misses.' : t >= 15 ? 'Hit! Now you would roll damage.' : 'Miss. The goblin dodges.';
        return `<div class="bigroll">🎲 ${st.r} + 5 = <b>${t}</b> vs AC 15</div><p>${res}</p>`;
      },
    }),
  },
  {
    title: 'Heroic Inspiration',
    text: "Sometimes you'll have Heroic Inspiration: spend it to reroll any die you just rolled and use the new result. Humans start each day with it. Roll, and if you don't like it, reroll.",
    rule: 'heroic-inspiration',
    play: (st) => ({
      button: st.r && !st.used ? 'Spend Inspiration: reroll' : 'Roll the d20',
      roll() { if (st.r && !st.used) { st.old = st.r; st.r = d20(); st.used = true; } else { st.r = d20(); st.used = false; st.old = null; } },
      show: () => st.r ? `<div class="bigroll">🎲 <b>${st.r}</b>${st.old ? ` <span class="dim">(was ${st.old})</span>` : ''}</div><p>${st.used ? 'Inspiration spent. You must use the new roll, even if it is worse.' : 'Happy with it? If not, spend your Heroic Inspiration.'}</p>` : '',
    }),
  },
];

export function openLesson(onDone) {
  let step = 0;
  const states = STEPS.map(() => ({}));
  show('lesson');

  function render() {
    const S = STEPS[step];
    const st = states[step];
    const p = S.play(st);
    const g = GLOSSARY[S.rule];
    $('lesson-body').innerHTML = `
      <div class="build-head"><span class="kicker">Chapter 0 · Rolling the d20 · ${step + 1} of ${STEPS.length}</span>
        <h2 class="bt">${esc(S.title)}</h2>
        <div class="dots">${STEPS.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div></div>
      <p class="lead">${esc(S.text)}</p>
      <div class="row lesson-btns"><button class="btn primary" id="l-roll">${esc(p.button)}</button>${p.button2 ? `<button class="btn" id="l-roll2">${esc(p.button2)}</button>` : ''}</div>
      <div class="lesson-out">${p.show()}</div>
      ${g ? `<p class="rulebox"><b>${esc(g.title)}.</b> ${esc(g.text)}</p>` : ''}`;
    $('l-roll').onclick = () => { p.roll(1); render(); };
    if ($('l-roll2')) $('l-roll2').onclick = () => { p.roll(2); render(); };
    $('lesson-back').textContent = step ? 'Back' : 'Close';
    $('lesson-next').textContent = step === STEPS.length - 1 ? 'Done' : 'Next';
  }
  $('lesson-back').onclick = () => { if (step) { step--; render(); } else onDone(); };
  $('lesson-next').onclick = () => {
    if (step < STEPS.length - 1) { step++; render(); return; }
    ls.set(LESSON_DONE, '1');
    onDone();
  };
  render();
}
