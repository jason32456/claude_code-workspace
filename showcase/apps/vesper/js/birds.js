// One draw call for the entire murmuration. Wing flap happens on the GPU from a
// per-instance phase; the CPU only writes orientation matrices.

import * as THREE from '../vendor/three.module.js';
import { MAX_BIRDS } from './config.js';

function birdGeometry() {
  const pos = [];
  const wing = [];
  const shade = [];
  const tri = (a, b, c, w, s) => {
    pos.push(...a, ...b, ...c);
    wing.push(w[0], w[1], w[2]);
    shade.push(s, s, s);
  };
  // body
  tri([0, 0, 0.62], [-0.07, 0.02, -0.16], [0.07, 0.02, -0.16], [0, 0, 0], 1.0);
  tri([-0.07, 0.02, -0.16], [0, 0, -0.62], [0.07, 0.02, -0.16], [0, 0, 0], 0.86);
  // left wing
  tri([-0.05, 0.01, 0.14], [-0.62, 0.0, -0.05], [-0.05, 0.01, -0.2], [0, 1, 0], 0.95);
  tri([-0.62, 0.0, -0.05], [-0.5, 0.0, -0.34], [-0.05, 0.01, -0.2], [1, 1, 0], 0.7);
  // right wing
  tri([0.05, 0.01, 0.14], [0.05, 0.01, -0.2], [0.62, 0.0, -0.05], [0, 0, 1], 0.95);
  tri([0.62, 0.0, -0.05], [0.05, 0.01, -0.2], [0.5, 0.0, -0.34], [1, 0, 1], 0.7);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  geo.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  return geo;
}

const VERT = `
  attribute float aWing;
  attribute float aShade;
  attribute float aPhase;
  attribute float aTint;
  uniform float uTime;
  varying float vShade;
  varying float vTint;
  varying float vFlap;
  void main() {
    float rate = 11.0 + fract(aPhase) * 5.0;
    float f = sin(uTime * rate + aPhase * 6.2831);
    vec3 p = position;
    p.y += aWing * f * 0.42;
    p.x *= 1.0 - aWing * abs(f) * 0.30;
    vShade = aShade;
    vTint = aTint;
    vFlap = abs(f);
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = `
  uniform vec3 uDark;
  uniform vec3 uWild;
  uniform vec3 uSheen;
  varying float vShade;
  varying float vTint;
  varying float vFlap;
  void main() {
    vec3 c = mix(uDark, uWild, vTint);
    c *= 0.62 + 0.38 * vShade;
    c += uSheen * pow(vFlap, 4.0) * 0.30;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class BirdRenderer {
  constructor(scene, scale = 1.8) {
    const geo = birdGeometry();
    const phase = new Float32Array(MAX_BIRDS);
    const tint = new Float32Array(MAX_BIRDS);
    for (let i = 0; i < MAX_BIRDS; i++) phase[i] = Math.random();
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
    this.tintAttr = geo.getAttribute('aTint');

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uDark: { value: new THREE.Color(0x12121a) },
        uWild: { value: new THREE.Color(0x4b3a46) },
        uSheen: { value: new THREE.Color(0x6c7ea0) },
      },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_BIRDS);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scale = scale;
    scene.add(this.mesh);
    this.scene = scene;
    this.arr = this.mesh.instanceMatrix.array;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }

  update(flock, time, light) {
    const a = this.arr;
    const { px, py, pz, vx, vy, vz, state, bank } = flock;
    const s = this.scale;
    const tintArr = this.tintAttr.array;
    for (let i = 0; i < flock.high; i++) {
      const o = i * 16;
      if (state[i] === 0) {
        if (a[o] !== 0 || a[o + 5] !== 0) { for (let k = 0; k < 16; k++) a[o + k] = 0; }
        continue;
      }
      let fx = vx[i], fy = vy[i], fz = vz[i];
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl; fy /= fl; fz /= fl;
      // right = up x forward
      let rx = fz, ry = 0, rz = -fx;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl; ry /= rl; rz /= rl;
      // up = forward x right
      let ux = fy * rz - fz * ry;
      let uy = fz * rx - fx * rz;
      let uz = fx * ry - fy * rx;
      const b = bank[i];
      const cb = Math.cos(b), sb = Math.sin(b);
      const r2x = rx * cb + ux * sb, r2y = ry * cb + uy * sb, r2z = rz * cb + uz * sb;
      const u2x = ux * cb - rx * sb, u2y = uy * cb - ry * sb, u2z = uz * cb - rz * sb;

      a[o] = r2x * s; a[o + 1] = r2y * s; a[o + 2] = r2z * s; a[o + 3] = 0;
      a[o + 4] = u2x * s; a[o + 5] = u2y * s; a[o + 6] = u2z * s; a[o + 7] = 0;
      a[o + 8] = fx * s; a[o + 9] = fy * s; a[o + 10] = fz * s; a[o + 11] = 0;
      a[o + 12] = px[i]; a[o + 13] = py[i]; a[o + 14] = pz[i]; a[o + 15] = 1;

      const want = state[i] === 2 ? 1 : 0;
      if (tintArr[i] !== want) { tintArr[i] = want; this.tintAttr.needsUpdate = true; }
    }
    this.mesh.count = Math.max(1, flock.high);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mat.uniforms.uTime.value = time;
    const d = 0.075 + light * 0.03;
    this.mat.uniforms.uDark.value.setRGB(d, d, d * 1.45);
    const sheen = 0.35 + 0.65 * light;
    this.mat.uniforms.uSheen.value.setRGB(0.40 * sheen, 0.46 * sheen, 0.62 * sheen);
  }
}

// Feather puffs where a bird is lost. Cheap, additive, and the only way a kill
// reads at 90 m when one bird out of nine hundred is missing.
export class Puffs {
  constructor(scene, max = 320) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const alpha = new Float32Array(max);
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    this.alpha = alpha;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0xd8c9b4) } },
      vertexShader: `
        attribute float aAlpha; varying float vA;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = 34.0 / max(1.0, -mv.z) * 26.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float m = smoothstep(0.5, 0.0, length(d));
          if (vA <= 0.001) discard; gl_FragColor = vec4(uColor, m * vA); }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.scene = scene;
  }

  dispose() { this.scene.remove(this.points); this.geo.dispose(); this.mat.dispose(); }

  burst(x, y, z, n = 5) {
    for (let k = 0; k < n; k++) {
      const i = this.head = (this.head + 1) % this.max;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = (Math.random() - 0.5) * 7;
      this.vel[i * 3 + 1] = (Math.random() - 0.5) * 4 - 1;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 7;
      this.life[i] = 1;
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt * 0.55;
      this.vel[i * 3 + 1] -= dt * 3.5;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.max(0, this.life[i]) * 0.7;
      any = true;
    }
    if (any || this.dirty) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
    }
    this.dirty = any;
  }
}
