import * as THREE from '../vendor/three.module.js';

export const SPECIES = {
  midge: {
    name: 'Midge',
    speed: 5.2,
    size: 0.16,
    color: 0x8fa6c8,
    struggle: 4.5,
    tear: 0.55,
    hold: 11,
    food: 4,
    stick: 0.92,
    wobble: 2.4,
  },
  moth: {
    name: 'Moth',
    speed: 8.6,
    size: 0.3,
    color: 0xd8cdb4,
    struggle: 10,
    tear: 1.0,
    hold: 8.5,
    food: 9,
    stick: 0.8,
    wobble: 5.5,
  },
  beetle: {
    name: 'Beetle',
    speed: 6.4,
    size: 0.42,
    color: 0x4f6b3a,
    struggle: 22,
    tear: 1.9,
    hold: 7,
    food: 18,
    stick: 0.62,
    wobble: 2.0,
  },
  wasp: {
    name: 'Wasp',
    speed: 10.5,
    size: 0.34,
    color: 0xe2b23c,
    struggle: 26,
    tear: 2.6,
    hold: 5.5,
    food: 25,
    stick: 0.3,
    wobble: 3.0,
  },
};

function wingGeo() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.55, 0.35, 0.95, 0.06);
  shape.quadraticCurveTo(0.5, -0.2, 0, 0);
  return new THREE.ShapeGeometry(shape);
}

