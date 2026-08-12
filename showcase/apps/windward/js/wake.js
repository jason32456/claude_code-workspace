import * as THREE from 'three';

const MAX = 1400;

const vertexShader = /* glsl */ `
attribute float aLife;
attribute float aSize;
attribute float aSeed;
varying float vLife;
varying float vSeed;
void main() {
  vLife = aLife;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (1.0 + (1.0 - aLife) * 1.5) * (240.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
varying float vLife;
varying float vSeed;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float edge = smoothstep(1.0, 0.25, d);
  float a = edge * vLife * vLife * 0.55;
  vec3 col = mix(vec3(0.78, 0.87, 0.95), vec3(1.0), vSeed * 0.5 + vLife * 0.4);
  gl_FragColor = vec4(col, a);
}
`;

/**
 * One buffer shared by every boat. Foam is spawned at the transom and along the
 * bow wave, then left in world space to drift and fade — a track you can read
 * to see where a rival went.
 */
export class Wake {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.seed = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.decay = new Float32Array(MAX);
    this.head = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    geo.setDrawRange(0, MAX);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    }));
    this.points.frustumCulled = false;
    this.geo = geo;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, size, ttl) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = 1;
    this.decay[i] = 1 / ttl;
    this.size[i] = size;
    this.seed[i] = Math.random();
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= this.decay[i] * dt;
      if (this.life[i] < 0) this.life[i] = 0;
      const j = i * 3;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.vel[j + 1] -= 5.5 * dt;
      this.vel[j] *= 1 - 1.6 * dt;
      this.vel[j + 2] *= 1 - 1.6 * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aSeed.needsUpdate = true;
  }

  trail(state, waterY, dt, intensity = 1) {
    const speed = state.speed;
    if (speed < 1.2) return;
    const fx = Math.sin(state.heading);
    const fz = Math.cos(state.heading);
    const sx = fz, sz = -fx;

    const rate = Math.min(70, speed * 7 * intensity);
    this.accum = (this.accum || 0) + rate * dt;
    while (this.accum >= 1) {
      this.accum -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const spread = 0.35 + Math.random() * 0.7;
      this.emit(
        state.x - fx * 3.1 + sx * side * spread,
        waterY + 0.05,
        state.z - fz * 3.1 + sz * side * spread,
        sx * side * (0.5 + speed * 0.09) + (Math.random() - 0.5) * 0.3,
        0.15 + Math.random() * 0.25,
        sz * side * (0.5 + speed * 0.09) + (Math.random() - 0.5) * 0.3,
        0.62 + Math.random() * 0.5,
        1.4 + Math.random() * 1.6,
      );
    }

    // Bow spray only once the boat is genuinely pushing water.
    if (speed > 5.4) {
      const n = Math.random() < (speed - 5.4) * 0.55 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        this.emit(
          state.x + fx * 2.7 + sx * side * 0.5,
          waterY + 0.35,
          state.z + fz * 2.7 + sz * side * 0.5,
          fx * speed * 0.35 + sx * side * 2.4,
          2.2 + Math.random() * 1.8,
          fz * speed * 0.35 + sz * side * 2.4,
          0.34 + Math.random() * 0.3,
          0.7 + Math.random() * 0.5,
        );
      }
    }
  }
}
