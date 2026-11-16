import { FRAME_COUNT, FRAME_NAMES } from './stage-pose.js';

export const CAPTIONS = [
  'Any shape with straight sides.',
  'Cut it into simple cells. Turn each cell into a rectangle.',
  'Recut every rectangle to the same height.',
  'Push them together: a ribbon. Every shape of this area makes the same ribbon.',
  'So cut the ribbon the way the other shape needs, too.',
  'Run its cutting backwards.',
  'The same pieces. Only slid and turned, never flipped. Nothing left over.',
];

export function createTimeline(root, playhead, onChange) {
  const scrub = root.querySelector('#scrub');
  const play = root.querySelector('#play');
  const stops = root.querySelector('.stops');
  const caption = document.querySelector('#caption');
  let shownCaption = -1;

  FRAME_NAMES.forEach((name, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stop';
    button.textContent = name;
    button.setAttribute('aria-label', `Go to step ${i + 1}: ${name}`);
    button.addEventListener('click', () => {
      playhead.goTo(i);
      onChange();
    });
    li.append(button);
    stops.append(li);
  });

  root.querySelector('#step-back').addEventListener('click', () => {
    playhead.step(-1);
    onChange();
  });
  root.querySelector('#step-fwd').addEventListener('click', () => {
    playhead.step(1);
    onChange();
  });
  play.addEventListener('click', () => {
    playhead.toggle();
    onChange();
  });

  let resume = false;
  scrub.addEventListener('pointerdown', () => {
    resume = playhead.playing;
    playhead.pause();
  });
  const release = () => {
    if (resume) playhead.play();
    resume = false;
    onChange();
  };
  scrub.addEventListener('pointerup', release);
  scrub.addEventListener('pointercancel', release);
  scrub.addEventListener('input', () => {
    playhead.scrub(Number(scrub.value));
    onChange();
  });
  scrub.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    playhead.step(e.key === 'ArrowRight' ? 1 : -1);
    onChange();
  });

  return {
    update() {
      if (document.activeElement !== scrub || playhead.playing || playhead.target !== null) scrub.value = String(playhead.pos);
      play.setAttribute('aria-pressed', String(playhead.playing));
      play.setAttribute('aria-label', playhead.playing ? 'Pause' : 'Play');
      play.dataset.state = playhead.playing ? 'playing' : 'paused';
      const near = playhead.nearestStop();
      stops.querySelectorAll('.stop').forEach((el, i) => el.toggleAttribute('data-current', i === near));
      scrub.setAttribute('aria-valuetext', `Step ${near + 1} of ${FRAME_COUNT}: ${FRAME_NAMES[near]}`);
      if (near !== shownCaption) {
        shownCaption = near;
        caption.textContent = CAPTIONS[near];
      }
    },
  };
}
