# PRD — Patience: Klondike Solitaire

## Overview
A browser implementation of Klondike solitaire ("Patience") — full standard
rules, drag-and-drop card and sequence movement, undo, a move-suggesting hint
engine, an auto-finish for the endgame, and a seeded Daily Challenge that
gives everyone the same shuffle for the day with a streak tracker. No
sign-up: every stat lives in `localStorage`.

## Problem
Most browser solitaire implementations are either ad-choked reskins of the
same Windows game or too bare to feel satisfying — no hint when you're
stuck, no daily hook, no memory of how you're doing over time. The genre is
simple enough to be "just a card game" but has enough real state (52 cards,
legal-move rules, hidden information, sequence dragging) to be worth doing
properly.

## Goal
Make a Klondike implementation that feels tactile (real drag physics for
single cards and runs), never leaves you stuck without recourse (undo +
hint), and gives return visits a reason to exist (Daily Challenge + streak +
stats) — all client-side, zero network requests after load.

## Users
Anyone who wants a quick, ad-free game of solitaire — a coffee-break
regular, someone maintaining a daily-puzzle streak habit, or a curious
player who wants a nudge when no move is obvious.

## Core Features

### 1. Classic Klondike rules
- Standard 52-card deal: 7 tableau columns (1–7 cards, top card face up),
  24-card stock, empty waste, 4 empty foundations
- Draw 1 or Draw 3 from stock, selectable at New Game; stock recycles from
  waste when exhausted (unlimited redeals, with a small score penalty per
  recycle)
- Legal moves enforced everywhere: tableau builds descending, alternating
  color; foundations build ascending by suit from Ace; only Kings start an
  empty tableau column
- Moving a face-up run drags the whole run; clearing a tableau card that was
  covering a face-down card flips it automatically

### 2. Interaction
- Pointer-based drag and drop (mouse + touch) for single cards and runs,
  with a snap-back on an illegal drop and a highlighted valid drop target
  while dragging
- Double-click/tap a card to auto-send it to a foundation when legal
- Click the stock to draw; click an empty stock to recycle the waste

### 3. Undo & Auto-Finish
- Unlimited undo (single steps) via a history stack
- "Auto Finish" activates once every tableau card is face up and the stock
  is empty; it plays the rest of the game out to the foundations
  automatically at a quick animated pace

### 4. Hint
- A hint button scans all legal moves and highlights the single most useful
  one (prioritizing moves that reveal a hidden card, then foundation moves,
  then tableau reshuffles, then drawing from stock) rather than solving the
  whole game — a nudge, not an answer key

### 5. Daily Challenge
- One deterministic seeded deal per calendar date, identical for every
  player that day
- Tracks completion, current streak, and best streak in `localStorage`;
  replaying a completed daily is allowed but doesn't affect the streak twice

### 6. Stats
- Games played, games won, win rate, best time, best score, current/best
  streak — persisted locally, viewable in a stats panel

### 7. Score, timer, moves
- Standard-style scoring (+10 foundation, +5 reveal/waste-to-tableau, −15
  foundation-to-tableau, small penalty per stock recycle, floor at 0)
- Live elapsed timer and move counter

## Design
- Felt-green table background, crisp white cards with red/black pips, subtle
  card shadows that deepen while dragging
- Card flip and deal use short CSS transforms; win triggers a cascading
  card-bounce animation across the screen
- All sound (deal, flip, place, invalid, win fanfare) is synthesized via the
  Web Audio API — no audio files — with a mute toggle

## Stack
Vanilla JS (ES Modules) · CSS3 · Pointer Events · Web Audio API ·
`localStorage` — no build step, no dependencies.

## Out of Scope
- Guaranteeing every deal is solvable (Daily Challenge included) — that
  needs a full solver; the hint engine suggests, it doesn't prove
- Vegas/cash scoring variants, multiplayer, accounts, leaderboards
- Spider or FreeCell variants

## Success Metric
A player can open the app, understand the board with no instructions, play
a full game to a win or a stuck state, and — if stuck — get an undo or hint
that gets them moving again, all without a single loading spinner or ad.
