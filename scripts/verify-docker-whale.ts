// @ts-nocheck -- executable geometry probe; runtime assertions remain the contract.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createDockerWhale, whaleSection } from '../src/rendering/docker-whale.ts';
import { createGoFish } from '../src/rendering/go-fish.ts';

const go=createGoFish({detail:'low'}),goSize=new THREE.Box3().setFromObject(go.group).getSize(new THREE.Vector3());go.dispose();
for(const detail of ['high','low']){
  const whale=createDockerWhale({detail}),box=new THREE.Box3().setFromObject(whale.group),size=box.getSize(new THREE.Vector3());
  assert.ok(size.x>goSize.x*2,'whale must exceed twice Go fish length at the same scale');
  assert.ok(whaleSection(.4).height>1.9,'substantial body volume');
  assert.equal(whale.flukes.length,2);assert.equal(whale.flippers.length,2);
  assert.equal(whale.containerCount,10);
  assert.ok(whale.stats.meshes<=16,'batched small details');assert.ok(whale.stats.triangles<90_000,'geometry budget');
  whale.group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(const attr of ['position','normal','uv'])assert.ok(mesh.geometry.attributes[attr].array.every(Number.isFinite),`${mesh.name}: finite ${attr}`);
    for(const index of mesh.geometry.index?.array??[])assert.ok(index<mesh.geometry.attributes.position.count,'valid index');
  });
  const p=whale.body.geometry.attributes.position,n=whale.body.geometry.attributes.normal;
  let samples=0,outward=0;
  for(let i=0;i<p.count;i++)if(p.getZ(i)>1){samples++;if(n.getZ(i)>0)outward++;}
  assert.ok(outward/samples>.98,'body normals must face outward');
  for(const fin of [...whale.flippers,...whale.flukes]){
    fin.geometry.computeBoundingBox();const f=fin.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(f.z>f.y*2,'whale flippers/flukes are horizontal');
  }
  for(const t of [0,1,20,1000])whale.update(t,{power:1,glow:1.5});
  console.log(`PASS ${detail}: ${whale.stats.triangles} triangles, ${whale.stats.meshes} meshes, ${size.x.toFixed(1)} long / Go ${goSize.x.toFixed(1)}.`);
  whale.dispose();whale.dispose();assert.equal(whale.group.children.length,0);
}
if(!process.argv.includes('--geometry-only')){
  const base=process.env.OCEAN_URL??'http://127.0.0.1:8787';
  for(const path of ['/docker-whale.html','/docker-whale.js','/docker-whale-viewer.js','/docker-whale-viewer.css']){
    const response=await fetch(base+path);assert.equal(response.status,200,path);assert.ok((await response.text()).length>100);
  }
  console.log('PASS: Docker whale preview assets served.');
}
