// Pure simulation: terrain, sheep, dog and judge. No DOM, no Three.js, so the
// bench can run it headless.

export const DT = 1 / 60;
export const CMDS = ['comebye', 'away', 'walk', 'lie', 'steady', 'getout', 'inhere', 'thatlldo'];
export const CMD_NAME = {
  comebye: 'Come bye', away: 'Away to me', walk: 'Walk up', lie: 'Lie down',
  steady: 'Steady', getout: 'Get out', inhere: 'In here', thatlldo: "That'll do",
};
export const PHASE_NAME = { outrun: 'Outrun', lift: 'Lift', fetch: 'Fetch', drive: 'Drive', shed: 'Shed', pen: 'Pen' };

const DOG = { run: 10, flank: 8.5, walk: 2.2, inhere: 7.5, acc: 16, r: 0.35 };
const SHEEP_R = 0.45;
const REACT = 0.25;
const SPLIT_DIST = 22;
const CLUSTER_LINK = 4.5;

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Height in metres. The field rises up-slope (towards -z) and has gentle
// bumps; outside the fences the ground climbs into a bowl of hills.
export function makeTerrain(course) {
  const { slope, amp, scale } = course.terrain;
  const F = course.field, seed = course.seed;
  const cx = (F.x0 + F.x1) / 2, cz = (F.z0 + F.z1) / 2;
  const hx = (F.x1 - F.x0) / 2, hz = (F.z1 - F.z0) / 2;
  return (x, z) => {
    let h = slope * Math.max(-40, -z);
    h += amp * (vnoise(x / scale, z / scale, seed) * 1.0 + vnoise(x / (scale * 0.4), z / (scale * 0.4), seed + 7) * 0.35 - 0.67);
    // keep the area round the post and pen flat enough to stand on
    const near = Math.hypot(x, z);
    if (near < 45) h *= 0.35 + 0.65 * (near / 45);
    const ox = Math.max(0, Math.abs(x - cx) - hx - 10), oz = Math.max(0, Math.abs(z - cz) - hz - 10);
    const out = Math.hypot(ox, oz);
    if (out > 0) h += out * out * 0.0006 + out * 0.04 + vnoise(x / 90, z / 90, seed + 3) * out * 0.16;
    return h;
  };
}

function gatePosts(g) {
  const tx = -g.nz, tz = g.nx;
  return [[g.x + tx * g.w / 2, g.z + tz * g.w / 2], [g.x - tx * g.w / 2, g.z - tz * g.w / 2]];
}

// Pen corners in world space: back-left, back-right, front-right, front-left.
export function penGeometry(pen) {
  const [fx, fz] = pen.facing, tx = -fz, tz = fx;
  const hd = 2.0, hw = 2.6;
  const P = (a, b) => [pen.x + fx * a + tx * b, pen.z + fz * a + tz * b];
  return {
    hd, hw, fx, fz, tx, tz,
    bl: P(-hd, -hw), br: P(-hd, hw), fr: P(hd, hw), fl: P(hd, -hw),
    mouth: P(hd, 0), outside: P(hd + 7, 0), gateLen: 2 * hw,
    local(x, z) { const dx = x - pen.x, dz = z - pen.z; return [dx * fx + dz * fz, dx * tx + dz * tz]; },
  };
}

function buildObstacles(course) {
  const segs = [], circles = [];
  const F = course.field;
  const seg = (a, b, kind) => segs.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], kind });
  // Field boundary. The wall gap on the hill is closed by a field gate, so
  // the boundary is always whole.
  seg([F.x0, F.z0], [F.x1, F.z0], 'fence');
  seg([F.x1, F.z0], [F.x1, F.z1], 'fence');
  seg([F.x1, F.z1], [F.x0, F.z1], 'fence');
  seg([F.x0, F.z1], [F.x0, F.z0], 'fence');
  for (const g of [course.fetch, ...course.drive]) {
    const [p, q] = gatePosts(g);
    const tx = -g.nz, tz = g.nx;
    seg(p, [p[0] + tx * 2.6, p[1] + tz * 2.6], 'hurdle');
    seg(q, [q[0] - tx * 2.6, q[1] - tz * 2.6], 'hurdle');
    circles.push({ x: p[0], z: p[1], r: 0.12, kind: 'post' }, { x: q[0], z: q[1], r: 0.12, kind: 'post' });
  }
  const pg = penGeometry(course.pen);
  seg(pg.bl, pg.br, 'pen'); seg(pg.br, pg.fr, 'pen'); seg(pg.bl, pg.fl, 'pen');
  circles.push({ x: 0, z: 0, r: 0.15, kind: 'post' });
  for (const [x, z] of course.trees) {
    if (x > F.x0 && x < F.x1 && z > F.z0 && z < F.z1) circles.push({ x, z, r: 0.9, kind: 'tree' });
  }
  for (const [x, z, r] of course.gorse) circles.push({ x, z, r, kind: 'gorse' });
  return { segs, circles, pen: pg };
}

function rayToFence(f, x, z, dx, dz) {
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (f.x1 - x) / dx); else if (dx < -1e-6) t = Math.min(t, (f.x0 - x) / dx);
  if (dz > 1e-6) t = Math.min(t, (f.z1 - z) / dz); else if (dz < -1e-6) t = Math.min(t, (f.z0 - z) / dz);
  return Math.max(t, 6);
}

