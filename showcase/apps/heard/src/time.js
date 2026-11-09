export const pad = (n) => String(n).padStart(2, '0');

// Minutes since midnight (may be negative or past 24 h) → "HH:MM".
export function clock(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function parseClock(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : 19 * 60;
}

export function dur(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const hh = Math.floor(min / 60), mm = min % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

// Seconds → "1:04:09" or "4:09".
export function countdown(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}
