// Everything the diver hears is conducted through the suit, so the whole bus runs
// through a lowpass — nothing out here travels through vacuum.
export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.breathPhase = 0;
    this.breathRate = 4.2;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();

    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0.75;
    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 2600;
    this.bus.connect(this.lp).connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Continuous tether servo, gated by gain.
    this.servoGain = this.ctx.createGain();
    this.servoGain.gain.value = 0;
    const servo = this.ctx.createOscillator();
    servo.type = 'sawtooth';
    servo.frequency.value = 148;
    const servoLp = this.ctx.createBiquadFilter();
    servoLp.type = 'bandpass';
    servoLp.frequency.value = 620;
    servoLp.Q.value = 5;
    servo.connect(servoLp).connect(this.servoGain).connect(this.bus);
    servo.start();
    this.servoOsc = servo;

    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  now() { return this.ctx.currentTime; }

  noiseSource(dur, filterType, freq, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    src.connect(f).connect(g).connect(this.bus);
    src.start();
    src.stop(this.now() + dur);
    return g;
  }

  hiss(strength = 1) {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const g = this.noiseSource(0.4, 'bandpass', 1900 + Math.random() * 600, 1.2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * strength, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  }

  thump(force = 1) {
    if (!this.ready || this.muted) return;
    // WebAudio throws on a non-finite param, which would abort the caller's
    // whole event loop for that frame. Never let one through.
    const f = Number.isFinite(force) ? Math.max(0, Math.min(1, force)) : 0.5;
    force = f;
    const t = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 + 70 * force, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.min(0.5, 0.16 + 0.3 * force), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.36);

    const n = this.noiseSource(0.2, 'lowpass', 500 + 900 * force);
    n.gain.setValueAtTime(0.09 * force, t);
    n.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  }

  clang() {
    if (!this.ready || this.muted) return;
    const t = this.now();
    [318, 472, 706, 921].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f * (1 + Math.random() * 0.03);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 / (i + 1), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 + i * 0.1);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.9);
    });
  }

  chirp(up = true) {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(up ? 620 : 900, t);
    o.frequency.exponentialRampToValueAtTime(up ? 980 : 480, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.18);
  }

  chord(freqs = [196, 294, 392], dur = 1.1) {
    if (!this.ready || this.muted) return;
    const t = this.now();
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.06 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  }

  alarm() {
    if (!this.ready || this.muted) return;
    const t = this.now();
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = 880;
      const s = t + i * 0.17;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.035, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
      o.connect(g).connect(this.bus);
      o.start(s);
      o.stop(s + 0.12);
    }
  }

  kick(power) {
    if (!this.ready || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 + 0.2 * power, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.42);
    const n = this.noiseSource(0.3, 'lowpass', 700);
    n.gain.setValueAtTime(0.07, t);
    n.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  }

  servo(amount) {
    if (!this.ready) return;
    const target = this.muted ? 0 : amount * 0.05;
    this.servoGain.gain.setTargetAtTime(target, this.now(), 0.05);
    this.servoOsc.frequency.setTargetAtTime(140 + amount * 130, this.now(), 0.08);
  }

  // Breathing is the O2 gauge you hear: it quickens as the tank empties.
  updateBreath(dt, o2Fraction, stress) {
    if (!this.ready || this.muted) return;
    const rate = 4.4 - 2.6 * (1 - o2Fraction) - stress * 0.9;
    this.breathPhase += dt;
    if (this.breathPhase >= Math.max(1.2, rate)) {
      this.breathPhase = 0;
      const t = this.now();
      const inhale = this.noiseSource(0.9, 'bandpass', 480, 0.9);
      const peak = 0.035 + (1 - o2Fraction) * 0.03;
      inhale.gain.setValueAtTime(0.0001, t);
      inhale.gain.linearRampToValueAtTime(peak, t + 0.3);
      inhale.gain.linearRampToValueAtTime(0.0001, t + 0.62);
      const exhale = this.noiseSource(0.9, 'bandpass', 300, 0.8);
      exhale.gain.setValueAtTime(0.0001, t + 0.68);
      exhale.gain.linearRampToValueAtTime(peak * 0.7, t + 0.9);
      exhale.gain.linearRampToValueAtTime(0.0001, t + 1.3);
    }
  }
}
