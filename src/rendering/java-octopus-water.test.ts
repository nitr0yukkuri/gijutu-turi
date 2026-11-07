// @ts-nocheck -- the test inspects vendored Three.js material shader wiring.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createJavaOctopus } from './java-octopus.js';

test('Java octopus binds its visibility and center to the underwater shader', () => {
  const model = createJavaOctopus({
    detail: 'low',
    waterUniforms: {
      uTime: { value: 0 },
      uRipples: { value: [] },
      uCamera: { value: null },
      uProjectionInverse: { value: null },
      uWaterBackdrop: { value: null },
      uWaterSize: { value: null },
    },
  });

  try {
    const mantle = model.group.getObjectByName('mantle');
    assert.ok(mantle?.material, 'the mantle carries the primary skin material');

    const shader = {
      uniforms: {},
      vertexShader: '#include <project_vertex>',
      fragmentShader: '#include <tonemapping_fragment>',
    };
    mantle.material.onBeforeCompile(shader, {});

    assert.equal(shader.uniforms.uFishCenter.value, model.group.position,
      'Snell refraction must use this octopus position');
    assert.equal(shader.uniforms.uFishVisibility.value, 1,
      'the water shader must start with the visible animal, not the background-only default');

    model.update(0, { visibility: .42 });
    assert.equal(shader.uniforms.uFishVisibility.value, .42,
      'the gradual approach reveal must reach the Java octopus water shader');
  } finally {
    model.dispose();
  }
});
