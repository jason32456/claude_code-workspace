// FSRS-5 spaced repetition algorithm
// Reference: https://github.com/open-spaced-repetition/fsrs4anki

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0589,
  1.5330, 0.1544, 1.0071, 1.9395, 0.1100, 0.2900, 2.2700, 0.2500,
  2.9898, 0.5100, 0.1343
];

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 0.23457
const DESIRED_RETENTION = 0.9;

export const Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });
export const State = Object.freeze({ New: 0, Learning: 1, Review: 2, Relearning: 3 });

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

export function forgettingCurve(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

function initStability(rating) {
  return Math.max(W[rating - 1], 0.1);
}

function initDifficulty(rating) {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10);
}

function nextDifficulty(d, rating) {
  const deltaD = -W[6] * (rating - 3);
  const d0_4 = initDifficulty(Rating.Easy);
  // Mean reversion toward D_0(Easy)
  return clamp(W[7] * d0_4 + (1 - W[7]) * (d + deltaD), 1, 10);
}

function stabilityAfterRecall(d, s, r, rating) {
  const hardPenalty = rating === Rating.Hard ? W[15] : 1;
  const easyBonus = rating === Rating.Easy ? W[16] : 1;
  return Math.max(
    s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
      (Math.exp(W[10] * (1 - r)) - 1) * hardPenalty * easyBonus + 1),
    0.1
  );
}

function stabilityAfterForgetting(d, s, r) {
  return Math.max(
    W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r)),
    0.1
  );
}

function scheduledDays(stability) {
  return Math.max(1, Math.round(stability / FACTOR * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1)));
}

// Returns a new card state after reviewing with the given rating
export function scheduleCard(card, rating, now = new Date()) {
  const next = { ...card };
  const elapsed = card.lastReview
    ? (now - new Date(card.lastReview)) / 86400000
    : 0;

  if (card.state === State.New) {
    next.difficulty = initDifficulty(rating);
    next.stability = initStability(rating);
    next.reps = 1;
    next.lapses = card.lapses ?? 0;
    next.lastReview = now.toISOString();

    if (rating === Rating.Again) {
      next.state = State.Learning;
      next.due = new Date(now.getTime() + 1 * 60000).toISOString();
    } else if (rating === Rating.Hard) {
      next.state = State.Learning;
      next.due = new Date(now.getTime() + 5 * 60000).toISOString();
    } else if (rating === Rating.Good) {
      next.state = State.Learning;
      next.due = new Date(now.getTime() + 10 * 60000).toISOString();
    } else {
      next.state = State.Review;
      next.due = new Date(now.getTime() + scheduledDays(next.stability) * 86400000).toISOString();
    }

  } else if (card.state === State.Learning || card.state === State.Relearning) {
    const r = forgettingCurve(Math.max(elapsed, 0), card.stability);
    next.difficulty = nextDifficulty(card.difficulty, rating);
    next.reps = (card.reps ?? 0) + 1;
    next.lapses = card.lapses ?? 0;
    next.lastReview = now.toISOString();

    if (rating === Rating.Again) {
      next.stability = stabilityAfterForgetting(next.difficulty, card.stability, r);
      next.state = card.state;
      next.lapses++;
      next.due = new Date(now.getTime() + 5 * 60000).toISOString();
    } else if (rating === Rating.Hard) {
      next.stability = stabilityAfterRecall(next.difficulty, card.stability, r, rating);
      next.state = card.state;
      next.due = new Date(now.getTime() + 10 * 60000).toISOString();
    } else {
      next.stability = stabilityAfterRecall(next.difficulty, card.stability, r, rating);
      next.state = State.Review;
      next.due = new Date(now.getTime() + scheduledDays(next.stability) * 86400000).toISOString();
    }

  } else { // Review state
    const r = forgettingCurve(Math.max(elapsed, 0), card.stability);
    next.difficulty = nextDifficulty(card.difficulty, rating);
    next.reps = (card.reps ?? 0) + 1;
    next.lapses = card.lapses ?? 0;
    next.lastReview = now.toISOString();

    if (rating === Rating.Again) {
      next.stability = stabilityAfterForgetting(next.difficulty, card.stability, r);
      next.state = State.Relearning;
      next.lapses++;
      next.due = new Date(now.getTime() + 10 * 60000).toISOString();
    } else {
      next.stability = stabilityAfterRecall(next.difficulty, card.stability, r, rating);
      next.state = State.Review;
      next.due = new Date(now.getTime() + scheduledDays(next.stability) * 86400000).toISOString();
    }
  }

  return next;
}

export function retrievability(card, now = new Date()) {
  if (card.state === State.New || !card.lastReview || !card.stability) return 0;
  const elapsed = (now - new Date(card.lastReview)) / 86400000;
  return forgettingCurve(elapsed, card.stability);
}
