import { vnoise, mulberry32 } from './noise.js';

// Signed distance to the cave wall: negative in water, positive in rock.
// Built from capsules (tunnels) and squashed spheres (chambers), each with a
// flat silt floor, blended with a smooth union and roughened with noise.
const K = 1.4;
const HC = 8;

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function buildCave(site) {
  const rand = mulberry32(site.seed);
  const nodes = site.nodes.map((n, i) => {
    const j = i === 0 || n.chamber ? 0 : 1;
    return {
      ...n,
      i,
      p: [n.p[0] + (rand() - 0.5) * 2 * j, n.p[1] + (rand() - 0.5) * 0.6 * j, n.p[2] + (rand() - 0.5) * 2 * j],
    };
  });
  const flat = site.flat;
  const prims = [];
  for (const n of nodes) {
    if (n.chamber) prims.push({ t: 's', c: n.p, r: n.r, fy: 0.55, node: n.i, open: !!n.open });
  }
  site.edges.forEach(([a, b], ei) => {
    const A = nodes[a], B = nodes[b];
    const ra = A.chamber ? Math.min(A.r * 0.4, 3.2) : A.r;
    const rb = B.chamber ? Math.min(B.r * 0.4, 3.2) : B.r;
    prims.push({ t: 'c', a: A.p, b: B.p, ra, rb, edge: ei, na: a, nb: b });
  });
  for (const P of prims) {
    if (P.t === 'c') {
      P.ba = [P.b[0] - P.a[0], P.b[1] - P.a[1], P.b[2] - P.a[2]];
      P.bb = P.ba[0] ** 2 + P.ba[1] ** 2 + P.ba[2] ** 2;
      P.len = Math.sqrt(P.bb);
      const m = Math.max(P.ra, P.rb) + K + 0.8;
      P.lo = [0, 1, 2].map((k) => Math.min(P.a[k], P.b[k]) - m);
      P.hi = [0, 1, 2].map((k) => Math.max(P.a[k], P.b[k]) + m);
    } else {
      const m = P.r + K + 0.8;
      P.lo = P.c.map((v) => v - m);
      P.hi = P.c.map((v) => v + m);
    }
  }
  const lo = [0, 1, 2].map((k) => Math.min(...prims.map((p) => p.lo[k])));
  const hi = [0, 1, 2].map((k) => Math.max(...prims.map((p) => p.hi[k])));
  const gn = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / HC) + 1);
  const hash = new Map();
  prims.forEach((P, pi) => {
    for (let x = Math.floor((P.lo[0] - lo[0]) / HC); x <= Math.floor((P.hi[0] - lo[0]) / HC); x++)
      for (let y = Math.floor((P.lo[1] - lo[1]) / HC); y <= Math.floor((P.hi[1] - lo[1]) / HC); y++)
        for (let z = Math.floor((P.lo[2] - lo[2]) / HC); z <= Math.floor((P.hi[2] - lo[2]) / HC); z++) {
          const k = x + gn[0] * (y + gn[1] * z);
          if (!hash.has(k)) hash.set(k, []);
          hash.get(k).push(pi);
        }
  });
  const cellOf = (x, y, z) => {
    const cx = Math.floor((x - lo[0]) / HC), cy = Math.floor((y - lo[1]) / HC), cz = Math.floor((z - lo[2]) / HC);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= gn[0] || cy >= gn[1] || cz >= gn[2]) return null;
    return hash.get(cx + gn[0] * (cy + gn[1] * cz)) || null;
  };

  function primDist(P, x, y, z) {
    if (P.t === 'c') {
      const px = x - P.a[0], py = y - P.a[1], pz = z - P.a[2];
      let t = (px * P.ba[0] + py * P.ba[1] + pz * P.ba[2]) / P.bb;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cy = P.a[1] + P.ba[1] * t;
      const qx = px - P.ba[0] * t, qy = (py - P.ba[1] * t) / flat, qz = pz - P.ba[2] * t;
      const r = P.ra + (P.rb - P.ra) * t;
      const d = Math.sqrt(qx * qx + qy * qy + qz * qz) - r;
      const floorY = cy - r * flat * 0.62;
      return { d: Math.max(d, floorY - y), t, r };
    }
    const qx = x - P.c[0], qy = P.open && y > P.c[1] ? 0 : (y - P.c[1]) / P.fy, qz = z - P.c[2];
    const d = (Math.sqrt(qx * qx + qy * qy + qz * qz) - P.r) * Math.min(1, P.fy * 1.4);
    const floorY = P.c[1] - P.r * P.fy * 0.6;
    return { d: Math.max(d, floorY - y), t: 0, r: P.r };
  }

  function raw(x, y, z) {
    const list = cellOf(x, y, z);
    if (!list) return { d: 9, p: -1, r: 3 };
    let d = 9, best = -1, bd = 9, br = 3;
    for (const pi of list) {
      const q = primDist(prims[pi], x, y, z);
      d = best < 0 ? q.d : smin(d, q.d, K);
      if (best < 0 || q.d < bd) { bd = q.d; best = pi; br = q.r; }
    }
    return { d, p: best, r: br };
  }

  function D(x, y, z) {
    const q = raw(x, y, z);
    if (q.p < 0) return 9;
    const amp = Math.max(0.2, Math.min(1, (q.r - 1) / 2.5));
    const n = vnoise(x * 0.32, y * 0.45, z * 0.32, site.seed) * 0.42 + vnoise(x * 0.9, y * 1.1, z * 0.9, site.seed + 7) * 0.16;
    return q.d + n * amp;
  }

  function grad(x, y, z) {
    const e = 0.12;
    const gx = D(x + e, y, z) - D(x - e, y, z);
    const gy = D(x, y + e, z) - D(x, y - e, z);
    const gz = D(x, y, z + e) - D(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  }

  function nearestPrim(x, y, z) {
    const list = cellOf(x, y, z);
    if (!list) return null;
    let best = null, bd = Infinity;
    for (const pi of list) {
      const q = primDist(prims[pi], x, y, z);
      if (q.d < bd) { bd = q.d; best = { P: prims[pi], t: q.t, r: q.r }; }
    }
    return best;
  }

  const cave = { site, nodes, prims, lo, hi, D, grad, nearestPrim, flat };
  cave.flow = buildFlow(cave);
  cave.anchors = buildAnchors(cave, rand);
  cave.perm = buildPerm(cave);
  cave.target = nodes.find((n) => n.target);
  cave.basin = nodes[0];
  return cave;
}

