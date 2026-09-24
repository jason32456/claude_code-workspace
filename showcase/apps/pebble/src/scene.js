import * as THREE from '../vendor/three.module.js';
import {
  NEAR_TEE, FAR_TEE, NEAR_HOG, FAR_HOG, BACK_LINE, NEAR_BACK, SHEET_START, SHEET_END,
  HALF_W, HOUSE_R, RING8, RING4, BUTTON, STONE_R, RELEASE_Y, HACK_Y, FAR_HACK,
} from './constants.js';

export const TEAM_COLOR = { red: 0xd62b2b, yellow: 0xf2c418 };
export const JACKET = { red: 0xb3202a, yellow: 0xe0a800 };

// world (x across, y down the sheet, h up) -> three
export function V(x, y, h = 0) {
  return new THREE.Vector3(x, h, -y);
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function iceTexture() {
  const r = rand(7);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#eef3f7';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const x = r() * w;
      const y = r() * h;
      const a = r();
      g.fillStyle = a > 0.5 ? `rgba(255,255,255,${0.25 + r() * 0.4})` : `rgba(150,170,190,${0.05 + r() * 0.1})`;
      g.beginPath();
      g.arc(x, y, 0.6 + r() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(160,180,200,${0.04 + r() * 0.05})`;
      g.lineWidth = 0.5 + r();
      g.beginPath();
      const x = r() * w;
      g.moveTo(x, 0);
      g.lineTo(x + (r() - 0.5) * 60, h);
      g.stroke();
    }
  }, [2, 18]);
}

function graniteTexture() {
  const r = rand(31);
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#6d6f73';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) {
      const c = r();
      g.fillStyle = c < 0.45 ? `rgba(30,30,34,${0.3 + r() * 0.5})` : c < 0.8 ? `rgba(170,170,176,${0.3 + r() * 0.4})` : `rgba(120,95,90,${0.3 + r() * 0.4})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    // polished striking band
    const grd = g.createLinearGradient(0, h * 0.42, 0, h * 0.62);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, h * 0.42, w, h * 0.2);
  });
}

function addHouse(group, y, x0 = 0) {
  const rings = [
    [HOUSE_R, 0x1d5fbf],
    [RING8, 0xf4f7fa],
    [RING4, 0xc8262e],
    [BUTTON, 0xf4f7fa],
  ];
  rings.forEach(([r, c], i) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 96),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, transparent: true, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -1 - i, polygonOffsetUnits: -1 - i }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(V(x0, y, 0.001 + i * 0.0004));
    m.receiveShadow = true;
    group.add(m);
  });
}

function addLine(group, x0, y, width, depth, color, h = 0.004) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.copy(V(x0, y, h));
  m.receiveShadow = true;
  group.add(m);
}

function buildSheet(x0, iceMat) {
  const g = new THREE.Group();
  const len = SHEET_END - SHEET_START;
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, len), iceMat);
  ice.rotation.x = -Math.PI / 2;
  ice.position.copy(V(x0, (SHEET_START + SHEET_END) / 2, 0));
  ice.receiveShadow = true;
  g.add(ice);
  addHouse(g, FAR_TEE, x0);
  addHouse(g, NEAR_TEE, x0);
  for (const y of [NEAR_HOG, FAR_HOG]) addLine(g, x0, y, HALF_W * 2, 0.1, 0xc8262e);
  for (const y of [NEAR_TEE, FAR_TEE]) addLine(g, x0, y, HALF_W * 2, 0.013, 0x1b1f28);
  for (const y of [NEAR_BACK, BACK_LINE]) addLine(g, x0, y, HALF_W * 2, 0.013, 0x1b1f28);
  addLine(g, x0, (NEAR_TEE - 1.829 - 1.8 + FAR_TEE + 1.829 + 1.8) / 2, 0.013, FAR_TEE - NEAR_TEE + 2 * (1.829 + 1.8), 0x1b1f28);
  for (const y of [HACK_Y, FAR_HACK]) {
    for (const s of [-1, 1]) {
      const hack = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.8 }));
      hack.position.copy(V(x0 + s * 0.0762 + s * 0.075, y, 0.01));
      g.add(hack);
    }
  }
  // side boards
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: 0.6 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x1b2a44, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, len), boardMat);
    b.position.copy(V(x0 + s * (HALF_W + 0.03), (SHEET_START + SHEET_END) / 2, 0.06));
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, len), capMat);
    c.position.copy(V(x0 + s * (HALF_W + 0.03), (SHEET_START + SHEET_END) / 2, 0.125));
    g.add(c);
  }
  return g;
}

