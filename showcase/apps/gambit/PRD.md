# Gambit — Product Requirements Document

## Summary

Gambit is a self-contained browser chess app with two modes: **Play**, a full
chess board against a local AI opponent or a second human (pass-and-play),
and **Puzzle Rush**, a timed tactics trainer built from a hand-curated,
programmatically-verified puzzle bank. It fills a gap in the showcase — 15
games, several simulations, nothing board-game or skill-trainer shaped for
chess — while staying genuinely useful: a real, rule-correct chess board
people can actually play, plus deliberate practice for tactical pattern
recognition.

## Why this, why now

- **Fun**: chess is one of the most enduring games; an opponent that's always
  available and puzzles that give instant right/wrong feedback are both
  inherently replayable.
- **Somewhat useful**: tactics puzzles are the single most recommended way to
  improve at chess. A free, no-signup, no-tracking drill tool has real value.
- **Right complexity band**: legal move generation (check, checkmate,
  castling, en passant, promotion, threefold/50-move draws), an AI opponent
  with real search, and a puzzle engine that scripts forced move sequences
  is meaningfully harder than the CSS-and-localStorage tools in the showcase,
  without needing a backend (fits the "static site under showcase/apps"
  constraint in CLAUDE.md).
- **Not a duplicate**: no chess, board game, or tactics trainer exists in the
  repo today (checked `showcase/data/projects.js`).

## Non-goals

- No online multiplayer, accounts, or matchmaking (would require a backend —
  out of scope per CLAUDE.md's rule that static apps stay under
  `showcase/apps/`).
- No opening book / endgame tablebase — the AI is a plain depth-limited
  search, not competition-strength.
- No move import/export beyond a simple PGN copy — no game database, no
  analysis engine (no Stockfish/WASM; keeps the app small and instantly
  loading).

## Users & use cases

1. A visitor wants a five-minute game of chess against something — Play mode,
   vs AI, pick a difficulty, play to checkmate.
2. Two people share one screen/keyboard — Play mode, vs Human (pass-and-play).
3. A visitor wants to sharpen tactical vision — Puzzle Rush: solve as many
   puzzles as possible before running out of lives, moves are validated
   instantly, streak is tracked.

## Functional requirements

### Chess rules engine

- Full legal move generation and game-state detection (check, checkmate,
  stalemate, draw by insufficient material / 50-move / threefold repetition),
  via the vendored `chess.js` (BSD-2-Clause), so rules correctness is not
  reinvented or hand-verified move-by-move.

### Play mode

- Click-to-select board: selecting a piece highlights its legal destination
  squares; clicking a destination plays the move (illegal targets are
  disabled, not just visually marked).
- Opponent select: **Human** (pass-and-play) or **AI** at Easy / Medium /
  Hard, mapped to search depth.
- AI: minimax with alpha-beta pruning over `chess.js`-generated legal moves,
  material + piece-square-table evaluation, capped depth per difficulty so
  Hard stays responsive in-browser (no Web Worker needed at this depth).
- Move list panel in SAN, captured-piece trays for both sides, flip-board and
  undo (steps back one full move so it's always the human's turn again),
  resign, and new-game.
- End-of-game modal names the result (checkmate / stalemate / draw /
  resignation) and offers a rematch.
- Synthesized sound effects (move, capture, check, illegal-click, game end)
  via Web Audio — no audio files, matching the `PULSE` app's approach.

### Puzzle Rush mode

- Puzzle bank stored as local data (`data/puzzles.js`): each entry is a FEN,
  the side to move, and a scripted move sequence (the opponent's setup move
  already applied in the FEN; the player's correct move(s) interleaved with
  any forced opponent replies, which auto-play after a short delay).
- Player picks a difficulty tier (Easy / Medium / Hard), which filters the
  bank; puzzles within a tier are served in random, non-repeating order.
- A wrong move flashes red and reverts the board (not counted as an
  illegal-move click — the move was legal chess, just not the puzzle's
  answer); 3 wrong answers ends the run.
- Correct answers advance to the next puzzle immediately; a stopwatch runs
  for the whole session.
- Session summary: puzzles solved, time, and current streak vs. best streak
  (best streak persisted in `localStorage`).
- Every puzzle is validated offline before shipping (FEN parses, every
  scripted move is legal in sequence, and the final position matches the
  claimed outcome — checkmate for mate puzzles, or the claimed capture/
  material change for tactical-motif puzzles) using the same vendored
  `chess.js`, so the shipped bank cannot contain a puzzle with no legal
  solution.

## Non-functional requirements

- Fully static, offline-capable: no CDN references, no runtime network
  calls; `chess.js` is vendored under `vendor/`.
- Runs from `python -m http.server` with no build step, per the repo's
  ES-modules convention.
- Playable on a phone-width viewport (board resizes, panels stack).

## Success criteria

- A full legal game can be played start to finish against each AI
  difficulty and end correctly on checkmate/stalemate/draw.
- Puzzle Rush runs end-to-end with the verified puzzle bank, tracks streak,
  and persists a best streak across reloads.
- Registered in `showcase/data/projects.js` and documented per
  `CLAUDE.md`'s project checklist (README with screenshots, run command).
