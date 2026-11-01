// Skyline Hustle - era music. Everything is synthesised live with Web Audio:
// no audio files. Each era has a style (tempo, swing, harmony, instruments,
// drums); melodies are composed on the fly from a seeded generator, so every
// tune is new. The music follows the game: mellower at night, a tense
// ostinato during live auctions, and a crossfade when a new era dawns.

import { audioCtx } from './audio.js';

// ------------------------------------------------------------ theory ----
const Q = {
  maj: [0, 4, 7], m: [0, 3, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  7: [0, 4, 7, 10], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], sus: [0, 5, 7, 10], dim: [0, 3, 6, 9],
};
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixo: [0, 2, 4, 5, 7, 9, 10] };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// --------------------------------------------------------- the eras ----
// prog: [root offset from key, chord quality, beats]. Patterns are 16 steps
// per bar: x = hit, - = rest. Bass: r root, f fifth, o octave, w walking.
const STYLES = {
  'Jazz Age': {
    bpm: 116, swing: 0.64, key: 53, scale: 'major', crackle: true,
    progs: [[[2, 'm7', 4], [7, '7', 4], [0, '6', 4], [9, '7', 4]], [[0, '6', 4], [9, 'm7', 4], [2, 'm7', 4], [7, '7', 4]], [[5, '6', 4], [6, 'dim', 4], [0, '6', 4], [7, '9', 4]]],
    bass: { inst: 'upright', mode: 'walk' },
    comp: { inst: 'piano', pat: 'x---x---x---x---', oct: 0, vel: 0.5, stride: true },
    lead: { inst: 'trumpet', density: 0.55, oct: 12, rests: 0.25 },
    drums: { kick: 'x-------x-------', snare: '----x-------x---', hat: 'x---x-x-x---x-x-', brush: true },
    night: { lead: 'clarinet' },
  },
  'Post-war Boom': {
    bpm: 128, swing: 0.6, key: 58, scale: 'major',
    progs: [[[0, 'maj', 4], [9, 'm', 4], [5, 'maj', 4], [7, '7', 4]], [[0, '6', 4], [5, '9', 4], [0, '6', 4], [7, '7', 4]]],
    bass: { inst: 'upright', mode: 'boogie' },
    comp: { inst: 'piano', pat: '--x---x---x---x-', oct: 0, vel: 0.45 },
    lead: { inst: 'sax', density: 0.6, oct: 12, rests: 0.2 },
    drums: { kick: 'x-------x-------', snare: '----x-------x---', hat: 'x-x-x-x-x-x-x-x-' },
    night: { lead: 'vibes' },
  },
  'Space Age': {
    bpm: 100, swing: 0.5, key: 55, scale: 'lydian', delay: true,
    progs: [[[0, 'maj7', 4], [2, '7', 4], [5, 'maj7', 4], [4, 'm7', 4]], [[0, 'maj9', 8], [10, 'maj7', 8]], [[0, 'maj7', 4], [5, 'maj7', 4], [9, 'm7', 4], [7, 'sus', 4]]],
    bass: { inst: 'round', mode: 'bossa' },
    comp: { inst: 'vibes', pat: 'x--x--x---x--x--', oct: 0, vel: 0.4 },
    lead: { inst: 'theremin', density: 0.35, oct: 12, rests: 0.35, glide: true },
    drums: { rim: '---x--x----x--x-', hat: 'x-x-x-x-x-x-x-x-', kick: 'x------x--x-----', soft: true },
    night: { drumsOff: true },
  },
  'Disco Decade': {
    bpm: 120, swing: 0.5, key: 57, scale: 'dorian',
    progs: [[[0, 'm9', 8], [5, '9', 8]], [[0, 'm7', 4], [5, 'm7', 4], [3, 'maj7', 4], [7, 'm7', 4]], [[0, 'm9', 4], [10, '6', 4], [8, 'maj7', 4], [7, 'sus', 4]]],
    bass: { inst: 'synthbass', mode: 'octave' },
    comp: { inst: 'strings', pat: 'x---------------', oct: 0, vel: 0.3, pad: true, stab: '--x---x---x---x-' },
    lead: { inst: 'strings', density: 0.4, oct: 12, rests: 0.3 },
    drums: { kick: 'x---x---x---x---', snare: '----x-------x---', hat: '--x---x---x---x-', open: true, clap: true },
    night: { hatsOff: false },
  },
  'Digital Age': {
    bpm: 124, swing: 0.5, key: 52, scale: 'minor', delay: true,
    progs: [[[8, 'maj', 4], [3, 'maj', 4], [10, 'maj', 4], [0, 'm', 4]], [[0, 'm', 4], [8, 'maj', 4], [3, 'maj', 4], [10, 'maj', 4]]],
    bass: { inst: 'squarebass', mode: 'pulse' },
    comp: { inst: 'pad', pat: 'x---------------', oct: 0, vel: 0.25, pad: true, arp: 'saw' },
    lead: { inst: 'bell', density: 0.45, oct: 12, rests: 0.3 },
    drums: { kick: 'x---x---x---x---', clap: '----x-------x---', hat: '--x---x---x---x-', tight: true },
    night: { lead: 'pluck' },
  },
  'Smart City': {
    bpm: 84, swing: 0.6, key: 50, scale: 'dorian', delay: true, crackle: true,
    progs: [[[0, 'm9', 4], [5, '9', 4], [3, 'maj9', 4], [10, 'maj7', 4]], [[0, 'maj9', 4], [4, 'm7', 4], [9, 'm9', 4], [5, 'maj9', 4]]],
    bass: { inst: 'sub', mode: 'lazy' },
    comp: { inst: 'epiano', pat: 'x-----x---x-----', oct: 0, vel: 0.4, pump: true },
    lead: { inst: 'pluck', density: 0.35, oct: 12, rests: 0.4 },
    drums: { kick: 'x-------x-x-----', snare: '----x-------x---', hat: 'x-xxx-x-x-xxx-x-', soft: true },
    night: { drumsOff: false },
  },
};
export const MUSIC_ERAS = Object.keys(STYLES);

