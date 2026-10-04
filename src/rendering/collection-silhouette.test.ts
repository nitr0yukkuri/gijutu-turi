// @ts-nocheck -- this test inspects vendored Three.js meshes and shader mocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCollectionSilhouette } from './collection-silhouette.js';
import { createDockerWhale } from './docker-whale.js';
import { createGoFish } from './go-fish.js';

function collectMeshes(root) {
  const meshes = [];
  root.traverse(object => { if (object.isMesh) meshes.push(object); });
  return meshes;
}

test('catalog silhouette keeps the species model and swimming shaders while hiding color', () => {
  const silhouetteFish = createGoFish({ detail: 'low', naturalSwim: true, visualProfile: 'rust' });
  const silhouetteCssFish = createGoFish({ detail: 'low', naturalSwim: true, visualProfile: 'css' });
  const normalFish = createGoFish({ detail: 'low', naturalSwim: true, visualProfile: 'rust' });

  try {
    const meshes = collectMeshes(silhouetteFish.group);
    const normalMaterials = collectMeshes(normalFish.group).map(mesh => mesh.material).flat();
    const geometryBefore = meshes.map(mesh => mesh.geometry);
    const cssFinMaterial = collectMeshes(silhouetteCssFish.group).map(mesh => mesh.material).flat().find(material => material.isShaderMaterial);
    const standardMaterial = meshes.map(mesh => mesh.material).flat().find(material => !material.isShaderMaterial);
    assert.ok(standardMaterial, 'the marlin has a lit body material');
    assert.ok(cssFinMaterial, 'CSS fish has a procedural fin material');

    applyCollectionSilhouette(silhouetteFish.group);
    applyCollectionSilhouette(silhouetteCssFish.group);

    assert.deepEqual(collectMeshes(silhouetteFish.group).map(mesh => mesh.geometry), geometryBefore);
    for (const material of meshes.map(mesh => mesh.material).flat()) {
      assert.equal(material.userData.collectionSilhouette, true);
      assert.equal(material.transparent, false);
      assert.equal(material.opacity, 1);
      assert.equal(material.depthWrite, true);
    }

    const standardShader = { uniforms: {}, fragmentShader: '#include <opaque_fragment>', vertexShader: '#include <begin_vertex>' };
    standardMaterial.onBeforeCompile(standardShader, {});
    assert.match(standardShader.fragmentShader, /uCollectionSilhouette/);
    assert.match(standardShader.fragmentShader, /vec3\(0\.002, 0\.006, 0\.009\)/);
    assert.match(standardShader.vertexShader, /swimPosition/);

    const finShader = { uniforms: {}, fragmentShader: cssFinMaterial.fragmentShader, vertexShader: cssFinMaterial.vertexShader };
    cssFinMaterial.onBeforeCompile(finShader, {});
    assert.match(finShader.fragmentShader, /mix\(color, vec3\(0\.002, 0\.006, 0\.009\), uCollectionSilhouette\)/);
    assert.match(finShader.fragmentShader, /mix\(alpha, 1\.0, uCollectionSilhouette\)/);
    assert.match(finShader.vertexShader, /swimPosition/);

    assert.notEqual(standardMaterial, normalMaterials.find(material => !material.isShaderMaterial), 'separate model instances own separate materials');
    assert.equal(normalMaterials.some(material => material.userData.collectionSilhouette), false);
  } finally {
    silhouetteFish.dispose();
    silhouetteCssFish.dispose();
    normalFish.dispose();
  }
});

test('Docker silhouette keeps the containers and removes only effect-only shadow and halos', () => {
  const whale = createDockerWhale({ detail: 'low' });
  try {
    const meshes = collectMeshes(whale.group);
    const bodyGeometry = meshes.find(mesh => mesh.name === 'sculpted-whale-body')?.geometry;
    assert.ok(meshes.some(mesh => mesh.name === 'batched-containers'));

    applyCollectionSilhouette(whale.group);

    assert.equal(meshes.find(mesh => mesh.name === 'cargo-contact-shadow')?.visible, false);
    assert.equal(meshes.filter(mesh => mesh.name.includes('status-halo')).every(mesh => !mesh.visible), true);
    assert.equal(meshes.filter(mesh => mesh.name === 'batched-containers').every(mesh => mesh.visible), true);
    assert.equal(meshes.find(mesh => mesh.name === 'sculpted-whale-body')?.geometry, bodyGeometry);
    assert.equal(meshes.filter(mesh => mesh.visible).every(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(material => material.userData.collectionSilhouette)), true);
  } finally {
    whale.dispose();
  }
});
