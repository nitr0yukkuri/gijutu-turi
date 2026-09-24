// @ts-nocheck -- the renderer is an imperative WebGL boundary around the vendored Three.js runtime.
import * as THREE from '../../vendor/three.module.js';
import { createGoFish } from './go-fish.js';
import { waterHeightGLSL } from './fish-water.js';
import { fishFightCues } from './fish-fight-cues.js';
import { fishVisibilityTarget, WAIT_APPROACH_FRACTION } from '../fish-approach.js';
import { ESCAPE_ANIMATION_MS } from '../ocean-game.js';

// Preserve the dorsal-up axis when heading crosses +X. A shortest-arc
// rotation from -X alone can roll a pitched fish onto its back at that turn.
export function fishOrientation(direction) {
  const forward=new THREE.Vector3(direction.x,direction.y,direction.z);
  if(forward.lengthSq()<.0001)forward.set(-1,0,0);else forward.normalize();
  const x=forward.negate(),z=new THREE.Vector3().crossVectors(x,new THREE.Vector3(0,1,0));
  if(z.lengthSq()<.0001)z.set(0,0,1);else z.normalize();
  const y=new THREE.Vector3().crossVectors(z,x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}

// The ocean is ray/height-field intersected in world space. All tackle uses
// the same perspective camera; there is no cut to an underwater scene.
const waterShader = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform mat4 uCamera;
uniform mat4 uProjectionInverse;
uniform vec4 uRipples[6];
uniform vec2 uResolution;

float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
${waterHeightGLSL}
vec3 sky(vec3 d,float cloudWeight) {
  float elevation=max(d.y,0.0);
  vec3 horizon=vec3(0.36,0.46,0.49);
  vec3 zenith=vec3(0.04,0.09,0.16);
  vec3 c=mix(horizon,zenith,pow(clamp(elevation*2.6,0.0,1.0),0.55));
  vec3 sun=normalize(vec3(-0.42,0.065,-1.0));
  float alignment=max(dot(d,sun),0.0);
  c+=vec3(0.28,0.15,0.075)*pow(alignment,25.0);
  c+=vec3(1.0,0.71,0.40)*pow(alignment,17000.0)*0.85;
  // Delicate, stretched cloud bands; the horizon stays quiet.
  vec2 cp=d.xz/(max(d.y,0.02)+0.16);
  float cloud=noise(cp*vec2(1.6,8.0)+vec2(uTime*0.002,0.0));
  cloud=clamp((cloud-0.5)*1.8,0.0,0.3)*smoothstep(0.0,0.16,elevation);
  return c+vec3(0.045,0.05,0.05)*cloud*cloudWeight;
}
void main(){
  vec4 local=uProjectionInverse*vec4(vUv*2.0-1.0,1.0,1.0);
  vec3 rd=normalize((uCamera*vec4(normalize(local.xyz/local.w),0.0)).xyz);
  vec3 ro=uCamera[3].xyz;
  vec3 color=sky(rd,1.0);
  if(rd.y < -0.0004) {
    float t=-ro.y/rd.y;
    for(int i=0;i<4;i++) t=(heightAt((ro+rd*t).xz)-ro.y)/rd.y;
    vec3 p=ro+rd*t;
    float eps=0.035+min(t,180.0)*0.001;
    float hx=heightAt(p.xz+vec2(eps,0))-heightAt(p.xz-vec2(eps,0));
    float hz=heightAt(p.xz+vec2(0,eps))-heightAt(p.xz-vec2(0,eps));
    vec3 n=normalize(vec3(-hx,eps*2.0,-hz));
    // Keep the calm-sea displacement, but avoid turning its fine facets into
    // long, aliased reflection streaks at the fishing camera's low angle.
    n=normalize(mix(n,vec3(0.0,1.0,0.0),0.52));
    float fine=(noise(p.xz*4.5+uTime*0.07)-0.5)*0.035;
    n=normalize(n+vec3(fine,0.0,fine*0.8));
    n=normalize(mix(n,vec3(0.0,1.0,0.0),smoothstep(90.0,450.0,t)));
    vec3 reflected=reflect(rd,n);
    float fresnel=0.035+0.965*pow(1.0-max(dot(-rd,n),0.0),4.5);
    vec3 water=vec3(0.014,0.071,0.094)+vec3(0.012,0.03,0.032)*(n.y*0.5+0.5);
    // The sky's stretched cloud bands look like repeated stripes when mirrored
    // into the shallow-angle sea. Keep the clouds in the sky, but soften their
    // reflected detail and overall mirror contrast on the water.
    color=mix(water,sky(reflected,0.12),fresnel*0.72);
    vec3 sun=normalize(vec3(-0.42,0.065,-1.0));
    float glint=pow(max(dot(reflected,sun),0.0),260.0);
    color+=vec3(0.82,0.67,0.44)*glint*0.66;
    float broad=pow(max(dot(reflected,sun),0.0),18.0);
    color+=vec3(0.017,0.023,0.023)*broad;
    for(int i=0;i<6;i++) {
      float age=uTime-uRipples[i].z;
      if(age>0.0 && age<6.0) {
        float d=length(p.xz-uRipples[i].xy);
        float ring=exp(-pow((d-age*1.25)*13.0,2.0));
        color+=vec3(0.3,0.48,0.48)*ring*exp(-age*0.9)*uRipples[i].w;
      }
    }
    float haze=1.0-exp(-t*0.006);
    color=mix(color,sky(vec3(rd.x,0.0,rd.z),0.12),haze*0.97);
  }
  float vignette=1.0-smoothstep(0.3,0.95,length((vUv-0.5)*vec2(0.75,1.0)))*0.18;
  color*=vignette;
  color+=(hash(gl_FragCoord.xy)-0.5)*0.0018;
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createOcean(mount, { onLand=()=>{}, onRenderError=()=>{} }={}) {
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.autoClear=false;
  mount.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();onRenderError();});

  const camera=new THREE.PerspectiveCamera(46,1,0.1,2400);
  let portraitBlend=0;
  const scene=new THREE.Scene();
  const backgroundScene=new THREE.Scene();
  const screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const ripples=Array.from({length:6},()=>new THREE.Vector4(0,0,-100,0));
  const uniforms={uTime:{value:0},uCamera:{value:camera.matrixWorld},uProjectionInverse:{value:camera.projectionMatrixInverse},uRipples:{value:ripples},uResolution:{value:new THREE.Vector2()}};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:waterShader});
  const waterQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);backgroundScene.add(waterQuad);
  const waterBackdrop=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  const waterBackdropScale=.75;
  const waterUniforms={...uniforms,uWaterBackdrop:{value:waterBackdrop.texture},uWaterSize:{value:new THREE.Vector2()}};
  const waterCopy=new THREE.ShaderMaterial({
    uniforms:{uBackdrop:{value:waterBackdrop.texture}},depthTest:false,depthWrite:false,
    vertexShader:material.vertexShader,
    fragmentShader:'uniform sampler2D uBackdrop; varying vec2 vUv; void main(){gl_FragColor=texture2D(uBackdrop,vUv);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  scene.add(new THREE.HemisphereLight(0xe4edef,0x23414d,2.3));
  const light=new THREE.DirectionalLight(0xffdfad,2);light.position.set(-10,12,-20);scene.add(light);

  const bobber=new THREE.Group();
  const buoy=new THREE.Mesh(new THREE.SphereGeometry(.075,14,12),new THREE.MeshStandardMaterial({color:0xd27e55,roughness:.35}));
  buoy.scale.y=1.6;bobber.add(buoy);
  const tip=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.22,8),new THREE.MeshStandardMaterial({color:0xf5e9cf,roughness:.5}));tip.position.y=.13;bobber.add(tip);
  bobber.visible=false;scene.add(bobber);
  const threadGeometry=new THREE.BufferGeometry();threadGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(49*3),3));
  const thread=new THREE.Line(threadGeometry,new THREE.LineBasicMaterial({color:0xe8f3ef,transparent:true,opacity:.72}));thread.frustumCulled=false;thread.renderOrder=5;thread.visible=false;scene.add(thread);
  // A rod is not a single dark line: the blank tapers toward the tip, guides
  // sit on the load-bearing side, and a spinning reel hangs below the seat.
  // Keeping the parts in one assembly lets the whole tackle disappear between
  // casts without leaving the guide meshes behind in the background.
  const rodPointCount=34,rodRadialCount=8;
  const rodGeometry=new THREE.BufferGeometry();
  rodGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rodPointCount*rodRadialCount*3),3));
  // The centerline and tube vertices are mutated every frame while casting or
  // fighting. Keep the GPU buffer alive instead of rebuilding TubeGeometry.
  rodGeometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
  const rodColors=new Float32Array(rodPointCount*rodRadialCount*3);
  const rodIndices=[];
  for(let i=0;i<rodPointCount-1;i++)for(let j=0;j<rodRadialCount;j++){
    const next=(j+1)%rodRadialCount,a=i*rodRadialCount+j,b=i*rodRadialCount+next,c=(i+1)*rodRadialCount+j,d=(i+1)*rodRadialCount+next;
    rodIndices.push(a,c,b,b,c,d);
  }
  rodGeometry.setIndex(rodIndices);
  const blankColor=new THREE.Color(0x2b5a61),buttColor=new THREE.Color(0x173b43),highlightColor=new THREE.Color(0x91c7c7);
  for(let i=0;i<rodPointCount;i++)for(let j=0;j<rodRadialCount;j++){
    const p=i/(rodPointCount-1),c=blankColor.clone().lerp(buttColor,Math.max(0,(.18-p)*2.2));
    if(j===0||j===rodRadialCount-1)c.lerp(highlightColor,.22);
    const offset=(i*rodRadialCount+j)*3;rodColors[offset]=c.r;rodColors[offset+1]=c.g;rodColors[offset+2]=c.b;
  }
  rodGeometry.setAttribute('color',new THREE.BufferAttribute(rodColors,3));
  const rod=new THREE.Mesh(rodGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.25,metalness:.3,emissive:0x0b2228,emissiveIntensity:.42,side:THREE.DoubleSide}));
  rod.frustumCulled=false;rod.visible=false;
  const rodSheenGeometry=new THREE.BufferGeometry();rodSheenGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rodPointCount*3),3));
  rodSheenGeometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
  const rodSheen=new THREE.Line(rodSheenGeometry,new THREE.LineBasicMaterial({color:0xb9e4e1,transparent:true,opacity:.47}));rodSheen.frustumCulled=false;
  const rodAssembly=new THREE.Group();rodAssembly.visible=false;rodAssembly.add(rod,rodSheen);scene.add(rodAssembly);
  const rodCenters=Array.from({length:rodPointCount},()=>new THREE.Vector3());
  const rodTangent=new THREE.Vector3(),rodView=new THREE.Vector3(),rodNormal=new THREE.Vector3(),rodBinormal=new THREE.Vector3();
  const rodGuideDown=new THREE.Vector3(),rodGuideSide=new THREE.Vector3(),rodGuideTangent=new THREE.Vector3(),rodGuidePoint=new THREE.Vector3(),rodLineAnchor=new THREE.Vector3(),rodGuideMatrix=new THREE.Matrix4();
  const rodAxisY=new THREE.Vector3(0,1,0),rodAxisZ=new THREE.Vector3(0,0,1),rodAxisDown=new THREE.Vector3(0,-1,0);
  const guideMaterial=new THREE.MeshStandardMaterial({color:0xb5c9c9,metalness:.82,roughness:.2});
  const wrapMaterial=new THREE.MeshStandardMaterial({color:0x73a9a8,metalness:.36,roughness:.3});
  const guideEntries=[.08,.17,.27,.38,.49,.60,.70,.79,.87,.94,.99].map((fraction,index)=>{
    const root=new THREE.Group(),radius=.034+(1-fraction)*.105,offset=radius*.62;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.0045,6,18),guideMaterial);
    const foot=new THREE.Mesh(new THREE.CylinderGeometry(.0045,.0045,.065,6),guideMaterial);
    const wrap=new THREE.Mesh(new THREE.TorusGeometry(.026+(1-fraction)*.052,.004,5,14),wrapMaterial);
    ring.position.y=offset;foot.position.y=offset*.5;foot.scale.y=offset/.065;root.add(ring,foot,wrap);rodAssembly.add(root);
    return {fraction,root,ring,foot,wrap,offset};
  });
  const gripMaterial=new THREE.MeshStandardMaterial({color:0x4f3b2d,roughness:.82,metalness:.03});
  const seatMaterial=new THREE.MeshStandardMaterial({color:0x1b262b,roughness:.3,metalness:.7});
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.72,14),gripMaterial);handle.frustumCulled=false;rodAssembly.add(handle);
  const buttCap=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.075,14),new THREE.MeshStandardMaterial({color:0x19272b,roughness:.5,metalness:.35}));buttCap.frustumCulled=false;rodAssembly.add(buttCap);
  const reelSeat=new THREE.Mesh(new THREE.CylinderGeometry(.105,.11,.34,12),seatMaterial);reelSeat.frustumCulled=false;rodAssembly.add(reelSeat);
  const reelGroup=new THREE.Group();reelGroup.frustumCulled=false;rodAssembly.add(reelGroup);
  const reelBody=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshStandardMaterial({color:0x253d43,roughness:.26,metalness:.72}));reelBody.scale.set(.16,.21,.18);reelGroup.add(reelBody);
  const reelSpool=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.13,18),new THREE.MeshStandardMaterial({color:0xb7c8c5,roughness:.22,metalness:.84}));reelSpool.rotation.z=Math.PI/2;reelGroup.add(reelSpool);
  const reelLip=new THREE.Mesh(new THREE.TorusGeometry(.112,.012,6,20),new THREE.MeshStandardMaterial({color:0xd5e1dc,roughness:.2,metalness:.9}));reelLip.rotation.y=Math.PI/2;reelGroup.add(reelLip);
  const reelBail=new THREE.Mesh(new THREE.TorusGeometry(.145,.009,6,26,Math.PI*1.7),new THREE.MeshStandardMaterial({color:0xd7e3df,roughness:.18,metalness:.92}));reelBail.rotation.y=Math.PI/2;reelBail.position.z=-.02;reelGroup.add(reelBail);
  const reelArm=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.23,8),seatMaterial);reelArm.rotation.z=Math.PI/2;reelArm.position.set(.19,.02,.04);reelGroup.add(reelArm);
  const reelKnob=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),new THREE.MeshStandardMaterial({color:0x92b5b3,roughness:.35,metalness:.6}));reelKnob.position.set(.31,.02,.04);reelGroup.add(reelKnob);
  const handlePoint=new THREE.Vector3(),handleEnd=new THREE.Vector3(),handleTangent=new THREE.Vector3(),handleEndTangent=new THREE.Vector3(),reelPoint=new THREE.Vector3(),reelTangent=new THREE.Vector3(),reelDown=new THREE.Vector3(),reelSide=new THREE.Vector3();
  const dropletGeo=new THREE.BufferGeometry();const drops=new Float32Array(36*3);dropletGeo.setAttribute('position',new THREE.BufferAttribute(drops,3));
  const spray=new THREE.Points(dropletGeo,new THREE.PointsMaterial({color:0xd9efed,size:.045,transparent:true,opacity:.85,depthWrite:false}));spray.visible=false;spray.frustumCulled=false;scene.add(spray);
  const dropSpeeds=Array.from({length:36},(_,i)=>{const a=i*2.399;return new THREE.Vector3(Math.cos(a)*(.5+(i%5)*.16),.75+(i%7)*.21,Math.sin(a)*(.5+(i%5)*.16));});
  // A submerged animal, not a luminous overlay on top of the sea.
  const fightFish=createGoFish({detail:'high',phase:.7,waterUniforms});
  fightFish.group.visible=false;fightFish.group.renderOrder=4;
  fightFish.group.traverse(object=>{object.renderOrder=4;});
  scene.add(fightFish.group);
  // The submerged line ends at the same undeformed nose anchor as the model.
  const mouth=new THREE.Vector3(),lineEntry=new THREE.Vector3(),curvePoint=new THREE.Vector3();
  const schoolFish=Array.from({length:6},(_,index)=>{
    const model=createGoFish({detail:'low',phase:index*.87,waterUniforms});
    model.group.visible=false;model.group.renderOrder=3;scene.add(model.group);return model;
  });
  const schoolMotion=Array.from({length:6},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),initialized:false}));
  const schoolOffsets=[
    new THREE.Vector3(-.68,.04,1.12),new THREE.Vector3(.76,-.02,.78),
    new THREE.Vector3(-.98,-.08,.18),new THREE.Vector3(.94,.09,.08),
    new THREE.Vector3(-.46,.12,-.92),new THREE.Vector3(.58,-.11,-1.04),
  ];
  let schoolWasVisible=false,schoolAmount=0;
  const catchLight=new THREE.DirectionalLight(0x8be1ff,1.8);catchLight.position.set(-3,7,4);scene.add(catchLight);
  const wakes=Array.from({length:7},()=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(27*3),3));
    const wake=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xa2d7db,transparent:true,opacity:.58}));wake.frustumCulled=false;wake.visible=false;scene.add(wake);return wake;
  });

  const start=new THREE.Vector3(.85,1.8,4.8),target=new THREE.Vector3(0,0,-21),rodButt=new THREE.Vector3(1.75,-.7,5.9),rodTip=new THREE.Vector3(.95,1.15,2.75);
  let state={phase:'idle',castAt:0,strength:.65,aim:0,revision:0};
  let time=0,lastFrame=0,lastRenderedFrame=0,overlayOpen=false,landedRevision=-1,splashAt=-100,rippleIndex=0,charge=0,chargeAim=0,lastWake=0,lastStroke=0;
  let serverOffset=0,cameraProgress=0,frame,fishSamples=[],catchOrigin=null,displayedWave=null,displayedGlow=.65,displayedSwim=null,displayedLoad=0,displayedFishVisibility=0;
  const copyFish=(fish,tension=fish?.tension??0)=>fish?{
    position:{...fish.position},velocity:{...fish.velocity},heading:{...fish.heading},speed:fish.speed,gait:fish.gait,
    bodyWave:{...fish.bodyWave},swim:fish.swim?{...fish.swim,velocity:{...fish.swim.velocity}}:null,tension
  }:null;
  const lerpValue=(a,b,t)=>a+(b-a)*t;
  const lerpAngle=(a,b,t)=>{
    const delta=Math.atan2(Math.sin(b-a),Math.cos(b-a));
    return a+delta*t;
  };
  const interpolateFish=(a,b,t)=>a&&b?{
    position:{x:lerpValue(a.position.x,b.position.x,t),y:lerpValue(a.position.y,b.position.y,t),z:lerpValue(a.position.z,b.position.z,t)},
    velocity:{x:lerpValue(a.velocity.x,b.velocity.x,t),y:lerpValue(a.velocity.y,b.velocity.y,t),z:lerpValue(a.velocity.z,b.velocity.z,t)},
    heading:{x:lerpValue(a.heading.x,b.heading.x,t),y:lerpValue(a.heading.y,b.heading.y,t),z:lerpValue(a.heading.z,b.heading.z,t)},
    speed:lerpValue(a.speed,b.speed,t),gait:t<.5?a.gait:b.gait,tension:lerpValue(a.tension,b.tension,t),
    bodyWave:{phase:lerpAngle(a.bodyWave.phase,b.bodyWave.phase,t),amplitude:lerpValue(a.bodyWave.amplitude,b.bodyWave.amplitude,t),frequency:lerpValue(a.bodyWave.frequency,b.bodyWave.frequency,t),wavelength:lerpValue(a.bodyWave.wavelength,b.bodyWave.wavelength,t)},
    swim:a.swim&&b.swim?{effort:lerpValue(a.swim.effort,b.swim.effort,t),turn:lerpValue(a.swim.turn,b.swim.turn,t),velocity:{x:lerpValue(a.swim.velocity.x,b.swim.velocity.x,t),y:lerpValue(a.swim.velocity.y,b.swim.velocity.y,t),z:lerpValue(a.swim.velocity.z,b.swim.velocity.z,t)}}:(a.swim||b.swim)
  }:copyFish(a||b);
  const waveHeight=(x,z,t)=>{
    let h=0,f=.42,a=.13,angle=.3;
    for(let i=0;i<7;i++){h+=Math.sin((x*Math.cos(angle)+z*Math.sin(angle))*f+t*(.42+i*.14))*a;f*=1.83;a*=.40;angle+=2.39996323;}
    return h;
  };
  const fishWorldPosition=fish=>new THREE.Vector3(fish.position.x,fish.position.y,fish.position.z);
  const renderFishSnapshot=()=>{
    // The authoritative snapshot is immutable after setState. Reusing it in
    // the idle loop avoids allocating nested fish objects on every frame.
    if(!fishSamples.length)return state.fish||null;
    const targetServerTime=Date.now()+serverOffset-100;
    while(fishSamples.length>2&&fishSamples[1].serverTime<=targetServerTime)fishSamples.shift();
    if(fishSamples.length===1)return fishSamples[0].fish;
    const first=fishSamples[0],second=fishSamples[1];
    if(targetServerTime<=first.serverTime)return first.fish;
    if(targetServerTime>=second.serverTime)return second.fish;
    return interpolateFish(first.fish,second.fish,(targetServerTime-first.serverTime)/Math.max(1,second.serverTime-first.serverTime));
  };
  const addRipple=(x,z,power=1)=>{ripples[rippleIndex++%6].set(x,z,time,power);};
  const setState=(next,serverNow)=>{
    if(Number.isFinite(serverNow)) serverOffset=serverNow-Date.now();
    const previousPhase=state.phase,changed=next.revision!==state.revision;
    if(changed){fishSamples=[];schoolAmount=0;schoolWasVisible=false;for(const motion of schoolMotion)motion.initialized=false;}
    if(next.fish){
      // Tackle load is sampled/interpolated at the same time as the fish pose.
      fishSamples.push({serverTime:Number.isFinite(serverNow)?serverNow:Date.now()+serverOffset,fish:copyFish(next.fish,next.tension)});
      if(fishSamples.length>16)fishSamples.shift();
    }
    state={...next};
    target.set(next.aim*7,0,-(12+next.strength*23));
    if(['fighting','caught'].includes(next.phase)&&next.fish)target.set(next.fish.position.x,0,next.fish.position.z);
    else if(['fighting','caught'].includes(next.phase))target.set(next.aim*7+(next.fishX||0),0,-next.distance);
    if(next.phase==='caught'&&previousPhase!=='caught'&&next.fish){
      const fish=copyFish(next.fish),heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      catchOrigin={
        position:fightFish.group.visible?fightFish.group.position.clone():fishWorldPosition(fish),
        quaternion:fightFish.group.visible?fightFish.group.quaternion.clone():fishOrientation(heading),
        scale:fightFish.group.visible?fightFish.group.scale.x:.66,
        wave:{...(displayedWave||fish.bodyWave)},swim:displayedSwim,glow:displayedGlow,load:displayedLoad,at:performance.now(),
      };
    }
    if(next.phase==='idle'&&previousPhase!=='idle')catchOrigin=null;
    if(changed&&next.phase==='idle'){bobber.visible=false;thread.visible=false;}
    if(next.phase==='waiting' && landedRevision!==next.revision && Date.now()+serverOffset-next.castAt>2000) landedRevision=next.revision;
  };
  const land=()=>{
    if(landedRevision===state.revision)return;
    landedRevision=state.revision;splashAt=time;addRipple(target.x,target.z,1);onLand();
  };
  const setCharge=(amount,aim=0)=>{charge=amount;chargeAim=aim;};
  const aimScreen=(aim=0,strength=.65)=>{
    const projected=new THREE.Vector3(aim*7,0,-(12+strength*23)).project(camera);
    return {x:(projected.x*.5+.5)*mount.clientWidth,y:(-.5*projected.y+.5)*mount.clientHeight};
  };
  const resize=()=>{
    const width=mount.clientWidth,height=mount.clientHeight;if(!width||!height)return;
    renderer.setSize(width,height,false);uniforms.uResolution.value.set(width,height);camera.aspect=width/height;
    portraitBlend=THREE.MathUtils.clamp((.85-camera.aspect)/.4,0,1);
    camera.fov=THREE.MathUtils.lerp(46,64,portraitBlend);camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(waterUniforms.uWaterSize.value);
    waterBackdrop.setSize(
      Math.max(1,Math.floor(waterUniforms.uWaterSize.value.x*waterBackdropScale)),
      Math.max(1,Math.floor(waterUniforms.uWaterSize.value.y*waterBackdropScale)),
    );
  };
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();
  const render=(now)=>{
    frame=requestAnimationFrame(render);
    if(document.hidden){lastFrame=now;return;}
    if(overlayOpen&&now-lastRenderedFrame<1000/30)return;
    const dt=Math.min(.05,(now-(lastFrame||now))/1000);lastFrame=now;time+=dt*(reduced?.15:1);
    lastRenderedFrame=now;
    uniforms.uTime.value=time;
    const active=!['idle','caught','escaped'].includes(state.phase);
    const visibleFish=renderFishSnapshot();
    const escapeAge=state.phase==='escaped'?Math.max(0,Date.now()+serverOffset-state.resultAt):ESCAPE_ANIMATION_MS;
    const escapeProgress=THREE.MathUtils.clamp(escapeAge/ESCAPE_ANIMATION_MS,0,1);
    const escaping=state.phase==='escaped'&&escapeProgress<1;
    cameraProgress=THREE.MathUtils.damp(cameraProgress,active||escaping?1:0,2,dt);
    const drift=reduced?0:Math.sin(time*.19)*.024;
    camera.position.set(Math.sin(time*.13)*.016,3.35-cameraProgress*.18+drift-portraitBlend*1.6,7-cameraProgress*.6);
    const followsFish=(state.phase==='fighting'||escaping)&&visibleFish;
    const focusX=followsFish?THREE.MathUtils.lerp(state.aim*.18,visibleFish.position.x,state.phase==='fighting'?.48:.28):state.aim*.18;
    const focusZ=followsFish?THREE.MathUtils.lerp(-35,visibleFish.position.z,state.phase==='fighting'?.48:.28):-35;
    camera.lookAt(focusX, -3.8-cameraProgress*.8, focusZ);
    camera.updateMatrixWorld();
    if(state.phase==='fighting'&&visibleFish)target.set(visibleFish.position.x,0,visibleFish.position.z);
    const castAge=(Date.now()+serverOffset-state.castAt)/1000;
    bobber.visible=active&&state.phase!=='fighting';thread.visible=active;rodAssembly.visible=active||charge>0;rod.visible=rodAssembly.visible;
    bobber.scale.setScalar(state.phase==='biting'?.6:1);
    let fling=0;
    if(state.phase==='casting'||state.phase==='waiting'){
      const p=THREE.MathUtils.clamp(castAge/1.28,0,1);
      const ease=1-Math.pow(1-p,1.4);
      bobber.position.lerpVectors(start,target,ease);
      bobber.position.y=(1-p)*start.y+Math.sin(p*Math.PI)*(4.7+state.strength*2)+waveHeight(target.x,target.z,time)*p;
      bobber.rotation.z=p<1?p*12:Math.sin(time*2)*.12;
      fling=Math.sin(Math.min(p*2,1)*Math.PI);
      if(p>=1)land();
    }else if(state.phase==='biting'){
      bobber.position.copy(target);bobber.position.y=waveHeight(target.x,target.z,time)-.11+Math.sin(time*16)*.055;
      bobber.rotation.z=Math.sin(time*15)*.5;
      if(time-lastWake>.35){addRipple(target.x,target.z,.5);lastWake=time;}
    }else if(state.phase==='fighting'){
      bobber.position.copy(target);bobber.position.y=waveHeight(target.x,target.z,time)+.03;
      // Actual line-entry ripples are placed after updating the fish's mouth.
    }else if(state.phase==='retrieving'){
      const p=THREE.MathUtils.clamp((Date.now()+serverOffset-state.retrieveAt)/950,0,1);
      bobber.position.lerpVectors(target,start,p*p);
      bobber.position.y=waveHeight(bobber.position.x,bobber.position.z,time)+p*1.8;
      if(Math.floor(p*20)%4===0 && time-ripples[(rippleIndex+5)%6].z>.15)addRipple(bobber.position.x,bobber.position.z,.25);
    }
    const cues=fishFightCues(visibleFish,state.phase==='fighting'?(visibleFish?.tension??state.tension):0);
    const {strain,stroke}=cues;
    const lateralPull=THREE.MathUtils.clamp(visibleFish?.position.x||0,-3,3)*.055*cues.load;
    const rodHorizontalScale=Math.min(1,camera.aspect/.85);
    const rodButtX=rodButt.x*rodHorizontalScale;
    rodTip.set((1.1+chargeAim*.4+lateralPull+cues.rodSide)*rodHorizontalScale,1.15+charge*1.1-fling*.5-strain*.43,2.8+charge*.6);
    if(rod.visible){
      const positions=rodGeometry.attributes.position.array,sheenPositions=rodSheenGeometry.attributes.position.array;
      const blankLoad=THREE.MathUtils.clamp(fling*.62+strain*1.35+charge*.12,0,1.65);
      for(let i=0;i<rodPointCount;i++){
        const p=i/(rodPointCount-1),curve=Math.sin(p*Math.PI)*Math.pow(p,.72),midLoad=blankLoad*curve;
        // The butt barely moves; the tip carries most of the cast/fight bend.
        rodCenters[i].set(
          rodButtX+(rodTip.x-rodButtX)*p+lateralPull*p*p*.35*rodHorizontalScale,
          rodButt.y+(rodTip.y-rodButt.y)*p-midLoad*(.46+strain*.24),
          rodButt.z+(rodTip.z-rodButt.z)*p+midLoad*.11,
        );
      }
      for(let i=0;i<rodPointCount;i++){
        const p=i/(rodPointCount-1),previous=rodCenters[Math.max(0,i-1)],next=rodCenters[Math.min(rodPointCount-1,i+1)],center=rodCenters[i];
        rodTangent.subVectors(next,previous).normalize();rodView.subVectors(camera.position,center);
        rodNormal.crossVectors(rodTangent,rodView);
        if(rodNormal.lengthSq()<.0001)rodNormal.set(0,1,0);else rodNormal.normalize();
        rodBinormal.crossVectors(rodTangent,rodNormal).normalize();
        const radius=THREE.MathUtils.lerp(.088,.014,p)*(1+strain*.13);
        for(let j=0;j<rodRadialCount;j++){
          const angle=j/rodRadialCount*Math.PI*2,cos=Math.cos(angle),sin=Math.sin(angle),offset=(i*rodRadialCount+j)*3;
          positions[offset]=center.x+(rodNormal.x*cos+rodBinormal.x*sin)*radius;
          positions[offset+1]=center.y+(rodNormal.y*cos+rodBinormal.y*sin)*radius;
          positions[offset+2]=center.z+(rodNormal.z*cos+rodBinormal.z*sin)*radius;
        }
        const sheenOffset=i*3;sheenPositions[sheenOffset]=center.x+rodNormal.x*radius*.86;sheenPositions[sheenOffset+1]=center.y+rodNormal.y*radius*.86;sheenPositions[sheenOffset+2]=center.z+rodNormal.z*radius*.86;
      }
      rodGeometry.attributes.position.needsUpdate=true;rodGeometry.computeVertexNormals();rodSheenGeometry.attributes.position.needsUpdate=true;

      // Every guide is re-posed on the same deflected centerline as the blank.
      for(const entry of guideEntries){
        const raw=entry.fraction*(rodPointCount-1),index=Math.min(rodPointCount-2,Math.floor(raw)),mix=raw-index;
        rodGuidePoint.lerpVectors(rodCenters[index],rodCenters[index+1],mix);rodGuideTangent.subVectors(rodCenters[index+1],rodCenters[index]).normalize();
        rodGuideDown.copy(rodAxisDown).projectOnPlane(rodGuideTangent);if(rodGuideDown.lengthSq()<.0001)rodGuideDown.set(0,-1,0);else rodGuideDown.normalize();
        rodGuideSide.crossVectors(rodGuideDown,rodGuideTangent).normalize();rodGuideMatrix.makeBasis(rodGuideSide,rodGuideDown,rodGuideTangent);
        entry.root.position.copy(rodGuidePoint);entry.root.quaternion.setFromRotationMatrix(rodGuideMatrix);
      }
      // The line must leave the center of the tip-top ring, not a separate
      // pre-bend estimate. This keeps blank, guide and line connected while
      // casting and while the fish is loading the rod sideways.
      const tipGuide=guideEntries[guideEntries.length-1];rodLineAnchor.copy(rodGuidePoint).addScaledVector(rodGuideDown,tipGuide.offset);

      // Cork/EVA grip, reel seat and the hanging spinning reel follow the butt.
      rodGuidePoint.lerpVectors(rodCenters[0],rodCenters[Math.floor(.2*(rodPointCount-1))],.5);handlePoint.copy(rodCenters[0]);handleEnd.copy(rodCenters[Math.floor(.2*(rodPointCount-1))]);handle.position.lerpVectors(handlePoint,handleEnd,.46);handleTangent.subVectors(handleEnd,handlePoint).normalize();handle.quaternion.setFromUnitVectors(rodAxisY,handleTangent);handle.scale.set(1,handlePoint.distanceTo(handleEnd)/.72,1);
      buttCap.position.copy(rodCenters[0]);buttCap.quaternion.setFromUnitVectors(rodAxisY,handleTangent);
      handlePoint.copy(rodCenters[Math.floor(.18*(rodPointCount-1))]);handleEnd.copy(rodCenters[Math.floor(.34*(rodPointCount-1))]);reelSeat.position.lerpVectors(handlePoint,handleEnd,.5);reelTangent.subVectors(handleEnd,handlePoint).normalize();reelSeat.quaternion.setFromUnitVectors(rodAxisY,reelTangent);reelSeat.scale.set(1,handlePoint.distanceTo(handleEnd)/.34,1);
      const reelIndex=Math.floor(.29*(rodPointCount-1));reelPoint.copy(rodCenters[reelIndex]);reelTangent.subVectors(rodCenters[reelIndex+1],rodCenters[reelIndex]).normalize();reelDown.copy(rodAxisDown).projectOnPlane(reelTangent);if(reelDown.lengthSq()<.0001)reelDown.set(0,-1,0);else reelDown.normalize();reelSide.crossVectors(reelDown,reelTangent).normalize();rodGuideMatrix.makeBasis(reelSide,reelDown,reelTangent);reelGroup.position.copy(reelPoint).addScaledVector(reelDown,.17);reelGroup.quaternion.setFromRotationMatrix(rodGuideMatrix);reelSpool.rotation.x=state.reeling?time*8:time*.15;reelBail.rotation.x=state.reeling?time*8+.25:time*.15+.25;
    }
    if(thread.visible&&state.phase!=='fighting'){
      const a=threadGeometry.attributes.position.array;
      for(let i=0;i<49;i++){const p=i/48;a[i*3]=THREE.MathUtils.lerp(rodLineAnchor.x,bobber.position.x,p);a[i*3+1]=THREE.MathUtils.lerp(rodLineAnchor.y,bobber.position.y,p)-Math.sin(p*Math.PI)*.2;a[i*3+2]=THREE.MathUtils.lerp(rodLineAnchor.z,bobber.position.z,p);}
      threadGeometry.attributes.position.needsUpdate=true;
      thread.material.color.set(strain>.8?0xe7a78b:0xdbe6e2);thread.material.opacity=.5+strain*.3;
    }
    const shadowApproach=state.phase==='waiting'&&(state.approach||0)>.015;
    const fishInWater=shadowApproach||state.phase==='biting'||state.phase==='fighting'||escaping;
    const fishShowing=fishInWater||state.phase==='caught';
    const targetFishVisibility=fishVisibilityTarget(state.phase,state.approach||0);
    const visibilityDamping=state.phase==='waiting'?5:state.phase==='biting'?4.5:9;
    displayedFishVisibility=THREE.MathUtils.damp(displayedFishVisibility,targetFishVisibility,visibilityDamping,dt);
    fightFish.group.visible=fishShowing&&Boolean(visibleFish);
    if(fightFish.group.visible){
      const fish=visibleFish;
      const heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      const swimQuaternion=fishOrientation(heading).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1,0,0),(fish.swim?.turn||0)*.12));
      if(state.phase==='caught'){
        const age=catchOrigin?Math.max(0,(now-catchOrigin.at)/1000):Math.max(0,(Date.now()+serverOffset-state.resultAt)/1000),p=THREE.MathUtils.clamp(age/1.2,0,1),ease=1-Math.pow(1-p,3);
        const depth=camera.aspect<.85?8.8*.85/camera.aspect:8.8;
        const final=new THREE.Vector3(camera.aspect<.85?-.95:camera.aspect*depth*.425*.24-.95,.15,-depth).applyMatrix4(camera.matrixWorld);
        const start=catchOrigin?.position||fishWorldPosition(fish);
        const startQuaternion=catchOrigin?.quaternion||swimQuaternion;
        const finalQuaternion=camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-.16));
        fightFish.group.position.lerpVectors(start,final,ease);
        fightFish.group.position.y+=Math.sin(p*Math.PI)*2;
        fightFish.group.quaternion.slerpQuaternions(startQuaternion,finalQuaternion,ease);
        fightFish.group.scale.setScalar(THREE.MathUtils.lerp(catchOrigin?.scale||.66,1.1,ease));
        const wave=catchOrigin?.wave||fish.bodyWave,elapsed=age;
        fightFish.update(time,{power:THREE.MathUtils.lerp(wave.amplitude/.3,.15,ease),glow:THREE.MathUtils.lerp(catchOrigin?.glow??.65,1,ease),bodyPhase:wave.phase+elapsed*wave.frequency*Math.PI*2,bodyFrequency:wave.frequency,bodyWavelength:wave.wavelength,turn:(catchOrigin?.swim?.turn||0)*(1-ease),effort:THREE.MathUtils.lerp(catchOrigin?.swim?.effort||.2,.15,ease),tetherLoad:(catchOrigin?.load||0)*(1-ease)});
      }else{
        const urgent=state.mode==='surge'||state.mode==='split';
        fightFish.group.position.copy(fishWorldPosition(fish));
        fightFish.group.quaternion.slerp(swimQuaternion,1-Math.exp(-dt*12));
        fightFish.group.scale.setScalar(.84);
        const approaching=state.phase==='waiting'||state.phase==='biting';
        const biteReveal=THREE.MathUtils.clamp(((state.approach||0)-WAIT_APPROACH_FRACTION)/(1-WAIT_APPROACH_FRACTION),0,1);
        displayedWave={...fish.bodyWave};displayedGlow=approaching?THREE.MathUtils.lerp(.04,.65,state.phase==='waiting'?0:biteReveal):escaping?.8:urgent?.8:.65;displayedSwim=fish.swim?{...fish.swim}:null;displayedLoad=cues.load;
        fightFish.update(time,{power:THREE.MathUtils.clamp(fish.bodyWave.amplitude/.3,0,1),glow:displayedGlow,bodyPhase:fish.bodyWave.phase,bodyFrequency:fish.bodyWave.frequency,bodyWavelength:fish.bodyWave.wavelength,turn:fish.swim?.turn||0,effort:escaping?1:fish.swim?.effort||.2,tetherLoad:cues.load,visibility:displayedFishVisibility});
      }
    }
    if(state.phase==='fighting'&&fightFish.group.visible){
      fightFish.group.updateMatrixWorld(true);
      mouth.set(-1.86,-.012,0).applyMatrix4(fightFish.group.matrixWorld);
      const lineSag=cues.airSag+cues.wetSag;
      let waterFraction=1,previousFraction=0;
      for(let sample=1;sample<=32;sample++){
        const fraction=sample/32;
        curvePoint.lerpVectors(rodLineAnchor,mouth,fraction);curvePoint.y-=Math.sin(fraction*Math.PI)*lineSag;
        if(curvePoint.y<=waveHeight(curvePoint.x,curvePoint.z,time)){
          let low=previousFraction,high=fraction;
          for(let step=0;step<8;step++){
            const middle=(low+high)*.5;curvePoint.lerpVectors(rodLineAnchor,mouth,middle);curvePoint.y-=Math.sin(middle*Math.PI)*lineSag;
            if(curvePoint.y>waveHeight(curvePoint.x,curvePoint.z,time))low=middle;else high=middle;
          }
          waterFraction=high;break;
        }
        previousFraction=fraction;
      }
      lineEntry.lerpVectors(rodLineAnchor,mouth,waterFraction);lineEntry.y-=Math.sin(waterFraction*Math.PI)*lineSag;
      const line=threadGeometry.attributes.position.array;
      for(let i=0;i<49;i++){
        const fraction=i/48;curvePoint.lerpVectors(rodLineAnchor,mouth,fraction);curvePoint.y-=Math.sin(fraction*Math.PI)*lineSag;
        line[i*3]=curvePoint.x;line[i*3+1]=curvePoint.y;line[i*3+2]=curvePoint.z;
      }
      threadGeometry.attributes.position.needsUpdate=true;
      thread.material.color.set(strain>.8?0xffc0a5:0xf2faf6);thread.material.opacity=cues.lineOpacity;
      if(stroke>.85&&lastStroke<=.85&&cues.load>.15&&time-lastWake>.32){addRipple(lineEntry.x,lineEntry.z,cues.ripplePower);lastWake=time;}
    }
    lastStroke=state.phase==='fighting'&&fightFish.group.visible?stroke:0;
    const schoolRequested=state.phase==='fighting'&&state.school===7&&Boolean(visibleFish);
    schoolAmount=THREE.MathUtils.damp(schoolAmount,schoolRequested?1:0,schoolRequested?4:6,dt);
    const schoolVisible=(schoolRequested||schoolAmount>.02)&&fishInWater&&Boolean(visibleFish);
    if(!schoolVisible&&schoolWasVisible)for(const motion of schoolMotion)motion.initialized=false;
    schoolWasVisible=schoolVisible;
    const neighbors=schoolVisible?schoolMotion.map(motion=>motion.initialized?motion.position.clone():null):[];
    for(let index=0;index<schoolFish.length;index++){
      const model=schoolFish[index],motion=schoolMotion[index];model.group.visible=schoolVisible;if(!schoolVisible)continue;
      const fish=visibleFish,offset=schoolOffsets[index],heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      const side=new THREE.Vector3(-heading.z,0,heading.x);
      if(side.lengthSq()<.0001)side.set(0,0,1);else side.normalize();
      const phase=fish.bodyWave.phase+index*.87,spread=1+THREE.MathUtils.clamp(fish.speed/2.5,0,.45);
      const desired=new THREE.Vector3(fish.position.x,fish.position.y,fish.position.z)
        .addScaledVector(side,offset.x*spread).addScaledVector(heading,offset.z*spread);
      desired.y+=offset.y;
      for(let other=0;other<neighbors.length;other++){
        if(other===index||!neighbors[other])continue;
        const away=desired.clone().sub(neighbors[other]),distance=away.length();
        if(distance>.001&&distance<.65)desired.addScaledVector(away,(.65-distance)*.35/distance);
      }
      if(!motion.initialized){motion.position.copy(desired);motion.velocity.set(0,0,0);motion.initialized=true;}
      else{
        const previous=motion.position.clone();motion.position.lerp(desired,1-Math.exp(-dt*(4.5+fish.speed*.4)));
        motion.velocity.subVectors(motion.position,previous).multiplyScalar(1/Math.max(dt,.001));
      }
      // Follow the leader's self-propulsion, not the line-imposed drift toward
      // the player. Only relative formation corrections affect the heading.
      const propulsion=fish.swim?.velocity||fish.velocity;
      const followerHeading=new THREE.Vector3(propulsion.x+(motion.velocity.x-fish.velocity.x)*.2,propulsion.y,propulsion.z);
      if(followerHeading.lengthSq()<.0001)followerHeading.copy(heading);else followerHeading.normalize();
      model.group.position.copy(motion.position);
      model.group.quaternion.slerp(fishOrientation(followerHeading),1-Math.exp(-dt*10));
      model.group.scale.setScalar(.29);
      model.update(time,{power:THREE.MathUtils.clamp(fish.bodyWave.amplitude/.3,0,1),glow:.42,bodyPhase:phase,bodyFrequency:fish.bodyWave.frequency,bodyWavelength:fish.bodyWave.wavelength,turn:fish.swim?.turn||0,effort:fish.swim?.effort||.2,visibility:schoolAmount});
    }
    wakes.forEach((wake,index)=>{
      const model=index?schoolFish[index-1]:fightFish,position=model.group.position;
      const surface=waveHeight(position.x,position.z,time),shallow=THREE.MathUtils.clamp(1-(surface-position.y)/.85,0,1);
      wake.visible=fishInWater&&model.group.visible&&shallow>.02;if(!wake.visible)return;
      const heading=new THREE.Vector3(-1,0,0).applyQuaternion(model.group.quaternion);heading.y=0;heading.normalize();
      const positions=wake.geometry.attributes.position.array;
      for(let i=0;i<27;i++){const p=i/26,x=position.x-heading.x*p*1.9,z=position.z-heading.z*p*1.9;positions[i*3]=x;positions[i*3+1]=waveHeight(x,z,time)+.018;positions[i*3+2]=z;}
      wake.geometry.attributes.position.needsUpdate=true;wake.material.opacity=shallow*.12;
    });
    const age=time-splashAt;spray.visible=age>=0&&age<.85;
    if(spray.visible){
      for(let i=0;i<36;i++){const v=dropSpeeds[i];drops[i*3]=target.x+v.x*age;drops[i*3+1]=Math.max(0,v.y*age-2.9*age*age);drops[i*3+2]=target.z+v.z*age;}
      dropletGeo.attributes.position.needsUpdate=true;spray.material.opacity=Math.max(0,1-age/.85);
    }
    if(fishShowing){
      renderer.setRenderTarget(waterBackdrop);renderer.clear();renderer.render(backgroundScene,screenCamera);
      renderer.setRenderTarget(null);waterQuad.material=waterCopy;
    }
    renderer.clear();renderer.render(backgroundScene,screenCamera);waterQuad.material=material;
    // Idle and post-escape frames contain no visible 3D objects. Avoid a
    // second scene traversal and depth clear while keeping the same pixels.
    if(active||fishShowing||charge>0){renderer.clearDepth();renderer.render(scene,camera);}
    if(!mount.dataset.ready)mount.dataset.ready='true';
  };
  frame=requestAnimationFrame(render);
    return {setState,setCharge,aimScreen,setOverlayOpen(open){overlayOpen=open;},get diagnostics(){return {phase:state.phase,revision:state.revision,landedRevision,rendered:mount.dataset.ready==='true',drawCalls:renderer.info.render.calls,cameraY:camera.position.y};},dispose(){cancelAnimationFrame(frame);observer.disconnect();fightFish.dispose();for(const model of schoolFish)model.dispose();waterBackdrop.dispose();waterCopy.dispose();for(const root of [scene,backgroundScene])root.traverse(obj=>{obj.geometry?.dispose();if(obj.material)for(const mat of Array.isArray(obj.material)?obj.material:[obj.material])mat.dispose();});renderer.dispose();renderer.domElement.remove();}};
}
