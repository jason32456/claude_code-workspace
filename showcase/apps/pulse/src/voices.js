/**
 * Every drum and synth voice in PULSE is built here from oscillators and noise.
 * There are no audio files anywhere in this project.
 *
 * All functions take an explicit `ctx` so the exact same code renders the live
 * AudioContext and the OfflineAudioContext used by WAV export.
 */

/** Seeded so a live playback and an offline render get bit-identical noise. */
export function createNoiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x9e3779b9;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0x7fffffff) - 1;
  }
  return buffer;
}

const driveCurves = new Map();
function driveCurve(amount) {
  const key = Math.round(amount * 40);
  if (driveCurves.has(key)) return driveCurves.get(key);
  const k = (key / 40) * 60;
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  driveCurves.set(key, curve);
  return curve;
}

const MIN = 0.0001;

function ampEnv(ctx, time, peak, decay, attack = 0.002) {
  const g = ctx.createGain();
  const p = Math.max(0.0005, peak);
  g.gain.setValueAtTime(MIN, time);
  g.gain.exponentialRampToValueAtTime(p, time + attack);
  g.gain.exponentialRampToValueAtTime(MIN, time + attack + decay);
  g.gain.setValueAtTime(0, time + attack + decay + 0.001);
  return g;
}

function noiseSource(ctx, res, time, dur, seed = 0) {
  const s = ctx.createBufferSource();
  s.buffer = res.noise;
  s.loop = true;
  const span = Math.max(0.05, res.noise.duration - dur - 0.01);
  s.start(time, ((seed * 0.13137) % 1) * span);
  s.stop(time + dur);
  return s;
}

function osc(ctx, type, freq, time, stop) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, time);
  o.start(time);
  o.stop(stop);
  return o;
}

function kick(ctx, res, dest, t, p, vel, seed) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  const top = p.tune * (2.2 + 5.5 * p.punch);
  o.frequency.setValueAtTime(top, t);
  o.frequency.exponentialRampToValueAtTime(p.tune, t + 0.012 + 0.06 * (1 - p.punch));

  const g = ampEnv(ctx, t, vel, p.decay, 0.003);
  o.connect(g);

  let tail = g;
  if (p.drive > 0.01) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(p.drive);
    ws.oversample = '2x';
    const makeup = ctx.createGain();
    makeup.gain.value = 1 / (1 + p.drive * 1.4);
    g.connect(ws);
    ws.connect(makeup);
    tail = makeup;
  }
  tail.connect(dest);
  o.start(t);
  o.stop(t + p.decay + 0.1);

  if (p.punch > 0.05) {
    const click = osc(ctx, 'triangle', 1400, t, t + 0.05);
    const cg = ampEnv(ctx, t, vel * 0.45 * p.punch, 0.012, 0.001);
    click.connect(cg);
    cg.connect(dest);
  }
}

function snare(ctx, res, dest, t, p, vel, seed) {
  const n = noiseSource(ctx, res, t, p.decay + 0.06, seed);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = p.tone * 0.45;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = p.tone;
  bp.Q.value = 0.8;
  const ng = ampEnv(ctx, t, vel * (0.32 + 0.5 * p.snap), p.decay, 0.001);
  n.connect(hp);
  hp.connect(bp);
  bp.connect(ng);
  ng.connect(dest);

  const bodyDecay = Math.min(p.decay * 0.7, 0.13);
  const bg = ampEnv(ctx, t, vel * 0.42 * (1 - p.snap * 0.55), bodyDecay, 0.001);
  osc(ctx, 'triangle', p.tune, t, t + 0.3).connect(bg);
  osc(ctx, 'triangle', p.tune * 1.47, t, t + 0.3).connect(bg);
  bg.connect(dest);
}

function clap(ctx, res, dest, t, p, vel, seed) {
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = p.tone;
  bp.Q.value = 1.1;
  bp.connect(dest);

  for (let i = 0; i < 3; i++) {
    const st = t + i * p.spread;
    const g = ampEnv(ctx, st, vel * 0.6, 0.017, 0.0008);
    noiseSource(ctx, res, st, 0.03, seed + i * 3).connect(g);
    g.connect(bp);
  }
  const tailAt = t + 2 * p.spread;
  const tg = ampEnv(ctx, tailAt, vel * 0.5, p.decay, 0.002);
  noiseSource(ctx, res, tailAt, p.decay + 0.05, seed + 11).connect(tg);
  tg.connect(bp);
}

