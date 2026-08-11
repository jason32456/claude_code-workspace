import * as THREE from 'three';
import { makeBox, resolveAxis, depenetrate } from './physics.js';

export const HX = 0.4, HY = 0.9, HZ = 0.4;
export const ECHO_PAD = 0.4;           // echoes stand on a wider footprint than you, so landing on one is fair

const SPEED = 6.6;
const ACCEL_GROUND = 62;
const ACCEL_AIR = 24;
const FRICTION = 13;
const GRAVITY = 40;
const JUMP = 14.2;                     // apex 2.52 — the number every level is authored against.
                                       // High gravity keeps the arc snappy: a floaty jump makes
                                       // landing on a 1.6-wide echo a guessing game.
const COYOTE = 0.10;
const BUFFER = 0.12;

// One blocky figure, used for both the player and every echo.
export function makeFigure({ color, emissive, ghost = false, cage = [0.82, 1.83, 0.52] }) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: ghost ? 0.85 : 0.32,
    roughness: 0.5,
    metalness: 0.1,
    transparent: ghost,
    opacity: ghost ? 0.34 : 1,
    depthWrite: !ghost,
  });

  const parts = [
    [0.24, 0.72, 0.3, -0.18, 0.36, 0],
    [0.24, 0.72, 0.3, 0.18, 0.36, 0],
    [0.76, 0.82, 0.46, 0, 1.15, 0],
    [0.48, 0.44, 0.46, 0, 1.61, 0],
  ];
  for (const [sx, sy, sz, x, y, z] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    m.receiveShadow = !ghost;
    g.add(m);
  }

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.11, 0.06),
    new THREE.MeshBasicMaterial({ color: ghost ? 0xe6d4ff : 0x9ff6ff })
  );
  visor.position.set(0, 1.63, -0.25);
  g.add(visor);

  // The wireframe is drawn at the collider size, not the model size, so the
  // surface you can actually stand on is the surface you can see.
  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(cage[0], cage[1], cage[2])),
    new THREE.LineBasicMaterial({
      color: emissive, transparent: true, opacity: ghost ? 0.5 : 0.25,
    })
  );
  box.position.y = cage[1] / 2;
  g.add(box);

  if (ghost) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(cage[0], 0.05, cage[2]),
      new THREE.MeshBasicMaterial({ color: emissive, transparent: true, opacity: 0.22 })
    );
    slab.position.y = cage[1];
    g.add(slab);
  }

  g.userData.mat = mat;
  g.userData.cage = box.material;
  return g;
}

export class Player {
  constructor(scene) {
    this.body = makeBox(0, 0, 0, HX * 2, HY * 2, HZ * 2);
    this.body.solid = false;             // the player is never an obstacle for anyone else
    this.body.vy = 0;
    this.vx = 0; this.vz = 0;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.buffer = 0;
    this.yaw = 0;
    this.mesh = makeFigure({ color: 0xdfe9ff, emissive: 0x45e6ff });
    scene.add(this.mesh);
  }

  place(spawn, yaw) {
    this.body.cx = spawn[0];
    this.body.cy = spawn[1] + HY;
    this.body.cz = spawn[2];
    this.body.vy = 0;
    this.vx = this.vz = 0;
    this.grounded = false;
    this.ground = null;
    this.yaw = yaw;
    this.mesh.rotation.y = yaw;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.body.cx, this.body.cy - HY, this.body.cz);
  }

  // Returns per-tick events the recorder and audio layer care about.
  step(dt, wish, jumpHeld, jumpPressed, camYaw, colliders) {
    const b = this.body;
    const out = { jumped: false, landed: false };

    if (jumpPressed) this.buffer = BUFFER;
    this.buffer = Math.max(0, this.buffer - dt);

    // Inherit the motion of whatever we are standing on.
    if (this.ground) {
      b.cx += this.ground.dx;
      b.cy += this.ground.dy;
      b.cz += this.ground.dz;
    }

    let wx = 0, wz = 0;
    if (wish.x || wish.z) {
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const fx = -sin, fz = -cos;        // camera forward on the ground plane
      const rx = cos, rz = -sin;
      wx = fx * wish.z + rx * wish.x;
      wz = fz * wish.z + rz * wish.x;
      const len = Math.hypot(wx, wz);
      if (len > 0) { wx /= len; wz /= len; }
    }

    const accel = this.grounded ? ACCEL_GROUND : ACCEL_AIR;
    if (wx || wz) {
      this.vx += wx * accel * dt;
      this.vz += wz * accel * dt;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > SPEED) { this.vx = this.vx / sp * SPEED; this.vz = this.vz / sp * SPEED; }
      this.yaw = Math.atan2(wx, wz) + Math.PI;
    } else if (this.grounded) {
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0) {
        const drop = Math.max(sp, 2) * FRICTION * dt;
        const k = Math.max(0, sp - drop) / sp;
        this.vx *= k; this.vz *= k;
      }
    }

    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      b.vy = JUMP;
      this.buffer = 0; this.coyote = 0;
      this.grounded = false; this.ground = null;
      out.jumped = true;
    }
    b.vy -= GRAVITY * dt;
    if (b.vy < -55) b.vy = -55;

    const wasGrounded = this.grounded;

    b.cy += b.vy * dt;
    const support = resolveAxis(b, colliders, 'y');

    b.cx += this.vx * dt;
    resolveAxis(b, colliders, 'x');
    b.cz += this.vz * dt;
    resolveAxis(b, colliders, 'z');

    depenetrate(b, colliders);

    this.grounded = !!support;
    this.ground = support;
    if (this.grounded && !wasGrounded) out.landed = true;

    const target = this.yaw;
    let diff = ((target - this.mesh.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.mesh.rotation.y += diff * Math.min(1, dt * 14);

    this.syncMesh();
    return out;
  }
}
