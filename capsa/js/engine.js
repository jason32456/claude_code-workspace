// Capsa / Big Two rules engine.
//
// Pure data in, pure data out — no DOM, no timers, no randomness except through
// an explicit seed. The browser and the serverless API both import this file,
// so a move the client thinks is legal is legal by the same code that judges it
// on the server.
//
// A card is an integer 0..51 where value = rankIndex * 4 + suitIndex. Because
// rank is the major component, comparing two cards is just comparing integers,
// and no two cards ever tie.

export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
export const SUITS = ['♦', '♣', '♥', '♠'];
export const SUIT_KEYS = ['diamonds', 'clubs', 'hearts', 'spades'];

export const RANK_TWO = 12;
export const THREE_OF_DIAMONDS = 0;

export const rankOf = (card) => (card / 4) | 0;
export const suitOf = (card) => card % 4;
export const cardLabel = (card) => RANKS[rankOf(card)] + SUITS[suitOf(card)];

export const COMBO = {
  SINGLE: 'single',
  PAIR: 'pair',
  TRIPLE: 'triple',
  STRAIGHT: 'straight',
  FLUSH: 'flush',
  FULL_HOUSE: 'fullHouse',
  QUADS: 'quads',
  STRAIGHT_FLUSH: 'straightFlush',
};

export const COMBO_LABEL = {
  single: 'Single',
  pair: 'Pair',
  triple: 'Triple',
  straight: 'Straight',
  flush: 'Flush',
  fullHouse: 'Full House',
  quads: 'Four of a Kind',
  straightFlush: 'Straight Flush',
};

// Only meaningful between two five-card hands.
const FIVE_RANK = { straight: 1, flush: 2, fullHouse: 3, quads: 4, straightFlush: 5 };

/* ── Combination detection ───────────────────────────────────────────────── */

// Returns { type, size, key } or null when the cards are not a legal play.
// `key` is only ever compared against another combo of the same size (and, for
// five-card hands, the same category).
export function detectCombo(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const uniq = new Set(cards);
  if (uniq.size !== cards.length) return null;
  if (cards.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) return null;

  const sorted = [...cards].sort((a, b) => a - b);
  const size = sorted.length;
  const top = sorted[size - 1];

  if (size === 1) return { type: COMBO.SINGLE, size, key: top };

  if (size === 2) {
    return rankOf(sorted[0]) === rankOf(sorted[1])
      ? { type: COMBO.PAIR, size, key: top }
      : null;
  }

  if (size === 3) {
    const r = rankOf(sorted[0]);
    return sorted.every((c) => rankOf(c) === r)
      ? { type: COMBO.TRIPLE, size, key: top }
      : null;
  }

  if (size !== 5) return null;

  const ranks = sorted.map(rankOf);
  const flush = sorted.every((c) => suitOf(c) === suitOf(sorted[0]));

  // Straights run 3..A. The 2 is never part of a straight, and aces are high
  // only — see PRD.md for why this variant was chosen.
  let straight = ranks[4] < RANK_TWO;
  for (let i = 0; straight && i < 4; i++) {
    if (ranks[i + 1] !== ranks[i] + 1) straight = false;
  }

  if (straight && flush) return { type: COMBO.STRAIGHT_FLUSH, size, key: top };
  if (straight) return { type: COMBO.STRAIGHT, size, key: top };
  if (flush) return { type: COMBO.FLUSH, size, key: suitOf(top) * 13 + ranks[4] };

  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Quads and full houses are ranked by the big group alone; the odd card is
  // decoration and never breaks a tie.
  if (groups[0][1] === 4) return { type: COMBO.QUADS, size, key: groups[0][0] };
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { type: COMBO.FULL_HOUSE, size, key: groups[0][0] };
  }
  return null;
}

// Does `a` legally beat `b`? A null `b` means the player is leading a trick.
export function beats(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.size !== b.size) return false;
  if (a.size === 5 && FIVE_RANK[a.type] !== FIVE_RANK[b.type]) {
    return FIVE_RANK[a.type] > FIVE_RANK[b.type];
  }
  return a.key > b.key;
}

// Why a selection cannot be played, phrased for a player rather than a log.
export function explainInvalid(cards, current) {
  if (!cards.length) return 'Select cards to play';
  const combo = detectCombo(cards);
  if (!combo) {
    if (cards.length === 4) return 'Four cards is never a play — add a kicker for a bomb';
    if (cards.length > 5) return 'Plays are at most 5 cards';
    return 'Not a valid combination';
  }
  if (!current) return null;
  if (combo.size !== current.size) {
    return `Must play ${current.size} card${current.size > 1 ? 's' : ''}`;
  }
  if (!beats(combo, current)) return `${COMBO_LABEL[combo.type]} is too low`;
  return null;
}

