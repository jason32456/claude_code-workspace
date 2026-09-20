# Brag Plan: ghoti

## What is this app?
A browser page that teaches itself to read English aloud from 117,493 dictionary
pronunciations — with nobody ever telling it which letter makes which sound — and then
uses what it learned to prosecute the oldest joke about English spelling.

## The angle
The joke ("gh as in tough, o as in women, ti as in nation — therefore ghoti spells fish")
is 170 years old and everyone repeats it. This page kills it, and the refutation is not
an argument, it is a **count**. The video's whole job is to deliver that turn: state the
joke with total sincerity, then let the numbers execute it. The punchline is a data table.

## Hook (first 2-3 seconds)
The wordmark **ghoti** at full scale in the site's own amber/teal split, then one line
underneath: *"This spells 'fish.'"* Stated completely straight. The viewer either knows
the joke and leans in, or doesn't and wants the explanation. Either way they stay.

## Key moments (the middle)
- The three substitutions arriving one by one with their real counts and the site's own
  `NEVER HAPPENS` badge: `gh → /f/` **0 of 49** word-initial. `ti → /ʃ/` **0 of 276**
  word-final. The joke needs positions the language never uses.
- The verdict panel, recreated: hand the trained model the word `ghoti`, it answers
  **G HH OW1 T IY0**, and the line underneath — *"it does not say fish, and it never could."*
- The real flex, held for the last beat: **47.4%** of unseen words exactly right, stress
  marks included, from a model that was told **zero** spelling rules.

## Outro / punchline
The wordmark returns, small, with the one stat that reframes everything:
*"English spelling isn't chaos. It's a system with exceptions."* Then the fact that all of
it — train, score, prosecute, self-test — runs in a browser tab in about 30 seconds.

## User flow worth showing
Entry → key action → result, straight from the app's "Read it aloud" tab:
1. A word is typed into the input (the field literally ships with `ghoti` as its placeholder).
2. The model answers with phoneme chips.
3. The chips can be played back — the payoff is *audible*.
Scene 4 recreates exactly this: type `ghoti`, chips land one by one, verdict line resolves.

## Tone
- Preset: `polished`
- Creative direction: a quiet courtroom verdict, delivered by a dictionary
- Interpretation: No winking, no hype, no exclamation. The material is genuinely funny and
  genuinely rigorous, so the video's job is restraint — long holds, few elements on screen,
  numbers doing the talking. Confidence through stillness. The one moment of motion energy
  is the sequential arrival of the three counts, because that *is* the argument landing.

## Format: landscape — 1920x1080
## Duration: 21s

## Visual identity (from the project)
- Background: `#0c0e11`
- Panel: `#14181e`, hairline `#262d36`
- Accent: `#e8a33d` (amber)
- Secondary: `#4dbcaa` (teal) — the `o` in the wordmark
- Bad/negative: `#e2624e` (the NEVER HAPPENS badge)
- Text: `#e9e5dd`, muted `#8b939e`, dim `#5c646e`
- Display font: monospace (`ui-monospace`/Menlo/Consolas) — the wordmark and all data are mono
- Body font: system sans (`-apple-system`/Segoe UI/Inter)
- Strongest visual element: the verdict panel — amber-bordered card, huge mono `ghoti`,
  a row of phoneme chips, and one quiet line of text underneath

## Share copy (draft)
"gh as in tough, o as in women, ti as in nation" — the 170-year-old joke says that spells
fish. So I taught a model to read English from 117,493 words, with no rules given, and asked
it. It says G HH OW1 T IY0. It does not say fish, and it never could.

## Audio direction
- Role: sparse professional accents over a low bed — the bed is presence, not propulsion
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (60s, ~110 BPM — the calmest
  bundled track)
- Music treatment: start at 0.0s, hold low under the whole piece, lift slightly into the
  verdict, clean fade-out across the last 1.2s. Never competes with the on-screen numbers.
- Music cue guidance: preset read from `cues/happy-beats-business-moves-vol-10-...music-cues.md`.
  Tempo ~109.96 BPM. **Strong cue at 20.19s** — target the final wordmark settle there.
  Beat grid for the three-count sequence in Scene 3: land on 8.73, 9.83, 10.93 (every other
  beat, ~1.1s apart) so each row holds long enough to read.
- Audio-reactive treatment: subtle; allow the verdict card's amber border glow to breathe
  with RMS. No waveform, no equalizer, no pulsing text.
- SFX posture: sparse. Per-character keypresses for the typed word in Scene 4 (randomised
  across the keyboard set), one soft interface tick per count row in Scene 3, one restrained
  low hit on the verdict reveal. Nothing else.
