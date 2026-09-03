import * as THREE from '../vendor/three.module.js';
import { PIECES, makePiece, pieceDrop } from './pieces.js';
import { boxGeo, mergeGeos, rnd } from './build3d.js';

export const FLOOR_H = 3.75;
export const CX = 18.5;
export const CZ = 0;
const HALF_X = 10.2;
const HALF_Z = 8.6;
const VIS_GAIN = 3.0;      // the lean you build is real; this makes it visible
export const PLUMB_TOL = 1.0;
export const MAX_FLOORS = 12;

const SLOTS = {
  core: { x: 11.7, z: 0.0, yaw: 0, type: 'core' },
  colA: { x: 15.6, z: -5.7, yaw: 0, type: 'column' },
  colB: { x: 15.6, z: 5.7, yaw: 0, type: 'column' },
  beamA: { x: 20.6, z: -5.7, yaw: 0, type: 'beam' },
  beamB: { x: 20.6, z: 5.7, yaw: 0, type: 'beam' },
  panA: { x: 26.4, z: -3.7, yaw: Math.PI / 2, type: 'panel' },
  panB: { x: 26.4, z: 3.7, yaw: Math.PI / 2, type: 'panel' },
};

function planFor(floor, rand) {
  if (floor <= 2) return ['core', 'colA', 'colB'];
  if (floor <= 4) return ['core', 'colA', 'colB', 'beamA'];
  const col = rand() < 0.5 ? 'colA' : 'colB';
  const beam = rand() < 0.5 ? 'beamA' : 'beamB';
  const pan = rand() < 0.5 ? 'panA' : 'panB';
  return ['core', col, beam, pan];
}

const concrete = new THREE.MeshStandardMaterial({ color: 0xb4b0a6, roughness: 0.95 });

export class Building {
  constructor(scene, seed = Date.now()) {
    this.scene = scene;
    this.rand = rnd(seed);
    this.floor = 1;
    this.lean = new THREE.Vector2(0, 0);   // accumulated, in real metres
    this.floorErr = [];
    this.setTrue = 0;
    this.setTotal = 0;

    this.group = new THREE.Group();
    scene.add(this.group);

    const podium = new THREE.Mesh(boxGeo(HALF_X * 2, 0.5, HALF_Z * 2, CX, -0.25, CZ), concrete);
    podium.receiveShadow = true;
    this.group.add(podium);

    this._buildGuides();
    this.newFloor();
  }

