# PRD — Breathe

## Problem
Stress and anxiety are pervasive. Most breathing-technique apps are bloated, require sign-up, or are buried in wellness platforms. People need a dead-simple, always-available tool that guides them through a breathing exercise in under two minutes with zero friction.

## Goal
A single-page, zero-dependency breathing guide that anyone can open in a browser tab and immediately use. No accounts, no ads, no distractions.

## Target Users
- Office workers needing a quick stress reset
- Students before exams
- Anyone who has heard of "box breathing" or "4-7-8" but forgets the timing

## Core Features

### 1. Animated Breathing Orb
A glowing circle on screen that smoothly expands during inhale, pauses during holds, and contracts during exhale. The animation is the instruction — no reading required.

### 2. Breathing Techniques (3 presets)
| Name | Pattern | Best For |
|---|---|---|
| Box Breathing | 4s in · 4s hold · 4s out · 4s hold | Focus, calm under pressure |
| 4-7-8 Technique | 4s in · 7s hold · 8s out | Sleep, acute anxiety |
| Physiological Sigh | 2s in · 1s in · 4s out | Fastest stress reset |

### 3. Phase Label & Countdown
Text below the orb shows the current phase (Inhale / Hold / Exhale) and a live countdown number (e.g. "4…3…2…1").

### 4. Session Controls
- Start / Pause / Reset button
- Cycle counter ("Round 3 of 5")
- Configurable number of rounds (3, 5, 10)

### 5. Dark Calm UI
Deep navy/slate background, soft gradient orb (blue → teal), minimal typography. No bright colors or jarring elements.

## Non-Goals
- No audio (keeps it universally usable)
- No user accounts or data persistence
- No mobile-native features; responsive is fine

## Stack
Vanilla HTML + CSS + JS. CSS keyframe animations for the orb. JS drives the phase sequencer and countdown. Served statically.

## Success Criteria
- App loads in < 1s
- A first-time user can start a session with one click
- Orb animation is smooth (no jank) at 60fps
- Works on Chrome, Firefox, Safari, and mobile browsers
