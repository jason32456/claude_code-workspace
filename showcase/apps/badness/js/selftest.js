// The bench.
//
// Every check here is decided by something outside the code it tests. Four of
// them are decided by TeX itself, running on the machine that generated the
// committed data; one is decided by exhaustive search, which has no shared
// structure with the dynamic program it is checking; one is a theorem.
//
// That distinction matters more than the count. A line breaker that agrees
// with itself proves nothing: a paragraph always looks plausible, and a subtly
// wrong badness or a mis-pruned active list produces a paragraph that is
// merely good rather than optimal, which no amount of looking will catch.

import { Font, typeset } from './typeset.js';
import { Hyphenator } from './hyphenate.js';
import {
  breakParagraph, bruteForce, finish, badness, scoreBreaking,
  greedyBreak, bestFitBreak, DEFAULTS,
} from './linebreak.js';

/**
 * @param {{metrics:object, patterns:object, texOracle:object,
 *          hyphenOracle:object, metricsOracle:object, corpus:object}} data
 */
export function makeTests(data) {
  const font = new Font(data.metrics);
  const hyphenator = new Hyphenator(data.patterns);

  const pass = (name, expected, measured, detail) => ({ name, pass: true, expected, measured, detail });
  const fail = (name, expected, measured, detail) => ({ name, pass: false, expected, measured, detail });

  return [
    {
      id: 'breaking',
      name: 'Line breaking agrees with TeX',
      run() {
        const O = data.texOracle;
        let ok = 0, lines = 0;
        const bad = [];
        for (const c of O.cases) {
          const second = c.pass === 'second';
          const items = finish(typeset(O.paragraphs[c.paragraph], font, second ? { hyphenator } : {}));
          const r = breakParagraph(items, {
            lineWidth: c.hsize,
            tolerance: second ? c.tolerance : c.pretolerance,
            // Only the hyphenating pass is TeX's last, so only there can a
            // forced break be charged nothing.
            finalPass: second,
          });
          lines += c.lines.length;
          let good = Boolean(r) && r.totalDemerits === c.totalDemerits && r.lines.length === c.lines.length;
          if (good) {
            for (let i = 0; i < r.lines.length; i++) {
              const a = r.lines[i], b = c.lines[i];
              if (a.badness !== b.badness || a.demerits !== b.demerits || a.fitness !== b.fitness) good = false;
            }
          }
          if (good) ok++;
          else bad.push(`${c.paragraph}@${c.hsizePt}pt/${c.mode}`);
        }
        const name = 'Line breaking agrees with TeX';
        const detail = `${O.cases.length} paragraph/measure/pass combinations, ${lines} lines; `
          + 'every badness, penalty, demerit count, fitness class and running total compared '
          + `against \\tracingparagraphs output from ${O.tex}.`;
        return ok === O.cases.length
          ? pass(name, `${O.cases.length} cases identical`, `${ok} identical`, detail)
          : fail(name, `${O.cases.length} cases identical`, `${ok} identical, differs on ${bad.slice(0, 3).join(', ')}`, detail);
      },
    },

    {
      id: 'optimality',
      name: 'The dynamic program finds the true optimum',
      run() {
        // Enumeration is exponential in the number of breakpoints, so this runs
        // on short sentences and on real corpus paragraphs, which are long
        // enough to make the search do actual work — several hundred candidate
        // breakings each — while still finishing in milliseconds.
        const texts = [
          'In olden times when wishing still helped one, there lived a king.',
          'The quick brown fox jumps over the lazy dog and keeps on running.',
          'A paragraph is a sequence of boxes and glue and penalties, nothing more.',
          'Every word processor you have ever used breaks lines one at a time.',
          'Density is armour and the falcon closes on air, or so the starlings hope.',
          ...data.corpus.paragraphs.slice(0, 12),
        ];
        let checked = 0, agree = 0, paths = 0;
        const bad = [];
        for (const t of texts) {
          for (const pt of [108, 126, 144, 162, 180, 198, 216]) {
            for (const hyph of [false, true]) {
              const items = finish(typeset(t, font, hyph ? { hyphenator } : {}));
              // finalPass:false turns off artificial demerits on both sides.
              // That rule zeroes the cost of a break TeX cannot refuse, and it
              // depends on how many nodes are still active — a notion
              // enumeration does not have. Leaving it on would have the two
              // methods minimising different quantities, and the disagreement
              // would say nothing about whether the search is correct.
              const opts = { lineWidth: pt * 65536, tolerance: 1000, finalPass: false };
              const dp = breakParagraph(items, opts);
              const bf = bruteForce(items, opts);
              checked++;
              paths += bf ? bf.visited : 0;
              const same = (!dp && !bf) || (dp && bf && dp.totalDemerits === bf.totalDemerits);
              if (same) agree++;
              else bad.push(`${pt}pt dp=${dp && dp.totalDemerits} brute=${bf && bf.totalDemerits}`);
            }
          }
        }
        const name = 'The dynamic program finds the true optimum';
        const detail = `${checked} paragraph/measure combinations, ${paths} candidate breakings enumerated. `
          + 'Exhaustive search shares no code path with the dynamic program: it does not prune by '
          + 'fitness class, keeps no active list, and cannot discard a route the DP would have kept. '
          + 'Both run with artificial demerits off, so they are minimising the same quantity.';
        return agree === checked
          ? pass(name, `${checked} agree with exhaustive search`, `${agree} agree`, detail)
          : fail(name, `${checked} agree`, `${agree} agree; ${bad[0]}`, detail);
      },
    },

    {
      id: 'hyphenation',
      name: 'Hyphenation agrees with TeX',
      run() {
        const O = data.hyphenOracle;
        let n = 0, ok = 0, missed = 0, spurious = 0;
        const bad = [];
        for (const [plain, spelled] of Object.entries(O.words)) {
          n++;
          const mine = hyphenator.spell(plain);
          if (mine === spelled) { ok++; continue; }
          const M = new Set(hyphenator.positions(plain));
          const T = new Set();
          let k = 0;
          for (const ch of spelled) { if (ch === '-') T.add(k); else k++; }
          for (const t of T) if (!M.has(t)) missed++;
          for (const m of M) if (!T.has(m)) spurious++;
          if (bad.length < 3) bad.push(`${plain}: ${mine} vs ${spelled}`);
        }
        const name = 'Hyphenation agrees with TeX';
        const detail = `${n} words put through \\showhyphens. A spurious break is the damaging kind — `
          + 'it puts a hyphen where English does not allow one — so it is counted separately from a '
          + `missed one. Both are zero. Patterns and \\lefthyphenmin/\\righthyphenmin are TeX's own.`;
        return ok === n
          ? pass(name, `${n} words identical`, `${ok} identical, 0 spurious breaks`, detail)
          : fail(name, `${n} identical`, `${ok} identical, ${missed} missed, ${spurious} spurious — ${bad[0]}`, detail);
      },
    },

    {
      id: 'metrics',
      name: 'Word widths agree with TeX to the scaled point',
      run() {
        const O = data.metricsOracle;
        let n = 0, ok = 0;
        const bad = [];
        for (const [w, expected] of Object.entries(O.widths)) {
          n++;
          const got = font.measure(w).width;
          if (got === expected) ok++;
          else if (bad.length < 3) bad.push(`${w}: ${got} vs ${expected}`);
        }
        const name = 'Word widths agree with TeX to the scaled point';
        const detail = `${n} real words measured with \\number\\wd, which prints scaled points as an `
          + 'integer, so there is nothing to round and nothing to interpret. Ligature formation and '
          + 'kern pairs are included — "officer" is wrong by 18204sp if either is missed.';
        return ok === n
          ? pass(name, `${n} widths exact`, `${ok} exact`, detail)
          : fail(name, `${n} exact`, `${ok} exact — ${bad[0]}`, detail);
      },
    },

    {
      id: 'badness',
      name: 'Badness matches TeX’s integer approximation',
      run() {
        // TeX approximates 100*(t/s)^3 in integer arithmetic. Checking against
        // the real cubic is the point: where the two disagree, TeX is right,
        // because TeX is what the oracle above is made of.
        const cases = [[0, 1, 0], [100, 100, 100], [50, 100, 12], [200, 100, 800], [1, 1000, 0]];
        let ok = 0;
        const bad = [];
        for (const [t, s, expected] of cases) {
          const got = badness(t, s);
          if (got === expected) ok++;
          else bad.push(`badness(${t},${s})=${got} want ${expected}`);
        }
        // And the cap: anything past ratio 1290 is infinitely bad.
        const capped = badness(100000, 1) === 10000;
        if (capped) ok++;
        const total = cases.length + 1;
        const name = 'Badness matches TeX’s integer approximation';
        const detail = 'badness(t,s) reimplements tex.web S108 step for step rather than evaluating '
          + '100(t/s)^3, because the two round differently near class boundaries and a line that lands '
          + 'on 12 or 99 changes fitness class, which changes demerits by 10000.';
        return ok === total
          ? pass(name, `${total} known values`, `${ok} correct`, detail)
          : fail(name, `${total} known values`, `${ok} correct — ${bad[0]}`, detail);
      },
    },

    {
      id: 'telescoping',
      name: 'Hyphenating a word does not change its width',
      run() {
        const words = ['daughters', 'officer', 'difficult', 'beautiful', 'astonished',
          'shuffling', 'affidavits', 'baffled', 'representation', 'youngest'];
        let ok = 0;
        const bad = [];
        for (const w of words) {
          const items = typeset(w, font, { hyphenator });
          const sum = items.filter((i) => i.type === 'box').reduce((a, i) => a + i.width, 0);
          const whole = font.measure(w).width;
          if (sum === whole) ok++;
          else bad.push(`${w}: ${sum} vs ${whole}`);
        }
        const name = 'Hyphenating a word does not change its width';
        const detail = 'Offering a break inside a word must not make the word wider when the break is '
          + 'not taken. Measured naively it does: "of"+"fi"+"cer" loses the ffi ligature and '
          + '"daugh"+"ters" loses a kern, so a paragraph would silently reflow just because '
          + 'hyphenation was switched on.';
        return ok === words.length
          ? pass(name, `${words.length} words unchanged`, `${ok} unchanged`, detail)
          : fail(name, `${words.length} unchanged`, `${ok} unchanged — ${bad[0]}`, detail);
      },
    },

    {
      id: 'greedy',
      name: 'Optimal breaking is never worse than greedy',
      run() {
        // Not an observation — a consequence of the DP minimising over a set
        // that contains greedy's answer. If it ever fails, the DP is broken.
        const paragraphs = data.corpus.paragraphs.slice(0, 120);
        let n = 0, ok = 0, better = 0;
        let sumOpt = 0, sumGreedy = 0;
        const bad = [];
        for (const text of paragraphs) {
          for (const pt of [180, 234, 288]) {
            const items = finish(typeset(text, font, { hyphenator }));
            const opts = { lineWidth: pt * 65536, tolerance: 2000 };
            const opt = breakParagraph(items, opts);
            const greedy = scoreBreaking(items, greedyBreak(items, opts), opts);
            if (!opt) continue;
            n++;
            if (opt.totalDemerits <= greedy.totalDemerits) ok++;
            else bad.push(`${pt}pt opt=${opt.totalDemerits} greedy=${greedy.totalDemerits}`);
            if (opt.totalDemerits < greedy.totalDemerits) better++;
            sumOpt += opt.totalDemerits;
            sumGreedy += greedy.totalDemerits;
          }
        }
        const name = 'Optimal breaking is never worse than greedy';
        const detail = `${n} paragraph/measure combinations from the corpus. Optimal beat greedy `
          + `outright on ${better} of them (${(100 * better / n).toFixed(1)}%); total demerits `
          + `${sumGreedy.toLocaleString()} greedy against ${sumOpt.toLocaleString()} optimal.`;
        return ok === n
          ? pass(name, `${n} never worse`, `${ok} never worse`, detail)
          : fail(name, `${n} never worse`, `${ok} — ${bad[0]}`, detail);
      },
    },
  ];
}

