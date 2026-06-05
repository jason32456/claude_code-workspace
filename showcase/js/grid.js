// Renders the card grid and applies category + search + launchable filtering.

import { createCard } from './card.js';

export function createGrid(gridEl, emptyEl, projects, onOpen) {
  const cards = new Map(); // slug -> { el, project }

  for (const project of projects) {
    const el = createCard(project, onOpen);
    gridEl.appendChild(el);
    cards.set(project.slug, { el, project });
  }

  const state = { category: 'All', query: '', launchableOnly: false };

  function apply() {
    const q = state.query.trim().toLowerCase();
    let visible = 0;

    for (const { el, project } of cards.values()) {
      const matchCat = state.category === 'All' || project.category === state.category;
      const matchQuery = !q || el.dataset.search.includes(q);
      const matchLaunch = !state.launchableOnly || project.launchable;
      const show = matchCat && matchQuery && matchLaunch;
      el.hidden = !show;
      if (show) visible++;
    }

    emptyEl.hidden = visible > 0;
  }

  return {
    setCategory(category) {
      state.category = category;
      apply();
    },
    setQuery(query) {
      state.query = query;
      apply();
    },
    setLaunchableOnly(on) {
      state.launchableOnly = on;
      apply();
    },
  };
}
