# Placecard — Product Requirements Document

## One line

Seat every guest at a wedding, gala or team dinner in a specific chair, not
just at a table. Then, when someone ends up unhappy, it tells you what fixing
that would cost.

## Why this exists

Seating charts take a lot of event-planning time, and the work goes badly in a
familiar way. You drag a hundred names around a floor plan until a
late RSVP, a divorce or a feud undoes the evening's work. The underlying problem
is NP-complete. It is a graph-partitioning problem with capacities, and Lewis &
Carroll (*JORS* 2016) wrote it up as such, describing the heuristic behind a
commercial planner. The commercial tools that exist fall into two kinds:

- **Drag-and-drop canvases.** These have no solver. You do all the combinatorics.
- **Table-only solvers.** These put a guest at Table 6 but cannot say that the
  guest is next to their partner and across from their best friend. Who you sit
  *beside* is most of what makes a dinner good or bad.

None of them explains a bad result. "Dana and Priya couldn't sit together" is
useless unless it comes with *why*: what moving them would break, and how many
points it would cost.

Placecard builds the missing piece. It is a seat-level solver that you can watch
work, a pre-flight check that **proves** a plan impossible before you waste time
on it, and a "what would it cost?" answer for every unmet wish.

## Who it is for

Anyone organising one seated meal for 20 to 300 people: couples planning a
wedding, office managers, gala committees and teachers doing class seating. They
are not operations researchers. Every concept on screen has to read as
plain-language seating.

## Core concepts

| Concept | Meaning |
|---|---|
| **Guest** | A name, optional tag (e.g. "Bride's family", "Work"), optional dietary note for the place card |
| **Party** | A household that arrived together. Members must share a table and prefer adjacent seats |
| **Table** | Round (seats around a circle) or long (two facing sides, optional ends). Has a name, capacity and floor position |
| **Seat** | One chair. Seats know their table, their left/right neighbours and the seat directly across |
| **Wish** | A relation between two guests |
| **Lock** | Pin a guest to a seat, or to a table |

### Wish types

| Wish | Strength | Satisfied when |
|---|---|---|
| Must sit together | hard | same table |
| Next to | soft, strong | adjacent seats |
| Prefer together | soft | same table |
| Prefer apart | soft | different tables |
| Never together | hard | different tables |

There are also two implicit, adjustable terms:

- **Nobody alone.** A guest with ties to other guests but none at their table
  scores a penalty. Nobody should be the stranger at Table 9.
- **Keep groups together.** A small bonus for guests sharing a tag at the same
  table, which keeps "college friends" from scattering.

## Scoring

Score is a single number to maximise, and it decomposes exactly into per-table
parts:

```
score = Σ tables [ Σ pairs at table  wTable(a,b)
                 + Σ adjacent pairs  wAdj(a,b)
                 + Σ across pairs    wAcross(a,b)
                 − isolation penalties ]
```

A hard wish is a weight of ±1000, so any assignment that breaks no hard wish
beats every assignment that breaks one. The UI never shows the raw ±1000. It
reports hard violations as a count and shows the soft score separately.

Because the score decomposes by table, a move that touches tables A and B
changes only those two tables' terms. The solver re-scores two tables of about
ten people rather than the whole room, which is what makes hundreds of thousands
of moves per second possible.

## The solver

Simulated annealing runs in a Web Worker so the floor plan stays live.

- **Moves:**
  1. Swap two seats, either of which may be empty.
  2. **Party swap:** take a guest's whole must-together group and exchange it
     with the same number of seats at another table. Without this move a couple
     can never change tables. Moving one of them alone breaks a hard wish, and
     at low temperature that is never accepted.
- Locked guests never move. A guest locked to a table moves only within it.
- **Schedule:** the starting temperature is estimated from the mean |Δ| of random
  moves, cooling is geometric, and the solver restarts from the best assignment
  found so far, keeping the overall best.
- The solver is seeded and deterministic. The same plan and seed give the same
  seating.
