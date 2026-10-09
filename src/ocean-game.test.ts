import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OceanFishingGame} from './ocean-game.js';
import {getFishFightProfile} from './fish-behavior.js';
import type {FishSpeciesId} from './fish-species.js';

function setup(strength=.5,fishId:FishSpeciesId='fish-001'){
  const game=new OceanFishingGame(()=>.5,fishId);let now=1000;
  const step=(held=false)=>{now+=50;game.step(.05,held,now);};
  game.action({action:'cast',strength,aim:0},now);
  while(game.state.phase!=='biting')step();
  return{game,step,now:()=>now};
}
test('sea loop: ignores premature hook, missed bite escapes, reset is repeatable',()=>{
  const game=new OceanFishingGame(()=>0);
  assert.equal(game.action({action:'hook'},0),false);
  game.action({action:'cast',strength:.5,aim:0},1000);
  // Advance past the full reaction window instead of coupling this test to
  // the exact UX duration shown to a player.
  for(let i=0;i<320&&game.state.phase!=='escaped';i++)game.step(.05,false,1000+i*50);
  assert.equal(game.state.phase,'escaped');assert.equal(game.state.reason,'missed');
  game.action({action:'reset'},11000);assert.equal(game.state.phase,'idle');assert.equal(game.state.revision,1);
});
test('minimum cast strength starts the float at ten metres',()=>{
  const game=new OceanFishingGame(()=>0);
  game.action({action:'cast',strength:.2,aim:0},1000);
  assert.equal(game.state.initialDistance,10);
  assert.equal(game.state.distance,10);
});

test('float critical window is server-timed, while late hooks remain valid',()=>{
  const early=setup();
  assert.equal(early.game.state.criticalWindow,false);
  for(let i=0;i<14;i++)early.step();
  assert.equal(early.game.state.criticalWindow,true);
  assert.equal(early.game.action({action:'hook'},early.now()),true);
  assert.equal(early.game.state.hookResult,'critical');
  assert.equal(early.game.state.criticalWindow,false);

  const late=setup();
  for(let i=0;i<36;i++)late.step();
  assert.equal(late.game.state.criticalWindow,false);
  assert.equal(late.game.action({action:'hook'},late.now()),true);
  assert.equal(late.game.state.hookResult,'normal');
});

test('retrieve is an explicit timed phase before returning to idle',()=>{
  const game=new OceanFishingGame(()=>0);let now=1000;
  game.action({action:'cast',strength:.5,aim:0},now);
  for(let i=0;i<40&&game.state.phase!=='waiting';i++){now+=50;game.step(.05, false, now);}
  assert.equal(game.state.phase,'waiting');
  assert.equal(game.action({action:'retrieve'},now),true);
  assert.equal(game.state.phase,'retrieving');
  for(let i=0;i<4;i++){now+=100;game.step(.1,false,now);}
  assert.equal(game.state.phase,'retrieving');
  for(let i=0;i<6;i++){now+=100;game.step(.1,false,now);}
  assert.equal(game.state.phase,'idle');
});
test('holding reel blindly breaks the line; never reeling cannot catch',()=>{
  for(const held of [true,false]){
    const {game,step,now}=setup();game.action({action:'hook'},now());
    for(let i=0;i<2200&&game.state.phase==='fighting';i++)step(held);
    assert.equal(game.state.phase,'escaped');assert.equal(game.state.catches,0);
    if(held)assert.equal(game.state.reason,'line');
    else assert.equal(game.state.reason,'slack');
  }
});

test('a near-zero line load reaches zero and breaks only after sustained slack',()=>{
  const {game,step,now}=setup(.5,'css-001');game.action({action:'hook'},now());
  for(let i=0;i<100&&game.state.phase==='fighting';i++)step(false);
  assert.equal(game.state.phase,'fighting','brief slack should remain recoverable');
  assert.equal(game.state.tension,0,'releasing the reel should allow the gauge to reach zero');
  for(let i=0;i<50&&game.state.phase==='fighting';i++)step(false);
  assert.equal(game.state.phase,'escaped');
  assert.equal(game.state.reason,'slack');
});

