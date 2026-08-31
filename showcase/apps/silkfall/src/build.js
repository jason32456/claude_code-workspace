import * as THREE from '../vendor/three.module.js';
import { NODE_COST, STRAND_TYPES } from './webmodel.js';

const PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const LIMITS = { x: 21.5, yTop: 15.5, yBottom: -15.5 };

// Build mode resolves the cursor to one of three things, in priority order:
// an existing node, a point on an existing strand (which becomes a new node),
// or empty air. Anchoring to a strand is what makes real orb webs possible.
export class Builder {
  constructor(model, view, audio) {
    this.model = model;
    this.view = view;
    this.audio = audio;
    this.active = false;
    this.type = 'capture';
    this.from = null;
    this.hover = null;
    this.cutMode = false;
    this.lastError = '';
    this.errorT = 0;
    this.ray = new THREE.Raycaster();
    this.point = new THREE.Vector3();
  }

  toggle() {
    this.active = !this.active;
    this.from = null;
    if (!this.active) {
      this.view.hideGhost();
      this.view.setCursor(0, 0, false);
    }
    return this.active;
  }

  swapType() {
    this.type = this.type === 'capture' ? 'frame' : 'capture';
  }

  worldPoint(pointer, camera) {
    this.ray.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
    const hit = this.ray.ray.intersectPlane(PLANE, this.point);
    return hit ? this.point : null;
  }

  resolve(p) {
    const node = this.model.closestNode(p.x, p.y, 1.15);
    if (node) return { kind: 'node', node, x: node.x, y: node.y };
    const onStrand = this.model.closestStrand(p.x, p.y, 0.9);
    if (onStrand) {
      return { kind: 'strand', hit: onStrand, x: onStrand.x, y: onStrand.y };
    }
    return { kind: 'empty', x: p.x, y: p.y };
  }

  inBounds(x, y) {
    return Math.abs(x) <= LIMITS.x && y <= LIMITS.yTop && y >= LIMITS.yBottom;
  }

  // Cost preview has to account for the node that a strand-anchor or an
  // empty-air endpoint will silently create.
  quote(target) {
    if (!this.from) return 0;
    const len = Math.hypot(target.x - this.from.x, target.y - this.from.y);
    let cost = len * STRAND_TYPES[this.type].costPerUnit;
    if (target.kind !== 'node') cost += NODE_COST;
    return cost;
  }

  update(pointer, camera, silk) {
    if (!this.active) return null;
    const p = this.worldPoint(pointer, camera);
    if (!p) return null;
    const target = this.resolve(p);
    this.hover = target;

    const legal = this.inBounds(target.x, target.y);
    this.view.setCursor(target.x, target.y, true, target.kind !== 'empty');

    if (this.from) {
      const cost = this.quote(target);
      const ok = legal && cost <= silk && this.validSpan(target);
      this.view.setGhost(this.from.x, this.from.y, target.x, target.y, ok);
      return { target, cost, ok };
    }
    this.view.hideGhost();
    return { target, cost: 0, ok: legal };
  }

  validSpan(target) {
    if (!this.from) return false;
    const len = Math.hypot(target.x - this.from.x, target.y - this.from.y);
    if (len < 0.8) return false;
    if (len > 26) return false;
    if (target.kind === 'node' && this.from.node && target.node === this.from.node) return false;
    if (target.kind === 'node' && this.from.node && this.model.connected(this.from.node, target.node)) return false;
    return true;
  }

  fail(msg) {
    this.lastError = msg;
    this.errorT = 1.6;
    if (this.audio) this.audio.deny();
    return null;
  }

  // Materialise whatever the cursor resolved to into a real node.
  materialise(target) {
    if (target.kind === 'node') return target.node;
    if (target.kind === 'strand') return this.model.splitStrand(target.hit.strand, target.hit.u);
    return this.model.addNode(target.x, target.y, 0, false);
  }

  click(pointer, camera, silk) {
    if (!this.active) return null;
    const p = this.worldPoint(pointer, camera);
    if (!p) return null;
    const target = this.resolve(p);

    if (this.cutMode) {
      const hit = this.model.closestStrand(p.x, p.y, 0.8);
      if (hit) {
        this.model.snap(hit.strand);
        return { cut: true };
      }
      return this.fail('Nothing to cut there');
    }

    if (!this.from) {
      // A run must start from silk that already exists, or the web would float.
      if (target.kind === 'empty') return this.fail('Start from a node or a strand');
      this.from = { ...target };
      return { started: true };
    }

    if (!this.inBounds(target.x, target.y)) return this.fail('Out of reach');
    if (!this.validSpan(target)) return this.fail('Bad span');
    const cost = this.quote(target);
    if (cost > silk) return this.fail('Not enough silk');

    const a = this.from.node || this.materialise(this.from);
    const b = this.materialise(target);
    if (!a || !b || a === b) {
      this.from = null;
      return this.fail('Bad span');
    }
    const strand = this.model.addStrand(a, b, this.type);
    if (!strand) {
      this.from = null;
      return this.fail('Already linked');
    }
    if (this.audio) this.audio.spin();
    // Chaining keeps the spiral flowing: the endpoint becomes the next start.
    this.from = { kind: 'node', node: b, x: b.x, y: b.y };
    return { built: true, cost, strand };
  }

  cancel() {
    if (this.from) {
      this.from = null;
      this.view.hideGhost();
      return true;
    }
    return false;
  }

  tick(dt) {
    if (this.errorT > 0) this.errorT -= dt;
  }
}
