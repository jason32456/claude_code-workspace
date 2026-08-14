// Sign-in for the game gate.
//
// These are shared, role-based credentials — one set for players, one for the
// admin — not per-person accounts. A player still types a display name when
// they create or join a room; this only decides who may reach the game at all.
//
// The gate is enforced by the server: every room endpoint requires the session
// token issued here. That matters, because a static page cannot police itself —
// anyone can read its JavaScript. Hiding the menu is a convenience; the server
// refusing to answer is the actual control.

const API = '/api/capsa';
const TOKEN_KEY = 'capsa:auth-token';

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

export function storedToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function keepToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode — the session just won't survive a reload */ }
}

export async function login(username, password) {
  const result = await call('login', { method: 'POST', body: { username, password } });
  keepToken(result.token);
  return result;
}

// Resume a previous session, if the server still recognises it.
export async function currentUser() {
  const token = storedToken();
  if (!token) return null;
  try {
    return await call('me', { params: { auth: token } });
  } catch {
    keepToken('');
    return null;
  }
}

export async function logout() {
  const token = storedToken();
  keepToken('');
  if (token) await call('logout', { method: 'POST', body: { auth: token } }).catch(() => {});
}

/**
 * Admin only. Omit `password` to rename without changing it.
 * @param {'player'|'admin'} target
 */
export async function setCredentials(target, username, password) {
  return call('set-credentials', {
    method: 'POST',
    body: {
      auth: storedToken(),
      target,
      username,
      ...(password ? { password } : {}),
    },
  });
}
