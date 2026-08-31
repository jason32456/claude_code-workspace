import * as THREE from '../vendor/three.module.js';
import { SEGS, STRAND_TYPES } from './webmodel.js';
import { dotTexture } from './scene.js';

const MAX_STRANDS = 220;
const MAX_VERTS = MAX_STRANDS * SEGS * 2;
const MAX_DEW = 900;

export class WebView {
  constructor(scene, model) {
    this.model = model;

    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_VERTS * 3);
    this.colors = new Float32Array(MAX_VERTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.lines.frustumCulled = false;
    scene.add(this.lines);

    const dewGeo = new THREE.BufferGeometry();
    this.dewPos = new Float32Array(MAX_DEW * 3);
    dewGeo.setAttribute('position', new THREE.BufferAttribute(this.dewPos, 3).setUsage(THREE.DynamicDrawUsage));
    dewGeo.setDrawRange(0, 0);
    this.dew = new THREE.Points(
      dewGeo,
      new THREE.PointsMaterial({
        color: 0xbdf0ff,
        size: 0.34,
        map: dotTexture(),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.dew.frustumCulled = false;
    scene.add(this.dew);

    // Nodes render as faint knots so the build cursor has something to snap to
    // visually as well as logically.
    const knotGeo = new THREE.BufferGeometry();
    this.knotPos = new Float32Array(400 * 3);
    knotGeo.setAttribute('position', new THREE.BufferAttribute(this.knotPos, 3).setUsage(THREE.DynamicDrawUsage));
    knotGeo.setDrawRange(0, 0);
    this.knots = new THREE.Points(
      knotGeo,
      new THREE.PointsMaterial({
        color: 0x9ab4ff,
        size: 0.36,
        map: dotTexture(),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.knots.frustumCulled = false;
    scene.add(this.knots);

    this.ghost = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: 0x8fd0ff,
        dashSize: 0.35,
        gapSize: 0.25,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.ghost.visible = false;
    this.ghost.frustumCulled = false;
    scene.add(this.ghost);

    this.cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.44, 20),
      new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this.cursor.visible = false;
    scene.add(this.cursor);

    this.sparks = [];
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(300 * 3);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkGeo.setDrawRange(0, 0);
    this.sparkPoints = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        color: 0xfff0c0,
        size: 0.3,
        map: dotTexture(),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.sparkPoints.frustumCulled = false;
    scene.add(this.sparkPoints);

    this.time = 0;
  }

  burst(x, y, z, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 6;
      this.sparks.push({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: (Math.random() - 0.5) * 2,
        life: 0.5 + Math.random() * 0.5,
      });
    }
    if (this.sparks.length > 300) this.sparks.splice(0, this.sparks.length - 300);
  }

  setGhost(ax, ay, bx, by, ok) {
    this.ghost.visible = true;
    const pos = this.ghost.geometry.attributes.position;
    pos.setXYZ(0, ax, ay, 0);
    pos.setXYZ(1, bx, by, 0);
    pos.needsUpdate = true;
    this.ghost.geometry.computeBoundingSphere();
    this.ghost.computeLineDistances();
    this.ghost.material.color.setHex(ok ? 0x8fd0ff : 0xff6d7a);
  }

  hideGhost() {
    this.ghost.visible = false;
  }

  setCursor(x, y, visible, snapped) {
    this.cursor.visible = visible;
    if (visible) {
      this.cursor.position.set(x, y, 0.05);
      this.cursor.scale.setScalar(snapped ? 1.25 : 0.85);
      this.cursor.material.color.setHex(snapped ? 0xffe08a : 0x7fe0ff);
    }
  }

  update(dt) {
    this.time += dt;
    const m = this.model;
    const pos = this.positions;
    const col = this.colors;
    let v = 0;
    const flick = 0.9 + Math.sin(this.time * 2.1) * 0.06;

    for (const s of m.strands) {
      if (v / 3 + SEGS * 2 > MAX_VERTS) break;
      const chain = m.chain(s);
      const base = STRAND_TYPES[s.type].color;
      const wear = Math.max(0, s.integrity / s.max);
      // Damaged silk goes dim and warm; that is the only wear readout there is.
      const warm = 1 - wear;
      for (let i = 0; i < SEGS; i++) {
        const p = chain[i];
        const q = chain[i + 1];
        const u = (i + 0.5) / SEGS;
        const pulse = m.pulseBrightness(s, u);
        const lum = (0.5 + wear * 0.62) * flick + pulse * 1.05 + s.glow;
        const r = Math.min(2, (base[0] + warm * 0.5) * lum);
        const g = Math.min(2, (base[1] - warm * 0.22) * lum);
        const b = Math.min(2, (base[2] - warm * 0.42) * lum);
        pos[v] = p.x; pos[v + 1] = p.y; pos[v + 2] = p.z;
        col[v] = r; col[v + 1] = g; col[v + 2] = b;
        v += 3;
        pos[v] = q.x; pos[v + 1] = q.y; pos[v + 2] = q.z;
        col[v] = r; col[v + 1] = g; col[v + 2] = b;
        v += 3;
      }
      s.glow = Math.max(0, s.glow - dt * 2.2);
    }
    this.lines.geometry.setDrawRange(0, v / 3);
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;

    // Dew beads only on sticky silk — they read as "this strand catches things".
    let d = 0;
    const dp = this.dewPos;
    for (const s of m.strands) {
      if (!s.sticky) continue;
      const chain = m.chain(s);
      const step = Math.max(1, Math.round(SEGS / Math.min(SEGS, 2 + s.len0 * 0.5)));
      for (let i = step; i < SEGS; i += step) {
        if (d / 3 >= MAX_DEW) break;
        const p = chain[i];
        dp[d] = p.x; dp[d + 1] = p.y; dp[d + 2] = p.z;
        d += 3;
      }
    }
    this.dew.geometry.setDrawRange(0, d / 3);
    this.dew.geometry.attributes.position.needsUpdate = true;

    let k = 0;
    const kp = this.knotPos;
    for (const n of m.nodes) {
      if (k / 3 >= 400) break;
      kp[k] = n.x; kp[k + 1] = n.y; kp[k + 2] = n.z;
      k += 3;
    }
    this.knots.geometry.setDrawRange(0, k / 3);
    this.knots.geometry.attributes.position.needsUpdate = true;

    let sp = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy -= 9 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (sp / 3 < 300) {
        this.sparkPos[sp] = s.x;
        this.sparkPos[sp + 1] = s.y;
        this.sparkPos[sp + 2] = s.z;
        sp += 3;
      }
    }
    this.sparkGeo.setDrawRange(0, sp / 3);
    this.sparkGeo.attributes.position.needsUpdate = true;
  }
}
