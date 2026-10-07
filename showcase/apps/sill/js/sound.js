// A few synthesised cues. Nothing is sampled; everything is oscillators and
// filtered noise, created on the first user gesture.

const KEY = 'sill.muted';
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem(KEY) === '1'; } catch {}
    this.gurgleNode = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 0.55;
    this.out.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(KEY, m ? '1' : '0'); } catch {}
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  ok() { return this.ctx && !this.muted && this.ctx.state === 'running'; }

  tone(freq, t0, dur, gain, type = 'sine') {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noiseBurst(t0, dur, f0, f1, gain, q = 1) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t0);
    bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.05);
  }

  pop() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.tone(660, t, 0.12, 0.12, 'triangle');
    this.tone(990, t + 0.04, 0.14, 0.08, 'sine');
  }

  whoosh() {
    if (!this.ok()) return;
    this.noiseBurst(this.ctx.currentTime, 0.5, 1800, 260, 0.35, 0.8);
  }

  bloom(i = 0) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const base = 392 * Math.pow(2, PENTA[(i * 3) % PENTA.length] / 12);
    [0, 4, 7, 12].forEach((s, k) => {
      const f = base * Math.pow(2, s / 12);
      this.tone(f, t + k * 0.07, 1.6, 0.07, 'sine');
      this.tone(f * 2.01, t + k * 0.07, 0.7, 0.02, 'sine');
    });
  }

  fanfare() {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + 0.3;
    PENTA.slice(0, 6).forEach((s, k) => {
      const f = 523.25 * Math.pow(2, s / 12);
      this.tone(f, t + k * 0.09, 1.2, 0.06, 'triangle');
    });
  }

  gurgle(on) {
    if (!this.ctx) return;
    if (on && !this.gurgleNode && !this.muted) {
      const c = this.ctx;
      const s = c.createBufferSource();
      s.buffer = this.noise; s.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 6;
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 7; lg.gain.value = 220;
      lfo.connect(lg).connect(bp.frequency);
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.22, c.currentTime, 0.05);
      s.connect(bp).connect(g).connect(this.out);
      s.start(); lfo.start();
      this.gurgleNode = { s, lfo, g };
    } else if (!on && this.gurgleNode) {
      const { s, lfo, g } = this.gurgleNode;
      const t = this.ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.06);
      s.stop(t + 0.4); lfo.stop(t + 0.4);
      this.gurgleNode = null;
    }
  }
}
