# Brag plan — Badness

Tone: `polished`. Format: landscape 1920×1080. Duration: 25.0s. Narration: on
(Kokoro, `bm_george`, speed 1.05). Music: synthesised
(the bundled "happy beats business moves" library is upbeat corporate and would
fight a project about typography). SFX: sparse, from the bundled Kenney set.

## The rubric

1. **What is it?** Knuth–Plass total-fit line breaking, implemented in plain
   JavaScript and checked line by line against TeX itself.
2. **Who is it for?** Anyone who has looked at justified text on the web and
   felt something was wrong with it.
3. **What is the strongest claim?** On Knuth's own example paragraph it
   reproduces TeX's breaking exactly — same breakpoints, same badness, same
   demerits, same total of 3535 — and across the committed oracle it is 423
   lines with no difference anywhere.
4. **What is the most striking visual?** The paper sheet with the glue drawn at
   its true width: warm bars where a line was pulled apart, cool where squeezed.
   It makes spacing quality visible before any number is read.
5. **What is the surprise?** That the oracle is not a published number but TeX's
   own reasoning — `\tracingparagraphs` reports every breakpoint it considered
   and why, so a disagreement is a bug rather than an opinion.
6. **What copy is verbatim?** "Every browser breaks paragraphs greedily",
   "worst line 465" / "worst line 146", "3535", "423 lines identical to TeX".
7. **What is the hook?** The claim that the software everyone is reading this in
   is doing it wrong.
8. **What is the punchline?** The project reports where it loses, too.
9. **What must not happen?** No generic SaaS language. No abstract filler. The
   numbers on screen must be the numbers the project actually produces.

## The angle

Most "look what I built" videos show a thing working. This one shows a thing
being *graded*, which is the more interesting claim. The spine of the edit is
adversarial: here is what your browser does, here is what the right algorithm
does, here is the referee, here is the scoreboard, and here — because it would
be dishonest to stop at the scoreboard — is where the algorithm loses. Polished
tone means restraint: slow push-ins, no whip transitions, type that arrives and
settles.

## Storyboard

| # | t (s) | Duration | On screen | Read | SFX |
|---|-------|----------|-----------|------|-----|
| 1 | 0.0 | 3.6 | The paper sheet, glue bars visible, slow push | "Every browser breaks a paragraph one line at a time." | soft low impact @0.35 |
| 2 | 3.6 | 4.0 | First-fit sheet, badness 465 called out | "Longest line that fits. Then it forgets." / "worst line 465" | — |
| 3 | 7.6 | 4.0 | Total-fit sheet, badness 146 called out | "Solve the whole paragraph at once." / "worst line 146" | soft impact @7.7 |
| 4 | 11.6 | 4.6 | The trace table, columns matching in green | "TeX will tell you if you got it wrong." / "\tracingparagraphs" | — |
| 5 | 16.2 | 3.4 | The three verification numbers | "423 lines identical. 5,986 words. 387 widths exact." | tick @16.3 |
| 6 | 19.6 | 3.0 | The honest finding | "It also reports where it loses." | — |
| 7 | 22.6 | 2.4 | Wordmark | "BADNESS" / "the whole paragraph at once" | soft impact @22.7 |

Total: 25.0s.

## Reading-time check

Scene 1 sentence, 9 words → needs ≥2.7s settled; has 3.0s. Scene 2 two lines,
7 words + label → 2.1s + label; has 4.0s. Scene 4 sentence 8 words → 2.4s; has
4.6s. Scene 5 three short numbers → 0.8s each staggered; has 3.4s. All clear.

## Music cue guidance

No bundled track is used, so there are no preset cues. The bed is synthesised as
a slow D-minor pad with no percussion: nothing in this edit lands on a beat
because there is no beat to land on, which suits an algorithm whose whole point
is that it does not proceed in fixed steps. Volume automation lifts under the
trace reveal and falls away under the wordmark.

## Narration

Seven lines, 35 words, roughly 2.25 words per second — sparse on purpose. The
narration never reads the caption underneath it: the caption states what is
happening on screen, the line says why it matters. Scene 1's caption says every
browser breaks paragraphs one line at a time; the narration says line breaking
is a solved problem. The two together are the argument.

| # | t (s) | Line | Length |
|---|-------|------|--------|
| 1 | 0.70 | "Line breaking is a solved problem." | 2.59s |
| 2 | 4.70 | "Greedy. Fast. And demonstrably wrong." | 2.69s |
| 3 | 8.55 | "Knuth solved this in nineteen eighty-one." | 2.80s |
| 4 | 12.65 | "So I made TeX the referee." | 2.32s |
| 5 | 16.25 | "It never disagreed. Not once." | 2.35s |
| 6 | 19.45 | "Which matters more than the wins." | 2.25s |
| 7 | 23.05 | "Badness." | 0.86s |

Every line ends at least 0.3s before its scene does, so no line is cut by a
transition.

## Mix

The bed is carved rather than ducked. All seven lines are one audio group and
the bed is carved against the group, so a dip follows the speech's own level and
the bed returns between lines instead of sitting flat for twenty-five seconds —
six peaking bands from 160Hz to 2.5kHz with a 270-point level envelope, written
by `carve.mjs` at strength 0.8. Naming the group rather than the seven clip ids
means an eighth line would be covered without touching the carve.

Measured on the finished file: narration sits 9.6 dB above the bed, and the
speech band is about 50 dB over the bed's own level in each window. Master is
-16.0 LUFS with a true peak of -1.5 dBTP.
