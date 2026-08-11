import * as THREE from 'three';
import { makeBox, setBoxCenter, overlaps } from './physics.js';

export const C = {
  block: 0x232f52, blockEdge: 0x5c7fd6,
  door: 0x7a5cff, plate: 0xff5f8f, live: 0x5cff9d,
  crystal: 0xffd166, hazard: 0xff3355, mover: 0x45e6ff,
  exit: 0x5cff9d,
};

// A 4×4-unit grid cell, drawn once and repeated across every walkable surface.
// Without it the floors read as flat voids and jumps become impossible to judge.
let gridTex = null;
function grid() {
  if (gridTex) return gridTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#212c4e';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#4a63ad';
  x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, 125, 125);
  x.strokeStyle = '#2c3a67';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(64, 0); x.lineTo(64, 128); x.moveTo(0, 64); x.lineTo(128, 64);
  x.stroke();
  gridTex = new THREE.CanvasTexture(c);
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.anisotropy = 4;
  return gridTex;
}

function topSurface(sx, sz) {
  const map = grid().clone();
  map.needsUpdate = true;
  map.repeat.set(Math.max(1, Math.round(sx / 4)), Math.max(1, Math.round(sz / 4)));
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(sx, sz),
    new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0.05 })
  );
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function boxMesh(sx, sy, sz, color, edge, opts = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.85,
    metalness: opts.metal ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  g.add(m);

  const lines = new THREE.LineSegments(
    new THREE.EdgesGeometry(m.geometry),
    new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: opts.edgeOpacity ?? 0.55 })
  );
  g.add(lines);
  g.userData.mat = mat;
  g.userData.lines = lines.material;
  return g;
}

export class World {
  constructor(scene, def, sfx) {
    this.scene = scene;
    this.def = def;
    this.sfx = sfx;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.static = [];     // immovable colliders
    this.kinetic = [];    // movers + doors (colliders that animate)
    this.plates = [];
    this.doors = [];
    this.switches = [];
    this.movers = [];
    this.hazards = [];
    this.crystals = [];
    this.switchState = Object.create(null);
    this.armed = false;
    this._armSeen = false;

    this.build();
  }

