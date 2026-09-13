import * as THREE from '../vendor/three.module.js';
import { CFG } from './config.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Detection is never binary. A threat accumulates suspicion at a rate that is
// the product of four things you can each attack separately: how well you match
// the substrate, how lit you are, how fast you are moving, and how far away you
// are. "Hidden" is not a state — it is a rate of zero.

export class Watchman {
  constructor(world) {
    this.world = world;
    this.route = [
      new THREE.Vector3(-6.2, 0, -9.4),
      new THREE.Vector3(-6.2, 0, -2.4),
      new THREE.Vector3(4.6, 0, -2.0),
      new THREE.Vector3(4.6, 0, -9.6),
      new THREE.Vector3(-2.6, 0, -10.2),
    ];
    this.wp = 0;
    this.pos = this.route[0].clone();
    this.face = new THREE.Vector3(0, 0, 1);
    this.wait = 1.0;
    this.suspicion = 0;
    this.alerted = 0;
    this.investigate = null;
    this.sweep = 0;
    this.build();
  }

  build() {
    this.group = new THREE.Group();
    const coat = new THREE.MeshLambertMaterial({ color: 0x2c3138 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xb08a6e });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), coat);
    torso.position.y = 1.32;
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.9, 0.28), coat);
    hips.position.y = 0.48;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
    head.position.y = 1.85;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), coat);
    cap.position.y = 1.97;
    this.armR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.13), coat);
    this.armR.position.set(0.34, 1.3, 0.1);
    this.group.add(torso, hips, head, cap, this.armR);

    this.torch = new THREE.SpotLight(0xfff0cc, 9, CFG.threat.torchRange, 0.44, 0.45, 1.2);
    this.torch.position.set(0.34, 1.15, 0.24);
    this.torchTarget = new THREE.Object3D();
    this.group.add(this.torch, this.torchTarget);
    this.torch.target = this.torchTarget;

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, CFG.threat.torchRange, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff1cf, transparent: true, opacity: 0.055,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 0, CFG.threat.torchRange / 2);
    this.coneHolder = new THREE.Group();
    this.coneHolder.position.set(0.34, 1.15, 0.24);
    this.coneHolder.add(cone);
    this.group.add(this.coneHolder);
  }

  eye(out) { return out.copy(this.pos).add(V2.set(0, 1.7, 0)); }

  update(dt, octo, ink, t) {
    // --- movement ---------------------------------------------------------
    let goal = this.investigate || this.route[this.wp];
    V.copy(goal).sub(this.pos); V.y = 0;
    const d = V.length();
    const speed = this.alerted > 0 ? 2.1 : 1.15;
    if (d < 0.35) {
      if (this.investigate) { this.investigate = null; this.wait = 2.2; }
      else if (this.wait > 0) this.wait -= dt;
      else { this.wp = (this.wp + 1) % this.route.length; this.wait = 1.4; }
    } else if (this.wait <= 0 || this.investigate) {
      V.divideScalar(d);
      this.pos.addScaledVector(V, speed * dt);
      this.face.lerp(V, Math.min(1, dt * 4)).normalize();
    } else {
      this.wait -= dt;
    }

    // torch sweeps across the walk direction unless he is looking at something
    this.sweep += dt * 0.8;
    const swing = this.investigate || this.alerted > 0 ? 0 : Math.sin(this.sweep) * 0.55;
    const look = V2.copy(this.face).applyAxisAngle(new THREE.Vector3(0, 1, 0), swing);
    this.lookDir = look.clone();

    this.group.position.copy(this.pos);
    this.group.lookAt(V.copy(this.pos).add(this.face).setY(this.pos.y));
    this.coneHolder.rotation.y = swing;
    this.torchTarget.position.set(Math.sin(swing) * 6, -0.9, Math.cos(swing) * 6);
    this.armR.rotation.x = -1.15 + Math.sin(t * 3) * 0.05;

    // --- detection --------------------------------------------------------
    const eye = this.eye(new THREE.Vector3());
    const exposure = this.exposureOf(octo, eye, ink);
    if (exposure > 0) {
      this.suspicion += exposure * CFG.threat.suspicionRise * dt;
      if (this.suspicion > 0.45 && !this.investigate) {
        this.investigate = octo.pos.clone().setY(0);
      }
    } else {
      this.suspicion -= CFG.threat.suspicionFall * dt * (ink.distract > 0 ? 3 : 1);
    }

    // hearing — a knocked bin or a jet carries whether or not he is looking
    if (octo.noise > 0.4) {
      const hd = this.pos.distanceTo(octo.pos);
      if (hd < CFG.threat.hearingBase + octo.noise) {
        this.suspicion += dt * 0.9;
        this.investigate = octo.pos.clone().setY(0);
      }
    }
    if (ink.distract > 0 && ink.decoy) this.investigate = ink.decoy.clone().setY(0);

    this.suspicion = clamp(this.suspicion, 0, 1.0);
    this.alerted = this.suspicion > 0.7 ? 1 : 0;
    this.torch.color.setHex(this.suspicion > 0.7 ? 0xffd0a0 : 0xfff0cc);

    const near = this.pos.distanceTo(octo.pos);
    if (near < CFG.threat.catchDistance && this.suspicion > 0.4
      && !this.world.blocked(eye, octo.pos)) return 'caught';
    return this.suspicion >= 1 ? 'caught' : null;
  }

  exposureOf(octo, eye, ink) {
    const d = eye.distanceTo(octo.pos);
    if (d > CFG.threat.torchRange * 1.15) return 0;
    V.copy(octo.pos).sub(eye).normalize();
    if (V.dot(this.lookDir) < CFG.threat.visionCos) return 0;
    if (this.world.blocked(eye, octo.pos)) return 0;
    if (ink.blocks(eye, octo.pos)) return 0;

    let lit = this.world.illumination(octo.pos);
    // the torch itself is by far the brightest thing in the building
    const inBeam = V.dot(this.lookDir) > CFG.threat.torchCos && d < CFG.threat.torchRange;
    if (inBeam) lit += 1.6 * (1 - d / CFG.threat.torchRange);

    const motion = clamp(octo.vel.length() / 2.2, 0, 1);
    let e = (1 - octo.matchQuality) * clamp(lit, 0, 1.6) * (0.22 + motion * 1.5)
      * (1 - d / (CFG.threat.torchRange * 1.2));
    if (octo.submerged) e *= 0.5;
    if (octo.squeezeT > 0.6) e *= 0.7;
    return Math.max(0, e);
  }
}

