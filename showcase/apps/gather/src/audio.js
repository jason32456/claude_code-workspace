// Everything is synthesised — no audio files, so the app stays offline-safe.

let ctx = null;
let master = null;
let roarGain = null;
let roarFilter = null;
let blowGain = null;
let muted = false;

function noiseBuffer(seconds = 3) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2;
  }
  return buf;
}

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const roar = ctx.createBufferSource();
  roar.buffer = noiseBuffer();
  roar.loop = true;
  roarFilter = ctx.createBiquadFilter();
  roarFilter.type = 'lowpass';
  roarFilter.frequency.value = 420;
  roarGain = ctx.createGain();
  roarGain.gain.value = 0.05;
  roar.connect(roarFilter).connect(roarGain).connect(master);
  roar.start();

  const air = ctx.createBufferSource();
  air.buffer = noiseBuffer();
  air.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = 'bandpass';
  airFilter.frequency.value = 900;
  airFilter.Q.value = 0.7;
  blowGain = ctx.createGain();
  blowGain.gain.value = 0;
  air.connect(airFilter).connect(blowGain).connect(master);
  air.start();
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.9;
}

export function isMuted() {
  return muted;
}

export function ambience(heatProximity, blowing) {
  if (!ctx) return;
  const now = ctx.currentTime;
  roarGain.gain.setTargetAtTime(0.045 + 0.3 * heatProximity, now, 0.2);
  roarFilter.frequency.setTargetAtTime(380 + 900 * heatProximity, now, 0.25);
  blowGain.gain.setTargetAtTime(blowing ? 0.09 : 0, now, 0.06);
}

function ping(freq, dur, type = 'sine', gain = 0.18, slide = 1) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, ctx.currentTime + dur);
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(ctx.currentTime + dur + 0.05);
}

function hiss(dur, freq, gain = 0.16) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(0.7);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  s.connect(f).connect(g).connect(master);
  s.start();
  s.stop(ctx.currentTime + dur + 0.05);
}

export const sfx = {
  tool: () => ping(180, 0.07, 'square', 0.05, 0.7),
  shear: () => {
    ping(1400, 0.09, 'square', 0.09, 0.4);
    hiss(0.2, 2600, 0.1);
  },
  marver: () => hiss(0.3, 500, 0.13),
  crack: () => {
    ping(320, 0.5, 'sawtooth', 0.2, 0.25);
    hiss(0.5, 1800, 0.22);
  },
  burst: () => {
    hiss(0.6, 900, 0.32);
    ping(90, 0.6, 'sawtooth', 0.18, 0.3);
  },
  drop: () => ping(70, 0.9, 'sine', 0.25, 0.4),
  bench: () => {
    ping(880, 0.5, 'sine', 0.13, 1);
    setTimeout(() => ping(1320, 0.7, 'sine', 0.1, 1), 90);
  },
  good: () => {
    ping(660, 0.35, 'triangle', 0.12);
    setTimeout(() => ping(990, 0.45, 'triangle', 0.11), 110);
    setTimeout(() => ping(1320, 0.6, 'triangle', 0.09), 220);
  },
  click: () => ping(520, 0.04, 'square', 0.05),
};
