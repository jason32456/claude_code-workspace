# PRD — Latticework (Sudoku, graded like a person solves it)

## Problem

The showcase has zero grid/logic puzzle games. It has abundant arcade/3D
games, simulations, wellness trackers, and small tools, but nothing in the
"quiet daily puzzle" niche that NYT Games / Web Sudoku fill — a puzzle
people would actually open daily, backed by a genuinely nontrivial algorithm
(unique-solution puzzle generation + human-technique solving), unlike a
simple digit-shuffle Sudoku.

## Goal

Ship a Sudoku app whose puzzles are generated to a *guaranteed unique
solution* and graded by *which solving techniques are required* — not by
naive clue-count — and whose hint system teaches those techniques instead
of just revealing an answer.

## Non-goals

- No accounts/backend — stays a static app under `showcase/apps/`.
- No variants (Killer, Irregular) in v1 — classic 9x9 only.
- No multiplayer/leaderboards.

## Core mechanics

1. **Generator** — build a full valid solved grid via randomized
   backtracking, then remove clues, re-checking after each removal that the
   puzzle still has exactly one solution (a bounded backtracking counter,
   stopped as soon as a second solution is found).
2. **Logical solver / grader** — applies human techniques in increasing
   difficulty order: naked single, hidden single, pointing pairs/triples,
   box-line reduction, naked pairs/triples, hidden pairs/triples, X-Wing.
   The hardest technique needed to fully solve a puzzle sets its difficulty
   label (Easy / Medium / Hard / Expert).
3. **Hint button** — runs the same technique list against the *current*
   board state and reveals the next logical cell plus a plain-language
   explanation ("Hidden single: 7 can only go in R4C2 within this box")
   instead of just filling a random cell.
4. **Play** — click/tap or keyboard to select a cell, digits 1-9 to fill,
   a pencil-mark ("notes") mode, undo/redo, live mistake highlighting
   against the solution, a timer.
5. **Daily Challenge** — one puzzle per calendar date, generated
   deterministically from the date so everyone gets the same puzzle,
   fixed at Medium difficulty. Separate from unlimited practice games.
   A streak counter lives in `localStorage`.
6. **Persistence** — the current puzzle, notes, timer and streak are saved
   to `localStorage` so a reload never loses progress.

## Difficulty tiers

| Tier | Techniques required |
|---|---|
| Easy | Naked/hidden singles only |
| Medium | + pointing pairs/triples, box-line reduction, naked pairs |
| Hard | + naked triples, hidden pairs/triples |
| Expert | + X-Wing |

Grading is best-effort: the generator tries several removal orders on the
same solved grid and keeps the hardest result that doesn't exceed the
target, but on some grids the harder techniques genuinely aren't required —
the guarantee is "never harder than selected," not "always exactly this
hard."

## Success criteria

- Every generated puzzle has exactly one solution (verified before it's
  ever shown to the player).
- Hint explanations are technique-accurate, not just "here's a number" —
  confirmed by fully solving generated puzzles using hints alone and
  checking every revealed digit against the known solution.
- Playable end-to-end with keyboard only and with touch/click only.
- Puzzle generation never blocks the UI thread (runs in a Web Worker),
  since Hard/Expert carving can take over a second.

## Stack

Vanilla JS (ES modules), no build step, no CDN dependencies — matches repo
convention. Solver (`js/solver.js`) and generator (`js/generator.js`) are
independent, framework-free modules; `js/game.js` holds state and
persistence; `js/worker.js` runs generation off the main thread;
`main.js` wires up the DOM.
