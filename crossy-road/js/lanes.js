import * as THREE from '../vendor/three.module.js';

const CELL = 1;
const LANE_VIS_WIDTH = 16;    // visual width of each lane's ground plane
const HALF_COLS = 5;           // playable columns: -5 to +5
const VEHICLE_WRAP = 9;        // vehicles wrap at ±VEHICLE_WRAP in X

// ─── Shared geometries ───────────────────────────────────────────────────────
const gGround    = new THREE.BoxGeometry(LANE_VIS_WIDTH, 0.14, 1.0);
const gBorder    = new THREE.BoxGeometry(LANE_VIS_WIDTH, 0.08, 0.12);
const gTrunk     = new THREE.BoxGeometry(0.28, 0.52, 0.28);
const gLeaves    = new THREE.BoxGeometry(0.78, 0.86, 0.78);
const gLeaves2   = new THREE.BoxGeometry(0.54, 0.64, 0.54);
const gRock      = new THREE.BoxGeometry(0.62, 0.44, 0.58);
const gCar       = new THREE.BoxGeometry(1.90, 0.66, 0.86);
const gCarRoof   = new THREE.BoxGeometry(1.20, 0.44, 0.78);
const gCarWheel  = new THREE.BoxGeometry(0.24, 0.22, 0.22);
const gTruck     = new THREE.BoxGeometry(3.00, 0.76, 0.90);
const gTruckCab  = new THREE.BoxGeometry(0.88, 0.52, 0.84);

// ─── Shared materials ────────────────────────────────────────────────────────
const mGrass     = new THREE.MeshLambertMaterial({ color: 0x7CB342, flatShading: true });
const mGrassDark = new THREE.MeshLambertMaterial({ color: 0x558B2F, flatShading: true });
const mRoad      = new THREE.MeshLambertMaterial({ color: 0x546E7A, flatShading: true });
const mRoadLine  = new THREE.MeshLambertMaterial({ color: 0xFFD600, flatShading: true });
const mSidewalk  = new THREE.MeshLambertMaterial({ color: 0x90A4AE, flatShading: true });
const mTrunk     = new THREE.MeshLambertMaterial({ color: 0x6D4C41, flatShading: true });
const mLeaves    = new THREE.MeshLambertMaterial({ color: 0x2E7D32, flatShading: true });
const mLeaves2   = new THREE.MeshLambertMaterial({ color: 0x388E3C, flatShading: true });
const mRock      = new THREE.MeshLambertMaterial({ color: 0x90A4AE, flatShading: true });
const mWheel     = new THREE.MeshLambertMaterial({ color: 0x212121, flatShading: true });

const CAR_COLORS = [0xF44336, 0x1565C0, 0xF9A825, 0x00BCD4, 0x7B1FA2, 0xFF5722];
const TRUCK_COLORS = [0x78909C, 0x5D4037, 0x37474F, 0x4E342E];

// ─── Utility helpers ─────────────────────────────────────────────────────────
function rand(a, b) { return Math.random() * (b - a) + a; }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

// ─── Mesh factories ──────────────────────────────────────────────────────────
function makeTree(scene) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(gTrunk, mTrunk);
  trunk.position.y = 0.26;
  g.add(trunk);
  const leaves = new THREE.Mesh(gLeaves, mLeaves);
  leaves.position.y = 0.9;
  g.add(leaves);
  const topLeaves = new THREE.Mesh(gLeaves2, mLeaves2);
  topLeaves.position.y = 1.48;
  g.add(topLeaves);
  scene.add(g);
  return g;
}

function makeRock(scene) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(gRock, mRock);
  rock.position.y = 0.22;
  rock.rotation.y = rand(0, Math.PI);
  g.add(rock);
  scene.add(g);
  return g;
}

