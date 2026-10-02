// @ts-nocheck -- exercise the same vendored geometry/shader hooks as WebGL.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGoFish} from './rendering/go-fish.js';
import {createDockerWhale,setDockerWhaleMouthAnchor,whaleSection} from './rendering/docker-whale.js';
import {fishOrientation} from './rendering/ocean-scene.js';
import {OceanFishingGame} from './ocean-game.js';
import {applyFishWater,fishApparentPoint,fishWaterCoverage,DOCKER_WHALE_WATER_PROFILE,CSS_FISH_WATER_PROFILE} from './rendering/fish-water.js';
import {fishFightCues} from './rendering/fish-fight-cues.js';
import {FishLocomotion} from './fish.js';
import {escapeFishVisibility,fishVisibilityTarget} from './fish-approach.js';
import {DOCKER_WHALE_PREVIEW_CYCLE_SECONDS,dockerWhalePreviewMotionAt} from './rendering/docker-whale-motion.js';

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
  assert.ok(fishVisibilityTarget('waiting',.46,'whale-001')>preBiteShadow,'Docker gets a species-specific silhouette budget');
});

test('escape keeps the entry silhouette and only fades it during the terminal fade',()=>{
  assert.equal(escapeFishVisibility(.82,1),.82,'the fish remains visible during its escape burst');
  assert.equal(escapeFishVisibility(.82,.5),.41,'the terminal fade scales the entry visibility');
  assert.equal(escapeFishVisibility(.82,0),0,'the fish is hidden when the fade completes');
  assert.equal(escapeFishVisibility(0,1),0,'an empty entry visibility stays hidden');
});

test('Docker leader anchor sits on the visible-side mouth fold, not the nose center',()=>{
  const nearSide=new THREE.Vector3(),farSide=new THREE.Vector3();
  assert.equal(setDockerWhaleMouthAnchor(nearSide,1),nearSide);
  assert.equal(setDockerWhaleMouthAnchor(farSide,-1),farSide);
  assert.ok(nearSide.x>-5.8&&nearSide.x<-5.3,'the anchor sits just behind the tapered nose tip');
  assert.ok(nearSide.z>0&&farSide.z<0,'the anchor follows either visible-side mouth fold');
  assert.ok(Math.abs(nearSide.y-farSide.y)<1e-6,'the two lip points remain symmetric');
});

test('Docker renderer consumes authoritative body waves and a reusable whale water profile',()=>{
  const waterUniforms={uWaterBackdrop:{value:null},uTime:{value:0}};
  const model=createDockerWhale({waterUniforms});
  model.update(2,{bodyPhase:1.25,bodyFrequency:.78,bodyWavelength:.94,amplitude:.1,effort:.4,turn:.2,visibility:.42});
  const source=THREE.ShaderLib.physical;
  const shader={uniforms:{...source.uniforms},vertexShader:source.vertexShader,fragmentShader:source.fragmentShader};
  model.body.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uWhalePhase.value,1.25);
  assert.equal(shader.uniforms.uWhaleFrequency.value,.78);
  assert.equal(shader.uniforms.uWhaleAmplitude.value,.1);
  assert.match(shader.vertexShader,/uWhalePhase/);
  assert.match(shader.vertexShader,/uWhaleEffort/);
  assert.match(shader.vertexShader,/flukeStroke/,'Docker propulsion is driven by a distinct fluke stroke');
  assert.match(shader.vertexShader,/flukeBeat/,'fluke amplitude grows toward the tip');
  assert.equal(model.containerCount,9,'Docker whale cargo matches the nine-container logo stack');
  const snout=whaleSection(0),torso=whaleSection(.4),peduncle=whaleSection(1);
  assert.ok(torso.height>1.6,'the whale keeps enough body volume beneath its cargo');
  assert.ok(snout.height<torso.height*.1&&peduncle.height<torso.height*.1,'the silhouette tapers at both the head and tail instead of reading as a ring');
  assert.ok(model.body.material.roughness>=.5&&model.body.material.clearcoat<.3,'matte skin avoids an inflated-plastic highlight');
  const cargoBounds=new THREE.Box3().setFromObject(model.cargoMount);
  assert.ok(cargoBounds.min.y<2,'Docker cargo sits slightly into the whale silhouette');
  assert.equal(model.group.userData.cargoVerticalOffset,-.16,'Docker cargo is intentionally lowered');
  assert.ok(fishWaterCoverage(2.2,35,.5,'body',DOCKER_WHALE_WATER_PROFILE)>fishWaterCoverage(2.2,35,.5), 'whale profile preserves a readable mass');
  assert.ok(fishWaterCoverage(2.2,35,.5,'cargo',DOCKER_WHALE_WATER_PROFILE)>fishWaterCoverage(2.2,35,.5,'detail',DOCKER_WHALE_WATER_PROFILE)*3, 'Docker cargo keeps its own readability budget');
  model.dispose();
});