// ----------------------------------------------------------- engine ----
let on = true, vol = 0.6;
let A = null, out = null, verb = null, verbIn = null, dly = null, noise = null;
let style = null, eraNow = null, mood = { night: false, auction: false, title: false };
let step = 0, nextT = 0, timer = null, song = null, rng = 1;

export function setMusic(v) { on = v; if (!on) stop(); else if (eraNow) start(); }
export const musicOn = () => on;
export function setMusicVolume(v) { vol = v; if (out) out.gain.setTargetAtTime(vol * 0.75, A.currentTime, 0.2); }
export const musicVolume = () => vol;

const rand = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
const pick = arr => arr[Math.floor(rand() * arr.length)];

function setup(given) {
  if (A && !given) return true;
  A = given || audioCtx();
  if (!A) return false;
  out = A.createGain(); out.gain.value = 0;
  const comp = A.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3;
  out.connect(comp).connect(A.destination);
  // A small generated room for everything to sit in.
  verb = A.createConvolver();
  const len = A.sampleRate * 1.6, ir = A.createBuffer(2, len, A.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  verb.buffer = ir;
  verbIn = A.createGain(); verbIn.gain.value = 0.22;
  verbIn.connect(verb).connect(out);
  dly = A.createDelay(1); const fb = A.createGain(), dlyOut = A.createGain();
  fb.gain.value = 0.32; dlyOut.gain.value = 0.25;
  dly.connect(fb).connect(dly); dly.connect(dlyOut).connect(out);
  noise = A.createBuffer(1, A.sampleRate, A.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return true;
}

// Route a voice to the mix (plus reverb and, for some eras, echo).
function bus(node, wet = 1, echo = false) {
  node.connect(out);
  const s = A.createGain(); s.gain.value = wet; node.connect(s).connect(verbIn);
  if (echo && style?.delay) { const e = A.createGain(); e.gain.value = 0.5; node.connect(e).connect(dly); }
}

function env(g, t, a, peak, d, sus = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d);
}
function osc(type, f, t, end, detune = 0) {
  const o = A.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  o.start(t); o.stop(end);
  return o;
}
function lp(f, q = 0.7) { const b = A.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; return b; }

// ------------------------------------------------------- instruments ----
function play(inst, t, m, dur, v = 0.5, opts = {}) {
  const f = hz(m), g = A.createGain(), end = t + dur + 1.5;
  const night = mood.night ? 0.7 : 1;
  switch (inst) {
    case 'piano': {
      env(g, t, 0.005, v * 0.22, Math.min(1.4, dur * 3));
      osc('triangle', f, t, end).connect(g); const h = A.createGain(); h.gain.value = 0.25; osc('sine', f * 2, t, end).connect(h).connect(g);
      const f1 = lp(2600 * night); g.connect(f1); bus(f1, 0.6); break;
    }
    case 'epiano': {
      env(g, t, 0.01, v * 0.22, Math.min(2, dur * 2.5));
      osc('sine', f, t, end).connect(g); const h = A.createGain(); h.gain.value = 0.12; osc('sine', f * 3, t, end).connect(h).connect(g);
      bus(g, 0.7, true); break;
    }
    case 'vibes': {
      env(g, t, 0.004, v * 0.2, 1.6);
      osc('sine', f, t, end).connect(g); const h = A.createGain(); h.gain.value = 0.08; osc('sine', f * 4, t, end).connect(h).connect(g);
      const trem = A.createGain(); trem.gain.value = 1; const l = osc('sine', 5.5, t, end), ld = A.createGain(); ld.gain.value = 0.35; l.connect(ld).connect(trem.gain);
      g.connect(trem); bus(trem, 0.9, true); break;
    }
    case 'bell': {
      env(g, t, 0.003, v * 0.16, 1.2);
      const c = osc('sine', f, t, end), mo = osc('sine', f * 3.5, t, end), md = A.createGain();
      md.gain.setValueAtTime(f * 2, t); md.gain.exponentialRampToValueAtTime(1, t + 0.8);
      mo.connect(md).connect(c.frequency); c.connect(g); bus(g, 0.6, true); break;
    }
    case 'pluck': {
      env(g, t, 0.004, v * 0.2, 0.5);
      const fl = lp(3000 * night, 4); fl.frequency.setValueAtTime(3500 * night, t); fl.frequency.exponentialRampToValueAtTime(400, t + 0.4);
      osc('sawtooth', f, t, end).connect(fl).connect(g); bus(g, 0.7, true); break;
    }
    case 'trumpet': case 'sax': case 'clarinet': {
      const type = inst === 'clarinet' ? 'square' : inst === 'sax' ? 'square' : 'sawtooth';
      const cut = (inst === 'trumpet' ? 1800 : inst === 'sax' ? 1400 : 1100) * night;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.11, t + 0.04);
      g.gain.setValueAtTime(v * 0.11, t + Math.max(0.05, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
      const o = osc(type, f, t, end), vib = osc('sine', 5.2, t, end), vd = A.createGain();
      vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.3, dur));
      vib.connect(vd).connect(o.frequency);
      if (opts.from) { o.frequency.setValueAtTime(hz(opts.from), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07); }
      const fl = lp(cut, 1.5); o.connect(fl).connect(g); bus(g, 0.5); break;
    }
    case 'theremin': {
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.12, t + 0.12);
      g.gain.setValueAtTime(v * 0.12, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
      const o = osc('sine', f, t, end);
      if (opts.from) { o.frequency.setValueAtTime(hz(opts.from), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.18); }
      const vib = osc('sine', 6.5, t, end), vd = A.createGain(); vd.gain.value = f * 0.02; vib.connect(vd).connect(o.frequency);
      o.connect(g); bus(g, 1, true); break;
    }
    case 'strings': case 'pad': {
      const a = inst === 'pad' ? 0.4 : 0.15;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.06, t + a);
      g.gain.setValueAtTime(v * 0.06, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
      const fl = lp((inst === 'pad' ? 1400 : 2400) * night);
      for (const dt of [-9, 0, 8]) osc('sawtooth', f, t, end, dt).connect(fl);
      fl.connect(g); bus(g, 1); break;
    }
    case 'upright': case 'round': case 'sub': {
      env(g, t, 0.01, v * (inst === 'sub' ? 0.32 : 0.28), Math.max(0.2, dur * 1.3));
      osc(inst === 'sub' ? 'sine' : 'triangle', f, t, end).connect(g);
      if (inst === 'upright') { const h = A.createGain(); h.gain.value = 0.15; osc('sine', f * 2, t, end).connect(h).connect(g); }
      bus(g, 0.15); break;
    }
    case 'synthbass': case 'squarebass': {
      env(g, t, 0.005, v * 0.2, Math.max(0.15, dur));
      const fl = lp(900 * night, 6); fl.frequency.setValueAtTime(1600 * night, t); fl.frequency.exponentialRampToValueAtTime(220, t + 0.25);
      osc(inst === 'synthbass' ? 'sawtooth' : 'square', f, t, end).connect(fl).connect(g); bus(g, 0.1); break;
    }
  }
}