function closest(s, x, z) {
  const ex = s.bx - s.ax, ez = s.bz - s.az;
  const t = clamp(((x - s.ax) * ex + (z - s.az) * ez) / (ex * ex + ez * ez), 0, 1);
  return [s.ax + ex * t, s.az + ez * t];
}

function collide(o, r, obs, extraSegs, soft) {
  for (const s of extraSegs ? obs.segs.concat(extraSegs) : obs.segs) {
    const [qx, qz] = closest(s, o.x, o.z);
    const dx = o.x - qx, dz = o.z - qz, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-9) {
      const nx = dx / d, nz = dz / d;
      o.x = qx + nx * r; o.z = qz + nz * r;
      const vn = o.vx * nx + o.vz * nz;
      if (vn < 0) { o.vx -= vn * nx; o.vz -= vn * nz; }
    }
  }
  for (const c of obs.circles) {
    if (c.kind === 'gorse' && soft) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
    if (d < m && d > 1e-9) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; }
  }
}

export function createSim(course, opts = {}) {
  const rng = mulberry32(course.seed * 9973 + (opts.seed ?? 1));
  const h = makeTerrain(course);
  const obs = buildObstacles(course);
  const sheep = [];
  for (let i = 0; i < course.sheep; i++) {
    const a = rng() * Math.PI * 2, rr = 1.5 + rng() * 3.5;
    sheep.push({
      id: i,
      x: course.lift.x + Math.cos(a) * rr, z: course.lift.z + Math.sin(a) * rr,
      vx: 0, vz: 0, hd: rng() * Math.PI * 2,
      fz: course.fz[0] + rng() * (course.fz[1] - course.fz[0]),
      vmax: course.vmax * (0.9 + rng() * 0.2),
      flighty: course.flighty * (0.6 + rng() * 0.8),
      courage: i === course.wilful ? 0.72 : 0,
      drawAff: i === course.wilful ? 2 : 0.7 + rng() * 0.6,
      stress: 0, wander: rng() * Math.PI * 2, amble: rng() < 0.5 ? 1 : 0, ambleT: rng() * 6,
      breakT: 0, bx: 0, bz: 0, graze: 1, gait: rng() * 10, stamp: 0, crossed: {}, outRing: false,
    });
  }
  const dog = {
    x: 1.3, z: 0.6, vx: 0, vz: 0, hd: -Math.PI / 2,
    state: 'heel', dir: 0, steady: false, width: 0, pose: 0, gait: 0,
    tx: 0, tz: 0, stateT: 0, r0: 0, queue: [], heard: null, heardT: -9,
  };
  const phases = Object.keys(course.phases);
  const sim = {
    course, rng, h, obs, sheep, dog,
    handler: { x: 0, z: 0 },
    t: 0, clock: 0, running: false,
    phase: 'ready', phases, phaseT: 0,
    lost: Object.fromEntries(phases.map((p) => [p, 0])),
    done: Object.fromEntries(phases.map((p) => [p, false])),
    log: [],
    events: [],
    gateClosed: false,
    trail: [],
    result: null,
    j: {},
    stats: { whistles: 0, lostWhistles: 0, breaks: 0, maxSpeed: 0 },
    wind: 0,
  };
  sim.flock = flockStats(sim);
  return sim;
}

export function flockStats(sim) {
  const S = sim.sheep;
  let cx = 0, cz = 0, vx = 0, vz = 0, fz = 0;
  for (const s of S) { cx += s.x; cz += s.z; vx += s.vx; vz += s.vz; fz += s.fz; }
  const n = S.length;
  cx /= n; cz /= n; vx /= n; vz /= n; fz /= n;
  let r = 0, far = 0;
  for (const s of S) { const d = Math.hypot(s.x - cx, s.z - cz); r = Math.max(r, d); far = Math.max(far, d); }
  return { x: cx, z: cz, vx, vz, speed: Math.hypot(vx, vz), r: Math.min(r, 14), far, fz };
}

export function flankRadius(sim) {
  const F = sim.flock;
  return Math.max(F.r, 2) + 0.85 * F.fz + sim.dog.width;
}

// --- Commands -------------------------------------------------------------

export function whistle(sim, cmd) {
  if (sim.result || !CMDS.includes(cmd)) return;
  const d = Math.hypot(sim.dog.x, sim.dog.z);
  let lost = false;
  if (sim.course.wind > 0 && sim.dog.state !== 'heel') {
    const pLost = sim.course.wind * Math.max(0, sim.wind - 0.35) / 0.65 * clamp((d - 60) / 120, 0, 1);
    lost = sim.rng() < pLost;
  }
  sim.stats.whistles++;
  sim.events.push({ type: 'whistle', cmd, lost });
  if (lost) { sim.stats.lostWhistles++; return; }
  sim.dog.queue.push({ cmd, at: sim.t + REACT });
}

function deduct(sim, phase, pts, why) {
  if (!sim.course.phases[phase] || sim.done[phase] && phase !== sim.phase) return;
  const max = sim.course.phases[phase];
  const take = Math.min(pts, max - sim.lost[phase]);
  if (take <= 0) return;
  sim.lost[phase] += take;
  sim.log.push({ t: sim.clock, phase, pts: take, why });
  sim.events.push({ type: 'deduct', phase, pts: take, why });
}

