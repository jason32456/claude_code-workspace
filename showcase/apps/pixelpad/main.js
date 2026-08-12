import { Editor } from './editor.js';
import { Tools } from './tools.js';
import { Palette, DEFAULT_PALETTE } from './palette.js';
import { save, load } from './storage.js';
import { exportPng } from './export.js';

const artCanvas = document.getElementById('art-canvas');
const gridCanvas = document.getElementById('grid-canvas');
const frame = document.getElementById('canvas-frame');
const sizeSelect = document.getElementById('size-select');
const gridToggle = document.getElementById('grid-toggle');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const exportScale = document.getElementById('export-scale');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const paletteEl = document.getElementById('palette');
const recentEl = document.getElementById('recent-colors');
const colorPicker = document.getElementById('color-picker');
const activeSwatch = document.getElementById('active-swatch');
const mirrorToggle = document.getElementById('mirror-toggle');
const toolButtons = [...document.querySelectorAll('.tool[data-tool]')];

const editor = new Editor(artCanvas, gridCanvas);
const palette = new Palette();
const tools = new Tools(editor, palette);

// ---------- persistence ----------

function persist() {
  save({
    size: editor.size,
    pixels: editor.pixels,
    color: palette.color,
    recent: palette.recent,
    mirror: tools.mirror,
    grid: editor.showGrid,
  });
}

editor.onChange = () => {
  persist();
  updateHistoryButtons();
};

// ---------- palette UI ----------

function renderSwatches(container, colors) {
  container.innerHTML = '';
  for (const color of colors) {
    const btn = document.createElement('button');
    btn.className = 'swatch';
    btn.style.background = color;
    btn.title = color;
    btn.classList.toggle('active', color === palette.color);
    btn.addEventListener('click', () => palette.setColor(color));
    container.appendChild(btn);
  }
}

function refreshPaletteUI() {
  renderSwatches(paletteEl, DEFAULT_PALETTE);
  renderSwatches(recentEl, palette.recent);
  activeSwatch.style.background = palette.color;
  colorPicker.value = palette.color;
}

palette.onColorChange = () => {
  refreshPaletteUI();
  persist();
};

colorPicker.addEventListener('input', () => {
  palette.setColor(colorPicker.value);
});

colorPicker.addEventListener('change', () => {
  palette.addRecent(colorPicker.value);
  refreshPaletteUI();
  persist();
});

// ---------- tools UI ----------

tools.onToolChange = (name) => {
  toolButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === name)));
};

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => tools.setTool(btn.dataset.tool));
});

mirrorToggle.addEventListener('click', () => {
  tools.mirror = !tools.mirror;
  mirrorToggle.setAttribute('aria-pressed', String(tools.mirror));
  persist();
});

// ---------- canvas events ----------

frame.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  artCanvas.setPointerCapture?.(e.pointerId);
  tools.pointerDown(e);
});
frame.addEventListener('pointermove', (e) => tools.pointerMove(e));
window.addEventListener('pointerup', () => tools.pointerUp());
frame.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- top bar ----------

sizeSelect.addEventListener('change', () => {
  const next = Number(sizeSelect.value);
  if (next === editor.size) return;
  if (!editor.isEmpty() && !confirm('Switching canvas size clears the drawing. Continue?')) {
    sizeSelect.value = String(editor.size);
    return;
  }
  editor.setSize(next);
});

gridToggle.addEventListener('click', () => {
  editor.setGridVisible(!editor.showGrid);
  gridToggle.setAttribute('aria-pressed', String(editor.showGrid));
  persist();
});

function updateHistoryButtons() {
  undoBtn.disabled = !editor.canUndo();
  redoBtn.disabled = !editor.canRedo();
}

undoBtn.addEventListener('click', () => editor.undo());
redoBtn.addEventListener('click', () => editor.redo());

exportBtn.addEventListener('click', () => exportPng(editor, Number(exportScale.value)));

clearBtn.addEventListener('click', () => {
  if (editor.isEmpty()) return;
  if (confirm('Clear the whole canvas?')) editor.clear();
});

// ---------- keyboard ----------

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? editor.redo() : editor.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    editor.redo();
    return;
  }
  switch (e.key.toLowerCase()) {
    case 'b': tools.setTool('pencil'); break;
    case 'e': tools.setTool('eraser'); break;
    case 'g': tools.setTool('fill'); break;
    case 'i': tools.setTool('eyedropper'); break;
    case 'm': mirrorToggle.click(); break;
  }
});

// ---------- boot ----------

const saved = load();
if (saved) {
  sizeSelect.value = String(saved.size);
  editor.showGrid = saved.grid ?? true;
  gridToggle.setAttribute('aria-pressed', String(editor.showGrid));
  tools.mirror = Boolean(saved.mirror);
  mirrorToggle.setAttribute('aria-pressed', String(tools.mirror));
  palette.color = saved.color ?? palette.color;
  palette.recent = Array.isArray(saved.recent) ? saved.recent : [];
  editor.setSize(saved.size, saved.pixels);
} else {
  editor.setSize(32);
}
refreshPaletteUI();
updateHistoryButtons();

window.addEventListener('resize', () => {
  editor.layout();
  editor.render();
});
