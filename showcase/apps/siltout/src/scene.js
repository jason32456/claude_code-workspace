import * as THREE from '../vendor/three.module.js';
import { meshCave } from './mesh.js';
import { forwardOf, lineSegments } from './sim.js';
import { H } from './silt.js';

const TORCH_GLSL = `
uniform vec3 uLP; uniform vec3 uLD; uniform float uLI; uniform float uLCos;
uniform vec3 uFogColor; uniform float uFogDensity;
uniform vec3 uDayP; uniform float uDayI;
float torch(vec3 wp) {
  vec3 d = wp - uLP; float L = max(length(d), 0.001);
  float c = dot(d / L, uLD);
  float cone = smoothstep(uLCos, mix(uLCos, 1.0, 0.55), c);
  return uLI * (cone + 0.12 * smoothstep(0.2, 1.0, c)) / (1.0 + 0.035 * L * L);
}
float daylight(vec3 wp) { float L = length(wp - uDayP); return uDayI * 0.6 / (1.0 + 0.01 * L * L) * smoothstep(40.0, 6.0, L); }
float fogf(float depth) { float f = uFogDensity * depth; return 1.0 - clamp(exp(-f * f), 0.0, 1.0); }
`;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 220);
  scene.add(camera);
  scene.fog = new THREE.FogExp2(0x000000, 0.05);

  const ambient = new THREE.AmbientLight(0x2a3a44, 0.05);
  scene.add(ambient);
  const torch = new THREE.SpotLight(0xfff4e0, 34, 60, 0.42, 0.6, 1.25);
  scene.add(torch); scene.add(torch.target);
  const fill = new THREE.PointLight(0xfff0dd, 1.2, 5, 1.5);
  scene.add(fill);
  const day = new THREE.PointLight(0x6cc4d8, 70, 42, 1.6);
  scene.add(day);
  const lantern = new THREE.PointLight(0xffa24a, 0, 14, 2);
  scene.add(lantern);

  const uniforms = {
    uLP: { value: new THREE.Vector3() }, uLD: { value: new THREE.Vector3(1, 0, 0) },
    uLI: { value: 1 }, uLCos: { value: Math.cos(0.42) },
    uFogColor: { value: new THREE.Color(0, 0, 0) }, uFogDensity: { value: 0.05 },
    uDayP: { value: new THREE.Vector3() }, uDayI: { value: 1 },
  };

  const V = {
    renderer, scene, camera, torch, uniforms,
    mode: 0, cam: { yaw: 0, pitch: 0, dist: 3.2, free: null },
    world: null, flicker: 0,
  };

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    V.pxScale = (h * renderer.getPixelRatio()) / 2 / Math.tan((camera.fov * Math.PI) / 360);
  };
  window.addEventListener('resize', resize);
  resize();

  V.build = (S) => {
    if (V.world) { scene.remove(V.world); V.world.traverse((o) => { o.geometry?.dispose?.(); }); }
    const W = new THREE.Group();
    V.world = W;
    scene.add(W);
    const cave = S.cave, site = S.site;
    const m = meshCave(cave);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    g.setIndex(new THREE.BufferAttribute(m.index, 1));
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    W.add(new THREE.Mesh(g, rockMat));

    const B = cave.basin;
    day.position.set(B.p[0], 1, B.p[2]);
    uniforms.uDayP.value.set(B.p[0], 1, B.p[2]);
    const surf = new THREE.Mesh(new THREE.CircleGeometry(B.r * 1.4, 48), new THREE.MeshBasicMaterial({ color: 0x9fe6f2, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    surf.rotation.x = Math.PI / 2;
    surf.position.set(B.p[0], -0.05, B.p[2]);
    W.add(surf);
    const rays = new THREE.Mesh(new THREE.CylinderGeometry(B.r * 0.7, B.r * 1.1, 10, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x6fd0e0, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    rays.position.set(B.p[0], -5, B.p[2]);
    W.add(rays);

    // Tie-off knobs.
    const knobGeo = new THREE.DodecahedronGeometry(0.2, 1);
    const knobMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...site.rock).multiplyScalar(0.8), roughness: 0.95, flatShading: true });
    const knobs = new THREE.InstancedMesh(knobGeo, knobMat, cave.anchors.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3();
    cave.anchors.forEach((a, i) => {
      Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-a.n[0], -a.n[1], -a.n[2]));
      const s = a.primary ? 1.4 : 0.7 + ((i * 37) % 10) / 25;
      Sc.set(s, s * 1.5, s);
      M.compose(new THREE.Vector3(a.p[0] + a.n[0] * 0.12, a.p[1] + a.n[1] * 0.12, a.p[2] + a.n[2] * 0.12), Q, Sc);
      knobs.setMatrixAt(i, M);
    });
    W.add(knobs);
    const prim = cave.anchors.find((a) => a.primary);
    const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0x401800 }));
    flag.position.set(prim.p[0], prim.p[1] + 0.5, prim.p[2]);
    W.add(flag);

    // Formations in the objective chamber.
    const T = cave.target;
    const calc = new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.7 });
    const rnd = mulberry(site.seed * 7 + 1);
    for (let k = 0; k < 20; k++) {
      const a = rnd() * Math.PI * 2, r = rnd() * T.r * 0.85;
      const x = T.p[0] + Math.cos(a) * r, z = T.p[2] + Math.sin(a) * r;
      const up = rnd() < 0.5;
      const yb = castY(cave, [x, T.p[1], z], up ? -1 : 1);
      if (yb == null) continue;
      const h = 0.4 + rnd() * (k === 0 ? 4 : 1.6);
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.06 + h * 0.07, h, 10), calc);
      c.position.set(x, yb + (up ? h / 2 - 0.05 : -h / 2 + 0.05), z);
      if (!up) c.rotation.x = Math.PI;
      W.add(c);
    }
    if (site.id === 'pell') {
      const y0 = castY(cave, [T.p[0], T.p[1], T.p[2]], -1), y1 = castY(cave, [T.p[0], T.p[1], T.p[2]], 1);
      if (y0 != null && y1 != null) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, y1 - y0 + 0.4, 14), calc);
        col.position.set(T.p[0], (y0 + y1) / 2, T.p[2]);
        W.add(col);
      }
    }
    lantern.intensity = site.id === 'blackwater' ? 5 : 0;
    lantern.position.set(T.p[0], T.p[1] - 1, T.p[2]);
    if (site.id === 'blackwater') {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb060 }));
      lamp.position.copy(lantern.position);
      W.add(lamp);
    }

    // Permanent line and its arrows.
    if (cave.perm) {
      W.add(makeLine(cave.perm.pts, 0xe9b93a));
      const ag = new THREE.ConeGeometry(0.09, 0.26, 3);
      const am = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 });
      for (const ar of cave.perm.arrows) {
        const a = cave.perm.pts[ar.seg], b = cave.perm.pts[ar.seg + 1];
        const d = new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]).normalize();
        const mesh = new THREE.Mesh(ag, am);
        mesh.position.set(...ar.p);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        W.add(mesh);
      }
    }

    // Own line: fixed part + live part, rebuilt when ties change.
    V.ownLine = makeLine([[0, 0, 0], [0, 0, 0]], 0xf4f4ee, 128);
    V.liveLine = makeLine([[0, 0, 0], [0, 0, 0]], 0xf4f4ee, 2);
    W.add(V.ownLine, V.liveLine);
    const ringGeo = new THREE.TorusGeometry(0.16, 0.035, 6, 14);
    V.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.5 }), 64);
    V.rings.count = 0;
    W.add(V.rings);

    // Suspended silt, one soft sprite per voxel.
    const sl = S.silt;
    const jp = new Float32Array(sl.W * 3);
    const jr = mulberry(5);
    for (let k = 0; k < sl.W * 3; k++) jp[k] = sl.pos[k] + (jr() - 0.5) * H * 0.7;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(jp, 3));
    V.siltAttr = new THREE.BufferAttribute(sl.c, 1);
    sg.setAttribute('a', V.siltAttr);
    sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    V.siltMat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uScale: { value: 500 }, uColor: { value: new THREE.Color(...site.siltColor) } },
      vertexShader: `attribute float a; uniform float uScale; uniform vec3 uColor; varying float vA; varying vec3 vC;
        ${TORCH_GLSL}
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          float d = -mv.z; vA = a < 0.015 ? 0.0 : clamp(a * 0.22, 0.0, 0.55) * (1.0 - fogf(d) * 0.85);
          gl_PointSize = vA > 0.0 ? min(900.0, uScale * ${(H * 2.1).toFixed(2)} / max(d, 0.3)) : 0.0;
          vec3 wp = position; vC = uColor * (0.03 + torch(wp) * 0.9 + daylight(wp) * 0.25) * 1.6; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q,q); if (r > 1.0) discard; gl_FragColor = vec4(vC, vA * (1.0 - r) * (1.0 - r)); }`,
      transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(sg, V.siltMat);
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    W.add(pts);

    // Marine snow around the camera, for a sense of motion.
    const SN = 900;
    V.snowBase = new Float32Array(SN * 3);
    const sr = mulberry(9);
    for (let i = 0; i < SN * 3; i++) V.snowBase[i] = sr() * 18;
    const snowG = new THREE.BufferGeometry();
    V.snowPos = new Float32Array(SN * 3);
    snowG.setAttribute('position', new THREE.BufferAttribute(V.snowPos, 3));
    snowG.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    V.snowMat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uScale: { value: 500 } },
      vertexShader: `uniform float uScale; varying float vL; ${TORCH_GLSL}
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; float d=-mv.z;
          gl_PointSize = clamp(uScale * 0.018 / max(d,0.2), 1.0, 6.0); vL = (torch(position) * 0.9 + daylight(position) * 0.3) * (1.0 - fogf(d)); }`,
      fragmentShader: `varying float vL; void main(){ vec2 q = gl_PointCoord*2.0-1.0; if (dot(q,q)>1.0) discard; gl_FragColor = vec4(vec3(0.9,0.88,0.8)*vL, min(1.0, vL*0.8)); }`,
      transparent: true, depthWrite: false,
    });
    const snow = new THREE.Points(snowG, V.snowMat);
    snow.frustumCulled = false;
    W.add(snow);

    // Exhaust bubbles.
    const BN = 160;
    V.bub = { n: BN, p: new Float32Array(BN * 3), v: new Float32Array(BN), life: new Float32Array(BN), next: 0 };
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(V.bub.p, 3));
    bg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    V.bubMat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uScale: { value: 500 } },
      vertexShader: `uniform float uScale; varying float vL; ${TORCH_GLSL}
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; float d=-mv.z;
          gl_PointSize = position.y < -999.0 ? 0.0 : clamp(uScale * 0.06 / max(d,0.2), 1.0, 26.0); vL = (0.15 + torch(position) + daylight(position)*0.4) * (1.0 - fogf(d)); }`,
      fragmentShader: `varying float vL; void main(){ vec2 q = gl_PointCoord*2.0-1.0; float r = dot(q,q); if (r>1.0) discard; float rim = smoothstep(0.45,1.0,r); gl_FragColor = vec4(vec3(0.85,0.95,1.0)*vL, (0.15 + rim*0.7)*min(1.0,vL)); }`,
      transparent: true, depthWrite: false,
    });
    V.bub.p.fill(-9999);
    const bp = new THREE.Points(bg, V.bubMat);
    bp.frustumCulled = false;
    W.add(bp);

    // Diver, shown in the chase camera.
    V.diver = makeDiver();
    W.add(V.diver);
    V.tieSig = '';
    V.S = S;
  };

  function makeLine(pts, color, cap = pts.length) {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(Math.max(cap, pts.length) * 3);
    pts.forEach((p, i) => arr.set(p, i * 3));
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.setDrawRange(0, pts.length);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uColor: { value: new THREE.Color(color) } },
      vertexShader: `uniform vec3 uColor; varying vec3 vC; ${TORCH_GLSL}
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          float L = (0.03 + torch(position) * 1.4 + daylight(position) * 0.5); vC = mix(uColor * L, uFogColor, fogf(-mv.z)); }`,
      fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC,1.0); }`,
    });
    const l = new THREE.Line(g, mat);
    l.frustumCulled = false;
    return l;
  }
  function setLine(line, pts) {
    const a = line.geometry.attributes.position;
    pts.forEach((p, i) => a.array.set(p, i * 3));
    a.needsUpdate = true;
    line.geometry.setDrawRange(0, pts.length);
  }

  V.bubble = (p) => {
    const B = V.bub;
    for (let k = 0; k < 7; k++) {
      const i = B.next; B.next = (B.next + 1) % B.n;
      B.p[i * 3] = p[0] + (Math.random() - 0.5) * 0.3; B.p[i * 3 + 1] = p[1] + Math.random() * 0.2; B.p[i * 3 + 2] = p[2] + (Math.random() - 0.5) * 0.3;
      B.v[i] = 0.5 + Math.random() * 0.6; B.life[i] = 6;
    }
  };

  V.render = (S, dt) => {
    const D = S.diver, cave = S.cave;
    const fwd = forwardOf(D.yaw, D.pitch);
    const head = [D.pos[0], D.pos[1] + 0.12, D.pos[2]];
    let cp = head, look = [head[0] + fwd[0], head[1] + fwd[1], head[2] + fwd[2]];
    V.diver.visible = V.mode !== 0;
    if (V.mode === 1) {
      const back = [-fwd[0], -fwd[1] + 0.2, -fwd[2]];
      const bl = Math.hypot(...back);
      let s = 0.4;
      for (; s < V.cam.dist; s += 0.1) if (cave.D(head[0] + back[0] / bl * s, head[1] + back[1] / bl * s, head[2] + back[2] / bl * s) > -0.3) break;
      if (s < 1.6) V.diver.visible = false;
      cp = [head[0] + (back[0] / bl) * s, head[1] + (back[1] / bl) * s, head[2] + (back[2] / bl) * s];
      look = [head[0] + fwd[0] * 2, head[1] + fwd[1] * 2, head[2] + fwd[2] * 2];
    } else if (V.mode === 2 && V.cam.free) {
      cp = V.cam.free.pos; look = V.cam.free.look;
    }
    camera.position.set(...cp);
    camera.lookAt(...look);

    // Torch.
    const L = S.light;
    let I = L.primary ? 1 : L.backup ? 0.3 : 0;
    if (V.flicker > 0) { V.flicker -= dt; I = Math.random() < 0.5 ? 0.9 : 0.05; if (V.flicker <= 0 && !L.primary) I = L.backup ? 0.3 : 0; }
    const ang = L.primary ? 0.42 : 0.28;
    const lp = V.mode === 0 ? [head[0] + fwd[0] * 0.25, head[1] - 0.15, head[2] + fwd[2] * 0.25] : [head[0] + fwd[0] * 0.5, head[1], head[2] + fwd[2] * 0.5];
    torch.position.set(...lp);
    torch.target.position.set(lp[0] + fwd[0] * 5, lp[1] + fwd[1] * 5, lp[2] + fwd[2] * 5);
    torch.intensity = 34 * I;
    torch.angle = ang;
    torch.color.set(L.primary ? 0xfff4e0 : 0xffd9a0);
    fill.position.set(...lp);
    fill.intensity = 1.2 * I;
    uniforms.uLP.value.set(...lp);
    uniforms.uLD.value.set(...fwd);
    uniforms.uLI.value = I;
    uniforms.uLCos.value = Math.cos(ang);

    // Fog follows the silt at the camera.
    const vis = Math.min(D.vis, visAt(S, cp));
    const site = S.site;
    const B = cave.basin;
    const dayK = Math.max(0, 1 - Math.hypot(cp[0] - B.p[0], cp[1] - B.p[1], cp[2] - B.p[2]) / 30) ** 2;
    const siltK = Math.max(0, Math.min(1, (14 - vis) / 13));
    const fc = new THREE.Color(0.0, 0.012, 0.018);
    fc.lerp(new THREE.Color(0.04, 0.17, 0.21), dayK);
    fc.lerp(new THREE.Color(...site.siltColor).multiplyScalar(0.55 * I + 0.05), siltK);
    scene.fog.color.copy(fc);
    scene.fog.density = 1.6 / Math.max(0.6, Math.min(vis, 40));
    renderer.setClearColor(fc);
    uniforms.uFogColor.value.copy(fc);
    uniforms.uFogDensity.value = scene.fog.density;
    uniforms.uDayI.value = 1;
    V.siltMat.uniforms.uScale.value = V.pxScale;
    V.snowMat.uniforms.uScale.value = V.pxScale;
    V.bubMat.uniforms.uScale.value = V.pxScale;
    V.siltAttr.needsUpdate = true;

    // Snow wraps in a box around the camera.
    const sb = V.snowBase, sp = V.snowPos;
    for (let i = 0; i < sp.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = (((sb[i + k] - cp[k]) % 18) + 18) % 18;
        sp[i + k] = cp[k] + v - 9;
      }
    }
    V.world.children.find((o) => o.material === V.snowMat).geometry.attributes.position.needsUpdate = true;

    const Bb = V.bub;
    for (let i = 0; i < Bb.n; i++) {
      if (Bb.life[i] <= 0) continue;
      Bb.life[i] -= dt;
      const ny = Bb.p[i * 3 + 1] + Bb.v[i] * dt;
      if (cave.D(Bb.p[i * 3], ny + 0.05, Bb.p[i * 3 + 2]) > 0 || ny > -0.1) { Bb.p[i * 3] += (Math.random() - 0.5) * 0.02; Bb.p[i * 3 + 2] += (Math.random() - 0.5) * 0.02; }
      else { Bb.p[i * 3 + 1] = ny; Bb.p[i * 3] += Math.sin(ny * 7 + i) * 0.004; }
      if (Bb.life[i] <= 0) Bb.p[i * 3 + 1] = -9999;
    }
    V.world.children.find((o) => o.material === V.bubMat).geometry.attributes.position.needsUpdate = true;

    // Line.
    const T = S.reel.ties;
    const sig = T.map((t) => t.p.join()).join('|');
    if (sig !== V.tieSig) {
      V.tieSig = sig;
      const own = T.map((t) => t.p);
      setLine(V.ownLine, own.length ? own : [[0, 0, 0]]);
      V.ownLine.visible = own.length > 1;
      const M = new THREE.Matrix4();
      T.forEach((t, i) => { M.makeTranslation(t.p[0], t.p[1], t.p[2]); V.rings.setMatrixAt(i, M); });
      V.rings.count = T.length;
      V.rings.instanceMatrix.needsUpdate = true;
    }
    if (T.length && !S.reel.broken) {
      const hand = [D.pos[0] + fwd[0] * 0.45, D.pos[1] - 0.25, D.pos[2] + fwd[2] * 0.45];
      setLine(V.liveLine, [T[T.length - 1].p, hand]);
      V.liveLine.visible = true;
      V.liveLine.material.uniforms.uColor.value.set(S.reel.wrapped ? 0xff6a4a : 0xf4f4ee);
    } else V.liveLine.visible = false;

    // Diver pose.
    const dv = V.diver;
    dv.position.set(...D.pos);
    dv.rotation.set(0, -D.yaw, D.pitch, 'YZX');
    const kick = Math.sin(D.phase * Math.PI * 2) * (D.mode === 'flutter' ? 0.6 : D.mode === 'rest' ? 0.05 : 0.35);
    dv.userData.finL.rotation.z = kick; dv.userData.finR.rotation.z = -kick;
    dv.userData.lamp.material.color.set(I > 0.5 ? 0xfff4d0 : I > 0 ? 0xffc080 : 0x222222);

    renderer.render(scene, camera);
  };

  V.snapCam = () => {};
  return V;
}

function visAt(S, p) {
  const c = S.silt.sample(p[0], p[1], p[2]);
  return Math.min(40, 3 / (S.site.clarity + c));
}

function castY(cave, p, dir) {
  for (let s = 0; s < 14; s += 0.1) if (cave.D(p[0], p[1] + dir * s, p[2]) > 0) return p[1] + dir * s;
  return null;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function makeDiver() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xa9b2ba, roughness: 0.35, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 6, 12), suit);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), suit);
  head.position.set(0.72, 0.05, 0);
  g.add(head);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10), new THREE.MeshBasicMaterial({ color: 0xfff4d0 }));
  lamp.rotation.z = Math.PI / 2;
  lamp.position.set(0.85, -0.15, 0.18);
  g.add(lamp);
  for (const s of [-1, 1]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.75, 12), steel);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0.05, -0.05, s * 0.28);
    g.add(tank);
    const valve = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), accent);
    valve.position.set(0.45, -0.05, s * 0.28);
    g.add(valve);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.36), new THREE.MeshStandardMaterial({ color: 0x30343a }));
  wing.position.set(0.05, 0.2, 0);
  g.add(wing);
  const finGeo = new THREE.BoxGeometry(0.42, 0.02, 0.2);
  finGeo.translate(-0.21, 0, 0);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const mkFin = (z) => { const f = new THREE.Group(); f.position.set(-0.6, 0, z); const m = new THREE.Mesh(finGeo, finMat); f.add(m); g.add(f); return f; };
  g.userData = { finL: mkFin(0.1), finR: mkFin(-0.1), lamp };
  return g;
}

export { lineSegments };