function applyCommand(sim, cmd) {
  const dog = sim.dog;
  dog.heard = cmd; dog.heardT = sim.t;
  sim.events.push({ type: 'heard', cmd });
  if (sim.phase === 'ready') {
    if (cmd === 'comebye' || cmd === 'away') {
      sim.running = true;
      enterPhase(sim, 'outrun');
      const F = sim.flock;
      dog.state = 'outrun'; dog.dir = cmd === 'comebye' ? 1 : -1;
      dog.r0 = Math.hypot(dog.x - F.x, dog.z - F.z);
      dog.steady = false;
    }
    return;
  }
  const inOutrun = sim.phase === 'outrun';
  switch (cmd) {
    case 'comebye': case 'away': {
      const dir = cmd === 'comebye' ? 1 : -1;
      if (inOutrun) {
        if (dog.state === 'outrun' && dog.dir !== dir) deduct(sim, 'outrun', 3, 'redirected on the outrun');
        dog.state = 'outrun';
      } else dog.state = 'flank';
      dog.dir = dir; dog.steady = false;
      break;
    }
    case 'walk':
      if (inOutrun) finishOutrun(sim, true);
      dog.state = 'walk'; dog.steady = false; dog.width = 0;
      break;
    case 'lie':
      if (inOutrun && dog.state === 'outrun') deduct(sim, 'outrun', 2, 'stopped on the outrun');
      dog.state = 'lie'; dog.steady = false;
      break;
    case 'steady': dog.steady = true; break;
    case 'getout':
      if (dog.width < 18) dog.width += 6;
      if (inOutrun) deduct(sim, 'outrun', 1, 'had to be pushed out');
      break;
    case 'inhere': {
      const F = sim.flock;
      const dx = F.x - dog.x, dz = F.z - dog.z, d = Math.hypot(dx, dz) || 1;
      dog.state = 'inhere'; dog.stateT = 0;
      dog.tx = F.x + dx / d; dog.tz = F.z + dz / d;
      break;
    }
    case 'thatlldo': dog.state = 'recall'; dog.width = 0; break;
  }
}

// --- Dog ------------------------------------------------------------------

