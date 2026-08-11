import * as THREE from 'three';
import { pointInBox } from './physics.js';

export class ChaseCam {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0;
    this.pitch = 0.36;
    this.dist = 10.5;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.fovKick = 0;
    this.ready = false;
  }

  reset(yaw) {
    this.yaw = yaw;
    this.pitch = 0.36;
    this.ready = false;
    this.shake = 0;
  }

  aim(dx, dy) {
    this.yaw -= dx * 0.0024;
    this.pitch = Math.max(-0.32, Math.min(1.12, this.pitch + dy * 0.0019));
  }

  kick(a) { this.shake = Math.max(this.shake, a); }

  update(dt, target, colliders) {
    const focus = this.look.set(target.x, target.y + 1.35, target.z);

    const cp = Math.cos(this.pitch);
    let d = this.dist;

    // Pull the camera in if the wall behind us would swallow it.
    const dirX = Math.sin(this.yaw) * cp, dirY = Math.sin(this.pitch), dirZ = Math.cos(this.yaw) * cp;
    for (let i = 6; i >= 1; i--) {
      const s = (i / 6) * this.dist;
      const x = focus.x + dirX * s, y = focus.y + dirY * s, z = focus.z + dirZ * s;
      if (colliders.some((c) => c.solid && pointInBox(x, y, z, c, 0.45))) d = Math.min(d, s - 0.7);
    }
    d = Math.max(2.4, d);

    const px = focus.x + dirX * d, py = focus.y + dirY * d, pz = focus.z + dirZ * d;

    if (!this.ready) { this.pos.set(px, py, pz); this.ready = true; }
    else this.pos.lerp({ x: px, y: py, z: pz }, Math.min(1, dt * 13));

    this.shake = Math.max(0, this.shake - dt * 2.6);
    const s = this.shake * this.shake * 0.55;
    this.cam.position.set(
      this.pos.x + (Math.random() - 0.5) * s,
      this.pos.y + (Math.random() - 0.5) * s,
      this.pos.z + (Math.random() - 0.5) * s
    );
    this.cam.lookAt(focus);

    const targetFov = 62 + this.fovKick;
    this.fovKick *= Math.max(0, 1 - dt * 4);
    if (Math.abs(this.cam.fov - targetFov) > 0.01) {
      this.cam.fov += (targetFov - this.cam.fov) * Math.min(1, dt * 8);
      this.cam.updateProjectionMatrix();
    }
  }
}
