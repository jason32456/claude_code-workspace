# Crux — PRD

## 1. One-liner

A 3D free-solo climbing game where you move **one hand at a time**. The rock does
not decide whether you stay on it — **the direction you pull does**. A crimp that
spits you off when you hang straight down will hold all day once you get your hips
in and stand on your feet.

## 2. Why this one

The repo has 47 projects and a dozen 3D games. Every one of them is about
*travelling through* a space someone else authored — hop the lanes (Crossy Road),
drive the city (Joyride), clear the arena (Overrun), sail the course (Windward),
lap the track (Apex Riders), fly the storm (Leyden), paint the line (Emberline).
Silkfall inverts it by letting you build the level, but you still traverse it.

Crux is the first one where the interesting state is **inside the player's body**.
There is no vehicle, no weapon, no throttle, and for long stretches no movement at
all. Both feet and one hand can be on the wall and the game is still asking you a
hard question: your hips are six inches too far from the rock, so 70% of your
weight is hanging off two fingers, and the meter that matters is draining. The
verbs are grip, reach, weight and rest — nothing else in the repo is built on
static load.

## 3. Player fantasy

You are 70 metres up a limestone spire with no rope and no way down. You are not
strong; you are *precise*. The good runs are the ones where you barely feel
strong at all — you found the foothold, you turned your hip in, the pull went
vertical, and the hard move became easy.

## 4. Core loop

```
        ┌──────── READ ─────────────────────────────┐
        │  look up the wall, pick a line            │
        │  holds are colour-coded by type            │
        └──────────────┬────────────────────────────┘
                       ▼
        ┌──────── SET ──────────────────────────────┐
        │  WASD shifts hips → changes the pull       │
        │  vector on every gripped hold, and how     │
        │  much weight lands in your feet            │
        └──────────────┬────────────────────────────┘
                       ▼
        ┌──────── MOVE ─────────────────────────────┐
        │  Q / E send left / right hand to the      │
        │  targeted hold. One hand must stay on.     │
        │  Too far? Shift = dyno, both hands off.    │
        └──────────────┬────────────────────────────┘
                       ▼
        ┌──────── RECOVER ──────────────────────────┐
        │  find a jug, get straight-armed, shake    │
        │  out (X) to dump pump. Chalk (R) to dry.  │
        └──────────────┬────────────────────────────┘
                       ▼
                 summit  ·  or  ·  fall to the last cam
```

## 5. Mechanics

### 5.1 The load solver (the heart of it)

Every frame the climber's mass is distributed across the contacts that are
currently on the rock (up to two hands, up to two feet). For each contact the
solver produces a **pull vector** — the direction the rock is being loaded — and a
**share** of body weight.

- Weight moves into the **feet** as the hips move over them; the further the hips
  are from the wall, the more the arms take. This single relationship is the game.
- Each hold has an **ideal pull direction** baked in when the route is generated:
  straight down for an edge, into the slope for a sloper, outward-and-down for an
  undercling, sideways for a sidepull.
- The ideal is expressed **down the face** — world-down projected into the rock's
  tangent plane — so the tilt of the wall rotates what every hold wants. That one
  choice is what makes the same edge trivial on the slab and desperate on the roof.
- `grip quality = alignment(actual pull, ideal pull) × friction (chalk, wet) ×
  (1 − fatigue)`.
- Grip quality below the hold's threshold and the hand **slips** — a warning
  judder first, then it's off.

### 5.2 Hold types

| Type | Colour | Drain | Ideal pull | Notes |
|---|---|---|---|---|
| **Jug** | green | 0.34× | down the face | Bomber. The only place shake-out works. |
| **Edge / crimp** | blue | 1.0× | down the face | Punishes swinging. Wants hips in. |
| **Sloper** | amber | 1.35× | down the face, pressed in | Friction only. Wind and wet kill it. |
| **Pocket** | violet | 1.2× | down and slightly in | Narrow window. |
| **Sidepull** | cyan | 0.92× | lateral | Shift your hips away from it or it gives nothing. |
| **Undercling** | pink | 1.12× | outward and up | Wants hips **out** — the opposite of everything else. |
| **Flake** | dull red | 1.0× | down the face | **Breaks** after ~2.6 s of load. |

Measured grip quality by wall angle, hips out vs hips in:

