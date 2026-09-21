// Knuth-Plass total-fit line breaking.
//
// A paragraph is a list of boxes (glyph runs), glue (interword space that can
// stretch and shrink) and penalties (places a break is allowed, at a price).
// Breaking it is then a shortest-path problem: every feasible breakpoint is a
// node, every line is an edge, the edge weight is the line's demerits, and the
// best paragraph is the cheapest path from the start to the end.
//
// Greedy breaking walks that graph one edge at a time, taking the longest line
// that fits and never reconsidering. It cannot see that a slightly worse line
// now buys two much better lines later, which is the whole reason this
// algorithm exists.
//
// All arithmetic is in scaled points (1pt = 65536sp), as integers, because the
// point of this module is to agree with TeX exactly and TeX counts in sp.

export const SP = 65536;
export const INF_BAD = 10000;
export const EJECT_PENALTY = -10000;
export const INF_PENALTY = 10000;

/** Fitness classes, named as TeX names them. */
export const VERY_LOOSE = 0, LOOSE = 1, DECENT = 2, TIGHT = 3;
export const FITNESS_NAMES = ['very loose', 'loose', 'decent', 'tight'];

export const DEFAULTS = {
  linePenalty: 10,
  hyphenPenalty: 50,
  adjDemerits: 10000,
  doubleHyphenDemerits: 10000,
  finalHyphenDemerits: 5000,
  tolerance: 200,
  looseness: 0,
  // TeX breaks a paragraph in up to three passes: without hyphenation at
  // \pretolerance, then with it at \tolerance, then an emergency pass. Some
  // rules only apply on the last one, so the breaker has to be told which
  // pass this is.
  finalPass: true,
};

/**
 * TeX's badness function, §108 of tex.web, integer for integer.
 *
 * It approximates 100*(t/s)^3 without floating point. Reimplementing the
 * approximation rather than the formula matters: the whole claim of this
 * project is that the numbers come out identical to TeX's, and a rounding
 * difference at a boundary would break that.
 */
export function badness(t, s) {
  if (t === 0) return 0;
  if (s <= 0) return INF_BAD;
  let r;
  if (t <= 7230584) r = Math.floor((t * 297) / s);
  else if (s >= 1663497) r = Math.floor(t / Math.floor(s / 297));
  else r = t;
  if (r > 1290) return INF_BAD;
  return Math.floor((r * r * r + 0x20000) / 0x40000);
}

export const box = (width, text = '') => ({ type: 'box', width, text });
export const glue = (width, stretch, shrink, fil = 0) => ({ type: 'glue', width, stretch, shrink, fil });
export const penalty = (penalty, width = 0, flagged = false) => ({ type: 'penalty', penalty, width, flagged });

/**
 * Close a paragraph the way TeX does: forbid a break at the very end of the
 * text, add infinitely stretchable glue so the last line need not be full,
 * then force a break.
 *
 * The final break is flagged, which looks odd until you read S873: TeX ends a
 * paragraph with `try_break(eject_penalty, hyphenated)`, so the closing break
 * carries the hyphenated break type. That is what makes \finalhyphendemerits
 * reachable — the charge for ending the second-to-last line with a hyphen,
 * which is a thing typographers mind and greedy breaking cannot even notice.
 */
export function finish(items) {
  return [...items, penalty(INF_PENALTY), glue(0, 0, 0, 1), penalty(EJECT_PENALTY, 0, true)];
}

/** A break may happen at a penalty below infinity, or at glue that follows a box. */
function isLegalBreak(items, i) {
  const it = items[i];
  if (it.type === 'penalty') return it.penalty < INF_PENALTY;
  if (it.type === 'glue') return i > 0 && items[i - 1].type === 'box';
  return false;
}

