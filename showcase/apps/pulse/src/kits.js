export const DRUM_TRACKS = [
  { id: 'kick', name: 'Kick', voice: 'kick', hue: 8 },
  { id: 'snare', name: 'Snare', voice: 'snare', hue: 32 },
  { id: 'clap', name: 'Clap', voice: 'clap', hue: 48 },
  { id: 'chat', name: 'Cl Hat', voice: 'hat', hue: 168 },
  { id: 'ohat', name: 'Op Hat', voice: 'hat', hue: 190 },
  { id: 'tom', name: 'Tom', voice: 'tom', hue: 320 },
  { id: 'rim', name: 'Rim', voice: 'rim', hue: 270 },
  { id: 'bell', name: 'Cowbell', voice: 'cowbell', hue: 92 },
];

export const SYNTH_TRACKS = [
  { id: 'bass', name: 'Bass', voice: 'bass', hue: 210, baseMidi: 36, rows: 12 },
  { id: 'lead', name: 'Lead', voice: 'lead', hue: 288, baseMidi: 60, rows: 12 },
];

export const ALL_TRACKS = [...DRUM_TRACKS, ...SYNTH_TRACKS];
export const DRUM_COUNT = DRUM_TRACKS.length;

/** Parameter schemas drive both the synth voices and the generated inspector UI. */
export const VOICE_PARAMS = {
  kick: [
    { k: 'tune', label: 'Tune', min: 32, max: 90, step: 1, unit: 'Hz' },
    { k: 'decay', label: 'Decay', min: 0.08, max: 1.4, step: 0.01, unit: 's' },
    { k: 'punch', label: 'Punch', min: 0, max: 1, step: 0.01 },
    { k: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01 },
  ],
  snare: [
    { k: 'tune', label: 'Tune', min: 100, max: 400, step: 1, unit: 'Hz' },
    { k: 'decay', label: 'Decay', min: 0.04, max: 0.7, step: 0.01, unit: 's' },
    { k: 'snap', label: 'Snap', min: 0, max: 1, step: 0.01 },
    { k: 'tone', label: 'Tone', min: 600, max: 6000, step: 10, unit: 'Hz' },
  ],
  clap: [
    { k: 'tone', label: 'Tone', min: 500, max: 3500, step: 10, unit: 'Hz' },
    { k: 'decay', label: 'Decay', min: 0.08, max: 0.8, step: 0.01, unit: 's' },
    { k: 'spread', label: 'Spread', min: 0.004, max: 0.03, step: 0.001, unit: 's' },
  ],
  hat: [
    { k: 'tune', label: 'Tune', min: 20, max: 90, step: 1, unit: 'Hz' },
    { k: 'tone', label: 'Tone', min: 3000, max: 12000, step: 50, unit: 'Hz' },
    { k: 'decay', label: 'Decay', min: 0.02, max: 0.9, step: 0.01, unit: 's' },
  ],
  tom: [
    { k: 'tune', label: 'Tune', min: 70, max: 340, step: 1, unit: 'Hz' },
    { k: 'decay', label: 'Decay', min: 0.08, max: 0.9, step: 0.01, unit: 's' },
    { k: 'bend', label: 'Bend', min: 0, max: 1, step: 0.01 },
  ],
  rim: [
    { k: 'tune', label: 'Tune', min: 200, max: 1600, step: 5, unit: 'Hz' },
    { k: 'decay', label: 'Decay', min: 0.01, max: 0.12, step: 0.005, unit: 's' },
  ],
  cowbell: [
    { k: 'tune', label: 'Tune', min: 300, max: 1200, step: 5, unit: 'Hz' },
    { k: 'decay', label: 'Decay', min: 0.05, max: 0.6, step: 0.01, unit: 's' },
  ],
  bass: [
    { k: 'wave', label: 'Wave', options: ['sawtooth', 'square', 'sine', 'triangle'] },
    { k: 'sub', label: 'Sub', min: 0, max: 1, step: 0.01 },
    { k: 'cutoff', label: 'Cutoff', min: 120, max: 6000, step: 10, unit: 'Hz' },
    { k: 'reso', label: 'Reso', min: 0.5, max: 18, step: 0.1 },
    { k: 'envAmt', label: 'Env', min: 0, max: 1, step: 0.01 },
    { k: 'decay', label: 'Decay', min: 0.05, max: 1.2, step: 0.01, unit: 's' },
  ],
  lead: [
    { k: 'wave', label: 'Wave', options: ['sawtooth', 'square', 'triangle', 'sine'] },
    { k: 'detune', label: 'Detune', min: 0, max: 30, step: 0.5, unit: '¢' },
    { k: 'cutoff', label: 'Cutoff', min: 300, max: 9000, step: 20, unit: 'Hz' },
    { k: 'reso', label: 'Reso', min: 0.5, max: 16, step: 0.1 },
    { k: 'envAmt', label: 'Env', min: 0, max: 1, step: 0.01 },
    { k: 'decay', label: 'Decay', min: 0.05, max: 1.4, step: 0.01, unit: 's' },
  ],
};

