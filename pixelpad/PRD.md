# PRD — pixelpad

## Overview

**pixelpad** is a browser-based pixel art editor. Open the page, pick a color, and draw sprites, avatars, icons, or favicons on a zoomable pixel grid — then export the result as a crisp PNG at any scale. No accounts, no build step, no dependencies; the drawing autosaves locally so you never lose work on refresh.

## Problem

Making a quick sprite, favicon, or pixel avatar usually means opening a heavyweight tool (Aseprite, Photoshop) or a bloated ad-filled website. There is no instant, zero-friction pixel editor in this workspace — and the repo currently has no *creation* tool at all (plenty of games and trackers, nothing that lets you make something and take it with you).

## Goals

- Draw pixel art within 2 seconds of page load — no onboarding, no menus to dig through.
- Export production-usable PNGs (1× to 32× scale) with transparency preserved.
- Feel fun: satisfying drawing, playful symmetry mode, tasteful visuals.
- 100% client-side static site: works offline once loaded, deploys anywhere.

## Non-goals

- Animation frames / GIF export.
- Layers, selections, or transform tools.
- Cloud sync or sharing links.

## Users

- Developers needing a quick favicon / game sprite / placeholder asset.
- Anyone doodling for fun (kids included — the tool must be obvious without reading).

## Core features

### Canvas
- Square pixel grid at **16×16, 32×32, or 64×64** (selector; switching prompts if canvas is non-empty).
- Checkerboard background for transparent pixels; toggleable grid lines.
- Rendered on `<canvas>`, scaled to fit the viewport, crisp at every zoom (no smoothing).

### Tools
- **Pencil** (default) — draw with the active color; click or drag.
- **Eraser** — clear pixels back to transparent.
- **Fill** — flood-fill contiguous same-color region.
- **Eyedropper** — pick a color from the canvas (also via right-click anywhere).
- **Mirror mode** — optional X-axis symmetry toggle that mirrors every stroke live (the "fun" multiplier: instant faces, ships, and monsters).

### Color
- Curated 32-color default palette (a classic pixel-art ramp set).
- Native color picker for custom colors; last 8 custom colors kept as "recent" swatches.
- Active color always visible in the toolbar.

### History
- Undo / redo, at least 50 steps (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` or `Ctrl+Y`), with toolbar buttons.

### Persistence & export
- Autosave the drawing, grid size, and palette state to `localStorage` after every stroke (debounced).
- **Export PNG** at 1×, 4×, 8×, 16×, or 32× — nearest-neighbor scaled, transparency kept, downloads as `pixelpad-<size>.png`.
- **Clear canvas** with confirm.

### Keyboard shortcuts
`B` pencil · `E` eraser · `G` fill · `I` eyedropper · `M` mirror · `Ctrl+Z`/`Ctrl+Y` undo/redo.

## UX / visual direction

Dark editor chrome (near-black slate) so artwork colors read true; one accent color for active states. Toolbar on the left (tools), palette on the right, canvas center stage. Rounded cards, subtle borders — closer to a design tool than an arcade game. Fully usable on a tablet (pointer events, no hover-only affordances).

## Technical approach

- Vanilla JS + ES modules, Canvas 2D, `localStorage`. No dependencies, no build step.
- Served statically (`python -m http.server`), deployable to Vercel as-is.
- Modules: `main.js` (wiring), `editor.js` (canvas state, drawing, history), `tools.js` (tool behaviors), `palette.js` (colors), `storage.js` (persist/restore), `export.js` (PNG scaling/download).
- Pointer Events API for unified mouse/touch/stylus drawing.

## Success criteria

- Draw → export → open PNG: pixels exactly match, transparency intact.
- Refresh mid-drawing: canvas restores exactly.
- Undo/redo across pencil, eraser, fill, and mirror strokes behaves correctly.
- Lighthouse-fast: no framework, first paint well under 1s on localhost.
