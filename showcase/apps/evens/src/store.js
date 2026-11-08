import { demoGroup } from './demo.js';

const KEY = 'evens:v1';
let counter = 0;
export const uid = () => Date.now().toString(36).slice(-5) + (counter++).toString(36) + Math.random().toString(36).slice(2, 6);

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.groups) && s.groups.length) return s;
    }
  } catch { /* storage blocked or corrupt — start fresh */ }
  const g = demoGroup(uid);
  return { groups: [g], current: g.id };
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: keep working in memory */ }
}
