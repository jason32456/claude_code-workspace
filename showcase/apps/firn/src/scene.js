import * as THREE from '../vendor/three.module.js';
import { PROPS, CELL, SNOW, heightAt, qrot } from './sim.js';

const SKIES = [
  { top: 0x3f7fd0, horizon: 0xcfe2f4, sun: 0xfffaf0, sunDir: [0.5, 0.7, -0.35] },
  { top: 0x2f5fa8, horizon: 0xdde3ea, sun: 0xfff4e4, sunDir: [-0.55, 0.6, -0.2] },
  { top: 0x23406f, horizon: 0xf0d2bb, sun: 0xffe2c4, sunDir: [0.7, 0.42, 0.1] },
  { top: 0x4a86c9, horizon: 0xdbe8ef, sun: 0xffffff, sunDir: [-0.35, 0.8, -0.3] },
];
const GROUND = {
  [SNOW.POWDER]: 0xb9c6d6, [SNOW.CRUST]: 0xc3cedb, [SNOW.ICE]: 0x8fc2dc, [SNOW.ROCK]: 0x544d48, [SNOW.SLUSH]: 0x8e9aa1,
};
const DEPTH_SCALE = 2;
const CHUNK = 100;

// Props are built from primitives into one vertex-coloured geometry each so a
// whole class draws as a single InstancedMesh.
function part(geo, color, tx = 0, ty = 0, tz = 0, rx = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.rotateX(rx); g.rotateZ(rz); g.translate(tx, ty, tz);
  const c = new THREE.Color(color), n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function merge(parts) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const total = parts.reduce((s, p) => s + p.attributes[name].array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}

function propGeometry(kind) {
  const C = THREE;
  switch (kind) {
    case 'pinecone': return merge([part(new C.ConeGeometry(0.05, 0.14, 7), 0x6b4423, 0, 0.07, 0, Math.PI)]);
    case 'stone': return merge([part(new C.DodecahedronGeometry(0.13, 0), 0x77706a, 0, 0.09)]);
    case 'mitten': return merge([part(new C.SphereGeometry(0.08, 8, 6), 0xd23a3a, 0, 0.06), part(new C.SphereGeometry(0.035, 6, 5), 0xd23a3a, 0.07, 0.07)]);
    case 'pole': return merge([part(new C.CylinderGeometry(0.015, 0.015, 1.25, 5), 0x2b2f3a, 0, 0.62), part(new C.CylinderGeometry(0.06, 0.06, 0.01, 8), 0x2b2f3a, 0, 0.12), part(new C.CylinderGeometry(0.025, 0.025, 0.16, 6), 0xffb020, 0, 1.18)]);
    case 'sled': return merge([part(new C.BoxGeometry(0.5, 0.06, 1.0), 0xc8322b, 0, 0.22), part(new C.BoxGeometry(0.04, 0.2, 1.05), 0x333333, 0.22, 0.1), part(new C.BoxGeometry(0.04, 0.2, 1.05), 0x333333, -0.22, 0.1)]);
    case 'post': return merge([part(new C.BoxGeometry(0.14, 1.4, 0.14), 0x7a5332, 0, 0.7), part(new C.BoxGeometry(0.16, 0.08, 0.16), 0xf4f8ff, 0, 1.43), part(new C.BoxGeometry(2.5, 0.08, 0.04), 0xc0462f, 1.25, 1.05)]);
    case 'snowman': return merge([part(new C.SphereGeometry(0.5, 14, 10), 0xf6f9ff, 0, 0.45), part(new C.SphereGeometry(0.36, 14, 10), 0xf6f9ff, 0, 1.05), part(new C.SphereGeometry(0.25, 12, 9), 0xf6f9ff, 0, 1.5), part(new C.ConeGeometry(0.05, 0.25, 6), 0xff7a1a, 0, 1.5, 0.3, Math.PI / 2), part(new C.CylinderGeometry(0.17, 0.2, 0.22, 10), 0x1d1d24, 0, 1.78)]);
    case 'sign': return merge([part(new C.CylinderGeometry(0.05, 0.05, 2.3, 6), 0x55595f, 0, 1.15), part(new C.BoxGeometry(0.9, 0.6, 0.05), 0xf2c418, 0, 2.0, 0.04), part(new C.BoxGeometry(0.5, 0.12, 0.06), 0x1d1d24, 0, 2.0, 0.05)]);
    case 'sapling': return merge([part(new C.CylinderGeometry(0.06, 0.09, 0.6, 6), 0x5a3d26, 0, 0.3), part(new C.ConeGeometry(0.7, 1.3, 8), 0x2d5a3f, 0, 1.15), part(new C.ConeGeometry(0.48, 0.95, 8), 0x346648, 0, 1.75), part(new C.ConeGeometry(0.22, 0.4, 8), 0xeef4ff, 0, 2.35)]);
    case 'log': return merge([part(new C.CylinderGeometry(0.3, 0.3, 3.2, 10), 0x6e4a2f, 0, 0.3, 0, 0, Math.PI / 2), part(new C.BoxGeometry(3.0, 0.08, 0.5), 0xf4f8ff, 0, 0.6)]);
    case 'boulder': return merge([part(new C.DodecahedronGeometry(1.35, 1), 0x6b655f, 0, 1.0), part(new C.SphereGeometry(1.0, 10, 6, 0, Math.PI * 2, 0, 1.0), 0xf3f7fd, 0, 1.38)]);
    case 'pine': {
      const ps = [part(new C.CylinderGeometry(0.22, 0.38, 2.4, 7), 0x4a3221, 0, 1.2)];
      const tiers = [[2.4, 3.2, 1.8], [1.95, 2.8, 3.6], [1.5, 2.4, 5.2], [1.0, 2.0, 6.7], [0.55, 1.6, 8.1]];
      for (const [rad, h, y] of tiers) {
        ps.push(part(new C.ConeGeometry(rad, h, 9), 0x1f4a35, 0, y));
        ps.push(part(new C.ConeGeometry(rad * 0.62, h * 0.45, 9), 0xeef4ff, 0, y + h * 0.3));
      }
      return merge(ps);
    }
    case 'hut': return merge([
      part(new C.BoxGeometry(5, 2.8, 4.2), 0x7b4b2e, 0, 1.4),
      part(new C.CylinderGeometry(0.01, 3.5, 1.8, 4, 1), 0xf2f6fc, 0, 3.7, 0, 0, 0),
      part(new C.BoxGeometry(0.9, 1.6, 0.1), 0x3d2516, 0, 0.8, 2.12),
      part(new C.BoxGeometry(0.8, 0.7, 0.1), 0xffd27a, 1.6, 1.7, 2.12),
      part(new C.BoxGeometry(0.5, 1.6, 0.5), 0x5a524c, -1.6, 4.0, 0),
    ]);
    case 'pylon': return merge([
      part(new C.BoxGeometry(0.9, 14, 0.9), 0x8a9098, 0, 7),
      part(new C.BoxGeometry(6.5, 0.4, 0.6), 0x8a9098, 0, 13.6),
      part(new C.CylinderGeometry(0.35, 0.35, 0.3, 10), 0x2b2f3a, 3, 13.9, 0, Math.PI / 2),
      part(new C.CylinderGeometry(0.35, 0.35, 0.3, 10), 0x2b2f3a, -3, 13.9, 0, Math.PI / 2),
      part(new C.BoxGeometry(1.6, 0.4, 1.6), 0x6c727a, 0, 0.2),
    ]);
  }
}

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Particles {
  constructor(scene, n, size, color, opacity) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setDrawRange(0, n);
    this.mat = new THREE.PointsMaterial({ size, map: softDot(), color, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
    // Debris that flies past the lens would fill the screen, so cap the sprite size and fade it near the camera.
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vNear;')
        .replace('#include <logdepthbuf_vertex>', 'gl_PointSize = min(gl_PointSize, 56.0); vNear = smoothstep(2.5, 10.0, -mvPosition.z);\n#include <logdepthbuf_vertex>');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vNear;')
        .replace('#include <alphatest_fragment>', 'diffuseColor.a *= vNear;\n#include <alphatest_fragment>');
    };
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -1e5;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
  }
  update(dt, world) {
    const { pos, vel, life } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const o = i * 3;
      vel[o + 1] -= 9.81 * dt * 0.7;
      const k = 1 - 1.4 * dt;
      vel[o] *= k; vel[o + 2] *= k;
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
      if (life[i] <= 0 || pos[o + 1] < heightAt(world, pos[o], pos[o + 2]) - 0.5) { life[i] = 0; pos[o + 1] = -1e5; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  clear() { this.life.fill(0); for (let i = 0; i < this.n; i++) this.pos[i * 3 + 1] = -1e5; }
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2400);
  const hemi = new THREE.HemisphereLight(0xbcd4f0, 0x6f86a0, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform vec3 top, horizon, sunDir, sunCol; varying vec3 vD;
        void main(){ float h = clamp(vD.y, 0., 1.); vec3 c = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(normalize(vD), normalize(sunDir)), 0.);
        c += sunCol * (pow(s, 900.) * 3. + pow(s, 12.) * 0.18);
        gl_FragColor = vec4(c, 1.); }`,
    }),
  );
  scene.add(sky);

  const ballGeo = new THREE.SphereGeometry(1, 72, 48);
  {
    const pa = ballGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      const n = Math.sin(v.x * 7.1 + v.y * 3.3) * Math.sin(v.y * 6.3 - v.z * 4.1) * Math.sin(v.z * 5.7 + v.x * 2.2);
      v.multiplyScalar(1 + n * 0.045);
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    ballGeo.computeVertexNormals();
  }
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xf5f9ff, roughness: 0.92, metalness: 0 }));
  ball.castShadow = true;
  scene.add(ball);

  const powder = new Particles(scene, 2600, 0.5, 0xffffff, 0.5);
  const chunks = new Particles(scene, 700, 1.1, 0xf0f5ff, 0.95);
  const shards = new Particles(scene, 900, 0.9, 0xa8dcff, 0.9);

  let world = null, level = null, terrainGroup = null, depthTex = null, depthData = null, propMeshes = null, curtain = null, peaks = null;
  const dynamic = new Set();
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), head: new THREE.Vector3(0, 0, 1), init: false };
  let shake = 0;

  function disposeWorld() {
    for (const o of [terrainGroup, curtain, peaks]) if (o) { scene.remove(o); o.traverse((c) => { c.geometry?.dispose(); }); }
    if (propMeshes) for (const m of Object.values(propMeshes)) { scene.remove(m.mesh); m.mesh.dispose(); }
    depthTex?.dispose();
    dynamic.clear();
  }

  function buildTerrain(w) {
    depthData = new Uint8Array(w.cx * w.cz);
    for (let o = 0; o < depthData.length; o++) depthData[o] = Math.min(255, Math.round((w.depth[o] / DEPTH_SCALE) * 255));
    depthTex = new THREE.DataTexture(depthData, w.cx, w.cz, THREE.RedFormat, THREE.UnsignedByteType);
    depthTex.magFilter = THREE.LinearFilter;
    depthTex.minFilter = THREE.LinearFilter;
    depthTex.unpackAlignment = 1;
    depthTex.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const uniforms = { uDepth: { value: depthTex }, uTexel: { value: new THREE.Vector2(1 / w.cx, 1 / w.cz) } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 tuv; uniform sampler2D uDepth; uniform vec2 uTexel; varying vec2 vTuv; varying vec3 vWp;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float dl = texture2D(uDepth, tuv - vec2(uTexel.x, 0.)).r, dr = texture2D(uDepth, tuv + vec2(uTexel.x, 0.)).r;
          float db = texture2D(uDepth, tuv - vec2(0., uTexel.y)).r, df = texture2D(uDepth, tuv + vec2(0., uTexel.y)).r;
          objectNormal = normalize(objectNormal + vec3(-(dr - dl), 0., -(df - db)) * ${DEPTH_SCALE.toFixed(1)} / ${(2 * CELL).toFixed(1)});`)
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(position); transformed.y += texture2D(uDepth, tuv).r * ${DEPTH_SCALE.toFixed(1)}; vTuv = tuv; vWp = transformed;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uDepth; varying vec2 vTuv; varying vec3 vWp;\nfloat hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x), mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y); }')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float sd = texture2D(uDepth, vTuv).r * ${DEPTH_SCALE.toFixed(1)};
          float sn = smoothstep(0.015, 0.09, sd);
          float grain = vnoise(vWp.xz * 0.35) * 0.6 + vnoise(vWp.xz * 2.1) * 0.4;
          vec3 snowC = mix(vec3(0.84, 0.89, 0.97), vec3(0.98, 0.99, 1.0), clamp(0.55 + sd * 0.6, 0., 1.)) * (0.94 + 0.06 * grain);
          diffuseColor.rgb = mix(diffuseColor.rgb * (0.9 + 0.1 * grain), snowC, sn);`);
    };

    const group = new THREE.Group();
    const gc = new THREE.Color();
    for (let zs = w.z0; zs < w.z1; zs += CHUNK) {
      const ze = Math.min(w.z1, zs + CHUNK);
      const nxv = w.nx, nzv = ze - zs + 1;
      const pos = new Float32Array(nxv * nzv * 3), col = new Float32Array(nxv * nzv * 3), tuv = new Float32Array(nxv * nzv * 2);
      for (let k = 0; k < nzv; k++) {
        const z = zs + k, row = z - w.z0;
        for (let i = 0; i < nxv; i++) {
          const x = i - w.GX, o = i + k * nxv;
          const h = w.heights[i + row * w.nx];
          pos[o * 3] = x; pos[o * 3 + 1] = h; pos[o * 3 + 2] = z;
          tuv[o * 2] = (x + w.GX) / (2 * w.GX);
          tuv[o * 2 + 1] = (z - w.z0) / (w.z1 - w.z0);
          const ci = Math.min(w.cx - 1, Math.floor((x + w.GX) / CELL)) + Math.min(w.cz - 1, Math.floor((z - w.z0) / CELL)) * w.cx;
          let t = w.type[ci];
          const u = Math.abs(x) / w.hw(z);
          gc.setHex(GROUND[t]);
          if (u > 1.15) gc.lerp(new THREE.Color(0x5e5852), Math.min(1, (u - 1.15) * 2));
          col[o * 3] = gc.r; col[o * 3 + 1] = gc.g; col[o * 3 + 2] = gc.b;
        }
      }
      const idx = [];
      for (let k = 0; k < nzv - 1; k++) for (let i = 0; i < nxv - 1; i++) {
        const a = i + k * nxv, b = a + 1, c = a + nxv, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('tuv', new THREE.BufferAttribute(tuv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      g.boundingSphere.radius += 4;
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  function buildPeaks(w) {
    const rnd = (() => { let s = w.level.seed * 977; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    const g = merge([part(new THREE.ConeGeometry(1, 1, 7, 1), 0x8796aa, 0, 0.5), part(new THREE.ConeGeometry(0.45, 0.45, 7, 1), 0xf4f7fc, 0, 0.776)]);
    const n = 60;
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const z = w.z0 - 300 + rnd() * (w.z1 - w.z0 + 800);
      const hgt = 140 + rnd() * 260, rad = hgt * (0.8 + rnd() * 0.5);
      const x = side * (w.GX + 120 + rad + rnd() * 500);
      p.set(x, heightAt(w, 0, Math.min(w.z1, Math.max(w.z0, z))) - 80, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
      s.set(rad, hgt + 80, rad);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.frustumCulled = false;
    return mesh;
  }

  function buildCurtain(w) {
    const z = w.zWall, hw = w.hw(z) + 6, y = heightAt(w, 0, z);
    const g = new THREE.Group();
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(hw * 2 + 24, 26, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x9bd4f5, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.78, emissive: 0x14354f }),
    );
    wall.position.set(0, y + 10, z + 0.8);
    g.add(wall);
    const ic = new THREE.CylinderGeometry(0.25, 0.9, 1, 7);
    const cols = new THREE.InstancedMesh(ic, new THREE.MeshStandardMaterial({ color: 0xd8f0ff, roughness: 0.2, transparent: true, opacity: 0.9 }), 80);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 80; i++) {
      const x = -hw - 10 + (i / 79) * (hw * 2 + 20), h = 8 + ((i * 7919) % 13) * 1.3;
      m.compose(new THREE.Vector3(x, y + 23 - h / 2, z - 0.2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI), new THREE.Vector3(1 + (i % 3) * 0.3, h, 1));
      cols.setMatrixAt(i, m);
    }
    g.add(cols);
    g.userData = { y, hw, z };
    return g;
  }

  function buildProps(w) {
    const byKind = {};
    for (const p of w.props) (byKind[p.kind] ||= []).push(p);
    const out = {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    for (const [kind, list] of Object.entries(byKind)) {
      const mesh = new THREE.InstancedMesh(propGeometry(kind), mat, list.length);
      mesh.castShadow = ['pine', 'hut', 'pylon', 'boulder', 'sapling', 'snowman', 'sign', 'log', 'sled', 'post'].includes(kind);
      mesh.frustumCulled = false;
      list.forEach((p, i) => { p._mesh = kind; p._i = i; setUpright(mesh, p); });
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      out[kind] = { mesh, list };
    }
    return out;
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
  function setUpright(mesh, p) {
    _q.setFromAxisAngle(_up, p.yaw);
    mesh.setMatrixAt(p._i, _m.compose(_v.set(p.x, p.y - 0.05, p.z), _q, _s.set(1, 1, 1)));
  }

  function load(sim) {
    disposeWorld();
    world = sim.world;
    level = world.level;
    const S = SKIES[level.sky % SKIES.length];
    skyUniforms.top.value.setHex(S.top);
    skyUniforms.horizon.value.setHex(S.horizon);
    skyUniforms.sunDir.value.set(...S.sunDir).normalize();
    skyUniforms.sunCol.value.setHex(S.sun);
    scene.fog = new THREE.Fog(S.horizon, 120, 760);
    sun.color.setHex(S.sun);
    terrainGroup = buildTerrain(world);
    scene.add(terrainGroup);
    peaks = buildPeaks(world);
    scene.add(peaks);
    curtain = buildCurtain(world);
    curtain.add(buildBlocks(curtain.userData));
    scene.add(curtain);
    propMeshes = buildProps(world);
    powder.clear(); chunks.clear(); shards.clear();
    cam.init = false;
  }

  function uploadDepth(sim) {
    const D = sim.dirty, w = sim.world;
    if (D[0] > D[2]) return;
    for (let j = D[1]; j <= D[3]; j++) for (let i = D[0]; i <= D[2]; i++) {
      const o = i + j * w.cx;
      depthData[o] = Math.min(255, Math.round((w.depth[o] / DEPTH_SCALE) * 255));
    }
    sim.dirty = [Infinity, Infinity, -Infinity, -Infinity];
    depthTex.needsUpdate = true;
  }

  function handleEvents(sim, events) {
    for (const e of events) {
      const [x, y, z] = e.p, r = e.r;
      if (e.type === 'absorb') {
        dynamic.add(e.prop);
        for (let i = 0; i < 6; i++) powder.emit(x + (Math.random() - 0.5) * r, y, z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.8);
      } else if (e.type === 'smash') {
        dynamic.add(e.prop);
        shake = Math.max(shake, Math.min(1.2, 0.25 + Math.log10(e.energy + 1) * 0.08));
        burst(chunks, x, y, z, r, 26, 6);
      } else if (e.type === 'bounce') {
        shake = Math.max(shake, Math.min(1, e.speed * 0.08));
        burst(chunks, x, y, z, r, 12 + Math.min(30, e.speed * 3), 4);
      } else if (e.type === 'shed' && e.why === 'landing') {
        shake = Math.max(shake, 0.8);
        burst(chunks, x, y - r * 0.8, z, r, 40, 7);
      } else if (e.type === 'scrape') {
        burst(chunks, x, y - r * 0.9, z, r * 0.4, 2, 3);
      } else if (e.type === 'curtain') {
        curtain.children[0].visible = false;
        curtain.children[1].visible = false;
        shake = 1.6;
        breakCurtain(x, y, z, sim.v[2]);
        for (let i = 0; i < 500; i++) {
          const a = Math.random() * Math.PI * 2, u = Math.random();
          shards.emit(x + Math.cos(a) * r * 1.5 * u, y + Math.sin(a) * r * 1.5 * u, curtain.userData.z, Math.cos(a) * 12 * u, Math.sin(a) * 10 * u + 4, 8 + Math.random() * 20, 2 + Math.random() * 2);
        }
      } else if (e.type === 'splat') {
        shake = 1.2;
        burst(chunks, x, y, z + r * 0.8, r, 90, 8);
      }
    }
  }
  // The curtain shatters into blocks that fly out from where the ball hit it.
  const blocks = { mesh: null, items: [] };
  function buildBlocks(U) {
    const cols = 26, rows = 9, W = U.hw * 2 + 24, H = 26;
    const geo = new THREE.BoxGeometry(W / cols, H / rows, 1.6);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xa8dcf8, roughness: 0.12, transparent: true, opacity: 0.85, emissive: 0x14354f }), cols * rows);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.visible = false;
    const items = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      items.push({ p: new THREE.Vector3(-W / 2 + (i + 0.5) * (W / cols), U.y - 3 + (j + 0.5) * (H / rows), U.z + 0.8), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), live: true });
    }
    blocks.mesh = mesh; blocks.items = items;
    return mesh;
  }
  function breakCurtain(x, y, z, vz) {
    blocks.mesh.visible = true;
    for (const b of blocks.items) {
      const dx = b.p.x - x, dy = b.p.y - y, d = Math.hypot(dx, dy) + 1;
      const k = Math.min(1, 14 / d);
      b.v.set(dx / d * 8 * k + (Math.random() - 0.5) * 3, dy / d * 6 * k + Math.random() * 4 * k, vz * (0.25 + 0.6 * k) + Math.random() * 4);
      b.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6 * k + 0.5);
    }
  }
  const _wq = new THREE.Quaternion();
  function updateBlocks(dt) {
    if (!blocks.mesh?.visible) return;
    for (let i = 0; i < blocks.items.length; i++) {
      const b = blocks.items[i];
      if (b.live) {
        b.v.y -= 9.81 * dt;
        b.p.addScaledVector(b.v, dt);
        const g = heightAt(world, b.p.x, b.p.z) + 0.6;
        if (b.p.y < g) { b.p.y = g; b.v.multiplyScalar(0.35); b.v.y = Math.abs(b.v.y) * 0.3; b.w.multiplyScalar(0.4); if (b.v.length() < 0.5) b.live = false; }
        const wl = b.w.length();
        if (wl > 0) { _wq.setFromAxisAngle(_v.copy(b.w).divideScalar(wl), wl * dt); b.q.premultiply(_wq); }
      }
      blocks.mesh.setMatrixAt(i, _m.compose(b.p, b.q, _s.set(1, 1, 1)));
    }
    blocks.mesh.instanceMatrix.needsUpdate = true;
  }

  function burst(ps, x, y, z, r, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      ps.emit(x + Math.cos(a) * r * 0.7, y + (u - 0.3) * r, z + Math.sin(a) * r * 0.7, Math.cos(a) * sp * u, sp * (0.4 + Math.random()), Math.sin(a) * sp * u, 1.2 + Math.random());
    }
  }

  const _ballQ = new THREE.Quaternion();
  function updateDynamic(sim) {
    _ballQ.set(...sim.q);
    for (const p of dynamic) {
      const M = propMeshes[p._mesh].mesh, P = PROPS[p.kind];
      if (p.state === 'stuck') {
        const len = Math.hypot(...p.local);
        if (sim.r > p.capR * 0.92 + Math.min(P.height, 3) * 0.55) {
          M.setMatrixAt(p._i, _m.makeScale(0, 0, 0));
          dynamic.delete(p);
          M.instanceMatrix.needsUpdate = true;
          continue;
        }
        const wpos = qrot(sim.q, p.local);
        _v.set(...p.local).divideScalar(len || 1);
        _q.setFromUnitVectors(_up, _v);
        _q2.setFromAxisAngle(_up, p.yaw);
        _q.multiply(_q2).premultiply(_ballQ);
        const out = (len - Math.min(P.height, 4) * 0.3) / (len || 1);
        _m.compose(_v.set(sim.p[0] + wpos[0] * out, sim.p[1] + wpos[1] * out, sim.p[2] + wpos[2] * out), _q, _s.set(1, 1, 1));
        M.setMatrixAt(p._i, _m);
      } else if (p.state === 'down') {
        const t = Math.min(1, (sim.t - p.fallT) / 0.7);
        const ang = t * t * 1.45;
        _q.setFromAxisAngle(_v.set(Math.cos(p.fallDir), 0, -Math.sin(p.fallDir)), ang);
        _q2.setFromAxisAngle(_up, p.yaw);
        _q.multiply(_q2);
        M.setMatrixAt(p._i, _m.compose(_v.set(p.x, p.y - t * 0.3, p.z), _q, _s.set(1, 1, 1)));
        if (t >= 1) dynamic.delete(p);
      }
      M.instanceMatrix.needsUpdate = true;
    }
  }

  function sync(sim, dt, events) {
    if (!world) return;
    handleEvents(sim, events);
    uploadDepth(sim);
    updateDynamic(sim);
    const [x, y, z] = sim.p, r = sim.r;
    ball.position.set(x, y, z);
    ball.quaternion.set(...sim.q);
    ball.scale.setScalar(r);

    const sp = sim.speed();
    if (sim.taken > 0 && sp > 1) {
      const n = Math.min(10, 1 + sim.taken * 0.02 + sp * 0.1);
      for (let i = 0; i < n; i++) {
        const a = (Math.random() - 0.5) * 2.4;
        powder.emit(x + Math.sin(a) * r * 0.9, y - r * 0.75, z - sim.v[2] / sp * r * 0.4, Math.sin(a) * (1 + sp * 0.12) + sim.v[0] * 0.25, 1.2 + Math.random() * sp * 0.12, sim.v[2] * 0.22 + (Math.random() - 0.5), 0.35 + Math.random() * 0.4);
      }
    }
    powder.update(dt, world); chunks.update(dt, world); shards.update(dt, world);
    updateBlocks(dt);
    powder.mat.size = 0.3 + r * 0.12;
    chunks.mat.size = 0.5 + r * 0.32;

    // Chase camera: it trails the smoothed direction of travel and backs off as the ball grows.
    const hv = Math.hypot(sim.v[0], sim.v[2]);
    if (hv > 0.8) cam.head.lerp(_v.set(sim.v[0] / hv, 0, sim.v[2] / hv), 1 - Math.exp(-dt * 2.2)).normalize();
    const dist = 5.5 + r * 4.2 + Math.min(sp, 40) * 0.08, hgt = 2.2 + r * 2.1;
    const want = new THREE.Vector3(x - cam.head.x * dist, y + hgt, z - cam.head.z * dist);
    want.y = Math.max(want.y, heightAt(world, want.x, want.z) + 1.6 + r * 0.6);
    const look = new THREE.Vector3(x + cam.head.x * r * 3, y + r * 0.6, z + cam.head.z * r * 3);
    if (!cam.init) { cam.pos.copy(want); cam.look.copy(look); cam.init = true; }
    cam.pos.lerp(want, 1 - Math.exp(-dt * 5));
    cam.look.lerp(look, 1 - Math.exp(-dt * 8));
    camera.position.copy(cam.pos);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      shake = Math.max(0, shake - dt * 2.5);
    }
    camera.lookAt(cam.look);
    camera.fov = 58 + Math.min(14, sp * 0.3);
    camera.updateProjectionMatrix();

    const S = skyUniforms.sunDir.value;
    const ext = 28 + r * 7;
    sun.position.set(x + S.x * 200, y + S.y * 200, z + S.z * 200);
    sun.target.position.set(x, y, z + ext * 0.4);
    const sc = sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 450;
    sc.updateProjectionMatrix();
    sky.position.copy(camera.position);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { load, sync, resetCamera: () => { cam.init = false; }, render: () => renderer.render(scene, camera), resize, renderer, camera };
}
