// Three.js view of the yard. Reads the sim; never writes to it.
import * as THREE from '../vendor/three.module.js';
import * as T from './track.js';
import { TYPES, blockById } from './shifts.js';
import { pathBits, leafOf } from './sim.js';

const GAUGE = 0.7175;
const BASE = 1.2;

function trackHalfWidth(x) {
  if (x < T.NODES[0]) return 7;
  if (x < T.CLEAR) return 7 + 16 * Math.min(1, (x - T.NODES[0]) / (T.CLEAR - T.NODES[0]));
  return 23;
}
function groundH(x, z) {
  const xs = Math.min(Math.max(x, T.APPROACH), 700);
  const top = T.height(xs) - 0.45;
  const hw = x > 700 || x < T.APPROACH - 10 ? 0 : trackHalfWidth(xs);
  const d = Math.abs(z) - hw;
  const u = d <= 0 ? 0 : d >= 26 ? 1 : (d / 26) * (d / 26) * (3 - 2 * d / 26);
  const far = BASE + 0.6 * Math.sin(x * 0.011 + z * 0.02) + 0.4 * Math.sin(z * 0.035 - x * 0.004);
  return top * (1 - u) + Math.min(far, far) * u;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 4000);

  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a5040, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d8, 1.8);
  sun.position.set(-300, 400, -250);
  scene.add(sun);
  scene.fog = new THREE.Fog(0xb9c9d8, 400, 1500);

  // Sky dome with a vertical gradient.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x6f9fd0) }, mid: { value: new THREE.Color(0xc9dbe8) }, bot: { value: new THREE.Color(0xd9d2c0) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*2.2,0.0,1.0),0.7)) : mix(mid, bot, clamp(-h*6.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat);
  scene.add(sky);

  // ---------- ground ----------
  const GW = 1500, GD = 700;
  const gGeo = new THREE.PlaneGeometry(GW, GD, 300, 120);
  gGeo.rotateX(-Math.PI / 2);
  gGeo.translate(150, 0, 0);
  {
    const p = gGeo.attributes.position, col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundH(x, z));
      const near = Math.abs(z) < trackHalfWidth(Math.min(Math.max(x, T.APPROACH), 700)) + 4 && x > T.APPROACH - 10 && x < 690;
      if (near) c.setRGB(0.42, 0.40, 0.37);
      else {
        const n = 0.5 + 0.5 * Math.sin(x * 0.05 + Math.sin(z * 0.07) * 2) * Math.sin(z * 0.043);
        c.setRGB(0.36 + 0.08 * n, 0.45 + 0.07 * n, 0.27);
      }
      col.set([c.r, c.g, c.b], i * 3);
    }
    gGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    gGeo.computeVertexNormals();
  }
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(gGeo, groundMat));

  // ---------- track ----------
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8c8784 });
  const ballastMat = new THREE.MeshLambertMaterial({ color: 0x7d766c });
  const sleeperMat = new THREE.MeshLambertMaterial({ color: 0x4a3b2e });
  const segs = [{ a: T.APPROACH, b: T.NODES[0], bits: [0, 0, 0], leaf: -1 }];
  for (let b1 = 0; b1 < 2; b1++) segs.push({ a: T.NODES[0], b: T.NODES[1], bits: [b1, 0, 0], leaf: -1 });
  for (let b1 = 0; b1 < 2; b1++) for (let b2 = 0; b2 < 2; b2++) segs.push({ a: T.NODES[1], b: T.NODES[2], bits: [b1, b2, 0], leaf: -1 });
  for (let L = 0; L < T.N_TRACKS; L++) segs.push({ a: T.NODES[2], b: T.TRACK_END[L] + 4, bits: T.leafBits(L), leaf: L });

  const rails = [], ballast = [], sleepers = [];
  const frame = (s, bits, leaf) => {
    const [x, y, z] = T.point(s, bits, leaf);
    const h = T.yaw(s, bits);
    return { x, y, z, h, nx: -Math.sin(h), nz: Math.cos(h) };
  };
  for (const g of segs) {
    const n = Math.ceil((g.b - g.a) / 2);
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(frame(g.a + ((g.b - g.a) * i) / n, g.bits, g.leaf));
    // ballast shoulder: top at y-0.05, width 3.4, toes at 4.8
    const prof = [[-2.6, -0.5], [-1.7, -0.06], [1.7, -0.06], [2.6, -0.5]];
    ballast.push(strip(pts, prof));
    for (const side of [-1, 1]) {
      const o = side * GAUGE;
      rails.push(strip(pts, [[o - 0.04, 0.12], [o - 0.04, 0.27], [o + 0.04, 0.27], [o + 0.04, 0.12]]));
    }
    for (let s = g.a; s < g.b; s += 0.95) sleepers.push(frame(s, g.bits, g.leaf));
  }
  function strip(pts, prof) {
    const pos = [], idx = [];
    for (const p of pts) for (const [o, dy] of prof) pos.push(p.x + p.nx * o, p.y + dy, p.z + p.nz * o);
    const m = prof.length;
    for (let i = 0; i < pts.length - 1; i++)
      for (let k = 0; k < m - 1; k++) {
        const a = i * m + k, b = a + 1, c = a + m, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    return { pos, idx };
  }
  function merge(list) {
    const pos = [], idx = [];
    for (const g of list) {
      const base = pos.length / 3;
      pos.push(...g.pos);
      for (const i of g.idx) idx.push(i + base);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  const ballastMesh = new THREE.Mesh(merge(ballast), ballastMat);
  ballastMat.side = THREE.DoubleSide;
  scene.add(ballastMesh);
  scene.add(new THREE.Mesh(merge(rails), railMat));
  {
    const geo = new THREE.BoxGeometry(0.24, 0.14, 2.5);
    const im = new THREE.InstancedMesh(geo, sleeperMat, sleepers.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    sleepers.forEach((p, i) => {
      e.set(0, -p.h, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, p.y + 0.05, p.z), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m);
    });
    scene.add(im);
  }

  // Bumpers.
  const bumperMat = new THREE.MeshLambertMaterial({ color: 0xc23b2a });
  for (let L = 0; L < T.N_TRACKS; L++) {
    const [x, y, z] = T.point(T.TRACK_END[L] + 1.2, T.leafBits(L), L);
    const g = new THREE.Group();
    const blk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 3.0), bumperMat);
    blk.position.y = 0.8;
    g.add(blk);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 3.05), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.y = 1.1;
    g.add(stripe);
    g.position.set(x, y, z);
    scene.add(g);
  }

  // ---------- retarders ----------
  const retOff = new THREE.Color(0x3b3f45), retOn = new THREE.Color(0xff3b22);
  const masterMat = new THREE.MeshLambertMaterial({ color: 0x3b3f45, emissive: 0x000000 });
  const trackMat = new THREE.MeshLambertMaterial({ color: 0x3b3f45, emissive: 0x000000 });
  const retBeams = { master: [], track: [] };
  function retarder(a, b, bits, leaf, mat, list) {
    for (const side of [-1, 1]) for (const inner of [0.45, 0.98]) {
      const pts = [];
      for (let s = a; s <= b + 0.01; s += 2.5) pts.push(frame(s, bits, leaf));
      const o = side * inner;
      const geo = merge([strip(pts, [[o - 0.07, 0.1], [o - 0.07, 0.36], [o + 0.07, 0.36], [o + 0.07, 0.1]])]);
      const m = new THREE.Mesh(geo, mat);
      scene.add(m);
      list.push(m);
    }
  }
  retarder(T.MASTER[0], T.MASTER[1], [0, 0, 0], -1, masterMat, retBeams.master);
  for (let L = 0; L < T.N_TRACKS; L++) retarder(T.TRACK_RET[0], T.TRACK_RET[1], T.leafBits(L), L, trackMat, retBeams.track);

  // ---------- switch stands ----------
  const stands = [];
  const lampGeo = new THREE.SphereGeometry(0.32, 12, 8);
  for (let i = 0; i < 7; i++) {
    const { k, prefix } = T.switchNode(i);
    const bits = [...prefix, 0, 0, 0].slice(0, 3);
    const s = T.NODES[k];
    const [x, y, z] = T.point(s - 2, bits);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    pole.position.y = 0.9;
    g.add(pole);
    const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x55ff66 }));
    lamp.position.y = 1.9;
    g.add(lamp);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    arm.position.y = 1.5;
    g.add(arm);
    g.position.set(x, y, z + (k === 0 ? 2.6 : 0));
    scene.add(g);
    stands.push({ g, lamp, arm, k });
  }

  // ---------- buildings, lights, scenery ----------
  const concrete = new THREE.MeshLambertMaterial({ color: 0xb8b2a6 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x284055, emissive: 0x000000 });
  const tower = new THREE.Group();
  {
    const base = new THREE.Mesh(new THREE.BoxGeometry(7, 14, 7), concrete);
    base.position.y = 7;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 9), glass);
    cab.position.y = 16;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 10), concrete);
    roof.position.y = 18.3;
    tower.add(base, cab, roof);
    tower.position.set(30, groundH(30, -34), -34);
    scene.add(tower);
  }
  const lightHeads = [];
  const headMat = new THREE.MeshBasicMaterial({ color: 0x777777 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
  const lightSpots = [[60, 16], [180, -30], [330, 30], [480, -30], [620, 30], [-120, 14], [330, -30], [480, 30]];
  for (const [x, z] of lightSpots) {
    const y0 = groundH(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 30, 8), poleMat);
    pole.position.set(x, y0 + 15, z);
    const head = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 2), headMat);
    head.position.set(x, y0 + 30, z);
    scene.add(pole, head);
    lightHeads.push(head);
  }
  const nightLights = [];
  for (const [x, z] of [[60, 16], [200, -30], [360, 30], [520, -30], [-100, 14]]) {
    const l = new THREE.PointLight(0xffc27a, 0, 260, 1.2);
    l.position.set(x, groundH(x, z) + 28, z);
    scene.add(l);
    nightLights.push(l);
  }
  // Sheds and warehouses around the yard.
  const shedMats = [0x9a8f7f, 0x7d8a92, 0xa58a6a, 0x8b7d7d].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const sheds = [[-60, -70, 60, 14, 26], [150, 80, 90, 12, 30], [420, -90, 120, 16, 40], [600, 95, 70, 10, 30], [-260, 60, 80, 12, 34], [760, -40, 50, 18, 50]];
  sheds.forEach(([x, z, w, h, d], i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shedMats[i % shedMats.length]);
    m.position.set(x, groundH(x, z) + h / 2 - 0.5, z);
    scene.add(m);
  });
  {
    const trunk = new THREE.ConeGeometry(4, 13, 7);
    const mat = new THREE.MeshLambertMaterial({ color: 0x3c5a34 });
    const pts = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    while (pts.length < 220) {
      const x = -500 + rnd() * 1400, z = (rnd() < 0.5 ? -1 : 1) * (95 + rnd() * 230);
      pts.push([x, z, 0.7 + rnd() * 0.8]);
    }
    const im = new THREE.InstancedMesh(trunk, mat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, z, k], i) => {
      m.makeScale(k, k, k);
      m.setPosition(x, groundH(x, z) + 6 * k, z);
      im.setMatrixAt(i, m);
    });
    scene.add(im);
  }

  // Track number boards at the bowl entrance.
  const boards = [];
  for (let L = 0; L < T.N_TRACKS; L++) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
    const [x, y, z] = T.point(T.TRACK_RET[1] + 6, T.leafBits(L), L);
    sp.position.set(x, y + 3.2, z);
    sp.scale.set(2.6, 2.6, 1);
    scene.add(sp);
    boards.push({ c, tex, key: '' });
  }
  function drawBoard(L, blk) {
    const b = boards[L];
    const key = blk || '-';
    if (b.key === key) return;
    b.key = key;
    const g = b.c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = blk ? blockById[blk].color : '#555';
    g.beginPath(); g.roundRect(8, 8, 112, 112, 18); g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(L + 1), 64, 70);
    g.font = 'bold 26px system-ui, sans-serif';
    g.fillText(blk || 'spare', 64, 106);
    b.tex.needsUpdate = true;
  }

  // ---------- rolling stock ----------
  const geoCache = new Map(), matCache = new Map();
  const mat = (hex, emissive = 0) => {
    const k = hex + ':' + emissive;
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color: hex, emissive }));
    return matCache.get(k);
  };
  const geo = (k, f) => (geoCache.has(k) ? geoCache.get(k) : (geoCache.set(k, f()), geoCache.get(k)));
  const PAINT = {
    box: [0x8a3b22, 0x6b4a2f, 0x2f5d62, 0x3d5a3a, 0x2e4a6b, 0x7a2b2b],
    hopper: [0x8a8f94, 0xb59a6a, 0x5d6b78, 0x9b5a3a],
    tank: [0x1f1f1f, 0xd8d8d8, 0x2b2b2b],
    autorack: [0xa9b0b8, 0xd9dde0, 0x8a939c],
  };
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  function buildCar(c) {
    const t = TYPES[c.type];
    const L = c.len, H = t.h;
    const g = new THREE.Group();
    const pal = PAINT[c.type];
    const paint = mat(pal[Math.floor(c.paint * pal.length)]);
    const dark = mat(0x1d1d1f);
    const truckGeo = geo('truck', () => new THREE.BoxGeometry(2.8, 0.9, 2.3));
    for (const sx of [-1, 1]) {
      const tr = new THREE.Mesh(truckGeo, dark);
      tr.position.set(sx * (L / 2 - 2.6), 0.75, 0);
      g.add(tr);
    }
    const deck = new THREE.Mesh(geo('deck' + L, () => new THREE.BoxGeometry(L - 0.6, 0.35, 2.9)), dark);
    deck.position.y = 1.35;
    g.add(deck);
    const coup = geo('coup', () => new THREE.BoxGeometry(0.7, 0.3, 0.4));
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(coup, dark);
      m.position.set(sx * (L / 2 - 0.1), 1.05, 0);
      g.add(m);
    }
    if (c.type === 'box') {
      const b = new THREE.Mesh(geo('box' + L, () => new THREE.BoxGeometry(L - 1, H - 1.5, 3.05)), paint);
      b.position.y = 1.5 + (H - 1.5) / 2;
      const door = new THREE.Mesh(geo('door', () => new THREE.BoxGeometry(3.2, H - 2.0, 3.12)), mat(0x2a2a2a));
      door.position.y = 1.5 + (H - 2.0) / 2 + 0.1;
      g.add(b, door);
    } else if (c.type === 'hopper') {
      const b = new THREE.Mesh(geo('hop' + L, () => new THREE.BoxGeometry(L - 1.2, 2.0, 3.05)), paint);
      b.position.y = 2.65;
      g.add(b);
      const bay = geo('bay', () => new THREE.ConeGeometry(1.4, 1.3, 4));
      for (const sx of [-0.28, 0, 0.28]) {
        const m = new THREE.Mesh(bay, paint);
        m.rotation.set(Math.PI, Math.PI / 4, 0);
        m.position.set(sx * L, 1.25, 0);
        g.add(m);
      }
    } else if (c.type === 'tank') {
      const b = new THREE.Mesh(geo('tank' + L, () => new THREE.CylinderGeometry(1.45, 1.45, L - 1.6, 18).rotateZ(Math.PI / 2)), paint);
      b.position.y = 2.75;
      const dome = new THREE.Mesh(geo('dome', () => new THREE.CylinderGeometry(0.55, 0.6, 0.6, 12)), paint);
      dome.position.y = 4.35;
      const walk = new THREE.Mesh(geo('walk' + L, () => new THREE.BoxGeometry(L - 1, 0.08, 3.2)), dark);
      walk.position.y = 1.7;
      g.add(b, dome, walk);
    } else {
      const b = new THREE.Mesh(geo('ar' + L, () => new THREE.BoxGeometry(L - 0.8, H - 1.5, 3.1)), paint);
      b.position.y = 1.5 + (H - 1.5) / 2;
      const band = geo('arb' + L, () => new THREE.BoxGeometry(L - 1.2, 0.35, 3.14));
      for (const y of [2.4, 3.3, 4.2, 5.1]) {
        const m = new THREE.Mesh(band, mat(0x6d747c));
        m.position.y = y;
        g.add(m);
      }
      g.add(b);
    }
    // Block colour: a band along each side and a square placard.
    const blk = blockById[c.block];
    const bc = mat(new THREE.Color(blk.color).getHex(), 0x111111);
    const bandY = c.type === 'tank' ? 2.75 : Math.min(H - 0.55, 3.6);
    const band = new THREE.Mesh(geo('band' + L, () => new THREE.BoxGeometry(L * 0.5, 0.45, 3.2)), bc);
    band.position.y = bandY;
    g.add(band);
    const roof = new THREE.Mesh(geo('roof', () => new THREE.BoxGeometry(2.2, 0.08, 2.2)), bc);
    roof.position.y = c.type === 'tank' ? 4.25 : c.type === 'hopper' ? 3.7 : H + 0.05;
    roof.position.x = -L / 2 + 2;
    g.add(roof);
    const sh = new THREE.Mesh(geo('sh' + L, () => new THREE.PlaneGeometry(L + 0.6, 3.6).rotateX(-Math.PI / 2)), shadowMat);
    sh.position.y = 0.32;
    g.add(sh);
    const dmg = new THREE.Mesh(geo('dmg', () => new THREE.OctahedronGeometry(0.6)), mat(0xff2222, 0x881111));
    dmg.position.y = (c.type === 'tank' ? 4.4 : H) + 1.4;
    dmg.visible = false;
    g.add(dmg);
    g.userData.dmg = dmg;
    scene.add(g);
    return g;
  }

  // Pusher locomotive.
  const loco = new THREE.Group();
  {
    const orange = mat(0xe8742a), dark = mat(0x1d1d1f);
    const body = new THREE.Mesh(new THREE.BoxGeometry(16, 2.6, 2.9), orange);
    body.position.set(-1.5, 2.8, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 3.6, 3.1), orange);
    cab.position.set(5.5, 3.3, 0);
    const win = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.9, 3.15), mat(0x223344));
    win.position.set(5.5, 4.2, 0);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(20.5, 0.5, 3.1), dark);
    deck.position.y = 1.35;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(16.1, 0.3, 2.95), mat(0xf6e27a));
    stripe.position.set(-1.5, 2.0, 0);
    loco.add(body, cab, win, deck, stripe);
    for (const sx of [-1, 1]) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 2.4), dark);
      tr.position.set(sx * 6.5, 0.8, 0);
      loco.add(tr);
    }
    loco.userData.len = 21;
    scene.add(loco);
  }

  // Prediction ghost: a ring on the track and a light column.
  const ghost = new THREE.Group();
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.85, depthWrite: false });
  const ghostCol = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.25, depthWrite: false });
  {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.18, 8, 32).rotateX(Math.PI / 2), ghostMat);
    ring.position.y = 0.5;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 10, 1, true), ghostCol);
    col.position.y = 7;
    ghost.add(ring, col);
  }
  ghost.visible = false;
  scene.add(ghost);

  // ---------- camera ----------
  const MODES = [
    { name: 'Tower', target: [175, 1, 0], pos: [32, 30, -40] },
    { name: 'Crest', target: [48, 3, 0], pos: [-8, 22, 40] },
    { name: 'Follow', target: null, pos: [-34, 13, 22] },
    { name: 'Bowl', target: [430, 0, 0], pos: [330, 100, -150] },
  ];
  const cam = { mode: 0, yaw: 0, pitch: 0, zoom: 1 };
  const curPos = new THREE.Vector3(), curTgt = new THREE.Vector3();
  let snap = true;
  let followTarget = null;

  const carMeshes = new Map();
  const tmp = new THREE.Vector3();

  function placeCar(g, s, bits, leaf, len) {
    const [x, y, z] = T.point(s, bits, leaf);
    const y2 = T.height(s + len / 2 - 2.5, leaf), y1 = T.height(s - len / 2 + 2.5, leaf);
    g.position.set(x, (y1 + y2) / 2, z);
    g.rotation.set(0, -T.yaw(s, bits), Math.atan2(y2 - y1, len - 5), 'YZX');
  }

  function update(S, ui, dt) {
    const night = S.shift.night;
    // lighting
    hemi.intensity = night ? 0.35 : 1.4;
    hemi.color.set(night ? 0x8090b0 : 0xcfe3ff);
    sun.intensity = night ? 0.08 : 1.8;
    skyMat.uniforms.top.value.set(night ? 0x060a18 : 0x6f9fd0);
    skyMat.uniforms.mid.value.set(night ? 0x18203a : 0xc9dbe8);
    skyMat.uniforms.bot.value.set(night ? 0x1a1a22 : 0xd9d2c0);
    scene.fog.color.set(night ? 0x0d1220 : 0xb9c9d8);
    scene.fog.near = night ? 200 : 400;
    for (const l of nightLights) l.intensity = night ? 110 : 0;
    headMat.color.set(night ? 0xffe0a0 : 0x777777);
    glass.emissive.set(night ? 0x705c30 : 0x000000);

    // retarders
    const mOn = S.input.master, tOn = S.input.track;
    masterMat.emissive.copy(mOn ? retOn : new THREE.Color(0)).multiplyScalar(mOn ? 0.8 : 0);
    masterMat.color.copy(mOn ? retOn : retOff);
    trackMat.emissive.copy(tOn ? retOn : new THREE.Color(0)).multiplyScalar(tOn ? 0.8 : 0);
    trackMat.color.copy(tOn ? retOn : retOff);
    for (const m of retBeams.master) m.position.y = mOn ? 0.06 : 0;
    for (const m of retBeams.track) m.position.y = tOn ? 0.06 : 0;

    // switches
    stands.forEach((st, i) => {
      const v = S.switches[i];
      st.arm.rotation.y = v ? -0.6 : 0.6;
      const recent = S.t - S.swT[i] < 0.6;
      st.lamp.material.color.set(recent ? 0xffffff : v ? 0xffb43a : 0x55ff66);
    });
    for (let L = 0; L < T.N_TRACKS; L++) drawBoard(L, S.assign[L]);

    // cars
    const alive = new Set();
    const put = (c, s, bits, leaf) => {
      let g = carMeshes.get(c.id);
      if (!g) { g = buildCar(c); carMeshes.set(c.id, g); }
      placeCar(g, s, bits, leaf, c.len);
      g.userData.dmg.visible = !!c.damaged;
      if (c.damaged) g.userData.dmg.rotation.y += dt * 3;
      alive.add(c.id);
    };
    let follow = null;
    for (const b of S.bodies) {
      const bits = pathBits(S, b);
      const leaf = leafOf(b);
      let off = 0;
      for (const c of b.cars) { put(c, b.s - off - c.len / 2, bits, leaf); off += c.len; }
      if (!b.pre && b.v > 0.05 && (!follow || b.born > follow.born)) follow = b;
    }
    let trainEnd = null;
    if (S.train) {
      let off = 0;
      for (const cut of S.train.cuts) for (const c of cut.cars) { put(c, S.train.front - off - c.len / 2, [0, 0, 0], -1); off += c.len; }
      trainEnd = S.train.front - off;
    }
    for (const [id, g] of carMeshes) if (!alive.has(id)) { scene.remove(g); carMeshes.delete(id); }
    loco.visible = trainEnd != null;
    if (trainEnd != null) placeCar(loco, trainEnd - loco.userData.len / 2, [0, 0, 0], -1, loco.userData.len);

    // ghost
    const p = ui.prediction;
    ghost.visible = !!(ui.assist && p && p.body);
    if (ghost.visible) {
      const bits = pathBits(S, p.body);
      const [x, y, z] = T.point(p.s, bits, p.leaf);
      ghost.position.set(x, y, z);
      const col = p.cls === 'good' ? 0x44ff88 : p.cls === 'firm' ? 0xffc23a : p.cls === 'stall' ? 0x66aaff : 0xff4433;
      ghostMat.color.set(col);
      ghostCol.color.set(col);
      ghost.rotation.y += dt * 1.5;
    }

    // camera
    const M = MODES[cam.mode];
    let tgt;
    if (M.target) tgt = tmp.set(...M.target);
    else {
      if (follow) followTarget = follow;
      const f = followTarget && S.bodies.includes(followTarget) ? followTarget : follow;
      if (f) { const [x, y, z] = T.point(f.s - f.len / 2, pathBits(S, f), leafOf(f)); tgt = tmp.set(x, y + 2, z); }
      else tgt = tmp.set(10, 5, 0);
    }
    const base = new THREE.Vector3(...(M.target ? M.pos : [tgt.x + M.pos[0], tgt.y + M.pos[1], tgt.z + M.pos[2]])).sub(tgt);
    const r = base.length() * cam.zoom;
    const yaw0 = Math.atan2(base.z, base.x) + cam.yaw;
    const pit0 = Math.min(1.45, Math.max(0.03, Math.asin(base.y / base.length()) + cam.pitch));
    const want = new THREE.Vector3(tgt.x + r * Math.cos(pit0) * Math.cos(yaw0), tgt.y + r * Math.sin(pit0), tgt.z + r * Math.cos(pit0) * Math.sin(yaw0));
    const gy = groundH(want.x, want.z) + 2;
    if (want.y < gy) want.y = gy;
    const k = snap ? 1 : 1 - Math.exp(-dt * 4);
    curPos.lerp(want, k);
    curTgt.lerp(tgt, k);
    snap = false;
    camera.position.copy(curPos);
    camera.lookAt(curTgt);
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 68 : 50;
    camera.updateProjectionMatrix();
  }

  function project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight, vis: v.z < 1 && v.z > -1 };
  }

  function reset() {
    for (const g of carMeshes.values()) scene.remove(g);
    carMeshes.clear();
    followTarget = null;
    snap = true;
  }

  return {
    update, resize, project, reset, cam, MODES,
    setMode(m) { cam.mode = m; cam.yaw = 0; cam.pitch = 0; cam.zoom = 1; snap = true; },
    snapCam() { snap = true; },
  };
}
