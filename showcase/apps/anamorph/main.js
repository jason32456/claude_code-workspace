// UI. All the real work is in js/; this draws it and gets out of the way.

import * as S from './js/scene.js';
import * as C from './js/camera.js';
import * as PL from './js/pipeline.js';
import * as A from './js/anamorph.js';
import * as E from './js/experiments.js';
import { runAll } from './js/selftest.js';

const $ = (s) => document.querySelector(s);
const { W, H } = S.FRAME;

const state = { scene: null, truth: null, sol: null, res: null, photo: null, layout: 'relief', orbit: 0 };

const photoCv = $('#photo'), anaCv = $('#ana');
const photoCtx = photoCv.getContext('2d'), anaCtx = anaCv.getContext('2d');

const yield_ = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function banner(msg) {
  const b = $('#banner');
  if (!msg) { b.hidden = true; return; }
  b.hidden = false;
  b.textContent = msg;
}

function putImage(ctx, rgba) {
  ctx.putImageData(new ImageData(rgba, W, H), 0, 0);
}

// --- the photograph, with what the detector made of it ------------------------

function drawPhoto() {
  putImage(photoCtx, state.photo.rgba);
  if (!$('#overlay').checked || !state.res) return;
  const ctx = photoCtx;
  ctx.lineWidth = 2;
  ctx.font = '600 15px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (const d of state.res.markers) {
    ctx.strokeStyle = 'rgba(95,208,160,0.95)';
    ctx.beginPath();
    d.quad.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.stroke();
    // Corner 0 marked, because which corner is first is the whole of the
    // rotation question.
    ctx.fillStyle = '#f0a030';
    ctx.beginPath();
    ctx.arc(d.quad[0][0], d.quad[0][1], 4.5, 0, 7);
    ctx.fill();
    const cx = d.quad.reduce((s, p) => s + p[0], 0) / 4;
    const cy = d.quad.reduce((s, p) => s + p[1], 0) / 4;
    ctx.fillStyle = 'rgba(11,15,22,0.78)';
    ctx.fillRect(cx - 20, cy - 12, 40, 22);
    ctx.fillStyle = '#dfe7f2';
    ctx.fillText(`#${d.id}`, cx, cy + 4);
  }
  for (const r of state.res.rejected) {
    if (!r.contour || r.contour.length < 8) continue;
    ctx.strokeStyle = 'rgba(226,104,109,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    r.contour.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.stroke();
  }
}

// --- the anamorph -------------------------------------------------------------

// Orbit the VIEWING camera around the scene while the paint stays keyed to the
// recovered one. At zero they coincide and the picture is whole.
function viewCamera(t) {
  if (t === 0) return state.truth;
  const eye = C.centre(state.truth);
  const pivot = [0, -170, 250];
  const dx = eye[0] - pivot[0], dz = eye[2] - pivot[2];
  // Keep the orbit inside the room -- swing far enough and the camera ends up
  // behind a wall, which is a black frame rather than a smeared picture. It does
  // not need to be far: a single degree of yaw already tears the picture apart.
  const ang = (t / 100) * 0.22;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const ne = [pivot[0] + dx * ca - dz * sa, eye[1] + (t / 100) * 90, pivot[2] + dx * sa + dz * ca];
  return C.lookAt(ne, pivot, [0, 1, 0], {
    f: state.truth.f, cx: state.truth.cx, cy: state.truth.cy, k1: state.truth.k1, k2: state.truth.k2,
  });
}

let anaToken = 0;
async function drawAnamorph(quality = 2) {
  const my = ++anaToken;
  const key = state.sol ? state.sol.cam : state.truth;
  const view = viewCamera(state.orbit);
  await yield_();
  if (my !== anaToken) return;
  const out = A.renderAnamorph(state.scene, key, view, W, H, { ss: quality });
  if (my !== anaToken) return;
  putImage(anaCtx, out.rgba);
}

// --- the scoreboard -----------------------------------------------------------

function fmt(x, d = 3) { return Number.isFinite(x) ? x.toFixed(d) : '—'; }