// Spring flow follows the graph path from the source node to the basin.
function buildFlow(cave) {
  const { site, nodes } = cave;
  const onPath = new Map();
  if (site.source >= 0 && site.flow > 0) {
    const adj = nodes.map(() => []);
    site.edges.forEach(([a, b], ei) => { adj[a].push([b, ei]); adj[b].push([a, ei]); });
    const prev = new Array(nodes.length).fill(-1);
    const seen = new Array(nodes.length).fill(false);
    const q = [0]; seen[0] = true;
    while (q.length) {
      const u = q.shift();
      for (const [v] of adj[u]) if (!seen[v]) { seen[v] = true; prev[v] = u; q.push(v); }
    }
    for (let v = site.source; prev[v] >= 0; v = prev[v]) {
      const u = prev[v];
      const ei = site.edges.findIndex(([a, b]) => (a === u && b === v) || (a === v && b === u));
      onPath.set(ei, u);
    }
  }
  return function flowAt(x, y, z) {
    if (!onPath.size) return [0, 0, 0];
    const n = cave.nearestPrim(x, y, z);
    if (!n || n.P.t !== 'c' || !onPath.has(n.P.edge)) return [0, 0, 0];
    const P = n.P;
    const s = onPath.get(P.edge) === P.na ? -1 : 1;
    const area = Math.PI * n.r * n.r * cave.flat;
    const u = (s * Math.min(1.0, site.flow / area)) / P.len;
    return [P.ba[0] * u, P.ba[1] * u, P.ba[2] * u];
  };
}

function cast(cave, o, dir, max = 12) {
  for (let s = 0.2; s < max; s += 0.12) {
    const x = o[0] + dir[0] * s, y = o[1] + dir[1] * s, z = o[2] + dir[2] * s;
    if (cave.D(x, y, z) > 0) return s;
  }
  return -1;
}

// Rock projections you can tie a line to, thicker around bends and junctions.
function buildAnchors(cave, rand) {
  const out = [];
  const add = (p, n, extra = {}) => {
    for (const a of out) if (Math.hypot(a.p[0] - p[0], a.p[1] - p[1], a.p[2] - p[2]) < 2.2) return null;
    const a = { id: out.length, p, n, ...extra };
    out.push(a);
    return a;
  };
  const ring = (c, axis, count, jitter) => {
    let ux = -axis[2], uz = axis[0];
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * Math.PI * 2 + rand() * jitter;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const dir = [ux * ca, sa * 0.8 - 0.15, uz * ca];
      const l = Math.hypot(...dir); dir[0] /= l; dir[1] /= l; dir[2] /= l;
      const s = cast(cave, c, dir);
      if (s > 0.8) add([c[0] + dir[0] * (s - 0.25), c[1] + dir[1] * (s - 0.25), c[2] + dir[2] * (s - 0.25)], dir);
    }
  };
  const B = cave.nodes[0];
  const e01 = cave.prims.find((p) => p.t === 'c' && ((p.na === 0 && p.nb === cave.site.edges[0][1]) || p.na === 0));
  {
    const d = [e01.ba[0] / e01.len, 0, e01.ba[2] / e01.len];
    const c = [B.p[0] + d[0] * B.r * 0.45, B.p[1] - 1, B.p[2] + d[2] * B.r * 0.45 + 2.2];
    const s = cast(cave, c, [0, -1, 0], 20);
    out.push({ id: 0, p: [c[0], c[1] - s + 0.3, c[2]], n: [0, -1, 0], primary: true });
  }
  for (const n of cave.nodes) {
    if (n.open) continue;
    ring(n.p, [1, 0, 0], n.chamber ? 10 : 7, 0.6);
  }
  for (const P of cave.prims) {
    if (P.t !== 'c') continue;
    const steps = Math.floor(P.len / 6);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const c = [P.a[0] + P.ba[0] * t, P.a[1] + P.ba[1] * t, P.a[2] + P.ba[2] * t];
      if (cave.D(...c) > -0.6) continue;
      ring(c, [P.ba[0] / P.len, 0, P.ba[2] / P.len], 3, 2.0);
    }
  }
  return out;
}

function buildPerm(cave) {
  const ids = cave.site.perm;
  if (!ids) return null;
  const pts = [];
  ids.forEach((id, k) => {
    const n = cave.nodes[id];
    const c = k === 0 ? [n.p[0] + n.r * 0.3, n.p[1] - 2.5, n.p[2]] : [n.p[0], n.p[1] - n.r * cave.flat * 0.3, n.p[2]];
    if (k > 0) {
      const a = pts[pts.length - 1];
      const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - 0.3, (a[2] + c[2]) / 2 + 0.4];
      if (cave.D(...m) < -0.5) pts.push(m);
    }
    pts.push(c);
  });
  const arrows = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    for (let s = 10 - acc; s < L; s += 10) {
      const t = s / L;
      arrows.push({ seg: i - 1, t, p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] });
    }
    acc = (acc + L) % 10;
  }
  return { pts, arrows };
}
