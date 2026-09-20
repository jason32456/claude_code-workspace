# Hyperframes Composition Brief: ghoti

## Objective
Create a short launch-style brag video for **ghoti** — a browser page that learns to read
English aloud from 117,493 dictionary pronunciations with no supervision, then uses what it
learned to disprove the 170-year-old "ghoti spells fish" joke.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 21s

## Source Material
- Project root: `showcase/apps/ghoti/`
- Primary files read: `index.html`, `style.css`, `README.md`, `screenshots/trial.png`,
  `screenshots/verdict.png`
- Product name: `ghoti`
- Tagline / strongest claim: "It is not. Everything below is measured in your browser, right
  now, from scratch."
- Key UI to recreate: the **verdict panel** — amber-bordered card, huge mono `ghoti`, a row of
  phoneme chips `G HH OW1 T IY0`, and the line "it does not say fish, and it never could."
  Second: the **trial rows** with their `NEVER HAPPENS` badges and real counts.
- Copy that must appear verbatim:
  - `gh` as in tough · `o` as in women · `ti` as in nation
  - This spells "fish."
  - It doesn't.
  - 117,493 pronunciations. No rules given.
  - NEVER HAPPENS
  - 0 of 49 · 47 of 48,937 · 0 of 276
  - Position is the part the joke leaves out.
  - So when a model that has read 117,493 English words is handed the word
  - it does not say fish, and it never could.
  - 47.4%
  - English spelling isn't chaos. It's a system with exceptions.

## Creative Direction
- Tone preset: `polished`
- Creative direction: a quiet courtroom verdict, delivered by a dictionary
- Interpretation: No winking, no hype, no exclamation marks. The material is genuinely funny
  *and* genuinely rigorous, so restraint is the creative choice — long holds, few elements on
  screen, numbers doing the talking. The only burst of rhythm is the three counts landing,
  because that is the argument itself.
- Angle: The joke is 170 years old and everyone repeats it. This page kills it, and the
  refutation is not an argument — it is a **count**. The video states the joke with total
  sincerity, then lets the numbers execute it. The punchline is a data table.
- Hook: the wordmark `ghoti` at full scale in the site's amber/teal split, then `This spells
  "fish."` stated completely straight.
- Outro / punchline: "English spelling isn't chaos. It's a system with exceptions."
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Any exclamation mark, any hype verb

## Visual Identity
- Background: `#0c0e11`
- Panel: `#14181e`; hairline border `#262d36`
- Accent: `#e8a33d` (amber)
- Secondary: `#4dbcaa` (teal — the `o` in the wordmark)
- Negative: `#e2624e` (the NEVER HAPPENS badge)
- Text: `#e9e5dd`; muted `#8b939e`; dim `#5c646e`
- Display font: generic `monospace` (the site is mono throughout; use the CSS generic so no
  `@font-face` is required and `font_family_without_font_face` cannot fire)
- Body font: generic `system-ui` / `sans-serif`
- Visual references: the wordmark's per-letter colouring, the trial row cards with
  position bars, the amber-bordered verdict card, the phoneme chips

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. The joke, stated straight — 4.5s — wordmark + three fragments + `This spells "fish."`
2. The refusal — 3.5s — `It doesn't.` then the 117,493 / no-rules line
3. The trial — 5.0s — three count rows arriving one by one with NEVER HAPPENS badges
4. The verdict — 4.5s — typed `ghoti`, five phoneme chips, the verdict line
5. The real flex — 3.5s — `47.4%`, then the wordmark settling on the strong cue

## Audio
- Audio role: sparse professional accents over a low bed — presence, not propulsion
- Audio arc: quiet bed under the title → drops to near-nothing for the refusal → beat-aligned
  ticks as the three counts land → tactile typing and one low hit on the verdict → fade to
  silence under the wordmark
- Music: `assets/music/happy-beats-business-moves-vol-10-by-ende-dot-app.mp3`
- Music treatment: starts at 0, held low throughout (~0.22 gain), lifts slightly into the
  verdict, fades to 0 across the last ~1.2s via the volume automation lane. Never competes
  with on-screen numbers.
- Music cue guidance: bundled preset
  `assets/music/cues/happy-beats-business-moves-vol-10-...music-cues.md`, ~109.96 BPM.
  **Strong cue at 20.19s** → lock the final wordmark settle there (±0.15s).
  Beat grid for the three trial rows: **8.73, 9.83, 10.93** (every other beat, ~1.1s apart so
  each row clears the reading floor).
- Audio-reactive treatment: subtle — the verdict card's amber border glow may breathe with
  music RMS. No waveform, no equalizer, no strobing, no text scaling.
- Audio-coupled moments:
  - Scene 1 fragments — soft accent per fragment (`ui/rollover2.ogg`, very low gain)
  - Scene 3 count rows — one tick per row, beat-aligned (`interface/bong_001.ogg`)
  - Scene 4 typing — five per-character keypresses, fixed non-random selection
  - Scene 4 chips — crisp tick per chip (`interface/click_003.ogg`)
  - Scene 4 verdict line — one low restrained hit (`impact/impactSoft_heavy_002.ogg`)
- SFX selection guidance: everything chosen from the low/medium high-frequency-risk list in
  `sfx-analysis.md`, because this is a polished tone with repeated cues.
- SFX analysis guidance: `.agents/skills/brag/assets/sfx/sfx-analysis.md`
- Restraint rule: **no riser, no whoosh, no stinger on the outro.** The last sound is the bed
  fading out. The video ends in silence.
- Audio files: already copied into `brag-output/composition/assets/`

## Hyperframes Instructions
Follow `hyperframes-core` (composition contract, `data-*` timing, `class="clip"`),
`hyperframes-animation` (motion), `hyperframes-keyframes` (seek-safe), and `hyperframes-cli`
(check/render). Do not enter the `/hyperframes` intent interview or the generic
product-launch-video workflow — `/brag` owns this run.

Requirements:
- Show real UI from the project: the verdict card and the trial rows are both recreated.
- Every text element clears the reading floor (short label ~0.8s settled, sentence ~0.3s/word).
- Total duration 21s.
- Deterministic only: no `Math.random()`, no `Date.now()`. The five keypress sounds are a
  fixed hand-picked sequence, not randomised.
- One paused root timeline registered at `window.__timelines["main"]`, key matching
  `data-composition-id="main"`.
- Never tween `visibility`/`autoAlpha` on a `.clip`; animate children.
- No CSS `transform` initial state on any node that GSAP then tweens on the same property —
  use `fromTo`.
- Use generic CSS font families only, so `font_family_without_font_face` cannot fire.
- `npx hyperframes check` must pass with zero errors before render.
