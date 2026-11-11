// Everything is synthesised: regulator hiss, exhaust bubbles, the cave's hum.
export function createAudio() {
  let ctx = null, master = null, noise = null, hum = null, heart = 0;
  const A = { on: true };

  A.start = () => {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.5 + b * 3; }
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
    hum = ctx.createGain(); hum.gain.value = 0.12;
    src.connect(lp); lp.connect(hum); hum.connect(master); src.start();
  };

  const burst = (t, dur, freq, q, gain, type = 'bandpass') => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  };
  const tone = (t, freq, dur, gain, type = 'sine', to = null) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  };

  A.inhale = (stress) => { if (!ctx || !A.on) return; burst(ctx.currentTime, 0.9 / stress, 2400, 0.8, 0.07, 'highpass'); };
  A.exhale = () => {
    if (!ctx || !A.on) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 9; i++) {
      const tt = t + i * 0.09 + Math.random() * 0.05;
      burst(tt, 0.12, 300 + Math.random() * 500, 3, 0.18);
      tone(tt, 280 + Math.random() * 400, 0.08, 0.03, 'sine', 600 + Math.random() * 500);
    }
  };
  A.contact = (floor) => { if (!ctx || !A.on) return; burst(ctx.currentTime, 0.35, floor ? 160 : 420, 1.2, floor ? 0.5 : 0.25, 'lowpass'); };
  A.tie = () => { if (!ctx || !A.on) return; const t = ctx.currentTime; tone(t, 1900, 0.04, 0.08, 'square'); tone(t + 0.08, 1500, 0.04, 0.06, 'square'); };
  A.reel = () => { if (!ctx || !A.on) return; const t = ctx.currentTime; for (let i = 0; i < 6; i++) tone(t + i * 0.05, 2600, 0.015, 0.04, 'square'); };
  A.arrow = () => { if (!ctx || !A.on) return; tone(ctx.currentTime, 880, 0.18, 0.08, 'triangle'); };
  A.snap = () => { if (!ctx || !A.on) return; const t = ctx.currentTime; tone(t, 900, 0.7, 0.25, 'sawtooth', 70); burst(t, 0.2, 3000, 1, 0.3); };
  A.click = () => { if (!ctx || !A.on) return; tone(ctx.currentTime, 120, 0.05, 0.3, 'square'); };
  A.good = () => { if (!ctx || !A.on) return; const t = ctx.currentTime; [523, 659, 784].forEach((f, i) => tone(t + i * 0.12, f, 0.5, 0.06, 'triangle')); };
  A.tick = (dt, stress) => {
    if (!ctx || !A.on) return;
    if (stress > 1) {
      heart -= dt;
      if (heart <= 0) { heart = 0.75; const t = ctx.currentTime; tone(t, 55, 0.12, 0.35); tone(t + 0.16, 50, 0.1, 0.25); }
    }
  };
  A.mute = () => { A.on = !A.on; if (master) master.gain.value = A.on ? 0.7 : 0; return A.on; };
  return A;
}
