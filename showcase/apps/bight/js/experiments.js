// The claims, measured in-page rather than quoted. Every number the app asserts
// about itself is produced here by the same code that draws a single verdict.
//
// These are the expensive parts of the app (each tangle is a fresh Monte Carlo
// sampler run plus a 2^n state sum), so main.js runs them in a Web Worker and
// streams progress.

import { closedTangle, openCable, contourLength } from './sampler.js';
import { analyse, identifyFast } from './identify.js';
import { radialClosure, directionalSpectrum } from './closure.js';
import { kmtReduce } from './simplify.js';
import { bestDiagram } from './diagram.js';
import { jones, jonesAtMinusOne } from './jones.js';
import { alexander, alexanderAtMinusOne } from './alexander.js';
import { buildCurve } from './curves.js';
import * as L from './laurent.js';

const FIXTURES = ['trefoil', 'trefoilL', 'figure8', 'cinquefoil'];

const absBig = (x) => (x < 0n ? -x : x);

// C1 + C3. Sample closed cable loops; record what they are and how tangled they
// LOOK, so the two axes can be compared.
export function knottingEnsemble(opts = {}) {
  const count = opts.count ?? 24;
  const n = opts.n ?? 160;
  const moves = opts.moves ?? 12000;
  const thickness = opts.thickness ?? 0.15;
  const confine = opts.confine ?? 0.20;
  const onProgress = opts.onProgress ?? null;

  const rows = [];
  const tally = new Map();
  for (let s = 0; s < count; s++) {
    const tg = closedTangle({ n, seed: (opts.seed ?? 7919) * (s + 1), moves, thickness, confine });
    // How tangled it LOOKS: crossings before any reduction.
    let rawCrossings = null;
    try { rawCrossings = bestDiagram(tg.points, 12).crossings.length; } catch (e) { /* leave null */ }

    let r = null;
    try { r = identifyFast(tg.points); } catch (e) { /* leave null */ }
    if (r) {
      const key = r.name ?? (r.tooBig ? 'too complex' : `unidentified (det ${r.det}, ${r.crossings} crossings)`);
      tally.set(key, (tally.get(key) ?? 0) + 1);
      rows.push({
        seed: s,
        rawCrossings,
        reducedCrossings: r.crossings,
        name: r.name,
        isUnknot: !!r.isUnknot,
        certificate: !!r.certificate,
        tooBig: !!r.tooBig,
        det: r.det,
      });
    }
    if (onProgress) onProgress((s + 1) / count);
  }

  const usable = rows.filter((r) => !r.tooBig);
  const knotted = usable.filter((r) => !r.isUnknot);
  // C3: among the tangles that LOOK most tangled, how many are actually knots?
  const byLook = usable.filter((r) => r.rawCrossings !== null)
    .sort((a, b) => b.rawCrossings - a.rawCrossings);
  const topDecile = byLook.slice(0, Math.max(1, Math.floor(byLook.length / 4)));

  return {
    params: { n, moves, thickness, confine, count },
    rows,
    tally: [...tally].sort((a, b) => b[1] - a[1]),
    usable: usable.length,
    tooBig: rows.length - usable.length,
    knotted: knotted.length,
    knottedFraction: usable.length ? knotted.length / usable.length : 0,
    maxRawCrossings: byLook.length ? byLook[0].rawCrossings : 0,
    // The headline for C3: the most visually tangled quartile, and how many of
    // those are provably the unknot.
    worstLooking: topDecile.map((r) => ({
      raw: r.rawCrossings, reduced: r.reducedCrossings, unknot: r.isUnknot, name: r.name,
    })),
    worstLookingUnknotFraction: topDecile.length
      ? topDecile.filter((r) => r.isUnknot).length / topDecile.length : 0,
  };
}

