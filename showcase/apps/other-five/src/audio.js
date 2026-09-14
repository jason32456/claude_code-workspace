// Every sound in the game is synthesised here. No audio files.
//
// The bed is two layers of filtered noise (surge + hiss) plus a heartbeat whose
// rate follows oxygen debt — an octopus's systemic hearts stop while it jets, so
// the heartbeat going quiet and then hammering is the debt readout you hear.

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.beatPhase = 0;
    this.beatRate = 0.75;
    this.muted = false;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    // A gentle low-pass over everything: we are underwater.
    this.water = ctx.createBiquadFilter();
    this.water.type = 'lowpass';
    this.water.frequency.value = 1400;
    this.water.Q.value = 0.4;
    this.water.connect(this.master);

    this.noiseBuf = this._noiseBuffer(4);

    // Surge: brown-ish noise through a slow-sweeping low-pass.
    const surge = ctx.createBufferSource();
    surge.buffer = this.noiseBuf; surge.loop = true;
    const surgeF = ctx.createBiquadFilter();
    surgeF.type = 'lowpass'; surgeF.frequency.value = 150; surgeF.Q.value = 1.2;
    const surgeG = ctx.createGain(); surgeG.gain.value = 0.5;
    surge.connect(surgeF).connect(surgeG).connect(this.master);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain(); lfoG.gain.value = 70;
    lfo.connect(lfoG).connect(surgeF.frequency);
    surge.start(); lfo.start();

    // Distant hiss — the reef itself, snapping shrimp and all.
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuf; hiss.loop = true;
    const hissF = ctx.createBiquadFilter();
    hissF.type = 'bandpass'; hissF.frequency.value = 2600; hissF.Q.value = 0.6;
    this.hissG = ctx.createGain(); this.hissG.gain.value = 0.012;
    hiss.connect(hissF).connect(this.hissG).connect(this.master);
    hiss.start();

    this.ready = true;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;   // brown-ish
      d[i] = last * 3.2 + white * 0.25;
    }
    return buf;
  }

  _noise(dur, { type = 'bandpass', f0 = 800, f1 = 800, q = 1, gain = 0.3, delay = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.water);
    src.start(t); src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, { type = 'sine', gain = 0.2, slideTo = null, delay = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.water);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ── the bed ──────────────────────────────────────────────────────────────
  update(dt, { debt = 0, danger = 0, depthTint = 0 } = {}) {
    if (!this.ready) return;
    this.water.frequency.value = 1400 - depthTint * 600;
    this.hissG.gain.value = 0.012 + danger * 0.01;

    // Hearts stop while the debt is being run up; then they hammer to repay it.
    this.beatRate = 0.7 + debt * 1.9 + danger * 0.5;
    this.beatPhase += dt * this.beatRate;
    if (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      const amp = 0.10 + debt * 0.30 + danger * 0.10;
      this._tone(52, 0.16, { type: 'sine', gain: amp, slideTo: 34 });
      this._tone(46, 0.13, { type: 'sine', gain: amp * 0.6, slideTo: 30, delay: 0.19 });
    }
  }

  // ── one-shots ────────────────────────────────────────────────────────────
  jet() { this._noise(0.55, { type: 'lowpass', f0: 900, f1: 120, q: 0.7, gain: 0.34 }); }
  step() { this._noise(0.09, { type: 'bandpass', f0: 420, f1: 260, q: 1.4, gain: 0.035 }); }
  grip() { this._noise(0.08, { type: 'bandpass', f0: 1500, f1: 700, q: 2.4, gain: 0.10 }); }
  snatch() { this._noise(0.13, { type: 'bandpass', f0: 2200, f1: 500, q: 1.6, gain: 0.16 }); }
  crabClick() { this._noise(0.04, { type: 'bandpass', f0: 3200, f1: 2600, q: 6, gain: 0.10 }); }
  crack() {
    this._noise(0.07, { type: 'bandpass', f0: 2600, f1: 900, q: 3, gain: 0.28 });
    this._noise(0.25, { type: 'lowpass', f0: 500, f1: 90, q: 1, gain: 0.14, delay: 0.03 });
  }
  eat() {
    this._tone(320, 0.14, { type: 'triangle', gain: 0.13, slideTo: 520 });
    this._tone(520, 0.20, { type: 'sine', gain: 0.10, slideTo: 780, delay: 0.09 });
  }
  ink() {
    this._noise(0.7, { type: 'lowpass', f0: 600, f1: 70, q: 0.6, gain: 0.30 });
    this._tone(90, 0.5, { type: 'sine', gain: 0.10, slideTo: 40 });
  }
  bite() {
    this._noise(0.3, { type: 'lowpass', f0: 1400, f1: 90, q: 1, gain: 0.5 });
    this._tone(70, 0.5, { type: 'sawtooth', gain: 0.16, slideTo: 32 });
  }
  sever() {
    this._noise(0.5, { type: 'bandpass', f0: 900, f1: 130, q: 1.2, gain: 0.42 });
    this._tone(180, 0.7, { type: 'triangle', gain: 0.12, slideTo: 48 });
  }
  alarm() {
    this._tone(140, 0.9, { type: 'sawtooth', gain: 0.10, slideTo: 92 });
    this._tone(93, 1.1, { type: 'sine', gain: 0.14, slideTo: 66, delay: 0.05 });
  }
  notice() { this._tone(210, 0.35, { type: 'sine', gain: 0.09, slideTo: 150 }); }
  squeeze() { this._noise(0.4, { type: 'bandpass', f0: 300, f1: 900, q: 1.8, gain: 0.07 }); }
  chime(n = 0) {
    const base = 440 * Math.pow(2, n / 12);
    this._tone(base, 0.5, { type: 'sine', gain: 0.10 });
    this._tone(base * 1.5, 0.4, { type: 'sine', gain: 0.05, delay: 0.04 });
  }
  dawn() {
    [0, 4, 7, 11].forEach((s, i) =>
      this._tone(220 * Math.pow(2, s / 12), 2.2, { type: 'sine', gain: 0.07, delay: i * 0.18 }));
  }
  fail() {
    [0, -3, -7, -12].forEach((s, i) =>
      this._tone(196 * Math.pow(2, s / 12), 1.6, { type: 'triangle', gain: 0.10, delay: i * 0.22 }));
  }
}
