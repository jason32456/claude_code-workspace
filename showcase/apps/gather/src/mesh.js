import * as THREE from '../vendor/three.module.js';
import { N } from './glass.js';

const SEG = 40;
const CAP = 6;
const ROWS = N + CAP;
const VERTS = ROWS * (SEG + 1);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Blackbody-ish, tuned so that "workable" reads as bright orange and the piece
// visibly dies out as it passes below about 700 C.
function heatColor(T, out) {
  const u = clamp((T - 555) / (1180 - 555), 0, 1);
  const i = 0.55 * u ** 1.9;
  out[0] = i;
  out[1] = i * (0.14 + 0.62 * u ** 2.6);
  out[2] = i * (0.02 + 0.4 * u ** 6);
}

export class PieceMesh {
  constructor(parent) {
    this.pos = new Float32Array(VERTS * 3);
    this.col = new Float32Array(VERTS * 3);
    this.glowPos = new Float32Array(VERTS * 3);
    this.glowCol = new Float32Array(VERTS * 3);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));

    this.glowGeo = new THREE.BufferGeometry();
    this.glowGeo.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3));
    this.glowGeo.setAttribute('color', new THREE.BufferAttribute(this.glowCol, 3));

    const index = new Uint16Array((ROWS - 1) * SEG * 6);
    let k = 0;
    for (let i = 0; i < ROWS - 1; i++) {
      for (let s = 0; s < SEG; s++) {
        const a = i * (SEG + 1) + s;
        const b = a + SEG + 1;
        index[k++] = a;
        index[k++] = b;
        index[k++] = a + 1;
        index[k++] = a + 1;
        index[k++] = b;
        index[k++] = b + 1;
      }
    }
    this.geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.glowGeo.setIndex(new THREE.BufferAttribute(index, 1));
    this.geo.computeVertexNormals();

    this.cold = new THREE.Mesh(
      this.geo,
      new THREE.MeshPhongMaterial({
        color: 0x8fb4c0,
        transparent: true,
        opacity: 0.34,
        shininess: 120,
        specular: 0xffffff,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.hot = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.glow = new THREE.Mesh(
      this.glowGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      })
    );
    parent.add(this.cold, this.hot, this.glow);

    this.rowX = new Float32Array(ROWS);
    this.rowR = new Float32Array(ROWS);
    this.rowY = new Float32Array(ROWS);
    this.rowZ = new Float32Array(ROWS);
    this.rowT = new Float32Array(ROWS);
    this.rgb = [0, 0, 0];
  }

  update(g) {
    const n = g.n;
    let rows = n;
    for (let i = 0; i < n; i++) {
      this.rowX[i] = g.z[i];
      this.rowR[i] = g.r[i];
      this.rowY[i] = g.sy[i];
      this.rowZ[i] = g.sz[i];
      this.rowT[i] = g.T[i];
    }
    if (!g.opened) {
      // dome the tip closed
      const rEnd = g.r[n - 1];
      const xEnd = g.z[n - 1];
      for (let c = 1; c <= CAP; c++) {
        const a = (c / CAP) * (Math.PI / 2);
        const i = n - 1 + c;
        this.rowX[i] = xEnd + rEnd * 0.82 * Math.sin(a);
        this.rowR[i] = Math.max(rEnd * Math.cos(a), 0.001);
        this.rowY[i] = g.sy[n - 1];
        this.rowZ[i] = g.sz[n - 1];
        this.rowT[i] = g.T[n - 1];
      }
      rows = n + CAP;
    }

    let p = 0;
    for (let i = 0; i < rows; i++) {
      heatColor(this.rowT[i], this.rgb);
      const r = this.rowR[i];
      const gr = r + 0.22 + 0.5 * this.rgb[0];
      for (let s = 0; s <= SEG; s++) {
        const th = (s / SEG) * Math.PI * 2;
        const c = Math.cos(th);
        const sn = Math.sin(th);
        this.pos[p] = this.rowX[i];
        this.pos[p + 1] = this.rowY[i] + r * c;
        this.pos[p + 2] = this.rowZ[i] + r * sn;
        this.glowPos[p] = this.rowX[i];
        this.glowPos[p + 1] = this.rowY[i] + gr * c;
        this.glowPos[p + 2] = this.rowZ[i] + gr * sn;
        // a chill line along the piece, so rotation is legible at a glance
        const seam = 1 + 0.4 * Math.exp(-(((th - Math.PI) / 0.22) ** 2));
        this.col[p] = this.rgb[0] * seam;
        this.col[p + 1] = this.rgb[1] * seam;
        this.col[p + 2] = this.rgb[2] * seam;
        this.glowCol[p] = this.rgb[0] * 0.38;
        this.glowCol[p + 1] = this.rgb[1] * 0.28;
        this.glowCol[p + 2] = this.rgb[2] * 0.2;
        p += 3;
      }
    }
    // collapse anything unused onto the last live vertex
    for (; p < VERTS * 3; p += 3) {
      this.pos[p] = this.pos[p - 3];
      this.pos[p + 1] = this.pos[p - 2];
      this.pos[p + 2] = this.pos[p - 1];
      this.glowPos[p] = this.glowPos[p - 3];
      this.glowPos[p + 1] = this.glowPos[p - 2];
      this.glowPos[p + 2] = this.glowPos[p - 1];
      this.col[p] = this.col[p + 1] = this.col[p + 2] = 0;
      this.glowCol[p] = this.glowCol[p + 1] = this.glowCol[p + 2] = 0;
    }

    const count = (rows - 1) * SEG * 6;
    this.geo.setDrawRange(0, count);
    this.glowGeo.setDrawRange(0, count);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.glowGeo.attributes.position.needsUpdate = true;
    this.glowGeo.attributes.color.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.glowGeo.computeBoundingSphere();
  }
}

// The target, drawn as a wire cage rather than a solid: dense enough to aim at,
// sparse enough to see the glowing piece through it.
export function buildGhost(order) {
  const verts = [];
  const push = (a, b) => verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const at = (u, th) => {
    const r = Math.max(order.r(u), 0.02);
    return new THREE.Vector3(u * order.length, r * Math.cos(th), r * Math.sin(th));
  };

  const LONG = 6;
  const STEPS = 46;
  for (let l = 0; l < LONG; l++) {
    const th = (l / LONG) * Math.PI * 2;
    for (let i = 0; i < STEPS; i++) {
      push(at(i / STEPS, th), at((i + 1) / STEPS, th));
    }
  }
  const RINGS = 11;
  const SEGS = 30;
  for (let k = 0; k <= RINGS; k++) {
    const u = k / RINGS;
    for (let s = 0; s < SEGS; s++) {
      push(at(u, (s / SEGS) * Math.PI * 2), at(u, ((s + 1) / SEGS) * Math.PI * 2));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0x5fa8ff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}
