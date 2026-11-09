// Reverse serial schedule generation on a one-minute grid.
//
// Time t is in minutes relative to serving (t = 0 is serving, the plan lives at
// t < 0). Every step is placed as late as its successors allow, resource
// conflicts push it earlier, and a step pushed further than its hold window
// allows becomes a reported violation rather than a broken plan. The hard
// constraints (precedence, cooks, burners, oven slots, one temperature per oven
// and the preheat/cool gap between temperatures) are never broken.

export const AMBIENT = 20;
export const HEAT_RATE = 12; // °C per minute, a typical domestic oven
export const COOL_RATE = 5;  // °C per minute with the door shut
const H = 1440;              // horizon: a plan can start up to 24 h before serving
const P = 240;               // later courses can be served up to 4 h after the main
export const OFFSET_MAX = P;

export const rampMinutes = (from, to) => {
  if (!to || from === to) return 0;
  const f = from || AMBIENT;
  return to > f ? Math.ceil((to - f) / HEAT_RATE) : Math.ceil((f - to) / COOL_RATE);
};

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

// Flatten the menu into steps with explicit predecessors and successors.
export function flatten(menu) {
  const steps = [];
  const byId = new Map();
  for (const dish of menu.dishes) {
    dish.steps.forEach((s, i) => {
      const step = {
        id: s.id, dish: dish.id, dishName: dish.name, label: s.label,
        dur: Math.max(1, Math.round(+s.dur || 1)),
        hands: 0, equip: s.equip || 'none',
        temp: Math.round(+s.temp || 0), slots: Math.max(1, Math.round(+s.slots || 1)),
        hold: Math.max(0, Math.round(+s.hold || 0)),
        after: Array.isArray(s.after) ? [...s.after] : (i > 0 ? [dish.steps[i - 1].id] : []),
        succ: [], offset: Math.max(-H + 60, Math.min(P, Math.round(+dish.offset || 0))),
      };
      step.hands = Math.min(step.dur, Math.max(0, Math.round(+s.hands || 0)));
      steps.push(step);
      byId.set(step.id, step);
    });
  }
  for (const s of steps) {
    s.after = s.after.filter((id) => byId.has(id) && id !== s.id);
    for (const p of s.after) byId.get(p).succ.push(s.id);
  }
  // Break cycles so a bad edit can never hang the planner: drop back edges.
  const state = new Map();
  const visit = (s) => {
    state.set(s.id, 1);
    for (const pid of [...s.after]) {
      const p = byId.get(pid);
      if (state.get(pid) === 1) {
        s.after = s.after.filter((x) => x !== pid);
        p.succ = p.succ.filter((x) => x !== s.id);
      } else if (!state.has(pid)) visit(p);
    }
    state.set(s.id, 2);
  };
  for (const s of steps) if (!state.has(s.id)) visit(s);
  // Head = longest chain of work that must happen before this step finishes.
  const head = new Map();
  const headOf = (s) => {
    if (head.has(s.id)) return head.get(s.id);
    let m = 0;
    for (const p of s.after) m = Math.max(m, headOf(byId.get(p)));
    head.set(s.id, m + s.dur);
    return m + s.dur;
  };
  for (const s of steps) s.head = headOf(s);
  return { steps, byId };
}

function makeState(kitchen) {
  return {
    cooks: Array.from({ length: Math.max(1, kitchen.cooks | 0) }, () => new Int16Array(H + P).fill(-1)),
    load: new Array(Math.max(1, kitchen.cooks | 0)).fill(0),
    burners: new Uint8Array(H + P),
    ovens: (kitchen.ovens || []).map((o) => ({ slots: new Uint8Array(H + P), temp: new Int16Array(H + P), cap: Math.max(1, o.slots | 0) })),
  };
}

const idx = (t) => t + H; // t in [-H, P)

function freeCook(st, a, b, prefer) {
  if (b <= a) return -2; // no hands needed
  const byLoad = [...st.cooks.keys()].sort((x, y) => st.load[x] - st.load[y] || x - y);
  const order = prefer >= 0 ? [prefer, ...byLoad.filter((c) => c !== prefer)] : byLoad;
  for (const c of order) {
    const lane = st.cooks[c];
    let ok = true;
    for (let t = a; t < b; t++) if (lane[idx(t)] !== -1) { ok = false; break; }
    if (ok) return c;
  }
  return -1;
}

