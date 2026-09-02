import * as THREE from '../vendor/three.module.js';
import { N, CELL, WORLD, idx, gx2wx } from './grid.js';
import { ZONE_FIELD, ZONE_VILLAGE } from './world.js';

const SKY_TOP = new THREE.Color(0x2f5f9e);
const SKY_LOW = new THREE.Color(0xa8c4d8);
const SUN_DIR = new THREE.Vector3(0.42, 0.78, 0.46).normalize();

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  scene.background = SKY_LOW.clone();
  scene.fog = new THREE.Fog(0x9db8cc, 280, 720);

  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.5, 2200);

  scene.add(new THREE.HemisphereLight(0xbcd6f0, 0x50442f, 0.75));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.35);
  sun.position.copy(SUN_DIR).multiplyScalar(300);
  scene.add(sun);

  scene.add(makeSky());

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { renderer, scene, camera };
}

function makeSky() {
  const geo = new THREE.SphereGeometry(1200, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTop: { value: SKY_TOP }, uLow: { value: SKY_LOW } },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uLow;
      varying vec3 vPos;
      void main() {
        float h = clamp(normalize(vPos).y * 1.4 + 0.18, 0.0, 1.0);
        vec3 c = mix(uLow, uTop, pow(h, 0.75));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// ------------------------------------------------------------------- terrain

const TERRAIN_VERT = `
in vec3 aColor;
out vec3 vColor;
out vec3 vWorld;
void main() {
  vColor = aColor;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const TERRAIN_FRAG = `
precision highp float;
layout(location = 0) out vec4 outColor;
in vec3 vColor;
in vec3 vWorld;
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform vec2 uBrush;
uniform float uBrushR;
uniform float uBrushOn;
uniform vec3 uBrushColor;
uniform float uContour;

void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;

  float diff = max(dot(n, uSun), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 lit = vColor * (uSky * sky * 0.55 + uGround * 0.12) + vColor * diff * 1.05;

  // Contour lines: one per metre of elevation, thinned by screen-space slope so
  // they stay a hairline on flat ground and vanish on cliffs.
  float h = vWorld.y * uContour;
  float d = fwidth(h);
  float line = 1.0 - smoothstep(0.0, d * 1.4, abs(fract(h + 0.5) - 0.5));
  lit *= 1.0 - line * 0.2 * clamp(1.0 - d * 0.5, 0.0, 1.0);

  float br = distance(vWorld.xz, uBrush);
  float ring = (1.0 - smoothstep(uBrushR - 0.55, uBrushR + 0.15, br)) * smoothstep(uBrushR - 1.9, uBrushR - 0.7, br);
  float fill = 1.0 - smoothstep(0.0, uBrushR, br);
  lit = mix(lit, uBrushColor, uBrushOn * (ring * 0.75 + fill * 0.10));

  float fogF = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
  outColor = vec4(mix(lit, uFog, fogF), 1.0);
}`;

export function createTerrainMesh() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z) * 3;
      pos[i] = gx2wx(x);
      pos[i + 2] = gx2wx(z);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setIndex(buildIndices());
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 12, 0), WORLD);

  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uSky: { value: new THREE.Color(0xbcd2ea) },
      uGround: { value: new THREE.Color(0x6b5b40) },
      uFog: { value: new THREE.Color(0x9db8cc) },
      uFogNear: { value: 280 },
      uFogFar: { value: 720 },
      uBrush: { value: new THREE.Vector2(0, 0) },
      uBrushR: { value: 5 },
      uBrushOn: { value: 0 },
      uBrushColor: { value: new THREE.Color(0xffe9a8) },
      uContour: { value: 1.0 },
    },
  });

  return new THREE.Mesh(geo, mat);
}

function buildIndices() {
  const idxArr = new Uint32Array((N - 1) * (N - 1) * 6);
  let p = 0;
  for (let z = 0; z < N - 1; z++) {
    for (let x = 0; x < N - 1; x++) {
      const a = z * N + x;
      idxArr[p++] = a;
      idxArr[p++] = a + N;
      idxArr[p++] = a + 1;
      idxArr[p++] = a + 1;
      idxArr[p++] = a + N;
      idxArr[p++] = a + N + 1;
    }
  }
  return new THREE.BufferAttribute(idxArr, 1);
}

const C = {
  rock: [0.35, 0.33, 0.31],
  scree: [0.47, 0.44, 0.4],
  snow: [0.9, 0.93, 0.97],
  soil: [0.44, 0.37, 0.25],
  grass: [0.34, 0.45, 0.21],
  lush: [0.28, 0.5, 0.18],
  wetSoil: [0.24, 0.2, 0.14],
  cut: [0.3, 0.25, 0.17],
  spoil: [0.58, 0.5, 0.36],
  fieldDry: [0.52, 0.42, 0.24],
  fieldWet: [0.36, 0.58, 0.2],
  village: [0.46, 0.43, 0.38],
  ice: [0.76, 0.87, 0.95],
};

const mix3 = (a, b, t, out) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
};

const tmpA = [0, 0, 0];
const tmpB = [0, 0, 0];

export function paintTerrain(mesh, world, water) {
  const pos = mesh.geometry.attributes.position.array;
  const col = mesh.geometry.attributes.aColor.array;
  const { terrain, origin, zone, fieldOf, softness, wall } = world;

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);
      const h = terrain[i];
      pos[i * 3 + 1] = h;

      const xm = x > 0 ? i - 1 : i;
      const xp = x < N - 1 ? i + 1 : i;
      const zm = z > 0 ? i - N : i;
      const zp = z < N - 1 ? i + N : i;
      const slope = Math.max(Math.abs(terrain[xp] - terrain[xm]), Math.abs(terrain[zp] - terrain[zm])) * 0.5;

      const wet = water ? water.wet[i] : 0;
      const zn = zone[i];

      if (zn === ZONE_FIELD) {
        const f = world.fields[fieldOf[i]];
        const soak = f ? Math.min(1, f.soaked / f.need) : 0;
        mix3(C.fieldDry, C.fieldWet, Math.max(soak, wet * 0.5), tmpA);
      } else if (zn === ZONE_VILLAGE) {
        tmpA[0] = C.village[0];
        tmpA[1] = C.village[1];
        tmpA[2] = C.village[2];
      } else {
        const rockiness = Math.min(1, slope * 1.25 + Math.max(0, (h - 22) * 0.06) + (1 - softness[i]) * 0.35);
        mix3(C.soil, C.grass, Math.min(1, Math.max(0, (18 - h) * 0.06 + 0.15)), tmpA);
        mix3(tmpA, C.rock, rockiness * 0.85, tmpB);
        mix3(tmpB, C.scree, Math.max(0, slope - 1.1) * 0.4, tmpA);
        // Snowline climbs as the valley descends, and steep faces shed their
        // snow, so the white stays on the head of the valley and the shoulders.
        const snowline = 26 + z * 0.2;
        const snow = Math.min(1, Math.max(0, (h - snowline) * 0.26)) * Math.max(0, 1 - slope * 0.7);
        if (snow > 0.001) mix3(tmpA, C.snow, snow, tmpA);
        if (wet > 0.001) {
          mix3(tmpA, C.wetSoil, Math.min(0.55, wet * 0.55), tmpB);
          mix3(tmpB, C.lush, Math.min(0.5, wet * 0.5) * (h < 24 ? 1 : 0.2), tmpA);
        }
      }

      // Freshly moved earth reads as itself: cut ground is dark and raw, and
      // anything built up out of the spoil pile is pale and dry.
      const moved = terrain[i] - origin[i];
      if (moved < -0.12) mix3(tmpA, C.cut, Math.min(0.7, -moved * 0.5), tmpA);
      else if (moved > 0.12) mix3(tmpA, C.spoil, Math.min(0.7, moved * 0.5), tmpA);

      if (wall[i] > 0.05) {
        mix3(tmpA, [0.36, 0.29, 0.2], 0.75, tmpA);
      }

      col[i * 3] = tmpA[0];
      col[i * 3 + 1] = tmpA[1];
      col[i * 3 + 2] = tmpA[2];
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.aColor.needsUpdate = true;
}

// The valley is a cut-out block of ground, so the four boundary edges drop
// away as bedrock rather than ending in mid-air.
export function createSkirtMesh() {
  const ring = 4 * N;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ring * 2 * 3), 3));
  const index = [];
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < N - 1; k++) {
      const a = (e * N + k) * 2;
      index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), WORLD * 1.2);
  const mat = new THREE.MeshLambertMaterial({ color: 0x6a5f52, side: THREE.DoubleSide, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function updateSkirt(mesh, world) {
  const pos = mesh.geometry.attributes.position.array;
  const t = world.terrain;
  const BOTTOM = -22;
  let p = 0;
  const put = (x, z, i) => {
    const wx = gx2wx(x);
    const wz = gx2wx(z);
    pos[p++] = wx;
    pos[p++] = t[i];
    pos[p++] = wz;
    pos[p++] = wx;
    pos[p++] = BOTTOM;
    pos[p++] = wz;
  };
  for (let k = 0; k < N; k++) put(k, 0, idx(k, 0));
  for (let k = 0; k < N; k++) put(N - 1, k, idx(N - 1, k));
  for (let k = 0; k < N; k++) put(N - 1 - k, N - 1, idx(N - 1 - k, N - 1));
  for (let k = 0; k < N; k++) put(0, N - 1 - k, idx(0, N - 1 - k));
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

// --------------------------------------------------------------------- water

const WATER_VERT = `
in float aDepth;
in float aSpeed;
out float vDepth;
out float vSpeed;
out vec3 vWorld;
void main() {
  vDepth = aDepth;
  vSpeed = aSpeed;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WATER_FRAG = `
precision highp float;
layout(location = 0) out vec4 outColor;
in float vDepth;
in float vSpeed;
in vec3 vWorld;
uniform vec3 uSun;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

float ripple(vec2 p) {
  vec2 f = fract(p);
  vec2 i = floor(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}

void main() {
  if (vDepth < 0.006) discard;

  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;

  // Surface chop, scaled by how fast the sim says this patch is moving.
  float chop = 0.35 + vSpeed * 0.55;
  vec2 rp = vWorld.xz * 1.6 + vec2(uTime * 1.1, uTime * -0.85);
  float r1 = ripple(rp) - 0.5;
  float r2 = ripple(rp * 2.3 + 11.0) - 0.5;
  n = normalize(n + vec3(r1, 0.0, r2) * chop * 0.55);

  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);

  float dTint = clamp(vDepth * 0.75, 0.0, 1.0);
  vec3 body = mix(uShallow, uDeep, dTint);

  vec3 hv = normalize(uSun + view);
  float spec = pow(max(dot(n, hv), 0.0), 90.0) * 0.9;
  float diff = 0.55 + 0.45 * max(dot(n, uSun), 0.0);

  // Foam where the sim is fast, and along the thin advancing edge.
  float foam = smoothstep(2.2, 4.8, vSpeed) * 0.7;
  foam += smoothstep(0.14, 0.02, vDepth) * smoothstep(0.6, 1.8, vSpeed) * 0.45;
  foam = clamp(foam * (0.7 + 0.5 * ripple(rp * 3.1)), 0.0, 0.9);

  vec3 col = body * diff + uSky * fres * 0.55 + vec3(spec);
  col = mix(col, vec3(0.93, 0.96, 0.99), foam);

  float alpha = clamp(smoothstep(0.006, 0.05, vDepth) * (0.66 + dTint * 0.2) + foam * 0.4, 0.0, 0.9);
  float fogF = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
  outColor = vec4(mix(col, uFog, fogF), alpha);
}`;

export function createWaterMesh() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * N * 3);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z) * 3;
      pos[i] = gx2wx(x);
      pos[i + 2] = gx2wx(z);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(N * N), 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(new Float32Array(N * N), 1));
  geo.setIndex(buildIndices());
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 12, 0), WORLD);

  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uShallow: { value: new THREE.Color(0x86e6de) },
      uDeep: { value: new THREE.Color(0x1b6f96) },
      uSky: { value: new THREE.Color(0xbcd8f2) },
      uFog: { value: new THREE.Color(0x9db8cc) },
      uFogNear: { value: 280 },
      uFogFar: { value: 720 },
      uTime: { value: 0 },
    },
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