function buildInsect(kind) {
  const def = SPECIES[kind];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: 0.7,
    emissive: new THREE.Color(def.color).multiplyScalar(0.12),
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(def.size, 10, 8), bodyMat);
  body.scale.set(0.75, 0.75, 1.5);
  g.add(body);

  if (kind === 'wasp') {
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x201608, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.TorusGeometry(def.size * 0.72, def.size * 0.12, 6, 12), stripeMat);
      st.position.z = -def.size * 0.2 - i * def.size * 0.34;
      g.add(st);
    }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(def.size * 0.16, def.size * 0.7, 6), stripeMat);
    sting.rotation.x = Math.PI / 2;
    sting.position.z = -def.size * 1.5;
    g.add(sting);

    // The wind-up glow is the dodge window made visible.
    const alert = new THREE.Mesh(
      new THREE.SphereGeometry(def.size * 1.9, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff5a4a,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    alert.visible = false;
    g.add(alert);
    g.userData.alert = alert;
  }
  if (kind === 'beetle') {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(def.size * 1.02, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x35502a, roughness: 0.35, metalness: 0.4 }),
    );
    shell.scale.set(0.8, 0.6, 1.4);
    g.add(shell);
  }

  const wingMat = new THREE.MeshBasicMaterial({
    color: kind === 'moth' ? 0xf0e6d0 : 0xa8c4e8,
    transparent: true,
    opacity: kind === 'moth' ? 0.72 : 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const wings = [];
  for (let i = 0; i < 2; i++) {
    const w = new THREE.Mesh(wingGeo(), wingMat);
    const scale = def.size * (kind === 'moth' ? 3.4 : 2.4);
    w.scale.setScalar(scale);
    w.position.set(0, def.size * 0.3, 0);
    w.rotation.y = i ? Math.PI : 0;
    g.add(w);
    wings.push(w);
  }
  g.userData.wings = wings;
  return g;
}

let insectId = 0;

export class Insect {
  constructor(kind, scene, spawn, target) {
    this.kind = kind;
    this.def = SPECIES[kind];
    this.id = ++insectId;
    this.mesh = buildInsect(kind);
    scene.add(this.mesh);
    this.pos = spawn.clone();
    this.target = target.clone();
    this.vel = new THREE.Vector3();
    this.state = 'fly';
    this.strand = null;
    this.u = 0;
    this.hold = this.def.hold;
    this.wrapProgress = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.wingPhase = Math.random() * Math.PI * 2;
    this.dead = false;
    this.diveCooldown = 0.6 + Math.random() * 1.2;
    this.stingCooldown = 0;
    this.pulseTimer = 0;
    this.age = 0;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.dead = true;
  }
}

export class PreySystem {
  constructor(scene, model, spider, audio, fx) {
    this.scene = scene;
    this.model = model;
    this.spider = spider;
    this.audio = audio;
    this.fx = fx;
    this.insects = [];
    this.onCaught = null;
    this.onEscaped = null;
    this.onSting = null;
    this.bounds = { x: 21, y: 15 };
  }

  clear() {
    for (const i of this.insects) i.dispose(this.scene);
    this.insects = [];
  }

  spawn(kind) {
    const side = Math.random();
    const spawn = new THREE.Vector3(
      (Math.random() - 0.5) * 34,
      -6 + Math.random() * 20,
      side < 0.5 ? -22 - Math.random() * 8 : 20 + Math.random() * 8,
    );
    if (Math.random() < 0.35) {
      spawn.x = (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 6);
      spawn.z = (Math.random() - 0.5) * 20;
    }
    const target = new THREE.Vector3(
      (Math.random() - 0.5) * 26,
      -5 + Math.random() * 17,
      0,
    );
    const bug = new Insect(kind, this.scene, spawn, target);
    this.insects.push(bug);
    return bug;
  }

  count(kind) {
    return this.insects.filter((i) => i.kind === kind && !i.dead).length;
  }

  strugglingCount() {
    return this.insects.filter((i) => i.state === 'stuck').length;
  }

  // Nearest snagged insect, used for the off-screen direction cue.
  nearestStruggle() {
    let best = null;
    let bd = Infinity;
    for (const i of this.insects) {
      if (i.state !== 'stuck' && i.state !== 'wrapped') continue;
      const d = i.pos.distanceToSquared(this.spider.pos);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  update(dt, phase) {
    // Iterate the array we started with: a sting can end the run mid-loop, and
    // endRun() clears the live list out from under us.
    const list = this.insects;
    for (let i = list.length - 1; i >= 0; i--) {
      const bug = list[i];
      if (!bug || bug.dead) continue;
      bug.age += dt;
      if (bug.kind === 'wasp' && bug.state === 'fly') this.updateWasp(dt, bug);
      else if (bug.state === 'fly') this.updateFlight(dt, bug);
      else if (bug.state === 'stuck') this.updateStuck(dt, bug);
      else if (bug.state === 'wrapped') this.updateWrapped(dt, bug);
      else if (bug.state === 'leave') this.updateLeaving(dt, bug);

      bug.mesh.position.copy(bug.pos);
      const flap = bug.state === 'stuck' ? 26 : bug.state === 'wrapped' ? 0 : 17;
      bug.wingPhase += dt * flap;
      const open = bug.state === 'wrapped' ? 0.05 : 0.5 + Math.sin(bug.wingPhase) * 0.55;
      for (let w = 0; w < bug.mesh.userData.wings.length; w++) {
        const wing = bug.mesh.userData.wings[w];
        wing.rotation.z = (w ? -1 : 1) * open * 0.9;
        wing.rotation.x = open * 0.4;
      }
      if (bug.state === 'fly' || bug.state === 'leave') {
        const dir = bug.vel.clone();
        if (dir.lengthSq() > 0.001) {
          bug.mesh.lookAt(bug.pos.clone().add(dir));
        }
      }
    }
    if (this.insects.some((b) => b.dead)) {
      this.insects = this.insects.filter((b) => !b.dead);
    }
  }

  updateFlight(dt, bug) {
    const def = bug.def;
    const to = bug.target.clone().sub(bug.pos);
    const dist = to.length();
    if (dist < 0.6 || bug.age > 19) {
      // Missed the web entirely — pick a new line through it, or give up.
      if (bug.age > 19) {
        bug.state = 'leave';
        bug.vel.set(bug.pos.x > 0 ? 1 : -1, 0.5, -1).normalize().multiplyScalar(def.speed);
        return;
      }
      bug.target.set((Math.random() - 0.5) * 26, -5 + Math.random() * 17, bug.pos.z > 0 ? -14 : 14);
    }
    to.normalize();
    bug.phase += dt * def.wobble;
    const wob = new THREE.Vector3(
      Math.sin(bug.phase * 1.7) * 0.6,
      Math.cos(bug.phase * 2.3) * 0.6,
      Math.sin(bug.phase * 0.9) * 0.25,
    );
    const desired = to.multiplyScalar(def.speed).add(wob.multiplyScalar(def.speed * 0.22));
    bug.vel.lerp(desired, 1 - Math.exp(-3.2 * dt));

    const prevZ = bug.pos.z;
    bug.pos.addScaledVector(bug.vel, dt);

    // Crossing the web plane is the only moment a snag can happen.
    if (prevZ * bug.pos.z <= 0 || Math.abs(bug.pos.z) < 0.22) {
      this.testSnag(bug);
    }
  }

  testSnag(bug) {
    const hit = this.model.closestStrand(bug.pos.x, bug.pos.y, 0.55 + bug.def.size);
    if (!hit) return;
    const s = hit.strand;
    if (!s.sticky) {
      // Frame silk is a handrail, not a trap; brush past it with a small pluck.
      this.model.tug(s, hit.u, 0, -0.06, 0.05);
      s.glow = 0.35;
      if (this.audio) this.audio.pluck(s.len0, 0.25);
      return;
    }
    const chance = bug.def.stick * (0.55 + 0.45 * (s.integrity / s.max));
    if (Math.random() > chance) {
      this.model.tug(s, hit.u, 0, -0.12, 0.1);
      s.glow = 0.5;
      if (this.audio) this.audio.pluck(s.len0, 0.4);
      return;
    }
    bug.state = 'stuck';
    bug.strand = s;
    bug.u = hit.u;
    bug.hold = bug.def.hold;
    bug.pos.z = 0;
    this.model.pulseFrom(s, hit.u);
    this.model.damage(s, bug.def.tear * 2);
    if (this.audio) this.audio.snagged(bug.kind);
    if (this.fx) this.fx.burst(bug.pos.x, bug.pos.y, 0, 6);
  }

  updateStuck(dt, bug) {
    const s = bug.strand;
    if (!s || s.dead) {
      bug.state = 'leave';
      bug.vel.set((Math.random() - 0.5) * 4, 3, -6);
      if (this.onEscaped) this.onEscaped(bug);
      return;
    }
    bug.hold -= dt;
    bug.phase += dt * 12;
    const thrash = Math.sin(bug.phase) * 0.045 * (bug.def.struggle / 10);
    this.model.tug(s, bug.u, thrash, -Math.abs(thrash) * 1.4, thrash * 0.4);
    this.model.damage(s, bug.def.tear * dt * (bug.def.struggle / 8));

    bug.pulseTimer -= dt;
    if (bug.pulseTimer <= 0) {
      bug.pulseTimer = 1.4;
      this.model.pulseFrom(s, bug.u);
      if (this.audio) this.audio.pluck(s.len0, 0.5);
    }

    const p = this.model.sample(s, bug.u);
    bug.pos.set(p.x, p.y, p.z);
    bug.mesh.rotation.set(Math.sin(bug.phase) * 0.6, Math.cos(bug.phase * 0.7) * 0.9, bug.phase * 0.3);

    if (bug.hold <= 0) {
      // It tore free, and it took some of the web with it.
      this.model.damage(s, s.max * 0.55);
      bug.state = 'leave';
      bug.vel.set((Math.random() - 0.5) * 5, 4, bug.pos.z > 0 ? 8 : -8);
      if (this.audio) this.audio.escape();
      if (this.onEscaped) this.onEscaped(bug);
    }
  }

  updateWrapped(dt, bug) {
    const s = bug.strand;
    if (!s || s.dead) {
      bug.state = 'leave';
      bug.vel.set(0, -6, 0);
      if (this.onEscaped) this.onEscaped(bug);
      return;
    }
    // A wrapped bundle still has weight; it just stops chewing through silk.
    this.model.tug(s, bug.u, 0, -0.012, 0);
    const p = this.model.sample(s, bug.u);
    bug.pos.set(p.x, p.y, p.z);
    bug.mesh.rotation.z += dt * 0.4;
  }

  updateLeaving(dt, bug) {
    bug.pos.addScaledVector(bug.vel, dt);
    bug.vel.y -= 1.2 * dt;
    if (Math.abs(bug.pos.z) > 34 || bug.pos.y < -26 || Math.abs(bug.pos.x) > 44) {
      bug.dispose(this.scene);
    }
  }

  updateWasp(dt, bug) {
    const spider = this.spider;
    bug.stingCooldown -= dt;
    bug.diveCooldown -= dt;
    const to = spider.pos.clone().sub(bug.pos);
    const dist = to.length();

    const alert = bug.mesh.userData.alert;

    if (bug.mode === 'retreat') {
      bug.retreatT -= dt;
      if (alert) alert.visible = false;
      const away = bug.pos.clone().sub(spider.pos).normalize().multiplyScalar(bug.def.speed * 0.8);
      away.z += 4;
      bug.vel.lerp(away, 1 - Math.exp(-3 * dt));
      if (bug.retreatT <= 0) bug.mode = 'hover';
    } else if (bug.mode === 'aim') {
      // Hangs, glowing, long enough to be read and dodged.
      bug.aimT -= dt;
      if (alert) {
        alert.visible = true;
        alert.scale.setScalar(1 + Math.sin(bug.age * 22) * 0.22);
      }
      bug.vel.multiplyScalar(1 - Math.min(1, 5 * dt));
      if (bug.aimT <= 0) {
        bug.mode = 'dive';
        bug.diveT = 0;
        bug.diveTarget = spider.pos.clone();
      }
    } else if (bug.mode === 'dive') {
      const d = bug.diveTarget.clone().sub(bug.pos);
      const dd = d.length();
      bug.vel.lerp(d.normalize().multiplyScalar(bug.def.speed * 1.9), 1 - Math.exp(-9 * dt));
      if (dd < 0.9 || bug.diveT > 1.4) {
        // Committed and missed: the dragline dodge lives in this gap.
        bug.mode = 'retreat';
        bug.retreatT = 1.7;
        if (alert) alert.visible = false;
        if (Math.random() < 0.5) this.waspCut(bug);
      }
      bug.diveT += dt;
    } else {
      bug.mode = 'hover';
      if (alert) alert.visible = false;
      const orbit = bug.age * 2.2;
      const want = spider.pos
        .clone()
        .add(new THREE.Vector3(Math.cos(orbit) * 4.2, 3.0 + Math.sin(orbit) * 1.2, 4.5 + Math.sin(orbit * 0.7) * 2));
      const d = want.sub(bug.pos);
      bug.vel.lerp(d.multiplyScalar(2.2), 1 - Math.exp(-3 * dt));
      if (bug.diveCooldown <= 0 && dist < 10) {
        bug.mode = 'aim';
        bug.aimT = 0.7;
        bug.diveCooldown = 3.4 + Math.random() * 1.8;
        if (this.audio) this.audio.waspDive();
      }
    }

    bug.pos.addScaledVector(bug.vel, dt);
    bug.pos.x = Math.max(-30, Math.min(30, bug.pos.x));
    bug.pos.y = Math.max(-22, Math.min(20, bug.pos.y));

    if (dist < 0.8 && bug.stingCooldown <= 0 && spider.stunned <= 0) {
      bug.stingCooldown = 2.8;
      bug.mode = 'retreat';
      bug.retreatT = 1.8;
      if (alert) alert.visible = false;
      if (this.onSting) this.onSting(bug);
    }

    // A wasp that blunders into sticky silk is fair game.
    if (Math.abs(bug.pos.z) < 0.25 && bug.mode === 'dive') this.testSnag(bug);
  }

  waspCut(bug) {
    const hit = this.model.closestStrand(bug.pos.x, bug.pos.y, 2.0);
    if (hit) {
      this.model.damage(hit.strand, hit.strand.max * 0.42);
      hit.strand.glow = 0.9;
      if (this.audio) this.audio.pluck(hit.strand.len0, 0.7);
    }
  }

  // Returns the insect within reach of the spider that can be acted on.
  reachable(range = 1.35) {
    let best = null;
    let bd = range * range;
    for (const bug of this.insects) {
      if (bug.state !== 'stuck' && bug.state !== 'wrapped') continue;
      const d = bug.pos.distanceToSquared(this.spider.pos);
      if (d < bd) {
        bd = d;
        best = bug;
      }
    }
    return best;
  }

  wrap(bug, dt) {
    bug.wrapProgress += dt / (0.55 + bug.def.size * 2.2);
    if (bug.wrapProgress >= 1) {
      bug.state = 'wrapped';
      bug.wrapProgress = 0;
      bug.mesh.userData.wings.forEach((w) => (w.visible = false));
      bug.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) {
          o.material = o.material.clone();
          o.material.color.lerp(new THREE.Color(0xe8eeff), 0.72);
        }
      });
      if (this.audio) this.audio.wrap();
      return true;
    }
    return false;
  }

  feed(bug, dt) {
    bug.wrapProgress += dt / 0.9;
    if (bug.wrapProgress >= 1) {
      if (this.fx) this.fx.burst(bug.pos.x, bug.pos.y, 0, 10);
      if (this.onCaught) this.onCaught(bug);
      bug.dispose(this.scene);
      if (this.audio) this.audio.feed();
      return true;
    }
    return false;
  }
}