  build() {
    const d = this.def;

    for (const [cx, cy, cz, sx, sy, sz] of d.blocks || []) {
      const g = boxMesh(sx, sy, sz, C.block, C.blockEdge, { rough: 0.9, edgeOpacity: 0.7 });
      g.position.set(cx, cy, cz);
      const top = topSurface(sx, sz);
      top.position.y = sy / 2 + 0.01;
      g.add(top);
      this.group.add(g);
      this.static.push(makeBox(cx, cy, cz, sx, sy, sz));
    }

    for (const p of d.plates || []) {
      const g = boxMesh(2.6, 0.18, 2.6, 0x241a2c, C.plate, {
        emissive: C.plate, emissiveIntensity: 0.25, shadow: false,
      });
      g.position.set(p.p[0], p.p[1] + 0.09, p.p[2]);
      this.group.add(g);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.05, 1.32, 40),
        new THREE.MeshBasicMaterial({ color: C.plate, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.p[0], p.p[1] + 0.2, p.p[2]);
      this.group.add(ring);

      this.plates.push({
        id: p.id, mesh: g, ring,
        trigger: makeBox(p.p[0], p.p[1] + 0.6, p.p[2], 2.6, 1.4, 2.6),
        pressed: false, pos: p.p,
      });
    }

    for (const s of d.switches || []) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.22, 1.5, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a3358, roughness: 0.7 })
      );
      post.position.y = 0.75; post.castShadow = true;
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 20, 14),
        new THREE.MeshStandardMaterial({ color: 0x3a2d55, emissive: C.door, emissiveIntensity: 0.35 })
      );
      knob.position.y = 1.62;
      g.add(post, knob);
      g.position.set(s.p[0], s.p[1], s.p[2]);
      this.group.add(g);
      this.switches.push({ id: s.id, mesh: g, knob, pos: s.p, cooldown: 0 });
      this.switchState[s.id] = false;
    }

    for (const dr of d.doors || []) {
      const g = boxMesh(dr.s[0], dr.s[1], dr.s[2], 0x241d47, C.door, {
        emissive: C.door, emissiveIntensity: 0.16, metal: 0.2, rough: 0.4,
      });
      g.position.set(dr.p[0], dr.p[1], dr.p[2]);
      this.group.add(g);

      const door = {
        def: dr, mesh: g, base: dr.p.slice(), height: dr.s[1],
        open: 0, target: 0, wasOpen: false,
        body: makeBox(dr.p[0], dr.p[1], dr.p[2], dr.s[0], dr.s[1], dr.s[2]),
      };
      this.doors.push(door);
      this.kinetic.push(door.body);
      this.addLinks(door);
    }

    for (const m of d.movers || []) {
      const g = boxMesh(m.s[0], m.s[1], m.s[2], 0x14283c, C.mover, {
        emissive: C.mover, emissiveIntensity: 0.06, rough: 0.6, edgeOpacity: 0.85,
      });
      const top = topSurface(m.s[0], m.s[2]);
      top.position.y = m.s[1] / 2 + 0.01;
      g.add(top);
      this.group.add(g);
      const body = makeBox(m.p[0], m.p[1], m.p[2], m.s[0], m.s[1], m.s[2]);
      this.kinetic.push(body);
      this.movers.push({ def: m, mesh: g, body });
    }

    for (const h of d.hazards || []) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(h.s[0], h.s[1], h.s[2]),
        new THREE.MeshBasicMaterial({ color: C.hazard, transparent: true, opacity: 0.3 })
      );
      const cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(core.geometry),
        new THREE.LineBasicMaterial({ color: C.hazard, transparent: true, opacity: 0.9 })
      );
      g.add(core, cage);
      g.position.set(h.p[0], h.p[1], h.p[2]);
      this.group.add(g);
      this.hazards.push({
        def: h, core: core.material, cage: cage.material, active: true,
        body: makeBox(h.p[0], h.p[1], h.p[2], h.s[0], h.s[1], h.s[2]),
      });
    }

    for (const c of d.crystals || []) {
      const g = new THREE.Group();
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.46),
        new THREE.MeshStandardMaterial({
          color: C.crystal, emissive: C.crystal, emissiveIntensity: 0.9,
          roughness: 0.25, metalness: 0.3,
        })
      );
      const halo = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.78),
        new THREE.MeshBasicMaterial({ color: C.crystal, transparent: true, opacity: 0.12, side: THREE.BackSide })
      );
      g.add(gem, halo);
      g.position.set(c[0], c[1], c[2]);
      this.group.add(g);
      this.crystals.push({ mesh: g, pos: c, taken: false, base: c[1] });
    }

    const e = d.exit;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.75, 0.16, 40),
      new THREE.MeshStandardMaterial({ color: 0x16303a, emissive: C.exit, emissiveIntensity: 0.15 })
    );
    pad.position.set(e[0], e[1] + 0.08, e[2]);
    pad.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.78, 48),
      new THREE.MeshBasicMaterial({ color: C.exit, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(e[0], e[1] + 0.2, e[2]);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 9, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: C.exit, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    beam.position.set(e[0], e[1] + 4.5, e[2]);
    this.group.add(pad, ring, beam);
    this.exit = { pad, ring, beam, pos: e };
  }

  // A faint line from each plate/switch to the door it drives, so the wiring of
  // a chamber is readable at a glance.
  addLinks(door) {
    const targets = [];
    for (const id of door.def.needs || []) {
      const p = (this.def.plates || []).find((x) => x.id === id);
      if (p) targets.push([p.p[0], p.p[1] + 0.25, p.p[2]]);
    }
    if (door.def.sw) {
      const s = (this.def.switches || []).find((x) => x.id === door.def.sw);
      if (s) targets.push([s.p[0], s.p[1] + 1.6, s.p[2]]);
    }
    door.links = [];
    for (const t of targets) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(t[0], t[1], t[2]),
        new THREE.Vector3(door.base[0], door.base[1], door.base[2]),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: C.door, transparent: true, opacity: 0.12 });
      const line = new THREE.Line(geo, mat);
      this.group.add(line);
      door.links.push(mat);
    }
  }

  get colliders() { return this.static.concat(this.kinetic); }

  reset() {
    for (const c of this.crystals) { c.taken = false; c.mesh.visible = true; }
    for (const p of this.plates) p.pressed = false;
    for (const s of this.switches) { this.switchState[s.id] = false; s.cooldown = 0; }
    for (const d of this.doors) {
      d.open = 0; d.target = 0; d.wasOpen = false;
      d.mesh.position.set(d.base[0], d.base[1], d.base[2]);
      setBoxCenter(d.body, d.base[0], d.base[1], d.base[2]);
      d.body.dx = d.body.dy = d.body.dz = 0;
    }
    this.armed = false;
    this._armSeen = false;
    this.exit.beam.material.opacity = 0;
  }

  get remaining() { return this.crystals.filter((c) => !c.taken).length; }

  toggleSwitch(id) {
    const s = this.switches.find((x) => x.id === id);
    if (!s || s.cooldown > 0) return false;
    s.cooldown = 0.35;
    this.switchState[id] = !this.switchState[id];
    s.knob.material.emissive.setHex(this.switchState[id] ? C.live : C.door);
    s.knob.material.emissiveIntensity = this.switchState[id] ? 1.1 : 0.35;
    this.sfx.switchIt();
    return true;
  }

  // Nearest switch a body at (x, y, z) can reach.
  switchNear(x, y, z) {
    for (const s of this.switches) {
      const dx = x - s.pos[0], dz = z - s.pos[2];
      if (dx * dx + dz * dz < 6.8 && Math.abs(y - (s.pos[1] + 0.9)) < 2.2) return s;
    }
    return null;
  }

  update(t, dt, bodies, elapsed) {
    for (const m of this.movers) {
      const { p, to, period, phase = 0, dwell = 0 } = m.def;
      const u = ((t / period + phase) % 1 + 1) % 1;
      const ease = (a) => 0.5 - 0.5 * Math.cos(Math.PI * a);
      // `dwell` is the fraction of the period the platform sits parked at each
      // end — without it the docking window is a knife edge.
      let k;
      if (dwell > 0) {
        const tr = (1 - 2 * dwell) / 2;
        if (u < dwell) k = 0;
        else if (u < dwell + tr) k = ease((u - dwell) / tr);
        else if (u < 2 * dwell + tr) k = 1;
        else k = 1 - ease((u - 2 * dwell - tr) / tr);
      } else {
        k = ease(u * 2 <= 1 ? u * 2 : 2 - u * 2);
      }
      const x = p[0] + to[0] * k, y = p[1] + to[1] * k, z = p[2] + to[2] * k;
      setBoxCenter(m.body, x, y, z);
      m.mesh.position.set(x, y, z);
    }

    for (const p of this.plates) {
      const on = bodies.some((b) => overlaps(b, p.trigger));
      if (on !== p.pressed) {
        p.pressed = on;
        p.ring.material.color.setHex(on ? C.live : C.plate);
        p.ring.material.opacity = on ? 1 : 0.75;
        p.mesh.userData.mat.emissive.setHex(on ? C.live : C.plate);
        p.mesh.userData.mat.emissiveIntensity = on ? 0.8 : 0.25;
        on ? this.sfx.plateOn() : this.sfx.plateOff();
      }
    }

    for (const s of this.switches) {
      if (s.cooldown > 0) s.cooldown -= dt;
      s.mesh.children[1].position.y = 1.62 + Math.sin(elapsed * 2.4) * 0.04;
    }

    for (const d of this.doors) {
      let open = true;
      for (const id of d.def.needs || []) {
        const p = this.plates.find((x) => x.id === id);
        if (!p || !p.pressed) { open = false; break; }
      }
      if (open && d.def.sw) {
        const on = !!this.switchState[d.def.sw];
        open = d.def.invert ? !on : on;
      }
      if (open !== d.wasOpen) { this.sfx.door(); d.wasOpen = open; }
      d.target = open ? 1 : 0;
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 3.4);

      const y = d.base[1] - d.open * (d.height + 0.04);
      d.mesh.position.y = y;
      setBoxCenter(d.body, d.base[0], y, d.base[2]);
      for (const l of d.links) l.opacity = open ? 0.42 : 0.12;
      d.mesh.userData.mat.emissiveIntensity = open ? 0.05 : 0.16;
    }

    for (const h of this.hazards) {
      const period = h.def.period || 0;
      h.active = period > 0 ? (t % period) < h.def.on : true;
      const pulse = 0.55 + 0.45 * Math.sin(elapsed * 14);
      h.core.opacity = h.active ? 0.26 + 0.1 * pulse : 0.04;
      h.cage.opacity = h.active ? 0.95 : 0.16;
    }

    for (const c of this.crystals) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 1.5;
      c.mesh.position.y = c.base + Math.sin(elapsed * 2 + c.pos[0]) * 0.14;
      for (const b of bodies) {
        const dx = b.cx - c.mesh.position.x;
        const dy = b.cy - c.mesh.position.y;
        const dz = b.cz - c.mesh.position.z;
        if (dx * dx + dy * dy + dz * dz < 2.1) {
          c.taken = true;
          c.mesh.visible = false;
          this.sfx.crystal();
          break;
        }
      }
    }

    this.armed = this.remaining === 0;
    if (this.armed && !this._armSeen) { this._armSeen = true; this.sfx.arm(); }
    const glow = this.armed ? 0.55 + 0.2 * Math.sin(elapsed * 4) : 0.15;
    this.exit.pad.material.emissiveIntensity = glow;
    this.exit.ring.material.color.setHex(this.armed ? C.exit : 0x4a5b78);
    this.exit.ring.material.opacity = this.armed ? 0.9 : 0.25;
    this.exit.beam.material.opacity = this.armed ? 0.05 + 0.03 * Math.sin(elapsed * 3) : 0;
    this.exit.ring.rotation.z += dt * (this.armed ? 0.8 : 0.15);
  }

  hazardHit(body) {
    return this.hazards.some((h) => h.active && overlaps(body, h.body));
  }

  onExit(body) {
    const e = this.exit.pos;
    const dx = body.cx - e[0], dz = body.cz - e[2];
    return this.armed && dx * dx + dz * dz < 3.0 && Math.abs(body.cy - (e[1] + 0.9)) < 1.5;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }
}
