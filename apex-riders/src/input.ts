export interface BikeInput {
  steer: number;       // -1 (left) to 1 (right)
  accelerate: boolean;
  brake: boolean;
  boost: boolean;
}

export type InputAction = 'start' | 'pause' | 'cameraToggle';

export class InputManager {
  private keys = new Set<string>();
  private actionHandlers = new Map<InputAction, Array<() => void>>();

  constructor() {
    window.addEventListener('keydown', e => {
      if (!this.keys.has(e.code)) {
        this.keys.add(e.code);
        this._fireAction(e.code);
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
  }

  private _fireAction(code: string) {
    if (code === 'Enter' || code === 'Space') this._emit('start');
    if (code === 'Escape') this._emit('pause');
    if (code === 'KeyC') this._emit('cameraToggle');
  }

  private _emit(action: InputAction) {
    this.actionHandlers.get(action)?.forEach(fn => fn());
  }

  on(action: InputAction, fn: () => void) {
    if (!this.actionHandlers.has(action)) this.actionHandlers.set(action, []);
    this.actionHandlers.get(action)!.push(fn);
  }

  getInput(): BikeInput {
    let steer = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) steer -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) steer += 1;

    return {
      steer,
      accelerate: true, // auto-accelerate
      brake: this.keys.has('ArrowDown') || this.keys.has('KeyS'),
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }
}
