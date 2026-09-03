# Vesper — Product Requirements Document

**One line:** A 3D dusk-flight game where you are not a bird in the flock — you *are*
the flock, and the flock is both your body and your health bar.

---

## 1. Why this, and why it is not anything else in the collection

The repo already has eighteen 3D projects. Every one of them gives you a single
rigid avatar: a crane trolley (Plumbline), a climber (Crux), an aircraft
(Emberline, Leyden), a hopper, a rider, a shooter. Vesper's avatar is a cloud of
600–1200 independently simulated starlings. There is no player object in the
scene at all — the "character" is an emergent property of a boid simulation, and
every stat the game tracks is a statistic *of a population*: how many birds are
left, how tightly they are packed, how many have drifted far enough from the mass
to be worth a falcon's attention.

That single inversion is the whole design. It means:

- **Health is mass.** Birds are the only resource. Lose them to falcons, wires and
  the dark; gain them by recruiting wild flocks. There is no health bar, because
  the flock *is* the health bar and you are looking straight at it.
- **Defence is a shape, not a button.** The real counter to a peregrine is the
  confusion effect — a predator's strike success collapses as local prey density
  rises. So the defensive state in Vesper is *density*, a continuous quantity you
  hold, and it costs you speed to hold it.
- **The best move in the game is a shape change made on one frame.** Flash
  expansion: the murmuration blows apart the instant the falcon commits, and
  re-forms behind it. Too early and the falcon simply re-locks on the stragglers
  the expansion just created. That is the skill ceiling.

Nothing here is a reskin of an existing project's loop. Emberline steers a
diffuse system you fight; Vesper *is* the diffuse system.

## 2. Player fantasy

Dusk over a river valley in late autumn. You have twenty minutes of usable light
and a roost of flooded reeds somewhere downwind. You want to arrive at it fat —
thousands strong, having swept up every wild flock between here and there — and
there is a peregrine above you that wants the opposite.

## 3. Core loop

```
     fly toward the roost
            │
   ┌────────┼──────────────┐
   │        │              │
 recruit  feed          survive
 (wild    (insect       (falcons,
  flocks)  swarms)       wires, dark)
   │        │              │
   └────────┴──────────────┘
            │
     roost before dark → score = birds delivered
```

A night is one continuous flight of 3–6 minutes down a valley corridor. Score is
the number of birds that make it into the reedbed, so a run that plays it safe and
arrives small scores worse than a greedy run that survives.

## 4. Systems

### 4.1 Flock simulation (the centrepiece)

Standard Reynolds boids with the three classic rules, plus five game rules,
solved over a uniform spatial hash so it stays O(n) at 1200 birds:

| Force | Purpose | Notes |
|---|---|---|
| Separation | keeps birds off each other | radius shrinks as `density` rises — this is what lets the flock physically compact |
| Alignment | shared heading | gives the murmuration its silk-sheet look |
| Cohesion | pull to local centre of mass | local, not global — global cohesion looks like a sphere, local looks alive |
| **Lead attraction** | the player's steering | birds seek a virtual lead point 30 m ahead of the flock centroid; the player rotates that point, never the birds |
| **Predator avoidance** | inverse-square repulsion from each falcon | strong, and it fights the lead force — a diving falcon *shreds* your formation whether or not it kills |
| **Flash expansion** | the panic verb | a one-shot radial impulse, decaying over ~0.9 s |
| **Fatigue** | why the flock frays | per-bird stamina; a tired bird's lead-seeking weight drops, so it slides backwards out of the mass |
| **Terrain / obstacle avoidance** | wires and ground | birds that fail it die individually |

Every bird carries: position, velocity, stamina, wing phase, and an `exposure`
scalar (its distance from the centroid, normalised). Exposure is the game's most
important derived quantity — see falcons.

### 4.2 Density (hold Shift)

One continuous player-held state from 0 (loose sheet, ~55 m across) to 1 (the
"black sun", ~14 m across).

| | loose | tight |
|---|---|---|
| Cruise speed | 100% | 62% |
| Turn rate | fast, sloppy | slower, but the whole mass turns together |
| Confusion (falcon miss chance) | ~15% | ~78% |
| Stragglers created per hard turn | many | almost none |
| Stamina burn | baseline | 1.7× |

So density is never free and never a strict upgrade: holding the black sun the
whole night means arriving after dark, which costs more birds than the falcon
would have taken.

### 4.3 Falcons

A peregrine is a small state machine, and its states are all readable from the
air so the player can play against them:

1. **PATROL** — wide circles above and behind the flock, picking a target.
   Target choice is weighted by `exposure³`, so stragglers are overwhelmingly
   preferred. This is what makes fatigue lethal.
