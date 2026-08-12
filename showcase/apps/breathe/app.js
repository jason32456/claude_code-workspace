const TECHNIQUES = {
  box: {
    name: 'Box Breathing',
    description: '4s in · 4s hold · 4s out · 4s hold — great for focus and calm under pressure.',
    phases: [
      { label: 'Inhale',  duration: 4, type: 'inhale',  scale: 1.6 },
      { label: 'Hold',    duration: 4, type: 'hold',    scale: 1.6 },
      { label: 'Exhale',  duration: 4, type: 'exhale',  scale: 1.0 },
      { label: 'Hold',    duration: 4, type: 'hold',    scale: 1.0 },
    ],
  },
  '478': {
    name: '4-7-8 Technique',
    description: '4s in · 7s hold · 8s out — helps with sleep and acute anxiety.',
    phases: [
      { label: 'Inhale',  duration: 4, type: 'inhale', scale: 1.6 },
      { label: 'Hold',    duration: 7, type: 'hold',   scale: 1.6 },
      { label: 'Exhale',  duration: 8, type: 'exhale', scale: 1.0 },
    ],
  },
  sigh: {
    name: 'Physiological Sigh',
    description: '2s in · 1s sniff · 4s out — the fastest way to reduce stress.',
    phases: [
      { label: 'Inhale',  duration: 2, type: 'inhale', scale: 1.4 },
      { label: 'Sniff',   duration: 1, type: 'inhale', scale: 1.6 },
      { label: 'Exhale',  duration: 4, type: 'exhale', scale: 1.0 },
    ],
  },
};

const orb        = document.getElementById('orb');
const phaseText  = document.getElementById('phaseText');
const countdown  = document.getElementById('countdown');
const roundDisp  = document.getElementById('roundDisplay');
const startBtn   = document.getElementById('startBtn');
const techInfo   = document.getElementById('techniqueInfo');
const app        = document.querySelector('.app');

let currentTechnique = 'box';
let totalRounds = 3;
let running = false;
let stopped = false;
let animationId = null;

function setTechnique(key) {
  currentTechnique = key;
  document.querySelectorAll('.technique-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.technique === key);
  });
  techInfo.textContent = TECHNIQUES[key].description;
  resetUI();
}

function setRounds(n) {
  totalRounds = n;
  document.querySelectorAll('.round-btn').forEach(b => {
    b.classList.toggle('active', +b.dataset.rounds === n);
  });
  resetUI();
}

function resetUI() {
  if (running) stop();
  orb.className = 'orb';
  orb.style.transform = '';
  orb.style.transition = '';
  phaseText.textContent = 'Ready';
  countdown.textContent = '';
  roundDisp.textContent = 'Round — of —';
  startBtn.textContent = 'Start';
  startBtn.classList.remove('running');
  app.classList.remove('done');
}

function stop() {
  running = false;
  stopped = true;
  if (animationId) clearTimeout(animationId);
}

function animatePhase(phase, onComplete) {
  const { label, duration, type, scale } = phase;

  orb.className = `orb ${type}`;
  phaseText.textContent = label;

  const easing = type === 'inhale'
    ? `cubic-bezier(0.4, 0, 0.6, 1) ${duration}s`
    : type === 'exhale'
    ? `cubic-bezier(0.4, 0, 0.6, 1) ${duration}s`
    : `none 0s`;

  orb.style.transition = `transform ${easing}`;
  orb.style.transform = `scale(${scale})`;

  let remaining = duration;
  countdown.textContent = remaining;

  const tick = () => {
    if (stopped) return;
    remaining -= 1;
    if (remaining > 0) {
      countdown.textContent = remaining;
      animationId = setTimeout(tick, 1000);
    } else {
      countdown.textContent = '';
      onComplete();
    }
  };
  animationId = setTimeout(tick, 1000);
}

function runSession() {
  const tech = TECHNIQUES[currentTechnique];
  const phases = tech.phases;
  let round = 1;
  let phaseIdx = 0;

  function nextPhase() {
    if (stopped) return;
    if (phaseIdx >= phases.length) {
      phaseIdx = 0;
      round += 1;
      if (round > totalRounds) {
        finishSession();
        return;
      }
    }
    roundDisp.textContent = `Round ${round} of ${totalRounds}`;
    animatePhase(phases[phaseIdx], () => {
      phaseIdx++;
      nextPhase();
    });
  }

  roundDisp.textContent = `Round 1 of ${totalRounds}`;
  nextPhase();
}

function finishSession() {
  running = false;
  orb.className = 'orb';
  orb.style.transform = 'scale(1)';
  phaseText.textContent = 'Done';
  countdown.textContent = '';
  roundDisp.textContent = `Completed ${totalRounds} rounds`;
  startBtn.textContent = 'Again';
  startBtn.classList.remove('running');
  app.classList.add('done');
}

startBtn.addEventListener('click', () => {
  if (running) {
    stop();
    resetUI();
    return;
  }
  running = true;
  stopped = false;
  app.classList.remove('done');
  startBtn.textContent = 'Stop';
  startBtn.classList.add('running');
  runSession();
});

document.querySelectorAll('.technique-btn').forEach(btn => {
  btn.addEventListener('click', () => setTechnique(btn.dataset.technique));
});

document.querySelectorAll('.round-btn').forEach(btn => {
  btn.addEventListener('click', () => setRounds(+btn.dataset.rounds));
});

// Init
techInfo.textContent = TECHNIQUES[currentTechnique].description;
