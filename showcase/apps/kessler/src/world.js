import * as THREE from '../vendor/three.module.js';

const MAT = {
  hull: () => new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.55, roughness: 0.52 }),
  hullDark: () => new THREE.MeshStandardMaterial({ color: 0x454e5c, metalness: 0.6, roughness: 0.6 }),
  foil: () => new THREE.MeshStandardMaterial({ color: 0xcf9a3c, metalness: 0.92, roughness: 0.34 }),
  truss: () => new THREE.MeshStandardMaterial({ color: 0x707a88, metalness: 0.7, roughness: 0.45 }),
  solar: () => new THREE.MeshStandardMaterial({
    color: 0x1a2c63, metalness: 0.35, roughness: 0.22, emissive: 0x060c22, emissiveIntensity: 1,
  }),
  crate: () => new THREE.MeshStandardMaterial({
    color: 0x2c6d59, metalness: 0.4, roughness: 0.5, emissive: 0x0e4f38, emissiveIntensity: 0.9,
  }),
  lamp: (c) => new THREE.MeshBasicMaterial({ color: c }),
};

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  s.scale.setScalar(size);
  return s;
}

export class World {
  constructor(scene, rng, cfg) {
    this.scene = scene;
    this.rng = rng;
    this.cfg = cfg;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.colliders = [];
    this.colliderByMesh = new Map();
    this.rayTargets = [];
    this.crates = [];
    this.vents = [];
    this.ringRate = THREE.MathUtils.degToRad(cfg.ringRate);
    this.time = 0;

    this.buildSpine();
    this.buildRing();
    this.buildWings();
    this.buildWrecks();
    this.placeCrates(cfg.crates);
    this.buildVents();
    this.refreshMatrices();
  }

  // ---------- construction helpers ----------

  addMesh(mesh, parent = this.root) {
    parent.add(mesh);
    this.rayTargets.push(mesh);
    return mesh;
  }

  addCollider(mesh, half, spinner = null, cyl = null) {
    const col = { mesh, half, spinner, cyl, inv: new THREE.Matrix4(), radius: half.length() };
    this.colliders.push(col);
    this.colliderByMesh.set(mesh.uuid, col);
    return col;
  }