test('fish escapes at an absolute 50m line distance, including max-range casts',()=>{
  const {game,step,now}=setup(1);game.action({action:'hook'},now());
  assert.equal(game.state.initialDistance,35);
  game.state.distance=49.99;
  game.state.tension=.5;
  step(false);
  assert.equal(game.state.distance,50);
  assert.equal(game.state.phase,'escaped');
  assert.equal(game.state.reason,'distance');
});
test('responding to tension lands one Go fish, including parallel surge',()=>{
  for(const strength of [.2,.5,1]){
    const {game,step,now}=setup(strength);game.action({action:'hook'},now());
    let held=false,sawSchool=false;
    for(let i=0;i<2200&&game.state.phase==='fighting';i++){
      const s=game.state;
      if(s.tension>.67||s.mode!=='rest')held=false;
      else if(s.tension<.33)held=true;
      step(held);
      if(game.state.distance===0)assert.equal(game.state.phase,'caught','the catch result must commit on the same simulation step that reaches zero metres');
      if(game.state.school===7)sawSchool=true;
    }
    assert.equal(game.state.phase,'caught',JSON.stringify(game.state));assert.equal(game.state.distance,0,'the catch result must be committed at zero metres');assert.equal(game.state.catches,1);assert.equal(game.state.fishId,'fish-001');assert.ok(sawSchool);
    assert.ok(game.state.fightTime>10&&game.state.fightTime<100);
    game.action({action:'hook'},now());step(true);assert.equal(game.state.catches,1,'catch must not duplicate');
    game.action({action:'reset'},now());assert.equal(game.state.phase,'idle');assert.equal(game.state.catches,1);assert.equal(game.state.fishId,'whale-001','the next successful run should introduce Docker');
  }
});

test('Go fish attack phases take line and stay physically readable',()=>{
  const {game,step,now}=setup(.5);game.action({action:'hook'},now());
  const mode=()=>game.state.mode;
  while(mode()!=='warning')step(false);
  const warningDistance=game.state.distance;
  step(false);
  assert.equal(game.state.fish.gait,'turn','the warning telegraph should move the body');
  assert.ok(game.state.distance>warningDistance,'the warning should begin taking line');

  while(mode()!=='split')step(false);
  const attackDistance=game.state.distance;
  const attackTension=game.state.tension;
  for(let i=0;i<10;i++)step(true);
  assert.equal(game.state.fish.gait,'burst','the split attack should use the burst gait');
  assert.ok(game.state.distance>attackDistance+.1,'Go should take line even while the player reels during an attack');
  assert.ok(game.state.tension>attackTension,'the attack should load the line instead of becoming inert');
});

