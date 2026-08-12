// Every sound here is synthesized on the fly — the game ships no audio files and
// works with the network cut.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  tone(freq, dur, { type = 'sine', gain = 0.3, to = null, delay = 0, sweep = 'exp' } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) {
      if (sweep === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
      else osc.frequency.linearRampToValueAtTime(Math.max(20, to), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(dur, { gain = 0.2, freq = 900, q = 1, delay = 0 } = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  jump()    { this.tone(340, 0.16, { type: 'triangle', to: 620, gain: 0.16 }); }
  land()    { this.noise(0.09, { gain: 0.1, freq: 260, q: 0.9 }); }
  crystal() { [0, 0.07, 0.14].forEach((d, i) => this.tone([784, 988, 1319][i], 0.3, { type: 'sine', gain: 0.16, delay: d })); }
  plateOn() { this.tone(520, 0.1, { type: 'square', gain: 0.08 }); this.noise(0.05, { gain: 0.06, freq: 1800 }); }
  plateOff(){ this.tone(300, 0.09, { type: 'square', gain: 0.06 }); }
  door()    { this.tone(150, 0.5, { type: 'sawtooth', to: 74, gain: 0.09 }); this.noise(0.45, { gain: 0.05, freq: 420, q: 0.6 }); }
  switchIt(){ this.tone(220, 0.12, { type: 'square', gain: 0.11, to: 330 }); this.noise(0.06, { gain: 0.09, freq: 700 }); }
  hazard()  { this.tone(180, 0.35, { type: 'sawtooth', to: 60, gain: 0.16 }); this.noise(0.3, { gain: 0.12, freq: 260, q: 0.5 }); }
  rewind()  {
    this.tone(1250, 0.62, { type: 'sawtooth', to: 110, gain: 0.13 });
    this.tone(930, 0.62, { type: 'sine', to: 82, gain: 0.09 });
    this.noise(0.5, { gain: 0.1, freq: 1400, q: 0.4 });
  }
  bank()    { this.tone(420, 0.28, { type: 'triangle', to: 840, gain: 0.12 }); }
  arm()     { [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', gain: 0.1, delay: i * 0.05 })); }
  win()     { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 1.1, { type: 'triangle', gain: 0.12, delay: i * 0.1 })); }
}
