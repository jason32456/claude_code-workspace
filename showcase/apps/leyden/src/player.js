import * as THREE from '../vendor/three.module.js';
import { heightAt } from './world.js';
import { CLOUD_BASE, WORLD_HALF } from './scene.js';

export const CHARGE_CAP = 100;
const STREAMER_LEN = 15;

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 70, 92);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.trim = 0;
    this.charge = 0;
    this.heat = 0;
    this.hull = 3;
    this.alive = true;
    this.streamer = false;
    this.streamerAmount = 0;
    this.hitFlash = 0;
    this.strikesTaken = 0;
    this.grounded = false;
    this.strikeRadius = 5;

    this.group = new THREE.Group();
    this._build();
    scene.add(this.group);
  }

  _build() {
    const hullMat = new THREE.MeshLambertMaterial({ color: 0x6d6a63 });
    const envelope = new THREE.Mesh(new THREE.SphereGeometry(3.0, 18, 12), hullMat);
    envelope.scale.set(1, 1.05, 2.5);
    envelope.position.y = 1.2;
    this.group.add(envelope);
    this.envelope = envelope;
    this.hullMat = hullMat;

    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(2.9, 0.2, 6, 20),
      new THREE.MeshLambertMaterial({ color: 0x2d3a46 })
    );
    stripe.rotation.y = Math.PI / 2;
    stripe.position.y = 1.2;
    stripe.scale.set(1, 1.02, 1);
    this.group.add(stripe);

    const gondola = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.6, 5.2),
      new THREE.MeshLambertMaterial({ color: 0x3a3128 })
    );
    gondola.position.y = -2.6;
    this.group.add(gondola);

    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
    lamp.position.set(0, -2.6, -2.9);
    this.group.add(lamp);

    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 2.6, 2.2),
        new THREE.MeshLambertMaterial({ color: 0x4c4a45 })
      );
      fin.position.set(sx * 1.6, 1.2, 7.2);
      fin.rotation.z = sx * 0.5;
      this.group.add(fin);
    }
    const topFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 3, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x4c4a45 })
    );
    topFin.position.set(0, 3.2, 7.2);
    this.group.add(topFin);

    this.prop = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.25, 0.25),
      new THREE.MeshLambertMaterial({ color: 0x8b8578 })
    );
    this.prop.position.set(0, -2.6, 3.1);
    this.group.add(this.prop);

    // Corona: reads the charge without the player looking at a number.
    this.coronaMat = new THREE.MeshBasicMaterial({
      color: 0x7fe3ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.corona = new THREE.Mesh(new THREE.SphereGeometry(4.1, 16, 12), this.coronaMat);
    this.corona.scale.set(1, 1.05, 2.4);
    this.corona.position.y = 1.2;
    this.group.add(this.corona);

    // Streamer: the bait. Long conductive tail dropped from the gondola.
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(0, -3.4 - i * (STREAMER_LEN / 8), 0));
    this.streamerGeo = new THREE.BufferGeometry().setFromPoints(pts);
    this.streamerMat = new THREE.LineBasicMaterial({
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0,
    });
    this.streamerLine = new THREE.Line(this.streamerGeo, this.streamerMat);
    this.group.add(this.streamerLine);

    this.tipMat = new THREE.MeshBasicMaterial({
      color: 0xcdf3ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.tip = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), this.tipMat);
    this.group.add(this.tip);
  }

  reset(startPos) {
    this.pos.copy(startPos);
    this.vel.set(0, 0, 0);
    this.charge = 0;
    this.heat = 0;
    this.hull = 3;
    this.alive = true;
    this.streamer = false;
    this.streamerAmount = 0;
    this.hitFlash = 0;
    this.strikesTaken = 0;
    this.trim = 0;
    this.yaw = Math.PI;
  }

  /** Where a leader can actually attach: the streamer tip when it is out. */
  strikePoint() {
    return new THREE.Vector3(
      this.pos.x,
      this.pos.y - 3.4 - STREAMER_LEN * this.streamerAmount,
      this.pos.z
    );
  }

  attractiveness() {
    const alt = 1 + (this.pos.y / 150) * 1.6;
    const greed = 1 + this.charge / CHARGE_CAP;
    const bait = 1 + this.streamerAmount * 6;
    return 0.6 * alt * greed * bait;
  }

  update(dt, input, wind, t) {
    if (!this.alive) return;

    this.yaw = input.yaw;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const acc = new THREE.Vector3();
    acc.addScaledVector(fwd, input.move.y * 17);
    acc.addScaledVector(right, input.move.x * 11);

    // Vertical is deliberately laggy: you cannot dodge a bolt after it starts.
    const wantTrim = input.vertical;
    this.trim += (wantTrim - this.trim) * Math.min(1, dt * 1.6);
    acc.y += this.trim * 12;

    const rel = this.vel.clone().sub(wind);
    acc.x -= rel.x * 0.72;
    acc.z -= rel.z * 0.72;
    acc.y -= rel.y * 0.95;

    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);

    // Bounds. The ceiling is the cloud base; the floor is the valley.
    const ground = heightAt(this.pos.x, this.pos.z) + 7;
    this.grounded = false;
    if (this.pos.y < ground) {
      this.pos.y = ground;
      if (this.vel.y < 0) this.vel.y *= -0.15;
      this.grounded = true;
    }
    const ceil = CLOUD_BASE - 24;
    if (this.pos.y > ceil) {
      this.pos.y = ceil;
      if (this.vel.y > 0) this.vel.y = 0;
    }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WORLD_HALF) {
      const k = WORLD_HALF / r;
      this.pos.x *= k;
      this.pos.z *= k;
      this.vel.x *= 0.4;
      this.vel.z *= 0.4;
    }

    // Streamer deploy / stow.
    const target = input.bait ? 1 : 0;
    this.streamerAmount += (target - this.streamerAmount) * Math.min(1, dt * (target ? 3.4 : 5));
    this.streamer = this.streamerAmount > 0.5;

    // Heat is the timer on every payload.
    const q = this.charge / CHARGE_CAP;
    this.heat += (q * 15.5 - 7.5) * dt;
    if (this.heat < 0) this.heat = 0;
    if (this.heat > 100) {
      this.heat = 100;
      this.overheatTimer = (this.overheatTimer || 0) + dt;
      if (this.overheatTimer > 1.4) {
        this.overheatTimer = 0;
        this.damage(1);
      }
    } else {
      this.overheatTimer = 0;
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);
    this._syncVisuals(dt, t);
  }

  _syncVisuals(dt, t) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const lateral = Math.min(1, this.vel.length() / 26);
    this.group.rotation.z = -this.trim * 0.06;
    this.group.rotation.x = -this.trim * 0.16 + lateral * 0.02;

    this.prop.rotation.z += dt * 26;

    const q = this.charge / CHARGE_CAP;
    const pulse = 0.5 + 0.5 * Math.sin(t * (7 + q * 26));
    this.coronaMat.opacity = q * (0.14 + pulse * 0.14) + this.hitFlash * 0.6;
    this.corona.scale.set(1 + q * 0.1, 1.05 + q * 0.1, 2.4 + q * 0.2);

    const heatMix = Math.min(1, this.heat / 100);
    this.hullMat.color.setRGB(
      0.43 + heatMix * 0.5 + this.hitFlash,
      0.42 - heatMix * 0.16 + this.hitFlash * 0.8,
      0.39 - heatMix * 0.28 + this.hitFlash * 0.8
    );

    const s = this.streamerAmount;
    this.streamerMat.opacity = s * (0.5 + q * 0.5);
    const arr = this.streamerGeo.attributes.position.array;
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      arr[i * 3] = Math.sin(t * 2.2 + f * 3) * f * 1.6;
      arr[i * 3 + 1] = -3.4 - f * STREAMER_LEN * s;
      arr[i * 3 + 2] = Math.cos(t * 1.7 + f * 2.4) * f * 1.4;
    }
    this.streamerGeo.attributes.position.needsUpdate = true;
    this.tip.position.set(arr[24], arr[25], arr[26]);
    this.tipMat.opacity = s * (0.35 + q * 0.5 + pulse * 0.2);
    this.tip.scale.setScalar(0.7 + s * 0.5 + q * 0.6);
  }

  takeStrike(power) {
    const before = this.charge;
    this.charge = Math.min(CHARGE_CAP, this.charge + power);
    this.strikesTaken++;
    this.hitFlash = 1;
    // The arrestor copes with one hit. Taking a second while already loaded is
    // what actually kills you.
    if (before / CHARGE_CAP > 0.68) this.damage(1);
    return this.charge - before;
  }

  damage(n) {
    this.hull -= n;
    this.hitFlash = 1;
    if (this.hull <= 0) {
      this.hull = 0;
      this.alive = false;
    }
  }

  bleed(dt, rate) {
    const amount = Math.min(this.charge, rate * dt);
    this.charge -= amount;
    return amount;
  }
}
