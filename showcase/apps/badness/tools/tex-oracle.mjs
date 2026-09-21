// Runs real TeX over a set of paragraphs and measures, parses what
// \tracingparagraphs prints, and commits the result as data/tex-oracle.json.
//
// \tracingparagraphs=1 is an unusually generous oracle: it does not report
// TeX's answer, it reports TeX's reasoning — every feasible breakpoint, the
// badness and demerits of the line arriving at it, its fitness class, the
// running total and which earlier breakpoint it came from. There is nothing
// left to infer, so any disagreement is a bug here rather than a judgement call.
//
// The JSON is committed so the page can show the comparison on a machine with
// no TeX on it. Regenerate with:  node tools/tex-oracle.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PARAGRAPHS = {
  // Knuth's own example, from the opening of the Frog King. This is the
  // paragraph The TeXbook breaks at 2.5in, so it is the one case where the
  // expected answer is not merely reproducible but published.
  frog: 'In olden times when wishing still helped one, there lived a king whose '
    + 'daughters were all beautiful; and the youngest was so beautiful that the sun '
    + 'itself, which has seen so much, was astonished whenever it shone in her face.',
  algorithm: 'The algorithm attempts to choose breakpoints that minimise the total '
    + 'demerits of a paragraph, considering every feasible combination rather than '
    + 'proceeding greedily from one line to the next, and consequently discovers '
    + 'typographically superior arrangements that no incremental procedure could find.',
  // Long words, to force hyphenation and make the discretionary path carry weight.
  supercal: 'Establishing incontrovertible photolithographic characterisations '
    + 'requires uncompromising interdisciplinary collaboration between '
    + 'crystallographers, spectroscopists and computational thermodynamicists '
    + 'throughout institutionalised laboratories.',
  // Short words, the opposite stress: many breakpoints, little stretch in each.
  monosyllable: 'It is a truth that a man in want of a wife must be in want of a '
    + 'home, and a home in want of a man is a house that is not yet a home at all, '
    + 'for what is a home but a set of small acts done by one for the sake of one '
    + 'more, day on day, till the doing of them is the thing that we call love.',
  // Heavy punctuation, which exercises the space factor: a gap after a full stop
  // is wider and stretches more than a gap inside a clause.
  punctuated: 'He came. He saw. He conquered, or so the story goes; but the story, '
    + 'as told, omits the rain, the mud, the waiting, and the long, dull weeks in '
    + 'which nothing at all occurred. Was it glory? Perhaps. It was certainly wet.',
  ligature: 'The officer of the office found a difficult affliction afflicting the '
    + 'baffled staff: a fluffy, flighty, shuffling fellow who fiddled with the '
    + 'filing, muffled the ruffled affidavits, and finally shuffled off.',
};

// Measures in TeX points. 180.675pt is 2.5in, the width Knuth sets the frog
// paragraph at. Narrow ones force hyphenation and the second pass.
export const MEASURES = [144, 162, 180.675, 198, 216, 234, 252, 270, 288, 324];

