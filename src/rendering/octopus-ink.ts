// @ts-nocheck -- procedural GPU particles at the vendored Three.js boundary.
import * as THREE from '../../vendor/three.module.js';

const PARTICLES_PER_BURST = 512;
const MAX_BURSTS = 1;
const PARTICLE_CAPACITY = PARTICLES_PER_BURST * MAX_BURSTS;
const PARTICLE_LIFETIME = 4.8;

// Let the octopus's body read before its first deliberate escape surge releases ink.
export const JAVA_OCTOPUS_INK_RELEASE_SECONDS = 3.1;
export const shouldReleaseJavaOctopusInk = (mode, fightTime) =>
  mode === 'surge' && Number.isFinite(fightTime) && fightTime >= JAVA_OCTOPUS_INK_RELEASE_SECONDS;

const vertexShader = `
attribute float aPointSize;
attribute float aAlpha;
attribute float aSeed;
attribute vec3 aTint;
attribute vec3 aVelocity;
uniform float uProjectionScale;
varying float vAlpha;
varying float vSeed;
varying vec3 vTint;
varying vec2 vFlowDirection;
varying float vStretch;

void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = max(1.0, aPointSize * uProjectionScale / max(0.2, -viewPosition.z));
  vec3 viewVelocity = (modelViewMatrix * vec4(aVelocity, 0.0)).xyz;
  float projectedSpeed = length(viewVelocity.xy);
  vFlowDirection = projectedSpeed > 0.001 ? viewVelocity.xy / projectedSpeed : vec2(1.0, 0.0);
  vStretch = clamp(projectedSpeed * 0.42, 0.0, 0.58);
  vAlpha = aAlpha;
  vSeed = aSeed;
  vTint = aTint;
}
`;

