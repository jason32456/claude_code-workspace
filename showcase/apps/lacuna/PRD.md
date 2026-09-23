# Lacuna — PRD

Drafted 2026-09-23. Where the build departed from this, see the end of
[`README.md`](./README.md).

## Pitch

**Lacuna photographs a scene with one pixel and a tenth of the measurements,
then gets the picture back.** A simulated micromirror array flashes random
patterns at the scene, and one photodiode records one number per pattern. With
M measurements of an N-pixel image and M far below N, the linear system has
infinitely many solutions. Lacuna picks the sparsest one, and the photo comes
back.

*Tagline:* Photograph a scene with one pixel and a tenth of the measurements.
Then find the line where that stops working, and check it against the line
theory drew first.

**The moment:** drag the budget to 10%. The least-squares reconstruction is
grey mush, while the sparse one sharpens iteration by iteration into the
scene. Then the Phase Lab fills a success/failure map, and its 50% boundary
lands on a curve from a closed-form integral that the solver was never told.

Category: Simulations · slug `lacuna` · static, under `showcase/apps/lacuna/`.

## Why it is unique

No existing project touches sampling theory, sparsity or convex recovery.

| Closest neighbour | Shares | Differs |
|---|---|---|
| Anamorph | recovers a hidden quantity from an image | a handful of parameters vs 16,384 unknowns from ~1,600 observations |
| Caustic | a surprising curve in model fitting | generalisation vs exact recovery with a closed-form boundary |
| Crib | throw the key away, take it back | discrete search vs a continuous convex program |
| Overtone | FFT signal processing | analyses what it has vs reconstructs what it never measured |
| Eddington, Wake | graded physics bench | forward simulation vs inverse problem |

## Core experience

1. **Scene**: procedural scene, dropped image, or webcam frame, at 128 × 128
   greyscale (N = 16,384).
2. **Camera**: animated mirror patterns, a scrolling photodiode trace, and an
   M/N counter.
3. **Recover**: truth, linear minimum-norm, and sparse recovery (live), with
   PSNR and SSIM, plus an oracle best-k-term panel.
4. **Controls**: budget 1–100%; Bernoulli, scrambled or multilevel Hadamard;
   Haar, DB4, DCT or TV; noise.
5. **Phase Lab**: success heatmap over δ = M/N and ρ = k/N with ψ(ρ) overlaid.
6. **Bench**: claim, external expectation, measurement, tolerance, verdict.

## Scope

Must have: the camera; three pattern families; FISTA wavelet ℓ1 and
Chambolle–Pock TV vs a linear baseline; oracle panel; PSNR and SSIM; the
Phase Lab with a finite-N width study; the bench; procedural scenes and
drag-and-drop, all offline.
Nice to have: webcam, colour, hardware noise, CSV export.
Non-goals: real hardware, learned reconstruction, any backend, CDN or build
step.

## Technical design

Vanilla JS, ES modules, Web Workers, Canvas 2D; seeded PRNG throughout.
Φ = S·H·P is never stored: a dense Gaussian at N = 16,384, M = 1,638 would be
~107 MB. Recovery: `min ½‖Φx − y‖² + λ‖Wx‖₁` by FISTA, or TV by
Chambolle–Pock. The Phase Lab uses exact basis pursuit by ADMM. The curve is:

```
M/N ≈ ψ(ρ) = inf_τ≥0 { ρ(1+τ²) + 2(1−ρ)[(1+τ²)Q(τ) − τφ(τ)] }
```

(Amelunxen, Lotz, McCoy & Tropp 2014.) Budgets: first frame < 200 ms, FISTA
300 iterations < 1.5 s, a 30×30×20 lab < 60 s, bench < 30 s, main thread never
blocked > 16 ms.

## Verification

| # | Claim | Expected | Pass if |
|---|---|---|---|
| 1 | transition at ρ = 0.10 | 0.3288 | ±0.03 at N = 400 |
| 2 | transition at ρ = 0.05, 0.20 | 0.2039, 0.5111 | ±0.03 |
| 3 | width ∝ 1/√N | exponent −0.5 | −0.6…−0.4 |
| 4 | universality | Bernoulli, Hadamard on the Gaussian curve | ±0.03 |
| 5 | noise folding | 10·log₁₀(N/M) dB | ±0.5 dB |
| 6 | FWHT = Hadamard matrix | dense Sylvester | < 1e-12 |
| 7 | orthonormal transforms | ‖Wx‖ = ‖x‖ | < 1e-12 |
| 8 | FISTA O(1/k²) | Beck–Teboulle | slope ≤ −1.8 |
| 9 | oracle is a ceiling | best k-term | sparse ≤ oracle |
| 10 | sparse beats linear | Φᵀy at the same M | ≥ +6 dB at 10%, every scene |
| 11 | coherence matters | multilevel beats uniform (Adcock et al.) | reported with its sign |

## Milestones and risks

M1 transforms → M2 solvers → M3 recover pane → M4 camera pane → M5 Phase Lab
→ M6 bench → M7 ship. Risks: finite-N shift of ψ (grade at N = 400); ADMM
tolerance blurring success (strict threshold); coherence of uniform Hadamard
(ship multilevel as default); image licences (procedural only); slow machines
(coarser default grid).
