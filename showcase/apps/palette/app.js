const COUNT = 5;
const swatchesEl = document.getElementById('swatches');
const btnGenerate = document.getElementById('btn-generate');
const btnExport = document.getElementById('btn-export');
const toastEl = document.getElementById('toast');

let palette = Array.from({ length: COUNT }, () => ({ hex: '', locked: false }));

// ── Color generation ──────────────────────────────────────────────────────

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomColor() {
  const h = Math.random() * 360;
  const s = 45 + Math.random() * 45;   // 45–90 % — avoid muddy greys
  const l = 30 + Math.random() * 45;   // 30–75 % — avoid too dark/light
  return hslToHex(h, s, l);
}

// Relative luminance for WCAG contrast decision
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function isDark(hex) {
  return luminance(hex) < 0.35;
}

// ── Toast ─────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
}

// ── Clipboard ─────────────────────────────────────────────────────────────

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// ── Render ────────────────────────────────────────────────────────────────

function renderSwatch(idx) {
  const el = swatchesEl.children[idx];
  const { hex, locked } = palette[idx];
  const dark = isDark(hex);

  el.style.backgroundColor = hex;
  el.setAttribute('data-dark', dark);
  el.classList.toggle('locked', locked);

  const lockBtn = el.querySelector('.lock-btn');
  lockBtn.textContent = locked ? '🔒' : '🔓';
  lockBtn.setAttribute('aria-label', locked ? 'Unlock color' : 'Lock color');

  el.querySelector('.swatch-hex').textContent = hex.toUpperCase();
}

function buildDOM() {
  swatchesEl.innerHTML = '';
  palette.forEach((_, idx) => {
    const div = document.createElement('div');
    div.className = 'swatch';
    div.setAttribute('role', 'group');
    div.setAttribute('aria-label', `Color ${idx + 1}`);
    div.innerHTML = `
      <div class="swatch-info">
        <button class="lock-btn" aria-label="Lock color"></button>
        <button class="swatch-hex" aria-label="Copy hex code"></button>
      </div>`;

    div.querySelector('.lock-btn').addEventListener('click', e => {
      e.stopPropagation();
      palette[idx].locked = !palette[idx].locked;
      renderSwatch(idx);
    });

    div.querySelector('.swatch-hex').addEventListener('click', async e => {
      e.stopPropagation();
      await copyText(palette[idx].hex.toUpperCase());
      showToast(`Copied ${palette[idx].hex.toUpperCase()}`);
    });

    swatchesEl.appendChild(div);
    renderSwatch(idx);
  });
}

// ── Generate ──────────────────────────────────────────────────────────────

function generate() {
  palette.forEach((swatch, idx) => {
    if (!swatch.locked) {
      palette[idx].hex = randomColor();
      renderSwatch(idx);
    }
  });
}

// ── Export ────────────────────────────────────────────────────────────────

async function exportCSS() {
  const css = palette
    .map((s, i) => `  --color-${i + 1}: ${s.hex.toUpperCase()};`)
    .join('\n');
  await copyText(`:root {\n${css}\n}`);
  showToast('CSS variables copied!');
}

// ── Init ──────────────────────────────────────────────────────────────────

palette.forEach((_, i) => { palette[i].hex = randomColor(); });
buildDOM();

btnGenerate.addEventListener('click', generate);
btnExport.addEventListener('click', exportCSS);

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    generate();
  }
});
