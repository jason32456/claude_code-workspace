export function bindInput({ onFlap }) {
  const flapKeys = new Set(["Space", "ArrowUp"]);

  window.addEventListener("keydown", (e) => {
    if (flapKeys.has(e.code)) {
      e.preventDefault();
      onFlap();
    }
  });

  const canvas = document.getElementById("game");
  const trigger = (e) => {
    e.preventDefault();
    onFlap();
  };
  canvas.addEventListener("mousedown", trigger);
  canvas.addEventListener("touchstart", trigger, { passive: false });
}
