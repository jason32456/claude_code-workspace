# Brag plan — Furnace

Tone: `cinematic`. Format: landscape 1920×1080. Duration: 25.5s. Narration: on
(Kokoro, `bm_george`, speed 1.05). Music: synthesised — a low throb with a slow
shimmer, no percussion.

## The angle

The previous video in this repo was a paragraph. This one has to move, so the
edit is built on the one thing a path tracer does that reads instantly as
motion: converging. It opens on a render at one sample per pixel — pure noise —
and doubles the sample count eleven times in four seconds until the image is
clean. Nothing is blurred away; each frame is a real render at that exact
sample count, so the noise falling off is the algorithm working.

Then the turn. Three shots of what the renderer can do, and then a shot of
nothing at all: a flat grey frame with a sphere in it that cannot be seen. The
claim is made by an absence, which is the most interesting thing this project
has, and the payoff is the error image — black when correct, a glowing
speckled disc the instant the sampler is broken.

## Storyboard

| # | t (s) | Dur | On screen | Read | Narration |
|---|-------|-----|-----------|------|-----------|
| 1 | 0.0 | 5.2 | 11 renders, 1 → 1,024 spp, with a live sample counter | "Every pixel is a random walk." | "One sample per pixel. Then a thousand." |
| 2 | 5.2 | 3.6 | The caustic, slow push | "Refracted twice, then focused." | "Nobody wrote that bright knot." |
| 3 | 8.8 | 3.6 | Colour bleeding, slow push | "None of that colour is painted on." | "The colour came off the walls." |
| 4 | 12.4 | 4.2 | The furnace — a flat grey frame | "There is a white sphere in this image." / "Albedo 1, in a void of radiance 1. It has to vanish." | "There is a sphere in this picture." |
| 5 | 16.6 | 3.8 | Error ×20: black, then the bug switched on at 18.42 | "Break one line of the sampler." | "Break the sampler and it comes back." |
| 6 | 20.4 | 2.8 | 0 · −0.553 · 69% | — | "Deviation: exactly zero." |
| 7 | 23.2 | 2.3 | Wordmark | FURNACE / it has to disappear | "Furnace." |

Total 25.5s.

## Reading-time check

Scene 1's caption is 5 words and holds 4.2s settled. Scene 4 carries the most
text — 8 words plus a 10-word subline — and holds 3.1s; it is the one scene
where the narration deliberately says less than the caption, because the image
is empty and the viewer needs time to accept that. Scene 6 is three numbers,
staggered, each held at least 1.3s.

## Mix

Bed carved against the narration group at strength 0.8 — six bands from 160Hz
to 2.5kHz and a 279-point level envelope. Master −16.3 LUFS, true peak −1.5
dBTP. Four sparse low cues: the open, the furnace reveal, the moment the bug is
switched on, and the wordmark.

## Honesty

Every number on screen is one the project produces: deviation 0 from the
furnace bench, −0.553 from the convergence fit, 69% from the GGX sweep. The
error image is labelled with its ×20 gain, because an amplified error shown
without its multiplier is a lie by presentation.
