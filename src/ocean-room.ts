import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import type { Hono } from 'hono';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { OceanFishingGame } from './ocean-game.js';
export type { OceanState } from './ocean-game.js';

const actionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('cast'),strength:z.number().finite().min(0).max(1),aim:z.number().finite().min(-1).max(1)}),
  z.object({action:z.literal('retrieve')}),z.object({action:z.literal('hook')}),
  z.object({action:z.literal('reset')}),z.object({action:z.literal('reel'),held:z.boolean()}),
]);

const isLoopbackHost=(host:string)=>host==='localhost'||host==='127.0.0.1'||host==='[::1]';
const isPrivateIPv4=(address:string)=>{
  const parts=address.split('.').map(Number);
  const a=parts[0]??Number.NaN;
  const b=parts[1]??Number.NaN;
  if (!Number.isFinite(a)||!Number.isFinite(b)) return false;
  return a===10||a===192&&b===168||a===172&&b>=16&&b<=31;
};
const localNetworkHost=()=>{
  const candidates=Object.entries(networkInterfaces()).flatMap(([name,entries])=>(entries??[])
    .filter(info=>!info.internal&&['4','IPv4'].includes(String(info.family)))
    .map(info=>({name,address:info.address})));
  const score=(name:string)=>/wi[- ]?fi|wireless|wlan/i.test(name)?0:/virtual|vethernet|vmware|loopback|docker/i.test(name)?2:1;
  candidates.sort((left,right)=>score(left.name)-score(right.name));
  return candidates.find(candidate=>isPrivateIPv4(candidate.address))?.address??candidates[0]?.address;
};
const accessHost=(requestUrl:string)=>{
  const url=new URL(requestUrl);
  return isLoopbackHost(url.hostname)?localNetworkHost()??url.hostname:url.hostname;
};
const allowedOrigins=()=>new Set((process.env.FRONTEND_ORIGIN??"").split(",").map(origin=>origin.trim()).filter(Boolean));
export const isAllowedWebSocketOrigin=(origin:string|undefined,requestHost:string|undefined,configured:Set<string>):boolean=>{
  if(!origin)return true;
  try{return new URL(origin).host===requestHost||configured.has("*")||configured.has(origin);}catch{return false;}
};

export function createOceanRooms(app:Hono){
  type Client={role:'display'|'controller';reelUntil:number;windowAt:number;messages:number};
  type Room={game:OceanFishingGame;clients:Map<WebSocket,Client>;lastActive:number};
  const rooms=new Map<string,Room>();
  const sockets=new WebSocketServer({noServer:true,maxPayload:1024});
  const count=(room:Room,role:Client['role'])=>[...room.clients.values()].filter(client=>client.role===role).length;
  const broadcast=(room:Room)=>{
    const data=JSON.stringify({type:'ocean',state:room.game.snapshot(),serverNow:Date.now(),controllers:count(room,'controller'),displays:count(room,'display')});
    for(const client of room.clients.keys())if(client.readyState===WebSocket.OPEN&&client.bufferedAmount<64_000)client.send(data);
  };
  app.post('/api/ocean-sessions',c=>{
    if(rooms.size>=128)return c.json({error:'rooms_full'},503);
    const id=`sea_${randomBytes(16).toString('hex')}`;
    rooms.set(id,{game:new OceanFishingGame(),clients:new Map(),lastActive:Date.now()});
    c.header('Cache-Control','no-store');return c.json({id,host:accessHost(c.req.url)},201);
  });
  const upgrade=(request:IncomingMessage,socket:Duplex,head:Buffer):boolean=>{
    const url=new URL(request.url??'/','http://localhost');if(url.pathname!=='/ocean-ws')return false;
    const room=rooms.get(url.searchParams.get('room')??''),role=url.searchParams.get('role');
    const validOrigin=isAllowedWebSocketOrigin(request.headers.origin,request.headers.host,allowedOrigins());
    if(!room||(role!=='display'&&role!=='controller')||!validOrigin||room.clients.size>=8){socket.destroy();return true;}
    sockets.handleUpgrade(request,socket,head,client=>{
      const entry:Client={role,reelUntil:0,windowAt:Date.now(),messages:0};
      room.clients.set(client,entry);room.lastActive=Date.now();broadcast(room);
      client.on('error',()=>client.close());
      client.on('message',raw=>{
        const now=Date.now();if(now-entry.windowAt>=1000){entry.windowAt=now;entry.messages=0;}if(++entry.messages>40)return;
        let json:unknown;try{json=JSON.parse(raw.toString());}catch{return;}
        const parsed=actionSchema.safeParse(json);if(!parsed.success)return;
        const input=parsed.data;
        if(input.action==='reel'){entry.reelUntil=input.held&&room.game.state.phase==='fighting'?now+400:0;return;}
        if(!count(room,'display'))return;
        if(room.game.action(input,now)){for(const other of room.clients.values())other.reelUntil=0;room.lastActive=now;broadcast(room);}
      });
      client.on('close',()=>{room.clients.delete(client);room.lastActive=Date.now();broadcast(room);});
    });return true;
  };
  // Fixed 20Hz simulation, hold leases expire even on a lost release packet.
  const tick=setInterval(()=>{
    const now=Date.now();
    for(const room of rooms.values()){
      if(!room.clients.size)continue;
      const previous=room.game.state.phase;
      if(count(room,'display')){
        const reeling=[...room.clients.values()].some(client=>client.reelUntil>now);
        room.game.step(.05,reeling,now);
      }
      const phase=room.game.state.phase;
      if(previous!==phase||(phase!=='idle'&&phase!=='caught'&&phase!=='escaped')||room.game.isEscapeAnimating()){room.lastActive=now;broadcast(room);}
      else if(room.game.state.resultAt&&now-room.game.state.resultAt<150)broadcast(room);
    }
  },50);
  tick.unref();
  const cleanup=setInterval(()=>{for(const[id,room]of rooms)if(!room.clients.size&&Date.now()-room.lastActive>30*60*1000)rooms.delete(id);},60_000);cleanup.unref();
  return{upgrade,close(){clearInterval(tick);clearInterval(cleanup);for(const room of rooms.values())for(const client of room.clients.keys())client.terminate();sockets.close();}};
}