test('Docker whale starts heavy, settles into a steady pull, and remains catchable',()=>{
  const game=new OceanFishingGame(()=>.5,'whale-001');let now=1000;
  const step=(held=false)=>{now+=50;game.step(.05,held,now);};
  const phase=()=>game.state.phase;
  const mode=()=>game.state.mode;
  game.action({action:'cast',strength:.5,aim:0},now);
  while(phase()!=='biting')step();
  game.action({action:'hook'},now);
  assert.equal(game.state.mode,'surge');
  assert.equal(game.state.school,1);
  assert.ok(game.state.tension>=.5,'Docker should start with a clearly heavier line load');
  const openingDistance=game.state.distance;
  for(let i=0;i<8;i++)step(false);
  assert.ok(game.state.distance>openingDistance+.4,'the opening weight should take some line when the player does not reel');
  assert.equal(game.state.fish.gait,'heavy_start','Docker uses a distinct heavy-start gait');
  const openingWave=game.state.fish.bodyWave.phase;
  const beforeResistanceTension=game.state.tension;
  const beforeResistanceDistance=game.state.distance;
  for(let i=0;i<4;i++)step(true);
  assert.ok(game.state.tension>beforeResistanceTension,'Docker should load the line when the player reels during the heavy start');
  assert.ok(game.state.distance>beforeResistanceDistance,'Docker should still take line against the reel during the heavy start');
  for(let i=0;i<12;i++)step(false);
  assert.equal(game.state.fish.gait,'heavy_glide','Docker settles into a reusable steady-pull gait');
  assert.notEqual(game.state.fish.bodyWave.phase,openingWave,'the whale remains alive after the opening pull');
  assert.equal(game.state.school,1,'Docker must not switch into the Go school phase');

  let sawWarning=false;
  let sawHeavySurge=false;
  for(let i=0;i<3000&&phase()==='fighting';i++){
    if(game.state.fightTime>3&&game.state.mode==='surge'){
      sawHeavySurge=true;
      assert.equal(game.state.fish.gait,'heavy_surge','Docker middle burst must drive its heavy body gait');
    }
    const held=mode()==='rest'&&game.state.tension<.52;
    step(held);
    if(mode()==='warning'){
      sawWarning=true;
      assert.equal(game.state.fish.gait,'heavy_glide','Docker warning stays a steady pull, not the Go turn cue');
    }
  }
  assert.ok(sawWarning,'the Docker warning phase should be exercised');
  assert.equal(game.state.phase,'caught',JSON.stringify(game.state));
  assert.equal(game.state.fishId,'whale-001');
  assert.equal(sawHeavySurge,true,'Docker should have a short violent mid-fight burst');
});

test('K8S keeps a visible rear-body wave while approaching and station-keeping by the bait',()=>{
  const game=new OceanFishingGame(()=>.5,'k8s-001');let now=1000;
  const step=()=>{now+=50;game.step(.05,false,now);};
  game.action({action:'cast',strength:.5,aim:0},now);
  while(game.state.phase!=='biting')step();
  assert.equal(game.state.fish.gait,'heavy_cruise','K8S uses its heavy approach gait');
  assert.ok(game.state.fish.bodyWave.amplitude>.045,'the approach wave remains visible at a distance');

  while(game.state.phase==='biting'&&game.state.approach<1)step();
  for(let i=0;i<12;i++)step();
  assert.equal(game.state.phase,'biting');
  assert.equal(game.state.fish.gait,'heavy_station','K8S keeps swimming after reaching the bait');
  assert.ok(game.state.fish.bodyWave.frequency>1,'station-keeping does not settle into the slow coast gait');
  assert.ok(game.state.fish.bodyWave.amplitude>.055,'the rear-body wave remains visible while holding near the bait');
});