// C2. The claim the premise lives on: an OPEN cable has no knot type, so the
// answer depends on the closure. Does it actually differ?
export function closureDisagreement(opts = {}) {
  const count = opts.count ?? 12;
  const n = opts.n ?? 80;
  const moves = opts.moves ?? 6000;
  const thickness = opts.thickness ?? 0.18;
  const confine = opts.confine ?? 0.22;
  const dirs = opts.dirs ?? 24;
  const onProgress = opts.onProgress ?? null;

  const rows = [];
  for (let s = 0; s < count; s++) {
    const oc = openCable({ n, seed: (opts.seed ?? 104729) * (s + 1), moves, thickness, confine });
    let radial = null;
    try { radial = identifyFast(radialClosure(oc.points)); } catch (e) { /* null */ }
    const spec = directionalSpectrum(oc.points, identifyFast, dirs);
    const radialName = radial
      ? (radial.name ?? (radial.tooBig ? 'too complex' : `unidentified (det ${radial.det})`))
      : null;
    rows.push({
      seed: s,
      length: contourLength(oc.points, false),
      thickness,
      radialName,
      dominant: spec.dominant ? spec.dominant[0] : null,
      agreement: spec.agreementFraction,
      distinct: spec.distinct,
      tally: spec.tally,
      // Two separate questions: does the DIRECTION matter, and do the two
      // standard CONVENTIONS agree with each other?
      directionMatters: spec.distinct > 1,
      conventionsAgree: radialName !== null && spec.dominant !== null
        && radialName === spec.dominant[0],
    });
    if (onProgress) onProgress((s + 1) / count);
  }

  const withDir = rows.filter((r) => r.distinct > 0);
  return {
    params: { n, moves, thickness, confine, dirs, count },
    rows,
    // C2 as a single number, twice over.
    directionMattersFraction: withDir.length
      ? withDir.filter((r) => r.directionMatters).length / withDir.length : 0,
    conventionsDisagreeFraction: withDir.length
      ? withDir.filter((r) => !r.conventionsAgree).length / withDir.length : 0,
    meanAgreement: withDir.length
      ? withDir.reduce((s, r) => s + r.agreement, 0) / withDir.length : 0,
    // The most ambiguous cable found: the best single exhibit for the claim.
    mostAmbiguous: withDir.slice().sort((a, b) => a.agreement - b.agreement)[0] ?? null,
  };
}

// C4. Does the expensive invariant ever earn its keep on THIS ensemble? Jones is
// strictly stronger than Alexander in theory -- it separates the two trefoils,
// which Alexander provably cannot -- but that is a statement about all knots,
// not about the ones a drawer produces.
export function jonesVersusAlexander(opts = {}) {
  const count = opts.count ?? 24;
  const n = opts.n ?? 120;
  const moves = opts.moves ?? 8000;
  const onProgress = opts.onProgress ?? null;

  const byJones = new Map();
  const byAlexander = new Map();
  const byDet = new Map();
  let usable = 0;

  const record = (pts) => {
    const r = kmtReduce(pts);
    let d;
    try { d = bestDiagram(r.points); } catch (e) { return; }
    if (d.crossings.length > 16) return;
    const j = jones(d);
    if (!j.jones) return;
    let a = null;
    try { a = alexander(d); } catch (e) { return; }
    if (!a || !a.alexander) return;
    usable++;
    const jk = L.format(j.jones, 't');
    const ak = L.format(a.alexander, 't');
    const dk = absBig(jonesAtMinusOne(j.jones)).toString();
    byJones.set(jk, (byJones.get(jk) ?? 0) + 1);
    byAlexander.set(ak, (byAlexander.get(ak) ?? 0) + 1);
    byDet.set(dk, (byDet.get(dk) ?? 0) + 1);
  };

  // The fixtures go in first, so the chiral pair is definitely present.
  // Without them the measurement would be about the sampler rather than about
  // the invariants: if the drawer never produces a chiral pair, Jones has
  // nothing to resolve and its redundancy here says nothing about knots.
  for (const id of FIXTURES) record(buildCurve(id));

  for (let s = 0; s < count; s++) {
    const tg = closedTangle({ n, seed: (opts.seed ?? 31337) * (s + 1), moves, thickness: 0.15, confine: 0.2 });
    record(tg.points);
    if (onProgress) onProgress((s + 1) / count);
  }

  return {
    params: { n, moves, count },
    usable,
    distinctJones: byJones.size,
    distinctAlexander: byAlexander.size,
    distinctDet: byDet.size,
    // The finding, whichever way it falls: does Jones resolve anything on this
    // ensemble that Alexander does not?
    jonesEarnsItsKeep: byJones.size > byAlexander.size,
    jonesClasses: [...byJones].sort((a, b) => b[1] - a[1]),
    alexanderClasses: [...byAlexander].sort((a, b) => b[1] - a[1]),
  };
}
