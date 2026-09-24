// @ts-nocheck -- exercise the same vendored geometry/shader hooks as WebGL.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGoFish} from './rendering/go-fish.js';
import {fishOrientation} from './rendering/ocean-scene.js';
import {OceanFishingGame} from './ocean-game.js';
import {applyFishWater,fishApparentPoint,fishWaterCoverage} from './rendering/fish-water.js';
import {fishFightCues} from './rendering/fish-fight-cues.js';
import {FishLocomotion} from './fish.js';
import {fishVisibilityTarget} from './fish-approach.js';

test('fish visibility progresses from hidden wait to shadow, reveal, then full fight visibility',()=>{
  assert.equal(fishVisibilityTarget('waiting',0),0);
  const firstShadow=fishVisibilityTarget('waiting',.08);
  const preBiteShadow=fishVisibilityTarget('waiting',.46);
  const biteEntry=fishVisibilityTarget('biting',.46);
  const approaching=fishVisibilityTarget('biting',.72);
  const nearBait=fishVisibilityTarget('biting',1);
  assert.ok(firstShadow>0&&firstShadow<.06,'early approach stays a faint silhouette');
  assert.ok(preBiteShadow>.31&&preBiteShadow<.33);
  assert.equal(biteEntry,preBiteShadow,'the float dip does not pop the fish brighter');
  assert.ok(approaching>biteEntry&&approaching<nearBait,'the fish clarifies smoothly as it closes in');
  assert.equal(fishVisibilityTarget('fighting',.46),1);
});

test('fish heading preserves dorsal-up through both sides of a pitched turn',()=>{
  for(let angle=-Math.PI;angle<=Math.PI;angle+=.03)for(const pitch of [-.4,0,.4]){
    const heading=new THREE.Vector3(Math.cos(angle)*Math.cos(pitch),Math.sin(pitch),Math.sin(angle)*Math.cos(pitch));
    const q=fishOrientation(heading);
    assert.ok(new THREE.Vector3(-1,0,0).applyQuaternion(q).distanceTo(heading)<1e-6);
    assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(q).y>.9,'dorsal fin must not roll below the belly');
  }
});

test('ocean optics cover every anatomical material but do not alter catalog materials',()=>{
  const waterUniforms={uWaterBackdrop:{value:null},uTime:{value:0}};
  const submerged=createGoFish({waterUniforms}),catalog=createGoFish();
  for(const material of new Set(submerged.group.children.map(mesh=>mesh.material))){
    const source=material.isShaderMaterial?material:THREE.ShaderLib[material.isMeshPhysicalMaterial?'physical':material.isMeshStandardMaterial?'standard':'basic'];
    const shader={uniforms:{...source.uniforms},vertexShader:source.vertexShader,fragmentShader:source.fragmentShader};
    material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uWaterBackdrop,waterUniforms.uWaterBackdrop);
    assert.match(shader.vertexShader,/gl_Position=fishWaterProjection\((transformed|p)\)/);
    assert.equal(shader.uniforms.uFishCenter.value,submerged.group.position,'one coherent optical origin for every part');
    assert.match(shader.fragmentShader,/gl_FragColor.rgb=throughWater\(gl_FragColor.rgb\)/);
    assert.match(shader.fragmentShader,/background\*\(1.0-coverage\)\+transmission\*extinction/,'anatomy contributes contrast while water reflection survives');
    assert.equal(shader.uniforms.uNaturalSwim.value,1);
  }
  for(const mesh of catalog.group.children)assert.ok(!mesh.material.customProgramCacheKey().includes('underwater'));
  assert.equal(catalog.group.children.find(mesh=>mesh.name==='merged-lights').material.toneMapped,false);
  submerged.dispose();catalog.dispose();
});

test('refracted Go silhouette retains volume, an intact nose/tail, and its emerged pose',()=>{
  const eye={x:0,y:3.17,z:6.4};
  for(const z of [-6,-18,-35]){
    const center={x:0,y:-2.2,z};
    const upper=fishApparentPoint({...center,y:-1.87},center,eye),lower=fishApparentPoint({...center,y:-2.53},center,eye);
    assert.ok(Math.abs((upper.y-lower.y)/.66-.72)<1e-8,'distant body must not collapse into a ribbon');
    assert.equal(upper.x,center.x);assert.equal(upper.z,center.z);
    assert.ok(upper.y<-.3,'apparent silhouette stays below the surface');
    const air={x:1,y:1.2,z};assert.deepEqual(fishApparentPoint(air,{x:1,y:2,z},eye),air);
  }
});

