// @ts-nocheck -- the renderer is an imperative WebGL boundary around the vendored Three.js runtime.
import * as THREE from '../../vendor/three.module.js';
import { createGoFish } from './go-fish.js';
import { createDockerWhale,setDockerWhaleMouthAnchor } from './docker-whale.js';
import { fishApparentPoint,waterHeightGLSL } from './fish-water.js';
import { fishFightCues,lineSagForLoad } from './fish-fight-cues.js';
import { updateFishingLineBuffers } from './fishing-line.js';
import { rodCenterAt, rodFlexProfileFor, smoothRodLoad } from './rod-flex.js';
import { escapeFishVisibility, fishVisibilityTarget, WAIT_APPROACH_FRACTION } from '../fish-approach.js';
import { k8sSurfaceLungeProgress } from '../fish-behavior.js';
import { ESCAPE_ANIMATION_MS } from '../ocean-game.js';
import { RETRIEVE_DURATION_MS } from '../ocean-timing.js';
import { castDistanceForStrength } from '../cast-distance.js';
import { TackleStateStore } from './tackle-state.js';
import { retrievePresentationAt } from './retrieve-presentation.js';
import { resolveCssFishVisualState } from '../css-fish-style.js';
import { fishScaleForResponsiveCamera } from './fish-camera-scale.js';
import { schoolCatchFormationScale } from './school-catch.js';
import { K8S_ECHO_COUNT, k8sFightPresentation } from './k8s-fight-presentation.js';

