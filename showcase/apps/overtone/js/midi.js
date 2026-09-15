// Standard MIDI File (SMF) type 0 writer, and a reader used only to verify it.
//
// This is the repo's first export whose value is its meaning rather than its
// pixels: a PNG is a picture of what you already saw, whereas this opens in a
// DAW and plays. That makes correctness matter in a way a screenshot does not,
// so the reader below parses the bytes back and the self-test asserts the
// round-trip rather than trusting the writer.

import { chordNotes, NO_CHORD } from './chords.js';

const TICKS_PER_BEAT = 480;

// Variable-length quantity: seven bits per byte, high bit set on every byte but
// the last. Delta times and chunk-internal lengths use it, and it is the single
// easiest thing in the format to get wrong.
export function writeVLQ(value) {
  if (value < 0) throw new Error('VLQ cannot encode a negative value');
  const bytes = [value & 0x7f];
  let v = value >>> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  return bytes;
}

export function readVLQ(bytes, offset) {
  let value = 0;
  let i = offset;
  for (;;) {
    const b = bytes[i++];
    if (b === undefined) throw new Error('VLQ ran past the end of the buffer');
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return { value, next: i };
}

const str = (s) => [...s].map((c) => c.charCodeAt(0));
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];

// Voices a chord as a bass root plus a close triad, which is what the synth
// plays and what reads back sensibly in a DAW.
function voicing(chord) {
  const notes = chordNotes(chord);
  if (notes.length === 0) return [];
  const root = chord >> 1;
  return [36 + root, ...notes.map((n) => 60 + n)];
}

// segments: [{ chord, startTime, endTime }] in seconds.
export function buildMidi(segments, { bpm = 100, program = 0 } = {}) {
  const events = [];
  const secToTicks = (s) => Math.round((s * bpm * TICKS_PER_BEAT) / 60);

  for (const seg of segments) {
    if (seg.chord === NO_CHORD) continue;
    const on = secToTicks(seg.startTime);
    const off = secToTicks(seg.endTime);
    if (off <= on) continue;
    for (const note of voicing(seg.chord)) {
      events.push({ tick: on, kind: 1, data: [0x90, note, 80] });
      events.push({ tick: off, kind: 0, data: [0x80, note, 0] });
    }
  }

  // Note-offs must sort before note-ons at the same tick, or a repeated chord
  // silences the note it just started.
  events.sort((a, b) => a.tick - b.tick || a.kind - b.kind);

  const track = [];
  track.push(...writeVLQ(0), 0xff, 0x51, 0x03, ...u32(Math.round(60000000 / bpm)).slice(1));
  track.push(...writeVLQ(0), 0xc0, program & 0x7f);

  let last = 0;
  for (const ev of events) {
    track.push(...writeVLQ(ev.tick - last), ...ev.data);
    last = ev.tick;
  }
  track.push(...writeVLQ(0), 0xff, 0x2f, 0x00); // end of track

  const bytes = [
    ...str('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(TICKS_PER_BEAT),
    ...str('MTrk'), ...u32(track.length), ...track,
  ];
  return new Uint8Array(bytes);
}

// Minimal reader — exists to check the writer, not to be a general parser.
export function readMidi(bytes) {
  const tag = (o) => String.fromCharCode(...bytes.slice(o, o + 4));
  if (tag(0) !== 'MThd') throw new Error('missing MThd');
  const headerLen = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
  if (headerLen !== 6) throw new Error(`MThd length ${headerLen}, expected 6`);
  const format = (bytes[8] << 8) | bytes[9];
  const tracks = (bytes[10] << 8) | bytes[11];
  const division = (bytes[12] << 8) | bytes[13];
  if (tag(14) !== 'MTrk') throw new Error('missing MTrk');
  const trackLen = (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
  if (22 + trackLen !== bytes.length) {
    throw new Error(`MTrk length ${trackLen} does not match ${bytes.length - 22} remaining bytes`);
  }

  const events = [];
  let i = 22;
  let tick = 0;
  let running = 0;
  const end = 22 + trackLen;
  while (i < end) {
    const d = readVLQ(bytes, i);
    tick += d.value;
    i = d.next;
    let status = bytes[i];
    if (status < 0x80) status = running; // running status
    else i++;

    if (status === 0xff) {
      const type = bytes[i++];
      const len = readVLQ(bytes, i);
      i = len.next + len.value;
      if (type === 0x2f) { events.push({ tick, type: 'end' }); break; }
      continue;
    }
    running = status;
    const hi = status & 0xf0;
    if (hi === 0x90 || hi === 0x80) {
      const note = bytes[i++];
      const vel = bytes[i++];
      events.push({ tick, type: hi === 0x90 && vel > 0 ? 'on' : 'off', note });
    } else if (hi === 0xc0 || hi === 0xd0) {
      i += 1;
    } else {
      i += 2;
    }
  }
  return { format, tracks, division, events };
}

export function midiBlob(bytes) {
  return new Blob([bytes], { type: 'audio/midi' });
}
