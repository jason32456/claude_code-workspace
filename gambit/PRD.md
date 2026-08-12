# Gambit — Product Requirements Document

## 1. Summary
**Gambit** is a full chess game for the browser: play White or Black against
a built-in AI opponent, with every standard rule implemented (castling, en
passant, promotion, check/checkmate/stalemate, the fifty-move rule,
threefold repetition, insufficient-material draws) and a move-history panel
in real algebraic notation. Four difficulty levels trade off search depth
and think time, from a beatable "Casual" bot to a "Hard" bot that runs
iterative-deepening alpha-beta search against a time budget.

Nothing else in this repo is a rules-complete board game with an adversarial
search AI — every existing "game" folder is real-time (reflexes, physics, or
resource management under a clock). Gambit is turn-based and the opponent is
a search algorithm, not a spawner.

## 2. Why this app
- **Genuinely useful.** Chess practice against an opponent that's always
  available, always fair, and lets you pick your own difficulty — no
  account, no matchmaking wait, no ads.
- **Real complexity, honestly scoped.** A legal move generator (with all
  special-move edge cases) plus a minimax/alpha-beta search with move
  ordering and an evaluation function is a meaningfully hard, well-defined
  engineering problem — not a reskin of an existing mechanic in this repo.
- **Self-contained.** Static folder, no build step, no external chess
  library, no backend, runs fully offline once loaded.

## 3. Non-goals
- No online multiplayer, accounts, or matchmaking.
- No opening book or endgame tablebase — the AI reasons from the position
  alone, every game.
- No chess-960 / variants in v1 — standard starting position and rules only.
- No PGN import — export only (copy current game as PGN text).
- No clock/time-pressure play in v1 — untimed games only.

## 4. Core gameplay
1. Player picks a side (White or Black) and a difficulty, then plays on an
   8×8 board rendered with CSS grid + Unicode/SVG piece glyphs.
2. **Move input:** click a piece to see its legal destination squares
   highlighted, click a destination to move (or drag-and-drop). Illegal
   destinations are not selectable.
3. **Special moves** are handled transparently: castling (click king two
   squares toward the rook), en passant (offered automatically the move
   after a pawn double-step), promotion (a piece-choice picker appears when
   a pawn reaches the last rank).
4. After the player's move, the AI "thinks" (shown with a subtle spinner on
   its clock/status area) and replies. Depth/time scales with difficulty so
   Casual responds near-instantly and Hard can take a couple of seconds.
5. **Check** highlights the king's square in red and shows a "Check!"
   status; **checkmate** and **stalemate** end the game with a clear result
   banner; draw conditions (50-move, threefold repetition, insufficient
   material) are detected automatically and end the game as a draw.
6. **Move history** panel lists moves in real algebraic notation
   (`Nf3`, `O-O`, `exd5`, `Qh4#`, …), numbered in move pairs, always
   scrolled to the latest move.
7. **Undo** takes back the last full turn (player + AI reply) so mistakes
   are correctable without restarting.
8. **New Game**, **flip board**, and **copy PGN** are always available.
9. In-progress game (board state, side, difficulty, move history) persists
   to `localStorage` so a refresh resumes exactly where you left off.

## 5. AI opponent
- **Search:** minimax with alpha-beta pruning over the legal move tree.
- **Move ordering:** captures first (MVV-LVA — most valuable victim, least
  valuable attacker), then the rest, to maximize pruning efficiency.
- **Evaluation:** material balance + per-piece piece-square tables (pieces
  favor central/active squares, king favors safety early and the center in
  the endgame) + mobility (legal-move count) bonus.
- **Difficulty levels:**
  | Level | Search | Feel |
  |---|---|---|
  | Casual | depth 1, occasional random pick among near-equal top moves | loses on purpose sometimes, good for learning |
  | Club | fixed depth 2 | makes real plans, still beatable |
  | Strong | fixed depth 3 | solid tactical awareness |
  | Hard | iterative deepening to a ~1.5s time budget (typically depth 4–5) | plays for real |
- All search runs synchronously in short bursts on the main thread but is
  scheduled so the UI never freezes (thinking indicator shown, input
  disabled only while the AI is actually to move).

## 6. Controls
| Action | Input |
|---|---|
| Select piece / move | click, or drag-and-drop |
| Promote | click a piece in the promotion picker (Q/R/B/N) |
| Undo last turn | button / `Ctrl+Z` |
| New game | button |
| Flip board | button / `F` |
| Copy PGN | button |

## 7. UI / screens
- **Setup bar:** side picker (White/Black/Random), difficulty picker, New
  Game button — always visible above the board.
- **Board:** 8×8 grid, alternating square colors, coordinate labels on the
  edge, legal-move dots/rings on selected-piece destinations, last-move
  highlight, red check highlight on the king in check.
- **Side panel:** captured-pieces tray (material count/advantage), move
  history list (scrollable, algebraic notation), status line (whose turn,
  check/checkmate/stalemate/draw), Undo / Flip / Copy PGN buttons.
- **Result banner:** overlay on checkmate/stalemate/draw with the outcome
  and a Rematch button.

## 8. Visual design
- Clean, high-contrast board — warm cream/walnut square pair, subtle inner
  shadow on the board frame.
- Pieces as crisp SVG glyphs (no image assets to fetch), scale cleanly at
  any board size.
- Selected square glows softly; legal destinations show a small dot (empty
  square) or ring (capture); last move shows a soft highlight on both its
  from/to squares; king in check pulses red.
- Side panel uses a quiet monospace-adjacent type for the move list so
  ranks of moves stay visually aligned.

## 9. Tech
- Vanilla JS (ES modules), CSS Grid for the board, no frameworks, no
  bundler, no chess library — the rules engine and AI are hand-written.
- Files: `index.html`, `style.css`, `main.js`, `engine.js` (board state +
  legal move generation + rules), `notation.js` (algebraic square/SAN
  helpers), `ai.js` (evaluation + alpha-beta search), `ui.js` (rendering +
  input handling).
- Game state (board, turn, castling rights, en passant target, halfmove
  clock, history) persisted to `localStorage`, auto-resumed on load.

## 10. Success criteria
- Loads and plays fully offline via `python -m http.server`.
- Every standard chess rule is correctly enforced, including all edge cases
  (castling through/into check is illegal, en passant only on the
  immediately following move, underpromotion is selectable, draws detected
  correctly).
- The AI is legitimately harder to beat at Hard than at Casual, and Hard
  never blunders a hanging queen when a safe alternative exists.
- A full game can be played start to finish (including reaching
  checkmate) without the UI ever entering a stuck or unrecoverable state.
- At least two embedded screenshots in the README (fresh game, mid-game
  with move history populated).
