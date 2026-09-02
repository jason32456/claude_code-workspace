// Everything here is synthesised at runtime — the app ships no audio files.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.noiseBuf = this._noiseBuffer(4);

    // Wind bed.
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.6;
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noiseBuf;
    windSrc.loop = true;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    windSrc.start();

    // Charge hum — sits under the corona and rises with stored charge.
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 900;
    this.humOscA = ctx.createOscillator();
    this.humOscA.type = 'sawtooth';
    this.humOscA.frequency.value = 58;
    this.humOscB = ctx.createOscillator();
    this.humOscB.type = 'sawtooth';
    this.humOscB.frequency.value = 58.7;
    this.humOscA.connect(humFilter);
    this.humOscB.connect(humFilter);
    humFilter.connect(this.humGain);
    this.humGain.connect(this.master);
    this.humOscA.start();
    this.humOscB.start();
    this.humFilter = humFilter;

    // Cell-charging tone — the three-second warning.
    this.cellGain = ctx.createGain();
    this.cellGain.gain.value = 0;
    this.cellOsc = ctx.createOscillator();
    this.cellOsc.type = 'triangle';
    this.cellOsc.frequency.value = 180;
    const cellFilt = ctx.createBiquadFilter();
    cellFilt.type = 'bandpass';
    cellFilt.frequency.value = 320;
    cellFilt.Q.value = 3;
    this.cellOsc.connect(cellFilt);
    cellFilt.connect(this.cellGain);
    this.cellGain.connect(this.master);
    this.cellOsc.start();

    this.crackleAt = 0;
    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.85 : 0;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    return buf;
  }

  _burst({ dur = 0.4, gain = 0.4, type = 'lowpass', from = 900, to = 200, q = 1, delay = 0 }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.05, dur * 0.15));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  _tone({ freq = 440, dur = 0.2, gain = 0.2, type = 'sine', to = null, delay = 0 }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Thunder is delayed by distance / speed-of-sound — it doubles as a range cue. */
  thunder(distance) {
    if (!this.ready) return;
    const delay = Math.min(3.2, distance / 340);
    const close = Math.max(0, 1 - distance / 220);
    const loud = 0.22 + close * 0.5;
    if (close > 0.45) {
      this._burst({ dur: 0.16, gain: loud * 0.9, type: 'highpass', from: 2600, to: 900, delay });
    }
    this._burst({
      dur: 1.4 + (1 - close) * 1.8,
      gain: loud,
      type: 'lowpass',
      from: 260 + close * 700,
      to: 55,
      q: 0.8,
      delay: delay + 0.02,
    });
    this._tone({ freq: 44 + close * 20, to: 26, dur: 1.6, gain: loud * 0.35, type: 'sine', delay: delay + 0.05 });
  }

  strikeOnPlayer() {
    this._burst({ dur: 0.5, gain: 0.55, type: 'bandpass', from: 3400, to: 300, q: 1.6 });
    this._tone({ freq: 120, to: 40, dur: 0.7, gain: 0.3, type: 'sawtooth' });
  }

  ignite() {
    this._burst({ dur: 1.1, gain: 0.3, type: 'lowpass', from: 700, to: 120 });
  }

  deliverTick() {
    this._tone({ freq: 620 + Math.random() * 90, dur: 0.07, gain: 0.07, type: 'square' });
  }

  jarFull() {
    this._tone({ freq: 660, dur: 0.5, gain: 0.16, type: 'sine' });
    this._tone({ freq: 990, dur: 0.55, gain: 0.11, type: 'sine', delay: 0.05 });
  }

  alarm() {
    this._tone({ freq: 880, dur: 0.12, gain: 0.16, type: 'square' });
    this._tone({ freq: 660, dur: 0.12, gain: 0.14, type: 'square', delay: 0.14 });
  }

  hullHit() {
    this._burst({ dur: 0.6, gain: 0.4, type: 'lowpass', from: 400, to: 60 });
    this._tone({ freq: 90, to: 40, dur: 0.5, gain: 0.2, type: 'square' });
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.4, gain: 0.13, type: 'triangle', delay: i * 0.11 })
    );
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.5, gain: 0.13, type: 'triangle', delay: i * 0.15 })
    );
  }

  update(dt, state) {
    if (!this.ready || !this.enabled) return;
    const now = this.ctx.currentTime;
    const speed = state.speed || 0;
    this.windGain.gain.setTargetAtTime(0.045 + Math.min(0.16, speed / 130), now, 0.3);
    this.windFilter.frequency.setTargetAtTime(360 + speed * 16, now, 0.4);

    const q = state.charge || 0;
    this.humGain.gain.setTargetAtTime(q * 0.075, now, 0.15);
    const f = 52 + q * 62;
    this.humOscA.frequency.setTargetAtTime(f, now, 0.2);
    this.humOscB.frequency.setTargetAtTime(f * 1.012, now, 0.2);
    this.humFilter.frequency.setTargetAtTime(500 + q * 2200, now, 0.2);

    const warn = state.warn || 0;
    this.cellGain.gain.setTargetAtTime(warn * 0.07, now, 0.1);
    this.cellOsc.frequency.setTargetAtTime(150 + warn * 260, now, 0.15);

    // Corona crackle density tracks stored charge.
    if (q > 0.12) {
      this.crackleAt -= dt * (0.5 + q * 9);
      if (this.crackleAt <= 0) {
        this.crackleAt = 1;
        this._burst({
          dur: 0.05 + Math.random() * 0.05,
          gain: 0.03 + q * 0.06,
          type: 'bandpass',
          from: 2200 + Math.random() * 3200,
          to: 1400,
          q: 4,
        });
      }
    }
  }
}
