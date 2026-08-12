// Wiring: pointer + keyboard into the editor, the editor into the solver, and
// both into the renderer.

import { LEVELS } from './levels.js';
import { MATERIAL_LIST, MATERIALS, memberCost } from './materials.js';
import * as editorApi from './build.js';
import { createSim, step } from './physics.js';
import { draw, fit, toWorld } from './render.js';
import * as store from './storage.js';
import * as sfx from './audio.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const el = {
  levelLabel: document.getElementById('level-label'),
  levelsBtn: document.getElementById('levels-btn'),
  panel: document.getElementById('panel'),
  panelList: document.getElementById('panel-list'),
  panelClose: document.getElementById('panel-close'),
  budget: document.getElementById('budget'),
  budgetFill: document.getElementById('budget-fill'),
  spent: document.getElementById('spent'),
  budgetTotal: document.getElementById('budget-total'),
  tools: document.getElementById('tools'),
  undo: document.getElementById('undo'),
  redo: document.getElementById('redo'),
  clear: document.getElementById('clear'),
  test: document.getElementById('test'),
  hint: document.getElementById('hint'),
  readout: document.getElementById('readout'),
  peak: document.getElementById('peak'),
  peakFill: document.getElementById('peak-fill'),
  breaks: document.getElementById('breaks'),
  banner: document.getElementById('banner'),
  bannerTitle: document.getElementById('banner-title'),
  bannerSub: document.getElementById('banner-sub'),
  bannerRetry: document.getElementById('banner-retry'),
  bannerNext: document.getElementById('banner-next'),
  stage: document.querySelector('.stage'),
};

const state = {
  levelIndex: 0,
  level: LEVELS[0],
  editor: null,
  sim: null,
  tool: 'road',
  material: 'road',
  drag: null,
  ghost: null,
  hoverPoint: null,
  hoverMember: -1,
  sparks: [],
  message: '',
  view: null,
};

// ── Level lifecycle ────────────────────────────────────────────────────────

function loadLevel(index, { restore = true } = {}) {
  state.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
  state.level = LEVELS[state.levelIndex];
  state.editor = editorApi.createEditor(state.level);
  state.sim = null;
  state.sparks = [];
  state.drag = null;
  state.ghost = null;
  state.message = '';

  if (restore) {
    const saved = store.loadLevelState(state.level.id);
    if (saved && saved.design) editorApi.deserialize(state.editor, saved.design);
  }

  el.levelLabel.textContent = `${state.levelIndex + 1} · ${state.level.name}`;
  el.budgetTotal.textContent = state.level.budget;
  hideBanner();
  resize();
  syncHud();
}

function startTest() {
  const check = editorApi.validate(state.editor);
  if (!check.ok) {
    state.message = check.reason;
    syncHud();
    return;
  }
  store.saveDesign(state.level.id, editorApi.serialize(state.editor));
  state.sim = createSim(editorApi.structureOf(state.editor), state.level);
  state.sparks = [];
  el.test.textContent = '■ Stop';
  el.readout.hidden = false;
  hideBanner();
  syncHud();
}

function stopTest() {
  state.sim = null;
  el.test.textContent = '▶ Test';
  el.readout.hidden = true;
  hideBanner();
  syncHud();
}

function finish(status, reason) {
  const spent = editorApi.cost(state.editor);
  if (status === 'won') {
    store.saveWin(state.level.id, spent);
    sfx.win();
    el.bannerTitle.textContent = 'CROSSED';
    el.bannerTitle.className = 'banner-title win';
    el.bannerSub.textContent = `${state.level.name} cleared for §${spent} · ${state.sim.breaks} member${
      state.sim.breaks === 1 ? '' : 's'
    } lost`;
    el.bannerNext.hidden = state.levelIndex >= LEVELS.length - 1;
  } else {
    sfx.lose();
    const stalled = reason === 'stalled' && !state.sim.breaks;
    el.bannerTitle.textContent = stalled ? 'STALLED' : 'COLLAPSE';
    el.bannerTitle.className = 'banner-title fail';
    el.bannerSub.textContent = state.sim.breaks
      ? `${state.sim.breaks} member${state.sim.breaks === 1 ? '' : 's'} failed before the truck got across`
      : 'The deck sagged too far for the truck to climb out';
    el.bannerNext.hidden = true;
  }
  el.banner.hidden = false;
  buildLevelPanel();
}