function drawScores() {
  const sc = PL.score(state.truth, state.sol.cam, state.scene);
  const est = state.sol.cam, t = state.truth;
  const rows = [
    ['Position error', `${fmt(sc.posErr)} mm`, `camera ${(sc.distance / 10).toFixed(0)} cm from the scene`, 'amber'],
    ['Orientation error', `${fmt(sc.rotErr, 4)}°`, 'angle between the true and recovered rotations', 'amber'],
    ['Focal length', `${fmt(est.f, 2)} px`, `true ${t.f}  ·  off by ${fmt(sc.fErrPct, 3)}%`, 'cyan'],
    ['Radial k₁', `${fmt(est.k1, 4)}`, `true ${fmt(t.k1, 3)}  ·  off by ${fmt(Math.abs(sc.k1Err), 4)}`, 'cyan'],
    ['Residual, fitted', `${fmt(state.sol.rmsAll, 4)} px`, `over ${state.sol.inliers.length} marker corners it was fitted to`, 'green'],
    ['Residual, held out', `${fmt(sc.holdoutRms, 3)} px`, `over ${sc.holdoutN} scene vertices it never saw`, 'green'],
  ];
  $('#scores').innerHTML = rows.map(([k, v, s, cls]) =>
    `<div><dt>${k}</dt><dd class="${cls}">${v}<small>${s}</small></dd></div>`).join('');

  const ratio = sc.holdoutRms / state.sol.rmsAll;
  $('#board-note').innerHTML = `Fitting the marker corners to <strong>${fmt(state.sol.rmsAll, 3)} px</strong> does not mean the camera is right to ${fmt(state.sol.rmsAll, 3)} px anywhere else: on scene geometry the solver was never given a correspondence for, it is <strong>${ratio.toFixed(1)}×</strong> worse. That gap is why this page has an anamorph instead of a residual.`;

  $('#detect-stat').textContent =
    `${state.res.markers.length} markers · ${state.res.componentCount} dark regions examined · threshold ${state.res.threshold.toFixed(3)} (Otsu)`;
}

// --- run ----------------------------------------------------------------------

async function run() {
  const btn = $('#run');
  btn.disabled = true;
  banner('Rendering the scene and taking the camera back…');
  state.layout = $('#layout').value;
  state.orbit = 0;
  $('#orbit').value = 0;
  await yield_();

  state.scene = S.buildScene({ layout: state.layout, relief: 1, markerCount: state.layout === 'grid' ? 12 : 6 });
  state.truth = PL.makeTruthCamera(state.layout);
  state.photo = PL.photograph(state.scene, state.truth, { ss: 2 });
  await yield_();

  const rec = PL.recover(state.scene, state.photo.rgba);
  if (!rec.ok) {
    state.res = rec.res || { markers: [], rejected: [], componentCount: 0, threshold: 0 };
    state.sol = null;
    drawPhoto();
    banner(`The recovery refused: ${rec.reason}`);
    btn.disabled = false;
    return;
  }
  state.res = rec.res;
  state.sol = rec.sol;

  drawPhoto();
  drawScores();
  await drawAnamorph(2);
  banner('');
  btn.disabled = false;
}

// --- experiments --------------------------------------------------------------

