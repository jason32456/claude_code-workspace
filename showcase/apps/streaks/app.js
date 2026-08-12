// ── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'streaks_v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function save(habits) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
}

// ── Date utilities ───────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function calcStreak(history) {
  let streak = 0;
  const today = todayStr();
  const yesterday = daysAgo(1);

  // Start from yesterday (or today if already checked) and count backwards
  const checked = new Set(history);
  let cursor = checked.has(today) ? today : yesterday;
  if (!checked.has(cursor)) return 0;

  let d = new Date(cursor);
  while (checked.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function motivation(streak) {
  if (streak === 0) return 'Start today!';
  if (streak <= 2)  return 'Great start!';
  if (streak <= 6)  return 'Keep it up!';
  if (streak <= 13) return 'One week strong 💪';
  if (streak <= 29) return "Two weeks! You're building something real.";
  return 'Legendary 🏆';
}

function streakIcon(streak) {
  if (streak >= 30) return '🏆';
  if (streak >= 3)  return '🔥';
  return '';
}

// ── Confetti ─────────────────────────────────────────────────────────────────

const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let rafId = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function burst(x, y) {
  const colors = ['#7c3aed','#a78bfa','#f59e0b','#fde68a','#34d399','#f472b6'];
  for (let i = 0; i < 60; i++) {
    const angle = (Math.random() * Math.PI * 2);
    const speed = 3 + Math.random() * 6;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 5 + Math.random() * 5,
      life: 1,
      decay: 0.015 + Math.random() * 0.01,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
    });
  }
  if (!rafId) animateConfetti();
}

function animateConfetti() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.25;
    p.vx *= 0.98;
    p.life -= p.decay;
    p.rotation += p.rotSpeed;

    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }
  if (particles.length > 0) {
    rafId = requestAnimationFrame(animateConfetti);
  } else {
    rafId = null;
  }
}

// ── Emoji options ─────────────────────────────────────────────────────────────

const EMOJIS = ['💪','🏃','📚','💧','🧘','🥗','😴','✍️','🎯','🎸','🌿','🧹'];

// ── State ─────────────────────────────────────────────────────────────────────

let habits = load();
let selectedEmoji = EMOJIS[0];

// ── DOM refs ──────────────────────────────────────────────────────────────────

const grid       = document.getElementById('habits-grid');
const addBtn     = document.getElementById('add-btn');
const addForm    = document.getElementById('add-form');
const cancelBtn  = document.getElementById('cancel-btn');
const saveBtn    = document.getElementById('save-btn');
const habitInput = document.getElementById('habit-input');
const emojiRow   = document.getElementById('emoji-row');
const emptyState = document.getElementById('empty-state');
const addSection = document.getElementById('add-section');

// ── Render ────────────────────────────────────────────────────────────────────

function renderEmojiPicker() {
  emojiRow.innerHTML = '';
  EMOJIS.forEach(e => {
    const btn = document.createElement('button');
    btn.className = 'emoji-option' + (e === selectedEmoji ? ' selected' : '');
    btn.textContent = e;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      selectedEmoji = e;
      renderEmojiPicker();
    });
    emojiRow.appendChild(btn);
  });
}

function renderHeatmap(history) {
  const checked = new Set(history);
  const cells = [];
  for (let i = 29; i >= 0; i--) {
    const date = daysAgo(i);
    const isChecked = checked.has(date);
    const div = document.createElement('div');
    div.className = 'heatmap-cell' + (isChecked ? (i < 7 ? ' checked recent' : ' checked') : '');
    div.title = date;
    cells.push(div);
  }
  return cells;
}

