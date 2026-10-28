# Hirsel — PRD

*Hirsel* (Scots): a flock of sheep, and the ground they graze.

## 1. One-liner

A 3D sheepdog trial in which **you are the handler, not the dog**. You stand at
the post, the sheep are 150 metres up the field, and the only thing you can do
is whistle.

## 2. Why this one

Every other game in the collection gives you a body: a snowball, an octopus, a
flock, a climber, a boat. Even the indirect ones (Plumbline's pendulum, Pebble's
sweepers) still let you touch something.

Hirsel has two layers of indirection. You command a dog, the dog pressures the
sheep, and the sheep decide for themselves. The dog does exactly what it was
told, a quarter of a second late. The sheep never do exactly what you want.
The skill is reading where the dog needs to be *before* the sheep need it
there, and stopping it at the right moment.

It is also the only game here that is judged rather than scored. The judge
starts with 100 points and takes them away for every metre the flock drifts
off line, every gate it misses and every sheep that bolts. That mirrors how real
ISDS trials work.

## 3. Player fantasy

A wet morning in a Borders glen. You send your collie left on a wide, pear-shaped
outrun, and she drops behind five blackface ewes without disturbing them. You
whistle her on, a little at a time. The sheep lift calmly and come down the
field in a tight knot, straight through the fetch gates and round your legs.
Then you drive them away from you, which is the hard part, and you are watching
a dog 100 m off and judging the angle by eye. Finally the shed and the pen. The
gate swings shut with forty seconds on the clock, and the judge has taken off
only nine points.

## 4. Controls: the whistles

| Key | Whistle | Dog does |
|---|---|---|
| **D** | *Come bye* | Flanks **clockwise** round the sheep, and keeps going until told otherwise |
| **A** | *Away to me* | Flanks **anticlockwise** |
| **W** | *Walk up* | Walks straight at the sheep, and stops short of them on its own |
| **S** | *Lie down* | Stops dead and drops |
| **Q** | *Steady* | Halves the speed of whatever it is doing |
| **E** | *Get out* | Widens the flank or outrun by 6 m (up to three times) |
| **Space** | *In here* | Shed: the dog runs through the flock to split it, then holds one side |
| **F** | *That'll do* | Calls the dog back to your feet |

The first flank whistle sends the dog on its outrun. Every whistle is a
distinct synthesised pitch pattern, so you learn to play by ear as well as by
key. The dog reacts 0.25 s after the whistle. On the hill course, wind gusts
can carry a whistle away, and the dog never hears it.

