// Everything on the reef that is not you: prey, predators, decoys, and the
// diver's torch. Predators do not have vision cones — they have an evidence
// accumulator, so what gets you killed is a slow build-up of being wrong.

import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, range, angDiff } from './rng.js';

const V = new THREE.Vector3();

// ── prey ───────────────────────────────────────────────────────────────────
export class Prey {
  constructor(kind, x, z, reef) {
    this.kind = kind;
    this.reef = reef;
    this.held = false;
    this.dead = false;
    this.pos = new THREE.Vector3(x, reef.heightAt(x, z) + 0.12, z);
    this.heading = Math.random() * Math.PI * 2;
    this.value = kind === 'crab' ? 1 : kind === 'clam' ? 2 : 3;
    this.pry = 0;
    this.alarm = 0;
    this.group = new THREE.Group();
    this._build();
    this.group.position.copy(this.pos);
  }

  _build() {
    if (this.kind === 'crab') {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xb2603f })
      );
      shell.scale.set(1.25, 0.55, 1);
      this.group.add(shell);
      const legMat = new THREE.MeshLambertMaterial({ color: 0x8d4a30 });
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.17), legMat);
          leg.position.set(s * 0.16, -0.03, -0.09 + i * 0.06);
          leg.rotation.y = s * (0.5 + i * 0.12);
          this.group.add(leg);
        }
      }
      for (const s of [-1, 1]) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.11), legMat);
        claw.position.set(s * 0.17, 0.0, -0.17);
        claw.rotation.y = s * 0.5;
        this.group.add(claw);
      }
    } else if (this.kind === 'clam') {
      const mat = new THREE.MeshLambertMaterial({ color: 0xbfae8e });
      const geo = new THREE.SphereGeometry(0.21, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
      this.top = new THREE.Mesh(geo, mat);
      this.bottom = new THREE.Mesh(geo, mat);
      this.bottom.rotation.x = Math.PI;
      this.top.position.y = 0.03;
      this.group.add(this.top, this.bottom);
      this.group.rotation.y = Math.random() * 6.28;
      this.pos.y -= 0.05;
    } else {
      // lobster — trap bait level prey
      const mat = new THREE.MeshLambertMaterial({ color: 0x8e3b48 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.28, 4, 8), mat);
      body.rotation.x = Math.PI / 2;
      this.group.add(body);
      for (const s of [-1, 1]) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), mat);
        claw.position.set(s * 0.13, 0, -0.26);
        this.group.add(claw);
      }
    }
  }

  heldAt(v) {
    this.held = true;
    this.group.position.copy(v);
    this.group.rotation.z += 0.15;
  }

  release() {
    this.held = false;
    this.pos.copy(this.group.position);
    this.pos.y = this.reef.heightAt(this.pos.x, this.pos.z) + 0.12;
  }

  update(dt, game) {
    if (this.held || this.dead) return;
    if (this.kind !== 'crab') return;

    const o = game.octo;
    const d = Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
    // A crab only runs from what it can see. A well-matched octopus is a rock.
    const seen = clamp((1 - o.match) * 0.8 + o.speedNorm * 0.9, 0, 1);
    if (d < 4.2 && seen > 0.35) {
      this.alarm = clamp(this.alarm + dt * (4.2 - d) * seen, 0, 1);
    } else {
      this.alarm = clamp(this.alarm - dt * 0.6, 0, 1);
    }

    let speed = 0.35;
    if (this.alarm > 0.4) {
      const away = Math.atan2(this.pos.z - o.pos.z, this.pos.x - o.pos.x);
      this.heading += angDiff(this.heading, away) * Math.min(1, dt * 6);
      speed = 2.0 * this.alarm;
      if (!this._clicked) { game.audio.crabClick(); this._clicked = 0.5; }
    } else {
      this.heading += (Math.random() - 0.5) * dt * 2.2;
    }
    if (this._clicked > 0) this._clicked -= dt;

    let nx = this.pos.x + Math.cos(this.heading) * speed * dt;
    let nz = this.pos.z + Math.sin(this.heading) * speed * dt;
    if (!this.reef.inBounds(nx, nz)) { this.heading += Math.PI; nx = this.pos.x; nz = this.pos.z; }
    const [rx, rz] = this.reef.resolve(nx, nz, 0.2);
    this.pos.set(rx, this.reef.heightAt(rx, rz) + 0.1, rz);
    this.group.position.copy(this.pos);
    this.group.rotation.y = -this.heading;
    // Scuttle wobble.
    this.group.position.y += Math.sin(performance.now() * 0.02 + this.heading) * 0.012 * (speed > 1 ? 1 : 0.3);
  }
}

