// Synthesised sound: the blast-valve roar, a faint breeze, and a few cues.
export function createAudio() {
  let ctx = null, burnGain = null, windGain = null, master = null;
  function noiseBuf(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = 0.97 * last + 0.03 * w; d[i] = w * 0.5 + last * 3; }
    return b;
  }
  function init() {
    if (ctx) { ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    const buf = noiseBuf(ctx);
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 180; pk.gain.value = 9;
    burnGain = ctx.createGain(); burnGain.gain.value = 0;
    src.connect(bp).connect(pk).connect(burnGain).connect(master);
    src.start();
    const src2 = ctx.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    windGain = ctx.createGain(); windGain.gain.value = 0.02;
    src2.connect(lp).connect(windGain).connect(master);
    src2.start();
  }
  function frame(b, rel) {
    if (!ctx) return;
    const t = ctx.currentTime;
    burnGain.gain.setTargetAtTime(b.burner ? 0.5 : 0, t, b.burner ? 0.03 : 0.08);
    windGain.gain.setTargetAtTime(0.015 + Math.min(0.12, rel * 0.03), t, 0.3);
  }
  function blip(freq, dur = 0.15, type = 'sine', vol = 0.2, slide = 0) {
    if (!ctx) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    init, frame,
    drop: () => blip(520, 0.35, 'triangle', 0.15, 0.4),
    score: (pts) => { blip(660, 0.18, 'sine', 0.18); setTimeout(() => blip(pts > 700 ? 990 : 780, 0.3, 'sine', 0.18), 140); },
    warn: () => { blip(880, 0.12, 'square', 0.08); setTimeout(() => blip(880, 0.12, 'square', 0.08), 180); },
    thud: () => blip(90, 0.4, 'sine', 0.35, 0.5),
    stop: () => { if (burnGain && ctx) burnGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); },
  };
}
