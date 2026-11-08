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
    const outletInBody = octopus.group.worldToLocal(origin.clone());
    const mantleInterior = ((outletInBody.x - .38) / .73) ** 2 + ((outletInBody.y - .045) / .43) ** 2;
    assert.ok(mantleInterior > 1, 'the ink outlet clears the mantle instead of starting inside the opaque mesh');

    const head = octopus.group.getObjectByName('head');
    assert.ok(head instanceof THREE.Mesh, 'octopus head mesh exists');
    const headMaterial = Array.isArray(head.material) ? head.material[0] : head.material;
    assert.ok(headMaterial instanceof THREE.MeshStandardMaterial, 'head uses a lit surface material');
    assert.ok(headMaterial.color.r > .75, 'red skin remains bright enough after sRGB conversion');
    assert.ok(headMaterial.color.r > headMaterial.color.g * 5, 'skin pigment stays strongly red');
    assert.ok(headMaterial.emissive.r > headMaterial.emissive.g * 6, 'subtle pigment compensation emits red rather than cyan');
    assert.ok(headMaterial.emissiveIntensity >= .17, 'red pigment remains readable without making the body glow');
    assert.ok(headMaterial.bumpMap instanceof THREE.Texture, 'skin has a subtle physical surface relief map');
    assert.ok(headMaterial.bumpScale >= .01 && headMaterial.bumpScale <= .025, 'micro-relief remains subtle at fight distance');
    const iris = octopus.group.getObjectByName('eye-iris');
    assert.ok(iris instanceof THREE.Mesh, 'the visible eye has a separate warm iris');
    const pupil = octopus.group.getObjectByName('eye-pupil');
    assert.ok(pupil instanceof THREE.Mesh, 'the eye keeps a distinct horizontal pupil');
    const suckers = octopus.group.getObjectByName('sucker-cups');
    assert.ok(suckers instanceof THREE.InstancedMesh);
    assert.equal(suckers.count, 160, 'mobile quality keeps two visible rows along all eight arms');
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
    const radialStride = Math.round(positionAttribute.count / 15);
    const centerAt = (armName: string, ring: number) => {
      const mesh = octopus.group.getObjectByName(armName);
      if (!(mesh instanceof THREE.Mesh)) throw new Error(`${armName} mesh is missing`);
      const ringPosition = mesh.geometry.getAttribute('position');
      if (!ringPosition) throw new Error(`${armName} position buffer is missing`);
      const data = ringPosition.array as Float32Array;
      const stride = Math.round(ringPosition.count / 15);
      const result = new THREE.Vector3();
      for (let index = 0; index < stride; index++) {
        const offset = (ring * stride + index) * 3;
        result.x += data[offset] ?? 0;
        result.y += data[offset + 1] ?? 0;
        result.z += data[offset + 2] ?? 0;
      }
      return result.multiplyScalar(1 / stride);
    };
    const rootCenter = (armName: string) => centerAt(armName, 0);
    const flowAxis = new THREE.Vector3(1, .08, 0).normalize();
    const fixedPhase = .7;
    const frameDelta = 1 / 60;
    const armTips = () => Array.from({ length: 8 }, (_, index) => centerAt(`arm-${index + 1}`, 14));
    const maximumTipStep = (beforeTips: THREE.Vector3[], afterTips: THREE.Vector3[]) => Math.max(
      ...afterTips.map((tip, index) => tip.distanceTo(beforeTips[index]!)),
    );
    octopus.update(1, { power: .25, effort: .28, bodyPhase: fixedPhase, jetIntent: 0, styleDelta: frameDelta });
    const restingTips = armTips();

    const firstSurgeTips = (() => {
      octopus.update(1, { power: 1, effort: 1, bodyPhase: fixedPhase, jetIntent: 1, styleDelta: frameDelta });
      return armTips();
    })();
    assert.ok(maximumTipStep(restingTips, firstSurgeTips) < .02,
      'jet posture eases in without an instant tentacle snap');
    for (let frame = 1; frame < 60; frame++) {
      octopus.update(1 + frame * frameDelta, { power: 1, effort: 1, bodyPhase: fixedPhase, jetIntent: 1, styleDelta: frameDelta });
    }
    const jetTips = armTips();
    let previousJetTips = jetTips;
    let maximumReleaseStep = 0;
    for (let frame = 0; frame < 60; frame++) {
      octopus.update(2 + frame * frameDelta, { power: .25, effort: .28, bodyPhase: fixedPhase, jetIntent: 0, styleDelta: frameDelta });
      const currentTips = armTips();
      maximumReleaseStep = Math.max(maximumReleaseStep, maximumTipStep(previousJetTips, currentTips));
      previousJetTips = currentTips;
    }
    assert.ok(maximumReleaseStep < .15, 'jet posture releases smoothly without a snap');
    for (let frame = 0; frame < 6; frame++) {
      octopus.update(3 + frame * .1, { power: 1, effort: 1, bodyPhase: fixedPhase, jetIntent: 1, styleDelta: .1 });
    }
    const settledJetTips = armTips();
    const downstreamShifts = settledJetTips.map(
      (tip, index) => tip.clone().sub(restingTips[index]!).dot(flowAxis),
    );
    assert.ok(downstreamShifts.every(shift => shift > .2), 'each arm streams toward the siphon wake under jet propulsion');
    const crownSpread = (tips: THREE.Vector3[]) => tips.reduce((sum, tip) => {
      const axial = flowAxis.clone().multiplyScalar(tip.dot(flowAxis));
      return sum + tip.clone().sub(axial).length();
    }, 0) / tips.length;
    assert.ok(crownSpread(settledJetTips) < crownSpread(restingTips) * .72,
      'the jet folds the crown into a streamlined bundle instead of preserving a radial star');
    const rootCenters = Array.from({ length: 8 }, (_, index) => rootCenter(`arm-${index + 1}`));
    for (let first = 0; first < rootCenters.length; first++) {
      for (let second = first + 1; second < rootCenters.length; second++) {
        assert.ok(rootCenters[first]!.distanceTo(rootCenters[second]!) > .06, 'each arm emerges from a distinct point around the crown');
      }
    }
    const uvValues = uvAttribute.array;
    assert.ok(Math.min(...uvValues) <= 0 && Math.max(...uvValues) >= 1, 'the seam wraps cleanly across the arm texture');
    const positions = positionAttribute.array as Float32Array;
    for (let ring = 0; ring <= 14; ring++) {
      const first = ring * radialStride * 3;
      const last = (ring * radialStride + radialStride - 1) * 3;
      const firstPoint = new THREE.Vector3(positions[first] ?? 0, positions[first + 1] ?? 0, positions[first + 2] ?? 0);
      const lastPoint = new THREE.Vector3(positions[last] ?? 0, positions[last + 1] ?? 0, positions[last + 2] ?? 0);
      assert.ok(firstPoint.distanceTo(lastPoint) < .00001, 'the UV seam closes without an open split');
    }
    const resting = Array.from(positions);
    octopus.update(4, { power: .25, effort: .28, bodyPhase: 1.2, jetIntent: 0, tetherLoad: 0 });
    const slackTips = armTips();
    const tetherDirection = new THREE.Vector3(0, 0, 1);
    octopus.update(4, { power: .25, effort: .28, bodyPhase: 1.2, jetIntent: 0, tetherLoad: .8, tetherDirection });
    const tautTips = armTips();
    const towardLine = tautTips[0]!.clone().sub(slackTips[0]!).dot(tetherDirection);
    const awayFromLine = tautTips[4]!.clone().sub(slackTips[4]!).dot(tetherDirection);
    assert.ok(towardLine > awayFromLine + .03,
      'the line-facing arm responds toward the tether more than the opposite arm');
    assert.notDeepEqual(Array.from(positions), resting, 'arms react to the jet and tension instead of freezing');
    const armStart = centerAt('arm-1', 0);
    const armEnd = centerAt('arm-1', 14);
    let maximumChordDeviation = 0;
    for (let ring = 1; ring < 14; ring++) {
      const center = centerAt('arm-1', ring);
      const straightPoint = armStart.clone().lerp(armEnd, ring / 14);
      maximumChordDeviation = Math.max(maximumChordDeviation, center.distanceTo(straightPoint));
    }
    assert.ok(maximumChordDeviation > .09, 'the arm develops a visible localized bend instead of staying needle-straight');
    const tipCenter = (data: Float32Array) => {
      const result = new THREE.Vector3();
      const start = 14 * radialStride;
      for (let index = start; index < start + radialStride; index++) {
        result.x += data[index * 3] ?? 0;
        result.y += data[index * 3 + 1] ?? 0;
        result.z += data[index * 3 + 2] ?? 0;
      }
      return result.multiplyScalar(1 / radialStride);
    };
    const ringRadius = (data: Float32Array, center: THREE.Vector3, start: number, count: number) => {
      let total = 0;
      for (let index = start; index < start + count; index++) {
        total += new THREE.Vector3(data[index * 3] ?? 0, data[index * 3 + 1] ?? 0, data[index * 3 + 2] ?? 0).distanceTo(center);
      }
      return total / count;
    };
    const tip = tipCenter(positions);
    assert.ok(ringRadius(positions, tip, 14 * radialStride, radialStride) < .015, 'arm ends taper to soft points');
  } finally {
    octopus.dispose();
  }
});
