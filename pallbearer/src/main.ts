import { Game } from './game/Game';
import { InputManager } from './input/InputManager';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

// Integer-scale to fit window
function resize() {
  const scaleX = Math.floor(window.innerWidth / GAME_WIDTH);
  const scaleY = Math.floor(window.innerHeight / GAME_HEIGHT);
  const scale = Math.max(1, Math.min(scaleX, scaleY));
  canvas.style.width  = `${GAME_WIDTH  * scale}px`;
  canvas.style.height = `${GAME_HEIGHT * scale}px`;
}
window.addEventListener('resize', resize);
resize();

const input = new InputManager();
const game = new Game(canvas, input);

game.init().catch(console.error);
