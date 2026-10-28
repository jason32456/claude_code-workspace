// Everything is synthesised: a looped brown-noise bed for the roll and the wind,
// plus one-shot noise bursts and sine blips for events.
export function createAudio() {
  let ctx = null, master, rollGain, rollFilter, windGain, windFilter, noiseBuf;
  let muted = false;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const loop = (filterType) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filterType;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      return [f, g];
    };
    [rollFilter, rollGain] = loop('lowpass');
    [windFilter, windGain] = loop('bandpass');
    windFilter.Q.value = 0.7;
  }

  function burst(dur, freq, gain, type = 'lowpass') {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
  function blip(freq, dur, gain, type = 'sine', slide = 1) {
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  let lastPop = 0;
  return {
    init,
    get ready() { return !!ctx; },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.8; },
    get muted() { return muted; },
    update(sim) {
      if (!ctx) return;
      const sp = sim.speed(), r = sim.r, t = ctx.currentTime;
      const on = sim.grounded && sim.phase !== 'over' ? 1 : 0;
      rollFilter.frequency.setTargetAtTime(Math.max(60, 900 / (1 + r * 0.9) + sp * 8), t, 0.1);
      rollGain.gain.setTargetAtTime(on * Math.min(0.9, sp * 0.03 * (0.6 + Math.min(r, 4) * 0.25)), t, 0.08);
      windFilter.frequency.setTargetAtTime(300 + sp * 22, t, 0.2);
      windGain.gain.setTargetAtTime(sim.phase === 'over' ? 0 : Math.min(0.35, sp * sp * 0.00035), t, 0.2);
    },
    events(events) {
      if (!ctx) return;
      for (const e of events) {
        if (e.type === 'absorb') {
          const now = ctx.currentTime;
          if (now - lastPop < 0.03) continue;
          lastPop = now;
          blip(900 / (1 + e.r) + 200 + Math.random() * 80, 0.12, 0.12, 'triangle', 1.6);
        } else if (e.type === 'smash') {
          burst(0.35, 600, 0.6);
          blip(110, 0.3, 0.25, 'sine', 0.5);
        } else if (e.type === 'bounce') {
          burst(0.22, 400, Math.min(0.7, e.speed * 0.08));
        } else if (e.type === 'land') {
          burst(0.5, 220, Math.min(0.9, e.speed * 0.06));
          blip(70, 0.4, 0.4, 'sine', 0.6);
        } else if (e.type === 'scrape') {
          burst(0.08, 2400, 0.08, 'highpass');
        } else if (e.type === 'curtain') {
          burst(1.6, 3200, 0.7, 'highpass');
          burst(1.2, 300, 0.8);
          for (let i = 0; i < 9; i++) setTimeout(() => blip(1800 + Math.random() * 2600, 0.5, 0.06, 'sine', 0.92), i * 70);
        } else if (e.type === 'splat') {
          burst(0.6, 260, 0.9);
          blip(60, 0.5, 0.4, 'sine', 0.5);
        }
      }
    },
    medal() { if (!ctx) return; [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.35, 0.12, 'triangle'), i * 110)); },
  };
}
