# Arcade — Project Showcase

An arcade-style launcher that presents every app in this workspace as a neon
"cabinet" card. Browse by category, search by name or stack, open a screenshot
gallery for any project, and **launch the runnable apps live** in a new tab.

| Grid | Detail / gallery modal |
|:---:|:---:|
| ![Showcase grid](screenshots/grid.png) | ![Project modal](screenshots/modal.png) |

| Filtered by category |
|:---:|
| ![Filtered view](screenshots/filtered.png) |

## How to run

Everything the arcade needs lives inside this folder, so serve **this folder**
and nothing else:

```bash
cd showcase
python -m http.server 8080
# open http://localhost:8080
```

That is the whole deal — 35 cabinets, 33 of them launchable, no build step and
no parent directory required.

## What it does

- **One cabinet per project** — cover screenshot, title, tagline, stack chips, and a
  category badge.
- **Launch where possible.** Every static app under `apps/` gets a live **Launch**
  button. The two that need a runtime of their own (`finance-dashboard` · Next.js,
  `pit-backtester` · Python CLI) show a gallery and the exact run command instead.
  `apex-riders` is a Vite/TypeScript app, so its production build is checked in at
  `apps/apex-riders/dist/` and that is what Launch opens.
- **Filter + search** — category pills (Games / Simulations / Wellness / Tools /
  Finance), a live text search over names and stacks, and a "Launchable only" toggle.
- **Gallery modal** — full screenshot gallery (with prev/next + keyboard arrows),
  description, run command, and a link to the source on GitHub. `pit-backtester`
  also shows its demo clip.

## Layout

```
showcase/
├── index.html        # page shell + module entry
├── style.css         # arcade theme
├── main.js           # wires data → grid, filters, search, modal
├── data/projects.js  # single source of truth: one entry per project
├── js/card.js        # builds a cabinet card
├── js/grid.js        # renders + filters/searches the grid
├── js/modal.js       # reusable gallery/detail modal
├── screenshots/      # screenshots of the showcase itself
└── apps/             # every project, one folder each
    ├── crossy-road/
    │   ├── README.md
    │   ├── index.html
    │   └── screenshots/
    └── …
```

Covers and galleries are read in place from each app's own `screenshots/` folder
(`apps/<slug>/screenshots/…`) — nothing is copied or duplicated.

## Adding a project

1. Drop the project in `apps/<slug>/`, with its own `README.md` and
   `screenshots/`.
2. Append an entry to `data/projects.js`. Give it a `launchHref` (usually
   `apps/<slug>/`) if it runs as a static site; leave `launchHref` out and it
   automatically becomes a gallery-only card with a **View** button.
3. Add a row to the repo's root `README.md`.

Paths in `data/projects.js` must stay relative to this folder — that is what
keeps the showcase hostable on its own.

## Deploying

Point the host at this directory and you are done. On Vercel, set the project's
**Root Directory** to `showcase`; the repo's `vercel.json` also redirects `/` to
`/showcase/` so a plain repo-root deployment lands in the right place either way.
No build step, no bundler.