export function breakParagraph(items, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const lineWidth = opt.lineWidth;
  const widthOf = typeof lineWidth === 'function' ? lineWidth : () => lineWidth;

  // Prefix sums, so any line's natural width, stretch and shrink is one
  // subtraction instead of a walk. A penalty's width counts only when the
  // break actually lands on it, so it contributes nothing here.
  const n = items.length;
  const W = new Float64Array(n + 1);
  const Y = new Float64Array(n + 1);
  const FIL = new Float64Array(n + 1);
  const Z = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    W[i + 1] = W[i] + (it.type === 'penalty' ? 0 : it.width);
    Y[i + 1] = Y[i] + (it.type === 'glue' ? it.stretch : 0);
    FIL[i + 1] = FIL[i] + (it.type === 'glue' ? (it.fil ?? 0) : 0);
    Z[i + 1] = Z[i] + (it.type === 'glue' ? it.shrink : 0);
  }

  /** Where a line beginning after break `a` actually starts: glue and penalties
   *  at the head of a line are discarded. */
  function lineStart(a) {
    if (a === -1) return 0;
    let i = a + 1;
    while (i < n && (items[i].type === 'glue' || items[i].type === 'penalty')) i++;
    return i;
  }

  /** Active nodes, keyed so that only the best route to each
   *  (breakpoint, line-count parity, fitness) combination survives. */
  let active = [{
    position: -1, line: 0, fitness: DECENT, totalDemerits: 0,
    previous: null, hyphenated: false, ratio: 0, badness: 0, demerits: 0,
  }];

  const trace = [];

  for (let b = 0; b < n; b++) {
    if (!isLegalBreak(items, b)) continue;
    const it = items[b];
    const pi = it.type === 'penalty' ? it.penalty : 0;
    const extraWidth = it.type === 'penalty' ? it.width : 0;
    const forced = pi <= EJECT_PENALTY;

    /** Best candidate per fitness class arriving at this breakpoint. */
    const best = new Map();
    const survivors = [];

    for (const a of active) {
      const start = lineStart(a.position);
      const natural = W[b] - W[start] + extraWidth;
      const stretch = Y[b] - Y[start];
      const fil = FIL[b] - FIL[start];
      const shrink = Z[b] - Z[start];
      const target = widthOf(a.line + 1);
      const shortfall = target - natural;

      let ratio, bad, fitness;
      if (shortfall > 0) {
        if (fil > 0) {
          // Infinitely stretchable glue absorbs anything at no cost. This is
          // what makes a short last line free rather than catastrophic.
          ratio = 0; bad = 0;
        } else if (stretch > 0) {
          ratio = shortfall / stretch;
          bad = badness(Math.round(shortfall), Math.round(stretch));
        } else {
          ratio = Infinity; bad = INF_BAD;
        }
        fitness = bad > 12 ? (bad > 99 ? VERY_LOOSE : LOOSE) : DECENT;
      } else {
        ratio = shrink > 0 ? shortfall / shrink : -Infinity;
        // A line that cannot shrink enough is overfull and simply not allowed.
        bad = -shortfall > shrink ? INF_BAD + 1 : badness(Math.round(-shortfall), Math.round(shrink));
        fitness = bad > 12 ? TIGHT : DECENT;
      }

      // Deactivate a node once no later breakpoint could ever reach it.
      const hopeless = bad > INF_BAD || forced;
      const feasible = bad <= opt.tolerance && pi < INF_PENALTY;

      if (feasible) {
        const hyphenated = it.type === 'penalty' && it.flagged;

        // Artificial demerits, §851. At a break it cannot refuse, on the last
        // pass it will make, with one active node left and nothing feasible
        // recorded yet, TeX charges nothing: no choice is being made, so there
        // is nothing to price. The trace prints it as "d=*". Without this the
        // closing line of a tightly-constrained paragraph is charged for a
        // fitness-class jump it had no way to avoid — 10100 demerits on
        // Knuth's own paragraph at 216pt, enough to choose a different
        // breaking for the whole thing.
        const artificial = forced && opt.finalPass && active.length === 1 && best.size === 0;

        let d = 0;
        if (!artificial) {
          // Demerits, §859. The line penalty is squared together with the
          // badness so that one awful line costs more than several mediocre
          // ones — that convexity is what makes a paragraph come out even.
          d = opt.linePenalty + bad;
          d = Math.abs(d) >= 10000 ? 100000000 : d * d;
          if (pi !== 0) {
            if (pi > 0) d += pi * pi;
            else if (pi > EJECT_PENALTY) d -= pi * pi;
          }
          if (hyphenated && a.hyphenated) {
            d += b === n - 1 ? opt.finalHyphenDemerits : opt.doubleHyphenDemerits;
          }
          if (Math.abs(fitness - a.fitness) > 1) d += opt.adjDemerits;
        }

        const total = a.totalDemerits + d;
        const key = fitness;
        const cur = best.get(key);
        if (!cur || total < cur.totalDemerits) {
          best.set(key, {
            position: b, line: a.line + 1, fitness, totalDemerits: total,
            previous: a, hyphenated, ratio, badness: bad, demerits: d,
          });
        }
        trace.push({ at: b, from: a.position, badness: bad, penalty: pi, demerits: d, total, fitness, line: a.line + 1 });
      }

      if (!hopeless) survivors.push(a);
    }

    active = survivors;
    for (const cand of best.values()) active.push(cand);
    if (active.length === 0) return null; // no feasible breaking at this tolerance
  }

  // The forced break at the end means every surviving node ends the paragraph;
  // take the cheapest, honouring \looseness if it was asked for.
  const finished = active.filter((a) => a.position === n - 1);
  if (finished.length === 0) return null;

  let chosen = finished[0];
  for (const a of finished) if (a.totalDemerits < chosen.totalDemerits) chosen = a;
  if (opt.looseness !== 0) {
    const want = chosen.line + opt.looseness;
    let bestLoose = null;
    for (const a of finished) {
      const delta = Math.abs(a.line - want);
      if (!bestLoose || delta < Math.abs(bestLoose.line - want)
        || (delta === Math.abs(bestLoose.line - want) && a.totalDemerits < bestLoose.totalDemerits)) bestLoose = a;
    }
    chosen = bestLoose;
  }

  const path = [];
  for (let a = chosen; a && a.position !== -1; a = a.previous) path.unshift(a);

  return {
    totalDemerits: chosen.totalDemerits,
    lines: path.map((a) => ({
      position: a.position, ratio: a.ratio, badness: a.badness,
      demerits: a.demerits, fitness: a.fitness, hyphenated: a.hyphenated,
    })),
    breaks: path.map((a) => a.position),
    trace,
  };
}

