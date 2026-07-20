// Color state: curated default palette, custom picker, recent colors.

// Endesga 32 — a classic pixel-art palette.
export const DEFAULT_PALETTE = [
  '#be4a2f', '#d77643', '#ead4aa', '#e4a672',
  '#b86f50', '#733e39', '#3e2731', '#a22633',
  '#e43b44', '#f77622', '#feae34', '#fee761',
  '#63c74d', '#3e8948', '#265c42', '#193c3e',
  '#124e89', '#0099db', '#2ce8f5', '#ffffff',
  '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
  '#262b44', '#181425', '#ff0044', '#68386c',
  '#b55088', '#f6757a', '#e8b796', '#c28569',
];

const MAX_RECENT = 8;

export class Palette {
  constructor() {
    this.color = '#e43b44';
    this.recent = [];
    this.onColorChange = null;
  }

  setColor(color) {
    this.color = color.toLowerCase();
    this.onColorChange?.(this.color);
  }

  addRecent(color) {
    color = color.toLowerCase();
    if (DEFAULT_PALETTE.includes(color)) return;
    this.recent = [color, ...this.recent.filter((c) => c !== color)].slice(0, MAX_RECENT);
  }
}
