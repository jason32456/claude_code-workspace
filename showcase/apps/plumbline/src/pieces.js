import * as THREE from '../vendor/three.module.js';
import { boxGeo, mergeGeos } from './build3d.js';

// mass drives the LMI, area drives how much the wind owns it. The panel is the
// joke that makes the game work: the lightest piece is by far the hardest,
// because wind acceleration is force over mass.
export const PIECES = {
  core: {
    key: 'core', name: 'CORE MODULE', mass: 12000, area: 4.5,
    size: [5.0, 3.2, 4.2], color: 0x98a1ab, yawTol: 14, base: 520, spawn: [9.2, 12.4],
  },
  column: {
    key: 'column', name: 'COLUMN', mass: 8000, area: 2.4,
    size: [1.25, 3.4, 1.25], color: 0xc2603a, yawTol: 24, base: 340, spawn: [12, 19],
  },
  beam: {
    key: 'beam', name: 'BEAM', mass: 4000, area: 2.8,
    size: [9.2, 0.95, 0.9], color: 0x4d86b5, yawTol: 7, base: 410, spawn: [13, 24],
  },
  panel: {
    key: 'panel', name: 'FACADE PANEL', mass: 1500, area: 11.5,
    size: [5.6, 3.2, 0.36], color: 0x5fb79f, yawTol: 9, base: 300, spawn: [15, 27],
  },
};

const LUG = 0.3;

export function pieceGeometry(spec) {
  const [w, h, d] = spec.size;
  const g = [boxGeo(w, h, d, 0, -(LUG + h / 2), 0)];
  if (spec.key === 'core') {
    g.push(boxGeo(w * 0.55, h * 0.85, d * 0.2, 0, -(LUG + h / 2), d / 2));
    g.push(boxGeo(0.25, h, 0.25, w / 2 - 0.2, -(LUG + h / 2), d / 2 - 0.2));
    g.push(boxGeo(0.25, h, 0.25, -w / 2 + 0.2, -(LUG + h / 2), d / 2 - 0.2));
  } else if (spec.key === 'beam') {
    g.push(boxGeo(w, 0.18, d * 2.1, 0, -(LUG + 0.1), 0));
    g.push(boxGeo(w, 0.18, d * 2.1, 0, -(LUG + h - 0.1), 0));
  } else if (spec.key === 'panel') {
    g.push(boxGeo(w, 0.18, d * 2.6, 0, -(LUG + 0.12), 0));
    g.push(boxGeo(w, 0.18, d * 2.6, 0, -(LUG + h - 0.12), 0));
  }
  g.push(boxGeo(0.22, LUG, 0.22, 0, -LUG / 2, 0));
  g.push(boxGeo(0.9, 0.12, 0.12, 0, -LUG, 0));
  return mergeGeos(g);
}

const matCache = new Map();
export function pieceMaterial(spec) {
  if (!matCache.has(spec.key)) {
    matCache.set(spec.key, new THREE.MeshStandardMaterial({
      color: spec.color, roughness: spec.key === 'panel' ? 0.35 : 0.8,
      metalness: spec.key === 'panel' ? 0.4 : 0.15,
    }));
  }
  return matCache.get(spec.key);
}

const geoCache = new Map();
export function makePiece(spec) {
  if (!geoCache.has(spec.key)) geoCache.set(spec.key, pieceGeometry(spec));
  const m = new THREE.Mesh(geoCache.get(spec.key), pieceMaterial(spec));
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.spec = spec;
  return m;
}

// Distance from the lug (which is what hangs on the hook) down to the underside.
export const pieceDrop = (spec) => LUG + spec.size[1];
