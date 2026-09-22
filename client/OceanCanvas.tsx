import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createGoFish } from "../go-fish.js";
import { createK8sFish } from "../k8s-fish.js";
import { waterShader } from "./waterShader";
import type { OceanState } from "./types";

type FishModel = ReturnType<typeof createGoFish>;

type Rig = {
  root: THREE.Group;
  background: THREE.Scene;
  backgroundCamera: THREE.OrthographicCamera;
  uniforms: Record<string, THREE.IUniform>;
  bobber: THREE.Group;
  thread: THREE.Line;
  rod: THREE.Line;
  spray: THREE.Points;
  drops: Float32Array;
  goFish: FishModel;
  k8sFish: FishModel;
  fishShadow: THREE.Group;
  fishShadowMaterials: THREE.MeshBasicMaterial[];
  wakes: THREE.Line[];
  threadGeometry: THREE.BufferGeometry;
  rodGeometry: THREE.BufferGeometry;
  dropletGeometry: THREE.BufferGeometry;
  rippleIndex: number;
  ripples: THREE.Vector4[];
  lastWake: number;
};

const waveHeight = (x: number, z: number, time: number) => {
  let height = 0;
  let frequency = 0.42;
  let amplitude = 0.13;
  let angle = 0.3;
  for (let index = 0; index < 7; index += 1) {
    height += Math.sin((x * Math.cos(angle) + z * Math.sin(angle)) * frequency + time * (0.42 + index * 0.14)) * amplitude;
    frequency *= 1.83;
    amplitude *= 0.48;
    angle += 2.17;
  }
  return height;
};

const dampAngle = (current: number, target: number, lambda: number, delta: number) => {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * delta));
};

const dampWrapped = (current: number, target: number, lambda: number, delta: number) => dampAngle(current, target, lambda, delta);

const line = (color: number, opacity: number, count: number) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const object = new THREE.Line(geometry, material);
  object.frustumCulled = false;
  return object;
};

const createFishShadow = () => {
  const shadow = new THREE.Group();
  const surface = new THREE.Group();
  surface.rotation.x = -Math.PI / 2;

  const softMaterial = new THREE.MeshBasicMaterial({
    color: 0x061522,
    transparent: true,
    opacity: 0.035,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0x0b2532,
    transparent: true,
    opacity: 0.1,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-1.65, 0);
  bodyShape.bezierCurveTo(-1.2, 0.5, -0.22, 0.47, 0.7, 0.2);
  bodyShape.bezierCurveTo(0.93, 0.12, 0.93, -0.12, 0.7, -0.2);
  bodyShape.bezierCurveTo(-0.22, -0.47, -1.2, -0.5, -1.65, 0);

  const tailShape = new THREE.Shape();
  tailShape.moveTo(0.52, 0);
  tailShape.lineTo(1.82, 0.62);
  tailShape.lineTo(1.4, 0);
  tailShape.lineTo(1.82, -0.62);
  tailShape.closePath();

  const finShape = new THREE.Shape();
  finShape.moveTo(-0.15, 0.18);
  finShape.lineTo(0.35, 0.92);
  finShape.lineTo(0.63, 0.18);
  finShape.closePath();

  const makeLayer = (material: THREE.MeshBasicMaterial, scale: number) => {
    const layer = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ShapeGeometry(bodyShape), material);
    const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape), material);
    const fin = new THREE.Mesh(new THREE.ShapeGeometry(finShape), material);
    layer.scale.setScalar(scale);
    layer.add(body, tail, fin);
    return layer;
  };

  surface.add(makeLayer(softMaterial, 1.18), makeLayer(coreMaterial, 1));
  shadow.add(surface);
  shadow.renderOrder = 1;
  shadow.visible = false;
  return { group: shadow, materials: [softMaterial, coreMaterial] };
};

