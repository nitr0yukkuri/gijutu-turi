import {test} from 'node:test';
import assert from 'node:assert/strict';
import {castDistanceForStrength} from './cast-distance.js';
import {CastMotionGesture,ReelMotionGesture,castStrengthFromMotion,castStrengthFromSwing,isCastMotionReleased,isCastMotionStart,isReelMotionStart,isReelMotionStop,isScreenReelBlockingMotion,reelAngularSignal} from './client/cast-motion.js';

test("cast power increases with either the phone flick's acceleration or angular speed",()=>{
  assert.ok(castStrengthFromMotion(20,0)>castStrengthFromMotion(12,0));
  assert.ok(castStrengthFromMotion(0,360)>castStrengthFromMotion(0,180));
  assert.equal(castStrengthFromMotion(8,120),.2,'a flick at the recognition threshold should stay near the shore');
  assert.ok(castStrengthFromMotion(9,121)<.25,'a barely stronger flick should add only a little distance');
});

test('both motion signals can reinforce a cast and power stays in the server range',()=>{
  assert.ok(castStrengthFromMotion(20,360)>castStrengthFromMotion(20,0));
  assert.equal(castStrengthFromMotion(1000,1000),1);
  assert.equal(castStrengthFromMotion(0,null),.2);
  assert.equal(castStrengthFromMotion(Number.NaN,Number.NaN),.2);
});

test('cast distance depends on both swing speed and how far the phone sweeps',()=>{
  const shortFastSwing=castStrengthFromSwing(0,500,25);
  const wideFastSwing=castStrengthFromSwing(0,500,100);
  const slowWideSwing=castStrengthFromSwing(0,180,100);
  assert.ok(wideFastSwing>shortFastSwing+.2,'a broad swing should travel farther than a wrist snap at the same speed');
  assert.ok(wideFastSwing>slowWideSwing,'speed should still matter for equally broad swings');
  assert.ok(castDistanceForStrength(shortFastSwing)<22,'a fast but compact wrist snap should stay out of maximum range');
});

test('motion thresholds reject small resting movement and require a deliberate throw impulse',()=>{
  assert.equal(isCastMotionStart(3,40),false);
  assert.equal(isCastMotionStart(7,110),false);
  assert.equal(isCastMotionStart(14,0),true);
  assert.equal(isCastMotionReleased(4,80),true);
  assert.equal(isCastMotionReleased(6,80),false);
});

test('one- and two-sample peaks do not cast, but a sustained flick and release does',()=>{
  const detector = new CastMotionGesture();
  for (const now of [0,40,80,120,160,200]) assert.equal(detector.update(2,20,now),null);

  // Even two adjacent spikes must not become a maximum-power cast.
  assert.equal(detector.update(40,700,240),null);
  assert.equal(detector.update(40,700,280),null);
  for (const now of [320,360,400,440]) assert.equal(detector.update(2,20,now),null);

  // A deliberate impulse stays above the start threshold long enough to pass
  // the median and time filters, then releases cleanly.
  for (const now of [480,520,560,600,640]) assert.equal(detector.update(14,20,now),null);
  let cast:null|{acceleration:number;angularSpeed:number}=null;
  for (const now of [680,720,760,800,840,880,920,960,1000,1040,1080]) {
    cast=detector.update(3,20,now)??cast;
  }
  assert.ok(cast,'the sustained flick should cast after a stable release');
  assert.ok(cast.acceleration>12&&cast.acceleration<14,'the emitted peak should reflect smoothing rather than a raw sample');
  assert.ok(Math.abs(cast.angularSpeed-20)<.01);
});

test('cast confirmation tolerates the slowest accepted motion-event cadence',()=>{
  const detector=new CastMotionGesture();
  let cast:null|{acceleration:number;angularSpeed:number}=null;
  for(let now=0;now<=1600;now+=100){
    const throwing=now>=300&&now<800;
    cast=detector.update(throwing?1:0,throwing?140:0,now)??cast;
  }
  assert.ok(cast,'10 Hz samples are within the accepted 120 ms gap and should still complete a cast');
  assert.ok(cast.angularSpeed>120&&cast.angularSpeed<140,'a slow cast should retain its measured low speed');
});

test('brief fast peaks get less distance than a sustained, broad fast cast',()=>{
  const run=(peakDurationMs:number)=>{
    const detector=new CastMotionGesture();
    let cast:null|{acceleration:number;angularSpeed:number;swingAngle:number}=null;
    for(let now=0;now<=1200;now+=1000/60){
      const throwing=now>=300&&now<300+peakDurationMs;
      cast=detector.update(0,throwing?500:0,now)??cast;
    }
    return cast;
  };
  const brief=run(50),sustained=run(220);
  assert.ok(brief&&sustained,'both intentional gestures should complete');
  const briefDistance=castDistanceForStrength(castStrengthFromSwing(brief.acceleration,brief.angularSpeed,brief.swingAngle));
  const sustainedDistance=castDistanceForStrength(castStrengthFromSwing(sustained.acceleration,sustained.angularSpeed,sustained.swingAngle));
  assert.ok(brief.swingAngle<sustained.swingAngle,'a brief snap should report a smaller swept angle');
  assert.ok(briefDistance<20,`a 50 ms peak over a compact arc should stay near (${briefDistance.toFixed(1)} m)`);
  assert.ok(sustainedDistance>briefDistance+5,'a sustained fast swing should still cast farther');
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

test('motion can release its own reel while screen-held reeling stays protected',()=>{
  assert.equal(isScreenReelBlockingMotion(false, false), false);
  assert.equal(isScreenReelBlockingMotion(true, false), true);
  assert.equal(isScreenReelBlockingMotion(true, true), false);
});
