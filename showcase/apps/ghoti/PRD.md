# ghoti — PRD

> **gh** as in *tough*, **o** as in *women*, **ti** as in *nation*. Therefore *ghoti* spells **fish**.
>
> It does not. This project measures exactly why not.

## One-line

Learn to read English aloud from 117,493 examples, with nobody ever saying which letter
makes which sound — then put the most famous claim about English spelling on trial and
watch it lose.

## Why this project

The repo has 60 projects and not one of them is about language. It also has no project
that produces speech. `ghoti` is both, and it is built in the house style: a real
algorithm implemented from scratch, confronted with ground truth it never saw, with a
payoff a viewer can grade without reading a number — here, by **ear**.

## The data

The CMU Pronouncing Dictionary (CMU, BSD-2-Clause, redistributable with attribution).
135,166 raw entries → **117,493** after dropping alternate pronunciations and any headword
that is not pure `[a-z]`. 39 phones in ARPAbet, vowels carrying stress 0/1/2.

Critically, the dictionary is **unaligned**. It says

```
knight  N AY1 T
```

and never says that `kn` makes `N`, `igh` makes `AY1`, and `t` makes `T`. Six letters,
three sounds, no correspondence given. Recovering that correspondence is an unsupervised
learning problem and it is the first half of this project.

Shipped as a front-coded binary (`dict.bin`) so the browser loads it in one fetch with no
build step, no CDN, and no network.

## What it computes

### 1. Alignment — EM over a many-to-many monotone lattice

Learn `p(letter-chunk → phone-chunk)` for chunks of 1–2 letters and 0–2 phones, by
Expectation–Maximisation: forward–backward over every legal alignment of each word,
accumulate fractional counts, renormalise, repeat. Uniform initialisation — the model is
told nothing about English.

*Independent correctness oracle:* EM's likelihood monotonicity is a **theorem**. If total
log-likelihood ever decreases between iterations, the implementation is wrong. The app
asserts this every iteration rather than trusting it.

### 2. The correspondence matrix

Once aligned, the whole spelling system of English falls out as one picture: a
letter × phone grid of learned probabilities. This artefact is the project's quiet
centrepiece — it is what English's orthography actually *is*, measured rather than
asserted.

### 3. Pronunciation — a context model + beam decoder

For each letter chunk in its left/right letter context, count phone outcomes with
backoff over shrinking context widths. Decode an unseen word by beam search over
positions.

*Independent correctness oracle:* on short words, exhaustively enumerate every alignment
and take the true argmax by brute force. The beam must agree.

### 4. Evaluation against held-out truth

A held-out split the model never trains on. Report **word accuracy** (whole pronunciation
exactly right) and **phoneme error rate** (Levenshtein over phone sequences). No number is
reported for a word the model was trained on.

### 5. Speech — a formant synthesiser

Each ARPAbet phone maps to formant targets, voicing and a noise source, rendered through
Web Audio as a source-filter model. Vowels get F1–F3 targets and interpolate; stops get
closure plus burst; fricatives get shaped noise.

This exists so the payoff is **audible**: press one button to hear the dictionary's truth,
another to hear what the model guessed. A correct model sounds like the word. A wrong one
is instantly, comically wrong. Nobody has to read a score to grade it.

## The arguments on trial

Every claim below is stated as falsifiable *before* measurement, and whatever the numbers
say is what ships — including if it kills the claim.

**A. `ghoti` cannot spell *fish*.** The joke needs three substitutions. For each, count
every occurrence in the aligned dictionary **and its position in the word**. The
hypothesis: each substitution is real but only ever occurs in a position `ghoti` does not
offer — `gh → F` only syllable-finally (*tough*, *laugh*), never initially, where `gh → G`
is categorical (*ghost*, *ghetto*, *ghoul*). If so, the joke is not evidence of chaos, it
is evidence of rules, and it dies on its own data. Then ask the trained model to read
`ghoti` and play the answer out loud.

**B. English spelling is chaotic.** Received wisdom. Measured by held-out word accuracy.
If a from-scratch model with no linguistic knowledge reads most unseen words correctly,
"chaotic" is not the right word and the number says so.

**C. More context is better.** Sweep the context window width and plot held-out accuracy.
Expect a peak and then a decline from sparsity — the point at which a wider window starts
*hurting* is a real measurement, not a guess.

**D. More EM is better.** Track alignment log-likelihood (which must rise, by theorem)
against downstream held-out accuracy (which need not). If likelihood keeps climbing while
accuracy turns over, that is the honest and more interesting result, and it ships as the
headline rather than being buried.

**E. The hard words are the weird ones.** Inspect the actual failure gallery rather than
assuming. If the worst-predicted words turn out to be dominated by proper nouns and
loanwords rather than English's famous irregulars, say so.

## What the viewer sees

1. **Read it aloud** — type any word or non-word, watch the beam decode it, hear it.
2. **The alignment ribbon** — letters over phones with the learned links drawn, per-link
   confidence shaded. This is the unsupervised discovery made visible.
3. **The correspondence matrix** — the spelling system of English as one heat map.
4. **The ghoti dock** — the three substitutions with real counts and position histograms,
   ending in the model reading `ghoti` out loud.
5. **The scoreboard** — held-out accuracy, PER, the context sweep, the EM curve.
6. **The failure gallery** — the words it got worst, truth and guess, both playable.
7. **Checks** — the in-page self-test suite.

## Constraints

- Static site under `showcase/apps/ghoti/`, served by `python -m http.server`.
- No build step, no backend, no network at runtime, no CDN, no pretrained model.
- Vanilla JS + ES modules. Training runs in a Web Worker so the page never locks.
- Everything shipped is committed and works offline.

## Non-goals

- Not a TTS product. The synthesiser exists to make correctness audible, not to sound good.
- Not a neural model. Every parameter here is a count the app can show you.
- No stress-placement modelling beyond what the phone labels already carry.
