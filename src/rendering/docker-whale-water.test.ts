// @ts-nocheck -- this test drives vendored Three.js materials and shader mocks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDockerWhale } from './docker-whale.js';

test('Docker whale pectorals and their rims carry separate view-aware underwater treatment',()=>{
  const model=createDockerWhale({
    detail:'low',
    waterUniforms:{
      uTime:{value:0},uRipples:{value:[]},uCamera:{value:null},
      uProjectionInverse:{value:null},uWaterBackdrop:{value:null},uWaterSize:{value:null},
    },
  });

  try {
    assert.equal(model.flippers.length,2);
    assert.notEqual(
      model.flippers[0].material.customProgramCacheKey(),
      model.flippers[1].material.customProgramCacheKey(),
      'opposite pectorals must not share a shader program with one captured fin side',
    );
    for(const [index,fin] of model.flippers.entries()){
      const side=index===0?-1:1;
      const shader={
        uniforms:{},
        vertexShader:'#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>',
        fragmentShader:'#include <color_fragment>\n#include <tonemapping_fragment>',
      };
      fin.material.onBeforeCompile(shader,{});
      assert.equal(shader.uniforms.uWaterFinSide.value,side);
      assert.equal(shader.uniforms.uWaterPart.value,1,'pectoral skin should use fin water optics');
      assert.match(shader.vertexShader,/vWaterFinFacing=dot/);
      assert.match(shader.fragmentShader,/farFinBlend=step/);

      const rim=model.group.children.find(child=>child.name===`flipper-rim-${side}`);
      assert.ok(rim,'each pectoral needs a matching rim');
      const rimShader={
        uniforms:{},
        vertexShader:'#include <begin_vertex>\n#include <project_vertex>',
        fragmentShader:'#include <color_fragment>\n#include <tonemapping_fragment>',
      };
      rim.material.onBeforeCompile(rimShader,{});
      assert.equal(rimShader.uniforms.uWaterFinSide.value,side,'the far-side glow rim must recede with its fin');
      assert.equal(rimShader.uniforms.uWaterPart.value,1);
    }
    const rimKeys=[-1,1].map(side=>model.group.children.find(child=>child.name===`flipper-rim-${side}`).material.customProgramCacheKey());
    assert.notEqual(rimKeys[0],rimKeys[1],'opposite pectoral rims must also compile with their own fin side');
  } finally {
    model.dispose();
  }
});
