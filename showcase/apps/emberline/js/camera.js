import * as THREE from 'three';

const MODES = ['chase', 'cockpit', 'wide'];

export class Rig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 0;
    this.tactical = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.f = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.briefT = 0;
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
    return MODES[this.mode];
  }

  get name() {
    return MODES[this.mode];
  }

  snap(plane) {
    const f = plane.forward(this.f);
    this.pos.copy(plane.pos).addScaledVector(f, -46);
    this.pos.y += 15;
    this.look.copy(plane.pos).addScaledVector(f, 30);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }

  follow(plane, dt, wantTactical, terrain) {
    this.tactical += ((wantTactical ? 1 : 0) - this.tactical) * Math.min(1, dt * 4.5);
    const f = plane.forward(this.f);
    const mode = MODES[this.mode];

    if (mode === 'cockpit') {
      this.pos.copy(plane.pos).addScaledVector(f, 4.5);
      this.pos.y += 2.2;
      this.look.copy(plane.pos).addScaledVector(f, 120);
      this.up.set(0, 1, 0).applyAxisAngle(f, -plane.roll);
    } else {
      const back = mode === 'wide' ? 96 : 46;
      const up = mode === 'wide' ? 34 : 15;
      this.tmp.copy(plane.pos).addScaledVector(f, -back);
      this.tmp.y += up;
      this.pos.lerp(this.tmp, Math.min(1, dt * 3.4));
      this.look.copy(plane.pos).addScaledVector(f, 30);
      this.look.y -= 2;
      this.up.set(0, 1, 0).applyAxisAngle(f, -plane.roll * 0.4);
    }

    if (this.tactical > 0.01) {
      this.tmp.set(plane.pos.x, plane.pos.y + 430, plane.pos.z + 120);
      this.tmp2.copy(plane.pos);
      this.pos.lerp(this.tmp, this.tactical);
      this.look.lerp(this.tmp2, this.tactical);
      this.up.lerp(new THREE.Vector3(0, 1, 0).lerp(new THREE.Vector3(0, 0, -1), this.tactical), 0.5).normalize();
    }

    if (terrain) {
      const floor = terrain.heightAt(this.pos.x, this.pos.z) + 6;
      if (this.pos.y < floor) this.pos.y = floor;
    }

    this.cam.position.copy(this.pos);
    this.cam.up.copy(this.up);
    this.cam.lookAt(this.look);
  }

  brief(dt, target, radius) {
    this.briefT += dt * 0.11;
    const a = this.briefT;
    this.cam.position.set(
      target.x + Math.cos(a) * radius,
      target.y + radius * 0.62,
      target.z + Math.sin(a) * radius
    );
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(target.x, target.y + 20, target.z);
  }
}
