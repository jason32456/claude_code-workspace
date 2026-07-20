const MOODS = [
  { emoji: '🤩', label: 'Amazing',  color: '#a78bfa' },
  { emoji: '😄', label: 'Great',    color: '#34d399' },
  { emoji: '😊', label: 'Good',     color: '#6ee7b7' },
  { emoji: '😌', label: 'Calm',     color: '#93c5fd' },
  { emoji: '😐', label: 'Okay',     color: '#fcd34d' },
  { emoji: '😕', label: 'Meh',      color: '#fb923c' },
  { emoji: '😢', label: 'Sad',      color: '#60a5fa' },
  { emoji: '😤', label: 'Stressed', color: '#f87171' },
];

const STORAGE_KEY = 'moodlog_entries';
const MAX_MONTHS_BACK = 12;

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ── State ──────────────────────────────────────────────────────────────────
let entries   = loadEntries();
let selected  = null;     // mood index while editing
let calYear   = 0;
let calMonth  = 0;

// ── DOM refs ───────────────────────────────────────────────────────────────
const $todayDate     = document.getElementById('today-date');
const $checkin       = document.getElementById('checkin-section');
const $moodPicker    = document.getElementById('mood-picker');
const $noteSection   = document.getElementById('note-section');
const $noteInput     = document.getElementById('note-input');
const $charCount     = document.getElementById('char-count');
const $saveBtn       = document.getElementById('save-btn');
const $entrySummary  = document.getElementById('entry-summary');
const $entryEmoji    = document.getElementById('entry-emoji');
const $entryLabel    = document.getElementById('entry-mood-label');
const $entryNote     = document.getElementById('entry-note');
const $editBtn       = document.getElementById('edit-btn');
const $streakVal     = document.getElementById('streak-val');
const $bestVal       = document.getElementById('best-streak-val');
const $topMoodVal    = document.getElementById('top-mood-val');
const $calTitle      = document.getElementById('cal-title');
const $prevMonth     = document.getElementById('prev-month');
const $nextMonth     = document.getElementById('next-month');
const $calGrid       = document.getElementById('calendar-grid');
const $tooltip       = document.getElementById('day-tooltip');
const $legend        = document.getElementById('legend');

// ── Helpers ────────────────────────────────────────────────────────────────
function toKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function todayKey() {
  const t = new Date();
  return toKey(t.getFullYear(), t.getMonth(), t.getDate());
}

function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

// ── Streak calculation ─────────────────────────────────────────────────────
function calcStreaks() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const tk = todayKey();

  // Walk backwards from today (or yesterday if today not logged)
  let start = new Date(today);
  if (!entries[tk]) start.setDate(start.getDate() - 1);

  let current = 0;
  let best = 0;
  let streak = 0;
  let d = new Date(start);

  while (true) {
    const k = toKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (entries[k]) {
      streak++;
      best = Math.max(best, streak);
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  current = streak;

  // Re-scan entire history for best streak
  const allKeys = Object.keys(entries).sort();
  streak = 0;
  for (let i = 0; i < allKeys.length; i++) {
    if (i === 0) { streak = 1; }
    else {
      const prev = new Date(allKeys[i-1]);
      const curr = new Date(allKeys[i]);
      const diff = (curr - prev) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    }
    best = Math.max(best, streak);
  }

  return { current, best };
}

function calcTopMood() {
  const counts = new Array(MOODS.length).fill(0);
  Object.values(entries).forEach(e => counts[e.mood]++);
  const max = Math.max(...counts);
  if (max === 0) return null;
  return counts.indexOf(max);
}

// ── Render: header ─────────────────────────────────────────────────────────
function renderHeader() {
  $todayDate.textContent = formatDisplayDate(new Date());
}

// ── Render: mood picker buttons ────────────────────────────────────────────
function renderMoodPicker() {
  $moodPicker.innerHTML = '';
  MOODS.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'mood-btn' + (selected === i ? ' selected' : '');
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-pressed', String(selected === i));
    btn.innerHTML = `<span class="mood-emoji">${m.emoji}</span><span class="mood-label">${m.label}</span>`;
    btn.addEventListener('click', () => selectMood(i));
    $moodPicker.appendChild(btn);
  });
}

function selectMood(i) {
  selected = i;
  renderMoodPicker();
  $noteSection.classList.add('visible');
  $saveBtn.disabled = false;
}

// ── Render: checkin vs summary ─────────────────────────────────────────────
function renderCheckinArea() {
  const tk = todayKey();
  const entry = entries[tk];

  if (entry && !$checkin.classList.contains('editing')) {
    // Show summary
    const m = MOODS[entry.mood];
    $entryEmoji.textContent = m.emoji;
    $entryLabel.textContent = m.label;
    $entryNote.textContent  = entry.note || 'No note added.';
    $checkin.hidden = true;
    $entrySummary.hidden = false;
  } else {
    // Show picker
    $checkin.hidden = false;
    $entrySummary.hidden = true;
    // Pre-fill if editing existing entry
    if (entry) {
      selected = entry.mood;
      $noteInput.value = entry.note || '';
      $charCount.textContent = `${$noteInput.value.length} / 280`;
      $noteSection.classList.add('visible');
    } else {
      selected = null;
      $noteInput.value = '';
      $charCount.textContent = '0 / 280';
      $noteSection.classList.remove('visible');
    }
    renderMoodPicker();
  }
}