function table(head, rows) {
  return `<table class="data"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map((r) => `<tr${r.hi ? ' class="hi"' : ''}>${(r.cells || r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function verdict(html, negative) {
  return `<p class="verdict${negative ? ' negative' : ''}">${html}</p>`;
}

// A small line chart, drawn by hand because there is no library here.
function chart(series, opts = {}) {
  const w = opts.w || 720, h = opts.h || 190, pad = { l: 56, r: 14, t: 14, b: 32 };
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.className = 'chart';
  cv.style.width = '100%';
  const c = cv.getContext('2d');
  c.fillStyle = '#080b12';
  c.fillRect(0, 0, w, h);
  const all = series.flatMap((s) => s.pts);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = opts.y0 ?? 0, y1 = Math.max(...ys) * 1.08;
  const X = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((v - y0) / (y1 - y0 || 1)) * (h - pad.t - pad.b);

  c.strokeStyle = '#24304a';
  c.lineWidth = 1;
  c.fillStyle = '#64728c';
  c.font = '11px ui-monospace, monospace';
  for (let i = 0; i <= 4; i++) {
    const v = y0 + ((y1 - y0) * i) / 4, y = Y(v);
    c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
    c.textAlign = 'right';
    c.fillText(v.toFixed(v < 10 ? 2 : 0), pad.l - 8, y + 4);
  }
  c.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const v = x0 + ((x1 - x0) * i) / 5;
    c.fillText(opts.xfmt ? opts.xfmt(v) : v.toFixed(2), X(v), h - 10);
  }
  if (opts.xlabel) { c.textAlign = 'left'; c.fillStyle = '#8b9ab4'; c.fillText(opts.xlabel, pad.l, 12); }

  for (const s of series) {
    c.strokeStyle = s.colour;
    c.lineWidth = 2;
    c.beginPath();
    s.pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(Math.min(p[1], y1))) : c.moveTo(X(p[0]), Y(Math.min(p[1], y1)))));
    c.stroke();
    if (s.label) {
      c.fillStyle = s.colour;
      c.textAlign = 'right';
      c.fillText(s.label, w - pad.r, pad.t + 10 + series.indexOf(s) * 14);
    }
  }
  return cv;
}

