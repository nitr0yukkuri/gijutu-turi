import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoFish } from './go-fish.js';

type MeshWithPositions = {
  name: string;
  geometry: { attributes: { position: { array: ArrayLike<number> } } };
  material: { type?: string; transparent?: boolean; depthWrite?: boolean };
};

test('Rust marlin bill is long, tapered, and nearly round at its base', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'rust' });
  try {
    const bill = model.group.children.find(mesh => mesh.name === 'marlin-spear-bill') as MeshWithPositions | undefined;
    assert.ok(bill, 'the marlin bill remains an independently readable mesh');
    const positions = bill.geometry.attributes.position.array;
    let minX = Infinity;
    let maxX = -Infinity;
    let tipRadius = Infinity;
    let rootYRadius = 0;
    let rootZRadius = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!;
      const y = positions[i + 1]!;
      const z = positions[i + 2]!;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      if (x < -3.1) tipRadius = Math.min(tipRadius, Math.hypot(y - .008, z));
      if (x > -1.76) {
        rootYRadius = Math.max(rootYRadius, Math.abs(y - .008));
        rootZRadius = Math.max(rootZRadius, Math.abs(z));
      }
    }
    assert.ok(minX < -3.1, `the bill should project well ahead of the face (minX=${minX})`);
    assert.ok(maxX > -1.72 && maxX < -1.62, `the root should overlap the head (maxX=${maxX})`);
    assert.ok(tipRadius < .01, `the bill tip should taper to a point (radius=${tipRadius})`);
    assert.ok(rootYRadius > .10 && rootZRadius > .10, 'the embedded bill root should retain a substantial cross-section');
    const crossSectionRatio = rootYRadius / rootZRadius;
    assert.ok(crossSectionRatio > .78 && crossSectionRatio < 1.25, `the bill should not read as a flattened sword blade (ratio=${crossSectionRatio})`);
  } finally {
    model.dispose();
  }
});

test('Rust marlin has the striped-marlin fin layout and a deep crescent tail', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'rust' });
  try {
    const bounds = (name: string) => {
      const mesh = model.group.children.find(child => child.name === name) as MeshWithPositions | undefined;
      assert.ok(mesh, `${name} should be a dedicated visible fin`);
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

    assert.equal(model.group.name, 'Rustカジキ');
    const firstDorsal = bounds('marlin-first-dorsal');
    const secondDorsal = bounds('marlin-second-dorsal');
    assert.ok(firstDorsal.minX < -1.2 && firstDorsal.maxX < -.2, 'the high first dorsal should begin behind the head and extend along the front half');
    assert.ok(firstDorsal.maxY > .95, 'the first dorsal should rise clearly above the back without becoming a giant sail');
    assert.ok(secondDorsal.minX - firstDorsal.maxX > 1.1, 'the small second dorsal should be separated toward the tail');
    assert.ok(secondDorsal.maxY < .2, 'the rear second dorsal should remain small');
    assert.equal(model.group.children.filter(child => child.name.startsWith('marlin-pelvic-')).length, 2, 'the marlin should retain its paired pelvic fins');
    assert.equal(model.group.children.filter(child => child.name.startsWith('marlin-pectoral-')).length, 2, 'the marlin should retain its paired pectoral fins');

    const upperSideTail = bounds('marlin-crescent-tail-1');
    const lowerSideTail = bounds('marlin-crescent-tail--1');
    for (const [name, tail] of [['near', upperSideTail], ['far', lowerSideTail]] as const) {
      assert.ok(tail.maxY > .68 && tail.minY < -.68, `${name} side tail should contain both crescent lobes`);
    }
    const tailLength = Math.max(upperSideTail.maxX, lowerSideTail.maxX) - Math.min(upperSideTail.minX, lowerSideTail.minX);
    assert.ok(upperSideTail.maxY - upperSideTail.minY > tailLength * 1.7, 'each tail surface should read as one continuous crescent');

    const marlinFins = model.group.children.filter(child => child.name.startsWith('marlin-')) as unknown as MeshWithPositions[];
    for (const fin of marlinFins.filter(child => child.name.includes('dorsal') || child.name.includes('anal') || child.name.includes('pectoral') || child.name.includes('pelvic') || child.name.includes('crescent-tail'))) {
      assert.equal(fin.material.type, 'MeshPhysicalMaterial', `${fin.name} should use a softly lit solid material`);
      assert.equal(fin.material.transparent, false, `${fin.name} should not form a translucent web`);
      assert.notEqual(fin.material.depthWrite, false, `${fin.name} should occlude the far-side fin naturally`);
    }
  } finally {
    model.dispose();
  }
});

