// Leftover Uprising - synthesised kitchen sounds, no audio files.
let ac = null, master = null, noise = null, on = true, last = {};
function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.4; master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
// Many towers fire at once: don't play the same sound more than ~12 times a second.
const gate = (k, ms = 80) => { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return on; };
function burst(dur, freq, vol, type = 'lowpass') {
  const a = ctx(); if (!a) return;
  const t = a.currentTime, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noise; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
}
function tone(freq, dur, vol, type = 'square', slide = 1) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  unlock() { ctx(); },
  set enabled(v) { on = v; }, get enabled() { return on; },
  shot(tree) {
    if (!gate('shot' + tree)) return;
    if (tree === 'heat') burst(0.12, 900, 0.12);
    else if (tree === 'chop') tone(1400, 0.05, 0.06, 'triangle', 0.6);
    else if (tree === 'cold') burst(0.1, 4000, 0.06, 'highpass');
    else if (tree === 'sticky') tone(220, 0.08, 0.06, 'sine', 0.5);
    else tone(700, 0.04, 0.04, 'square', 0.8);
  },
  pop() { if (gate('pop', 60)) tone(600 + Math.random() * 400, 0.07, 0.07, 'sine', 1.8); },
  build() { if (on) { tone(500, 0.06, 0.1, 'triangle'); setTimeout(() => tone(750, 0.08, 0.1, 'triangle'), 60); } },
  coin() { if (gate('coin', 120)) { tone(1320, 0.05, 0.06, 'square'); setTimeout(() => tone(1760, 0.07, 0.06, 'square'), 50); } },
  combo() { if (gate('combo', 150)) [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.1, 0.09, 'triangle'), i * 50)); },
  leak() { if (gate('leak', 200)) tone(200, 0.3, 0.15, 'sawtooth', 0.5); },
  wave() { if (on) [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.1, 'square'), i * 110)); },
  boss() { if (on) [196, 185, 175, 165].forEach((f, i) => setTimeout(() => tone(f, 0.3, 0.14, 'sawtooth'), i * 220)); },
  nope() { if (gate('nope', 150)) tone(160, 0.12, 0.1, 'square'); },
};
