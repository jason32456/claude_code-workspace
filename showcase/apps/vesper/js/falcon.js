// A peregrine is six states, and every one of them is readable from the air —
// that is the whole point, because the counter to a stoop is timing.

import * as THREE from '../vendor/three.module.js';
import { FALCON, FLOCK } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Falcon {
  constructor(scene, spec, index) {
    this.spec = spec;
    this.index = index;
    this.timid = spec.timid || 0;
    this.x = 0; this.y = 200; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.state = 'wait';
    this.t = spec.delay || 0;
    this.target = -1;
    this.active = false;
    this.side = index % 2 === 0 ? 1 : -1;
    this.orbit = Math.random() * 6.28;
    this.ix = 0; this.iy = 0; this.iz = 0;
    this.committed = false;
    this.events = [];
    this.build(scene);
  }

  build(scene) {
    this.root = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x2c2b33 });
    const pale = new THREE.MeshLambertMaterial({ color: 0xa79c92 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.62, 3.4, 6), dark);
    body.rotation.x = Math.PI / 2;
    this.root.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), pale);
    chest.position.set(0, -0.18, 0.5);
    this.root.add(chest);
    const wingGeo = new THREE.BoxGeometry(3.4, 0.16, 1.15);
    wingGeo.translate(1.7, 0, -0.2);
    this.wingL = new THREE.Mesh(wingGeo, dark);
    this.wingR = new THREE.Mesh(wingGeo, dark);
    this.wingR.scale.x = -1;
    this.root.add(this.wingL, this.wingR);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.5), dark);
    tail.position.z = -2.0;
    this.root.add(tail);
    this.root.visible = false;
    this.root.scale.setScalar(0.95);
    scene.add(this.root);
    this.scene = scene;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  enter(flock) {
    const a = Math.random() * 6.28;
    this.x = flock.cx - 150 + Math.cos(a) * 60;
    this.y = flock.cy + FALCON.patrolHeight;
    this.z = flock.cz + this.side * 130;
    this.state = 'patrol';
    this.t = 4 + Math.random() * 4 + this.timid * 8;
    this.root.visible = true;
    this.events.push('enter');
  }

  seek(tx, ty, tz, speed, dt) {
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const wx = (dx / d) * speed, wy = (dy / d) * speed, wz = (dz / d) * speed;
    const k = 1 - Math.exp(-dt * 2.2);
    this.vx += (wx - this.vx) * k;
    this.vy += (wy - this.vy) * k;
    this.vz += (wz - this.vz) * k;
  }

  update(dt, flock, terrain, time) {
    this.t -= dt;
    const st = this.state;

    if (st === 'wait') {
      if (this.t <= 0 && flock.count > 0) this.enter(flock);
      return;
    }

    if (st === 'patrol') {
      this.orbit += dt * 0.55;
      const r = FALCON.patrolRadius;
      const tx = flock.cx + Math.cos(this.orbit) * r * 0.8 + 40;
      const tz = flock.cz + Math.sin(this.orbit) * r * this.side;
      const ty = flock.cy + FALCON.patrolHeight;
      this.seek(tx, ty, tz, FALCON.cruise, dt);
      if (this.t <= 0) {
        this.state = 'climb';
        this.t = FALCON.climbTime;
        this.events.push('climb');
      }
    } else if (st === 'climb') {
      const lead = flock.speed * 2.2;
      this.seek(
        flock.cx + flock.vcx * 0.9 + lead,
        flock.cy + FALCON.climbHeight,
        flock.cz + flock.vcz * 0.9 + this.side * 40,
        FALCON.cruise * 1.3, dt,
      );
      if (this.t <= 0) {
        this.target = flock.pickTarget();
        if (this.target < 0) { this.state = 'patrol'; this.t = 5; }
        else { this.state = 'lock'; this.t = FALCON.lockTime * (1 + this.timid); this.events.push('lock'); }
      }
    } else if (st === 'lock') {
      // hold station over the flock rather than letting it fly out from under
      this.seek(flock.cx + flock.vcx * 1.4, this.y, flock.cz + flock.vcz * 1.4, FALCON.cruise, dt);
      if (flock.state[this.target] !== 1) this.target = flock.pickTarget();
      if (this.t <= 0) {
        if (this.target < 0 || flock.state[this.target] !== 1) {
          this.state = 'patrol'; this.t = 5;
        } else {
          this.state = 'stoop';
          this.committed = false;
          this.t = 4.5;
          this.events.push('stoop');
        }
      }
    } else if (st === 'stoop') {
      const i = this.target;
      if (i < 0 || flock.state[i] !== 1) { this.miss(); return; }
      const dist = Math.hypot(flock.px[i] - this.x, flock.py[i] - this.y, flock.pz[i] - this.z);
      if (!this.committed) {
        const tt = clamp(dist / FALCON.stoopSpeed, 0, 1.4);
        this.ix = flock.px[i] + flock.vx[i] * tt;
        this.iy = flock.py[i] + flock.vy[i] * tt;
        this.iz = flock.pz[i] + flock.vz[i] * tt;
        if (dist < FALCON.stoopCommit) this.committed = true;
      }
      const dx = this.ix - this.x, dy = this.iy - this.y, dz = this.iz - this.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const s = FALCON.stoopSpeed;
      const k = 1 - Math.exp(-dt * (this.committed ? 1.5 : 4.0));
      this.vx += ((dx / d) * s - this.vx) * k;
      this.vy += ((dy / d) * s - this.vy) * k;
      this.vz += ((dz / d) * s - this.vz) * k;
      const closing = (dx * this.vx + dy * this.vy + dz * this.vz);
      if (d < 4 || closing < 0 || this.t <= 0) this.resolve(flock);
    } else if (st === 'carry' || st === 'recover') {
      this.seek(this.x + this.vx, flock.cy + FALCON.climbHeight + 60, this.z + this.side * 60, FALCON.cruise * 1.1, dt);
      if (this.t <= 0) {
        this.state = 'patrol';
        this.t = 4 + Math.random() * 5;
        this.orbit = Math.random() * 6.28;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    const gy = terrain.heightAt(this.x, this.z) + 8;
    if (this.y < gy) { this.y = gy; this.vy = Math.abs(this.vy) * 0.4; }

    // orientation
    const sp = Math.hypot(this.vx, this.vy, this.vz) || 1;
    this.root.position.set(this.x, this.y, this.z);
    this.root.lookAt(this.x + this.vx / sp, this.y + this.vy / sp, this.z + this.vz / sp);
    const tuck = this.state === 'stoop' ? 1 : 0;
    const flap = Math.sin(time * 6.5 + this.index) * 0.45 * (1 - tuck);
    this.wingL.rotation.z = flap - tuck * 1.15;
    this.wingR.rotation.z = -flap + tuck * 1.15;
    this.active = this.state === 'stoop' || this.state === 'lock';
  }

  resolve(flock) {
    const i = this.target;
    if (i < 0 || flock.state[i] !== 1) { this.miss(); return; }
    const protectedByFlash = flock.flashT > FLOCK.flashDecay - FALCON.flashWindow;
    const confusion = FALCON.confusionLoose
      + (FALCON.confusionTight - FALCON.confusionLoose) * flock.localDensity(i);
    const p = FALCON.baseKill * (1 - confusion) * (0.35 + flock.exposure[i] * 0.9) * (1 - this.timid * 0.4);
    if (!protectedByFlash && Math.random() < p) {
      flock.kill(i, true);
      flock.panic(this.x, this.y, this.z, 26);
      flock.drainAll(0.06);
      this.state = 'carry';
      this.t = FALCON.fedRest;
      this.events.push('kill');
    } else {
      flock.panic(this.x, this.y, this.z, 16);
      this.miss();
    }
    this.target = -1;
    this.active = false;
  }

  miss() {
    this.state = 'recover';
    this.t = FALCON.missRest;
    this.target = -1;
    this.events.push('miss');
  }

  // What the HUD needs: how worried to look, and which way to look.
  threat(flock) {
    if (this.state === 'wait') return null;
    const dx = this.x - flock.cx, dz = this.z - flock.cz;
    return {
      state: this.state,
      dist: Math.hypot(dx, this.y - flock.cy, dz),
      bearing: Math.atan2(dz, dx),
      stooping: this.state === 'stoop',
      locked: this.state === 'lock',
      committed: this.committed,
    };
  }
}
