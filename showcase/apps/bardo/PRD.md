# Bardo — Product Requirements Document

## One line

Price a whole-life insurance policy that covers *every* life rather than this
one, and discover that the doctrine of rebirth you are insuring barely moves the
premium — the mortality table sets it almost entirely.

## Why this shape

The premise is absurd on purpose and the execution is not. "Life insurance for
reincarnation" sounds like a one-panel joke, and it would be, except that
writing a policy of unbounded term forces a real piece of mathematics into the
open: the actuarial present value of an infinite sequence of lives, each with
its own mortality, linked by a stochastic matrix. That object is a linear system.
Solving it answers a question nobody poses as a question — *what does eternity
cost?* — and the answer is not a joke, which is the joke.

The repository's strongest entries all make the same move: implement something
hard with no library, hold an oracle against it that the app did not author, and
report a measurement that contradicts the thing the project set out to show.
`crib` enciphers a message, throws the key away and takes it back. `anamorph`
does it to a camera. `caustic` sets out to show that more parameters overfit and
measures the opposite. This aims that move at an actuarial question, and it has
an unusually good supply of independent oracles: a closed-form linear solve, a
Monte Carlo over simulated trajectories, and — in the limit — a renewal–reward
argument that reaches the same number through no shared code at all.

Three routes to one price. If they agree, the price is right.

## How this document changed

**The project's original verdict does not exist, and this is the first thing the
app now says.**

Bardo was designed around an insurability test: solve `(I − DP)x = c`, and report
either a finite premium or `UNINSURABLE — premium diverges`, with divergence
happening when the doctrine offers no reachable liberation. The whole UI was
built around that banner.

There is no such banner, because the divergence cannot happen. `D` is diagonal
with entries `d_i = E[e^{−δT_i}]`, the expected discount factor over a lifetime
in state `i`, and for any strictly positive discount rate and any lifetime that
is not identically zero, `d_i < 1` *strictly*. `P` is row-stochastic. Therefore

```
ρ(DP) ≤ ‖DP‖∞ = max_i d_i · Σ_j P_ij = max_i d_i < 1
```

The spectral radius is bounded below one by the discounting alone, with no
reference whatever to the structure of `P`. **Every doctrine is insurable at every
positive discount rate.** No reachable liberation is required, no absorbing
state, nothing. A soul on an eternal wheel with no exit has a finite actuarial
present value, and the matrix cannot be made singular by any arrangement of its
transitions. The claim was not close to true; it was excluded by a two-line
bound that should have been checked before the UI was drawn.

What survives is better, and it is now the thesis.

**The premium is a ratio of two divergent quantities, and the ratio converges.**
Benefits are paid at every death; premiums are collected during every life. A
policy of unbounded term therefore has an unbounded stream of claims *and* an
unbounded stream of premiums, and the equivalence principle divides one by the
other. Push `δ → 0` and the APV of benefits diverges, the APV of the premium
annuity diverges, and the level premium — their quotient — settles on a finite
number. **Eternity is affordable because you pay for it forever.** That is the
result the app is built to deliver, and it is both true and not obvious.

**The doctrine barely moves the price, and there is a theorem saying it cannot.**
This was found while sweeping, not planned, and the first version of the claim
was also wrong. In the limit the premium tends to

```
π∞ = Σ_i ν_i b_i / Σ_i ν_i m_i
```

the stationary-weighted benefit over the stationary-weighted mean lifetime. With
a flat benefit that is `1 / Σ_i ν_i m_i`, and `Σ_i ν_i m_i` is a **convex
combination** of the per-station mean lifetimes. A convex combination cannot
leave the interval it is drawn from. Therefore, for every doctrine expressible in
this specification language,

```
π∞ ∈ [ 1 / max_i m_i ,  1 / min_i m_i ]
```

With the shipped mortality laws that interval is `[5.33e-3, 3.69e-2]`, and the
transition structure — the entire cosmology — only chooses a *point inside it*.
The mortality tables choose the interval. Nothing a doctrine can do gets out.

The measured numbers: across the shipped doctrines the APV at `δ = 1e-5` spans
`2,570×` (from `0.999` to `2,569`), while the premium spans `2.3×`. The doctrine's
influence is compressed by roughly three orders of magnitude but **not erased** —
and the drafted claim that doctrines "price within a few percent of each other"
is withdrawn, because the four multi-life doctrines actually spread by `127%`.
"A few percent" was wishful. The bound is the real result, because it is a proof
rather than an observation.

The sharpest single number: `Terminal` — one life, then certain liberation — and
`The Wheel` — an eternal cycle with no exit — price within a factor of `1.1` of
each other at `δ = 1e-5` (`1.310e-2` against `1.192e-2`), while their APVs differ
by `1,193×`. One life and endless lives cost the same per unit time.

So the app's real verdict is not solvency. It is: *you brought a cosmology and
the underwriter only wanted your mortality table.*

**Where insurability does split, it is a graph property.** At exactly `δ = 0` the
discounting no longer saves anything and the split the project originally wanted
finally appears — the APV is finite precisely when liberation is reached almost
surely, because the expected number of lives is then finite. That is decided by
Tarjan's SCC decomposition on the transition digraph, with no arithmetic at all:
a state is uninsurable-at-zero iff it can reach a recurrent class that does not
contain liberation. The `Mirror` doctrine ships specifically because it has a
liberation state that some states provably cannot reach, so the classification
returns a genuinely mixed answer rather than a uniform one. The original verdict
survives only as a statement about topology in a limit that no insurer would use.

