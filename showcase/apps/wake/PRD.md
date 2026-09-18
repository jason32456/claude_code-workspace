# Wake — Product Requirements Document

## One line

A wind tunnel in a browser tab: a lattice-Boltzmann fluid solver written from
scratch, an obstacle you can pitch or paint, smoke to see the flow with, gauges
that read drag, lift and shedding frequency off the fluid itself — and a bench of
textbook benchmarks the solver has to pass in front of you.

## Why this shape

Nothing in the collection does fluid dynamics. Meltwater's water and Windward's
wind are game effects; the "wind tunnel" here is a solver. The brief was a
surprise project, as impressive as possible, so the payoff had to be one of the
iconic images of physics — a Kármán vortex street peeling off a cylinder — and
the solver had to be real enough that a physicist could check it with a pencil.

The lattice-Boltzmann method is the right engine for that. The whole solver fits
on a screen: nine populations per cell, collide toward equilibrium, stream to the
neighbours, bounce back off solids. It is second-order accurate, it handles an
arbitrary obstacle painted with a mouse without remeshing, and the force on that
obstacle falls straight out of the populations that bounce (momentum exchange),
so drag and lift are measured rather than modelled.

## What the viewer sees

1. **The tunnel.** A 400×160 lattice flowing left to right, rendered as vorticity
   (a diverging map on a dark ground), speed, or pressure, with smoke streaklines
   injected from a rake at the inlet so the flow reads like a real tunnel.
2. **The obstacle.** Cylinder, NACA 4-digit airfoil at any angle of attack, flat
   plate, square, or a shape painted with the mouse. Reynolds number is a slider.
3. **The gauges.** Re, drag coefficient, lift coefficient, Strouhal number, all
   recomputed live; a strip chart of Cd and Cl over time.
4. **The polar.** A background sweep of angle of attack that plots Cl and Cd
   against α for the airfoil, stall included, each point computed by a fresh
   simulation in a Web Worker.
5. **The bench.** Self-tests that run the solver against results it did not
   produce, each with the number expected, the number measured, and a verdict.

## Physics

- D2Q9 lattice, BGK collision, Guo forcing for body forces.
- Halfway bounce-back on solids; moving-wall bounce-back for lids.
- Equilibrium inlet with a prescribed profile; zero-gradient outlet.
- Smagorinsky subgrid viscosity (Cs = 0.1) switched on only when τ < 0.55, and
  reported as such: it is a stabiliser for high Re on a coarse grid, not physics
  the benchmarks depend on.
- Momentum-exchange force on the obstacle from the bounce-back links.
- Strouhal from the period of the lift signal's zero crossings.

## Benchmarks the solver must pass

| Test | Oracle | Pass criterion |
|---|---|---|
| Moments of equilibrium | Σfᵢ = ρ, Σcᵢfᵢ = ρu by construction | 1e-12 |
| Mass conservation | closed periodic box | relative drift < 1e-9 |
| Poiseuille flow | u(y) = g·y(H−y)/2ν | max error < 1 % |
| Couette flow | linear profile | max error < 1 % |
| Lid-driven cavity, Re = 100 | Ghia, Ghia & Shin (1982) centreline u | RMS deviation < 0.02 |
| Cylinder in a channel, Re = 20 | Schäfer & Turek (1996) 2D-1: Cd 5.57–5.59, Cl 0.0104–0.0110 | Cd within 3 % |
| Vortex shedding, Re = 150 | Roshko (1954): St = 0.212(1 − 21.2/Re) | within 10 % (blockage noted) |

The last two are deliberately allowed a margin: a browser-sized grid resolves a
cylinder with 16 cells across it where the reference used hundreds, and a channel
with 20 % blockage sheds faster than free stream. The page reports both numbers
and the margin rather than tuning the margin until it passes.

## Non-goals

- 3D. A 2D tunnel is honest about being 2D; the Strouhal check says so.
- GPU compute. CPU typed arrays keep the solver debuggable, portable and
  identical between the page, the worker and a Node test run.
- Turbulence modelling as a claim. The LES term is disclosed as a stabiliser.

## Deliverables

- `showcase/apps/wake/` — `index.html`, `style.css`, `main.js`, `js/*`.
- `js/lbm.js` runs unchanged in the page, in a Web Worker, and in Node.
- `README.md` with screenshots, the pipeline and the measured numbers.
- Registered in `showcase/data/projects.js` and the root `README.md`.
