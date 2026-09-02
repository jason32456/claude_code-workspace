export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.x = 0;
    this.y = 0;
    this.drop = false;
    this.act = false;
    this.pointer = { x: 0, y: 0, inside: false };
    this.clicks = [];
    this.taps = [];
    this.orbit = { active: false, dx: 0, dy: 0, zoom: 0 };
    this.stick = { active: false, x: 0, y: 0 };
    this.onKey = null;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        return;
      }
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (this.onKey) this.onKey(k, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.pointer.inside = true;
      if (this.orbit.active) {
        this.orbit.dx += e.movementX || 0;
        this.orbit.dy += e.movementY || 0;
      }
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        this.orbit.active = true;
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (e.pointerType === 'touch') return;
      this.clicks.push({ x: this.pointer.x, y: this.pointer.y, button: e.button });
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.orbit.active = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.orbit.zoom += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );

    // Touch: a tap on the canvas is a build click, resolved through the same
    // pointer coordinates the mouse uses.
    canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      const r = canvas.getBoundingClientRect();
      this.pointer.x = ((t.clientX - r.left) / r.width) * 2 - 1;
      this.pointer.y = -((t.clientY - r.top) / r.height) * 2 + 1;
      this.pointer.inside = true;
      this.taps.push({ x: this.pointer.x, y: this.pointer.y });
    }, { passive: true });
  }

  bindTouchUI(root) {
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#stick-knob');
    if (!stick) return;
    let id = null;
    const R = 46;
    const set = (cx, cy, ox, oy) => {
      let dx = cx - ox;
      let dy = cy - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stick.x = dx / R;
      this.stick.y = -dy / R;
      this.stick.active = true;
    };
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = stick.getBoundingClientRect();
      set(t.clientX, t.clientY, r.left + r.width / 2, r.top + r.height / 2);
      e.preventDefault();
    }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        const r = stick.getBoundingClientRect();
        set(t.clientX, t.clientY, r.left + r.width / 2, r.top + r.height / 2);
      }
      e.preventDefault();
    }, { passive: false });
    const end = () => {
      id = null;
      this.stick.active = false;
      this.stick.x = 0;
      this.stick.y = 0;
      knob.style.transform = 'translate(0,0)';
    };
    stick.addEventListener('touchend', end);
    stick.addEventListener('touchcancel', end);

    const hold = (sel, prop) => {
      const el = root.querySelector(sel);
      if (!el) return;
      const on = (e) => {
        this[prop] = true;
        e.preventDefault();
      };
      const off = () => {
        this[prop] = false;
      };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off);
      el.addEventListener('touchcancel', off);
      el.addEventListener('mousedown', on);
      window.addEventListener('mouseup', off);
    };
    hold('#btn-drop', 'touchDrop');
    hold('#btn-act', 'touchAct');
  }

  poll() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    if (this.stick.active) {
      x += this.stick.x;
      y += this.stick.y;
    }
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.x = x;
    this.y = y;
    this.drop = k.has(' ') || !!this.touchDrop;
    this.act = k.has('e') || !!this.touchAct;
    return this;
  }

  takeClicks() {
    const c = this.clicks.concat(this.taps);
    this.clicks = [];
    this.taps = [];
    return c;
  }

  takeOrbit() {
    const o = { ...this.orbit };
    this.orbit.dx = 0;
    this.orbit.dy = 0;
    this.orbit.zoom = 0;
    return o;
  }
}
