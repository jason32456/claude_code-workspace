import { plot } from '../plot.js';
import { traceRay, shadowAngle, B_CRIT, R_H, R_PH } from '../physics.js';
import { table, cards, deg, sig } from './util.js';

// Measure the shadow the way an observer would: sweep the viewing angle until
// rays stop coming back. Nothing here consults B_CRIT.
function measure(r0) {
  const f0 = Math.sqrt(1 - 2 / r0);
  const captured = (t) => {
    const psi = Math.PI - t;
    return traceRay(r0, Math.cos(psi), Math.sin(psi), 0, 1,
      { disk: false, hBase: 0.01, rEsc: 2000, maxSteps: 80000 }).kind === 'capture';
  };
  let lo = 1e-7, hi = Math.PI / 2;
  for (let i = 0; i < 64; i++) {
    const m = 0.5 * (lo + hi);
    if (captured(m)) lo = m; else hi = m;
  }
  const t = 0.5 * (lo + hi);
  return { t, b: r0 * Math.sin(Math.PI - t) / f0 };
}

export function run() {
  const rows = [];
  for (const r0 of [3.5, 4, 5, 6, 10, 20, 45, 100, 1000]) {
    const m = measure(r0);
    rows.push([
      `${r0} M`, `${deg(m.t).toFixed(4)}°`, m.b.toFixed(9),
      `<span class="${Math.abs(m.b / B_CRIT - 1) < 1e-8 ? "good" : "bad"}">${(m.b / B_CRIT - 1).toExponential(2)}</span>`,
      `${deg(shadowAngle(r0)).toFixed(4)}°`,
      `${(deg(m.t) / deg(Math.asin(Math.min(1, R_H / r0)))).toFixed(3)}×`,
    ]);
  }

  const curve = [], naive = [];
  for (let i = 0; i <= 200; i++) {
    const r = 3 * Math.pow(1000 / 3, i / 200);
    curve.push([r, deg(shadowAngle(r))]);
    naive.push([r, deg(Math.asin(Math.min(1, R_H / r)))]);
  }
  plot(document.getElementById('p-shadow'), {
    xlim: [3, 1000], ylim: [0.1, 90], logX: true, logY: true, legend: true, legendAt: 'bl',
    xlabel: 'observer radius r  [M]', ylabel: 'angular radius  [degrees]',
    series: [
      { data: curve, color: '#ff9a4d', label: 'shadow: arcsin(3√3 M √(1−2M/r) / r)' },
      { data: naive, color: '#9aa7c2', dash: [4, 4], label: 'horizon if light went straight: arcsin(2M/r)' },
      { data: [[3, 90]], color: '#63b8ff', points: true, width: 5, label: 'photon sphere: exactly 90°' },
    ],
  });

  document.getElementById('shadow-tables').innerHTML = cards([
    { k: 'shadow radius ÷ horizon radius', v: `${(B_CRIT / R_H).toFixed(6)}×`, cls: 'warm', d: '3√3 M against 2M. The dark patch is not the horizon and never was.' },
    { k: 'sky area vs naive silhouette', v: `${((B_CRIT / R_H) ** 2).toFixed(3)}×`, cls: 'cool', d: 'Squaring the radius ratio: the dark patch covers 6.75 times the solid angle a straight-line silhouette of the horizon would.' },
    { k: 'at the photon sphere', v: '90.000°', cls: 'good', d: 'sin α = 3√3·√(1−2/3)/3 = 1 exactly. Half the sky goes dark at r = 3M.' },
    { k: 'independent of mass', v: 'yes', d: 'In units of M every number on this page is the same for every Schwarzschild hole in the universe.' },
  ]) +
  `<h3>The shadow edge, bisected out of the renderer</h3>
   <p class="tight">Each row bisects on the camera's own viewing angle for 64 iterations, then converts to an impact parameter using <code>b = r sin ψ / √(1−2M/r)</code>. The measured value has no access to 3√3; agreement to parts per billion is the integrator and the relation between them both being right.</p>` +
  table(['camera at', 'shadow angular radius', 'measured b at the edge', 'error vs 3√3 M', 'closed form', 'vs arcsin(2M/r)'], rows);
}