test('CSS fish changes style states while keeping one readable, catchable body',()=>{
  const profile=getFishFightProfile('css-001');
  assert.equal(profile.initialTension,.30,'CSS fish starts with a light line load');
  assert.equal(profile.minimumReelingTension,.12,'CSS fish retains a small load while being reeled');
  assert.ok((profile.surgeReelSpeed??0)>(profile.surgeRetreatSpeed??0),'CSS fish remains slightly recoverable during its red burst');
  assert.ok((profile.fatigueRate??0)>.2,'CSS fish should fatigue earlier than the stronger species');
  const game=new OceanFishingGame(()=>.5,'css-001');let now=1000;
  const step=(held=false)=>{now+=50;game.step(.05,held,now);};
  const phase=()=>game.state.phase;
  game.action({action:'cast',strength:.5,aim:0},now);
  while(phase()!=='biting')step();
  game.action({action:'hook'},now);
  assert.equal(game.state.fishId,'css-001');
  assert.equal(game.state.school,1,'CSS fish must not split into the Go school');
  assert.equal(game.state.mode,'surge');
  const openingDistance=game.state.distance;
  for(let i=0;i<35;i++)step(false);
  assert.equal(game.state.mode,'rest');
  assert.equal(game.state.fish.gait,'css_cruise','CSS fish keeps a readable cruising wave after its opening burst');
  assert.ok(game.state.fish.bodyWave.frequency>1.2,'CSS fish keeps swimming after the opening burst');
  assert.ok(game.state.fish.bodyWave.amplitude>.035,'CSS fish does not fade into an almost static coast wave');
  assert.ok(game.state.distance>openingDistance,'the opening should feel slightly heavy before recovery');
  assert.ok(game.state.tension<profile.initialTension,'CSS line tension relaxes while the reel is released');

  let sawMidFightSurge=false;
  let surgeReelAvailable=false;
  let surgeRecoveredWhileReeling=false;
  for(let i=0;i<35;i++){
    const previousDistance=game.state.distance;
    step(game.state.mode==='surge');
    sawMidFightSurge ||= game.state.fightTime>2.5&&game.state.mode==='surge';
    surgeReelAvailable ||= game.state.fightTime>2.8&&game.state.mode==='surge'&&game.state.canReel;
    surgeRecoveredWhileReeling ||= game.state.fightTime>2.8&&game.state.mode==='surge'&&game.state.reeling&&game.state.distance<previousDistance;
  }
  assert.ok(sawMidFightSurge,'CSS fish should briefly turn red and resist during the middle of the fight');
  assert.ok(surgeReelAvailable,'CSS fish should keep the reel control available during its red resistance burst');
  assert.ok(surgeRecoveredWhileReeling,'CSS fish should still let the player recover a little line during its red resistance burst');

  for(let i=0;i<3000&&phase()==='fighting';i++){
    const held=game.state.mode==='rest'&&game.state.tension<.6;
    step(held);
  }
  assert.equal(game.state.phase,'caught',JSON.stringify(game.state));
  assert.equal(game.state.fishId,'css-001');
});

test('Rust striped marlin keeps its head stable, bursts with the rear body, and remains catchable',()=>{
  const profile=getFishFightProfile('rust-001');
  assert.equal(profile.initialTension,.40);
  assert.ok((profile.openingRetreatSpeed??0)>4.4,'the billfish opening should remain a sharp, line-taking run');
  assert.ok((profile.lateralAcceleration??0)>3,'the billfish should turn cleanly after a run');
  assert.equal(profile.gaitAt({mode:'rest',opening:false,reeling:false}),'cruise','recovery should remain an active swim, not coast');
  assert.equal(profile.gaitAt({mode:'surge',opening:false,reeling:false}),'billfish_burst','a repeat attack should use the marlin-specific tail-drive gait');
  assert.equal(profile.modeAt(.96,-1).mode,'rest','the opening run must transition into a genuine recovery window');
  assert.equal(profile.modeAt(2,-1).mode,'rest','the opening dash should be followed by a readable recovery window');
  assert.equal(profile.modeAt(3.5,-1).mode,'surge','a forceful repeat dash should arrive early in the fight');
  assert.equal(profile.modeAt(4.5,-1).mode,'rest','the repeat dash should leave a distinct reel window');
  assert.equal(profile.modeAt(0,-1).school,1,'Rust is one owned fish, not a school split');
  const game=new OceanFishingGame(()=>.5,'rust-001','fixed');let now=1000,sawRecovery=false,sawSecondSurge=false;
  const step=(held=false)=>{now+=50;game.step(.05,held,now);};
  const phase=()=>game.state.phase;
  game.action({action:'cast',strength:.5,aim:0},now);
  while(phase()!=='biting')step();
  game.action({action:'hook'},now);
  assert.equal(game.state.fishId,'rust-001');
  assert.equal(game.state.school,1);
  assert.equal(game.state.fish.gait,'hooked_burst');
  const openingDistance=game.state.distance,openingDepth=game.state.fish.position.y;
  let openingWavePeak=game.state.fish.bodyWave.amplitude;
  for(let i=0;i<40&&game.state.fightTime<1.05;i++){
    step(false);
    openingWavePeak=Math.max(openingWavePeak,game.state.fish.bodyWave.amplitude);
  }
  assert.ok(game.state.distance-openingDistance>2.4,'the opening run should visibly take several meters of line');
  assert.ok(openingWavePeak>.28,'the opening rush should carry a distinct, forceful tail wave');
  assert.ok(game.state.fish.position.y>openingDepth+.25,'the marlin should angle up during its opening rush');
  assert.equal(game.state.mode,'rest');
  assert.equal(game.state.fish.gait,'cruise');
  assert.ok(game.state.fish.bodyWave.amplitude>.03,'the marlin keeps a readable body wave in its recovery window');
  assert.ok(game.state.fish.bodyWave.frequency>=1.5,'the tail keeps a purposeful cruise beat between dashes');
  let secondRushStartDistance:number|null=null,secondRushPeakGain=0;
  for(let i=0;i<3000&&phase()==='fighting';i++){
    sawRecovery ||= game.state.mode==='rest';
    sawSecondSurge ||= game.state.fightTime>3.2&&String(game.state.mode)==='surge';
    if(game.state.fightTime>=3.2&&String(game.state.mode)==='surge'&&secondRushStartDistance===null){
      secondRushStartDistance=game.state.distance;
    }
    step(game.state.mode==='rest'&&game.state.tension<.58);
    if(secondRushStartDistance!==null){
      secondRushPeakGain=Math.max(secondRushPeakGain,game.state.distance-secondRushStartDistance);
    }
    assert.equal(game.state.school,1);
  }
  assert.equal(game.state.phase,'caught',JSON.stringify(game.state));
  assert.equal(sawRecovery,true);
  assert.equal(sawSecondSurge,true);
  assert.ok(secondRushPeakGain>2,'the repeat rush should make another distinct run before recovery');
});

