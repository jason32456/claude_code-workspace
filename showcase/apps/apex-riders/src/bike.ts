import * as THREE from 'three';
import { angleDiff, lerp, clamp } from './utils';
import { BikeInput } from './input';
import { Track } from './track';

const P = {
  TOP_SPEED: 36,
  BOOST_TOP_SPEED: 52,
  ACCEL: 18,
  BRAKE: 38,
  COAST_DRAG: 0.018,
  ACTIVE_DRAG_K: 0.008,
  MAX_TURN_SLOW: 2.0,
  MAX_TURN_FAST: 0.85,
  GRIP_RATE: 5.5,
  DRIFT_RATE: 1.2,
  DRIFT_STEER_THRESH: 0.62,
  DRIFT_MIN_SPEED: 14,
  DRIFT_EXIT_SPEED: 8,
  BOOST_FILL: 0.45,
  BOOST_DRAIN: 0.7,
  MAX_LEAN: 0.56,
  LEAN_SPEED: 5.5,
  OFF_TRACK_DRAG: 0.12,
};

export interface BikeState {
  position: THREE.Vector3;
  heading: number;
  velocityHeading: number;
  speed: number;
  leanAngle: number;
  isDrifting: boolean;
  boostMeter: number;
  trackIndex: number;
  onTrack: boolean;
  prevLapDot: number;
}

export class Bike {
  state: BikeState;
  model: THREE.Group;
  smokeSystem: SmokeSystem;
  private bikeBody: THREE.Group;

  constructor(startPos: THREE.Vector3, startHeading: number) {
    this.state = {
      position: startPos.clone(),
      heading: startHeading,
      velocityHeading: startHeading,
      speed: 0,
      leanAngle: 0,
      isDrifting: false,
      boostMeter: 0,
      trackIndex: 0,
      onTrack: true,
      prevLapDot: 0,
    };
    const { group, leanGroup } = buildBikeModel();
    this.model = group;
    this.bikeBody = leanGroup;
    this.smokeSystem = new SmokeSystem();
  }

  reset(pos: THREE.Vector3, heading: number) {
    const s = this.state;
    s.position.copy(pos);
    s.heading = heading;
    s.velocityHeading = heading;
    s.speed = 0;
    s.leanAngle = 0;
    s.isDrifting = false;
    s.boostMeter = 0;
    s.trackIndex = 0;
    s.onTrack = true;
    s.prevLapDot = 0;
  }

