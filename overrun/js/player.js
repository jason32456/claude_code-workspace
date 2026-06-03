import * as THREE from '../vendor/three.module.min.js';
import {
  PLAYER_R, EYE_H, WALK_SPEED, SPRINT_MULT, ACCEL, FRICTION,
  JUMP_VEL, GRAVITY, AIR_CTRL, BOB_FREQ, BOB_Y, BOB_X,
  LANDING_PUNCH, REGEN_DELAY, REGEN_RATE
} from './constants.js';
import { resolveCollisions } from './arena.js';

export function createPlayer() {
  const position = new THREE.Vector3(0, 0, 0);
  let vx = 0, vy = 0, vz = 0;
  let pitch = 0, yaw = 0;
  let onGround = false;
  let bobPhase = 0;
  let bobY = 0, bobX = 0;
  let wasOnGround = false;
  let landPunch = 0;

  let hp = 100;
  const maxHp = 100;
  let dead = false;
  let timeSinceDmg = 999;

  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();

  function getInputDir(keys) {
    let fx = 0, fz = 0;
    if (keys['KeyW'] || keys['ArrowUp'])    fz -= 1;
    if (keys['KeyS'] || keys['ArrowDown'])  fz += 1;
    if (keys['KeyA'] || keys['ArrowLeft'])  fx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) fx += 1;

    // Rotate input into world space to match the camera's yaw.
    // Camera forward under Three's YXZ ordering is (-sin yaw, -cos yaw),
    // so the input basis must rotate the same way (not its mirror).
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const wx =  c * fx + s * fz;
    const wz = -s * fx + c * fz;
    const len = Math.sqrt(wx * wx + wz * wz);
    return len > 0 ? { x: wx / len, z: wz / len } : { x: 0, z: 0 };
  }

  function update(dt, keys, aabbs) {
    if (dead) return;

    timeSinceDmg += dt;

    // Regen
    if (timeSinceDmg >= REGEN_DELAY && hp < maxHp) {
      hp = Math.min(maxHp, hp + REGEN_RATE * dt);
    }

    const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
    const maxSpd = WALK_SPEED * (sprinting ? SPRINT_MULT : 1);
    const dir = getInputDir(keys);
    const hasInput = dir.x !== 0 || dir.z !== 0;
    const accelFactor = onGround ? ACCEL : ACCEL * AIR_CTRL;

    if (hasInput) {
      vx += dir.x * accelFactor * dt;
      vz += dir.z * accelFactor * dt;
      const spd = Math.sqrt(vx * vx + vz * vz);
      if (spd > maxSpd) { vx = (vx / spd) * maxSpd; vz = (vz / spd) * maxSpd; }
    } else if (onGround) {
      const spd = Math.sqrt(vx * vx + vz * vz);
      if (spd > 0) {
        const decel = Math.min(spd, FRICTION * dt);
        vx -= (vx / spd) * decel;
        vz -= (vz / spd) * decel;
      }
    }

    // Jump
    if ((keys['Space']) && onGround) {
      vy = JUMP_VEL;
      onGround = false;
    }

    // Gravity
    vy -= GRAVITY * dt;
    position.y += vy * dt;

    const landedThisFrame = !wasOnGround && onGround;
    wasOnGround = onGround;

    if (position.y <= 0) {
      if (!onGround) landPunch = Math.min(Math.abs(vy) / JUMP_VEL, 1) * LANDING_PUNCH;
      position.y = 0;
      vy = 0;
      onGround = true;
    } else {
      onGround = false;
    }

    position.x += vx * dt;
    position.z += vz * dt;
    resolveCollisions(position, PLAYER_R, aabbs);

    // View bob
    const horizSpd = Math.sqrt(vx * vx + vz * vz);
    if (onGround && horizSpd > 1) {
      const bobAmt = Math.min(horizSpd / (WALK_SPEED * SPRINT_MULT), 1);
      bobPhase += BOB_FREQ * dt * Math.PI * 2;
      bobY = Math.sin(bobPhase) * BOB_Y * bobAmt;
      bobX = Math.sin(bobPhase * 0.5) * BOB_X * bobAmt;
    } else {
      // Damp bob back to zero
      bobY *= 0.85;
      bobX *= 0.85;
    }

    // Landing punch decays
    if (landPunch > 0) landPunch = Math.max(0, landPunch - dt * 0.8);
  }

  function takeDamage(amount) {
    if (dead) return;
    hp = Math.max(0, hp - amount);
    timeSinceDmg = 0;
    if (hp <= 0) dead = true;
  }

  function reset() {
    position.set(0, 0, 0);
    vx = 0; vy = 0; vz = 0;
    pitch = 0; yaw = 0;
    onGround = false;
    bobPhase = 0; bobY = 0; bobX = 0;
    landPunch = 0;
    hp = maxHp;
    dead = false;
    timeSinceDmg = 999;
  }

  // Get forward vector for look direction (horizontal only, for AI)
  function getForward() {
    _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    return _fwd;
  }

  return {
    position,
    get vx() { return vx; }, set vx(v) { vx = v; },
    get vz() { return vz; }, set vz(v) { vz = v; },
    get vy() { return vy; },
    get pitch() { return pitch; }, set pitch(v) { pitch = v; },
    get yaw()   { return yaw;   }, set yaw(v)   { yaw = v;   },
    get hp()    { return hp;    },
    get maxHp() { return maxHp; },
    get dead()  { return dead;  },
    get bobY()  { return bobY - landPunch; },
    get bobX()  { return bobX;  },
    get onGround() { return onGround; },
    get horizSpd() { return Math.sqrt(vx * vx + vz * vz); },
    update, takeDamage, reset, getForward,
  };
}