test('JS eel remains a single catchable body while its whole length undulates',()=>{
  const profile=getFishFightProfile('js-001');
  assert.ok(profile.openingLateralAmplitude>1.4,'the eel should show a readable whole-body turn');
  assert.equal(profile.modeAt(0,-1).school,1);
  const game=new OceanFishingGame(()=>.5,'js-001','fixed');let now=1000;
  const step=(held=false)=>{now+=50;game.step(.05,held,now);};
  const phase=()=>game.state.phase;
  game.action({action:'cast',strength:.5,aim:0},now);
  while(phase()!=='biting')step();
  game.action({action:'hook'},now);
  assert.equal(game.state.fishId,'js-001');
  assert.equal(game.state.school,1);
  assert.equal(game.state.fish.gait,'hooked_burst');
  const openingDistance=game.state.distance;
  for(let i=0;i<60&&game.state.mode==='surge';i++)step(false);
  assert.ok(game.state.distance>openingDistance,'the opening undulation should take line');
  assert.equal(game.state.mode,'rest');
  assert.ok(game.state.fish.bodyWave.amplitude>.02);
  for(let i=0;i<3000&&phase()==='fighting';i++){
    step(game.state.mode==='rest'&&game.state.tension<.52);
    assert.equal(game.state.school,1);
  }
  assert.equal(game.state.phase,'caught',JSON.stringify(game.state));
});

