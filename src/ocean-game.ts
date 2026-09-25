import { FishLocomotion, magnitude, normalise, scale, type FishMotionSnapshot, type Vec3 } from './fish.js';
import { BITE_APPROACH_SECONDS, PRE_BITE_APPROACH_SECONDS, WAIT_APPROACH_FRACTION, easeFishApproach } from './fish-approach.js';
import { DEFAULT_FISH_SPECIES_ID, nextFishSpeciesId, type FishSpeciesId } from './fish-species.js';

export type OceanPhase = 'idle' | 'casting' | 'waiting' | 'biting' | 'fighting' | 'caught' | 'escaped' | 'retrieving';
export type OceanAction = {action:'cast';strength:number;aim:number} | {action:'hook'|'retrieve'|'reset'};
export type OceanState = {
  phase:OceanPhase; strength:number; aim:number; revision:number; castAt:number; retrieveAt:number;
  tension:number; distance:number; initialDistance:number; reeling:boolean; biteRemaining:number;
  fightTime:number; mode:'rest'|'surge'|'warning'|'split'; school:number; resultAt:number; approach:number;
  reason:''|'missed'|'line'|'slack'|'distance'; catches:number; fishX:number; fishSpeed:number;
  fishId:FishSpeciesId;
  fish:FishMotionSnapshot;
};
export const ESCAPE_ANIMATION_MS=2000;
const ESCAPE_ANIMATION_SECONDS=ESCAPE_ANIMATION_MS/1000;
const BITE_DURATION_SECONDS=4.2;
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const fresh=(fish:FishMotionSnapshot,fishId:FishSpeciesId):OceanState=>({phase:'idle',strength:.65,aim:0,revision:0,castAt:0,retrieveAt:0,tension:0,distance:0,initialDistance:0,reeling:false,biteRemaining:0,fightTime:0,mode:'rest',school:1,resultAt:0,approach:0,reason:'',catches:0,fishX:0,fishSpeed:0,fishId,fish});

/** Authoritative sea game: hold intent is sampled at a fixed server cadence.
 * Network message frequency never determines reel strength or catch outcome. */
