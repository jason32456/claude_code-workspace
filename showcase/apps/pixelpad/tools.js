// Tool behaviors: pencil, eraser, fill, eyedropper — with optional X-mirror.

export class Tools {
  constructor(editor, palette) {
    this.editor = editor;
    this.palette = palette;
    this.active = 'pencil';
    this.mirror = false;
    this.drawing = false;
    this.lastCell = null;
    this.onToolChange = null;
  }

  setTool(name) {
    this.active = name;
    this.onToolChange?.(name);
  }

  // Bresenham between consecutive pointer samples so fast drags leave no gaps.
  stampLine(from, to, color) {
    let { x: x0, y: y0 } = from;
    const { x: x1, y: y1 } = to;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.stamp(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  stamp(x, y, color) {
    this.editor.setPixel(x, y, color);
    if (this.mirror) this.editor.setPixel(this.editor.size - 1 - x, y, color);
  }

  pointerDown(e) {
    const cell = this.editor.eventToCell(e);
    // Right-click always eyedrops.
    if (e.button === 2) {
      this.pick(cell);
      return;
    }
    switch (this.active) {
      case 'pencil':
      case 'eraser': {
        this.drawing = true;
        this.lastCell = cell;
        this.stamp(cell.x, cell.y, this.active === 'pencil' ? this.palette.color : null);
        break;
      }
      case 'fill': {
        const color = this.palette.color;
        this.editor.floodFill(cell.x, cell.y, color);
        if (this.mirror) {
          this.editor.floodFill(this.editor.size - 1 - cell.x, cell.y, color);
        }
        this.editor.commitIfChanged();
        break;
      }
      case 'eyedropper':
        this.pick(cell);
        break;
    }
  }

  pointerMove(e) {
    if (!this.drawing) return;
    const cell = this.editor.eventToCell(e);
    if (this.lastCell && cell.x === this.lastCell.x && cell.y === this.lastCell.y) return;
    const color = this.active === 'pencil' ? this.palette.color : null;
    this.stampLine(this.lastCell ?? cell, cell, color);
    this.lastCell = cell;
  }

  pointerUp() {
    if (!this.drawing) return;
    this.drawing = false;
    this.lastCell = null;
    this.editor.commitIfChanged();
  }

  pick(cell) {
    const color = this.editor.getPixel(cell.x, cell.y);
    if (!color) return;
    this.palette.setColor(color);
    if (this.active === 'eyedropper') this.setTool('pencil');
  }
}
