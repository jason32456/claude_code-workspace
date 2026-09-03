import * as THREE from '../vendor/three.module.js';

const G = -9.81;
const SUBSTEPS = 5;
const WIND_K = 0.9;

const _pv = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _air = new THREE.Vector3();
const _acc = new THREE.Vector3();

const EMPTY = { mass: 900, area: 0.7, drag: 0.55, yawRate: 0 };

// The whole game lives in here: a mass on a rigid cable whose pivot is being
// dragged around by the player. Input reaches the load only through this, which
// is the entire point — you are never touching the thing you are aiming.
export class Load {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.cable = 20;
    this.spec = null;
    this.mass = EMPTY.mass;
    this.area = EMPTY.area;
    this.drag = EMPTY.drag;
    this.yaw = 0;
    this.yawVel = 0;
    this.yawRate = EMPTY.yawRate;
  }

  reset(pivot, cable) {
    this.cable = cable;
    this.pos.set(pivot.x, pivot.y - cable, pivot.z);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.yawVel = 0;
    this.clearPiece();
  }

  setPiece(spec, yaw) {
    this.spec = spec;
    this.mass = spec.mass;
    this.area = spec.area;
    this.drag = 0.11;
    this.yawRate = 1.35 / Math.sqrt(spec.mass / 1000);
    this.yaw = yaw;
    this.yawVel = 0;
  }

  clearPiece() {
    this.spec = null;
    this.mass = EMPTY.mass;
    this.area = EMPTY.area;
    this.drag = EMPTY.drag;
    this.yawRate = EMPTY.yawRate;
    this.yawVel = 0;
  }

  step(dt, pivot, prevPivot, wind, cableLen) {
    const h = dt / SUBSTEPS;
    _pv.subVectors(pivot, prevPivot).divideScalar(Math.max(1e-5, dt));
    const from = this.cable;

    for (let i = 0; i < SUBSTEPS; i++) {
      const f = (i + 1) / SUBSTEPS;
      _acc.set(0, G, 0);

      // Wind acts on air-relative velocity, so a load already running downwind
      // stops being pushed. Force scales with area, acceleration with area/mass.
      _air.set(wind.x - this.vel.x, 0, wind.z - this.vel.z);
      const mag = _air.length();
      _acc.addScaledVector(_air, (WIND_K * this.area * mag) / this.mass);

      this.vel.addScaledVector(_acc, h);
      this.vel.multiplyScalar(1 - this.drag * h);
      this.pos.addScaledVector(this.vel, h);

      // The pivot is interpolated across the substeps; using only its end
      // position pumps phantom energy into the swing during fast slew.
      _lp.copy(prevPivot).lerp(pivot, f);
      const L = from + (cableLen - from) * f;
      _d.subVectors(this.pos, _lp);
      const dist = _d.length();
      if (dist > 1e-5) {
        _n.copy(_d).divideScalar(dist);
        this.pos.copy(_lp).addScaledVector(_n, L);
        _rel.subVectors(this.vel, _pv);
        _rel.addScaledVector(_n, -_rel.dot(_n));
        this.vel.copy(_pv).add(_rel);
      }
    }
    this.cable = cableLen;
    this.yaw += this.yawVel * dt;
  }

  steerYaw(dt, axis, precise) {
    if (!this.spec) { this.yawVel *= 1 - 3 * dt; return; }
    const target = axis * this.yawRate * (precise ? 0.35 : 1);
    const acc = 2.2 * dt;
    if (this.yawVel < target) this.yawVel = Math.min(target, this.yawVel + acc);
    else if (this.yawVel > target) this.yawVel = Math.max(target, this.yawVel - acc);
  }

  // How far the load hangs from directly under the pivot. The one number that
  // separates a good operator from a fast one.
  sway(pivot) {
    return Math.hypot(this.pos.x - pivot.x, this.pos.z - pivot.z);
  }
}
