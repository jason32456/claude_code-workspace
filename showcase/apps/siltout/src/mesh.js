// Surface nets over a sparse block grid, so only the space near the cave is
// sampled. Returns flat arrays ready for a BufferGeometry.
const CELL = 0.7;
const BS = 8;

export function meshCave(cave) {
  const { D, prims, lo, hi, site } = cave;
  const o = lo.map((v) => v - CELL);
  const n = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / CELL) + 3);
  const nb = n.map((v) => Math.ceil(v / BS));
  const blocks = new Set();
  for (const P of prims)
    for (let x = Math.floor((P.lo[0] - o[0]) / CELL / BS); x <= Math.floor((P.hi[0] - o[0]) / CELL / BS); x++)
      for (let y = Math.floor((P.lo[1] - o[1]) / CELL / BS); y <= Math.floor((P.hi[1] - o[1]) / CELL / BS); y++)
        for (let z = Math.floor((P.lo[2] - o[2]) / CELL / BS); z <= Math.floor((P.hi[2] - o[2]) / CELL / BS); z++)
          if (x >= 0 && y >= 0 && z >= 0 && x < nb[0] && y < nb[1] && z < nb[2]) blocks.add(x + nb[0] * (y + nb[1] * z));

  const corner = new Map();
  const cKey = (x, y, z) => x + (n[0] + 1) * (y + (n[1] + 1) * z);
  const val = (x, y, z) => {
    const k = cKey(x, y, z);
    let v = corner.get(k);
    if (v === undefined) {
      v = D(o[0] + x * CELL, o[1] + y * CELL, o[2] + z * CELL);
      corner.set(k, v);
    }
    return v;
  };

  const verts = [], norms = [], cols = [];
  const cellVert = new Map();
  const cellKey = (x, y, z) => x + n[0] * (y + n[1] * z);
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const cells = [];
  const v8 = new Float64Array(8);
  const rock = site.rock, flo = site.floor;

  for (const b of blocks) {
    const bx = b % nb[0], by = Math.floor(b / nb[0]) % nb[1], bz = Math.floor(b / (nb[0] * nb[1]));
    for (let z = bz * BS; z < bz * BS + BS; z++)
      for (let y = by * BS; y < by * BS + BS; y++)
        for (let x = bx * BS; x < bx * BS + BS; x++) {
          let mask = 0;
          for (let i = 0; i < 8; i++) { v8[i] = val(x + C[i][0], y + C[i][1], z + C[i][2]); if (v8[i] > 0) mask |= 1 << i; }
          if (mask === 0 || mask === 255) continue;
          let px = 0, py = 0, pz = 0, cnt = 0;
          for (const [a, bb] of E) {
            const va = v8[a], vb = v8[bb];
            if ((va > 0) === (vb > 0)) continue;
            const t = va / (va - vb);
            px += C[a][0] + (C[bb][0] - C[a][0]) * t;
            py += C[a][1] + (C[bb][1] - C[a][1]) * t;
            pz += C[a][2] + (C[bb][2] - C[a][2]) * t;
            cnt++;
          }
          px /= cnt; py /= cnt; pz /= cnt;
          const gx = (v8[1] + v8[3] + v8[5] + v8[7]) - (v8[0] + v8[2] + v8[4] + v8[6]);
          const gy = (v8[2] + v8[3] + v8[6] + v8[7]) - (v8[0] + v8[1] + v8[4] + v8[5]);
          const gz = (v8[4] + v8[5] + v8[6] + v8[7]) - (v8[0] + v8[1] + v8[2] + v8[3]);
          const gl = Math.hypot(gx, gy, gz) || 1;
          const wx = o[0] + (x + px) * CELL, wy = o[1] + (y + py) * CELL, wz = o[2] + (z + pz) * CELL;
          // Normals face the water, i.e. down the distance gradient.
          const nx = -gx / gl, ny = -gy / gl, nz = -gz / gl;
          const idx = verts.length / 3;
          verts.push(wx, wy, wz);
          norms.push(nx, ny, nz);
          const f = Math.max(0, Math.min(1, (ny - 0.35) / 0.4));
          const g = 0.82 + 0.18 * Math.sin(wx * 1.7 + wz * 1.3) * Math.cos(wy * 2.1);
          const ceil = ny < -0.6 ? 0.8 : 1;
          for (let k = 0; k < 3; k++) cols.push((rock[k] * (1 - f) + flo[k] * f) * g * ceil);
          cellVert.set(cellKey(x, y, z), idx);
          cells.push(x, y, z, mask);
        }
  }

  const index = [];
  const getV = (x, y, z) => cellVert.get(cellKey(x, y, z));
  for (let i = 0; i < cells.length; i += 4) {
    const x = cells[i], y = cells[i + 1], z = cells[i + 2], mask = cells[i + 3];
    const s0 = mask & 1;
    // Edges leaving corner 0 along +x, +y, +z.
    const quads = [
      [[0, 0, 0], [0, -1, 0], [0, -1, -1], [0, 0, -1]],
      [[0, 0, 0], [0, 0, -1], [-1, 0, -1], [-1, 0, 0]],
      [[0, 0, 0], [-1, 0, 0], [-1, -1, 0], [0, -1, 0]],
    ];
    const bits = [1 << 1, 1 << 2, 1 << 4];
    for (let a = 0; a < 3; a++) {
      const s1 = mask & bits[a] ? 1 : 0;
      if ((s0 ? 1 : 0) === s1) continue;
      const q = quads[a].map(([dx, dy, dz]) => getV(x + dx, y + dy, z + dz));
      if (q.some((v) => v === undefined)) continue;
      if (q.some((v) => verts[v * 3 + 1] > -0.15)) continue;
      if (s0) index.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      else index.push(q[0], q[2], q[1], q[0], q[3], q[2]);
    }
  }
  return { positions: new Float32Array(verts), normals: new Float32Array(norms), colors: new Float32Array(cols), index: verts.length / 3 > 65535 ? new Uint32Array(index) : new Uint16Array(index) };
}
