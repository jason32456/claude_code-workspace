# MoodLog — Product Requirements Document

## Overview

MoodLog is a minimal daily mood-journaling web app. Once a day, the user picks an emoji that best matches their mood, optionally adds a short note, and sees their history laid out as a color-coded calendar heatmap. It is calm to use, loads in a second, and stores everything locally — no account needed.

## Problem

People who want to track their emotional wellbeing are stuck choosing between overbuilt mental-health platforms that require sign-up and monthly fees, or bare-bones spreadsheets with no visual payoff. There is nothing lightweight, beautiful, and instantly useful for a 10-second daily check-in.

## Goals

- Let a user log their mood for today in under 10 seconds
- Make the history visually satisfying at a glance (color heatmap calendar)
- Reward consistency with a streak counter
- Require zero sign-up, zero network — 100% local storage

## Non-Goals

- Mood analysis / AI insights
- Social sharing or cloud sync
- Reminders / notifications
- Export (nice to have later, not in v1)

## Users

Solo individuals who want light daily emotional self-awareness — journalers, people in therapy, anyone curious about their own patterns.

## Features

### F1 — Daily Mood Picker
- 8 moods arranged in a 4×2 grid: 🤩 Amazing, 😄 Great, 😊 Good, 😌 Calm, 😐 Okay, 😕 Meh, 😢 Sad, 😤 Stressed
- Clicking a mood selects it (ring highlight) and reveals the note field
- Only one mood per day; re-opening shows the saved selection pre-highlighted

### F2 — Optional Note
- 280-character textarea below the mood picker
- Live character counter
- Shown only after a mood is selected

### F3 — Save / Edit
- "Save Entry" button persists to localStorage keyed by `YYYY-MM-DD`
- If today already has an entry, show a "Today's Entry" summary card instead of the picker
- "Edit" button on the summary card restores the picker with the existing selection loaded

### F4 — Calendar Heatmap
- Monthly calendar view; navigate back up to 12 months
- Days with entries are filled with the mood's color (semi-transparent)
- Hovering a day shows a tooltip: date, emoji + label, note snippet
- Future days are visually muted; today has a subtle ring

### F5 — Stats Bar
- **Current streak**: consecutive days logged ending today (or yesterday if today not yet logged)
- **Best streak**: all-time longest run
- **Top mood**: emoji + label of the most-logged mood overall

### F6 — Mood Legend
- Horizontal strip showing all 8 emoji + labels with their color swatch
- Serves as the calendar key

## Mood Color Palette

| Mood       | Emoji | Color     |
|------------|-------|-----------|
| Amazing    | 🤩    | `#a78bfa` |
| Great      | 😄    | `#34d399` |
| Good       | 😊    | `#6ee7b7` |
| Calm       | 😌    | `#93c5fd` |
| Okay       | 😐    | `#fcd34d` |
| Meh        | 😕    | `#fb923c` |
| Sad        | 😢    | `#60a5fa` |
| Stressed   | 😤    | `#f87171` |

## Data Model

localStorage key: `moodlog_entries`

```json
{
  "2026-07-20": { "mood": 1, "note": "Really productive day." },
  "2026-07-19": { "mood": 2, "note": "" }
}
```

`mood` is an index (0–7) into the ordered MOODS array.

## Technical Stack

- Vanilla JS (ES Modules)
- CSS3 (custom properties, grid, animations)
- localStorage
- No build step — served directly via `python -m http.server`

## Design Principles

- **Warm minimal**: off-white/cream background, soft shadows, generous whitespace
- **Fast interactions**: mood selection feels immediate with CSS transitions
- **Dark mode**: respects `prefers-color-scheme` automatically
- **Accessible**: keyboard-navigable mood picker, sufficient contrast ratios
