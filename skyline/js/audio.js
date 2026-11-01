// Skyline Hustle - tiny synthesised sound effects. No audio files.
let ac = null;
let enabled = true;

export function setSound(on) { enabled = on; }
export function soundOn() { return enabled; }

export const audioCtx = () => ctx();

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, start, dur, type = 'sine', vol = 0.12, slide = 0) {
  const a = ctx();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  tap()    { if (enabled) tone(660, 0, 0.05, 'triangle', 0.05); },
  buy()    { if (enabled) { tone(988, 0, 0.08, 'square', 0.06); tone(1319, 0.07, 0.18, 'square', 0.06); } },
  build()  { if (enabled) { tone(220, 0, 0.08, 'sawtooth', 0.06); tone(330, 0.08, 0.08, 'sawtooth', 0.06); tone(440, 0.16, 0.16, 'triangle', 0.08); } },
  set()    { if (enabled) [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.09)); },
  error()  { if (enabled) tone(180, 0, 0.18, 'sawtooth', 0.06, 0.7); },
  offer()  { if (enabled) { tone(784, 0, 0.1, 'sine', 0.08); tone(587, 0.12, 0.16, 'sine', 0.08); } },
  coin()   { if (enabled) tone(1568, 0, 0.06, 'square', 0.025); },
  bad()    { if (enabled) { tone(300, 0, 0.2, 'triangle', 0.08, 0.6); } },
  win()    { if (enabled) [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.12, 0.4, 'triangle', 0.1)); },
};