  /** Returns true when the bike crosses the start/finish line (lap completed) */
  update(input: BikeInput, dt: number, track: Track): boolean {
    const s = this.state;
    dt = Math.min(dt, 0.05);

    // ── Speed ──────────────────────────────────────────────────
    const boosting = input.boost && s.boostMeter > 0.01;
    const topSpeed = boosting ? P.BOOST_TOP_SPEED : P.TOP_SPEED;

    if (input.brake) {
      s.speed = Math.max(0, s.speed - P.BRAKE * dt);
    } else if (input.accelerate) {
      const drag = P.ACTIVE_DRAG_K * s.speed * s.speed;
      s.speed += (P.ACCEL - drag) * dt;
    } else {
      s.speed -= s.speed * P.COAST_DRAG * 60 * dt;
    }

    if (boosting) {
      s.speed += 28 * dt;
      s.boostMeter = Math.max(0, s.boostMeter - P.BOOST_DRAIN * dt);
    }

    s.speed = clamp(s.speed, 0, topSpeed);

    if (!s.onTrack) {
      s.speed *= Math.pow(1 - P.OFF_TRACK_DRAG, dt * 60);
    }

    // ── Steering ───────────────────────────────────────────────
    // +steer = right. Forward is (sin h, cos h); decreasing heading
    // rotates forward toward the bike's right, so steer subtracts.
    if (s.speed > 0.5) {
      const sf = Math.min(s.speed / P.TOP_SPEED, 1);
      const turnRate = lerp(P.MAX_TURN_SLOW, P.MAX_TURN_FAST, sf);
      s.heading -= input.steer * turnRate * dt;
    }

    // ── Drift ──────────────────────────────────────────────────
    const canDrift = Math.abs(input.steer) > P.DRIFT_STEER_THRESH && s.speed > P.DRIFT_MIN_SPEED;
    if (canDrift) {
      s.isDrifting = true;
    } else if (s.speed < P.DRIFT_EXIT_SPEED || !canDrift) {
      s.isDrifting = false;
    }

    const catchupRate = s.isDrifting ? P.DRIFT_RATE : P.GRIP_RATE;
    const hDiff = angleDiff(s.heading, s.velocityHeading);
    s.velocityHeading += hDiff * catchupRate * dt;

    if (s.isDrifting) {
      s.boostMeter = Math.min(1, s.boostMeter + P.BOOST_FILL * dt);
    }

    // ── Position ───────────────────────────────────────────────
    s.position.x += Math.sin(s.velocityHeading) * s.speed * dt;
    s.position.z += Math.cos(s.velocityHeading) * s.speed * dt;
    s.position.y = 0.3;

    // ── Lean ───────────────────────────────────────────────────
    // +steer (right) rolls the bike into the corner (positive lean).
    const speedFactor = Math.min(s.speed / P.TOP_SPEED, 1);
    const targetLean = input.steer * speedFactor * P.MAX_LEAN;
    s.leanAngle += (targetLean - s.leanAngle) * P.LEAN_SPEED * dt;

    // ── Track query ────────────────────────────────────────────
    const info = track.findNearest(s.position, s.trackIndex);
    s.trackIndex = info.index;
    s.onTrack = info.onTrack;

    // ── Smoke ──────────────────────────────────────────────────
    const rearX = s.position.x - Math.sin(s.heading) * 1.5;
    const rearZ = s.position.z - Math.cos(s.heading) * 1.5;
    const smokePos = new THREE.Vector3(rearX, 0.15, rearZ);
    this.smokeSystem.update(dt, smokePos, s.isDrifting, s.heading, s.speed);

    // ── Sync model ─────────────────────────────────────────────
    this.model.position.copy(s.position);
    this.model.rotation.y = s.heading;
    this.bikeBody.rotation.z = s.leanAngle;

    // ── Lap crossing ───────────────────────────────────────────
    return this._checkLap(track);
  }

  private _checkLap(track: Track): boolean {
    const s = this.state;
    const positions = track.getPositions();
    const p0 = positions[0];
    const p1 = positions[1];
    const tan = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z).normalize();

    const rel = new THREE.Vector3(s.position.x - p0.x, 0, s.position.z - p0.z);
    const dot = rel.dot(tan);

    const nearStart = s.trackIndex < 100 || s.trackIndex > 1900;
    const crossed = nearStart && s.prevLapDot < 0 && dot >= 0 && s.speed > 2;

    s.prevLapDot = dot;
    return crossed;
  }
}

// ── Bike mesh builder ─────────────────────────────────────────────────────────