| | jug | edge | sloper | pocket | undercling |
|---|---|---|---|---|---|
| **slab** | 0.96 / 0.98 | 0.95 / 0.91 | 0.68 / 1.00 | 0.74 / 0.99 | 0.17 / 0.00 |
| **vertical** | 0.87 / 1.00 | 0.78 / 1.00 | 0.34 / 0.89 | 0.40 / 0.93 | 0.55 / 0.00 |
| **roof** | 0.75 / 0.93 | 0.51 / 0.89 | 0.00 / 0.55 | 0.00 / 0.61 | 0.81 / 0.34 |

### 5.3 Pump, not health

- A single **pump** meter, 0–100, filled by the load your arms carry. It rises
  fast when you hang straight off your arms with feet cutting, slowly when the
  weight is in your feet, and it falls fastest with a hand off on a jug (`X`).
- Above 70 pump, hands judder — and your arms straighten, which **costs you
  reach**: the move you could make a minute ago is now out of range.
- At 100, the grip fails on its own. No health bar, no damage numbers.
- Feet have their own smaller reserve — smearing hard (Space) is not free.

### 5.4 Falling and cams

Free solo, with three **cams**. Cracks appear as seams in the rock; standing at
one and pressing F places a cam, which becomes your catch point. Fall and the
rope catches you there, costing 20 s and one cam. Fall with no cam below you and
the run is over.

The decision is real: place low and safe, or carry them into the crux where the
fall is actually likely.

### 5.5 Weather

A storm is inbound on a timer. As it arrives:

- **Wind** gusts push the hips laterally — the pull vector rotates and slopers
  go first.
- **Rain** wets the rock from the top down; wet holds lose friction, chalk buys
  ~25 s of dryness per use.
- Summit before the wall goes fully wet, or don't summit at all.

## 6. The wall

Procedurally generated 78 m limestone spire, four bands, each with its own
character:

1. **Slab** (0–20 m) — low angle, feet do everything, teaches the weight shift.
2. **Vertical face** (20–42 m) — crimps and pockets, hips-in economy.
3. **The roof** (42–58 m) — overhanging, feet barely help, undercling and
   sidepull sequencing, this is where the cams matter.
4. **Headwall** (58–78 m) — slopers and the summit mantel, in the wind.

**Routes are climbable by construction.** Each line is grown by computing the
stance the previous two holds create and only ever placing the next hold where
that stance can reach it — a rejection sample of the reach sphere, then a
deterministic sweep, and only if the rock genuinely offers nothing does the line
continue as a jump (a generated crux). The generator builds to a 0.85 m reach
while the game allows 1.06 m, and that margin absorbs body sway and pump sag.
Three lines per wall plus scattered holds, so route choice is real. The seed is
shown on the title screen, so a good wall can be replayed.

## 7. Controls

| Input | Action |
|---|---|
| Mouse | aim — nearest hold to the reticle is targeted |
| `Q` / `E` | left / right hand to the targeted hold |
| `W A S D` | shift hips (in / left / out / right) |
| `Space` | press feet — more foot friction, costs leg reserve |
| `Shift` + `Q`/`E` | dyno — both hands leave, must catch. A plain reach is never silently upgraded into a jump. |
| `X` | shake out (recover pump; needs a hand free) |
| `R` | chalk up |
| `F` | place a cam (only at a crack) |
| `C` | scan — pull the camera back to read the route |

## 8. Scoring

Time to summit, minus penalties for falls, plus a **style bonus** for cams left
unused and for a clean flash. Best time per seed is kept in localStorage.

## 9. Non-goals

- No combat, no enemies, no collectibles.
- No inventory beyond chalk and three cams.
- No multiplayer, no backend — this is a static app under `showcase/apps/crux/`.
- No asset files: rock, climber, sky and every sound are generated at load.

## 10. Technical

- Vanilla JS, ES modules, Three.js r163 vendored locally under `vendor/`.
- The hips are a damped point mass driven toward the stance their gripped hands
  imply, with rope constraints from each hand (feet never tether — a foot that
  runs out of leg simply comes off, which is what lets you move past it). Limbs
  are two-bone analytic IK.
- `src/body.js` holds the geometry the climber and the route generator must
  agree on; when those two disagreed about where the hips sit, the generator
  built lines the body could not reach.
- Rock surface is a heightfield over a cylindrical spire, displaced by layered
  value noise, with an overhang band folded in; holds are placed on the surface
  and inherit their ideal pull direction from the local normal.
- Web Audio for wind, breath, chalk, rock scrape, cam placement and the fall.
- Runs offline from `python -m http.server`.
