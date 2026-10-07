import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import type { Hono } from 'hono';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { bodyLimit } from 'hono/body-limit';
import { isPlayerId } from './collection-contract.js';
import { RequestRateLimiter } from './request-rate-limit.js';
import { OceanFishingGame, type OceanAction, type OceanPhase } from './ocean-game.js';
import { isFishSpeciesId, randomActiveFishSpeciesId, type FishSpeciesId } from './fish-species.js';
import { canContinueAfterCatchSave, type OceanMessage } from './ocean-contract.js';
import { CatchSaveCoordinator } from './catch-save.js';
export type { OceanState } from './ocean-game.js';

const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('cast'),strength:z.number().finite().min(0).max(1),aim:z.number().finite().min(-1).max(1)}),
  z.object({action:z.literal('retrieve')}),z.object({action:z.literal('hook')}),
  z.object({action:z.literal('reset')}),z.object({action:z.literal('reel'),held:z.boolean()}),
  z.object({action:z.literal('rod-pump')}),
  z.object({action:z.literal('retry-catch-save')}),
]);

const isLoopbackHost=(host:string)=>host==='localhost'||host==='127.0.0.1'||host==='[::1]';
const isPrivateIPv4=(address:string)=>{
  const parts=address.split('.').map(Number);
  const a=parts[0]??Number.NaN;
  const b=parts[1]??Number.NaN;
  if (!Number.isFinite(a)||!Number.isFinite(b)) return false;
  return a===10||a===192&&b===168||a===172&&b>=16&&b<=31;
};
const localNetworkHost=(interfaces:ReturnType<typeof networkInterfaces>=networkInterfaces())=>{
  const candidates=Object.entries(interfaces).flatMap(([name,entries])=>(entries??[])
    .filter(info=>!info.internal&&['4','IPv4'].includes(String(info.family)))
    .map(info=>({name,address:info.address})));
  const score=(name:string)=>/wi[- ]?fi|wireless|wlan/i.test(name)?0:/virtual|vethernet|vmware|loopback|docker/i.test(name)?2:1;
  candidates.sort((left,right)=>score(left.name)-score(right.name));
  const physicalCandidates=candidates.filter(candidate=>score(candidate.name)<2);
  return physicalCandidates.find(candidate=>isPrivateIPv4(candidate.address))?.address??physicalCandidates[0]?.address;
};
export const accessHost=(requestUrl:string,interfaces:ReturnType<typeof networkInterfaces>=networkInterfaces()):string|undefined=>{
  const url=new URL(requestUrl);
  return isLoopbackHost(url.hostname)?localNetworkHost(interfaces):url.hostname;
};
const allowedOrigins=()=>new Set((process.env.FRONTEND_ORIGIN??"").split(",").map(origin=>origin.trim()).filter(Boolean));
export const isAllowedWebSocketOrigin=(origin:string|undefined,requestHost:string|undefined,configured:Set<string>):boolean=>{
  if(!origin)return true;
  try{return new URL(origin).host===requestHost||configured.has("*")||configured.has(origin);}catch{return false;}
};

export function removeQueuedCommandsForClient<TClient, TAction>(
  commands: readonly { client: TClient; action: TAction }[],
  client: TClient,
): { client: TClient; action: TAction }[] {
  return commands.filter(command => command.client !== client);
}

export function canQueueRoomAction(action: OceanAction, phase: OceanPhase, canControl: boolean, hasDisplay: boolean): boolean {
  const resultReset = action.action === 'reset' && (phase === 'caught' || phase === 'escaped');
  return hasDisplay && (canControl || resultReset);
}

