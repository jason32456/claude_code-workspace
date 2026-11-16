# Still Life — the contract between the Eye and the World

Two builders work on this app at the same time and never see each other's code.
This file is the whole interface between them. Do not change it; if it is wrong
or insufficient, say so in your final report.

## The idea

Still Life is a game in which **every frame is statistically pure random noise**.
The screen is a 320 × 180 grid of cells, each either dark or light, each a fair
coin. A "thing" is a region whose noise moves differently from the noise around
it. Nothing can be seen in a single frame; shapes exist only in the change
between frames. Pause and the world vanishes. A screenshot is static.

One law follows, and it is the game:

> **Anything at rest relative to its surroundings is invisible — to the player
> and to everything else. Hunters see exactly what the player sees.**

## Grid and time

- Grid: `COLS = 320`, `ROWS = 180`. Cell (0,0) is top-left; x right, y down.
- Time: the World advances in fixed ticks of 1/60 s. The Eye paints exactly one
  frame per tick. All speeds below are per tick or per second at 60 ticks/s.
- **Everything is integer cells.** Positions, texture offsets — no fractions
  ever reach the Eye. Sub-cell motion would need blending, and blending leaks
  the shape into a single frame. Keep fractional positions inside the World and
  emit rounded ones.

## Masks (`js/shape.js`, already written, read-only for both builders)

`{ w, h, data: Uint8Array(w*h) }`, row-major, `1` = solid. Immutable — the Eye
may cache on object identity, so the World builds a new mask rather than mutating
one. Helpers: `makeMask`, `maskFromFn`, `rectMask`, `diskMask`, `ringMask`,
`maskFromRows`, `textMask(str, {height})` (canvas-rasterised, tightly cropped;
in Node it degrades to a solid block).

## Scene (World → Eye, once per tick)

```js
{
  ground: { u: 0, v: 0 },   // integer texture offset of the ground; optional, default 0,0
  palette: ['#14130f', '#e9e4d8'],   // optional [dark, light]; Eye keeps the last one given
  items: [                   // painted in order — later items are on top
    {
      id: 'player',          // stable string; each id owns an independent infinite noise texture
      mask,                  // Mask
      x: 150, y: 80,         // integer cell of the mask's top-left; may be negative / off-grid (clipped)
      u: 0, v: 0,            // optional integer texture offset, default 0
      simmer: 0,             // optional 0..1; chance per cell per frame of showing a fresh coin instead
    },
  ],
}
```

### The one rendering rule

For each grid cell `(cx, cy)`: find the **topmost** item whose mask is solid at
`(cx − x, cy − y)`.

- If there is one: the cell shows `N(id, cx − x − u, cy − y − v)`.
- If there is none: the cell shows `N('ground', cx − ground.u, cy − ground.v)`.
- If that item has `simmer = p > 0`: with probability `p`, independently per
  cell per frame, the cell shows a fresh fair coin instead.

`N(id, i, j)` is a fair coin (0 or 1) that is a fixed function of its three
arguments for the whole session, statistically independent between ids and
between coordinates, defined for all integers `i, j` (negative too). 0 paints
the dark colour, 1 the light.

Consequences the World relies on:

- An item whose `x, y, u, v` do not change, with `simmer = 0`, over ground that
  is not changing, is **indistinguishable from the ground** — invisible.
- Changing `x, y` moves the item with its texture attached: a rigid body.
- Changing `u, v` while `x, y` stay put scrolls texture inside a fixed
  silhouette: a "flow" — a visible shape that is not going anywhere.
- Changing `ground.u, ground.v` makes the whole ground drift; items that hold
  still then show up as islands of stillness.
- An item moving with exactly the same per-tick displacement as the ground (or
  as a flowing item beneath it) is invisible again.
- `simmer` makes a region twinkle: visible, but with no direction.

No antialiasing, no smoothing, no blending, no DOM or drawing on top of the
canvas. Scale up with nearest-neighbour only.

## World API (`js/world.js`, built by the World builder)

```js
import { createWorld } from './world.js';
const world = createWorld({ cols: 320, rows: 180 });

world.step(input);     // advance exactly one tick; input is { dx, dy, action }
world.scene();         // → Scene for the tick just stepped; valid until the next step()
world.info();          // → { state, level, levelCount, title, deaths } for the caption under the canvas
                       //   state: 'title' | 'intro' | 'play' | 'caught' | 'cleared' | 'end'
                       //   level is 1-based; title is the level's name, e.g. 'HOLD STILL'
world.unlockAudio();   // called from inside a user-gesture handler; safe to call repeatedly
world.setMuted(bool);
```

## Input API (`js/input.js`, built by the World builder)

```js
import { createInput } from './input.js';
const input = createInput(canvasElement);
input.read();          // → { dx, dy, action }  dx, dy in [-1, 1]; call once per tick
                       //   action: true only on the tick a confirm (Space / Enter / tap) went down
input.onGesture(cb);   // cb() runs synchronously inside the first and later key/pointer handlers
```

Movement is arrows + WASD, and touch-drag anywhere on the canvas as a virtual
stick. **The shell owns these keys — `input.js` must leave them alone**:
`P` and `Escape` (pause), `X` (hold: difference view), `M` (mute), `F`
(fullscreen), `C` (save frame).

## Eye API (`js/eye.js`, built by the Eye builder)

```js
import { createEye } from './eye.js';
const eye = createEye(canvas, { cols: 320, rows: 180 });

eye.render(scene);          // paint one frame
eye.setView('normal');      // or 'difference': show which cells changed since the previous frame
eye.census();               // → { light, total, lightInside, totalInside } for the last frame
                            //   "inside" = cells owned by any item rather than the ground
eye.saveFrame();            // download the last frame as a PNG
eye.resize();               // refit to the viewport at an integer cell size
```

## The loop (`js/main.js`, built by the Eye builder)

```js
// fixed timestep, at most 3 ticks per animation frame, one render per tick
world.step(input.read());
eye.render(world.scene());
```

`main.js` runs one of two worlds behind the same `step / scene / info` shape:
the game (`createWorld`), or — when the URL hash starts with `#note=` — a note
(`createNote` from `js/note.js`, built by the Eye builder). It loads the game
with a dynamic `import()` so the note works even if `world.js` is absent.

## File ownership

| Path | Owner |
|---|---|
| `js/shape.js`, `CONTRACT.md` | orchestrator — read-only |
| `index.html`, `style.css`, `js/main.js`, `js/eye.js`, `js/eye-*.js`, `js/note.js`, `js/note-*.js`, `dev/eye-*`, `tools/eye-*` | Eye builder |
| `js/world.js`, `js/world-*.js`, `js/input.js`, `js/audio.js`, `js/levels.js`, `dev/world-*`, `tools/world-*` | World builder |

Never create or edit a file the other builder owns. No CDN, no npm, no build
step — vanilla ES modules that run from `python3 -m http.server`.
