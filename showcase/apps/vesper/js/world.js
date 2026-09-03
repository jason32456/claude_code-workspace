// Terrain, sky, water, and everything in the valley that can kill a bird.
// Nothing here is loaded from disk — the whole night is generated at start.

import * as THREE from '../vendor/three.module.js';
import { WORLD } from './config.js';

function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return (a * (1 - ux) + b * ux) * (1 - uz) + (c * (1 - ux) + d * ux) * uz;
}

const smoothstep = (a, b, t) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export class Terrain {
  constructor(length) {
    this.length = length;
    this.roostX = length;
    this.roostZ = 0;
  }

  riverZ(x) {
    return 48 * Math.sin(x / 430) + 26 * Math.sin(x / 190 + 1.2);
  }

  heightAt(x, z) {
    const d = Math.abs(z - this.riverZ(x));
    const v = smoothstep(0.3, 1.05, d / WORLD.valleyHalf);
    let h = 7 + WORLD.ridgeHeight * Math.pow(v, 1.7);
    h += (vnoise(x / 260, z / 260) - 0.5) * 52 * v;
    h += (vnoise(x / 145, z / 145) - 0.5) * 22 * (0.3 + v);
    h += (vnoise(x / 62, z / 62) - 0.5) * 7 * (0.35 + v);
    // river channel
    const chan = 1 - smoothstep(10, 42, d);
    h = h * (1 - chan) + -3.2 * chan;
    // roost lake at the end of the valley
    const rd = Math.hypot(x - this.roostX, z - this.roostZ);
    const lake = 1 - smoothstep(120, 250, rd);
    h = h * (1 - lake) + -4.0 * lake;
    return h;
  }
}

