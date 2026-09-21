// The background sky, built once per worker as an equirectangular map so a ray
// that escapes only costs a texture lookup.
//
// Two modes. 'stars' is what a camera would see. 'grid' paints the celestial
// sphere in 15-degree cells with the two hemispheres coloured apart, which is
// the only way to see what the lensing is actually doing: the entire sky,
// including the part behind the camera, is wrapped around the shadow an
// unbounded number of times, and on the grid you can count the copies.

const SKY_W = 1536, SKY_H = 768;

function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi + yi * 57), b = hash(xi + 1 + yi * 57);
  const c = hash(xi + (yi + 1) * 57), d = hash(xi + 1 + (yi + 1) * 57);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Planckian locus, Krystek's rational fit through a crude chromatic adaptation.
// Used for both stars and the disk, so a blueshifted disk and a hot star agree.
export function blackbodyRGB(T) {
  const t = Math.max(1000, Math.min(40000, T)) / 100;
  let r, g, b;
  if (t <= 66) r = 255;
  else r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  if (t <= 66) g = 99.4708025861 * Math.log(t) - 161.1195681661;
  else g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => Math.max(0, Math.min(255, v)) / 255;
  return [c(r), c(g), c(b)];
}

export function buildSky(mode) {
  const map = new Float32Array(SKY_W * SKY_H * 3);

  if (mode === 'grid') {
    // Every test is a genuine angular distance, so the cells keep their width
    // right up to the poles instead of smearing into arcs the way a naive
    // equirectangular test does.
    const CELL = 15 * Math.PI / 180, LW = 0.011;
    for (let j = 0; j < SKY_H; j++) {
      const lat = (0.5 - (j + 0.5) / SKY_H) * Math.PI;
      const cl = Math.cos(lat);
      for (let i = 0; i < SKY_W; i++) {
        const lon = ((i + 0.5) / SKY_W) * 2 * Math.PI - Math.PI;
        const dLon = Math.abs(((lon % CELL) + 1.5 * CELL) % CELL - 0.5 * CELL) * cl;
        const dLat = Math.abs(((lat % CELL) + 1.5 * CELL) % CELL - 0.5 * CELL);
        const cell = (Math.floor(lon / CELL) + Math.floor(lat / CELL)) & 1;
        const north = lat >= 0;
        let r, g, b;
        if (dLon < LW || dLat < LW) { r = 1.0; g = 0.97; b = 0.88; }
        else if (north) { r = cell ? 0.05 : 0.015; g = cell ? 0.24 : 0.08; b = cell ? 0.40 : 0.17; }
        else { r = cell ? 0.38 : 0.15; g = cell ? 0.11 : 0.04; b = cell ? 0.26 : 0.11; }
        const k = (j * SKY_W + i) * 3;
        map[k] = r; map[k + 1] = g; map[k + 2] = b;
      }
    }
    return { map, w: SKY_W, h: SKY_H };
  }

  // Nebula: two octaves of value noise, pressed toward a galactic band so the
  // frame has large-scale structure for the lensing to visibly shear.
  for (let j = 0; j < SKY_H; j++) {
    const lat = (0.5 - (j + 0.5) / SKY_H) * Math.PI;
    for (let i = 0; i < SKY_W; i++) {
      const lon = ((i + 0.5) / SKY_W) * 2 * Math.PI;
      const band = Math.exp(-Math.pow((lat + 0.30 * Math.sin(lon * 1.0)) / 0.22, 2));
      let n = noise2(lon * 3.1, lat * 3.1 + 5) * 0.6 + noise2(lon * 9.3, lat * 9.3 + 11) * 0.4;
      n = Math.pow(n, 2.2);
      const v = n * (0.05 + 0.85 * band);
      const k = (j * SKY_W + i) * 3;
      map[k] = v * 0.105; map[k + 1] = v * 0.075; map[k + 2] = v * 0.155;
    }
  }

  // Stars. The footprint is scored by true angular distance to the star rather
  // than by distance in map pixels: near the poles an equirectangular pixel is
  // vanishingly narrow in longitude, and an elliptical stamp there turns every
  // star into an arc of constant latitude circling the pole.
  const N = 13000;
  for (let s = 0; s < N; s++) {
    const inBand = s % 5 !== 0;
    const lon = hash(s * 3.7 + 1) * 2 * Math.PI - Math.PI;
    let sinLat = hash(s * 7.3 + 2) * 2 - 1;
    if (inBand) sinLat *= 0.20 * (1 + hash(s * 11.1 + 3));
    const lat = Math.asin(Math.max(-1, Math.min(1, sinLat - 0.30 * Math.sin(lon))));
    const mag = Math.pow(hash(s * 13.9 + 4), 3.2);
    const T = 2600 + Math.pow(hash(s * 17.3 + 5), 1.6) * 16000;
    const [cr, cg, cb] = blackbodyRGB(T);
    const bright = 0.16 + 4.0 * mag;
    const sig = (0.55 + 1.5 * mag) * Math.PI / SKY_H;        // angular sigma
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const sx = cl * Math.cos(lon), sy = cl * Math.sin(lon), sz = sl;
    const reach = 2.6 * sig;
    const jr = Math.ceil(reach / (Math.PI / SKY_H));
    const jc = Math.round((0.5 - lat / Math.PI) * SKY_H);
    for (let jj = jc - jr; jj <= jc + jr; jj++) {
      if (jj < 0 || jj >= SKY_H) continue;
      const plat = (0.5 - (jj + 0.5) / SKY_H) * Math.PI;
      const pcl = Math.cos(plat), psl = Math.sin(plat);
      const iw = Math.min(SKY_W / 2, Math.ceil((reach / Math.max(2e-3, pcl)) / (2 * Math.PI / SKY_W)));
      const ic = Math.round(((lon + Math.PI) / (2 * Math.PI)) * SKY_W);
      for (let d = -iw; d <= iw; d++) {
        const ii = ((ic + d) % SKY_W + SKY_W) % SKY_W;
        const plon = ((ii + 0.5) / SKY_W) * 2 * Math.PI - Math.PI;
        const dot = pcl * Math.cos(plon) * sx + pcl * Math.sin(plon) * sy + psl * sz;
        const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
        const a = bright * Math.exp(-(ang * ang) / (2 * sig * sig));
        if (a < 0.004) continue;
        const k = (jj * SKY_W + ii) * 3;
        map[k] += a * cr; map[k + 1] += a * cg; map[k + 2] += a * cb;
      }
    }
  }
  return { map, w: SKY_W, h: SKY_H };
}

export function sampleSky(sky, dx, dy, dz) {
  const lon = Math.atan2(dy, dx);
  const lat = Math.asin(Math.max(-1, Math.min(1, dz)));
  let i = Math.floor(((lon + Math.PI) / (2 * Math.PI)) * sky.w);
  let j = Math.floor((0.5 - lat / Math.PI) * sky.h);
  i = ((i % sky.w) + sky.w) % sky.w;
  j = Math.max(0, Math.min(sky.h - 1, j));
  const k = (j * sky.w + i) * 3;
  return [sky.map[k], sky.map[k + 1], sky.map[k + 2]];
}
