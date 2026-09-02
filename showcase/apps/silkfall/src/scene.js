import * as THREE from '../vendor/three.module.js';

export const PLANE_Z = 0;

function noise(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x05070f, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070a16, 0.017);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
  camera.position.set(0, 1.5, 36);

  const moonLight = new THREE.DirectionalLight(0xbcd0ff, 1.5);
  moonLight.position.set(-14, 18, 22);
  scene.add(moonLight);
  scene.add(new THREE.AmbientLight(0x1c2444, 1.5));
  const rim = new THREE.DirectionalLight(0x4a6cff, 0.7);
  rim.position.set(16, -6, -18);
  scene.add(rim);

  // Moon
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(5, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff }),
  );
  moon.position.set(-40, 30, -110);
  scene.add(moon);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(11, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0x8ea6ff,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.position.copy(moon.position);
  scene.add(halo);

  // Silhouetted trunks in depth layers. They give the web something to read
  // against and sell the parallax when the camera drifts.
  const rnd = noise(90210);
  const trunks = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const depth = -22 - rnd() * 90;
    const r = 0.7 + rnd() * 2.6;
    const h = 60 + rnd() * 90;
    const geo = new THREE.CylinderGeometry(r * 0.6, r, h, 7, 1);
    const shade = 0.03 + (1 - Math.min(1, -depth / 110)) * 0.07;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(shade * 0.8, shade * 0.9, shade * 1.6),
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set((rnd() - 0.5) * 150, -18 + h / 2 - rnd() * 20, depth);
    m.rotation.z = (rnd() - 0.5) * 0.12;
    trunks.add(m);
  }
  scene.add(trunks);

  // Ground haze
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 200),
    new THREE.MeshBasicMaterial({ color: 0x080b18 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -20, -50);
  scene.add(ground);

  // The two branches the web hangs between.
  const branchMat = new THREE.MeshStandardMaterial({
    color: 0x2a2438,
    roughness: 0.95,
    metalness: 0,
  });
  const branches = new THREE.Group();
  const mkBranch = (x, y, len, rot, r) => {
    const g = new THREE.CylinderGeometry(r * 0.7, r, len, 8, 1);
    const m = new THREE.Mesh(g, branchMat);
    m.position.set(x, y, -1.2);
    m.rotation.z = rot;
    branches.add(m);
    return m;
  };
  mkBranch(-19, 2, 34, 0.13, 1.1);
  mkBranch(19, 1, 34, -0.1, 1.0);
  mkBranch(0, 15.5, 46, Math.PI / 2 + 0.04, 0.85);
  mkBranch(-6, -12.5, 30, Math.PI / 2 - 0.06, 0.7);
  scene.add(branches);

  // Drifting spores catch the moonlight and keep the empty air alive.
  const sporeCount = 260;
  const spos = new Float32Array(sporeCount * 3);
  const sphase = new Float32Array(sporeCount);
  for (let i = 0; i < sporeCount; i++) {
    spos[i * 3] = (rnd() - 0.5) * 70;
    spos[i * 3 + 1] = (rnd() - 0.5) * 44;
    spos[i * 3 + 2] = (rnd() - 0.5) * 40 - 4;
    sphase[i] = rnd() * Math.PI * 2;
  }
  const sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  const spores = new THREE.Points(
    sporeGeo,
    new THREE.PointsMaterial({
      color: 0x9fb6ff,
      size: 0.16,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: dotTexture(),
    }),
  );
  scene.add(spores);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let time = 0;
  function updateAmbient(dt, wind) {
    time += dt;
    const arr = sporeGeo.attributes.position.array;
    for (let i = 0; i < sporeCount; i++) {
      const k = i * 3;
      arr[k] += (Math.sin(time * 0.3 + sphase[i]) * 0.006 + (wind ? wind.x * 0.0016 : 0));
      arr[k + 1] += Math.sin(time * 0.5 + sphase[i] * 1.7) * 0.005 - 0.004;
      if (arr[k + 1] < -22) arr[k + 1] = 22;
      if (arr[k] > 36) arr[k] = -36;
      if (arr[k] < -36) arr[k] = 36;
    }
    sporeGeo.attributes.position.needsUpdate = true;
  }

  return { renderer, scene, camera, resize, updateAmbient, trunks };
}

let _dot;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
