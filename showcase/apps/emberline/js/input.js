export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    addEventListener('keydown', (e) => {
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  down(k) { return this.keys.has(k); }

  hit(k) {
    if (this.pressed.has(k)) { this.pressed.delete(k); return true; }
    return false;
  }

  endFrame() { this.pressed.clear(); }

  axes() {
    const d = (a, b) => (this.down(a) ? 1 : 0) - (this.down(b) ? 1 : 0);
    return {
      pitch: d('KeyW', 'KeyS') + d('ArrowUp', 'ArrowDown'),
      roll: d('KeyD', 'KeyA') + d('ArrowRight', 'ArrowLeft'),
      throttle: d('ShiftLeft', 'ControlLeft') + d('ShiftRight', 'ControlRight'),
      release: this.down('Space'),
    };
  }
}
