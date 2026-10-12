import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFishWater,
  CSS_FISH_WATER_PROFILE,
  DEFAULT_FISH_WATER_PROFILE,
  DOCKER_WHALE_WATER_PROFILE,
  farFinSideBlend,
  farFinWaterVisibility,
  fishApparentPoint,
  K8S_LEVIATHAN_WATER_PROFILE,
  waterHeightAt,
  waterHeightGLSL,
  waterNormalHeightDifferenceAt,
} from './fish-water.js';

test('underwater view weighting keeps the near pectoral clear and lets the far one recede',()=>{
  assert.equal(farFinSideBlend(1,1),0);
  assert.equal(farFinSideBlend(-1,1),1);
  assert.equal(farFinSideBlend(-1,0),0,'ordinary anatomy must not receive side-specific dimming');
  assert.equal(farFinWaterVisibility(1,1),1);
  assert.equal(farFinWaterVisibility(-1,1),.5);
  assert.ok(farFinWaterVisibility(0,1)>.5&&farFinWaterVisibility(0,1)<1,'the edge-on view should blend smoothly');
});

test('shares the fish refraction projection with submerged line points without allocating',()=>{
  const center={x:0,y:-2.2,z:-18};
  const eye={x:0,y:4,z:8};
  const mouth={x:-1.2,y:-2.2,z:-18};
  const output={x:0,y:0,z:0};
  const apparent=fishApparentPoint(mouth,center,eye,output);

  assert.equal(apparent,output);
  assert.equal(apparent.x,mouth.x);
  assert.equal(apparent.z,mouth.z);
  assert.ok(apparent.y>mouth.y,'the submerged leader endpoint should rise with the fish image');
  assert.equal(fishApparentPoint({x:1,y:0,z:2},center,eye).y,0,'the waterline endpoint remains unchanged');
});

test('CPU water contact height and shader use the same wave/ripple parameters',()=>{
  const point={x:2.4,z:-8.1},time=1.7;
  const calm=waterHeightAt(point.x,point.z,time);
  assert.equal(waterHeightAt(point.x,point.z,time),calm,'the contact surface is deterministic');

  const ripple={x:point.x-1.25*.7+.12,y:point.z,z:1,w:1};
  const rippled=waterHeightAt(point.x,point.z,time,[ripple]);
  assert.notEqual(rippled,calm,'surface contact includes the same active impact ripple');
  assert.ok(waterHeightGLSL.includes('float freq=0.42, amp=0.13'));
  assert.ok(waterHeightGLSL.includes('uTime*(0.42+float(i)*0.14)'));
  assert.ok(waterHeightGLSL.includes('sin(r*11.0)'), 'GLSL scalar operands must stay floating point');
  assert.ok(waterHeightGLSL.includes('d-age*1.25'));
});

test('optimized wave normal differences match the original centered height samples',()=>{
  const cases=[
    {x:2.4,z:-8.1,time:1.7,epsilon:.035,ripples:[]},
    {x:-23.75,z:41.2,time:4.6,epsilon:.173,ripples:[
      {x:-23.1,y:40.7,z:2.9,w:.85},
      {x:-25.2,y:42.8,z:3.4,w:.42},
    ]},
    {x:108.3,z:-76.5,time:9.2,epsilon:.2,ripples:[
      {x:104,y:-75,z:1,w:1},
    ]},
  ];
  for(const sample of cases){
    const difference=waterNormalHeightDifferenceAt(sample.x,sample.z,sample.time,sample.epsilon,sample.ripples);
    const expectedX=waterHeightAt(sample.x-sample.epsilon,sample.z,sample.time,sample.ripples)
      -waterHeightAt(sample.x+sample.epsilon,sample.z,sample.time,sample.ripples);
    const expectedZ=waterHeightAt(sample.x,sample.z-sample.epsilon,sample.time,sample.ripples)
      -waterHeightAt(sample.x,sample.z+sample.epsilon,sample.time,sample.ripples);
    assert.ok(Math.abs(difference.x-expectedX)<1e-12,'x normal difference drifted: '+difference.x+' vs '+expectedX);
    assert.ok(Math.abs(difference.z-expectedZ)<1e-12,'z normal difference drifted: '+difference.z+' vs '+expectedZ);
  }
});

for (const [species, profile] of [
  ['Go fish, Rust marlin, and JS eel', DEFAULT_FISH_WATER_PROFILE],
  ['Docker whale', DOCKER_WHALE_WATER_PROFILE],
  ['CSS fish', CSS_FISH_WATER_PROFILE],
  ['K8s leviathan', K8S_LEVIATHAN_WATER_PROFILE],
] as const) {
  test(`${species} keep one water appearance through fishing and combat`, () => {
    const material = {
      toneMapped: true,
      onBeforeCompile(_shader: any) {},
      customProgramCacheKey: () => `fish-${species}`,
    };
    applyFishWater(material, { uFishVisibility: { value: 1 } }, 'body', profile);
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <tonemapping_fragment>' };
    material.onBeforeCompile(shader);

    assert.match(shader.fragmentShader, /float presentationVisibility=uFishVisibility/);
    assert.match(shader.fragmentShader, /mix\(fishColor,underwater,submerged\)/,
      'the same physical water depth and refraction blend remains active for every phase');
    assert.match(shader.fragmentShader,/waterWaveDifference\(p\.xz,eps,hx,hz\)/,
      'each live species uses the shared equivalent wave-normal calculation');
    assert.doesNotMatch(shader.fragmentShader,/heightAt\(p\.xz-vec2\(eps,0\.0\)/,
      'fish normals do not repeat full wave-height evaluation at every offset');
    assert.match(material.customProgramCacheKey(),profile===DOCKER_WHALE_WATER_PROFILE? /underwater-docker-consistent-v1/ : /underwater-consistent-v2/,
      'changed shader source has a versioned program-cache key');
    assert.doesNotMatch(shader.fragmentShader, /uFishCombat|combatPigmentBlend|fightSubmerged|combatAnatomy|combatDetail/,
      'fight state cannot alter water optics or fish opacity');
  });
}
