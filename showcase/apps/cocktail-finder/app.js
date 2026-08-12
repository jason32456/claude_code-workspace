const API = 'https://www.thecocktaildb.com/api/json/v1/1';

// ── State ─────────────────────────────────────────────────
let searchMode = 'name';
let debounceTimer = null;
let favourites = loadFavourites();
let currentCocktail = null;

// ── Elements ──────────────────────────────────────────────
const searchInput  = document.getElementById('search-input');
const clearBtn     = document.getElementById('clear-btn');
const randomBtn    = document.getElementById('random-btn');
const resultsGrid  = document.getElementById('results-grid');
const detailCard   = document.getElementById('detail-card');
const skeleton     = document.getElementById('skeleton');
const cocktailDetail = document.getElementById('cocktail-detail');
const favGrid      = document.getElementById('fav-grid');
const favEmpty     = document.getElementById('fav-empty');
const favCount     = document.getElementById('fav-count');
const toast        = document.getElementById('toast');
let toastTimer     = null;

// ── Init ──────────────────────────────────────────────────
randomBtn.addEventListener('click', fetchRandom);
searchInput.addEventListener('input', onSearchInput);
clearBtn.addEventListener('click', clearSearch);

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    searchMode = btn.dataset.mode;
    searchInput.placeholder = searchMode === 'name' ? 'Search cocktails…' : 'Search by ingredient (e.g. vodka)…';
    if (searchInput.value.trim()) runSearch(searchInput.value.trim());
  });
});

updateFavBadge();
fetchRandom();

// ── Tab switching ─────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'favourites') renderFavourites();
}

// ── Search ────────────────────────────────────────────────
function onSearchInput() {
  const q = searchInput.value.trim();
  clearBtn.classList.toggle('hidden', !q);
  clearTimeout(debounceTimer);
  if (!q) {
    hideResults();
    return;
  }
  debounceTimer = setTimeout(() => runSearch(q), 400);
}

function clearSearch() {
  searchInput.value = '';
  clearBtn.classList.add('hidden');
  hideResults();
  searchInput.focus();
}

async function runSearch(q) {
  showSkeleton();
  hideResults();
  try {
    let drinks = [];
    if (searchMode === 'name') {
      const data = await apiFetch(`${API}/search.php?s=${encodeURIComponent(q)}`);
      drinks = data.drinks || [];
    } else {
      const data = await apiFetch(`${API}/filter.php?i=${encodeURIComponent(q)}`);
      drinks = data.drinks || [];
    }

    if (!drinks.length) {
      cocktailDetail.innerHTML = `<p style="padding:32px;color:var(--text-muted)">No results for "<strong>${q}</strong>"</p>`;
      cocktailDetail.classList.remove('hidden');
      skeleton.style.display = 'none';
      return;
    }

    if (drinks.length === 1) {
      const full = searchMode === 'ingredient'
        ? await fetchById(drinks[0].idDrink)
        : drinks[0];
      renderDetail(full);
    } else {
      skeleton.style.display = 'none';
      renderGrid(drinks.slice(0, 40));
    }
  } catch {
    showToast('Network error — please try again.');
    skeleton.style.display = 'none';
  }
}

// ── Random ────────────────────────────────────────────────
async function fetchRandom() {
  hideResults();
  showSkeleton();
  try {
    const data = await apiFetch(`${API}/random.php`);
    renderDetail(data.drinks[0]);
  } catch {
    showToast('Could not fetch cocktail — check your connection.');
    skeleton.style.display = 'none';
  }
}

async function fetchById(id) {
  const data = await apiFetch(`${API}/lookup.php?i=${id}`);
  return data.drinks[0];
}

