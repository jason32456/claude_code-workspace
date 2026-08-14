# Capsa — screenshots only

The Capsa source does **not** live here. It is at [`/capsa`](../../../capsa/) in
the repository root.

This folder holds only the screenshots, because `showcase/data/projects.js`
reads every card's images from `apps/<slug>/screenshots/` and the showcase has
to stay hostable on its own — it can never reference anything above itself.

## Why Capsa is not under `apps/`

Every other project here is a static app the showcase can launch directly.
Capsa also needs a serverless function and a Redis store for its online rooms,
which would force the showcase to stop being a plain static site. So it deploys
as its own Vercel project instead, and the showcase links to that deployment.

See [`/capsa/README.md`](../../../capsa/README.md) for how to run and deploy it,
and the "Projects that deploy separately" section of the root `CLAUDE.md` for
the convention.

## Turning the card's Launch button on

Set `CAPSA_URL` at the top of `showcase/data/projects.js` to the deployed URL.
While it is empty the card renders as a gallery-only card, which is why the
Launch button may be missing.
