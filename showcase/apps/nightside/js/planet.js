import * as THREE from '../vendor/three.module.js';
import { PLANET, TERRAIN, TILE_RADIUS, COLORS } from './config.js';
import { makeNoise3D, mulberry32 } from './noise.js';

function icosahedron() {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => new THREE.Vector3(v[0], v[1], v[2]).normalize());
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { verts, faces };
}

function subdivide(verts, faces) {
  const cache = new Map();
  const midpoint = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    verts.push(verts[a].clone().add(verts[b]).normalize());
    cache.set(key, verts.length - 1);
    return verts.length - 1;
  };
  const out = [];
  for (const [a, b, c] of faces) {
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    out.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return out;
}

// The dual of a subdivided icosahedron: every source vertex becomes one tile,
// and the tile's corners are the centroids of the faces touching that vertex.
function buildTiles() {
  const { verts, faces: baseFaces } = icosahedron();
  let faces = baseFaces;
  for (let i = 0; i < PLANET.subdivisions; i++) faces = subdivide(verts, faces);

  const incident = verts.map(() => []);
  const neighbours = verts.map(() => new Set());
  const centroids = faces.map(([a, b, c]) => (
    verts[a].clone().add(verts[b]).add(verts[c]).normalize()
  ));

  faces.forEach(([a, b, c], fi) => {
    incident[a].push(fi); incident[b].push(fi); incident[c].push(fi);
    neighbours[a].add(b); neighbours[a].add(c);
    neighbours[b].add(a); neighbours[b].add(c);
    neighbours[c].add(a); neighbours[c].add(b);
  });

  const u = new THREE.Vector3(), v = new THREE.Vector3(), tmp = new THREE.Vector3();
  return verts.map((center, id) => {
    // Tangent basis with u × v = center, so ascending angle winds
    // counter-clockwise seen from outside and triangle fans face outward.
    u.set(0, 1, 0);
    if (Math.abs(center.y) > 0.9) u.set(1, 0, 0);
    u.crossVectors(u, center).normalize();
    v.crossVectors(center, u);
    const corners = incident[id]
      .map((fi) => centroids[fi])
      .map((p) => ({ p, a: Math.atan2(tmp.copy(p).dot(v), tmp.copy(p).dot(u)) }))
      .sort((m, n) => m.a - n.a)
      .map((m) => m.p.clone());
    return {
      id,
      center,
      corners,
      neighbours: [...neighbours[id]],
      type: TERRAIN.PLAIN,
      elevation: 0,
      radius: TILE_RADIUS.PLAIN,
      pos: new THREE.Vector3(),
      lat: Math.asin(THREE.MathUtils.clamp(center.y, -1, 1)),
      lon: Math.atan2(center.z, center.x),
      building: null,
      isVent: false,
      sun: 0,
    };
  });
}

function classify(tiles, rand) {
  const n1 = makeNoise3D(rand() * 1e9);
  const n2 = makeNoise3D(rand() * 1e9);
  const n3 = makeNoise3D(rand() * 1e9);
  for (const t of tiles) {
    const c = t.center;
    const e =
      n1(c.x * 1.7 + 40, c.y * 1.7 + 40, c.z * 1.7 + 40) * 1.0 +
      n2(c.x * 3.6 + 90, c.y * 3.6 + 90, c.z * 3.6 + 90) * 0.5 +
      n3(c.x * 7.3 + 15, c.y * 7.3 + 15, c.z * 7.3 + 15) * 0.25;
    t.elevation = e / 1.75;
  }
  // Percentile thresholds rather than fixed ones: value noise clusters around
  // its mean, so absolute cuts give wildly different worlds seed to seed.
  const sorted = tiles.map((t) => t.elevation).sort((a, b) => a - b);
  const lowCut = sorted[Math.floor(sorted.length * 0.19)];
  const highCut = sorted[Math.floor(sorted.length * 0.87)];
  for (const t of tiles) {
    t.type = t.elevation < lowCut ? TERRAIN.BASIN
      : t.elevation > highCut ? TERRAIN.RIDGE
        : TERRAIN.PLAIN;
  }
}

const passable = (t) => t.type === TERRAIN.PLAIN || t.type === TERRAIN.ORE;

// Keep only the largest walkable landmass so every drop pod can always reach a
// vent — after this, "is there a route" depends purely on player-built walls.
function pruneIslands(tiles) {
  const seen = new Int8Array(tiles.length);
  let best = [];
  for (const start of tiles) {
    if (seen[start.id] || !passable(start)) continue;
    const group = [];
    const stack = [start.id];
    seen[start.id] = 1;
    while (stack.length) {
      const id = stack.pop();
      group.push(id);
      for (const nb of tiles[id].neighbours) {
        if (!seen[nb] && passable(tiles[nb])) { seen[nb] = 1; stack.push(nb); }
      }
    }
    if (group.length > best.length) best = group;
  }
  const keep = new Set(best);
  for (const t of tiles) if (passable(t) && !keep.has(t.id)) t.type = TERRAIN.BASIN;
  return best;
}

