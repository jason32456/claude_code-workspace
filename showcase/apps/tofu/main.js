import { loadFont, FontError } from './js/sfnt.js';
import { subsetFont } from './js/subset.js';
import { drawByteMap, drawGlyph, drawPalette, fmtBytes } from './js/render.js';
import { verify } from './js/verify.js';

const $ = (id) => document.getElementById(id);

const DEMO = 'vendor/EricaOne-Regular.ttf';

const PRESETS = {
  ascii: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''),
  latin1: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')
    + 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ',
  digits: '0123456789.,-+/%',
  pangram: 'The quick brown fox jumps over the lazy dog',
};

const state = {
  buffer: null,
  font: null,
  fileName: '',
  subset: null,
  selectedGid: null,
  faceName: null,
};

function banner(html, kind = '') {
  const el = $('banner');
  if (!html) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `banner ${kind}`;
  el.innerHTML = html;
}

// ------------------------------------------------------------ loading

async function loadBuffer(buffer, fileName) {
  try {
    const font = loadFont(buffer);
    state.buffer = buffer;
    state.font = font;
    state.fileName = fileName;
    banner('');
    renderFontInfo();
    update();
  } catch (err) {
    if (err instanceof FontError) {
      banner(`<p class="msg">${escapeHtml(err.message)}</p>`
        + (err.hint ? `<p class="hint">${escapeHtml(err.hint)}</p>` : ''), 'error');
    } else {
      banner(`<p class="msg">Could not read that file: ${escapeHtml(err.message)}</p>`, 'error');
    }
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function loadFile(file) {
  banner(`Reading ${escapeHtml(file.name)}…`);
  await loadBuffer(await file.arrayBuffer(), file.name);
}

// ------------------------------------------------------------ rendering

function renderFontInfo() {
  const f = state.font;
  const name = f.names.find((n) => n.nameID === 4) ?? f.names.find((n) => n.nameID === 1);
  $('font-name').textContent = name ? name.value : state.fileName;

  const facts = [
    ['File', state.fileName],
    ['Size', fmtBytes(f.byteLength)],
    ['Glyphs', f.maxp.numGlyphs.toLocaleString()],
    ['Units per em', f.head.unitsPerEm],
    ['Tables', f.numTables],
    ['cmap', `format ${f.cmap.format}, ${f.cmap.map.size.toLocaleString()} chars`],
    ['loca', f.head.indexToLocFormat === 0 ? 'short' : 'long'],
  ];
  const dl = $('font-facts');
  dl.replaceChildren();
  for (const [k, v] of facts) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = String(v);
    dl.append(dt, dd);
  }

  renderTables();
}

function renderTables() {
  const f = state.font;
  const host = $('tables');
  host.replaceChildren();

  const card = (title, rows) => {
    const d = document.createElement('div');
    d.className = 'tbl';
    const h = document.createElement('h4');
    h.textContent = title;
    d.append(h);
    const dl = document.createElement('dl');
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = String(v);
      dl.append(dt, dd);
    }
    d.append(dl);
    host.append(d);
  };

  card('head', [
    ['unitsPerEm', f.head.unitsPerEm],
    ['indexToLocFormat', `${f.head.indexToLocFormat} (${f.head.indexToLocFormat ? 'long' : 'short'})`],
    ['bbox', `${f.head.xMin} ${f.head.yMin} ${f.head.xMax} ${f.head.yMax}`],
    ['checkSumAdjustment', `0x${f.head.checkSumAdjustment.toString(16).padStart(8, '0')}`],
    ['created', f.head.created.toISOString().slice(0, 10)],
  ]);
  card('hhea', [
    ['ascender', f.hhea.ascender],
    ['descender', f.hhea.descender],
    ['lineGap', f.hhea.lineGap],
    ['advanceWidthMax', f.hhea.advanceWidthMax],
    ['numberOfHMetrics', f.hhea.numberOfHMetrics],
  ]);
  card('maxp / cmap', [
    ['numGlyphs', f.maxp.numGlyphs],
    ['cmap subtables', f.cmap.subtables.length],
    ['chosen', `${f.cmap.platform}, format ${f.cmap.format}`],
    ['mapped chars', f.cmap.map.size],
  ]);
  if (f.names.length) {
    card('name', f.names.slice(0, 6).map((n) => [n.label, n.value.length > 42 ? `${n.value.slice(0, 40)}…` : n.value]));
  }
}

