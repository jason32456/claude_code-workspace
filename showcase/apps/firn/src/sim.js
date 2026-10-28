// Pure simulation: terrain, snowpack, ball, props and the ice curtain. No DOM,
// no Three.js, so the bench can run it headless in Node.

export const G = 9.81;
export const RHO_BALL = 400;
export const RHO_AIR = 1.2;
export const CELL = 0.5;
export const DT = 1 / 120;
const DEPTH_MAX = 2;

export const SNOW = { POWDER: 0, CRUST: 1, ICE: 2, ROCK: 3, SLUSH: 4 };
const RHO_SNOW = [140, 260, 0, 0, 450];
const STICK = [0.62, 0.82, 0, 0, 1.0];
const CRR = [0.05, 0.035, 0.012, 0.14, 0.07];
const ABRADE = [0, 0, 0.0012, 0.011, 0];

// absorbR: the ball radius at which a prop sticks instead of blocking.
// vol: how much the prop adds to the ball's volume once picked up.
export const PROPS = {
  pinecone: { absorbR: 0.2, radius: 0.06, height: 0.14, mass: 0.1, breakE: 2, vol: 0.004, hard: 0 },
  stone: { absorbR: 0.36, radius: 0.14, height: 0.2, mass: 4, breakE: Infinity, vol: 0.01, hard: 1 },
  mitten: { absorbR: 0.28, radius: 0.1, height: 0.12, mass: 0.2, breakE: 3, vol: 0.006, hard: 0 },
  pole: { absorbR: 0.75, radius: 0.04, height: 1.25, mass: 0.6, breakE: 250, vol: 0.02, hard: 0 },
  sled: { absorbR: 0.95, radius: 0.5, height: 0.35, mass: 9, breakE: 1500, vol: 0.12, hard: 0 },
  post: { absorbR: 1.2, radius: 0.09, height: 1.4, mass: 16, breakE: 4500, vol: 0.06, hard: 1 },
  snowman: { absorbR: 1.25, radius: 0.5, height: 1.7, mass: 160, breakE: 2500, vol: 0.4, hard: 0 },
  sign: { absorbR: 1.7, radius: 0.12, height: 2.3, mass: 35, breakE: 9000, vol: 0.1, hard: 1 },
  sapling: { absorbR: 2.0, radius: 0.25, height: 2.6, mass: 45, breakE: 7000, vol: 0.5, hard: 0 },
  log: { absorbR: 2.6, radius: 1.6, height: 0.6, mass: 260, breakE: 4e4, vol: 1.2, hard: 1 },
  boulder: { absorbR: 4.2, radius: 1.3, height: 2.2, mass: 9000, breakE: Infinity, vol: 4, hard: 1 },
  pine: { absorbR: 3.4, radius: 0.45, height: 9, mass: 900, breakE: 1.6e5, vol: 6, hard: 1 },
  hut: { absorbR: 5.6, radius: 2.8, height: 4.2, mass: 5000, breakE: 2.2e6, vol: 30, hard: 1 },
  pylon: { absorbR: 7.5, radius: 0.6, height: 14, mass: 7000, breakE: 1.6e7, vol: 25, hard: 1 },
};
export const PROP_ORDER = Object.keys(PROPS).sort((a, b) => PROPS[a].absorbR - PROPS[b].absorbR);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const N = 256;
  const tab = new Float32Array(N * N);
  for (let i = 0; i < tab.length; i++) tab[i] = rnd();
  const at = (i, j) => tab[(i & (N - 1)) + (j & (N - 1)) * N];
  const s = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = s(x - i), fy = s(y - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y) => (v(x, y) * 0.62 + v(x * 2.03 + 17.1, y * 2.03 - 9.3) * 0.38);
}