test('Docker catalog preview shares one stroke/glide clock and seats its cargo',()=>{
  const strokeAt=DOCKER_WHALE_PREVIEW_CYCLE_SECONDS*(Math.PI/2+.35)/(Math.PI*2);
  const stroke=dockerWhalePreviewMotionAt(strokeAt);
  const glide=dockerWhalePreviewMotionAt(strokeAt+DOCKER_WHALE_PREVIEW_CYCLE_SECONDS/2);
  assert.ok(stroke.stroke>.9,'the preview has a distinct power stroke');
  assert.ok(glide.stroke<.01,'the preview has a real glide window');
  assert.ok(stroke.amplitude>glide.amplitude);
  assert.ok(stroke.cargoLoad>glide.cargoLoad);

  const model=createDockerWhale();
  model.update(strokeAt,stroke);
  const source=THREE.ShaderLib.physical;
  const shader={uniforms:{...source.uniforms},vertexShader:source.vertexShader,fragmentShader:source.fragmentShader};
  model.body.material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uWhalePhase.value,stroke.bodyPhase);
  assert.ok(model.group.getObjectByName('cargo-contact-shadow'),'catalog whale needs a cargo contact cue');
  model.dispose();
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

test('CSS fish has its own compact silhouette and exposes smooth state-material uniforms',()=>{
  const model=createGoFish({visualProfile:'css'}),go=createGoFish({visualProfile:'catalog'});
  assert.equal(model.group.name,'CSS fish');
  assert.match(model.body.material.customProgramCacheKey(),/-css$/);
  const cssBounds=new THREE.Box3().setFromObject(model.group),goBounds=new THREE.Box3().setFromObject(go.group);
  assert.ok(cssBounds.max.x<goBounds.max.x-.25,'CSS fish uses a shorter tail silhouette');
  assert.ok(cssBounds.max.y<goBounds.max.y-.18,'CSS fish uses a lower, compact fin profile');
  assert.ok(model.group.children.some(mesh=>mesh.name.startsWith('forked-tail-')),'CSS fish uses a readable forked tail');
  assert.ok(model.group.children.some(mesh=>mesh.name==='merged-eyes-and-anatomy'),'CSS fish keeps its eye, gill, and mouth anatomy in the merged detail pass');
  assert.ok(!model.group.children.some(mesh=>mesh.name.startsWith('tail-filament-')),'CSS fish has no Go tail streamers');
  assert.equal(model.group.userData.cssFriendly,true,'CSS fish keeps its friendly visual identity');
  model.setVisualState('hit');
  model.update(0,{styleDelta:.5});
  const shader={uniforms:{...THREE.ShaderLib.physical.uniforms},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  model.body.material.onBeforeCompile(shader);
  for(const uniform of ['uStyleBody','uStyleShade','uStyleAccent','uStyleEmission','uStyleGlow','uStylePattern'])assert.ok(shader.uniforms[uniform],`missing ${uniform}`);
  assert.match(shader.fragmentShader,/uStyleBody/);
  assert.match(shader.fragmentShader,/uStyleEmission/);
  assert.match(shader.fragmentShader,/cascadeBand/);
  assert.match(shader.fragmentShader,/bubbleMark/);
  model.dispose();go.dispose();
});

test('K8s leviathan uses an armored non-neon silhouette and a short solid tail',()=>{
  const cluster=createGoFish({visualProfile:'cluster'}),go=createGoFish({visualProfile:'catalog'});
  assert.equal(cluster.group.name,'K8s Leviathan');
  assert.match(cluster.body.material.customProgramCacheKey(),/-cluster$/);
  assert.ok(cluster.group.children.some(mesh=>mesh.name==='merged-armored-scutes'),'the body carries small overlapping armor plates in one draw');
  assert.ok(cluster.group.children.some(mesh=>mesh.name.startsWith('forked-tail-')),'the tail remains an anatomical fin');
  assert.ok(!cluster.group.children.some(mesh=>mesh.name.startsWith('tail-filament-')),'the monster does not inherit Go’s glowing streamers');
  const bounds=new THREE.Box3().setFromObject(cluster.group),goBounds=new THREE.Box3().setFromObject(go.group);
  assert.ok(bounds.max.x<goBounds.max.x-.45,'its caudal shape does not reuse the extra-long Go silhouette');
  const shader={uniforms:{...THREE.ShaderLib.physical.uniforms},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  cluster.body.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/vec3\(\.105,\.155,\.145\)/,'the main body uses a muted mineral palette');
  assert.doesNotMatch(shader.fragmentShader,/uStyleBody/,'it is not using CSS fish styling');
  cluster.dispose();go.dispose();
});

test('CSS fish keeps a readable state palette through the underwater shadow',()=>{
  assert.ok(fishWaterCoverage(2.2,35,.5,'body',CSS_FISH_WATER_PROFILE)>fishWaterCoverage(2.2,35,.5));
  assert.equal(CSS_FISH_WATER_PROFILE.redStateRetention,.76);
  assert.ok(fishVisibilityTarget('waiting',.46,'css-001')>.32);
});

test('fish body-wave profiles keep easing across consecutive gait-transition frames',()=>{
  const fish=new FishLocomotion({x:0,y:-2,z:-12},{x:0,y:0,z:-1});
  fish.update(.05,{direction:{x:0,y:0,z:-1},speed:1,gait:'css_cruise'});
  const before=fish.snapshot().bodyWave.amplitude;
  fish.update(.05,{direction:{x:0,y:0,z:-1},speed:1,gait:'burst'});
  const first=fish.snapshot().bodyWave.amplitude;
  fish.update(.05,{direction:{x:0,y:0,z:-1},speed:1,gait:'burst'});
  const second=fish.snapshot().bodyWave.amplitude;

  assert.ok(first>before&&first<.22,'the first resistance frame eases toward burst amplitude');
  assert.ok(second>first&&second<.22,'the following frame continues easing instead of snapping');
});

test('K8s fish keeps a faint single-body approach before its replicas appear in the fight',()=>{
  assert.equal(fishVisibilityTarget('waiting',0,'k8s-001'),0);
  assert.ok(fishVisibilityTarget('waiting',.46,'k8s-001')<fishVisibilityTarget('waiting',.46,'css-001'));
  assert.equal(fishVisibilityTarget('biting',1,'k8s-001'),.58,'the bite keeps the leviathan as a shadow instead of fully revealing it');
  assert.equal(fishVisibilityTarget('fighting',1,'k8s-001'),1);
});

test('CSS fish fight state reaches underwater optics and preserves red during escape',()=>{
  const waterUniforms={uWaterBackdrop:{value:null},uTime:{value:0}};
  const model=createGoFish({waterUniforms,visualProfile:'css'});
  model.setVisualState('escape');
  model.update(0,{styleDelta:1});
  const shader={uniforms:{...THREE.ShaderLib.physical.uniforms},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  model.body.material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uCssRedState.value>.99,'escape red-state reaches the water shader');
  assert.match(shader.fragmentShader,/uniform float uCssRedState/);
  assert.match(shader.fragmentShader,/redExtinction=mix\(\.58/,'red extinction is reduced only for the CSS red state');
  model.setVisualState('normal');
  model.update(1,{styleDelta:1});
  assert.ok(shader.uniforms.uCssRedState.value<.001,'normal state restores ordinary water extinction');
  model.dispose();
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
