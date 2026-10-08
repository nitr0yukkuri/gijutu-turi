import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoFish } from './go-fish.js';

type MeshWithPositions = {
  name: string;
  geometry: { attributes: { position: { array: ArrayLike<number> } } };
  material: { customProgramCacheKey: () => string };
};

test('JavaScript species is presented as a spotted ma-anago with fins reaching its pointed tail', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'eel' });
  try {
    assert.equal(model.group.name, 'JS Anago');
    const bounds = (name: string) => {
      const mesh = model.group.children.find(child => child.name === name) as MeshWithPositions | undefined;
      assert.ok(mesh, `${name} should remain an individual fin surface`);
      const positions = mesh.geometry.attributes.position.array;
      const result = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      for (let i = 0; i < positions.length; i += 3) {
        result.minX = Math.min(result.minX, positions[i]!);
        result.maxX = Math.max(result.maxX, positions[i]!);
        result.minY = Math.min(result.minY, positions[i + 1]!);
        result.maxY = Math.max(result.maxY, positions[i + 1]!);
      }
      return result;
    };

    for (const finName of ['eel-dorsal', 'eel-anal']) {
      const fin = bounds(finName);
      assert.ok(fin.maxX > 2.3, `${finName} should meet the pointed tail`);
      assert.ok(fin.maxY - fin.minY < .6, `${finName} should remain a low fin fold, not a large streamer`);
    }
    const spots = model.group.children.find(child => child.name === 'merged-anago-lateral-spots') as MeshWithPositions | undefined;
    assert.ok(spots, 'the natural pale flank spots should be present independently of JavaScript event accents');
    assert.match(spots.material.customProgramCacheKey(), /-eel$/, 'the spots should use the same server-synced body deformation shader');

    const bodyMaterial = model.body.material as unknown as { onBeforeCompile: (shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }) => void };
    const shader = {
      uniforms: {},
      vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <color_fragment>\n#include <emissivemap_fragment>\n#include <normal_fragment_maps>',
    };
    bodyMaterial.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /float scaleMask = 0\.0;/, 'the body should not retain the geometric eel-scale pattern');
    assert.match(shader.fragmentShader, /float dorsal = smoothstep\(-\.04, \.16, vFishLocal\.y\);/);
    assert.match(shader.fragmentShader, /mix\(vec3\(\.68,\.43,\.075\), vec3\(\.34,\.20,\.025\), dorsal\)/, 'the JavaScript anago should keep its golden body identity');
    assert.match(shader.fragmentShader, /float paleBelly = 1\.0 - smoothstep\(-\.24,\.08,vFishLocal\.y\);/);
    assert.match(shader.fragmentShader, /vec3\(\.88,\.72,\.40\)/, 'the underside should stay creamy rather than muddy brown');
  } finally {
    model.dispose();
  }
});

test('JS anago glows gold only on the server-synchronized high-effort fight beat', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'eel' });
  try {
    const body = model.group.children.find(child => child.name === 'sculpted-body') as
      | { material: { onBeforeCompile: (shader: { uniforms: Record<string, { value: number }>; vertexShader: string; fragmentShader: string }) => void } }
      | undefined;
    assert.ok(body);
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <color_fragment>\n#include <emissivemap_fragment>\n#include <normal_fragment_maps>',
    };
    body.material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /float anagoBurstGlow = smoothstep\(\.62,\.84,uEffort\);/);
    assert.match(shader.fragmentShader, /anagoGlowPulse = \.55 \+ \.45\*sin\(swimPhase\(\)\*1\.6-vFishLocal\.x\*2\.3\)/);
    assert.match(shader.fragmentShader, /vec3\(1\.0,\.55,\.04\)\*anagoBurstGlow\*anagoGlowPulse/);

    model.update(1, { effort: .3 });
    assert.equal(shader.uniforms.uEffort?.value, .3, 'rest effort should stay below the glow threshold');
    model.update(1.1, { effort: .9 });
    assert.equal(shader.uniforms.uEffort?.value, .9, 'the synchronized surge effort should reach the glow shader');

    const fin = model.fins[0] as { material: { fragmentShader: string } };
    assert.match(fin.material.fragmentShader, /smoothstep\(\.62,\.84,uEffort\)/, 'the thin fins should share the gold surge glow');
  } finally {
    model.dispose();
  }
});

test('anago fin fragments define and share the authoritative swim clock in both habitats', () => {
  for (const detail of ['low', 'high']) for (const submerged of [false, true]) {
    const model = createGoFish({ detail, visualProfile: 'eel', ...(submerged ? { waterUniforms: { uWaterBackdrop: { value: null } } } : {}) });
    try {
      const fins = model.fins as unknown as Array<{ material: { fragmentShader: string; uniforms: Record<string, { value: number }> } }>;
      assert.ok(fins.length > 0);
      for (const fin of fins) {
        const fragment = fin.material.fragmentShader;
        assert.match(fragment, /uniform float uSwimTime;/);
        assert.match(fragment, /uniform float uSwimFrequency;/);
        assert.match(fragment, /float swimPhase\s*\(\)\s*{\s*return\s+uSwimTime\s*\*\s*uSwimFrequency;\s*}/, 'a vertex-only helper cannot be called by the fin fragment');
        assert.equal((fragment.match(/float swimPhase\s*\(/g) ?? []).length, 1, 'the fin fragment must define its swim clock exactly once');
        assert.ok(fragment.indexOf('float swimPhase()') < fragment.indexOf('void main()'));
      }
      for (const bodyPhase of [1.25, 4.5]) {
        const motion = { bodyPhase, bodyFrequency: .9, effort: .9 };
        model.update(100, motion);
        for (const fin of fins) {
          const uniforms = fin.material.uniforms;
          assert.ok(Math.abs(uniforms.uSwimTime!.value * uniforms.uSwimFrequency!.value - bodyPhase) < 1e-10, 'fin glow follows the supplied body wave, not an independent clock');
        }
      }
    } finally {
      model.dispose();
    }
  }
});
