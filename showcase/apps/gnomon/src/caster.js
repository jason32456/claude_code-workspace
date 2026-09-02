import * as THREE from '../vendor/three.module.js';
import { buildShape } from './solids.js';
import { convexHull } from './geom.js';

const _v = new THREE.Vector3();
const _e = new THREE.Euler();

function geometryFor(part) {
  // Faces are authored without caring about winding; fix it against the part's
  // own centroid so every normal ends up pointing outwards.
  const c = [0, 0, 0];
  for (const v of part.verts) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }
  c[0] /= part.verts.length; c[1] /= part.verts.length; c[2] /= part.verts.length;

  const pos = [];
  for (const face of part.faces) {
    const a = part.verts[face[0]], b = part.verts[face[1]], d = part.verts[face[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = nx * (a[0] - c[0]) + ny * (a[1] - c[1]) + nz * (a[2] - c[2]) < 0;
    const idx = flip ? face.slice().reverse() : face;
    for (let i = 1; i < idx.length - 1; i++) {
      for (const k of [idx[0], idx[i], idx[i + 1]]) pos.push(...part.verts[k]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function edgesFor(part) {
  const seen = new Set();
  const pos = [];
  for (const face of part.faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pos.push(...part.verts[a], ...part.verts[b]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export class Caster {
  constructor(def, id) {
    this.id = id;
    this.def = def;
    this.parts = buildShape(def.shape);
    this.flags = new Set((def.flags || '').split(/\s+/).filter(Boolean));
    this.pos = new THREE.Vector3(...def.pos);
    this.home = this.pos.clone();
    this.yaw = (def.rot && def.rot[0]) || 0;
    this.pitch = (def.rot && def.rot[1]) || 0;
    this.spin = 0;
    this.motor = def.motor || null;
    this.motorAxis = new THREE.Vector3(...(def.motorAxis || [0, 0, 1])).normalize();
    this.depthRange = def.depthRange || null;
    this.slideBounds = def.slideBounds || null;
    // Manipulation writes to the t* targets; the simulation walks toward them a
    // fraction per substep, so a mouse delta delivered once per frame still
    // produces smooth vertex velocities for platform carry.
    this.tYaw = this.yaw;
    this.tPitch = this.pitch;
    this.tPos = this.pos.clone();
    this.quat = new THREE.Quaternion();
    this.matrix = new THREE.Matrix4();
    this.hover = false;
    this.held = false;
    this.angSpeed = 0;

    this.group = new THREE.Group();
    this.meshes = [];
    const movable = this.flags.has('rotate') || this.flags.has('slide') || this.flags.has('depth');
    this.tint = movable ? (def.tint ?? 0x9fd6ff) : (def.tint ?? 0x6f7a92);
    const mat = new THREE.MeshStandardMaterial({
      color: this.tint,
      transparent: true,
      opacity: movable ? 0.3 : 0.42,
      roughness: 0.25,
      metalness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(this.tint).multiplyScalar(0.12),
    });
    this.material = mat;
    const lineMat = new THREE.LineBasicMaterial({
      color: movable ? 0xdff1ff : 0x8f9ab2,
      transparent: true,
      opacity: movable ? 0.75 : 0.4,
    });
    this.lineMat = lineMat;

    for (const part of this.parts) {
      const mesh = new THREE.Mesh(geometryFor(part), mat);
      mesh.userData.caster = this;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.group.add(new THREE.LineSegments(edgesFor(part), lineMat));
    }

    // Per-part scratch: world vertices, projected points (reused every frame so
    // the hull can hand back references without allocating).
    this.world = this.parts.map((p) => new Float32Array(p.verts.length * 3));
    this.pts = this.parts.map((p) => p.verts.map((_, i) => ({ x: 0, y: 0, vx: 0, vy: 0, src: i })));
    this.prev = this.parts.map((p) => new Float32Array(p.verts.length * 2));
    this.hasPrev = false;
    this.polys = [];
    this.syncTransform();
  }

  syncTransform() {
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    this.quat.setFromEuler(_e);
    if (this.motor || this.spin) {
      const q = new THREE.Quaternion().setFromAxisAngle(this.motorAxis, this.spin);
      this.quat.multiply(q);
    }
    this.matrix.compose(this.pos, this.quat, _v.set(1, 1, 1));
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);
  }

  applyTargets(frac) {
    const dy = this.tYaw - this.yaw;
    const dp = this.tPitch - this.pitch;
    this.yaw += dy * frac;
    this.pitch += dp * frac;
    this.pos.lerp(this.tPos, frac);
    this.angSpeed = Math.hypot(dy, dp);
  }

  step(dt) {
    if (this.motor) {
      this.spin += this.motor * dt;
      if (this.spin > Math.PI * 2) this.spin -= Math.PI * 2;
    }
    this.syncTransform();
  }

  // The projection. Wall is z = 0, lamp is a point at `light`; a vertex v lands
  // at L + (v - L) * Lz / (Lz - Vz). Vertices at or beyond the lamp are clamped
  // so a solid shoved into the bulb blacks the wall out instead of producing NaN.
  project(light, dt) {
    const lz = light.z;
    this.polys.length = 0;
    const invDt = dt > 0 ? 1 / dt : 0;

    for (let pi = 0; pi < this.parts.length; pi++) {
      const part = this.parts[pi];
      const world = this.world[pi];
      const pts = this.pts[pi];
      const prev = this.prev[pi];

      for (let i = 0; i < part.verts.length; i++) {
        const lv = part.verts[i];
        _v.set(lv[0], lv[1], lv[2]).applyMatrix4(this.matrix);
        world[i * 3] = _v.x; world[i * 3 + 1] = _v.y; world[i * 3 + 2] = _v.z;

        const vz = Math.min(_v.z, lz - 0.35);
        const k = lz / (lz - vz);
        let x = light.x + (_v.x - light.x) * k;
        let y = light.y + (_v.y - light.y) * k;
        x = Math.max(-160, Math.min(160, x));
        y = Math.max(-160, Math.min(160, y));

        const p = pts[i];
        p.x = x; p.y = y;
        if (this.hasPrev) {
          p.vx = (x - prev[i * 2]) * invDt;
          p.vy = (y - prev[i * 2 + 1]) * invDt;
        } else {
          p.vx = 0; p.vy = 0;
        }
        prev[i * 2] = x; prev[i * 2 + 1] = y;
      }

      const hull = convexHull(pts);
      if (hull.length >= 3) this.polys.push(hull);
    }
    this.hasPrev = true;
  }

  setHighlight(state) {
    const on = state === 'held';
    const near = state !== 'none';
    this.material.opacity = near ? (on ? 0.46 : 0.38) : (this.flags.size ? 0.3 : 0.42);
    this.material.emissive.setHex(on ? 0x2f6f9a : near ? 0x1d4a68 : 0x000000);
    this.lineMat.color.setHex(on ? 0x8ef0ff : near ? 0xd6f4ff : (this.flags.size ? 0xdff1ff : 0x8f9ab2));
    this.lineMat.opacity = on ? 1 : near ? 0.9 : (this.flags.size ? 0.75 : 0.4);
  }

  get movable() {
    return this.flags.has('rotate') || this.flags.has('slide') || this.flags.has('depth');
  }

  reset() {
    this.pos.copy(this.home);
    this.yaw = (this.def.rot && this.def.rot[0]) || 0;
    this.pitch = (this.def.rot && this.def.rot[1]) || 0;
    this.tYaw = this.yaw;
    this.tPitch = this.pitch;
    this.tPos.copy(this.home);
    this.spin = 0;
    this.hasPrev = false;
    this.syncTransform();
  }
}
