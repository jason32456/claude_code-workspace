import { Renderer } from './js/render.js';
import { B_CRIT, R_H, R_PH, shadowAngle, redshiftFactor } from './js/physics.js';

const $ = (s) => document.querySelector(s);
const QUALITY = { draft: { finalScale: 2, ss: 1 }, full: { finalScale: 1, ss: 1 }, aa: { finalScale: 1, ss: 2 } };

const state = {
  inc: 75, dist: 45, fov: 24, rIn: 6, rOut: 16, exposure: 1,
  sky: 'stars', shade: 'full', quality: 'draft', disk: true,
};

const renderer = new Renderer($('#view'), (s) => {
  $('#status').textContent = s.finished
    ? `${s.rays.toLocaleString()} geodesics · ${s.seconds.toFixed(2)} s · ${Math.round(s.rate / 1000)}k rays/s · ${renderer.workerCount} workers`
    : `${s.pct}% · ${s.rays.toLocaleString()} geodesics · ${s.seconds.toFixed(1)} s`;
});

function params() {
  const q = QUALITY[state.quality];
  const rIn = state.rIn, rOut = Math.max(rIn + 2, state.rOut);
  const rPeak = (49 / 36) * rIn;
  const Fmax = Math.pow(rPeak, -3) * (1 - Math.sqrt(rIn / rPeak));
  return {
    W: 880, H: 495, r0: state.dist, inc: state.inc, fov: state.fov,
    rIn, rOut, Fmax, diskOn: state.disk, skyMode: state.sky,
    shading: state.shade, exposure: state.exposure,
    diskGain: 0.30, skyGain: state.sky === 'none' ? 0 : 1, T0: 3400,
    hBase: q.finalScale === 2 ? 0.04 : 0.028, maxSteps: 14000,
    finalScale: q.finalScale, ss: q.ss,
  };
}

function go() {
  $('#status').textContent = 'tracing…';
  renderer.render(params());
  readout();
}

// Numbers that describe the frame currently on screen, worked out in closed form
// rather than measured off the pixels — the bench panes do the measuring.
function readout() {
  const { rIn, r0 } = params();
  const alpha = shadowAngle(r0) * 180 / Math.PI;
  const v = Math.sqrt(1 / rIn) / Math.sqrt(1 - 2 / rIn);          // static-frame orbital speed
  const inc = state.inc * Math.PI / 180;
  // Approaching and receding limbs at the inner edge, seen at this inclination.
  const bz = rIn / Math.sqrt(1 - 2 / rIn) * Math.sin(inc);
  const gA = redshiftFactor(rIn, bz, r0), gR = redshiftFactor(rIn, -bz, r0);
  const ratio = Math.pow(gA / gR, 4);
  $('#render-read').innerHTML = `<div class="cards">
    <div class="card"><div class="k">shadow angular radius</div><div class="v warm">${alpha.toFixed(2)}°</div>
      <div class="d">from ${r0} M. It is set by b = 3√3 M, not by the horizon at 2 M.</div></div>
    <div class="card"><div class="k">orbital speed at inner edge</div><div class="v cool">${(v).toFixed(3)} c</div>
      <div class="d">measured by a static observer sitting at r = ${rIn} M.</div></div>
    <div class="card"><div class="k">redshift, two limbs</div><div class="v">${gA.toFixed(3)} / ${gR.toFixed(3)}</div>
      <div class="d">g = ν_obs/ν_emit, approaching and receding, at this inclination.</div></div>
    <div class="card"><div class="k">brightness ratio</div><div class="v warm">${ratio.toFixed(1)}×</div>
      <div class="d">g⁴, the whole reason the image is lopsided.</div></div>
  </div>`;
}

const bind = (id, key, fmt, transform = (v) => v) => {
  const el = $(id), out = $(id.replace('#c-', '#v-'));
  const upd = () => {
    state[key] = transform(parseFloat(el.value));
    out.textContent = fmt(state[key]);
  };
  el.addEventListener('input', upd);
  el.addEventListener('change', go);
  upd();
};
bind('#c-inc', 'inc', (v) => `${v}°`);
bind('#c-dist', 'dist', (v) => `${v} M`);
bind('#c-fov', 'fov', (v) => `${v}°`);
bind('#c-rin', 'rIn', (v) => `${v.toFixed(1)} M`);
bind('#c-rout', 'rOut', (v) => `${v} M`);
bind('#c-exp', 'exposure', (v) => v.toFixed(2), (v) => Math.pow(10, v));

for (const [attr, key] of [['sky', 'sky'], ['shade', 'shade'], ['q', 'quality']]) {
  document.querySelectorAll(`[data-${attr}]`).forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll(`[data-${attr}]`).forEach((o) => o.classList.remove('on'));
    b.classList.add('on');
    state[key] = b.dataset[attr];
    go();
  }));
}
$('#c-disk').addEventListener('change', (e) => { state.disk = e.target.checked; go(); });
$('#c-render').addEventListener('click', go);

const loaded = {};
$('#tabs').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#tabs button').forEach((o) => o.classList.toggle('on', o === b));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === `pane-${b.dataset.pane}`));
  const name = b.dataset.pane;
  if (name !== 'render' && !loaded[name]) {
    loaded[name] = true;
    if (name === 'checks') $('#checks-out').innerHTML = '<p class="pending">running…</p>';
    const mod = await import(`./js/panes/${name}.js`);
    mod.run();
  }
});

$('#run-checks').addEventListener('click', async () => {
  $('#checks-out').innerHTML = '<p class="pending">running…</p>';
  const mod = await import('./js/panes/checks.js');
  mod.run();
});

window.EDDINGTON = { B_CRIT, R_H, R_PH };
go();
