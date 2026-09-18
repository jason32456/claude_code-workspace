// D2Q9 lattice-Boltzmann solver. Pure typed arrays, no DOM: the same file runs
// in the page, in the benchmark worker and under Node for the test run.
//
// Lattice units throughout: cell = 1, step = 1, cs² = 1/3. Kinematic viscosity
// is ν = (τ − ½)/3, so a target Reynolds number fixes τ once the inlet speed and
// the obstacle size are chosen.

export const CX = new Int8Array([0, 1, 0, -1, 0, 1, -1, -1, 1]);
export const CY = new Int8Array([0, 0, 1, 0, -1, 1, 1, -1, -1]);
export const W = new Float64Array([4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36]);
export const OPP = new Int8Array([0, 3, 4, 1, 2, 7, 8, 5, 6]);

export const FLUID = 0;
export const WALL = 1;     // no-slip solid that is not part of the obstacle
export const OBSTACLE = 2; // solid whose bounce-back force is accumulated

export const BC_PERIODIC = 0;
export const BC_INLET_OUTLET = 1;

export class Lattice {
  constructor(nx, ny, opts = {}) {
    this.nx = nx;
    this.ny = ny;
    this.n = nx * ny;
    this.tau = opts.tau ?? 0.6;
    this.smagorinsky = opts.smagorinsky ?? 0;   // Cs; 0 disables the LES term
    this.bcX = opts.bcX ?? BC_PERIODIC;
    this.outlet = opts.outlet ?? 'convective';     // 'convective' | 'neep' (pins density) | 'copy'
    this.outletPrev = null;
    this.convectU = opts.convectU ?? 0.08;
    this.omegaMap = null;                          // per-cell 1/τ when a sponge is set
    this.gx = opts.gx ?? 0;                       // body force per unit mass
    this.gy = opts.gy ?? 0;
    this.inletProfile = opts.inletProfile ?? null; // (y) -> [ux, uy]
    // Moving-wall velocity for WALL cells, e.g. a lid. Applies to every WALL
    // cell whose y is in the inclusive range [wallY0, wallY1].
    this.wallU = opts.wallU ?? null;             // [ux, uy]
    this.wallY0 = opts.wallY0 ?? -1;
    this.wallY1 = opts.wallY1 ?? -1;

    this.mask = new Uint8Array(this.n);
    this.f = [];
    this.g = [];
    for (let i = 0; i < 9; i++) {
      this.f.push(new Float32Array(this.n));
      this.g.push(new Float32Array(this.n));
    }
    this.rho = new Float32Array(this.n);
    this.ux = new Float32Array(this.n);
    this.uy = new Float32Array(this.n);
    this.step = 0;
    this.forceX = 0;
    this.forceY = 0;
    this.links = null; // Int32Array of [cell, dir] pairs bordering OBSTACLE cells
    this.tauEffMax = this.tau;
    this.reset();
  }

  reset(u0 = [0, 0]) {
    const [ux0, uy0] = u0;
    for (let k = 0; k < this.n; k++) {
      for (let i = 0; i < 9; i++) this.f[i][k] = equilibrium(i, 1, ux0, uy0);
      this.rho[k] = 1;
      this.ux[k] = ux0;
      this.uy[k] = uy0;
    }
    this.step = 0;
    this.forceX = this.forceY = 0;
  }

  // Set the whole velocity field to the inlet profile so the tunnel starts
  // "already flowing" instead of from rest; keeps the first thousand steps
  // from being a pressure wave.
  primeWithInlet() {
    if (!this.inletProfile) return;
    for (let y = 0; y < this.ny; y++) {
      const [ux, uy] = this.inletProfile(y);
      for (let x = 0; x < this.nx; x++) {
        const k = y * this.nx + x;
        if (this.mask[k] !== FLUID) continue;
        for (let i = 0; i < 9; i++) this.f[i][k] = equilibrium(i, 1, ux, uy);
        this.ux[k] = ux;
        this.uy[k] = uy;
      }
    }
  }

