const KEY = 'patience:stats:v1';

function defaultStats() {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    bestTimeMs: null,
    bestScore: 0,
    currentStreak: 0,
    bestStreak: 0,
    dailyCompletions: {}, // dateStr -> { won, timeMs, score, moves }
  };
}

export function loadStats() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultStats();
    return { ...defaultStats(), ...JSON.parse(raw) };
  } catch {
    return defaultStats();
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // localStorage unavailable (private mode, quota) — stats just won't persist
  }
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function recordGameResult({ won, timeMs, score, moves, isDaily, dateStr }) {
  const stats = loadStats();
  stats.gamesPlayed++;
  if (won) {
    stats.gamesWon++;
    if (stats.bestTimeMs === null || timeMs < stats.bestTimeMs) stats.bestTimeMs = timeMs;
    if (score > stats.bestScore) stats.bestScore = score;
  }

  if (isDaily) {
    const already = stats.dailyCompletions[dateStr];
    const alreadyWon = already && already.won;
    stats.dailyCompletions[dateStr] = {
      won: won || alreadyWon,
      timeMs: already && already.won ? Math.min(already.timeMs, timeMs) : timeMs,
      score: already ? Math.max(already.score, score) : score,
      moves,
    };
    if (won && !alreadyWon) {
      const yesterday = shiftDate(dateStr, -1);
      const wonYesterday = stats.dailyCompletions[yesterday]?.won;
      stats.currentStreak = wonYesterday ? stats.currentStreak + 1 : 1;
      if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
    }
  }

  saveStats(stats);
  return stats;
}

export function getDailyStatus(dateStr) {
  const stats = loadStats();
  return stats.dailyCompletions[dateStr] || null;
}

export function formatTime(ms) {
  if (ms === null || ms === undefined) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
