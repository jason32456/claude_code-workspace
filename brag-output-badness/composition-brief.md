# Hyperframes Composition Brief: Badness

## Objective
A short launch-style brag video for Badness, a Knuth–Plass line breaker checked
against TeX.

## Output
- Composition directory: `brag-output-badness/composition/`
- Rendered video: `brag-output-badness/brag.mp4`
- Format: landscape, 1920×1080
- Duration: 25.0s

## Source Material
- Project root: `showcase/apps/badness/`
- Primary files read: `index.html`, `style.css`, `js/linebreak.js`, `README.md`, `PRD.md`
- Product name: Badness
- Strongest claim: reproduces TeX's line breaking exactly — 423 lines, no difference anywhere
- Key visual recreated: the paper sheet with interword glue drawn at its true width
- Copy that must appear verbatim:
  - "Every browser breaks a paragraph one line at a time."
  - "worst line 465" / "worst line 146"
  - "423 lines identical to TeX"
  - "It also reports where it loses."

## Creative Direction
- Tone preset: `polished`
- Interpretation: slow push-ins, dips through black rather than cuts, type that
  arrives and settles. Nothing in the edit moves faster than the reading.
- Angle: adversarial rather than demonstrative — your browser, the right
  algorithm, the referee, the scoreboard, and then where the algorithm loses.
- Hook: the claim that the software you are reading this in is doing it wrong.
- Outro: the wordmark over "the whole paragraph at once".
- Avoid: generic SaaS language, abstract filler, any number the project does not
  actually produce.

## Visual Identity
- Background `#0c0e13`, ink `#e9e5dc`, accent `#d9a441` — taken from the app.
- Paper `#f4f0e6` with `#14151a` type, as the app's specimen sheet.
- Stretched glue `#c2603f`, squeezed glue `#4a7fb5`.
- Display type: the app's own Computer Modern inside the stills; captions in a
  neutral sans so the interface never competes with the specimen.

## Storyboard
Per `brag-plan.md`. Seven scenes: hook (4.0), first-fit (4.0), total-fit (4.0),
the trace (4.0), the scoreboard (2.8), where it loses (3.8), wordmark (2.4).

## Audio
- Audio role: warm bed, sparse low accents.
- Music: `ink-pad.mp3`, synthesised. The bundled library is upbeat corporate and
  would fight a piece about typography.
- Treatment: volume automation lifts under the trace reveal and falls under the
  wordmark. No percussion — nothing in the edit lands on a beat because there is
  no beat to land on.
- SFX: three soft low impacts and one bell, from the bundled Kenney set, each
  `data-duration` set to the file's exact measured length.
