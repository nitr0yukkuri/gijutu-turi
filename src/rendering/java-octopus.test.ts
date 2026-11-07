import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../vendor/three.module.js';
import { createJavaOctopus } from './java-octopus.js';

test('Java octopus has a backward-facing siphon ejection point and jet-responsive arms', () => {
  const octopus = createJavaOctopus({ detail: 'low', phase: 0.7 });
  try {
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const point = octopus.getInkEjectionPoint(origin, direction);
    assert.equal(point.position, origin);
    assert.equal(point.direction, direction);
    assert.ok([origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite));
    assert.ok(direction.x > 0.9, 'siphon exhaust points backward from the head');

    const head = octopus.group.getObjectByName('head');
    assert.ok(head instanceof THREE.Mesh, 'octopus head mesh exists');
    const headMaterial = Array.isArray(head.material) ? head.material[0] : head.material;
    assert.ok(headMaterial instanceof THREE.MeshStandardMaterial, 'head uses a lit surface material');
    assert.ok(headMaterial.color.r > .75, 'red skin remains bright enough after sRGB conversion');
    assert.ok(headMaterial.color.r > headMaterial.color.g * 5, 'skin pigment stays strongly red');
    const pigmentPixels = headMaterial.map?.image?.data;
    assert.ok(pigmentPixels?.length > 0, 'skin retains a procedural chromatophore texture');
    for (let offset = 0; offset < pigmentPixels.length; offset += 3) {
      assert.ok(
        Math.max(pigmentPixels[offset], pigmentPixels[offset + 1], pigmentPixels[offset + 2])
          - Math.min(pigmentPixels[offset], pigmentPixels[offset + 1], pigmentPixels[offset + 2]) <= 1,
        'the neutral texture modulates pigment without muting its red hue',
      );
    }

    const arm = octopus.group.getObjectByName('arm-1');
    assert.ok(arm instanceof THREE.Mesh, 'animated arm mesh exists');
    const positionAttribute = arm.geometry.attributes.position;
    assert.ok(positionAttribute, 'arm geometry exposes a position buffer');
    const positions = positionAttribute.array;
    const resting = Array.from(positions);
    octopus.update(1, { power: 1, effort: 1, tetherLoad: 0.8 });
    assert.notDeepEqual(Array.from(positions), resting, 'arms react to the jet and tension instead of freezing');
  } finally {
    octopus.dispose();
  }
});
