# NIGHTSIDE — Product Requirements Document

**Version** 1.0 · **Status** Implemented · **Type** Browser game (desktop, WebGL2)

---

## 1. One-liner

A tower defense fought on a **rotating planet**, where your weapons run on
sunlight — and the enemy only ever lands in the dark.

## 2. Why this game

Every 3D project already in this repo is an action game that hands you direct,
moment-to-moment control of a single body moving through the world:

| Project | Genre | You control |
|---|---|---|
| `crossy-road` | endless hopper | one chicken, discrete hops |
| `joyride` | open-world sandbox | one car / one avatar |
| `overrun` | FPS horde shooter | one gun, first person |
| `apex-riders` | arcade racer | one motorcycle |
| `snake-3d` | arcade | one snake, turn only |
| `afterimage` | puzzle-platformer | one body (+ its ghosts) |
| `windward` | sailing sim | one boat, rudder + sheet |

Nightside is the first **strategy** game in the repo: you never control a body
at all. You place structures, manage two economies, and read a battlefield that
is a *closed surface* rather than a plane. Three consequences make that more
than a reskin of flat tower defense:

1. **A sphere has no back row.** On a flat map, threat comes from a known edge
   and defense is a wall across it. On a globe every tile is a frontier, the
   horizon hides half the battlefield from you at all times, and turning the
   camera to look at one hemisphere means going blind on the other.
2. **The map moves the resource.** The sun is fixed; the planet turns under it.
   Solar output is `max(0, n̂ · ŝ)` per tile, so half of your power grid is
   always offline and *which* half changes continuously. A turret farm that was
   fully fed ninety seconds ago is now sitting in the dark on stored charge.
3. **The enemy exploits that directly.** Drop pods target the night side. The
   fight and the blackout arrive at the same place at the same time, by design,
   which turns "where do I build" into a question about *time* as well as space.

Nothing in the repo is built on a spherical grid, a flow field, or an economy
that oscillates with the world's rotation.

## 3. Core loop

```
   ┌──────────────────────────────────────────────────────────────┐
   │  Read the terminator → which of my defenses are about to     │
   │                        lose the sun?                         │
   │  Spend the build gap → solar & capacitors where the light    │
   │                        will be, guns where the dark will be  │
   │  Call the wave       → early, for an alloy bonus             │
   │  Fight               → rotate the globe, watch the power bar │
   │                        sag, plug leaks with mortars          │
   │  Bank the salvage    → upgrade, sell, re-site                │
   └──────────────────────────────────────────────────────────────┘
                       ↓  12 waves
              survive → the Blight burns off at dawn
```

## 4. World

### 4.1 The grid

The planet is a **Goldberg polyhedron** — the dual of a 3× subdivided
icosahedron. That yields **642 tiles**: 12 pentagons (at the icosahedral
vertices) and 630 hexagons, each with an exact neighbour list and a shared
edge, so it behaves like a hex grid that happens to close on itself.

Generation:

1. Icosahedron → 3 rounds of edge-midpoint subdivision with a midpoint cache,
   every new vertex re-projected to the unit sphere.
2. Each original vertex becomes one **tile**; its polygon corners are the
   centroids of the faces incident to it, sorted by angle around the tile's
   normal.
3. Two tiles are neighbours iff their source vertices shared an edge.

### 4.2 Terrain

3D value-noise (3 octaves, seeded per run) over the tile centres gives an
elevation field, thresholded into four classes:

| Class | Buildable | Passable | Look |
|---|---|---|---|
| `PLAIN` | ✅ | ✅ | dusty ochre, flat at `R` |
| `RIDGE` | ❌ | ❌ | grey rock, extruded to `1.05R` with a crag |
| `BASIN` | ❌ | ❌ | dark water, recessed to `0.985R` |
| `ORE` | ✅ (Extractor only) | ✅ | ochre with a glowing ferrite seam |

After classification the largest connected walkable component is kept and any
orphan pocket is demoted to `BASIN`, which guarantees every spawn can reach a
vent and makes "is there a path" a question about walls only.

### 4.3 Core vents

Three **Core Vents** are placed by farthest-point sampling over the walkable
component, so they are spread across the globe and cannot all be covered by one
defensive cluster. They are the enemy's objective and the player's life total.

### 4.4 Day and night

The planet does not spin — the **sun sweeps**, which keeps the camera stable
relative to the terrain while still producing a moving terminator.

```
sunDir(t) = rotateAboutAxis(baseDir, planetAxis, 2π · t / DAY_LENGTH)
DAY_LENGTH = 120 s          planetAxis tilted 18° off vertical
```

Per-tile insolation is `max(0, n̂ · ŝ)`, used for both solar yield and the
day-side tint on the terrain shading.

## 5. Economy

Two resources, deliberately different in character:

**Alloy (AL)** — the build currency. Flows from Extractors (ore tiles only) and
from kill salvage. Steady, spatially constrained, spent in lumps.

**Power (PW)** — the *combat* resource. Produced only by Solar Arrays in
sunlight, stored only by Capacitors, drained by turrets while they engage.
Volatile, global, spent continuously.

