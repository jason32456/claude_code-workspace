import * as THREE from '../vendor/three.module.js';

const CELL = 1;
const HOP_DURATION = 0.13;
const ARC_HEIGHT = 0.55;
const MAX_COL = 5;
const LANDING_SQUASH_TIME = 0.09;

// Shared geometries (created once)
const gBody = new THREE.BoxGeometry(0.72, 0.88, 0.72);
const gHead = new THREE.BoxGeometry(0.58, 0.50, 0.58);
const gEye  = new THREE.BoxGeometry(0.14, 0.14, 0.12);
const gBeak = new THREE.BoxGeometry(0.22, 0.16, 0.14);
const gWing = new THREE.BoxGeometry(0.14, 0.36, 0.55);

// Shared materials
const mBody = new THREE.MeshLambertMaterial({ color: 0xFFB300, flatShading: true });
const mHead = new THREE.MeshLambertMaterial({ color: 0xFFD54F, flatShading: true });
const mEye  = new THREE.MeshLambertMaterial({ color: 0x1A1A1A, flatShading: true });
const mBeak = new THREE.MeshLambertMaterial({ color: 0xFFA000, flatShading: true });
const mWing = new THREE.MeshLambertMaterial({ color: 0xFFA000, flatShading: true });

function buildPlayerMesh() {
  const g = new THREE.Group();

  const body = new THREE.Mesh(gBody, mBody);
  body.position.y = 0.44;
  g.add(body);

  const head = new THREE.Mesh(gHead, mHead);
  head.position.set(0, 1.13, 0);
  g.add(head);

  const eyeL = new THREE.Mesh(gEye, mEye);
  eyeL.position.set(-0.17, 1.17, 0.28);
  g.add(eyeL);

  const eyeR = new THREE.Mesh(gEye, mEye);
  eyeR.position.set(0.17, 1.17, 0.28);
  g.add(eyeR);

  const beak = new THREE.Mesh(gBeak, mBeak);
  beak.position.set(0, 1.06, 0.33);
  g.add(beak);

  const wingL = new THREE.Mesh(gWing, mWing);
  wingL.position.set(-0.43, 0.50, 0);
  g.add(wingL);

  const wingR = new THREE.Mesh(gWing, mWing);
  wingR.position.set(0.43, 0.50, 0);
  g.add(wingR);

  return g;
}

function lerp(a, b, t) { return a + (b - a) * t; }

export function createPlayer(scene) {
  const mesh = buildPlayerMesh();
  scene.add(mesh);

  // Grid state
  let row = 0, col = 0, maxRow = 0;

  // Hop animation
  let hopping = false;
  let hopT = 0;
  let fromRow = 0, fromCol = 0, toRow = 0, toCol = 0;
  let queued = null; // {dr, dc}
  let landingTimer = 0;

  // Direction key map: forward = +row, backward = -row, left = -col, right = +col
  const KEY_DIR = {
    ArrowUp: [1, 0],    w: [1, 0],    W: [1, 0],
    ArrowDown: [-1, 0], s: [-1, 0],  S: [-1, 0],
    ArrowLeft: [0, -1], a: [0, -1],  A: [0, -1],
    ArrowRight: [0, 1], d: [0, 1],   D: [0, 1],
  };

  function startHop(dr, dc, laneManager) {
    const nr = row + dr;
    const nc = col + dc;
    if (nc < -MAX_COL || nc > MAX_COL) return false;
    if (nr < 0) return false;
    if (laneManager && laneManager.isCellBlocked(nr, nc)) return false;
    fromRow = row; fromCol = col;
    toRow = nr;    toCol = nc;
    hopping = true; hopT = 0;
    return true;
  }

  function handleKey(key, laneManager) {
    const dir = KEY_DIR[key];
    if (!dir) return;
    const [dr, dc] = dir;
    if (!hopping) {
      startHop(dr, dc, laneManager);
    } else if (!queued) {
      queued = { dr, dc };
    }
  }

  function syncPosition() {
    mesh.position.set(col * CELL, 0, -row * CELL);
  }

  function update(dt, laneManager) {
    // Landing squash spring-back
    if (landingTimer > 0) {
      landingTimer -= dt;
      const p = Math.max(0, landingTimer / LANDING_SQUASH_TIME);
      const sq = 1 + p * 0.30;
      mesh.scale.set(sq, 1 / (sq * sq), sq);
    }

    if (!hopping) {
      if (landingTimer <= 0) mesh.scale.set(1, 1, 1);
      return;
    }

    hopT += dt / HOP_DURATION;
    if (hopT >= 1) {
      hopT = 1;
      hopping = false;
      row = toRow; col = toCol;
      if (row > maxRow) maxRow = row;
      landingTimer = LANDING_SQUASH_TIME;
      // Snap to grid
      mesh.position.set(col * CELL, 0, -row * CELL);
      mesh.scale.set(1, 1, 1);
      if (queued) {
        const { dr, dc } = queued;
        queued = null;
        startHop(dr, dc, laneManager);
      }
      return;
    }

    const t = hopT;
    const arcY = Math.sin(t * Math.PI) * ARC_HEIGHT;
    const stretch = 1 + Math.sin(t * Math.PI) * 0.22;
    const squeeze = 1 - Math.sin(t * Math.PI) * 0.10;

    mesh.scale.set(squeeze, stretch, squeeze);
    mesh.position.set(
      lerp(fromCol, toCol, t) * CELL,
      arcY,
      -lerp(fromRow, toRow, t) * CELL
    );
  }

  function reset() {
    row = 0; col = 0; maxRow = 0;
    hopping = false; hopT = 0;
    queued = null; landingTimer = 0;
    mesh.position.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.visible = true;
  }

  return {
    mesh,
    get row()    { return row; },
    get col()    { return col; },
    get maxRow() { return maxRow; },
    get isHopping() { return hopping; },
    handleKey,
    update,
    reset,
    syncPosition,
  };
}