const lerpTable = (tab, z) => {
  if (z <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (z <= tab[i][0]) {
      const [z0, a] = tab[i - 1], [z1, b] = tab[i];
      const t = (z - z0) / (z1 - z0);
      return a + (b - a) * t * t * (3 - 2 * t);
    }
  }
  return tab[tab.length - 1][1];
};
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildWorld(L) {
  const nA = makeNoise(L.seed), nB = makeNoise(L.seed * 7 + 3), nC = makeNoise(L.seed * 13 + 5);
  const rnd = mulberry32(L.seed * 31 + 1);
  const maxHW = Math.max(...L.halfWidth.map((p) => p[1]));
  const GX = Math.ceil(maxHW * 1.35);
  const z0 = -30, z1 = L.length + 70;
  const nx = GX * 2 + 1, nz = z1 - z0 + 1;
  const heights = new Float32Array(nx * nz);

  // Integrate the slope profile at 1 m so a pitch change bends the run smoothly.
  const base = new Float32Array(nz);
  for (let k = 1; k < nz; k++) {
    const z = z0 + k - 0.5;
    base[k] = base[k - 1] - Math.tan((lerpTable(L.pitch, z) * Math.PI) / 180);
  }
  const cliffDrop = (z) => (L.cliffs || []).reduce((s, [cz, drop, len]) => s - drop * smooth(cz, cz + len, z), 0);
  const hw = (z) => lerpTable(L.halfWidth, z);
  for (let k = 0; k < nz; k++) {
    const z = z0 + k, w = hw(z), cd = cliffDrop(z);
    for (let i = 0; i < nx; i++) {
      const x = i - GX, u = Math.abs(x) / w;
      let h = base[k] + cd;
      if (u > 0.72) {
        // Steep near the run, then a gentler shoulder so a narrow gully does not raise kilometre walls.
        const q = (u - 0.72) / 0.28;
        h += L.wallH * (Math.min(q, 2.2) ** 2 + 2 * Math.tanh(Math.max(0, q - 2.2) * 0.6));
      }
      h += 0.6 * (x / w) ** 2;
      const fade = smooth(z0, 20, z) * (1 - smooth(L.length - 60, L.length - 10, z));
      h += L.bumps * fade * (nA(x / 21, z / 21) - 0.5) * 2;
      h += L.bumps * 0.35 * fade * (nA(x / 6 + 40, z / 6) - 0.5);
      heights[i + k * nx] = h;
    }
  }

  const cx = GX * 2 / CELL, cz = Math.round((z1 - z0) / CELL);
  const depth = new Float32Array(cx * cz);
  const type = new Uint8Array(cx * cz);
  for (let j = 0; j < cz; j++) {
    const z = z0 + (j + 0.5) * CELL;
    for (let i = 0; i < cx; i++) {
      const x = -GX + (i + 0.5) * CELL;
      const u = Math.abs(x) / hw(z);
      let t = SNOW.CRUST;
      // The first stretch is crust so a tiny ball builds speed before it meets powder.
      const powderFrac = lerpTable(L.powder, z) * smooth(35, 90, z), iceFrac = lerpTable(L.ice, z);
      if (nB(x / 26, z / 26) > 1 - powderFrac * 0.9) t = SNOW.POWDER;
      if (nC(x / 34 + 50, z / 34) > 1 - iceFrac * 0.9 && u < 0.9) t = SNOW.ICE;
      for (const [bz, th, gx, gw] of L.rockBands || []) {
        const wob = (nA(x / 9 + 90, bz / 9) - 0.5) * th;
        if (Math.abs(z - bz - wob) < th / 2 && Math.abs(x - gx) > gw / 2 && u < 1.05) t = SNOW.ROCK;
      }
      if (L.slushFrom != null && z > L.slushFrom && t !== SNOW.ROCK) t = SNOW.SLUSH;
      if (z < 18 || z > L.length + 2) t = z > L.length + 2 && L.slushFrom != null ? SNOW.SLUSH : SNOW.CRUST;
      let d = 0;
      if (t === SNOW.POWDER) d = 0.32 + 0.6 * nC(x / 8, z / 8);
      else if (t === SNOW.CRUST) d = 0.1 + 0.08 * nA(x / 5, z / 5) + (u > 0.8 ? 0.25 : 0);
      else if (t === SNOW.SLUSH) d = 0.35 + 0.25 * nB(x / 7, z / 7);
      depth[i + j * cx] = d;
      type[i + j * cx] = t;
    }
  }

  const world = {
    level: L, GX, z0, z1, nx, nz, heights, cx, cz, depth, type, hw,
    initialDepth: depth.slice(),
    zWall: L.length,
    props: [],
  };

  const place = (kind, x, z, extra) => {
    if (Math.abs(x) > hw(z) * 0.86) return;
    world.props.push({ id: world.props.length, kind, x, z, y: heightAt(world, x, z), yaw: rnd() * Math.PI * 2, state: 'up', ...extra });
  };
  for (const s of L.scatter) {
    const [zA, zB] = s.z;
    const area = (zB - zA) * 2 * hw((zA + zB) / 2) * 0.86;
    const n = Math.round((s.density * area) / 100);
    for (let k = 0; k < n; k++) {
      const z = zA + rnd() * (zB - zA);
      const x = (rnd() * 2 - 1) * hw(z) * 0.86;
      if (s.cluster && nB(x / s.cluster + 7, z / s.cluster) < 0.52) continue;
      place(s.kind, x, z);
    }
  }
  for (const f of L.fences || []) {
    const w = hw(f.z) * 0.82;
    for (let x = -w; x <= w; x += f.step) {
      if (Math.abs(x - f.gap) < f.gapW / 2) continue;
      place('post', x, f.z + Math.sin(x * 0.15) * 1.2);
    }
  }
  // Keep the start lane clear so the first seconds always roll.
  world.props = world.props.filter((p) => !(p.z < 30 && Math.abs(p.x) < 6));
  world.props.forEach((p, i) => (p.id = i));
  world.buckets = new Map();
  for (const p of world.props) {
    const b = Math.floor(p.z / 4);
    if (!world.buckets.has(b)) world.buckets.set(b, []);
    world.buckets.get(b).push(p);
  }
  return world;
}

