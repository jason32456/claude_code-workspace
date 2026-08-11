import * as THREE from '../vendor/three.module.js';
import { BUILDINGS, UPGRADE } from './config.js';
import { tileWorldPos } from './planet.js';

const UP = new THREE.Vector3(0, 1, 0);

const MAT = {
  // Faint self-illumination on the structural parts: the night side is where
  // the game is played, and unlit grey reads as nothing at all out there.
  hull: new THREE.MeshStandardMaterial({
    color: 0x8e97a6, roughness: 0.55, metalness: 0.5, flatShading: true,
    emissive: 0x2c3a4e, emissiveIntensity: 0.75,
  }),
  dark: new THREE.MeshStandardMaterial({
    color: 0x2f3540, roughness: 0.7, metalness: 0.4,
    emissive: 0x1d2836, emissiveIntensity: 0.9,
  }),
  panel: new THREE.MeshStandardMaterial({ color: 0x14335c, roughness: 0.25, metalness: 0.7, emissive: 0x0a2a55, emissiveIntensity: 0.5, side: THREE.DoubleSide }),
  cell: new THREE.MeshStandardMaterial({ color: 0x0d1c2c, roughness: 0.4, metalness: 0.3, emissive: 0x27e0a8, emissiveIntensity: 0.8 }),
  ore: new THREE.MeshStandardMaterial({ color: 0xd8a04a, roughness: 0.4, metalness: 0.7 }),
  laser: new THREE.MeshStandardMaterial({ color: 0xcfd8e6, roughness: 0.35, metalness: 0.7, emissive: 0x22b7ff, emissiveIntensity: 0.55 }),
  arc: new THREE.MeshStandardMaterial({ color: 0xd7c6ff, roughness: 0.3, metalness: 0.6, emissive: 0x9a5cff, emissiveIntensity: 1.1 }),
  mortar: new THREE.MeshStandardMaterial({ color: 0x6f5b45, roughness: 0.85, metalness: 0.25, flatShading: true }),
  wall: new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.9, metalness: 0.2, flatShading: true }),
};

const GEO = {
  pad: new THREE.CylinderGeometry(0.42, 0.5, 0.09, 6),
  post: new THREE.CylinderGeometry(0.07, 0.09, 0.36, 6),
  panel: new THREE.BoxGeometry(0.66, 0.03, 0.46),
  can: new THREE.CylinderGeometry(0.2, 0.22, 0.44, 10),
  ring: new THREE.TorusGeometry(0.23, 0.035, 6, 14),
  drill: new THREE.ConeGeometry(0.16, 0.42, 7),
  collar: new THREE.CylinderGeometry(0.26, 0.3, 0.14, 8),
  turretBase: new THREE.CylinderGeometry(0.24, 0.3, 0.18, 8),
  barrel: new THREE.CylinderGeometry(0.055, 0.075, 0.62, 7),
  emitter: new THREE.IcosahedronGeometry(0.16, 1),
  coil: new THREE.CylinderGeometry(0.06, 0.1, 0.44, 6),
  tube: new THREE.CylinderGeometry(0.13, 0.16, 0.5, 8),
  wall: new THREE.CylinderGeometry(0.52, 0.56, 0.5, 6),
};

export class Building {
  constructor(type, tile) {
    this.type = type;
    this.def = BUILDINGS[type];
    this.tile = tile;
    this.level = 1;
    this.maxHp = 70 + (this.def.cost | 0);
    this.hp = this.maxHp;
    this.cooldown = 0;
    this.target = null;
    this.group = new THREE.Group();
    this.group.position.copy(tileWorldPos(tile));
    this.group.quaternion.setFromUnitVectors(UP, tile.center);
    this.invQuat = this.group.quaternion.clone().invert();
    this.muzzle = new THREE.Vector3();
    build(this);
    tile.building = this;
  }

  // Every level multiplies the interesting numbers, so upgrading is always the
  // same decision: more of this, or another one somewhere else?
  scaled(key) {
    const base = this.def[key];
    return base === undefined ? 0 : base * UPGRADE.powerFactor ** (this.level - 1);
  }

