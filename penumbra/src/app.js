import { openDB, getSetting, setSetting, getDecks, getDeck, putDeck, deleteDeck,
         getCards, getCardsByDeck, getCard, putCard, deleteCard, deleteCardsByDeck,
         putSession, getSessionsByDate, getRecentSessions } from './storage.js';
import { scheduleCard, Rating, State } from './fsrs.js';
import { buildWindDownQueue, buildWakeUpQueue, dueCount,
         isWindDownTime, isWakeUpTime } from './scheduler.js';
import { statsForHome, sessionRetention } from './stats.js';
import { seedStarterDecks, newCard, newDeck } from './decks.js';

// ---- State ----

let settings = {};
let currentSession = null; // { type, queue, index, results, startedAt }
let currentDeckId = null;
let editingCardId = null;

// ---- Init ----

async function init() {
  await openDB();
  settings = await loadSettings();

  if (!settings.onboarded) {
    showView('onboarding');
    return;
  }

  await seedStarterDecks();
  await renderHome();
  showView('home');
}

async function loadSettings() {
  const defaults = {
    bedtime: '22:30',
    waketime: '07:00',
    sessionCapCards: 15,
    sessionCapMinutes: 12,
    audioMode: false,
    onboarded: false,
    userName: ''
  };
  const saved = await getSetting('config');
  return saved ? { ...defaults, ...saved } : defaults;
}

async function saveSettings() {
  await setSetting('config', settings);
}

// ---- View Router ----

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById('view-' + name);
  if (v) v.classList.add('active');

  const nav = document.querySelector('.nav');
  if (['home', 'decks', 'settings'].includes(name)) {
    nav.style.display = 'flex';
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
  } else {
    nav.style.display = 'none';
  }
}

// ---- Onboarding ----

document.getElementById('onboarding-form').addEventListener('submit', async e => {
  e.preventDefault();
  settings.userName = document.getElementById('ob-name').value.trim() || 'there';
  settings.bedtime = document.getElementById('ob-bedtime').value || '22:30';
  settings.waketime = document.getElementById('ob-waketime').value || '07:00';
  settings.onboarded = true;
  await saveSettings();
  await seedStarterDecks();
  await renderHome();
  showView('home');
});

// ---- Home ----

async function renderHome() {
  const now = new Date();
  const h = now.getHours();
  let greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('home-greeting').textContent =
    `${greeting}, ${settings.userName || 'there'}`;

  // Time context
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('home-time').textContent = timeStr;

  // Session availability
  const windDownAvail = isWindDownTime(settings.bedtime, now);
  const wakeUpAvail = isWakeUpTime(settings.waketime, now);
  const due = await dueCount();

  renderSessionCard('wind-down', windDownAvail || due > 0,
    due > 0 ? `${due} card${due !== 1 ? 's' : ''} due for review` : 'Nothing urgent — review anyway?');
  renderSessionCard('wake-up', wakeUpAvail,
    'Check what consolidated overnight');

  // Stats
  const { retention, streak, learned } = await statsForHome();
  document.getElementById('stat-retention').textContent =
    retention !== null ? Math.round(retention * 100) + '%' : '—';
  document.getElementById('stat-streak').textContent = streak;
  document.getElementById('stat-learned').textContent = learned;
}

function renderSessionCard(type, available, subtext) {
  const el = document.getElementById(`session-${type}`);
  el.classList.toggle('available', available);
  el.querySelector('.session-sub').textContent = subtext;
  el.querySelector('.btn').textContent = type === 'wind-down' ? 'Begin wind-down' : 'Morning recall';
  el.querySelector('.btn').disabled = false;
}

document.getElementById('session-wind-down').querySelector('.btn')
  .addEventListener('click', () => startSession('winddown'));

document.getElementById('session-wake-up').querySelector('.btn')
  .addEventListener('click', () => startSession('wakeup'));

// ---- Session ----