// Keep the escape result on screen while the camera returns to the normal view.
const ESCAPE_FADE_MS = 420;

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
  const threadGeometry=new THREE.BufferGeometry();threadGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(49*3),3));threadGeometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(49*4),4));
  const thread=new THREE.Line(threadGeometry,new THREE.LineBasicMaterial({color:0xcbd6d1,transparent:true,opacity:.9,vertexColors:true,depthWrite:false}));thread.frustumCulled=false;thread.renderOrder=5;thread.visible=false;scene.add(thread);
  const wetThreadGeometry=new THREE.BufferGeometry();wetThreadGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(49*3),3));wetThreadGeometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(49*4),4));
  const wetThread=new THREE.Line(wetThreadGeometry,new THREE.LineBasicMaterial({color:0x83a7a1,transparent:true,opacity:.72,vertexColors:true,depthWrite:false}));wetThread.frustumCulled=false;wetThread.renderOrder=5;wetThread.visible=false;scene.add(wetThread);
  const dryLineBuffer={positions:threadGeometry.attributes.position.array,rgba:threadGeometry.attributes.color.array};
  const wetLineBuffer={positions:wetThreadGeometry.attributes.position.array,rgba:wetThreadGeometry.attributes.color.array};
  // A rod is not a single dark line: the blank tapers toward the tip, guides
  // sit on the load-bearing side, and a spinning reel hangs below the seat.
  // Keeping the parts in one assembly lets the whole tackle disappear between
  // casts without leaving the guide meshes behind in the background.
  // Keep the blank readable as one continuous tapered object in the first
  // person foreground. The previous 34 rings were enough for a tube, but the
  // action profile still read as a straight stick once the butt fell below
  // the camera's crop.
  const rodPointCount=64,rodRadialCount=16;
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
  const blankColor=new THREE.Color(0x343d3e),buttColor=new THREE.Color(0x171e20),highlightColor=new THREE.Color(0x8c9894);
  for(let i=0;i<rodPointCount;i++)for(let j=0;j<rodRadialCount;j++){
    const p=i/(rodPointCount-1),angle=j/rodRadialCount*Math.PI*2,c=blankColor.clone().lerp(buttColor,Math.max(0,(.16-p)*1.9));
    c.lerp(highlightColor,Math.pow(Math.max(0,Math.cos(angle)),10)*.12);
    const offset=(i*rodRadialCount+j)*3;rodColors[offset]=c.r;rodColors[offset+1]=c.g;rodColors[offset+2]=c.b;
  }
  rodGeometry.setAttribute('color',new THREE.BufferAttribute(rodColors,3));
  const rod=new THREE.Mesh(rodGeometry,new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.28,metalness:.08,clearcoat:.88,clearcoatRoughness:.18,side:THREE.DoubleSide}));
  rod.frustumCulled=false;rod.visible=false;
  const rodSheenGeometry=new THREE.BufferGeometry();rodSheenGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rodPointCount*3),3));
  rodSheenGeometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
  const rodSheen=new THREE.Line(rodSheenGeometry,new THREE.LineBasicMaterial({color:0xc5d2ce,transparent:true,opacity:.13}));rodSheen.frustumCulled=false;
  const rodAssembly=new THREE.Group();rodAssembly.visible=false;rodAssembly.add(rod,rodSheen);scene.add(rodAssembly);
  const rodCenters=Array.from({length:rodPointCount},()=>new THREE.Vector3()),rodViewPoint=new THREE.Vector3();
  const rodTangent=new THREE.Vector3(),rodView=new THREE.Vector3(),rodNormal=new THREE.Vector3(),rodBinormal=new THREE.Vector3();
  const rodGuideDown=new THREE.Vector3(),rodGuideSide=new THREE.Vector3(),rodGuideTangent=new THREE.Vector3(),rodGuidePoint=new THREE.Vector3(),rodLineAnchor=new THREE.Vector3(),reelLineExit=new THREE.Vector3(),rodGuideMatrix=new THREE.Matrix4();
  const rodFishTarget=new THREE.Vector3(),rodLineDirection=new THREE.Vector3();
  const lineProjectionCenter=new THREE.Vector3(),lineProjectionEye=new THREE.Vector3();
  const mouthSideDirection=new THREE.Vector3(),mouthSideRotation=new THREE.Quaternion();
  let dockerHookSide=1;
  const rodAxisY=new THREE.Vector3(0,1,0),rodAxisZ=new THREE.Vector3(0,0,1),rodAxisDown=new THREE.Vector3(0,-1,0);
  const fishMouthLocal=(fishId,point,whaleSide=dockerHookSide)=>fishId==='whale-001'
    ? setDockerWhaleMouthAnchor(point,whaleSide)
    : point.set(-1.86,-.012,0);
  const projectSubmergedLinePoint=(point)=>fishApparentPoint(point,lineProjectionCenter,lineProjectionEye,point);
  const placeRodOnScreen=(x:number,y:number,depth:number,target:THREE.Vector3)=>{
    const halfHeight=depth*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));
    rodViewPoint.set(x*halfHeight*camera.aspect,y*halfHeight,-depth).applyMatrix4(camera.matrixWorld);
    target.copy(rodViewPoint);
  };
  const blankRadiusAt=(p:number)=>p<.12
    ?THREE.MathUtils.lerp(.052,.038,p/.12)
    :p<.64
      ?THREE.MathUtils.lerp(.038,.018,(p-.12)/.52)
      :THREE.MathUtils.lerp(.018,.0048,(p-.64)/.36);
  const guideRadiusAt=(p:number)=>p<.56
    ?THREE.MathUtils.lerp(.048,.023,(p-.26)/.30)
    :THREE.MathUtils.lerp(.023,.008,(p-.56)/.434);
  const guideMaterial=new THREE.MeshStandardMaterial({color:0x7e8988,metalness:.82,roughness:.27});
  const insertMaterial=new THREE.MeshStandardMaterial({color:0x202729,metalness:.12,roughness:.28});
  const wrapMaterial=new THREE.MeshStandardMaterial({color:0x343c3d,metalness:.22,roughness:.3});
  const guideEntries=[.26,.38,.50,.62,.73,.83,.91,.96,.994].map(fraction=>{
    const root=new THREE.Group(),radius=guideRadiusAt(fraction),blankRadius=blankRadiusAt(fraction),offset=radius+blankRadius;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.0018,6,24),guideMaterial);
    const insert=new THREE.Mesh(new THREE.TorusGeometry(radius*.78,.0013,5,24),insertMaterial);
    const foot=new THREE.Mesh(new THREE.CylinderGeometry(.0017,.0017,.065,6),guideMaterial);
    const wrap=new THREE.Mesh(new THREE.TorusGeometry(.03,.0015,5,18),wrapMaterial);
    ring.position.y=offset;insert.position.y=offset;foot.position.y=blankRadius+radius;foot.scale.y=radius*2/.065;
    root.add(ring,insert,foot,wrap);rodAssembly.add(root);
    return {fraction,root,ring,insert,foot,wrap,radius,offset,linePoint:new THREE.Vector3()};
  });
  const rodGuideLineGeometry=new THREE.BufferGeometry();
  rodGuideLineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((guideEntries.length+1)*3),3));
  rodGuideLineGeometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
  const rodGuideLine=new THREE.Line(rodGuideLineGeometry,new THREE.LineBasicMaterial({color:0xc3d4d0,transparent:true,opacity:.28,depthWrite:false}));
  rodGuideLine.frustumCulled=false;rodGuideLine.renderOrder=4;rodAssembly.add(rodGuideLine);
  const gripMaterial=new THREE.MeshStandardMaterial({color:0x292d2e,roughness:.88,metalness:.02});
  const seatMaterial=new THREE.MeshPhysicalMaterial({color:0x171d1f,roughness:.3,metalness:.3,clearcoat:.62,clearcoatRoughness:.22});
  const reelMetalMaterial=new THREE.MeshStandardMaterial({color:0x89918e,roughness:.28,metalness:.84});
  const reelBodyMaterial=new THREE.MeshPhysicalMaterial({color:0x303638,roughness:.3,metalness:.62,clearcoat:.45,clearcoatRoughness:.2});
  const linePackMaterial=new THREE.MeshStandardMaterial({color:0x586568,roughness:.64,metalness:.16});
  const backGrip=new THREE.Mesh(new THREE.CylinderGeometry(.052,.067,.72,20),gripMaterial);backGrip.frustumCulled=false;rodAssembly.add(backGrip);
  const foreGrip=new THREE.Mesh(new THREE.CylinderGeometry(.031,.038,.72,18),gripMaterial);foreGrip.frustumCulled=false;rodAssembly.add(foreGrip);
  const buttCap=new THREE.Mesh(new THREE.CylinderGeometry(.066,.066,.72,20),new THREE.MeshStandardMaterial({color:0x171c1d,roughness:.68,metalness:.12}));buttCap.frustumCulled=false;rodAssembly.add(buttCap);
  const reelSeat=new THREE.Mesh(new THREE.CylinderGeometry(.037,.043,.72,20),seatMaterial);reelSeat.frustumCulled=false;rodAssembly.add(reelSeat);
  const rearHood=new THREE.Mesh(new THREE.CylinderGeometry(.045,.047,.72,20),reelMetalMaterial);rearHood.frustumCulled=false;rodAssembly.add(rearHood);
  const frontHood=new THREE.Mesh(new THREE.CylinderGeometry(.039,.041,.72,20),reelMetalMaterial);frontHood.frustumCulled=false;rodAssembly.add(frontHood);
  const ferrule=new THREE.Mesh(new THREE.CylinderGeometry(.020,.020,.72,16),seatMaterial);ferrule.frustumCulled=false;rodAssembly.add(ferrule);
  const ferruleBand=new THREE.Mesh(new THREE.CylinderGeometry(.0215,.0215,.72,16),reelMetalMaterial);ferruleBand.frustumCulled=false;rodAssembly.add(ferruleBand);
  const reelGroup=new THREE.Group();reelGroup.frustumCulled=false;rodAssembly.add(reelGroup);
  const reelFoot=new THREE.Mesh(new THREE.BoxGeometry(.028,.009,.12),reelMetalMaterial);reelFoot.position.y=.018;reelGroup.add(reelFoot);
  const reelStem=new THREE.Mesh(new THREE.CylinderGeometry(.009,.014,.15,10),reelBodyMaterial);reelStem.position.set(0,.095,-.035);reelGroup.add(reelStem);
  const reelBodyProfile=[new THREE.Vector2(0,-.11),new THREE.Vector2(.036,-.105),new THREE.Vector2(.067,-.075),new THREE.Vector2(.079,-.025),new THREE.Vector2(.073,.035),new THREE.Vector2(.052,.085),new THREE.Vector2(.021,.12),new THREE.Vector2(0,.125)];
  const reelBody=new THREE.Mesh(new THREE.LatheGeometry(reelBodyProfile,24),reelBodyMaterial);reelBody.position.set(0,.20,-.045);reelGroup.add(reelBody);
  const sidePlate=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.014,24),seatMaterial);sidePlate.rotation.z=Math.PI/2;sidePlate.position.set(.075,.20,-.045);reelGroup.add(sidePlate);
  const spoolGroup=new THREE.Group();spoolGroup.position.set(0,.105,.055);reelGroup.add(spoolGroup);
  const reelSpool=new THREE.Mesh(new THREE.CylinderGeometry(.052,.056,.052,24),linePackMaterial);reelSpool.rotation.x=Math.PI/2;spoolGroup.add(reelSpool);
  const spoolRearLip=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.01,24),reelMetalMaterial);spoolRearLip.rotation.x=Math.PI/2;spoolRearLip.position.z=-.031;spoolGroup.add(spoolRearLip);
  const spoolFrontLip=new THREE.Mesh(new THREE.CylinderGeometry(.073,.073,.01,24),reelMetalMaterial);spoolFrontLip.rotation.x=Math.PI/2;spoolFrontLip.position.z=.031;spoolGroup.add(spoolFrontLip);
  const lineWindings=Array.from({length:5},(_,index)=>{
    const winding=new THREE.Mesh(new THREE.TorusGeometry(.056,.0011,4,24),linePackMaterial);winding.position.z=-.02+index*.01;spoolGroup.add(winding);return winding;
  });
  const dragKnob=new THREE.Mesh(new THREE.CylinderGeometry(.019,.022,.018,16),seatMaterial);dragKnob.rotation.x=Math.PI/2;dragKnob.position.z=.041;spoolGroup.add(dragKnob);
  const reelRotorGroup=new THREE.Group();reelRotorGroup.position.set(0,.105,.028);reelGroup.add(reelRotorGroup);
  const rotor=new THREE.Mesh(new THREE.CylinderGeometry(.046,.05,.022,24),reelBodyMaterial);rotor.rotation.x=Math.PI/2;reelRotorGroup.add(rotor);
  const bailGroup=new THREE.Group();bailGroup.position.z=.052;reelRotorGroup.add(bailGroup);
  const reelBail=new THREE.Mesh(new THREE.TorusGeometry(.082,.0024,6,32,Math.PI*1.22),reelMetalMaterial);reelBail.rotation.z=-Math.PI*.11;bailGroup.add(reelBail);
  const bailHingeA=new THREE.Mesh(new THREE.SphereGeometry(.006,8,6),reelMetalMaterial);bailHingeA.position.set(-.077,-.028,0);bailGroup.add(bailHingeA);
  const bailHingeB=new THREE.Mesh(new THREE.SphereGeometry(.006,8,6),reelMetalMaterial);bailHingeB.position.set(.077,-.028,0);bailGroup.add(bailHingeB);
  const reelHandleGroup=new THREE.Group();reelHandleGroup.position.set(.078,.20,-.055);reelGroup.add(reelHandleGroup);
  const reelArm=new THREE.Mesh(new THREE.CylinderGeometry(.0055,.007,.11,8),reelMetalMaterial);reelArm.position.y=.045;reelHandleGroup.add(reelArm);
  const reelKnob=new THREE.Mesh(new THREE.CylinderGeometry(.012,.015,.043,12),gripMaterial);reelKnob.position.y=.115;reelHandleGroup.add(reelKnob);
  const handlePoint=new THREE.Vector3(),handleEnd=new THREE.Vector3(),handleTangent=new THREE.Vector3(),handleEndTangent=new THREE.Vector3(),reelPoint=new THREE.Vector3(),reelTangent=new THREE.Vector3(),reelDown=new THREE.Vector3(),reelSide=new THREE.Vector3();
  const sampleRodCenter=(fraction:number,target:THREE.Vector3)=>{
    const raw=fraction*(rodPointCount-1),index=Math.min(rodPointCount-2,Math.floor(raw));
    return target.lerpVectors(rodCenters[index],rodCenters[index+1],raw-index);
  };
  const poseRodSegment=(mesh:THREE.Mesh,start:number,end:number,restLength:number)=>{
    sampleRodCenter(start,handlePoint);sampleRodCenter(end,handleEnd);
    handleTangent.subVectors(handleEnd,handlePoint).normalize();mesh.position.lerpVectors(handlePoint,handleEnd,.5);
    mesh.quaternion.setFromUnitVectors(rodAxisY,handleTangent);mesh.scale.set(1,handlePoint.distanceTo(handleEnd)/restLength,1);
  };
  const dropletGeo=new THREE.BufferGeometry();const drops=new Float32Array(36*3);dropletGeo.setAttribute('position',new THREE.BufferAttribute(drops,3));
  const spray=new THREE.Points(dropletGeo,new THREE.PointsMaterial({color:0xd9efed,size:.045,transparent:true,opacity:.85,depthWrite:false}));spray.visible=false;spray.frustumCulled=false;scene.add(spray);
  const dropSpeeds=Array.from({length:36},(_,i)=>{const a=i*2.399;return new THREE.Vector3(Math.cos(a)*(.5+(i%5)*.16),.75+(i%7)*.21,Math.sin(a)*(.5+(i%5)*.16));});
  // A submerged animal, not a luminous overlay on top of the sea.
  const fightFish=createGoFish({detail:'high',phase:.7,waterUniforms});
  fightFish.group.visible=false;fightFish.group.renderOrder=4;
  fightFish.group.traverse(object=>{object.renderOrder=4;});
  scene.add(fightFish.group);
  const dockerWhale=createDockerWhale({detail:'high',phase:.7,waterUniforms});
  dockerWhale.group.visible=false;dockerWhale.group.renderOrder=4;dockerWhale.group.scale.setScalar(.42);
  dockerWhale.group.traverse(object=>{object.renderOrder=4;});
  scene.add(dockerWhale.group);
  const cssFish=createGoFish({detail:'high',phase:.7,waterUniforms,visualProfile:'css'});
  cssFish.group.visible=false;cssFish.group.renderOrder=4;
  cssFish.group.traverse(object=>{object.renderOrder=4;});
  scene.add(cssFish.group);
  let clusterFish=null;
  const ensureClusterFish=()=>{
    if(clusterFish)return clusterFish;
    clusterFish=createGoFish({detail:'high',phase:.7,waterUniforms,visualProfile:'cluster'});
    clusterFish.group.visible=false;clusterFish.group.renderOrder=4;
    clusterFish.group.traverse(object=>{object.renderOrder=4;});
    scene.add(clusterFish.group);
    return clusterFish;
  };
  const fightModelFor=(fishId)=>fishId==='whale-001'?dockerWhale:fishId==='css-001'?cssFish:fishId==='k8s-001'?ensureClusterFish():fightFish;
  const liveFishScale=(fishId,phase)=>fishScaleForResponsiveCamera(fishId==='whale-001'?.42:fishId==='k8s-001'?(phase==='fighting'?1.02:.68):fishId==='css-001'?(phase==='fighting'?.74:.55):(phase==='fighting'?.84:.66),camera.fov,portraitBlend);
  const catchFishScale=(fishId)=>fishScaleForResponsiveCamera(fishId==='whale-001'?.57:fishId==='k8s-001'?1.3:fishId==='css-001'?.88:1.1,camera.fov,portraitBlend);
  // The submerged line ends at the same undeformed nose anchor as the model.
  const mouth=new THREE.Vector3(),lineEntry=new THREE.Vector3(),curvePoint=new THREE.Vector3();
  const schoolFish=Array.from({length:6},(_,index)=>{
    const model=createGoFish({detail:'low',phase:index*.87,waterUniforms});
    model.group.visible=false;model.group.renderOrder=3;scene.add(model.group);return model;
  });
  const schoolMotion=Array.from({length:6},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),initialized:false}));
  // Visual-only replicas follow the authoritative fish snapshot. They never
  // receive a line, hook, or independent game state.
  let clusterEchoes=[],clusterEchoMotion=[];
  const ensureClusterEchoes=()=>{
    if(clusterEchoes.length)return;
    clusterEchoes=Array.from({length:K8S_ECHO_COUNT},(_,index)=>{
      const model=createGoFish({detail:'low',phase:1.7+index,waterUniforms,visualProfile:'cluster'});
      model.group.visible=false;model.group.renderOrder=3;scene.add(model.group);return model;
    });
    clusterEchoMotion=Array.from({length:K8S_ECHO_COUNT},()=>({position:new THREE.Vector3(),velocity:new THREE.Vector3(),initialized:false}));
  };
  const clusterEchoOffsets=[new THREE.Vector3(-.92,.06,-1.24),new THREE.Vector3(.92,-.08,-1.36)];
  let clusterEchoAmount=0;
  let previousK8sSurfaceGap=null,lastK8sBreachAt=-100;
  const schoolOffsets=[
    new THREE.Vector3(-.68,.04,1.12),new THREE.Vector3(.76,-.02,.78),
    new THREE.Vector3(-.98,-.08,.18),new THREE.Vector3(.94,.09,.08),
    new THREE.Vector3(-.46,.12,-.92),new THREE.Vector3(.58,-.11,-1.04),
  ];
  let schoolWasVisible=false,schoolAmount=0,schoolCatchOrigins=null;
  const catchLight=new THREE.DirectionalLight(0x8be1ff,1.8);catchLight.position.set(-3,7,4);scene.add(catchLight);
  const wakes=Array.from({length:7},()=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(27*3),3));
    const wake=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xa2d7db,transparent:true,opacity:.58}));wake.frustumCulled=false;wake.visible=false;scene.add(wake);return wake;
  });
  // The normal surface wake disappears at fighting depth. Docker also needs a
  // submerged, low-contrast pressure trail so its mass reads while swimming.
  const whaleWakes=Array.from({length:3},(_,index)=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(27*3),3));
    const wake=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:index?0x5e9fa7:0x9fd8d2,transparent:true,opacity:index?.1:.16,depthWrite:false}));
    wake.frustumCulled=false;wake.renderOrder=3;wake.visible=false;scene.add(wake);return wake;
  });

  const start=new THREE.Vector3(.85,1.8,4.8),target=new THREE.Vector3(0,0,-21),rodButt=new THREE.Vector3(),rodTip=new THREE.Vector3(),sprayOrigin=new THREE.Vector3();
  let state={phase:'idle',castAt:0,strength:.65,aim:0,revision:0};
  const tackleStore=new TackleStateStore();
  let time=0,lastFrame=0,lastRenderedFrame=0,overlayOpen=false,landedRevision=-1,splashAt=-100,rodStrokeAt=-100,sprayPower=1,rippleIndex=0,charge=0,chargeAim=0,lastWake=0,lastStroke=0,reelPhase=0;
  let serverOffset=0,cameraProgress=0,frame,fishSamples=[],catchOrigin=null,displayedWave=null,displayedGlow=.65,displayedSwim=null,displayedLoad=0,displayedRodLoad=0,displayedFishVisibility=0,escapeStartVisibility=0,hookImpactAt=-100;
  const cameraLookTarget=new THREE.Vector3(0,-3.8,-35);
  const cameraLookDesired=new THREE.Vector3();
  const whaleCameraOffset=new THREE.Vector3(),whaleCameraDesiredOffset=new THREE.Vector3();
  const viewHeading=new THREE.Vector3(),viewSide=new THREE.Vector3();
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
    for(const ripple of ripples){
      const age=t-ripple.z;
      if(age<=0||age>=8)continue;
      const distance=Math.hypot(x-ripple.x,z-ripple.y),radius=distance-age*1.25;
      h+=Math.sin(radius*11)*Math.exp(-radius*radius*1.6)*Math.exp(-age*.55)*.08*ripple.w;
    }
    return h;
  };
  const lineSurfaceHeight=(x,z)=>waveHeight(x,z,time);
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
  const launchSplash=(x,z,power=1)=>{
    sprayOrigin.set(x,waveHeight(x,z,time),z);splashAt=time;sprayPower=power;addRipple(x,z,power);
  };
  const setState=(next,serverNow)=>{
    if(Number.isFinite(serverNow)) serverOffset=serverNow-Date.now();
    tackleStore.update(next,Number.isFinite(serverNow)?serverNow:Date.now()+serverOffset);
    const previousPhase=state.phase,changed=next.revision!==state.revision;
    if(next.phase==='escaped'&&previousPhase!=='escaped'){
      // A newly connected display may receive the escaped snapshot without
      // having rendered the bite/fight first. Keep its silhouette readable.
      escapeStartVisibility=displayedFishVisibility>.001
        ? displayedFishVisibility
        : fishVisibilityTarget('biting',1,next.fishId);
    }
    if(changed){fishSamples=[];schoolAmount=0;schoolWasVisible=false;schoolCatchOrigins=null;clusterEchoAmount=0;previousK8sSurfaceGap=null;for(const motion of schoolMotion)motion.initialized=false;for(const motion of clusterEchoMotion)motion.initialized=false;}
    if(next.fish){
      // Tackle load is sampled/interpolated at the same time as the fish pose.
      fishSamples.push({serverTime:Number.isFinite(serverNow)?serverNow:Date.now()+serverOffset,fish:copyFish(next.fish,next.tension)});
      if(fishSamples.length>16)fishSamples.shift();
    }
    state={...next};
    target.set(next.aim*7,0,-castDistanceForStrength(next.strength));
    if(['fighting','caught'].includes(next.phase)&&next.fish)target.set(next.fish.position.x,0,next.fish.position.z);
    else if(['fighting','caught'].includes(next.phase))target.set(next.aim*7+(next.fishX||0),0,-next.distance);
    if(next.phase==='fighting'&&previousPhase==='biting'&&next.hookResult==='critical'&&next.fish){
      hookImpactAt=time;
      addRipple(next.fish.position.x,next.fish.position.z,1.15);
    }
    if(next.phase==='caught'&&previousPhase!=='caught'&&next.fish){
      const fish=copyFish(next.fish),heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      const displayedModel=fightModelFor(next.fishId);
      catchOrigin={
        position:displayedModel.group.visible?displayedModel.group.position.clone():fishWorldPosition(fish),
        quaternion:displayedModel.group.visible?displayedModel.group.quaternion.clone():fishOrientation(heading),
        scale:displayedModel.group.visible?displayedModel.group.scale.x:liveFishScale(next.fishId,next.phase),
        wave:{...(displayedWave||fish.bodyWave)},swim:displayedSwim,glow:displayedGlow,load:displayedLoad,at:performance.now(),
      };
      schoolCatchOrigins=next.fishId==='fish-001'
        ? schoolFish.map(model=>model.group.visible?{
          position:model.group.position.clone(),
          quaternion:model.group.quaternion.clone(),
          scale:model.group.scale.x,
          formationOffset:model.group.position.clone().sub(catchOrigin.position),
        }:null)
        : null;
    }
    if(next.phase==='idle'&&previousPhase!=='idle'){catchOrigin=null;schoolCatchOrigins=null;}
    if(changed&&next.phase==='idle'){bobber.visible=false;thread.visible=false;}
    if(next.phase==='waiting' && landedRevision!==next.revision && Date.now()+serverOffset-next.castAt>2000) landedRevision=next.revision;
  };
  const land=()=>{
    if(landedRevision===state.revision)return;
    landedRevision=state.revision;launchSplash(target.x,target.z,1);onLand();
  };
  const setCharge=(amount,aim=0)=>{charge=amount;chargeAim=aim;};
  const aimScreen=(aim=0,strength=.65)=>{
    const projected=new THREE.Vector3(aim*7,0,-castDistanceForStrength(strength)).project(camera);
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
    const tackle=tackleStore.getState();
    const retrieving=tackle.phase==='retrieving';
    const retrieveProgress=retrieving?tackleStore.getRetrieveProgress(Date.now()+serverOffset,RETRIEVE_DURATION_MS):0;
    const retrievePresentation=retrieving?retrievePresentationAt(retrieveProgress):null;
    const escapeAge=state.phase==='escaped'?Math.max(0,Date.now()+serverOffset-state.resultAt):ESCAPE_ANIMATION_MS;
    const escapeProgress=THREE.MathUtils.clamp(escapeAge/ESCAPE_ANIMATION_MS,0,1);
    const escapeFadeProgress=state.phase==='escaped'
      ? THREE.MathUtils.clamp((escapeAge-ESCAPE_ANIMATION_MS)/ESCAPE_FADE_MS,0,1)
      : 0;
    const escapeFade=state.phase==='escaped'?1-escapeFadeProgress:0;
    const escapePresentation=state.phase==='escaped'&&escapeFadeProgress<1;
    const escaping=state.phase==='escaped'&&escapeProgress<1;
    const cameraPresentation=active||escapePresentation;
    cameraProgress=THREE.MathUtils.damp(cameraProgress,cameraPresentation?1:0,2,dt);
    const drift=reduced?0:Math.sin(time*.19)*.024;
    const surfaceLunge=state.fishId==='k8s-001'&&state.phase==='fighting'&&state.mode==='split'&&visibleFish
      ? k8sSurfaceLungeProgress(state.fightTime)
      : 0;
    const followsFish=(state.phase==='fighting'||escapePresentation)&&visibleFish;
    const whaleView=Boolean(followsFish&&state.fishId==='whale-001'&&state.phase==='fighting');
    const leviathanView=Boolean(followsFish&&state.fishId==='k8s-001'&&state.phase==='fighting');
    if(whaleView||leviathanView){
      viewHeading.set(visibleFish.heading.x,0,visibleFish.heading.z);
      if(viewHeading.lengthSq()<.0001)viewHeading.set(0,0,-1);else viewHeading.normalize();
      viewSide.set(-viewHeading.z,0,viewHeading.x);
      const sideOffset=THREE.MathUtils.lerp(leviathanView?2.0:2.45,leviathanView?1.05:1.25,portraitBlend);
      whaleCameraDesiredOffset.copy(viewSide).multiplyScalar(sideOffset).addScaledVector(viewHeading,leviathanView?-.58:-.32);
    }else whaleCameraDesiredOffset.set(0,0,0);
    whaleCameraOffset.lerp(whaleCameraDesiredOffset,1-Math.exp(-dt*(whaleView?2.25:7)));
    const normalCameraX=Math.sin(time*.13)*.016;
    const normalCameraY=3.35-cameraProgress*.18+drift-portraitBlend*1.6-surfaceLunge*.42;
    const normalCameraZ=7-cameraProgress*.6-surfaceLunge*1.15;
    const breachCameraX=visibleFish?visibleFish.position.x:normalCameraX;
    const breachCameraY=visibleFish?visibleFish.position.y+3.4:normalCameraY;
    const breachCameraZ=visibleFish?visibleFish.position.z+11.5:normalCameraZ;
    const breachCameraBlend=surfaceLunge*.92;
    camera.position.set(
      THREE.MathUtils.lerp(normalCameraX,breachCameraX,breachCameraBlend),
      THREE.MathUtils.lerp(normalCameraY,breachCameraY,breachCameraBlend),
      THREE.MathUtils.lerp(normalCameraZ,breachCameraZ,breachCameraBlend),
    );
    camera.position.add(whaleCameraOffset);
    const normalFocusBlend=state.phase==='fighting'&&(state.fishId==='whale-001'||state.fishId==='k8s-001')?.62:state.phase==='fighting'?.48:.28;
    const focusBlend=THREE.MathUtils.lerp(normalFocusBlend,1,surfaceLunge);
    const fishFocusX=followsFish?THREE.MathUtils.lerp(state.aim*.18,visibleFish.position.x,focusBlend):state.aim*.18;
    const fishFocusZ=followsFish?THREE.MathUtils.lerp(-35,visibleFish.position.z,focusBlend):-35;
    const escapeReturn=state.phase==='escaped'?escapeFadeProgress:0;
    const focusX=THREE.MathUtils.lerp(fishFocusX,state.aim*.18,escapeReturn);
    const focusZ=THREE.MathUtils.lerp(fishFocusZ,-35,escapeReturn);
    const normalFocusY=-3.8-cameraProgress*.8;
    const breachFocusY=visibleFish?visibleFish.position.y+.65:normalFocusY;
    cameraLookDesired.set(focusX,THREE.MathUtils.lerp(normalFocusY,breachFocusY,surfaceLunge),focusZ);
    cameraLookTarget.lerp(cameraLookDesired,1-Math.exp(-dt*(whaleView||leviathanView?3.35+surfaceLunge*3:7)));
    camera.lookAt(cameraLookTarget);
    camera.updateMatrixWorld();
    if(state.phase==='fighting'&&visibleFish)target.set(visibleFish.position.x,0,visibleFish.position.z);
    const castAge=(Date.now()+serverOffset-state.castAt)/1000;
    const showLiveTackle=!overlayOpen;
    bobber.visible=showLiveTackle&&active&&tackle.phase!=='fighting';thread.visible=showLiveTackle&&active;wetThread.visible=false;rodAssembly.visible=showLiveTackle&&(active||charge>0);rod.visible=rodAssembly.visible;
    bobber.scale.setScalar(state.phase==='biting'?.6:1);
    tip.material.emissive.setHex(state.criticalWindow?0x8fe8d7:0x000000);
    tip.material.emissiveIntensity=state.criticalWindow ? .65+Math.sin(time*9)*.12 : 0;
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
    }else if(retrieving){
      // Bobber travel and the reel animation share this server-timed progress.
      const p=retrievePresentation?.bobberProgress??0;
      bobber.position.lerpVectors(target,start,p);
      bobber.position.y=waveHeight(bobber.position.x,bobber.position.z,time)+retrieveProgress*1.8;
      if(Math.floor(p*20)%4===0 && time-ripples[(rippleIndex+5)%6].z>.15)addRipple(bobber.position.x,bobber.position.z,.25);
    }
    const cues=fishFightCues(visibleFish,tackle.phase==='fighting'?(visibleFish?.tension??tackle.tension):0);
    const {strain,stroke}=cues;
    // Keep game tension immediate; only the rod's rendered flex eases toward it.
    const retrieveLoad=retrievePresentation?.rodLoad??0;
    const rodFlexProfile=rodFlexProfileFor(state.fishId);
    const hookImpact=Math.exp(-Math.max(0,time-hookImpactAt)*18);
    const rodLoadTarget=THREE.MathUtils.clamp((tackle.phase==='fighting'?strain+surfaceLunge*.26:retrieveLoad)+hookImpact*.075,0,1);
    const rodResponse=rodLoadTarget>displayedRodLoad?rodFlexProfile.loadingResponse:rodFlexProfile.recoveryResponse;
    displayedRodLoad=smoothRodLoad(displayedRodLoad,rodLoadTarget,dt,rodResponse);
    const rodStrokeAge=time-rodStrokeAt;
    const rodStrokeImpulse=rodStrokeAge>=0&&rodStrokeAge<.72?Math.exp(-rodStrokeAge*6.5)*Math.sin(rodStrokeAge*17):0;
    const lateralPull=THREE.MathUtils.clamp(visibleFish?.position.x||0,-3,3)*.055*cues.load;
    const rodHorizontalScale=Math.min(1,camera.aspect/.85);
    // Screen-anchored endpoints keep the blank visible instead of cropping the
    // reel at the bottom edge, including on portrait displays and fight-camera moves.
    placeRodOnScreen(.78,-.80,4.8,rodButt);
    placeRodOnScreen(.20,-.15,5.75,rodTip);
    // The rod follows the cast aim and the fish's physical pull. There is no
    // separate direction control: the player only decides when to reel.
    rodTip.x+=(chargeAim*.4+lateralPull+cues.rodSide)*rodHorizontalScale;
    if(tackle.phase==='fighting'&&visibleFish){
      // Approximate the hook point from the authoritative fish pose before
      // the model is updated below. The line itself is still built from the
      // exact displayed mouth position later in this frame.
      const heading=new THREE.Vector3(visibleFish.heading.x,visibleFish.heading.y,visibleFish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      const fishScale=liveFishScale(state.fishId,'fighting');
      fishMouthLocal(state.fishId,rodFishTarget)
        .applyQuaternion(fishOrientation(heading)).multiplyScalar(fishScale).add(fishWorldPosition(visibleFish));
      rodLineDirection.subVectors(rodFishTarget,rodTip);
      if(rodLineDirection.lengthSq()>.0001){
        rodLineDirection.normalize();
        rodTip.x+=rodLineDirection.x*displayedRodLoad*rodFlexProfile.directionInfluence*rodHorizontalScale;
        rodTip.y+=rodLineDirection.y*displayedRodLoad*rodFlexProfile.verticalInfluence;
      }
    }
    // During retrieval the angler lifts the tip slightly while the line comes
    // home. The lift eases out with the same progress as the bobber and reel.
    const retrieveLift=retrievePresentation?.rodLift??0;
    rodTip.y+=charge*1.1-fling*.5-displayedRodLoad*.43+retrieveLift+rodStrokeImpulse*.58;
    rodTip.z+=charge*.6+rodStrokeImpulse*.22;
    if(rod.visible){
      const positions=rodGeometry.attributes.position.array,sheenPositions=rodSheenGeometry.attributes.position.array;
      const blankLoad=THREE.MathUtils.clamp(fling*.62+displayedRodLoad*1.35+charge*.12+Math.abs(rodStrokeImpulse)*.8,0,1.65);
      for(let i=0;i<rodPointCount;i++){
        const p=i/(rodPointCount-1);
        // One centerline drives the blank, guides, reel seat and line entry.
        // The curvature is continuous through the tip instead of returning to
        // zero at the last segment like the former downward-hump model.
        const center=rodCenterAt(
          p,
          rodButt,
          rodTip,
          tackle.phase==='fighting'&&visibleFish?rodLineDirection:null,
          blankLoad,
          rodFlexProfile,
        );
        center.x+=lateralPull*p*p*.35*rodHorizontalScale;
        rodCenters[i].set(center.x,center.y,center.z);
      }
      for(let i=0;i<rodPointCount;i++){
        const p=i/(rodPointCount-1),previous=rodCenters[Math.max(0,i-1)],next=rodCenters[Math.min(rodPointCount-1,i+1)],center=rodCenters[i];
        rodTangent.subVectors(next,previous).normalize();rodView.subVectors(camera.position,center);
        rodNormal.crossVectors(rodTangent,rodView);
        if(rodNormal.lengthSq()<.0001)rodNormal.set(0,1,0);else rodNormal.normalize();
        rodBinormal.crossVectors(rodTangent,rodNormal).normalize();
        const taper=blankRadiusAt(p);
        const radius=taper*(1+displayedRodLoad*(.08-.035*p));
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
        const wrapRadius=blankRadiusAt(entry.fraction);entry.offset=entry.radius+wrapRadius;
        entry.ring.position.y=entry.offset;entry.insert.position.y=entry.offset;
        entry.foot.position.y=wrapRadius+entry.radius;entry.foot.scale.y=entry.radius*2/.065;
        entry.wrap.scale.set(wrapRadius/.03,wrapRadius/.03,1);
        entry.linePoint.copy(rodGuidePoint).addScaledVector(rodGuideDown,entry.offset);
      }
      // The line must leave the center of the tip-top ring, not a separate
      // pre-bend estimate. This keeps blank, guide and line connected while
      // casting and while the fish is loading the rod sideways.
      const tipGuide=guideEntries[guideEntries.length-1];rodLineAnchor.copy(tipGuide.linePoint);

      // A short rear grip, exposed reel seat, foregrip and ferrule make the
      // two-piece shore rod read as one manufactured object, not stacked props.
      poseRodSegment(buttCap,0,.018,.72);
      poseRodSegment(backGrip,.025,.13,.72);
      poseRodSegment(rearHood,.126,.139,.72);
      poseRodSegment(reelSeat,.139,.225,.72);
      poseRodSegment(frontHood,.222,.235,.72);
      poseRodSegment(foreGrip,.235,.27,.72);
      poseRodSegment(ferrule,.574,.586,.72);
      poseRodSegment(ferruleBand,.568,.574,.72);
      const reelIndex=Math.floor(.16*(rodPointCount-1));reelPoint.copy(rodCenters[reelIndex]);reelTangent.subVectors(rodCenters[reelIndex+1],rodCenters[reelIndex]).normalize();reelDown.copy(rodAxisDown).projectOnPlane(reelTangent);if(reelDown.lengthSq()<.0001)reelDown.set(0,-1,0);else reelDown.normalize();reelSide.crossVectors(reelDown,reelTangent).normalize();rodGuideMatrix.makeBasis(reelSide,reelDown,reelTangent);reelGroup.position.copy(reelPoint);reelGroup.quaternion.setFromRotationMatrix(rodGuideMatrix);
      // A spinning reel's spool faces the rod tip (local +Z); the rotor/bail
      // turns around that axis while the fixed spool reciprocates slightly.
      if(!retrievePresentation){
        const reelSpeed=tackle.reeling?(state.fishId==='whale-001'?4.8:state.fishId==='k8s-001'?5.6:8):.15;
        reelPhase+=reelSpeed*dt;
      }
      const retrievePhase=retrievePresentation?.reelPhase??reelPhase;
      reelRotorGroup.rotation.z=retrievePhase;reelHandleGroup.rotation.x=retrievePhase;spoolGroup.position.z=.055+Math.sin(retrievePhase)*.004;
      reelLineExit.set(0,.105,.098+Math.sin(retrievePhase)*.004).applyQuaternion(reelGroup.quaternion).add(reelGroup.position);
      const guideLinePositions=rodGuideLineGeometry.attributes.position.array;
      guideLinePositions[0]=reelLineExit.x;guideLinePositions[1]=reelLineExit.y;guideLinePositions[2]=reelLineExit.z;
      for(let i=0;i<guideEntries.length;i++){const point=guideEntries[i].linePoint,offset=(i+1)*3;guideLinePositions[offset]=point.x;guideLinePositions[offset+1]=point.y;guideLinePositions[offset+2]=point.z;}
      rodGuideLineGeometry.attributes.position.needsUpdate=true;
    }
    if(thread.visible&&tackle.phase!=='fighting'){
      const castSag=state.phase==='casting'?.035+(1-fling)*.07:.2;
      const lineSag=retrievePresentation?.lineSag??castSag;
      const lineSplit=updateFishingLineBuffers(rodLineAnchor,bobber.position,dryLineBuffer,wetLineBuffer,lineSurfaceHeight,lineSag,.025,displayedRodLoad);
      threadGeometry.attributes.position.needsUpdate=true;threadGeometry.attributes.color.needsUpdate=true;
      wetThreadGeometry.attributes.position.needsUpdate=true;wetThreadGeometry.attributes.color.needsUpdate=true;
      thread.visible=lineSplit.airVisible;wetThread.visible=lineSplit.waterVisible;
      thread.material.color.set(0xcbd6d1);thread.material.opacity=retrievePresentation?.lineOpacity??.82;
      wetThread.material.color.set(0x83a7a1);wetThread.material.opacity=retrievePresentation?.lineOpacity??.72;
    }
    const shadowApproach=state.phase==='waiting'&&(state.approach||0)>.015;
    const fishInWater=showLiveTackle&&(shadowApproach||state.phase==='biting'||state.phase==='fighting'||escapePresentation);
    const fishShowing=fishInWater||(showLiveTackle&&state.phase==='caught');
    const k8sPresentation=state.fishId==='k8s-001'
      ? k8sFightPresentation(state.phase,state.distance,state.mode,surfaceLunge)
      : null;
    const targetFishVisibility=state.fishId==='k8s-001'&&state.phase==='fighting'
      ? k8sPresentation.bodyVisibility
      : fishVisibilityTarget(state.phase,state.approach||0,state.fishId);
    const visibilityDamping=state.phase==='waiting'?5:state.phase==='biting'?4.5:9;
    if(state.phase!=='escaped')displayedFishVisibility=THREE.MathUtils.damp(displayedFishVisibility,targetFishVisibility,visibilityDamping,dt);
    const renderedFishVisibility=state.phase==='escaped'
      ? escapeFishVisibility(escapeStartVisibility,escapeFade)
      : displayedFishVisibility;
    const activeFightFish=fightModelFor(state.fishId);
    fightFish.group.visible=activeFightFish===fightFish&&fishShowing&&Boolean(visibleFish);
    dockerWhale.group.visible=activeFightFish===dockerWhale&&fishShowing&&Boolean(visibleFish);
    cssFish.group.visible=activeFightFish===cssFish&&fishShowing&&Boolean(visibleFish);
    if(clusterFish)clusterFish.group.visible=activeFightFish===clusterFish&&fishShowing&&Boolean(visibleFish);
    if (state.fishId === 'css-001') {
      cssFish.setVisualState(resolveCssFishVisualState({phase:tackle.phase,mode:tackle.mode,tension:tackle.tension,fish:visibleFish}));
    }
    let caughtEase=0;
    if(activeFightFish.group.visible){
      const fish=visibleFish;
      const heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      const swimQuaternion=fishOrientation(heading).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1,0,0),(fish.swim?.turn||0)*.12));
      if(state.phase==='caught'){
        const age=catchOrigin?Math.max(0,(now-catchOrigin.at)/1000):Math.max(0,(Date.now()+serverOffset-state.resultAt)/1000),p=THREE.MathUtils.clamp(age/1.2,0,1),ease=1-Math.pow(1-p,3);
        caughtEase=ease;
        const depth=camera.aspect<.85?8.8*.85/camera.aspect:8.8;
        const final=new THREE.Vector3(camera.aspect<.85?-.95:camera.aspect*depth*.425*.24-.95,.15,-depth).applyMatrix4(camera.matrixWorld);
        const start=catchOrigin?.position||fishWorldPosition(fish);
        const startQuaternion=catchOrigin?.quaternion||swimQuaternion;
        const finalQuaternion=camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-.16));
        activeFightFish.group.position.lerpVectors(start,final,ease);
        activeFightFish.group.position.y+=Math.sin(p*Math.PI)*(state.fishId==='whale-001'?1.35:2);
        activeFightFish.group.quaternion.slerpQuaternions(startQuaternion,finalQuaternion,ease);
        const catchScale=catchFishScale(state.fishId);
        activeFightFish.group.scale.setScalar(THREE.MathUtils.lerp(catchOrigin?.scale||liveFishScale(state.fishId,state.phase),catchScale,ease));
        const wave=catchOrigin?.wave||fish.bodyWave,elapsed=age;
        activeFightFish.update(time,{power:THREE.MathUtils.lerp(wave.amplitude/.3,.15,ease),glow:THREE.MathUtils.lerp(catchOrigin?.glow??.65,1,ease),bodyPhase:wave.phase+elapsed*wave.frequency*Math.PI*2,bodyFrequency:wave.frequency,bodyWavelength:wave.wavelength,amplitude:THREE.MathUtils.lerp(wave.amplitude,0.03,ease),turn:(catchOrigin?.swim?.turn||0)*(1-ease),effort:THREE.MathUtils.lerp(catchOrigin?.swim?.effort||.2,.15,ease),tetherLoad:(catchOrigin?.load||0)*(1-ease),visibility:renderedFishVisibility,styleDelta:dt});
      }else{
        // Go's warning is the readable attack telegraph. Keep it species
        // specific so Docker's steady warning and CSS fish's catch finale do
        // not inherit a stronger glow by accident.
        const urgent=state.mode==='surge'||state.mode==='split'||(state.mode==='warning'&&state.fishId==='fish-001');
        activeFightFish.group.position.copy(fishWorldPosition(fish));
        if(surfaceLunge>0){
          const noseUp=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-1.22*surfaceLunge);
          const thrashRoll=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.sin(fish.bodyWave.phase)*.14*surfaceLunge);
          swimQuaternion.multiply(noseUp).multiply(thrashRoll);
        }
        activeFightFish.group.quaternion.slerp(swimQuaternion,1-Math.exp(-dt*(12+surfaceLunge*5)));
        activeFightFish.group.scale.setScalar(liveFishScale(state.fishId,state.phase));
        const approaching=state.phase==='waiting'||state.phase==='biting';
        const biteReveal=THREE.MathUtils.clamp(((state.approach||0)-WAIT_APPROACH_FRACTION)/(1-WAIT_APPROACH_FRACTION),0,1);
        displayedWave={...fish.bodyWave};displayedGlow=approaching?THREE.MathUtils.lerp(.04,.65,state.phase==='waiting'?0:biteReveal):escapePresentation?.8:urgent?.8:.65;displayedSwim=fish.swim?{...fish.swim}:null;displayedLoad=cues.load;
        activeFightFish.update(time,{power:THREE.MathUtils.clamp(fish.bodyWave.amplitude/.3,0,1),glow:state.fishId==='whale-001'?displayedGlow*.72:displayedGlow,bodyPhase:fish.bodyWave.phase,bodyFrequency:fish.bodyWave.frequency,bodyWavelength:fish.bodyWave.wavelength,amplitude:fish.bodyWave.amplitude,turn:fish.swim?.turn||0,effort:escapePresentation?1:fish.swim?.effort||.2,tetherLoad:cues.load,visibility:renderedFishVisibility,styleDelta:dt});
      }
    }
    if(state.fishId==='k8s-001'&&state.phase==='fighting'&&activeFightFish.group.visible&&visibleFish){
      const position=activeFightFish.group.position,gap=position.y-waveHeight(position.x,position.z,time),threshold=-.18;
      if(previousK8sSurfaceGap!==null&&time-lastK8sBreachAt>.22){
        const brokeSurface=surfaceLunge>.34&&previousK8sSurfaceGap<threshold&&gap>=threshold;
        const reentered=previousK8sSurfaceGap>=threshold&&gap<threshold;
        if(brokeSurface||reentered){launchSplash(position.x,position.z,reentered?2.65:2.2);lastK8sBreachAt=time;}
      }
      previousK8sSurfaceGap=gap;
    }else if(state.fishId!=='k8s-001'||state.phase!=='fighting')previousK8sSurfaceGap=null;
    if(state.phase==='fighting'&&activeFightFish.group.visible){
      activeFightFish.group.updateMatrixWorld(true);
      if(state.fishId==='whale-001'){
        mouthSideRotation.copy(activeFightFish.group.quaternion).invert();
        mouthSideDirection.subVectors(camera.position,activeFightFish.group.position).applyQuaternion(mouthSideRotation);
        dockerHookSide=mouthSideDirection.z>=0?1:-1;
      }
      fishMouthLocal(state.fishId,mouth,dockerHookSide).applyMatrix4(activeFightFish.group.matrixWorld);
      lineProjectionCenter.copy(activeFightFish.group.position);
      lineProjectionEye.copy(camera.position);
      const renderedLineLoad=THREE.MathUtils.clamp((cues.load+displayedRodLoad)*.5,0,1);
      const {airSag,wetSag}=lineSagForLoad(renderedLineLoad);
      const lineSplit=updateFishingLineBuffers(rodLineAnchor,mouth,dryLineBuffer,wetLineBuffer,lineSurfaceHeight,airSag,wetSag,renderedLineLoad,projectSubmergedLinePoint);
      threadGeometry.attributes.position.needsUpdate=true;threadGeometry.attributes.color.needsUpdate=true;
      wetThreadGeometry.attributes.position.needsUpdate=true;wetThreadGeometry.attributes.color.needsUpdate=true;
      thread.visible=lineSplit.airVisible;wetThread.visible=lineSplit.waterVisible;
      thread.material.color.set(0xcbd6d1);thread.material.opacity=Math.min(.98,cues.lineOpacity+surfaceLunge*.16);
      wetThread.material.color.set(0x83a7a1);wetThread.material.opacity=Math.min(.9,(cues.lineOpacity+surfaceLunge*.16)*.82);
      if(lineSplit.waterFraction!==null){
        lineEntry.lerpVectors(rodLineAnchor,mouth,lineSplit.waterFraction);
        lineEntry.y=waveHeight(lineEntry.x,lineEntry.z,time);
        if(stroke>.85&&lastStroke<=.85&&cues.load>.15&&time-lastWake>.32){
          const ripplePower=cues.ripplePower*(state.fishId==='k8s-001'?1+k8sPresentation.wakeGain*2.1:1);
          addRipple(lineEntry.x,lineEntry.z,ripplePower);lastWake=time;
        }
      }
    }else if(state.phase==='fighting'){
      thread.visible=false;wetThread.visible=false;
    }
    lastStroke=state.phase==='fighting'&&activeFightFish.group.visible?stroke:0;
    const schoolRequested=showLiveTackle&&state.phase==='fighting'&&state.fishId==='fish-001'&&state.school===7&&Boolean(visibleFish);
    const schoolCatchActive=showLiveTackle&&state.phase==='caught'&&state.fishId==='fish-001'&&Boolean(visibleFish)&&Boolean(schoolCatchOrigins?.some(Boolean));
    const schoolPresentationActive=schoolRequested||schoolCatchActive;
    schoolAmount=THREE.MathUtils.damp(schoolAmount,schoolPresentationActive?1:0,schoolPresentationActive?4:6,dt);
    const schoolVisible=(schoolPresentationActive||schoolAmount>.02)&&(fishInWater||schoolCatchActive)&&Boolean(visibleFish);
    if(!schoolVisible&&schoolWasVisible)for(const motion of schoolMotion)motion.initialized=false;
    schoolWasVisible=schoolVisible;
    const neighbors=schoolVisible?schoolMotion.map(motion=>motion.initialized?motion.position.clone():null):[];
    for(let index=0;index<schoolFish.length;index++){
      const model=schoolFish[index],motion=schoolMotion[index];model.group.visible=schoolVisible;if(!schoolVisible)continue;
      if(schoolCatchActive){
        const origin=schoolCatchOrigins[index];
        model.group.visible=Boolean(origin);
        if(!origin)continue;
        const rotationDelta=activeFightFish.group.quaternion.clone().multiply(catchOrigin.quaternion.clone().invert());
        model.group.position.copy(activeFightFish.group.position).add(origin.formationOffset.clone().applyQuaternion(rotationDelta).multiplyScalar(schoolCatchFormationScale(caughtEase)));
        model.group.quaternion.slerpQuaternions(origin.quaternion,activeFightFish.group.quaternion,caughtEase);
        model.group.scale.setScalar(origin.scale);
        const fish=visibleFish,phase=fish.bodyWave.phase+index*.87;
        model.update(time,{power:THREE.MathUtils.lerp(THREE.MathUtils.clamp(fish.bodyWave.amplitude/.3,0,1),.15,caughtEase),glow:.55,bodyPhase:phase,bodyFrequency:fish.bodyWave.frequency,bodyWavelength:fish.bodyWave.wavelength,turn:(fish.swim?.turn||0)*(1-caughtEase),effort:THREE.MathUtils.lerp(fish.swim?.effort||.2,.15,caughtEase),visibility:schoolAmount});
        continue;
      }
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
    const clusterEchoRequested=showLiveTackle&&state.phase==='fighting'&&state.fishId==='k8s-001'&&Boolean(visibleFish);
    const clusterEchoTarget=clusterEchoRequested?k8sPresentation.echoVisibility:0;
    if(clusterEchoRequested)ensureClusterEchoes();
    clusterEchoAmount=THREE.MathUtils.damp(clusterEchoAmount,clusterEchoTarget,clusterEchoTarget>clusterEchoAmount?1.8:state.phase==='caught'?12:4.5,dt);
    const clusterEchoVisible=clusterEchoAmount>.015&&fishInWater&&Boolean(visibleFish);
    for(let index=0;index<clusterEchoes.length;index++){
      const model=clusterEchoes[index],motion=clusterEchoMotion[index];
      model.group.visible=clusterEchoVisible;
      if(!clusterEchoVisible){if(clusterEchoAmount<=.02)motion.initialized=false;continue;}
      const fish=visibleFish;
      const echoCenter=new THREE.Vector3(fish.position.x,fish.position.y,fish.position.z);
      const heading=new THREE.Vector3(fish.heading.x,fish.heading.y,fish.heading.z);
      if(heading.lengthSq()<.0001)heading.set(-1,0,0);else heading.normalize();
      const side=new THREE.Vector3(-heading.z,0,heading.x);
      if(side.lengthSq()<.0001)side.set(0,0,1);else side.normalize();
      const formationTighten=k8sPresentation?.echoSpread??1;
      const offset=clusterEchoOffsets[index];
      const desired=echoCenter.clone()
        .addScaledVector(side,offset.x*formationTighten)
        .addScaledVector(heading,offset.z*formationTighten);
      desired.y+=offset.y;
      if(!motion.initialized){motion.position.copy(desired);motion.velocity.set(0,0,0);motion.initialized=true;}
      else{
        const previous=motion.position.clone();motion.position.lerp(desired,1-Math.exp(-dt*(3.5+fish.speed*.28)));
        motion.velocity.subVectors(motion.position,previous).multiplyScalar(1/Math.max(dt,.001));
      }
      const propulsion=fish.swim?.velocity||fish.velocity;
      const echoHeading=new THREE.Vector3(propulsion.x+(motion.velocity.x-fish.velocity.x)*.16,propulsion.y,propulsion.z);
      if(echoHeading.lengthSq()<.0001)echoHeading.copy(heading);else echoHeading.normalize();
      model.group.position.copy(motion.position);
      model.group.quaternion.slerp(fishOrientation(echoHeading),1-Math.exp(-dt*7));
      model.group.scale.setScalar(Math.max(.2,clusterFish.group.scale.x*.36));
      model.update(time,{power:THREE.MathUtils.clamp(fish.bodyWave.amplitude/.3,0,1),glow:.24,bodyPhase:fish.bodyWave.phase+index*1.18,bodyFrequency:fish.bodyWave.frequency,bodyWavelength:fish.bodyWave.wavelength,turn:(fish.swim?.turn||0)*.7,effort:fish.swim?.effort||.2,visibility:.82*clusterEchoAmount});
    }
    wakes.forEach((wake,index)=>{
      const model=index?schoolFish[index-1]:activeFightFish,position=model.group.position;
      const surface=waveHeight(position.x,position.z,time);
      const k8sSurfaceFin=state.fishId==='k8s-001'&&index===0?model.group.scale.y*1.18:0;
      const shallow=THREE.MathUtils.clamp(1-(surface-position.y-k8sSurfaceFin)/.85,0,1);
      wake.visible=fishInWater&&model.group.visible&&shallow>.02;if(!wake.visible)return;
      const heading=new THREE.Vector3(-1,0,0).applyQuaternion(model.group.quaternion);heading.y=0;heading.normalize();
      const positions=wake.geometry.attributes.position.array;
      const wakeLength=state.fishId==='k8s-001'&&index===0?2.6+(state.mode==='split'?2.8:state.mode==='surge'?1.6:0):1.9;
      for(let i=0;i<27;i++){const p=i/26,x=position.x-heading.x*p*wakeLength,z=position.z-heading.z*p*wakeLength;positions[i*3]=x;positions[i*3+1]=waveHeight(x,z,time)+.018;positions[i*3+2]=z;}
      wake.geometry.attributes.position.needsUpdate=true;
      if(state.fishId==='k8s-001'&&index===0)wake.material.color.set(0xc1e9e4);
      const wakeOpacity=state.fishId==='k8s-001'&&index===0 ? .28+(k8sPresentation?.wakeGain??0)*.3 : .12;
      wake.material.opacity=shallow*wakeOpacity*(state.phase==='escaped'?escapeFade:1);
    });
    const heavyWakeVisible=state.fishId==='whale-001'&&fishInWater&&dockerWhale.group.visible&&Boolean(visibleFish)&&state.phase!=='caught';
    if(heavyWakeVisible){
      const whaleHeading=new THREE.Vector3(-1,0,0).applyQuaternion(dockerWhale.group.quaternion).normalize();
      whaleHeading.y=0;if(whaleHeading.lengthSq()<.0001)whaleHeading.set(0,0,-1);else whaleHeading.normalize();
      const whaleSide=new THREE.Vector3(-whaleHeading.z,0,whaleHeading.x).normalize();
      const effort=THREE.MathUtils.clamp(visibleFish.swim?.effort??.4,0,1);
      const whaleStroke=Math.max(0,Math.sin((visibleFish.bodyWave?.phase??time)+.35));
      const trailLength=1.45+effort*2.35+whaleStroke*.35;
      const spread=.16+Math.abs(visibleFish.swim?.turn??0)*.48;
      for(let index=0;index<whaleWakes.length;index++){
        const branch=index===0?0:index===1?-1:1,wake=whaleWakes[index],positions=wake.geometry.attributes.position.array;
        for(let i=0;i<27;i++){
          const p=i/26;
          const point=dockerWhale.group.position.clone().addScaledVector(whaleHeading,-.62-trailLength*p);
          point.addScaledVector(whaleSide,branch*(.08+spread*p));
          point.y+=.08+Math.sin((visibleFish.bodyWave?.phase??time)-p*3.6)*.028-p*.025;
          positions[i*3]=point.x;positions[i*3+1]=point.y;positions[i*3+2]=point.z;
        }
        wake.geometry.attributes.position.needsUpdate=true;
        wake.visible=true;
        wake.material.opacity=(index?.055:.085)+effort*.045+whaleStroke*.025;
        if(state.phase==='escaped')wake.material.opacity*=escapeFade;
      }
    }else for(const wake of whaleWakes)wake.visible=false;
    const age=time-splashAt,sprayLife=.85+Math.max(0,sprayPower-1)*.2,sprayImpulse=1+Math.max(0,sprayPower-1)*.5;spray.visible=age>=0&&age<sprayLife;
    if(spray.visible){
      for(let i=0;i<36;i++){const v=dropSpeeds[i];drops[i*3]=sprayOrigin.x+v.x*age*sprayImpulse;drops[i*3+1]=sprayOrigin.y+Math.max(0,v.y*sprayImpulse*age-2.9*age*age);drops[i*3+2]=sprayOrigin.z+v.z*age*sprayImpulse;}
      dropletGeo.attributes.position.needsUpdate=true;spray.material.size=.045+Math.max(0,sprayPower-1)*.012;spray.material.opacity=Math.max(0,1-age/sprayLife);
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
    return {setState,setCharge,rodStroke(){rodStrokeAt=time;},aimScreen,setOverlayOpen(open){overlayOpen=open;},get diagnostics(){return {phase:state.phase,revision:state.revision,landedRevision,rendered:mount.dataset.ready==='true',drawCalls:renderer.info.render.calls,cameraY:camera.position.y};},dispose(){cancelAnimationFrame(frame);observer.disconnect();fightFish.dispose();dockerWhale.dispose();cssFish.dispose();clusterFish?.dispose();for(const model of clusterEchoes)model.dispose();for(const model of schoolFish)model.dispose();waterBackdrop.dispose();waterCopy.dispose();for(const root of [scene,backgroundScene])root.traverse(obj=>{obj.geometry?.dispose();if(obj.material)for(const mat of Array.isArray(obj.material)?mat:[obj.material])mat.dispose();});renderer.dispose();renderer.domElement.remove();}};
}
