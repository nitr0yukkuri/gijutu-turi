import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoFish } from './go-fish.js';

type MeshWithPositions = {
  name: string;
  geometry: {
    type?: string;
    attributes: {
      position: { array: ArrayLike<number>; count: number };
      normal?: { getZ(index: number): number; count: number };
      uv?: { count: number };
      aFin?: { array: ArrayLike<number> };
    };
    parameters?: { radius?: number };
  };
  material: {
    type?: string;
    transparent?: boolean;
    depthWrite?: boolean;
    color?: { getHex?: () => number };
    userData?: Record<string, unknown>;
    onBeforeCompile?: (shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }) => void;
  };
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

test('Rust marlin has the striped-marlin fin layout and one deep crescent tail', () => {
  const createWithWater = createGoFish as unknown as (options: { detail: string; visualProfile: string; waterUniforms: Record<string, never> }) => ReturnType<typeof createGoFish>;
  const model = createWithWater({ detail: 'low', visualProfile: 'rust', waterUniforms: {} });
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
    const maxAbsZ = (name: string) => {
      const mesh = model.group.children.find(child => child.name === name) as MeshWithPositions | undefined;
      assert.ok(mesh, `${name} should exist`);
      const positions = mesh.geometry.attributes.position.array;
      let maximum = 0;
      for (let i = 2; i < positions.length; i += 3) maximum = Math.max(maximum, Math.abs(positions[i]!));
      return maximum;
    };
    const maxFinMotion = (name: string) => {
      const mesh = model.group.children.find(child => child.name === name) as MeshWithPositions | undefined;
      assert.ok(mesh, `${name} should exist`);
      const weights = mesh.geometry.attributes.aFin?.array;
      assert.ok(weights, `${name} should preserve its free-edge motion weights`);
      return Math.max(...Array.from(weights, value => Number(value)));
    };
    const height = (name: string) => {
      const fin = bounds(name);
      return fin.maxY - fin.minY;
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
    assert.ok(maxAbsZ('marlin-pectoral-1') < .31, 'pectoral fins should remain close to the flank');
    assert.ok(height('marlin-pectoral-1') < .15, 'the folded pectoral should read as a narrow swept blade, not a broad paddle');
    assert.ok(maxFinMotion('marlin-pectoral-1') > .35 && maxFinMotion('marlin-pectoral-1') < .45,
      'the pectoral root stays planted while only its tip receives a restrained delayed response');
    assert.ok(maxAbsZ('marlin-pelvic-1') < .14, 'small pelvic fins should stay tucked rather than protrude as dark belly patches');
    assert.ok(maxFinMotion('marlin-pelvic-1') < .22, 'pelvic fins should move less than the pectorals');
    for (const side of [-1, 1]) {
      for (const kind of ['pectoral', 'pelvic']) {
        const fin = model.group.children.find(child => child.name === `marlin-${kind}-${side}`) as MeshWithPositions | undefined;
        assert.ok(fin);
        assert.equal(fin.material.userData?.fishPart, 'fin', `${fin.name} must use underwater fin lighting, not detail lighting`);
        assert.equal(fin.material.userData?.fishFinSide, side, `${fin.name} must tell water optics which side it occupies`);
        const shader = {
          uniforms: {} as Record<string, { value: unknown }>,
          vertexShader: '#include <project_vertex>',
          fragmentShader: '#include <tonemapping_fragment>',
        };
        fin.material.onBeforeCompile?.(shader);
        assert.equal(shader.uniforms.uWaterPart?.value, 1, `${fin.name} must be composed with fin water optics`);
        assert.equal(shader.uniforms.uWaterFinSide?.value, side, `${fin.name} must activate near/far-side water treatment`);
      }
    }

    const tail = bounds('marlin-crescent-tail');
    assert.equal(model.group.children.filter(child => child.name.startsWith('marlin-crescent-tail')).length, 1,
      'the caudal fin is one continuous membrane, not overlapping left/right copies');
    assert.ok(tail.maxY > .68 && tail.minY < -.68, 'the tail should retain both crescent lobes');
    const tailLength = tail.maxX - tail.minX;
    assert.ok(tail.maxY - tail.minY > tailLength * 1.7, 'the single tail surface should read as one deep crescent');

    const tailMesh = model.group.children.find(child => child.name === 'marlin-crescent-tail') as unknown as MeshWithPositions | undefined;
    assert.ok(tailMesh);
    const tailPositions = tailMesh.geometry.attributes.position.array;
    const maximumTailDepth = Math.max(...Array.from({ length: tailPositions.length / 3 }, (_, index) => Math.abs(tailPositions[index * 3 + 2]!)));
    assert.ok(maximumTailDepth < .011, `the single caudal membrane should not split into a thick double edge (${maximumTailDepth})`);

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

test('Rust marlin skin has continuous shading across the visible UV wrap', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'rust' });
  try {
    const body = model.group.children.find(child => child.name === 'sculpted-body') as
      | { geometry: { attributes: { normal: { getX(index: number): number; getY(index: number): number; getZ(index: number): number } } } }
      | undefined;
    assert.ok(body);
    const normals = body.geometry.attributes.normal;
    const ringStride = 33; // low detail: 32 angular segments plus the duplicated UV seam
    let maxSeamDelta = 0;
    for (let ring = 0; ring <= 64; ring++) {
      const first = ring * ringStride;
      const last = first + ringStride - 1;
      const delta = Math.hypot(
        normals.getX(first) - normals.getX(last),
        normals.getY(first) - normals.getY(last),
        normals.getZ(first) - normals.getZ(last),
      );
      maxSeamDelta = Math.max(maxSeamDelta, delta);
    }
    assert.ok(maxSeamDelta < 1e-6, `the two UV-seam normals should match (${maxSeamDelta})`);
  } finally {
    model.dispose();
  }
});

