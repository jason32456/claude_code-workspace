import * as THREE from '../vendor/three.module.js';
import { HOLD_TYPES, TYPE_ORDER } from './holds.js';

const UP = new THREE.Vector3(0, 1, 0);

function geometryFor(type) {
  switch (type) {
    case 'jug': {
      const g = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
      g.rotateX(Math.PI * 0.5);
      g.scale(1.15, 0.85, 1.15);
      return g;
    }
    case 'edge': {
      const g = new THREE.BoxGeometry(2.4, 0.5, 1.1);
      g.translate(0, -0.1, 0.1);
      return g;
    }
    case 'sloper': {
      const g = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45);
      g.rotateX(Math.PI * 0.5);
      g.scale(1.4, 0.55, 1.2);
      return g;
    }
    case 'pocket': {
      const g = new THREE.TorusGeometry(0.85, 0.4, 6, 12);
      return g;
    }
    case 'sidepull': {
      const g = new THREE.BoxGeometry(0.7, 2.2, 1.1);
      return g;
    }
    case 'undercling': {
      const g = new THREE.BoxGeometry(2.2, 0.62, 1.2);
      g.rotateZ(0.12);
      g.translate(0, 0.16, 0);
      return g;
    }
    default: {
      const g = new THREE.ConeGeometry(1.1, 1.5, 5);
      g.rotateX(Math.PI * 0.5);
      g.scale(1, 1, 0.6);
      return g;
    }
  }
}

export class HoldView {
  constructor(wall) {
    this.wall = wall;
    this.group = new THREE.Group();
    this.meshes = {};
    this.index = new Map();

    const byType = {};
    for (const t of TYPE_ORDER) byType[t] = [];
    for (const h of wall.holds) byType[h.type].push(h);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const color = new THREE.Color();

    for (const t of TYPE_ORDER) {
      const list = byType[t];
      if (!list.length) continue;
      const spec = HOLD_TYPES[t];
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: 0.62,
        metalness: 0.05,
        emissive: new THREE.Color(spec.color).multiplyScalar(0.16),
      });
      const mesh = new THREE.InstancedMesh(geometryFor(t), mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (let i = 0; i < list.length; i++) {
        const h = list[i];
        this.index.set(h.id, { mesh, i });
        q.setFromUnitVectors(UP, h.normal);
        const jitter = 0.82 + ((h.id * 37) % 100) / 260;
        s.setScalar(spec.size * jitter);
        m.compose(h.position, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes[t] = mesh;
      this.group.add(mesh);
      void color;
    }

    const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    this.rings = new THREE.InstancedMesh(ringGeo, ringMat, 160);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3);
    this.rings.frustumCulled = false;
    this.group.add(this.rings);

    this.target = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.075, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false })
    );
    this.target.renderOrder = 5;
    this.target.visible = false;
    this.group.add(this.target);

    const camGeo = new THREE.BoxGeometry(0.1, 0.16, 0.1);
    const camMat = new THREE.MeshStandardMaterial({ color: 0xc8b45a, metalness: 0.7, roughness: 0.35 });
    this.camMarkers = new THREE.InstancedMesh(camGeo, camMat, Math.max(1, wall.camSpots.length));
    for (let i = 0; i < wall.camSpots.length; i++) {
      m.compose(wall.camSpots[i].position, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      this.camMarkers.setMatrixAt(i, m);
    }
    this.camMarkers.visible = false;
    this.group.add(this.camMarkers);

    this.placedCams = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.13, 0.2, 0.13),
      new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x330000, metalness: 0.5, roughness: 0.4 }),
      6
    );
    this.placedCams.count = 0;
    this.group.add(this.placedCams);

    this._m = m;
    this._q = q;
    this._s = s;
    this.hidden = new THREE.Vector3(0, -999, 0);
  }

  hide(hold) {
    const ref = this.index.get(hold.id);
    if (!ref) return;
    this._m.compose(this.hidden, this._q.identity(), this._s.setScalar(0.0001));
    ref.mesh.setMatrixAt(ref.i, this._m);
    ref.mesh.instanceMatrix.needsUpdate = true;
  }

  addCam(position) {
    const i = this.placedCams.count;
    if (i >= 6) return;
    this._m.compose(position, this._q.identity(), this._s.setScalar(1));
    this.placedCams.setMatrixAt(i, this._m);
    this.placedCams.count = i + 1;
    this.placedCams.instanceMatrix.needsUpdate = true;
  }

  // Rings mark what is in reach right now; that read is most of the gameplay.
  updateRings(list, targeted, camera, time) {
    const m = this._m;
    const q = this._q;
    const s = this._s;
    const col = new THREE.Color();
    let n = 0;
    for (const entry of list) {
      if (n >= 160) break;
      const h = entry.hold;
      q.setFromUnitVectors(UP, h.normal);
      const pulse = entry.dyno ? 1 + Math.sin(time * 6 + h.id) * 0.06 : 1;
      s.setScalar((h.spec.size * 1.8 + 0.05) * pulse);
      m.compose(h.position, q, s);
      this.rings.setMatrixAt(n, m);
      col.set(h.spec.color);
      if (entry.dyno) col.lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(0.7);
      this.rings.setColorAt(n, col);
      n++;
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;

    if (targeted) {
      this.target.visible = true;
      this.target.position.copy(targeted.position);
      this.target.quaternion.setFromUnitVectors(UP, targeted.normal);
      const k = targeted.spec.size * 2.6 + 0.1 + Math.sin(time * 5) * 0.02;
      this.target.scale.setScalar(k);
    } else {
      this.target.visible = false;
    }
    void camera;
  }
}
