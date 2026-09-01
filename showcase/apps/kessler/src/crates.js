import * as THREE from '../vendor/three.module.js';
import { TUNE } from './player.js';

const BODY = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const MAT = new THREE.MeshStandardMaterial({
  color: 0x2c6d59, metalness: 0.4, roughness: 0.5, emissive: 0x0e4f38, emissiveIntensity: 0.9,
});
const CAGE = new THREE.MeshBasicMaterial({ color: 0x3affc0, wireframe: true, transparent: true, opacity: 0.5 });

// Crates you throw stay in play. They are still salvage — if you can catch them.
export class DebrisCrates {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn(pos, vel) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(new THREE.Mesh(BODY, MAT));
    const cage = new THREE.Mesh(new THREE.BoxGeometry(1.62, 1.62, 1.62), CAGE);
    g.add(cage);
    this.scene.add(g);
    this.items.push({
      group: g,
      vel: vel.clone(),
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.6),
      age: 0,
    });
  }

  update(dt, player, onCollect) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const c = this.items[i];
      c.age += dt;
      c.group.position.addScaledVector(c.vel, dt);
      c.group.rotation.x += c.spin.x * dt;
      c.group.rotation.y += c.spin.y * dt;
      c.group.rotation.z += c.spin.z * dt;

      if (c.group.position.lengthSq() > 420 * 420) { this.remove(i); continue; }

      if (c.age > 1.1 && player.cargo < TUNE.rack && c.group.position.distanceTo(player.pos) < 2.3) {
        const total = player.mass + TUNE.crateMass;
        player.vel.multiplyScalar(player.mass / total).addScaledVector(c.vel, TUNE.crateMass / total);
        player.cargo += 1;
        this.remove(i);
        onCollect();
      }
    }
  }

  remove(i) {
    const c = this.items[i];
    this.scene.remove(c.group);
    c.group.children.forEach((m) => { if (m.geometry !== BODY) m.geometry.dispose(); });
    this.items.splice(i, 1);
  }

  clear() {
    while (this.items.length) this.remove(this.items.length - 1);
  }
}
