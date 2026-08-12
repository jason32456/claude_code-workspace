# AFTERIMAGE — Product Requirements Document

**Version** 1.0 · **Status** Implemented · **Type** Browser game (desktop)

---

## 1. One-liner

A 3D time-loop puzzle-platformer where every failed attempt becomes a **solid, replaying ghost of yourself** — you solve each chamber by cooperating with, and physically standing on, your own past.

## 2. Why this game

The repo already holds five 3D projects, all of them reflex-driven: `crossy-road`
(endless hopper), `joyride` (driving sandbox), `overrun` (FPS horde shooter),
`apex-riders` (racing), `snake-3d` (arcade snake). There is no puzzle game, no
game built around a *mechanic* rather than reaction speed, and nothing that uses
recorded time as a game system.

Afterimage is deliberately the opposite of everything already there: slow,
deliberate, spatial-reasoning-driven. Its novelty is that the recording is not a
replay cosmetic — the echo has a **collider**. A past self is scenery, a
staircase, a counterweight and a co-op partner at the same time.

## 3. Core loop

```
        ┌──────────────────────────────────────────────┐
        │  Take begins at t = 0. World resets.         │
        │  Every banked echo replays from t = 0.       │
        │  You act for up to <loop> seconds.           │
        │                                              │
        │  Press R (or let the timer expire)           │
        │   → your take is banked as a new echo        │
        │   → time rewinds, everything resets          │
        └──────────────────────────────────────────────┘
                 ↓ all crystals collected + stand on exit
                        LEVEL COMPLETE
```

The tension: you have a limited **echo budget** per level. Solving in fewer
echoes than par is the skill ceiling.

## 4. Mechanics

### 4.1 Echoes (the core system)

| Property | Behaviour |
|---|---|
| Recording | Player transform + action flags sampled at a fixed 60 Hz tick |
| Playback | Positional replay (not physics re-simulation) — perfectly deterministic |
| Collision | **Solid.** An echo is a moving AABB you can stand on and be blocked by |
| Interaction | Echoes press plates, hit switches and collect crystals exactly as you did |
| Budget | Per-level `maxEchoes`; `Z` deletes the most recent echo and restarts the take |

Two consequences make the puzzles work:

1. **Vertical** — a standing echo is a 1.8 m step. Jump reach is 2.25 m, so
   a 3.5 m ledge needs one echo and a 5.2 m ledge needs an echo standing on an echo.
2. **Simultaneity** — a door needing two plates held at once is impossible for one
   body and trivial for a body plus two echoes.

### 4.2 World elements

| Element | Rule |
|---|---|
| **Crystal** | Collected by *any* body (you or an echo). All must be collected in a single timeline for the exit to arm. |
| **Pressure plate** | Powered while any body overlaps it. Emissive ring turns green. |
| **Door** | Opens when *all* linked plates are held, and/or when its linked switch matches its polarity. Slides into the floor. |
| **Switch** | Pressed with `E` within range; toggles for the remainder of the take. A door can be wired **inverted**, so one switch can gate two doors in opposite phase. |
| **Mover** | Platform on a cosine ping-pong driven by the loop clock — identical in every take. Carries riders (you *and* echoes). |
| **Hazard** | Blinking laser field. Contact **discards the current take** and restarts it; banked echoes survive. |
| **Exit** | Arms once every crystal is collected. Stand on it to finish. |

### 4.3 Player physics

Custom swept-free AABB character controller (no physics library):

- Half-extents 0.4 × 0.9 × 0.4, gravity 24 m/s², jump 10.4 m/s → 2.25 m apex
- Ground accel 60, air accel 22, ground friction 12 → responsive but weighty
- Coyote time 0.10 s, jump buffer 0.12 s
- Riding: the delta of a supporting dynamic body (mover or echo) is applied to the player before integration
- Final depenetration pass along the minimal axis so a moving echo pushes rather than traps

### 4.4 Controls

| Input | Action |
|---|---|
| `W A S D` | Move (camera-relative) |
| `Space` | Jump |
| `E` | Interact with switch |
| `R` | Rewind — bank the take as an echo |
| `Q` | Retry take — discard the current recording |
| `Z` | Undo — delete the newest echo |
| `Mouse` | Orbit camera (pointer lock) |
| `Esc` | Pause / level select |

## 5. Level plan

Six hand-authored chambers, each introducing exactly one idea then compounding it.

| # | Name | Teaches | Loop | Echoes | Par |
|---|---|---|---|---|---|
| 1 | First Light | An echo holds a plate so you can pass | 14 s | 2 | 1 |
| 2 | Step Up | An echo is a staircase | 16 s | 2 | 1 |
| 3 | Two Hands | Two plates held at once = two echoes | 18 s | 3 | 2 |
| 4 | Clockwork | Loop-synced mover + blinking hazard + remote plate | 22 s | 3 | 1 |
| 5 | Switchboard | One switch, two inverted doors, one echo pressing it twice | 20 s | 3 | 1 |
| 6 | Spire | Echo stacked on echo to reach 5.2 m, plus a plate gate | 24 s | 4 | 3 |

## 6. Presentation

- **Look** — dark indigo void, fog, emissive edge-lit geometry (Tron-adjacent but cool/desaturated), soft shadows.
- **Echoes** — translucent violet with additive wireframe edges, so a stack of them reads clearly against the level.
- **Rewind** — a white flash wipe, camera kick and a downward pitch sweep, so a rewind *feels* like a rewind.
- **Audio** — 100 % synthesized Web Audio (no asset files): jump, land, crystal arpeggio, plate click, door slide, switch clunk, hazard buzz, rewind sweep, win chord.
- **HUD** — loop-timer ring, echo pips, crystal count, contextual hint line.

## 7. Persistence

`localStorage` (`afterimage.save`): highest level unlocked + best echo count per level. No accounts, no backend.

## 8. Technical constraints

- Three.js **r163, vendored locally** (`vendor/three.module.js`) — the game runs fully offline with zero network calls, matching `crossy-road` / `overrun`.
- Vanilla JS + ES modules, no build step, so it deploys as a static folder alongside every other project in this repo.
- Fixed 60 Hz simulation tick with an accumulator; rendering interpolates. Frame-rate independence is a correctness requirement, not a nicety — recordings must replay identically on any machine.
- Target 60 fps at 1440×900 on integrated graphics.

## 9. Out of scope (v1)

Mobile/touch controls, a level editor, echo-vs-echo paradox rules, online leaderboards, narrative.

## 10. Success criteria

1. A player who has never seen the game finishes level 1 without reading instructions.
2. Every level is solvable within its echo budget; levels 2 and 6 are *impossible* without standing on an echo.
3. Replays are deterministic — a banked echo executes identically on every subsequent take.
4. Cold load under 2 s, no network requests after the initial page load.
