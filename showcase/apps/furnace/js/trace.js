// A Monte Carlo path tracer.
//
// Runs unchanged in the page, in the workers that draw it, and under Node for
// the bench — one implementation, so a number measured in a test is a number
// the picture was made of.
//
// The inner loop allocates nothing. Vectors are three loose numbers carried in
// locals rather than objects, which is ugly to read and about four times
// faster, and this is the one file in the project where that trade is worth
// making.

// ── random ──────────────────────────────────────────────────────────────────
// PCG32. Seeded per pixel and per sample so a render is reproducible: the
// bench needs to compare two images and know the difference is the change it
// made rather than the dice.
export function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  let inc = 2891336453;
  return function next() {
    const old = state >>> 0;
    state = (Math.imul(old, 747796405) + inc) >>> 0;
    const word = Math.imul((old >>> ((old >>> 28) + 4)) ^ old, 277803737) >>> 0;
    return (((word >>> 22) ^ word) >>> 0) / 4294967296;
  };
}

// ── materials ───────────────────────────────────────────────────────────────
export const LAMBERT = 0, METAL = 1, DIELECTRIC = 2, EMISSIVE = 3, GGX = 4;

// ── scene representation ────────────────────────────────────────────────────
// Spheres only, plus an optional ground plane. Analytic intersection, no
// acceleration structure: the scenes here are small enough that a BVH would be
// more code than it saved, and the point of the project is the light transport.
export function sphere(x, y, z, r, mat) { return { x, y, z, r, mat }; }

export function material(type, r, g, b, opts = {}) {
  return {
    type, r, g, b,
    roughness: opts.roughness ?? 0,
    ior: opts.ior ?? 1.5,
    emit: opts.emit ?? 0,
    multiScatter: opts.multiScatter ?? false,
  };
}

// ── intersection ────────────────────────────────────────────────────────────
const EPS = 1e-4;

/** Nearest hit along the ray, or -1. Fills `hit` with t, normal and material. */
function intersect(scene, ox, oy, oz, dx, dy, dz, hit) {
  let best = Infinity, bestObj = null;

  for (let i = 0; i < scene.spheres.length; i++) {
    const s = scene.spheres[i];
    const cx = ox - s.x, cy = oy - s.y, cz = oz - s.z;
    // |o + td - c|^2 = r^2, with d normalised so a = 1.
    const b = cx * dx + cy * dy + cz * dz;
    const c = cx * cx + cy * cy + cz * cz - s.r * s.r;
    const disc = b * b - c;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    let t = -b - sq;
    if (t < EPS) t = -b + sq;
    if (t < EPS || t >= best) continue;
    best = t; bestObj = s;
  }

  if (scene.plane) {
    // y = plane.y, single-sided from above.
    const t = (scene.plane.y - oy) / dy;
    if (t > EPS && t < best) {
      best = t; bestObj = scene.plane;
    }
  }

  if (!bestObj) return false;

  hit.t = best;
  const px = ox + dx * best, py = oy + dy * best, pz = oz + dz * best;
  hit.px = px; hit.py = py; hit.pz = pz;

  if (bestObj === scene.plane) {
    hit.nx = 0; hit.ny = 1; hit.nz = 0;
    hit.mat = scene.plane.matAt ? scene.plane.matAt(px, pz) : scene.plane.mat;
  } else {
    const inv = 1 / bestObj.r;
    hit.nx = (px - bestObj.x) * inv;
    hit.ny = (py - bestObj.y) * inv;
    hit.nz = (pz - bestObj.z) * inv;
    hit.mat = bestObj.mat;
  }
  return true;
}

// ── sampling ────────────────────────────────────────────────────────────────
/**
 * Cosine-weighted hemisphere sample about (nx,ny,nz).
 *
 * Cosine weighting is not an optimisation detail here, it is why the Lambertian
 * throughput update is a single multiply by albedo: the cosine in the rendering
 * equation and the pdf cancel exactly, leaving albedo. Get the pdf wrong and
 * the furnace test catches it immediately.
 */
