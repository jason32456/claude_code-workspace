import * as THREE from 'three';

const SAMPLES = 2000;
const SEARCH_WINDOW = 300;

export interface TrackInfo {
  index: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  rightNormal: THREE.Vector3;
  signedDist: number;
  onTrack: boolean;
}

export class Track {
  readonly width = 18;
  readonly halfWidth = 9;
  private curve: THREE.CatmullRomCurve3;
  private positions: THREE.Vector3[] = [];
  private tangents: THREE.Vector3[] = [];
  readonly startPosition: THREE.Vector3;
  readonly startHeading: number;
  readonly totalLength: number;

  constructor() {
    // Circuit "Apex" — hand-crafted with hairpin, back straight, chicane
    const raw: [number, number][] = [
      [0, 0], [0, 55], [0, 100],
      [25, 130], [65, 140], [105, 130],
      [130, 100], [138, 60], [130, 22],
      [108, 0], [80, -18], [45, -45],
      [0, -75], [-45, -75], [-78, -55],
      [-96, -22], [-85, 12], [-65, 28],
      [-38, 22], [-18, 10], [-6, 0],
    ];

    const pts = raw.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.totalLength = this.curve.getLength();

    for (let i = 0; i < SAMPLES; i++) {
      const t = i / SAMPLES;
      const pos = this.curve.getPoint(t);
      pos.y = 0;
      const tan = this.curve.getTangent(t).normalize();
      tan.y = 0; tan.normalize();
      this.positions.push(pos);
      this.tangents.push(tan);
    }

    this.startPosition = this.positions[0].clone();
    this.startPosition.y = 0.3;
    const t0 = this.tangents[0];
    this.startHeading = Math.atan2(t0.x, t0.z);
  }

  /** Fast windowed search around a hint — use every frame */
  findNearest(worldPos: THREE.Vector3, hint: number): TrackInfo {
    let minDistSq = Infinity;
    let bestIdx = hint;
    const half = SEARCH_WINDOW >> 1;

    for (let i = -half; i <= half; i++) {
      const idx = ((hint + i) % SAMPLES + SAMPLES) % SAMPLES;
      const p = this.positions[idx];
      const dx = worldPos.x - p.x;
      const dz = worldPos.z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        bestIdx = idx;
      }
    }

