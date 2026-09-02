# Meltwater — PRD

## 1. One-liner

A 3D valley you reshape with a shovel, and a **real fluid** that decides whether you
got it right. The glacier melts on a timer; every drop obeys a shallow-water
simulation; you have no way to touch the water, only the ground under it.

## 2. Why this one

Forty projects, eleven of them 3D, and every single 3D game in the repo gives the
player an avatar with a velocity vector: hop the lanes (Crossy Road), steer the city
(Joyride), strafe the arena (Overrun), lean the bike (Apex Riders), swing the tether
(Kessler), trim the sail (Windward), spin the web (Silkfall). Even the two builders
— Silkfall and Cantilever — build a *structure* and then watch a rigid thing move
through it.

Meltwater has no avatar at all. The player is a landscape, and the antagonist is a
fluid:

- **Nothing in the repo simulates fluid.** Cantilever solves XPBD constraints,
  Nightside runs a flow field on a globe, Particle Life is pairwise forces. None of
  them is a continuum that conserves volume, and volume conservation is the whole
  game here: water you sent the wrong way is *gone*, not respawned.
- **The player's only verb is terrain.** You cannot push, pump, or pick up water.
  You raise and lower dirt, and then you are a spectator with an opinion.
- **Cut and fill.** Earth is conserved. The spoil to build a levee has to come out
  of a channel you dug somewhere else, so every wall you want implies a trench you
  must choose the location of. That single constraint is what turns a sandbox into
  a game.

The nearest neighbour in feel is Cantilever — build, then press go and watch physics
grade your work — but Cantilever is 2D, static, and its failure mode is a snapped
member. Meltwater's failure mode is water in the village at 21:40 of a 90-second
melt, arriving from a direction you did not plan for because a channel you dug
eroded four seconds earlier and stole the flow.

## 3. Player fantasy

You are the valley's water engineer on the morning of the thaw. Competence looks
like **an empty village and a full reservoir**: everyone else sees a flood, you see
a delivery problem with a deadline. The good runs are the ones where you did most of
the work before the water arrived and spent the melt standing still.

## 4. Core loop

```
   ┌──────────────── SURVEY (paused) ──────────────────┐
   │  read the valley: where does it already drain?    │
   │  dig channel  → spoil pile grows                  │
   │  raise levee  → spoil pile shrinks                │
   │  place dam / sluice gate from the timber budget   │
   └────────────────────────┬──────────────────────────┘
                            ▼  RELEASE THE MELT
   ┌──────────────── THE MELT (real time) ─────────────┐
   │  glacier pours; shallow-water sim carries it      │
   │  fields drink → irrigation ticks up               │
   │  reservoir fills → banked for the score           │
   │  village wets  → damage ticks up                  │
   │  you may still dig (3× cost) and work the gates   │
   │  dams fail under pressure. loudly.                │
   └────────────────────────┬──────────────────────────┘
                            ▼  the last drop drains
   ┌──────────────── SETTLEMENT ───────────────────────┐
   │  irrigation % · water banked · village damage     │
   │  quota met → next season, bigger melt             │
   └───────────────────────────────────────────────────┘
```

## 5. Mechanics

### 5.1 The water (non-negotiable, it is the game)

Pipe-model shallow water on a 128×128 height grid (Mei et al., *Fast Hydraulic
Erosion Simulation*). Each cell holds a depth; each edge holds a flux accelerated by
the difference in **water surface** height (terrain + depth) between neighbours, then
scaled down when a cell would go negative, so volume is conserved and the sim cannot
blow up.

Consequences the player can feel, all of which fall out of the model rather than
being scripted:

- water finds the low line by itself, and a 20 cm mistake in a ridge redirects it
- a narrow channel runs fast and deep; a wide one runs slow and spreads
- a filled basin *backs up* and starts spilling from its lowest lip, which is
  usually not where the player was looking
- damming does not stop water, it delays it, and the delay has to go somewhere

### 5.2 Cut and fill

