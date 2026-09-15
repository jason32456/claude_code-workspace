# Caustic — Product Requirements Document

## One line

An in-browser measurement of double descent and benign overfitting: build the
interpolation ridge, let people cross it, and check which half of the famous
story actually survives contact with the numbers.

## How this document changed

This started as "build a double-descent demo" — the well-known curve where test
error rises to a spike at the interpolation threshold and then falls again,
ending up better than any underparameterised model. The curve is real and it
reproduces here crisply. But three of the four things this document now claims
were not in the original plan, and one of them is a correction to a result this
project had already drafted.

**The spike was never about parameter count.** Adding a ridge penalty of
`λ = 1e-2` drops the worst cell of the sweep from `91.0` to `1.11` — **82×
lower — at identical parameter counts**. Nothing about the model's size changed.
What changed is whether the fit was required to pass exactly through every noisy
point. So the headline framing "more parameters can hurt" is wrong; the accurate
one is "exact unregularised interpolation can hurt, and the threshold is where
that constraint bites hardest."

**The second descent is not a property of overparameterisation. It needs
dimension.** At `D = 1` — the one-dimensional curve-fitting picture that nearly
every explainer of this phenomenon draws — the error rises at the threshold and
**never comes back down**: far above the threshold it is `331×` worse than the
best underparameterised model. At every one of the nine `D ≥ 2` values swept,
the second descent appears. The picture conventionally used to illustrate benign
overfitting is drawn in precisely the regime where benign overfitting does not
occur.

`D = 1` is also the regime where the underparameterised fit is *best* — a smooth
one-dimensional curve is easy to approximate with eight features, at `0.032`.
That is exactly why the interpolating fit has so far to fall, and why the gap is
so much larger here than in any higher dimension.

**The ridge is not caused by label noise, which is how it is nearly always
explained.** This was written into an earlier draft of this document as an
assumption — that `σ = 0` would leave nothing to overfit and flatten the ridge —
and the measurement contradicted it. At zero label noise the peak is still
`14.5×`, and what it tracks is how hard the target is to approximate with the
available features: holding noise at zero, a nearly linear target peaks by
`9.6×` and a very wiggly one by `182×`. Adding label noise on top of the default
moves it only from `66×` to `89×`. The dominant driver here is approximation
error, not label noise.

**A negative result this project had already written down turned out to be
wrong, and was reversed before shipping.** An early measurement found that a
network trained by backpropagation showed no peak at all, which suggested the
whole phenomenon was an artefact of the closed-form solve. That experiment was
run at `D = 1` with Adam — which is to say, in the exact regime the dimension
finding above identifies as the one where the effect is absent, using an
optimiser whose per-coordinate normalisation suppresses the norm blow-up that
*is* the mechanism. The two experiments contradicted each other's premises.
Re-run at `D = 10` with plain SGD and momentum, trained to genuine interpolation
(training error `6.8e-14` and below), **the peak appears clearly**:
`0.127 → 0.890`, a factor of `7.0`. The ridge is not a solver artefact. The
drafted finding was deleted rather than shipped.

