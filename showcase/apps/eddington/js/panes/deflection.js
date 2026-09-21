import { plot } from '../plot.js';
import { deflection, B_CRIT } from '../physics.js';
import { table, cards, arcsec, deg, sig } from './util.js';

// Real-world constants, so the solar row is a prediction in arcseconds rather
// than a number in units of M.
const GM_SUN = 1.32712440018e20;     // m^3 s^-2, IAU nominal
const R_SUN = 6.957e8;               // m, IAU nominal solar radius
const C = 299792458;

export function run() {
  const gr = [], newton = [], weak = [];
  for (let i = 0; i <= 220; i++) {
    const b = B_CRIT * Math.pow(10, (i / 220) * 2.7) * 1.0008;
    gr.push([b, deg(deflection(b, 1e-3))]);
    newton.push([b, deg(2 * Math.atan(1 / b))]);
    weak.push([b, deg(4 / b)]);
  }
  plot(document.getElementById('p-defl'), {
    xlim: [5.1, 3000], ylim: [0.05, 400], logX: true, logY: true, legend: true, legendAt: 'bl',
    xlabel: 'impact parameter b  [M]', ylabel: 'deflection α  [degrees]',
    fmtX: (v) => (v >= 1000 ? `${v / 1000}k` : String(v)),
    series: [
      { data: gr, color: '#ff9a4d', label: 'Schwarzschild, integrated' },
      { data: weak, color: '#63b8ff', dash: [5, 4], label: 'weak field, 4M/b' },
      { data: newton, color: '#9aa7c2', dash: [2, 3], label: 'Newton (Soldner 1801), 2 arctan(M/b)' },
    ],
  });

  const rows = [];
  for (const b of [5.25, 5.5, 6, 8, 12, 30, 100, 1000, 10000]) {
    const a = deflection(b, b > 20 ? 5e-4 : 1e-3);
    const w = 4 / b;
    const series = 4 / b + (15 * Math.PI) / (4 * b * b);
    rows.push([
      sig(b), `${deg(a).toFixed(4)}°`, `${deg(w).toFixed(4)}°`,
      `${((a / w - 1) * 100).toFixed(3)} %`,
      Math.abs(a / series - 1) < 1e-3 ? `${((a / series - 1) * 1e6).toFixed(2)} ppm` : `${((a / series - 1) * 100).toFixed(2)} %`,
      (a / (2 * Math.atan(1 / b))).toFixed(4),
    ]);
  }

  const aGR = 4 * GM_SUN / (C * C * R_SUN);
  const aN = aGR / 2;
  const obs = [
    ['Sobral, 1919 eclipse', 1.98, 0.12],
    ['Príncipe, 1919 eclipse', 1.61, 0.30],
    ['VLBI, Shapiro et al. 2004', 1.7512, 0.0016],
  ];
  const obsRows = obs.map(([n, v, s]) => {
    const dE = (v - arcsec(aGR)) / s, dN = (v - arcsec(aN)) / s;
    return [n, `${v.toFixed(4)}″`, `± ${s}`,
      `${dE >= 0 ? '+' : ''}${dE.toFixed(2)} σ`,
      `<span class="${Math.abs(dN) > 3 ? 'good' : 'warm'}">${dN >= 0 ? '+' : ''}${dN.toFixed(2)} σ</span>`];
  });

  document.getElementById('defl-tables').innerHTML = cards([
    { k: 'Einstein / Newton, weak field', v: sig(deflection(1e4, 5e-4) / (2 * Math.atan(1e-4)), 8), cls: 'warm', d: 'The famous factor of two, measured at b = 10⁴ M rather than assumed.' },
    { k: 'solar limb, general relativity', v: `${arcsec(aGR).toFixed(4)}″`, cls: 'cool', d: '4GM/c²R with the IAU nominal solar mass parameter and radius.' },
    { k: 'solar limb, Newton', v: `${arcsec(aN).toFixed(4)}″`, d: 'Soldner’s 1801 corpuscle calculation, exactly half.' },
    { k: 'where α diverges', v: `${sig(B_CRIT, 7)} M`, cls: 'warm', d: 'Newton’s formula is finite and smooth here. It is also wrong.' },
  ]) + `<h3>Deflection against the weak-field series</h3>` +
    table(['b [M]', 'α integrated', '4M/b', 'excess over 4M/b', 'vs 4M/b + 15πM²/4b²', 'GR ÷ Newton'], rows) +
    `<h3>The 1919 eclipse, graded both ways</h3>
     <p class="tight">The last column is the one that mattered: how many standard deviations each plate sits from <em>Newton</em>. Sobral's is decisive. Eddington's own Príncipe plate — the one the story is usually told about — is 0.47 σ from Einstein and only ${((1.61 - arcsec(aN)) / 0.30).toFixed(2)} σ from Newton, which on its own is not a rejection of anything. Uncertainties are the ones published in Dyson, Eddington &amp; Davidson (1920); their meaning has been argued over ever since.</p>` +
    table(['measurement', 'α at the solar limb', 'quoted error', 'distance from Einstein', 'distance from Newton'], obsRows);
}
