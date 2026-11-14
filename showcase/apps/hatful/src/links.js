import { draw, isValid } from './engine.js';
import { sealOf } from './seal.js';

const PBKDF2_ITERATIONS = 120000;
const MODES = ['any', 'noswap', 'loop'];

const fail = (code, message) => Object.assign(new Error(message), { code });
const bad = (why = 'This link is damaged') => fail('BAD_TICKET', why);

function getSubtle() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw fail('NO_CRYPTO', 'Web Crypto is unavailable (needs a secure context)');
  return subtle;
}

function b64uEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Rejects non-canonical text, so a character that only changes unused padding bits still counts as damage.
function b64uDecode(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw bad();
  let bin;
  try {
    bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  } catch {
    throw bad();
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (b64uEncode(bytes) !== text) throw bad();
  return bytes;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(...chunks) {
  let c = 0xffffffff;
  for (const bytes of chunks) for (const x of bytes) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = (s) => new TextEncoder().encode(s);
const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function keyFromPin(pin, salt, usages) {
  const subtle = getSubtle();
  const base = await subtle.importKey('raw', utf8(pin), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 128 },
    false,
    usages
  );
}

const normPin = (pin) => (pin === undefined || pin === null ? '' : String(pin).trim());

export async function makeTicket(payload, pin) {
  const subtle = getSubtle();
  const pinText = normPin(pin);
  const iv = randomBytes(12);
  const secret = randomBytes(16);
  const key = pinText
    ? await keyFromPin(pinText, secret, ['encrypt'])
    : await subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['encrypt']);
  const sealed = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, utf8(JSON.stringify(payload)))
  );
  const head = `${pinText ? 'p' : 'k'}.${b64uEncode(secret)}.${b64uEncode(iv)}.`;
  // The checksum lets a damaged link be told apart from a wrong PIN.
  const crc = crc32(utf8(head), sealed);
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, crc);
  const body = new Uint8Array(sealed.length + 4);
  body.set(sealed);
  body.set(tail, sealed.length);
  return `h1.${head}${b64uEncode(body)}`;
}

function parse(ticket) {
  if (typeof ticket !== 'string') throw bad();
  const parts = ticket.trim().replace(/^#/, '').split('.');
  if (parts.length !== 5 || parts[0] !== 'h1' || (parts[1] !== 'k' && parts[1] !== 'p')) throw bad();
  const secret = b64uDecode(parts[2]);
  const iv = b64uDecode(parts[3]);
  const body = b64uDecode(parts[4]);
  if (secret.length !== 16 || iv.length !== 12 || body.length < 20) throw bad();
  const sealed = body.subarray(0, body.length - 4);
  const stored = new DataView(body.buffer, body.byteOffset + body.length - 4, 4).getUint32(0);
  if (crc32(utf8(`${parts[1]}.${parts[2]}.${parts[3]}.`), sealed) !== stored) throw bad();
  return { needsPin: parts[1] === 'p', secret, iv, sealed };
}

export function ticketNeedsPin(ticket) {
  try {
    return typeof ticket === 'string' && ticket.trim().replace(/^#/, '').split('.')[1] === 'p';
  } catch {
    return false;
  }
}

export async function openTicket(ticket, pin) {
  const { needsPin, secret, iv, sealed } = parse(ticket);
  const pinText = normPin(pin);
  if (needsPin && !pinText) throw fail('NEED_PIN', 'This slip is protected by a PIN');
  const subtle = getSubtle();
  const key = needsPin
    ? await keyFromPin(pinText, secret, ['decrypt'])
    : await subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['decrypt']);
  let plain;
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, sealed);
  } catch {
    throw needsPin ? fail('BAD_PIN', 'That PIN does not open this slip') : bad();
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw bad();
  }
  if (!payload || typeof payload !== 'object') throw bad();
  return payload;
}

