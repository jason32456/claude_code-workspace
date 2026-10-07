# Snell — PRD

## One-liner

One beam of white light crosses your desktop. Every browser window carries a
glass prism, a mirror or clear glass at its centre, and the beam is only visible
through windows. Drag and rotate windows until the spectrum lands on three
coloured sensors fixed to your screen.

## Why after Sill

Sill showed that separate windows can share one world. Snell keeps that and
changes what passes between the windows. Water moves slowly and gets carried.
Light crosses the whole screen at once, so moving one window re-routes
everything downstream of it immediately. The geometry is exact: refraction by
Snell's law at every glass face, total internal reflection, and Cauchy
dispersion that pulls white light apart into nine wavelengths.

## Design

* **Screen space is the world.** The source sits on the left edge of the
  screen and the sensors are fixed in screen pixels. Each window draws the
  part of the light path that crosses its own rect.
* **Each window is an optic.** A prism (equilateral, 0.3 × the window's short
  side), a mirror, or clear glass. Rotate it with the wheel, a horizontal
  drag or the arrow keys. **M** cycles the kind.
* **No authority.** Every window broadcasts its rect, kind and angle on a
  `BroadcastChannel`, and every window traces the identical path from that
  list. There's no worker and no leader, so there's no lag to compensate.
* **Solvable by construction.** `scripts/levels.mjs` places reference windows,
  traces the real dispersion, and puts each sensor where its colour lands.

## Levels

1. **Split**: one prism.
2. **Down**: a mirror turns the beam down into a prism.
3. **Up**: the beam enters low, and a mirror throws it up into a prism.

## Out of scope (4 pm cut-off)

A simulated desktop for phones, sound, partial (Fresnel) reflection, and more
levels.