A related hypothesis also died: the optimiser was supposed to be the confound,
because Adam prevents the norm blow-up the spike consists of. Measured at
`D = 10`, both optimisers show the peak and **Adam's is the larger of the two**
(`1.48` against SGD's `1.04`). The optimiser turned out not to matter. Only the
dimension did.

## What the measurements actually showed

Defaults are `D = 20`, `n = 40`, `σ = 0.15`, medians over 9 trials.

| Claim | Measured |
|---|---|
| Test error peaks at exactly `P = n` | `91.0` at the threshold vs `1.019` at the best smaller model — **89.4× worse** |
| Adding training data can hurt | fix `P = 40`, grow `n` from 10 to 40: `1.159 → 91.0`, **78× worse** |
| Ridge removes the peak | `λ = 1e-2` at `P = n`: `91.0 → 1.111`, **82× lower**, same parameter count |
| Second descent beats the classical optimum | `0.573` at `P = 1200` vs `1.019` best below — **1.78× better** |
| …but only with enough dimension | `D = 1`: **no second descent**, `331×` worse. All nine `D ≥ 2` values: present |
| The peak survives real backpropagation | trained net at `D = 10`, `n = 120`: `0.127 → 0.890`, **7.0×** |
| The second descent does **not** survive it | widest net (1081 params, `0.631`) never beats its best underparameterised width (`0.127`) |
| The ridge does **not** require label noise | at `σ = 0` the peak is still `14.5×`; it scales with target complexity (`9.6×` → `182×`) instead |

## The experiment

The learner is `P` random ReLU features of a `D`-dimensional Gaussian input,
fitted by least squares to `n` points whose labels carry Gaussian noise `σ`.

Below the threshold (`P ≤ n`) that is the ordinary normal-equations solution.
Above it the system is underdetermined, and the fit taken is the **minimum-norm**
one, `w = Φᵀ(ΦΦᵀ)⁻¹y` — the solution gradient descent from zero converges to.
That choice is the experiment: "more parameters" means nothing until you say
which of the infinitely many interpolating solutions you take.

Two details are load-bearing and both are enforced by self-tests. Features are
scaled by `√(2/P)` so a single `λ` means the same thing at `P = 4` and
`P = 4000`; without it the peak measured is an artefact of the axis. And the
sweep grid always contains `P = n` exactly — miss that cell and a 91× spike
renders as a gentle bump because nothing sampled it.

The solver is Cholesky with jitter escalation. Every solve here is deliberately
near-singular — at the threshold the Gram matrix *is* singular, and that is the
phenomenon rather than a bug — so it adds the smallest ridge that lets the
factorisation succeed and reports how much it needed.

## The five panes

1. **The ridge** — model size across, dataset size down, test error as
   brightness, with the `P = n` diagonal drawn on top. Click any cell to get a
   predicted-against-true scatter for that exact model: training points pinned
   to the diagonal, test points sprayed off it. Crossing the ridge is the verb.
2. **The curve** — one horizontal slice. Raise `λ` and a second series appears,
   flat, straight through the spike.
3. **Dimension** — best-below, at-threshold and far-above error for each `D`,
   ticked or crossed by whether the second descent occurred, with the `D = 1`
   interpolant thrashing to `|f| = 131` beside a calm `D = 2` slice.
4. **Backprop** — the control arm. A real two-layer ReLU network, plain SGD with
   momentum and gradient clipping, swept over width.
5. **Checks** — eleven tests against ground truth derived outside the code.

## Declared limits

- **`D = 1` versus `D = 2` is where the boundary falls in this setup, not a
  universal constant.** The governing theory is benign overfitting (Bartlett,
  Long, Lugosi & Tsigler, 2020), which is about effective rank being large
  enough, not about a specific integer.
- **The backprop arm reproduces the peak but not the second descent.** At every
  width a browser can train — out to 1081 parameters — the network recovers from
  the spike (`0.890 → 0.631`) but never beats its own best underparameterised
  width (`0.127`). That half of the story needs more compute than a tab will sit
  through, and saying so is cheaper than pretending otherwise.

- **The backprop arm chooses its own `D` and `n`.** A network's threshold sits at
  `H = (n−1)/(D+2)`, which at the panel's defaults lands below width 2 — leaving
  nothing below the threshold to compare against. That arm therefore caps `D` at
  10 and raises `n` to `10(D+2)`, and says so in the pane.
- **The backprop arm cannot be run at `D = 1` at all.** Gradient descent never
  reaches interpolation there: at 1201 parameters and 30,000 epochs the training
  error is still `2.3e-2` against a noise variance of `4e-2`. It never crosses
  the threshold, so there is nothing to measure. Only the closed-form solver
  reaches the interpolating solution in one dimension.
- **The network's peak sits slightly right of its parameter count.** At
  `n = 120` the measured worst width is 169 parameters. A ReLU network's
  effective capacity is not its parameter count, and the threshold is drawn
  where the parameter count says it should be, not moved to wherever the peak
  landed.
- Gradient clipping is not cosmetic. Without it a wide ReLU net under momentum
  diverges and the sweep reports `NaN` instead of a measurement.

## Constraints

Static, vanilla ES modules, no build step, no network access, no dependencies —
launchable straight from the showcase. All sweeps run in a Web Worker and stream
their cells as they finish. Nothing is downloaded; every dataset is generated
from a seeded PRNG, so every figure is reproducible.

## Success criteria

- The ridge is visible as a band on the `P = n` diagonal, and clicking across it
  changes the scatter from tight to shotgun.
- Every quantitative claim in the interface is computed from the current sweep,
  not written into the copy.
- The dimension pane can come out the other way and would be shipped if it did.
- 11/11 checks pass, including three that would fail if the headline claim were an
  artefact of the sampling grid or the feature scaling.
