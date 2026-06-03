import * as THREE from 'three';
import { lerp } from './utils';
import { BikeState } from './bike';

export type CameraMode = 'chase' | 'low' | 'firstPerson';

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'chase';
  private targetPos = new THREE.Vector3();
  private currentPos = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private shakeIntensity = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 2000);
  }

  cycleMode() {
    const modes: CameraMode[] = ['chase', 'low', 'firstPerson'];
    const cur = modes.indexOf(this.mode);
    this.mode = modes[(cur + 1) % modes.length];
  }

  update(bike: BikeState, dt: number) {
    const { position: bikePos, heading, speed } = bike;
    const fwdX = Math.sin(heading);
    const fwdZ = Math.cos(heading);

    let offset: THREE.Vector3;
    let lookAheadDist: number;
    let lerpSpeed: number;

    switch (this.mode) {
      case 'chase':
        offset = new THREE.Vector3(-fwdX * 9, 4.5, -fwdZ * 9);
        lookAheadDist = 12;
        lerpSpeed = 6;
        break;
      case 'low':
        offset = new THREE.Vector3(-fwdX * 7, 1.8, -fwdZ * 7);
        lookAheadDist = 16;
        lerpSpeed = 8;
        break;
      case 'firstPerson':
        offset = new THREE.Vector3(0, 1.3, -0.2);
        lookAheadDist = 30;
        lerpSpeed = 15;
        break;
    }

    this.targetPos.set(
      bikePos.x + offset.x,
      bikePos.y + offset.y,
      bikePos.z + offset.z,
    );

    const alpha = Math.min(lerpSpeed * dt, 1);
    this.currentPos.lerp(this.targetPos, alpha);

    const lookAt = new THREE.Vector3(
      bikePos.x + fwdX * lookAheadDist,
      bikePos.y + 1.2,
      bikePos.z + fwdZ * lookAheadDist,
    );
    this.currentLookAt.lerp(lookAt, Math.min(lerpSpeed * 1.2 * dt, 1));

    // Speed-based FOV
    const speedFrac = speed / 52;
    this.camera.fov = lerp(60, 80, speedFrac * speedFrac);
    this.camera.updateProjectionMatrix();

    // Boost camera shake
    const boost = bike.boostMeter > 0.01 && speed > 45;
    if (boost) {
      this.shakeIntensity = Math.min(this.shakeIntensity + dt * 4, 0.15);
    } else {
      this.shakeIntensity *= Math.pow(0.05, dt);
    }
    const sx = (Math.random() - 0.5) * this.shakeIntensity;
    const sy = (Math.random() - 0.5) * this.shakeIntensity;

    this.camera.position.set(
      this.currentPos.x + sx,
      this.currentPos.y + sy,
      this.currentPos.z,
    );
    this.camera.lookAt(this.currentLookAt);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Initialize camera immediately at bike position (no lerp) */
  snapTo(bike: BikeState) {
    const { position, heading } = bike;
    const fwdX = Math.sin(heading), fwdZ = Math.cos(heading);
    this.currentPos.set(position.x - fwdX * 9, position.y + 4.5, position.z - fwdZ * 9);
    this.currentLookAt.set(position.x + fwdX * 12, position.y + 1.2, position.z + fwdZ * 12);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}
