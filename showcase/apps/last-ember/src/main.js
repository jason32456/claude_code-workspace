import { Game } from './game.js';
import { render } from './renderer.js';
import { setupInput } from './input.js';
import { initAudio } from './audio.js';
import { MAX_FLOOR, FUEL_CAP, fuelBand } from './constants.js';

const game = new Game();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const screens = {
  title: document.getElementById('title-screen'),
  game: document.getElementById('game-screen'),
  end: document.getElementById('end-screen'),
};

function showScreen(name) {
  for (const key of Object.keys(screens)) screens[key].hidden = key !== name;
}

function renderTitleStats() {
  const s = game.stats;
  document.getElementById('title-stats').textContent = s.runs > 0
    ? `Best descent: floor ${s.bestFloor} / ${MAX_FLOOR}  ·  ${s.wins} win${s.wins === 1 ? '' : 's'} in ${s.runs} run${s.runs === 1 ? '' : 's'}`
    : '';
}

function updateHUD() {
  const p = game.player;
  document.getElementById('floor-label').textContent = `Floor ${game.depth} / ${MAX_FLOOR}`;
  document.getElementById('turn-label').textContent = `Turn ${game.turnCount}`;
  document.getElementById('gold-label').textContent = `${p.gold}g`;

  const hpFrac = Math.max(0, p.hp / p.maxHp);
  document.getElementById('hp-fill').style.width = `${hpFrac * 100}%`;
  document.getElementById('hp-text').textContent = `${Math.max(0, p.hp)}/${p.maxHp}`;

  const torchFrac = Math.max(0, Math.min(1, p.torchFuel / FUEL_CAP));
  const torchFill = document.getElementById('torch-fill');
  torchFill.style.width = `${torchFrac * 100}%`;
  torchFill.className = `bar-fill band-${fuelBand(p.torchFuel)}`;
  document.getElementById('torch-text').textContent = `${p.torchFuel}`;

  const inv = document.getElementById('inventory');
  inv.innerHTML = '';
  if (p.inventory.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inv-empty';
    empty.textContent = 'No items — potions, oil and spare torches appear on the floor.';
    inv.appendChild(empty);
  } else {
    p.inventory.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.className = 'inv-slot';
      btn.style.color = item.color;
      btn.textContent = `${i + 1}. ${item.glyph} ${item.name}`;
      btn.addEventListener('click', () => act(() => game.useItem(i)));
      inv.appendChild(btn);
    });
  }

  const log = document.getElementById('log');
  log.innerHTML = game.messages
    .slice(-10)
    .map((m) => `<div>${escapeHtml(m)}</div>`)
    .join('');
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showEndScreen() {
  const won = game.state === 'win';
  document.getElementById('end-title').textContent = won ? 'The Emberheart is yours' : 'Your torch has gone out';
  document.getElementById('end-blurb').textContent = won
    ? 'You carried fire all the way to the bottom of the mine.'
    : 'Something in the dark found you first.';
  const p = game.player;
  const s = game.stats;
  document.getElementById('end-stats').innerHTML = `
    <div>Floor reached: ${game.depth} / ${MAX_FLOOR}</div>
    <div>Turns survived: ${game.turnCount}</div>
    <div>Monsters slain: ${p.kills}</div>
    <div>Gold collected: ${p.gold}</div>
    <div class="meta">Best descent ever: floor ${s.bestFloor} / ${MAX_FLOOR} · ${s.wins} win${s.wins === 1 ? '' : 's'} in ${s.runs} run${s.runs === 1 ? '' : 's'}</div>
  `;
  showScreen('end');
}

function act(fn) {
  if (game.state !== 'playing') return;
  fn();
  updateHUD();
  if (game.state !== 'playing') {
    showEndScreen();
  }
}

function startRun() {
  initAudio();
  game.newGame();
  showScreen('game');
  updateHUD();
}

document.getElementById('start-btn').addEventListener('click', startRun);
document.getElementById('restart-btn').addEventListener('click', () => {
  renderTitleStats();
  startRun();
});

setupInput({
  onMove: (dx, dy) => act(() => game.movePlayer(dx, dy)),
  onWait: () => act(() => game.wait()),
  onUseItem: (i) => act(() => game.useItem(i)),
  onConfirm: () => {
    if (game.state === 'title') startRun();
    else if (game.state === 'dead' || game.state === 'win') startRun();
  },
});

function loop() {
  if (game.state === 'playing') render(ctx, game);
  requestAnimationFrame(loop);
}

renderTitleStats();
requestAnimationFrame(loop);
