// Glyph outline reconstruction.
//
// TrueType outlines are quadratic B-splines, and the format compresses them in
// a way that trips every first implementation: between two consecutive
// OFF-curve points there is an IMPLIED on-curve point at their midpoint, which
// is never stored. Miss that rule and every curve with two consecutive controls
// renders as a spike.
//
// Coordinates are also stored as deltas with a per-axis "short or same" flag
// scheme where the meaning of one bit depends on another, and a repeat byte
// that expands one flag into many.

import { Reader, FontError } from './sfnt.js';

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME_OR_POS = 0x10;
const Y_SAME_OR_POS = 0x20;

// Composite flags
const ARG_1_AND_2_ARE_WORDS = 0x0001;
const ARGS_ARE_XY_VALUES = 0x0002;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;
const WE_HAVE_INSTRUCTIONS = 0x0100;

const f2dot14 = (v) => v / 16384;

// Returns null for an empty glyph (space), which is legal and common: loca
// gives it zero length and there are no bytes at all.
export function parseGlyph(font, gid, depth = 0) {
  if (gid < 0 || gid >= font.maxp.numGlyphs) return null;
  const glyfTable = font.tables.get('glyf');
  const start = font.loca[gid];
  const end = font.loca[gid + 1];
  if (end <= start) return { gid, empty: true, contours: [], components: [], xMin: 0, yMin: 0, xMax: 0, yMax: 0 };

  const r = new Reader(font.buffer, glyfTable.offset + start);
  const numberOfContours = r.i16();
  const xMin = r.i16();
  const yMin = r.i16();
  const xMax = r.i16();
  const yMax = r.i16();

  if (numberOfContours >= 0) {
    return { gid, empty: false, xMin, yMin, xMax, yMax, components: [], ...parseSimple(r, numberOfContours) };
  }
  if (depth > 5) {
    throw new FontError(`Composite glyph ${gid} nests more than five levels deep.`);
  }
  return { gid, empty: false, xMin, yMin, xMax, yMax, ...parseComposite(font, r, depth) };
}

function parseSimple(r, numberOfContours) {
  const endPts = new Uint16Array(numberOfContours);
  for (let i = 0; i < numberOfContours; i++) endPts[i] = r.u16();
  const numPoints = numberOfContours === 0 ? 0 : endPts[numberOfContours - 1] + 1;

  const instructionLength = r.u16();
  r.pos += instructionLength; // hinting bytecode — read past, never executed

  // Flags, with the repeat byte expanded.
  const flags = new Uint8Array(numPoints);
  for (let i = 0; i < numPoints;) {
    const f = r.u8();
    flags[i++] = f;
    if (f & REPEAT) {
      let n = r.u8();
      while (n-- > 0 && i < numPoints) flags[i++] = f;
    }
  }

  // x then y, each a delta chain. For a short coordinate the "same" bit means
  // positive; for a long one it means the delta is zero and nothing is stored.
  const xs = new Int16Array(numPoints);
  let x = 0;
  for (let i = 0; i < numPoints; i++) {
    const f = flags[i];
    if (f & X_SHORT) x += (f & X_SAME_OR_POS) ? r.u8() : -r.u8();
    else if (!(f & X_SAME_OR_POS)) x += r.i16();
    xs[i] = x;
  }
  const ys = new Int16Array(numPoints);
  let y = 0;
  for (let i = 0; i < numPoints; i++) {
    const f = flags[i];
    if (f & Y_SHORT) y += (f & Y_SAME_OR_POS) ? r.u8() : -r.u8();
    else if (!(f & Y_SAME_OR_POS)) y += r.i16();
    ys[i] = y;
  }

  const contours = [];
  let first = 0;
  for (let c = 0; c < numberOfContours; c++) {
    const last = endPts[c];
    const pts = [];
    for (let i = first; i <= last; i++) {
      pts.push({ x: xs[i], y: ys[i], on: (flags[i] & ON_CURVE) !== 0 });
    }
    if (pts.length) contours.push(pts);
    first = last + 1;
  }
  return { contours, numPoints };
}

