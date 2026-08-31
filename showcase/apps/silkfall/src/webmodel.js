// The web is one particle system. Nodes are particles that many strands share;
// each strand owns the interior particles of its own rope. Solving distance
// constraints across every strand in one Gauss-Seidel pass is what lets a tug on
// one capture spiral travel into the frame that holds it.

export const SEGS = 6;

export const STRAND_TYPES = {
  frame: {
    name: 'Frame',
    costPerUnit: 1.0,
    strength: 100,
    slack: 1.006,
    sticky: 0,
    walkSpeed: 1.0,
    color: [0.52, 0.56, 0.84],
  },
  capture: {
    name: 'Capture',
    costPerUnit: 1.6,
    strength: 55,
    slack: 1.018,
    sticky: 1,
    walkSpeed: 0.78,
    color: [0.40, 0.92, 1.0],
  },
};

export const NODE_COST = 3;
const GRAVITY = -3.4;
const DAMPING = 0.965;
const ITERATIONS = 5;
// Silk is spun under tension. Without a memory of where each junction was spun,
// the whole web slowly sinks into a hammock; with it, the shape you built is the
// shape that hangs, and vibration still travels through the junctions.
const NODE_TENSION = 7.5;

let nextId = 1;

function particle(x, y, z, pinned) {
  return { x, y, z, px: x, py: y, pz: z, pinned: !!pinned };
}

export class WebModel {
  constructor() {
    this.nodes = [];
    this.strands = [];
    this.pulses = [];
    this.onSnap = null;
    this.onCollapse = null;
  }

  addNode(x, y, z = 0, anchor = false) {
    const n = particle(x, y, z, anchor);
    n.id = nextId++;
    n.anchor = anchor;
    n.strands = [];
    n.hx = x;
    n.hy = y;
    n.hz = z;
    this.nodes.push(n);
    return n;
  }

  removeNode(node) {
    const i = this.nodes.indexOf(node);
    if (i >= 0) this.nodes.splice(i, 1);
  }

  nodeDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  strandCost(a, b, type) {
    return this.nodeDistance(a, b) * STRAND_TYPES[type].costPerUnit;
  }

  // Reject a duplicate span; two strands between the same pair only ever
  // occlude each other and confuse traversal.
  connected(a, b) {
    return a.strands.some((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a));
  }

  addStrand(a, b, type) {
    if (a === b || this.connected(a, b)) return null;
    const def = STRAND_TYPES[type];
    const len = this.nodeDistance(a, b);
    const pts = [];
    for (let i = 1; i < SEGS; i++) {
      const t = i / SEGS;
      pts.push(
        particle(
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t,
          false,
        ),
      );
    }
    const strength = def.strength * (0.7 + 0.3 * Math.min(1, 8 / Math.max(1, len)));
    const s = {
      id: nextId++,
      a,
      b,
      type,
      pts,
      len0: len,
      rest: (len / SEGS) * def.slack,
      integrity: strength,
      max: strength,
      sticky: def.sticky,
      glow: 0,
      dead: false,
    };
    this.strands.push(s);
    a.strands.push(s);
    b.strands.push(s);
    return s;
  }

  chain(s) {
    return [s.a, ...s.pts, s.b];
  }

  // World position at u in [0,1] measured from a to b, read off the simulated
  // rope rather than the straight line, so the spider rides the sag.
  sample(s, u, out = {}) {
    const chain = this.chain(s);
    const f = Math.max(0, Math.min(1, u)) * SEGS;
    const i = Math.min(SEGS - 1, Math.floor(f));
    const t = f - i;
    const p = chain[i];
    const q = chain[i + 1];
    out.x = p.x + (q.x - p.x) * t;
    out.y = p.y + (q.y - p.y) * t;
    out.z = p.z + (q.z - p.z) * t;
    return out;
  }

