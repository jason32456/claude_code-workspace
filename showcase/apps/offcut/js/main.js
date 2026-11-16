import { Panel } from './stage-input.js';
import { wordToShape, presetToShape, DEFAULT_DETAIL } from './stage-raster.js';
import { shapeVertexCount } from './trace.js';
import { encodeState, decodeState } from './stage-share.js';
import { StageView } from './stage-view.js';
import { Playhead } from './stage-playhead.js';
import { createTimeline } from './stage-timeline.js';
import { createDissector } from './stage-dissect.js';
import { downloadPuzzle, downloadFrame } from './stage-export.js';

const query = new URLSearchParams(location.search);
const engineKind = query.get('engine') === 'fake' ? 'fake' : 'real';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const $ = (selector) => document.querySelector(selector);
const stageEl = $('#stage');
const noteEl = $('#note');
const busyEl = $('#busy');
const factsEl = $('#facts');
const hintEl = $('#hint');
const detailEl = $('#detail');
const detailOut = $('#detail-out');
const svgButton = $('#dl-svg');
const pngButton = $('#dl-png');
const DEFAULT_HINT = hintEl.textContent;

const dissector = createDissector(engineKind);
const playhead = new Playhead({ instantSteps: reducedMotion.matches });
let result = null;
let detail = DEFAULT_DETAIL;
let ticket = 0;
let timer = 0;
let lastHash = '';
let sceneDirty = true;

const tracers = { word: wordToShape, preset: presetToShape };

function makePanel(slot, side, title) {
  const node = $('#panel-template').content.firstElementChild.cloneNode(true);
  node.querySelector('.panel-title').textContent = title;
  $(slot).append(node);
  const panel = new Panel(node, {
    side,
    onChange: ({ delay = 0, retracePad = false } = {}) => {
      if (retracePad) panel.retracePad(detail);
      schedule(delay);
    },
  });
  return panel;
}

const panelA = makePanel('#slot-a', 'a', 'From');
const panelB = makePanel('#slot-b', 'b', 'To');

const view = new StageView($('#canvas'), { onHover });
const timeline = createTimeline($('#timeline'), playhead, () => (sceneDirty = true));

function onHover(id) {
  if (id < 0 || !result) {
    hintEl.textContent = DEFAULT_HINT;
    return;
  }
  const piece = result.pieces[id];
  hintEl.textContent = `Piece ${id + 1} of ${result.pieces.length}: cell ${piece.cellA + 1} of the first shape, cell ${piece.cellB + 1} of the second.`;
}

function showNote(lines) {
  noteEl.replaceChildren(...lines.map((text) => Object.assign(document.createElement('p'), { textContent: text })));
  noteEl.hidden = false;
}

function setFacts(r) {
  if (!r) {
    factsEl.textContent = '';
    return;
  }
  const scale = r.scaleB;
  const scaled = Math.abs(scale - 1) < 0.0005 ? 'the second shape already had the same area' : `second shape scaled ×${scale.toFixed(2)} to match the first's area`;
  factsEl.textContent = `${r.pieces.length} pieces · ${r.a.cells} cells in the first shape, ${r.b.cells} in the second · area check ${r.audit.areaError.toExponential(1)} · ${scaled} · cut in ${Math.max(1, Math.round(r.audit.ms))} ms`;
}

function messageFor(error) {
  switch (error.code) {
    case 'empty':
      return ['One of the shapes is empty.', 'Type a word, pick a shape or draw one.'];
    case 'degenerate':
      return ['That shape is too thin to cut.', 'Try a bolder word or draw something fatter.'];
    case 'self-intersecting':
      return ['That outline crosses itself.', 'Lower Detail or redraw it.'];
    case 'engine-missing':
      return ['The cutting engine could not be loaded.', 'js/engine.js is missing or failed to start.'];
    default:
      return ['The cut did not work.', error.message || 'Something unexpected happened.'];
  }
}

function writeHash() {
  const hash = `#${encodeState(panelA.describe(), panelB.describe(), detail)}`;
  if (hash === lastHash) return;
  lastHash = hash;
  history.replaceState(null, '', hash);
}