function hideBanner() {
  el.banner.hidden = true;
}

// ── HUD ────────────────────────────────────────────────────────────────────

function syncHud() {
  const spent = editorApi.cost(state.editor);
  const pct = Math.min(100, (spent / state.level.budget) * 100);
  el.spent.textContent = spent;
  el.budgetFill.style.width = `${pct}%`;
  el.budget.classList.toggle('over', spent > state.level.budget);

  el.undo.disabled = !state.editor.undoStack.length || !!state.sim;
  el.redo.disabled = !state.editor.redoStack.length || !!state.sim;
  el.clear.disabled = !state.editor.members.length || !!state.sim;

  const check = editorApi.validate(state.editor);
  const warn = state.message || (!check.ok ? check.reason : '');
  el.hint.textContent = warn || state.level.hint;
  el.hint.classList.toggle('warn', !!warn);

  el.tools.querySelectorAll('.tool').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === state.tool);
  });
  el.stage.classList.toggle('erasing', state.tool === 'erase');
}

function buildTools() {
  el.tools.innerHTML = '';
  const add = (id, label, color, cost) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.dataset.tool = id;
    b.innerHTML = `<span class="swatch" style="--swatch:${color}"></span>${label}${
      cost ? `<span class="cost">§${cost}/m</span>` : ''
    }`;
    b.addEventListener('click', () => {
      state.tool = id;
      if (id !== 'erase') state.material = id;
      syncHud();
    });
    el.tools.appendChild(b);
  };
  MATERIAL_LIST.forEach((m) => add(m.id, m.name, m.color, m.cost));
  add('erase', 'Erase', '#ef4444', 0);
}

function buildLevelPanel() {
  const saved = store.progress();
  el.panelList.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const s = saved[lv.id] || {};
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'level-row' + (i === state.levelIndex ? ' active' : '');
    row.innerHTML = `
      <span class="level-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="level-meta">${lv.name}${s.cleared ? ' ✓' : ''}<small>${lv.hint}</small></span>
      <span class="level-best">${s.best ? `§${s.best}` : ''}</span>
    `;
    row.addEventListener('click', () => {
      el.panel.hidden = true;
      stopTest();
      loadLevel(i);
      buildLevelPanel();
    });
    el.panelList.appendChild(row);
  });
}

// ── Pointer ────────────────────────────────────────────────────────────────

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return toWorld(state.view, e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('pointerdown', (e) => {
  if (state.sim) return;
  canvas.setPointerCapture(e.pointerId);
  const p = pointerPos(e);

  if (state.tool === 'erase' || e.button === 2) {
    const i = editorApi.memberNear(state.editor, p.x, p.y);
    if (i >= 0) {
      editorApi.removeMember(state.editor, i);
      sfx.place();
      state.message = '';
      syncHud();
    }
    return;
  }
  state.drag = editorApi.snapPoint(state.editor, p.x, p.y);
});

canvas.addEventListener('pointermove', (e) => {
  if (state.sim) return;
  const p = pointerPos(e);
  const snapped = editorApi.snapPoint(state.editor, p.x, p.y);
  state.hoverPoint = state.tool === 'erase' ? null : snapped;
  state.hoverMember = state.tool === 'erase' ? editorApi.memberNear(state.editor, p.x, p.y) : -1;

  if (state.drag) {
    const check = editorApi.checkPlacement(state.editor, state.drag, snapped, state.material);
    state.ghost = { a: state.drag, b: snapped, material: state.material, ok: check.ok };
    if (check.reason && check.reason !== state.message) {
      state.message = check.reason;
      syncHud();
    }
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!state.drag || state.sim) return;
  const p = pointerPos(e);
  const snapped = editorApi.snapPoint(state.editor, p.x, p.y);
  const result = editorApi.addMember(state.editor, state.drag, snapped, state.material);
  if (result.ok) {
    sfx.place();
    state.message = '';
  } else if (result.reason) {
    state.message = result.reason;
  }
  state.drag = null;
  state.ghost = null;
  syncHud();
});

canvas.addEventListener('pointerleave', () => {
  state.hoverPoint = null;
  state.hoverMember = -1;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ── Keyboard ───────────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const key = e.key.toLowerCase();

  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    e.preventDefault();
    if (state.sim) return;
    if (e.shiftKey) editorApi.redo(state.editor);
    else editorApi.undo(state.editor);
    syncHud();
    return;
  }
  const material = MATERIAL_LIST.find((m) => m.key === e.key);
  if (material) {
    state.tool = material.id;
    state.material = material.id;
    syncHud();
  } else if (key === 'e') {
    state.tool = 'erase';
    syncHud();
  } else if (key === ' ' || key === 'enter') {
    e.preventDefault();
    state.sim ? stopTest() : startTest();
  } else if (key === 'r') {
    stopTest();
  } else if (key === 'escape') {
    el.panel.hidden = true;
  }
});

