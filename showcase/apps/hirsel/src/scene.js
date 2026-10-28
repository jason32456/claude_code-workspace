import * as THREE from '../vendor/three.module.js';
import { CMD_NAME, penGeometry, currentTarget, flankRadius, mulberry32 } from './sim.js';

const SKIES = {
  morning: { top: 0x5d8fcf, horizon: 0xf1dcc0, sun: 0xfff0d8, sunDir: [-0.6, 0.45, -0.5], hemi: [0xcfe0f0, 0x6b6a40, 1.1], sunI: 2.3, fog: [250, 1500] },
  noon: { top: 0x3f7fd0, horizon: 0xcfe2f0, sun: 0xffffff, sunDir: [0.45, 0.8, -0.3], hemi: [0xc8dcf2, 0x5f6b3a, 1.0], sunI: 2.6, fog: [300, 1700] },
  overcast: { top: 0x8193a6, horizon: 0xc6ccd0, sun: 0xeef0f2, sunDir: [0.3, 0.7, -0.6], hemi: [0xd4dbe2, 0x5c5f45, 1.45], sunI: 1.2, fog: [180, 1150] },
};

function part(geo, color, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(tx, ty, tz);
  const c = new THREE.Color(color), n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function merge(parts) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const total = parts.reduce((s, p) => s + p.attributes[name].array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}
function lumpy(geo, amt, seed) {
  const pa = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) {
    v.fromBufferAttribute(pa, i);
    const n = Math.sin(v.x * 9.1 + seed) * Math.sin(v.y * 8.3 - seed * 0.7) * Math.sin(v.z * 7.7 + seed * 1.3);
    v.multiplyScalar(1 + n * amt);
    pa.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const vmat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...o });

// --- Characters -------------------------------------------------------------

function makeSheep(i, horned) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const wool = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.11, 0.18, 0.8 + (i % 3) * 0.04), roughness: 1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.85 });
  const fleece = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.5, 2), 0.09, i * 1.7), wool);
  fleece.scale.set(1.45, 0.98, 0.92);
  fleece.position.y = 0.72;
  fleece.castShadow = true;
  body.add(fleece);
  const rump = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(0.36, 1), 0.08, i), wool);
  rump.position.set(-0.36, 0.78, 0); rump.castShadow = true;
  body.add(rump);
  const neck = new THREE.Group();
  neck.position.set(0.52, 0.86, 0);
  body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), black);
  head.scale.set(1.6, 1, 0.9); head.position.set(0.2, 0, 0); head.castShadow = true;
  neck.add(head);
  const poll = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), wool);
  poll.position.set(0.08, 0.08, 0);
  neck.add(poll);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.06), black);
    ear.position.set(0.12, 0.05, s * 0.15); ear.rotation.y = s * 0.6; ear.rotation.x = s * 0.4;
    neck.add(ear);
    if (horned) {
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 10, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: 0xb59e78, roughness: 0.7 }));
      horn.position.set(0.06, 0.04, s * 0.13); horn.rotation.y = Math.PI / 2;
      neck.add(horn);
    }
  }
  const legs = [];
  for (const [lx, lz] of [[0.32, 0.17], [0.32, -0.17], [-0.36, 0.17], [-0.36, -0.17]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.52, lz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.52, 6), black);
    leg.position.y = -0.26; leg.castShadow = true;
    pivot.add(leg);
    body.add(pivot);
    legs.push(pivot);
  }
  return { root, body, neck, legs };
}

function makeDog() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const black = new THREE.MeshStandardMaterial({ color: 0x141313, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.75 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), black);
  torso.scale.set(1.9, 0.95, 0.85); torso.position.y = 0.48; torso.castShadow = true;
  body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), white);
  chest.position.set(0.3, 0.44, 0);
  body.add(chest);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.06, 6, 12), white);
  collar.position.set(0.36, 0.58, 0); collar.rotation.y = Math.PI / 2; collar.rotation.x = 0.5;
  body.add(collar);
  const neck = new THREE.Group();
  neck.position.set(0.42, 0.64, 0);
  body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 9), black);
  head.position.set(0.06, 0.06, 0); head.castShadow = true;
  neck.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), white);
  snout.rotation.z = -Math.PI / 2; snout.position.set(0.2, 0.02, 0);
  neck.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), black);
  nose.position.set(0.29, 0.02, 0);
  neck.add(nose);
  const blaze = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.04), white);
  blaze.position.set(0.1, 0.17, 0); blaze.rotation.z = -0.35;
  neck.add(blaze);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 5), black);
    ear.position.set(0.0, 0.17, s * 0.07); ear.rotation.x = s * -0.25; ear.rotation.z = 0.35;
    neck.add(ear);
  }
  const tail = new THREE.Group();
  tail.position.set(-0.4, 0.5, 0);
  body.add(tail);
  const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6), black);
  t1.rotation.z = -1.0; t1.position.set(-0.12, -0.08, 0);
  tail.add(t1);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), white);
  tip.position.set(-0.26, -0.17, 0);
  tail.add(tip);
  const legs = [];
  for (const [lx, lz] of [[0.26, 0.1], [0.26, -0.1], [-0.26, 0.1], [-0.26, -0.1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.42, lz);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.26, 6), black);
    upper.position.y = -0.13; upper.castShadow = true;
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.03, 0.18, 6), white);
    sock.position.y = -0.33;
    pivot.add(upper, sock);
    body.add(pivot);
    legs.push(pivot);
  }
  return { root, body, neck, legs, tail };
}