    return this._makeInfo(bestIdx, worldPos);
  }

  /** Full search with coarse-then-fine — use at startup/setup only */
  findNearestFull(worldPos: THREE.Vector3): TrackInfo {
    const COARSE = 20;
    let bestCoarse = 0;
    let minSq = Infinity;
    for (let i = 0; i < SAMPLES; i += COARSE) {
      const p = this.positions[i];
      const dx = worldPos.x - p.x, dz = worldPos.z - p.z;
      const sq = dx * dx + dz * dz;
      if (sq < minSq) { minSq = sq; bestCoarse = i; }
    }
    // Refine ±COARSE*2 around best
    let bestIdx = bestCoarse;
    minSq = Infinity;
    const lo = bestCoarse - COARSE * 2, hi = bestCoarse + COARSE * 2;
    for (let i = lo; i <= hi; i++) {
      const idx = ((i % SAMPLES) + SAMPLES) % SAMPLES;
      const p = this.positions[idx];
      const dx = worldPos.x - p.x, dz = worldPos.z - p.z;
      const sq = dx * dx + dz * dz;
      if (sq < minSq) { minSq = sq; bestIdx = idx; }
    }
    return this._makeInfo(bestIdx, worldPos);
  }

  private _makeInfo(idx: number, worldPos: THREE.Vector3): TrackInfo {
    const trackPos = this.positions[idx];
    const tangent = this.tangents[idx];
    const rightNormal = new THREE.Vector3(tangent.z, 0, -tangent.x);
    const dx = worldPos.x - trackPos.x;
    const dz = worldPos.z - trackPos.z;
    const signedDist = dx * rightNormal.x + dz * rightNormal.z;
    return {
      index: idx,
      position: trackPos,
      tangent,
      rightNormal,
      signedDist,
      onTrack: Math.abs(signedDist) < this.halfWidth,
    };
  }

  getPositions(): THREE.Vector3[] { return this.positions; }
  getTangents(): THREE.Vector3[] { return this.tangents; }

  buildScene(): THREE.Group {
    const group = new THREE.Group();
    group.add(this._buildGround());
    group.add(this._buildRoad());
    group.add(this._buildKerbs());
    group.add(this._buildBarriers());
    group.add(this._buildStartLine());
    group.add(this._buildEnvironment());
    return group;
  }

  private _buildGround(): THREE.Mesh {
    const geom = new THREE.PlaneGeometry(800, 800);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a6b2a });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = -0.05;
    mesh.receiveShadow = true;
    return mesh;
  }

  private _buildRoad(): THREE.Mesh {
    const N = 600;
    const hw = this.halfWidth;
    const verts: number[] = [], idxs: number[] = [], uvs: number[] = [];
    let uDist = 0;
    let prevPos: THREE.Vector3 | null = null;

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const pos = this.curve.getPoint(t); pos.y = 0;
      const tan = this.curve.getTangent(t).normalize(); tan.y = 0; tan.normalize();
      if (prevPos) uDist += pos.distanceTo(prevPos) / 12;
      prevPos = pos.clone();

      const rx = tan.z, rz = -tan.x;
      verts.push(pos.x - rx * hw, 0, pos.z - rz * hw,
                 pos.x + rx * hw, 0, pos.z + rz * hw);
      uvs.push(0, uDist, 1, uDist);

      if (i < N) {
        const b = i * 2;
        idxs.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(idxs);
    geom.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0x282828 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private _buildKerbs(): THREE.Group {
    const group = new THREE.Group();
    const N = 400, hw = this.halfWidth, kw = 2.0;

    for (const side of [-1, 1]) {
      const verts: number[] = [], idxs: number[] = [], colors: number[] = [];

      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const pos = this.curve.getPoint(t); pos.y = 0;
        const tan = this.curve.getTangent(t).normalize(); tan.y = 0; tan.normalize();
        const rx = tan.z, rz = -tan.x;

        const inner = hw * side, outer = (hw + kw) * side;
        const px = pos.x + rx * inner, pz = pos.z + rz * inner;
        const qx = pos.x + rx * outer, qz = pos.z + rz * outer;
        verts.push(px, 0.02, pz, qx, 0.02, qz);

        const red = Math.floor(i / 4) % 2 === 0;
        const [r, g, b] = red ? [1, 0.05, 0.05] : [1, 1, 1];
        colors.push(r, g, b, r, g, b);

        if (i < N) {
          const base = i * 2;
          if (side === 1) {
            idxs.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
          } else {
            idxs.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
          }
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geom.setIndex(idxs);
      geom.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      group.add(new THREE.Mesh(geom, mat));
    }
    return group;
  }

  private _buildBarriers(): THREE.Group {
    const group = new THREE.Group();
    const STEP = 12, hw = this.halfWidth + 2.6;
    const W = 0.5, H = 0.9, D = 2.4;

    for (const side of [-1, 1]) {
      for (let i = 0; i < SAMPLES; i += STEP) {
        const pos = this.positions[i];
        const tan = this.tangents[i];
        const rx = tan.z, rz = -tan.x;

        const mat = new THREE.MeshLambertMaterial({
          color: Math.floor(i / STEP) % 2 === 0 ? 0xdd2222 : 0xffffff,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mat);
        mesh.position.set(pos.x + rx * hw * side, H / 2, pos.z + rz * hw * side);
        mesh.rotation.y = Math.atan2(tan.x, tan.z);
        mesh.castShadow = true;
        group.add(mesh);
      }
    }
    return group;
  }

  private _buildStartLine(): THREE.Group {
    const group = new THREE.Group();
    const pos = this.positions[0];
    const tan = this.tangents[0];
    const angle = Math.atan2(tan.x, tan.z);

    // White line
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, 3),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    line.geometry.rotateX(-Math.PI / 2);
    line.position.set(pos.x, 0.02, pos.z);
    line.rotation.y = angle;
    group.add(line);

    // Chequered pattern using small tiles
    const tileW = 1.5, tileD = 0.75;
    const cols = Math.floor(this.width / tileW);
    const rows = 2;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if ((c + r) % 2 === 0) continue;
        const tileGeom = new THREE.PlaneGeometry(tileW, tileD);
        tileGeom.rotateX(-Math.PI / 2);
        const tile = new THREE.Mesh(tileGeom, new THREE.MeshLambertMaterial({ color: 0x111111 }));
        const rx = tan.z, rz = -tan.x;
        const cx = (c - cols / 2 + 0.5) * tileW;
        const dr = (r - rows / 2 + 0.5) * tileD;
        tile.position.set(
          pos.x + rx * cx + tan.x * dr,
          0.025,
          pos.z + rz * cx + tan.z * dr,
        );
        tile.rotation.y = angle;
        group.add(tile);
      }
    }

    return group;
  }

  private _buildEnvironment(): THREE.Group {
    const group = new THREE.Group();
    const rng = mulberry32(42);
    const matTrunk = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
    const matCrown = new THREE.MeshLambertMaterial({ color: 0x2d6a2d });

    for (let attempt = 0; attempt < 280; attempt++) {
      const angle = rng() * Math.PI * 2;
      const r = 85 + rng() * 250;
      const wx = Math.cos(angle) * r;
      const wz = Math.sin(angle) * r;
      const pos = new THREE.Vector3(wx, 0, wz);

      const ti = this.findNearestFull(pos);
      if (Math.abs(ti.signedDist) < this.halfWidth + 20) continue;

      const h = 5 + rng() * 8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, h * 0.45, 6), matTrunk);
      trunk.position.set(wx, h * 0.225, wz);

      const crown = new THREE.Mesh(new THREE.ConeGeometry(3 + rng() * 2.5, h * 0.7, 7), matCrown);
      crown.position.set(wx, h * 0.45 + h * 0.35, wz);

      group.add(trunk, crown);
    }

    // Grandstands on main straight
    const standMat = new THREE.MeshLambertMaterial({ color: 0x7a7aaa });
    for (const sx of [-1, 1]) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(32, 9, 6), standMat);
      stand.position.set(-55 * sx, 4.5, 28);
      stand.castShadow = true;
      group.add(stand);
    }

    return group;
  }
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
