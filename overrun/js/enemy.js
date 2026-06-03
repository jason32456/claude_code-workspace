import * as THREE from '../vendor/three.module.min.js';
import {
  ENEMY_R, MELEE_RANGE, ATTACK_CD, SEP_R, SEP_F,
  KNOCKBACK, HURT_DUR
} from './constants.js';
import { resolveCollisions } from './arena.js';

const POOL_SIZE = 25;

// --- Visual ---
function buildEnemyMesh() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xff2800, emissive: 0x660000, flatShading: true });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0x881100, flatShading: true });
  const legMat  = new THREE.MeshLambertMaterial({ color: 0xcc1400, flatShading: true });
  const eyeMat  = new THREE.MeshBasicMaterial({ color: 0xffee00 });

  // Body: flattened icosahedron
  const bodyGeo = new THREE.IcosahedronGeometry(0.44, 0);
  const bodyScaled = bodyGeo.clone();
  // flatten and squish to look monstrous
  const bodyMesh = new THREE.Mesh(bodyScaled, bodyMat);
  bodyMesh.scale.set(1, 0.72, 1);
  bodyMesh.position.y = 0.82;
  group.add(bodyMesh);

  // Head
  const headMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.30, 0), headMat);
  headMesh.position.y = 1.46;
  group.add(headMesh);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.065, 6, 4);
  for (const sx of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx, 1.53, 0.24);
    group.add(eye);
  }

  // Legs (4)
  const legGeo = new THREE.BoxGeometry(0.09, 0.65, 0.09);
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(legGeo, legMat);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    leg.position.set(Math.cos(a) * 0.28, 0.32, Math.sin(a) * 0.28);
    group.add(leg);
  }

  // Expose body mesh for raycasting
  group.bodyMesh = bodyMesh;
  // Store all sub-mats for hit flash
  group.subMats = [bodyMat, headMat, legMat];

  return group;
}

// --- Pool entry ---
class Enemy {
  constructor(scene) {
    this.mesh = buildEnemyMesh();
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.bodyMesh = this.mesh.bodyMesh;
    this.bodyMesh.userData.enemy = this;

    this.position = new THREE.Vector3();
    this.vx = 0; this.vz = 0;
    this.hp = 0; this.maxHp = 0;
    this.speed = 0; this.damage = 0;
    this.state = 'dead';
    this.attackCd = 0;
    this.hurtTimer = 0;
    this.deathTimer = 0;
    this.flashTimer = 0;
    this._origColors = this.mesh.subMats.map(m => m.color.clone());
  }

  activate(x, z, hp, speed, damage) {
    this.position.set(x, 0, z);
    this.vx = 0; this.vz = 0;
    this.hp = hp; this.maxHp = hp;
    this.speed = speed; this.damage = damage;
    this.state = 'chase';
    this.attackCd = 0; this.hurtTimer = 0; this.deathTimer = 0;
    this.mesh.visible = true;
    this.mesh.scale.set(1, 1, 1);
    this.mesh.subMats.forEach((m, i) => m.color.copy(this._origColors[i]));
  }

  deactivate() {
    this.state = 'dead';
    this.mesh.visible = false;
  }

  takeDamage(amount, dir) {
    if (this.state === 'dead') return;
    this.hp -= amount;
    // Knockback
    if (dir) {
      this.vx += dir.x * KNOCKBACK;
      this.vz += dir.z * KNOCKBACK;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.deathTimer = 0.4;
    } else {
      this.state = 'hurt';
      this.hurtTimer = HURT_DUR;
      this.flashTimer = HURT_DUR;
      this.mesh.subMats.forEach(m => m.color.set(0xffffff));
    }
  }