function makeHandler() {
  const root = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x4b5134, roughness: 0.75 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x3a3229, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a888, roughness: 0.8 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x6b5b45, roughness: 0.95 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 8), trousers);
    leg.position.set(0, 0.43, s * 0.11); leg.castShadow = true;
    root.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0x241c15 }));
    boot.position.set(0.05, 0.06, s * 0.11);
    root.add(boot);
  }
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.72, 10), jacket);
  torso.position.y = 1.2; torso.castShadow = true;
  root.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin);
  head.position.y = 1.7; head.castShadow = true;
  root.add(head);
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12), cap);
  capM.position.set(0.02, 1.8, 0);
  root.add(capM);
  const peak = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.2), cap);
  peak.position.set(0.15, 1.78, 0);
  root.add(peak);
  const armL = new THREE.Group(); armL.position.set(0, 1.5, 0.27); root.add(armL);
  const armR = new THREE.Group(); armR.position.set(0, 1.5, -0.27); root.add(armR);
  for (const a of [armL, armR]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.62, 8), jacket);
    m.position.y = -0.3; m.castShadow = true;
    a.add(m);
  }
  const crook = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.7 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.45, 6), wood);
  stick.position.y = 0.72;
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 10, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.5 }));
  hook.position.set(0.05, 1.47, 0); hook.rotation.y = Math.PI / 2;
  crook.add(stick, hook);
  crook.position.set(0.25, 0, 0.36);
  root.add(crook);
  return { root, armR, armL };
}

// --- Course furniture ---------------------------------------------------------

function hurdleGeo(len) {
  const ps = [];
  const wood = 0x9b7a52, light = 0xb89468;
  for (const y of [0.25, 0.55, 0.85]) ps.push(part(new THREE.BoxGeometry(len, 0.08, 0.04), light, len / 2, y, 0));
  for (let k = 0; k <= 3; k++) ps.push(part(new THREE.BoxGeometry(0.07, 1.0, 0.06), wood, (k / 3) * len, 0.5, 0));
  ps.push(part(new THREE.BoxGeometry(len * 1.02, 0.07, 0.035), wood, len / 2, 0.55, 0.02, 0, 0, Math.atan2(0.6, len)));
  return merge(ps);
}

