# claude_code-workspace

A growing collection of browser and CLI app projects, each built in its own folder. Every project is self-contained — no shared dependencies at the repo root.

The **[showcase](./showcase/)** is the front door: an arcade launcher for all 46 projects. It is deliberately self-contained, so hosting that one folder puts the whole collection online.

Projects that need a backend live in their own root-level folder and deploy as their own Vercel project — see [Deployments](#deployments).

## Projects

| Project | Description | Stack | Status |
|---------|-------------|-------|--------|
| [showcase](./showcase/) | Arcade-style launcher for every app in this repo — neon cabinet cards, category filters and search, a screenshot-gallery modal, and live "Launch" buttons for the runnable projects | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [capsa](./capsa/) | Capsa / Big Two card game — beat the table with a stronger combination of the same size or pass; cross-device online rooms behind a 4-letter code and a shared server-enforced sign-in, server-authoritative so opponents' cards never reach your browser, empty seats played by a simulation-tuned AI ladder, the trick piling up on the table as it would in person, a running score tracker, synthesised card sounds that ship zero audio files, and a phone-first layout that becomes a real felt table on desktop | Vanilla JS · Web Audio API · ES Modules · Vercel Functions · Upstash Redis | ✅ Complete |
| [gnomon](./showcase/apps/gnomon/) | 3D shadow platformer — the level is not the geometry, it is the shadow the geometry throws. You live on a lit wall and can only stand on darkness: turn a glass solid and the ledge under you tips, push it toward the lamp and the ledge doubles in size and runs away, overlap two shadows and they become one bridge. The collision polygon *is* the drawn shadow, so the two can never disagree, and a rotating vane carries you along its face. Nine chambers, seals that read a silhouette instead of a key, and no asset files — the wall texture and every sound are generated at load | Three.js · Vanilla JS · Web Audio API · ES Modules | ✅ Complete |
| [leyden](./showcase/apps/leyden/) | 3D storm-flying game where lightning is the resource — drop a conductive streamer to make yourself the likeliest thing in the sky, take the strike on your own hull, and run the charge down to the town's capacitor jars before the heat cooks you; every bolt is a dielectric-breakdown walk scored against a live attractiveness field, so the spire, the powder mill and you compete for the same strike and nothing you don't catch goes nowhere | Three.js · Vanilla JS · Web Audio API · ES Modules | ✅ Complete |
| [cantilever](./showcase/apps/cantilever/) | Structural engineering puzzle — span a gap with road, beams and cables on a budget, then drive a truck across; members are XPBD constraints carrying real axial forces, so decks sag, cables go slack instead of pushing, long struts buckle first, and overloaded members snap in cascades | Vanilla JS · Canvas 2D · XPBD · ES Modules | ✅ Complete |
| [particle-life](./showcase/apps/particle-life/) | Real-time emergent particle simulation — species of particles obey pairwise attraction/repulsion rules, self-organizing into lifelike clusters, membranes, and chasers | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [focus-pet](./showcase/apps/focus-pet/) | Pomodoro timer fused with a virtual pet — complete focus sessions to feed and evolve your blob creature, time-based decay keeps it real | Vanilla JS · SVG · CSS · localStorage | ✅ Complete |
| [maze-pathfinder](./showcase/apps/maze-pathfinder/) | Interactive maze generator and pathfinding visualizer — watch BFS, Dijkstra, and A* explore mazes step by step, paint walls and weights, compare algorithms | Vanilla JS · CSS Grid · ES Modules | ✅ Complete |
| [order-book-simulator](./showcase/apps/order-book-simulator/) | Limit-order-book matching engine with a live agent-based market — market makers, momentum chasers, mean-reverters, and value traders produce emergent price action viewed through a depth ladder, price chart, and trade tape | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [palette](./showcase/apps/palette/) | Dead-simple 5-swatch color palette generator — press Space to regenerate, lock colors you love, click hex codes to copy, export as CSS variables | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [breathe](./showcase/apps/breathe/) | Guided breathing exercise app — animated orb leads you through Box Breathing, 4-7-8, and Physiological Sigh techniques with phase labels and countdown | Vanilla JS · CSS Animations · ES Modules | ✅ Complete |
| [cocktail-finder](./showcase/apps/cocktail-finder/) | Cocktail recipe finder — search or discover random cocktails via CocktailDB, see ingredients and instructions, save favourites to localStorage | Vanilla JS · CSS3 · CocktailDB API · ES Modules | ✅ Complete |
| [streaks](./showcase/apps/streaks/) | Daily habit streak tracker — add up to 6 habits, check them off each day, watch streaks grow with a 30-day heatmap and confetti celebrations | Vanilla JS · CSS3 · localStorage · ES Modules | ✅ Complete |
| [ambient-noise](./showcase/apps/ambient-noise/) | Browser soundscape mixer — blend White Noise, Brown Noise, Rain, Ocean, Café, and Fireplace channels with independent volume sliders, a sleep timer, and a live frequency visualizer | Vanilla JS · Web Audio API · Canvas 2D | ✅ Complete |
| [crossy-road](./showcase/apps/crossy-road/) | 3D endless hopper — guide a blocky chicken across infinite grass and road lanes, dodge traffic, beat your high score; runs fully offline with Three.js bundled locally | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [joyride](./showcase/apps/joyride/) | GTA-style open-world sandbox — roam a procedurally generated city on foot, jack a parked car, drive anywhere; arcade driving model with push-out collision, ambient traffic, pedestrians, and minimap | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [overrun](./showcase/apps/overrun/) | Browser FPS horde shooter — hold out against escalating waves of melee enemies in a single arena; hitscan shooting, view-model gun, screen shake, enemy AI with separation, health regen, and wave-scaling difficulty | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [finance-dashboard](./showcase/apps/finance-dashboard/) | Personal finance dashboard — accounts, income/expense tracking, per-category budgets with over-budget warnings, charts, and bill splitting with who-owes-whom settlement | Next.js 14 · TypeScript · Prisma · Auth.js · Recharts | ✅ Complete |
| [typeblitz](./showcase/apps/typeblitz/) | Typing speed test — live WPM + accuracy, per-character color feedback, 15/30/60 s modes, personal best via localStorage, dark/light theme | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [timber](./showcase/apps/timber/) | One-more-go arcade chopper — tap left/right to chop an endless tree, dodge branches, beat a draining timer; wood-chip particles, screen shake, and a flying-log effect, with best score saved locally | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [pit-backtester](./showcase/apps/pit-backtester/) | Point-in-time strategy backtesting engine for IDX equities — makes look-ahead bias structurally impossible via a clock-bound PIT data layer; full IDX market mechanics (100-lot sizes, broker commissions, sell tax, slippage), 15-test leakage suite | Python · pandas · pydantic v2 · rich · click | ✅ Complete |
| [apex-riders](./showcase/apps/apex-riders/) | 3D arcade motorcycle racing game — lean through corners, drift to fill a boost meter, and chase lap times on a hand-designed circuit; WebGL2, arcade physics with drift-angle model, chase cam with FOV widening and camera shake | Three.js · TypeScript · Vite | ✅ Complete |
| [penumbra](./showcase/apps/penumbra/) | Calm microlearning app that brackets sleep with a short wind-down review and a morning recall check — FSRS-5 scheduler with sleep-bracket bias, overnight retention metric, audio/eyes-closed mode, dim warm UI designed to help you sleep | Vanilla JS · IndexedDB · Web Speech API · ES Modules | ✅ Complete |
| [snake-3d](./showcase/apps/snake-3d/) | Neon Snake in true 3D — guide a glowing snake through a 25³ wireframe cube, eat pulsing magenta orbs, grow and speed up; particle bursts on eat, orbiting camera, game over on wall or self-collision | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [color-palette-gen](./showcase/apps/color-palette-gen/) | Instant color palette generator — press Space to generate 5 vibrant colors, lock favorites, click to copy hex codes, export as CSS variables | Vanilla JS · CSS3 · ES Modules | ✅ Complete |
| [asteroid-storm](./showcase/apps/asteroid-storm/) | Neon arcade space shooter — blast through endless asteroid waves, collect shield and triple-shot power-ups, screen-wrapping physics with particle explosions and high-score persistence | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [asteroids-evolved](./showcase/apps/asteroids-evolved/) | Modern neon take on the Asteroids classic — rotate, thrust, and fire through escalating waves, asteroids split on hit, screen-wrap physics, particle explosions, and localStorage high score | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [trivia-sprint](./showcase/apps/trivia-sprint/) | Fast-paced trivia game — 10 questions, 10 seconds each, pick category and difficulty, race the clock; live questions from Open Trivia DB with built-in fallback bank, streak badge, time bonus scoring, personal best | Vanilla JS · CSS3 · Open Trivia DB API · ES Modules | ✅ Complete |
| [decision-wheel](./showcase/apps/decision-wheel/) | Colorful spinning decision wheel — type any list of options, spin to pick one with eased physics, tick/ding sound effects, and confetti; elimination mode, saved presets, and spin history via localStorage | Vanilla JS · Canvas 2D · Web Audio API · ES Modules | ✅ Complete |
| [neon-flap](./showcase/apps/neon-flap/) | One-button neon arcade flyer — flap a glowing comet through scrolling gates, thread the gap or wipe out; particle trail, screen shake, ramping difficulty, and a localStorage best score | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [gravitee](./showcase/apps/gravitee/) | Physics-based space-golf puzzle — drag back to aim, gravity wells bend every shot in flight; slingshot around planets, avoid black holes (instant reset), sink 8 hand-built levels in as few strokes as possible | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [ambient-mix](./showcase/apps/ambient-mix/) | Interactive ambient sound mixer — blend 10 pre-loaded sounds with independent volume sliders, save custom mixes to localStorage, and quick-access presets for focus, relax, sleep, and work modes | Vanilla JS · Web Audio API · localStorage | ✅ Complete |
| [sonar](./showcase/apps/sonar/) | Echolocation stealth-maze — navigate a pitch-black labyrinth where pings are your only sight *and* a dinner bell for sound-hunting lurkers; collect shards, unlock the exit, descend deeper on three hearts | Vanilla JS · Canvas 2D · Web Audio API · ES Modules | ✅ Complete |
| [pixelpad](./showcase/apps/pixelpad/) | Tiny pixel art editor — draw sprites, avatars, and favicons on a 16/32/64 grid with pencil, fill, eyedropper, and live mirror-mode symmetry; undo/redo, autosave, and crisp PNG export up to 32× | Vanilla JS · Canvas 2D · localStorage · ES Modules | ✅ Complete |
| [moodlog](./showcase/apps/moodlog/) | Daily mood journal — pick one of 8 emoji moods, add an optional note, and watch your emotional patterns emerge as a color-coded monthly calendar heatmap; streak tracking, top-mood stat, zero sign-up | Vanilla JS · CSS3 · localStorage · ES Modules | ✅ Complete |
| [pulse](./showcase/apps/pulse/) | Synthesized browser groovebox — a 16-step sequencer that ships zero audio files: every kick, hat, clap and bassline is built from oscillators and noise, so every voice is editable, it loads instantly offline, and the loop renders to a real 16-bit WAV. Scale-locked note roll, per-step velocity and probability, pattern chaining, Euclidean fills, genre generator, and shareable-link sessions | Vanilla JS · Web Audio API · ES Modules | ✅ Complete |
| [snapframe](./showcase/apps/snapframe/) | Screenshot beautifier — paste or drop a screenshot, wrap it in a gradient background with padding, rounded corners, shadow, tilt and a macOS/dark window bar, then export a PNG at 1×/2× or copy it to the clipboard; fully client-side | Vanilla JS · Canvas 2D · ES Modules | ✅ Complete |
| [afterimage](./showcase/apps/afterimage/) | 3D time-loop puzzle-platformer — every attempt you make stays in the room as a solid, replaying ghost of yourself; stand on your past selves, let them hold pressure plates and flip switches, and solve six chambers under par | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [nightside](./showcase/apps/nightside/) | 3D tower defense on a rotating planet — 642-tile geodesic globe, flow-field pathing, and a solar power grid that half goes dark as the terminator sweeps; the Blight only ever drops on the night side | Three.js · Vanilla JS · ES Modules | ✅ Complete |
| [windward](./showcase/apps/windward/) | 3D sailing regatta with no throttle — you get a rudder and a sheet, and the wind decides; a real no-go zone forces you to tack upwind, gusts drift across the water as readable dark patches, and 3 AI rivals sail the identical physics | Three.js · Vanilla JS · GLSL · ES Modules | ✅ Complete |
| [kessler](./showcase/apps/kessler/) | Zero-thrust EVA salvage sim — you have no flight controls, so you move by kicking off hull plate, swinging on a magnetic tether, and throwing away the cargo you were sent to bring home; every impulse is divided by your total mass, so a full rack turns you into a barge. Graded catches (clean under 3.5 m/s, thrown off above 6.5), a counter-rotating ring whose surface velocity you inherit, tumbling debris, venting breaches that push you across the yard, and a void where the air burns three times as fast | Three.js · Vanilla JS · Web Audio API · ES Modules | ✅ Complete |
| [silkfall](./showcase/apps/silkfall/) | 3D web-building predator sim — you build the level, then you hunt in it; spin an orb web from walkable frame silk and sticky capture silk, then run its strands to reach snagged prey before it chews through them. Real verlet web that sags, whips and collapses when the strand holding a limb is cut; vibration pulses travel the graph as your only sense organ; beetles tear frames, gusts punish long spans, and wasps hunt you instead of the web | Three.js · Vanilla JS · Verlet physics · Web Audio API · ES Modules | ✅ Complete |
| [gambit](./showcase/apps/gambit/) | Full rule-correct chess — click-to-select board, castling, en passant, promotion, check/checkmate/stalemate/draw detection — against a local minimax-with-alpha-beta AI at three difficulties, or pass-and-play; Puzzle Rush drills tactics with a hand-curated puzzle bank that's mechanically verified offline before it ships | Vanilla JS · chess.js · Web Audio API · ES Modules | ✅ Complete |
| [meltwater](./showcase/apps/meltwater/) | 3D valley engineering under a melting glacier — you never touch the water, only the dirt under it; a pipe-model shallow-water sim carries every drop, so it finds the low line itself, backs up behind what you leave in the way, and is gone for good if you send it the wrong way. Cut-and-fill earthworks where the spoil for a levee has to come out of a trench you chose the place of, dams that breach when the head beats their strength, sluice gates you time mid-melt, and soft ground that lets fast water widen its own channel | Three.js · GLSL · Vanilla JS · Web Audio API · ES Modules | ✅ Complete |
| [docket](./showcase/apps/docket/) | Drag-and-drop Kanban board — multiple boards, columns and cards you drag with a live drop indicator, colored labels, due dates, and an optional WIP limit per column that flags amber once over capacity; a search box fades non-matching cards in place instead of reflowing the board | Vanilla JS · ES Modules · CSS3 · HTML5 Drag and Drop API · localStorage | ✅ Complete |
| [last-ember](./showcase/apps/last-ember/) | Turn-based roguelike dungeon crawl — your only light is a torch that burns down every turn you carry it, so how far you can see is a resource you spend, not a fixed camera setting. Nothing moves until you do; bump-to-attack combat has no miss chance, so a bad fight is always a decision. Procedural floors with a BFS-placed exit, fog of war, wandering/fleeing/chasing/erratic monster AI, potions and auto-equipping gear, and permadeath across eight floors down to a Warden-guarded Emberheart | Vanilla JS · Canvas 2D · Web Audio API · ES Modules | ✅ Complete |
| [latticework](./showcase/apps/latticework/) | Sudoku graded by the logic it actually takes to solve it — every puzzle is carved from a full grid with a verified unique solution, then labelled Easy/Medium/Hard/Expert by which human techniques (singles, pointing pairs, box-line reduction, naked/hidden pairs and triples, X-Wing) are actually required, not by clue count. Hint runs that same technique search on your current board and explains the one logical step it found instead of filling in an answer; a Daily Challenge seeds the same puzzle for everyone from the calendar date and tracks a streak; puzzle carving runs in a Web Worker so the board never freezes | Vanilla JS · ES Modules · Web Workers · localStorage | ✅ Complete |

## Deployments

Two Vercel projects are created from this one repository. They are independent —
deploying one never touches the other.

| Vercel project | Root Directory | Serves | Needs |
|---|---|---|---|
| **showcase** | `showcase` (or repo root, which redirects to `/showcase/`) | the arcade launcher and every static app | nothing — no build step, no env vars |
| **capsa** | `capsa` | [the Capsa game](./capsa/) plus its `/api/capsa` function | `KV_REST_API_URL` + `KV_REST_API_TOKEN` from Upstash Redis |

Capsa is behind a shared sign-in (one credential for players, one for an admin
who can change it). The gate is enforced server-side — every room endpoint
returns 401 without a session — and the shipped defaults are documented in
[`capsa/README.md`](./capsa/README.md), so change the player password from the
admin panel after deploying.

For both: Framework Preset **Other**, and leave build / output / install commands
empty.

**The Root Directory matters.** Vercel only picks up serverless functions from an
`api/` folder at the *project root*, which is exactly why Capsa is not under
`showcase/apps/`. Point the Capsa project at the repo root and its API will 404;
point the showcase project at `capsa` and you will serve the game instead of the
arcade.

Verify a Capsa deploy at `/api/capsa?action=health` — it reports `{"store":"redis"}`
once Upstash is connected, `{"store":"memory"}` before that, and 404s if the Root
Directory is wrong.

Once Capsa is deployed, paste its URL into `CAPSA_URL` at the top of
`showcase/data/projects.js` so the arcade card gets a working Launch button.

## Running everything

Serve the showcase folder and you get all of it — the launcher plus every app it
links to:

```bash
cd showcase
python -m http.server 8080
# open http://localhost:8080
```

## Running a single project

Most projects are static sites:

```bash
cd showcase/apps/<project-name>
python -m http.server 8080
# open http://localhost:8080
```

`capsa` lives at the repo root rather than under `showcase/apps/`, so it runs
from there instead:

```bash
cd capsa
python -m http.server 8080
```

That gives you solo play against bots. Online rooms need its serverless API, which
only runs on a real deployment or under `vercel dev`; without it the app says so
and stays playable solo.

See each project's `README.md` for details. Three others need a runtime of their
own: `finance-dashboard` (Next.js), `pit-backtester` (Python CLI), and
`apex-riders` (Vite dev server — its production build is checked in, so the
showcase can launch it without one).

## Repository layout

```
claude_code-workspace/
├── README.md              ← this file
├── CLAUDE.md              ← guide for AI agents working in this repo
├── vercel.json            ← redirects / to /showcase/
│
├── showcase/              ← DEPLOY 1: the arcade — host this folder on its own
│   ├── index.html         ← arcade launcher
│   ├── data/projects.js   ← one entry per project
│   └── apps/              ← every static project, one folder each
│       ├── particle-life/
│       │   ├── README.md
│       │   ├── index.html
│       │   ├── main.js
│       │   └── …
│       ├── focus-pet/
│       │   ├── README.md
│       │   ├── index.html
│       │   └── …
│       └── capsa/
│           ├── README.md  ← pointer: source is at /capsa
│           └── screenshots/  ← kept here so the launcher can read them
│
└── capsa/                 ← DEPLOY 2: needs a backend, so it stands alone
    ├── vercel.json        ← its own function config
    ├── api/capsa.js       ← serverless function (rooms, moves, bots)
    ├── index.html
    └── js/                ← engine, bots, UI, networking
```

A project earns its own root-level folder when it needs a serverless function, a
database, or environment variables — putting it under `showcase/apps/` would stop
the showcase being a plain static site. `CLAUDE.md` documents the rules.