export function updateWaterMesh(mesh, world, water) {
  const pos = mesh.geometry.attributes.position.array;
  const dep = mesh.geometry.attributes.aDepth.array;
  const spd = mesh.geometry.attributes.aSpeed.array;
  const { surface } = world;
  const { depth, speed } = water;

  for (let i = 0; i < depth.length; i++) {
    const d = depth[i];
    dep[i] = d;
    spd[i] = speed[i];
    pos[i * 3 + 1] = surface[i] + (d > 0.006 ? d : 0);
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.aDepth.needsUpdate = true;
  mesh.geometry.attributes.aSpeed.needsUpdate = true;
}

// ---------------------------------------------------------------- structures

export function createWallMesh(capacity = 3000) {
  const geo = new THREE.BoxGeometry(CELL * 1.04, 1, CELL * 1.04);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(0xffffff));
  mesh.capacity = capacity;
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

const dummy = new THREE.Object3D();
const wallColor = new THREE.Color();

export function updateWallMesh(mesh, world) {
  const { wall, terrain, strain, gateOf, gates } = world;
  let c = 0;
  for (let i = 0; i < wall.length && c < mesh.capacity; i++) {
    if (wall[i] <= 0.02) continue;
    const x = i % N;
    const z = (i / N) | 0;
    dummy.position.set(gx2wx(x), terrain[i], gx2wx(z));
    dummy.scale.set(1, wall[i], 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(c, dummy.matrix);
    const g = gateOf[i];
    if (g >= 0) {
      const open = gates[g] && gates[g].open;
      wallColor.setHex(open ? 0x3fa2c8 : 0xd9a441);
    } else {
      const s = Math.min(1, strain[i]);
      wallColor.setRGB(0.42 + s * 0.5, 0.33 - s * 0.14, 0.22 - s * 0.12);
    }
    mesh.setColorAt(c, wallColor);
    c++;
  }
  mesh.count = c;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- decoration

export function createProps(world) {
  const group = new THREE.Group();

  // Houses.
  const houseGeo = new THREE.BoxGeometry(2.4, 2.0, 3.0);
  houseGeo.translate(0, 1.0, 0);
  const roofGeo = new THREE.ConeGeometry(2.3, 1.5, 4);
  roofGeo.translate(0, 2.75, 0);
  const houseMat = new THREE.MeshLambertMaterial({ color: 0xdcd3c2 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8c4436 });
  for (const v of world.villages) {
    for (const h of v.houses) {
      const body = new THREE.Mesh(houseGeo, houseMat);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      body.position.set(gx2wx(h.x), h.y, gx2wx(h.z));
      roof.position.copy(body.position);
      body.rotation.y = h.rot;
      roof.rotation.y = h.rot + Math.PI / 4;
      group.add(body, roof);
    }
  }

  // Field posts, so a dry terrace is still visible from the far camera.
  const postGeo = new THREE.BoxGeometry(0.35, 1.6, 0.35);
  postGeo.translate(0, 0.8, 0);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6a5334 });
  for (const f of world.fields) {
    const corners = [
      [f.x, f.z],
      [f.x + f.w, f.z],
      [f.x, f.z + f.d],
      [f.x + f.w, f.z + f.d],
    ];
    for (const [cx, cz] of corners) {
      const p = new THREE.Mesh(postGeo, postMat);
      const gi = idx(Math.min(N - 1, cx | 0), Math.min(N - 1, cz | 0));
      p.position.set(gx2wx(cx), world.terrain[gi], gx2wx(cz));
      group.add(p);
    }
  }

  // The glacier snout above the sources.
  const iceMat = new THREE.MeshLambertMaterial({ color: 0xcfe6f5, transparent: true, opacity: 0.94 });
  for (const s of world.sources) {
    const w = s.w + 16;
    const gi = idx(Math.min(N - 1, (s.x + s.w / 2) | 0), 1);
    const y = world.terrain[gi];
    for (let k = 0; k < 3; k++) {
      const geo = new THREE.BoxGeometry(w - k * 3.5, 9, 16 - k * 2);
      const ice = new THREE.Mesh(geo, iceMat);
      ice.position.set(gx2wx(s.x + s.w / 2) + (k - 1) * 1.6, y - 2.6 + k * 1.5, gx2wx(-7 - k * 3));
      ice.rotation.x = -0.16;
      ice.rotation.y = (k - 1) * 0.06;
      group.add(ice);
    }
  }

  return group;
}
