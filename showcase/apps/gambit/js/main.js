import { initPlay } from './play.js';
import { initPuzzleRush } from './puzzleRush.js';
import { setSoundEnabled as setEngineSoundEnabled } from './sound.js';
import { getSoundEnabled, setSoundEnabled as persistSoundEnabled } from './storage.js';

function initModeTabs() {
  const tabs = document.querySelectorAll('.mode-tab');
  const views = { play: document.getElementById('playView'), puzzle: document.getElementById('puzzleView') };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      Object.values(views).forEach((v) => v.classList.remove('active'));
      views[tab.dataset.mode].classList.add('active');
    });
  });
}

function initSoundToggle() {
  const btn = document.getElementById('soundToggle');
  let enabled = getSoundEnabled();
  const apply = () => {
    setEngineSoundEnabled(enabled);
    btn.textContent = enabled ? '🔊' : '🔇';
    btn.setAttribute('aria-pressed', String(!enabled));
  };
  apply();
  btn.addEventListener('click', () => {
    enabled = !enabled;
    persistSoundEnabled(enabled);
    apply();
  });
}

initModeTabs();
initSoundToggle();
initPlay();
initPuzzleRush();