test('simplifying Rust fins does not change the Go fish fin material', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'ocean' });
  try {
    const dorsal = model.group.children.find(child => child.name === 'dorsal-sail') as MeshWithPositions | undefined;
    assert.ok(dorsal);
    assert.equal(dorsal.material.type, 'ShaderMaterial');
    assert.equal(dorsal.material.transparent, true);
  } finally {
    model.dispose();
  }
});

test('Rust marlin skin renders blue flank bars over a dark-back, silver-belly base', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'rust' });
  try {
    const body = model.group.children.find(child => child.name === 'sculpted-body') as
      | { material: { onBeforeCompile: (shader: any) => void } }
      | undefined;
    assert.ok(body, 'the marlin body should use its dedicated material');
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <color_fragment>\n#include <emissivemap_fragment>\n#include <normal_fragment_maps>',
    };
    body.material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /float marlinBands = marlinBand \* marlinSide \* marlinRange;/, 'blue bars should be restricted to the marlin flanks');
    assert.match(shader.fragmentShader, /vFishUv\.x\*14\.5/, 'the marlin should carry several narrow bars along the flank');
    assert.match(shader.fragmentShader, /vec3\(\.025,\.31,\.82\)/, 'the body bars should use a recognizable blue');
    assert.match(shader.fragmentShader, /mix\(vec3\(\.48,\.64,\.76\), vec3\(\.018,\.075,\.28\), dorsal\)/, 'the base palette should fade from a silver belly to a blue-black back');
    assert.match(shader.fragmentShader, /float scaleMask = 0\.0;/, 'the stripe pattern should not be obscured by the generic scale-cell grid');
  } finally {
    model.dispose();
  }
});

test('Rust orange move accent is limited to a smoothed server surge', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'rust' });
  try {
    const body = model.group.children.find(mesh => mesh.name === 'sculpted-body') as
      | { material: { onBeforeCompile: (shader: any) => void } }
      | undefined;
    assert.ok(body);
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <color_fragment>\n#include <emissivemap_fragment>\n#include <normal_fragment_maps>',
    };
    body.material.onBeforeCompile(shader);
    assert.match(shader.fragmentShader, /uniform float uRustSurge;/);
    assert.match(shader.fragmentShader, /rustMoveAccent = clamp\(uRustSurge,0\.0,1\.0\) \* marlinBands/);
    assert.match(shader.fragmentShader, /vec3\(\.78,\.24,\.09\)/, 'the temporary accent should be warm Rust orange, not a permanent body recolor');

    const accent = shader.uniforms.uRustSurge as { value: number };
    assert.equal(accent.value, 0, 'the marlin should remain naturally blue and silver outside a surge');
    model.update(0, { surge: 1, styleDelta: .1 });
    const peak = accent.value;
    assert.ok(peak > .75 && peak < 1, `surge appearance should ease in instead of popping (${peak})`);
    model.update(.1, { surge: 0, styleDelta: .1 });
    assert.ok(accent.value > 0 && accent.value < peak, 'the orange accent should trail off smoothly after the server surge');
  } finally {
    model.dispose();
  }
});

test('Rust surge accent does not add its shader state to Go fish', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'ocean' });
  try {
    const body = model.group.children.find(mesh => mesh.name === 'sculpted-body') as
      | { material: { onBeforeCompile: (shader: any) => void } }
      | undefined;
    assert.ok(body);
    const shader = {
      uniforms: {},
      vertexShader: '#include <beginnormal_vertex>\n#include <begin_vertex>',
      fragmentShader: '#include <color_fragment>\n#include <emissivemap_fragment>\n#include <normal_fragment_maps>',
    };
    body.material.onBeforeCompile(shader);
    model.update(0, { surge: 1, styleDelta: .1 });
    assert.doesNotMatch(shader.fragmentShader, /uRustSurge/);
    assert.equal('uRustSurge' in shader.uniforms, false);
  } finally {
    model.dispose();
  }
});
