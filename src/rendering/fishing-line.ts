export type FishingLinePoint = Readonly<{x:number;y:number;z:number}>;
export type MutableFishingLinePoint = {x:number;y:number;z:number};

export type FishingLineBuffer = Readonly<{
  positions:Float32Array;
  rgba:Float32Array;
}>;

export type FishingLineSplit = Readonly<{
  waterFraction:number|null;
  airVisible:boolean;
  waterVisible:boolean;
}>;

export type FishingLinePointProjector = (point:MutableFishingLinePoint)=>void;

const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smoothstep=(value:number)=>value*value*(3-2*value);

function setLinePoint(
  start:FishingLinePoint,
  end:FishingLinePoint,
  fraction:number,
  airSag:number,
  waterSag:number,
  surfaceHeight:(x:number,z:number)=>number,
  maxSag:number,
  result:MutableFishingLinePoint,
):MutableFishingLinePoint {
  const x=start.x+(end.x-start.x)*fraction;
  const z=start.z+(end.z-start.z)*fraction;
  const baseY=start.y+(end.y-start.y)*fraction;
  const depth=surfaceHeight(x,z)-baseY;
  // Blend the two media around the surface instead of starting a new sag curve
  // at the crossing. This keeps both the line position and tangent continuous.
  const wet=smoothstep(clamp((depth+.12)/.24));
  const requestedSag=airSag+(waterSag-airSag)*wet;
  const sag=Math.min(Math.max(0,requestedSag),maxSag);
  const bow=16*fraction*fraction*(1-fraction)*(1-fraction);
  result.x=x;
  result.y=baseY-sag*bow;
  result.z=z;
  return result;
}

function signedSurfaceDistance(
  start:FishingLinePoint,
  end:FishingLinePoint,
  fraction:number,
  airSag:number,
  waterSag:number,
  surfaceHeight:(x:number,z:number)=>number,
  maxSag:number,
  point:MutableFishingLinePoint,
):number {
  setLinePoint(start,end,fraction,airSag,waterSag,surfaceHeight,maxSag,point);
  return point.y-surfaceHeight(point.x,point.z);
}

function findSurfaceCrossing(
  start:FishingLinePoint,
  end:FishingLinePoint,
  airSag:number,
  waterSag:number,
  surfaceHeight:(x:number,z:number)=>number,
  maxSag:number,
  startsUnderwater:boolean,
  startDelta:number,
  endDelta:number,
  point:MutableFishingLinePoint,
):number|null {
  let previous=0,previousDelta=startDelta;
  for(let sample=1;sample<=48;sample++){
    const fraction=sample/48;
    const delta=signedSurfaceDistance(start,end,fraction,airSag,waterSag,surfaceHeight,maxSag,point);
    const crosses=startsUnderwater?previousDelta<=0&&delta>0:previousDelta>0&&delta<=0;
    if(crosses){
      let low=previous,high=fraction;
      for(let step=0;step<14;step++){
        const middle=(low+high)*.5;
        const middleDelta=signedSurfaceDistance(start,end,middle,airSag,waterSag,surfaceHeight,maxSag,point);
        if(startsUnderwater ? middleDelta<=0 : middleDelta>0)low=middle;
        else high=middle;
      }
      return (low+high)*.5;
    }
    previous=fraction;
    previousDelta=delta;
  }
  // A float attachment can sit just above the moving surface; retain the
  // existing visual-contact behavior without inventing a short wet segment.
  if(!startsUnderwater&&endDelta>=0&&endDelta<.06)return 1;
  return null;
}

/**
 * Builds one continuous sagging leader, then samples that same curve into dry
 * and submerged buffers at its actual water crossing. Buffers are mutated in
 * place so the render loop does not allocate geometry data per frame.
 */
