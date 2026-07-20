// Canvas state, rendering, and undo/redo history.

const MAX_HISTORY = 50;

export class Editor {
  constructor(artCanvas, gridCanvas) {
    this.art = artCanvas;
    this.grid = gridCanvas;
    this.ctx = artCanvas.getContext('2d');
    this.size = 32;
    this.pixels = new Array(this.size * this.size).fill(null);
    this.history = [];
    this.historyIndex = -1;
    this.showGrid = true;
    this.onChange = null; // called after any committed change (for autosave/UI)
  }

  setSize(size, pixels = null) {
    this.size = size;
    this.pixels = pixels ?? new Array(size * size).fill(null);
    this.history = [];
    this.historyIndex = -1;
    this.pushHistory();
    this.layout();
    this.render();
  }

  isEmpty() {
    return this.pixels.every((p) => p === null);
  }

  // Fit the canvas into its available stage space at an integer-ish scale.
  layout() {
    const stage = this.art.closest('.stage');
    const maxW = Math.max(200, stage.clientWidth - 40);
    const maxH = Math.max(200, stage.clientHeight - 80);
    const display = Math.min(maxW, maxH, 720);
    const cell = Math.max(4, Math.floor(display / this.size));
    const px = cell * this.size;

    this.art.width = this.size;
    this.art.height = this.size;
    this.art.style.width = `${px}px`;
    this.art.style.height = `${px}px`;

    const dpr = window.devicePixelRatio || 1;
    this.grid.width = px * dpr;
    this.grid.height = px * dpr;
    this.grid.style.width = `${px}px`;
    this.grid.style.height = `${px}px`;

    const frame = this.art.parentElement;
    frame.style.backgroundSize = `${cell * 2}px ${cell * 2}px`;

    this.cellPx = cell;
    this.renderGrid();
  }

  render() {
    this.ctx.clearRect(0, 0, this.size, this.size);
    for (let i = 0; i < this.pixels.length; i++) {
      const color = this.pixels[i];
      if (!color) continue;
      this.ctx.fillStyle = color;
      this.ctx.fillRect(i % this.size, Math.floor(i / this.size), 1, 1);
    }
  }

  renderGrid() {
    const g = this.grid.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    g.clearRect(0, 0, this.grid.width, this.grid.height);
    if (!this.showGrid) return;
    g.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    g.lineWidth = 1;
    const cell = this.cellPx * dpr;
    for (let i = 1; i < this.size; i++) {
      g.beginPath();
      g.moveTo(i * cell + 0.5, 0);
      g.lineTo(i * cell + 0.5, this.grid.height);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i * cell + 0.5);
      g.lineTo(this.grid.width, i * cell + 0.5);
      g.stroke();
    }
  }

  setGridVisible(visible) {
    this.showGrid = visible;
    this.renderGrid();
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  getPixel(x, y) {
    return this.inBounds(x, y) ? this.pixels[y * this.size + x] : null;
  }

  setPixel(x, y, color) {
    if (!this.inBounds(x, y)) return;
    const i = y * this.size + x;
    if (this.pixels[i] === color) return;
    this.pixels[i] = color;
    if (color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y, 1, 1);
    } else {
      this.ctx.clearRect(x, y, 1, 1);
    }
  }

  floodFill(x, y, color) {
    if (!this.inBounds(x, y)) return;
    const target = this.getPixel(x, y);
    if (target === color) return;
    const stack = [[x, y]];
    const { size } = this;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= size || cy >= size) continue;
      if (this.pixels[cy * size + cx] !== target) continue;
      this.setPixel(cx, cy, color);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  // Convert a pointer event into pixel coordinates.
  eventToCell(e) {
    const rect = this.art.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * this.size);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * this.size);
    return { x, y };
  }

  // --- history ---

  pushHistory() {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push([...this.pixels]);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.onChange?.();
  }

  // Commit a stroke only if it changed something since the last snapshot.
  commitIfChanged() {
    const last = this.history[this.historyIndex];
    if (last && last.length === this.pixels.length &&
        last.every((p, i) => p === this.pixels[i])) return;
    this.pushHistory();
  }

  canUndo() { return this.historyIndex > 0; }
  canRedo() { return this.historyIndex < this.history.length - 1; }

  undo() {
    if (!this.canUndo()) return;
    this.historyIndex--;
    this.pixels = [...this.history[this.historyIndex]];
    this.render();
    this.onChange?.();
  }

  redo() {
    if (!this.canRedo()) return;
    this.historyIndex++;
    this.pixels = [...this.history[this.historyIndex]];
    this.render();
    this.onChange?.();
  }

  clear() {
    this.pixels = new Array(this.size * this.size).fill(null);
    this.render();
    this.pushHistory();
  }
}
