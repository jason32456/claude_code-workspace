import * as THREE from '../vendor/three.module.js';
import { N, WORLD, gx2wx, wx2gx, bilinear } from './grid.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 8, 6);
    this.theta = 0.16;
    this.phi = 0.92;
    this.radius = 168;
    this.apply();
  }

  apply() {
    this.phi = clamp(this.phi, 0.16, 1.36);
    this.radius = clamp(this.radius, 34, 340);
    this.target.x = clamp(this.target.x, -WORLD * 0.5, WORLD * 0.5);
    this.target.z = clamp(this.target.z, -WORLD * 0.5, WORLD * 0.5);
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
  }

  orbit(dx, dy) {
    this.theta -= dx * 0.006;
    this.phi -= dy * 0.005;
    this.apply();
  }

  pan(dx, dy) {
    const s = this.radius * 0.0016;
    const cos = Math.cos(this.theta);
    const sin = Math.sin(this.theta);
    this.target.x += (-dx * cos + dy * sin) * s;
    this.target.z += (dx * sin + dy * cos) * s;
    this.apply();
  }

  zoom(delta) {
    this.radius *= Math.exp(delta * 0.0012);
    this.apply();
  }

  frame(t) {
    this.target.copy(t);
    this.apply();
  }
}

// Ray-march the height field instead of raycasting 32k triangles: cheaper, and
// it degrades into a sensible answer when the ray grazes a ridge.
export function pickTerrain(origin, dir, surface) {
  const sample = (x, z) => {
    const gx = wx2gx(x);
    const gz = wx2gx(z);
    if (gx < -6 || gz < -6 || gx > N + 5 || gz > N + 5) return -400;
    return bilinear(surface, clamp(gx, 0, N - 1), clamp(gz, 0, N - 1));
  };

  let t = 0.5;
  let step = 1.4;
  let prevT = 0;
  let prevDiff = origin.y - sample(origin.x, origin.z);
  const maxT = 900;

  while (t < maxT) {
    const px = origin.x + dir.x * t;
    const py = origin.y + dir.y * t;
    const pz = origin.z + dir.z * t;
    const diff = py - sample(px, pz);
    if (diff <= 0 && prevDiff > 0) {
      let lo = prevT;
      let hi = t;
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) * 0.5;
        const mx = origin.x + dir.x * mid;
        const my = origin.y + dir.y * mid;
        const mz = origin.z + dir.z * mid;
        if (my - sample(mx, mz) > 0) lo = mid;
        else hi = mid;
      }
      const hx = origin.x + dir.x * hi;
      const hz = origin.z + dir.z * hi;
      const gx = wx2gx(hx);
      const gz = wx2gx(hz);
      if (gx < 0 || gz < 0 || gx > N - 1 || gz > N - 1) return null;
      return { gx, gz, world: new THREE.Vector3(hx, origin.y + dir.y * hi, hz) };
    }
    prevDiff = diff;
    prevT = t;
    t += step;
    step = Math.min(4.0, step * 1.035);
  }
  return null;
}

export class Input {
  constructor(canvas, rig, handlers) {
    this.canvas = canvas;
    this.rig = rig;
    this.h = handlers;
    this.keys = new Set();
    this.painting = false;
    this.pointer = new THREE.Vector2();
    this.hasPointer = false;
    this.dragMode = null;
    this.last = { x: 0, y: 0 };
    this.touches = new Map();
    this.pinchDist = 0;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        rig.zoom(e.deltaY);
      },
      { passive: false }
    );
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => {
      this.keys.clear();
      this.painting = false;
      this.dragMode = null;
    });
  }

  setPointer(e) {
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.hasPointer = true;
  }

  onDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.last = { x: e.clientX, y: e.clientY };
    this.setPointer(e);

    if (e.pointerType === 'touch' && this.touches.size >= 2) {
      this.painting = false;
      this.dragMode = 'orbit';
      const pts = [...this.touches.values()];
      this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      return;
    }
    if (e.button === 2 || e.button === 1 || this.keys.has('Space')) {
      this.dragMode = e.button === 1 ? 'pan' : 'orbit';
    } else {
      this.painting = true;
      this.h.onPaintStart?.();
    }
  }

  onMove(e) {
    this.setPointer(e);
    if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const dx = e.clientX - this.last.x;
    const dy = e.clientY - this.last.y;
    this.last = { x: e.clientX, y: e.clientY };

    if (this.dragMode === 'orbit' && this.touches.size >= 2 && e.pointerType === 'touch') {
      const pts = [...this.touches.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.pinchDist) this.rig.zoom((this.pinchDist - d) * 2.2);
      this.pinchDist = d;
      this.rig.orbit(dx * 0.5, dy * 0.5);
      return;
    }
    if (this.dragMode === 'orbit') this.rig.orbit(dx, dy);
    else if (this.dragMode === 'pan') this.rig.pan(dx, dy);
  }

  onUp(e) {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinchDist = 0;
    if (this.painting) this.h.onPaintEnd?.();
    this.painting = false;
    this.dragMode = null;
  }

  onKey(e, down) {
    if (e.repeat) return;
    const code = e.code;
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    if (down) this.h.onKey?.(code, e);
    if (code === 'Space' && down && e.target === document.body) e.preventDefault();
  }

  cameraKeys(dt) {
    const k = this.keys;
    const sp = 60 * dt;
    if (k.has('KeyW')) this.rig.pan(0, sp * 7);
    if (k.has('KeyS')) this.rig.pan(0, -sp * 7);
    if (k.has('KeyA')) this.rig.pan(sp * 7, 0);
    if (k.has('KeyD')) this.rig.pan(-sp * 7, 0);
    if (k.has('KeyZ')) this.rig.zoom(-sp * 22);
    if (k.has('KeyX')) this.rig.zoom(sp * 22);
  }
}

export function pointerRay(camera, pointer) {
  const dir = new THREE.Vector3(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
  return dir;
}
