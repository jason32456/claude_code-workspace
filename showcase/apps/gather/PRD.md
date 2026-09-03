# Gather — PRD

## 1. One-liner

A 3D glassblowing game where **the material is the opponent**. You never place a
vertex or pick a shape from a menu — you hold a blob of 1100 °C glass on the end
of a pipe and it is sagging, cooling and thinning the entire time you work it.
Every shape in the game is the residue of how well you managed heat, rotation and
pressure in the ninety seconds you had.

## 2. Why this one, and why it is not any of the other fifty

The repo has 50 projects, 18 of them 3D. Every one of those 3D games is about
**moving a body through a space** — hop the lanes (Crossy Road), drive the city
(Joyride), shoot the arena (Overrun), sail the course (Windward), lap the track
(Apex Riders), climb the wall (Crux), fly the drop (Emberline), solve the chamber
(Afterimage). Even the two that build something — Cantilever's bridge and
Silkfall's web — build a *structure of discrete members* and then test it.

Gather has no space to move through and no members to place. The entire game is
**one continuous deformable body**, and the verbs are thermal and rotational
rather than spatial. The closest relative in the repo is Plumbline, and only in
spirit: there you fight a pendulum's momentum, here you fight a fluid's
viscosity curve. Nothing in the collection simulates a material that changes
state while you are touching it.

The subject also earns the 3D: molten glass is *emissive*, so a dark hotshop
with one glowing object in it is doing something a 2D canvas cannot, and a
surface of revolution is the one 3D form a player can actually author with two
hands and no modelling UI.

## 3. Player fantasy

You are the person on the bench at 6 a.m. The furnace has been on all night. You
have one gather, one clock, and an order card clipped where you can see it. The
piece is beautiful for about eleven seconds at a time and then it needs to go
back in the fire.

## 4. The physical model (this is the game)

The piece is a **surface of revolution** sampled as 64 rings along the pipe axis.
Every ring carries a radius, a wall volume, a temperature and a 2D centre offset.
Nothing about the shape is scripted — every mechanic below is a term in the same
update, and the interesting behaviour is what falls out of their interaction.

### 4.1 Heat is the master variable

`softness = clamp((T − 620) / (1080 − 620), 0, 1)^1.5`

Softness scales *every* deformation term in the simulation. There is no "mode" —
hot glass moves, warm glass moves slowly, cold glass does not move and **cracks
if you touch it with a tool**. Rings cool independently, and thin wide rings cool
faster than thick narrow ones (surface-to-mass), so a piece that has been blown
out is on a much shorter clock than a fresh gather. This single rule is what
makes reheating a decision rather than a chore.

### 4.2 Rotation is not decoration

Gravity is applied to each ring's centre **in the piece's own rotating frame**.
It is never cancelled by a rule; it is cancelled by *integration* — spin fast and
the gravity vector sweeps a circle and sums to nearly nothing, stop spinning and
it accumulates in one direction and the piece visibly droops off its own axis.
Sag is scaled by distance from the pipe, so it is a cantilever: the tip goes
first. Let it exceed the limit and the gather falls off the pipe onto the floor.

This is why real glassblowers never stop rolling the pipe, and here it is the
same reason rather than a homage.

### 4.3 Pressure finds the weakness

Blowing adds `dr ∝ P · softness · 1/thickness`. The bubble therefore does not
grow where you point it — it grows **wherever the glass is hottest and thinnest**,
which is a place you created thirty seconds ago. Wall thickness is derived from
conserved shell volume (`t = V / 2πr·dz`), so expanding always thins, thinning
always accelerates further expansion, and a run-away is a **blowout**: the piece
bursts and the order is a loss. Controlling *where* the bubble goes means going
back and chilling the part you do not want to move.

### 4.4 The rest of the bench

| Tool | Effect | The reason it exists |
|---|---|---|
| **Jacks** (1) | Local radius squeeze, gaussian falloff, volume pushed into the wall | Necks, waists, shoulders, and the cut line |
| **Blocks** (2) | Pulls radius toward the local mean and kills sag under the cursor | The repair tool — un-droops a piece you neglected |
| **Pull** (3) | Stretches the axis beyond the cursor; radius and wall fall to conserve volume | Length and narrow necks; the only way to get a stem |
| **Marver** (4) | Fast cooling + re-centring across the whole piece | Deliberately chill a region so pressure goes elsewhere |
| **Shears** (5) | Trims every ring past the cursor, opening the piece | The irreversible one — see 4.5 |

