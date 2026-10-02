import assert from 'node:assert/strict';
import test from 'node:test';
import {updateFishingLineBuffers,type FishingLineBuffer} from './fishing-line.js';

function buffer(points=17):FishingLineBuffer {
  return {positions:new Float32Array(points*3),rgba:new Float32Array(points*4)};
}

function pointAt(line:FishingLineBuffer,index:number) {
  const offset=index*3;
  return {x:line.positions[offset]!,y:line.positions[offset+1]!,z:line.positions[offset+2]!};
}

test('splits the sagged curve at the real sloped water crossing without a kink',()=>{
  const air=buffer(49),water=buffer(49);
  const start={x:0,y:2,z:0},end={x:10,y:-4,z:0};
  const surface=(x:number)=>x*.1;
  const split=updateFishingLineBuffers(start,end,air,water,surface,.4,.2,.5);
  assert.ok(split.waterFraction!==null);
  assert.ok(split.waterFraction<2/7,'the sagged leader should meet the surface before the straight chord does');
  const splitIndex=Math.round(split.waterFraction*48);
  const seam=pointAt(air,splitIndex);
  assert.deepEqual(seam,pointAt(water,splitIndex),'both material passes must share the same line geometry');
  assert.ok(Math.abs(seam.y-surface(seam.x))<1e-4);
  const before=pointAt(air,splitIndex-1),after=pointAt(air,splitIndex+1);
  const incoming={x:seam.x-before.x,y:seam.y-before.y};
  const outgoing={x:after.x-seam.x,y:after.y-seam.y};
  const cosine=(incoming.x*outgoing.x+incoming.y*outgoing.y)/
    (Math.hypot(incoming.x,incoming.y)*Math.hypot(outgoing.x,outgoing.y));
  assert.ok(cosine>.995,'the shared curve should keep one tangent through the surface');
  assert.deepEqual(air.positions,water.positions);
  assert.ok(pointAt(air,8).y<2);
  assert.ok(pointAt(water,8).y>-4);
});

test('projects the submerged leader but preserves the shared surface point',()=>{
  const air=buffer(),water=buffer();
  const split=updateFishingLineBuffers(
    {x:0,y:2,z:0},{x:10,y:-4,z:0},air,water,()=>0,.4,.2,.5,
    point=>{if(point.y<0)point.y+=.5;},
  );
  assert.ok(split.waterFraction!==null);
  assert.deepEqual(air.positions,water.positions,'both passes should preserve one refracted curve');
  const splitIndex=Math.round(split.waterFraction*16);
  assert.ok(Math.abs(pointAt(water,splitIndex).y)<1e-4,'the refraction offset should start after the exact surface contact');
  assert.ok(pointAt(water,16).y>-4,'the visible submerged endpoint should follow the projected fish position');
});

test('keeps a line above the surface entirely in the air buffer',()=>{
  const air=buffer(),water=buffer();
  const split=updateFishingLineBuffers({x:0,y:2,z:0},{x:4,y:1,z:0},air,water,()=>0,.3,.2,0);
  assert.equal(split.waterFraction,null);
  assert.equal(split.airVisible,true);
  assert.equal(split.waterVisible,false);
  assert.equal(pointAt(air,0).x,0);
  assert.equal(pointAt(air,16).x,4);
  assert.ok(water.rgba.every((value,index)=>index%4!==3||value===0));
});

test('fades the submerged line with depth and keeps endpoint positions fixed',()=>{
  const air=buffer(),water=buffer();
  const start={x:0,y:1,z:0},end={x:0,y:-8,z:0};
  const split=updateFishingLineBuffers(start,end,air,water,()=>0,.2,.4,1);
  assert.equal(pointAt(air,0).y,start.y);
  assert.equal(pointAt(water,16).y,end.y);
  const justSubmerged=Math.min(15,Math.round(split.waterFraction!*16)+1);
  assert.ok(water.rgba[justSubmerged*4]!>water.rgba[(16*4)+3]!);
});

test('supports a line that travels from underwater into air',()=>{
  const air=buffer(),water=buffer();
  const split=updateFishingLineBuffers({x:0,y:-3,z:0},{x:6,y:3,z:0},air,water,()=>0,.2,.3,.6);
  assert.ok(split.waterFraction!==null);
  assert.equal(split.airVisible,true);
  assert.equal(split.waterVisible,true);
  assert.deepEqual(air.positions,water.positions,'both passes should retain one continuous underwater-to-air path');
  assert.ok(air.rgba[3]!<water.rgba[3]!,'the underwater endpoint should favor the water pass');
  assert.ok(air.rgba[(16*4)+3]!>water.rgba[(16*4)+3]!,'the emerged endpoint should favor the air pass');
});

test('keeps a fully submerged line out of the air buffer',()=>{
  const air=buffer(),water=buffer();
  const split=updateFishingLineBuffers({x:0,y:-1,z:0},{x:6,y:-3,z:0},air,water,()=>0,.2,.3,.6);
  assert.equal(split.waterFraction,null);
  assert.equal(split.airVisible,false);
  assert.equal(split.waterVisible,true);
  assert.equal(pointAt(water,0).y,-1);
  assert.equal(pointAt(water,16).y,-3);
});
