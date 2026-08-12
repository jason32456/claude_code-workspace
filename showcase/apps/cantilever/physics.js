// XPBD solver: every member is a compliant distance constraint, so the axial
// force it carries is a real number the rest of the game can read.
//
// Small-substep XPBD (many substeps, one iteration each) is what keeps stiff
// members stable without the constraints turning into pure inextensible rods —
// compliance is what lets a deck sag under a truck at all.

import { MATERIALS, capacity } from './materials.js';

const GRAVITY = 9.81;
const SUBSTEPS = 16;
const VELOCITY_DAMPING = 0.9995;
// Fraction of a member's axial relative velocity removed per substep.
const AXIAL_DAMPING = 0.12;
// The structure is created at rest with no internal forces, so gravity ramps in
// over this window and nothing may break during it. Otherwise the first substep
// is a step load that tears apart bridges which would carry the real thing.
const SETTLE_TIME = 0.8;
const STEP_UP = 0.45;
const WHEEL_RADIUS = 0.34;
const DRIVE_SPEED = 4.2; // m/s
const DRIVE_ACCEL = 12.0; // m/s²
// Applied once per substep, so it has to be gentle — anything stronger fights
// the drive and the truck settles at a fraction of its top speed.
const TANGENT_KEEP = 0.9995;

const TRUCK_MASSES = [230, 230, 370, 370]; // rear wheel, front wheel, two body corners

function particle(x, y, mass, anchored = false) {
  return { x, y, px: x, py: y, w: anchored ? 0 : 1 / mass, mass, anchored, grounded: false, r: 0 };
}

// A structure is the plain editor graph: { joints: [{x, y, anchored}], members:
// [{a, b, material}] }. The sim owns its own copy so a failed run never mutates
// the design.
export function createSim(structure, level) {
  const particles = structure.joints.map((j) => particle(j.x, j.y, 1, j.anchored));

  const members = structure.members.map((m) => {
    const a = particles[m.a];
    const b = particles[m.b];
    const rest = Math.hypot(b.x - a.x, b.y - a.y);
    const mat = MATERIALS[m.material];
    return {
      a: m.a,
      b: m.b,
      material: m.material,
      rest,
      compliance: rest / mat.ea,
      broken: false,
      lambda: 0,
      force: 0,
      ratio: 0,
    };
  });

  // Member self-weight is split between its two ends; a joint holding nothing
  // still needs a little mass so the solver never divides by zero.
  const mass = particles.map(() => 12);
  for (const m of members) {
    const half = (MATERIALS[m.material].density * m.rest) / 2;
    mass[m.a] += half;
    mass[m.b] += half;
  }
  particles.forEach((p, i) => {
    p.mass = mass[i];
    p.w = p.anchored ? 0 : 1 / mass[i];
  });

  const sim = {
    particles,
    members,
    solids: level.solids,
    goal: level.goal,
    killY: level.world.h + 4,
    truck: null,
    status: 'running',
    time: 0,
    furthest: -Infinity,
    stalled: 0,
    maxRatio: 0,
    maxRatioMember: -1,
    breaks: 0,
    events: [],
  };

  spawnTruck(sim, level.spawn);
  return sim;
}

function spawnTruck(sim, spawn) {
  const base = sim.particles.length;
  const y = spawn.y - WHEEL_RADIUS;
  const pts = [
    [spawn.x, y], // rear wheel
    [spawn.x + 1.7, y], // front wheel
    [spawn.x + 0.15, y - 1.15], // rear body
    [spawn.x + 1.55, y - 1.15], // front body
  ];
  pts.forEach((p, i) => {
    const q = particle(p[0], p[1], TRUCK_MASSES[i]);
    if (i < 2) q.r = WHEEL_RADIUS;
    sim.particles.push(q);
  });

  const links = [
    [0, 1],
    [2, 3],
    [0, 2],
    [1, 3],
    [0, 3],
    [1, 2],
  ];
  sim.truck = {
    wheels: [base, base + 1],
    parts: [base, base + 1, base + 2, base + 3],
    links: links.map(([i, j]) => {
      const a = sim.particles[base + i];
      const b = sim.particles[base + j];
      return { a: base + i, b: base + j, rest: Math.hypot(b.x - a.x, b.y - a.y), lambda: 0 };
    }),
  };
}

function integrate(sim, h, gravityScale) {
  const g = GRAVITY * gravityScale * h * h;
  for (const p of sim.particles) {
    if (p.w === 0) continue;
    const vx = (p.x - p.px) * VELOCITY_DAMPING;
    const vy = (p.y - p.py) * VELOCITY_DAMPING;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + g;
  }
}

