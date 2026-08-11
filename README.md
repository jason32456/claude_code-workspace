# claude_code-workspace

A growing collection of browser and CLI app projects, each built in its own folder. Every project is self-contained — no shared dependencies at the repo root.

## Projects

| Project | Description | Stack | Status |
|---------|-------------|-------|--------|
| [showcase](./showcase/) | Arcade-style launcher for every app in this repo — neon cabinet cards, category filters and search, a screenshot-gallery modal, and live "Launch" buttons for the runnable projects | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [particle-life](./particle-life/) | Real-time emergent particle simulation — species of particles obey pairwise attraction/repulsion rules, self-organizing into lifelike clusters, membranes, and chasers | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [focus-pet](./focus-pet/) | Pomodoro timer fused with a virtual pet — complete focus sessions to feed and evolve your blob creature, time-based decay keeps it real | Vanilla JS · SVG · CSS · localStorage | ✅ Complete |
| [maze-pathfinder](./maze-pathfinder/) | Interactive maze generator and pathfinding visualizer — watch BFS, Dijkstra, and A* explore mazes step by step, paint walls and weights, compare algorithms | Vanilla JS · CSS Grid · ES Modules | ✅ Complete |
| [order-book-simulator](./order-book-simulator/) | Limit-order-book matching engine with a live agent-based market — market makers, momentum chasers, mean-reverters, and value traders produce emergent price action viewed through a depth ladder, price chart, and trade tape | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [palette](./palette/) | Dead-simple 5-swatch color palette generator — press Space to regenerate, lock colors you love, click hex codes to copy, export as CSS variables | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [breathe](./breathe/) | Guided breathing exercise app — animated orb leads you through Box Breathing, 4-7-8, and Physiological Sigh techniques with phase labels and countdown | Vanilla JS · CSS Animations · ES Modules | ✅ Complete |
| [cocktail-finder](./cocktail-finder/) | Cocktail recipe finder — search or discover random cocktails via CocktailDB, see ingredients and instructions, save favourites to localStorage | Vanilla JS · CSS3 · CocktailDB API · ES Modules | ✅ Complete |
| [streaks](./streaks/) | Daily habit streak tracker — add up to 6 habits, check them off each day, watch streaks grow with a 30-day heatmap and confetti celebrations | Vanilla JS · CSS3 · localStorage · ES Modules | ✅ Complete |
| [ambient-noise](./ambient-noise/) | Browser soundscape mixer — blend White Noise, Brown Noise, Rain, Ocean, Café, and Fireplace channels with independent volume sliders, a sleep timer, and a live frequency visualizer | Vanilla JS · Web Audio API · Canvas 2D | ✅ Complete |
| [crossy-road](./crossy-road/) | 3D endless hopper — guide a blocky chicken across infinite grass and road lanes, dodge traffic, beat your high score; runs fully offline with Three.js bundled locally | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [joyride](./joyride/) | GTA-style open-world sandbox — roam a procedurally generated city on foot, jack a parked car, drive anywhere; arcade driving model with push-out collision, ambient traffic, pedestrians, and minimap | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [overrun](./overrun/) | Browser FPS horde shooter — hold out against escalating waves of melee enemies in a single arena; hitscan shooting, view-model gun, screen shake, enemy AI with separation, health regen, and wave-scaling difficulty | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [finance-dashboard](./finance-dashboard/) | Personal finance dashboard — accounts, income/expense tracking, per-category budgets with over-budget warnings, charts, and bill splitting with who-owes-whom settlement | Next.js 14 · TypeScript · Prisma · Auth.js · Recharts | ✅ Complete |
| [typeblitz](./typeblitz/) | Typing speed test — live WPM + accuracy, per-character color feedback, 15/30/60 s modes, personal best via localStorage, dark/light theme | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [timber](./timber/) | One-more-go arcade chopper — tap left/right to chop an endless tree, dodge branches, beat a draining timer; wood-chip particles, screen shake, and a flying-log effect, with best score saved locally | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [pit-backtester](./pit-backtester/) | Point-in-time strategy backtesting engine for IDX equities — makes look-ahead bias structurally impossible via a clock-bound PIT data layer; full IDX market mechanics (100-lot sizes, broker commissions, sell tax, slippage), 15-test leakage suite | Python · pandas · pydantic v2 · rich · click | ✅ Complete |
| [apex-riders](./apex-riders/) | 3D arcade motorcycle racing game — lean through corners, drift to fill a boost meter, and chase lap times on a hand-designed circuit; WebGL2, arcade physics with drift-angle model, chase cam with FOV widening and camera shake | Three.js · TypeScript · Vite | ✅ Complete |
| [penumbra](./penumbra/) | Calm microlearning app that brackets sleep with a short wind-down review and a morning recall check — FSRS-5 scheduler with sleep-bracket bias, overnight retention metric, audio/eyes-closed mode, dim warm UI designed to help you sleep | Vanilla JS · IndexedDB · Web Speech API · ES Modules | ✅ Complete |
| [snake-3d](./snake-3d/) | Neon Snake in true 3D — guide a glowing snake through a 25³ wireframe cube, eat pulsing magenta orbs, grow and speed up; particle bursts on eat, orbiting camera, game over on wall or self-collision | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [color-palette-gen](./color-palette-gen/) | Instant color palette generator — press Space to generate 5 vibrant colors, lock favorites, click to copy hex codes, export as CSS variables | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [asteroid-storm](./asteroid-storm/) | Neon arcade space shooter — blast through endless asteroid waves, collect shield and triple-shot power-ups, screen-wrapping physics with particle explosions and high-score persistence | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [asteroids-evolved](./asteroids-evolved/) | Modern neon take on the Asteroids classic — rotate, thrust, and fire through escalating waves, asteroids split on hit, screen-wrap physics, particle explosions, and localStorage high score | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [trivia-sprint](./trivia-sprint/) | Fast-paced trivia game — 10 questions, 10 seconds each, pick category and difficulty, race the clock; live questions from Open Trivia DB with built-in fallback bank, streak badge, time bonus scoring, personal best | Vanilla JS · CSS3 · Open Trivia DB API · ES Modules | ✅ Complete |
| [decision-wheel](./decision-wheel/) | Colorful spinning decision wheel — type any list of options, spin to pick one with eased physics, tick/ding sound effects, and confetti; elimination mode, saved presets, and spin history via localStorage | Vanilla JS · Canvas 2D · Web Audio API · ES Modules | ✅ Complete |
| [neon-flap](./neon-flap/) | One-button neon arcade flyer — flap a glowing comet through scrolling gates, thread the gap or wipe out; particle trail, screen shake, ramping difficulty, and a localStorage best score | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [gravitee](./gravitee/) | Physics-based space-golf puzzle — drag back to aim, gravity wells bend every shot in flight; slingshot around planets, avoid black holes (instant reset), sink 8 hand-built levels in as few strokes as possible | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [ambient-mix](./ambient-mix/) | Interactive ambient sound mixer — blend 10 pre-loaded sounds with independent volume sliders, save custom mixes to localStorage, and quick-access presets for focus, relax, sleep, and work modes | Vanilla JS · Web Audio API · localStorage | ✅ Complete |
| [sonar](./sonar/) | Echolocation stealth-maze — navigate a pitch-black labyrinth where pings are your only sight *and* a dinner bell for sound-hunting lurkers; collect shards, unlock the exit, descend deeper on three hearts | Vanilla JS · Canvas 2D · Web Audio API · ES Modules | ✅ Complete |
| [pixelpad](./pixelpad/) | Tiny pixel art editor — draw sprites, avatars, and favicons on a 16/32/64 grid with pencil, fill, eyedropper, and live mirror-mode symmetry; undo/redo, autosave, and crisp PNG export up to 32× | Vanilla JS · Canvas 2D · localStorage · ES Modules | ✅ Complete |
| [moodlog](./moodlog/) | Daily mood journal — pick one of 8 emoji moods, add an optional note, and watch your emotional patterns emerge as a color-coded monthly calendar heatmap; streak tracking, top-mood stat, zero sign-up | Vanilla JS · CSS3 · localStorage · ES Modules | ✅ Complete |
| [pulse](./pulse/) | Synthesized browser groovebox — a 16-step sequencer that ships zero audio files: every kick, hat, clap and bassline is built from oscillators and noise, so every voice is editable, it loads instantly offline, and the loop renders to a real 16-bit WAV. Scale-locked note roll, per-step velocity and probability, pattern chaining, Euclidean fills, genre generator, and shareable-link sessions | Vanilla JS · Web Audio API · ES Modules | ✅ Complete |
| [snapframe](./snapframe/) | Screenshot beautifier — paste or drop a screenshot, wrap it in a gradient background with padding, rounded corners, shadow, tilt and a macOS/dark window bar, then export a PNG at 1×/2× or copy it to the clipboard; fully client-side | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [afterimage](./afterimage/) | 3D time-loop puzzle-platformer — every attempt you make stays in the room as a solid, replaying ghost of yourself; stand on your past selves, let them hold pressure plates and flip switches, and solve six chambers under par | Three.js · Vanilla JS · ES Modules | ✅ Complete |

## Running a project

Each project is a static site served locally:

```bash
cd <project-name>
python -m http.server 8080
# open http://localhost:8080
```

See each project's `README.md` for details. (Exception: `finance-dashboard` is a
full-stack Next.js app — `cd finance-dashboard && npm install && npm run db:push && npm run dev`.)

To browse everything at once, run the **[showcase](./showcase/)** launcher — serve
the repo from its **root** (`python -m http.server 8080`) and open
`http://localhost:8080/showcase/`. Its live "Launch" buttons need the root as the
document root, so don't serve from inside `showcase/`.

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
