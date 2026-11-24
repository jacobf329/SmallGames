// Leftover Uprising - the phone client: screens, lobby, the kitchen view
// (food smoothed between the host's snapshots), building and upgrading,
// the team panel and the HUD.

import { TICK, TOWERS, TREES, MAX_TOWERS, SELL_BACK, MASTERY_DISCOUNT,
  masteryLevel, buildable, doorsFor } from './data.js';
import { chipsHtml, skillsHtml, SKILL_CSS } from './skillsui.js';
import { createServer } from './session.js';
import { Host, LocalTransport, RtcTransport, normCode, onlineSupported } from './rtc.js';
import { Net } from './net.js';
import { Renderer } from './render.js';
import { sfx } from './audio.js';

const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INTERP = 130;                  // ms behind the host, for smooth food
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const FAM_NAMES = { horde: 'Peas & grapes', tank: 'Meatballs', splitter: 'Broccoli', fast: 'Chilis', armoured: 'Celery & coconuts',
  flying: 'Popcorn (flies!)', regen: 'Jelly & sourdough (regrow)', frozen: 'Frozen food', heatproof: 'Heat-proof food', greasy: 'Bacon (greasy)' };
const DT_NAMES = { basic: 'Plain', heat: 'Heat', chop: 'Chop', cold: 'Cold', sticky: 'Sticky' };

const G = window.LU = {
  id: null, code: '', hosting: false, practice: false, name: '', lobby: null, inGame: false,
  players: [], towers: new Map(), snaps: [], view: [], wave: 0, phase: 'build', bt: 0, lives: 0, maxLives: 0,
  fams: [], sel: null, skillsOpen: false, showRanges: false, endless: false, spd: 1,
};
const net = new Net();
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: SKILL_CSS }));
const renderer = G.renderer = new Renderer($('#view'));

// ================================ screens ================================
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  if (id === 'game') requestAnimationFrame(() => renderer.resize());
}
$('#in-name').value = store.get('lu.name', '');
const myName = () => { const n = $('#in-name').value.trim() || 'Cook'; store.set('lu.name', n); return n; };
sfx.enabled = store.get('lu.sound', '1') === '1';
$('#opt-sound').checked = sfx.enabled;
$('#opt-sound').addEventListener('change', e => { sfx.enabled = e.target.checked; store.set('lu.sound', e.target.checked ? '1' : '0'); });
$('#opt-ranges').addEventListener('change', e => { G.showRanges = e.target.checked; });

// ================================= hosting ===============================
let hostSession = null, loop = null;
async function hostKitchen(practice) {
  sfx.unlock();
  const name = myName();
  $('#status').textContent = practice ? 'opening the kitchen…' : 'getting a kitchen code…';
  let code = 'SOLO', server = null;
  if (!practice) {
    hostSession = new Host({ connect: c => server.connect(c) }, { name });
    try { code = await hostSession.start(); }
    catch { $('#status').textContent = "Couldn't create a kitchen: check your internet connection."; hostSession = null; return; }
  }
  server = createServer({ code });
  window.LU.server = server;
  let last = performance.now();
  loop = setInterval(() => { const now = performance.now(); server.tick((now - last) / 1000); last = now; }, 1000 / TICK);
  Object.assign(G, { name, code, hosting: !practice, practice });
  net.close();
  net.useTransport(new LocalTransport(server));
  net.connect();
  try { G.wake = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
}

const STAGES = { finding: 'finding the kitchen…', gathering: 'working out how to reach the host…', waiting: "waiting for the host's phone to answer…",
  linking: 'connecting to the host…', online: 'connected!', retrying: 'trying again…' };
function joinOnline() {
  sfx.unlock();
  const code = normCode($('#in-code').value);
  if (code.length !== 4) { $('#status').textContent = 'Kitchen codes have 4 letters.'; return; }
  const name = myName();
  Object.assign(G, { name, code });
  $('#btn-retry').classList.add('hidden');
  const t = new RtcTransport(code, name, (stage, diag) => {
    const st = $('#status');
    if (stage === 'noroom') { st.textContent = `No kitchen with the code ${code}. Check it with the host.`; return; }
    if (stage === 'blocked') {
      st.innerHTML = "Couldn't reach the host's phone. Make sure the host still has the game open on screen, then try again. Same wifi as the host always works." +
        (diag ? `<br><small>you: ${(diag.mine || []).join(', ') || 'none'}${diag.host ? ` · host: ${diag.host.join(', ')}` : ''}</small>` : '');
      $('#btn-retry').classList.remove('hidden');
      return;
    }
    st.textContent = STAGES[stage] || 'connecting…';
  });
  net.close();
  net.useTransport(t);
  net.connect();
}
$('#btn-host').addEventListener('click', () => hostKitchen(false));
$('#btn-practice').addEventListener('click', () => hostKitchen(true));
$('#btn-join').addEventListener('click', joinOnline);
$('#btn-retry').addEventListener('click', () => { $('#btn-retry').classList.add('hidden'); joinOnline(); });
$('#in-code').addEventListener('input', e => { e.target.value = normCode(e.target.value); });
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) $('#in-code').value = normCode(joinParam);
if (!onlineSupported()) $('#online').classList.add('hidden');

