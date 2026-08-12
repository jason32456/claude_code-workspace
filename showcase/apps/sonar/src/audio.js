// All sound is synthesized — no audio assets. A shared delay line gives the
// cave its echo.

let ctx = null;
let master = null;
let echoSend = null;
let droneNodes = null;
let heartbeatTimer = 0;

function ensureCtx() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.28;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.42;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 1600;
  echoSend = ctx.createGain();
  echoSend.gain.value = 0.5;
  echoSend.connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  damp.connect(master);
}

export function unlock() {
  ensureCtx();
  if (ctx.state === 'suspended') ctx.resume();
  startDrone();
}

function tone({ freq, endFreq, type = 'sine', dur = 0.3, vol = 0.3, when = 0, echo = 0 }) {
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master);
  if (echo > 0) {
    const send = ctx.createGain();
    send.gain.value = echo;
    g.connect(send);
    send.connect(echoSend);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.25, freq = 400, when = 0 }) {
  const t = ctx.currentTime + when;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
}

function startDrone() {
  if (droneNodes) return;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = 52;
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 52.7; // slow beat against o1
  o1.connect(g);
  o2.connect(g);
  g.connect(master);
  o1.start();
  o2.start();
  droneNodes = { o1, o2, g };
}

export const sfx = {
  ping() {
    tone({ freq: 1250, endFreq: 340, dur: 0.5, vol: 0.22, echo: 0.9 });
  },
  shard() {
    tone({ freq: 880, dur: 0.14, vol: 0.22, type: 'triangle' });
    tone({ freq: 1318, dur: 0.3, vol: 0.2, type: 'triangle', when: 0.09, echo: 0.4 });
  },
  unlock() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.35, vol: 0.16, type: 'triangle', when: i * 0.1, echo: 0.5 }));
  },
  hurt() {
    tone({ freq: 160, endFreq: 55, dur: 0.4, vol: 0.4, type: 'sawtooth' });
    noise({ dur: 0.25, vol: 0.3, freq: 700 });
  },
  clear() {
    [659, 784, 988, 1319].forEach((f, i) =>
      tone({ freq: f, dur: 0.4, vol: 0.18, type: 'triangle', when: i * 0.12, echo: 0.5 }));
  },
  gameOver() {
    [330, 262, 208, 147].forEach((f, i) =>
      tone({ freq: f, dur: 0.6, vol: 0.2, type: 'sawtooth', when: i * 0.22, echo: 0.4 }));
  },
  heartbeat(intensity) {
    // called every frame with 0..1; self-throttles to a beat
    if (!ctx || intensity <= 0) return;
    const now = ctx.currentTime;
    const interval = 1.1 - intensity * 0.65;
    if (now - heartbeatTimer < interval) return;
    heartbeatTimer = now;
    tone({ freq: 68, endFreq: 45, dur: 0.13, vol: 0.28 + intensity * 0.25 });
    tone({ freq: 60, endFreq: 42, dur: 0.11, vol: 0.2 + intensity * 0.2, when: 0.16 });
  },
};
