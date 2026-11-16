import { PRESETS, PRESET_SIZE, drawPreset } from './presets.js';
import { canvasToShape, paintShape } from './stage-raster.js';

const PAD_W = 420;
const PAD_H = 240;
const BRUSH = 15;

function accent() {
  return getComputedStyle(document.documentElement).getPropertyValue('--ramp-0').trim() || '#cf4f3a';
}

class Pad {
  constructor(canvas, onStroke) {
    this.canvas = canvas;
    canvas.width = PAD_W;
    canvas.height = PAD_H;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.onStroke = onStroke;
    this.last = null;
    this.inked = false;
    canvas.addEventListener('pointerdown', (e) => this.begin(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    const end = () => this.end();
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  at(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * PAD_W, ((e.clientY - rect.top) / rect.height) * PAD_H];
  }

  begin(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.last = this.at(e);
    this.stroke(this.last, this.last);
  }

  move(e) {
    if (!this.last) return;
    const p = this.at(e);
    this.stroke(this.last, p);
    this.last = p;
  }

  end() {
    if (!this.last) return;
    this.last = null;
    this.onStroke();
  }

  stroke(from, to) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = accent();
    ctx.fillStyle = accent();
    ctx.lineWidth = BRUSH * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
    ctx.restore();
    this.inked = true;
  }

  clear() {
    this.ctx.clearRect(0, 0, PAD_W, PAD_H);
    this.inked = false;
  }

  trace(detail) {
    return this.inked ? canvasToShape(this.canvas, detail) : [];
  }

  paint(shape) {
    this.clear();
    if (!shape?.length) return;
    paintShape(this.ctx, shape, PAD_W, PAD_H, accent());
    this.inked = true;
  }

  snapshot() {
    return this.ctx.getImageData(0, 0, PAD_W, PAD_H);
  }

  restore(image, inked) {
    this.ctx.putImageData(image, 0, 0);
    this.inked = inked;
  }
}

export class Panel {
  constructor(root, { side, onChange }) {
    this.root = root;
    this.side = side;
    this.onChange = onChange;
    this.state = { mode: 'word', text: '', preset: PRESETS[0].name, drawn: null };
    this.tabs = [...root.querySelectorAll('[role=tab]')];
    this.panes = [...root.querySelectorAll('[data-pane]')];
    this.field = root.querySelector('.word');
    this.pad = new Pad(root.querySelector('.pad'), () => this.padChanged());
    this.thumbs = [];

    this.tabs.forEach((tab) => tab.addEventListener('click', () => this.setMode(tab.dataset.mode, true)));
    this.field.addEventListener('input', () => {
      this.state.text = this.field.value;
      this.onChange({ delay: 320 });
    });
    root.querySelector('.clear').addEventListener('click', () => {
      this.pad.clear();
      this.state.drawn = null;
      this.onChange({ delay: 0 });
    });
    this.buildPresets();
  }

  buildPresets() {
    const holder = this.root.querySelector('.presets');
    for (const preset of PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset';
      button.dataset.preset = preset.name;
      button.title = preset.label;
      button.setAttribute('aria-label', preset.label);
      const canvas = document.createElement('canvas');
      canvas.width = 72;
      canvas.height = 72;
      button.append(canvas);
      button.addEventListener('click', () => {
        this.state.preset = preset.name;
        this.setMode('shape', false);
        this.syncPresets();
        this.onChange({ delay: 0 });
      });
      holder.append(button);
      this.thumbs.push({ preset, canvas });
    }
    this.drawThumbs();
    this.syncPresets();
  }

  drawThumbs() {
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1d1b18';
    for (const { preset, canvas } of this.thumbs) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 72, 72);
      ctx.save();
      const k = 72 / PRESET_SIZE;
      ctx.scale(k, k);
      drawPreset(ctx, preset, ink);
      ctx.restore();
    }
  }

  syncPresets() {
    this.root.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === this.state.preset)));
  }

  setMode(mode, notify) {
    this.state.mode = mode;
    this.tabs.forEach((tab) => {
      const on = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    this.panes.forEach((pane) => (pane.hidden = pane.dataset.pane !== mode));
    if (notify) this.onChange({ delay: 0 });
  }

  padChanged() {
    this.state.drawn = null;
    this.onChange({ delay: 220, retracePad: true });
  }

  retracePad(detail) {
    this.state.drawn = this.pad.inked ? this.pad.trace(detail) : null;
  }

  load(saved) {
    if (saved.mode === 'word') this.state.text = saved.text;
    if (saved.mode === 'shape') this.state.preset = saved.preset;
    if (saved.mode === 'draw') {
      this.state.drawn = saved.drawn;
      this.pad.paint(saved.drawn);
    }
    this.field.value = this.state.text;
    this.setMode(saved.mode, false);
    this.syncPresets();
  }

  swapWith(other) {
    const mine = { state: this.state, image: this.pad.snapshot(), inked: this.pad.inked };
    const theirs = { state: other.state, image: other.pad.snapshot(), inked: other.pad.inked };
    this.state = theirs.state;
    other.state = mine.state;
    this.pad.restore(theirs.image, theirs.inked);
    other.pad.restore(mine.image, mine.inked);
    for (const panel of [this, other]) {
      panel.field.value = panel.state.text;
      panel.setMode(panel.state.mode, false);
      panel.syncPresets();
    }
  }

  shapeFor(detail, tracers) {
    const { mode, text, preset, drawn } = this.state;
    if (mode === 'word') return tracers.word(text, detail);
    if (mode === 'shape') return tracers.preset(preset, detail);
    return drawn ?? [];
  }

  describe() {
    return { ...this.state };
  }
}
