# Siltout — Product Requirements

## One line

A 3D underwater cave-diving game. You swim into a flooded cave running a
guideline from a reel, and that line is the only thing that will get you out
again once your own fins have turned the water to mud.

## Why this game

Nothing else in this repo works like this. The closest things are Sonar, which is
a stealth maze you see with sound, and Kessler, which is zero-gravity movement.
Siltout is about being **disciplined in a place that punishes you later for
mistakes you made earlier**:

- Every careless kick near the floor lifts silt. The silt hangs in the water, and
  in a cave with flow it drifts down the passage you will swim back through.
- Every corner you swim round without tying off leaves the line cutting across
  rock. The line chafes, and if it parts you have lost your way home.
- Every breath is taken at depth, so the deeper you go the faster the gas goes,
  and half of whatever you use going in is what you need to get back out.

The fun is in the way back. On the way in the water is clear. You go fast, admire
the chambers and get greedy. On the way out you are slower, the water is
brown, the line is a white thread you can just about see, and you are reeling
in every tie-off you made, in reverse order, by touch if you have to.

## Core loop

1. **Brief.** Each site has a depth profile, flow, silt type, gas supply and an
   objective (a chamber or an object to reach).
2. **Primary tie-off.** Start in the daylight of the cavern zone. Tie the reel
   to the primary anchor (E).
3. **Swim in.** Steer in full 3D. A frog kick is efficient and gentle. A flutter
   kick is faster but costs gas and blasts silt off a floor below you. Keep
   neutral buoyancy with the wing (R adds gas, F dumps it). Boyle's law changes
   your buoyancy as you go up and down.
4. **Lay line.** The live line runs straight from your last tie-off to you. Tie
   off (E) at rock projections near every bend, or the line cuts across the rock
   and starts to chafe. The reel holds a fixed length, and when it runs out it
   holds you back.
5. **Turn.** Watch the gas against the turn pressure (rule of thirds). Reach the
   objective and turn round, or turn early if the gas says so.
6. **Swim out.** Follow your line home. At each tie-off, untie it (E) so the
   line behind you doesn't wrap the corners you just came round. Hold G for
   touch contact and the diver slides along the line by feel, which works with
   no visibility at all.
7. **Surface the grade.** Gas left, thirds respected, line retrieved,
   visibility you destroyed, wall contacts and time all count. The result screen
   draws a map of the cave, your track and the silt you left behind.

## Systems

### Cave
- Built from a hand-designed graph per site (chambers, tunnels, restrictions,
  dead-end branches and loops) with seeded jitter.
- The rock is a signed distance field: capsules with a flattened silt floor,
  sphere chambers with a smooth union, and 3D noise on the walls. The same field
  is used for collision, silt cells, line chafe tests and the mesh, which comes
  from surface nets on a sparse grid.
- Tie-off points (rock knobs) are scattered along the walls, more of them near
  bends and junctions.

### Diver
- Full 3D swim with thrust along the view direction, quadratic water drag and
  a kick cycle.
- Buoyancy: the wing holds a surface-equivalent volume that is squeezed by
  ambient pressure, `V = Vs / ATA`. The tank gets lighter as you breathe it down.
- Gas: the breathing rate depends on exertion (rest, frog, flutter, stress) and
  is multiplied by ambient pressure. Turn pressure is `start − (start − 0)/3`.
- Collision against the field. Contact with a floor or wall stirs silt and
  counts as a contact.

### Silt
- A sparse voxel grid (1.5 m cells) over the cave. Cells hold concentration.
- Sources: kicks within reach of a silty floor (flutter more than frog,
  scaled by distance), body contact, and exhaled bubbles knocking silt off a low
  ceiling (percolation).
- It diffuses between neighbouring water cells, settles over time, and is
  carried along the passage by the spring flow.
- Visibility is the fog density at the diver's head. Plumes render as lit
  particles that scatter your torch.

### Line
- Fixed segments between tie-offs, plus a live segment from the last tie-off to
  the diver.
- Chafe: if the live segment passes through rock, wear builds up. At 100% the
  line parts, and you are off the line until you swim back to the last tie-off
  and splice in (E).
- Reel capacity is a hard tether.
- Permanent gold lines with arrows exist in some caves. You can tie into one (a
  jump) and follow it home by touch, feeling the arrows.

### Light
- A primary torch as a spotlight. Site 3 fails it on the way out, and you
  switch to a dim backup (B).

## Sites

1. **Pell Spring.** Shallow (6–12 m), gentle outflow, sand floor, generous gas.
   The Throne Room is 120 m in, with one dead-end side branch.
2. **The Ballroom.** 15–22 m, no flow, deep silt. A permanent gold line runs
   along the main tunnel. The Ballroom is down a side passage, so you jump off
   the gold line to reach it. A loop gives you two ways back.
3. **Blackwater.** 24–30 m, strong outflow, low silty ceilings with
   percolation, and a restriction. Tight gas. The primary light fails on the way
   out.

## Grading
- **Fail**: out of gas, or the line parted and you never got back on it before
  the gas ran out.
- **Bronze**: exited.
- **Silver**: exited with objective and at least 20% gas.
- **Gold**: objective, thirds respected (exit with a third left), all line
  retrieved, fewer than 5 contacts.
- Score breakdown on the result card.

## Controls
- Mouse (click for pointer lock) or arrow keys: look. A/D yaw.
- W frog kick, Shift+W flutter kick, S back kick.
- R / F wing inflate / dump.
- E tie off / untie / splice / jump (context).
- G hold for touch contact on the line.
- B backup light. V camera. Esc pause.
- Touch: drag to look, on-screen buttons.

## Technical
- Three.js r163 vendored, vanilla ES modules, no build.
- The sim (`cave`, `silt`, `diver`, `line`, `sim`, `bot`) is three-free and runs
  headless.
- `scripts/bench.mjs` checks the physics invariants (Boyle, gas rate × ATA,
  silt mass under diffusion, chafe detection, tether) and that runs are
  deterministic, then runs bots: the expert gets gold on every site, a
  no-tie-off bot parts its line, and a flutter-only bot silts out.
- `window.__siltout` exposes hooks for screenshot scripting.