const badEnvelope = (why) => fail('BAD_ENVELOPE', why);
const isStr = (x) => typeof x === 'string';

export function makeEnvelope(event) {
  if (!event?.draw) throw fail('NO_DRAW', 'There is no draw to export yet');
  const { seed, assignment, seal, at } = event.draw;
  return JSON.parse(
    JSON.stringify({
      v: 1,
      kind: 'hatful-envelope',
      event: {
        id: event.id,
        title: event.title,
        date: event.date,
        budget: event.budget,
        note: event.note,
        mode: event.mode,
        people: event.people,
        bans: event.bans,
        usePin: Boolean(event.usePin),
      },
      draw: { seed, assignment, seal, at: at ?? null },
    })
  );
}

export function readEnvelope(json) {
  let o = json;
  if (isStr(json)) {
    try {
      o = JSON.parse(json);
    } catch {
      throw badEnvelope('This file is not valid JSON');
    }
  }
  if (!o || typeof o !== 'object' || o.v !== 1 || o.kind !== 'hatful-envelope') {
    throw badEnvelope('This is not a Hatful envelope');
  }
  const ev = o.event;
  if (!ev || typeof ev !== 'object' || !Array.isArray(ev.people) || !Array.isArray(ev.bans)) {
    throw badEnvelope('The envelope has no event');
  }
  if (!MODES.includes(ev.mode)) throw badEnvelope('The envelope has an unknown mode');
  const ids = new Set();
  const people = ev.people.map((p) => {
    if (!p || !isStr(p.id) || !p.id || !isStr(p.name) || !p.name || ids.has(p.id)) {
      throw badEnvelope('The envelope has a bad people list');
    }
    ids.add(p.id);
    return { id: p.id, name: p.name, group: isStr(p.group) && p.group ? p.group : null, hint: isStr(p.hint) ? p.hint : '' };
  });
  const bans = ev.bans.map((b) => {
    if (!b || !isStr(b.from) || !isStr(b.to)) throw badEnvelope('The envelope has a bad ban list');
    return { from: b.from, to: b.to };
  });
  const d = o.draw;
  if (!d || !isStr(d.seed) || !isStr(d.seal) || !d.assignment || typeof d.assignment !== 'object') {
    throw badEnvelope('The envelope has no draw');
  }
  const keys = Object.keys(d.assignment);
  const taken = new Set();
  for (const k of keys) {
    const r = d.assignment[k];
    if (!ids.has(k) || !isStr(r) || !ids.has(r) || taken.has(r)) throw badEnvelope('The envelope has a bad assignment');
    taken.add(r);
  }
  if (keys.length !== ids.size) throw badEnvelope('The envelope assignment is incomplete');
  const str = (x) => (isStr(x) ? x : '');
  return {
    v: 1,
    kind: 'hatful-envelope',
    event: {
      id: str(ev.id),
      title: str(ev.title),
      date: str(ev.date),
      budget: str(ev.budget),
      note: str(ev.note),
      mode: ev.mode,
      people,
      bans,
      usePin: Boolean(ev.usePin),
    },
    draw: { seed: d.seed, assignment: { ...d.assignment }, seal: d.seal, at: d.at ?? null },
  };
}

// Extra: the "Verify" button. Checks rules, seal and that the seed reproduces the same draw.
export async function verifyEnvelope(envelope) {
  const env = readEnvelope(envelope);
  const event = { ...env.event, draw: null };
  const { seed, assignment, seal } = env.draw;
  const validAssignment = isValid(event, assignment);
  const computedSeal = await sealOf(event, assignment, seed);
  const sealMatches = computedSeal === seal;
  let reproducible = false;
  try {
    const again = draw(event, seed).assignment;
    reproducible = Object.keys(assignment).every((g) => again[g] === assignment[g]);
  } catch {
    reproducible = false;
  }
  return { ok: validAssignment && sealMatches && reproducible, validAssignment, sealMatches, reproducible, computedSeal };
}