  tangent(s, u, out = {}) {
    const chain = this.chain(s);
    const f = Math.max(0, Math.min(1, u)) * SEGS;
    const i = Math.min(SEGS - 1, Math.floor(f));
    const p = chain[i];
    const q = chain[i + 1];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    out.x = dx / d;
    out.y = dy / d;
    return out;
  }

  nearestParticle(s, u) {
    const chain = this.chain(s);
    const i = Math.round(Math.max(0, Math.min(1, u)) * SEGS);
    return chain[Math.max(0, Math.min(SEGS, i))];
  }

  tug(s, u, fx, fy, fz = 0) {
    const p = this.nearestParticle(s, u);
    if (p.pinned) return;
    p.x += fx;
    p.y += fy;
    p.z += fz;
  }

  damage(s, amount) {
    if (s.dead) return;
    s.integrity -= amount;
    if (s.integrity <= 0) this.snap(s);
  }

  snap(s) {
    if (s.dead) return;
    s.dead = true;
    const mid = this.sample(s, 0.5);
    if (this.onSnap) this.onSnap(s, mid);
    this.removeStrand(s);
    this.prune();
  }

  removeStrand(s) {
    const i = this.strands.indexOf(s);
    if (i >= 0) this.strands.splice(i, 1);
    for (const n of [s.a, s.b]) {
      const j = n.strands.indexOf(s);
      if (j >= 0) n.strands.splice(j, 1);
    }
    s.dead = true;
  }

  // A node only exists while silk still leads back to solid ground. Cutting the
  // one strand that held a limb drops the whole limb, which is the single most
  // important consequence in the game.
  prune() {
    const reached = new Set();
    const queue = [];
    for (const n of this.nodes) {
      if (n.anchor) {
        reached.add(n);
        queue.push(n);
      }
    }
    while (queue.length) {
      const n = queue.pop();
      for (const s of n.strands) {
        const other = s.a === n ? s.b : s.a;
        if (!reached.has(other)) {
          reached.add(other);
          queue.push(other);
        }
      }
    }
    const orphans = this.nodes.filter((n) => !reached.has(n));
    if (!orphans.length) return [];
    const lost = [];
    for (const n of orphans) {
      for (const s of [...n.strands]) {
        if (!s.dead) {
          lost.push(s);
          this.removeStrand(s);
        }
      }
      this.removeNode(n);
    }
    if (lost.length && this.onCollapse) this.onCollapse(lost);
    return lost;
  }

  // Splitting a strand under the cursor is how a spiral gets pinned to a radial;
  // without it you could only ever build rim-to-rim.
  splitStrand(s, u) {
    const p = this.sample(s, u);
    const node = this.addNode(p.x, p.y, p.z, false);
    const type = s.type;
    const a = s.a;
    const b = s.b;
    const wear = s.integrity / s.max;
    this.removeStrand(s);
    const s1 = this.addStrand(a, node, type);
    const s2 = this.addStrand(node, b, type);
    for (const ns of [s1, s2]) {
      if (ns) ns.integrity = ns.max * wear;
    }
    return node;
  }

