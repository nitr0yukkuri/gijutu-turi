import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CastMotionGesture,ReelMotionGesture,castStrengthFromMotion,isCastMotionReleased,isCastMotionStart,isReelMotionStart,isReelMotionStop,isScreenReelBlockingMotion,reelAngularSignal} from './client/cast-motion.js';

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

test('motion thresholds reject small resting movement and require a deliberate throw impulse',()=>{
  assert.equal(isCastMotionStart(3,40),false);
  assert.equal(isCastMotionStart(9,220),false);
  assert.equal(isCastMotionStart(14,0),true);
  assert.equal(isCastMotionReleased(4,80),true);
  assert.equal(isCastMotionReleased(6,80),false);
});

test('one isolated sensor peak does not cast, but a sustained flick and release does',()=>{
  const detector = new CastMotionGesture();
  assert.equal(detector.update(15,0,0),null);
  assert.equal(detector.update(2,0,40),null);
  assert.equal(detector.update(2,0,180),null);

  assert.equal(detector.update(14,0,300),null);
  assert.equal(detector.update(14,0,340),null);
  assert.equal(detector.update(14,0,380),null);
  assert.equal(detector.update(3,20,400),null);
  assert.equal(detector.update(3,20,450),null);
  assert.deepEqual(detector.update(3,20,500),{acceleration:14,angularSpeed:20});
});

test('phone rotation exposes one stable reel signal across device axes',()=>{
  assert.equal(reelAngularSignal(12, -240, 40), -240);
  assert.equal(reelAngularSignal(null, null, null), 0);
  assert.equal(isReelMotionStart(-170), true);
  assert.equal(isReelMotionStart(-140), false);
  assert.equal(isReelMotionStart(80), false);
  assert.equal(isReelMotionStop(40), true);
  assert.equal(isReelMotionStop(50), false);
});

test('motion can release its own reel while screen-held reeling stays protected',()=>{
  assert.equal(isScreenReelBlockingMotion(false, false), false);
  assert.equal(isScreenReelBlockingMotion(true, false), true);
  assert.equal(isScreenReelBlockingMotion(true, true), false);
});

test('a brief wrist rotation does not start reeling and both transitions need stable samples',()=>{
  const detector = new ReelMotionGesture();
  assert.equal(detector.update(180,0),null);
  assert.equal(detector.update(40,40),null);
  assert.equal(detector.update(40,180),null);

  assert.equal(detector.update(180,220),null);
  assert.equal(detector.update(180,260),null);
  assert.equal(detector.update(-180,300),null);
  assert.equal(detector.update(180,340),null);
  assert.equal(detector.update(-180,380),null);

  assert.equal(detector.update(180,500),null);
  assert.equal(detector.update(180,540),null);
  assert.equal(detector.update(180,580),"start");
  assert.equal(detector.update(40,600),null);
  assert.equal(detector.update(40,650),null);
  assert.equal(detector.update(40,700),"stop");
});
