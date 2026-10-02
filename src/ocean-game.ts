import { FishLocomotion, magnitude, normalise, scale, type FishMotionSnapshot, type Vec3 } from './fish.js';
import { getFishApproachMotionProfile } from './fish-approach-motion.js';
import { BITE_APPROACH_SECONDS, PRE_BITE_APPROACH_SECONDS, WAIT_APPROACH_FRACTION, easeFishApproach } from './fish-approach.js';
import { getFishFightProfile, k8sSurfaceLungeProgress } from './fish-behavior.js';
import { DEFAULT_FISH_SPECIES_ID, nextFishSpeciesId, type FishSpeciesId } from './fish-species.js';
import { RETRIEVE_DURATION_SECONDS } from './ocean-timing.js';
import { CAST_MAX_STRENGTH, CAST_MIN_STRENGTH, castDistanceForStrength } from './cast-distance.js';
import { getHookResult, isCriticalHookWindow } from './hook-timing.js';
import type { AuthoritativeOceanState } from './ocean-contract.js';

export type { OceanMode, OceanPhase } from './ocean-contract.js';
export type OceanAction = {action:'cast';strength:number;aim:number} | {action:'hook'|'retrieve'|'reset'};
export type FishSelectionMode = 'rotate' | 'fixed';
export type OceanState = AuthoritativeOceanState & { initialDistance:number; biteRemaining:number };
export const ESCAPE_ANIMATION_MS=2000;
const ESCAPE_ANIMATION_SECONDS=ESCAPE_ANIMATION_MS/1000;
// Give the player a readable reaction window after the float visibly sinks.
// The fight difficulty starts only after hooking, so this does not change the
// reel/tension balance; it only prevents a missed bite from feeling instant.
const BITE_DURATION_SECONDS=6;
const SLACK_TENSION_THRESHOLD=.06;
const SLACK_ESCAPE_SECONDS=5.5;
const MAX_FIGHT_DISTANCE_METERS=50;
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const fresh=(fish:FishMotionSnapshot,fishId:FishSpeciesId):OceanState=>({phase:'idle',strength:.65,aim:0,revision:0,castAt:0,retrieveAt:0,tension:0,distance:0,initialDistance:0,reeling:false,biteRemaining:0,fightTime:0,mode:'rest',school:1,resultAt:0,approach:0,stamina:1,canReel:false,criticalWindow:false,hookResult:null,reason:'',catches:0,fishX:0,fishSpeed:0,fishId,fish});

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
  // Distance is the authoritative line length, but Docker needs an
  // authoritative velocity as well. Without this, changing from retreat to
  // reel reverses the whale in one tick and makes a large animal feel weightless.
  private lineVelocity=0;
  private escapeAge=ESCAPE_ANIMATION_SECONDS;
  private escapeDirection:Vec3={x:0,y:-.22,z:-1};
  constructor(
    private readonly random:()=>number=Math.random,
    private readonly startingFishId:FishSpeciesId=DEFAULT_FISH_SPECIES_ID,
    private readonly fishSelectionMode:FishSelectionMode='rotate',
  ){
    this.state=fresh(this.locomotion.snapshot(),startingFishId);
  }
  action(input:OceanAction, now:number):boolean {
    const s=this.state;
    if(input.action==='cast'&&s.phase==='idle'){
      const strength=clamp(input.strength,CAST_MIN_STRENGTH,CAST_MAX_STRENGTH), length=castDistanceForStrength(strength);
      this.age=0;this.overload=0;this.slack=0;this.finalBurst=-1;this.waitDuration=2.4+clamp(this.random(),0,1)*1.8;
      this.fishDepth=-2.2;
      this.steeringPhase=0;this.lateralVelocity=0;this.swimYaw=.3;this.swimEffort=.2;this.lineVelocity=0;
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
      s.hookResult=getHookResult(this.age);
      s.criticalWindow=false;
      s.fishX=s.fish.position.x;s.distance=Math.max(1.7,-s.fish.position.z);this.fishDepth=s.fish.position.y;
      s.phase='fighting';s.tension=getFishFightProfile(s.fishId).initialTension;s.biteRemaining=0;s.mode='surge';s.stamina=1;s.canReel=false;this.age=0;
      this.lineVelocity=s.fishId==='whale-001'||s.fishId==='k8s-001'?.9:0;
      const hookHeading=normalise(s.fish.heading);
      this.swimYaw=Math.atan2(hookHeading.x,-hookHeading.z);
      this.locomotion.triggerCStart(hookHeading);this.syncFishSnapshot();return true;
    }
    if(input.action==='retrieve'&&s.phase==='waiting'){
      s.phase='retrieving';s.retrieveAt=now;this.age=0;return true;
    }
    if(input.action==='reset'&&(s.phase==='caught'||s.phase==='escaped')){this.reset();return true;}
    return false;
  }
  private reset(){
    this.fishDepth=-2.2;
    this.steeringPhase=0;this.lateralVelocity=0;this.swimYaw=.3;this.swimEffort=.2;this.lineVelocity=0;
    this.escapeAge=ESCAPE_ANIMATION_SECONDS;
    this.locomotion.reset({x:0,y:this.fishDepth,z:-20},{x:.1,y:0,z:0});
    const fishId=this.fishSelectionMode==='fixed'
      ? this.state.fishId
      : nextFishSpeciesId(this.state.fishId,this.state.catches);
    this.state={...fresh(this.locomotion.snapshot(),fishId),revision:this.state.revision,catches:this.state.catches};this.age=0;
  }
  private escape(reason:OceanState['reason'],now:number){
    const fish=this.locomotion.snapshot(),heading=fish.heading;
    const side=Math.sign(heading.x||.45),lateral=side*Math.max(.45,Math.abs(heading.x)*.6);
    this.escapeDirection=normalise({x:lateral,y:-.22,z:Math.min(-.72,heading.z)});
    this.escapeAge=0;
    this.locomotion.triggerCStart(this.escapeDirection);
    this.state.phase='escaped';this.state.reason=reason;this.state.resultAt=now;this.state.reeling=false;this.state.canReel=false;this.state.school=1;
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
    const motion=getFishApproachMotionProfile(s.fishId).approach;
    const previous=s.fish.position;
    const position={x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased,z:from.z+(to.z-from.z)*eased};
    const velocity={x:(position.x-previous.x)/Math.max(dt,.001),y:(position.y-previous.y)/Math.max(dt,.001),z:(position.z-previous.z)/Math.max(dt,.001)};
    this.locomotion.update(dt,{direction:this.approachDirection,speed:motion.speed,gait:motion.gait});
    this.locomotion.setRootMotion(position,velocity,{velocity:scale(this.approachDirection,motion.speed),effort:motion.effort,turn:0});
    this.fishDepth=position.y;this.syncFishSnapshot();
  }
  private holdNearBait(dt:number):void{
    const root={...this.state.fish.position},heading=this.state.fish.heading;
    const motion=getFishApproachMotionProfile(this.state.fishId).stationKeep;
    this.locomotion.update(dt,{direction:heading,speed:motion.speed,gait:motion.gait});
    this.locomotion.setRootMotion(root,{x:0,y:0,z:0},{velocity:scale(heading,motion.speed),effort:motion.effort,turn:0});
    this.syncFishSnapshot();
  }
  step(delta:number,reeling:boolean,now:number){
    const dt=clamp(delta,0,.1),s=this.state;this.age+=dt;s.reeling=s.phase==='fighting'&&reeling;
    if(s.phase!=='fighting'){
      s.canReel=false;
    }
    if(dt===0)return;
    if(s.phase==='casting'&&this.age>=1.28){s.phase='waiting';this.age=0;}
    else if(s.phase==='retrieving'&&this.age>=RETRIEVE_DURATION_SECONDS)this.reset();
    else if(s.phase==='waiting'){
      if(this.age>=this.waitDuration){s.phase='biting';s.biteRemaining=BITE_DURATION_SECONDS;s.criticalWindow=false;s.hookResult=null;this.age=0;}
      else{
        const approachStart=Math.max(0,this.waitDuration-PRE_BITE_APPROACH_SECONDS);
        const p=clamp((this.age-approachStart)/PRE_BITE_APPROACH_SECONDS,0,1);
        s.approach=WAIT_APPROACH_FRACTION*easeFishApproach(p);
        if(p>0)this.advanceApproach(s.approach,dt);
      }
    }
    else if(s.phase==='biting'){
      s.criticalWindow=isCriticalHookWindow(this.age);
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
      const profile=getFishFightProfile(s.fishId);
      if(s.distance<6&&this.finalBurst<0)this.finalBurst=t;
      const finale=this.finalBurst<0?-1:t-this.finalBurst;
      ({mode:s.mode,school:s.school}=profile.modeAt(t,finale));
      const surge=s.mode==='surge'||s.mode==='split';
      // The warning telegraph is a Go-fish attack cue. Docker also has a
      // warning phase near landing, but it must keep its steady-pull motion.
      const warning=s.mode==='warning'&&s.fishId==='fish-001';
      const opening=t<profile.openingSeconds;
      const staminaFactor=.55+s.stamina*.45;
      // A running fish cannot be brute-forced by holding the reel. The
      // recovery window comes from the fish's own fatigue and fight mode, so
      // the player only has to decide when to reel or release.
      s.canReel=(profile.canReelDuringSurge&&surge&&!opening)||(!opening&&!surge)||s.stamina<.34;
      const pressure=opening
        ? profile.openingPressure
        : surge
          ? profile.surgePressure??profile.basePressure
          : warning
            ? profile.warningPressure??profile.basePressure
            : profile.basePressure;
      s.tension=clamp(
        s.tension+((reeling?profile.reelingLoad:-profile.releaseRecovery)+pressure*staminaFactor)*dt,
        reeling?profile.minimumReelingTension:0,
        1,
      );
      const previousDistance=s.distance,previousFishX=s.fishX,previousDepth=this.fishDepth;
      // A burst must be able to take line even while the player is reeling;
      // the following lull remains the clear opportunity to recover it.
      // A tired fish still makes short resistance pulses; fatigue should not
      // erase the readable attack motion or make a burst turn into a teleport
      // back toward the player. Keep a small burst floor while weakening the
      // baseline pull more strongly.
      const retreatStaminaFactor=.92+s.stamina*.08;
      const retreatSpeed=(opening
        ? profile.openingRetreatSpeed
        : surge
          ? profile.surgeRetreatSpeed??profile.baseRetreatSpeed
          : warning
            ? profile.warningRetreatSpeed??profile.baseRetreatSpeed
            : profile.baseRetreatSpeed)*retreatStaminaFactor;
      const reelSpeed=reeling
        ? opening
          ? profile.openingReelSpeed
          : surge
            ? profile.surgeReelSpeed??profile.baseReelSpeed
            : warning
              ? profile.warningReelSpeed??profile.baseReelSpeed
            : profile.baseReelSpeed
        : 0;
      const requestedLineVelocity=retreatSpeed-reelSpeed;
      const strokePhase=this.state.fish.bodyWave.phase;
      const powerStroke=Math.max(0,Math.sin(strokePhase+.35));
      const strokePush=(profile.strokePush??0)*powerStroke*this.swimEffort;
      const targetLineVelocity=requestedLineVelocity+strokePush;
      if(profile.lineResponse){
        this.lineVelocity+=
          (targetLineVelocity-this.lineVelocity)*(1-Math.exp(-profile.lineResponse*dt));
      }else this.lineVelocity=targetLineVelocity;
      s.distance=clamp(s.distance+this.lineVelocity*dt,1.7,MAX_FIGHT_DISTANCE_METERS);
      this.overload=s.tension>=.97?this.overload+dt:Math.max(0,this.overload-dt*2);
      this.slack=s.tension<SLACK_TENSION_THRESHOLD?this.slack+dt:0;
      // Continuous steering and bounded acceleration: changing fight mode no
      // longer jumps to another sine-wave phase or instantly reverses the fish.
      this.steeringPhase+=dt*(surge?1.65:warning?1.15:.72);
      const k8sSurfaceLunge=s.fishId==='k8s-001'&&s.mode==='split';
      const surfaceLunge=k8sSurfaceLunge?k8sSurfaceLungeProgress(t):0;
      const lateralAmplitude=opening
        ? profile.openingLateralAmplitude
        : surge
          ? profile.surgeLateralAmplitude??profile.baseLateralAmplitude
          : profile.baseLateralAmplitude;
      const lungeSide=-Math.sign(this.approachDirection.x||1);
      const lateral=Math.sin(this.steeringPhase)*lateralAmplitude+lungeSide*.72*surfaceLunge;
      const wantedVelocity=clamp((lateral-s.fishX)*2.2,-profile.lateralLimit,profile.lateralLimit);
      const lateralAcceleration=profile.lateralAcceleration??4;
      this.lateralVelocity+=clamp(wantedVelocity-this.lateralVelocity,-dt*lateralAcceleration,dt*lateralAcceleration);
      const fatigueMode=opening?1.35:surge?1:warning?.78:.34;
      const fatigueRate=profile.fatigueRate??0;
      const recoveryRate=!reeling&&!opening&&!surge?(profile.staminaRecovery??0):0;
      s.stamina=clamp(s.stamina-fatigueRate*fatigueMode*dt+recoveryRate*dt,0,1);
      s.canReel=(profile.canReelDuringSurge&&surge&&!opening)||(!opening&&!surge)||s.stamina<.34;
      s.fishX+=this.lateralVelocity*dt;
      // Server-owned depth drives the body and its waterline crossings. K8S
      // gets one short breach arc; it changes presentation only, not tension,
      // distance, timers, or catch difficulty.
      // Skim the surface with a low, forward lunge instead of launching the
      // long armored body upright out of the water.
      const targetDepth=k8sSurfaceLunge?-1.95+2*surfaceLunge:s.mode==='split'?-1.65:s.mode==='surge'?-1.8:warning?-2.05:-2.4;
      const k8sSurfaceRecovery=s.fishId==='k8s-001'&&this.fishDepth>-2.4;
      const horizontalTravel=Math.hypot(s.fishX-previousFishX,s.distance-previousDistance);
      const diveResponse=k8sSurfaceLunge?7:k8sSurfaceRecovery?1.8:profile.depthResponse??1.2;
      const diveStep=(targetDepth-this.fishDepth)*Math.min(1,dt*diveResponse);
      const verticalLimit=k8sSurfaceLunge?dt*4.5:k8sSurfaceRecovery?dt*1.8:horizontalTravel*.18;
      this.fishDepth+=clamp(diveStep,-verticalLimit,verticalLimit);
      const velocity:Vec3={x:(s.fishX-previousFishX)/dt,y:(this.fishDepth-previousDepth)/dt,z:-(s.distance-previousDistance)/dt};
      const previousYaw=this.swimYaw;
      const wantedYaw=Math.atan2(this.lateralVelocity,.8);
      const turnRate=profile.turnRate??1.65;
      this.swimYaw+=clamp(wantedYaw-this.swimYaw,-dt*turnRate,dt*turnRate);
      const effortTarget=(opening
        ? profile.openingEffort
        : surge
          ? profile.surgeEffort??(reeling?profile.reelingEffort:profile.restEffort)
          : warning
            ? profile.warningEffort??(reeling?profile.reelingEffort:profile.restEffort)
          : reeling
            ? profile.reelingEffort
            : profile.restEffort)*staminaFactor;
      this.swimEffort+=(effortTarget-this.swimEffort)*(1-Math.exp(-dt*4));
      const swimSpeed=.65+this.swimEffort*2.5;
      const propulsion:Vec3={x:Math.sin(this.swimYaw)*swimSpeed,y:velocity.y*.4,z:-Math.cos(this.swimYaw)*swimSpeed};
      const turn=clamp((this.swimYaw-previousYaw)/dt/turnRate,-1,1);
      this.locomotion.update(dt,{direction:normalise(propulsion),speed:magnitude(propulsion),gait:profile.gaitAt({mode:s.mode,opening,reeling})});
      this.locomotion.setRootMotion({x:s.fishX,y:this.fishDepth,z:-s.distance},velocity,{velocity:propulsion,effort:this.swimEffort,turn});
      this.syncFishSnapshot();
      // Give the player time to react to a bad reel decision. A short red
      // spike or a few seconds of slack should not immediately end the run.
      if(this.overload>1.4)this.escape('line',now);
      else if(s.distance>=MAX_FIGHT_DISTANCE_METERS||t>150)this.escape('distance',now);
      else if(this.slack>SLACK_ESCAPE_SECONDS)this.escape('slack',now);
      else if(s.distance<=2.2&&t>6){s.phase='caught';s.resultAt=now;s.catches++;s.reeling=false;s.canReel=false;s.tension=.15;s.school=1;}
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
  wireSnapshot():AuthoritativeOceanState{
    const state=this.snapshot();
    return{
      phase:state.phase,
      strength:state.strength,
      aim:state.aim,
      revision:state.revision,
      castAt:state.castAt,
      retrieveAt:state.retrieveAt,
      tension:state.tension,
      distance:state.distance,
      reeling:state.reeling,
      mode:state.mode,
      stamina:state.stamina,
      canReel:state.canReel,
      fightTime:state.fightTime,
      criticalWindow:state.criticalWindow,
      hookResult:state.hookResult,
      approach:state.approach,
      catches:state.catches,
      reason:state.reason,
      resultAt:state.resultAt,
      fish:state.fish,
      fishId:state.fishId,
      fishX:state.fishX,
      fishSpeed:state.fishSpeed,
      school:state.school,
    };
  }
}
