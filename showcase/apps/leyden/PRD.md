# Leyden — PRD

## 1. One-liner

A 3D storm-flying game where **lightning is the resource, not the enemy**. You fly a
charged airship into a thundercloud, deliberately make yourself the most attractive
thing in the sky, take the strike on your own hull, and then run the charge down to
the town's capacitor jars before the heat cooks you.

## 2. Why this one

The repo has 41 projects and 14 3D ones. Every 3D game in it is built around a
familiar verb: drive (Joyride, Apex Riders), shoot (Overrun, Asteroid Storm), dodge
(Crossy Road, Snake 3D), aim (Gravitee), build (Silkfall, Cantilever, Meltwater),
defend a base (Nightside), navigate a physical system (Kessler, Windward,
Afterimage, Sonar).

Leyden's verb is **bait**. The threat and the reward are the same object, and the
skill is deciding how much of it to invite onto yourself. The player has no weapon,
no turret, and nothing to destroy. The danger model is a stochastic physical process
you steer *indirectly* — you never point the lightning, you only change what the sky
finds appetising, and then you live with what it picks.

The closest neighbours are Nightside (things arrive on a schedule and hit a town you
care about) and Kessler (a physical carry-and-return loop with a resource clock).
Leyden differs from both in the thing that matters: in Nightside you kill the
arrivals, in Kessler the cargo is inert. Here the cargo is *live*, it is trying to
kill you the whole time you hold it, and you asked for it.

## 3. Player fantasy

You are a lightning smuggler in an age that has electricity but no way to make it at
scale. The town of Leyden runs on charge someone has to physically go up and fetch.
You are that someone: a slow gas envelope, a copper streamer trailing beneath you,
and a hull that starts to smell of ozone about four seconds after a good hit.

Competence looks like **greed with a stopwatch**. Anyone can survive a storm by
staying out of it. A good pilot takes the strike at 130 m, is at the pylon head at
40 m before the heat bar turns amber, dumps, and is climbing again before the next
cell finishes charging.

## 4. Core loop

```
   ┌──────────── READ THE SKY ─────────────┐
   │ a cell begins to charge (hum + glow)  │
   │ ~3 s of warning, one cell at a time   │◄──┐
   └──────────────────┬────────────────────┘   │
                      ▼ position                │
   ┌──────────── BAIT THE STRIKE ──────────┐    │
   │ hold E: drop the streamer             │    │
   │ your attractiveness ×6 — you are now  │    │
   │ the likeliest thing in the valley     │    │
   │ (so is the powder mill, 90 m below)   │    │
   └──────────────────┬────────────────────┘    │
                      ▼ attachment               │
   ┌──────────── CARRY IT HOME ────────────┐    │
   │ charge in the hull → HEAT rising      │    │
   │ heat 100 = hull damage, 3 hits = down │    │
   │ fly to a jar, hold Q to dump          │    │
   │ or hold R to bleed it away and lose   │    │
   │ the payload you nearly died for       │    │
   └──────────────────┬────────────────────┘    │
                      ▼ grid demand met?        │
              no ─────────────────────────------┘
              yes → storm survived, next storm
```

Five storms. Each has a charge quota and a clock. The storm ending with the quota
unmet ends the run, as does hull integrity reaching zero, as does the town burning.

## 5. Mechanics

### 5.1 The attractiveness field

Every object that lightning can attach to has an **attractiveness** value. The strike
does not pick a target; it grows a leader step by step and each step is drawn toward
whatever the local field gradient prefers, with noise. Attractiveness is roughly:

```
a = base · height_bonus · state_multiplier
```

| Object | Base | Notes |
|---|---|---|
| Open ground | 0.15 | The default sink. A wasted strike. |
| Church spire / tall rods | 2.2 | Deliberate decoys, they eat strikes for free |
| Capacitor jar (pylon) | 1.1 | A hit gives the town a *little* charge — the slow, safe way to play |
| Powder mill / hay barn / thatch | 1.0 | A hit starts a fire |
| **Player, streamer stowed** | 1.4 | Just flying near a cell is already a gamble |
| **Player, streamer deployed** | 8.0 | The bait. Deliberate, held, and you can let go |
| **Player, already carrying charge** | ×(1 + q/cap) | Success makes you a bigger target — the punish for hoarding |

Altitude matters: everything gets a bonus for being high, which is why the player
flying at 120 m under a live cell is a magnet and the same player at 25 m over the
rooftops is nearly invisible. That single rule is the whole risk curve — **you cannot
be near the charge and near the delivery point at the same time.**

### 5.2 Leader growth (how a bolt is actually drawn)

A dielectric-breakdown style walk, not a straight line and not a scripted spline:

1. Start at the firing cell's base, tip velocity pointing down.
2. Each step, generate ~14 candidate offsets in a downward-biased cone around the
   current heading.
3. Score each candidate by the field potential `φ(x) = Σ aᵢ / (|x − pᵢ| + ε)` summed
   over every attractor, plus a ground term.
