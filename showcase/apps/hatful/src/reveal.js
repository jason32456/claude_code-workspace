import { openTicket } from './links.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['loading', 'none', 'pin', 'error', 'scene'];

const query = new URLSearchParams(location.search);
const themeParam = query.get('theme');
if (themeParam === 'dark' || themeParam === 'light') document.documentElement.dataset.theme = themeParam;
const AUTO = query.get('auto') === '1';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const text = (x) => (typeof x === 'string' ? x : '');

const stage = $('stage');
const slip = $('slip');
const card = $('card');
const pullBtn = $('pull');
const hideBtn = $('hide');

const RISE_MS = 1450;
const LIFTED = 'translateY(-76px) scale(.32, .28) rotate(-5deg)';

let run = 0;
let ticket = '';
let payload = null;
let phase = 'idle';
let confettiDone = false;
let timers = [];

const later = (fn, ms) => {
  const id = run;
  timers.push(setTimeout(() => id === run && fn(), ms));
};
const clearTimers = () => {
  timers.forEach(clearTimeout);
  timers = [];
};

function show(name) {
  for (const v of VIEWS) $('v-' + v).hidden = v !== name;
}

function setPhase(p) {
  phase = p;
  stage.dataset.phase = p;
}

function focusHeading(view) {
  view.querySelector('h1')?.focus({ preventScroll: true });
}

function fail(code) {
  show('error');
  const noCrypto = code === 'NO_CRYPTO';
  $('err-title').textContent = noCrypto ? 'Open this page over https' : 'This link is damaged';
  $('err-text').textContent = noCrypto
    ? 'Hatful opens your slip inside your browser, which only works on a secure connection. Open the link over https (or from localhost) and try again.'
    : 'This link is damaged or incomplete. Ask the organiser to send it again.';
  document.title = 'Hatful';
  focusHeading($('v-error'));
}

function askPin() {
  show('pin');
  document.title = 'Your slip · Hatful';
  const input = $('pin-input');
  input.value = '';
  $('pin-error').textContent = '';
  input.removeAttribute('aria-invalid');
  input.focus({ preventScroll: true });
}

$('pin-input').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

$('pin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('pin-input');
  const err = $('pin-error');
  const go = $('pin-go');
  const id = run;
  if (input.value.length !== 4) {
    err.textContent = 'The PIN has 4 digits.';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  go.disabled = true;
  go.textContent = 'Checking…';
  try {
    const p = await openTicket(ticket, input.value);
    if (id === run) enter(p);
  } catch (error) {
    if (id !== run) return;
    if (error.code === 'BAD_PIN') {
      err.textContent = 'Wrong PIN, that one does not open this slip. Please try again.';
      input.setAttribute('aria-invalid', 'true');
      input.value = '';
      const form = $('pin-form');
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      input.focus();
    } else {
      fail(error.code);
    }
  } finally {
    go.disabled = false;
    go.textContent = 'Open my slip';
  }
});

function enter(raw) {
  const p = {};
  for (const k of ['t', 'g', 'r', 'h', 'b', 'd', 'n', 's']) p[k] = text(raw?.[k]).trim();
  if (!p.r) return fail('BAD_TICKET');
  payload = p;
  document.title = p.t ? `Your slip · ${p.t}` : 'Your slip · Hatful';
  show('scene');
  setPhase('ready');
  $('hello').textContent = p.g ? `Hi ${p.g},` : 'Hi there,';
  if (p.t) {
    const strong = document.createElement('strong');
    strong.textContent = p.t;
    $('sub').replaceChildren('Your slip for ', strong, ' is in the hat.');
  } else {
    $('sub').textContent = 'Your slip is in the hat.';
  }
  pullBtn.textContent = 'Pull your slip';
  pullBtn.hidden = false;
  if (AUTO) later(pull, 450);
}

