# PRD — SONAR: Echoes in the Dark

## One-liner

A stealth-maze arcade game played almost entirely in darkness: you can only *see* by
emitting echolocation pings that briefly paint the world in light — but every ping is
also a dinner bell for the blind creatures that hunt sound.

## Why this game (uniqueness check)

The repo already contains hoppers, shooters, racers, snake, flappy clones, and physics
golf. None of them touch the core ideas here:

- **Vision as a resource.** The screen is dark by default. Information itself is the
  scarce currency — not ammo, not time.
- **A single risk/reward verb.** Pinging is both your only sense *and* your biggest
  danger. Every press of Space is a gamble.
- **Stealth + memory gameplay.** Between pings you navigate from your mental map of a
  fading afterimage. No other project in the repo has stealth or memory mechanics.

## Core loop

1. Spawn in a pitch-black procedurally generated labyrinth with only a faint glow
   around your body.
2. **Ping** (Space / click) — a circular sound wave expands outward, illuminating
   walls, shards, lurkers, and the exit as it passes. Light fades over a few seconds.
3. Collect **all echo shards** in the level. Shards shimmer faintly on their own, but
   you need pings to find the paths to them.
4. Lurkers that *hear* a ping rush toward where it was emitted. Touching one costs a
   heart and scatters them.
5. When every shard is collected, the **exit gate unlocks** — reach it to clear the
   level. Levels grow bigger, darker, and more crowded.

## Mechanics

| System | Spec |
|---|---|
| Maze | Recursive-backtracker maze on a grid, with extra walls knocked out to create loops and small rooms. Size scales with level (from ~19×13 up to ~35×23 cells). |
| Movement | WASD / arrow keys, smooth (not grid-stepped), circle-vs-tile collision with wall sliding. |
| Ping | Expanding wavefront (~9 tiles/s). Any tile it passes lights to full brightness, then decays over ~3.5 s. Cooldown ~0.9 s shown in the HUD. |
| Ambient glow | The player always sees ~1.5 tiles around themselves — enough to not be unfair, not enough to navigate. |
| Lurkers | Blind wanderers. A ping within their hearing radius aggros them to the *ping origin* (not the player) for a few seconds at higher speed — so you can ping-and-move to dodge them. They are only visible when light touches them; a nearby lurker triggers an audible heartbeat. |
| Shards | 3–6 per level. Collecting one plays a chime and adds score. Counter in HUD. |
| Exit | Locked (dim ring) until all shards are collected, then glows gold and hums. |
| Hearts | 3 per run. Hit → knockback, ~2 s invulnerability, lurkers scatter. 0 hearts → game over, run restarts at level 1. |
| Score | 100 × shard, level-clear bonus + time bonus. Best score in `localStorage`. |
| Difficulty | Each level: bigger maze, +lurkers, faster lurkers, larger hearing radius. |

## Audio (all synthesized, Web Audio API — no assets)

- Ping: descending sine sweep with delay-line echo.
- Shard pickup: two-note chime; exit unlock: rising arpeggio.
- Hurt: low thud + noise burst. Level clear: short jingle.
- Proximity heartbeat when a lurker is within ~4 tiles.
- Low ambient drone underneath everything.

## Look & feel

Near-black navy void, cyan echo light with additive glow, gold exit, magenta-red
lurkers, teal shards. Subtle vignette; light is drawn as fading afterimage so the
world feels remembered rather than seen. Minimal HUD (hearts, shards, level, score,
ping cooldown bar).

## Screens

Title (name, controls, "press Space") → Playing → Level-clear interstitial →
Game-over (score, best, retry). All overlays, one canvas underneath.

## Stack

Vanilla JS + Canvas 2D + Web Audio API, ES modules, zero dependencies. Served
statically (`python -m http.server`) and deployable on Vercel as-is. Chosen over a
framework because the whole game is one canvas and one state machine — a build step
would add nothing.

## Out of scope (v1)

Mobile touch controls, gamepad, persistent progression beyond best score,
hand-authored levels, occlusion-accurate echo propagation (wavefront ignores walls).
