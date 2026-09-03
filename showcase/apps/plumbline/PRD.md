# Plumbline — PRD

## 1. One-liner

A 3D tower-crane game about **the thing you cannot touch**. You drive a crane; the
crane drives a cable; the cable drives an eight-tonne column swinging two metres
behind wherever you thought you were putting it. Every placement error you leave
behind is welded into the building, and the building leans.

## 2. Why this one

The repo has 47 other projects and a dozen 3D games, and every one of them puts the
player's hands directly on the thing that matters. Crossy Road, Joyride, Apex
Riders, Overrun, Windward, Leyden, Emberline — press a key, the avatar responds
this frame. Crux moved the interesting state inside the climber's body, but the
climber still answers instantly.

Plumbline is the first one where **the player never touches the object of the
game**. You control a trolley on a jib. The load is 40 metres below it on a
cable, and it obeys gravity and its own momentum, not you. Input arrives at the
load late, filtered through a pendulum, and the only way to move it accurately is
to stop pressing *before* you get there. Nothing else in the collection is built
on lag.

The second idea nothing else has: **your mistakes are the level**. A crane game
where a fumbled placement just costs points is a score attack. Here each piece is
set where you actually set it, the floor inherits that offset, and the next floor
is built on the floor you left. Twelve sloppy metres up, the tower is visibly out
of plumb and the plumb gauge is the thing that ends your run.

## 3. Player fantasy

You are 90 metres up in a glass box with a joystick in each hand, and the entire
site is waiting on you. The riggers are on the deck looking up. There is a gust
coming across the river and you can see it move the flag two seconds before it
reaches your load. You are not fast. You are *smooth* — and smooth is faster than
fast, because everything you do roughly comes back at you as a swing you have to
spend ten seconds killing.

## 4. The one idea: the load is a pendulum with a moving pivot

The load is a particle on a rigid cable whose pivot is the trolley. The engine
runs it as a constrained mass:

```
V += (gravity + wind) · dt
P += V · dt
d  = P − T                       T = trolley (pivot), moves under player control
P  = T + L · d̂                   cable length constraint
V  = V_pivot + tangential(V − V_pivot)
```

Everything the game is about falls out of those five lines:

- **Acceleration creates swing.** Start the trolley moving and the load stays put,
  so the cable tilts back. The load then chases the trolley and overshoots.
- **Deceleration can cancel it, on the beat.** The null is exactly one full
  period after the accelerating pulse — measured on a 25 m cable (T = 10.03 s),
  braking at t = 1 + T leaves 0.22 m of residual sway, while braking half a period
  early leaves 9.65 m. At the null the load is roughly 1.6 m *ahead* of the
  trolley and swinging back toward it, and the usable window is about ±0.5 s.
  Brake anywhere else and you add to the swing rather than cancelling it.
- **The cable length is a difficulty dial the player holds.** Period is 2π√(L/g):
  a long cable is slow and forgiving, a short one is twitchy. Hoisting up while a
  swing is running *pumps* it — same reason a child on a swing stands up.
- **Slew is worse than trolley.** Rotating the jib drags the load through an arc,
  so it swings tangentially *and* flies outward. Slew and trolley at once and you
  get a circle, not a line.

## 5. The second idea: load moment

A tower crane is not rated in tonnes, it is rated in **tonne-metres**. Capacity at
radius r is `M_max / r`, so the same crane that lifts 12 t over the core will not
lift 3 t at the jib tip. The LMI (load moment indicator) is a real gauge on the
HUD and it hard-stops the trolley at the radius where the load would tip the
crane.

This turns piece variety into route planning:

| Piece | Mass | Wind area | Where it goes | The problem |
|---|---|---|---|---|
| Core module | 12 t | small | r ≈ 11.7 m | LMI hard-stops the trolley at 13.8 m. |
| Column | 8 t | small | r ≈ 16.6 m | Heavy, hits hard, wants a gentle landing. Limit 20.6 m. |
| Beam | 4 t | small | r ≈ 21.4 m | Long — yaw error is what fails it (±7°). |
| Façade panel | 1.5 t | **11.5 m²** | r ≈ 26.7 m | Light and a sail. At 12 m/s it hangs 2.4 m off plumb; the 8 t column hangs 0.06 m. |

The panels are the joke that makes the system work: the *lightest* pieces are the
hardest, because wind force scales with area and acceleration is force over mass.
Players learn to do façade early while the wind is low and save the heavy core
work for the gusty end of the day.

## 6. Core loop

