// Drawing. Two pictures of one object: the cable as a physical object, and the
// same thing as a knot diagram with breaks at the under-crossings.
//
// The break is what makes a knot diagram readable, and it is not decoration --
// it is the over/under information, which is the only thing distinguishing a
// knot from a closed curve drawn on paper.

import { project } from './diagram.js';
import { v3 } from './geom.js';

export function fit(flat, w, h, pad = 26) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of flat) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const sx = (w - 2 * pad) / Math.max(maxX - minX, 1e-9);
  const sy = (h - 2 * pad) / Math.max(maxY - minY, 1e-9);
  const s = Math.min(sx, sy);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return {
    s,
    x: (p) => w / 2 + (p.x - cx) * s,
    y: (p) => h / 2 - (p.y - cy) * s,
  };
}

// The cable: depth-sorted thick strokes, so a nearer strand visibly lies over a
// farther one without any crossing analysis at all.
export function drawCable(ctx, pts, dir, opts = {}) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  const flat = project(pts, dir ?? v3(0.3, 0.17, 1));
  const T = fit(flat, w, h, opts.pad ?? 26);
  const n = flat.length;

  const segs = [];
  const closed = opts.closed !== false;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = flat[i], b = flat[(i + 1) % n];
    segs.push({ a, b, z: (a.z + b.z) / 2, i });
  }
  segs.sort((p, q) => p.z - q.z);

  let zMin = Infinity, zMax = -Infinity;
  for (const s of segs) { if (s.z < zMin) zMin = s.z; if (s.z > zMax) zMax = s.z; }
  const zSpan = Math.max(zMax - zMin, 1e-9);

  // Line width is set from the MEDIAN EDGE LENGTH IN PIXELS, not from the fit
  // scale. Scaling with the fit made a dense tangle draw with strokes far wider
  // than the gap between its own strands, and 150 segments of that turn into
  // blobs -- the halo of each nearer segment erased the cores of the ones
  // behind it until the picture was splotches rather than a cable.
  const lens = [];
  for (const s2 of segs) lens.push(Math.hypot(T.x(s2.b) - T.x(s2.a), T.y(s2.b) - T.y(s2.a)));
  lens.sort((a, b) => a - b);
  const medEdge = lens.length ? lens[Math.floor(lens.length / 2)] : 8;
  const core = opts.width ?? Math.min(6, Math.max(1.1, medEdge * 0.42));
  const halo = core * 2.15;

  for (const s of segs) {
    const t = (s.z - zMin) / zSpan;
    // Halo in the paper colour: this is what produces the occlusion.
    //
    // BUTT caps, not round. With round caps the halo sticks out by half its
    // width past each endpoint, so on a finely sampled curve -- where a
    // projected segment is only a few pixels long -- every segment's halo ate
    // the cores of its own two neighbours and the cable drew as a dashed line.
    // Butt caps confine the halo to the segment it belongs to, which still
    // occludes a strand crossing it while leaving its own neighbours alone.
    ctx.lineCap = 'butt';
    ctx.strokeStyle = opts.paper ?? '#fbf8f1';
    ctx.lineWidth = halo;
    ctx.beginPath();
    ctx.moveTo(T.x(s.a), T.y(s.a));
    ctx.lineTo(T.x(s.b), T.y(s.b));
    ctx.stroke();

    // Nearer strands are darker, so depth reads without any shading trick.
    const shade = 0.34 + 0.52 * t;
    ctx.strokeStyle = opts.colour
      ? opts.colour(t)
      : `rgba(35,32,27,${shade.toFixed(3)})`;
    ctx.lineCap = 'round';
    ctx.lineWidth = core;
    ctx.beginPath();
    ctx.moveTo(T.x(s.a), T.y(s.a));
    ctx.lineTo(T.x(s.b), T.y(s.b));
    ctx.stroke();
  }

  if (!closed && n > 1) {
    // Mark the two free ends: this is the whole reason the object has no knot
    // type until it is closed.
    for (const p of [flat[0], flat[n - 1]]) {
      ctx.beginPath();
      ctx.arc(T.x(p), T.y(p), core * 0.9, 0, 7);
      ctx.fillStyle = '#9e3b32';
      ctx.fill();
    }
  }
  return { flat, T };
}

// The diagram: a flat line drawing with a gap in the strand that goes under.
export function drawDiagram(ctx, diagram, opts = {}) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  const flat = diagram.flat;
  const T = fit(flat, w, h, opts.pad ?? 30);
  const n = flat.length;

  // Per-edge list of parameters where this edge passes UNDER.
  const gaps = Array.from({ length: n }, () => []);
  for (const c of diagram.crossings) {
    const e = c.underEdge;
    // Recover the parameter along that edge.
    const a = flat[e], b = flat[(e + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : ((c.x - a.x) * dx + (c.y - a.y) * dy) / l2;
    gaps[e].push(t);
  }
  for (const g of gaps) g.sort((p, q) => p - q);

  const lw = opts.width ?? 3.2;
  const gapPx = opts.gap ?? lw * 2.6;

  ctx.lineCap = 'round';
  ctx.strokeStyle = opts.ink ?? '#23201b';
  ctx.lineWidth = lw;

  for (let e = 0; e < n; e++) {
    const a = flat[e], b = flat[(e + 1) % n];
    const px = T.x(b) - T.x(a), py = T.y(b) - T.y(a);
    const lenPx = Math.hypot(px, py);
    if (lenPx < 1e-9) continue;
    const half = gapPx / lenPx / 2;

    // Build the list of kept intervals along [0,1].
    let cuts = [];
    for (const t of gaps[e]) cuts.push([Math.max(0, t - half), Math.min(1, t + half)]);
    // merge overlaps
    cuts.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const c of cuts) {
      if (merged.length && c[0] <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], c[1]);
      } else merged.push(c.slice());
    }
    let pos = 0;
    const draw = (t0, t1) => {
      if (t1 - t0 < 1e-6) return;
      ctx.beginPath();
      ctx.moveTo(T.x(a) + px * t0, T.y(a) + py * t0);
      ctx.lineTo(T.x(a) + px * t1, T.y(a) + py * t1);
      ctx.stroke();
    };
    for (const [c0, c1] of merged) { draw(pos, c0); pos = c1; }
    draw(pos, 1);
  }

  // Crossing signs, small, so the writhe is readable off the picture.
  if (opts.showSigns) {
    ctx.font = `600 10px ${opts.mono ?? 'ui-monospace, monospace'}`;
    ctx.textAlign = 'center';
    for (const c of diagram.crossings) {
      ctx.fillStyle = c.sign > 0 ? '#2f6b6b' : '#9e3b32';
      ctx.fillText(c.sign > 0 ? '+' : '−', T.x(c), T.y(c) - lw * 3);
    }
  }
  return { T };
}