test('K8s leviathan keeps one hooked body while its timed surges remain catchable',()=>{
  const profile=getFishFightProfile('k8s-001');
  assert.equal(profile.modeAt(0,-1).school,1,'replicas are visual shadows, not separately hooked fish');
  assert.equal(profile.modeAt(0,-1).mode,'warning','the cluster should gather before revealing its first attack');
  assert.equal(profile.modeAt(.5,-1).mode,'warning');
  assert.equal(profile.modeAt(1,-1).mode,'surge','the first attack follows its tell');
  assert.equal(profile.modeAt(1.8,-1).mode,'rest','the opening burst has a recovery window');
  assert.equal(profile.modeAt(2.5,-1).mode,'surge','the cluster commits before its surface attack');
  assert.equal(profile.modeAt(3,-1).mode,'warning','the echoes gather before the breach');
  assert.equal(profile.modeAt(3.5,-1).mode,'split','the surface lunge must reach the visual formation');
  assert.equal(profile.modeAt(5,-1).mode,'rest','the player gets a recovery window after the breach');
  assert.equal(profile.modeAt(10,0).mode,'warning','the near-catch finale signals its last attack');
  assert.equal(profile.modeAt(11,1).mode,'split','the final warning resolves into a last attack');
  assert.equal(profile.modeAt(12.3,2.3).mode,'rest','the final attack resolves instead of looping indefinitely');
  assert.equal(profile.gaitAt({mode:'split',opening:false,reeling:false}),'heavy_lunge','the surface lunge drives a distinct body kick');
  const game=new OceanFishingGame(()=>.5,'k8s-001','fixed');let now=1000,sawMidFightSurge=false,sawSplit=false,sawSurfaceLunge=false,maxSurfaceLungeY=Number.NEGATIVE_INFINITY;
  const step=(held=false)=>{now+=50;game.step(.05,held,now);};
  const phase=()=>game.state.phase;
  game.action({action:'cast',strength:.5,aim:0},now);
  while(phase()!=='biting')step();
  const approachHeading={...game.state.fish.heading};
  game.action({action:'hook'},now);
  assert.equal(game.state.fishId,'k8s-001');
  const hookedHeading=game.state.fish.heading;
  assert.ok(approachHeading.x*hookedHeading.x+approachHeading.y*hookedHeading.y+approachHeading.z*hookedHeading.z>.999,'hooking should preserve the approach heading instead of snapping sideways');
  step();
  const settledHookHeading=game.state.fish.heading;
  assert.ok(hookedHeading.x*settledHookHeading.x+hookedHeading.y*settledHookHeading.y+hookedHeading.z*settledHookHeading.z>.98,'the first fight step should turn gradually');
  for(let i=0;i<3000&&phase()==='fighting';i++){
    sawMidFightSurge ||= game.state.fightTime>2&&game.state.mode==='surge';
    sawSplit ||= game.state.mode==='split';
    if(game.state.mode==='split'){
      maxSurfaceLungeY=Math.max(maxSurfaceLungeY,game.state.fish.position.y);
      sawSurfaceLunge ||= game.state.fish.position.y>-.45&&game.state.fish.position.y<.45;
    }
    step(game.state.mode==='rest'&&game.state.tension<.62);
    assert.equal(game.state.school,1);
  }
  assert.equal(game.state.phase,'caught',JSON.stringify(game.state));
  assert.equal(game.state.catches,1);
  assert.equal(game.state.fishId,'k8s-001');
  assert.ok(sawMidFightSurge);
  assert.ok(sawSplit);
  assert.ok(sawSurfaceLunge,'the server-owned lunge should skim through the waterline without launching upright');
  assert.ok(maxSurfaceLungeY<.45,`the lunge should not leap high above the surface (max y=${maxSurfaceLungeY})`);
});

test('fish-specific routes keep the selected species after a catch',()=>{
  const cssGame=new OceanFishingGame(()=>.5,'css-001','fixed');let now=1000;
  const step=()=>{now+=50;cssGame.step(.05,false,now);};
  const phase=()=>cssGame.state.phase;
  cssGame.action({action:'cast',strength:.5,aim:0},now);
  while(phase()!=='biting')step();
  cssGame.action({action:'hook'},now);
  for(let i=0;i<3000&&phase()==='fighting';i++){
    const held=cssGame.state.mode==='rest'&&cssGame.state.tension<.6;
    now+=50;cssGame.step(.05,held,now);
  }
  assert.equal(cssGame.state.phase,'caught');
  cssGame.action({action:'reset'},now);
  assert.equal(cssGame.state.fishId,'css-001');
});