```
production(t) = Σ_solar  YIELD · max(0, n̂ᵢ · ŝ(t)) · (1 + 0.22 · adjacentArrays)
draw(t)       = Σ_turret  idle + (firing ? burst : 0)
charge(t+dt)  = clamp(charge + (production − draw)·dt, 0, Σ_capacitor CAP)
```

The adjacency term is load-bearing, and it was added after playtesting proved
the premise didn't work without it. With flat per-array yield, the optimal
layout is to scatter arrays evenly over the globe — at which point half of them
are always lit, total production is *constant*, and the day/night cycle stops
mattering at all. A 12-wave instrumented run confirmed it: the grid never once
browned out. Paying 22% per touching neighbour makes a solar farm a **place**
that the terminator can leave, and turns layout into the real decision:

| Layout | Peak output | Behaviour |
|---|---|---|
| One tight farm | highest | swings to near zero every night — needs deep storage |
| Scattered singles | lowest | almost flat, survives on no capacitors |
| Two opposed farms | middle | one is always earning; costs twice the tiles |

When `draw > production` and `charge == 0`, the grid **browns out**: every
powered turret's rate of fire scales by `production / draw` instead of failing
outright, so the failure mode is a visible, recoverable sag rather than a
cliff. The HUD power bar turns amber, then red.

## 6. Buildings

| # | Name | Cost | Power | Role |
|---|---|---|---|---|
| 1 | **Solar Array** | 20 AL | +6 PW/s × sun × links | The whole grid depends on it, and it does nothing at night |
| 2 | **Capacitor** | 25 AL | +160 PW store | Moves daylight into the night side |
| 3 | **Extractor** | 30 AL | −0.5 PW/s | +1.1 AL/s · ore tiles only |
| 4 | **Laser Battery** | 35 AL | −8 PW/s firing | Single target, hitscan, hits flyers, halved by armour |
| 5 | **Arc Node** | 55 AL | −18 PW/s firing | Chains to 3 targets, hits flyers, melts swarms, power hungry |
| 6 | **Mortar Pit** | 50 AL | none | Splash, ignores armour, **cannot hit flyers**, works in a blackout |
| 7 | **Bulwark** | 8 AL | none | Impassable to walkers, ignored by flyers |

The Mortar is the design's pressure valve: it is the only weapon that works
with a dead grid, and it is the only weapon that cannot touch a Drifter — so a
mortar-only night side loses to flyers and a laser-only night side loses to a
blackout.

**Upgrades** cost `0.8 × base` per level to level 3, multiplying damage/yield by
`1.5×` per level. **Selling** refunds 60%.

Placement is rejected if it would fully seal every route to a vent — the flow
field is recomputed against the hypothetical wall before the spend is committed.

## 7. The Blight

Pods fall from orbit onto the **night side** (insolation < 0.08), inside a
flow-field distance band of 5–21 from a vent, and biased toward tiles far from
existing turrets — so the drop always searches for the gap you left, and the
walk from the crater is a fight rather than a commute. A pod telegraphs its
landing tile for 3.2 s, on the globe and on the minimap, before it cracks open
into:

| Unit | HP | Speed | Behaviour |
|---|---|---|---|
| **Crawler** | 30 | 1.00 | Walks the flow field to the nearest vent |
| **Husk** | 110 | 0.62 | Armoured — halves laser/arc damage, full mortar damage |
| **Drifter** | 45 | 1.25 | **Flies** a great circle to the vent; ignores walls and mortars |
| **Spitter** | 60 | 0.80 | Stops at range and destroys buildings instead of advancing |
| **Leviathan** | 2600 | 0.42 | Wave 12 boss. Armoured, spawns Crawlers as it walks |

Walkers move by **flow field**, not per-unit A*: a multi-source Dijkstra from
all three vents produces a next-hop for every tile in one `O(N log N)` pass,
recomputed only when a wall changes. Units then just walk downhill, so unit
count is decoupled from pathfinding cost.

Reaching a vent costs core integrity (2–25 by unit) and consumes the unit.
Integrity 0 → run over.

## 8. Waves

12 waves of rising size and mix, with a build gap between each. Calling a wave
early banks the unspent gap as alloy (`2 AL/s`), which gives a confident player
a compounding lead and a real reason to feel ready.

## 9. Interface

- **Orbit camera** — drag to rotate the globe, wheel to zoom, tile picking by
  raycast against the tile mesh with a per-tile face lookup.
- **Hover ring** on the tile under the cursor: green if the current build is
  legal there, red with a reason if not.
- **Build bar** (1–7) with live affordability, plus **sell/upgrade** on the
  selected structure.
- **Equirectangular minimap** — the whole surface at once, with the shaded
  night band, vents, structures and live enemy dots. This is the answer to
  "half the battlefield is behind the planet": you are never blind, but you do
  have to look at two places at once.
- **Power bar** showing charge, production and draw; **integrity bar**; wave
  counter and next-wave timer.
- Procedural WebAudio SFX only — no audio files.

## 10. Non-goals

- No multiplayer, no persistence beyond a localStorage best-wave.
- No mobile/touch control scheme.
- No build step, no npm install, no CDN at runtime: Three.js r163 is vendored
  into the folder, so the game runs from any static file server, offline.
