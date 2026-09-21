# Furnace — PRD

## One line

A Monte Carlo path tracer, and a test it cannot fake: a white sphere in a white
furnace has to disappear.

## Why this project exists

A path tracer is the easiest kind of program to be wrong about, because a wrong
render looks fine. Shading that is subtly too dark, a sampling basis that is not
orthogonal, a pdf that does not match the lobe it samples — none of it announces
itself. It comes out as an image, and an image is always plausible.

The furnace test removes the judgement. Put a sphere of albedo 1 inside a void
of uniform radiance 1. Every photon that lands on the sphere leaves again, so
the sphere can be neither brighter nor darker than what is behind it: the
correct render is flat 1.0 and the sphere is *not visible at all*. There is no
parameter to tune and nothing to eyeball. Either it disappears or the renderer
is losing energy, and the amount it fails by is the amount it loses.

## The claim

1. **The furnace is exact.** Not close to 1.0 — exactly 1.0, every pixel, every
   sample, deviation `0`. The estimator has no variance in this scene, because
   the sphere is convex and albedo 1 carries each path's energy out unchanged.
2. **A grey sphere returns exactly its albedo**, checked against arithmetic
   rather than against another render.
3. **Error falls as N^-0.5**, measured by fitting the RMSE against sample count,
   because that is what the central limit theorem requires of a mean.
4. **Russian roulette does not move the answer**, only the variance.
5. **Importance sampling does not move the answer**, only the variance.

## Scope

### In

- Spheres and a ground plane, intersected analytically. No acceleration
  structure: these scenes are small enough that a BVH would be more code than it
  saved, and the subject is light transport.
- Lambertian, conductor, dielectric with Fresnel, and GGX microfacet surfaces.
- Cosine-weighted hemisphere sampling, GGX normal sampling with Smith masking,
  Russian roulette, ACES tone mapping.
- A depth-of-field camera with a sampled aperture.
- Progressive accumulation across a pool of workers, one band each.
- Four scenes: a gallery, a caustic, colour bleeding, and the furnace.
- A switch that reintroduces the broken sampling basis this project shipped
  with, so the failure can be watched rather than described.
- An amplified error view for the furnace, labelled with its gain.
- A bench that runs in the page and under Node.

### Out

- Next-event estimation. Its absence is a real cost and is reported rather than
  hidden: without direct light sampling, small bright sources are high variance,
  which is why the caustic scene is still grainy at four thousand samples.
- Triangle meshes, textures, volumetrics, spectral rendering, denoising.

## The honest part

Whatever the GGX sweep produces ships as it comes out, including if the
multiple-scattering compensation only partly works — which is what I expect,
because the added lobe is sampled with the specular pdf rather than its own.

## Acceptance

- [ ] Furnace deviation exactly 0
- [ ] Convergence exponent within 0.08 of -0.5
- [ ] `node tests.mjs` exits non-zero on any failure
- [ ] Runs from its own folder with no build step and no network
- [ ] README with screenshots; registered in the showcase and the root README
