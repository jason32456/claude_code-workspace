// Reusable detail/gallery modal. One instance handles every project.

const RUN_LABEL = {
  static: 'Static site',
  next: 'Next.js app',
  python: 'Python CLI',
  'vite-unbuilt': 'Vite / TypeScript',
};

export function createModal(rootEl) {
  let current = null;
  let shotIndex = 0;
  let lastFocused = null;

  rootEl.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" hidden>
      <div class="modal-backdrop" data-close></div>
      <div class="modal-panel" role="document">
        <button class="modal-close" type="button" data-close aria-label="Close">✕</button>
        <div class="modal-gallery">
          <div class="stage" id="stage"></div>
          <button class="nav nav-prev" type="button" aria-label="Previous">‹</button>
          <button class="nav nav-next" type="button" aria-label="Next">›</button>
          <div class="thumbs" id="thumbs"></div>
        </div>
        <div class="modal-info">
          <span class="badge" id="modal-cat"></span>
          <h2 id="modal-title"></h2>
          <p class="modal-tagline" id="modal-tagline"></p>
          <p class="modal-desc" id="modal-desc"></p>
          <div class="chips" id="modal-chips"></div>
          <div class="run-block">
            <span class="run-type" id="modal-runtype"></span>
            <code id="modal-runcmd"></code>
          </div>
          <div class="modal-actions" id="modal-actions"></div>
        </div>
      </div>
    </div>
  `;

  const modal = rootEl.querySelector('.modal');
  const stage = rootEl.querySelector('#stage');
  const thumbs = rootEl.querySelector('#thumbs');
  const prevBtn = rootEl.querySelector('.nav-prev');
  const nextBtn = rootEl.querySelector('.nav-next');

  function renderStage() {
    const total = current.video ? current.screenshots.length + 1 : current.screenshots.length;
    const showVideo = current.video && shotIndex === current.screenshots.length;

    stage.innerHTML = showVideo
      ? `<video src="${current.video}" controls autoplay muted loop playsinline></video>`
      : `<img src="${current.screenshots[shotIndex]}" alt="${current.name} screenshot ${shotIndex + 1}" />`;

    thumbs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === shotIndex));
    const multi = total > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
  }

  function buildThumbs() {
    const items = current.screenshots.map(
      (src, i) => `<button type="button" data-i="${i}"><img src="${src}" alt="" loading="lazy" /></button>`
    );
    if (current.video) {
      items.push(`<button type="button" data-i="${current.screenshots.length}" class="thumb-video">▶ demo</button>`);
    }
    thumbs.innerHTML = items.join('');
    thumbs.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        shotIndex = Number(b.dataset.i);
        renderStage();
      })
    );
  }

  function step(dir) {
    const total = current.video ? current.screenshots.length + 1 : current.screenshots.length;
    shotIndex = (shotIndex + dir + total) % total;
    renderStage();
  }

  function open(project) {
    current = project;
    shotIndex = 0;
    lastFocused = document.activeElement;

    rootEl.querySelector('#modal-cat').textContent = project.category;
    rootEl.querySelector('#modal-title').textContent = project.name;
    rootEl.querySelector('#modal-tagline').textContent = project.tagline;
    rootEl.querySelector('#modal-desc').textContent = project.description;
    rootEl.querySelector('#modal-chips').innerHTML = project.stack
      .map((s) => `<span class="chip">${s}</span>`)
      .join('');
    rootEl.querySelector('#modal-runtype').textContent = RUN_LABEL[project.runType] || project.runType;
    rootEl.querySelector('#modal-runcmd').textContent = project.runCommand;

    const actions = project.launchable
      ? `<a class="btn btn-launch" href="${project.sourceHref}" target="_blank" rel="noopener">▶ Launch app</a>
         <a class="btn btn-ghost" href="${project.sourceHref}" target="_blank" rel="noopener">Source folder</a>`
      : `<a class="btn btn-ghost" href="${project.sourceHref}" target="_blank" rel="noopener">Open source folder</a>
         <span class="run-note">Needs a build/server step — see command above.</span>`;
    rootEl.querySelector('#modal-actions').innerHTML = actions;

    buildThumbs();
    renderStage();

    modal.hidden = false;
    document.body.classList.add('modal-open');
    rootEl.querySelector('.modal-close').focus();
  }

  function close() {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    stage.innerHTML = ''; // stop any playing video
    if (lastFocused) lastFocused.focus();
  }

  rootEl.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));

  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  return { open, close };
}
