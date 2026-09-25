import {test} from 'node:test';
import assert from 'node:assert/strict';
import {castStrengthFromMotion,isCastMotionReleased,isCastMotionStart} from './client/cast-motion.js';

test("cast power increases with either the phone flick's acceleration or angular speed",()=>{
  assert.ok(castStrengthFromMotion(20,0)>castStrengthFromMotion(12,0));
  assert.ok(castStrengthFromMotion(0,360)>castStrengthFromMotion(0,180));
});

test('both motion signals can reinforce a cast and power stays in the server range',()=>{
  assert.ok(castStrengthFromMotion(20,360)>castStrengthFromMotion(20,0));
  assert.equal(castStrengthFromMotion(1000,1000),1);
  assert.equal(castStrengthFromMotion(0,null),.2);
  assert.equal(castStrengthFromMotion(Number.NaN,Number.NaN),.2);
});

test('motion thresholds reject resting drift and accept a quick phone rotation',()=>{
  assert.equal(isCastMotionStart(3,40),false);
  assert.equal(isCastMotionStart(9,220),true);
  assert.equal(isCastMotionReleased(3,60),true);
  assert.equal(isCastMotionReleased(5,60),false);
});