const EXPERIMENTS = {
  planar() {
    const p = E.planarDegeneracy();
    const rows = [];
    for (const [k, v] of Object.entries(p)) {
      const name = k === 'planar' ? 'every marker on one plane' : 'markers on six surfaces';
      rows.push([name, v.n, v.zeros, Number.isFinite(v.cond) ? v.cond.toExponential(1) : '∞',
        v.dlt.ok ? `${v.dlt.posErr.toExponential(1)} mm` : '<span class="bad">will not decompose</span>',
        v.hom.ok ? `${v.hom.posErr.toFixed(3)} mm` : '—']);
    }
    const pl = p.planar, re = p.relief;
    return table(['configuration', 'points', 'singular values at zero', 'condition number', 'general DLT', 'homography route'], rows)
      + verdict(`Off the plane the general method is not merely adequate, it is <strong>exact</strong> — ${re.dlt.posErr.toExponential(1)} mm and a focal length of ${re.dlt.f.toFixed(6)} against a true ${re.trueF}. Put the same markers on one plane and <strong>${pl.zeros} of its 12 singular values collapse to zero</strong>: with every point at the same depth in the plane's own frame, nothing in the image constrains the third column of the camera matrix, and there is no camera to extract. The homography route — which is only valid on a plane, and so is useless in the case the general method handles — returns ${pl.hom.posErr.toFixed(3)} mm.`);
  },

  slant() {
    const rows = E.slantSweep();
    const flat = rows[0], steep = rows[rows.length - 1];
    // Where the configuration is degenerate the solver still returns a camera,
    // and it is meaningless. Print it as such rather than as a measurement.
    const body = rows.map((r) => {
      const dead = r.valley > 0.25;
      return [
        `${r.slantDeg}°`,
        r.valley === 0 ? '<span class="good">none \u2014 f is pinned</span>' : `\u00b1${(100 * r.valley / 2).toFixed(0)}%`,
        dead ? `<span class="bad">not determined</span> <small>(${r.fErrPct.toFixed(0)}%)</small>`
             : `${r.fErrPct.toFixed(2)}%`,
        !r.score ? '—'
          : dead ? `<span class="bad">${(r.score.posErr / 10).toFixed(0)} cm</span>`
          : `${r.score.posErr.toFixed(1)} mm`,
      ];
    });
    const el = document.createElement('div');
    el.innerHTML = table(['target slant', 'spread of focal lengths that fit as well', 'focal error', 'position error'], body);
    const norm = (r) => r.curve.map((p) => [p.f / r.truthF, p.rms]);
    el.appendChild(chart([
      { pts: norm(flat), colour: '#e2686d', label: 'fronto-parallel (0°)' },
      { pts: norm(steep), colour: '#5fd0a0', label: `slanted (${steep.slantDeg}°)` },
    ], { xlabel: 'residual (px) against focal length, as a multiple of the true one', xfmt: (v) => v.toFixed(2) + '×' }));
    // State the flatness as what it is: how little the residual moves across the
    // whole swept range of focal length, next to how much it moves when the same
    // flat target is tilted.
    const span = (r) => {
      const rms = r.curve.map((p) => p.rms);
      const f = r.curve.map((p) => p.f);
      const d = r.curve.map((p) => p.dist);
      return {
        lo: Math.min(...rms), hi: Math.max(...rms),
        fLo: Math.min(...f), fHi: Math.max(...f),
        dLo: Math.min(...d), dHi: Math.max(...d),
      };
    };
    const a = span(flat), b = span(steep);
    const closed = rows.find((r) => r.valley === 0);
    el.insertAdjacentHTML('beforeend', verdict(
      `Square-on to the camera the residual is <strong>flat</strong>. Sweeping the focal length from ${a.fLo.toFixed(0)} to ${a.fHi.toFixed(0)} px — a factor of ${(a.fHi / a.fLo).toFixed(1)} — moves it by <strong>${(a.hi - a.lo).toFixed(3)} px in total</strong>, and the recovered camera simply slides from ${a.dLo.toFixed(0)} mm to ${a.dHi.toFixed(0)} mm away to keep the picture the same size. Every one of those cameras explains the photograph equally well, so this is not a solver that failed: it is a question the image does not contain the answer to, and no algorithm recovers it. Tilt the same flat target and the same sweep moves the residual by ${(b.hi - b.lo).toFixed(1)} px${closed ? `, and by ${closed.slantDeg}° the focal length is pinned to ${Math.abs(closed.fErrPct).toFixed(2)}%` : ''}. <strong>What breaks the tie is the angle you hold the target at, not how much depth the scene has</strong> — one homography puts two constraints on the intrinsics, and they go degenerate exactly when the plane faces the camera square-on.`));
    return el;
  },

  relief() {
    const rows = E.reliefSweep([0, 0.25, 0.5, 1.0]);
    const flatness = rows.map((r) => S.planarity(S.buildScene({ layout: 'steps', relief: r.relief })));
    const body = rows.map((r, i) => [
      r.relief.toFixed(2),
      flatness[i] < 1e-6 ? `${flatness[i].toExponential(0)} mm` : `${flatness[i].toFixed(1)} mm`,
      r.valley === 0 ? '<span class="good">none \u2014 f is pinned</span>' : `\u00b1${(100 * r.valley / 2).toFixed(0)}%`,
      `${r.fErrPct.toFixed(2)}%`,
      r.score ? `${r.score.posErr.toFixed(2)} mm` : '—',
    ]);
    return table(['relief setting', 'departure from a plane', 'spread of focal lengths that fit as well', 'focal error', 'position error'], body)
      + verdict(`The plan was that flattening the markers into one plane would make the focal length unrecoverable, and it does not: at <strong>exactly zero relief</strong> — the markers coplanar to ${flatness[0].toExponential(0)} mm — the focal length still comes back to ${Math.abs(rows[0].fErrPct).toFixed(2)}%, and no setting in the sweep is measurably better than any other. The reason is in finding 2: these markers lie on the floor and are seen at a steep angle, and a slanted plane determines the focal length on its own. The experiment was measuring the wrong variable. It is kept here because deleting it would leave finding 2 looking like something this project knew in advance.`, true);
  },

  distortion() {
    const rows = E.distortionOverfit({ sigmas: [0, 0.5, 1, 2, 3], trials: 25 });
    const body = rows.map((r) => [
      `${r.sigma.toFixed(2)} px`,
      `<span class="good">${r.free.rms.toFixed(4)}</span>`,
      r.pinned.rms.toFixed(4),
      `${r.free.pos.toFixed(2)}`,
      `${r.pinned.pos.toFixed(2)}`,
      (r.free.pos / r.pinned.pos).toFixed(3),
    ]);
    const better = rows.filter((r) => r.free.rms < r.pinned.rms).length;
    const posBetter = rows.filter((r) => r.free.pos < r.pinned.pos).length;
    return table(['corner noise', 'residual, k free', 'residual, k pinned', 'position, k free (mm)', 'position, k pinned (mm)', 'ratio'], body)
      + verdict(`The residual falls in <strong>${better} of ${rows.length}</strong> cases — it has to, because two free parameters can absorb noise that is not radial at all, and the truth here has no distortion whatsoever for them to find. The position error improves in ${posBetter} of ${rows.length}, with ratios scattered either side of 1. So the honest result is not the one this was set up to show: fitting two parameters that do not exist does not visibly damage the camera. <strong>It just stops the residual from telling you anything.</strong> You bought a better-looking number and no better camera, which is the case for grading a pose on something other than its residual.`, true);
  },

  spread() {
    const s = E.spreadVsCount({ sigma: 0.6, trials: 41 });
    const label = { spread: 'six, spread across the frame', clustered: 'six, packed into one corner', all12: 'all twelve' };
    const body = ['spread', 'clustered', 'all12'].filter((k) => s[k] && !s[k].failed).map((k) => [
      label[k], s[k].markers, `${(s[k].coverage * 100).toFixed(1)}%`,
      s[k].rms.toFixed(3), s[k].pos.toFixed(2), s[k].rot.toFixed(4),
    ]);
    const r = (s.clustered.pos / s.spread.pos);
    return table(['markers used', 'count', 'frame covered', 'residual (px)', 'position error (mm)', 'rotation error (°)'], body)
      + verdict(`Same photograph, same marker size, same count, same noise: six markers spread over the frame give ${s.spread.pos.toFixed(2)} mm, and six packed into a corner give ${s.clustered.pos.toFixed(2)} mm — <strong>${r.toFixed(1)}× worse</strong>. Note that the residuals are nearly identical (${s.clustered.rms.toFixed(3)} against ${s.spread.rms.toFixed(3)} px), so nothing in the fit reports the problem. And doubling the evidence does not fix it: all twelve markers give ${s.all12.pos.toFixed(2)} mm, no better than the well-chosen six. <strong>Where the measurements sit matters more than how many there are.</strong>`);
  },
};

