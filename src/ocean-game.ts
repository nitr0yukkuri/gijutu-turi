import { FishLocomotion } from './fish.js';

export type OceanPhase = 'idle' | 'casting' | 'waiting' | 'biting' | 'fighting' | 'caught' | 'escaped' | 'retrieving';
export type FishSpecies = 'go' | 'k8s';
export type OceanAction = {action:'cast';strength:number;aim:number} | {action:'hook'|'retrieve'|'reset'};
export type OceanState = {
  phase:OceanPhase; strength:number; aim:number; revision:number; castAt:number; retrieveAt:number;
  tension:number; distance:number; initialDistance:number; reeling:boolean; biteRemaining:number;
  fightTime:number; mode:'rest'|'surge'|'warning'|'split'; school:number; resultAt:number;
  reason:''|'missed'|'line'|'slack'|'distance'; catches:number; fishX:number; fishSpeed:number;
  fishHeadingX:number; fishHeadingZ:number; fishWavePhase:number; fishWaveAmplitude:number; fishWaveFrequency:number;
  species:FishSpecies;
};
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const fresh=(species:FishSpecies='go'):OceanState=>({phase:'idle',strength:.65,aim:0,revision:0,castAt:0,retrieveAt:0,tension:0,distance:0,initialDistance:0,reeling:false,biteRemaining:0,fightTime:0,mode:'rest',school:1,resultAt:0,reason:'',catches:0,fishX:0,fishSpeed:0,fishHeadingX:1,fishHeadingZ:0,fishWavePhase:0,fishWaveAmplitude:0,fishWaveFrequency:1.6,species});

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
  private syncFishMotion(){
    const motion=this.locomotion.snapshot();
    this.state.fishX=motion.position.x;
    this.state.fishSpeed=motion.speed;
    this.state.fishHeadingX=motion.heading.x;
    this.state.fishHeadingZ=motion.heading.z;
    this.state.fishWavePhase=motion.bodyWave.phase;
    this.state.fishWaveAmplitude=motion.bodyWave.amplitude;
    this.state.fishWaveFrequency=motion.bodyWave.frequency;
  }
  private updateAmbientFish(delta:number, biting:boolean){
    const sway=this.age*(biting?2.2:.7);
    this.locomotion.update(delta,{
      direction:{x:Math.sin(sway)*(biting?.75:.18),y:0,z:Math.cos(sway*(biting?0.8:.6))*(biting?.2:.05)},
      speed:biting?.85:.35,
      gait:biting?'turn':'cruise',
    });
    this.syncFishMotion();
  }
  action(input:OceanAction, now:number):boolean {
    const s=this.state;
    if(input.action==='cast'&&s.phase==='idle'){
      const strength=clamp(input.strength,.2,1), length=10+strength*18;
      const species:FishSpecies=this.random()<.35?'k8s':'go';
      this.state={...fresh(species),phase:'casting',strength,aim:clamp(input.aim,-1,1),revision:s.revision+1,castAt:now,catches:s.catches,distance:length,initialDistance:length};
      this.age=0;this.overload=0;this.slack=0;this.finalBurst=-1;this.waitDuration=2+clamp(this.random(),0,1)*1.5;
      this.locomotion.reset({x:0,y:-.3,z:-length},{x:.1,y:0,z:0});this.syncFishMotion();return true;
    }
    if(input.action==='hook'&&s.phase==='biting'){
      s.phase='fighting';s.tension=.34;s.biteRemaining=0;s.mode='surge';this.age=0;
      this.locomotion.triggerCStart({x:.3,y:0,z:-1});this.syncFishMotion();return true;
    }
    if(input.action==='retrieve'&&s.phase==='waiting'){
      s.phase='retrieving';s.retrieveAt=now;this.age=0;return true;
    }
    if(input.action==='reset'&&(s.phase==='caught'||s.phase==='escaped')){this.reset();return true;}
    return false;
  }
  private reset(){this.state={...fresh(this.state.species),revision:this.state.revision,catches:this.state.catches};this.age=0;}
  private escape(reason:OceanState['reason'],now:number){this.state.phase='escaped';this.state.reason=reason;this.state.resultAt=now;this.state.reeling=false;this.state.school=1;}
  step(delta:number,reeling:boolean,now:number){
    const dt=clamp(delta,0,.1),s=this.state;this.age+=dt;s.reeling=s.phase==='fighting'&&reeling;
    if(s.phase==='casting'&&this.age>=.95){s.phase='waiting';this.age=0;}
    else if(s.phase==='retrieving'&&this.age>=.65)this.reset();
    else if(s.phase==='waiting'&&this.age>=this.waitDuration){s.phase='biting';s.biteRemaining=1.8;this.age=0;}
    else if(s.phase==='biting'){
      s.biteRemaining=Math.max(0,1.8-this.age);this.updateAmbientFish(dt,true);if(s.biteRemaining<=0)this.escape('missed',now);
    }else if(s.phase==='fighting'){
      s.fightTime+=dt;
      const t=s.fightTime;
      if(s.distance<6&&this.finalBurst<0)this.finalBurst=t;
      const finale=this.finalBurst<0?-1:t-this.finalBurst;
      s.mode= t<.9?'surge':t<3.6?'rest':t<4.2?'warning':t<6.1?'split':((t-6.1)%4.8<1.1?'surge':'rest');
      if(finale>=0&&finale<.8)s.mode='warning';
      else if(finale>=.8&&finale<2.6)s.mode='split';
      s.school=s.mode==='split'?7:1;
      const surge=s.mode==='surge'||s.mode==='split';
      const pressure=surge?.38:.04;
      s.tension=clamp(s.tension+((reeling?.24:-.30)+pressure)*dt,0,1);
      s.distance=clamp(s.distance+((surge?1.5:.3)-(reeling?(surge?.7:4.6):0))*dt,1.7,s.initialDistance+16);
      this.overload=s.tension>=.97?this.overload+dt:Math.max(0,this.overload-dt*2);
      this.slack=s.tension<.06?this.slack+dt:0;
      const lateral=Math.sin(t*(surge?2.8:.8))*(surge?2.6:.65);
      this.locomotion.update(dt,{direction:{x:lateral*.2,y:0,z:-1},speed:surge?2.8:.45,gait:surge?'burst':'coast'});
      this.syncFishMotion();
      if(this.overload>.35)this.escape('line',now);
      else if(this.slack>2.5)this.escape('slack',now);
      else if(s.distance>=s.initialDistance+14||t>45)this.escape('distance',now);
      else if(s.distance<=2.2&&t>5.8){s.phase='caught';s.resultAt=now;s.catches++;s.reeling=false;s.tension=.15;s.school=1;}
    }else if(s.phase==='waiting'){
      this.updateAmbientFish(dt,false);
    }
  }
  snapshot():OceanState{return {...this.state};}
}
