// Card sounds, synthesised.
//
// Nothing is loaded — every sound here is built from noise and oscillators at
// runtime, so the game stays self-contained, works offline, and adds no bytes
// to the page. A real card sound is mostly a short burst of broadband noise
// shaped by a filter: a flick is bright and fast, a card landing on felt is
// duller with a little low-frequency body under it.
//
// Browsers will not start audio without a user gesture, so the context is
// created lazily on the first interaction and resumed if it was suspended.

const STORE_KEY = 'capsa:sound';

let ctx = null;
let master = null;
let noise = null;
let enabled = read();

function read() {
  try {
    return localStorage.getItem(STORE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function write(on) {
  try {
    localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
  } catch { /* private mode — the preference just won't persist */ }
}

// One second of white noise, generated once and reused by every voice.
function buildNoise(context) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    ctx = new AudioCtx();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);
  noise = buildNoise(ctx);
  return ctx;
}

function envelope(param, start, peak, attack, decay) {
  param.setValueAtTime(0.0001, start);
  param.linearRampToValueAtTime(peak, start + attack);
  // Exponential decay reads as a physical object losing energy; a linear one
  // sounds switched off rather than settled.
  param.exponentialRampToValueAtTime(0.0001, start + attack + decay);
}

function noiseHit(start, { freq = 2200, q = 0.9, decay = 0.08, gain = 0.4, type = 'bandpass' }) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  // Slight per-hit variation, so a run of cards never sounds like a loop.
  source.playbackRate.value = 0.85 + Math.random() * 0.3;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq * (0.92 + Math.random() * 0.16);
  filter.Q.value = q;

  const amp = ctx.createGain();
  source.connect(filter);
  filter.connect(amp);
  amp.connect(master);

  envelope(amp.gain, start, gain, 0.002, decay);
  source.start(start);
  source.stop(start + decay + 0.06);
}

function tone(start, { freq = 440, decay = 0.2, gain = 0.2, type = 'sine', glideTo = null }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + decay);

  const amp = ctx.createGain();
  osc.connect(amp);
  amp.connect(master);

  envelope(amp.gain, start, gain, 0.004, decay);
  osc.start(start);
  osc.stop(start + decay + 0.06);
}

/* ── The sounds ──────────────────────────────────────────────────────────── */

const voices = {
  // Picking a card out of the fan: a small, bright tick.
  select(t) {
    noiseHit(t, { freq: 3400, q: 1.6, decay: 0.035, gain: 0.16 });
  },

  deselect(t) {
    noiseHit(t, { freq: 2300, q: 1.4, decay: 0.03, gain: 0.12 });
  },

  // A card landing on felt: bright snap, then a soft body under it. Several
  // cards land in a quick stagger rather than all together.
  place(t, count = 1) {
    for (let i = 0; i < count; i++) {
      const at = t + i * 0.045;
      noiseHit(at, { freq: 1700, q: 0.7, decay: 0.11, gain: 0.34 });
      tone(at, { freq: 96 + Math.random() * 22, decay: 0.075, gain: 0.16 });
    }
  },

  // Dealing: a run of flicks matching the visual stagger of the fan.
  deal(t, count = 13) {
    for (let i = 0; i < count; i++) {
      noiseHit(t + i * 0.034, { freq: 2800, q: 1.1, decay: 0.05, gain: 0.13 });
    }
  },

  // Passing: a dull knock on the table, no card in it.
  pass(t) {
    noiseHit(t, { freq: 520, q: 0.6, decay: 0.11, gain: 0.24, type: 'lowpass' });
    tone(t, { freq: 132, decay: 0.09, gain: 0.11 });
  },

  // The trick being gathered up and pulled off the table.
  sweep(t) {
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(420, t + 0.4);

    const amp = ctx.createGain();
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);

    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.22, t + 0.05);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    source.start(t);
    source.stop(t + 0.5);
  },

  // Your turn: a discreet two-note nudge, not an alarm.
  turn(t) {
    tone(t, { freq: 784, decay: 0.09, gain: 0.075 });
    tone(t + 0.075, { freq: 1046.5, decay: 0.12, gain: 0.065 });
  },

  // Winning the hand: a short major arpeggio.
  win(t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      tone(t + i * 0.085, { freq, decay: 0.42, gain: 0.14, type: 'triangle' });
    });
  },

  // Losing the hand: the same shape, resolving downward.
  lose(t) {
    [523.25, 466.16, 392].forEach((freq, i) => {
      tone(t + i * 0.1, { freq, decay: 0.34, gain: 0.1, type: 'triangle' });
    });
  },

  // A move the rules will not allow.
  invalid(t) {
    tone(t, { freq: 190, decay: 0.16, gain: 0.13, type: 'square', glideTo: 120 });
  },

  click(t) {
    noiseHit(t, { freq: 2600, q: 2, decay: 0.02, gain: 0.09 });
  },
};

/* ── API ─────────────────────────────────────────────────────────────────── */

export function play(name, ...args) {
  if (!enabled) return;
  const voice = voices[name];
  if (!voice) return;
  if (!ensure()) return;
  // A suspended context can still schedule, but nothing is audible until a
  // gesture resumes it — so never throw if that has not happened yet.
  try {
    voice(ctx.currentTime + 0.001, ...args);
  } catch { /* audio is a nicety; never let it break a turn */ }
}

export function isEnabled() {
  return enabled;
}

export function setEnabled(on) {
  enabled = Boolean(on);
  write(enabled);
  if (enabled) {
    ensure();
    play('click');
  }
}

export function toggle() {
  setEnabled(!enabled);
  return enabled;
}

// Audio cannot start until the user has interacted with the page, so the very
// first gesture — signing in, pressing Deal — is what brings it to life.
export function unlockOnFirstGesture() {
  const wake = () => {
    if (enabled) ensure();
  };
  for (const event of ['pointerdown', 'keydown']) {
    window.addEventListener(event, wake, { once: true, passive: true });
  }
}
