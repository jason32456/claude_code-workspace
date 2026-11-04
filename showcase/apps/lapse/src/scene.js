import * as THREE from '../vendor/three.module.js';
import { HALF, FIELDS, D2R, clamp, vnoise, mulberry } from './world.js';
import { ENV_H, ENV_R } from './sim.js';

export const PALETTES = [
  [0xd8402c, 0xf2c230, 0x1f5fa8],
  [0x2a8a6a, 0xf3efe2, 0x2a8a6a],
  [0x6a3fa0, 0xf08a24, 0x6a3fa0],
  [0x1a6fc0, 0xffffff, 0xe03a3a],
  [0xf0b52a, 0x1c1c22, 0xf0b52a],
];

const TEX = 2048, GRID = 512;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 2, 30000);
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x5a4a30, 0.85);
  const sun = new THREE.DirectionalLight(0xffd2a0, 2.1);
  scene.add(hemi, sun, sun.target);

  // Dawn sky: a gradient dome with a warm glow around the low sun.
  const skyU = { sunDir: { value: new THREE.Vector3(1, 0.1, 0) }, top: { value: new THREE.Color(0x4e7bb8) }, mid: { value: new THREE.Color(0xc9d3dc) }, low: { value: new THREE.Color(0xf6c89a) } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sunDir, top, mid, low; varying vec3 vD;
        void main(){ float h = vD.y; vec3 c = mix(mid, top, smoothstep(0.02, 0.55, h)); c = mix(low, c, smoothstep(-0.05, 0.16, h));
          float s = max(dot(normalize(vD), normalize(sunDir)), 0.0);
          c += vec3(1.0,0.72,0.4) * (pow(s, 8.0) * 0.45 + pow(s, 400.0) * 3.0) * (1.0 - smoothstep(0.1, 0.6, h));
          c = mix(c, vec3(0.62,0.58,0.52), smoothstep(0.0, -0.2, h));
          gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xd8d2c8, 1500, 14000);

  const world3 = new THREE.Group();
  scene.add(world3);
  let sim = null, W = null, groundCanvas = null;
  const balloons = new Map();
  let markerObjs = [], pibalObjs = [], goalObjs = [], smoke = null, predictDot = null, trackLine = null;

  // ---------- terrain ----------
  function buildTerrain() {
    world3.clear();
    const F = sim.F;
    // Height grid shared by the mesh and the ground texture.
    const H = new Float32Array((GRID + 1) * (GRID + 1));
    const cs = (2 * HALF) / GRID;
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) H[j * (GRID + 1) + i] = W.ground(-HALF + i * cs, -HALF + j * cs);
    const hAt = (x, z) => {
      const fi = clamp((x + HALF) / cs, 0, GRID - 1e-6), fj = clamp((z + HALF) / cs, 0, GRID - 1e-6);
      const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, r = GRID + 1;
      return (H[j * r + i] * (1 - u) + H[j * r + i + 1] * u) * (1 - v) + (H[(j + 1) * r + i] * (1 - u) + H[(j + 1) * r + i + 1] * u) * v;
    };

    const geo = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, 256, 256);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, W.ground(pos.getX(k), pos.getZ(k)));
    geo.computeVertexNormals();

    // Paint the fields from the same function the sim scores landings with.
    groundCanvas = document.createElement('canvas');
    groundCanvas.width = groundCanvas.height = TEX;
    const g = groundCanvas.getContext('2d');
    const img = g.createImageData(TEX, TEX), d = img.data;
    const px = (2 * HALF) / TEX;
    const rnd = mulberry(F.seed);
    const tint = FIELDS.map(() => 0);
    for (let j = 0; j < TEX; j++) {
      const z = -HALF + (j + 0.5) * px;
      for (let i = 0; i < TEX; i++) {
        const x = -HALF + (i + 0.5) * px;
        const h = hAt(x, z);
        const sl = Math.abs(hAt(x + 20, z) - hAt(x - 20, z)) + Math.abs(hAt(x, z + 20) - hAt(x, z - 20));
        const f = W.fieldAt(x, z, F.terrain.call(F, x, z), sl);
        let [r, gg, b] = f.col;
        const n = vnoise(x / 40, z / 40, 3) * 10 + vnoise(x / 9, z / 9, 4) * 6;
        const cell = vnoise(Math.floor(x / 130), Math.floor(z / 130), 8);
        let k = 1 + n / 100 + cell * 0.07;
        if (f.id === 3) k *= 0.92 + 0.08 * Math.sin((x * 0.7 + z * 0.3) * 1.1);
        if (f.id === 1) k *= 0.95 + 0.05 * Math.sin((x * 0.2 - z * 0.9) * 0.9);
        if (f.id === 4 && ((i * 7 + j * 13) % 97 === 0)) { r = 240; gg = 236; b = 226; }
        if (f.id === 5) k *= 0.8 + 0.35 * Math.max(0, vnoise(x / 6, z / 6, 5));
        if (f.id === 6) { const dep = clamp(-h / 8, 0, 1); r = 70 - 20 * dep; gg = 110 - 20 * dep; b = 130 - 6 * dep; k = 1 + n / 300; }
        if (f.id === 7) { const q = vnoise(x / 7, z / 7, 6); if (q > 0.35) { r = 150; gg = 74; b = 56; } else if (q < -0.4) { r = 96; gg = 120; b = 70; } }
        if (f.id !== 6 && f.id !== 7) {
          const hd = W.hedge(x, z);
          if (hd < 2.6) { r = 52; gg = 78; b = 42; k = 0.9 + n / 200; }
        }
        // Baked low-sun shading from the slope towards the sun (east).
        const shade = 1 + clamp((hAt(x + 12, z) - hAt(x - 12, z)) * -0.03, -0.25, 0.2);
        const o = (j * TEX + i) * 4;
        d[o] = clamp(r * k * shade, 0, 255); d[o + 1] = clamp(gg * k * shade, 0, 255); d[o + 2] = clamp(b * k * shade, 0, 255); d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(groundCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    world3.add(terrain);

    // Ground beyond the map so the horizon is not an edge; the sea for the coast.
    const ring = new THREE.Mesh(new THREE.RingGeometry(HALF * 1.0, 26000, 64, 1), new THREE.MeshLambertMaterial({ color: 0x6f8a58 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = F.id === 'valley' ? 120 : F.coast ? -1 : 20;
    world3.add(ring);
    if (F.coast) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(30000, 60000), new THREE.MeshLambertMaterial({ color: 0x5f8494 }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(F.coast + 15000, -0.3, 0);
      world3.add(sea);
    }

    buildTrees(hAt);
    buildHouses();
    buildLines();
    buildGoals();
    buildSmoke();
  }

  function buildTrees(hAt) {
    const F = sim.F, rnd = mulberry(F.seed + 5);
    const pts = [];
    for (let z = -HALF + 10; z < HALF; z += 24) for (let x = -HALF + 10; x < HALF; x += 24) {
      const jx = x + (rnd() - 0.5) * 20, jz = z + (rnd() - 0.5) * 20;
      const f = W.fieldAt(jx, jz);
      if (f.id === 5 && pts.length < 16000) pts.push([jx, jz, 0.8 + rnd() * 0.6]);
      else if (f.id < 5 && W.hedge(jx, jz) < 6 && rnd() < 0.18) pts.push([jx, jz, 0.7 + rnd() * 0.5]);
    }
    const crown = new THREE.IcosahedronGeometry(5, 0);
    crown.translate(0, 9, 0);
    const trunk = new THREE.CylinderGeometry(0.4, 0.6, 5, 5);
    trunk.translate(0, 2.5, 0);
    const mc = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0x3e5e34, flatShading: true }), pts.length);
    const mt = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x4a3a28 }), pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    pts.forEach(([x, z, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
      s.set(k, k * (0.8 + rnd() * 0.5), k);
      p.set(x, hAt(x, z) - 0.5, z);
      m.compose(p, q, s);
      mc.setMatrixAt(i, m); mt.setMatrixAt(i, m);
      col.setHSL(0.24 + rnd() * 0.08, 0.35 + rnd() * 0.15, 0.22 + rnd() * 0.1);
      mc.setColorAt(i, col);
    });
    world3.add(mc, mt);
  }

  let chimneys = [];
  function buildHouses() {
    const F = sim.F, rnd = mulberry(F.seed + 9);
    const body = new THREE.BoxGeometry(1, 1, 1); body.translate(0, 0.5, 0);
    const roof = new THREE.ConeGeometry(0.75, 0.6, 4); roof.rotateY(Math.PI / 4); roof.translate(0, 1.3, 0);
    const list = [];
    for (const [vx, vz] of F.villages) for (let k = 0; k < 55; k++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 230;
      list.push([vx + Math.cos(a) * r, vz + Math.sin(a) * r, rnd() * 3, 7 + rnd() * 6, 5 + rnd() * 3]);
    }
    const mb = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0xe8dccb }), list.length);
    const mr = new THREE.InstancedMesh(roof, new THREE.MeshLambertMaterial({ color: 0x8c4632, flatShading: true }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    chimneys = [];
    list.forEach(([x, z, rot, w, h], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      s.set(w, h, w * 1.4); p.set(x, W.ground(x, z) - 0.3, z);
      m.compose(p, q, s); mb.setMatrixAt(i, m);
      s.set(w * 1.15, h, w * 1.6); m.compose(p, q, s); mr.setMatrixAt(i, m);
      col.setHSL(0.08, 0.2 + rnd() * 0.3, 0.75 + rnd() * 0.15); mb.setColorAt(i, col);
      if (i % 9 === 0) chimneys.push([x, W.ground(x, z) + h * 1.6, z]);
    });
    world3.add(mb, mr);
  }

  function buildSmoke() {
    const N = chimneys.length * 26;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(235,235,240,0.55)'); gr.addColorStop(1, 'rgba(235,235,240,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const mat = new THREE.PointsMaterial({ size: 26, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, sizeAttenuation: true });
    smoke = new THREE.Points(geo, mat);
    smoke.userData.p = Array.from({ length: N }, (_, i) => ({ c: Math.floor(i / 26), age: (i % 26) * 2.2, x: 0, y: 0, z: 0 }));
    smoke.frustumCulled = false;
    world3.add(smoke);
  }

  function buildLines() {
    const pyl = new THREE.Group();
    const towerGeo = new THREE.CylinderGeometry(0.4, 1.8, 26, 4, 1, true); towerGeo.translate(0, 13, 0);
    const armGeo = new THREE.BoxGeometry(11, 0.5, 0.5); armGeo.translate(0, 24, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8b9096, wireframe: false });
    const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2d33 });
    for (const L of W.lines) {
      const posts = [L[0].a, ...L.map((s) => s.b)];
      for (let i = 0; i < posts.length; i++) {
        const [x, z] = posts[i];
        const nb = posts[Math.min(i + 1, posts.length - 1)], pb = posts[Math.max(i - 1, 0)];
        const ang = Math.atan2(nb[0] - pb[0], nb[1] - pb[1]);
        const t = new THREE.Mesh(towerGeo, mat), a = new THREE.Mesh(armGeo, mat);
        const gy = W.ground(x, z);
        t.position.set(x, gy, z); a.position.set(x, gy, z); a.rotation.y = ang + Math.PI / 2;
        pyl.add(t, a);
      }
      for (const sp of L) {
        const dx = sp.b[0] - sp.a[0], dz = sp.b[1] - sp.a[1], len = Math.hypot(dx, dz);
        const nx = -dz / len, nz = dx / len;
        for (const off of [-5, 0, 5]) {
          const pts = [];
          for (let k = 0; k <= 16; k++) {
            const t = k / 16;
            pts.push(new THREE.Vector3(sp.a[0] + dx * t + nx * off, W.wireHeight(sp, t), sp.a[1] + dz * t + nz * off));
          }
          pyl.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
        }
      }
    }
    world3.add(pyl);
  }

  function crossMesh(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, fog: true });
    for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 4), mat);
      arm.rotation.y = r; g.add(arm);
    }
    const ringPts = [];
    for (let k = 0; k <= 64; k++) ringPts.push(new THREE.Vector3(Math.cos((k / 64) * 6.283) * 100, 0.6, Math.sin((k / 64) * 6.283) * 100));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 })));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 260, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    beam.position.y = 130; g.add(beam);
    return g;
  }

  function buildGoals() {
    goalObjs = [];
    sim.F.tasks.forEach((t, ti) => {
      t.goals.forEach(([x, z], gi) => {
        const c = crossMesh(t.kind === 'HWZ' ? 0xffb02e : 0xffffff);
        c.position.set(x, W.ground(x, z) + 0.4, z);
        world3.add(c);
        goalObjs.push({ obj: c, ti, gi });
      });
    });
  }

  // ---------- balloons ----------
  function envelopeGeo(pal) {
    // Round crown on a sphere, tapering to a 2.6 m mouth at y = 4.
    const prof = [], yc = ENV_H - ENV_R, mouth = 2.6;
    for (let k = 0; k <= 14; k++) {
      const y = 4 + (k / 14) * (yc - 4);
      const u = Math.sin(((y - 4) / (yc - 4)) * Math.PI / 2);
      prof.push(new THREE.Vector2(mouth + (ENV_R - mouth) * Math.pow(u, 0.75), y));
    }
    for (let k = 1; k <= 12; k++) {
      const a = (k / 12) * Math.PI / 2;
      prof.push(new THREE.Vector2(Math.max(0.01, ENV_R * Math.cos(a)), yc + ENV_R * Math.sin(a)));
    }
    const geo = new THREE.LatheGeometry(prof, 48);
    const cols = new Float32Array(geo.attributes.position.count * 3);
    const uv = geo.attributes.uv;
    const c = new THREE.Color();
    for (let i = 0; i < uv.count; i++) {
      const gore = Math.floor(uv.getX(i) * 16) % 2;
      const band = uv.getY(i);
      c.setHex(band > 0.42 && band < 0.58 ? pal[1] : gore ? pal[0] : pal[2]);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function makeBalloonObj(b, idx) {
    const pal = PALETTES[idx % PALETTES.length];
    const g = new THREE.Group();
    const env = new THREE.Mesh(envelopeGeo(pal), new THREE.MeshLambertMaterial({ vertexColors: true }));
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), new THREE.MeshLambertMaterial({ color: 0x8a6438 }));
    basket.position.y = 0.55;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 1.2), new THREE.MeshLambertMaterial({ color: 0x555555 }));
    frame.position.y = 2.9;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.y = 4.6; flame.visible = false;
    const lm = new THREE.LineBasicMaterial({ color: 0x3a3028 });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sx * 0.65, 1.1, sz * 0.65), new THREE.Vector3(sx * 1.9, 4.1, sz * 1.9)]), lm));
    }
    const light = new THREE.PointLight(0xffa040, 0, 60, 1.5);
    light.position.y = 6;
    g.add(env, basket, frame, flame, light);
    // Ground shadow along the sun direction: a soft dark disc.
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    const x = sc.getContext('2d'); const gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    world3.add(g, shadow);
    return { g, env, flame, light, shadow, pal, basket };
  }

  function load(s) {
    sim = s; W = s.world;
    for (const o of balloons.values()) { world3.remove(o.g); world3.remove(o.shadow); }
    balloons.clear();
    buildTerrain();
    sim.balloons.forEach((b, i) => balloons.set(b.id, makeBalloonObj(b, b.color ?? i)));
    markerObjs = []; pibalObjs = [];
    const pd = new THREE.Mesh(new THREE.RingGeometry(6, 9, 32), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    pd.rotation.x = -Math.PI / 2; pd.renderOrder = 3; pd.visible = false;
    predictDot = pd; world3.add(pd);
    trackLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.5 }));
    trackLine.frustumCulled = false;
    world3.add(trackLine);
    setSun();
  }
  function addBalloon(b, idx) { balloons.set(b.id, makeBalloonObj(b, idx)); }

  const sunDir = new THREE.Vector3();
  function setSun() {
    const hr = sim.F.clock + sim.t / 3600;
    const alt = clamp((hr - 5.6) * 11, 1, 25) * D2R, az = (70 + (hr - 6) * 12) * D2R;
    sunDir.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
    skyU.sunDir.value.copy(sunDir);
    sun.intensity = 1.2 + 1.4 * clamp(alt / (20 * D2R), 0, 1);
    sun.color.setHSL(0.08, 0.9, 0.62 + 0.15 * clamp(alt / (20 * D2R), 0, 1));
  }

  // ---------- camera ----------
  const cam = { mode: 0, yaw: 200 * D2R, pitch: 0.12, dist: 70, look: 0, lookP: 0, mapH: 2600 };
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  let snap = true;
  function updateCamera(dt, focus) {
    const b = focus;
    const tgt = new THREE.Vector3(b.x, b.y + 14, b.z);
    const des = new THREE.Vector3();
    if (cam.mode === 0) {
      const cp = Math.cos(cam.pitch);
      des.set(tgt.x - Math.sin(cam.yaw) * cp * cam.dist, tgt.y + Math.sin(cam.pitch) * cam.dist, tgt.z + Math.cos(cam.yaw) * cp * cam.dist);
      const gmin = W.ground(des.x, des.z) + 3;
      if (des.y < gmin) des.y = gmin;
    } else if (cam.mode === 1) {
      des.set(b.x, b.y + 1.7, b.z);
      tgt.set(b.x + Math.sin(cam.yaw) * 100, b.y + 1.7 + Math.sin(cam.pitch - 0.25) * 100, b.z - Math.cos(cam.yaw) * 100);
    } else {
      des.set(b.x + 1, b.y + cam.mapH, b.z + 1);
      tgt.set(b.x, b.y, b.z);
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * (cam.mode === 1 ? 30 : 5));
    camPos.lerp(des, k); camTgt.lerp(tgt, k);
    if (snap) { camPos.copy(des); camTgt.copy(tgt); snap = false; }
    camera.position.copy(camPos);
    if (cam.mode === 2) camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
    camera.lookAt(camTgt);
    camera.near = cam.mode === 1 ? 0.3 : 2;
    camera.updateProjectionMatrix();
  }

  // ---------- per-frame ----------
  const tmp = new THREE.Vector3();
  function render(dt, opts = {}) {
    if (!sim) return;
    const focus = opts.focus ?? sim.player;
    setSun();
    sun.position.copy(sunDir).multiplyScalar(3000).add(new THREE.Vector3(focus.x, 0, focus.z));
    sun.target.position.set(focus.x, 0, focus.z);

    for (const b of sim.balloons) {
      let o = balloons.get(b.id);
      if (!o) { o = makeBalloonObj(b, b.color ?? 0); balloons.set(b.id, o); }
      o.g.position.set(b.x, b.y, b.z);
      // Slight sway from the burner and the wind shear.
      o.g.rotation.z = Math.sin(sim.t * 0.7 + b.x * 0.01) * 0.015;
      o.g.rotation.x = Math.cos(sim.t * 0.5 + b.z * 0.01) * 0.015;
      const flick = 0.75 + 0.25 * Math.sin(performance.now() * 0.05 + b.x);
      o.flame.visible = !!b.burner;
      o.flame.scale.set(1, flick, 1);
      o.light.intensity = b.burner ? 900 * flick : 0;
      o.env.visible = o.basket.visible = !(cam.mode === 1 && b === focus);
      // Shadow on the ground along the sun ray.
      const t = (b.y + 14 - W.ground(b.x, b.z)) / Math.max(0.05, sunDir.y);
      const sx = b.x - sunDir.x * t, sz = b.z - sunDir.z * t;
      const gy = W.ground(sx, sz);
      o.shadow.position.set(sx, gy + 0.6, sz);
      const stretch = 1 / Math.max(0.2, sunDir.y);
      o.shadow.scale.set(18, 18 * Math.min(stretch, 4), 1);
      o.shadow.rotation.z = -Math.atan2(sunDir.x, -sunDir.z);
      o.shadow.visible = t < 6000;
    }

    // Markers: a sandbag and its streamer trail.
    while (markerObjs.length < sim.markers.length) {
      const mk = sim.markers[markerObjs.length];
      const idx = sim.balloons.findIndex((b) => b.id === mk.who);
      const pal = PALETTES[(sim.balloons[idx]?.color ?? idx) % PALETTES.length];
      const bag = new THREE.Mesh(new THREE.SphereGeometry(mk.who === sim.player.id ? 3.5 : 2.2, 8, 6), new THREE.MeshBasicMaterial({ color: pal[0] }));
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: pal[0], transparent: true, opacity: 0.6 }));
      line.frustumCulled = false;
      world3.add(bag, line);
      markerObjs.push({ bag, line });
    }
    sim.markers.forEach((mk, i) => {
      const o = markerObjs[i];
      o.bag.position.set(mk.x, mk.y + 1, mk.z);
      if (mk.trail.length > 1 && (!mk.landed || !o.done)) {
        o.line.geometry.dispose();
        o.line.geometry = new THREE.BufferGeometry().setFromPoints([...mk.trail.map((p) => new THREE.Vector3(p[0], p[1], p[2])), new THREE.Vector3(mk.x, mk.y, mk.z)]);
        if (mk.landed) o.done = true;
      }
    });

    // Pibals.
    while (pibalObjs.length < sim.pibals.length) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x888888 }));
      const l = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, dashSize: 6, gapSize: 6 }));
      l.frustumCulled = false;
      world3.add(s, l); pibalObjs.push({ s, l });
    }
    pibalObjs.forEach((o, i) => {
      const pb = sim.pibals[i];
      if (!pb) { o.s.visible = o.l.visible = false; return; }
      o.s.visible = pb.alive; o.l.visible = true;
      o.s.position.set(pb.x, pb.y, pb.z);
      if (pb.trail.length > 1) {
        o.l.geometry.dispose();
        o.l.geometry = new THREE.BufferGeometry().setFromPoints([...pb.trail.map((p) => new THREE.Vector3(p[0], p[1], p[2])), new THREE.Vector3(pb.x, pb.y, pb.z)]);
        o.l.computeLineDistances();
      }
    });

    // Goals: dim the ones already scored.
    for (const go of goalObjs) {
      const active = go.ti === sim.player.taskIdx;
      go.obj.children[3].visible = active;
      go.obj.children[2].visible = go.ti >= sim.player.taskIdx;
    }

    // Chimney smoke follows the real surface wind.
    if (smoke) {
      const P = smoke.geometry.attributes.position;
      smoke.userData.p.forEach((q, i) => {
        q.age += dt;
        const c = chimneys[q.c];
        if (q.age > 57) { q.age = 0; q.x = c[0]; q.y = c[1]; q.z = c[2]; }
        if (q.age < dt * 1.5 || q.x === 0) { q.x = c[0]; q.y = c[1]; q.z = c[2]; }
        const w = W.wind(q.x, q.y, q.z, sim.t);
        q.x += w.x * dt; q.z += w.z * dt; q.y += (1.2 + w.y) * dt * Math.exp(-q.age / 20);
        P.setXYZ(i, q.x, q.y, q.z);
      });
      P.needsUpdate = true;
    }

    if (predictDot) {
      const pm = opts.predict;
      predictDot.visible = !!pm;
      if (pm) { predictDot.position.set(pm.x, W.ground(pm.x, pm.z) + 0.8, pm.z); predictDot.scale.setScalar(1 + 0.1 * Math.sin(performance.now() / 150)); }
    }
    if (trackLine && focus.track.length > 1) {
      trackLine.geometry.dispose();
      trackLine.geometry = new THREE.BufferGeometry().setFromPoints([...focus.track.map((p) => new THREE.Vector3(p[0], p[1] + 2, p[2])), new THREE.Vector3(focus.x, focus.y + 2, focus.z)]);
    }

    updateCamera(dt, focus);
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  function project(x, y, z) {
    tmp.set(x, y, z).project(camera);
    if (tmp.z > 1) return null;
    return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight };
  }

  return {
    load, render, addBalloon, project, cam,
    snapCam: () => { snap = true; },
    get groundCanvas() { return groundCanvas; },
    setMode: (m) => { cam.mode = m; snap = true; if (m === 1) cam.pitch = 0; },
  };
}