function solveMembers(sim, h) {
  const invH2 = 1 / (h * h);
  for (const m of sim.members) {
    if (m.broken) continue;
    const a = sim.particles[m.a];
    const b = sim.particles[m.b];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    const C = len - m.rest;

    // A cable that is shorter than its rest length is slack: no constraint,
    // no force, and it draws as a curve rather than a straight line.
    if (MATERIALS[m.material].tensionOnly && C <= 0) {
      m.lambda = 0;
      m.force = 0;
      continue;
    }

    const wSum = a.w + b.w;
    if (wSum === 0) continue;
    const alpha = m.compliance * invH2;
    const dLambda = (-C - alpha * m.lambda) / (wSum + alpha);
    m.lambda += dLambda;

    const nx = dx / len;
    const ny = dy / len;
    a.x -= nx * dLambda * a.w;
    a.y -= ny * dLambda * a.w;
    b.x += nx * dLambda * b.w;
    b.y += ny * dLambda * b.w;

    // Structural damping. Without it nothing removes energy from the truss and
    // the truck's bouncing rings it up until members tear at random.
    const dv = (b.x - b.px - (a.x - a.px)) * nx + (b.y - b.py - (a.y - a.py)) * ny;
    const j = (dv * AXIAL_DAMPING) / wSum;
    a.px -= nx * j * a.w;
    a.py -= ny * j * a.w;
    b.px += nx * j * b.w;
    b.py += ny * j * b.w;
  }
}

function solveLinks(sim, h) {
  if (!sim.truck) return;
  for (const l of sim.truck.links) {
    const a = sim.particles[l.a];
    const b = sim.particles[l.b];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-6;
    const C = len - l.rest;
    const wSum = a.w + b.w;
    if (wSum === 0) continue;
    const dLambda = -C / wSum;
    const nx = dx / len;
    const ny = dy / len;
    a.x -= nx * dLambda * a.w;
    a.y -= ny * dLambda * a.w;
    b.x += nx * dLambda * b.w;
    b.y += ny * dLambda * b.w;
  }
}

// Inelastic contact: kill the velocity going into the surface, keep almost all
// of the velocity along it.
function resolveContact(p, nx, ny) {
  const vx = p.x - p.px;
  const vy = p.y - p.py;
  const vn = vx * nx + vy * ny;
  if (vn > 0) return; // already separating
  const tx = (vx - vn * nx) * TANGENT_KEEP;
  const ty = (vy - vn * ny) * TANGENT_KEEP;
  p.px = p.x - tx;
  p.py = p.y - ty;
}

function collideSolids(sim) {
  for (const p of sim.particles) {
    if (p.w === 0) continue;
    const r = p.r;
    for (const s of sim.solids) {
      if (s.ghost) continue;
      const left = p.x - (s.x - r);
      const right = s.x + s.w + r - p.x;
      const top = p.y - (s.y - r);
      const bottom = s.y + s.h + r - p.y;
      if (left <= 0 || right <= 0 || top <= 0 || bottom <= 0) continue;

      // Pick the face the particle came through, not the shallowest one. A deck
      // that sags a few centimetres below the platform would otherwise turn the
      // platform edge into a wall the truck rams instead of climbing.
      let min;
      // The generous top tolerance is a step-up allowance: a deck that has
      // sagged below the platform should be a kerb the truck climbs, not a wall
      // it rams.
      if (p.py <= s.y - r + STEP_UP) min = top;
      else if (p.py >= s.y + s.h + r - 0.05) min = bottom;
      else if (p.px <= s.x - r + 0.05) min = left;
      else if (p.px >= s.x + s.w + r - 0.05) min = right;
      else min = Math.min(left, right, top, bottom);

      if (min === top) {
        p.y = s.y - r;
        p.grounded = true;
        resolveContact(p, 0, -1);
      } else if (min === bottom) {
        p.y = s.y + s.h + r;
        resolveContact(p, 0, 1);
      } else if (min === left) {
        p.x = s.x - r;
        resolveContact(p, -1, 0);
      } else {
        p.x = s.x + s.w + r;
        resolveContact(p, 1, 0);
      }
    }
  }
}

