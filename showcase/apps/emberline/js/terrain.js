import * as THREE from 'three';
import { WORLD, N, HN, CELL, MODEL, FUELS } from './config.js';

export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise on a lattice, smoothed — cheap and good enough for terrain.
function makeNoise(rand) {
  const S = 256;
  const g = new Float32Array(S * S);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (x, y) => g[(y & 255) * S + (x & 255)];
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

function fbm(noise, x, y, oct, gain = 0.5) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * noise(x * f, y * f);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return s / norm;
}

const COLORS = {
  [MODEL.ROCK]: [0.42, 0.39, 0.35],
  [MODEL.GRASS]: [0.62, 0.57, 0.30],
  [MODEL.BRUSH]: [0.34, 0.40, 0.21],
  [MODEL.TIMBER]: [0.15, 0.26, 0.15],
  [MODEL.WATER]: [0.07, 0.16, 0.24],
};
const BURNT = [0.09, 0.08, 0.075];
const SLURRY = [0.78, 0.26, 0.13];
const EMBER = [0.85, 0.32, 0.06];

export class Terrain {
  constructor(mission) {
    this.mission = mission;
    const rand = mulberry(mission.seed);
    const noise = makeNoise(rand);

    this.height = new Float32Array(HN * HN);
    this.model = new Uint8Array(N * N);
    this.fuel = new Float32Array(N * N);
    this.moist = new Float32Array(N * N);
    this.cellH = new Float32Array(N * N);

    this.waterLevel = 0;
    this.lake = mission.lake;
    // Water only exists near the lake; depressions elsewhere stay dry ground.
    this.lakeLimit = mission.lake.r * 2.6;

    this.#buildHeight(noise, mission);
    this.#buildFuel(noise, mission, rand);
    this.#buildMesh();
    this.#buildTexture();
    this.#buildTrees(rand);
    this.#buildWater();
  }

  #buildHeight(noise, m) {
    const relief = m.relief;
    for (let j = 0; j < HN; j++) {
      for (let i = 0; i < HN; i++) {
        const x = (i / N) * WORLD - WORLD / 2;
        const z = (j / N) * WORLD - WORLD / 2;
        const nx = i / N, nz = j / N;

        let h = fbm(noise, nx * 4.5, nz * 4.5, 5) * relief;
        // A ridge running roughly NW–SE, strength set per mission.
        const ridge = 1 - Math.abs((nx * 0.7 + nz * 0.3) - 0.42) * 3.4;
        h += Math.max(0, ridge) * relief * m.ridge * 1.6;
        h += fbm(noise, nx * 13 + 40, nz * 13 + 40, 3) * relief * 0.18;
        this.height[j * HN + i] = h;
      }
    }

    // Flatten a bed for the lake so it is a real scooping run rather than a
    // puddle: everything inside the radius sits on one floor, and the rim ramps
    // back up to the terrain outside it.
    const ci = Math.round(((m.lake.x + WORLD / 2) / WORLD) * N);
    const cj = Math.round(((m.lake.z + WORLD / 2) / WORLD) * N);
    const bed = this.height[Math.min(HN - 1, Math.max(0, cj)) * HN + Math.min(HN - 1, Math.max(0, ci))] - 30;
    const rim = m.lake.r * 1.35;
    for (let j = 0; j < HN; j++) {
      for (let i = 0; i < HN; i++) {
        const x = (i / N) * WORLD - WORLD / 2;
        const z = (j / N) * WORLD - WORLD / 2;
        const dl = Math.hypot(x - m.lake.x, z - m.lake.z);
        if (dl >= rim) continue;
        const t = Math.min(1, (rim - dl) / (rim - m.lake.r));
        const s = t * t * (3 - 2 * t);
        const k = j * HN + i;
        this.height[k] = this.height[k] * (1 - s) + bed * s;
      }
    }
    this.waterLevel = bed + 21;

