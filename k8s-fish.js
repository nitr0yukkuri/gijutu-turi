import * as THREE from './vendor/three.module.js';

// A cluster-shaped fish: a heavy blue body, a Kubernetes helm, and three
// glowing pods connected like a small service mesh. It intentionally shares
// the same model API as Go魚 so the main catch scene can swap species safely.
const TAU = Math.PI * 2;

function triangleFin(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function addTracked(group, geometries, materials, geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  group.add(mesh);
  geometries.add(geometry);
  materials.add(material);
  return mesh;
}

function addLine(group, geometries, materials, points, material, name) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)));
  const line = new THREE.Line(geometry, material);
  line.name = name;
  line.frustumCulled = false;
  group.add(line);
  geometries.add(geometry);
  materials.add(material);
  return line;
}

export function createK8sFish({ detail = 'high', phase = 0 } = {}) {
  const low = detail === 'low';
  const group = new THREE.Group();
  group.name = 'K8s魚';
  const geometries = new Set();
  const materials = new Set();
  const fins = [];
  const pods = [];
  const basePodPositions = [];

  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x182c5c,
    emissive: 0x09256d,
    emissiveIntensity: 0.55,
    roughness: 0.31,
    metalness: 0.35,
    clearcoat: 0.55,
    clearcoatRoughness: 0.25,
  });
  const snoutMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x24417c,
    emissive: 0x0c2e8d,
    emissiveIntensity: 0.72,
    roughness: 0.25,
    metalness: 0.3,
    clearcoat: 0.5,
  });
  const finMaterial = new THREE.MeshStandardMaterial({
    color: 0x3978e6,
    emissive: 0x1654d1,
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const darkMaterial = new THREE.MeshPhysicalMaterial({ color: 0x020718, roughness: 0.18, clearcoat: 0.5 });
  const cyanMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.8, 2.7), toneMapped: false });
  const violetMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.28, 0.18, 2.2), toneMapped: false });
  const helmMaterial = new THREE.MeshStandardMaterial({ color: 0x5f93ff, emissive: 0x1b4ccc, emissiveIntensity: 1.1, metalness: 0.65, roughness: 0.24 });
  const linkMaterial = new THREE.LineBasicMaterial({ color: 0x70a3ff, transparent: true, opacity: 0.78 });
  const darkLineMaterial = new THREE.LineBasicMaterial({ color: 0x020718, transparent: true, opacity: 0.88 });
  [bodyMaterial, snoutMaterial, finMaterial, darkMaterial, cyanMaterial, violetMaterial, helmMaterial, linkMaterial, darkLineMaterial].forEach(material => materials.add(material));

  const body = addTracked(
    group,
    geometries,
    materials,
    new THREE.SphereGeometry(1, low ? 24 : 40, low ? 16 : 26),
    bodyMaterial,
    'cluster-body',
  );
  body.scale.set(1.58, 0.66, 0.84);

  const snout = addTracked(group, geometries, materials, new THREE.SphereGeometry(1, low ? 18 : 28, low ? 12 : 18), snoutMaterial, 'cluster-snout');
  snout.scale.set(0.5, 0.39, 0.51);
  snout.position.set(-1.32, -0.01, 0);

  addLine(group, geometries, materials, [[-1.72, -0.12, 0.42], [-1.46, -0.23, 0.58], [-1.22, -0.18, 0.64]], darkLineMaterial, 'cluster-mouth');

  const dorsal = addTracked(group, geometries, materials, triangleFin([[0.05, 0.47, 0], [0.48, 1.22, 0], [0.94, 0.58, 0], [0.56, 0.43, 0]]), finMaterial, 'cluster-dorsal');
  const ventral = addTracked(group, geometries, materials, triangleFin([[-0.05, -0.49, 0], [0.47, -1.0, 0], [0.9, -0.48, 0], [0.52, -0.39, 0]]), finMaterial, 'cluster-ventral');
  fins.push(dorsal, ventral);

  const tailTop = addTracked(group, geometries, materials, triangleFin([[1.25, 0.06, 0], [2.35, 0.92, 0], [2.06, 0.08, 0], [1.42, 0, 0]]), finMaterial, 'cluster-tail-upper');
  const tailBottom = addTracked(group, geometries, materials, triangleFin([[1.25, -0.06, 0], [2.35, -0.92, 0], [2.06, -0.08, 0], [1.42, 0, 0]]), finMaterial, 'cluster-tail-lower');
  fins.push(tailTop, tailBottom);

  for (const sign of [-1, 1]) {
    const pectoral = addTracked(group, geometries, materials, triangleFin([[-0.72, -0.08, 0.43 * sign], [-0.12, -0.55, 1.08 * sign], [0.42, -0.37, 0.86 * sign], [0.08, -0.16, 0.43 * sign]]), finMaterial, `cluster-pectoral-${sign}`);
    fins.push(pectoral);

    const eyeZ = 0.69 * sign;
    const eye = addTracked(group, geometries, materials, new THREE.SphereGeometry(0.16, low ? 12 : 20, low ? 10 : 16), darkMaterial, `cluster-eye-${sign}`);
    eye.scale.set(1, 1, 0.56);
    eye.position.set(-1.48, 0.17, eyeZ);
    const iris = addTracked(group, geometries, materials, new THREE.TorusGeometry(0.125, 0.014, 7, low ? 18 : 30), cyanMaterial, `cluster-iris-${sign}`);
    iris.position.set(-1.5, 0.17, eyeZ + 0.03 * sign);
    iris.rotation.x = Math.PI / 2;
    const glint = addTracked(group, geometries, materials, new THREE.SphereGeometry(0.026, 8, 6), cyanMaterial, `cluster-eye-glint-${sign}`);
    glint.position.set(-1.55, 0.23, eyeZ + 0.08 * sign);
  }

  // The helm is the species marker: a six-spoke wheel embedded in the flank.
  const helm = new THREE.Group();
  helm.name = 'kubernetes-helm';
  helm.position.set(-0.16, 0.03, 0.77);
  helm.rotation.x = Math.PI / 2;
  group.add(helm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, low ? 18 : 28), helmMaterial);
  ring.frustumCulled = false;
  helm.add(ring);
  geometries.add(ring.geometry);
  for (let index = 0; index < 6; index += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.25, 0.035), helmMaterial);
    spoke.rotation.z = index * TAU / 6;
    spoke.frustumCulled = false;
    helm.add(spoke);
    geometries.add(spoke.geometry);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), cyanMaterial);
  helm.add(hub);
  geometries.add(hub.geometry);

  // Three pods orbit the body and are joined by visible cluster links.
  for (let index = 0; index < 3; index += 1) {
    const x = -0.55 + index * 0.62;
    const y = 0.4 + Math.sin(index * 2.2) * 0.11;
    const z = 0.66 + Math.cos(index * 1.7) * 0.05;
    basePodPositions.push({ x, y, z });
    const pod = addTracked(group, geometries, materials, new THREE.DodecahedronGeometry(0.16, low ? 0 : 1), index === 1 ? violetMaterial : cyanMaterial, `cluster-pod-${index + 1}`);
    pod.position.set(x, y, z);
    pods.push(pod);
  }
  addLine(group, geometries, materials, basePodPositions.map(point => [point.x, point.y, point.z]), linkMaterial, 'cluster-service-link');
  addLine(group, geometries, materials, [[-0.16, 0.03, 0.77], [-0.55, 0.4, 0.66], [0.69, 0.51, 0.66]], linkMaterial, 'cluster-helm-link');

  let disposed = false;
  return {
    group,
    update(time, { power = 0.48, glow = 1 } = {}) {
      const swim = Math.sin(time * 2.3 + phase);
      const tailWave = Math.sin(time * 5.2 + phase) * (0.07 + power * 0.09);
      body.rotation.y = swim * 0.035;
      snout.rotation.y = swim * 0.05;
      tailTop.rotation.z = tailWave;
      tailBottom.rotation.z = -tailWave;
      fins.forEach((fin, index) => { fin.rotation.z = Math.sin(time * 3.1 + index * 1.8 + phase) * (0.025 + power * 0.045); });
      helm.rotation.z = time * 0.32 + phase;
      pods.forEach((pod, index) => {
        const base = basePodPositions[index];
        pod.position.y = base.y + Math.sin(time * 3 + index * 1.9 + phase) * 0.025;
        pod.scale.setScalar(0.93 + Math.sin(time * 2.7 + index) * 0.07 * glow);
      });
      bodyMaterial.emissiveIntensity = 0.45 + glow * 0.18;
      snoutMaterial.emissiveIntensity = 0.58 + glow * 0.22;
    },
    get stats() {
      return { meshes: group.children.length, triangles: [...geometries].reduce((total, geometry) => total + (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3, 0), materials: materials.size };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
}
