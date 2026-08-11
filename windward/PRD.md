# WINDWARD — Product Requirements Document

**Version** 1.0 · **Status** Implemented · **Type** Browser game (desktop, WebGL2)

---

## 1. One-liner

A 3D sailing regatta where **there is no throttle**. You steer and you trim — the
wind decides how fast you go, and it refuses to let you sail straight at the
thing you are trying to reach.

## 2. Why this game

The repo already holds six 3D projects and every one of them hands you direct
control of your own velocity:

| Project | Control model |
|---|---|
| `crossy-road` | discrete hop |
| `joyride` | throttle + steering |
| `overrun` | WASD walk + aim |
| `apex-riders` | throttle + lean |
| `snake-3d` | constant speed, turn only |
| `afterimage` | walk + jump (puzzle) |

Windward removes the throttle entirely. Your inputs are a **rudder** and a
**sheet**, and between them and your velocity sits an aerodynamic model that can
refuse to cooperate. The two consequences that make it a *game* rather than a
simulator:

1. **You cannot sail where you are pointing.** A 36° cone dead upwind produces
   no useful drive. If the mark is upwind, the fastest route is a zig-zag, and
   choosing *when* to flip tacks is the whole tactical layer.
2. **The wind is not uniform.** Gusts drift across the course as visible dark
   patches. Sailing into one is a 40% speed boost. Reading the water is a skill
   that pays out immediately and visibly.

Nothing in the repo is built on "the environment is the engine".

## 3. Core loop

```
   ┌────────────────────────────────────────────────────────────┐
   │  Read the water   → where is the next gust, which way is   │
   │                     the wind shifting?                     │
   │  Pick a tack      → you cannot point at the mark, so pick  │
   │                     the side of the course that pays       │
   │  Trim the sail    → hold the angle of attack in the band   │
   │  Surf the swell   → bear away down a wave face for a surge │
   │  Round the mark   → new leg, new point of sail, re-trim    │
   └────────────────────────────────────────────────────────────┘
                    ↓ 3 laps of the course
                     FINISH · time vs. rivals · personal best
```

## 4. Mechanics

### 4.1 The sailing model (the core system)

Every boat — player and AI — is stepped through the identical pure function in
`js/sailing.js`. No AI cheating, no rubber-banding.

**Apparent wind.** The wind the sail actually feels is the true wind minus the
boat's own velocity: `AW = TW − V`. Accelerating changes the wind you feel,
which changes your drive — a genuine feedback loop, and the reason a boat can
sail faster than the wind on a reach.

**Angle of attack.** `α = |AWA| − trim`, where `AWA` is the apparent wind angle
off the bow and `trim` is the boom angle you set with `W`/`S`.

| α | Behaviour |
|---|---|
| ≤ 0° | Sail luffs — flogging canvas, *negative* drive, audible flutter |
| 0…20° | Lift builds to maximum at **α = 20°** |
| 20…90° | Post-stall decay; lift → 0, drag → max |

So the optimal trim is always `|AWA| − 20°`, which means every course change
demands a re-trim. The HUD shows a green band; nailing it is worth ~25% speed.

The boom cannot be sheeted past the centreline, and even hard in the sail
stands at ~9°. That floor is what creates the no-go zone: point too high and
`α` goes negative, the sail flogs, and flogging canvas is a **parachute**, not
a wing. Nothing about the cone is scripted — it falls out of the same equations
that make a beam reach fast.

**Lift and drag** are resolved in the horizontal plane, then decomposed onto the
hull axes:

- **Drive** (forward component) → acceleration, opposed by quadratic hull drag
  with a hard wave-making penalty near hull speed.
- **Side force** (lateral component) → heel, and a small amount of **leeway**
  (the keel resists but does not eliminate sideways slip), so your track is
  never quite your heading.

**Points of sail** fall out of the model rather than being special-cased:

Measured from the shipped model in 8.2 m/s of true wind, sailing at optimal
trim (speeds in m/s, unhiked):

| True wind angle | Speed | VMG | |
|---|---|---|---|
| 0° | −3.7 | — | blown astern, sail flogging |
| 20° | 2.3 | 2.0 | pinching, badly stalled |
| **44°** | **6.9** | **4.6** | **best upwind VMG — the beating angle** |
| 90° | 9.4 | — | beam reach |
| **110°** | **9.5** | — | **fastest point of sail — above wind speed** |
| **132°** | **8.5** | **5.7** | **best downwind VMG — the gybing angle** |
| 180° | 5.0 | 5.0 | dead run, drag only |

Two facts fall out of this table and both are load-bearing for the game: the
boat sails **faster than the wind** on a reach, and a dead run is **40% slower**
than a broad reach — so downwind you gybe in a zig-zag for the same reason you
tack upwind.

### 4.2 Heel and hiking

