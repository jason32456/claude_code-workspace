import * as THREE from 'three';

export const PALETTE = {
  deep: 0x0a2c46,
  shallow: 0x1d7fa3,
  skyTint: 0x9fc6e8,
  sunColor: 0xfff0cf,
  fog: 0xb9d3e6,
  fogDensity: 0.0026,
  sunDir: new THREE.Vector3(0.42, 0.36, -0.83).normalize(),
};

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunColor;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 1.15 + 0.06, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.62));

  float sun = max(dot(d, normalize(uSun)), 0.0);
  col += uSunColor * pow(sun, 900.0) * 3.2;
  col += uSunColor * pow(sun, 22.0) * 0.28;
  col += uSunColor * pow(sun, 4.0) * 0.07;

  // Thin banded cloud, just enough to give the sky a direction.
  float band = sin(d.x * 3.1 + d.z * 2.2) * 0.5 + 0.5;
  float cloud = smoothstep(0.55, 0.95, band) * smoothstep(0.02, 0.42, d.y) * 0.16;
  col = mix(col, vec3(1.0), cloud);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(4000, 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(0x2f6fae) },
      uHorizon: { value: new THREE.Color(PALETTE.fog) },
      uSun: { value: PALETTE.sunDir.clone() },
      uSunColor: { value: new THREE.Color(PALETTE.sunColor) },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
  sun.position.copy(PALETTE.sunDir).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  const s = 42;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0016;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x0d3350, 1.15));

  return { mesh, sun };
}
