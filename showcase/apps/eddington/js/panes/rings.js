import { plot } from '../plot.js';
import { deflection, rk4, B_CRIT, SDL_C } from '../physics.js';
import { table, cards, deg, sig } from './util.js';

const EPI = Math.exp(-Math.PI);

function bForDeflection(alpha) {
  let lo = B_CRIT, hi = 40;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (deflection(m, 1e-3) > alpha) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}

export function run() {
  const bs = [], rows = [];
  for (let n = 1; n <= 6; n++) bs.push(bForDeflection(n * Math.PI));
  for (let n = 1; n <= 6; n++) {
    const d = bs[n - 1] - B_CRIT;
    const ratio = n > 1 ? d / (bs[n - 2] - B_CRIT) : null;
    rows.push([
      `n = ${n}`, `${(n * 180)}°`, bs[n - 1].toFixed(12), d.toExponential(5),
      ratio === null ? '—' : ratio.toFixed(7),
      ratio === null ? '—' : `<span class="${Math.abs(ratio / EPI - 1) < 0.01 ? 'good' : 'warm'}">${((ratio / EPI - 1) * 100).toFixed(3)} %</span>`,
    ]);
  }

  // Growth of a perturbation off the photon sphere. Two seeds: one that is half
  // growing mode and half decaying, and the pure growing mode.
  const grow = (pure) => {
    const d0 = 1e-9, h = 2e-5;
    let u = 1 / 3 + d0, w = pure ? d0 : 0, phi = 0;
    const trace = [];
    for (let i = 0; i < Math.round(8 / h); i++) {
      [u, w] = rk4(u, w, h); phi += h;
      if (i % 2000 === 0 && phi > 0.25) trace.push([phi, Math.log((u - 1 / 3) / d0) / phi]);
    }
    return { rate: Math.log((u - 1 / 3) / d0) / phi, phi, trace };
  };
  const naive = grow(false), pureMode = grow(true);

  plot(document.getElementById('p-rings'), {
    xlim: [0.5, 6.5], ylim: [1e-8, 1], logY: true, legend: true, legendAt: 'bl',
    xlabel: 'ring order n  (total bending nπ)', ylabel: 'b − 3√3 M   [M]',
    fmtX: (v) => String(Math.round(v)),
    series: [
      { data: bs.map((b, i) => [i + 1, b - B_CRIT]), color: '#ff9a4d', label: 'measured by bisection' },
      { data: bs.map((b, i) => [i + 1, (bs[0] - B_CRIT) * Math.pow(EPI, i)]), color: '#63b8ff', dash: [5, 4], label: 'first ring × e^(−π)ⁿ⁻¹' },
    ],
  });

  const sdl = [5.2, 5.25, 5.4, 6, 8].map((b) => {
    const a = deflection(b, 1e-3);
    const s = -Math.log(b / B_CRIT - 1) + SDL_C - Math.PI;
    return [sig(b), `${deg(a).toFixed(4)}°`, `${deg(s).toFixed(4)}°`, `${((a / s - 1) * 100).toFixed(3)} %`];
  });

  document.getElementById('rings-tables').innerHTML = cards([
    { k: 'measured ring ratio', v: (bs[5] - B_CRIT) / (bs[4] - B_CRIT) < 1 ? ((bs[5] - B_CRIT) / (bs[4] - B_CRIT)).toFixed(7) : '—', cls: 'warm', d: `converging on e^(−π) = ${EPI.toFixed(7)}.` },
    { k: 'instability, pure growing mode', v: pureMode.rate.toFixed(7), cls: 'good', d: 'e-foldings per radian of orbit. The analytic value is exactly 1.' },
    { k: 'instability, seeded with δ′ = 0', v: naive.rate.toFixed(6), cls: 'warm', d: `Not a failure. That seed is half growing and half decaying mode, so δ = δ₀cosh φ and the reading is ln(cosh φ)/φ = ${(Math.log(Math.cosh(naive.phi)) / naive.phi).toFixed(6)}.` },
    { k: 'rings inside the first', v: 'unbounded', d: 'Each is thinner than the last by 23.1×, so the sky repeats forever in a band you could never resolve.' },
  ]) +
  `<h3>Where each ring sits</h3>
   <p class="tight">A ray bent by exactly nπ comes back to the observer having crossed the line of sight n times, so these are the impact parameters of the successive images of a source directly behind the hole. Nothing about e^(−π) was put into the integrator; it falls out of the <code>3u²</code>.</p>` +
  table(['ring', 'total bending', 'b [M]', 'b − 3√3 M', 'ratio to previous', 'vs e^(−π)'], rows) +
  `<h3>Against the strong-deflection limit</h3>
   <p class="tight">Bozza's closed form <code>α = −ln(b/b_c − 1) + ln[216(7−4√3)] − π</code> is an asymptotic expansion about the photon sphere, so it should be excellent near b_c and visibly wrong away from it. It is, in that direction and no other — which is what makes it a usable grader.</p>` +
  table(['b [M]', 'α integrated', 'α strong-deflection limit', 'difference'], sdl);
}