2. **CLIMB** — gains 120 m of pitch. Audible: a rising cry. This is the tell.
3. **LOCK** — holds position, computes an intercept on the target's projected
   path. HUD shows a bearing arc, not a marker: you get the direction, not the
   solution.
4. **STOOP** — commits. 55 m/s straight down the intercept line, ~1.3 s. It
   cannot retarget below 40 m of separation. **The 0.55 s before contact is the
   flash-expansion window.**
5. **STRIKE** — resolved as `P(kill) = base × (1 − confusion) × (0.35 + exposure)`.
   A hit costs one bird, panics the flock (forced spread + stamina hit), and
   feeds the falcon, which then leaves for 25 s. A miss costs the falcon 12 s of
   recovery climb.
6. **RECOVER** — climbs back to patrol.

Two falcons hunting the same flock coordinate loosely: the second prefers the
side of the flock the first is not on, which is what turns night three into a
genuine pincer problem.

### 4.4 Attrition that is not a falcon

- **Wires and turbines.** Transmission lines strung between pylons are nearly
  invisible against a dusk sky at distance and are resolved per-bird: fly the
  mass through a span and you lose the slice of birds that intersected it. A
  tight flock through wires is a massacre; this is the one hazard density makes
  *worse*, which keeps Shift from being a default.
- **The dark.** Light falls on a fixed curve over the night. Below 15%
  illumination birds begin to lose the flock outright at a rising rate. The clock
  is the real antagonist.
- **Stamina.** Fast flight and high density burn it; thermals and feeding restore
  it. Exhausted birds trail, and trailing birds are what falcons eat.

### 4.5 Growth

- **Wild flocks** (60–250 birds) circle over fields. Pass through slowly and
  coherently and they join over ~2 s; barrel through at speed and they scatter
  and are lost. Deliberately, the recruit is easiest in exactly the loose, slow
  configuration that is most dangerous with a falcon overhead.
- **Insect swarms** — midge columns over water. Fly through to restore stamina.
- **Thermals** — rising columns, visible as dust/mist spirals; free altitude and
  stamina, but they are fixed in space so using them costs you heading.

### 4.6 The roost

The valley ends in a flooded reedbed. Arriving triggers the descent: the flock
spirals down in the real starling manner and pours into the reeds, counted as it
goes. Score = birds roosted, star-rated against thresholds per night.

## 5. Nights (levels)

| # | Name | Introduces | Falcons | Length |
|---|---|---|---|---|
| 1 | **Low Sun** | steering, density, recruiting | 1, timid | ~3 min |
| 2 | **The Span** | pylons, wires, turbines, crosswind | 2 | ~4 min |
| 3 | **Black Sun** | pincer falcons, fast dusk, big roost | 3 | ~5 min |

## 6. Controls

| Input | Action |
|---|---|
| `W`/`S` or `↑`/`↓` | pitch the lead point (climb / dive) |
| `A`/`D` or `←`/`→` | bank the flock |
| `Shift` (hold) | tighten — density up |
| `Space` | **flash expansion** |
| `Mouse` (optional) | steer, if pointer is locked |
| `P` / `Esc` | pause |

## 7. Presentation

- **No asset files.** Terrain, birds, sky, water and every sound are generated at
  load, matching the rest of the collection.
- Birds render as a single `InstancedMesh` with a custom vertex shader; wing flap
  is a per-instance phase evaluated on the GPU, so 1200 birds cost one draw call.
- Dusk is a real gradient: sky, fog, sun elevation and bird tint are all driven by
  the same normalised `light` value that the survival rule reads, so the danger is
  legible as colour.
- Audio: synthesised wingbeat noise scaled by flock size and proximity, alarm
  chirps on a strike, wind, peregrine cries as the predator tell.

## 8. Performance targets

- 60 fps at 1200 birds on integrated graphics.
- Boid step ≤ 4 ms/frame (spatial hash, neighbour cap of 24, squared-distance
  comparisons only, zero allocation in the hot loop).
- Single draw call for the flock; instanced pylons and reeds.

## 9. Success criteria

1. A first-time player understands "the flock is me" without being told.
2. Losing birds *reads* — you can see the mass thin.
3. A well-timed flash expansion feels like a parry.
4. Density is used situationally, not held constantly, by a good player.
5. The full three nights are completable in about fifteen minutes.

## 10. Explicit non-goals

- No combat. The flock has no attack and never will.
- No upgrade tree or currency. The flock size is the progression.
- No multiplayer, no backend — this stays a static app under `showcase/apps/`.