// ---------------------------------------------------------------------------
// Shared measurement, so the adversaries below and the brute-force check in
// the bench score a breaking with exactly the code that produced it.
// ---------------------------------------------------------------------------

/** Prefix sums of width, stretch, infinite stretch and shrink. */
export function sums(items) {
  const n = items.length;
  const W = new Float64Array(n + 1), Y = new Float64Array(n + 1);
  const FIL = new Float64Array(n + 1), Z = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    W[i + 1] = W[i] + (it.type === 'penalty' ? 0 : it.width);
    Y[i + 1] = Y[i] + (it.type === 'glue' ? it.stretch : 0);
    FIL[i + 1] = FIL[i] + (it.type === 'glue' ? (it.fil ?? 0) : 0);
    Z[i + 1] = Z[i] + (it.type === 'glue' ? it.shrink : 0);
  }
  return { W, Y, FIL, Z };
}

/** Glue and penalties at the head of a line are discarded. */
export function lineStart(items, a) {
  if (a === -1) return 0;
  let i = a + 1;
  while (i < items.length && (items[i].type === 'glue' || items[i].type === 'penalty')) i++;
  return i;
}

export function legalBreaks(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === 'penalty' ? it.penalty < INF_PENALTY
      : it.type === 'glue' && i > 0 && items[i - 1].type === 'box') out.push(i);
  }
  return out;
}

/** Badness, fitness and the adjustment ratio of the line running a -> b. */
export function measureLine(items, S, a, b, target) {
  const start = lineStart(items, a);
  const it = items[b];
  const natural = S.W[b] - S.W[start] + (it.type === 'penalty' ? it.width : 0);
  const stretch = S.Y[b] - S.Y[start], fil = S.FIL[b] - S.FIL[start], shrink = S.Z[b] - S.Z[start];
  const shortfall = target - natural;
  let ratio, bad, fitness;
  if (shortfall > 0) {
    if (fil > 0) { ratio = 0; bad = 0; }
    else if (stretch > 0) { ratio = shortfall / stretch; bad = badness(Math.round(shortfall), Math.round(stretch)); }
    else { ratio = Infinity; bad = INF_BAD; }
    fitness = bad > 12 ? (bad > 99 ? VERY_LOOSE : LOOSE) : DECENT;
  } else {
    ratio = shrink > 0 ? shortfall / shrink : -Infinity;
    bad = -shortfall > shrink ? INF_BAD + 1 : badness(Math.round(-shortfall), Math.round(shrink));
    fitness = bad > 12 ? TIGHT : DECENT;
  }
  return { ratio, badness: bad, fitness, natural, stretch, shrink, fil, shortfall, overfull: -shortfall > shrink };
}

/** Demerits of one line, TeX S859. */
export function lineDemerits(bad, pi, fitness, prevFitness, hyphenated, prevHyphenated, isLast, opt) {
  let d = opt.linePenalty + bad;
  d = Math.abs(d) >= 10000 ? 100000000 : d * d;
  if (pi !== 0) {
    if (pi > 0) d += pi * pi;
    else if (pi > EJECT_PENALTY) d -= pi * pi;
  }
  if (hyphenated && prevHyphenated) d += isLast ? opt.finalHyphenDemerits : opt.doubleHyphenDemerits;
  if (Math.abs(fitness - prevFitness) > 1) d += opt.adjDemerits;
  return d;
}

/**
 * Score an arbitrary set of breakpoints. Used to put greedy and best-fit on
 * the same scale as the optimum, and by the bench's brute-force check.
 */
