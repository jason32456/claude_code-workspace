// Sleep-bracket scheduler: builds wind-down and wake-up queues
import { getCards, getCardsByDeck } from './storage.js';
import { State, retrievability } from './fsrs.js';

// Returns cards due for the wind-down session, sorted by sleep-bracket priority.
// Priority: overdue review cards first (by retrievability ascending = most forgotten),
// then new cards. Hard cap on count.
export async function buildWindDownQueue(maxCards = 15) {
  const all = await getCards();
  const now = new Date();

  const due = all.filter(c => {
    if (c.seededAt) return false; // already seeded tonight, skip
    return new Date(c.due) <= now || c.state === State.New;
  });

  // Sort: Review/Relearning by ascending retrievability (most forgotten first),
  // then Learning, then New
  const scored = due.map(c => ({
    card: c,
    r: retrievability(c, now),
    priority: c.state === State.New ? 2 : c.state === State.Learning ? 1 : 0
  }));

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.r - b.r; // lower retrievability = higher urgency
  });

  return scored.slice(0, maxCards).map(s => s.card);
}

// Returns cards that were seeded in last night's session (seededAt set, morningDue=true)
export async function buildWakeUpQueue() {
  const all = await getCards();
  const cutoff = new Date(Date.now() - 18 * 3600000); // within last 18 hours

  return all.filter(c =>
    c.morningDue &&
    c.seededAt &&
    new Date(c.seededAt) >= cutoff
  );
}

// How many cards are due right now (for home screen badge)
export async function dueCount() {
  const all = await getCards();
  const now = new Date();
  return all.filter(c => new Date(c.due) <= now).length;
}

// Are we within the wind-down window? (within 60 min of bedtime)
export function isWindDownTime(bedtimeStr, now = new Date()) {
  const [bh, bm] = bedtimeStr.split(':').map(Number);
  const bedtime = new Date(now);
  bedtime.setHours(bh, bm, 0, 0);
  if (bedtime < now) bedtime.setDate(bedtime.getDate() + 1); // next occurrence
  const minutesUntil = (bedtime - now) / 60000;
  return minutesUntil >= 0 && minutesUntil <= 60;
}

// Are we within the wake-up window? (within 90 min of wake time)
export function isWakeUpTime(waketimeStr, now = new Date()) {
  const [wh, wm] = waketimeStr.split(':').map(Number);
  const waketime = new Date(now);
  waketime.setHours(wh, wm, 0, 0);
  if (waketime < new Date(now - 90 * 60000)) waketime.setDate(waketime.getDate() + 1);
  const minutesSince = (now - waketime) / 60000;
  return minutesSince >= 0 && minutesSince <= 90;
}
