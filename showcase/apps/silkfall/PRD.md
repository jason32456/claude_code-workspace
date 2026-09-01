# Silkfall — PRD

## 1. One-liner

A 3D orb-weaver survival game: **you build the level, then you hunt in it**. Spin a
web out of simulated silk across a forest gap, then run its strands to reach prey
before it tears free — and before the wasps reach you.

## 2. Why this one

The repo already has thirty-seven projects, ten of them 3D. Every existing 3D game
puts the player *inside* a level someone else authored: hop the lanes (Crossy
Road), drive the city (Joyride), shoot the arena (Overrun), sail the course
(Windward), lap the track (Apex Riders), solve the chamber (Afterimage), defend
the planet (Gravitee).

Silkfall inverts that. The level **is** the player's construction, it is
**physically simulated**, it **degrades under use**, and the player's movement is
**constrained to their own geometry**. Building badly is punished not by a failed
validation check but by a moth ripping a hole through the cheap corner you took.
Nothing else in the repo has that shape — Cantilever builds a structure but you
never inhabit it; Penumbra has physics but no construction.

## 3. Player fantasy

You are small, fragile and patient. Your power is not speed or firepower — it is
**the shape of the trap you laid an hour ago**. A good night is one where the web
does the work and you barely move.

## 4. Core loop

```
      ┌──────────── DUSK: build & repair ────────────┐
      │   spend silk → spin strands, place nodes     │
      └───────────────────┬──────────────────────────┘
                          ▼
      ┌──────────── NIGHT: hunt ─────────────────────┐
      │  prey flies in → snags on sticky silk →      │
      │  struggles, damaging that strand →           │
      │  you run the graph to it → wrap → feed       │
      │  wasps hunt YOU · gusts tear the web         │
      └───────────────────┬──────────────────────────┘
                          ▼
      ┌──────────── DAWN: tally ─────────────────────┐
      │  food → silk · survive 8 nights to win       │
      └──────────────────────────────────────────────┘
```

## 5. Mechanics

### 5.1 The web (the heart of it)

- The web is a **graph**: `nodes` (points in the web plane) joined by `strands`.
- **Anchors** are fixed nodes on the rim (branches, trunk, rock). Free nodes are
  placed by the player and cost silk.
- Every strand is a **verlet rope** of 8 segments, pinned at both ends. It sags
  under gravity, it whips when struck, and the sag is what makes the web read as
  physical rather than as a diagram.
- Two strand types:

  | | Cost/unit | Strength | Catches prey | Walkable |
  |---|---|---|---|---|
  | **Frame** (radial) | 1.0 | 100 | no | yes |
  | **Capture** (sticky) | 1.6 | 55 | yes | yes (slower) |

- **Structural validity**: a node only exists while it has a path back to a rim
  anchor. Cut the strand that holds a limb and the whole limb falls — nodes,
  strands, and any prey stuck to it.
- **Damage & snapping**: struggling prey, wasp bites and wind gusts subtract
  integrity. A strand at 0 snaps, plays a pluck, and its dependent subtree falls.

### 5.2 Movement — you can only go where you built

- The spider's position is `(strandIndex, t)`. WASD/arrows give a direction
  vector; the spider walks the current strand and, at each node, **switches to the
  incident strand best aligned with the input**. It never leaves the silk.
- **Dragline** (`Space`): drop straight down on a fresh temporary strand. Costs a
  little silk, lets you cross a gap you never built across, and — critically —
  dodges a wasp on approach. Release to climb back.
- Consequence: a web with pretty capture spirals but no radial highways is a web
  you cannot patrol. Traversal is a design constraint, not a movement system.

### 5.3 Prey

| Species | Behaviour | Struggle | Reward |
|---|---|---|---|
| **Midge** | drifts, slow | weak | 4 |
| **Moth** | erratic, fast | medium | 9 |
| **Beetle** | heavy, straight line | violent, tears frames | 18 |
| **Wasp** | ignores the web, hunts the *spider* | — | 25 if wrapped |

- Prey that touches a **capture** strand snags with probability from strand
  stickiness × species. Frame strands are brushed aside.
- A snagged insect **struggles**: it drags the local verlet points (visible
  thrashing), damages its strand, and emits a **vibration pulse** that travels the
  graph — a widening ring of brightened silk. That is the player's sense organ.
- Struggle has a timer. Reach it in time and wrap; too slow and it tears free,
  taking the strand with it.
- **Wrap**: hold `E` near a snagged insect. Wrapping stops the damage and banks
  the prey. **Feed** on a wrapped bundle to convert it to silk + score.

### 5.4 Threats & pressure

- **Wasps** track the spider along the web, sting on contact (health), and cut
  strands they land on. Dropping a dragline as one commits is the counterplay.
- **Gusts**: telegraphed by a wind indicator, then a directional force that
  damages long unsupported strands. Long spans are cheap and fragile; short
  triangulated spans are expensive and durable. That is the whole build tension.
- **Hunger**: each night demands a food quota. Missing it costs health.
- 8 nights, each with more prey, more wasps, stronger gusts.

### 5.5 Economy

- Silk is the single currency: it builds strands, places nodes, and pays for
  draglines. Food is the only source. Wrapped prey left uneaten at dawn is lost.
- This makes overbuilding on night 1 a real mistake and a bare frame a real risk.

## 6. Controls

| Input | Action |
|---|---|
| `WASD` / arrows | walk the silk |
| `Space` (hold) | dragline down / release to climb |
| `E` (hold) | wrap snagged prey · feed on a bundle |
| `B` | toggle build mode |
| Mouse (build) | click node → click node/empty space to spin |
| `Q` | toggle frame / capture silk |
| Right-drag | orbit camera |
| `Enter` | end dusk early, start the night |
| `P` | pause |

Touch: on-screen stick + action buttons, tap-to-build.

## 7. Presentation

- **Three.js**, vendored locally, no CDN, no build step.
- Night forest: deep indigo fog, a cold moon rim-light, silhouetted trunks in
  parallax layers, drifting spores.
- The web is drawn as `LineSegments` rebuilt from the verlet points each frame —
  moonlit silk, brighter where taut, dimmed where damaged, with dew beads on
  capture strands that catch the light.
- Vibration pulses render as a travelling brightness along the graph.
- All audio synthesised at runtime (Web Audio): silk plucks pitched by strand
  length and tension, wing buzz, wasp drone, wind.

## 8. Scope

**In:** full night cycle, build mode, verlet web with structural collapse, four
species, wasps, gusts, hunger, 8-night campaign, win/lose, tutorial night, local
best score, desktop + touch.

**Out (deliberately):** multiplayer, persistence beyond `localStorage`, procedural
biomes, an upgrade tree. The mechanics carry it; content breadth does not.

## 9. Success criteria

1. A first-time player builds a web without reading instructions and catches
   something within ninety seconds.
2. Losing feels like a **build** mistake, not a reflex mistake.
3. Two different players' webs look visibly different.
4. 60 fps at 1440×900 with ~80 strands and ~20 insects.
5. Runs from `python -m http.server` with no network access.
