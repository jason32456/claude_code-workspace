import { absorbHint, medalFor } from './sim.js';

export const PROP_NAMES = {
  pinecone: 'pinecones', mitten: 'mittens', stone: 'stones', pole: 'ski poles', sled: 'sleds', post: 'fence posts',
  snowman: 'snowmen', sign: 'signposts', sapling: 'saplings', log: 'logs', pine: 'pines', boulder: 'boulders', hut: 'huts', pylon: 'lift pylons',
};
export const PROP_ONE = {
  pinecone: 'pinecone', mitten: 'mitten', stone: 'stone', pole: 'ski pole', sled: 'sled', post: 'fence post',
  snowman: 'snowman', sign: 'signpost', sapling: 'sapling', log: 'log', pine: 'pine', boulder: 'boulder', hut: 'hut', pylon: 'lift pylon',
};
const SURFACES = ['powder', 'crust', 'ice', 'rock', 'slush'];
const SURFACE_TONE = ['#bfe8ff', '#eef4fb', '#8fd8ff', '#ff9b7a', '#c9d3de'];

export const fmtEnergy = (e) => (e >= 1e6 ? `${(e / 1e6).toFixed(e >= 1e7 ? 1 : 2)} MJ` : e >= 1e3 ? `${(e / 1e3).toFixed(e >= 1e5 ? 0 : 1)} kJ` : `${e.toFixed(0)} J`);
export const fmtMass = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 1e4 ? 1 : 2)} t` : `${m.toFixed(0)} kg`);

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hud: $('hud'), level: $('h-level'), diam: $('h-diam'), mass: $('h-mass'), speed: $('h-speed'), temp: $('h-temp'), surface: $('h-surface'),
    pFill: $('p-fill'), pBall: $('p-ball'), pDist: $('p-dist'), can: $('hint-can'), next: $('hint-next'),
    eVal: $('e-val'), eFill: $('e-fill'), eNeed: $('e-need'), eRatio: $('e-ratio'), toast: $('toast'), flash: $('flash'),
  };
  let toastT = 0, lastCan = null, eMin = 1, eMax = 10;
  const logPos = (e) => Math.max(0, Math.min(1, Math.log(Math.max(e, eMin) / eMin) / Math.log(eMax / eMin)));

  return {
    show(on) { el.hud.classList.toggle('hidden', !on); },
    setLevel(L) {
      el.level.textContent = L.name;
      el.eNeed.textContent = `ice needs ${fmtEnergy(L.eReq)}`;
      document.querySelector('#progress .row .k').textContent = L.name;
      eMin = L.eReq / 2000; eMax = L.eReq * 8;
      for (const k of [1, 2, 4]) $(`mk-${k}`).style.left = `${logPos(L.eReq * k) * 100}%`;
      lastCan = null;
    },
    update(sim, dt) {
      const w = sim.world, L = w.level;
      el.diam.textContent = (sim.r * 2).toFixed(sim.r < 5 ? 2 : 1);
      el.mass.textContent = fmtMass(sim.mass());
      el.speed.textContent = `${(sim.speed() * 3.6).toFixed(0)} km/h`;
      const T = sim.temperature();
      el.temp.textContent = `${T < 0 ? '−' : '+'}${Math.abs(T).toFixed(1)} °C`;
      el.temp.style.color = T > 0 ? '#ffb38a' : '';
      el.surface.textContent = sim.grounded ? SURFACES[sim.surface] : 'airborne';
      el.surface.style.color = sim.grounded ? SURFACE_TONE[sim.surface] : '#f4c542';
      const f = Math.max(0, Math.min(1, sim.p[2] / w.zWall));
      el.pFill.style.width = `${f * 100}%`;
      el.pBall.style.left = `${f * 100}%`;
      el.pDist.textContent = sim.curtain.broken ? 'through' : `${Math.max(0, w.zWall - sim.p[2]).toFixed(0)} m to the ice`;
      const E = sim.energy(), ratio = E / L.eReq;
      el.eVal.textContent = fmtEnergy(E);
      el.eFill.style.width = `${logPos(E) * 100}%`;
      el.eFill.classList.toggle('over', ratio >= 1);
      el.eRatio.textContent = `×${ratio.toFixed(ratio < 10 ? 2 : 1)}${medalFor(ratio) ? ' · ' + medalFor(ratio) : ''}`;
      const h = absorbHint(sim.r);
      if (h.can !== lastCan) {
        el.can.textContent = h.can ? PROP_NAMES[h.can] : 'nothing yet';
        el.can.classList.remove('bump'); void el.can.offsetWidth; el.can.classList.add('bump');
        if (lastCan !== null && h.can) this.toast(`Now picking up ${PROP_NAMES[h.can]}`, `diameter ${(sim.r * 2).toFixed(2)} m`);
        lastCan = h.can;
      }
      el.next.textContent = h.next ? `${PROP_NAMES[h.next]} at ${h.needD.toFixed(2)} m` : 'everything';
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('on'); }
    },
    toast(text, sub = '', dur = 1.6) {
      el.toast.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
      el.toast.classList.add('on');
      toastT = dur;
    },
    flash() {
      el.flash.style.transition = 'none'; el.flash.style.opacity = '0.85';
      requestAnimationFrame(() => { el.flash.style.transition = 'opacity 0.9s'; el.flash.style.opacity = '0'; });
    },
  };
}
