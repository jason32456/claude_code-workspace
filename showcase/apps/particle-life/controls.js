import { params, SPECIES_COLORS, sim, randomizeMatrix, spawnParticles } from './simulation.js';

// Red = attract, dark = neutral, blue = repel
function cellBg(v) {
  const t = Math.abs(v);
  return v >= 0
    ? `rgb(${Math.round(30 + 160 * t)},30,30)`
    : `rgb(30,30,${Math.round(30 + 160 * t)})`;
}

function fmtVal(v) {
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}

// ---- Matrix editor ---------------------------------------------------------

let matrixDragCleanup = null;

function buildMatrix(grid) {
  if (matrixDragCleanup) { matrixDragCleanup(); matrixDragCleanup = null; }

  const { K } = params;
  grid.style.gridTemplateColumns = `18px repeat(${K}, 1fr)`;
  grid.innerHTML = '';

  // Corner
  grid.appendChild(Object.assign(document.createElement('div'), { className: 'mx-corner' }));

  // Column headers (target species)
  for (let j = 0; j < K; j++) {
    const h = document.createElement('div');
    h.className = 'mx-hdr';
    h.style.background = SPECIES_COLORS[j];
    grid.appendChild(h);
  }

  // Rows
  for (let i = 0; i < K; i++) {
    // Row header (source species)
    const rh = document.createElement('div');
    rh.className = 'mx-hdr';
    rh.style.background = SPECIES_COLORS[i];
    grid.appendChild(rh);

    for (let j = 0; j < K; j++) {
      const cell = document.createElement('div');
      cell.className = 'mx-cell';
      cell.dataset.i = i;
      cell.dataset.j = j;
      const v = sim.matrix[i][j];
      cell.style.background = cellBg(v);
      cell.textContent = fmtVal(v);
      cell.title = `species ${i} → species ${j}`;
      grid.appendChild(cell);
    }
  }

  // Drag: move mouse up → more attract, down → more repel
  let drag = null;

  function onDown(e) {
    const cell = e.target.closest('.mx-cell');
    if (!cell) return;
    drag = { i: +cell.dataset.i, j: +cell.dataset.j, y0: e.clientY, v0: sim.matrix[+cell.dataset.i][+cell.dataset.j], el: cell };
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag) return;
    const { i, j, y0, v0, el } = drag;
    const v = Math.max(-1, Math.min(1, v0 + (y0 - e.clientY) / 80));
    sim.matrix[i][j] = v;
    el.style.background = cellBg(v);
    el.textContent = fmtVal(v);
  }

  function onUp() { drag = null; }

  grid.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  matrixDragCleanup = () => {
    grid.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
}

function refreshMatrixColors(grid) {
  grid.querySelectorAll('.mx-cell').forEach(cell => {
    const v = sim.matrix[+cell.dataset.i][+cell.dataset.j];
    cell.style.background = cellBg(v);
    cell.textContent = fmtVal(v);
  });
}

// ---- Slider helper ---------------------------------------------------------

function addSlider(container, label, key, min, max, step, fmt) {
  const row = document.createElement('div');
  row.className = 'ctrl-row';

  const lbl  = Object.assign(document.createElement('label'), { textContent: label });
  const inp  = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value: params[key] });
  const disp = Object.assign(document.createElement('span'),  { className: 'ctrl-val', textContent: fmt(params[key]) });

  inp.addEventListener('input', () => {
    params[key] = +inp.value;
    disp.textContent = fmt(params[key]);
  });

  row.append(lbl, inp, disp);
  container.appendChild(row);
  return inp;
}

// ---- Public ----------------------------------------------------------------

export function initControls(callbacks) {
  const btnPause      = document.getElementById('btn-pause');
  const btnRandomize  = document.getElementById('btn-randomize');
  const btnRespawn    = document.getElementById('btn-respawn');
  const ctrlWrap      = document.getElementById('ctrl-sliders');
  const matrixGrid    = document.getElementById('matrix-grid');

  // Buttons
  btnPause.addEventListener('click', () => {
    const p = callbacks.onPauseToggle();
    btnPause.textContent = p ? 'Play' : 'Pause';
    btnPause.classList.toggle('active', p);
  });

  btnRandomize.addEventListener('click', () => {
    randomizeMatrix();
    refreshMatrixColors(matrixGrid);
  });

  btnRespawn.addEventListener('click', spawnParticles);

  // Sliders — N and K need extra work on release
  const nInp = addSlider(ctrlWrap, 'Particles (N)', 'N', 100, 5000, 100, v => v);
  const kInp = addSlider(ctrlWrap, 'Species (K)',   'K', 2,   8,    1,   v => v);
  addSlider(ctrlWrap, 'Radius (rMax)',   'rMax',       0.02, 0.30, 0.01,  v => v.toFixed(2));
  addSlider(ctrlWrap, 'Force',           'forceFactor', 0.1,  5.0,  0.1,   v => v.toFixed(1));
  addSlider(ctrlWrap, 'Friction',        'friction',    0.5,  0.99, 0.01,  v => v.toFixed(2));
  addSlider(ctrlWrap, 'Beta',            'beta',        0.1,  0.5,  0.01,  v => v.toFixed(2));
  addSlider(ctrlWrap, 'Time step (dt)',  'dt',          0.005,0.05, 0.005, v => v.toFixed(3));

  // Rebuild particles when N changes (on pointer release to avoid per-drag respawns)
  nInp.addEventListener('change', spawnParticles);

  // Rebuild matrix + particles when K changes
  kInp.addEventListener('change', () => {
    randomizeMatrix();
    spawnParticles();
    buildMatrix(matrixGrid);
  });

  // Initial matrix build
  buildMatrix(matrixGrid);
}
