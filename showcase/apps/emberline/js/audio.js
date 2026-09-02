// Everything here is synthesised at runtime — the project ships no audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.on = true;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.noiseBuf = this.#noise(2);

    // Engines: two detuned saws through a lowpass, plus prop-blade rumble.
    this.eng = ctx.createGain();
    this.eng.gain.value = 0;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 900;
    this.eng.connect(engFilter).connect(this.master);
    this.engOsc = [];
    for (const det of [0, 7, -5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 70 + det;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      o.connect(g).connect(this.eng);
      o.start();
      this.engOsc.push(o);
    }

    // Airflow noise, scaled by speed.
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 620;
    wf.Q.value = 0.6;
    this.windSrc = this.#loop(this.noiseBuf);
    this.windSrc.connect(wf).connect(this.wind).connect(this.master);

    // Fire roar, scaled by how much is burning near the aircraft.
    this.fire = ctx.createGain();
    this.fire.gain.value = 0;
    const ff = ctx.createBiquadFilter();
    ff.type = 'lowpass';
    ff.frequency.value = 380;
    this.fireSrc = this.#loop(this.noiseBuf);
    this.fireSrc.connect(ff).connect(this.fire).connect(this.master);

    // Slurry release.
    this.slurry = ctx.createGain();
    this.slurry.gain.value = 0;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 1400;
    sf.Q.value = 0.8;
    this.slurrySrc = this.#loop(this.noiseBuf);
    this.slurrySrc.connect(sf).connect(this.slurry).connect(this.master);
  }

  #noise(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.72 + w * 0.28;
      d[i] = last * 1.4;
    }
    return b;
  }

  #loop(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start();
    return s;
  }

  set(name, v, t = 0.12) {
    if (!this.ctx || !this.on) return;
    const g = this[name];
    if (!g) return;
    g.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, t);
  }

  rpm(speed) {
    if (!this.ctx) return;
    const f = 52 + speed * 0.75;
    for (let i = 0; i < this.engOsc.length; i++)
      this.engOsc[i].frequency.setTargetAtTime(f + i * 6, this.ctx.currentTime, 0.15);
  }

  blip(freq, dur = 0.12, type = 'square', vol = 0.14) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  chord(freqs, dur = 0.9, vol = 0.1) {
    freqs.forEach((f, i) => setTimeout(() => this.blip(f, dur, 'triangle', vol), i * 90));
  }

  splash() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + 0.55);
  }

  crash() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + 1.7);
  }

  mute(v) {
    this.on = !v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }
}
