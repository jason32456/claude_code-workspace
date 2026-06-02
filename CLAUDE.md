# CLAUDE.md — Agent Workspace Guide

This repository is a collection of standalone browser or CLI app projects, each in its own folder. Read this file before making any changes.

## Repository structure

```
claude_code-workspace/
├── CLAUDE.md              ← you are here
├── README.md              ← human-facing index of all projects
└── <project-name>/        ← one folder per project
    ├── README.md          ← project-specific docs (required)
    └── ...                ← all project source files
```

## Rules for adding a new project

1. **One folder per project.** Never mix source files from two projects in the same directory.
2. **Always create a `README.md`** inside the project folder covering: what it does, how to run it, key parameters, and any dependencies.
3. **Take screenshots and embed them.** Once the project runs, capture at least one screenshot (two is better — e.g. an early state and a settled/interesting state) and embed them near the top of the project `README.md`. Store images in `<project-name>/screenshots/`. Use the Playwright-based approach documented below.
4. **Update the root `README.md`** by adding a row to the Projects table (name, description, stack, status).
5. **Choose the right stack for the project.** Any stack is fair game — vanilla HTML/CSS/JS, React, Vue, Svelte, Node CLI, Python, etc. Use whatever fits the PRD best. Vanilla JS with ES modules served by `python -m http.server` is a reasonable default for simple browser projects, but don't default to it when a framework or build tool would be clearly better.
6. **Self-contained.** Each project must run from its own folder. No shared `node_modules` at the repo root.

## Taking screenshots (browser projects)

Start the server, then use Playwright via Node to capture:

```bash
# Start server in background
cd <project-name> && python3 -m http.server 8080 &

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

Embed them in the project `README.md` as a side-by-side table right below the intro paragraph:

```markdown
| Early state | Settled state |
|:---:|:---:|
| ![Early](screenshots/early.png) | ![Settled](screenshots/settled.png) |
```

## Running projects locally

Most projects are static sites. Serve from the project folder:

```bash
cd <project-name>
python -m http.server 8080
# open http://localhost:8080
```

ES modules require an HTTP server — `file://` URLs will not work.

## Current projects

| Folder | Stack | How to run |
|--------|-------|------------|
| `particle-life` | Vanilla JS + Canvas 2D | `cd particle-life && python -m http.server 8080` |

## Conventions

- **Branch names** follow `claude/<feature>-<id>` — develop on the branch specified at session start.
- **Merge to `main` when done.** After work is complete and pushed, merge your feature branch into `main` and push `main`:
  ```bash
  git checkout main && git merge <your-branch> && git push origin main
  ```
- **Commit often** with short, descriptive messages.
- **No secrets** — never commit `.env` files or API keys.
- Code comments only where the *why* is non-obvious. No docblocks, no task references.