function makeCar(scene, color) {
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const roofMat = new THREE.MeshLambertMaterial({ color: darken(color, 0.8), flatShading: true });
  const g = new THREE.Group();
  const body = new THREE.Mesh(gCar, mat);
  body.position.y = 0.33;
  g.add(body);
  const roof = new THREE.Mesh(gCarRoof, roofMat);
  roof.position.y = 0.77;
  g.add(roof);
  // Wheels (decorative only)
  for (const [wx, wz] of [[-0.72, 0.44], [0.72, 0.44], [-0.72, -0.44], [0.72, -0.44]]) {
    const w = new THREE.Mesh(gCarWheel, mWheel);
    w.position.set(wx, 0.11, wz);
    g.add(w);
  }
  scene.add(g);
  return g;
}

function makeTruck(scene, color) {
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const cabMat = new THREE.MeshLambertMaterial({ color: darken(color, 0.85), flatShading: true });
  const g = new THREE.Group();
  const body = new THREE.Mesh(gTruck, mat);
  body.position.y = 0.38;
  g.add(body);
  const cab = new THREE.Mesh(gTruckCab, cabMat);
  cab.position.set(1.06, 0.76, 0);
  g.add(cab);
  scene.add(g);
  return g;
}

function makeGround(scene) {
  const mesh = new THREE.Mesh(gGround, mGrass);
  mesh.position.y = -0.07;
  scene.add(mesh);
  return mesh;
}

function darken(color, factor) {
  const c = new THREE.Color(color);
  c.multiplyScalar(factor);
  return c.getHex();
}

// ─── Lane difficulty helpers ──────────────────────────────────────────────────
function getLaneType(row, rng) {
  if (row <= 3) return 'grass';
  const roadChance = Math.min(0.65, 0.15 + row * 0.02);
  return rng() < roadChance ? 'road' : 'grass';
}

function getVehicleSpeed(row) {
  const base = 2.5 + Math.min(row * 0.08, 5.0);
  return rand(base * 0.8, base * 1.2);
}

function getVehicleCount(row) {
  return randInt(2, Math.min(4, 2 + Math.floor(row / 8)));
}