function cosineHemisphere(nx, ny, nz, rng, out, broken) {
  const r1 = rng(), r2 = rng();
  const r = Math.sqrt(r1);
  const phi = 2 * Math.PI * r2;
  const x = r * Math.cos(phi), y = r * Math.sin(phi), z = Math.sqrt(1 - r1);

  // Duff et al.'s branchless orthonormal basis, in its canonical form. The
  // special axis is z and the permutation is not free: writing the same
  // expressions around y instead produces vectors that are not orthogonal to
  // the normal at all, so "hemisphere" samples point into the surface. That
  // renders as a picture which looks entirely reasonable and is wrong, and it
  // is what the furnace test is for.
  let sign, a, b, t1x, t1y, t1z, t2x, t2y, t2z;
  if (broken) {
    // The bug this project shipped first, kept as a switch. The same
    // expressions permuted around y instead of z: the vectors are no longer
    // orthogonal to the normal, so some samples point into the surface. It
    // renders a picture that looks entirely reasonable, and the furnace turns
    // it from a matter of taste into a number.
    sign = ny >= 0 ? 1 : -1;
    a = -1 / (sign + ny);
    b = nx * nz * a;
    t1x = 1 + sign * nx * nx * a; t1y = sign * b; t1z = -sign * nx;
    t2x = b; t2y = sign + nz * nz * a; t2z = -nz;
  } else {
    sign = nz >= 0 ? 1 : -1;
    a = -1 / (sign + nz);
    b = nx * ny * a;
    t1x = 1 + sign * nx * nx * a; t1y = sign * b; t1z = -sign * nx;
    t2x = b; t2y = sign + ny * ny * a; t2z = -ny;
  }

  out[0] = t1x * x + t2x * y + nx * z;
  out[1] = t1y * x + t2y * y + ny * z;
  out[2] = t1z * x + t2z * y + nz * z;
}

/** GGX / Trowbridge-Reitz normal, sampled about the normal. */
function ggxNormal(nx, ny, nz, alpha, rng, out) {
  const r1 = rng(), r2 = rng();
  const theta = Math.atan(alpha * Math.sqrt(r1) / Math.sqrt(1 - r1));
  const phi = 2 * Math.PI * r2;
  const st = Math.sin(theta);
  const x = st * Math.cos(phi), y = st * Math.sin(phi), z = Math.cos(theta);

  const sign = nz >= 0 ? 1 : -1;
  const a = -1 / (sign + nz);
  const b = nx * ny * a;
  const t1x = 1 + sign * nx * nx * a, t1y = sign * b, t1z = -sign * nx;
  const t2x = b, t2y = sign + ny * ny * a, t2z = -ny;

  out[0] = t1x * x + t2x * y + nx * z;
  out[1] = t1y * x + t2y * y + ny * z;
  out[2] = t1z * x + t2z * y + nz * z;
}

/** Smith height-correlated masking-shadowing for GGX. */
function smithG1(cosT, alpha) {
  if (cosT <= 0) return 0;
  const a2 = alpha * alpha;
  const c2 = cosT * cosT;
  return 2 * cosT / (cosT + Math.sqrt(a2 + (1 - a2) * c2));
}

function schlick(cos, ior) {
  let r0 = (1 - ior) / (1 + ior);
  r0 = r0 * r0;
  return r0 + (1 - r0) * Math.pow(1 - cos, 5);
}

// ── the integrator ──────────────────────────────────────────────────────────
const hit = { t: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, mat: null };
const dir = [0, 0, 0];
const half = [0, 0, 0];

/**
 * Radiance along one ray. Returns into `out` as three floats.
 *
 * @param {object} scene
 * @param {number[]} out   [r,g,b] accumulator
 * @param {object} opts    { maxDepth, russianRoulette, cosineSampling }
 */