export function createOceanRooms(app:Hono,options:{onCatch?:(playerId:string,eventKey:string,fishId:FishSpeciesId)=>void|Promise<void>}={}){
  type Client={role:'display'|'controller';reelUntil:number;lastRodPumpAt:number;windowAt:number;messages:number};
  type QueuedCommand={client:WebSocket;action:OceanAction};
  type Room={game:OceanFishingGame;clients:Map<WebSocket,Client>;commands:QueuedCommand[];lastActive:number;playerId:string;rodStroke:number;catchSave:CatchSaveCoordinator;catchEvent?:{eventKey:string;fishId:FishSpeciesId}};
  const rooms=new Map<string,Room>();
  const sessionAttemptLimiter=new RequestRateLimiter();
  const sessionCreationLimiter=new RequestRateLimiter();
  const sessionCreationWindowMs=10*60_000;
  const onCatch=options.onCatch??(()=>{});
  const sockets=new WebSocketServer({noServer:true,maxPayload:1024});
  const count=(room:Room,role:Client['role'])=>[...room.clients.values()].filter(client=>client.role===role).length;
  // Keep the desktop fallback usable when no phone is paired. Once a phone
  // controller is present, the phone owns input so two surfaces cannot race
  // the same fishing action.
  const canControl=(room:Room,client:Client)=>client.role==='controller'||client.role==='display'&&count(room,'controller')===0;
  const broadcast=(room:Room)=>{
    const message:OceanMessage={type:'ocean',state:room.game.wireSnapshot(),rodStroke:room.rodStroke,serverNow:Date.now(),controllers:count(room,'controller'),displays:count(room,'display'),catchSaveStatus:room.game.state.phase==='caught'?room.catchSave.status:'none'};
    const data=JSON.stringify(message);
    for(const client of room.clients.keys())if(client.readyState===WebSocket.OPEN&&client.bufferedAmount<64_000)client.send(data);
  };
  const persistCatch=(room:Room)=>{
    const event=room.catchEvent;
    if(!event)return;
    const write=room.catchSave.save(event.eventKey,()=>onCatch(room.playerId,event.eventKey,event.fishId));
    broadcast(room);
    void write.then(
      ()=>{room.lastActive=Date.now();broadcast(room);},
      error=>{console.error('Unable to record fish catch',error);room.lastActive=Date.now();broadcast(room);},
    );
  };
  app.use('/api/ocean-sessions',bodyLimit({maxSize:1024}));
  app.post('/api/ocean-sessions',async c=>{
    const contentType=(c.req.header('content-type')??'').split(';',1)[0]?.trim().toLowerCase();
    if(contentType!=='application/json')return c.json({error:'unsupported_media_type'},415);
    const source=c.req.header('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    const attemptRetryAfter=sessionAttemptLimiter.consume([
      {key:'global',limit:1200,windowMs:sessionCreationWindowMs},
      {key:`source:${source}`,limit:240,windowMs:sessionCreationWindowMs},
    ]);
    if(attemptRetryAfter){
      c.header('Retry-After',String(attemptRetryAfter));
      return c.json({error:'rate_limited'},429);
    }
    const parsed=z.object({playerId:z.string().refine(isPlayerId),fishId:z.string().optional()}).safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return c.json({error:'invalid_player_id'},400);
    if(parsed.data.fishId&&!isFishSpeciesId(parsed.data.fishId))return c.json({error:'invalid_fish_id'},400);

    const retryAfter=sessionCreationLimiter.consume([
      // Leave room for a workshop or judging group sharing one NAT address.
      // The room-capacity guard below remains the hard resource limit.
      {key:'global',limit:600,windowMs:sessionCreationWindowMs},
      {key:`source:${source}`,limit:120,windowMs:sessionCreationWindowMs},
    ]);
    if(retryAfter){
      console.warn(`[ocean] session creation rate limited; retryAfter=${retryAfter}s`);
      c.header('Retry-After',String(retryAfter));
      return c.json({error:'rate_limited'},429);
    }
    if(rooms.size>=128)return c.json({error:'rooms_full'},503);
    const id=`sea_${randomBytes(16).toString('hex')}`;
    const pinnedFishId=isFishSpeciesId(parsed.data.fishId)?parsed.data.fishId:undefined;
    const fishId=pinnedFishId??randomActiveFishSpeciesId();
    const fishSelectionMode=pinnedFishId?'fixed':'rotate';
    rooms.set(id,{game:new OceanFishingGame(Math.random,fishId,fishSelectionMode),clients:new Map(),commands:[],lastActive:Date.now(),playerId:parsed.data.playerId,rodStroke:0,catchSave:new CatchSaveCoordinator()});
    c.header('Cache-Control','no-store');return c.json({id,host:accessHost(c.req.url)},201);
  });
  const upgrade=(request:IncomingMessage,socket:Duplex,head:Buffer):boolean=>{
    const url=new URL(request.url??'/','http://localhost');if(url.pathname!=='/ocean-ws')return false;
    const room=rooms.get(url.searchParams.get('room')??''),role=url.searchParams.get('role');
    const validOrigin=isAllowedWebSocketOrigin(request.headers.origin,request.headers.host,allowedOrigins());
    const controllerTaken=role==='controller'&&room&&count(room,'controller')>=1;
    if(!room||(role!=='display'&&role!=='controller')||!validOrigin||room.clients.size>=8||controllerTaken){socket.destroy();return true;}
    sockets.handleUpgrade(request,socket,head,client=>{
      const entry:Client={role,reelUntil:0,lastRodPumpAt:0,windowAt:Date.now(),messages:0};
      room.clients.set(client,entry);room.lastActive=Date.now();broadcast(room);
      client.on('error',()=>client.close());
      client.on('message',raw=>{
        const now=Date.now();if(now-entry.windowAt>=1000){entry.windowAt=now;entry.messages=0;}if(++entry.messages>40)return;
        let json:unknown;try{json=JSON.parse(raw.toString());}catch{return;}
        const parsed=actionSchema.safeParse(json);if(!parsed.success)return;
        const input=parsed.data;
        if(input.action==='retry-catch-save'){
          if(room.game.state.phase==='caught'&&room.catchSave.status==='failed'&&room.catchEvent)persistCatch(room);
          return;
        }
        if(room.game.state.phase==='caught'&&!canContinueAfterCatchSave(room.catchSave.status))return;
        if(input.action==='rod-pump'){
          if(!canControl(room,entry)||!count(room,'display')||room.game.state.phase!=='fighting'||now-entry.lastRodPumpAt<300)return;
          entry.lastRodPumpAt=now;room.rodStroke++;broadcast(room);return;
        }
        if(input.action==='reel'){
          if(!canControl(room,entry))return;
          entry.reelUntil=input.held&&room.game.state.phase==='fighting'?now+400:0;
          return;
        }
        if(!canQueueRoomAction(input,room.game.state.phase,canControl(room,entry),count(room,'display')>0))return;
        // One-shot commands are consumed by the fixed simulation tick. This
        // keeps input ordering deterministic and prevents websocket timing
        // from changing the game clock.
        if(room.commands.length<16)room.commands.push({client,action:input});
      });
      client.on('close',()=>{room.clients.delete(client);room.commands=removeQueuedCommandsForClient(room.commands,client);room.lastActive=Date.now();broadcast(room);});
    });return true;
  };
  // Fixed 20Hz simulation, hold leases expire even on a lost release packet.
  const tick=setInterval(()=>{
    const now=Date.now();
    for(const[id,room]of rooms){
      if(!room.clients.size)continue;
      const previous=room.game.state.phase;
      const catchPersistenceLocked=room.game.state.phase==='caught'&&!canContinueAfterCatchSave(room.catchSave.status);
      if(count(room,'display')&&!catchPersistenceLocked){
        const commands=room.commands.splice(0);
        for(const queued of commands){
          if(!room.clients.has(queued.client))continue;
          if(room.game.action(queued.action,now))for(const other of room.clients.values())other.reelUntil=0;
        }
        const reeling=[...room.clients.values()].some(client=>client.reelUntil>now);
        room.game.step(.05,reeling,now);
      }
      const phase=room.game.state.phase;
      if(previous!==phase) console.log(`[ocean] room=${id} phase=${previous}->${phase}`);
      if(previous!=='caught'&&phase==='caught'){
        room.catchEvent={eventKey:`${id}:${room.game.state.revision}`,fishId:room.game.state.fishId};
        persistCatch(room);
      }
      if(room.game.state.phase==='caught'&&!canContinueAfterCatchSave(room.catchSave.status))continue;
      if(previous!==phase||(phase!=='idle'&&phase!=='caught'&&phase!=='escaped')||room.game.isEscapeAnimating()){room.lastActive=now;broadcast(room);}
      else if(room.game.state.resultAt&&now-room.game.state.resultAt<150)broadcast(room);
    }
  },50);
  tick.unref();
  const cleanup=setInterval(()=>{for(const[id,room]of rooms)if(!room.clients.size&&Date.now()-room.lastActive>30*60*1000)rooms.delete(id);},60_000);cleanup.unref();
  return{upgrade,close(){clearInterval(tick);clearInterval(cleanup);for(const room of rooms.values())for(const client of room.clients.keys())client.terminate();sockets.close();}};
}
