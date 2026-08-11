import * as THREE from '../vendor/three.module.js';
import { PLANET } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const SPARK_CAP = 900;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.beams = [];
    this.shells = [];
    this.blasts = [];
    this.pods = [];

    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    this.beamPool = [];
    for (let i = 0; i < 56; i++) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      scene.add(m);
      this.beamPool.push(m);
    }

    const blastGeo = new THREE.SphereGeometry(1, 16, 12);
    this.blastPool = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({
        color: 0xffb066, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false;
      scene.add(m);
      this.blastPool.push(m);
    }

    const shellGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    this.shellPool = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.visible = false;
      scene.add(m);
      this.shellPool.push(m);
    }

    this.sparks = {
      pos: new Float32Array(SPARK_CAP * 3),
      vel: new Float32Array(SPARK_CAP * 3),
      col: new Float32Array(SPARK_CAP * 3),
      life: new Float32Array(SPARK_CAP),
      max: new Float32Array(SPARK_CAP),
      head: 0,
    };
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.sparks.pos, 3));
    sgeo.setAttribute('color', new THREE.BufferAttribute(this.sparks.col, 3));
    this.sparkPoints = new THREE.Points(sgeo, new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sparkPoints.frustumCulled = false;
    scene.add(this.sparkPoints);

    this.podGeo = new THREE.IcosahedronGeometry(0.42, 0);
    this.podMat = new THREE.MeshStandardMaterial({
      color: 0x3a1245, emissive: 0xb02fd0, emissiveIntensity: 1.4, flatShading: true,
    });
  }

  beam(from, to, color, width = 0.05, life = 0.09) {
    const mesh = this.beamPool.find((m) => !m.visible);
    if (!mesh) return;
    orient(mesh, from, to, width);
    mesh.material.color.setHex(color);
    mesh.material.opacity = 1;
    mesh.visible = true;
    this.beams.push({ mesh, t: 0, life, width });
  }

  shell(from, to, onImpact, speed = 9) {
    const mesh = this.shellPool.find((m) => !m.visible);
    const dist = from.distanceTo(to);
    const flight = Math.max(0.25, dist / speed);
    if (mesh) { mesh.position.copy(from); mesh.visible = true; }
    this.shells.push({
      mesh, from: from.clone(), to: to.clone(), t: 0, flight,
      loft: dist * 0.42 + 0.6, onImpact,
    });
  }

  blast(pos, radius, color = 0xffb066) {
    const mesh = this.blastPool.find((m) => !m.visible);
    if (mesh) {
      mesh.position.copy(pos);
      mesh.material.color.setHex(color);
      mesh.visible = true;
      this.blasts.push({ mesh, t: 0, life: 0.42, radius });
    }
    this.sparkBurst(pos, color, 14, 3.4);
  }

  // The falling pod carries its own landing marker, so a drop is legible from
  // the moment it appears rather than the moment it opens.
  pod(target, fallTime, tileId, onLand) {
    const mesh = new THREE.Mesh(this.podGeo, this.podMat);
    const from = target.clone().normalize().multiplyScalar(PLANET.radius + 26);
    mesh.position.copy(from);
    this.scene.add(mesh);
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.72, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff4fd0, side: THREE.DoubleSide, transparent: true,
        opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    marker.position.copy(target).normalize().multiplyScalar(target.length() + 0.06);
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), target.clone().normalize());
    this.scene.add(marker);
    this.pods.push({ mesh, marker, from, to: target.clone(), t: 0, life: fallTime, onLand, tileId });
  }

  sparkBurst(pos, color, count = 10, speed = 2.6) {
    const c = new THREE.Color(color);
    const s = this.sparks;
    for (let i = 0; i < count; i++) {
      const idx = s.head;
      s.head = (s.head + 1) % SPARK_CAP;
      s.pos[idx * 3] = pos.x; s.pos[idx * 3 + 1] = pos.y; s.pos[idx * 3 + 2] = pos.z;
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.4 + Math.random()));
      v.addScaledVector(pos.clone().normalize(), speed * 0.5);
      s.vel[idx * 3] = v.x; s.vel[idx * 3 + 1] = v.y; s.vel[idx * 3 + 2] = v.z;
      s.col[idx * 3] = c.r; s.col[idx * 3 + 1] = c.g; s.col[idx * 3 + 2] = c.b;
      s.life[idx] = s.max[idx] = 0.35 + Math.random() * 0.5;
    }
  }

  update(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const k = 1 - b.t / b.life;
      if (k <= 0) { b.mesh.visible = false; this.beams.splice(i, 1); continue; }
      b.mesh.material.opacity = k;
      b.mesh.scale.x = b.mesh.scale.z = b.width * (0.35 + 0.65 * k);
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.flight);
      if (s.mesh) {
        s.mesh.position.lerpVectors(s.from, s.to, k);
        // lofted arc: push outward from the planet at mid-flight
        s.mesh.position.addScaledVector(s.mesh.position.clone().normalize(), Math.sin(k * Math.PI) * s.loft);
      }
      if (k >= 1) {
        if (s.mesh) s.mesh.visible = false;
        s.onImpact?.(s.to);
        this.shells.splice(i, 1);
      }
    }

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) { b.mesh.visible = false; this.blasts.splice(i, 1); continue; }
      const r = b.radius * (0.35 + 0.9 * k);
      b.mesh.scale.setScalar(r);
      b.mesh.material.opacity = 0.75 * (1 - k);
    }

    for (let i = this.pods.length - 1; i >= 0; i--) {
      const p = this.pods[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      p.mesh.position.lerpVectors(p.from, p.to, k * k);
      p.mesh.rotation.x += dt * 5; p.mesh.rotation.y += dt * 3.4;
      const flash = 0.45 + 0.55 * Math.abs(Math.sin(p.t * 9));
      p.marker.material.opacity = flash;
      p.marker.scale.setScalar(1.6 - 0.6 * k);
      if (k >= 1) {
        this.blast(p.to, 1.2, 0xc04ae0);
        p.onLand?.();
        this.scene.remove(p.mesh);
        this.scene.remove(p.marker);
        this.pods.splice(i, 1);
      }
    }

    const s = this.sparks;
    for (let i = 0; i < SPARK_CAP; i++) {
      if (s.life[i] <= 0) continue;
      s.life[i] -= dt;
      const i3 = i * 3;
      if (s.life[i] <= 0) { s.col[i3] = s.col[i3 + 1] = s.col[i3 + 2] = 0; continue; }
      const px = s.pos[i3], py = s.pos[i3 + 1], pz = s.pos[i3 + 2];
      const len = Math.hypot(px, py, pz) || 1;
      const g = 5.5 * dt;
      s.vel[i3] -= (px / len) * g; s.vel[i3 + 1] -= (py / len) * g; s.vel[i3 + 2] -= (pz / len) * g;
      s.pos[i3] += s.vel[i3] * dt;
      s.pos[i3 + 1] += s.vel[i3 + 1] * dt;
      s.pos[i3 + 2] += s.vel[i3 + 2] * dt;
      const fade = s.life[i] / s.max[i];
      s.col[i3] *= 0.5 + 0.5 * fade;
      s.col[i3 + 1] *= 0.5 + 0.5 * fade;
      s.col[i3 + 2] *= 0.5 + 0.5 * fade;
    }
    this.sparkPoints.geometry.attributes.position.needsUpdate = true;
    this.sparkPoints.geometry.attributes.color.needsUpdate = true;
  }

  reset() {
    for (const p of this.pods) { this.scene.remove(p.mesh); this.scene.remove(p.marker); }
    this.pods.length = 0;
    for (const b of this.beams) b.mesh.visible = false;
    this.beams.length = 0;
    for (const b of this.blasts) b.mesh.visible = false;
    this.blasts.length = 0;
    for (const s of this.shells) if (s.mesh) s.mesh.visible = false;
    this.shells.length = 0;
    this.sparks.life.fill(0);
    this.sparks.col.fill(0);
  }
}

function orient(mesh, from, to, width) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length() || 0.001;
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.set(width, len, width);
}
