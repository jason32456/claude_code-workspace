# Gnomon — PRD

## 1. One-liner

A 3D shadow platformer where **the level is not the geometry — it is the shadow the
geometry casts**. You never touch the platforms. You rotate glass solids hanging in
a dark room and slide the lamp that lights them, and the hard-edged shadows they
throw onto the back wall are the only ground your shadow-body can stand on.

## 2. Why this one

The repo has 43 projects, 11 of them 3D. Every one of them puts the player *inside*
the 3D space and asks them to move through it: hop the lanes (Crossy Road), drive
the city (Joyride), strafe the arena (Overrun), lean the bike (Apex Riders), trim
the sails (Windward), spin the web (Silkfall), kick off the hull (Kessler), dig the
valley (Meltwater). Afterimage is the closest neighbour — a 3D puzzle-platformer —
but there the platforms are the geometry, and your past selves are just more
geometry.

Gnomon splits the two apart. The **player lives in 2D** on the wall plane; the
**puzzle lives in 3D** in the room in front of it; and the only coupling between
them is a projective transform through a point light. A 4° yaw on a hexagonal prism
three metres from the wall is a two-metre swing of the ledge you are standing on.
Sliding the lamp 30 cm closer to a solid doubles its shadow and drags every platform
outward at once.

That is the whole game: **you solve a 3D problem to produce a 2D consequence, and
you can watch the consequence move while you are standing on it.** Nothing in this
repo — and very little anywhere — makes the projection itself the mechanic.

## 3. Player fantasy

You are a flat thing that lives on a lit wall and is afraid of the light. You cannot
push the world; you can only re-aim it. Competence looks like *reading a solid* —
glancing at a wedge and knowing which way its shadow's top edge will tip before you
touch it.

## 4. Core loop

```
   ┌──────────── READ THE WALL ─────────────┐
   │  where is the gap? what must span it?  │
   └───────────────────┬────────────────────┘
                       ▼  grab a solid / the lamp
   ┌──────────── SCULPT THE SHADOW ─────────┐
   │  yaw + pitch      → tilt the ledge     │
   │  slide            → move it            │
   │  push toward lamp → make it huge       │
   │  overlapping shadows merge into one    │
   └───────────────────┬────────────────────┘
                       ▼  physics never pauses
   ┌──────────── RUN IT ────────────────────┐
   │  the ledge is moving while you cross   │
   │  fall off the bottom → respawn         │
   │  squeezed between two shadows → crush  │
   └───────────────────┬────────────────────┘
                       ▼
   ┌──────────── SEAL / DOOR ───────────────┐
   │  some doors need a silhouette matched  │
   └────────────────────────────────────────┘
```

Nine chambers. Each has a door; most have three optional motes.

## 5. Mechanics

### 5.1 The projection is exact, not decorative

The wall is the plane z = 0. The lamp is a point at **L**. Every solid is a set of
convex parts; a part with vertices v₁…vₙ casts the convex hull of

```
    p(v) = L + (v − L) · Lz / (Lz − vz)
```

which is *exactly* the polygon the player collides with. Shadows are not rendered
with a shadow map and then approximated for physics — the physics polygons are
triangulated and drawn as the shadow. What you see is what you stand on, to the
pixel, and the divergence bug class simply does not exist.

Consequences that fall out for free, and that the levels are built on:

- **Leverage.** A solid near the lamp casts an enormous, fast shadow; the same solid
  near the wall casts a small, sluggish one. Depth is a gear ratio.
- **Merging.** Two separate solids whose shadows overlap are one continuous platform.
  Bridges are built by overlap, not by contact.
- **Inversion.** Move the lamp and *every* platform moves at once, each by a
  different amount. Level 7 gives you nothing but the lamp.

### 5.2 Standing on darkness

The player is a disc of radius 0.42 in wall coordinates, with run/jump/coyote-time/
jump-buffer platformer physics. Collision is circle-vs-convex-polygon with minimum
translation vector resolution; a contact whose normal points upward by more than
0.55 grounds you.

**Carry is analytic.** Each projected hull vertex knows its own velocity (finite
differenced by *source vertex index*, so it is correct under rotation, translation,
depth change and lamp movement alike). A grounded player is carried by the velocity
interpolated along the supporting edge, so a rotating vane sweeps you along its face
rather than sliding out from under you.

**Crush.** Two resolutions in one frame whose normals oppose by more than 130°, each
deeper than 0.2, is a crush: respawn at the last grounded position.

### 5.3 What you may touch

Per solid, declared in the level:

| Flag | Meaning |
|---|---|
| `rotate` | drag to yaw + pitch |
| `slide` | shift-drag (or right-drag) to move parallel to the wall |
| `depth` | wheel to move toward / away from the lamp, clamped |
| `motor` | rotates on its own, forever — a moving platform you cannot stop |
| (none) | fixed scenery; its shadow is the level's skeleton |

The lamp is itself a draggable object where the level allows it.

### 5.4 Seals

Some doors are shut behind a **seal**: an outline on the wall that must be filled by
shadow. Coverage and spill are sampled on a grid each frame; ≥ 92 % of the target
covered with ≤ 12 % spill into the surrounding band opens it. This is the one puzzle
type where the answer is a *shape*, not a path — you are aiming a silhouette, and the
solid that makes it rarely looks like the shape it must cast.

### 5.5 No pause

Physics runs while you manipulate. That is the tension: the platform you are standing
on is the platform you are editing, and a rotation is a decision about where you will
be in half a second. It is also the source of the game's best trick — deliberately
tipping a ledge to fling yourself across a gap you cannot jump.

## 6. Chambers

| # | Name | Teaches |
|---|---|---|
| 1 | First Light | rotate one slab to bridge a gap |
| 2 | Leverage | depth = size; grow a shadow to reach a high ledge |
| 3 | Confluence | two solids, overlapping shadows merge |
| 4 | The Vane | motorised sweeping platform, timing |
| 5 | Narrows | crush hazard; shadows that close on you |
| 6 | Keyhole | first seal — match a silhouette to open the gate |
| 7 | Lamplight | nothing moves but the lamp |
| 8 | Orrery | motors + a seal you must hold while crossing |
| 9 | Gnomon | everything, plus a lamp on a rail |

Par times per chamber; motes and best time persist in `localStorage`.

## 7. Presentation

Smoked-glass solids in a dark room, a single warm point light, hard black shadows on
a wall that falls off with real inverse-square attenuation. The player is a small
indigo silhouette with a cyan rim so it stays legible against its own kind. Held
objects glow at the edges. All audio is synthesised at runtime — a room tone, a drone
whose pitch tracks the angular speed of whatever you are turning, footsteps, a seal
chord — so the app ships zero audio files and works offline.

## 8. Non-goals

- No combat, no enemies. The moving parts are hazard enough.
- No procedural levels. Every chamber is hand-placed; the mechanic needs authored
  "aha" moments, not variety.
- No build step. Vanilla ES modules with Three.js vendored locally, launchable
  straight from the showcase.

## 9. Success criteria

1. A player who has never seen it finishes chamber 1 without reading instructions.
2. The shadow you collide with and the shadow you see are the same polygon, always.
3. 60 fps at 1440×900 with nine solids and a motorised vane.
4. Every chamber is solvable, and at least three have a second solution the author
   did not plan — a good sign the simulation, not a script, is doing the work.
