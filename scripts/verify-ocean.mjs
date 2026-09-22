import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const base=process.env.OCEAN_URL??'http://127.0.0.1:8787';
const root=await (await fetch(base+'/')).text();
assert.match(root,/id="root"/,'React root must be served from /');
assert.match(root,/assets\/[^" ]+\.js/,'React bundle must be referenced from /');

for(const path of ['/vendor/three.module.js','/vendor/three.core.js','/manifest.webmanifest','/service-worker.js']){
  const response=await fetch(base+path);assert.equal(response.status,200,`${path} must load`);
  assert.ok((await response.text()).length>100,`${path} must not be empty`);
}
for(const path of ['/ocean.html','/ocean-app.js','/ocean-scene.js','/ocean.css','/.env','/.git/config','/src/server.ts','/package.json']){
  assert.equal((await fetch(base+path)).status,404,`${path} must be removed or private`);
}

const {id}=await (await fetch(base+'/api/ocean-sessions',{method:'POST'})).json();
const peers=[];
function peer(role){
  const ws=new WebSocket(base.replace('http','ws')+`/ocean-ws?room=${id}&role=${role}`,{origin:base});
  const messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));peers.push(ws);return{ws,messages};
}
async function until(predicate,label){const start=Date.now();while(!predicate()){if(Date.now()-start>5000)throw Error(`Timed out: ${label}`);await new Promise(resolve=>setTimeout(resolve,20));}}
try{
  const display=peer('display');await until(()=>display.messages.length,'display open');
  const phone=peer('controller');await until(()=>display.messages.at(-1)?.controllers===1,'controller presence');
  assert.ok(['go','k8s'].includes(display.messages.at(-1).state.species),'fish species must be present');
  phone.ws.send(JSON.stringify({action:'cast',strength:.8,aim:-.4}));
  await until(()=>display.messages.some(m=>m.state.phase==='casting'),'remote cast');
  assert.equal(display.messages.at(-1).state.strength,.8);
  phone.ws.send(JSON.stringify({action:'cast',strength:1,aim:0}));
  await until(()=>display.messages.at(-1)?.state.phase==='waiting','landing');
  assert.equal(display.messages.at(-1).state.revision,1,'repeated cast must not restart flight');
  phone.ws.send(JSON.stringify({action:'retrieve'}));
  await until(()=>display.messages.at(-1)?.state.phase==='retrieving','retrieve');
  await until(()=>display.messages.at(-1)?.state.phase==='idle','return to sea');
  phone.ws.send(JSON.stringify({action:'cast',strength:5,aim:0}));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(display.messages.at(-1).state.phase,'idle','invalid input must be rejected');
  phone.ws.close();await until(()=>display.messages.at(-1)?.controllers===0,'disconnect status');
  console.log(`PASS: React root, Go/K8s species state, removed Vanilla routes, private-path exclusion, controller connection, cast/landing/retrieve, invalid input, disconnect (${display.messages.at(-1).state.species}).`);
}finally{for(const ws of peers)ws.close();}
