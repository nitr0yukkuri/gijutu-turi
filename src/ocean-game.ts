import { FishLocomotion } from './fish.js';

export type OceanPhase = 'idle' | 'casting' | 'waiting' | 'biting' | 'fighting' | 'caught' | 'escaped' | 'retrieving';
export type OceanAction = {action:'cast';strength:number;aim:number} | {action:'hook'|'retrieve'|'reset'};
export type OceanState = {
  phase:OceanPhase; strength:number; aim:number; revision:number; castAt:number; retrieveAt:number;
  tension:number; distance:number; initialDistance:number; reeling:boolean; biteRemaining:number;
  fightTime:number; mode:'rest'|'surge'|'warning'|'split'; school:number; resultAt:number;
  reason:''|'missed'|'line'|'slack'|'distance'; catches:number; fishX:number; fishSpeed:number;
};
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const fresh=():OceanState=>({phase:'idle',strength:.65,aim:0,revision:0,castAt:0,retrieveAt:0,tension:0,distance:0,initialDistance:0,reeling:false,biteRemaining:0,fightTime:0,mode:'rest',school:1,resultAt:0,reason:'',catches:0,fishX:0,fishSpeed:0});

/** Authoritative sea game: hold intent is sampled at a fixed server cadence.
 * Network message frequency never determines reel strength or catch outcome. */
export class OceanFishingGame {
  state:OceanState=fresh();
  private age=0;
  private waitDuration=4;
  private overload=0;
  private slack=0;
  private finalBurst=-1;
  private locomotion=new FishLocomotion({x:0,y:-.3,z:-20},{x:.1,y:0,z:0});
  constructor(private readonly random:()=>number=Math.random){}
  action(input:OceanAction, now:number):boolean {
    const s=this.state;
    if(input.action==='cast'&&s.phase==='idle'){
      const strength=clamp(input.strength,.2,1), length=12+strength*23;
      this.state={...fresh(),phase:'casting',strength,aim:clamp(input.aim,-1,1),revision:s.revision+1,castAt:now,catches:s.catches,distance:length,initialDistance:length};
      this.age=0;this.overload=0;this.slack=0;this.finalBurst=-1;this.waitDuration=2.4+clamp(this.random(),0,1)*1.8;
      this.locomotion.reset({x:0,y:-.3,z:-length},{x:.1,y:0,z:0});return true;
    }
    if(input.action==='hook'&&s.phase==='biting'){
      s.phase='fighting';s.tension=.34;s.biteRemaining=0;s.mode='surge';this.age=0;
      this.locomotion.triggerCStart({x:.3,y:0,z:-1});return true;
    }
    if(input.action==='retrieve'&&s.phase==='waiting'){
      s.phase='retrieving';s.retrieveAt=now;this.age=0;return true;
    }
    if(input.action==='reset'&&(s.phase==='caught'||s.phase==='escaped')){this.reset();return true;}
    return false;
  }
  private reset(){this.state={...fresh(),revision:this.state.revision,catches:this.state.catches};this.age=0;}
  private escape(reason:OceanState['reason'],now:number){this.state.phase='escaped';this.state.reason=reason;this.state.resultAt=now;this.state.reeling=false;this.state.school=1;}
  step(delta:number,reeling:boolean,now:number){
    const dt=clamp(delta,0,.1),s=this.state;this.age+=dt;s.reeling=s.phase==='fighting'&&reeling;
    if(s.phase==='casting'&&this.age>=1.28){s.phase='waiting';this.age=0;}
    else if(s.phase==='retrieving'&&this.age>=.95)this.reset();
    else if(s.phase==='waiting'&&this.age>=this.waitDuration){s.phase='biting';s.biteRemaining=4.2;this.age=0;}
    else if(s.phase==='biting'){
      s.biteRemaining=Math.max(0,4.2-this.age);if(s.biteRemaining<=0)this.escape('missed',now);
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
      s.distance=clamp(s.distance+((surge?1.3:.22)-(reeling?(surge?1.55:3.5):0))*dt,1.7,s.initialDistance+24);
      this.overload=s.tension>=.97?this.overload+dt:Math.max(0,this.overload-dt*2);
      this.slack=s.tension<.06?this.slack+dt:0;
      const lateral=Math.sin(t*(surge?2.8:.8))*(surge?2.6:.65);
      s.fishX+=(lateral-s.fishX)*Math.min(1,dt*3);
      this.locomotion.update(dt,{direction:{x:lateral*.2,y:0,z:-1},speed:surge?2.8:.45,gait:surge?'burst':'coast'});
      s.fishSpeed=this.locomotion.snapshot().speed;
      // Give the player time to react to a bad reel decision. A short red
      // spike or a few seconds of slack should not immediately end the run.
      if(this.overload>1.4)this.escape('line',now);
      else if(this.slack>5.5)this.escape('slack',now);
      else if(s.distance>=s.initialDistance+24||t>150)this.escape('distance',now);
      else if(s.distance<=2.2&&t>6){s.phase='caught';s.resultAt=now;s.catches++;s.reeling=false;s.tension=.15;s.school=1;}
    }
  }
  snapshot():OceanState{return {...this.state};}
}