function drum(kind, t, v = 1) {
  const g = A.createGain(), end = t + 0.6, soft = style.drums.soft || mood.night ? 0.6 : 1;
  v *= soft;
  const nz = (dur, type, freq, q = 1) => {
    const s = A.createBufferSource(); s.buffer = noise; s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    const f = A.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); return f;
  };
  switch (kind) {
    case 'kick': {
      const o = osc('sine', 120, t, end); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      env(g, t, 0.002, v * 0.55, 0.32); o.connect(g); bus(g, 0.05); break;
    }
    case 'snare': {
      if (style.drums.brush) { env(g, t, 0.02, v * 0.07, 0.25); nz(0.3, 'lowpass', 3000).connect(g); }
      else { env(g, t, 0.002, v * 0.16, 0.16); nz(0.2, 'bandpass', 1800, 0.8).connect(g); const o = osc('triangle', 190, t, end), og = A.createGain(); env(og, t, 0.002, v * 0.1, 0.08); o.connect(og).connect(g); }
      bus(g, 0.3); break;
    }
    case 'clap': env(g, t, 0.003, v * 0.14, 0.18); nz(0.2, 'bandpass', 1200, 1.5).connect(g); bus(g, 0.5); break;
    case 'hat': env(g, t, 0.001, v * (style.drums.brush ? 0.03 : 0.05), style.drums.tight ? 0.03 : 0.05); nz(0.08, 'highpass', 7000).connect(g); bus(g, 0.1); break;
    case 'open': env(g, t, 0.002, v * 0.04, 0.22); nz(0.3, 'highpass', 6500).connect(g); bus(g, 0.2); break;
    case 'rim': env(g, t, 0.001, v * 0.08, 0.04); osc('square', 1700, t, end).connect(lp(2500)).connect(g); bus(g, 0.4); break;
    case 'crackle': env(g, t, 0.001, 0.02 * Math.random(), 0.02); nz(0.03, 'highpass', 2000).connect(g); g.connect(out); break;
  }
}