async function leave() {
  net.close();
  if (loop) clearInterval(loop);
  try { await hostSession?.stop(); } catch { /* offline */ }
  G.wake?.release?.();
  location.href = location.pathname;
}
window.addEventListener('pagehide', () => hostSession?.stopNow());
document.querySelectorAll('[data-leave]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); leave(); }));

// ================================== lobby ================================
function teamHint(n) {
  const doors = doorsFor(n).length;
  if (n === 1) return 'Solo: one door, and the food stays beatable with a single strategy.';
  return `${n} cooks: ${doors} doors open, more food and more kinds at once. Split the trees, because the food adapts to whatever you lean on.`;
}
function renderLobby() {
  const L = G.lobby;
  if (!L) return;
  const host = L.host === G.id;
  $('#lobby-title').textContent = G.practice ? 'SOLO KITCHEN' : `KITCHEN ${L.code}`;
  $('#lobby-share').classList.toggle('hidden', !G.hosting);
  $('#lobby-players').innerHTML = L.seats.map(p => `<div class="pl"><i style="background:${p.color}"></i><b>${esc(p.name)}</b><small>${p.ai ? 'AI COOK' : p.id === L.host ? 'HOST' : ''}${p.id === G.id ? ' · YOU' : ''}</small></div>`).join('');
  $('#lobby-count').textContent = `${L.seats.length} / ${L.max}`;
  $('#host-ctl').classList.toggle('hidden', !host);
  $('#btn-start').classList.toggle('hidden', !host);
  $('#lobby-wait').classList.toggle('hidden', host);
  $('#cooks-n').textContent = L.settings.cooks;
  $('#team-hint').textContent = teamHint(L.seats.length);
  for (const b of document.querySelectorAll('#seg-diff button')) b.classList.toggle('on', b.dataset.v === L.settings.diff);
}
document.querySelectorAll('#seg-diff button').forEach(b => b.addEventListener('click', () => net.send({ t: 'setup', diff: b.dataset.v })));
$('#cooks-minus').addEventListener('click', () => net.send({ t: 'setup', cooks: (G.lobby?.settings.cooks || 0) - 1 }));
$('#cooks-plus').addEventListener('click', () => net.send({ t: 'setup', cooks: (G.lobby?.settings.cooks || 0) + 1 }));
$('#btn-start').addEventListener('click', () => { sfx.unlock(); net.send({ t: 'start' }); });
$('#btn-again').addEventListener('click', () => net.send({ t: 'again' }));
$('#btn-endless').addEventListener('click', () => { net.send({ t: 'endless' }); $('#results').classList.add('hidden'); });
$('#btn-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?join=${G.code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Leftover Uprising', text: `Help me hold the kitchen in Leftover Uprising: code ${G.code}`, url });
    else { await navigator.clipboard.writeText(url); $('#btn-share').textContent = 'LINK COPIED'; }
  } catch { /* cancelled */ }
});

