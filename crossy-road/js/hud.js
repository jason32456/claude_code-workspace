const scoreEl    = document.getElementById('score');
const bestEl     = document.getElementById('best');
const overlayEl  = document.getElementById('overlay');
const titleEl    = document.getElementById('overlay-title');
const subtitleEl = document.getElementById('overlay-subtitle');
const playBtn    = document.getElementById('play-btn');

export function createHUD(onPlay) {
  playBtn.addEventListener('click', onPlay);

  function setScore(n) {
    scoreEl.textContent = n;
  }

  function setBest(n) {
    bestEl.textContent = n > 0 ? `Best: ${n}` : '';
  }

  function showMenu(best) {
    titleEl.textContent = 'Crossy Road';
    subtitleEl.textContent = best > 0 ? `Best: ${best}` : '';
    playBtn.textContent = 'Play';
    overlayEl.classList.remove('hidden');
  }

  function showGameOver(score, best) {
    titleEl.textContent = 'Game Over';
    const isNew = score === best && score > 0;
    subtitleEl.textContent = isNew
      ? `New best: ${score}!`
      : `Score: ${score}  •  Best: ${best}`;
    playBtn.textContent = 'Play Again';
    overlayEl.classList.remove('hidden');
  }

  function hideOverlay() {
    overlayEl.classList.add('hidden');
  }

  return { setScore, setBest, showMenu, showGameOver, hideOverlay };
}
