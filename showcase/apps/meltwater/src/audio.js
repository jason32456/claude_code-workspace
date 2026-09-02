// Everything is synthesised at runtime — no audio files ship with the app. The
// river bed is one noise source whose gain and cutoff track the total flow in
// the valley, so the valley genuinely sounds louder when it runs faster.

let ctx = null;
let master = null;
let river = null;
let riverGain = null;
let riverFilter = null;
let wind = null;
let enabled = true;

function noiseBuffer(seconds = 3) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99 * b0 + white * 0.06;
    b1 = 0.86 * b1 + white * 0.28;
    d[i] = Math.max(-1, Math.min(1, white * 0.35 + b0 + b1 * 0.4));
  }
  return buf;
}

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  const buf = noiseBuffer();

  river = ctx.createBufferSource();
  river.buffer = buf;
  river.loop = true;
  riverFilter = ctx.createBiquadFilter();
  riverFilter.type = 'lowpass';
  riverFilter.frequency.value = 300;
  riverFilter.Q.value = 0.4;
  riverGain = ctx.createGain();
  riverGain.gain.value = 0;
  river.connect(riverFilter).connect(riverGain).connect(master);
  river.start();

  const windSrc = ctx.createBufferSource();
  windSrc.buffer = buf;
  windSrc.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 480;
  wf.Q.value = 0.7;
  wind = ctx.createGain();
  wind.gain.value = 0.035;
  windSrc.connect(wf).connect(wind).connect(master);
  windSrc.start();
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  enabled = !m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.08);
}

export function isMuted() {
  return !enabled;
}

// flow: total water volume moving, roughly m³/s across the whole valley.
export function setRiver(flow, nearFall) {
  if (!ctx || !riverGain) return;
  const t = ctx.currentTime;
  const g = Math.min(0.42, Math.sqrt(Math.max(0, flow)) * 0.055);
  riverGain.gain.setTargetAtTime(g, t, 0.25);
  riverFilter.frequency.setTargetAtTime(240 + Math.min(2600, flow * 26) + nearFall * 500, t, 0.4);
}

function env(node, peak, attack, decay) {
  const t = ctx.currentTime;
  node.gain.cancelScheduledValues(t);
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(freq, peak, attack, decay, type = 'sine', detune = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(g).connect(master);
  env(g, peak, attack, decay);
  o.start();
  o.stop(ctx.currentTime + attack + decay + 0.05);
}

function burst(peak, decay, cutoff, type = 'lowpass') {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.6);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  src.connect(f).connect(g).connect(master);
  env(g, peak, 0.006, decay);
  src.start();
  src.stop(ctx.currentTime + decay + 0.1);
}

export const sfx = {
  dig: () => burst(0.06, 0.09, 900, 'bandpass'),
  fill: () => burst(0.05, 0.12, 420),
  place: () => {
    tone(180, 0.09, 0.004, 0.09, 'square');
    burst(0.05, 0.08, 1400, 'bandpass');
  },
  gate: (open) => {
    tone(open ? 320 : 200, 0.1, 0.005, 0.16, 'triangle');
    burst(0.05, 0.12, 700);
  },
  release: () => {
    tone(140, 0.16, 0.02, 0.5, 'sawtooth');
    tone(210, 0.1, 0.03, 0.7, 'sine');
  },
  breach: () => {
    burst(0.5, 1.1, 260);
    burst(0.3, 0.5, 2600, 'bandpass');
    tone(62, 0.3, 0.01, 0.9, 'sawtooth');
  },
  strain: () => burst(0.07, 0.4, 190),
  fieldDone: () => {
    tone(523, 0.12, 0.01, 0.3);
    setTimeout(() => tone(784, 0.11, 0.01, 0.4), 110);
  },
  flood: () => {
    tone(96, 0.16, 0.01, 0.5, 'sawtooth');
    burst(0.14, 0.4, 500);
  },
  win: () => {
    [392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.13, 0.01, 0.5), i * 130));
  },
  lose: () => {
    [330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.13, 0.02, 0.6, 'triangle'), i * 190));
  },
  click: () => tone(660, 0.05, 0.003, 0.05, 'square'),
  deny: () => tone(150, 0.08, 0.004, 0.12, 'square'),
};
