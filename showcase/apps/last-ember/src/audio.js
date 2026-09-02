let ctx = null;

export function initAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, duration, { type = 'sine', volume = 0.2, delay = 0, freqEnd = null } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) osc.frequency.linearRampToValueAtTime(freqEnd, t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function sfxHit() {
  tone(180, 0.09, { type: 'square', volume: 0.18, freqEnd: 90 });
}

export function sfxPlayerHurt() {
  tone(140, 0.15, { type: 'sawtooth', volume: 0.16, freqEnd: 60 });
}

export function sfxDeath() {
  tone(300, 0.35, { type: 'triangle', volume: 0.2, freqEnd: 40 });
}

export function sfxPickup() {
  tone(520, 0.08, { type: 'sine', volume: 0.15 });
  tone(780, 0.1, { type: 'sine', volume: 0.15, delay: 0.07 });
}

export function sfxRefuel() {
  tone(300, 0.2, { type: 'sine', volume: 0.15, freqEnd: 700 });
}

export function sfxLowFuel() {
  tone(110, 0.4, { type: 'sine', volume: 0.12, freqEnd: 90 });
}

export function sfxStairs() {
  tone(220, 0.3, { type: 'sine', volume: 0.18, freqEnd: 440 });
  tone(330, 0.3, { type: 'sine', volume: 0.12, delay: 0.08, freqEnd: 550 });
}

export function sfxWin() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, { type: 'sine', volume: 0.18, delay: i * 0.12 }));
}

export function sfxGameOver() {
  tone(220, 0.6, { type: 'sawtooth', volume: 0.16, freqEnd: 55 });
}
