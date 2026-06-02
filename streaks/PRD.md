# PRD — Streaks: Habit Tracker

## Overview
A minimal, beautiful browser-based habit streak tracker. Users add up to 6 daily habits, check them off each day, and watch streaks grow. All data lives in `localStorage` — no sign-up, no server.

## Problem
Habit-building apps are either too complex (requires accounts, notifications, subscriptions) or too ugly to feel rewarding. Most people just want a frictionless way to see their streak and feel motivated to keep it going.

## Goal
The simplest habit tracker that is also satisfying to use. Checking a habit should feel *good*. A broken streak should sting just enough to motivate.

## Users
Anyone who wants to build a daily routine — working out, reading, meditating, drinking water, etc.

## Core Features

### 1. Add / Delete Habits
- A prominent "Add Habit" button opens an inline input
- User types a habit name (e.g. "Morning Run") and optionally picks an emoji icon
- Up to 6 habits
- Each habit can be deleted (with confirmation)

### 2. Daily Check-off
- Each habit card shows a large checkbox for today
- Checking triggers a satisfying pop animation + confetti burst
- Already-checked habits are visually distinct (dimmed, check shown)
- Midnight resets today's check — streaks preserve history

### 3. Streak Counter
- Bold streak number prominently displayed on each card
- 🔥 icon appears when streak ≥ 3 days
- 🏆 icon replaces fire at streak ≥ 30 days
- Streak breaks if yesterday was not checked (not just "today")

### 4. 30-Day Heatmap
- A row of 30 small squares, one per day, latest on the right
- Filled = checked that day, empty = missed
- Shade intensity scales with recency (subtle effect)

### 5. Motivational Message
- One-line dynamic message below streak count:
  - 0 days: "Start today!"
  - 1–2: "Great start!"
  - 3–6: "Keep it up!"
  - 7–13: "One week strong 💪"
  - 14–29: "Two weeks! You're building something real."
  - 30+: "Legendary 🏆"

## Design

- **Theme:** Dark background (`#0f0f13`), card surfaces `#1a1a24`
- **Accent:** Electric purple `#7c3aed` for active states, gold `#f59e0b` for streaks
- **Typography:** System font stack, large bold streak numbers
- **Animations:** Spring pop on check-off, shimmer on streak milestone

## Stack
Vanilla JS · CSS3 · localStorage · ES Modules

## Out of Scope
- Notifications / reminders
- Accounts / sync
- Weekly / monthly goals
- Statistics dashboard

## Success Metric
Feels fast, looks great, and checking off a habit is genuinely satisfying.
