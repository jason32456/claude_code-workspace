import { h, joinNames, announce } from './dom.js';
import { createMatrix } from './matrix.js';
import { householdColours } from './store.js';
import { readEnvelope } from '../links.js';

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
const sci = (x) => {
  const [m, e] = x.toExponential(1).split('e');
  return `${m} × 10${[...String(Number(e))].map((c) => SUP[c]).join('')}`;
};
const loc = (x) => Math.round(x).toLocaleString('en-US');

export function countText(a) {
  if (a.n < 3) return { num: '–', unit: 'Add at least three people', approx: false };
  if (!a.feasible) return { num: '0', unit: 'possible draws', approx: false };
  if (a.total !== null) {
    if (a.method === 'float') return { prefix: 'about', num: a.total >= 1e12 ? sci(a.total) : loc(a.total), unit: 'possible draws' };
    return { num: loc(a.total), unit: a.total === 1 ? 'possible draw' : 'possible draws' };
  }
  const e = a.totalEstimate;
  if (e === null || e === undefined) return { num: 'Plenty', unit: 'of possible draws (too many to count)' };
  const r = Number(e.toPrecision(2));
  return { prefix: 'about', num: r >= 1e15 ? sci(r) : loc(r), unit: 'possible draws (estimated)' };
}

const MODES = [
  ['any', 'Any valid draw', 'Anyone can draw anyone the rules allow. Two people may draw each other.'],
  ['noswap', 'No swaps', 'Nobody draws the person who drew them, so there are no two-person trades.'],
  ['loop', 'One big loop', 'One single circle: A gives to B, B to C, and so on until the last gives back to A.'],
];

function methodInfo(a, mode) {
  if (a.n < 3) return ['', ''];
  if (a.method === 'exact') {
    return ['Exact count', mode === 'loop' ? 'Every possible loop was counted, so each one is equally likely to be drawn.' : 'Every valid draw was counted, so each one is equally likely to be drawn.'];
  }
  if (a.method === 'float') return ['Counted', 'Counted exactly in floating point (accurate to about 15 digits). The draw is still uniform.'];
  if (mode === 'noswap') return ['Estimated', 'The no-swap rule is checked by sampling, so the count and percentages are estimates. The draw is still uniform.'];
  return ['Estimated', 'Too many people to count every draw, so the numbers come from random samples.'];
}