const BASE = {
  kick: { tune: 50, decay: 0.3, punch: 0.6, drive: 0.25 },
  snare: { tune: 190, decay: 0.18, snap: 0.6, tone: 1900 },
  clap: { tone: 1250, decay: 0.24, spread: 0.012 },
  chat: { tune: 40, tone: 8200, decay: 0.05 },
  ohat: { tune: 40, tone: 7400, decay: 0.34 },
  tom: { tune: 150, decay: 0.32, bend: 0.5 },
  rim: { tune: 800, decay: 0.03 },
  bell: { tune: 540, decay: 0.22 },
  bass: { wave: 'sawtooth', sub: 0.32, cutoff: 900, reso: 8, envAmt: 0.6, decay: 0.32 },
  lead: { wave: 'square', detune: 9, cutoff: 2600, reso: 6, envAmt: 0.45, decay: 0.3 },
};

/** Kits are shallow overrides on top of BASE, so a kit only states what it changes. */
export const KITS = {
  '808': { name: '808', params: {} },
  '909': {
    name: '909',
    params: {
      kick: { tune: 55, decay: 0.3, punch: 0.8, drive: 0.45 },
      snare: { tune: 240, decay: 0.13, snap: 0.85, tone: 2600 },
      clap: { tone: 1600, decay: 0.18, spread: 0.009 },
      chat: { tune: 55, tone: 9600, decay: 0.038 },
      ohat: { tune: 55, tone: 8800, decay: 0.26 },
      tom: { tune: 180, decay: 0.24, bend: 0.7 },
      bass: { wave: 'square', sub: 0.35, cutoff: 1400, reso: 10, envAmt: 0.7, decay: 0.24 },
      lead: { wave: 'sawtooth', detune: 14, cutoff: 3600, reso: 7, envAmt: 0.6, decay: 0.22 },
    },
  },
  lofi: {
    name: 'Lo-Fi',
    params: {
      kick: { tune: 44, decay: 0.4, punch: 0.35, drive: 0.1 },
      snare: { tune: 165, decay: 0.24, snap: 0.35, tone: 1200 },
      clap: { tone: 900, decay: 0.32, spread: 0.018 },
      chat: { tune: 32, tone: 5200, decay: 0.07 },
      ohat: { tune: 32, tone: 4800, decay: 0.42 },
      tom: { tune: 120, decay: 0.42, bend: 0.35 },
      rim: { tune: 620, decay: 0.045 },
      bell: { tune: 460, decay: 0.3 },
      bass: { wave: 'triangle', sub: 0.75, cutoff: 520, reso: 4, envAmt: 0.35, decay: 0.45 },
      lead: { wave: 'triangle', detune: 5, cutoff: 1500, reso: 3, envAmt: 0.3, decay: 0.5 },
    },
  },
  acoustic: {
    name: 'Acoustic',
    params: {
      kick: { tune: 62, decay: 0.26, punch: 0.9, drive: 0.05 },
      snare: { tune: 210, decay: 0.28, snap: 0.95, tone: 3200 },
      clap: { tone: 2100, decay: 0.3, spread: 0.02 },
      chat: { tune: 68, tone: 10500, decay: 0.045 },
      ohat: { tune: 68, tone: 9800, decay: 0.4 },
      tom: { tune: 130, decay: 0.5, bend: 0.9 },
      rim: { tune: 1100, decay: 0.02 },
      bell: { tune: 720, decay: 0.16 },
      bass: { wave: 'sine', sub: 0.8, cutoff: 700, reso: 2, envAmt: 0.4, decay: 0.5 },
      lead: { wave: 'triangle', detune: 3, cutoff: 2200, reso: 2, envAmt: 0.35, decay: 0.6 },
    },
  },
};

export function kitParams(kitKey) {
  const kit = KITS[kitKey] || KITS['808'];
  const out = {};
  for (const id of Object.keys(BASE)) {
    out[id] = { ...BASE[id], ...(kit.params[id] || {}) };
  }
  return out;
}

export function paramsFor(trackId) {
  const track = ALL_TRACKS.find((t) => t.id === trackId);
  return VOICE_PARAMS[track.voice];
}
