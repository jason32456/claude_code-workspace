// Convex part builders. A "solid" is a list of convex parts; the shadow of a
// convex part under a point light is exactly the convex hull of its projected
// vertices, which is why nothing here is allowed to be concave. Concave shapes
// are assembled from several parts instead (see `lshape`, `cross`, `ring`).

function extrude(section, depth) {
  const h = depth / 2;
  const verts = [];
  for (const [x, y] of section) verts.push([x, y, h]);
  for (const [x, y] of section) verts.push([x, y, -h]);
  const m = section.length;
  const faces = [];
  faces.push(section.map((_, i) => i));
  faces.push(section.map((_, i) => m + m - 1 - i));
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    faces.push([i, j, m + j, m + i]);
  }
  return { verts, faces };
}

const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];

export const box = (w, h, d) => [extrude(rect(w, h), d)];

export const wedge = (w, h, d) => [extrude([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2]], d)];

export const prism = (sides, r, d) => {
  const sec = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    sec.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return [extrude(sec, d)];
};

export function pyramid(w, h, d) {
  const verts = [
    [-w / 2, -h / 2, d / 2], [w / 2, -h / 2, d / 2],
    [w / 2, -h / 2, -d / 2], [-w / 2, -h / 2, -d / 2],
    [0, h / 2, 0],
  ];
  return [{ verts, faces: [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]] }];
}

const offset = (part, dx, dy, dz) => ({
  verts: part.verts.map(([x, y, z]) => [x + dx, y + dy, z + dz]),
  faces: part.faces,
});

export const lshape = (a, b, t, d) => [
  offset(box(a, t, d)[0], 0, -(b - t) / 2, 0),
  offset(box(t, b, d)[0], -(a - t) / 2, 0, 0),
];

export const cross = (w, h, t, d) => [box(w, t, d)[0], box(t, h, d)[0]];

export const tee = (w, h, t, d) => [
  offset(box(w, t, d)[0], 0, (h - t) / 2, 0),
  offset(box(t, h, d)[0], 0, 0, 0),
];

// Eight blades on a hub. Its shadow is a ring of separate polygons that merge
// into one another as it turns, which is the whole point of chamber 8.
export function ring(r, t, d, blades = 8) {
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const seg = box(t, (2 * Math.PI * r) / blades + t * 0.9, d)[0];
    const c = Math.cos(a), s = Math.sin(a);
    parts.push({
      verts: seg.verts.map(([x, y, z]) => [x * c - y * s + Math.cos(a) * r, x * s + y * c + Math.sin(a) * r, z]),
      faces: seg.faces,
    });
  }
  return parts;
}

export const SHAPES = { box, wedge, prism, pyramid, lshape, cross, tee, ring };

export function buildShape(spec) {
  const [name, ...args] = spec;
  const fn = SHAPES[name];
  if (!fn) throw new Error(`unknown shape ${name}`);
  return fn(...args);
}
