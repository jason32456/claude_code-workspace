// Everything is synthesised — the folder ships no audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.budget = 0;
    this.muted = false;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
  }

  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  }

  tick(dt) { this.budget = Math.min(9, this.budget + dt * 26); }

  spend() {
    if (!this.ctx || this.muted || this.budget < 1) return false;
    this.budget -= 1;
    return true;
  }

  blip({ type = 'square', freq = 440, to = 220, dur = 0.12, gain = 0.25, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise({ dur = 0.3, gain = 0.3, freq = 700, q = 1, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
  }

  zap() { if (this.spend()) this.blip({ type: 'sawtooth', freq: 1400, to: 420, dur: 0.07, gain: 0.10 }); }
  arc() { if (this.spend()) this.blip({ type: 'square', freq: 900, to: 180, dur: 0.13, gain: 0.09 }); }
  thud() { if (this.spend()) this.noise({ dur: 0.34, gain: 0.30, freq: 420 }); }
  kill() { if (this.spend()) this.blip({ type: 'triangle', freq: 320, to: 90, dur: 0.11, gain: 0.10 }); }
  place() { this.blip({ type: 'triangle', freq: 300, to: 620, dur: 0.12, gain: 0.2 }); }
  deny() { this.blip({ type: 'sawtooth', freq: 180, to: 90, dur: 0.16, gain: 0.16 }); }
  leak() { this.noise({ dur: 0.6, gain: 0.4, freq: 260 }); this.blip({ type: 'sawtooth', freq: 160, to: 55, dur: 0.5, gain: 0.2 }); }
  wave() {
    this.blip({ type: 'sawtooth', freq: 110, to: 220, dur: 0.5, gain: 0.18 });
    this.blip({ type: 'square', freq: 220, to: 330, dur: 0.4, gain: 0.10, delay: 0.12 });
  }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.blip({ type: 'triangle', freq: f, to: f, dur: 0.4, gain: 0.16, delay: i * 0.13 })); }
  lose() { [330, 262, 196, 130].forEach((f, i) => this.blip({ type: 'sawtooth', freq: f, to: f * 0.7, dur: 0.55, gain: 0.16, delay: i * 0.2 })); }
}
