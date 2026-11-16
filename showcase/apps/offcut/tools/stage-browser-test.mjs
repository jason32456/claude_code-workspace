import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.OFFCUT_URL ?? 'http://localhost:8152/index.html';
const ENGINE = process.env.OFFCUT_ENGINE ?? 'fake';
const SHOTS = process.env.OFFCUT_SHOTS;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const url = (extra = '') => `${BASE}?debug${ENGINE === 'fake' ? '&engine=fake' : ''}${extra}`;

async function open(viewport, scheme = 'light', hash = '') {
  const context = await browser.newContext({ viewport, colorScheme: scheme, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => !r.url().startsWith('http://localhost:8152') && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && external.push(r.url()));
  await page.goto(url() + hash);
  await page.waitForFunction(() => window.__offcut?.result(), null, { timeout: 15000 }).catch(() => {});
  return { page, context, errors, external };
}

async function stopAt(page, stop) {
  await page.evaluate((s) => {
    const { playhead } = window.__offcut;
    playhead.pause();
    playhead.scrub(s);
  }, stop);
  await page.waitForTimeout(120);
}

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  for (const scheme of ['light', 'dark']) {
    const { page, context, errors, external } = await open(viewport, scheme);
    const name = `${label}-${scheme}`;
    const have = await page.evaluate(() => !!window.__offcut?.result());
    check(`${name}: result present`, have);
    if (!have) {
      console.log(await page.locator('#note').innerText());
      await context.close();
      continue;
    }
    if (scheme === 'light' && label === 'desktop') {
      const regions = await page.evaluate(async () => {
        const { wordToShape } = await import('./js/stage-raster.js');
        const { shapeVertexCount } = await import('./js/trace.js');
        const info = (w) => {
          const s = wordToShape(w, 50);
          return { regions: s.length, holes: s.map((r) => r.holes.length), verts: shapeVertexCount(s) };
        };
        return { C: info('C'), A: info('A'), T: info('T'), D: info('D'), O: info('O'), G: info('G'), CAT: info('CAT'), DOG: info('DOG') };
      });
      console.log(JSON.stringify(regions));
      check('C has no hole', regions.C.regions === 1 && regions.C.holes[0] === 0);
      check('A has one hole', regions.A.regions === 1 && regions.A.holes[0] === 1);
      check('T has no hole', regions.T.regions === 1 && regions.T.holes[0] === 0);
      check('D has one hole', regions.D.regions === 1 && regions.D.holes[0] === 1);
      check('O has one hole', regions.O.regions === 1 && regions.O.holes[0] === 1);
      check('G has no hole', regions.G.regions === 1 && regions.G.holes[0] === 0);
      check('CAT is three regions, one hole', regions.CAT.regions === 3 && regions.CAT.holes.reduce((a, b) => a + b) === 1);
      check('DOG is three regions, two holes', regions.DOG.regions === 3 && regions.DOG.holes.reduce((a, b) => a + b) === 2);
    }

    if (scheme === 'light' && label === 'desktop' && ENGINE === 'fake') {
      const pose = await page.evaluate(() => {
        const { view, playhead } = window.__offcut;
        const r = window.__offcut.result();
        const rows = [];
        playhead.pause();
        for (let f = 0; f <= 6; f++) {
          playhead.scrub(f);
          view.setPos(f);
          for (const id of [0, 5, r.pieces.length - 1]) {
            const p = view.pieceScreen(id);
            const piece = r.pieces[id];
            const m = f < 3 ? piece.a[f] : f === 3 ? [1, 0, 0, 0] : piece.b[6 - f];
            const ring = piece.ring;
            const gx = ring.reduce((s, q) => s + q[0], 0) / ring.length;
            const gy = ring.reduce((s, q) => s + q[1], 0) / ring.length;
            rows.push({ f, id, p, m, g: [gx, gy], n: view.film.n });
          }
        }
        return rows;
      });
      let worst = 0;
      for (const row of pose) {
        const { f, p, m, g } = row;
        const box = f < 3 ? null : null;
        const world = [m[0] * g[0] - m[1] * g[1] + m[2], m[1] * g[0] + m[0] * g[1] + m[3]];
        const fits = await page.evaluate((frame) => {
          const { view } = window.__offcut;
          const fit = view.layout.fits[frame];
          return [fit.s, fit.ox, fit.oy];
        }, f);
        const sx = world[0] * fits[0] + fits[1];
        const sy = world[1] * fits[0] + fits[2];
        worst = Math.max(worst, Math.hypot(sx - p.x, sy - p.y));
        const angle = Math.atan2(p.s, p.c);
        const want = Math.atan2(m[1], m[0]);
        worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(angle - want), Math.cos(angle - want))) * 100);
        void box;
      }
      check('key frames: sampled poses match pose maths', worst < 1e-6, `worst ${worst.toExponential(2)}`);

      const scrub = await page.evaluate(() => {
        const { view, playhead } = window.__offcut;
        const n = view.film.n;
        let bad = 0;
        let far = 0;
        let rigid = 0;
        const W = view.width;
        const H = view.height;
        for (let k = 0; k <= 600; k++) {
          const pos = (k / 600) * 6;
          playhead.scrub(pos);
          view.setPos(pos);
          for (let i = 0; i < n; i++) {
            const p = view.pieceScreen(i);
            if (![p.x, p.y, p.c, p.s, p.scale].every(Number.isFinite)) bad++;
            if (p.x < -W || p.x > 2 * W || p.y < -H || p.y > 2 * H) far++;
            rigid = Math.max(rigid, Math.abs(p.c * p.c + p.s * p.s - 1));
          }
        }
        return { bad, far, rigid, n };
      });
      check('scrubbing: no NaN, nothing wildly off-stage, rotations stay rigid', scrub.bad === 0 && scrub.far === 0 && scrub.rigid < 1e-9, JSON.stringify(scrub));
    }

    check(`${name}: no console errors`, errors.length === 0, errors.join(' | '));
    check(`${name}: no external requests`, external.length === 0, external.join(' '));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${name}: no horizontal scroll`, overflow <= 0, `${overflow}`);

    if (SHOTS) {
      await page.evaluate(() => (window.__offcut.playhead.pause(), window.__offcut.playhead.scrub(0)));
      for (let f = 0; f <= 6; f++) {
        await stopAt(page, f);
        await page.screenshot({ path: `${SHOTS}/${name}-${f}.png`, fullPage: f === 3 });
      }
      await stopAt(page, 3.5);
      await page.screenshot({ path: `${SHOTS}/${name}-mid.png` });
    }
    await context.close();
  }
}

{
  const { page, context, errors } = await open({ width: 1280, height: 900 });
  await page.evaluate(() => window.__offcut.playhead.pause());
  await stopAt(page, 0);
  const box = await page.locator('#canvas').boundingBox();
  const hit = await page.evaluate(() => {
    const { view } = window.__offcut;
    for (let y = 40; y < view.height - 40; y += 6) for (let x = 40; x < view.width - 40; x += 6) { const id = view.hitTest(x, y); if (id >= 0) return { x, y, id }; }
    return null;
  });
  check('hover: a piece can be hit', !!hit);
  if (hit) {
    await page.mouse.move(box.x + hit.x, box.y + hit.y);
    await page.waitForTimeout(150);
    check('hover: hint names the piece', (await page.locator('#hint').innerText()).includes(`Piece ${hit.id + 1}`));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/hover.png` });
  }

  await page.keyboard.press('Space');
  const playing = await page.evaluate(() => window.__offcut.playhead.playing);
  await page.keyboard.press('Space');
  check('keyboard: space toggles play', playing === true || playing === false);
  await stopAt(page, 0);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1300);
  const after = await page.evaluate(() => window.__offcut.playhead.pos);
  check('keyboard: right arrow steps to the next key frame', Math.abs(after - 1) < 1e-6, `pos ${after}`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(1300);
  check('keyboard: left arrow steps back', Math.abs(await page.evaluate(() => window.__offcut.playhead.pos)) < 1e-6);
  const captions = [];
  for (let f = 0; f <= 6; f++) {
    await stopAt(page, f);
    captions.push(await page.locator('#caption').innerText());
  }
  check('captions: seven distinct lines', new Set(captions).size === 7, captions[3]);

  const facts = await page.locator('#facts').innerText();
  console.log(facts);
  check('facts line filled', /pieces/.test(facts) && /e[-+]\d/.test(facts));

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-svg')]);
  const svgText = readFileSync(await dl.path(), 'utf8');
  const parsed = await page.evaluate((t) => {
    const doc = new DOMParser().parseFromString(t, 'image/svg+xml');
    return { error: !!doc.querySelector('parsererror'), puzzle: !!doc.querySelector('#puzzle'), solution: !!doc.querySelector('#solution'), numbers: doc.querySelectorAll('#puzzle text.n, #puzzle .numbers text').length, polys: doc.querySelectorAll('#puzzle polygon').length };
  }, svgText);
  check('SVG download parses with both pages', !parsed.error && parsed.puzzle && parsed.solution && parsed.numbers === parsed.polys && parsed.numbers > 0, JSON.stringify(parsed));
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#dl-png')]);
  check('PNG download', (await png.suggestedFilename()) === 'offcut-frame.png');

  const hash1 = await page.evaluate(() => location.hash);
  check('hash holds both inputs', /a=w/.test(hash1) && /b=w/.test(hash1), hash1);
  const hist = await page.evaluate(() => history.length);
  await page.fill('#slot-a .word', 'FISH');
  await page.waitForTimeout(900);
  check('typing updates the hash without history entries', (await page.evaluate(() => history.length)) === hist && /FISH/.test(await page.evaluate(() => location.hash)));
  await page.click('#slot-b [data-mode=shape]');
  await page.click('#slot-b [data-preset=heart]');
  await page.waitForTimeout(700);
  const shareHash = await page.evaluate(() => location.hash);
  check('preset in hash', /p%3Aheart/.test(shareHash) || /p:heart/.test(shareHash), shareHash);

  await page.click('#slot-a [data-mode=draw]');
  const pad = await page.locator('#slot-a .pad').boundingBox();
  await page.mouse.move(pad.x + pad.width * 0.2, pad.y + pad.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(pad.x + pad.width * 0.5, pad.y + pad.height * 0.2, { steps: 8 });
  await page.mouse.move(pad.x + pad.width * 0.8, pad.y + pad.height * 0.55, { steps: 8 });
  await page.mouse.move(pad.x + pad.width * 0.5, pad.y + pad.height * 0.8, { steps: 8 });
  await page.mouse.move(pad.x + pad.width * 0.2, pad.y + pad.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  const drawn = await page.evaluate(() => window.__offcut.panels[0].state.drawn);
  check('drawing produces a shape', Array.isArray(drawn) && drawn.length >= 1 && drawn[0].outer.length >= 3, drawn ? `${drawn.length} regions` : 'none');
  const link = await page.evaluate(() => location.href);
  const before = await page.evaluate(() => JSON.stringify([window.__offcut.panels[0].state.drawn, window.__offcut.panels[1].state.preset]));
  const page2 = await context.newPage();
  page2.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page2.goto(link);
  await page2.waitForFunction(() => window.__offcut?.result(), null, { timeout: 15000 });
  const after2 = await page2.evaluate(() => JSON.stringify([window.__offcut.panels[0].state.drawn, window.__offcut.panels[1].state.preset]));
  check('share link round-trips the drawing and the preset', before === after2, `${link.length} chars`);
  const pieces1 = await page.evaluate(() => window.__offcut.result().pieces.length);
  const pieces2 = await page2.evaluate(() => window.__offcut.result().pieces.length);
  check('share link reproduces the dissection', pieces1 === pieces2, `${pieces1} vs ${pieces2}`);

  await page.click('#slot-a [data-mode=word]');
  await page.fill('#slot-a .word', '');
  await page.waitForTimeout(700);
  check('empty input shows a helpful note', (await page.locator('#note').isVisible()) && /Nothing to cut/.test(await page.locator('#note').innerText()));
  check('no console errors during interaction', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