  box(w, h, d, mat, pos, parent = this.root, collide = true, spinner = null) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.copy(pos);
    this.addMesh(m, parent);
    if (collide) this.addCollider(m, new THREE.Vector3(w / 2, h / 2, d / 2), spinner);
    return m;
  }

  // ---------- station ----------

  buildSpine() {
    const modules = [
      { x: -62, len: 12, r: 4.6, airlock: true },
      { x: -40, len: 18, r: 5.4 },
      { x: -14, len: 22, r: 6.2 },
      { x: 16, len: 16, r: 5.0 },
      { x: 42, len: 20, r: 5.8 },
    ];

    this.modules = [];
    for (const m of modules) {
      const g = new THREE.Group();
      g.position.set(m.x, 0, 0);
      this.root.add(g);

      // Geometry is rotated rather than the mesh so the collider's half extents
      // stay expressed in a world-aligned local frame.
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(m.r, m.r, m.len, 20, 1).rotateZ(Math.PI / 2),
        m.airlock ? MAT.hullDark() : MAT.hull()
      );
      this.addMesh(body, g);
      const bodyCol = this.addCollider(
        body,
        new THREE.Vector3(m.len / 2, m.r, m.r),
        null,
        { hx: m.len / 2, r: m.r }
      );
      if (m.airlock) this.airlockBodyCollider = bodyCol;

      // Foil bands and ribs — visual only, they hang off the collidable body.
      for (let i = -1; i <= 1; i += 2) {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(m.r * 1.03, m.r * 1.03, m.len * 0.16, 20, 1, true),
          MAT.foil()
        );
        band.rotation.z = Math.PI / 2;
        band.position.x = i * m.len * 0.3;
        this.addMesh(band, g);
      }
      const rib = new THREE.Mesh(new THREE.TorusGeometry(m.r * 1.06, 0.28, 8, 24), MAT.truss());
      rib.rotation.y = Math.PI / 2;
      this.addMesh(rib, g);

      // Running lights so the dark side is still legible.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 6),
          MAT.lamp(i % 2 ? 0xffd9a0 : 0x9fe8ff)
        );
        lamp.position.set(m.len * 0.34, Math.cos(a) * m.r * 1.04, Math.sin(a) * m.r * 1.04);
        g.add(lamp);
        const s = glowSprite(i % 2 ? 0xffc98a : 0x8fdcff, 1.1);
        s.position.copy(lamp.position);
        g.add(s);
      }

      this.modules.push({ ...m, group: g });
      if (m.airlock) this.buildAirlock(g, m);
    }

    // Trusses between modules.
    for (let i = 0; i < modules.length - 1; i++) {
      const a = modules[i];
      const b = modules[i + 1];
      const x0 = a.x + a.len / 2;
      const x1 = b.x - b.len / 2;
      const len = x1 - x0;
      if (len < 1) continue;
      const g = new THREE.Group();
      g.position.set((x0 + x1) / 2, 0, 0);
      this.root.add(g);

      const core = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, 1.5), MAT.truss());
      this.addMesh(core, g);
      this.addCollider(core, new THREE.Vector3(len / 2, 1.5, 1.5));

      for (let c = -1; c <= 1; c += 2) {
        for (let d = -1; d <= 1; d += 2) {
          const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len, 6), MAT.truss());
          rail.rotation.z = Math.PI / 2;
          rail.position.set(0, c * 1.3, d * 1.3);
          this.addMesh(rail, g);
        }
      }
      const steps = Math.max(2, Math.round(len / 3));
      for (let s = 0; s <= steps; s++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.11, 5, 4), MAT.truss());
        ring.rotation.y = Math.PI / 2;
        ring.rotation.x = Math.PI / 4;
        ring.position.x = -len / 2 + (len * s) / steps;
        this.addMesh(ring, g);
      }
      this.trussLen = len;
    }
  }

  buildAirlock(group, m) {
    const port = new THREE.Group();
    port.position.set(-m.len / 2 - 0.4, 0, 0);
    group.add(port);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 1.6, 18).rotateZ(Math.PI / 2), MAT.hull());
    this.addMesh(collar, port);
    this.airlockCollider = this.addCollider(
      collar,
      new THREE.Vector3(0.8, 4.2, 4.2),
      null,
      { hx: 0.8, r: 4.0 }
    );

    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.22, 8, 28), MAT.lamp(0x54ffa8));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -0.9;
    port.add(ring);
    this.airlockRing = ring;

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = glowSprite(0x54ffa8, 1.3);
      s.position.set(-0.9, Math.cos(a) * 2.9, Math.sin(a) * 2.9);
      port.add(s);
    }
    const beacon = glowSprite(0x54ffa8, 3.4);
    beacon.position.set(-1.2, 0, 0);
    port.add(beacon);
    this.airlockBeacon = beacon;

    this.airlockObj = port;
    this.airlockDock = new THREE.Object3D();
    this.airlockDock.position.set(-3.4, 0, 0);
    port.add(this.airlockDock);
  }

  buildRing() {
    const g = new THREE.Group();
    g.position.set(4, 0, 0);
    this.root.add(g);
    this.ringGroup = g;

    const R = 27;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6, 12), MAT.hull());
    hub.rotation.z = Math.PI / 2;
    this.addMesh(hub, g);

    const torus = new THREE.Mesh(new THREE.TorusGeometry(R, 2.7, 12, 60), MAT.hull());
    torus.rotation.y = Math.PI / 2;
    this.addMesh(torus, g);

    const spinner = { axis: new THREE.Vector3(1, 0, 0), rate: this.ringRate, pivot: new THREE.Vector3(4, 0, 0) };
    this.ringSpinner = spinner;

    const seg = 16;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
      holder.rotation.x = -a;
      g.add(holder);

      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(5.4, 1.1, (2 * Math.PI * R) / seg + 0.4),
        i % 3 === 0 ? MAT.foil() : MAT.hullDark()
      );
      pad.position.y = 2.6;
      this.addMesh(pad, holder);
      this.addCollider(pad, new THREE.Vector3(2.7, 0.55, (Math.PI * R) / seg + 0.2), spinner);

      if (i % 4 === 0) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, R - 2, 8), MAT.truss());
        spoke.position.set(0, Math.cos(a) * (R / 2), Math.sin(a) * (R / 2));
        spoke.rotation.x = -a + Math.PI / 2;
        this.addMesh(spoke, g);
        this.addCollider(spoke, new THREE.Vector3(0.7, (R - 2) / 2, 0.7), spinner);
      }
      if (i % 2 === 0) {
        const s = glowSprite(0xff8f5a, 1.6);
        s.position.set(2.4, 3.4, 0);
        holder.add(s);
      }
    }
  }

  buildWings() {
    const specs = [
      { x: -27, z: 1, tilt: 0.22 },
      { x: -27, z: -1, tilt: -0.22 },
      { x: 55, z: 1, tilt: -0.16 },
      { x: 55, z: -1, tilt: 0.16 },
    ];
    this.wings = [];
    for (const s of specs) {
      const g = new THREE.Group();
      g.position.set(s.x, 0, s.z * 8);
      g.rotation.x = s.tilt;
      this.root.add(g);

      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 16, 8), MAT.truss());
      boom.rotation.x = Math.PI / 2;
      boom.position.z = s.z * 8;
      this.addMesh(boom, g);

      const panel = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 15), MAT.solar());
      panel.position.set(0, 0, s.z * 23);
      this.addMesh(panel, g);
      this.addCollider(panel, new THREE.Vector3(13, 0.6, 7.5));

      for (let i = -2; i <= 2; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 15), MAT.truss());
        rib.position.set(i * 5.2, 0, s.z * 23);
        this.addMesh(rib, g);
      }
      this.wings.push({ group: g, tipLocal: new THREE.Vector3(11, 0.9, s.z * 27) });
    }
  }

  buildWrecks() {
    const rng = this.rng;
    this.wrecks = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const ang = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const dist = rng.range(46, 86);
      g.position.set(
        rng.range(-70, 70),
        Math.cos(ang) * dist,
        Math.sin(ang) * dist
      );
      g.rotation.set(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28));
      this.root.add(g);

      const len = rng.range(9, 20);
      const r = rng.range(2.4, 4.4);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 12).rotateZ(Math.PI / 2), MAT.hullDark());
      this.addMesh(body, g);
      this.addCollider(body, new THREE.Vector3(len / 2, r, r), null, { hx: len / 2, r });

      const fin = new THREE.Mesh(new THREE.BoxGeometry(len * 0.4, 0.4, r * 3), MAT.foil());
      fin.position.set(len * 0.2, r * 0.4, 0);
      fin.rotation.x = rng.range(-0.6, 0.6);
      this.addMesh(fin, g);

      const s = glowSprite(0xff5f56, 1.9);
      s.position.set(-len * 0.45, 0, 0);
      g.add(s);
      this.wrecks.push(g);
    }
  }

  placeCrates(count) {
    const rng = this.rng;
    const sites = [];

    // On the pressurised modules.
    for (const m of this.modules) {
      if (m.airlock) continue;
      for (let i = 0; i < 3; i++) {
        const a = rng.range(0, Math.PI * 2);
        sites.push({
          parent: m.group,
          pos: new THREE.Vector3(rng.range(-m.len * 0.35, m.len * 0.35), Math.cos(a) * (m.r + 0.8), Math.sin(a) * (m.r + 0.8)),
          hard: 0,
        });
      }
    }
    // On the ring — these ride round with it.
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2);
      sites.push({
        parent: this.ringGroup,
        pos: new THREE.Vector3(rng.range(-2, 2), Math.cos(a) * 30.6, Math.sin(a) * 30.6),
        hard: 2,
      });
    }
    // Wing tips.
    for (const w of this.wings) {
      sites.push({ parent: w.group, pos: w.tipLocal.clone(), hard: 1 });
    }
    // Drifting wrecks.
    for (const w of this.wrecks) {
      sites.push({ parent: w, pos: new THREE.Vector3(rng.range(-4, 4), rng.range(3, 5), 0), hard: 3 });
    }

    // Shuffle, then take an easy-first spread so shift 1 is not a wrecks-only hunt.
    for (let i = sites.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [sites[i], sites[j]] = [sites[j], sites[i]];
    }
    sites.sort((a, b) => a.hard - b.hard);

    const chosen = sites.slice(0, Math.min(count, sites.length));
    for (const site of chosen) {
      const g = new THREE.Group();
      g.position.copy(site.pos);
      site.parent.add(g);

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), MAT.crate());
      this.addMesh(body, g);
      const cage = new THREE.Mesh(
        new THREE.BoxGeometry(1.62, 1.62, 1.62),
        new THREE.MeshBasicMaterial({ color: 0x3affc0, wireframe: true, transparent: true, opacity: 0.55 })
      );
      g.add(cage);
      const s = glowSprite(0x3affc0, 2.8);
      g.add(s);

      this.crates.push({ group: g, glow: s, taken: false, hard: site.hard, phase: this.rng.range(0, 6.28) });
    }
  }

  buildVents() {
    const rng = this.rng;
    const picks = this.modules.filter((m) => !m.airlock);
    this.vents = [];
    for (let i = 0; i < 3; i++) {
      const m = picks[i % picks.length];
      const a = rng.range(0, Math.PI * 2);
      const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
      const g = new THREE.Group();
      g.position.copy(dir).multiplyScalar(m.r + 0.2);
      g.position.x = rng.range(-m.len * 0.3, m.len * 0.3);
      m.group.add(g);

      const len = 26;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(5.2, len, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xa9d8ff,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      cone.position.y = len / 2;
      g.add(cone);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.quaternion.copy(q);

      const mouth = glowSprite(0xd6ecff, 2.4);
      g.add(mouth);

      this.vents.push({
        group: g, cone, len, spread: Math.cos(THREE.MathUtils.degToRad(13)), accel: 13,
        origin: new THREE.Vector3(), dir: new THREE.Vector3(), phase: rng.range(0, 6.28),
      });
    }
  }

  // ---------- runtime ----------

  refreshMatrices() {
    this.root.updateMatrixWorld(true);
    for (const c of this.colliders) c.inv.copy(c.mesh.matrixWorld).invert();
  }

  surfaceVelocity(collider, point, out = new THREE.Vector3()) {
    out.set(0, 0, 0);
    const sp = collider.spinner;
    if (!sp) return out;
    const rel = point.clone().sub(sp.pivot);
    out.copy(sp.axis).cross(rel).multiplyScalar(sp.rate);
    return out;
  }

  update(dt, camera) {
    this.time += dt;
    this.ringGroup.rotation.x += this.ringRate * dt;

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
    if (this.airlockBeacon) this.airlockBeacon.material.opacity = 0.45 + 0.45 * pulse;

    for (const c of this.crates) {
      if (c.taken) continue;
      c.group.rotation.y += dt * 0.6;
      c.glow.material.opacity = 0.5 + 0.4 * Math.sin(this.time * 3 + c.phase);
    }

    for (const v of this.vents) {
      const p = 0.55 + 0.45 * Math.sin(this.time * 5.5 + v.phase);
      v.cone.material.opacity = 0.07 + 0.12 * p;
      v.group.getWorldPosition(v.origin);
      v.dir.set(0, 1, 0).applyQuaternion(v.group.getWorldQuaternion(new THREE.Quaternion()));
    }

    this.refreshMatrices();
  }

  ventForce(pos, out) {
    out.set(0, 0, 0);
    for (const v of this.vents) {
      const rel = pos.clone().sub(v.origin);
      const along = rel.dot(v.dir);
      if (along < 0.5 || along > v.len) continue;
      const cos = along / rel.length();
      if (cos < v.spread) continue;
      const falloff = 1 - along / v.len;
      out.addScaledVector(v.dir, v.accel * falloff * falloff);
    }
    return out;
  }

  dockPosition(out = new THREE.Vector3()) {
    return this.airlockDock.getWorldPosition(out);
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      // Sprites share one module-level geometry inside three — disposing it would
      // break every sprite created after this shift.
      if (o.geometry && !o.isSprite) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