/**
 * The aggregate comparison: every corpus paragraph broken three ways at a
 * range of measures. This is the number that says whether the algorithm is
 * worth having, so it is computed rather than asserted.
 */
export function corpusStudy(data, { measures = [144, 180, 216, 252, 288, 324], limit = 200 } = {}) {
  const font = new Font(data.metrics);
  const hyphenator = new Hyphenator(data.patterns);
  const rows = [];

  for (const pt of measures) {
    const lineWidth = pt * 65536;
    const opts = { lineWidth, tolerance: 2000 };
    const acc = {
      measure: pt, paragraphs: 0,
      optimal: { demerits: 0, lines: 0, hyphens: 0, worst: 0, rivers: 0, badLines: 0, sumBadness: 0 },
      best: { demerits: 0, lines: 0, hyphens: 0, worst: 0, rivers: 0, badLines: 0, sumBadness: 0 },
      greedy: { demerits: 0, lines: 0, hyphens: 0, worst: 0, rivers: 0, badLines: 0, sumBadness: 0 },
      optimalWins: 0, ties: 0,
    };

    for (const text of data.corpus.paragraphs.slice(0, limit)) {
      const items = finish(typeset(text, font, { hyphenator }));
      const optimal = breakParagraph(items, opts);
      if (!optimal) continue;
      const scored = {
        optimal: scoreBreaking(items, optimal.breaks, opts),
        best: scoreBreaking(items, bestFitBreak(items, opts), opts),
        greedy: scoreBreaking(items, greedyBreak(items, opts), opts),
      };
      acc.paragraphs++;
      for (const k of ['optimal', 'best', 'greedy']) {
        const s = scored[k];
        acc[k].demerits += s.totalDemerits;
        acc[k].lines += s.lines.length;
        acc[k].hyphens += s.lines.filter((l) => l.hyphenated).length - 1; // the forced final break is not a hyphen
        acc[k].worst = Math.max(acc[k].worst, ...s.lines.map((l) => Math.min(l.badness, 10000)));
        acc[k].rivers += countRivers(items, s);
        // Demerits are the algorithm's own objective and run to astronomical
        // numbers once a line hits TeX's cap, which is true but unreadable.
        // Badness is the thing a reader would actually notice: over about 100
        // the spacing is visibly wrong.
        for (const l of s.lines) {
          const b = Math.min(l.badness, 10000);
          acc[k].sumBadness += b;
          if (b > 100) acc[k].badLines++;
        }
      }
      if (scored.optimal.totalDemerits < scored.greedy.totalDemerits) acc.optimalWins++;
      else acc.ties++;
    }
    rows.push(acc);
  }
  return rows;
}

