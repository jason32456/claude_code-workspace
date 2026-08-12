import * as THREE from 'three';

// ─── Constants ───────────────────────────────────────────────────────────────
const GRID = 12;          // grid half-size → cells go from -GRID to +GRID
const CELL = 1.0;
const BASE_INTERVAL = 220; // ms per step
const MIN_INTERVAL = 80;
const SPEED_UP_EVERY = 5;  // eat N food → speed up
const SPEED_STEP = 15;

// ─── Scene setup ─────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010105);
scene.fog = new THREE.FogExp2(0x010105, 0.018);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
camera.position.set(28, 22, 28);
camera.lookAt(0, 0, 0);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ─── Lighting ─────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x111122, 1.5));
const dirLight = new THREE.DirectionalLight(0x88ffaa, 2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// ─── Grid wireframe box ──────────────────────────────────────────────────────
const boxSize = (GRID * 2 + 1) * CELL;
const gridGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
const gridMat = new THREE.MeshBasicMaterial({ color: 0x1a2a1a, wireframe: true, transparent: true, opacity: 0.25 });
scene.add(new THREE.Mesh(gridGeo, gridMat));

// subtle floor plane
const floorGeo = new THREE.PlaneGeometry(200, 200, 40, 40);
const floorMat = new THREE.MeshBasicMaterial({ color: 0x050a05, wireframe: true, transparent: true, opacity: 0.08 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -(GRID + 0.5) * CELL;
scene.add(floor);

// ─── Materials ───────────────────────────────────────────────────────────────
const headMat = new THREE.MeshStandardMaterial({
  color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 1.8,
  roughness: 0.2, metalness: 0.3
});
const bodyMat = new THREE.MeshStandardMaterial({
  color: 0x00cc44, emissive: 0x007722, emissiveIntensity: 0.8,
  roughness: 0.4, metalness: 0.2
});
const foodMat = new THREE.MeshStandardMaterial({
  color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 2.5,
  roughness: 0.1, metalness: 0.8
});

const segGeo = new THREE.BoxGeometry(0.82, 0.82, 0.82);
const foodGeo = new THREE.IcosahedronGeometry(0.45, 1);

// ─── Particle system ─────────────────────────────────────────────────────────
const PARTICLE_COUNT = 60;
const pPositions = new Float32Array(PARTICLE_COUNT * 3);
const pAlpha = new Float32Array(PARTICLE_COUNT);
const particles = [];

const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
const pMat = new THREE.PointsMaterial({ color: 0xff88ff, size: 0.18, transparent: true, opacity: 1, sizeAttenuation: true });
const pointMesh = new THREE.Points(pGeo, pMat);
scene.add(pointMesh);

function spawnParticles(pos) {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI;
    const speed = 0.06 + Math.random() * 0.1;
    particles[i] = {
      x: pos.x, y: pos.y, z: pos.z,
      vx: Math.sin(b) * Math.cos(a) * speed,
      vy: Math.sin(b) * Math.sin(a) * speed,
      vz: Math.cos(b) * speed,
      life: 1.0,
      decay: 0.02 + Math.random() * 0.03
    };
  }
}

function updateParticles() {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = particles[i];
    if (!p || p.life <= 0) { pAlpha[i] = 0; continue; }
    p.x += p.vx; p.y += p.vy; p.z += p.vz;
    p.vy -= 0.002; // gravity
    p.life -= p.decay;
    pPositions[i * 3] = p.x;
    pPositions[i * 3 + 1] = p.y;
    pPositions[i * 3 + 2] = p.z;
    pAlpha[i] = p.life;
  }
  pGeo.attributes.position.needsUpdate = true;
  pMat.opacity = Math.max(...pAlpha, 0);
}

// ─── Game state ──────────────────────────────────────────────────────────────
let snakeMeshes = [];
let foodMesh = null;
let foodLight = null;
let snakePos = [];     // array of {x,y,z}
let dir = { x: 1, y: 0, z: 0 };
let nextDir = { x: 1, y: 0, z: 0 };
let score = 0;
let eaten = 0;
let interval = BASE_INTERVAL;
let running = false;
let lastStep = 0;
let cameraAngle = 0;

const scoreEl = document.getElementById('score');
const lengthEl = document.getElementById('length');
const overlay = document.getElementById('overlay');
const finalWrap = document.getElementById('final-score-wrap');
const finalScore = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');

// ─── Input ────────────────────────────────────────────────────────────────────
const DIRS = {
  KeyW:       { x:  0, y: 0, z: -1 },
  KeyS:       { x:  0, y: 0, z:  1 },
  KeyA:       { x: -1, y: 0, z:  0 },
  KeyD:       { x:  1, y: 0, z:  0 },
  KeyQ:       { x:  0, y: 1, z:  0 },
  KeyE:       { x:  0, y:-1, z:  0 },
  ArrowUp:    { x:  0, y: 0, z: -1 },
  ArrowDown:  { x:  0, y: 0, z:  1 },
  ArrowLeft:  { x: -1, y: 0, z:  0 },
  ArrowRight: { x:  1, y: 0, z:  0 },
};

window.addEventListener('keydown', e => {
  if (!running) return;
  const d = DIRS[e.code];
  if (!d) return;
  // prevent 180° reversals
  if (d.x === -dir.x && d.y === -dir.y && d.z === -dir.z) return;
  nextDir = d;
  e.preventDefault();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toWorld(g) {
  return new THREE.Vector3(g.x * CELL, g.y * CELL, g.z * CELL);
}

function inBounds(p) {
  return Math.abs(p.x) <= GRID && Math.abs(p.y) <= GRID && Math.abs(p.z) <= GRID;
}

function eqPos(a, b) { return a.x === b.x && a.y === b.y && a.z === b.z; }

function randomFoodPos() {
  while (true) {
    const p = {
      x: Math.floor(Math.random() * (GRID * 2 + 1)) - GRID,
      y: Math.floor(Math.random() * (GRID * 2 + 1)) - GRID,
      z: Math.floor(Math.random() * (GRID * 2 + 1)) - GRID,
    };
    if (!snakePos.some(s => eqPos(s, p))) return p;
  }
}

// ─── Init game ───────────────────────────────────────────────────────────────
function initGame() {
  // clear old meshes
  snakeMeshes.forEach(m => scene.remove(m));
  snakeMeshes = [];
  if (foodMesh) { scene.remove(foodMesh); foodMesh = null; }
  if (foodLight) { scene.remove(foodLight); foodLight = null; }

  snakePos = [{ x: 0, y: 0, z: 0 }];
  dir = { x: 1, y: 0, z: 0 };
  nextDir = { x: 1, y: 0, z: 0 };
  score = 0;
  eaten = 0;
  interval = BASE_INTERVAL;
  scoreEl.textContent = '0';
  lengthEl.textContent = '1';

  // head mesh
  const head = new THREE.Mesh(segGeo, headMat.clone());
  head.position.copy(toWorld(snakePos[0]));
  scene.add(head);
  snakeMeshes.push(head);

  spawnFood();
}

function spawnFood() {
  if (foodMesh) { scene.remove(foodMesh); scene.remove(foodLight); }
  const fp = randomFoodPos();
  foodMesh = new THREE.Mesh(foodGeo, foodMat);
  foodMesh.position.copy(toWorld(fp));
  foodMesh.userData.gridPos = fp;
  scene.add(foodMesh);

  foodLight = new THREE.PointLight(0xff00ff, 3, 6);
  foodLight.position.copy(foodMesh.position);
  scene.add(foodLight);
}

// ─── Game step ───────────────────────────────────────────────────────────────
function step() {
  dir = nextDir;
  const head = snakePos[0];
  const newHead = { x: head.x + dir.x, y: head.y + dir.y, z: head.z + dir.z };

  // wall collision
  if (!inBounds(newHead)) { endGame(); return; }

  // self collision (skip the tail tip since it moves)
  for (let i = 0; i < snakePos.length - 1; i++) {
    if (eqPos(snakePos[i], newHead)) { endGame(); return; }
  }

  const ateFood = eqPos(newHead, foodMesh.userData.gridPos);

  // move snake positions
  snakePos.unshift(newHead);
  if (!ateFood) snakePos.pop();

  // update meshes
  // add new head mesh
  const newHeadMesh = new THREE.Mesh(segGeo, headMat.clone());
  newHeadMesh.position.copy(toWorld(newHead));
  scene.add(newHeadMesh);
  snakeMeshes.unshift(newHeadMesh);

  // demote old head to body
  if (snakeMeshes.length > 1) {
    snakeMeshes[1].material = bodyMat;
  }

  if (!ateFood) {
    const tail = snakeMeshes.pop();
    scene.remove(tail);
  } else {
    score += 10;
    eaten++;
    scoreEl.textContent = score;
    lengthEl.textContent = snakePos.length;

    spawnParticles(toWorld(foodMesh.userData.gridPos));
    spawnFood();

    // speed up
    if (eaten % SPEED_UP_EVERY === 0) {
      interval = Math.max(MIN_INTERVAL, interval - SPEED_STEP);
    }
  }
}

function endGame() {
  running = false;
  finalScore.textContent = score;
  finalWrap.style.display = 'block';
  startBtn.textContent = 'PLAY AGAIN';
  overlay.classList.remove('hidden');

  // flash snake red
  snakeMeshes.forEach(m => {
    m.material = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 2 });
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  overlay.classList.add('hidden');
  initGame();
  running = true;
  lastStep = performance.now();
});

// ─── Render loop ─────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // slow camera orbit
  cameraAngle += dt * 0.12;
  const r = 42;
  camera.position.x = Math.sin(cameraAngle) * r;
  camera.position.z = Math.cos(cameraAngle) * r;
  camera.position.y = 22 + Math.sin(cameraAngle * 0.4) * 5;
  camera.lookAt(0, 0, 0);

  // food bob + spin
  if (foodMesh) {
    foodMesh.rotation.y += dt * 2;
    foodMesh.rotation.x += dt * 1.1;
    foodMesh.position.y = foodMesh.userData.gridPos.y * CELL + Math.sin(now * 0.003) * 0.15;
    if (foodLight) foodLight.position.copy(foodMesh.position);
    foodLight.intensity = 2.5 + Math.sin(now * 0.005) * 1;
  }

  // snake head glow pulse
  if (snakeMeshes.length > 0) {
    snakeMeshes[0].material.emissiveIntensity = 1.5 + Math.sin(now * 0.006) * 0.5;
  }

  updateParticles();

  // step timer
  if (running && now - lastStep >= interval) {
    step();
    lastStep = now;
  }

  renderer.render(scene, camera);
}

animate(0);
