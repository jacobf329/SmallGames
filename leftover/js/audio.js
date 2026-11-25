// Leftover Uprising - sound. Recorded effects and music (audio/*.mp3, made with
// ElevenLabs) played through Web Audio so many can overlap; if a file is
// missing or still loading, a small synthesised stand-in plays instead.
// The page sets globalThis.LU_AUDIO_BASE when the files live elsewhere.

let ac = null, master = null, sfxBus = null, noise = null, on = true, last = {};
const buffers = new Map(), loading = new Set();
const SFX_FILES = ['pop_soft', 'crunch', 'splat', 'poof', 'thud', 'shot_heat', 'shot_chop', 'shot_cold', 'shot_sticky', 'shot_basic',
  'build', 'upgrade', 'coin', 'leak', 'wave', 'boss', 'combo', 'skill', 'nope', 'victory', 'defeat'];
const base = () => globalThis.LU_AUDIO_BASE ?? 'audio/';

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const n of SFX_FILES) load(n);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function load(name) {
  if (buffers.has(name) || loading.has(name) || typeof fetch === 'undefined') return;
  loading.add(name);
  fetch(base() + name + '.mp3').then(r => (r.ok ? r.arrayBuffer() : Promise.reject()))
    .then(b => new Promise((res, rej) => ac.decodeAudioData(b, res, rej)))
    .then(buf => buffers.set(name, buf)).catch(() => {}).finally(() => loading.delete(name));
}
// Play a recorded effect; false if it isn't loaded (caller falls back).
function play(name, vol = 1, rate = 1) {
  const a = ctx(); if (!a || !on) return true;
  const buf = buffers.get(name);
  if (!buf) return false;
  const s = a.createBufferSource(), g = a.createGain();
  s.buffer = buf; s.playbackRate.value = rate; g.gain.value = vol;
  s.connect(g).connect(sfxBus); s.start();
  return true;
}
// Many towers fire at once: the same sound at most every `ms`.
const gate = (k, ms = 80) => { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return on; };
const vary = (amt = 0.08) => 1 + (Math.random() * 2 - 1) * amt;

// ── tiny synth stand-ins ──
function burst(dur, freq, vol, type = 'lowpass') {
  const a = ctx(); if (!a) return;
  const t = a.currentTime, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(sfxBus); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
}
function tone(freq, dur, vol, type = 'square', slide = 1) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
}

// Which pop each food makes.
const POP = {
  splat: ['jelly', 'icecream', 'cake', 'cake2', 'cupcake', 'watermelon', 'melonslice'],
  crunch: ['celery', 'coconut', 'crust', 'bacon'],
  poof: ['popcorn', 'cottoncandy'],
  thud: ['meatball', 'drumstick', 'sourdough', 'turkey', 'pizza', 'slice'],
};
const popKind = type => Object.keys(POP).find(k => POP[k].includes(type)) || 'pop_soft';

// ── music ──
let musicOn = true, musicWant = null, musicEls = {}, musicCur = null;
function applyMusic() {
  const want = musicOn ? musicWant : null;
  for (const [k, el] of Object.entries(musicEls)) if (k !== want) fade(el, 0, () => el.pause());
  if (!want) { musicCur = null; return; }
  let el = musicEls[want];
  if (!el) {
    el = new Audio(base() + (want === 'boss' ? 'music_boss.mp3' : 'music.mp3'));
    el.loop = true; el.volume = 0; el.preload = 'auto';
    musicEls[want] = el;
  }
  musicCur = want;
  el.play().then(() => fade(el, 0.45)).catch(() => {});
}
function fade(el, to, done) {
  clearInterval(el._fade);
  el._fade = setInterval(() => {
    const v = el.volume + Math.sign(to - el.volume) * 0.05;
    if (Math.abs(to - el.volume) <= 0.05) { el.volume = to; clearInterval(el._fade); done?.(); } else el.volume = Math.max(0, Math.min(1, v));
  }, 50);
}

export const sfx = {
  unlock() { ctx(); if (musicWant && musicCur !== musicWant) applyMusic(); },
  set enabled(v) { on = v; }, get enabled() { return on; },
  // 'calm', 'boss' or null. Separate switch from the sound effects.
  music(mode) { if (mode === musicWant) return; musicWant = mode; applyMusic(); },
  set musicEnabled(v) { musicOn = v; applyMusic(); }, get musicEnabled() { return musicOn; },
  shot(tree) {
    if (!gate('shot' + tree, 90)) return;
    if (play('shot_' + (tree || 'basic'), 0.32, vary(0.1))) return;
    if (tree === 'heat') burst(0.12, 900, 0.12);
    else if (tree === 'chop') tone(1400, 0.05, 0.06, 'triangle', 0.6);
    else if (tree === 'cold') burst(0.1, 4000, 0.06, 'highpass');
    else if (tree === 'sticky') tone(220, 0.08, 0.06, 'sine', 0.5);
    else tone(700, 0.04, 0.04, 'square', 0.8);
  },
  pop(type) {
    if (!gate('pop', 55)) return;
    if (!play(popKind(type), 0.6, vary(0.12))) tone(600 + Math.random() * 400, 0.07, 0.07, 'sine', 1.8);
  },
  build() { if (on && !play('build', 0.8, vary(0.05))) { tone(500, 0.06, 0.1, 'triangle'); setTimeout(() => tone(750, 0.08, 0.1, 'triangle'), 60); } },
  upgrade() { if (on && !play('upgrade', 0.7)) this.build(); },
  skill() { if (on && !play('skill', 0.7)) this.combo(); },
  coin() { if (gate('coin', 120) && !play('coin', 0.6)) { tone(1320, 0.05, 0.06, 'square'); setTimeout(() => tone(1760, 0.07, 0.06, 'square'), 50); } },
  combo() { if (gate('combo', 150) && !play('combo', 0.55, vary(0.05))) [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.1, 0.09, 'triangle'), i * 50)); },
  leak() { if (gate('leak', 900) && !play('leak', 0.55)) tone(200, 0.3, 0.15, 'sawtooth', 0.5); },
  wave() { if (on && !play('wave', 0.8)) [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.1, 'square'), i * 110)); },
  boss() { if (on && !play('boss', 0.8)) [196, 185, 175, 165].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.14, 'sawtooth'), i * 220)); },
  victory() { if (on && !play('victory', 0.8)) [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.1, 'triangle'), i * 120)); },
  defeat() { if (on && !play('defeat', 0.8)) tone(220, 0.8, 0.15, 'sawtooth', 0.4); },
  nope() { if (gate('nope', 150) && !play('nope', 0.6)) tone(160, 0.12, 0.1, 'square'); },
};
