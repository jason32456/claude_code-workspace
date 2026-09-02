import * as THREE from '../vendor/three.module.js';
import { R } from './player.js';

export const WALL = { minX: -15.4, maxX: 15.4, minY: -1.6, maxY: 17.2 };

function noiseTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8d8578';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.028;
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 4 + Math.random() * 42;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#3a342c';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,238,205,1)');
  g.addColorStop(0.25, 'rgba(255,214,150,0.45)');
  g.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.Fog(0x05070c, 34, 72);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
    this.camera.position.set(2.6, 9.4, 26.5);
    this.camera.lookAt(0, 7.4, 0);
    this.camAnchor = new THREE.Vector3(2.6, 9.4, 26.5);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xb4aea3,
      roughness: 0.94,
      metalness: 0,
      map: noiseTexture(),
    });
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(64, 44, 1, 1), wallMat);
    this.wall.position.set(0, 8, 0);
    this.scene.add(this.wall);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.6, 14);
    this.scene.add(floor);

    const grid = new THREE.GridHelper(60, 30, 0x2b3448, 0x1a2130);
    grid.position.set(0, -2.58, 14);
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    this.scene.add(grid);

    this.scene.add(new THREE.AmbientLight(0x2a3a52, 1.1));
    const fill = new THREE.DirectionalLight(0x7fa6d8, 0.5);
    fill.position.set(6, 6, 20);
    this.scene.add(fill);

    this.lamp = new THREE.PointLight(0xffd9a6, 540, 0, 2);
    this.lamp.position.set(0, 10, 13);
    this.scene.add(this.lamp);

    this.lampBody = new THREE.Group();
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff2d4 })
    );
    this.lampBody.add(bulb);
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.62, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd9a6, wireframe: true, transparent: true, opacity: 0.55 })
    );
    this.lampBody.add(cage);
    this.lampCage = cage;
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })
    );
    halo.scale.set(5.2, 5.2, 1);
    this.lampBody.add(halo);
    this.lampHalo = halo;
    this.lampPick = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.lampBody.add(this.lampPick);
    this.scene.add(this.lampBody);

    // One dynamic mesh holds every shadow polygon: the same triangles the
    // player collides with, so the two can never drift apart.
    this.maxShadowVerts = 4096;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxShadowVerts * 3), 3));
    sg.setDrawRange(0, 0);
    this.shadowMesh = new THREE.Mesh(
      sg,
      new THREE.MeshBasicMaterial({ color: 0x04060b, transparent: true, opacity: 0.93, depthWrite: false })
    );
    this.shadowMesh.frustumCulled = false;
    this.shadowMesh.renderOrder = 1;
    this.scene.add(this.shadowMesh);

    this.buildPlayer();
    this.buildProps();

    this.casterRoot = new THREE.Group();
    this.scene.add(this.casterRoot);

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildPlayer() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CircleGeometry(R, 30),
      new THREE.MeshBasicMaterial({ color: 0x0a1020 })
    );
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(R * 0.9, R * 1.08, 30),
      new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.92 })
    );
    rim.position.z = 0.002;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd6f8ff });
    this.eyes = new THREE.Group();
    for (const dx of [-0.13, 0.13]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12), eyeMat);
      e.position.set(dx, 0.07, 0.004);
      this.eyes.add(e);
    }
    g.add(body, rim, this.eyes);
    g.position.z = 0.09;
    this.playerRim = rim;
    this.playerGroup = g;
    this.scene.add(g);
  }

  buildProps() {
    this.doorGroup = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.02, 6),
      new THREE.MeshBasicMaterial({ color: 0x5fe3ff, transparent: true, opacity: 0.9 })
    );
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.86, 6),
      new THREE.MeshBasicMaterial({ color: 0x0d2b38, transparent: true, opacity: 0.85 })
    );
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), color: 0x6fe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 })
    );
    glow.scale.set(4.4, 4.4, 1);
    this.doorFrame = frame;
    this.doorCore = core;
    this.doorGlow = glow;
    this.doorGroup.add(core, frame, glow);
    this.doorGroup.position.z = 0.05;
    this.scene.add(this.doorGroup);

    this.moteGroup = new THREE.Group();
    this.moteGroup.position.z = 0.06;
    this.scene.add(this.moteGroup);

    this.sealGroup = new THREE.Group();
    this.sealGroup.position.z = 0.035;
    this.scene.add(this.sealGroup);
  }

  setMotes(list) {
    this.moteGroup.clear();
    this.moteMeshes = list.map((m) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.3, 18),
        new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.95 })
      );
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.45 })
      );
      glow.scale.set(1.5, 1.5, 1);
      g.add(ring, glow);
      g.position.set(m.x, m.y, 0);
      this.moteGroup.add(g);
      return g;
    });
  }

  setSeal(polys) {
    this.sealGroup.clear();
    this.sealMats = [];
    if (!polys || !polys.length) return;
    for (const poly of polys) {
      const shape = new THREE.Shape();
      poly.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
      shape.closePath();
      const fillMat = new THREE.MeshBasicMaterial({ color: 0x2b6f88, transparent: true, opacity: 0.2, depthWrite: false });
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), fillMat);
      const pts = poly.map((p) => new THREE.Vector3(p.x, p.y, 0.004));
      pts.push(pts[0].clone());
      const lineMat = new THREE.LineDashedMaterial({ color: 0x7fe9ff, dashSize: 0.34, gapSize: 0.24, transparent: true, opacity: 0.95 });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      line.computeLineDistances();
      this.sealMats.push(fillMat, lineMat);
      this.sealGroup.add(fill, line);
    }
  }

  setSealState(open, pulse) {
    if (!this.sealMats) return;
    for (const m of this.sealMats) {
      m.color.setHex(open ? 0x7dffc6 : 0x7fe9ff);
      if (m.isMeshBasicMaterial) m.opacity = open ? 0.3 : 0.14 + 0.16 * pulse;
    }
  }

  writeShadows(polys) {
    const attr = this.shadowMesh.geometry.getAttribute('position');
    const arr = attr.array;
    let n = 0;
    for (const poly of polys) {
      for (let i = 1; i < poly.length - 1; i++) {
        if (n + 9 > arr.length) break;
        const a = poly[0], b = poly[i], c = poly[i + 1];
        arr[n++] = a.x; arr[n++] = a.y; arr[n++] = 0.02;
        arr[n++] = b.x; arr[n++] = b.y; arr[n++] = 0.02;
        arr[n++] = c.x; arr[n++] = c.y; arr[n++] = 0.02;
      }
    }
    attr.needsUpdate = true;
    this.shadowMesh.geometry.setDrawRange(0, n / 3);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole wall in frame on narrow windows by backing the camera off.
    const need = 33 / Math.max(0.8, this.camera.aspect);
    this.camera.position.z = Math.max(26.5, need);
    this.camAnchor.z = this.camera.position.z;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
