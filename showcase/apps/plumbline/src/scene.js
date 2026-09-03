import * as THREE from '../vendor/three.module.js';
import { boxGeo, mergeGeos, rnd } from './build3d.js';

// Keyframes for the shift: 0 = first light, 1 = dark. Everything visual in the
// game — sky, sun angle, shadow length, whether the floods are on — is driven
// off the same clock the player is racing.
const SKY = [
  { t: 0.00, top: 0x1d2f4c, bot: 0xe08a4c, sun: 0xff9a55, si: 1.5, hemi: 0.75, amb: 0x3b4a66, el: 5 },
  { t: 0.16, top: 0x3d6ea8, bot: 0xdcd0b8, sun: 0xffe6bc, si: 2.9, hemi: 1.25, amb: 0x4a5c78, el: 22 },
  { t: 0.42, top: 0x3f7dc4, bot: 0xcfe3f2, sun: 0xfff6e6, si: 3.4, hemi: 1.55, amb: 0x56698a, el: 58 },
  { t: 0.66, top: 0x5b7bb0, bot: 0xf6c184, sun: 0xffc98a, si: 3.0, hemi: 1.25, amb: 0x53607e, el: 26 },
  { t: 0.84, top: 0x2f4068, bot: 0xf2794a, sun: 0xff7e50, si: 1.7, hemi: 0.8, amb: 0x3c4666, el: 7 },
  { t: 0.94, top: 0x182440, bot: 0x5c4a68, sun: 0x6d5a86, si: 0.5, hemi: 0.5, amb: 0x2b3350, el: -3 },
  { t: 1.00, top: 0x0a1220, bot: 0x1a2338, sun: 0x35486e, si: 0.12, hemi: 0.32, amb: 0x1d2540, el: -8 },
];

const DAY_TEXT = [
  [0.10, 'first light'], [0.28, 'morning'], [0.48, 'midday'], [0.64, 'afternoon'],
  [0.78, 'golden hour'], [0.90, 'dusk'], [1.01, 'floodlights'],
];

