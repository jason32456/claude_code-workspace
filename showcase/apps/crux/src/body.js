import * as THREE from '../vendor/three.module.js';

// Body geometry shared by the climber and the route generator. The generator
// places every hold from the stance the previous two create, so a line it builds
// is reachable by construction rather than by luck.
export const ARM = 0.9;
export const LEG = 0.9;
export const SHOULDER_UP = 0.52;
export const SHOULDER_OUT = 0.19;
export const HIP_OUT = 0.13;
export const GRAB_RANGE = 1.06;
export const BUILD_REACH = 0.85;
export const DYNO_RANGE = 1.95;
export const STANDOFF = 0.3;
export const HANG_FRESH = 0.03;

const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();

export function hangLength(pump = 0, shaking = false) {
  return HANG_FRESH + (pump / 100) * 0.38 + (shaking ? 0.12 : 0);
}

// Must stay identical to how the climber positions its hips, or the generator
// will build lines the body cannot actually reach.
export function stanceHips(wall, a, b, out = new THREE.Vector3()) {
  out.copy(a).add(b).multiplyScalar(0.5);
  out.addScaledVector(UP, -(SHOULDER_UP + HANG_FRESH));
  out.z = wall.surfaceZ(out.x, out.y) + STANDOFF;
  return out;
}

export function shoulderAt(hips, sign, out = new THREE.Vector3()) {
  return out.set(hips.x + sign * SHOULDER_OUT, hips.y + SHOULDER_UP, hips.z);
}
