import * as THREE from '../vendor/three.module.js';
import { STRAND_TYPES } from './webmodel.js';

const WALK_SPEED = 7.4;
const DROP_SPEED = 9.0;
const CLIMB_SPEED = 7.0;

function buildBody() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1b1526, roughness: 0.6, metalness: 0.1 });
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xe8c470,
    emissive: 0x6d4c12,
    emissiveIntensity: 0.6,
    roughness: 0.5,
  });

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), bodyMat);
  abdomen.scale.set(1, 1.15, 0.85);
  abdomen.position.set(0, -0.16, 0);
  g.add(abdomen);

  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), markMat);
  mark.scale.set(0.7, 1.3, 0.5);
  mark.position.set(0, -0.16, 0.26);
  g.add(mark);

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bodyMat);
  thorax.position.set(0, 0.22, 0.02);
  g.add(thorax);

  const legMat = new THREE.MeshStandardMaterial({ color: 0x2b2338, roughness: 0.8 });
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const k = i % 4;
    const leg = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.42, 5), legMat);
    upper.position.y = 0.21;
    const knee = new THREE.Group();
    knee.position.y = 0.42;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.014, 0.44, 5), legMat);
    lower.position.y = 0.22;
    knee.add(lower);
    leg.add(upper);
    leg.add(knee);
    leg.position.set(side * 0.14, 0.16 - k * 0.06, 0);
    leg.rotation.z = side * (0.7 + k * 0.16);
    leg.userData = { side, k, knee, base: leg.rotation.z };
    knee.rotation.z = -side * 1.15;
    g.add(leg);
    legs.push(leg);
  }
  g.userData.legs = legs;
  return g;
}

