# Firn — PRD

## 1. One-liner

You are a snowball. **You grow by eating the mountain**, and every metre you
add makes you harder to stop and harder to steer.

## 2. Why this one

The other 3D games in the collection keep the player the same size from start to
finish. A car is a car and an octopus is an octopus. The puzzle changes but the
thing you control does not.

In Firn, the thing you control changes the whole time. A 0.5 m snowball bounces
off a fence post, and a 6 m one picks it up without noticing. The same pine
tree is first a wall, then a stop sign you can smash through if you have the
speed, and finally something that sticks to you. The level never changes. You do.

It is also the only game here where the terrain is a **finite resource you
consume**. The snowpack is a depth field, and rolling over it removes the snow
you pick up, so your own track is bare and you can't refuel on it. Choosing a
line is choosing which snow to eat.

## 3. Player fantasy

A cornice breaks off a ridge at dawn. You start as a fistful of snow and crawl
through deep powder at walking pace, picking up pinecones. By the treeline you
are as tall as a person and the saplings fold under you. In the couloir you clip
a rock band, lose a third of yourself in a spray of chunks, and land a cliff
drop at 80 km/h. At the bottom a frozen waterfall closes the gully, and you
reach it with enough energy to go straight through.

## 4. The one idea: mass is everything, and everything costs mass

Three numbers drive the game, and the HUD shows all three:

- **Radius r.** Ball mass is `ρ_ball · 4/3 π r³` with `ρ_ball = 400 kg/m³` (packed
  snow), plus whatever you have picked up.
- **Speed v.** A uniform sphere that rolls without slipping accelerates at `5/7 g sin θ`.
  Air drag scales with area, so it slows a big ball much less than a small one
  (drag deceleration ∝ 1/r).
- **Impact energy E** = ½ m v² · 7/5 (translational plus rotational). This is what
  breaks things.

### Accretion is a momentum cost

Snow you pick up is standing still. Absorbing a mass `dm` at speed `v` dilutes your
momentum: `v ← v · m / (m + dm)`. So deep powder grows you fast and also brakes you
hard, while ice and rock let you run fast and wear you down. That gives the core
loop:

| Surface | Grows | Shrinks | Speed |
|---|---|---|---|
| Deep powder | fast (dry: lower stickiness) | — | heavy braking |
| Wind crust | slow | — | light braking |
| Ice | — | slight abrasion | fast, low friction |
| Rock band | — | heavy abrasion, chunks | high friction |
| Slush (valley floor) | fast | melts | heavy braking |

### Steering is a size cost

Your steering authority (a lateral acceleration perpendicular to your velocity)
falls off as `1 / (1 + r / 1.2 m)`. A small ball darts, and a big one carves
wide arcs. Growing gives up control in exchange for weight.

### The snowpack is a field you consume

The course is a 0.5 m grid of snow depth. The ball's contact patch has a half-width
of `√(2 r p − p²)` for a sink depth `p`. Every cell under it gives up snow down to a
floor, and that snow goes into the ball, multiplied by the stickiness (dry powder at
altitude sticks less than wet snow lower down). The rest is lost as spray. The
depth texture feeds the terrain's vertex shader, so the groove you carve is real
geometry, and the ground colour shows through where you have scraped it bare.

### Props: absorb, smash or bounce

Each prop has an absorb radius, a mass and a break energy. On contact:

1. **Absorb** if the ball's radius is at least the prop's absorb radius. It sticks at the contact point and rolls with the
   ball. Its mass is added, and as more snow builds up it gets buried and
   disappears.
2. **Smash** if the impact energy along the contact normal is above its break
   energy. The prop topples, the ball spends that energy, and it sheds a little snow.
3. **Bounce** otherwise. The normal velocity reverses at restitution 0.25, and
   the ball sheds snow in proportion to the impact speed.

Props, smallest to largest: pinecone, stone, mitten, ski pole, sled, fence post,
snowman, signpost, sapling, hay bale, boulder, pine, hut, lift pylon.