function stepDog(sim) {
  const dog = sim.dog, F = sim.flock;
  while (dog.queue.length && dog.queue[0].at <= sim.t) applyCommand(sim, dog.queue.shift().cmd);
  dog.stateT += DT;
  let dvx = 0, dvz = 0;
  const sp = (v) => v * (dog.steady ? 0.45 : 1);
  const toC = [F.x - dog.x, F.z - dog.z], dC = Math.hypot(toC[0], toC[1]) || 1e-6;
  const th = Math.atan2(dog.z - F.z, dog.x - F.x);
  let avoidSheep = true;

  if (dog.state === 'heel') {
    dvx = (sim.handler.x + 1.3 - dog.x) * 2; dvz = (sim.handler.z + 0.6 - dog.z) * 2;
  } else if (dog.state === 'outrun' || dog.state === 'flank') {
    let R = flankRadius(sim);
    let speed = sp(dog.state === 'outrun' ? DOG.run : DOG.flank);
    if (dog.state === 'outrun') {
      const c = sim.course;
      const Rt = Math.max(F.r, 2) + F.fz * (0.85 - c.dog.eager * 0.6) + dog.width;
      const ax = sim.handler.x - F.x, az = sim.handler.z - F.z, an = Math.hypot(ax, az);
      const cos = clamp(((dog.x - F.x) * ax + (dog.z - F.z) * az) / (an * dC), -1, 1);
      const phi = Math.acos(cos);
      const k = 1.4 + c.dog.eager * 2.5;
      R = Rt + (Math.max(dog.r0, Rt) - Rt) * Math.pow(Math.cos(phi / 2), k) + dog.width * 0.5;
      sim.j.outrunPhi = phi;
      if (phi > Math.PI - 0.1) { finishOutrun(sim, false); dog.state = 'lie'; }
    }
    const tx = -Math.sin(th) * dog.dir, tz = Math.cos(th) * dog.dir;
    const rx = (dog.x - F.x) / dC, rz = (dog.z - F.z) / dC;
    R = Math.min(R, rayToFence(sim.course.field, F.x, F.z, rx, rz) - 4);
    const err = R - dC; // positive: too close, push out
    const radial = clamp(err * 0.5, -1.2, 1.6);
    let vx = tx + rx * radial, vz = tz + rz * radial;
    const n = Math.hypot(vx, vz) || 1;
    dvx = vx / n * speed; dvz = vz / n * speed;
  } else if (dog.state === 'walk') {
    let near = Infinity;
    for (const s of sim.sheep) near = Math.min(near, Math.hypot(s.x - dog.x, s.z - dog.z));
    const speed = sp(DOG.walk) * clamp((near - 3) / 2.5, 0, 1);
    dvx = toC[0] / dC * speed; dvz = toC[1] / dC * speed;
  } else if (dog.state === 'inhere') {
    avoidSheep = false;
    const dx = dog.tx - dog.x, dz = dog.tz - dog.z, d = Math.hypot(dx, dz);
    if (d < 1.2 || dog.stateT > 5) { dog.state = 'hold'; dog.stateT = 0; dog.hold = pickHoldGroup(sim); }
    else { dvx = dx / d * sp(DOG.inhere); dvz = dz / d * sp(DOG.inhere); }
  } else if (dog.state === 'hold' && dog.hold && dog.stateT < 6) {
    const g = dog.hold.map((i) => sim.sheep[i]);
    let gx = 0, gz = 0, near = Infinity;
    for (const s of g) { gx += s.x / g.length; gz += s.z / g.length; near = Math.min(near, Math.hypot(s.x - dog.x, s.z - dog.z)); }
    const dx = gx - dog.x, dz = gz - dog.z, d = Math.hypot(dx, dz) || 1;
    const speed = sp(1.6) * clamp((near - 4) / 2, 0, 1);
    dvx = dx / d * speed; dvz = dz / d * speed;
  } else if (dog.state === 'recall') {
    const dx = sim.handler.x + 1.3 - dog.x, dz = sim.handler.z + 0.6 - dog.z, d = Math.hypot(dx, dz);
    if (d < 0.8) dog.state = 'heel';
    else { const s = Math.min(sp(7), d * 2); dvx = dx / d * s; dvz = dz / d * s; }
  }
  // lie / hold: stop

  const wantX = dvx, wantZ = dvz;
  if (avoidSheep && dog.state !== 'heel') {
    for (const s of sim.sheep) {
      const dx = dog.x - s.x, dz = dog.z - s.z, d = Math.hypot(dx, dz);
      if (d < 2.2 && d > 1e-6) { dvx += dx / d * (2.2 - d) * 3; dvz += dz / d * (2.2 - d) * 3; }
    }
  }
  for (const c of sim.obs.circles) {
    if (c.kind === 'post' && dog.state === 'heel') continue;
    const dx = dog.x - c.x, dz = dog.z - c.z, d = Math.hypot(dx, dz), m = c.r + (c.kind === 'post' ? 1 : 2);
    if (d < m && d > 1e-6) { dvx += dx / d * (m - d) * 2.5; dvz += dz / d * (m - d) * 2.5; }
  }
  // Slide round hurdles and pen sides rather than pressing into them.
  for (const g of sim.obs.segs) {
    if (g.kind === 'fence') continue;
    const [qx, qz] = closest(g, dog.x, dog.z);
    const dx = dog.x - qx, dz = dog.z - qz, d = Math.hypot(dx, dz);
    if (d > 1.5 || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d, vn = dvx * nx + dvz * nz;
    if (vn >= 0) continue;
    const ex = g.bx - g.ax, ez = g.bz - g.az, el = Math.hypot(ex, ez);
    const along = (wantX * ex + wantZ * ez) / el;
    const toB = Math.abs(along) > 0.2 ? Math.sign(along) : (dog.x - g.ax) * ex + (dog.z - g.az) * ez > el * el / 2 ? 1 : -1;
    const slide = Math.max(-vn, 1.5);
    dvx += -vn * nx + ex / el * toB * slide; dvz += -vn * nz + ez / el * toB * slide;
  }
  let inGorse = false;
  for (const c of sim.obs.circles) if (c.kind === 'gorse' && Math.hypot(dog.x - c.x, dog.z - c.z) < c.r) inGorse = true;
  if (inGorse) { dvx *= 0.45; dvz *= 0.45; }

  const ax = dvx - dog.vx, az = dvz - dog.vz, a = Math.hypot(ax, az);
  const amax = (dog.state === 'lie' || dog.state === 'hold' ? 22 : DOG.acc) * DT;
  if (a > amax) { dog.vx += ax / a * amax; dog.vz += az / a * amax; } else { dog.vx = dvx; dog.vz = dvz; }
  dog.x += dog.vx * DT; dog.z += dog.vz * DT;
  collide(dog, DOG.r, sim.obs, null, true);
  const spd = Math.hypot(dog.vx, dog.vz);
  if (spd > 0.25) dog.hd = Math.atan2(dog.vz, dog.vx);
  else if (dog.state !== 'heel') dog.hd += wrap(Math.atan2(F.z - dog.z, F.x - dog.x) - dog.hd) * Math.min(1, DT * 3);
  else dog.hd += wrap(-Math.PI / 2 - dog.hd) * Math.min(1, DT * 3);
  dog.gait += spd * DT;
  const down = (dog.state === 'lie' || dog.state === 'hold') && spd < 0.6 ? 1 : 0;
  dog.pose += (down - dog.pose) * Math.min(1, DT * 6);
}

// Once through the gap, the dog turns on the smaller group and holds it off.
function pickHoldGroup(sim) {
  const dog = sim.dog, groups = clusters(sim.sheep);
  if (groups.length < 2) return null;
  return groups[groups.length - 1].map((s) => s.id);
}

// --- Sheep ----------------------------------------------------------------

function stepSheep(sim) {
  const S = sim.sheep, dog = sim.dog, c = sim.course, rng = sim.rng;
  const dogSpd = Math.hypot(dog.vx, dog.vz);
  const sf = 0.55 + 0.45 * Math.min(1, dogSpd / 6);
  const H = sim.handler;
  const penOpen = !sim.gateClosed;
  for (const s of S) {
    let cx = 0, cz = 0, n = 0, avx = 0, avz = 0, sx = 0, sz = 0, sn = 0;
    for (const o of S) {
      if (o === s) continue;
      const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz);
      if (d < 30) { cx += o.x; cz += o.z; n++; avx += o.vx; avz += o.vz; sn += o.stress; }
      if (d < 1.6 && d > 1e-6) { sx -= dx / d * (1.6 - d) / 1.6; sz -= dz / d * (1.6 - d) / 1.6; }
    }
    const ddx = s.x - dog.x, ddz = s.z - dog.z, dd = Math.hypot(ddx, ddz) || 1e-6;
    let p = dog.state === 'heel' ? 0 : clamp(1 - dd / s.fz, 0, 1) * sf;
    s.stamp = 0;
    if (s.courage > 0 && p > 0 && dogSpd < 1.4) { p *= 1 - s.courage; s.stamp = 1; }
    const dh = Math.hypot(s.x - H.x, s.z - H.z), ph = clamp(1 - dh / 6, 0, 1);
    s.pressure = p;

    const target = Math.min(1, Math.max(p * 1.7, n ? (sn / n) * 0.65 : 0));
    s.stress += (target - s.stress) * (target > s.stress ? 2.5 : 0.25) * DT;

    let vx = 0, vz = 0;
    const fx = ddx / dd, fzv = ddz / dd;
    const pe = Math.max(0, p - 0.04) / 0.96;
    const spdNow = Math.hypot(s.vx, s.vz);
    // A dog darting through the flock parts it: sheep in its path step aside
    // rather than run ahead of it.
    const along = -(fx * dog.vx + fzv * dog.vz) / (dogSpd || 1) * -dd;
    const lat = (ddx * -dog.vz + ddz * dog.vx) / (dogSpd || 1);
    if (dog.state === 'inhere' && dogSpd > 1 && along > -2 && along < s.fz && Math.abs(lat) < 8) {
      const side = lat >= 0 ? 1 : -1, speed = s.vmax * 0.85;
      vx += -dog.vz / dogSpd * side * speed + dog.vx / dogSpd * 0.6;
      vz += dog.vx / dogSpd * side * speed + dog.vz / dogSpd * 0.6;
    } else if (pe > 0) {
      const hx = Math.cos(s.hd), hz = Math.sin(s.hd), w = 0.35 * Math.min(1, spdNow / s.vmax);
      let ux = fx + hx * w, uz = fzv + hz * w; const un = Math.hypot(ux, uz) || 1;
      const speed = s.vmax * Math.pow(pe, 0.75);
      vx += ux / un * speed; vz += uz / un * speed;
    }
    if (ph > 0) { vx += (s.x - H.x) / (dh || 1) * ph * 2.5; vz += (s.z - H.z) / (dh || 1) * ph * 2.5; }
    if (n) {
      const tx = cx / n - s.x, tz = cz / n - s.z, dc = Math.hypot(tx, tz) || 1e-6;
      let w = (0.25 + 3 * s.stress) * clamp((dc - 1.2) / 4, 0, 1.6);
      // A ewe will not walk past the dog to rejoin the others.
      if (dog.state !== 'heel') {
        const k = clamp(((dog.x - s.x) * tx + (dog.z - s.z) * tz) / (dc * dc), 0, 1);
        if (Math.hypot(s.x + tx * k - dog.x, s.z + tz * k - dog.z) < 3.5) w = 0;
      }
      vx += tx / dc * w; vz += tz / dc * w;
      vx += avx / n * 0.45 * s.stress; vz += avz / n * 0.45 * s.stress;
    }
    vx += sx * 2.5; vz += sz * 2.5;
    if (c.draw && c.draw.k > 0) {
      const gx = c.draw.x - s.x, gz = c.draw.z - s.z, gd = Math.hypot(gx, gz) || 1;
      const k = c.draw.k * s.drawAff * (1 - Math.min(1, p * 2.5)) * (sim.running && sim.phase !== 'outrun' ? 1 : 0.15);
      vx += gx / gd * k; vz += gz / gd * k;
    }
    const calm = 1 - Math.min(1, s.stress * 4);
    s.ambleT -= DT;
    if (s.ambleT < 0) { s.amble = 1 - s.amble; s.ambleT = s.amble ? 2 + rng() * 4 : 3 + rng() * 7; }
    s.wander += (rng() - 0.5) * 2.4 * DT * 3;
    vx += Math.cos(s.wander) * 0.32 * calm * s.amble; vz += Math.sin(s.wander) * 0.32 * calm * s.amble;

    for (const g of sim.obs.segs) {
      const [qx, qz] = closest(g, s.x, s.z);
      const dx = s.x - qx, dz = s.z - qz, d = Math.hypot(dx, dz);
      const range = g.kind === 'pen' ? 0.9 : 1.8;
      if (d < range && d > 1e-6) { vx += dx / d * (range - d) * 1.6; vz += dz / d * (range - d) * 1.6; }
    }
    for (const o of sim.obs.circles) {
      const dx = s.x - o.x, dz = s.z - o.z, d = Math.hypot(dx, dz), m = o.r + (o.kind === 'gorse' ? 1.6 : 0.8);
      if (d < m && d > 1e-6) { vx += dx / d * (m - d) * 1.8; vz += dz / d * (m - d) * 1.8; }
    }

    if (s.breakT > 0) {
      s.breakT -= DT;
      vx = s.bx * s.vmax * 1.05 + vx * 0.25; vz = s.bz * s.vmax * 1.05 + vz * 0.25;
    } else if (s.stress > 0.7 && p > 0.42 && dog.state !== 'inhere' && dog.state !== 'hold' && rng() < DT * s.flighty * 0.9) {
      const side = rng() < 0.5 ? -1 : 1;
      const gx = c.draw.x - s.x, gz = c.draw.z - s.z, gd = Math.hypot(gx, gz) || 1;
      let bx = fx - fzv * side * 0.9 + gx / gd * 0.6, bz = fzv + fx * side * 0.9 + gz / gd * 0.6;
      const bn = Math.hypot(bx, bz) || 1;
      s.bx = bx / bn; s.bz = bz / bn; s.breakT = 2.5 + rng() * 1.5;
      sim.stats.breaks++;
      sim.events.push({ type: 'break', id: s.id });
      if (['lift', 'fetch', 'drive', 'pen'].includes(sim.phase)) deduct(sim, sim.phase, sim.phase === 'lift' ? 3 : 2, 'a ewe broke away');
    }

    const ax = vx - s.vx, az = vz - s.vz, a = Math.hypot(ax, az);
    const amax = (1.5 + 8 * Math.max(s.stress, s.breakT > 0 ? 1 : 0)) * DT;
    if (a > amax) { s.vx += ax / a * amax; s.vz += az / a * amax; } else { s.vx = vx; s.vz = vz; }
    const cap = s.vmax * (s.breakT > 0 ? 1.1 : 1), v = Math.hypot(s.vx, s.vz);
    if (v > cap) { s.vx *= cap / v; s.vz *= cap / v; }
  }
  const gateSeg = sim.gateClosed ? [{ ax: sim.obs.pen.fl[0], az: sim.obs.pen.fl[1], bx: sim.obs.pen.fr[0], bz: sim.obs.pen.fr[1] }] : null;
  for (const s of S) {
    const px = s.x, pz = s.z;
    s.x += s.vx * DT; s.z += s.vz * DT;
    if (dog.state === 'inhere' || dog.state === 'hold') {
      const dx = s.x - dog.x, dz = s.z - dog.z, d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 1e-6) { s.x = dog.x + dx / d * 1.1; s.z = dog.z + dz / d * 1.1; }
    }
    collide(s, SHEEP_R, sim.obs, gateSeg, false);
    const v = Math.hypot(s.vx, s.vz);
    if (v > 0.12) s.hd += wrap(Math.atan2(s.vz, s.vx) - s.hd) * Math.min(1, DT * 6);
    s.gait += v * DT;
    s.graze += ((v < 0.4 && s.stress < 0.15 ? 1 : 0) - s.graze) * Math.min(1, DT * 2);
    s.px = px; s.pz = pz;
    sim.stats.maxSpeed = Math.max(sim.stats.maxSpeed, v);
  }
  for (let i = 0; i < S.length; i++) for (let k = i + 1; k < S.length; k++) {
    const a = S[i], b = S[k], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = SHEEP_R * 2;
    if (d < m && d > 1e-6) { const push = (m - d) / 2; a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push; }
  }
  const F = c.field;
  for (const s of S) {
    s.x = clamp(s.x, F.x0 + SHEEP_R, F.x1 - SHEEP_R); s.z = clamp(s.z, F.z0 + SHEEP_R, F.z1 - SHEEP_R);
  }
}

