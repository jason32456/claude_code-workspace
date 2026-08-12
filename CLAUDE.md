# CLAUDE.md — Agent Workspace Guide

This repository is a collection of standalone browser or CLI app projects. They all
live inside `showcase/`, which is an arcade-style launcher for them — and the only
folder that needs to be hosted. Read this file before making any changes.

## Repository structure

```
claude_code-workspace/
├── CLAUDE.md              ← you are here
├── README.md              ← human-facing index of all projects
├── vercel.json            ← redirects / to /showcase/
└── showcase/              ← the deployable site — self-contained by design
    ├── README.md
    ├── index.html         ← arcade launcher
    ├── style.css
    ├── main.js
    ├── data/projects.js   ← single source of truth for the grid
    ├── js/                ← card / grid / modal modules
    ├── screenshots/       ← screenshots of the showcase itself
    └── apps/
        └── <project-name>/
            ├── README.md          ← project-specific docs (required)
            ├── screenshots/       ← project screenshots (required)
            └── ...                ← all project source files
```

**The showcase must stay hostable on its own.** Everything it references lives
under `showcase/`, and every path in `data/projects.js` is relative to that folder.
Never point the showcase at anything above it (no `../`), and never add a build
step it needs before it can be served.

## Rules for adding a new project

1. **One folder per project, under `showcase/apps/`.** Never mix source files from
   two projects in the same directory.
2. **Always create a `README.md`** inside the project folder covering: what it does,
   how to run it, key parameters, and any dependencies.
3. **Take screenshots and embed them.** Once the project runs, capture at least one
   screenshot (two is better — e.g. an early state and a settled/interesting state)
   and embed them near the top of the project `README.md`. Store images in
   `showcase/apps/<project-name>/screenshots/`. Use the Playwright-based approach
   documented below.
4. **Register it in the showcase.** Append an entry to `showcase/data/projects.js`
   (see the file header for the shape). Static apps get `launchHref:
   'apps/<slug>/'`; anything needing its own runtime simply omits `launchHref` and
   renders as a gallery-only card.
5. **Update the root `README.md`** by adding a row to the Projects table (name,
   description, stack, status).
6. **Choose the right stack for the project.** Any stack is fair game — vanilla
   HTML/CSS/JS, React, Vue, Svelte, Node CLI, Python, etc. Use whatever fits the PRD
   best. Vanilla JS with ES modules served by `python -m http.server` is a reasonable
   default for simple browser projects, but don't default to it when a framework or
   build tool would be clearly better.
7. **Self-contained.** Each project must run from its own folder. No shared
   `node_modules`, and no CDN dependencies — vendor libraries locally (see
   `apps/crossy-road/vendor/three.module.js`) so every app works offline and stays
   launchable from the showcase.
8. **If the project needs a build to be viewable in a browser**, commit the built
   output (as `apps/apex-riders/dist/` does) and point `launchHref` at it. Otherwise
   the card silently loses its Launch button when the site is deployed.

## Taking screenshots (browser projects)

Start the server, then use Playwright via Node to capture:

```bash
# Start server in background
cd showcase/apps/<project-name> && python3 -m http.server 8080 &

# Capture screenshots
node - << 'EOF'
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/early.png' });
await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshots/settled.png' });
await browser.close();
EOF
```

WebGL projects need `--use-gl=swiftshader --enable-unsafe-swiftshader` in the
launch args.

Embed them in the project `README.md` as a side-by-side table right below the intro
paragraph:

```markdown
| Early state | Settled state |
|:---:|:---:|
| ![Early](screenshots/early.png) | ![Settled](screenshots/settled.png) |
```

## Running projects locally

The whole collection, launcher included:

```bash
cd showcase
python -m http.server 8080
# open http://localhost:8080
```

A single project:

```bash
cd showcase/apps/<project-name>
python -m http.server 8080
```

ES modules require an HTTP server — `file://` URLs will not work.

## Current projects

`showcase/data/projects.js` is the authoritative list — 36 projects, all under
`showcase/apps/`. Most are static sites launchable straight from the showcase. The
exceptions:

| Folder | Stack | How to run |
|--------|-------|------------|
| `apps/finance-dashboard` | Next.js 14 + TypeScript + Prisma + Auth.js | `npm install && npm run db:push && npm run dev` |
| `apps/pit-backtester` | Python + pandas + click | `pip install -e . && python -m pit_backtester.cli` |
| `apps/apex-riders` | Three.js + TypeScript + Vite | `npm install && npm run dev` (or `npm run build` to refresh the checked-in `dist/`) |

## Conventions

- **Branch names** follow `claude/<feature>-<id>` — develop on the branch specified at session start.
- **Merge to `main` when done.** After work is complete and pushed, merge your feature branch into `main` and push `main`:
  ```bash
  git checkout main && git merge <your-branch> && git push origin main
  ```
- **Commit often** with short, descriptive messages.
- **No secrets** — never commit `.env` files or API keys.
- Code comments only where the *why* is non-obvious. No docblocks, no task references.
