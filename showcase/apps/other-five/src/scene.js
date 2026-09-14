// Renderer, water column and light. Night is not a filter here — the fog
// colour, the moonlight and the surface all move together as dawn comes up,
// and dawn coming up is the thing that ends the level.

import * as THREE from '../vendor/three.module.js';
import { lerp, clamp } from './rng.js';

const NIGHT_FOG = new THREE.Color(0x03151f);
const DAWN_FOG = new THREE.Color(0x2d6f88);

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(NIGHT_FOG.clone(), 0.040);
    this.scene.fog = this.fog;
    this.scene.background = NIGHT_FOG.clone();

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.08, 260);

    this.hemi = new THREE.HemisphereLight(0x3d7f9a, 0x121f18, 1.0);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xcfe8ff, 1.1);
    this.moon.position.set(14, 34, 8);
    this.scene.add(this.moon);
    // A warm bounce off the sand, so the reef is not one flat sheet of blue.
    this.bounce = new THREE.DirectionalLight(0xffd9a8, 0.35);
    this.bounce.position.set(-16, -6, -12);
    this.scene.add(this.bounce);
    this.fill = new THREE.AmbientLight(0x18333f, 0.38);
    this.scene.add(this.fill);

    this._buildSurface();

    addEventListener('resize', () => this.resize());
  }

  _buildSurface() {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(400, 400, 40, 40);
    geo.rotateX(Math.PI / 2);
    this.surfMat = new THREE.MeshBasicMaterial({
      color: 0x08303f, side: THREE.DoubleSide, transparent: true, opacity: 0.72,
    });
    this.surface = new THREE.Mesh(geo, this.surfMat);
    this.surface.position.y = 15;
    g.add(this.surface);
    this.surfBase = geo.attributes.position.array.slice();

    // Moon shafts — cheap additive cones, but they sell the depth.
    this.shafts = [];
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0x7fd0e8, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(2.6 + Math.random() * 2.5, 30, 6, 1, true), shaftMat);
      c.position.set((Math.random() - 0.5) * 60, 2, (Math.random() - 0.5) * 60);
      c.rotation.z = (Math.random() - 0.5) * 0.25;
      c.rotation.x = (Math.random() - 0.5) * 0.15;
      g.add(c);
      this.shafts.push(c);
    }
    this.shaftMat = shaftMat;
    this.scene.add(g);
    this.surfaceGroup = g;
  }

  setDawn(k) {
    const t = clamp(k, 0, 1);
    const c = NIGHT_FOG.clone().lerp(DAWN_FOG, t * t);
    this.fog.color.copy(c);
    this.scene.background.copy(c);
    this.fog.density = lerp(0.038, 0.024, t);
    this.hemi.intensity = lerp(1.0, 2.3, t);
    this.moon.intensity = lerp(1.1, 2.7, t);
    this.moon.color.setHSL(lerp(0.58, 0.10, t), lerp(0.45, 0.55, t), lerp(0.72, 0.68, t));
    this.surfMat.color.setHex(t > 0.5 ? 0x2f7f95 : 0x08303f);
    this.shaftMat.opacity = lerp(0.045, 0.14, t);
  }

  animateSurface(t) {
    const p = this.surface.geometry.attributes.position;
    const arr = p.array, base = this.surfBase;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], z = base[i + 2];
      arr[i + 1] = Math.sin(x * 0.06 + t * 0.9) * 0.55 + Math.cos(z * 0.05 - t * 0.7) * 0.45;
    }
    p.needsUpdate = true;
    for (const s of this.shafts) s.rotation.y = t * 0.05;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