function ovenFits(o, a, b, temp, slots) {
  for (let t = a; t < b; t++) {
    const i = idx(t);
    if (o.temp[i] && o.temp[i] !== temp) return 'temp';
    if (o.slots[i] + slots > o.cap) return 'full';
  }
  for (let t = a - 1; t >= -H; t--) {
    const x = o.temp[idx(t)];
    if (!x) { if (a - 1 - t > 60) break; continue; }
    if (x !== temp && a - (t + 1) < rampMinutes(x, temp)) return 'ramp';
    break;
  }
  for (let t = b; t < P; t++) {
    const x = o.temp[idx(t)];
    if (!x) { if (t - b > 60) break; continue; }
    if (x !== temp && t - b < rampMinutes(temp, x)) return 'ramp';
    break;
  }
  return null;
}

// Try to place step s to end at e. Returns an assignment or a reason it failed.
function tryPlace(st, s, e, kitchen, preferCook) {
  const a = e - s.dur;
  if (a < -H) return { fail: 'horizon' };
  let cook = -2;
  if (s.hands > 0) {
    cook = freeCook(st, a, a + s.hands, preferCook);
    if (cook === -1) return { fail: 'cook' };
  }
  if (s.equip === 'burner') {
    if (!kitchen.burners) return { fail: 'noburner' };
    for (let t = a; t < e; t++) if (st.burners[idx(t)] >= kitchen.burners) return { fail: 'burner' };
  }
  let oven = -1;
  if (s.equip === 'oven') {
    if (!st.ovens.length) return { fail: 'nooven' };
    let why = 'oven-' + (s.slots > Math.max(...st.ovens.map((o) => o.cap)) ? 'toosmall' : 'full');
    for (let k = 0; k < st.ovens.length; k++) {
      if (s.slots > st.ovens[k].cap) continue;
      const r = ovenFits(st.ovens[k], a, e, s.temp, s.slots);
      if (!r) { oven = k; break; }
      why = 'oven-' + r;
    }
    if (oven < 0) return { fail: why };
  }
  return { a, e, cook, oven };
}

function commit(st, s, p) {
  if (p.cook >= 0) {
    for (let t = p.a; t < p.a + s.hands; t++) st.cooks[p.cook][idx(t)] = 0;
    st.load[p.cook] += s.hands;
  }
  if (s.equip === 'burner') for (let t = p.a; t < p.e; t++) st.burners[idx(t)]++;
  if (p.oven >= 0) {
    const o = st.ovens[p.oven];
    for (let t = p.a; t < p.e; t++) { o.slots[idx(t)] += s.slots; o.temp[idx(t)] = s.temp; }
  }
}

const IMPOSSIBLE = new Set(['noburner', 'nooven', 'oven-toosmall', 'horizon']);

function runOnce(flat, kitchen, rnd, params) {
  const { steps, byId } = flat;
  const st = makeState(kitchen);
  const placed = new Map();
  const remaining = new Map(steps.map((s) => [s.id, s.succ.length]));
  const noise = new Map(steps.map((s) => [s.id, rnd()]));
  const eligible = steps.filter((s) => !s.succ.length);
  const issues = [];

  while (eligible.length) {
    let best = -1, bestKey = -Infinity;
    for (let i = 0; i < eligible.length; i++) {
      const s = eligible[i];
      const L = s.succ.length ? Math.min(...s.succ.map((x) => placed.get(x).a)) : s.offset;
      const key = L - params.gamma * Math.min(s.hold, 90) + params.alpha * s.head + params.beta * noise.get(s.id) * 30;
      if (key > bestKey) { bestKey = key; best = i; }
    }
    const s = eligible.splice(best, 1)[0];
    const L = (s.succ.length ? Math.min(...s.succ.map((x) => placed.get(x).a)) : s.offset) - (params.shift?.get(s.id) || 0);
    const E = (s.succ.length ? Math.max(...s.succ.map((x) => placed.get(x).a)) : s.offset) - s.hold;
    const prefer = s.succ.length ? (placed.get(s.succ[0]).cook ?? -1) : -1;
    let p = null, firstFail = null;
    for (let e = L; e - s.dur >= -H; e--) {
      const r = tryPlace(st, s, e, kitchen, prefer);
      if (!r.fail) { p = r; break; }
      if (!firstFail) firstFail = r.fail;
      if (IMPOSSIBLE.has(r.fail)) break;
    }
    if (!p) {
      // Can't be done in this kitchen at all: place it without the resource and say so.
      p = { a: L - s.dur, e: L, cook: -2, oven: -1, impossible: firstFail };
      issues.push({ kind: 'impossible', step: s.id, reason: firstFail });
    } else commit(st, s, p);
    const late = Math.max(0, E - p.e);
    if (late > 0) issues.push({ kind: 'hold', step: s.id, minutes: late, reason: firstFail });
    placed.set(s.id, { ...p, late, blocked: firstFail, E });
    for (const pid of s.after) {
      remaining.set(pid, remaining.get(pid) - 1);
      if (!remaining.get(pid)) eligible.push(byId.get(pid));
    }
  }
  return { placed, st, issues };
}

