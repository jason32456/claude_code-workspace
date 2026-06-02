# claude_code-workspace

A growing collection of browser and CLI app projects, each built in its own folder. Every project is self-contained — no shared dependencies at the repo root.

## Projects

| Project | Description | Stack | Status |
|---------|-------------|-------|--------|
| [particle-life](./particle-life/) | Real-time emergent particle simulation — species of particles obey pairwise attraction/repulsion rules, self-organizing into lifelike clusters, membranes, and chasers | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [focus-pet](./focus-pet/) | Pomodoro timer fused with a virtual pet — complete focus sessions to feed and evolve your blob creature, time-based decay keeps it real | Vanilla JS · SVG · CSS · localStorage | ✅ Complete |
| [maze-pathfinder](./maze-pathfinder/) | Interactive maze generator and pathfinding visualizer — watch BFS, Dijkstra, and A* explore mazes step by step, paint walls and weights, compare algorithms | Vanilla JS · CSS Grid · ES Modules | ✅ Complete |
| [order-book-simulator](./order-book-simulator/) | Limit-order-book matching engine with a live agent-based market — market makers, momentum chasers, mean-reverters, and value traders produce emergent price action viewed through a depth ladder, price chart, and trade tape | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [palette](./palette/) | Dead-simple 5-swatch color palette generator — press Space to regenerate, lock colors you love, click hex codes to copy, export as CSS variables | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [breathe](./breathe/) | Guided breathing exercise app — animated orb leads you through Box Breathing, 4-7-8, and Physiological Sigh techniques with phase labels and countdown | Vanilla JS · CSS Animations · ES Modules | ✅ Complete |
| [cocktail-finder](./cocktail-finder/) | Cocktail recipe finder — search or discover random cocktails via CocktailDB, see ingredients and instructions, save favourites to localStorage | Vanilla JS · CSS3 · CocktailDB API · ES Modules | ✅ Complete |
| [streaks](./streaks/) | Daily habit streak tracker — add up to 6 habits, check them off each day, watch streaks grow with a 30-day heatmap and confetti celebrations | Vanilla JS · CSS3 · localStorage · ES Modules | ✅ Complete |

## Running a project

Each project is a static site served locally:

```bash
cd <project-name>
python -m http.server 8080
# open http://localhost:8080
```

See each project's `README.md` for details.

## Repository layout

```
claude_code-workspace/
├── README.md          ← this file
├── CLAUDE.md          ← guide for AI agents working in this repo
├── particle-life/     ← project 1
│   ├── README.md
│   ├── index.html
│   ├── main.js
│   ├── simulation.js
│   ├── renderer.js
│   ├── controls.js
│   └── style.css
└── focus-pet/         ← project 2
    ├── README.md
    ├── index.html
    ├── main.js
    ├── pet.js
    ├── timer.js
    ├── ui.js
    └── style.css
```