// =============================== messages ================================
net.on('open', () => net.send({ t: 'join', name: G.name || myName() }));
net.on('joined', m => { G.id = m.id; G.code = m.code; });
net.on('error', m => { $('#status').textContent = m.msg; });
net.on('lobby', m => {
  G.lobby = m;
  if (m.state === 'lobby') { G.inGame = false; $('#results').classList.add('hidden'); show('lobby'); renderLobby(); }
});
net.on('start', () => {
  G.inGame = true; G.towers = new Map(); G.snaps = []; G.sel = null; G.resultsShown = false;
  $('#results').classList.add('hidden');
  show('game');
  renderSheet();
  setTimeout(() => toast('Tap an empty floor tile to build. Tap a tower to upgrade it.', '', 5000), 400);
});
net.on('towers', m => {
  G.towers = new Map(m.list.map(([id, x, y, kind, owner, mode, dmg, buff, spent]) => [id, { id, x, y, kind, owner, mode, dmg, buff, spent }]));
  if (G.sel?.tower && !G.towers.has(G.sel.tower)) G.sel = null;
  if (G.sel?.tile && towerAt(G.sel.tile.x, G.sel.tile.y)) G.sel = { tower: towerAt(G.sel.tile.x, G.sel.tile.y).id };
  renderSheet();
});
net.on('players', m => {
  const before = me()?.gold;
  G.players = m.list;
  renderHud();
  renderSheet();      // cheap: it only rebuilds when what it shows changed (gold, skills, levels)
  if (!$('#team').classList.contains('hidden')) renderTeam();
});
net.on('nope', m => { toast(m.msg, 'warn'); sfx.nope(); });
net.on('snap', m => {
  const prevPhase = G.phase;
  Object.assign(G, { wave: m.w, phase: m.ph, bt: m.bt, lives: m.lv, maxLives: m.ml, fams: m.fams, endless: m.endless, spd: m.spd || 1 });
  G.snaps.push({ at: performance.now(), en: new Map(m.en.map(([id, type, path, d, hp, fl, lat]) => [id, { id, type, path, d, hp, fl, lat }])) });
  if (G.snaps.length > 6) G.snaps.shift();
  for (const e of m.ev) onEvent(e);
  renderHud();
  if (prevPhase !== G.phase) renderSheet();
  if ((G.phase === 'won' || G.phase === 'lost') && !G.resultsShown) showResults();
});

const me = () => G.players.find(p => p.id === G.id);
const nameOf = id => G.players.find(p => p.id === id)?.name || 'someone';
const towerAt = (x, y) => { for (const t of G.towers.values()) if (t.x === x && t.y === y) return t; return null; };

function onEvent(e) {
  const t = G.towers.get(e.id);
  switch (e.t) {
    case 'shot': if (t) { const def = TOWERS[t.kind]; renderer.addFx({ k: 'shot', fx: t.x, fy: t.y, x: e.x, y: e.y, color: def.tree ? TREES[def.tree].color : '#fff', life: 0.12 }); sfx.shot(def.tree); } break;
    case 'aura': if (t) { const def = TOWERS[t.kind]; renderer.addFx({ k: 'aura', x: t.x, y: t.y, r: def.range, color: TREES[def.tree]?.color || '#fff', life: 0.35 }); sfx.shot(def.tree); } break;
    case 'pop': sfx.pop(); if (e.gold >= 4) renderer.addFx({ k: 'text', x: e.x, y: e.y, text: `+${e.gold}`, color: '#ffd23f', size: 0.32, life: 0.7 }); break;
    case 'combo': sfx.combo(); renderer.addFx({ k: 'text', x: e.x, y: e.y - 0.3, text: e.name, color: e.name === 'Shatter!' ? '#9fe6ff' : '#ffb347', size: 0.42, life: 0.9 }); break;
    case 'leak': sfx.leak(); flash(); break;
    case 'built': case 'upgraded': if (e.by === G.id) sfx.build(); break;
    case 'gift': if (e.to === G.id) toast(`${nameOf(e.from)} sent you ${e.amt} gold`, 'good'); break;
    case 'early': toast(`Early start: +${e.gold} gold each`, 'good'); break;
    case 'wave': {
      sfx.wave();
      toast(`Wave ${e.n}: ${e.fams.map(f => FAM_NAMES[f] || f).join(', ')}`);
      if (e.bossIntro) { sfx.boss(); toast(e.bossIntro, 'boss', 6000); }
      if (e.warn) toast(e.warn, 'warn', 6000);
      break;
    }
    case 'cleared': sfx.coin(); toast(`Wave ${e.n} cleared: +${e.bonus} gold${e.team ? ` (+${e.team} from registers)` : ''}, +${e.sp} skill point${e.sp > 1 ? 's' : ''}`, 'good'); break;
    case 'skill': if (e.by === G.id) sfx.combo(); break;
    case 'speed': toast(e.speed === 2 ? '⏩ Double speed: everyone agreed' : `▶ Back to normal speed (${nameOf(e.by)})`); break;
  }
}

