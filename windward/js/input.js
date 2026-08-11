const MAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'trimIn', ArrowUp: 'trimIn',
  KeyS: 'trimOut', ArrowDown: 'trimOut',
  Space: 'hike',
};

export class Input {
  constructor() {
    this.state = { left: false, right: false, trimIn: false, trimOut: false, hike: false };
    this.pressed = new Set();
    this.onKey = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      const a = MAP[e.code];
      if (a) this.state[a] = true;
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (this.onKey) this.onKey(e.code, e);
      }
    });

    window.addEventListener('keyup', (e) => {
      const a = MAP[e.code];
      if (a) this.state[a] = false;
      this.pressed.delete(e.code);
    });

    window.addEventListener('blur', () => {
      for (const k of Object.keys(this.state)) this.state[k] = false;
      this.pressed.clear();
    });
  }
}
