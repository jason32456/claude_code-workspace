import * as THREE from '../vendor/three.module.js';
import { D2R, dirOf } from './world.js';
import { ENTRANCE, isOpen } from './sim.js';

const PALETTE = {
  meadow: { lo: '#5f8f3a', hi: '#9cc05a', fog: '#cfe3ec', sky: '#7fb6e4' },
  orchard: { lo: '#567f33', hi: '#8fb752', fog: '#d6e6ea', sky: '#79b0e2' },
  heath: { lo: '#6b7a37', hi: '#a89a55', fog: '#e6dccb', sky: '#88b4d8' },
};

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e8a91c'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 4; i++) { g.fillStyle = '#231a10'; g.fillRect(0, 128 + i * 32, 64, 15); }
  g.fillStyle = '#231a10'; g.fillRect(0, 240, 64, 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function radialTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  const col = new THREE.Color(color);
  const css = (a) => `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`;
  gr.addColorStop(0, css(0.55)); gr.addColorStop(0.7, css(0.4)); gr.addColorStop(1, css(0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  // speckle
  const r = mulberry(color.length * 97);
  for (let i = 0; i < 700; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * 58;
    g.fillStyle = css(0.5 + r() * 0.5);
    g.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2, 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function combTexture() {
  const R = 30, COLS = 20, ROWS = 12;
  const W = Math.round(Math.sqrt(3) * R * COLS), H = 3 * R * ROWS;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#4a2c0c'; g.fillRect(0, 0, W, H);
  const w = W / COLS, rnd = mulberry(5);
  const kinds = [];
  for (let row = 0; row < ROWS * 2; row++) for (let col = 0; col < COLS; col++) kinds.push(rnd());
  for (let row = -1; row <= ROWS * 2; row++) {
    for (let col = -1; col <= COLS; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * 1.5 * R;
      const kind = kinds[((row + ROWS * 2) % (ROWS * 2)) * COLS + ((col + COLS) % COLS)];
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3)); }
      g.closePath();
      const gr = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, R);
      if (kind < 0.3) { gr.addColorStop(0, '#d9a548'); gr.addColorStop(1, '#a8701c'); }
      else if (kind < 0.6) { gr.addColorStop(0, '#c48a34'); gr.addColorStop(0.5, '#86500e'); gr.addColorStop(1, '#5a3008'); }
      else { gr.addColorStop(0, '#2a1806'); gr.addColorStop(1, '#5e3a12'); }
      g.fillStyle = gr; g.fill();
      g.lineWidth = 5; g.strokeStyle = '#c99c58'; g.stroke();
      if (kind < 0.3) { g.fillStyle = 'rgba(255,240,200,0.35)'; g.beginPath(); g.arc(cx - 8, cy - 9, 5, 0, 7); g.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

const STRIPES = typeof document !== 'undefined' ? stripeTexture() : null;
const dashTexture = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 4;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 4);
  const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#000'); gr.addColorStop(0.35, '#fff'); gr.addColorStop(0.55, '#fff'); gr.addColorStop(0.7, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();

export function makeBee(opts = {}) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: '#8a5a22', roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1b140d', roughness: 0.5 });
  const abd = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: STRIPES, roughness: 0.7 }));
  abd.scale.set(0.62, 0.58, 0.95); abd.position.set(0, -0.02, 0.42); g.add(abd);
  const th = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), fur); th.position.set(0, 0.02, -0.1); g.add(th);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), dark); hd.scale.set(1, 0.95, 0.8); hd.position.set(0, 0, -0.42); g.add(hd);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.2, metalness: 0.3 }));
    eye.scale.set(0.6, 1, 0.8); eye.position.set(s * 0.15, 0.04, -0.44); g.add(eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 4), dark);
    ant.position.set(s * 0.07, 0.2, -0.6); ant.rotation.set(-0.9, 0, s * 0.35); g.add(ant);
    for (let k = 0; k < 3; k++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.42, 4), dark);
      leg.position.set(s * 0.22, -0.2, -0.22 + k * 0.14); leg.rotation.set(0.3 * (k - 1), 0, s * 0.9); g.add(leg);
    }
  }
  const pollen = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: '#a05a00' }));
  const pollen2 = pollen.clone(); pollen.position.set(-0.27, -0.25, 0.08); pollen2.position.set(0.27, -0.25, 0.08);
  g.add(pollen, pollen2);
  const wingMat = new THREE.MeshStandardMaterial({ color: '#eef6ff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, roughness: 0.1, depthWrite: false });
  const wings = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(s * 0.1, 0.22, -0.08);
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), wingMat);
    w.rotation.x = -Math.PI / 2; w.scale.set(0.42, 1, 1); w.position.set(s * 0.32, 0, 0.18);
    hinge.add(w); g.add(hinge); wings.push({ hinge, s });
  }
  g.userData = { wings, pollen: [pollen, pollen2], abd };
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

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 6000);
  let scene, sim, world = null;
  const sunLight = new THREE.DirectionalLight('#fff3dc', 2.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunLight.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 });
  sunLight.shadow.bias = -0.0005;
  const hemi = new THREE.HemisphereLight('#cfe6ff', '#4a5a2a', 0.9);

  // --- hive interior
  const inside = new THREE.Scene();
  inside.background = new THREE.Color('#140b03');
  const icam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  icam.position.set(0, 0, 17);
  const comb = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: combTexture(), roughness: 0.55 }));
  comb.material.map.repeat.set(3.4, 4.2);
  comb.position.z = -0.35; inside.add(comb);
  inside.add(new THREE.AmbientLight('#ffcc88', 0.6));
  const lamp = new THREE.PointLight('#ffb050', 260, 40, 1.6); lamp.position.set(-4, 6, 9); inside.add(lamp);
  const rim = new THREE.DirectionalLight('#ffe0b0', 1.2); rim.position.set(3, 4, 8); inside.add(rim);
  const dancer = makeBee(); dancer.scale.setScalar(1.3); inside.add(dancer);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshBasicMaterial({ color: '#ffcf60', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  inside.add(halo);
  const followers = [];
  for (let k = 0; k < 6; k++) { const f = makeBee(); f.visible = false; inside.add(f); followers.push({ m: f, x: 0, y: 0, a: 0 }); }
  const crowd = [];
  {
    const r = mulberry(9);
    for (let k = 0; k < 46; k++) {
      const m = makeBee(); m.scale.setScalar(0.95 + r() * 0.15);
      let x, y; do { x = (r() - 0.5) * 30; y = (r() - 0.5) * 18; } while (Math.hypot(x, y) < 5.5);
      m.userData.home = { x, y, a: r() * 6.28, ph: r() * 6.28 };
      inside.add(m); crowd.push(m);
    }
  }
  const aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1), new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.55, depthTest: false }));
  aimLine.geometry.translate(0, 0.5, 0); aimLine.renderOrder = 5; inside.add(aimLine);
  const ghost = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.35, depthTest: false }));
  ghost.geometry.translate(0, 0.5, 0); ghost.renderOrder = 4; inside.add(ghost);
  const traces = [];
  const traceMat = new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.6, depthTest: false });
  for (let k = 0; k < 10; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1), traceMat.clone());
    m.geometry.translate(0, 0.5, 0); m.visible = false; m.renderOrder = 3; inside.add(m); traces.push(m);
  }
  let traceN = 0, lastRuns = 0;

  // --- outdoor
  function build(s) {
    sim = s;
    scene = new THREE.Scene();
    const pal = PALETTE[s.day.id];
    scene.fog = new THREE.Fog(pal.fog, 250, 2400);
    scene.add(sunLight, sunLight.target, hemi);
    const ground = s.ground, r = mulberry(s.day.terrain.seed);

    // sky dome
    const skyU = { top: { value: new THREE.Color(pal.sky) }, bot: { value: new THREE.Color(pal.fog) }, sunDir: { value: new THREE.Vector3(0, 1, 0) } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), new THREE.ShaderMaterial({
      uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; varying vec3 vp;
        void main(){ float h = clamp(vp.y*1.6+0.05,0.,1.); vec3 c = mix(bot, top, pow(h,0.7));
        float s = max(dot(vp, sunDir), 0.); c += vec3(1.,.85,.6)*pow(s, 18.)*0.5 + vec3(1.,.95,.8)*smoothstep(.9993,.9997,s)*2.;
        gl_FragColor = vec4(c,1.); }`,
    }));
    scene.add(sky);

    // terrain
    const SZ = 3600, SEG = 240;
    const tg = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG).rotateX(-Math.PI / 2);
    const pos = tg.attributes.position, cols = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(pal.lo), hi = new THREE.Color(pal.hi), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = ground(x, z);
      pos.setY(i, y);
      const n = 0.5 + 0.5 * Math.sin(x * 0.013 + Math.sin(z * 0.009) * 2) * Math.cos(z * 0.011);
      tmp.copy(lo).lerp(hi, Math.min(1, Math.max(0, n * 0.8 + y * 0.004)));
      cols.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    tg.computeVertexNormals();
    const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    terrain.receiveShadow = true; scene.add(terrain);

    // pond
    const pondAt = { meadow: [-300, 120], orchard: [120, -380], heath: [300, -620] }[s.day.id];
    const pond = new THREE.Mesh(new THREE.CircleGeometry(48, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4f8fb0', roughness: 0.1, metalness: 0.2 }));
    pond.position.set(pondAt[0], ground(pondAt[0], pondAt[1]) + 0.4, pondAt[1]); scene.add(pond);

    // hive
    const hive = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#f1ead8', roughness: 0.8 });
    const wood2 = new THREE.MeshStandardMaterial({ color: '#d8cdb2', roughness: 0.8 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 5.4), new THREE.MeshStandardMaterial({ color: '#6a4a2a' }));
    stand.position.y = 0.4; hive.add(stand);
    for (let k = 0; k < 3; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 5), k % 2 ? wood2 : wood);
      b.position.y = 0.8 + 0.75 + k * 1.52; b.castShadow = b.receiveShadow = true; hive.add(b);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.4, 5.6), new THREE.MeshStandardMaterial({ color: '#8b9aa3', metalness: 0.5, roughness: 0.4 }));
    roof.position.y = 5.55; roof.castShadow = true; hive.add(roof);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.1), new THREE.MeshBasicMaterial({ color: '#120a04' }));
    slot.position.set(0, 1.0, 2.52); hive.add(slot);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.2), wood2); board.position.set(0, 0.85, 3.0); hive.add(board);
    hive.position.y = ground(0, 0); scene.add(hive);

    // decor trees
    const trunkG = new THREE.CylinderGeometry(0.4, 0.6, 5, 6).translate(0, 2.5, 0);
    const crownG = new THREE.IcosahedronGeometry(4, 1).translate(0, 7.5, 0);
    const spots = [];
    const blocked = (x, z, pad) => Math.hypot(x, z) < 45 || s.patches.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad) || Math.hypot(x - pondAt[0], z - pondAt[1]) < 60;
    while (spots.length < 420) {
      // hedgerow-ish clumps along field boundaries
      const a = r() * 6.283, d = 60 + r() * 1500;
      let x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (r() < 0.55) { const L = Math.round(x / 260) * 260; x = L + (r() - 0.5) * 8; }
      if (!blocked(x, z, 12)) spots.push([x, z, 0.7 + r() * 0.8]);
    }
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: '#5b4129' }), spots.length);
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
    const cc = new THREE.Color();
    spots.forEach(([x, z, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6);
      m4.compose(v.set(x, ground(x, z) - 0.3, z), q, sc.set(k, k * (0.9 + r() * 0.4), k));
      trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, cc.set(s.day.id === 'heath' ? '#5f7d36' : '#4f8f38').offsetHSL((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.1));
    });
    crowns.castShadow = trunks.castShadow = true;
    scene.add(trunks, crowns);

    // barn
    const barnAt = { meadow: [380, -420], orchard: [-200, 420], heath: [-120, 520] }[s.day.id];
    const barn = new THREE.Group();
    const bw = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 18), new THREE.MeshLambertMaterial({ color: '#9b3b2a' }));
    bw.position.y = 6; barn.add(bw);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 13, 8, 4, 1).rotateY(Math.PI / 4).scale(1.18, 1, 0.72), new THREE.MeshLambertMaterial({ color: '#4c4c50' }));
    br.position.y = 16; barn.add(br);
    barn.position.set(barnAt[0], ground(...barnAt), barnAt[1]); barn.rotation.y = 0.4;
    barn.traverse((o) => { o.castShadow = true; }); scene.add(barn);

    // flower patches
    const patches = s.patches.map((p) => {
      const grp = new THREE.Group();
      const n = 24, dg = new THREE.PlaneGeometry(p.r * 2.3, p.r * 2.3, n, n).rotateX(-Math.PI / 2);
      const dp = dg.attributes.position;
      for (let i = 0; i < dp.count; i++) dp.setY(i, ground(p.x + dp.getX(i), p.z + dp.getZ(i)) + 0.25);
      dg.computeVertexNormals();
      const disc = new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ map: radialTexture(p.color), transparent: true, depthWrite: false }));
      disc.position.set(p.x, 0, p.z); disc.renderOrder = 1; disc.receiveShadow = true; grp.add(disc);
      const area = Math.PI * p.r * p.r;
      const heads = [];
      const kind = p.kind || 'field';
      if (kind === 'tree') {
        const cnt = Math.min(90, Math.round(area / 220));
        const tm = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: '#5b4129' }), cnt);
        const cm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.6, 1).translate(0, 6.8, 0), new THREE.MeshLambertMaterial({ color: new THREE.Color(p.color).lerp(new THREE.Color('#4f8f38'), 0.3), flatShading: true }), cnt);
        for (let i = 0; i < cnt; i++) {
          let x, z; do { x = (r() - 0.5) * 2 * p.r; z = (r() - 0.5) * 2 * p.r; } while (Math.hypot(x, z) > p.r);
          if (p.id === 'apple') { x = Math.round(x / 12) * 12; z = Math.round(z / 9) * 9; }
          const k = 0.8 + r() * 0.35;
          m4.compose(v.set(p.x + x, ground(p.x + x, p.z + z) - 0.2, p.z + z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), sc.set(k, k, k));
          tm.setMatrixAt(i, m4); cm.setMatrixAt(i, m4);
        }
        tm.castShadow = cm.castShadow = true; grp.add(tm, cm); heads.push(cm);
      } else if (kind === 'hedge') {
        const cnt = Math.round(p.r * 2 / 3.2);
        const bm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 1).translate(0, 1.8, 0), new THREE.MeshLambertMaterial({ color: new THREE.Color(p.color).lerp(new THREE.Color('#3f7a2e'), 0.45), flatShading: true }), cnt * 2);
        const ang = r() * Math.PI;
        for (let i = 0; i < cnt * 2; i++) {
          const t = (i % cnt) / (cnt - 1) - 0.5, off = i >= cnt ? 2.4 : 0;
          const x = p.x + Math.cos(ang) * t * p.r * 2 + Math.sin(ang) * off, z = p.z + Math.sin(ang) * t * p.r * 2 - Math.cos(ang) * off;
          const k = 0.8 + r() * 0.5;
          m4.compose(v.set(x, ground(x, z), z), q.identity(), sc.set(k, k * 0.9, k));
          bm.setMatrixAt(i, m4);
        }
        bm.castShadow = true; grp.add(bm); heads.push(bm);
      }
      const fc = Math.min(2200, Math.round(area / (kind === 'field' ? 5 : 14)));
      const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0).scale(1, 0.55, 1), new THREE.MeshLambertMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.12 }), fc);
      const stems = [];
      for (let i = 0; i < fc; i++) {
        const a = r() * 6.283, d = Math.sqrt(r()) * p.r, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        const h = (kind === 'field' && p.id.startsWith('sun')) ? 2.2 : 0.5 + r() * 0.6;
        stems.push([x, ground(x, z) + h, z, 0.8 + r() * 0.6]);
        m4.compose(v.set(x, ground(x, z) + h, z), q.identity(), sc.setScalar(stems[i][3]));
        fl.setMatrixAt(i, m4);
      }
      grp.add(fl); heads.push(fl);
      scene.add(grp);
      return { p, grp, fl, stems, heads, open: null, disc, kind };
    });

    // foragers
    const fm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6).scale(0.8, 0.8, 1.4), new THREE.MeshStandardMaterial({ color: '#f0b020', emissive: '#6a4000', roughness: 0.6 }), s.bees.length);
    fm.frustumCulled = false; scene.add(fm);
    const wm = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 0.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), s.bees.length);
    wm.frustumCulled = false; scene.add(wm);

    // bee lines
    const lines = s.patches.map((p) => {
      const mid = new THREE.Vector3(p.x / 2, Math.max(ground(p.x / 2, p.z / 2), ground(0, 0)) + 9 + Math.hypot(p.x, p.z) * 0.01, p.z / 2);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ENTRANCE.x, ground(0, 0) + 1.5, ENTRANCE.z), mid, new THREE.Vector3(p.x, p.y + 3, p.z));
      const len = curve.getLength();
      const tex = dashTexture.clone(); tex.needsUpdate = true; tex.repeat.set(Math.round(len / 9), 1);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.22, 5), new THREE.MeshBasicMaterial({ color: '#ffe27a', alphaMap: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(m);
      return { m, level: 0 };
    });

    // player
    const bee = makeBee(); bee.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(bee);

    // markers for where recruits searched
    const markers = [];
    const tasteRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff7c8', transparent: true, opacity: 0.0, depthWrite: false }));
    scene.add(tasteRing);

    world = { scene, sky, skyU, patches, fm, wm, lines, bee, markers, terrain, tasteRing, camPos: new THREE.Vector3(0, 10, 30), camLook: new THREE.Vector3(), zoom: 1, view: 0 };
    traceN = 0; lastRuns = 0; traces.forEach((t) => (t.visible = false));
  }

  function marker(x, z, ok) {
    const g = sim.ground(x, z);
    const m = new THREE.Mesh(new THREE.RingGeometry(6, 8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: ok ? '#7dffa0' : '#ff6a5a', transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(x, g + 1, z); world.scene.add(m);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 5), m.material);
    pole.position.set(x, g + 15, z); world.scene.add(pole);
    world.markers.push({ m, pole, life: 25 });
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), cc = new THREE.Color();
  let wingT = 0;

  function frame(dt) {
    if (!sim) return;
    wingT += dt;
    const W = world, P = sim.player;
    const sun = sim.sun, [sx, sz] = dirOf(sun.az), ca = Math.cos(sun.alt * D2R);
    const sd = new THREE.Vector3(sx * ca, Math.sin(sun.alt * D2R), sz * ca);
    W.skyU.sunDir.value.copy(sd);
    const warm = Math.max(0, 1 - sun.alt / 25);
    sunLight.color.setRGB(1, 0.95 - warm * 0.25, 0.86 - warm * 0.45);
    sunLight.intensity = 0.6 + 2.2 * Math.min(1, Math.max(0, sun.alt) / 20);
    hemi.intensity = 0.5 + 0.5 * Math.min(1, sun.alt / 30);

    // patches open/closed
    for (const pp of W.patches) {
      const o = isOpen(sim, pp.p);
      if (o !== pp.open) {
        pp.open = o;
        const col = new THREE.Color(pp.p.color);
        if (!o) col.lerp(new THREE.Color('#4c6a2c'), 0.75);
        pp.heads.forEach((h) => (h === pp.fl ? h.material.color.copy(col) : h.material.color.set('#3f7f30').lerp(col, pp.kind === 'tree' ? 0.7 : 0.38)));
        pp.fl.material.emissive.copy(col);
        pp.disc.material.opacity = o ? 1 : 0.35;
        for (let i = 0; i < pp.stems.length; i++) {
          const [x, y, z, k] = pp.stems[i];
          m4.compose(v.set(x, y - (o ? 0 : 0.3), z), q.identity(), sc.setScalar(o ? k : k * 0.45));
          pp.fl.setMatrixAt(i, m4);
        }
        pp.fl.instanceMatrix.needsUpdate = true;
      }
    }

    // foragers
    const traffic = new Array(sim.patches.length).fill(0);
    let n = 0;
    for (const b of sim.bees) {
      if (b.s === 'idle' || b.s === 'dead' || b.s === 'unload') continue;
      if (b.p >= 0) traffic[b.p]++;
      e.set(0, -b.yaw, 0); q.setFromEuler(e);
      m4.compose(v.set(b.x, b.y, b.z), q, sc.setScalar(1));
      W.fm.setMatrixAt(n, m4);
      const flap = Math.sin(wingT * 60 + b.ph) * 0.5;
      e.set(flap, -b.yaw, 0); q.setFromEuler(e);
      m4.compose(v.set(b.x, b.y + 0.35, b.z), q, sc.setScalar(1));
      W.wm.setMatrixAt(n, m4);
      n++;
    }
    W.fm.count = n; W.wm.count = n;
    W.fm.instanceMatrix.needsUpdate = true; W.wm.instanceMatrix.needsUpdate = true;
    W.lines.forEach((L, i) => {
      L.level += (Math.min(1, traffic[i] / 18) - L.level) * Math.min(1, dt * 1.5);
      L.m.material.opacity = L.level * 0.75;
      L.m.material.alphaMap.offset.x = -wingT * 0.9;
      L.m.visible = L.level > 0.01;
    });
    for (let i = W.markers.length - 1; i >= 0; i--) {
      const mk = W.markers[i]; mk.life -= dt;
      mk.m.material.opacity = Math.min(0.9, mk.life / 5);
      if (mk.life <= 0) { W.scene.remove(mk.m, mk.pole); W.markers.splice(i, 1); }
    }

    // player bee
    const B = W.bee;
    B.visible = !P.inHive;
    const climb = sim.input.climb;
    e.set(climb * 0.25 - (P.speed - 13) * 0.006, -P.yaw * D2R, -P.bank * 0.6, 'YXZ');
    B.quaternion.setFromEuler(e);
    B.position.set(P.x, P.y, P.z);
    for (const w of B.userData.wings) w.hinge.rotation.z = w.s * (0.25 + Math.sin(wingT * 70) * 0.55);
    const sipping = P.sipPatch >= 0;
    B.userData.pollen.forEach((m) => (m.visible = Object.keys(P.mem).length > 0));
    if (sipping) {
      const p = sim.patches[P.sipPatch];
      W.tasteRing.position.set(P.x, sim.ground(P.x, P.z) + 0.6, P.z);
      const k = 2 + Math.min(1, P.sip) * 4; W.tasteRing.scale.setScalar(k);
      W.tasteRing.material.opacity = P.sip < 1 ? 0.8 : Math.max(0, 0.8 - (P.sip - 1));
      W.tasteRing.material.color.set(p.color);
    } else W.tasteRing.material.opacity = 0;

    // camera
    const [fx, fz] = dirOf(P.yaw);
    const back = [7, 16, 46][W.view] * W.zoom, up = [2.4, 6, 26][W.view] * W.zoom;
    const want = v.set(P.x - fx * back, P.y + up, P.z - fz * back);
    const g = sim.ground(want.x, want.z);
    if (want.y < g + 1.2) want.y = g + 1.2;
    W.camPos.lerp(want, Math.min(1, dt * 4));
    camera.position.copy(W.camPos);
    W.camLook.lerp(new THREE.Vector3(P.x + fx * 6, P.y + 0.6, P.z + fz * 6), Math.min(1, dt * 8));
    camera.lookAt(W.camLook);
    sunLight.position.set(P.x + sd.x * 300, P.y + sd.y * 300, P.z + sd.z * 300);
    sunLight.target.position.set(P.x, P.y, P.z);
    W.sky.position.copy(camera.position);

    if (P.inHive && sim.dance) frameHive(dt);
    renderer.render(P.inHive && sim.dance ? inside : W.scene, P.inHive && sim.dance ? icam : camera);
  }

  function placeOnComb(m, x, y, th, lift = 0) {
    // comb is the XY plane; heading th = clockwise from up; bee's nose is -Z in its own frame
    m.position.set(x, y, lift);
    e.set(Math.PI / 2, 0, 0, 'XYZ');
    q.setFromEuler(e);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -th * D2R);
    m.quaternion.copy(qz.multiply(q));
  }

  function frameHive(dt) {
    const D = sim.dance;
    const t = wingT;
    const waggling = D.state === 'run';
    placeOnComb(dancer, D.x, D.y, D.th, 0.3);
    halo.position.set(D.x, D.y, 0.05); halo.material.opacity = waggling ? 0.35 + 0.1 * Math.sin(t * 40) : 0.2;
    if (waggling) {
      const w = Math.sin(t * 2 * Math.PI * 13) * 0.45;
      dancer.rotateOnAxis(new THREE.Vector3(0, 1, 0), w * 0.35);
      dancer.userData.abd.rotation.y = w;
    } else dancer.userData.abd.rotation.y = 0;
    for (const wg of dancer.userData.wings) wg.hinge.rotation.z = wg.s * (waggling ? 0.15 + Math.sin(t * 90) * 0.2 : 0.05);
    D.slots.forEach((s, k) => {
      const f = followers[k];
      f.m.visible = !!s;
      if (!s) return;
      const a = (k / 6) * Math.PI * 2 + D.th * D2R * 0.3 + 0.5;
      const tx = D.x + Math.sin(a) * 1.7, ty = D.y + Math.cos(a) * 1.7;
      f.x += (tx - f.x) * Math.min(1, dt * 5); f.y += (ty - f.y) * Math.min(1, dt * 5);
      const face = Math.atan2(D.x - f.x, D.y - f.y) / D2R;
      placeOnComb(f.m, f.x, f.y, face, 0.25);
      for (const wg of f.m.userData.wings) wg.hinge.rotation.z = wg.s * 0.05;
    });
    for (const c of crowd) {
      const h = c.userData.home;
      const jx = Math.sin(t * 0.7 + h.ph) * 0.4, jy = Math.cos(t * 0.5 + h.ph * 1.3) * 0.4;
      placeOnComb(c, h.x + jx, h.y + jy, (h.a + Math.sin(t * 0.3 + h.ph) * 0.6) / D2R, 0.2);
    }
    const aim = sim.input.aim * D2R;
    aimLine.position.set(D.x, D.y, 0.8); aimLine.rotation.set(0, 0, -aim); aimLine.scale.y = waggling ? 0.0001 : 2.4;
    const gv = ghostAngle();
    ghost.visible = gv !== null && D.state !== 'run';
    if (gv !== null) { ghost.position.set(D.x, D.y, 0.7); ghost.rotation.set(0, 0, -gv.a * D2R); ghost.scale.y = Math.max(0.5, gv.d * 1.6); }
    if (D.runs.length !== lastRuns) {
      lastRuns = D.runs.length;
      const run = D.runs[D.runs.length - 1];
      const tr = traces[traceN++ % traces.length];
      tr.visible = true; tr.position.set(D.sx, D.sy, 0.6); tr.rotation.set(0, 0, -run.angle * D2R); tr.scale.y = run.dur * 1.6;
      tr.userData.life = 12;
    }
    for (const tr of traces) if (tr.visible) { tr.userData.life -= dt; tr.material.opacity = Math.max(0, Math.min(0.6, tr.userData.life / 6)); if (tr.userData.life <= 0) tr.visible = false; }
    icam.position.x += (D.x * 0.5 - icam.position.x) * Math.min(1, dt * 2);
    icam.position.y += (D.y * 0.5 - icam.position.y) * Math.min(1, dt * 2);
    icam.lookAt(icam.position.x, icam.position.y, 0);
  }

  let ghostAngle = () => null;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = icam.aspect = w / h;
    camera.updateProjectionMatrix(); icam.updateProjectionMatrix();
    icam.position.z = w / h < 1 ? 30 : 20;
  }
  window.addEventListener('resize', resize); resize();

  return {
    load: build, frame, marker,
    setGhost(fn) { ghostAngle = fn; },
    setView(i) { if (world) world.view = i; },
    cycleView() { if (world) world.view = (world.view + 1) % 3; return world?.view; },
    zoom(f) { if (world) world.zoom = Math.min(2.5, Math.max(0.5, world.zoom * f)); },
    snapCam() { if (world) { world.camPos.set(sim.player.x, sim.player.y + 3, sim.player.z + 8); } },
    project(x, y, z) {
      v.set(x, y, z).project(camera);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, vis: v.z < 1 && v.z > -1 };
    },
    projectComb(x, y) {
      v.set(x, y, 0.3).project(icam);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    },
  };
}
