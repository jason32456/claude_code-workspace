# Nine Minds — PRD

## 1. One-liner

A 3D reef-survival game where you are an octopus — and you do **not** get to drive
your own arms. An octopus has nine brains: one in the head and one in each arm.
You are the one in the head, you can consciously attend to **three arms at a
time**, and the other five are out there making their own decisions.

## 2. Why this one

The repo has 52 projects and about eighteen 3D games. Every one of them gives the
player *complete* authority over the avatar and then makes the **world** hard:
the wind decides (Windward), the pendulum decides (Plumbline), the fire decides
(Emberline), the glass decides (Gather), the rock decides (Crux). Vesper comes
closest to this by making the avatar a crowd, but the crowd has one shared will —
you steer the whole murmuration with one stick.

Nine Minds is the first project where **the avatar itself is not fully yours**.
The hard thing is not the reef; it is that half of your own body is improvising.
An arm you are not attending to will find food you never saw, and it will also
reach into a crevice with a moray in it. Attention — not health, not stamina — is
the scarce resource, and the game is a continuous decision about which three
eighths of yourself to actually be.

Everything else follows from real cephalopod biology, which is convenient,
because the biology is already a game design:

| Real thing | Becomes |
|---|---|
| ~2/3 of an octopus's neurons are in its arms | 5 arms run on reflex, permanently |
| It can pass through any gap its beak fits | Squeeze is a verb, not an animation |
| Chromatophores match substrate in ~300 ms | Camouflage is a live value, and stillness feeds it |
| The systemic hearts **stop** during jet swimming | Sprinting is anaerobic and has to be repaid |
| Ink is released as a *pseudomorph* — a body-shaped decoy | Ink is a fake octopus, not a smoke bomb |
| Arm autotomy: an octopus sheds an arm to escape, and the arm keeps writhing | Getting caught costs an arm, and the arm buys you 8 seconds |

## 3. Player fantasy

You are a common octopus, five hours after sunset, on a reef where everything
larger than you eats things like you. You are not fast and you are not armoured.
You are *soft* — which means you fit places nothing hunting you fits — and you are
**invisible when you decide to be**, which is a decision that costs attention you
were spending on something else.

## 4. Core loop

```
        ┌──────── READ ─────────────────────────────────┐
        │ where is the grouper looking, what substrate  │
        │ am I on, which crevices have I not probed     │
        └───────────────┬───────────────────────────────┘
                        ▼
        ┌──────── SPEND ATTENTION ──────────────────────┐
        │ 3 pips. Tasking an arm costs one until it     │
        │ arrives. So does focusing camouflage, and so  │
        │ does squeezing. You cannot do all three.      │
        └───────────────┬───────────────────────────────┘
                        ▼
        ┌──────── LET GO ───────────────────────────────┐
        │ unattended arms grip, probe, snatch and       │
        │ blunder on their own. Free food. Free bites.  │
        └───────────────┬───────────────────────────────┘
                        ▼
        ┌──────── EAT / HIDE / RUN ─────────────────────┐
        │ crabs, clams, crevice shrimp → quota          │
        │ caught in the open = dead; caught on rock =   │
        │ shed the arm and live with seven              │
        └───────────────┬───────────────────────────────┘
                        ▼
              den before dawn  ·  or  ·  taken
```

## 5. Mechanics

### 5.1 Attention (the heart of it)

The central brain has **3 attention pips**. A pip is consumed by:

- an arm in **transit** to a target you clicked (released the moment it arrives —
  holding on afterwards is free, because a gripping arm is running its own local
  program)
- an arm you are actively **prying** with (continuous)
- **focused camouflage** (`C`, continuous)
- **squeezing** (`Shift`, continuous)

Everything else your body does, it does without you.

### 5.2 The other five arms

Every arm not currently attended runs a reflex program each tick, in priority
order:

1. `HURT` — recoil, and refuse to be tasked for 12 s
2. `HOLD` — if it has food, keep it; drift it toward the mouth over time
3. `SNATCH` — food within 1.45 m and not already held → take it (this is free food
   you did not see)
4. `PROBE` — an unprobed crevice within 1.9 m → reach in for 2.4 s. A crevice
   holds shrimp (good), nothing, or a **moray** (very bad)
5. `WALK` — otherwise, join the crawl gait: plant, pull, release

Reflex arms are why the game is not a chore, and reflex arms are why the game
kills you. Both.

### 5.3 Crawling, and why carrying things is slow

Crawl speed scales with how many arms are actually planted:

```
speed = 2.1 m/s × (planted / 8) × squeezeFactor × (1 − 0.10 × armsCarrying)
```

An octopus with three crabs in hand and two arms tasked is walking on three arms
and moves like it. Jetting (`Space`) is 4× faster, ignores grip entirely, and is
**anaerobic**: it fills an oxygen-debt bar that only drains while you are slow,
and a full bar halves everything until it clears.