function renderBill() {
  const host = $('bill');
  host.replaceChildren();
  const s = state.subset;
  if (!s || s.dropped.length === 0) {
    const p = document.createElement('p');
    p.className = 'bill-empty';
    p.textContent = 'Nothing was dropped — this font had no tables beyond the essentials.';
    host.append(p);
    return;
  }
  for (const d of [...s.dropped].sort((a, b) => b.bytes - a.bytes)) {
    const item = document.createElement('div');
    item.className = 'bill-item';
    item.innerHTML = `<b>${escapeHtml(d.tag)}</b>`
      + `<em>${fmtBytes(d.bytes)} removed</em>`
      + `<span>lost: ${escapeHtml(d.role)}</span>`;
    host.append(item);
  }
}

function renderSizes() {
  const s = state.subset;
  const host = $('size-compare');
  host.replaceChildren();
  if (!s) return;
  const saved = 100 * (1 - s.bytes.length / s.originalSize);
  host.innerHTML =
    `<div class="size-saved">${saved.toFixed(1)}% smaller</div>`
    + `<div class="size-line">original <b>${fmtBytes(s.originalSize)}</b></div>`
    + `<div class="size-line">subset <b>${fmtBytes(s.bytes.length)}</b></div>`
    + `<div class="size-line">glyphs <b>${state.font.maxp.numGlyphs} → ${s.numGlyphs}</b></div>`;
}

async function renderSpecimen() {
  const s = state.subset;
  const text = $('text').value || 'Hamburgefonstiv';
  $('spec-orig').dataset.label = 'original';
  $('spec-sub').dataset.label = 'subset';
  $('spec-orig').textContent = text;
  $('spec-sub').textContent = text;

  if (state.faceName) {
    for (const f of [...document.fonts]) {
      if (f.family === state.faceName || f.family === `${state.faceName}-orig`) document.fonts.delete(f);
    }
  }
  if (!s) return;

  const base = `Tofu${Math.random().toString(36).slice(2, 7)}`;
  state.faceName = base;
  try {
    const orig = new FontFace(`${base}-orig`, state.buffer.slice(0));
    await orig.load();
    document.fonts.add(orig);
    $('spec-orig').style.fontFamily = `"${base}-orig", serif`;
  } catch { /* the original may be unusual; leave it in the fallback face */ }

  try {
    const face = new FontFace(base, s.bytes.buffer.slice(
      s.bytes.byteOffset, s.bytes.byteOffset + s.bytes.length,
    ));
    await face.load();
    document.fonts.add(face);
    $('spec-sub').style.fontFamily = `"${base}", serif`;
  } catch (err) {
    $('spec-sub').style.fontFamily = 'serif';
    $('spec-sub').textContent = `the browser rejected this subset: ${err.message}`;
  }
}

function renderGlyphs() {
  const f = state.font;
  const s = state.subset;
  const gids = s ? s.oldGids.filter((g) => g !== 0).slice(0, 220) : [];
  if (state.selectedGid === null || !gids.includes(state.selectedGid)) {
    // Prefer a glyph that actually has an outline — landing on the space
    // character shows an empty box and explains nothing.
    state.selectedGid = gids.find((g) => f.loca[g + 1] > f.loca[g]) ?? gids[0] ?? 0;
  }
  drawPalette($('palette'), f, gids, state.selectedGid, (gid) => {
    state.selectedGid = gid;
    renderGlyphs();
  });
  drawGlyph($('glyph'), f, state.selectedGid, {
    showPoints: $('show-points').checked,
    showMetrics: $('show-metrics').checked,
    height: 430,
  });
}

