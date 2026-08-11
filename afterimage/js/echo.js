import { makeBox, setBoxCenter, overlaps } from './physics.js';
import { makeFigure, HX, HY, HZ, ECHO_PAD } from './player.js';

// A banked take. Playback is pure transform replay — no re-simulation — which is
// what makes an echo byte-identical on every machine and every subsequent take.
export class Echo {
  constructor(scene, frames, index) {
    this.frames = frames;
    this.scene = scene;
    const w = (HX + ECHO_PAD) * 2;
    this.mesh = makeFigure({ color: 0x8b6bd6, emissive: 0xb478ff, ghost: true, cage: [w, HY * 2, w] });
    this.mesh.userData.mat.opacity = 0.3 + Math.min(0.16, index * 0.04);
    scene.add(this.mesh);

    const f = frames[0];
    this.body = makeBox(f.x, f.y, f.z, (HX + ECHO_PAD) * 2, HY * 2, (HZ + ECHO_PAD) * 2);
    this.body.solid = false;
    this.armed = false;
    this.used = false;
  }

  reset() { this.armed = false; this.body.solid = false; }

  // Freezing on the final frame is deliberate: rewinding while stood on a plate
  // leaves an echo that holds it for the rest of the loop.
  update(tick, playerBody) {
    const i = Math.min(tick, this.frames.length - 1);
    const f = this.frames[i];
    setBoxCenter(this.body, f.x, f.y, f.z);

    // Every take begins with you and all your echoes stacked on the same spawn
    // point. An echo stays intangible until you have stepped clear of it once,
    // so nobody gets shoved off the start pad by their own past.
    if (!this.armed && playerBody && !overlaps(this.body, playerBody, 0.05)) {
      this.armed = true;
      this.body.solid = true;
      this.mesh.userData.cage.opacity = 0.5;
    } else if (!this.armed) {
      this.mesh.userData.cage.opacity = 0.16;
    }

    this.mesh.position.set(f.x, f.y - HY, f.z);
    this.mesh.rotation.y = f.yaw;
    this.used = tick < this.frames.length && f.use;
    return this.used;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
