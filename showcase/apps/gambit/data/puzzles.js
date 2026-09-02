// Tactics puzzle bank for Puzzle Rush.
//
// Each puzzle's `fen` is the position with the player to move. `solution`
// is the scripted move sequence in long algebraic ("e2e4", "e7e8q" for
// promotion): the player's move first, then any scripted opponent reply,
// alternating, until the puzzle resolves. `outcome` is "checkmate" (the
// final player move must deliver mate) or "material" (the final player
// move must be a capture — the tactical point of the puzzle).
//
// Every entry here is mechanically verified offline against the vendored
// chess.js: the FEN parses, every move in `solution` is legal in sequence,
// and the final position matches the claimed outcome. See
// dev/validate-puzzles.mjs and PRD.md for how. That check does not prove
// an intermediate opponent reply was forced (only that the scripted line
// is fully legal and lands where it claims) — Puzzle Rush always advances
// through the scripted line regardless, so that's what matters for the
// trainer to work correctly.

export const PUZZLES = [
  // --- Easy: mate in 1 or a simple hanging piece ------------------------
  {
    id: 'e1',
    tier: 'easy',
    theme: 'Back-rank mate',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    solution: ['a1a8'],
    outcome: 'checkmate',
    hint: 'The black king has no escape square behind its own pawns.',
  },
  {
    id: 'e2',
    tier: 'easy',
    theme: 'Back-rank mate',
    fen: '1k6/ppp5/8/8/8/8/8/4K2R w - - 0 1',
    solution: ['h1h8'],
    outcome: 'checkmate',
    hint: "Black's own pawns wall the king in — deliver check from a safe distance.",
  },
  {
    id: 'e3',
    tier: 'easy',
    theme: 'Back-rank mate',
    fen: '6k1/5ppp/8/8/8/8/6PP/2R3K1 w - - 0 1',
    solution: ['c1c8'],
    outcome: 'checkmate',
    hint: 'Same idea, different file — the king still can’t step past its pawns.',
  },
  {
    id: 'e4',
    tier: 'easy',
    theme: 'Queen mate on the rank',
    fen: '7k/6pp/8/8/8/8/6PP/3Q2K1 w - - 0 1',
    solution: ['d1d8'],
    outcome: 'checkmate',
    hint: 'One clear rank to the king with no defender covering d8.',
  },
  {
    id: 'e5',
    tier: 'easy',
    theme: 'Queen-and-king mate',
    fen: '1k6/8/1K6/8/8/8/8/7Q w - - 0 1',
    solution: ['h1h8'],
    outcome: 'checkmate',
    hint: 'Your king already covers b7 and b8 — the queen just needs the file.',
  },
  {
    id: 'e6',
    tier: 'easy',
    theme: 'Rook mate, king cut off',
    fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1',
    solution: ['h1h8'],
    outcome: 'checkmate',
    hint: 'Your king already seals a7 and b7 — the rook just needs the rank.',
  },
  {
    id: 'e7',
    tier: 'easy',
    theme: 'Hanging piece',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    solution: ['f3e5'],
    outcome: 'material',
    hint: 'Black left a pawn undefended in the centre.',
  },
  {
    id: 'e8',
    tier: 'easy',
    theme: 'Hanging piece',
    fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 4',
    solution: ['c4d5'],
    outcome: 'material',
    hint: "Black's d-pawn is only defended once — take it.",
  },

  // --- Medium: forks, pins, skewers --------------------------------------
  {
    id: 'm1',
    tier: 'medium',
    theme: 'Knight fork',
    fen: 'r3kb1r/ppp2ppp/2n5/3qp3/8/2N1PN2/PPP2PPP/R2QKB1R w KQkq - 2 8',
    solution: ['c3d5'],
    outcome: 'material',
    hint: 'One knight move hits the queen and forks c7 too.',
  },
  {
    id: 'm2',
    tier: 'medium',
    theme: 'Knight fork on king and rook',
    fen: 'r1b1kb1r/pppp1ppp/2n5/4N3/4n3/8/PPPP1PPP/RNBQKB1R w KQkq - 2 5',
    solution: ['e5f7'],
    outcome: 'material',
    hint: 'A knight jump hits the king and the a8-rook at once.',
  },
  {
    id: 'm3',
    tier: 'medium',
    theme: 'Pin and win',
    fen: 'rnb1kbnr/ppp1qppp/8/3p4/3P4/2N5/PPP1PPPP/R1BQKBNR w KQkq - 2 4',
    solution: ['c3d5'],
    outcome: 'material',
    hint: "Black's queen is pinned behind the d5 pawn — take the pawn for free.",
  },
  {
    id: 'm4',
    tier: 'medium',
    theme: 'Knight fork (Fried Liver pattern)',
    fen: 'r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6',
    solution: ['g5f7'],
    outcome: 'material',
    hint: "Black's last capture on d5 left f7 wide open to a knight jump.",
  },
  {
    id: 'm5',
    tier: 'medium',
    theme: 'Family fork',
    fen: 'r3k2r/8/8/3N4/8/8/8/4K3 w - - 0 1',
    solution: ['d5c7', 'e8f8', 'c7a8'],
    outcome: 'material',
    hint: 'The knight check on c7 hits the king and both rooks — grab one.',
  },
  {
    id: 'm6',
    tier: 'medium',
    theme: 'Hanging piece',
    fen: 'r1bqkbnr/pppp1ppp/8/1B2p3/3nP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    solution: ['f3d4'],
    outcome: 'material',
    hint: "Black's knight on d4 isn't actually defended by anything.",
  },
  {
    id: 'm7',
    tier: 'medium',
    theme: 'Skewer',
    fen: 'r7/8/8/k7/8/8/8/1Q2K3 w - - 0 1',
    solution: ['b1a1', 'a5b5', 'a1a8'],
    outcome: 'material',
    hint: "Check along the a-file first — the king has to step off it, and the rook can't follow.",
  },
  {
    id: 'm8',
    tier: 'medium',
    theme: 'Removing the defender',
    fen: 'r7/1b5k/3N4/8/8/8/8/R3K3 w - - 0 1',
    solution: ['d6b7', 'h7h6', 'a1a8'],
    outcome: 'material',
    hint: "The bishop is the rook's only defender — win it first.",
  },

  // --- Hard: multi-move combinations -------------------------------------
  {
    id: 'h1',
    tier: 'hard',
    theme: 'Mate in 2: bishop reroute',
    fen: '6k1/6pp/8/8/8/8/4B1PP/4R1K1 w - - 0 1',
    solution: ['e2h5', 'g8h8', 'e1e8'],
    outcome: 'checkmate',
    hint: 'Swing the bishop to h5 to seal g6, then the rook has the back rank.',
  },
  {
    id: 'h2',
    tier: 'hard',
    theme: "Légal's Mate",
    fen: 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5',
    solution: ['f3e5', 'g4d1', 'c4f7', 'e8e7', 'c3d5'],
    outcome: 'checkmate',
    hint: "Black's pin on your queen is a trap — sacrifice it and mate with your minor pieces.",
  },
  {
    id: 'h3',
    tier: 'hard',
    theme: 'Royal fork',
    fen: '7k/8/8/8/8/8/4Q1K1/r7 w - - 0 1',
    solution: ['e2e5', 'h8h7', 'e5a1'],
    outcome: 'material',
    hint: 'One square lies on a diagonal to both the king and the rook.',
  },
  {
    id: 'h4',
    tier: 'hard',
    theme: 'Clearance',
    fen: '6k1/6pp/8/8/3B4/3N4/6PP/6K1 w - - 0 1',
    solution: ['d3b4', 'g8h8', 'd4g7'],
    outcome: 'material',
    hint: "Your own knight is blocking the bishop's diagonal — move it out of the way.",
  },
  {
    id: 'h5',
    tier: 'hard',
    theme: 'Overloaded defender',
    fen: '6k1/6pp/2n5/r3b3/8/6B1/6PP/R5K1 w - - 0 1',
    solution: ['g3e5', 'c6e5', 'a1a5'],
    outcome: 'material',
    hint: 'The knight guards both the bishop and the rook — it can’t do both once it recaptures.',
  },
  {
    id: 'h6',
    tier: 'hard',
    theme: 'Discovered check',
    fen: '4k3/1q6/8/8/4B3/8/6PP/4R1K1 w - - 0 1',
    solution: ['e4b7'],
    outcome: 'material',
    hint: 'Moving the bishop both grabs the queen and opens a check from your rook.',
  },
];
