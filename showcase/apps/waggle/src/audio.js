// Synthesised: wing buzz, the hive's murmur, the waggle buzz, little cues.
export function createAudio() {
  let ctx = null, wing, wingG, wingF, hum, waggle, wagG, master;
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    wing = ctx.createOscillator(); wing.type = 'sawtooth'; wing.frequency.value = 210;
    wingF = ctx.createBiquadFilter(); wingF.type = 'bandpass'; wingF.frequency.value = 420; wingF.Q.value = 1.2;
    wingG = ctx.createGain(); wingG.gain.value = 0;
    wing.connect(wingF).connect(wingG).connect(master); wing.start();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    hum = ctx.createGain(); hum.gain.value = 0;
    src.connect(lp).connect(hum).connect(master); src.start();
    waggle = ctx.createOscillator(); waggle.type = 'square'; waggle.frequency.value = 250;
    const am = ctx.createOscillator(); am.frequency.value = 15;
    const amG = ctx.createGain(); amG.gain.value = 0.5;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 900;
    wagG = ctx.createGain(); wagG.gain.value = 0;
    const mod = ctx.createGain(); mod.gain.value = 0.5;
    am.connect(amG).connect(mod.gain);
    waggle.connect(wf).connect(mod).connect(wagG).connect(master);
    waggle.start(); am.start();
  }
  function ping(freq, dur = 0.25, type = 'sine', vol = 0.12, slide = 0) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    init,
    update(sim, muted) {
      if (!ctx) return;
      const t = ctx.currentTime, P = sim.player, out = !P.inHive && !muted;
      wingG.gain.setTargetAtTime(out ? 0.035 + P.speed * 0.0012 : 0, t, 0.08);
      wing.frequency.setTargetAtTime(190 + P.speed * 2.5 + sim.input.climb * 20, t, 0.1);
      hum.gain.setTargetAtTime(P.inHive && !muted ? 0.09 : 0, t, 0.2);
      wagG.gain.setTargetAtTime(P.inHive && sim.dance?.state === 'run' && !muted ? 0.07 : 0, t, 0.03);
    },
    taste(q) { ping(520 + q * 400, 0.3, 'triangle', 0.14, 1.5); },
    bad() { ping(220, 0.5, 'sawtooth', 0.08, 0.5); },
    recruit() { ping(880, 0.18, 'sine', 0.08, 1.25); },
    found() { ping(1046, 0.25, 'sine', 0.06); setTimeout(() => ping(1318, 0.3, 'sine', 0.05), 90); },
    miss() { ping(330, 0.25, 'triangle', 0.05, 0.8); },
    enter() { ping(300, 0.3, 'sine', 0.08, 0.6); },
    end() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => ping(f, 0.5, 'triangle', 0.1), i * 140)); },
  };
}