// --- Judge ----------------------------------------------------------------

function enterPhase(sim, p) {
  sim.phase = p;
  sim.phaseT = 0;
  const F = sim.flock, c = sim.course;
  const j = (sim.j = { ...sim.j, legs: null, leg: 0, nextSample: 8, maxProg: 0, splitT: 0 });
  if (p === 'outrun') j.minGap = Infinity;
  if (p === 'lift') { j.liftX = F.x; j.liftZ = F.z; j.peak = 0; }
  if (p === 'fetch') j.legs = [{ ax: j.liftX, az: j.liftZ, gate: c.fetch }, { gate: null, bx: 0, bz: 0, end: 'post' }];
  if (p === 'drive') {
    const legs = c.drive.map((g) => ({ gate: g }));
    if (c.ring) legs.push({ gate: null, bx: c.ring.x, bz: c.ring.z, end: 'ring' });
    else { const o = sim.obs.pen.outside; legs.push({ gate: null, bx: o[0], bz: o[1], end: 'pen' }); }
    legs[0].ax = 0; legs[0].az = 0;
    j.legs = legs;
  }
  if (p === 'shed') { j.hold = 0; }
  if (p === 'pen') { j.nearMouth = false; }
  for (const s of sim.sheep) s.crossed = {};
  if (j.legs) for (let i = 0; i < j.legs.length; i++) {
    const L = j.legs[i];
    if (L.gate) { L.bx = L.gate.x; L.bz = L.gate.z; }
    if (i > 0) { L.ax = j.legs[i - 1].bx; L.az = j.legs[i - 1].bz; }
  }
  sim.events.push({ type: 'phase', phase: p });
}

