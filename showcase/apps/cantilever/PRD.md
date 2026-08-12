# Cantilever — Product Requirements Document

## Overview

Cantilever is a structural engineering puzzle game. The player spans a gap with
beams, cables and road deck under a fixed budget, then presses **Test** and
watches a truck drive across their design. Members stretch and compress under the
load, color themselves by how close they are to failing, and snap when they go
past their limit. A bridge either carries the truck to the far side or folds into
the ravine.

The simulation is the product. Every member is a real distance constraint with
mass, stiffness and a breaking strain, so the failure modes are the ones a real
structure has: decks sag between supports, long compression members buckle first,
cables do nothing at all when you ask them to push.

## Alternatives considered

- **Digital logic sandbox** — gates, wires, truth tables. Useful and distinct, but
  visually static; the repo already has tool-shaped projects.
- **FDTD wave / optics simulator** — double-slit, lenses, interference. Gorgeous,
  but it is a demo rather than an app: nothing to *do* beyond dragging sliders.
- **Hydraulic terrain erosion** — heightmap erosion with a 3D render. Strong
  visuals, but the interesting part is a long offline simulation, which makes for
  a poor interactive loop.
- **Bridge builder (chosen)** — the only candidate that is a game and a numerical
  simulation at once, with a build → test → fail → revise loop that rewards
  understanding the physics.

## Problem

Structural intuition is hard to build from diagrams. Free-body diagrams and
stiffness matrices are the correct way to describe a truss and a terrible way to
*feel* one. A player who watches their own bridge sag at midspan, and sees exactly
which member goes red first, learns where the load actually travels.

## Goals

- Make load paths visible — every member is colored by its live stress ratio
- Make failure legible — members break one at a time, at the weakest point first
- Give the three material types genuinely different behavior, not just prices
- Ship 8 hand-designed levels that teach a new idea each
- Run offline, in one folder, with no dependencies and no build step

## Non-Goals

- Photoreal or 3D rendering — this is a blueprint, deliberately
- A level editor for players (the sandbox level covers free building)
- Multiplayer, accounts, or any network use
- Textbook accuracy: this is an elastic dynamic model, not a certified FEA package

## Users

Anyone who has bounced off Poly Bridge and wanted the physics to be more honest,
plus students and hobbyists who want to see where a truss carries its load.

## Features

### F1 — Build mode
- Grid-snapped canvas; drag from any point to any point to place a member
- Three materials, hotkeys `1` / `2` / `3`:
  | Material | Cost/m | Behavior |
  |---|---|---|
  | Road | 12 | Heavy deck, the only surface the truck can drive on |
  | Beam | 8 | Steel truss member, strong in tension and compression |
  | Cable | 3 | Tension only — goes slack instead of pushing, cannot carry deck |
- Members snap to existing joints; a maximum member length forces real trusses
  instead of one giant plank
- Eraser tool (`E`, or right-click on a member) removes it and refunds its cost
- Undo / redo (`Ctrl+Z` / `Ctrl+Shift+Z`) across the whole build history
- Live budget readout; placement is blocked when a member would exceed budget
- Anchors are fixed to the terrain and drawn as hatched supports

### F2 — Validation
- Test is disabled until a continuous run of **road** connects the left platform
  to the right platform
- The reason is surfaced in the HUD ("Road must reach the far platform"), not
  hidden behind a disabled button

### F3 — Simulation
- Verlet integration with position-based distance constraints, substepped for
  stiffness (8 substeps × 6 iterations per frame)
- Per-material stiffness, linear density and breaking strain
- Cables apply their constraint only when stretched past rest length
- Compression members lose strength as they get longer, standing in for Euler
  buckling, so long struts fail before short ones
- Members break when |strain| exceeds their limit, and breakage is progressive —
  losing one member redistributes load and often cascades

### F4 — Test run
- A truck built from four particles and six rigid constraints spawns on the left
  platform and drives right
- Wheels collide with road members as circle-vs-segment contacts, with the
  correction mass-weighted between truck and structure, so a heavy truck visibly
  deflects a light deck
- Members are colored by stress ratio: teal (slack) → amber (working) → red (about
  to fail); broken members fall away as debris
- Win when the truck's wheels reach the goal zone; fail when it falls below the
  terrain or the deck is severed

### F5 — Levels
Eight levels, each introducing one idea:
1. **First Crossing** — short gap, generous budget; learn the controls
2. **Span** — the gap is now wider than the longest legal member
3. **Two Towers** — a mid-river pier becomes available
4. **Deep Ravine** — no mid support; the deck must be trussed
5. **Cable Stay** — high anchors and cheap cables
6. **The Long Haul** — long span, tight budget
7. **Clearance** — a shipping channel the structure may not cross
8. **Sandbox** — every anchor, effectively unlimited budget

### F6 — Persistence
- Per level: last design, best (cheapest) winning cost, completion flag
- Stored in localStorage under `cantilever_v1`
- Level select shows a check and the best cost for cleared levels

### F7 — Feedback
- Stress readout for the most-loaded member during a run
- Slow, deliberate camera-free framing: the whole structure is always in view
- Short synthesized snap on break and a chord on success (Web Audio, no files)

## Technical notes

- Vanilla JS, ES modules, Canvas 2D, no dependencies
- `physics.js` owns the solver and knows nothing about rendering or input
- `levels.js` is pure data; a level is terrain, anchors, budget, spawn, goal
- `window.cantilever` exposes `loadLevel`, `addMember`, `test` and `state` so
  designs can be driven programmatically for testing and screenshots

## Success criteria

- Every level is winnable, verified by a scripted design that crosses
- A 60-member structure holds 60fps during a test run
- No console errors, no network requests, works from `file://`-adjacent static
  hosting (any plain HTTP server)
