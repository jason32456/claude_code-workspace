// The whole game is in this file: one deformable body, updated by terms that
// all scale off the same softness curve. Nothing here is scripted per-shape.

export const N = 64;

const T_AMB = 40;
const T_FIRE = 1180;
const T_SOFT = 620;
const T_MELT = 1080;
const TAU = Math.PI * 2;

export const LIMITS = {
  sagDrop: 2.4,
  wallBurst: 0.075,
  crackSoft: 0.07,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export class Glass {
  constructor() {
    this.z = new Float32Array(N);
    this.dz = new Float32Array(N);
    this.r = new Float32Array(N);
    this.V = new Float32Array(N);
    this.T = new Float32Array(N);
    this.sy = new Float32Array(N);
    this.sz = new Float32Array(N);
    this.reset();
  }

  reset() {
    this.n = N;
    this.phi = 0;
    this.depth = 0;
    this.pressure = 0;
    this.opened = false;
    this.baseFlat = 0;
    this.dead = null;
    this.sagPeak = 0;
    this.sagLoad = 0;
    this.time = 0;
    // handed to you already rolling, the way it would be off the punty
    this.omega = 4.5;

    const L0 = 9.5;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      this.dz[i] = i === 0 ? 0 : L0 / (N - 1);
      // A fresh gather: collared at the pipe, blunt and heavy toward the tip.
      this.r[i] = 0.62 + 1.55 * smooth(0, 0.34, u) * (1 - 0.5 * smooth(0.7, 1, u));
      this.T[i] = 1090 - 40 * u;
      this.sy[i] = 0;
      this.sz[i] = 0;
    }
    this.rebuildZ();
    for (let i = 0; i < N; i++) {
      const t = 0.42 * this.r[i];
      this.V[i] = TAU * this.r[i] * t * Math.max(this.dz[i], 1e-4);
    }
  }

  rebuildZ() {
    let z = 0;
    for (let i = 0; i < this.n; i++) {
      z += this.dz[i];
      this.z[i] = z;
    }
    this.L = z;
  }

  soft(i) {
    return clamp((this.T[i] - T_SOFT) / (T_MELT - T_SOFT), 0, 1) ** 1.5;
  }

  wall(i) {
    const w = this.V[i] / (TAU * Math.max(this.r[i], 0.05) * Math.max(this.dz[i], 1e-4));
    return w > 1.5 ? 1.5 : w;
  }

  meanTemp() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.T[i];
    return s / this.n;
  }

  tipTemp() {
    let s = 0;
    let c = 0;
    for (let i = Math.floor(this.n * 0.6); i < this.n; i++) {
      s += this.T[i];
      c++;
    }
    return c ? s / c : T_AMB;
  }

  sagAt(i) {
    return Math.hypot(this.sy[i], this.sz[i]);
  }

  maxSag() {
    let m = 0;
    for (let i = 0; i < this.n; i++) m = Math.max(m, this.sagAt(i));
    return m;
  }

  // Axial position -> ring index.
  indexAt(zPos) {
    const target = clamp(zPos, 0, this.L);
    for (let i = 0; i < this.n; i++) if (this.z[i] >= target) return i;
    return this.n - 1;
  }

  kill(reason) {
    if (!this.dead) this.dead = reason;
  }

  update(dt, input, furnaceMouthX) {
    if (this.dead) return;
    this.time += dt;

    // --- rotation -------------------------------------------------------
    const spin = (input.rollRight ? 1 : 0) - (input.rollLeft ? 1 : 0);
    this.omega += spin * 26 * dt;
    this.omega *= Math.exp(-1.6 * dt);
    this.omega = clamp(this.omega, -11, 11);
    this.phi += this.omega * dt;

    // --- glory hole -----------------------------------------------------
    const want = input.heat ? 22 : 0;
    this.depth += clamp(want - this.depth, -38 * dt, 16 * dt);
    this.depth = clamp(this.depth, 0, 22);

    // --- thermal --------------------------------------------------------
    const inFireFrom = furnaceMouthX - this.depth;
    for (let i = 0; i < this.n; i++) {
      const t = this.wall(i);
      // thin, wide rings shed heat much faster than a thick gather does
      const k = 0.016 + 0.055 * (0.35 / (t + 0.22)) * (1 + 0.35 * this.r[i]);
      this.T[i] += -(this.T[i] - T_AMB) * k * dt;
      if (this.z[i] > inFireFrom) {
        const bite = smooth(0, 1.8, this.z[i] - inFireFrom);
        this.T[i] += (T_FIRE - this.T[i]) * 2.4 * bite * dt;
      }
      if (this.T[i] > T_FIRE) this.T[i] = T_FIRE;
    }

    // --- gravity in the rotating frame ----------------------------------
    // Never cancelled by a rule: spin sweeps the vector around and it sums out.
    const gy = -Math.cos(this.phi);
    const gz = Math.sin(this.phi);
    for (let i = 0; i < this.n; i++) {
      const s = this.soft(i);
      const lever = this.z[i] / Math.max(this.L, 1);
      const g = 1.15 * s * lever * lever;
      this.sy[i] += gy * g * dt;
      this.sz[i] += gz * g * dt;
      // surface tension only pulls it back while it is hot; a droop you earned
      // in the fire is still there once it sets
      const stiff = 0.3 * s + 0.02;
      const damp = Math.exp(-stiff * dt);
      this.sy[i] *= damp;
      this.sz[i] *= damp;
    }
    // neighbours drag each other so the droop is a smooth curve, not a spike
    for (let i = 1; i < this.n - 1; i++) {
      const a = clamp(11 * dt, 0, 0.45);
      this.sy[i] += a * (0.5 * (this.sy[i - 1] + this.sy[i + 1]) - this.sy[i]);
      this.sz[i] += a * (0.5 * (this.sz[i - 1] + this.sz[i + 1]) - this.sz[i]);
    }
    this.sy[0] = 0;
    this.sz[0] = 0;
    const ms = this.maxSag();
    this.sagPeak = Math.max(this.sagPeak, ms);
    this.sagLoad += ms * dt;
    if (ms > LIMITS.sagDrop) this.kill('DROPPED');

    // --- breath ---------------------------------------------------------
    if (input.blow && !this.opened) {
      this.pressure += (1 - this.pressure) * 2.6 * dt;
    } else {
      this.pressure *= Math.exp(-4.5 * dt);
    }
    if (this.pressure > 0.02 && !this.opened) {
      let grew = false;
      for (let i = 1; i < this.n; i++) {
        const s = this.soft(i);
        if (s < 0.04) continue;
        const t = this.wall(i);
        const collar = smooth(0.35, 1.5, this.z[i]);
        const dr = 1.5 * this.pressure * s * (0.24 / (t + 0.07)) * collar * dt;
        this.r[i] = Math.min(this.r[i] + dr, 6.5);
        // a bubble grows along the axis too, not just outward
        this.dz[i] *= 1 + 0.2 * this.pressure * s * collar * dt;
        grew = true;
        if (t < LIMITS.wallBurst && s > 0.5 && this.pressure > 0.55) this.kill('BLOWOUT');
      }
      if (grew) this.rebuildZ();
    }

    // --- centrifugal flare on an open rim -------------------------------
    if (this.opened) {
      const spinForce = Math.max(0, Math.abs(this.omega) - 3.2);
      if (spinForce > 0) {
        for (let i = 1; i < this.n; i++) {
          const s = this.soft(i);
          if (s < 0.05) continue;
          const nearRim = smooth(0.42, 1.0, this.z[i] / this.L);
          this.r[i] += 0.075 * spinForce * s * nearRim * dt;
        }
      }
    }

    this.clampWalls();
  }

  clampWalls() {
    for (let i = 0; i < this.n; i++) {
      this.r[i] = clamp(this.r[i], 0.12, 7);
      if (this.wall(i) < 0.035 && this.soft(i) > 0.35 && this.pressure > 0.3) this.kill('BLOWOUT');
    }
  }

  // ---- tools ------------------------------------------------------------

  applyTool(tool, zPos, dt) {
    if (this.dead) return null;
    const k = this.indexAt(zPos);
    if (this.soft(k) < LIMITS.crackSoft && tool !== 'marver') {
      this.kill('CRACKED');
      return 'crack';
    }
    switch (tool) {
      case 'jacks':
        return this.jacks(zPos, dt);
      case 'blocks':
        return this.blocks(zPos, dt);
      case 'pull':
        return this.pull(zPos, dt);
      case 'marver':
        return this.marver(dt);
      case 'shears':
        return this.shears(zPos);
      default:
        return null;
    }
  }

  jacks(zPos, dt) {
    const w = 2.2;
    for (let i = 1; i < this.n; i++) {
      const d = (this.z[i] - zPos) / w;
      const g = Math.exp(-d * d);
      if (g < 0.01) continue;
      const s = this.soft(i);
      this.r[i] = Math.max(0.3, this.r[i] - 1.15 * s * g * dt);
      this.T[i] -= 24 * g * dt;
    }
    this.clampWalls();
    return 'work';
  }

  blocks(zPos, dt) {
    const w = 1.9;
    const src = Float32Array.from(this.r.subarray(0, this.n));
    for (let i = 1; i < this.n; i++) {
      const d = (this.z[i] - zPos) / w;
      const g = Math.exp(-d * d);
      if (g < 0.01) continue;
      const s = this.soft(i);
      const a = src[Math.max(0, i - 2)];
      const b = src[Math.min(this.n - 1, i + 2)];
      const mean = (a + b + src[i]) / 3;
      const rate = clamp(2.6 * (0.3 + s) * g * dt, 0, 1);
      this.r[i] += (mean - this.r[i]) * rate;
      const decay = Math.exp(-5.5 * g * dt);
      this.sy[i] *= decay;
      this.sz[i] *= decay;
      this.T[i] -= 46 * g * dt;
    }
    // the pipe end becomes the base once the piece is cracked off
    this.baseFlat = Math.min(1, this.baseFlat + (zPos < this.L * 0.2 ? 0.9 * dt : 0));
    this.clampWalls();
    return 'work';
  }

  pull(zPos, dt) {
    let stretched = false;
    for (let i = 1; i < this.n; i++) {
      if (this.z[i] < zPos) continue;
      const s = this.soft(i);
      if (s < 0.06) continue;
      const f = 1 + 1.5 * s * dt;
      this.dz[i] *= f;
      this.r[i] /= Math.sqrt(f);
      this.T[i] -= 12 * dt;
      stretched = true;
    }
    if (stretched) this.rebuildZ();
    this.clampWalls();
    return stretched ? 'work' : null;
  }

  marver(dt) {
    for (let i = 0; i < this.n; i++) {
      this.T[i] -= 118 * dt;
      const decay = Math.exp(-3.4 * dt);
      this.sy[i] *= decay;
      this.sz[i] *= decay;
    }
    return 'marver';
  }

  shears(zPos) {
    const k = this.indexAt(zPos);
    if (k < 6) return null;
    if (this.soft(k) < 0.12) return 'toocold';
    this.n = k + 1;
    this.opened = true;
    this.pressure = 0;
    this.rebuildZ();
    return 'shear';
  }

  // ---- readout ----------------------------------------------------------

  profile(samples = 32) {
    const out = new Float32Array(samples);
    for (let s = 0; s < samples; s++) {
      const u = s / (samples - 1);
      const zt = u * this.L;
      let i = 1;
      while (i < this.n - 1 && this.z[i] < zt) i++;
      const z0 = this.z[i - 1];
      const z1 = this.z[i];
      const f = z1 > z0 ? (zt - z0) / (z1 - z0) : 0;
      out[s] = this.r[i - 1] * (1 - f) + this.r[i] * f;
    }
    return out;
  }

  meanSag() {
    return this.time > 0.5 ? this.sagLoad / this.time : this.maxSag();
  }

  // Weighted by surface area, so a deliberately thick little neck does not
  // drag down the reading for the body that actually holds the liquid.
  meanWall() {
    let num = 0;
    let den = 0;
    for (let i = 2; i < this.n; i++) {
      const a = this.r[i] * this.dz[i];
      num += this.wall(i) * a;
      den += a;
    }
    return den ? num / den : 0;
  }
}