  closestNode(x, y, maxDist = 1.4) {
    let best = null;
    let bd = maxDist * maxDist;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  // Returns { strand, u, dist } for the nearest point on any strand.
  closestStrand(x, y, maxDist = 1.0, filter = null) {
    let best = null;
    let bd = maxDist;
    for (const s of this.strands) {
      if (filter && !filter(s)) continue;
      const chain = this.chain(s);
      for (let i = 0; i < SEGS; i++) {
        const p = chain[i];
        const q = chain[i + 1];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const l2 = dx * dx + dy * dy;
        let t = l2 ? ((x - p.x) * dx + (y - p.y) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = p.x + dx * t;
        const cy = p.y + dy * t;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bd) {
          bd = d;
          best = { strand: s, u: (i + t) / SEGS, dist: d, x: cx, y: cy };
        }
      }
    }
    return best;
  }

  totalLength() {
    return this.strands.reduce((a, s) => a + s.len0, 0);
  }

  captureLength() {
    return this.strands.reduce((a, s) => (s.sticky ? a + s.len0 : a), 0);
  }

  integrityRatio() {
    if (!this.strands.length) return 0;
    let cur = 0;
    let max = 0;
    for (const s of this.strands) {
      cur += s.integrity;
      max += s.max;
    }
    return cur / max;
  }

  // Dijkstra from a snag point so a vibration can travel the graph rather than
  // radiate through empty air. Webs stay well under a hundred nodes.
  pulseFrom(strand, u) {
    const dist = new Map();
    const start = [
      [strand.a, strand.len0 * u],
      [strand.b, strand.len0 * (1 - u)],
    ];
    const queue = [];
    for (const [n, d] of start) {
      dist.set(n, d);
      queue.push(n);
    }
    while (queue.length) {
      queue.sort((p, q) => dist.get(p) - dist.get(q));
      const n = queue.shift();
      const base = dist.get(n);
      for (const s of n.strands) {
        const other = s.a === n ? s.b : s.a;
        const nd = base + s.len0;
        if (!dist.has(other) || nd < dist.get(other) - 1e-4) {
          dist.set(other, nd);
          queue.push(other);
        }
      }
    }
    this.pulses.push({ dist, t: 0, life: 1.9, strength: 1 });
    if (this.pulses.length > 8) this.pulses.shift();
  }

  pulseBrightness(s, u) {
    if (!this.pulses.length) return 0;
    const da = this.pulses.length;
    let out = 0;
    for (let i = 0; i < da; i++) {
      const p = this.pulses[i];
      const a = p.dist.get(s.a);
      const b = p.dist.get(s.b);
      if (a === undefined && b === undefined) continue;
      const d = Math.min(
        a === undefined ? Infinity : a + s.len0 * u,
        b === undefined ? Infinity : b + s.len0 * (1 - u),
      );
      const front = p.t * 26;
      const w = Math.abs(d - front);
      if (w < 2.4) {
        const fade = 1 - p.t / p.life;
        out += (1 - w / 2.4) * fade * p.strength;
      }
    }
    return Math.min(1.4, out);
  }

  step(dt, wind) {
    const h = Math.min(dt, 1 / 45);
    const g = GRAVITY * h * h;
    const wx = (wind ? wind.x : 0) * h * h;
    const wz = (wind ? wind.z : 0) * h * h;

    const integrate = (p) => {
      if (p.pinned) return;
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      const vz = (p.z - p.pz) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
      p.x += vx + wx;
      p.y += vy + g;
      p.z += vz + wz - p.z * 0.06;
    };

    for (const n of this.nodes) integrate(n);
    for (const s of this.strands) for (const p of s.pts) integrate(p);

    const pull = 1 - Math.exp(-NODE_TENSION * h);
    for (const n of this.nodes) {
      if (n.pinned) continue;
      n.x += (n.hx - n.x) * pull;
      n.y += (n.hy - n.y) * pull;
      n.z += (n.hz - n.z) * pull;
    }

    for (let it = 0; it < ITERATIONS; it++) {
      for (const s of this.strands) {
        const chain = this.chain(s);
        for (let i = 0; i < SEGS; i++) {
          const p = chain[i];
          const q = chain[i + 1];
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let dz = q.z - p.z;
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const diff = (d - s.rest) / d;
          const wp = p.pinned ? 0 : 1;
          const wq = q.pinned ? 0 : 1;
          const sum = wp + wq;
          if (!sum) continue;
          const kp = (wp / sum) * diff;
          const kq = (wq / sum) * diff;
          dx *= 0.5;
          dy *= 0.5;
          dz *= 0.5;
          p.x += dx * 2 * kp;
          p.y += dy * 2 * kp;
          p.z += dz * 2 * kp;
          q.x -= dx * 2 * kq;
          q.y -= dy * 2 * kq;
          q.z -= dz * 2 * kq;
        }
      }
    }

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      this.pulses[i].t += dt;
      if (this.pulses[i].t > this.pulses[i].life) this.pulses.splice(i, 1);
    }
  }
}
