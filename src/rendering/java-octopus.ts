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
  const size = 128;
  const pixels = new Uint8Array(size * size * 3);
  const hash = (x, y) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return (value - Math.floor(value)) * 2 - 1;
  };
  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smoothstep(0, 1, x - x0);
    const ty = smoothstep(0, 1, y - y0);
    const top = hash(x0, y0) * (1 - tx) + hash(x0 + 1, y0) * tx;
    const bottom = hash(x0, y0 + 1) * (1 - tx) + hash(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const broad = noise(x / 34, y / 29);
      const patch = noise(x / 13 + 7, y / 16 - 3);
      const fine = noise(x / 3.5, y / 3.5);
      const pigment = broad * .4 + patch * .45 + fine * .15;
      const paleMottle = smoothstep(.18, .72, noise(x / 19 + 21, y / 22 - 8));
      const red = clamp(Math.round(215 + pigment * 22 + paleMottle * 5), 176, 248);
      const offset = (y * size + x) * 3;
      pixels[offset] = red;
      pixels[offset + 1] = clamp(Math.round(red - 10 - paleMottle * 8), 145, 239);
      pixels[offset + 2] = clamp(Math.round(red - 19 - paleMottle * 11), 132, 230);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.15, 1.15);
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
  const suckerStations = lowDetail ? 8 : 16;
  const geometries = new Set();
  const materials = new Set();
  const skinMottle = createSkinMottle();
  const normalSkinColor = new THREE.Color(0x9b5948);
  const stressSkinColor = new THREE.Color(0x794238);
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0x9b5948,
    map: skinMottle,
    roughness: .68,
    metalness: 0,
    clearcoat: .06,
    clearcoatRoughness: .66,
    emissive: 0x1a0d08,
    emissiveIntensity: .045,
    side: THREE.DoubleSide,
  });
  const headSkin = skin;
  const armSkin = skin;
  const paleSkin = new THREE.MeshPhysicalMaterial({
    color: 0xc58b73,
    roughness: .65,
    clearcoat: .04,
    map: skinMottle,
  });
  const webSkin = new THREE.MeshPhysicalMaterial({
    color: 0xb87863,
    map: skinMottle,
    roughness: .7,
    clearcoat: .035,
    side: THREE.DoubleSide,
  });
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: 0xc8aa89, roughness: .48, clearcoat: .12 });
  const pupilMaterial = new THREE.MeshPhysicalMaterial({ color: 0x100d0b, roughness: .22, clearcoat: .45, clearcoatRoughness: .2 });
  const suckerMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc99780, roughness: .62, clearcoat: .04 });
  const funnelInner = new THREE.MeshStandardMaterial({ color: 0x38271f, roughness: .72, side: THREE.DoubleSide });
  const beakMaterial = new THREE.MeshPhysicalMaterial({ color: 0x1b1714, roughness: .27, clearcoat: .38 });
  for (const material of [skin, paleSkin, webSkin, eyeWhite, pupilMaterial, suckerMaterial, funnelInner, beakMaterial]) materials.add(material);

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
    const sclera = addMesh(new THREE.SphereGeometry(.07, 18, 14), eyeWhite, eye, 'eye-sclera');
    sclera.scale.set(1, .84, .74);
    const iris = addMesh(new THREE.SphereGeometry(.039, 16, 12), pupilMaterial, eye, 'eye-pupil');
    iris.position.set(-.026, .004, side * .042);
    iris.scale.set(.86, .9, .58);
    const glint = addMesh(new THREE.SphereGeometry(.009, 8, 6), eyeWhite, eye, 'eye-glint');
    glint.position.set(-.032, .02, side * .061);
    eyes.push(eye);
  }

  const beak = addMesh(new THREE.ConeGeometry(.055, .12, 8), beakMaterial, group, 'beak');
  beak.position.set(-.47, -.17, 0);
  beak.rotation.z = Math.PI / 2;
  beak.scale.set(.75, 1, .72);

  const armDirections = [
    [-1.0, -.84, -.72], [-1.12, -.62, .82], [-1.28, -.34, -.55], [-1.38, -.05, .9],
    [-1.34, .24, -.88], [-1.18, .52, .63], [-.98, .83, -.7], [-.8, .65, .96],
  ];
  const armLengths = [2.78, 3.18, 3.48, 3.72, 3.54, 2.94, 3.38, 3.08];
  const arms = armDirections.map((values, index) => {
    const direction = new THREE.Vector3(...values).normalize();
    const curveAxis = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1));
    if (curveAxis.lengthSq() < .001) curveAxis.set(0, 1, 0);
    curveAxis.normalize();
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
      length: armLengths[index],
      animatedDirection: new THREE.Vector3(),
      geometry,
      centers: Array.from({ length: segmentCount + 1 }, () => new THREE.Vector3()),
      tangent: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      side: new THREE.Vector3(),
    };
  });

  const webSegmentCount = Math.max(3, Math.round(segmentCount * .24));
  const webRingSize = webSegmentCount + 1;
  const webPositions = new Float32Array(ARM_COUNT * webRingSize * 3);
  const webIndices = [];
  for (let armIndex = 0; armIndex < ARM_COUNT; armIndex++) {
    const current = armIndex * webRingSize;
    const next = ((armIndex + 1) % ARM_COUNT) * webRingSize;
    for (let segment = 0; segment < webSegmentCount; segment++) {
      const a0 = current + segment;
      const a1 = a0 + 1;
      const b0 = next + segment;
      const b1 = b0 + 1;
      webIndices.push(a0, a1, b1, a0, b1, b0);
    }
  }
  const webGeometry = new THREE.BufferGeometry();
  webGeometry.setAttribute('position', new THREE.BufferAttribute(webPositions, 3).setUsage(THREE.DynamicDrawUsage));
  webGeometry.setIndex(webIndices);
  const webMesh = addMesh(webGeometry, webSkin, group, 'interbrachial-web');
  webMesh.frustumCulled = false;

  const suckerProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(.02, .002),
    new THREE.Vector2(.032, .009),
    new THREE.Vector2(.034, .019),
    new THREE.Vector2(.027, .024),
    new THREE.Vector2(.018, .014),
    new THREE.Vector2(0, .011),
  ];
  const suckerGeometry = new THREE.LatheGeometry(suckerProfile, lowDetail ? 8 : 12);
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
  const suckerAxis = new THREE.Vector3(0, 1, 0);
  const flowDirection = new THREE.Vector3(1, .08, 0);
  const armReference = new THREE.Vector3(0, 0, 1);
  let disposed = false;
  let visibleAmount = 1;

  const waterMaterials = [
    [skin, 'body'], [webSkin, 'body'], [paleSkin, 'detail'], [eyeWhite, 'detail'], [pupilMaterial, 'detail'],
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
      const travelingPhase = along * 5.1 - bodyPhase * .58 + arm.phaseOffset;
      const localPhase = phaseAtArm + along * (3.1 + exploration * 1.2);
      const probing = Math.sin(travelingPhase + armIndex * .31);
      const tipWeight = smoothstep(.68, 1, along);
      const restingCurl = Math.sin(arm.phaseOffset * 1.17) * .16;
      const curl = (probing * .14 + Math.sin(travelingPhase * .61 + armIndex) * .045) * along
        + tipWeight * (restingCurl + Math.sin(bodyPhase * .31 + arm.phaseOffset) * .12) * exploration;
      const sweep = (Math.sin(localPhase * .46 + along * 2.7) * .13 + turn * .09) * along * (1 - jet * .55);
      const point = centerline[segment];
      point.copy(armStart)
        .addScaledVector(direction, length * along)
        .addScaledVector(arm.curveAxis, curl + sweep)
        .addScaledVector(arm.tangent.set(0, 1, 0), bend * (.07 + probing * .025) * (1 - jet * .55));
      point.z += (Math.sin(travelingPhase * .72 + armIndex) * .12 + Math.sin(localPhase) * .035) * along * (1 - jet * .4);
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
      const radius = (.13 * (1 - along) ** 1.18 + .02) * (1 - jet * .08);
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

  const updateWeb = () => {
    let vertex = 0;
    for (const arm of arms) {
      for (let segment = 0; segment <= webSegmentCount; segment++) {
        const point = arm.centers[segment];
        const offset = vertex++ * 3;
        webPositions[offset] = point.x;
        webPositions[offset + 1] = point.y;
        webPositions[offset + 2] = point.z;
      }
    }
    webGeometry.attributes.position.needsUpdate = true;
    webGeometry.computeVertexNormals();
  };

  const updateSuckers = (bodyPhase, effort, jet) => {
    let instance = 0;
    for (let armIndex = 0; armIndex < arms.length; armIndex++) {
      const arm = arms[armIndex];
      for (let sample = 0; sample < suckerStations; sample++) {
        const along = .28 + sample / Math.max(1, suckerStations - 1) * .61;
        const segment = Math.round(along * segmentCount);
        const center = arm.centers[segment];
        arm.tangent.subVectors(arm.centers[Math.min(segmentCount, segment + 1)], arm.centers[Math.max(0, segment - 1)]).normalize();
        arm.normal.copy(ventral).addScaledVector(arm.tangent, -ventral.dot(arm.tangent)).normalize();
        arm.side.crossVectors(arm.tangent, arm.normal).normalize();
        const radius = .034 * (1 - along * .38) * (1 + .04 * Math.sin(bodyPhase * .4 + arm.phaseOffset));
        const armSurfaceRadius = (.13 * (1 - along) ** 1.18 + .02) * (1 - jet * .08);
        for (const row of [-1, 1]) {
          const rowOffset = row * radius * .72;
          const surfaceOffset = Math.sqrt(Math.max(0, armSurfaceRadius ** 2 - rowOffset ** 2)) + .003;
          suckerPosition.copy(center).addScaledVector(arm.normal, surfaceOffset).addScaledVector(arm.side, rowOffset);
          suckerOrientation.setFromUnitVectors(suckerAxis, arm.normal);
          const pulse = .96 + .04 * (1 + Math.sin(bodyPhase * .35 + arm.phaseOffset + sample * .61)) * .5 * effort;
          const cupScale = radius / .034 * pulse;
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
    skin.roughness = .68 - stress * .025;
    for (let index = 0; index < arms.length; index++) updateArm(arms[index], index, phaseNow, exertion, jet, steering);
    updateWeb();
    updateSuckers(phaseNow, exertion, jet);

    const breathing = Math.sin(phaseNow * .46) * (.024 + exertion * .01);
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
