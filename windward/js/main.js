import { Game } from './game.js';

const canvas = document.getElementById('scene');
const game = new Game(canvas);
window.game = game;

const show = (id) => document.getElementById(id).classList.remove('hidden');
const hide = (id) => document.getElementById(id).classList.add('hidden');

function toMenu() {
  game.mode = 'MENU';
  show('menu');
  hide('results');
  hide('pause');
  document.getElementById('hud').classList.add('hidden');
}

document.getElementById('btn-start').addEventListener('click', () => game.start());
document.getElementById('btn-again').addEventListener('click', () => game.start());
document.getElementById('btn-menu').addEventListener('click', toMenu);
document.getElementById('btn-resume').addEventListener('click', () => {
  game.mode = 'RACING';
  hide('pause');
});
document.getElementById('btn-restart').addEventListener('click', () => game.start());
document.getElementById('btn-quit').addEventListener('click', toMenu);

toMenu();

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