export function updateFishingLineBuffers(
  start:FishingLinePoint,
  end:FishingLinePoint,
  air:FishingLineBuffer,
  water:FishingLineBuffer,
  surfaceHeight:(x:number,z:number)=>number,
  airSag:number,
  waterSag:number,
  load:number,
  projectSubmergedPoint?:FishingLinePointProjector,
):FishingLineSplit {
  const point:MutableFishingLinePoint={x:0,y:0,z:0};
  const length=Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z);
  const maxSag=length*.12;
  const normalizedLoad=clamp(load);
  const startDelta=signedSurfaceDistance(start,end,0,airSag,waterSag,surfaceHeight,maxSag,point);
  const endDelta=signedSurfaceDistance(start,end,1,airSag,waterSag,surfaceHeight,maxSag,point);
  const startsUnderwater=startDelta<=0;
  const waterFraction=findSurfaceCrossing(
    start,end,airSag,waterSag,surfaceHeight,maxSag,startsUnderwater,startDelta,endDelta,point,
  );

  const airVisible=waterFraction===null?!startsUnderwater:startsUnderwater?waterFraction<.999:waterFraction>.001;
  const waterVisible=waterFraction===null?startsUnderwater:startsUnderwater?waterFraction>.001:waterFraction<.999;
  writeSharedCurve(
    air,water,start,end,airSag,waterSag,normalizedLoad,waterFraction,startsUnderwater,
    airVisible,waterVisible,surfaceHeight,maxSag,point,projectSubmergedPoint,
  );
  return {waterFraction,airVisible,waterVisible};
}

function writeSharedCurve(
  air:FishingLineBuffer,
  water:FishingLineBuffer,
  start:FishingLinePoint,
  end:FishingLinePoint,
  airSag:number,
  waterSag:number,
  load:number,
  surfaceFraction:number|null,
  startsUnderwater:boolean,
  airVisible:boolean,
  waterVisible:boolean,
  surfaceHeight:(x:number,z:number)=>number,
  maxSag:number,
  point:MutableFishingLinePoint,
  projectSubmergedPoint?:FishingLinePointProjector,
):void {
  const count=Math.min(
    Math.floor(air.positions.length/3),Math.floor(air.rgba.length/4),
    Math.floor(water.positions.length/3),Math.floor(water.rgba.length/4),
  );
  const last=count-1;
  const crossingIndex=surfaceFraction===null||surfaceFraction<=0||surfaceFraction>=1
    ? -1
    : Math.max(1,Math.min(last-1,Math.round(surfaceFraction*last)));
  const airAlpha=.48+.30*load,waterAlpha=.34+.14*load;
  const endpointDepth=Math.max(0,surfaceHeight(start.x,start.z)-start.y,surfaceHeight(end.x,end.z)-end.y);

  for(let index=0;index<count;index++){
    const q=last<=0?0:index/last;
    const fraction=crossingIndex<0
      ? q
      : index===crossingIndex
        ? surfaceFraction!
        : index<crossingIndex
          ? surfaceFraction!*index/crossingIndex
          : surfaceFraction!+(1-surfaceFraction!)*(index-crossingIndex)/(last-crossingIndex);
    setLinePoint(start,end,fraction,airSag,waterSag,surfaceHeight,maxSag,point);
    const physicalDepth=Math.max(0,surfaceHeight(point.x,point.z)-point.y);
    if(projectSubmergedPoint&&index!==crossingIndex)projectSubmergedPoint(point);
    const positionOffset=index*3,colorOffset=index*4;
    const blend=surfaceFraction===null?0:smoothstep(clamp((fraction-(surfaceFraction!-.025))/.05));
    const airWeight=surfaceFraction===null
      ? (startsUnderwater?0:1)
      : !airVisible?0:!waterVisible?1:startsUnderwater?blend:1-blend;
    const waterWeight=surfaceFraction===null
      ? (startsUnderwater?1:0)
      : !waterVisible?0:!airVisible?1:1-airWeight;
    const submergedProgress=surfaceFraction===null
      ? q
      : startsUnderwater
        ? clamp(fraction/Math.max(surfaceFraction!,1e-6))
        : clamp((fraction-surfaceFraction!)/Math.max(1-surfaceFraction!,1e-6));
    const depthFade=Math.exp(-Math.max(endpointDepth,physicalDepth)*submergedProgress*.12);
    const pointX=point.x,pointY=point.y,pointZ=point.z;
    air.positions[positionOffset]=pointX;
    air.positions[positionOffset+1]=pointY;
    air.positions[positionOffset+2]=pointZ;
    air.rgba[colorOffset]=1;air.rgba[colorOffset+1]=1;air.rgba[colorOffset+2]=1;
    air.rgba[colorOffset+3]=airWeight*airAlpha;
    water.positions[positionOffset]=pointX;
    water.positions[positionOffset+1]=pointY;
    water.positions[positionOffset+2]=pointZ;
    water.rgba[colorOffset]=1;water.rgba[colorOffset+1]=1;water.rgba[colorOffset+2]=1;
    water.rgba[colorOffset+3]=waterWeight*waterAlpha*depthFade*(1-.16*submergedProgress);
  }
}
