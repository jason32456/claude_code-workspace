export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.actions = [];
    this.pointer = { x: 0, y: 0, has: false };
    this.canvas = canvas;

    const down = (e) => {
      const k = e.key.toLowerCase();
      if (['tab', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      const shift = e.shiftKey;
      switch (k) {
        case 'q':
          this.actions.push({ type: shift ? 'dyno' : 'hand', side: 'left' });
          break;
        case 'e':
          this.actions.push({ type: shift ? 'dyno' : 'hand', side: 'right' });
          break;
        case 'r':
          this.actions.push({ type: 'chalk' });
          break;
        case 'f':
          this.actions.push({ type: 'cam' });
          break;
        case 'enter':
          this.actions.push({ type: 'confirm' });
          break;
        case 'escape':
        case 'p':
          this.actions.push({ type: 'pause' });
          break;
        case 'm':
          this.actions.push({ type: 'mute' });
          break;
        default:
          break;
      }
    };
    const up = (e) => this.keys.delete(e.key.toLowerCase());

    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
      this.pointer.has = true;
    });
    canvas.addEventListener('pointerdown', (e) => {
      const side = e.button === 2 ? 'right' : 'left';
      const dyno = e.shiftKey;
      this.actions.push({ type: dyno ? 'dyno' : 'hand', side });
    });
  }

  down(k) {
    return this.keys.has(k);
  }

  get hipX() {
    return (this.down('d') || this.down('arrowright') ? 1 : 0) - (this.down('a') || this.down('arrowleft') ? 1 : 0);
  }

  // Positive pushes the hips away from the rock, negative pulls them in.
  get hipZ() {
    return (this.down('s') || this.down('arrowdown') ? 1 : 0) - (this.down('w') || this.down('arrowup') ? 1 : 0);
  }

  get press() {
    return this.down(' ');
  }

  get shake() {
    return this.down('x');
  }

  get scan() {
    return this.down('c');
  }

  take() {
    const a = this.actions;
    this.actions = [];
    return a;
  }
}
