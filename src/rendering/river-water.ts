// @ts-nocheck -- texture construction at the vendored Three.js boundary.
import * as THREE from '../../vendor/three.module.js';

/** Periodic slope field: the two moving samples tile without a seam. */
export function createRiverNormalTexture(){
  const size=256,data=new Uint8Array(size*size*4),tau=Math.PI*2;
  // Spread energy across directions and wavelengths instead of making one
  // dominant sine wave read as regularly spaced grooves in the reflection.
  const waves=Array.from({length:24},(_,index)=>{
    const angle=index*2.399963229728653,frequency=2+index*.82;
    const kx=Math.round(Math.cos(angle)*frequency),kz=Math.round(Math.sin(angle)*frequency);
    return [kx,kz,.28/Math.sqrt(index+1),index*1.731];
  });
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let dx=0,dz=0;
    for(const [kx,kz,amplitude,phase] of waves){
      const slope=Math.cos(tau*(kx*x/size+kz*y/size)+phase)*amplitude/Math.hypot(kx,kz);
      dx+=slope*kx;dz+=slope*kz;
    }
    const length=Math.hypot(dx,1,dz),offset=(y*size+x)*4;
    data[offset]=Math.round((.5-dx/length*.5)*255);
    data[offset+1]=Math.round((.5-dz/length*.5)*255);
    data[offset+2]=Math.round((.5+1/length*.5)*255);data[offset+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

export const riverOpticsGLSL=`
vec3 riverSurfaceNormal(vec3 base,vec3 p,float lateral,float depthRatio,float distanceToEye){
  float detail=1.0-smoothstep(45.0,210.0,distanceToEye);
  float current=mix(1.0,0.42,smoothstep(0.65,1.0,depthRatio));
  vec2 riverPoint=riverChannelPoint(p.xz);
  vec2 stream=vec2(lateral,riverPoint.y-uTime*0.8);
  vec2 a=texture2D(uRiverNormal,stream*0.26).rg*2.0-1.0;
  vec2 b=texture2D(uRiverNormal,mat2(0.8,-0.6,0.6,0.8)*stream*0.67+vec2(uTime*0.013,0.0)).rg*2.0-1.0;
  vec2 slope=(a*0.12+b*0.052)*current*mix(0.23,1.0,detail);
  slope=riverSlopeToFishing(slope);
  return normalize(base+vec3(slope.x,0.0,slope.y));
}
vec3 riverTransmittedColor(vec3 p,vec3 incident,vec3 normal,float depthRatio){
  float pool=smoothstep(8.0,35.0,-riverChannelPoint(p.xz).y);
  float crossSection=pow(max(0.0,1.0-depthRatio*depthRatio),0.7);
  float depth=0.16+crossSection*mix(0.68,3.1,pool);
  vec3 underwaterRay=refract(incident,normal,0.7501875);
  vec2 bottom=p.xz+underwaterRay.xz*depth/max(0.3,-underwaterRay.y);
  vec3 bed=texture2D(uRiverBed,riverChannelPoint(bottom)*0.32).rgb;
  float cosAir=clamp(dot(-incident,normal),0.02,1.0);
  float cosWater=sqrt(1.0-(1.0-cosAir*cosAir)/(1.333*1.333));
  float path=depth*(1.0/cosWater+1.15);
  vec3 transmission=exp(-vec3(0.48,0.22,0.18)*path);
  vec3 scatter=vec3(0.014,0.049,0.036);
  return bed*0.9*transmission+scatter*(1.0-transmission);
}
`;
