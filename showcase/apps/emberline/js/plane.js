import * as THREE from 'three';
import { PLANE, WORLD } from './config.js';

function buildModel() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xdfe3e6 });
  const red = new THREE.MeshLambertMaterial({ color: 0xc23a1c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a3038 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x0f1a22 });

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.1, 15, 10), white);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), white);
  nose.position.z = -7.2;
  nose.scale.set(1, 0.9, 1.5);
  g.add(nose);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 11), red);
  belly.position.set(0, -1.1, 0.5);
  g.add(belly);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 3), glass);
  canopy.position.set(0, 1.1, -4.2);
  g.add(canopy);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 3.6), white);
  wing.position.set(0, 1.6, -0.6);
  g.add(wing);

  const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 1.4), dark);
  strutL.position.set(-3, 0.8, -0.6);
  g.add(strutL);
  const strutR = strutL.clone();
  strutR.position.x = 3;
  g.add(strutR);

  for (const s of [-5.5, 5.5]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 3.6, 8), dark);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(s, 1.7, -2.2);
    g.add(eng);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.16, 0.5), dark);
    prop.position.set(s, 1.7, -4.1);
    g.add(prop);
    prop.userData.prop = true;
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 3), red);
  tail.position.set(0, 2.6, 6.4);
  g.add(tail);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(9, 0.4, 2.2), white);
  stab.position.set(0, 1.2, 6.8);
  g.add(stab);

  const tipL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 2.6), red);
  tipL.position.set(-11.6, 1.7, -0.6);
  g.add(tipL);
  const tipR = tipL.clone();
  tipR.position.x = 11.6;
  g.add(tipR);

  return g;
}

export class Plane {
  constructor(terrain) {
    this.t = terrain;
    this.mesh = buildModel();
    this.props = this.mesh.children.filter((c) => c.userData.prop);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = PLANE.vStart;
    this.throttle = PLANE.vStart;
    this.load = PLANE.capacity;
    this.alive = true;
    this.propSpin = 0;
  }

  spawn(x, z, heading) {
    this.pos.set(x, this.t.surfaceAt(x, z) + 190, z);
    this.heading = heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = PLANE.vStart;
    this.throttle = PLANE.vStart;
    this.load = PLANE.capacity;
    this.alive = true;
    this.sync();
  }

  get agl() {
    return this.pos.y - this.t.surfaceAt(this.pos.x, this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.heading) * cp, Math.sin(this.pitch), -Math.cos(this.heading) * cp);
  }

  update(dt, input) {
    if (!this.alive) return;

    if (input.pitch) this.pitch += input.pitch * PLANE.pitchRate * dt;
    else this.pitch -= this.pitch * Math.min(1, dt * 1.1);
    this.pitch = Math.max(-0.62, Math.min(0.62, this.pitch));

    if (input.roll) this.roll += input.roll * PLANE.rollRate * dt;
    else this.roll -= this.roll * Math.min(1, dt * 2.0);
    this.roll = Math.max(-PLANE.rollMax, Math.min(PLANE.rollMax, this.roll));

    if (input.throttle) this.throttle += input.throttle * 30 * dt;
    this.throttle = Math.max(PLANE.vMin, Math.min(PLANE.vMax, this.throttle));

    // Bank to turn. A hard turn also costs lift, which is the whole reason a
    // low, fast turn onto a drop run is dangerous.
    this.heading += ((9.81 * Math.tan(this.roll)) / Math.max(20, this.speed)) * dt;

    const drag = (this.throttle - this.speed) * 0.45;
    this.speed += (drag - Math.sin(this.pitch) * 14) * dt;
    this.speed = Math.max(PLANE.vMin * 0.8, Math.min(PLANE.vMax * 1.25, this.speed));

    const f = this.forward();
    const sink = (1 - Math.cos(this.roll)) * 20;
    this.vel.set(f.x * this.speed, f.y * this.speed - sink, f.z * this.speed);
    this.pos.addScaledVector(this.vel, dt);

    // Soft boundary: the map edge turns you back rather than ending the run.
    const lim = WORLD / 2 - 90;
    this.outOfBounds = Math.abs(this.pos.x) > lim || Math.abs(this.pos.z) > lim;
    if (this.outOfBounds) {
      const want = Math.atan2(-this.pos.x, this.pos.z) + Math.PI;
      let d = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.heading += Math.sign(d) * Math.min(Math.abs(d), 0.5 * dt);
      this.roll += (Math.sign(d) * 0.5 - this.roll) * dt;
    }

    if (this.pos.y > 700) this.pos.y = 700;
    this.propSpin += dt * this.speed * 0.9;
    this.sync();
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.rotateY(-this.heading);
    this.mesh.rotateX(this.pitch);
    this.mesh.rotateZ(-this.roll);
    for (const p of this.props) p.rotation.z = this.propSpin;
  }
}
