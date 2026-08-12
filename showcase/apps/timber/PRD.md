# Timber! — Product Requirements Document

## 1. Summary
**Timber!** is a fast, one-more-go arcade game for the browser. The player is a
lumberjack chopping an endless tree from the bottom. Each chop sends a new log
segment falling and reveals the next. Branches grow from the trunk at random
sides — get caught on the same side as a branch when you chop and the game ends.
A constantly draining timer adds pressure; every chop tops it back up. The loop
is simple, twitchy, and instantly readable.

## 2. Goals
- **Fun in 5 seconds.** No tutorial needed — two inputs, immediate feedback.
- **Tension via the timer.** Hesitation is punished; rhythm is rewarded.
- **Juicy feedback.** Screen shake, chips flying, log fall, combo flashes.
- **Self-contained.** Runs offline from a static folder, no build step, no deps.

## 3. Non-goals
- No accounts, no backend, no multiplayer.
- No procedural art pipeline — flat shapes drawn on Canvas 2D.
- No mobile-first polish beyond basic touch support.

## 4. Core gameplay
1. The lumberjack stands at the bottom-left or bottom-right of the trunk.
2. **Chop input:** Left side (`A` / `←` / tap-left) or right side (`D` / `→` / tap-right).
3. On chop:
   - The lumberjack moves to the chosen side.
   - The bottom trunk segment is removed; the stack shifts down; a new segment
     spawns on top with a randomly placed branch (left, right, or none).
   - Score +1, combo grows, timer refills by a small amount.
4. **Death:** If the segment now next to the lumberjack has a branch on the
   player's side → squash → game over. Or if the timer empties → time-out game over.

## 5. Difficulty curve
- Timer drains faster as score climbs (capped).
- Branch density increases slightly with score (never spawns an impossible
  "branch on both sides at adjacent height" trap).
- Each chop refills less time at higher scores.

## 6. Controls
| Action | Keys | Touch |
|--------|------|-------|
| Chop left | `A`, `←` | tap left half of screen |
| Chop right | `D`, `→` | tap right half of screen |
| Start / restart | `Space` / `Enter` / click | tap |

## 7. UI / screens
- **Title overlay:** game name, one-line how-to, Start prompt, best score.
- **In-game HUD:** score (large, centered top), timer bar, combo flash.
- **Game over overlay:** cause (squashed / out of time), score, best, restart prompt.

## 8. Visual design
- Flat, friendly palette: warm sky gradient, green grass, brown trunk with
  bark notches, leafy green branches, a chunky blocky lumberjack with an axe.
- Timer bar that shifts green → amber → red as it drains.
- Effects: wood chips particle burst on chop, brief screen shake on chop,
  bigger shake + red flash on death, falling chopped log.

## 9. Tech
- Vanilla JS (ES modules), Canvas 2D, CSS3. No frameworks, no bundler.
- Files: `index.html`, `style.css`, `main.js`, `game.js`, `render.js`, `input.js`.
- Best score persisted in `localStorage`.
- Fixed-timestep update loop with `requestAnimationFrame`.

## 10. Success criteria
- Loads and plays offline via `python -m http.server`.
- 60fps on a typical laptop.
- A new player understands and dies-then-retries within their first 15 seconds.
- At least two embedded screenshots in the README (title + mid-game).