4. Choose one with probability ∝ `score^η` (η ≈ 4 — high η = straight and purposeful,
   low η = wandering). Storms later in the run use lower η, so bolts are less
   predictable.
5. With probability `pBranch`, spawn a side leader from the current tip that grows on
   the same rules with a shorter budget and never attaches.
6. Attach when the tip is within `r` of an attractor or reaches the ground.

This is why the game is steerable but not deterministic: raising your own `a` bends
the probability distribution over paths, and everything else in the valley is still
in the sum. You are competing with the mill for the same bolt.

### 5.3 Charge, heat, hull

- **Charge** `q` (0…cap kC). Gained by attachment: a direct hit is `+55…70`. Nothing
  else fills it. Decays very slowly in air; decays fast in rain cells.
- **Heat** rises at a rate proportional to `q`, so a full hull is a 12-second fuse.
  Above 100 heat you take hull damage every second until you shed charge.
- **Hull** 3 points. Lost to overheating, and to taking a second strike while already
  above ~70% charge (the arrestor can only do so much).
- **Dumping** at a jar is not instant: `Q` transfers at ~28 kC/s and you must hold
  position within 14 m of the jar head and below 55 m to keep the link.
- **Bleeding** (`R`) sheds charge to the air at 40 kC/s for nothing. The bail-out.

### 5.4 The town

Five capacitor jars form the grid. Hazard buildings (powder mill, two hay barns, a
lumber yard, thatched cottages) catch fire when struck; a fire spreads to adjacent
structures on a timer unless the storm's rain squall passes over it. Three
simultaneous fires ends the run. The church spire and two lightning rods are free
protection — bolts prefer them over the barns — but they are fixed, so the geometry
of each storm decides how much of the town they actually cover.

### 5.5 Flight model

An airship, not a plane. Mass, drag, buoyancy trim, and a wind field that is a sum of
two rotating gusts plus per-storm shear.

| Input | Effect |
|---|---|
| Mouse | Look. Heading follows the camera; the hull yaws to match. |
| `W`/`S` | Prop thrust fore/aft along the camera heading |
| `A`/`D` | Lateral thrust (the ship is slower sideways) |
| `Space` / `Shift` | Trim up / vent down. Vertical response is deliberately laggy. |
| `E` (hold) | Deploy the streamer — bait |
| `Q` (hold) | Dump charge into a jar you are close enough to |
| `R` (hold) | Bleed charge to the air |
| `Esc` | Pause |

Vertical lag is the point: you cannot dive out of the way of a bolt, so the decision
has to be made during the 3-second cell warning, not after.

## 6. Storm ladder

| # | Name | Quota | Clock | New element |
|---|---|---|---|---|
| 1 | First Cell | 90 kC | 150 s | One cell at a time, slow cadence, calm air |
| 2 | Crosswind | 150 kC | 165 s | Steady shear — every hover is a correction |
| 3 | Squall Line | 210 kC | 180 s | Moving rain cells drain charge and douse fires |
| 4 | Anvil | 280 kC | 195 s | Two cells fire together; branchier, less predictable bolts |
| 5 | Supercell | 380 kC | 210 s | Fast cadence, low η, cells drift over the town itself |

## 7. Scoring

```
score = charge delivered
      + 12 × seconds left on the clock at quota
      + 250 per storm with zero fires
      + 400 per storm finished with full hull
```

Best run persisted to `localStorage`.

## 8. Presentation

- **Look.** Night, heavy fog, a cloud deck of layered translucent planes above. The
  world is nearly monochrome until a bolt fires, and then everything is lit for
  ~180 ms by a real point light at the attachment point. Charge on the player reads
  as a corona and a rising hum, not a number you have to look up.
- **Bolts** are drawn as an emissive tube for the main channel plus additive line
  segments for branches, with a two-stage envelope: dim stepped leader, then the
  bright return stroke back up the channel.
- **Thunder is delayed by `distance / 340` seconds**, which is also the game's
  distance cue — a strike you hear a beat after you see it was not close enough to
  have hit you.
- **Audio is fully synthesised** (Web Audio, zero files, per repo rule): wind noise
  shaped by airspeed, a corona crackle whose density tracks charge, a cell-charging
  hum that rises before every strike, and thunder built from a noise burst through a
  swept lowpass.

## 9. Non-goals

- No combat, no enemies, no destruction of anything the player aims at.
- No procedural infinite mode — five hand-tuned storms, each readable in one run.
- No build step, no CDN. Three.js is vendored locally, per repo convention.

## 10. Success criteria

1. A first-time player takes a strike on purpose within their first 60 seconds
   without being told twice.
2. The bait decision feels different at 20 kC than at 60 kC (it should: greed
   multiplies your own attractiveness).
3. Two runs of the same storm produce visibly different bolt paths and different
   attachment choices.
4. Runs at 60 fps at 1440×900 with bolts on screen.
5. Loads and plays from `showcase/apps/leyden/` with nothing but a static server.
