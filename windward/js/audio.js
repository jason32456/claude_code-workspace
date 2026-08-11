import { clamp } from './sailing.js';

/** Everything here is synthesised — the project ships no audio files. */
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

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    this.master = master;

    const noise = ctx.createBufferSource();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;

    // Wind: the note the rig makes, pitched by apparent wind speed.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter).connect(this.windGain).connect(master);

    // Hull: broadband rush under the bow, opens up with speed.
    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'lowpass';
    this.waterFilter.frequency.value = 300;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    noise.connect(this.waterFilter).connect(this.waterGain).connect(master);

    // Luff: the flogging of an unhappy sail.
    this.luffFilter = ctx.createBiquadFilter();
    this.luffFilter.type = 'bandpass';
    this.luffFilter.frequency.value = 900;
    this.luffFilter.Q.value = 1.4;
    this.luffGain = ctx.createGain();
    this.luffGain.gain.value = 0;
    noise.connect(this.luffFilter).connect(this.luffGain).connect(master);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(this.luffGain.gain);
    lfo.start();

    noise.start();
    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  update(state, gustFactor) {
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const aws = clamp(state.aws / 16, 0, 1);
    const spd = clamp(state.speed / 10, 0, 1);

    this.windFilter.frequency.setTargetAtTime(300 + aws * 900 + gustFactor * 260, t, 0.25);
    this.windGain.gain.setTargetAtTime(0.02 + aws * 0.075 + gustFactor * 0.035, t, 0.3);

    this.waterFilter.frequency.setTargetAtTime(180 + spd * 1500, t, 0.2);
    this.waterGain.gain.setTargetAtTime(spd * spd * 0.16, t, 0.2);

    const luff = state.luffing ? clamp(-state.alpha / 16, 0.2, 1) : 0;
    this.luffGain.gain.setTargetAtTime(luff * 0.09, t, 0.08);
  }

  ping(freq = 720, dur = 0.9, type = 'triangle', vol = 0.25) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  bell() {
    this.ping(1180, 1.1, 'triangle', 0.2);
    this.ping(1770, 0.7, 'sine', 0.09);
  }

  horn() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(196, t);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.03);
    g.gain.setValueAtTime(0.3, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1);
  }

  thud() {
    this.ping(90, 0.35, 'square', 0.22);
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v && this.ready) {
      const t = this.ctx.currentTime;
      this.windGain.gain.setTargetAtTime(0, t, 0.1);
      this.waterGain.gain.setTargetAtTime(0, t, 0.1);
      this.luffGain.gain.setTargetAtTime(0, t, 0.1);
    }
  }
}
