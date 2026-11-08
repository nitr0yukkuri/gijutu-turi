// @ts-nocheck -- imperative geometry animation at the vendored Three.js boundary.
import * as THREE from '../../vendor/three.module.js';
import { applyFishWater, JAVA_OCTOPUS_WATER_PROFILE } from './fish-water.js';

const ARM_COUNT = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
const smoothUnit = value => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

// A fast power stroke and slower recovery share zero velocity at each join.
const scullingStroke = (phase) => {
  const cycle = ((phase % TAU) + TAU) % TAU;
  const powerStroke = TAU * 0.31;
  if (cycle < powerStroke) return -.18 + smoothUnit(cycle / powerStroke) * 1.18;
  return 1 - smoothUnit((cycle - powerStroke) / (TAU - powerStroke)) * 1.18;
};

function createSkinMottle() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
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
      const pigment = broad * .38 + patch * .47 + fine * .15;
      const paleMottle = smoothstep(.18, .72, noise(x / 19 + 21, y / 22 - 8));
      const chromatophorePatch = smoothstep(.2, .78, noise(x / 8 + 14, y / 11 + 4));
      // Keep the procedural map neutral so it modulates skin relief without
      // multiplying away the red pigment carried by the material itself.
      const value = clamp(Math.round(216 + pigment * 38 + paleMottle * 12 - chromatophorePatch * 26), 172, 255);
      const offset = (y * size + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.65, 1.4);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createSkinRelief() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
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
      const broad = noise(x / 26, y / 31);
      const patch = noise(x / 9 + 4, y / 13 - 2);
      const micro = noise(x / 2.7 + 11, y / 3.1 - 7);
      const relief = clamp(Math.round(128 + broad * 23 + patch * 17 + micro * 8), 72, 184);
      const offset = (y * size + x) * 4;
      pixels[offset] = relief;
      pixels[offset + 1] = relief;
      pixels[offset + 2] = relief;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.65, 1.4);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createArmGeometry(segmentCount, radialCount) {
  const stride = radialCount + 1;
  const positions = new Float32Array((segmentCount + 1) * stride * 3);
  const uvs = new Float32Array((segmentCount + 1) * stride * 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const indices = [];
  for (let ring = 0; ring <= segmentCount; ring++) {
    for (let radial = 0; radial <= radialCount; radial++) {
      const vertex = ring * stride + radial;
      uvs[vertex * 2] = radial / radialCount;
      uvs[vertex * 2 + 1] = ring / segmentCount;
      if (ring === segmentCount || radial === radialCount) continue;
      const a = vertex;
      const b = vertex + 1;
      const c = vertex + stride + 1;
      const d = vertex + stride;
      indices.push(a, b, d, b, c, d);
    }
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createMantleGeometry(lowDetail) {
  const geometry = new THREE.SphereGeometry(1, lowDetail ? 20 : 32, lowDetail ? 14 : 22);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const rearTaper = smoothstep(0, 1, point.x);
    const crossSection = 1 - rearTaper * .2;
    point.y *= crossSection;
    point.z *= crossSection;
    point.x += rearTaper * .045;
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createJavaOctopus({ detail = 'high', phase = 0, waterUniforms = null } = {}) {
  const group = new THREE.Group();
  group.name = 'java-octopus';
  const habitatUniforms = waterUniforms
    ? {
        ...waterUniforms,
        uFishCenter: { value: group.position },
        uFishVisibility: { value: 1 },
      }
    : null;
  const lowDetail = detail === 'low';
  const segmentCount = lowDetail ? 14 : 28;
  const radialCount = lowDetail ? 6 : 10;
  const suckerStations = lowDetail ? 10 : 20;
  const geometries = new Set();
  const materials = new Set();
  const skinMottle = createSkinMottle();
  const skinRelief = createSkinRelief();
  const normalSkinColor = new THREE.Color(0xe84332);
  const stressSkinColor = new THREE.Color(0xf83226);
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xe84332,
    map: skinMottle,
    bumpMap: skinRelief,
    bumpScale: .018,
    roughness: .72,
    metalness: 0,
    clearcoat: .035,
    clearcoatRoughness: .7,
    // A restrained red pigment floor keeps skin readable under blue-green light.
    emissive: 0x88140b,
    emissiveIntensity: .17,
  });
  const headSkin = skin;
  const armSkin = skin;
  const paleSkin = new THREE.MeshPhysicalMaterial({
    color: 0xe9a08a,
    roughness: .65,
    clearcoat: .04,
    map: skinMottle,
    bumpMap: skinRelief,
    bumpScale: .012,
  });
  const webSkin = new THREE.MeshPhysicalMaterial({
    color: 0xe97864,
    map: skinMottle,
    bumpMap: skinRelief,
    bumpScale: .009,
    roughness: .74,
    clearcoat: .025,
    side: THREE.DoubleSide,
  });
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: 0xc8aa89, roughness: .48, clearcoat: .12 });
  const irisMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9b5839, roughness: .38, clearcoat: .14, clearcoatRoughness: .35 });
  const pupilMaterial = new THREE.MeshPhysicalMaterial({ color: 0x100d0b, roughness: .22, clearcoat: .45, clearcoatRoughness: .2 });
  const suckerMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd0a088, roughness: .56, clearcoat: .08 });
  const funnelInner = new THREE.MeshStandardMaterial({ color: 0x38271f, roughness: .72, side: THREE.DoubleSide });
  const beakMaterial = new THREE.MeshPhysicalMaterial({ color: 0x1b1714, roughness: .27, clearcoat: .38 });
  for (const material of [skin, paleSkin, webSkin, eyeWhite, irisMaterial, pupilMaterial, suckerMaterial, funnelInner, beakMaterial]) materials.add(material);

  const addMesh = (geometry, material, parent = group, name = '') => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };
  const sphere = new THREE.SphereGeometry(1, lowDetail ? 20 : 32, lowDetail ? 14 : 22);
  geometries.add(sphere);
  const mantle = addMesh(createMantleGeometry(lowDetail), skin, group, 'mantle');
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
  funnelOuter.position.y = .015;
  const funnelRim = addMesh(new THREE.TorusGeometry(.083, .015, 7, lowDetail ? 12 : 20), paleSkin, funnel, 'siphon-rim');
  funnelRim.rotation.x = -Math.PI / 2;
  funnelRim.position.y = .14;
  addMesh(new THREE.ConeGeometry(.072, .19, lowDetail ? 10 : 16, 1, true), funnelInner, funnel, 'siphon-interior')
    .position.y = .035;

  // Two lateral eyes with a forward-facing bias and glossy pupils.
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.name = side < 0 ? 'eye-left' : 'eye-right';
    eye.position.set(-.43, .015, side * .245);
    group.add(eye);
    const sclera = addMesh(new THREE.SphereGeometry(.074, 18, 14), eyeWhite, eye, 'eye-sclera');
    sclera.scale.set(1, .86, .74);
    const iris = addMesh(new THREE.SphereGeometry(.044, 16, 12), irisMaterial, eye, 'eye-iris');
    iris.position.set(-.026, .004, side * .051);
    iris.scale.set(.9, .82, .52);
    const pupil = addMesh(new THREE.SphereGeometry(.022, 12, 10), pupilMaterial, eye, 'eye-pupil');
    pupil.position.set(-.035, .004, side * .068);
    pupil.scale.set(.9, .42, .38);
    const glint = addMesh(new THREE.SphereGeometry(.007, 8, 6), eyeWhite, eye, 'eye-glint');
    glint.position.set(-.045, .018, side * .079);
    eyes.push(eye);
  }

  const beak = addMesh(new THREE.ConeGeometry(.055, .12, 8), beakMaterial, group, 'beak');
  beak.position.set(-.47, -.17, 0);
  beak.rotation.z = Math.PI / 2;
  beak.scale.set(.75, 1, .72);

  const armDirections = [
    [-1.15, -.12, .98], [-.95, .68, .72], [-.82, 1.0, .08], [-1.05, .72, -.78],
    [-1.24, .12, -.98], [-1.02, -.68, -.75], [-.86, -.98, -.1], [-1.08, -.7, .76],
  ];
  const armLengths = [3.12, 3.48, 3.72, 3.38, 3.08, 3.4, 3.78, 3.24];
  const arms = armDirections.map((values, index) => {
    const direction = new THREE.Vector3(...values).normalize();
    const armAzimuth = Math.atan2(direction.z, direction.y);
    const base = new THREE.Vector3(-.53, -.075 + Math.cos(armAzimuth) * .14, Math.sin(armAzimuth) * .17);
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
      base,
      curveAxis,
      secondaryAxis: new THREE.Vector3().crossVectors(direction, curveAxis).normalize(),
      // Adjacent arms move as four loose pairs; a slight lag avoids a rigid fan.
      phaseOffset: Math.floor(index / 2) * .3 + (index % 2) * .08,
      bendPhase: Math.floor(index / 2) * .36 + (index % 2) * .1,
      bendLocation: .32 + index % 4 * .09,
      waveRate: .82 + index % 4 * .025,
      tipCurl: .12 + index % 4 * .018,
      turnResponse: index % 2 === 0 ? 1 : .62,
      flowDrag: .48 + index % 3 * .11,
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
    new THREE.Vector2(.033, .008),
    new THREE.Vector2(.037, .018),
    new THREE.Vector2(.03, .026),
    new THREE.Vector2(.019, .017),
    new THREE.Vector2(0, .011),
  ];
  const suckerGeometry = new THREE.LatheGeometry(suckerProfile, lowDetail ? 10 : 16);
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
  const suckerAxis = new THREE.Vector3(0, 1, 0);
  const flowDirection = new THREE.Vector3(1, .08, 0);
  const armReference = new THREE.Vector3(0, 0, 1);
  let disposed = false;
  let visibleAmount = 1;
  let jetBlend = 0;
  let jetTransitionFrom = 0;
  let jetTransitionTarget = 0;
  let jetTransitionElapsed = 1;

  const waterMaterials = [
    [skin, 'body'], [webSkin, 'body'], [paleSkin, 'detail'], [eyeWhite, 'detail'], [irisMaterial, 'detail'], [pupilMaterial, 'detail'],
    [suckerMaterial, 'detail'], [funnelInner, 'detail'], [beakMaterial, 'detail'],
  ];
  if (habitatUniforms) {
    for (const [material, part] of waterMaterials) applyFishWater(material, habitatUniforms, part, JAVA_OCTOPUS_WATER_PROFILE);
  }

  const updateArm = (arm, armIndex, bodyPhase, effort, jet, turn, tetherLoad, tetherDirection) => {
    const phaseAtArm = bodyPhase * (.25 + arm.waveRate * .035) + arm.phaseOffset;
    const softLag = .92 + .08 * Math.sin(phaseAtArm * .5 + armIndex * .12);
    const direction = arm.animatedDirection.copy(arm.direction)
      .lerp(flowDirection, .08 + jet * .58)
      .normalize();
    const length = arm.length * (1 - jet * .1) * (1 + .018 * Math.sin(phaseAtArm));
    const hasTetherDirection = Boolean(tetherDirection && tetherDirection.lengthSq() > .001);
    const lineAlignment = hasTetherDirection ? clamp(arm.direction.dot(tetherDirection), -1, 1) : 0;
    const positions = arm.geometry.attributes.position.array;
    const centerline = arm.centers;
    for (let segment = 0; segment <= segmentCount; segment++) {
      const along = segment / segmentCount;
      const bend = Math.sin(along * Math.PI);
      const travelingPhase = along * 4.2 - bodyPhase * (.37 + arm.waveRate * .035) + arm.phaseOffset;
      const localPhase = phaseAtArm + along * 2.25;
      const tipWeight = smoothstep(.58, 1, along);
      const bendWindow = Math.exp(-(((along - arm.bendLocation) / .18) ** 2));
      const bendPulse = Math.sin(phaseAtArm * .72 + arm.bendPhase);
      const pathWave = (scullingStroke(travelingPhase + arm.bendPhase * .3)
        - scullingStroke(arm.phaseOffset + arm.bendPhase * .3)) * along;
      const secondaryWave = Math.sin(localPhase - along * 1.65) * along;
      const localizedBend = bendWindow * bendPulse
        * (.075 + effort * .075 + clamp(tetherLoad, 0, 1) * .06);
      const tipCurl = tipWeight * (arm.tipCurl + Math.sin(phaseAtArm * .4 + arm.bendPhase) * .03) * softLag;
      const curl = pathWave * (.13 + effort * .06) + secondaryWave * .045 + localizedBend + tipCurl;
      const sweep = (Math.sin(localPhase * .5 + along * 1.8) * .09 + turn * arm.turnResponse * .055)
        * along * (1 - jet * .7);
      const crossWave = ((Math.sin(travelingPhase * .72 + arm.bendPhase) * .07
        + Math.cos(localPhase * .5 + arm.bendPhase) * .025) * along + bendWindow * Math.cos(bendPulse) * .035)
        * (1 - jet * .65);
      const jetTrail = jet * (.3 + arm.flowDrag * .16) * Math.pow(along, 1.65);
      const point = centerline[segment];
      point.copy(arm.base)
        .addScaledVector(direction, length * along)
        .addScaledVector(arm.curveAxis, curl + sweep)
        .addScaledVector(arm.secondaryAxis, crossWave)
        .addScaledVector(flowDirection, jetTrail)
        .addScaledVector(arm.tangent.set(0, 1, 0), bend * (.035 + Math.sin(localPhase) * .018) * (1 - jet * .15));
      if (hasTetherDirection) {
        const tetherResponse = Math.max(0, lineAlignment) * .16 + Math.min(0, lineAlignment) * .06;
        point.addScaledVector(tetherDirection, tetherResponse * clamp(tetherLoad, 0, 1) * tipWeight * along);
      }
      point.z += Math.sin(localPhase * .83 + armIndex) * .03 * along;
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
      const musclePulse = Math.sin(bodyPhase * .55 - along * 4.5 + arm.phaseOffset) * Math.sin(Math.PI * along) * .025;
      // A muscular hydrostat shortens and thickens under contraction rather
      // than shrinking uniformly like an inflatable tube losing volume.
      const radius = (.135 * (1 - along) ** 1.42 + .007) * (1 + musclePulse + jet * .035);
      const center = centerline[segment];
      for (let radialIndex = 0; radialIndex <= radialCount; radialIndex++) {
        const theta = radialIndex / radialCount * Math.PI * 2;
        const offset = (segment * (radialCount + 1) + radialIndex) * 3;
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
        const armSurfaceRadius = (.135 * (1 - along) ** 1.42 + .007) * (1 + jet * .055);
        const radius = Math.min(.036 * (1 - along * .48), armSurfaceRadius * .4)
          * (1 + .04 * Math.sin(bodyPhase * .4 + arm.phaseOffset));
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
    power = .3, glow = .35, bodyPhase, bodyFrequency = .58, effort = .3, turn = 0, tetherLoad = 0,
    jetIntent, tetherDirection = null, styleDelta = 1 / 60, visibility = 1,
  } = {}) => {
    if (disposed) return;
    const phaseNow = Number.isFinite(bodyPhase) ? bodyPhase : time * bodyFrequency * Math.PI * 2 + phase;
    const exertion = clamp(effort, 0, 1);
    const propulsion = clamp(power, 0, 1);
    const jetTarget = Number.isFinite(jetIntent)
      ? clamp(jetIntent, 0, 1)
      : smoothstep(.50, .88, exertion) * smoothstep(.14, .66, propulsion);
    if (Math.abs(jetTarget - jetTransitionTarget) > .001) {
      jetTransitionFrom = jetBlend;
      jetTransitionTarget = jetTarget;
      jetTransitionElapsed = 0;
    }
    jetTransitionElapsed += clamp(styleDelta, 0, .1);
    const transitionDuration = jetTransitionTarget > jetTransitionFrom ? .55 : .72;
    const transitionProgress = smoothUnit(jetTransitionElapsed / transitionDuration);
    jetBlend = jetTransitionFrom + (jetTransitionTarget - jetTransitionFrom) * transitionProgress;
    const jet = jetBlend;
    const steering = clamp(turn, -1, 1);
    const chromatophore = clamp(Math.max(jet * .78, clamp(tetherLoad, 0, 1) * .62), 0, 1);
    skin.color.copy(normalSkinColor).lerp(stressSkinColor, chromatophore * .72);
    skin.roughness = .68 - chromatophore * .055;
    for (let index = 0; index < arms.length; index++) updateArm(arms[index], index, phaseNow, exertion, jet, steering, tetherLoad, tetherDirection);
    updateWeb();
    updateSuckers(phaseNow, exertion, jet);

    const breathing = Math.sin(phaseNow * .46) * (.024 + exertion * .01);
    // Mantle contraction precedes the siphon pulse; the soft transverse volume
    // expands slightly as the longitudinal axis shortens.
    const mantleContraction = jet * .095;
    mantle.scale.set(.73 * (1 + breathing - mantleContraction), .43 * (1 + breathing + mantleContraction * .28), .4 * (1 + breathing + mantleContraction * .28));
    head.rotation.z = Math.sin(phaseNow * .16) * .025 + steering * .035;
    funnel.rotation.z = -Math.PI / 2 - .14 + jet * .18 + steering * .04;
    for (let index = 0; index < eyes.length; index++) eyes[index].rotation.y = (index ? -1 : 1) * (jet * .08 + steering * .035);

    visibleAmount = clamp(visibility, 0, 1);
    if (habitatUniforms?.uFishVisibility) habitatUniforms.uFishVisibility.value = visibleAmount;
    skin.emissiveIntensity = .17 + clamp(glow, 0, 1) * .04 + clamp(tetherLoad, 0, 1) * .025;
  };

  update(0, { bodyPhase: phase, power: .25, effort: .28 });
  return {
    group,
    update,
    getInkEjectionPoint(position = new THREE.Vector3(), direction = new THREE.Vector3()) {
      group.updateMatrixWorld(true);
      // The funnel sits beneath the mantle. Emit just beyond its ventral
      // surface so depth-tested ink does not begin hidden inside the body.
      position.set(.255, -.46, 0).applyMatrix4(group.matrixWorld);
      direction.set(0, 1, 0).transformDirection(funnel.matrixWorld);
      return { position, direction };
    },
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
      skinRelief.dispose();
      group.clear();
    },
  };
}
