// Wiring: a pool of workers, each owning a band, drawing into one canvas.

import { makeTests, ggxEnergy } from './js/selftest.js';

const $ = (id) => document.getElementById(id);
const W = 480, H = 270;
const POOL = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));

const ctx = $('view').getContext('2d', { alpha: false });
const image = ctx.createImageData(W, H);

let workers = [];
let scene = 'gallery';
let bands = [];
let started = 0;
let running = true;

const NOTES = {
  gallery: 'Glass with a hollow shell, a gold conductor, a rough GGX metal and two diffuse spheres '
    + 'over a checkered floor, lit by one emissive sphere and a sky gradient. The lens has a real '
    + 'aperture, so the depth of field is sampled rather than blurred afterwards.',
  caustic: 'One glass sphere and one small bright source. The bright knot on the floor is a caustic '
    + '— light refracted twice and focused — and it appears because the paths that make it are '
    + 'traced, not because anything here knows what a caustic is.',
  bleed: 'A white sphere between a red wall and a green wall. The colour on its sides is not painted '
    + 'on: it is light that hit a wall, took its colour, and bounced. Turn the bounces down to 1 and '
    + 'it goes away.',
  furnace: 'A sphere of albedo 1 inside a void of uniform radiance 1. The correct image is flat, and '
    + 'the sphere is not visible at all. The reading below is the whole test.',
};

/** How a pass should be displayed: tone-mapped, linear, or as an error image. */
function passMsg() {
  const furnace = scene === 'furnace';
  return {
    type: 'pass', passes: 1,
    linear: furnace,
    deviation: furnace && $('dev').checked,
    gain: 20,
  };
}

function options() {
  return {
    maxDepth: +$('depth').value,
    russianRoulette: $('rr').checked,
    cosineSampling: $('cos').checked,
    brokenBasis: $('broken').checked,
  };
}

function sceneOptions() {
  return scene === 'furnace' ? { multiScatter: $('ms').checked } : { multiScatter: $('ms').checked };
}

function restart() {
  for (const w of workers) w.terminate();
  workers = []; bands = [];
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  started = performance.now();

  const rows = Math.ceil(H / POOL);
  for (let i = 0; i < POOL; i++) {
    const y0 = i * rows, y1 = Math.min(H, y0 + rows);
    if (y0 >= y1) break;
    const w = new Worker('./js/worker.js', { type: 'module' });
    w.onmessage = (ev) => onBand(i, ev.data, w);
    w.postMessage({
      type: 'init', scene, width: W, height: H, y0, y1,
      opts: options(), sceneOpts: sceneOptions(),
    });
    w.postMessage(passMsg());
    workers.push(w);
    bands.push({ samples: 0, min: Infinity, max: -Infinity, sum: 0, n: 0 });
  }
  $('furnacebox').hidden = scene !== 'furnace';
  $('scene-note').textContent = NOTES[scene];
}

function onBand(i, msg, w) {
  if (msg.type !== 'band') return;
  image.data.set(msg.rgba, msg.y0 * W * 4);
  ctx.putImageData(image, 0, 0);
  bands[i] = { samples: msg.samples, min: msg.min, max: msg.max, sum: msg.sum, n: msg.n };

  const spp = Math.min(...bands.map((b) => b.samples));
  $('spp').textContent = spp.toLocaleString();
  const secs = (performance.now() - started) / 1000;
  if (secs > 0.4) {
    const rays = spp * W * H / secs;
    $('rate').textContent = `${(rays / 1e6).toFixed(2)}M primary rays/s`;
  }

  if (scene === 'furnace') updateFurnace();

  // Each worker asks for its own next pass, so a slow band never stalls the rest.
  if (running) w.postMessage(passMsg());
}

function updateFurnace() {
  const min = Math.min(...bands.map((b) => b.min));
  const max = Math.max(...bands.map((b) => b.max));
  const sum = bands.reduce((a, b) => a + b.sum, 0);
  const n = bands.reduce((a, b) => a + b.n, 0);
  const mean = sum / n;
  const dev = Math.max(Math.abs(min - 1), Math.abs(max - 1));
  $('f-mean').textContent = mean.toFixed(9);
  $('f-min').textContent = min.toFixed(9);
  $('f-max').textContent = max.toFixed(9);
  $('f-dev').textContent = dev === 0 ? '0' : dev.toExponential(3);
  const v = $('f-verdict');
  if (dev === 0) {
    v.className = 'verdictline ok';
    v.textContent = 'Flat. Every pixel is exactly 1.0 and the sphere is not there — no energy '
      + 'gained, none lost, and no noise, because there is nothing left to be uncertain about.';
  } else {
    v.className = 'verdictline no';
    v.textContent = `The sphere is visible. Worst pixel is off by ${dev.toExponential(2)}, which is `
      + 'energy the renderer is inventing or dropping. Nothing about the other scenes would have '
      + 'told you.';
  }
}

