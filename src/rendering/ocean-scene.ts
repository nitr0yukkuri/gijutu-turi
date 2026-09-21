// @ts-nocheck -- the renderer is an imperative WebGL boundary around the vendored Three.js runtime.
import * as THREE from '../../vendor/three.module.js';
import { createGoFish } from './go-fish.js';

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
float heightAt(vec2 p) {
  float h=0.0;
  float freq=0.42, amp=0.13, angle=0.3;
  for(int i=0;i<7;i++) {
    vec2 d=vec2(cos(angle),sin(angle));
    h+=sin(dot(p,d)*freq+uTime*(0.42+float(i)*0.14))*amp;
    freq*=1.83; amp*=0.48; angle+=2.17;
  }
  for(int i=0;i<6;i++) {
    float age=uTime-uRipples[i].z;
    if(age>0.0 && age<8.0) {
      float d=length(p-uRipples[i].xy), r=d-age*1.25;
      h+=sin(r*11.0)*exp(-r*r*1.6)*exp(-age*0.55)*0.08*uRipples[i].w;
    }
  }
  return h;
}
vec3 sky(vec3 d) {
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
  return c+vec3(0.045,0.05,0.05)*cloud;
}
void main(){
  vec4 local=uProjectionInverse*vec4(vUv*2.0-1.0,1.0,1.0);
  vec3 rd=normalize((uCamera*vec4(normalize(local.xyz/local.w),0.0)).xyz);
  vec3 ro=uCamera[3].xyz;
  vec3 color=sky(rd);
  if(rd.y < -0.0004) {
    float t=-ro.y/rd.y;
    for(int i=0;i<4;i++) t=(heightAt((ro+rd*t).xz)-ro.y)/rd.y;
    vec3 p=ro+rd*t;
    float eps=0.035+min(t,180.0)*0.001;
    float hx=heightAt(p.xz+vec2(eps,0))-heightAt(p.xz-vec2(eps,0));
    float hz=heightAt(p.xz+vec2(0,eps))-heightAt(p.xz-vec2(0,eps));
    vec3 n=normalize(vec3(-hx,eps*2.0,-hz));
    float fine=(noise(p.xz*4.5+uTime*0.07)-0.5)*0.035;
    n=normalize(n+vec3(fine,0.0,fine*0.8));
    n=normalize(mix(n,vec3(0.0,1.0,0.0),smoothstep(90.0,450.0,t)));
    vec3 reflected=reflect(rd,n);
    float fresnel=0.035+0.965*pow(1.0-max(dot(-rd,n),0.0),4.5);
    vec3 water=vec3(0.014,0.071,0.094)+vec3(0.012,0.03,0.032)*(n.y*0.5+0.5);
    color=mix(water,sky(reflected),fresnel*0.88);
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
    color=mix(color,sky(vec3(rd.x,0.0,rd.z)),haze*0.97);
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
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  renderer.autoClear=false;
  mount.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();onRenderError();});

  const camera=new THREE.PerspectiveCamera(46,1,0.1,2400);
  const scene=new THREE.Scene();
  const backgroundScene=new THREE.Scene();
  const screenCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const ripples=Array.from({length:6},()=>new THREE.Vector4(0,0,-100,0));
  const uniforms={uTime:{value:0},uCamera:{value:camera.matrixWorld},uProjectionInverse:{value:camera.projectionMatrixInverse},uRipples:{value:ripples},uResolution:{value:new THREE.Vector2()}};
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:waterShader});
  backgroundScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
  scene.add(new THREE.HemisphereLight(0xe4edef,0x23414d,2.3));
  const light=new THREE.DirectionalLight(0xffdfad,2);light.position.set(-10,12,-20);scene.add(light);

  const bobber=new THREE.Group();
  const buoy=new THREE.Mesh(new THREE.SphereGeometry(.075,14,12),new THREE.MeshStandardMaterial({color:0xd27e55,roughness:.35}));
  buoy.scale.y=1.6;bobber.add(buoy);
  const tip=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.22,8),new THREE.MeshStandardMaterial({color:0xf5e9cf,roughness:.5}));tip.position.y=.13;bobber.add(tip);
  bobber.visible=false;scene.add(bobber);
  const threadGeometry=new THREE.BufferGeometry();threadGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(49*3),3));
  const thread=new THREE.Line(threadGeometry,new THREE.LineBasicMaterial({color:0xdbe6e2,transparent:true,opacity:.52}));thread.frustumCulled=false;thread.visible=false;scene.add(thread);
  const rodGeometry=new THREE.BufferGeometry();rodGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(25*3),3));
  const rod=new THREE.Line(rodGeometry,new THREE.LineBasicMaterial({color:0x263b43}));rod.frustumCulled=false;rod.visible=false;scene.add(rod);
  const dropletGeo=new THREE.BufferGeometry();const drops=new Float32Array(36*3);dropletGeo.setAttribute('position',new THREE.BufferAttribute(drops,3));
  const spray=new THREE.Points(dropletGeo,new THREE.PointsMaterial({color:0xd9efed,size:.045,transparent:true,opacity:.85,depthWrite:false}));spray.visible=false;spray.frustumCulled=false;scene.add(spray);
  const dropSpeeds=Array.from({length:36},(_,i)=>{const a=i*2.399;return new THREE.Vector3(Math.cos(a)*(.5+(i%5)*.16),.75+(i%7)*.21,Math.sin(a)*(.5+(i%5)*.16));});
  // Keep the fish readable during the bite and fight. The water is rendered as
  // a background pass, so this shallow, luminous model is the player's cue for
  // where the line is pulling instead of hiding the fish until the result card.
  const fightFish=createGoFish({detail:'high',phase:.7});
  fightFish.group.visible=false;fightFish.group.renderOrder=4;
  fightFish.group.traverse(object=>{object.renderOrder=4;});
  scene.add(fightFish.group);
  const schoolFish=Array.from({length:6},(_,index)=>{
    const model=createGoFish({detail:'low',phase:index*.87});
    model.group.visible=false;model.group.renderOrder=3;scene.add(model.group);return model;
  });
  const schoolMotion=Array.from({length:6},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),initialized:false}));
  const schoolOffsets=[
    new THREE.Vector3(-.68,.04,1.12),new THREE.Vector3(.76,-.02,.78),
    new THREE.Vector3(-.98,-.08,.18),new THREE.Vector3(.94,.09,.08),
    new THREE.Vector3(-.46,.12,-.92),new THREE.Vector3(.58,-.11,-1.04),
  ];
  let schoolWasVisible=false;
  const catchLight=new THREE.DirectionalLight(0x8be1ff,1.8);catchLight.position.set(-3,7,4);scene.add(catchLight);
  const wakes=Array.from({length:7},()=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(27*3),3));
    const wake=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xa2d7db,transparent:true,opacity:.58}));wake.frustumCulled=false;wake.visible=false;scene.add(wake);return wake;
  });

  const start=new THREE.Vector3(.85,1.8,4.8),target=new THREE.Vector3(0,0,-21),rodTip=new THREE.Vector3(1.1,1.15,2.8);
  let state={phase:'idle',castAt:0,strength:.65,aim:0,revision:0};
  let time=0,lastFrame=0,landedRevision=-1,splashAt=-100,rippleIndex=0,charge=0,chargeAim=0,lastWake=0;
  let serverOffset=0,cameraProgress=0,frame,fishSamples=[],catchOrigin=null;
  const copyFish=fish=>fish?{
    position:{...fish.position},velocity:{...fish.velocity},heading:{...fish.heading},speed:fish.speed,gait:fish.gait,
    bodyWave:{...fish.bodyWave}
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
    speed:lerpValue(a.speed,b.speed,t),gait:t<.5?a.gait:b.gait,
    bodyWave:{phase:lerpAngle(a.bodyWave.phase,b.bodyWave.phase,t),amplitude:lerpValue(a.bodyWave.amplitude,b.bodyWave.amplitude,t),frequency:lerpValue(a.bodyWave.frequency,b.bodyWave.frequency,t),wavelength:lerpValue(a.bodyWave.wavelength,b.bodyWave.wavelength,t)}
  }:copyFish(a||b);
  const waveHeight=(x,z,t)=>{
    let h=0,f=.42,a=.13,angle=.3;
    for(let i=0;i<7;i++){h+=Math.sin((x*Math.cos(angle)+z*Math.sin(angle))*f+t*(.42+i*.14))*a;f*=1.83;a*=.48;angle+=2.17;}
    return h;
  };
  const fishWorldPosition=fish=>new THREE.Vector3(fish.position.x,fish.position.y+waveHeight(fish.position.x,fish.position.z,time),fish.position.z);
  const renderFishSnapshot=()=>{
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
    if(next.fish){
      fishSamples.push({serverTime:Number.isFinite(serverNow)?serverNow:Date.now()+serverOffset,fish:copyFish(next.fish)});
      if(fishSamples.length>16)fishSamples.shift();
    }
    state={...next};
    target.set(next.aim*7,0,-(12+next.strength*23));
    if(['fighting','caught'].includes(next.phase)&&next.fish)target.set(next.fish.position.x,0,next.fish.position.z);
    else if(['fighting','caught'].includes(next.phase))target.set(next.aim*7+(next.fishX||0),0,-next.distance);
    if(next.phase==='caught'&&previousPhase!=='caught'&&next.fish){
      const fish=copyFish(next.fish),heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      catchOrigin={position:fishWorldPosition(fish),quaternion:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1,0,0),heading.normalize())};
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
    renderer.setSize(width,height,false);uniforms.uResolution.value.set(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
  };
  const observer=new ResizeObserver(resize);observer.observe(mount);resize();
  const render=(now)=>{
    frame=requestAnimationFrame(render);
    if(document.hidden){lastFrame=now;return;}
    const dt=Math.min(.05,(now-(lastFrame||now))/1000);lastFrame=now;time+=dt*(reduced?.15:1);
    uniforms.uTime.value=time;
    const active=!['idle','caught','escaped'].includes(state.phase);
    const visibleFish=renderFishSnapshot();
    cameraProgress=THREE.MathUtils.damp(cameraProgress,active?1:0,2,dt);
    const drift=reduced?0:Math.sin(time*.19)*.024;
    camera.position.set(Math.sin(time*.13)*.016,3.35-cameraProgress*.18+drift,7-cameraProgress*.6);
    const focusZ=state.phase==='fighting'&&visibleFish?THREE.MathUtils.lerp(-35,visibleFish.position.z,.28):-35;
    camera.lookAt(state.aim*.18, -3.8-cameraProgress*.8, focusZ);
    camera.updateMatrixWorld();
    if(state.phase==='fighting'&&visibleFish)target.set(visibleFish.position.x,0,visibleFish.position.z);
    const castAge=(Date.now()+serverOffset-state.castAt)/1000;
    bobber.visible=active&&state.phase!=='fighting';thread.visible=active;rod.visible=active||charge>0;
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
      if(time-lastWake>(state.mode==='rest'?.4:.16)){addRipple(target.x,target.z,state.mode==='rest'?.3:.65);lastWake=time;}
    }else if(state.phase==='retrieving'){
      const p=THREE.MathUtils.clamp((Date.now()+serverOffset-state.retrieveAt)/950,0,1);
      bobber.position.lerpVectors(target,start,p*p);
      bobber.position.y=waveHeight(bobber.position.x,bobber.position.z,time)+p*1.8;
      if(Math.floor(p*20)%4===0 && time-ripples[(rippleIndex+5)%6].z>.15)addRipple(bobber.position.x,bobber.position.z,.25);
    }
    const strain=state.phase==='fighting'?state.tension:0;
    rodTip.set(1.1+chargeAim*.4+Math.sin(time*32)*strain*.027,1.15+charge*1.1-fling*.5-strain*.43,2.8+charge*.6);
    if(rod.visible){
      const positions=rodGeometry.attributes.position.array;
      for(let i=0;i<25;i++){const p=i/24;positions[i*3]=2.2+(rodTip.x-2.2)*p;positions[i*3+1]=-.9+(rodTip.y+.9)*p-Math.sin(p*Math.PI)*(fling*.25+strain*.7);positions[i*3+2]=6+(rodTip.z-6)*p;}
      rodGeometry.attributes.position.needsUpdate=true;
    }
    if(thread.visible){
      const a=threadGeometry.attributes.position.array;
      for(let i=0;i<49;i++){const p=i/48;a[i*3]=THREE.MathUtils.lerp(rodTip.x,bobber.position.x,p);a[i*3+1]=THREE.MathUtils.lerp(rodTip.y,bobber.position.y,p)-Math.sin(p*Math.PI)*.2;a[i*3+2]=THREE.MathUtils.lerp(rodTip.z,bobber.position.z,p);}
      threadGeometry.attributes.position.needsUpdate=true;
      thread.material.color.set(strain>.8?0xe7a78b:0xdbe6e2);thread.material.opacity=.5+strain*.3;
    }
    wakes.forEach((wake,index)=>{
      wake.visible=state.phase==='fighting'&&index<(state.school||1);if(!wake.visible)return;
      const center=visibleFish?.position||target;
      const spread=index===0?0:1.1+index*.18,angle=index*2.4;
      const x=center.x+Math.sin(angle+time*.5)*spread,z=center.z+Math.cos(angle+time*.7)*spread;
      const positions=wake.geometry.attributes.position.array;
      for(let i=0;i<27;i++){const p=i/26;const wx=x+Math.sin(p*Math.PI*2)*(.19+p*.15);const wz=z+p*1.9;positions[i*3]=wx;positions[i*3+1]=waveHeight(wx,wz,time)+.018;positions[i*3+2]=wz;}
      wake.geometry.attributes.position.needsUpdate=true;wake.material.opacity=(state.mode==='rest'?.3:.6)*(index? .7:1);
    });
    const fishInWater=state.phase==='biting'||state.phase==='fighting';
    const fishShowing=fishInWater||state.phase==='caught';
    fightFish.group.visible=fishShowing&&Boolean(visibleFish);
    if(fightFish.group.visible){
      const fish=visibleFish;
      const heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      const swimQuaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1,0,0),heading);
      if(state.phase==='caught'){
        const age=Math.max(0,(Date.now()+serverOffset-state.resultAt)/1000),p=THREE.MathUtils.clamp(age/1.2,0,1),ease=1-Math.pow(1-p,3);
        const depth=camera.aspect<.85?8.8*.85/camera.aspect:8.8;
        const final=new THREE.Vector3(camera.aspect<.85?-.95:camera.aspect*depth*.425*.24-.95,.15,-depth).applyMatrix4(camera.matrixWorld);
        const start=catchOrigin?.position||fishWorldPosition(fish);
        const startQuaternion=catchOrigin?.quaternion||swimQuaternion;
        const finalQuaternion=camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-.16));
        fightFish.group.position.lerpVectors(start,final,ease);
        fightFish.group.position.y+=Math.sin(p*Math.PI)*2;
        fightFish.group.quaternion.slerpQuaternions(startQuaternion,finalQuaternion,ease);
        fightFish.group.scale.setScalar(.35+.75*ease);
        fightFish.update(time,{power:.15,glow:1.0,bodyPhase:fish.bodyWave.phase,bodyFrequency:fish.bodyWave.frequency});
      }else{
        const water=waveHeight(fish.position.x,fish.position.z,time),depth=Math.max(0,-fish.position.y),nearSurface=THREE.MathUtils.clamp(1-depth/.7,0,1);
        const urgent=state.mode==='surge'||state.mode==='split';
        fightFish.group.position.set(fish.position.x,fish.position.y+water,fish.position.z);
        fightFish.group.quaternion.slerp(swimQuaternion,1-Math.exp(-dt*12));
        fightFish.group.scale.setScalar(state.phase==='biting'?.58:urgent?.76:.66);
        const glow=(state.phase==='biting'?1.15:urgent?1.35:1.0)*(.68+nearSurface*.52);
        fightFish.update(time,{power:THREE.MathUtils.clamp(fish.bodyWave.amplitude/.3,.25,1),glow,bodyPhase:fish.bodyWave.phase,bodyFrequency:fish.bodyWave.frequency});
      }
    }
    const schoolVisible=state.phase==='fighting'&&state.school===7&&Boolean(visibleFish);
    if(!schoolVisible&&schoolWasVisible)for(const motion of schoolMotion)motion.initialized=false;
    schoolWasVisible=schoolVisible;
    for(let index=0;index<schoolFish.length;index++){
      const model=schoolFish[index],motion=schoolMotion[index];model.group.visible=schoolVisible;if(!schoolVisible)continue;
      const fish=visibleFish,offset=schoolOffsets[index],heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      const side=new THREE.Vector3(-heading.z,0,heading.x);
      if(side.lengthSq()<.0001)side.set(0,0,1);else side.normalize();
      const phase=fish.bodyWave.phase+index*.35,beat=Math.sin(phase),spread=1+THREE.MathUtils.clamp(fish.speed/2.5,0,.45);
      const desired=new THREE.Vector3(fish.position.x,fish.position.y,fish.position.z)
        .addScaledVector(side,offset.x*spread).addScaledVector(heading,offset.z*spread);
      desired.y+=offset.y+beat*.07;
      desired.y+=waveHeight(desired.x,desired.z,time);
      if(!motion.initialized){motion.position.copy(desired);motion.velocity.set(0,0,0);motion.initialized=true;}
      else{
        const previous=motion.position.clone();motion.position.lerp(desired,1-Math.exp(-dt*(4.5+fish.speed*.4)));
        motion.velocity.subVectors(motion.position,previous).multiplyScalar(1/Math.max(dt,.001));
      }
      const followerHeading=motion.velocity.lengthSq()>.0025?motion.velocity.clone().normalize():heading;
      model.group.position.copy(motion.position);
      model.group.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1,0,0),followerHeading),1-Math.exp(-dt*10));
      model.group.scale.setScalar(.23);
      model.update(time,{power:.55,glow:.42,bodyPhase:phase,bodyFrequency:fish.bodyWave.frequency});
    }
    const age=time-splashAt;spray.visible=age>=0&&age<.85;
    if(spray.visible){
      for(let i=0;i<36;i++){const v=dropSpeeds[i];drops[i*3]=target.x+v.x*age;drops[i*3+1]=Math.max(0,v.y*age-2.9*age*age);drops[i*3+2]=target.z+v.z*age;}
      dropletGeo.attributes.position.needsUpdate=true;spray.material.opacity=Math.max(0,1-age/.85);
    }
    renderer.clear();renderer.render(backgroundScene,screenCamera);renderer.clearDepth();renderer.render(scene,camera);
    if(!mount.dataset.ready)mount.dataset.ready='true';
  };
  frame=requestAnimationFrame(render);
    return {setState,setCharge,aimScreen,get diagnostics(){return {phase:state.phase,revision:state.revision,landedRevision,rendered:mount.dataset.ready==='true',drawCalls:renderer.info.render.calls,cameraY:camera.position.y};},dispose(){cancelAnimationFrame(frame);observer.disconnect();fightFish.dispose();for(const model of schoolFish)model.dispose();for(const root of [scene,backgroundScene])root.traverse(obj=>{obj.geometry?.dispose();if(obj.material)for(const mat of Array.isArray(obj.material)?obj.material:[obj.material])mat.dispose();});renderer.dispose();}};
}
