const scoreEl    = document.getElementById('score');
const bestEl     = document.getElementById('best');
const overlayEl  = document.getElementById('overlay');
const titleEl    = document.getElementById('overlay-title');
const subtitleEl = document.getElementById('overlay-subtitle');
const playBtn    = document.getElementById('play-btn');
const diffBtns   = Array.from(document.querySelectorAll('.diff-btn'));

export function createHUD(onPlay, onDifficultyChange) {
  playBtn.addEventListener('click', onPlay);

  let difficulty = localStorage.getItem('crossyDifficulty') || 'normal';
  applyDifficultySelection(difficulty);

  diffBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      difficulty = btn.dataset.diff;
      localStorage.setItem('crossyDifficulty', difficulty);
      applyDifficultySelection(difficulty);
      if (onDifficultyChange) onDifficultyChange(difficulty);
    });
  });

  function applyDifficultySelection(key) {
    diffBtns.forEach((b) => b.classList.toggle('selected', b.dataset.diff === key));
  }

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

  function getDifficulty() {
    return difficulty;
  }

  return { setScore, setBest, showMenu, showGameOver, hideOverlay, getDifficulty };
}
