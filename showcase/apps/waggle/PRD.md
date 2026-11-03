# Waggle — Product Requirements

## One line

You are a scout honeybee. Find the flowers, fly home, and tell your sisters
where they are by dancing in the dark.

## Why this game

Every 3D game in this repo has you steering the thing that does the work: a
bike, a boat, a snowball, a collie. In *Waggle* the payoff comes from bees you
never control. You make one flight and one dance, and the colony does the rest.
How well it does depends on how clearly you said what you meant.

The real waggle dance is a vector code: on a vertical comb, the angle of the
waggle run away from straight up is the bearing of the food away from the sun,
and the run's length encodes the distance. Followers average several runs, add
noise of their own and fly the vector, measuring it from wherever the sun has
moved to by then. Recruitment snowballs from there, because a forager who
finds good nectar dances too. Everything in the game comes from that.

## Core loop

1. **Scout (3D flight).** Fly a third-person bee over a few square kilometres of
   countryside. Flower patches show as coloured drifts. Dip low and slow over
   one to **taste** it. That records quality, toxicity, and the bearing and
   distance from the hive by path integration.
2. **Go home.** The hive is at the origin. Entering it fixes the last sun
   bearing you saw. Time keeps running inside.
3. **Dance (comb view).** The comb is vertical, and *up means the sun*. Aim with
   the mouse and hold to waggle. Your heading drifts towards the aim, and the
   crowd keeps jostling you. A run's angle is its mean heading, and its duration
   is the distance (1 s = 250 m). Your dance memory is a mental map: the hive,
   distance rings, the sun ray *as last seen*, and the patches you have tasted,
   with each run plotted as a dot.
4. **Followers decode.** Attending bees each watch 3–5 runs, then either sign up
   (with probability rising with the quality of the patch you are dancing for)
   or wander off. A recruit averages what it saw, adds its own error (angular
   noise is larger for short dances) and flies the bearing `sun(t_run) + angle`.
5. **The colony takes over.** Recruits search a spiral at the end of the vector.
   If they find a patch, they become foragers: shuttle, unload, and sometimes
   dance it themselves, accurately. Patches deplete and regrow, open and close
   on bloom windows, and may be sprayed (bees die) or hunted by hornets. Bees on
   a dry patch give up after two empty trips.
6. **Score.** Nectar delivered by sundown, against bronze, silver and gold
   targets per day.

## The sun

The sun moves on a real solar track (latitude and declination per day):
`alt = asin(sinφ sinδ + cosφ cosδ cosH)` and the azimuth from the usual
hour-angle formula. One sim second is one minute of daylight, so the sun's
azimuth moves fastest near noon, at up to about 40° per real minute in summer.
A long dance near noon goes stale: the angle you meant against the sun you saw
on entering is wrong by however far the sun has moved since. The map shows how
long ago you last saw the sun, and leaving to look again costs time.

## Days

| Day | Setting | Hours | Lesson |
|---|---|---|---|
| 1 | Spring meadow | 10:00–15:00 | Basic code; sun-up map assist on by default |
| 2 | Orchard | 08:00–16:00 | Bloom windows (apple closes at noon), a sprayed rape field |
| 3 | Heath in August | 07:00–18:00 | Long distances uphill, a lime avenue blooming midday, hornets in the bramble |

## Controls

Flight: **A/D** or mouse turn · **W** faster · **S** slow (to taste) · **Space**
climb · **C/Ctrl** dive · **Shift** boost · **E** enter or leave the hive ·
**Tab** hold for 4× time.
Dance: mouse aims · hold **mouse / Space** to waggle · **A/D** nudge the aim ·
**1–9** pick which tasted patch you are dancing for · **M** sun-up / north-up
map · **E** leave.
Touch: left-thumb steering pad, buttons for climb, dive, hive and waggle.

## Systems / modules

- `world.js`: days, patches, terrain height, solar position (shared by sim and scene)
- `sim.js`: deterministic sim (seeded RNG) covering player flight, energy,
  tasting, the dance, followers, foragers, patches and score. No DOM, no Three.
- `bot.js`: autopilot scout + dancer (flies, tastes, dances honestly)
- `scene.js`: Three.js countryside, bee, foragers, bee lines, hive interior / comb
- `hud.js`: compass tape with sun and hive, minimap, energy, colony stats, dance map
- `audio.js`: Web Audio wing buzz, waggle buzz pulses, recruit chimes
- `scripts/bench.mjs`: headless checks

## Acceptance (bench)

- Determinism: same seed gives an identical day.
- Solar track: azimuth 180° at solar noon, rising monotonically, with the
  fastest rate at noon.
- Decoding: a perfect dance gives recruits whose mean bearing is within 3° and
  mean distance within 5% of the truth.
- Stale sun: the same angle danced 40 sim-minutes late near noon misses by more
  than 10°.
- Toxic patch: dancing for it kills bees; avoiding it does not.
- Conservation: idle + active + dead bees equals the colony on every step.
- Strategy: an honest bot reaches at least bronze on every day, beats a
  random-angle dancer by a wide margin, and a do-nothing day scores 0.

## Non-goals

No multiplayer, no colony building between days, and no realistic small-bee
scale. The bee is drawn oversized so it reads well on screen.
