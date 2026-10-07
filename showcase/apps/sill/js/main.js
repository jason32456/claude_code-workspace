import { Renderer } from './renderer.js';
import { loadProgress, el } from './ui.js';
import { startDesk } from './desk.js';
import { startReal } from './real.js';

const params = new URLSearchParams(location.search);
const embedded = window.top !== window.self;
const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
const hasShared = typeof SharedWorker !== 'undefined';
const bigScreen = Math.min(screen.width, screen.height) >= 600 && Math.max(screen.width, screen.height) >= 900;
const canReal = hasShared && !embedded && !coarse && bigScreen;

let renderer;
try {
  renderer = new Renderer();
} catch (err) {
  document.body.appendChild(el('div', 'fatal', `<h1>Sill</h1><p>Sill draws its water with WebGL, which this browser has turned off.</p>`));
  throw err;
}

const progress = loadProgress();

function goReal() {
  if (!canReal) return;
  const url = new URL(location.href);
  url.search = '?mode=real';
  location.href = url.href;
}

function realFailed(late) {
  const url = new URL(location.href);
  url.search = '?mode=desk';
  if (late) setTimeout(() => { location.href = url.href; }, 6000);
  else location.href = url.href;
}

if (params.has('pane') && hasShared) {
  startReal({ renderer, progress, isPane: true, onFail: realFailed });
} else if (params.get('mode') === 'real' && canReal) {
  startReal({ renderer, progress, isPane: false, onFail: realFailed });
} else if (params.get('mode') === 'desk' || params.has('layout')) {
  startDesk({ renderer, progress, canReal, onReal: goReal });
} else {
  intro();
}

function intro() {
  const why = embedded
    ? 'Sill is running inside another page. Open it in its own tab to use real windows.'
    : !hasShared
      ? 'This browser cannot share one world between windows, so real windows are off.'
      : coarse || !bigScreen
        ? 'Real windows need a desktop browser you can drag windows around in.'
        : '';
  const card = el('div', 'intro');
  card.innerHTML = `
    <div class="intro-inner">
      <div class="intro-mark">sill</div>
      <h1>The water lives on your desktop.<br><span>Your browser windows are the only thing holding it.</span></h1>
      <p class="intro-lede">Behind your monitor there is a cave with a spring in it. A Sill window shows the part of the cave that sits behind wherever that window is on your screen. Water rests on window floors, so</p>
      <ul class="intro-rules">
        <li><b>overlap</b> two windows and water runs from one into the other,</li>
        <li><b>drag</b> a window upward and the water rides up inside it,</li>
        <li><b>close</b> or minimise one and whatever it held falls through to the next.</li>
      </ul>
      <p class="intro-lede">Get the spring to the pots.</p>
      <div class="intro-actions">
        <button class="btn big" data-go="real" ${canReal ? '' : 'disabled'}>Use real windows</button>
        <button class="btn big ghost" data-go="desk">Simulated desktop</button>
      </div>
      <p class="intro-note">${why || 'Real windows opens a small pop-up beside this one; allow pop-ups if your browser asks. Every Sill window on this site shares one world, so you can also open this address in a second window yourself.'}</p>
    </div>`;
  document.body.appendChild(card);
  card.querySelector('[data-go=real]').addEventListener('click', () => {
    card.remove();
    history.replaceState(null, '', '?mode=real');
    startReal({ renderer, progress, isPane: false, onFail: realFailed });
  });
  card.querySelector('[data-go=desk]').addEventListener('click', () => {
    card.remove();
    history.replaceState(null, '', '?mode=desk');
    startDesk({ renderer, progress, canReal, onReal: goReal });
  });
}