function textSprite(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 54px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(text).width + 56;
  g.fillStyle = 'rgba(20,24,18,0.72)';
  g.beginPath(); g.roundRect(256 - w / 2, 22, w, 84, 42); g.fill();
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(4, 1, 1);
  s.renderOrder = 10;
  return s;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.2, 3000);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445522, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const skyU = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 top, horizon, sunDir, sunCol; varying vec3 vD;
      void main(){ float h = clamp(vD.y, 0., 1.); vec3 c = mix(horizon, top, pow(h, 0.5));
      float s = max(dot(normalize(vD), normalize(sunDir)), 0.);
      c += sunCol * (pow(s, 700.) * 2.5 + pow(s, 10.) * 0.15);
      gl_FragColor = vec4(c, 1.); }`,
  }));
  sky.renderOrder = -1;
  scene.add(sky);

  let world = null;
  let sheepM = [], dogM = null, handlerM = null, gateM = null, heardSprite = null, lostSprite = null, balanceRing = null, lineGroup = null, trailLine = null;
  const sprites = {};
  const cam = { mode: 'post', pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, init: false, zoom: 1 };
  let assist = true, labels = true, whistleT = 0, sim = null;

  function terrainMat() {
    const mat = vmat({ roughness: 1 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWp;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float g = vn(vWp.xz * 0.9) * 0.5 + vn(vWp.xz * 4.3) * 0.3 + vn(vWp.xz * 0.12) * 0.4;
          diffuseColor.rgb *= 0.82 + 0.3 * g;`);
    };
    return mat;
  }

  function buildTerrain(c, h) {
    const F = c.field, M = 420;
    const x0 = F.x0 - M, x1 = F.x1 + M, z0 = F.z0 - M, z1 = F.z1 + M * 0.8;
    const step = 3;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
    const grass = new THREE.Color(0x5f8a35), stripe = new THREE.Color(0x6e9a3e), rough = new THREE.Color(0x7c8443), heather = new THREE.Color(0x6e5a4e), rock = new THREE.Color(0x8b8a80), gorse = new THREE.Color(0x3d4f22);
    const k = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, z = z0 + j * step, o = i + j * nx;
      const y = h(x, z);
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = z;
      const inside = x > F.x0 && x < F.x1 && z > F.z0 && z < F.z1;
      if (inside) {
        k.copy(Math.floor((x - F.x0) / 10) % 2 ? stripe : grass);
      } else {
        const out = Math.max(F.x0 - x, x - F.x1, F.z0 - z, z - F.z1);
        k.copy(grass).lerp(rough, Math.min(1, out / 40));
        if (c.walls || out > 120) k.lerp(heather, Math.min(1, Math.max(0, (y - (c.walls ? 20 : 60)) / 60)));
        const slope = Math.abs(h(x + 2, z) - h(x - 2, z)) + Math.abs(h(x, z + 2) - h(x, z - 2));
        if (slope > 4) k.lerp(rock, Math.min(0.5, (slope - 4) / 5));
      }
      for (const [gx, gz, r] of c.gorse) {
        const d = Math.hypot(x - gx, z - gz);
        if (d < r + 3) k.lerp(gorse, Math.min(1, (r + 3 - d) / 3) * 0.8);
      }
      col[o * 3] = k.r; col[o * 3 + 1] = k.g; col[o * 3 + 2] = k.b;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = i + j * nx, b = a + 1, cc = a + nx, d = cc + 1;
      idx[q++] = a; idx[q++] = cc; idx[q++] = b; idx[q++] = b; idx[q++] = cc; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, terrainMat());
    mesh.receiveShadow = true;
    return mesh;
  }

  function instanced(geo, mat, list, castShadow = true) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0);
      q.setFromEuler(e);
      mesh.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1)));
    });
    mesh.count = list.length;
    mesh.castShadow = castShadow; mesh.receiveShadow = true;
    return mesh;
  }

  function buildWorld(c, h) {
    const group = new THREE.Group();
    const rng = mulberry32(c.seed * 31);
    group.add(buildTerrain(c, h));
    const F = c.field;

    // Boundary: dry-stone wall on the hill, post and rail elsewhere.
    const sides = [[F.x0, F.z0, F.x1, F.z0], [F.x1, F.z0, F.x1, F.z1], [F.x1, F.z1, F.x0, F.z1], [F.x0, F.z1, F.x0, F.z0]];
    const posts = [], rails = [], stones = [];
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ry = -Math.atan2(uz, ux);
      if (c.walls) {
        for (let d = 0; d < len; d += 1.6) {
          const x = ax + ux * (d + 0.8), z = az + uz * (d + 0.8);
          const gap = c.wallGap && Math.hypot(x - c.wallGap.x, z - c.wallGap.z) < c.wallGap.w / 2;
          if (gap) continue;
          stones.push({ x, y: h(x, z) + 0.45, z, ry: ry + (rng() - 0.5) * 0.06, sx: 1.7, sy: 0.9 + rng() * 0.25, sz: 0.7 });
        }
      } else {
        for (let d = 0; d <= len; d += 3) {
          const x = ax + ux * d, z = az + uz * d;
          posts.push({ x, y: h(x, z) + 0.6, z, ry, sx: 1, sy: 1, sz: 1 });
          if (d + 3 <= len + 0.01) {
            const mx = ax + ux * (d + 1.5), mz = az + uz * (d + 1.5), y0 = h(mx, mz);
            rails.push({ x: mx, y: y0 + 1.0, z: mz, ry }, { x: mx, y: y0 + 0.55, z: mz, ry });
          }
        }
      }
    }
    const woodM = new THREE.MeshStandardMaterial({ color: 0x8a6c4a, roughness: 0.9 });
    if (posts.length) group.add(instanced(new THREE.BoxGeometry(0.12, 1.2, 0.12), woodM, posts));
    if (rails.length) group.add(instanced(new THREE.BoxGeometry(3.05, 0.1, 0.05), woodM, rails, false));
    if (stones.length) {
      const sg = lumpy(new THREE.BoxGeometry(1, 1, 1, 3, 2, 2), 0.06, 3);
      group.add(instanced(sg, new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 1 }), stones));
      const cap = stones.map((s) => ({ ...s, y: s.y + 0.5 * s.sy + 0.08, sx: 1.6, sy: 0.18, sz: 0.5, rz: (rng() - 0.5) * 0.3 }));
      group.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 1 }), cap));
    }
    if (c.wallGap) {
      const gg = new THREE.Group();
      const geo = hurdleGeo(c.wallGap.w);
      const m = new THREE.Mesh(geo, vmat());
      m.scale.set(1, 1.2, 1); m.castShadow = true;
      gg.add(m);
      gg.position.set(c.wallGap.x, h(c.wallGap.x, c.wallGap.z), c.wallGap.z - c.wallGap.w / 2);
      gg.rotation.y = -Math.PI / 2;
      group.add(gg);
    }

    // Trees: the named ones plus woods outside the field.
    const trees = [];
    for (const [x, z] of c.trees) trees.push({ x, z, s: 1 + rng() * 0.4 });
    const nWood = c.walls ? 70 : 240;
    for (let i = 0; i < nWood; i++) {
      const side = Math.floor(rng() * 4);
      const out = 8 + rng() * (c.walls ? 140 : 220);
      let x, z;
      if (side === 0) { x = F.x0 - out; z = F.z0 + rng() * (F.z1 - F.z0); }
      else if (side === 1) { x = F.x1 + out; z = F.z0 + rng() * (F.z1 - F.z0); }
      else if (side === 2) { x = F.x0 - 100 + rng() * (F.x1 - F.x0 + 200); z = F.z0 - out; }
      else { x = F.x0 - 100 + rng() * (F.x1 - F.x0 + 200); z = F.z1 + out; }
      if (h(x, z) > 90) continue;
      trees.push({ x, z, s: 0.8 + rng() * 0.8 });
    }
    const trunkG = new THREE.CylinderGeometry(0.22, 0.35, 3, 6); trunkG.translate(0, 1.5, 0);
    const crownG = lumpy(new THREE.IcosahedronGeometry(2.6, 1), 0.12, 2); crownG.scale(1, 1.15, 1); crownG.translate(0, 5.2, 0);
    const tl = trees.map((t) => ({ x: t.x, y: h(t.x, t.z) - 0.2, z: t.z, sx: t.s, sy: t.s, sz: t.s, ry: rng() * 6 }));
    group.add(instanced(trunkG, new THREE.MeshStandardMaterial({ color: 0x4d3a2a, roughness: 1 }), tl));
    const crown = instanced(crownG, new THREE.MeshStandardMaterial({ color: 0x3d5a2a, roughness: 0.95, flatShading: true }), tl);
    group.add(crown);

    // Tussocks and thistles in the field, mostly for a sense of distance.
    const tufts = [];
    const nT = Math.round((F.x1 - F.x0) * (F.z1 - F.z0) / 45);
    for (let i = 0; i < nT; i++) {
      const x = F.x0 + 2 + rng() * (F.x1 - F.x0 - 4), z = F.z0 + 2 + rng() * (F.z1 - F.z0 - 4);
      if (Math.hypot(x, z) < 6) continue;
      const s = 0.5 + rng() * 0.9;
      tufts.push({ x, y: h(x, z), z, sx: s, sy: s * (0.7 + rng() * 0.8), sz: s, ry: rng() * 6 });
    }
    const tuftG = merge([0, 1, 2, 3, 4].map((k) => part(new THREE.ConeGeometry(0.05, 0.38, 3), k === 2 ? 0x7d8f3a : 0x4f6a26, Math.cos(k * 1.3) * 0.08, 0.17, Math.sin(k * 1.3) * 0.08, Math.cos(k) * 0.3, 0, Math.sin(k) * 0.3)));
    group.add(instanced(tuftG, vmat(), tufts, false));

    // Gorse.
    const bushes = [];
    for (const [gx, gz, r] of c.gorse) {
      const n = Math.round(r * r * 0.5);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
        const x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d, s = 0.6 + rng() * 0.7;
        bushes.push({ x, y: h(x, z) + 0.2, z, sx: s, sy: s * 0.75, sz: s, ry: rng() * 6 });
      }
    }
    if (bushes.length) {
      const bg = merge([part(lumpy(new THREE.IcosahedronGeometry(0.9, 1), 0.15, 5), 0x3b4f20, 0, 0.3)]);
      const flowers = [];
      const fp = new THREE.IcosahedronGeometry(0.07, 0);
      for (let k = 0; k < 18; k++) {
        const a = rng() * Math.PI * 2, e = rng() * 1.2;
        flowers.push(part(fp.clone(), 0xf2c919, Math.cos(a) * Math.cos(e) * 0.9, 0.3 + Math.sin(e) * 0.7, Math.sin(a) * Math.cos(e) * 0.9));
      }
      group.add(instanced(merge([bg, ...flowers]), vmat({ flatShading: true }), bushes));
    }

    // Gates.
    const hg = hurdleGeo(2.6);
    const gatePostG = merge([part(new THREE.CylinderGeometry(0.06, 0.07, 1.4, 8), 0xf5f3ec, 0, 0.7), part(new THREE.BoxGeometry(0.02, 0.28, 0.4), 0xd8322a, 0, 1.3, 0.2)]);
    const hurdleMat = vmat();
    for (const g of [c.fetch, ...c.drive]) {
      const tx = -g.nz, tz = g.nx;
      for (const s of [1, -1]) {
        const px = g.x + tx * s * g.w / 2, pz = g.z + tz * s * g.w / 2;
        const post = new THREE.Mesh(gatePostG, vmat());
        post.position.set(px, h(px, pz), pz); post.castShadow = true;
        post.rotation.y = -Math.atan2(g.nz, g.nx);
        group.add(post);
        const hm = new THREE.Mesh(hg, hurdleMat);
        hm.position.set(px, h(px, pz) - 0.05, pz);
        hm.rotation.y = -Math.atan2(tz * s, tx * s);
        hm.castShadow = true;
        group.add(hm);
      }
    }
    // Handler's post.
    const postM = new THREE.Mesh(merge([part(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 8), 0xf5f3ec, 0, 0.8), part(new THREE.BoxGeometry(0.02, 0.3, 0.45), 0x2a62c9, 0, 1.45, 0.23)]), vmat());
    postM.position.set(0, h(0, 0), 0); postM.castShadow = true;
    group.add(postM);

    // Pen.
    const pg = penGeometry(c.pen);
    const penSide = (a, b) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = new THREE.Mesh(hurdleGeo(len), hurdleMat);
      m.position.set(a[0], h(a[0], a[1]), a[1]);
      m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      m.castShadow = true;
      group.add(m);
    };
    penSide(pg.bl, pg.br); penSide(pg.br, pg.fr); penSide(pg.bl, pg.fl);
    const gate = new THREE.Group();
    const gmesh = new THREE.Mesh(hurdleGeo(pg.gateLen), vmat());
    gmesh.castShadow = true;
    gate.add(gmesh);
    gate.position.set(pg.fr[0], h(pg.fr[0], pg.fr[1]), pg.fr[1]);
    const shut = -Math.atan2(pg.fl[1] - pg.fr[1], pg.fl[0] - pg.fr[0]);
    const open = -Math.atan2(pg.fz, pg.fx);
    gate.userData = { shut, open, a: 0 };
    gate.rotation.y = open;
    group.add(gate);
    gateM = gate;

    // Let-out pen in the draw corner.
    const lo = c.draw;
    const lx = Math.min(Math.max(lo.x, F.x0 + 4), F.x1 - 4), lz = Math.min(Math.max(lo.z, F.z0 + 4), F.z1 - 4);
    for (const [ax, az, bx, bz] of [[-3, -3, 3, -3], [3, -3, 3, 3], [-3, 3, -3, -3]]) penSide([lx + ax, lz + az], [lx + bx, lz + bz]);

    // Shedding ring.
    if (c.ring) {
      const dots = [];
      const n = Math.round(c.ring.r * Math.PI * 2 / 1.6);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = c.ring.x + Math.cos(a) * c.ring.r, z = c.ring.z + Math.sin(a) * c.ring.r;
        dots.push({ x, y: h(x, z) + 0.03, z, ry: a });
      }
      group.add(instanced(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 8), new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 1 }), dots, false));
    }

    // Distant hills.
    const hills = new THREE.Group();
    const hm = new THREE.MeshLambertMaterial({ color: c.sky === 'overcast' ? 0x8a948c : c.sky === 'morning' ? 0x9a9a84 : 0x7f9a86, flatShading: true, fog: false });
    const cx = (F.x0 + F.x1) / 2, cz = (F.z0 + F.z1) / 2;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rng() * 0.2, d = 1100 + rng() * 500;
      const hgt = 120 + rng() * 260, rad = 260 + rng() * 260;
      const m = new THREE.Mesh(lumpy(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.1, i), hm);
      m.scale.set(rad, hgt, rad * (0.7 + rng() * 0.5));
      m.position.set(cx + Math.cos(a) * d, -30, cz + Math.sin(a) * d);
      m.rotation.y = rng() * 6;
      hills.add(m);
    }
    group.add(hills);
    return group;
  }

  function buildLines(s) {
    const g = new THREE.Group();
    const c = s.course, h = s.h;
    const mat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.6, gapSize: 1.4, transparent: true, opacity: 0.55, depthWrite: false });
    const path = (pts) => {
      const arr = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
        for (let k = 0; k < n; k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; arr.push(new THREE.Vector3(x, h(x, z) + 0.12, z)); }
      }
      const [lx, lz] = pts[pts.length - 1];
      arr.push(new THREE.Vector3(lx, h(lx, lz) + 0.12, lz));
      const geo = new THREE.BufferGeometry().setFromPoints(arr);
      const l = new THREE.Line(geo, mat);
      l.computeLineDistances();
      return l;
    };
    const pts = [[c.lift.x, c.lift.z], [c.fetch.x, c.fetch.z], [0, 0]];
    for (const d of c.drive) pts.push([d.x, d.z]);
    if (c.drive.length) {
      if (c.ring) pts.push([c.ring.x, c.ring.z]);
      const o = penGeometry(c.pen).outside; pts.push(o);
    } else pts.push(penGeometry(c.pen).outside);
    g.add(path(pts));
    return g;
  }

  function load(s) {
    if (world) { scene.remove(world); world.traverse((o) => { o.geometry?.dispose(); }); }
    for (const m of sheepM) scene.remove(m.root);
    if (dogM) scene.remove(dogM.root);
    if (handlerM) scene.remove(handlerM.root);
    if (lineGroup) scene.remove(lineGroup);
    if (trailLine) scene.remove(trailLine);
    sim = s;
    const c = s.course;
    const S = SKIES[c.sky];
    skyU.top.value.setHex(S.top); skyU.horizon.value.setHex(S.horizon);
    skyU.sunDir.value.set(...S.sunDir).normalize(); skyU.sunCol.value.setHex(S.sun);
    scene.fog = new THREE.Fog(S.horizon, S.fog[0], S.fog[1]);
    hemi.color.setHex(S.hemi[0]); hemi.groundColor.setHex(S.hemi[1]); hemi.intensity = S.hemi[2];
    sun.color.setHex(S.sun); sun.intensity = S.sunI;
    world = buildWorld(c, s.h);
    scene.add(world);
    sheepM = s.sheep.map((sh, i) => makeSheep(i, c.walls));
    for (const m of sheepM) scene.add(m.root);
    dogM = makeDog();
    scene.add(dogM.root);
    handlerM = makeHandler();
    handlerM.root.position.set(-0.6, s.h(-0.6, 0.4), 0.4);
    handlerM.root.rotation.y = Math.PI / 2;
    scene.add(handlerM.root);
    lineGroup = buildLines(s);
    lineGroup.visible = assist;
    scene.add(lineGroup);
    trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 }));
    trailLine.frustumCulled = false;
    scene.add(trailLine);
    if (!balanceRing) {
      balanceRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 32), new THREE.MeshBasicMaterial({ color: 0x9ef0ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      balanceRing.rotation.x = -Math.PI / 2;
      scene.add(balanceRing);
    }
    if (!heardSprite) { heardSprite = new THREE.Group(); scene.add(heardSprite); }
    if (!lostSprite) { lostSprite = textSprite('… lost in the wind', '#ffb4a0'); lostSprite.visible = false; scene.add(lostSprite); }
    ev.heardT = 9; ev.lostT = 9;
    cam.init = false;
  }

  function spriteFor(cmd) {
    if (!sprites[cmd]) sprites[cmd] = textSprite(CMD_NAME[cmd]);
    return sprites[cmd];
  }

  const ev = { heardT: 9, lostT: 9 };
  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'whistle') { whistleT = 0.7; if (e.lost) ev.lostT = 0; }
      if (e.type === 'heard') {
        heardSprite.clear();
        heardSprite.add(spriteFor(e.cmd));
        ev.heardT = 0;
      }
    }
  }

  function placeChar(m, x, z, hd, h) {
    m.root.position.set(x, h(x, z), z);
    m.root.rotation.y = -hd;
  }

  function sync(s, dt, events) {
    handleEvents(events);
    const h = s.h;
    s.sheep.forEach((sh, i) => {
      const m = sheepM[i];
      placeChar(m, sh.x, sh.z, sh.hd, h);
      const v = Math.hypot(sh.vx, sh.vz);
      const sw = Math.sin(sh.gait * 5.5) * Math.min(0.7, v * 0.35);
      m.legs[0].rotation.z = sw; m.legs[3].rotation.z = sw;
      m.legs[1].rotation.z = -sw; m.legs[2].rotation.z = -sw;
      m.body.position.y = Math.abs(Math.sin(sh.gait * 5.5)) * Math.min(0.08, v * 0.02);
      const graze = sh.graze;
      m.neck.rotation.z = -graze * 1.0 + (sh.stamp ? 0.25 : 0) + Math.sin(s.t * 1.7 + i) * 0.05 * graze;
      m.neck.position.y = 0.86 - graze * 0.2;
    });
    const d = s.dog;
    placeChar(dogM, d.x, d.z, d.hd, h);
    const dv = Math.hypot(d.vx, d.vz);
    const gal = Math.sin(d.gait * 3.2);
    const amp = Math.min(0.9, dv * 0.12) * (1 - d.pose);
    dogM.legs[0].rotation.z = gal * amp; dogM.legs[1].rotation.z = gal * amp * 0.8;
    dogM.legs[2].rotation.z = -gal * amp; dogM.legs[3].rotation.z = -gal * amp * 0.8;
    dogM.body.position.y = -d.pose * 0.26 + Math.abs(gal) * Math.min(0.06, dv * 0.01);
    for (let k = 0; k < 4; k++) dogM.legs[k].rotation.z += d.pose * (k < 2 ? 1.35 : -1.2);
    dogM.body.rotation.z = (d.state === 'walk' ? -0.12 : 0) * (1 - d.pose);
    dogM.neck.rotation.z = d.state === 'walk' ? -0.3 : d.pose * -0.1;
    dogM.tail.rotation.z = Math.sin(s.t * 6) * 0.15 * (d.state === 'heel' ? 1 : 0.3) - (d.state === 'walk' ? 0.4 : 0);

    whistleT = Math.max(0, whistleT - dt);
    handlerM.armR.rotation.x = 0;
    handlerM.armR.rotation.z = whistleT > 0 ? 2.5 : 0.1;
    handlerM.armL.rotation.z = 0.15;

    ev.heardT += dt; ev.lostT += dt;
    heardSprite.visible = labels && !s.result && ev.heardT < 1.6;
    const camDist = camera.position.distanceTo(dogM.root.position);
    const sc = THREE.MathUtils.clamp(camDist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.07, 0.45, 2.4);
    heardSprite.position.set(d.x, h(d.x, d.z) + 1.4 + sc * 0.6, d.z);
    heardSprite.scale.setScalar(sc);
    heardSprite.children.forEach((c) => (c.material.opacity = Math.min(1, (1.6 - ev.heardT) * 3)));
    lostSprite.visible = labels && !s.result && ev.lostT < 1.6;
    const hs = THREE.MathUtils.clamp(camera.position.distanceTo(handlerM.root.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.07, 0.45, 2.4);
    lostSprite.position.set(0, h(0, 0) + 2.6 + hs * 0.5, 0);
    lostSprite.scale.set(4 * hs, hs, 1);

    const gd = gateM.userData;
    gd.a += ((s.gateClosed ? 1 : 0) - gd.a) * Math.min(1, dt * 3);
    gateM.rotation.y = gd.open + (gd.shut - gd.open) * gd.a;

    if (s.trail.length > 1) {
      const pts = s.trail.map(([x, z]) => new THREE.Vector3(x, h(x, z) + 0.2, z));
      pts.push(new THREE.Vector3(s.flock.x, h(s.flock.x, s.flock.z) + 0.2, s.flock.z));
      trailLine.geometry.dispose();
      trailLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      trailLine.visible = assist;
    } else trailLine.visible = false;

    const showBal = assist && ['lift', 'fetch', 'drive', 'shed', 'pen'].includes(s.phase);
    balanceRing.visible = showBal;
    if (showBal) {
      const T = currentTarget(s), F = s.flock;
      let ux = F.x - T.x, uz = F.z - T.z; const n = Math.hypot(ux, uz) || 1;
      const R = flankRadius(s);
      const bx = F.x + ux / n * R, bz = F.z + uz / n * R;
      balanceRing.position.set(bx, h(bx, bz) + 0.15, bz);
      balanceRing.material.opacity = 0.45 + 0.3 * Math.sin(s.t * 4) ** 2;
    }
    updateCamera(s, dt);
  }

  const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
  function updateCamera(s, dt) {
    const h = s.h, F = s.flock, d = s.dog;
    const fy = h(F.x, F.z), dy = h(d.x, d.z);
    let pos, look, fov;
    const k = cam.init ? 1 - Math.exp(-dt * 2.2) : 1;
    if (cam.mode === 'post') {
      pos = _v.set(0.8, h(0, 0) + 4.2 + 2.5 * cam.zoom, 9 + 5 * cam.zoom);
      const w = s.phase === 'ready' ? 1 : 0.62;
      look = new THREE.Vector3(F.x * w + d.x * (1 - w), (fy + 0.8) * w + (dy + 0.5) * (1 - w), F.z * w + d.z * (1 - w));
      // Narrow the lens until the flock and the dog both fit: binoculars.
      _f.copy(look).sub(pos).normalize();
      _r.crossVectors(_f, new THREE.Vector3(0, 1, 0)).normalize();
      _u.crossVectors(_r, _f);
      let need = 0.08;
      const pts = [[F.x, fy + 1, F.z], [d.x, dy + 0.6, d.z]];
      for (const sh of s.sheep) pts.push([sh.x, h(sh.x, sh.z) + 0.8, sh.z]);
      for (const [x, y, z] of pts) {
        const vx = x - pos.x, vy = y - pos.y, vz = z - pos.z;
        const fz = vx * _f.x + vy * _f.y + vz * _f.z;
        if (fz < 1) continue;
        const ax = Math.abs(vx * _r.x + vy * _r.y + vz * _r.z) / fz / camera.aspect;
        const ay = Math.abs(vx * _u.x + vy * _u.y + vz * _u.z) / fz;
        need = Math.max(need, ax, ay);
      }
      fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(need * 1.35 + 0.02)), 9, 62);
    } else if (cam.mode === 'judge') {
      const fx = F.x * 0.7 + d.x * 0.3, fz = F.z * 0.7 + d.z * 0.3;
      const spread = Math.max(18, Math.hypot(F.x - d.x, F.z - d.z) * 0.9 + F.far);
      const dist = spread * 1.6 * cam.zoom + 10;
      look = new THREE.Vector3(fx, h(fx, fz), fz);
      pos = new THREE.Vector3(fx + dist * 0.35, look.y + dist * 0.95, fz + dist * 0.75);
      fov = 45;
    } else {
      let bx = d.x - F.x, bz = d.z - F.z; const bn = Math.hypot(bx, bz) || 1;
      bx /= bn; bz /= bn;
      const back = 7 * cam.zoom;
      pos = new THREE.Vector3(d.x + bx * back, dy + 3.2 * cam.zoom, d.z + bz * back);
      pos.y = Math.max(pos.y, h(pos.x, pos.z) + 1.5);
      look = new THREE.Vector3(F.x * 0.7 + d.x * 0.3, fy + 0.6, F.z * 0.7 + d.z * 0.3);
      fov = 55;
    }
    if (!cam.init) { cam.pos.copy(pos); cam.look.copy(look); cam.fov = fov; cam.init = true; }
    cam.pos.lerp(pos, k);
    cam.look.lerp(look, k);
    cam.fov += (fov - cam.fov) * k;
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    const sd = skyU.sunDir.value;
    sun.target.position.copy(cam.look);
    sun.position.copy(cam.look).addScaledVector(sd, 200);
    // Shadow box follows what you are looking at.
    const span = cam.mode === 'judge' ? 70 : 50;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix();
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, hh = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  return {
    load, sync,
    render() { renderer.render(scene, camera); },
    setCam(m) { cam.mode = m; cam.init = false; },
    get camMode() { return cam.mode; },
    zoom(f) { cam.zoom = THREE.MathUtils.clamp(cam.zoom * f, 0.4, 3); },
    setLabels(l) { labels = l; },
    setAssist(a) { assist = a; if (lineGroup) lineGroup.visible = a; },
    resetCamera() { cam.init = false; },
  };
}
