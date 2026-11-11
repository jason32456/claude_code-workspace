// Suspended silt on a voxel grid. Each water cell holds a concentration in
// units of optical extinction (1/m), so visibility is simply 3 / (clarity + c).
export const H = 1.5;
const DIFF = 0.12;
const GAIN = 5;

export function buildSilt(cave) {
  const { site } = cave;
  const o = cave.lo.slice();
  const n = [0, 1, 2].map((k) => Math.ceil((cave.hi[k] - cave.lo[k]) / H) + 1);
  const N = n[0] * n[1] * n[2];
  const water = new Uint8Array(N);
  const idx = (x, y, z) => x + n[0] * (y + n[1] * z);
  const center = (i) => {
    const x = i % n[0], y = Math.floor(i / n[0]) % n[1], z = Math.floor(i / (n[0] * n[1]));
    return [o[0] + (x + 0.5) * H, o[1] + (y + 0.5) * H, o[2] + (z + 0.5) * H];
  };
  const cells = [];
  for (let z = 0; z < n[2]; z++)
    for (let y = 0; y < n[1]; y++)
      for (let x = 0; x < n[0]; x++) {
        const cx = o[0] + (x + 0.5) * H, cy = o[1] + (y + 0.5) * H, cz = o[2] + (z + 0.5) * H;
        if (cy > -0.2) continue;
        if (cave.D(cx, cy, cz) < -0.15) { const i = idx(x, y, z); water[i] = 1; cells.push(i); }
      }
  const W = cells.length;
  const slot = new Int32Array(N).fill(-1);
  cells.forEach((i, k) => { slot[i] = k; });
  const c = new Float32Array(W);
  const tmp = new Float32Array(W);
  const floor = new Float32Array(W);
  const ceil = new Float32Array(W);
  const open = new Uint8Array(W);
  const nb = new Int32Array(W * 3).fill(-1);
  const uf = new Float32Array(W * 3);
  const pos = new Float32Array(W * 3);
  const B = cave.basin;
  for (let k = 0; k < W; k++) {
    const i = cells[k];
    const p = center(i);
    pos.set(p, k * 3);
    const x = i % n[0], y = Math.floor(i / n[0]) % n[1], z = Math.floor(i / (n[0] * n[1]));
    if (x + 1 < n[0] && water[idx(x + 1, y, z)]) nb[k * 3] = slot[idx(x + 1, y, z)];
    if (y + 1 < n[1] && water[idx(x, y + 1, z)]) nb[k * 3 + 1] = slot[idx(x, y + 1, z)];
    if (z + 1 < n[2] && water[idx(x, y, z + 1)]) nb[k * 3 + 2] = slot[idx(x, y, z + 1)];
    if (cave.D(p[0], p[1] - H * 0.9, p[2]) > 0) floor[k] = site.silt;
    if (cave.D(p[0], p[1] + H * 0.9, p[2]) > 0) ceil[k] = site.ceilSilt;
    if (Math.hypot(p[0] - B.p[0], p[2] - B.p[2]) < B.r * 0.8) open[k] = 1;
    const u = cave.flow(p[0], p[1], p[2]);
    uf[k * 3] = u[0]; uf[k * 3 + 1] = u[1]; uf[k * 3 + 2] = u[2];
  }
  // Face velocity between a cell and its + neighbour is the mean of the two.
  const fv = new Float32Array(W * 3);
  for (let k = 0; k < W; k++)
    for (let a = 0; a < 3; a++) {
      const j = nb[k * 3 + a];
      if (j >= 0) fv[k * 3 + a] = (uf[k * 3 + a] + uf[j * 3 + a]) / 2;
    }

  function slotAt(x, y, z) {
    const ix = Math.floor((x - o[0]) / H), iy = Math.floor((y - o[1]) / H), iz = Math.floor((z - o[2]) / H);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= n[0] || iy >= n[1] || iz >= n[2]) return -1;
    return slot[idx(ix, iy, iz)];
  }

  function sample(x, y, z) {
    const fx = (x - o[0]) / H - 0.5, fy = (y - o[1]) / H - 0.5, fz = (z - o[2]) / H - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let s = 0, w = 0;
    for (let dz = 0; dz < 2; dz++)
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const X = ix + dx, Y = iy + dy, Z = iz + dz;
          if (X < 0 || Y < 0 || Z < 0 || X >= n[0] || Y >= n[1] || Z >= n[2]) continue;
          const k = slot[idx(X, Y, Z)];
          if (k < 0) continue;
          const ww = (dx ? fx - ix : 1 - (fx - ix)) * (dy ? fy - iy : 1 - (fy - iy)) * (dz ? fz - iz : 1 - (fz - iz));
          s += c[k] * ww; w += ww;
        }
    return w > 0.01 ? s / w : 0;
  }

  const S = { n, o, W, cells, c, floor, ceil, open, pos, uf, slotAt, sample, raised: 0 };

  S.add = (x, y, z, amount) => {
    const k = slotAt(x, y, z);
    if (k < 0) return 0;
    c[k] += (amount * GAIN) / (H * H * H);
    S.raised += amount;
    return amount;
  };

  S.mass = () => { let m = 0; for (let k = 0; k < W; k++) m += c[k]; return (m * H * H * H) / GAIN; };

  S.step = (dt, opts = {}) => {
    const settle = opts.settle ?? site.settle;
    const kd = (DIFF * dt) / (H * H);
    const ka = dt / H;
    tmp.set(c);
    for (let k = 0; k < W; k++) {
      const ck = c[k];
      for (let a = 0; a < 3; a++) {
        const j = nb[k * 3 + a];
        if (j < 0) continue;
        const cj = c[j];
        const u = fv[k * 3 + a];
        const f = kd * (ck - cj) + ka * (u > 0 ? u * ck : u * cj);
        tmp[k] -= f; tmp[j] += f;
      }
    }
    if (settle > 0) {
      const d = Math.exp(-dt / settle), dOpen = Math.exp(-dt / 2.5);
      for (let k = 0; k < W; k++) c[k] = Math.max(0, tmp[k] * (open[k] ? dOpen : d));
    } else c.set(tmp);
  };

  return S;
}

export const visibility = (clarity, c) => Math.min(40, 3 / (clarity + c));
