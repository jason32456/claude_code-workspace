const AXES = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};
const CONFIRM = new Set(['Space', 'Enter']);
const STICK_RADIUS = 48;
const STICK_DEAD_ZONE = 0.15;
const TAP_MS = 300;
const TAP_TRAVEL = 12;

const isControl = (el) => !!el && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName || '');

export function createInput(element) {
  const held = new Set();
  const stick = { x: 0, y: 0 };
  let pointer = null;
  let actionPending = false;
  let gestureCallback = null;

  const gesture = () => {
    if (gestureCallback) gestureCallback();
  };

  const clearAll = () => {
    held.clear();
    stick.x = 0;
    stick.y = 0;
    pointer = null;
  };

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (AXES[e.code]) {
      held.add(e.code);
      if (!isControl(e.target)) e.preventDefault();
    } else if (CONFIRM.has(e.code)) {
      if (!e.repeat) actionPending = true;
      if (!isControl(e.target)) e.preventDefault();
    }
    gesture();
  }

  function onKeyUp(e) {
    held.delete(e.code);
  }

  function setStick(e) {
    let x = (e.clientX - pointer.x) / STICK_RADIUS;
    let y = (e.clientY - pointer.y) / STICK_RADIUS;
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    const clamped = Math.min(1, mag);
    if (clamped < STICK_DEAD_ZONE) {
      stick.x = 0;
      stick.y = 0;
      return;
    }
    const scale = (clamped - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE) / clamped;
    stick.x = x * scale;
    stick.y = y * scale;
  }

  function onPointerDown(e) {
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), travel: 0 };
    stick.x = 0;
    stick.y = 0;
    try {
      element.setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety, not a requirement
    }
    gesture();
  }

  function onPointerMove(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    pointer.travel = Math.max(pointer.travel, Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y));
    setStick(e);
  }

  function onPointerEnd(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (e.type === 'pointerup' && performance.now() - pointer.t < TAP_MS && pointer.travel < TAP_TRAVEL) {
      actionPending = true;
    }
    pointer = null;
    stick.x = 0;
    stick.y = 0;
  }

  element.style.touchAction = 'none';
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearAll);
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('lostpointercapture', onPointerEnd);

  return {
    read() {
      let dx = stick.x;
      let dy = stick.y;
      for (const code of held) {
        dx += AXES[code][0];
        dy += AXES[code][1];
      }
      const action = actionPending;
      actionPending = false;
      return {
        dx: Math.max(-1, Math.min(1, dx)),
        dy: Math.max(-1, Math.min(1, dy)),
        action,
      };
    },
    onGesture(callback) {
      gestureCallback = callback;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAll);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('lostpointercapture', onPointerEnd);
    },
  };
}
