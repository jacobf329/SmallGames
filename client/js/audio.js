// Tiny WebAudio kit - every sound is synthesised, so there are no assets to
// download over the LAN.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur = 0.1, type = 'square', vol = 0.5, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur = 0.2, vol = 0.4, filter = 900) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = filter;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
  }

  coin()      { this.tone(1180, 0.06, 'square', 0.25); setTimeout(() => this.tone(1560, 0.08, 'square', 0.22), 45); }
  box()       { this.tone(520, 0.07, 'triangle', 0.3); setTimeout(() => this.tone(880, 0.12, 'triangle', 0.3), 60); }
  jump()      { this.tone(420, 0.12, 'sine', 0.3, 420); }
  slide()     { this.noise(0.18, 0.25, 1600); }
  hit()       { this.noise(0.35, 0.7, 500); this.tone(120, 0.3, 'sawtooth', 0.4, -70); }
  shield()    { this.tone(700, 0.18, 'sine', 0.35, 500); }
  boost()     { this.tone(260, 0.32, 'sawtooth', 0.32, 900); }
  shell()     { this.tone(880, 0.2, 'square', 0.28, -500); }
  bolt()      { this.noise(0.4, 0.5, 2600); this.tone(1400, 0.3, 'sawtooth', 0.25, -1100); }
  star()      { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.3), i * 70)); }
  count(n)    { this.tone(n > 0 ? 560 : 900, n > 0 ? 0.14 : 0.4, 'square', 0.4); }
  finish()    { [784, 988, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.4), i * 110)); }
  smash()     { this.noise(0.2, 0.5, 1800); }
}
