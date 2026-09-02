# PRD — Docket: Kanban Task Board

## Overview
A browser-based Kanban board for organizing work — multiple boards, drag-and-drop
columns and cards, labels, due dates, and a WIP limit per column to keep work from
piling up. No sign-up: every board lives in `localStorage`.

## Problem
Most "simple" task boards are either too bare (a todo list with no columns, no
workflow) or require an account and a subscription for what is, underneath,
client-side state. People want a real Kanban board — the kind that makes work
visible and satisfying to move — without signing up or paying for it.

## Goal
Make organizing and moving work feel tactile and fast: drag a card across the
board, watch the column counts and WIP warnings update live, and never lose a
board because nothing synced to a server that later turned off.

## Users
Anyone tracking work with more shape than a flat todo list — a personal project,
freelance client work, a small team's sprint board, a house move, a job search.

## Core Features

### 1. Boards
- Create / rename / delete boards
- One starter board ships pre-loaded ("Launch Docket") with a few sample cards
  across columns, so the app isn't empty on first load
- Switch boards from a board picker on the home screen

### 2. Columns
- Add / rename / delete columns; reorder by dragging the column header
- Optional WIP (work-in-progress) limit per column — the column header turns
  amber and the card count is flagged once its limit is exceeded
- Default board ships with To Do / In Progress / Done

### 3. Cards
- Add a card to any column via a quick-add field at the column's bottom
- Drag cards between columns and reorder within a column; a drop indicator shows
  exactly where the card will land
- Click a card to open a detail panel: title, multi-line description, a due
  date, and one or more colored labels
- Overdue cards (due date in the past, not in the Done-like last column) get a
  red due-date badge; due-today gets an amber one
- Delete a card from its detail panel (with confirmation)

### 4. Labels
- A small fixed palette of colored labels (e.g. Bug, Feature, Urgent, Idea) that
  can be created per board and assigned to any card
- Cards show their labels as small colored chips

### 5. Filter / Search
- A search box filters the visible cards on the current board by title/label
  text in real time; non-matching cards fade instead of disappearing, so the
  board's shape doesn't jump around while typing

## Design
- Clean, neutral workspace palette — light gray board background, white column
  panels, one accent color for primary actions and due-today badges, red
  reserved for overdue/WIP-exceeded states
- Cards lift with a shadow and a slight rotation while dragging; the drop target
  column highlights
- Compact, information-dense card face; the detail panel is where depth lives

## Stack
Vanilla JS (ES Modules) · CSS3 · HTML5 Drag and Drop API · `localStorage` — no
build step, no dependencies

## Out of Scope
- Accounts, multi-user boards, real-time collaboration
- File attachments on cards
- Recurring cards / automation rules
- Mobile drag-and-drop beyond what native HTML5 DnD provides in-browser

## Success Metric
A returning user can open a board, immediately see what's overdue or over its
WIP limit, and reorganize it — drag three cards, add one, close a done one out —
in under a minute, all of it saved without a single network request.
