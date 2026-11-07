// The story screen: scene text, party votes, skill checks (one hero with
// helpers, or the whole group), and the result that moves the story on.

import { SCENES, CHAPTERS } from '../game/campaign.js';
import { skillParts } from '../game/room.js';
import { buildHero } from '../rules/character.js';
import { SKILL_NAMES, SKILLS, ABILITY_NAMES, signed } from '../rules/data.js';
import { $ } from './dom.js';
import { esc, short, detail } from './explain.js';
import { sheetHtml } from './sheet.js';

// ctx: { S, me, isHost, send, openSheet, colors }
export function renderStory(ctx) {
  const { S, me, isHost, send } = ctx;
  const st = S.story;
  const sc = SCENES[st.scene];
  const ch = CHAPTERS[sc.chapter];
  const heroes = S.party.map((p) => ({ ...p, h: buildHero(p.spec, { id: p.id, name: p.name }) }));
  const mine = heroes.find((p) => p.id === me);
  const canControl = (id) => id === me || (isHost && !heroes.find((p) => p.id === id)?.controller);
  const nameOf = (pid) => S.seats.find((s) => s.pid === pid)?.name || pid;
  const colorOf = (pid) => S.seats.find((s) => s.pid === pid)?.color || '#999';

  let html = `<div class="kicker">Chapter ${sc.chapter} · ${esc(ch.title)}</div>
    <h2 class="scene-title">${esc(sc.title)}</h2>
    ${(sc.text || []).map((p) => `<p class="story">${esc(p)}</p>`).join('')}`;

  if (sc.kind === 'story') {
    const votes = st.votes || {};
    html += `<div class="choices">${sc.choices.map((c) => {
      const who = Object.entries(votes).filter(([, v]) => v === c.id).map(([pid]) => `<span class="vote" style="background:${colorOf(pid)}">${esc(nameOf(pid))}</span>`).join('');
      return `<button class="choice ${votes[me] === c.id ? 'on' : ''}" data-vote="${c.id}"><span>${esc(c.label)}</span><span class="votes">${who}</span></button>`;
    }).join('')}</div>`;
    const voters = S.seats.filter((s) => s.spec && (s.online || s.host)).length || 1;
    const cast = Object.keys(votes).length;
    html += `<p class="note">${sc.choices.length > 1 ? `${cast} of ${voters} vote${voters === 1 ? '' : 's'} in. Ties go to the host.` : 'Tap to go on.'}${!mine && !isHost ? ' You are watching: build a hero in the lobby to vote.' : ''}</p>`;
    if (isHost && cast && cast < voters) html += '<button class="btn small" id="s-decide">Decide now</button>';
  } else if (sc.kind === 'check') {
    const ck = st.check;
    const sk = sc.check.skill;
    const label = `${SKILL_NAMES[sk]} (${ABILITY_NAMES[SKILLS[sk]]})`;
    html += `<div class="checkbox"><div class="ck-head">${sc.check.mode === 'group' ? 'Group check' : 'Check'}: <b>${label}</b>, DC ${sc.check.dc}</div>
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
      if (fl) html += `<p class="note">${fl === 'foes' ? 'Your foes will be surprised: they roll Initiative with Disadvantage.' : 'You are surprised: your party rolls Initiative with Disadvantage.'}</p>`;
      html += isHost ? '<button class="btn primary wide" id="s-continue">Continue</button>' : '<p class="note">Waiting for the host to continue…</p>';
    }
  } else if (sc.kind === 'end') {
    html += '<div class="result good"><b>To be continued.</b> More adventures are on the way.</div>';
    html += isHost ? '<button class="btn primary wide" id="s-again">Back to the lobby</button>' : '';
  }

  html += `<h4 class="kicker">The party</h4><div class="party-strip">${heroes.map((p) =>
    `<button class="pchip" data-sheet="${p.id}" style="border-color:${p.controller ? colorOf(p.controller) : 'var(--line)'}">${p.h.emoji} ${esc(p.name)}<span class="dim">${p.controller ? '' : ' (AI)'}</span></button>`).join('')}</div>`;

  const B = $('story-body');
  B.innerHTML = html;
  for (const el of B.querySelectorAll('[data-vote]')) el.onclick = () => send({ t: 'vote', choice: el.dataset.vote });
  for (const el of B.querySelectorAll('[data-claim]')) el.onclick = () => send({ t: 'claim', hero: el.dataset.claim });
  for (const el of B.querySelectorAll('[data-help]')) el.onclick = () => send({ t: 'help', hero: el.dataset.help });
  for (const el of B.querySelectorAll('[data-roll]')) el.onclick = () => send({ t: 'roll', hero: el.dataset.roll });
  for (const el of B.querySelectorAll('[data-why]')) el.onclick = () => ctx.openSheet(detail(st.check.rolls[el.dataset.why], null));
  for (const el of B.querySelectorAll('[data-sheet]')) el.onclick = () => ctx.openSheet(sheetHtml(heroes.find((p) => p.id === el.dataset.sheet).h));
  if ($('s-decide')) $('s-decide').onclick = () => send({ t: 'decide' });
  if ($('s-roll')) $('s-roll').onclick = () => send({ t: 'roll' });
  if ($('s-rollrest')) $('s-rollrest').onclick = () => send({ t: 'continue' });
  if ($('s-continue')) $('s-continue').onclick = () => send({ t: 'continue' });
  if ($('s-again')) $('s-again').onclick = () => send({ t: 'again' });
}

// The latest check roll, for a pop-up card.
export const checkShort = (r) => short(r, null);
