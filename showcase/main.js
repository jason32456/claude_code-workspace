import { projects, CATEGORIES } from './data/projects.js';
import { createGrid } from './js/grid.js';
import { createModal } from './js/modal.js';

const modal = createModal(document.getElementById('modal-root'));

const grid = createGrid(
  document.getElementById('grid'),
  document.getElementById('empty'),
  projects,
  (project) => modal.open(project)
);

// Project count in the hero.
document.getElementById('count').textContent = `${projects.length} cabinets`;

// Category filter pills.
const filtersEl = document.getElementById('filters');
['All', ...CATEGORIES].forEach((cat, i) => {
  const btn = document.createElement('button');
  btn.className = 'pill' + (i === 0 ? ' active' : '');
  btn.type = 'button';
  btn.textContent = cat;
  btn.setAttribute('role', 'tab');
  btn.addEventListener('click', () => {
    filtersEl.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    grid.setCategory(cat);
  });
  filtersEl.appendChild(btn);
});

// Search + launchable toggle.
document.getElementById('search').addEventListener('input', (e) => grid.setQuery(e.target.value));
document.getElementById('launchableOnly').addEventListener('change', (e) => grid.setLaunchableOnly(e.target.checked));
