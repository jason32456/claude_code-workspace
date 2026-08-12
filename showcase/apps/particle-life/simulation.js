export const params = {
  N: 2000,
  K: 6,
  rMax: 0.1,
  forceFactor: 1.0,
  friction: 0.85,
  beta: 0.3,
  dt: 0.02,
};

// 10 distinct colors; only the first K are used
export const SPECIES_COLORS = [
  '#ff4444', '#44dd66', '#4488ff',
  '#ffdd22', '#ff44ee', '#44ffee',
  '#ff8833', '#aa44ff', '#88ff44', '#ff4488',
];

export const sim = {
  N: 0,             // actual particle count (may differ from params.N during resize)
  matrix: [],       // K × K Float32Arrays
  positions: null,  // Float32Array length N*2 [x0,y0, x1,y1, ...]
  velocities: null, // Float32Array length N*2
  species: null,    // Int32Array length N
};

// Pre-allocated work buffers — reallocated only when sizes grow
let _buf = null;

function ensureBuffers(N, C) {
  if (!_buf || _buf.N < N || _buf.C < C) {
    _buf = {
      N, C,
      cellCount:       new Int32Array(C),
      cellStart:       new Int32Array(C + 1),
      tempCount:       new Int32Array(C),
      sortedParticles: new Int32Array(N),
      accX:            new Float32Array(N),
      accY:            new Float32Array(N),
    };
  }
  return _buf;
}

export function randomizeMatrix() {
  const { K } = params;
  sim.matrix = Array.from({ length: K }, () =>
    Float32Array.from({ length: K }, () => Math.random() * 2 - 1)
  );
}

export function spawnParticles() {
  const { N, K } = params;
  sim.N = N;
  sim.positions  = new Float32Array(N * 2);
  sim.velocities = new Float32Array(N * 2);
  sim.species    = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    sim.positions[i * 2]     = Math.random();
    sim.positions[i * 2 + 1] = Math.random();
    sim.species[i]           = Math.floor(Math.random() * K);
  }
}

function forceFunc(r, a, beta) {
  if (r < beta) return r / beta - 1;                                         // repulsion ramp
  if (r < 1)   return a * (1 - Math.abs(2 * r - 1 - beta) / (1 - beta));   // triangle
  return 0;
}

export function step() {
  const { rMax, forceFactor, friction, beta, dt } = params;
  const { N, matrix, positions, velocities, species } = sim;
  if (!N || !positions) return;

  const cellSize = rMax;
  const gridW    = Math.max(1, Math.ceil(1 / cellSize));
  const gridH    = gridW;
  const C        = gridW * gridH;
  const b        = ensureBuffers(N, C);

  // --- Build spatial grid ---
  b.cellCount.fill(0, 0, C);
  for (let i = 0; i < N; i++) {
    const cx = Math.min(Math.floor(positions[i * 2]     / cellSize), gridW - 1);
    const cy = Math.min(Math.floor(positions[i * 2 + 1] / cellSize), gridH - 1);
    b.cellCount[cy * gridW + cx]++;
  }
  b.cellStart[0] = 0;
  for (let c = 0; c < C; c++) b.cellStart[c + 1] = b.cellStart[c] + b.cellCount[c];
  b.tempCount.fill(0, 0, C);
  for (let i = 0; i < N; i++) {
    const cx = Math.min(Math.floor(positions[i * 2]     / cellSize), gridW - 1);
    const cy = Math.min(Math.floor(positions[i * 2 + 1] / cellSize), gridH - 1);
    const cid = cy * gridW + cx;
    b.sortedParticles[b.cellStart[cid] + b.tempCount[cid]++] = i;
  }

  // --- Accumulate forces ---
  const rMax2 = rMax * rMax;
  for (let i = 0; i < N; i++) {
    const xi   = positions[i * 2];
    const yi   = positions[i * 2 + 1];
    const si   = species[i];
    const mRow = matrix[si];
    const ci   = Math.min(Math.floor(xi / cellSize), gridW - 1);
    const cj   = Math.min(Math.floor(yi / cellSize), gridH - 1);
    let ax = 0, ay = 0;

    for (let dcy = -1; dcy <= 1; dcy++) {
      const ny = ((cj + dcy) % gridH + gridH) % gridH;
      for (let dcx = -1; dcx <= 1; dcx++) {
        const nx  = ((ci + dcx) % gridW + gridW) % gridW;
        const cid = ny * gridW + nx;
        const end = b.cellStart[cid + 1];
        for (let k = b.cellStart[cid]; k < end; k++) {
          const j = b.sortedParticles[k];
          if (j === i) continue;

          let dx = positions[j * 2]     - xi;
          let dy = positions[j * 2 + 1] - yi;

          // Toroidal minimum image
          if      (dx >  0.5) dx -= 1;
          else if (dx < -0.5) dx += 1;
          if      (dy >  0.5) dy -= 1;
          else if (dy < -0.5) dy += 1;

          const d2 = dx * dx + dy * dy;
          if (d2 === 0 || d2 >= rMax2) continue;

          const dist = Math.sqrt(d2);
          const f    = forceFunc(dist / rMax, mRow[species[j]], beta) * rMax * forceFactor;
          ax += (dx / dist) * f;
          ay += (dy / dist) * f;
        }
      }
    }
    b.accX[i] = ax;
    b.accY[i] = ay;
  }

  // --- Integrate ---
  for (let i = 0; i < N; i++) {
    velocities[i * 2]     = velocities[i * 2]     * friction + b.accX[i] * dt;
    velocities[i * 2 + 1] = velocities[i * 2 + 1] * friction + b.accY[i] * dt;

    // Toroidal wrap to [0, 1)
    positions[i * 2]     = ((positions[i * 2]     + velocities[i * 2]     * dt) % 1 + 1) % 1;
    positions[i * 2 + 1] = ((positions[i * 2 + 1] + velocities[i * 2 + 1] * dt) % 1 + 1) % 1;
  }
}
