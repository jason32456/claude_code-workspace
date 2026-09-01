# Kessler — PRD

## 1. One-liner

A zero-thrust EVA salvage game. You have no flight controls. You move by **kicking
off hull plate, swinging on a magnetic tether, and throwing your own cargo away** —
and the cargo you throw is the cargo you were sent to bring home.

## 2. Why this one

The repo has thirty-eight projects, ten of them 3D. Every 3D game in it hands the
player a thrust vector and lets them point it: hop the lanes (Crossy Road), steer
the city (Joyride), strafe the arena (Overrun), lean the bike (Apex Riders), hop
the chambers (Afterimage), trim the sails (Windward — the closest, but even there
the boat obeys a rudder every frame).

Kessler removes the thrust vector. Holding a direction key does essentially
nothing: it vents a puff from a reserve that does not refill in the field. Every
metre you cross was bought with an impulse you chose *earlier*, and the game is
about paying for those impulses. That inversion — **the player's problem is not
where to go but what to spend to get there** — is not in this repo, and it is not
in most games at all.

Silkfall is the nearest neighbour in spirit (a physical system that punishes
sloppy planning), but it is a builder played from a fixed web plane. Kessler is a
free-floating navigation game with a mass economy.

## 3. Player fantasy

You are a salvage diver in a vacuum, wearing a suit that is slightly too heavy to
be nimble and slightly too light to be safe. Competence looks like **stillness**:
the good divers barely touch their gas, arrive at a handrail at 1.2 m/s instead of
9, and come home with a full rack.

## 4. Core loop

```
   ┌──────────────── AIRLOCK ──────────────────┐
   │  O2 topped · gas topped · cargo banked    │
   └────────────────────┬──────────────────────┘
                        ▼  kick off
   ┌──────────────── THE DIVE ─────────────────┐
   │  cross the gap on one impulse             │
   │  tether-swing round the rotating ring     │
   │  scoop salvage → you get HEAVIER          │
   │  heavier = weaker kicks, slower reel      │
   │  throw a crate to buy delta-v you lack    │
   └────────────────────┬──────────────────────┘
                        ▼  before O2 runs out
   ┌──────────────── RETURN ───────────────────┐
   │  bank the mass · quota met? next shift    │
   └───────────────────────────────────────────┘
```

Five shifts. Meet the quota on each. O2 or suit integrity hitting zero ends the run.

## 5. Mechanics

### 5.1 Momentum is the control scheme

The player is a 95 kg point mass with a velocity that nothing damps. There is no
drag, no gravity, no "return to rest". Four ways to change it, in order of how
much the game wants you to use them:

| Move | Cost | Δv | Notes |
|---|---|---|---|
| **Kick off** (hold `SPACE` while anchored, release) | free | up to ~1000 N·s / mass | The primary verb. Charge time sets impulse. Aim with the camera. |
| **Tether reel** (`LMB` fire, hold `RMB` to reel) | free | continuous pull toward anchor | Also a rope constraint — swing round corners, convert a bad heading into a good one. |
| **Throw cargo** (`Q`) | −1 crate | `m_crate · 9 / mass` | Conservation of momentum, exactly. The escape hatch when you have stranded yourself. |
| **RCS puff** (`WASD`) / **match velocity** (`SHIFT`) | gas, no field refill | small | Deliberately feeble. It is a correction budget, not a flight system. |

Because every impulse is divided by total mass, and total mass is suit + cargo,
**a full rack turns the player into a barge**. The difficulty curve of a shift is
self-inflicted: the last crate is always the hardest one to carry home.

### 5.2 Anchoring

Anchoring (`E`, or automatic on a soft touch) welds you to hull and zeroes
relative velocity — including the surface's own motion, so anchoring to the
rotating ring makes you rotate with it.

Arrival speed is graded, and this is the game's main skill check:

- `< 2.5 m/s` — clean catch, anchored.
- `2.5 – 6 m/s` — hard catch, anchored, some integrity lost.
- `> 6 m/s` — you fail to hold on, bounce at 35% restitution, and take damage
  proportional to the impact. A bounce in the wrong direction is often the run.

The HUD therefore reports **closure rate to whatever is under the crosshair**, not
just speed, because speed alone is not the thing that kills you.

### 5.3 The station

Procedurally generated per shift from a seed: a spine of pressurised modules and
trusses, solar wings, and one **counter-rotating ring** turning at 6–14 °/s. Ring
surfaces carry real surface velocity, so a tether anchored to the ring will drag
you into an orbit, and a kick off the ring inherits its tangential motion.

Hazards:

- **Debris** — tumbling chunks on straight-line paths through the work zone.
  Contact costs integrity and, worse, changes your velocity.
- **Venting breaches** — cones of escaping gas that push anything inside them.
  Free delta-v if you enter deliberately; a one-way ticket to the void if you
  drift in sideways.
- **The void** — past 260 m from the station, O2 burn triples and the HUD starts
  counting. Nothing out there will stop you.

### 5.4 Economy per shift

| Shift | Quota | O2 | Debris | Ring rate |
|---|---|---|---|---|
| 1 | 3 crates | 240 s | 6 | 6 °/s |
| 2 | 5 | 235 s | 9 | 8 °/s |
| 3 | 7 | 230 s | 13 | 10 °/s |
| 4 | 9 | 225 s | 17 | 12 °/s |
| 5 | 12 | 220 s | 22 | 14 °/s |

Docking at the airlock banks carried crates, refills O2 to full and gas to full.
Two short trips or one long one is a real decision: the trip home costs O2 too.

## 6. Feel and presentation

- Third-person chase cam a few metres behind the suit, so the player can *see*
  their drift vector against the hull. First-person hides exactly the information
  this game is about.
- A velocity ribbon on the HUD: heading marker, retro marker, closure number.
- Sun is a hard white key light with almost no fill — the shadowed side of the
  station is genuinely dark, lit only by the helmet lamp.
- All audio synthesised at runtime (Web Audio): suit breathing that quickens as O2
  drops, the thump of a catch conducted through the suit, tether servo whine, the
  hiss of a gas puff. No files to download.

## 7. Scope

**In:** the four movement verbs, anchoring with graded catches, the mass economy,
procedural station with one rotating ring, debris, breach jets, five shifts,
airlock banking, HUD, synthesised audio, pause, mobile-unsupported notice.

**Out:** multiplayer, saving between sessions beyond a localStorage best shift,
inventory beyond crate count, EVA repairs, story.

## 8. Success criteria

1. A first-time player reaches the far side of the station without touching WASD.
2. At least one moment per run where the correct answer is to throw away salvage.
3. Runs at 60 fps in a browser tab with no build step and no network access.
