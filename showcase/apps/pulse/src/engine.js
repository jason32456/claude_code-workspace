import { createNoiseBuffer, playVoice } from './voices.js';
import { ALL_TRACKS } from './kits.js';
import { midiToFreq, scaleLadder } from './theory.js';
import { VEL_LEVELS, DELAY_DIVS, isMelodic, trackDef } from './state.js';

/** Decaying, progressively darkened noise — a plate reverb without a plate. */
function makeImpulse(ctx, seconds, decay = 2.4) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 0x2545f491;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const r = seed / 0x7fffffff - 1;
      const t = i / len;
      lp += (r - lp) * (0.55 - 0.35 * t);
      d[i] = lp * Math.pow(1 - t, decay) * 0.6;
    }
  }
  return buf;
}

function softClipCurve(amount) {
  const k = amount * 60;
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/**
 * Builds the full signal path in whichever context it is handed, so live
 * playback and offline WAV rendering run byte-identical code.
 */
export function createEngine(ctx, project) {
  const res = { noise: createNoiseBuffer(ctx) };

  const out = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;

  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type = 'lowpass';
  masterFilter.Q.value = 0.9;

  const drive = ctx.createWaveShaper();
  drive.oversample = '2x';
  const driveMakeup = ctx.createGain();

  // Sub-audible rumble from the kick's pitch tail costs headroom and buys nothing.
  const rumbleCut = ctx.createBiquadFilter();
  rumbleCut.type = 'highpass';
  rumbleCut.frequency.value = 28;

  const preDrive = ctx.createGain();
  preDrive.connect(drive);
  drive.connect(driveMakeup);
  driveMakeup.connect(rumbleCut);
  rumbleCut.connect(masterFilter);
  masterFilter.connect(comp);
  comp.connect(out);
  out.connect(ctx.destination);

  const delay = ctx.createDelay(2);
  const delayFb = ctx.createGain();
  const delayDamp = ctx.createBiquadFilter();
  delayDamp.type = 'lowpass';
  delayDamp.frequency.value = 3800;
  const delayWet = ctx.createGain();
  delay.connect(delayDamp);
  delayDamp.connect(delayFb);
  delayFb.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(preDrive);

  const convolver = ctx.createConvolver();
  const reverbWet = ctx.createGain();
  convolver.connect(reverbWet);
  reverbWet.connect(preDrive);
  let irSize = -1;

  const channels = {};
  for (const t of ALL_TRACKS) {
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const delaySend = ctx.createGain();
    const reverbSend = ctx.createGain();
    gain.connect(pan);
    pan.connect(preDrive);
    pan.connect(delaySend);
    pan.connect(reverbSend);
    delaySend.connect(delay);
    reverbSend.connect(convolver);
    channels[t.id] = { gain, pan, delaySend, reverbSend };
  }

  let lastDrive = -1;

  /** Pushes the project's mix + FX values onto the graph. Cheap; call freely. */
  function sync() {
    const fx = project.fx;
    for (const t of ALL_TRACKS) {
      const m = project.mix[t.id];
      const c = channels[t.id];
      c.gain.gain.value = m.vol;
      c.pan.pan.value = m.pan;
      c.delaySend.gain.value = m.delay;
      c.reverbSend.gain.value = m.reverb;
    }
    masterFilter.frequency.value = fx.filter;
    out.gain.value = fx.master;

    if (fx.drive !== lastDrive) {
      drive.curve = softClipCurve(fx.drive);
      driveMakeup.gain.value = 1 / (1 + fx.drive * 1.8);
      lastDrive = fx.drive;
    }

    const beat = 60 / project.bpm;
    delay.delayTime.value = Math.min(2, beat * (DELAY_DIVS[fx.delayDiv] ?? 0.75));
    delayFb.gain.value = Math.min(0.85, fx.delayFb);
    delayWet.gain.value = fx.delayMix;
    reverbWet.gain.value = fx.reverbMix;

    const size = Math.round(fx.reverbSize * 10);
    if (size !== irSize) {
      convolver.buffer = makeImpulse(ctx, Math.max(0.2, fx.reverbSize));
      irSize = size;
    }
  }

  function ladderFor(trackId) {
    const def = trackDef(trackId);
    return scaleLadder(def.baseMidi + project.key.root, project.key.scale, def.rows);
  }

  function play(trackId, time, velIndex, seed, degree) {
    const def = trackDef(trackId);
    const vel = VEL_LEVELS[velIndex] ?? 1;
    let freq;
    if (isMelodic(trackId)) {
      const ladder = ladderFor(trackId);
      freq = midiToFreq(ladder[Math.min(degree, ladder.length - 1)]);
    }
    playVoice(def.voice, ctx, res, channels[trackId].gain, time, project.voice[trackId], vel, seed, freq);
  }

  sync();

  return { ctx, play, sync, ladderFor, output: out };
}
