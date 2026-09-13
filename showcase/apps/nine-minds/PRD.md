# Nine Minds — Product Requirements Document

**One line:** A 3D escape game in which you play an octopus whose eight arms are
eight *separate* decision-makers — you do not move them, you persuade them.

---

## 1. Why this, and why it is not anything else in the collection

The repo has twenty-odd 3D projects, and every single one of them hands you a
control loop of the same shape: *you press a key, one thing you own responds.*
The avatar is a crane trolley (Plumbline), a climber (Crux), an air tanker
(Emberline), a kite (Leyden), a hull (Windward), an EVA suit (Kessler), a spider
(Silkfall), a hopper, a rider, a shooter. Vesper looks like the exception because
its avatar is a flock, but the flock is still *one* thing: it has one centre of
intent, and every bird in it is running the same three rules toward the same
goal.

Nine Minds breaks the thing all of those share — **the assumption that your body
takes orders.**

An octopus has around 500 million neurons and roughly two thirds of them are not
in its head. Each arm carries its own ganglion and can taste, grip, reject and
withdraw with no reference to the central brain whatsoever; a severed arm still
catches food and passes it toward where a mouth used to be. The animal's brain
does not know where its own arms are in any detailed way. It issues *intent* —
"reach toward that" — and the arm computes the rest locally.

So the game gives you exactly that and nothing more. You have:

- **a body** you can steer, and
- **two points of attention.**

Everything else is eight semi-autonomous agents that will grip, probe, cling,
recoil and flinch on their own reflexes whether you wanted them to or not. The
skill of the game is not dexterity. It is **delegation**: deciding which two of
eight arms are worth being the boss of right now, and building the rest of your
plan out of arms you have already let go of.

That inversion is not a reskin of anything here. Plumbline is about controlling a
thing at the end of a cable; Nine Minds is about controlling a thing that has
opinions.

## 2. Player fantasy

It is 2:40am in a marine research facility. You are *Octopus vulgaris*, you have
been in tank 4 for nine months, and tonight somebody left the jar lid loose.
Three hundred metres of concrete, dry floor, a night watchman and a pump hall
stand between you and the outfall pipe that runs to the sea.

You are the strongest, softest, most impossible thing in the building. You can
pour your entire body through a hole the width of your beak. You can turn the
colour and the *texture* of wet concrete in about a second and a half. You can
unscrew a jar. And you will suffocate in about ninety seconds if you are out of
water, which is the only reason this is a game and not a walkover.

## 3. The central mechanic: attention

### 3.1 Arms are agents, not limbs

Each of the eight arms is a state machine with its own local rules:

| State | Meaning | Who drives it |
|---|---|---|
| `reflex` | Default. Arm does whatever its local ganglion wants. | The arm |
| `reaching` | Extending toward a commanded target. | You (costs focus) |
| `holding` | Gripped on a commanded target, no longer supervised. | Nobody — it decays |
| `working` | Turning / pulling / prying a mechanism. | You (costs focus) |

Reflex behaviour is *not* idle animation. An unsupervised arm will:

- **grip** any surface that brushes it, which is how you climb without thinking
  about it;
- **probe** crevices near it — and an arm that finds a gap you had not noticed
  reports it to you. Arms find most of the routes in this game.
- **taste** food and pass it inward (octopus arms have chemoreceptors on the
  suckers — they literally taste what they touch);
- **recoil** from anything hot, sharp, dry or bright;
- **flinch** when the central brain is frightened — and a flinching arm knocks
  things over, which makes noise, which is how you get caught.

So free arms are simultaneously your traversal system, your search system and
your worst liability. You cannot simply supervise everything: you have two focus
slots.

### 3.2 Focus is the whole economy

- You have **2 focus slots** (3 after the first act, as the animal calms down).
- Commanding an arm occupies a slot while it *reaches* and while it *works*.
- The moment a commanded arm achieves a grip, it drops to `holding` and gives the
  slot back — but nobody is minding it any more, so its **grip decays**, at a
  rate set by the surface: rough rock is nearly free, painted steel is bad,
  wet aquarium glass is atrocious.
- Re-touching a `holding` arm with focus re-tightens it, which costs you a slot
  for a moment.

This produces the actual gameplay verb of Nine Minds: **set and leave**. Anything
in the building that needs more than two arms — the drain grate needs three, the
outfall shutter needs four across two latches two metres apart — must be built up
out of arms you set, released, and are now racing the decay on. The failure mode
is not "I pressed wrong", it is "I spent too long on the third latch and the
first one let go."

### 3.3 Haul

Grip alone does nothing. `E` contracts **every** committed arm at once — the
haul. Total force is the sum of each committed arm's grip; the mechanism has a
threshold. Haul with too little total grip and you simply rip your own arms off
the surface and have to start again, which is where the tension lives.

## 4. Systems

### 4.1 Soft body

The octopus is a capsule whose radius you control. Squeeze (`right mouse`) drives
radius from 1.0 down to 0.30 — the diameter of the beak, the only hard part of
the animal and therefore the only real limit on where it can go. Volume is
conserved, so squeezing makes you longer and visibly stretches the mantle.

The rule the level design is built on: **any gap wider than your beak is a
door.** There are no keys in this game. Collision is run against the squeezed
radius, so the player's question at every wall is never "where is the way
through", it is "how small am I willing to be", because squeezing:

- halves your speed,
- doubles oxygen burn,
- freezes camouflage (you cannot hold a pattern and a shape change at once),
- and stops you jetting entirely.

### 4.2 Air, water, and the ninety seconds

In water you breathe and refill the mantle. On dry land oxygen falls, and every
route in the game that is *short* is dry. The optimal line through the building
is almost never the safe one; it is a sequence of dashes between puddles, and
the puddles are where the watchman looks.

Jetting (`space`) is a burst of mantle water — fast, silent-looking, but it
throws a visible plume and a clearly audible whump, and it empties a reserve
that only refills underwater.

### 4.3 Camouflage

Skin runs a chromatophore model: the mantle samples the substrate directly
beneath it (every surface in the level carries a colour and a roughness) and
blends toward it. Blend rate depends on how still you are; moving fast resets it.
Papillae raise to match rough substrates, so a perfect colour match on the wrong
texture is still a 70% match, not a 100% one.

Detection is continuous, not binary. A threat accumulates suspicion at a rate of

```
rate ∝ (1 - match) · illumination · motion · angleFalloff / distance²
```

so you are never simply "hidden" or "seen" — you are *being seen at some rate*,
and the counterplay is to reduce any factor in that product. Stop moving. Get
into shadow. Break the light (an arm can pull a cord). Get onto a substrate you
already match. Or ink.

### 4.4 Ink

One charge, ninety-second recharge. Ink releases a **pseudomorph** — a
body-sized, body-shaped blob of mucus-bound ink that hangs in the water and
holds the threat's attention for about four seconds while the real octopus goes
the other way — plus a spreading cloud that blocks line of sight. It is the
strongest button in the game and it is also evidence: ink stains the water, and
a watchman who walks past a stained channel goes to alert.

### 4.5 Threats

- **The night watchman** — patrols a route with a torch. Cone of light, cone of
  vision, and *hearing*: knocked-over objects, jets and haul failures make noise
  with a radius. Catches you by getting close while suspicious.
- **The floor scrubber** — an autonomous cleaner in the pump hall. Blind and
  deaf, but it is a metre wide, it never stops, and being run over is being
  caught.
- **The pump intake** — not an enemy, a force. A suction field in the pump hall
  that pulls harder as you approach. It is also the fastest route across the
  room if you are willing to be dragged and grip out at the right moment.

### 4.6 Mechanisms

Every interactable is a load and a grip requirement, not a prompt:

| Mechanism | Arms | Note |
|---|---|---|
| Jar lid | 2 grip + 1 twist | Tutorial. Contains a crab: food restores stamina. |
| Drain grate | 3 | Slippery wet steel; grip decays fast. |
| Sluice valve | 2, three hauls | Each haul turns it 120°; grip decay between hauls is the difficulty. |
| Light cord | 1 | Kills a zone's lighting. Free camouflage, but the watchman notices a dark room. |
| Outfall shutter | 2 latches × 2 arms, simultaneous | The exam. Four arms, two metres apart, all decaying. |

## 5. The building

One continuous map, three zones, no loading:

1. **The gallery (your tank).** Glass, gravel, a rock arch, the jar. Teaches
   reflex gripping, focus, haul, and the first dry crossing over the rim.
2. **The wet room.** Concrete floor, a flooded channel running its length, the
   watchman, a light cord, the drain grate and the sluice valve. Teaches
   camouflage, noise and the set-and-leave economy.
3. **The pump hall.** The scrubber, the intake, overhead pipework, and the
   outfall shutter. Exam.

Then the outfall pipe, and the sea.

## 6. Controls

| Input | Action |
|---|---|
| `W A S D` | Body intent (crawl / swim) |
| Mouse | Camera |
| Left click | Command the best-placed free arm at whatever the reticle is on |
| `E` | Haul — contract every committed arm |
| `Q` | Re-tighten the nearest holding arm (costs a slot briefly) |
| `Shift` | Freeze — stop dead, camouflage blends at full rate |
| Right mouse | Squeeze |
| `Space` | Jet (in water) |
| `X` | Ink |
| `Tab` | Release all arms |

## 7. Scoring

Rank on exit from four terms: **time**, **times seen**, **oxygen floor** (how
close you came to drowning in air), and **discoveries** (gaps your own arms found
that you then used). A perfect run is fast, never seen, never below 30% oxygen
and routed mostly through holes the player never spotted personally — which is
the thematic point of the whole thing: the arms are better at this building than
you are.

## 8. Technical

- Three.js r163, vendored locally. No CDN, no build step, no asset files — all
  geometry, all textures, all audio generated at load.
- Arms are FABRIK chains of 9 segments, skinned each frame into a pre-allocated
  tube geometry (8 arms × 10 rings × 8 radials, updated in place; no geometry
  reallocation at runtime).
- Collision is capsule-vs-AABB against the level's box colliders, resolved with
  the *current squeeze radius*, which is what makes the soft-body rule real
  rather than scripted.
- Substrate lookup, illumination and suspicion all run off the same collider
  list, so camouflage is a property of the level geometry rather than a set of
  trigger volumes.
- Target 60fps at 1440×900 on integrated graphics; single directional light plus
  a small number of cheap point lights, no shadows on arms.

## 9. Out of scope (v1)

Multiplayer. A second animal. Procedural buildings. Save/continue — a run is one
sitting, six to nine minutes.
