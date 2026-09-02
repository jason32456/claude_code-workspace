import * as THREE from '../vendor/three.module.js';

export const WORLD_HALF = 230;
export const CLOUD_BASE = 148;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05070d);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0e1622, 0.0021);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 1400);
  camera.position.set(0, 90, 120);

  // Night baseline: bright enough to fly by, dim enough that the return stroke
  // is still the brightest thing that happens.
  const hemi = new THREE.HemisphereLight(0x6478a0, 0x1e2632, 1.75);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0xb6cbe8, 0.95);
  moon.position.set(-140, 190, -90);
  scene.add(moon);

  // The town's own lamps, so the valley floor reads as inhabited.
  const townGlow = new THREE.PointLight(0xffb268, 1.5, 230, 1.4);
  townGlow.position.set(0, 22, 0);
  scene.add(townGlow);

  // Pulsed by every return stroke; decays back to zero each frame.
  const strobe = new THREE.PointLight(0xbfd8ff, 0, 900, 1.6);
  strobe.position.set(0, 120, 0);
  scene.add(strobe);

  const sky = buildSky();
  scene.add(sky);

  const rain = buildRain();
  scene.add(rain.points);

  const state = { flash: 0, strobeDecay: 0 };

  function pulse(position, power) {
    strobe.position.copy(position);
    strobe.intensity = Math.max(strobe.intensity, power);
    state.flash = Math.max(state.flash, Math.min(0.3, power / 3000));
  }

  function update(dt, camPos) {
    strobe.intensity *= Math.pow(0.0016, dt);
    if (strobe.intensity < 0.01) strobe.intensity = 0;
    state.flash *= Math.pow(0.00006, dt);
    hemi.intensity = 1.75 + state.flash * 1.1;
    rain.update(dt, camPos);
    sky.position.set(camPos.x, 0, camPos.z);
  }

  function setRain(amount) {
    rain.setAmount(amount);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, pulse, update, setRain, state };
}

function buildSky() {
  const geo = new THREE.SphereGeometry(700, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        float h = clamp(vPos.y / 700.0, -1.0, 1.0);
        vec3 low = vec3(0.045, 0.058, 0.085);
        vec3 high = vec3(0.012, 0.017, 0.032);
        vec3 c = mix(low, high, smoothstep(-0.15, 0.75, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return mesh;
}

function buildRain() {
  const COUNT = 3600;
  const positions = new Float32Array(COUNT * 3);
  const speeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 260;
    positions[i * 3 + 1] = Math.random() * 160;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 260;
    speeds[i] = 55 + Math.random() * 45;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const cx = c.getContext('2d');
  const grad = cx.createRadialGradient(16, 16, 0, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({
    color: 0x8fa8c8,
    map: new THREE.CanvasTexture(c),
    size: 1.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  let amount = 0;
  let active = 0;

  return {
    points,
    setAmount(a) {
      amount = a;
    },
    update(dt, camPos) {
      active += (amount - active) * Math.min(1, dt * 1.2);
      mat.opacity = active * 0.32;
      if (active < 0.02) {
        points.visible = false;
        return;
      }
      points.visible = true;
      const p = geo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        p[i * 3 + 1] -= speeds[i] * dt * (0.4 + active);
        if (p[i * 3 + 1] < -5) {
          p[i * 3] = camPos.x + (Math.random() - 0.5) * 260;
          p[i * 3 + 1] = 150 + Math.random() * 30;
          p[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * 260;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