function buildBikeModel(): { group: THREE.Group; leanGroup: THREE.Group } {
  const group = new THREE.Group();
  // leanGroup rolls about the travel axis (lean). body is flipped 180° so the
  // authored nose (local -Z) points along the direction of travel (+Z).
  const leanGroup = new THREE.Group();
  group.add(leanGroup);
  const body = new THREE.Group();
  body.rotation.y = Math.PI;
  leanGroup.add(body);

  const matBody = new THREE.MeshLambertMaterial({ color: 0x0055ff });
  const matAccent = new THREE.MeshLambertMaterial({ color: 0x00ccff });
  const matDark = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const matWheel = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const matRim = new THREE.MeshLambertMaterial({ color: 0x999999 });
  const matGlow = new THREE.MeshLambertMaterial({ color: 0xffffee, emissive: 0xffffee, emissiveIntensity: 0.4 });
  const matRider = new THREE.MeshLambertMaterial({ color: 0x222244 });
  const matHelmet = new THREE.MeshLambertMaterial({ color: 0x0033cc });

  // Main body
  addMesh(body, new THREE.BoxGeometry(0.7, 0.55, 2.0), matBody, 0, 0.55, 0);
  // Top fairing
  addMesh(body, new THREE.BoxGeometry(0.5, 0.28, 1.1), matAccent, 0, 0.96, -0.1);
  // Seat
  addMesh(body, new THREE.BoxGeometry(0.35, 0.18, 0.6), matDark, 0, 0.98, 0.55);
  // Nose
  addMesh(body, new THREE.BoxGeometry(0.5, 0.4, 0.5), matBody, 0, 0.45, -1.1);
  // Windshield
  const ws = addMesh(body, new THREE.BoxGeometry(0.38, 0.32, 0.08), matAccent, 0, 0.88, -1.0);
  ws.rotation.x = 0.3;
  // Headlight
  addMesh(body, new THREE.BoxGeometry(0.4, 0.18, 0.08), matGlow, 0, 0.52, -1.28);
  // Exhaust
  const ex = addMesh(body, new THREE.CylinderGeometry(0.06, 0.09, 0.85, 8), matDark, 0.38, 0.28, 0.35);
  ex.rotation.z = Math.PI / 2;
  // Handlebars
  const hb = addMesh(body, new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), matDark, 0, 0.85, -0.78);
  hb.rotation.z = Math.PI / 2;

  // Wheels
  addWheel(body, -1.05, matWheel, matRim);
  addWheel(body, 0.95, matWheel, matRim);

  // Forks
  for (const sx of [-0.16, 0.16]) {
    const fork = addMesh(body, new THREE.CylinderGeometry(0.04, 0.04, 0.65, 6), matDark, sx, 0.6, -0.9);
    fork.rotation.x = 0.1;
  }

  // Rider
  const rb = addMesh(body, new THREE.BoxGeometry(0.38, 0.55, 0.5), matRider, 0, 1.1, 0.35);
  rb.rotation.x = -0.25;
  addMesh(body, new THREE.SphereGeometry(0.22, 10, 8), matHelmet, 0, 1.52, 0.05);

  return { group, leanGroup };
}

function addMesh(
  parent: THREE.Group,
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addWheel(parent: THREE.Group, z: number, matTire: THREE.Material, matRim: THREE.Material) {
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.10, 8, 24), matTire);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), matRim);
  disc.rotation.x = Math.PI / 2;
  wheel.add(rim, disc);
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(0, 0.33, z);
  parent.add(wheel);
}

// ── Tire smoke particle system ────────────────────────────────────────────────

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
}

export class SmokeSystem {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private readonly max = 300;
  private posArr: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private emitAccum = 0;

  constructor() {
    const geom = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.max * 3);
    // park all particles far away initially
    for (let i = 0; i < this.max; i++) this.posArr[i * 3 + 1] = -9999;
    this.posAttr = new THREE.Float32BufferAttribute(this.posArr, 3);
    geom.setAttribute('position', this.posAttr);

    const mat = new THREE.PointsMaterial({
      color: 0xcccccc,
      size: 2.2,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geom, mat);
    (this.points.material as THREE.PointsMaterial).needsUpdate = true;
  }

  update(dt: number, emitPos: THREE.Vector3, emitting: boolean, heading: number, speed: number) {
    const RATE = 0.022; // seconds between emissions

    if (emitting) {
      this.emitAccum += dt;
      while (this.emitAccum >= RATE && this.particles.length < this.max) {
        this.emitAccum -= RATE;
        const jitter = 0.5;
        const backX = -Math.sin(heading) * speed * 0.04;
        const backZ = -Math.cos(heading) * speed * 0.04;
        this.particles.push({
          pos: new THREE.Vector3(
            emitPos.x + (Math.random() - 0.5) * jitter,
            emitPos.y,
            emitPos.z + (Math.random() - 0.5) * jitter,
          ),
          vel: new THREE.Vector3(
            backX + (Math.random() - 0.5) * 1.0,
            0.5 + Math.random() * 0.8,
            backZ + (Math.random() - 0.5) * 1.0,
          ),
          age: 0,
          life: 0.45 + Math.random() * 0.5,
        });
      }
    } else {
      this.emitAccum = 0;
    }

    // Age & update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      p.vel.y -= 1.5 * dt;
    }

    // Write to GPU buffer
    const n = Math.min(this.particles.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      this.posArr[i * 3] = p.pos.x;
      this.posArr[i * 3 + 1] = p.pos.y;
      this.posArr[i * 3 + 2] = p.pos.z;
    }
    for (let i = n; i < this.max; i++) {
      this.posArr[i * 3 + 1] = -9999;
    }
    this.posAttr.needsUpdate = true;
  }
}
