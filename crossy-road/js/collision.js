const CELL = 1;
const PLAYER_HALF = 0.36; // player collision half-extent in X and Z

// Returns a death reason string or null if alive
export function checkCollisions(player, laneManager) {
  const lane = laneManager.getLane(player.row);
  if (!lane) return null;

  if (lane.type !== 'road') return null;

  // Player world position
  const px = player.col * CELL;
  const pz = -player.row * CELL;

  for (const v of lane.vehicles) {
    const dx = Math.abs(px - v.x);
    const dz = Math.abs(pz - v.mesh.position.z);
    if (dx < PLAYER_HALF + v.halfW && dz < PLAYER_HALF + v.halfD) {
      return 'vehicle';
    }
  }

  return null;
}
