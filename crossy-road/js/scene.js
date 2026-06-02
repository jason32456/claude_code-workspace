import * as THREE from '../vendor/three.module.js';

const FRUSTUM = 12;
// Isometric-style camera angle: above and behind the player
const CAM_Y = 13;
const CAM_Z_OFFSET = 10;

export function createScene() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 28, 52);

  let aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -FRUSTUM * aspect / 2, FRUSTUM * aspect / 2,
    FRUSTUM / 2, -FRUSTUM / 2,
    0.1, 200
  );

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 10, 5);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  window.addEventListener('resize', () => {
    aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.left = -FRUSTUM * aspect / 2;
    camera.right = FRUSTUM * aspect / 2;
    camera.updateProjectionMatrix();
  });

  // focusZ = world-space Z of the point we're tracking (player's Z)
  function updateCamera(focusX, focusZ) {
    camera.position.set(focusX, CAM_Y, focusZ + CAM_Z_OFFSET);
    camera.lookAt(focusX, 0, focusZ);
  }

  // Initialize camera position
  updateCamera(0, 0);

  return { renderer, camera, scene, updateCamera };
}
