import { Wheel } from './wheel.js';
import {
  loadPresets, savePreset, deletePreset,
  loadCurrentOptions, saveCurrentOptions,
  loadHistory, pushHistory, clearHistory,
} from './storage.js';
import { burstConfetti, playTick, playDing } from './effects.js';

const canvas = document.getElementById('wheel');
const wheel = new Wheel(canvas);

const optionsInput = document.getElementById('optionsInput');
const optionCount = document.getElementById('optionCount');
const spinBtn = document.getElementById('spinBtn');
const eliminationToggle = document.getElementById('eliminationToggle');

const presetSelect = document.getElementById('presetSelect');
const presetName = document.getElementById('presetName');
const loadPresetBtn = document.getElementById('loadPresetBtn');
const savePresetBtn = document.getElementById('savePresetBtn');
const deletePresetBtn = document.getElementById('deletePresetBtn');

const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const resultModal = document.getElementById('resultModal');
const resultText = document.getElementById('resultText');
const closeModalBtn = document.getElementById('closeModalBtn');
const confettiCanvas = document.getElementById('confettiCanvas');

function parseOptions(text) {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function refreshWheelFromInput() {
  const options = parseOptions(optionsInput.value);
  wheel.setOptions(options);
  optionCount.textContent = `${options.length} option${options.length === 1 ? '' : 's'}`;
  spinBtn.disabled = options.length < 2;
  saveCurrentOptions(options);
}

function renderPresetSelect() {
  const presets = loadPresets();
  const names = Object.keys(presets);
  presetSelect.innerHTML = '<option value="">— Load a preset —</option>' +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}

function renderHistory() {
  const history = loadHistory();
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-empty">No spins yet</li>';
    return;
  }
  historyList.innerHTML = history
    .map((h) => `<li><span>${escapeHtml(h.result)}</span><span>${h.time}</span></li>`)
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function doSpin() {
  const options = parseOptions(optionsInput.value);
  if (options.length < 2 || wheel.spinning) return;
  const winnerIndex = Math.floor(Math.random() * options.length);
  spinBtn.disabled = true;
  wheel.onTick = playTick;
  wheel.onFinish = (idx) => {
    const winner = options[idx];
    resultText.textContent = winner;
    resultModal.classList.remove('hidden');
    burstConfetti(confettiCanvas);
    playDing();

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    pushHistory({ result: winner, time });
    renderHistory();

    if (eliminationToggle.checked) {
      const remaining = options.filter((_, i) => i !== idx);
      optionsInput.value = remaining.join('\n');
      refreshWheelFromInput();
    } else {
      spinBtn.disabled = options.length < 2;
    }
  };
  wheel.spinTo(winnerIndex);
}

optionsInput.addEventListener('input', refreshWheelFromInput);
canvas.addEventListener('click', doSpin);
spinBtn.addEventListener('click', doSpin);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && document.activeElement !== optionsInput && document.activeElement !== presetName) {
    e.preventDefault();
    doSpin();
  }
});

closeModalBtn.addEventListener('click', () => resultModal.classList.add('hidden'));
resultModal.addEventListener('click', (e) => {
  if (e.target === resultModal) resultModal.classList.add('hidden');
});

loadPresetBtn.addEventListener('click', () => {
  const name = presetSelect.value;
  if (!name) return;
  const presets = loadPresets();
  const options = presets[name] || [];
  optionsInput.value = options.join('\n');
  refreshWheelFromInput();
});

savePresetBtn.addEventListener('click', () => {
  const name = presetName.value.trim();
  if (!name) return;
  const options = parseOptions(optionsInput.value);
  if (options.length < 2) return;
  savePreset(name, options);
  presetName.value = '';
  renderPresetSelect();
  presetSelect.value = name;
});

deletePresetBtn.addEventListener('click', () => {
  const name = presetSelect.value;
  if (!name) return;
  deletePreset(name);
  renderPresetSelect();
});

clearHistoryBtn.addEventListener('click', () => {
  clearHistory();
  renderHistory();
});

window.addEventListener('resize', () => {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
});

// Init
optionsInput.value = loadCurrentOptions().join('\n');
refreshWheelFromInput();
renderPresetSelect();
renderHistory();
