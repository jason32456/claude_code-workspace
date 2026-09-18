// The pipeline, and the reference table.
//
// Everything in the table is GENERATED from a parametric curve in curves.js and
// run through the same code path as a user's tangle. Nothing is a hand-typed
// polynomial. That is deliberate: a hand-typed table would let a bug in the
// extractor agree with itself, whereas these entries were each checked against
// published values once (see selftest 1 and 2) and are otherwise produced by
// the machinery they are used to name.
//
// Anything that does not match is reported as unidentified WITH its invariants,
// rather than guessed at. Drawer tangles routinely produce composite knots
// (connected sums), which are real knots this table does not contain, and
// saying "unidentified, det 9, 6 crossings" is the honest output.

import { buildCurve, curveInfo, curveIds } from './curves.js';
import { bestDiagram } from './diagram.js';
import { jones, jonesAtMinusOne, MAX_CROSSINGS } from './jones.js';
import { alexander, alexanderAtMinusOne } from './alexander.js';
import { colourNullity } from './colour.js';
import { kmtReduce, minClearance } from './simplify.js';
import * as L from './laurent.js';

let TABLE = null;

export function referenceTable() {
  if (TABLE) return TABLE;
  TABLE = [];
  for (const id of curveIds()) {
    const info = curveInfo(id);
    try {
      const pts = buildCurve(id);
      const d = bestDiagram(pts);
      const j = jones(d);
      if (!j.jones) continue;
      TABLE.push({
        id,
        name: info.name,
        label: info.label,
        key: L.format(j.jones, 't'),
        jones: j.jones,
        crossings: d.crossings.length,
        det: absBig(jonesAtMinusOne(j.jones)),
      });
    } catch (e) { /* a fixture that will not project is simply absent */ }
  }
  return TABLE;
}

const absBig = (x) => (x < 0n ? -x : x);

// The full analysis of one closed polygon.
export function analyse(ptsIn, opts = {}) {
  const reduce = opts.reduce ?? true;
  const original = ptsIn;
  let pts = ptsIn;
  let reduction = null;

  if (reduce) {
    reduction = kmtReduce(ptsIn);
    pts = reduction.points;
  }

  const diagram = bestDiagram(pts);
  const n = diagram.crossings.length;

  const out = {
    points: pts,
    original,
    reduction,
    diagram,
    crossings: n,
    writhe: diagram.writhe,
    clearance: minClearance(pts),
    // A reduction all the way to a triangle is a geometric proof of
    // unknottedness, independent of any polynomial.
    certificate: reduction ? reduction.certificate : false,
    tooBig: n > MAX_CROSSINGS,
  };

  if (out.tooBig) {
    out.name = null;
    out.det = null;
    return out;
  }

  const j = jones(diagram);
  out.jones = j.jones ?? null;
  out.bracket = j.bracket ?? null;
  out.states = j.states ?? 0;
  out.jonesDet = out.jones ? absBig(jonesAtMinusOne(out.jones)) : null;

  let a = null;
  try { a = alexander(diagram); } catch (e) { a = null; }
  out.alexander = a && a.alexander ? a.alexander : null;
  out.alexanderDet = out.alexander ? absBig(alexanderAtMinusOne(out.alexander)) : null;

  // The bridge theorem. When these two disagree something is wrong, and the UI
  // says so rather than showing whichever number looks nicer.
  out.det = out.jonesDet;
  out.bridgeOK = out.jonesDet !== null && out.alexanderDet !== null
    && out.jonesDet === out.alexanderDet;

  // Fox colourings, third road to the same determinant.
  out.colourings = {};
  for (const p of [3, 5, 7]) {
    const c = colourNullity(diagram, p);
    out.colourings[p] = {
      count: c.count,
      nontrivial: c.count > p,
      dividesDet: out.det !== null && (out.det % BigInt(p)) === 0n,
    };
  }
  out.colourTheoremOK = Object.values(out.colourings)
    .every((c) => c.nontrivial === c.dividesDet);

  // Naming.
  const key = out.jones ? L.format(out.jones, 't') : null;
  const hit = key ? referenceTable().find((r) => r.key === key) : null;
  out.name = hit ? hit.label : null;
  out.fullName = hit ? hit.name : null;
  out.isUnknot = out.jones ? L.equal(out.jones, L.one()) : false;

  return out;
}

// A compact identifier for the closure spectrum, which needs speed more than
// detail.
export function identifyFast(pts) {
  const reduction = kmtReduce(pts);
  const diagram = bestDiagram(reduction.points);
  const n = diagram.crossings.length;
  if (n > MAX_CROSSINGS) {
    return { name: null, crossings: n, det: null, tooBig: true };
  }
  const j = jones(diagram);
  if (!j.jones) return { name: null, crossings: n, det: null, tooBig: false };
  const key = L.format(j.jones, 't');
  const hit = referenceTable().find((r) => r.key === key);
  const det = absBig(jonesAtMinusOne(j.jones));
  return {
    name: hit ? hit.label : null,
    crossings: n,
    det: det.toString(),
    isUnknot: L.equal(j.jones, L.one()),
    jonesKey: key,
    certificate: reduction.certificate,
  };
}
