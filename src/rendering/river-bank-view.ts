import { riverBankHeightAt, riverCenterAt, riverHalfWidthAt } from './river-channel.js';

// The fishing simulation keeps its existing angler-local coordinates. Place
// that angler on the left bank and turn the river around the same origin, so
// the cast, fish, rod, refraction and aim marker still share one coordinate space.
const shoreSetback=2.7,riverZ=7,yaw=65*Math.PI/180;
const riverX=riverCenterAt(riverZ)-riverHalfWidthAt(riverZ)-shoreSetback;
const cos=Math.cos(yaw),sin=Math.sin(yaw);
const groundY=riverBankHeightAt(-1,shoreSetback,riverZ);

export const RIVER_BANK_VIEW={
  riverX,riverZ,yaw,groundY,eyeY:groundY+1.65,fishingZ:7,
  terrainX:-cos*riverX-sin*riverZ,
  terrainZ:7+sin*riverX-cos*riverZ,
} as const;

export function riverPointForFishing(x:number,z:number):{x:number;z:number} {
  return {x:riverX+cos*x-sin*(z-7),z:riverZ+sin*x+cos*(z-7)};
}

export const riverBankViewGLSL=`
vec2 riverChannelPoint(vec2 fishingPoint){
  vec2 p=fishingPoint-vec2(0.0,7.0);
  return vec2(${riverX.toFixed(9)},${riverZ.toFixed(9)})+mat2(${cos.toFixed(9)},${sin.toFixed(9)},${(-sin).toFixed(9)},${cos.toFixed(9)})*p;
}
vec2 riverSlopeToFishing(vec2 slope){
  return mat2(${cos.toFixed(9)},${(-sin).toFixed(9)},${sin.toFixed(9)},${cos.toFixed(9)})*slope;
}
`;
