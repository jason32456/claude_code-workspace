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
3. **Update the root `README.md`** by adding a row to the Projects table (name, description, stack, status).
4. **No build tools required** unless the PRD explicitly calls for them. Vanilla HTML/CSS/JS with ES modules served by a simple static server (`python -m http.server`) is the default stack.
5. **Self-contained.** Each project must run from its own folder. No shared `node_modules` at the repo root.

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