// ─── Lane manager ─────────────────────────────────────────────────────────────
export function createLaneManager(scene) {
  const activeLanes = new Map(); // row -> laneData
  // Pools (recycled lane components)
  const groundPool = [];
  const treePool   = [];
  const rockPool   = [];
  const carPool    = [];
  const truckPool  = [];

  function getFromPool(pool, factory) {
    const obj = pool.pop();
    if (obj) { obj.visible = true; return obj; }
    return factory(scene);
  }

  function returnToPool(pool, obj) {
    obj.visible = false;
    pool.push(obj);
  }

  // ── Setup a lane for a given row ───────────────────────────────────────────
  function setupLane(row) {
    if (activeLanes.has(row)) return;

    const type = getLaneType(row, Math.random.bind(Math));
    const worldZ = -row * CELL;

    const ground = getFromPool(groundPool, makeGround);
    ground.material = type === 'road' ? mRoad : (row % 2 === 0 ? mGrass : mGrassDark);
    ground.position.set(0, -0.07, worldZ);
    ground.visible = true;

    const lane = { type, row, worldZ, ground, decorations: [], vehicles: [] };

    if (type === 'grass') {
      setupGrassLane(lane);
    } else {
      setupRoadLane(lane, row);
    }

    activeLanes.set(row, lane);
  }

  function setupGrassLane(lane) {
    if (lane.row <= 1) return; // first rows always clear

    // Obstacle placement: pick random non-blocking cols
    const cols = shuffleCols();
    const count = randInt(0, Math.min(3, Math.floor(lane.row / 4) + 1));
    const used = new Set();

    // Ensure we don't block all side exits - keep at least 5 cols free
    let placed = 0;
    for (let i = 0; i < cols.length && placed < count; i++) {
      const c = cols[i];
      // Don't block col 0 (center) on very early rows
      if (lane.row < 6 && c === 0) continue;
      if (used.size >= HALF_COLS * 2) break;
      used.add(c);
      placed++;
    }

    lane.occupiedCols = used;

    for (const col of used) {
      const isRock = Math.random() < 0.25;
      const obj = isRock
        ? getFromPool(rockPool, makeRock)
        : getFromPool(treePool, makeTree);
      obj.position.set(col * CELL, 0, lane.worldZ);
      obj.visible = true;
      lane.decorations.push({ obj, isRock });
    }
  }

  function setupRoadLane(lane, row) {
    lane.occupiedCols = new Set();
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = getVehicleSpeed(row);
    const count = getVehicleCount(row);

    for (let i = 0; i < count; i++) {
      const isLong = Math.random() < 0.25 && row > 8;
      const color = isLong ? pick(TRUCK_COLORS) : pick(CAR_COLORS);
      const mesh = isLong
        ? getFromPool(truckPool, (s) => makeTruck(s, color))
        : getFromPool(carPool, (s) => makeCar(s, color));

      // Randomize color for reused pooled meshes
      tintMesh(mesh, color);

      // Spread vehicles across lane
      const startX = rand(-VEHICLE_WRAP, VEHICLE_WRAP);
      mesh.position.set(startX, 0, lane.worldZ);
      mesh.visible = true;

      // Mirror direction with rotation
      mesh.rotation.y = dir > 0 ? 0 : Math.PI;

      const halfW = isLong ? 1.55 : 0.98;
      lane.vehicles.push({ mesh, x: startX, halfW, halfD: 0.44, vx: dir * speed });
    }
  }

  function tintMesh(group, color) {
    group.children[0].material.color.setHex(color);
    group.children[0].material.needsUpdate = true;
    const c1 = group.children[1];
    if (c1 && c1.isMesh) {
      c1.material.color.setHex(darken(color, 0.82));
      c1.material.needsUpdate = true;
    }
  }

  // ── Recycle a lane back into the pools ─────────────────────────────────────
  function recycleLane(row) {
    const lane = activeLanes.get(row);
    if (!lane) return;

    returnToPool(groundPool, lane.ground);

    for (const { obj, isRock } of lane.decorations) {
      returnToPool(isRock ? rockPool : treePool, obj);
    }

    for (const v of lane.vehicles) {
      const isLong = v.halfW > 1.3;
      returnToPool(isLong ? truckPool : carPool, v.mesh);
    }

    activeLanes.delete(row);
  }

  // ── Per-frame vehicle movement ─────────────────────────────────────────────
  function update(dt) {
    for (const lane of activeLanes.values()) {
      if (lane.type !== 'road') continue;
      for (const v of lane.vehicles) {
        v.x += v.vx * dt;
        // Wrap at edges
        if (v.x > VEHICLE_WRAP + 2) v.x = -VEHICLE_WRAP - 2;
        if (v.x < -VEHICLE_WRAP - 2) v.x = VEHICLE_WRAP + 2;
        v.mesh.position.x = v.x;
      }
    }
  }

  // ── Ensure rows are spawned ────────────────────────────────────────────────
  function ensureRow(row) {
    if (row < 0) return;
    setupLane(row);
  }

  function recycleBehind(minRow) {
    for (const row of activeLanes.keys()) {
      if (row < minRow) recycleLane(row);
    }
  }

  // ── Collision queries ──────────────────────────────────────────────────────
  function isCellBlocked(row, col) {
    const lane = activeLanes.get(row);
    if (!lane) return false;
    return lane.occupiedCols && lane.occupiedCols.has(col);
  }

  function getLane(row) {
    return activeLanes.get(row) || null;
  }

  function reset() {
    for (const row of activeLanes.keys()) recycleLane(row);
  }

  return { ensureRow, recycleBehind, update, isCellBlocked, getLane, reset };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shuffleCols() {
  const cols = [];
  for (let c = -HALF_COLS; c <= HALF_COLS; c++) cols.push(c);
  for (let i = cols.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  return cols;
}