## The mechanism

1. **A doctrine is specified** — an ordered set of states of rebirth, a per-state
   merit drift, a transition dispersion, per-state liberation probabilities, and
   an optional absorbing liberation state. This is a *specification*, not a
   claim about anything, and the UI says so where a user can see it.
2. **It compiles to a stochastic matrix.** Band weights
   `w_ij = exp(−(j − (i + drift_i))² / 2σ²)` normalised over the surviving
   probability mass after liberation. Row sums verified to machine precision.
3. **Each state carries a mortality law.** Gompertz–Makeham
   `μ(x) = A + B c^x`, so every state has a genuine lifetime distribution with
   a mean, a variance and a survival curve — which is what makes the chain
   *semi-Markov* and the discounting non-trivial.
4. **Quadrature gives the discount factors.** One Simpson pass per state over
   `e^{−δt} S_i(t)` yields the annuity value `ā_i`, and then `d_i = 1 − δā_i` by
   the integration-by-parts identity. The same pass at `δ = 0` yields `m_i = E[T_i]`.
5. **Two dense solves give the price.** `(I − DP)x = c` for benefits with
   `c_i = b_i d_i`, and `(I − DP)ā = (1 − d)/δ` for the premium annuity, both by
   Gauss–Jordan with partial pivoting. Level premium `π_i = x_i / ā_i`.
6. **Three oracles check it.** A seeded Monte Carlo over trajectories; the
   renewal–reward limit via power iteration for `ν`; and the degenerate
   single-life doctrine, which must reproduce the textbook whole-life premium
   `Ā_x / ā_x` that any actuarial table would give.

## Claims the app must measure, not assert

| # | Claim | Where it is shown |
|---|---|---|
| C1 | Every doctrine is insurable at every `δ > 0`; `ρ(DP) ≤ max d_i < 1` regardless of structure. The original verdict is withdrawn. | Verdict panel + δ sweep |
| C2 | `APV → ∞` and `ā → ∞` as `δ → 0`, but `π = x/ā` converges. | δ sweep, log-log |
| C3 | The limit equals `b / Σ ν_i m_i` by renewal–reward, computed with no shared code. | Oracle panel |
| C4 | `π∞` is trapped in `[1/max m, 1/min m]` by convexity, so no doctrine escapes the mortality interval. APV spans `2,570×`; premium spans `2.3×`. The "few percent" version is withdrawn. | Doctrine comparison |
| C5 | At `δ = 0` insurability is decided by SCC reachability alone, and `Mirror` returns a mixed answer. | Matrix + classification panel |
| C6 | Transition dispersion `σ` — the "how unpredictable is rebirth" knob — has an effect on the premium to be measured and reported, whichever way it falls. | Dispersion sweep |

C6 was deliberately written without a direction. The Jensen argument cuts both
ways: dispersion raises `d_i` by convexity, which inflates the benefit stream and
the annuity stream at once, and which inflates faster was not something this
document was going to guess.

Measured, it **lowers** the premium — `2.05e-2 → 1.78e-2` on the Wheel as `σ` goes
`0.7 → 3.0` at `δ = 0.02`, and the limit falls `1.234e-2 → 1.146e-2`. The
mechanism is not Jensen at all: dispersion spreads the stationary distribution
toward the long-lived upper stations, lengthening the mean cycle, and `π∞` is
inversely proportional to it. There is also a genuinely non-monotone stretch at
the bottom of the range — `σ = 0.50` prices *above* `σ = 0.70` — which ships as
found rather than smoothed.

## Self-tests

Each decided by something outside the code it tests.

1. Gauss–Jordan against a hand-inverted 3×3.
2. Gompertz–Makeham survival against `exp(−Ax − (B/ln c)(c^x − 1))` evaluated
   independently of the quadrature.
3. `d_i = 1 − δā_i` against a direct Monte Carlo estimate of `E[e^{−δT}]`.
4. `m_i = ∫S` against the mean of sampled lifetimes.
5. Row sums of every compiled doctrine equal 1.
6. `ρ(DP) < 1` by power iteration, for every shipped doctrine and a random one.
7. Analytic APV against Monte Carlo APV, inside a 4-sigma interval.
8. The single-life doctrine against the textbook whole-life formula.
9. The renewal–reward limit against the analytic premium at small `δ`.
10. Tarjan SCC against brute-force reachability by repeated squaring of the
    adjacency matrix.
11. Absorbing-chain expected step count against `(I − Q)^{-1}1` on the transient
    block.
12. Premium invariance: scaling all benefits by `k` scales the premium by exactly
    `k`.

## Non-goals

- No assertion that any doctrine is true, or that any real tradition is being
  described. The state names are structural (`Wheel`, `Ladder`, `Mirror`,
  `Furnace`, `Terminal`) precisely so that the object under test is a
  specification and not a faith.
- No build step, no CDN, no network, no worker. Every solve is milliseconds on
  matrices of order 10.
- No persistence. The doctrine editor is live and stateless.