### The finish: the ice curtain

Each run ends at a frozen waterfall that spans the gully. It breaks only if your
impact energy is at least the level's `E_req`. The medal is the ratio `E / E_req`:
≥ 1 bronze, ≥ 2 silver, ≥ 4 gold. Too small and you splat against it. A run also
fails if you stop for 3 s or shrink below 0.12 m.

### Temperature

Air temperature rises 6.5 °C per km as you descend. Below 0 °C nothing melts and
powder is dry (less sticky). Above 0 °C snow sticks well but you melt at a rate
proportional to the temperature times your surface area.

## 5. Levels

All four are built by one seeded generator (a slope profile, valley walls, value-noise
bumps, a snow-type zone map and prop scatter) from different parameters.

| # | Name | Length | Pitch | Character | E_req |
|---|---|---|---|---|---|
| 1 | Cornice | 700 m | 13° | powder fields, small props, fences | 1.5 MJ |
| 2 | Treeline | 1000 m | 16° | dense pine forest, huts, rock bands | 3.5 MJ |
| 3 | Couloir | 1200 m | 20° | narrow chute, ice, a cliff drop, pylons | 6 MJ |
| 4 | Big Mountain | 1600 m | 17° | everything, wide open, warm valley floor of slush | 6 MJ |

The ratings were tuned against the bench bot so that a hands-off straight line
earns bronze or silver, while a good line can reach gold on every run.

Levels unlock in order, and medals are saved to `localStorage`.

## 6. Controls

- **A / D or ← / →**: lean (steer)
- **W / ↑**: tuck (a small forward push that only matters while you are tiny)
- **S / ↓**: brake (extra rolling friction)
- **R**: restart, **Esc**: menu
- **Touch**: hold the left or right half of the screen to lean, and both to brake.

## 7. Presentation

- Three.js (vendored r163), one directional sun with shadows, fog and a sky gradient.
- Terrain: a 1 m vertex grid. `onBeforeCompile` adds displacement from the R8 depth
  texture and blends the ground and snow colours.
- The ball is a lumpy icosphere scaled by r. Absorbed props are children in the
  ball's local frame, culled once they are buried.
- Props are drawn with one `InstancedMesh` per type.
- Particles: a powder plume behind the ball, and chunk bursts on impact.
- The camera chases along the velocity, and its distance grows with r.
- Web Audio, all synthesised: a rolling rumble whose pitch falls as r grows, pickup
  pops pitched by prop size, impact thuds and the ice curtain shattering.

## 8. HUD

Diameter, mass, speed (km/h), temperature, a progress bar down the mountain, the
impact energy against `E_req` on a log bar, and an **absorb hint** that names the
largest prop class you can currently pick up and the next one with the diameter
it needs.

## 9. Architecture

```
src/sim.js      pure simulation: terrain, snow field, ball, props, finish (no DOM, no Three)
src/levels.js   generator parameters for the four runs
src/bot.js      greedy line-picker (title-screen demo + bench)
src/scene.js    Three.js rendering of a sim
src/audio.js    synthesised sound
src/hud.js      DOM HUD + menus
src/main.js     loop (fixed 120 Hz sim step), input, glue
scripts/bench.mjs   headless physics checks + bot runs
scripts/screens.mjs README screenshots
```

## 10. Acceptance (bench)

1. On a uniform incline, the rolling acceleration matches `5/7 g sin θ` within 1%.
2. Mass accounting closes: initial + stuck snow + props − shed − melted = final mass,
   to 1e-6 relative.
3. Snow removed from the field equals stuck plus sprayed snow.
4. Steering authority falls monotonically with r.
5. A greedy bot (it looks ahead for snow and absorbable props and avoids props it
   would bounce off) clears all four levels.
6. Rolling straight down the centre without steering does **not** earn gold on
   level 3, so line choice matters.

## 11. Out of scope

Multiplayer, level editor, avalanche (secondary) simulation, sound samples.
