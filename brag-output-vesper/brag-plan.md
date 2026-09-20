# Brag Plan: Vesper

## What is this app?
A 3D dusk-flight game where the thing you steer is a murmuration of up to ~1,800
individually simulated starlings — there is no player object in the scene at all, and the
number of birds still alive is the only health bar you get.

## The angle
Almost every game gives you an avatar and a health bar. Vesper deletes both and replaces
them with one idea: **the flock is you, and its size is your life.** Everything else falls
out of that — defence isn't a button, it's a *shape* (crowd tight and a peregrine's strike
collapses, which is a real phenomenon called the confusion effect); the counter to a dive
is blowing your own formation apart at the right instant. The video's job is to land that
one substitution and then show the three consequences, over the game's own dusk footage.

## Hook (first 2-3 seconds)
The murmuration over the valley at last light, pushing in slowly, with the game's own
tagline delivered as two beats: **"You are not a bird in the flock."** … **"You are the flock."**
It's already the best line the project has; it just needs the picture under it.

## Key moments (the middle)
- The flock counter ticking *down* — `FLOCK 590 · -1` with `WIRES` flashing red. Birds are
  the resource, and the valley takes them whether or not a falcon does.
- The black sun: the murmuration balled up tight with a peregrine committed overhead and
  `STOOP 35 m` on the HUD. Density as armour, stated plainly.
- The parry — flash expansion, timed to the last half second of a dive, and the falcon
  closes on air.

## Outro / punchline
The ROOSTED card — `589 roosted · 4 lost` — then cut to black for the wordmark and the
tagline again. The score is how many made it into the reeds, so the video ends on the only
number the game actually cares about.

## User flow worth showing
Entry → key action → result, and all three are real captures from the running game:
1. Fly the murmuration down the valley (`murmuration.png`, `wires.png`).
2. Hold density to survive a stoop; spend flash expansion to break a lock
   (`blacksun.png`, `roost.png`).
3. Arrive at the reedbed and get counted (`results.png`).

## Tone
- Preset: `cinematic`
- Creative direction: a dusk nature film that turns into a chase
- Interpretation: Wide shots, big quiet type, slow push-ins — never a hard cut on the
  hook. The art is already atmospheric, so the video's job is to stay out of its way: long
  holds, one idea per scene, and no motion faster than the birds. The energy comes from
  the images and the falcon, not from the edit.

## Format: landscape — 1920x1080
## Duration: 24s

## Visual identity (from the project)
- Ink: `#e7e0d6` · Dim: `#9c9689`
- Amber (the game's accent, used on the tagline): `#e0a35c`
- Alarm (WIRES / STOOP): `#e5654f`
- Calm (stamina): `#7fd6c8`
- Panel: `rgba(11, 13, 22, 0.52)` with a `rgba(231,224,214,0.14)` hairline
- Display font: system sans, wide tracking in caps — the game's own title treatment
- Strongest visual element: the murmuration itself over the dusk valley; second, the
  black-sun ball with a falcon above it

## Share copy (draft)
Most games give you an avatar and a health bar. Vesper gives you 1,800 starlings and the
number of them still alive.

## Audio direction
- Role: cinematic support — a low elegiac bed that carries the whole piece
- Music: **synthesised for this video** (`assets/music/dusk-pad.mp3`). The five bundled
  brag tracks are upbeat corporate beds and would actively fight a dusk film. This is a
  25s D-minor drone (D2/D3/A3/C4/F4) with slow independent LFOs per partial, lowpassed at
  1.1 kHz with a short stereo echo, normalised to −23 LUFS. It is also on-theme: Vesper
  synthesises every sound it makes at load and ships zero asset files.
- Music treatment: 3.5s fade-in baked into the file; level held low via the automation
  lane, lifted slightly under the black sun, faded to silence across the last ~2s.
- Music cue guidance: **none — the bed is unmetred by design.** There is no beat grid to
  lock to and nothing in this edit should snap to one; scene timing is driven entirely by
  reading time and the length of each image's push-in. This is a deliberate departure from
  the beat-sync default.
- Audio-reactive treatment: none. The tone asks for stillness, and a breathing glow over
  dusk photography would read as a mistake.
- SFX posture: very sparse — three cues in 24 seconds, all warm and low.
- Audio-coupled moments: the "You are the flock." reveal; the black-sun scene entry; the
  ROOSTED card landing.
- Restraint rule: no whoosh, no riser, no impact on the wordmark. The last thing heard is
  the pad decaying under black.

## Storyboard

### Scene 1 — You are the flock — 5.0s
`murmuration.jpg` full-frame, a slow push from 1.00 → 1.06. Over it, centred low:
**You are not a bird in the flock.** holds, then it is replaced by **You are the flock.**
Sequential/interaction: yes — two lines, the second replacing the first at 3.1s; each
holds ~2s fully settled.
Audio intent: the pad fades up from nothing. Nothing else.
Audio-coupled idea: one warm low cue as "You are the flock." lands.
Music: entering, very low.
Transition mood: slow crossfade → Scene 2

### Scene 2 — Birds are the health bar — 4.6s
`wires.jpg` — the flock spread wide, `WIRES` in red, the counter reading `590 · -1`.
Slow drift, 1.00 → 1.05. Text: **1,800 starlings, each one simulated.** then
**The birds are the health bar.**
Sequential/interaction: yes — two lines, ~1.9s and ~2.3s settled.
Audio intent: bed holds flat and low. The image does the work.
Audio-coupled idea: none.
Transition mood: slow crossfade → Scene 3

### Scene 3 — Density is armour — 4.8s
`blacksun.jpg` — the murmuration balled tight, a peregrine committed above, `STOOP 35 m`.
Push 1.00 → 1.07. Text: **A peregrine's strike collapses against a crowd.** then
**Density is your armour.**
Sequential/interaction: yes — two lines, ~2.2s each.
Audio intent: the bed lifts a little here — the only lift in the video.
Audio-coupled idea: one low warm cue on the scene entry, under the falcon.
Transition mood: slow crossfade → Scene 4

### Scene 4 — The parry — 4.6s
`roost.jpg` — the reedbed below, `A FALCON IS GAINING HEIGHT`. Push 1.00 → 1.05.
Text: **Flash expansion is your parry.** then
**Time it right and the falcon closes on air.**
Sequential/interaction: yes — two lines, ~1.6s and ~2.6s settled.
Audio intent: bed settles back down.
Audio-coupled idea: none — the restraint is the point on the parry line.
Transition mood: slow crossfade → Scene 5

### Scene 5 — Counted — 2.4s
`results.jpg` — the ROOSTED card, dimmed slightly so type reads over it. One line beneath:
**589 roosted. 4 lost.**
Sequential/interaction: none — one read, ~2.0s.
Audio intent: one last warm cue as the card lands, then the bed begins its decay.
Audio-coupled idea: the card landing.
Transition mood: fade to black → Scene 6

### Scene 6 — Wordmark — 2.6s
Black. **VESPER** in wide tracked caps, and under it in amber:
**You are not a bird in the flock. You are the flock.**
Sequential/interaction: yes — wordmark, then tagline 0.5s later.
Audio intent: pad decays to silence. No cue on the wordmark.
Audio-coupled idea: none — deliberately.
Transition mood: end.

**Music mood for this video:** low, elegiac, unmetred — a bed, never a driver.
**Audio summary:** A synthesised D-minor drone fades up under the murmuration, holds flat
while the rules are stated, lifts once under the black sun, and decays to silence beneath
the wordmark. Three warm low cues in 24 seconds and nothing else.