export function radiance(scene, ox, oy, oz, dx, dy, dz, rng, out, opts) {
  const maxDepth = opts.maxDepth ?? 32;
  const useRR = opts.russianRoulette !== false;
  const useCosine = opts.cosineSampling !== false;
  const broken = opts.brokenBasis === true;

  let tr = 1, tg = 1, tb = 1;     // throughput
  let lr = 0, lg = 0, lb = 0;     // radiance

  for (let depth = 0; depth < maxDepth; depth++) {
    if (!intersect(scene, ox, oy, oz, dx, dy, dz, hit)) {
      // Escaped: pick up the environment. In the furnace this is the whole
      // answer, which is exactly why the test is sharp.
      const e = scene.env(dx, dy, dz);
      lr += tr * e[0]; lg += tg * e[1]; lb += tb * e[2];
      break;
    }

    const m = hit.mat;
    // The geometric normal is kept unflipped: the ray is nudged off the
    // surface along it rather than along the outgoing direction. Offsetting
    // along the direction fails at grazing angles, where the nudge barely
    // leaves the surface and the ray immediately re-hits the object it just
    // left. Those phantom bounces are invisible in a picture and very visible
    // in a furnace, where a sphere that should be exactly flat acquires noise.
    const gnx = hit.nx, gny = hit.ny, gnz = hit.nz;
    let nx = hit.nx, ny = hit.ny, nz = hit.nz;

    if (m.type === EMISSIVE) {
      lr += tr * m.r * m.emit; lg += tg * m.g * m.emit; lb += tb * m.b * m.emit;
      break;
    }

    const front = (dx * nx + dy * ny + dz * nz) < 0;

    if (m.type === LAMBERT) {
      if (!front) { nx = -nx; ny = -ny; nz = -nz; }
      if (useCosine) {
        cosineHemisphere(nx, ny, nz, rng, dir, broken);
        // pdf = cos/pi, brdf = albedo/pi, weight = brdf*cos/pdf = albedo.
        tr *= m.r; tg *= m.g; tb *= m.b;
      } else {
        // Uniform hemisphere, kept so the bench can measure what importance
        // sampling is actually worth. Same expected value, more variance.
        let ux, uy, uz, d2;
        do {
          ux = rng() * 2 - 1; uy = rng() * 2 - 1; uz = rng() * 2 - 1;
          d2 = ux * ux + uy * uy + uz * uz;
        } while (d2 > 1 || d2 < 1e-8);
        const inv = 1 / Math.sqrt(d2);
        ux *= inv; uy *= inv; uz *= inv;
        if (ux * nx + uy * ny + uz * nz < 0) { ux = -ux; uy = -uy; uz = -uz; }
        dir[0] = ux; dir[1] = uy; dir[2] = uz;
        const cos = ux * nx + uy * ny + uz * nz;
        // pdf = 1/(2pi), weight = albedo/pi * cos / pdf = 2*albedo*cos.
        tr *= 2 * m.r * cos; tg *= 2 * m.g * cos; tb *= 2 * m.b * cos;
      }
    } else if (m.type === METAL) {
      if (!front) { nx = -nx; ny = -ny; nz = -nz; }
      const d = dx * nx + dy * ny + dz * nz;
      dir[0] = dx - 2 * d * nx; dir[1] = dy - 2 * d * ny; dir[2] = dz - 2 * d * nz;
      if (m.roughness > 0) {
        cosineHemisphere(nx, ny, nz, rng, half, broken);
        dir[0] += half[0] * m.roughness;
        dir[1] += half[1] * m.roughness;
        dir[2] += half[2] * m.roughness;
        const inv = 1 / Math.hypot(dir[0], dir[1], dir[2]);
        dir[0] *= inv; dir[1] *= inv; dir[2] *= inv;
      }
      if (dir[0] * nx + dir[1] * ny + dir[2] * nz <= 0) break;
      tr *= m.r; tg *= m.g; tb *= m.b;
    } else if (m.type === GGX) {
      if (!front) { nx = -nx; ny = -ny; nz = -nz; }
      const alpha = Math.max(m.roughness * m.roughness, 1e-4);
      ggxNormal(nx, ny, nz, alpha, rng, half);
      const d = dx * half[0] + dy * half[1] + dz * half[2];
      dir[0] = dx - 2 * d * half[0];
      dir[1] = dy - 2 * d * half[1];
      dir[2] = dz - 2 * d * half[2];
      const cosO = dir[0] * nx + dir[1] * ny + dir[2] * nz;
      const cosI = -(dx * nx + dy * ny + dz * nz);
      if (cosO <= 0 || cosI <= 0) break;

      // Sampling the half-vector from the GGX NDF makes the weight reduce to
      // the Smith masking term alone. That term is where single-scatter GGX
      // loses energy: light blocked by a microfacet is never re-scattered, so
      // it is simply dropped -- which is visible, and measurable, in a furnace.
      let weight = smithG1(cosO, alpha);
      if (m.multiScatter) {
        // Kulla-Conty style compensation: add back what single scattering lost,
        // using the directional albedo of the lobe.
        const Eo = ggxDirectionalAlbedo(cosO, alpha);
        const Ei = ggxDirectionalAlbedo(cosI, alpha);
        const Eavg = ggxAverageAlbedo(alpha);
        const denom = 1 - Eavg;
        if (denom > 1e-6) weight += (1 - Eo) * (1 - Ei) / (Math.PI * denom) * Math.PI;
      }
      tr *= m.r * weight; tg *= m.g * weight; tb *= m.b * weight;
    } else if (m.type === DIELECTRIC) {
      const ni = front ? 1 / m.ior : m.ior;
      if (!front) { nx = -nx; ny = -ny; nz = -nz; }
      const cosI = Math.min(-(dx * nx + dy * ny + dz * nz), 1);
      const sin2T = ni * ni * (1 - cosI * cosI);
      if (sin2T > 1 || rng() < schlick(cosI, front ? m.ior : 1 / m.ior)) {
        const d = dx * nx + dy * ny + dz * nz;
        dir[0] = dx - 2 * d * nx; dir[1] = dy - 2 * d * ny; dir[2] = dz - 2 * d * nz;
      } else {
        const cosT = Math.sqrt(1 - sin2T);
        dir[0] = ni * dx + (ni * cosI - cosT) * nx;
        dir[1] = ni * dy + (ni * cosI - cosT) * ny;
        dir[2] = ni * dz + (ni * cosI - cosT) * nz;
      }
      tr *= m.r; tg *= m.g; tb *= m.b;
    }

    const side = (dir[0] * gnx + dir[1] * gny + dir[2] * gnz) >= 0 ? EPS : -EPS;
    ox = hit.px + gnx * side; oy = hit.py + gny * side; oz = hit.pz + gnz * side;
    dx = dir[0]; dy = dir[1]; dz = dir[2];

    // Russian roulette. Killing a path with probability q and dividing the
    // survivors by (1-q) leaves the expected value untouched -- which the bench
    // checks rather than assumes, because an unbiased-looking speedup that is
    // quietly biased is the easiest way to ship a wrong renderer.
    if (useRR && depth >= 3) {
      const p = Math.min(Math.max(tr, tg, tb), 0.95);
      if (rng() >= p) break;
      const inv = 1 / p;
      tr *= inv; tg *= inv; tb *= inv;
    }
  }

  out[0] = lr; out[1] = lg; out[2] = lb;
}