- Audio-coupled moments: the typed `ghoti` (Scene 4), the three sequential count rows
  (Scene 3), the phoneme chips landing (Scene 4).
- Restraint rule: no riser, no whoosh, no stinger on the outro. The last sound is the bed
  fading out. Silence is the final beat.

## Storyboard

### Scene 1 — The joke, stated straight — 4.5s
Black `#0c0e11`. The wordmark `ghoti` fades up huge and centred in mono, with `gh` and `ti`
in amber `#e8a33d` and the `o` in teal `#4dbcaa` — exactly the site's own treatment.
Beneath it, three fragments arrive one at a time: **gh** as in *tough* · **o** as in *women*
· **ti** as in *nation*. Then the payoff line settles and holds: **This spells "fish."**
Sequential/interaction: yes — three fragments arrive ~0.55s apart, then the payoff line
holds fully settled for ~1.4s before the cut.
Audio intent: bed enters quietly under the wordmark; almost nothing else. Let it feel like
the opening title of something serious.
Audio-coupled idea: one very soft tick per fragment arrival — barely audible, just texture.
Music: low, sparse, present.
Transition mood: clean → Scene 2

### Scene 2 — The refusal — 3.5s
Hard-ish clean cut. Centred, nothing else on screen: **It doesn't.**
Hold. Then, smaller, underneath: *117,493 pronunciations. No rules given. Nobody ever says
which letter makes which sound.*
Sequential/interaction: none — two elements, both held long.
Audio intent: the bed drops to its quietest here. The empty space is the point.
Audio-coupled idea: none. Deliberate.
Music: minimal.
Transition mood: clean → Scene 3

### Scene 3 — The trial — 5.0s
The argument. Three rows arrive one by one, each a compact panel card (`#14181e`, hairline
border) in the site's mono:
- `gh → /f/` · needs word-initial · **0 of 49** · `NEVER HAPPENS` badge in `#e2624e`
- `o → /ɪ/` · needs word-medial · **47 of 48,937** — *0.096%*
- `ti → /ʃ/` · needs word-final · **0 of 276** · `NEVER HAPPENS` badge
Beneath, once all three are settled: *Position is the part the joke leaves out.*
Sequential/interaction: yes — rows land on beats 8.73, 9.83, 10.93 (~1.1s apart), each
holding fully readable; all three remain on screen together for the final ~1.2s.
Audio intent: this is the only place with rhythm. Each row arrival gets a soft interface
tick so the count feels like evidence being entered.
Audio-coupled idea: one restrained tick per row, beat-aligned.
Music: bed lifts very slightly.
Transition mood: clean → Scene 4

### Scene 4 — The verdict — 4.5s
Recreate the app's verdict panel: amber-bordered card on the dark ground. Small grey line
at the top: *So when a model that has read 117,493 English words is handed the word* —
then the input types out `ghoti` character by character in huge mono. Beat. Five phoneme
chips land left to right: `G` `HH` `OW1` `T` `IY0`. Then the line resolves underneath and
holds: **it does not say fish, and it never could.**
Sequential/interaction: yes — simulated typing (5 characters), then 5 chips arriving ~0.12s
apart, then the verdict line.
Audio intent: the typing is tactile and real; the chips are crisp; the verdict line gets one
low, restrained hit and then nothing.
Audio-coupled idea: per-character keypresses randomised across the keyboard set; soft chip
ticks; one low hit on the verdict line.
Music: lifts into the reveal, then settles.
Transition mood: soft → Scene 5

### Scene 5 — The real flex — 3.5s
Quiet close. Centred: **47.4%** in large amber mono, with *of unseen words, exactly right —
stress marks included* beneath it, and smaller still: *from a model told zero spelling rules.*
Then everything clears except the wordmark `ghoti`, small and centred, settling on the
music's strong cue at ~20.19s, with one last line: *English spelling isn't chaos.
It's a system with exceptions.*
Sequential/interaction: yes — stat first, then clear, then wordmark settle.
Audio intent: bed fades out across the last 1.2s. The video ends in silence, not on a hit.
Audio-coupled idea: none — the restraint rule applies hardest here.
Music: fade to zero.
Transition mood: end.

**Music mood for this video:** restrained, low, present — a bed, not a driver.
**Audio summary:** A quiet bed holds under the whole piece, drops to near-nothing for the
refusal, picks up a beat-aligned tick per count as the evidence lands, gets one tactile
typing moment and a single low hit on the verdict, then fades to silence under the wordmark.