/* ── Enumerating legal plays ─────────────────────────────────────────────── */

function eachCombination(items, k, visit) {
  const idx = new Array(k);
  const walk = (start, depth) => {
    if (depth === k) {
      visit(idx.map((i) => items[i]));
      return;
    }
    for (let i = start; i <= items.length - (k - depth); i++) {
      idx[depth] = i;
      walk(i + 1, depth + 1);
    }
  };
  if (k <= items.length) walk(0, 0);
}

// Every legal play from `hand` given the play to beat. `mustInclude` is used
// for the opening lead, where 3♦ has to be part of the play.
// A 13-card hand yields at most 1287 five-card subsets, so brute force is fine.
export function legalPlays(hand, current, mustInclude = null) {
  const out = [];
  const sizes = current ? [current.size] : [1, 2, 3, 5];
  for (const k of sizes) {
    eachCombination(hand, k, (cards) => {
      if (mustInclude !== null && !cards.includes(mustInclude)) return;
      const combo = detectCombo(cards);
      if (combo && beats(combo, current)) out.push({ cards, combo });
    });
  }
  out.sort((a, b) => comboStrength(a.combo) - comboStrength(b.combo));
  return out;
}

// A single number for "how strong is this play", used for sorting candidate
// moves. Only compares sensibly within one size class.
export function comboStrength(combo) {
  const category = combo.size === 5 ? FIVE_RANK[combo.type] : 0;
  return category * 1000 + combo.key;
}

/* ── Dealing ─────────────────────────────────────────────────────────────── */

// Deterministic PRNG so a room's deal can be reproduced from its seed alone.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dealHands(seed) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const rng = mulberry32(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return [0, 1, 2, 3].map((s) => deck.slice(s * 13, s * 13 + 13).sort((a, b) => a - b));
}

/* ── Game state ──────────────────────────────────────────────────────────── */

// kind is one of 'human', 'bot' or 'empty'. 'empty' only exists in a lobby —
// once the host starts, every remaining empty seat becomes a bot.
export function createSeat(index, patch = {}) {
  return {
    index,
    id: null,
    name: `Seat ${index + 1}`,
    kind: 'bot',
    difficulty: 'sharp',
    hand: [],
    handCount: 0,
    passed: false,
    away: false,
    lastSeen: 0,
    score: 0,
    emote: null,
    ...patch,
  };
}

