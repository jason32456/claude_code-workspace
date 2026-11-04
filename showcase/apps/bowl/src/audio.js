// Synthesised yard sounds: retarder squeal, coupler clank, pusher diesel, wind.
export function createAudio() {
  let ctx = null, master, squeal, squealGain, diesel, dieselGain, windGain, noiseBuf;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Retarder: two inharmonic partials with a fast wobble.
    squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 3;
    squealGain.connect(master);
    bp.connect(squealGain);
    squeal = [2380, 3410].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 7 + Math.random() * 3; lg.gain.value = f * 0.012;
      lfo.connect(lg).connect(o.frequency);
      o.connect(bp);
      o.start(); lfo.start();
      return o;
    });

    // Diesel idle/notch.
    dieselGain = ctx.createGain();
    dieselGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 180;
    diesel = ctx.createOscillator();
    diesel.type = 'sawtooth'; diesel.frequency.value = 34;
    diesel.connect(lp).connect(dieselGain).connect(master);
    diesel.start();

    // Wind.
    const wn = ctx.createBufferSource();
    wn.buffer = noiseBuf; wn.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass'; wf.frequency.value = 500;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wn.connect(wf).connect(windGain).connect(master);
    wn.start();
  }

  function clank(v) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const amp = Math.min(1, 0.25 + v / 3);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900 + v * 300; f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random()); src.stop(t + 0.4);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(og).connect(master);
    o.start(t); o.stop(t + 0.45);
  }

  function tick() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.06);
  }

  function update(st) {
    if (!ctx) return;
    const t = ctx.currentTime;
    squealGain.gain.setTargetAtTime(st.squeal * 0.09, t, 0.05);
    dieselGain.gain.setTargetAtTime(st.diesel * 0.22, t, 0.3);
    diesel.frequency.setTargetAtTime(30 + st.diesel * 14, t, 0.4);
    windGain.gain.setTargetAtTime(Math.min(0.25, st.wind * 0.018), t, 0.5);
  }

  return { init, clank, tick, update, get ready() { return !!ctx; } };
}
