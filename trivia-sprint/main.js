import { fetchQuestions } from './api.js';
import { getFallbackQuestions } from './fallback-questions.js';
import {
  createGameState, recordAnswer,
  getPersonalBest, savePersonalBest,
  QUESTION_TIME, TOTAL_QUESTIONS, maxPossibleScore,
} from './game.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screens = {
  start:   document.getElementById('screen-start'),
  loading: document.getElementById('screen-loading'),
  game:    document.getElementById('screen-game'),
  error:   document.getElementById('screen-error'),
  results: document.getElementById('screen-results'),
};

const categorySelect = document.getElementById('category-select');
const diffPills      = document.querySelectorAll('.diff-pill');
const playBtn        = document.getElementById('play-btn');
const retryBtn       = document.getElementById('retry-btn');
const errorMsg       = document.getElementById('error-msg');

const qNumber    = document.getElementById('q-number');
const qText      = document.getElementById('q-text');
const answerBtns = document.querySelectorAll('.answer-btn');
const timerRing  = document.getElementById('timer-ring');
const timerText  = document.getElementById('timer-text');
const scoreLive  = document.getElementById('score-live');
const streakBadge= document.getElementById('streak-badge');
const streakCount= document.getElementById('streak-count');

const finalScore    = document.getElementById('final-score');
const finalCorrect  = document.getElementById('final-correct');
const finalStreakVal = document.getElementById('final-streak-val');
const finalPBVal    = document.getElementById('final-pb-val');
const newBestBanner = document.getElementById('new-best-banner');
const reviewList    = document.getElementById('review-list');
const playAgainBtn  = document.getElementById('play-again-btn');
const changeSettingsBtn = document.getElementById('change-settings-btn');

// ── State ─────────────────────────────────────────────────────────────────────
let settings = { category: 'any', difficulty: 'medium' };
let gameState = null;
let timerInterval = null;
let timeLeft = 0;
const RING_CIRCUMFERENCE = 2 * Math.PI * 45; // r=45

// ── Screen helpers ────────────────────────────────────────────────────────────
function show(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// ── Settings UI ───────────────────────────────────────────────────────────────
diffPills.forEach(pill => {
  pill.addEventListener('click', () => {
    diffPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    settings.difficulty = pill.dataset.diff;
  });
});

categorySelect.addEventListener('change', () => {
  settings.category = categorySelect.value;
});

// ── Play flow ─────────────────────────────────────────────────────────────────
playBtn.addEventListener('click', startGame);
retryBtn.addEventListener('click', startGame);
playAgainBtn.addEventListener('click', startGame);
changeSettingsBtn.addEventListener('click', () => show('start'));

async function startGame() {
  show('loading');
  let questions;
  try {
    questions = await fetchQuestions(settings);
  } catch {
    questions = getFallbackQuestions();
  }
  gameState = createGameState(questions);
  show('game');
  showQuestion();
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  timeLeft = QUESTION_TIME;
  updateTimerUI();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    updateTimerUI();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      handleAnswer(null);
    }
  }, 1000);
}

function updateTimerUI() {
  const pct = timeLeft / QUESTION_TIME;
  const offset = RING_CIRCUMFERENCE * (1 - pct);
  timerRing.style.strokeDashoffset = offset;
  timerText.textContent = timeLeft;
  timerRing.style.stroke = timeLeft <= 3 ? 'var(--wrong)' : 'var(--accent)';
}

// ── Question rendering ────────────────────────────────────────────────────────
function showQuestion() {
  const q = gameState.questions[gameState.index];
  qNumber.textContent = `Question ${gameState.index + 1} / ${TOTAL_QUESTIONS}`;
  qText.textContent = q.question;

  answerBtns.forEach((btn, i) => {
    btn.textContent = q.answers[i];
    btn.className = 'answer-btn';
    btn.disabled = false;
    btn.onclick = () => handleAnswer(q.answers[i]);
  });

  updateLiveScore();
  startTimer();
}

function updateLiveScore() {
  scoreLive.textContent = gameState.score;
  if (gameState.streak >= 2) {
    streakBadge.classList.remove('hidden');
    streakCount.textContent = gameState.streak;
  } else {
    streakBadge.classList.add('hidden');
  }
}

// ── Answer handling ───────────────────────────────────────────────────────────
function handleAnswer(chosen) {
  clearInterval(timerInterval);
  answerBtns.forEach(btn => { btn.disabled = true; });

  const q = gameState.questions[gameState.index];
  const wasCorrect = recordAnswer(gameState, chosen, timeLeft);

  answerBtns.forEach(btn => {
    if (btn.textContent === q.correct) {
      btn.classList.add('correct');
    } else if (btn.textContent === chosen && !wasCorrect) {
      btn.classList.add('wrong');
    }
  });

  if (wasCorrect && gameState.streak >= 2) {
    streakBadge.classList.add('pulse');
    setTimeout(() => streakBadge.classList.remove('pulse'), 600);
  }

  updateLiveScore();

  setTimeout(() => {
    if (gameState.index >= TOTAL_QUESTIONS) {
      showResults();
    } else {
      showQuestion();
    }
  }, 900);
}

// ── Results ───────────────────────────────────────────────────────────────────
function showResults() {
  const { score, correct, maxStreak, answers } = gameState;
  const isNewBest = savePersonalBest(score);
  const pb = getPersonalBest();

  finalScore.textContent = score;
  finalCorrect.textContent = `${correct}/${TOTAL_QUESTIONS} (${Math.round(correct / TOTAL_QUESTIONS * 100)}%)`;
  finalStreakVal.textContent = maxStreak;
  finalPBVal.textContent = pb;
  newBestBanner.classList.toggle('hidden', !isNewBest);

  reviewList.innerHTML = '';
  answers.forEach((a, i) => {
    const li = document.createElement('li');
    li.className = a.wasCorrect ? 'review-item correct' : 'review-item wrong';
    li.innerHTML = `
      <span class="review-num">${i + 1}</span>
      <span class="review-q">${a.question}</span>
      <span class="review-ans">${a.wasCorrect ? '✓ ' + a.correct : '✗ You: ' + (a.chosen || 'timeout') + ' · Correct: ' + a.correct}</span>
    `;
    reviewList.appendChild(li);
  });

  show('results');
}

// ── Init ──────────────────────────────────────────────────────────────────────
timerRing.style.strokeDasharray = RING_CIRCUMFERENCE;
timerRing.style.strokeDashoffset = 0;
show('start');
