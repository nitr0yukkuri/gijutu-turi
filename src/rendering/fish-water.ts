// @ts-nocheck -- shared GLSL and the vendored Three.js material boundary.
// Surface shape is shared with the sea, including the same six impact ripples.
export const waterHeightGLSL = `
float heightAt(vec2 p) {
  float h=0.0;
  float freq=0.42, amp=0.13, angle=0.3;
  for(int i=0;i<7;i++) {
    vec2 d=vec2(cos(angle),sin(angle));
    h+=sin(dot(p,d)*freq+uTime*(0.42+float(i)*0.14))*amp;
    freq*=1.83; amp*=0.40; angle+=2.39996323;
  }
  for(int i=0;i<6;i++) {
    float age=uTime-uRipples[i].z;
    if(age>0.0 && age<8.0) {
      float d=length(p-uRipples[i].xy), r=d-age*1.25;
      h+=sin(r*11.0)*exp(-r*r*1.6)*exp(-age*0.55)*0.08*uRipples[i].w;
    }
  }
  return h;
}`;

const surface = `
uniform float uTime;
uniform vec4 uRipples[6];
varying vec3 vFishWorld;
${waterHeightGLSL}
`;

// Art-directed coherent refraction, not a full refracted-ray renderer. The
// grazing-angle floor deliberately preserves Go's body/tail silhouette. Wave
// facets mask the radiance below; they must never deform the animal like cloth.
export function fishApparentPoint(world,center,eye) {
  const depth=Math.max(0,-center.y);
  let apparentY=center.y;
  for(let i=0;i<3;i++){
    const cosAir=Math.max(.001,(eye.y-apparentY)/Math.hypot(eye.x-center.x,eye.y-apparentY,eye.z-center.z));
    const cosWater=Math.sqrt(1-(1-cosAir*cosAir)/(1.333*1.333));
    apparentY=-depth*Math.max(.55,cosAir/(1.333*cosWater));
  }
  const wet=Math.max(0,Math.min(1,-world.y/.25)),mix=wet*wet*(3-2*wet);
  return {x:world.x,y:world.y+(apparentY+(world.y-center.y)*.72-world.y)*mix,z:world.z};
}

const refraction = `
uniform vec3 uFishCenter;
vec4 fishWaterProjection(vec3 localPosition) {
  vec3 world=(modelMatrix*vec4(localPosition,1.0)).xyz;
  vFishWorld=world;
  if(world.y>=0.0)return projectionMatrix*viewMatrix*vec4(world,1.0);
  float depth=max(0.0,-uFishCenter.y);
  float apparentY=uFishCenter.y;
  for(int i=0;i<3;i++) {
    float cosAir=clamp(normalize(cameraPosition-vec3(uFishCenter.x,apparentY,uFishCenter.z)).y,0.001,1.0);
    float cosWater=sqrt(1.0-(1.0-cosAir*cosAir)/(1.333*1.333));
    apparentY=-depth*max(.55,cosAir/(1.333*cosWater));
  }
  vec3 apparent=world;
  apparent.y=mix(world.y,apparentY+(world.y-uFishCenter.y)*.72,smoothstep(0.0,.25,-world.y));
  return projectionMatrix*viewMatrix*vec4(apparent,1.0);
}`;

// Perceptual coverage, deliberately distinct from direct-light extinction.
// A minimum at normal fight depth lets the actual anatomy interrupt the water
// background; depth/range still erase it in deep/distant water. This is an
// artistic readability budget, not a measured scattering coefficient.
const presence={floor:.30,surface:.32,clearDepth:2.4,falloff:.35,near:34,far:72,rangeLoss:.82,fin:.85,light:.30,detail:.18};
export function fishWaterCoverage(depth,distance,transmission,part='body') {
  const d=Math.max(0,Math.min(1,(distance-presence.near)/(presence.far-presence.near)));
  return (presence.floor+presence.surface*Math.max(0,Math.min(1,transmission)))
    *Math.exp(-Math.max(0,depth-presence.clearDepth)*presence.falloff)
    *(1-d*d*(3-2*d)*presence.rangeLoss)*({body:1,fin:presence.fin,light:presence.light,detail:presence.detail,line:0}[part]??1);
}

