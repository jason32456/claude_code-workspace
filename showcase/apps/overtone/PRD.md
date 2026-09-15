# Overtone — Product Requirements Document

## One line

A chord transcriber that listens — audio in, a chord chart and a MIDI file out —
built as an instrument for measuring **which stage of an estimator actually
earns its keep**, and honest about the two places the answer is "none of them".

## How this document changed

The first draft of this PRD asserted a thesis: that a chord estimator needs
**harmonic summation**, because a C major chord's spectrum contains a strong E
and G as overtones of the C itself, so raw chroma confuses C with A minor and E
minor.

Half of that is true. The overtone leak is real and visible. But the proposed
fix was measured before it was written up, and **it makes accuracy worse at every
difficulty setting**, collapsing from 94% to 0% on a hard signal. The reason is
visible in one frame of chroma:

```
C major frame          raw    harmSum   delta
  C                    0.81    0.97    +0.16   <- chord tone
  D#                   0.01    0.12    +0.11   GHOST
  E                    0.55    0.58    +0.02   <- chord tone
  F                    0.01    0.17    +0.15   GHOST
  G                    1.00    1.00    +0.00   <- chord tone
  A                    0.02    0.18    +0.16   GHOST
```

Harmonic summation evaluates `S(p) = Σ_h w_h · mag(f_p · h)` — it asks each
candidate pitch to collect its own overtones. But that runs the leak backwards.
Salience at A collects `mag(A·3) = E`, so a played E *donates* to A. Salience at
F collects `mag(F·3) = C`. Salience at D# collects `mag(D#·5) = G`. The result is
that a C major chord grows a phantom A — **which is precisely the A minor
confusion the technique was supposed to prevent.** Harmonic subtraction was then
tried as the theoretically correct inverse; a grid search over its two
coefficients chose zero for both, meaning no subtraction at all was optimal.

So the app is not built around the claim. It is built around the measurement,
and it ships the failed technique as a toggle with its ghosts drawn, because a
negative result you can see in the spectrum is worth more than a positive one you
have to take on faith.

## What the measurements actually showed

Frame accuracy on the synthesized demo progression, 25 states, measured against
exact ground truth:

| Signal | argmax | Viterbi | Viterbi gain | harmonic sum (Viterbi) |
|---|---|---|---|---|
| easy — 6 partials, fast decay, 2 s chords | 95.0% | 95.5% | +0.6 | 95.0% |
| rich + noisy, 2 s chords | 94.4% | 95.8% | +1.5 | 92.0% |
| rich + noisy, 0.7 s chords | 91.2% | 94.7% | **+3.5** | 80.5% |
| brutal — inharmonic, heavy noise, 1 s | 85.5% | 93.3% | **+7.9** | 0.0% |
| absurd — n=0.8, 0.7 s chords | 83.2% | 78.8% | **−4.4** | 0.0% |

**The finding worth the whole project is the shape of that Viterbi column.** A
transition prior is nearly worthless when the per-frame evidence is already
clean, becomes worth 8 accuracy points when the evidence is degraded, and then
goes *negative* when the evidence is hopeless — because a confident prior applied
to garbage locks the decoder onto a smooth, coherent, wrong answer. Smoothing
helps in the middle. That is not a claim the app makes; it is a curve the user
can reproduce by dragging a slider.

## The pipeline

| Stage | Method | Default |
|---|---|---|
| 1. Frame | Hann window, N=8192, hop=1024 at 22.05 kHz (372 ms frames, 46 ms hop) | on |
| 2. Spectrum | Radix-2 Cooley-Tukey FFT, iterative, in-place | on |
| 3. Whiten | Divide by a 1/3-octave running mean, via prefix sums | on |
| 4. Salience | Per-semitone peak picking over ±35 cents | on |
| 5. Harmonic sum | `S(p) = Σ w_h · mag(f_p·h)` | **off — it hurts** |
| 6. Chroma | Fold to 12 pitch classes, normalize | on |
| 7. Decode | 25 templates → softmax posterior → Viterbi over an HMM | on |

Every stage is a toggle, and every toggle updates the measured accuracy.

## The three panes

**Listen** — a spectrogram and level meter. Three sources: the synthesized demo
(default, so the app works with no microphone and no permission prompt), a
dropped audio file, or the microphone.

**Analyse** — magnitude spectrum, whitened spectrum, chromagram, and the 25-state
posterior heatmap over one shared time axis. Scrub to see any frame's chroma as a
bar chart, with the harmonic-sum ghosts drawn against the raw values.

**Decode** — the posterior with the Viterbi path drawn over it, a toggle between
per-frame argmax and the decoded path, and both accuracies reported as numbers.
Output is a chord chart and a downloadable MIDI file.

## The demo clip, and the honesty problem it creates

The demo is **synthesized in-page**, not shipped as audio: no asset files, zero
bytes, deterministic, exact ground truth. That is also a methodological weakness
— an estimator measured against its own synthesizer is grading its own homework —
and the app must not hide it.

Two mitigations, both of which make the app better rather than merely honest:

1. **The synthesizer is not a sine bank.** Real overtone series, per-partial
   decay (high partials die first), stiff-string inharmonicity, per-note detune,
   ADSR, noise floor. The confusion the app studies is genuinely present.
2. **Difficulty is a live control.** Partial count, decay, inharmonicity, noise,
   release. The accuracy readout updates as you drag, which is how the table
   above was produced and is reproducible by the user.

Where there is no ground truth — a dropped file, or the microphone — the app
**reports no accuracy figure at all** rather than inventing one.

## Declared limits

- **Major and minor triads only**, plus a no-chord state. Sevenths and inversions
  are excluded: more templates share more notes, so a bigger vocabulary makes
  confusion worse rather than output richer.
- **Full polyphonic note transcription is refused**, with the reason. Separating
  overlapping harmonic series into individual notes is open research; chord
  identification is tractable only because it asks which of 25 shapes fits.
- **No beat tracking or key detection.** Bar lines are a fixed grid.
- Measured accuracy is against **synthesized** audio. Real recordings are harder,
  and the app says so where it says the number.

## Constraints

- Static site, no build step, no CDN, no dependencies, no network at runtime.
- Vanilla JS, ES modules, Canvas 2D for the strips.
- No asset files — the demo audio is generated at load.
- Deterministic: same clip, same analysis, same picture every run.

## Success criteria

- **The FFT is verified against an independently written naive DFT.** This is the
  one component with an exact oracle and everything else rests on it.
- **Every claim in the UI is a measured number**, recomputed live, never a
  hardcoded boast.
- **The Viterbi-versus-argmax comparison must be honest in both directions** —
  including displaying a negative gain when smoothing hurts.
- The emitted MIDI must be a structurally valid SMF type 0 file whose
  variable-length quantities round-trip through an independent reader.
