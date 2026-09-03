import * as THREE from '../vendor/three.module.js';
import { makeHold, HOLD_TYPES } from './holds.js';
import { stanceHips, shoulderAt, BUILD_REACH, GRAB_RANGE, DYNO_RANGE } from './body.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const _n = new THREE.Vector3();

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function fbm(x, y, seed, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const BANDS = [
  {
    key: 'slab',
    name: 'THE SLAB',
    note: 'low angle — stand on your feet',
    y0: 0,
    y1: 20,
    lean: -0.34,
    weights: { jug: 0.28, edge: 0.34, sloper: 0.13, pocket: 0.09, sidepull: 0.09, flake: 0.07 },
  },
  {
    key: 'face',
    name: 'VERTICAL FACE',
    note: 'crimps — keep your hips in',
    y0: 20,
    y1: 42,
    lean: -0.02,
    weights: { jug: 0.15, edge: 0.35, pocket: 0.18, sidepull: 0.14, sloper: 0.09, flake: 0.09 },
  },
  {
    key: 'roof',
    name: 'THE ROOF',
    note: 'feet cut loose — sequence it fast',
    y0: 42,
    y1: 58,
    lean: 0.36,
    weights: { jug: 0.22, undercling: 0.24, sidepull: 0.2, edge: 0.16, pocket: 0.11, flake: 0.07 },
  },
  {
    key: 'headwall',
    name: 'HEADWALL',
    note: 'slopers in the wind',
    y0: 58,
    y1: 78,
    lean: -0.06,
    weights: { sloper: 0.29, edge: 0.24, pocket: 0.16, jug: 0.15, sidepull: 0.1, flake: 0.06 },
  },
];

export const TOP_Y = 78;
const HALF_WIDTH = 17;
const CORRIDOR = 7.4;

export class Wall {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed * 7919 + 13);
    this.cracks = [];
    this.buildProfile();
    this.buildCracks();
    this.buildMesh();
    this.buildRoute();
  }

  // Lean is integrated once into a table so the surface stays C1 and cheap to sample.
  buildProfile() {
    const step = 0.25;
    const n = Math.ceil((TOP_Y + 12) / step) + 2;
    this.profileStep = step;
    this.profile = new Float32Array(n);
    let z = 0;
    for (let i = 0; i < n; i++) {
      const y = i * step - 6;
      this.profile[i] = z;
      z += this.leanAt(y) * step;
    }
  }

  leanAt(y) {
    let lean = BANDS[0].lean;
    for (let i = 1; i < BANDS.length; i++) {
      const b = BANDS[i];
      lean = THREE.MathUtils.lerp(lean, b.lean, smooth(THREE.MathUtils.clamp((y - (b.y0 - 3)) / 6, 0, 1)));
    }
    if (y > TOP_Y - 3) lean = THREE.MathUtils.lerp(lean, -1.5, smooth(THREE.MathUtils.clamp((y - (TOP_Y - 3)) / 3.5, 0, 1)));
    return lean;
  }

  profileZ(y) {
    const f = (y + 6) / this.profileStep;
    const i = THREE.MathUtils.clamp(Math.floor(f), 0, this.profile.length - 2);
    const t = THREE.MathUtils.clamp(f - i, 0, 1);
    return this.profile[i] * (1 - t) + this.profile[i + 1] * t;
  }

  buildCracks() {
    const r = this.rng;
    for (let i = 0; i < 2; i++) {
      const x0 = (i === 0 ? -1 : 1) * (2.2 + r() * 2.4);
      this.cracks.push({ x0, wander: 0.8 + r() * 1.2, phase: r() * 9, y0: 3, y1: TOP_Y - 6 });
    }
  }

  crackX(crack, y) {
    return crack.x0 + Math.sin(y * 0.035 + crack.phase) * crack.wander;
  }

  crackDepth(x, y) {
    let d = 0;
    for (const c of this.cracks) {
      if (y < c.y0 - 2 || y > c.y1 + 2) continue;
      const dx = x - this.crackX(c, y);
      const fade = THREE.MathUtils.smoothstep(y, c.y0 - 2, c.y0 + 1) * (1 - THREE.MathUtils.smoothstep(y, c.y1 - 1, c.y1 + 2));
      d += Math.exp(-(dx * dx) / 0.06) * 0.42 * fade;
    }
    return d;
  }

  // Rock surface depth: everything (geometry, normals, holds, feet) reads this.
  surfaceZ(x, y) {
    const s = this.seed;
    let z = this.profileZ(y);
    z += (fbm(x * 0.12, y * 0.1, s, 4) - 0.5) * 2.6;
    z += (fbm(x * 0.4, y * 0.34, s + 31, 3) - 0.5) * 1.25;
    z += (fbm(x * 1.25, y * 1.1, s + 77, 3) - 0.5) * 0.44;
    z += (fbm(x * 3.3, y * 3.0, s + 91, 2) - 0.5) * 0.14;
    // Sedimentary terracing: limestone breaks into overlapping horizontal ledges.
    const bed = y * 0.38 + fbm(x * 0.16, y * 0.09, s + 47, 2) * 3.4;
    z += (smooth(THREE.MathUtils.clamp((bed - Math.floor(bed)) * 1.6, 0, 1)) - 0.5) * 0.38;
    z -= this.crackDepth(x, y);
    // Flatten the summit so there is somewhere to top out onto.
    const top = THREE.MathUtils.smoothstep(y, TOP_Y - 3, TOP_Y + 1);
    z = THREE.MathUtils.lerp(z, this.profileZ(TOP_Y - 3) - 1.2, top);
    return z;
  }

  normalAt(x, y, out = new THREE.Vector3()) {
    const e = 0.06;
    const dzdx = (this.surfaceZ(x + e, y) - this.surfaceZ(x - e, y)) / (2 * e);
    const dzdy = (this.surfaceZ(x, y + e) - this.surfaceZ(x, y - e)) / (2 * e);
    return out.set(-dzdx, -dzdy, 1).normalize();
  }

  bandAt(y) {
    for (const b of BANDS) if (y < b.y1) return b;
    return BANDS[BANDS.length - 1];
  }

  buildMesh() {
    const nx = 150;
    const ny = 440;
    const y0 = -6;
    const y1 = TOP_Y + 6;
    const positions = new Float32Array((nx + 1) * (ny + 1) * 3);
    const colors = new Float32Array((nx + 1) * (ny + 1) * 3);
    const depth = new Float32Array((nx + 1) * (ny + 1));
    const indices = [];
    const c = new THREE.Color();
    let p = 0;
    for (let j = 0; j <= ny; j++) {
      const y = y0 + ((y1 - y0) * j) / ny;
      for (let i = 0; i <= nx; i++) {
        const x = -HALF_WIDTH + (2 * HALF_WIDTH * i) / nx;
        const z = this.surfaceZ(x, y);
        positions[p] = x;
        positions[p + 1] = y;
        positions[p + 2] = z;
        depth[j * (nx + 1) + i] = z;
        p += 3;
      }
    }

    // Cavity shading straight off the grid: a vertex sitting behind its
    // neighbourhood is in a hollow and gets darkened. Cheap, and it is what
    // makes the face read as rock instead of as a smooth brown sheet.
    const ambient = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const idx = j * (nx + 1) + i;
        let sum = 0;
        let n = 0;
        for (const r of [2, 5, 9]) {
          for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
            const xi = i + dx;
            const yj = j + dy;
            if (xi < 0 || xi > nx || yj < 0 || yj > ny) continue;
            sum += depth[yj * (nx + 1) + xi];
            n++;
          }
        }
        const rel = n ? sum / n - depth[idx] : 0;
        ambient[idx] = THREE.MathUtils.clamp(1 - rel * 0.85, 0.42, 1.1);
      }
    }

    p = 0;
    for (let j = 0; j <= ny; j++) {
      const y = y0 + ((y1 - y0) * j) / ny;
      for (let i = 0; i <= nx; i++) {
        const x = -HALF_WIDTH + (2 * HALF_WIDTH * i) / nx;
        const strata = 0.5 + 0.5 * Math.sin(y * 0.42 + fbm(x * 0.2, y * 0.2, this.seed + 5, 2) * 5);
        const grit = fbm(x * 2.6, y * 2.4, this.seed + 12, 2);
        const lichen = Math.max(0, fbm(x * 0.6, y * 0.55, this.seed + 63, 3) - 0.56) * 2.4;
        const shade = 0.26 + strata * 0.15 + grit * 0.22;
        const warm = THREE.MathUtils.clamp(0.4 + (y / TOP_Y) * 0.3, 0, 1);
        c.setRGB(shade * (0.98 + warm * 0.12), shade * (0.9 + warm * 0.06), shade * 0.78);
        c.lerp(new THREE.Color(0.09, 0.13, 0.07), Math.min(0.5, lichen));
        c.multiplyScalar(ambient[j * (nx + 1) + i]);
        const seam = this.crackDepth(x, y);
        if (seam > 0.05) c.multiplyScalar(1 - Math.min(0.62, seam * 1.3));
        colors[p] = c.r;
        colors[p + 1] = c.g;
        colors[p + 2] = c.b;
        p += 3;
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const d = a + nx + 1;
        const e = d + 1;
        indices.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    });
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;

    const backGeo = new THREE.BoxGeometry(2 * HALF_WIDTH, TOP_Y + 20, 14);
    const back = new THREE.Mesh(
      backGeo,
      new THREE.MeshStandardMaterial({ color: 0x4a463f, roughness: 1 })
    );
    back.position.set(0, (TOP_Y + 20) / 2 - 8, this.profileZ(TOP_Y * 0.5) - 9);
    this.backing = back;
  }

  holdPosition(x, y, type, out = new THREE.Vector3()) {
    const normal = this.normalAt(x, y, _n);
    return out.set(x, y, this.surfaceZ(x, y)).addScaledVector(normal, HOLD_TYPES[type].size * 0.2);
  }

  pickType(band, rng, opts = {}) {
    if (opts.easy) return rng() < 0.55 ? 'jug' : 'edge';
    let r = rng();
    for (const [k, w] of Object.entries(band.weights)) {
      r -= w;
      if (r <= 0) return opts.noFlake && k === 'flake' ? 'edge' : k;
    }
    return 'edge';
  }

  addHold(x, y, type, band, side = 1) {
    const normal = this.normalAt(x, y);
    const lateral = new THREE.Vector3(side, 0, 0)
      .addScaledVector(normal, -normal.x * side * 0.4)
      .normalize();
    const pos = this.holdPosition(x, y, type);
    const h = makeHold(this.holds.length, pos, normal, lateral, type, band.key);
    h.gx = x;
    h.gy = y;
    this.holds.push(h);
    return h;
  }

  near(x, y, radius) {
    for (const h of this.holds) {
      const dx = h.gx - x;
      const dy = h.gy - y;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
    return false;
  }

  // Grows a line upward by standing on the last two holds and only ever placing
  // the next one where that stance can actually reach it. The line is therefore
  // climbable by construction — no post-hoc validation pass needed.
  growLine(rng, a, b, opts = {}) {
    const line = [a, b];
    const hips = new THREE.Vector3();
    const sh = new THREE.Vector3();
    const cand = new THREE.Vector3();
    let drift = (a.gx + b.gx) * 0.5;
    let sinceRest = 0;
    let guard = 0;

    while (guard++ < 700) {
      const A = line[line.length - 2];
      const B = line[line.length - 1];
      stanceHips(this, A.position, B.position, hips);
      if (hips.y > TOP_Y - 1.9) break;

      const mover = A.position.y <= B.position.y ? A : B;
      const sign = mover.gx >= hips.x ? 1 : -1;
      shoulderAt(hips, sign, sh);

      drift = THREE.MathUtils.clamp(drift + (rng() - 0.5) * 0.55, -CORRIDOR, CORRIDOR);
      const band = this.bandAt(hips.y + 0.6);
      const reachy = rng() < 0.16;

      let type = null;
      sinceRest += 0.4;
      if (sinceRest > 6.5 + rng() * 4.5) type = 'jug';
      else if (opts.easy && rng() < 0.25) type = this.pickType(band, rng, { easy: true });
      else type = this.pickType(band, rng, { noFlake: opts.primary });

      // Rejection-sample the reach sphere: the rock is rough enough that a fixed
      // step often lands out of reach, so try spread-out candidates and keep the
      // highest one that a real stance could actually hold.
      let placed = null;
      const wantY = sh.y + (reachy ? 0.66 : 0.5);
      for (let att = 0; att < 34; att++) {
        const spread = 0.2 + (att / 34) * 0.9;
        const dy = THREE.MathUtils.clamp(
          (reachy ? 0.62 : 0.48) + (rng() - 0.45) * spread * 1.15,
          0.2,
          0.78
        );
        const toward = (drift - sh.x) * 0.4 + sign * (0.05 + rng() * 0.22);
        const x = THREE.MathUtils.clamp(
          sh.x + toward + (rng() - 0.5) * spread,
          -CORRIDOR - 0.4,
          CORRIDOR + 0.4
        );
        const y = sh.y + dy;
        this.holdPosition(x, y, type, cand);
        if (cand.distanceTo(sh) > BUILD_REACH) continue;
        if (this.near(x, y, 0.26)) continue;
        if (!placed || Math.abs(y - wantY) < Math.abs(placed.y - wantY)) placed = { x, y };
        if (att > 12 && placed) break;
      }

      // Deterministic sweep of the reach sphere when the random samples all miss,
      // so a rough patch of rock cannot dead-end the line.
      if (!placed) {
        const bias = THREE.MathUtils.clamp((drift - sh.x) * 0.4, -0.35, 0.35);
        for (let dy = 0.74; dy >= 0.16 && !placed; dy -= 0.055) {
          for (let k = 0; k < 17 && !placed; k++) {
            const step = Math.ceil(k / 2) * 0.085 * (k % 2 ? 1 : -1);
            const x = THREE.MathUtils.clamp(sh.x + bias + step, -CORRIDOR - 0.4, CORRIDOR + 0.4);
            const y = sh.y + dy;
            this.holdPosition(x, y, type, cand);
            if (cand.distanceTo(sh) > BUILD_REACH) continue;
            if (this.near(x, y, 0.24)) continue;
            placed = { x, y };
          }
        }
      }
      // Nothing within reach at all: the line goes on as a jump. A generated
      // crux, rather than a dead end.
      let isDyno = false;
      if (!placed) {
        for (let dy = 1.25; dy >= 0.5 && !placed; dy -= 0.07) {
          for (let k = 0; k < 21 && !placed; k++) {
            const step = Math.ceil(k / 2) * 0.11 * (k % 2 ? 1 : -1);
            const x = THREE.MathUtils.clamp(sh.x + step, -CORRIDOR - 0.4, CORRIDOR + 0.4);
            const y = sh.y + dy;
            this.holdPosition(x, y, type, cand);
            const d = cand.distanceTo(sh);
            if (d > DYNO_RANGE - 0.25 || d < GRAB_RANGE + 0.02) continue;
            if (this.near(x, y, 0.24)) continue;
            placed = { x, y };
            isDyno = true;
          }
        }
        if (placed) type = 'jug';
      }
      if (!placed) break;

      const hold = this.addHold(placed.x, placed.y, type, band, sign);
      hold.dynoEntry = isDyno;
      line.push(hold);
      if (type === 'jug') {
        sinceRest = 0;
        this.restLedges.push(hold.position.clone());
      }

      // A foothold under the new stance — the roof is impossible without them.
      if (rng() < (band.key === 'roof' ? 0.75 : 0.4)) {
        const fy = placed.y - (0.95 + rng() * 0.45);
        const fx = THREE.MathUtils.clamp(placed.x - sign * (0.35 + rng() * 0.45), -CORRIDOR - 0.4, CORRIDOR + 0.4);
        if (fy > 0.3 && !this.near(fx, fy, 0.3)) {
          this.addHold(fx, fy, rng() < 0.55 ? 'jug' : 'edge', band, -sign);
        }
      }
    }
    return line;
  }

  buildRoute() {
    const rng = mulberry32(this.seed * 104729 + 7);
    this.holds = [];
    this.camSpots = [];
    this.restLedges = [];
    this.lines = [];

    this.startLeft = this.addHold(-0.26, 1.7, 'jug', BANDS[0], -1);
    this.startRight = this.addHold(0.28, 1.84, 'jug', BANDS[0], 1);
    this.addHold(-0.3, 0.5, 'jug', BANDS[0], -1);
    this.addHold(0.32, 0.56, 'jug', BANDS[0], 1);

    this.lines.push(this.growLine(rng, this.startLeft, this.startRight, { primary: true, easy: true }));

    // Alternate lines: same guarantee, different rock, so the wall offers choices
    // instead of a single marked ladder.
    for (let i = 0; i < 2; i++) {
      const x0 = (i === 0 ? -1 : 1) * (2.4 + rng() * 3.2);
      const y0 = 2.5 + rng() * 5;
      const a = this.addHold(x0 - 0.3, y0, 'jug', this.bandAt(y0), -1);
      const b = this.addHold(x0 + 0.32, y0 + 0.18, 'edge', this.bandAt(y0), 1);
      this.lines.push(this.growLine(rng, a, b, {}));
    }

    for (const band of BANDS) {
      const area = (2 * CORRIDOR + 3) * (band.y1 - band.y0);
      const extra = Math.floor(area * 0.13);
      for (let i = 0; i < extra; i++) {
        const x = -CORRIDOR - 1.5 + rng() * (2 * CORRIDOR + 3);
        const y = band.y0 + rng() * (band.y1 - band.y0);
        if (this.near(x, y, 0.46)) continue;
        this.addHold(x, y, this.pickType(band, rng), band, rng() < 0.5 ? 1 : -1);
      }
    }

    const top = this.lines[0][this.lines[0].length - 1];
    this.summitHold = this.addHold(
      THREE.MathUtils.clamp(top.gx, -2, 2),
      TOP_Y - 0.8,
      'jug',
      BANDS[BANDS.length - 1],
      1
    );
    this.summitHold.isSummit = true;

    for (const c of this.cracks) {
      for (let y = c.y0 + 2; y < c.y1; y += 6.5) {
        const x = this.crackX(c, y);
        this.camSpots.push({
          position: new THREE.Vector3(x, y, this.surfaceZ(x, y) + 0.1),
          used: false,
        });
      }
    }
  }

  holdsNear(point, radius, out = []) {
    out.length = 0;
    const r2 = radius * radius;
    for (const h of this.holds) {
      if (h.broken) continue;
      if (h.position.distanceToSquared(point) < r2) out.push(h);
    }
    return out;
  }
}
