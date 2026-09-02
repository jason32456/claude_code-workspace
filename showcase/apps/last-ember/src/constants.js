export const TILE = { WALL: 0, FLOOR: 1, STAIRS: 2, EMBERHEART: 3 };

export const TILE_SIZE = 32;
export const VIEW_COLS = 19;
export const VIEW_ROWS = 13;

export const DUNGEON_W = 60;
export const DUNGEON_H = 34;
export const MAX_FLOOR = 8;

// Torch fuel is measured in turns remaining. Bands drive both the light
// radius and the low-fuel warning messages, so they live in one place.
export const FUEL_HIGH = 60;
export const FUEL_MED = 25;
export const FUEL_CAP = 220;

export const INVENTORY_CAP = 9;

export function lightRadius(fuel) {
  if (fuel <= 0) return 1;
  if (fuel <= FUEL_MED) return 2;
  if (fuel <= FUEL_HIGH) return 4;
  return 6;
}

export function fuelBand(fuel) {
  if (fuel <= 0) return 'empty';
  if (fuel <= FUEL_MED) return 'low';
  if (fuel <= FUEL_HIGH) return 'medium';
  return 'high';
}
