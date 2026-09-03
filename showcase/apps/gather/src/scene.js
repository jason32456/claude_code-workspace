import * as THREE from '../vendor/three.module.js';

export const MOUTH_X = 21;
export const PIPE_Y = 9.5;

export const VIEWS = [
  { name: 'BENCH', pos: [-7, 18.5, 33], look: [5, 10.2, 0] },
  { name: 'CLOSE', pos: [0.5, 12.8, 18.5], look: [6.5, 9.7, 0] },
  { name: 'GAFFER', pos: [-23, 15, 17], look: [7.5, 9.4, 0] },
];

export function buildScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x07070a);
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x08070b, 45, 135);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

  scene.add(new THREE.AmbientLight(0x2a3340, 0.55));

  const rim = new THREE.DirectionalLight(0x6f8ea8, 0.5);
  rim.position.set(-30, 30, 22);
  scene.add(rim);

  const back = new THREE.PointLight(0x2b6bb0, 22, 90, 2);
  back.position.set(-26, 24, -18);
  scene.add(back);

  // --- floor -----------------------------------------------------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x101116, roughness: 0.96, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // --- furnace ---------------------------------------------------------
  const brick = new THREE.MeshStandardMaterial({ color: 0x3b3129, roughness: 0.95, metalness: 0.02 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(30, 34, 42), brick);
  box.position.set(MOUTH_X + 15.2, 17, 0);
  scene.add(box);

  const face = new THREE.Mesh(new THREE.RingGeometry(3.5, 24, 44), brick);
  face.position.set(MOUTH_X, PIPE_Y, 0);
  face.rotation.y = -Math.PI / 2;
  scene.add(face);

  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(3.5, 0.55, 10, 40),
    new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.8, metalness: 0.3 })
  );
  lip.position.set(MOUTH_X, PIPE_Y, 0);
  lip.rotation.y = Math.PI / 2;
  scene.add(lip);

  const gloryMat = new THREE.MeshBasicMaterial({ color: 0xffb457, transparent: true, opacity: 0.95 });
  const glory = new THREE.Mesh(new THREE.CircleGeometry(3.45, 40), gloryMat);
  glory.position.set(MOUTH_X + 9, PIPE_Y, 0);
  glory.rotation.y = -Math.PI / 2;
  scene.add(glory);

  const gloryHaze = new THREE.Mesh(
    new THREE.CircleGeometry(5.6, 40),
    new THREE.MeshBasicMaterial({
      color: 0xff7a1e,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  gloryHaze.position.set(MOUTH_X - 0.2, PIPE_Y, 0);
  gloryHaze.rotation.y = -Math.PI / 2;
  scene.add(gloryHaze);

  const furnaceLight = new THREE.PointLight(0xff8a2a, 210, 95, 2);
  furnaceLight.position.set(MOUTH_X - 1, PIPE_Y, 0);
  scene.add(furnaceLight);

  // --- bench and marver -------------------------------------------------
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.5, metalness: 0.35 });
  const bench = new THREE.Mesh(new THREE.BoxGeometry(44, 1.1, 15), steel);
  bench.position.set(-8, 6.4, 7.5);
  scene.add(bench);

  for (const dx of [-26, 10]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.3, 6.4, 1.3), steel);
    leg.position.set(dx, 3.2, 7.5);
    scene.add(leg);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(44, 0.9, 1.1), steel);
  rail.position.set(-8, 7.4, 1.4);
  scene.add(rail);
  const rail2 = rail.clone();
  rail2.position.z = 13.4;
  scene.add(rail2);

  const marver = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x585f68, roughness: 0.28, metalness: 0.45 })
  );
  marver.position.set(-2, 6.9, 22);
  scene.add(marver);

  // --- the rest of the shop --------------------------------------------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.98 });
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(180, 60, 2), wallMat);
  backWall.position.set(-30, 30, -30);
  scene.add(backWall);

  const sideWall = new THREE.Mesh(new THREE.BoxGeometry(2, 60, 90), wallMat);
  sideWall.position.set(-62, 30, 10);
  scene.add(sideWall);

  // a rack of spare pipes leaning in the corner
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x6b7079, roughness: 0.5, metalness: 0.3 });
  for (let i = 0; i < 5; i++) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 30, 8), rackMat);
    rod.position.set(-44 + i * 1.9, 15, -22 + i * 0.6);
    rod.rotation.z = 0.09 - i * 0.03;
    rod.rotation.x = -0.05;
    scene.add(rod);
  }

  const bin = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.9, metalness: 0.15 })
  );
  bin.position.set(-40, 3, -6);
  scene.add(bin);

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(9, 6, 9),
    new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.95 })
  );
  crate.position.set(-30, 3, 24);
  scene.add(crate);

  const fill = new THREE.PointLight(0x466a92, 52, 95, 2);
  fill.position.set(-30, 22, 26);
  scene.add(fill);

  // --- the piece rig ----------------------------------------------------
  const rig = new THREE.Group();
  rig.position.set(0, PIPE_Y, 0);
  scene.add(rig);

  const spinner = new THREE.Group();
  rig.add(spinner);

  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x7c828c,
    roughness: 0.45,
    metalness: 0.35,
    emissive: 0x171b21,
  });
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 34, 18), pipeMat);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.x = -17;
  spinner.add(pipe);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 1.3, 18), pipeMat);
  collar.rotation.z = Math.PI / 2;
  collar.position.x = -0.4;
  spinner.add(collar);

  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 8, 14),
    new THREE.MeshStandardMaterial({ color: 0x5b4630, roughness: 0.9 })
  );
  grip.rotation.z = Math.PI / 2;
  grip.position.x = -29;
  spinner.add(grip);

  // a key on the pipe so the roll rate is readable even on a perfect cylinder
  const key = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.36, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xe0b46a, roughness: 0.55, metalness: 0.25 })
  );
  key.position.set(-24, 0.85, 0);
  spinner.add(key);

  const pieceLight = new THREE.PointLight(0xff8c33, 0, 58, 2);
  rig.add(pieceLight);

  // --- tool cursor: a faint axial guide plus two caliper jaws ------------
  const cursor = new THREE.Group();
  const guide = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 17, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.16, depthWrite: false })
  );
  const jaw = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 1.5, 0.7),
    new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.9 })
  );
  jaw.position.y = 3;
  const jaw2 = jaw.clone();
  jaw2.position.y = -3;
  jaw2.rotation.z = Math.PI;
  cursor.add(guide, jaw, jaw2);
  rig.add(cursor);

  return {
    renderer,
    scene,
    camera,
    rig,
    spinner,
    cursor,
    pieceLight,
    furnaceLight,
    glory,
    gloryHaze,
    gloryMat,
    cursorParts: [jaw, jaw2],
    cursorGuide: guide,
  };
}

export function fitCamera(view, camera, t = 1, from = null) {
  const target = new THREE.Vector3(...view.pos);
  const look = new THREE.Vector3(...view.look);
  if (from && t < 1) {
    camera.position.lerpVectors(from.position, target, t);
    camera.lookAt(look);
  } else {
    camera.position.copy(target);
    camera.lookAt(look);
  }
}