// ================================== toasts ===============================
function toast(text, kind = '', ms = 3500) {
  const box = $('#toasts');
  for (const el of box.children) if (el.textContent === text) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), ms);
}
let flashT = 0;
function flash() { flashT = performance.now(); }

// ==================================== HUD ================================
function renderHud() {
  const p = me();
  $('#h-wave').textContent = G.wave + (G.endless ? '∞' : '');
  $('#h-lives').textContent = G.lives;
  $('#h-gold').textContent = p ? p.gold : 0;
  $('#h-skills').dataset.n = p?.sp || 0;
  const humansAll = G.players.filter(q => !q.ai), fastN = humansAll.filter(q => q.fast).length, fb = $('#h-fast');
  fb.classList.toggle('on', G.spd === 2);
  fb.classList.toggle('half', !!p?.fast && G.spd !== 2);
  fb.querySelector('small').textContent = G.spd === 2 ? '2× on' : humansAll.length > 1 ? `2× ${fastN}/${humansAll.length}` : '2×';
  const go = $('#h-go');
  if (G.phase === 'build') {
    const humans = G.players.filter(q => !q.ai), ready = humans.filter(q => q.ready).length;
    go.disabled = false;
    go.classList.toggle('ready', !!p?.ready);
    go.textContent = p?.ready ? `READY ${ready}/${humans.length} · ${G.bt}s` : `▶ WAVE ${G.wave + 1} · ${G.bt}s`;
  } else {
    go.disabled = true; go.classList.remove('ready');
    go.textContent = G.phase === 'wave' ? `WAVE ${G.wave} · ${G.snaps.at(-1)?.en.size || 0} food` : G.phase.toUpperCase();
  }
}
$('#h-go').addEventListener('click', () => { sfx.unlock(); net.send({ t: 'ready' }); });
$('#h-skills').addEventListener('click', () => { G.sel = null; G.skillsOpen = !G.skillsOpen; renderSheet(); });
$('#h-fast').addEventListener('click', () => { sfx.unlock(); net.send({ t: 'fast' }); });
$('#sheet-x').addEventListener('click', () => { G.sel = null; G.skillsOpen = false; renderSheet(); });

// ============================ tap on the kitchen =========================
$('#view').addEventListener('pointerup', e => {
  sfx.unlock();
  const r = $('#view').getBoundingClientRect();
  const tile = renderer.tileAt(e.clientX - r.left, e.clientY - r.top);
  G.skillsOpen = false;
  if (!tile) { G.sel = null; renderSheet(); return; }
  const t = towerAt(tile.x, tile.y);
  if (t) G.sel = G.sel?.tower === t.id ? null : { tower: t.id };
  else if (buildable(tile.x, tile.y)) {
    // Second tap on the same empty tile builds right away.
    if (G.sel?.tile && G.sel.tile.x === tile.x && G.sel.tile.y === tile.y) { net.send({ t: 'build', x: tile.x, y: tile.y }); }
    else G.sel = { tile };
  } else G.sel = null;
  renderSheet();
});

