// Pointer-drag input, unified for mouse and touch via Pointer Events.

export class DragInput {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.dragging = false;
    this.pointerId = null;

    canvas.addEventListener("pointerdown", this._onDown.bind(this));
    canvas.addEventListener("pointermove", this._onMove.bind(this));
    canvas.addEventListener("pointerup", this._onUp.bind(this));
    canvas.addEventListener("pointercancel", this._onUp.bind(this));
  }

  _toLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  _onDown(e) {
    if (!this.handlers.canAim()) return;
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    const pt = this._toLogical(e.clientX, e.clientY);
    this.handlers.onAimStart(pt);
  }

  _onMove(e) {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const pt = this._toLogical(e.clientX, e.clientY);
    this.handlers.onAimMove(pt);
  }

  _onUp(e) {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
    const pt = this._toLogical(e.clientX, e.clientY);
    this.handlers.onAimEnd(pt);
  }
}