function renderCard(habit) {
  const today = todayStr();
  const isDone = habit.history.includes(today);
  const streak = calcStreak(habit.history);
  const icon = streakIcon(streak);

  const card = document.createElement('div');
  card.className = 'habit-card' + (isDone ? ' done' : '');
  card.dataset.id = habit.id;

  card.innerHTML = `
    <div class="card-top">
      <span class="habit-emoji">${habit.emoji}</span>
      <span class="habit-name">${habit.name}</span>
      <button class="delete-btn" title="Delete habit" aria-label="Delete ${habit.name}">✕</button>
    </div>
    <div class="streak-row">
      <div class="streak-number">${streak}</div>
      <div class="streak-label">
        <span class="streak-days-text">day streak</span>
        <span class="motivation">${motivation(streak)}</span>
      </div>
      ${icon ? `<span class="streak-icon">${icon}</span>` : ''}
    </div>
    <div class="heatmap"></div>
    <button class="check-btn ${isDone ? 'checked' : ''}">
      <span class="check-icon">${isDone ? '✓' : '○'}</span>
      ${isDone ? 'Done today!' : 'Mark done'}
    </button>
  `;

  const heatmap = card.querySelector('.heatmap');
  renderHeatmap(habit.history).forEach(cell => heatmap.appendChild(cell));

  card.querySelector('.check-btn').addEventListener('click', () => {
    if (isDone) return;
    onCheck(habit.id, card);
  });

  card.querySelector('.delete-btn').addEventListener('click', () => {
    onDelete(habit.id);
  });

  return card;
}

function render() {
  grid.innerHTML = '';
  const hasHabits = habits.length > 0;

  emptyState.classList.toggle('hidden', hasHabits);

  // Show/hide add button based on limit
  const atLimit = habits.length >= 6;
  addBtn.style.display = atLimit ? 'none' : '';

  // Limit notice
  let notice = document.querySelector('.limit-notice');
  if (atLimit) {
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'limit-notice';
      addSection.appendChild(notice);
    }
    notice.textContent = 'Maximum 6 habits reached.';
  } else if (notice) {
    notice.remove();
  }

  habits.forEach(h => grid.appendChild(renderCard(h)));
}

// ── Actions ───────────────────────────────────────────────────────────────────

function onCheck(id, cardEl) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;

  const today = todayStr();
  if (!habit.history.includes(today)) {
    habit.history.push(today);
    // Keep only last 90 days
    habit.history = habit.history.filter(d => d >= daysAgo(90));
    save(habits);
  }

  // Confetti from card center
  const rect = cardEl.getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2);

  // Animate streak number
  render();
  const newCard = grid.querySelector(`[data-id="${id}"]`);
  if (newCard) {
    const num = newCard.querySelector('.streak-number');
    num.classList.add('pop');
    num.addEventListener('animationend', () => num.classList.remove('pop'), { once: true });
  }
}

function onDelete(id) {
  if (!confirm('Delete this habit and all its history?')) return;
  habits = habits.filter(h => h.id !== id);
  save(habits);
  render();
}

function onAdd() {
  const name = habitInput.value.trim();
  if (!name) { habitInput.focus(); return; }
  if (habits.length >= 6) return;

  habits.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    name,
    emoji: selectedEmoji,
    history: [],
  });
  save(habits);
  habitInput.value = '';
  selectedEmoji = EMOJIS[0];
  closeForm();
  render();
}

function openForm() {
  addForm.classList.remove('hidden');
  addBtn.style.display = 'none';
  renderEmojiPicker();
  habitInput.focus();
}

function closeForm() {
  addForm.classList.add('hidden');
  addBtn.style.display = habits.length >= 6 ? 'none' : '';
  habitInput.value = '';
}

// ── Event listeners ───────────────────────────────────────────────────────────

addBtn.addEventListener('click', openForm);
cancelBtn.addEventListener('click', closeForm);
saveBtn.addEventListener('click', onAdd);
habitInput.addEventListener('keydown', e => { if (e.key === 'Enter') onAdd(); });

// ── Init ──────────────────────────────────────────────────────────────────────

addForm.classList.add('hidden');
renderEmojiPicker();
render();
