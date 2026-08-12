import { createEngine } from './engine.js';
import { scheduleStep, stepDuration, swingOffset } from './transport.js';
import { STEPS, audibleTracks } from './state.js';

/** Seeded so a given project always exports the same file, probability dice included. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function chainFor(project, repeats) {
  if (project.songMode && project.song.length) return project.song.slice();
  return Array.from({ length: repeats }, () => project.patternIndex);
}

export async function renderProject(project, { repeats = 2, tail = 2.5 } = {}) {
  const sampleRate = 44100;
  const chain = chainFor(project, repeats);
  const dur = stepDuration(project);
  const leadIn = 0.03;
  const total = chain.length * STEPS * dur + tail + leadIn;

  const ctx = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  const engine = createEngine(ctx, project);
  const audible = audibleTracks(project);
  const rng = mulberry32(0xc0ffee);

  let time = leadIn;
  for (const patternIndex of chain) {
    for (let s = 0; s < STEPS; s++) {
      scheduleStep(engine, project, patternIndex, s, time + swingOffset(project, s, dur), audible, rng);
      time += dur;
    }
  }
  return ctx.startRendering();
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const dataBytes = frames * channels * 2;
  const ab = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(ab);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const data = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

export async function exportWav(project, options) {
  const buffer = await renderProject(project, options);
  const blob = encodeWav(buffer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const label = project.songMode ? 'song' : `pattern-${'ABCD'[project.patternIndex]}`;
  a.href = url;
  a.download = `pulse-${label}-${project.bpm}bpm.wav`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { seconds: buffer.duration, bytes: blob.size };
}
