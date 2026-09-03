// The two things in the valley that give something back: midge columns over the
// water (stamina) and thermals off the ridges (height and stamina). Both are
// fixed in space, so taking them always costs you heading.

import * as THREE from '../vendor/three.module.js';
import { STAMINA } from './config.js';

const POINTS_VERT = `
  attribute float aSize;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vA = clamp(1.0 - (-mv.z) / 900.0, 0.0, 1.0);
    gl_PointSize = aSize * 300.0 / max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const POINTS_FRAG = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float m = smoothstep(0.5, 0.05, length(d));
    gl_FragColor = vec4(uColor, m * vA * uOpacity);
  }`;

function pointCloud(scene, n, color, opacity) {
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: POINTS_VERT, fragmentShader: POINTS_FRAG,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, geo, mat, pos, size };
}

export class Swarms {
  constructor(scene, list) {
    this.list = list.map((s) => ({ ...s, hot: 0 }));
    this.per = 220;
    this.cloud = pointCloud(scene, this.list.length * this.per, 0xd9b25c, 0.75);
    this.seed = new Float32Array(this.list.length * this.per * 3);
    for (let i = 0; i < this.seed.length; i++) this.seed[i] = Math.random();
    this.scene = scene;
    this.time = 0;
  }

  dispose() { this.scene.remove(this.cloud.pts); this.cloud.geo.dispose(); this.cloud.mat.dispose(); }

  update(dt, flock) {
    this.time += dt;
    const { pos, size } = this.cloud;
    let fed = 0;
    for (let s = 0; s < this.list.length; s++) {
      const sw = this.list[s];
      const near = Math.hypot(flock.cx - sw.x, flock.cz - sw.z) < 46
        && Math.abs(flock.cy - sw.y) < 40;
      if (near) { fed += flock.feed(sw.x, sw.y, sw.z, 44, dt); sw.hot = Math.min(1, sw.hot + dt * 3); }
      else sw.hot = Math.max(0, sw.hot - dt * 2);
      for (let k = 0; k < this.per; k++) {
        const i = s * this.per + k;
        const a = this.seed[i * 3] * 6.283 + this.time * (0.6 + this.seed[i * 3 + 1] * 1.4);
        const r = 6 + this.seed[i * 3 + 1] * 26;
        pos[i * 3] = sw.x + Math.cos(a) * r;
        pos[i * 3 + 1] = sw.y + Math.sin(this.time * 1.7 + this.seed[i * 3 + 2] * 6.283) * 9
          + (this.seed[i * 3 + 2] - 0.5) * 14;
        pos[i * 3 + 2] = sw.z + Math.sin(a) * r;
        size[i] = 0.5 + this.seed[i * 3 + 2] * 0.9 + sw.hot * 0.8;
      }
    }
    this.cloud.geo.attributes.position.needsUpdate = true;
    this.cloud.geo.attributes.aSize.needsUpdate = true;
    return fed;
  }
}

export class Thermals {
  constructor(scene, list, terrain) {
    this.list = list.map((t) => ({ ...t, base: terrain.heightAt(t.x, t.z), hot: 0 }));
    this.per = 180;
    this.cloud = pointCloud(scene, this.list.length * this.per, 0xc4a89a, 0.4);
    this.seed = new Float32Array(this.list.length * this.per * 2);
    for (let i = 0; i < this.seed.length; i++) this.seed[i] = Math.random();
    this.scene = scene;
    this.time = 0;
    this.radius = 34;
    this.height = 190;
  }

  dispose() { this.scene.remove(this.cloud.pts); this.cloud.geo.dispose(); this.cloud.mat.dispose(); }

  update(dt, flock) {
    this.time += dt;
    const { pos, size } = this.cloud;
    let lifted = 0;
    for (let s = 0; s < this.list.length; s++) {
      const th = this.list[s];
      const near = Math.hypot(flock.cx - th.x, flock.cz - th.z) < this.radius + 20;
      if (near) {
        th.hot = Math.min(1, th.hot + dt * 2);
        const { px, pz, py, vy, state, stamina } = flock;
        const r2 = (this.radius + 14) * (this.radius + 14);
        for (let i = 0; i < flock.high; i++) {
          if (state[i] !== 1) continue;
          const dx = px[i] - th.x, dz = pz[i] - th.z;
          if (dx * dx + dz * dz > r2) continue;
          if (py[i] > th.base + this.height) continue;
          vy[i] += 16 * dt;
          stamina[i] = Math.min(1, stamina[i] + STAMINA.thermalGain * dt);
          lifted++;
        }
      } else th.hot = Math.max(0, th.hot - dt * 1.5);

      for (let k = 0; k < this.per; k++) {
        const i = s * this.per + k;
        const t0 = this.seed[i * 2];
        const rise = (t0 + this.time * 0.09) % 1;
        const a = this.seed[i * 2 + 1] * 6.283 + rise * 7.5;
        const r = this.radius * (0.25 + rise * 0.9);
        pos[i * 3] = th.x + Math.cos(a) * r;
        pos[i * 3 + 1] = th.base + rise * this.height;
        pos[i * 3 + 2] = th.z + Math.sin(a) * r;
        size[i] = (0.5 + this.seed[i * 2 + 1] * 1.1) * (1 - rise * 0.5) * (1 + th.hot);
      }
    }
    this.cloud.geo.attributes.position.needsUpdate = true;
    this.cloud.geo.attributes.aSize.needsUpdate = true;
    return lifted;
  }
}