for (const btn of document.querySelectorAll('[data-exp]')) {
  btn.addEventListener('click', async () => {
    const card = btn.closest('.card');
    const busy = card.querySelector('.busy');
    const out = card.querySelector('.result');
    btn.disabled = true; busy.hidden = false;
    await yield_();
    try {
      const r = EXPERIMENTS[btn.dataset.exp]();
      out.innerHTML = '';
      if (typeof r === 'string') out.innerHTML = r; else out.appendChild(r);
      out.hidden = false;
    } catch (err) {
      out.hidden = false;
      out.innerHTML = `<p class="verdict negative">The measurement failed: ${err.message}</p>`;
    }
    btn.disabled = false; busy.hidden = true;
  });
}

$('#run-checks').addEventListener('click', async () => {
  const btn = $('#run-checks'), busy = btn.parentElement.querySelector('.busy');
  btn.disabled = true; busy.hidden = false;
  await yield_();
  const list = $('#checklist');
  list.innerHTML = '';
  const results = runAll();
  for (const t of results) {
    const li = document.createElement('li');
    li.className = t.pass ? 'pass' : 'fail';
    li.innerHTML = `<span class="mark">${t.pass ? '✓' : '✗'}</span><span>${t.name}<span class="detail">${t.detail}</span></span>`;
    list.appendChild(li);
  }
  const n = results.filter((t) => t.pass).length;
  busy.textContent = `${n} of ${results.length} passed`;
  btn.disabled = false;
});

// --- wiring -------------------------------------------------------------------

$('#run').addEventListener('click', run);
$('#layout').addEventListener('change', run);
$('#overlay').addEventListener('change', drawPhoto);

let orbitTimer = null;
$('#orbit').addEventListener('input', (e) => {
  state.orbit = +e.target.value;
  if (!state.sol) return;
  drawAnamorph(1);
  clearTimeout(orbitTimer);
  orbitTimer = setTimeout(() => drawAnamorph(2), 260);
});
$('#recentre').addEventListener('click', () => {
  $('#orbit').value = 0;
  state.orbit = 0;
  drawAnamorph(2);
});

run();