  // Sponge: raise τ toward `tauMax` over the last `width` columns so vortices
  // and sound are damped before they reach the outlet instead of reflecting.
  setSponge(width, tauMax = 1.2) {
    if (!width) { this.omegaMap = null; return; }
    const { nx, ny } = this;
    const map = new Float32Array(this.n);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const t = Math.max(0, (x - (nx - width)) / width);
      const tau = this.tau + (tauMax - this.tau) * t * t;
      map[y * nx + x] = 1 / tau;
    }
    this.omegaMap = map;
    this.spongeWidth = width;
    this.spongeTauMax = tauMax;
  }

  clearObstacle() {
    for (let k = 0; k < this.n; k++) if (this.mask[k] === OBSTACLE) this.mask[k] = FLUID;
    this.links = null;
  }

  // Zero out populations inside solids so they never leak if a cell is later
  // reopened, and rebuild the bounce-back link list.
  finalizeMask() {
    const { nx, ny, mask } = this;
    const list = [];
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const k = y * nx + x;
        if (mask[k] !== FLUID) {
          for (let i = 0; i < 9; i++) this.f[i][k] = 0;
          this.rho[k] = 0;
          this.ux[k] = this.uy[k] = 0;
          continue;
        }
        for (let i = 1; i < 9; i++) {
          const xs = wrap(x + CX[i], nx);
          const ys = wrap(y + CY[i], ny);
          if (mask[ys * nx + xs] === OBSTACLE) list.push(k, i);
        }
      }
    }
    this.links = Int32Array.from(list);
  }

  // One time step: collide in place, then pull-stream into g and swap.
  advance() {
    const { nx, ny, n, mask, f, g, tau } = this;
    const gx = this.gx, gy = this.gy;
    const forced = gx !== 0 || gy !== 0;
    const omega = 1 / tau;
    const cs = this.smagorinsky;
    const lesK = 18 * Math.SQRT2 * cs * cs;
    let tauEffMax = tau;
    const f0 = f[0], f1 = f[1], f2 = f[2], f3 = f[3], f4 = f[4], f5 = f[5], f6 = f[6], f7 = f[7], f8 = f[8];
    const rhoA = this.rho, uxA = this.ux, uyA = this.uy;
    const omegaMap = this.omegaMap;

    // ---- collision -------------------------------------------------------
    for (let k = 0; k < n; k++) {
      if (mask[k] !== FLUID) continue;
      const a0 = f0[k], a1 = f1[k], a2 = f2[k], a3 = f3[k], a4 = f4[k], a5 = f5[k], a6 = f6[k], a7 = f7[k], a8 = f8[k];
      const rho = a0 + a1 + a2 + a3 + a4 + a5 + a6 + a7 + a8;
      const inv = 1 / rho;
      let ux = (a1 - a3 + a5 - a6 - a7 + a8) * inv;
      let uy = (a2 - a4 + a5 + a6 - a7 - a8) * inv;
      if (forced) { ux += 0.5 * gx; uy += 0.5 * gy; }
      rhoA[k] = rho;
      uxA[k] = ux;
      uyA[k] = uy;

      const usq = 1.5 * (ux * ux + uy * uy);
      const e0 = W[0] * rho * (1 - usq);
      const wr1 = W[1] * rho, wr5 = W[5] * rho;
      const e1 = wr1 * (1 + 3 * ux + 4.5 * ux * ux - usq);
      const e3 = wr1 * (1 - 3 * ux + 4.5 * ux * ux - usq);
      const e2 = wr1 * (1 + 3 * uy + 4.5 * uy * uy - usq);
      const e4 = wr1 * (1 - 3 * uy + 4.5 * uy * uy - usq);
      const p = ux + uy, m = ux - uy;
      const e5 = wr5 * (1 + 3 * p + 4.5 * p * p - usq);
      const e7 = wr5 * (1 - 3 * p + 4.5 * p * p - usq);
      const e6 = wr5 * (1 - 3 * m + 4.5 * m * m - usq);
      const e8 = wr5 * (1 + 3 * m + 4.5 * m * m - usq);

      let om = omegaMap ? omegaMap[k] : omega;
      let tauL = omegaMap ? 1 / om : tau;
      if (cs > 0) {
        // Non-equilibrium momentum flux; its magnitude sets the eddy viscosity.
        const n1 = a1 - e1, n2 = a2 - e2, n3 = a3 - e3, n4 = a4 - e4, n5 = a5 - e5, n6 = a6 - e6, n7 = a7 - e7, n8 = a8 - e8;
        const qxx = n1 + n3 + n5 + n6 + n7 + n8;
        const qyy = n2 + n4 + n5 + n6 + n7 + n8;
        const qxy = n5 - n6 + n7 - n8;
        const qmag = Math.sqrt(qxx * qxx + qyy * qyy + 2 * qxy * qxy);
        tauL = 0.5 * (tauL + Math.sqrt(tauL * tauL + lesK * qmag * inv));
        if (tauL > tauEffMax) tauEffMax = tauL;
        om = 1 / tauL;
      }

      if (!forced) {
        f0[k] = a0 - om * (a0 - e0);
        f1[k] = a1 - om * (a1 - e1);
        f2[k] = a2 - om * (a2 - e2);
        f3[k] = a3 - om * (a3 - e3);
        f4[k] = a4 - om * (a4 - e4);
        f5[k] = a5 - om * (a5 - e5);
        f6[k] = a6 - om * (a6 - e6);
        f7[k] = a7 - om * (a7 - e7);
        f8[k] = a8 - om * (a8 - e8);
      } else {
        // Guo et al. (2002) forcing: second-order accurate, no spurious
        // viscosity dependence in the steady profile.
        const pre = (1 - 0.5 / tauL) * rho;
        const cu = ux * gx + uy * gy;
        for (let i = 0; i < 9; i++) {
          const cx = CX[i], cy = CY[i];
          const cdu = cx * ux + cy * uy;
          const cdF = cx * gx + cy * gy;
          const S = pre * W[i] * (3 * (cdF - cu) + 9 * cdu * cdF);
          const e = i === 0 ? e0 : i === 1 ? e1 : i === 2 ? e2 : i === 3 ? e3 : i === 4 ? e4 : i === 5 ? e5 : i === 6 ? e6 : i === 7 ? e7 : e8;
          f[i][k] = f[i][k] - om * (f[i][k] - e) + S;
        }
      }
    }
    this.tauEffMax = tauEffMax;

    // ---- momentum exchange on the obstacle -------------------------------
    // With halfway bounce-back the population that comes back is exactly the
    // one that left, so each link contributes 2 f*_i c_i.
    if (this.links) {
      let fx = 0, fy = 0;
      const L = this.links;
      for (let j = 0; j < L.length; j += 2) {
        const v = 2 * f[L[j + 1]][L[j]];
        fx += v * CX[L[j + 1]];
        fy += v * CY[L[j + 1]];
      }
      this.forceX = fx;
      this.forceY = fy;
    }

    // ---- streaming (pull) --------------------------------------------------
    const g0 = g[0], g1 = g[1], g2 = g[2], g3 = g[3], g4 = g[4], g5 = g[5], g6 = g[6], g7 = g[7], g8 = g[8];
    const wallU = this.wallU;
    const wy0 = this.wallY0, wy1 = this.wallY1;
    const movingWalls = wallU !== null;
    for (let y = 0; y < ny; y++) {
      const yu = y === ny - 1 ? 0 : y + 1;
      const yd = y === 0 ? ny - 1 : y - 1;
      const rowU = yu * nx, rowD = yd * nx, row = y * nx;
      for (let x = 0; x < nx; x++) {
        const k = row + x;
        if (mask[k] !== FLUID) continue;
        const xr = x === nx - 1 ? 0 : x + 1;
        const xl = x === 0 ? nx - 1 : x - 1;
        // Source cell for population i is x − c_i.
        const s1 = row + xl, s2 = rowD + x, s3 = row + xr, s4 = rowU + x;
        const s5 = rowD + xl, s6 = rowD + xr, s7 = rowU + xr, s8 = rowU + xl;
        g0[k] = f0[k];
        g1[k] = mask[s1] === FLUID ? f1[s1] : f3[k];
        g2[k] = mask[s2] === FLUID ? f2[s2] : f4[k];
        g3[k] = mask[s3] === FLUID ? f3[s3] : f1[k];
        g4[k] = mask[s4] === FLUID ? f4[s4] : f2[k];
        g5[k] = mask[s5] === FLUID ? f5[s5] : f7[k];
        g6[k] = mask[s6] === FLUID ? f6[s6] : f8[k];
        g7[k] = mask[s7] === FLUID ? f7[s7] : f5[k];
        g8[k] = mask[s8] === FLUID ? f8[s8] : f6[k];
        if (movingWalls) {
          // A population bouncing off a moving wall picks up the wall's
          // momentum: f_ī ← f_i − 2 w_i ρ (c_i · u_w)/cs², with i toward the wall.
          const r6 = 6 * rhoA[k];
          if (mask[s2] === WALL && yd >= wy0 && yd <= wy1) g2[k] -= r6 * W[4] * (CX[4] * wallU[0] + CY[4] * wallU[1]);
          if (mask[s4] === WALL && yu >= wy0 && yu <= wy1) g4[k] -= r6 * W[2] * (CX[2] * wallU[0] + CY[2] * wallU[1]);
          if (mask[s5] === WALL && yd >= wy0 && yd <= wy1) g5[k] -= r6 * W[7] * (CX[7] * wallU[0] + CY[7] * wallU[1]);
          if (mask[s6] === WALL && yd >= wy0 && yd <= wy1) g6[k] -= r6 * W[8] * (CX[8] * wallU[0] + CY[8] * wallU[1]);
          if (mask[s7] === WALL && yu >= wy0 && yu <= wy1) g7[k] -= r6 * W[5] * (CX[5] * wallU[0] + CY[5] * wallU[1]);
          if (mask[s8] === WALL && yu >= wy0 && yu <= wy1) g8[k] -= r6 * W[6] * (CX[6] * wallU[0] + CY[6] * wallU[1]);
          if (mask[s1] === WALL && y >= wy0 && y <= wy1) g1[k] -= r6 * W[3] * (CX[3] * wallU[0] + CY[3] * wallU[1]);
          if (mask[s3] === WALL && y >= wy0 && y <= wy1) g3[k] -= r6 * W[1] * (CX[1] * wallU[0] + CY[1] * wallU[1]);
        }
      }
    }

    // ---- open boundaries ---------------------------------------------------
    // Guo's non-equilibrium extrapolation: the boundary cell takes the
    // equilibrium for the imposed velocity (inlet) or the imposed density
    // (outlet), plus the non-equilibrium part of its neighbour. Velocity is
    // enforced while pressure floats, so the flow rate holds whatever the
    // channel does, and it stays stable near τ = ½ where Zou–He does not.
    if (this.bcX === BC_INLET_OUTLET) {
      const prof = this.inletProfile;
      for (let y = 0; y < ny; y++) {
        const k = y * nx;
        if (mask[k] === FLUID && mask[k + 1] === FLUID) {
          const [ux, uy] = prof ? prof(y) : [0, 0];
          const kn = k + 1;
          let rn = 0, mx = 0, my = 0;
          for (let i = 0; i < 9; i++) { const v = g[i][kn]; rn += v; mx += CX[i] * v; my += CY[i] * v; }
          const un = mx / rn, vn = my / rn;
          for (let i = 0; i < 9; i++) g[i][k] = equilibrium(i, rn, ux, uy) + (g[i][kn] - equilibrium(i, rn, un, vn));
        }
        const ko = y * nx + nx - 1;
        if (mask[ko] === FLUID && mask[ko - 1] === FLUID) {
          const kn = ko - 1;
          if (this.outlet === 'copy') { for (let i = 0; i < 9; i++) g[i][ko] = g[i][kn]; continue; }
          if (this.outlet === 'convective') {
            // Sommerfeld radiation condition ∂f/∂t + U ∂f/∂x = 0, discretised
            // implicitly: whatever reaches the exit is carried out at the inlet
            // speed instead of reflected. Needs last step's outlet populations.
            if (!this.outletPrev) { this.outletPrev = new Float32Array(9 * ny); for (let i = 0; i < 9; i++) for (let yy = 0; yy < ny; yy++) this.outletPrev[i * ny + yy] = g[i][yy * nx + nx - 1]; }
            const uc = this.convectU;
            const prev = this.outletPrev;
            for (let i = 0; i < 9; i++) {
              const v = (prev[i * ny + y] + uc * g[i][kn]) / (1 + uc);
              g[i][ko] = v;
              prev[i * ny + y] = v;
            }
            continue;
          }
          let rn = 0, mx = 0, my = 0;
          for (let i = 0; i < 9; i++) { const v = g[i][kn]; rn += v; mx += CX[i] * v; my += CY[i] * v; }
          const un = mx / rn, vn = my / rn;
          for (let i = 0; i < 9; i++) g[i][ko] = equilibrium(i, 1, un, vn) + (g[i][kn] - equilibrium(i, rn, un, vn));
        }
      }
    }

    this.f = g;
    this.g = f;
    this.step++;
  }

  run(steps) {
    for (let s = 0; s < steps; s++) this.advance();
  }

  totalMass() {
    let m = 0;
    for (let i = 0; i < 9; i++) {
      const a = this.f[i];
      for (let k = 0; k < this.n; k++) m += a[k];
    }
    return m;
  }

  // Vorticity ω = ∂uy/∂x − ∂ux/∂y by central differences, zero on solids.
  vorticity(out) {
    const { nx, ny, mask, ux, uy } = this;
    out = out || new Float32Array(this.n);
    for (let y = 0; y < ny; y++) {
      const yu = Math.min(y + 1, ny - 1), yd = Math.max(y - 1, 0);
      for (let x = 0; x < nx; x++) {
        const k = y * nx + x;
        if (mask[k] !== FLUID) { out[k] = 0; continue; }
        const xr = Math.min(x + 1, nx - 1), xl = Math.max(x - 1, 0);
        out[k] = (uy[y * nx + xr] - uy[y * nx + xl]) * 0.5 - (ux[yu * nx + x] - ux[yd * nx + x]) * 0.5;
      }
    }
    return out;
  }

  // Bilinear velocity sample for tracers; solids read as zero velocity.
  sampleU(px, py, out) {
    const { nx, ny, ux, uy } = this;
    let x0 = Math.floor(px), y0 = Math.floor(py);
    const tx = px - x0, ty = py - y0;
    if (x0 < 0) x0 = 0; if (x0 > nx - 2) x0 = nx - 2;
    if (y0 < 0) y0 = 0; if (y0 > ny - 2) y0 = ny - 2;
    const k00 = y0 * nx + x0, k10 = k00 + 1, k01 = k00 + nx, k11 = k01 + 1;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    out[0] = ux[k00] * w00 + ux[k10] * w10 + ux[k01] * w01 + ux[k11] * w11;
    out[1] = uy[k00] * w00 + uy[k10] * w10 + uy[k01] * w01 + uy[k11] * w11;
    return out;
  }
}

export function equilibrium(i, rho, ux, uy) {
  const cu = CX[i] * ux + CY[i] * uy;
  const usq = ux * ux + uy * uy;
  return W[i] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * usq);
}

export function wrap(v, n) {
  return v < 0 ? v + n : v >= n ? v - n : v;
}

// Relaxation time for a target Reynolds number given speed U and length D.
export function tauFor(re, u, d) {
  return 0.5 + 3 * u * d / re;
}

export function viscosity(tau) {
  return (tau - 0.5) / 3;
}
