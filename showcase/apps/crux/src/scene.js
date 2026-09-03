import * as THREE from '../vendor/three.module.js';
import { TOP_Y } from './wall.js';

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 low;
  uniform float storm;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 c = mix(low, horizon, smoothstep(0.28, 0.52, h));
    c = mix(c, top, smoothstep(0.5, 0.95, h));
    c = mix(c, vec3(0.28, 0.29, 0.33), storm * 0.75);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbfc9d4, 0.0032);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 900);
    this.camera.position.set(0, 3, 8);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          top: { value: new THREE.Color(0x2f6ec4) },
          horizon: { value: new THREE.Color(0xa8c6e4) },
          low: { value: new THREE.Color(0xdcd0bd) },
          storm: { value: 0 },
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xbdd7f5, 0x6a5f4c, 0.8);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0da, 1.7);
    this.sun.position.set(13, 8, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 46;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    const c = this.sun.shadow.camera;
    c.left = -7;
    c.right = 7;
    c.top = 7;
    c.bottom = -7;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x8fb4dd, 0.38);
    this.fill.position.set(-8, 4, 10);
    this.scene.add(this.fill);

    // Bounce off the valley, so undersides of roofs are not flat mud.
    this.bounce = new THREE.DirectionalLight(0xffd9a8, 0.32);
    this.bounce.position.set(2, -9, 8);
    this.scene.add(this.bounce);

    this.buildValley();
    this.buildClouds();
    this.buildRain();

    this.shake = 0;
    this.scanBlend = 0;
    this.dist = 5.6;
  }

  buildValley() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x4d5a41, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -9, -120);
    this.scene.add(floor);

    const ridges = new THREE.Group();
    const rng = (i) => ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
    for (let i = 0; i < 26; i++) {
      const h = 26 + rng(i) * 70;
      const g = new THREE.ConeGeometry(28 + rng(i + 9) * 46, h, 5);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.32 - rng(i + 3) * 0.08, 0.18, 0.26 + rng(i + 5) * 0.16),
        roughness: 1,
        flatShading: true,
      });
      const m = new THREE.Mesh(g, mat);
      const a = rng(i + 21) * Math.PI * 2;
      const r = 190 + rng(i + 33) * 320;
      m.position.set(Math.cos(a) * r, -9 + h / 2, Math.sin(a) * r - 60);
      m.rotation.y = rng(i + 41) * 3;
      ridges.add(m);
    }
    this.scene.add(ridges);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 34, 22, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x5b5449, roughness: 1, side: THREE.DoubleSide, flatShading: true })
    );
    base.position.set(0, -12, -6);
    this.scene.add(base);
  }

  buildClouds() {
    this.clouds = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.SphereGeometry(6 + Math.random() * 12, 8, 6);
      const m = new THREE.Mesh(g, mat.clone());
      m.scale.set(1 + Math.random(), 0.32, 0.7);
      m.position.set(-140 + Math.random() * 280, 12 + Math.random() * 110, -30 - Math.random() * 160);
      m.userData.speed = 0.6 + Math.random() * 1.4;
      this.clouds.add(m);
    }
    this.scene.add(this.clouds);
  }

  buildRain() {
    const count = 2200;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = Math.random() * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xc8d8ef, size: 0.045, transparent: true, opacity: 0.0, depthWrite: false })
    );
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  setStorm(t) {
    this.sky.material.uniforms.storm.value = t;
    this.sun.intensity = 1.7 * (1 - t * 0.72);
    this.hemi.intensity = 0.8 * (1 - t * 0.35);
    this.scene.fog.density = 0.0032 + t * 0.012;
    this.scene.fog.color.setRGB(0.75 - t * 0.3, 0.79 - t * 0.3, 0.83 - t * 0.28);
    this.rain.material.opacity = Math.max(0, (t - 0.35) * 0.9);
  }

  updateAmbient(dt, focus, wind) {
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt * (1 + wind * 2);
      if (c.position.x > 160) c.position.x = -160;
    }
    if (this.rain.material.opacity > 0) {
      const p = this.rain.geometry.attributes.position;
      const arr = p.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= dt * 22;
        arr[i] += dt * wind * 9;
        if (arr[i + 1] < -11) {
          arr[i + 1] = 11;
          arr[i] = (Math.random() - 0.5) * 26;
          arr[i + 2] = (Math.random() - 0.5) * 16;
        }
      }
      p.needsUpdate = true;
      this.rain.position.set(focus.x, focus.y, focus.z);
    }
  }

  updateCamera(dt, climber, scan, aim) {
    const hips = climber.hips;
    const n = climber.wall.normalAt(hips.x, hips.y);
    this.scanBlend += ((scan ? 1 : 0) - this.scanBlend) * Math.min(1, dt * 5);
    const lean = climber.wall.leanAt(hips.y);
    const steep = THREE.MathUtils.clamp(lean, 0, 0.6);
    const dist = THREE.MathUtils.lerp(5.7 + steep * 4.4, 15.5, this.scanBlend);
    const rise = THREE.MathUtils.lerp(1.35 - steep * 2.4, 4.2, this.scanBlend);

    const want = new THREE.Vector3(
      hips.x * 0.55 + aim.x * 0.9,
      hips.y + rise + aim.y * 0.5,
      hips.z + dist * Math.max(0.55, n.z)
    );
    want.x += n.x * dist * 0.35;
    this.camera.position.lerp(want, Math.min(1, dt * (this.scanBlend > 0.05 ? 4 : 5.5)));

    const look = new THREE.Vector3(
      hips.x * 0.7 + aim.x * 0.7,
      hips.y + 1.15 + this.scanBlend * 2.8 + aim.y * 0.55,
      hips.z - 0.6
    );
    if (!this._look) this._look = look.clone();
    this._look.lerp(look, Math.min(1, dt * 6));
    this.camera.lookAt(this._look);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    this.sun.position.set(hips.x + 13, hips.y + 7.5, hips.z + 9);
    this.sun.target.position.set(hips.x, hips.y, hips.z - 1);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

export { TOP_Y };
