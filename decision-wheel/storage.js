const PRESETS_KEY = 'decision-wheel:presets';
const CURRENT_KEY = 'decision-wheel:current-options';
const HISTORY_KEY = 'decision-wheel:history';

const DEFAULT_PRESETS = {
  "What's for dinner?": ['Pizza', 'Sushi', 'Tacos', 'Burgers', 'Salad', 'Curry'],
  'Who goes first?': ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
};

export function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(DEFAULT_PRESETS));
      return { ...DEFAULT_PRESETS };
    }
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PRESETS };
  }
}

export function savePreset(name, options) {
  const presets = loadPresets();
  presets[name] = options;
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
}

export function deletePreset(name) {
  const presets = loadPresets();
  delete presets[name];
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return presets;
}

export function loadCurrentOptions() {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to default */
  }
  return DEFAULT_PRESETS["What's for dinner?"];
}

export function saveCurrentOptions(options) {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(options));
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function pushHistory(entry) {
  const history = loadHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
  return [];
}