test('every fish keeps swimming while released line tension can reach zero',()=>{
  const species:FishSpeciesId[]=['fish-001','whale-001','css-001','k8s-001','rust-001','js-001'];
  for(const fishId of species){
    const game=new OceanFishingGame(()=>.5,fishId);let now=1000,observedRest=false;
    const step=()=>{now+=50;game.step(.05,false,now);};
    game.action({action:'cast',strength:.5,aim:0},now);
    while(game.state.phase!=='biting')step();
    game.action({action:'hook'},now);
    const minimum=getFishFightProfile(fishId).minimumReelingTension;
    for(let i=0;i<120&&['fighting'].includes(game.state.phase);i++){
      step();
      if(game.state.mode!=='rest')continue;
      observedRest=true;
      assert.ok((game.state.fish.swim?.effort??0)>0,`${fishId} must keep swimming while resting`);
    }
    assert.equal(observedRest,true,`${fishId} should expose a readable rest phase`);
    assert.ok(game.state.tension>=0,`${fishId} line tension should remain non-negative`);
    assert.ok(minimum>0,`${fishId} keeps its species-specific load floor while reeling`);
  }
});

test('Go keeps a visible tail beat and uneven resistance while the player reels it closer',()=>{
  const profile=getFishFightProfile('fish-001');
  assert.equal(profile.gaitAt({mode:'rest',opening:false,reeling:true}),'go_reel_resist');
  assert.ok((profile.reelingLateralAmplitude??0)>profile.baseLateralAmplitude,'reeling through a lull should trigger a wider Go-specific side run');
  assert.ok((profile.surgeLateralAmplitude??0)>profile.baseLateralAmplitude,'Go should also pull wider while taking line');
  assert.ok((profile.strokePush??0)>.5,'Go tail strokes should feed a pulse back into line recovery');
  const {game,step,now}=setup(.5);game.action({action:'hook'},now());
  while(game.state.mode==='surge'&&game.state.phase==='fighting')step(false);
  const startDistance=game.state.distance;
  let minFishX=game.state.fishX,maxFishX=game.state.fishX;
  let previousDistance=startDistance,minLineVelocity=Infinity,maxLineVelocity=-Infinity;
  for(let i=0;i<20;i++){
    step(true);
    assert.equal(game.state.fish.gait,'go_reel_resist');
    assert.ok(game.state.fish.bodyWave.amplitude>.1,'the tail wave should remain visible during the recovery reel');
    assert.ok(game.state.fish.bodyWave.frequency>3,'the recovery stroke should read as active resistance');
    minFishX=Math.min(minFishX,game.state.fishX);
    maxFishX=Math.max(maxFishX,game.state.fishX);
    const lineVelocity=(game.state.distance-previousDistance)/.05;
    minLineVelocity=Math.min(minLineVelocity,lineVelocity);
    maxLineVelocity=Math.max(maxLineVelocity,lineVelocity);
    previousDistance=game.state.distance;
  }
  assert.ok(maxFishX-minFishX>.35,'the Go body should make a visible side-run while resisting the reel');
  assert.ok(game.state.distance<startDistance-1,'the player still makes clear progress toward landing Go');
  assert.ok(maxLineVelocity-minLineVelocity>.15,'tail strokes should pulse the line-in rate');
});

test('Go keeps a stronger tail burst throughout its visible escape',()=>{
  const {game,step,now}=setup(.5);game.action({action:'hook'},now());
  game.state.distance=49.99;
  step(false);
  assert.equal(game.state.phase,'escaped');
  assert.equal(game.state.reason,'distance');
  assert.equal(game.state.fish.gait,'hooked_burst');
  for(let i=0;i<10;i++)step(false);
  assert.equal(game.state.fish.gait,'hooked_burst','the escape should remain active after the initial C-start');
  assert.ok(game.state.fish.bodyWave.frequency>5);
});