$('dev').addEventListener('input', () => { /* display only — no restart needed */ });

for (const id of ['depth', 'rr', 'cos', 'ms', 'broken']) {
  $(id).addEventListener('input', () => {
    if (id === 'depth') $('depth-out').textContent = $('depth').value;
    restart();
  });
}
$('restart').addEventListener('click', restart);
document.querySelectorAll('#scenes button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#scenes button').forEach((x) => x.classList.toggle('on', x === b));
  scene = b.dataset.scene;
  restart();
}));

// ── the energy chart ────────────────────────────────────────────────────────
$('run-energy').addEventListener('click', () => {
  const btn = $('run-energy');
  btn.disabled = true; btn.textContent = 'Measuring…';
  setTimeout(() => {
    drawEnergy(ggxEnergy());
    btn.disabled = false; btn.textContent = 'Measure it again';
  }, 30);
});

function drawEnergy(rows) {
  const w = 900, h = 320, pad = { l: 56, r: 20, t: 18, b: 42 };
  const x = (r) => pad.l + (r - 0.1) / 0.9 * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v) * (h - pad.t - pad.b);
  const line = (key, colour) => rows.map((r, i) =>
    `${i ? 'L' : 'M'}${x(r.roughness).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');

  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) =>
    `<line class="gridline" x1="${pad.l}" y1="${y(v)}" x2="${w - pad.r}" y2="${y(v)}"/>`
    + `<text x="${pad.l - 10}" y="${y(v) + 4}" text-anchor="end">${(v * 100).toFixed(0)}%</text>`).join('');
  const ticks = rows.map((r) =>
    `<text x="${x(r.roughness)}" y="${h - pad.b + 20}" text-anchor="middle">${r.roughness.toFixed(1)}</text>`).join('');

  $('energy-chart').innerHTML = `
    <svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <line class="axis" x1="${pad.l}" y1="${y(1)}" x2="${w - pad.r}" y2="${y(1)}"/>
      <path d="${line('single', '')}" fill="none" stroke="#d06a5e" stroke-width="2.5"/>
      <path d="${line('compensated', '')}" fill="none" stroke="#f0a04b" stroke-width="2.5"/>
      ${rows.map((r) => `<circle cx="${x(r.roughness)}" cy="${y(r.single)}" r="3.5" fill="#d06a5e"/>`).join('')}
      ${rows.map((r) => `<circle cx="${x(r.roughness)}" cy="${y(r.compensated)}" r="3.5" fill="#f0a04b"/>`).join('')}
      <text x="${(w) / 2}" y="${h - 8}" text-anchor="middle">roughness</text>
      <text x="${pad.l + 8}" y="${y(1) - 8}">what a correct surface returns — 100%</text>
      ${ticks}
    </svg>
    <div class="legend">
      <span><i style="background:#d06a5e"></i>single scattering — loses
        ${((1 - rows[rows.length - 1].single) * 100).toFixed(0)}% at roughness 1</span>
      <span><i style="background:#f0a04b"></i>with compensation — still short by
        ${((1 - rows[rows.length - 1].compensated) * 100).toFixed(0)}%</span>
    </div>`;
}

// ── the bench ───────────────────────────────────────────────────────────────
$('run-bench').addEventListener('click', () => {
  const btn = $('run-bench');
  btn.disabled = true; btn.textContent = 'Running…';
  const out = $('bench-out');
  out.replaceChildren();
  const tests = makeTests();
  let i = 0;
  const step = () => {
    if (i >= tests.length) { btn.disabled = false; btn.textContent = 'Run the bench'; return; }
    const t = tests[i++];
    const t0 = performance.now();
    const r = t.run();
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const div = document.createElement('div');
    div.className = `t ${r.pass ? 'ok' : 'no'}`;
    div.innerHTML = `<h3>${r.name} <span class="word">${r.pass ? 'pass' : 'fail'}</span></h3>`
      + `<div class="kv"><span>expected <b>${r.expected}</b></span>`
      + `<span>measured <b>${r.measured}</b></span><span>${secs}s</span></div><p>${r.detail}</p>`;
    out.appendChild(div);
    setTimeout(step, 16);
  };
  step();
});

restart();
