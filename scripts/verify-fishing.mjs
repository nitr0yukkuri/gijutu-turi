import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const base=process.env.OCEAN_URL??'http://127.0.0.1:8787';
const {id}=await(await fetch(base+'/api/ocean-sessions',{method:'POST'})).json();
const peers=[];
let state, controllers=0, sawSplit=false, heartbeat;
const send=(ws,input)=>ws.send(JSON.stringify(input));
function peer(role){
  const ws=new WebSocket(base.replace('http','ws')+`/ocean-ws?room=${id}&role=${role}`,{origin:base});
  peers.push(ws);
  const ready=new Promise((resolve,reject)=>{
    ws.once('open',resolve);
    ws.once('error',reject);
  });
  if(role==='display')ws.on('message',raw=>{const m=JSON.parse(raw);state=m.state;controllers=m.controllers;sawSplit ||= state.school===7;});
  return {ws,ready};
}
async function until(predicate,label,timeout=15000){
  const started=Date.now();
  while(!predicate()){
    if(Date.now()-started>timeout)throw Error(`Timed out: ${label}; ${JSON.stringify(state)}`);
    await new Promise(resolve=>setTimeout(resolve,20));
  }
}
try{
  const display=peer('display');await display.ready;
  const phone=peer('controller');await phone.ready;
  await until(()=>state&&controllers===1,'pair');
  send(phone.ws,{action:'hook'});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(state.phase,'idle','hook cannot skip casting');
  send(phone.ws,{action:'cast',strength:.45,aim:.1});
  await until(()=>state.phase==='biting','bite');
  send(phone.ws,{action:'hook'});
  await until(()=>state.phase==='fighting','hook');
  send(phone.ws,{action:'reel',held:true});
  await until(()=>state.reeling,'held input');
  await until(()=>!state.reeling,'lost-release lease expiry',1000);
  let held=false;
  heartbeat=setInterval(()=>{
    if(state.phase!=='fighting')return;
    if(state.mode==='surge'||state.mode==='split'||state.tension>.67)held=false;
    else if(state.tension<.33)held=true;
    send(phone.ws,{action:'reel',held});
  },100);
  await until(()=>state.phase==='caught'||state.phase==='escaped','fight outcome',100000);
  clearInterval(heartbeat);
  assert.equal(state.phase,'caught');assert.equal(state.catches,1);assert.ok(sawSplit);
  assert.ok(['go','k8s'].includes(state.species),'fish species must be exposed in the live state');
  console.log(`PASS: live controller → cast → bite → hook → pressure management → ${state.species} catch (${state.fightTime.toFixed(1)}s), parallel surge, expired hold lease.`);
  send(phone.ws,{action:'reset'});await until(()=>state.phase==='idle','retry');
  assert.equal(state.catches,1);
  send(phone.ws,{action:'cast',strength:.2,aim:0});
  await until(()=>state.phase==='biting','second bite');
  await until(()=>state.phase==='escaped','missed hook');
  assert.equal(state.reason,'missed');assert.equal(state.catches,1);
  phone.ws.close();await until(()=>controllers===0,'controller disconnect');
  console.log('PASS: retry, missed-hook escape, catch count retained, controller disconnect.');
}finally{clearInterval(heartbeat);for(const ws of peers)ws.close();}
