import { serialize, deserialize } from './state.js';

const KEY = 'pulse.project.v1';

let pending = null;

export function save(project) {
  clearTimeout(pending);
  pending = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(serialize(project)));
    } catch {
      /* private mode or quota — autosave is a nicety, not a requirement */
    }
  }, 400);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
