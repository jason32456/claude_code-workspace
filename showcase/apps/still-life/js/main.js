import { createEye } from './eye.js';
import { createNote } from './note.js';
import { encodeNote, decodeNote, clampNote } from './note-link.js';

const COLS = 320;
const ROWS = 180;
const STEP_MS = 1000 / 60;
const MAX_TICKS = 3;
const IDLE = Object.freeze({ dx: 0, dy: 0, action: false });
const NOTE_PREFIX = '#note=';
const NOTE_CAPTION = 'A note. It can be read, but not photographed.';
const FALLBACK_TEXT = 'THE WORLD IS NOT HERE YET';
const SEEN_KEY = 'still-life-seen';

const $ = (id) => document.getElementById(id);
const canvas = $('screen');
const captionText = $('caption-text');
const playLink = $('play-link');
const writer = $('writer');
const noteField = $('note-text');
const writerStatus = $('writer-status');
const buttons = {
  pause: $('btn-pause'),
  diff: $('btn-diff'),
  save: $('btn-save'),
  mute: $('btn-mute'),
  full: $('btn-full'),
  write: $('btn-write'),
};

const eye = createEye(canvas, { cols: COLS, rows: ROWS });

const state = {
  world: null,
  mode: 'loading', // 'game' | 'shared' | 'writing' | 'fallback' | 'loading'
  stash: null,
  paused: false,
  muted: false,
  holdKey: false,
  holdButton: false,
  input: null,
  gamePromise: null,
  bootToken: 0,
  failure: '',
};

