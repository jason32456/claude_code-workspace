# PRD — Palette (Color Palette Generator)

## Overview

**Palette** is a single-page browser app that generates beautiful 5-color palettes with one keypress. Users can lock colors they like, regenerate the rest, and copy any hex code to their clipboard. Inspired by Coolors.co but stripped to the essentials.

## Problem

Designers and developers constantly need color inspiration. Existing tools are either too complex (full design suites) or too sparse (just a random color picker). There's a gap for a dead-simple tool that generates harmonious palettes in under a second.

## Target Users

- Web developers picking a color scheme for a side project
- Designers prototyping quickly
- Anyone who needs color inspiration

## Core Features

### F1 — Palette Generation
- Display 5 color swatches filling the full viewport height side-by-side
- On load, generate 5 random visually-pleasing colors (good saturation + lightness range)
- Press `Spacebar` or click the **Generate** button to regenerate unlocked swatches
- Smooth fade transition (300ms) when a swatch color changes

### F2 — Lock / Unlock Swatches
- Each swatch has a lock icon (🔒/🔓) centered at the bottom
- Clicking the lock toggles a locked state — locked swatches are skipped on regeneration
- Locked swatches show a subtle overlay tint to indicate locked state

### F3 — Copy Hex Code
- Each swatch displays its hex code (e.g. `#A3B8C2`) below the lock icon
- Clicking the hex code copies it to clipboard
- A small toast notification ("Copied!") appears for 1.5 seconds confirming the copy

### F4 — Export Palette
- A top-bar **Export CSS** button copies all 5 hex codes as CSS custom properties:
  ```css
  --color-1: #A3B8C2;
  --color-2: #F4E0B1;
  ...
  ```
- Same toast notification on copy

## Non-Goals

- No user accounts, no saving to server
- No color name lookup
- No image-based palette extraction
- No npm/build tools — pure vanilla HTML/CSS/JS

## Stack

- HTML5, CSS3 (custom properties, flexbox), vanilla ES6 JS
- localStorage: not needed for MVP (palette is ephemeral)
- Served by `python -m http.server` locally; deployed to Vercel as a static site

## Design Principles

- **One action, one screen.** No modals, no routing.
- **Keyboard-first.** Spacebar is the primary interaction.
- **High contrast UI chrome** — nav bar is dark so swatches pop.
- Font: system-ui stack, no external fonts

## Success Metrics (qualitative)

- A new user can generate and copy a palette in under 5 seconds without reading docs
- The app feels snappy — no layout jank or delayed responses