// ---------------------------------------------------------------------------
// The scrubber is blind and deaf. It is also a metre wide and never stops.
export class Scrubber {
  constructor() {
    this.a = new THREE.Vector3(7.4, 0, 3.4);
    this.b = new THREE.Vector3(7.4, 0, 16.4);
    this.pos = this.a.clone();
    this.dir = 1;
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.34, 14),
      new THREE.MeshLambertMaterial({ color: 0xc8c2b4 }));
    body.position.y = 0.28;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.16, 14),
      new THREE.MeshLambertMaterial({ color: 0x4a5058 }));
    top.position.y = 0.5;
    this.brush = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16),
      new THREE.MeshLambertMaterial({ color: 0x2f3540 }));
    this.brush.position.y = 0.08;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8844 }));
    lamp.position.set(0, 0.6, 0);
    this.lamp = lamp;
    this.group.add(body, top, this.brush, lamp);
  }

  update(dt, octo, t) {
    const goal = this.dir > 0 ? this.b : this.a;
    V.copy(goal).sub(this.pos);
    if (V.length() < 0.3) this.dir *= -1;
    else this.pos.addScaledVector(V.normalize(), 0.95 * dt);
    this.group.position.copy(this.pos);
    this.brush.rotation.y += dt * 9;
    this.lamp.visible = Math.sin(t * 6) > 0;
    const d = Math.hypot(octo.pos.x - this.pos.x, octo.pos.z - this.pos.z);
    if (d < 0.78 && octo.pos.y > -0.35 && octo.pos.y < 0.9) return 'scrubbed';
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ink: a pseudomorph that holds attention, and a cloud that breaks line of
// sight. The strongest button in the game, and it leaves evidence.
export class Ink {
  constructor() {
    this.group = new THREE.Group();
    this.clouds = [];
    this.distract = 0;
    this.decoy = null;
    this.decoyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x120d18, transparent: true, opacity: 0.9 }),
    );
    this.decoyMesh.visible = false;
    this.group.add(this.decoyMesh);
    this.geo = new THREE.SphereGeometry(1, 12, 10);
  }

  release(pos, dir) {
    const cloud = new THREE.Mesh(this.geo, new THREE.MeshLambertMaterial({
      color: 0x0d0a12, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    cloud.position.copy(pos);
    cloud.scale.setScalar(0.35);
    cloud.userData = { life: CFG.ink.cloudLife, r: 0.35 };
    this.clouds.push(cloud);
    this.group.add(cloud);
    this.decoy = pos.clone().addScaledVector(dir, -0.5);
    this.decoyMesh.position.copy(this.decoy);
    this.decoyMesh.visible = true;
    this.distract = CFG.threat.inkHold;
  }

  update(dt) {
    this.distract = Math.max(0, this.distract - dt);
    if (this.distract === 0) { this.decoyMesh.visible = false; this.decoy = null; }
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.userData.life -= dt;
      c.userData.r = Math.min(CFG.ink.cloudRadius, c.userData.r + dt * 0.9);
      c.scale.setScalar(c.userData.r);
      c.material.opacity = 0.85 * Math.max(0, c.userData.life / CFG.ink.cloudLife);
      if (c.userData.life <= 0) { this.group.remove(c); c.material.dispose(); this.clouds.splice(i, 1); }
    }
  }

  // does any cloud sit on the segment a→b?
  blocks(a, b) {
    for (const c of this.clouds) {
      V.copy(b).sub(a);
      const len = V.length();
      if (len < 1e-4) continue;
      V.divideScalar(len);
      V2.copy(c.position).sub(a);
      const t = clamp(V2.dot(V), 0, len);
      V2.copy(a).addScaledVector(V, t);
      if (V2.distanceTo(c.position) < c.userData.r * 0.85) return true;
    }
    return false;
  }
}

// The pump intake is not an enemy, it is a force — and the fastest way across
// the hall if you are willing to be dragged and let go at the right moment.
export class Intake {
  constructor() {
    this.pos = new THREE.Vector3(-5.0, -1.7, 14.8);
    this.group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 6, 14),
      new THREE.MeshLambertMaterial({ color: 0x3a3f46 }));
    ring.rotation.y = Math.PI / 2;
    ring.position.copy(this.pos);
    this.group.add(ring);
  }

  update(dt, octo) {
    if (!octo.submerged || octo.pos.z < 5) return null;
    V.copy(this.pos).sub(octo.pos);
    const d = V.length();
    if (d > 6) return null;
    const pull = 13 / Math.max(0.8, d * d);
    octo.vel.addScaledVector(V.divideScalar(d), pull * dt);
    if (d < 0.75) return 'intake';
    return null;
  }
}
