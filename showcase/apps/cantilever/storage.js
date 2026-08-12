// Per-level progress: the last design, the cheapest winning design, and whether
// the level has ever been cleared.

const KEY = 'cantilever_v1';

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private browsing or a full quota: progress just does not persist.
  }
}

export function loadLevelState(id) {
  return readAll()[id] || null;
}

export function saveDesign(id, design) {
  const all = readAll();
  all[id] = { ...(all[id] || {}), design };
  writeAll(all);
}

export function saveWin(id, cost) {
  const all = readAll();
  const prev = all[id] || {};
  all[id] = { ...prev, cleared: true, best: prev.best ? Math.min(prev.best, cost) : cost };
  writeAll(all);
}

export function progress() {
  return readAll();
}
