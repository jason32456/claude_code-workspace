import { Game } from './game.js';

const canvas = document.getElementById('scene');
const game = new Game(canvas);
window.game = game;

addEventListener('pointerdown', () => game.audio.start(), { once: true });
addEventListener('keydown', () => game.audio.start(), { once: true });
