// Capsa online rooms — a single Vercel serverless function.
//
// The client sends intents ("play these cards", "pass"); this re-validates every
// one against the same rules engine the browser imports, so the server is the
// only authority on what actually happened. Opponent hands are stripped out of
// every response, so there is nothing for a modified client to read.
//
// Written as CommonJS with a dynamic import of the ESM engine: this folder has
// no package.json, and adding one purely to switch module systems would change
// how Vercel treats the project.

const crypto = require('node:crypto');

const ENGINE = '../js/engine.js';
const BOT = '../js/bot.js';

const ROOM_TTL_SECONDS = 2 * 60 * 60;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const PBKDF2_ROUNDS = 120_000;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 10;
const AWAY_AFTER_MS = 25_000;
// How often a polling seat rewrites its lastSeen. Must stay well under
// AWAY_AFTER_MS, or a present player would be declared away between beats.
const HEARTBEAT_MS = 10_000;
// Validated sessions are held on the instance for this long. Short enough that
// a sign-out takes effect promptly, long enough that a poll does not spend a
// store command re-reading the same token every second.
const SESSION_CACHE_MS = 30_000;

// Shared, role-based credentials — a gate into the game rather than per-person
// accounts. Players still type a display name when they join a room. Seeded
// once into the store, after which the admin owns them; see README.
const DEFAULT_CREDENTIALS = {
  player: { username: 'user', password: process.env.CAPSA_PLAYER_PASSWORD || 'magang124' },
  admin: { username: 'admin', password: process.env.CAPSA_ADMIN_PASSWORD || 'p455w0rd' },
};
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O — they read as 1 and 0
const DIFFICULTIES = ['casual', 'sharp', 'ruthless'];

/* ── Storage ─────────────────────────────────────────────────────────────── */

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasRedis = Boolean(REDIS_URL && REDIS_TOKEN);

// Fallback so the API works locally and on a single instance with no store
// configured. It does not survive across serverless instances, which is why
// /health reports which backend is live.
const memory = new Map();

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

const key = (code) => `capsa:room:${code}`;

// Generic helpers, used by the auth records and sessions. ttlSeconds of 0 means
// "keep indefinitely" — credentials must outlive any session.
async function kvGet(k) {
  if (!hasRedis) return memory.get(k) || null;
  return (await redis(['GET', k])) || null;
}

async function kvSet(k, value, ttlSeconds = 0) {
  if (!hasRedis) {
    memory.set(k, value);
    return;
  }
  await redis(ttlSeconds > 0 ? ['SET', k, value, 'EX', String(ttlSeconds)] : ['SET', k, value]);
}

async function kvDel(k) {
  if (!hasRedis) {
    memory.delete(k);
    return;
  }
  await redis(['DEL', k]);
}

async function kvCountFailure(k) {
  if (!hasRedis) {
    const next = (Number(memory.get(k)) || 0) + 1;
    memory.set(k, String(next));
    return next;
  }
  const next = await redis(['INCR', k]);
  if (next === 1) await redis(['EXPIRE', k, String(LOGIN_WINDOW_SECONDS)]);
  return next;
}

async function readRaw(code) {
  if (!hasRedis) return memory.get(key(code)) || null;
  return (await redis(['GET', key(code)])) || null;
}

async function writeIfAbsent(code, raw) {
  if (!hasRedis) {
    if (memory.has(key(code))) return false;
    memory.set(key(code), raw);
    return true;
  }
  const result = await redis(['SET', key(code), raw, 'NX', 'EX', String(ROOM_TTL_SECONDS)]);
  return result === 'OK';
}

// Compare-and-set. Two players acting on the same tick cannot interleave into a
// corrupted room: the loser of the race re-reads and retries.
const CAS_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
  "redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) return 1 else return 0 end";

async function writeIfUnchanged(code, expected, raw) {
  if (!hasRedis) {
    if (memory.get(key(code)) !== expected) return false;
    memory.set(key(code), raw);
    return true;
  }
  const result = await redis([
    'EVAL', CAS_SCRIPT, '1', key(code), expected, raw, String(ROOM_TTL_SECONDS),
  ]);
  return result === 1;
}