// ================================ the sheet ==============================
function costFor(kind) {
  const def = TOWERS[kind], p = me();
  const lvl = def.tree && p ? masteryLevel(p.m[def.tree]) : 0;
  return Math.round(def.cost * (lvl >= 2 ? 1 - MASTERY_DISCOUNT : 1));
}
function statLine(def) {
  if (def.tree === 'service') {
    return `+${Math.round(def.buff * 100)}% damage${def.haste ? `, +${Math.round(def.haste * 100)}% speed` : ''} to other trees in range · +${def.income} gold/wave${def.teamIncome ? ` · +${def.teamIncome} to every cook` : ''}`;
  }
  const bits = [`${DT_NAMES[def.dtype]} ${def.dmg}${def.aura ? ' to all in reach' : ''}`, `${def.rate}/s`, `range ${def.range}`];
  if (def.splash) bits.push('splash');
  if (def.burn) bits.push('burns');
  if (def.slow) bits.push('slows');
  if (def.freeze) bits.push('freezes');
  if (def.sticky) bits.push('sticky');
  if (def.stun) bits.push('stuns');
  if (def.pierce) bits.push('ignores armour');
  bits.push(def.air ? 'hits fliers' : 'ground only');
  return bits.join(' · ');
}
const masteryChips = p => chipsHtml(p.m);
// The sheet is only rebuilt when what it shows actually changes (gold ticks up
// with every kill, and a rebuild mid-tap would swallow the tap).
function setHtml(node, html) { if (node._html === html) return false; node._html = html; node.innerHTML = html; return true; }
function renderSheet() {
  const p = me();
  const body = $('#sheet-body');
  const open = !!(G.sel || G.skillsOpen);
  $('#sheet').classList.toggle('open', open);
  if (!open) return;
  if (!p) { setHtml(body, '<p class="hint">Joining…</p>'); return; }
  if (G.sel?.tile) {
    const c = costFor('prep'), mine = [...G.towers.values()].filter(t => t.owner === G.id).length, cap = MAX_TOWERS(G.players.length);
    if (!setHtml(body, `<h3>🍽️ Prep Station</h3><p class="sub">${TOWERS.prep.desc} ${statLine(TOWERS.prep)}</p>
      <div class="tools"><button class="btn" id="do-build" ${p.gold < c || mine >= cap ? 'disabled' : ''}>BUILD · ${c} gold</button>
      <span class="hint">Your towers: ${mine}/${cap}. Tip: tap the same tile twice to build.</span></div>`)) return;
    $('#do-build').onclick = () => { const tl = G.sel?.tile; if (tl) net.send({ t: 'build', x: tl.x, y: tl.y }); };
    return;
  }
  const t = G.sel?.tower && G.towers.get(G.sel.tower);
  if (t) {
    const def = TOWERS[t.kind], mineT = t.owner === G.id, owner = G.players.find(q => q.id === t.owner);
    let html = `<h3 data-tid="${t.id}">${def.icon} ${def.name} <small class="hint">${def.tree ? TREES[def.tree].name + ' tier ' + def.tier : 'blank'}</small></h3>
      <p class="sub">${mineT ? 'Yours' : `<span style="color:${owner?.color}">${esc(owner?.name || '?')}</span>'s`} · ${statLine(def)} · ${t.dmg} damage dealt${t.buff ? ` · boosted +${Math.round(t.buff * 100)}%` : ''}</p>`;
    if (mineT) {
      if (def.next.length) {
        html += '<div class="opts">' + def.next.map(id => {
          const nd = TOWERS[id], c = costFor(id), lvl = masteryLevel(p.m[nd.tree]);
          const locked = nd.req && lvl < nd.req;
          return `<button class="opt ${locked ? 'locked' : ''} ${p.gold < c ? 'poor' : ''}" data-up="${id}">
            <b>${nd.icon} ${nd.name}</b><small>${nd.desc || (def.tier === 0 ? TREES[nd.tree].blurb : statLine(nd))}</small>
            <span class="cost">${locked ? `needs ${TREES[nd.tree].name} level ${nd.req} in the skill tree (you: ${lvl})` : `${c} gold`}</span></button>`;
        }).join('') + '</div>';
      } else html += '<p class="hint">Fully upgraded.</p>';
      html += `<div class="tools">${def.rate ? `<span class="hint">Aim:</span><div class="seg" id="seg-mode">${['first', 'strong', 'last'].map(m => `<button data-m="${m}" class="${t.mode === m ? 'on' : ''}">${m}</button>`).join('')}</div>` : ''}
        <button class="btn ghost small" id="do-sell">SELL · ${Math.round(t.spent * SELL_BACK)}</button></div>`;
    }
    if (!setHtml(body, html)) return;
    body.querySelectorAll('[data-up]').forEach(b => b.onclick = () => net.send({ t: 'up', id: t.id, to: b.dataset.up }));
    body.querySelectorAll('#seg-mode button').forEach(b => b.onclick = () => net.send({ t: 'mode', id: t.id, mode: b.dataset.m }));
    const sb = $('#do-sell');
    if (sb) sb.onclick = () => { if (sb.dataset.sure) { net.send({ t: 'sell', id: t.id }); G.sel = null; } else { sb.dataset.sure = 1; sb.textContent = 'TAP AGAIN TO SELL'; } };
    return;
  }
  if (!setHtml(body, `<p class="hint">Tap an empty floor tile to build a Prep Station, then tap it to send it down a tree.</p>${skillsHtml(p)}`)) return;
  body.querySelectorAll('[data-skill]').forEach(b => b.onclick = () => net.send({ t: 'skill', tree: b.dataset.skill }));
}
// ================================= team ==================================
function renderTeam() {
  $('#team-list').innerHTML = G.players.map(p => `<div class="tm"><div class="top"><i style="background:${p.color}"></i><b>${esc(p.name)}${p.id === G.id ? ' (you)' : ''}${p.ai ? ' · AI' : ''}</b><span class="hint">${p.gold} gold</span></div>
    ${masteryChips(p)}<span class="hint">${p.st.dmg} damage · ${p.st.kills} kills · ${p.st.combos} combos</span>
    ${p.id !== G.id ? `<div class="gift"><button class="btn small ghost" data-gift="${p.id}" data-amt="25">Send 25</button><button class="btn small ghost" data-gift="${p.id}" data-amt="100">Send 100</button></div>` : ''}</div>`).join('');
  document.querySelectorAll('[data-gift]').forEach(b => b.onclick = () => net.send({ t: 'gift', to: b.dataset.gift, amt: +b.dataset.amt }));
}
$('#h-team').addEventListener('click', () => { renderTeam(); $('#team').classList.remove('hidden'); });
$('#h-menu').addEventListener('click', () => $('#menu').classList.remove('hidden'));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.overlay').classList.add('hidden')));

