import { Game } from './game.js';

const game = new Game(document.getElementById('scene'));
window.game = game;   // handy for tinkering from the console

function loop() {
  requestAnimationFrame(loop);
  game.frame();
}
loop();

addEventListener('pointerdown', () => game.audio.start(), { once: true });
