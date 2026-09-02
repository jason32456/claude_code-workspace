const KEY = 'gambit-v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage unavailable (private mode, quota) — puzzle rush still works, just doesn't persist
  }
}

export function getBestStreak(tier) {
  const data = load();
  return (data.bestStreak && data.bestStreak[tier]) || 0;
}

export function setBestStreak(tier, value) {
  const data = load();
  data.bestStreak = data.bestStreak || {};
  if (value > (data.bestStreak[tier] || 0)) {
    data.bestStreak[tier] = value;
    save(data);
  }
}

export function getSoundEnabled() {
  const data = load();
  return data.soundEnabled !== false;
}

export function setSoundEnabled(v) {
  const data = load();
  data.soundEnabled = v;
  save(data);
}