/** Escape the characters plain TeX would otherwise interpret. */
const texEscape = (s) => s.replace(/([#$%&_{}])/g, '\\$1');

function runTeX(text, hsizePt, { pretolerance, tolerance }) {
  const dir = mkdtempSync(join(tmpdir(), 'badness-'));
  const src = `\\batchmode
\\tracingparagraphs=1
\\tracingonline=0
\\hsize=${hsizePt}pt
\\parindent=0pt
\\pretolerance=${pretolerance}
\\tolerance=${tolerance}
\\message{^^JHSIZE=\\number\\hsize}
${texEscape(text)}
\\par
\\end
`;
  writeFileSync(join(dir, 'p.tex'), src);
  try {
    execFileSync('tex', ['p.tex'], { cwd: dir, stdio: 'ignore', timeout: 60000 });
  } catch { /* batchmode returns non-zero on warnings; the log is what matters */ }
  return readFileSync(join(dir, 'p.log'), 'utf8');
}

/**
 * Parse the trace into the accepted-node graph, then walk the final node's
 * parents back to the start to recover the breaking TeX actually chose.
 */
function parseTrace(log) {
  const hsize = Number(/HSIZE=(-?\d+)/.exec(log)?.[1] ?? 0);
  const pass = /@emergencypass/.test(log) ? 'emergency'
    : (/@secondpass/.test(log) || !/@firstpass/.test(log)) ? 'second' : 'first';

  const nodes = new Map();
  nodes.set(0, { id: 0, total: 0, parent: null, line: 0, fitness: 2 });

  // TeX prints every candidate for a breakpoint ("@ via @@M b=.. p=.. d=..")
  // and only then the node it keeps ("@@N: line L.F t=T -> @@M"), reporting
  // the best candidate rather than the last one printed. So a candidate cannot
  // be paired with the accepted node by adjacency; it is identified by its
  // parent and by its demerits accounting for the totals exactly.
  const CAND = /^@+(\\par)?\s+via @@(\d+) b=(\*|-?\d+) p=(-?\d+) d=(\*|-?\d+)/;
  const NODE = /^@@(\d+): line (\d+)\.(\d)(-?) t=(-?\d+) -> @@(\d+)/;

  let pending = [];
  let seenNodeSinceCandidate = false;
  for (const raw of log.split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = CAND.exec(line))) {
      if (seenNodeSinceCandidate) { pending = []; seenNodeSinceCandidate = false; }
      pending.push({ final: Boolean(m[1]), via: +m[2], badness: m[3], penalty: +m[4], demerits: m[5] });
    } else if ((m = NODE.exec(line))) {
      seenNodeSinceCandidate = true;
      const [, id, lineNo, fitness, hyphen, t, parent] = m;
      const parentNode = nodes.get(+parent);
      if (!parentNode) continue;
      const want = +t - parentNode.total;
      // Identify the candidate unambiguously: same parent, and demerits that
      // account for the totals exactly. If nothing matches, the attribution is
      // a guess and the case is dropped rather than recorded as ground truth.
      const matches = pending.filter((c) => c.via === +parent && c.demerits !== '*' && +c.demerits === want);
      const cand = matches.length === 1 ? matches[0] : null;
      if (!cand || cand.badness === '*') continue;
      nodes.set(+id, {
        id: +id, badness: +cand.badness, penalty: cand.penalty, demerits: want,
        total: +t, line: +lineNo, fitness: +fitness, hyphenated: hyphen === '-',
        parent: +parent, final: cand.final,
      });
    }
  }

  // The paragraph ends at the forced break after \parfillskip; TeX takes the
  // cheapest route there, not the last one it happened to print.
  let last = null;
  for (const n of nodes.values()) {
    if (!n.final) continue;
    if (!last || n.total < last.total) last = n;
  }
  if (!last) return null;

  const lines = [];
  for (let n = last; n && n.id !== 0; n = nodes.get(n.parent)) {
    lines.unshift({
      badness: n.badness, penalty: n.penalty, demerits: n.demerits,
      total: n.total, fitness: n.fitness, hyphenated: n.hyphenated,
    });
    if (n.parent !== 0 && !nodes.get(n.parent)) return null; // broken chain
  }
  return { hsize, pass, totalDemerits: last.total, lines };
}

const cases = [];
for (const [name, text] of Object.entries(PARAGRAPHS)) {
  for (const hsizePt of MEASURES) {
    // First pass (no hyphenation) where TeX can manage it, and a forced
    // second pass (pretolerance -1) so the hyphenated path is tested too.
    // Plain TeX's own thresholds. A wide tolerance would let TeX accept
    // badness-10000 lines and the "best" breaking would be a degenerate one,
    // which tests nothing. `hyphenated` forces the second pass by making the
    // first impossible; `loose` is what a narrow measure actually needs.
    const MODES = {
      first: { pretolerance: 100, tolerance: 200 },
      hyphenated: { pretolerance: -1, tolerance: 200 },
      loose: { pretolerance: -1, tolerance: 1000 },
    };
    for (const mode of Object.keys(MODES)) {
      const params = MODES[mode];
      const log = runTeX(text, hsizePt, params);
      const parsed = parseTrace(log);
      if (!parsed) continue;
      // Only keep cases where TeX found a genuinely feasible breaking; an
      // overfull or emergency pass is a different algorithm and not the claim.
      if (/Overfull/.test(log)) continue;
      if (parsed.lines.some((l) => l.badness > params.tolerance)) continue;
      cases.push({ paragraph: name, hsizePt, mode, ...params, ...parsed });
    }
  }
}

writeFileSync(new URL('../data/tex-oracle.json', import.meta.url), JSON.stringify({
  note: 'Generated by tools/tex-oracle.mjs from TeX’s own \\tracingparagraphs output.',
  tex: execFileSync('tex', ['--version']).toString().split('\n')[0],
  paragraphs: PARAGRAPHS,
  cases,
}, null, 0));
console.log(`cases=${cases.length}`);
for (const c of cases.slice(0, 6)) console.log(` ${c.paragraph} ${c.hsizePt}pt ${c.pass} lines=${c.lines.length} t=${c.totalDemerits}`);
