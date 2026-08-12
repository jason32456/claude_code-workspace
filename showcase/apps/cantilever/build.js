// The editor owns the design graph and every rule about what may be placed.
// It knows nothing about pixels — main.js converts pointer events to metres
// before calling in.

import { MATERIALS, maxLengthOf, memberCost } from './materials.js';

const GRID = 1;
const SNAP_RADIUS = 0.45;
const MIN_LENGTH = 0.9;

export function createEditor(level) {
  const ed = {
    level,
    joints: level.anchors.map((a) => ({ x: a.x, y: a.y, anchored: true })),
    members: [],
    undoStack: [],
    redoStack: [],
  };
  return ed;
}

export function cost(ed) {
  return ed.members.reduce((sum, m) => sum + m.cost, 0);
}

export function remaining(ed) {
  return ed.level.budget - cost(ed);
}

function snapshot(ed) {
  return JSON.stringify({ joints: ed.joints, members: ed.members });
}

function restore(ed, snap) {
  const s = JSON.parse(snap);
  ed.joints = s.joints;
  ed.members = s.members;
}

function commit(ed, before) {
  ed.undoStack.push(before);
  if (ed.undoStack.length > 200) ed.undoStack.shift();
  ed.redoStack.length = 0;
}

export function undo(ed) {
  if (!ed.undoStack.length) return false;
  const current = snapshot(ed);
  restore(ed, ed.undoStack.pop());
  ed.redoStack.push(current);
  return true;
}

export function redo(ed) {
  if (!ed.redoStack.length) return false;
  const current = snapshot(ed);
  restore(ed, ed.redoStack.pop());
  ed.undoStack.push(current);
  return true;
}

// ── Geometry helpers ───────────────────────────────────────────────────────

export function snapPoint(ed, x, y) {
  let best = null;
  let bestD = SNAP_RADIUS;
  for (let i = 0; i < ed.joints.length; i++) {
    const j = ed.joints[i];
    const d = Math.hypot(j.x - x, j.y - y);
    if (d < bestD) {
      bestD = d;
      best = { x: j.x, y: j.y, index: i };
    }
  }
  if (best) return best;
  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID, index: -1 };
}

function inRect(x, y, r, pad = 0) {
  return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
}

function insideSolid(ed, x, y) {
  // A point exactly on the surface of a platform is fine — that is where
  // anchors live — so solids are tested with a small inset.
  return ed.level.solids.some((s) => !s.ghost && inRect(x, y, s, -0.05));
}

function jointAt(ed, x, y) {
  return ed.joints.findIndex((j) => Math.abs(j.x - x) < 1e-6 && Math.abs(j.y - y) < 1e-6);
}

function pointAllowed(ed, x, y) {
  if (jointAt(ed, x, y) >= 0) return true;
  if (!inRect(x, y, ed.level.build, 1e-6)) return false;
  return !insideSolid(ed, x, y);
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function crossesRect(ax, ay, bx, by, r) {
  if (inRect(ax, ay, r) || inRect(bx, by, r)) return true;
  const c = [
    [r.x, r.y, r.x + r.w, r.y],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
    [r.x, r.y + r.h, r.x, r.y],
  ];
  return c.some((e) => segmentsIntersect(ax, ay, bx, by, e[0], e[1], e[2], e[3]));
}

// ── Placement ──────────────────────────────────────────────────────────────

export function checkPlacement(ed, a, b, material) {
  if (!a || !b) return { ok: false, reason: '' };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < MIN_LENGTH) return { ok: false, reason: 'Too short' };
  const maxLen = maxLengthOf(material);
  if (len > maxLen) {
    return { ok: false, reason: `${MATERIALS[material].name} tops out at ${Math.floor(maxLen)} m` };
  }
  if (!pointAllowed(ed, a.x, a.y) || !pointAllowed(ed, b.x, b.y)) {
    return { ok: false, reason: 'Outside the build area' };
  }
  const ia = jointAt(ed, a.x, a.y);
  const ib = jointAt(ed, b.x, b.y);
  if (ia >= 0 && ia === ib) return { ok: false, reason: '' };
  // Doubling up is allowed as long as the materials differ — running a beam
  // alongside a road panel is how you stiffen a deck that is buckling.
  const duplicate = ed.members.some(
    (m) => m.material === material && ((m.a === ia && m.b === ib) || (m.a === ib && m.b === ia))
  );
  if (ia >= 0 && ib >= 0 && duplicate) {
    return { ok: false, reason: `Already a ${MATERIALS[material].name.toLowerCase()} there` };
  }
  if (ed.level.noBuild.some((r) => crossesRect(a.x, a.y, b.x, b.y, r))) {
    return { ok: false, reason: 'Blocked — clearance zone' };
  }
  const c = memberCost(material, len);
  if (c > remaining(ed)) return { ok: false, reason: 'Over budget' };
  return { ok: true, reason: '', cost: c, length: len };
}