  update(dt, playerPos, aabbs) {
    if (this.state === 'dead') return false;

    // Flash recovery
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.mesh.subMats.forEach((m, i) => m.color.copy(this._origColors[i]));
      }
    }

    if (this.state === 'dying') {
      this.deathTimer -= dt;
      const t = Math.max(0, this.deathTimer / 0.4);
      this.mesh.scale.setScalar(t);
      if (this.deathTimer <= 0) { this.deactivate(); return true; /* = dead, award kill */ }
      this.mesh.position.copy(this.position);
      return false;
    }

    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const distToPlayer = Math.sqrt(dx * dx + dz * dz);

    if (this.state === 'hurt') {
      this.hurtTimer -= dt;
      if (this.hurtTimer <= 0) this.state = 'chase';
    }

    if (this.state === 'chase' || this.state === 'hurt') {
      // Steer toward player
      if (distToPlayer > 0.01) {
        const nx = dx / distToPlayer, nz = dz / distToPlayer;
        this.vx += nx * this.speed * 8 * dt;
        this.vz += nz * this.speed * 8 * dt;
        const spd = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
        if (spd > this.speed) {
          this.vx = (this.vx / spd) * this.speed;
          this.vz = (this.vz / spd) * this.speed;
        }
      }
    }

    if (this.state === 'attack') {
      if (distToPlayer > MELEE_RANGE + 0.3) this.state = 'chase';
    }

    if (this.state === 'chase' && distToPlayer <= MELEE_RANGE) {
      this.state = 'attack';
    }

    // Knockback damping
    this.vx *= Math.pow(0.92, dt * 60);
    this.vz *= Math.pow(0.92, dt * 60);

    this.position.x += this.vx * dt;
    this.position.z += this.vz * dt;
    resolveCollisions(this.position, ENEMY_R, aabbs);

    // Face the player
    if (distToPlayer > 0.1) {
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }

    this.mesh.position.set(this.position.x, 0, this.position.z);

    // Leg animation
    const legAnim = Math.sin(Date.now() * 0.008 + this.position.x) * 0.15;
    this.mesh.children.slice(4, 8).forEach((leg, i) => {
      leg.rotation.x = legAnim * (i % 2 === 0 ? 1 : -1);
    });

    return false;
  }

  get distToPlayerSq() { return 0; }
}

// --- Pool ---
export function createEnemyPool(scene) {
  const pool = Array.from({ length: POOL_SIZE }, () => new Enemy(scene));
  const active = [];

  function spawn(x, z, hp, speed, damage) {
    const e = pool.find(p => p.state === 'dead');
    if (!e) return null;
    e.activate(x, z, hp, speed, damage);
    active.push(e);
    return e;
  }

  function update(dt, playerPos, aabbs, onKill, onPlayerHit) {
    // Separation
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      if (a.state === 'dead') continue;
      for (let j = i + 1; j < active.length; j++) {
        const b = active[j];
        if (b.state === 'dead') continue;
        const sdx = a.position.x - b.position.x;
        const sdz = a.position.z - b.position.z;
        const sdist = Math.sqrt(sdx * sdx + sdz * sdz);
        if (sdist < SEP_R && sdist > 0.01) {
          const f = SEP_F * (1 - sdist / SEP_R) * dt;
          a.vx += (sdx / sdist) * f; a.vz += (sdz / sdist) * f;
          b.vx -= (sdx / sdist) * f; b.vz -= (sdz / sdist) * f;
        }
      }
    }

    // Update each, remove dead
    for (let i = active.length - 1; i >= 0; i--) {
      const e = active[i];
      if (e.state === 'dead') { active.splice(i, 1); continue; }
      const justDied = e.update(dt, playerPos, aabbs);
      if (justDied) { active.splice(i, 1); onKill(); continue; }

      // Contact damage to player
      if (e.state === 'attack') {
        e.attackCd -= dt;
        if (e.attackCd <= 0) {
          onPlayerHit(e.damage);
          e.attackCd = ATTACK_CD;
        }
      }
    }
  }

  function despawnAll() {
    for (const e of pool) { e.deactivate(); }
    active.length = 0;
  }

  return {
    get active() { return active; },
    get count()  { return active.filter(e => e.state !== 'dead').length; },
    spawn, update, despawnAll,
  };
}
