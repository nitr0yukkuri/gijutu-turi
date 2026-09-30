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

test('splits the line at a sloped water surface without a gap',()=>{
  const air=buffer(),water=buffer();
  const start={x:0,y:2,z:0},end={x:10,y:-4,z:0};
  const surface=(x:number)=>x*.1;
  const split=updateFishingLineBuffers(start,end,air,water,surface,.4,.2,.5);
  assert.ok(split.waterFraction!==null);
  assert.ok(Math.abs(split.waterFraction-2/7)<.001);
  const airEnd=pointAt(air,16),waterStart=pointAt(water,0);
  assert.ok(Math.abs(airEnd.x-waterStart.x)<1e-5);
  assert.ok(Math.abs(airEnd.y-waterStart.y)<1e-5);
  assert.ok(Math.abs(airEnd.y-surface(airEnd.x))<1e-4);
  assert.ok(pointAt(air,8).y<2);
  assert.ok(pointAt(water,8).y>-4);
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
  updateFishingLineBuffers(start,end,air,water,()=>0,.2,.4,1);
  assert.equal(pointAt(air,0).y,start.y);
  assert.equal(pointAt(water,16).y,end.y);
  assert.ok(water.rgba[3]!>water.rgba[(16*4)+3]!);
});

test('supports a line that travels from underwater into air',()=>{
  const air=buffer(),water=buffer();
  const split=updateFishingLineBuffers({x:0,y:-3,z:0},{x:6,y:3,z:0},air,water,()=>0,.2,.3,.6);
  assert.ok(split.waterFraction!==null);
  assert.equal(split.airVisible,true);
  assert.equal(split.waterVisible,true);
  const waterEnd=pointAt(water,16),airStart=pointAt(air,0);
  assert.ok(Math.abs(waterEnd.x-airStart.x)<1e-5);
  assert.ok(Math.abs(waterEnd.y-airStart.y)<1e-5);
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
