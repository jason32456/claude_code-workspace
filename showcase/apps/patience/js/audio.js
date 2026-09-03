// Every sound is synthesized on the fly — no audio files, no downloads.
let ctx = null;
let muted = false;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(value) {
  muted = value;
}

export function isMuted() {
  return muted;
}

function tone({ freq, duration, type = 'sine', gain = 0.15, delay = 0, freqEnd = null }) {
  if (muted) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  const t0 = c.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function sfxFlip() {
  tone({ freq: 700, freqEnd: 500, duration: 0.08, type: 'triangle', gain: 0.08 });
}

export function sfxPlace() {
  tone({ freq: 220, freqEnd: 140, duration: 0.09, type: 'sine', gain: 0.12 });
}

export function sfxInvalid() {
  tone({ freq: 140, duration: 0.14, type: 'square', gain: 0.06 });
}

export function sfxDraw() {
  tone({ freq: 500, freqEnd: 650, duration: 0.06, type: 'triangle', gain: 0.06 });
}

export function sfxDeal(count = 28) {
  for (let i = 0; i < count; i++) {
    tone({ freq: 600, freqEnd: 420, duration: 0.05, type: 'triangle', gain: 0.05, delay: i * 0.035 });
  }
}

export function sfxWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((freq, i) => tone({ freq, duration: 0.35, type: 'sine', gain: 0.14, delay: i * 0.11 }));
}