// Inharmonic ratios lifted from the 808's six-square-oscillator metal tone. The
// squares sit low; it is their upper harmonics that survive the band-pass and
// make the metallic ring. A parallel noise layer supplies the transient sizzle.
const HAT_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];
const HAT_BASE = 10;

function hat(ctx, res, dest, t, p, vel, seed) {
  const g = ampEnv(ctx, t, vel * 0.85, p.decay, 0.001);
  g.connect(dest);
  const stop = t + p.decay + 0.05;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = p.tone;
  bp.Q.value = 0.7;
  const metal = ctx.createGain();
  metal.gain.value = 0.55;
  for (const r of HAT_RATIOS) osc(ctx, 'square', p.tune * HAT_BASE * r, t, stop).connect(bp);
  bp.connect(metal);
  metal.connect(g);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = p.tone * 0.8;
  const sizzle = ctx.createGain();
  sizzle.gain.value = 0.45;
  noiseSource(ctx, res, t, p.decay + 0.04, seed).connect(hp);
  hp.connect(sizzle);
  sizzle.connect(g);
}

function tom(ctx, res, dest, t, p, vel, seed) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(p.tune * (1 + 0.8 * p.bend), t);
  o.frequency.exponentialRampToValueAtTime(p.tune, t + 0.03 + 0.12 * p.bend);
  const g = ampEnv(ctx, t, vel * 0.8, p.decay, 0.003);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + p.decay + 0.08);

  const n = noiseSource(ctx, res, t, 0.03, seed);
  const ng = ampEnv(ctx, t, vel * 0.12, 0.02, 0.001);
  n.connect(ng);
  ng.connect(dest);
}

function rim(ctx, res, dest, t, p, vel, seed) {
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = p.tune * 1.6;
  bp.Q.value = 5;
  const g = ampEnv(ctx, t, vel * 0.7, p.decay, 0.0006);
  const stop = t + p.decay + 0.02;
  osc(ctx, 'square', p.tune, t, stop).connect(bp);
  osc(ctx, 'square', p.tune * 1.47, t, stop).connect(bp);
  bp.connect(g);
  g.connect(dest);
}

function cowbell(ctx, res, dest, t, p, vel, seed) {
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = p.tune * 3.4;
  bp.Q.value = 2.4;
  const g = ampEnv(ctx, t, vel * 0.45, p.decay, 0.001);
  const stop = t + p.decay + 0.05;
  osc(ctx, 'square', p.tune, t, stop).connect(bp);
  osc(ctx, 'square', p.tune * 1.48, t, stop).connect(bp);
  bp.connect(g);
  g.connect(dest);
}

function filterEnv(ctx, p, t) {
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = p.reso;
  const peak = Math.min(14000, p.cutoff * (1 + 10 * p.envAmt));
  filt.frequency.setValueAtTime(peak, t);
  filt.frequency.exponentialRampToValueAtTime(
    Math.max(60, p.cutoff),
    t + Math.max(0.02, p.decay * 0.75),
  );
  return filt;
}

function bass(ctx, res, dest, t, p, vel, seed, freq) {
  const stop = t + p.decay + 0.12;
  const filt = filterEnv(ctx, p, t);
  const g = ampEnv(ctx, t, vel * 0.42, p.decay, 0.005);

  osc(ctx, p.wave, freq, t, stop).connect(filt);
  if (p.sub > 0.01) {
    const sg = ctx.createGain();
    sg.gain.value = p.sub * 0.8;
    osc(ctx, 'sine', freq / 2, t, stop).connect(sg);
    sg.connect(filt);
  }
  filt.connect(g);
  g.connect(dest);
}

function lead(ctx, res, dest, t, p, vel, seed, freq) {
  const stop = t + p.decay + 0.12;
  const filt = filterEnv(ctx, p, t);
  const g = ampEnv(ctx, t, vel * 0.26, p.decay, 0.006);

  const a = osc(ctx, p.wave, freq, t, stop);
  const b = osc(ctx, p.wave, freq, t, stop);
  a.detune.setValueAtTime(-p.detune, t);
  b.detune.setValueAtTime(p.detune, t);
  a.connect(filt);
  b.connect(filt);
  filt.connect(g);
  g.connect(dest);
}

const VOICES = { kick, snare, clap, hat, tom, rim, cowbell, bass, lead };

export function playVoice(voice, ctx, res, dest, time, params, vel, seed, freq) {
  const fn = VOICES[voice];
  if (fn) fn(ctx, res, dest, time, params, vel, seed, freq);
}
