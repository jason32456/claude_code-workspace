# Pebble — PRD

## 1. One-liner

A 3D curling match against an AI skip. **Once the stone leaves your hand you
never touch it again.** The only thing you can change is the ice in front of it.

## 2. Why this one

Every 3D game in the collection gives the player continuous control of
something: a car, a crane trolley, a flock, an octopus arm, a spray line. Plumbline
is the nearest, because its load lags behind the trolley, but you still drive
the trolley for the whole run.

Pebble is the first game where the decision happens in one instant, and after
that the player can only nudge the result through the surface. You pick a line
and a turn, push off, and let go. Everything after that is the stone reacting
to pebbled ice. The one verb you still have is sweeping, and sweeping can only
do two things: make the stone go a bit further and a bit straighter. It can
never make a stone stop sooner or curl more. So you throw with that asymmetry
in mind: light and wide. A stone that is short and curling too much can be
rescued. One that is heavy and too straight is already lost.

It is also the only game in the repo with an opponent that plans around a
shared physical board. The AI skip doesn't run a script. It proposes shots,
plays each one out in the same physics the game uses, adds its own execution
error, and picks the shot that leaves the best house.

## 3. Player fantasy

It's an Olympic sheet at midnight. The arena lights are on and the pebble has just
been sprayed. You are the skip and the thrower at once. You stand in the hack, set
the broom at the far house 29 m away, choose the turn, push out, and let go. Then
you start shouting: sweep, hurry, *hard*. You watch your stone fall off its line
at the hog, curl behind the guard, and slide onto the button with the last stone
of the end.

## 4. Core physics (the one idea: friction is the only thing you can control)

Sheet geometry is the World Curling standard: tee to tee 34.747 m, hog lines 6.401 m
from the tees, back lines 1.829 m behind them, 12-ft house (1.829 m radius),
sheet width 4.75 m. Stones are 19.96 kg discs of radius 0.145 m.

Each moving stone integrates, at 240 Hz:

```
dec  = μ · g · (1 − 0.16·sweep)                    along −v̂
lat  = Kc · clamp(ω/ω_ref, −1, 1) · (1 − 0.5·sweep) / (v + v_c)   along right-perp(v̂)
```

- **Constant friction** (μ ≈ 0.0085) gives the real numbers curlers use:
  draw weight is about 2.2 m/s at release, **hog-to-hog time is about 13.5 s**, and
  a draw takes around 26 s to come to rest.
- **Curl grows as the stone slows.** Lateral force goes as 1/(v + v_c), so a
  takeout barely bends (≈ 0.25 m) and a draw falls about 1.2 m, with most of that
  in the last third of its path. That's why skips place the broom outside the
  target.
- **Sweeping** melts a film of water in front of the stone. It lowers friction by
  up to 16% and halves curl while you're doing it. Sweeping the whole way adds
  about 4 m, which is roughly two rings of the house.
- **Sweepers tire.** A stamina bar drains in about 12 s of hard sweeping and
  comes back slowly, so you can't sweep every stone the whole length. You have to
  choose when.
- **Collisions** between equal-mass discs have restitution 0.85 and a
  frictionless contact. A struck stone leaves with almost no spin, so it runs
  straight. That's why a raise or a double sends stones in straight lines.

## 5. Rules implemented

- Eight stones a side per end, alternate throws, the team without the hammer
  throws first.
- **Hog line:** a delivered stone that doesn't completely clear the far hog line
  is removed, unless it struck a stone in play.
- **Out of play:** touching a side line, or completely past the back line.
- **Free guard zone (five-rock rule):** until the sixth stone of an end, a shot
  may not remove an opponent's stone that sits between the hog line and the
  tee line outside the house. If it does, every stone goes back where it was and
  the delivered stone is removed.
- **Scoring:** the team with the stone closest to the button scores one point for
  every stone in the house that is closer than the opponent's best stone. The
  team that scores loses the hammer. A blank end keeps the hammer where it is.
- Extra end on a tie.

## 6. Controls

| Phase | Input |
|---|---|
| Aim | Move mouse / ← → to place the skip's broom · Q / E (or tap the turn button) to choose counter-clockwise / clockwise |
| Delivery | Hold **Space** (or hold the mouse / Throw button) to push out of the hack. The weight meter climbs through Guard → Draw → Back-house → Tap → Takeout → Peel. Release to let go |
| Sweep | Hold **Space** / mouse / Sweep button while the stone is moving |
| Watch | Hold **F** for 4× time · **Tab** toggles the overhead cam |

The meter isn't linear. Its first 60% covers the draw range (1.8 to 2.6 m/s) slowly,
so fine weight is a timing skill. The rest covers hits quickly.

## 7. AI skip

1. **Propose.** Draws to a grid of spots in and in front of the house (button, top
   four foot, each side, center guard, corner guards), plus hits on every opponent
   stone (takeout, hit-and-roll left/right, peel), raises on its own guards, and
   freezes to the opponent's shot stone.
2. **Solve.** For each proposal it finds release speed and broom placement by secant
   iteration in the real physics on an empty sheet, for both turns.
3. **Evaluate.** It plays each candidate in the full simulation with every stone
   present, including the FGZ and hog rules. It repeats that under three samples
   of its own execution noise and scores the resulting house: exact points on the
   last stone, and before that shot count, distance to the button and guard value
   weighted by who holds the hammer.
4. **Execute** with noise (Club σv 0.06 m/s, σbroom 12 cm; Provincial 0.035 / 7
   cm; Olympic 0.018 / 3.5 cm), then **sweep** its own draws. Every quarter second
   it re-simulates the stone unswept and sweeps whenever the prediction comes up
   short of the plan.

## 8. Presentation

- Three.js scene: a pebbled-ice texture generated on a canvas, painted houses and
  lines at both ends, low boards, and an arena with rows of overhead lights
  and dark stands. Granite stones from a lathed profile with a speckle texture
  and a coloured handle cap.
- Two sweeper figures run beside the thrown stone and work their brooms when
  you sweep.
- Cameras: a long lens from the hack for aiming, a chase cam during travel, and an
  overhead of the house at rest and for the count.
- HUD: a broadcast-style scoreboard by end with a hammer marker, stones left,
  a live 2D house inset, the weight meter, turn, sweep stamina, speed and
  hog-to-hog split.
- Web Audio only: granite rumble scaled by speed, a clack scaled by impulse,
  broom swish, and a crowd swell when a stone counts.

## 9. Scope

- Modes: vs AI (Club / Provincial / Olympic) and two-player hot-seat. Matches of
  2, 4, 6 or 8 ends.
- Out of scope: mixed doubles positioned stones, the timing clock, and
  handedness/delivery animation beyond the release.

## 10. Verification

`node scripts/bench.mjs` checks the physics and rules against numbers that come
from outside the code:

1. Draw weight reaches the tee with a hog-to-hog time between 12.5 and 15 s.
2. Draw curl is between 0.9 and 1.6 m; takeout curl is under 0.4 m.
3. Sweeping the whole way adds 2.5 to 5 m and reduces curl.
4. A head-on hit conserves momentum, and the struck stone leaves with (1+e)/2
   of the shooter's speed.
5. The scoring cases, hog-line removal, and FGZ violation with restore all behave
   correctly.
6. Olympic AI lands a draw in the house on an empty sheet in at least 80% of
   trials, and removes a stone on the button in at least 70%.

## 11. Done means

Playable end to end in the showcase with no build step, three.js vendored, with
screenshots, a README, a registry entry, a root README row, and a bench that
passes.
