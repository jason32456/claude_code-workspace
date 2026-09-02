const MOVE_KEYS = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

const WAIT_KEYS = new Set(['.', ' ', 'z']);

export function setupInput({ onMove, onWait, onUseItem, onConfirm }) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat && e.target !== document.body) return;
    if (MOVE_KEYS[e.key]) {
      e.preventDefault();
      const [dx, dy] = MOVE_KEYS[e.key];
      onMove(dx, dy);
      return;
    }
    if (WAIT_KEYS.has(e.key)) {
      e.preventDefault();
      onWait();
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      onUseItem(Number(e.key) - 1);
      return;
    }
    if (e.key === 'Enter') {
      onConfirm();
    }
  });

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      fn();
    });
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        fn();
      },
      { passive: false }
    );
  };

  bind('dpad-up', () => onMove(0, -1));
  bind('dpad-down', () => onMove(0, 1));
  bind('dpad-left', () => onMove(-1, 0));
  bind('dpad-right', () => onMove(1, 0));
  bind('dpad-wait', () => onWait());
}
