// Every sound is synthesised at runtime — the app ships no audio files.

let ctx = null;
let master = null;
let roomGain = null;
let drone = null;
let droneGain = null;
let muted = false;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  // Room tone: two detuned saws under a slow-breathing lowpass.
  roomGain = ctx.createGain();
  roomGain.gain.value = 0.0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  lp.Q.value = 2;
  roomGain.connect(lp).connect(master);
  for (const f of [41.2, 61.7, 82.4]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 14;
    const g = ctx.createGain();
    g.gain.value = 0.24;
    o.connect(g).connect(roomGain);
    o.start();
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 90;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();
  roomGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 3);

  // The turning drone: always running, gated by how fast something is rotating.
  drone = ctx.createOscillator();
  drone.type = 'triangle';
  drone.frequency.value = 120;
  droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  const dfil = ctx.createBiquadFilter();
  dfil.type = 'bandpass';
  dfil.frequency.value = 320;
  dfil.Q.value = 1.4;
  drone.connect(droneGain).connect(dfil).connect(master);
  drone.start();
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05);
}

export function isMuted() { return muted; }

function noiseBuffer(dur) {
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  return buf;
}

function blip({ freq = 440, to = null, type = 'sine', dur = 0.16, gain = 0.2, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function thud({ gain = 0.3, dur = 0.2, cut = 900 }) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cut, t);
  f.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = ctx.createGain();
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
}

export const sfx = {
  step() { thud({ gain: 0.055, dur: 0.07, cut: 2400 }); },
  jump() { blip({ freq: 300, to: 620, type: 'triangle', dur: 0.14, gain: 0.14 }); },
  land(power) { thud({ gain: 0.1 + 0.16 * power, dur: 0.16, cut: 700 }); },
  mote() {
    blip({ freq: 880, type: 'sine', dur: 0.5, gain: 0.16 });
    blip({ freq: 1320, type: 'sine', dur: 0.42, gain: 0.09, delay: 0.05 });
  },
  grab() { blip({ freq: 220, to: 300, type: 'sine', dur: 0.09, gain: 0.09 }); },
  release() { blip({ freq: 300, to: 210, type: 'sine', dur: 0.09, gain: 0.07 }); },
  sealOpen() {
    [392, 523.25, 659.25, 784].forEach((f, i) =>
      blip({ freq: f, type: 'triangle', dur: 0.9, gain: 0.12, delay: i * 0.07 }));
  },
  sealClose() { blip({ freq: 420, to: 180, type: 'triangle', dur: 0.28, gain: 0.1 }); },
  crush() {
    thud({ gain: 0.42, dur: 0.36, cut: 500 });
    blip({ freq: 120, to: 40, type: 'square', dur: 0.34, gain: 0.14 });
  },
  fall() { blip({ freq: 420, to: 90, type: 'sawtooth', dur: 0.5, gain: 0.12 }); },
  door() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      blip({ freq: f, type: 'sine', dur: 1.1, gain: 0.14, delay: i * 0.11 }));
  },
  ui() { blip({ freq: 660, type: 'sine', dur: 0.08, gain: 0.08 }); },
};

// Angular speed of whatever the player is turning, mapped onto a live drone.
export function setTurnDrone(speed) {
  if (!droneGain || !ctx) return;
  const s = Math.min(1, speed / 3.2);
  droneGain.gain.setTargetAtTime(s * 0.06, ctx.currentTime, 0.08);
  drone.frequency.setTargetAtTime(90 + s * 190, ctx.currentTime, 0.08);
}