async function runChecks() {
  const host = $('checks');
  host.replaceChildren();
  if (!state.subset) return;

  const pending = document.createElement('p');
  pending.className = 'checks-note';
  pending.textContent = 'Handing the bytes to the browser…';
  host.append(pending);

  const result = await verify(state.font, state.subset, $('text').value, state.buffer);

  host.replaceChildren();
  for (const c of result.checks) {
    const div = document.createElement('div');
    div.className = `check ${c.informational ? 'info' : (c.pass ? 'pass' : 'fail')}`;
    div.innerHTML = `<span class="mark">${c.informational ? 'NOTE' : (c.pass ? 'PASS' : 'FAIL')}</span>`
      + `<span><span class="what">${escapeHtml(c.name)}</span>`
      + (c.detail ? ` <span class="detail">${escapeHtml(c.detail)}</span>` : '')
      + '</span>';
    host.append(div);
  }
  const real = result.checks.filter((c) => !c.informational);
  const passed = real.filter((c) => c.pass).length;
  const sum = document.createElement('div');
  sum.className = `checks-summary ${passed === real.length ? 'ok' : 'bad'}`;
  sum.textContent = `${passed} / ${real.length} passed`;
  host.append(sum);

  const note = document.createElement('p');
  note.className = 'checks-note';
  note.textContent =
    'The first check is the one that matters: FontFace.load() runs these bytes '
    + 'through the browser’s own OpenType sanitiser, which is an implementation '
    + 'nobody here wrote. It either accepts the file or throws — there is no '
    + 'threshold to tune and no judgement to make.';
  host.append(note);
}

// ------------------------------------------------------------- update

let updateToken = 0;

async function update() {
  if (!state.font) return;
  const token = ++updateToken;
  const text = $('text').value;

  try {
    state.subset = subsetFont(state.font, text);
    $('download').disabled = false;
  } catch (err) {
    state.subset = null;
    $('download').disabled = true;
    $('retain-note').textContent = err.message;
    $('bill').replaceChildren();
    $('size-compare').replaceChildren();
    return;
  }

  const s = state.subset;
  $('retain-note').textContent =
    `${s.codepoints.length} characters kept, ${s.numGlyphs} glyphs after closure`
    + (s.missing.length ? ` — not in this font: ${s.missing.join('')}` : '');

  const droppedTags = new Set(s.dropped.map((d) => d.tag));
  drawByteMap($('bytemap'), state.font, droppedTags);
  renderSizes();
  renderBill();
  renderGlyphs();
  await renderSpecimen();
  if (token !== updateToken) return;
  await runChecks();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// -------------------------------------------------------------- wiring

function init() {
  $('pick-file').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (ev) => {
    const f = ev.target.files?.[0];
    if (f) loadFile(f);
    ev.target.value = '';
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (ev) => {
    ev.preventDefault();
    if (++dragDepth === 1) $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('dragleave', (ev) => {
    ev.preventDefault();
    if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').hidden = true; }
  });
  window.addEventListener('drop', (ev) => {
    ev.preventDefault();
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    const f = ev.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  const onText = debounce(update, 260);
  $('text').addEventListener('input', onText);
  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      $('text').value = PRESETS[chip.dataset.preset];
      update();
    });
  }

  for (const id of ['show-points', 'show-metrics']) {
    $(id).addEventListener('change', renderGlyphs);
  }

  $('download').addEventListener('click', () => {
    const s = state.subset;
    if (!s) return;
    const blob = new Blob([s.bytes], { type: 'font/ttf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.fileName.replace(/\.ttf$/i, '') + '-subset.ttf';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  window.addEventListener('resize', debounce(() => { if (state.font) renderGlyphs(); }, 200));

  fetch(DEMO)
    .then((r) => {
      if (!r.ok) throw new Error(`could not load the bundled demo font (${r.status})`);
      return r.arrayBuffer();
    })
    .then((buf) => loadBuffer(buf, 'EricaOne-Regular.ttf'))
    .catch((err) => banner(`<p class="msg">${escapeHtml(err.message)}</p>`
      + '<p class="hint">Drop a .ttf onto the page to get started.</p>', 'error'));
}

init();
