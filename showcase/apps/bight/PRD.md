# Bight — Product Requirements Document

## One line

A forensic bureau that will tell you whether the cable you pulled out of the
drawer is *actually* knotted — and that the question was not well-posed until
you decided how to close it.

## Why this shape

The premise is absurd and the mathematics is not. "Is my headphone cable
knotted?" is the most-asked question in applied topology and it has no answer,
because **knot type is an invariant of embeddings of the circle and a cable is
an arc**. Every open curve in R³ is isotopic to a straight segment, so every
open cable is unknotted, and the question has the same answer for all of them.
To get a non-trivial answer you must first *close* the arc — and the closure is
a choice you are making, not a fact about the cable.

That is the whole project in one sentence, and it is a theorem rather than a
gag. The joke is the bureau's total seriousness about it: a certificate, a
verdict, a knot diagram drawn in ink, and a polynomial in large type.

## Why this and not more of the last one

`bardo` was an actuarial desk: Gompertz–Makeham mortality, a semi-Markov chain,
two dense Gauss–Jordan solves, a stationary distribution. This deliberately
shares none of that machinery. The mathematics here is combinatorial topology
and exact Laurent-polynomial state sums — no chains, no distributions, no linear
solves, no money — and the visual genre is the opposite of a corporate
document.

What it keeps is the repository's actual method: implement something hard with
no library, hold an oracle against it that the app did not author, and report
what the measurement says rather than what the plan said.

## The oracle structure

This project was chosen over four alternatives mainly because it is
oracle-rich. There are four independent checks on one computation, and they
found three real bugs between them.

1. **Two invariants from disjoint code.** The Jones polynomial via the Kauffman
   bracket state sum (`jones.js`) and the Alexander polynomial via Fox calculus
   on the Wirtinger presentation (`alexander.js`) share nothing but the diagram.
2. **A bridge theorem.** `|V(−1)| = |Δ(−1)| = det(K)`. Two polynomials computed
   by unrelated machinery must agree on one integer.
3. **A third road to that integer.** A knot admits a non-trivial Fox
   *p*-colouring iff `p | det(K)`. Colouring counts come from Gaussian
   elimination mod *p*, and for small diagrams also from brute-force enumeration
   over all `p^n` assignments — two more disjoint computations.
4. **Published tables.** Every fixture in the app is a *parametric curve*, never
   a hand-typed PD code, so the published `V` and `Δ` of the standard knots
   grade the extractor rather than merely agreeing with my own choice of
   convention.

Plus two structural invariants that cost nothing: `Δ` must be palindromic, and
`V` must not depend on the projection direction.

## What the measurements did to the plan

**Three bugs, each caught by an oracle rather than by reading the code.** All
three produced perfectly self-consistent wrong answers, which is exactly the
failure mode a single-implementation app cannot detect.

**1. The crossing sign was inverted.** The trefoil's Kauffman bracket came back
as `A⁷ − A³ − A⁻⁵` alongside writhe `+3`. Both are individually plausible and
together impossible: that bracket belongs to writhe `−3`. The Jones
normalisation `(−A³)^(−w)` only lands on exponents divisible by 4 when the
writhe and the bracket come from the same handedness, so the divisibility check
threw instead of rounding. Taking `(under, over)` rather than `(over, under)` as
the orientation basis fixed it, and the trefoil then returned the published
`V = −t⁻⁴ + t⁻³ + t⁻¹` exactly.

**2. Minimising crossing number over projections actively selected broken
projections.** Crossing number is a minimum over diagrams, so the app searches
directions for the cleanest one. But `segCross2D` silently *dropped* a crossing
whose parameter landed near a vertex — and a direction with a dropped crossing
looks like a *better* diagram, so the search hunted for exactly those. A `7₁`
curve came back reading as `5₁` with a self-consistent polynomial. Ambiguity had
to become a hard rejection of the whole projection rather than an absent
crossing.

**3. The KMT reducer passed strands through the cable, three different ways.**
Reducing a polygonal knot by deleting a vertex whose triangle nothing pierces is
a theorem, and the implementation was wrong three times over. It skipped the
neighbouring edges `(i−2,i−1)` and `(i+1,i+2)`, which touch the triangle at a
vertex but can still pierce it. It used a boolean intersection test, which is
blind to an edge *coplanar* with the triangle lying across the swept region —
Möller–Trumbore calls that a miss because the determinant vanishes. And the
fix for the shared-vertex problem, pulling edges back off their endpoints by
1e-3 of their length, hid piercings that happen near an edge's own endpoint.
Each version silently turned `7₁` into `5₁`; each was caught because Jones *and*
Alexander independently reported `det 7 → det 5` on a triangle two separately
written intersection tests both called clean, and because an 8-vertex polygon
cannot carry `7₁` at all — its stick number is 9.

**4. The sampler never moved.** Confinement was applied from the first move, but
a loop of `n` unit edges starts at radius `R₀ = 1/(2 sin(π/n))`, which already
violates any interesting drawer. Every move was rejected, the accept rate was
exactly `0%`, and every "tangle" was the pristine circle it started as — which
measured `0%` knotted, a number that looked like a finding and was an artifact.
Confinement is now annealed from the loop's own radius down to the target,
because a drawer squeezes a cable rather than teleporting around it.

## The claims

Each is written so it can come out false, and the app measures it in-page.