  get upgradeCost() {
    return Math.round(this.def.cost * UPGRADE.costFactor * this.level);
  }

  get sellValue() {
    let spent = this.def.cost;
    for (let l = 1; l < this.level; l++) spent += Math.round(this.def.cost * UPGRADE.costFactor * l);
    return Math.round(spent * UPGRADE.sellRefund);
  }

  get isTurret() { return !!this.def.weapon; }
  get worldPos() { return this.group.position; }
}

function build(b) {
  const g = b.group;
  switch (b.type) {
    case 'SOLAR': {
      g.add(new THREE.Mesh(GEO.pad, MAT.dark));
      const post = new THREE.Mesh(GEO.post, MAT.hull);
      post.position.y = 0.2;
      g.add(post);
      const yoke = new THREE.Group();
      yoke.position.y = 0.4;
      const panel = new THREE.Mesh(GEO.panel, MAT.panel);
      panel.position.y = 0.02;
      yoke.add(panel);
      g.add(yoke);
      b.yoke = yoke;
      b.panel = panel;
      break;
    }
    case 'CAPACITOR': {
      g.add(new THREE.Mesh(GEO.pad, MAT.dark));
      const can = new THREE.Mesh(GEO.can, MAT.hull);
      can.position.y = 0.26;
      g.add(can);
      b.rings = [];
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(GEO.ring, MAT.cell.clone());
        r.rotation.x = Math.PI / 2;
        r.position.y = 0.13 + i * 0.13;
        g.add(r);
        b.rings.push(r);
      }
      break;
    }
    case 'EXTRACTOR': {
      g.add(new THREE.Mesh(GEO.pad, MAT.dark));
      const collar = new THREE.Mesh(GEO.collar, MAT.hull);
      collar.position.y = 0.14;
      g.add(collar);
      const drill = new THREE.Mesh(GEO.drill, MAT.ore);
      drill.position.y = 0.34;
      g.add(drill);
      b.spin = drill;
      break;
    }
    case 'LASER': {
      g.add(new THREE.Mesh(GEO.pad, MAT.dark));
      const base = new THREE.Mesh(GEO.turretBase, MAT.hull);
      base.position.y = 0.14;
      g.add(base);
      const head = new THREE.Group();
      head.position.y = 0.28;
      const barrel = new THREE.Mesh(GEO.barrel, MAT.laser);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.3;
      head.add(barrel);
      g.add(head);
      b.head = head;
      b.muzzleLocal = new THREE.Vector3(0, 0.28, 0.62);
      break;
    }
    case 'ARC': {
      g.add(new THREE.Mesh(GEO.pad, MAT.dark));
      const coil = new THREE.Mesh(GEO.coil, MAT.hull);
      coil.position.y = 0.28;
      g.add(coil);
      const orb = new THREE.Mesh(GEO.emitter, MAT.arc);
      orb.position.y = 0.58;
      g.add(orb);
      b.orb = orb;
      b.muzzleLocal = new THREE.Vector3(0, 0.58, 0);
      break;
    }
    case 'MORTAR': {
      g.add(new THREE.Mesh(GEO.pad, MAT.dark));
      const pit = new THREE.Mesh(GEO.turretBase, MAT.mortar);
      pit.position.y = 0.12;
      g.add(pit);
      const head = new THREE.Group();
      head.position.y = 0.2;
      const tube = new THREE.Mesh(GEO.tube, MAT.mortar);
      tube.rotation.x = Math.PI / 3.1;
      tube.position.z = 0.1;
      tube.position.y = 0.16;
      head.add(tube);
      g.add(head);
      b.head = head;
      b.muzzleLocal = new THREE.Vector3(0, 0.48, 0.24);
      break;
    }
    case 'BULWARK': {
      const slab = new THREE.Mesh(GEO.wall, MAT.wall);
      slab.position.y = 0.24;
      slab.rotation.y = Math.PI / 6;
      g.add(slab);
      break;
    }
    default: break;
  }
}

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _local = new THREE.Vector3();

