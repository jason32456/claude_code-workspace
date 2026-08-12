const CODES = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  KeyE: 'use',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = Object.create(null);
    this.pressed = Object.create(null);   // consumed each tick
    this.dx = 0; this.dy = 0;
    this.locked = false;
    this.enabled = false;
    this.onKey = null;                    // (code) => void, for UI-level keys

    addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      if (this.onKey) this.onKey(e.code);
      if (!this.enabled) return;
      const a = CODES[e.code];
      if (a) { this.held[a] = true; this.pressed[a] = true; }
    });

    addEventListener('keyup', (e) => {
      const a = CODES[e.code];
      if (a) this.held[a] = false;
    });

    addEventListener('blur', () => { this.held = Object.create(null); });

    canvas.addEventListener('click', () => this.lock());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.held = Object.create(null);
        if (this.onLockLost) this.onLockLost();
      }
    });

    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  lock() {
    if (!this.enabled || this.locked) return;
    try { this.canvas.requestPointerLock(); } catch { /* headless / unsupported */ }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }

  takeMouse() {
    const d = { x: this.dx, y: this.dy };
    this.dx = 0; this.dy = 0;
    return d;
  }

  takePressed(a) {
    const v = !!this.pressed[a];
    this.pressed[a] = false;
    return v;
  }

  clearPressed() { this.pressed = Object.create(null); }
}
