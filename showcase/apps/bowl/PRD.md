# Bowl — Product Requirements

## One line

A 3D railway hump yard. A locomotive shoves a mixed freight train over a small
hill, the cars come apart at the crest, and gravity rolls each one down into a
fan of sorting tracks called the bowl. You line the switches and work the
retarders, which are rail brakes that squeeze the wheels. Each cut has to reach
the cars already standing on its track and couple to them at walking pace.

## Why this game

Most vehicle games in this repo give you something to steer. Here you never
drive anything. Once a car leaves the crest it is a free body: it speeds up on
the grade and loses speed to rolling resistance, curves and the wind. You get two
places to take speed off it and none to add any back. Brake too little and it
hits the standing cars hard enough to damage the freight. Brake too much and it
stops short, leaving a gap a trim engine will have to close later. The skill is
reading how freely each car rolls and deciding how much speed it needs to arrive
gently at a coupling point that moves a little further out with every car you
add.

The switch ladder adds time pressure. A switch cannot be thrown while a car is
on it. A free-rolling empty car can catch a sticky loaded car ahead of it, and if
the switch is still occupied when it arrives it goes down the wrong track.

## Core loop

1. **Shift brief.** Weather (temperature, wind along the yard), the inbound
   trains, the blocks (outbound destinations, each with a colour) and which
   classification track each block is assigned to.
2. **Hump.** The pusher shoves the train toward the crest at the hump speed you
   set (W/S). Each cut (1–4 cars bound for the same block) uncouples when its
   centre of mass passes the crest and rolls away on its own.
3. **Route.** Every cut is auto-lined to its block's track. Press **1–8** to
   send the next cut somewhere else, for example to open an overflow track when
   one fills up. Switches throw only when they are clear of cars.
4. **Brake.**
   - **Space** squeezes the *master retarder* on the hump lead, which every cut
     passes through. Use it to space cuts apart and to take the energy out of
     heavy cars.
   - **B** squeezes the *track retarders* at the entrance to each bowl track.
     They set the final speed.
   A retarder's clamp force is a fixed part plus a part that grows with the
   car's weight, so an empty 30 t car still slows about twice as fast as a
   loaded 120 t one.
5. **Couple.** The cut rolls out along the bowl track and couples to the
   string standing there. The speed it hits at is graded.
6. **Settle.** The shift ends when every train is humped and every car has
   stopped. The trim engine then closes gaps, and the score is tallied.

## Physics (all in `src/sim.js`, geometry in `src/track.js`)

- **Track profile.** The approach climbs at 1.2% to a crest. The hump falls at
  4.0% for 35 m, the master retarder section at 1.5%, the ladder at 0.8% with
  extra resistance through each switch curve, the track retarders at 0.6%, the
  bowl entry at 0.3%, and the bowl body at 0.05%. Each track ends at a bumper.
  Inert retarders in the bowl hold standing cars (12 kN per car) so a headwind
  cannot blow them back up the ladder.
- **Per-car forces.** The grade force is `m·g·grade(s)` at each car's own centre,
  so a cut half over the crest is still being held back by its rear car. Rolling
  resistance is `m·g·rr`, where rr runs from 0.0012 for a free roller to 0.0045
  for a stiff one and goes up in the cold (+3% per °C below 5 °C). Curve
  resistance applies in the switch zones. Air drag is `½ρ·CdA·v_rel|v_rel|`
  against the wind along the yard, at full CdA for the lead car and 30% for each
  car behind it. Rotating wheelsets add 5% effective mass.
- **Retarders.** Each car whose centre is inside an active retarder gets a
  braking force: master 40 kN + 0.65 N/kg × mass, track 25 kN + 0.5 N/kg ×
  mass. That works out to 1.9 / 0.9 m/s² (master) and 1.3 / 0.7 m/s² (track)
  for a 30 t empty and a 120 t load. A long cut is only braked by the cars
  actually in the retarder. Static friction is modelled, so a car stays at rest
  until the grade beats rolling resistance plus any retarder still clamped.
- **Couplings.** A cut that touches the string ahead of it on the same path
  couples perfectly inelastically, with momentum conserved. The closing speed
  is graded: ≤ 6.4 km/h (4 mph) is good, ≤ 9.7 km/h is firm, and anything faster
  damages freight (heavy damage above 14.4 km/h). Hitting the bumper above
  6.4 km/h is also damage.
