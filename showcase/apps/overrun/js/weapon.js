import * as THREE from '../vendor/three.module.min.js';
import { GUN_DMG, GUN_FIRE_INTERVAL, GUN_MAG, RELOAD_TIME, RECOIL_AMT, RECOIL_REC } from './constants.js';

function addBox(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function buildGunMesh() {
  const group = new THREE.Group();

  const metal = new THREE.MeshLambertMaterial({ color: 0x2a2a2a, flatShading: true });
  const dark  = new THREE.MeshLambertMaterial({ color: 0x181818, flatShading: true });
  const accnt = new THREE.MeshLambertMaterial({ color: 0x1a3a1a, flatShading: true });

  addBox(group, 0.10,  0.08,  0.22, metal,  0,      0,      0      ); // body
  addBox(group, 0.045, 0.045, 0.32, metal,  0,      0.010, -0.24   ); // barrel
  addBox(group, 0.065, 0.13,  0.09, dark,   0,     -0.10,   0.04   ); // grip
  addBox(group, 0.058, 0.11,  0.058, accnt, 0,     -0.125, -0.04   ); // mag
  addBox(group, 0.020, 0.04,  0.08, dark,   0,     -0.055,  0.04   ); // trigger guard
  addBox(group, 0.030, 0.03,  0.12, dark,   0,      0.06,  -0.05   ); // top sight rail

  // Muzzle flash: two crossed quads
  const flashMat1 = new THREE.MeshBasicMaterial({
    color: 0xffaa22, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flashMat2 = flashMat1.clone();
  const fGeo = new THREE.PlaneGeometry(0.16, 0.16);
  const flash1 = new THREE.Mesh(fGeo, flashMat1);
  const flash2 = new THREE.Mesh(fGeo, flashMat2);
  flash2.rotation.y = Math.PI / 2;

  const flashGroup = new THREE.Group();
  flashGroup.add(flash1, flash2);
  flashGroup.position.set(0, 0.01, -0.42);
  flashGroup.name = 'muzzleFlash';
  group.add(flashGroup);

  const flashLight = new THREE.PointLight(0xffaa22, 0, 1.2);
  flashLight.name = 'flashLight';
  flashLight.position.copy(flashGroup.position);
  group.add(flashLight);

  group._flashMats = [flashMat1, flashMat2];
  group._flashGroup = flashGroup;
  group._flashLight = flashLight;

  return group;
}

export function createWeapon(weaponScene) {
  let ammo = GUN_MAG;
  let reloading = false;
  let reloadTimer = 0;
  let fireTimer = 0;
  let recoil = 0;
  let muzzleTimer = 0;
  const MUZZLE_DUR = 0.07;

  const gunGroup = buildGunMesh();
  const swayGroup = new THREE.Group();
  swayGroup.add(gunGroup);
  weaponScene.add(swayGroup);
  gunGroup.position.set(0.17, -0.22, -0.55);

  const { _flashMats: flashMats, _flashGroup: flashGroup, _flashLight: flashLight } = gunGroup;

  const _raycaster = new THREE.Raycaster();
  const _center = new THREE.Vector2(0, 0);

  function tryFire(keys, camera, enemies, onHit) {
    if (reloading || fireTimer > 0 || !keys['__mousedown']) return;
    if (ammo <= 0) { startReload(); return; }

    ammo--;
    fireTimer = GUN_FIRE_INTERVAL;
    recoil += RECOIL_AMT;
    muzzleTimer = MUZZLE_DUR;
    flashMats.forEach(m => { m.opacity = 1; });
    flashLight.intensity = 3;
    flashGroup.rotation.z = Math.random() * Math.PI;

    _raycaster.setFromCamera(_center, camera);
    const bodyMeshes = enemies.filter(e => e.state !== 'dead' && e.state !== 'dying').map(e => e.bodyMesh);
    const hits = _raycaster.intersectObjects(bodyMeshes, false);
    if (hits.length > 0) {
      const enemy = hits[0].object.userData.enemy;
      const dir = hits[0].point.clone().sub(camera.position).normalize();
      enemy.takeDamage(GUN_DMG, dir);
      onHit(hits[0].point, true);
    } else {
      onHit(null, false);
    }
  }

  function startReload() {
    if (reloading || ammo === GUN_MAG) return;
    reloading = true;
    reloadTimer = RELOAD_TIME;
  }

  function update(dt, keys, bobY, bobX) {
    fireTimer = Math.max(0, fireTimer - dt);

    if (keys['KeyR'] && !reloading && ammo < GUN_MAG) startReload();

    if (reloading) {
      reloadTimer -= dt;
      if (reloadTimer <= 0) { ammo = GUN_MAG; reloading = false; }
    }

    recoil = Math.max(0, recoil - RECOIL_REC * dt);

    if (muzzleTimer > 0) {
      muzzleTimer -= dt;
      const t = Math.max(0, muzzleTimer / MUZZLE_DUR);
      flashMats.forEach(m => { m.opacity = t; });
      flashLight.intensity = 3 * t;
    }

    // Weapon sway tracks player bob with dampening
    swayGroup.position.y += (bobY * 0.7 - swayGroup.position.y) * 0.18;
    swayGroup.position.x += (bobX * 0.7 - swayGroup.position.x) * 0.18;

    // Recoil kick: push gun back and rotate up
    gunGroup.position.z = -0.55 + recoil * 0.4;
    gunGroup.rotation.x =  recoil * 0.6;
  }

  function reset() {
    ammo = GUN_MAG; reloading = false;
    reloadTimer = 0; fireTimer = 0; recoil = 0; muzzleTimer = 0;
    flashMats.forEach(m => { m.opacity = 0; });
    flashLight.intensity = 0;
    gunGroup.position.set(0.17, -0.22, -0.55);
    gunGroup.rotation.set(0, 0, 0);
    swayGroup.position.set(0, 0, 0);
  }

  return {
    get ammo()          { return ammo; },
    get maxAmmo()       { return GUN_MAG; },
    get reloading()     { return reloading; },
    get reloadProgress(){ return reloading ? 1 - reloadTimer / RELOAD_TIME : 1; },
    get recoil()        { return recoil; },
    tryFire, startReload, update, reset,
  };
}
