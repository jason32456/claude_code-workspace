import * as THREE from '../vendor/three.module.js';
import { gripQuality, SLIP_THRESHOLD, HOLD_TYPES } from './holds.js';

const UP = new THREE.Vector3(0, 1, 0);

import { ARM, LEG, SHOULDER_UP, SHOULDER_OUT, HIP_OUT, GRAB_RANGE, DYNO_RANGE, STANDOFF, hangLength } from './body.js';

export { ARM, LEG, SHOULDER_UP, SHOULDER_OUT, HIP_OUT, GRAB_RANGE, DYNO_RANGE };

const PUMP_RATE = 4.0;
const GRAVITY = 9.81;

function orient(mesh, a, b) {
  const dir = b.clone().sub(a);
  const len = Math.max(dir.length(), 0.001);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
  mesh.scale.set(1, len / mesh.userData.baseLen, 1);
}

// Two-bone IK in the plane containing root, target and the pole hint.
function solveIK(root, target, l1, l2, pole, out) {
  const toTarget = target.clone().sub(root);
  let d = toTarget.length();
  const max = (l1 + l2) * 0.999;
  if (d > max) {
    toTarget.multiplyScalar(max / d);
    d = max;
  }
  if (d < 1e-4) {
    out.copy(root).addScaledVector(UP, -l1);
    return out;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const dir = toTarget.clone().divideScalar(d);
  const poleDir = pole.clone().sub(root);
  poleDir.addScaledVector(dir, -poleDir.dot(dir));
  if (poleDir.lengthSq() < 1e-6) poleDir.set(0, 0, 1).addScaledVector(dir, -dir.z);
  poleDir.normalize();
  return out.copy(root).addScaledVector(dir, a).addScaledVector(poleDir, h);
}

export class Climber {
  constructor(wall) {
    this.wall = wall;
    this.hips = new THREE.Vector3(0, 1.05, wall.surfaceZ(0, 1.05) + 0.5);
    this.vel = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.offsetTarget = new THREE.Vector3();

    this.hands = {
      left: { key: 'left', sign: -1, hold: null, pos: this.hips.clone(), rest: this.hips.clone(), fatigue: 0, quality: 1, share: 0, slip: 0, moving: 0, from: new THREE.Vector3() },
      right: { key: 'right', sign: 1, hold: null, pos: this.hips.clone(), rest: this.hips.clone(), fatigue: 0, quality: 1, share: 0, slip: 0, moving: 0, from: new THREE.Vector3() },
    };
    this.feet = {
      left: { key: 'left', sign: -1, hold: null, smear: null, pos: this.hips.clone(), capacity: 0, share: 0 },
      right: { key: 'right', sign: 1, hold: null, smear: null, pos: this.hips.clone(), capacity: 0, share: 0 },
    };

    this.pump = 0;
    this.legReserve = 100;
    this.chalk = 4;
    this.chalkTimer = 0;
    this.footPress = 0;
    this.state = 'climb';
    this.fallTimer = 0;
    this.dyno = null;
    this.shaking = false;
    this.armLoad = 0;
    this.footShare = 0;
    this.events = [];
    this.maxHeight = 0;
    this.impact = 0;
    this.lastAnchor = null;

    this.grab('left', wall.startLeft, true);
    this.grab('right', wall.startRight, true);
    this.buildMesh();
  }

  emit(type, data) {
    this.events.push({ type, ...data });
  }

  shoulder(side, out = new THREE.Vector3()) {
    return out
      .copy(this.hips)
      .addScaledVector(UP, SHOULDER_UP)
      .addScaledVector(this.lateral, side * SHOULDER_OUT);
  }

  hipJoint(side, out = new THREE.Vector3()) {
    return out.copy(this.hips).addScaledVector(this.lateral, side * HIP_OUT).addScaledVector(UP, -0.06);
  }

  get lateral() {
    return this._lateral || (this._lateral = new THREE.Vector3(1, 0, 0));
  }

  grippedHands() {
    const out = [];
    if (this.hands.left.hold) out.push(this.hands.left);
    if (this.hands.right.hold) out.push(this.hands.right);
    return out;
  }

  canGrab(hold, side) {
    if (!hold || hold.broken) return false;
    const s = this.shoulder(side === 'left' ? -1 : 1);
    return s.distanceTo(hold.position) <= GRAB_RANGE;
  }

  canDyno(hold, side) {
    if (!hold || hold.broken) return false;
    const s = this.shoulder(side === 'left' ? -1 : 1);
    const d = s.distanceTo(hold.position);
    return d > GRAB_RANGE && d <= DYNO_RANGE;
  }

  grab(side, hold, instant = false) {
    const hand = this.hands[side];
    const other = this.hands[side === 'left' ? 'right' : 'left'];
    if (!hold || hold.broken) return false;
    if (!other.hold && !instant && this.footShare < 0.45) return false;
    if (other.hold === hold) return false;
    hand.from.copy(hand.pos);
    hand.hold = hold;
    hand.slip = 0;
    hand.moving = instant ? 0 : 0.16;
    hold.used = true;
    hold.loadTime = 0;
    if (!instant) {
      const lift = THREE.MathUtils.clamp(hold.position.y - (this.hips.y + SHOULDER_UP), 0, 0.9);
      this.vel.y += lift * 1.5;
      this.emit('grab', { holdType: hold.type });
    }
    return true;
  }

  release(side, silent = false) {
    const hand = this.hands[side];
    if (!hand.hold) return;
    hand.hold.loadTime = 0;
    hand.hold = null;
    hand.slip = 0;
    if (!silent) this.emit('release', {});
  }

  startDyno(side, hold) {
    if (this.state !== 'climb' || this.dyno) return false;
    if (!this.canDyno(hold, side)) return false;
    if (this.pump > 92) return false;
    this.dyno = { side, hold, windup: 0.26, phase: 'crouch' };
    return true;
  }

  chalkUp() {
    if (this.chalk <= 0 || this.state !== 'climb') return false;
    this.chalk--;
    this.chalkTimer = 26;
    for (const h of this.grippedHands()) if (h.hold) h.hold.chalk = 1;
    this.emit('chalk', {});
    return true;
  }

  // Load breakdown, for tuning and for the HUD.
  inspect() {
    const feet = ['left', 'right'].map((k) => {
      const f = this.feet[k];
      const axis = this.hips.clone().sub(f.pos);
      return {
        kind: f.hold ? f.hold.type : f.smear ? 'smear' : 'none',
        dist: +axis.length().toFixed(2),
        vertical: +THREE.MathUtils.clamp(axis.normalize().y, 0, 1).toFixed(2),
        capacity: +f.capacity.toFixed(2),
      };
    });
    return {
      pump: +this.pump.toFixed(1),
      rate: +((this.lastLoad * PUMP_RATE) - this.lastRecovery).toFixed(2),
      load: +this.lastLoad.toFixed(2),
      rec: +this.lastRecovery.toFixed(1),
      footShare: +this.footShare.toFixed(2),
      armLoad: +this.armLoad.toFixed(2),
      feet,
      offsetZ: +this.offset.z.toFixed(2),
      hands: ['left', 'right'].map((k) => {
        const h = this.hands[k];
        if (!h.hold) return { on: 'off' };
        const pull = this.hips.clone().sub(h.pos).normalize();
        return {
          on: h.hold.type,
          q: +h.quality.toFixed(2),
          share: +h.share.toFixed(2),
          dot: +pull.dot(h.hold.ideal).toFixed(2),
          cone: h.hold.spec.cone,
          standoff: +(this.hips.z - this.wall.surfaceZ(this.hips.x, this.hips.y)).toFixed(2),
        };
      }),
    };
  }

  // What the targeted hold would give if this hand took it from here.
  previewQuality(hold, side) {
    if (!hold) return 0;
    const pull = this.hips.clone().sub(hold.position).normalize();
    return gripQuality(hold, pull, this.hands[side].fatigue);
  }

  // Fresh, you lock off and your shoulders come up near your hands. Pumped, the
  // arms straighten out — which is what actually costs you reach on a real wall.
  hangLength() {
    return hangLength(this.pump, this.shaking);
  }

  // Which foot placements the legs can actually use right now.
  updateFeet(dt) {
    const wall = this.wall;
    for (const key of ['left', 'right']) {
      const foot = this.feet[key];
      const sign = foot.sign;
      let best = null;
      let bestScore = -1;
      const search = wall.holdsNear(this.hips, LEG + 0.12);
      for (const h of search) {
        if (h.position.y > this.hips.y - 0.12) continue;
        const other = this.feet[key === 'left' ? 'right' : 'left'];
        if (other.hold === h) continue;
        if (this.hands.left.hold === h || this.hands.right.hold === h) continue;
        const dx = (h.position.x - this.hips.x) * sign;
        const axis = h.position.clone().sub(this.hips).normalize().multiplyScalar(-1);
        const vertical = THREE.MathUtils.clamp(axis.y, 0, 1);
        const drop = this.hips.y - h.position.y;
        const spread = Math.abs(h.position.x - this.hips.x);
        if (spread > 0.62) continue;
        let score = h.spec.foot * vertical * vertical * 2.2 + dx * 0.35 - Math.abs(drop - 0.72) * 0.5;
        if (h === foot.hold) score += 0.25;
        if (score > bestScore) {
          bestScore = score;
          best = h;
        }
      }
      foot.hold = best;
      foot.smear = null;
      if (!best) {
        // Smearing: on anything near slab angle the rock itself is a foothold.
        const sy = this.hips.y - 0.75;
        const sx = this.hips.x + sign * 0.22;
        const n = wall.normalAt(sx, sy);
        if (n.y > 0.06) {
          foot.smear = new THREE.Vector3(sx, sy, wall.surfaceZ(sx, sy) + 0.06);
        }
      }
      foot.pos.copy(best ? best.position : foot.smear || this.hipJoint(sign).addScaledVector(UP, -0.55));
    }
    void dt;
  }

  // Distributes body weight across contacts and reports what each hold feels.
  solveLoad(dt) {
    const press = 0.78 + this.footPress * 0.28 * (this.legReserve > 0 ? 1 : 0.25);
    const steep = THREE.MathUtils.clamp(1 - this.wall.leanAt(this.hips.y) * 1.5, 0.3, 1.15);
    let footCapacity = 0;
    for (const key of ['left', 'right']) {
      const foot = this.feet[key];
      foot.capacity = 0;
      if (!foot.hold && !foot.smear) continue;
      const axis = this.hips.clone().sub(foot.pos);
      const dist = axis.length();
      if (dist > LEG + 0.16) continue;
      axis.divideScalar(Math.max(dist, 1e-4));
      const vertical = THREE.MathUtils.clamp(axis.y, 0, 1);
      const rating = foot.hold ? foot.hold.spec.foot : 0.55;
      const wetness = foot.hold ? 1 - foot.hold.wet * 0.6 : 1 - this.wetAt(foot.pos) * 0.75;
      foot.capacity = Math.pow(vertical, 1.2) * rating * press * wetness * steep;
      footCapacity += foot.capacity;
    }
    this.footShare = THREE.MathUtils.clamp(footCapacity, 0, 0.9);

    const gripped = this.grippedHands();
    if (gripped.length === 0) {
      for (const key of ['left', 'right']) this.hands[key].share = 0;
      // Feet alone hold you only on genuinely low-angle ground.
      this.armLoad = 0;
      return this.footShare > 0.82 ? 'stable' : 'nohands';
    }

    let handTotal = Math.max(0.14, 1 - this.footShare);
    const weights = [];
    let sum = 0;
    for (const hand of gripped) {
      const axis = hand.pos.clone().sub(this.hips).normalize();
      const w = THREE.MathUtils.clamp(axis.y, 0.05, 1) + 0.2;
      weights.push(w);
      sum += w;
    }
    let anySlipping = false;
    const pull = new THREE.Vector3();
    for (let i = 0; i < gripped.length; i++) {
      const hand = gripped[i];
      hand.share = handTotal * (weights[i] / sum);
      pull.copy(this.hips).sub(hand.pos).normalize();
      const impact = this.impact > 0 ? 1 - this.impact * 0.4 : 1;
      hand.quality = gripQuality(hand.hold, pull, hand.fatigue) * impact;
      hand.hold.loadTime += dt * (hand.share > 0.05 ? 1 : 0);
      if (hand.quality < SLIP_THRESHOLD && hand.share > 0.08) {
        hand.slip += dt;
        anySlipping = true;
        if (hand.slip > 0.5) {
          this.emit('slip', { hand: hand.key });
          this.release(hand.key, true);
        }
      } else {
        hand.slip = Math.max(0, hand.slip - dt * 1.6);
      }
      if (hand.hold && hand.hold.spec.breaks && hand.hold.loadTime > hand.hold.spec.breaks) {
        hand.hold.broken = true;
        this.emit('break', { position: hand.hold.position.clone() });
        this.release(hand.key, true);
      }
    }
    this.armLoad = handTotal;
    return anySlipping ? 'slipping' : 'ok';
  }

  wetAt(pos) {
    return this.wetLine === undefined ? 0 : THREE.MathUtils.clamp((pos.y - this.wetLine) / 8 + 0.5, 0, 1) * (this.wetAmount || 0);
  }

  updatePump(dt) {
    let load = 0;
    for (const hand of this.grippedHands()) {
      const q = hand.quality;
      load += hand.share * hand.hold.spec.drain * (0.25 + 0.85 * (1 - q) * (1 - q));
      hand.fatigue = THREE.MathUtils.clamp(hand.fatigue + dt * hand.share * 0.05, 0, 1);
    }
    for (const key of ['left', 'right']) {
      const hand = this.hands[key];
      if (!hand.hold) hand.fatigue = Math.max(0, hand.fatigue - dt * 0.14);
    }

    let recovery = 0;
    const gripped = this.grippedHands();
    const oneOff = gripped.length === 1;
    const anchor = gripped[0];
    if (oneOff && anchor && anchor.hold.spec.rest && anchor.quality > 0.5) {
      recovery = this.shaking ? 13 : 5.5;
    } else if (this.footShare > 0.62 && load < 0.45) {
      recovery = 4;
    } else if (gripped.length === 0 && this.footShare > 0.7) {
      recovery = 9;
    }

    if (load < 0.5) recovery = Math.max(recovery, 1.5);
    this.lastLoad = load;
    this.lastRecovery = recovery;
    this.pump = THREE.MathUtils.clamp(this.pump + (load * PUMP_RATE - recovery) * dt, 0, 100);

    const pressing = this.footPress > 0.1 && (this.feet.left.capacity > 0 || this.feet.right.capacity > 0);
    this.legReserve = THREE.MathUtils.clamp(
      this.legReserve + (pressing ? -13 : 9) * dt,
      0,
      100
    );

    if (this.chalkTimer > 0) {
      this.chalkTimer -= dt;
      if (this.chalkTimer <= 0) for (const h of this.wall.holds) h.chalk = 0;
    }

    if (this.pump >= 100 && this.state === 'climb' && this.grippedHands().length) {
      this.emit('pumped', {});
      this.release('left', true);
      this.release('right', true);
      if (this.footShare < 0.62) this.beginFall();
    }
  }

  applyConstraints() {
    const s = new THREE.Vector3();
    for (let iter = 0; iter < 4; iter++) {
      for (const key of ['left', 'right']) {
        const hand = this.hands[key];
        if (!hand.hold) continue;
        this.shoulder(hand.sign, s);
        const d = s.distanceTo(hand.pos);
        if (d > ARM) {
          const push = s.clone().sub(hand.pos).multiplyScalar((ARM - d) / d);
          this.hips.add(push);
        }
      }
    }
    // Feet are never a tether: a foot that runs out of leg simply comes off,
    // which is what lets you keep moving up past it.
    const surf = this.wall.surfaceZ(this.hips.x, this.hips.y);
    // Low enough that pulling your hips in can actually reach the rock — this
    // clamp used to cap how good any hold could ever feel.
    const clearance = surf + 0.13;
    if (this.hips.z < clearance) {
      this.hips.z = clearance;
      if (this.vel.z < 0) this.vel.z *= -0.15;
    }
  }

  update(dt, input) {
    this.events.length = 0;
    this._lateral = new THREE.Vector3(1, 0, 0);

    if (this.state === 'fall') {
      this.updateFall(dt);
      this.updateMesh(dt);
      return;
    }

    this.impact = Math.max(0, this.impact - dt * 1.6);
    this.shaking = !!input.shake;
    this.footPress = input.press ? 1 : 0;

    this.offsetTarget.set(
      THREE.MathUtils.clamp(input.hipX * 0.52, -0.52, 0.52),
      0,
      THREE.MathUtils.clamp(input.hipZ * 0.46, -0.34, 0.55)
    );
    if (this.crouch) this.offsetTarget.y = -0.26;
    this.crouch = 0;
    this.offset.lerp(this.offsetTarget, Math.min(1, dt * 6));

    if (this.dyno) this.updateDyno(dt);
    this.updateFeet(dt);
    const status = this.solveLoad(dt);
    this.updatePump(dt);

    const gripped = this.grippedHands();
    const airborne = this.dyno && this.dyno.phase === 'flight';
    const supported = !airborne && (gripped.length > 0 || this.footShare > 0.5);

    if (supported && this.state === 'climb') {
      const target = new THREE.Vector3();
      let anchors = 0;
      for (const hand of gripped) {
        target.add(hand.pos);
        anchors++;
      }
      if (anchors === 0) {
        for (const key of ['left', 'right']) {
          const f = this.feet[key];
          if (f.hold || f.smear) {
            target.add(f.pos);
            anchors++;
          }
        }
        if (anchors > 0) target.divideScalar(anchors).addScaledVector(UP, LEG * 0.86);
      } else {
        target.divideScalar(anchors);
        target.addScaledVector(UP, -(SHOULDER_UP + this.hangLength()));
      }

      target.x += this.offset.x;
      target.y += this.offset.y;
      // Stand off the rock by a distance measured where the body actually is.
      // Measuring it at the hands instead let the clearance clamp override the
      // player's hip control entirely on anything but a dead-vertical wall.
      this.standoff = Math.max(0.14, STANDOFF + this.offset.z);
      target.z = this.wall.surfaceZ(target.x, target.y) + this.standoff;

      // Grip strength decides how much of your own weight you can actually
      // hold in position; what you cannot hold, gravity takes.
      let authority = 0;
      for (const hand of gripped) authority += hand.share * Math.min(1, hand.quality * 1.6);
      authority += this.footShare * 0.95;
      authority = THREE.MathUtils.clamp(authority, 0, 1);

      const k = 34 * authority + 5;
      const c = 2 * Math.sqrt(k) * 0.62;
      const accel = target.sub(this.hips).multiplyScalar(k).addScaledVector(this.vel, -c);
      accel.y -= GRAVITY * (1 - authority);
      this.vel.addScaledVector(accel, dt);
    } else {
      this.vel.y -= GRAVITY * dt;
      this.vel.multiplyScalar(1 - dt * (airborne ? 0.02 : 0.2));
    }

    if (input.wind) this.vel.addScaledVector(input.wind, dt);

    this.hips.addScaledVector(this.vel, dt);
    this.applyConstraints();

    if (status === 'nohands' && gripped.length === 0 && this.footShare < 0.55) {
      this.fallTimer += dt;
      if (this.fallTimer > 0.22 && !this.dyno) this.beginFall();
    } else {
      this.fallTimer = 0;
    }

    this.maxHeight = Math.max(this.maxHeight, this.hips.y);
    this.updateMesh(dt);
  }

  updateDyno(dt) {
    const d = this.dyno;
    if (d.phase === 'crouch') {
      d.windup -= dt;
      this.crouch = 1;
      if (d.windup <= 0) {
        const from = this.shoulder(d.side === 'left' ? -1 : 1);
        const to = d.hold.position;
        const delta = to.clone().sub(from);
        const t = THREE.MathUtils.clamp(delta.length() / 2.6 + 0.32, 0.3, 0.62);
        this.release('left', true);
        this.release('right', true);
        this.vel.set(
          delta.x / t,
          delta.y / t + 0.5 * GRAVITY * t,
          delta.z / t + 1.1
        );
        d.phase = 'flight';
        d.timer = 0;
        d.launchY = this.hips.y;
        this.emit('dyno', {});
      }
    } else {
      d.timer += dt;
      const hand = this.hands[d.side];
      const s = this.shoulder(hand.sign);
      const dist = s.distanceTo(d.hold.position);
      if (dist < GRAB_RANGE * 0.92) {
        this.grab(d.side, d.hold, true);
        this.impact = 1;
        this.pump = Math.min(100, this.pump + 5);
        hand.fatigue = Math.min(1, hand.fatigue + 0.1);
        this.vel.multiplyScalar(0.25);
        this.emit('catch', { holdType: d.hold.type });
        this.dyno = null;
      } else if (d.timer > 1.5 || (this.vel.y < -0.5 && this.hips.y < d.launchY - 0.1)) {
        this.dyno = null;
        this.emit('missed', {});
      }
    }
  }

  beginFall() {
    if (this.state === 'fall') return;
    this.state = 'fall';
    this.release('left', true);
    this.release('right', true);
    this.dyno = null;
    this.fallStart = this.hips.y;
    this.emit('fall', {});
  }

  updateFall(dt) {
    this.vel.y -= GRAVITY * dt;
    this.vel.multiplyScalar(1 - dt * 0.15);
    this.hips.addScaledVector(this.vel, dt);
    const surf = this.wall.surfaceZ(this.hips.x, this.hips.y);
    if (this.hips.z < surf + 0.3) {
      this.hips.z = surf + 0.3;
      this.vel.z = Math.abs(this.vel.z) * 0.3 + 0.4;
      this.vel.y *= 0.94;
      this.vel.x += (Math.random() - 0.5) * 0.6;
    }
    for (const key of ['left', 'right']) {
      const hand = this.hands[key];
      hand.pos.lerp(this.shoulder(hand.sign).addScaledVector(UP, 0.35), Math.min(1, dt * 5));
      const foot = this.feet[key];
      foot.pos.lerp(this.hipJoint(foot.sign).addScaledVector(UP, -0.6), Math.min(1, dt * 5));
    }
  }

  catchOn(position) {
    this.state = 'climb';
    this.vel.set(0, 0, 0);
    this.pump = Math.min(this.pump, 62);
    this.hands.left.fatigue *= 0.4;
    this.hands.right.fatigue *= 0.4;
    this.hips.copy(position).addScaledVector(UP, -0.35);
    this.hips.z = this.wall.surfaceZ(this.hips.x, this.hips.y) + 0.55;
    let best = null;
    let bestD = 9;
    for (const h of this.wall.holds) {
      if (h.broken) continue;
      const d = h.position.distanceTo(position);
      if (d < bestD && h.position.y > position.y - 0.6) {
        bestD = d;
        best = h;
      }
    }
    if (best) {
      this.hips.copy(best.position).addScaledVector(UP, -0.85);
      this.hips.z = this.wall.surfaceZ(this.hips.x, this.hips.y) + 0.5;
      this.grab('left', best, true);
      let second = null;
      let sd = 9;
      for (const h of this.wall.holds) {
        if (h.broken || h === best) continue;
        const d = h.position.distanceTo(best.position);
        if (d < sd && d > 0.2 && Math.abs(h.position.y - best.position.y) < 0.7) {
          sd = d;
          second = h;
        }
      }
      if (second && sd < 1.1) this.grab('right', second, true);
      else this.grab('right', best, true);
    }
    this.fallTimer = 0;
  }

  buildMesh() {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a17a, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xe2513c, roughness: 0.75 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2c3550, roughness: 0.85 });
    const gear = new THREE.MeshStandardMaterial({ color: 0x2a2a2f, roughness: 0.7 });

    const capsule = (r, len, mat) => {
      const g = new THREE.CapsuleGeometry(r, len, 4, 10);
      const m = new THREE.Mesh(g, mat);
      m.userData.baseLen = len + 2 * r;
      m.castShadow = true;
      group.add(m);
      return m;
    };

    this.parts = {
      torso: capsule(0.13, 0.34, shirt),
      head: new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin),
      upperL: capsule(0.045, 0.3, shirt),
      lowerL: capsule(0.038, 0.3, skin),
      upperR: capsule(0.045, 0.3, shirt),
      lowerR: capsule(0.038, 0.3, skin),
      thighL: capsule(0.062, 0.36, pants),
      shinL: capsule(0.05, 0.36, pants),
      thighR: capsule(0.062, 0.36, pants),
      shinR: capsule(0.05, 0.36, pants),
      handL: new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin),
      handR: new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin),
      footL: new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.17), gear),
      footR: new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.17), gear),
      bag: new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.11, 10), gear),
    };
    for (const k of ['head', 'handL', 'handR', 'footL', 'footR', 'bag']) {
      this.parts[k].castShadow = true;
      group.add(this.parts[k]);
    }
    this.group = group;
    this.elbowL = new THREE.Vector3();
    this.elbowR = new THREE.Vector3();
    this.kneeL = new THREE.Vector3();
    this.kneeR = new THREE.Vector3();
  }

  updateMesh(dt) {
    const p = this.parts;
    const shake = this.pump > 65 ? (this.pump - 65) / 35 : 0;
    const jitter = new THREE.Vector3();

    for (const key of ['left', 'right']) {
      const hand = this.hands[key];
      if (hand.hold) {
        hand.moving = Math.max(0, hand.moving - dt);
        const t = hand.moving > 0 ? 1 - hand.moving / 0.16 : 1;
        hand.pos.lerpVectors(hand.from, hand.hold.position, THREE.MathUtils.smoothstep(t, 0, 1));
        const s = shake * (0.012 + hand.slip * 0.05);
        if (s > 0) hand.pos.add(jitter.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
      } else if (this.state !== 'fall') {
        const target = this.shoulder(hand.sign).addScaledVector(UP, this.shaking ? -0.36 : -0.2);
        target.z += 0.18;
        if (this.shaking) target.x += hand.sign * 0.1 * Math.sin(performance.now() * 0.012);
        hand.pos.lerp(target, Math.min(1, dt * 9));
      }
    }

    const chest = this.hips.clone().addScaledVector(UP, SHOULDER_UP);
    const wallDir = this.wall.normalAt(this.hips.x, this.hips.y);

    orient(p.torso, this.hips, chest);
    p.head.position.copy(chest).addScaledVector(UP, 0.16).addScaledVector(wallDir, -0.04);
    p.bag.position.copy(this.hips).addScaledVector(UP, -0.02).addScaledVector(wallDir, -0.16);

    for (const [key, part] of [['left', 'L'], ['right', 'R']]) {
      const hand = this.hands[key];
      const sign = hand.sign;
      const sh = this.shoulder(sign);
      const pole = sh.clone().addScaledVector(wallDir, 0.5).addScaledVector(UP, -0.8).addScaledVector(this.lateral, sign * 0.35);
      const elbow = part === 'L' ? this.elbowL : this.elbowR;
      solveIK(sh, hand.pos, 0.36, 0.36, pole, elbow);
      orient(p['upper' + part], sh, elbow);
      orient(p['lower' + part], elbow, hand.pos);
      p['hand' + part].position.copy(hand.pos);

      const foot = this.feet[key];
      const hj = this.hipJoint(sign);
      const kneePole = hj.clone().addScaledVector(wallDir, 1.5).addScaledVector(this.lateral, sign * 0.2).addScaledVector(UP, -0.3);
      const knee = part === 'L' ? this.kneeL : this.kneeR;
      solveIK(hj, foot.pos, 0.45, 0.45, kneePole, knee);
      orient(p['thigh' + part], hj, knee);
      orient(p['shin' + part], knee, foot.pos);
      p['foot' + part].position.copy(foot.pos).addScaledVector(wallDir, 0.03);
      p['foot' + part].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), wallDir);
    }
  }
}

export { HOLD_TYPES };
