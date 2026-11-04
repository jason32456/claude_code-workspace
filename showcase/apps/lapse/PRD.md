# Lapse — Product Requirements

## One line

A hot-air balloon competition at dawn. You have no rudder, no engine and no
steering. You get a burner, a vent and the wind, which blows a different way at
every height.

## Why this game

Every 3D game in this repo with a vehicle lets you point it somewhere. The
sailing game (*Windward*) has a rudder, the snowball can lean, the bee flies
where you aim it. In *Lapse* you only ever move up or down. To go east you
look for a height where the air is going east and climb or sink into it.
Then you wait, because a balloon carries thousands of kilograms of air and
does not respond quickly.

This is how real balloon competitions work. Pilots read the wind before
launch from pibals (small helium balloons whose drift shows the wind at each
height), from smoke on the ground and from other balloons in the sky. They
fly "boxes", layering back and forth across a field, and throw a weighted
streamer at a fabric cross on the ground. The game is built around that.

## Core loop

1. **Brief.** Each flight opens on the launch field at dawn. A pibal sheet
   shows the wind measured at launch, one arrow per 50 m of height. The
   target crosses are on the map.
2. **Fly.** Hold the burner to heat the envelope and the blast-valve roar
   starts. The vent spills hot air. Between them they set your altitude.
   Your track over the ground is the wind at that altitude.
3. **Read the sky.** Pibals keep going up from the launch field. Chimney smoke
   shows the surface wind. Four rival balloons are flying the same task at
   their own heights, so you can see what their layers are doing.
4. **Drop.** Over a target, press **M** to throw a marker. It falls through
   every layer between you and the ground and drifts in each one. The score
   is how far it lands from the centre of the cross.
5. **Land** in a legal field (pasture or stubble) before the thermals start.
   Crops, livestock, woodland and water are penalised. Touching a power line
   ends the flight with zero.

## The physics (all of it in `src/sim.js`)

- **Atmosphere.** ISA pressure `p = p0(1 − 2.2558e-5 h)^5.2559`. Temperature
  follows a per-flight surface value with a dawn **inversion**: air gets
  *warmer* with height up to the inversion top, then cools at 6.5 K/km.
  Balloons lose lift climbing through an inversion. That is the lapse in the
  title.
- **Lift.** `F = (ρ_air − ρ_env)·V·g − m·g − ½ρ·Cd·A·(v_z − w_z)|v_z − w_z|`
  with V = 2,600 m³ and m ≈ 620 kg (envelope, basket, crew, fuel, markers).
  Equilibrium envelope temperature at sea level is about 89 °C.
- **Inertia.** The moving mass includes the air inside the envelope and the
  added mass of air it pushes aside, about 4.7 t in all. That is why a balloon
  takes 30 s or more to answer the burner.
- **Heat.** The burner adds 3 MW (≈1.2 K/s at full blast). The fabric loses
  heat as `U·A·(T_env − T_air)`, with U rising with airspeed through the
  envelope. The vent spills hot air in proportion to how far it is open. Above
  120 °C the fabric is damaged, which costs points.
- **Fuel.** Propane is consumed at 0.093 kg/s while the burner is lit, and its
  mass leaves the balloon as it burns.
- **Horizontal.** The balloon is dragged towards the local wind with quadratic
  drag on the full moving mass. Change layers and it takes about half a
  minute to pick up the new wind.
- **Wind field.** Layer keypoints (height → direction, speed) are interpolated
  on the shortest arc. On top of that come slow spatial noise (so the pibal
  at launch is not the whole truth 4 km away), per-flight time evolution
  (a dying drainage flow, a sea-breeze onset) and, after thermal onset,
  rising bubbles that shove the balloon about.
- **Markers.** 70 g sandbags with tails fall at about 8 m/s terminal speed and
  pick up each layer's wind with a 1.5 s lag.

## Flights

| # | Flight | Lesson |
|---|---|---|
| 1 | **Water Meadows** | Classic veering profile: low air goes east-north-east, high air goes south-south-east. Two goals. Learn to read the pibal sheet. |
| 2 | **Hollow Valley** | Cold drainage flow slides down the valley below 120 m, with a return flow above it. Power lines cross the valley. The drainage dies as the sun comes up. A hesitation waltz lets you pick one of three goals. |
| 3 | **The Saltings** | A coast. At dawn the land breeze blows out to sea at low level. About 18 minutes in, the sea breeze arrives and reverses it. Don't land in the sea. |

Each flight ends when you land, run out of fuel, hit a power line, or reach
the land-by deadline (thermals). Medals come from total points against
per-flight thresholds that the bench calibrates against the expert bot.

## Scoring

- Per goal: `1000 · max(0, 1 − d / 500 m)`, where d is the marker's distance
  from the centre of the cross. A hesitation waltz scores the nearest of its
  goals.
- Landing: +200 in a legal field. −150 for a hard landing (> 3.5 m/s down).
  −300 in a crop or livestock field. −500 in water. −400 for not being down
  by the deadline.
- Envelope over-temperature: −50 per second above 120 °C.
- A power-line strike sets the flight's score to 0.

## Controls

| Input | Action |
|---|---|
| Space (hold) / BURN button | Burner |
| Shift or X (hold) / VENT button | Vent (parachute valve) |
| M / DROP button | Throw a marker |
| H | Altitude hold (assist): the burner and vent are worked for you. Q/E move the set height ±25 m |
| C | Camera: chase, basket, map |
| Drag / wheel | Orbit, zoom |
| Tab (hold) / F (toggle) | Fast-forward ×4 |
| P / Esc | Pause |

## HUD

- Altimeter (MSL and above ground), variometer, envelope temperature gauge
  with the red line, fuel.
- **Wind ladder**: the pibal sheet as arrows by height, with your current
  height marked and the bearing to the next goal drawn across it, so you can
  see which layer points there. Arrows refresh as new pibals report.
- Minimap: terrain, fields, power lines, goals, your track, rivals and markers.
- Leaderboard after the flight: you against the four rivals.

## Rivals and the bot

One planner drives the rivals, the demo and the bench. Every few seconds it
simulates holding each candidate height for five minutes through the real
wind field and picks the one that brings it closest to the goal, with a cost
for changing height. It drops when the simulated marker's landing point stops
getting closer. Rivals get noise and lag on top so that they are beatable.

## Tech

- Three.js (vendored), vanilla ES modules, no build step.
- Ground: a 2048² canvas texture painted per pixel from the same field
  function the sim uses for landing legality, so what you see is what is
  scored.
- Web Audio: a burner roar from filtered noise, wind, and a marker thud.
- `scripts/bench.mjs` runs headless and checks determinism, the equilibrium
  temperature, the climb response, the fuel ledger, marker drift against the
  integrated wind, power-line detection, the bot medalling on all three
  flights and a hands-off run scoring nothing.