const skyVert = `
  varying vec3 vW;
  void main() { vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const skyFrag = `
  uniform vec3 topColor; uniform vec3 botColor; uniform vec3 sunColor; uniform vec3 sunDir;
  varying vec3 vW;
  void main() {
    vec3 d = normalize(vW);
    float h = smoothstep(-0.16, 0.62, d.y);
    vec3 c = mix(botColor, topColor, h);
    float s = max(dot(d, normalize(sunDir)), 0.0);
    c += sunColor * (pow(s, 220.0) * 1.4 + pow(s, 9.0) * 0.16);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function lerpKeys(t01) {
  let a = SKY[0], b = SKY[SKY.length - 1];
  for (let i = 0; i < SKY.length - 1; i++) {
    if (t01 >= SKY[i].t && t01 <= SKY[i + 1].t) { a = SKY[i]; b = SKY[i + 1]; break; }
  }
  const k = a === b ? 0 : (t01 - a.t) / Math.max(1e-4, b.t - a.t);
  return { a, b, k: Math.min(1, Math.max(0, k)) };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.t01 = 0;

    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x3f7dc4) },
      botColor: { value: new THREE.Color(0xcfe3f2) },
      sunColor: { value: new THREE.Color(0xfff6e6) },
      sunDir: { value: new THREE.Vector3(0.4, 0.4, 0.6) },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 20),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms, vertexShader: skyVert, fragmentShader: skyFrag,
        side: THREE.BackSide, depthWrite: false, fog: false,
      })
    );
    sky.frustumCulled = false;
    scene.add(sky);

    scene.fog = new THREE.Fog(0xcfe3f2, 190, 720);

    this.hemi = new THREE.HemisphereLight(0xbcd6f0, 0x4a4237, 1.1);
    scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x3a4c66, 1.0);
    scene.add(this.amb);

    this.sun = new THREE.DirectionalLight(0xfff6e6, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -62; c.right = 62; c.top = 96; c.bottom = -34; c.near = 1; c.far = 320;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.4;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sun.target.position.set(10, 12, 0);

    this._buildGround();
    this._buildCity();
    this._buildFloods();
    this._buildSock();
    this.setTime(0);
  }

  _buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 1 })
    );
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.scene.add(g);

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(58, 48),
      new THREE.MeshStandardMaterial({ color: 0x6b6055, roughness: 1 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.02;
    pad.receiveShadow = true;
    this.scene.add(pad);

    const r = rnd(4711);
    const marks = [];
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = 8 + r() * 48;
      marks.push(boxGeo(1.6 + r() * 5, 0.03, 1.2 + r() * 3.4, Math.cos(a) * d, 0.045, Math.sin(a) * d, 0, r() * 3, 0));
    }
    const m = new THREE.Mesh(mergeGeos(marks), new THREE.MeshStandardMaterial({ color: 0x554b41, roughness: 1 }));
    m.receiveShadow = true;
    this.scene.add(m);

    // Site hoarding — a ring of panels that reads as "this is a construction site"
    // from any camera angle and hides the horizon seam.
    const fence = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      fence.push(boxGeo(5.6, 2.4, 0.16, Math.cos(a) * 57, 1.2, Math.sin(a) * 57, 0, -a + Math.PI / 2, 0));
    }
    const fm = new THREE.Mesh(mergeGeos(fence), new THREE.MeshStandardMaterial({ color: 0x3b6f5a, roughness: 0.9 }));
    fm.castShadow = true;
    this.scene.add(fm);
  }

  _buildCity() {
    const r = rnd(90210);
    const blocks = [];
    const wins = [];
    for (let i = 0; i < 130; i++) {
      const a = r() * Math.PI * 2;
      const d = 120 + r() * 300;
      const w = 14 + r() * 26, dp = 14 + r() * 26;
      const h = 12 + Math.pow(r(), 2.2) * 110;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      blocks.push(boxGeo(w, h, dp, x, h / 2, z));
      const rows = Math.floor(h / 4.2), cols = Math.floor(w / 4.6);
      for (let ry = 1; ry < rows; ry++) {
        for (let cx = 0; cx < cols; cx++) {
          if (r() > 0.28) continue;
          const wx = x - w / 2 + (cx + 0.5) * (w / cols);
          const wy = ry * 4.2;
          const sign = Math.cos(a) > 0 ? -1 : 1;
          wins.push(boxGeo(2.0, 1.5, 0.4, wx, wy, z + sign * (dp / 2)));
        }
      }
    }
    const cm = new THREE.Mesh(mergeGeos(blocks), new THREE.MeshStandardMaterial({ color: 0x2f3947, roughness: 0.95 }));
    this.scene.add(cm);
    this.windows = new THREE.Mesh(
      mergeGeos(wins),
      new THREE.MeshBasicMaterial({ color: 0xffd79a, transparent: true, opacity: 0, fog: false })
    );
    this.scene.add(this.windows);
  }

  _buildFloods() {
    const geos = [];
    this.floodPositions = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.7;
      const x = Math.cos(a) * 46, z = Math.sin(a) * 46;
      geos.push(boxGeo(0.5, 17, 0.5, x, 8.5, z));
      geos.push(boxGeo(2.6, 0.9, 1.0, x, 17.4, z));
      this.floodPositions.push(new THREE.Vector3(x, 17.4, z));
    }
    const m = new THREE.Mesh(mergeGeos(geos), new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.8 }));
    m.castShadow = true;
    this.scene.add(m);

    this.floodLamps = new THREE.Mesh(
      mergeGeos(this.floodPositions.map((p) => boxGeo(2.2, 0.7, 0.2, p.x, p.y, p.z))),
      new THREE.MeshBasicMaterial({ color: 0xfff0cc, transparent: true, opacity: 0, fog: false })
    );
    this.scene.add(this.floodLamps);

    this.floodLights = this.floodPositions.slice(0, 3).map((p) => {
      const l = new THREE.PointLight(0xffe2b0, 0, 130, 1.6);
      l.position.copy(p);
      this.scene.add(l);
      return l;
    });
  }

  _buildSock() {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 14, 8),
      new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.7 })
    );
    pole.position.set(-6, 7, 26);
    pole.castShadow = true;
    this.scene.add(pole);

    this.sock = new THREE.Group();
    this.sock.position.set(-6, 13.4, 26);
    const bands = [0xff6a3d, 0xf2f2f2, 0xff6a3d, 0xf2f2f2];
    for (let i = 0; i < 4; i++) {
      const s = 1 - i * 0.14;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55 * s, 0.55 * (s - 0.14), 1.0, 10, 1, true),
        new THREE.MeshStandardMaterial({ color: bands[i], roughness: 0.85, side: THREE.DoubleSide })
      );
      seg.rotation.z = Math.PI / 2;
      seg.position.x = 0.55 + i * 1.0;
      this.sock.add(seg);
    }
    this.scene.add(this.sock);
  }

  setWind(dirRad, speed) {
    // The sock points downwind and lifts toward horizontal as it fills.
    this.sock.rotation.y = -dirRad + Math.PI;
    this.sock.children.forEach((c, i) => {
      c.position.y = -(1 - Math.min(1, speed / 12)) * (i + 1) * 0.42;
    });
  }

  setTime(t01) {
    this.t01 = t01;
    const { a, b, k } = lerpKeys(t01);
    const T = this._tmp || (this._tmp = {
      top: new THREE.Color(), bot: new THREE.Color(), sun: new THREE.Color(),
      amb: new THREE.Color(), o: new THREE.Color(), d: new THREE.Vector3(),
    });
    const top = T.top.setHex(a.top).lerp(T.o.setHex(b.top), k);
    const bot = T.bot.setHex(a.bot).lerp(T.o.setHex(b.bot), k);
    const sunC = T.sun.setHex(a.sun).lerp(T.o.setHex(b.sun), k);
    const si = a.si + (b.si - a.si) * k;
    const hi = a.hemi + (b.hemi - a.hemi) * k;
    const el = (a.el + (b.el - a.el) * k) * Math.PI / 180;
    const az = -0.6 + t01 * 2.5;

    this.skyUniforms.topColor.value.copy(top);
    this.skyUniforms.botColor.value.copy(bot);
    this.skyUniforms.sunColor.value.copy(sunC);

    const d = T.d.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    this.skyUniforms.sunDir.value.copy(d);
    this.sun.position.copy(d).multiplyScalar(160).add(this.sun.target.position);
    this.sun.color.copy(sunC);
    this.sun.intensity = si;
    this.hemi.intensity = hi;
    this.amb.color.copy(T.amb.setHex(a.amb).lerp(T.o.setHex(b.amb), k));

    this.scene.fog.color.copy(bot).lerp(top, 0.35);

    const night = Math.min(1, Math.max(0, (t01 - 0.78) / 0.16));
    this.windows.material.opacity = night * 0.9;
    this.floodLamps.material.opacity = night;
    this.floodLights.forEach((l) => { l.intensity = night * 900; });

    return { night, sunDir: d };
  }

  dayText() {
    for (const [t, s] of DAY_TEXT) if (this.t01 < t) return s;
    return 'floodlights';
  }
}