// ---------------------------------------------------------- composer ----
// A song: a chord progression and a two-bar motif, played in A A B A form.
function compose() {
  const s = style;
  const prog = pick(s.progs);
  const bars = [];
  for (const [root, q, beats] of prog) for (let b = 0; b < beats / 4; b++) bars.push({ root, q, first: b === 0 });
  while (bars.length < 4) bars.push(...bars);
  const motif = [];
  const dens = s.lead.density;
  for (let i = 0; i < 32; i++) {
    const strong = i % 4 === 0;
    if (rand() < (strong ? dens + 0.25 : dens * 0.6)) motif.push({ i, len: rand() < 0.3 ? 4 : rand() < 0.5 ? 2 : 1, deg: Math.floor(rand() * 5) - 1, tone: strong || rand() < 0.5 });
  }
  const bMotif = motif.map(n => ({ ...n, deg: n.deg + 2 - Math.floor(rand() * 3) }));
  return { bars, motif, bMotif, part: 0, form: ['A', 'A', 'B', 'A'], loops: 0, keyShift: pick([0, 0, 0, 5, -2]) };
}

// Map a melodic degree onto the current chord or scale near the last note.
function melodyNote(chordRoot, q, deg, tone, oct) {
  const key = style.key + song.keyShift;
  if (tone) {
    const iv = Q[q];
    const k = ((deg % iv.length) + iv.length) % iv.length, o = Math.floor(deg / iv.length);
    return key + chordRoot + iv[k] + 12 * o + oct;
  }
  const sc = SCALES[style.scale];
  const k = ((deg % sc.length) + sc.length) % sc.length, o = Math.floor(deg / sc.length);
  return key + sc[k] + 12 * o + oct;
}

