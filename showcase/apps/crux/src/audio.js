export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.035;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    const breath = ctx.createGain();
    breath.gain.value = 0;
    this.breathGain = breath;
    breath.connect(this.master);
    this.breathFilter = ctx.createBiquadFilter();
    this.breathFilter.type = 'bandpass';
    this.breathFilter.frequency.value = 700;
    this.breathFilter.Q.value = 1.2;
    const bs = ctx.createBufferSource();
    bs.buffer = buf;
    bs.loop = true;
    bs.connect(this.breathFilter).connect(breath);
    bs.start();

    this.ready = true;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  get t() {
    return this.ctx.currentTime;
  }

  burst({ freq = 300, q = 1, dur = 0.18, gain = 0.3, type = 'bandpass', sweep = 0 }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, this.t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), this.t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    src.stop(this.t + dur + 0.02);
  }

  tone({ freq = 440, dur = 0.3, gain = 0.15, type = 'sine', slide = 0 }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, this.t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), this.t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(gain, this.t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(this.t + dur + 0.02);
  }

  grab(type) {
    const pitch = type === 'jug' ? 180 : type === 'sloper' ? 900 : 420;
    this.burst({ freq: pitch, q: 1.4, dur: 0.11, gain: 0.34, sweep: 0.5 });
  }

  slip() {
    this.burst({ freq: 1800, q: 0.6, dur: 0.42, gain: 0.3, sweep: 0.25 });
  }

  breakHold() {
    this.burst({ freq: 260, q: 0.8, dur: 0.5, gain: 0.6, sweep: 0.2 });
    this.tone({ freq: 90, dur: 0.4, gain: 0.2, type: 'sawtooth', slide: 45 });
  }

  chalk() {
    this.burst({ freq: 3200, q: 0.5, dur: 0.3, gain: 0.16, type: 'highpass' });
  }

  dyno() {
    this.burst({ freq: 500, q: 0.4, dur: 0.3, gain: 0.22, sweep: 2.4 });
  }

  cam() {
    this.tone({ freq: 1400, dur: 0.18, gain: 0.12, type: 'triangle' });
    this.tone({ freq: 2100, dur: 0.12, gain: 0.07, type: 'sine' });
  }

  fall() {
    this.burst({ freq: 900, q: 0.35, dur: 1.6, gain: 0.42, sweep: 0.15 });
  }

  caught() {
    this.tone({ freq: 130, dur: 0.5, gain: 0.3, type: 'sawtooth', slide: 70 });
    this.burst({ freq: 700, q: 1, dur: 0.25, gain: 0.3, sweep: 0.4 });
  }

  summit() {
    const notes = [392, 523.25, 659.25, 784];
    notes.forEach((f, i) => setTimeout(() => this.tone({ freq: f, dur: 1.1, gain: 0.14, type: 'triangle' }), i * 150));
  }

  update(dt, pump, windStrength, exposure) {
    if (!this.ready) return;
    const now = this.t;
    this.windGain.gain.setTargetAtTime(0.02 + windStrength * 0.16 + exposure * 0.03, now, 0.4);
    this.windFilter.frequency.setTargetAtTime(340 + windStrength * 620 + exposure * 120, now, 0.5);

    this._phase = (this._phase || 0) + dt * (0.55 + (pump / 100) * 1.9);
    const cycle = Math.max(0, Math.sin(this._phase * Math.PI * 2));
    const amt = Math.max(0, (pump - 18) / 82);
    this.breathGain.gain.setTargetAtTime(cycle * cycle * amt * 0.07, now, 0.05);
    this.breathFilter.frequency.setTargetAtTime(520 + amt * 500, now, 0.2);
  }
}
