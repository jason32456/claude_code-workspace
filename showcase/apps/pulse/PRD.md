# PRD — PULSE: a synthesized browser groovebox

## One-liner

A 16-step groovebox that ships **zero audio files**. Every kick, hat, clap and bassline
is synthesized live in the Web Audio graph, so the whole instrument is ~60 KB of text,
loads instantly, works offline, and can render your loop to a WAV you actually keep.

## Why this app (uniqueness check)

**Against the repo.** `ambient-noise` and `ambient-mix` are volume mixers over looping
beds — no timing, no sequencing, no synthesis. Nothing here has a transport, a scheduler,
a note model, or audio export. `sonar`, `decision-wheel` and `gravitee` use Web Audio for
one-shot SFX. PULSE is the first project with a real audio *engine*.

**Against the web.** Browser beat makers are plentiful, but essentially all of them
(ButtonBass, SoundTools, Dinoloop, Onemotion, Shuffle Drummer) are **sample players** —
they download megabytes of kit WAVs, so the sound is fixed and the app is dead without a
network. PULSE synthesizes the classic 808/909 voice recipes from oscillators and noise,
which buys three things a sample player structurally cannot have:

1. **Every voice is editable.** Tune the kick, stretch its decay, open the hat — because
   the sound is math, not a recording.
2. **Instant + offline.** No asset fetch, no loading bar, no CDN.
3. **Deterministic offline render.** The same graph rebuilt in an `OfflineAudioContext`
   renders faster than real time, so WAV export is exact rather than a screen recording.

## Users & value

Someone who wants a loop *right now* — a beat to write over, a 4-bar bed for a video, a
scratchpad for a drum idea — without opening a DAW or signing up. "Somewhat useful" is
the honest bar: it exports a real WAV and a real shareable link.

## Core loop

1. Land on a demo pattern already loaded. Hit **Space**.
2. Paint steps on the drum grid; right-click a step to accent or ghost it.
3. Drop a bassline on the scale-locked note roll — every note you can place is in key.
4. Shape the sound in the inspector: tune, decay, tone, filter, delay, reverb.
5. Chain patterns A–D into a song, then **Export WAV** or **Share** a link.

## Feature spec

### Sequencer
| System | Spec |
|---|---|
| Grid | 16 steps × 8 drum tracks, always visible, beat-accented every 4 steps. |
| Velocity | Right-click (or Shift-click) cycles **ghost → normal → accent**, shown as cell brightness. |
| Probability | Alt-click cycles **100 → 75 → 50 → 25 %**, shown as a corner notch. Rolled per playback, so patterns breathe. |
| Note roll | 12-row ladder for the selected melodic track. Rows are *scale degrees*, not semitones — changing key/scale transposes musically instead of breaking the line. Monophonic per step. |
| Patterns | 4 slots (A–D). Copy/clear per slot. |
| Song mode | Chain slots into a sequence; transport advances the chain at each pattern wrap. |
| Euclidean fill | Per track: `k` pulses distributed over 16 steps with rotation (Bjorklund). One click gives a usable rhythm. |
| Generate | Genre-weighted pattern generator (House · Techno · Trap · Breaks · Lo-fi) that writes drums *and* a matching bassline. |

### Transport
BPM 60–200, swing 0–65 % applied as a delay on odd 16ths, play/stop, live position
readout, and a playhead driven off the audio clock (not `setInterval`).

**Timing model.** A `setInterval` tick every 25 ms looks 100 ms into the future and
schedules any step falling in that window against `AudioContext.currentTime` — the
lookahead scheduler from Chris Wilson's *A Tale of Two Clocks*. Timer jitter never
reaches the audio; the UI playhead reads a queue of `(step, time)` pairs on `rAF`.

### Voices (all synthesized — no samples)
| Voice | Recipe |
|---|---|
| Kick | Sine with exponential pitch drop, amp decay, plus a transient click layer. `tune · decay · punch · drive` |
| Snare | Band-passed noise + tuned triangle body. `tune · decay · snap · tone` |
| Clap | Three staggered noise bursts into a band-pass, plus a longer tail. `tone · decay · spread` |
| Hats (closed/open) | Six square oscillators at inharmonic 808 ratios → band-pass → high-pass. `tune · tone · decay` |
| Tom | Pitch-enveloped sine. `tune · decay` |
| Rim | Two very short detuned squares through a tight band-pass. |
| Cowbell | Two squares (a ~5:8 ratio) into a band-pass. |
| Bass | Osc (saw/square/sine) + sub sine, filter with its own envelope, amp envelope. |
| Lead | Two detuned saws, filter envelope, pluck decay. |

### Signal path
```
voice → track gain → track pan ─┬─→ dry bus ─────────────┐
                                ├─→ delay send → delay ──┤→ drive → master filter
                                └─→ reverb send → conv ──┘         → compressor → out
```
Delay is tempo-synced (1/16 · 1/8 · dotted 1/8 · 1/4) with a damped feedback loop.
Reverb is a `ConvolverNode` fed a **procedurally generated** impulse response (decaying
filtered noise) — still no asset files.

### Output
- **Export WAV** — rebuilds the identical graph in an `OfflineAudioContext`, renders the
  loop or full song plus a 2.5 s tail, encodes 16-bit stereo PCM, downloads.
- **Share** — the whole project is packed to JSON, deflated via `CompressionStream`, and
  base64url'd into the URL hash. Opening the link restores the exact session.
- **Autosave** — debounced to `localStorage`, restored on load.

### Kits
`808` · `909` · `Lo-Fi` · `Acoustic` swap every voice's parameter set in one click.

## Non-goals (v1)

Audio recording/microphone input, user sample import, MIDI in/out, per-track pattern
lengths (polyrhythm), automation lanes, more than 16 steps, mobile-first touch layout.

## Stack

Vanilla JS + ES modules + Web Audio API. **Zero dependencies, zero assets.** A framework
would earn nothing here: the DOM is two CSS grids and a panel, while all the real work is
in an audio graph that React would only get in the way of. Served statically, deploys to
Vercel as-is.

## Success criteria

- Loads and is playable in under a second on a cold cache, with the network off.
- Timing holds steady while the UI is being dragged (no audible jitter).
- Exported WAV is sample-accurate to what was heard.
- A shared link reproduces the pattern, sounds, and mix exactly.