function buildArena(scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 140), new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.01, -(SHEET_START + SHEET_END) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // stands: stepped tiers with an instanced crowd
  const tierMat = new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.95 });
  const crowd = [];
  const r = rand(99);
  for (const side of [-1, 1]) {
    for (let t = 0; t < 7; t++) {
      const x = side * (17 + t * 1.1);
      const tier = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5 + t * 0.55, 60), tierMat);
      tier.position.set(x, (0.5 + t * 0.55) / 2, -(SHEET_START + SHEET_END) / 2);
      scene.add(tier);
      for (let k = 0; k < 90; k++) {
        if (r() < 0.25) continue;
        crowd.push([x, 0.5 + t * 0.55, -(SHEET_START + SHEET_END) / 2 - 29 + k * 0.65 + r() * 0.2]);
      }
    }
  }
  for (let t = 0; t < 7; t++) {
    const z = -(SHEET_END + 4 + t * 1.1);
    const tier = new THREE.Mesh(new THREE.BoxGeometry(34, 0.5 + t * 0.55, 1.1), tierMat);
    tier.position.set(0, (0.5 + t * 0.55) / 2, z);
    scene.add(tier);
    for (let k = 0; k < 50; k++) {
      if (r() < 0.3) continue;
      crowd.push([-16 + k * 0.65 + r() * 0.2, 0.5 + t * 0.55, z]);
    }
  }
  const body = new THREE.CapsuleGeometry(0.2, 0.35, 2, 6);
  const im = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowd.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const palette = [0x8a2330, 0x2b4a86, 0xc9a227, 0x3b3f4a, 0xdddddd, 0x5a2d6b, 0x2f6b4a, 0xa05a2c];
  crowd.forEach(([x, y, z], i) => {
    m.makeTranslation(x, y + 0.38, z);
    im.setMatrixAt(i, m);
    im.setColorAt(i, col.setHex(palette[Math.floor(r() * palette.length)]).multiplyScalar(0.18 + r() * 0.2));
  });
  scene.add(im);

  // ceiling light bars
  const barMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  for (let i = 0; i < 9; i++) {
    for (const x of [-7.5, -2.5, 2.5, 7.5]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 3.2), barMat);
      bar.position.set(x, 11, -(SHEET_START + 2 + i * 5.2));
      scene.add(bar);
    }
  }
  // end wall banner
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 2.4),
    new THREE.MeshBasicMaterial({
      map: canvasTex(1024, 112, (g, w, h) => {
        g.fillStyle = '#0f2447';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#e8eef7';
        g.font = '700 64px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('P E B B L E   ·   C U R L I N G   C E N T R E', w / 2, h / 2 + 4);
      }),
    }),
  );
  banner.position.set(0, 7.2, -(SHEET_END + 12.5));
  scene.add(banner);
}

