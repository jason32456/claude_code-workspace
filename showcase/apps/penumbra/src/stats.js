// Compute overnight retention and other stats from session history
import { getRecentSessions, getCards } from './storage.js';

// Overnight retention = fraction of morning-tested cards answered Good/Easy
export async function overnightRetention() {
  const sessions = await getRecentSessions(60);
  const wakeups = sessions.filter(s => s.type === 'wakeup' && s.results?.length);

  if (wakeups.length === 0) return null;

  let total = 0, correct = 0;
  for (const s of wakeups) {
    for (const r of s.results) {
      total++;
      if (r.rating >= 3) correct++; // Good or Easy
    }
  }
  return total > 0 ? correct / total : null;
}

// Retention for a single wake-up session
export function sessionRetention(session) {
  if (!session.results?.length) return null;
  const correct = session.results.filter(r => r.rating >= 3).length;
  return correct / session.results.length;
}

// Streak: consecutive days with at least one completed wind-down session
export async function currentStreak() {
  const sessions = await getRecentSessions(60);
  const winddowns = sessions.filter(s => s.type === 'winddown' && s.completedAt);

  if (winddowns.length === 0) return 0;

  const days = new Set(winddowns.map(s => s.date));
  let streak = 0;
  const today = todayStr();
  let checking = today;

  while (days.has(checking)) {
    streak++;
    checking = offsetDate(checking, -1);
  }
  return streak;
}

// Total cards learned (ever reached Review state)
export async function totalCardsLearned() {
  const cards = await getCards();
  return cards.filter(c => c.state >= 2).length;
}

export async function statsForHome() {
  const [retention, streak, learned] = await Promise.all([
    overnightRetention(),
    currentStreak(),
    totalCardsLearned()
  ]);
  return { retention, streak, learned };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
