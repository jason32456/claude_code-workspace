// Readouts only. The HUD never tells you what to do — the falcon rows give you
// a state and a bearing, and the timing is yours.

const STATE_LABEL = {
  patrol: 'circling',
  climb: 'climbing',
  lock: 'locked on',
  stoop: 'STOOP',
  carry: 'feeding',
  recover: 'recovering',
  wait: '—',
};

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      count: document.getElementById('count'),
      delta: document.getElementById('delta'),
      progress: document.getElementById('progress'),
      light: document.getElementById('light'),
      stamina: document.getElementById('stamina'),
      density: document.getElementById('density'),
      flash: document.getElementById('flash'),
      threatList: document.getElementById('threat-list'),
      ring: document.getElementById('ring'),
      banner: document.getElementById('banner'),
      toast: document.getElementById('toast'),
    };
    this.shown = 0;
    this.deltaT = 0;
    this.bannerT = 0;
    this.toastT = 0;
    this.chevs = [];
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  banner(text, kind = '') {
    this.el.banner.textContent = text;
    this.el.banner.className = `show ${kind}`;
    this.bannerT = 1.4;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = 2.6;
  }

  chevron(i) {
    while (this.chevs.length <= i) {
      const d = document.createElement('div');
      d.className = 'chev';
      d.innerHTML = '<span></span>';
      this.el.ring.appendChild(d);
      this.chevs.push(d);
    }
    return this.chevs[i];
  }

  update(dt, s) {
    const e = this.el;
    if (s.count !== this.shown) {
      const d = s.count - this.shown;
      this.shown = s.count;
      e.count.textContent = s.count;
      if (Math.abs(d) > 0) {
        e.delta.textContent = (d > 0 ? '+' : '') + d;
        e.delta.className = `delta ${d > 0 ? 'up' : 'down'}`;
        this.deltaT = 0.9;
      }
    }
    if (this.deltaT > 0) {
      this.deltaT -= dt;
      if (this.deltaT <= 0) e.delta.className = 'delta';
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) e.banner.className = '';
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) e.toast.classList.remove('show');
    }

    e.progress.style.width = `${(s.progress * 100).toFixed(1)}%`;
    e.light.style.width = `${(s.light * 100).toFixed(1)}%`;
    e.stamina.style.width = `${(s.stamina * 100).toFixed(1)}%`;
    e.density.style.width = `${(s.density * 100).toFixed(1)}%`;
    e.flash.style.width = `${(s.flashReady * 100).toFixed(1)}%`;

    let html = '';
    for (const t of s.threats) {
      if (!t) continue;
      const cls = t.stooping ? 'stoop' : t.locked ? 'lock' : '';
      html += `<div class="threat-row ${cls}"><b>${STATE_LABEL[t.state] || t.state}</b><span>${Math.round(t.dist)} m</span></div>`;
    }
    e.threatList.innerHTML = html || '<div class="threat-row"><b>clear</b><span>—</span></div>';

    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const R = Math.min(cx, cy) * 0.62;
    for (let i = 0; i < this.chevs.length; i++) this.chevs[i].style.display = 'none';
    let ci = 0;
    if (s.roost && s.roost.dist < 1100) {
      const rel = s.roost.bearing - s.heading;
      const d = this.chevron(ci++);
      d.style.display = 'block';
      d.className = 'chev roost';
      d.style.transform = `translate(${cx + Math.sin(rel) * R}px, ${cy - Math.cos(rel) * R}px) rotate(${rel}rad)`;
    }
    for (const t of s.threats) {
      if (!t || t.state === 'patrol' || t.state === 'carry' || t.state === 'recover') continue;
      const rel = t.bearing - s.heading;
      const d = this.chevron(ci++);
      d.style.display = 'block';
      d.className = `chev ${t.stooping ? 'stoop' : ''}`;
      const x = cx + Math.sin(rel) * R;
      const y = cy - Math.cos(rel) * R;
      d.style.transform = `translate(${x}px, ${y}px) rotate(${rel}rad)`;
    }
  }
}
