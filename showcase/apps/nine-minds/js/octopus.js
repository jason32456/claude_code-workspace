import * as THREE from '../vendor/three.module.js';
import { CFG, MATS } from './config.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const TREF = new THREE.Vector3();
const TNX = new THREE.Vector3();
const TNY = new THREE.Vector3();
const WUP = new THREE.Vector3();
const WRT = new THREE.Vector3();
const WALLN = new THREE.Vector3();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------------------
// An arm. It has a target, a grip, and — crucially — a mind of its own whenever
// the central brain is not spending attention on it.
// ---------------------------------------------------------------------------
class Arm {
  constructor(index) {
    this.i = index;
    this.angle = (index / CFG.arms.count) * Math.PI * 2;
    this.seg = CFG.arms.length / CFG.arms.segments;
    this.joints = [];
    for (let i = 0; i <= CFG.arms.segments; i++) this.joints.push(new THREE.Vector3());
    this.base = new THREE.Vector3();
    this.tip = new THREE.Vector3();
    this.goal = new THREE.Vector3();      // where the tip is being driven
    this.anchor = new THREE.Vector3();    // fixed world point once gripped
    this.state = 'reflex';                // reflex | reaching | holding | working
    this.commanded = false;               // did the player ask for this grip?
    this.grip = 0;
    this.mat = MATS.concrete;
    this.box = null;
    this.mech = null;
    this.tighten = 0;
    this.probeTimer = Math.random() * CFG.arms.probeInterval;
    this.phase = Math.random() * 6.283;
    this.slack = 0;
  }

  release() {
    this.state = 'reflex';
    this.commanded = false;
    this.grip = 0;
    this.box = null;
    this.mech = null;
  }

  get busy() { return this.state === 'reaching' || this.state === 'working' || this.tighten > 0; }
  get held() { return this.state === 'holding' || this.state === 'working'; }
}

// ---------------------------------------------------------------------------
export class Octopus {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(-2.4, 1.6, -21.5);
    this.vel = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.quat = new THREE.Quaternion();
    this.arms = [];
    for (let i = 0; i < CFG.arms.count; i++) this.arms.push(new Arm(i));

    this.squeezeT = 0;
    this.radius = CFG.body.radius;
    this.oxygen = 1;
    this.mantle = 1;
    this.stamina = 1;
    this.match = 0.4;
    this.inWater = true;
    this.submerged = true;
    this.slots = CFG.focus.slots;
    this.noise = 0;
    this.inkCharge = 1;
    this.discoveries = 0;
    this.alive = true;

    this.skinCol = new THREE.Color(0x7e5648);
    this.substrate = new THREE.Color(0x6d6f6d);
    this.contacts = [];
    this.support = 0;
    this.hauling = 0;
    this.events = [];