test('a surge takes line while reeling, then the lull lets the player recover it',()=>{
  const {game,step,now}=setup(.5);game.action({action:'hook'},now());
  const startDistance=game.state.distance;
  for(let i=0;i<8;i++)step(true);
  assert.ok(game.state.distance>startDistance+.3,'the burst should visibly move the fish away');
  assert.equal(game.state.fish.position.z,-game.state.distance,'rendered root follows authoritative distance');

  for(let i=0;i<40&&game.state.mode==='surge';i++)step(true);
  assert.equal(game.state.mode,'rest');
  const lullDistance=game.state.distance;
  step(true);
  assert.ok(game.state.distance<lullDistance,'the lull should let reeling recover line');
  assert.equal(game.state.fish.position.z,-game.state.distance);
});

test('the fight exposes recovery windows without a separate rod-direction input',()=>{
  const {game,step,now}=setup(.5);
  game.action({action:'hook'},now());
  assert.equal(game.state.canReel,false,'the player should wait while the fish is still running');
  while(game.state.mode==='surge'&&game.state.phase==='fighting')step(false);
  assert.equal(game.state.canReel,true,'the lull should expose a readable reel window');
  const distance=game.state.distance;
  step(true);
  assert.ok(game.state.distance<distance,'reeling during the recovery window should recover line');
});

test('publishes authoritative fish pose and body-wave timing during a fight',()=>{
  const {game,step,now}=setup();game.action({action:'hook'},now());
  step(false);
  const snapshot=game.snapshot();
  assert.equal(snapshot.fish.position.x,snapshot.fishX);
  assert.equal(snapshot.fish.position.z,-snapshot.distance);
  assert.ok(Number.isFinite(snapshot.fish.position.y));
  assert.ok(Number.isFinite(snapshot.fish.heading.x));
  assert.ok(snapshot.fish.bodyWave.frequency>0);
  assert.ok(snapshot.fish.bodyWave.phase!==0);
});

test('fish approaches the lure only shortly before the bite and keeps its pose when hooked',()=>{
  const game=new OceanFishingGame(()=>.5);let now=1000;
  const step=()=>{now+=50;game.step(.05,false,now);};
  game.action({action:'cast',strength:.5,aim:0},now);
  while(game.state.phase==='casting')step();
  const hiddenStart={...game.state.fish.position};
  while(game.state.phase==='waiting'&&game.state.approach===0){
    step();
    if(game.state.approach===0)assert.deepEqual(game.state.fish.position,hiddenStart,'no fish movement is revealed during the quiet wait');
  }
  assert.equal(game.state.phase,'waiting');
  assert.ok(game.state.approach>0&&game.state.approach<.1,'the first cue is only a faint, distant shadow');
  assert.ok(Math.abs(game.state.fish.position.x-hiddenStart.x)<.1,'the first shadow begins far from the bait');

  let previousDistance=Math.abs(game.state.fish.position.x);
  while(game.state.phase==='waiting'){
    step();
    const distance=Math.abs(game.state.fish.position.x);
    assert.ok(distance<=previousDistance+1e-8,'the approaching fish steadily closes on the bait');
    assert.ok(game.state.approach>=0&&game.state.approach<=.46);
    previousDistance=distance;
  }
  assert.equal(game.state.phase,'biting');
  const biteEntryDistance=Math.abs(game.state.fish.position.x);
  assert.ok(game.state.approach>.4&&game.state.approach<=.46);
  step();
  assert.ok(game.state.approach>.46);
  assert.ok(Math.abs(game.state.fish.position.x)<biteEntryDistance,'the fish continues toward the lure after the float dips');

  const beforeHook={...game.state.fish.position};
  assert.equal(game.action({action:'hook'},now),true);
  assert.deepEqual(game.state.fish.position,beforeHook,'hooking does not teleport the fish into its fight position');
  assert.equal(game.state.fishX,beforeHook.x);
  assert.equal(game.state.distance,-beforeHook.z);
  step();
  assert.ok(Math.hypot(game.state.fish.position.x-beforeHook.x,game.state.fish.position.z-beforeHook.z)<.5,'the fight begins from the approach pose');
});