```
   ┌── HOOK UP ─────────────────────────────────────────┐
   │  piece is delivered to the lay-down yard           │
   │  slew + trolley over it, lower the hook, latch     │
   └──────────────────┬─────────────────────────────────┘
                      ▼
   ┌── TRAVEL ──────────────────────────────────────────┐
   │  hoist clear of the tower, slew across, kill the   │
   │  swing you created getting there. Watch the gust   │
   │  bar. Do not let the load strike the structure.    │
   └──────────────────┬─────────────────────────────────┘
                      ▼
   ┌── SET ─────────────────────────────────────────────┐
   │  hook-cam down the cable, line up over the slot,    │
   │  rotate to the slot's yaw, wait for the swing to    │
   │  settle, lower, release soft                        │
   └──────────────────┬─────────────────────────────────┘
                      ▼
   ┌── CONSEQUENCE ─────────────────────────────────────┐
   │  offset + yaw + impact are recorded into the floor  │
   │  → floor offset → tower lean → plumb gauge          │
   └──────────────────┬─────────────────────────────────┘
                      ▼
              floor complete → crane jacks up
              → higher = windier → next floor
```

## 7. Scoring and failure

**Per set.** Base value by piece type, multiplied by accuracy:

- horizontal error ≤ 0.30 m → `SET TRUE`, full value, combo +1
- ≤ 0.80 m → accepted, scaled value
- ≤ 1.60 m → accepted, poor, combo reset
- \> 1.60 m → refused; the piece stays on the hook and you go again

Yaw error and impact speed are separate multipliers. A landing above 2.5 m/s
damages the piece (value halved, plumb penalty doubled). Combo adds 10% per
consecutive true set, capped at ×2.5.

**Plumb.** Each set's error vector accumulates into the floor's offset. Each floor
is drawn at its own offset, so the tower physically leans as you build. The gauge
reads accumulated lean against a 1.00 m tolerance over the full height. Exceed it
and the run ends with a structural failure — the one hard fail in the game.

**The clock is the sun.** One shift, ten minutes, sunrise to dark. The sky, the
sun angle, the shadows and the floodlights all run off that clock. You are not
racing a number in the corner; you are racing the light. When it is dark, the
shift ends and your building is what it is.

## 8. Controls

| Key | Action |
|---|---|
| `A` / `D` | Slew jib left / right |
| `W` / `S` | Trolley out / in |
| `R` / `F` | Hoist up / down |
| `Q` / `E` | Rotate the load on the hook |
| `Space` | Latch / release |
| `Shift` | Precision — halves every rate |
| `X` | All-stop (brakes) |
| `Tab` | Site view ⇄ jib view |
| `Mouse drag` / `wheel` | Orbit / zoom in site view |
| `P` | Pause |

A **hook cam** in the corner looks straight down the cable at the load and the
target slot at all times. It is not a luxury: placement to 30 cm from 90 m up is
not possible without it, and it is the reason a beginner can finish floor 1.

## 9. Feedback the player actually reads

- **Sway indicator** — a top-down dot showing the load's offset from directly
  under the hook, with a settle ring. Green inside 0.3 m.
- **LMI arc** — fills as `mass × radius / M_max`. Amber at 80%, red hard stop.
- **Gust bar** — current wind plus a 3-second lookahead, because a gust you cannot
  see coming is not a challenge, it is a coin flip. The site windsock and the
  flags on the tower move with it.
- **Plumb gauge** — a spirit level. Bubble drifts as the tower leans.
- **Slot ghost** — the target slot renders as a wireframe with a tolerance ring
  that turns green when the load is inside it and settled.

## 10. Audio (procedural, no files)

Web Audio only. Hoist and slew motors are sawtooth oscillators whose pitch tracks
actual rate, so the machine sounds loaded when it is loaded. Wind is filtered
noise, its band opening with speed. Cable creak on high swing. A deep clunk on
latch, a soft thud on a good set, a bad crunch on a hard one. The LMI alarm is the
only sound in the game designed to be unpleasant.

## 11. Scope

**In:** one procedurally laid out building, 10 floors + rooftop mast, 4 piece
types, wind with gusts and height gradient, LMI, plumb accumulation and visible
lean, day cycle, hook cam, cab view, full HUD, procedural audio, score with combo,
local best score.

**Out:** multiple sites, crane upgrades, riggers as characters, mobile controls,
multiplayer, any asset file whatsoever.

## 12. Stack

Three.js (vendored, no CDN), vanilla ES modules, Web Audio. No build step — the
folder is served as-is, per the showcase's static contract.