function finishPhase(sim) {
  const p = sim.phase;
  sim.done[p] = true;
  const i = sim.phases.indexOf(p);
  const next = sim.phases[i + 1];
  if (next) enterPhase(sim, next);
  else finishRun(sim, 'penned');
}

function finishOutrun(sim, short) {
  if (sim.phase !== 'outrun') return;
  const j = sim.j, F = sim.flock;
  if (short) {
    const phi = j.outrunPhi ?? 0;
    deduct(sim, 'outrun', Math.round((Math.PI - phi) / Math.PI * 12), 'stopped short of the top');
  }
  if (j.minGap < 0.85 * F.fz) {
    const pts = Math.round(clamp((0.85 * F.fz - j.minGap) / F.fz * 22, 0, 10));
    if (pts > 0) deduct(sim, 'outrun', pts, 'came in tight on the sheep');
  }
  finishPhase(sim);
}

// Where the judge wants the flock to go next.
export function currentTarget(sim) {
  const j = sim.j, c = sim.course;
  if (sim.phase === 'shed' && c.ring) return { x: c.ring.x, z: c.ring.z };
  if (sim.phase === 'pen') {
    const pg = sim.obs.pen, F = sim.flock;
    const [a] = pg.local(F.x, F.z);
    if (a > pg.hd + 4.5) return { x: pg.outside[0] - pg.fx * 3, z: pg.outside[1] - pg.fz * 3 };
    return { x: c.pen.x - pg.fx * 1.5, z: c.pen.z - pg.fz * 1.5 };
  }
  if (!j.legs) return { x: 0, z: 0 };
  const L = j.legs[j.leg];
  if (L.gate) return { x: L.gate.x + L.gate.nx * 10, z: L.gate.z + L.gate.nz * 10 };
  return { x: L.bx, z: L.bz };
}