export function addMember(ed, a, b, material) {
  const check = checkPlacement(ed, a, b, material);
  if (!check.ok) return check;
  const before = snapshot(ed);

  const ensure = (p) => {
    const i = jointAt(ed, p.x, p.y);
    if (i >= 0) return i;
    ed.joints.push({ x: p.x, y: p.y, anchored: false });
    return ed.joints.length - 1;
  };
  const ia = ensure(a);
  const ib = ensure(b);
  ed.members.push({ a: ia, b: ib, material, cost: check.cost });

  commit(ed, before);
  return check;
}

export function memberNear(ed, x, y, radius = 0.4) {
  let best = -1;
  let bestD = radius;
  for (let i = 0; i < ed.members.length; i++) {
    const m = ed.members[i];
    const a = ed.joints[m.a];
    const b = ed.joints[m.b];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = len2 ? ((x - a.x) * abx + (y - a.y) * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function removeMember(ed, index) {
  if (index < 0 || index >= ed.members.length) return false;
  const before = snapshot(ed);
  ed.members.splice(index, 1);
  pruneJoints(ed);
  commit(ed, before);
  return true;
}

// Drop free joints that no longer hold anything, so the joint list stays a
// faithful picture of the structure.
function pruneJoints(ed) {
  const used = new Set();
  for (const m of ed.members) {
    used.add(m.a);
    used.add(m.b);
  }
  const keep = [];
  const remap = new Map();
  ed.joints.forEach((j, i) => {
    if (j.anchored || used.has(i)) {
      remap.set(i, keep.length);
      keep.push(j);
    }
  });
  ed.joints = keep;
  ed.members = ed.members.map((m) => ({ ...m, a: remap.get(m.a), b: remap.get(m.b) }));
}

export function clear(ed) {
  const before = snapshot(ed);
  ed.members = [];
  pruneJoints(ed);
  commit(ed, before);
}

// ── Validation ─────────────────────────────────────────────────────────────

// The truck can only roll on road, so a run needs an unbroken chain of road
// members from the left platform edge to the right one.
export function validate(ed) {
  const adjacency = new Map();
  ed.members.forEach((m) => {
    if (!MATERIALS[m.material].drivable) return;
    if (!adjacency.has(m.a)) adjacency.set(m.a, []);
    if (!adjacency.has(m.b)) adjacency.set(m.b, []);
    adjacency.get(m.a).push(m.b);
    adjacency.get(m.b).push(m.a);
  });

  const start = 0; // left deck anchor
  const goal = 1; // right deck anchor
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const n = queue.shift();
    if (n === goal) return { ok: true, reason: '' };
    for (const next of adjacency.get(n) || []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return {
    ok: false,
    reason: adjacency.size ? 'Road must reach the far platform' : 'Lay road across the gap to test',
  };
}

export function structureOf(ed) {
  return {
    joints: ed.joints.map((j) => ({ x: j.x, y: j.y, anchored: j.anchored })),
    members: ed.members.map((m) => ({ a: m.a, b: m.b, material: m.material })),
  };
}

export function serialize(ed) {
  return { members: ed.members.map((m) => [m.a, m.b, m.material]), joints: ed.joints.map((j) => [j.x, j.y, j.anchored ? 1 : 0]) };
}

export function deserialize(ed, data) {
  if (!data || !Array.isArray(data.joints) || !Array.isArray(data.members)) return false;
  const before = snapshot(ed);
  ed.joints = data.joints.map(([x, y, anchored]) => ({ x, y, anchored: !!anchored }));
  ed.members = data.members.map(([a, b, material]) => {
    const ja = ed.joints[a];
    const jb = ed.joints[b];
    const len = ja && jb ? Math.hypot(jb.x - ja.x, jb.y - ja.y) : 0;
    return { a, b, material, cost: memberCost(material, len) };
  });
  commit(ed, before);
  return true;
}
