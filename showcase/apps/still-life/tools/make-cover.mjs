// Builds screenshots/cover.png — an animated PNG, because a still image of this
// game is by construction blank static. Run from the app folder with a server
// on it:  python3 -m http.server 8140 &  node tools/make-cover.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:8140';
const out = process.argv[3] || 'screenshots/cover.png';
const COLS = 160, ROWS = 100, CELL = 5, FRAMES = 96, FPS = 30;
const DARK = [0x14, 0x13, 0x0f], LIGHT = [0xe9, 0xe4, 0xd8];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`${base}/dev/eye-demo.html`);
const frames = await page.evaluate(async ({ COLS, ROWS, FRAMES }) => {
  const { createCore } = await import('/js/eye-core.js');
  const { textMask, diskMask } = await import('/js/shape.js');
  const core = createCore({ cols: COLS, rows: ROWS });
  const title = textMask('STILL LIFE', { height: 20 });
  const disk = diskMask(6);

  // A closed rectangular walk at one cell per frame: the title never pauses,
  // so it never vanishes, and the last frame hands back to the first.
  const loop = [];
  for (let k = 0; k < 16; k++) loop.push([k, 0]);
  for (let k = 0; k < 8; k++) loop.push([16, k]);
  for (let k = 0; k < 16; k++) loop.push([16 - k, 8]);
  for (let k = 0; k < 8; k++) loop.push([0, 8 - k]);

  const result = [];
  for (let f = 0; f < FRAMES; f++) {
    const [lx, ly] = loop[f % loop.length];
    const angle = (f / FRAMES) * Math.PI * 2;
    core.compose({
      items: [
        { id: 'title', mask: title, x: Math.round((COLS - title.w) / 2) - 8 + lx, y: Math.round((ROWS - title.h) / 2) - 4 + ly },
        { id: 'disk', mask: disk, x: Math.round(COLS / 2 + Math.cos(angle) * 68) - 6, y: Math.round(ROWS / 2 + Math.sin(angle) * 38) - 6 },
      ],
    });
    result.push(Array.from(core.bits).join(''));
  }
  return result;
}, { COLS, ROWS, FRAMES });
await browser.close();

const W = COLS * CELL, H = ROWS * CELL;

// ffmpeg writes 24-bit APNG, which triples the size of what is one bit per
// cell. This writes 1-bit palette frames directly; repeated rows use the Up
// filter so they deflate to nothing.
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = -1;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ -1) >>> 0, body.length + 4);
  return out;
}
const u32 = (...values) => {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, k) => buf.writeUInt32BE(v, k * 4));
  return buf;
};

function scanlines(bits) {
  const stride = 1 + W / 8;
  const raw = Buffer.alloc(stride * H);
  for (let cy = 0; cy < ROWS; cy++) {
    const top = cy * CELL * stride;
    for (let cx = 0; cx < COLS; cx++) {
      if (bits.charCodeAt(cy * COLS + cx) !== 49) continue;
      for (let px = cx * CELL; px < (cx + 1) * CELL; px++) raw[top + 1 + (px >> 3)] |= 0x80 >> (px & 7);
    }
    for (let k = 1; k < CELL; k++) raw[top + k * stride] = 2;
  }
  return deflateSync(raw, { level: 9 });
}

const parts = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', Buffer.concat([u32(W, H), Buffer.from([1, 3, 0, 0, 0])])),
  chunk('PLTE', Buffer.from([...DARK, ...LIGHT])),
  chunk('acTL', u32(FRAMES, 0)),
];
let sequence = 0;
frames.forEach((bits, f) => {
  const control = Buffer.alloc(26);
  control.writeUInt32BE(sequence++, 0);
  u32(W, H, 0, 0).copy(control, 4);
  control.writeUInt16BE(1, 20);
  control.writeUInt16BE(FPS, 22);
  parts.push(chunk('fcTL', control));
  const data = scanlines(bits);
  parts.push(f === 0 ? chunk('IDAT', data) : chunk('fdAT', Buffer.concat([u32(sequence++), data])));
});
parts.push(chunk('IEND', Buffer.alloc(0)));
writeFileSync(out, Buffer.concat(parts));
console.log(`wrote ${out}: ${FRAMES} frames at ${FPS} fps, ${W}x${H}`);