function seedOre(tiles, land, rand) {
  const shuffled = [...land].sort(() => rand() - 0.5);
  let placed = 0;
  for (const id of shuffled) {
    if (placed >= PLANET.oreTiles) break;
    const t = tiles[id];
    if (t.type !== TERRAIN.PLAIN) continue;
    if (t.neighbours.some((nb) => tiles[nb].type === TERRAIN.ORE)) continue;
    t.type = TERRAIN.ORE;
    placed++;
  }
}

// Farthest-point sampling, so no single defensive cluster can cover all three.
function placeVents(tiles, land, rand) {
  const first = land[Math.floor(rand() * land.length)];
  const chosen = [first];
  while (chosen.length < PLANET.vents) {
    let bestId = -1, bestDist = -1;
    for (const id of land) {
      let d = Infinity;
      for (const c of chosen) d = Math.min(d, tiles[id].center.distanceTo(tiles[c].center));
      if (d > bestDist) { bestDist = d; bestId = id; }
    }
    chosen.push(bestId);
  }
  for (const id of chosen) {
    const t = tiles[id];
    t.type = TERRAIN.PLAIN;
    t.isVent = true;
    // Clear a little breathing room so a vent is never walled in by terrain.
    for (const nb of t.neighbours) {
      if (tiles[nb].type === TERRAIN.RIDGE) tiles[nb].type = TERRAIN.PLAIN;
    }
  }
  return chosen;
}

function tileColor(t, rand, out) {
  if (t.isVent) return out.setHex(COLORS.VENT);
  switch (t.type) {
    case TERRAIN.RIDGE: return out.setHex(COLORS.RIDGE).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
    case TERRAIN.BASIN: return out.setHex(COLORS.BASIN).offsetHSL(0, 0, (rand() - 0.5) * 0.04);
    case TERRAIN.ORE: return out.setHex(COLORS.ORE).offsetHSL(0, 0.05, (rand() - 0.5) * 0.05);
    default:
      return out.setHex(rand() > 0.5 ? COLORS.PLAIN : COLORS.PLAIN_ALT)
        .offsetHSL(0, 0, (rand() - 0.5) * 0.07);
  }
}

function buildMesh(tiles, rand) {
  const R = PLANET.radius;
  const positions = [];
  const normals = [];
  const colors = [];
  const faceTile = [];
  const borderPts = [];
  const col = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

  for (const t of tiles) {
    t.radius = TILE_RADIUS[t.type] ?? 1;
    t.pos.copy(t.center).multiplyScalar(R * t.radius);
    tileColor(t, rand, col);
    const r = R * t.radius;
    a.copy(t.center).multiplyScalar(r);
    const n = t.corners.length;
    for (let i = 0; i < n; i++) {
      b.copy(t.corners[i]).multiplyScalar(r);
      c.copy(t.corners[(i + 1) % n]).multiplyScalar(r);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      for (let k = 0; k < 3; k++) {
        normals.push(t.center.x, t.center.y, t.center.z);
        colors.push(col.r, col.g, col.b);
      }
      faceTile.push(t.id);
      borderPts.push(
        t.corners[i].x * r * 1.002, t.corners[i].y * r * 1.002, t.corners[i].z * r * 1.002,
        t.corners[(i + 1) % n].x * r * 1.002, t.corners[(i + 1) % n].y * r * 1.002,
        t.corners[(i + 1) % n].z * r * 1.002,
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.05,
  }));
  mesh.name = 'tiles';

  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderPts, 3));
  const borders = new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.22,
  }));

  return { mesh, borders, faceTile };
}

function buildCrags(tiles, rand) {
  const ridges = tiles.filter((t) => t.type === TERRAIN.RIDGE);
  const geo = new THREE.ConeGeometry(0.3, 0.52, 5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x817c76, roughness: 1, flatShading: true });
  const inst = new THREE.InstancedMesh(geo, mat, ridges.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  ridges.forEach((t, i) => {
    q.setFromUnitVectors(up, t.center);
    const s = 0.75 + rand() * 0.5;
    scale.set(s, 0.7 + rand() * 0.7, s);
    pos.copy(t.center).multiplyScalar(PLANET.radius * t.radius + 0.17 * scale.y);
    m.compose(pos, q, scale);
    inst.setMatrixAt(i, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  return inst;
}

export function buildPlanet(seed) {
  const rand = mulberry32(seed);
  const tiles = buildTiles();
  classify(tiles, rand);
  let land = pruneIslands(tiles);
  const ventIds = placeVents(tiles, land, rand);
  land = pruneIslands(tiles);
  seedOre(tiles, land, rand);

  const { mesh, borders, faceTile } = buildMesh(tiles, rand);
  const group = new THREE.Group();
  group.add(mesh, borders, buildCrags(tiles, rand));

  const crust = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET.radius * 0.955, 48, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.crust, roughness: 1 }),
  );
  const sea = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET.radius * 0.9885, 96, 64),
    new THREE.MeshStandardMaterial({
      color: COLORS.sea, roughness: 0.25, metalness: 0.4,
      transparent: true, opacity: 0.9,
    }),
  );
  group.add(crust, sea);

  return { tiles, group, mesh, faceTile, ventIds, land };
}

export function tileWorldPos(tile, height = 0, out = new THREE.Vector3()) {
  return out.copy(tile.center).multiplyScalar(PLANET.radius * tile.radius + height);
}
