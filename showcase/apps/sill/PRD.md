# Sill — PRD

## 1. One-liner

**The water lives on your desktop, and your browser windows are the only thing
holding it.** Behind your monitor there is a dark cave with a spring in it.
Each Sill window shows the patch of cave directly behind wherever that window is
on your screen. Water rests on window sills. To lift it uphill you drag the
window it is sitting in. To pour it you close that window.

## 2. Brainstorm: what this collection has never done

67 projects, read end to end. They cover a lot: ray-traced black holes, a
lattice-Boltzmann wind tunnel, a bombe, knot invariants, curling, an octopus
with nine brains. Under all that range they share one assumption. **The app
lives inside a rectangle and doesn't care where that rectangle is.** Move any of
them to the other side of the monitor and nothing changes. Open one twice and
you get two copies that ignore each other.

Candidates considered:

| Idea | What it is | Why not / why |
|---|---|---|
| **Termite** | Organisms that eat the DOM of the page they're on: text, buttons, the showcase's own cards | Funny, but a novelty that lasts about a minute |
| **Chirp** | An acoustic modem where two devices talk through speaker and microphone, graded against the Shannon limit | Real and clever, but it's another rigorous bench, which the collection already has plenty of |
| **Favicon arcade** | A game played in a 16×16 tab icon | Known trick, too small to be surprising |
| **Quine garden** | A page that rewrites and re-serves its own source | Interesting to explain, dull to use |
| **Sill** | The world sits in *screen* coordinates. Windows are the containers, and window position, size and visibility are the controller | **Picked.** Nothing else here treats the browser window as a physical object |

Sill is a different kind of thing from the rest of the collection. The input is
the OS window manager. You don't click on the game, you pick the game up by its
title bar.

## 3. Player fantasy

You have a cave behind your monitor and nothing to hold water with except
windows. A window is a bucket with an open top. Two overlapping windows make a
channel. A window you drag upward is an elevator. A minimised window is a
trapdoor. At the end of a level you've built something out of your own browser
windows, like a contraption made from desk junk, and the plant in the corner of
your screen is blooming.

## 4. Core rules

1. **Screen space is world space.** Every particle, rock, spring and pot has a
   position in screen pixels. A window renders the world at
   `[screenX, screenY, innerWidth, innerHeight]`, corrected for browser chrome.
   Two windows that overlap show the same world in the overlap, so the
   picture is seamless across windows.
2. **Windows are the only containers.** The union of every visible window's
   content rect is the space water can be in. Its left, right and bottom edges
   are walls. **The top is open.** Jerk a window down and the water lags, then
   falls back in.
3. **No window, no floor.** Water whose window is minimised, hidden, closed or
   moved out from under it becomes free. Free water falls under gravity
   through the void, invisible, until it lands in another window or falls off the
   bottom of the screen (spilled).
4. **Gravity only goes down. Windows go up.** Water can only reach a pot higher
   than the spring if a window floor carries it there. Maximising one window
   can solve downhill levels but never uphill ones.
5. **The spring only runs when a window is over it.** It needs somewhere to
   flow.
6. **The sill opens.** Hold the bottom strip of a window (or Space) and a gap
   opens in its floor under the pointer, so water drains as free water into
   whatever is below.
7. **Rocks are part of the world.** Rock ledges sit at fixed screen positions
   and stop water inside and outside windows. A window can be dragged across a
   rock, but its water can't pass through.
8. **Pots absorb water and grow a plant.** Every pot needs N drops. The plant
   grows with the fill and blooms when full. When every pot blooms, the level is
   done.
9. **Heat evaporates.** Some levels have a hot zone that removes water passing
   through it, so the route has to go around it or through it quickly.

## 5. Two ways to play

* **Real windows** (desktop browsers): the actual mode. The first window shows
  the intro, and **+ Window** opens more as real pop-ups. All windows share one
  simulation in a `SharedWorker`. Each window reports its rect every frame and
  renders whatever part of the world is behind it.
