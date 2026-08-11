// Axis-aligned box colliders. Everything in this game — level geometry, doors,
// moving platforms and echoes alike — is one of these, which is what keeps the
// character controller small enough to stay deterministic.

export function makeBox(cx, cy, cz, sx, sy, sz) {
  return {
    cx, cy, cz,
    hx: sx / 2, hy: sy / 2, hz: sz / 2,
    // Per-frame motion, used so riders inherit platform movement.
    dx: 0, dy: 0, dz: 0,
    solid: true,
  };
}

export function setBoxCenter(b, x, y, z) {
  b.dx = x - b.cx; b.dy = y - b.cy; b.dz = z - b.cz;
  b.cx = x; b.cy = y; b.cz = z;
}

export function overlaps(a, b, pad = 0) {
  return Math.abs(a.cx - b.cx) < a.hx + b.hx + pad &&
         Math.abs(a.cy - b.cy) < a.hy + b.hy + pad &&
         Math.abs(a.cz - b.cz) < a.hz + b.hz + pad;
}

export function pointInBox(x, y, z, b, pad = 0) {
  return Math.abs(x - b.cx) < b.hx + pad &&
         Math.abs(y - b.cy) < b.hy + pad &&
         Math.abs(z - b.cz) < b.hz + pad;
}

// Contact tolerance. Standing on a box leaves a hairline vertical overlap; without
// this skin the horizontal pass reads that as a collision and ejects the body
// sideways out of the very block it is standing on.
const SKIN = 0.01;

// Resolve `body` out of every solid collider along a single axis. Returns the
// collider that pushed us upward (i.e. the ground we are standing on), if any.
export function resolveAxis(body, colliders, axis) {
  let support = null;
  for (const c of colliders) {
    if (!c.solid || c === body) continue;

    const ox = Math.abs(body.cx - c.cx) - (body.hx + c.hx);
    const oy = Math.abs(body.cy - c.cy) - (body.hy + c.hy);
    const oz = Math.abs(body.cz - c.cz) - (body.hz + c.hz);

    // Real penetration on the axis being resolved, more than a hairline on the others.
    if (axis === 'y' && (oy >= 0 || ox >= -SKIN || oz >= -SKIN)) continue;
    if (axis === 'x' && (ox >= 0 || oy >= -SKIN || oz >= -SKIN)) continue;
    if (axis === 'z' && (oz >= 0 || ox >= -SKIN || oy >= -SKIN)) continue;

    if (axis === 'y') {
      const push = body.cy < c.cy
        ? (c.cy - c.hy) - (body.cy + body.hy)   // negative: push down
        : (c.cy + c.hy) - (body.cy - body.hy);  // positive: push up
      body.cy += push;
      if (push > 0) support = c;
      body.vy = 0;
    } else if (axis === 'x') {
      body.cx += body.cx < c.cx
        ? (c.cx - c.hx) - (body.cx + body.hx)
        : (c.cx + c.hx) - (body.cx - body.hx);
    } else {
      body.cz += body.cz < c.cz
        ? (c.cz - c.hz) - (body.cz + body.hz)
        : (c.cz + c.hz) - (body.cz - body.hz);
    }
  }
  return support;
}

// Last-resort separation: a collider that moved *into* the body (an echo walking
// through where you stand) should shove you aside rather than swallow you.
export function depenetrate(body, colliders) {
  for (const c of colliders) {
    if (!c.solid || c === body) continue;

    const ox = (body.hx + c.hx) - Math.abs(body.cx - c.cx);
    const oy = (body.hy + c.hy) - Math.abs(body.cy - c.cy);
    const oz = (body.hz + c.hz) - Math.abs(body.cz - c.cz);
    if (ox <= SKIN || oy <= SKIN || oz <= SKIN) continue;

    if (oy <= ox && oy <= oz) {
      body.cy += body.cy < c.cy ? -oy : oy;
      if (body.cy > c.cy) body.vy = Math.max(0, body.vy);
    } else if (ox <= oz) {
      body.cx += body.cx < c.cx ? -ox : ox;
    } else {
      body.cz += body.cz < c.cz ? -oz : oz;
    }
  }
}