/* ── Authentication ──────────────────────────────────────────────────────── */

// Passwords are never stored — only a PBKDF2 digest with a per-record salt.
// Nothing kept here can be turned back into the original password.
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(String(password), salt, PBKDF2_ROUNDS, 32, 'sha256')
    .toString('hex');
  return { salt, hash };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const { hash } = hashPassword(password, record.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(record.hash, 'hex');
  // Constant-time: a near-miss must not be detectable by how long this takes.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const AUTH_KEY = 'capsa:auth';
const sessionKey = (token) => `capsa:session:${token}`;
const failureKey = (ip) => `capsa:login-fail:${ip}`;

function seedCredentials() {
  const seeded = {};
  for (const [role, { username, password }] of Object.entries(DEFAULT_CREDENTIALS)) {
    seeded[role] = { username, ...hashPassword(password) };
  }
  return seeded;
}

// Credentials live in the store so an admin can change them at runtime. On a
// cold store the documented defaults are written once; after that the admin
// owns them and redeploying will not reset anything.
async function loadCredentials() {
  const raw = await kvGet(AUTH_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.player && parsed.admin) return parsed;
    } catch { /* unreadable record — fall through and reseed */ }
  }
  const seeded = seedCredentials();
  await kvSet(AUTH_KEY, JSON.stringify(seeded));
  return seeded;
}

async function createSession(role, username) {
  const token = crypto.randomBytes(24).toString('base64url');
  await kvSet(
    sessionKey(token),
    JSON.stringify({ role, username, at: Date.now() }),
    SESSION_TTL_SECONDS,
  );
  return token;
}

// Per-instance, so a sign-out elsewhere can linger here until the entry
// expires. That is the trade: these are shared role credentials guarding a card
// game, and re-reading the token on every poll is what made the store bill.
const sessionCache = new Map();

function cacheSession(token, session) {
  if (sessionCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of sessionCache) if (v.until <= now) sessionCache.delete(k);
  }
  sessionCache.set(token, { session, until: Date.now() + SESSION_CACHE_MS });
}

async function readSession(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;

  const cached = sessionCache.get(token);
  if (cached && cached.until > Date.now()) return cached.session;

  const raw = await kvGet(sessionKey(token));
  let session = null;
  if (raw) {
    try {
      session = JSON.parse(raw);
    } catch {
      session = null;
    }
  }
  cacheSession(token, session);
  return session;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* ── Room helpers ────────────────────────────────────────────────────────── */

function randomCode() {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function randomToken() {
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 2 ** 32).toString(36),
  ).join('');
}

// Bots move inside whatever request happens to arrive. There is no background
// worker and no dependence on the room's creator keeping a tab open, so a bot
// can never be the reason a table stalls.
function advanceBots(room, engine, bot) {
  const now = Date.now();
  let moved = false;

  for (let guard = 0; guard < 8; guard++) {
    if (room.phase !== 'playing') break;
    const seat = room.seats[room.turn];
    const autopilot = seat.kind === 'bot' || seat.away;
    if (!autopilot) break;
    if (now < (room.botAt || 0)) break;

    const move = bot.chooseMove(
      {
        you: room.turn,
        hand: seat.hand,
        current: room.current,
        mustInclude: room.mustInclude,
        seats: room.seats.map((s) => ({ index: s.index, handCount: s.hand.length })),
        played: room.played,
      },
      seat.difficulty || 'sharp',
    );

    const result = move.pass
      ? engine.applyPass(room, room.turn)
      : engine.applyPlay(room, room.turn, move.cards);

    // Falling back to a pass keeps the table moving if a policy ever returns
    // something the engine rejects.
    if (!result.ok && room.current) engine.applyPass(room, room.turn);

    room.botAt = Date.now() + 600 + Math.floor(Math.random() * 700);
    moved = true;
  }
  return moved;
}

function markAway(room) {
  const now = Date.now();
  let changed = false;
  for (const seat of room.seats) {
    if (seat.kind !== 'human') continue;
    const away = now - (seat.lastSeen || 0) > AWAY_AFTER_MS;
    if (away !== seat.away) {
      seat.away = away;
      changed = true;
    }
  }
  return changed;
}

