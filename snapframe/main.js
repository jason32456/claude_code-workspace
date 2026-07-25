import { DEFAULTS, FRAMES, GRADIENTS, RATIOS } from './presets.js';
import { layout, render, renderToCanvas } from './render.js';
import { createDemoImage } from './demo.js';

const PREVIEW_MAX_W = 1500;
const PREVIEW_MAX_H = 950;

const settings = { ...DEFAULTS };
let image = null;
let exportCount = 0;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('preview');
const ctx = canvas.getContext('2d');
const empty = $('empty');
const sizeLabel = $('size-label');
const toast = $('toast');
const fileInput = $('file-input');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 1900);
}

/* ---------- control construction ---------- */

function buildSwatches() {
  $('swatches').innerHTML = '';
  GRADIENTS.forEach((g) => {
    const btn = document.createElement('button');
    btn.className = 'swatch' + (g.id === settings.gradient ? ' is-active' : '');
    btn.style.background = `linear-gradient(135deg, ${g.stops.join(', ')})`;
    btn.title = g.name;
    btn.setAttribute('aria-label', g.name);
    btn.addEventListener('click', () => {
      settings.gradient = g.id;
      settings.bgMode = 'gradient';
      syncControls();
      draw();
    });
    $('swatches').appendChild(btn);
  });
}

function buildSegments() {
  const fill = (host, items, key) => {
    host.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = 'seg-btn' + (settings[key] === item.id ? ' is-active' : '');
      btn.textContent = item.label;
      btn.dataset.value = item.id;
      btn.addEventListener('click', () => {
        settings[key] = item.id;
        syncControls();
        draw();
      });
      host.appendChild(btn);
    });
  };
  fill($('frame-mode'), FRAMES, 'frame');
  fill($('ratio-mode'), RATIOS, 'ratio');
}

function syncControls() {
  document.querySelectorAll('#bg-mode .seg-btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.mode === settings.bgMode)
  );
  document.querySelectorAll('#frame-mode .seg-btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.value === settings.frame)
  );
  document.querySelectorAll('#ratio-mode .seg-btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.value === settings.ratio)
  );
  document.querySelectorAll('.swatch').forEach((b, i) =>
    b.classList.toggle('is-active', GRADIENTS[i].id === settings.gradient)
  );

  $('gradient-group').hidden = settings.bgMode !== 'gradient';
  $('solid-group').hidden = settings.bgMode !== 'solid';

  $('angle').value = settings.angle;
  $('padding').value = settings.padding;
  $('radius').value = settings.radius;
  $('shadow').value = settings.shadow;
  $('tilt').value = settings.tilt;
  $('border').checked = settings.border;
  $('solid').value = settings.solid;
  $('scale').value = String(settings.scale);

  $('angle-val').textContent = `${settings.angle}°`;
  $('padding-val').textContent = `${settings.padding}%`;
  $('radius-val').textContent = `${settings.radius}px`;
  $('shadow-val').textContent = settings.shadow;
  $('tilt-val').textContent = `${settings.tilt}°`;
}

/* ---------- rendering ---------- */

function draw() {
  canvas.hidden = !image;
  empty.hidden = !!image;
  if (!image) {
    sizeLabel.textContent = 'No image loaded';
    return;
  }

  const box = layout(image, settings);
  const fit = Math.min(1, PREVIEW_MAX_W / box.width, PREVIEW_MAX_H / box.height);
  canvas.width = Math.round(box.width * fit);
  canvas.height = Math.round(box.height * fit);
  render(ctx, image, settings, fit);

  const outW = Math.round(box.width * settings.scale);
  const outH = Math.round(box.height * settings.scale);
  sizeLabel.textContent = `${outW} × ${outH} px  ·  ${settings.scale}× export`;
}

/* ---------- image input ---------- */

async function toDrawable(source) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(source);
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadBlob(blob) {
  if (!blob || !blob.type.startsWith('image/')) {
    showToast('That file is not an image');
    return;
  }
  try {
    image = await toDrawable(blob);
    draw();
    showToast('Image loaded');
  } catch {
    showToast('Could not read that image');
  }
}

function loadDemo() {
  image = createDemoImage();
  draw();
}

/* ---------- output ---------- */

function exportCanvas() {
  return renderToCanvas(image, settings, settings.scale);
}

function download() {
  if (!image) return showToast('Load an image first');
  exportCanvas().toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snapframe-${++exportCount}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('PNG downloaded');
  }, 'image/png');
}

async function copy() {
  if (!image) return showToast('Load an image first');
  const blob = await new Promise((res) => exportCanvas().toBlob(res, 'image/png'));
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Copied to clipboard');
  } catch {
    download();
  }
}

function randomize() {
  const pool = GRADIENTS.filter((g) => g.id !== settings.gradient);
  settings.gradient = pool[Math.floor(Math.random() * pool.length)].id;
  settings.angle = Math.floor(Math.random() * 24) * 15;
  settings.bgMode = 'gradient';
  syncControls();
  draw();
}

/* ---------- wiring ---------- */

const sliders = [
  ['angle', 'angle', (v) => Number(v)],
  ['padding', 'padding', (v) => Number(v)],
  ['radius', 'radius', (v) => Number(v)],
  ['shadow', 'shadow', (v) => Number(v)],
  ['tilt', 'tilt', (v) => Number(v)],
];

sliders.forEach(([id, key, parse]) => {
  $(id).addEventListener('input', (e) => {
    settings[key] = parse(e.target.value);
    syncControls();
    draw();
  });
});

$('border').addEventListener('change', (e) => {
  settings.border = e.target.checked;
  draw();
});

$('solid').addEventListener('input', (e) => {
  settings.solid = e.target.value;
  draw();
});

$('scale').addEventListener('change', (e) => {
  settings.scale = Number(e.target.value);
  draw();
});

document.querySelectorAll('#bg-mode .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    settings.bgMode = btn.dataset.mode;
    syncControls();
    draw();
  });
});

$('random-btn').addEventListener('click', randomize);
$('download-btn').addEventListener('click', download);
$('copy-btn').addEventListener('click', copy);
$('demo-btn').addEventListener('click', loadDemo);
$('empty-demo').addEventListener('click', loadDemo);
$('open-btn').addEventListener('click', () => fileInput.click());
$('empty-open').addEventListener('click', () => fileInput.click());

$('reset-btn').addEventListener('click', () => {
  Object.assign(settings, DEFAULTS);
  syncControls();
  draw();
  showToast('Controls reset');
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadBlob(e.target.files[0]);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((type) =>
  stage.addEventListener(type, (e) => {
    e.preventDefault();
    stage.classList.add('is-dragging');
  })
);

['dragleave', 'drop'].forEach((type) =>
  stage.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === 'dragleave' && stage.contains(e.relatedTarget)) return;
    stage.classList.remove('is-dragging');
  })
);

stage.addEventListener('drop', (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) loadBlob(file);
});

document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  loadBlob(item.getAsFile());
});

document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    download();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
    if (!String(window.getSelection())) copy();
  } else if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'r') {
    randomize();
  }
});

window.addEventListener('resize', draw);

buildSwatches();
buildSegments();
syncControls();
draw();
