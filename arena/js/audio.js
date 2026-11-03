// Blockout Arena - synthesised sounds, no audio files.

let ac = null, master = null, noise = null;
function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

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
  shot(near = 1) { burst(0.09, 2600, 0.35 * near); tone(180, 0.07, 0.12 * near, 'square', 0.5); },
  hit(head) { tone(head ? 1500 : 1100, 0.06, 0.12, 'triangle'); },
  hurt() { burst(0.18, 500, 0.4); tone(90, 0.15, 0.2, 'sawtooth', 0.6); },
  kill() { [880, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.12, 0.12, 'triangle'), i * 70)); },
  died() { tone(220, 0.5, 0.18, 'sawtooth', 0.4); },
  reload() { tone(400, 0.05, 0.08, 'square'); setTimeout(() => tone(600, 0.05, 0.08, 'square'), 180); },
  jump() { tone(300, 0.08, 0.05, 'sine', 1.6); },
  spawn() { tone(520, 0.2, 0.08, 'sine', 1.8); },
};