test('Rust marlin body-hugging fins stay mirrored instead of bulging through the flank', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'rust' });
  try {
    for (const fin of ['pectoral', 'pelvic']) {
      const near = model.group.children.find(child => child.name === `marlin-${fin}-1`) as
        | MeshWithPositions
        | undefined;
      const far = model.group.children.find(child => child.name === `marlin-${fin}--1`) as
        | MeshWithPositions
        | undefined;
      assert.ok(near, `the near-side marlin ${fin} remains present`);
      assert.ok(far, `the far-side marlin ${fin} remains present`);
      const nearPositions = near.geometry.attributes.position.array;
      const farPositions = far.geometry.attributes.position.array;
      assert.equal(nearPositions.length, farPositions.length);
      let maxMirrorError = 0;
      for (let i = 0; i < nearPositions.length; i += 3) {
        maxMirrorError = Math.max(
          maxMirrorError,
          Math.abs(nearPositions[i]! - farPositions[i]!),
          Math.abs(nearPositions[i + 1]! - farPositions[i + 1]!),
          Math.abs(nearPositions[i + 2]! + farPositions[i + 2]!),
        );
      }
      assert.ok(maxMirrorError < 1e-5, `${fin} sides should mirror around the fish body (${maxMirrorError})`);
    }
  } finally {
    model.dispose();
  }
});

test('Rust avoids the scratch-like gill tube and keeps mouth/keel lines subdued', () => {
  const model = createGoFish({ detail: 'low', visualProfile: 'rust' });
  try {
    const gills = model.group.children.filter(child => child.name.startsWith('billfish-gill-')) as unknown as MeshWithPositions[];
    assert.equal(gills.length, 0, 'the procedural gill tube looked like a black slash at the fight-camera scale');
    assert.equal(model.group.children.some(child => child.name.startsWith('billfish-gill-rim-')), false,
      'the offset second stroke must not reintroduce the scratch-like double line');

    const mouth = model.group.children.find(child => child.name === 'billfish-mouth-1') as MeshWithPositions | undefined;
    assert.ok(mouth, 'the jaw line remains represented');
    assert.equal(mouth.material.color?.getHex?.(), 0x62747c,
      'the mouth must not reuse the near-black eye material');
    assert.equal(mouth.geometry.parameters?.radius, .0045, 'the mouth crease should stay fine at fight-camera scale');

    const keels = model.group.children.filter(child => child.name.startsWith('marlin-caudal-keel-')) as unknown as MeshWithPositions[];
    assert.equal(keels.length, 2, 'the real paired caudal keels remain present');
    assert.ok(keels.every(child => child.geometry.type === 'BufferGeometry'),
      'caudal keels should be a shallow surface patch, not a raised tube');
    assert.ok(keels.every(child => child.material.userData?.fishPart === 'body'),
      'caudal keels should share the skin material so their pigment has no dark outline');
    assert.ok(keels.every(child => child.geometry.attributes.uv?.count === child.geometry.attributes.position.count),
      'caudal keels should continue the body UV pattern across the ridge');
    for (const keel of keels) {
      const normals = keel.geometry.attributes.normal;
      assert.ok(normals);
      const averageZ = Array.from({ length: normals.count }, (_, index) => normals.getZ(index))
        .reduce((sum, value) => sum + value, 0) / normals.count;
      assert.ok(keel.name.endsWith('--1') ? averageZ < -.7 : averageZ > .7,
        'both keels face away from the body instead of being culled from one side');
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
    assert.match(shader.fragmentShader, /float marlinBands = marlinBand \* marlinSide \* marlinRange \* marlinBarStrength;/, 'blue bars should be restricted to the marlin flanks and vary slightly by bar');
    assert.match(shader.fragmentShader, /vFishUv\.x\*17\.8/, 'the marlin should carry about thirteen vertical bars along the flank');
    assert.match(shader.fragmentShader, /vFishUv\.y\*6\.2831853 \+ vFishUv\.x\*5\.2/,
      'the bar paths should curve gently instead of reading as ruler-straight stripes');
    assert.match(shader.fragmentShader, /floor\(marlinBandPhase\)\*2\.17/,
      'individual bars should vary slightly in strength instead of repeating mechanically');
    assert.match(shader.fragmentShader, /marlinBands\*\.78/,
      'the bars should remain recognizable without overpowering the silver body');
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