// Names are user input, so every node is built with textContent.
function writeSlip(name) {
  const kicker = document.createElement('p');
  kicker.className = 'slip-kicker';
  kicker.textContent = "You're giving to";

  const el = document.createElement('p');
  el.className = 'slip-name';
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = name;
  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  const chars = [...name];
  const step = Math.max(24, Math.min(60, 650 / chars.length));
  el.style.setProperty('--step', `${step}ms`);
  let word = null;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      visual.append(' ');
      word = null;
      return;
    }
    if (!word) {
      word = document.createElement('span');
      word.className = 'w';
      visual.append(word);
    }
    const c = document.createElement('span');
    c.className = 'c';
    c.textContent = ch;
    c.style.setProperty('--i', i);
    c.style.setProperty('--r', `${((i * 7) % 5) - 2}deg`);
    word.append(c);
  });
  el.append(sr, visual);
  slip.replaceChildren(kicker, el);

  let size = chars.length <= 12 ? 46 : chars.length <= 20 ? 38 : chars.length <= 30 ? 30 : 24;
  const room = () => [...visual.children].every((w) => !w.className || w.offsetWidth <= el.clientWidth);
  for (let i = 0; i < 14; i++) {
    el.style.fontSize = `${size}px`;
    if (room() && el.offsetHeight <= 92) break;
    size = Math.max(13, size * 0.9);
  }
}

function formatDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return { label: d, when: '' };
  const [y, mo, da] = [+m[1], +m[2], +m[3]];
  const date = new Date(y, mo - 1, da);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== da) return { label: d, when: '' };
  const label = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const now = new Date();
  const days = Math.round((Date.UTC(y, mo - 1, da) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : '';
  return { label, when };
}

function renderCard(quick) {
  const rows = document.createElement('dl');
  rows.className = 'rows';
  const add = (label, value, extra) => {
    if (!value) return;
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (extra) {
      const span = document.createElement('span');
      span.className = 'when';
      span.textContent = ` · ${extra}`;
      dd.append(span);
    }
    rows.append(dt, dd);
  };
  add('They mentioned', payload.h);
  add('Budget', payload.b);
  if (payload.d) {
    const { label, when } = formatDate(payload.d);
    add('Date', label, when);
  }
  add('Note from the organiser', payload.n);

  const parts = [];
  if (rows.children.length) parts.push(rows);
  if (payload.s) {
    const box = document.createElement('div');
    box.className = 'seal-box';
    const seal = document.createElement('span');
    seal.className = 'seal';
    seal.textContent = payload.s;
    const note = document.createElement('p');
    note.className = 'seal-note';
    note.textContent = "Everyone's seal should match. It shows that all the slips came from the same draw, so nobody was quietly re-rolled.";
    box.append(seal, note);
    if (!rows.children.length) box.style.cssText = 'margin:0;padding:0;border:0';
    parts.push(box);
  }
  if (!parts.length) return false;
  card.replaceChildren(...parts);
  card.classList.toggle('quick', quick);
  card.hidden = false;
  return true;
}

function setSub(msg) {
  $('sub').textContent = msg;
}

function pull() {
  if (phase !== 'ready' && phase !== 'tucked') return;
  const quick = reducedMotion();
  setPhase('pulling');
  pullBtn.hidden = true;
  setSub('Shh. Keep it to yourself.');
  writeSlip(payload.r);
  slip.classList.toggle('quick', quick);

  const done = () => {
    slip.getAnimations().forEach((a) => a.cancel());
    slip.classList.add('front', 'is-out');
    setPhase('out');
    const shown = renderCard(quick);
    hideBtn.hidden = false;
    if (shown && !quick) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  if (quick) return done();

  slip.animate(
    [
      { transform: 'translateY(26px) scale(.32, .28) rotate(0deg)', easing: 'cubic-bezier(.3, .7, .2, 1)' },
      { transform: LIFTED, offset: 0.45, easing: 'cubic-bezier(.45, 0, .3, 1)' },
      { transform: 'translateY(-40px) scale(1, .28) rotate(-3deg)', offset: 0.72, easing: 'cubic-bezier(.2, .9, .3, 1.1)' },
      { transform: 'translateY(-14px) scale(1, 1) rotate(-1.5deg)' },
    ],
    { duration: RISE_MS, fill: 'forwards' }
  );
  later(() => slip.classList.add('front'), RISE_MS * 0.45);
  if (!confettiDone) {
    confettiDone = true;
    later(() => burst(slip.getBoundingClientRect()), RISE_MS * 0.72);
  }
  later(done, RISE_MS + 100);
}

function hide() {
  if (phase !== 'out') return;
  setPhase('hiding');
  slip.replaceChildren();
  card.replaceChildren();
  card.hidden = true;
  hideBtn.hidden = true;
  setSub('Your slip is tucked back in the hat.');

  const finish = () => {
    slip.getAnimations().forEach((a) => a.cancel());
    slip.classList.remove('front', 'is-out');
    setPhase('tucked');
    pullBtn.textContent = 'Show again';
    pullBtn.hidden = false;
  };

  if (reducedMotion()) return finish();

  slip.classList.remove('is-out');
  slip.animate(
    [
      { transform: 'translateY(-14px) scale(1, 1) rotate(-1.5deg)', easing: 'cubic-bezier(.5, 0, .3, 1)' },
      { transform: LIFTED, offset: 0.5, easing: 'cubic-bezier(.5, 0, .7, 1)' },
      { transform: 'translateY(26px) scale(.32, .28) rotate(0deg)' },
    ],
    { duration: 800, fill: 'forwards' }
  );
  later(() => slip.classList.remove('front'), 400);
  later(finish, 850);
}

function burst(rect) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = innerWidth;
  const H = innerHeight;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  cv.setAttribute('aria-hidden', 'true');
  cv.width = W * dpr;
  cv.height = H * dpr;
  document.body.append(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);

  const css = getComputedStyle(document.documentElement);
  const palette = ['--berry', '--gold', '--felt', '--ok', '--warn'].map((v) => css.getPropertyValue(v).trim() || '#c2334d');
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + 30;
  const parts = Array.from({ length: 110 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
    const v = 6 + Math.random() * 9;
    return {
      x: ox + (Math.random() - 0.5) * rect.width * 0.5,
      y: oy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 6,
      rot: Math.random() * 6.3,
      vr: (Math.random() - 0.5) * 0.35,
      color: palette[(Math.random() * palette.length) | 0],
      round: Math.random() < 0.3,
      life: 1500 + Math.random() * 1000,
    };
  });

  let last = performance.now();
  let age = 0;
  const frame = (now) => {
    const dt = Math.min(now - last, 40);
    last = now;
    age += dt;
    const k = dt / 16.7;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of parts) {
      if (age > p.life) continue;
      alive = true;
      p.vx *= Math.pow(0.985, k);
      p.vy = p.vy * Math.pow(0.985, k) + 0.3 * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.rot += p.vr * k;
      ctx.globalAlpha = Math.min(1, (p.life - age) / 400);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2.2, 0, 6.3);
        ctx.fill();
      } else {
        ctx.scale(1, Math.cos(p.rot * 1.7));
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (alive && cv.isConnected) requestAnimationFrame(frame);
    else cv.remove();
  };
  requestAnimationFrame(frame);
  later(() => cv.remove(), 3200);
}

function resetScene() {
  document.querySelectorAll('.confetti').forEach((c) => c.remove());
  slip.getAnimations().forEach((a) => a.cancel());
  slip.className = 'slip';
  slip.replaceChildren();
  card.replaceChildren();
  card.hidden = true;
  hideBtn.hidden = true;
  payload = null;
  setPhase('idle');
}

async function start() {
  const id = ++run;
  clearTimers();
  resetScene();
  ticket = location.hash.slice(1);
  if (!ticket) {
    document.title = 'Hatful · name drawing for gift swaps';
    return show('none');
  }
  show('loading');
  try {
    const p = await openTicket(ticket);
    if (id === run) enter(p);
  } catch (error) {
    if (id !== run) return;
    if (error.code === 'NEED_PIN') askPin();
    else fail(error.code);
  }
}

const demo = stage.cloneNode(true);
demo.id = 'stage-demo';
demo.removeAttribute('tabindex');
demo.dataset.phase = 'demo';
demo.querySelector('.slip').remove();
$('demo-hat').append(demo);

pullBtn.addEventListener('click', pull);
hideBtn.addEventListener('click', hide);
stage.addEventListener('click', pull);
stage.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pull();
  }
});
addEventListener('hashchange', start);
start();
