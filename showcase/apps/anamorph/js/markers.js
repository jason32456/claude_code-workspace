// Square fiducial markers, and the codebook that makes their identity and their
// orientation both recoverable. An 8x8 texture: a white quiet zone, a black
// border one cell thick, and a 4x4 payload.
//
// The codebook is searched rather than tabulated. A usable code has to survive
// two things: being confused with another code, and being confused with its own
// rotations -- if a code looks like itself turned ninety degrees, the marker
// still identifies but its corner ordering is ambiguous, and the pose comes back
// rotated by a right angle with a perfectly healthy reprojection error.

export const CELLS = 8;          // quiet zone + border + payload + border + quiet
export const PAYLOAD = 4;

function rot90(bits) {
  const out = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + (3 - r)] = bits[r * 4 + c];
  return out;
}
const toBits = (n) => Array.from({ length: 16 }, (_, i) => (n >> i) & 1);
const fromBits = (b) => b.reduce((a, v, i) => a | (v << i), 0);
const hamming = (a, b) => { let d = 0; for (let i = 0; i < 16; i++) if (a[i] !== b[i]) d++; return d; };

export function buildCodebook(count = 12, minInter = 6, minSelf = 5) {
  const accepted = [];
  for (let n = 0; n < 65536 && accepted.length < count; n++) {
    const bits = toBits(n);
    const ones = bits.reduce((a, b) => a + b, 0);
    if (ones < 5 || ones > 11) continue; // keep them visually balanced
    const rots = [bits];
    for (let i = 0; i < 3; i++) rots.push(rot90(rots[rots.length - 1]));
    let selfMin = 16;
    for (let i = 1; i < 4; i++) selfMin = Math.min(selfMin, hamming(bits, rots[i]));
    if (selfMin < minSelf) continue;
    let ok = true;
    for (const a of accepted) {
      for (const r of rots) {
        for (const ar of a.rots) if (hamming(ar, r) < minInter) { ok = false; break; }
        if (!ok) break;
      }
      if (!ok) break;
    }
    if (!ok) continue;
    accepted.push({ id: accepted.length, code: n, bits, rots, selfMin });
  }
  return accepted;
}

export const CODEBOOK = buildCodebook();

// Texture lookup for a marker quad, in uv over the full 8x8 texture.
export function markerTexel(id, u, v) {
  const cx = Math.floor(u * CELLS), cy = Math.floor(v * CELLS);
  if (cx < 0 || cy < 0 || cx >= CELLS || cy >= CELLS) return 0.93;
  if (cx === 0 || cy === 0 || cx === CELLS - 1 || cy === CELLS - 1) return 0.93; // quiet zone
  const ix = cx - 1, iy = cy - 1;                                                // 6x6 block
  if (ix === 0 || iy === 0 || ix === 5 || iy === 5) return 0.045;                // black border
  const b = CODEBOOK[id % CODEBOOK.length].bits[(iy - 1) * 4 + (ix - 1)];
  return b ? 0.93 : 0.045;
}

// Read a 4x4 payload off a sampled grid and match it, trying all four rotations.
// Returns the rotation needed to bring the observed corners into the canonical
// order, or null if nothing is close enough.
export function decode(bits, maxErr = 2) {
  let best = null;
  for (const entry of CODEBOOK) {
    for (let r = 0; r < 4; r++) {
      let d = 0;
      for (let i = 0; i < 16; i++) if (entry.rots[r][i] !== bits[i]) d++;
      if (!best || d < best.err) best = { id: entry.id, rot: r, err: d };
    }
  }
  return best && best.err <= maxErr ? best : null;
}

export { rot90, toBits, fromBits, hamming };