function judgeLegs(sim) {
  const j = sim.j, F = sim.flock, L = j.legs[j.leg];
  const ex = L.bx - L.ax, ez = L.bz - L.az, len = Math.hypot(ex, ez) || 1;
  const ux = ex / len, uz = ez / len;
  const prog = (F.x - L.ax) * ux + (F.z - L.az) * uz;
  const dev = Math.abs((F.x - L.ax) * uz - (F.z - L.az) * ux);
  if (prog > j.maxProg) j.maxProg = prog;
  while (j.maxProg >= j.nextSample && j.nextSample < len - 4) {
    if (dev > 14) deduct(sim, sim.phase, 2, 'well off line');
    else if (dev > 6) deduct(sim, sim.phase, 1, 'off line');
    j.nextSample += 8;
  }
  if (F.far > SPLIT_DIST) {
    j.splitT += DT;
    if (j.splitT > 5) { deduct(sim, sim.phase, 1, 'flock split'); j.splitT = 0; }
  } else j.splitT = Math.max(0, j.splitT - DT);

  if (L.gate) {
    const g = L.gate, tx = -g.nz, tz = g.nx;
    for (const s of sim.sheep) {
      if (s.crossed[j.leg]) continue;
      const sNow = (s.x - g.x) * g.nx + (s.z - g.z) * g.nz, sPrev = (s.px - g.x) * g.nx + (s.pz - g.z) * g.nz;
      if (sPrev < 0 && sNow >= 0) {
        const lat = Math.abs((s.x - g.x) * tx + (s.z - g.z) * tz);
        s.crossed[j.leg] = lat <= g.w / 2 ? 'through' : 'outside';
      }
    }
    const cs = (F.x - g.x) * g.nx + (F.z - g.z) * g.nz;
    if (cs > 6) {
      const thr = sim.sheep.filter((s) => s.crossed[j.leg] === 'through').length;
      const n = sim.sheep.length;
      if (thr === n) sim.events.push({ type: 'gate', ok: true });
      else if (thr === 0) { deduct(sim, sim.phase, 5, 'missed the gate'); sim.events.push({ type: 'gate', ok: false }); }
      else { deduct(sim, sim.phase, 3, `${n - thr} missed the gate`); sim.events.push({ type: 'gate', ok: false }); }
      advanceLeg(sim);
    }
  } else {
    const d = Math.hypot(F.x - L.bx, F.z - L.bz);
    const R = L.end === 'post' ? 14 : L.end === 'ring' ? sim.course.ring.r - 3 : 9;
    if (d < R) advanceLeg(sim);
  }
}

function advanceLeg(sim) {
  const j = sim.j;
  j.leg++;
  j.nextSample = 8; j.maxProg = 0;
  if (j.leg >= j.legs.length) finishPhase(sim);
}