let lastLead = null;
function tick(t, st) {
  const s = style, bar = Math.floor(st / 16), i = st % 16, spb = 60 / (s.bpm * (mood.auction ? 1.12 : 1)) ;
  const sixteenth = spb / 4;
  const sec = Math.floor(bar / song.bars.length) % song.form.length;
  const chord = song.bars[bar % song.bars.length];
  const key = s.key + song.keyShift;
  const root = key + chord.root;
  const chordNotes = Q[chord.q].map(x => root + x);
  const hit = (pat, at = i) => pat && pat[at] === 'x';
  const night = mood.night, auction = mood.auction;
  if (s.crackle && rand() < 0.15) drum('crackle', t + rand() * sixteenth);

  // Drums.
  const drumsOn = !(night && s.night?.drumsOff) && !mood.title;
  if (drumsOn || auction) {
    const d = s.drums;
    if (hit(d.kick)) drum('kick', t, night ? 0.6 : 1);
    if (hit(d.snare) && !night) drum('snare', t);
    if (hit(d.clap) && !night) drum('clap', t);
    if (hit(d.rim)) drum('rim', t);
    if (hit(d.hat)) drum('hat', t, i % 4 === 0 ? 1 : 0.6);
    if (d.open && i % 4 === 2 && !night) drum('open', t);
    if (auction && i % 2 === 0) drum('hat', t, 0.8);
  }
  // Bass.
  const b = s.bass, beat = i % 4 === 0;
  if (auction) { if (i % 2 === 0) play(b.inst, t, root - 24 + (i % 8 === 4 ? 12 : 0), sixteenth * 1.6, 0.8); }
  else if (b.mode === 'walk' && beat) {
    const n = i / 4, next = song.bars[(bar + 1) % song.bars.length];
    const steps = [0, Q[chord.q][1], 7, (next.root - chord.root + 12) % 12 - 1];
    play(b.inst, t, root - 24 + steps[n], spb * 0.9, 0.9);
  } else if (b.mode === 'boogie' && i % 2 === 0) {
    const seq = [0, 4, 7, 9, 10, 9, 7, 4];
    play(b.inst, t, root - 24 + seq[(i / 2) % 8], sixteenth * 1.8, 0.8);
  } else if (b.mode === 'bossa' && hit('x--x--x-x--x--x-')) play(b.inst, t, root - 24 + ([3, 9].includes(i) || i > 7 ? 7 : 0), sixteenth * 2.5, 0.8);
  else if (b.mode === 'octave' && i % 2 === 0) play(b.inst, t, root - 24 + (i % 4 === 2 ? 12 : 0), sixteenth * 1.5, 0.9);
  else if (b.mode === 'pulse' && i % 2 === 0) play(b.inst, t, root - 24, sixteenth * 1.4, 0.8);
  else if (b.mode === 'lazy' && hit('x-------x--x----')) play(b.inst, t, root - 24 + (i === 11 ? 7 : 0), spb * 1.5, 0.9);

  if (auction) return;   // tension: just the rhythm section
  // Chords.
  const c = s.comp;
  if (c.pad) { if (i === 0) for (const n of chordNotes.slice(0, 4)) play(c.inst, t, n, spb * 4 - 0.05, c.vel); }
  if (c.stab && hit(c.stab) && !night) for (const n of chordNotes.slice(0, 3)) play('pluck', t, n + 12, sixteenth, 0.5);
  if (c.arp && !night) play('pluck', t, chordNotes[i % chordNotes.length] + 12 + (i >= 8 ? 12 : 0), sixteenth, 0.35);
  if (!c.pad && hit(c.pat)) {
    if (c.stride && i % 8 === 0) play(c.inst, t, root - 12, spb * 0.8, c.vel);
    for (const n of chordNotes.slice(c.stride ? 1 : 0)) play(c.inst, t, n + c.oct, sixteenth * (c.inst === 'vibes' ? 3 : 1.6), c.vel);
  }
  // Melody: the motif for this section, re-harmonised to each chord.
  if (mood.title && sec === 1) return;
  const lead = night && s.night?.lead ? s.night.lead : s.lead.inst;
  const mot = song.form[sec] === 'B' ? song.bMotif : song.motif;
  const pos = (bar % 2) * 16 + i;
  const n = mot.find(x => x.i === pos);
  if (n && rand() > s.lead.rests * (night ? 1.5 : 1)) {
    const m = melodyNote(chord.root, chord.q, n.deg + (song.form[sec] === 'B' ? 1 : 0), n.tone, s.lead.oct);
    play(lead, t, m, sixteenth * n.len * 0.95, night ? 0.45 : 0.6, s.lead.glide || rand() < 0.15 ? { from: lastLead } : {});
    lastLead = m;
  }
}

