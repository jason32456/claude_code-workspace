import * as THREE from 'three';
import { RACE } from './config.js';

// Laid out on the wind axis (+Z is upwind) so every lap forces one beat, one
// reach and one run. Change the wind and the course keeps its meaning.
export const MARKS = [
  { name: 'WINDWARD', x: 0, z: 100, color: 0xff5a3c },
  { name: 'WING', x: 105, z: 100, color: 0xffc23c },
  { name: 'LEEWARD', x: 0, z: -100, color: 0x3cc9ff },
];

export const COURSE_BOUNDS = 190;

function buoyMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.5, 3.1, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: new THREE.Color(color), emissiveIntensity: 0.22 }),
  );
  body.position.y = 1.2;
  body.castShadow = true;
  g.add(body);

  const top = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, 1.5, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
  );
  top.position.y = 3.4;
  g.add(top);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x2b3340 }),
  );
  pole.position.y = 5.0;
  g.add(pole);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.62),
    new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  flag.position.set(0.5, 5.7, 0);
  g.add(flag);
  g.userData.flag = flag;

  // A vertical beam rather than a ring on the water: a ring seen from a
  // helmsman's eye height is just a stray line across the sea.
  const beamGeo = new THREE.CylinderGeometry(1.5, 2.6, 34, 16, 1, true);
  const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
    vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vY;
      void main(){ gl_FragColor = vec4(uColor, (1.0 - vY) * (1.0 - vY) * uOpacity); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  beam.position.y = 17;
  g.add(beam);
  g.userData.halo = beam;

  return g;
}

function committeeBoat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.5, 11),
    new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.5 }),
  );
  hull.position.y = 0.5;
  hull.castShadow = true;
  g.add(hull);

  const house = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.7, 4.2),
    new THREE.MeshStandardMaterial({ color: 0x2f3946, roughness: 0.6 }),
  );
  house.position.set(0, 2.0, -1.1);
  g.add(house);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xd9e2ec, metalness: 0.4, roughness: 0.3 }),
  );
  mast.position.set(0, 4.2, 1.6);
  g.add(mast);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xff3b3b, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  flag.position.set(0.85, 6.2, 1.6);
  g.add(flag);
  g.userData.flag = flag;
  return g;
}

export class Course {
  constructor(scene) {
    this.group = new THREE.Group();
    this.marks = MARKS.map((m) => {
      const mesh = buoyMesh(m.color);
      mesh.position.set(m.x, 0, m.z);
      this.group.add(mesh);
      return { ...m, mesh };
    });

    this.committee = committeeBoat();
    this.committee.position.set(30, 0, -100);
    this.committee.rotation.y = Math.PI / 2;
    this.group.add(this.committee);

    scene.add(this.group);
  }

  update(time, heightAt, activeIndex) {
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      const y = heightAt(m.x, m.z, time);
      m.mesh.position.y = y - 0.9;
      m.mesh.rotation.z = Math.sin(time * 0.9 + i) * 0.06;
      m.mesh.rotation.x = Math.cos(time * 0.75 + i * 2) * 0.06;
      m.mesh.userData.flag.rotation.y = Math.sin(time * 4 + i) * 0.35;

      const beam = m.mesh.userData.halo;
      const target = i === activeIndex ? 0.30 + Math.sin(time * 2.4) * 0.07 : 0;
      const u = beam.material.uniforms.uOpacity;
      u.value += (target - u.value) * 0.08;
      beam.visible = u.value > 0.004;
    }

    const cy = heightAt(30, -100, time);
    this.committee.position.y = cy - 0.4;
    this.committee.rotation.z = Math.sin(time * 0.8) * 0.05;
    this.committee.userData.flag.rotation.y = Math.sin(time * 3.5) * 0.4;
  }
}

/** Per-boat race progress: which mark is next, laps, timing, penalties. */
export class Progress {
  constructor() {
    this.markIndex = 0;
    this.lap = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lastLapAt = 0;
    this.penaltyUntil = -1;
    this.justRounded = false;
    this.hitMark = false;
  }

  get target() { return MARKS[this.markIndex]; }

  // Distance still to sail, used purely for ordering the fleet.
  remaining(x, z) {
    // Finished boats rank ahead of everyone still sailing, earliest first.
    if (this.finished) return -1e6 + this.finishTime;
    let d = Math.hypot(x - this.target.x, z - this.target.z);
    for (let i = this.markIndex + 1; i < MARKS.length; i++) {
      const a = MARKS[i - 1];
      const b = MARKS[i];
      d += Math.hypot(b.x - a.x, b.z - a.z);
    }
    const lapLen = MARKS.reduce((acc, m, i) => {
      const p = MARKS[(i + MARKS.length - 1) % MARKS.length];
      return acc + Math.hypot(m.x - p.x, m.z - p.z);
    }, 0);
    return d + (RACE.laps - 1 - this.lap) * lapLen;
  }

  step(x, z, time) {
    this.justRounded = false;
    this.hitMark = false;
    if (this.finished) return;

    const m = this.target;
    const d = Math.hypot(x - m.x, z - m.z);

    if (d < RACE.hitRadius) {
      this.hitMark = true;
      this.penaltyUntil = time + RACE.penaltySeconds;
    }

    if (d < RACE.roundRadius) {
      this.justRounded = true;
      this.markIndex++;
      if (this.markIndex >= MARKS.length) {
        this.markIndex = 0;
        this.lap++;
        this.lapTimes.push(time - this.lastLapAt);
        this.lastLapAt = time;
        if (this.lap >= RACE.laps) {
          this.finished = true;
          this.finishTime = time;
        }
      }
    }
  }
}
