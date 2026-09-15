// Audio sources: the synthesized demo, a dropped file, or the microphone.
//
// The demo is the default so the app is fully functional with no permission
// prompt and no device — which also makes it deterministic and screenshot-able.
// The other two paths are the point of the project: they are the only way a
// signal the author never saw gets into this repo.

import { toMono } from './chroma.js';
import { SAMPLE_RATE } from './synth.js';

let ctx = null;
export function audioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export async function decodeFile(file) {
  const bytes = await file.arrayBuffer();
  const ac = audioContext();
  const buf = await ac.decodeAudioData(bytes);
  const channels = [];
  for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
  return {
    samples: toMono(channels, buf.sampleRate, SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
    sourceRate: buf.sampleRate,
    name: file.name,
  };
}

// Records for a fixed span rather than streaming, because the analysis works
// over a whole buffer and a half-captured chord is not useful.
export async function recordMic(seconds, onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ac = audioContext();
  await ac.resume();
  const source = ac.createMediaStreamSource(stream);
  const processorSize = 4096;
  const node = ac.createScriptProcessor(processorSize, 1, 1);
  const chunks = [];
  let captured = 0;
  const target = Math.ceil(seconds * ac.sampleRate);

  const done = new Promise((resolve) => {
    node.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      chunks.push(Float32Array.from(input));
      captured += input.length;
      if (onLevel) {
        let peak = 0;
        for (let i = 0; i < input.length; i++) peak = Math.max(peak, Math.abs(input[i]));
        onLevel(peak, Math.min(1, captured / target));
      }
      if (captured >= target) resolve();
    };
  });

  source.connect(node);
  node.connect(ac.destination); // required for onaudioprocess to fire in some browsers
  await done;

  node.disconnect();
  source.disconnect();
  for (const t of stream.getTracks()) t.stop();

  const joined = new Float32Array(captured);
  let o = 0;
  for (const c of chunks) { joined.set(c, o); o += c.length; }
  return {
    samples: toMono([joined], ac.sampleRate, SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
    sourceRate: ac.sampleRate,
    name: 'microphone',
  };
}

let current = null;

export function stopPlayback() {
  if (current) {
    try { current.source.stop(); } catch { /* already stopped */ }
    current = null;
  }
}

export function play(samples, sampleRate, onTime, onEnd) {
  stopPlayback();
  const ac = audioContext();
  ac.resume();
  const buf = ac.createBuffer(1, samples.length, sampleRate);
  buf.getChannelData(0).set(samples);
  const source = ac.createBufferSource();
  source.buffer = buf;
  source.connect(ac.destination);
  const startedAt = ac.currentTime;
  source.start();
  current = { source, startedAt };

  let raf = 0;
  const tick = () => {
    if (!current || current.source !== source) return;
    const t = ac.currentTime - startedAt;
    if (t >= buf.duration) { onEnd?.(); return; }
    onTime?.(t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  source.onended = () => {
    cancelAnimationFrame(raf);
    if (current && current.source === source) current = null;
    onEnd?.();
  };
  return () => { cancelAnimationFrame(raf); stopPlayback(); };
}

export function downloadBytes(bytes, filename, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