// ── GGX directional albedo, by numerical integration ────────────────────────
// Tabulated once at module load. This is what the multiple-scattering term
// needs, and computing it rather than fitting a polynomial to it keeps the
// furnace test honest: if the table is wrong, the furnace says so.
const ALB_N = 32;
const albedoTable = new Float64Array(ALB_N * ALB_N);
const avgAlbedoTable = new Float64Array(ALB_N);
let tablesReady = false;

function buildTables() {
  const rng = makeRng(12345);
  const h = [0, 0, 0];
  for (let ai = 0; ai < ALB_N; ai++) {
    const alpha = Math.max(((ai + 0.5) / ALB_N) ** 2, 1e-4);
    let avg = 0;
    for (let ci = 0; ci < ALB_N; ci++) {
      const cosO = (ci + 0.5) / ALB_N;
      const sinO = Math.sqrt(1 - cosO * cosO);
      let sum = 0;
      const N = 512;
      for (let s = 0; s < N; s++) {
        ggxNormal(0, 0, 1, alpha, rng, h);
        const vx = sinO, vz = cosO;
        const d = vx * h[0] + vz * h[2];
        const lx = -vx + 2 * d * h[0], ly = 2 * d * h[1], lz = -vz + 2 * d * h[2];
        if (lz <= 0) continue;
        sum += smithG1(lz, alpha);
      }
      const E = sum / N;
      albedoTable[ai * ALB_N + ci] = E;
      avg += E * cosO * 2 / ALB_N;
    }
    avgAlbedoTable[ai] = avg;
  }
  tablesReady = true;
}

function alphaIndex(alpha) {
  const i = Math.floor(Math.sqrt(Math.max(alpha, 0)) * ALB_N);
  return Math.min(Math.max(i, 0), ALB_N - 1);
}

