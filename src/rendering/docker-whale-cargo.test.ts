// @ts-nocheck -- this test drives vendored Three.js materials and shader mocks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDockerWhale } from './docker-whale.js';

test('Docker cargo keeps its startup glow through a heavy pull and eases it out',()=>{
  const model=createDockerWhale();
  try {
    const cargoChildren=model.cargoMount.children;
    const statusMaterial=cargoChildren.find(child=>child.material?.name==='docker-cargo-status-glow')?.material;
    const accentMaterial=cargoChildren.find(child=>child.material?.name==='docker-cargo-accent')?.material;
    const haloMesh=cargoChildren.find(child=>child.material?.name==='docker-cargo-status-halo');
    const haloMaterial=haloMesh?.material;
    assert.ok(statusMaterial,'container status lights need an isolated pulse material');
    assert.ok(accentMaterial,'cargo rails need a restrained emissive response');
    assert.ok(haloMesh?.geometry?.attributes?.uv,'status lights need a batched local halo layer');
    assert.equal(haloMaterial.opacity,.92,'status halos need enough opacity to survive the distant fight camera');
    assert.ok(haloMaterial.color.g>1&&haloMaterial.color.b>1,'status halos need an emissive cyan lift beyond the tiny status windows');

    const statusShader={uniforms:{},vertexShader:'',fragmentShader:'#include <color_fragment>\nvoid main() {}'};
    statusMaterial.onBeforeCompile(statusShader,{});
    assert.match(statusShader.fragmentShader,/uGlow\*\(1\.0\+\.95\*uCargoOn\+\.75\*uCargoPulse\)/);

    const accentShader={uniforms:{},vertexShader:'',fragmentShader:'#include <emissivemap_fragment>\nvoid main() {}'};
    accentMaterial.onBeforeCompile(accentShader,{});
    assert.match(accentShader.fragmentShader,/totalEmissiveRadiance\+=vec3\(\.02,\.18,\.28\)\*\(uCargoPulse\+\.9\*uCargoOn\)/);

    const haloShader={uniforms:{},vertexShader:'',fragmentShader:'#include <color_fragment>\n#include <map_fragment>\nvoid main() {}'};
    haloMaterial.onBeforeCompile(haloShader,{});
    assert.match(haloShader.fragmentShader,/cargoHaloSignal=clamp\(\.95\*uCargoOn\+\.5\*uCargoPulse/);

    model.update(0,{cargoMoment:false,styleDelta:1/60});
    assert.equal(statusShader.uniforms.uCargoOn.value,0,'the halo must remain off before a heavy-pull event');
    model.update(1/60,{cargoMoment:true,tetherLoad:.8,styleDelta:1/60});
    const firstPulse=statusShader.uniforms.uCargoPulse.value;
    const firstGlowOn=statusShader.uniforms.uCargoOn.value;
    assert.ok(firstPulse>.9&&firstPulse<=1,'the server-authored heavy-pull transition should cause one clear pulse');
    assert.ok(firstGlowOn>0&&firstGlowOn<.3,'the sustained glow should ease in instead of popping on');
    assert.ok(model.cargoMount.position.x>0,'cargo briefly lags toward the whale tail when it surges forward');
    assert.equal(model.group.position.x,0,'the presentation cue must not invent separate root motion');

    for(let i=0;i<45;i++)model.update(2/60+i/60,{cargoMoment:true,tetherLoad:.8,styleDelta:1/60});
    const heldPulse=statusShader.uniforms.uCargoPulse.value;
    const heldGlowOn=statusShader.uniforms.uCargoOn.value;
    assert.ok(heldPulse<firstPulse,'a sustained surge must not retrigger the impact every frame');
    assert.ok(heldGlowOn>.98,'the container glow should remain lit after the onset flash fades');

    model.update(1,{cargoMoment:false,tetherLoad:.8,styleDelta:.1});
    model.update(1.1,{cargoMoment:false,tetherLoad:.8,styleDelta:.1});
    const settledPulse=statusShader.uniforms.uCargoPulse.value;
    const glowTail=statusShader.uniforms.uCargoOn.value;
    assert.ok(glowTail>.87&&glowTail<.9,'the visible glow should linger for several seconds after the short heavy-pull window');
    model.update(1.2,{cargoMoment:true,tetherLoad:.8,styleDelta:1/60});
    assert.ok(statusShader.uniforms.uCargoPulse.value>settledPulse,'the next authoritative surge transition can trigger a new pulse');
    assert.ok(statusShader.uniforms.uCargoOn.value>glowTail,'the next surge should ramp the sustained glow back up');
  } finally {
    model.dispose();
  }
});
