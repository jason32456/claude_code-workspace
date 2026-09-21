// The scenes. Two of them are pictures; the rest exist to be measured.

import { sphere, material, makeCamera, LAMBERT, METAL, DIELECTRIC, EMISSIVE, GGX } from './trace.js';

const white = (v) => [v, v, v];

/** A sky that is one constant radiance in every direction. */
function uniformEnv(L) {
  const c = white(L);
  return () => c;
}

/** A plain daylight gradient, for the pictures. */
function skyEnv() {
  const a = [1.0, 1.0, 1.0], b = [0.42, 0.62, 1.0], out = [0, 0, 0];
  return (dx, dy, dz) => {
    const t = 0.5 * (dy + 1);
    out[0] = a[0] * (1 - t) + b[0] * t;
    out[1] = a[1] * (1 - t) + b[1] * t;
    out[2] = a[2] * (1 - t) + b[2] * t;
    return out;
  };
}

const checker = (a, b) => (x, z) =>
  ((Math.floor(x * 0.5) + Math.floor(z * 0.5)) & 1) ? a : b;

/**
 * The furnace.
 *
 * A sphere of albedo 1 inside a void of radiance 1. Every photon that arrives
 * is sent back out, so the sphere cannot be brighter or darker than what is
 * behind it: the correct image is flat 1.0 and the sphere is invisible. There
 * is no parameter to tune and no eyeballing involved — either it disappears or
 * the renderer is losing energy, and the amount it fails by is the amount it
 * loses.
 */
export function furnaceScene({ albedo = 1, type = LAMBERT, roughness = 0.5, multiScatter = false } = {}) {
  return {
    name: 'furnace',
    spheres: [sphere(0, 0, 0, 1, material(type, albedo, albedo, albedo, { roughness, multiScatter }))],
    plane: null,
    env: uniformEnv(1),
  };
}

export const furnaceCamera = makeCamera({ from: [0, 0, 4], at: [0, 0, 0], fov: 36 });

/** The hero: glass, metal and diffuse over a checkered floor, with depth of field. */
export function galleryScene() {
  const glass = material(DIELECTRIC, 1, 1, 1, { ior: 1.52 });
  const gold = material(METAL, 1.0, 0.78, 0.34, { roughness: 0.03 });
  const rough = material(GGX, 0.92, 0.92, 0.95, { roughness: 0.32, multiScatter: true });
  const red = material(LAMBERT, 0.78, 0.22, 0.20);
  const teal = material(LAMBERT, 0.16, 0.54, 0.52);
  const lamp = material(EMISSIVE, 1.0, 0.86, 0.66, { emit: 22 });

  return {
    name: 'gallery',
    spheres: [
      sphere(-1.15, 0.5, -0.30, 0.5, glass),
      sphere(-1.15, 0.5, -0.30, 0.42, material(DIELECTRIC, 1, 1, 1, { ior: 1 / 1.52 })),
      sphere(0.05, 0.62, -0.55, 0.62, gold),
      sphere(1.45, 0.45, -0.10, 0.45, rough),
      sphere(-0.30, 0.26, 0.72, 0.26, red),
      sphere(0.82, 0.24, 0.80, 0.24, teal),
      sphere(-2.0, 2.4, 1.6, 0.55, lamp),
    ],
    plane: { y: 0, matAt: checker(material(LAMBERT, 0.82, 0.82, 0.84), material(LAMBERT, 0.18, 0.19, 0.22)) },
    env: skyEnv(),
  };
}

export const galleryCamera = makeCamera({
  from: [0.0, 1.12, 3.5], at: [0.05, 0.52, -0.2], fov: 34,
  aperture: 0.055, focus: 3.5,
});

/** Caustics: a glass sphere focusing light onto the floor beneath it. */
export function causticScene() {
  return {
    name: 'caustic',
    spheres: [
      sphere(0, 0.85, 0, 0.62, material(DIELECTRIC, 1, 1, 1, { ior: 1.52 })),
      sphere(-1.9, 3.0, 1.2, 0.6, material(EMISSIVE, 1, 0.92, 0.78, { emit: 34 })),
    ],
    plane: { y: 0, mat: material(LAMBERT, 0.86, 0.86, 0.88) },
    env: uniformEnv(0.03),
  };
}

export const causticCamera = makeCamera({ from: [0, 1.5, 3.4], at: [0, 0.55, 0], fov: 38 });

/** Colour bleeding: two saturated walls either side of a white sphere. */
export function bleedScene() {
  const big = 60;
  return {
    name: 'bleed',
    spheres: [
      sphere(-big - 1.6, 1, 0, big, material(LAMBERT, 0.82, 0.14, 0.12)),
      sphere(big + 1.6, 1, 0, big, material(LAMBERT, 0.13, 0.62, 0.28)),
      sphere(0, 1.0, -big - 2.2, big, material(LAMBERT, 0.86, 0.86, 0.86)),
      sphere(0, big + 3.0, 0, big, material(LAMBERT, 0.86, 0.86, 0.86)),
      sphere(0, 0.72, 0, 0.72, material(LAMBERT, 0.86, 0.86, 0.86)),
      sphere(0, 3.4, 0, 0.62, material(EMISSIVE, 1, 0.93, 0.82, { emit: 26 })),
    ],
    plane: { y: 0, mat: material(LAMBERT, 0.86, 0.86, 0.86) },
    env: uniformEnv(0),
  };
}

export const bleedCamera = makeCamera({ from: [0, 1.5, 5.2], at: [0, 1.2, 0], fov: 38 });

export const SCENES = {
  gallery: { build: galleryScene, camera: galleryCamera, label: 'Gallery' },
  caustic: { build: causticScene, camera: causticCamera, label: 'Caustics' },
  bleed: { build: bleedScene, camera: bleedCamera, label: 'Colour bleeding' },
  furnace: { build: () => furnaceScene(), camera: furnaceCamera, label: 'The furnace' },
};