- **Switches.** Seven switches form a three-level binary ladder feeding eight
  tracks. A switch is occupied while any car is between 3 m before its points
  and its fouling point 28 m past them. An occupied switch cannot be thrown.
  The front of a cut takes whichever leg the switch is lined for when it
  arrives, so a misroute is something that physically happens rather than
  being scored after the fact.
- **Rollability radar.** On the first part of the hump the yard measures each
  cut's energy gain, subtracts the known grade work and wind drag under every
  car, and reports an estimate of rr with about ±0.0002 noise (more if the cut
  was released late and the window is short). That estimate is all the assist (and the bot) know.

## Scoring

| Event | Points |
|---|---|
| Car on its block's track at the end | +10 |
| Good coupling (≤ 6.4 km/h), per cut | +5 per car |
| Firm coupling (≤ 9.7 km/h) | 0 |
| Damaging coupling | −30, or −80 above 14.4 km/h |
| Car on the wrong block's track (misroute) | −25 |
| Gap left between strings | −0.5 per metre |
| String fouling the ladder (track overfilled) | −40 |
| Past the departure deadline | −1 per second |

Medals are gold ≥ 80%, silver ≥ 65% and bronze ≥ 45% of the shift maximum
(15 per car). If a string backs up over the crest and the hump stays blocked
for 90 s, the shift is called off and every car not yet humped counts as
unsorted.

## Shifts

1. **First Shift.** 12 °C, calm, one 26-car train, five blocks, empty bowl, slow
   hump. The prediction ghost is on by default.
2. **Cold Snap.** −16 °C, which makes everything roll stiffly, a 3 m/s
   headwind, two 26-car trains, six blocks, and strings already standing in
   some tracks.
   One block is longer than its track, so you have to open an overflow track.
3. **Night Wind.** 4 °C at night with floodlights, and a headwind gusting 8–14
   m/s that is brutal on empty autoracks. Three trains (72 cars), six blocks, a
   crowded bowl and two spare tracks.

## Assist: the prediction ghost (G)

For the cut that is braking now, the game rolls its future forward on the
*estimated* rr and shows where it would stop or couple, and how fast. A marker
on the target track and the gauge both show this, coloured green, amber or red.
The prediction only knows what the radar measured, so in a gusting wind it is
wrong at the margins.

## Interface

- 3D yard: hump, tower, master retarder, ladder, switch stands with lamps
  showing which way each is lined, eight bowl tracks, floodlight towers, pusher
  locomotive, and cars by type (hopper, tank, box, autorack) carrying their
  block's colour.
- Cameras (C): tower, crest, follow-the-cut, overview. Drag to orbit, wheel to
  zoom.
- HUD: shift status, the cut queue (cars, weight, radar roller grade, planned
  track), the track board (block, fill, last coupling), the active-cut gauge, a
  live yard diagram like a hump tower panel, and event toasts.
- Phone: on-screen hold buttons for the two retarders, tap a track row to route
  the next cut, and hump-speed buttons.
- Synthesised audio: retarder squeal, coupling clank scaled by speed, pusher
  diesel, wind.

## Bot and bench

`src/bot.js` drives the same inputs a player has. It holds the shift's hump speed,
opens an overflow track when a block's track runs short, brakes in the master
retarder when even full track braking would couple too hard or when the cut
would reach a switch before the cut ahead has cleared it, and brakes in the
track retarder until the predicted coupling speed is under 4.9 km/h. It uses
only the radar estimate. `scripts/bench.mjs` runs headless in Node and checks:

- determinism (same seed, same final state hash)
- free roll deceleration = rr·g on a flat test track
- hump descent speed against the closed-form energy result
- momentum conservation at a coupling
- retarder decel scales as 1/mass
- an occupied switch refuses to throw, and a misroute happens when it should
- car ledger: every car ends on exactly one track
- the bot takes gold on every shift; a no-brake bot damages freight; a
  never-route bot misroutes

## Non-goals

No multiplayer, no outbound train assembly or departure-yard play, and no
locomotive driving.
