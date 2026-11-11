import { h, dialog, confirmDialog, announce, wait } from './dom.js';
import { draw, cyclesOf } from '../engine.js';
import { randomSeed } from '../rng.js';
import { sealOf } from '../seal.js';
import { makeTicket, makeEnvelope, verifyEnvelope } from '../links.js';
import { createHat } from './hat.js';
import { loopsView } from './loops.js';
import { openPhone } from './phone.js';
import { householdColours } from './store.js';

function randomPin() {
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a);
  while (a[0] >= 4294960000);
  return String(a[0] % 10000).padStart(4, '0');
}

const slug = (s) => (s || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';

export function createHatView(ctx) {
  const el = h('div', { class: 'hat-view' });
  let drawing = false;
  let verify = null;
  let error = '';

  async function linkFor(giverId) {
    const ev = ctx.event();
    const d = ev.draw;
    const giver = ev.people.find((p) => p.id === giverId);
    const target = ev.people.find((p) => p.id === d.assignment[giverId]);
    const ticket = await makeTicket(
      { t: ev.title, g: giver.name, r: target.name, h: target.hint, b: ev.budget, d: ev.date, n: ev.note, s: d.seal },
      d.pins?.[giverId]
    );
    const url = new URL('reveal.html', location.href);
    url.search = '';
    url.hash = ticket;
    return url.href;
  }

  async function fallbackCopy(url) {
    const input = h('input', { class: 'in', readonly: true, value: url, 'aria-label': 'Link to copy' });
    queueMicrotask(() => input.select());
    await dialog({ title: 'Copy this link', body: [h('p', { class: 'muted', text: 'Your browser blocked automatic copying. Select the link and copy it.' }), input], actions: [{ label: 'Done', value: 'ok', kind: 'primary', focus: true }] });
  }

  async function copyLink(id, btn) {
    try {
      const url = await linkFor(id);
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        await fallbackCopy(url);
        return;
      }
      btn.textContent = 'Copied';
      announce('Link copied');
      setTimeout(() => (btn.textContent = 'Copy link'), 1600);
    } catch (e) {
      showError(e);
    }
  }

  async function shareLink(id, setSent) {
    try {
      const ev = ctx.event();
      const giver = ev.people.find((p) => p.id === id);
      const url = await linkFor(id);
      await navigator.share({ title: ev.title || 'Hatful', text: `${giver.name}, your slip for ${ev.title || 'our draw'} is ready.`, url });
      setSent(true);
    } catch (e) {
      if (e?.name !== 'AbortError') showError(e);
    }
  }

  function showError(e) {
    error = e?.code === 'NO_CRYPTO' ? 'Links need a secure page (https or localhost).' : e?.message || 'Something went wrong.';
    render();
  }

  async function startDraw(usePin) {
    if (drawing) return;
    const ev = ctx.event();
    let res;
    try {
      res = draw(ev, randomSeed());
    } catch (e) {
      error = e.code === 'INFEASIBLE' ? 'No valid draw exists for these rules. Go back and lift a ban.' : e.message;
      return render();
    }
    ev.usePin = usePin;
    drawing = true;
    error = '';
    verify = null;
    render();
    try {
      const pins = usePin ? Object.fromEntries(ev.people.map((p) => [p.id, randomPin()])) : {};
      const seal = await sealOf(ev, res.assignment, res.seed);
      ev.draw = { seed: res.seed, assignment: res.assignment, seal, pins, sent: {}, opened: false, at: new Date().toISOString(), uniform: res.uniform, method: res.method };
      ctx.save();
      ctx.refreshHeader();
      await Promise.all([hatAnim.drop(), wait(0)]);
    } catch (e) {
      ev.draw = null;
      error = e.code === 'NO_CRYPTO' ? 'Drawing needs a secure page (https or localhost).' : e.message;
    }
    drawing = false;
    render();
    announce('The hat is sealed. Hand out the slips.');
  }

  let hatAnim = null;

  function renderPre(ev, a) {
    const pin = h('input', { type: 'checkbox', role: 'switch', id: 'pin-switch', checked: ev.usePin ? true : null });
    const go = h('button', { type: 'button', class: 'btn primary big', text: 'Draw names', disabled: !a.feasible || a.n < 3 ? true : null, onclick: () => startDraw(pin.checked) });
    hatAnim = createHat({ slips: ev.people.length });
    return h(
      'section',
      { class: 'card stage-card' },
      h('div', { class: 'hat-stage' }, hatAnim.el),
      h(
        'div',
        { class: 'stage-copy' },
        h('h2', { text: 'Ready when you are' }),
        h('p', { class: 'muted', text: a.feasible ? `${ev.people.length} slips are in the hat. The draw is picked at random, with every valid draw equally likely, and you will not see who got whom.` : 'These rules cannot be drawn yet. Go back to the rules and lift a ban.' }),
        h('label', { class: 'switch' }, pin, h('span', { class: 'track', 'aria-hidden': 'true' }), h('span', null, h('strong', { text: 'Protect each link with a 4-digit PIN' }), h('small', { text: 'Every person gets their own PIN. Send it separately from the link.' }))),
        error ? h('p', { class: 'banner bad', role: 'alert', text: error }) : null,
        h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn', text: 'Back to rules', onclick: () => ctx.goto('rules') }), go)
      )
    );
  }

  function renderDrawing() {
    hatAnim = createHat({ slips: ctx.event().people.length });
    queueMicrotask(() => {});
    return h('section', { class: 'card stage-card' }, h('div', { class: 'hat-stage' }, hatAnim.el), h('div', { class: 'stage-copy' }, h('h2', { text: 'Shuffling the slips…' }), h('p', { class: 'muted', role: 'status', text: 'Dropping every name into the hat.' })));
  }

  function renderPost(ev) {
    const d = ev.draw;
    const sentCount = () => ev.people.filter((p) => d.sent[p.id]).length;
    const progressText = h('span', { class: 'progress-text' });
    const bar = h('div', { class: 'bar' }, h('div', { class: 'bar-fill' }));
    const updateProgress = () => {
      const c = sentCount();
      progressText.textContent = `${c} of ${ev.people.length} sent`;
      bar.firstChild.style.width = `${(c / ev.people.length) * 100}%`;
    };
    const items = ev.people.map((p) => {
      const sentBtn = h('button', { type: 'button', class: 'sent-toggle', 'aria-pressed': d.sent[p.id] ? 'true' : 'false', 'aria-label': `Mark ${p.name} as sent` }, h('span', { class: 'tick', 'aria-hidden': 'true', text: '✓' }), h('span', { text: 'Sent' }));
      const setSent = (v) => {
        d.sent[p.id] = v;
        sentBtn.setAttribute('aria-pressed', String(v));
        ctx.save();
        updateProgress();
      };
      sentBtn.addEventListener('click', () => setSent(!d.sent[p.id]));
      const copy = h('button', { type: 'button', class: 'btn small-btn', text: 'Copy link', 'aria-label': `Copy link for ${p.name}` });
      copy.addEventListener('click', () => copyLink(p.id, copy));
      return h(
        'li',
        { class: 'hand-row', 'data-giver': p.id },
        h('span', { class: 'hand-name', text: p.name }),
        d.pins?.[p.id] ? h('span', { class: 'pin', title: `PIN for ${p.name}`, 'aria-label': `PIN for ${p.name}: ${d.pins[p.id].split('').join(' ')}`, text: d.pins[p.id] }) : null,
        h('span', { class: 'hand-actions' }, copy, navigator.share ? h('button', { type: 'button', class: 'btn small-btn', text: 'Share', 'aria-label': `Share link for ${p.name}`, onclick: () => shareLink(p.id, setSent) }) : null, sentBtn)
      );
    });
    updateProgress();
    const hat = createHat({ slips: 0, seal: d.seal });
    const phone = () => openPhone(ev, (id) => {
      d.sent[id] = true;
      ctx.save();
    });
    const phoneBtn = h('button', { type: 'button', class: 'btn', text: 'Pass the phone', onclick: () => { phone(); } });
    phoneBtn.addEventListener('click', () => {}, { once: true });

    const redraw = async () => {
      const box = h('input', { type: 'checkbox', checked: ev.usePin ? true : null });
      const ok = await confirmDialog({
        title: 'Draw again?',
        message: 'The current draw is thrown away. Links you already sent will no longer match, so you would have to send everyone a new one.',
        confirm: 'Redraw', danger: true,
        extra: h('label', { class: 'check' }, box, h('span', { text: 'Protect links with a 4-digit PIN' })),
      });
      if (ok) {
        ev.draw = null;
        ctx.save();
        startDraw(box.checked);
      }
    };

    const sections = [
      h(
        'section',
        { class: 'card sealed' },
        h('div', { class: 'hat-stage small' }, hat.el),
        h(
          'div',
          { class: 'stage-copy' },
          h('h2', { text: 'The hat is sealed' }),
          h('p', null, 'Seal ', h('code', { class: 'seal-code', text: d.seal })),
          h('p', { class: 'muted small', text: 'This code is on every slip. If two people see different seals, their links did not come from the same draw.' }),
          d.uniform === false ? h('p', { class: 'banner warn', role: 'note', text: 'Heads up: these rules were too tight for a perfectly uniform draw, so a close approximation was used instead. Every pair still follows your rules, but not every possible draw was exactly as likely.' }) : null
        )
      ),
      h(
        'section',
        { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Hand out the slips' }), h('p', { class: 'muted small', text: 'Each link carries one person’s slip, locked inside it. Nothing is uploaded, and you will not see who drew whom.' })), h('div', { class: 'progress' }, progressText, bar)),
        h('ul', { class: 'handout' }, items),
        d.pins && Object.keys(d.pins).length ? h('p', { class: 'muted small', text: 'Send each PIN in a separate message from the link.' }) : null,
        error ? h('p', { class: 'banner bad', role: 'alert', text: error }) : null,
        h('div', { class: 'row-actions' }, phoneBtn, h('button', { type: 'button', class: 'btn danger-ghost', text: 'Redraw…', onclick: redraw }))
      ),
    ];

    if (!d.opened) {
      sections.push(
        h(
          'section',
          { class: 'card' },
          h('h2', { text: 'After the party' }),
          h('p', { class: 'muted', text: 'Opening the hat shows everyone who drew whom, as loops, and lets you export a file that proves the draw was fair. Do it once the gifts have been exchanged.' }),
          h('button', { type: 'button', class: 'btn', text: 'Open the hat…', onclick: openHat })
        )
      );
    } else sections.push(renderOpened(ev));
    return sections;
  }

  async function openHat() {
    const ok = await confirmDialog({ title: 'Open the hat?', message: 'This shows the whole draw on this screen, including who drew you, if you are in it. The surprise is gone for you. Do it only when the party is over.', confirm: 'Open the hat', danger: true });
    if (!ok) return;
    ctx.event().draw.opened = true;
    ctx.save();
    render();
    announce('The hat is open.');
  }

  function renderOpened(ev) {
    const d = ev.draw;
    const colours = householdColours(ev);
    const nameOf = (id) => ev.people.find((p) => p.id === id)?.name || '?';
    const colourOf = (id) => colours.get(ev.people.find((p) => p.id === id)?.group) || 'var(--muted)';
    const cycles = cyclesOf(d.assignment);
    const verifyBox = h('div', { class: 'verify', role: 'status' });
    const paintVerify = () => {
      if (!verify) return verifyBox.replaceChildren();
      const row = (ok, t) => h('li', { class: ok ? 'good' : 'bad' }, h('span', { 'aria-hidden': 'true', text: ok ? '✓' : '✕' }), ' ', t);
      verifyBox.replaceChildren(
        h('p', { class: `banner ${verify.ok ? 'ok' : 'bad'}`, text: verify.ok ? 'Verified: this draw is fair and unaltered.' : 'This draw does not verify.' }),
        h('ul', { class: 'checks' }, row(verify.validAssignment, 'Every pair follows the rules'), row(verify.sealMatches, `Seal matches (${verify.computedSeal})`), row(verify.reproducible, 'The seed reproduces exactly this draw'))
      );
    };
    paintVerify();
    return h(
      'section',
      { class: 'card opened' },
      h('h2', { text: 'The hat is open' }),
      h('p', { class: 'muted', text: cycles.length === 1 ? 'Everyone is on one loop. Follow the arrows.' : `${cycles.length} loops. Follow the arrows to see who gave to whom.` }),
      loopsView(cycles, nameOf, colourOf),
      h(
        'table',
        { class: 'pairs' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Giver' }), h('th', { scope: 'col', text: 'Receiver' }))),
        h('tbody', null, ev.people.map((p) => h('tr', null, h('td', { text: p.name }), h('td', { text: nameOf(d.assignment[p.id]) }))))
      ),
      h(
        'div',
        { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn', text: 'Export envelope', onclick: exportEnvelope }),
        h('button', {
          type: 'button', class: 'btn primary', text: 'Verify result',
          onclick: async () => {
            verify = await verifyEnvelope(makeEnvelope(ctx.event()));
            paintVerify();
            announce(verify.ok ? 'Verified' : 'Does not verify');
          },
        })
      ),
      verifyBox
    );
  }

  function exportEnvelope() {
    const ev = ctx.event();
    const blob = new Blob([JSON.stringify(makeEnvelope(ev), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `hatful-${slug(ev.title)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function render() {
    const ev = ctx.event();
    const a = ctx.analysis();
    el.replaceChildren(...(drawing ? [renderDrawing()] : ev.draw ? renderPost(ev) : [renderPre(ev, a)]));
  }

  return {
    el,
    show() {
      if (!drawing) {
        error = '';
        verify = null;
        render();
      }
    },
    render,
    get busy() {
      return drawing;
    },
  };
}
