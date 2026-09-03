import * as THREE from '../vendor/three.module.js';

const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

// A box baked straight into world-ish space so a whole lattice can be merged
// into one draw call — a tower crane is ~200 little sticks and they must not
// each cost a draw.
export function boxGeo(w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  _e.set(rx, ry, rz);
  _m.makeRotationFromEuler(_e);
  _m.setPosition(x, y, z);
  g.applyMatrix4(_m);
  return g;
}

export function mergeGeos(list) {
  let count = 0;
  for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

// One bay of lattice: four chords, a horizontal frame and a pair of diagonals.
export function latticeSection(size, height, thick, geos, ox = 0, oy = 0, oz = 0) {
  const h = size / 2;
  const corners = [[h, h], [h, -h], [-h, h], [-h, -h]];
  for (const [x, z] of corners) {
    geos.push(boxGeo(thick, height, thick, ox + x, oy + height / 2, oz + z));
  }
  for (const y of [oy + 0.02, oy + height - 0.02]) {
    geos.push(boxGeo(size, thick * 0.75, thick * 0.75, ox, y, oz + h));
    geos.push(boxGeo(size, thick * 0.75, thick * 0.75, ox, y, oz - h));
    geos.push(boxGeo(thick * 0.75, thick * 0.75, size, ox + h, y, oz));
    geos.push(boxGeo(thick * 0.75, thick * 0.75, size, ox - h, y, oz));
  }
  const diag = Math.hypot(size, height);
  const ang = Math.atan2(size, height);
  geos.push(boxGeo(thick * 0.7, diag, thick * 0.7, ox, oy + height / 2, oz + h, 0, 0, ang));
  geos.push(boxGeo(thick * 0.7, diag, thick * 0.7, ox, oy + height / 2, oz - h, 0, 0, -ang));
  geos.push(boxGeo(thick * 0.7, diag, thick * 0.7, ox + h, oy + height / 2, oz, -ang, 0, 0));
  geos.push(boxGeo(thick * 0.7, diag, thick * 0.7, ox - h, oy + height / 2, oz, ang, 0, 0));
}

// Horizontal lattice run along +X (the jib and counter-jib).
export function latticeRun(from, to, size, thick, geos, y = 0) {
  const len = to - from;
  const mid = (from + to) / 2;
  const h = size / 2;
  for (const [dy, dz] of [[h, h], [h, -h], [-h, h], [-h, -h]]) {
    geos.push(boxGeo(len, thick, thick, mid, y + dy, dz));
  }
  const bays = Math.max(2, Math.round(len / (size * 1.15)));
  const step = len / bays;
  for (let i = 0; i <= bays; i++) {
    const x = from + i * step;
    geos.push(boxGeo(thick * 0.7, size, thick * 0.7, x, y, h));
    geos.push(boxGeo(thick * 0.7, size, thick * 0.7, x, y, -h));
    geos.push(boxGeo(thick * 0.7, thick * 0.7, size, x, y - h, 0));
  }
  const diag = Math.hypot(step, size);
  const ang = Math.atan2(step, size);
  for (let i = 0; i < bays; i++) {
    const x = from + (i + 0.5) * step;
    const s = i % 2 ? 1 : -1;
    geos.push(boxGeo(thick * 0.6, diag, thick * 0.6, x, y, h, 0, 0, s * ang));
    geos.push(boxGeo(thick * 0.6, diag, thick * 0.6, x, y, -h, 0, 0, -s * ang));
  }
}

export const rnd = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};