export function updateBuilding(b, dt, game) {
  if (b.type === 'SOLAR') {
    // Panels track the sun and flop to the horizon at night — the clearest
    // read on "is this half of my grid earning anything right now".
    _local.copy(game.sunDir).applyQuaternion(b.invQuat);
    if (_local.y < 0.14) { _local.y = 0.14; }
    _local.normalize();
    b.yoke.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(UP, _local), Math.min(1, dt * 2.2));
    const lit = b.tile.sun;
    b.panel.material.emissiveIntensity = 0.2 + lit * 1.5;
    return;
  }
  if (b.type === 'CAPACITOR') {
    const frac = game.powerFrac;
    b.rings.forEach((r, i) => {
      const on = frac > (i + 0.35) / 3;
      r.material.emissiveIntensity = on ? 1.1 : 0.06;
    });
    return;
  }
  if (b.type === 'EXTRACTOR') {
    b.spin.rotation.y += dt * 6;
    return;
  }
  if (!b.isTurret) return;

  b.cooldown -= dt * (b.def.firePower > 0 ? game.powerScale : 1);
  const target = pickTarget(b, game);
  b.target = target;
  if (!target) return;

  if (b.head) {
    _dir.copy(target.pos).sub(b.worldPos).applyQuaternion(b.invQuat);
    b.head.rotation.y = Math.atan2(_dir.x, _dir.z);
  }
  if (b.cooldown > 0) return;
  b.cooldown = 1 / b.scaled('rate');
  fire(b, target, game);
}

function muzzleWorld(b, out) {
  if (!b.muzzleLocal) return out.copy(b.worldPos);
  return out.copy(b.muzzleLocal).applyQuaternion(b.group.quaternion).add(b.worldPos);
}

function pickTarget(b, game) {
  const range = b.def.range;
  const hitsAir = b.def.hitsAir;
  let best = null;
  let bestScore = Infinity;
  for (const e of game.enemies) {
    if (e.dead) continue;
    if (e.def.flying && !hitsAir) continue;
    const d = e.pos.distanceTo(b.worldPos);
    if (d > range) continue;
    _dir.copy(e.pos).sub(b.worldPos).normalize();
    if (_dir.dot(b.tile.center) < -0.06) continue;   // below this tile's horizon
    const score = e.progress;                        // closest to a vent first
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function fire(b, target, game) {
  const from = muzzleWorld(b, _v).clone();
  const dmg = b.scaled('damage');
  switch (b.def.weapon) {
    case 'beam':
      game.fx.beam(from, target.pos, 0x4fd9ff, 0.045);
      game.damage(target, dmg * target.def.armour);
      game.audio?.zap();
      break;
    case 'chain': {
      let src = from;
      let hit = target;
      const seen = new Set();
      for (let i = 0; i < b.def.chain && hit; i++) {
        game.fx.beam(src, hit.pos, 0xb98cff, 0.035);
        game.damage(hit, dmg * hit.def.armour);
        seen.add(hit.id);
        src = hit.pos.clone();
        hit = nearestOther(game, src, 1.5, seen);
      }
      game.audio?.arc();
      break;
    }
    case 'shell': {
      const aim = target.pos.clone();
      game.fx.shell(from, aim, (impact) => {
        game.fx.blast(impact, b.def.splash, 0xffa24d);
        game.splashDamage(impact, b.def.splash, b.scaled('damage'));
        game.audio?.thud();
      });
      break;
    }
    default: break;
  }
}

function nearestOther(game, from, range, seen) {
  let best = null, bestD = range;
  for (const e of game.enemies) {
    if (e.dead || seen.has(e.id)) continue;
    const d = e.pos.distanceTo(from);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function ventMarker() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.07, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0xff7a2f, emissive: 0xff5a1f, emissiveIntensity: 1.6, roughness: 0.4 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.34, 3.4, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff8b3d, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  beam.position.y = 1.7;
  g.add(beam);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd08a }),
  );
  core.position.y = 0.16;
  g.add(core);
  g.userData.pulse = [ring, core];
  return g;
}
