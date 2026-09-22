import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OceanFishingGame} from './ocean-game.js';

function setup(strength=.5){
  const game=new OceanFishingGame(()=>.5);let now=1000;
  const step=(held=false)=>{now+=50;game.step(.05,held,now);};
  game.action({action:'cast',strength,aim:0},now);
  while(game.state.phase!=='biting')step();
  return{game,step,now:()=>now};
}
test('sea loop: ignores premature hook, missed bite escapes, reset is repeatable',()=>{
  const game=new OceanFishingGame(()=>0);
  assert.equal(game.action({action:'hook'},0),false);
  game.action({action:'cast',strength:.5,aim:0},1000);
  for(let i=0;i<180;i++)game.step(.05,false,1000+i*50);
  assert.equal(game.state.phase,'escaped');assert.equal(game.state.reason,'missed');
  game.action({action:'reset'},11000);assert.equal(game.state.phase,'idle');assert.equal(game.state.revision,1);
});
test('cast can select the K8s species and exposes it in the authoritative state',()=>{
  const game=new OceanFishingGame(()=>0);
  assert.equal(game.action({action:'cast',strength:.65,aim:0},1000),true);
  assert.equal(game.state.species,'k8s');
});
test('authoritative fish motion advances through waiting, bite, and fight states',()=>{
  const game=new OceanFishingGame(()=>.5);let currentNow=1000;
  const step=(held=false)=>{currentNow+=50;game.step(.05,held,currentNow);};
  const now=()=>currentNow;
  game.action({action:'cast',strength:.5,aim:0},currentNow);
  const cast=game.snapshot();
  while(game.state.phase!=='waiting')step();
  for(let i=0;i<8;i++)step();
  const waiting=game.snapshot();
  assert.equal(waiting.phase,'waiting');
  assert.notEqual(waiting.fishWavePhase,cast.fishWavePhase);
  while(game.snapshot().phase!=='biting')step();
  step();
  const biting=game.snapshot();
  assert.equal(biting.phase,'biting');
  assert.ok(biting.fishSpeed>0);
  assert.ok(biting.fishWaveFrequency>waiting.fishWaveFrequency);
  game.action({action:'hook'},now());
  const hooked=game.snapshot();
  assert.equal(hooked.phase,'fighting');
  assert.equal(hooked.mode,'surge');
  assert.ok(hooked.fishWaveFrequency>=biting.fishWaveFrequency);
  for(let i=0;i<10;i++)step(false);
  assert.ok(Number.isFinite(game.state.fishX));
  assert.ok(Number.isFinite(game.state.fishHeadingX));
});
test('holding reel blindly breaks the line; never reeling cannot catch',()=>{
  for(const held of [true,false]){
    const {game,step,now}=setup();game.action({action:'hook'},now());
    for(let i=0;i<2200&&game.state.phase==='fighting';i++)step(held);
    assert.equal(game.state.phase,'escaped');assert.equal(game.state.catches,0);
    if(held)assert.equal(game.state.reason,'line');
  }
});
test('responding to tension lands one fish, including parallel surge',()=>{
  for(const strength of [.2,.5,1]){
    const {game,step,now}=setup(strength);game.action({action:'hook'},now());
    let held=false,sawSchool=false;
    for(let i=0;i<2200&&game.state.phase==='fighting';i++){
      const s=game.state;
      if(s.tension>.67||s.mode!=='rest')held=false;
      else if(s.tension<.33)held=true;
      step(held);if(game.state.school===7)sawSchool=true;
    }
    assert.equal(game.state.phase,'caught',JSON.stringify(game.state));assert.equal(game.state.catches,1);assert.ok(sawSchool);
    assert.ok(game.state.fightTime>5.8&&game.state.fightTime<45);
    game.action({action:'hook'},now());step(true);assert.equal(game.state.catches,1,'catch must not duplicate');
    game.action({action:'reset'},now());assert.equal(game.state.phase,'idle');assert.equal(game.state.catches,1);
  }
});
