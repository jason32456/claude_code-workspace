import * as THREE from '../vendor/three.module.js';

// Every mechanism in the building is the same object: a place to put arms, a
// number of arms it needs, and a force it will not move below. Nothing here
// checks "is the player holding E near the thing" — it sums the grip of the
// arms that happen to be on it when you pull.

const M = (o) => Object.assign({
  need: 2, forceReq: 1.0, steps: 1, prog: 0, done: false, radius: 0.62, hint: '',
}, o);

export class Mechanisms {
  constructor(world, octo) {
    this.world = world;
    this.octo = octo;
    this.group = new THREE.Group();
    this.jarOpened = 0;
    this.list = [
      M({
        id: 'jarlid', label: 'jar lid', pos: new THREE.Vector3(-1.45, 1.32, -20.6),
        need: 2, forceReq: 0.64, steps: 3, radius: 0.58, keep: 0.9,
        hint: 'Two arms on the lid, then haul. Three turns.',
      }),
      M({
        id: 'jar2lid', label: 'jar lid', pos: new THREE.Vector3(-9.2, 2.08, -8.3),
        need: 2, forceReq: 0.64, steps: 3, radius: 0.58, keep: 0.9,
      }),
      M({
        id: 'cord', label: 'light cord', pos: new THREE.Vector3(-5.24, 2.15, -6.04),
        need: 1, forceReq: 0.25, steps: 1, radius: 0.55,
        hint: 'One arm is enough to kill the lights.',
      }),
      M({
        id: 'grate', label: 'grating panel', pos: new THREE.Vector3(0, 0.12, -9.8),
        need: 3, forceReq: 1.12, steps: 2, radius: 1.05,
        hint: 'Wet steel. Three arms, and they will be slipping the whole time.',
      }),
      M({
        id: 'valve', label: 'sluice valve', pos: new THREE.Vector3(2.2, 0.99, 1.51),
        need: 2, forceReq: 0.80, steps: 3, radius: 0.6,
        hint: 'Two arms, three hauls — and the grip rots between them.',
      }),
      M({
        id: 'latchA', label: 'shutter latch', pos: new THREE.Vector3(-0.75, -1.5, 17.41),
        need: 2, forceReq: 0.80, steps: 1, radius: 0.5, pair: 'latchB',
      }),
      M({
        id: 'latchB', label: 'shutter latch', pos: new THREE.Vector3(0.75, -1.5, 17.41),
        need: 2, forceReq: 0.80, steps: 1, radius: 0.5, pair: 'latchA',
      }),
    ];
    this.byId = {};
    for (const m of this.list) this.byId[m.id] = m;
    this.buildVisuals();
  }