Side force heels the boat — 30–38° upwind when overpowered. Past 20° the rig
starts spilling wind and drive falls off. Holding **Space** hikes the crew out to windward, cancelling heel and
recovering ~0.6 m/s — but it drains a stamina bar that only refills when
you sit back in. Gusts are therefore both a gift and a test.

### 4.3 Wind field

| Component | Behaviour |
|---|---|
| Base | Constant direction and strength per race |
| Oscillation | Slow ±8° sinusoidal shift with two periods beating against each other — the mark you were laying is no longer the mark you are laying |
| Gusts | 6–9 drifting cells, 1.25–1.6× strength with a veer/back bias, rendered on the water as darkened ruffled patches |
| Lulls | Same system with strength < 1, rendered lighter and glassier |

Gust cells are pushed to the ocean shader as uniforms, so what you see on the
water is *exactly* the field the physics samples. There is no cosmetic weather.

### 4.4 Waves

A 4-component Gerstner sum, evaluated identically on GPU (vertex shader) and CPU
(buoyancy + slope). The boat pitches and rolls with the surface it is actually
sitting on, and the **downslope component of gravity** feeds back into drive —
bearing away down a wave face gives a real surge, which is how you squeeze speed
out of a run where the sail alone is weak.

### 4.5 The course

Classic windward-leeward-with-a-reach triangle, laid out relative to the wind so
every lap forces every point of sail:

```
                        ▲ WIND
                    ┌─ MARK 1 ─┐          beat: upwind, must tack
                    │           ╲
                    │            MARK 2   reach: fastest leg
                    │           ╱
                    └─ MARK 3 ─┘          run: downwind, must gybe
                        START/FINISH
```

- 3 laps, about 4½–5 minutes. Marks must be passed inside a 20 m rounding
  radius, in order.
- Hitting a buoy (< 3.5 m) costs a 2 s drag penalty and flashes the HUD.
- 3 AI rivals with distinct skill profiles (trim accuracy, gust-seeking radius,
  tack timing, layline discipline).

### 4.6 AI

Rivals run a layline helm: when the mark is inside the no-go cone they sail the
optimal upwind angle (44°) on whichever tack reduces cross-track error, and
bear away for the mark the moment they cross its layline. Downwind they run the optimal broad-reach angle (132°) and gybe on the same
logic. Skill is expressed as noise on trim, layline overshoot, tack
execution loss, and how far off-track they will detour for a gust.

## 5. Controls

| Key | Action |
|---|---|
| `A` / `D` or `←` `→` | Rudder |
| `W` / `S` or `↑` `↓` | Trim sail in / ease out |
| `Space` (hold) | Hike out — kills heel, costs stamina |
| `T` | Auto-trim assist on/off |
| `C` | Cycle camera (chase / cockpit / orbit) |
| `R` | Restart race |
| `Esc` | Pause |

## 6. HUD

- **Wind compass** — true wind arrow, boat heading, and a shaded no-go cone that
  rotates as the wind shifts. The single most important instrument.
- **Trim dial** — current boom angle with the optimal green band, plus a `LUFF`
  warning when α ≤ 0.
- **Speed / heel / stamina** readouts.
- **Course minimap** — marks, next-mark highlight, all four boats, gust cells.
- **Race panel** — lap, position, elapsed, best lap, personal best (localStorage).

## 7. Technical requirements

| Area | Decision |
|---|---|
| Renderer | Three.js r163, vendored — zero network dependencies, runs offline |
| Build | None. ES modules + importmap, served statically |
| Ocean | Custom `ShaderMaterial`; Gerstner vertex displacement, analytic normals, Fresnel sky mix, sun specular, crest foam, gust darkening |
| Geometry | 100% procedural — hull is lofted from parametric stations, no model files |
| Physics | Fixed 120 Hz substepped integration, decoupled from render rate |
| Audio | Web Audio synthesis only — no audio files. Wind noise filtered by apparent wind speed, hull rush by boat speed, sail flutter under luff, buoy bell on rounding |
| Perf target | 60 fps at 1440×900 on integrated graphics |
| Persistence | `localStorage` best time and best lap |

## 8. Success criteria

1. A player who has never sailed discovers the no-go zone within 15 seconds
   *without reading instructions*, because the boat visibly stalls.
2. Sailing to a gust instead of straight at the mark is measurably faster.
3. The polar curve is correct: reach fastest, run slower than reach,
   close-hauled ~70% of reach speed, dead upwind negative. **Verified** against
   the table above by a headless polar harness.
4. AI finishes within ±10% of a competent player over 3 laps. **Verified**: a
   headless full-race run finished AZURE 4:31.5, EMBER 4:37.9, VERDE 4:41.3
   against a scripted player at 4:41.8.
5. No file loads over the network at runtime.