function score(flat, run) {
  let viol = 0, start = 0, drift = 0, impossible = 0;
  for (const s of flat.steps) {
    const p = run.placed.get(s.id);
    viol += p.late;
    if (p.impossible) impossible++;
    start = Math.min(start, p.a);
    if (!s.succ.length) drift += s.offset - p.e;
  }
  let switches = 0;
  for (const o of run.st.ovens) {
    let last = 0;
    for (let i = 0; i < H + P; i++) if (o.temp[i] && o.temp[i] !== last) { if (last) switches++; last = o.temp[i]; }
  }
  return { total: impossible * 1e6 + viol * 1000 + -start * 3 + drift + switches * 6, viol, span: -start, drift, switches, impossible };
}

export function plan(menu, kitchen, opts = {}) {
  const flat = flatten(menu);
  if (!flat.steps.length) return emptyPlan(kitchen);
  const runs = opts.runs ?? 120;
  const rnd = mulberry(opts.seed ?? 0x5eed);
  let best = null;
  for (let r = 0; r < runs; r++) {
    const params = r === 0 ? { gamma: 1, alpha: 0, beta: 0 }
      : r === 1 ? { gamma: 0, alpha: 0.01, beta: 0 }
      : { gamma: rnd() * 1.5, alpha: (rnd() - 0.3) * 0.5, beta: rnd() };
    // Repair: a step that ran late because its successor sat as late as it
    // could gets that successor pulled earlier, within the successor's own slack.
    const shift = new Map();
    for (let pass = 0; pass < 4; pass++) {
      const run = runOnce(flat, kitchen, rnd, { ...params, shift });
      const sc = score(flat, run);
      if (!best || sc.total < best.score.total) best = { run, score: sc };
      if (!sc.viol) break;
      let moved = false;
      for (const st of flat.steps) {
        const p = run.placed.get(st.id);
        if (!p.late) continue;
        for (const x of st.succ) {
          const q = run.placed.get(x);
          const slack = q.e - q.E;
          const m = Math.min(p.late, slack);
          if (m > 0) { shift.set(x, (shift.get(x) || 0) + m); moved = true; }
        }
      }
      if (!moved) break;
    }
  }
  return build(flat, kitchen, best.run, best.score);
}

function emptyPlan(kitchen) {
  return { items: [], ovens: (kitchen.ovens || []).map(() => ({ blocks: [], preheats: [] })), burnerLanes: 0, issues: [], score: { total: 0, viol: 0, span: 0, drift: 0, switches: 0, impossible: 0 }, stats: { span: 0, start: 0, end: 0, handsOn: 0, idle: 0, cooks: [] } };
}

function build(flat, kitchen, run, sc) {
  const items = flat.steps.map((s) => {
    const p = run.placed.get(s.id);
    return {
      id: s.id, dish: s.dish, dishName: s.dishName, label: s.label, equip: s.equip, temp: s.temp, slots: s.slots,
      offset: s.offset, start: p.a, end: p.e, handsEnd: p.a + (p.cook === -2 && !p.impossible ? 0 : s.hands), hands: s.hands,
      cook: p.cook, oven: p.oven, late: p.late, hold: s.hold, impossible: p.impossible || null,
      blocked: p.blocked, after: s.after, succ: s.succ, final: !s.succ.length,
    };
  }).sort((x, y) => x.start - y.start || x.end - y.end);

  // Burner lanes by interval colouring, purely for display.
  const lanes = [];
  for (const it of items.filter((i) => i.equip === 'burner' && !i.impossible)) {
    let k = lanes.findIndex((end) => end <= it.start);
    if (k < 0) { k = lanes.length; lanes.push(0); }
    lanes[k] = it.end;
    it.burner = k;
  }

  const ovens = run.st.ovens.map((o) => {
    const blocks = [];
    for (let i = 0; i < H + P; i++) {
      const temp = o.temp[i];
      if (!temp) continue;
      const t = i - H;
      const last = blocks[blocks.length - 1];
      if (last && last.temp === temp && t - last.end <= 15) last.end = t + 1;
      else blocks.push({ start: t, end: t + 1, temp });
    }
    const preheats = blocks.map((b, k) => {
      const prev = blocks[k - 1];
      const from = prev ? prev.temp : AMBIENT;
      const len = rampMinutes(from, b.temp);
      const at = prev ? Math.max(prev.end, b.start - len) : b.start - len;
      return { at, ready: b.start, from, to: b.temp, kind: b.temp >= from ? 'heat' : 'cool' };
    }).filter((p) => p.ready > p.at);
    return { blocks, preheats, off: blocks.length ? blocks[blocks.length - 1].end : null };
  });

  const start = Math.min(0, ...items.map((i) => i.start), ...ovens.flatMap((o) => o.preheats.map((p) => p.at)));
  const end = Math.max(0, ...items.map((i) => i.end));
  const cooks = run.st.cooks.map((lane) => {
    let busy = 0, idle = 0, gap = 0;
    for (let t = start; t < end; t++) {
      if (lane[idx(t)] !== -1) { busy++; idle = Math.max(idle, gap); gap = 0; } else gap++;
    }
    return { busy, longestIdle: idle };
  });
  const issues = run.issues.map((x) => ({ ...x, item: items.find((i) => i.id === x.step) }));
  return {
    items, ovens, burnerLanes: lanes.length, issues, score: sc,
    stats: { start, end, span: -start, handsOn: items.reduce((n, i) => n + (i.handsEnd - i.start), 0), cooks },
  };
}

