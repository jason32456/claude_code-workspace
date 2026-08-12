# PRD — Mixologist: Cocktail Recipe Finder

## Overview

**Mixologist** is a single-page browser app that lets users discover, search, and save cocktail recipes. It combines the delight of surprise (random recipe button) with practical utility (ingredient lists, step-by-step instructions) and personalisation (local favourites).

---

## Problem Statement

People who want to make cocktails at home have no quick, beautiful way to discover recipes. Recipe sites are cluttered with ads, require accounts, and bury instructions under long blog posts. Mixologist cuts straight to the recipe with zero friction.

---

## Target Audience

- Home bartenders and cocktail enthusiasts
- People browsing for party drink ideas
- Anyone curious what to make with ingredients they have on hand

---

## Core Features

### P0 — Must Have
| Feature | Description |
|---------|-------------|
| Random cocktail | Press "Shake it up!" to load a random cocktail with image, ingredients, and instructions |
| Cocktail detail card | Large image, name, category, alcoholic/non-alcoholic badge, ingredient+measure list, instructions |
| Search by name | Live search bar; fetch results from CocktailDB as user types (debounced 400 ms) |
| Favourites | Star icon saves/removes cocktail to localStorage; Favourites tab shows saved cards |

### P1 — Should Have
| Feature | Description |
|---------|-------------|
| Search by ingredient | Toggle to search by main ingredient (e.g. "vodka") |
| Category filter | Filter by category (Cocktail, Shot, Punch, etc.) |
| Copy recipe | One-click copies recipe text to clipboard |
| Loading skeleton | Skeleton placeholder while fetching |

### P2 — Nice to Have
| Feature | Description |
|---------|-------------|
| Ingredient substitutions note | Short static tips on common substitutions |
| Dark / light mode toggle | Respects prefers-color-scheme by default, manual toggle available |

---

## Technical Requirements

- **Stack:** Vanilla HTML · CSS3 · ES Modules (no build tools)
- **Data source:** [TheCocktailDB](https://www.thecocktaildb.com/api.php) free public API (no auth required)
- **Storage:** `localStorage` for favourites
- **Compatibility:** Modern browsers (Chrome, Firefox, Safari, Edge — last 2 major versions)
- **Deployment:** Static site, served from its own folder; Vercel-compatible

### Key API Endpoints
```
Random:         GET https://www.thecocktaildb.com/api/json/v1/1/random.php
Search name:    GET https://www.thecocktaildb.com/api/json/v1/1/search.php?s={name}
Search ingr.:   GET https://www.thecocktaildb.com/api/json/v1/1/filter.php?i={ingredient}
Lookup by ID:   GET https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i={id}
Category list:  GET https://www.thecocktaildb.com/api/json/v1/1/list.php?c=list
```

---

## Design Principles

1. **Zero friction** — random recipe visible immediately on load; no required inputs
2. **Visual-first** — cocktail photo is the hero; typography supports, not competes
3. **Mobile-friendly** — single-column layout on small screens, two-column on wide
4. **Dark by default** — rich dark background makes cocktail photos pop

---

## Success Metrics (qualitative)

- A user can find a complete cocktail recipe in under 5 seconds
- Favourites persist across page reloads
- Works offline after first load (favourites tab still usable from localStorage)

---

## Out of Scope

- User accounts / server-side storage
- Nutritional information
- Shopping list / ingredient ordering
- Social sharing beyond clipboard copy
