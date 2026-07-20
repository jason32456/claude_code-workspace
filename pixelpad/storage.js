// Debounced localStorage persistence.

const KEY = 'pixelpad-v1';
let timer = null;

export function save(state) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch { /* storage full or unavailable — drawing still works */ }
  }, 250);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (![16, 32, 64].includes(state.size)) return null;
    if (!Array.isArray(state.pixels) || state.pixels.length !== state.size * state.size) return null;
    return state;
  } catch {
    return null;
  }
}