  buildVisuals() {
    // the valve wheel, which is the one thing in the building that visibly
    // reports how far through a job you are
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.045, 7, 16),
      new THREE.MeshLambertMaterial({ color: 0x8f3b2a }),
    );
    wheel.position.set(2.2, 0.99, 1.51);
    const spokes = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x8f3b2a }),
    );
    wheel.add(spokes);
    const s2 = spokes.clone(); s2.rotation.z = Math.PI / 2; wheel.add(s2);
    this.wheel = wheel;
    this.group.add(wheel);

    // crabs, which is what is in the jars
    this.crabs = [];
    for (const p of [[-1.45, 1.02, -20.6], [-9.2, 1.8, -8.3]]) {
      const c = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xb4503a }));
      b.scale.set(1.3, 0.6, 1);
      c.add(b);
      for (let i = 0; i < 6; i++) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.02),
          new THREE.MeshLambertMaterial({ color: 0x8f3b2a }));
        l.position.set((i < 3 ? -1 : 1) * 0.15, -0.02, (i % 3 - 1) * 0.07);
        c.add(l);
      }
      c.position.set(p[0], p[1], p[2]);
      this.crabs.push(c);
      this.group.add(c);
    }

    // the glow that marks a mechanism you can actually reach right now
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.37, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  // Which arms are on this mechanism, and what are they collectively worth?
  gather(m) {
    let n = 0, force = 0;
    for (const a of this.octo.arms) {
      if (!a.held || a.grip < 0.12) continue;
      if (a.anchor.distanceTo(m.pos) > m.radius) continue;
      n++;
      force += a.grip * (0.45 + a.mat.rough * 0.75);
    }
    return { n, force };
  }

  onHaul() {
    let acted = false;
    for (const m of this.list) {
      if (m.done) continue;
      const g = this.gather(m);
      if (g.n === 0) continue;
      acted = true;

      if (m.pair) {
        const other = this.byId[m.pair];
        if (other.done) continue;
        const g2 = this.gather(other);
        if (g.n < m.need || g2.n < other.need) {
          this.octo.say(`Both latches at once — ${g.n}+${g2.n} arms on, four needed.`, 'warn');
          continue;
        }
        if (g.force + g2.force < m.forceReq + other.forceReq) {
          this.octo.say('The latches barely move. Not enough grip left.', 'warn');
          this.slip(m); this.slip(other);
          continue;
        }
        m.done = other.done = true;
        this.octo.say('Both latches go. The shutter starts to rise.', 'good');
        return 'shutter';
      }

      if (g.n < m.need) {
        this.octo.say(`${m.label}: ${g.n} of ${m.need} arms on it.`, 'warn');
        continue;
      }
      if (g.force < m.forceReq) {
        this.octo.say(`${m.label} does not budge — grip too far gone.`, 'warn');
        this.slip(m);
        continue;
      }
      m.prog++;
      for (const a of this.octo.arms) {
        if (a.held && a.anchor.distanceTo(m.pos) <= m.radius) a.grip *= (m.keep || 0.80);
      }
      if (m.prog >= m.steps) { m.done = true; return this.complete(m); }
      this.octo.say(`${m.label}: ${m.prog}/${m.steps}.`, 'good');
    }
    if (!acted) this.octo.say('Nothing to pull against.', 'warn');
    return null;
  }

  // a failed haul costs you the grip you did have — that is the whole risk
  slip(m) {
    for (const a of this.octo.arms) {
      if (a.held && a.anchor.distanceTo(m.pos) <= m.radius) a.grip *= 0.45;
    }
    this.octo.noise = Math.max(this.octo.noise, 4.0);
  }

  complete(m) {
    switch (m.id) {
      case 'jarlid': case 'jar2lid':
        this.octo.say('The lid comes off. There is a crab in there.', 'good');
        return m.id === 'jarlid' ? 'jar1' : 'jar2';
      case 'cord':
        this.world.setZoneLights(2, false);
        this.octo.say('The lights go out over the wet room.', 'good');
        return 'cord';
      case 'grate':
        this.octo.say('The panel drops into the channel. Water.', 'good');
        return 'grate';
      case 'valve':
        this.octo.say('The sluice grinds open.', 'good');
        return 'sluice';
      default: return null;
    }
  }

  update(dt, t) {
    // animate whatever the player has finished
    const g = this.byId.grate, v = this.byId.valve;
    this.world.setDynamic('grate', g.done ? Math.min(1, (this.world.dynamic.grate.t + dt * 1.6)) : 0);
    this.world.setDynamic('sluice', v.done ? Math.min(1, this.world.dynamic.sluice.t + dt * 0.5) : 0);
    if (this.byId.latchA.done) {
      this.world.setDynamic('shutter', Math.min(1, this.world.dynamic.shutter.t + dt * 0.22));
    }
    this.wheel.rotation.z = -v.prog * 2.1 - (v.done ? t * 0.6 : 0);

    for (let i = 0; i < 2; i++) {
      const opened = i === 0 ? this.byId.jarlid.done : this.byId.jar2lid.done;
      const c = this.crabs[i];
      if (c.visible && opened) {
        c.position.y += dt * 0.25;
        c.rotation.y += dt * 2;
        c.scale.multiplyScalar(Math.max(0.02, 1 - dt * 1.4));
        if (c.scale.x < 0.06) c.visible = false;
      }
    }
  }

  // the reticle target: what the player is pointing at, and is it a mechanism
  lookup(box) {
    if (!box || !box.id) return null;
    return this.byId[box.id] || null;
  }
}
