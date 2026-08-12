import * as THREE from 'three';
import { WAVES, GRAVITY } from './config.js';

const Q = 0.74;
const MAX_GUSTS = 12;

// Precomputed wave terms, shared verbatim with the vertex shader so the CPU
// and GPU agree on where the water is.
const W = WAVES.map((w) => {
  const k = (Math.PI * 2) / w.len;
  return {
    dx: Math.sin(w.dir),
    dz: Math.cos(w.dir),
    k,
    a: w.steep / k,
    omega: Math.sqrt(GRAVITY * k),
    phase: w.phase,
  };
});

function displace(x, z, t, out) {
  let dx = 0, dy = 0, dz = 0;
  for (let i = 0; i < W.length; i++) {
    const w = W[i];
    const f = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase;
    const c = Math.cos(f);
    dx += Q * w.a * w.dx * c;
    dz += Q * w.a * w.dz * c;
    dy += w.a * Math.sin(f);
  }
  out.x = dx; out.y = dy; out.z = dz;
  return out;
}

const _d = { x: 0, y: 0, z: 0 };

// Gerstner waves move horizontally as well as vertically, so the surface point
// above a given (x,z) is not the one parameterised by (x,z). Two fixed-point
// passes get close enough for a hull to sit on.
export function waveHeight(x, z, t) {
  let px = x, pz = z;
  for (let i = 0; i < 2; i++) {
    displace(px, pz, t, _d);
    px = x - _d.x;
    pz = z - _d.z;
  }
  displace(px, pz, t, _d);
  return _d.y;
}

