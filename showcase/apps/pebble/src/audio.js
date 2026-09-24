let ac = null;
let rumbleGain;
let rumbleFilter;
let sweepGain;
let crowdGain;
let master;
let muted = false;

function noiseBuffer(seconds, brown) {
  const len = ac.sampleRate * seconds;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function loop(buf) {
  const s = ac.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start();
  return s;
}

export function initAudio() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume();
    return;
  }
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ac.destination);

  const brown = noiseBuffer(4, true);
  const white = noiseBuffer(2, false);

  rumbleFilter = ac.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 160;
  rumbleGain = ac.createGain();
  rumbleGain.gain.value = 0;
  loop(brown).connect(rumbleFilter).connect(rumbleGain).connect(master);

  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 0.8;
  sweepGain = ac.createGain();
  sweepGain.gain.value = 0;
  loop(white).connect(bp).connect(sweepGain).connect(master);

  const cf = ac.createBiquadFilter();
  cf.type = 'bandpass';
  cf.frequency.value = 700;
  cf.Q.value = 0.4;
  crowdGain = ac.createGain();
  crowdGain.gain.value = 0.012;
  loop(brown).connect(cf).connect(crowdGain).connect(master);
}

let sweepPhase = 0;
export function updateAudio(dt, speed, sweeping) {
  if (!ac) return;
  const t = ac.currentTime;
  rumbleGain.gain.setTargetAtTime(Math.min(0.5, speed * 0.16), t, 0.08);
  rumbleFilter.frequency.setTargetAtTime(90 + speed * 60, t, 0.1);
  sweepPhase += dt * 9;
  const s = sweeping ? 0.05 + 0.05 * Math.abs(Math.sin(sweepPhase * Math.PI)) : 0;
  sweepGain.gain.setTargetAtTime(s, t, 0.02);
}

export function clack(impulse) {
  if (!ac) return;
  const t = ac.currentTime;
  const v = Math.min(1, impulse / 3);
  const o = ac.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(1500 + v * 600, t);
  o.frequency.exponentialRampToValueAtTime(700, t + 0.08);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.5 * v + 0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.2);
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(0.05, false);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.4 * v + 0.05, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  n.connect(hp).connect(ng).connect(master);
  n.start(t);
}

export function cheer(amount = 1) {
  if (!ac) return;
  const t = ac.currentTime;
  crowdGain.gain.cancelScheduledValues(t);
  crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
  crowdGain.gain.linearRampToValueAtTime(0.012 + 0.09 * amount, t + 0.4);
  crowdGain.gain.linearRampToValueAtTime(0.012, t + 3.2);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.8;
  return muted;
}
