import { s, reducedMotion, wait } from './dom.js';

// Top hat in three-quarter view. Slips are clipped at the front lip so they vanish into the crown.
export function createHat({ slips = 0, seal = '' } = {}) {
  const count = Math.min(slips, 14);
  const slipEls = [];
  for (let i = 0; i < count; i++) {
    const x = 78 + ((i * 37) % 84);
    const rot = ((i * 53) % 50) - 25;
    slipEls.push(
      s(
        'g',
        { class: 'slip', style: { '--i': i, '--r': `${rot}deg`, '--n': count } },
        s('rect', { x, y: 18, width: 30, height: 20, rx: 3, class: 'slip-paper' }),
        s('path', { d: `M${x + 5} 25h20M${x + 5} 31h12`, class: 'slip-line' })
      )
    );
  }
  const svg = s(
    'svg',
    { viewBox: '0 0 240 190', class: 'hat-svg', role: 'img', 'aria-label': seal ? `A sealed hat, seal ${seal}` : 'A hat' },
    s('defs', null, s('clipPath', { id: 'hat-clip' }, s('rect', { x: 0, y: 0, width: 240, height: 92 }))),
    s('ellipse', { cx: 120, cy: 160, rx: 108, ry: 20, class: 'hat-shadow' }),
    s('ellipse', { cx: 120, cy: 146, rx: 104, ry: 22, class: 'hat-brim' }),
    s('path', { d: 'M52 96 L58 146 Q120 172 182 146 L188 96 Z', class: 'hat-crown' }),
    s('path', { d: 'M56 128 Q120 154 184 128 L183 140 Q120 166 57 140 Z', class: 'hat-band' }),
    s('ellipse', { cx: 120, cy: 96, rx: 68, ry: 17, class: 'hat-inside' }),
    s('g', { 'clip-path': 'url(#hat-clip)', class: 'slips' }, slipEls),
    s('path', { d: 'M52 96 Q120 126 188 96', class: 'hat-lip' }),
    seal
      ? s('g', { class: 'hat-seal' }, s('circle', { cx: 120, cy: 138, r: 15, class: 'seal-disc' }), s('path', { d: 'M112 138l5 5 10-11', class: 'seal-tick' }))
      : null
  );
  return {
    el: svg,
    async drop() {
      if (reducedMotion()) {
        await wait(150);
        return;
      }
      svg.classList.add('dropping');
      await wait(900 + count * 45);
      svg.classList.remove('dropping');
      svg.classList.add('settled');
      await wait(450);
    },
  };
}

export function hatIcon() {
  return s(
    'svg',
    { viewBox: '0 0 32 32', 'aria-hidden': 'true', class: 'brand-hat' },
    s('rect', { x: 7, y: 5, width: 18, height: 17, rx: 3, fill: 'currentColor' }),
    s('rect', { x: 3, y: 21, width: 26, height: 6, rx: 3, fill: 'currentColor' }),
    s('rect', { x: 7, y: 15, width: 18, height: 3.5, class: 'brand-band' })
  );
}
