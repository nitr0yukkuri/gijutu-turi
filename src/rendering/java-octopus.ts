// @ts-nocheck -- imperative geometry animation at the vendored Three.js boundary.
import * as THREE from '../../vendor/three.module.js';
import { applyFishWater, DEFAULT_FISH_WATER_PROFILE } from './fish-water.js';

const ARM_COUNT = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function createSkinMottle() {
  const size = 96;
  const pixels = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = Math.sin(x * .19 + Math.sin(y * .13) * 1.6) * Math.cos(y * .17 - x * .07);
      const fine = Math.sin(x * 1.71 + y * 2.13) * .16 + Math.cos(x * .91 - y * 1.37) * .12;
      const value = clamp(Math.round(188 + broad * 25 + fine * 18), 132, 235);
      const offset = (y * size + x) * 3;
      pixels[offset] = value;
      pixels[offset + 1] = Math.min(255, value + 3);
      pixels[offset + 2] = Math.max(0, value - 5);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.6, 1.1);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createArmGeometry(segmentCount, radialCount) {
  const positions = new Float32Array((segmentCount + 1) * radialCount * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const indices = [];
  for (let ring = 0; ring < segmentCount; ring++) {
    for (let radial = 0; radial < radialCount; radial++) {
      const nextRadial = (radial + 1) % radialCount;
      const a = ring * radialCount + radial;
      const b = ring * radialCount + nextRadial;
      const c = (ring + 1) * radialCount + nextRadial;
      const d = (ring + 1) * radialCount + radial;
      indices.push(a, b, d, b, c, d);
    }
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createJavaOctopus({ detail = 'high', phase = 0, waterUniforms = null } = {}) {
  const group = new THREE.Group();
  group.name = 'java-octopus';
  const lowDetail = detail === 'low';
  const segmentCount = lowDetail ? 12 : 20;
  const radialCount = lowDetail ? 6 : 8;
  const suckerStations = lowDetail ? 6 : 10;
  const geometries = new Set();
  const materials = new Set();
  const skinMottle = createSkinMottle();
  const normalSkinColor = new THREE.Color(0x8d6250);
  const stressSkinColor = new THREE.Color(0x74483f);
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0x8d6250,
    map: skinMottle,
    roughness: .58,
    metalness: 0,
    clearcoat: .12,
    clearcoatRoughness: .52,
    emissive: 0x170b08,
    emissiveIntensity: .035,
  });
  const headSkin = skin;
  const armSkin = skin;
  const paleSkin = new THREE.MeshPhysicalMaterial({
    color: 0xc08b70,
    roughness: .54,
    clearcoat: .1,
    map: skinMottle,
  });
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: 0xb6a17b, roughness: .36, clearcoat: .34 });
  const pupilMaterial = new THREE.MeshPhysicalMaterial({ color: 0x100d0b, roughness: .13, clearcoat: 1, clearcoatRoughness: .08 });
  const suckerMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc39b7d, roughness: .4, clearcoat: .18 });
  const funnelInner = new THREE.MeshStandardMaterial({ color: 0x38271f, roughness: .72, side: THREE.DoubleSide });
  const beakMaterial = new THREE.MeshPhysicalMaterial({ color: 0x1b1714, roughness: .27, clearcoat: .38 });
  for (const material of [skin, paleSkin, eyeWhite, pupilMaterial, suckerMaterial, funnelInner, beakMaterial]) materials.add(material);

  const addMesh = (geometry, material, parent = group, name = '') => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };
  const sphere = new THREE.SphereGeometry(1, lowDetail ? 20 : 32, lowDetail ? 14 : 22);
  geometries.add(sphere);
  const mantle = addMesh(sphere, skin, group, 'mantle');
  mantle.position.set(.38, .045, 0);
  mantle.scale.set(.73, .43, .4);
  mantle.rotation.z = -.06;

  const head = addMesh(sphere, headSkin, group, 'head');
  head.position.set(-.32, -.075, 0);
  head.scale.set(.31, .235, .29);

  // The funnel sits under the mantle and points backward; jetting is an escape action.
  const funnel = new THREE.Group();
  funnel.name = 'siphon';
  funnel.position.set(.12, -.25, 0);
  funnel.rotation.z = -Math.PI / 2 - .14;
  group.add(funnel);
  const funnelGeo = new THREE.CylinderGeometry(.075, .14, .27, lowDetail ? 10 : 16, 1, true);
  const funnelOuter = addMesh(funnelGeo, paleSkin, funnel, 'siphon-wall');
  funnelOuter.position.x = .015;
  const funnelRim = addMesh(new THREE.TorusGeometry(.083, .015, 7, lowDetail ? 12 : 20), paleSkin, funnel, 'siphon-rim');
  funnelRim.rotation.x = -Math.PI / 2;
  funnelRim.position.x = .14;
  addMesh(new THREE.ConeGeometry(.072, .19, lowDetail ? 10 : 16, 1, true), funnelInner, funnel, 'siphon-interior')
    .position.x = .035;

  // Two lateral eyes with a forward-facing bias and glossy pupils.
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(-.43, .015, side * .205);
    group.add(eye);
    const sclera = addMesh(new THREE.SphereGeometry(.064, 16, 12), eyeWhite, eye, 'eye-sclera');
    sclera.scale.set(1, .84, .74);
    const iris = addMesh(new THREE.SphereGeometry(.035, 14, 10), pupilMaterial, eye, 'eye-pupil');
    iris.position.set(-.024, .004, side * .038);
    iris.scale.set(.86, .9, .58);
    const glint = addMesh(new THREE.SphereGeometry(.008, 8, 6), eyeWhite, eye, 'eye-glint');
    glint.position.set(-.03, .018, side * .056);
    eyes.push(eye);
  }

  const beak = addMesh(new THREE.ConeGeometry(.055, .12, 8), beakMaterial, group, 'beak');
  beak.position.set(-.47, -.17, 0);
  beak.rotation.z = Math.PI / 2;
  beak.scale.set(.75, 1, .72);

  const armDirections = [
    [-.96, -.64, -.2], [-1.08, -.4, .32], [-1.22, -.16, -.42], [-1.35, .08, .42],
    [-1.26, .34, -.26], [-1.13, .57, .35], [-.96, .76, -.38], [-.82, .48, .52],
  ];
  const arms = armDirections.map((values, index) => {
    const direction = new THREE.Vector3(...values).normalize();
    const curveAxis = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1));
    if (curveAxis.lengthSq() < .001) curveAxis.set(0, 1, 0);
    curveAxis.normalize();
    const baseLength = 1.08 + (index % 4) * .105;
    const geometry = createArmGeometry(segmentCount, radialCount);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, armSkin);
    mesh.name = `arm-${index + 1}`;
    mesh.frustumCulled = false;
    group.add(mesh);
    return {
      direction,
      curveAxis,
      phaseOffset: index * 2.399,
      length: baseLength,
      animatedDirection: new THREE.Vector3(),
      geometry,
      centers: Array.from({ length: segmentCount + 1 }, () => new THREE.Vector3()),
      tangent: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      side: new THREE.Vector3(),
    };
  });

  const suckerGeometry = new THREE.TorusGeometry(.022, .005, 5, lowDetail ? 8 : 12);
  geometries.add(suckerGeometry);
  const suckerCount = ARM_COUNT * suckerStations * 2;
  const suckers = new THREE.InstancedMesh(suckerGeometry, suckerMaterial, suckerCount);
  suckers.name = 'sucker-cups';
  suckers.frustumCulled = false;
  suckers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(suckers);
  const suckerPosition = new THREE.Vector3();
  const suckerOrientation = new THREE.Quaternion();
  const suckerScale = new THREE.Vector3();
  const suckerMatrix = new THREE.Matrix4();
  const ventral = new THREE.Vector3(0, -1, 0);
  const armStart = new THREE.Vector3(-.39, -.105, 0);
  const normalAxis = new THREE.Vector3(0, 0, 1);
  const flowDirection = new THREE.Vector3(1, .08, 0);
  const armReference = new THREE.Vector3(0, 0, 1);
  let disposed = false;
  let visibleAmount = 1;

  const waterMaterials = [
    [skin, 'body'], [paleSkin, 'detail'], [eyeWhite, 'detail'], [pupilMaterial, 'detail'],
    [suckerMaterial, 'detail'], [funnelInner, 'detail'], [beakMaterial, 'detail'],
  ];
  if (waterUniforms) {
    for (const [material, part] of waterMaterials) applyFishWater(material, waterUniforms, part, DEFAULT_FISH_WATER_PROFILE);
  }

  const updateArm = (arm, armIndex, bodyPhase, effort, jet, turn) => {
    const phaseAtArm = bodyPhase * (.19 + armIndex % 3 * .025) + arm.phaseOffset;
    const exploration = .5 + .5 * Math.sin(phaseAtArm * .71 + armIndex * 1.3);
    const direction = arm.animatedDirection.copy(arm.direction).lerp(flowDirection, jet * (.78 + .08 * exploration)).normalize();
    const length = arm.length * (1 - jet * .13) * (1 + .035 * Math.sin(phaseAtArm));
    const positions = arm.geometry.attributes.position.array;
    const centerline = arm.centers;
    for (let segment = 0; segment <= segmentCount; segment++) {
      const along = segment / segmentCount;
      const bend = Math.sin(along * Math.PI);
      const localPhase = phaseAtArm + along * (3.1 + exploration * 1.2);
      const probing = Math.sin(localPhase + armIndex * .31);
      const curl = (Math.sin(localPhase * .72) * .075 + probing * .035 * exploration) * along;
      const sweep = (Math.sin(localPhase * .46 + along * 2.7) * .07 + turn * .09) * along * (1 - jet * .55);
      const point = centerline[segment];
      point.copy(armStart)
        .addScaledVector(direction, length * along)
        .addScaledVector(arm.curveAxis, curl + sweep)
        .addScaledVector(arm.tangent.set(0, 1, 0), bend * .055 * (1 - jet * .55));
      point.z += Math.sin(localPhase + along * 2.2) * .035 * along * (1 - jet * .4);
    }

    for (let segment = 0; segment <= segmentCount; segment++) {
      const previous = centerline[Math.max(0, segment - 1)];
      const next = centerline[Math.min(segmentCount, segment + 1)];
      const tangent = arm.tangent.subVectors(next, previous).normalize();
      arm.normal.crossVectors(tangent, armReference);
      if (arm.normal.lengthSq() < .001) arm.normal.set(0, 1, 0);
      arm.normal.normalize();
      arm.side.crossVectors(tangent, arm.normal).normalize();
      const along = segment / segmentCount;
      const radius = (.105 * (1 - along) ** 1.18 + .012) * (1 - jet * .08);
      const center = centerline[segment];
      for (let radialIndex = 0; radialIndex < radialCount; radialIndex++) {
        const theta = radialIndex / radialCount * Math.PI * 2;
        const offset = (segment * radialCount + radialIndex) * 3;
        positions[offset] = center.x + radius * (Math.cos(theta) * arm.normal.x + Math.sin(theta) * arm.side.x);
        positions[offset + 1] = center.y + radius * (Math.cos(theta) * arm.normal.y + Math.sin(theta) * arm.side.y);
        positions[offset + 2] = center.z + radius * (Math.cos(theta) * arm.normal.z + Math.sin(theta) * arm.side.z);
      }
    }
    arm.geometry.attributes.position.needsUpdate = true;
    arm.geometry.computeVertexNormals();
  };

  const updateSuckers = (bodyPhase, effort) => {
    let instance = 0;
    for (let armIndex = 0; armIndex < arms.length; armIndex++) {
      const arm = arms[armIndex];
      for (let sample = 0; sample < suckerStations; sample++) {
        const along = .26 + sample / Math.max(1, suckerStations - 1) * .63;
        const segment = Math.round(along * segmentCount);
        const center = arm.centers[segment];
        arm.tangent.subVectors(arm.centers[Math.min(segmentCount, segment + 1)], arm.centers[Math.max(0, segment - 1)]).normalize();
        arm.normal.copy(ventral).addScaledVector(arm.tangent, -ventral.dot(arm.tangent)).normalize();
        arm.side.crossVectors(arm.tangent, arm.normal).normalize();
        const radius = .022 * (1 - along * .5) * (1 + .06 * Math.sin(bodyPhase * .4 + arm.phaseOffset));
        for (const row of [-1, 1]) {
          suckerPosition.copy(center).addScaledVector(arm.normal, radius * .88).addScaledVector(arm.side, row * radius * .52);
          suckerOrientation.setFromUnitVectors(normalAxis, arm.normal);
          const pulse = .94 + .06 * (1 + Math.sin(bodyPhase * .35 + arm.phaseOffset + sample * .61)) * .5 * effort;
          const cupScale = radius / .022 * pulse;
          suckerScale.set(cupScale, cupScale, cupScale);
          suckerMatrix.compose(suckerPosition, suckerOrientation, suckerScale);
          suckers.setMatrixAt(instance++, suckerMatrix);
        }
      }
    }
    suckers.instanceMatrix.needsUpdate = true;
  };

  const update = (time, {
    power = .3, glow = .35, bodyPhase, bodyFrequency = .58, effort = .3, turn = 0, tetherLoad = 0, visibility = 1,
  } = {}) => {
    if (disposed) return;
    const phaseNow = Number.isFinite(bodyPhase) ? bodyPhase : time * bodyFrequency * Math.PI * 2 + phase;
    const exertion = clamp(effort, 0, 1);
    const propulsion = clamp(power, 0, 1);
    const jet = smoothstep(.62, .96, exertion) * smoothstep(.18, .72, propulsion);
    const steering = clamp(turn, -1, 1);
    const stress = Math.max(jet, clamp(tetherLoad, 0, 1) * .18);
    skin.color.copy(normalSkinColor).lerp(stressSkinColor, stress * .16);
    skin.roughness = .58 - stress * .035;
    for (let index = 0; index < arms.length; index++) updateArm(arms[index], index, phaseNow, exertion, jet, steering);
    updateSuckers(phaseNow, exertion);

    const breathing = Math.sin(phaseNow * .46) * (.012 + exertion * .008);
    mantle.scale.set(.73 * (1 + breathing), .43 * (1 + breathing), .4 * (1 + breathing));
    head.rotation.z = Math.sin(phaseNow * .16) * .025 + steering * .035;
    funnel.rotation.z = -Math.PI / 2 - .14 + jet * .18 + steering * .04;
    for (let index = 0; index < eyes.length; index++) eyes[index].rotation.y = (index ? -1 : 1) * (jet * .08 + steering * .035);

    visibleAmount = clamp(visibility, 0, 1);
    if (waterUniforms?.uFishVisibility) waterUniforms.uFishVisibility.value = visibleAmount;
    skin.emissiveIntensity = .025 + clamp(glow, 0, 1) * .008 + clamp(tetherLoad, 0, 1) * .003;
  };

  update(0, { bodyPhase: phase, power: .25, effort: .28 });
  return {
    group,
    update,
    get stats() {
      const triangles = [...geometries].reduce((sum, geometry) => sum + (geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0) / 3, 0);
      return { meshes: group.children.length, triangles };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      skinMottle.dispose();
      group.clear();
    },
  };
}