export function ggxDirectionalAlbedo(cosO, alpha) {
  if (!tablesReady) buildTables();
  const ai = alphaIndex(alpha);
  const ci = Math.min(Math.max(Math.floor(cosO * ALB_N), 0), ALB_N - 1);
  return albedoTable[ai * ALB_N + ci];
}

export function ggxAverageAlbedo(alpha) {
  if (!tablesReady) buildTables();
  return avgAlbedoTable[alphaIndex(alpha)];
}

// ── camera and the render loop ──────────────────────────────────────────────
export function makeCamera(opts) {
  const { from, at, up = [0, 1, 0], fov = 40, aperture = 0, focus = null } = opts;
  const fx = from[0] - at[0], fy = from[1] - at[1], fz = from[2] - at[2];
  const flen = Math.hypot(fx, fy, fz);
  const wx = fx / flen, wy = fy / flen, wz = fz / flen;
  let ux = up[1] * wz - up[2] * wy, uy = up[2] * wx - up[0] * wz, uz = up[0] * wy - up[1] * wx;
  const ulen = Math.hypot(ux, uy, uz);
  ux /= ulen; uy /= ulen; uz /= ulen;
  const vx = wy * uz - wz * uy, vy = wz * ux - wx * uz, vz = wx * uy - wy * ux;
  return {
    from, wx, wy, wz, ux, uy, uz, vx, vy, vz,
    halfH: Math.tan((fov * Math.PI / 180) / 2),
    aperture, focus: focus ?? flen,
  };
}

/**
 * Accumulate `samples` samples per pixel into `acc` (Float32Array, rgb).
 * Called repeatedly with an increasing `sampleIndex` so the image refines.
 */
export function renderTile(scene, cam, acc, width, height, y0, y1, sampleIndex, opts = {}, rowOffset = 0) {
  const aspect = width / height;
  const out = [0, 0, 0];
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      // Seeding on pixel and sample index makes the whole image reproducible
      // and keeps neighbouring pixels from sharing a sequence.
      const rng = makeRng((y * 73856093) ^ (x * 19349663) ^ ((sampleIndex + 1) * 83492791));
      const sx = (x + rng()) / width * 2 - 1;
      const sy = 1 - (y + rng()) / height * 2;
      const hx = sx * aspect * cam.halfH, hy = sy * cam.halfH;

      let dx = hx * cam.ux + hy * cam.vx - cam.wx;
      let dy = hx * cam.uy + hy * cam.vy - cam.wy;
      let dz = hx * cam.uz + hy * cam.vz - cam.wz;
      let ox = cam.from[0], oy = cam.from[1], oz = cam.from[2];

      if (cam.aperture > 0) {
        // Sample the lens, then aim at the point the pinhole ray would reach on
        // the focal plane. Depth of field falls out of that and nothing else.
        const inv = 1 / Math.hypot(dx, dy, dz);
        const ndx = dx * inv, ndy = dy * inv, ndz = dz * inv;
        const cosA = -(ndx * cam.wx + ndy * cam.wy + ndz * cam.wz);
        const t = cam.focus / Math.max(cosA, 1e-6);
        const fxp = ox + ndx * t, fyp = oy + ndy * t, fzp = oz + ndz * t;
        let lx, ly, d2;
        do { lx = rng() * 2 - 1; ly = rng() * 2 - 1; d2 = lx * lx + ly * ly; } while (d2 > 1);
        const r = cam.aperture / 2;
        ox += (lx * cam.ux + ly * cam.vx) * r;
        oy += (lx * cam.uy + ly * cam.vy) * r;
        oz += (lx * cam.uz + ly * cam.vz) * r;
        dx = fxp - ox; dy = fyp - oy; dz = fzp - oz;
      }

      const inv = 1 / Math.hypot(dx, dy, dz);
      radiance(scene, ox, oy, oz, dx * inv, dy * inv, dz * inv, rng, out, opts);

      // rowOffset lets a worker own only its band of rows while the camera
      // still sees the full frame, which is the whole reason the bands can be
      // rendered independently and composited at the end.
      const i = ((y - rowOffset) * width + x) * 3;
      acc[i] += out[0]; acc[i + 1] += out[1]; acc[i + 2] += out[2];
    }
  }
}