export function scoreBreaking(items, breaks, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const widthOf = typeof opt.lineWidth === 'function' ? opt.lineWidth : () => opt.lineWidth;
  const S = sums(items);
  let prev = -1, prevFitness = DECENT, prevHyphenated = false, total = 0;
  const lines = [];
  breaks.forEach((b, i) => {
    const m = measureLine(items, S, prev, b, widthOf(i + 1));
    const it = items[b];
    const pi = it.type === 'penalty' ? it.penalty : 0;
    const hyphenated = it.type === 'penalty' && Boolean(it.flagged);
    const d = lineDemerits(m.badness, pi, m.fitness, prevFitness, hyphenated, prevHyphenated,
      i === breaks.length - 1, opt);
    total += d;
    lines.push({ position: b, ...m, demerits: d, hyphenated });
    prev = b; prevFitness = m.fitness; prevHyphenated = hyphenated;
  });
  return { totalDemerits: total, lines, breaks };
}

/**
 * First-fit: take the longest line that still fits, then forget it happened.
 * This is what a browser does, and what every word processor does, and the
 * reason justified text on the web has the rivers it has.
 */
export function greedyBreak(items, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const widthOf = typeof opt.lineWidth === 'function' ? opt.lineWidth : () => opt.lineWidth;
  const S = sums(items);
  const legal = legalBreaks(items);
  const breaks = [];
  let prev = -1, line = 1, last = null;
  for (const b of legal) {
    const m = measureLine(items, S, prev, b, widthOf(line));
    if (m.overfull) {
      // This one no longer fits, so commit the previous candidate.
      if (last === null) { breaks.push(b); prev = b; line++; last = null; continue; }
      breaks.push(last); prev = last; line++; last = null;
      const again = measureLine(items, S, prev, b, widthOf(line));
      if (!again.overfull) last = b;
    } else {
      last = b;
    }
    if (b === items.length - 1) { breaks.push(b); break; }
  }
  if (breaks[breaks.length - 1] !== items.length - 1) breaks.push(items.length - 1);
  return breaks;
}

/**
 * Best-fit: among the breakpoints that fit, take the least bad one — still
 * deciding each line on its own, with no view of what it costs later.
 */
export function bestFitBreak(items, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const widthOf = typeof opt.lineWidth === 'function' ? opt.lineWidth : () => opt.lineWidth;
  const S = sums(items);
  const legal = legalBreaks(items);
  const breaks = [];
  let prev = -1, line = 1;
  while (prev < items.length - 1) {
    let choice = null, choiceBad = Infinity;
    for (const b of legal) {
      if (b <= prev) continue;
      const m = measureLine(items, S, prev, b, widthOf(line));
      if (m.overfull) { if (choice === null) { choice = b; choiceBad = m.badness; } break; }
      if (m.badness <= choiceBad) { choice = b; choiceBad = m.badness; }
    }
    if (choice === null) choice = items.length - 1;
    breaks.push(choice); prev = choice; line++;
    if (choice === items.length - 1) break;
  }
  return breaks;
}

/**
 * The optimum by exhaustive search: try every legal combination of breakpoints
 * and keep the cheapest.
 *
 * This exists to check the dynamic program rather than to replace it. The DP
 * is the interesting part and also the part that could quietly be wrong — it
 * prunes, it keeps one active node per fitness class, and a subtle error there
 * yields a good-looking paragraph that is not actually optimal. Enumeration
 * has no such structure to get wrong, so where both can run they must agree.
 *
 * Exponential in the number of breakpoints, so only for short paragraphs.
 */
export function bruteForce(items, options = {}) {
  const opt = { ...DEFAULTS, ...options };
  const widthOf = typeof opt.lineWidth === 'function' ? opt.lineWidth : () => opt.lineWidth;
  const S = sums(items);
  const legal = legalBreaks(items);
  const last = items.length - 1;
  let best = null;
  let visited = 0;
  const path = [];

  function walk(prev, line, prevFitness, prevHyphenated, total) {
    if (best && total >= best.totalDemerits) return;   // cannot improve
    for (const b of legal) {
      if (b <= prev) continue;
      const m = measureLine(items, S, prev, b, widthOf(line));
      if (m.overfull) break;                           // and neither will any later one
      if (m.badness > opt.tolerance) continue;
      const it = items[b];
      const pi = it.type === 'penalty' ? it.penalty : 0;
      const hyphenated = it.type === 'penalty' && Boolean(it.flagged);
      const d = lineDemerits(m.badness, pi, m.fitness, prevFitness, hyphenated, prevHyphenated, b === last, opt);
      visited++;
      path.push(b);
      if (b === last) {
        if (!best || total + d < best.totalDemerits) best = { totalDemerits: total + d, breaks: [...path] };
      } else {
        walk(b, line + 1, m.fitness, hyphenated, total + d);
      }
      path.pop();
    }
  }
  walk(-1, 1, DECENT, false, 0);
  return best && { ...best, visited };
}
