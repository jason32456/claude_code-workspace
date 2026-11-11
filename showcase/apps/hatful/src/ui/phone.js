import { h } from './dom.js';

// At most one name is ever in the DOM: the giver while the phone is being handed over,
// the receiver only while the button is held.
export function openPhone(event, onSeen) {
  const people = event.people;
  const d = event.draw;
  let idx = 0;
  let seen = false;
  let holding = false;

  const dlg = h('dialog', { class: 'phone', 'aria-label': 'Pass the phone' });
  const stage = h('div', { class: 'phone-stage', 'aria-live': 'off' });
  const holdBtn = h('button', { type: 'button', class: 'hold', 'aria-label': 'Press and hold to see your name' });
  const nextBtn = h('button', { type: 'button', class: 'btn primary big', disabled: true });
  const progress = h('p', { class: 'phone-progress' });
  const closeBtn = h('button', { type: 'button', class: 'phone-close btn', 'aria-label': 'Stop passing the phone', text: 'Close' });

  function showHandover() {
    holding = false;
    holdBtn.classList.remove('down');
    stage.replaceChildren(
      h('p', { class: 'phone-kicker', text: 'Hand the phone to' }),
      h('p', { class: 'phone-name', text: people[idx].name }),
      h('p', { class: 'phone-help', text: 'Only you look. Press and hold the button, read, then let go.' })
    );
    progress.textContent = `${idx + 1} of ${people.length}`;
    holdBtn.textContent = 'Hold to reveal';
    nextBtn.disabled = !seen;
    nextBtn.textContent = idx === people.length - 1 ? 'Done' : 'Next person';
  }

  function reveal() {
    if (holding) return;
    holding = true;
    seen = true;
    const giver = people[idx];
    const target = people.find((p) => p.id === d.assignment[giver.id]);
    holdBtn.classList.add('down');
    holdBtn.textContent = 'Release to hide';
    stage.replaceChildren(
      h('p', { class: 'phone-kicker', text: 'You give to' }),
      h('p', { class: 'phone-name hand', text: target.name }),
      target.hint ? h('p', { class: 'phone-hint', text: target.hint }) : null,
      h('p', { class: 'phone-help', text: [event.budget && `Budget ${event.budget}`, event.date && `Date ${event.date}`].filter(Boolean).join(' · ') })
    );
    onSeen(giver.id);
  }

  function hide() {
    if (!holding) return;
    showHandover();
  }

  holdBtn.addEventListener('pointerdown', (e) => {
    holdBtn.setPointerCapture?.(e.pointerId);
    reveal();
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) holdBtn.addEventListener(t, hide);
  holdBtn.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      reveal();
    }
  });
  holdBtn.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') hide();
  });
  holdBtn.addEventListener('blur', hide);
  holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', hide);

  nextBtn.addEventListener('click', () => {
    if (idx === people.length - 1) return dlg.close();
    idx++;
    seen = false;
    showHandover();
    holdBtn.focus();
  });
  closeBtn.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => {
    holding = false;
    stage.replaceChildren();
    document.removeEventListener('visibilitychange', hide);
    dlg.remove();
  });

  dlg.append(closeBtn, progress, stage, holdBtn, nextBtn);
  document.body.append(dlg);
  showHandover();
  dlg.showModal();
  holdBtn.focus();
}
