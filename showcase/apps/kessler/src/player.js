import * as THREE from '../vendor/three.module.js';
import { closestLocal } from './collide.js';

export const TUNE = {
  suitMass: 95,
  crateMass: 18,
  rack: 6,
  radius: 0.85,
  kickImpulse: 760,      // N·s at full charge, so Δv = impulse / total mass
  chargeTime: 0.95,
  cleanCatch: 3.5,       // m/s — anchors, no damage
  hardCatch: 6.5,        // m/s — anchors, costs hull; above this you bounce off
  restitution: 0.35,
  tetherRange: 95,
  reelSpeed: 6,
  reelAccel: 9,
  reelMaxClose: 5.4,     // the winch has a line speed, so a reeled-in arrival is
                         // always inside the catch envelope — slow but survivable

  throwSpeed: 11,
  puffAccel: 3.4,
  puffGas: 9,
  matchAccel: 6,
  matchGas: 4.5,
  o2Burn: 1,
  voidRadius: 260,
  dockRadius: 6,
  dockSpeed: 6,
};

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.forward = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);

    this.cargo = 0;
    this.banked = 0;
    this.o2 = 240;
    this.o2Max = 240;
    this.gas = 100;
    this.hull = 100;

    this.anchor = null;
    this.charge = 0;
    this.charging = false;
    this.tether = null;
    this.tetherTaut = false;
    this.reeling = false;
    this.events = [];

    this.mesh = buildSuit();
    scene.add(this.mesh);

    // A GL line is capped at one pixel wide on most drivers, which is far too
    // thin for the mechanic the whole game rests on — so the tether is a tube.
    const cord = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true).translate(0, 0.5, 0);
    this.tetherLine = new THREE.Mesh(cord, new THREE.MeshBasicMaterial({ color: 0x7fdcff }));
    this.tetherLine.frustumCulled = false;
    this.tetherLine.visible = false;
    scene.add(this.tetherLine);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = TUNE.tetherRange;
  }

  get mass() { return TUNE.suitMass + this.cargo * TUNE.crateMass; }
  get anchored() { return this.anchor !== null; }

  emit(kind, data = {}) { this.events.push({ kind, ...data }); }

  reset(pos) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.anchor = null;
    this.tether = null;
    this.charge = 0;
    this.cargo = 0;
    this.tetherLine.visible = false;
  }

  updateLook(dx, dy, sens = 0.0022) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.06;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    this.right.copy(this.forward).cross(tmpA.set(0, 1, 0)).normalize();
    this.up.copy(tmpA.copy(this.right).cross(this.forward)).normalize();
  }

  // ---------- verbs ----------

  beginCharge() {
    if (!this.anchored) return;
    this.charging = true;
  }

  releaseCharge() {
    if (!this.charging) return;
    const power = Math.max(0.22, this.charge);
    this.charging = false;
    this.charge = 0;
    if (!this.anchored) return;

    const n = this.anchorNormal();
    const dir = tmpA.copy(this.forward);
    const into = dir.dot(n);
    if (into < 0) dir.addScaledVector(n, -into);       // never kick into the hull
    // Just enough normal bias to clear the plating. Any more and every kick sails
    // over what the player aimed at.
    dir.addScaledVector(n, 0.06).normalize();

    const surf = this.anchorSurfaceVelocity(tmpB);
    this.releaseAnchor();
    this.vel.copy(surf).addScaledVector(dir, (TUNE.kickImpulse * power) / this.mass);
    this.pos.addScaledVector(n, 0.25);
    this.emit('kick', { power });
  }

  releaseAnchor() {
    this.anchor = null;
    this.charging = false;
    this.charge = 0;
  }

  anchorNormal(out = new THREE.Vector3()) {
    if (!this.anchor) return out.set(0, 1, 0);
    out.copy(this.anchor.localNormal).applyQuaternion(this.anchor.mesh.getWorldQuaternion(tmpQ));
    return out.normalize();
  }

  anchorSurfaceVelocity(out = new THREE.Vector3()) {
    if (!this.anchor) return out.set(0, 0, 0);
    return this.world.surfaceVelocity(this.anchor.collider, this.pos, out);
  }

  throwCrate() {
    if (this.cargo <= 0) return;
    this.cargo -= 1;
    const dir = this.forward.clone();
    const dv = (TUNE.crateMass * TUNE.throwSpeed) / this.mass;
    if (this.anchored) this.releaseAnchor();
    this.vel.addScaledVector(dir, -dv);
    this.emit('throw', { dv, dir, from: this.pos.clone(), speed: TUNE.throwSpeed });
  }

  fireTether(world, origin) {
    if (this.tether) { this.dropTether(); return; }
    this.raycaster.set(origin ? tmpA.copy(origin) : this.eyePosition(tmpA), this.forward);
    this.raycaster.far = TUNE.tetherRange;
    const hits = this.raycaster.intersectObjects(world.rayTargets, false);
    if (!hits.length) { this.emit('tether-miss'); return; }
    const hit = hits[0];
    const local = hit.object.worldToLocal(hit.point.clone());
    this.tether = {
      obj: hit.object,
      local,
      length: hit.point.distanceTo(this.pos),
      collider: world.colliderByMesh.get(hit.object.uuid) || null,
    };
    this.tetherLine.visible = true;
    this.emit('tether-hit', { dist: hit.distance });
  }

  dropTether() {
    this.tether = null;
    this.tetherTaut = false;
    this.tetherLine.visible = false;
    this.emit('tether-drop');
  }

  eyePosition(out = new THREE.Vector3()) {
    return out.copy(this.pos).addScaledVector(this.up, 0.35);
  }

  // ---------- simulation ----------

  step(dt, world, input, controlsLive) {
    this.world = world;
    const puff = { hiss: 0 };

    if (this.charging && this.anchored) {
      this.charge = Math.min(1, this.charge + dt / TUNE.chargeTime);
    }

    if (this.anchored) {
      const a = this.anchor;
      const n = this.anchorNormal(tmpC);
      this.pos.copy(a.mesh.localToWorld(a.local.clone())).addScaledVector(n, TUNE.radius);
      this.vel.copy(this.anchorSurfaceVelocity(tmpB));
    } else {
      if (controlsLive) this.applyGas(dt, input, puff);
      world.ventForce(this.pos, tmpA);
      this.vel.addScaledVector(tmpA, dt);
      this.pos.addScaledVector(this.vel, dt);
      this.applyTether(dt);
      this.collide(world);
    }

    this.guardState();
    this.updateTetherVisual();
    this.updateMesh(dt);
    return puff;
  }

  // A non-finite position or velocity would end the run with no way back, so the
  // last known-good state is kept and restored rather than trusted.
  guardState() {
    const ok = Number.isFinite(this.pos.x + this.pos.y + this.pos.z)
      && Number.isFinite(this.vel.x + this.vel.y + this.vel.z);
    if (ok) {
      this.lastGood = this.lastGood || new THREE.Vector3();
      this.lastGood.copy(this.pos);
      return;
    }
    console.warn('kessler: non-finite player state recovered');
    if (this.lastGood) this.pos.copy(this.lastGood);
    else this.pos.set(0, 40, 0);
    this.vel.set(0, 0, 0);
    this.anchor = null;
    this.dropTether();
  }

  applyGas(dt, input, puff) {
    let ax = 0;
    let az = 0;
    if (input.down('KeyW')) az += 1;
    if (input.down('KeyS')) az -= 1;
    if (input.down('KeyD')) ax += 1;
    if (input.down('KeyA')) ax -= 1;

    if ((ax || az) && this.gas > 0) {
      const dir = tmpA.set(0, 0, 0).addScaledVector(this.forward, az).addScaledVector(this.right, ax).normalize();
      const scale = TUNE.suitMass / this.mass;
      this.vel.addScaledVector(dir, TUNE.puffAccel * scale * dt);
      this.gas = Math.max(0, this.gas - TUNE.puffGas * dt);
      puff.hiss = 0.6;
    }

    if ((input.down('ShiftLeft') || input.down('ShiftRight')) && this.gas > 0) {
      const speed = this.vel.length();
      if (speed > 0.02) {
        const dv = Math.min(speed, TUNE.matchAccel * dt);
        this.vel.addScaledVector(tmpA.copy(this.vel).normalize(), -dv);
        this.gas = Math.max(0, this.gas - dv * TUNE.matchGas);
        puff.hiss = Math.max(puff.hiss, 0.9);
      }
    }
  }

  applyTether(dt) {
    if (!this.tether) return;
    const t = this.tether;
    const anchorPos = t.obj.localToWorld(t.local.clone());
    const toAnchor = tmpA.copy(anchorPos).sub(this.pos);
    const dist = toAnchor.length();
    if (dist > TUNE.tetherRange * 1.4) { this.dropTether(); return; }
    if (dist < 1e-4) return;
    toAnchor.divideScalar(dist);

    if (this.reeling) {
      t.length = Math.max(2.2, Math.min(t.length, dist) - TUNE.reelSpeed * dt);
      if (this.vel.dot(toAnchor) < TUNE.reelMaxClose) {
        this.vel.addScaledVector(toAnchor, TUNE.reelAccel * (TUNE.suitMass / this.mass) * dt);
      }
    }

    this.tetherTaut = dist >= t.length - 0.05;
    if (dist > t.length) {
      this.pos.copy(anchorPos).addScaledVector(toAnchor, -t.length);
      const outward = -this.vel.dot(toAnchor);
      if (outward > 0) this.vel.addScaledVector(toAnchor, outward * 0.96);
    }
  }

  collide(world) {
    const R = TUNE.radius;
    for (const c of world.colliders) {
      tmpA.setFromMatrixPosition(c.mesh.matrixWorld);
      if (tmpA.distanceToSquared(this.pos) > (c.radius + R + 0.5) ** 2) continue;

      const l = tmpB.copy(this.pos).applyMatrix4(c.inv);
      const closest = new THREE.Vector3();
      const nLocal = new THREE.Vector3();
      const res = closestLocal(c, l, closest, nLocal);
      if (!res.inside && res.dist > R) continue;

      const q = c.mesh.getWorldQuaternion(tmpQ);
      const nWorld = nLocal.clone().applyQuaternion(q).normalize();
      const contact = closest.clone().applyMatrix4(c.mesh.matrixWorld);

      this.pos.copy(contact).addScaledVector(nWorld, R);

      const surf = world.surfaceVelocity(c, contact, new THREE.Vector3());
      const rel = this.vel.clone().sub(surf);
      const vn = rel.dot(nWorld);
      const speed = -vn;

      if (vn < 0) {
        if (speed <= TUNE.hardCatch) {
          this.attach(c, contact, nLocal, closest);
          const hard = speed > TUNE.cleanCatch;
          if (hard) this.damage((speed - TUNE.cleanCatch) * 3, 'catch');
          this.emit('catch', { speed, hard });
        } else {
          const tangent = rel.clone().addScaledVector(nWorld, -vn);
          rel.copy(tangent.multiplyScalar(0.72)).addScaledVector(nWorld, speed * TUNE.restitution);
          this.vel.copy(rel).add(surf);
          this.pos.addScaledVector(nWorld, 0.05);
          this.damage(6 + (speed - TUNE.hardCatch) * 4.5, 'impact');
          this.emit('bounce', { speed });
        }
      }
      return;
    }
  }

  attach(collider, contact, nLocal, localPoint) {
    this.anchor = {
      collider,
      mesh: collider.mesh,
      local: localPoint.clone(),
      localNormal: nLocal.clone(),
    };
    this.vel.copy(this.world.surfaceVelocity(collider, contact, tmpB));
    if (this.tetherTaut === false && this.tether && this.reeling) this.reeling = false;
  }

  damage(amount, kind) {
    if (amount <= 0) return;
    this.hull = Math.max(0, this.hull - amount);
    this.emit('damage', { amount, kind });
  }

  updateTetherVisual() {
    if (!this.tether) return;
    const anchorPos = this.tether.obj.localToWorld(this.tether.local.clone());
    const hand = this.pos.clone().addScaledVector(this.right, 0.4).addScaledVector(this.up, 0.1);
    const span = anchorPos.sub(hand);
    const len = span.length();
    if (len < 1e-4) return;
    this.tetherLine.position.copy(hand);
    this.tetherLine.quaternion.setFromUnitVectors(tmpA.set(0, 1, 0), span.divideScalar(len));
    this.tetherLine.scale.set(1, len, 1);
    this.tetherLine.material.color.setHex(this.tetherTaut ? 0xffd479 : 0x7fdcff);
  }

  updateMesh(dt) {
    this.mesh.position.copy(this.pos);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), this.forward.clone().negate(), this.up);
    const target = new THREE.Quaternion().setFromRotationMatrix(m);
    this.mesh.quaternion.slerp(target, Math.min(1, dt * 9));
  }
}

