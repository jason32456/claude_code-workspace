// All synthesised. Each whistle is its own pitch contour, as a real handler's
// would be, so the commands can be learnt by ear.
const WHISTLES = {
  // [startHz, endHz, seconds] notes, null = rest
  comebye: [[1700, 2700, 0.16], null, [2700, 2300, 0.24]],
  away: [[2700, 1800, 0.16], null, [1800, 2250, 0.24]],
  walk: [[2300, 2400, 0.07], null, [2300, 2400, 0.07], null, [2300, 2500, 0.07]],
  lie: [[2500, 1650, 0.6]],
  steady: [[2100, 2100, 0.7, 7]],
  getout: [[1500, 3000, 0.35], null, [3000, 3000, 0.08]],
  inhere: [[3100, 3100, 0.06], null, [3100, 3100, 0.06], null, [3000, 1900, 0.28]],
  thatlldo: [[2600, 2600, 0.14], [2200, 2200, 0.14], [1800, 1700, 0.3]],
};

export function createAudio() {
  let ctx = null, master, windGain, windFilter, noiseBuf;
  let muted = false, birdT = 3, bleatT = 2;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.Q.value = 0.6; windFilter.frequency.value = 400;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(windFilter).connect(windGain).connect(master);
    src.start();
  }

  function whistle(cmd, lost) {
    if (!ctx) return;
    const notes = WHISTLES[cmd];
    let t = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = lost ? 0.35 : 0.55;
    if (lost) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      out.connect(f).connect(master);
    } else out.connect(master);
    for (const n of notes) {
      if (!n) { t += 0.06; continue; }
      const [a, b, dur, vib] = n;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(a, t);
      o.frequency.exponentialRampToValueAtTime(b, t + dur);
      if (vib) {
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = vib; lg.gain.value = 140;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t); lfo.stop(t + dur);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
      g.gain.setValueAtTime(0.5, t + dur - 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.02);
      // breath
      const nb = ctx.createBufferSource(); nb.buffer = noiseBuf;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = a; nf.Q.value = 3;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.06, t); ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
      nb.connect(nf).connect(ng).connect(out);
      nb.start(t, Math.random()); nb.stop(t + dur);
      t += dur;
    }
  }

  function bleat(vol = 0.25, pitch = 1) {
    if (!ctx) return;
    const t = ctx.currentTime, dur = 0.55 + Math.random() * 0.35;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f0 = (330 + Math.random() * 120) * pitch;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.92, t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 6 + Math.random() * 3; lg.gain.value = f0 * 0.06;
    lfo.connect(lg).connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2300; f2.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1).connect(g); o.connect(f2).connect(g);
    g.connect(master);
    o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
  }

  function lark() {
    if (!ctx) return;
    let t = ctx.currentTime;
    const n = 4 + Math.floor(Math.random() * 8);
    const g = ctx.createGain(); g.gain.value = 0.035; g.connect(master);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const f = 3200 + Math.random() * 2400, d = 0.04 + Math.random() * 0.06;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t + d);
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(1, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(e).connect(g); o.start(t); o.stop(t + d);
      t += d + 0.02 + Math.random() * 0.05;
    }
  }

  function clank() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const f of [180, 420, 1130]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
    }
  }

  function chime(up = true) {
    if (!ctx) return;
    const t = ctx.currentTime;
    (up ? [660, 880] : [440, 330]).forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.5);
      o.connect(g).connect(master); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.55);
    });
  }

  return {
    init,
    get muted() { return muted; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
    events(events) {
      for (const e of events) {
        if (e.type === 'whistle') whistle(e.cmd, e.lost);
        else if (e.type === 'break') bleat(0.3, 1.1);
        else if (e.type === 'penned') { clank(); chime(true); }
        else if (e.type === 'gate') chime(e.ok);
        else if (e.type === 'shed') chime(true);
      }
    },
    update(sim, dt) {
      if (!ctx) return;
      const w = sim.course.wind > 0 ? 0.04 + sim.wind * 0.12 * sim.course.wind : 0.025;
      windGain.gain.setTargetAtTime(w, ctx.currentTime, 0.4);
      windFilter.frequency.setTargetAtTime(300 + sim.wind * 500, ctx.currentTime, 0.5);
      birdT -= dt;
      if (birdT < 0) { lark(); birdT = 4 + Math.random() * 9; }
      bleatT -= dt;
      const stress = sim.sheep.reduce((a, s) => a + s.stress, 0) / sim.sheep.length;
      if (bleatT < 0) {
        const near = Math.hypot(sim.flock.x, sim.flock.z);
        bleat(Math.max(0.03, 0.22 - near / 900), 0.9 + Math.random() * 0.3);
        bleatT = 2 + Math.random() * 6 * (1.2 - stress);
      }
    },
  };
}
