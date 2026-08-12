const keys = new Set();
const pressHandlers = [];

const MOVE_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
]);

window.addEventListener('keydown', (e) => {
  if (MOVE_KEYS.has(e.code)) e.preventDefault();
  if (!e.repeat) {
    keys.add(e.code);
    pressHandlers.forEach((h) => h(e.code));
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

window.addEventListener('pointerdown', () => {
  pressHandlers.forEach((h) => h('Pointer'));
});

export function onPress(handler) {
  pressHandlers.push(handler);
}

export function moveAxis() {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (x && y) { const s = Math.SQRT1_2; x *= s; y *= s; }
  return { x, y };
}
