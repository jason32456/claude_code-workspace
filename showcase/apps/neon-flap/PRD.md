# Neon Flap — Product Requirements Document

## 1. Summary
**Neon Flap** is a one-button arcade flyer for the browser. A glowing comet
drifts through a scrolling field of neon gates — tap or press Space to give
it a burst of lift against constant gravity. Thread the gap in each gate to
score; clip a bar and it's game over. The whole loop fits in one screen, one
input, and one glance.

## 2. Goals
- **Fun in 5 seconds.** One input (flap), instant feedback, instant retry.
- **Readable difficulty.** Gate gaps narrow and scroll speed climbs slowly
  with score, but never past a fair, learnable ceiling.
- **Juicy feedback.** Comet trail particles, screen shake + flash on death,
  gate glow pulses as the comet passes through cleanly.
- **Self-contained.** Static folder, no build step, no dependencies, runs
  offline.

## 3. Non-goals
- No accounts, backend, or multiplayer.
- No sprite art pipeline — everything drawn with Canvas 2D primitives and glow.
- No mobile-first polish beyond basic tap support.

## 4. Core gameplay
1. The comet sits at a fixed horizontal position, left third of the screen.
2. **Gravity** constantly pulls the comet down.
3. **Flap input** (`Space` / click / tap) gives the comet an upward velocity
   kick, capped so spamming can't fly it clean off the top.
4. Gates (a top bar + bottom bar with a gap) spawn off-screen right and
   scroll left at a constant speed.
5. Passing a gate's x-position without overlapping either bar scores +1 and
   triggers a gate flash.
6. **Death:** the comet overlaps a bar, or the comet touches the floor/ceiling.
7. Game over freezes the field, shows score + best, and waits for a restart
   input.

## 5. Difficulty curve
- Scroll speed increases slightly with score (capped).
- Gate gap shrinks slightly with score (capped at a still-flappable minimum).
- Gate vertical position is randomized within a band that guarantees the gap
  never touches floor or ceiling.

## 6. Controls
| Action | Keys | Touch / Mouse |
|--------|------|---------------|
| Flap | `Space` / `↑` | click / tap anywhere |
| Start / restart | `Space` / click / tap | tap |

## 7. UI / screens
- **Title overlay:** game name, one-line how-to-play, best score, start prompt.
- **In-game HUD:** score, large and centered top.
- **Game over overlay:** score, best score, "new best!" callout when earned,
  restart prompt.

## 8. Visual design
- Dark navy/black background with a faint starfield drift for depth.
- Comet: a glowing cyan-to-magenta gradient circle with a fading particle
  trail behind it that lengthens with speed.
- Gates: neon-outlined bars (magenta/cyan alternating) with a soft glow that
  brightens briefly when the comet threads them cleanly.
- Effects: screen shake + red flash on death, particle burst on death,
  subtle pulse on the score number each time it increments.

## 9. Tech
- Vanilla JS (ES modules), Canvas 2D, CSS3. No frameworks, no bundler.
- Files: `index.html`, `style.css`, `main.js`, `game.js`, `render.js`, `input.js`.
- Best score persisted in `localStorage`.
- Fixed-timestep update loop with `requestAnimationFrame`.

## 10. Success criteria
- Loads and plays offline via `python -m http.server`.
- 60fps on a typical laptop.
- A new player understands the loop and can score at least once within
  their first 15 seconds.
- At least two embedded screenshots in the README (title + mid-game).
