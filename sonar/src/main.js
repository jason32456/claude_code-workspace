import { createLevel, update, PING_COOLDOWN } from './game.js';
import { render, renderIdle } from './renderer.js';
import { moveAxis, onPress } from './input.js';
import { unlock, sfx } from './audio.js';

const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const panels = {
  title: document.getElementById('title-panel'),
  clear: document.getElementById('clear-panel'),
  over: document.getElementById('over-panel'),
};
const heartsEl = document.getElementById('hearts');
const levelEl = document.getElementById('level-label');
const shardEl = document.getElementById('shard-label');
const scoreEl = document.getElementById('score-label');
const pingFill = document.getElementById('ping-fill');
const clearStats = document.getElementById('clear-stats');
const overStats = document.getElementById('over-stats');

let mode = 'title'; // title | play | clear | over
let state = null;
let wantPing = false;
let best = Number(localStorage.getItem('sonar-best') || 0);

function showPanel(name) {
  overlay.classList.toggle('hidden', !name);
  for (const [k, el] of Object.entries(panels)) el.classList.toggle('hidden', k !== name);
}

function startRun() {
  state = createLevel(1, 0, 3);
  mode = 'play';
  hud.classList.remove('hidden');
  showPanel(null);
}

function nextLevel() {
  state = createLevel(state.level + 1, state.score, state.hearts);
  mode = 'play';
  showPanel(null);
}

onPress((code) => {
  unlock();
  if (mode === 'play') {
    if (code === 'Space' || code === 'Pointer') wantPing = true;
    return;
  }
  if (code !== 'Space' && code !== 'Pointer' && code !== 'Enter') return;
  if (mode === 'title' || mode === 'over') startRun();
  else if (mode === 'clear') nextLevel();
});

function syncHud() {
  heartsEl.textContent = '♥'.repeat(Math.max(0, state.hearts)) + '♡'.repeat(Math.max(0, 3 - state.hearts));
  levelEl.textContent = `DEPTH ${state.level}`;
  const got = state.shards.filter((s) => s.taken).length;
  shardEl.textContent = `◆ ${got}/${state.shards.length}`;
  scoreEl.textContent = String(state.score);
  pingFill.style.width = `${(1 - state.pingCooldown / PING_COOLDOWN) * 100}%`;
}

function onEvents(events) {
  for (const ev of events) {
    if (ev === 'clear') {
      mode = 'clear';
      clearStats.innerHTML =
        `depth ${state.level} escaped in ${state.time.toFixed(1)}s<br />score <span class="cyan">${state.score}</span>`;
      showPanel('clear');
    } else if (ev === 'dead') {
      mode = 'over';
      if (state.score > best) {
        best = state.score;
        localStorage.setItem('sonar-best', String(best));
      }
      sfx.gameOver();
      overStats.innerHTML =
        `the dark reached depth ${state.level}<br />score <span class="cyan">${state.score}</span> · best <span class="gold">${best}</span>`;
      showPanel('over');
      hud.classList.add('hidden');
    }
  }
}

let last = performance.now();
function frame(now) {
  const t = now / 1000;
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (mode === 'play') {
    const events = update(state, dt, moveAxis(), wantPing);
    wantPing = false;
    render(state, t);
    syncHud();
    onEvents(events);
  } else if (mode === 'clear') {
    render(state, t);
  } else {
    renderIdle(t);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
