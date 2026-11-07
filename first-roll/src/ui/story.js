// The story screen: scene text, party votes, skill checks (one hero with
// helpers, or the whole group), and the result that moves the story on.

import { SCENES, CHAPTERS } from '../game/campaign.js';
import { skillParts } from '../game/room.js';
import { buildHero, applyState } from '../rules/character.js';
import { SKILL_NAMES, SKILLS, ABILITY_NAMES, signed } from '../rules/data.js';
import { $ } from './dom.js';
import { esc, short, detail } from './explain.js';
import { sheetHtml, ruleLink as R } from './sheet.js';

// ctx: { S, me, isHost, send, openSheet, colors }
export function renderStory(ctx) {
  const { S, me, isHost, send } = ctx;
  const st = S.story;
  const sc = SCENES[st.scene];
  const ch = CHAPTERS[sc.chapter];
  const heroes = S.party.map((p) => ({ ...p, h: applyState(buildHero(p.spec, { id: p.id, name: p.name, level: S.level || 1 }), S.heroes?.[p.id]) }));
  const mine = heroes.find((p) => p.id === me);
  const canControl = (id) => id === me || (isHost && !heroes.find((p) => p.id === id)?.controller);
  const nameOf = (pid) => S.seats.find((s) => s.pid === pid)?.name || pid;
  const colorOf = (pid) => S.seats.find((s) => s.pid === pid)?.color || '#999';

  let html = `<div class="kicker">Chapter ${sc.chapter} · ${esc(ch.title)}</div>
    <h2 class="scene-title">${esc(sc.title)}</h2>
    ${(sc.text || []).map((p) => `<p class="story">${esc(p)}</p>`).join('')}`;

  if (sc.kind === 'story') {
    const votes = st.votes || {};
    const choices = sc.choices.filter((c) => !c.requires || S.flags?.[c.requires]);
    html += `<div class="choices">${choices.map((c) => {
      const who = Object.entries(votes).filter(([, v]) => v === c.id).map(([pid]) => `<span class="vote" style="background:${colorOf(pid)}">${esc(nameOf(pid))}</span>`).join('');
      return `<button class="choice ${votes[me] === c.id ? 'on' : ''}" data-vote="${c.id}"><span>${esc(c.label)}</span><span class="votes">${who}</span></button>`;
    }).join('')}</div>`;
    const voters = S.seats.filter((s) => s.spec && (s.online || s.host)).length || 1;
    const cast = Object.keys(votes).length;
    html += `<p class="note">${choices.length > 1 ? `${cast} of ${voters} vote${voters === 1 ? '' : 's'} in. Ties go to the host.` : 'Tap to go on.'}${!mine && !isHost ? ' You are watching: build a hero in the lobby to vote.' : ''}</p>`;
    if (isHost && cast && cast < voters) html += '<button class="btn small" id="s-decide">Decide now</button>';
  } else if (sc.kind === 'check') {
    const ck = st.check;
    const sk = sc.check.skill;
    const label = `${SKILL_NAMES[sk]} (${ABILITY_NAMES[SKILLS[sk]]})`;
    html += `<div class="checkbox"><div class="ck-head">${R(sc.check.mode === 'group' ? 'group-check' : 'ability-checks', sc.check.mode === 'group' ? 'Group check' : 'Ability check')}: <b>${label}</b>, DC ${sc.check.dc}</div>
      <p class="dim">${esc(sc.check.prompt)}</p>`;
    html += `<div class="ck-list">${heroes.map((p) => {
      const parts = skillParts(p.h, sk);
      const mod = parts.reduce((s, x) => s + x.value, 0);
      const prof = p.h.profSkills.includes(sk);
      const rolled = ck.rolls[p.id];
      const isRoller = ck.roller === p.id;
      const helping = ck.helpers.includes(p.id);
      let btns = '';
      if (!ck.done && canControl(p.id)) {
        if (sc.check.mode === 'single') {
          if (!isRoller) btns += `<button class="btn small primary" data-claim="${p.id}">${p.id === me ? "I'll do it" : 'Pick'}</button>`;
          if (!isRoller && prof && ck.roller) btns += `<button class="btn small ${helping ? 'on' : ''}" data-help="${p.id}">${helping ? 'Helping ✓' : 'Help'}</button>`;
        } else if (!rolled) btns += `<button class="btn small primary" data-roll="${p.id}">Roll</button>`;
      }
      const tag = isRoller ? '<span class="tag">making the check</span>' : helping ? '<span class="tag">helping</span>' : '';
      const out = rolled ? `<button class="mini-roll ${rolled.outcome}" data-why="${p.id}">🎲 ${rolled.total} ${rolled.outcome === 'success' ? '✓' : '✗'}</button>` : '';
      return `<div class="ck-row"><span class="ck-who">${p.h.emoji} <b>${esc(p.name)}</b> <span class="dim">${signed(mod)}${prof ? (p.h.expertise.includes(sk) ? ' ★★' : ' ★') : ''}</span> ${tag}</span><span class="ck-act">${out}${btns}</span></div>`;
    }).join('')}</div>`;
    if (!ck.done && sc.check.mode === 'single' && ck.roller) {
      const rollerCtl = canControl(ck.roller) || isHost;
      const helped = ck.helpers.length ? ' with Advantage (someone is Helping)' : '';
      html += rollerCtl ? `<button class="btn primary wide" id="s-roll">Roll ${esc(heroes.find((p) => p.id === ck.roller).name)}'s check${helped}</button>`
        : `<p class="note">Waiting for ${esc(heroes.find((p) => p.id === ck.roller).name)} to roll…</p>`;
    }
    if (!ck.done && sc.check.mode === 'group' && isHost && Object.keys(ck.rolls).length) {
      html += '<button class="btn small" id="s-rollrest">Roll for everyone who hasn\'t</button>';
    }
    html += '</div>';
    if (st.result) {
      html += `<div class="result ${st.result.success ? 'good' : 'bad'}"><b>${st.result.success ? 'Success!' : 'Failure.'}</b> ${esc(st.result.text)}</div>`;
      const fl = st.result.flags?.surprise;
      if (fl) html += `<p class="note">${fl === 'foes' ? 'Your foes will be surprised: they roll Initiative with Disadvantage.' : 'You are surprised: your party rolls Initiative with Disadvantage.'} ${R('surprise', 'Surprise')}</p>`;
      html += isHost ? '<button class="btn primary wide" id="s-continue">Continue</button>' : '<p class="note">Waiting for the host to continue…</p>';
    }
  } else if (sc.kind === 'save') {
    const ck = st.check;
    const ab = sc.save.ability;
    html += `<div class="checkbox"><div class="ck-head">${R('saving-throw', 'Saving throw')}: <b>${ABILITY_NAMES[ab]}</b>, DC ${sc.save.dc}</div>
      <p class="dim">${esc(sc.save.prompt)}</p><div class="ck-list">${heroes.map((p) => {
      const mod = p.h.saves?.[ab] ?? p.h.mods[ab];
      const rolled = ck.rolls[p.id];
      const btn = !ck.done && !rolled && canControl(p.id) ? `<button class="btn small primary" data-roll="${p.id}">Roll</button>` : '';
      const out = rolled ? `<button class="mini-roll ${rolled.outcome}" data-why="${p.id}">🎲 ${rolled.total} ${rolled.outcome === 'success' ? '✓' : '✗'}</button>` : '';
      return `<div class="ck-row"><span class="ck-who">${p.h.emoji} <b>${esc(p.name)}</b> <span class="dim">${signed(mod)}${p.h.saveProfs?.includes(ab) ? ' ★' : ''}</span></span><span class="ck-act">${out}${btn}</span></div>`;
    }).join('')}</div>`;
    if (!ck.done && isHost && Object.keys(ck.rolls).length) html += '<button class="btn small" id="s-rollrest">Roll for everyone who hasn\'t</button>';
    html += '</div>';
    if (st.result) {
      const names = st.result.failed.map((id) => heroes.find((p) => p.id === id)?.name).filter(Boolean);
      html += `<div class="result ${names.length ? 'bad' : 'good'}"><b>${names.length ? `${esc(names.join(', '))} failed.` : 'Everyone saved.'}</b> ${esc(st.result.text)}</div>`;
      html += isHost ? '<button class="btn primary wide" id="s-continue">Continue</button>' : '<p class="note">Waiting for the host to continue…</p>';
    }
  } else if (sc.kind === 'rest') {
    const r = st.rest || {};
    if (r.kind === 'long') {
      html += `<div class="checkbox"><div class="ck-head">${R('long-rest', 'Long Rest')}</div><ul class="restlog">${(r.results || []).map((x) =>
        `<li><b>${esc(x.name)}</b>: ${x.got.length ? esc(x.got.join(', ')) : 'nothing to get back'}.</li>`).join('')}</ul></div>`;
      html += isHost ? '<button class="btn primary wide" id="s-continue">Continue</button>' : '<p class="note">Waiting for the host to continue…</p>';
    } else {
      html += `<div class="checkbox"><div class="ck-head">${R('short-rest', 'Short Rest')}: spend ${R('hit-point-dice', 'Hit Point Dice')} to heal</div><div class="ck-list">${heroes.map((p) => {
        const h = p.h;
        const can = !r.results && canControl(p.id) && p.controller && h.hitDice.left > 0 && h.hp < h.hpMax;
        return `<div class="ck-row"><span class="ck-who">${h.emoji} <b>${esc(p.name)}</b> <span class="dim">${h.hp}/${h.hpMax} HP · ${h.hitDice.left}/${h.hitDice.max} d${h.hitDice.die}${p.controller ? '' : ' (AI)'}</span></span>
          <span class="ck-act">${can ? `<button class="btn small primary" data-hd="${p.id}">Roll a d${h.hitDice.die}</button>` : ''}</span></div>`;
      }).join('')}</div>`;
      if (r.log?.length) html += `<ul class="restlog">${r.log.slice(-8).map((x) => `<li>🎲 ${esc(x.text)}</li>`).join('')}</ul>`;
      if (r.results) html += `<ul class="restlog">${r.results.map((x) => `<li><b>${esc(x.name)}</b>: ${x.got.length ? `gets back ${esc(x.got.join(', '))}` : 'nothing else comes back'}.</li>`).join('')}</ul>`;
      html += '</div>';
      html += isHost ? `<button class="btn primary wide" id="s-continue">${r.results ? 'Continue' : 'Finish the rest'}</button>`
        : `<p class="note">${r.results ? 'Waiting for the host to continue…' : 'Spend dice if you want them. The host ends the rest. AI companions spend theirs then.'}</p>`;
    }
  } else if (sc.kind === 'level') {
    html += (st.levelUp || []).map((x) => `<div class="levelup"><b>${esc(x.name)}</b>: level ${x.to}${x.subclass ? `, ${esc(x.subclass)}` : ''}
      <div class="dim">${R('level-up', 'Hit Point maximum')} ${x.hpMaxBefore} → ${x.hpMax}${x.slots ? ` · ${R('spell-slots', 'spell slots')} ${Object.entries(x.slots).map(([lv, n]) => `${n} of level ${lv}`).join(', ')}` : ''}</div>
      ${x.features.map((f) => `<p class="feat">${R(f.rule, f.name)}: ${esc(f.text)}</p>`).join('')}</div>`).join('');
    html += isHost ? '<button class="btn primary wide" id="s-continue">Continue</button>' : '<p class="note">Waiting for the host to continue…</p>';
  } else if (sc.kind === 'end') {
    html += `<div class="result good"><b>The End.</b> You finished the campaign at level ${S.level || 1}.</div>`;
    html += isHost ? '<button class="btn primary wide" id="s-again">Back to the lobby</button>' : '';
  }
  if (sc.lesson) html += `<p class="rulebox"><b>Rules in this scene.</b> ${esc(sc.lesson)}</p>`;

  html += `<div class="row"><button class="btn small ghost" id="s-rules">📖 Rules book</button></div><h4 class="kicker">The party</h4><div class="party-strip">${heroes.map((p) =>
    `<button class="pchip" data-sheet="${p.id}" style="border-color:${p.controller ? colorOf(p.controller) : 'var(--line)'}">${p.h.emoji} ${esc(p.name)}<span class="dim">${p.controller ? '' : ' (AI)'}</span></button>`).join('')}</div>`;

  const B = $('story-body');
  B.innerHTML = html;
  for (const el of B.querySelectorAll('[data-vote]')) el.onclick = () => send({ t: 'vote', choice: el.dataset.vote });
  for (const el of B.querySelectorAll('[data-claim]')) el.onclick = () => send({ t: 'claim', hero: el.dataset.claim });
  for (const el of B.querySelectorAll('[data-help]')) el.onclick = () => send({ t: 'help', hero: el.dataset.help });
  for (const el of B.querySelectorAll('[data-roll]')) el.onclick = () => send({ t: 'roll', hero: el.dataset.roll });
  for (const el of B.querySelectorAll('[data-why]')) el.onclick = () => ctx.openSheet(detail(st.check.rolls[el.dataset.why], null));
  for (const el of B.querySelectorAll('[data-hd]')) el.onclick = () => send({ t: 'hitdie', hero: el.dataset.hd });
  if ($('s-rules')) $('s-rules').onclick = () => ctx.openRulesBook?.();
  for (const el of B.querySelectorAll('[data-sheet]')) el.onclick = () => ctx.openSheet(sheetHtml(heroes.find((p) => p.id === el.dataset.sheet).h));
  if ($('s-decide')) $('s-decide').onclick = () => send({ t: 'decide' });
  if ($('s-roll')) $('s-roll').onclick = () => send({ t: 'roll' });
  if ($('s-rollrest')) $('s-rollrest').onclick = () => send({ t: 'continue' });
  if ($('s-continue')) $('s-continue').onclick = () => send({ t: 'continue' });
  if ($('s-again')) $('s-again').onclick = () => send({ t: 'again' });
}

// The latest check roll, for a pop-up card.
export const checkShort = (r) => short(r, null);
