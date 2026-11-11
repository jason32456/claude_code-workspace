const KEY = 'hatful.v1';
const THEME_KEY = 'hatful.theme';
const HUES = [350, 205, 38, 272, 152, 16, 312, 96, 228];

export const MAX_PEOPLE = 30;

export function uid() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'p' + [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('');
}

export const blankPerson = () => ({ id: uid(), name: '', group: null, hint: '' });

export function emptyEvent() {
  return {
    id: uid(),
    title: 'Gift swap',
    date: '',
    budget: '',
    note: '',
    mode: 'any',
    people: [blankPerson(), blankPerson(), blankPerson()],
    bans: [],
    usePin: false,
    draw: null,
  };
}

function isoIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function demoEvent() {
  const people = [
    ['Maya', 'Hartley', 'size M, loves a good mug'],
    ['Theo', 'Hartley', 'into hot sauce and board games'],
    ['Priya', 'Novak', 'tea over coffee, always'],
    ['Jonas', 'Novak', 'bakes sourdough, hates clutter'],
    ['Lena', null, 'plants, plants, plants'],
    ['Omar', null, 'cycling, bad puns'],
    ['Ines', null, 'sci-fi paperbacks'],
    ['Sam', null, 'anything with a dinosaur on it'],
  ].map(([name, group, hint]) => ({ id: uid(), name, group, hint }));
  const id = (name) => people.find((p) => p.name === name).id;
  return {
    id: uid(),
    title: 'Winter gift swap',
    date: isoIn(30),
    budget: '$25',
    note: 'Wrap it, skip the name tag. We guess who at the party.',
    mode: 'any',
    people,
    bans: [{ from: id('Omar'), to: id('Lena') }],
    usePin: false,
    draw: null,
  };
}

const str = (x) => (typeof x === 'string' ? x : '');

function sanitise(ev) {
  if (!ev || typeof ev !== 'object' || !Array.isArray(ev.people) || !Array.isArray(ev.bans)) return null;
  const seen = new Set();
  const people = [];
  for (const p of ev.people) {
    if (!p || typeof p.id !== 'string' || seen.has(p.id)) return null;
    seen.add(p.id);
    people.push({ id: p.id, name: str(p.name), group: str(p.group) || null, hint: str(p.hint) });
  }
  const bans = ev.bans.filter((b) => b && seen.has(b.from) && seen.has(b.to) && b.from !== b.to).map((b) => ({ from: b.from, to: b.to }));
  const d = ev.draw;
  let draw = null;
  if (d && typeof d === 'object' && typeof d.seed === 'string' && d.assignment && typeof d.assignment === 'object') {
    draw = {
      seed: d.seed,
      assignment: d.assignment,
      seal: str(d.seal),
      pins: d.pins && typeof d.pins === 'object' ? d.pins : {},
      sent: d.sent && typeof d.sent === 'object' ? d.sent : {},
      opened: Boolean(d.opened),
      at: d.at ?? null,
      uniform: d.uniform !== false,
      method: str(d.method),
    };
  }
  return {
    id: str(ev.id) || uid(),
    title: str(ev.title),
    date: str(ev.date),
    budget: str(ev.budget),
    note: str(ev.note),
    mode: ['any', 'noswap', 'loop'].includes(ev.mode) ? ev.mode : 'any',
    people,
    bans,
    usePin: Boolean(ev.usePin),
    draw,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      const event = sanitise(o?.event);
      if (event) return { event, step: ['people', 'rules', 'hat'].includes(o.step) ? o.step : 'people' };
    }
  } catch {
    // unreadable storage: start from the demo
  }
  return null;
}

export function saveState(event, step) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ event, step }));
  } catch {
    // storage blocked or full: the app still works for this session
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

export const loadTheme = () => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null;
  }
};

export function saveTheme(t) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // theme just will not be remembered
  }
}

export function sanitiseEvent(ev) {
  return sanitise(ev);
}

// Colour per household, in order of first appearance so it stays stable while editing other rows.
export function householdColours(event) {
  const map = new Map();
  for (const p of event.people) {
    if (p.group && !map.has(p.group)) map.set(p.group, `hsl(${HUES[map.size % HUES.length]} 58% 48%)`);
  }
  return map;
}

export function validatePeople(event) {
  const problems = [];
  const named = event.people.filter((p) => p.name.trim());
  if (named.length < 3) problems.push('Add at least 3 people to start a draw.');
  if (named.length > MAX_PEOPLE) problems.push(`Hatful handles up to ${MAX_PEOPLE} people.`);
  const seen = new Map();
  const dupIds = new Set();
  for (const p of named) {
    const key = p.name.trim().toLowerCase();
    if (seen.has(key)) {
      dupIds.add(p.id);
      dupIds.add(seen.get(key));
    } else seen.set(key, p.id);
  }
  if (dupIds.size) {
    const names = [...new Set([...dupIds].map((id) => event.people.find((p) => p.id === id).name.trim()))];
    problems.push(`Names must be unique (case does not matter): ${names.join(', ')}.`);
  }
  return { ok: problems.length === 0, problems, dupIds };
}
