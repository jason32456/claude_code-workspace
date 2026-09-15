# Anamorph — Product Requirements Document

## One line

Render a scene under a camera the app then deletes, recover that camera from the
rendered pixels alone, and prove the recovery with an anamorphic painting that
resolves into a picture from the recovered viewpoint and from nowhere else.

## Why this shape

The repository's strongest entries all do the same thing: implement something
hard with no library, hold an oracle against it that the app did not author, and
report a measurement that contradicts the thing the project set out to
illustrate. `crib` enciphers a message, throws the key away, and takes it back.
This is the same move aimed at geometry instead of cryptanalysis — encipher a
*camera* into a set of pixels, throw it away, and take it back.

What makes it worth building rather than reading about is the oracle. Pose
estimation is normally graded by a number nobody can feel: "0.4 px reprojection
error" means nothing to a viewer, and an app that prints it is asking to be
trusted. An anamorph cannot be trusted or distrusted — it either resolves or it
smears, and a pose wrong by two degrees smears visibly. The viewer grades a
six-degree-of-freedom solve with their eyes before a single number appears.

## How this document changed

Two of the five claims below are not the ones this project started with, and one
of them is a straight withdrawal.

**The focal-length/distance ambiguity is real, and relief is not what resolves
it.** The plan was to sweep scene relief and watch the ambiguity close as the
markers lifted out of a plane. It does not close, because it was never open: at
exactly zero relief — markers coplanar to `6e-17 mm` — the focal length still
comes back to `0.07%`, and no relief setting is measurably better than any other.
Those markers lie on the floor and are seen at a steep angle, and **a slanted
plane determines the focal length by itself**: one homography puts two
constraints on the intrinsics, and they go degenerate only when the plane faces
the camera square-on. Swept properly, against target *slant*, the effect is as
stark as it gets — square-on, a 3.1× range of focal length fits the photograph
with the residual moving `0.000 px` in total, the camera sliding from `566 mm` to
`1718 mm` to compensate. The relief sweep ships anyway, as a finding of its own,
because deleting it would make the slant result look like something this project
knew in advance.

**"Extra distortion parameters make the pose worse" is withdrawn.** Fitting two
radial coefficients to a scene rendered as a true pinhole lowers the residual in
5 of 5 noise levels, as it must. It does *not* reliably damage the pose: position
error improves in 2 of 5, with ratios on both sides of 1. The claim as drafted
was wrong. What survives is weaker and more useful, and it happens to be this
project's whole thesis: the spare parameters buy a better-looking residual and no
better camera, so **the residual is not measuring the thing you care about**.

A third number is worth stating plainly rather than as a claim: the solver fits
its 24 marker corners to `0.087 px` and is `8.2×` worse on scene geometry it was
never given a correspondence for. Fitting well and being right are different.

## The mechanism

1. A scene is built: a floor, a back wall, three boxes at different depths, and
   six square fiducial markers glued to the geometry at varying orientations.
2. A camera is drawn — 6-DoF pose, focal length, principal point, two radial
   distortion coefficients — and **hidden from everything downstream**. The
   solver's module never receives it; it receives an `ImageData`.
3. A software rasteriser (z-buffer, perspective-correct interpolation,
   supersampled) renders the scene from that camera through the distortion
   model. This is "the photograph".
4. The solver works on the photograph: Otsu threshold, contour trace, quad fit,
   perspective-unwarp each candidate, sample its bit grid, match the codebook
   with 4-way rotation, refine corners to sub-pixel, then normalised DLT
   homography → pose seed → Levenberg–Marquardt over the full
   intrinsic + extrinsic + distortion vector, with RANSAC around it.
5. The anamorph is then painted **keyed to the recovered camera**: for every
   surface point `X` in the scene, its colour is the source image sampled at
   `project(C_recovered, X)`.
6. That repainted scene is rendered **from the true camera**. If the recovery is
   exact the two cameras cancel and the picture comes back whole. If it is
   wrong, the error is applied to the picture, and you see it.