function parseComposite(font, r, depth) {
  const components = [];
  let flags;
  do {
    flags = r.u16();
    const glyphIndex = r.u16();
    let dx;
    let dy;
    if (flags & ARG_1_AND_2_ARE_WORDS) { dx = r.i16(); dy = r.i16(); }
    else { dx = (r.u8() << 24) >> 24; dy = (r.u8() << 24) >> 24; }
    if (!(flags & ARGS_ARE_XY_VALUES)) { dx = 0; dy = 0; } // point-matching, rare; placed at origin

    let a = 1;
    let b = 0;
    let c = 0;
    let d = 1;
    if (flags & WE_HAVE_A_SCALE) { a = d = f2dot14(r.i16()); }
    else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) { a = f2dot14(r.i16()); d = f2dot14(r.i16()); }
    else if (flags & WE_HAVE_A_TWO_BY_TWO) {
      a = f2dot14(r.i16()); b = f2dot14(r.i16());
      c = f2dot14(r.i16()); d = f2dot14(r.i16());
    }
    components.push({ glyphIndex, dx, dy, a, b, c, d });
  } while (flags & MORE_COMPONENTS);

  if (flags & WE_HAVE_INSTRUCTIONS) {
    const n = r.u16();
    r.pos += n;
  }

  // Flatten: pull each component's contours through its own transform, so the
  // caller gets one outline regardless of how it was assembled.
  const contours = [];
  for (const comp of components) {
    const sub = parseGlyph(font, comp.glyphIndex, depth + 1);
    if (!sub) continue;
    for (const pts of sub.contours) {
      contours.push(pts.map((p) => ({
        x: comp.a * p.x + comp.c * p.y + comp.dx,
        y: comp.b * p.x + comp.d * p.y + comp.dy,
        on: p.on,
      })));
    }
  }
  return { contours, components };
}

// Contours -> a Path2D-style command list in font units.
//
// The implied-midpoint rule lives here: walking the point ring, two consecutive
// off-curve points mean there is an on-curve point between them that the file
// never stored.
export function outlineToPath(contours) {
  const cmds = [];
  for (const pts of contours) {
    if (pts.length === 0) continue;

    // Find a starting on-curve point. If the contour is entirely off-curve
    // (legal, and it draws a closed blob), synthesize the start from the
    // midpoint of the last and first points.
    let startIndex = pts.findIndex((p) => p.on);
    let startPoint;
    if (startIndex === -1) {
      const a = pts[pts.length - 1];
      const b = pts[0];
      startPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true };
      startIndex = 0;
      cmds.push({ type: 'M', x: startPoint.x, y: startPoint.y });
    } else {
      startPoint = pts[startIndex];
      cmds.push({ type: 'M', x: startPoint.x, y: startPoint.y });
      startIndex += 1;
    }

    const n = pts.length;
    let control = null;
    for (let k = 0; k < n; k++) {
      const p = pts[(startIndex + k) % n];
      if (p.on) {
        if (control) {
          cmds.push({ type: 'Q', cx: control.x, cy: control.y, x: p.x, y: p.y });
          control = null;
        } else {
          cmds.push({ type: 'L', x: p.x, y: p.y });
        }
      } else if (control) {
        // Two controls in a row: the on-curve point between them is implied.
        const mid = { x: (control.x + p.x) / 2, y: (control.y + p.y) / 2 };
        cmds.push({ type: 'Q', cx: control.x, cy: control.y, x: mid.x, y: mid.y });
        control = p;
      } else {
        control = p;
      }
    }
    // Close back onto the start, through a pending control if there is one.
    if (control) {
      cmds.push({ type: 'Q', cx: control.x, cy: control.y, x: startPoint.x, y: startPoint.y });
    }
    cmds.push({ type: 'Z' });
  }
  return cmds;
}

// Scales a command list into a Path2D. yScale is negative because font units
// run up and canvas units run down.
export function toPath2D(cmds, scale, originX, originY) {
  const p = new Path2D();
  const X = (x) => originX + x * scale;
  const Y = (y) => originY - y * scale;
  for (const c of cmds) {
    if (c.type === 'M') p.moveTo(X(c.x), Y(c.y));
    else if (c.type === 'L') p.lineTo(X(c.x), Y(c.y));
    else if (c.type === 'Q') p.quadraticCurveTo(X(c.cx), Y(c.cy), X(c.x), Y(c.y));
    else if (c.type === 'Z') p.closePath();
  }
  return p;
}

// Every glyph a set of glyphs depends on, including itself. A composite glyph
// is assembled from other glyphs, so subsetting has to keep those too or the
// subset renders holes.
export function glyphClosure(font, seedGids) {
  const keep = new Set();
  const stack = [...seedGids];
  while (stack.length) {
    const gid = stack.pop();
    if (gid < 0 || gid >= font.maxp.numGlyphs || keep.has(gid)) continue;
    keep.add(gid);
    let g;
    try { g = parseGlyph(font, gid); } catch { continue; }
    if (!g) continue;
    for (const c of g.components ?? []) stack.push(c.glyphIndex);
  }
  return keep;
}

export function glyphBounds(cmds) {
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  const put = (x, y) => {
    xMin = Math.min(xMin, x); yMin = Math.min(yMin, y);
    xMax = Math.max(xMax, x); yMax = Math.max(yMax, y);
  };
  for (const c of cmds) {
    if (c.type === 'M' || c.type === 'L') put(c.x, c.y);
    else if (c.type === 'Q') { put(c.cx, c.cy); put(c.x, c.y); }
  }
  if (!Number.isFinite(xMin)) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  return { xMin, yMin, xMax, yMax };
}
