// Particle fluid after Clavet, Beaudoin & Poulin (2005), "Particle-based
// viscoelastic fluid simulation": double-density relaxation gives pressure,
// near-pressure (cohesion / surface tension) and incompressibility without a
// pressure solve. Units are screen pixels and seconds.

export const H = 16;
const H2 = H * H;
export const FLUID_DEFAULTS = {
  rest: 3,
  k: 25000,
  kNear: 25000,
  sigma: 4,
  beta: 0.0012,
};
const MAX_NBR = 128;
const TABLE = 8192;

export class Fluid {
  constructor(cap, params = {}) {
    this.p = { ...FLUID_DEFAULTS, ...params };
    this.cap = cap;
    this.n = 0;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.px = new Float32Array(cap);
    this.py = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.home = new Int32Array(cap);
    this.pushX = new Float32Array(cap);
    this.pushY = new Float32Array(cap);

    this.cellStart = new Int32Array(TABLE + 1);
    this.cellItems = new Int32Array(cap);
    this.cellOf = new Int32Array(cap);
    this.nbr = new Int32Array(MAX_NBR);
    this.nbrQ = new Float32Array(MAX_NBR);
    this.nbrUx = new Float32Array(MAX_NBR);
    this.nbrUy = new Float32Array(MAX_NBR);
    this.cellScratch = new Int32Array(9);
  }

  add(x, y, vx, vy, home) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y;
    this.px[i] = x; this.py[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.home[i] = home;
    this.pushX[i] = 0; this.pushY[i] = 0;
    return i;
  }

  // Swap-remove: the last particle moves into slot i, so callers iterating
  // forward must re-examine index i after a removal.
  remove(i) {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j]; this.y[i] = this.y[j];
    this.px[i] = this.px[j]; this.py[i] = this.py[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
    this.home[i] = this.home[j];
    this.pushX[i] = this.pushX[j]; this.pushY[i] = this.pushY[j];
  }

  clear() { this.n = 0; }

  hashCell(cx, cy) {
    return ((Math.imul(cx, 92837111) ^ Math.imul(cy, 689287499)) >>> 0) & (TABLE - 1);
  }

  buildHash() {
    const { n, x, y, cellStart, cellItems, cellOf } = this;
    cellStart.fill(0);
    for (let i = 0; i < n; i++) {
      const h = this.hashCell(Math.floor(x[i] / H), Math.floor(y[i] / H));
      cellOf[i] = h;
      cellStart[h + 1]++;
    }
    for (let c = 0; c < TABLE; c++) cellStart[c + 1] += cellStart[c];
    const fill = this._fill || (this._fill = new Int32Array(TABLE));
    fill.set(cellStart.subarray(0, TABLE));
    for (let i = 0; i < n; i++) cellItems[fill[cellOf[i]]++] = i;
  }

  // Collects neighbours of i within H into the scratch arrays and returns the
  // count. Two of the nine cells can hash to the same bucket, so buckets are
  // de-duplicated before they are walked.
  gather(i) {
    const { x, y, cellStart, cellItems, nbr, nbrQ, nbrUx, nbrUy, cellScratch } = this;
    const xi = x[i], yi = y[i];
    const cx = Math.floor(xi / H), cy = Math.floor(yi / H);
    let nc = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const h = this.hashCell(cx + ox, cy + oy);
        let dup = false;
        for (let k = 0; k < nc; k++) if (cellScratch[k] === h) { dup = true; break; }
        if (!dup) cellScratch[nc++] = h;
      }
    }
    let count = 0;
    for (let k = 0; k < nc; k++) {
      const h = cellScratch[k];
      for (let s = cellStart[h], e = cellStart[h + 1]; s < e; s++) {
        const j = cellItems[s];
        if (j === i) continue;
        const dx = x[j] - xi, dy = y[j] - yi;
        const r2 = dx * dx + dy * dy;
        if (r2 >= H2) continue;
        if (count >= MAX_NBR) return count;
        let r = Math.sqrt(r2);
        let ux, uy;
        if (r < 1e-4) {
          // Coincident particles (a wall projection can stack them): pick a
          // deterministic direction so they separate instead of NaN-ing.
          const a = (i * 2.399963 + j) % 6.283185;
          ux = Math.cos(a); uy = Math.sin(a); r = 0;
        } else {
          ux = dx / r; uy = dy / r;
        }
        nbr[count] = j;
        nbrQ[count] = 1 - r / H;
        nbrUx[count] = ux;
        nbrUy[count] = uy;
        count++;
      }
    }
    return count;
  }

  viscosity(dt) {
    const { n, vx, vy, nbr, nbrQ, nbrUx, nbrUy } = this;
    const { sigma, beta } = this.p;
    for (let i = 0; i < n; i++) {
      const c = this.gather(i);
      for (let k = 0; k < c; k++) {
        const j = nbr[k];
        if (j < i) continue;
        const ux = nbrUx[k], uy = nbrUy[k];
        const u = (vx[i] - vx[j]) * ux + (vy[i] - vy[j]) * uy;
        if (u <= 0) continue;
        const q = nbrQ[k];
        const I = 0.5 * dt * q * (sigma * u + beta * u * u);
        const Ix = I * ux, Iy = I * uy;
        vx[i] -= Ix; vy[i] -= Iy;
        vx[j] += Ix; vy[j] += Iy;
      }
    }
  }

  relax(dt) {
    const { n, x, y, nbr, nbrQ, nbrUx, nbrUy } = this;
    const dt2 = dt * dt;
    const { rest, k: K, kNear } = this.p;
    for (let i = 0; i < n; i++) {
      const c = this.gather(i);
      let rho = 0, rhoN = 0;
      for (let k = 0; k < c; k++) {
        const q = nbrQ[k];
        const q2 = q * q;
        rho += q2;
        rhoN += q2 * q;
      }
      const P = K * (rho - rest);
      const PN = kNear * rhoN;
      let dxi = 0, dyi = 0;
      for (let k = 0; k < c; k++) {
        const q = nbrQ[k];
        const D = 0.5 * dt2 * (P * q + PN * q * q);
        const Dx = D * nbrUx[k], Dy = D * nbrUy[k];
        const j = nbr[k];
        x[j] += Dx; y[j] += Dy;
        dxi -= Dx; dyi -= Dy;
      }
      x[i] += dxi; y[i] += dyi;
    }
  }

  // Local density at i (same kernel as relax), used to shade foam and to keep
  // springs from emitting into an already packed mouth.
  densityAt(px, py) {
    const { x, y, cellStart, cellItems } = this;
    const cx = Math.floor(px / H), cy = Math.floor(py / H);
    let rho = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const h = this.hashCell(cx + ox, cy + oy);
        for (let s = cellStart[h], e = cellStart[h + 1]; s < e; s++) {
          const j = cellItems[s];
          const dx = x[j] - px, dy = y[j] - py;
          const r2 = dx * dx + dy * dy;
          if (r2 < H2) { const q = 1 - Math.sqrt(r2) / H; rho += q * q; }
        }
      }
    }
    return rho;
  }
}
