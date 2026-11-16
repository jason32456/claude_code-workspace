# Offcut — the contract between the Engine and the Stage

Two builders work on this app at the same time and never see each other's code.
This file is the whole interface between them. Do not change it; if it is wrong
or insufficient, say so in your final report.

## The idea

Type two words (or draw two shapes). Offcut cuts the first into pieces with
straight cuts and reassembles the pieces — each one only slid and turned, never
flipped, none left over — into the second.

This is the Wallace–Bolyai–Gerwien theorem: any two polygons of equal area can
be cut into finitely many pieces that rearrange into each other. The app does
not illustrate the theorem; it carries out the proof on the user's own shapes:

1. Cut the shape into simple cells (triangles or trapezoids).
2. Rearrange each cell into a rectangle.
3. Recut every rectangle to one common height: a bar.
4. Push the bars together into one long rectangle: the **ribbon**.

Every shape of a given area becomes the *same* ribbon. So cut the ribbon along
both shapes' lines at once, and each resulting piece has a place in shape A and
a place in shape B. Run A's cutting forwards and B's backwards.

## Coordinates and shapes

- Plane coordinates, arbitrary units, **y down**.
- `Ring` = array of `[x, y]`, at least 3 points, not closed (last ≠ first),
  either winding, simple (does not cross itself).
- `Shape` = array of regions `{ outer: Ring, holes: Ring[] }`. Regions do not
  overlap each other; holes lie inside their outer ring and do not overlap.

## Rigid motions

A pose is `M = [c, s, tx, ty]` with `c² + s² = 1`, meaning

```
x' = c·x − s·y + tx
y' = s·x + c·y + ty
```

Rotation then translation. There is no reflection anywhere in this app: a piece
is never flipped over.

## Engine API (`js/engine.js`, built by the Engine builder)

```js
import { dissect } from './engine.js';
const result = dissect(shapeA, shapeB, options);   // synchronous, pure, no DOM
```

Runs unchanged in Node, in the page, and in a module Worker. `options` is
optional: `{ ribbonAspect }` (hint for ribbon width ÷ height, default 12).
Throws an `Error` with a `code` property (`'empty'`, `'degenerate'`,
`'self-intersecting'`) on input it cannot use.

The theorem needs equal areas, so the engine scales shape B uniformly about its
centroid until its area equals A's, and reports the factor.

```js
result = {
  area,                       // the common area
  scaleB,                     // linear factor applied to B
  ribbon: { width, height, box },      // the ribbon is [0,width] × [0,height]
  a: {
    shape,                    // Shape actually used (cleaned), in the caller's coordinates
    cells,                    // how many cells this shape was cut into
    poses: [                  // always these three, in this order
      { key: 'shape', box },  // pieces assembled as the shape
      { key: 'rects', box },  // every cell rearranged into its own rectangle, laid out apart
      { key: 'bars',  box },  // every rectangle recut to the common height, laid out apart
    ],
  },
  b: { shape, cells, poses }, // same; b.shape is B after scaling
  pieces: [
    {
      id,                     // 0..n−1
      ring,                   // convex Ring in RIBBON coordinates
      area,
      cellA, cellB,           // index of the cell of A / of B this piece belongs to
      a: [M0, M1, M2],        // pose of this piece in a.poses[0..2]: ribbon coords → that pose
      b: [M0, M1, M2],        // likewise for b
    },
  ],
  audit: { pieces, areaError, smallestArea, ms },   // areaError = |Σ piece areas − area| / area
}
```

`box` is `[minX, minY, maxX, maxY]`, the bounds of all pieces in that pose. Each
pose has its own box; the layouts of `rects` and `bars` are chosen by the engine
(non-overlapping, compact, roughly screen-shaped). In the ribbon itself every
piece's pose is the identity — `ring` is already where it belongs.

So the full film has seven key frames:

```
a.poses[0]  a.poses[1]  a.poses[2]  ribbon  b.poses[2]  b.poses[1]  b.poses[0]
  shape A     rects       bars                bars        rects       shape B
```

Guarantees the Stage relies on:

- In **every one of the seven key frames** the pieces do not overlap.
- In `a.poses[0]` the pieces exactly tile `a.shape`; in `b.poses[0]` they
  exactly tile `b.shape`; in the ribbon they exactly tile the rectangle.
- Every pose is a proper rigid motion (`c² + s² = 1` to 1e-9).
- Every `ring` is convex with at least 3 vertices and positive area.
- `dissect` is deterministic.

### Worked example

A is the square `[0,2] × [0,2]`, B is the rectangle `[0,4] × [0,1]`. One valid
result, with a 4 × 1 ribbon and two pieces (poses shown for `shape` only):

```js
pieces: [
  { id: 0, ring: [[0,0],[2,0],[2,1],[0,1]], a: [[1,0, 0,0], …], b: [[1,0,0,0], …] },
  { id: 1, ring: [[2,0],[4,0],[4,1],[2,1]], a: [[1,0,-2,1], …], b: [[1,0,0,0], …] },
]
```

Piece 1 lies at `[2,4] × [0,1]` in the ribbon and in B, and at `[0,2] × [1,2]`
in A.

## File ownership

| Path | Owner |
|---|---|
| `CONTRACT.md` | orchestrator — read-only |
| `js/engine.js`, `js/engine-*.js`, `tools/engine-*`, `dev/engine-*` | Engine builder |
| `index.html`, `style.css`, `js/main.js`, `js/stage-*.js`, `js/trace.js`, `js/presets.js`, `tools/stage-*`, `dev/stage-*` | Stage builder |

Never create or edit a file the other builder owns. No CDN, no build step —
vanilla ES modules that run from `python3 -m http.server`. A small permissively
licensed library may be vendored under `vendor/<owner-prefix>-…` with its
licence file if writing it yourself would be the riskier choice.