- It streams progress (best score, current temperature, moves/s) to a live chart.

## Pre-flight check: prove it impossible

Before solving, a lint pass looks for plans that **cannot** be satisfied. It
gives every finding as a proof, never a guess:

1. More guests than seats.
2. A must-together group (union of parties and must wishes) larger than the
   biggest table.
3. A never-together pair inside one must-together group, which is a direct
   contradiction.
4. Must-together groups that cannot be packed into the tables. This is exact
   bin-packing by backtracking with a node budget, and it reports "provably
   impossible" only when the search ran to completion.
5. A guest who asks to be next to more than two people. A chair has two
   neighbours.
6. Lock conflicts: two guests locked to one seat, more locks on a table than it
   has seats, or a lock that forces a never-together pair onto one table.

## "What would it cost?"

For any unmet wish, the user can ask what fixing it would cost. The worker:

1. Takes the current seating as a warm start.
2. Promotes that wish to hard.
3. Runs a short solve.
4. Reports the difference, e.g. *"Possible. Costs 12 points: Sam loses the seat
   next to Lee, and Table 4 splits the college group."* If no seating satisfies it
   without breaking another hard wish, the answer says so.

The user can apply that seating or discard it.

## Screens

- **Guest list (left):** search, add, a bulk paste importer, parties as grouped
  rows, an unseated count, and each guest's happiness as a coloured dot.
- **Floor plan (centre):** an SVG room. Tables can be dragged in Layout mode.
  Seats show initials coloured by happiness. You can drag a guest onto any seat
  to swap them. Hovering a guest draws their wishes as lines: green for
  together/next-to, red for apart/never.
- **Inspector (right):** the selected guest's wishes with a ✓/✗ for each, a
  plain-language reason, locks, and a "What would it cost?" button for every ✗.
  With no guest selected it shows the plan summary: hard violations, soft score,
  average happiness, the unhappiest five guests, and lint findings.
- **Solve bar:** a Solve / Stop button, a seed field, an effort setting, and a
  live score chart.
- **Print view:** escort cards (alphabetical: name → table), table rosters, and
  folded tent place cards with the dietary note. Uses `@media print`.

## Import / export

- **Paste importer:** one party per line, members separated by `&` or `,`, with
  an optional `| tag` and optional `(diet)`. Example:
  `Ana Ruiz (veg) & Tom Ruiz | Bride's family`
- **JSON:** save and load the whole plan.
- **CSV export:** Name, Party, Tag, Table, Seat, Happiness.
- **Autosave** to localStorage, wrapped in try/catch so a private window still
  works.

## Demo plan

A generated, seeded wedding for 96 guests: a head table, nine rounds of ten and
one long table. It includes families, a college group, coworkers, a kids' table
wish, a divorced couple (never together), an uncle everyone wants to avoid, and
a few "next to" requests. It is designed so that the best seating scores high
but not perfect, leaving one or two wishes to ask the cost of.

## Verification

`tests/bench.mjs` runs under plain Node and checks:

1. **Incremental = full.** After 50,000 random moves, the solver's running score
   equals a from-scratch recomputation.
2. **Planted optimum.** Seat 60 guests at random, generate only wishes that this
   seating satisfies, scramble the seating, and solve. The solver must find a
   seating with zero hard violations and a score ≥ the planted one.
3. **Brute-force optimum.** For 8 guests at two tables of four, enumerate all
   40,320 seatings and check that the solver hits the true optimum.
4. **Lint soundness.** Each impossibility rule fires on a hand-built impossible
   plan and stays silent on the demo.
5. **Locks hold.** Locked guests are in place after every solve.
6. **Determinism.** The same seed gives an identical seating.

## Non-goals

- Accounts, sharing and a backend. Everything stays in the browser.
- Venue-accurate CAD. Tables are positioned, not dimensioned.
- RSVP management.

## Stack

Vanilla JS with ES modules, SVG for the floor plan, and a Web Worker for the
solver. There are no dependencies and no build step, so it is hostable from the
showcase as a static folder.