async function startSession(type) {
  let queue;
  if (type === 'winddown') {
    queue = await buildWindDownQueue(settings.sessionCapCards);
  } else {
    queue = await buildWakeUpQueue();
  }

  if (queue.length === 0) {
    if (type === 'wakeup') {
      alert("No cards from last night's session — do a wind-down review first.");
      return;
    }
    // For wind-down, pull from all cards even if not due
    const all = await getCards();
    queue = all.slice(0, settings.sessionCapCards);
    if (queue.length === 0) {
      alert('Add some cards to a deck to get started.');
      return;
    }
  }

  currentSession = {
    id: crypto.randomUUID(),
    type,
    queue,
    index: 0,
    results: [],
    startedAt: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    revealed: false,
    timerInterval: null
  };

  // Mark cards as seeded if wind-down
  if (type === 'winddown') {
    for (const card of queue) {
      await putCard({ ...card, seededAt: new Date().toISOString(), morningDue: true });
    }
  }

  // Build progress dots
  buildProgressDots(queue.length);

  // Start timer
  startSessionTimer();

  // Render first card
  renderSessionCard_review();

  document.querySelector('.nav').style.display = 'none';
  showView('session');
}

function buildProgressDots(count) {
  const container = document.getElementById('session-dots');
  container.innerHTML = '';
  const show = Math.min(count, 20);
  for (let i = 0; i < show; i++) {
    const dot = document.createElement('div');
    dot.className = 'progress-dot' + (i === 0 ? ' current' : '');
    container.appendChild(dot);
  }
}

function updateProgressDots(index) {
  const dots = document.querySelectorAll('.progress-dot');
  dots.forEach((d, i) => {
    d.className = 'progress-dot' +
      (i < index ? ' done' : i === index ? ' current' : '');
  });
}

