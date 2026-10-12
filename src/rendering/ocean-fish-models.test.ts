import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../vendor/three.module.js';
import { K8S_ECHO_COUNT } from './k8s-fight-presentation.js';
import { createOceanFishModels } from './ocean-fish-models.js';

const createStore = () => createOceanFishModels(new THREE.Scene(), undefined, () => ({}));

const waitFor = async (predicate: () => boolean, timeoutMs = 5000) => {
  const expiresAt = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= expiresAt) throw new Error('Timed out waiting for optional fish models');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

test('loads the Go fight fish before preparing its school a model at a time', async () => {
  const models = createStore();
  try {
    const firstRequest = models.requestFightModel('fish-001');
    assert.equal(models.requestFightModel('fish-001'), firstRequest);
    await firstRequest;

    assert.ok(models.fightFish());
    assert.equal(models.schoolFish.length, 0);
    await waitFor(() => models.schoolFish.length === 6);
  } finally {
    models.dispose();
  }
});

test('prepares CSS trails and K8s echoes after their lead fish is ready', async () => {
  const cssModels = createStore();
  try {
    await cssModels.requestFightModel('css-001');
    assert.ok(cssModels.cssFish());
    assert.equal(cssModels.cssFishAfterimages.length, 0);
    await waitFor(() => cssModels.cssFishAfterimages.length === 2);
  } finally {
    cssModels.dispose();
  }

  const k8sModels = createStore();
  try {
    await k8sModels.requestFightModel('k8s-001');
    assert.ok(k8sModels.clusterFish);
    assert.equal(k8sModels.clusterEchoes.length, 0);
    await waitFor(() => k8sModels.clusterEchoes.length === K8S_ECHO_COUNT);
    assert.equal(k8sModels.clusterEchoMotion.length, K8S_ECHO_COUNT);
  } finally {
    k8sModels.dispose();
  }
});

test('disposal cancels queued optional fish model preparation', async () => {
  const models = createStore();
  await models.requestFightModel('fish-001');
  models.dispose();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(models.schoolFish.length, 0);
});
