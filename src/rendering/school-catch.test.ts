import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schoolCatchFormationScale} from './school-catch.js';

test('Go school gradually gathers around the caught leader',()=>{
  assert.equal(schoolCatchFormationScale(0),1,'the formation starts from the displayed fight pose');
  assert.ok(schoolCatchFormationScale(.5)<1,'the school progressively gathers during the lift');
  assert.ok(Math.abs(schoolCatchFormationScale(1)-.34)<1e-9,'all followers end close to the caught leader');
  assert.equal(schoolCatchFormationScale(2),schoolCatchFormationScale(1),'catch progress is clamped after landing');
});
