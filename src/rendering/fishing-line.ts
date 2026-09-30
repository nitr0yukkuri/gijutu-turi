export type FishingLinePoint = Readonly<{x:number;y:number;z:number}>;

export type FishingLineBuffer = Readonly<{
  positions:Float32Array;
  rgba:Float32Array;
}>;

export type FishingLineSplit = Readonly<{
  waterFraction:number|null;
  airVisible:boolean;
  waterVisible:boolean;
}>;

const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smoothstep=(value:number)=>value*value*(3-2*value);

function lineHeightAt(start:FishingLinePoint,end:FishingLinePoint,fraction:number):number {
  return start.y+(end.y-start.y)*fraction;
}

/**
 * Writes the line into separate dry and submerged buffers. Both parts share
 * the same computed surface contact, so there is no visual gap at the water.
 * Buffers are mutated in place to avoid allocating geometry data per frame.
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
):FishingLineSplit {
  const startDelta=start.y-surfaceHeight(start.x,start.z);
  const endDelta=end.y-surfaceHeight(end.x,end.z);
  const startsUnderwater=startDelta<=0;
  let waterFraction:number|null=null;

  if(startsUnderwater){
    if(endDelta<=0){
      writeCurve(water,start,end,0,1,waterSag,clamp(load),true,false,surfaceHeight);
      clearCurve(air,start);
      return {waterFraction:null,airVisible:false,waterVisible:true};
    }
    else{
      let previous=0,previousDelta=startDelta;
      for(let sample=1;sample<=48;sample++){
        const fraction=sample/48,x=start.x+(end.x-start.x)*fraction,z=start.z+(end.z-start.z)*fraction;
        const delta=lineHeightAt(start,end,fraction)-surfaceHeight(x,z);
        if(previousDelta<=0&&delta>0){
          let low=previous,high=fraction;
          for(let step=0;step<12;step++){
            const middle=(low+high)*.5,mx=start.x+(end.x-start.x)*middle,mz=start.z+(end.z-start.z)*middle;
            if(lineHeightAt(start,end,middle)-surfaceHeight(mx,mz)>0)high=middle;else low=middle;
          }
          waterFraction=high;break;
        }
        previous=fraction;previousDelta=delta;
      }
    }
  }else{
    let previous=0,previousDelta=startDelta;
    for(let sample=1;sample<=48;sample++){
      const fraction=sample/48,x=start.x+(end.x-start.x)*fraction,z=start.z+(end.z-start.z)*fraction;
      const delta=lineHeightAt(start,end,fraction)-surfaceHeight(x,z);
      if(previousDelta>0&&delta<=0){
        let low=previous,high=fraction;
        for(let step=0;step<12;step++){
          const middle=(low+high)*.5,mx=start.x+(end.x-start.x)*middle,mz=start.z+(end.z-start.z)*middle;
          if(lineHeightAt(start,end,middle)-surfaceHeight(mx,mz)>0)low=middle;else high=middle;
        }
        waterFraction=high;break;
      }
      previous=fraction;previousDelta=delta;
    }
    // A float attachment can sit a few centimetres above the moving surface.
    // Treat that endpoint as contact, but don't create a zero-length wet line.
    if(waterFraction===null&&endDelta>=0&&endDelta<.06)waterFraction=1;
  }

  const normalizedLoad=clamp(load);
  if(waterFraction===null){
    if(startsUnderwater){
      writeCurve(water,start,end,0,1,waterSag,normalizedLoad,true,false,surfaceHeight);
      clearCurve(air,start);
      return {waterFraction:null,airVisible:false,waterVisible:true};
    }
    writeCurve(air,start,end,0,1,airSag,normalizedLoad,false,false,surfaceHeight);
    clearCurve(water,start);
    return {waterFraction:null,airVisible:true,waterVisible:false};
  }

  const airVisible=startsUnderwater?waterFraction<.999:waterFraction>.001;
  const waterVisible=startsUnderwater?waterFraction>.001:waterFraction<.999;
  if(airVisible&&startsUnderwater)writeCurve(air,start,end,waterFraction,1,airSag,normalizedLoad,false,true,surfaceHeight);
  else if(airVisible)writeCurve(air,start,end,0,waterFraction,airSag,normalizedLoad,false,true,surfaceHeight);
  else clearCurve(air,start);
  if(waterVisible&&startsUnderwater)writeCurve(water,start,end,0,waterFraction,waterSag,normalizedLoad,true,true,surfaceHeight);
  else if(waterVisible)writeCurve(water,start,end,waterFraction,1,waterSag,normalizedLoad,true,true,surfaceHeight);
  else clearCurve(water,end);
  return {waterFraction,airVisible,waterVisible};
}

function writeCurve(
  buffer:FishingLineBuffer,
  start:FishingLinePoint,
  end:FishingLinePoint,
  from:number,
  to:number,
  requestedSag:number,
  load:number,
  submerged:boolean,
  fadesAtSurface:boolean,
  surfaceHeight:(x:number,z:number)=>number,
):void {
  const count=Math.min(Math.floor(buffer.positions.length/3),Math.floor(buffer.rgba.length/4));
  const span=to-from;
  const dx=(end.x-start.x)*span,dy=(end.y-start.y)*span,dz=(end.z-start.z)*span;
  const length=Math.hypot(dx,dy,dz);
  const sag=Math.min(Math.max(0,requestedSag),length*.12);
  const airAlpha=.48+.30*load,waterAlpha=.34+.14*load;
  const endpointDepth=submerged?Math.max(
    0,
    surfaceHeight(start.x,start.z)-start.y,
    surfaceHeight(end.x,end.z)-end.y,
  ):0;

  for(let index=0;index<count;index++){
    const q=count<=1?0:index/(count-1),fraction=from+span*q;
    const x=start.x+(end.x-start.x)*fraction;
    const z=start.z+(end.z-start.z)*fraction;
    const bow=16*q*q*(1-q)*(1-q);
    const y=start.y+(end.y-start.y)*fraction-sag*bow;
    const positionOffset=index*3,colorOffset=index*4;
    buffer.positions[positionOffset]=x;
    buffer.positions[positionOffset+1]=y;
    buffer.positions[positionOffset+2]=z;
    buffer.rgba[colorOffset]=1;
    buffer.rgba[colorOffset+1]=1;
    buffer.rgba[colorOffset+2]=1;
    if(submerged){
      const depthFade=Math.exp(-endpointDepth*q*.12);
      buffer.rgba[colorOffset+3]=waterAlpha*depthFade*(1-.16*q);
    }else{
      const surfaceFade=fadesAtSurface?smoothstep(clamp((q-.72)/.28))*.24:0;
      buffer.rgba[colorOffset+3]=airAlpha*(1-surfaceFade);
    }
  }
}

function clearCurve(buffer:FishingLineBuffer,point:FishingLinePoint):void {
  const count=Math.min(Math.floor(buffer.positions.length/3),Math.floor(buffer.rgba.length/4));
  for(let index=0;index<count;index++){
    const positionOffset=index*3,colorOffset=index*4;
    buffer.positions[positionOffset]=point.x;
    buffer.positions[positionOffset+1]=point.y;
    buffer.positions[positionOffset+2]=point.z;
    buffer.rgba[colorOffset]=1;
    buffer.rgba[colorOffset+1]=1;
    buffer.rgba[colorOffset+2]=1;
    buffer.rgba[colorOffset+3]=0;
  }
}