export class Spider {
  constructor(scene, model) {
    this.model = model;
    this.mesh = buildBody();
    this.mesh.scale.setScalar(1.45);
    scene.add(this.mesh);

    // A cold little light travelling with the spider is the only thing that
    // makes silk near it read as taut rather than as a flat line.
    this.lamp = new THREE.PointLight(0x9dc0ff, 13, 10, 2);
    scene.add(this.lamp);

    this.dragMesh = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xbcd6ff, transparent: true, opacity: 0.8 }),
    );
    this.dragMesh.frustumCulled = false;
    this.dragMesh.visible = false;
    scene.add(this.dragMesh);

    this.strand = null;
    this.u = 0.5;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.facing = 0;
    this.mode = 'web'; // web | drop | fall
    this.dropAnchor = new THREE.Vector3();
    this.dropLen = 0;
    this.gait = 0;
    this.health = 100;
    this.stunned = 0;
    this.hitFlash = 0;
  }

  placeOn(strand, u = 0.5) {
    this.strand = strand;
    this.u = u;
    this.mode = 'web';
    const p = this.model.sample(strand, u);
    this.pos.set(p.x, p.y, p.z);
  }

  // The spider is homeless if the strand under it snapped. Re-seat it on the
  // nearest silk rather than dropping the run.
  reseat() {
    const near = this.model.closestStrand(this.pos.x, this.pos.y, 60);
    if (near) {
      this.placeOn(near.strand, near.u);
      return true;
    }
    this.strand = null;
    return false;
  }

  currentSpeed() {
    if (!this.strand) return WALK_SPEED;
    return WALK_SPEED * STRAND_TYPES[this.strand.type].walkSpeed;
  }

  update(dt, input, model) {
    if (this.stunned > 0) this.stunned -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (this.strand && this.strand.dead) this.reseat();

    if (this.mode === 'drop') {
      this.updateDrop(dt, input, model);
    } else if (this.strand) {
      this.updateWalk(dt, input, model);
    }

    this.mesh.position.copy(this.pos);
    this.mesh.position.z += 0.34;
    this.lamp.position.set(this.pos.x, this.pos.y, this.pos.z + 2.2);
    this.mesh.rotation.z = this.facing;
    const bob = this.mode === 'web' ? Math.sin(this.gait * 2) * 0.02 : 0;
    this.mesh.position.y += bob;

    const legs = this.mesh.userData.legs;
    for (const leg of legs) {
      const d = leg.userData;
      const phase = this.gait + (d.k * 0.8 + (d.side > 0 ? Math.PI : 0));
      const swing = Math.sin(phase) * (this.moving ? 0.34 : 0.05);
      leg.rotation.z = d.base + swing * d.side * 0.6;
      d.knee.rotation.z = -d.side * (1.15 + Math.cos(phase) * (this.moving ? 0.3 : 0.05));
    }

    const flash = Math.max(0, this.hitFlash);
    this.mesh.children[1].material.emissiveIntensity = 0.6 + flash * 5;
  }

  updateWalk(dt, input, model) {
    const s = this.strand;
    const stun = this.stunned > 0 ? 0.35 : 1;
    const ix = input.x;
    const iy = input.y;
    const mag = Math.hypot(ix, iy);
    this.moving = mag > 0.1;

    if (this.moving) {
      const ax = s.b.x - s.a.x;
      const ay = s.b.y - s.a.y;
      const len = Math.hypot(ax, ay) || 1;
      const dot = (ix * ax + iy * ay) / (len * mag);
      const dir = Math.sign(dot);
      const speed = this.currentSpeed() * stun * Math.min(1, Math.abs(dot) * 1.6 + 0.15) * mag;
      this.u += (dir * speed * dt) / len;
      this.gait += dt * speed * 1.5;

      if (this.u > 1 || this.u < 0) {
        const node = this.u > 1 ? s.b : s.a;
        const next = this.pickStrand(node, ix / mag, iy / mag, s);
        if (next) {
          this.strand = next.strand;
          this.u = next.fromA ? 0.001 : 0.999;
        } else {
          this.u = Math.max(0, Math.min(1, this.u));
        }
      }
    }

    const p = model.sample(this.strand, this.u);
    this.pos.set(p.x, p.y, p.z);
    const t = model.tangent(this.strand, this.u);
    const target = Math.atan2(t.y, t.x) - Math.PI / 2;
    this.facing = angleLerp(this.facing, this.moving ? this.facingFor(target, input) : this.facing, 1 - Math.exp(-12 * dt));
  }

  facingFor(tangentAngle, input) {
    // Face along the strand, but pick the end the player is pushing toward.
    const a = tangentAngle;
    const b = tangentAngle + Math.PI;
    const want = Math.atan2(input.y, input.x) - Math.PI / 2;
    return Math.abs(angleDiff(a, want)) < Math.abs(angleDiff(b, want)) ? a : b;
  }

  pickStrand(node, dx, dy, exclude) {
    let best = null;
    let bestDot = 0.08;
    for (const s of node.strands) {
      if (s === exclude || s.dead) continue;
      const other = s.a === node ? s.b : s.a;
      const vx = other.x - node.x;
      const vy = other.y - node.y;
      const l = Math.hypot(vx, vy) || 1;
      const dot = (vx / l) * dx + (vy / l) * dy;
      if (dot > bestDot) {
        bestDot = dot;
        best = { strand: s, fromA: s.a === node };
      }
    }
    return best;
  }

  startDrop() {
    if (this.mode !== 'web' || !this.strand) return false;
    this.mode = 'drop';
    this.dropAnchor.copy(this.pos);
    this.dropLen = 0;
    this.dropStrand = this.strand;
    this.dropU = this.u;
    return true;
  }

  updateDrop(dt, input, model) {
    const held = input.drop;
    if (held) {
      this.dropLen = Math.min(this.dropLen + DROP_SPEED * dt, 22);
    } else {
      this.dropLen -= CLIMB_SPEED * dt;
    }

    // Re-anchor to whatever the anchor strand has become while hanging.
    if (this.dropStrand && !this.dropStrand.dead) {
      const a = model.sample(this.dropStrand, this.dropU);
      this.dropAnchor.set(a.x, a.y, a.z);
    }

    this.pos.set(
      this.dropAnchor.x + input.x * Math.min(2.2, this.dropLen * 0.25),
      this.dropAnchor.y - this.dropLen,
      this.dropAnchor.z,
    );
    this.gait += dt * 2;
    this.moving = false;

    if (this.dropLen <= 0.02) {
      this.mode = 'web';
      if (this.dropStrand && !this.dropStrand.dead) {
        this.strand = this.dropStrand;
        this.u = this.dropU;
      } else {
        this.reseat();
      }
      return;
    }

    // Latching onto silk you swing into is the whole point of a dragline.
    if (this.dropLen > 1.2) {
      const near = model.closestStrand(this.pos.x, this.pos.y, 0.65, (s) => s !== this.dropStrand);
      if (near) {
        this.mode = 'web';
        this.placeOn(near.strand, near.u);
        model.tug(near.strand, near.u, 0, -0.05);
      }
    }
  }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    this.stunned = 0.55;
    this.hitFlash = 0.35;
  }

  renderDrag() {
    if (this.mode === 'drop') {
      this.dragMesh.visible = true;
      const pos = this.dragMesh.geometry.attributes.position;
      pos.setXYZ(0, this.dropAnchor.x, this.dropAnchor.y, this.dropAnchor.z);
      pos.setXYZ(1, this.pos.x, this.pos.y + 0.2, this.pos.z);
      pos.needsUpdate = true;
      this.dragMesh.geometry.computeBoundingSphere();
    } else {
      this.dragMesh.visible = false;
    }
  }
}

function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function angleLerp(a, b, t) {
  return a + angleDiff(b, a) * t;
}