// Wheels roll on road members: a circle-vs-segment contact whose correction is
// mass-weighted, so a heavy truck visibly pushes a light deck down.
function collideWheels(sim) {
  if (!sim.truck) return;
  for (const wi of sim.truck.wheels) {
    const p = sim.particles[wi];
    for (const m of sim.members) {
      if (m.broken || !MATERIALS[m.material].drivable) continue;
      const a = sim.particles[m.a];
      const b = sim.particles[m.b];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      if (len2 < 1e-9) continue;
      let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + abx * t;
      const cy = a.y + aby * t;
      let dx = p.x - cx;
      let dy = p.y - cy;
      let dist = Math.hypot(dx, dy);
      if (dist > WHEEL_RADIUS) continue;
      if (dist < 1e-6) {
        dx = 0;
        dy = -1;
        dist = 1e-6;
      }
      const nx = dx / dist;
      const ny = dy / dist;
      const pen = WHEEL_RADIUS - dist;

      const wSeg = (1 - t) * (1 - t) * a.w + t * t * b.w;
      const wTot = p.w + wSeg;
      if (wTot === 0) continue;

      p.x += nx * pen * (p.w / wTot);
      p.y += ny * pen * (p.w / wTot);
      const share = pen / wTot;
      a.x -= nx * share * (1 - t) * a.w;
      a.y -= ny * share * (1 - t) * a.w;
      b.x -= nx * share * t * b.w;
      b.y -= ny * share * t * b.w;

      // Contact from above is what the wheel drives on.
      if (ny < -0.2) p.grounded = true;
      resolveContact(p, nx, ny);
    }
  }
}

function drive(sim, h) {
  if (!sim.truck || sim.status !== 'running' || sim.time < SETTLE_TIME) return;
  for (const wi of sim.truck.wheels) {
    const p = sim.particles[wi];
    if (!p.grounded) continue;
    const vx = (p.x - p.px) / h;
    if (vx < DRIVE_SPEED) {
      const target = Math.min(DRIVE_SPEED, vx + DRIVE_ACCEL * h);
      p.px = p.x - target * h;
    }
  }
}

function updateForces(sim, h) {
  const invH2 = 1 / (h * h);
  sim.maxRatio = 0;
  sim.maxRatioMember = -1;
  for (let i = 0; i < sim.members.length; i++) {
    const m = sim.members[i];
    if (m.broken) continue;
    // Tension comes out positive; the solver's lambda is negative when stretched.
    m.force = -m.lambda * invH2;
    const mat = MATERIALS[m.material];
    const cap = capacity(mat, m.rest, m.force < 0);
    m.ratio = Math.abs(m.force) / cap;
    if (m.ratio > sim.maxRatio) {
      sim.maxRatio = m.ratio;
      sim.maxRatioMember = i;
    }
    if (m.ratio >= 1 && sim.time >= SETTLE_TIME) {
      const a = sim.particles[m.a];
      const b = sim.particles[m.b];
      m.broken = true;
      m.force = 0;
      m.ratio = 0;
      sim.breaks++;
      sim.events.push({ type: 'break', member: i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, at: sim.time });
    }
  }
}

function checkStatus(sim, dt) {
  if (sim.status !== 'running' || !sim.truck) return;
  const [w0, w1] = sim.truck.wheels.map((i) => sim.particles[i]);
  if (w0.y > sim.killY || w1.y > sim.killY) {
    sim.status = 'lost';
    sim.events.push({ type: 'lost', reason: 'fell', at: sim.time });
    return;
  }

  if (sim.time < SETTLE_TIME) return;

  // A truck that has stopped making progress has lost, even if nothing snapped
  // — a sag it cannot climb out of is still a failed bridge.
  const front = Math.max(w0.x, w1.x);
  if (front > sim.furthest + 0.15) {
    sim.furthest = front;
    sim.stalled = 0;
  } else {
    sim.stalled += dt;
    if (sim.stalled > 3.5) {
      sim.status = 'lost';
      sim.events.push({ type: 'lost', reason: 'stalled', at: sim.time });
      return;
    }
  }
  const g = sim.goal;
  if (w0.x > g.x && w1.x > g.x && w0.y < g.y + 1.5 && w1.y < g.y + 1.5) {
    sim.status = 'won';
    sim.events.push({ type: 'won', at: sim.time });
  }
}

export function step(sim, dt) {
  const h = dt / SUBSTEPS;

  const gravityScale = Math.min(1, (sim.time + dt) / (SETTLE_TIME * 0.6));

  for (let s = 0; s < SUBSTEPS; s++) {
    // XPBD accumulates lambda within a substep, so it resets at the top of one.
    for (const m of sim.members) m.lambda = 0;
    for (const p of sim.particles) p.grounded = false;
    integrate(sim, h, gravityScale);
    solveMembers(sim, h);
    solveLinks(sim, h);
    collideWheels(sim);
    collideSolids(sim);
    drive(sim, h);
  }

  sim.time += dt;
  updateForces(sim, h);
  checkStatus(sim, dt);
}

export const SIM_CONSTANTS = { WHEEL_RADIUS, DRIVE_SPEED, GRAVITY };