The composition `project(C_est, ·)` followed by `render(C_true, ·)` is the
identity if and only if `C_est = C_true`. That is the whole proof, and it is a
picture.

## Claims this document commits to

Every number below is recomputed live in the page from the current scene, not
written into the copy. Where a claim did not survive measurement, the document
says so rather than being quietly edited.

**1. The camera comes back.** Position error in millimetres, orientation error
in degrees, focal-length error in percent, and reprojection RMSE in pixels —
reported on the four marker corners, and separately on scene vertices the
solver never fitted to, which is the one that matters. Plus the anamorph
residual: RMS pixel difference between the resolved render and the source
image.

**2. The easiest-looking target is the one the general algorithm cannot solve.**
Lay all six markers flat on the floor and the 6-point linear DLT — the textbook
way to get a camera matrix from 3D↔2D correspondences — goes rank-deficient,
because a plane spans only a 3-dimensional subspace and the 12×12 system loses
four dimensions of rank. Measured: 3 of the 12 singular values collapse to zero and the
condition number is infinite, against none off the plane, where the same method
is exact to `9.1e-12` mm. The page reports the singular spectrum and the pose
error for both routes side by side. The homography route,
which is *only* valid on a plane, sails through the case that destroys the
general method.

**3. Focal length and distance are the same thing, and target slant is what
separates them.** Hold a flat target square-on and the image cannot tell a long
lens far away from a short one close up: the residual is flat across the whole
swept range of `f`, and the recovered distance scales with it. The page sweeps the
*slant* of that target and reports where the valley closes. It also keeps the
relief sweep that was supposed to produce this result and did not.

**4. Two extra parameters that always lower the residual and buy nothing.** Fit a
true pinhole with the radial coefficients free. They have nothing real to find,
so the residual must fall — and the pose does not measurably change. Reported as
the negative result it is, because it is the clearest statement of why this page
has an anamorph and not a residual.

**5. Spread beats count.** One photograph of twelve markers, used twice: six
chosen spread across the frame against six chosen from one corner, at identical
count, marker size, noise realisation and pixels. The spread six win by `2.4x`,
and their residuals are identical to three decimals, so nothing in the fit
reports the problem. All twelve are no better than the well-chosen six.

## What the page refuses to do

- It reports no accuracy figure for a user-supplied image, because there is no
  ground truth for one. Detection and pose still run and still draw; the error
  panel goes blank with the reason, rather than inventing a number.
- Translation magnitude from a *single* view with unknown focal length is not
  recoverable independently of focal length, and the page says so where it would
  otherwise print a millimetre figure.
- Markers smaller than a threshold in the image, or clipped by the frame edge,
  are rejected with the reason rather than fitted badly.

## Self-tests

Run in-page against ground truth derived outside the solver, in the style the
repository already uses — because a subtly wrong pose pipeline is still
self-consistent, and every panel would look right while the geometry was wrong:

1. A 4-point homography against its own defining correspondences, plus the
   projective invariant that the unit square's centre maps to where the image
   quadrilateral's diagonals actually cross.
2. Rodrigues round trip: `log(exp(w)) = w` to machine precision, including near
   the `π` singularity.
3. Central finite differences on every entry of the LM analytic Jacobian.
4. A projection checked against an analytically known answer.
5. Normalised vs unnormalised DLT on deliberately badly scaled correspondences.
6. Full round trip: render → solve → re-render → pixel difference.
7. The planar DLT rank deficiency, asserted as a rank, not a vibe.
8. RANSAC separating four good markers from two planted bad ones, with no
   false positives and nothing good dropped.
9. The anamorph behaving as an oracle: pixel-identical for the right camera,
   and visibly wrong one degree away.

## Non-goals

No WebGL — a software rasteriser is slower but deterministic in headless
Chromium with no GPU flags, and this project's screenshots are its argument. No
camera input: the scene is synthesised, which is what makes ground truth exact
and free. No vendored library, no build step.