    let min = Infinity;
    for (let i = 0; i < this.height.length; i++) min = Math.min(min, this.height[i]);
    for (let i = 0; i < this.height.length; i++) this.height[i] -= min;
    this.waterLevel -= min;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        this.cellH[j * N + i] =
          (this.height[j * HN + i] + this.height[j * HN + i + 1] +
            this.height[(j + 1) * HN + i] + this.height[(j + 1) * HN + i + 1]) * 0.25;
      }
    }
  }

  #buildFuel(noise, m, rand) {
    // Fuel is assigned by percentile rather than by absolute noise value, so a
    // mission gets the fuel mix it asks for whatever the terrain came out like.
    const water = [];
    const land = [];
    const fuelNoise = new Float32Array(N * N);
    const steep = new Float32Array(N * N);

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const nx = i / N, nz = j / N;
        fuelNoise[k] =
          fbm(noise, nx * 5.5 + 11, nz * 5.5 + 7, 4) * 0.8 +
          fbm(noise, nx * 11 + 61, nz * 11 + 31, 3) * 0.2 +
          (this.cellH[k] / (m.relief + 1)) * 0.14;
        steep[k] = this.slopeAt(i, j);
        const wx = (i + 0.5) * CELL - WORLD / 2, wz = (j + 0.5) * CELL - WORLD / 2;
        const inLake = Math.hypot(wx - m.lake.x, wz - m.lake.z) < this.lakeLimit;
        if (inLake && this.cellH[k] < this.waterLevel) {
          this.model[k] = MODEL.WATER;
          water.push(k);
        } else {
          land.push(k);
        }
      }
    }

    const pick = (arr, cells, frac) => {
      const v = cells.map((k) => arr[k]).sort((a, b) => a - b);
      return v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * frac)))];
    };

    const rockCut = pick(steep, land, 1 - m.rockFrac);
    const soft = land.filter((k) => steep[k] < rockCut);
    for (const k of land) if (steep[k] >= rockCut) this.model[k] = MODEL.ROCK;

    const grassCut = pick(fuelNoise, soft, m.mix.grass);
    const brushCut = pick(fuelNoise, soft, m.mix.grass + m.mix.brush);
    for (const k of soft) {
      const v = fuelNoise[k];
      this.model[k] = v < grassCut ? MODEL.GRASS : v < brushCut ? MODEL.BRUSH : MODEL.TIMBER;
    }

    for (let k = 0; k < N * N; k++) {
      this.fuel[k] = FUELS[this.model[k]].fuel * (0.75 + rand() * 0.4);
      if (this.model[k] === MODEL.WATER || this.model[k] === MODEL.ROCK) this.fuel[k] = 0;
    }

    // Moisture falls off with distance from water — a cheap BFS distance field.
    const dist = new Int32Array(N * N).fill(9999);
    let q = water.slice();
    for (const k of q) dist[k] = 0;
    let d = 0;
    while (q.length && d < 16) {
      const next = [];
      for (const k of q) {
        const i = k % N, j = (k / N) | 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ni = i + di, nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
            const nk = nj * N + ni;
            if (dist[nk] > d + 1) { dist[nk] = d + 1; next.push(nk); }
          }
      }
      q = next;
      d++;
    }
    for (let k = 0; k < N * N; k++) {
      const near = Math.max(0, 1 - dist[k] / 15);
      this.moist[k] = Math.min(0.72, 0.08 + near * 0.55 + (this.model[k] === MODEL.TIMBER ? 0.06 : 0));
      if (this.model[k] === MODEL.WATER) this.moist[k] = 1;
    }
  }

  slopeAt(i, j) {
    const k = (a, b) => this.cellH[Math.min(N - 1, Math.max(0, b)) * N + Math.min(N - 1, Math.max(0, a))];
    const dx = (k(i + 1, j) - k(i - 1, j)) / (2 * CELL);
    const dz = (k(i, j + 1) - k(i, j - 1)) / (2 * CELL);
    return Math.hypot(dx, dz);
  }

  #buildMesh() {
    const geo = new THREE.PlaneGeometry(WORLD, WORLD, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let j = 0; j < HN; j++)
      for (let i = 0; i < HN; i++) pos.setY(j * HN + i, this.height[j * HN + i]);
    geo.computeVertexNormals();
    this.geometry = geo;
  }

  #buildTexture() {
    const P = 3; // pixels per cell
    this.px = P;
    const c = document.createElement('canvas');
    c.width = c.height = N * P;
    const ctx = c.getContext('2d');
    this.ctx = ctx;
    this.canvas = c;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.paint(i, j, null);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.texture = tex;
    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshLambertMaterial({ map: tex })
    );
    this.mesh.receiveShadow = false;
  }

  // Repaints one cell. `fire` is the sim (may be null during first build).
  paint(i, j, fire) {
    const k = j * N + i;
    let col = COLORS[this.model[k]];
    if (fire) {
      const st = fire.state[k];
      if (st === 1) col = EMBER;
      else if (st === 2) col = BURNT;
      else if (fire.slurry[k] > 0.05) {
        const t = Math.min(1, fire.slurry[k] * 1.4);
        col = [
          col[0] + (SLURRY[0] - col[0]) * t,
          col[1] + (SLURRY[1] - col[1]) * t,
          col[2] + (SLURRY[2] - col[2]) * t,
        ];
      }
    }
    const n = ((i * 73856093) ^ (j * 19349663)) & 255;
    const v = 0.88 + (n / 255) * 0.24;
    const P = this.px;
    this.ctx.fillStyle = `rgb(${(col[0] * v * 255) | 0},${(col[1] * v * 255) | 0},${(col[2] * v * 255) | 0})`;
    this.ctx.fillRect(i * P, j * P, P, P);
    this.dirty = true;
  }

  #buildTrees(rand) {
    const cells = [];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++)
        if (this.model[j * N + i] === MODEL.TIMBER && rand() < 0.4) cells.push(j * N + i);
    const max = Math.min(cells.length, 5200);
    const geo = new THREE.ConeGeometry(4.2, 15, 5);
    geo.translate(0, 7.5, 0);
    const mat = new THREE.MeshLambertMaterial({});
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    this.treeCell = new Int32Array(max);
    const col = new THREE.Color();
    for (let t = 0; t < max; t++) {
      const k = cells[(rand() * cells.length) | 0];
      const i = k % N, j = (k / N) | 0;
      const x = (i + rand()) * CELL - WORLD / 2;
      const z = (j + rand()) * CELL - WORLD / 2;
      p.set(x, this.heightAt(x, z) - 1, z);
      const sc = 0.7 + rand() * 0.8;
      s.set(sc, sc * (0.8 + rand() * 0.6), sc);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      m4.compose(p, q, s);
      mesh.setMatrixAt(t, m4);
      const g = 0.1 + rand() * 0.06;
      col.setRGB(g * 0.55, g * 1.5, g * 0.6);
      mesh.setColorAt(t, col);
      this.treeCell[t] = k;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.trees = mesh;
    this.treeBurnt = new Uint8Array(max);
  }

  burnTrees(k) {
    if (!this.trees) return;
    const col = new THREE.Color(0.035, 0.03, 0.028);
    let changed = false;
    for (let t = 0; t < this.treeCell.length; t++) {
      if (this.treeCell[t] === k && !this.treeBurnt[t]) {
        this.trees.setColorAt(t, col);
        this.treeBurnt[t] = 1;
        changed = true;
      }
    }
    if (changed) this.trees.instanceColor.needsUpdate = true;
  }

  #buildWater() {
    const geo = new THREE.CircleGeometry(this.lakeLimit, 56);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({
      color: 0x16394d,
      transparent: true,
      opacity: 0.92,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.set(this.lake.x, this.waterLevel, this.lake.z);
  }

  heightAt(x, z) {
    const fx = ((x + WORLD / 2) / WORLD) * N;
    const fz = ((z + WORLD / 2) / WORLD) * N;
    const i = Math.max(0, Math.min(N - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(N - 1, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i));
    const tz = Math.max(0, Math.min(1, fz - j));
    const h00 = this.height[j * HN + i];
    const h10 = this.height[j * HN + i + 1];
    const h01 = this.height[(j + 1) * HN + i];
    const h11 = this.height[(j + 1) * HN + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  // Clearance is measured from whatever you would hit — ground or water.
  surfaceAt(x, z) {
    return Math.max(this.heightAt(x, z), this.waterLevel);
  }

  cellAt(x, z) {
    const i = Math.floor(((x + WORLD / 2) / WORLD) * N);
    const j = Math.floor(((z + WORLD / 2) / WORLD) * N);
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    return j * N + i;
  }

  isWaterAt(x, z) {
    const k = this.cellAt(x, z);
    return k >= 0 && this.model[k] === MODEL.WATER;
  }

  addTo(scene) {
    scene.add(this.mesh);
    scene.add(this.water);
    scene.add(this.trees);
  }

  flush() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }
}

export const cellCentre = (k) => ({
  x: ((k % N) + 0.5) * CELL - WORLD / 2,
  z: (((k / N) | 0) + 0.5) * CELL - WORLD / 2,
});
