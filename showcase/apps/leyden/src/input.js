import * as THREE from '../vendor/three.module.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.yaw = Math.PI;
    this.pitch = 0.12;
    this.move = new THREE.Vector2();
    this.vertical = 0;
    this.bait = false;
    this.dump = false;
    this.bleed = false;
    this.locked = false;
    this.onPause = null;
    this.onMute = null;
    this.keys = new Set();
    this.sensitivity = 0.0022;

    this._bindKeys();
    this._bindMouse();
    this._bindTouch();
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.onPause) this.onPause();
        return;
      }
      if (e.code === 'KeyM') {
        if (this.onMute) this.onMute();
        return;
      }
      if (
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyR'].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _bindMouse() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.onPause) this.onPause(true);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + e.movementY * this.sensitivity,
        -0.45,
        0.85
      );
    });
  }

  _bindTouch() {
    this.touchMove = new THREE.Vector2();
    this.touchVertical = 0;
    const stick = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-knob');
    if (!stick) return;

    let stickId = null;
    let origin = { x: 0, y: 0 };
    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      e.preventDefault();
    }, { passive: false });

    const stickMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        const dx = THREE.MathUtils.clamp(t.clientX - origin.x, -52, 52);
        const dy = THREE.MathUtils.clamp(t.clientY - origin.y, -52, 52);
        setKnob(dx, dy);
        this.touchMove.set(dx / 52, -dy / 52);
      }
      e.preventDefault();
    };
    stick.addEventListener('touchmove', stickMove, { passive: false });
    const stickEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        stickId = null;
        setKnob(0, 0);
        this.touchMove.set(0, 0);
      }
    };
    stick.addEventListener('touchend', stickEnd);
    stick.addEventListener('touchcancel', stickEnd);

    // Right half of the screen is the look area.
    let lookId = null;
    let lastX = 0;
    let lastY = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (t.clientX < window.innerWidth * 0.4) return;
      lookId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
    });
    this.canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        this.yaw -= (t.clientX - lastX) * 0.005;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (t.clientY - lastY) * 0.004, -0.45, 0.85);
        lastX = t.clientX;
        lastY = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('touchend', () => {
      lookId = null;
    });

    const hold = (id, set) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (e) => {
        set(true);
        el.classList.add('held');
        e.preventDefault();
      };
      const off = () => {
        set(false);
        el.classList.remove('held');
      };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off);
      el.addEventListener('touchcancel', off);
      el.addEventListener('mousedown', on);
      el.addEventListener('mouseup', off);
      el.addEventListener('mouseleave', off);
    };
    hold('touch-bait', (v) => (this.touchBait = v));
    hold('touch-dump', (v) => (this.touchDump = v));
    hold('touch-up', (v) => (this.touchUp = v));
    hold('touch-down', (v) => (this.touchDown = v));
  }

  requestLock() {
    if (this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  }

  releaseLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  sample() {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    this.move.set(x, y);
    if (this.touchMove && this.touchMove.lengthSq() > 0.01) this.move.copy(this.touchMove);
    if (this.move.lengthSq() > 1) this.move.normalize();

    let v = 0;
    if (k.has('Space') || this.touchUp) v += 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('ControlLeft') || this.touchDown) v -= 1;
    this.vertical = v;

    this.bait = k.has('KeyE') || !!this.touchBait;
    this.dump = k.has('KeyQ') || !!this.touchDump;
    this.bleed = k.has('KeyR');
    return this;
  }
}
