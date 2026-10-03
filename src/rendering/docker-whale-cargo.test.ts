// @ts-nocheck -- this test drives vendored Three.js materials and shader mocks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDockerWhale } from './docker-whale.js';

test('Docker cargo gives one damped inertial and glow response per heavy-pull onset',()=>{
  const model=createDockerWhale();
  try {
    const cargoChildren=model.cargoMount.children;
    const statusMaterial=cargoChildren.find(child=>child.material?.name==='docker-cargo-status-glow')?.material;
    const accentMaterial=cargoChildren.find(child=>child.material?.name==='docker-cargo-accent')?.material;
    assert.ok(statusMaterial,'container status lights need an isolated pulse material');
    assert.ok(accentMaterial,'cargo rails need a restrained emissive response');

    const statusShader={uniforms:{},vertexShader:'',fragmentShader:'#include <color_fragment>\nvoid main() {}'};
    statusMaterial.onBeforeCompile(statusShader,{});
    assert.match(statusShader.fragmentShader,/uGlow\*\(1\.0\+1\.15\*uCargoPulse\)/);

    const accentShader={uniforms:{},vertexShader:'',fragmentShader:'#include <emissivemap_fragment>\nvoid main() {}'};
    accentMaterial.onBeforeCompile(accentShader,{});
    assert.match(accentShader.fragmentShader,/totalEmissiveRadiance\+=vec3\(\.012,\.11,\.16\)\*uCargoPulse/);

    model.update(0,{cargoMoment:false,styleDelta:1/60});
    model.update(1/60,{cargoMoment:true,tetherLoad:.8,styleDelta:1/60});
    const firstPulse=statusShader.uniforms.uCargoPulse.value;
    assert.ok(firstPulse>.9&&firstPulse<=1,'the server-authored heavy-pull transition should cause one clear pulse');
    assert.ok(model.cargoMount.position.x>0,'cargo briefly lags toward the whale tail when it surges forward');
    assert.equal(model.group.position.x,0,'the presentation cue must not invent separate root motion');

    model.update(2/60,{cargoMoment:true,tetherLoad:.8,styleDelta:1/60});
    assert.ok(statusShader.uniforms.uCargoPulse.value<firstPulse,'a sustained surge must not retrigger the impact every frame');
    model.update(3/60,{cargoMoment:false,tetherLoad:.8,styleDelta:.1});
    const settledPulse=statusShader.uniforms.uCargoPulse.value;
    model.update(4/60,{cargoMoment:true,tetherLoad:.8,styleDelta:1/60});
    assert.ok(statusShader.uniforms.uCargoPulse.value>settledPulse,'the next authoritative surge transition can trigger a new pulse');
  } finally {
    model.dispose();
  }
});