// ── predators ──────────────────────────────────────────────────────────────
const KINDS = {
  grouper: {
    label: 'GROUPER', len: 2.0, color: 0x5c6b57, belly: 0x8e9a7a,
    acuity: 1.0, motionWeight: 1.0, cruise: 1.5, charge: 5.0, range: 17, height: 1.3,
  },
  shark: {
    label: 'REEF SHARK', len: 3.0, color: 0x54606b, belly: 0xc8cfd4,
    acuity: 1.5, motionWeight: 2.0, cruise: 2.4, charge: 7.0, range: 24, height: 2.1,
  },
  jack: {
    label: 'TREVALLY', len: 1.4, color: 0x7d8b96, belly: 0xd7dee2,
    acuity: 1.2, motionWeight: 1.6, cruise: 3.0, charge: 6.0, range: 20, height: 3.0,
  },
};

function makeFish(spec) {
  const g = new THREE.Group();
  const L = spec.len;
  const mat = new THREE.MeshLambertMaterial({ color: spec.color });
  const bellyMat = new THREE.MeshLambertMaterial({ color: spec.belly });

  const bodyGeo = new THREE.SphereGeometry(L * 0.22, 12, 9);
  bodyGeo.scale(0.72, 0.95, 2.1);
  const body = new THREE.Mesh(bodyGeo, mat);
  g.add(body);

  const bellyGeo = new THREE.SphereGeometry(L * 0.19, 10, 7);
  bellyGeo.scale(0.66, 0.5, 1.9);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.y = -L * 0.09;
  g.add(belly);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(L * 0.22, L * 0.42, 4), mat);
  tail.rotation.x = -Math.PI / 2;
  tail.rotation.z = Math.PI / 4;
  tail.scale.set(0.35, 1, 1);
  tail.position.z = L * 0.55;
  g.add(tail);
  g.userData.tail = tail;

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(L * 0.13, L * 0.3, 3), mat);
  dorsal.rotation.x = Math.PI;
  dorsal.scale.set(0.3, 1, 1.6);
  dorsal.position.set(0, L * 0.2, 0);
  g.add(dorsal);

  for (const s of [-1, 1]) {
    const pec = new THREE.Mesh(new THREE.ConeGeometry(L * 0.09, L * 0.22, 3), mat);
    pec.rotation.z = s * Math.PI / 2.2;
    pec.position.set(s * L * 0.15, -L * 0.04, -L * 0.1);
    pec.scale.set(0.4, 1, 1.2);
    g.add(pec);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(L * 0.035, 7, 5),
      new THREE.MeshBasicMaterial({ color: 0x0a0d10 }));
    eye.position.set(s * L * 0.13, L * 0.05, -L * 0.34);
    g.add(eye);
  }
  return g;
}

export class Predator {
  constructor(kind, reef, rnd) {
    this.kind = kind;
    this.spec = KINDS[kind];
    this.reef = reef;
    this.suspicion = 0;
    this.state = 'patrol';
    this.feedTimer = 0;
    this.decoy = null;
    this.heading = rnd() * Math.PI * 2;

    const S = reef.size * 0.65;
    this.pos = new THREE.Vector3(range(rnd, -S, S), 0, range(rnd, -S, S));
    this.pos.y = reef.heightAt(this.pos.x, this.pos.z) + this.spec.height;
    this.waypoint = new THREE.Vector3();
    this._newWaypoint(rnd);
    this.rnd = rnd;

    this.mesh = makeFish(this.spec);
    this.mesh.position.copy(this.pos);
    this.lastKnown = new THREE.Vector3();
    this.dist = 999;
  }

  // Patrols are not uniform over the reef: about half the time the next leg is
  // pulled toward wherever the octopus is, because otherwise a 60 m reef with
  // one grouper on it is not a reef with a grouper on it.
  _newWaypoint(rnd = Math.random, near = null) {
    const S = this.reef.size * 0.7;
    const r = typeof rnd === 'function' ? rnd : Math.random;
    if (near && r() < 0.55) {
      const a = r() * Math.PI * 2, d = 5 + r() * 13;
      this.waypoint.set(
        clamp(near.x + Math.cos(a) * d, -S, S), 0,
        clamp(near.z + Math.sin(a) * d, -S, S)
      );
      return;
    }
    this.waypoint.set(range(r, -S, S), 0, range(r, -S, S));
  }

