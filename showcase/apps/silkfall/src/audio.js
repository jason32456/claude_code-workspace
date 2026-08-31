// Everything is synthesised at runtime — no samples ship with the game. Silk
// plucks are pitched by strand length so a long frame answers lower than a short
// capture thread, which is most of the web's voice.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.buzzNodes = null;
  }

  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        this.enabled = false;
        return;
      }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  ok() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  env(node, t0, attack, decay, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  pluck(len = 6, amp = 0.5) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const freq = 620 / Math.max(1.2, len) + 90;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq * 1.6, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq * 2;
    f.Q.value = 3;
    this.env(g, t, 0.004, 0.28, 0.12 * amp);
    osc.connect(f).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  snap(len = 6) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, 0.24, 0.26);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.3);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340 / Math.max(1, len * 0.3), t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.25);
    const g2 = this.ctx.createGain();
    this.env(g2, t, 0.004, 0.26, 0.14);
    osc.connect(g2).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  snagged(kind) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const base = kind === 'beetle' ? 90 : kind === 'wasp' ? 150 : 220;
    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * (1 + i * 0.5), t);
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 26 + i * 9;
      const lg = this.ctx.createGain();
      lg.gain.value = base * 0.4;
      lfo.connect(lg).connect(osc.frequency);
      const g = this.ctx.createGain();
      this.env(g, t, 0.02, 0.6, 0.07);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      osc.connect(f).connect(g).connect(this.master);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 0.7);
      lfo.stop(t + 0.7);
    }
  }

  waspDive() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.5);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 42;
    const lg = this.ctx.createGain();
    lg.gain.value = 60;
    lfo.connect(lg).connect(osc.frequency);
    const g = this.ctx.createGain();
    this.env(g, t, 0.05, 0.55, 0.1);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 1.4;
    osc.connect(f).connect(g).connect(this.master);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.7);
    lfo.stop(t + 0.7);
  }

  sting() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, 0.3, 0.22);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  wrap() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.3);
    f.Q.value = 2;
    const g = this.ctx.createGain();
    this.env(g, t, 0.05, 0.3, 0.12);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.45);
  }

  feed() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [392, 523.25, 659.25].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, t + i * 0.06, 0.01, 0.3, 0.09);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.4);
    });
  }

  escape() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.4);
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, 0.4, 0.1);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  spin() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2800, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    f.Q.value = 4;
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, 0.18, 0.09);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.3);
  }

  deny() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 150;
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, 0.11, 0.06);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  gust(strength = 1) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(900, t + 1.4);
    f.frequency.linearRampToValueAtTime(240, t + 3.4);
    f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * strength, t + 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t + 3.6);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 3.8);
  }

  chime(kind) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const set = kind === 'dawn' ? [523.25, 659.25, 783.99] : kind === 'lose' ? [220, 174.61, 130.81] : [261.63, 329.63, 392, 523.25];
    set.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, t + i * 0.16, 0.03, 1.0, 0.1);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.16);
      osc.stop(t + i * 0.16 + 1.2);
    });
  }
}
