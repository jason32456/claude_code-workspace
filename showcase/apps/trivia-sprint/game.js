export const QUESTION_TIME = 10;
export const POINTS_CORRECT = 100;
export const POINTS_TIME_BONUS = 5;
export const TOTAL_QUESTIONS = 10;
const PB_KEY = 'trivia-sprint-pb';

export function calcScore(timeLeft) {
  return POINTS_CORRECT + timeLeft * POINTS_TIME_BONUS;
}

export function maxPossibleScore() {
  return TOTAL_QUESTIONS * (POINTS_CORRECT + QUESTION_TIME * POINTS_TIME_BONUS);
}

export function getPersonalBest() {
  return parseInt(localStorage.getItem(PB_KEY) || '0', 10);
}

export function savePersonalBest(score) {
  const current = getPersonalBest();
  if (score > current) {
    localStorage.setItem(PB_KEY, String(score));
    return true;
  }
  return false;
}

export function createGameState(questions) {
  return {
    questions,
    index: 0,
    score: 0,
    streak: 0,
    maxStreak: 0,
    correct: 0,
    answers: [],  // { question, chosen, correct, wasCorrect }
  };
}

export function recordAnswer(state, chosen, timeLeft) {
  const q = state.questions[state.index];
  const wasCorrect = chosen === q.correct;

  state.answers.push({
    question: q.question,
    chosen,
    correct: q.correct,
    wasCorrect,
  });

  if (wasCorrect) {
    state.score += calcScore(timeLeft);
    state.streak += 1;
    state.correct += 1;
    if (state.streak > state.maxStreak) state.maxStreak = state.streak;
  } else {
    state.streak = 0;
  }

  state.index += 1;
  return wasCorrect;
}
