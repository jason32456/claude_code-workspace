import * as THREE from '../vendor/three.module.min.js';
import { ARENA_HALF, WALL_H, WALL_T } from './constants.js';

const H = ARENA_HALF;

export function buildArena(scene) {
  const aabbs = [];          // cover-block AABBs for collision
  const raycastMeshes = [];  // meshes to test for bullet wall impacts

  // Floor
  const floorGeo = new THREE.PlaneGeometry(H * 2, H * 2, 20, 20);
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  raycastMeshes.push(floor);

  // Subtle grid overlay
  const grid = new THREE.GridHelper(H * 2, 40, 0x2a2a2a, 0x2a2a2a);
  scene.add(grid);

  // Boundary walls
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x0d1b2a, flatShading: true });
  const wallDefs = [
    { pos: [0,        WALL_H / 2, -H], size: [H * 2 + WALL_T * 2, WALL_H, WALL_T] },
    { pos: [0,        WALL_H / 2,  H], size: [H * 2 + WALL_T * 2, WALL_H, WALL_T] },
    { pos: [-H,       WALL_H / 2,  0], size: [WALL_T, WALL_H, H * 2] },
    { pos: [ H,       WALL_H / 2,  0], size: [WALL_T, WALL_H, H * 2] },
  ];
  for (const w of wallDefs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
    m.position.set(...w.pos);
    scene.add(m);
    raycastMeshes.push(m);
  }

  // Cover blocks — convex pillars so enemies don't get trapped
  const coverMat = new THREE.MeshLambertMaterial({ color: 0x162032, flatShading: true });
  const coverDefs = [
    // Four diagonal pillars
    { pos: [ 7, 1,  7], size: [2.4, 2, 2.4] },
    { pos: [-7, 1,  7], size: [2.4, 2, 2.4] },
    { pos: [ 7, 1, -7], size: [2.4, 2, 2.4] },
    { pos: [-7, 1, -7], size: [2.4, 2, 2.4] },
    // Two long side barriers
    { pos: [12, 1,  0], size: [2, 2, 6] },
    { pos: [-12, 1, 0], size: [2, 2, 6] },
  ];
  for (const c of coverDefs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...c.size), coverMat);
    m.position.set(...c.pos);
    scene.add(m);
    raycastMeshes.push(m);

    const [cx, , cz] = c.pos;
    const [sw, , sd] = c.size;
    aabbs.push({ minX: cx - sw / 2, maxX: cx + sw / 2, minZ: cz - sd / 2, maxZ: cz + sd / 2 });
  }

  // Ceiling trim on walls for visual framing
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x1a3050 });
  const trimH = 0.15;
  const trimDefs = [
    { pos: [0, WALL_H, -H], size: [H * 2, trimH, WALL_T + 0.1] },
    { pos: [0, WALL_H,  H], size: [H * 2, trimH, WALL_T + 0.1] },
    { pos: [-H, WALL_H, 0], size: [WALL_T + 0.1, trimH, H * 2] },
    { pos: [ H, WALL_H, 0], size: [WALL_T + 0.1, trimH, H * 2] },
  ];
  for (const t of trimDefs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...t.size), trimMat);
    m.position.set(...t.pos);
    scene.add(m);
  }

  return { aabbs, raycastMeshes };
}

// Resolve a circular entity (pos.x, pos.z) of given radius out of all AABBs and arena walls.
export function resolveCollisions(pos, radius, aabbs) {
  // Arena boundary clamp
  const bound = ARENA_HALF - WALL_T / 2 - radius;
  pos.x = Math.max(-bound, Math.min(bound, pos.x));
  pos.z = Math.max(-bound, Math.min(bound, pos.z));

  // Cover block push-out (circle vs AABB)
  for (const aabb of aabbs) {
    const cx = Math.max(aabb.minX, Math.min(aabb.maxX, pos.x));
    const cz = Math.max(aabb.minZ, Math.min(aabb.maxZ, pos.z));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius && distSq > 0) {
      const dist = Math.sqrt(distSq);
      const pen = radius - dist;
      pos.x += (dx / dist) * pen;
      pos.z += (dz / dist) * pen;
    } else if (distSq === 0) {
      // Dead center inside block — push out along nearest axis
      const ox = radius - Math.min(pos.x - aabb.minX, aabb.maxX - pos.x);
      const oz = radius - Math.min(pos.z - aabb.minZ, aabb.maxZ - pos.z);
      if (ox < oz) pos.x += pos.x < (aabb.minX + aabb.maxX) / 2 ? -ox : ox;
      else         pos.z += pos.z < (aabb.minZ + aabb.maxZ) / 2 ? -oz : oz;
    }
  }
}
