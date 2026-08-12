// Keyboard + touch/click input. Translates raw events into chop(side) and
// start() intents, and dispatches them to the supplied handlers.
import { SIDE } from './game.js';

export function bindInput(canvas, { onChop, onStart }) {
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'a': case 'A': case 'ArrowLeft':
        onChop(SIDE.LEFT); break;
      case 'd': case 'D': case 'ArrowRight':
        onChop(SIDE.RIGHT); break;
      case ' ': case 'Enter':
        e.preventDefault(); onStart(); break;
    }
  });

  const handlePoint = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    onChop(x < rect.width / 2 ? SIDE.LEFT : SIDE.RIGHT);
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handlePoint(e.clientX);
  });
}
