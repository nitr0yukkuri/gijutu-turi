// @ts-nocheck -- the preview is an imperative WebGL boundary around the vendored Three.js runtime.
import * as THREE from '../../vendor/three.module.js';
import { EffectComposer } from '../../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../../vendor/addons/environments/RoomEnvironment.js';
import { createGoFish } from './go-fish.js';

export function mountCollectionFish(mount) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  mount.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, .1, 80);
  camera.position.set(.65, .12, 10.3);
  camera.lookAt(.6, .1, 0);
  const rig = new THREE.Group();
  scene.add(rig);
  const fish = createGoFish({ detail: 'high' });
  rig.add(fish.group);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = new RoomEnvironment();
  const environment = pmrem.fromScene(studio, .08);
  scene.environment = environment.texture;
  scene.environmentIntensity = .25;
  studio.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xc6e9fb, 0x062441, .9));
  const key = new THREE.DirectionalLight(0xa3e6ff, 1.65);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x178cbf, 4.2);
  rim.position.set(2, 3, -5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x3d74c2, 1.2);
  fill.position.set(-2, -2, 3);
  scene.add(fill);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .25, .38, 1.1));
  composer.addPass(new OutputPass());

  let time = 0;
  let last = 0;
  let frame;
  let disposed = false;
  let dragging = false;
  let previousX = 0;
  let yaw = 0;

  const resize = () => {
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();

  mount.addEventListener('pointerdown', event => {
    dragging = true;
    previousX = event.clientX;
    mount.setPointerCapture(event.pointerId);
  });
  mount.addEventListener('pointermove', event => {
    if (!dragging) return;
    yaw += (event.clientX - previousX) * .008;
    previousX = event.clientX;
  });
  mount.addEventListener('pointerup', () => { dragging = false; });
  mount.addEventListener('pointercancel', () => { dragging = false; });

  const render = now => {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    const delta = Math.min(.05, (now - (last || now)) / 1000);
    last = now;
    time += delta;
    rig.rotation.y = yaw + Math.sin(time * .35) * .035;
    fish.group.position.y = Math.sin(time * .7) * .035;
    fish.update(time, { power: .42, glow: 1 });
    composer.render();
  };
  frame = requestAnimationFrame(render);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      fish.dispose();
      for (const pass of composer.passes) pass.dispose?.();
      composer.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
