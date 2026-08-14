// Bot policies for Capsa.
//
// Pure functions over a redacted view — bots see exactly what a human in that
// seat would see (their own hand, opponents' card counts, the cards already
// played). They do not read hidden state, so a bot never plays a move a human
// could not have reasoned their way to.

import {
  RANK_TWO,
  legalPlays,
  rankOf,
  comboStrength,
  detectCombo,
} from './engine.js';

export const DIFFICULTIES = ['casual', 'sharp', 'ruthless'];

export const DIFFICULTY_LABEL = {
  casual: 'Casual',
  sharp: 'Sharp',
  ruthless: 'Ruthless',
};

// Behaviour is a set of switches rather than three separate code paths, so the
// ladder can be tuned — and verified by simulation — one lever at a time.
//
//   structural  weigh what a play destroys, not just its raw strength
//   hoardPremium hold 2s and bombs back while the trick is uncontested
//   plan        judge a move by the shape of the hand it leaves behind, not
//               just by what it costs to make
//   blockAtOne  spend the strongest hand available on a player at 1 card
// How many candidate moves the planning bot re-ranks by lookahead.
const PLAN_WIDTH = 14;

export const POLICY = {
  casual: { structural: false, hoardPremium: false, plan: false, blockAtOne: false },
  sharp: { structural: true, hoardPremium: true, plan: false, blockAtOne: false },
  ruthless: { structural: true, hoardPremium: true, plan: true, blockAtOne: true },
};

const BOT_NAMES = [
  'Adi', 'Bima', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hendra',
  'Indah', 'Joko', 'Kartika', 'Lina', 'Mira', 'Nadia', 'Oki', 'Putri',
];

export function botName(seed) {
  return BOT_NAMES[Math.abs(seed) % BOT_NAMES.length];
}

// How many cards of each rank the bot is holding — the basis for knowing
// whether a play breaks up something worth keeping.
function rankGroups(hand) {
  const groups = new Map();
  for (const card of hand) {
    const r = rankOf(card);
    groups.set(r, (groups.get(r) || 0) + 1);
  }
  return groups;
}

// Structural cost of making this play: what it destroys, what it spends, and
// what it gets rid of. Lower is better.
function moveCost(play, hand, groups) {
  const { cards, combo } = play;
  let cost = comboStrength(combo) * 0.35;

  const used = new Map();
  for (const card of cards) {
    const r = rankOf(card);
    used.set(r, (used.get(r) || 0) + 1);
  }

  for (const [rank, n] of used) {
    const held = groups.get(rank) || 0;
    // Peeling a single off a pair, or two off a triple, throws away a set that
    // would otherwise have won a trick later.
    if (held >= 4 && n < 4 && combo.type !== 'quads') cost += 26;
    else if (held === 3 && n === 1) cost += 12;
    else if (held === 2 && n === 1) cost += 9;
    else if (held === 3 && n === 2) cost += 6;
    if (rank === RANK_TWO) cost += 14 * n;
  }

  // Shedding is the whole point of the game.
  cost -= cards.length * 6;
  return cost;
}

// Roughly how many more turns this hand needs to be shed completely. Cards of
// the same rank go out together, and five singles in a row can leave as a
// straight, so both count as one turn. Used to prefer moves that leave a hand
// which empties quickly rather than one that merely looks cheap.
function turnsToShed(hand) {
  const byRank = new Map();
  for (const card of hand) {
    const r = rankOf(card);
    byRank.set(r, (byRank.get(r) || 0) + 1);
  }
  let turns = 0;
  const loneRanks = [];
  for (const [rank, n] of byRank) {
    if (n >= 2) turns += 1;
    else loneRanks.push(rank);
  }
  loneRanks.sort((a, b) => a - b);

  // Greedily absorb runs of five consecutive singles into one straight.
  let i = 0;
  while (i < loneRanks.length) {
    let run = 1;
    while (
      i + run < loneRanks.length &&
      loneRanks[i + run] === loneRanks[i + run - 1] + 1 &&
      loneRanks[i + run] < RANK_TWO
    ) {
      run++;
    }
    turns += run >= 5 ? 1 + (run - 5) : run;
    i += run;
  }
  return turns;
}

