import * as THREE from '../vendor/three.module.js';

const CHUNK_MAT = new THREE.MeshStandardMaterial({ color: 0x77808e, metalness: 0.6, roughness: 0.62, flatShading: true });
const PANEL_MAT = new THREE.MeshStandardMaterial({ color: 0x2a3a6b, metalness: 0.4, roughness: 0.35, flatShading: true });

export class DebrisField {
  constructor(scene, rng, count) {
    this.scene = scene;
    this.rng = rng;
    this.items = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    for (let i = 0; i < count; i++) this.spawn(true);
  }

  spawn(initial = false) {
    const rng = this.rng;
    const r = rng.range(0.7, 2.6);
    const geo = rng() < 0.6
      ? new THREE.IcosahedronGeometry(r, 0)
      : new THREE.BoxGeometry(r * 1.8, r * 0.5, r * 1.4);
    const mesh = new THREE.Mesh(geo, rng() < 0.7 ? CHUNK_MAT : PANEL_MAT);

    // Debris is on a straight run through the work zone: pick an entry point on a
    // sphere and aim it at a random point near the station.
    const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    const start = dir.clone().multiplyScalar(rng.range(140, 210));
    const target = new THREE.Vector3(rng.range(-70, 70), rng.range(-30, 30), rng.range(-30, 30));
    const vel = target.sub(start).normalize().multiplyScalar(rng.range(1.6, 5.2));

    if (initial) start.addScaledVector(vel, rng.range(0, 45));
    mesh.position.copy(start);
    this.group.add(mesh);

    const item = {
      mesh,
      radius: r * 1.1,
      mass: r * 22,
      vel,
      spin: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(rng.range(0.1, 0.9)),
    };
    this.items.push(item);
    return item;
  }

  update(dt) {
    for (const d of this.items) {
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.mesh.position.lengthSq() > 260 * 260 && d.mesh.position.dot(d.vel) > 0) {
        this.recycle(d);
      }
    }
  }

  recycle(d) {
    const rng = this.rng;
    const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
    d.mesh.position.copy(dir).multiplyScalar(rng.range(170, 230));
    const target = new THREE.Vector3(rng.range(-70, 70), rng.range(-30, 30), rng.range(-30, 30));
    d.vel.copy(target.sub(d.mesh.position).normalize().multiplyScalar(rng.range(1.6, 5.2)));
  }

  // Elastic-ish bounce against the player sphere; returns closure speed on a hit.
  collide(pos, vel, radius, playerMass) {
    for (const d of this.items) {
      const rel = pos.clone().sub(d.mesh.position);
      const dist = rel.length();
      const sum = radius + d.radius;
      if (dist > sum || dist < 1e-4) continue;

      const n = rel.divideScalar(dist);
      const rv = vel.clone().sub(d.vel);
      const closing = rv.dot(n);
      pos.addScaledVector(n, sum - dist + 0.02);
      if (closing >= 0) continue;

      const e = 0.4;
      const j = (-(1 + e) * closing) / (1 / playerMass + 1 / d.mass);
      vel.addScaledVector(n, j / playerMass);
      d.vel.addScaledVector(n, -j / d.mass);
      return -closing;
    }
    return 0;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const d of this.items) d.mesh.geometry.dispose();
    this.items.length = 0;
  }
}
