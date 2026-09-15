# Tofu — Product Requirements Document

## One line

Drop in a `.ttf`, see the bytes a stranger laid out, cut the font down to the
characters you actually use — and get told exactly what that cost you.

## The name

**Tofu** is the term of art for the □ you get when a font has no glyph for a
character. It is the precise failure mode of a bad subset, and the thing this
tool exists to avoid producing.

## Why this exists

Font subsetting is a real chore. A 400 KB webfont shipping 3,000 glyphs to
render a headline of twelve characters is the single laziest weight on most
pages, and the fix today is `pyftsubset` — a Python CLI, behind a toolchain,
which will happily hand you back a file without telling you what it silently
removed along the way.

Two things make it worth building rather than describing:

**A font file is a binary container designed by someone else.** Across the other
58 apps in this repo there are exactly two `<input type="file">` elements, and
both hand the bytes straight to a browser decoder and work on the pixels or
samples that come back. Nothing here has ever read a byte layout a stranger
designed, walked its offset tables, or had to survive a malformed one. A TTF is
a table directory of four-byte tags pointing at offsets, with a self-referential
checksum, a length field stored *halved* depending on a flag in another table,
and a character map whose hardest field is a byte offset measured from its own
address. You cannot fake reading it.

**Subsetting is lossy in ways nobody tells you about.** Dropping `GSUB` removes
ligatures. Dropping `GPOS` removes kerning — so your subset renders at a
different width than the original and your layout moves. Dropping `fpgm`/`prep`/
`cvt ` removes hinting, which changes rendering at small sizes on some
platforms. A tool that reports "410 KB → 6 KB, 98.5% saved" and stops there is
telling you the flattering half. This one names each table it removed and what
capability went with it.

## The pipeline

| Stage | What happens |
|---|---|
| 1. Read the directory | `sfntVersion`, table count, and for every table its tag, checksum, offset and length |
| 2. Parse the head tables | `head` (unitsPerEm, indexToLocFormat, bbox), `maxp` (numGlyphs), `hhea`/`hmtx` (advances), `OS/2`, `name` |
| 3. Parse `cmap` | format 4 (BMP) and format 12 (full Unicode), producing codepoint → glyph id |
| 4. Parse `loca` + `glyf` | per-glyph offsets, then contours: on-curve and off-curve points with **implied on-curve midpoints**, and composite glyphs resolved recursively |
| 5. Closure | the retained codepoints, plus `.notdef`, plus every component any retained composite depends on |
| 6. Rebuild | remap glyph ids, rewrite `loca` and `glyf`, synthesize a fresh `cmap` format 4, trim `hmtx`, patch `maxp`/`head` |
| 7. Serialize | table directory with correct offsets, per-table checksums, and the self-referential `checkSumAdjustment` |
| 8. Verify | hand the bytes to the browser and see if it agrees (below) |

## The oracle — why this project is worth building

Every previous build in this line (`kleene`, `crib`, `overtone`, `caustic`)
needed an oracle, and the weaker ones were statistical. This one has a binary
verdict from code nobody here wrote:

1. **An independent font engine votes on the bytes.** `new FontFace('probe',
   subsetBytes).load()` runs the file through the browser's OpenType sanitiser
   and shaping stack. It rejects a bad table directory, an out-of-range `loca`,
   a malformed `cmap`, an inconsistent `maxp`. There is no threshold and no
   judgement call: it loads or it throws.
2. **Raster equivalence, per glyph.** Fill each glyph from *our own* parsed
   contours via `Path2D`, and fill the same character with `ctx.fillText` under
   the loaded subset. Compare coverage per pixel. A wrong point-implication rule,
   a botched composite transform or a bad id remap shows up as a specific glyph
   that differs.
3. **Metric agreement, three ways.** Our `hmtx` advance scaled by
   `size / unitsPerEm` must equal `measureText` under the original font must
   equal `measureText` under the subset — for every retained string.

## Scope, and what is refused

Supported: TrueType outlines (`sfntVersion 0x00010000`), `cmap` formats 4 and
12, simple and composite glyphs, short and long `loca`.

**Refused loudly, with the reason:**
- **CFF / PostScript-flavoured OpenType** (`OTTO`). The outlines are cubic and
  live in a compressed Type 2 charstring interpreter — a different program, not
  a bigger version of this one.
- **TrueType Collections** (`ttcf`), **WOFF/WOFF2**. Containers around the
  format rather than the format.
- Variable-font axes. The subset would need `gvar`/`fvar` handling to stay
  correct, and silently producing a static instance is worse than refusing.

Refusing with a reason is the honest move and it is cheap; half-parsing a CFF
font and emitting something plausible is not.

## What the UI shows

- **The file as bytes.** The table directory drawn as a proportional byte map,
  so you can see that `GPOS` is 76 KB of the 400 KB you are shipping.
- **The tables decoded.** `head`, `hhea`, `maxp`, `OS/2`, `name` fields in a
  labelled table — the numbers, not a summary of them.
- **The glyphs, drawn from our own parse.** On-curve points, off-curve control
  points, implied midpoints, the em box and the sidebearings, all toggleable. If
  the parser is wrong, the outline is visibly wrong.
- **The subset, side by side.** Original and subset setting the same string, the
  subset rendered *in the font this page just built*.
- **The bill.** Every dropped table named, with the capability lost.

## Constraints

- Static site, no build step, no CDN, no dependencies, no network at runtime.
- Vanilla JS, ES modules, Canvas 2D.
- One vendored demo font (Erica One, SIL OFL, 24 KB, with its licence alongside)
  so the tool has something to chew on offline and the page works with no input.

## Success criteria

- **The browser must accept the subset.** `FontFace.load()` resolving is the
  headline check and it is binary.
- **Per-glyph raster agreement** between our own outline fill and the browser's
  rendering of our subset.
- **Metric agreement** between our `hmtx`, the original font and the subset.
- A malformed or unsupported file produces a **specific, accurate diagnostic**
  rather than a crash or a silently wrong font.
