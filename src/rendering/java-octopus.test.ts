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
    assert.ok(headMaterial.emissiveIntensity >= .27, 'red pigment remains readable at the neutral swim state');
    const pigmentImage = headMaterial.map?.image as { data?: Uint8Array } | undefined;
    const pigmentPixels = pigmentImage?.data;
    if (!pigmentPixels || pigmentPixels.length === 0) {
      throw new Error('skin retains a procedural chromatophore texture');
    }
    assert.equal(headMaterial.map?.format, THREE.RGBAFormat, 'sRGB skin texture uses a supported RGBA format');
    assert.equal(pigmentPixels.length, 128 * 128 * 4, 'skin texture data uses four bytes per pixel');
    let darkestPigment = 255;
    let lightestPigment = 0;
    for (let offset = 0; offset < pigmentPixels.length; offset += 4) {
      const red = pigmentPixels[offset] ?? 0;
      darkestPigment = Math.min(darkestPigment, red);
      lightestPigment = Math.max(lightestPigment, red);
      const green = pigmentPixels[offset + 1] ?? 0;
      const blue = pigmentPixels[offset + 2] ?? 0;
      assert.equal(pigmentPixels[offset + 3], 255, 'skin texture pixels remain fully opaque');
      assert.ok(
        Math.max(red, green, blue) - Math.min(red, green, blue) <= 1,
        'the neutral texture modulates pigment without muting its red hue',
      );
    }
    assert.ok(lightestPigment - darkestPigment >= 70, 'skin mottle has enough contrast to read at fight distance');

    const arm = octopus.group.getObjectByName('arm-1');
    assert.ok(arm instanceof THREE.Mesh, 'animated arm mesh exists');
    const positionAttribute = arm.geometry.attributes.position;
    const uvAttribute = arm.geometry.attributes.uv;
    assert.ok(positionAttribute, 'arm geometry exposes a position buffer');
    assert.ok(uvAttribute, 'procedural skin texture has UVs on the arms');
    assert.equal(uvAttribute.count, positionAttribute.count, 'every arm vertex has a texture coordinate');
    const radialStride = Math.round(positionAttribute.count / 13);
    const rootCenter = (mesh: THREE.Mesh) => {
      const data = mesh.geometry.attributes.position.array;
      const count = Math.round(mesh.geometry.attributes.position.count / 13);
      const result = new THREE.Vector3();
      for (let index = 0; index < count; index++) {
        result.x += data[index * 3];
        result.y += data[index * 3 + 1];
        result.z += data[index * 3 + 2];
      }
      return result.multiplyScalar(1 / count);
    };
    const armMeshes = Array.from({ length: 8 }, (_, index) => octopus.group.getObjectByName(`arm-${index + 1}`))
      .filter((mesh): mesh is THREE.Mesh => mesh instanceof THREE.Mesh);
    assert.equal(armMeshes.length, 8, 'all eight arms are modeled separately');
    const rootCenters = armMeshes.map(rootCenter);
    for (let first = 0; first < rootCenters.length; first++) {
      for (let second = first + 1; second < rootCenters.length; second++) {
        assert.ok(rootCenters[first]!.distanceTo(rootCenters[second]!) > .06, 'each arm emerges from a distinct point around the crown');
      }
    }
    const uvValues = uvAttribute.array;
    assert.ok(Math.min(...uvValues) <= 0 && Math.max(...uvValues) >= 1, 'the seam wraps cleanly across the arm texture');
    const positions = positionAttribute.array;
    for (let ring = 0; ring <= 12; ring++) {
      const first = ring * radialStride * 3;
      const last = (ring * radialStride + radialStride - 1) * 3;
      const firstPoint = new THREE.Vector3(positions[first], positions[first + 1], positions[first + 2]);
      const lastPoint = new THREE.Vector3(positions[last], positions[last + 1], positions[last + 2]);
      assert.ok(firstPoint.distanceTo(lastPoint) < .00001, 'the UV seam closes without an open split');
    }
    const resting = Array.from(positions);
    octopus.update(1, { power: 1, effort: 1, tetherLoad: 0.8 });
    assert.notDeepEqual(Array.from(positions), resting, 'arms react to the jet and tension instead of freezing');
    const tipCenter = (data: Float32Array) => {
      const result = new THREE.Vector3();
      const start = 12 * radialStride;
      for (let index = start; index < start + radialStride; index++) {
        result.x += data[index * 3];
        result.y += data[index * 3 + 1];
        result.z += data[index * 3 + 2];
      }
      return result.multiplyScalar(1 / radialStride);
    };
    const ringRadius = (data: Float32Array, center: THREE.Vector3, start: number, count: number) => {
      let total = 0;
      for (let index = start; index < start + count; index++) {
        total += new THREE.Vector3(data[index * 3], data[index * 3 + 1], data[index * 3 + 2]).distanceTo(center);
      }
      return total / count;
    };
    const tip = tipCenter(positions);
    assert.ok(ringRadius(positions, tip, 12 * radialStride, radialStride) < .015, 'arm ends taper to soft points');
  } finally {
    octopus.dispose();
  }
});