const optics = `
uniform sampler2D uWaterBackdrop;
uniform vec2 uWaterSize;
uniform mat4 uCamera;
uniform mat4 uProjectionInverse;
uniform float uWaterPart;
uniform float uFishVisibility;
vec3 throughWater(vec3 fishColor) {
  float depth=max(0.0,heightAt(vFishWorld.xz)-vFishWorld.y);
  float submerged=smoothstep(0.0,.12,depth);
  if(submerged<=0.0)return fishColor;
  vec2 screenUv=gl_FragCoord.xy/uWaterSize;
  vec4 local=uProjectionInverse*vec4(screenUv*2.0-1.0,1.0,1.0);
  vec3 rd=normalize((uCamera*vec4(normalize(local.xyz/local.w),0.0)).xyz);
  vec3 ro=uCamera[3].xyz;
  float t=-ro.y/min(rd.y,-.0004);
  for(int i=0;i<4;i++)t=(heightAt((ro+rd*t).xz)-ro.y)/min(rd.y,-.0004);
  vec3 p=ro+rd*t;
  float eps=.035+min(t,180.0)*.001;
  vec3 n=normalize(vec3(heightAt(p.xz-vec2(eps,0.0))-heightAt(p.xz+vec2(eps,0.0)),2.0*eps,
                        heightAt(p.xz-vec2(0.0,eps))-heightAt(p.xz+vec2(0.0,eps))));
  float cosAir=clamp(dot(-rd,n),0.0,1.0);
  float cosWater=sqrt(1.0-(1.0-cosAir*cosAir)/(1.333*1.333));
  // Fresnel reflectance (unpolarized), not a fixed opacity on the whole fish.
  float rs=(cosAir-1.333*cosWater)/(cosAir+1.333*cosWater);
  float rp=(1.333*cosAir-cosWater)/(1.333*cosAir+cosWater);
  float transmission=1.0-.5*(rs*rs+rp*rp);
  float path=depth/max(.25,cosWater);
  // Separate direct extinction from the existing water background. These
  // per-world-unit coefficients are a visual water preset, not measured data.
  vec3 extinction=exp(-vec3(.58,.22,.17)*path);
  float haze=1.0-exp(-max(t,0.0)*.006);
  float vignette=1.0-smoothstep(.3,.95,length((screenUv-.5)*vec2(.75,1.0)))*.18;
  vec3 background=texture2D(uWaterBackdrop,screenUv).rgb;
  // Preserve a readable, anatomical mass, not just its emissive dots. Previously
  // subtracting only a dim ambient-water term left almost the entire reflected
  // background untouched and the fish vanished. Keep some wave texture over
  // the body, but give the solid mesh its own bounded contrast contribution.
  float rangeVisibility=1.0-smoothstep(${presence.near.toFixed(1)},${presence.far.toFixed(1)},max(t,0.0))*${presence.rangeLoss};
  float depthVisibility=exp(-max(0.0,depth-${presence.clearDepth})*${presence.falloff});
  float partCoverage=uWaterPart<.5?1.0:uWaterPart<1.5?${presence.fin}:uWaterPart<2.5?${presence.light}:uWaterPart<3.5?${presence.detail}:0.0;
  float coverage=(${presence.floor}+${presence.surface}*transmission)*depthVisibility*rangeVisibility*partCoverage;
  // Give the hooked body a little more direct radiance than the approach
  // shadow. At normal desktop/mobile render sizes the silhouette must survive
  // the water blend instead of disappearing into the sea color.
  float fightReadability=smoothstep(.55,.95,uFishVisibility);
  float lightScale=uWaterPart<.5?mix(.22,.36,fightReadability):uWaterPart<1.5?.28:uWaterPart<2.5?.64:uWaterPart<3.5?.14:.6;
  vec3 underwater=background*(1.0-coverage)+transmission*extinction*(1.0-haze*.97)*vignette*fishColor*lightScale;
  return mix(background,mix(fishColor,underwater,submerged),uFishVisibility);
}`;

// Opt-in: catalog/viewer materials and the sky/sea palette are untouched.
export function applyFishWater(material, waterUniforms, part='detail') {
  const compile=material.onBeforeCompile;
  const cacheKey=material.customProgramCacheKey();
  const originallyToneMapped=material.toneMapped;
  material.onBeforeCompile=shader=>{
    compile.call(material,shader);
    Object.assign(shader.uniforms,waterUniforms);
    shader.uniforms.uWaterPart={value:{body:0,fin:1,light:2,detail:3,line:4}[part]};
    shader.vertexShader=surface+refraction+'\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\ngl_Position=fishWaterProjection(transformed);');
    // Fins have a custom shader; other parts use Three's project chunk.
    shader.vertexShader=shader.vertexShader.replace('gl_Position=projectionMatrix*mv;',
      'gl_Position=fishWaterProjection(p);');
    shader.fragmentShader=surface+optics+'\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',
      `gl_FragColor.rgb=throughWater(gl_FragColor.rgb);
      ${originallyToneMapped?'':'vec3 fishBeforeTone=gl_FragColor.rgb;'}
      #include <tonemapping_fragment>
      ${originallyToneMapped?'':'gl_FragColor.rgb=mix(fishBeforeTone,gl_FragColor.rgb,smoothstep(0.0,.12,heightAt(vFishWorld.xz)-vFishWorld.y));'}`);
  };
  material.customProgramCacheKey=()=>cacheKey+'-underwater-v3-'+part;
  material.toneMapped=true;
}