  update(dt, game) {
    const o = game.octo;
    const spec = this.spec;
    const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // ── evidence ──────────────────────────────────────────────────────────
    if (this.state !== 'feed') {
      const toOcto = Math.atan2(dx, dz);
      const facing = clamp(0.35 + 0.65 * Math.cos(angDiff(this.heading, toOcto)), 0, 1);
      const falloff = clamp(1 - dist / spec.range, 0, 1);
      const lit = game.torch ? game.torch.litAmount(o.pos) : 0;
      const cue = clamp(
        0.60 * (1 - o.match) * lerp(1, 0.55, o.squeeze)
        + 0.62 * spec.motionWeight * o.speedNorm
        + 0.45 * lit, 0, 1.6);
      const gain = cue * facing * falloff * spec.acuity;
      // Below the decay floor the animal genuinely cannot build a case against
      // you — that floor is what makes holding still a real defence.
      const decay = this.state === 'attack' ? 0.04 : 0.14;
      this.suspicion = clamp(this.suspicion + (gain - decay) * dt * 0.85, 0, 1);
      if (this.suspicion > 0.2) this.lastKnown.copy(o.pos);
    }

    // ── state machine ─────────────────────────────────────────────────────
    let speed = spec.cruise;
    let goal = this.waypoint;

    if (this.state === 'feed') {
      this.feedTimer -= dt;
      goal = this.decoy ? this.decoy.pos : this.waypoint;
      speed = spec.cruise * 0.8;
      if (this.feedTimer <= 0 || (this.decoy && this.decoy.dead)) {
        this.state = 'patrol'; this.suspicion = 0; this.decoy = null; this._newWaypoint(Math.random, o.pos);
      }
    } else if (this.state === 'attack') {
      goal = V.copy(o.pos);
      speed = spec.charge;
      if (dist < 0.95 && Math.abs(o.pos.y - this.pos.y) < 1.6) {
        game.caught(this);
        this.suspicion = 0.4;
        this.state = 'investigate';
      }
      if (this.suspicion < 0.5) { this.state = 'investigate'; }
    } else if (this.state === 'investigate') {
      goal = this.lastKnown;
      speed = spec.cruise * 1.5;
      if (this.suspicion >= 1) {
        this.state = 'attack';
        game.audio.alarm();
        game.toast(`${spec.label} HAS YOU`, 'bad');
      } else if (this.suspicion < 0.18) {
        this.state = 'patrol'; this._newWaypoint(Math.random, o.pos);
      }
    } else {
      if (this.pos.distanceTo(this.waypoint) < 3) this._newWaypoint(Math.random, o.pos);
      if (this.suspicion >= 0.5) {
        this.state = 'investigate';
        game.audio.notice();
      }
    }

    // A decoy — pseudomorph or a shed arm — outbids anything else.
    if (this.state !== 'feed') {
      for (const d of game.decoys) {
        if (d.dead) continue;
        const dd = this.pos.distanceTo(d.pos);
        if (dd < d.pull && (this.suspicion > 0.3 || d.forced)) {
          this.state = 'feed';
          this.decoy = d;
          this.feedTimer = d.holds;
          this.suspicion = 0;
          break;
        }
      }
    }

    // ── swim ──────────────────────────────────────────────────────────────
    const gx = goal.x - this.pos.x, gz = goal.z - this.pos.z;
    const want = Math.atan2(gx, gz);
    const turn = this.state === 'attack' ? 3.5 : 1.4;
    this.heading += angDiff(this.heading, want) * Math.min(1, dt * turn);

    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    const lim = this.reef.size * 0.85;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);

    const floor = this.reef.heightAt(this.pos.x, this.pos.z);
    const wantY = floor + (this.state === 'attack' ? 0.55 : spec.height)
                        + Math.sin(performance.now() * 0.0009 + this.spec.len) * 0.25;
    this.pos.y = lerp(this.pos.y, wantY, 1 - Math.exp(-2.5 * dt));

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading + Math.PI;
    const wag = Math.sin(performance.now() * 0.006 * (speed / spec.cruise) + this.spec.len) * 0.4;
    this.mesh.userData.tail.rotation.y = wag;
    this.mesh.rotation.z = wag * 0.12;

    this.dist = dist;
  }
}

