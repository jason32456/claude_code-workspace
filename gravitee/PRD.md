# Gravitee — Product Requirements Document

## 1. Summary
**Gravitee** is a physics-based space-golf puzzle game for the browser.
Drag back from the ball to aim, release to putt — but there's no straight
line to the hole. Planets and stars bend the ball's path with real gravity,
and a smart player uses that curve as a tool: slingshot around a planet to
reach a hole that's hidden behind a wall, or thread a narrow gap between two
pulling bodies. Sink the hole in as few strokes as possible. Touch a black
hole and you're yanked back to the start.

Nothing else in this repo works like this — it's a trajectory-planning
puzzle game, not a shooter, runner, racer, or reflex-timing game.

## 2. Goals
- **One elegant mechanic.** Drag-to-aim, gravity bends the shot. That's the
  entire input surface — depth comes from level layout, not new controls.
- **Readable physics.** The aim line previews a *predicted* curved
  trajectory before you release, computed with the same gravity simulation
  used in-flight, so players can reason about shots instead of guessing.
- **Satisfying curve.** Real inverse-square-ish gravity wells, so slingshots
  around a planet visibly whip the ball around — it should feel like orbital
  mechanics, not a rubber band.
- **Risk/reward via black holes.** Black holes pull hard and are usually the
  fastest route to a good angle, but crossing the event horizon costs a
  stroke and resets ball position — tempting but punishing.
- **Self-contained.** Static folder, no build step, no dependencies, runs
  offline.

## 3. Non-goals
- No accounts, backend, or multiplayer.
- No sprite art pipeline — everything drawn with Canvas 2D primitives,
  radial gradients, and glow.
- No physics engine dependency — a small custom gravity integrator is
  enough for this scope.
- No level editor in v1 — levels are hand-authored data.

## 4. Core gameplay
1. Each level places a **ball** (start), one **hole** (goal), 1–3 **gravity
   wells** (planets/stars, always-attract), optionally a **black hole**
   (strong attract + instant reset on contact), and static **wall**
   obstacles the ball bounces off.
2. **Aiming:** click/touch-drag from the ball outward. A dashed line shows a
   simulated preview of the curved path the ball would take at that
   power/angle, bent live by every gravity well on the level. Drag distance
   sets power (capped); release launches.
3. **Flight:** the ball integrates velocity + gravitational acceleration
   from every well each frame, leaving a fading trail, bouncing off walls
   and the arena border with energy loss.
4. **Stroke counting:** each launch = +1 stroke. Level tracks strokes vs. a
   target **par**.
5. **Sinking:** ball entering the hole's radius below a speed threshold
   triggers a capture animation (spiral into the hole) + particle burst,
   then advances to the level-complete state.
6. **Black hole contact:** resets the ball to its last launch position,
   +1 stroke penalty, brief screen flash/shake.
7. **Out of bounds / rest:** if the ball drifts to a near-stop with no net
   force pulling it (rare, e.g. dead zone), a "stuck" nudge button appears
   after 2s idle so play never softlocks.
8. Completing a level shows strokes vs. par (Eagle/Birdie/Par/Bogey style
   rating) and a **Next Level** control; completing the last level shows a
   run summary (total strokes vs. total par) and a replay option.

## 5. Level design
- 8 hand-authored levels of increasing complexity:
  1. Straight shot, one gentle gravity well (teaches curve).
  2. Well placed so a straight shot overshoots — must under-power and let
     gravity finish the job.
  3. Wall blocks direct line — must curve around it.
  4. Two wells pulling opposite directions — threading the middle.
  5. Introduces the black hole as an obstacle to avoid.
  6. Black hole positioned so a *near miss* slingshot is the fastest route
     (optional risk/reward line).
  7. Tight multi-wall corridor with one well.
  8. Capstone: three wells + a black hole + walls, par 4.
- Each level defines: ball start, hole position + radius, wells (position,
  mass/strength, radius, visual), black hole (optional), walls (rects), par.

## 6. Controls
| Action | Mouse | Touch |
|--------|-------|-------|
| Aim | click + drag from ball | touch + drag from ball |
| Set power | drag distance (capped, shown as a power meter) | same |
| Launch | release | release |
| Restart level | `R` / button | button |
| Next level | `Enter` / button (after sink) | button |

## 7. UI / screens
- **Title overlay:** game name/tagline, brief how-to-play, start button.
- **In-game HUD:** level number, stroke count, par, small restart icon.
- **Aim state:** dashed predicted-trajectory curve + power meter near ball.
- **Level-complete overlay:** strokes vs par rating, Next Level button.
- **Run-complete overlay:** total strokes vs total par across all 8 levels,
  Play Again button.

## 8. Visual design
- Deep-space background: near-black with a subtle parallax starfield.
- Gravity wells: glowing radial-gradient planets/stars, color-coded by pull
  strength (soft blue = gentle, warm orange = strong).
- Black hole: dark core with a thin accretion-disk ring glow, event horizon
  shown as a faint dashed circle.
- Ball: small bright comet with a fading motion trail during flight.
- Hole: pulsing ring portal in green/teal that brightens as the ball nears.
- Effects: capture spiral + particle burst on sink, screen flash/shake on
  black-hole reset, dashed trajectory preview line while aiming.

## 9. Tech
- Vanilla JS (ES modules), Canvas 2D, CSS3. No frameworks, no bundler.
- Files: `index.html`, `style.css`, `main.js`, `physics.js`, `levels.js`,
  `render.js`, `input.js`.
- Custom fixed-timestep gravity integrator (semi-implicit Euler), reused
  identically for both the live trajectory preview and actual flight so the
  preview is always accurate.
- Best strokes-per-level and best total persisted in `localStorage`.

## 10. Success criteria
- Loads and plays offline via `python -m http.server`.
- 60fps on a typical laptop.
- A new player can read the trajectory preview and sink level 1 within
  their first three attempts.
- All 8 levels are completable and the curved-gravity mechanic is legible
  (players can visibly see slingshot behavior around wells).
- At least two embedded screenshots in the README (title + mid-level play).