// ── Render: stats ──────────────────────────────────────────────────────────
function renderStats() {
  const { current, best } = calcStreaks();
  const top = calcTopMood();
  $streakVal.textContent  = current;
  $bestVal.textContent    = best;
  $topMoodVal.textContent = top !== null ? MOODS[top].emoji : '—';
}

// ── Render: calendar ──────────────────────────────────────────────────────
function renderCalendar() {
  const today = new Date();
  const isCurrent = calYear === today.getFullYear() && calMonth === today.getMonth();

  $calTitle.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;

  // Disable next if we're already on current month
  $nextMonth.disabled = isCurrent;

  // Disable prev if we've gone back MAX_MONTHS_BACK months
  const minDate = new Date(today);
  minDate.setMonth(minDate.getMonth() - MAX_MONTHS_BACK);
  const atMin = calYear < minDate.getFullYear() ||
    (calYear === minDate.getFullYear() && calMonth <= minDate.getMonth());
  $prevMonth.disabled = atMin;

  $calGrid.innerHTML = '';

  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayNum = today.getDate();
  const tkToday  = todayKey();

  // Blank padding cells
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    $calGrid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key  = toKey(calYear, calMonth, d);
    const entry = entries[key];
    const isPast   = new Date(calYear, calMonth, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isFuture = new Date(calYear, calMonth, d) > new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday  = key === tkToday;

    const cell = document.createElement('div');
    let cls = 'cal-day';
    if (entry)       cls += ' has-entry';
    else if (isFuture) cls += ' future';
    else               cls += ' past-empty';
    if (isToday)     cls += ' is-today';
    cell.className = cls;

    if (entry) {
      const m = MOODS[entry.mood];
      cell.style.background = m.color + 'cc'; // semi-transparent
    }

    cell.innerHTML = `<span class="day-number">${d}</span>`;

    if (entry) {
      cell.addEventListener('mouseenter', (e) => showTooltip(e, key, entry));
      cell.addEventListener('mouseleave', hideTooltip);
      cell.addEventListener('touchstart', (e) => { e.preventDefault(); showTooltip(e.touches[0], key, entry); });
      cell.addEventListener('touchend', hideTooltip);
    }

    $calGrid.appendChild(cell);
  }
}

// ── Tooltip ────────────────────────────────────────────────────────────────
function showTooltip(e, key, entry) {
  const m = MOODS[entry.mood];
  const date = new Date(key + 'T00:00:00');
  const dateStr = date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

  $tooltip.innerHTML = `
    <div class="tooltip-date">${dateStr}</div>
    <div>
      <span class="tooltip-mood">${m.emoji}</span>
      <span class="tooltip-label">${m.label}</span>
    </div>
    ${entry.note ? `<div class="tooltip-note">${escapeHtml(entry.note)}</div>` : ''}
  `;

  $tooltip.hidden = false;
  positionTooltip(e);
}

function positionTooltip(e) {
  const margin = 12;
  const tw = $tooltip.offsetWidth;
  const th = $tooltip.offsetHeight;
  let x = e.clientX + margin;
  let y = e.clientY + margin;
  if (x + tw > window.innerWidth - margin)  x = e.clientX - tw - margin;
  if (y + th > window.innerHeight - margin) y = e.clientY - th - margin;
  $tooltip.style.left = `${x}px`;
  $tooltip.style.top  = `${y}px`;
}

function hideTooltip() {
  $tooltip.hidden = true;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Render: legend ─────────────────────────────────────────────────────────
function renderLegend() {
  $legend.innerHTML = MOODS.map(m => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${m.color}"></span>
      <span>${m.emoji} ${m.label}</span>
    </div>
  `).join('');
}

// ── Full re-render ─────────────────────────────────────────────────────────
function render() {
  renderCheckinArea();
  renderStats();
  renderCalendar();
}

// ── Save entry ─────────────────────────────────────────────────────────────
function saveEntry() {
  if (selected === null) return;
  const tk = todayKey();
  entries[tk] = { mood: selected, note: $noteInput.value.trim() };
  persist();
  $checkin.classList.remove('editing');
  render();
}

// ── Event listeners ────────────────────────────────────────────────────────
$saveBtn.addEventListener('click', saveEntry);

$noteInput.addEventListener('input', () => {
  $charCount.textContent = `${$noteInput.value.length} / 280`;
});

$editBtn.addEventListener('click', () => {
  $checkin.classList.add('editing');
  renderCheckinArea();
});

$prevMonth.addEventListener('click', () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});

$nextMonth.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

document.addEventListener('mousemove', (e) => {
  if (!$tooltip.hidden) positionTooltip(e);
});

// ── Boot ───────────────────────────────────────────────────────────────────
function init() {
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth();

  renderHeader();
  renderLegend();
  render();
}

init();