export function heightAt(w, x, z) {
  let fx = x + w.GX, fz = z - w.z0;
  fx = Math.min(w.nx - 1.001, Math.max(0, fx));
  fz = Math.min(w.nz - 1.001, Math.max(0, fz));
  const i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
  const H = w.heights, n = w.nx, o = i + k * n;
  const a = H[o], b = H[o + 1], c = H[o + n], d = H[o + n + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

export function normalAt(w, x, z, s, out) {
  const hx = (heightAt(w, x + s, z) - heightAt(w, x - s, z)) / (2 * s);
  const hz = (heightAt(w, x, z + s) - heightAt(w, x, z - s)) / (2 * s);
  const l = Math.hypot(hx, 1, hz);
  out[0] = -hx / l; out[1] = 1 / l; out[2] = -hz / l;
  return out;
}

export const cellIndex = (w, x, z) => {
  const i = Math.floor((x + w.GX) / CELL), j = Math.floor((z - w.z0) / CELL);
  if (i < 0 || j < 0 || i >= w.cx || j >= w.cz) return -1;
  return i + j * w.cx;
};

export const temperatureAt = (w, y) => w.level.tTop + 0.0065 * (w.topY - y);
export const steerAuthority = (r) => 7.5 / (1 + r / 1.2);
export const impactEnergy = (m, v) => 0.7 * m * v * v;

function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qrot(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];

export function createSim(level, opts = {}) {
  const w = buildWorld(level);
  w.topY = heightAt(w, 0, 4);
  const r0 = opts.r0 ?? 0.3;
  const snowMass = RHO_BALL * (4 / 3) * Math.PI * r0 ** 3;
  const sim = {
    world: w,
    t: 0,
    p: [0, heightAt(w, 0, 4) + r0, 4],
    v: [0, 0, 3.2],
    q: [0, 0, 0, 1],
    omega: [0, 0, 0],
    r: r0,
    snowMass,
    propMass: 0,
    propVol: 0,
    grounded: true,
    surface: SNOW.CRUST,
    input: { steer: 0, tuck: false, brake: false },
    phase: 'run',
    result: null,
    attached: [],
    events: [],
    acct: { initial: snowMass, stuck: 0, sprayed: 0, shed: 0, melted: 0, props: 0, removed: 0 },
    stats: { maxR: r0, maxV: 0, absorbed: 0, smashed: 0, bounced: 0, airtime: 0 },
    dirty: [Infinity, Infinity, -Infinity, -Infinity],
    stall: 0,
    finishT: 0,
    curtain: { broken: false, energy: 0 },
    taken: 0,
  };
  sim.mass = () => sim.snowMass + sim.propMass;
  sim.speed = () => Math.hypot(sim.v[0], sim.v[1], sim.v[2]);
  sim.temperature = () => temperatureAt(w, sim.p[1]);
  sim.energy = () => impactEnergy(sim.mass(), sim.speed());
  return sim;
}

function recomputeRadius(sim) {
  const vol = Math.max(sim.snowMass, 0) / RHO_BALL + sim.propVol;
  sim.r = Math.cbrt((vol * 3) / (4 * Math.PI));
}

function shed(sim, frac, why) {
  const dm = sim.snowMass * Math.min(frac, 0.6);
  if (dm <= 0) return 0;
  sim.snowMass -= dm;
  sim.acct.shed += dm;
  sim.events.push({ type: 'shed', amount: dm, why, p: sim.p.slice(), r: sim.r });
  return dm;
}

const _n = [0, 1, 0];

export function step(sim, dt = DT) {
  if (sim.phase !== 'run' && sim.phase !== 'finishing') return;
  const w = sim.world;
  const { p, v } = sim;
  let r = sim.r;
  const m = sim.mass();
  sim.t += dt;

  const n = normalAt(w, p[0], p[2], Math.min(4, Math.max(0.6, r * 0.6)), _n);
  const speed = Math.hypot(v[0], v[1], v[2]);
  const ci = cellIndex(w, p[0], p[2]);
  // A scraped-bare cell rolls like packed crust; rock and ice stay what they are.
  let surf = SNOW.CRUST;
  if (ci >= 0) {
    const t = w.type[ci];
    surf = t === SNOW.ROCK || t === SNOW.ICE || w.depth[ci] > 0.02 ? t : SNOW.CRUST;
  }
  sim.surface = surf;

  let ax = 0, ay = -G, az = 0;
  if (sim.grounded) {
    // A solid sphere rolling without slipping only gets 5/7 of the tangential pull.
    const gn = -G * n[1];
    const gtx = -gn * n[0], gty = -G - gn * n[1], gtz = -gn * n[2];
    ax -= (2 / 7) * gtx; ay -= (2 / 7) * gty; az -= (2 / 7) * gtz;
    const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    let tx = v[0] - vn * n[0], ty = v[1] - vn * n[1], tz = v[2] - vn * n[2];
    const ts = Math.hypot(tx, ty, tz);
    let fx, fy, fz;
    if (ts > 0.3) { fx = tx / ts; fy = ty / ts; fz = tz / ts; }
    else {
      const fl = Math.hypot(n[0], n[2]) || 1;
      fx = n[0] / fl * 0.2; fy = 0; fz = 1;
      const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    }
    const crr = CRR[surf] + (sim.input.brake ? 0.32 : 0);
    if (ts > 0.05) {
      const dec = Math.min(crr * G * n[1], ts / dt);
      ax -= dec * fx; ay -= dec * fy; az -= dec * fz;
    }
    // Steering pushes perpendicular to the direction of travel, in the surface plane.
    const sx = fy * n[2] - fz * n[1], sy = fz * n[0] - fx * n[2], sz = fx * n[1] - fy * n[0];
    const st = sim.input.steer * steerAuthority(r) * Math.min(1, 0.4 + ts / 6);
    ax += st * sx; ay += st * sy; az += st * sz;
    if (sim.input.tuck) {
      const tk = 1.6 / (1 + r / 0.35);
      ax += tk * fx; ay += tk * fy; az += tk * fz;
    }
  }
  const drag = speed > 0 ? (0.5 * RHO_AIR * 0.5 * Math.PI * r * r * speed) / m : 0;
  ax -= drag * v[0]; ay -= drag * v[1]; az -= drag * v[2];

  v[0] += ax * dt; v[1] += ay * dt; v[2] += az * dt;
  p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;

  // Sphere against heightfield: the highest of nine samples under the ball holds it up.
  let gy = heightAt(w, p[0], p[2]) + r;
  for (const [d, k] of [[0.5, 4], [0.85, 4]]) {
    const off = d * r, lift = Math.sqrt(r * r - off * off);
    for (let a = 0; a < k; a++) {
      const ang = (a / k) * Math.PI * 2 + (d > 0.6 ? Math.PI / 4 : 0);
      const hy = heightAt(w, p[0] + Math.cos(ang) * off, p[2] + Math.sin(ang) * off) + lift;
      if (hy > gy) gy = hy;
    }
  }
  const n2 = normalAt(w, p[0], p[2], Math.min(4, Math.max(0.6, r * 0.6)), [0, 1, 0]);
  const gap = p[1] - gy;
  const wasAir = !sim.grounded;
  if (gap < 0 || (sim.grounded && gap < 0.02)) {
    p[1] = gy;
    const vn = v[0] * n2[0] + v[1] * n2[1] + v[2] * n2[2];
    if (vn < 0) {
      v[0] -= vn * n2[0]; v[1] -= vn * n2[1]; v[2] -= vn * n2[2];
      if (wasAir && -vn > 5) {
        shed(sim, Math.min(0.3, (-vn - 5) * 0.018), 'landing');
        sim.events.push({ type: 'land', speed: -vn, p: p.slice(), r });
      }
    }
    sim.grounded = true;
  } else {
    sim.grounded = false;
    sim.stats.airtime += dt;
  }

  // Roll: angular velocity follows the contact so the ball (and what it carries) turns.
  if (sim.grounded) {
    sim.omega = [(n2[1] * v[2] - n2[2] * v[1]) / r, (n2[2] * v[0] - n2[0] * v[2]) / r, (n2[0] * v[1] - n2[1] * v[0]) / r];
  }
  const om = sim.omega, oa = Math.hypot(om[0], om[1], om[2]);
  if (oa > 1e-6) {
    const h = (oa * dt) / 2, s = Math.sin(h) / oa;
    sim.q = qmul([om[0] * s, om[1] * s, om[2] * s, Math.cos(h)], sim.q);
    const ql = Math.hypot(...sim.q);
    sim.q = sim.q.map((c) => c / ql);
  }

  accrete(sim);
  if (sim.grounded && ABRADE[surf] > 0 && speed > 1) {
    const dm = sim.snowMass * ABRADE[surf] * speed * dt;
    sim.snowMass -= dm;
    sim.acct.shed += dm;
    if (surf === SNOW.ROCK && Math.random() < 0.25) sim.events.push({ type: 'scrape', p: p.slice(), r, speed });
  }
  const T = sim.temperature();
  if (T > 0) {
    const dm = Math.min(sim.snowMass, 0.42 * T * 4 * Math.PI * r * r * dt);
    sim.snowMass -= dm;
    sim.acct.melted += dm;
  }
  collideProps(sim);
  recomputeRadius(sim);
  r = sim.r;
  finishLine(sim, dt);

  const sp = sim.speed();
  sim.stats.maxR = Math.max(sim.stats.maxR, r);
  sim.stats.maxV = Math.max(sim.stats.maxV, sp);
  if (sim.phase === 'run') {
    sim.stall = sp < 0.35 && sim.grounded ? sim.stall + dt : 0;
    if (sim.stall > 3) end(sim, false, 'stalled');
    else if (r < 0.12) end(sim, false, 'melted');
    else if (p[2] > w.zWall + 4 && !sim.curtain.broken) end(sim, false, 'bypassed');
  }
}

function accrete(sim) {
  const w = sim.world, { p, v } = sim, r = sim.r;
  const reach = r;
  const i0 = Math.max(0, Math.floor((p[0] - reach + w.GX) / CELL)), i1 = Math.min(w.cx - 1, Math.floor((p[0] + reach + w.GX) / CELL));
  const j0 = Math.max(0, Math.floor((p[2] - reach - w.z0) / CELL)), j1 = Math.min(w.cz - 1, Math.floor((p[2] + reach - w.z0) / CELL));
  let taken = 0, stuck = 0;
  const T = sim.temperature();
  const dry = T < 0 ? Math.min(1, Math.max(0.55, 0.6 + 0.4 * (T + 9) / 9)) : 1;
  for (let j = j0; j <= j1; j++) {
    const z = w.z0 + (j + 0.5) * CELL, dz = z - p[2];
    for (let i = i0; i <= i1; i++) {
      const o = i + j * w.cx, d = w.depth[o];
      if (d <= 0) continue;
      const x = -w.GX + (i + 0.5) * CELL, dx = x - p[0];
      const rho2 = dx * dx + dz * dz;
      if (rho2 >= r * r) continue;
      const yb = p[1] - Math.sqrt(r * r - rho2);
      const top = heightAt(w, x, z) + d;
      if (top - yb <= 0.002) continue;
      w.depth[o] = Math.max(0, d - (top - yb));
      // Count what the Float32 field actually lost so the books close exactly.
      const take = d - w.depth[o];
      const t = w.type[o];
      const mass = take * CELL * CELL * RHO_SNOW[t];
      taken += mass;
      stuck += mass * STICK[t] * (t === SNOW.SLUSH ? 1 : dry);
      const D = sim.dirty;
      if (i < D[0]) D[0] = i; if (j < D[1]) D[1] = j; if (i > D[2]) D[2] = i; if (j > D[3]) D[3] = j;
    }
  }
  sim.taken = taken;
  if (taken <= 0) return;
  const m = sim.mass();
  // Snow lying still has no momentum, so whatever the ball ploughs through slows it.
  const k = m / (m + taken * 0.5);
  v[0] *= k; v[1] *= k; v[2] *= k;
  sim.snowMass += stuck;
  sim.acct.stuck += stuck;
  sim.acct.sprayed += taken - stuck;
  sim.acct.removed += taken;
}

function collideProps(sim) {
  const w = sim.world, { p, v } = sim, r = sim.r;
  const b0 = Math.floor((p[2] - r - 3) / 4), b1 = Math.floor((p[2] + r + 3) / 4);
  for (let b = b0; b <= b1; b++) {
    const list = w.buckets.get(b);
    if (!list) continue;
    for (const pr of list) {
      if (pr.state !== 'up') continue;
      const P = PROPS[pr.kind];
      const dx = p[0] - pr.x, dz = p[2] - pr.z;
      const hd = Math.hypot(dx, dz);
      if (hd > r + P.radius + 0.01) continue;
      const cy = Math.min(Math.max(p[1], pr.y), pr.y + P.height);
      const ex = Math.max(0, hd - P.radius), ey = p[1] - cy;
      const dist = Math.hypot(ex, ey);
      if (dist >= r) continue;
      let nx, ny, nz;
      if (ex > 1e-4) { nx = (dx / hd) * ex / dist; nz = (dz / hd) * ex / dist; ny = ey / dist; }
      else { nx = dx / (hd || 1); nz = dz / (hd || 1); ny = 0; }
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const m = sim.mass();
      if (r >= P.absorbR) {
        absorb(sim, pr, -nx, -ny, -nz);
        const k = m / (m + P.mass);
        v[0] *= k; v[1] *= k; v[2] *= k;
        continue;
      }
      const vn = v[0] * nx + v[1] * ny + v[2] * nz;
      if (vn >= 0) continue;
      const E = impactEnergy(m, vn);
      if (E >= P.breakE) {
        const k = Math.sqrt(1 - P.breakE / E);
        const dv = vn * (1 - k);
        v[0] -= dv * nx; v[1] -= dv * ny; v[2] -= dv * nz;
        pr.state = 'down';
        pr.fallDir = Math.atan2(-nx, -nz);
        pr.fallT = sim.t;
        sim.stats.smashed++;
        if (P.hard) shed(sim, 0.03, 'smash');
        sim.events.push({ type: 'smash', prop: pr, p: p.slice(), r, energy: E });
      } else {
        v[0] -= 1.25 * vn * nx; v[1] -= 1.25 * vn * ny; v[2] -= 1.25 * vn * nz;
        const push = r - dist + 0.002;
        p[0] += nx * push; p[2] += nz * push;
        sim.stats.bounced++;
        if (-vn > 1.5) shed(sim, P.hard ? Math.min(0.25, -vn * 0.012) : Math.min(0.1, -vn * 0.004), 'bounce');
        sim.events.push({ type: 'bounce', prop: pr, p: p.slice(), r, speed: -vn });
      }
    }
  }
}

function absorb(sim, pr, nx, ny, nz) {
  const P = PROPS[pr.kind];
  const rel = [nx * sim.r * 0.92, ny * sim.r * 0.92, nz * sim.r * 0.92];
  const local = qrot(qconj(sim.q), rel);
  const half = pr.yaw / 2;
  const localQ = qmul(qconj(sim.q), [0, Math.sin(half), 0, Math.cos(half)]);
  pr.state = 'stuck';
  pr.local = local;
  pr.localQ = localQ;
  pr.capR = sim.r;
  sim.propMass += P.mass;
  sim.propVol += P.vol;
  sim.acct.props += P.mass;
  sim.stats.absorbed++;
  sim.attached.push(pr);
  sim.events.push({ type: 'absorb', prop: pr, p: sim.p.slice(), r: sim.r });
}

function finishLine(sim, dt) {
  const w = sim.world, { p, v } = sim;
  if (sim.phase === 'finishing') {
    sim.finishT += dt;
    if (sim.finishT > 2.6) end(sim, true, 'broke');
    return;
  }
  if (sim.curtain.broken || p[2] + sim.r < w.zWall) return;
  const E = impactEnergy(sim.mass(), Math.max(0, v[2]));
  sim.curtain.energy = E;
  const need = w.level.eReq;
  if (E >= need) {
    sim.curtain.broken = true;
    v[2] *= Math.sqrt(1 - (need / E) * 0.6);
    sim.phase = 'finishing';
    sim.finishT = 0;
    sim.events.push({ type: 'curtain', p: p.slice(), r: sim.r, ratio: E / need });
    sim.result = { ok: true, ratio: E / need, energy: E };
  } else {
    p[2] = w.zWall - sim.r - 0.01;
    v[2] = -0.2 * v[2];
    shed(sim, 0.15, 'curtain');
    sim.events.push({ type: 'splat', p: p.slice(), r: sim.r });
    end(sim, false, 'splat', E);
  }
}

export function medalFor(ratio) {
  if (!(ratio >= 1)) return null;
  return ratio >= 4 ? 'gold' : ratio >= 2 ? 'silver' : 'bronze';
}

function end(sim, ok, why, energy) {
  sim.phase = 'over';
  const ratio = ok ? sim.result.ratio : (energy ?? sim.energy()) / sim.world.level.eReq;
  sim.result = { ok, why, ratio, energy: energy ?? sim.result?.energy ?? sim.energy(), medal: ok ? medalFor(ratio) : null, time: sim.t };
}

// Largest prop class the ball can currently pick up, and the next one up.
export function absorbHint(r) {
  let can = null, next = null;
  for (const k of PROP_ORDER) {
    if (PROPS[k].absorbR <= r) can = k;
    else { next = k; break; }
  }
  return { can, next, needD: next ? PROPS[next].absorbR * 2 : null };
}

export function snowRemaining(w) {
  let s = 0;
  for (let o = 0; o < w.depth.length; o++) s += w.depth[o] * RHO_SNOW[w.type[o]];
  return s * CELL * CELL;
}
