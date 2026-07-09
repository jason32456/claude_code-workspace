const SOUNDS = [
  { id: 'rain', name: 'Rain', icon: '🌧️', url: 'https://assets.mixkit.co/active_storage/sfx/2389/2389-preview.mp3' },
  { id: 'coffee', name: 'Coffee Shop', icon: '☕', url: 'https://assets.mixkit.co/active_storage/sfx/2382/2382-preview.mp3' },
  { id: 'forest', name: 'Forest', icon: '🌲', url: 'https://assets.mixkit.co/active_storage/sfx/2391/2391-preview.mp3' },
  { id: 'ocean', name: 'Ocean Waves', icon: '🌊', url: 'https://assets.mixkit.co/active_storage/sfx/2393/2393-preview.mp3' },
  { id: 'fireplace', name: 'Fireplace', icon: '🔥', url: 'https://assets.mixkit.co/active_storage/sfx/2388/2388-preview.mp3' },
  { id: 'typing', name: 'Keyboard', icon: '⌨️', url: 'https://assets.mixkit.co/active_storage/sfx/2381/2381-preview.mp3' },
  { id: 'wind', name: 'Wind', icon: '💨', url: 'https://assets.mixkit.co/active_storage/sfx/2384/2384-preview.mp3' },
  { id: 'stream', name: 'Stream', icon: '💧', url: 'https://assets.mixkit.co/active_storage/sfx/2390/2390-preview.mp3' },
  { id: 'city', name: 'City Traffic', icon: '🚗', url: 'https://assets.mixkit.co/active_storage/sfx/2383/2383-preview.mp3' },
  { id: 'leaves', name: 'Leaves', icon: '🍂', url: 'https://assets.mixkit.co/active_storage/sfx/2385/2385-preview.mp3' },
];

const DEFAULT_PRESETS = {
  focus: { name: 'Focus', sounds: [{ id: 'rain', volume: 60 }, { id: 'coffee', volume: 40 }] },
  relax: { name: 'Relax', sounds: [{ id: 'stream', volume: 50 }, { id: 'forest', volume: 50 }] },
  sleep: { name: 'Sleep', sounds: [{ id: 'rain', volume: 70 }] },
  work: { name: 'Work', sounds: [{ id: 'typing', volume: 40 }, { id: 'coffee', volume: 50 }] },
};

class AmbientMixer {
  constructor() {
    this.audioContext = null;
    this.audioSources = new Map();
    this.gainNodes = new Map();
    this.masterGain = null;
    this.isPlaying = false;
    this.currentMix = [];

    this.initAudio();
    this.renderSoundLibrary();
    this.setupEventListeners();
    this.loadSavedMixes();
  }

