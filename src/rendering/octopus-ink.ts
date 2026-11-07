// @ts-nocheck -- procedural GPU particles at the vendored Three.js boundary.
import * as THREE from '../../vendor/three.module.js';

const PARTICLES_PER_BURST = 96;
const MAX_BURSTS = 1;
const PARTICLE_CAPACITY = PARTICLES_PER_BURST * MAX_BURSTS;
const PARTICLE_LIFETIME = 4.8;

const vertexShader = `
attribute float aPointSize;
attribute float aAlpha;
attribute float aSeed;
attribute vec3 aTint;
uniform float uProjectionScale;
varying float vAlpha;
varying float vSeed;
varying vec3 vTint;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = max(1.0, aPointSize * uProjectionScale / max(0.2, -viewPosition.z));
  vAlpha = aAlpha;
  vSeed = aSeed;
  vTint = aTint;
}
`;

const fragmentShader = `
varying float vAlpha;
varying float vSeed;
varying vec3 vTint;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float angle = atan(p.y, p.x);
  float rim = 1.0
    + 0.11 * sin(angle * 3.0 + vSeed * 6.283)
    + 0.06 * sin(angle * 7.0 - vSeed * 8.1)
    + 0.035 * sin(angle * 11.0 + vSeed * 3.7);
  float radius = length(p) * rim;
  float softEdge = 1.0 - smoothstep(0.48, 1.0, radius);
  float denseCore = 0.58 + 0.42 * (1.0 - smoothstep(0.0, 0.78, length(p)));
  float alpha = vAlpha * softEdge * denseCore;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vTint, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const random01 = (seed) => {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export function createOctopusInkEffect(scene) {
  const positions = new Float32Array(PARTICLE_CAPACITY * 3);
  const sizes = new Float32Array(PARTICLE_CAPACITY);
  const alphas = new Float32Array(PARTICLE_CAPACITY);
  const seeds = new Float32Array(PARTICLE_CAPACITY);
  const tints = new Float32Array(PARTICLE_CAPACITY * 3);
  const particles = Array.from({ length: PARTICLE_CAPACITY }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    age: PARTICLE_LIFETIME,
    lifetime: PARTICLE_LIFETIME,
    baseSize: 0,
    baseAlpha: 0,
    seed: 0,
  }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aPointSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
  geometry.setDrawRange(0, PARTICLE_CAPACITY);

  const material = new THREE.ShaderMaterial({
    uniforms: { uProjectionScale: { value: 1 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'java-octopus-ink';
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 3;
  scene.add(points);

  const forward = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  let burstCount = 0;
  let activeParticles = 0;
  let disposed = false;

  const setParticle = (index, origin, seed, ordinal) => {
    const core = ordinal < 20;
    const trailing = ordinal >= 72;
    const radial = Math.sqrt(random01(seed + 1.3)) * (core ? 0.035 : trailing ? 0.12 : 0.08);
    const angle = random01(seed + 2.7) * Math.PI * 2;
    const axial = random01(seed + 3.9) * (core ? 0.08 : trailing ? 0.44 : 0.25);
    const offsetSide = radial * Math.cos(angle);
    const offsetUp = radial * Math.sin(angle);
    const particle = particles[index];
    particle.position.copy(origin)
      .addScaledVector(forward, axial)
      .addScaledVector(side, offsetSide)
      .addScaledVector(up, offsetUp);
    const lateral = (random01(seed + 5.1) - 0.5) * 0.12;
    const vertical = (random01(seed + 6.4) - 0.5) * 0.10;
    particle.velocity.copy(forward).multiplyScalar(0.54 + random01(seed + 7.8) * 0.34)
      .addScaledVector(side, lateral)
      .addScaledVector(up, vertical + 0.01);
    particle.age = 0;
    particle.lifetime = 3.4 + random01(seed + 8.9) * 1.2;
    particle.seed = random01(seed + 9.2);
    particle.baseSize = core
      ? 0.40 + random01(seed + 10.5) * 0.16
      : trailing ? 0.16 + random01(seed + 10.5) * 0.12 : 0.25 + random01(seed + 10.5) * 0.17;
    particle.baseAlpha = core
      ? 0.92
      : trailing ? 0.36 + random01(seed + 11.6) * 0.12 : 0.56 + random01(seed + 11.6) * 0.18;

    const tint = new THREE.Color(core ? 0x120e0d : trailing ? 0x352723 : 0x241916);
    tint.lerp(new THREE.Color(0x493630), random01(seed + 12.7) * (core ? 0.06 : 0.20));
    const offset = index * 3;
    tints[offset] = tint.r;
    tints[offset + 1] = tint.g;
    tints[offset + 2] = tint.b;
    seeds[index] = particle.seed;
    return particle;
  };

  const trigger = (origin, direction) => {
    if (disposed || burstCount >= MAX_BURSTS) return false;
    forward.copy(direction);
    if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0);
    forward.normalize();
    reference.set(0, 1, 0);
    if (Math.abs(forward.dot(reference)) > 0.92) reference.set(0, 0, 1);
    side.crossVectors(forward, reference).normalize();
    up.crossVectors(side, forward).normalize();
    const first = burstCount * PARTICLES_PER_BURST;
    for (let ordinal = 0; ordinal < PARTICLES_PER_BURST; ordinal++) {
      const index = first + ordinal;
      const seed = 31.7 + burstCount * 211.3 + ordinal * 17.9;
      const particle = setParticle(index, origin, seed, ordinal);
      const offset = index * 3;
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      sizes[index] = particle.baseSize;
      alphas[index] = 0;
    }
    burstCount++;
    activeParticles = burstCount * PARTICLES_PER_BURST;
    points.visible = true;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aPointSize.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aTint.needsUpdate = true;
    geometry.attributes.aSeed.needsUpdate = true;
    return true;
  };

  const update = (deltaSeconds, drawingBufferHeight = 720, verticalFovDegrees = 46) => {
    if (disposed) return;
    const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.05);
    const projectionScale = Math.max(1, drawingBufferHeight)
      / (2 * Math.tan(THREE.MathUtils.degToRad(verticalFovDegrees) * 0.5));
    material.uniforms.uProjectionScale.value = projectionScale;
    let visible = 0;
    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index];
      if (particle.age >= particle.lifetime) {
        alphas[index] = 0;
        continue;
      }
      particle.age += dt;
      if (particle.age >= particle.lifetime) {
        particle.age = particle.lifetime;
        alphas[index] = 0;
        continue;
      }
      const age = particle.age;
      const progress = age / particle.lifetime;
      particle.velocity.x += Math.sin(age * 2.2 + particle.seed * 9.0) * 0.052 * dt;
      particle.velocity.y += (0.012 + Math.cos(age * 1.7 + particle.seed * 7.0) * 0.024) * dt;
      particle.velocity.z += Math.cos(age * 2.0 + particle.seed * 11.0) * 0.055 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      particle.velocity.multiplyScalar(Math.exp(-0.48 * dt));
      alphas[index] = particle.baseAlpha * smoothstep(0, 0.045, age) * (1 - smoothstep(0.62, 1, progress));
      sizes[index] = particle.baseSize * (1 + progress * 0.82);
      const offset = index * 3;
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      visible++;
    }
    activeParticles = visible;
    points.visible = visible > 0;
    if (visible > 0) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aPointSize.needsUpdate = true;
    }
    geometry.attributes.aAlpha.needsUpdate = true;
  };

  return {
    trigger,
    update,
    reset() {
      if (disposed) return;
      burstCount = 0;
      activeParticles = 0;
      points.visible = false;
      for (const particle of particles) {
        particle.age = particle.lifetime;
        particle.position.set(0, 0, 0);
      }
      alphas.fill(0);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aAlpha.needsUpdate = true;
    },
    get active() {
      return !disposed && activeParticles > 0;
    },
    get diagnostics() {
      return { activeParticles, visibleParticles: alphas.filter(alpha => alpha > 0.004).length, burstsTriggered: burstCount, finitePositions: positions.every(Number.isFinite), disposed };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      activeParticles = 0;
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
