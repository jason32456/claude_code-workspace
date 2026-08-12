export const GRADIENTS = [
  { id: 'sunset', name: 'Sunset', stops: ['#ff9a4d', '#ff5f6d', '#c341a8'] },
  { id: 'ocean', name: 'Ocean', stops: ['#2e3192', '#1bffff'] },
  { id: 'mint', name: 'Mint', stops: ['#43e97b', '#38f9d7'] },
  { id: 'grape', name: 'Grape', stops: ['#7f5af0', '#2cb67d'] },
  { id: 'ember', name: 'Ember', stops: ['#f83600', '#f9d423'] },
  { id: 'dusk', name: 'Dusk', stops: ['#0f2027', '#203a43', '#2c5364'] },
  { id: 'candy', name: 'Candy', stops: ['#ff9a9e', '#fecfef'] },
  { id: 'lagoon', name: 'Lagoon', stops: ['#4facfe', '#00f2fe'] },
  { id: 'peach', name: 'Peach', stops: ['#ffecd2', '#fcb69f'] },
  { id: 'nightshade', name: 'Nightshade', stops: ['#231557', '#44107a', '#ff1361'] },
  { id: 'forest', name: 'Forest', stops: ['#134e5e', '#71b280'] },
  { id: 'slate', name: 'Slate', stops: ['#e2e8f0', '#94a3b8'] },
];

export const RATIOS = [
  { id: 'auto', label: 'Auto', value: null },
  { id: '16-9', label: '16:9', value: 16 / 9 },
  { id: '4-3', label: '4:3', value: 4 / 3 },
  { id: '1-1', label: '1:1', value: 1 },
  { id: '3-2', label: '3:2', value: 3 / 2 },
  { id: '4-5', label: '4:5', value: 4 / 5 },
];

export const FRAMES = [
  { id: 'none', label: 'None' },
  { id: 'macos', label: 'macOS' },
  { id: 'dark', label: 'Dark' },
];

export const DEFAULTS = {
  bgMode: 'gradient',
  gradient: 'sunset',
  angle: 135,
  solid: '#1e293b',
  padding: 12,
  radius: 16,
  tilt: 0,
  shadow: 45,
  border: true,
  frame: 'none',
  ratio: 'auto',
  scale: 2,
};

export function gradientById(id) {
  return GRADIENTS.find((g) => g.id === id) ?? GRADIENTS[0];
}
