import { plot } from '../plot.js';
import { traceRay, redshiftFactor } from '../physics.js';
import { camera } from '../shade.js';
import { table, cards, sig } from './util.js';

const R_EMIT = 6, R_OBS = 60, FOV = 26;

// Find the extreme redshifts on a narrow annulus at r = 6M by looking at it:
// a coarse sweep to locate the limbs, then local refinement around each one.
//
// A plain fixed grid is not good enough and fails in a way that looks like a
// result rather than a bug. At 89 degrees the annulus is nearly a line in the
// image, a 96x60 grid lands 28 rays on it, and the measured ratio comes out at
// 32 - half the value at 85 degrees, which reads as a real turnover and is
// nothing but undersampling. Refined, it is 79 and the curve keeps climbing.
function gAt(cam, p, px, py) {
  const t = Math.tan(p.fov * Math.PI / 360);
  const sx = px * t * p.aspect, sy = py * t;
  let d = [cam.fwd[0] + sx * cam.right[0] + sy * cam.up[0],
           cam.fwd[1] + sx * cam.right[1] + sy * cam.up[1],
           cam.fwd[2] + sx * cam.right[2] + sy * cam.up[2]];
  const dn = Math.hypot(...d); d = d.map((v) => v / dn);
  const cosPsi = d[0] * cam.e1[0] + d[1] * cam.e1[1] + d[2] * cam.e1[2];
  const perp = [d[0] - cosPsi * cam.e1[0], d[1] - cosPsi * cam.e1[1], d[2] - cosPsi * cam.e1[2]];
  const sinPsi = Math.hypot(...perp);
  if (sinPsi < 1e-12) return null;
  const e2 = perp.map((v) => v / sinPsi);
  const nz = cam.e1[0] * e2[1] - cam.e1[1] * e2[0];
  const res = traceRay(R_OBS, cosPsi, sinPsi, cam.e1[2], e2[2],
    { rIn: R_EMIT, rOut: R_EMIT * 1.08, disk: true, hBase: 0.02, rEsc: 400, maxSteps: 14000 });
  if (res.kind !== 'disk') return null;
  return redshiftFactor(res.r, -res.b * nz, R_OBS);
}

function scan(incDeg) {
  const nx = 128, ny = 80;
  const p = { fov: FOV, aspect: nx / ny };
  const cam = camera(R_OBS, incDeg);
  let hi = null, lo = null, hits = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const px = ((i + 0.5) / nx) * 2 - 1, py = 1 - ((j + 0.5) / ny) * 2;
    const g = gAt(cam, p, px, py);
    if (g === null) continue;
    hits++;
    if (!hi || g > hi.g) hi = { g, px, py };
    if (!lo || g < lo.g) lo = { g, px, py };
  }
  const refine = (seed, sign) => {
    let best = seed, w = 4 / nx;
    for (let round = 0; round < 7; round++) {
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
        const px = best.px + (a * w) / 4, py = best.py + (b * w) / 4;
        const g = gAt(cam, p, px, py);
        if (g !== null && sign * g > sign * best.g) best = { g, px, py };
      }
      w /= 2;
    }
    return best;
  };
  return { gmax: refine(hi, +1).g, gmin: refine(lo, -1).g, hits };
}

// The limb estimate: flat-space axial angular momentum r sin i, carried over to
// Schwarzschild by the usual sqrt(1-2M/r). Approximate by construction.
function limbEstimate(incDeg) {
  const inc = incDeg * Math.PI / 180;
  const bz = R_EMIT * Math.sin(inc) / Math.sqrt(1 - 2 / R_EMIT);
  return [redshiftFactor(R_EMIT, bz, R_OBS), redshiftFactor(R_EMIT, -bz, R_OBS)];
}

