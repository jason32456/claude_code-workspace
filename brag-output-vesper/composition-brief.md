# Hyperframes Composition Brief: Vesper

## Objective
A short launch-style brag video for **Vesper** — a 3D dusk-flight game where you steer a
murmuration of up to ~1,800 individually simulated starlings and the number still alive is
the only health bar.

## Output
- Composition directory: `brag-output-vesper/composition/`
- Rendered video: `brag-output-vesper/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 24.6s

## Source Material
- Project root: `showcase/apps/vesper/`
- Primary files read: `README.md`, `index.html`, `style.css`, `screenshots/*`
- Product name: Vesper
- Tagline: "You are not a bird in the flock. You are the flock." (verbatim, from the game's
  own title screen)
- **Footage decision:** live capture was attempted and rejected. The game runs at 4.9 fps at
  1080p under this container's software GL (7.8 fps at 720p), which is far too choppy for
  usable motion. Gameplay stills were then captured fresh at 2560x1440 by driving the real
  game through Playwright — density 0% → 96.9% (black sun) → 14.6% (after flash) — but those
  frames were flatter and worse composed than the author's own bundled screenshots. The
  video therefore uses the bundled stills, lanczos-upscaled to 2880x1800 for push-in
  headroom. All five are real captures of the running game, HUD included.
- Images used: `murmuration`, `wires`, `blacksun`, `roost`, `results`
- Copy that must appear verbatim:
  - You are not a bird in the flock. / You are the flock.
  - 1,800 starlings, each one simulated.
  - The birds are the health bar.
  - A peregrine's strike collapses against a crowd.
  - Density is your armour.
  - Flash expansion is your parry.
  - Time it right and the falcon closes on air.

## Creative Direction
- Tone preset: `cinematic`
- Creative direction: a dusk nature film that turns into a chase
- Interpretation: wide shots, big quiet type, slow push-ins, dips through black instead of
  hard cuts. The art is already atmospheric, so the edit stays out of its way — nothing
  moves faster than the birds.
- Angle: almost every game gives you an avatar and a health bar. Vesper deletes both and
  makes the flock itself the avatar and its size the health. The video lands that one
  substitution and then shows the three consequences.
- Hook: the murmuration over the valley at last light, with the tagline in two beats.
- Outro: the ROOSTED card, then black, then the wordmark.
- Avoid: generic SaaS language, abstract filler, any recolouring of the game's art.

## Visual Identity
- Ink `#e7e0d6` · Dim `#9c9689` · Amber `#e0a35c` · Alarm `#e5654f` · Calm `#7fd6c8`
- Ground: `#05070c`
- Display font: generic `system-ui` / `sans-serif` only, so `font_family_without_font_face`
  cannot fire. Wordmark uses wide tracking in caps, matching the game's title treatment.
- Stills are **top-aligned** in the 16:9 frame so Vesper's own HUD (flock count, roost
  progress, light, falcon state) survives the 16:10 crop intact rather than being sliced;
  the push-in's transform-origin is pinned to the top edge for the same reason.

## Storyboard
Use `brag-output-vesper/brag-plan.md` as the creative contract.

1. You are the flock — 5.6s — murmuration; tagline in two beats
2. Birds are the health bar — 4.6s — wires, `590 · -1`, WIRES in red
3. Density is armour — 4.8s — black sun, peregrine committed, STOOP
4. The parry — 4.6s — roost, A FALCON IS GAINING HEIGHT
5. Counted — 2.4s — the ROOSTED card, no caption (the card already says it)
6. Wordmark — 2.6s — VESPER + tagline on black

## Audio
- Audio role: cinematic support — one low elegiac bed carrying the whole piece
- Audio arc: fades up under the murmuration, flat while the rules are stated, lifts once
  under the black sun, settles, decays to silence beneath the wordmark
- Music: `assets/music/dusk-pad.mp3` — **synthesised for this video.** The five bundled brag
  tracks are upbeat corporate beds (110-120 BPM) and would fight a dusk film. This is a 26s
  D-minor drone (D2/D3/A3/C4/F4 plus a detuned D3 for slow beating), independent LFOs per
  partial, lowpass 1.1 kHz, short stereo echo, normalised to −23 LUFS. On-theme too: Vesper
  synthesises every sound it makes at load and ships zero asset files.
- Music treatment: 3.5s fade-in baked in; level and the closing fade owned by the volume
  automation lane.
- Music cue guidance: **none, deliberately.** The bed is unmetred, there is no beat grid,
  and nothing in this edit snaps to one. Scene timing is driven entirely by reading time and
  push-in length. This is an intentional departure from the beat-sync default.
- Audio-reactive treatment: none — the tone asks for stillness, and a breathing glow over
  dusk photography would read as a mistake.
- SFX: three warm low cues in 24.6 seconds — `impactSoft_heavy_002` on "You are the flock.",
  `impactSoft_heavy_000` on the black-sun entry, `impactSoft_medium_001` on the ROOSTED card.
  All from the low high-frequency-risk list.
- Restraint rule: no whoosh, no riser, nothing on the wordmark. The last sound is the pad
  decaying under black.

## Hyperframes Requirements
- Deterministic only; one paused root timeline at `window.__timelines["main"]`.
- Never tween `visibility`/`autoAlpha` on a `.clip`; no CSS transform initial state on a node
  GSAP then tweens on the same property — `fromTo` throughout.
- Intentional push-in bleed is marked `data-layout-allow-overflow` rather than left as noise.
- `npx hyperframes check` must pass with zero errors before render.
