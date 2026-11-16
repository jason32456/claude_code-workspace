// Synthesised sound. The law holds here too: only things that move make noise.
// Everything is a silent no-op until unlock() succeeds, and for good where
// Web Audio does not exist (Node, old browsers).

const MAX_DRONES = 4;
const SCREEN_HALF = 160;
const HEARING = 220;
const STALE_MS = 250;

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let brushGain = null;
  let drones = [];
  let lastUpdate = 0;
  let watchdog = null;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function noiseBuffer(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function buildBrush() {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(2);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    brushGain = ctx.createGain();
    brushGain.gain.value = 0;
    source.connect(filter).connect(brushGain).connect(master);
    source.start();
  }

  function buildDrone(index) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52 + index * 5.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 190;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    osc.connect(filter).connect(gain);
    if (pan) gain.connect(pan).connect(master);
    else gain.connect(master);
    osc.start();
    return { gain, pan };
  }

  function silence() {
    if (!ctx) return;
    const t = ctx.currentTime;
    brushGain.gain.setTargetAtTime(0, t, 0.02);
    for (const d of drones) d.gain.gain.setTargetAtTime(0, t, 0.01);
  }

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const Context = typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext);
    if (!Context) return;
    try {
      ctx = new Context();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      buildBrush();
      drones = Array.from({ length: MAX_DRONES }, (_, i) => buildDrone(i));
      watchdog = setInterval(() => {
        if (now() - lastUpdate > STALE_MS) silence();
      }, 120);
      if (ctx.state === 'suspended') ctx.resume();
    } catch {
      ctx = null;
    }
  }

  function setMuted(value) {
    muted = !!value;
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.03);
  }

  // frame: { playerMoving, listener: {x, y}, seekers: [{x, y, moving}] }
  function update(frame) {
    if (!ctx) return;
    lastUpdate = now();
    const t = ctx.currentTime;
    brushGain.gain.setTargetAtTime(frame.playerMoving ? 0.07 : 0, t, frame.playerMoving ? 0.03 : 0.012);
    drones.forEach((drone, i) => {
      const s = frame.seekers[i];
      let level = 0;
      let pan = 0;
      if (s && s.moving) {
        const distance = Math.hypot(s.x - frame.listener.x, s.y - frame.listener.y);
        level = 0.16 * Math.pow(Math.max(0, 1 - distance / HEARING), 1.5);
        pan = Math.max(-1, Math.min(1, (s.x - SCREEN_HALF) / SCREEN_HALF));
      }
      drone.gain.gain.setTargetAtTime(level, t, level ? 0.06 : 0.004);
      if (drone.pan) drone.pan.pan.setTargetAtTime(pan, t, 0.05);
    });
  }

  function envelope(gainNode, peak, attack, release) {
    const t = ctx.currentTime;
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  function tone(type, from, to, peak, attack, release, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + attack + release);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + attack + release + 0.05);
  }

  function burst(seconds, frequency, peak, sweepTo) {
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, ctx.currentTime);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + seconds);
    const gain = ctx.createGain();
    envelope(gain, peak, 0.005, seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  return {
    unlock,
    setMuted,
    update,
    knock() {
      tone('sine', 150, 70, 0.5, 0.004, 0.16);
      burst(0.08, 900, 0.18);
    },
    spark() {
      tone('sine', 520, 880, 0.22, 0.01, 0.28);
    },
    gate() {
      [220, 277.2, 329.6, 440].forEach((f, i) => tone('triangle', f, f, 0.14, 0.05, 1.1, i * 0.06));
    },
    caught() {
      burst(0.55, 3200, 0.5, 120);
    },
    dispose() {
      if (watchdog) clearInterval(watchdog);
    },
  };
}