export function buildStoneMesh(team, granite) {
  const g = new THREE.Group();
  const pts = [
    [0, 0.0], [0.058, 0.0], [0.064, 0.004], [0.07, 0.006], [0.1, 0.012], [0.128, 0.028], [0.142, 0.047],
    [0.145, 0.057], [0.142, 0.068], [0.13, 0.088], [0.105, 0.105], [0.075, 0.112], [0, 0.114],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), new THREE.MeshStandardMaterial({ map: granite, roughness: 0.32, metalness: 0.05 }));
  body.castShadow = true;
  g.add(body);
  const capMat = new THREE.MeshStandardMaterial({ color: TEAM_COLOR[team], roughness: 0.35 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.076, 0.012, 40), capMat);
  cap.position.y = 0.118;
  g.add(cap);
  const handle = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.1, 4, 10), capMat);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0.02, 0.165, 0);
  handle.add(grip);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.05, 12), capMat);
  post.position.set(-0.045, 0.14, 0);
  handle.add(post);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 }));
  bolt.position.set(-0.045, 0.126, 0);
  handle.add(bolt);
  handle.traverse((o) => (o.castShadow = true));
  g.add(handle);
  // glow ring shown when a stone counts
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(STONE_R + 0.02, STONE_R + 0.06, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.006;
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

export function buildSweeper(team) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: JACKET[team], roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a988, roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 3, 8), dark);
  legs.position.y = 0.42;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 3, 10), jacket);
  torso.position.y = 1.08;
  torso.rotation.x = -0.35;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), skin);
  head.position.set(0, 1.5, -0.14);
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), jacket);
  cap.position.copy(head.position);
  g.add(cap);
  const broom = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.25, 8), new THREE.MeshStandardMaterial({ color: 0x2d2f36, roughness: 0.4, metalness: 0.4 }));
  stick.position.y = 0.62;
  broom.add(stick);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a2e3a, roughness: 0.9 }));
  pad.position.y = 0.02;
  broom.add(pad);
  broom.position.set(0, 0, -0.75);
  broom.rotation.x = 0.6;
  g.add(broom);
  g.userData.broom = broom;
  g.userData.torso = torso;
  g.scale.setScalar(0.88);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function buildSkipBroom() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.25, 8), new THREE.MeshStandardMaterial({ color: 0x2d2f36, metalness: 0.4, roughness: 0.4 }));
  stick.position.y = 0.7;
  g.add(stick);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: 0x1b1d24 }));
  pad.position.y = 0.06;
  g.add(pad);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 32), new THREE.MeshBasicMaterial({ color: 0x20d0ff, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.008;
  g.add(ring);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1019);
  scene.fog = new THREE.Fog(0x0b1019, 34, 92);

  const camera = new THREE.PerspectiveCamera(16, 1, 0.05, 300);

  scene.add(new THREE.HemisphereLight(0xe6eeff, 0x3a4658, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -5; sc.right = 5; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);
  scene.add(key.target);
  const fill = new THREE.PointLight(0xcfe0ff, 20, 30, 1.6);
  fill.position.copy(V(0, FAR_TEE, 6));
  scene.add(fill);

  const iceMat = new THREE.MeshStandardMaterial({ map: iceTexture(), roughness: 0.18, metalness: 0.0, color: 0xffffff });
  for (const x0 of [-5.4, 0, 5.4]) scene.add(buildSheet(x0, iceMat));
  buildArena(scene);

  // aim line from release to broom
  const aimGeo = new THREE.BufferGeometry().setFromPoints([V(0, RELEASE_Y, 0.01), V(0, FAR_TEE, 0.01)]);
  const aimLine = new THREE.Line(aimGeo, new THREE.LineDashedMaterial({ color: 0x20d0ff, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.55 }));
  aimLine.computeLineDistances();
  scene.add(aimLine);

  const granite = graniteTexture();
  return { renderer, scene, camera, key, granite, aimLine };
}

export function setAimLine(aimLine, broomX) {
  const p = aimLine.geometry.attributes.position;
  p.setXYZ(0, 0, 0.01, -RELEASE_Y);
  p.setXYZ(1, broomX, 0.01, -FAR_TEE);
  p.needsUpdate = true;
  aimLine.computeLineDistances();
}
