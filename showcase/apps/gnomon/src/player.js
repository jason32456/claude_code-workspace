import { circlePoly } from './geom.js';

export const R = 0.42;
const GRAVITY = 34;
const RUN = 7.6;
const ACCEL_GROUND = 78;
const ACCEL_AIR = 34;
const JUMP = 13.4;
const COYOTE = 0.1;
const BUFFER = 0.12;
const MAX_FALL = 34;

export class Player {
  constructor(bounds) {
    this.bounds = bounds;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.face = 1;
    this.coyote = 0;
    this.buffer = 0;
    this.carryX = 0; this.carryY = 0;
    this.safeX = 0; this.safeY = 0;
    this.safeTimer = 0;
    this.crushed = false;
    this.fell = false;
    this.landed = 0;
    this.stepPhase = 0;
    this.stepped = false;
  }

  spawn(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.crushed = false;
    this.fell = false;
    this.safeX = x; this.safeY = y;
    this.coyote = 0; this.buffer = 0;
    this.carryX = 0; this.carryY = 0;
  }

  step(dt, input, polys) {
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) this.face = dir;

    const accel = this.grounded ? ACCEL_GROUND : ACCEL_AIR;
    const target = dir * RUN + (this.grounded ? this.carryX : 0);
    if (dir) {
      this.vx += Math.sign(target - this.vx) * accel * dt;
      if (Math.abs(target - this.vx) < accel * dt) this.vx = target;
    } else if (this.grounded) {
      const rest = this.carryX;
      const d = rest - this.vx;
      const k = Math.min(1, 16 * dt);
      this.vx += d * k;
    }

    if (input.jump) { this.buffer = BUFFER; input.jump = false; }
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);

    let jumped = false;
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = JUMP + Math.max(0, this.carryY);
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      jumped = true;
    }
    if (!input.jumpHeld && this.vy > 4) this.vy -= 26 * dt; // variable jump height

    this.vy -= GRAVITY * dt;
    if (this.vy < -MAX_FALL) this.vy = -MAX_FALL;

    if (this.grounded) {
      this.x += this.carryX * dt;
      this.y += this.carryY * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const wasAir = !this.grounded;
    this.grounded = false;
    this.carryX = 0; this.carryY = 0;

    let bestGroundY = -1;
    let pushX = 0, pushY = 0;
    const normals = [];

    for (let iter = 0; iter < 4; iter++) {
      let any = false;
      for (const poly of polys) {
        const hit = circlePoly(this.x, this.y, R, poly);
        if (!hit) continue;
        any = true;
        this.x += hit.nx * hit.depth;
        this.y += hit.ny * hit.depth;
        if (iter === 0) {
          pushX += hit.nx * hit.depth;
          pushY += hit.ny * hit.depth;
          if (hit.depth > 0.2) normals.push(hit);
        }

        const a = poly[hit.edge], b = poly[(hit.edge + 1) % poly.length];
        const pvx = a.vx + (b.vx - a.vx) * hit.t;
        const pvy = a.vy + (b.vy - a.vy) * hit.t;

        const rvx = this.vx - pvx, rvy = this.vy - pvy;
        const dot = rvx * hit.nx + rvy * hit.ny;
        if (dot < 0) {
          this.vx -= hit.nx * dot;
          this.vy -= hit.ny * dot;
        }

        if (hit.ny > 0.55 && hit.ny > bestGroundY) {
          bestGroundY = hit.ny;
          this.grounded = true;
          this.carryX = pvx;
          this.carryY = pvy;
        }
      }
      if (!any) break;
    }

    // Squeezed between shadows closing from opposite sides.
    for (let i = 0; i < normals.length && !this.crushed; i++) {
      for (let j = i + 1; j < normals.length; j++) {
        const d = normals[i].nx * normals[j].nx + normals[i].ny * normals[j].ny;
        if (d < -0.65) { this.crushed = true; break; }
      }
    }

    const b = this.bounds;
    if (this.x < b.minX + R) { this.x = b.minX + R; this.vx = Math.max(0, this.vx); }
    if (this.x > b.maxX - R) { this.x = b.maxX - R; this.vx = Math.min(0, this.vx); }
    if (this.y > b.maxY - R) { this.y = b.maxY - R; this.vy = Math.min(0, this.vy); }
    if (this.y < b.minY) this.fell = true;

    if (this.grounded) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.2 && this.y > b.minY + 1.2) {
        this.safeX = this.x; this.safeY = this.y + 0.05;
      }
    } else {
      this.safeTimer = 0;
    }

    this.landed = wasAir && this.grounded ? Math.min(1, Math.abs(this.vy) / 14 + 0.35) : 0;
    this.stepped = false;
    if (this.grounded && Math.abs(this.vx - this.carryX) > 1.5) {
      this.stepPhase += Math.abs(this.vx - this.carryX) * dt;
      if (this.stepPhase > 0.62) { this.stepPhase = 0; this.stepped = true; }
    } else {
      this.stepPhase = 0.55;
    }

    return { jumped };
  }
}
