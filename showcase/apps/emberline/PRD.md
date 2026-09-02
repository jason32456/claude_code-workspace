# EMBERLINE — Product Requirements Document

**Version** 1.0 · **Status** Implemented · **Type** Browser game (desktop, WebGL2)

---

## 1. One-liner

An aerial-firefighting game where **retardant never puts a fire out**. The red
slurry you drop only makes ground *unburnable*, so the whole game is spent
predicting where a wind- and slope-driven fire is going to run, and painting a
line across that ground before it gets there.

## 2. Why this game

The repo already holds thirteen 3D projects, and every one of them is a game
about controlling your own body through space:

| Project | What you are | Core verb |
|---|---|---|
| `crossy-road` | a chicken | hop |
| `joyride` | a driver | drive |
| `overrun` | a soldier | shoot |
| `apex-riders` | a rider | lean |
| `snake-3d` | a snake | turn |
| `afterimage` | a puzzle body | rewind |
| `gnomon` | a silhouette | jump on shadows |
| `windward` | a sailor | trim |
| `kessler` | an astronaut | tether |
| `silkfall` | a spider | spin web |
| `sonar` | a diver | listen |
| `gravitee` | a golfer | swing |
| `nightside` | a commander | place towers |

Emberline's opponent is not a level, an AI or a clock — it is a **spreading
process**. The fire is a cellular simulation with fuel, moisture, slope and wind
inputs, and it is completely indifferent to the player. There is no way to
attack it directly at scale; a full load of retardant dumped into the middle of
a running crown fire accomplishes almost nothing. The only winning move is the
firefighter's real one: get *ahead* of it, on ground it has not reached, and take
the fuel away.

That inversion is the whole design. Every other game in the repo rewards
reaction. This one punishes it — by the time you can see that a flank has turned
into a head, you have already lost the two minutes you needed to build the line.

## 3. Design pillars

1. **Indirect attack beats direct attack.** Retardant on unburnt fuel is
   permanent, cheap and decisive. Retardant on flame is a temporary knockdown
   that costs the same load. Both are available; only one scales.
2. **The fire is legible.** Everything driving it is on screen: wind arrow and
   speed, slope shading, fuel colour, a forecast of the next wind shift. A
   player who loses a town should be able to say exactly which decision did it.
3. **Altitude is the risk dial.** A drop from 30 m lays a dense, narrow, fully
   effective line. A drop from 120 m lays a wide, thin, half-effective smear.
   Below 15 m over terrain you are dead. Every good line is flown low.
4. **The map is finite.** The fire cannot be fought everywhere. Choosing which
   flank to abandon is the strategic act.

## 4. The simulation

### 4.1 Grid

A 160 × 160 cell grid over 1600 m × 1600 m — one cell is 10 m. Per cell:

| Field | Type | Meaning |
|---|---|---|
| `fuel` | f32 0–1 | how much there is to burn; set by fuel model |
| `model` | u8 | 0 rock/road · 1 grass · 2 brush · 3 timber · 4 water |
| `moist` | f32 0–1 | resists ignition; higher near water and on north aspects |
| `state` | u8 | 0 unburnt · 1 burning · 2 burnt |
| `heat` | f32 | accumulated pre-heating; ignition at ≥ 1 |
| `slurry` | f32 0–1 | retardant coverage; permanent for the length of a mission |
| `burn` | f32 | seconds of burning left, from fuel model |

### 4.2 Spread

Fixed 8 Hz simulation tick. Every burning cell pushes heat into its eight
neighbours:

```
heat += dt · RATE · fuel(n) · windFactor · slopeFactor · (1 − moist(n)) · intensity
windFactor  = exp(WIND_K · windSpeed · cos θ)     θ = angle(neighbour dir, wind)
slopeFactor = exp(SLOPE_K · max(0, Δheight / cellSize))
```

Both factors are exponential, which is what makes a fire that is drifting at
walking pace across a flat meadow turn into a 40 m/s run the moment it finds an
aligned draw. Ignition needs `heat ≥ 1 + 24 · slurry`, so a fully covered cell
needs twenty-five times the pre-heating — in practice, never.