### 5.4 Camouflage

Skin carries three values — hue, lightness, texture (papillae) — that drift
toward the substrate under the body:

```
rate  = 0.35 /s  passive
      = 1.60 /s  while focused (C, costs a pip)
      × (1 − 0.8 × normalisedSpeed)     movement fights the match
match = 1 − ‖skin − substrate‖
```

Five substrates (sand, rubble, coral, seagrass, bare rock) with different
signatures, so *where* you stop matters as much as whether you stop. Crossing a
sand channel with a coral-matched skin is the single most dangerous thing in the
game.

### 5.5 Being seen

Predators do not have vision cones so much as an evidence accumulator:

```
cue        = 0.60 × (1 − match) + 0.62 × motionWeight × speed + 0.45 × litByTorch
gain       = cue × facing × falloff(distance) × acuity
suspicion += (gain − 0.14) × dt        [0 … 1]
```

At 0.5 the predator turns and investigates; at 1.0 it commits. A grouper's acuity
is 1.0, a reef shark's is 1.5 and it weights motion twice as heavily — you cannot
out-hide a shark, you have to not move. The 0.14 subtracted every second is the
whole defence: below that floor an animal can never finish building a case
against you, so holding still is a real answer rather than a delay. Patrol legs
are biased toward wherever you are about 55% of the time, because a 48 m reef
with one grouper wandering it uniformly is not a reef with a grouper on it.

### 5.6 Getting caught

On contact the game asks one question: **is any arm gripping hard substrate?**

- **Yes** → autotomy. That arm is severed, keeps writhing, and holds the
  predator's attention for 8 s while you jet. You continue the night with 7 arms
  (fewer planted arms, slower crawl, weaker pry). Arms regrow one per night.
- **No** → the night ends.

A moray takes an arm the same way, with one difference: probing with an
*attended* arm gives you a 1.3 s window to pull back and get away with a bruise.
A reflex arm gets no window at all, which is the price of not watching it.

### 5.7 Squeeze

`Shift` conserves body volume: the mantle flattens and lengthens. Effects:
silhouette (and therefore conspicuity) drops 45%, crawl speed drops 40%, one pip
is consumed, and gaps narrower than the body — crevice mouths, the den, a fish
trap's funnel — become passable. The rule is the real one: anything the beak fits
through, the octopus fits through.

### 5.8 Ink

`Q` releases a pseudomorph: a mucus-bound blob that inherits your **current skin
colour and silhouette** and drifts on the current for 6 s. Any predator with
suspicion on you transfers it to the decoy. Inking while badly camouflaged
produces a decoy that looks exactly as wrong as you do, and fools nothing —
so ink is a tool for escaping *well-hidden*, which is the opposite of when
players reach for it.

## 6. Nights

| # | Reef | Introduces | Quota |
|---|---|---|---|
| 1 | The Shallows | crawl, task an arm, crabs | 3 |
| 2 | Rubble Flats | camouflage, the grouper | 5 |
| 3 | Crevice Garden | squeeze, clams (two-arm pry), morays | 7 |
| 4 | Sand Channel | reef shark, ink, long open crossings | 9 |
| 5 | The Trap Line | fish traps, a diver's torch | 11 |

Each night is a fixed clock from full dark to first light. Dawn is not a timer
readout, it is the sky: the water goes from near-black to grey-blue, and your
camouflage stops being enough. **You must be in the den when it comes.**

## 7. Scoring

```
score = 100 × food + 250 × nightsCleared + 60 × armsRemaining + timeBonus
```

Arms are permanent within a run, so the score rewards the player who never got
grabbed at all.

## 8. Non-goals

- No combat. You cannot fight a grouper; there is no attack button.
- No upgrades, no shop, no XP. The only thing that changes across nights is how
  many arms you still have.
- No text tutorial pop-ups beyond a one-line briefing per night.

## 9. Technical

- Three.js, vendored locally. No CDN, no build step, no asset files at all.
- Reef terrain: 128×128 value-noise heightfield, per-vertex substrate colouring,
  instanced boulders / coral / seagrass.
- Arms: 8 Verlet chains of 10 nodes, distance-constrained, tip-driven toward a
  target, rebuilt each frame into a single tapered tube geometry per arm
  (pentagonal cross-section, 50 verts/arm).
- Caustics: injected into the terrain material via `onBeforeCompile` — two
  scrolling ridged-noise layers sampled in world XZ, no texture.
- Audio: fully synthesised — surge, heartbeat that tracks oxygen debt, jet
  whoosh, shell crack, the click of a crab, and the low thump of something large
  turning toward you.
- Target: 60 fps at 1440×900 on integrated graphics.
