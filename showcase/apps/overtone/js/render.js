// Canvas rendering for the analysis strips.
//
// Heatmaps use a single-hue sequential ramp (dark -> bright), never a rainbow:
// magnitude is a magnitude, and a hue cycle would invent structure that is not
// in the data. The two categorical colours used for the argmax-vs-Viterbi
// comparison are validated for CVD separation against this surface.

import { chordLabel, STATE_COUNT, NO_CHORD } from './chords.js';

export const SERIES = {
  argmax: '#c07d20',
  viterbi: '#3b82f6',
};

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Sequential ramp, dark blue-grey through teal to pale. Monotone in lightness so
// it survives greyscale printing and colour-vision deficiency.
function ramp(t) {
  const v = Math.max(0, Math.min(1, t));
  const stops = [
    [14, 20, 28], [20, 46, 62], [22, 84, 94],
    [40, 132, 122], [110, 180, 130], [200, 224, 180], [242, 246, 228],
  ];
  const x = v * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

export function fitCanvas(canvas, cssHeight) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
  canvas.style.height = `${cssHeight}px`;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h: cssHeight };
}

// Spectrogram with a log-frequency y-axis, which is the only axis on which
// musical intervals are a constant distance.
export function drawSpectrogram(canvas, analysis, { height = 150, maxFreq = 4000 } = {}) {
  const { g, w, h } = fitCanvas(canvas, height);
  g.fillStyle = '#0d1218';
  g.fillRect(0, 0, w, h);
  if (!analysis || analysis.frames === 0) return;

  const { spectra, frames, sampleRate, frameSize } = analysis;
  const minFreq = 55;
  const logMin = Math.log2(minFreq);
  const logMax = Math.log2(maxFreq);

  let peak = 1e-9;
  for (const s of spectra) for (let i = 0; i < s.length; i++) peak = Math.max(peak, s[i]);

  const img = g.createImageData(Math.floor(w), Math.floor(h));
  for (let x = 0; x < Math.floor(w); x++) {
    const f = Math.min(frames - 1, Math.floor((x / w) * frames));
    const spec = spectra[f];
    for (let y = 0; y < Math.floor(h); y++) {
      const freq = 2 ** (logMax - (y / h) * (logMax - logMin));
      const bin = Math.round((freq * frameSize) / sampleRate);
      const mag = bin < spec.length ? spec[bin] : 0;
      // dB scaling, because linear magnitude renders as a black rectangle with
      // three bright dots.
      const db = 20 * Math.log10(mag / peak + 1e-9);
      const t = Math.max(0, Math.min(1, (db + 72) / 72));
      const c = ramp(t).match(/\d+/g);
      const o = (y * Math.floor(w) + x) * 4;
      img.data[o] = +c[0]; img.data[o + 1] = +c[1]; img.data[o + 2] = +c[2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

export function drawChromagram(canvas, chroma, { height = 150 } = {}) {
  const { g, w, h } = fitCanvas(canvas, height);
  g.fillStyle = '#0d1218';
  g.fillRect(0, 0, w, h);
  if (!chroma || chroma.length === 0) return;

  const rowH = h / 12;
  const colW = w / chroma.length;
  for (let x = 0; x < chroma.length; x++) {
    for (let p = 0; p < 12; p++) {
      g.fillStyle = ramp(chroma[x][p]);
      g.fillRect(x * colW, h - (p + 1) * rowH, Math.ceil(colW) + 0.5, rowH + 0.5);
    }
  }
  g.font = '10px ui-monospace, monospace';
  g.textBaseline = 'middle';
  for (let p = 0; p < 12; p++) {
    const y = h - (p + 0.5) * rowH;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, y - 6, 20, 12);
    g.fillStyle = '#c3ccd8';
    g.fillText(PITCH_NAMES[p], 3, y);
  }
}

// Posterior heatmap with the decoded path drawn over it. The path is the
// argument for the whole decode stage, so it gets a real line rather than a tint.
export function drawPosterior(canvas, posteriors, path, { height = 220 } = {}) {
  const { g, w, h } = fitCanvas(canvas, height);
  g.fillStyle = '#0d1218';
  g.fillRect(0, 0, w, h);
  if (!posteriors || posteriors.length === 0) return;

  const rowH = h / STATE_COUNT;
  const colW = w / posteriors.length;
  for (let x = 0; x < posteriors.length; x++) {
    for (let s = 0; s < STATE_COUNT; s++) {
      const v = posteriors[x][s];
      if (v < 0.004) continue;
      g.fillStyle = ramp(Math.min(1, v * 2.4));
      g.fillRect(x * colW, h - (s + 1) * rowH, Math.ceil(colW) + 0.5, rowH + 0.5);
    }
  }

  if (path && path.length) {
    g.strokeStyle = SERIES.viterbi;
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x < path.length; x++) {
      const y = h - (path[x] + 0.5) * rowH;
      const px = (x + 0.5) * colW;
      if (x === 0) g.moveTo(px, y);
      else g.lineTo(px, y);
    }
    g.stroke();
  }

  g.font = '9px ui-monospace, monospace';
  g.textBaseline = 'middle';
  for (let s = 0; s < STATE_COUNT; s += 2) {
    const y = h - (s + 0.5) * rowH;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, y - 5, 22, 10);
    g.fillStyle = '#9aa6b6';
    g.fillText(chordLabel(s), 3, y);
  }
}

// One frame's chroma, raw beside harmonically-summed, so the ghost pitch classes
// the summation invents are visible rather than described.
export function drawChromaBars(canvas, raw, harm, chordTones, { height = 160 } = {}) {
  const { g, w, h } = fitCanvas(canvas, height);
  g.clearRect(0, 0, w, h);
  if (!raw) return;

  const pad = 22;
  const base = h - 20;
  const slot = (w - pad) / 12;
  const barW = slot * 0.36;

  g.font = '10px ui-monospace, monospace';
  g.textAlign = 'center';

  for (let p = 0; p < 12; p++) {
    const x = pad + p * slot + slot / 2;
    const inChord = chordTones?.includes(p);

    if (inChord) {
      g.fillStyle = 'rgba(95,208,160,0.10)';
      g.fillRect(x - slot / 2, 4, slot, base - 4);
    }

    const hr = (raw[p] || 0) * (base - 14);
    g.fillStyle = inChord ? '#5fd0a0' : '#4a5a70';
    g.fillRect(x - barW - 1, base - hr, barW, hr);

    if (harm) {
      const hh = (harm[p] || 0) * (base - 14);
      const ghost = !inChord && harm[p] - raw[p] > 0.07;
      g.fillStyle = ghost ? '#e5484d' : (inChord ? '#2f7f62' : '#39485c');
      g.fillRect(x + 1, base - hh, barW, hh);
    }

    g.fillStyle = inChord ? '#5fd0a0' : '#8b97a8';
    g.fillText(PITCH_NAMES[p], x, h - 6);
  }

  g.textAlign = 'left';
  g.fillStyle = '#6b7788';
  g.fillText('left: raw   right: harmonic sum   red: invented', pad, 12);
}

export function drawChordChart(host, segments, truthSegments) {
  host.replaceChildren();
  if (!segments.length) return;
  // Both rows are normalized against the same span, or the truth row and the
  // heard row drift apart and stop being comparable at a glance — which is the
  // only thing this chart is for.
  const total = Math.max(
    segments[segments.length - 1].endTime,
    truthSegments?.[truthSegments.length - 1]?.endTime ?? 0,
  ) || 1;

  const row = (segs, label, isTruth) => {
    const wrap = document.createElement('div');
    wrap.className = 'chart-row';
    const tag = document.createElement('span');
    tag.className = 'chart-tag';
    tag.textContent = label;
    wrap.append(tag);
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    for (const s of segs) {
      const cell = document.createElement('div');
      cell.className = `chord-cell${s.chord === NO_CHORD ? ' none' : ''}${isTruth ? ' truth' : ''}`;
      cell.style.width = `${((s.endTime - s.startTime) / total) * 100}%`;
      cell.textContent = s.label;
      cell.title = `${s.label}  ${s.startTime.toFixed(2)}s – ${s.endTime.toFixed(2)}s`;
      bar.append(cell);
    }
    wrap.append(bar);
    return wrap;
  };

  if (truthSegments) host.append(row(truthSegments, 'truth', true));
  host.append(row(segments, 'heard', false));
}

// Playhead overlay shared by every strip.
export function drawPlayhead(canvas, fraction) {
  const g = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  g.save();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(fraction * w, 0);
  g.lineTo(fraction * w, h);
  g.stroke();
  g.restore();
}