export function clusters(sheep, link = CLUSTER_LINK) {
  const n = sheep.length, id = sheep.map((_, i) => i);
  const find = (i) => (id[i] === i ? i : (id[i] = find(id[i])));
  for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) {
    if (Math.hypot(sheep[i].x - sheep[k].x, sheep[i].z - sheep[k].z) < link) id[find(i)] = find(k);
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(sheep[i]); }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function judge(sim) {
  const p = sim.phase, j = sim.j, F = sim.flock, dog = sim.dog;
  sim.phaseT += DT;
  if (p === 'outrun') {
    let near = Infinity;
    for (const s of sim.sheep) near = Math.min(near, Math.hypot(s.x - dog.x, s.z - dog.z));
    j.minGap = Math.min(j.minGap, near);
    // Sheep that start moving before the dog is round have lifted themselves.
    if (F.speed > 1.8) finishOutrun(sim, true);
  } else if (p === 'lift') {
    for (const s of sim.sheep) j.peak = Math.max(j.peak, Math.hypot(s.vx, s.vz));
    if (Math.hypot(F.x - j.liftX, F.z - j.liftZ) > 12) {
      if (j.peak > 4.2) deduct(sim, 'lift', 4, 'sheep ran at the lift');
      else if (j.peak > 3) deduct(sim, 'lift', 2, 'a hurried lift');
      const slow = Math.floor(Math.max(0, sim.phaseT - 20) / 10);
      if (slow) deduct(sim, 'lift', slow, 'a slow lift');
      finishPhase(sim);
    }
  } else if (p === 'fetch' || p === 'drive') {
    judgeLegs(sim);
  } else if (p === 'shed') {
    const ring = sim.course.ring;
    for (const s of sim.sheep) {
      const out = Math.hypot(s.x - ring.x, s.z - ring.z) > ring.r + 5;
      if (out && !s.outRing) deduct(sim, 'shed', 1, 'a ewe left the ring');
      s.outRing = out;
    }
    if (sim.phaseT > 45 && Math.floor((sim.phaseT - DT - 45) / 10) !== Math.floor((sim.phaseT - 45) / 10)) deduct(sim, 'shed', 1, 'slow to shed');
    const groups = clusters(sim.sheep);
    let ok = false;
    if (groups.length >= 2 && ['hold', 'lie', 'walk'].includes(dog.state) && sim.sheep.every((s) => s.breakT <= 0)) {
      const a = groups[0], b = groups[1];
      const cen = (g) => [g.reduce((t, s) => t + s.x, 0) / g.length, g.reduce((t, s) => t + s.z, 0) / g.length];
      const [ax, az] = cen(a), [bx, bz] = cen(b);
      const inRing = Math.hypot(ax - ring.x, az - ring.z) < ring.r + 6 && Math.hypot(bx - ring.x, bz - ring.z) < ring.r + 6;
      let gap = Infinity;
      for (const s of a) for (const t of b) gap = Math.min(gap, Math.hypot(s.x - t.x, s.z - t.z));
      ok = inRing && gap >= 5 && b.length >= (sim.course.shedMin ?? 1);
    }
    j.hold = ok ? j.hold + DT : 0;
    j.shedOk = ok;
    if (j.hold >= 2.5) { sim.events.push({ type: 'shed' }); finishPhase(sim); }
  } else if (p === 'pen') {
    const pg = sim.obs.pen;
    let inside = 0, minA = Infinity;
    for (const s of sim.sheep) {
      const [a, b] = pg.local(s.x, s.z);
      if (a > -pg.hd && a < pg.hd - 0.2 && Math.abs(b) < pg.hw) inside++;
      minA = Math.min(minA, Math.hypot(s.x - pg.mouth[0], s.z - pg.mouth[1]));
    }
    j.inside = inside;
    if (minA < 4) j.nearMouth = true;
    if (j.nearMouth && minA > 12) { deduct(sim, 'pen', 2, 'broke from the pen mouth'); j.nearMouth = false; }
    if (sim.phaseT > 50 && Math.floor((sim.phaseT - DT - 50) / 10) !== Math.floor((sim.phaseT - 50) / 10)) deduct(sim, 'pen', 1, 'slow at the pen');
    if (inside === sim.sheep.length) {
      sim.gateClosed = true;
      sim.events.push({ type: 'penned' });
      finishPhase(sim);
    }
  }
}

function finishRun(sim, why) {
  if (sim.result) return;
  let score = 0, max = 0;
  const card = sim.phases.map((p) => {
    const m = sim.course.phases[p];
    max += m;
    const got = sim.done[p] ? m - sim.lost[p] : 0;
    score += got;
    return { phase: p, max: m, got, done: sim.done[p] };
  });
  const pct = score / max;
  const placing = why !== 'penned' ? null : pct >= 0.85 ? '1st' : pct >= 0.7 ? '2nd' : pct >= 0.55 ? '3rd' : null;
  sim.result = { why, score, max, pct, placing, card, time: sim.clock };
  sim.phase = 'over';
  sim.events.push({ type: 'over', why });
}

export function retire(sim) { finishRun(sim, 'retired'); }

export function step(sim) {
  if (sim.result) {
    sim.t += DT;
    stepDog(sim); stepSheep(sim);
    sim.flock = flockStats(sim);
    return;
  }
  sim.t += DT;
  if (sim.running) sim.clock += DT;
  const tt = sim.t;
  sim.wind = 0.5 + 0.5 * Math.sin(tt * 0.31 + Math.sin(tt * 0.113) * 2.4) * Math.sin(tt * 0.071 + 1.3);
  sim.flock = flockStats(sim);
  stepDog(sim);
  stepSheep(sim);
  sim.flock = flockStats(sim);
  if (sim.running) judge(sim);
  if (sim.running && Math.round(sim.t / DT) % 30 === 0 && sim.phase !== 'over') {
    sim.trail.push([sim.flock.x, sim.flock.z]);
    if (sim.trail.length > 600) sim.trail.shift();
  }
  if (sim.running && !sim.result && sim.clock >= sim.course.timeLimit) finishRun(sim, 'time');
}
