// Everything you hear is generated. There are no files in this project.

export class Audio {
  constructor() {
    this.ok = false;
    this.muted = false;
  }

  start() {
    if (this.ok) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.ok = true;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    // a low-pass we sweep shut when the octopus is underwater
    this.medium = this.ctx.createBiquadFilter();
    this.medium.type = 'lowpass';
    this.medium.frequency.value = 16000;
    this.medium.connect(this.master);

    this.noise = this.makeNoise();

    // room tone: pump hum two octaves down, plus filtered hiss
    this.hum = this.ctx.createGain();
    this.hum.gain.value = 0.055;
    this.hum.connect(this.medium);
    for (const f of [49, 98, 147]) {
      const o = this.ctx.createOscillator();
      o.type = f === 49 ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = f === 49 ? 0.35 : 0.12;
      o.connect(g); g.connect(this.hum); o.start();
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.13 + Math.random() * 0.1;
      const lg = this.ctx.createGain(); lg.gain.value = 0.05;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
    }

    const hiss = this.ctx.createBufferSource();
    hiss.buffer = this.noise; hiss.loop = true;
    const hf = this.ctx.createBiquadFilter();
    hf.type = 'bandpass'; hf.frequency.value = 620; hf.Q.value = 0.6;
    this.hissGain = this.ctx.createGain(); this.hissGain.gain.value = 0.035;
    hiss.connect(hf); hf.connect(this.hissGain); this.hissGain.connect(this.medium);
    hiss.start();

    this.heart = this.ctx.createGain();
    this.heart.gain.value = 0;
    this.heart.connect(this.master);
  }

  makeNoise() {
    const n = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.03 * w) / 1.03;
      d[i] = last * 3.2;
    }
    return buf;
  }

  env(node, a, d, peak = 1) {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    return g;
  }

  burst(freq, type, a, d, peak, dest) {
    if (!this.ok || this.muted) return;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.env(o, a, d, peak);
    g.connect(dest || this.medium);
    o.start(); o.stop(this.ctx.currentTime + a + d + 0.05);
    return o;
  }

  noiseBurst(f, q, a, d, peak) {
    if (!this.ok || this.muted) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    s.connect(bp);
    const g = this.env(bp, a, d, peak);
    g.connect(this.medium);
    s.start(); s.stop(this.ctx.currentTime + a + d + 0.05);
  }

  pop() { this.burst(180 + Math.random() * 90, 'sine', 0.004, 0.07, 0.16); }
  slip() { this.noiseBurst(2400, 1.2, 0.01, 0.22, 0.1); }
  jet() { this.noiseBurst(320, 0.5, 0.02, 0.5, 0.34); }
  splash() { this.noiseBurst(1400, 0.35, 0.01, 0.45, 0.22); }
  strain() {
    this.burst(70, 'sawtooth', 0.05, 0.4, 0.12);
    this.noiseBurst(240, 2.2, 0.04, 0.3, 0.12);
  }
  clack() { this.burst(900, 'square', 0.002, 0.09, 0.1); this.noiseBurst(3200, 1.5, 0.002, 0.11, 0.14); }
  chime(f = 640) { this.burst(f, 'triangle', 0.01, 0.5, 0.16); this.burst(f * 1.5, 'sine', 0.02, 0.4, 0.08); }
  alarm() {
    if (!this.ok || this.muted) return;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.burst(i % 2 ? 520 : 720, 'square', 0.01, 0.22, 0.14), i * 240);
    }
  }
  step() { this.noiseBurst(140, 1.0, 0.005, 0.14, 0.09); }

  // continuous state: underwater muffling and the pulse when you are close to
  // being caught or close to drowning
  frame(submerged, tension, dt) {
    if (!this.ok) return;
    const f = submerged ? 420 : 16000;
    this.medium.frequency.value += (f - this.medium.frequency.value) * Math.min(1, dt * 3);
    this.hissGain.gain.value = submerged ? 0.06 : 0.03;
    this._beat = (this._beat || 0) - dt * (0.9 + tension * 1.8);
    if (tension > 0.25 && this._beat <= 0) {
      this._beat = 1;
      this.burst(58, 'sine', 0.02, 0.16, 0.06 + tension * 0.14, this.master);
      setTimeout(() => this.burst(46, 'sine', 0.02, 0.2, 0.04 + tension * 0.1, this.master), 150);
    }
  }
}
