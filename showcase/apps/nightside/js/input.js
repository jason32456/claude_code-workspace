import * as THREE from '../vendor/three.module.js';
import { CAMERA, BUILD_ORDER, BUILDINGS } from './config.js';

export class Controls {
  constructor(canvas, camera, game) {
    this.canvas = canvas;
    this.camera = camera;
    this.game = game;
    this.theta = 0.6;
    this.phi = Math.PI * 0.42;
    this.dist = CAMERA.startDist;
    this.dragging = false;
    this.moved = 0;
    this.last = { x: 0, y: 0 };
    this.pointer = new THREE.Vector2(-2, -2);
    this.ray = new THREE.Raycaster();
    this.spin = 0;
    this.apply();

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => this.onKey(e));
  }

  onDown(e) {
    this.dragging = true;
    this.moved = 0;
    this.last.x = e.clientX;
    this.last.y = e.clientY;
    this.canvas.setPointerCapture?.(e.pointerId);
  }

  onUp(e) {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved < 6) {
      if (e.button === 2) this.game.clearSelection();
      else this.game.clickTile(this.hoverId);
    }
  }

  onMove(e) {
    const dx = e.clientX - this.last.x;
    const dy = e.clientY - this.last.y;
    this.last.x = e.clientX;
    this.last.y = e.clientY;
    if (this.dragging) {
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.theta -= dx * 0.005;
      this.phi = THREE.MathUtils.clamp(this.phi - dy * 0.005, 0.12, Math.PI - 0.12);
      this.apply();
    }
    this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  }

  onWheel(e) {
    e.preventDefault();
    this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.02, CAMERA.minDist, CAMERA.maxDist);
    this.apply();
  }

  onKey(e) {
    const g = this.game;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); g.callWave(); return; }
    if (k === 'escape') { g.clearSelection(); return; }
    if (k === 'u') { g.upgradeSelected(); return; }
    if (k === 'x') { g.sellSelected(); return; }
    if (k === 'p') { g.togglePause(); return; }
    if (k === 'm') { g.toggleMute(); return; }
    if (k === 'r' && e.shiftKey) { g.restart(); return; }
    const pick = BUILD_ORDER.find((b) => BUILDINGS[b].hotkey === e.key);
    if (pick) g.selectBuild(pick);
  }

  apply() {
    const sp = new THREE.Spherical(this.dist, this.phi, this.theta);
    this.camera.position.setFromSpherical(sp);
    this.camera.lookAt(0, 0, 0);
  }

  update(dt, planetMesh, faceTile) {
    if (!this.dragging && this.spin) {
      this.theta += dt * this.spin;
      this.apply();
    }
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObject(planetMesh, false)[0];
    this.hoverId = hit ? faceTile[hit.faceIndex] : -1;
    return this.hoverId;
  }
}
