// Every sound is synthesised at runtime: wind, the collective wingbeat of the
// flock (which literally scales with how many birds are left), peregrine cries,
// alarm calls and the roost.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
  }

  noiseBuffer(seconds = 2) {
    const n = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.started = true;
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    const nb = this.noiseBuffer();

    // wind
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = nb;
    this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.windSrc.start();

    // collective wingbeat — bandpassed noise with a beating amplitude
    this.wingSrc = ctx.createBufferSource();
    this.wingSrc.buffer = nb;
    this.wingSrc.loop = true;
    this.wingFilter = ctx.createBiquadFilter();
    this.wingFilter.type = 'bandpass';
    this.wingFilter.frequency.value = 1150;
    this.wingFilter.Q.value = 1.1;
    this.wingGain = ctx.createGain();
    this.wingGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.55;
    lfo.connect(lfoGain).connect(this.wingGain.gain);
    lfo.start();
    this.wingLfo = lfo;
    this.wingSrc.connect(this.wingFilter).connect(this.wingGain).connect(this.master);
    this.wingSrc.start();
    this.nb = nb;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.9 : 0;
  }

  ambience(speed, birds, light) {
    if (!this.started || !this.enabled) return;
    if (!Number.isFinite(speed) || !Number.isFinite(birds) || !Number.isFinite(light)) return;
    const t = this.ctx.currentTime;
    const w = Math.min(0.28, 0.03 + speed * 0.006);
    this.windGain.gain.setTargetAtTime(w, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 14, t, 0.5);
    const wing = Math.min(0.19, birds / 5200);
    this.wingGain.gain.setTargetAtTime(wing, t, 0.35);
    this.wingLfo.frequency.setTargetAtTime(9.5 + Math.min(6, speed * 0.12), t, 0.4);
    this.wingFilter.frequency.setTargetAtTime(900 + light * 500, t, 0.6);
  }

  blip(freq, dur, type = 'sine', gain = 0.12, slideTo = null) {
    if (!this.started || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  cry() {
    // peregrine "kak-kak-kak"
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this.blip(1650 - i * 40, 0.1, 'sawtooth', 0.055, 980), i * 105);
    }
  }

  lockCry() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.blip(1850, 0.07, 'square', 0.04, 1250), i * 78);
    }
  }

  alarm() {
    for (let i = 0; i < 7; i++) {
      setTimeout(() => this.blip(2400 + Math.random() * 900, 0.05, 'triangle', 0.05, 1500), i * 32);
    }
    this.burst(0.25, 2600, 0.1);
  }

  burst(dur, freq, gain) {
    if (!this.started || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.nb;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(180, freq * 0.28), t + dur);
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  whoosh() { this.burst(0.5, 900, 0.22); }

  feed() { this.blip(720, 0.12, 'sine', 0.05, 1080); }

  recruit() { this.blip(540, 0.16, 'sine', 0.045, 810); }

  roost() {
    if (!this.started || !this.enabled) return;
    const base = [174.6, 220, 261.6, 329.6];
    base.forEach((f, i) => {
      setTimeout(() => this.blip(f, 2.6, 'sine', 0.07), i * 260);
      setTimeout(() => this.blip(f * 2, 2.0, 'sine', 0.03), i * 260 + 90);
    });
  }

  fail() {
    [220, 174.6, 146.8, 110].forEach((f, i) => setTimeout(() => this.blip(f, 1.1, 'sine', 0.07), i * 210));
  }

  ui() { this.blip(680, 0.07, 'sine', 0.05, 900); }
}