  _buildGuides() {
    this.guides = new THREE.Group();
    this.scene.add(this.guides);

    const mk = (m) => { m.renderOrder = 900; m.material.depthTest = false; return m; };

    this.ghost = mk(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffc247, transparent: true, opacity: 0.95, fog: false })
    ));
    this.guides.add(this.ghost);

    this.ring = mk(new THREE.Mesh(
      new THREE.RingGeometry(0.74, 0.86, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc247, transparent: true, opacity: 0.8, side: THREE.DoubleSide, fog: false })
    ));
    this.ring.rotation.x = -Math.PI / 2;
    this.guides.add(this.ring);

    this.tight = mk(new THREE.Mesh(
      new THREE.RingGeometry(0.27, 0.31, 30),
      new THREE.MeshBasicMaterial({ color: 0x5fe08a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false })
    ));
    this.tight.rotation.x = -Math.PI / 2;
    this.guides.add(this.tight);

    // Where the load is hanging right now, projected onto the deck. Without
    // this you cannot judge 30 cm from ninety metres up.
    this.marker = mk(new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.52, 26),
      new THREE.MeshBasicMaterial({ color: 0xff5d55, transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: false })
    ));
    this.marker.rotation.x = -Math.PI / 2;
    this.guides.add(this.marker);

    this.plumbLine = mk(new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1, 5),
      new THREE.MeshBasicMaterial({ color: 0xff5d55, transparent: true, opacity: 0.35, fog: false })
    ));
    this.guides.add(this.plumbLine);
  }

  get deckY() { return (this.floor - 1) * FLOOR_H; }
  get topY() { return this.deckY + 3.6; }
  leanVis() { return { x: this.lean.x * VIS_GAIN, z: this.lean.y * VIS_GAIN }; }

  newFloor() {
    const off = this.leanVis();
    const plan = planFor(this.floor, this.rand);
    this.slots = plan.map((k) => {
      const s = SLOTS[k];
      const jx = (this.rand() - 0.5) * 0.7;
      const jz = (this.rand() - 0.5) * 0.7;
      return {
        key: k, type: s.type, spec: PIECES[s.type],
        x: s.x + jx + off.x, z: s.z + jz + off.z,
        yaw: s.yaw, seatY: this.deckY, filled: false,
      };
    });
    this.index = 0;
    this.floorErr = [];
  }

  get activeSlot() { return this.slots[this.index] || null; }
  get remaining() { return this.slots.length - this.index; }

  // --- guides ------------------------------------------------------------

  updateGuides(load, spec, visible) {
    const s = this.activeSlot;
    this.guides.visible = !!(s && visible);
    if (!s || !visible) return;
    const sz = s.spec.size;
    this.ghost.position.set(s.x, s.seatY + sz[1] / 2, s.z);
    this.ghost.rotation.y = s.yaw;
    this.ghost.scale.set(sz[0], sz[1], sz[2]);
    this.ring.position.set(s.x, s.seatY + 0.07, s.z);
    this.tight.position.set(s.x, s.seatY + 0.08, s.z);

    const show = !!spec;
    this.marker.visible = show;
    this.plumbLine.visible = show;
    if (!show) return;

    const err = Math.hypot(load.pos.x - s.x, load.pos.z - s.z);
    const col = err < 0.3 ? 0x5fe08a : err < 0.8 ? 0xffc247 : 0xff5d55;
    this.marker.material.color.setHex(col);
    this.plumbLine.material.color.setHex(col);
    this.marker.position.set(load.pos.x, s.seatY + 0.09, load.pos.z);

    const bottom = load.pos.y - (spec ? pieceDrop(spec) : 0);
    const h = Math.max(0.05, bottom - s.seatY);
    this.plumbLine.position.set(load.pos.x, s.seatY + h / 2, load.pos.z);
    this.plumbLine.scale.set(1, h, 1);
  }

  // --- placing -----------------------------------------------------------

  canSet(load, spec) {
    const s = this.activeSlot;
    if (!s) return { ok: false, why: 'no slot' };
    const err = Math.hypot(load.pos.x - s.x, load.pos.z - s.z);
    const above = load.pos.y - pieceDrop(spec) - s.seatY;
    if (err > 1.6) return { ok: false, why: 'NOT OVER THE SLOT', err, above };
    if (above > 0.95) return { ok: false, why: 'TOO HIGH — LOWER IT (F)', err, above };
    if (above < -0.45) return { ok: false, why: 'BELOW THE DECK — HOIST UP (R)', err, above };
    return { ok: true, err, above };
  }

  place(load, spec) {
    const s = this.activeSlot;
    const err = Math.hypot(load.pos.x - s.x, load.pos.z - s.z);
    const impact = load.vel.length();
    let yawErr = Math.abs(wrapPi(load.yaw - s.yaw));
    if (yawErr > Math.PI / 2) yawErr = Math.PI - yawErr;   // pieces are symmetric
    const yawDeg = yawErr * 180 / Math.PI;

    let grade, gradeMul;
    if (err <= 0.30) { grade = 'SET TRUE'; gradeMul = 1; }
    else if (err <= 0.80) { grade = 'GOOD SET'; gradeMul = 1 - (err - 0.3) * 0.8; }
    else { grade = 'ROUGH SET'; gradeMul = 0.6 - (err - 0.8) * 0.44; }

    const yawMul = yawDeg <= spec.yawTol ? 1 : Math.max(0.4, 1 - (yawDeg - spec.yawTol) / (spec.yawTol * 3));
    const damaged = impact > 2.5;
    const impactMul = impact <= 0.8 ? 1 : Math.max(0.35, 1 - (impact - 0.8) * 0.28);

    const value = Math.round(spec.base * gradeMul * yawMul * impactMul * (damaged ? 0.5 : 1));

    // Pieces are authored hanging from the lug, so seating one means putting the
    // lug a full drop-height above the deck. It is set where you set it — only
    // the height is snapped.
    const mesh = makePiece(spec);
    mesh.position.set(load.pos.x, s.seatY + pieceDrop(spec), load.pos.z);
    mesh.rotation.y = load.yaw;
    this.group.add(mesh);

    const w = spec.mass / 8000 * (damaged ? 2 : 1);
    this.floorErr.push({ x: (load.pos.x - s.x) * w, z: (load.pos.z - s.z) * w, w });

    s.filled = true;
    this.index++;
    this.setTotal++;
    if (grade === 'SET TRUE' && !damaged) this.setTrue++;

    const floorDone = this.index >= this.slots.length;
    return { grade, err, yawDeg, impact, damaged, value, floorDone, true_: grade === 'SET TRUE' && !damaged };
  }

  dropPenalty() {
    this.floorErr.push({ x: (this.rand() - 0.5) * 0.5, z: (this.rand() - 0.5) * 0.5, w: 0.6 });
  }

  completeFloor() {
    let sx = 0, sz = 0, sw = 0;
    for (const e of this.floorErr) { sx += e.x; sz += e.z; sw += e.w; }
    if (sw > 0) { this.lean.x += (sx / sw) * 0.5; this.lean.y += (sz / sw) * 0.5; }

    // The deck plus the perimeter frame that carries it. The pieces the player
    // set are the primary members; this is the edge the crew closes up behind.
    const off = this.leanVis();
    const y = this.deckY + 3.4;
    const cx = CX + off.x, cz = CZ + off.z;
    const parts = [
      boxGeo(HALF_X * 2, 0.32, HALF_Z * 2, cx, y + 0.16, cz),
      boxGeo(HALF_X * 2 + 0.4, 0.55, 0.45, cx, y + 0.05, cz - HALF_Z),
      boxGeo(HALF_X * 2 + 0.4, 0.55, 0.45, cx, y + 0.05, cz + HALF_Z),
      boxGeo(0.45, 0.55, HALF_Z * 2, cx - HALF_X, y + 0.05, cz),
      boxGeo(0.45, 0.55, HALF_Z * 2, cx + HALF_X, y + 0.05, cz),
    ];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        parts.push(boxGeo(0.9, 3.4, 0.9, cx + sx * (HALF_X - 0.5), this.deckY + 1.7, cz + sz * (HALF_Z - 0.5)));
      }
    }
    const slab = new THREE.Mesh(mergeGeos(parts), concrete);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.group.add(slab);

    this.floor++;
    if (this.floor <= MAX_FLOORS) this.newFloor();
    return this.lean.length();
  }

  // The structure as a solid: you have to fly the load over it, not through it.
  collide(load, spec) {
    if (!spec) return 0;
    const off = this.leanVis();
    const bottom = load.pos.y - pieceDrop(spec);
    const top = this.deckY - 0.12;
    if (bottom >= top) return 0;
    const half = Math.max(spec.size[0], spec.size[2]) / 2;
    const dx = load.pos.x - (CX + off.x);
    const dz = load.pos.z - (CZ + off.z);
    const ox = HALF_X + half - Math.abs(dx);
    const oz = HALF_Z + half - Math.abs(dz);
    if (ox <= 0 || oz <= 0) return 0;

    const oy = top - bottom;
    if (oy < ox && oy < oz) {
      load.pos.y += oy;
      if (load.vel.y < 0) load.vel.y *= -0.2;
    } else if (ox < oz) {
      load.pos.x += Math.sign(dx || 1) * ox;
      load.vel.x *= -0.25;
    } else {
      load.pos.z += Math.sign(dz || 1) * oz;
      load.vel.z *= -0.25;
    }
    load.vel.multiplyScalar(0.55);
    return Math.max(Math.abs(load.vel.x), Math.abs(load.vel.z), 1);
  }
}

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