export function run() {
  const incs = [2, 15, 30, 45, 60, 75, 85, 89];
  const measured = [], estimated = [], rows = [];
  for (const i of incs) {
    const s = scan(i);
    const [eA, eR] = limbEstimate(i);
    const rM = Math.pow(s.gmax / s.gmin, 4), rE = Math.pow(eA / eR, 4);
    measured.push([i, rM]); estimated.push([i, rE]);
    rows.push([`${i}°`, s.gmax.toFixed(4), s.gmin.toFixed(4), rM.toFixed(2), rE.toFixed(2),
      `<span class="${Math.abs(rM / rE - 1) < 0.15 ? 'good' : 'warm'}">${((rM / rE - 1) * 100).toFixed(2)} %</span>`]);
  }

  plot(document.getElementById('p-doppler'), {
    xlim: [0, 90], ylim: [1, 200], logY: true, legend: true,
    xlabel: 'inclination  [degrees from face-on]', ylabel: 'brightness ratio, bright limb ÷ faint limb',
    series: [
      { data: measured, color: '#ff9a4d', points: true, width: 4.5, label: 'measured off the rendered annulus' },
      { data: estimated, color: '#63b8ff', dash: [5, 4], label: 'flat-space limb estimate' },
    ],
  });

  const faceOn = { gmax: 0, gmin: 0 };
  const worst = rows.reduce((a, r) => Math.max(a, Math.abs(parseFloat(r[5].replace(/<[^>]*>/g, '')))), 0);
  document.getElementById('doppler-tables').innerHTML = cards([
    { k: 'brightness ratio, edge-on', v: `${measured[measured.length - 1][1].toFixed(0)}×`, cls: 'warm', d: 'Measured on a 6M annulus seen from 60M. One limb of the same gas, eighty times the other.' },
    { k: 'orbital speed at 6M', v: `${(Math.sqrt(1 / R_EMIT) / Math.sqrt(1 - 2 / R_EMIT)).toFixed(4)} c`, cls: 'cool', d: 'Measured by a static observer sitting there. Half the speed of light.' },
    { k: 'face-on, 2°', v: `${measured[0][1].toFixed(2)}×`, d: 'Nearly nothing: with the orbit in the plane of the sky there is no line-of-sight velocity to beam.' },
    { k: 'gravitational part alone', v: `${Math.pow(Math.sqrt(1 - 3 / R_EMIT) / Math.sqrt(1 - 2 / R_OBS), 4).toFixed(3)}×`, d: `A factor of ${(1 / Math.pow(Math.sqrt(1 - 3 / R_EMIT) / Math.sqrt(1 - 2 / R_OBS), 4)).toFixed(1)} of dimming, identical on every side. It cannot make an image lopsided; only motion can.` },
  ]) +
  `<h3>Measured against the estimate everyone reaches for first</h3>
   <p class="tight">The blue curve is the back-of-envelope: take a photon leaving the limb to carry the axial angular momentum <code>r sin i</code> it would have in flat space, redshift-correct it, and turn the two Doppler factors into a <code>g⁴</code> ratio. This pane was built expecting that estimate to fall apart as the disk tips toward edge-on, where the lensing is violent. It does the opposite. Edge-on it is exact to ${Math.abs(parseFloat(rows[rows.length - 1][5].replace(/<[^>]*>/g, ''))).toFixed(2)} %, and provably so: at 90° the extremal photon leaves tangentially, its angular momentum lies along the disk axis, and <code>r sin i / √(1−2M/r)</code> is not an approximation but the exact supremum of <code>L_z/E</code>. The estimate is at its worst face-on, where it is ${Math.abs(parseFloat(rows[0][5].replace(/<[^>]*>/g, ''))).toFixed(1)} % low — not because of lensing but because it describes a single radius while the thing being measured is an annulus with width, and face-on there is no Doppler left for that width to hide behind.</p>
   <p class="tight">The drafted version of this page reported the opposite, and the difference was the measurement rather than the physics. On a fixed 96×60 grid the annulus at 89° catches 28 rays, the extremes land nowhere near the limbs, and the ratio reads 32 — half the value at 85°, a clean turnover that looks like a real effect and is an artefact of counting. What ships refines locally around each limb until the extremum stops moving; the turnover disappears and the curve rises all the way to edge-on.</p>` +
  table(['inclination', 'g, bright limb', 'g, faint limb', 'ratio measured', 'ratio estimated', 'estimate error'], rows);
}
