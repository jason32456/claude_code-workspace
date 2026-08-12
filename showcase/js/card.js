// Builds a single arcade "cabinet" card for a project.

const CATEGORY_CLASS = {
  Games: 'cat-games',
  Simulations: 'cat-sims',
  Wellness: 'cat-wellness',
  Tools: 'cat-tools',
  Finance: 'cat-finance',
};

// onOpen(project) is called when the card body (cover/title) is clicked.
export function createCard(project, onOpen) {
  const card = document.createElement('article');
  card.className = `card ${CATEGORY_CLASS[project.category] || ''}`;
  card.dataset.category = project.category;
  card.dataset.launchable = String(project.launchable);
  // Lowercased haystack for fast client-side search.
  card.dataset.search = [project.name, project.tagline, project.category, ...project.stack]
    .join(' ')
    .toLowerCase();

  const cover = project.screenshots[0];
  const chips = project.stack
    .slice(0, 3)
    .map((s) => `<span class="chip">${s}</span>`)
    .join('');

  const action = project.launchable
    ? `<a class="btn btn-launch" href="${project.launchHref}" target="_blank" rel="noopener">▶ Launch</a>`
    : `<button class="btn btn-view" type="button">View</button>`;

  card.innerHTML = `
    <button class="card-body" type="button" aria-label="Open ${project.name} details">
      <div class="cover">
        <img loading="lazy" src="${cover}" alt="${project.name} screenshot" />
        <span class="badge">${project.category}</span>
        ${project.launchable ? '' : '<span class="badge badge-info">demo</span>'}
      </div>
      <div class="meta">
        <h2 class="card-title">${project.name}</h2>
        <p class="card-tagline">${project.tagline}</p>
        <div class="chips">${chips}</div>
      </div>
    </button>
    <div class="card-actions">
      ${action}
      <button class="btn btn-ghost btn-details" type="button">Details</button>
    </div>
  `;

  const open = () => onOpen(project);
  card.querySelector('.card-body').addEventListener('click', open);
  card.querySelector('.btn-details').addEventListener('click', open);
  const viewBtn = card.querySelector('.btn-view');
  if (viewBtn) viewBtn.addEventListener('click', open);

  return card;
}