function createRig(): Rig {
  const root = new THREE.Group();
  const background = new THREE.Scene();
  const backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const ripples = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -100, 0));
  const uniforms = {
    uTime: { value: 0 },
    uCamera: { value: new THREE.Matrix4() },
    uProjectionInverse: { value: new THREE.Matrix4() },
    uRipples: { value: ripples },
    uResolution: { value: new THREE.Vector2() },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader: waterShader,
    }),
  );
  background.add(water);

  const bobber = new THREE.Group();
  const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), new THREE.MeshStandardMaterial({ color: 0xd27e55, roughness: 0.35 }));
  buoy.scale.y = 1.6;
  bobber.add(buoy);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xf5e9cf, roughness: 0.5 }));
  tip.position.y = 0.13;
  bobber.add(tip);
  bobber.visible = false;
  root.add(bobber);

  const threadGeometry = new THREE.BufferGeometry();
  const thread = line(0xdbe6e2, 0.52, 49);
  threadGeometry.copy(thread.geometry);
  thread.visible = false;
  root.add(thread);

  const rodGeometry = new THREE.BufferGeometry();
  const rod = line(0x263b43, 1, 25);
  rodGeometry.copy(rod.geometry);
  rod.visible = false;
  root.add(rod);

  const dropletGeometry = new THREE.BufferGeometry();
  const drops = new Float32Array(36 * 3);
  dropletGeometry.setAttribute("position", new THREE.BufferAttribute(drops, 3));
  const spray = new THREE.Points(dropletGeometry, new THREE.PointsMaterial({ color: 0xd9efed, size: 0.045, transparent: true, opacity: 0.85, depthWrite: false }));
  spray.visible = false;
  spray.frustumCulled = false;
  root.add(spray);

  const goFish = createGoFish();
  const k8sFish = createK8sFish();
  goFish.group.visible = false;
  k8sFish.group.visible = false;
  root.add(goFish.group, k8sFish.group);

  const fishShadow = createFishShadow();
  root.add(fishShadow.group);

  const wakes = Array.from({ length: 7 }, () => {
    const wake = line(0xa2d7db, 0.58, 27);
    wake.visible = false;
    root.add(wake);
    return wake;
  });
  return { root, background, backgroundCamera, uniforms, bobber, thread, rod, spray, drops, goFish, k8sFish, fishShadow: fishShadow.group, fishShadowMaterials: fishShadow.materials, wakes, threadGeometry, rodGeometry, dropletGeometry, rippleIndex: 0, ripples, lastWake: -1 };
}