export function createRoom(code, seed) {
  return {
    code,
    version: 1,
    // Online rooms sit in 'lobby' until the host starts them. Solo games call
    // startHand() immediately and never see this phase.
    phase: 'lobby',
    hostSeat: 0,
    seed,
    handNo: 0,
    seats: [0, 1, 2, 3].map((i) => createSeat(i)),
    turn: 0,
    current: null,
    currentCards: [],
    currentSeat: null,
    mustInclude: null,
    trick: 0,
    // Every play made in the current trick, oldest first, so the table can be
    // drawn the way a real one looks — cards piling up rather than a single
    // card replacing the last.
    trickPile: [],
    played: [],
    log: [],
    history: [],
    winner: null,
    botAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function startHand(room, seed) {
  const hands = dealHands(seed);
  room.seed = seed;
  room.handNo += 1;
  room.phase = 'playing';
  room.seats.forEach((seat, i) => {
    seat.hand = hands[i];
    seat.handCount = hands[i].length;
    seat.passed = false;
    seat.emote = null;
  });
  room.turn = room.seats.findIndex((s) => s.hand.includes(THREE_OF_DIAMONDS));
  room.current = null;
  room.currentCards = [];
  room.currentSeat = null;
  room.mustInclude = THREE_OF_DIAMONDS;
  room.trick = 1;
  room.trickPile = [];
  room.played = [];
  room.winner = null;
  room.log = [{ t: 'deal', hand: room.handNo }];
  return room;
}

function nextActiveSeat(room, from) {
  for (let step = 1; step <= 4; step++) {
    const i = (from + step) % 4;
    if (!room.seats[i].passed) return i;
  }
  return from;
}

function closeTrickIfSettled(room) {
  const active = room.seats.filter((s) => !s.passed);
  if (room.current && active.length === 1) {
    room.trick += 1;
    room.current = null;
    room.currentCards = [];
    room.trickPile = [];
    room.turn = room.currentSeat;
    room.seats.forEach((s) => {
      s.passed = false;
    });
    room.log.push({ t: 'trick', seat: room.currentSeat });
    return true;
  }
  return false;
}

export function handPenalty(count) {
  if (count >= 13) return count * 4;
  if (count >= 10) return count * 3;
  if (count >= 8) return count * 2;
  return count;
}

function finishHand(room, winnerSeat) {
  room.phase = 'done';
  room.winner = winnerSeat;

  const deltas = [0, 0, 0, 0];
  let pot = 0;
  room.seats.forEach((seat) => {
    if (seat.index === winnerSeat) return;
    const penalty = handPenalty(seat.hand.length);
    seat.score += penalty;
    deltas[seat.index] = penalty;
    pot += penalty;
  });
  room.seats[winnerSeat].score -= pot;
  deltas[winnerSeat] = -pot;

  room.history = room.history || [];
  room.history.push({
    hand: room.handNo,
    winner: winnerSeat,
    deltas,
    left: room.seats.map((s) => s.hand.length),
  });
  room.log.push({ t: 'win', seat: winnerSeat, pot });
}

// Wipes the running scores and starts a fresh match on the same seats.
export function resetScores(room) {
  room.seats.forEach((seat) => {
    seat.score = 0;
  });
  room.history = [];
  room.handNo = 0;
  return room;
}

// Applies a play. Returns { ok: true } or { ok: false, error } — never throws
// on bad input, because the server calls this with whatever a client sent.
export function applyPlay(room, seatIndex, cards) {
  if (room.phase !== 'playing') return { ok: false, error: 'Hand is not in progress' };
  if (room.turn !== seatIndex) return { ok: false, error: 'Not your turn' };

  const seat = room.seats[seatIndex];
  const hand = new Set(seat.hand);
  if (!cards.every((c) => hand.has(c))) return { ok: false, error: 'You do not hold those cards' };

  const combo = detectCombo(cards);
  if (!combo) return { ok: false, error: 'Not a valid combination' };
  if (room.mustInclude !== null && !cards.includes(room.mustInclude)) {
    return { ok: false, error: `Opening play must include ${cardLabel(room.mustInclude)}` };
  }
  if (!beats(combo, room.current)) {
    return { ok: false, error: explainInvalid(cards, room.current) || 'Does not beat the current play' };
  }

  seat.hand = seat.hand.filter((c) => !cards.includes(c));
  seat.handCount = seat.hand.length;
  room.current = combo;
  room.currentCards = [...cards].sort((a, b) => a - b);
  room.currentSeat = seatIndex;
  room.mustInclude = null;
  room.played.push(...cards);
  room.trickPile.push({ seat: seatIndex, cards: room.currentCards, type: combo.type });
  room.log.push({ t: 'play', seat: seatIndex, cards: room.currentCards, combo: combo.type });

  if (seat.hand.length === 0) {
    finishHand(room, seatIndex);
    return { ok: true };
  }

  room.turn = nextActiveSeat(room, seatIndex);
  closeTrickIfSettled(room);
  return { ok: true };
}

export function applyPass(room, seatIndex) {
  if (room.phase !== 'playing') return { ok: false, error: 'Hand is not in progress' };
  if (room.turn !== seatIndex) return { ok: false, error: 'Not your turn' };
  if (!room.current) return { ok: false, error: 'You lead the trick — you must play' };

  room.seats[seatIndex].passed = true;
  room.log.push({ t: 'pass', seat: seatIndex });
  room.turn = nextActiveSeat(room, seatIndex);
  closeTrickIfSettled(room);
  return { ok: true };
}

/* ── Redaction ───────────────────────────────────────────────────────────── */

// The view one seat is allowed to see. Opponent hands are replaced by counts
// before the state ever leaves the server, so there is nothing to peek at.
export function redact(room, seatIndex) {
  return {
    code: room.code,
    version: room.version,
    phase: room.phase,
    handNo: room.handNo,
    you: seatIndex,
    turn: room.turn,
    trick: room.trick,
    current: room.current,
    currentCards: room.currentCards,
    currentSeat: room.currentSeat,
    trickPile: room.trickPile || [],
    mustInclude: room.mustInclude,
    winner: room.winner,
    hostSeat: room.hostSeat ?? 0,
    seats: room.seats.map((s) => ({
      index: s.index,
      name: s.name,
      kind: s.kind,
      difficulty: s.difficulty,
      handCount: s.hand.length,
      passed: s.passed,
      away: s.away,
      score: s.score,
      emote: s.emote,
      joined: Boolean(s.id),
    })),
    hand: seatIndex === null ? [] : room.seats[seatIndex].hand,
    history: (room.history || []).slice(-12),
    log: room.log.slice(-24),
  };
}