  initAudio() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.value = 0.7;
  }

  renderSoundLibrary() {
    const grid = document.getElementById('soundsGrid');
    grid.innerHTML = SOUNDS.map(sound => `
      <div class="sound-tile" draggable="true" data-sound-id="${sound.id}">
        <div class="sound-icon">${sound.icon}</div>
        <div class="sound-name">${sound.name}</div>
      </div>
    `).join('');

    grid.querySelectorAll('.sound-tile').forEach(tile => {
      tile.addEventListener('dragstart', (e) => this.handleDragStart(e));
      tile.addEventListener('dragend', (e) => this.handleDragEnd(e));
    });
  }

  handleDragStart(e) {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('sound-id', e.target.closest('.sound-tile').dataset.soundId);
    e.target.closest('.sound-tile').style.opacity = '0.6';
  }

  handleDragEnd(e) {
    e.target.closest('.sound-tile').style.opacity = '1';
  }

  setupEventListeners() {
    const mixer = document.getElementById('mixerPanel');

    mixer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      mixer.classList.add('drag-over');
    });

    mixer.addEventListener('dragleave', () => {
      mixer.classList.remove('drag-over');
    });

    mixer.addEventListener('drop', (e) => {
      e.preventDefault();
      mixer.classList.remove('drag-over');
      const soundId = e.dataTransfer.getData('sound-id');
      this.addSoundToMix(soundId);
    });

    document.getElementById('playBtn').addEventListener('click', () => this.play());
    document.getElementById('stopBtn').addEventListener('click', () => this.stop());
    document.getElementById('saveMixBtn').addEventListener('click', () => this.saveMix());
    document.getElementById('masterVolume').addEventListener('input', (e) => this.updateMasterVolume(e));
  }

  addSoundToMix(soundId) {
    const sound = SOUNDS.find(s => s.id === soundId);
    if (!sound) return;

    if (this.currentMix.some(s => s.id === soundId)) return;
    if (this.currentMix.length >= 5) return;

    this.currentMix.push({ ...sound, volume: 50 });
    this.renderMixer();
  }

  renderMixer() {
    const mixer = document.getElementById('mixerPanel');

    if (this.currentMix.length === 0) {
      mixer.innerHTML = '<p class="empty-state">Drag sounds here to create your mix</p>';
      return;
    }

    mixer.innerHTML = this.currentMix.map((sound, idx) => `
      <div class="mixer-item">
        <span class="sound-icon">${sound.icon}</span>
        <span class="mixer-item-name">${sound.name}</span>
        <div class="mixer-item-slider">
          <input type="range" min="0" max="100" value="${sound.volume}" data-sound-idx="${idx}">
        </div>
        <span class="mixer-item-label">${sound.volume}%</span>
        <button class="mixer-item-remove" data-sound-idx="${idx}">✕</button>
      </div>
    `).join('');

    mixer.querySelectorAll('input[type="range"]').forEach(slider => {
      slider.addEventListener('input', (e) => this.updateSoundVolume(e));
    });

    mixer.querySelectorAll('.mixer-item-remove').forEach(btn => {
      btn.addEventListener('click', (e) => this.removeSoundFromMix(e));
    });
  }

  updateSoundVolume(e) {
    const idx = parseInt(e.target.dataset.soundIdx);
    const volume = parseInt(e.target.value);
    this.currentMix[idx].volume = volume;

    e.target.parentElement.parentElement.querySelector('.mixer-item-label').textContent = `${volume}%`;

    if (this.isPlaying && this.gainNodes.has(this.currentMix[idx].id)) {
      const gainNode = this.gainNodes.get(this.currentMix[idx].id);
      gainNode.gain.value = volume / 100;
    }
  }

  removeSoundFromMix(e) {
    const idx = parseInt(e.target.dataset.soundIdx);
    const sound = this.currentMix[idx];

    if (this.isPlaying) {
      this.stopSound(sound.id);
    }

    this.currentMix.splice(idx, 1);
    this.renderMixer();
  }

  async play() {
    if (this.isPlaying || this.currentMix.length === 0) return;

    this.isPlaying = true;
    document.getElementById('playBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;

    for (const sound of this.currentMix) {
      this.playSound(sound);
    }
  }

  async playSound(sound) {
    try {
      const response = await fetch(sound.url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;

      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = sound.volume / 100;

      source.connect(gainNode);
      gainNode.connect(this.masterGain);

      source.start(0);

      this.audioSources.set(sound.id, source);
      this.gainNodes.set(sound.id, gainNode);
    } catch (error) {
      console.error(`Failed to load sound ${sound.id}:`, error);
    }
  }

  stop() {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    document.getElementById('playBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;

    this.audioSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });

    this.audioSources.clear();
    this.gainNodes.clear();
  }

  stopSound(soundId) {
    const source = this.audioSources.get(soundId);
    if (source) {
      try {
        source.stop();
      } catch (e) {}
      this.audioSources.delete(soundId);
      this.gainNodes.delete(soundId);
    }
  }

  updateMasterVolume(e) {
    const volume = parseInt(e.target.value);
    this.masterGain.gain.value = volume / 100;
    document.getElementById('masterLabel').textContent = `${volume}%`;
  }

  saveMix() {
    const name = document.getElementById('mixName').value.trim();
    if (!name || this.currentMix.length === 0) return;

    const mixes = JSON.parse(localStorage.getItem('ambient-mixes') || '{}');
    mixes[name] = this.currentMix.map(s => ({ id: s.id, volume: s.volume }));
    localStorage.setItem('ambient-mixes', JSON.stringify(mixes));

    document.getElementById('mixName').value = '';
    this.loadSavedMixes();
  }

  loadSavedMixes() {
    const mixes = JSON.parse(localStorage.getItem('ambient-mixes') || '{}');
    const container = document.getElementById('savedMixes');

    if (Object.keys(mixes).length === 0) {
      container.innerHTML = '<p class="empty-state">No saved mixes yet</p>';
      return;
    }

    container.innerHTML = Object.entries(mixes).map(([name, sounds]) => `
      <div class="saved-mix-card">
        <span class="saved-mix-name">${name}</span>
        <div class="saved-mix-actions">
          <button class="btn-load" data-mix-name="${name}">Load</button>
          <button class="btn-delete" data-mix-name="${name}">🗑️</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-load').forEach(btn => {
      btn.addEventListener('click', (e) => this.loadMix(e.target.dataset.mixName));
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => this.deleteMix(e.target.dataset.mixName));
    });
  }

  loadMix(name) {
    const mixes = JSON.parse(localStorage.getItem('ambient-mixes') || '{}');
    const mixData = mixes[name];
    if (!mixData) return;

    if (this.isPlaying) this.stop();

    this.currentMix = mixData.map(item => {
      const sound = SOUNDS.find(s => s.id === item.id);
      return { ...sound, volume: item.volume };
    }).filter(s => s);

    this.renderMixer();
  }

  deleteMix(name) {
    if (!confirm(`Delete "${name}"?`)) return;
    const mixes = JSON.parse(localStorage.getItem('ambient-mixes') || '{}');
    delete mixes[name];
    localStorage.setItem('ambient-mixes', JSON.stringify(mixes));
    this.loadSavedMixes();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AmbientMixer();
});
