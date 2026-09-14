// The octopus: a soft body with eight semi-autonomous arms.
//
// Each arm is a 10-node Verlet chain pinned at the mantle. What makes it a game
// rather than an animation is that only three arms can be *attended* at once —
// everything else you own is running its own reflex program down there.

import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, approach, angDiff } from './rng.js';
import { SUB } from './world.js';

export const NODES = 10;
const SEG = 0.235;                 // metres per arm segment → 2.1 m reach
export const REACH = SEG * (NODES - 1) * 0.95;
const RING = 5;                    // pentagonal cross-section
export const ATTENTION = 3;

export const S = {
  FREE: 'free', REACH: 'reach', GRIP: 'grip', HOLD: 'hold',
  PROBE: 'probe', PRY: 'pry', HURT: 'hurt', GONE: 'gone',
};

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

class Arm {
  constructor(i) {
    this.i = i;
    this.rest = (i / 8) * Math.PI * 2 + Math.PI / 8;  // rest bearing around the mantle
    this.p = [];
    this.q = [];
    for (let k = 0; k < NODES; k++) {
      this.p.push(new THREE.Vector3());
      this.q.push(new THREE.Vector3());
    }
    this.state = S.FREE;
    this.attended = false;
    this.target = new THREE.Vector3();
    this.hasTarget = false;
    this.intent = null;             // { type, ref }
    this.item = null;               // prey being carried
    this.plant = new THREE.Vector3();
    this.planted = false;
    this.timer = 0;
    // No two arms are the same length, reach out the same distance, or move at
    // the same moment — an octopus that walks in lockstep looks like a starfish.
    this.gaitOffset = (i * 0.37) % 1;
    this.spread = 0.64 + ((i * 0.618) % 1) * 0.28;
    this.skew = (((i * 2.399) % 1) - 0.5) * 0.42;
    this.curl = 0.10 + ((i * 0.271) % 1) * 0.16;
    this.stepTimer = this.gaitOffset * 0.8;
    this.hardGrip = false;
    this.pryProgress = 0;
  }

  get tip() { return this.p[NODES - 1]; }
  get alive() { return this.state !== S.GONE; }
  get busy() {
    return this.state === S.REACH || this.state === S.PROBE ||
           this.state === S.PRY || this.state === S.HURT || this.state === S.GONE;
  }
  get carrying() { return this.state === S.HOLD && this.item; }
}

