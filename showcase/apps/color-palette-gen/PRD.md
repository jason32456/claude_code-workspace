# PRD — Palettify: Color Palette Generator

## Overview

**Palettify** is a browser-based color palette generator that lets users instantly create beautiful 5-color palettes, lock favorites, and copy colors to use in their projects. It targets designers, developers, and anyone who needs color inspiration fast.

## Problem

Picking colors is hard and time-consuming. Tools like Adobe Color are powerful but heavy. Designers and developers often just want to rapidly explore palettes and grab hex codes without signing in or installing anything.

## Goal

A zero-friction, single-page tool: open it, hit spacebar, see beautiful palettes, copy the ones you like.

## Users

- Frontend developers picking a color scheme
- Designers exploring mood/brand palettes
- Students and hobbyists learning color theory

## Features

### Must-have (MVP)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Generate palette** | Clicking "Generate" button or pressing `Space` creates 5 new random colors |
| 2 | **Lock color** | Each swatch has a lock icon; locked colors survive the next generate |
| 3 | **Copy hex code** | Clicking the hex code (or the swatch) copies it to clipboard |
| 4 | **Copy feedback** | Brief "Copied!" toast confirms the action |
| 5 | **Keyboard shortcut** | `Space` generates, shown as a hint in the UI |

### Nice-to-have

| # | Feature | Description |
|---|---------|-------------|
| 6 | **Export CSS** | One-click copy of `--color-1` through `--color-5` CSS custom properties |
| 7 | **Smooth animation** | Swatches animate in on generate |
| 8 | **Accessible contrast** | Hex label color auto-switches black/white for legibility |

### Out of scope

- Saving/history of palettes
- Color harmony algorithms (triadic, analogous, etc.)
- User accounts
- Backend of any kind

## Design

- Full-viewport layout: 5 equal-width color columns
- Dark chrome UI (header + controls) to make colors pop
- Lock icon overlaid on each swatch, visible on hover
- Hex code displayed centered on swatch in contrasting text
- Minimal, clean — the colors are the hero

## Stack

- Vanilla HTML + CSS + JavaScript (ES modules, no build step)
- Served by `python -m http.server` locally
- Deployed on Vercel as a static site

## Success Metrics

- Loads in < 1 second
- Works on desktop Chrome, Firefox, Safari
- Zero external dependencies
