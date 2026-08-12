# PRD — Spin & Decide (Decision Wheel)

## Problem
People waste time deliberating over small group decisions — where to eat, whose
turn it is, which task to tackle first, who goes first in a game. A physical
spinner or coin flip works but isn't shareable, isn't reusable, and can't
remember your usual lists. Existing web spinners (Wheel Decide, Picker Wheel,
Wheel of Names) validate strong demand for this exact tool, but are ad-heavy
and slow. A fast, ad-free, single-page version fits well as a small useful
utility.

## Goal
A single-page web app where a user types a list of options, spins a wheel, and
gets one randomly (fairly) selected result — with enough polish (animation,
sound, confetti) to be genuinely fun to use repeatedly, and enough persistence
(saved presets, history) to be useful beyond a one-off decision.

## Target user
Anyone facing a small everyday decision alone or in a group: friends picking a
restaurant, a teacher calling on students, a household assigning chores, a
game group deciding turn order.

## Core features (MVP)
1. **Option list editor** — textarea, one option per line (or comma-separated),
   live-synced to the wheel. Minimum 2 options to spin.
2. **Canvas wheel** — evenly-sized colored slices, one per option, label text
   curved/rotated to fit its slice, fixed pointer at top.
3. **Spin** — click the wheel or press Space; wheel spins with a randomized
   target angle and eased deceleration (ease-out cubic, 4–6s); a soft
   ticking sound plays as slice boundaries pass the pointer.
4. **Result** — when the wheel stops, the winning slice is highlighted, a
   result modal shows the winning option, a confetti burst fires, and a short
   "ding" sound plays.
5. **Elimination mode toggle** — optional switch: when on, the winning option
   is removed from the wheel after each spin (for "who goes first" style
   ordering); off by default (repeatable spins).
6. **Spin history** — a running list of the last 20 results this session,
   newest first, with timestamps.
7. **Presets** — save the current option list under a name to localStorage;
   load, rename, or delete saved presets. Ship with 2–3 starter presets
   (e.g. "What's for dinner?", "Who goes first?").
8. **Responsive layout** — usable on mobile (wheel scales, controls stack).

## Explicit non-goals (MVP)
- No accounts, no backend, no database — localStorage only.
- No weighted/unequal slice probabilities (all options equally likely).
- No shareable URLs / multiplayer sync.
- No image uploads on slices — text labels only.

## Success criteria
- Spinning feels physically satisfying (deceleration curve, tick sound,
  confetti) — not an instant jump-cut to the answer.
- A first-time user can add options and get a result within 10 seconds with
  no instructions.
- Refreshing the page preserves saved presets and the current option list.
- Works on a phone-sized viewport without horizontal scrolling.

## Tech approach
Vanilla JS + Canvas 2D + ES Modules + localStorage, static site — consistent
with this repo's default stack, deployable as-is to Vercel with zero build
step.