export class Octopus {
  constructor(reef, opts = {}) {
    this.reef = reef;
    this.armsLost = opts.armsLost || 0;

    this.pos = new THREE.Vector3(reef.den.x, reef.den.y + 0.45, reef.den.z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;

    this.squeeze = 0;              // 0 … 1
    this.focusing = false;
    this.jetting = false;
    this.jetTime = 0;
    this.debt = 0;                 // oxygen debt, 0 … 1
    this.exhausted = false;
    this.lift = 0;

    const g = reef.substrateAt(this.pos.x, this.pos.z).sig;
    this.skin = { h: g.h, l: g.l, t: g.t };
    this.match = 1;
    this.speedNorm = 0;
    this.mouthful = 0;             // eating animation timer

    this.arms = [];
    for (let i = 0; i < 8; i++) this.arms.push(new Arm(i));
    for (let i = 0; i < this.armsLost; i++) this.arms[7 - i].state = S.GONE;

    this._buildMeshes();
    this._resetArms();
  }

  // ── construction ─────────────────────────────────────────────────────────
  _buildMeshes() {
    this.group = new THREE.Group();

    this.skinMat = new THREE.MeshLambertMaterial({ color: 0x8a7358 });
    this.skinMat.flatShading = false;

    // Mantle + head, oriented so -Z is forward.
    this.body = new THREE.Group();
    const mantleGeo = new THREE.SphereGeometry(0.42, 16, 12);
    mantleGeo.scale(0.85, 0.78, 1.35);
    mantleGeo.translate(0, 0, 0.45);
    this.mantle = new THREE.Mesh(mantleGeo, this.skinMat);
    this.body.add(this.mantle);

    const headGeo = new THREE.SphereGeometry(0.33, 14, 11);
    headGeo.scale(1.1, 0.9, 1.0);
    this.head = new THREE.Mesh(headGeo, this.skinMat);
    this.head.position.z = -0.16;
    this.body.add(this.head);

    // Eyes — the one part of an octopus that never blends in.
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xf1e6c8, emissive: 0x1a1a12 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x05070a });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), eyeMat);
      ball.scale.set(1, 0.85, 1);
      e.add(ball);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.032, 0.055), pupilMat);
      pupil.position.set(0, 0.02, -0.085);
      e.add(pupil);
      e.position.set(0.235 * s, 0.14, -0.19);
      this.body.add(e);
      this.eyes.push(e);
    }

    // Siphon — points backwards, flares when jetting.
    const siphonGeo = new THREE.CylinderGeometry(0.055, 0.10, 0.26, 7, 1, true);
    siphonGeo.rotateX(Math.PI / 2);
    this.siphon = new THREE.Mesh(siphonGeo, this.skinMat);
    this.siphon.position.set(0.14, -0.02, -0.05);
    this.siphon.rotation.y = 0.5;
    this.body.add(this.siphon);

    this.group.add(this.body);

    // A faint ring on the ground. When the camouflage is working properly you
    // genuinely cannot find yourself, and that is not a fun kind of hard.
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 0.98, 28),
      new THREE.MeshBasicMaterial({
        color: 0x46e0d0, transparent: true, opacity: 0.16,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.group.add(this.marker);

    // One geometry for all eight arms.
    const total = 8 * NODES * RING;
    const posArr = new Float32Array(total * 3);
    const normArr = new Float32Array(total * 3);
    const idx = [];
    for (let a = 0; a < 8; a++) {
      const base = a * NODES * RING;
      for (let n = 0; n < NODES - 1; n++) {
        for (let r = 0; r < RING; r++) {
          const r2 = (r + 1) % RING;
          const i0 = base + n * RING + r;
          const i1 = base + n * RING + r2;
          const i2 = base + (n + 1) * RING + r;
          const i3 = base + (n + 1) * RING + r2;
          idx.push(i0, i2, i1, i1, i2, i3);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    geo.setIndex(idx);
    geo.frustumCulled = false;
    this.armGeo = geo;
    this.armMesh = new THREE.Mesh(geo, this.skinMat);
    this.armMesh.frustumCulled = false;
    this.group.add(this.armMesh);
  }

  _resetArms() {
    for (const arm of this.arms) {
      const a = arm.rest + this.yaw;
      for (let k = 0; k < NODES; k++) {
        const d = k * SEG;
        arm.p[k].set(this.pos.x + Math.cos(a) * d, this.pos.y - 0.15, this.pos.z + Math.sin(a) * d);
        arm.q[k].copy(arm.p[k]);
      }
      arm.plant.copy(arm.tip);
      arm.planted = true;
    }
  }

  // ── queries used by the rest of the game ─────────────────────────────────
  get radius() { return lerp(0.55, 0.28, this.squeeze); }
  get mouth() {
    if (!this._mouth) this._mouth = new THREE.Vector3();
    return this._mouth.set(this.pos.x, this.pos.y - 0.16, this.pos.z);
  }

  attentionUsed() {
    let n = 0;
    for (const a of this.arms) if (a.attended) n++;
    if (this.focusing) n++;
    if (this.squeezeHeld) n++;
    return n;
  }

  freeAttention() { return ATTENTION - this.attentionUsed(); }

  livingArms() { return this.arms.filter((a) => a.alive).length; }

  plantedCount() {
    let n = 0;
    for (const a of this.arms) if (a.alive && a.planted && a.state !== S.HOLD) n++;
    return n;
  }

  carryCount() { return this.arms.filter((a) => a.carrying).length; }

  grippingHard() { return this.arms.some((a) => a.alive && a.hardGrip); }

  // Conspicuity: what a predator would have to work with.
  conspicuity(lit = 0) {
    const silhouette = lerp(1, 0.55, this.squeeze);
    const c = 0.60 * (1 - this.match) * silhouette
            + 0.55 * this.speedNorm
            + 0.45 * lit;
    return clamp(c, 0, 1.4);
  }

  // ── per-frame ────────────────────────────────────────────────────────────
  _move(dt, input, game) {
    const reef = this.reef;

    // Desired direction in world space, from camera-relative WASD.
    const want = V.set(input.moveX, 0, input.moveZ);
    const moving = want.lengthSq() > 0.001;
    if (moving) want.normalize();

    if (input.squeeze && !this.squeezeHeld && this.attentionUsed() >= ATTENTION) {
      game.refuse('no attention left to squeeze');
      this.squeezeHeld = false;
    } else {
      this.squeezeHeld = input.squeeze;
    }
    this.squeeze = approach(this.squeeze, this.squeezeHeld ? 1 : 0, 2.4, dt);

    // Focus camouflage.
    if (input.focus && !this.focusing && this.freeAttention() <= 0) {
      game.refuse('no attention left to focus');
      this.focusing = false;
    } else {
      this.focusing = input.focus;
    }

    // Jet: anaerobic. The systemic hearts stop, and the bill comes later.
    const canJet = !this.exhausted;
    this.jetting = input.jet && canJet;
    if (this.jetting) {
      this.jetTime += dt;
      this.debt = clamp(this.debt + dt * 0.42, 0, 1);
      const dir = moving ? want : V2.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.vel.addScaledVector(dir, 22 * dt);
      this.lift = approach(this.lift, 0.85, 2.2, dt);
      for (const a of this.arms) { if (a.state === S.GRIP || a.state === S.FREE) { a.planted = false; a.hardGrip = false; } }
      if (!this._jetSound) { game.audio.jet(); this._jetSound = 0.45; }
    } else {
      this.jetTime = 0;
      this.lift = approach(this.lift, 0, 1.4, dt);
      const rest = this.speedNorm < 0.25 ? 0.13 : 0.06;
      this.debt = clamp(this.debt - dt * rest, 0, 1);
    }
    if (this._jetSound > 0) this._jetSound -= dt;
    if (this.debt >= 0.999) this.exhausted = true;
    if (this.exhausted && this.debt < 0.55) this.exhausted = false;

    // Crawl. Speed is a function of how much of you is actually on the rock.
    const planted = this.plantedCount();
    const gripFactor = 0.28 + 0.72 * (planted / 8);
    const carryPen = 1 - 0.10 * this.carryCount();
    const sqPen = lerp(1, 0.60, this.squeeze);
    const exPen = this.exhausted ? 0.5 : 1;
    const speed = 2.15 * gripFactor * carryPen * sqPen * exPen;

    if (moving && !this.jetting) this.vel.addScaledVector(want, speed * 7 * dt);
    const drag = this.jetting ? 1.4 : 7.5;
    this.vel.multiplyScalar(Math.max(0, 1 - drag * dt));

    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const [rx, rz] = reef.resolve(nx, nz, this.radius);
    if (rx !== nx || rz !== nz) { this.vel.x *= 0.35; this.vel.z *= 0.35; }
    this.pos.x = rx; this.pos.z = rz;

    const ground = reef.heightAt(this.pos.x, this.pos.z);
    const rest = ground + 0.34 + this.lift * 1.1 - this.squeeze * 0.12;
    this.pos.y = lerp(this.pos.y, rest, 1 - Math.exp(-9 * dt));

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.speedNorm = clamp(sp / 4.2, 0, 1);

    // Face the way we are going; a still octopus keeps looking where it looked.
    if (sp > 0.25) {
      const tgt = Math.atan2(-this.vel.x, -this.vel.z);
      this.yaw += angDiff(this.yaw, tgt) * Math.min(1, dt * (this.jetting ? 5 : 3.5));
    }

    // Footfall ticks so crawling has a texture.
    this._stepClock = (this._stepClock || 0) + sp * dt;
    if (this._stepClock > 0.9) { this._stepClock = 0; game.audio.step(); }
  }

  _skin(dt) {
    const sub = this.reef.substrateAt(this.pos.x, this.pos.z);
    this.ground = sub;
    const g = sub.sig;
    const rate = (this.focusing ? 1.6 : 0.35) * (1 - 0.8 * this.speedNorm);

    // Hue wraps, so drift the short way round the wheel.
    let dh = g.h - this.skin.h;
    if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
    this.skin.h = (this.skin.h + Math.sign(dh) * Math.min(Math.abs(dh), rate * dt) + 1) % 1;
    this.skin.l = approach(this.skin.l, g.l, rate, dt);
    this.skin.t = approach(this.skin.t, g.t, rate, dt);

    let hd = Math.abs(this.skin.h - g.h);
    hd = Math.min(hd, 1 - hd) * 2;
    const err = 0.45 * hd + 0.40 * Math.abs(this.skin.l - g.l) + 0.15 * Math.abs(this.skin.t - g.t);
    this.match = clamp(1 - err * 1.6, 0, 1);

    // Mapped in the renderer's working space so the skin sits on the same
    // scale as the substrate's own vertex colours — otherwise a perfect match
    // on the meter would still look wrong on screen.
    this.skinMat.color.setHSL(
      this.skin.h,
      0.18 + 0.28 * this.skin.t,
      clamp(0.12 + 0.31 * this.skin.l, 0.05, 0.56)
    );
  }

  // ── arm logic ────────────────────────────────────────────────────────────
  _arms(dt, game) {
    const reef = this.reef;
    for (const arm of this.arms) {
      if (arm.state === S.GONE) continue;

      switch (arm.state) {
        case S.HURT:
          arm.timer -= dt;
          arm.planted = false;
          arm.hasTarget = false;
          if (arm.timer <= 0) { arm.state = S.FREE; arm.attended = false; }
          break;

        case S.REACH: {
          const d = arm.tip.distanceTo(arm.target);
          arm.hasTarget = true;
          arm.timer += dt;
          const shoulderD = V.copy(arm.target).sub(this.pos).length();
          if (shoulderD > REACH * 1.35 || arm.timer > 3.5) {
            arm.state = S.FREE; arm.attended = false; arm.hasTarget = false;
          } else if (d < 0.28) {
            this._arrive(arm, game);
          }
          break;
        }

        case S.GRIP: {
          arm.hasTarget = true;
          arm.target.copy(arm.plant);
          if (V.copy(arm.plant).sub(this.pos).length() > REACH * 1.15) {
            arm.state = S.FREE; arm.planted = false; arm.hardGrip = false;
          }
          break;
        }

        case S.HOLD: {
          arm.hasTarget = true;
          // Walk the food in toward the mouth. An unattended arm will eventually
          // just feed you — slowly.
          const m = V.copy(this.pos).add(V2.set(0, -0.2, 0));
          arm.target.lerp(m, 1 - Math.exp(-1.1 * dt));
          if (arm.item) { arm.item.heldAt(arm.tip); }
          arm.timer += dt;
          if (arm.timer > 7.5) game.consume(arm, true);
          break;
        }

        case S.PROBE: {
          arm.timer -= dt;
          arm.hasTarget = true;
          if (arm.timer <= 0) game.resolveProbe(arm);
          break;
        }

        case S.PRY: {
          arm.hasTarget = true;
          const clam = arm.intent && arm.intent.ref;
          if (!clam || clam.dead) { arm.state = S.FREE; arm.attended = false; break; }
          const helpers = this.arms.filter((a) => a.state === S.PRY && a.intent && a.intent.ref === clam).length;
          // One arm cannot beat an adductor muscle. Two can, in about two seconds.
          const perArm = (helpers >= 2 ? 0.28 : 0.03) * (this.livingArms() / 8);
          clam.pry = clamp(clam.pry + perArm * dt, 0, 1);
          arm.pryProgress = clam.pry;
          if (clam.pry >= 1) game.openClam(clam);
          break;
        }

        default: {
          // FREE — the reflex ladder.
          arm.reflexClock = (arm.reflexClock || 0) - dt;
          if (arm.reflexClock <= 0) {
            arm.reflexClock = 0.3 + Math.random() * 0.25;
            game.armReflex(arm);
          }
          break;
        }
      }

      // Gait: any arm not sent somewhere plants and re-plants around the body.
      if (arm.state === S.FREE || arm.state === S.GRIP) {
        this._gait(arm, dt);
      } else {
        arm.planted = arm.state === S.PRY || arm.state === S.PROBE;
      }
    }
  }

  _gait(arm, dt) {
    if (this.jetting) { arm.planted = false; arm.hasTarget = false; return; }
    arm.stepTimer -= dt;
    const bearing = arm.rest + this.yaw + arm.skew;
    const lead = V.set(this.vel.x, 0, this.vel.z).multiplyScalar(0.55);
    const reach = REACH * arm.spread;
    const want = V2.set(
      this.pos.x + Math.cos(bearing) * reach + lead.x,
      0,
      this.pos.z + Math.sin(bearing) * reach + lead.z
    );
    want.y = this.reef.heightAt(want.x, want.z) + 0.06;

    const stretched = arm.plant.distanceTo(want);
    if (!arm.planted || (stretched > REACH * (0.42 + arm.spread * 0.3) && arm.stepTimer <= 0)) {
      arm.plant.copy(want);
      arm.planted = true;
      arm.stepTimer = 0.18 + Math.random() * 0.3;
      const sub = this.reef.substrateAt(want.x, want.z);
      arm.hardGrip = arm.state === S.GRIP ? sub.hard : false;
    }
    if (arm.state === S.FREE) { arm.hasTarget = true; arm.target.copy(arm.plant); }
  }

  _arrive(arm, game) {
    game.armArrived(arm);
  }

  // ── tasking API (called from main) ───────────────────────────────────────
  bestArmFor(point) {
    let best = null, bd = 1e9;
    for (const arm of this.arms) {
      if (!arm.alive || arm.state === S.HURT) continue;
      if (arm.state === S.PRY || arm.state === S.PROBE || arm.state === S.HOLD) continue;
      if (arm.attended) continue;
      const shoulderD = V.copy(point).sub(this.pos).length();
      if (shoulderD > REACH * 1.15) continue;
      const d = arm.tip.distanceTo(point);
      if (d < bd) { bd = d; best = arm; }
    }
    return best;
  }

  task(arm, point, intent) {
    if (!arm || !arm.alive) return;
    arm.state = S.REACH;
    arm.attended = intent.reflex !== true;
    arm.target.copy(point);
    arm.hasTarget = true;
    arm.intent = intent;
    arm.timer = 0;
    arm.planted = false;
    arm.hardGrip = false;
  }

  releaseAll() {
    for (const arm of this.arms) {
      if (!arm.alive) continue;
      if (arm.state === S.GRIP || arm.state === S.REACH || arm.state === S.PRY) {
        if (arm.intent && arm.intent.ref && arm.intent.ref.pry !== undefined) arm.intent.ref.pry *= 0.4;
        arm.state = S.FREE;
        arm.attended = false;
        arm.intent = null;
        arm.hardGrip = false;
      }
    }
  }

  hurt(arm, seconds) {
    arm.state = S.HURT;
    arm.attended = false;
    arm.timer = seconds;
    arm.intent = null;
    arm.hardGrip = false;
    arm.planted = false;
  }

  // Autotomy — shed an arm to escape. Prefers one that is gripping rock,
  // because that is the one anchored well enough to tear off cleanly.
  autotomize(specific = null) {
    let victim = specific && specific.alive ? specific : null;
    if (!victim) victim = this.arms.find((a) => a.alive && a.hardGrip);
    if (!victim) victim = this.arms.slice().reverse().find((a) => a.alive);
    if (!victim) return null;
    const at = victim.tip.clone();
    if (victim.item) { victim.item.release(); victim.item = null; }
    victim.state = S.GONE;
    victim.attended = false;
    victim.planted = false;
    victim.hardGrip = false;
    this.armsLost++;
    return at;
  }

  // ── verlet solve + tube rebuild ──────────────────────────────────────────
  _solve(dt) {
    const reef = this.reef;
    const t = performance.now() * 0.001;
    for (const arm of this.arms) {
      if (arm.state === S.GONE) continue;

      // Shoulder is welded to the mantle.
      const bearing = arm.rest + this.yaw;
      arm.p[0].set(
        this.pos.x + Math.cos(bearing) * 0.30,
        this.pos.y - 0.06,
        this.pos.z + Math.sin(bearing) * 0.30
      );
      arm.q[0].copy(arm.p[0]);

      for (let k = 1; k < NODES; k++) {
        const p = arm.p[k], q = arm.q[k];
        const vx = (p.x - q.x) * 0.86, vy = (p.y - q.y) * 0.86, vz = (p.z - q.z) * 0.86;
        q.copy(p);
        const sway = Math.sin(t * 1.6 + arm.i * 0.9 + k * 0.5) * 0.0016;
        p.x += vx + sway;
        p.y += vy - 0.0009 + Math.sin(t * 2.1 + k) * 0.0008;   // near-neutral buoyancy
        p.z += vz + Math.cos(t * 1.3 + arm.i) * 0.0016;
        if (this.jetting) {
          // Arms stream behind a jetting octopus.
          p.x -= this.vel.x * dt * 0.55 * (k / NODES);
          p.z -= this.vel.z * dt * 0.55 * (k / NODES);
        }
      }

      // Tip seeks its target.
      if (arm.hasTarget) {
        const tip = arm.p[NODES - 1];
        const rate = arm.state === S.REACH ? 1 - Math.exp(-9 * dt) : 1 - Math.exp(-14 * dt);
        tip.lerp(arm.target, rate);
      }

      // Distance constraints, tip-anchored on the way back so reaching wins.
      for (let it = 0; it < 3; it++) {
        for (let k = 0; k < NODES - 1; k++) {
          const a = arm.p[k], b = arm.p[k + 1];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.hypot(dx, dy, dz) || 1e-5;
          const diff = (d - SEG) / d;
          // The tip is heavy when it is reaching for something, and the
          // shoulder never moves at all.
          let wb = (k + 1 === NODES - 1 && arm.hasTarget) ? 0.15 : 0.5;
          let wa = 1 - wb;
          if (k === 0) { wa = 0; wb = (k + 1 === NODES - 1 && arm.hasTarget) ? 0.15 : 1; }
          a.x += dx * diff * wa; a.y += dy * diff * wa; a.z += dz * diff * wa;
          b.x -= dx * diff * wb; b.y -= dy * diff * wb; b.z -= dz * diff * wb;
        }
      }

      // A bow through the middle of the arm. Straight arms read as a starfish;
      // a real one always has some slack in it.
      // Slack goes *down* and sprawls along the bottom — an octopus does not
      // stand on its arms like a spider, it pours them over the rock.
      const bow = arm.curl * (arm.state === S.REACH ? 0.4 : 1);
      for (let k = 2; k < NODES - 1; k++) {
        arm.p[k].y -= Math.sin((k / (NODES - 1)) * Math.PI) * bow * 0.09;
      }

      // Never sink into the reef.
      for (let k = 1; k < NODES; k++) {
        const p = arm.p[k];
        const g = reef.heightAt(p.x, p.z) + 0.045;
        if (p.y < g) p.y = g;
      }
    }
  }

  _geometry() {
    const pos = this.armGeo.attributes.position.array;
    const nrm = this.armGeo.attributes.normal.array;
    const up = V2.set(0, 1, 0);
    const tan = new THREE.Vector3(), bi = new THREE.Vector3(), nn = new THREE.Vector3();
    const thick = lerp(1, 0.78, this.squeeze);

    for (let a = 0; a < 8; a++) {
      const arm = this.arms[a];
      const dead = arm.state === S.GONE;
      for (let k = 0; k < NODES; k++) {
        const p = arm.p[k];
        const nxt = arm.p[Math.min(k + 1, NODES - 1)];
        const prv = arm.p[Math.max(k - 1, 0)];
        tan.copy(nxt).sub(prv);
        if (tan.lengthSq() < 1e-8) tan.set(0, 0, 1);
        tan.normalize();
        bi.crossVectors(tan, up);
        if (bi.lengthSq() < 1e-6) bi.set(1, 0, 0);
        bi.normalize();
        nn.crossVectors(bi, tan).normalize();

        const taper = Math.pow(1 - k / NODES, 0.75);
        const r = dead ? 0 : (0.135 * taper + 0.012) * thick;
        for (let ri = 0; ri < RING; ri++) {
          const ang = (ri / RING) * Math.PI * 2;
          const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
          const o = ((a * NODES + k) * RING + ri) * 3;
          pos[o] = p.x + bi.x * ca + nn.x * sa;
          pos[o + 1] = p.y + bi.y * ca + nn.y * sa;
          pos[o + 2] = p.z + bi.z * ca + nn.z * sa;
          const inv = 1 / (r || 1);
          nrm[o] = (bi.x * ca + nn.x * sa) * inv;
          nrm[o + 1] = (bi.y * ca + nn.y * sa) * inv;
          nrm[o + 2] = (bi.z * ca + nn.z * sa) * inv;
        }
      }
    }
    this.armGeo.attributes.position.needsUpdate = true;
    this.armGeo.attributes.normal.needsUpdate = true;
    this.armGeo.computeBoundingSphere();
  }

  _pose(dt) {
    this.body.position.copy(this.pos);
    this.marker.position.set(this.pos.x, this.reef.heightAt(this.pos.x, this.pos.z) + 0.05, this.pos.z);
    this.marker.material.opacity = this.jetting ? 0.30 : 0.16;
    const n = this.reef.normalAt(this.pos.x, this.pos.z);
    const targetPitch = -Math.atan2(n.z * Math.cos(this.yaw) - n.x * Math.sin(this.yaw), n.y) * 0.6;
    this.pitch = lerp(this.pitch, this.jetting ? -0.35 : targetPitch, 1 - Math.exp(-5 * dt));
    this.body.rotation.set(0, 0, 0);
    this.body.rotateY(this.yaw);
    this.body.rotateX(this.pitch);

    const sq = this.squeeze;
    const pulse = this.jetting ? 1 + Math.sin(performance.now() * 0.02) * 0.12 : 1;
    this.body.scale.set(
      lerp(1, 1.22, sq) * (2 - pulse),
      lerp(1, 0.42, sq) * pulse,
      lerp(1, 1.30, sq)
    );
    // Eyes rise on their own turrets when the animal is alert.
    const alert = clamp(this.speedNorm * 0.4 + (1 - this.match) * 0.5, 0, 1);
    for (const e of this.eyes) e.position.y = 0.13 + alert * 0.05;
  }

  step(dt, input, game) {
    this._move(dt, input, game);
    this._skin(dt);
    this._arms(dt, game);
    this._solve(dt);
    this._geometry();
    this._pose(dt);
  }
}
