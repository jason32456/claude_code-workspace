# Trivia Sprint — Product Requirements Document

## Overview
A fast-paced, browser-based trivia game. Players answer 10 multiple-choice questions against a 10-second countdown per question. Questions are fetched live from the free Open Trivia DB API (no API key required). Personal bests and streaks are persisted in localStorage.

## Goals
- Fun and replayable: tight time pressure makes each game feel like a sprint
- Somewhat useful: players learn facts across dozens of topics
- Simple enough to build in one session with zero dependencies

## Target User
Anyone who wants a quick mental warm-up, a coffee-break challenge, or to settle "who knows more trivia" in under 3 minutes.

## Core Features

### 1. Start Screen
- Title + tagline
- **Category** dropdown (All, General Knowledge, Science, History, Sports, Geography, Film, Music, Video Games, Anime)
- **Difficulty** selector: Easy / Medium / Hard (pill toggles)
- **Play** button

### 2. Game Screen
- Question number (e.g. "Question 3 / 10")
- Circular countdown timer (10 s, animates from full to empty, turns red in last 3 s)
- Question text (HTML-decoded, safe rendering)
- 4 answer buttons laid out in a 2×2 grid
- On answer or timeout:
  - Correct: button flashes green, +100 pts (+ time bonus: remaining seconds × 5)
  - Wrong / timeout: chosen button flashes red, correct answer revealed in green
  - 0.8 s pause, then next question
- Running score and current streak badge visible at top

### 3. Results Screen
- Final score (out of max 1 400)
- Accuracy % (correct / 10)
- Longest streak in the game
- Personal best score (localStorage) + "New Best!" if beaten
- Answer review: each question with your answer and the correct answer
- **Play Again** (same settings) and **Change Settings** buttons

## Scoring
| Event | Points |
|---|---|
| Correct answer | 100 |
| Time bonus | remaining_seconds × 5 |
| Wrong / timeout | 0 |

## API
- Endpoint: `https://opentdb.com/api.php?amount=10&type=multiple&encode=url3986`
- Optional params: `&category=<id>&difficulty=<easy|medium|hard>`
- Response: array of questions, each with `correct_answer` and `incorrect_answers[]`
- Shuffle answers client-side (Fisher-Yates) on each render

## States & Flow
```
START → LOADING → QUESTION (×10) → RESULTS → (START or QUESTION)
```
- Loading spinner shown while API is in-flight
- Error state if API fails (retry button)

## Visual Design
- Dark theme: deep navy `#0a0f1e` background
- Accent: electric cyan `#00d4ff`
- Correct: `#00e676` | Wrong: `#ff1744`
- Font: system-ui, sans-serif
- Timer ring: SVG stroke-dashoffset animation
- Answer buttons: subtle glassmorphism card style
- Streak badge pulses on increment

## Tech Stack
- Vanilla JS (ES Modules)
- CSS3 (custom properties, animations, grid)
- No build step — served by `python -m http.server`
- Single `index.html` + `style.css` + `main.js` + `game.js` + `api.js`

## Non-Goals
- Multiplayer
- User accounts / server-side leaderboard
- Custom question creation
