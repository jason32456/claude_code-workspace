import { N, CELL, CELL_AREA, bilinear } from './grid.js';

const G = 9.81;
const PIPE_AREA = 0.55;
const FLUX_DAMP = 0.9955;
const MAX_SPEED = 9.0;

// Pipe-model shallow water (Mei et al., "Fast Hydraulic Erosion Simulation").
// Each edge carries a flux accelerated by the difference in water-surface
// height; a per-cell scale factor keeps any cell from emptying past zero in a
// step, which is what makes the whole thing volume-conserving and unable to
// diverge.
export class Water {
  constructor() {
    const n = N * N;
    this.depth = new Float32Array(n);
    this.fL = new Float32Array(n);
    this.fR = new Float32Array(n);
    this.fU = new Float32Array(n);
    this.fD = new Float32Array(n);
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.sediment = new Float32Array(n);
    this.sedTmp = new Float32Array(n);
    this.wet = new Float32Array(n);
    this.drained = 0;
    this.poured = 0;
  }

  reset() {
    this.depth.fill(0);
    this.fL.fill(0);
    this.fR.fill(0);
    this.fU.fill(0);
    this.fD.fill(0);
    this.u.fill(0);
    this.v.fill(0);
    this.speed.fill(0);
    this.sediment.fill(0);
    this.wet.fill(0);
    this.drained = 0;
    this.poured = 0;
  }

  volume() {
    let s = 0;
    for (let i = 0; i < this.depth.length; i++) s += this.depth[i];
    return s * CELL_AREA;
  }

  pour(cells, volume) {
    if (!cells.length) return;
    const per = volume / (cells.length * CELL_AREA);
    for (let k = 0; k < cells.length; k++) this.depth[cells[k]] += per;
    this.poured += volume;
  }

  // surface = terrain + wall, the height water actually has to climb.
  step(dt, surface, opts) {
    const { depth, fL, fR, fU, fD } = this;
    const k = (dt * PIPE_AREA * G) / CELL;

    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const d = depth[i];
        const h = surface[i] + d;

        let l = 0;
        let r = 0;
        let up = 0;
        let dn = 0;

        if (x > 0) l = Math.max(0, fL[i] * FLUX_DAMP + k * (h - surface[i - 1] - depth[i - 1]));
        if (x < N - 1) r = Math.max(0, fR[i] * FLUX_DAMP + k * (h - surface[i + 1] - depth[i + 1]));
        if (z > 0) up = Math.max(0, fU[i] * FLUX_DAMP + k * (h - surface[i - N] - depth[i - N]));
        if (z < N - 1) dn = Math.max(0, fD[i] * FLUX_DAMP + k * (h - surface[i + N] - depth[i + N]));

        const out = (l + r + up + dn) * dt;
        if (out > 1e-9) {
          const scale = Math.min(1, (d * CELL_AREA) / out);
          l *= scale;
          r *= scale;
          up *= scale;
          dn *= scale;
        }
        fL[i] = l;
        fR[i] = r;
        fU[i] = up;
        fD[i] = dn;
      }
    }

    const inv = dt / CELL_AREA;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const dPrev = depth[i];
        const inflow =
          (x > 0 ? fR[i - 1] : 0) +
          (x < N - 1 ? fL[i + 1] : 0) +
          (z > 0 ? fD[i - N] : 0) +
          (z < N - 1 ? fU[i + N] : 0);
        const outflow = fL[i] + fR[i] + fU[i] + fD[i];
        let d = dPrev + (inflow - outflow) * inv;
        if (d < 0) d = 0;
        depth[i] = d;

        const dAvg = Math.max(0.02, (dPrev + d) * 0.5);
        const netX = ((x > 0 ? fR[i - 1] : 0) - fL[i] + fR[i] - (x < N - 1 ? fL[i + 1] : 0)) * 0.5;
        const netZ = ((z > 0 ? fD[i - N] : 0) - fU[i] + fD[i] - (z < N - 1 ? fU[i + N] : 0)) * 0.5;
        let uu = netX / (CELL * dAvg);
        let vv = netZ / (CELL * dAvg);
        if (uu > MAX_SPEED) uu = MAX_SPEED;
        else if (uu < -MAX_SPEED) uu = -MAX_SPEED;
        if (vv > MAX_SPEED) vv = MAX_SPEED;
        else if (vv < -MAX_SPEED) vv = -MAX_SPEED;
        this.u[i] = uu;
        this.v[i] = vv;
        const sp = Math.hypot(uu, vv) * (d > 0.008 ? 1 : 0);
        this.speed[i] = sp;

        // A memory of where water has been, for the terrain shading.
        if (d > 0.02) this.wet[i] = Math.min(1, this.wet[i] + dt * 1.6);
      }
    }

    // Draining edge: whatever leaves the valley mouth is gone, and counted.
    const outletRow = opts && opts.outletRow !== undefined ? opts.outletRow : N - 1;
    for (let x = 0; x < N; x++) {
      const i = outletRow * N + x;
      if (depth[i] > 0) {
        this.drained += depth[i] * CELL_AREA;
        depth[i] = 0;
        fL[i] = fR[i] = fU[i] = fD[i] = 0;
      }
    }
  }

  // Erosion is a texture on the level, not a terrain shredder: everything here
  // is clamped per step so a fast channel widens over tens of seconds.
  erode(dt, world) {
    const { terrain, base, softness, noErode } = world;
    const { depth, speed, sediment, u, v } = this;
    const Kc = 0.03;
    const Ke = 0.4;
    const Kd = 0.75;
    const maxStep = 0.01 * dt * 60;
    // Hard floor and ceiling relative to the ground the season started with:
    // channels may deepen or silt up by about a metre, never re-cut the valley.
    const CUT = 1.2;
    const FILL = 0.9;

    for (let i = 0; i < depth.length; i++) {
      const d = depth[i];
      if (d < 0.015 || noErode[i]) {
        // Still let stranded sediment settle out.
        if (sediment[i] > 0) {
          const drop = Math.min(sediment[i], sediment[i] * Kd * dt * 4);
          sediment[i] -= drop;
          if (!noErode[i] && terrain[i] < base[i] + FILL) terrain[i] += drop;
        }
        continue;
      }
      const cap = Kc * speed[i] * Math.min(1, d * 6) * softness[i];
      const s = sediment[i];
      if (s < cap) {
        let e = Math.min((cap - s) * Ke * dt * 60 * 0.02, maxStep);
        e = Math.min(e, Math.max(0, terrain[i] - (base[i] - CUT)));
        terrain[i] -= e;
        sediment[i] = s + e;
      } else {
        let dep = Math.min((s - cap) * Kd * dt * 60 * 0.05, maxStep);
        dep = Math.min(dep, Math.max(0, base[i] + FILL - terrain[i]));
        terrain[i] += dep;
        sediment[i] = s - dep;
      }
    }

    // Semi-Lagrangian advection of the suspended load.
    const tmp = this.sedTmp;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        if (depth[i] < 0.015) {
          tmp[i] = sediment[i];
          continue;
        }
        tmp[i] = bilinear(sediment, x - u[i] * dt, z - v[i] * dt);
      }
    }
    sediment.set(tmp);
  }
}
