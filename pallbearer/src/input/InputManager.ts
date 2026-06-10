export interface InputSnapshot {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  interact: boolean;
  save: boolean;
  load: boolean;
}

export class InputManager {
  private current: Record<string, boolean> = {};
  private justPressed: Record<string, boolean> = {};
  private prev: Record<string, boolean> = {};

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.current[e.code]) this.justPressed[e.code] = true;
      this.current[e.code] = true;
      // Prevent arrow key scrolling
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.current[e.code] = false;
    });
  }

  snapshot(): InputSnapshot {
    return {
      left:     !!(this.current['ArrowLeft']  || this.current['KeyA']),
      right:    !!(this.current['ArrowRight'] || this.current['KeyD']),
      up:       !!(this.current['ArrowUp']    || this.current['KeyW']),
      down:     !!(this.current['ArrowDown']  || this.current['KeyS']),
      interact: !!(this.justPressed['KeyZ'] || this.justPressed['KeyX'] || this.justPressed['Space'] || this.justPressed['Enter']),
      save:     !!(this.justPressed['KeyF']),
      load:     !!(this.justPressed['KeyG']),
    };
  }

  flush(): void {
    this.prev = { ...this.current };
    this.justPressed = {};
  }
}
