// Small synthesized cues — no audio files. The context is created on the first
// gesture so autoplay policy never blocks it.

let ctx = null;

function ac() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, duration, type, gain, delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export function snap() {
  const a = ac();
  if (!a) return;
  // Short filtered noise burst: a member letting go.
  const len = Math.floor(a.sampleRate * 0.12);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.8;
  const g = a.createGain();
  g.gain.value = 0.35;
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
  tone(140, 0.14, 'sine', 0.18);
}

export function win() {
  [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.5, 'triangle', 0.13, i * 0.09));
}

export function lose() {
  tone(180, 0.5, 'sawtooth', 0.12);
  tone(120, 0.6, 'sine', 0.12, 0.06);
}

export function place() {
  tone(720, 0.05, 'square', 0.045);
}
