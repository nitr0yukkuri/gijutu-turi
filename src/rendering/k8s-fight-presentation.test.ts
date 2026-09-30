import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K8S_ECHO_COUNT, k8sFightPresentation } from './k8s-fight-presentation.js';

test('K8S has two echoes, matching the species description', () => {
  assert.equal(K8S_ECHO_COUNT, 2);
});

test('K8S reveal follows line distance without a visibility jump at the bite', () => {
  const bite = .58;
  const far = k8sFightPresentation('fighting', 60, 'surge');
  const mid = k8sFightPresentation('fighting', 24, 'surge');
  const close = k8sFightPresentation('fighting', 4, 'surge');

  assert.ok(far.bodyVisibility < mid.bodyVisibility);
  assert.ok(mid.bodyVisibility < close.bodyVisibility);
  assert.ok(far.bodyVisibility < bite + .01, 'a far hook remains a silhouette');
  assert.ok(mid.bodyVisibility > bite, 'the body clarifies as the fish comes closer');
  assert.equal(close.bodyVisibility, 1);
});

test('K8S echo copies are faint at range, fan out on surges, then gather on warning', () => {
  const farRest = k8sFightPresentation('fighting', 60, 'rest');
  const closeRest = k8sFightPresentation('fighting', 5, 'rest');
  const closeSurge = k8sFightPresentation('fighting', 5, 'surge');
  const closeSplit = k8sFightPresentation('fighting', 5, 'split');
  const closeWarning = k8sFightPresentation('fighting', 5, 'warning');

  assert.ok(Math.abs(farRest.echoVisibility - .00216) < 1e-12);
  assert.ok(closeRest.echoVisibility > farRest.echoVisibility);
  assert.ok(closeSurge.echoVisibility > closeRest.echoVisibility);
  assert.ok(closeSplit.echoVisibility > closeSurge.echoVisibility);
  assert.ok(closeSplit.echoSpread > closeSurge.echoSpread);
  assert.ok(closeWarning.echoSpread < closeRest.echoSpread, 'the copies gather before the landing');
  assert.ok(closeSplit.wakeGain > closeSurge.wakeGain, 'the surface lunge makes the strongest trace');
});

test('K8S replicas stay absent before the fight and preserve a compact landing pose', () => {
  const waiting = k8sFightPresentation('waiting', 20, 'rest');
  const caught = k8sFightPresentation('caught', 2, 'warning');

  assert.equal(waiting.echoVisibility, 0);
  assert.equal(caught.bodyVisibility, 1);
  assert.ok(caught.echoVisibility > 0);
  assert.equal(caught.echoSpread, .56);
});
