// @ts-nocheck -- executable integration probe; runtime assertions remain the contract.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { LEGACY_FISH_PATH_ALIASES } from '../src/fishing-routes.js';
import { isOceanMessage } from '../src/ocean-contract.js';
const base=process.env.OCEAN_URL??'http://127.0.0.1:8787';
const readiness=await fetch(base+'/ready');assert.equal(readiness.status,200,'readiness requires an available collection store');assert.equal((await readiness.json()).ok,true);
for(const path of ['/','/gofish','/dockerwhale','/docker','/cssfish','/rustfish','/jseel',...LEGACY_FISH_PATH_ALIASES,'/ocean-app.js','/ocean-scene.js','/ocean.css','/vendor/three.module.js','/vendor/three.core.js','/service-worker.js']){
  const response=await fetch(base+path);assert.equal(response.status,200,`${path} must load`);
  assert.ok((await response.text()).length>100,`${path} must not be empty`);
}
for(const path of ['/.env','/.git/config','/src/server.ts','/package.json'])assert.equal((await fetch(base+path)).status,404);
assert.equal((await fetch(base+'/api/sessions',{method:'POST'})).status,404,'legacy session API must not remain public');
const invalidSession=await fetch(base+'/api/ocean-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
assert.equal(invalidSession.status,400,'rooms must be associated with a valid player ID');
const invalidFishSession=await fetch(base+'/api/ocean-sessions',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:'player_abcdefghijkl',fishId:'unknown-fish'}),
});
assert.equal(invalidFishSession.status,400,'rooms must reject unknown fish species');
const playerId=`player_${crypto.randomUUID().replaceAll('-','')}`;
const {id}=await (await fetch(base+'/api/ocean-sessions',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId,fishId:'fish-001'}),
})).json();
const peers=[];
function peer(role){
  const ws=new WebSocket(base.replace('http','ws')+`/ocean-ws?room=${id}&role=${role}`,{origin:base});
  const messages=[];ws.on('message',raw=>{const message=JSON.parse(raw);assert.ok(isOceanMessage(message),'server must only broadcast valid public wire messages');messages.push(message);});ws.on('error',()=>{});peers.push(ws);return{ws,messages};
}
async function until(predicate,label,timeout=10000){const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw Error(`Timed out: ${label}`);await new Promise(resolve=>setTimeout(resolve,20));}}
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
try{
  const display=peer('display');await until(()=>display.messages.length,'display open');
  assert.equal(display.messages.at(-1)?.type,'ocean','room messages use the shared wire envelope');
  assert.equal(typeof display.messages.at(-1)?.rodStroke,'number','room messages include the shared rod-stroke field');
  assert.equal(typeof display.messages.at(-1)?.state.criticalWindow,'boolean','wire state includes the hook timing cue');
  assert.ok([null,'normal','critical'].includes(display.messages.at(-1)?.state.hookResult),'wire state includes the hook result');
  display.ws.send(JSON.stringify({action:'cast',strength:.7,aim:0}));
  await until(()=>display.messages.some(m=>m.state.phase==='casting'),'desktop fallback cast');
  await until(()=>display.messages.at(-1)?.state.phase==='waiting','desktop fallback landing');
  display.ws.send(JSON.stringify({action:'retrieve'}));
  await until(()=>display.messages.at(-1)?.state.phase==='retrieving','desktop fallback retrieve');
  await until(()=>display.messages.at(-1)?.state.phase==='idle','desktop fallback return to sea');
  const desktopRevision=display.messages.at(-1).state.revision;
  const phone=peer('controller');await until(()=>display.messages.at(-1)?.controllers===1,'controller presence');
  const secondController=peer('controller');
  await until(()=>secondController.ws.readyState===WebSocket.CLOSED,'second controller rejection');
  assert.equal(display.messages.at(-1)?.controllers,1,'a room accepts only one controller');
  const latestState=()=>display.messages.at(-1)?.state;
  phone.ws.send(JSON.stringify({action:'cast',strength:.8,aim:-.4}));
  await until(()=>display.messages.at(-1)?.state.phase==='casting','remote cast');
  assert.equal(display.messages.at(-1).state.strength,.8);
  phone.ws.send(JSON.stringify({action:'cast',strength:1,aim:0}));
  await until(()=>display.messages.at(-1)?.state.phase==='waiting','landing');
  assert.equal(display.messages.at(-1).state.revision,desktopRevision+1,'repeated cast must not restart flight');
  phone.ws.send(JSON.stringify({action:'retrieve'}));
  await until(()=>display.messages.at(-1)?.state.phase==='retrieving','retrieve');
  await until(()=>display.messages.at(-1)?.state.phase==='idle','return to sea');
  phone.ws.send(JSON.stringify({action:'cast',strength:.5,aim:.1}));
  await until(()=>latestState()?.phase==='biting','bite');
  assert.ok(latestState().fish?.position&&latestState().fish?.heading&&latestState().fish?.bodyWave,'fight snapshots must include authoritative fish motion');
  phone.ws.send(JSON.stringify({action:'hook'}));
  await until(()=>latestState()?.phase==='fighting','hook');
  assert.equal(latestState()?.canReel,false,'the opening cue is advisory and does not make the two reel controls behave differently');
  phone.ws.send(JSON.stringify({action:'reel',held:true}));
  await until(()=>latestState()?.reeling,'phone reel input during the running-fish cue');
  assert.equal(latestState()?.canReel,false);
  phone.ws.send(JSON.stringify({action:'reel',held:false}));
  await until(()=>!latestState()?.reeling,'phone reel release during the running-fish cue');
  const startingRodStroke=display.messages.at(-1)?.rodStroke??0;
  display.ws.send(JSON.stringify({action:'rod-pump'}));
  await wait(120);
  assert.equal(display.messages.at(-1)?.rodStroke,startingRodStroke,'the paired display cannot override the phone controller');
  phone.ws.send(JSON.stringify({action:'rod-pump'}));
  await until(()=>display.messages.at(-1)?.rodStroke===startingRodStroke+1,'phone rod stroke broadcast');
  let held=false,sawSchool=false;
  const fightDeadline=Date.now()+15_000;
  while(Date.now()<fightDeadline&&!['caught','escaped'].includes(latestState()?.phase)){
    const fight=latestState();
    assert.ok(fight.fish?.position&&fight.fish?.velocity&&fight.fish?.bodyWave,'fight state must keep fish motion synchronized');
    sawSchool ||= fight.school===7;
    if(fight.mode!=='rest'||fight.tension>.67)held=false;
    else if(fight.tension<.33)held=true;
    phone.ws.send(JSON.stringify({action:'reel',held}));
    await wait(120);
  }
  assert.ok(['fighting','caught'].includes(latestState()?.phase),`fish fight must remain active: ${JSON.stringify(latestState())}`);
  assert.ok(sawSchool,'fight should expose the parallel school phase');
  if(latestState()?.phase==='caught'){
    const collection=await (await fetch(`${base}/api/collection?playerId=${encodeURIComponent(playerId)}`)).json();
    assert.equal(collection.entries.find(entry=>entry.id==='fish-001')?.catches,1,'server-verified catch must be recorded once');
  }
  const forgedCatch=await fetch(base+'/api/collection/catches',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId,fishId:'fish-001',eventKey:'forged:1'}),
  });
  assert.equal(forgedCatch.status,404,'clients must not be able to POST fabricated catches');
  phone.ws.send(JSON.stringify({action:'reel',held:false}));
  phone.ws.send(JSON.stringify({action:'cast',strength:5,aim:0}));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(display.messages.at(-1).state.phase,'fighting','invalid cast must be rejected during a fight');
  const cssPlayer=`player_${crypto.randomUUID().replaceAll('-','')}`;
  const cssRoom=await (await fetch(base+'/api/ocean-sessions',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:cssPlayer,fishId:'css-001'}),
  })).json();
  const cssSocket=new WebSocket(base.replace('http','ws')+`/ocean-ws?room=${cssRoom.id}&role=display`,{origin:base});
  const cssMessages=[];cssSocket.on('message',raw=>cssMessages.push(JSON.parse(raw)));cssSocket.on('error',()=>{});peers.push(cssSocket);
  await until(()=>cssMessages.length,'CSS fish room open');
  assert.equal(cssMessages.at(-1).state.fishId,'css-001','CSS fish route must not fall back to Docker');
  const dockerPlayer=`player_${crypto.randomUUID().replaceAll('-','')}`;
  const dockerRoom=await (await fetch(base+'/api/ocean-sessions',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:dockerPlayer,fishId:'whale-001'}),
  })).json();
  const dockerSocket=new WebSocket(base.replace('http','ws')+`/ocean-ws?room=${dockerRoom.id}&role=display`,{origin:base});
  const dockerMessages=[];dockerSocket.on('message',raw=>dockerMessages.push(JSON.parse(raw)));dockerSocket.on('error',()=>{});
  await until(()=>dockerMessages.length,'Docker room open');
  assert.equal(dockerMessages.at(-1).state.fishId,'whale-001','Docker room must select the Docker species');
  dockerSocket.close();
  phone.ws.close();await until(()=>display.messages.at(-1)?.controllers===0,'disconnect status');
  console.log('PASS: public assets, private-path exclusion, species validation, cast → landing → retrieve, bite → hook → synchronized fish fight, duplicate/invalid input, disconnect presence.');
}finally{for(const ws of peers)ws.close();}