### 4.5 Opening the piece changes the game

Shearing the tip off makes an **open** form. Air no longer pressurises, so
blowing stops working entirely and the only remaining shaping force is
**centrifugal**: spin the open rim hot and fast and it flares outward on its own.
Bowls are made of spin, bottles are made of breath, and the shears are the
one-way door between the two. Choosing when to open — or whether to at all — is
the strategic decision in every order after the second.

### 4.6 Failure states, all emergent

- **Blowout** — wall thinner than 1.2 mm while hot and pressurised.
- **Crack** — a tool applied below ~620 °C.
- **Drop** — sag past the limit; the gather leaves the pipe.
- **Cold** — the clock runs out with a piece nowhere near the order.

## 5. The loop

```
     ORDER CARD ──► GATHER (fresh, 1100 °C, 90 s)
          │
          ▼
   ┌── work ──────────────────────────────────────┐
   │  roll (A/D)  ·  heat (F)  ·  blow (SPACE)    │
   │  tools (1-5 + left mouse at the cursor)      │
   │  the piece cools the whole time              │
   └───────────────────┬──────────────────────────┘
                       ▼
              BENCH IT (ENTER)
                       ▼
   score = profile match · symmetry · wall · rim
                       ▼
        five orders ──► shift total ──► rank
```

## 6. Orders (the difficulty curve, and what each one teaches)

| # | Piece | Teaches |
|---|---|---|
| 1 | **Tumbler** — straight wall, open, flat base | roll, blow, shear, keep it centred |
| 2 | **Bud vase** — round body, long narrow neck, small lip | jacks and pull; heat one region and not another |
| 3 | **Bowl** — shallow, very wide rim | shear early, then flare on spin alone |
| 4 | **Decanter** — heavy belly, tall neck, tight mouth | never open it; steer pressure by chilling |
| 5 | **Amphora** — belly, neck *and* flared lip | every tool, in the right order, on one gather |

## 7. Scoring

Both the piece and the order are resampled to 32 points and compared:

- **Profile** (55%) — mean absolute radius error against the target silhouette
- **Symmetry** (15%) — accumulated sag; a drooped piece cannot score well
- **Wall** (15%) — mean thickness inside 2–9 mm; too thin is fragile, too thick is clumsy
- **Rim** (15%) — open when the order is open, closed when it is not, plus a flat base where one is required

`≥90 Master · ≥75 Journeyman · ≥60 Apprentice · below that it sells as a second.`

## 8. Controls

| Input | Action |
|---|---|
| `A` / `D` held | Roll the pipe (friction bleeds it off — you must keep rolling) |
| `F` held | Push into the glory hole; longer hold = deeper = more of the piece reheats |
| `SPACE` held | Build and release breath pressure |
| `1`–`5` | Select tool |
| Mouse X | Move the tool cursor along the piece |
| Left mouse | Apply the selected tool |
| `G` | Toggle the target ghost |
| `C` | Cycle camera |
| `ENTER` | Bench the piece and score it |

## 9. Look and feel

A dark hotshop lit almost entirely by the work. The glass mesh is coloured
per-vertex from a blackbody-ish ramp (white-orange at 1100 °C through deep red at
700 °C into cold transmissive grey), with an additive shell for glow and a point
light whose intensity tracks the piece's own mean temperature — so as the glass
cools, **the room gets darker**, which is both true and a readable heat gauge you
never have to look at. The glory hole breathes. A seam mark on the surface makes
rotation legible at a glance.

## 10. Stack and constraints

Vanilla JS ES modules + Three.js r163, vendored locally per the repo rule. No
build step, no CDN, no backend — a plain static app under `showcase/apps/gather/`
launchable straight from the arcade. Web Audio for the furnace roar and the
bench sounds; no audio assets.

## 11. Out of scope

Colour bars and frit, a second gather, punty transfer, the annealer as a real
mechanic, multiplayer, and any form of undo. The piece you get is the piece you
made.