test('reeling changes translation without making the hooked fish turn toward the player',()=>{
  const games=[new OceanFishingGame(()=>.5),new OceanFishingGame(()=>.5)];
  for(const game of games){game.action({action:'cast',strength:1,aim:0},0);while(game.state.phase!=='biting')game.step(.05,false,0);game.action({action:'hook'},0);}
  let resistsReel=0,takesLine=0;
  for(let tick=0;tick<45;tick++){
    games[0].step(.05,false,tick*50);games[1].step(.05,true,tick*50);
    const a=games[0].snapshot().fish,b=games[1].snapshot().fish;
    assert.ok(b.heading.z<0,'self-propulsion remains away from the rod');
    const yawA=Math.atan2(a.heading.x,-a.heading.z),yawB=Math.atan2(b.heading.x,-b.heading.z);
    assert.ok(Math.abs(yawA-yawB)<1e-8,'reel toggles cannot flip yaw (pitch may change with depth)');
    if(b.velocity.z>0&&b.heading.z<0)resistsReel++;
    if(b.velocity.z<0&&b.heading.z<0)takesLine++;
    assert.ok(b.swim.effort>=a.swim.effort);
  }
  assert.ok(takesLine>20,'fish takes line during the opening burst while the player reels');
  assert.ok(resistsReel>10,'fish keeps swimming away while the player recovers line during the lull');
});

test('full fish silhouette stays submerged through the complete bite and fight',()=>{
  const model=createGoFish({detail:'low'}),corners=[];
  for(const mesh of model.group.children){
    mesh.geometry.computeBoundingBox();const {min,max}=mesh.geometry.boundingBox;
    for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z])corners.push(new THREE.Vector3(x,y,z));
  }
  for(const strength of [.2,.5,1]){
    const game=new OceanFishingGame(()=>.5);let now=1000,held=false;
    game.action({action:'cast',strength,aim:0},now);
    while(game.state.phase!=='biting'){now+=50;game.step(.05,false,now);}
    const before=game.snapshot().fish,firstBitePosition={...before.position};
    now+=50;game.step(.05,false,now);
    assert.ok(Math.abs(game.snapshot().fish.position.x)<Math.abs(firstBitePosition.x),'fish continues approaching during the bite');
    assert.notEqual(game.snapshot().fish.bodyWave.phase,before.bodyWave.phase,'bite is not a frozen mesh');
    while(game.state.phase==='biting'&&game.state.approach<1){now+=50;game.step(.05,false,now);}
    const settledPosition={...game.state.fish.position};
    now+=50;game.step(.05,false,now);
    assert.deepEqual(game.snapshot().fish.position,settledPosition,'the fish holds near the lure once its approach finishes');
    game.action({action:'hook'},now);
    const orientation=fishOrientation(game.state.fish.heading);
    for(let tick=0;tick<2000&&game.state.phase==='fighting';tick++){
      if(game.state.tension>.67||game.state.mode!=='rest')held=false;else if(game.state.tension<.33)held=true;
      now+=50;game.step(.05,held,now);
      const fish=game.state.fish;
      const target=fishOrientation(fish.heading).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1,0,0),(fish.swim?.turn||0)*.12));
      orientation.slerp(target,1-Math.exp(-.05*12));
      // Tail wave + turn bend + flutter + maximum paired-fin bracing (.22).
      const bendMargin=Math.abs(new THREE.Vector3(0,0,1).applyQuaternion(orientation).y)*1.36*.66;
      for(const corner of corners){
        const top=corner.clone().multiplyScalar(.66).applyQuaternion(orientation).y+fish.position.y+bendMargin;
        assert.ok(top<-.3,`body/fin above wave trough at ${game.state.mode}: ${top}`);
      }
    }
    assert.equal(game.state.phase,'caught');
  }
  model.dispose();
});

test('normal fight depths retain anatomical coverage without making deep fish opaque',()=>{
  for(const depth of [1.65,2.2,2.4])for(const distance of [8,20,35])for(const transmission of [0,.2,.8,1]){
    const body=fishWaterCoverage(depth,distance,transmission);
    assert.ok(body>.29&&body<=.62,'readable bounded body contribution even under strong reflection');
    assert.ok(fishWaterCoverage(depth,distance,transmission,'fin')>.24,'tail is not only a glowing edge');
    assert.equal(fishWaterCoverage(depth,distance,transmission,'line'),0,'no artificial dark stripe along fishing line');
  }
  assert.ok(fishWaterCoverage(6,20,.5)<fishWaterCoverage(2.2,20,.5)*.3);
  assert.ok(fishWaterCoverage(2.2,72,.5)<fishWaterCoverage(2.2,20,.5)*.2);
});

test('rod pulses, leader sag and fin bracing use the same tail phase and tension',()=>{
  const fish=new FishLocomotion({x:0,y:-2,z:-12},{x:0,y:0,z:-1}).snapshot();
  fish.swim={velocity:{x:0,y:0,z:-2},effort:1,turn:0};
  fish.bodyWave.wavelength=.8;
  fish.bodyWave.phase=Math.PI*2/.8-Math.PI/2;
  const driven=fishFightCues(fish,.8),loose=fishFightCues(fish,.1),slack=fishFightCues(fish,0);
  assert.equal(driven.stroke,1);assert.ok(driven.rodSide>0);
  assert.ok(driven.airSag<loose.airSag);assert.ok(driven.wetSag<loose.wetSag);
  assert.ok(driven.lineOpacity>loose.lineOpacity);assert.ok(driven.load>loose.load);
  assert.equal(slack.strain,0);assert.equal(slack.rodSide,0,'no force transmitted by slack line');
  fish.bodyWave.phase+=Math.PI;
  const otherStroke=fishFightCues(fish,.8);
  assert.ok(Math.abs(otherStroke.rodSide+driven.rodSide)<1e-10);
  assert.equal(otherStroke.strain,driven.strain,'both tail strokes load the rod');
  assert.equal(fishFightCues(null,0).strain,0);
});