// ── moray (lives in a crevice, shows itself once it has bitten you) ────────
export function makeMorayHead() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x6b6b4a });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 9, 7), mat);
  head.scale.set(0.8, 0.8, 1.7);
  g.add(head);
  const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 6), mat);
  jaw.rotation.x = -Math.PI / 2;
  jaw.position.z = -0.28;
  g.add(jaw);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xf2d24b }));
    eye.position.set(s * 0.09, 0.07, -0.16);
    g.add(eye);
  }
  return g;
}

// ── decoys: the pseudomorph, and a shed arm that keeps writhing ───────────
export class Decoy {
  constructor(type, pos, color, reef) {
    this.type = type;
    this.reef = reef;
    this.pos = pos.clone();
    this.life = type === 'ink' ? 6.5 : 8.5;
    this.pull = type === 'ink' ? 14 : 11;
    this.holds = type === 'ink' ? 5 : 8;
    this.forced = type === 'arm';
    this.dead = false;
    this.drift = new THREE.Vector3(range(Math.random, -0.25, 0.25), 0.05, range(Math.random, -0.25, 0.25));

    this.group = new THREE.Group();
    if (type === 'ink') {
      const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 });
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat);
      blob.scale.set(1, 0.8, 1.4);
      this.group.add(blob);
      for (let i = 0; i < 5; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.9, 5), mat);
        const a = (i / 5) * 6.28;
        t.position.set(Math.cos(a) * 0.3, -0.1, Math.sin(a) * 0.3 + 0.4);
        t.rotation.set(1.4, a, 0);
        this.group.add(t);
      }
      this.cloudMat = mat;
    } else {
      const mat = new THREE.MeshLambertMaterial({ color });
      this.segs = [];
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.10 * (1 - i / 9), 6, 5), mat);
        this.group.add(s);
        this.segs.push(s);
      }
    }
    this.group.position.copy(this.pos);
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    this.pos.addScaledVector(this.drift, dt);
    const floor = this.reef.heightAt(this.pos.x, this.pos.z) + 0.25;
    if (this.type === 'arm') this.pos.y = lerp(this.pos.y, floor, 1 - Math.exp(-3 * dt));
    else this.pos.y = lerp(this.pos.y, floor + 0.7, 1 - Math.exp(-0.8 * dt));
    this.group.position.copy(this.pos);

    const t = performance.now() * 0.004;
    if (this.type === 'arm') {
      // Autotomised arms writhe for minutes. It is genuinely why you survive.
      this.segs.forEach((s, i) => {
        s.position.set(
          Math.sin(t * 2 + i * 0.7) * 0.13 * i * 0.3,
          Math.sin(t * 3 + i) * 0.04,
          i * 0.14 + Math.cos(t * 2.2 + i * 0.6) * 0.05
        );
      });
    } else {
      const k = clamp(this.life / 6.5, 0, 1);
      this.cloudMat.opacity = 0.9 * k;
      this.group.scale.setScalar(1 + (1 - k) * 0.8);
    }
  }
}

// ── the diver's torch ──────────────────────────────────────────────────────
export class Torch {
  constructor(reef) {
    this.reef = reef;
    this.t = Math.random() * 10;
    this.light = new THREE.SpotLight(0xfff0d0, 90, 40, 0.36, 0.55, 1.4);
    this.light.position.set(0, 12, 0);
    this.target = new THREE.Object3D();
    this.light.target = this.target;
    this.group = new THREE.Group();
    this.group.add(this.light, this.target);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff4d8 })
    );
    this.lamp = lamp;
    this.group.add(lamp);
    this.spot = new THREE.Vector3();
  }

  update(dt) {
    this.t += dt * 0.14;
    const S = this.reef.size * 0.55;
    const x = Math.sin(this.t) * S;
    const z = Math.cos(this.t * 0.63) * S;
    const y = this.reef.heightAt(x, z) + 8.5;
    this.light.position.set(x, y, z);
    this.lamp.position.set(x, y, z);

    const ax = x + Math.sin(this.t * 2.1) * 7;
    const az = z + Math.cos(this.t * 1.7) * 7;
    this.spot.set(ax, this.reef.heightAt(ax, az), az);
    this.target.position.copy(this.spot);
  }

  litAmount(pos) {
    const d = Math.hypot(pos.x - this.spot.x, pos.z - this.spot.z);
    return clamp(1 - d / 5.5, 0, 1);
  }
}
