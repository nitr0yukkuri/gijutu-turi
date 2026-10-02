import assert from 'node:assert/strict';
import test from 'node:test';
import { fishApparentPoint } from './fish-water.js';

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
