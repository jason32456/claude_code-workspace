import * as THREE from '../vendor/three.module.js';
import { ENEMIES, PLANET } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const CAPS = { crawler: 300, husk: 120, drifter: 120, spitter: 60, leviathan: 3 };

function geometryFor(key) {
  switch (key) {
    case 'crawler': return new THREE.TetrahedronGeometry(1, 0);
    case 'husk': return new THREE.DodecahedronGeometry(0.9, 0);
    case 'drifter': return new THREE.OctahedronGeometry(1, 0);
    case 'spitter': return new THREE.ConeGeometry(0.75, 1.6, 6);
    default: return new THREE.IcosahedronGeometry(1, 1);
  }
}

let nextId = 1;

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.meshes = {};
    for (const key of Object.keys(ENEMIES)) {
      const def = ENEMIES[key];
      const mat = new THREE.MeshStandardMaterial({
        color: def.color, emissive: def.color, emissiveIntensity: 1.5,
        roughness: 0.45, metalness: 0.25, flatShading: true,
      });
      const inst = new THREE.InstancedMesh(geometryFor(key), mat, CAPS[key]);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.count = 0;
      inst.frustumCulled = false;
      const white = new THREE.Color(1, 1, 1);
      for (let i = 0; i < CAPS[key]; i++) inst.setColorAt(i, white);
      scene.add(inst);
      this.meshes[key] = inst;
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  spawn(type, tileId, game) {
    const def = ENEMIES[type];
    if (this.list.filter((e) => e.def.key === type).length >= CAPS[type] - 1) return null;
    const tile = game.tiles[tileId];
    const hpScale = game.hpScale;
    const e = {
      id: nextId++,
      def,
      hp: def.hp * hpScale,
      maxHp: def.hp * hpScale,
      dead: false,
      flash: 0,
      pos: new THREE.Vector3(),
      spin: Math.random() * Math.PI * 2,
      bob: Math.random() * Math.PI * 2,
      tile: tileId,
      next: -1,
      t: 0,
      progress: 0,
      cooldown: 0,
      spawnTimer: 0,
    };
    if (def.flying) {
      const vent = game.nearestVent(tile.center);
      e.start = tile.center.clone();
      e.axis = new THREE.Vector3().crossVectors(e.start, vent.center);
      if (e.axis.lengthSq() < 1e-6) e.axis.set(0, 1, 0);
      e.axis.normalize();
      e.total = Math.acos(THREE.MathUtils.clamp(e.start.dot(vent.center), -1, 1));
      e.angle = 0;
      e.ventId = vent.id;
    }
    e.pos.copy(tile.pos).addScaledVector(tile.center, def.flying ? def.altitude : 0.22);
    this.list.push(e);
    return e;
  }

  update(dt, game) {
    const tiles = game.tiles;
    for (const e of this.list) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.spin += dt * 1.6;
      e.bob += dt * 3;

      if (e.def.flying) {
        e.angle += (e.def.speed * dt) / PLANET.radius;
        e.progress = (e.total - e.angle) * PLANET.radius;
        if (e.angle >= e.total) { game.leak(e); continue; }
        e.pos.copy(e.start).applyAxisAngle(e.axis, e.angle)
          .multiplyScalar(PLANET.radius + e.def.altitude + Math.sin(e.bob) * 0.12);
        continue;
      }

      if (e.def.spawnsCrawlers) {
        e.spawnTimer -= dt;
        if (e.spawnTimer <= 0) {
          e.spawnTimer = e.def.spawnsCrawlers;
          this.spawn('crawler', e.tile, game);
        }
      }

      if (e.def.attackRange) {
        const prey = game.buildingNear(e.pos, e.def.attackRange);
        if (prey) {
          e.cooldown -= dt;
          if (e.cooldown <= 0) {
            e.cooldown = 1 / e.def.attackRate;
            game.fx.beam(e.pos, prey.worldPos, 0xff6b4f, 0.04, 0.14);
            game.damageBuilding(prey, e.def.attackDamage);
          }
          e.progress = game.flow.dist[e.tile] ?? 0;
          continue;                                   // sieging, not advancing
        }
      }

      if (e.next < 0 || game.blocked[e.next]) {
        e.next = this.pickNext(e, game);
        e.t = 0;
      }
      if (e.next < 0) { e.progress = game.flow.dist[e.tile] ?? 1e6; continue; }

      const from = tiles[e.tile].pos;
      const to = tiles[e.next].pos;
      const seg = from.distanceTo(to) || 1;
      e.t += (e.def.speed * dt) / seg;
      while (e.t >= 1) {
        e.tile = e.next;
        e.t -= 1;
        if (tiles[e.tile].isVent) { game.leak(e); break; }
        e.next = this.pickNext(e, game);
        if (e.next < 0) { e.t = 0; break; }
      }
      if (e.dead) continue;
      const nx = e.next >= 0 ? tiles[e.next].pos : tiles[e.tile].pos;
      e.pos.lerpVectors(tiles[e.tile].pos, nx, THREE.MathUtils.clamp(e.t, 0, 1));
      const len = e.pos.length() || 1;
      e.pos.multiplyScalar((PLANET.radius + 0.22 + Math.sin(e.bob) * 0.05) / len);
      e.progress = game.flow.dist[e.tile] ?? 1e6;
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dead) this.list.splice(i, 1);
    }
  }

  pickNext(e, game) {
    const hop = game.flow.next[e.tile];
    if (hop >= 0 && !game.blocked[hop]) return hop;
    // Walled in mid-route: fall back to the best neighbour we can still enter.
    let best = -1, bestD = game.flow.dist[e.tile] ?? Infinity;
    for (const nb of game.tiles[e.tile].neighbours) {
      if (game.blocked[nb]) continue;
      const d = game.flow.dist[nb];
      if (d < bestD) { bestD = d; best = nb; }
    }
    return best;
  }

  syncInstances() {
    const buckets = {};
    for (const key of Object.keys(this.meshes)) buckets[key] = 0;
    for (const e of this.list) {
      if (e.dead) continue;
      const key = e.def.key;
      const inst = this.meshes[key];
      const i = buckets[key];
      if (i >= CAPS[key]) continue;
      this._q.setFromUnitVectors(UP, this._p.copy(e.pos).normalize());
      this._q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, e.spin));
      const s = e.def.scale * (1 + Math.sin(e.bob) * 0.05);
      this._s.set(s, s, s);
      this._m.compose(e.pos, this._q, this._s);
      inst.setMatrixAt(i, this._m);
      const f = e.flash;
      this._c.setRGB(1 + f * 4, 1 + f * 4, 1 + f * 4);
      inst.setColorAt(i, this._c);
      buckets[key] = i + 1;
    }
    for (const key of Object.keys(this.meshes)) {
      const inst = this.meshes[key];
      inst.count = buckets[key];
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    this.list.length = 0;
    this.syncInstances();
  }
}
