import * as THREE from '../vendor/three.module.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Closest point on a collider to a point, both in the collider's local frame.
// Cylinders carry their axis along local X, which is how the station geometry is
// baked — boxing them instead leaves the player standing on thin air at the 45°
// corners of every module.
export function closestLocal(col, l, out = new THREE.Vector3(), normal = new THREE.Vector3()) {
  if (col.cyl) return closestCylinder(col, l, out, normal);
  return closestBox(col, l, out, normal);
}

function closestBox(col, l, out, normal) {
  const h = col.half;
  out.set(clamp(l.x, -h.x, h.x), clamp(l.y, -h.y, h.y), clamp(l.z, -h.z, h.z));
  const inside = out.x === l.x && out.y === l.y && out.z === l.z;
  if (!inside) {
    normal.copy(l).sub(out);
    const len = normal.length();
    if (len > 1e-6) normal.divideScalar(len);
    else normal.set(0, 1, 0);
    return { inside: false, dist: len };
  }
  const dx = h.x - Math.abs(l.x);
  const dy = h.y - Math.abs(l.y);
  const dz = h.z - Math.abs(l.z);
  normal.set(0, 0, 0);
  if (dx <= dy && dx <= dz) { normal.x = Math.sign(l.x) || 1; out.x = h.x * normal.x; }
  else if (dy <= dz) { normal.y = Math.sign(l.y) || 1; out.y = h.y * normal.y; }
  else { normal.z = Math.sign(l.z) || 1; out.z = h.z * normal.z; }
  return { inside: true, dist: 0 };
}

function closestCylinder(col, l, out, normal) {
  const { hx, r } = col.cyl;
  const pr = Math.hypot(l.y, l.z);
  const cx = clamp(l.x, -hx, hx);
  const insideAxial = Math.abs(l.x) <= hx;

  if (pr > r) {
    const k = r / (pr || 1e-6);
    out.set(cx, l.y * k, l.z * k);
    normal.copy(l).sub(out);
    const len = normal.length();
    if (len > 1e-6) normal.divideScalar(len);
    else normal.set(0, 1, 0);
    return { inside: false, dist: len };
  }

  if (!insideAxial) {
    out.set(cx, l.y, l.z);
    normal.set(Math.sign(l.x) || 1, 0, 0);
    return { inside: false, dist: Math.abs(l.x - cx) };
  }

  // Inside the solid: leave by the nearest face.
  const radialGap = r - pr;
  const axialGap = hx - Math.abs(l.x);
  if (radialGap <= axialGap) {
    const k = r / (pr || 1e-6);
    out.set(l.x, l.y * k, l.z * k);
    if (pr > 1e-6) normal.set(0, l.y / pr, l.z / pr);
    else normal.set(0, 1, 0);
  } else {
    const s = Math.sign(l.x) || 1;
    out.set(hx * s, l.y, l.z);
    normal.set(s, 0, 0);
  }
  return { inside: true, dist: 0 };
}
