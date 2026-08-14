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

const ENGINE = '../js/engine.js';
const BOT = '../js/bot.js';

const ROOM_TTL_SECONDS = 2 * 60 * 60;
const AWAY_AFTER_MS = 25_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O — they read as 1 and 0

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
async function mutate(code, apply) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const raw = await readRaw(code);
    if (!raw) return { error: 'Room not found', status: 404 };

    const room = JSON.parse(raw);
    const outcome = apply(room);
    if (outcome && outcome.error) return outcome;

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

  try {
    if (action === 'health') {
      return send(200, { ok: true, store: hasRedis ? 'redis' : 'memory' });
    }

    /* create ------------------------------------------------------------- */
    if (action === 'create') {
      const name = String(body.name || 'Player').slice(0, 12);
      const seed = (Math.random() * 2 ** 31) | 0;

      for (let attempt = 0; attempt < 6; attempt++) {
        const code = randomCode();
        const room = engine.createRoom(code, seed);

        // Every seat is filled from the start — three bots that real players
        // replace as they arrive. There is no lobby to wait in.
        room.seats[0].kind = 'human';
        room.seats[0].name = name;
        room.seats[0].id = randomToken();
        room.seats[0].token = randomToken();
        room.seats[0].lastSeen = Date.now();
        for (let i = 1; i < 4; i++) {
          room.seats[i].kind = 'bot';
          room.seats[i].difficulty = 'sharp';
          room.seats[i].name = bot.botName(seed + i * 977);
        }

        engine.startHand(room, seed);
        room.botAt = Date.now() + 900;

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
        // Prefer a seat nobody is using; an away human's seat is not up for
        // grabs, since they may be coming back.
        const seat = room.seats.find((s) => s.kind === 'bot');
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
        seat.lastSeen = Date.now();
        seat.away = false;
        markAway(room);
        advanceBots(room, engine, bot);
        return null;
      });

      if (outcome.error) return send(outcome.status || 400, { error: outcome.error });
      return send(200, engine.redact(outcome.room, seatIndex));
    }

    /* play / pass / next / leave ----------------------------------------- */
    if (action === 'play' || action === 'pass' || action === 'next' || action === 'leave') {
      const code = String(body.code || '').toUpperCase();
      const seatIndex = Number(body.seat);
      const token = body.token;

      const outcome = await mutate(code, (room) => {
        const seat = authenticate(room, seatIndex, token);
        if (!seat) return { error: 'Not your seat', status: 403 };
        seat.lastSeen = Date.now();
        seat.away = false;

        if (action === 'leave') {
          // Hand the seat back to a bot so the other three keep playing.
          seat.kind = 'bot';
          seat.token = null;
          seat.id = null;
          seat.away = false;
          seat.name = bot.botName(room.seed + seat.index * 977);
          return null;
        }

        if (action === 'next') {
          if (room.phase !== 'done') return { error: 'Hand is still in progress', status: 409 };
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