function buildSuit() {
  const g = new THREE.Group();
  const suitMat = new THREE.MeshStandardMaterial({ color: 0xd6d2c8, metalness: 0.12, roughness: 0.82 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, metalness: 0.3, roughness: 0.5 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x8b93a1, metalness: 0.7, roughness: 0.4 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.6, 6, 12), suitMat);
  g.add(torso);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 14), suitMat);
  helmet.position.y = 0.72;
  g.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 18, 14, 0, Math.PI * 2, 0.5, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x0a1420, metalness: 1, roughness: 0.08, emissive: 0x123048, emissiveIntensity: 0.5 })
  );
  visor.position.set(0, 0.74, 0.12);
  visor.rotation.x = Math.PI / 2.1;
  g.add(visor);

  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.3), packMat);
  pack.position.set(0, 0.1, -0.46);
  g.add(pack);

  const packTrim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.34), trimMat);
  packTrim.position.set(0, 0.34, -0.46);
  g.add(packTrim);

  for (let s = -1; s <= 1; s += 2) {
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.44, 4, 8), packMat);
    tank.position.set(s * 0.2, 0.06, -0.66);
    g.add(tank);

    // RCS nozzles — the gas you are told not to spend.
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.13, 6), trimMat);
    nozzle.position.set(s * 0.4, 0.42, -0.5);
    nozzle.rotation.z = s * Math.PI / 2;
    g.add(nozzle);
  }

  for (let s = -1; s <= 1; s += 2) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 4, 8), suitMat);
    arm.position.set(s * 0.5, 0.05, 0.12);
    arm.rotation.z = s * 0.5;
    arm.rotation.x = -0.7;
    g.add(arm);

    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.6, 4, 8), suitMat);
    leg.position.set(s * 0.22, -0.72, 0.06);
    leg.rotation.x = -0.25;
    g.add(leg);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.05, 6, 16), trimMat);
    band.position.y = s * 0.24;
    band.rotation.x = Math.PI / 2;
    g.add(band);
  }

  const light = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 8), trimMat);
  light.position.set(0.3, 0.78, 0.16);
  light.rotation.x = Math.PI / 2;
  g.add(light);

  return g;
}
