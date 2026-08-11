import * as THREE from 'three';
import { clamp, lerp } from './sailing.js';

export const CAMERA_MODES = ['CHASE', 'HELM', 'ORBIT'];

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.pos = new THREE.Vector3(0, 8, -20);
    this.look = new THREE.Vector3();
    this.orbitAngle = 0;
    this.baseFov = 62;
    this.shake = 0;
  }

  cycle() {
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
    return CAMERA_MODES[this.mode];
  }

  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  update(state, waterY, dt, time) {
    const fx = Math.sin(state.heading);
    const fz = Math.cos(state.heading);
    const speedT = clamp(state.speed / 10, 0, 1);
    const mode = CAMERA_MODES[this.mode];

    let target;
    let lookAt;
    let fov;

    if (mode === 'HELM') {
      // On the tiller: the horizon tilts with you, which is most of the reason
      // heel feels like anything at all.
      const sx = fz, sz = -fx;
      const side = Math.sign(state.heel || 1);
      target = new THREE.Vector3(
        state.x - fx * 1.5 + sx * side * 0.75,
        waterY + 1.85 - state.heel * 0.5,
        state.z - fz * 1.5 + sz * side * 0.75,
      );
      lookAt = new THREE.Vector3(state.x + fx * 18, waterY + 2.4, state.z + fz * 18);
      fov = this.baseFov + speedT * 9;
      this.pos.lerp(target, 1 - Math.exp(-26 * dt));
      this.look.lerp(lookAt, 1 - Math.exp(-16 * dt));
    } else if (mode === 'ORBIT') {
      this.orbitAngle += dt * 0.28;
      const r = 24;
      target = new THREE.Vector3(
        state.x + Math.sin(this.orbitAngle) * r,
        waterY + 9 + Math.sin(time * 0.4) * 1.5,
        state.z + Math.cos(this.orbitAngle) * r,
      );
      lookAt = new THREE.Vector3(state.x, waterY + 3, state.z);
      fov = this.baseFov;
      this.pos.lerp(target, 1 - Math.exp(-6 * dt));
      this.look.lerp(lookAt, 1 - Math.exp(-10 * dt));
    } else {
      const dist = lerp(15.5, 20.5, speedT);
      const height = lerp(6.2, 7.4, speedT);
      target = new THREE.Vector3(
        state.x - fx * dist - state.vx * 0.22,
        waterY + height,
        state.z - fz * dist - state.vz * 0.22,
      );
      lookAt = new THREE.Vector3(state.x + fx * 7, waterY + 2.6, state.z + fz * 7);
      fov = this.baseFov + speedT * 12;
      this.pos.lerp(target, 1 - Math.exp(-5.5 * dt));
      this.look.lerp(lookAt, 1 - Math.exp(-8 * dt));
    }

    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake;

    this.camera.position.copy(this.pos);
    if (sh > 0.0001) {
      this.camera.position.x += Math.sin(time * 47) * sh * 0.35;
      this.camera.position.y += Math.sin(time * 61 + 1.7) * sh * 0.28;
    }
    this.camera.lookAt(this.look);

    if (mode === 'HELM') this.camera.rotation.z += state.heel * 0.55;
    else this.camera.rotation.z += state.heel * 0.14;

    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-4 * dt));
    this.camera.updateProjectionMatrix();
  }

  snap(state, waterY) {
    const fx = Math.sin(state.heading);
    const fz = Math.cos(state.heading);
    this.pos.set(state.x - fx * 16, waterY + 6.2, state.z - fz * 16);
    this.look.set(state.x + fx * 7, waterY + 2.6, state.z + fz * 7);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
