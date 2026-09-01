// Every sound effect is synthesized at runtime via Web Audio — no audio
// files, so the app stays instant-loading and works offline.
let ctx = null;
let enabled = true;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq, duration = 0.12, type = 'sine', gain = 0.18, delay = 0, freqEnd = null }) {
  if (!enabled) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + delay);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + delay + duration);
  g.gain.setValueAtTime(0.0001, c.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + delay + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + duration);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + delay);
  osc.stop(c.currentTime + delay + duration + 0.02);
}

export function setSoundEnabled(v) {
  enabled = v;
}

export const sfx = {
  move: () => tone({ freq: 340, duration: 0.07, type: 'triangle', gain: 0.15 }),
  capture: () => tone({ freq: 220, duration: 0.1, type: 'square', gain: 0.14 }),
  check: () => {
    tone({ freq: 520, duration: 0.09, type: 'sawtooth', gain: 0.14 });
    tone({ freq: 680, duration: 0.12, type: 'sawtooth', gain: 0.12, delay: 0.08 });
  },
  illegal: () => tone({ freq: 140, duration: 0.16, type: 'square', gain: 0.12 }),
  wrong: () => tone({ freq: 180, freqEnd: 90, duration: 0.28, type: 'sawtooth', gain: 0.15 }),
  correct: () => {
    tone({ freq: 520, duration: 0.09, type: 'sine', gain: 0.16 });
    tone({ freq: 780, duration: 0.14, type: 'sine', gain: 0.15, delay: 0.09 });
  },
  gameOver: () => {
    [440, 554, 659, 880].forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'sine', gain: 0.14, delay: i * 0.1 }));
  },
};