const fmt = (n) => n.toLocaleString('en-US');
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(2)}%` : 'none');

// Two standard deviations of a fair coin over n cells. Printed beside each
// share so a small region reading 48% is seen for what it is.
const chance = (n) => `±${(100 / Math.sqrt(n)).toFixed(2)}`;

function receipt() {
  const { light, total, lightInside, totalInside } = eye.census();
  const outside = total - totalInside;
  const inside = totalInside
    ? `Inside things: ${pct(lightInside, totalInside)} (chance alone: ${chance(totalInside)}).`
    : 'Inside things: there are none in this frame.';
  const rest = outside ? ` Outside: ${pct(light - lightInside, outside)} (${chance(outside)}).` : '';
  return `Paused. ${fmt(light)} of ${fmt(total)} cells are light (${pct(light, total)}). ${inside}${rest} This frame contains nothing.`;
}

function liveCaption() {
  if (state.mode === 'shared' || state.mode === 'writing') return NOTE_CAPTION;
  if (state.mode === 'fallback') return state.failure;
  if (state.mode === 'loading' || !state.world) return '';
  const { state: phase, level, levelCount, title, deaths } = state.world.info();
  const parts = [];
  if (level > 0) parts.push(levelCount > 0 ? `${level} / ${levelCount}` : String(level));
  if (title) parts.push(title);
  if (deaths > 0) parts.push(`${deaths} caught`);
  if (!parts.length && phase === 'end') parts.push('THE END');
  return parts.join(' · ');
}

let shownCaption = null;
function refreshCaption() {
  const text = state.paused ? receipt() : liveCaption();
  if (text !== shownCaption) {
    shownCaption = text;
    captionText.textContent = text;
  }
  playLink.hidden = state.mode !== 'shared';
}

function readInput() {
  return state.mode === 'game' && state.input ? state.input.read() : IDLE;
}

function tick(input) {
  state.world.step(input);
  eye.render(state.world.scene());
}

function adopt(world, mode, failure = '') {
  state.world = world;
  state.mode = mode;
  state.failure = failure;
  world.setMuted(state.muted);
  clock.reset();
  tick(IDLE);
  refreshCaption();
}

function setPaused(paused) {
  if (state.paused === paused) return;
  state.paused = paused;
  buttons.pause.textContent = paused ? 'Resume' : 'Pause';
  buttons.pause.setAttribute('aria-pressed', String(paused));
  clock.reset();
  refreshCaption();
}

const clock = (() => {
  let last = null;
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = last === null ? 0 : now - last;
    last = now;
    if (state.paused || !state.world) return;
    accumulator += Math.min(elapsed, 100);
    let ticks = 0;
    while (accumulator >= STEP_MS && ticks < MAX_TICKS) {
      tick(readInput());
      accumulator -= STEP_MS;
      ticks++;
    }
    if (ticks === MAX_TICKS) accumulator %= STEP_MS;
    if (ticks) refreshCaption();
  }
  return {
    start() { requestAnimationFrame(frame); },
    reset() { last = null; accumulator = 0; },
  };
})();

function noteWorld(text) {
  return createNote({ cols: COLS, rows: ROWS, text });
}

function loadGame() {
  state.gamePromise ??= Promise.all([import('./world.js'), import('./input.js')]).catch((error) => {
    state.gamePromise = null;
    throw error;
  });
  return state.gamePromise;
}

async function boot() {
  const token = ++state.bootToken;
  closeWriter(false);
  const hash = location.hash;
  if (hash.startsWith(NOTE_PREFIX)) {
    const text = decodeNote(hash.slice(NOTE_PREFIX.length));
    adopt(noteWorld(text ?? 'THIS NOTE COULD NOT BE READ'), 'shared');
    return;
  }
  try {
    const [worldModule, inputModule] = await loadGame();
    if (token !== state.bootToken) return;
    state.input ??= inputModule.createInput(canvas);
    if (!state.inputWired) {
      state.inputWired = true;
      state.input.onGesture(() => state.world?.unlockAudio());
    }
    adopt(worldModule.createWorld({ cols: COLS, rows: ROWS }), 'game');
  } catch (error) {
    if (token !== state.bootToken) return;
    console.warn('Still Life: the world could not be loaded.', error);
    adopt(noteWorld(FALLBACK_TEXT), 'fallback', 'The world could not be loaded. A note stands in for it.');
  }
}

function goToGame() {
  history.replaceState(null, '', location.pathname + location.search);
  boot();
}

// Writing a note previews it live on the canvas; the world underneath is kept
// and returns untouched.
let previewTimer = 0;
function previewText() {
  return clampNote(noteField.value) || 'WRITE A NOTE';
}

function openWriter() {
  if (state.mode === 'writing') return;
  state.stash = { world: state.world, mode: state.mode, failure: state.failure };
  writer.hidden = false;
  buttons.write.setAttribute('aria-expanded', 'true');
  adopt(noteWorld(previewText()), 'writing');
  noteField.focus();
  resizeSoon();
}

function closeWriter(restore) {
  clearTimeout(previewTimer);
  if (state.mode !== 'writing' && writer.hidden) return;
  writer.hidden = true;
  writerStatus.textContent = '';
  buttons.write.setAttribute('aria-expanded', 'false');
  const stash = state.stash;
  state.stash = null;
  if (restore && stash) {
    if (stash.mode === 'game' || stash.mode === 'fallback') {
      adopt(stash.world, stash.mode, stash.failure);
    } else {
      goToGame();
    }
  }
  resizeSoon();
}

async function copyLink() {
  const text = clampNote(noteField.value);
  if (!text) {
    writerStatus.textContent = 'Nothing written yet.';
    return;
  }
  const url = `${location.origin}${location.pathname}${location.search}${NOTE_PREFIX}${encodeNote(text)}`;
  try {
    await navigator.clipboard.writeText(url);
    writerStatus.textContent = 'Link copied.';
  } catch {
    window.prompt('Copy this link', url);
    writerStatus.textContent = '';
  }
}

noteField.addEventListener('input', () => {
  writerStatus.textContent = '';
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (state.mode !== 'writing') return;
    adopt(noteWorld(previewText()), 'writing');
  }, 150);
});
noteField.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key === 'Enter') copyLink();
  if (event.key === 'Escape') noteField.blur();
});

function updateView() {
  eye.setView(state.holdKey || state.holdButton ? 'difference' : 'normal');
  buttons.diff.setAttribute('aria-pressed', String(state.holdButton));
}

function toggleMute() {
  state.muted = !state.muted;
  state.world?.setMuted(state.muted);
  buttons.mute.textContent = state.muted ? 'Unmute' : 'Mute';
  buttons.mute.setAttribute('aria-pressed', String(state.muted));
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

buttons.pause.addEventListener('click', () => setPaused(!state.paused));
buttons.save.addEventListener('click', () => eye.saveFrame());
buttons.mute.addEventListener('click', toggleMute);
buttons.full.addEventListener('click', toggleFullscreen);
buttons.write.addEventListener('click', () => (state.mode === 'writing' ? closeWriter(true) : openWriter()));
$('btn-copy').addEventListener('click', copyLink);
$('btn-back').addEventListener('click', () => closeWriter(true));
playLink.addEventListener('click', (event) => {
  event.preventDefault();
  goToGame();
});
if (!document.fullscreenEnabled) buttons.full.hidden = true;

// Hold-to-see: pointer capture keeps the release event even if a finger slides
// off the button. A keyboard activation (no pointer) toggles instead.
buttons.diff.addEventListener('pointerdown', (event) => {
  state.holdButton = true;
  buttons.diff.setPointerCapture?.(event.pointerId);
  updateView();
});
const releaseDiff = () => {
  if (!state.holdButton) return;
  state.holdButton = false;
  updateView();
};
buttons.diff.addEventListener('pointerup', releaseDiff);
buttons.diff.addEventListener('pointercancel', releaseDiff);
buttons.diff.addEventListener('lostpointercapture', releaseDiff);
buttons.diff.addEventListener('click', (event) => {
  if (event.detail !== 0) return;
  state.holdButton = !state.holdButton;
  updateView();
});
buttons.diff.addEventListener('contextmenu', (event) => event.preventDefault());

// Keep the keyboard with the game: a mouse click should not leave a button
// focused, or the next Space / Enter would press it again.
for (const button of document.querySelectorAll('#controls button')) {
  button.addEventListener('mousedown', (event) => event.preventDefault());
}

const SHELL_KEYS = {
  p: () => setPaused(!state.paused),
  escape: () => setPaused(!state.paused),
  m: toggleMute,
  f: toggleFullscreen,
  c: () => eye.saveFrame(),
};

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'x') {
    if (!state.holdKey) {
      state.holdKey = true;
      updateView();
    }
    event.preventDefault();
    return;
  }
  const action = SHELL_KEYS[key];
  if (!action) return;
  event.preventDefault();
  if (!event.repeat) action();
});
window.addEventListener('keyup', (event) => {
  if (event.key.toLowerCase() === 'x') {
    state.holdKey = false;
    updateView();
  }
});
window.addEventListener('blur', () => {
  state.holdKey = false;
  state.holdButton = false;
  updateView();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});

let resizePending = false;
function resizeSoon() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    eye.resize();
  });
}
window.addEventListener('resize', resizeSoon);
document.addEventListener('fullscreenchange', resizeSoon);
new ResizeObserver(resizeSoon).observe($('stage'));

window.addEventListener('hashchange', boot);

function dismissFlickerLine() {
  document.documentElement.dataset.seen = '1';
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage may be blocked */ }
}
try { if (localStorage.getItem(SEEN_KEY)) document.documentElement.dataset.seen = '1'; } catch { /* storage may be blocked */ }
window.addEventListener('pointerdown', dismissFlickerLine, { once: true });
window.addEventListener('keydown', dismissFlickerLine, { once: true });

clock.start();
boot();
