const el = (tag, cls, parent, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
};

const STATE_CLASS = {
  reflex: 'a-reflex', reaching: 'a-reach', holding: 'a-hold', working: 'a-hold',
};

export class Hud {
  constructor(root) {
    this.root = root;

    this.objective = el('div', 'objective', root);
    this.sub = el('div', 'objective-sub', root);

    const left = el('div', 'panel left', root);
    this.bars = {};
    for (const [k, label] of [['oxygen', 'OXYGEN'], ['mantle', 'MANTLE'], ['stamina', 'STAMINA'], ['ink', 'INK']]) {
      const row = el('div', 'bar-row', left);
      el('span', 'bar-label', row, label);
      const track = el('div', 'bar', row);
      this.bars[k] = el('div', `fill f-${k}`, track);
    }

    const right = el('div', 'panel right', root);
    this.timer = el('div', 'timer', right, '0:00');
    const seenRow = el('div', 'bar-row', right);
    el('span', 'bar-label', seenRow, 'SEEN');
    const st = el('div', 'bar', seenRow);
    this.suspicion = el('div', 'fill f-susp', st);
    this.camoRow = el('div', 'camo', right, 'match 40%');

    const bottom = el('div', 'armbar', root);
    this.slots = el('div', 'slots', bottom);
    this.pips = [];
    const pipWrap = el('div', 'pips', bottom);
    for (let i = 0; i < 8; i++) {
      const p = el('div', 'pip', pipWrap);
      const f = el('div', 'pip-fill', p);
      el('span', 'pip-n', p, String(i + 1));
      this.pips.push({ p, f });
    }

    this.reticle = el('div', 'reticle', root);
    this.target = el('div', 'target-label', root);
    this.log = el('div', 'log', root);
    this.lines = [];

    this.flash = el('div', 'flash', root);
  }

  say(msg, kind) {
    const line = el('div', `line ${kind || ''}`, this.log, msg);
    this.lines.push({ line, t: 4.5 });
    while (this.lines.length > 5) this.log.removeChild(this.lines.shift().line);
  }

  tickLog(dt) {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.t -= dt;
      l.line.style.opacity = Math.max(0, Math.min(1, l.t / 1.2));
      if (l.t <= 0) { this.log.removeChild(l.line); this.lines.splice(i, 1); }
    }
  }

  update(s, dt) {
    this.bars.oxygen.style.width = `${s.octo.oxygen * 100}%`;
    this.bars.mantle.style.width = `${s.octo.mantle * 100}%`;
    this.bars.stamina.style.width = `${s.octo.stamina * 100}%`;
    this.bars.ink.style.width = `${s.octo.inkCharge * 100}%`;
    this.bars.oxygen.classList.toggle('critical', s.octo.oxygen < 0.3);

    this.suspicion.style.width = `${s.suspicion * 100}%`;
    this.camoRow.textContent = `match ${Math.round(s.octo.matchQuality * 100)}% · ${s.substrate}`;
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    this.timer.textContent = `${m}:${String(sec).padStart(2, '0')}`;

    const free = s.octo.freeSlots();
    this.slots.innerHTML = '';
    for (let i = 0; i < s.octo.slots; i++) {
      el('span', `slot ${i < free ? '' : 'used'}`, this.slots);
    }

    s.octo.arms.forEach((a, i) => {
      const pip = this.pips[i];
      pip.p.className = `pip ${STATE_CLASS[a.state]}${a.commanded ? ' cmd' : ''}${a.tighten > 0 ? ' tight' : ''}`;
      pip.f.style.height = `${Math.max(4, a.grip * 100)}%`;
    });

    this.objective.textContent = s.objective;
    this.sub.textContent = s.hint || '';
    this.target.textContent = s.targetLabel || '';
    this.target.style.opacity = s.targetLabel ? 1 : 0;
    this.reticle.classList.toggle('actionable', !!s.targetLabel);

    this.flash.style.opacity = s.danger.toFixed(3);
    this.tickLog(dt);
  }
}