### 4.3 Spotting

A burning timber cell under wind ≥ 8 m/s can loft an ember. Embers are drawn as
real arcing particles, land 60–260 m downwind and ignite what they land on. They
jump lines. They are the reason a "contained" fire is not a finished fire, and
they are the mechanic that keeps the last ninety seconds of a mission tense.

### 4.4 Extinction

There is no timer and no wave counter. The mission ends when the last burning
cell burns out, which happens only when the fire is surrounded by ground it
cannot cross: retardant, water, rock, or ground it has already burnt.
Containment % is measured as the fraction of the live fire perimeter that is
already blocked, so it is an honest progress bar rather than a score.

## 5. The aircraft

A scooper tanker, modelled arcade-style rather than as a flight sim.

| Input | Effect |
|---|---|
| `W` / `S` | nose up / nose down |
| `A` / `D` | roll; the aircraft turns by banking, so a hard turn loses altitude |
| `Shift` / `Ctrl` | throttle 42–92 m/s |
| `Space` | drop retardant (held) — or scoop, when low and slow over the lake |
| `C` | camera: chase / cockpit / tower |
| `M` | hold for the tactical overhead |
| `R` | restart mission |

**Load** is 6000 L, spent at 1150 L/s of continuous drop — five seconds of line
per sortie, roughly 350 m of ground at cruise, and it can be split across
several passes. **Scooping** refills at 3000 L/s and requires flying under 40 m
over the lake at under 62 m/s, which is itself a small landing-shaped skill
test.

**Ground proximity** gives an audible GPWS warning under 40 m and kills the
mission under 12 m. The player will spend the entire game at 25–60 m.

## 6. Scoring

| Metric | Meaning |
|---|---|
| Structures saved | the only hard requirement; below the mission threshold is a loss |
| Acres burned | the soft score — every hectare the fire takes is a hectare you did not cut off |
| Drops used | efficiency; a perfect indirect line uses far fewer loads than a knife-fight |
| Time to containment | tiebreaker |

Graded S / A / B / C / D on a weighted combination, stored per mission in
`localStorage`.

## 7. Missions

| # | Name | Fuel | Wind | Structures | Teaches |
|---|---|---|---|---|---|
| 1 | **First Light** | grass and brush valley | 6 m/s, steady | 4 cabins | that a line ahead of the fire works and a line on it does not |
| 2 | **Ridge Run** | mixed timber on a steep face | 11 m/s, shifts once | 9 cabins | slope-driven runs, and that a flank becomes a head when the wind turns |
| 3 | **Emberline** | heavy timber, two ignitions | 15 m/s, gusting, shifts twice | 22-building town | spotting: your line will be jumped, and you must choose which side to defend |

## 8. Presentation

- **No asset files at all.** Terrain, trees, flame, smoke and embers are
  generated at load; every sound is synthesised with the Web Audio API.
- Dusk lighting with orange fog, so flame fronts read as light sources and the
  smoke column is visible from anywhere on the map.
- Burnt ground is written back into terrain vertex colours as it burns, so the
  scar is permanent and legible from altitude — the map is its own record of the
  match.
- Retardant is Phos-Chek red on purpose. The single most important thing on the
  screen is where your lines are.

## 9. Non-goals

- Multiplayer, persistence beyond high scores, or a mission editor.
- A real flight model. Stalls, yaw and engine management are out; the game is
  about where you point the aeroplane, not about flying it.
- Ground crews, helicopters or a resource economy. One aircraft, one lake.

## 10. Acceptance

- [x] Runs from `showcase/apps/emberline/` over plain HTTP with no build step.
- [x] No network requests, no CDN, no asset files.
- [x] 60 fps at 1440 × 900 with a full-map fire running.
- [x] A fire left alone burns the entire map; a competently flown mission stops
      it; the difference is visible in the terrain scar afterwards.
