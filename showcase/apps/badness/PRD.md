# Badness — PRD

## One line

Every browser and word processor breaks paragraphs greedily, one line at a
time. TeX breaks the whole paragraph at once, as a shortest path. This is that
algorithm, in a tab — and TeX itself grades the answer.

## Why this project exists

The repo has sixty-four projects and not one of them sets type. It also has a
house rule: a project has to *prove* something against ground truth it did not
produce. Line breaking is unusually good for that rule, because the reference
implementation is not a paper or a table of numbers — it is a program, it is
forty years old, it is installed on this machine, and it will show its working.

`\tracingparagraphs=1` makes TeX dump every feasible breakpoint it considered,
with the badness, the penalty, the demerits, the fitness class and the running
total for each one. That is not a summary statistic to compare against. It is
the algorithm's entire internal state, authored by Knuth, and any disagreement
is a bug in this code.

## The claim

On Knuth's own example paragraph, at the same measure, with the same font
metrics and the same parameters, this implementation reproduces TeX's line
breaking **exactly**: the same set of feasible breakpoints, the same badness at
each, the same demerits, the same fitness classes, the same chosen path, and
the same total demerits.

Ground truth, captured from `tex` on this machine (hsize 2.5in, cmr10,
tolerance 10000, first pass):

```
@ via @@0 b=8  p=0       d=324     @@1: line 1.2 t=324   -> @@0
@ via @@1 b=41 p=0       d=2601    @@2: line 2.1 t=2925  -> @@1
@ via @@2 b=7  p=0       d=289     @@3: line 3.2 t=3214  -> @@2
@ via @@3 b=0  p=0       d=100     @@4: line 4.2 t=3314  -> @@3
@ via @@4 b=88 p=0       d=9604    @@5: line 5.1 t=12918 -> @@4
@ via @@4 b=1  p=0       d=121     @@6: line 5.2 t=3435  -> @@4
@ via @@6 b=0  p=-10000  d=100     @@7: line 6.2- t=3535 -> @@6
```

Total demerits: **3535**. That number is the acceptance test.

## Scope

### In

1. **The box–glue–penalty model.** Text becomes boxes (glyph runs), glue
   (interword space with stretch and shrink), and penalties (hyphens, the
   forced break at `\par`). This is TeX's abstraction and the whole algorithm
   is defined over it.

2. **Badness and demerits, to the letter.**
   - adjustment ratio `r` per line from the glue's stretch/shrink
   - `badness = round(100 * |r|^3)`, capped at 10000, infinite if `r < -1`
   - `demerits = (linepenalty + badness)^2`, plus `p^2` for `0 <= p < 10000`,
     minus `p^2` for `-10000 < p < 0`, and neither at `p <= -10000`
   - `+ doublehyphendemerits` when two consecutive lines end in a hyphen
   - `+ adjdemerits` when adjacent lines differ in fitness class by more than 1
   - fitness classes: tight (0), decent (1), loose (2), very loose (3)

3. **The dynamic program.** Feasible breakpoints as nodes, lines as edges,
   total demerits as path cost; an active-node list pruned by tolerance, with
   the emergency pass when no feasible breaking exists.

4. **Liang hyphenation.** The real TeX en-US patterns compiled into a trie,
   `leftmin=2`, `rightmin=3`, applied as odd-value-wins competition between
   overlapping patterns. Written from the algorithm, not lifted from a library;
   only the pattern *data* is vendored.

5. **Exact cmr10 metrics.** Character widths, the ligature table (`fi`, `ff`,
   `fl`, `ffi`, `ffl`), kern pairs, and the font's own interword space,
   stretch and shrink, extracted from `cmr10.tfm` via `tftopl` and committed as
   JSON. The page and the Node tests read the same table, so a result in the
   browser and a result under Node are the same result.

6. **The adversaries.** Greedy first-fit (what every browser does) and best-fit,
   run over the identical boxes and glue so the only variable is the choice of
   breakpoints.

7. **Interaction.** Measure, tolerance, hyphenation on/off, line penalty,
   double-hyphen and adjacency demerits, all live; the paragraph re-breaks as
   you drag.

8. **Rivers.** Vertical channels of whitespace detected by correlating the gap
   positions of adjacent lines, measured for each algorithm.

9. **The bench.** Self-tests that run in the page and under Node, each decided
   by something outside the code it tests:
   - the TeX trace above, breakpoint by breakpoint
   - **brute force**: on short paragraphs, enumerate every legal set of breaks
     and confirm the DP's answer is the true minimum, not merely a good one
   - the hyphenator against a held-out list of known hyphenations, reporting
     both accuracy and false-hyphen rate
   - ligature and kern application against the TFM tables
   - badness/demerit arithmetic against hand-computed values

10. **A corpus run.** A committed public-domain text, every paragraph broken
    three ways, reporting total demerits, overfull and underfull lines, hyphens
    used, and how often greedy is strictly worse.

### Out

- Vertical layout, page breaking, floats, math mode.
- Multiple fonts or sizes. One font, cmr10, is the point.
- Non-English hyphenation.
- Editing the text in place beyond swapping between committed samples.

## The honest part

The corpus run will produce a number for how much better optimal breaking
actually is. Whatever that number is, it ships — including if it turns out the
win is small at ordinary measures and only matters in narrow columns, which is
what I expect and which would undercut the headline. Any claim that dies in
measurement gets written down where it died, in the repo's house style.

## Look

Computer Modern on a dark ground, because the type is the subject. The
paragraph is the hero; the diagnostics sit around it.

- **Glue as springs.** Each line's interword glue drawn at its true stretch or
  shrink, warm where it is stretched, cool where compressed, so a badness of 88
  is visible before it is read.
- **The lattice.** Feasible breakpoints as nodes above the text with arcs for
  every candidate line, the chosen path lit and the discarded ones faint — the
  shortest-path structure made literal.
- **The split.** Greedy and optimal, same paragraph, same measure, with the
  words that moved marked.
- **Rivers.** The whitespace channels drawn over the justified block.

## Acceptance

- [ ] Reproduces TeX's trace exactly on the reference paragraph, t=3535
- [ ] DP proven optimal by exhaustive search on short paragraphs
- [ ] Hyphenator validated with accuracy and false-hyphen rate reported
- [ ] `node tests.mjs` exits non-zero on any failure
- [ ] Runs from its own folder with no build step and no network
- [ ] README with screenshots; registered in the showcase and the root README