// ── Render detail ─────────────────────────────────────────
function renderDetail(drink) {
  currentCocktail = drink;
  const ingredients = getIngredients(drink);
  const isFav = favourites.some(f => f.idDrink === drink.idDrink);

  cocktailDetail.innerHTML = `
    <div class="cocktail-img-wrap">
      <img class="cocktail-img" src="${drink.strDrinkThumb}" alt="${drink.strDrink}" loading="lazy" />
      <button class="fav-btn" id="fav-toggle" title="${isFav ? 'Remove from favourites' : 'Add to favourites'}">
        ${isFav ? '⭐' : '☆'}
      </button>
    </div>
    <div class="cocktail-info">
      <div class="cocktail-meta">
        <span class="badge-pill">${drink.strCategory || 'Cocktail'}</span>
        <span class="badge-pill ${drink.strAlcoholic === 'Alcoholic' ? 'alcoholic' : 'non-alcoholic'}">
          ${drink.strAlcoholic || 'Unknown'}
        </span>
        ${drink.strGlass ? `<span class="badge-pill">${drink.strGlass}</span>` : ''}
      </div>
      <h1 class="cocktail-name">${drink.strDrink}</h1>
      <div>
        <p class="section-label">Ingredients</p>
        <ul class="ingredients-list">
          ${ingredients.map(i => `
            <li>
              <span class="ing-name">${i.name}</span>
              <span class="ing-measure">${i.measure}</span>
            </li>
          `).join('')}
        </ul>
      </div>
      <div>
        <p class="section-label">Instructions</p>
        <p class="instructions">${drink.strInstructions || 'No instructions available.'}</p>
      </div>
      <button class="copy-btn" id="copy-recipe">📋 Copy Recipe</button>
    </div>
  `;

  skeleton.style.display = 'none';
  cocktailDetail.classList.remove('hidden');
  resultsGrid.classList.add('hidden');

  document.getElementById('fav-toggle').addEventListener('click', () => toggleFavourite(drink));
  document.getElementById('copy-recipe').addEventListener('click', () => copyRecipe(drink, ingredients));
}

// ── Render results grid ───────────────────────────────────
function renderGrid(drinks) {
  resultsGrid.innerHTML = drinks.map(d => `
    <div class="result-card" data-id="${d.idDrink}">
      <img src="${d.strDrinkThumb}/preview" alt="${d.strDrink}" loading="lazy" />
      <div class="result-card-body">
        <p class="result-card-name">${d.strDrink}</p>
      </div>
    </div>
  `).join('');

  resultsGrid.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('click', async () => {
      showSkeleton();
      resultsGrid.classList.add('hidden');
      const drink = await fetchById(card.dataset.id);
      renderDetail(drink);
    });
  });

  resultsGrid.classList.remove('hidden');
  skeleton.style.display = 'none';
  cocktailDetail.classList.add('hidden');
}

// ── Favourites ────────────────────────────────────────────
function toggleFavourite(drink) {
  const idx = favourites.findIndex(f => f.idDrink === drink.idDrink);
  if (idx === -1) {
    favourites.push(drink);
    showToast('⭐ Added to favourites');
  } else {
    favourites.splice(idx, 1);
    showToast('Removed from favourites');
  }
  saveFavourites();
  updateFavBadge();
  if (currentCocktail?.idDrink === drink.idDrink) renderDetail(drink);
}

function renderFavourites() {
  const empty = favourites.length === 0;
  favEmpty.style.display = empty ? 'block' : 'none';
  favGrid.style.display  = empty ? 'none' : 'grid';
  if (empty) return;

  favGrid.innerHTML = favourites.map(d => `
    <div class="result-card" data-id="${d.idDrink}">
      <img src="${d.strDrinkThumb}/preview" alt="${d.strDrink}" loading="lazy" />
      <div class="result-card-body">
        <p class="result-card-name">${d.strDrink}</p>
      </div>
    </div>
  `).join('');

  favGrid.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('click', () => {
      switchTab('discover');
      const drink = favourites.find(f => f.idDrink === card.dataset.id);
      renderDetail(drink);
    });
  });
}

function updateFavBadge() {
  favCount.textContent = favourites.length;
  favCount.classList.toggle('hidden', favourites.length === 0);
}

function loadFavourites() {
  try { return JSON.parse(localStorage.getItem('mixologist-favs') || '[]'); } catch { return []; }
}

function saveFavourites() {
  localStorage.setItem('mixologist-favs', JSON.stringify(favourites));
}

// ── Copy recipe ───────────────────────────────────────────
async function copyRecipe(drink, ingredients) {
  const lines = [
    `🍹 ${drink.strDrink}`,
    `Category: ${drink.strCategory} | ${drink.strAlcoholic}`,
    '',
    'INGREDIENTS',
    ...ingredients.map(i => `  ${i.measure}  ${i.name}`),
    '',
    'INSTRUCTIONS',
    drink.strInstructions,
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showToast('📋 Recipe copied to clipboard!');
  } catch {
    showToast('Could not copy — please copy manually.');
  }
}

// ── Helpers ───────────────────────────────────────────────
function getIngredients(drink) {
  const list = [];
  for (let i = 1; i <= 15; i++) {
    const name    = drink[`strIngredient${i}`];
    const measure = drink[`strMeasure${i}`];
    if (!name) break;
    list.push({ name: name.trim(), measure: (measure || '').trim() || 'to taste' });
  }
  return list;
}

function showSkeleton() {
  skeleton.style.display = 'flex';
  cocktailDetail.classList.add('hidden');
}

function hideResults() {
  resultsGrid.classList.add('hidden');
}

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => {
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2500);
  });
}
