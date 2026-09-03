export const TOOLS = [
  { key: 'jacks', label: 'Jacks', hint: 'squeeze a neck at the cursor', color: 0x7fd4ff },
  { key: 'blocks', label: 'Blocks', hint: 'round it up and kill the wobble', color: 0x9dff9a },
  { key: 'pull', label: 'Pull', hint: 'stretch everything past the cursor', color: 0xffd479 },
  { key: 'marver', label: 'Marver', hint: 'chill the whole piece fast', color: 0xa9b6ff },
  { key: 'shears', label: 'Shears', hint: 'cut the tip off — opens it for good', color: 0xff8a8a },
];

export function createInput(canvas, hooks) {
  const state = {
    rollLeft: false,
    rollRight: false,
    heat: false,
    blow: false,
    apply: false,
    mouseX: 0.5,
    tool: 0,
  };

  const down = new Set();

  function key(e, isDown) {
    const k = e.key.toLowerCase();
    if (['a', 'd', 'f', ' ', 'enter', 'g', 'c', 'm', '1', '2', '3', '4', '5', 'escape', 'r'].includes(k)) {
      e.preventDefault();
    }
    if (isDown && down.has(k)) return;
    if (isDown) down.add(k);
    else down.delete(k);

    if (k === 'a') state.rollLeft = isDown;
    if (k === 'd') state.rollRight = isDown;
    if (k === 'f') state.heat = isDown;
    if (k === ' ') state.blow = isDown;
    if (!isDown) return;
    if (k >= '1' && k <= '5') {
      state.tool = Number(k) - 1;
      hooks.onTool?.(state.tool);
    }
    if (k === 'enter') hooks.onBench?.();
    if (k === 'g') hooks.onGhost?.();
    if (k === 'c') hooks.onCamera?.();
    if (k === 'm') hooks.onMute?.();
    if (k === 'r') hooks.onRestart?.();
    if (k === 'escape') hooks.onPause?.();
  }

  addEventListener('keydown', (e) => key(e, true));
  addEventListener('keyup', (e) => key(e, false));
  addEventListener('blur', () => {
    down.clear();
    state.rollLeft = state.rollRight = state.heat = state.blow = state.apply = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    state.mouseX = e.clientX / innerWidth;
    state.mouseY = e.clientY / innerHeight;
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 0) state.apply = true;
    hooks.onFirstInput?.();
  });
  addEventListener('pointerup', () => {
    state.apply = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('keydown', () => hooks.onFirstInput?.(), { once: true });

  return state;
}