function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(recompute, delay);
}

function setResult(next) {
  result = next;
  view.setResult(next);
  setFacts(next);
  svgButton.disabled = pngButton.disabled = !next;
  hintEl.textContent = DEFAULT_HINT;
  sceneDirty = true;
}

async function recompute() {
  const mine = ++ticket;
  const shapes = [panelA, panelB].map((p) => p.shapeFor(detail, tracers));
  writeHash();
  detailOut.textContent = shapes.every((s) => s.length) ? `${shapes.map(shapeVertexCount).join(' + ')} vertices` : '';
  const empty = shapes.findIndex((s) => !s.length);
  if (empty >= 0) {
    setResult(null);
    showNote([`Nothing to cut in ${empty ? 'the second' : 'the first'} shape yet.`, 'Type a word, pick a shape or draw one.']);
    busyEl.hidden = true;
    return;
  }
  const slow = setTimeout(() => (busyEl.hidden = false), 140);
  try {
    const next = await dissector.run(shapes[0], shapes[1]);
    if (mine !== ticket) return;
    noteEl.hidden = true;
    setResult(next);
    playhead.scrub(0);
    playhead.holdLeft = 0.9;
    if (!reducedMotion.matches) playhead.play();
  } catch (error) {
    if (error.code === 'superseded' || mine !== ticket) return;
    setResult(null);
    showNote(messageFor(error));
  } finally {
    clearTimeout(slow);
    if (mine === ticket) busyEl.hidden = true;
  }
}

function applyHash() {
  const saved = decodeState(location.hash);
  if (!saved) return false;
  lastHash = location.hash;
  panelA.load(saved.a);
  panelB.load(saved.b);
  if (saved.detail !== null) {
    detail = saved.detail;
    detailEl.value = String(detail);
  }
  return true;
}

detailEl.addEventListener('input', () => {
  detail = Number(detailEl.value);
  for (const p of [panelA, panelB]) if (p.state.mode === 'draw' && p.pad.inked) p.retracePad(detail);
  schedule(120);
});

$('#swap').addEventListener('click', () => {
  panelA.swapWith(panelB);
  schedule(0);
});

svgButton.addEventListener('click', () => result && downloadPuzzle(result));
pngButton.addEventListener('click', () => {
  view.render();
  downloadFrame($('#canvas'), getComputedStyle(stageEl).backgroundColor);
});
$('#copy-link').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = 'Link copied';
  } catch {
    button.textContent = 'Copy it from the address bar';
  }
  setTimeout(() => (button.textContent = 'Copy link'), 1800);
});

window.addEventListener('hashchange', () => {
  if (location.hash === lastHash) return;
  if (applyHash()) schedule(0);
});

window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' && e.target.type === 'text') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'SUMMARY') {
    e.preventDefault();
    playhead.toggle();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.id !== 'scrub' && tag !== 'INPUT') {
    e.preventDefault();
    playhead.step(e.key === 'ArrowRight' ? 1 : -1);
  } else return;
  sceneDirty = true;
});

new ResizeObserver(() => view.resize()).observe(stageEl);
const dark = matchMedia('(prefers-color-scheme: dark)');
dark.addEventListener('change', () => {
  view.refreshTheme();
  panelA.drawThumbs();
  panelB.drawThumbs();
});
reducedMotion.addEventListener('change', () => (playhead.instantSteps = reducedMotion.matches));

let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  if (playhead.update(dt) || sceneDirty || playhead.pos !== view.pos) {
    sceneDirty = false;
    view.setPos(playhead.pos);
    timeline.update();
  }
  view.render();
  requestAnimationFrame(frame);
}

if (!applyHash()) {
  panelA.load({ mode: 'word', text: 'CAT' });
  panelB.load({ mode: 'word', text: 'DOG' });
}
detailEl.value = String(detail);
view.resize();
timeline.update();
requestAnimationFrame(frame);
recompute();

if (query.has('debug')) window.__offcut = { view, playhead, panels: [panelA, panelB], result: () => result };