test('tether bracing applies only to the hooked ocean model, never the catalog',()=>{
  for(const ocean of [false,true]){
    const model=createGoFish(ocean?{waterUniforms:{uWaterBackdrop:{value:null}}}:{});
    model.update(0,{tetherLoad:.7});
    const shader={uniforms:{...THREE.ShaderLib.physical.uniforms},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
    model.body.material.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uTetherLoad.value,ocean?.7:0);
    model.dispose();
  }
});

test('underwater leader accepts Three line shaders with valid preprocessor boundaries',()=>{
  const material=new THREE.LineBasicMaterial(),source=THREE.ShaderLib.basic;
  applyFishWater(material,{},'line');
  const shader={uniforms:{...source.uniforms},vertexShader:source.vertexShader,fragmentShader:source.fragmentShader};
  material.onBeforeCompile(shader);
  for(const text of [shader.vertexShader,shader.fragmentShader])assert.doesNotMatch(text,/\}#include/);
  assert.equal(shader.uniforms.uWaterPart.value,4);
  assert.match(shader.vertexShader,/fishWaterProjection\(transformed\)/);
  material.dispose();
});

test('propulsion snapshots are isolated and reset does not leak a previous fight',()=>{
  const fish=new FishLocomotion({x:0,y:-2,z:-12},{x:0,y:0,z:1});
  const swim={velocity:{x:0,y:0,z:-2},effort:.6,turn:.3};
  fish.setRootMotion({x:0,y:-2,z:-10},{x:0,y:0,z:1},swim);
  swim.velocity.z=5;
  const snapshot=fish.snapshot();assert.equal(snapshot.heading.z,-1);assert.equal(snapshot.velocity.z,1);
  snapshot.swim.velocity.z=8;assert.equal(fish.snapshot().swim.velocity.z,-2);
  fish.reset({x:0,y:-2,z:-12},{x:1,y:0,z:0});
  assert.equal(fish.snapshot().swim,undefined);assert.equal(fish.snapshot().heading.x,1);
});

test('steering velocity and yaw stay bounded through fight mode transitions',()=>{
  const game=new OceanFishingGame(()=>.5);let now=0,held=false;
  game.action({action:'cast',strength:1,aim:0},now);
  while(game.state.phase!=='biting'){now+=50;game.step(.05,false,now);}
  game.action({action:'hook'},now);
  let previous=null,transitions=0,mode=game.state.mode;
  for(let tick=0;tick<2000&&game.state.phase==='fighting';tick++){
    if(game.state.tension>.67||game.state.mode!=='rest')held=false;else if(game.state.tension<.33)held=true;
    now+=50;game.step(.05,held,now);
    const fish=game.snapshot().fish,yaw=Math.atan2(fish.heading.x,-fish.heading.z);
    if(previous){
      assert.ok(Math.abs(fish.velocity.x-previous.velocity.x)<=4*.05+1e-8,'no lateral velocity jump');
      assert.ok(Math.abs(yaw-previous.yaw)<=1.65*.05+1e-8,'bounded turn rate');
    }
    if(mode!==game.state.mode)transitions++;
    mode=game.state.mode;previous={velocity:fish.velocity,yaw};
  }
  assert.ok(transitions>=8);assert.equal(game.state.phase,'caught');
});

test('escaped fish bursts away and deeper before the escape presentation ends',()=>{
  const game=new OceanFishingGame(()=>.5);let now=1000;
  game.action({action:'cast',strength:1,aim:0},now);
  for(let tick=0;tick<300&&game.state.phase!=='escaped';tick++){
    now+=50;game.step(.05,false,now);
  }
  assert.equal(game.state.phase,'escaped');
  assert.equal(game.isEscapeAnimating(),true);
  const start=game.snapshot().fish;
  for(let tick=0;tick<10;tick++){
    now+=50;game.step(.05,false,now);
  }
  const fleeing=game.snapshot().fish;
  assert.ok(fleeing.position.z<start.position.z-.2,'fish swims away from the rod');
  assert.ok(fleeing.position.x>start.position.x+.15,'fish darts visibly to the side');
  assert.ok(fleeing.position.y<start.position.y,'fish dives while escaping');
  assert.ok(fleeing.bodyWave.phase!==start.bodyWave.phase,'tail keeps beating during the burst');
  assert.ok(fleeing.speed>start.speed,'escape begins with an acceleration burst');
  for(let tick=0;tick<30;tick++){
    now+=50;game.step(.05,false,now);
  }
  assert.equal(game.state.phase,'escaped');
  assert.equal(game.isEscapeAnimating(),false,'escape presentation has a finite end');
});