// Read → mutate → compare-and-set, retrying when another request wins the race.
//
// `apply` may return { skip: true } to mean "nothing changed, do not write".
// That matters more than it sounds: polling is by far the commonest request,
// and without an escape hatch every poll would be a write — burning a store
// command per poll and bumping the version, which makes every client redraw a
// table that did not move.
async function mutate(code, apply) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = await readRaw(code);
    if (!raw) return { error: 'Room not found', status: 404 };

    const room = JSON.parse(raw);
    const outcome = apply(room);
    if (outcome && outcome.error) return outcome;
    if (outcome && outcome.skip) return { room, result: outcome };

    room.version = (room.version || 1) + 1;
    room.updatedAt = Date.now();

    if (await writeIfUnchanged(code, raw, JSON.stringify(room))) {
      return { room, result: outcome };
    }
  }
  return { error: 'Room is busy — try again', status: 409 };
}

function authenticate(room, seatIndex, token) {
  const seat = room.seats[seatIndex];
  if (!seat || seat.token !== token) return null;
  return seat;
}

/* ── Handler ─────────────────────────────────────────────────────────────── */

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const engine = await import(ENGINE);
  const bot = await import(BOT);

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const action = url.searchParams.get('action');
  const body = req.method === 'POST' ? await readBody(req) : {};

  const send = (status, payload) => res.status(status).json(payload);

  // The gate credential, kept separate from the per-seat room token so the two
  // can never be confused for one another.
  const authToken = body.auth || url.searchParams.get('auth');

  try {
    if (action === 'health') {
      return send(200, { ok: true, store: hasRedis ? 'redis' : 'memory', auth: true });
    }

    /* auth --------------------------------------------------------------- */
    if (action === 'login') {
      const ip = clientIp(req);
      const failures = Number(await kvGet(failureKey(ip))) || 0;
      if (failures >= LOGIN_MAX_FAILURES) {
        return send(429, { error: 'Too many attempts — wait a few minutes and try again' });
      }

      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const credentials = await loadCredentials();

      // Check every role rather than trusting a role the client claims.
      const role = ['admin', 'player'].find(
        (r) => credentials[r].username.toLowerCase() === username.toLowerCase()
          && verifyPassword(password, credentials[r]),
      );

      if (!role) {
        await kvCountFailure(failureKey(ip));
        // Deliberately vague: revealing which half was wrong helps an attacker
        // confirm a valid username.
        return send(401, { error: 'Wrong username or password' });
      }

      await kvDel(failureKey(ip));
      const token = await createSession(role, credentials[role].username);
      return send(200, { token, role, username: credentials[role].username });
    }

    if (action === 'me') {
      const session = await readSession(authToken);
      if (!session) return send(401, { error: 'Not signed in' });
      const credentials = await loadCredentials();
      return send(200, {
        role: session.role,
        username: session.username,
        playerUsername: credentials.player.username,
        adminUsername: credentials.admin.username,
      });
    }

    if (action === 'logout') {
      if (authToken) {
        sessionCache.delete(authToken);
        await kvDel(sessionKey(authToken));
      }
      return send(200, { ok: true });
    }

    // Admins set the shared player credentials, and may rotate their own.
    if (action === 'set-credentials') {
      const session = await readSession(authToken);
      if (!session) return send(401, { error: 'Not signed in' });
      if (session.role !== 'admin') return send(403, { error: 'Admins only' });

      const target = body.target === 'admin' ? 'admin' : 'player';
      const credentials = await loadCredentials();
      const nextUsername = String(body.username ?? credentials[target].username).trim();
      const nextPassword = body.password === undefined ? null : String(body.password);

      if (nextUsername.length < 3 || nextUsername.length > 24) {
        return send(400, { error: 'Username must be 3–24 characters' });
      }
      if (!/^[A-Za-z0-9._-]+$/.test(nextUsername)) {
        return send(400, { error: 'Username can use letters, numbers, dot, dash and underscore' });
      }
      const other = target === 'admin' ? 'player' : 'admin';
      if (nextUsername.toLowerCase() === credentials[other].username.toLowerCase()) {
        return send(409, { error: 'That username is already used by the other role' });
      }
      if (nextPassword !== null && nextPassword.length < 6) {
        return send(400, { error: 'Password must be at least 6 characters' });
      }

      credentials[target] = {
        username: nextUsername,
        ...(nextPassword !== null
          ? hashPassword(nextPassword)
          : { salt: credentials[target].salt, hash: credentials[target].hash }),
      };
      await kvSet(AUTH_KEY, JSON.stringify(credentials));

      return send(200, {
        ok: true,
        target,
        username: nextUsername,
        passwordChanged: nextPassword !== null,
      });
    }

    // Everything past this point is the game itself, and needs a valid session.
    // Enforcing it here rather than in the UI is the point: a static page can
    // never gate itself, but the server can refuse to answer.
    const session = await readSession(authToken);
    if (!session) return send(401, { error: 'Sign in to play' });

    /* create ------------------------------------------------------------- */
    if (action === 'create') {
      const name = String(body.name || 'Player').slice(0, 12);
      const seed = (Math.random() * 2 ** 31) | 0;

      for (let attempt = 0; attempt < 6; attempt++) {
        const code = randomCode();
        const room = engine.createRoom(code, seed);

        // The room opens as a lobby. Seat 0 is the host; the rest stay empty
        // until people join, and whatever is still empty when the host starts
        // becomes a bot. Nothing is dealt until then.
        room.hostSeat = 0;
        room.seats[0].kind = 'human';
        room.seats[0].name = name;
        room.seats[0].id = randomToken();
        room.seats[0].token = randomToken();
        room.seats[0].lastSeen = Date.now();
        for (let i = 1; i < 4; i++) {
          room.seats[i].kind = 'empty';
          room.seats[i].name = `Seat ${i + 1}`;
        }

        if (await writeIfAbsent(code, JSON.stringify(room))) {
          return send(200, { code, seat: 0, token: room.seats[0].token });
        }
      }
      return send(503, { error: 'Could not allocate a room code' });
    }

    /* join --------------------------------------------------------------- */
    if (action === 'join') {
      const code = String(body.code || '').toUpperCase();
      const name = String(body.name || 'Player').slice(0, 12);
      let assigned = null;

      const outcome = await mutate(code, (room) => {
        // In a lobby you take a seat nobody has claimed. Once the hand is
        // running there are no empty seats left, so you take over a bot
        // instead. An away human's seat is never up for grabs — they may be
        // coming back.
        const wanted = room.phase === 'lobby' ? 'empty' : 'bot';
        const seat = room.seats.find((s) => s.kind === wanted);
        if (!seat) return { error: 'Room is full', status: 409 };
        seat.kind = 'human';
        seat.name = name;
        seat.id = randomToken();
        seat.token = randomToken();
        seat.lastSeen = Date.now();
        seat.away = false;
        assigned = seat;
        return null;
      });

      if (outcome.error) return send(outcome.status || 400, { error: outcome.error });
      return send(200, { code, seat: assigned.index, token: assigned.token });
    }

    /* state -------------------------------------------------------------- */
    if (action === 'state') {
      const code = String(url.searchParams.get('code') || '').toUpperCase();
      const seatIndex = Number(url.searchParams.get('seat'));
      const token = url.searchParams.get('token');

      const outcome = await mutate(code, (room) => {
        const seat = authenticate(room, seatIndex, token);
        if (!seat) return { error: 'Not your seat', status: 403 };

        // Writing lastSeen on every poll would turn a read into a write. It is
        // only ever compared against AWAY_AFTER_MS, so refreshing it at a
        // fraction of that is just as accurate and costs far less.
        const now = Date.now();
        let changed = false;
        if (seat.away || now - (seat.lastSeen || 0) > HEARTBEAT_MS) {
          seat.lastSeen = now;
          seat.away = false;
          changed = true;
        }

        if (markAway(room)) changed = true;
        if (advanceBots(room, engine, bot)) changed = true;
        return changed ? null : { skip: true };
      });

      if (outcome.error) return send(outcome.status || 400, { error: outcome.error });
      return send(200, engine.redact(outcome.room, seatIndex));
    }

    /* play / pass / next / leave ----------------------------------------- */
    if (
      action === 'play' ||
      action === 'pass' ||
      action === 'next' ||
      action === 'newgame' ||
      action === 'start' ||
      action === 'set-mode' ||
      action === 'leave'
    ) {
      const code = String(body.code || '').toUpperCase();
      const seatIndex = Number(body.seat);
      const token = body.token;

      const outcome = await mutate(code, (room) => {
        const seat = authenticate(room, seatIndex, token);
        if (!seat) return { error: 'Not your seat', status: 403 };
        seat.lastSeen = Date.now();
        seat.away = false;

        if (action === 'leave') {
          seat.token = null;
          seat.id = null;
          seat.away = false;
          if (room.phase === 'lobby') {
            // Nothing has been dealt, so the seat simply frees up again.
            seat.kind = 'empty';
            seat.name = `Seat ${seat.index + 1}`;
          } else {
            // Mid-hand the cards still have to be played, so a bot takes over
            // and the other three keep going.
            seat.kind = 'bot';
            seat.name = bot.botName(room.seed + seat.index * 977);
          }
          // A room whose host walked away must not be left unable to start.
          if (room.hostSeat === seat.index) {
            const heir = room.seats.find((s) => s.kind === 'human' && s.index !== seat.index);
            if (heir) room.hostSeat = heir.index;
          }
          return null;
        }

        // The host picks the rule set in the lobby; persisting it means the
        // other players can see which one they are about to play.
        if (action === 'set-mode') {
          if (room.hostSeat !== seatIndex) {
            return { error: 'Only the host can change the rules', status: 403 };
          }
          if (room.phase === 'playing') {
            return { error: 'Finish the hand first', status: 409 };
          }
          if (!Object.values(engine.MODES).includes(body.mode)) {
            return { error: 'Unknown rule set', status: 400 };
          }
          room.mode = body.mode;
          return null;
        }

        if (action === 'start') {
          if (room.hostSeat !== seatIndex) {
            return { error: 'Only the host can start the game', status: 403 };
          }
          if (room.phase !== 'lobby') return { error: 'Game already started', status: 409 };

          if (Object.values(engine.MODES).includes(body.mode)) room.mode = body.mode;
          const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : 'sharp';
          for (const s of room.seats) {
            if (s.kind !== 'empty') continue;
            s.kind = 'bot';
            s.difficulty = difficulty;
            s.name = bot.botName(room.seed + s.index * 977);
          }
          engine.startHand(room, (Math.random() * 2 ** 31) | 0);
          room.botAt = Date.now() + 900;
          return null;
        }

        if (action === 'next') {
          if (room.hostSeat !== seatIndex) {
            return { error: 'Only the host can deal the next hand', status: 403 };
          }
          if (room.phase !== 'done') return { error: 'Hand is still in progress', status: 409 };
          engine.startHand(room, (Math.random() * 2 ** 31) | 0);
          room.botAt = Date.now() + 900;
          return null;
        }

        // Same seats, scores back to zero — used to start a fresh match without
        // everyone having to leave and re-share a new room code.
        if (action === 'newgame') {
          if (room.hostSeat !== seatIndex) {
            return { error: 'Only the host can start a new game', status: 403 };
          }
          if (room.phase === 'playing') {
            return { error: 'Finish the hand first', status: 409 };
          }
          engine.resetScores(room);
          engine.startHand(room, (Math.random() * 2 ** 31) | 0);
          room.botAt = Date.now() + 900;
          return null;
        }

        const result =
          action === 'pass'
            ? engine.applyPass(room, seatIndex)
            : engine.applyPlay(room, seatIndex, Array.isArray(body.cards) ? body.cards : []);

        if (!result.ok) return { error: result.error, status: 400 };

        room.botAt = Date.now() + 500;
        advanceBots(room, engine, bot);
        return null;
      });

      if (outcome.error) return send(outcome.status || 400, { error: outcome.error });
      return send(200, engine.redact(outcome.room, seatIndex));
    }

    return send(400, { error: 'Unknown action' });
  } catch (err) {
    return send(500, { error: err.message || 'Server error' });
  }
};