export class World {
  constructor(scene, night) {
    this.scene = scene;
    this.night = night;
    this.terrain = new Terrain(night.length);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.wires = [];
    this.spanRows = [];
    this.turbines = [];
    this.time = 0;

    this.buildSky();
    this.buildTerrain();
    this.buildWater();
    this.buildTrees();
    this.buildPylons();
    this.buildTurbines();
    this.buildRoost();
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.sky);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(9000, 24, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x1b2a4a) },
        uMid: { value: new THREE.Color(0x8a6a86) },
        uHorizon: { value: new THREE.Color(0xe8925a) },
        uSunDir: { value: new THREE.Vector3(-1, 0.12, 0).normalize() },
        uSunColor: { value: new THREE.Color(0xffc98a) },
        uNight: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop, uMid, uHorizon, uSunColor, uSunDir;
        uniform float uNight;
        varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y * 1.35 + 0.08, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.34, h));
          col = mix(col, uTop, smoothstep(0.22, 0.85, h));
          float sun = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sun, 220.0) * 1.6;
          col += uSunColor * pow(sun, 5.0) * 0.22 * (1.0 - uNight * 0.6);
          if (uNight > 0.25) {
            vec3 c = d * 240.0;
            float s = hash(floor(c));
            if (s > 0.9972) {
              vec3 f = fract(c) - 0.5;
              float m = smoothstep(0.42, 0.0, length(f)) * smoothstep(0.02, 0.4, d.y);
              col += vec3(0.86, 0.9, 1.0) * m * (uNight - 0.25) * 1.9;
            }
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  buildTerrain() {
    const t = this.terrain;
    const x0 = -300, x1 = this.night.length + 500;
    const z0 = -WORLD.halfWidth, z1 = WORLD.halfWidth;
    const cs = WORLD.cellSize;
    const nx = Math.ceil((x1 - x0) / cs), nz = Math.ceil((z1 - z0) / cs);
    const verts = new Float32Array(nx * nz * 18);
    const cols = new Float32Array(nx * nz * 18);
    let p = 0, c = 0;
    const col = new THREE.Color();
    const grass = new THREE.Color(0x33402c);
    const dry = new THREE.Color(0x5a5236);
    const rock = new THREE.Color(0x4a4550);
    const sand = new THREE.Color(0x6a6048);

    const push = (x, z) => {
      const y = t.heightAt(x, z);
      verts[p++] = x; verts[p++] = y; verts[p++] = z;
      const slope = Math.abs(t.heightAt(x + cs, z) - y) + Math.abs(t.heightAt(x, z + cs) - y);
      const rocky = smoothstep(6, 26, slope);
      const high = smoothstep(20, 78, y);
      const near = 1 - smoothstep(2, 16, y);
      col.copy(grass).lerp(dry, high * 0.7).lerp(rock, rocky * 0.8).lerp(sand, near * 0.8);
      const shade = 0.82 + vnoise(x / 40, z / 40) * 0.36;
      cols[c++] = col.r * shade; cols[c++] = col.g * shade; cols[c++] = col.b * shade;
    };

    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const ax = x0 + i * cs, az = z0 + j * cs;
        const bx = ax + cs, bz = az + cs;
        push(ax, az); push(ax, bz); push(bx, az);
        push(bx, az); push(ax, bz); push(bx, bz);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.frustumCulled = false;
    this.group.add(this.ground);
  }

  buildWater() {
    const geo = new THREE.PlaneGeometry(this.night.length + 900, WORLD.halfWidth * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshBasicMaterial({
      color: 0x2b4a63, transparent: true, opacity: 0.88,
    });
    const m = new THREE.Mesh(geo, this.waterMat);
    m.position.set(this.night.length / 2 + 100, WORLD.waterLevel, 0);
    m.renderOrder = -1;
    this.group.add(m);
    this.water = m;
  }

  buildTrees() {
    const t = this.terrain;
    const trunk = new THREE.CylinderGeometry(0.5, 0.8, 4, 4);
    trunk.translate(0, 2, 0);
    const crown = new THREE.ConeGeometry(3.2, 11, 6);
    crown.translate(0, 9, 0);
    const geo = mergeGeoms([trunk, crown], [0x3b2f24, 0x27351f]);
    const count = Math.floor(this.night.length / 8);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let placed = 0;
    for (let i = 0; i < count * 4 && placed < count; i++) {
      const x = -200 + Math.random() * (this.night.length + 600);
      const z = -WORLD.halfWidth + Math.random() * WORLD.halfWidth * 2;
      const y = t.heightAt(x, z);
      if (y < 3 || y > 74) continue;
      pos.set(x, y - 0.5, z);
      const sc = 0.7 + Math.random() * 1.6;
      s.set(sc, sc * (0.8 + Math.random() * 0.6), sc);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 7);
      m.compose(pos, q, s);
      mesh.setMatrixAt(placed++, m);
    }
    mesh.count = placed;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  buildPylons() {
    const t = this.terrain;
    const zA = -455, zB = 455;
    const towerMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
    const wireMat = new THREE.LineBasicMaterial({ color: 0x14141a, transparent: true, opacity: 0.9 });
    for (const p of this.night.pylons) {
      this.spanRows.push({ x: p.x, warned: false });
      const yA = t.heightAt(p.x, zA) + 58;
      const yB = t.heightAt(p.x, zB) + 58;
      for (const [z, top] of [[zA, yA], [zB, yB]]) {
        const base = t.heightAt(p.x, z);
        const h = top - base;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 4.2, h, 5), towerMat);
        leg.position.set(p.x, base + h / 2, z);
        this.group.add(leg);
        for (const ay of [h * 0.62, h * 0.82, h * 0.97]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 26), towerMat);
          arm.position.set(p.x, base + ay, z);
          this.group.add(arm);
        }
      }
      for (const midY of p.heights) {
        const sag = (yA + yB) / 2 - midY;
        const pts = [];
        const N = 60;
        for (let i = 0; i <= N; i++) {
          const s = i / N;
          const z = zA + (zB - zA) * s;
          const y = yA + (yB - yA) * s - sag * 4 * s * (1 - s);
          pts.push(new THREE.Vector3(p.x, y, z));
        }
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        this.group.add(new THREE.Line(g, wireMat));
        this.wires.push({ x: p.x, zA, zB, yA, yB, sag });
      }
    }
  }

  buildTurbines() {
    const t = this.terrain;
    const mat = new THREE.MeshLambertMaterial({ color: 0xc8c9cc });
    for (const tb of this.night.turbines) {
      const base = t.heightAt(tb.x, tb.z);
      const h = 78;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.0, h, 8), mat);
      tower.position.set(tb.x, base + h / 2, tb.z);
      this.group.add(tower);
      const hub = new THREE.Group();
      hub.position.set(tb.x, base + h, tb.z);
      const nac = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 3.4), mat);
      hub.add(nac);
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(1.0, 34, 3.2), mat);
        blade.geometry.translate(0, 17, 0);
        blade.rotation.x = (b * Math.PI * 2) / 3;
        blade.position.x = 3.6;
        hub.add(blade);
      }
      this.group.add(hub);
      this.turbines.push({ x: tb.x, y: base + h, z: tb.z, r: 35, hub, angle: Math.random() * 6.28, speed: 1.1 + Math.random() * 0.5 });
    }
  }

  buildRoost() {
    const t = this.terrain;
    const mat = new THREE.MeshLambertMaterial({ color: 0x6b6236 });
    const geo = new THREE.CylinderGeometry(0.16, 0.3, 7, 3);
    geo.translate(0, 3.5, 0);
    const count = 2600;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 0, 1);
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let placed = 0;
    for (let i = 0; i < count * 3 && placed < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * 190;
      const x = t.roostX + Math.cos(a) * r;
      const z = t.roostZ + Math.sin(a) * r;
      const y = t.heightAt(x, z);
      if (y > 1.2 || y < -3.6) continue;
      pos.set(x, Math.max(-0.4, y), z);
      const sc = 0.7 + Math.random() * 0.9;
      s.set(sc, sc, sc);
      q.setFromAxisAngle(up, (Math.random() - 0.5) * 0.5);
      m.compose(pos, q, s);
      mesh.setMatrixAt(placed++, m);
    }
    mesh.count = placed;
    mesh.frustumCulled = false;
    this.group.add(mesh);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(156, 166, 64),
      new THREE.MeshBasicMaterial({ color: 0x7fd6c8, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(t.roostX, 1.2, t.roostZ);
    this.group.add(ring);
    this.roostRing = ring;
  }

  // The lowest and highest conductor on one span at a given track — the flock
  // has to be entirely above or entirely below this band.
  wireBandAt(x, z) {
    let lo = Infinity, hi = -Infinity;
    for (const w of this.wires) {
      if (w.x !== x) continue;
      const y = this.wireYAt(w, z);
      if (y === null) continue;
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return lo === Infinity ? null : { lo, hi };
  }

  wireYAt(w, z) {
    const s = (z - w.zA) / (w.zB - w.zA);
    if (s < 0 || s > 1) return null;
    return w.yA + (w.yB - w.yA) * s - w.sag * 4 * s * (1 - s);
  }

  // Per-bird hazard resolution. Only birds that actually crossed a span this
  // frame are tested, so this stays cheap no matter how big the flock gets.
  checkHazards(flock) {
    let killed = 0;
    const { px, py, pz, ppx, ppz, state } = flock;
    for (const w of this.wires) {
      if (Math.abs(flock.cx - w.x) > 90) continue;
      for (let i = 0; i < flock.high; i++) {
        if (state[i] === 0) continue;
        const a = ppx[i], b = px[i];
        if ((a - w.x) * (b - w.x) > 0) continue;
        const wy = this.wireYAt(w, pz[i]);
        if (wy === null) continue;
        if (Math.abs(py[i] - wy) < 1.1) { flock.kill(i, true); killed++; }
      }
    }
    for (const t of this.turbines) {
      if (Math.abs(flock.cx - t.x) > 90) continue;
      for (let i = 0; i < flock.high; i++) {
        if (state[i] === 0) continue;
        const a = ppx[i], b = px[i];
        if ((a - t.x) * (b - t.x) > 0) continue;
        const dy = py[i] - t.y, dz = pz[i] - t.z;
        const r = Math.hypot(dy, dz);
        if (r > t.r || r < 3) continue;
        const ba = Math.atan2(dy, dz);
        for (let k = 0; k < 3; k++) {
          let d = Math.abs(((ba - (t.angle + (k * Math.PI * 2) / 3)) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
          if (d < 0.16) { flock.kill(i, true); killed++; break; }
        }
      }
    }
    return killed;
  }

  update(dt, light) {
    this.time += dt;
    for (const t of this.turbines) {
      t.angle += dt * t.speed;
      t.hub.rotation.x = t.angle;
    }
    if (this.roostRing) {
      this.roostRing.material.opacity = 0.15 + Math.sin(this.time * 2) * 0.07;
    }
    const n = 1 - light;
    const u = this.skyMat.uniforms;
    u.uNight.value = n;
    u.uTop.value.setRGB(0.10 - 0.07 * n, 0.16 - 0.12 * n, 0.30 - 0.22 * n);
    u.uMid.value.setRGB(0.54 - 0.44 * n, 0.41 - 0.34 * n, 0.53 - 0.42 * n);
    u.uHorizon.value.setRGB(0.91 - 0.78 * n, 0.57 - 0.48 * n, 0.35 - 0.28 * n);
    u.uSunDir.value.set(-1, 0.16 - n * 0.3, 0.15).normalize();
    this.waterMat.color.setRGB(
      0.16 - 0.12 * n, 0.27 - 0.21 * n, 0.36 - 0.28 * n, THREE.SRGBColorSpace,
    );
  }
}

function mergeGeoms(geoms, colors) {
  const flat = geoms.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    return ng;
  });
  let total = 0;
  for (const g of flat) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  const c = new THREE.Color();
  flat.forEach((gp, gi) => {
    const p = gp.attributes.position.array;
    const n = gp.attributes.normal.array;
    c.set(colors[gi]);
    for (let i = 0; i < p.length; i += 3) {
      pos[o] = p[i]; pos[o + 1] = p[i + 1]; pos[o + 2] = p[i + 2];
      nor[o] = n[i]; nor[o + 1] = n[i + 1]; nor[o + 2] = n[i + 2];
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      o += 3;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, o), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, o), 3));
  return geo;
}