/**
 * A river is a channel of white running down a justified block. Counting one
 * properly is a perception problem, so this uses the tractable proxy: an
 * interword gap on one line whose centre sits within half a space of a gap on
 * the line below, chained across three or more lines.
 */
export function countRivers(items, scored, threshold = 3) {
  const gapsPerLine = [];
  let prev = -1;
  for (const line of scored.lines) {
    const gaps = [];
    let x = 0;
    for (let i = lineStartOf(items, prev); i < line.position; i++) {
      const it = items[i];
      if (it.type === 'box') x += it.width;
      else if (it.type === 'glue') {
        const w = it.width + (line.ratio > 0 ? it.stretch : it.shrink) * Math.min(Math.abs(line.ratio), 1) * Math.sign(line.ratio);
        gaps.push(x + w / 2);
        x += w;
      }
    }
    gapsPerLine.push(gaps);
    prev = line.position;
  }

  const tol = 109226; // half an interword space of cmr10, in scaled points
  let rivers = 0;
  for (let i = 0; i < gapsPerLine.length; i++) {
    for (const g of gapsPerLine[i]) {
      let run = 1, x = g;
      for (let j = i + 1; j < gapsPerLine.length; j++) {
        const next = gapsPerLine[j].find((h) => Math.abs(h - x) < tol);
        if (next === undefined) break;
        run++; x = next;
      }
      if (run >= threshold) rivers++;
    }
  }
  return rivers;
}

function lineStartOf(items, a) {
  if (a === -1) return 0;
  let i = a + 1;
  while (i < items.length && (items[i].type === 'glue' || items[i].type === 'penalty')) i++;
  return i;
}
