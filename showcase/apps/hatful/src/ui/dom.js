const SVG_NS = 'http://www.w3.org/2000/svg';

function append(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

function apply(el, props, kids) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) el.style.setProperty(p, x);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

export const h = (tag, props, ...kids) => apply(document.createElement(tag), props, kids);
export const s = (tag, props, ...kids) => apply(document.createElementNS(SVG_NS, tag), props, kids);

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

let statusEl;
export function announce(msg) {
  statusEl ||= document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = '';
  setTimeout(() => {
    statusEl.textContent = msg;
  }, 30);
}

export function joinNames(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// Resolves with the value of the button that closed the dialog ('' for Escape / backdrop).
export function dialog({ title, body, actions, className = '' }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: `modal ${className}`, 'aria-labelledby': 'dlg-title' });
    const form = h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'dlg-title', text: title }),
      h('div', { class: 'modal-body' }, body),
      h(
        'div',
        { class: 'modal-actions' },
        actions.map((a) =>
          h('button', {
            type: 'submit',
            value: a.value,
            class: `btn ${a.kind || ''}`,
            text: a.label,
            formnovalidate: true,
            autofocus: a.focus ? true : null,
          })
        )
      )
    );
    dlg.append(form);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close('');
    });
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue;
      dlg.remove();
      resolve(v);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export async function confirmDialog({ title, message, confirm = 'Continue', cancel = 'Cancel', danger = false, extra }) {
  const v = await dialog({
    title,
    body: [h('p', { text: message }), extra],
    actions: [
      { label: cancel, value: 'no', focus: true },
      { label: confirm, value: 'yes', kind: danger ? 'danger' : 'primary' },
    ],
  });
  return v === 'yes';
}