export class OceanFishingGame {
  private locomotion=new FishLocomotion({x:0,y:-2.2,z:-20},{x:.1,y:0,z:0});
  state:OceanState;
  private age=0;
  private waitDuration=4;
  private overload=0;
  private slack=0;
  private finalBurst=-1;
  private fishDepth=-2.2;
  private approachStart:Vec3={x:6,y:-2.2,z:-20};
  private approachEnd:Vec3={x:1.5,y:-2.2,z:-20};
  private approachDirection:Vec3={x:-1,y:0,z:0};
  private steeringPhase=0;
  private lateralVelocity=0;
  private swimYaw=.3;
  private swimEffort=.2;
  private escapeAge=ESCAPE_ANIMATION_SECONDS;
  private escapeDirection:Vec3={x:0,y:-.22,z:-1};
  constructor(private readonly random:()=>number=Math.random, private readonly startingFishId:FishSpeciesId=DEFAULT_FISH_SPECIES_ID){
    this.state=fresh(this.locomotion.snapshot(),startingFishId);
  }
  action(input:OceanAction, now:number):boolean {
    const s=this.state;
    if(input.action==='cast'&&s.phase==='idle'){
      const strength=clamp(input.strength,.2,1), length=12+strength*23;
      this.age=0;this.overload=0;this.slack=0;this.finalBurst=-1;this.waitDuration=2.4+clamp(this.random(),0,1)*1.8;
      this.fishDepth=-2.2;
      this.steeringPhase=0;this.lateralVelocity=0;this.swimYaw=.3;this.swimEffort=.2;
      this.escapeAge=ESCAPE_ANIMATION_SECONDS;
      const bait={x:clamp(input.aim,-1,1)*7,y:this.fishDepth,z:-length};
      const side=s.revision%2===0?-1:1;
      this.approachStart={x:bait.x+side*6,y:bait.y,z:bait.z};
      this.approachEnd={x:bait.x+side*1.5,y:bait.y,z:bait.z};
      this.approachDirection=normalise({x:this.approachEnd.x-this.approachStart.x,y:0,z:0});
      this.locomotion.reset(this.approachStart,scale(this.approachDirection,.12));
      this.state={...fresh(this.locomotion.snapshot(),s.fishId),phase:'casting',strength,aim:clamp(input.aim,-1,1),revision:s.revision+1,castAt:now,catches:s.catches,distance:length,initialDistance:length};
      this.syncFishSnapshot();return true;
    }
    if(input.action==='hook'&&s.phase==='biting'){
      s.fishX=s.fish.position.x;s.distance=Math.max(1.7,-s.fish.position.z);this.fishDepth=s.fish.position.y;
      s.phase='fighting';s.tension=.34;s.biteRemaining=0;s.mode='surge';this.age=0;
      this.locomotion.triggerCStart({x:.3,y:0,z:-1});this.syncFishSnapshot();return true;
    }
    if(input.action==='retrieve'&&s.phase==='waiting'){
      s.phase='retrieving';s.retrieveAt=now;this.age=0;return true;
    }
    if(input.action==='reset'&&(s.phase==='caught'||s.phase==='escaped')){this.reset();return true;}
    return false;
  }
  private reset(){
    this.fishDepth=-2.2;
    this.steeringPhase=0;this.lateralVelocity=0;this.swimYaw=.3;this.swimEffort=.2;
    this.escapeAge=ESCAPE_ANIMATION_SECONDS;
    this.locomotion.reset({x:0,y:this.fishDepth,z:-20},{x:.1,y:0,z:0});
    const fishId=nextFishSpeciesId(this.state.fishId,this.state.catches);
    this.state={...fresh(this.locomotion.snapshot(),fishId),revision:this.state.revision,catches:this.state.catches};this.age=0;
  }
  private escape(reason:OceanState['reason'],now:number){
    const fish=this.locomotion.snapshot(),heading=fish.heading;
    const side=Math.sign(heading.x||.45),lateral=side*Math.max(.45,Math.abs(heading.x)*.6);
    this.escapeDirection=normalise({x:lateral,y:-.22,z:Math.min(-.72,heading.z)});
    this.escapeAge=0;
    this.locomotion.triggerCStart(this.escapeDirection);
    this.state.phase='escaped';this.state.reason=reason;this.state.resultAt=now;this.state.reeling=false;this.state.school=1;
    this.syncFishSnapshot();
  }
  isEscapeAnimating():boolean{return this.state.phase==='escaped'&&this.escapeAge<ESCAPE_ANIMATION_SECONDS;}
  private stepEscape(dt:number):void{
    const before=this.locomotion.snapshot();
    this.locomotion.update(dt,{direction:this.escapeDirection,speed:4.8,gait:'burst'});
    const moved=this.locomotion.snapshot();
    const previousYaw=Math.atan2(before.heading.x,-before.heading.z),nextYaw=Math.atan2(moved.heading.x,-moved.heading.z);
    const turn=clamp(Math.atan2(Math.sin(nextYaw-previousYaw),Math.cos(nextYaw-previousYaw))/Math.max(dt,.001)/1.65,-1,1);
    this.locomotion.setRootMotion(moved.position,moved.velocity,{velocity:scale(moved.heading,moved.speed),effort:1,turn});
    this.escapeAge+=dt;
    this.syncFishSnapshot();
  }
  private advanceApproach(progress:number,dt:number):void{
    const s=this.state,from=this.approachStart,to=this.approachEnd,eased=clamp(progress,0,1);
    const previous=s.fish.position;
    const position={x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased,z:from.z+(to.z-from.z)*eased};
    const velocity={x:(position.x-previous.x)/Math.max(dt,.001),y:(position.y-previous.y)/Math.max(dt,.001),z:(position.z-previous.z)/Math.max(dt,.001)};
    this.locomotion.update(dt,{direction:this.approachDirection,speed:1.05,gait:'cruise'});
    this.locomotion.setRootMotion(position,velocity,{velocity:scale(this.approachDirection,1.05),effort:.28,turn:0});
    this.fishDepth=position.y;this.syncFishSnapshot();
  }
  private holdNearBait(dt:number):void{
    const root={...this.state.fish.position},heading=this.state.fish.heading;
    this.locomotion.update(dt,{direction:heading,speed:.16,gait:'coast'});
    this.locomotion.setRootMotion(root,{x:0,y:0,z:0},{velocity:scale(heading,.16),effort:.12,turn:0});
    this.syncFishSnapshot();
  }
  step(delta:number,reeling:boolean,now:number){
    const dt=clamp(delta,0,.1),s=this.state;this.age+=dt;s.reeling=s.phase==='fighting'&&reeling;
    if(dt===0)return;
    if(s.phase==='casting'&&this.age>=1.28){s.phase='waiting';this.age=0;}
    else if(s.phase==='retrieving'&&this.age>=.95)this.reset();
    else if(s.phase==='waiting'){
      if(this.age>=this.waitDuration){s.phase='biting';s.biteRemaining=BITE_DURATION_SECONDS;this.age=0;}
      else{
        const approachStart=Math.max(0,this.waitDuration-PRE_BITE_APPROACH_SECONDS);
        const p=clamp((this.age-approachStart)/PRE_BITE_APPROACH_SECONDS,0,1);
        s.approach=WAIT_APPROACH_FRACTION*easeFishApproach(p);
        if(p>0)this.advanceApproach(s.approach,dt);
      }
    }
    else if(s.phase==='biting'){
      // After the float dips, finish the same server-owned approach instead
      // of revealing a fish that was already parked beneath the bait.
      const p=clamp(this.age/BITE_APPROACH_SECONDS,0,1);
      s.approach=WAIT_APPROACH_FRACTION+(1-WAIT_APPROACH_FRACTION)*easeFishApproach(p);
      if(p<1)this.advanceApproach(s.approach,dt);
      else this.holdNearBait(dt);
      s.biteRemaining=Math.max(0,BITE_DURATION_SECONDS-this.age);if(s.biteRemaining<=0)this.escape('missed',now);
    }else if(s.phase==='escaped'&&this.isEscapeAnimating()){
      const step=Math.min(dt,ESCAPE_ANIMATION_SECONDS-this.escapeAge);
      this.stepEscape(step);
    }else if(s.phase==='fighting'){
      s.fightTime+=dt;
      const t=s.fightTime;
      if(s.distance<6&&this.finalBurst<0)this.finalBurst=t;
      const finale=this.finalBurst<0?-1:t-this.finalBurst;
      s.mode= t<1.3?'surge':t<5?'rest':t<5.9?'warning':t<8.6?'split':((t-8.6)%6.2<1.4?'surge':'rest');
      if(finale>=0&&finale<.8)s.mode='warning';
      else if(finale>=.8&&finale<2.6)s.mode='split';
      s.school=s.mode==='split'?7:1;
      const surge=s.mode==='surge'||s.mode==='split';
      const pressure=surge?.28:.035;
      s.tension=clamp(s.tension+((reeling?.14:-.24)+pressure)*dt,0,1);
      const previousDistance=s.distance,previousFishX=s.fishX,previousDepth=this.fishDepth;
      // A burst must be able to take line even while the player is reeling;
      // the following lull remains the clear opportunity to recover it.
      const retreatSpeed=surge?2.6:.22;
      const reelSpeed=reeling?(surge?1.55:3.5):0;
      s.distance=clamp(s.distance+(retreatSpeed-reelSpeed)*dt,1.7,s.initialDistance+24);
      this.overload=s.tension>=.97?this.overload+dt:Math.max(0,this.overload-dt*2);
      this.slack=s.tension<.06?this.slack+dt:0;
      // Continuous steering and bounded acceleration: changing fight mode no
      // longer jumps to another sine-wave phase or instantly reverses the fish.
      this.steeringPhase+=dt*(surge?1.65:.72);
      const lateral=Math.sin(this.steeringPhase)*(surge?2.4:1.25);
      const wantedVelocity=clamp((lateral-s.fishX)*2.2,-2.5,2.5);
      this.lateralVelocity+=clamp(wantedVelocity-this.lateralVelocity,-dt*4,dt*4);
      s.fishX+=this.lateralVelocity*dt;
      // Body, tall fins and tail must remain below the wave troughs. These
      // depths affect presentation only: tension, distance and timers above
      // retain the exact same catch/difficulty calculations.
      const targetDepth=s.mode==='split' ? -1.65 : s.mode==='surge' ? -1.8 : s.mode==='warning' ? -2.05 : -2.4;
      const horizontalTravel=Math.hypot(s.fishX-previousFishX,s.distance-previousDistance);
      const diveStep=(targetDepth-this.fishDepth)*Math.min(1,dt*1.2);
      this.fishDepth+=clamp(diveStep,-horizontalTravel*.18,horizontalTravel*.18);
      const velocity:Vec3={x:(s.fishX-previousFishX)/dt,y:(this.fishDepth-previousDepth)/dt,z:-(s.distance-previousDistance)/dt};
      const previousYaw=this.swimYaw;
      const wantedYaw=Math.atan2(this.lateralVelocity,.8);
      this.swimYaw+=clamp(wantedYaw-this.swimYaw,-dt*1.65,dt*1.65);
      this.swimEffort+=((surge?.95:reeling?.58:.22)-this.swimEffort)*(1-Math.exp(-dt*4));
      const swimSpeed=.65+this.swimEffort*2.5;
      const propulsion:Vec3={x:Math.sin(this.swimYaw)*swimSpeed,y:velocity.y*.4,z:-Math.cos(this.swimYaw)*swimSpeed};
      const turn=clamp((this.swimYaw-previousYaw)/dt/1.65,-1,1);
      this.locomotion.update(dt,{direction:normalise(propulsion),speed:magnitude(propulsion),gait:surge?'burst':reeling?'turn':'coast'});
      this.locomotion.setRootMotion({x:s.fishX,y:this.fishDepth,z:-s.distance},velocity,{velocity:propulsion,effort:this.swimEffort,turn});
      this.syncFishSnapshot();
      // Give the player time to react to a bad reel decision. A short red
      // spike or a few seconds of slack should not immediately end the run.
      if(this.overload>1.4)this.escape('line',now);
      else if(this.slack>5.5)this.escape('slack',now);
      else if(s.distance>=s.initialDistance+24||t>150)this.escape('distance',now);
      else if(s.distance<=2.2&&t>6){s.phase='caught';s.resultAt=now;s.catches++;s.reeling=false;s.tension=.15;s.school=1;}
    }
  }
  private syncFishSnapshot():void {
    const fish=this.locomotion.snapshot();
    this.state.fish=fish;
    this.state.fishX=fish.position.x;
    this.state.fishSpeed=fish.speed;
  }
  snapshot():OceanState{
    this.syncFishSnapshot();
    return {...this.state,fish:this.locomotion.snapshot()};
  }
}
