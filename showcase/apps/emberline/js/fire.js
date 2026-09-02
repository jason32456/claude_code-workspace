import { N, CELL, WORLD, SIM, MODEL, FUELS } from './config.js';
import { mulberry, cellCentre } from './terrain.js';

const NB = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export class Fire {
  constructor(terrain, seed) {
    this.t = terrain;
    this.rand = mulberry(seed ^ 0x9e3779b9);
    this.state = new Uint8Array(N * N);
    this.heat = new Float32Array(N * N);
    this.slurry = new Float32Array(N * N);
    this.burn = new Float32Array(N * N);
    this.burnMax = new Float32Array(N * N);
    this.burning = [];
    this.warm = new Set();
    this.embers = [];
    this.burnedCells = 0;
    this.slurryCells = 0;
    this.containment = 0;
    this.acc = 0;
    this.wind = { dir: 180, speed: 8 };
    this.onIgnite = null;
    this.onSpot = null;
  }

  windVec() {
    const r = (this.wind.dir * Math.PI) / 180;
    return { x: Math.sin(r), z: -Math.cos(r) };
  }

  ignite(k, force = false) {
    if (k < 0 || k >= N * N) return false;
    if (this.state[k] !== 0) return false;
    if (this.t.fuel[k] <= 0.02) return false;
    if (!force && this.slurry[k] > 0.35) return false;
    this.state[k] = 1;
    const model = this.t.model[k];
    const b = FUELS[model].burn * (0.65 + this.t.fuel[k] * 0.6);
    this.burn[k] = b;
    this.burnMax[k] = b;
    this.burning.push(k);
    this.warm.delete(k);
    this.t.paint(k % N, (k / N) | 0, this);
    this.t.burnTrees(k);
    if (this.onIgnite) this.onIgnite(k);
    return true;
  }

  igniteAt(x, z, radius = 12) {
    let k = this.t.cellAt(x, z);
    if (k < 0) return;
    // A start point that landed on rock or water walks to the nearest fuel.
    if (this.t.fuel[k] <= 0.02) {
      const ci = k % N, cj = (k / N) | 0;
      let best = -1, bestD = Infinity;
      for (let dj = -14; dj <= 14; dj++)
        for (let di = -14; di <= 14; di++) {
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nk = nj * N + ni;
          const d = di * di + dj * dj;
          if (this.t.fuel[nk] > 0.02 && d < bestD) { bestD = d; best = nk; }
        }
      if (best < 0) return;
      k = best;
    }
    const i = k % N, j = (k / N) | 0;
    const r = Math.ceil(radius / CELL);
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (di * di + dj * dj > r * r) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        this.ignite(nj * N + ni, true);
      }
  }

  // Retardant. On unburnt fuel it is a permanent line; on flame it is a
  // knockdown that costs the same load and buys far less.
  drop(k, dose) {
    if (k < 0) return;
    if (this.state[k] === 1) {
      this.burn[k] -= dose * 26;
      if (this.burn[k] <= 0 || this.rand() < dose * 0.55) {
        this.state[k] = 0;
        this.heat[k] = 0;
        this.t.fuel[k] *= 0.25;
        this.slurry[k] = Math.min(1, this.slurry[k] + dose);
        const idx = this.burning.indexOf(k);
        if (idx >= 0) this.burning.splice(idx, 1);
        this.t.paint(k % N, (k / N) | 0, this);
      }
      return;
    }
    if (this.state[k] === 2) return;
    const before = this.slurry[k];
    this.slurry[k] = Math.min(1, this.slurry[k] + dose);
    if (before <= 0.05 && this.slurry[k] > 0.05) this.slurryCells++;
    this.t.paint(k % N, (k / N) | 0, this);
  }

  step(dt) {
    const w = this.windVec();
    const ws = this.wind.speed;
    const { state, heat, slurry, burn, burnMax } = this;
    const t = this.t;
    const next = [];
    if (!this.flux) {
      this.flux = new Float32Array(N * N);
      this.fluxSum = new Float32Array(N * N);
    }
    const flux = this.flux, fluxSum = this.fluxSum;
    const touched = [];

    for (let n = 0; n < this.burning.length; n++) {
      const k = this.burning[n];
      const i = k % N, j = (k / N) | 0;
      const life = burn[k] / burnMax[k];
      // Intensity peaks shortly after ignition and tails off.
      const intensity = Math.min(1, life * 1.6) * (1 - Math.pow(1 - life, 3) * 0.35);
      const srcHeat = FUELS[t.model[k]].heat;

      for (let d = 0; d < 8; d++) {
        const ni = i + NB[d][0], nj = j + NB[d][1];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (state[nk] !== 0) continue;
        const f = t.fuel[nk];
        if (f <= 0.02) continue;

        const dist = d < 4 ? 1 : 1.4142;
        const align = (NB[d][0] * w.x + NB[d][1] * w.z) / dist;
        const windF = Math.min(SIM.windMax, Math.exp(SIM.windK * ws * align));
        let slope = (t.cellH[nk] - t.cellH[k]) / (CELL * dist);
        slope = Math.max(-0.35, Math.min(0.9, slope));
        const slopeF = Math.min(SIM.slopeMax, Math.exp(SIM.slopeK * slope));

        const c = (SIM.rate * f * srcHeat * intensity * windF * slopeF * (1 - t.moist[nk])) / dist;
        if (flux[nk] === 0 && fluxSum[nk] === 0) touched.push(nk);
        fluxSum[nk] += c;
        if (c > flux[nk]) flux[nk] = c;
      }

      // Ember lofting from timber under wind.
      if (t.model[k] === MODEL.TIMBER && ws >= 8 && intensity > 0.45) {
        if (this.rand() < SIM.spotChance * dt * (ws / 12)) this.#loft(k, ws, w);
      }

      burn[k] -= dt;
      if (burn[k] <= 0) {
        state[k] = 2;
        this.burnedCells++;
        t.paint(i, j, this);
      } else {
        next.push(k);
      }
    }
    this.burning = next;

    // A broad flame front pre-heats harder than a single cell does, but not
    // eight times harder — the strongest neighbour dominates and the rest add
    // a fraction. Without this the front accelerates as it widens.
    for (const k of touched) {
      const dominant = flux[k];
      heat[k] += (dominant + (fluxSum[k] - dominant) * 0.3) * dt;
      flux[k] = 0;
      fluxSum[k] = 0;
      this.warm.add(k);
      if (heat[k] >= FUELS[t.model[k]].ign + SIM.slurryBlock * slurry[k]) this.ignite(k);
    }

    for (const k of this.warm) {
      if (state[k] !== 0) { this.warm.delete(k); continue; }
      heat[k] -= dt * 0.03;
      if (heat[k] <= 0) { heat[k] = 0; this.warm.delete(k); }
    }

  }

  #loft(k, ws, w) {
    const c = cellCentre(k);
    const spread = ((this.rand() - 0.5) * 40 * Math.PI) / 180;
    const cs = Math.cos(spread), sn = Math.sin(spread);
    const dx = w.x * cs - w.z * sn;
    const dz = w.x * sn + w.z * cs;
    const dist = SIM.spotMin + this.rand() * (SIM.spotMax - SIM.spotMin) * (ws / 15);
    const tx = c.x + dx * dist;
    const tz = c.z + dz * dist;
    if (Math.abs(tx) > WORLD / 2 - 20 || Math.abs(tz) > WORLD / 2 - 20) return;
    const flight = 2.4 + dist / 90;
    const y0 = this.t.heightAt(c.x, c.z);
    const y1 = this.t.heightAt(tx, tz);
    const e = {
      x: c.x, z: c.z, y: y0 + 8,
      x0: c.x, z0: c.z, y0: y0 + 8,
      x1: tx, z1: tz, y1,
      peak: 55 + dist * 0.22,
      t: 0, flight,
      target: this.t.cellAt(tx, tz),
    };
    this.embers.push(e);
    if (this.onSpot) this.onSpot(e);
  }

  updateEmbers(dt) {
    for (let n = this.embers.length - 1; n >= 0; n--) {
      const e = this.embers[n];
      e.t += dt;
      const u = Math.min(1, e.t / e.flight);
      e.x = e.x0 + (e.x1 - e.x0) * u;
      e.z = e.z0 + (e.z1 - e.z0) * u;
      e.y = e.y0 + (e.y1 - e.y0) * u + Math.sin(u * Math.PI) * e.peak;
      if (u >= 1) {
        this.embers.splice(n, 1);
        const lit = this.ignite(e.target);
        if (lit && this.onSpotLand) this.onSpotLand(e);
      }
    }
  }

  update(dt) {
    this.acc += dt;
    const h = 1 / SIM.hz;
    let guard = 0;
    while (this.acc >= h && guard++ < 6) {
      this.step(h);
      this.acc -= h;
    }
    this.updateEmbers(dt);
  }

  // How much of the unburnt country the fire can no longer get to: flood out
  // from the flame front through fuel it could still cross, and compare what
  // it reaches with everything that is left to burn.
  measureContainment() {
    const { state, slurry } = this;
    const t = this.t;
    if (!this.seen) {
      this.seen = new Uint8Array(N * N);
      this.queue = new Int32Array(N * N);
    }
    const seen = this.seen;
    const q = this.queue;
    seen.fill(0);

    let head = 0, tail = 0;
    for (const k of this.burning) {
      if (!seen[k]) { seen[k] = 1; q[tail++] = k; }
    }
    for (const e of this.embers) {
      if (e.target >= 0 && !seen[e.target]) { seen[e.target] = 1; q[tail++] = e.target; }
    }

    let reachable = 0;
    while (head < tail) {
      const k = q[head++];
      const i = k % N, j = (k / N) | 0;
      for (let d = 0; d < 8; d++) {
        const ni = i + NB[d][0], nj = j + NB[d][1];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni;
        if (seen[nk]) continue;
        if (state[nk] !== 0) continue;
        if (t.fuel[nk] <= 0.02 || slurry[nk] > 0.35) continue;
        seen[nk] = 1;
        q[tail++] = nk;
        reachable++;
      }
    }

    let left = 0;
    for (let k = 0; k < N * N; k++) if (state[k] === 0 && t.fuel[k] > 0.02) left++;

    this.containment = left === 0 ? 1 : 1 - reachable / left;
    return this.containment;
  }

  get hectares() {
    return (this.burnedCells + this.burning.length) * (CELL * CELL) / 10000;
  }

  get out() {
    return this.burning.length === 0 && this.embers.length === 0;
  }
}