export function waveSlope(x, z, t, eps = 0.7) {
  const hx = waveHeight(x + eps, z, t) - waveHeight(x - eps, z, t);
  const hz = waveHeight(x, z + eps, t) - waveHeight(x, z - eps, t);
  return { x: hx / (2 * eps), z: hz / (2 * eps) };
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec4 uWaveA[4];   // dirX, dirZ, amplitude, k
uniform vec4 uWaveB[4];   // omega, phase, Q, unused
uniform vec4 uGusts[${MAX_GUSTS}];
uniform int uGustCount;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vGust;

void main() {
  vec3 pos = position;
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 p = world.xz;

  vec3 disp = vec3(0.0);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;

  for (int i = 0; i < 4; i++) {
    vec2 d = uWaveA[i].xy;
    float a = uWaveA[i].z;
    float k = uWaveA[i].w;
    float w = uWaveB[i].x;
    float ph = uWaveB[i].y;
    float q = uWaveB[i].z;

    float f = k * dot(d, p) - w * uTime + ph;
    float c = cos(f);
    float s = sin(f);

    disp.x += q * a * d.x * c;
    disp.z += q * a * d.y * c;
    disp.y += a * s;

    float wa = w * a;
    tangent.x -= q * d.x * d.x * k * a * s;
    tangent.z -= q * d.x * d.y * k * a * s;
    tangent.y += d.x * k * a * c;

    binormal.x -= q * d.x * d.y * k * a * s;
    binormal.z -= q * d.y * d.y * k * a * s;
    binormal.y += d.y * k * a * c;

    crest += max(0.0, s) * a * k;
  }

  pos += disp;
  vec3 wp = (modelMatrix * vec4(pos, 1.0)).xyz;

  float g = 0.0;
  for (int i = 0; i < ${MAX_GUSTS}; i++) {
    if (i >= uGustCount) break;
    vec4 gu = uGusts[i];
    float dist = length(wp.xz - gu.xy);
    float fall = 1.0 - smoothstep(gu.z * 0.62, gu.z, dist);
    g += fall * (gu.w - 1.0);
  }

  vWorld = wp;
  vNormal = normalize(cross(binormal, tangent));
  vCrest = crest;
  vGust = g;

  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uFog;
uniform float uTime;
uniform float uFogDensity;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
varying float vGust;

// Cheap trochoidal ripple detail — keeps the surface alive close to the camera
// without a texture fetch, and roughens up inside a gust.
vec3 ripple(vec2 p, float t, float amp) {
  float a = sin(p.x * 1.9 + t * 2.7) * cos(p.y * 1.7 - t * 2.1);
  float b = sin(p.x * 4.3 - t * 3.9 + 1.3) * cos(p.y * 3.7 + t * 3.1);
  float c = sin(dot(p, vec2(6.1, -5.3)) + t * 5.2);
  return vec3(a * 0.55 + b * 0.3 + c * 0.15, 0.0, b * 0.5 + a * 0.32 + c * 0.18) * amp;
}

void main() {
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 viewDir = toEye / dist;
  float gust = clamp(vGust, -0.4, 0.8);

  // Ripple detail is sub-pixel past a few dozen metres; keeping it there only
  // buys shimmer and moire.
  float detail = 1.0 - smoothstep(35.0, 190.0, dist);
  vec3 n = normalize(vNormal + ripple(vWorld.xz, uTime, (0.05 + max(0.0, gust) * 0.12) * detail));

  float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 4.0);
  fres = mix(0.03, 1.0, fres);

  float upness = clamp(n.y, 0.0, 1.0);
  vec3 body = mix(uDeep, uShallow, pow(upness, 3.0) * 0.55);

  // Gusts ruffle the surface, which scatters more and reflects less: the dark
  // patch a sailor reads off the water.
  body *= 1.0 - max(0.0, gust) * 0.34;
  body += max(0.0, -gust) * 0.045 * uShallow;

  vec3 color = mix(body, uSky, fres * (1.0 - max(0.0, gust) * 0.45));

  vec3 h = normalize(uSun + viewDir);
  float spec = pow(max(dot(n, h), 0.0), 220.0) * 1.9;
  float glit = pow(max(dot(n, h), 0.0), 34.0) * 0.16;
  color += uSunColor * (spec + glit) * (1.0 - max(0.0, gust) * 0.5);

  float foam = smoothstep(0.215, 0.305, vCrest) * (0.34 + max(0.0, gust) * 0.6);
  color = mix(color, vec3(0.93, 0.96, 0.99), clamp(foam, 0.0, 0.8));

  float fogAmt = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  color = mix(color, uFog, clamp(fogAmt, 0.0, 1.0));

  gl_FragColor = vec4(color, 1.0);
}
`;

export class Ocean {
  constructor(scene, palette, size = 900, segments = 300) {
    this.size = size;
    this.cell = size / segments;

    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const waveA = W.map((w) => new THREE.Vector4(w.dx, w.dz, w.a, w.k));
    const waveB = W.map((w) => new THREE.Vector4(w.omega, w.phase, Q, 0));

    this.uniforms = {
      uTime: { value: 0 },
      uWaveA: { value: waveA },
      uWaveB: { value: waveB },
      uGusts: { value: Array.from({ length: MAX_GUSTS }, () => new THREE.Vector4()) },
      uGustCount: { value: 0 },
      uDeep: { value: new THREE.Color(palette.deep) },
      uShallow: { value: new THREE.Color(palette.shallow) },
      uSky: { value: new THREE.Color(palette.skyTint) },
      uSun: { value: new THREE.Vector3().copy(palette.sunDir) },
      uSunColor: { value: new THREE.Color(palette.sunColor) },
      uFog: { value: new THREE.Color(palette.fog) },
      uFogDensity: { value: palette.fogDensity },
    };

    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    scene.add(this.mesh);
  }

  update(time, focusX, focusZ, gusts) {
    this.uniforms.uTime.value = time;

    // Snap to the vertex grid so the mesh slides under the waves instead of
    // dragging them along with the camera.
    this.mesh.position.x = Math.round(focusX / this.cell) * this.cell;
    this.mesh.position.z = Math.round(focusZ / this.cell) * this.cell;

    const arr = this.uniforms.uGusts.value;
    const n = Math.min(gusts.length, MAX_GUSTS);
    for (let i = 0; i < n; i++) {
      const g = gusts[i];
      arr[i].set(g.x, g.z, g.radius, g.strength);
    }
    this.uniforms.uGustCount.value = n;
  }
}
