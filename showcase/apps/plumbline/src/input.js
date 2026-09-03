const CODES = {
  KeyA: 'slewL', KeyD: 'slewR',
  KeyW: 'trolleyOut', KeyS: 'trolleyIn',
  KeyR: 'hoistUp', KeyF: 'hoistDown',
  KeyQ: 'yawL', KeyE: 'yawR',
  Space: 'act', KeyX: 'stop',
  ShiftLeft: 'precise', ShiftRight: 'precise',
  ArrowLeft: 'slewL', ArrowRight: 'slewR',
  ArrowUp: 'trolleyOut', ArrowDown: 'trolleyIn',
};

export class Input {
  constructor(canvas) {
    this.held = new Set();
    this.pressed = new Set();
    this.orbit = { az: -0.72, el: 0.36, dist: 78 };
    this._drag = null;

    addEventListener('keydown', (e) => {
      const a = CODES[e.code];
      if (a) { e.preventDefault(); if (!this.held.has(a)) this.pressed.add(a); this.held.add(a); }
      if (e.code === 'Tab' || e.code === 'KeyP') e.preventDefault();
      if (e.code === 'Tab') this.pressed.add('view');
      if (e.code === 'KeyP') this.pressed.add('pause');
    });
    addEventListener('keyup', (e) => {
      const a = CODES[e.code];
      if (a) this.held.delete(a);
    });
    addEventListener('blur', () => this.held.clear());

    canvas.addEventListener('pointerdown', (e) => {
      this._drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      this.orbit.az -= (e.clientX - this._drag.x) * 0.005;
      this.orbit.el = clamp(this.orbit.el + (e.clientY - this._drag.y) * 0.004, -0.25, 1.25);
      this._drag = { x: e.clientX, y: e.clientY };
    });
    const end = () => { this._drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.dist = clamp(this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.09), 26, 190);
    }, { passive: false });
  }

  down(a) { return this.held.has(a); }
  // Axis helper: returns -1, 0 or 1 from a pair of held keys.
  axis(neg, pos) { return (this.held.has(pos) ? 1 : 0) - (this.held.has(neg) ? 1 : 0); }
  hit(a) { const h = this.pressed.has(a); this.pressed.delete(a); return h; }
  endFrame() { this.pressed.clear(); }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
