// Online room client.
//
// Vercel functions cannot hold a socket open, so this polls — adaptively.
// Capsa is turn-based with think-times in seconds, so ~1s of latency is
// invisible in play, and polling survives sleeping phones and flaky mobile
// networks far better than a socket would.

const API = '/api/capsa';

const POLL_LIVE = 900;
const POLL_IDLE = 2500;
const SEAT_KEY = 'capsa:seat';

async function call(action, { method = 'GET', body = null, params = {} } = {}) {
  const url = new URL(API, location.origin);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned ${res.status}`);
  }
  if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
  return data;
}

// Is there an API behind this page at all? When the app is served from a plain
// static host there is not, and the menu says so instead of failing later.
export async function probeServer() {
  try {
    const res = await Promise.race([
      call('health'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    return { online: true, store: res.store || 'memory' };
  } catch {
    return { online: false, store: null };
  }
}

export async function createRoom(name) {
  return call('create', { method: 'POST', body: { name } });
}

export async function joinRoom(code, name) {
  return call('join', { method: 'POST', body: { code, name } });
}

export function rememberSeat(seat) {
  try {
    sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
  } catch { /* private mode — reconnect just won't be offered */ }
}

export function recallSeat() {
  try {
    return JSON.parse(sessionStorage.getItem(SEAT_KEY) || 'null');
  } catch {
    return null;
  }
}

export function forgetSeat() {
  try {
    sessionStorage.removeItem(SEAT_KEY);
  } catch { /* nothing to clean up */ }
}

/**
 * @param {{code:string, seat:number, token:string}} credentials
 */
export function createNetSession(credentials) {
  const { code, seat, token } = credentials;
  const listeners = new Set();
  const errorListeners = new Set();

  let latest = null;
  let timer = null;
  let alive = true;
  let inFlight = false;
  let failures = 0;

  const auth = { code, seat, token };

  function emit() {
    for (const fn of listeners) fn(latest);
  }

  function nextDelay() {
    if (!latest) return POLL_LIVE;
    // Back off hard while the network is unhappy rather than hammering it.
    if (failures > 0) return Math.min(POLL_IDLE * 2 ** failures, 15000);
    return latest.phase === 'playing' ? POLL_LIVE : POLL_IDLE;
  }

  function arm() {
    clearTimeout(timer);
    if (!alive) return;
    timer = setTimeout(poll, nextDelay());
  }

  async function poll() {
    if (!alive || inFlight || document.hidden) return arm();
    inFlight = true;
    try {
      const view = await call('state', { params: auth });
      failures = 0;
      // Only wake the UI when something actually moved, so a player's card
      // selection is not rebuilt underneath their thumb every second.
      if (!latest || view.version !== latest.version) {
        latest = view;
        emit();
      }
    } catch (err) {
      failures = Math.min(failures + 1, 4);
      if (failures >= 3) for (const fn of errorListeners) fn(err);
    } finally {
      inFlight = false;
      arm();
    }
  }

  // A phone coming back from sleep should refresh immediately, not after a
  // full idle interval.
  const onVisible = () => {
    if (!document.hidden) {
      clearTimeout(timer);
      poll();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  async function send(action, extra = {}) {
    try {
      const view = await call(action, { method: 'POST', body: { ...auth, ...extra } });
      failures = 0;
      latest = view;
      emit();
      arm();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  poll();

  return {
    kind: 'net',
    code,
    get view() {
      return latest;
    },
    play(cards) {
      return send('play', { cards });
    },
    pass() {
      return send('pass');
    },
    nextHand() {
      return send('next');
    },
    start(difficulty) {
      return send('start', { difficulty });
    },
    subscribe(fn) {
      listeners.add(fn);
      if (latest) fn(latest);
      return () => listeners.delete(fn);
    },
    onError(fn) {
      errorListeners.add(fn);
      return () => errorListeners.delete(fn);
    },
    leave() {
      alive = false;
      clearTimeout(timer);
      listeners.clear();
      errorListeners.clear();
      document.removeEventListener('visibilitychange', onVisible);
      // Best-effort: tell the room the seat is free.
      call('leave', { method: 'POST', body: auth }).catch(() => {});
      forgetSeat();
    },
  };
}