| # | Claim | Measured |
|---|---|---|
| C1 | Most tangles that *look* hopelessly tangled are the unknot. | **Confirmed**: 1 of 40 confined loops knotted in the shipped run. |
| C2 | Knottedness is not a property of an open cable: the two closure conventions disagree on a measurable fraction. | **Split — see below.** |
| C3 | Projected crossing count is a poor predictor of knot type. | **Confirmed hard**: 78 crossings, still the unknot. |
| C4 | Jones earns its cost over Alexander on this ensemble, or it does not. | **It does not, on the tangles.** |
| C5 | `\|V(−1)\| = \|Δ(−1)\|` always, and Fox *p*-colourings occur exactly when `p \| det`. | Holds on every diagram tested. |

### C1 and C3, confirmed, and harder than expected

Forty confined cable loops of 160 segments, as the app ships them: **one** was
genuinely knotted. Across several runs the rate lands between about **2% and
8%** — the sampler is chaotic and the sample is small, so the app measures it
live rather than quoting a constant, and the panel always states its own `n`.

The visual result is far stronger than the rate, and it is stable across every
run. Sorting the sample by how tangled it *looks* — crossings in the best
projection, before any simplification — the worst-looking quartile has been
**100% unknots every time**. In the shipped run the single worst specimen showed
**78 crossings** and is the unknot: a cable you could pull straight with one
hand, which in a photograph is indistinguishable from a disaster. A separate run
produced one showing **99**.

Crossing number is a property of a *picture*. Knottedness is a property of the
*curve*. The picture turns out to be an almost useless estimator of it, which is
the entire reason this office exists.

### A note on reproducibility

Every tangle is reproducible from its seed *within one JavaScript engine*, and
that is checked: the same seed gives bit-identical coordinates and an identical
verdict. It is **not** reproducible across engines. `Math.sin` and `Math.cos` are
implementation-defined to within an ULP, the sampler is a chaotic Markov chain
over twelve thousand moves, and one ULP at move 40 is a different tangle by move
4000. Node and Chromium therefore disagree about which seeds knot, which is why
the documented rate is a range and the page reports what it actually computed.

### C2, the claim the premise lives on, came out split

Both halves were measured over fourteen open cables, each closed in 24
directions plus radially.

**The direction does matter.** For **14%** of cables there exist closure
directions that give a different knot type — so the question "is this cable
knotted" genuinely has no answer until a closure is chosen. The premise holds.

**But the drafted form of the claim is withdrawn.** It said the radial and
directional conventions would disagree on more than 5% of tangles. They
disagreed on **0%**. Mean agreement *within* the directional spectrum was
**99.4%** — the ambiguous directions are a 1-in-24 edge case, not a coin flip.

So the honest statement is narrower than the one this document started with:
the ill-posedness is real and demonstrable, and it is also *rare*. A cable
usually does have an unambiguous answer; it just is not entitled to one.

### C4: the expensive invariant is provably stronger and practically redundant

Over 20 diagrams, Jones resolved **5** distinct classes against Alexander's
**4** and the determinant's **3** — so Jones does separate something the others
cannot. But the extra class is *entirely* the chiral trefoil pair, which is in
the sample only because the fixtures were inserted on purpose.

On the drawer tangles alone, the two knots that turned up were a trefoil and a
figure-eight, with determinants 3 and 5 — which the Alexander polynomial, and
indeed the determinant by itself, separates perfectly well. **The `2ⁿ` state sum
bought nothing on the ensemble it was built for.** It remains strictly stronger
in theory and was strictly redundant in practice, and both halves of that ship.

## The mechanism

1. **A cable is generated.** Crankshaft moves on a closed loop, or pivot moves
   on an open chain, each preserving every edge length exactly and vetoed if it
   would bring the cable within its own thickness of itself. A cable has fixed
   length and cannot pass through itself.
2. **If it is open, it is closed** — radially, or toward a point at infinity in
   a chosen direction. Sweeping the direction gives a *spectrum* rather than an
   answer.
3. **KMT reduction.** Delete any vertex whose triangle the rest of the curve
   stays clear of; that is an ambient isotopy, so the knot type is provably
   unchanged. Reaching a triangle is a geometric **certificate of
   unknottedness**, proved by construction rather than inferred from algebra.
4. **A diagram is extracted from geometry.** Over/under from depth, crossing
   sign from orientation, cyclic order from in-plane directions. No PD code is
   ever typed by hand.
5. **Two algorithms race for opposite verdicts on identical input.** The
   reducer tries to prove the thing unknotted by construction; the bracket tries
   to prove it knotted by algebra.

## Self-tests

Each decided by something outside the code it tests.

1. `V` of the standard knots against published values, from geometry alone.
2. `Δ` of the same, against published values.
3. The bridge theorem on every fixture and on random tangles.
4. KMT preserves both `V` and `Δ`, and never returns a diagram below the knot's
   minimum crossing number.
5. Fox colourings: elimination against brute-force enumeration, and the
   `p | det` theorem.
6. `Δ` is palindromic.
7. Jones distinguishes the two trefoils; Alexander does not.
8. `V` is independent of the projection direction across many valid projections.
9. A deliberately perturbed embedding of the trefoil returns the clean
   trefoil's invariants.
10. The unknot reduces to a triangle, and its bracket is 1.
11. Loop counting in the state sum agrees with a union-find over the two perfect
    matchings.
12. Exact Laurent arithmetic: the mirror of the mirror is the identity.

## Non-goals

- No claim to identify every knot. Drawer tangles routinely produce composite
  knots, and the app reports "unidentified, det *d*, *n* crossings" rather than
  guessing. The reference table is generated from parametric curves, so it names
  only what it can produce.
- No build step, no CDN, no network, no worker.
- No hand-typed PD codes or hand-typed polynomials anywhere in the pipeline.
