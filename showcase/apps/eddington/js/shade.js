import { traceRay, redshiftFactor, diskFlux } from './physics.js';
import { sampleSky, blackbodyRGB } from './sky.js';


// Camera frame for a static observer hovering at r0. Its three axes are the
// observer's own orthonormal tetrad, so a pixel direction is a genuine local
// viewing angle and the impact parameter picked up in traceRay is the conserved
// L/E rather than a flat-space cross product.
export function camera(r0, incDeg) {
  const inc = incDeg * Math.PI / 180;
  const P = [Math.sin(inc) * r0, 0, Math.cos(inc) * r0];
  const e1 = [P[0] / r0, P[1] / r0, P[2] / r0];
  const fwd = [-e1[0], -e1[1], -e1[2]];
  const ref = Math.abs(fwd[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
  let right = [fwd[1] * ref[2] - fwd[2] * ref[1], fwd[2] * ref[0] - fwd[0] * ref[2], fwd[0] * ref[1] - fwd[1] * ref[0]];
  const rn = Math.hypot(...right); right = right.map((v) => v / rn);
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  return { e1, fwd, right, up };
}

export function shade(p, cam, px, py, sky) {
  const { e1, fwd, right, up } = cam;
  const t = Math.tan(p.fov * Math.PI / 360);
  const sx = px * t * (p.W / p.H), sy = py * t;
  let d = [fwd[0] + sx * right[0] + sy * up[0],
           fwd[1] + sx * right[1] + sy * up[1],
           fwd[2] + sx * right[2] + sy * up[2]];
  const dn = Math.hypot(...d); d = [d[0] / dn, d[1] / dn, d[2] / dn];

  const cosPsi = d[0] * e1[0] + d[1] * e1[1] + d[2] * e1[2];
  let perp = [d[0] - cosPsi * e1[0], d[1] - cosPsi * e1[1], d[2] - cosPsi * e1[2]];
  const sinPsi = Math.hypot(...perp);
  if (sinPsi < 1e-12) return [0, 0, 0];
  const e2 = [perp[0] / sinPsi, perp[1] / sinPsi, perp[2] / sinPsi];
  const nz = e1[0] * e2[1] - e1[1] * e2[0];          // z-component of e1 x e2

  const res = traceRay(p.r0, cosPsi, sinPsi, e1[2], e2[2], {
    rIn: p.rIn, rOut: p.rOut, disk: p.diskOn, hBase: p.hBase, rEsc: 600, maxSteps: p.maxSteps,
  });

  if (res.kind === 'capture') return [0, 0, 0];

  if (res.kind === 'disk') {
    const r = res.r;
    // The physical photon runs opposite to the traced ray, so its axial angular
    // momentum flips sign. Getting this backwards puts the bright limb on the
    // wrong side, which is why the bench checks it against a Doppler factor
    // derived from special relativity alone.
    const bz = -res.b * nz;
    let g;
    if (p.shading === 'flat') g = 1;
    else if (p.shading === 'nobeam') g = Math.sqrt(1 - 3 / r) / Math.sqrt(1 - 2 / p.r0);
    else g = redshiftFactor(r, bz, p.r0);
    const F = diskFlux(r, p.rIn) / p.Fmax;
    const T = p.T0 * Math.pow(Math.max(1e-6, F), 0.25) * (p.shading === 'flat' ? 1 : g);
    const [cr, cg, cb] = blackbodyRGB(T);
    const I = Math.pow(g, 4) * F * p.diskGain;
    return [I * cr, I * cg, I * cb];
  }

  const phi = res.phiInf;
  const c = Math.cos(phi), s = Math.sin(phi);
  const dir = [c * e1[0] + s * e2[0], c * e1[1] + s * e2[1], c * e1[2] + s * e2[2]];
  const col = sampleSky(sky, dir[0], dir[1], dir[2]);
  return [col[0] * p.skyGain, col[1] * p.skyGain, col[2] * p.skyGain];
}