Other keys: **C** cycles the camera (post, judge's stand, dog), **H** toggles the
handler's eye (an assist that shows the balance point and the ideal line),
**Tab** (hold) runs time at 3×, **R** restarts and **Esc** returns to the menu.
On touch, the whistle bar is a row of buttons.

## 5. Systems

### 5.1 Sheep: a flight zone, not a script

Each sheep is an agent steering towards a desired velocity built from:

- **Flight from the dog.** Pressure is `p = (1 − d / fz)`, where `fz` is the sheep's
  personal flight zone (11–22 m). A running dog adds up to 45% more pressure than
  a still one. Flight speed is `vmax · p^0.75`, so the flock moves at the speed the
  dog asks for, and a dog that pushes in hard gets sheep that run.
- **Stress** rises quickly with pressure and decays slowly (a 4 s time constant).
  It spreads between neighbours. Stressed sheep bunch together (cohesion
  rises up to 13×) and align with each other, and calm sheep spread out and graze.
- **Breaking.** A stressed sheep with the dog deep in its flight zone may bolt for
  2.5–4 s, sideways and towards the draw. That costs points and splits the flock.
- **The draw.** Sheep drift towards where they came from (the let-out pen).
  The pull is weak on the flat and strong on the hill. A driving line that
  ignores the draw curves.
- **The wilful ewe** (hill course). She has courage. A dog creeping in at
  *steady* barely moves her, and she stands and stamps. A firm walk-up shifts her.
- Separation, obstacle avoidance (hurdles, posts, walls, gorse, trees) and a hard
  collision pass against pen hurdles and field fences.

### 5.2 The dog

The dog is a state machine: heel, outrun, flank, walk, lie, in-here, hold and
recall. Flanks orbit the flock's centroid at a radius of flock radius + 0.85 × flight
zone + any get-out width, with a radial correction that makes the dog kick out
when it is too tight. The outrun is pear-shaped: the desired radius shrinks
from its starting distance to just outside the flight zone as the dog comes
round. Each dog has an *eagerness* that tightens the pear. A tight outrun
reaches the sheep inside their flight zone and they bolt before the lift, and
*Get out* is the fix. The dog stops itself at the top of the outrun, at 12
o'clock, directly opposite you.

### 5.3 The course and the judge

The course pieces are the post, the fetch gates, two drive gates, the shedding
ring and the pen. Gates are line segments with a direction of travel. Each sheep's
first crossing of a gate line is recorded as either *through* or *outside*.

| Phase | Points | Ends when | Judge deducts for |
|---|---|---|---|
| Outrun | 20 | the dog reaches the top | intruding into the flight zone, stops, redirections, crossing over |
| Lift | 10 | the flock has moved 12 m | peak sheep speed, breaks, time taken |
| Fetch | 20 | the flock reaches the post | off-line samples every 8 m, a missed or partly missed gate, breaks, a split flock |
| Drive | 30 | the last leg arrives | the same, over three legs and two gates |
| Shed | 10 | a split is held for 2.5 s | time, sheep leaving the ring |
| Pen | 10 | every sheep is inside and the gate swings shut | time, breaks from the pen mouth |

If time runs out, every phase not yet completed scores 0. Placings: **1st** at
≥ 85% of the available points, **2nd** at ≥ 70%, **3rd** at ≥ 55%.

### 5.4 Courses

| # | Course | Sheep | Distance | Phases | Twist |
|---|---|---|---|---|---|
| 1 | Low Meadow (nursery) | 3 | 90 m | outrun · lift · fetch · pen | flat, gentle draw, wide gate |
| 2 | Glen Field (open) | 5 | 150 m | + drive (two gates) | a stronger draw towards the let-out corner |
| 3 | Cairn Brae (hill) | 6 | 210 m | + shed | a rising hillside with dead ground, gorse, a wilful ewe, a strong draw to a gap in the wall, and wind that eats whistles |

Courses unlock in order, and your best score is saved in `localStorage`.

## 6. Presentation

- **Three.js**, vendored. A heightfield pasture with mown stripes, dry-stone
  walls and fences, instanced trees, distant hills, fog and soft shadows.
- Sheep, collie and handler are built from primitives with gait animation (leg
  swing, a head-down grazing pose, a lying pose for the dog).
- **Cameras:** the post camera auto-frames the dog and the flock by narrowing its
  field of view (binocular-style) when they are far away. There is also an
  elevated judge's camera and a chase camera behind the dog.
- **HUD:** clock and phase objective, the judge's card with live deductions,
  the whistle bar with the last heard command, and a minimap showing course
  lines and the flock's trail.
- **Audio:** synthesised whistles (eight pitch contours), bleats (a sawtooth
  through a formant filter with vibrato), wind and skylarks. No audio files.

## 7. Architecture

```
src/sim.js      world, terrain height, sheep, dog, judge (pure, no DOM)
src/courses.js  three course definitions
src/bot.js      balance-point handler: the title-screen demo and the bench
src/scene.js    Three.js rendering
src/audio.js    Web Audio synthesis
src/hud.js      DOM HUD and minimap
src/main.js     fixed 60 Hz loop, input, menus, saves, test hooks
scripts/bench.mjs   headless checks
scripts/screens.mjs Playwright screenshots
```

## 8. Verification (bench)

`node scripts/bench.mjs` runs the simulation headless and checks:

1. **Determinism:** the same seed and the same commands give an identical run.
2. **Flight zone:** a dog standing still 40 m away leaves the sheep calm, and a dog
   walking up moves the flock's centroid away from it.
3. **Flank sense:** *come bye* turns the dog clockwise as seen from above and
   *away* anticlockwise.
4. **Containment:** no sheep ever ends a step inside a pen hurdle or outside the
   field fence.
5. **The bot completes every course** with a placing. It uses the classic
   balance-point rule: put the dog on the far side of the flock from the
   target, stop it there, then walk up.
6. **Handling matters:** a careless handler who sends the dog in at full speed
   scores worse than the bot on Glen Field.

## 9. Out of scope

Multiplayer, a real ISDS rulebook (the deductions here are simplified), double
lifts, and gripping.