// ── Buttons ────────────────────────────────────────────────────────────────

el.test.addEventListener('click', () => (state.sim ? stopTest() : startTest()));
el.undo.addEventListener('click', () => {
  editorApi.undo(state.editor);
  syncHud();
});
el.redo.addEventListener('click', () => {
  editorApi.redo(state.editor);
  syncHud();
});
el.clear.addEventListener('click', () => {
  editorApi.clear(state.editor);
  state.message = '';
  syncHud();
});
el.levelsBtn.addEventListener('click', () => {
  buildLevelPanel();
  el.panel.hidden = !el.panel.hidden;
});
el.panelClose.addEventListener('click', () => (el.panel.hidden = true));
el.bannerRetry.addEventListener('click', stopTest);
el.bannerNext.addEventListener('click', () => {
  stopTest();
  loadLevel(state.levelIndex + 1);
  buildLevelPanel();
});

// ── Loop ───────────────────────────────────────────────────────────────────

function resize() {
  state.view = fit(canvas, state.level.world);
}

window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (state.sim && state.sim.status === 'running') {
    step(state.sim, dt);
    drainEvents();
  }
  for (const s of state.sparks) s.life -= dt;
  state.sparks = state.sparks.filter((s) => s.life > 0);

  if (state.sim) {
    el.peak.textContent = `${Math.round(state.sim.maxRatio * 100)}%`;
    el.peakFill.style.width = `${Math.min(100, state.sim.maxRatio * 100)}%`;
    el.peakFill.style.background =
      state.sim.maxRatio > 0.8 ? '#ef4444' : state.sim.maxRatio > 0.45 ? '#fbbf24' : '#38bdf8';
    el.breaks.textContent = state.sim.breaks;
  }

  draw(ctx, state.view, state.level, state);
  requestAnimationFrame(frame);
}

function drainEvents() {
  const sim = state.sim;
  while (sim.events.length) {
    const ev = sim.events.shift();
    if (ev.type === 'break') {
      state.sparks.push({ x: ev.x, y: ev.y, life: 0.5, maxLife: 0.5 });
      sfx.snap();
    } else if (ev.type === 'won' || ev.type === 'lost') {
      finish(ev.type, ev.reason);
    }
  }
}

// ── Test hooks ─────────────────────────────────────────────────────────────
// Exposed so designs can be driven programmatically for playtests and
// screenshots without clicking through the UI.

window.cantilever = {
  state,
  LEVELS,
  loadLevel: (i) => loadLevel(i, { restore: false }),
  addMember: (ax, ay, bx, by, material = 'beam') => {
    const r = editorApi.addMember(state.editor, { x: ax, y: ay }, { x: bx, y: by }, material);
    syncHud();
    return r;
  },
  cost: () => editorApi.cost(state.editor),
  validate: () => editorApi.validate(state.editor),
  test: startTest,
  stop: stopTest,
  status: () => (state.sim ? state.sim.status : 'build'),
  sim: () => state.sim,
  memberCost,
  materials: MATERIALS,
};

buildTools();
buildLevelPanel();
loadLevel(0);
requestAnimationFrame(frame);