    this.buildMesh();
    this.resetArms();
  }

  say(msg, kind = 'info') { this.events.push({ msg, kind }); }

  // ---- geometry ----------------------------------------------------------
  buildMesh() {
    this.group = new THREE.Group();
    this.skinMat = new THREE.MeshLambertMaterial({ color: 0x7e5648 });

    const ball = new THREE.SphereGeometry(1, 18, 14);
    this.mantleMesh = new THREE.Mesh(ball, this.skinMat);   // the bag, behind
    this.headMesh = new THREE.Mesh(ball, this.skinMat);     // the brow, in front
    this.bodyPivot = new THREE.Group();
    this.bodyPivot.add(this.mantleMesh, this.headMesh);
    this.group.add(this.bodyPivot);

    // eyes — the single most important 300 vertices in the project
    const eyeG = new THREE.SphereGeometry(1, 10, 8);
    const eyeW = new THREE.MeshLambertMaterial({ color: 0xc9b894 });
    const pupilM = new THREE.MeshBasicMaterial({ color: 0x0d0b0a });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eyeG, eyeW);
      const p = new THREE.Mesh(new THREE.BoxGeometry(1, 0.32, 0.62), pupilM);
      p.position.set(0, 0, 0.72);
      e.add(p);
      e.userData.side = s;
      this.bodyPivot.add(e);
      this.eyes.push(e);
    }

    // arms: one pre-allocated tube each, updated in place every frame
    const R = CFG.arms.radials, S = CFG.arms.segments;
    this.armMeshes = this.arms.map(() => {
      const verts = (S + 1) * R;
      const pos = new Float32Array(verts * 3);
      const nor = new Float32Array(verts * 3);
      const idx = [];
      for (let s = 0; s < S; s++) {
        for (let r = 0; r < R; r++) {
          const a = s * R + r, b = s * R + ((r + 1) % R);
          idx.push(a, b, a + R, b, b + R, a + R);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setIndex(idx);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
      const m = new THREE.Mesh(g, this.skinMat);
      m.frustumCulled = false;
      this.group.add(m);
      return m;
    });
  }

  resetArms() {
    for (const a of this.arms) {
      a.release();
      for (const j of a.joints) j.copy(this.pos);
    }
  }

  // ---- focus economy -------------------------------------------------------
  freeSlots() {
    let used = 0;
    for (const a of this.arms) if (a.busy) used++;
    return this.slots - used;
  }

  // Pick the arm best placed to take a job: free, and already pointing the
  // right way. A committed arm is never stolen.
  bestArmFor(point) {
    let best = null, score = -1e9;
    for (const a of this.arms) {
      if (a.busy) continue;
      if (a.commanded && a.held) continue;
      const d = a.tip.distanceTo(point);
      if (d > CFG.arms.length * 1.9) continue;
      let s = -d;
      if (a.state === 'reflex') s += 0.6;
      if (s > score) { score = s; best = a; }
    }
    return best;
  }

  command(point, box, mech) {
    if (this.freeSlots() <= 0) { this.say('No attention left — release an arm.', 'warn'); return null; }
    const arm = this.bestArmFor(point);
    if (!arm) { this.say('Nothing can reach that.', 'warn'); return null; }
    arm.state = 'reaching';
    arm.commanded = true;
    arm.goal.copy(point);
    arm.box = box;
    arm.mech = mech || null;
    arm.mat = box ? box.mat : MATS.concrete;
    arm.grip = 0;
    return arm;
  }

  tightenNearest() {
    if (this.freeSlots() <= 0) return;
    let best = null, worst = 2;
    for (const a of this.arms) {
      if (!a.held || a.tighten > 0) continue;
      if (a.grip < worst) { worst = a.grip; best = a; }
    }
    if (best) best.tighten = CFG.focus.tightenCost;
  }

  releaseAll() { for (const a of this.arms) a.release(); }

  // Contract every committed arm at once. Total force is the sum of the grips,
  // so the question is never "did I press haul", it is "how much grip did I
  // still have when I pressed it".
  haul() {
    if (this.stamina < 0.12) { this.say('Too spent to haul.', 'warn'); return null; }
    const held = this.arms.filter((a) => a.held && a.commanded);
    if (!held.length) { this.say('Nothing is holding on.', 'warn'); return null; }
    let force = 0;
    const centre = new THREE.Vector3();
    for (const a of held) {
      force += a.grip * (0.45 + a.mat.rough * 0.75);
      centre.add(a.anchor);
    }
    centre.divideScalar(held.length);
    this.stamina -= 0.14;
    this.hauling = 0.35;
    this.noise = Math.max(this.noise, 3.0);
    // pull the body toward the mean anchor — this is also how you climb
    V.copy(centre).sub(this.pos);
    if (V.length() > 0.3) this.vel.addScaledVector(V.normalize(), 3.2 * Math.min(1, force));
    return { force, arms: held, centre };
  }

  // ---- main update ---------------------------------------------------------
  update(dt, input, camBasis, mechs) {
    const W = this.world;

    // --- squeeze ---------------------------------------------------------
    const want = input.squeeze ? 1 : 0;
    this.squeezeT += clamp(want - this.squeezeT, -1, 1) * CFG.body.squeezeRate * dt;
    this.squeezeT = clamp(this.squeezeT, 0, 1);
    this.radius = CFG.body.radius - (CFG.body.radius - CFG.body.beak) * this.squeezeT;

    // --- medium ----------------------------------------------------------
    const w = W.waterAt(this.pos);
    this.inWater = !!w;
    this.submerged = !!w && this.pos.y < w.surface - this.radius * 0.45;

    // --- intent ----------------------------------------------------------
    V.set(0, 0, 0);
    if (input.move.lengthSq() > 0) {
      // Clinging to a wall rotates the whole control basis onto that wall, so
      // "forward" becomes "up the glass". An octopus does not walk up things,
      // it walks *on* them, and the surface decides which way is forward.
      TNY.copy(camBasis.right).multiplyScalar(input.move.x)
        .addScaledVector(camBasis.fwd, input.move.y).normalize();
      const intoWall = this.wall ? TNY.dot(this.wall) < -0.2 : false;
      const canClimb = this.wall && !this.submerged && this.squeezeT < 0.5
        && this.support >= CFG.body.climbGripNeeded && (!this.ground || intoWall);
      if (canClimb) {
        const n = this.wall;
        WUP.set(0, 1, 0).addScaledVector(n, -n.y);
        if (WUP.lengthSq() < 1e-4) WUP.set(0, 0, 1).addScaledVector(n, -n.z);
        WUP.normalize();
        WRT.crossVectors(WUP, n).normalize();
        if (WRT.dot(camBasis.right) < 0) WRT.negate();
        V.copy(WRT).multiplyScalar(input.move.x).addScaledVector(WUP, input.move.y).normalize();
        this.climbing = true;
      } else {
        V.copy(camBasis.right).multiplyScalar(input.move.x)
          .addScaledVector(camBasis.fwd, input.move.y);
        if (this.submerged) V.y += input.rise;
        V.normalize();
        this.climbing = false;
      }
    } else this.climbing = false;
    const frozen = input.freeze;
    const accel = this.inWater ? CFG.body.swimAccel : CFG.body.crawlAccel;
    const drag = this.inWater ? CFG.body.swimDrag : CFG.body.crawlDrag;

    // On land you only go as fast as your arms are gripping. Traction is the
    // number of arms currently holding something, which you mostly do not
    // control — the reflexes do.
    let tract = 1;
    if (!this.inWater) tract = clamp(0.35 + this.support * 0.15, 0.35, 1);
    if (!frozen) this.vel.addScaledVector(V, accel * tract * (1 - this.squeezeT * 0.4) * dt);

    // gravity, buoyancy, and the fact that gripping arms hold you to a wall
    const gravScale = clamp(1 - this.support * 0.34, 0.04, 1);
    if (this.submerged) {
      this.vel.y += (CFG.body.buoyancy - CFG.body.gravity) * dt;
    } else {
      this.vel.y -= CFG.body.gravity * gravScale * dt;
    }

    // arm tension: a held arm that is too far away hauls the body back and,
    // past full extension, simply tears off
    // A commanded arm holds on hard and will drag the body back; an arm running
    // on its own reflexes lets go early and re-grips further along, which is
    // what crawling actually is.
    for (const a of this.arms) {
      if (!a.held) continue;
      const d = a.anchor.distanceTo(this.pos);
      const L = CFG.arms.length;
      const taut = a.commanded ? 0.70 : 0.86;
      const rip = a.commanded ? 1.02 : 0.93;
      if (d > L * taut) {
        V2.copy(a.anchor).sub(this.pos).normalize();
        const over = d - L * taut;
        this.vel.addScaledVector(V2, over * (a.commanded ? 14 : 2.2) * a.grip * dt * 60 * dt);
        a.slack = over;
        if (d > L * rip) {
          a.grip -= dt * (a.commanded ? 2.6 : 9);
          if (a.grip <= 0) {
            const told = a.commanded;
            a.release();
            if (told) this.say('An arm was pulled off.', 'warn');
          }
        }
      } else a.slack = 0;
    }

    if (frozen) this.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
    const dragF = Math.max(0, 1 - drag * dt);
    this.vel.x *= dragF; this.vel.z *= dragF;
    // clinging damps the vertical too, otherwise climbing a wall launches you
    if (this.inWater || this.support >= CFG.body.climbGripNeeded) this.vel.y *= dragF;

    // --- jet -------------------------------------------------------------
    if (input.jet && this.submerged && this.mantle > CFG.body.jetCost && this.squeezeT < 0.5) {
      V2.copy(V.lengthSq() > 0 ? V : this.forward).normalize();
      this.vel.addScaledVector(V2, CFG.body.jetImpulse);
      this.mantle -= CFG.body.jetCost;
      this.noise = Math.max(this.noise, CFG.body.jetNoise);
      input.jet = false;
      this.jetFlash = 0.4;
    }

    const maxV = (this.inWater ? CFG.body.maxSwim : CFG.body.maxCrawl) * (1 - this.squeezeT * 0.45);
    const sp = this.vel.length();
    if (sp > maxV * 3) this.vel.multiplyScalar((maxV * 3) / sp);

    this.pos.addScaledVector(this.vel, dt);

    // --- collision -------------------------------------------------------
    W.resolve(this.pos, this.radius, this.contacts);
    let groundMat = null, steep = 1;
    this.wall = null;
    this.ground = false;
    for (const c of this.contacts) {
      const vn = this.vel.x * c.nx + this.vel.y * c.ny + this.vel.z * c.nz;
      if (vn < 0) {
        this.vel.x -= c.nx * vn; this.vel.y -= c.ny * vn; this.vel.z -= c.nz * vn;
      }
      if (c.ny > 0.5) { groundMat = c.mat; this.ground = true; }
      else if (!groundMat) groundMat = c.mat;
      // remember the steepest thing we are touching — that is what we climb
      const a = Math.abs(c.ny);
      if (a < 0.55 && a < steep) { steep = a; this.wall = WALLN.set(c.nx, c.ny, c.nz); }
    }
    if (this.pos.y < -8.6) this.pos.y = -8.6;

    // --- arms ------------------------------------------------------------
    this.updateArms(dt, mechs);

    // --- breath ----------------------------------------------------------
    const sq = 1 + this.squeezeT * (CFG.breath.squeezePenalty - 1);
    if (this.submerged) {
      this.oxygen = Math.min(1, this.oxygen + CFG.breath.waterGain * dt);
      this.mantle = Math.min(1, this.mantle + CFG.breath.mantleRefill * dt);
    } else if (this.inWater) {
      this.oxygen = Math.min(1, this.oxygen + CFG.breath.waterGain * 0.45 * dt);
      this.mantle = Math.min(1, this.mantle + CFG.breath.mantleRefill * 0.5 * dt);
    } else {
      this.oxygen -= CFG.breath.airDrain * sq * dt * (1 + this.hauling * CFG.breath.exertion);
    }
    this.stamina = Math.min(1, this.stamina + (this.submerged ? 0.11 : 0.055) * dt);
    this.hauling = Math.max(0, this.hauling - dt);
    this.noise = Math.max(0, this.noise - dt * 6);
    this.inkCharge = Math.min(1, this.inkCharge + dt / CFG.ink.recharge);
    if (this.oxygen <= 0) { this.oxygen = 0; this.alive = false; }

    // --- camouflage ------------------------------------------------------
    this.updateCamo(dt, groundMat, sp, frozen);

    // --- orientation & render --------------------------------------------
    if (sp > 0.25) {
      V2.copy(this.vel).normalize();
      this.forward.lerp(V2, Math.min(1, dt * 5)).normalize();
    }
    this.syncMesh(dt);
  }

  // ---- the reflex layer ----------------------------------------------------
  updateArms(dt, mechs) {
    const W = this.world;
    const R = this.radius / CFG.body.radius;
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, this.forward).normalize();
    if (right.lengthSq() < 0.01) right.set(1, 0, 0);
    const realUp = new THREE.Vector3().crossVectors(this.forward, right).normalize();

    this.support = 0;
    for (const a of this.arms) {
      // base point on the rim of the body
      const ca = Math.cos(a.angle), sa = Math.sin(a.angle);
      a.base.copy(this.pos)
        .addScaledVector(right, ca * 0.24 * R)
        .addScaledVector(realUp, sa * 0.24 * R)
        .addScaledVector(this.forward, 0.22 * R);

      if (a.tighten > 0) {
        a.tighten -= dt;
        a.grip = Math.min(1, a.grip + CFG.arms.tightenRate * dt);
      }

      switch (a.state) {
        case 'reaching': {
          a.tip.lerp(a.goal, Math.min(1, CFG.arms.reachSpeed * dt));
          if (a.tip.distanceTo(a.goal) < 0.14) {
            a.anchor.copy(a.goal);
            a.grip = 0.80;
            a.state = 'holding';
          } else if (a.base.distanceTo(a.goal) > CFG.arms.length * 1.05) {
            a.release();
          }
          break;
        }
        case 'working':
        case 'holding': {
          a.tip.copy(a.anchor);
          const load = a.slack * 1.5 + (this.hauling > 0 ? 0.8 : 0);
          if (a.tighten <= 0) {
            a.grip -= dt * CFG.arms.decayBase * a.mat.slip * (1 + load) * (a.commanded ? 1 : 1.5);
          }
          if (a.grip <= 0) {
            const wasCommanded = a.commanded;
            a.release();
            if (wasCommanded) this.say('An arm let go.', 'warn');
          } else this.support += a.grip > 0.12 ? 1 : 0;
          break;
        }
        default: this.reflex(a, dt, right, realUp);
      }

      this.solve(a);
    }
  }

  // What an arm does when nobody is watching it.
  reflex(a, dt, right, realUp) {
    const ca = Math.cos(a.angle), sa = Math.sin(a.angle);
    a.phase += dt * (1.1 + a.i * 0.13);
    // arms splay outward and trail behind, the way they do on a swimming animal
    const L = CFG.arms.length;
    const splay = 0.74 + Math.sin(a.phase) * 0.13;
    V.copy(this.pos)
      .addScaledVector(right, ca * L * splay)
      .addScaledVector(realUp, sa * L * splay)
      .addScaledVector(this.forward, -L * (0.30 + Math.sin(a.phase * 0.7) * 0.14));

    // an unsupervised arm grips whatever brushes past it — this is the entire
    // reason the octopus can climb without you thinking about climbing
    const near = this.world.nearestSurface(V, CFG.arms.reflexGripRange);
    if (near && near.d < 0.34 && this.world.nearestSurface(a.base, CFG.arms.length * 0.98)) {
      a.anchor.set(near.x, near.y, near.z);
      if (a.anchor.distanceTo(a.base) < CFG.arms.length * 0.94) {
        a.mat = near.box.mat;
        a.box = near.box;
        a.grip = 0.40 + near.box.mat.rough * 0.22;
        a.state = 'holding';
        a.commanded = false;
        a.tip.copy(a.anchor);
        return;
      }
    }
    a.tip.lerp(V, Math.min(1, dt * 4.5));

    // and it probes. Arms find most of the routes in this building.
    a.probeTimer -= dt;
    if (a.probeTimer <= 0) {
      a.probeTimer = CFG.arms.probeInterval;
      this.probe = this.probe || null;
    }
  }

  // The arm is laid out as a quadratic through a control point that bows away
  // from the body by however much slack the arm has. A taut arm is a straight
  // line; a slack one is a curl — which is exactly how the real thing reads,
  // and it costs one bezier instead of an IK solve.
  solve(a) {
    const J = a.joints, S = J.length - 1;
    const base = a.base, tip = a.tip;
    V.copy(tip).sub(base);
    const len = V.length();
    const slack = Math.max(0, CFG.arms.length - len);

    V2.copy(base).sub(this.pos);
    if (V2.lengthSq() < 1e-8) V2.set(0, 1, 0);
    V2.normalize();
    TREF.crossVectors(V2, V.lengthSq() > 1e-8 ? V.normalize() : this.forward);
    if (TREF.lengthSq() < 1e-8) TREF.set(1, 0, 0);
    TREF.normalize();

    TNX.copy(base).add(tip).multiplyScalar(0.5)
      .addScaledVector(V2, slack * 0.66)
      .addScaledVector(TREF, Math.sin(a.phase * 1.3) * slack * 0.26);

    for (let i = 0; i <= S; i++) {
      const u = i / S, iu = 1 - u;
      const w0 = iu * iu, w1 = 2 * iu * u, w2 = u * u;
      J[i].set(
        w0 * base.x + w1 * TNX.x + w2 * tip.x,
        w0 * base.y + w1 * TNX.y + w2 * tip.y,
        w0 * base.z + w1 * TNX.z + w2 * tip.z,
      );
      // the last third of an octopus arm is always doing something of its own
      if (u > 0.62) {
        const c = Math.sin(((u - 0.62) / 0.38) * Math.PI) * slack * 0.2;
        J[i].addScaledVector(TREF, c * Math.cos(a.phase * 1.7));
      }
    }
  }

  // ---- camouflage ----------------------------------------------------------
  updateCamo(dt, groundMat, speed, frozen) {
    const near = groundMat ? { mat: groundMat }
      : this.world.nearestSurface(this.pos, 1.5);
    const mat = near ? (near.mat || near.box.mat) : MATS.concrete;
    this.substrateMat = mat;
    this.substrate.setHex(mat.col);

    const rate = frozen || speed < 0.3 ? CFG.camo.blendStill : CFG.camo.blendMoving;
    if (speed > CFG.camo.breakSpeed || this.squeezeT > 0.55) {
      this.match -= CFG.camo.breakRate * dt;
    } else {
      this.match += rate * dt * (1 - this.match);
    }
    this.match = clamp(this.match, 0, 1);

    // texture is a real part of the match: matching the colour of gravel while
    // staying smooth still leaves you readable
    const papil = 1 - Math.abs(mat.rough - (frozen ? mat.rough : 0.35));
    this.matchQuality = clamp(this.match * (1 - CFG.camo.papillaeWeight + CFG.camo.papillaeWeight * papil), 0, 1);

    const base = new THREE.Color(0x7e5648);
    this.skinCol.copy(base).lerp(this.substrate, this.match * 0.94);
    // the building is drawn as flat boxes and the animal as curved surfaces, so
    // an identical colour reads brighter on the octopus; take that back out
    this.skinMat.color.copy(this.skinCol).multiplyScalar(0.66);
  }

  // ---- render sync ---------------------------------------------------------
  syncMesh(dt) {
    const R = this.radius;
    const s = R / CFG.body.radius;
    const stretch = Math.min(2.7, 1 / (s * s));
    this.bodyPivot.position.copy(this.pos);
    V.copy(this.pos).add(this.forward);
    this.bodyPivot.lookAt(V);
    // the mantle is a bag behind the eyes, not a ball around them
    this.mantleMesh.scale.set(R * 0.80, R * 0.86, R * 1.22 * stretch);
    this.mantleMesh.position.set(0, R * 0.06, -R * (0.72 + 0.5 * (stretch - 1)));
    this.headMesh.scale.set(R * 0.74, R * 0.66, R * 0.72);
    this.headMesh.position.set(0, 0, R * 0.12);

    for (const e of this.eyes) {
      const sd = e.userData.side;
      e.scale.set(R * 0.23, R * 0.19, R * 0.17);
      e.position.set(sd * R * 0.48, R * 0.30, R * 0.16);
      e.rotation.set(0, sd * 0.8, 0);
    }

    const RAD = CFG.arms.radials, S = CFG.arms.segments;
    for (let ai = 0; ai < this.arms.length; ai++) {
      const a = this.arms[ai];
      const g = this.armMeshes[ai].geometry;
      const pos = g.attributes.position.array, nor = g.attributes.normal.array;
      const ref = TREF.set(0, 1, 0);
      const nx = TNX, ny = TNY;
      for (let i = 0; i <= S; i++) {
        const p = a.joints[i];
        const q = a.joints[Math.min(S, i + 1)], r = a.joints[Math.max(0, i - 1)];
        V.copy(q).sub(r);
        if (V.lengthSq() < 1e-8) V.copy(this.forward);
        V.normalize();
        nx.crossVectors(ref, V);
        if (nx.lengthSq() < 1e-6) nx.set(1, 0, 0).cross(V);
        nx.normalize();
        ny.crossVectors(V, nx).normalize();
        ref.copy(ny);
        const t = i / S;
        // fat at the root, closed at the tip, with a sucker ripple down the length
        const taper = (1 - t) ** 0.55 * (1 - t * 0.62) * (1 + Math.sin(t * 26) * 0.055);
        const rad = 0.112 * s * taper + 0.004;
        for (let k = 0; k < RAD; k++) {
          const ang = (k / RAD) * Math.PI * 2;
          const cx = Math.cos(ang), cy = Math.sin(ang);
          const idx = (i * RAD + k) * 3;
          pos[idx] = p.x + (nx.x * cx + ny.x * cy) * rad;
          pos[idx + 1] = p.y + (nx.y * cx + ny.y * cy) * rad;
          pos[idx + 2] = p.z + (nx.z * cx + ny.z * cy) * rad;
          nor[idx] = nx.x * cx + ny.x * cy;
          nor[idx + 1] = nx.y * cx + ny.y * cy;
          nor[idx + 2] = nx.z * cx + ny.z * cy;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.normal.needsUpdate = true;
    }
  }
}