let sessionStartTime = null;
function startSessionTimer() {
  sessionStartTime = Date.now();
  if (currentSession.timerInterval) clearInterval(currentSession.timerInterval);
  currentSession.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const capSec = settings.sessionCapMinutes * 60;
    const remaining = capSec - elapsed;
    if (remaining <= 0) {
      clearInterval(currentSession.timerInterval);
      finishSession();
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    document.getElementById('session-timer').textContent =
      `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

function renderSessionCard_review() {
  const { type, queue, index } = currentSession;
  if (index >= queue.length) { finishSession(); return; }

  const card = queue[index];
  currentSession.revealed = false;

  // Deck name
  getDeck(card.deckId).then(deck => {
    document.getElementById('card-deck-label').textContent = deck?.name ?? '';
  });

  document.getElementById('card-front').textContent = card.front;
  document.getElementById('card-back').textContent = card.back;

  const backEl = document.getElementById('card-back');
  const dividerEl = document.getElementById('card-divider');
  backEl.style.display = 'none';
  dividerEl.style.display = 'none';

  const revealBtn = document.getElementById('reveal-btn');
  const ratingBtns = document.getElementById('rating-buttons');
  const morningRating = document.getElementById('morning-rating');

  if (type === 'wakeup') {
    revealBtn.style.display = 'none';
    ratingBtns.style.display = 'none';
    morningRating.style.display = 'grid';
    // Auto-reveal for morning (show front as question, no reveal step)
    document.getElementById('card-front').textContent = card.front;
  } else {
    revealBtn.style.display = 'block';
    ratingBtns.style.display = 'none';
    morningRating.style.display = 'none';
  }

  document.getElementById('session-progress-label').textContent =
    `${index + 1} / ${queue.length}`;

  updateProgressDots(index);

  // Audio mode
  if (settings.audioMode) {
    speakText(card.front);
  }

  document.querySelector('.flashcard-body').classList.add('fade-in');
  setTimeout(() => document.querySelector('.flashcard-body').classList.remove('fade-in'), 300);
}

// Reveal answer
document.getElementById('reveal-btn').addEventListener('click', () => {
  if (currentSession.revealed) return;
  currentSession.revealed = true;

  document.getElementById('card-back').style.display = 'block';
  document.getElementById('card-divider').style.display = 'block';
  document.getElementById('reveal-btn').style.display = 'none';
  document.getElementById('rating-buttons').style.display = 'grid';

  if (settings.audioMode) {
    const card = currentSession.queue[currentSession.index];
    setTimeout(() => speakText(card.back), 300);
  }
});

// Rating buttons (wind-down)
document.querySelectorAll('.rating-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const ratingMap = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
    const rating = ratingMap[btn.dataset.rating];
    await recordRating(rating);
  });
});

// Morning recall buttons
document.querySelectorAll('.morning-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const rating = btn.dataset.morning === 'yes' ? Rating.Good : Rating.Again;
    await recordRating(rating);
  });
});

async function recordRating(rating) {
  const { queue, index } = currentSession;
  const card = queue[index];

  const updatedCard = scheduleCard(card, rating);
  if (currentSession.type === 'wakeup') {
    updatedCard.morningDue = false; // clear morning flag after testing
  }
  await putCard(updatedCard);
  // Update our local queue copy too
  currentSession.queue[index] = updatedCard;

  currentSession.results.push({ cardId: card.id, rating });
  currentSession.index++;
  renderSessionCard_review();
}

function stopSessionTimer() {
  if (currentSession?.timerInterval) {
    clearInterval(currentSession.timerInterval);
    currentSession.timerInterval = null;
  }
}

async function finishSession() {
  stopSessionTimer();
  const session = currentSession;

  await putSession({
    id: session.id,
    type: session.type,
    date: session.date,
    startedAt: session.startedAt,
    completedAt: new Date().toISOString(),
    results: session.results
  });

  // Render done screen
  const type = session.type;
  const count = session.results.length;
  const retention = sessionRetention({ results: session.results });

  document.getElementById('done-icon').textContent = type === 'winddown' ? '🌙' : '☀️';
  document.getElementById('done-title').textContent =
    type === 'winddown' ? 'That\'s enough — goodnight.' : 'Good morning.';
  document.getElementById('done-sub').textContent =
    type === 'winddown'
      ? 'You\'ve seeded these cards for overnight consolidation. Put the phone down.'
      : retention !== null
        ? `You recalled ${Math.round(retention * 100)}% of last night's cards.`
        : 'Morning recall complete.';

  document.getElementById('done-count').textContent = count;
  document.getElementById('done-retention').textContent =
    retention !== null ? Math.round(retention * 100) + '%' : '—';

  const retentionEl = document.getElementById('done-retention-stat');
  retentionEl.style.display = retention !== null ? 'block' : 'none';

  currentSession = null;
  showView('done');
}

document.getElementById('done-home-btn').addEventListener('click', async () => {
  await renderHome();
  showView('home');
});

// ---- Decks ----

async function renderDecks() {
  const decks = await getDecks();
  const list = document.getElementById('deck-list');
  list.innerHTML = '';

  if (decks.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="glyph">📚</div>
      <p>No decks yet. Create one to get started.</p>
    </div>`;
    return;
  }

  for (const deck of decks) {
    const cards = await getCardsByDeck(deck.id);
    const due = cards.filter(c => new Date(c.due) <= new Date()).length;
    const item = document.createElement('div');
    item.className = 'deck-item';
    item.innerHTML = `
      <div class="deck-item-info">
        <h3>${escHtml(deck.name)}</h3>
        <span class="deck-item-meta">${cards.length} cards${due > 0 ? ` · ${due} due` : ''}</span>
      </div>
      <span class="deck-item-arrow">›</span>
    `;
    item.addEventListener('click', () => openDeck(deck.id));
    list.appendChild(item);
  }
}

async function openDeck(deckId) {
  currentDeckId = deckId;
  const deck = await getDeck(deckId);
  const cards = await getCardsByDeck(deckId);

  document.getElementById('deck-detail-name').textContent = deck.name;
  document.getElementById('deck-detail-desc').textContent = deck.description || '';

  const list = document.getElementById('deck-cards-list');
  list.innerHTML = '';

  if (cards.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No cards yet.</p></div>';
  } else {
    const stateLabels = { 0: 'new', 1: 'learning', 2: 'review', 3: 'relearning' };
    for (const card of cards) {
      const item = document.createElement('div');
      item.className = 'card-item';
      const stateKey = stateLabels[card.state] ?? 'new';
      item.innerHTML = `
        <span class="card-item-front">${escHtml(card.front)}</span>
        <span class="card-item-state ${stateKey}">${stateKey}</span>
      `;
      item.addEventListener('click', () => openCardEditor(card.id));
      list.appendChild(item);
    }
  }

  showView('deck-detail');
}

document.getElementById('deck-back-btn').addEventListener('click', () => {
  renderDecks();
  showView('decks');
});

document.getElementById('deck-add-card-btn').addEventListener('click', () => openCardEditor(null));

document.getElementById('deck-delete-btn').addEventListener('click', async () => {
  if (!confirm('Delete this deck and all its cards?')) return;
  await deleteDeck(currentDeckId);
  await deleteCardsByDeck(currentDeckId);
  await renderDecks();
  showView('decks');
});

// ---- Card Editor ----

async function openCardEditor(cardId) {
  editingCardId = cardId;
  const form = document.getElementById('card-editor-form');
  form.reset();

  if (cardId) {
    const card = await getCard(cardId);
    document.getElementById('card-front-input').value = card.front;
    document.getElementById('card-back-input').value = card.back;
    document.getElementById('card-editor-title').textContent = 'Edit card';
    document.getElementById('card-delete-btn').style.display = 'block';
  } else {
    document.getElementById('card-editor-title').textContent = 'Add card';
    document.getElementById('card-delete-btn').style.display = 'none';
  }

  showView('card-editor');
}

document.getElementById('card-editor-form').addEventListener('submit', async e => {
  e.preventDefault();
  const front = document.getElementById('card-front-input').value.trim();
  const back = document.getElementById('card-back-input').value.trim();
  if (!front || !back) return;

  if (editingCardId) {
    const card = await getCard(editingCardId);
    await putCard({ ...card, front, back });
  } else {
    await putCard(newCard(currentDeckId, front, back));
  }

  await openDeck(currentDeckId);
});

document.getElementById('card-cancel-btn').addEventListener('click', () => openDeck(currentDeckId));

document.getElementById('card-delete-btn').addEventListener('click', async () => {
  if (!confirm('Delete this card?')) return;
  await deleteCard(editingCardId);
  await openDeck(currentDeckId);
});

// ---- New Deck ----

document.getElementById('new-deck-btn').addEventListener('click', () => showView('new-deck'));
document.getElementById('new-deck-cancel').addEventListener('click', () => showView('decks'));

document.getElementById('new-deck-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('new-deck-name').value.trim();
  const desc = document.getElementById('new-deck-desc').value.trim();
  if (!name) return;
  const deck = newDeck(name, desc);
  await putDeck(deck);
  await renderDecks();
  currentDeckId = deck.id;
  await openDeck(deck.id);
});

// ---- Settings ----

async function renderSettings() {
  document.getElementById('set-bedtime').value = settings.bedtime;
  document.getElementById('set-waketime').value = settings.waketime;
  document.getElementById('set-cap-cards').value = settings.sessionCapCards;
  document.getElementById('set-cap-minutes').value = settings.sessionCapMinutes;
  document.getElementById('set-audio').checked = settings.audioMode;
  document.getElementById('set-name').value = settings.userName || '';
}

document.getElementById('settings-save-btn').addEventListener('click', async () => {
  settings.bedtime = document.getElementById('set-bedtime').value;
  settings.waketime = document.getElementById('set-waketime').value;
  settings.sessionCapCards = parseInt(document.getElementById('set-cap-cards').value, 10);
  settings.sessionCapMinutes = parseInt(document.getElementById('set-cap-minutes').value, 10);
  settings.audioMode = document.getElementById('set-audio').checked;
  settings.userName = document.getElementById('set-name').value.trim();
  document.body.classList.toggle('audio-mode', settings.audioMode);
  await saveSettings();
  await renderHome();
  showView('home');
});

// ---- Nav ----

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const view = btn.dataset.view;
    if (view === 'home') await renderHome();
    if (view === 'decks') await renderDecks();
    if (view === 'settings') await renderSettings();
    showView(view);
  });
});

// ---- Audio (TTS) ----

function speakText(text) {
  if (!settings.audioMode) return;
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

// ---- Escape HTML ----

function escHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---- Start ----

init().catch(err => {
  console.error('Penumbra init error:', err);
  document.body.innerHTML = `<div style="padding:40px;color:#c87;font-family:monospace">
    Init error: ${err.message}
  </div>`;
});