* **Simulated desktop** (phones, tablets, embedded views, or anyone who wants a
  preview): the page *is* the screen, with draggable, resizable, minimisable fake
  windows and a taskbar. It uses the same world, renderer and rules. Faint
  outlines on the wallpaper stand in for the minimap.

## 6. Technical design

### 6.1 Fluid

Particle fluid using Clavet et al. 2005 double-density relaxation (pressure plus
near-pressure gives cohesion and surface tension without a pressure solve). A
spatial hash on the interaction radius handles neighbours. Two substeps per
60 Hz frame. About 900 live particles maximum. Units are screen pixels and
seconds.

### 6.2 Moving walls

Containment is a projection into the union of shrunk window rects, preferring
the particle's home window. A wall that moves pushes the particle, and the push
becomes velocity **capped at a maximum carry speed**. A steady lift carries the
water and a hard stop splashes it, but a fast drag doesn't fling the whole pool
out of the top of the window.

### 6.3 One world, many windows

* A `SharedWorker` owns the world. It runs a fixed 60 Hz loop that doesn't depend
  on any window's `requestAnimationFrame`, so no window's lifetime or
  visibility can stall it.
* Window → worker: `hello`, `pane` (rect, visibility, drain) every frame
  (every 500 ms while hidden), `poke`, `cmd`, `bye`.
* Worker → window: `level` (static geometry) on change or join, and `world`
  (positions, home ids, pane rects used, pot fills, events) every step.
* A pane not heard from in 1.5 s is gone. That catches crashes and killed tabs
  that never sent `bye`.
* **Lag compensation:** a window learns its new position a frame or two before
  the worker's world reflects it. Each window shifts particles *homed in itself*
  by `currentRect − rectTheWorkerUsed`, so water carried in a window sticks to
  its floor while dragging and doesn't slide two frames behind.

### 6.4 Rendering

* One shared WebGL context. Pass 1 splats particles as Gaussian point sprites
  into a half-resolution density texture (additive). Pass 2 is a full-screen
  shader in screen coordinates: cave background (fbm noise), rocks (capsule SDFs
  with rim light), thresholded metaball water with refraction, rim and foam, and
  heat shimmer. The result is blitted into each view's 2D canvas.
* A 2D overlay per view draws pots, plants (deterministic recursive growth),
  the spring mouth, the sill strip and edge arrows to anything off-window.
* Each tab's favicon and title show how much water that window is holding.

### 6.5 Coordinates

`contentX = screenX + (outerWidth − innerWidth)/2` and
`contentY = screenY + (outerHeight − innerHeight) − (outerWidth − innerWidth)/2`.
That accounts for side borders and for pop-ups having less chrome than tabbed
windows.

## 7. Levels

Positions are fractions of the available screen, so a level fits any monitor.

| # | Name | Teaches |
|---|---|---|
| 1 | Sill | windows show the world, and water rests on their floor |
| 2 | Downstream | chain overlapping windows down a rock staircase |
| 3 | Uphill | carry water up by lifting the window |
| 4 | Through the Roof | drain through a narrow shaft into a covered pot |
| 5 | Two Gardens | one spring, one pot above it and one below |
| 6 | Over the Wall | a rock wall splits the screen, so lift over it |
| 7 | Heat | route around a hot zone that evaporates water |
| ∞ | Free Garden | two springs, four pots, no clock |

## 8. Acceptance

* Two or more real windows show one continuous world, and water flows between
  overlapping windows. *(Verified in automated tests with injected rects across
  separate pages sharing one SharedWorker.)*
* Hiding or closing a window drops its water, and the water lands in a window
  below it.
* A moving window carries its water. Steady lifts keep the pool, and hard stops
  splash but don't empty it.
* All levels are solvable in the simulated desktop at 1440×900 and at 390×844.
* 60 fps at 900 particles on a laptop, with the simulation in the worker.
* No external requests. Everything is vendored or written from scratch.

## 9. Out of scope

Different page zoom levels in different windows (they misalign). Rotated or
mirrored displays. Firefox/Safari pop-up quirks beyond falling back to the
simulated desktop.