// =============================== results =================================
function showResults() {
  G.resultsShown = true;
  const won = G.phase === 'won';
  $('#res-title').textContent = won ? 'KITCHEN SAVED!' : 'THE FOOD GOT OUT';
  $('#res-sub').textContent = won ? `All ${G.wave} waves held. The leftovers stay leftovers.` : `You held out to wave ${G.wave}.`;
  $('#res-rows').innerHTML = [...G.players].sort((a, b) => b.st.dmg - a.st.dmg).map(p => {
    const top = Object.entries(p.m).sort((a, b) => b[1] - a[1])[0];
    return `<div class="pl"><i style="background:${p.color}"></i><b>${esc(p.name)}</b><small>${TREES[top[0]].icon} ${p.st.dmg} dmg · ${p.st.combos} combos</small></div>`;
  }).join('');
  const host = G.lobby?.host === G.id;
  $('#btn-endless').classList.toggle('hidden', !(won && host));
  $('#btn-again').classList.toggle('hidden', !host);
  $('#results').classList.remove('hidden');
}

// ================================ drawing ================================
function buildView(now) {
  const t = now - INTERP, S = G.snaps;
  if (!S.length) return [];
  let a = S[0], b = S[0];
  for (let i = 0; i < S.length; i++) { if (S[i].at <= t) a = S[i]; if (S[i].at >= t) { b = S[i]; break; } b = S[i]; }
  const k = b.at > a.at ? Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at))) : 1;
  const out = [];
  for (const e of b.en.values()) {
    const pe = a.en.get(e.id);
    out.push(pe ? { ...e, d: pe.d + (e.d - pe.d) * k } : e);
  }
  return out;
}
function frame(now) {
  if (G.inGame) {
    G.view = buildView(now);
    renderer.draw(G, now);
    if (now - flashT < 250) {
      const x = renderer.x; x.fillStyle = `rgba(255,60,60,${0.25 * (1 - (now - flashT) / 250)})`; x.fillRect(0, 0, renderer.w, renderer.h);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