function schedule() {
  if (!A || !style) return;
  const ahead = A.currentTime + 0.25;
  while (nextT < ahead) {
    const spb = 60 / (style.bpm * (mood.auction ? 1.12 : 1));
    const i = step % 16;
    // Swing: push the off-beat sixteenths later.
    const swing = i % 2 === 1 ? (style.swing - 0.5) * (spb / 2) : 0;
    try { tick(nextT + swing, step); } catch (e) { /* a dropped note is fine */ }
    nextT += spb / 4;
    step++;
    if (step % (16 * song.bars.length * song.form.length) === 0) {
      song.loops++;
      if (song.loops >= 2) song = compose();
    }
  }
}

function start() {
  if (!on || !setup() || !eraNow) return;
  if (A.state === 'suspended') A.resume();
  if (timer) return;
  style = STYLES[eraNow];
  rng = (Math.random() * 2 ** 32) >>> 0;
  song = compose();
  step = 0;
  nextT = A.currentTime + 0.1;
  out.gain.cancelScheduledValues(A.currentTime);
  out.gain.setValueAtTime(0.0001, A.currentTime);
  out.gain.exponentialRampToValueAtTime(vol * 0.75, A.currentTime + 2.5);
  timer = setInterval(schedule, 50);
}
function stop(fade = 0.6) {
  if (!timer) return;
  clearInterval(timer); timer = null;
  if (A && out) { out.gain.cancelScheduledValues(A.currentTime); out.gain.setTargetAtTime(0.0001, A.currentTime, fade / 4); }
}

// Called every frame by the app: cheap unless something changed.
export function musicUpdate(era, m = {}) {
  const changed = era !== eraNow;
  mood.night = !!m.night; mood.auction = !!m.auction; mood.title = !!m.title;
  if (changed) {
    const was = eraNow;
    eraNow = era;
    if (!on) return;
    if (timer) { stop(1.2); setTimeout(() => { if (eraNow === era) start(); }, was ? 1300 : 0); }
    else start();
  }
}
// Render an era offline (for tests and previews): fills an OfflineAudioContext.
export function renderEra(offline, era, seconds, m = {}) {
  const keep = { A, out, verb, verbIn, dly, noise, timer, style, song, eraNow, mood, step, nextT };
  setup(offline);
  out.gain.value = vol * 0.75;
  mood = { night: !!m.night, auction: !!m.auction, title: !!m.title };
  style = STYLES[era]; eraNow = era;
  rng = (m.seed || 7) >>> 0;
  song = compose(); step = 0; nextT = 0.05;
  const real = A;
  // Schedule everything up front against a moving horizon.
  for (let horizon = 0.25; horizon < seconds; horizon += 0.25) {
    while (nextT < horizon) {
      const spb = 60 / (style.bpm * (mood.auction ? 1.12 : 1)), i = step % 16;
      const swing = i % 2 === 1 ? (style.swing - 0.5) * (spb / 2) : 0;
      tick(nextT + swing, step);
      nextT += spb / 4; step++;
      if (step % (16 * song.bars.length * song.form.length) === 0 && ++song.loops >= 2) song = compose();
    }
  }
  ({ A, out, verb, verbIn, dly, noise, timer, style, song, eraNow, mood, step, nextT } = keep);
  return real;
}

// Browsers only allow sound after a tap.
export function unlockMusic() { if (on && eraNow && !timer) start(); else if (A?.state === 'suspended') A.resume(); }
export function pauseMusic(hidden) {
  if (!A) return;
  if (hidden) A.suspend(); else if (on) A.resume();
}
