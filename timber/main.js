// Wiring: builds the game + renderer, runs the loop, and manages overlays.
import { Game } from './game.js';
import { Renderer } from './render.js';
import { bindInput } from './input.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const gameover = document.getElementById('gameover');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const bestLine = document.getElementById('bestLine');
const finalScore = document.getElementById('finalScore');
const finalBest = document.getElementById('finalBest');
const goTitle = document.getElementById('goTitle');

const BEST_KEY = 'timber.best';
const getBest = () => Number(localStorage.getItem(BEST_KEY) || 0);
const setBest = (v) => localStorage.setItem(BEST_KEY, String(v));

const game = new Game();
const renderer = new Renderer(ctx);
game.onChop = (side, ok) => renderer.onChop(side, ok);

bestLine.textContent = `Best: ${getBest()}`;

function startGame() {
  game.start();
  renderer.log = null;
  renderer.chips = [];
  renderer.lastMult = 1;
  renderer.comboPop = 0;
  overlay.classList.add('hidden');
  gameover.classList.add('hidden');
}

function chop(side) {
  if (game.state === 'ready') { startGame(); return; }
  if (game.state === 'over') { startGame(); return; }
  game.chop(side);
}

function onStart() {
  if (game.state !== 'playing') startGame();
}

window.timber = { game, renderer, chop }; // handle for debugging / automation

bindInput(canvas, { onChop: chop, onStart });
startBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', startGame);

let wasOver = false;
function handleGameOver() {
  if (game.state === 'over' && !wasOver) {
    wasOver = true;
    const best = Math.max(getBest(), game.score);
    setBest(best);
    goTitle.textContent = game.deathCause === 'timeout' ? "TIME'S UP" : 'SQUASHED!';
    finalScore.textContent = game.score;
    finalBest.textContent = `Best: ${best}`;
    bestLine.textContent = `Best: ${best}`;
    setTimeout(() => gameover.classList.remove('hidden'), 450);
  }
  if (game.state !== 'over') wasOver = false;
}

let last = performance.now();
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp after tab switches

  game.update(dt);
  renderer.update(dt);
  renderer.draw(game);
  handleGameOver();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
