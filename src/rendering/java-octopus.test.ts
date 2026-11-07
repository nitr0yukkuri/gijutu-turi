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
    assert.ok(headMaterial.emissive.r > headMaterial.emissive.g * 6, 'subtle pigment compensation emits red rather than cyan');
    assert.ok(headMaterial.emissiveIntensity >= .22, 'red pigment remains readable at the neutral swim state');
    const pigmentImage = headMaterial.map?.image as { data?: Uint8Array } | undefined;
    const pigmentPixels = pigmentImage?.data;
    if (!pigmentPixels || pigmentPixels.length === 0) {
      throw new Error('skin retains a procedural chromatophore texture');
    }
    assert.equal(headMaterial.map?.format, THREE.RGBAFormat, 'sRGB skin texture uses a supported RGBA format');
    assert.equal(pigmentPixels.length, 128 * 128 * 4, 'skin texture data uses four bytes per pixel');
    for (let offset = 0; offset < pigmentPixels.length; offset += 4) {
      const red = pigmentPixels[offset] ?? 0;
      const green = pigmentPixels[offset + 1] ?? 0;
      const blue = pigmentPixels[offset + 2] ?? 0;
      assert.equal(pigmentPixels[offset + 3], 255, 'skin texture pixels remain fully opaque');
      assert.ok(
        Math.max(red, green, blue) - Math.min(red, green, blue) <= 1,
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
