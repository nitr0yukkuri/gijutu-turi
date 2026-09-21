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
test('holding reel blindly breaks the line; never reeling cannot catch',()=>{
  for(const held of [true,false]){
    const {game,step,now}=setup();game.action({action:'hook'},now());
    for(let i=0;i<2200&&game.state.phase==='fighting';i++)step(held);
    assert.equal(game.state.phase,'escaped');assert.equal(game.state.catches,0);
    if(held)assert.equal(game.state.reason,'line');
  }
});
test('responding to tension lands one Go fish, including parallel surge',()=>{
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
    assert.ok(game.state.fightTime>10&&game.state.fightTime<100);
    game.action({action:'hook'},now());step(true);assert.equal(game.state.catches,1,'catch must not duplicate');
    game.action({action:'reset'},now());assert.equal(game.state.phase,'idle');assert.equal(game.state.catches,1);
  }
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
