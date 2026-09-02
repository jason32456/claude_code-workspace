import * as THREE from '../vendor/three.module.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01030a);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.12, 4000);

  // Hard key light, almost no fill: the shadowed side of the station is meant to
  // be genuinely dark, and the helmet lamp is meant to matter.
  const sun = new THREE.DirectionalLight(0xfff4e0, 3.1);
  sun.position.set(-0.55, 0.42, 0.72).normalize().multiplyScalar(400);
  scene.add(sun);

  scene.add(new THREE.AmbientLight(0x2a3d5c, 0.42));
  scene.add(new THREE.HemisphereLight(0x35507a, 0x0a0f18, 0.35));

  const lamp = new THREE.SpotLight(0xd8ecff, 46, 120, 0.7, 0.5, 1.0);
  lamp.position.set(0, 0, 0);
  const lampTarget = new THREE.Object3D();
  scene.add(lamp, lampTarget);
  lamp.target = lampTarget;

  scene.add(makeStars());
  const planet = makePlanet();
  scene.add(planet);
  scene.add(makeSunDisc(sun.position));

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { renderer, scene, camera, sun, lamp, lampTarget, planet };
}

function makeStars() {
  const n = 4200;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = 1600 * Math.sqrt(1 - u * u);
    pos[i * 3] = r * Math.cos(th);
    pos[i * 3 + 1] = 1600 * u;
    pos[i * 3 + 2] = r * Math.sin(th);
    const warm = Math.random();
    c.setHSL(warm < 0.8 ? 0.58 : 0.09, 0.35, 0.55 + Math.random() * 0.45);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 2.1, sizeAttenuation: false, vertexColors: true, depthWrite: false });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

function makePlanet() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1150, 64, 48),
    new THREE.MeshStandardMaterial({ color: 0x14314f, roughness: 1, metalness: 0 })
  );
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1210, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x3d7fd6,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(body, glow);
  group.position.set(-260, -1420, -520);
  return group;
}

function makeSunDisc(sunPos) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.SphereGeometry(26, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfffaf0 })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffdca8,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  g.add(disc, halo);
  g.position.copy(sunPos).multiplyScalar(2.6);
  return g;
}