export const REASONS = {
  cook: 'every cook was busy',
  burner: 'every burner was in use',
  noburner: 'this kitchen has no burners',
  nooven: 'this kitchen has no oven',
  'oven-temp': 'the oven was at another temperature',
  'oven-full': 'the oven was full',
  'oven-ramp': 'the oven needed time to change temperature',
  'oven-toosmall': 'it needs more rack slots than any oven has',
  horizon: 'the plan would have to start more than a day early',
};

// What would help: try one extra of each resource and keep only real improvements.
export function whatIf(menu, kitchen, base, opts = {}) {
  const tries = [
    { label: '+1 cook', k: { ...kitchen, cooks: kitchen.cooks + 1 }, ok: kitchen.cooks < 4 },
    { label: '+1 burner', k: { ...kitchen, burners: kitchen.burners + 1 }, ok: kitchen.burners < 8 },
    { label: '+1 oven', k: { ...kitchen, ovens: [...kitchen.ovens, { name: 'Oven ' + (kitchen.ovens.length + 1), slots: 2 }] }, ok: kitchen.ovens.length < 3 },
    { label: '+1 rack slot', k: { ...kitchen, ovens: kitchen.ovens.map((o, i) => (i === 0 ? { ...o, slots: o.slots + 1 } : o)) }, ok: kitchen.ovens.length > 0 },
  ];
  const out = [];
  for (const t of tries) {
    if (!t.ok) continue;
    const p = plan(menu, t.k, { runs: opts.runs ?? 120, seed: opts.seed });
    const useful = base.score.span - p.score.span > 0 || base.score.viol - p.score.viol > 0 || base.score.impossible - p.score.impossible > 0;
    if (p.score.total < base.score.total && useful) {
      out.push({ label: t.label, kitchen: t.k, saved: base.score.span - p.score.span, fixed: base.score.viol - p.score.viol, impossibleFixed: base.score.impossible - p.score.impossible, delta: base.score.total - p.score.total });
    }
  }
  return out.sort((a, b) => b.delta - a.delta);
}

// Cues the cook needs to hear, in clock order: preheats, step starts, hand-offs, serve.
export function cues(p) {
  const out = [];
  p.ovens.forEach((o, k) => {
    for (const ph of o.preheats) out.push({ t: ph.at, kind: 'oven', oven: k, text: `${ph.kind === 'heat' ? 'Preheat' : 'Turn down'} oven ${k + 1} to ${ph.to} °C`, call: `${ph.kind === 'heat' ? 'Preheat' : 'Turn down'} the oven to ${ph.to}` });
    if (o.off != null) out.push({ t: o.off, kind: 'oven-off', oven: k, text: `Oven ${k + 1} off`, call: 'Oven off' });
  });
  for (const it of p.items) out.push({ t: it.start, kind: 'step', item: it, text: `${it.dishName}: ${it.label}`, call: `${it.dishName}. ${it.label}` });
  const courses = new Map();
  for (const it of p.items) if (it.final) {
    if (!courses.has(it.offset)) courses.set(it.offset, []);
    if (!courses.get(it.offset).includes(it.dishName)) courses.get(it.offset).push(it.dishName);
  }
  if (!courses.size) courses.set(0, []);
  for (const [t, names] of courses) {
    const what = t === 0 ? 'the main course' : names.join(', ');
    out.push({ t, kind: 'serve', names, text: t === 0 ? 'Serve' : `Serve ${names.join(', ')}`, call: `Service! ${what} to the table.` });
  }
  return out.sort((a, b) => a.t - b.t || (a.kind === 'oven' ? -1 : 1));
}
