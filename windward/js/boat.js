import * as THREE from 'three';
import { BOAT, DEG, RAD } from './config.js';
import { effectiveTrim, clamp, lerp } from './sailing.js';

// Hull stations from transom (t=0) to stem (t=1): half-beam, draft and
// freeboard as fractions. The whole hull is lofted from this table.
const STATIONS = [
  [0.00, 0.62, 0.30, 0.30],
  [0.08, 0.79, 0.44, 0.28],
  [0.20, 0.93, 0.53, 0.26],
  [0.35, 1.00, 0.56, 0.25],
  [0.50, 0.99, 0.55, 0.27],
  [0.65, 0.90, 0.49, 0.31],
  [0.80, 0.70, 0.39, 0.39],
  [0.90, 0.46, 0.27, 0.49],
  [0.97, 0.21, 0.14, 0.60],
  [1.00, 0.03, 0.05, 0.70],
];

const DRAFT = 0.66;
const SHEER = 1.78;
const U_STEPS = 7;

function station(i) {
  const [t, hb, dr, sh] = STATIONS[i];
  return {
    z: (t - 0.5) * BOAT.length,
    hb: hb * (BOAT.beam / 2),
    draft: dr * DRAFT,
    sheer: sh * SHEER,
  };
}

function buildHull() {
  const pos = [];
  const idx = [];
  const rows = STATIONS.length;

  const vert = (s, u, side) => {
    const x = side * s.hb * Math.pow(u, 0.62);
    const y = -s.draft + (s.draft + s.sheer) * Math.pow(u, 1.3);
    return [x, y, s.z];
  };

  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i < rows; i++) {
      const s = station(i);
      for (let j = 0; j < U_STEPS; j++) {
        pos.push(...vert(s, j / (U_STEPS - 1), side));
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < U_STEPS - 1; j++) {
        const a = base + i * U_STEPS + j;
        const b = a + 1;
        const c = a + U_STEPS;
        const d = c + 1;
        if (side < 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
  }

  // Deck: a cambered skin closing the gunwales, so the hull is not a shell.
  const V_STEPS = 7;
  const deckBase = pos.length / 3;
  for (let i = 0; i < rows; i++) {
    const s = station(i);
    for (let j = 0; j < V_STEPS; j++) {
      const v = (j / (V_STEPS - 1)) * 2 - 1;
      pos.push(v * s.hb, s.sheer + (1 - v * v) * 0.07, s.z);
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < V_STEPS - 1; j++) {
      const a = deckBase + i * V_STEPS + j;
      const b = a + 1;
      const c = a + V_STEPS;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  // Transom.
  const s0 = station(0);
  const tBase = pos.length / 3;
  for (let j = 0; j < U_STEPS; j++) {
    const u = j / (U_STEPS - 1);
    pos.push(...vert(s0, u, -1));
    pos.push(...vert(s0, u, 1));
  }
  for (let j = 0; j < U_STEPS - 1; j++) {
    const a = tBase + j * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const HULL_GEO = buildHull();

const SAIL_U = 9;
const SAIL_V = 11;
const BOOM_LEN = 3.0;
const BOOM_Y = 1.28;
const MAST_Z = 0.7;

function buildSailGeometry() {
  const pos = new Float32Array(SAIL_U * SAIL_V * 3);
  const idx = [];
  for (let v = 0; v < SAIL_V - 1; v++) {
    for (let u = 0; u < SAIL_U - 1; u++) {
      const a = v * SAIL_U + u;
      idx.push(a, a + 1, a + SAIL_U, a + 1, a + SAIL_U + 1, a + SAIL_U);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

export class Boat {
  constructor(scene, color, isPlayer = false) {
    this.isPlayer = isPlayer;
    this.group = new THREE.Group();
    this.hullGroup = new THREE.Group();
    this.group.add(this.hullGroup);

    const hullMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.05,
      flatShading: false,
    });
    this.hull = new THREE.Mesh(HULL_GEO, hullMat);
    this.hull.castShadow = true;
    this.hullGroup.add(this.hull);

    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2430, roughness: 0.7 });

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.05, 2.0), dark);
    cockpit.position.set(0, SHEER * 0.27 + 0.055, -0.5);
    this.hullGroup.add(cockpit);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.25, 0.72), dark);
    fin.position.set(0, -1.02, -0.15);
    this.hullGroup.add(fin);

    const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.75, 4, 8), dark);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(0, -1.62, -0.15);
    this.hullGroup.add(bulb);

    this.rudder = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.34), dark);
    this.rudder.position.set(0, -0.55, -3.05);
    this.hullGroup.add(this.rudder);

    const sparMat = new THREE.MeshStandardMaterial({ color: 0xd9e2ec, roughness: 0.35, metalness: 0.4 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, BOAT.rigHeight, 10), sparMat);
    mast.position.set(0, BOAT.rigHeight / 2 + 0.3, MAST_Z);
    this.hullGroup.add(mast);

    this.rig = new THREE.Group();
    this.rig.position.set(0, BOOM_Y, MAST_Z);
    this.hullGroup.add(this.rig);

    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, BOOM_LEN, 8), sparMat);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0, -BOOM_LEN / 2);
    this.rig.add(boom);

    this.sailGeo = buildSailGeometry();
    this.sailMat = new THREE.MeshStandardMaterial({
      color: 0xf6f8fb,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x2a3550),
      emissiveIntensity: 0.25,
    });
    this.sail = new THREE.Mesh(this.sailGeo, this.sailMat);
    this.sail.castShadow = true;
    this.hullGroup.add(this.sail);

    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    }));
    stripe.position.set(0, 4.6, MAST_Z - 0.75);
    stripe.rotation.y = Math.PI / 2;
    this.sailBadge = stripe;
    this.hullGroup.add(stripe);

    this.crew = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.62, 4, 8), new THREE.MeshStandardMaterial({
      color: isPlayer ? 0xff5f4d : 0x39424f, roughness: 0.8,
    }));
    this.crew.position.set(0, SHEER * 0.27 + 0.5, -0.9);
    this.hullGroup.add(this.crew);

    scene.add(this.group);
    this.sailPhase = Math.random() * 10;
  }

  /**
   * Rebuild the mainsail each frame. Camber flips with the tack, flattens as
   * the sail is sheeted in, and collapses into a flogging ripple when the
   * angle of attack goes negative — the luff you can see before you feel it.
   */
  updateSail(state, time) {
    const trim = effectiveTrim(state.trim);
    const tack = Math.sign(state.awa) || 1;
    const boomAngle = -tack * trim * DEG;
    this.rig.rotation.y = boomAngle;

    const luff = state.luffing;
    const flap = luff ? clamp(-state.alpha / 18, 0.25, 1) : 0;
    const camber = lerp(0.42, 0.13, clamp(trim / 90, 0, 1)) * (1 - flap * 0.75);

    const arr = this.sailGeo.attributes.position.array;
    const cosB = Math.cos(boomAngle);
    const sinB = Math.sin(boomAngle);

    for (let v = 0; v < SAIL_V; v++) {
      const fv = v / (SAIL_V - 1);
      const chord = BOOM_LEN * Math.pow(1 - fv, 0.78);
      const height = BOOM_Y + fv * (BOAT.rigHeight - BOOM_Y - 0.25);
      for (let u = 0; u < SAIL_U; u++) {
        const fu = u / (SAIL_U - 1);
        const along = -fu * chord;

        let bulge = Math.sin(Math.PI * fu) * camber * chord * 0.33 * -tack;
        if (flap > 0) {
          bulge += Math.sin(fu * 7 - time * 17 + fv * 3 + this.sailPhase) * 0.20 * flap * fu;
        }

        const i = (v * SAIL_U + u) * 3;
        arr[i] = along * sinB + bulge * cosB;
        arr[i + 1] = height;
        arr[i + 2] = MAST_Z + along * cosB - bulge * sinB;
      }
    }
    this.sailGeo.attributes.position.needsUpdate = true;
    this.sailGeo.computeVertexNormals();

    this.sailBadge.position.set(
      -1.0 * sinB + 0.06 * cosB,
      4.4,
      MAST_Z - 1.0 * cosB,
    );
    this.sailBadge.rotation.y = boomAngle + Math.PI / 2;
  }

  // Sit the hull on the water it is drawn on: sample the surface fore and aft
  // for pitch, athwartships for the wave component of roll.
  updateFloat(state, heightAt, time) {
    const g = this.group;
    g.position.x = state.x;
    g.position.z = state.z;
    g.rotation.y = state.heading;

    const fx = Math.sin(state.heading);
    const fz = Math.cos(state.heading);
    const half = BOAT.length * 0.42;

    const hMid = heightAt(state.x, state.z, time);
    const hBow = heightAt(state.x + fx * half, state.z + fz * half, time);
    const hStern = heightAt(state.x - fx * half, state.z - fz * half, time);
    const hPort = heightAt(state.x - fz * 1.0, state.z + fx * 1.0, time);
    const hStbd = heightAt(state.x + fz * 1.0, state.z - fx * 1.0, time);

    g.position.y = (hBow + hStern + hMid) / 3;

    const pitch = Math.atan2(hBow - hStern, half * 2);
    const waveRoll = Math.atan2(hStbd - hPort, 2.0);

    this.hullGroup.rotation.x = -pitch;
    this.hullGroup.rotation.z = state.heel + waveRoll * 0.7;

    this.rudder.rotation.y = -state.rudder * DEG * 0.9;

    const hikeOut = state.hiking ? 0.85 : 0.1;
    const side = Math.sign(state.heel || 1);
    this.crew.position.x = side * hikeOut;
    this.crew.position.y = SHEER * 0.27 + 0.5 - hikeOut * 0.12;
    this.crew.rotation.z = -side * hikeOut * 0.9;
  }

  update(state, heightAt, time) {
    this.updateFloat(state, heightAt, time);
    this.updateSail(state, time);
  }

  setVisible(v) { this.group.visible = v; }
}
