# SnapFrame — Product Requirements Document

## Overview

SnapFrame turns a raw screenshot into something worth posting. Paste an image
(⌘/Ctrl+V), drop a file, or load the built-in demo shot, then wrap it in a
gradient background with padding, rounded corners, a soft shadow, an optional
window frame, and a slight tilt. Export a PNG at 1×/2× or copy straight to the
clipboard. Everything runs in the browser — the image never leaves the machine.

## Problem

A bare screenshot looks unfinished in a README, a slide, a changelog, or a
tweet: hard edges, no breathing room, whatever background colour the app
happened to have. The fix — padding, a gradient, a shadow — takes two minutes in
a design tool that most people don't have open, and the online tools that do it
either want an upload, an account, or a watermark.

## Goals

- Paste → good-looking result in **one action**, before touching any control
- Every setting live-previewed on a canvas, no render button
- Export at 2× so the result stays crisp on retina displays and in slides
- 100% client-side: no upload, no network request, no account

## Non-Goals

- Annotation (arrows, text, blur/redaction)
- Multi-image collages or batch processing
- Device mockups with photographic bezels (phone/laptop photos)
- Saving projects or a history of edits

## Users

Developers writing READMEs and release notes, designers sharing work in
progress, anyone posting a screenshot who wants it to look deliberate.

## Features

### F1 — Image input
- **Paste** anywhere on the page (⌘/Ctrl+V) — the primary path, since screenshots
  land in the clipboard
- **Drag and drop** a file onto the canvas area, with a highlighted drop state
- **File picker** via the "Open image" button
- **Demo shot** button loads a procedurally drawn sample UI so the app is usable
  with an empty clipboard
- Empty state explains all four paths

### F2 — Background
- 12 gradient presets in a swatch grid (Sunset, Ocean, Mint, Grape, Ember, …)
- Solid-colour mode with a colour input
- Transparent mode — checkerboard in the preview, real alpha in the export
- Gradient angle slider (0–360°)

### F3 — Frame geometry
- **Padding** 0–30% of the image's long edge
- **Corner radius** 0–48 px
- **Tilt** −12° to +12°, rotating the framed image inside the background
- **Inset border**: a 1 px translucent white stroke on the image edge, toggleable

### F4 — Shadow
- Single "Shadow" slider (0–100) driving blur, vertical offset and opacity
  together, so one control covers the useful range

### F5 — Window chrome
- **None** — the bare image
- **macOS** — light title bar with red/amber/green traffic lights
- **Dark** — dark title bar with the same lights
- The bar is drawn above the image and shares its rounded top corners

### F6 — Canvas ratio
- Auto (image + padding), 16:9, 4:3, 1:1, 3:2, 4:5
- Non-auto ratios grow the short side and centre the framed image

### F7 — Output
- **Download PNG** at 1× or 2×
- **Copy to clipboard** via `ClipboardItem` (falls back to a download when the
  browser blocks it)
- Live size readout, e.g. `2560 × 1440 @2×`
- **Randomize** button rolls a new background/angle for quick exploration
- **Reset** returns all controls to defaults

### F8 — Keyboard
| Key | Action |
|-----|--------|
| ⌘/Ctrl+V | Paste image |
| ⌘/Ctrl+S | Download PNG |
| ⌘/Ctrl+C | Copy to clipboard (when not selecting text) |
| R | Randomize background |

## Rendering model

One pure function draws a full-resolution frame at any scale:

```
render(ctx, image, settings, scale)
  1. compute inner size (image, plus title bar if chrome enabled)
  2. pad  = padding% × max(imageW, imageH)
  3. canvas = inner + 2·pad, then expanded to satisfy the ratio lock
  4. fill background (gradient / solid / nothing)
  5. translate to centre, rotate by tilt
  6. shadow → rounded-rect clip → drawImage → chrome → inset border
```

The preview canvas renders at `scale = fit-to-container`; export renders the
same function at `scale = 1 or 2` into an offscreen canvas. Preview and export
are therefore identical by construction.

## Technical Stack

- Vanilla JS (ES Modules), no build step
- Canvas 2D for all rendering and export
- CSS custom properties, grid layout, dark UI
- Served by any static server (`python -m http.server`)

## Design Principles

- **Dark editor chrome, bright artwork** — the controls recede, the canvas leads
- **No modal steps** — input, edit and export live on one screen
- **Good defaults** — the first render (Sunset gradient, 12% padding, 16 px
  radius, medium shadow) should already be postable
- **Honest preview** — what the canvas shows is what the PNG contains