export function createRulesView(ctx) {
  const el = h('div', { class: 'rules-view' });
  const banner = h('div', { class: 'banner bad', role: 'alert', hidden: true });
  const heroNum = h('div', { class: 'hero-num' });
  const heroUnit = h('div', { class: 'hero-unit' });
  const badge = h('span', { class: 'badge' });
  const methodText = h('p', { class: 'muted small' });
  const meterFill = h('div', { class: 'meter-fill' });
  const meter = h('div', { class: 'meter', role: 'meter', 'aria-label': 'Secrecy', 'aria-valuemin': 0 }, meterFill);
  const secrecyCap = h('p', { class: 'small' });
  const secrecyExpl = h('p', { class: 'muted small' });
  const leakList = h('ul', { class: 'leaks' });
  const readout = h('p', { class: 'readout', 'aria-hidden': 'true' });
  const modeExpl = h('p', { class: 'muted small mode-expl' });
  const importStatus = h('p', { class: 'small', role: 'status' });
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  let timer = 0;
  let lastAnalysis = null;

  const matrix = createMatrix({
    onToggle: (from, to, isBanned) => {
      const ev = ctx.event();
      ctx.commit(() => {
        if (isBanned) ev.bans = ev.bans.filter((b) => !(b.from === from && b.to === to));
        else ev.bans.push({ from, to });
      }).then((ok) => {
        if (!ok) return;
        refresh(true);
        const name = (id) => ev.people.find((p) => p.id === id).name;
        announce(`${name(from)} to ${name(to)} ${isBanned ? 'allowed' : 'banned'}. ${heroNum.textContent} ${heroUnit.textContent}`);
        matrix.refocusActive();
      });
    },
    onReadout: (t) => (readout.textContent = t),
  });

  const modeInputs = MODES.map(([value, label]) => {
    const input = h('input', {
      type: 'radio', name: 'mode', value,
      onchange: () => {
        const prev = ctx.event().mode;
        ctx.commit(() => (ctx.event().mode = value), () => (modeInputs.find((m) => m.value === prev).checked = true)).then((ok) => {
          if (ok) refresh(true);
        });
      },
    });
    return input;
  });
  const modeGroup = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Draw mode' },
    MODES.map(([value, label], i) => h('label', null, modeInputs[i], h('span', { text: label })))
  );

  async function importLastYear() {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    let env;
    try {
      env = readEnvelope(await file.text());
    } catch (e) {
      importStatus.textContent = e.message || 'That file could not be read.';
      importStatus.className = 'small bad-text';
      return;
    }
    const ev = ctx.event();
    const byName = new Map(ev.people.map((p) => [p.name.trim().toLowerCase(), p.id]));
    const old = new Map(env.event.people.map((p) => [p.id, p.name.trim().toLowerCase()]));
    const add = [];
    let skipped = 0;
    for (const [g, r] of Object.entries(env.draw.assignment)) {
      const from = byName.get(old.get(g));
      const to = byName.get(old.get(r));
      if (!from || !to) skipped++;
      else add.push({ from, to });
    }
    const analysis = ctx.analysis();
    const idx = new Map(ev.people.map((p, i) => [p.id, i]));
    const fresh = add.filter((b) => analysis.allowed[idx.get(b.from)][idx.get(b.to)]);
    if (!fresh.length) {
      importStatus.className = 'small';
      importStatus.textContent = `Nothing to add: ${add.length} of last year's pairs were already ruled out${skipped ? `, ${skipped} involve people who are not here` : ''}.`;
      return;
    }
    const ok = await ctx.commit(() => ev.bans.push(...fresh));
    if (!ok) return;
    importStatus.className = 'small';
    importStatus.textContent = `Banned ${fresh.length} of last year's pairs${skipped ? `, skipped ${skipped} that involve people who are not here` : ''}.`;
    refresh(true);
  }
  fileInput.addEventListener('change', importLastYear);

  const hallSentence = (a, ev) => {
    const nm = (id) => ev.people.find((p) => p.id === id)?.name || '?';
    const g = a.hall.givers.map(nm);
    const r = a.hall.receivers.map(nm);
    const to = r.length ? `can only give to ${joinNames(r)}` : 'have nobody they are allowed to give to';
    return `${joinNames(g)} ${to}. That is ${g.length} ${g.length === 1 ? 'giver' : 'givers'} for ${r.length} ${r.length === 1 ? 'receiver' : 'receivers'}, so someone is always left out. Lift one of the outlined rules.`;
  };

  function paint(a) {
    const ev = ctx.event();
    const nm = (id) => ev.people.find((p) => p.id === id)?.name || '?';
    const colours = householdColours(ev);
    matrix.update(ev, a, colours);
    modeInputs.forEach((i) => (i.checked = i.value === ev.mode));
    modeExpl.textContent = MODES.find((m) => m[0] === ev.mode)[2];

    const ct = countText(a);
    heroNum.replaceChildren(ct.prefix ? h('span', { class: 'prefix', text: ct.prefix + ' ' }) : null, ct.num);
    heroUnit.textContent = ct.unit;
    heroNum.classList.toggle('zero', a.n >= 3 && !a.feasible);
    const [b, t] = methodInfo(a, ev.mode);
    badge.textContent = b;
    badge.hidden = !b;
    methodText.textContent = t;

    if (a.n < 3) {
      banner.hidden = false;
      banner.textContent = 'Add at least three people to see the odds.';
    } else if (!a.feasible) {
      banner.hidden = false;
      if (a.hall) banner.textContent = hallSentence(a, ev);
      else if (ev.mode === 'loop') banner.textContent = 'Everyone can draw someone, but these rules do not allow one single loop through all of you. Switch to Any valid draw or lift a ban.';
      else if (ev.mode === 'noswap') banner.textContent = 'Everyone can draw someone, but every possible draw would contain two people drawing each other. Switch to Any valid draw or lift a ban.';
      else banner.textContent = 'These rules leave no valid draw. Lift a ban.';
    } else banner.hidden = true;

    const ok = a.feasible && a.n >= 3;
    const { bits, maxBits, weakest } = a.secrecy;
    const ratio = ok && maxBits > 0 ? Math.min(1, bits / maxBits) : 0;
    meter.setAttribute('aria-valuemax', maxBits.toFixed(2));
    meter.setAttribute('aria-valuenow', (ok ? bits : 0).toFixed(2));
    meterFill.style.width = `${ratio * 100}%`;
    meter.dataset.level = ratio >= 0.9 ? 'good' : ratio >= 0.7 ? 'ok' : 'low';
    if (ok) {
      const word = ratio >= 0.9 ? 'Very secret' : ratio >= 0.7 ? 'Fairly secret' : ratio >= 0.45 ? 'Guessable' : 'Leaky';
      secrecyCap.textContent = `${word}: ${bits.toFixed(1)} of ${maxBits.toFixed(1)} bits`;
      secrecyExpl.textContent = `Bits measure how hard it is to guess who someone drew. The top score means anyone could have drawn anyone. Weakest link: ${nm(weakest)}.`;
    } else {
      secrecyCap.textContent = 'Secrecy: not available yet';
      secrecyExpl.textContent = '';
    }

    const leaks = ok ? a.leaks : [];
    leakList.replaceChildren(
      ...(ok && !leaks.length
        ? [h('li', { class: 'good', text: 'Nobody is easy to guess. No single pair is more likely than a coin toss.' })]
        : leaks.slice(0, 6).map((l) =>
            h('li', { class: l.kind, text: l.kind === 'forced' ? `${nm(l.from)} gives to ${nm(l.to)} in every possible draw.` : `${nm(l.from)} gives to ${nm(l.to)} in about ${Math.round(l.p * 100)}% of possible draws.` })
          )),
      leaks.length > 6 ? h('li', { class: 'muted', text: `and ${leaks.length - 6} more.` }) : null
    );
    el.classList.remove('busy');
  }

  function refresh(now = false) {
    clearTimeout(timer);
    const ev = ctx.event();
    const run = () => {
      lastAnalysis = ctx.analysis();
      paint(lastAnalysis);
    };
    if (now && ev.people.length <= 14) run();
    else {
      el.classList.add('busy');
      timer = setTimeout(run, 150);
    }
  }

  el.append(
    banner,
    h(
      'div',
      { class: 'rules-grid' },
      h(
        'div',
        { class: 'rules-main' },
        h('section', { class: 'card mode-card' }, h('h2', { id: 'mode-h', text: 'How should it work?' }), modeGroup, modeExpl),
        h(
          'section',
          { class: 'card matrix-card' },
          h('h2', { text: 'Who may give to whom' }),
          h('p', { class: 'muted small', text: 'Rows give, columns receive. Click a cell to ban that pair, click again to allow it. The shading shows how likely each pair is.' }),
          h(
            'div',
            { class: 'legend small' },
            h('span', { class: 'lg lg-heat' }, 'unlikely', h('i'), 'likely'),
            h('span', { class: 'lg' }, h('b', { class: 'sw banned', text: '✕' }), 'banned'),
            h('span', { class: 'lg' }, h('b', { class: 'sw self' }), 'same person'),
            h('span', { class: 'lg' }, h('b', { class: 'sw house' }), 'same household')
          ),
          matrix.el,
          readout
        )
      ),
      h(
        'aside',
        { class: 'rules-side' },
        h(
          'section',
          { class: 'card hero-card', 'aria-live': 'off' },
          heroNum,
          heroUnit,
          h('div', { class: 'method' }, badge),
          methodText,
          h('div', { class: 'secrecy' }, h('h3', { text: 'Secrecy' }), meter, secrecyCap, secrecyExpl)
        ),
        h('section', { class: 'card side-bottom' }, h('h3', { text: 'What could give it away' }), leakList),
        h(
          'section',
          { class: 'card side-bottom' },
          h('h3', { text: 'Avoid last year' }),
          h('p', { class: 'muted small', text: 'Import last year\'s envelope file and every pair from it is banned here, so nobody draws the same person twice.' }),
          h('button', { type: 'button', class: 'btn', text: 'Import envelope…', onclick: () => fileInput.click() }),
          fileInput,
          importStatus
        )
      )
    ),
    h('div', { class: 'step-foot' }, h('button', { type: 'button', class: 'btn', text: 'Back', onclick: () => ctx.goto('people') }), h('button', { type: 'button', class: 'btn primary big', text: 'Next: to the hat', onclick: () => ctx.goto('hat') }))
  );

  return {
    el,
    show() {
      importStatus.textContent = '';
      refresh(true);
    },
    refresh,
    repaint: () => matrix.repaint(),
    focusMatrix: () => matrix.focus(),
  };
}
