import * as THREE from '../vendor/three.module.js';
import { boxGeo, mergeGeos, rnd } from './build3d.js';
import { makePiece, pieceDrop } from './pieces.js';

const A0 = 2.15, A1 = 4.13;   // the lay-down fan, opposite the building

export class Yard {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rand = rnd(seed);
    this.piece = null;
    this.spec = null;

    const g = [];
    // flatbed
    g.push(boxGeo(9, 0.5, 3, -21, 1.1, -8));
    g.push(boxGeo(3, 1.9, 2.8, -26.5, 1.7, -8));
    for (const [x, z] of [[-17.5, -6.7], [-17.5, -9.3], [-24.5, -6.7], [-24.5, -9.3], [-26.6, -6.7], [-26.6, -9.3]]) {
      g.push(boxGeo(1.5, 1.5, 0.7, x, 0.75, z));
    }
    // site cabins
    g.push(boxGeo(7, 2.8, 3.2, -14, 1.4, 12));
    g.push(boxGeo(7, 2.8, 3.2, -14, 4.3, 12));
    g.push(boxGeo(5, 2.6, 3, -23, 1.3, 13.5));
    // material stacks
    for (let i = 0; i < 5; i++) g.push(boxGeo(8.5, 0.7, 1.0, -19 + this.rand() * 2, 0.35 + i * 0.75, 3 + i * 0.15));
    for (let i = 0; i < 3; i++) g.push(boxGeo(4.6, 0.35, 3.6, -27, 0.2 + i * 0.4, 1));
    const m = new THREE.Mesh(mergeGeos(g), new THREE.MeshStandardMaterial({ color: 0x6f7681, roughness: 0.85 }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);

    const cones = [];
    for (let i = 0; i < 22; i++) {
      const a = A0 + this.rand() * (A1 - A0);
      const r = 9 + this.rand() * 20;
      cones.push(boxGeo(0.5, 0.75, 0.5, Math.cos(a) * r, 0.38, -Math.sin(a) * r));
    }
    const cm = new THREE.Mesh(mergeGeos(cones), new THREE.MeshStandardMaterial({ color: 0xff7a3d, roughness: 0.9 }));
    cm.castShadow = true;
    scene.add(cm);

    this.debris = [];
  }

  deliver(spec) {
    this.clear();
    this.spec = spec;
    const [r0, r1] = spec.spawn;
    const r = r0 + this.rand() * (r1 - r0);
    const a = A0 + this.rand() * (A1 - A0);
    const mesh = makePiece(spec);
    mesh.position.set(Math.cos(a) * r, pieceDrop(spec), -Math.sin(a) * r);
    mesh.rotation.y = (this.rand() - 0.5) * Math.PI * 1.6;
    this.scene.add(mesh);
    this.piece = mesh;
    return mesh;
  }

  // Set a carried piece back down where it is — always allowed over the yard,
  // so a bad approach costs time instead of a dropped load.
  setDown(pos, yaw) {
    const mesh = makePiece(this.spec);
    mesh.position.set(pos.x, pieceDrop(this.spec), pos.z);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    this.piece = mesh;
    return mesh;
  }

  clear() {
    if (this.piece) { this.scene.remove(this.piece); this.piece = null; }
  }

  resetRun() {
    this.clear();
    for (const d of this.debris) this.scene.remove(d.mesh);
    this.debris.length = 0;
    this.spec = null;
  }

  take() { const p = this.piece; this.piece = null; return p; }

  inYard(x, z) { return x < -3 && Math.hypot(x, z) < 34; }

  latchTarget(hookPos) {
    if (!this.piece) return null;
    const p = this.piece.position;
    const d = Math.hypot(hookPos.x - p.x, hookPos.z - p.z);
    const dy = hookPos.y - p.y;
    if (d < 2.4 && dy > -1.2 && dy < 2.2) return this.piece;
    return null;
  }

  // A dropped piece is not deleted, it is dropped: it falls, it lands badly and
  // it stays there for the rest of the shift as evidence.
  drop(pos, yaw, vel, spec) {
    const mesh = makePiece(spec);
    mesh.position.copy(pos);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
    this.debris.push({ mesh, vel: vel.clone(), spin: (this.rand() - 0.5) * 3, spec, dead: false });
  }

  stepDebris(dt) {
    let landed = 0;
    for (const d of this.debris) {
      if (d.dead) continue;
      d.vel.y -= 9.81 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.y += d.spin * dt;
      d.mesh.rotation.z += d.spin * dt * 0.6;
      if (d.mesh.position.y - pieceDrop(d.spec) <= 0) {
        d.mesh.position.y = pieceDrop(d.spec);
        d.mesh.rotation.z = (this.rand() - 0.5) * 0.5;
        d.mesh.rotation.x = (this.rand() - 0.5) * 0.4;
        d.dead = true;
        landed++;
      }
    }
    return landed;
  }
}
