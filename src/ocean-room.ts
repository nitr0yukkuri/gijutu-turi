import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { OceanFishingGame, type OceanAction, type OceanPhase } from './ocean-game.js';
import { isFishSpeciesId, randomActiveFishSpeciesId, type FishSpeciesId } from './fish-species.js';
import { canContinueAfterCatchSave, oceanCommandSchema, type OceanMessage } from './ocean-contract.js';
import { CatchSaveCoordinator } from './catch-save.js';
export type { OceanState } from './ocean-game.js';

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

export function createOceanRooms(options:{onCatch?:(playerId:string,eventKey:string,fishId:FishSpeciesId)=>void|Promise<void>}={}){
  type Client={role:'display'|'controller';reelUntil:number;lastRodPumpAt:number;windowAt:number;messages:number};
  type QueuedCommand={client:WebSocket;action:OceanAction};
  type Room={game:OceanFishingGame;clients:Map<WebSocket,Client>;commands:QueuedCommand[];lastActive:number;playerId:string;rodStroke:number;catchSave:CatchSaveCoordinator;catchEvent?:{eventKey:string;fishId:FishSpeciesId}};
  const rooms=new Map<string,Room>();
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
  const createRoom=(playerId:string,requestedFishId?:string):string|undefined=>{
    if(rooms.size>=128)return undefined;
    const pinnedFishId=isFishSpeciesId(requestedFishId)?requestedFishId:undefined;
    const fishId=pinnedFishId??randomActiveFishSpeciesId();
    const fishSelectionMode=pinnedFishId?'fixed':'rotate';
    const id=`sea_${randomBytes(16).toString('hex')}`;
    rooms.set(id,{game:new OceanFishingGame(Math.random,fishId,fishSelectionMode),clients:new Map(),commands:[],lastActive:Date.now(),playerId,rodStroke:0,catchSave:new CatchSaveCoordinator()});
    return id;
  };
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
        const parsed=oceanCommandSchema.safeParse(json);if(!parsed.success)return;
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
  return{createRoom,upgrade,close(){clearInterval(tick);clearInterval(cleanup);for(const room of rooms.values())for(const client of room.clients.keys())client.terminate();sockets.close();}};
}