/**
 * Decide a bot's move.
 *
 * @param {object} view - { hand, current, mustInclude, seats, played }
 * @param {'casual'|'sharp'|'ruthless'} difficulty
 * @returns {{cards:number[]}|{pass:true}}
 */
export function chooseMove(view, difficulty = 'sharp') {
  const { hand, current, mustInclude = null, seats = [], played = [] } = view;
  const options = legalPlays(hand, current, mustInclude);
  if (options.length === 0) return { pass: true };

  const policy = POLICY[difficulty] || POLICY.sharp;
  const leading = !current;
  const groups = rankGroups(hand);

  // Without structural scoring there is nothing to weigh: take the cheapest
  // legal option by raw combination strength and move on.
  if (!policy.structural) {
    return { cards: options[0].cards };
  }

  const opponents = seats.filter((s) => s.index !== view.you);
  const lowestOpponent = opponents.length
    ? Math.min(...opponents.map((s) => s.handCount))
    : 13;
  const someoneClosing = lowestOpponent <= 2;

  const scored = options
    .map((play) => ({ play, cost: moveCost(play, hand, groups) }))
    .sort((a, b) => a.cost - b.cost);

  // Re-rank the most promising candidates by what they leave behind. Capped so
  // a 13-card hand does not pay for a thousand evaluations per turn.
  function bestByPlan(candidates, currentHand) {
    const shortlist = candidates.slice(0, PLAN_WIDTH);
    let winner = shortlist[0];
    let bestScore = Infinity;
    for (const candidate of shortlist) {
      const used = new Set(candidate.play.cards);
      const rest = currentHand.filter((c) => !used.has(c));
      if (rest.length === 0) return candidate;
      const score = turnsToShed(rest) * 100 + candidate.cost;
      if (score < bestScore) {
        bestScore = score;
        winner = candidate;
      }
    }
    return winner;
  }

  if (leading) {
    // Leading is free — you cannot be beaten into passing — so lead the play
    // that costs the least structurally, biased toward dumping many cards.
    const best = policy.plan ? bestByPlan(scored, hand) : scored[0];
    // Never open a hand by leading a lone 2 when anything else is available.
    if (rankOf(best.play.cards[0]) === RANK_TWO && scored.length > 1 && hand.length > 3) {
      return { cards: scored[1].play.cards };
    }
    return { cards: best.play.cards };
  }

  const cheapest = scored[0];

  // Following. A player on their last card wins the moment the trick comes
  // back round, so the trick has to be taken now at whatever price. At two
  // cards it is still worth contesting, but not worth emptying the arsenal.
  if (someoneClosing) {
    if (policy.blockAtOne && lowestOpponent <= 1) {
      return { cards: options[options.length - 1].cards };
    }
    return { cards: cheapest.play.cards };
  }

  const pick = policy.plan ? bestByPlan(scored, hand) : cheapest;

  const spendsTwo = pick.play.cards.some((c) => rankOf(c) === RANK_TWO);
  const isBomb =
    pick.play.combo.type === 'quads' || pick.play.combo.type === 'straightFlush';

  // Winning a trick nobody is contesting is not worth a 2 or a bomb this early.
  if (policy.hoardPremium && (spendsTwo || isBomb) && hand.length > 4 && lowestOpponent > 4) {
    return { pass: true };
  }

  return { cards: pick.play.cards };
}

// Randomized think-time so bots do not answer in lockstep.
export function thinkDelay(difficulty) {
  const base = difficulty === 'casual' ? 500 : 650;
  return base + Math.floor(Math.random() * 750);
}

// Used by the UI's hint button: the lowest legal play, or null if you must pass.
export function hintMove(hand, current, mustInclude = null) {
  const options = legalPlays(hand, current, mustInclude);
  if (!options.length) return null;
  const combo = detectCombo(options[0].cards);
  return { cards: options[0].cards, combo };
}
