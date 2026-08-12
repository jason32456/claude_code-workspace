import { Game, loadSave } from './game.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);

const canvas = $('scene');
const hud = new Hud();
const sfx = new Sfx();
const input = new Input(canvas);
const game = new Game(canvas, hud, sfx, input);

const menu = $('menu');
const pause = $('pause');
const win = $('win');

function show(el, on) { el.classList.toggle('hidden', !on); }

function buildLevelGrid() {
  const save = loadSave();
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const locked = i > save.unlocked;
    const best = save.best[lv.id];
    const b = document.createElement('button');
    b.className = 'lvl' + (locked ? ' locked' : '');
    b.innerHTML = `
      <div class="n">${String(i + 1).padStart(2, '0')}${locked ? ' · locked' : ''}</div>
      <div class="t">${lv.name}</div>
      <div class="b${best !== undefined ? ' best' : ''}">${
        best !== undefined ? `best ${best} echo${best === 1 ? '' : 'es'}` : `par ${lv.par}`
      }</div>`;
    if (!locked) b.addEventListener('click', () => play(i));
    grid.appendChild(b);
  });
}

function play(index) {
  sfx.ensure();
  show(menu, false);
  show(pause, false);
  show(win, false);
  game.startLevel(index);
}

function toMenu() {
  game.toMenu();
  buildLevelGrid();
  show(pause, false);
  show(win, false);
  show(menu, true);
}

game.onPause = () => show(pause, true);

game.onWin = ({ used, par, isBest, best, index }) => {
  const last = index === LEVELS.length - 1;
  $('win-stats').innerHTML = `
    <div>echoes used <b>${used}</b> · par <b>${par}</b></div>
    <div>${used <= par ? '<span class="ace">at or under par</span>' : 'try it with fewer next time'}</div>
    <div>${isBest ? 'new personal best' : `your best: ${best}`}</div>`;
  $('btn-next').textContent = last ? 'Level select' : 'Next chamber';
  show(win, true);
};

$('btn-resume').addEventListener('click', () => { show(pause, false); game.resume(); });
$('btn-restart').addEventListener('click', () => { show(pause, false); game.restartLevel(); game.resume(); });
$('btn-quit').addEventListener('click', toMenu);
$('btn-replay').addEventListener('click', () => play(game.levelIndex));
$('btn-menu').addEventListener('click', toMenu);
$('btn-next').addEventListener('click', () => {
  const next = game.levelIndex + 1;
  if (next >= LEVELS.length) toMenu();
  else play(next);
});

input.onLockLost = () => { if (game.state === 'play') game.pause(); };

input.onKey = (code) => {
  if (game.state === 'play') {
    if (code === 'KeyR') game.rewind();
    else if (code === 'KeyQ') game.retry();
    else if (code === 'KeyZ') game.undoEcho();
  } else if (game.state === 'paused' && code === 'Escape') {
    show(pause, false);
    game.resume();
  }
};

addEventListener('pointerdown', () => sfx.ensure(), { once: true });

// Debug hook — used by the headless playthrough harness.
window.afterimage = { game, LEVELS, play, toMenu };

toMenu();