const fragmentShader = `
varying float vAlpha;
varying float vSeed;
varying vec3 vTint;
varying vec2 vFlowDirection;
varying float vStretch;

void main() {
  vec2 spritePoint = gl_PointCoord * 2.0 - 1.0;
  vec2 flow = normalize(vFlowDirection);
  vec2 crossFlow = vec2(-flow.y, flow.x);
  vec2 p = vec2(dot(spritePoint, flow) / (1.0 + vStretch), dot(spritePoint, crossFlow) * (1.0 + vStretch));
  float angle = atan(p.y, p.x);
  float radius = length(p);
  float rimNoise = 0.075 * sin(angle * 3.0 + vSeed * 6.283)
    + 0.045 * sin(angle * 7.0 - vSeed * 8.1)
    + 0.025 * sin(angle * 11.0 + vSeed * 3.7);
  float irregularRadius = radius + rimNoise * smoothstep(0.22, 1.0, radius);
  float softVolume = exp(-4.2 * radius * radius);
  float brokenEdge = 1.0 - smoothstep(0.72, 1.08, irregularRadius);
  float marbling = 0.84 + 0.16 * sin(p.x * 8.0 + vSeed * 7.0) * sin(p.y * 7.0 - vSeed * 4.0);
  float alpha = vAlpha * softVolume * mix(0.82, 1.0, brokenEdge) * marbling;
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
  const velocities = new Float32Array(PARTICLE_CAPACITY * 3);
  const particles = Array.from({ length: PARTICLE_CAPACITY }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    age: PARTICLE_LIFETIME,
    lifetime: PARTICLE_LIFETIME,
    releaseDelay: 0,
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
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3).setUsage(THREE.DynamicDrawUsage));
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
    // The funnel releases one dark bolus first. Its dense center stays
    // together briefly while the less concentrated edge peels into the flow.
    const core = ordinal < 96;
    const middle = ordinal >= 96 && ordinal < 320;
    // A dense mucus-bound nucleus leaves first; lighter peripheral ink then
    // shears into the current instead of forming a static, uniform ball.
    const radial = Math.sqrt(random01(seed + 1.3)) * (core ? 0.022 : middle ? 0.052 : 0.086);
    const angle = random01(seed + 2.7) * Math.PI * 2;
    const radialSide = Math.cos(angle);
    const radialUp = Math.sin(angle);
    const axial = random01(seed + 3.9) * (core ? 0.03 : middle ? 0.045 : 0.065);
    const particle = particles[index];
    particle.position.copy(origin)
      .addScaledVector(forward, axial)
      .addScaledVector(side, radial * radialSide)
      .addScaledVector(up, radial * radialUp);
    const outward = core ? 0.08 : middle ? 0.34 : 0.62 + random01(seed + 5.1) * 0.36;
    const lateralNoise = (random01(seed + 6.4) - 0.5) * 0.055;
    const verticalNoise = (random01(seed + 7.8) - 0.5) * 0.05;
    particle.velocity.copy(forward).multiplyScalar(core ? 0.42 : middle ? 0.78 + random01(seed + 8.9) * 0.16 : 1.05 + random01(seed + 9.7) * 0.35)
      .addScaledVector(side, radialSide * outward + lateralNoise)
      .addScaledVector(up, radialUp * outward + verticalNoise);
    particle.age = 0;
    particle.releaseDelay = core
      ? random01(seed + 15.1) * 0.015
      : middle
        ? 0.025 + random01(seed + 15.1) * 0.075
        : 0.08 + random01(seed + 15.1) * 0.18;
    particle.lifetime = core
      ? 1.35 + random01(seed + 10.1) * 0.55
      : middle
        ? 2.25 + random01(seed + 10.1) * 0.65
        : 2.8 + random01(seed + 10.1) * 0.8;
    particle.seed = random01(seed + 11.2);
    particle.baseSize = core
      ? 1.55 + random01(seed + 12.5) * 0.45
      : middle ? 0.9 + random01(seed + 12.5) * 0.35 : 0.55 + random01(seed + 12.5) * 0.28;
    particle.baseAlpha = core
      ? 0.48 + random01(seed + 13.6) * 0.16
      : middle ? 0.17 + random01(seed + 13.6) * 0.1 : 0.06 + random01(seed + 13.6) * 0.06;

    const tint = new THREE.Color(core ? 0x100b08 : middle ? 0x211511 : 0x382720);
    tint.lerp(new THREE.Color(0x63483b), random01(seed + 14.7) * (core ? 0.04 : 0.16));
    const offset = index * 3;
    tints[offset] = tint.r;
    tints[offset + 1] = tint.g;
    tints[offset + 2] = tint.b;
    velocities[offset] = particle.velocity.x;
    velocities[offset + 1] = particle.velocity.y;
    velocities[offset + 2] = particle.velocity.z;
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
      sizes[index] = particle.baseSize * 0.72;
      alphas[index] = 0;
    }
    burstCount++;
    activeParticles = burstCount * PARTICLES_PER_BURST;
    points.visible = true;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aPointSize.needsUpdate = true;
    geometry.attributes.aAlpha.needsUpdate = true;
    geometry.attributes.aTint.needsUpdate = true;
    geometry.attributes.aVelocity.needsUpdate = true;
    geometry.attributes.aSeed.needsUpdate = true;
    return true;
  };

  const update = (deltaSeconds, drawingBufferHeight = 720, verticalFovDegrees = 46) => {
    if (disposed) return;
    const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.05);
    const projectionScale = Math.max(1, drawingBufferHeight)
      / (2 * Math.tan(THREE.MathUtils.degToRad(verticalFovDegrees) * 0.5));
    material.uniforms.uProjectionScale.value = projectionScale;
    let active = 0;
    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index];
      const expiration = particle.releaseDelay + particle.lifetime;
      if (particle.age >= expiration) {
        alphas[index] = 0;
        continue;
      }
      particle.age = Math.min(expiration, particle.age + dt);
      active++;
      const age = particle.age - particle.releaseDelay;
      if (age <= 0) {
        alphas[index] = 0;
        continue;
      }
      const progress = age / particle.lifetime;
      const position = particle.position;
      // Neighboring particles share a slow, spatially correlated eddy field;
      // this shears the bolus into soft streaks instead of vibrating as grit.
      const eddy = Math.sin(position.x * 1.1 + position.z * 1.6 + age * 1.7 + particle.seed * Math.PI * 2);
      particle.velocity.x += (Math.sin(position.y * 1.45 + age * 1.3) - Math.cos(position.z * 1.05 - age * 0.9)) * 0.14 * dt;
      particle.velocity.y += (Math.sin(position.z * 1.15 + age * 0.8) + 0.08 + eddy * 0.7) * 0.1 * dt;
      particle.velocity.z += (Math.cos(position.x * 1.35 + age * 1.1) - Math.sin(position.y * 0.95 - age) - eddy * 0.55) * 0.14 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      particle.velocity.multiplyScalar(Math.exp(-0.24 * dt));
      const velocityOffset = index * 3;
      velocities[velocityOffset] = particle.velocity.x;
      velocities[velocityOffset + 1] = particle.velocity.y;
      velocities[velocityOffset + 2] = particle.velocity.z;
      alphas[index] = particle.baseAlpha * smoothstep(0, 0.055, age) * (1 - smoothstep(0.48, 1, progress)) / (1 + progress * 0.7);
      sizes[index] = particle.baseSize * (0.7 + progress * 1.25);
      const offset = index * 3;
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
    }
    activeParticles = active;
    points.visible = active > 0;
    if (active > 0) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aPointSize.needsUpdate = true;
      geometry.attributes.aVelocity.needsUpdate = true;
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
        particle.age = particle.lifetime + particle.releaseDelay;
        particle.position.set(0, 0, 0);
      }
      alphas.fill(0);
      velocities.fill(0);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.aVelocity.needsUpdate = true;
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
