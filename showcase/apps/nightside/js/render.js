import * as THREE from '../vendor/three.module.js';
import { PLANET, CAMERA } from './config.js';

const ATMOS_VERT = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const ATMOS_FRAG = `
uniform vec3 uDay;
uniform vec3 uNight;
uniform vec3 uSun;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.6);
  float lit = smoothstep(-0.35, 0.55, dot(normalize(vNormal), normalize(uSun)));
  vec3 col = mix(uNight, uDay, lit);
  gl_FragColor = vec4(col, rim * (0.30 + 0.65 * lit));
}`;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x03060c, 1);

  const scene = new THREE.Scene();
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.5, 2000);
  camera.position.set(0, 12, CAMERA.startDist);

  const sunLight = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sunLight.position.set(1, 0, 0).multiplyScalar(120);
  scene.add(sunLight, sunLight.target);

  // The fight happens at night by design, so the dark side has to stay
  // readable — ambient is set for legibility, not for realism.
  scene.add(new THREE.AmbientLight(0x36486b, 1.6));
  const bounce = new THREE.HemisphereLight(0x5878ad, 0x1d1712, 0.8);
  scene.add(bounce);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET.radius * 1.09, 64, 48),
    new THREE.ShaderMaterial({
      vertexShader: ATMOS_VERT,
      fragmentShader: ATMOS_FRAG,
      uniforms: {
        uDay: { value: new THREE.Color(0x5aa8ff) },
        uNight: { value: new THREE.Color(0x9a3bd8) },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  scene.add(atmosphere);

  scene.add(makeStarfield());

  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(14, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
  );
  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(34, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  sunDisc.add(sunHalo);
  scene.add(sunDisc);

  function setSun(dir) {
    sunLight.position.copy(dir).multiplyScalar(120);
    sunDisc.position.copy(dir).multiplyScalar(420);
    atmosphere.material.uniforms.uSun.value.copy(dir);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);

  return { renderer, scene, camera, sunLight, setSun, resize };
}

function makeStarfield() {
  const count = 2200;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
    v.normalize().multiplyScalar(600 + Math.random() * 300);
    pos.set([v.x, v.y, v.z], i * 3);
    c.setHSL(0.55 + Math.random() * 0.12, 0.5, 0.6 + Math.random() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9,
  }));
}

export function sunDirection(elapsed, out = new THREE.Vector3()) {
  const axis = new THREE.Vector3(Math.sin(PLANET.axisTilt), Math.cos(PLANET.axisTilt), 0).normalize();
  const base = new THREE.Vector3(0, 0, 1).projectOnPlane(axis).normalize();
  return out.copy(base).applyAxisAngle(axis, (elapsed / PLANET.dayLength) * Math.PI * 2);
}
