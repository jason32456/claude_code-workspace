// Every sound is generated. The motors track their actual rate, so the machine
// tells you how hard you are driving it without you looking at anything.
export class Audio {
  constructor() {
    this.ok = false;
  }

  start() {
    if (this.ok) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    this.noise = this._noiseBuffer();

    // wind: filtered noise whose band opens as it freshens
    this.windSrc = this.ctx.createBufferSource();
    this.windSrc.buffer = this.noise;
    this.windSrc.loop = true;
    this.windFilt = this.ctx.createBiquadFilter();
    this.windFilt.type = 'bandpass';
    this.windFilt.frequency.value = 380;
    this.windFilt.Q.value = 0.8;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilt).connect(this.windGain).connect(this.master);
    this.windSrc.start();

    this.slewMotor = this._motor(58, 'sawtooth', 420);
    this.hoistMotor = this._motor(84, 'square', 700);

    // site room tone
    const rum = this.ctx.createBufferSource();
    rum.buffer = this.noise; rum.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 90;
    const rg = this.ctx.createGain(); rg.gain.value = 0.11;
    rum.connect(lp).connect(rg).connect(this.master);
    rum.start();

    this.ok = true;
  }

  _noiseBuffer() {
    const n = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _motor(freq, type, cut) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cut;
    const g = this.ctx.createGain(); g.gain.value = 0;
    o.connect(f).connect(g).connect(this.master);
    o.start();
    return { o, g, base: freq };
  }

  frame(s) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const w = Math.min(1, s.wind / 17);
    this.windGain.gain.setTargetAtTime(0.03 + w * 0.30, t, 0.3);
    this.windFilt.frequency.setTargetAtTime(320 + w * 900, t, 0.3);
    this.windFilt.Q.setTargetAtTime(0.6 + w * 1.6, t, 0.3);

    const sl = Math.min(1, Math.abs(s.slewVel) / 0.24);
    this.slewMotor.g.gain.setTargetAtTime(sl * 0.075, t, 0.08);
    this.slewMotor.o.frequency.setTargetAtTime(this.slewMotor.base * (0.85 + sl * 0.5), t, 0.1);

    const hv = Math.min(1, (Math.abs(s.cableVel) / 2.6 + Math.abs(s.radiusVel) / 4) * (s.loaded ? 1 : 0.6));
    this.hoistMotor.g.gain.setTargetAtTime(hv * 0.055, t, 0.08);
    this.hoistMotor.o.frequency.setTargetAtTime(this.hoistMotor.base * (0.8 + hv * 0.55) * (s.loaded ? 0.82 : 1), t, 0.1);
  }

  _burst(dur, cut, gain, type = 'lowpass') {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = cut;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo = null) {
    const o = this.ctx.createOscillator();
    o.type = type;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  latch() { if (this.ok) { this._tone(120, 0.22, 0.3, 'sine', 70); this._burst(0.09, 2600, 0.22, 'highpass'); } }
  setGood() { if (this.ok) { this._tone(392, 0.14, 0.16, 'triangle'); setTimeout(() => this._tone(587, 0.3, 0.14, 'triangle'), 90); this._burst(0.16, 220, 0.22); } }
  setOk() { if (this.ok) { this._tone(294, 0.22, 0.13, 'triangle'); this._burst(0.2, 260, 0.26); } }
  setHard() { if (this.ok) { this._burst(0.42, 160, 0.6); this._tone(78, 0.42, 0.3, 'sine', 48); } }
  strike() { if (this.ok) { this._burst(0.3, 900, 0.5); this._tone(150, 0.3, 0.2, 'square', 80); } }
  drop() { if (this.ok) { this._burst(0.7, 130, 0.75); this._tone(60, 0.7, 0.35, 'sine', 38); } }
  creak() { if (this.ok) this._burst(0.5, 2100, 0.09, 'bandpass'); }
  deliver() { if (this.ok) { this._tone(660, 0.1, 0.11, 'square'); setTimeout(() => this._tone(880, 0.12, 0.1, 'square'), 110); } }
  jack() { if (this.ok) { this._tone(90, 1.1, 0.22, 'sawtooth', 190); this._burst(1.0, 300, 0.18); } }
  alarm() {
    if (!this.ok || this._alarmAt > this.ctx.currentTime - 0.42) return;
    this._alarmAt = this.ctx.currentTime;
    this._tone(880, 0.16, 0.13, 'square');
  }
  fail() { if (this.ok) { this._tone(160, 1.6, 0.3, 'sawtooth', 42); this._burst(1.6, 200, 0.5); } }
  hush() { if (this.ok) this.master.gain.setTargetAtTime(0.12, this.ctx.currentTime, 0.4); }
  unhush() { if (this.ok) this.master.gain.setTargetAtTime(0.7, this.ctx.currentTime, 0.3); }
}
