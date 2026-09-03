import * as THREE from '../vendor/three.module.js';
import { boxGeo, mergeGeos, latticeSection, latticeRun } from './build3d.js';
import { clamp } from './input.js';

export const JIB_MIN = 5.0;
export const JIB_MAX = 33.0;
export const M_MAX = 165; // tonne-metres — the crane is rated in moment, not mass
const SECTION = 2.6;
const HANG_DROP = 1.4;

const RATE = {
  slewMax: 0.24, slewAcc: 0.30,
  trolleyMax: 4.0, trolleyAcc: 3.2,
  hoistUpMax: 2.4, hoistDownMax: 2.8, hoistAcc: 5.0,
};

const steel = new THREE.MeshStandardMaterial({ color: 0xf0b53c, roughness: 0.62, metalness: 0.15 });
const dark = new THREE.MeshStandardMaterial({ color: 0x3d434c, roughness: 0.75, metalness: 0.3 });
const glass = new THREE.MeshStandardMaterial({ color: 0x8fd3ff, roughness: 0.15, metalness: 0.5, transparent: true, opacity: 0.55 });
const cableMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.5, metalness: 0.6 });

export class Crane {
  constructor(scene) {
    this.scene = scene;
    this.mastH = 34;
    this.slew = 0;
    this.slewVel = 0;
    this.radius = 16;
    this.radiusVel = 0;
    this.cable = 24;
    this.cableVel = 0;
    this.lmi = 0;
    this.overload = false;
    this.brakes = false;

    this.root = new THREE.Group();
    scene.add(this.root);

    const base = new THREE.Mesh(
      mergeGeos([
        boxGeo(8, 1.4, 8, 0, 0.7, 0),
        boxGeo(11, 0.5, 2.2, 0, 0.25, 0),
        boxGeo(2.2, 0.5, 11, 0, 0.25, 0),
      ]),
      new THREE.MeshStandardMaterial({ color: 0x8e8b84, roughness: 1 })
    );
    base.castShadow = base.receiveShadow = true;
    this.root.add(base);

    this.mast = new THREE.Mesh(new THREE.BufferGeometry(), steel);
    this.mast.castShadow = true;
    this.root.add(this.mast);

    this.top = new THREE.Group();
    this.root.add(this.top);
    this._buildTop();

    this.trolley = new THREE.Mesh(
      mergeGeos([boxGeo(1.6, 0.7, 1.7, 0, 0, 0), boxGeo(0.5, 0.5, 0.5, 0, -0.55, 0)]),
      dark
    );
    this.trolley.castShadow = true;
    this.top.add(this.trolley);

    this.cableMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), cableMat);
    scene.add(this.cableMesh);

    this.hook = new THREE.Mesh(
      mergeGeos([
        boxGeo(1.5, 0.55, 0.7, 0, 0, 0),
        boxGeo(0.28, 0.9, 0.28, -0.5, -0.5, 0),
        boxGeo(0.28, 0.9, 0.28, 0.5, -0.5, 0),
        boxGeo(1.2, 0.3, 0.5, 0, -1.0, 0),
        boxGeo(0.34, 0.9, 0.34, 0, -1.5, 0),
      ]),
      new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.45, metalness: 0.7 })
    );
    this.hook.castShadow = true;
    scene.add(this.hook);

    this.setMastHeight(34);
  }

  _buildTop() {
    const g = [];
    g.push(boxGeo(3.4, 1.1, 3.4, 0, 0.55, 0));
    latticeRun(2.4, JIB_MAX + 1.4, 2.0, 0.2, g, 2.1);
    latticeRun(-13.5, -2.4, 2.2, 0.22, g, 2.1);
    g.push(boxGeo(3.4, 2.4, 3.6, -12.4, 2.1, 0));
    g.push(boxGeo(2.4, 2.2, 2.0, 2.6, 2.0, 2.3));
    // A-frame + pendant bars: the visual proof that the jib is held up by tension
    const apex = 11.5;
    g.push(boxGeo(0.3, apex, 0.3, -0.9, 1.6 + apex / 2, 0, 0, 0, 0.09));
    g.push(boxGeo(0.3, apex, 0.3, 0.9, 1.6 + apex / 2, 0, 0, 0, -0.09));
    const pend = (x1, x2) => {
      const dx = x2 - x1, dy = (2.6) - (1.6 + apex);
      const len = Math.hypot(dx, dy);
      g.push(boxGeo(0.16, len, 0.16, (x1 + x2) / 2, (1.6 + apex + 2.6) / 2, 0, 0, 0, Math.atan2(dx, -dy)));
    };
    pend(0, 15); pend(0, 32); pend(0, -12);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 0.12), glass);
    cab.position.set(2.6, 2.1, 3.32);
    this.top.add(cab);
    const m = new THREE.Mesh(mergeGeos(g), steel);
    m.castShadow = true;
    this.top.add(m);
  }

  setMastHeight(h) {
    this.mastH = h;
    const g = [];
    const bays = Math.max(4, Math.round((h - 1.4) / SECTION));
    for (let i = 0; i < bays; i++) latticeSection(2.6, SECTION, 0.26, g, 0, 1.4 + i * SECTION, 0);
    this.mast.geometry.dispose();
    this.mast.geometry = mergeGeos(g);
    this.top.position.y = 1.4 + bays * SECTION;
    this.jibY = this.top.position.y + 2.1 - HANG_DROP;
  }

  // The point the cable actually hangs from, in world space.
  pivot(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.slew) * this.radius, this.jibY, -Math.sin(this.slew) * this.radius);
  }

  maxRadiusFor(massKg) {
    if (!massKg) return JIB_MAX;
    return clamp(M_MAX / (massKg / 1000), JIB_MIN, JIB_MAX);
  }

  update(dt, input, load) {
    const precise = input.down('precise');
    const sp = precise ? 0.35 : 1;
    const ac = precise ? 0.55 : 1;
    this.brakes = input.down('stop');

    const want = this.brakes ? { s: 0, t: 0, h: 0 }
      : { s: input.axis('slewR', 'slewL'), t: input.axis('trolleyIn', 'trolleyOut'), h: input.axis('hoistDown', 'hoistUp') };
    const brakeBoost = this.brakes ? 2.2 : 1;

    this.slewVel = approach(this.slewVel, want.s * RATE.slewMax * sp, RATE.slewAcc * ac * brakeBoost * dt);
    this.slew += this.slewVel * dt;

    const massKg = load ? load.mass : 0;
    const rMax = this.maxRadiusFor(massKg);
    this.lmi = massKg ? (massKg / 1000) * this.radius / M_MAX : 0;
    this.overload = massKg > 0 && this.radius >= rMax - 0.05 && want.t > 0;

    let tTarget = want.t * RATE.trolleyMax * sp;
    if (this.radius >= rMax && tTarget > 0) tTarget = 0;
    this.radiusVel = approach(this.radiusVel, tTarget, RATE.trolleyAcc * ac * brakeBoost * dt);
    // Never teleport the trolley: if a pick left us outside the rated radius the
    // limit only blocks going further out, it does not drag us in.
    const rLimit = Math.max(rMax, this.radius);
    this.radius = clamp(this.radius + this.radiusVel * dt, JIB_MIN, rLimit);
    if (this.radius <= JIB_MIN || this.radius >= rLimit) this.radiusVel = 0;

    const hMax = want.h > 0 ? RATE.hoistUpMax : RATE.hoistDownMax;
    this.cableVel = approach(this.cableVel, -want.h * hMax * sp, RATE.hoistAcc * ac * brakeBoost * dt);
    const cableMin = 2.2;
    const cableMax = this.jibY - 0.6;
    this.cable = clamp(this.cable + this.cableVel * dt, cableMin, cableMax);
    if (this.cable <= cableMin || this.cable >= cableMax) this.cableVel = 0;

    this.top.rotation.y = this.slew;
    this.trolley.position.set(this.radius, 1.45, 0);
  }

  // Draw the rope between the pivot and wherever the hook actually is.
  drawCable(hookPos) {
    const p = this.pivot();
    const d = new THREE.Vector3().subVectors(hookPos, p);
    const len = d.length();
    this.cableMesh.position.copy(p).addScaledVector(d, 0.5);
    this.cableMesh.scale.set(1, Math.max(0.01, len), 1);
    this.cableMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.hook.position.copy(hookPos);
  }
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}