function FishingScene({ state, charge, chargeAim, reducedMotion, onLand }: { state: OceanState; charge: number; chargeAim: number; reducedMotion: boolean; onLand: () => void }) {
  const { gl, camera, scene, size } = useThree();
  const rig = useMemo(createRig, []);
  const stateRef = useRef(state);
  const chargeRef = useRef(charge);
  const chargeAimRef = useRef(chargeAim);
  const landedRevision = useRef(-1);
  const splashAt = useRef(-100);
  const timeRef = useRef(0);
  const serverOffset = useRef(0);
  const shadowMotion = useRef({ initialized: false, x: 0, z: 0, heading: 0, wave: 0 });
  stateRef.current = state;
  chargeRef.current = charge;
  chargeAimRef.current = chargeAim;

  useEffect(() => () => {
    rig.goFish.dispose();
    rig.k8sFish.dispose();
    rig.root.traverse(object => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      materials.forEach(material => material.dispose());
    });
  }, [rig]);

  useFrame((_, delta) => {
    const now = performance.now();
    const time = timeRef.current += delta * (reducedMotion ? 0.15 : 1);
    const current = stateRef.current;
      const castDistance = 10 + current.strength * 18;
    const castTarget = new THREE.Vector3(current.aim * 7, 0, -castDistance);
    const fishDistance = current.initialDistance || current.distance || castDistance;
    const fishTarget = new THREE.Vector3(current.aim * 7 + (current.fishX || 0), 0, -fishDistance);
    const target = ["fighting", "caught"].includes(current.phase) ? fishTarget : castTarget;

    const active = !["idle", "caught", "escaped"].includes(current.phase);
    const cameraProgress = THREE.MathUtils.damp((camera.userData.oceanProgress as number | undefined) ?? 0, active ? 1 : 0, 2, delta);
    camera.userData.oceanProgress = cameraProgress;
    camera.position.set(Math.sin(time * 0.13) * 0.016, 3.35 - cameraProgress * 0.18 + Math.sin(time * 0.19) * 0.024, 7 - cameraProgress * 0.6);
    camera.lookAt(current.aim * 0.18, -3.8 - cameraProgress * 0.8, -35);
    camera.updateMatrixWorld();
    rig.uniforms.uTime.value = time;
    rig.uniforms.uResolution.value.set(size.width, size.height);
    rig.uniforms.uCamera.value.copy(camera.matrixWorld);
    rig.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);

    const castAge = (Date.now() + serverOffset.current - current.castAt) / 1000;
    rig.bobber.visible = active && current.phase !== "fighting";
    rig.thread.visible = active;
    rig.rod.visible = active || chargeRef.current > 0;
    rig.bobber.scale.setScalar(current.phase === "biting" ? 0.6 : 1);
    const start = new THREE.Vector3(0.85, 1.8, 4.8);
    let fling = 0;
    if (["casting", "waiting"].includes(current.phase)) {
      const progress = THREE.MathUtils.clamp(castAge / 0.95, 0, 1);
      const ease = 1 - Math.pow(1 - progress, 1.4);
      rig.bobber.position.lerpVectors(start, target, ease);
      rig.bobber.position.y = (1 - progress) * start.y + Math.sin(progress * Math.PI) * (4.7 + current.strength * 2) + waveHeight(target.x, target.z, time) * progress;
      rig.bobber.rotation.z = progress < 1 ? progress * 12 : Math.sin(time * 2) * 0.12;
      fling = Math.sin(Math.min(progress * 2, 1) * Math.PI);
      if (progress >= 1 && landedRevision.current !== current.revision) { landedRevision.current = current.revision; splashAt.current = time; rig.ripples[rig.rippleIndex++ % rig.ripples.length].set(target.x, target.z, time, 1); onLand(); }
    } else if (current.phase === "biting") {
      rig.bobber.position.copy(target);
      rig.bobber.position.y = waveHeight(target.x, target.z, time) - 0.11 + Math.sin(time * 16) * 0.055;
      rig.bobber.rotation.z = Math.sin(time * 15) * 0.5;
      if (time - rig.lastWake > 0.35) { rig.ripples[rig.rippleIndex++ % rig.ripples.length].set(target.x, target.z, time, 0.5); rig.lastWake = time; }
    } else if (current.phase === "fighting") {
      rig.bobber.position.copy(target);
      rig.bobber.position.y = waveHeight(target.x, target.z, time) + 0.03;
      const interval = current.mode === "rest" ? 0.4 : 0.16;
      if (time - rig.lastWake > interval) { rig.ripples[rig.rippleIndex++ % rig.ripples.length].set(target.x, target.z, time, current.mode === "rest" ? 0.3 : 0.65); rig.lastWake = time; }
    } else if (current.phase === "retrieving") {
      const progress = THREE.MathUtils.clamp((Date.now() - current.retrieveAt) / 650, 0, 1);
      rig.bobber.position.lerpVectors(target, start, progress * progress);
      rig.bobber.position.y = waveHeight(rig.bobber.position.x, rig.bobber.position.z, time) + progress * 1.8;
    }

    const strain = current.phase === "fighting" ? current.tension : 0;
    const rodTip = new THREE.Vector3(1.1 + chargeAimRef.current * 0.4 + Math.sin(time * 32) * strain * 0.027, 1.15 + chargeRef.current * 1.1 - fling * 0.5 - strain * 0.43, 2.8 + chargeRef.current * 0.6);
    if (rig.rod.visible) {
      const positions = rig.rod.geometry.attributes.position.array as Float32Array;
      for (let index = 0; index < 25; index += 1) { const p = index / 24; positions[index * 3] = 2.2 + (rodTip.x - 2.2) * p; positions[index * 3 + 1] = -0.9 + (rodTip.y + 0.9) * p - Math.sin(p * Math.PI) * (fling * 0.25 + strain * 0.7); positions[index * 3 + 2] = 6 + (rodTip.z - 6) * p; }
      rig.rod.geometry.attributes.position.needsUpdate = true;
    }
    if (rig.thread.visible) {
      const positions = rig.thread.geometry.attributes.position.array as Float32Array;
      for (let index = 0; index < 49; index += 1) { const p = index / 48; positions[index * 3] = THREE.MathUtils.lerp(rodTip.x, rig.bobber.position.x, p); positions[index * 3 + 1] = THREE.MathUtils.lerp(rodTip.y, rig.bobber.position.y, p) - Math.sin(p * Math.PI) * 0.2; positions[index * 3 + 2] = THREE.MathUtils.lerp(rodTip.z, rig.bobber.position.z, p); }
      rig.thread.geometry.attributes.position.needsUpdate = true;
      const material = rig.thread.material as THREE.LineBasicMaterial;
      material.color.set(strain > 0.8 ? 0xe7a78b : 0xdbe6e2); material.opacity = 0.5 + strain * 0.3;
    }
    rig.wakes.forEach((wake, index) => {
      wake.visible = current.phase === "fighting" && index < (current.school || 1);
      if (!wake.visible) return;
      const spread = index === 0 ? 0 : 1.1 + index * 0.18;
      const angle = index * 2.4;
      const x = target.x + Math.sin(angle + time * 0.5) * spread;
      const z = target.z + Math.cos(angle + time * 0.7) * spread;
      const positions = wake.geometry.attributes.position.array as Float32Array;
      for (let vertex = 0; vertex < 27; vertex += 1) { const p = vertex / 26; const wx = x + Math.sin(p * Math.PI * 2) * (0.19 + p * 0.15); const wz = z + p * 1.9; positions[vertex * 3] = wx; positions[vertex * 3 + 1] = waveHeight(wx, wz, time) + 0.018; positions[vertex * 3 + 2] = wz; }
      wake.geometry.attributes.position.needsUpdate = true;
      (wake.material as THREE.LineBasicMaterial).opacity = (current.mode === "rest" ? 0.3 : 0.6) * (index ? 0.7 : 1);
    });

    rig.goFish.group.visible = current.phase === "caught" && current.species !== "k8s";
    rig.k8sFish.group.visible = current.phase === "caught" && current.species === "k8s";
    const shadowVisible = ["waiting", "biting", "fighting"].includes(current.phase);
    rig.fishShadow.visible = shadowVisible;
    if (shadowVisible) {
      const motion = shadowMotion.current;
      const headingX = Number.isFinite(current.fishHeadingX) ? current.fishHeadingX : 1;
      const headingZ = Number.isFinite(current.fishHeadingZ) ? current.fishHeadingZ : 0;
      const targetHeading = Math.atan2(headingZ, -headingX);
      if (!motion.initialized) {
        motion.initialized = true;
        motion.x = fishTarget.x;
        motion.z = fishTarget.z;
        motion.heading = targetHeading;
        motion.wave = current.fishWavePhase || 0;
      } else {
        motion.x = THREE.MathUtils.damp(motion.x, fishTarget.x, 8, delta);
        motion.z = THREE.MathUtils.damp(motion.z, fishTarget.z, 8, delta);
        motion.heading = dampAngle(motion.heading, targetHeading, 7, delta);
        motion.wave = dampWrapped(motion.wave, current.fishWavePhase || 0, 10, delta);
      }
      const shadowDepth = current.phase === "fighting" ? 0.34 : current.phase === "biting" ? 0.25 : 0.2;
      rig.fishShadow.position.set(motion.x, waveHeight(motion.x, motion.z, time) - shadowDepth, motion.z);
      rig.fishShadow.rotation.y = motion.heading;
      const pulse = 1 + Math.sin(motion.wave) * Math.min(0.08, Math.abs(current.fishWaveAmplitude || 0) * 0.35);
      rig.fishShadow.scale.setScalar((current.species === "k8s" ? 1.08 : 1) * pulse);
      const baseOpacity = current.phase === "fighting" ? (current.mode === "split" ? 0.38 : 0.3) : current.phase === "biting" ? 0.34 : 0.3;
      rig.fishShadowMaterials[0].opacity = baseOpacity * 0.42;
      rig.fishShadowMaterials[1].opacity = baseOpacity;
    } else {
      shadowMotion.current.initialized = false;
    }
    const caughtFish = current.species === "k8s" ? rig.k8sFish : rig.goFish;
    if (current.phase === "caught") {
      const progress = reducedMotion ? 1 : THREE.MathUtils.clamp((Date.now() - current.resultAt) / 900, 0, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const depth = camera.aspect < 0.85 ? 10 / camera.aspect : 8.8;
      const final = new THREE.Vector3(camera.aspect < 0.85 ? -1.32 : camera.aspect * depth * 0.425 * 0.24 - 0.95, 0.15, -depth).applyMatrix4(camera.matrixWorld);
      caughtFish.group.position.lerpVectors(new THREE.Vector3(target.x, 0.3, target.z), final, ease);
      caughtFish.group.position.y += Math.sin(progress * Math.PI) * 2 + (progress === 1 ? Math.sin(time * 0.6) * 0.045 : 0);
      const towardCamera = camera.position.clone().sub(final); towardCamera.y = 0; towardCamera.normalize();
      const upright = new THREE.Vector3(0, 1, 0);
      const screenRight = new THREE.Vector3().crossVectors(upright, towardCamera).normalize();
      caughtFish.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(screenRight, upright, towardCamera));
      caughtFish.group.rotateY(current.species === "k8s" ? -0.08 : -0.13);
      const maxScale = current.species === "k8s" ? 0.68 : 0.82;
      caughtFish.group.scale.setScalar(THREE.MathUtils.lerp(0.22, maxScale, ease));
      caughtFish.update(time, { power: 0.15, glow: 1 });
    }
    const splashAge = time - splashAt.current;
    rig.spray.visible = splashAge >= 0 && splashAge < 0.85;
    if (rig.spray.visible) {
      for (let index = 0; index < 36; index += 1) { const angle = index * 2.399; const speed = new THREE.Vector3(Math.cos(angle) * (0.5 + (index % 5) * 0.16), 0.75 + (index % 7) * 0.21, Math.sin(angle) * (0.5 + (index % 5) * 0.16)); rig.drops[index * 3] = target.x + speed.x * splashAge; rig.drops[index * 3 + 1] = Math.max(0, speed.y * splashAge - 2.9 * splashAge * splashAge); rig.drops[index * 3 + 2] = target.z + speed.z * splashAge; }
      rig.dropletGeometry.attributes.position.needsUpdate = true; (rig.spray.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - splashAge / 0.85);
    }

    gl.autoClear = false;
    gl.clear();
    gl.render(rig.background, rig.backgroundCamera);
    gl.clearDepth();
    gl.render(scene, camera);
  }, 1);

  return <primitive object={rig.root} />;
}

export function OceanCanvas({ state, charge, chargeAim, onLand }: { state: OceanState; charge: number; chargeAim: number; onLand: () => void }) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return <Canvas id="ocean-canvas" camera={{ fov: 46, near: 0.1, far: 2400, position: [0, 3.35, 7] }} dpr={[1, 1.6]} gl={{ antialias: true, powerPreference: "high-performance" }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; gl.outputColorSpace = THREE.SRGBColorSpace; gl.autoClear = false; }}>
    <hemisphereLight args={[0xe4edef, 0x23414d, 2.3]} />
    <directionalLight color={0xffdfad} intensity={2} position={[-10, 12, -20]} />
    <directionalLight color={0x8be1ff} intensity={1.8} position={[-3, 7, 4]} />
    <FishingScene state={state} charge={charge} chargeAim={chargeAim} reducedMotion={reducedMotion} onLand={onLand} />
  </Canvas>;
}