One number: the **spoil pile**, in m³. Lowering terrain adds to it, raising takes
from it. Start each season with a small allowance, so the first thing every level
teaches is that a levee is paid for by a trench. During the melt, sculpting costs
3× — emergency earthworks are possible and expensive.

### 5.3 Structures (timber budget, separate)

| Structure | Behaviour |
|---|---|
| **Dam** | A 3 m wall of packed earth and timber. Holds until the head of water behind it exceeds its strength, then **breaches** — the wall drops to the terrain in one frame and everything it held comes down the valley at once. |
| **Sluice gate** | A dam segment with a door. Keys `1`–`4` toggle gates during the melt. Closed = hold; open = a controlled release you can time. |

Dams are what make the melt a *live* phase rather than a cutscene: a gate held one
second too long is a breach, and a breach is not a loss, it is a redirect you now
have to survive.

### 5.4 Objectives per season

- **Irrigate**: every terrace field needs water standing on it for a required number
  of seconds. Under-watered is a fail; the field browns.
- **Bank**: the reservoir's held volume at the end scores.
- **Protect**: the village floods if standing depth exceeds 40 cm. Damage accrues per
  second per flooded house. Over the tolerance and the season fails.

### 5.5 Season ladder (6 seasons, escalating)

| # | Valley | New thing |
|---|---|---|
| 1 | Single fall line, one field | dig a channel, watch it work |
| 2 | Forked valley, two fields | one source, two quotas — split the flow |
| 3 | Basin above the village | dams, and what happens when they fail |
| 4 | Terraces | sluice gates: irrigate in sequence, not at once |
| 5 | Soft ground | **erosion** — fast water widens its own channel, so today's fix moves |
| 6 | The big thaw | double melt, an ice-dam burst mid-season, tight quotas |

### 5.6 Erosion (season 5+)

Where flow speed exceeds a threshold on soft soil, the terrain gives up a little
height into a suspended-sediment field; where flow slows, sediment drops out and
raises the bed. Channels deepen and wander, deltas silt up their own mouths, and a
channel that was perfect during planning is not the channel you have at t+40 s.
Clamped hard per step: this is a texture on the level, not a terrain shredder.

## 6. Controls

| Input | Does |
|---|---|
| Left-drag on terrain | Apply the current tool |
| `Q` / `E` | Dig / Raise |
| `R` | Dam tool · `T` Sluice gate tool |
| `[` `]` | Brush radius |
| Right-drag (or two-finger) | Orbit camera |
| Wheel / pinch | Zoom |
| `Space` | Release the melt (from Survey) / pause |
| `1`–`4` | Toggle sluice gates |
| `Esc` | Menu |

## 7. Look and feel

Alpine, mid-morning, high sun. Terrain shaded by what it *is* and what happened to
it: bare rock on steep faces, snow at the glacier, and soil that visibly darkens and
greens where water has been — so the finished valley wears a map of its own history.
Water is a shader: depth-tinted, with foam written into it where the sim says the
flow is fast, so the player can read velocity at a glance instead of from a number.

All audio synthesised at runtime, no files: the river's roar is filtered noise whose
cutoff and gain track total flow in the valley, so the valley *sounds* louder as it
runs faster, and a dam breach is a real transient in that same bed.

## 8. Scope

**In**: the sim, cut-and-fill sculpting, dams, gates, 6 hand-placed seasons, fields,
village, reservoir, erosion, settlement screen, synthesised audio, a tutorial that is
just season 1 being small.

**Out**: multiplayer, save games beyond a localStorage best score, terrain textures
(vertex colour only), any build step, any CDN. Three.js is vendored; the folder is
served as-is.

## 9. Done means

- 60 fps at 128×128 on an integrated GPU, sim included
- volume audit: total water in + released − drained − held stays within 0.5 % over a
  full 90 s melt
- no way to get a negative depth, a NaN, or a cell that grows without bound
- season 1 is winnable by someone who has read nothing; season 6 is not
