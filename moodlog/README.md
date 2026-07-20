# MoodLog — Daily Mood Journal

A calm, minimal daily mood-journaling web app. Pick an emoji, add an optional note, and watch your emotional patterns emerge as a color-coded calendar heatmap. No sign-up, no server — everything lives in your browser.

| Empty state | With history |
|:---:|:---:|
| ![Empty](screenshots/empty-state.png) | ![History](screenshots/with-history.png) |

| Mood selected |
|:---:|
| ![Selected](screenshots/mood-selected.png) |

## Features

- **8 moods** — 🤩 Amazing · 😄 Great · 😊 Good · 😌 Calm · 😐 Okay · 😕 Meh · 😢 Sad · 😤 Stressed
- **Optional note** — up to 280 characters per entry, revealed after mood selection
- **Edit today's entry** at any time
- **Monthly calendar heatmap** — each logged day colored by mood; hover for a tooltip showing the date, mood, and note
- **Streaks** — current day streak and all-time best streak
- **Top mood stat** — most-logged mood across all time
- **Persistent** — all data stored in `localStorage`; nothing leaves your device
- **Dark mode** — automatically follows `prefers-color-scheme`

## How to run

```bash
cd moodlog
python3 -m http.server 8080
# open http://localhost:8080
```

ES modules require an HTTP server; `file://` URLs won't work.

## Stack

- Vanilla JS (ES Modules)
- CSS3 (custom properties, grid, animations)
- `localStorage` for persistence
- No build step, no dependencies

## Data format

Stored in `localStorage` under the key `moodlog_entries`:

```json
{
  "2026-07-20": { "mood": 1, "note": "Shipped the new feature!" },
  "2026-07-19": { "mood": 3, "note": "" }
}
```

`mood` is a 0-indexed integer into the MOODS array (0 = Amazing … 7 = Stressed).
