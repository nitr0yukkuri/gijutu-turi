// @ts-nocheck -- executable geometry probe; runtime assertions remain the contract.
import assert from 'node:assert/strict';
import { createGoFish, bodySection } from '../src/rendering/go-fish.ts';

for (const detail of ['high', 'low']) {
  const fish=createGoFish({detail});
  assert.equal(fish.fins.length,8,'dorsal, anal, paired pectoral/pelvic and two tail lobes');
  assert.ok(fish.stats.meshes<=14,'small details must be merged, not one draw per light');
  assert.ok(fish.stats.triangles<60_000,'bounded geometry budget');
  const section=bodySection(.45), neck=bodySection(.92);
  assert.ok(section.width>neck.width*3,'body must taper to a narrow peduncle');
  for(const mesh of fish.group.children){
    const geometry=mesh.geometry;
    for(const name of ['position','normal','uv','aFin']){
      assert.ok(geometry.attributes[name],`${mesh.name}: ${name} exists`);
      assert.ok(geometry.attributes[name].array.every(Number.isFinite),`${mesh.name}: finite ${name}`);
    }
    assert.equal(geometry.attributes.position.count,geometry.attributes.aFin.count);
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.min.x>=-2&&geometry.boundingBox.max.x<4.2);
  }
  const body=fish.body.geometry,positions=body.attributes.position,normals=body.attributes.normal;
  let outward=0,samples=0;
  for(let i=0;i<positions.count;i++){
    if(positions.getZ(i)>.2){samples++;if(normals.getZ(i)>0)outward++;}
  }
  assert.ok(outward/samples>.95,'body normals must face outward');
  for(const t of [0,.5,2,1000])fish.update(t,{power:1,glow:1});
  console.log(`PASS ${detail}: ${fish.stats.triangles} triangles, ${fish.stats.meshes} meshes; anatomy, attributes and outward normals.`);
  fish.dispose();fish.dispose();assert.equal(fish.group.children.length,0);
}
const base=process.env.OCEAN_URL??'http://127.0.0.1:8787';
for(const path of ['/go-fish.html','/go-fish.js','/go-fish-viewer.js','/go-fish-viewer.css','/vendor/addons/controls/OrbitControls.js','/vendor/addons/postprocessing/EffectComposer.js','/vendor/addons/postprocessing/UnrealBloomPass.js','/vendor/addons/postprocessing/OutputPass.js']){
  const response=await fetch(base+path);assert.equal(response.status,200,path);
  assert.ok((await response.text()).length>100);
}
console.log('PASS: viewer assets served locally. Browser visual verification is separate.');
